// The scale axis. The camera's distance from its target, in metres, is 10^s.
// Every Scale Level owns a band of s; neighbouring bands cross-fade.

export const LEVEL_IDS = [
  'earth-moon',
  'planetary',
  'heliosphere',
  'oort',
  'stellar-neighborhood',
  'milky-way',
  'local-group',
  'laniakea',
  'observable-universe',
] as const;

export type LevelId = (typeof LEVEL_IDS)[number];

/** Upper boundary (log10 m) of level i; level i+1 starts here. */
export const BOUNDARIES: readonly number[] = [9.55, 13.25, 14.55, 16.95, 19.3, 22.0, 23.65, 25.3];

/** Half-width (dex) of the cross-fade around each boundary. */
export const FADE_HALF_WIDTH = 0.3;

/** s each level opens at when chosen from the Scale Ladder. */
export const HOME_S: Record<LevelId, number> = {
  'earth-moon': 9.0,
  planetary: 12.25,
  heliosphere: 13.95,
  oort: 16.25,
  'stellar-neighborhood': 17.75,
  'milky-way': 21.15,
  'local-group': 23.0,
  laniakea: 24.75,
  'observable-universe': 27.0,
};

export const S_MIN = 6.9;
export const S_MAX = 27.45;

export const METERS = {
  AU: 1.495978707e11,
  LY: 9.4607304725808e15,
  PC: 3.0856775814913673e16,
  KLY: 9.4607304725808e18,
  MLY: 9.4607304725808e21,
  GLY: 9.4607304725808e24,
  EARTH_RADIUS: 6.371e6,
};

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Visibility weight of every level at scale s. Weights are ≥ 0 and sum to 1;
 * at most two levels are non-zero at once (they cross-fade).
 */
export function levelWeights(s: number): number[] {
  const n = LEVEL_IDS.length;
  const w = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const enter = i === 0 ? 1 : smoothstep(BOUNDARIES[i - 1] - FADE_HALF_WIDTH, BOUNDARIES[i - 1] + FADE_HALF_WIDTH, s);
    const leave = i === n - 1 ? 0 : smoothstep(BOUNDARIES[i] - FADE_HALF_WIDTH, BOUNDARIES[i] + FADE_HALF_WIDTH, s);
    w[i] = Math.max(0, enter - leave);
  }
  return w;
}

/** Index of the level with the highest weight at s. */
export function dominantLevel(s: number): number {
  const w = levelWeights(s);
  let best = 0;
  for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
  return best;
}

/** The s band [lo, hi] in which level i is fully opaque (no fading). */
export function solidBand(i: number): [number, number] {
  const lo = i === 0 ? -Infinity : BOUNDARIES[i - 1] + FADE_HALF_WIDTH;
  const hi = i === LEVEL_IDS.length - 1 ? Infinity : BOUNDARIES[i] - FADE_HALF_WIDTH;
  return [lo, hi];
}

export function levelIndex(id: LevelId): number {
  return LEVEL_IDS.indexOf(id);
}

export function parseHash(hash: string): LevelId | null {
  const id = decodeURIComponent(hash.replace(/^#\/?/, '')).trim().toLowerCase();
  return (LEVEL_IDS as readonly string[]).includes(id) ? (id as LevelId) : null;
}
