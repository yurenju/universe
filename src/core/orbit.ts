// Keplerian orbits seen on the sky.
//
// Visual-binary convention (used by the Sgr A* S-star papers and for
// Cygnus X-1 here):
//   - sky offsets are (east, north) = (Δα·cosδ, Δδ), plus `away` along the
//     line of sight, positive AWAY from the observer (positive radial velocity
//     means receding);
//   - i is the inclination: i < 90° moves counter-clockwise on the sky (position
//     angle increasing, north → east), i > 90° moves clockwise;
//   - Ω is the position angle (from north through east) of the ascending node,
//     the node where the body moves away from us;
//   - ω is measured from the ascending node to periapsis in the direction of
//     motion.

import { DEG, eqToGal, raDecToVec, type Vec3 } from './frames';

export interface OrbitElements {
  /** Semi-major axis, any length unit; positions come out in that unit. */
  a: number;
  e: number;
  /** Degrees. */
  i: number;
  /** Degrees, position angle of the ascending node. */
  Omega: number;
  /** Degrees, argument of periapsis. */
  omega: number;
  /** Time of periapsis passage, Julian years (e.g. 2018.38). */
  tPeri: number;
  /** Period, Julian years. */
  P: number;
}

export const JULIAN_YEAR_DAYS = 365.25;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

/** Date → decimal Julian year (2000.0 = J2000.0, 1 yr = 365.25 d). */
export function dateToJulianYear(date: Date): number {
  return 2000 + (date.getTime() - J2000_MS) / (86400000 * JULIAN_YEAR_DAYS);
}

/** Modified Julian Date → decimal Julian year. MJD 51544.5 = J2000.0. */
export function mjdToJulianYear(mjd: number): number {
  return 2000 + (mjd - 51544.5) / JULIAN_YEAR_DAYS;
}

/** Solve Kepler's equation M = E − e·sin E (radians). Robust up to e → 1. */
export function solveKepler(M: number, e: number): number {
  // wrap M into [−π, π]
  M = M - 2 * Math.PI * Math.round(M / (2 * Math.PI));
  let E = e < 0.8 ? M : Math.sign(M || 1) * Math.PI;
  for (let k = 0; k < 50; k++) {
    const f = E - e * Math.sin(E) - M;
    const d = f / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

/** True anomaly (radians) and radius at time t (Julian years). */
export function orbitalState(el: OrbitElements, t: number): { nu: number; r: number } {
  const M = (2 * Math.PI * (t - el.tPeri)) / el.P;
  const E = solveKepler(M, el.e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
  return { nu, r: el.a * (1 - el.e * Math.cos(E)) };
}

/** Sky-plane basis for a given true-anomaly position: returns [east, north, away]. */
function skyFromOrbitPlane(el: OrbitElements, nu: number, r: number): Vec3 {
  const O = el.Omega * DEG;
  const i = el.i * DEG;
  const u = el.omega * DEG + nu; // argument of latitude
  const north = r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i));
  const east = r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i));
  const away = r * Math.sin(u) * Math.sin(i);
  return [east, north, away];
}

/** Position at time t as [east, north, away] in units of `a`. */
export function skyPosition(el: OrbitElements, t: number): Vec3 {
  const { nu, r } = orbitalState(el, t);
  return skyFromOrbitPlane(el, nu, r);
}

/** Whole orbit as [east, north, away] points, evenly spaced in true anomaly. */
export function skyOrbit(el: OrbitElements, segments = 256): Vec3[] {
  const pts: Vec3[] = [];
  const p = el.a * (1 - el.e * el.e);
  for (let k = 0; k <= segments; k++) {
    const nu = (k / segments) * 2 * Math.PI;
    pts.push(skyFromOrbitPlane(el, nu, p / (1 + el.e * Math.cos(nu))));
  }
  return pts;
}

/**
 * Line-of-sight velocity (positive = receding) at time t, in units of a per
 * year. Multiply by (metres per a-unit) / (seconds per year) for m/s.
 */
export function radialVelocity(el: OrbitElements, t: number): number {
  const { nu } = orbitalState(el, t);
  const w = el.omega * DEG;
  const K = (2 * Math.PI * el.a * Math.sin(el.i * DEG)) / (el.P * Math.sqrt(1 - el.e * el.e));
  return K * (Math.cos(w + nu) + el.e * Math.cos(w));
}

/** Position angle (degrees, north through east, 0–360) of a sky offset. */
export function positionAngle(p: Vec3): number {
  const pa = Math.atan2(p[0], p[1]) / DEG;
  return pa < 0 ? pa + 360 : pa;
}

/**
 * Unit vectors, in the galactic frame, of the local sky axes at (RA, Dec):
 * east, north, and away (the line of sight from the Sun). (east, north, away)
 * is right-handed.
 */
export function skyBasisGal(raHours: number, decDeg: number): { east: Vec3; north: Vec3; away: Vec3 } {
  const a = raHours * 15 * DEG;
  const d = decDeg * DEG;
  const east: Vec3 = [-Math.sin(a), Math.cos(a), 0];
  const north: Vec3 = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  return { east: eqToGal(east), north: eqToGal(north), away: eqToGal(raDecToVec(raHours, decDeg)) };
}

/** [east, north, away] offsets → galactic-frame vector. */
export function skyToGal(basis: { east: Vec3; north: Vec3; away: Vec3 }, p: Vec3): Vec3 {
  const { east: e, north: n, away: w } = basis;
  return [
    p[0] * e[0] + p[1] * n[0] + p[2] * w[0],
    p[0] * e[1] + p[1] * n[1] + p[2] * w[1],
    p[0] * e[2] + p[1] * n[2] + p[2] * w[2],
  ];
}

/** Orbital period (years) from Kepler's third law: a in AU, total mass in M☉. */
export function keplerPeriodYears(aAU: number, massSun: number): number {
  return Math.sqrt((aAU * aAU * aAU) / massSun);
}

/** Unit orbital angular momentum direction as [east, north, away]. */
export function orbitNormalSky(el: OrbitElements): Vec3 {
  const O = el.Omega * DEG;
  const i = el.i * DEG;
  // r̂(u=0) = node direction, r̂(u=90°) = in-plane perpendicular; normal = their cross product
  const n0: Vec3 = [Math.sin(O), Math.cos(O), 0];
  const n1: Vec3 = [Math.cos(O) * Math.cos(i), -Math.sin(O) * Math.cos(i), Math.sin(i)];
  return [n0[1] * n1[2] - n0[2] * n1[1], n0[2] * n1[0] - n0[0] * n1[2], n0[0] * n1[1] - n0[1] * n1[0]];
}
