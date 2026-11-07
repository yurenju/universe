// Coordinate frames.
//
// Astronomical frames are right-handed with Z toward the frame's north pole:
//   EQ  – J2000 equatorial: X → vernal equinox, Z → celestial north pole
//   ECL – J2000 ecliptic:   X → vernal equinox, Z → ecliptic north pole
//   GAL – galactic:         X → galactic centre, Y → l = 90°, Z → north galactic pole
//
// Three.js scenes are Y-up. Every level scene maps its frame's (x, y, z) to
// Three's (x, z, -y), which is a proper rotation (keeps handedness), so the
// frame's north pole points "up" on screen.

export type Vec3 = [number, number, number];

export const DEG = Math.PI / 180;

/** Mean obliquity of the ecliptic at J2000, degrees. */
export const OBLIQUITY_J2000 = 23.4392911;

/** J2000 equatorial → galactic rotation matrix (rows). */
export const EQ_TO_GAL: readonly Vec3[] = [
  [-0.0548755604, -0.873437090, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

export function mulMat(m: readonly Vec3[], v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function transpose(m: readonly Vec3[]): Vec3[] {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

export const GAL_TO_EQ: readonly Vec3[] = transpose(EQ_TO_GAL);

/** Rotate equatorial → ecliptic (rotation about X by +obliquity). */
export function eqToEcl(v: Vec3): Vec3 {
  const e = OBLIQUITY_J2000 * DEG;
  const c = Math.cos(e);
  const s = Math.sin(e);
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]];
}

export function eclToEq(v: Vec3): Vec3 {
  const e = OBLIQUITY_J2000 * DEG;
  const c = Math.cos(e);
  const s = Math.sin(e);
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
}

export function eqToGal(v: Vec3): Vec3 {
  return mulMat(EQ_TO_GAL, v);
}

export function galToEq(v: Vec3): Vec3 {
  return mulMat(GAL_TO_EQ, v);
}

export function galToEcl(v: Vec3): Vec3 {
  return eqToEcl(galToEq(v));
}

/** Astronomical (Z-up) frame → Three.js (Y-up) scene coordinates. */
export function toThree(v: Vec3): Vec3 {
  return [v[0], v[2], -v[1]];
}

export function fromThree(v: Vec3): Vec3 {
  return [v[0], -v[2], v[1]];
}

/** Unit vector from spherical angles in degrees (lon/RA/l, lat/Dec/b). */
export function sphericalToVec(lonDeg: number, latDeg: number, r = 1): Vec3 {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
}

/** Galactic longitude/latitude (deg) and distance → galactic Cartesian. */
export function galacticToVec(lDeg: number, bDeg: number, dist: number): Vec3 {
  return sphericalToVec(lDeg, bDeg, dist);
}

/** RA in hours, Dec in degrees → equatorial unit vector. */
export function raDecToVec(raHours: number, decDeg: number, r = 1): Vec3 {
  return sphericalToVec(raHours * 15, decDeg, r);
}

export function vecToSpherical(v: Vec3): { lon: number; lat: number; r: number } {
  const r = Math.hypot(v[0], v[1], v[2]);
  let lon = Math.atan2(v[1], v[0]) / DEG;
  if (lon < 0) lon += 360;
  const lat = Math.asin(v[2] / r) / DEG;
  return { lon, lat, r };
}

/**
 * Orthonormal basis (columns, in the given frame) for orienting an
 * equirectangular-textured THREE.SphereGeometry so that the texture's centre
 * column (u = 0.5, longitude 0) faces `primeDir` and the texture's top faces
 * `northDir`.
 *
 * THREE.SphereGeometry puts u = 0.5 on local +X, the north pole on local +Y,
 * and increasing longitude (east) toward local −Z. So:
 *   local X → primeDir, local Y → north, local Z → −east = north × primeDir … negated
 */
export function sphereTextureBasis(primeDir: Vec3, northDir: Vec3): { x: Vec3; y: Vec3; z: Vec3 } {
  const n = normalize(northDir);
  // make prime orthogonal to north
  const d = dot(primeDir, n);
  const p = normalize([primeDir[0] - d * n[0], primeDir[1] - d * n[1], primeDir[2] - d * n[2]]);
  const east = cross(n, p);
  return { x: p, y: n, z: [-east[0], -east[1], -east[2]] };
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function normalize(v: Vec3): Vec3 {
  const r = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / r, v[1] / r, v[2] / r];
}

export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
