import * as THREE from 'three';
import { toThree, type Vec3 } from '../core/frames';
import type { FrameContext } from '../core/level';
import { METERS } from '../core/scale';
import { gaussian, loadTexture, mulberry32 } from '../render/assets';
import { basisToMatrix } from '../core/sphere';
import { createPoints, createPointsMaterial, updatePointsScale } from '../render/points';
import { glowSprite, glowTexture } from '../render/primitives';
import { BaseLevel } from './base';

/** Sun–galactic-centre distance (GRAVITY 2019: 8.18 kpc), in kly. */
export const R0_KLY = 26.7;
export const ARM_PITCH_DEG = 13.5;
const TAN_P = Math.tan((ARM_PITCH_DEG * Math.PI) / 180);

/**
 * Logarithmic spiral arms in galactocentric polar coordinates (same axes as
 * the galactic frame, origin at the centre). The Sun sits at azimuth π.
 * Viewed from the north galactic pole the Galaxy turns clockwise, so trailing
 * arms wind counter-clockwise outward: r = R·exp((φ − π)·tan p).
 */
export const ARMS = [
  { id: 'scutum-centaurus', label: '盾牌－半人馬臂', labelEn: 'Scutum–Centaurus Arm', rAtSun: 14.4, weight: 1.0, major: true },
  { id: 'sagittarius', label: '人馬－船底臂', labelEn: 'Sagittarius–Carina Arm', rAtSun: 21.0, weight: 0.55, major: false },
  { id: 'perseus', label: '英仙臂', labelEn: 'Perseus Arm', rAtSun: 30.6, weight: 1.0, major: true },
  { id: 'outer', label: '矩尺－外臂', labelEn: 'Norma–Outer Arm', rAtSun: 44.7, weight: 0.45, major: false },
] as const;

export function armAzimuth(rAtSun: number, r: number): number {
  return Math.PI + Math.log(r / rAtSun) / TAN_P;
}

/** Galactocentric (x, y, z) kly → heliocentric galactic frame. */
export function fromCentre(q: Vec3): Vec3 {
  return [q[0] + R0_KLY, q[1], q[2]];
}

function polar(r: number, phi: number, z = 0): Vec3 {
  return [r * Math.cos(phi), r * Math.sin(phi), z];
}

/**
 * ESA/Gaia/DPAC top-down Milky Way (2048 px square): the galactic centre is the
 * image centre and the Sun sits 416 px straight below it. Image "down" points
 * from the centre to the Sun (−X galactic) and image "left" is the direction
 * of the Sun's orbital motion (+Y, l = 90°), i.e. seen from the north
 * galactic pole, rotating clockwise.
 */
export const TOPDOWN = { px: 2048, sunOffsetPx: 416 };
export const TOPDOWN_KLY = (TOPDOWN.px * R0_KLY) / TOPDOWN.sunOffsetPx;

/** Near end of the bar points ~27° from the Sun–centre line toward positive l. */
export const BAR_ANGLE = Math.PI - (27 * Math.PI) / 180;

export class MilkyWayLevel extends BaseLevel {
  readonly id = 'milky-way' as const;
  readonly unit = METERS.KLY;
  private materials: THREE.ShaderMaterial[] = [];
  private core: THREE.Sprite | null = null;

