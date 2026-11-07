import * as THREE from 'three';
import { DEG, eqToEcl, normalize, raDecToVec, toThree, type Vec3 } from '../core/frames';
import type { FrameContext } from '../core/level';
import { METERS } from '../core/scale';
import { gaussian, mulberry32 } from '../render/assets';
import { createPoints, createPointsMaterial, updatePointsScale } from '../render/points';
import { glowSprite, glowTexture, planeCircle, polyline } from '../render/primitives';
import { Sky } from '../render/sky';
import { BaseLevel } from './base';

export const AU_PER_LY = METERS.LY / METERS.AU; // ≈ 63,241

/** Points of a Keplerian orbit (a in AU, angles in degrees) in the ecliptic frame. */
export function keplerOrbit(a: number, e: number, iDeg: number, nodeDeg: number, periDeg: number, samples = 512): Vec3[] {
  const pts: Vec3[] = [];
  const i = iDeg * DEG;
  const O = nodeDeg * DEG;
  const w = periDeg * DEG;
  for (let k = 0; k <= samples; k++) {
    const E = (k / samples) * 2 * Math.PI; // eccentric anomaly
    const xo = a * (Math.cos(E) - e);
    const yo = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
    pts.push([
      (cO * cw - sO * sw * ci) * xo + (-cO * sw - sO * cw * ci) * yo,
      (sO * cw + cO * sw * ci) * xo + (-sO * sw + cO * cw * ci) * yo,
      sw * si * xo + cw * si * yo,
    ]);
  }
  return pts;
}

export class OortLevel extends BaseLevel {
  readonly id = 'oort' as const;
  readonly unit = METERS.AU;
  private sky = new Sky('ecl', 0.5);
  private cloudMat = createPointsMaterial({ attenuate: true, minSize: 1.3, maxSize: 3, softness: 2 });

  constructor() {
    super();
    this.anchors = { sun: new THREE.Vector3() };
    const glow = glowSprite(glowTexture(), 0xffe2b0, 0.04, 1);
    (glow.material as THREE.SpriteMaterial).sizeAttenuation = false;
    const helio = glowSprite(glowTexture([[0, 'rgba(255,170,90,0.5)'], [1, 'rgba(255,140,60,0)']]), 0xffffff, 2 * 160, 0.6);
    this.scene.add(this.sky.group, glow, helio);

    const rand = mulberry32(42);
    const nInner = 30000;
    const nOuter = 50000;
    const n = nInner + nOuter;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let p: Vec3;
      if (k < nInner) {
        // Hills cloud: 2,000–20,000 AU, concentrated toward the ecliptic
        const r = 2000 * Math.pow(10, rand());
        const lon = rand() * Math.PI * 2;
        const lat = Math.max(-1.4, Math.min(1.4, gaussian(rand) * 0.45));
        p = [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
      } else {
        // outer cloud: 20,000–100,000 AU, roughly spherical
        const r = 20000 * Math.pow(5, Math.sqrt(rand()));
        const u = rand() * 2 - 1;
        const a = rand() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        p = [r * s * Math.cos(a), r * s * Math.sin(a), r * u];
      }
      pos.set(toThree(p), k * 3);
      const b = 0.35 + rand() * 0.4;
      col.set([b * 0.8, b * 0.9, b], k * 3);
      size[k] = 60 + rand() * 120; // AU, so far points fade instead of shrinking
    }
    this.scene.add(createPoints(pos, col, size, this.cloudMat));

    // Sedna: perihelion 76 AU, aphelion ~937 AU
    this.scene.add(polyline(keplerOrbit(506, 0.85, 11.93, 144.4, 311.3), 0xff8866, 0.55));
    const ly = planeCircle(AU_PER_LY, 0x8fb4ff, 0.35);
    this.scene.add(ly);

    const aCen = normalize(eqToEcl(raDecToVec(14 + 39.6 / 60, -60.83)));
    const toAcen = new THREE.Vector3(...toThree(aCen)).multiplyScalar(110000);
    this.markers = [
      this.fixedMarker({ id: 'solar-system', label: '行星與日球層', labelEn: 'Planets & heliosphere', kind: 'here', at: new THREE.Vector3(), sMin: 14.2, sMax: 16.0, infoId: 'SolarSystemHere', jumpToS: 13.95 }),
      this.fixedMarker({ id: 'sedna', label: '賽德娜的軌道', labelEn: 'Sedna’s orbit', kind: 'region', at: new THREE.Vector3(...toThree(keplerOrbit(506, 0.85, 11.93, 144.4, 311.3, 2)[1])), sMin: 14.3, sMax: 15.4, infoId: 'Sedna' }),
      this.fixedMarker({ id: 'hills', label: '內歐特雲（希爾斯雲）', labelEn: 'Inner Oort cloud', kind: 'region', at: new THREE.Vector3(...toThree([9000, 0, 1500])), sMin: 14.9, sMax: 16.1, infoId: 'InnerOort' }),
      this.fixedMarker({ id: 'outer-oort', label: '外歐特雲', labelEn: 'Outer Oort cloud', kind: 'region', at: new THREE.Vector3(...toThree([-30000, 50000, 40000])), sMin: 15.7, sMax: 17.0, infoId: 'OuterOort' }),
      this.fixedMarker({ id: 'one-ly', label: '1 光年', labelEn: '1 light-year', kind: 'region', at: new THREE.Vector3(...toThree([0, -AU_PER_LY, 0])), sMin: 15.8, sMax: 17.1, infoId: 'LightYear' }),
      this.fixedMarker({ id: 'to-acen', label: '往半人馬座 α 星（4.37 光年）→', labelEn: 'Toward Alpha Centauri', kind: 'region', at: toAcen, sMin: 15.9, sMax: 17.1, infoId: 'AlphaCen', jumpToS: 17.3 }),
    ];
  }

  protected async build(): Promise<void> {
    await this.sky.load();
  }

  update(ctx: FrameContext): void {
    updatePointsScale(this.cloudMat, ctx.camera, ctx.viewportHeight);
    this.sky.update(ctx.camera, 1);
  }
}
