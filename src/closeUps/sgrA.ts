import * as THREE from 'three';
import { R_SUN, schwarzschildRadius } from '../core/blackhole';
import { S_STARS, SGR_A, SGR_A_M_PER_ARCSEC } from '../content/blackholes';
import { toThree } from '../core/frames';
import type { FrameContext, Marker } from '../core/level';
import { dateToJulianYear, skyBasisGal, skyOrbit, skyPosition, skyToGal } from '../core/orbit';
import { LensedRenderer } from '../render/lensing';
import { glowSprite, glowTexture } from '../render/primitives';
import { BaseCloseUp, galToScene, lensQuality, minWorldSize, starfield } from './common';

const RS = schwarzschildRadius(SGR_A.massSun);
const ARCSEC_IN_RS = SGR_A_M_PER_ARCSEC / RS;
/** Magnified Bodies enlarges the S-stars this much (their orbits stay true). */
export const STAR_MAGNIFY = 300;

const ORBIT_COLORS = [0xffd27a, 0x9fd0ff, 0xc6a8ff, 0x8fe3b0];

/** Close-up of Sagittarius A*: the hole, its faint hot gas, and the S-stars on their measured orbits. */
export class SgrACloseUp extends BaseCloseUp {
  readonly id = 'sgr-a' as const;
  /** One scene unit is the Schwarzschild radius, ~0.085 AU. */
  readonly unit = RS;
  readonly defaultView: { yaw: number; pitch: number };

  private lens = new LensedRenderer('diffuse');
  private basis = skyBasisGal(SGR_A.raHours, SGR_A.decDeg);
  /** Spin axis is not well measured; EHT favours a fairly face-on view, so tilt it 30° from our line of sight. */
  private spin = new THREE.Vector3();
  private stars: { sprite: THREE.Sprite; pos: THREE.Vector3; radius: number }[] = [];
  private time = 0;

  constructor() {
    super();
    const toEarth = toThree(skyToGal(this.basis, [0, 0, -1]));
    this.defaultView = { yaw: Math.atan2(toEarth[0], toEarth[2]), pitch: Math.asin(toEarth[1]) };
    galToScene(skyToGal(this.basis, [0.35, 0.3, -0.87]), 1, this.spin).normalize();

    const tex = glowTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,250,240,0.6)'], [0.6, 'rgba(220,230,255,0.12)'], [1, 'rgba(200,220,255,0)']]);
    const markers: Marker[] = [
      this.liveMarker({ id: 'bh', label: '人馬座 A*（事件視界）', labelEn: 'Sgr A* — event horizon', kind: 'body', sMin: 9, sMax: 16.2, infoId: 'sgr:bh' }, new THREE.Vector3()),
    ];
    S_STARS.forEach((s, k) => {
      const pts = skyOrbit(s.el, 512).map((p) => toThree(skyToGal(this.basis, p)));
      const arr = new Float32Array(pts.length * 3);
      pts.forEach((p, i) => arr.set([p[0] * ARCSEC_IN_RS, p[1] * ARCSEC_IN_RS, p[2] * ARCSEC_IN_RS], i * 3));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: ORBIT_COLORS[k % ORBIT_COLORS.length], transparent: true, opacity: 0.45, depthWrite: false }));
      line.frustumCulled = false;
      const sprite = glowSprite(tex, ORBIT_COLORS[k % ORBIT_COLORS.length], 1, 1);
      const pos = new THREE.Vector3();
      this.lens.foreground.add(line, sprite);
      this.stars.push({ sprite, pos, radius: (s.radiusSun * R_SUN) / RS });
      markers.push(this.liveMarker({ id: s.id, label: s.name, labelEn: s.id === 's2' ? 'S2 — 16-year orbit' : undefined, kind: 'body', sMin: 13.4, sMax: 16.2, infoId: `sgr:${s.id}` }, pos));
    });
    this.markers = markers;
  }

  protected async build(): Promise<void> {
    // the nuclear star cluster: dense, reddened by dust (illustrative)
    this.lens.skyScene.add(starfield(16000, 11, [1.0, 0.72, 0.5], 0.3));
  }

  update(ctx: FrameContext): void {
    this.time = ctx.elapsed;
    if (ctx.weight > 0.99) lensQuality.sample(ctx.dt);
    const t = dateToJulianYear(ctx.date);
    const dist = ctx.camera.position.length();
    S_STARS.forEach((s, k) => {
      const st = this.stars[k];
      galToScene(skyToGal(this.basis, skyPosition(s.el, t)), ARCSEC_IN_RS, st.pos);
      st.sprite.position.copy(st.pos);
      const world = st.radius * 2 * 4 * (ctx.magnify ? STAR_MAGNIFY : 1);
      const d = ctx.camera.position.distanceTo(st.pos) || dist;
      st.sprite.scale.setScalar(Math.max(world, minWorldSize(9, d, ctx.camera, ctx.viewportHeight)));
    });
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, target: THREE.WebGLRenderTarget): void {
    this.lens.render(renderer, camera, target, {
      rs: 1,
      diskNormal: this.spin,
      diskInner: 0,
      diskOuter: 0,
      time: this.time,
      brightness: 0.9,
      lensing: lensQuality.enabled,
    });
  }
}
