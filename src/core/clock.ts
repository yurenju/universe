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

  resetToNow(): void {
    this.time = Date.now();
    this.rate = 1;
    this.paused = false;
  }
}

export const RATE_PRESETS: readonly { rate: number; label: string }[] = [
  { rate: 1, label: '即時' },
  { rate: 3600, label: '1 小時／秒' },
  { rate: 86400, label: '1 天／秒' },
  { rate: 86400 * 7, label: '1 週／秒' },
  { rate: 86400 * 30, label: '1 個月／秒' },
  { rate: 86400 * 365.25, label: '1 年／秒' },
];
