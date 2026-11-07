import type * as THREE from 'three';
import type { AnchorName } from './anchors';
import type { CloseUpId } from './closeUp';
import type { LevelId } from './scale';

export interface FrameContext {
  /** Simulated date (Sim Time). */
  date: Date;
  /** Real seconds since last frame. */
  dt: number;
  /** Real seconds since start. */
  elapsed: number;
  /** Current scale, log10 metres. */
  s: number;
  /** Whether Magnified Bodies is on. */
  magnify: boolean;
  /** This level's current visibility weight. */
  weight: number;
  camera: THREE.PerspectiveCamera;
  /** Viewport height in CSS pixels (for pixel-sized points). */
  viewportHeight: number;
}

export type MarkerKind = 'body' | 'region' | 'here' | 'probe';

export interface FocusSpec {
  /** Body radius in metres (true scale). */
  radius: number;
  /** Multiplier applied to radius when Magnified Bodies is on. */
  magnifiedFactor?: number;
}

export interface Marker {
  id: string;
  label: string;
  labelEn?: string;
  kind: MarkerKind;
  /** Write the marker's scene position into `out`. */
  position(out: THREE.Vector3): THREE.Vector3;
  /** Visible only while s is within [sMin, sMax]. */
  sMin: number;
  sMax: number;
  /** Click behaviour: focus on this body, or jump to a scale. */
  focus?: FocusSpec;
  jumpToS?: number;
  /** Key into the body info content. */
  infoId?: string;
  /** Clicking enters this Close-up. */
  closeUp?: CloseUpId;
}

/** Anything the engine can draw from its own camera: a Scale Level or a Close-up. */
export interface ViewScene {
  readonly id: string;
  /** Metres per scene unit. */
  unit: number;
  scene: THREE.Scene;
  markers: Marker[];
  /** Load assets; called once, lazily, shortly before the scene is first needed. */
  load(): Promise<void>;
  /** Per-frame update while the scene has weight > 0. */
  update(ctx: FrameContext): void;
  /**
   * Optional custom render into `target` (e.g. with a post-process). Without
   * it the engine renders `scene` directly.
   */
  render?(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, target: THREE.WebGLRenderTarget): void;
}

export interface ScaleLevel extends ViewScene {
  id: LevelId;
  /** Positions of the named anchors this level uses, in scene units. */
  anchor(name: AnchorName, out: THREE.Vector3): THREE.Vector3;
}

/** A Close-up: a self-contained scene centred on its origin (see ADR 0002). */
export interface CloseUpScene extends ViewScene {
  id: CloseUpId;
  /** Camera angles the close-up opens with. */
  defaultView: { yaw: number; pitch: number };
}
