import { describe, expect, it } from 'vitest';
import { COMETS, returnTimes } from '../src/content/comets';
import {
  amongPlanets,
  aphelionAu,
  bracketReturns,
  cometPosition,
  formatSpan,
  perihelionAu,
  periodMs,
  sampleCometOrbit,
  type CometOrbit,
} from '../src/core/comet';

const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
const DAY = 864e5;
const halley = COMETS.find((c) => c.id === '1P')!;
const halleyReturns = returnTimes(halley);

describe('bracketReturns', () => {
  const orbit: CometOrbit = { a: 4, e: 0.5, i: 0, Omega: 0, omega: 0 }; // P = 8 years
  const P = periodMs(orbit);
  const table = [0, 8.5 * 365.25 * DAY, 16 * 365.25 * DAY];

  it('uses the table between its first and last Return', () => {
    const { prev, next } = bracketReturns(table, orbit, 10 * 365.25 * DAY);
    expect(prev).toEqual({ time: table[1], approx: false });
    expect(next).toEqual({ time: table[2], approx: false });
  });

  it('splits a gap of several orbits into approximate Returns (Halley 1066 → 1835)', () => {
    const t = Date.UTC(1300, 0, 1);
    const { prev, next } = bracketReturns(halleyReturns, halley.orbit, t);
    expect(prev.approx && next.approx).toBe(true);
    const yr = 365.25 * DAY;
    expect((next.time - prev.time) / yr).toBeGreaterThan(74);
    expect((next.time - prev.time) / yr).toBeLessThan(79);
    expect(prev.time).toBeLessThanOrEqual(t);
    expect(next.time).toBeGreaterThan(t);
    // the last orbit of the gap ends on the real 1835 Return
    const late = bracketReturns(halleyReturns, halley.orbit, halleyReturns[1] - DAY);
    expect(late.next).toEqual({ time: halleyReturns[1], approx: false });
    expect(len(cometPosition(halley.orbit, halleyReturns, prev.time))).toBeCloseTo(perihelionAu(halley.orbit), 6);
  });

  it('a tabulated Return counts as the previous one on its own date', () => {
    expect(bracketReturns(table, orbit, table[1]).prev.time).toBe(table[1]);
  });

  it('extrapolates with the Keplerian period after the table, flagged approximate', () => {
    const { prev, next } = bracketReturns(table, orbit, table[2] + 1.5 * P);
    expect(prev.time).toBeCloseTo(table[2] + P, 0);
    expect(prev.approx).toBe(true);
    expect(next.time).toBeCloseTo(table[2] + 2 * P, 0);
    // just after the last Return: the previous one is still the real one
    expect(bracketReturns(table, orbit, table[2] + DAY).prev.approx).toBe(false);
  });

  it('extrapolates before the table too', () => {
    const { prev, next } = bracketReturns(table, orbit, -DAY);
    expect(next).toEqual({ time: 0, approx: false });
    expect(prev.time).toBeCloseTo(-P, 0);
    expect(prev.approx).toBe(true);
  });
});

describe('cometPosition', () => {
  it('puts Halley at perihelion on every tabulated Return', () => {
    const q = perihelionAu(halley.orbit);
    for (const t of halleyReturns) expect(len(cometPosition(halley.orbit, halleyReturns, t))).toBeCloseTo(q, 6);
  });

  it('puts Halley near aphelion halfway between 1986 and 2061', () => {
    const mid = (halleyReturns[3] + halleyReturns[4]) / 2;
    expect(len(cometPosition(halley.orbit, halleyReturns, mid))).toBeCloseTo(aphelionAu(halley.orbit), 3);
  });

  it('moves Halley retrograde (clockwise seen from ecliptic north)', () => {
    const t = halleyReturns[3];
    const a = cometPosition(halley.orbit, halleyReturns, t);
    const b = cometPosition(halley.orbit, halleyReturns, t + 10 * DAY);
    expect(a[0] * b[1] - a[1] * b[0]).toBeLessThan(0);
  });

  it('stays on the sampled orbit', () => {
    const pts = sampleCometOrbit(halley.orbit, 2048);
    const p = cometPosition(halley.orbit, halleyReturns, Date.UTC(2026, 10, 7));
    const nearest = Math.min(...pts.map((o) => Math.hypot(o[0] - p[0], o[1] - p[1], o[2] - p[2])));
    expect(nearest).toBeLessThan(0.1);
  });
});

describe('comet table', () => {
  it.each(COMETS.map((c) => [c.id, c] as const))('%s fits the Planetary System and has a consistent Return table', (_, c) => {
    expect(aphelionAu(c.orbit)).toBeLessThan(60);
    const ts = returnTimes(c);
    for (let k = 1; k < ts.length; k++) expect(ts[k]).toBeGreaterThan(ts[k - 1]);
    // consecutive Returns are a whole number of periods apart, give or take a few percent
    const P = periodMs(c.orbit);
    for (let k = 1; k < ts.length; k++) {
      const n = (ts[k] - ts[k - 1]) / P;
      expect(Math.abs(n - Math.round(n)) * P).toBeLessThan(0.05 * P * Math.round(n));
    }
  });

  it('dates the 1986 Return of Halley correctly', () => {
    expect(new Date(halleyReturns[3]).toISOString().slice(0, 10)).toBe('1986-02-09');
    expect(new Date(halleyReturns[0]).getUTCFullYear()).toBe(1066);
  });
});

describe('amongPlanets', () => {
  it('places Halley’s perihelion and aphelion among the planets', () => {
    expect(amongPlanets(perihelionAu(halley.orbit))).toBe('水星與金星軌道之間');
    expect(amongPlanets(aphelionAu(halley.orbit))).toBe('海王星軌道外');
  });

  it('calls a distance close to a planet "near" it', () => {
    expect(amongPlanets(0.98)).toBe('地球軌道附近');
    expect(amongPlanets(0.3)).toBe('水星軌道內');
  });
});

describe('formatSpan', () => {
  it('reads as years and months, or days when short', () => {
    expect(formatSpan(10 * DAY)).toBe('10 天');
    expect(formatSpan(400 * DAY)).toBe('1 年 1 個月');
    expect(formatSpan(-34.7 * 365.25 * DAY)).toBe('34 年 8 個月');
  });
});
