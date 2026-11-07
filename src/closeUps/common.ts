import * as THREE from 'three';
import type { CloseUpId } from '../core/closeUp';
import type { CloseUpScene, FrameContext, Marker } from '../core/level';
import { toThree, type Vec3 } from '../core/frames';
import { mulberry32 } from '../render/assets';
import { createPoints, createPointsMaterial } from '../render/points';

/** Shared plumbing for Close-ups (mirrors BaseLevel). */
export abstract class BaseCloseUp implements CloseUpScene {
  abstract readonly id: CloseUpId;
  abstract readonly unit: number;
  abstract readonly defaultView: { yaw: number; pitch: number };
  readonly scene = new THREE.Scene();
  markers: Marker[] = [];
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    this.loading ??= this.build();
    return this.loading;
  }

  protected abstract build(): Promise<void>;
  abstract update(ctx: FrameContext): void;
  abstract render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, target: THREE.WebGLRenderTarget): void;

  /** Marker whose position is read from a live vector (scene units). */
  protected liveMarker(m: Omit<Marker, 'position'>, at: THREE.Vector3): Marker {
    return { ...m, position: (out) => out.copy(at) };
  }
}

/**
 * Illustrative background stars on a unit sphere (directions only), for a
 * sky cube map. Not real star positions: the view from these places is unknown
 * in detail (dust hides most of it).
 */
export function starfield(n: number, seed: number, tint: Vec3, bandWeight = 0.5): THREE.Points {
  const rand = mulberry32(seed);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // concentrate part of the stars toward the galactic plane (z ≈ 0)
    const lon = rand() * Math.PI * 2;
    const lat = rand() < bandWeight ? (rand() - 0.5) * 0.35 : Math.asin(rand() * 2 - 1);
    const v: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    pos.set(toThree(v), i * 3);
    const k = Math.pow(rand(), 3) * 1.6 + 0.08;
    const warm = rand();
    col.set([k * (tint[0] + warm * 0.2), k * tint[1], k * (tint[2] + (1 - warm) * 0.2)], i * 3);
    size[i] = 1.2 + Math.pow(rand(), 4) * 3;
  }
  const mat = createPointsMaterial({ minSize: 1, maxSize: 6, softness: 2.5 });
  const pts = createPoints(pos, col, size, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Galactic-frame vector (any unit) → Three.Vector3 scaled by k. */
export function galToScene(v: Vec3, k = 1, out = new THREE.Vector3()): THREE.Vector3 {
  const t = toThree(v);
  return out.set(t[0] * k, t[1] * k, t[2] * k);
}

/** Pixel-minimum world size for a sprite at `dist` (scene units). */
export function minWorldSize(px: number, dist: number, camera: THREE.PerspectiveCamera, viewportHeight: number): number {
  return (px * 2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / viewportHeight;
}

/**
 * Decides whether to ray-trace the lensing. Starts on; turns off for good if
 * frames stay slow (average over ~2 s above 60 ms) while a Close-up is showing.
 * `?lensing=on` / `?lensing=off` in the URL forces it.
 */
export class LensQuality {
  enabled = true;
  private forced: boolean | null;
  private acc = 0;
  private n = 0;

  constructor() {
    const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('lensing');
    this.forced = q === 'on' ? true : q === 'off' ? false : null;
    if (this.forced !== null) this.enabled = this.forced;
  }

  /** Feed one frame's duration in seconds. */
  sample(dt: number): void {
    if (this.forced !== null || !this.enabled) return;
    this.acc += dt;
    this.n++;
    if (this.acc < 2) return;
    const avg = this.acc / this.n;
    this.acc = 0;
    this.n = 0;
    if (avg > 0.06) {
      this.enabled = false;
      console.info(`Close-up lensing turned off: frames averaged ${(avg * 1000).toFixed(0)} ms`);
    }
  }
}

/** Shared by all Close-ups: one slow device turns it off everywhere. */
export const lensQuality = new LensQuality();
