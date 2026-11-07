import * as THREE from 'three';
import { toThree, type Vec3 } from './frames';

/**
 * Rotation matrix (Three.js scene coordinates) that maps a mesh's local axes
 * onto the given basis, expressed in an astronomical (Z-up) frame.
 */
export function basisToMatrix(basis: { x: Vec3; y: Vec3; z: Vec3 }, out = new THREE.Matrix4()): THREE.Matrix4 {
  const x = toThree(basis.x);
  const y = toThree(basis.y);
  const z = toThree(basis.z);
  return out.makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z));
}

/**
 * Configure a texture that is drawn on the inside of a sphere (a sky map).
 * Sky maps are printed as seen from inside – longitude increasing to the
 * left – while SphereGeometry's U increases with longitude. Mirror U.
 */
export function mirrorForInsideView(tex: THREE.Texture): THREE.Texture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = -1;
  tex.offset.x = 1;
  return tex;
}
