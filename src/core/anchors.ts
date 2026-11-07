import type { LevelId } from './scale';
import { smoothstep } from './scale';

/** Named points that serve as a Level Anchor somewhere along the scale axis. */
export type AnchorName = 'earth' | 'sun' | 'galactic-center' | 'local-group-center' | 'laniakea-center';

/**
 * Each level's default camera target glides from `from` to `to` while s goes
 * from s0 to s1. A level's `from` must equal the previous level's `to`, and
 * the glide must happen while the level is fully opaque, so the two scenes
 * agree on the target during every cross-fade.
 */
export interface AnchorPath {
  from: AnchorName;
  to: AnchorName;
  s0: number;
  s1: number;
}

export const ANCHOR_PATHS: Record<LevelId, AnchorPath> = {
  'earth-moon': { from: 'earth', to: 'earth', s0: 0, s1: 1 },
  planetary: { from: 'earth', to: 'sun', s0: 9.9, s1: 11.8 },
  heliosphere: { from: 'sun', to: 'sun', s0: 0, s1: 1 },
  oort: { from: 'sun', to: 'sun', s0: 0, s1: 1 },
  'stellar-neighborhood': { from: 'sun', to: 'sun', s0: 0, s1: 1 },
  'milky-way': { from: 'sun', to: 'galactic-center', s0: 19.7, s1: 21.0 },
  'local-group': { from: 'galactic-center', to: 'local-group-center', s0: 22.4, s1: 23.25 },
  laniakea: { from: 'local-group-center', to: 'laniakea-center', s0: 24.0, s1: 24.8 },
  // The observable universe is centred on the observer: glide back home.
  'observable-universe': { from: 'laniakea-center', to: 'sun', s0: 25.7, s1: 26.6 },
};

/** 0 → at `from`, 1 → at `to`. */
export function anchorBlend(path: AnchorPath, s: number): number {
  if (path.from === path.to) return 0;
  return smoothstep(path.s0, path.s1, s);
}
