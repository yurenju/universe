import type { CloseUpId } from './closeUp';
import type { LevelId } from './scale';

/** Sim Time: the date that drives planet and Moon positions. */
export class SimClock {
  /** Milliseconds since epoch. */
  time = Date.now();
  /** Simulated seconds per real second. */
  rate = 1;
  paused = false;

  advance(dtSeconds: number): void {
    if (!this.paused) this.time += dtSeconds * this.rate * 1000;
  }

  get date(): Date {
    return new Date(this.time);
  }

  /** Back to the present at `rate`, playing. */
  resetToNow(rate = 1): void {
    this.time = Date.now();
    this.rate = rate;
    this.paused = false;
  }
}

const HOUR = 3600;
const DAY = 86400;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365.25;

export const RATE_PRESETS: readonly { rate: number; label: string }[] = [
  { rate: 1, label: '即時' },
  { rate: HOUR, label: '1 小時／秒' },
  { rate: DAY, label: '1 天／秒' },
  { rate: WEEK, label: '1 週／秒' },
  { rate: MONTH, label: '1 個月／秒' },
  { rate: YEAR, label: '1 年／秒' },
];

/**
 * Default Time Rate of each view that shows Sim Time: fast enough that its bodies
 * visibly move (Moon ≈ 27 s a lap, Earth's year ≈ 52 s, Cygnus X-1 ≈ 134 s, S2 ≈ 16 s).
 * Every other view runs in real time so the date doesn't run off unseen.
 */
const DEFAULT_TIME_RATES: Partial<Record<LevelId | CloseUpId, number>> = {
  'earth-moon': DAY,
  planetary: WEEK,
  'cygnus-x1': HOUR,
  'sgr-a': YEAR,
};

export function defaultTimeRate(view: LevelId | CloseUpId): number {
  return DEFAULT_TIME_RATES[view] ?? 1;
}
