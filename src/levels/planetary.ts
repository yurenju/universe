import * as THREE from 'three';
import { sphereTextureBasis, toThree } from '../core/frames';
import { PLANETS, earthBasisEcl, helioEcl, sampleOrbit, type PlanetName } from '../core/ephemeris';
import type { FrameContext, Marker } from '../core/level';
import { METERS } from '../core/scale';
import { mulberry32 } from '../render/assets';
import { COMETS } from '../content/comets';
import { CometView } from '../render/comets';
import { BODY_SPECS, placeBody, poleEcl, saturnRings, spinBasis, texturedSphere } from '../render/bodies';
import { createPoints, createPointsMaterial, updatePointsScale } from '../render/points';
import { glowSprite, glowTexture, polyline } from '../render/primitives';
import { Sky } from '../render/sky';
import { BaseLevel } from './base';

const UNIT = METERS.AU;
const KM_TO_AU = 1e3 / METERS.AU;
export const PLANET_MAGNIFY = 800;
export const SUN_MAGNIFY = 15;

export const PLANET_LABELS: Record<PlanetName, string> = {
  Mercury: '水星',
  Venus: '金星',
  Earth: '地球',
  Mars: '火星',
  Jupiter: '木星',
  Saturn: '土星',
  Uranus: '天王星',
  Neptune: '海王星',
  Pluto: '冥王星',
};

const ORBIT_COLORS: Record<PlanetName, number> = {
  Mercury: 0xb0a090,
  Venus: 0xe0c080,
  Earth: 0x6fa8ff,
  Mars: 0xe07050,
  Jupiter: 0xd8b080,
  Saturn: 0xe0d0a0,
  Uranus: 0x90d8e0,
  Neptune: 0x6080ff,
  Pluto: 0x907060,
};

/** Belt of small bodies on near-circular orbits; moves with Sim Time. */
class Belt {
  readonly points: THREE.Points;
  private a: Float32Array;
  private phase0: Float32Array;
  private incl: Float32Array;
  private node: Float32Array;
  private material = createPointsMaterial({ minSize: 1.2, maxSize: 3, softness: 2 });

  constructor(count: number, aMin: number, aMax: number, maxInclDeg: number, color: THREE.Color, seed: number, private sizePx: number) {
    const rand = mulberry32(seed);
    this.a = new Float32Array(count);
    this.phase0 = new Float32Array(count);
    this.incl = new Float32Array(count);
    this.node = new Float32Array(count);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.a[i] = aMin + (aMax - aMin) * Math.pow(rand(), 0.8);
      this.phase0[i] = rand() * Math.PI * 2;
      this.incl[i] = (rand() - 0.5) * 2 * maxInclDeg * (Math.PI / 180) * rand();
      this.node[i] = rand() * Math.PI * 2;
      const k = 0.5 + rand() * 0.5;
      col.set([color.r * k, color.g * k, color.b * k], i * 3);
      size[i] = this.sizePx;
    }
    this.points = createPoints(pos, col, size, this.material);
  }

  update(date: Date, opacity: number): void {
    const years = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (365.25 * 864e5);
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.a.length; i++) {
      const a = this.a[i];
      const th = this.phase0[i] + (2 * Math.PI * years) / Math.pow(a, 1.5);
      const x = a * Math.cos(th);
      const y = a * Math.sin(th);
      // tilt about the node line
      const cn = Math.cos(this.node[i]);
      const sn = Math.sin(this.node[i]);
      const xr = x * cn + y * sn;
      const yr = -x * sn + y * cn;
      const zi = yr * Math.sin(this.incl[i]);
      const yi = yr * Math.cos(this.incl[i]);
      const X = xr * cn - yi * sn;
      const Y = xr * sn + yi * cn;
      // ecliptic (X, Y, Z) → Three (X, Z, −Y)
      arr[i * 3] = X;
      arr[i * 3 + 1] = zi;
      arr[i * 3 + 2] = -Y;
    }
    pos.needsUpdate = true;
    this.material.uniforms.uOpacity.value = opacity;
  }
}

export class PlanetaryLevel extends BaseLevel {
  readonly id = 'planetary' as const;
  readonly unit = UNIT;
  private sky = new Sky('ecl', 0.5);
  private sun: THREE.Mesh | null = null;
  private sunGlow: THREE.Sprite;
  private planets = new Map<PlanetName, THREE.Mesh>();
  private rings: THREE.Mesh | null = null;
  private positions = new Map<PlanetName, THREE.Vector3>();
  private asteroids = new Belt(5000, 2.1, 3.3, 18, new THREE.Color(0.75, 0.68, 0.6), 7, 1.6);
  private kuiper = new Belt(5000, 30, 50, 25, new THREE.Color(0.55, 0.65, 0.8), 11, 1.6);
  readonly comets = COMETS.map((c) => new CometView(c));

