// Measured parameters of the two black holes with Close-ups.
// Sources are noted per value; see also DATA_CREDITS in credits.ts.

import { R_SUN } from '../core/blackhole';
import { mjdToJulianYear, type OrbitElements } from '../core/orbit';
import { METERS } from '../core/scale';

// ---------------------------------------------------------------- Cygnus X-1

export const CYG_X1 = {
  /** J2000 position (Gaia DR3 via SIMBAD). */
  raHours: 19 + 58 / 60 + 21.67574 / 3600,
  decDeg: 35 + 12 / 60 + 5.7845 / 3600,
  /** Miller-Jones et al. 2021, Science 371, 1046. */
  distanceKpc: 2.22,
  massBH: 21.2,
  massStar: 40.6,
  radiusStarSun: 22.3,
  /**
   * Orbital inclination 27.5° (Miller-Jones 2021), moving clockwise on the sky,
   * written as 180° − 27.5° in the visual-binary convention (the same
   * convention as the authors' astrometric fit, github.com/bersavosh/CygX-1_JMJ2021).
   */
  inclinationDeg: 180 - 27.51,
  /** Ascending node, set perpendicular to the jet (PA −26°), as in that fit. */
  OmegaDeg: 64.0,
  /** Brocksopp et al. 1999. */
  periodDays: 5.599829,
  /** MJD of the black hole's superior conjunction (the supergiant in front). */
  t0MJD: 41874.2,
  /** Position angle of the approaching radio jet (Stirling et al. 2001). */
  jetPADeg: -26,
  /** Projected radio-jet length ~15 mas → ~33 AU at 2.22 kpc (Stirling et al. 2001). */
  jetLengthAU: 33,
  /**
   * Accretion-disk outer radius. Not measured: the disk must fit inside ~70%
   * of the hole's Roche lobe (≲10 R☉); wind-fed disks are probably smaller.
   * We draw 5 R☉ (illustrative).
   */
  diskOuterSun: 5,
} as const;

/** Separation of the binary from Kepler's third law, in AU. */
export function cygX1SeparationAU(): number {
  const pYears = CYG_X1.periodDays / 365.25;
  return Math.cbrt((CYG_X1.massBH + CYG_X1.massStar) * pYears * pYears);
}

/**
 * Orbit of the supergiant around the black hole (relative orbit, circular),
 * with `a` in AU. Circular, so ω = 0 and "periapsis" is just the phase zero
 * point: the argument of latitude u = 2π(t − tPeri)/P. The star is nearest
 * us (in front) at u = −90°, which is phase 0, so tPeri = T0 + P/4.
 */
export function cygX1Orbit(): OrbitElements {
  const P = CYG_X1.periodDays / 365.25;
  return {
    a: cygX1SeparationAU(),
    e: 0,
    i: CYG_X1.inclinationDeg,
    Omega: CYG_X1.OmegaDeg,
    omega: 0,
    tPeri: mjdToJulianYear(CYG_X1.t0MJD) + P / 4,
    P,
  };
}

export const CYG_X1_STAR_RADIUS_M = CYG_X1.radiusStarSun * R_SUN;
export const CYG_X1_DISK_OUTER_M = CYG_X1.diskOuterSun * R_SUN;

// ------------------------------------------------------------- Sagittarius A*

export const SGR_A = {
  /** Reid & Brunthaler 2004 radio position. */
  raHours: 17 + 45 / 60 + 40.0409 / 3600,
  decDeg: -(29 + 0 / 60 + 28.118 / 3600),
  /** GRAVITY Collaboration 2022, A&A 657, L12. */
  massSun: 4.297e6,
  distancePc: 8277,
  /** EHT Collaboration 2022, ApJL 930, L12: ring diameter, μas. */
  ringDiameterMicroArcsec: 51.8,
} as const;

/** Metres per arcsecond at the Galactic Centre. */
export const SGR_A_M_PER_ARCSEC = SGR_A.distancePc * METERS.AU; // 1″ at d pc = d AU

export interface SStar {
  id: string;
  name: string;
  /** a in arcsec; P from Kepler's third law with SGR_A's mass and distance. */
  el: OrbitElements;
  /** Approximate stellar radius, R☉ (S2 is a B0–B2.5 V star). */
  radiusSun: number;
}

function sStar(id: string, a: number, e: number, i: number, Omega: number, omega: number, tPeri: number, radiusSun: number): SStar {
  const aAU = a * SGR_A.distancePc;
  const P = Math.sqrt((aAU * aAU * aAU) / SGR_A.massSun);
  return { id, name: id.toUpperCase(), el: { a, e, i, Omega, omega, tPeri, P }, radiusSun };
}

/** Orbital elements from GRAVITY Collaboration 2022, A&A 657, L12, Table B.1. */
export const S_STARS: SStar[] = [
  sStar('s2', 0.12495, 0.88441, 134.7, 228.19, 66.25, 2018.3789, 6),
  sStar('s29', 0.3975, 0.9693, 144.37, 7.0, 205.79, 2021.4104, 5),
  sStar('s38', 0.14254, 0.8145, 166.65, 109.45, 27.17, 2022.7044, 5),
  sStar('s55', 0.1044, 0.7267, 158.52, 314.94, 322.78, 2021.694, 4),
];
