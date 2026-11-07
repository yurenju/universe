import * as THREE from 'three';
import type { FrameContext, Marker } from '../core/level';
import { METERS } from '../core/scale';
import { CLUSTERS, LANIAKEA_CENTER, LANIAKEA_RADIUS_MLY } from '../content/largeScale';
import { mulberry32 } from '../render/assets';
import { buildWeb, randomInSphere, type WebNode } from '../render/cosmicWeb';
import { LOOKS, galaxyTexture } from '../render/galaxySprite';
import { createPoints, createPointsMaterial, updatePointsScale } from '../render/points';
import { BaseLevel } from './base';
import { LOCAL_GROUP_CENTER, galaxyPosition } from './localGroup';

export const LANIAKEA_CENTER_POS = galaxyPosition(LANIAKEA_CENTER.l, LANIAKEA_CENTER.b, LANIAKEA_CENTER.distMly);

/** Is a point (Mly, heliocentric) inside our rough Laniakea basin? Wobbly edge so it isn't a perfect sphere. */
export function inLaniakea(p: THREE.Vector3): boolean {
  const d = p.distanceTo(LANIAKEA_CENTER_POS);
  const wobble = 1 + 0.18 * Math.sin(p.x * 0.013) * Math.cos(p.y * 0.011 + p.z * 0.009);
  return d < LANIAKEA_RADIUS_MLY * wobble;
}

export class LaniakeaLevel extends BaseLevel {
  readonly id = 'laniakea' as const;
  readonly unit = METERS.MLY;
  private galaxyMat = createPointsMaterial({ attenuate: true, minSize: 1.3, maxSize: 14, softness: 3 });
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  constructor() {
    super();
    this.anchors = { 'local-group-center': LOCAL_GROUP_CENTER.clone(), 'laniakea-center': LANIAKEA_CENTER_POS.clone() };
  }

  protected async build(): Promise<void> {
    const rand = mulberry32(77);
    const nodes: WebNode[] = CLUSTERS.map((c) => ({ p: galaxyPosition(c.l, c.b, c.distMly), w: c.richness }));
    nodes.push({ p: LOCAL_GROUP_CENTER.clone(), w: 0.08 });
    for (let i = 0; i < 90; i++) nodes.push({ p: randomInSphere(rand, 700), w: 0.1 + rand() * 0.4 });

    const web = buildWeb(nodes, {
      seed: 78,
      points: 150000,
      clumpFraction: 0.35,
      clumpRadius: 18,
      filamentWidth: 7,
      neighbours: 3,
      colorize: (p, r) => {
        const k = 0.35 + r() * 0.4;
        return inLaniakea(p) ? [k * 1.0, k * 0.88, k * 0.62] : [k * 0.55, k * 0.65, k * 0.9];
      },
      size: (r) => 0.8 + r() * 1.6,
    });
    this.scene.add(createPoints(web.pos, web.col, web.size, this.galaxyMat));

    // flow lines: galaxies inside Laniakea stream toward the Great Attractor
    const flowRand = mulberry32(79);
    const positions: number[] = [];
    const colors: number[] = [];
    const p = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i < 240; i++) {
      do randomInSphere(flowRand, LANIAKEA_RADIUS_MLY * 1.1, p).add(LANIAKEA_CENTER_POS);
      while (!inLaniakea(p));
      // integrate toward the nearest heavy node, then to the centre
      const steps = 40;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        let nearest = nodes[0];
        let best = Infinity;
        for (const n of nodes.slice(0, CLUSTERS.length)) {
          const d = n.p.distanceTo(p) / Math.sqrt(n.w);
          if (d < best) {
            best = d;
            nearest = n;
          }
        }
        // bend gradually from the local attractor toward the basin's centre
        const toNode = this.tmpA.subVectors(nearest.p, p).normalize();
        const toCentre = this.tmpB.subVectors(LANIAKEA_CENTER_POS, p).normalize();
        v.copy(toNode).lerp(toCentre, t).normalize().multiplyScalar(6);
        const a = 0.28 * Math.sin(Math.PI * t);
        positions.push(p.x, p.y, p.z);
        colors.push(a, a * 0.95, a * 0.85);
        p.add(v);
        positions.push(p.x, p.y, p.z);
        colors.push(a, a * 0.95, a * 0.85);
        if (p.distanceTo(LANIAKEA_CENTER_POS) < 10) break;
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const flows = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flows.frustumCulled = false;
    this.scene.add(flows);

    // the Local Group as a tiny glow
    const lg = new THREE.Sprite(new THREE.SpriteMaterial({ map: galaxyTexture(LOOKS.milkyWay, 256), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    lg.scale.setScalar(4);
    lg.position.copy(LOCAL_GROUP_CENTER);
    this.scene.add(lg);

    const markers: Marker[] = [
      this.fixedMarker({ id: 'local-group', label: '本星系群（你在這裡）', labelEn: 'Local Group — you are here', kind: 'here', at: LOCAL_GROUP_CENTER.clone(), sMin: 23.3, sMax: 25.7, infoId: 'LocalGroupHere', jumpToS: 23.0 }),
      this.fixedMarker({ id: 'laniakea', label: '拉尼亞凱亞超星系團', labelEn: 'Laniakea Supercluster', kind: 'region', at: LANIAKEA_CENTER_POS.clone().add(new THREE.Vector3(0, LANIAKEA_RADIUS_MLY * 0.7, 0)), sMin: 24.2, sMax: 25.5, infoId: 'Laniakea' }),
      ...CLUSTERS.map((c) =>
        this.fixedMarker({ id: c.id, label: c.zh, labelEn: `${c.en} · ${c.distMly} 百萬光年`, kind: 'body', at: galaxyPosition(c.l, c.b, c.distMly), sMin: c.labelSMin, sMax: c.labelSMax, infoId: `ls:${c.id}` }),
      ),
    ];
    this.markers = markers;
  }

  update(ctx: FrameContext): void {
    updatePointsScale(this.galaxyMat, ctx.camera, ctx.viewportHeight);
  }
}
