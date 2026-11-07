import * as THREE from 'three';
import { ANCHOR_PATHS, anchorBlend } from './anchors';
import { SimClock } from './clock';
import type { FrameContext, Marker, ScaleLevel } from './level';
import { HOME_S, S_MAX, S_MIN, clamp, dominantLevel, levelWeights, solidBand, type LevelId } from './scale';

interface Focus {
  levelIndex: number;
  marker: Marker;
  blend: number;
  active: boolean;
}

export interface LevelView {
  level: ScaleLevel;
  index: number;
  weight: number;
  camera: THREE.PerspectiveCamera;
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
  onFocusChange: (marker: Marker | null, level: ScaleLevel | null) => void = () => {};
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

  constructor(canvas: HTMLCanvasElement, levels: ScaleLevel[], initial: LevelId) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.levels = levels;
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
    for (const c of this.cameras) {
      c.aspect = w / h;
      c.fov = fov;
      c.updateProjectionMatrix();
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
    this.sGoal = clamp(this.sGoal + deltaDex, this.sMin(), S_MAX);
  }

  rotateBy(dYaw: number, dPitch: number): void {
    this.yawGoal += dYaw;
    this.pitchGoal = clamp(this.pitchGoal + dPitch, -1.45, 1.45);
  }

  selectMarker(levelIndex: number, marker: Marker): void {
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

  private focusRadius(marker: Marker): number {
    const f = marker.focus!;
    return f.radius * (this.magnify ? (f.magnifiedFactor ?? 1) : 1);
  }

  private sMin(): number {
    if (this.focus?.active) return Math.log10(this.focusRadius(this.focus.marker) * 1.4);
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
      .finally(() => this.onLoadingChange(this.loadStates.some((st) => st === 'loading')));
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

    // focus lifecycle
    if (this.focus) {
      if (this.focus.active && this.s > solidBand(this.focus.levelIndex)[1]) this.releaseFocus();
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
    weights.forEach((w, i) => {
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
      this.views.push({ level, index: i, weight: w, camera: cam });
    });

    const ctxBase = {
      date: this.clock.date,
      dt,
      elapsed: this.elapsed,
      s: this.s,
      magnify: this.magnify,
      viewportHeight: window.innerHeight,
    };
    for (const v of this.views) {
      const ctx: FrameContext = { ...ctxBase, weight: v.weight, camera: v.camera };
      v.level.update(ctx);
    }

    // Always render levels into linear HDR targets and composite, so every
    // material (built-in or custom shader) goes through the same sRGB encode
    // whether one level or two are showing.
    const r = this.renderer;
    const total = this.views.reduce((sum, v) => sum + v.weight, 0) || 1;
    const u = this.compositeMaterial.uniforms;
    u.wA.value = 0;
    u.wB.value = 0;
    this.views.slice(0, 2).forEach((v, k) => {
      r.setRenderTarget(this.targets[k]);
      r.clear();
      r.render(v.level.scene, v.camera);
      (k === 0 ? u.wA : u.wB).value = v.weight / total;
    });
    r.setRenderTarget(null);
    r.render(this.compositeScene, this.compositeCamera);

    this.onFrame();
  }

  /** Visible field width (metres) at the target distance. */
  viewWidthMeters(): number {
    const dist = Math.pow(10, this.s);
    const cam = this.cameras[0];
    return 2 * dist * Math.tan((cam.fov / 2) * (Math.PI / 180)) * cam.aspect;
  }
}
