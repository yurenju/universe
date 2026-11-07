import { describe, expect, it } from 'vitest';
import {
  cross,
  eclToEq,
  eqToEcl,
  eqToGal,
  fromThree,
  galToEq,
  raDecToVec,
  sphereTextureBasis,
  toThree,
  vecToSpherical,
  type Vec3,
} from '../src/core/frames';

const close = (a: Vec3, b: Vec3, eps = 1e-6) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], -Math.log10(eps)));

describe('equatorial → galactic', () => {
  it('puts Sgr A* (galactic centre) at l≈0, b≈0', () => {
    const g = vecToSpherical(eqToGal(raDecToVec(17 + 45 / 60 + 40.04 / 3600, -(29 + 0 / 60 + 28.1 / 3600))));
    expect(Math.min(g.lon, 360 - g.lon)).toBeLessThan(0.1);
    expect(Math.abs(g.lat)).toBeLessThan(0.1);
  });

  it('puts the north galactic pole at b = 90°', () => {
    const g = vecToSpherical(eqToGal(raDecToVec(12 + 51.4 / 60, 27.13)));
    expect(g.lat).toBeGreaterThan(89.9);
  });

  it('places Andromeda (M31) at about l = 121°, b = −21.6°', () => {
    const g = vecToSpherical(eqToGal(raDecToVec(0 + 42 / 60 + 44.3 / 3600, 41.269)));
    expect(g.lon).toBeCloseTo(121.17, 0);
    expect(g.lat).toBeCloseTo(-21.57, 0);
  });

  it('round-trips', () => {
    const v: Vec3 = [0.3, -0.5, 0.81];
    close(galToEq(eqToGal(v)), v);
  });
});

describe('equatorial → ecliptic', () => {
  it('maps the north ecliptic pole (RA 18h, Dec +66.56°) to +Z', () => {
    close(eqToEcl(raDecToVec(18, 66.560708)), [0, 0, 1], 1e-4);
  });

  it('keeps the vernal equinox fixed', () => {
    close(eqToEcl([1, 0, 0]), [1, 0, 0]);
  });

  it('round-trips', () => {
    const v: Vec3 = [0.1, 0.7, -0.2];
    close(eclToEq(eqToEcl(v)), v);
  });
});

describe('astronomical (Z-up) → Three.js (Y-up)', () => {
  it('sends the frame north pole to screen up', () => {
    expect(toThree([0, 0, 1])).toEqual([0, 1, -0]);
  });

  it('is a proper rotation (preserves cross products, so no mirror image)', () => {
    const a: Vec3 = [0.2, 0.5, -0.3];
    const b: Vec3 = [-0.7, 0.1, 0.4];
    close(toThree(cross(a, b)), cross(toThree(a), toThree(b)));
  });

  it('round-trips', () => {
    close(fromThree(toThree([1, 2, 3])), [1, 2, 3]);
  });
});

describe('sphereTextureBasis', () => {
  it('is orthonormal and right-handed', () => {
    const { x, y, z } = sphereTextureBasis([0.9, 0.3, 0.2], [0.1, -0.2, 1]);
    close(cross(x, y), z);
    expect(Math.hypot(...x)).toBeCloseTo(1);
    expect(Math.hypot(...y)).toBeCloseTo(1);
  });
});
