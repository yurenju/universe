import * as THREE from 'three';
import { cometPosition, sampleCometOrbit } from '../core/comet';
import { toThree } from '../core/frames';
import { returnTimes, type CometInfo } from '../content/comets';
import { glowSprite, glowTexture } from './primitives';

/** Orbits are hidden until their marker is hovered (faint) or selected (bright). */
const ORBIT_OPACITY_HOVER = 0.22;
const ORBIT_OPACITY_SELECTED = 0.75;
/** Beyond this distance from the Sun (AU) a comet has no visible tail. */
const TAIL_OFF_AU = 4;
const TAIL_FULL_AU = 2;

/** Dashed orbit: the sampled ellipse with every third segment left out. */
function dashedOrbit(c: CometInfo): THREE.LineSegments {
  const pts = sampleCometOrbit(c.orbit, 540).map(toThree);
  const arr: number[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    if (k % 3 === 2) continue;
    arr.push(...pts[k], ...pts[k + 1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  const mat = new THREE.LineBasicMaterial({ color: c.color, transparent: true, opacity: ORBIT_OPACITY_HOVER, depthWrite: false });
  const line = new THREE.LineSegments(geo, mat);
  line.frustumCulled = false;
  return line;
}

let tailTex: THREE.Texture | null = null;
/** Tail texture: bright at the head (u = 0), fading along the tail and across it. */
function tailTexture(): THREE.Texture {
  if (tailTex) return tailTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  const img = g.createImageData(256, 64);
  for (let x = 0; x < 256; x++) {
    const u = x / 255;
    const along = Math.pow(1 - u, 1.6);
    for (let y = 0; y < 64; y++) {
      const v = (y / 63) * 2 - 1;
      // the tail widens away from the head
      const w = 0.25 + 0.75 * u;
      const across = Math.exp(-((v / w) ** 2) * 3);
      const a = along * across;
      const i = (y * 256 + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * a);
    }
  }
  g.putImageData(img, 0, 0);
  tailTex = new THREE.CanvasTexture(c);
  tailTex.colorSpace = THREE.SRGBColorSpace;
  return tailTex;
}

/**
 * A Periodic Comet in the Planetary System: its orbit, a glowing head and a tail
 * pointing away from the Sun that grows near perihelion. The tail's length and
 * look are illustrative (Inferred); the position follows the Return table.
 */
export class CometView {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  private readonly returns: number[];
  private orbit: THREE.LineSegments;
  private head: THREE.Sprite;
  private tail: THREE.Mesh;
  private selected = false;
  private hovered = false;
  private tmp = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private side = new THREE.Vector3();
  private up = new THREE.Vector3();

  constructor(readonly info: CometInfo) {
    this.returns = returnTimes(info);
    this.orbit = dashedOrbit(info);
    this.head = glowSprite(glowTexture(), info.color, 0.01, 1);
    (this.head.material as THREE.SpriteMaterial).sizeAttenuation = false;
    const mat = new THREE.MeshBasicMaterial({
      map: tailTexture(),
      color: info.color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    // unit quad spanning x ∈ [0, 1] (head at 0), y ∈ [−½, ½]
    const geo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    this.tail = new THREE.Mesh(geo, mat);
    this.tail.matrixAutoUpdate = false;
    this.tail.frustumCulled = false;
    this.group.add(this.orbit, this.tail, this.head);
  }

  setSelected(on: boolean): void {
    this.selected = on;
  }

  setHovered(on: boolean): void {
    this.hovered = on;
  }

  /** Distance from the Sun, AU (valid after update). */
  get rAu(): number {
    return this.position.length();
  }

  update(date: Date, camera: THREE.Camera): void {
    const p = toThree(cometPosition(this.info.orbit, this.returns, date.getTime()));
    this.position.set(p[0], p[1], p[2]);
    const r = this.position.length();
    // 0 far from the Sun, 1 well inside TAIL_FULL_AU
    const activity = THREE.MathUtils.smoothstep(TAIL_OFF_AU - r, 0, TAIL_OFF_AU - TAIL_FULL_AU);
    this.orbit.visible = this.selected || this.hovered;
    (this.orbit.material as THREE.LineBasicMaterial).opacity = this.selected ? ORBIT_OPACITY_SELECTED : ORBIT_OPACITY_HOVER;

    this.head.position.copy(this.position);
    this.head.scale.setScalar(0.006 + 0.008 * activity);
    (this.head.material as THREE.SpriteMaterial).opacity = 0.55 + 0.45 * activity;

    const length = this.info.tailScale * 0.3 * Math.pow(1 / Math.max(r, 0.1), 1.5) * activity;
    this.tail.visible = length > 1e-4;
    if (!this.tail.visible) return;
    // x along the anti-Sun direction, y across it and facing the camera as much as possible
    this.dir.copy(this.position).normalize();
    this.tmp.copy(camera.position).sub(this.position);
    this.side.crossVectors(this.dir, this.tmp);
    if (this.side.lengthSq() < 1e-12) this.side.set(0, 1, 0).cross(this.dir);
    this.side.normalize();
    this.up.crossVectors(this.dir, this.side);
    this.tail.matrix.makeBasis(this.dir.multiplyScalar(length), this.side.multiplyScalar(length * 0.18), this.up);
    this.tail.matrix.setPosition(this.position);
    this.tail.matrixWorldNeedsUpdate = true;
    (this.tail.material as THREE.MeshBasicMaterial).opacity = 0.8 * activity;
  }
}
