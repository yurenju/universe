import type * as THREE from 'three';
import type { AnchorName } from './anchors';
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
}

export interface ScaleLevel {
  id: LevelId;
  /** Metres per scene unit. */
  unit: number;
  scene: THREE.Scene;
  markers: Marker[];
  /** Positions of the named anchors this level uses, in scene units. */
  anchor(name: AnchorName, out: THREE.Vector3): THREE.Vector3;
  /** Load assets; called once, lazily, shortly before the level is first needed. */
  load(): Promise<void>;
  /** Per-frame update while the level has weight > 0. */
  update(ctx: FrameContext): void;
}
