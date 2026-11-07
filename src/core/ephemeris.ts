import * as Astronomy from 'astronomy-engine';
import { DEG, eqToEcl, sphereTextureBasis, type Vec3 } from './frames';

export type PlanetName =
  | 'Mercury'
  | 'Venus'
  | 'Earth'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto';

export const PLANETS: readonly PlanetName[] = [
  'Mercury',
  'Venus',
  'Earth',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
];

/** Sidereal orbital periods in days. */
export const ORBITAL_PERIOD_DAYS: Record<PlanetName, number> = {
  Mercury: 87.969,
  Venus: 224.701,
  Earth: 365.256,
  Mars: 686.98,
  Jupiter: 4332.59,
  Saturn: 10759.22,
  Uranus: 30688.5,
  Neptune: 60195,
  Pluto: 90560,
};

/** Heliocentric position in the J2000 ecliptic frame, AU. */
export function helioEcl(body: PlanetName, date: Date): Vec3 {
  const v = Astronomy.HelioVector(Astronomy.Body[body], date);
  return eqToEcl([v.x, v.y, v.z]);
}

/** Geocentric Moon position in the J2000 ecliptic frame, AU. */
export function moonGeoEcl(date: Date): Vec3 {
  const v = Astronomy.GeoMoon(date);
  return eqToEcl([v.x, v.y, v.z]);
}

/** Greenwich apparent sidereal time, degrees. */
export function siderealDeg(date: Date): number {
  return Astronomy.SiderealTime(date) * 15;
}

/**
 * Basis (in the ecliptic frame) that orients an equirectangular Earth texture
 * on a THREE.SphereGeometry: x → Greenwich meridian on the equator, y → north
 * pole, z completes the basis (see sphereTextureBasis).
 */
export function earthBasisEcl(date: Date): { x: Vec3; y: Vec3; z: Vec3 } {
  const g = siderealDeg(date) * DEG;
  const greenwich = eqToEcl([Math.cos(g), Math.sin(g), 0]);
  const north = eqToEcl([0, 0, 1]);
  return sphereTextureBasis(greenwich, north);
}

/** Sample a closed orbit as heliocentric ecliptic points (AU). */
export function sampleOrbit(body: PlanetName, start: Date, samples = 256): Vec3[] {
  const period = ORBITAL_PERIOD_DAYS[body] * 86400e3;
  const pts: Vec3[] = [];
  for (let i = 0; i <= samples; i++) {
    pts.push(helioEcl(body, new Date(start.getTime() + (period * i) / samples)));
  }
  return pts;
}

export function sampleMoonOrbit(start: Date, samples = 256): Vec3[] {
  const period = 27.321661 * 86400e3;
  const pts: Vec3[] = [];
  for (let i = 0; i <= samples; i++) pts.push(moonGeoEcl(new Date(start.getTime() + (period * i) / samples)));
  return pts;
}