  constructor() {
    super();
    for (const p of PLANETS) this.positions.set(p, new THREE.Vector3());
    this.anchors = { earth: this.positions.get('Earth')!, sun: new THREE.Vector3() };
    this.sunGlow = glowSprite(glowTexture(), 0xffe2b0, 0.06, 1);
    (this.sunGlow.material as THREE.SpriteMaterial).sizeAttenuation = false;
    this.scene.add(this.sky.group, this.sunGlow, this.asteroids.points, this.kuiper.points, ...this.comets.map((c) => c.group));
    const light = new THREE.PointLight(0xffffff, 3.2, 0, 0);
    this.scene.add(light, new THREE.AmbientLight(0xffffff, 0.02));

    const sunR = BODY_SPECS.Sun.radiusKm * 1e3;
    const ms: Marker[] = [
      {
        id: 'sun',
        label: '太陽',
        labelEn: 'Sun',
        kind: 'body',
        position: (o) => o.set(0, 0, 0),
        sMin: 9.6,
        sMax: 13.6,
        focus: { radius: sunR, magnifiedFactor: SUN_MAGNIFY },
        infoId: 'Sun',
      },
    ];
    for (const p of PLANETS) {
      const outer = ['Uranus', 'Neptune', 'Pluto'].includes(p);
      ms.push({
        id: p.toLowerCase(),
        label: PLANET_LABELS[p],
        labelEn: p,
        kind: 'body',
        position: (o) => o.copy(this.positions.get(p)!),
        sMin: p === 'Earth' ? 10.1 : 9.6,
        sMax: outer ? 13.6 : p === 'Mercury' || p === 'Venus' || p === 'Mars' ? 12.6 : 13.1,
        // Earth: jump back to the Earth–Moon level instead of focusing here
        ...(p === 'Earth'
          ? { jumpToS: 9.0 }
          : { focus: { radius: BODY_SPECS[p].radiusKm * 1e3, magnifiedFactor: PLANET_MAGNIFY } }),
        infoId: p,
      });
    }
    for (const c of this.comets) {
      const small = c.info.orbit.a < 5;
      ms.push({
        id: `comet-${c.info.id.toLowerCase()}`,
        label: c.info.zh,
        labelEn: c.info.en,
        kind: 'body',
        position: (o) => o.copy(c.position),
        sMin: 9.6,
        sMax: small ? 12.9 : 13.6,
        infoId: `comet:${c.info.id}`,
        onHover: (on) => c.setHovered(on),
      });
    }
    ms.push(
      this.fixedMarker({ id: 'asteroid-belt', label: '小行星帶', labelEn: 'Asteroid belt', kind: 'region', at: new THREE.Vector3(...toThree([1.9, -2.0, 0])), sMin: 11.9, sMax: 12.7, infoId: 'AsteroidBelt' }),
      this.fixedMarker({ id: 'kuiper-belt', label: '古柏帶', labelEn: 'Kuiper belt', kind: 'region', at: new THREE.Vector3(...toThree([-30, 26, 0])), sMin: 12.8, sMax: 13.6, infoId: 'KuiperBelt' }),
    );
    this.markers = ms;
  }

  protected async build(): Promise<void> {
    const now = new Date();
    const [sun, ...planetMeshes] = await Promise.all([
      texturedSphere(BODY_SPECS.Sun, 1, false),
      ...PLANETS.map((p) => texturedSphere(BODY_SPECS[p], 1, true, p === 'Pluto' ? 24 : 64)),
      this.sky.load(),
    ]);
    this.sun = sun;
    (sun.material as THREE.MeshBasicMaterial).color.setScalar(1.6);
    this.scene.add(sun);
    PLANETS.forEach((p, i) => {
      const mesh = planetMeshes[i] as THREE.Mesh;
      this.planets.set(p, mesh);
      this.scene.add(mesh);
      this.scene.add(polyline(sampleOrbit(p, now, p === 'Pluto' || p === 'Neptune' ? 512 : 256), ORBIT_COLORS[p], p === 'Pluto' ? 0.25 : 0.4));
    });
    this.rings = await saturnRings();
    this.rings.matrixAutoUpdate = false;
    this.scene.add(this.rings);
  }

  /** Brighten the orbit of the comet whose Body Card is open (null: none). */
  selectComet(id: string | null): void {
    for (const c of this.comets) c.setSelected(c.info.id === id);
  }

  update(ctx: FrameContext): void {
    const date = ctx.date;
    for (const p of PLANETS) {
      const v = toThree(helioEcl(p, date));
      this.positions.get(p)!.set(v[0], v[1], v[2]);
    }
    const f = ctx.magnify ? PLANET_MAGNIFY : 1;
    for (const [p, mesh] of this.planets) {
      const r = BODY_SPECS[p].radiusKm * KM_TO_AU * f;
      const basis = p === 'Earth' ? earthBasisEcl(date) : spinBasis(BODY_SPECS[p], date);
      placeBody(mesh, this.positions.get(p)!, basis, r);
    }
    if (this.rings) {
      const r = BODY_SPECS.Saturn.radiusKm * KM_TO_AU * f;
      placeBody(this.rings, this.positions.get('Saturn')!, sphereTextureBasis([1, 0, 0], poleEcl(BODY_SPECS.Saturn)), r);
    }
    if (this.sun) {
      const r = BODY_SPECS.Sun.radiusKm * KM_TO_AU * (ctx.magnify ? SUN_MAGNIFY : 1);
      placeBody(this.sun, new THREE.Vector3(), spinBasis(BODY_SPECS.Sun, date), r);
    }
    for (const c of this.comets) c.update(date, ctx.camera);
    this.asteroids.update(date, 0.9);
    this.kuiper.update(date, 0.7);
    updatePointsScale(this.asteroids.points.material as THREE.ShaderMaterial, ctx.camera, ctx.viewportHeight);
    this.sky.update(ctx.camera, 1);
  }
}
