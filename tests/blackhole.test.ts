import { describe, expect, it } from 'vitest';
import {
  CRITICAL_IMPACT,
  diskSpeed,
  diskTemperature,
  ISCO,
  schwarzschildRadius,
  traceRay,
  tracedDeflection,
  weakDeflection,
} from '../src/core/blackhole';

describe('schwarzschildRadius', () => {
  it('is about 2.95 km per solar mass', () => {
    expect(schwarzschildRadius(1) / 1e3).toBeCloseTo(2.953, 2);
  });

  it('gives ~63 km for Cygnus X-1 and ~0.085 AU for Sgr A*', () => {
    expect(schwarzschildRadius(21.2) / 1e3).toBeCloseTo(62.6, 0);
    expect(schwarzschildRadius(4.3e6) / 1.495978707e11).toBeCloseTo(0.0849, 3);
  });
});

describe('light-ray tracer', () => {
  it('captures rays just inside the critical impact parameter and lets those just outside escape', () => {
    expect(CRITICAL_IMPACT).toBeCloseTo(2.598, 3);
    expect(Number.isNaN(tracedDeflection(CRITICAL_IMPACT - 0.05))).toBe(true);
    expect(Number.isNaN(tracedDeflection(CRITICAL_IMPACT + 0.05))).toBe(false);
  });

  it('matches the weak-field deflection (with its second-order term) far from the hole', () => {
    for (const b of [20, 40]) {
      // Schwarzschild series with M = Rs/2: 4M/b + 15πM²/4b² + 128M³/3b³
      const expected = weakDeflection(b) + (15 * Math.PI) / 16 / (b * b) + 16 / 3 / b ** 3;
      expect(tracedDeflection(b)).toBeCloseTo(expected, 3);
    }
  });

  it('bends rays toward the hole, more for smaller impact parameters', () => {
    const a = tracedDeflection(4);
    const b = tracedDeflection(8);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(weakDeflection(8)); // strong-field correction is positive
  });

  it('wraps a ray almost around the photon sphere near the critical impact parameter', () => {
    expect(tracedDeflection(CRITICAL_IMPACT + 0.01)).toBeGreaterThan(Math.PI);
  });

  it('is continuous across the trace sphere, where the shader switches to the weak-field formula', async () => {
    const { TRACE_RADIUS, farDeflection } = await import('../src/core/blackhole');
    for (const f of [0.95, 0.99, 0.999]) {
      const inside = tracedDeflection(TRACE_RADIUS * f);
      const outside = farDeflection(TRACE_RADIUS * f);
      expect(Math.abs(inside - outside) / outside).toBeLessThan(0.015);
    }
  });

  it('finishes every ray within the step budget', () => {
    for (let b = 0; b < 59; b += 0.37) {
      const start: [number, number, number] = [-Math.sqrt(59.9 ** 2 - b * b), b, 0];
      expect(traceRay(start, [1, 0, 0]).kind).not.toBe('unfinished');
    }
  });

  it('a ray aimed straight at the hole is captured', () => {
    expect(traceRay([-50, 0, 0], [1, 0, 0]).kind).toBe('captured');
  });
});

describe('disk', () => {
  it('is dark inside the ISCO and peaks just outside it', () => {
    expect(diskTemperature(ISCO)).toBe(0);
    expect(diskTemperature(2)).toBe(0);
    const peak = [3.5, 4, 4.5, 5, 6].map(diskTemperature);
    expect(Math.max(...peak)).toBeGreaterThan(diskTemperature(20));
  });

  it('normalises to a peak near 4 Rs, so the shader’s colour scale reaches exactly 1', async () => {
    const { DISK_PEAK } = await import('../src/core/blackhole');
    expect(DISK_PEAK).toBeCloseTo(0.214, 3);
    for (let r = ISCO; r < 200; r += 0.01) expect(diskTemperature(r) / DISK_PEAK).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('moves at half the speed of light at the ISCO', () => {
    expect(diskSpeed(ISCO)).toBeCloseTo(0.5, 6);
  });
});
