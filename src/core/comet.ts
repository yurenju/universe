// Periodic Comets on heliocentric orbits (see ADR 0003).
//
// The orbit's shape comes from one set of J2000 ecliptic elements; where on it
// the comet is comes from a table of Returns (perihelion passages). Between two tabulated
// Returns the mean anomaly runs linearly from 0 to 2π, so the comet is at
// perihelion exactly on every tabulated date even though the real period drifts.
// Outside the table, Returns are extrapolated with the Keplerian period and
// flagged as approximate.

import { DEG, type Vec3 } from './frames';
import { solveKepler } from './orbit';

export interface CometOrbit {
  /** Semi-major axis, AU. */
  a: number;
  e: number;
  /** Inclination to the J2000 ecliptic, degrees (> 90° is retrograde). */
  i: number;
  /** Longitude of the ascending node, degrees. */
  Omega: number;
  /** Argument of perihelion, degrees. */
  omega: number;
}

export interface Return {
  /** Perihelion passage, ms since the Unix epoch. */
  time: number;
  /** Extrapolated past the Return table, not observed or published. */
  approx: boolean;
}

const DAY_MS = 864e5;
const YEAR_MS = 365.25 * DAY_MS;

/** Keplerian period in ms (a in AU, Sun's mass only). */
export function periodMs(orbit: CometOrbit): number {
  return Math.pow(orbit.a, 1.5) * YEAR_MS;
}

export function perihelionAu(orbit: CometOrbit): number {
  return orbit.a * (1 - orbit.e);
}

export function aphelionAu(orbit: CometOrbit): number {
  return orbit.a * (1 + orbit.e);
}

/**
 * The Returns on either side of `t`: `prev` ≤ t < `next`. `returns` must be sorted
 * and non-empty.
 */
export function bracketReturns(returns: readonly number[], orbit: CometOrbit, t: number): { prev: Return; next: Return } {
  const P = periodMs(orbit);
  const first = returns[0];
  const last = returns[returns.length - 1];
  if (t < first) {
    const n = Math.ceil((first - t) / P);
    const prev = first - n * P;
    const next = n === 1 ? first : prev + P;
    return { prev: { time: prev, approx: true }, next: { time: next, approx: n !== 1 } };
  }
  if (t >= last) {
    const n = Math.floor((t - last) / P);
    const prev = last + n * P;
    return { prev: { time: prev, approx: n !== 0 }, next: { time: prev + P, approx: true } };
  }
  let k = 0;
  while (returns[k + 1] <= t) k++;
  // A gap in the table may span several orbits (Halley 1066 → 1835): split it into
  // equal orbits; the Returns in between are approximate.
  const a = returns[k];
  const b = returns[k + 1];
  const n = Math.max(1, Math.round((b - a) / P));
  const step = (b - a) / n;
  const j = Math.min(n - 1, Math.floor((t - a) / step));
  return {
    prev: { time: j === 0 ? a : a + j * step, approx: j !== 0 },
    next: { time: j === n - 1 ? b : a + (j + 1) * step, approx: j !== n - 1 },
  };
}

/** Point on the orbit at true anomaly ν, heliocentric J2000 ecliptic, AU. */
export function orbitPoint(orbit: CometOrbit, nu: number): Vec3 {
  const { a, e } = orbit;
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
  const O = orbit.Omega * DEG;
  const i = orbit.i * DEG;
  const u = orbit.omega * DEG + nu;
  return [
    r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i)),
    r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i)),
    r * Math.sin(u) * Math.sin(i),
  ];
}

/** Heliocentric J2000 ecliptic position (AU) at time t (ms). */
export function cometPosition(orbit: CometOrbit, returns: readonly number[], t: number): Vec3 {
  const { prev, next } = bracketReturns(returns, orbit, t);
  const M = (2 * Math.PI * (t - prev.time)) / (next.time - prev.time);
  const E = solveKepler(M, orbit.e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + orbit.e) * Math.sin(E / 2), Math.sqrt(1 - orbit.e) * Math.cos(E / 2));
  return orbitPoint(orbit, nu);
}

/** Whole orbit as points evenly spaced in eccentric anomaly (dense near perihelion and aphelion alike). */
export function sampleCometOrbit(orbit: CometOrbit, segments = 512): Vec3[] {
  const pts: Vec3[] = [];
  for (let k = 0; k <= segments; k++) {
    const E = (k / segments) * 2 * Math.PI;
    const nu = 2 * Math.atan2(Math.sqrt(1 + orbit.e) * Math.sin(E / 2), Math.sqrt(1 - orbit.e) * Math.cos(E / 2));
    pts.push(orbitPoint(orbit, nu));
  }
  return pts;
}

/** Semi-major axes of the planets, AU, inner to outer. */
const PLANET_ORBITS: readonly [string, number][] = [
  ['水星', 0.387],
  ['金星', 0.723],
  ['地球', 1.0],
  ['火星', 1.524],
  ['木星', 5.203],
  ['土星', 9.537],
  ['天王星', 19.19],
  ['海王星', 30.07],
];

/** Where a distance from the Sun falls among the planets' orbits, e.g. "金星與地球軌道之間". */
export function amongPlanets(au: number): string {
  const [firstName, firstA] = PLANET_ORBITS[0];
  if (au < firstA) return `${firstName}軌道內`;
  for (let k = 1; k < PLANET_ORBITS.length; k++) {
    const [name, a] = PLANET_ORBITS[k];
    const [inner, innerA] = PLANET_ORBITS[k - 1];
    if (Math.abs(au - a) / a < 0.04) return `${name}軌道附近`;
    if (Math.abs(au - innerA) / innerA < 0.04) return `${inner}軌道附近`;
    if (au < a) return `${inner}與${name}軌道之間`;
  }
  return `${PLANET_ORBITS[PLANET_ORBITS.length - 1][0]}軌道外`;
}

/** "X 年 Y 個月" (or days, when under a month) between two times. */
export function formatSpan(ms: number): string {
  const days = Math.abs(ms) / DAY_MS;
  if (days < 1) return '不到 1 天';
  if (days < 31) return `${Math.floor(days)} 天`;
  const months = Math.floor(days / (YEAR_MS / DAY_MS / 12));
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} 個月`;
  return m ? `${y} 年 ${m} 個月` : `${y} 年`;
}
