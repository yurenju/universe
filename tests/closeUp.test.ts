import { describe, expect, it } from 'vitest';
import {
  APPROACH_SECONDS,
  CLOSE_UP_IDS,
  CLOSE_UP_RANGES,
  CloseUpTransition,
  FADE_SECONDS,
  closeUpSMax,
  closeUpSMin,
  effectiveRs,
  parseRoute,
} from '../src/core/closeUp';
import { BOUNDARIES, FADE_HALF_WIDTH, LEVEL_IDS, solidBand } from '../src/core/scale';

const run = (t: CloseUpTransition, seconds: number, s = 0) => {
  const out = { entered: false, left: false };
  for (let k = 0; k < Math.round(seconds * 60); k++) {
    const r = t.step(1 / 60, s);
    out.entered ||= r.entered;
    out.left ||= r.left;
  }
  return out;
};

describe('close-up zoom ranges', () => {
  it('never lets the camera reach the event horizon, magnified or not', () => {
    for (const id of CLOSE_UP_IDS) {
      for (const magnify of [false, true]) {
        expect(10 ** closeUpSMin(id, magnify)).toBeGreaterThan(effectiveRs(id, magnify));
      }
    }
  });

  it('opens between its closest zoom and its exit, and can zoom past the exit', () => {
    for (const id of CLOSE_UP_IDS) {
      const r = CLOSE_UP_RANGES[id];
      for (const magnify of [false, true]) expect(r.homeS).toBeGreaterThan(closeUpSMin(id, magnify));
      expect(r.homeS).toBeLessThan(r.exitS);
      expect(closeUpSMax(id)).toBeGreaterThan(r.exitS);
    }
  });

  it('Cygnus X-1 zooms from the binary (~10^11.8 m) down to ~6 Rs (~10^5.6 m)', () => {
    expect(closeUpSMin('cygnus-x1', false)).toBeCloseTo(5.57, 1);
    expect(CLOSE_UP_RANGES['cygnus-x1'].exitS).toBeGreaterThan(11.8);
  });

  it('returns to a level whose solid band contains the Milky Way marker scales', () => {
    for (const id of CLOSE_UP_IDS) {
      const i = LEVEL_IDS.indexOf(CLOSE_UP_RANGES[id].returnLevel);
      const [lo, hi] = solidBand(i);
      expect(hi - lo).toBeGreaterThan(1);
      expect(BOUNDARIES[i] - FADE_HALF_WIDTH).toBe(hi);
    }
  });

  it('stops where the shadow still fits in the field of view', async () => {
    const { CLOSEST_RS } = await import('../src/core/closeUp');
    const { CRITICAL_IMPACT } = await import('../src/core/blackhole');
    // shadow angular radius seen from radius r (r > 1.5 Rs): sin ψ = b_c √(1 − 1/r) / r
    const r = CLOSEST_RS;
    const psi = (Math.asin((CRITICAL_IMPACT * Math.sqrt(1 - 1 / r)) / r) * 180) / Math.PI;
    expect(2 * psi).toBeLessThan(50); // narrower than the 50° vertical field of view
    expect(2 * psi).toBeGreaterThan(30); // but still dramatic
  });
});

describe('parseRoute', () => {
  it('recognises levels and close-ups', () => {
    expect(parseRoute('#milky-way')).toEqual({ kind: 'level', id: 'milky-way' });
    expect(parseRoute('#cygnus-x1')).toEqual({ kind: 'closeUp', id: 'cygnus-x1' });
    expect(parseRoute('#/SGR-A')).toEqual({ kind: 'closeUp', id: 'sgr-a' });
    expect(parseRoute('#nowhere')).toBeNull();
    expect(parseRoute('')).toBeNull();
  });
});

describe('CloseUpTransition', () => {
  it('approaches, fades in, then is inside', () => {
    const t = new CloseUpTransition();
    expect(t.enter('cygnus-x1')).toBe(true);
    expect(t.phase).toBe('approach');
    expect(t.controlsCloseUp).toBe(false);
    run(t, APPROACH_SECONDS + 0.05);
    expect(t.phase).toBe('fadeIn');
    expect(t.controlsCloseUp).toBe(true);
    const r = run(t, FADE_SECONDS + 0.05);
    expect(r.entered).toBe(true);
    expect(t.phase).toBe('inside');
    expect(t.mix).toBe(1);
  });

  it('fades out on exit and reports leaving once', () => {
    const t = new CloseUpTransition();
    t.enter('sgr-a', true);
    t.exit();
    expect(t.phase).toBe('fadeOut');
    expect(t.controlsCloseUp).toBe(false);
    const r = run(t, FADE_SECONDS + 0.05);
    expect(r.left).toBe(true);
    expect(t.phase).toBe('idle');
    expect(t.id).toBeNull();
    expect(t.visible).toBe(false);
  });

  it('cancels during the approach without ever showing the close-up', () => {
    const t = new CloseUpTransition();
    t.enter('cygnus-x1');
    run(t, APPROACH_SECONDS / 2);
    t.exit();
    expect(t.phase).toBe('idle');
    expect(t.visible).toBe(false);
  });

  it('reverses a fade-in from where it is, without jumping', () => {
    const t = new CloseUpTransition();
    t.enter('cygnus-x1');
    run(t, APPROACH_SECONDS + FADE_SECONDS / 2);
    const mid = t.progress;
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
    t.exit();
    t.step(1 / 60, 0);
    expect(t.progress).toBeLessThan(mid);
    expect(t.progress).toBeGreaterThan(mid - 0.1);
  });

  it('re-entering the same close-up while fading out fades back in', () => {
    const t = new CloseUpTransition();
    t.enter('cygnus-x1', true);
    t.exit();
    run(t, FADE_SECONDS / 2);
    expect(t.enter('cygnus-x1')).toBe(true);
    expect(t.phase).toBe('fadeIn');
  });

  it('ignores a different close-up while one is in progress', () => {
    const t = new CloseUpTransition();
    t.enter('cygnus-x1', true);
    expect(t.enter('sgr-a')).toBe(false);
    expect(t.id).toBe('cygnus-x1');
  });

  it('leaves when zoomed out past the exit scale', () => {
    const t = new CloseUpTransition();
    t.enter('cygnus-x1', true);
    t.step(1 / 60, CLOSE_UP_RANGES['cygnus-x1'].exitS - 0.1);
    expect(t.phase).toBe('inside');
    t.step(1 / 60, CLOSE_UP_RANGES['cygnus-x1'].exitS + 0.01);
    expect(t.phase).toBe('fadeOut');
  });
});
