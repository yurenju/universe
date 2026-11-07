import { describe, expect, it } from 'vitest';
import { ANCHOR_PATHS } from '../src/core/anchors';
import {
  BOUNDARIES,
  HOME_S,
  LEVEL_IDS,
  S_MAX,
  S_MIN,
  dominantLevel,
  levelWeights,
  parseHash,
  solidBand,
} from '../src/core/scale';

describe('levelWeights', () => {
  it('always sums to 1 with at most two levels showing', () => {
    for (let s = S_MIN; s <= S_MAX; s += 0.01) {
      const w = levelWeights(s);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      expect(w.filter((x) => x > 1e-9).length).toBeLessThanOrEqual(2);
      w.forEach((x) => expect(x).toBeGreaterThanOrEqual(0));
    }
  });

  it('only cross-fades neighbouring levels', () => {
    for (let s = S_MIN; s <= S_MAX; s += 0.01) {
      const idx = levelWeights(s)
        .map((x, i) => (x > 1e-9 ? i : -1))
        .filter((i) => i >= 0);
      if (idx.length === 2) expect(idx[1] - idx[0]).toBe(1);
    }
  });

  it('shows exactly one level, fully, at each home scale', () => {
    LEVEL_IDS.forEach((id, i) => {
      expect(levelWeights(HOME_S[id])[i]).toBe(1);
      expect(dominantLevel(HOME_S[id])).toBe(i);
    });
  });

  it('has ascending boundaries with a non-empty solid band per level', () => {
    expect(BOUNDARIES.length).toBe(LEVEL_IDS.length - 1);
    for (let i = 1; i < BOUNDARIES.length; i++) expect(BOUNDARIES[i]).toBeGreaterThan(BOUNDARIES[i - 1]);
    LEVEL_IDS.forEach((_, i) => {
      const [lo, hi] = solidBand(i);
      expect(hi).toBeGreaterThan(lo);
    });
  });
});

describe('anchor paths', () => {
  it('chain together: each level starts where the previous one ended', () => {
    for (let i = 1; i < LEVEL_IDS.length; i++) {
      expect(ANCHOR_PATHS[LEVEL_IDS[i]].from).toBe(ANCHOR_PATHS[LEVEL_IDS[i - 1]].to);
    }
  });

  it('only glide while their level is fully opaque (never during a cross-fade)', () => {
    LEVEL_IDS.forEach((id, i) => {
      const p = ANCHOR_PATHS[id];
      if (p.from === p.to) return;
      const [lo, hi] = solidBand(i);
      expect(p.s0).toBeGreaterThanOrEqual(lo);
      expect(p.s1).toBeLessThanOrEqual(hi);
      expect(p.s1).toBeGreaterThan(p.s0);
    });
  });
});

describe('parseHash', () => {
  it('accepts level ids with or without a slash', () => {
    expect(parseHash('#milky-way')).toBe('milky-way');
    expect(parseHash('#/Oort')).toBe('oort');
  });
  it('rejects anything else', () => {
    expect(parseHash('')).toBeNull();
    expect(parseHash('#mars')).toBeNull();
  });
});
