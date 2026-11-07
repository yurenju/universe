import * as THREE from 'three';
import { normalize, sphereTextureBasis, toThree, type Vec3 } from '../core/frames';
import { earthBasisEcl, helioEcl, moonGeoEcl, sampleMoonOrbit } from '../core/ephemeris';
import type { FrameContext } from '../core/level';
import { METERS } from '../core/scale';
import { BODY_SPECS, placeBody, poleEcl, texturedSphere } from '../render/bodies';
import { EarthMesh } from '../render/earth';
import { polyline } from '../render/primitives';
import { Sky } from '../render/sky';
import { BaseLevel } from './base';

const UNIT = 1e6; // 1 scene unit = 1,000 km
const AU = METERS.AU / UNIT;
export const MOON_MAGNIFY = 3;

export class EarthMoonLevel extends BaseLevel {
  readonly id = 'earth-moon' as const;
  readonly unit = UNIT;
  private earth = new EarthMesh();
  private moon: THREE.Mesh | null = null;
  private orbit: THREE.Line | null = null;
  private orbitDate = 0;
  private sky = new Sky('ecl', 0.5);
  private sunLight = new THREE.DirectionalLight(0xffffff, 3.2);
  private earthR = BODY_SPECS.Earth.radiusKm / 1e3;
  private moonR = BODY_SPECS.Moon.radiusKm / 1e3;
  private moonPos = new THREE.Vector3();
  private sunPos = new THREE.Vector3();

  constructor() {
    super();
    this.anchors = { earth: new THREE.Vector3(0, 0, 0), sun: this.sunPos };
    this.scene.add(this.sky.group, this.earth.group, this.sunLight, this.sunLight.target);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.015));
    this.markers = [
      {
        id: 'earth',
        label: '地球',
        labelEn: 'Earth',
        kind: 'body',
        position: (o) => o.set(0, 0, 0),
        sMin: 7.7,
        sMax: 9.9,
        focus: { radius: BODY_SPECS.Earth.radiusKm * 1e3 },
        infoId: 'Earth',
      },
      {
        id: 'moon',
        label: '月球',
        labelEn: 'Moon',
        kind: 'body',
        position: (o) => o.copy(this.moonPos),
        sMin: 7.6,
        sMax: 9.8,
        focus: { radius: BODY_SPECS.Moon.radiusKm * 1e3, magnifiedFactor: MOON_MAGNIFY },
        infoId: 'Moon',
      },
    ];
  }

  protected async build(): Promise<void> {
    const [, moon] = await Promise.all([this.earth.load(), texturedSphere(BODY_SPECS.Moon, 1), this.sky.load()]);
    this.moon = moon;
    this.scene.add(moon);
  }

  update(ctx: FrameContext): void {
    const date = ctx.date;
    const earthHelio = helioEcl('Earth', date);
    const sunGeo: Vec3 = [-earthHelio[0], -earthHelio[1], -earthHelio[2]];
    const sunDir = new THREE.Vector3(...toThree(normalize(sunGeo)));
    this.sunPos.copy(sunDir).multiplyScalar(Math.hypot(...sunGeo) * AU);
    this.sunLight.position.copy(sunDir).multiplyScalar(1000);
    this.earth.setSun(sunDir);
    this.earth.setCloudDrift(ctx.elapsed);

    placeBody(this.earth.surface, new THREE.Vector3(), earthBasisEcl(date), this.earthR);

    const m = moonGeoEcl(date);
    const mScene = toThree(m).map((x) => x * AU) as Vec3;
    this.moonPos.set(...mScene);
    if (this.moon) {
      // tidally locked: the near side (texture centre) faces Earth
      const toEarth: Vec3 = normalize([-m[0], -m[1], -m[2]]);
      placeBody(this.moon, this.moonPos, sphereTextureBasis(toEarth, poleEcl(BODY_SPECS.Moon)), this.moonR * (ctx.magnify ? MOON_MAGNIFY : 1));
    }

    // re-sample the (precessing) lunar orbit about once per simulated day
    if (!this.orbit || Math.abs(date.getTime() - this.orbitDate) > 864e5) {
      if (this.orbit) this.scene.remove(this.orbit);
      const start = new Date(date.getTime() - 13.6 * 864e5);
      this.orbit = polyline(sampleMoonOrbit(start, 256), 0x8fb4ff, 0.35, AU);
      this.scene.add(this.orbit);
      this.orbitDate = date.getTime();
    }

    this.sky.update(ctx.camera, 1);
  }
}
