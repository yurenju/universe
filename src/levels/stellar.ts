import * as THREE from 'three';
import { bvToRgb } from '../core/color';
import { toThree, type Vec3 } from '../core/frames';
import type { FrameContext, Marker } from '../core/level';
import { METERS } from '../core/scale';
import { loadFloat32, loadJson } from '../render/assets';
import { createPoints, createPointsMaterial, updatePointsScale } from '../render/points';
import { glowSprite, glowTexture, planeCircle } from '../render/primitives';
import { Sky } from '../render/sky';
import { BaseLevel } from './base';

/** Traditional Chinese names of stars worth labelling, keyed by HYG proper name. */
export const STAR_NAMES_ZH: Record<string, { zh: string; sMax: number }> = {
  'Proxima Centauri': { zh: '比鄰星', sMax: 17.9 },
  'Rigil Kentaurus': { zh: '南門二（半人馬座 α）', sMax: 18.3 },
  "Barnard's Star": { zh: '巴納德星', sMax: 17.9 },
  'Wolf 359': { zh: '沃夫 359', sMax: 17.8 },
  'Lalande 21185': { zh: '拉蘭德 21185', sMax: 17.8 },
  Sirius: { zh: '天狼星', sMax: 18.8 },
  Ran: { zh: '天苑四', sMax: 18.0 },
  Procyon: { zh: '南河三', sMax: 18.6 },
  Altair: { zh: '牛郎星（河鼓二）', sMax: 18.8 },
  Vega: { zh: '織女星', sMax: 18.9 },
  Fomalhaut: { zh: '北落師門', sMax: 18.8 },
  Pollux: { zh: '北河三', sMax: 18.9 },
  Arcturus: { zh: '大角星', sMax: 19.1 },
  Capella: { zh: '五車二', sMax: 19.1 },
  Castor: { zh: '北河二', sMax: 19.0 },
  Aldebaran: { zh: '畢宿五', sMax: 19.2 },
  Regulus: { zh: '軒轅十四', sMax: 19.2 },
  Achernar: { zh: '水委一', sMax: 19.3 },
  Algol: { zh: '大陵五', sMax: 19.2 },
  Mizar: { zh: '開陽', sMax: 19.1 },
  Dubhe: { zh: '天樞', sMax: 19.2 },
};

export class StellarLevel extends BaseLevel {
  readonly id = 'stellar-neighborhood' as const;
  readonly unit = METERS.LY;
  private sky = new Sky('gal', 0.6, false);
  private starMat = createPointsMaterial({ attenuate: true, minSize: 1.6, maxSize: 28, softness: 3.5 });

  constructor() {
    super();
    this.anchors = { sun: new THREE.Vector3() };
    const sunGlow = glowSprite(glowTexture(), 0xfff0c8, 0.035, 1);
    (sunGlow.material as THREE.SpriteMaterial).sizeAttenuation = false;
    const oort = glowSprite(glowTexture([[0, 'rgba(150,180,255,0.0)'], [0.6, 'rgba(150,180,255,0.18)'], [1, 'rgba(150,180,255,0)']]), 0xffffff, 3.2, 0.7);
    this.scene.add(this.sky.group, sunGlow, oort);
    for (const r of [5, 10, 20, 50, 100, 150]) this.scene.add(planeCircle(r, 0x6f8fd0, r % 50 === 0 ? 0.3 : 0.2));
    this.markers = [
      this.fixedMarker({ id: 'sun', label: '太陽（你在這裡）', labelEn: 'Sun — you are here', kind: 'here', at: new THREE.Vector3(), sMin: 16.4, sMax: 19.7, infoId: 'SolarSystemHere', jumpToS: 16.25 }),
      ...[10, 20, 50, 100].map((r) =>
        this.fixedMarker({
          id: `ring-${r}`,
          label: `${r} 光年`,
          kind: 'region',
          at: new THREE.Vector3(...toThree([0, -r, 0])),
          sMin: r <= 10 ? 16.9 : r <= 20 ? 17.3 : 17.9,
          sMax: r <= 10 ? 18.2 : r <= 20 ? 18.6 : 19.6,
        }),
      ),
    ];
  }

  protected async build(): Promise<void> {
    const [data, names] = await Promise.all([
      loadFloat32('data/near.bin'),
      loadJson<[number, string, number][]>('data/near-names.json'),
      this.sky.load(),
    ]);
    const n = data.length / 5;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const g: Vec3 = [data[i * 5], data[i * 5 + 1], data[i * 5 + 2]];
      pos.set(toThree(g), i * 3);
      const absmag = data[i * 5 + 3];
      const [r, gg, b] = bvToRgb(data[i * 5 + 4]);
      const lum = Math.pow(10, -0.4 * (absmag - 4.83)); // solar luminosities
      const k = Math.min(3, 0.6 + 0.4 * Math.log10(1 + lum));
      col.set([r * k, gg * k, b * k], i * 3);
      // world size in ly: grows slowly with luminosity, so faint red dwarfs fade first
      size[i] = Math.min(3, 0.18 * Math.pow(lum, 0.22));
    }
    this.scene.add(createPoints(pos, col, size, this.starMat));

    const starMarkers: Marker[] = [];
    for (const [idx, name, dist] of names) {
      const zh = STAR_NAMES_ZH[name];
      if (!zh) continue;
      const at = new THREE.Vector3(pos[idx * 3], pos[idx * 3 + 1], pos[idx * 3 + 2]);
      starMarkers.push(
        this.fixedMarker({
          id: `star-${name}`,
          label: zh.zh,
          labelEn: `${name} · ${dist.toFixed(1)} ly`,
          kind: 'body',
          at,
          sMin: 16.6,
          sMax: zh.sMax,
          infoId: `star:${name}`,
        }),
      );
    }
    this.markers = [...this.markers, ...starMarkers];
  }

  update(ctx: FrameContext): void {
    updatePointsScale(this.starMat, ctx.camera, ctx.viewportHeight);
    this.sky.update(ctx.camera, 1);
  }
}