  constructor() {
    super();
    const gc = new THREE.Vector3(...toThree([R0_KLY, 0, 0]));
    this.anchors = { sun: new THREE.Vector3(), 'galactic-center': gc };
    const core = glowSprite(glowTexture([[0, 'rgba(255,235,200,1)'], [0.3, 'rgba(255,210,150,0.35)'], [1, 'rgba(255,190,120,0)']]), 0xffffff, 22, 0.9);
    core.position.copy(gc);
    this.scene.add(core);
    this.core = core;

    // Arms are labelled only where their distance from the Sun is well measured.
    const along = (r: number, dphi: number, id: string, label: string, labelEn: string, infoId: string) =>
      this.fixedMarker({ id, label, labelEn, kind: 'region', at: new THREE.Vector3(...toThree(fromCentre(polar(r, Math.PI + dphi)))), sMin: 19.9, sMax: 21.5, infoId });
    const orion = fromCentre(polar(R0_KLY + 0.4, Math.PI + 0.32));
    this.markers = [
      this.fixedMarker({ id: 'sun', label: '太陽（你在這裡）', labelEn: 'Sun — you are here', kind: 'here', at: new THREE.Vector3(), sMin: 19.3, sMax: 22.4, infoId: 'SolarSystemHere', jumpToS: 17.75 }),
      this.fixedMarker({ id: 'gc', label: '銀河中心（人馬座 A*）', labelEn: 'Galactic centre — Sgr A*', kind: 'body', at: gc, sMin: 20.0, sMax: 22.2, infoId: 'SgrA' }),
      this.fixedMarker({ id: 'bar', label: '中央棒', labelEn: 'Central bar', kind: 'region', at: new THREE.Vector3(...toThree(fromCentre(polar(11, BAR_ANGLE)))), sMin: 20.6, sMax: 21.8, infoId: 'Bar' }),
      this.fixedMarker({ id: 'orion-spur', label: '獵戶支臂', labelEn: 'Orion Spur', kind: 'region', at: new THREE.Vector3(...toThree(orion)), sMin: 19.9, sMax: 21.3, infoId: 'arm:orion' }),
      along(R0_KLY + 6.5, -0.12, 'perseus', '英仙臂', 'Perseus Arm', 'arm:perseus'),
      along(R0_KLY - 5.5, 0.15, 'sagittarius', '人馬－船底臂', 'Sagittarius–Carina Arm', 'arm:sagittarius'),
    ];
  }

