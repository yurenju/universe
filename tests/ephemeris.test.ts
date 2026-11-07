import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { dot, normalize, sphereTextureBasis, toThree, type Vec3 } from '../src/core/frames';
import { earthBasisEcl, helioEcl, moonGeoEcl, sampleOrbit } from '../src/core/ephemeris';
import { basisToMatrix } from '../src/core/sphere';

const AU_KM = 149597870.7;

describe('planet positions', () => {
  it('Earth is at perihelion (~0.983 AU) in early January and aphelion (~1.017 AU) in early July', () => {
    expect(Math.hypot(...helioEcl('Earth', new Date('2025-01-04T00:00Z')))).toBeCloseTo(0.9833, 3);
    expect(Math.hypot(...helioEcl('Earth', new Date('2025-07-03T00:00Z')))).toBeCloseTo(1.0167, 3);
  });

  it('Earth stays in the ecliptic plane', () => {
    expect(Math.abs(helioEcl('Earth', new Date('2026-05-01T00:00Z'))[2])).toBeLessThan(1e-3);
  });

  it('at the March equinox the Sun is toward the vernal equinox (Earth is opposite, −X)', () => {
    const e = normalize(helioEcl('Earth', new Date('2025-03-20T09:01Z')));
    expect(e[0]).toBeLessThan(-0.9999);
  });

  it('the Moon is 356,000–407,000 km from Earth', () => {
    for (let d = 0; d < 60; d += 1.7) {
      const km = Math.hypot(...moonGeoEcl(new Date(Date.UTC(2026, 0, 1) + d * 864e5))) * AU_KM;
      expect(km).toBeGreaterThan(356000);
      expect(km).toBeLessThan(407000);
    }
  });

  it('sampled orbits close on themselves', () => {
    const pts = sampleOrbit('Mars', new Date('2026-01-01T00:00Z'), 128);
    const a = pts[0];
    const b = pts[pts.length - 1];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(0.02);
  });
});

describe('Earth orientation', () => {
  it('turns Greenwich toward the Sun around 12:00 UTC', () => {
    const date = new Date('2026-03-20T12:07Z'); // equation of time ≈ −7 min
    const sunDir = normalize(helioEcl('Earth', date).map((x) => -x) as Vec3);
    const { x } = earthBasisEcl(date);
    expect(dot(x, sunDir)).toBeGreaterThan(Math.cos((3 * Math.PI) / 180));
  });

  it('turns Greenwich away from the Sun around 00:00 UTC', () => {
    const date = new Date('2026-03-21T00:07Z');
    const sunDir = normalize(helioEcl('Earth', date).map((x) => -x) as Vec3);
    expect(dot(earthBasisEcl(date).x, sunDir)).toBeLessThan(-0.99);
  });
});

describe('SphereGeometry texture orientation', () => {
  // Find the geometry vertex closest to the given UV and return its oriented direction.
  function directionAtUv(u: number, v: number, matrix: THREE.Matrix4): THREE.Vector3 {
    const geo = new THREE.SphereGeometry(1, 64, 32);
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < uv.count; i++) {
      const d = (uv.getX(i) - u) ** 2 + (uv.getY(i) - v) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return new THREE.Vector3(pos.getX(best), pos.getY(best), pos.getZ(best)).applyMatrix4(matrix).normalize();
  }

  it('puts an Earth map’s 90°E column (u = 0.75) toward +90° longitude', () => {
    // Greenwich along +X, north along +Z (astronomical frame)
    const m = basisToMatrix(sphereTextureBasis([1, 0, 0], [0, 0, 1]));
    const d = directionAtUv(0.75, 0.5, m);
    const expected = new THREE.Vector3(...toThree([0, 1, 0]));
    expect(d.dot(expected)).toBeGreaterThan(0.999);
  });

  it('puts an Earth map’s top edge at the north pole', () => {
    const m = basisToMatrix(sphereTextureBasis([1, 0, 0], [0, 0, 1]));
    const d = directionAtUv(0.5, 1, m);
    expect(d.dot(new THREE.Vector3(...toThree([0, 0, 1])))).toBeGreaterThan(0.999);
  });

  it('needs U mirrored for a sky map seen from inside (l increases to the left in the image)', () => {
    // Galactic sky map: image u = 0.5 − l/360. Geometry u = 0.75 points at l = +90°.
    const m = basisToMatrix(sphereTextureBasis([1, 0, 0], [0, 0, 1]));
    const d = directionAtUv(0.75, 0.5, m);
    expect(d.dot(new THREE.Vector3(...toThree([0, 1, 0])))).toBeGreaterThan(0.999); // l = 90°
    const mirroredU = 1 - 0.75; // what mirrorForInsideView samples
    expect(mirroredU).toBeCloseTo(0.5 - 90 / 360);
  });
});
