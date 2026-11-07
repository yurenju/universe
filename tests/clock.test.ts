import { describe, expect, it } from 'vitest';
import { RATE_PRESETS, SimClock, defaultTimeRate } from '../src/core/clock';
import { CLOSE_UP_IDS } from '../src/core/closeUp';
import { LEVEL_IDS } from '../src/core/scale';

describe('Default Time Rate', () => {
  it('uses the agreed rate in each view that shows Sim Time', () => {
    expect(defaultTimeRate('earth-moon')).toBe(86400);
    expect(defaultTimeRate('planetary')).toBe(86400 * 7);
    expect(defaultTimeRate('cygnus-x1')).toBe(3600);
    expect(defaultTimeRate('sgr-a')).toBe(86400 * 365.25);
  });

  it('runs in real time where Sim Time is not shown', () => {
    for (const id of LEVEL_IDS.slice(2)) expect(defaultTimeRate(id)).toBe(1);
  });

  it('is always one of the rate menu presets', () => {
    const rates = RATE_PRESETS.map((p) => p.rate);
    for (const id of [...LEVEL_IDS, ...CLOSE_UP_IDS]) expect(rates).toContain(defaultTimeRate(id));
  });
});

describe('SimClock.resetToNow', () => {
  it('returns to the present at the given rate, playing', () => {
    const c = new SimClock();
    c.time = 0;
    c.paused = true;
    c.resetToNow(3600);
    expect(Math.abs(c.time - Date.now())).toBeLessThan(1000);
    expect(c.rate).toBe(3600);
    expect(c.paused).toBe(false);
  });
});
