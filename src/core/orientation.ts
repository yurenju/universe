import { DEG, cross, normalize, raDecToVec, type Vec3 } from './frames';

/**
 * Normal of a galaxy's disc in the equatorial frame, from where it sits on the
 * sky (RA hours, Dec degrees), its major-axis position angle (degrees east of
 * north) and its inclination (0° = face-on, 90° = edge-on).
 * The near/far side ambiguity is resolved arbitrarily.
 */
export function discNormalEq(raH: number, decDeg: number, paDeg: number, inclDeg: number): Vec3 {
  const los = raDecToVec(raH, decDeg); // from us to the galaxy
  const pole: Vec3 = [0, 0, 1];
  const east = normalize(cross(pole, los));
  const north = cross(los, east);
  const pa = paDeg * DEG;
  const major: Vec3 = [
    Math.cos(pa) * north[0] + Math.sin(pa) * east[0],
    Math.cos(pa) * north[1] + Math.sin(pa) * east[1],
    Math.cos(pa) * north[2] + Math.sin(pa) * east[2],
  ];
  const minor = cross(major, los); // on the sky, perpendicular to the major axis
  const i = inclDeg * DEG;
  // tilt the face-on normal (−los, toward us) about the major axis by i
  return normalize([
    -Math.cos(i) * los[0] + Math.sin(i) * minor[0],
    -Math.cos(i) * los[1] + Math.sin(i) * minor[1],
    -Math.cos(i) * los[2] + Math.sin(i) * minor[2],
  ]);
}
