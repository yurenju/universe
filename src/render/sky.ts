import * as THREE from 'three';
import { bvToRgb } from '../core/color';
import { eqToEcl, eqToGal, galToEcl, sphereTextureBasis, toThree, type Vec3 } from '../core/frames';
import { basisToMatrix, mirrorForInsideView } from '../core/sphere';
import { loadFloat32, loadTexture } from './assets';
import { createPoints, createPointsMaterial } from './points';

export type SkyFrame = 'ecl' | 'gal';

let skyData: Promise<Float32Array> | null = null;

/**
 * The night sky as seen from the Sun's neighbourhood: real naked-eye stars
 * (HYG) plus the Gaia/ESO Milky Way panorama if available. Directions only –
 * it sits "at infinity" and follows the camera.
 */
export class Sky {
  readonly group = new THREE.Group();
  private starMaterial = createPointsMaterial({ minSize: 1.2, maxSize: 7, softness: 2.5 });
  private panoMaterial: THREE.MeshBasicMaterial | null = null;

  constructor(
    private frame: SkyFrame,
    private panoramaOpacity = 0.55,
    private showStars = true,
  ) {
    this.group.renderOrder = -10;
  }

  async load(): Promise<void> {
    skyData ??= loadFloat32('data/sky.bin');
    const [data, pano] = await Promise.all([skyData, loadTexture('textures/milkyway_sky.jpg')]);

    const n = data.length / 5;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const eq: Vec3 = [data[i * 5], data[i * 5 + 1], data[i * 5 + 2]];
      const mag = data[i * 5 + 3];
      const ci = data[i * 5 + 4];
      const v = toThree(this.frame === 'ecl' ? eqToEcl(eq) : eqToGal(eq));
      pos.set(v, i * 3);
      const flux = Math.pow(10, -0.4 * (mag - 1.0));
      const [r, g, b] = bvToRgb(ci);
      const k = Math.min(2.2, 0.25 + flux * 0.9);
      col.set([r * k, g * k, b * k], i * 3);
      size[i] = Math.max(1.6, Math.min(6.5, 4.2 - 0.55 * mag + 1.5));
    }
    if (this.showStars) {
      const stars = createPoints(pos, col, size, this.starMaterial);
      stars.renderOrder = -9;
      this.group.add(stars);
    }

    if (pano) {
      mirrorForInsideView(pano);
      this.panoMaterial = new THREE.MeshBasicMaterial({
        map: pano,
        side: THREE.BackSide,
        transparent: true,
        opacity: this.panoramaOpacity,
        depthWrite: false,
        depthTest: false,
      });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.02, 64, 32), this.panoMaterial);
      const prime: Vec3 = this.frame === 'ecl' ? galToEcl([1, 0, 0]) : [1, 0, 0];
      const north: Vec3 = this.frame === 'ecl' ? galToEcl([0, 0, 1]) : [0, 0, 1];
      sphere.matrixAutoUpdate = false;
      sphere.matrix.copy(basisToMatrix(sphereTextureBasis(prime, north)));
      sphere.renderOrder = -11;
      this.group.add(sphere);
    }
  }

  /** Keep the sky centred on the camera and inside its far plane. */
  update(camera: THREE.PerspectiveCamera, opacity = 1): void {
    // near = 1e-3 × camera distance (see Engine); keep the sky at a modest
    // multiple of that so vertex values stay well inside float precision.
    this.group.position.copy(camera.position);
    this.group.scale.setScalar(camera.near * 1e6);
    this.starMaterial.uniforms.uOpacity.value = opacity;
    if (this.panoMaterial) this.panoMaterial.opacity = this.panoramaOpacity * opacity;
  }
}
