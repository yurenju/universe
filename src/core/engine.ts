import * as THREE from 'three';
import { ANCHOR_PATHS, anchorBlend } from './anchors';
import { SimClock } from './clock';
import {
  CLOSE_UP_RANGES,
  CloseUpTransition,
  closeUpSMax,
  closeUpSMin,
  type CloseUpId,
} from './closeUp';
import type { CloseUpScene, FrameContext, Marker, ScaleLevel, ViewScene } from './level';
import { HOME_S, S_MAX, S_MIN, clamp, dominantLevel, levelWeights, solidBand, type LevelId } from './scale';

interface Focus {
  levelIndex: number;
  marker: Marker;
  blend: number;
  active: boolean;
}

export interface LevelView {
  level: ViewScene;
  /** Index into `levels`, or −1 for the Close-up. */
  index: number;
  weight: number;
  camera: THREE.PerspectiveCamera;
  /** The scale this view's camera is at. */
  s: number;
}

/** Orbit-camera state: distance 10^s from the target, plus angles. */
class CameraState {
  constructor(
    public s: number,
    public yaw = -0.6,
    public pitch = 0.42,
  ) {
    this.sGoal = s;
    this.yawGoal = yaw;
    this.pitchGoal = pitch;
  }
  sGoal: number;
  yawGoal: number;
  pitchGoal: number;

  set(s: number, yaw: number, pitch: number): void {
    this.s = this.sGoal = s;
    this.yaw = this.yawGoal = yaw;
    this.pitch = this.pitchGoal = pitch;
  }

  step(dt: number, sMin: number, sMax: number): void {
    this.sGoal = clamp(this.sGoal, sMin, sMax);
    const ds = (this.sGoal - this.s) * (1 - Math.exp(-dt * 5));
    this.s += clamp(ds, -MAX_ZOOM_SPEED * dt, MAX_ZOOM_SPEED * dt);
    const k = 1 - Math.exp(-dt * 8);
    this.yaw += (this.yawGoal - this.yaw) * k;
    this.pitch += (this.pitchGoal - this.pitch) * k;
  }

  direction(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      Math.cos(this.pitch) * Math.sin(this.yaw),
      Math.sin(this.pitch),
      Math.cos(this.pitch) * Math.cos(this.yaw),
    );
  }
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const MAX_ZOOM_SPEED = 4.5; // dex per second while flying
const FOV = 50;

const compositeVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const compositeFragment = /* glsl */ `
uniform sampler2D tA;
uniform sampler2D tB;
uniform float wA;
uniform float wB;
varying vec2 vUv;
vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec3 a = toSRGB(texture2D(tA, vUv).rgb);
  vec3 b = toSRGB(texture2D(tB, vUv).rgb);
  gl_FragColor = vec4(a * wA + b * wB, 1.0);
}
`;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly clock = new SimClock();
  readonly levels: ScaleLevel[];
  readonly cameras: THREE.PerspectiveCamera[];

  s: number;
  sGoal: number;
  yaw = -0.6;
  pitch = 0.42;
  yawGoal = -0.6;
  pitchGoal = 0.42;
  magnify = false;
  focus: Focus | null = null;

  views: LevelView[] = [];
  dominant = 0;

  onDominantChange: (index: number) => void = () => {};
  onFocusChange: (marker: Marker | null, level: ViewScene | null) => void = () => {};
  /** Fired when input starts or stops driving a Close-up (null = back on the scale axis). */
  onCloseUpChange: (id: CloseUpId | null) => void = () => {};

  readonly closeUps: Record<CloseUpId, CloseUpScene>;
  readonly transition = new CloseUpTransition();
  private cu = new CameraState(0);
  private cuCamera = new THREE.PerspectiveCamera(FOV, 1, 1e-3, 1e7);
  private cuLoad = new Map<CloseUpId, LoadState>();
  /** Main-axis scale to return to after leaving a Close-up. */
  private returnS: number | null = null;
  private shownCloseUp: CloseUpId | null = null;
  onFrame: () => void = () => {};
  onLoadingChange: (loading: boolean) => void = () => {};

  private loadStates: LoadState[];
  private targets: THREE.WebGLRenderTarget[];
  private compositeScene = new THREE.Scene();
  private compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private compositeMaterial: THREE.ShaderMaterial;
  private lastTime = performance.now();
  private elapsed = 0;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, levels: ScaleLevel[], closeUps: CloseUpScene[], initial: LevelId) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.levels = levels;
    this.closeUps = Object.fromEntries(closeUps.map((c) => [c.id, c])) as Record<CloseUpId, CloseUpScene>;
    this.cameras = levels.map(() => new THREE.PerspectiveCamera(FOV, 1, 1e-3, 1e7));
    this.loadStates = levels.map(() => 'idle');
    this.s = this.sGoal = HOME_S[initial];
    this.dominant = dominantLevel(this.s);

    this.targets = [0, 1].map(
      () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true }),
    );
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tA: { value: this.targets[0].texture },
        tB: { value: this.targets[1].texture },
        wA: { value: 1 },
        wB: { value: 0 },
      },
      vertexShader: compositeVertex,
      fragmentShader: compositeFragment,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial);
    quad.frustumCulled = false;
    this.compositeScene.add(quad);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    for (const t of this.targets) t.setSize(size.x, size.y);
    // portrait screens get a wider vertical field so the horizontal view isn't cramped
    const fov = w / h < 0.8 ? 72 : FOV;
    for (const c of [...this.cameras, this.cuCamera]) {
      c.aspect = w / h;
      c.fov = fov;
      c.updateProjectionMatrix();
    }
    this.applyViewShift();
  }

  /**
   * Move the centre of projection `px` CSS pixels up, so the view's centre sits in
   * the middle of what a bottom sheet leaves uncovered. Zoom and field of view
   * stay the same; only the picture slides.
   */
  setViewShift(px: number): void {
    if (px === this.viewShift) return;
    this.viewShift = px;
    this.applyViewShift();
  }

  private viewShift = 0;

  private applyViewShift(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const c of [...this.cameras, this.cuCamera]) {
      if (this.viewShift) c.setViewOffset(w, h, 0, this.viewShift, w, h);
      else c.clearViewOffset();
    }
  }

  start(): void {
    const loop = () => {
      this.frame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Fly to a level's home scale. */
  goToLevel(id: LevelId): void {
    this.releaseFocus();
    this.sGoal = HOME_S[id];
  }

  /** Jump without animation (used on page load). */
  jumpToLevel(id: LevelId): void {
    this.focus = null;
    this.s = this.sGoal = HOME_S[id];
  }

  zoomBy(deltaDex: number): void {
    const id = this.activeCloseUp();
    if (id) {
      this.cu.sGoal = clamp(this.cu.sGoal + deltaDex, closeUpSMin(id, this.magnify), closeUpSMax(id));
      return;
    }
    this.sGoal = clamp(this.sGoal + deltaDex, this.sMin(), S_MAX);
  }

  rotateBy(dYaw: number, dPitch: number): void {
    if (this.activeCloseUp()) {
      this.cu.yawGoal += dYaw;
      this.cu.pitchGoal = clamp(this.cu.pitchGoal + dPitch, -1.45, 1.45);
      return;
    }
    this.yawGoal += dYaw;
    this.pitchGoal = clamp(this.pitchGoal + dPitch, -1.45, 1.45);
  }

  /** The Close-up input currently drives, if any. */
  activeCloseUp(): CloseUpId | null {
    return this.transition.controlsCloseUp ? this.transition.id : null;
  }

  /** Scale of the camera the viewer is controlling. */
  currentS(): number {
    return this.activeCloseUp() ? this.cu.s : this.s;
  }

  /**
   * Enter a Close-up. From a marker the main view first flies toward it;
   * `immediate` (page load) skips straight in.
   */
  enterCloseUp(id: CloseUpId, from?: { levelIndex: number; marker: Marker }, immediate = false): void {
    const t = this.transition;
    const fresh = t.phase === 'idle';
    if (!t.enter(id, immediate)) return;
    this.ensureCloseUpLoaded(id);
    if (fresh) {
      const scene = this.closeUps[id];
      this.cu.set(CLOSE_UP_RANGES[id].homeS, scene.defaultView.yaw, scene.defaultView.pitch);
      if (immediate) {
        this.jumpToLevel(CLOSE_UP_RANGES[id].returnLevel);
        this.returnS = this.s;
      } else {
        this.returnS = this.s;
        if (from) {
          // fly toward the marker without leaving the level's solid band
          this.focus = { levelIndex: from.levelIndex, marker: from.marker, blend: this.focus?.blend ?? 0, active: true };
          const lo = solidBand(from.levelIndex)[0] + 0.05;
          this.sGoal = Math.max(lo, this.s - 0.5);
        }
      }
    }
    this.syncCloseUp();
  }

  exitCloseUp(): void {
    this.transition.exit();
    if (this.transition.phase === 'idle') this.returnHome();
    this.syncCloseUp();
  }

  private returnHome(): void {
    this.releaseFocus();
    if (this.returnS !== null) this.sGoal = this.returnS;
    this.returnS = null;
  }

  private syncCloseUp(): void {
    const id = this.activeCloseUp();
    if (id !== this.shownCloseUp) {
      this.shownCloseUp = id;
      this.onCloseUpChange(id);
    }
  }

  private ensureCloseUpLoaded(id: CloseUpId): void {
    if (this.cuLoad.get(id)) return;
    this.cuLoad.set(id, 'loading');
    this.onLoadingChange(true);
    this.closeUps[id]
      .load()
      .then(() => this.cuLoad.set(id, 'ready'))
      .catch((err) => {
        console.error(`Failed to load close-up ${id}`, err);
        this.cuLoad.set(id, 'error');
      })
      .finally(() => this.onLoadingChange([...this.loadStates, ...this.cuLoad.values()].some((st) => st === 'loading')));
  }

  /** A marker was clicked in one of the current views. */
  selectMarkerInView(view: LevelView, marker: Marker): void {
    if (view.index < 0) {
      this.onFocusChange(marker, view.level);
      return;
    }
    this.selectMarker(view.index, marker);
  }

  selectMarker(levelIndex: number, marker: Marker): void {
    if (marker.closeUp) {
      this.onFocusChange(marker, this.levels[levelIndex]);
      this.enterCloseUp(marker.closeUp, { levelIndex, marker });
      return;
    }
    if (marker.jumpToS !== undefined) {
      this.releaseFocus();
      this.sGoal = marker.jumpToS;
      this.onFocusChange(marker, this.levels[levelIndex]);
      return;
    }
    if (!marker.focus) {
      this.onFocusChange(marker, this.levels[levelIndex]);
      return;
    }
    this.focus = { levelIndex, marker, blend: this.focus?.marker === marker ? this.focus.blend : 0, active: true };
    this.sGoal = Math.log10(this.focusRadius(marker) * 4);
    this.onFocusChange(marker, this.levels[levelIndex]);
  }

  releaseFocus(): void {
    if (this.focus?.active) {
      this.focus.active = false;
      this.onFocusChange(null, null);
    }
  }

  /** Radius in metres a focusable marker's body is drawn at (Magnified Bodies included). */
  focusRadius(marker: Marker): number {
    const f = marker.focus!;
    return f.radius * (this.magnify ? (f.magnifiedFactor ?? 1) : 1);
  }

  private sMin(): number {
    if (this.focus?.active && this.focus.marker.focus) return Math.log10(this.focusRadius(this.focus.marker) * 1.4);
    return S_MIN;
  }

  private ensureLoaded(i: number): void {
    if (this.loadStates[i] !== 'idle') return;
    this.loadStates[i] = 'loading';
    this.onLoadingChange(true);
    this.levels[i]
      .load()
      .then(() => (this.loadStates[i] = 'ready'))
      .catch((err) => {
        console.error(`Failed to load level ${this.levels[i].id}`, err);
        this.loadStates[i] = 'error';
      })
      .finally(() => this.onLoadingChange([...this.loadStates, ...this.cuLoad.values()].some((st) => st === 'loading')));
  }

  /** Scale used to decide which levels show (pinned while focused on a body). */
  effectiveS(): number {
    if (this.focus) return Math.max(this.s, solidBand(this.focus.levelIndex)[0]);
    return this.s;
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsed += dt;
    this.clock.advance(dt);

    // scale easing with a speed cap so long flights pass through every level
    this.sGoal = clamp(this.sGoal, this.sMin(), S_MAX);
    const ds = (this.sGoal - this.s) * (1 - Math.exp(-dt * 5));
    this.s += clamp(ds, -MAX_ZOOM_SPEED * dt, MAX_ZOOM_SPEED * dt);
    const k = 1 - Math.exp(-dt * 8);
    this.yaw += (this.yawGoal - this.yaw) * k;
    this.pitch += (this.pitchGoal - this.pitch) * k;

    // close-up lifecycle
    const t = this.transition;
    if (t.id) {
      this.cu.step(dt, closeUpSMin(t.id, this.magnify), closeUpSMax(t.id));
      const wasIn = t.phase;
      const { left } = t.step(dt, this.cu.s);
      if (left) this.returnHome();
      if (wasIn !== t.phase) this.syncCloseUp();
    }
    const mix = t.mix;

    // focus lifecycle
    if (this.focus) {
      if (this.focus.active && !t.id && this.s > solidBand(this.focus.levelIndex)[1]) this.releaseFocus();
      const goal = this.focus.active ? 1 : 0;
      this.focus.blend += (goal - this.focus.blend) * (1 - Math.exp(-dt * 3));
      if (!this.focus.active && this.focus.blend < 0.002) this.focus = null;
    }

    const sEff = this.effectiveS();
    const weights = levelWeights(sEff);
    const dom = weights.indexOf(Math.max(...weights));
    if (dom !== this.dominant) {
      this.dominant = dom;
      this.onDominantChange(dom);
    }
    for (let i = Math.max(0, dom - 1); i <= Math.min(this.levels.length - 1, dom + 1); i++) this.ensureLoaded(i);

    const dir = this.tmpDir.set(
      Math.cos(this.pitch) * Math.sin(this.yaw),
      Math.sin(this.pitch),
      Math.cos(this.pitch) * Math.cos(this.yaw),
    );

    this.views = [];
    weights.forEach((w0, i) => {
      const w = w0 * (1 - mix);
      if (w < 1e-3) return;
      const level = this.levels[i];
      const cam = this.cameras[i];
      const path = ANCHOR_PATHS[level.id];
      const target = level.anchor(path.from, this.tmpA);
      if (path.from !== path.to) target.lerp(level.anchor(path.to, this.tmpB), anchorBlend(path, sEff));
      if (this.focus && this.focus.levelIndex === i) {
        target.lerp(this.focus.marker.position(this.tmpB), this.focus.blend);
      }
      const dist = Math.pow(10, this.s) / level.unit;
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.up.set(0, 1, 0);
      cam.lookAt(target);
      cam.near = dist * 1e-3;
      cam.far = dist * 1e7;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      this.views.push({ level, index: i, weight: w, camera: cam, s: this.s });
    });

    if (t.id && mix > 1e-3) {
      const scene = this.closeUps[t.id];
      const cam = this.cuCamera;
      const d = this.cu.direction(this.tmpB);
      const dist = Math.pow(10, this.cu.s) / scene.unit;
      cam.position.copy(d).multiplyScalar(dist);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
      cam.near = dist * 1e-3;
      cam.far = dist * 1e7;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      if (this.cuLoad.get(t.id) === 'ready') this.views.push({ level: scene, index: -1, weight: mix, camera: cam, s: this.cu.s });
    }

    const ctxBase = {
      date: this.clock.date,
      dt,
      elapsed: this.elapsed,
      s: this.s,
      magnify: this.magnify,
      viewportHeight: window.innerHeight,
    };
    for (const v of this.views) {
      const ctx: FrameContext = { ...ctxBase, s: v.s, weight: v.weight, camera: v.camera };
      v.level.update(ctx);
    }

    // Always render levels into linear HDR targets and composite, so every
    // material (built-in or custom shader) goes through the same sRGB encode
    // whether one level or two are showing.
    const r = this.renderer;
    const shown = [...this.views].sort((a, b) => b.weight - a.weight).slice(0, 2);
    const total = shown.reduce((sum, v) => sum + v.weight, 0) || 1;
    const u = this.compositeMaterial.uniforms;
    u.wA.value = 0;
    u.wB.value = 0;
    shown.forEach((v, k) => {
      if (v.level.render) {
        v.level.render(r, v.camera, this.targets[k]);
      } else {
        r.setRenderTarget(this.targets[k]);
        r.clear();
        r.render(v.level.scene, v.camera);
      }
      (k === 0 ? u.wA : u.wB).value = v.weight / total;
    });
    r.setRenderTarget(null);
    r.render(this.compositeScene, this.compositeCamera);

    this.onFrame();
  }

  /** Visible field width (metres) at the target distance. */
  viewWidthMeters(): number {
    const dist = Math.pow(10, this.currentS());
    const cam = this.cameras[0];
    return 2 * dist * Math.tan((cam.fov / 2) * (Math.PI / 180)) * cam.aspect;
  }
}
