import { describe, expect, it } from 'vitest';
import { bvToRgb, bvToTemperature } from '../src/core/color';
import { METERS } from '../src/core/scale';
import { formatDistance, formatLightTime } from '../src/core/units';

describe('formatDistance', () => {
  it.each([
    [500, '500 公尺'],
    [12742e3, '1.27 萬公里'],
    [384400e3, '38.4 萬公里'],
    [METERS.AU, '1 天文單位'],
    [121.6 * METERS.AU, '122 天文單位'],
    [4.24 * METERS.LY, '4.24 光年'],
    [100000 * METERS.LY, '10 萬光年'],
    [2.5e6 * METERS.LY, '2.5 百萬光年'],
    [46.5e9 * METERS.LY, '465 億光年'],
  ])('%d m → %s', (m, expected) => {
    expect(formatDistance(m)).toBe(expected);
  });

  it('uses 公里 below 10,000 km', () => {
    expect(formatDistance(6371e3)).toBe('6,371 公里');
  });
});

describe('formatLightTime', () => {
  it('Earth → Moon is about 1.28 seconds', () => {
    expect(formatLightTime(384400e3)).toBe('1.28 秒');
  });
  it('Sun → Earth is about 8.3 minutes', () => {
    expect(formatLightTime(METERS.AU)).toBe('8.32 分鐘');
  });
  it('one light-year takes one year', () => {
    expect(formatLightTime(METERS.LY)).toBe('1 年');
  });
  it('the Milky Way (100,000 ly) takes 10 萬年', () => {
    expect(formatLightTime(1e5 * METERS.LY)).toBe('10 萬年');
  });
});

describe('star colours', () => {
  it('gives the Sun (B−V 0.65) roughly 5,800 K', () => {
    expect(bvToTemperature(0.65)).toBeGreaterThan(5600);
    expect(bvToTemperature(0.65)).toBeLessThan(6000);
  });
  it('makes hot stars blue and cool stars red', () => {
    const hot = bvToRgb(-0.3);
    const cool = bvToRgb(1.8);
    expect(hot[2]).toBeGreaterThan(hot[0]);
    expect(cool[0]).toBeGreaterThan(cool[2]);
  });
});
