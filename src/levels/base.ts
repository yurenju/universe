import * as THREE from 'three';
import type { AnchorName } from '../core/anchors';
import type { FrameContext, Marker, ScaleLevel } from '../core/level';
import type { LevelId } from '../core/scale';

/** Common plumbing: scene, anchor table, markers, one-time loading. */
export abstract class BaseLevel implements ScaleLevel {
  abstract readonly id: LevelId;
  abstract readonly unit: number;
  readonly scene = new THREE.Scene();
  markers: Marker[] = [];
  protected anchors: Partial<Record<AnchorName, THREE.Vector3>> = {};
  private loading: Promise<void> | null = null;

  anchor(name: AnchorName, out: THREE.Vector3): THREE.Vector3 {
    const a = this.anchors[name];
    if (!a) throw new Error(`${this.id} has no anchor ${name}`);
    return out.copy(a);
  }

  load(): Promise<void> {
    this.loading ??= this.build();
    return this.loading;
  }

  protected abstract build(): Promise<void>;
  abstract update(ctx: FrameContext): void;

  /** Marker at a fixed scene position. */
  protected fixedMarker(m: Omit<Marker, 'position'> & { at: THREE.Vector3 }): Marker {
    const { at, ...rest } = m;
    return { ...rest, position: (out) => out.copy(at) };
  }
}