  protected async build(): Promise<void> {
    const topdown = await loadTexture('textures/milkyway_topdown.jpg');
    if (topdown) {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(TOPDOWN_KLY, TOPDOWN_KLY),
        new THREE.ShaderMaterial({
          uniforms: { map: { value: topdown } },
          vertexShader: /* glsl */ `
            #include <common>
            #include <logdepthbuf_pars_vertex>
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              #include <logdepthbuf_vertex>
            }`,
          fragmentShader: /* glsl */ `
            #include <common>
            #include <logdepthbuf_pars_fragment>
            uniform sampler2D map;
            varying vec2 vUv;
            void main() {
              #include <logdepthbuf_fragment>
              // drop the image's dark-blue sky level and fade out before the square edge
              vec3 c = max(texture2D(map, vUv).rgb - vec3(0.004, 0.005, 0.012), 0.0);
              float edge = smoothstep(0.5, 0.36, length(vUv - 0.5));
              gl_FragColor = vec4(c * edge * 1.25, 1.0);
            }`,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      // local x (image right) → −Y gal, local y (image up) → +X gal, normal → +Z gal
      plane.matrixAutoUpdate = false;
      plane.matrix.copy(basisToMatrix({ x: [0, -1, 0], y: [1, 0, 0], z: [0, 0, 1] }));
      plane.matrix.setPosition(...toThree([R0_KLY, 0, 0]));
      this.scene.add(plane);
      // the image already has a bright bulge; an extra glow would blow it out
      if (this.core) this.scene.remove(this.core);
    }
    const dim = topdown ? 0.12 : 1;
    const rand = mulberry32(2024);
    const add = (n: number, gen: (out: { p: Vec3; c: Vec3; s: number }) => void, opts: Parameters<typeof createPointsMaterial>[0]) => {
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const size = new Float32Array(n);
      const o = { p: [0, 0, 0] as Vec3, c: [1, 1, 1] as Vec3, s: 1 };
      for (let i = 0; i < n; i++) {
        gen(o);
        pos.set(toThree(fromCentre(o.p)), i * 3);
        col.set(o.c, i * 3);
        size[i] = o.s;
      }
      const mat = createPointsMaterial({ attenuate: true, ...opts });
      this.materials.push(mat);
      const pts = createPoints(pos, col, size, mat);
      this.scene.add(pts);
      return pts;
    };

    const armPoint = (rAtSun: number, rMin: number, scatter: number): Vec3 => {
      const r = rMin + -Math.log(1 - rand() * 0.97) * 9;
      const phi = armAzimuth(rAtSun, r);
      const off = gaussian(rand) * scatter * (0.6 + r / 40);
      const along = gaussian(rand) * 0.6;
      const rr = r + off;
      return polar(rr, phi + along / Math.max(r, 1), gaussian(rand) * 0.35);
    };

    // old disk population (smooth, yellowish)
    add(60000, (o) => {
      const r = -Math.log(1 - rand() * 0.995) * 9;
      o.p = polar(r, rand() * Math.PI * 2, gaussian(rand) * 0.6);
      const k = 0.18 + rand() * 0.12;
      o.c = [k * 1.0 * dim, k * 0.85 * dim, k * 0.65 * dim];
      o.s = 0.9 + rand() * 1.2;
    }, { minSize: 1.2, maxSize: 30, softness: 2.5 });

    // bulge + bar
    add(40000, (o) => {
      const a = gaussian(rand) * 6.5;
      const b = gaussian(rand) * 2.6;
      const z = gaussian(rand) * 2.0;
      const ca = Math.cos(BAR_ANGLE);
      const sa = Math.sin(BAR_ANGLE);
      o.p = [a * ca - b * sa, a * sa + b * ca, z];
      const k = 0.4 + rand() * 0.3;
      o.c = [k * 1.0 * dim, k * 0.82 * dim, k * 0.58 * dim];
      o.s = 0.8 + rand() * 1.0;
    }, { minSize: 1.2, maxSize: 30, softness: 2.5 });

    if (topdown) return; // the image already shows arms, HII regions and dust

    // spiral arms: young blue-white stars
    add(110000, (o) => {
      const pick = rand();
      const total = ARMS.reduce((s, a) => s + a.weight, 0);
      let acc = 0;
      let arm: (typeof ARMS)[number] = ARMS[0];
      for (const a of ARMS) {
        acc += a.weight / total;
        if (pick <= acc) {
          arm = a;
          break;
        }
      }
      o.p = armPoint(arm.rAtSun, 9, 1.1);
      const k = 0.35 + rand() * 0.35;
      o.c = [k * 0.75, k * 0.85, k * 1.0];
      o.s = 0.6 + rand() * 0.9;
    }, { minSize: 1.2, maxSize: 30, softness: 3 });

    // Orion Spur, where the Sun lives
    add(6000, (o) => {
      const phi = Math.PI - 0.5 + rand() * 0.95;
      const r = R0_KLY + 0.4 + (phi - Math.PI) * 4 + gaussian(rand) * 0.6;
      o.p = polar(r, phi, gaussian(rand) * 0.25);
      const k = 0.3 + rand() * 0.3;
      o.c = [k * 0.8, k * 0.88, k];
      o.s = 0.4 + rand() * 0.6;
    }, { minSize: 1.2, maxSize: 30, softness: 3 });

    // HII regions: pink star-forming knots
    add(2500, (o) => {
      const arm = ARMS[Math.floor(rand() * ARMS.length)];
      o.p = armPoint(arm.rAtSun, 10, 0.6);
      const k = 0.6 + rand() * 0.4;
      o.c = [k * 1.0, k * 0.35, k * 0.55];
      o.s = 0.5 + rand() * 0.8;
    }, { minSize: 1.2, maxSize: 20, softness: 4 });

    // dust lanes along the inner edges of the arms (darken what is behind)
    const dust = add(30000, (o) => {
      const arm = ARMS[Math.floor(rand() * ARMS.length)];
      const r = 9 + -Math.log(1 - rand() * 0.95) * 9;
      const phi = armAzimuth(arm.rAtSun, r) - 0.9 / Math.max(r, 1) * 1.2;
      o.p = polar(r - 0.8 + gaussian(rand) * 0.5, phi, gaussian(rand) * 0.12);
      const k = 0.25 + rand() * 0.2;
      o.c = [k * 0.75, k * 0.8, k * 0.9];
      o.s = 1.2 + rand() * 1.8;
    }, { minSize: 1.2, maxSize: 40, softness: 2, blending: THREE.SubtractiveBlending });
    dust.renderOrder = 5;
  }

  update(ctx: FrameContext): void {
    for (const m of this.materials) updatePointsScale(m, ctx.camera, ctx.viewportHeight);
  }
}
