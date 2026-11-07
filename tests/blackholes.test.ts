import { describe, expect, it } from 'vitest';
import {
  CYG_X1,
  CYG_X1_DISK_OUTER_M,
  CYG_X1_STAR_RADIUS_M,
  S_STARS,
  SGR_A,
  cygX1Orbit,
  cygX1SeparationAU,
} from '../src/content/blackholes';
import { eqToGal, raDecToVec, vecToSpherical, type Vec3 } from '../src/core/frames';
import {
  mjdToJulianYear,
  orbitNormalSky,
  orbitalState,
  positionAngle,
  radialVelocity,
  skyPosition,
} from '../src/core/orbit';
import { schwarzschildRadius } from '../src/core/blackhole';
import { METERS } from '../src/core/scale';

const AU_KM = 1.495978707e8;
const YEAR_S = 365.25 * 86400;

describe('Cygnus X-1', () => {
  const el = cygX1Orbit();
  const T0 = mjdToJulianYear(CYG_X1.t0MJD);

  it('sits at galactic l ≈ 71.3°, b ≈ +3.1°', () => {
    const g = vecToSpherical(eqToGal(raDecToVec(CYG_X1.raHours, CYG_X1.decDeg)));
    expect(g.lon).toBeCloseTo(71.33, 1);
    expect(g.lat).toBeCloseTo(3.07, 1);
  });

  it('is about 7,240 light-years away', () => {
    expect((CYG_X1.distanceKpc * 1e3 * METERS.PC) / METERS.LY).toBeCloseTo(7240, -2);
  });

  it('has a separation of ~0.24 AU (~52 R☉) with the star nearly touching the hole’s Roche lobe', () => {
    const a = cygX1SeparationAU();
    expect(a).toBeCloseTo(0.244, 2);
    const aM = a * METERS.AU;
    // star surface between the hole and the star, but the disk must not reach it
    expect(CYG_X1_STAR_RADIUS_M).toBeLessThan(aM);
    expect(CYG_X1_DISK_OUTER_M).toBeLessThan(aM - CYG_X1_STAR_RADIUS_M);
  });

  it('has the supergiant in front of the hole at phase 0 (T0) and behind it half a period later', () => {
    expect(skyPosition(el, T0)[2]).toBeLessThan(0);
    expect(skyPosition(el, T0)[2]).toBeCloseTo(-el.a * Math.sin(27.51 * Math.PI / 180), 6);
    expect(skyPosition(el, T0 + el.P / 2)[2]).toBeGreaterThan(0);
  });

  it('repeats every 5.6 days', () => {
    const t = T0 + 123.4567;
    const a = skyPosition(el, t);
    const b = skyPosition(el, t + el.P * 7);
    a.forEach((x, k) => expect(x).toBeCloseTo(b[k], 8));
    expect(orbitalState(el, t).r).toBeCloseTo(el.a, 12);
  });

  it('gives the supergiant an orbital radial-velocity amplitude near the measured ~75 km/s', () => {
    // star's own orbit is (M_BH / M_total) of the relative orbit
    let max = 0;
    for (let k = 0; k < 200; k++) max = Math.max(max, radialVelocity(el, T0 + (k / 200) * el.P));
    const kms = (max * AU_KM) / YEAR_S * (CYG_X1.massBH / (CYG_X1.massBH + CYG_X1.massStar));
    expect(kms).toBeGreaterThan(65);
    expect(kms).toBeLessThan(90);
  });

  it('points the approaching end of the orbit axis along the approaching jet (PA −26°)', () => {
    const n = orbitNormalSky(el);
    const approaching: Vec3 = n[2] < 0 ? n : [-n[0], -n[1], -n[2]];
    const pa = positionAngle(approaching);
    const want = (CYG_X1.jetPADeg + 360) % 360;
    expect(Math.abs(((pa - want + 540) % 360) - 180)).toBeLessThan(1);
  });

  it('has its axis 27.5° from our line of sight', () => {
    const n = orbitNormalSky(el);
    expect((Math.acos(Math.abs(n[2])) * 180) / Math.PI).toBeCloseTo(27.51, 1);
  });

  it('orbit normal agrees with the actual motion (r × v)', () => {
    const t = T0 + 0.1;
    const p = skyPosition(el, t);
    const q = skyPosition(el, t + 1e-5);
    const c: Vec3 = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const n = orbitNormalSky(el);
    expect(c[0] * n[0] + c[1] * n[1] + c[2] * n[2]).toBeGreaterThan(0);
  });
});

describe('Sgr A* and the S-stars (GRAVITY 2022)', () => {
  const s2 = S_STARS.find((s) => s.id === 's2')!;
  const auPerArcsec = SGR_A.distancePc;

  it('S2 period from Kepler’s law is ~16.05 years', () => {
    expect(s2.el.P).toBeCloseTo(16.05, 1);
  });

  it('S2 swings from about +4000 to about −2000 km/s around the 2018 pericentre', () => {
    const kms = (v: number) => (v * auPerArcsec * AU_KM) / YEAR_S;
    const vs: number[] = [];
    for (let t = 2017.5; t <= 2019; t += 0.002) vs.push(kms(radialVelocity(s2.el, t)));
    expect(Math.max(...vs)).toBeGreaterThan(3500);
    expect(Math.max(...vs)).toBeLessThan(4300);
    expect(Math.min(...vs)).toBeLessThan(-1500);
    expect(Math.min(...vs)).toBeGreaterThan(-2300);
  });

  it('S29 passed closest (~90 AU) in 2021', () => {
    const s29 = S_STARS.find((s) => s.id === 's29')!;
    const peri = orbitalState(s29.el, s29.el.tPeri).r * auPerArcsec;
    expect(peri).toBeGreaterThan(80);
    expect(peri).toBeLessThan(110);
  });

  it('all S-stars stay far outside the event horizon', () => {
    const rsAU = schwarzschildRadius(SGR_A.massSun) / METERS.AU;
    for (const s of S_STARS) expect(s.el.a * (1 - s.el.e) * auPerArcsec).toBeGreaterThan(500 * rsAU);
  });

  it('the EHT ring (~52 μas) is about 5 Rs across, as expected for a Schwarzschild shadow', () => {
    const rsM = schwarzschildRadius(SGR_A.massSun);
    const ringM = (SGR_A.ringDiameterMicroArcsec * 1e-6) * SGR_A.distancePc * METERS.AU;
    expect(ringM / rsM).toBeGreaterThan(4.5);
    expect(ringM / rsM).toBeLessThan(5.8);
  });
});

describe('Milky Way markers', () => {
  it('places Cygnus X-1 7.24 kly from the Sun toward l ≈ 71°', async () => {
    const { CYG_X1_KLY } = await import('../src/levels/milkyWay');
    const g = vecToSpherical(CYG_X1_KLY);
    expect(g.r).toBeCloseTo(7.24, 1);
    expect(g.lon).toBeCloseTo(71.33, 1);
  });
});
