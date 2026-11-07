import * as THREE from 'three';
import { eqToGal, galacticToVec, toThree } from '../core/frames';
import type { FrameContext, Marker } from '../core/level';
import { discNormalEq } from '../core/orientation';
import { METERS } from '../core/scale';
import { LOCAL_GROUP } from '../content/localGroup';
import { LOOKS, galaxyDisc, galaxyTexture } from '../render/galaxySprite';
import { planeCircle } from '../render/primitives';
import { BaseLevel } from './base';
import { R0_KLY } from './milkyWay';

const UNIT = METERS.MLY;
const GC = new THREE.Vector3(...toThree([R0_KLY / 1000, 0, 0]));

export function galaxyPosition(l: number, b: number, distMly: number): THREE.Vector3 {
  return new THREE.Vector3(...toThree(galacticToVec(l, b, distMly)));
}

const m31 = LOCAL_GROUP.find((g) => g.id === 'm31')!;
/** Rough barycentre: ~45% of the way from the Milky Way's centre toward M31. */
export const LOCAL_GROUP_CENTER = GC.clone().lerp(galaxyPosition(m31.l, m31.b, m31.distMly), 0.45);

/** Galaxies are tiny at this scale; Magnified Bodies enlarges them this much. */
export const GALAXY_MAGNIFY = 6;

export class LocalGroupLevel extends BaseLevel {
  readonly id = 'local-group' as const;
  readonly unit = UNIT;
  private scalable: { obj: THREE.Object3D; base: number }[] = [];

  constructor() {
    super();
    this.anchors = { 'galactic-center': GC.clone(), 'local-group-center': LOCAL_GROUP_CENTER.clone() };
  }

  protected async build(): Promise<void> {
    const markers: Marker[] = [];
    // the Milky Way, face-on in the galactic plane
    const mw = galaxyDisc(galaxyTexture(LOOKS.milkyWay), 0.105);
    mw.position.copy(GC);
    this.scalable.push({ obj: mw, base: 1 });
    mw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...toThree([0, 0, 1])));
    this.scene.add(mw);
    markers.push(
      this.fixedMarker({ id: 'milky-way', label: '銀河系（你在這裡）', labelEn: 'Milky Way — you are here', kind: 'here', at: GC.clone(), sMin: 21.7, sMax: 24.0, infoId: 'MilkyWay', jumpToS: 21.15 }),
    );

    for (const g of LOCAL_GROUP) {
      const pos = galaxyPosition(g.l, g.b, g.distMly);
      const d = g.diameterKly / 1000;
      if (g.kind === 'spiral' && g.disc) {
        const look = g.id === 'm31' ? LOOKS.andromeda : LOOKS.triangulum;
        const disc = galaxyDisc(galaxyTexture(look), d * 1.15);
        disc.position.copy(pos);
        const n = toThree(eqToGal(discNormalEq(g.disc.raH, g.disc.dec, g.disc.pa, g.disc.incl)));
        disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n));
        this.scene.add(disc);
        this.scalable.push({ obj: disc, base: 1 });
      } else {
        const look = g.kind === 'irregular' ? { ...LOOKS.irregular, seed: g.id.length * 7 } : LOOKS.dwarf;
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: galaxyTexture(look, 256), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: g.kind === 'dwarf' ? 0.7 : 0.9 }),
        );
        sprite.scale.setScalar(Math.max(d * 1.6, 0.004));
        sprite.position.copy(pos);
        this.scene.add(sprite);
        this.scalable.push({ obj: sprite, base: sprite.scale.x });
      }
      markers.push(
        this.fixedMarker({
          id: g.id,
          label: g.zh,
          labelEn: `${g.en} · ${g.distMly < 1 ? `${Math.round(g.distMly * 1000)} 千` : g.distMly.toFixed(2) + ' 百萬'}光年`,
          kind: 'body',
          at: pos,
          sMin: 21.8,
          sMax: g.labelSMax,
          infoId: `lg:${g.id}`,
        }),
      );
    }

    const ring = planeCircle(4.0, 0x7f9fff, 0.25);
    ring.position.copy(LOCAL_GROUP_CENTER);
    this.scene.add(ring);
    markers.push(
      this.fixedMarker({ id: 'lg-center', label: '本星系群中心（約略）', labelEn: 'Local Group barycentre', kind: 'region', at: LOCAL_GROUP_CENTER.clone(), sMin: 22.6, sMax: 23.9, infoId: 'LocalGroupCenter' }),
      this.fixedMarker({ id: 'lg-edge', label: '本星系群範圍（約 400 萬光年）', labelEn: 'Extent of the Local Group', kind: 'region', at: LOCAL_GROUP_CENTER.clone().add(new THREE.Vector3(4, 0, 0)), sMin: 22.8, sMax: 24.0 }),
    );
    this.markers = markers;
  }

  update(ctx: FrameContext): void {
    const f = ctx.magnify ? GALAXY_MAGNIFY : 1;
    for (const { obj, base } of this.scalable) obj.scale.setScalar(base * f);
  }
}
