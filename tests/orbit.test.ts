import { describe, expect, it } from 'vitest';
import { cross, eqToGal, raDecToVec, vecToSpherical, type Vec3 } from '../src/core/frames';
import {
  dateToJulianYear,
  keplerPeriodYears,
  mjdToJulianYear,
  orbitalState,
  positionAngle,
  radialVelocity,
  skyBasisGal,
  skyOrbit,
  skyPosition,
  skyToGal,
  solveKepler,
  type OrbitElements,
} from '../src/core/orbit';

const AU_KM = 1.495978707e8;
const YEAR_S = 365.25 * 86400;

describe('time conversions', () => {
  it('J2000.0 is 2000.0', () => {
    expect(dateToJulianYear(new Date(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(2000, 10);
    expect(mjdToJulianYear(51544.5)).toBeCloseTo(2000, 10);
  });

  it('one Julian year later is 2001.0', () => {
    expect(mjdToJulianYear(51544.5 + 365.25)).toBeCloseTo(2001, 10);
  });
});

describe('solveKepler', () => {
  it('solves M = E − e sin E even for e close to 1', () => {
    for (const e of [0, 0.3, 0.88, 0.97, 0.999]) {
      for (let M = -3.1; M <= 3.1; M += 0.137) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
    }
  });
});

describe('orbit geometry', () => {
  const el: OrbitElements = { a: 1, e: 0.6, i: 40, Omega: 30, omega: 70, tPeri: 2000, P: 10 };

  it('is at periapsis distance a(1−e) at tPeri and apoapsis half a period later', () => {
    expect(orbitalState(el, 2000).r).toBeCloseTo(0.4, 10);
    expect(orbitalState(el, 2005).r).toBeCloseTo(1.6, 10);
    expect(orbitalState(el, 2010).r).toBeCloseTo(0.4, 10);
  });

  it('keeps the 3D distance equal to r (the sky projection is a rotation)', () => {
    for (let t = 2000; t < 2010; t += 0.71) {
      const p = skyPosition(el, t);
      expect(Math.hypot(...p)).toBeCloseTo(orbitalState(el, t).r, 10);
    }
  });

  it('crosses the sky plane moving away at the ascending node (position angle Ω)', () => {
    const pts = skyOrbit(el, 4096);
    const k = pts.findIndex((p, j) => j > 0 && pts[j - 1][2] < 0 && p[2] >= 0);
    expect(k).toBeGreaterThan(0);
    expect(positionAngle(pts[k])).toBeCloseTo(30, 0);
  });

  it('moves counter-clockwise on the sky (PA increasing) for i < 90° and clockwise for i > 90°', () => {
    const dPA = (o: OrbitElements) => {
      const a = positionAngle(skyPosition(o, 2003));
      const b = positionAngle(skyPosition(o, 2003.01));
      let d = b - a;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      return d;
    };
    expect(dPA(el)).toBeGreaterThan(0);
    expect(dPA({ ...el, i: 140 })).toBeLessThan(0);
  });

  it('radial velocity is the time derivative of the line-of-sight distance', () => {
    for (const t of [2000.3, 2004, 2008.8]) {
      const h = 1e-6;
      const numeric = (skyPosition(el, t + h)[2] - skyPosition(el, t - h)[2]) / (2 * h);
      expect(radialVelocity(el, t)).toBeCloseTo(numeric, 5);
    }
  });
});

describe('sky basis', () => {
  it('is right-handed with "away" pointing from the Sun to the target', () => {
    const b = skyBasisGal(17.761, -29.008); // Sgr A*
    const c = cross(b.east, b.north);
    c.forEach((x, i) => expect(x).toBeCloseTo(b.away[i], 7)); // EQ_TO_GAL has ~10 significant digits
    const g = vecToSpherical(b.away);
    expect(Math.min(g.lon, 360 - g.lon)).toBeLessThan(0.1);
  });

  it('puts "north" toward the north celestial pole', () => {
    const b = skyBasisGal(5, 10);
    const ncp = eqToGal([0, 0, 1]);
    const dotN = b.north[0] * ncp[0] + b.north[1] * ncp[1] + b.north[2] * ncp[2];
    expect(dotN).toBeGreaterThan(0.9);
  });

  it('puts "east" toward increasing right ascension', () => {
    const b = skyBasisGal(5, 10);
    const ahead = eqToGal(raDecToVec(5.01, 10));
    const here = eqToGal(raDecToVec(5, 10));
    const step: Vec3 = [ahead[0] - here[0], ahead[1] - here[1], ahead[2] - here[2]];
    expect(step[0] * b.east[0] + step[1] * b.east[1] + step[2] * b.east[2]).toBeGreaterThan(0);
  });

  it('maps an "away" offset to the far side of the target', () => {
    const b = skyBasisGal(17.761, -29.008);
    const p = skyToGal(b, [0, 0, 1]);
    expect(p[0]).toBeGreaterThan(0.99); // galactic +X = toward the centre, i.e. farther from us
  });
});

describe('S2 around Sgr A* (sanity checks against published behaviour)', () => {
  // GRAVITY Collaboration 2020, A&A 636, L5 (a in arcsec)
  const S2: OrbitElements = { a: 0.1254, e: 0.88466, i: 134.567, Omega: 228.171, omega: 66.263, tPeri: 2018.379, P: 16.0455 };
  const distAU = 8248.6 / 1; // R0 ≈ 8.249 kpc → 1″ = 8249 AU
  const aAU = S2.a * distAU;
  const kms = (v: number) => (v * distAU * AU_KM) / YEAR_S;

  it('has a period consistent with Kepler’s third law for ~4.3 million M☉', () => {
    expect(keplerPeriodYears(aAU, 4.26e6)).toBeCloseTo(S2.P, 0);
  });

  it('comes within ~120 AU of the black hole', () => {
    expect(aAU * (1 - S2.e)).toBeGreaterThan(110);
    expect(aAU * (1 - S2.e)).toBeLessThan(130);
  });

  it('swings from about +4000 km/s to about −2000 km/s around the 2018 pericentre', () => {
    const vs: number[] = [];
    for (let t = 2017.5; t <= 2019; t += 0.002) vs.push(kms(radialVelocity(S2, t)));
    expect(Math.max(...vs)).toBeGreaterThan(3500);
    expect(Math.max(...vs)).toBeLessThan(4300);
    expect(Math.min(...vs)).toBeLessThan(-1500);
    expect(Math.min(...vs)).toBeGreaterThan(-2300);
    // and it is receding before pericentre, approaching after
    expect(kms(radialVelocity(S2, 2018.2))).toBeGreaterThan(0);
    expect(kms(radialVelocity(S2, 2018.6))).toBeLessThan(0);
  });

  it('moves clockwise on the sky', () => {
    const a = positionAngle(skyPosition(S2, 2010));
    const b = positionAngle(skyPosition(S2, 2010.5));
    expect(((b - a + 540) % 360) - 180).toBeLessThan(0);
  });
});
