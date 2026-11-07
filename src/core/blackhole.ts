// Schwarzschild black-hole geometry, in units of the Schwarzschild radius Rs.
//
// The lensing shader (src/render/lensing.ts) traces light with exactly the
// integrator below; the TypeScript copy exists so the numbers can be tested.

import type { Vec3 } from './frames';

export const G = 6.6743e-11;
export const C = 299792458;
export const M_SUN = 1.98847e30;
export const R_SUN = 6.957e8;

/** Schwarzschild radius in metres for a mass in solar masses. */
export function schwarzschildRadius(massSun: number): number {
  return (2 * G * massSun * M_SUN) / (C * C);
}

/** Photon sphere radius (Rs units). */
export const PHOTON_SPHERE = 1.5;
/** Critical impact parameter: rays with b below this fall in (Rs units). */
export const CRITICAL_IMPACT = (3 * Math.sqrt(3)) / 2;
/** Innermost stable circular orbit of a non-spinning hole (Rs units). */
export const ISCO = 3;

/** Weak-field (Einstein) deflection angle for impact parameter b ≫ 1 (Rs units). */
export function weakDeflection(b: number): number {
  return 2 / b;
}

/**
 * Deflection of a ray that never comes within the trace sphere: the
 * Schwarzschild series (M = Rs/2) to third order, 4M/b + 15πM²/4b² + 128M³/3b³.
 * The higher terms keep it continuous with the traced rays at the boundary.
 */
export function farDeflection(b: number): number {
  return 2 / b + (15 * Math.PI) / 16 / (b * b) + 16 / 3 / (b * b * b);
}

/** Rays are integrated only inside this radius; outside they are straight. */
export const TRACE_RADIUS = 60;
/** Step size as a fraction of the current radius. */
export const STEP_FRACTION = 0.04;
export const MAX_STEPS = 420;

export type TraceResult =
  | { kind: 'captured'; steps: number }
  | { kind: 'escaped'; dir: Vec3; pos: Vec3; steps: number }
  | { kind: 'unfinished'; steps: number };

/**
 * Trace a light ray starting at `pos` (Rs units) heading along unit `dir`.
 * Uses the standard trick: in Schwarzschild, a photon's spatial path obeys
 *   d²x/dλ² = −(3/2) h² x / r⁵,  h = |x × v|  (with Rs = 1),
 * integrated with RK4 at a step proportional to r. Optional `onStep` sees each
 * segment (used to find disk-plane crossings).
 */
export function traceRay(pos: Vec3, dir: Vec3, onStep?: (a: Vec3, b: Vec3) => boolean | void): TraceResult {
  let x: Vec3 = [...pos];
  let v: Vec3 = [...dir];
  const hv = cross(x, v);
  const h2 = hv[0] * hv[0] + hv[1] * hv[1] + hv[2] * hv[2];
  const acc = (p: Vec3): Vec3 => {
    const r2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
    const k = (-1.5 * h2) / (r2 * r2 * Math.sqrt(r2));
    return [p[0] * k, p[1] * k, p[2] * k];
  };
  for (let n = 0; n < MAX_STEPS; n++) {
    const r = Math.hypot(x[0], x[1], x[2]);
    if (r < 1) return { kind: 'captured', steps: n };
    if (r > TRACE_RADIUS && dotv(x, v) > 0) return { kind: 'escaped', dir: normalize(v), pos: x, steps: n };
    const dt = STEP_FRACTION * r;
    // RK4 on (x, v)
    const k1x = v;
    const k1v = acc(x);
    const x2 = add(x, k1x, dt / 2);
    const k2x = add(v, k1v, dt / 2);
    const k2v = acc(x2);
    const x3 = add(x, k2x, dt / 2);
    const k3x = add(v, k2v, dt / 2);
    const k3v = acc(x3);
    const x4 = add(x, k3x, dt);
    const k4x = add(v, k3v, dt);
    const k4v = acc(x4);
    const nx: Vec3 = [0, 1, 2].map((i) => x[i] + (dt / 6) * (k1x[i] + 2 * k2x[i] + 2 * k3x[i] + k4x[i])) as Vec3;
    const nv: Vec3 = [0, 1, 2].map((i) => v[i] + (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i])) as Vec3;
    if (onStep?.(x, nx)) return { kind: 'captured', steps: n };
    x = nx;
    v = nv;
  }
  return { kind: 'unfinished', steps: MAX_STEPS };
}

/**
 * Deflection (radians) of a ray coming in from far away with impact parameter
 * b. Measured from the polar angle the ray sweeps, so it is correct beyond π.
 * Returns NaN if the ray is captured.
 */
export function tracedDeflection(b: number): number {
  const R = TRACE_RADIUS * 0.999;
  const start: Vec3 = [-Math.sqrt(Math.max(R * R - b * b, 0)), b, 0];
  // unwrapped heading of each integration segment; starts at 0 (along +x)
  let heading = 0;
  const res = traceRay(start, [1, 0, 0], (p, q) => {
    const h = Math.atan2(q[1] - p[1], q[0] - p[0]);
    let d = h - heading;
    d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
    heading += d;
  });
  if (res.kind !== 'escaped') return NaN;
  // rays bend toward the hole (clockwise here), so the heading goes negative
  // tails beyond where the trace starts (R) and where it stops (TRACE_RADIUS)
  return -heading + outsideTail(b, R) + outsideTail(b, TRACE_RADIUS);
}

/**
 * Deflection a straight ray with impact parameter b picks up beyond radius R
 * on ONE side, under the same pull the tracer uses, |a⊥| = 1.5·b³ / r⁵:
 *   ∫ from √(R²−b²) to ∞ of 1.5·b³ (x² + b²)^(−5/2) dx.
 * Over the whole line this is 2/b, the Einstein angle.
 */
export function outsideTail(b: number, R = TRACE_RADIUS): number {
  if (b >= R) return weakDeflection(b) / 2;
  const x0 = Math.sqrt(R * R - b * b);
  return (1 - (x0 * (2 * x0 * x0 + 3 * b * b)) / (2 * R * R * R)) / b;
}

/** Keplerian orbital speed of disk gas at radius r (Rs units), as a fraction of c. */
export function diskSpeed(r: number): number {
  return Math.sqrt(1 / (2 * (r - 1)));
}

/** Relative disk brightness profile (Novikov–Thorne-like, zero inside the ISCO). */
export function diskTemperature(r: number): number {
  if (r <= ISCO) return 0;
  return Math.pow(r, -0.75) * Math.pow(1 - Math.sqrt(ISCO / r), 0.25);
}

/** Peak of diskTemperature (found numerically), used to normalise the disk's colour. */
export const DISK_PEAK = (() => {
  let best = 0;
  for (let r = ISCO; r < 20; r += 0.001) best = Math.max(best, diskTemperature(r));
  return best;
})();

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dotv(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function add(a: Vec3, b: Vec3, k: number): Vec3 {
  return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
}
function normalize(v: Vec3): Vec3 {
  const r = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / r, v[1] / r, v[2] / r];
}
