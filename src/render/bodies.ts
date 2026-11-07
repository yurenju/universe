import * as THREE from 'three';
import { DEG, eqToEcl, raDecToVec, sphereTextureBasis, type Vec3 } from '../core/frames';
import { basisToMatrix } from '../core/sphere';
import { loadTexture } from './assets';

export interface BodySpec {
  key: string;
  radiusKm: number;
  texture?: string;
  fallbackColor: THREE.ColorRepresentation;
  /** IAU north pole, equatorial J2000. */
  poleRaDeg: number;
  poleDecDeg: number;
  /** Sidereal rotation period, hours (negative = retrograde). */
  rotationHours: number;
}

export const BODY_SPECS: Record<string, BodySpec> = {
  Sun: { key: 'Sun', radiusKm: 695700, texture: 'textures/sun.jpg', fallbackColor: 0xffcc66, poleRaDeg: 286.13, poleDecDeg: 63.87, rotationHours: 609.12 },
  Mercury: { key: 'Mercury', radiusKm: 2439.7, texture: 'textures/mercury.jpg', fallbackColor: 0x9a8f86, poleRaDeg: 281.01, poleDecDeg: 61.41, rotationHours: 1407.6 },
  Venus: { key: 'Venus', radiusKm: 6051.8, texture: 'textures/venus.jpg', fallbackColor: 0xe8cf9b, poleRaDeg: 272.76, poleDecDeg: 67.16, rotationHours: -5832.5 },
  Earth: { key: 'Earth', radiusKm: 6371, texture: 'textures/earth_day.jpg', fallbackColor: 0x3b6fb6, poleRaDeg: 0, poleDecDeg: 90, rotationHours: 23.9345 },
  Moon: { key: 'Moon', radiusKm: 1737.4, texture: 'textures/moon.jpg', fallbackColor: 0x9a9a9a, poleRaDeg: 270, poleDecDeg: 66.54, rotationHours: 655.72 },
  Mars: { key: 'Mars', radiusKm: 3389.5, texture: 'textures/mars.jpg', fallbackColor: 0xc1663b, poleRaDeg: 317.68, poleDecDeg: 52.89, rotationHours: 24.6229 },
  Jupiter: { key: 'Jupiter', radiusKm: 69911, texture: 'textures/jupiter.jpg', fallbackColor: 0xd8b48a, poleRaDeg: 268.06, poleDecDeg: 64.5, rotationHours: 9.925 },
  Saturn: { key: 'Saturn', radiusKm: 58232, texture: 'textures/saturn.jpg', fallbackColor: 0xe3cf9f, poleRaDeg: 40.59, poleDecDeg: 83.54, rotationHours: 10.656 },
  Uranus: { key: 'Uranus', radiusKm: 25362, texture: 'textures/uranus.jpg', fallbackColor: 0xa6dbe3, poleRaDeg: 257.31, poleDecDeg: -15.18, rotationHours: -17.24 },
  Neptune: { key: 'Neptune', radiusKm: 24622, texture: 'textures/neptune.jpg', fallbackColor: 0x4f77d8, poleRaDeg: 299.36, poleDecDeg: 43.46, rotationHours: 16.11 },
  Pluto: { key: 'Pluto', radiusKm: 1188.3, fallbackColor: 0xcbb59c, poleRaDeg: 132.99, poleDecDeg: -6.16, rotationHours: -153.29 },
};

/** Pole direction in the ecliptic frame. */
export function poleEcl(spec: BodySpec): Vec3 {
  return eqToEcl(raDecToVec(spec.poleRaDeg / 15, spec.poleDecDeg));
}

/**
 * Orientation of a spinning body at a date: texture prime meridian rotated
 * about the pole. (Spin phase is illustrative except for Earth.)
 */
export function spinBasis(spec: BodySpec, date: Date): { x: Vec3; y: Vec3; z: Vec3 } {
  const pole = poleEcl(spec);
  // any reference direction perpendicular to the pole
  const ref: Vec3 = Math.abs(pole[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const b0 = sphereTextureBasis(ref, pole);
  const hours = date.getTime() / 3.6e6;
  const a = ((hours / spec.rotationHours) % 1) * 2 * Math.PI;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // rotate prime meridian eastward about the pole: east = −z
  const x: Vec3 = [b0.x[0] * c - b0.z[0] * s, b0.x[1] * c - b0.z[1] * s, b0.x[2] * c - b0.z[2] * s];
  return sphereTextureBasis(x, pole);
}

export async function texturedSphere(spec: BodySpec, radius: number, lit = true, segments = 64): Promise<THREE.Mesh> {
  const map = spec.texture ? await loadTexture(spec.texture) : null;
  const mat = lit
    ? new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : spec.fallbackColor, roughness: 1, metalness: 0 })
    : new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : spec.fallbackColor });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, segments / 2), mat);
  mesh.scale.setScalar(radius);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** Set a body mesh's matrix: position, orientation basis, uniform scale. */
export function placeBody(mesh: THREE.Object3D, pos: THREE.Vector3, basis: { x: Vec3; y: Vec3; z: Vec3 }, scale: number): void {
  const m = basisToMatrix(basis, mesh.matrix);
  m.scale(new THREE.Vector3(scale, scale, scale));
  m.setPosition(pos);
  mesh.matrixWorldNeedsUpdate = true;
}

/** Saturn's rings with radially mapped texture. Radii in planet radii. */
export async function saturnRings(): Promise<THREE.Mesh> {
  const inner = 1.239;
  const outer = 2.27;
  const geo = new THREE.RingGeometry(inner, outer, 180, 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  // RingGeometry lies in local XY; rotate so the ring plane is the planet's equator (local XZ)
  geo.rotateX(-Math.PI / 2);
  const tex = await loadTexture('textures/saturn_ring.png');
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    color: tex ? 0xffffff : 0xcbb48a,
    transparent: true,
    opacity: tex ? 1 : 0.6,
    side: THREE.DoubleSide,
    roughness: 1,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

export const ROT_DEG = DEG;
