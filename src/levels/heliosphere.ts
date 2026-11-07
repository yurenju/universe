import * as THREE from 'three';
import { eqToEcl, normalize, raDecToVec, sphericalToVec, toThree, type Vec3 } from '../core/frames';
import { sampleOrbit } from '../core/ephemeris';
import type { FrameContext } from '../core/level';
import { METERS } from '../core/scale';
import { mulberry32 } from '../render/assets';
import { createPoints, createPointsMaterial } from '../render/points';
import { glowSprite, glowTexture, polyline } from '../render/primitives';
import { Sky } from '../render/sky';
import { BaseLevel } from './base';

/** Direction the heliosphere's nose points: upwind into the interstellar flow (ecliptic lon 255.4°, lat 5.2°). */
export const NOSE_DIR_ECL: Vec3 = sphericalToVec(255.4, 5.2);

export const TERMINATION_SHOCK_AU = 90;
export const HELIOPAUSE_AU = 120;

/** Heliopause-like surface: nose distance r0, flaring into an open tail. */
export function heliopauseRadius(r0: number, cosTheta: number, flare: number, cap: number): number {
  return r0 * Math.min(cap, Math.pow(2 / (1 + cosTheta + 1e-3), flare));
}

export function terminationShockRadius(cosTheta: number): number {
  return TERMINATION_SHOCK_AU * (1 + 0.28 * (1 - cosTheta));
}

/** Approximate Voyager positions: straight-line escape at constant speed. */
export const VOYAGERS = [
  { id: 'voyager1', label: '航海家 1 號', labelEn: 'Voyager 1', raH: 17 + 13 / 60, dec: 12.05, crossedAu: 121.6, crossedYear: 2012.65, auPerYear: 3.57 },
  { id: 'voyager2', label: '航海家 2 號', labelEn: 'Voyager 2', raH: 20 + 7 / 60, dec: -59.8, crossedAu: 119.0, crossedYear: 2018.85, auPerYear: 3.23 },
] as const;

export function voyagerDistanceAu(v: (typeof VOYAGERS)[number], date: Date): number {
  const year = 1970 + date.getTime() / (365.25 * 864e5);
  return v.crossedAu + (year - v.crossedYear) * v.auPerYear;
}

const shellVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN;
varying vec3 vP;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;
const shellFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vP;
void main() {
  #include <logdepthbuf_fragment>
  vec3 v = normalize(cameraPosition - vP);
  float rim = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
  float a = (0.03 + rim * rim * 0.75) * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
}
`;

function shellMaterial(color: THREE.ColorRepresentation, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: shellVertex,
    fragmentShader: shellFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Axisymmetric surface around the nose axis, radius given by f(cosθ). */
function noseSurface(f: (cosTheta: number) => number, maxThetaDeg: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * maxThetaDeg * (Math.PI / 180);
    const r = f(Math.cos(th));
    // Lathe revolves around local Y; local +Y = nose
    pts.push(new THREE.Vector2(r * Math.sin(th), r * Math.cos(th)));
  }
  return new THREE.LatheGeometry(pts, 96);
}

const windVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float phase;
uniform float uTime;
uniform float uScale;
uniform vec3 uNose;
varying float vT;
void main() {
  vec3 dir = normalize(position);
  float c = dot(dir, uNose);
  float rts = ${TERMINATION_SHOCK_AU.toFixed(1)} * (1.0 + 0.28 * (1.0 - c));
  float t = fract(phase + uTime * 0.05);
  vT = t;
  vec3 p = dir * (2.0 + t * rts);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(1.4 * uScale / max(-mv.z, 1e-6), 1.5, 4.0);
  #include <logdepthbuf_vertex>
}
`;
const windFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uOpacity;
varying float vT;
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(p, p);
  if (d2 > 1.0) discard;
  float a = (1.0 - d2) * (1.0 - vT) * smoothstep(0.0, 0.05, vT) * uOpacity;
  gl_FragColor = vec4(vec3(1.0, 0.8, 0.45) * a, a);
}
`;

export class HeliosphereLevel extends BaseLevel {
  readonly id = 'heliosphere' as const;
  readonly unit = METERS.AU;
  private sky = new Sky('ecl', 0.5);
  private windMat: THREE.ShaderMaterial;
  private voyagerPos = VOYAGERS.map(() => new THREE.Vector3());
  private voyagerLines: THREE.Line[] = [];

  constructor() {
    super();
    this.anchors = { sun: new THREE.Vector3() };
    const nose = new THREE.Vector3(...toThree(NOSE_DIR_ECL));

    const sunGlow = glowSprite(glowTexture(), 0xffe2b0, 0.05, 1);
    (sunGlow.material as THREE.SpriteMaterial).sizeAttenuation = false;
    this.scene.add(this.sky.group, sunGlow);

    const orient = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nose);
    const ts = new THREE.Mesh(noseSurface(terminationShockRadius, 180), shellMaterial(0x4f8cff, 0.3));
    const hp = new THREE.Mesh(
      noseSurface((c) => heliopauseRadius(HELIOPAUSE_AU, c, 0.5, 3.2), 160),
      shellMaterial(0xff9a4a, 0.35),
    );
    const bow = new THREE.Mesh(
      noseSurface((c) => heliopauseRadius(230, c, 0.55, 2.6), 120),
      shellMaterial(0x9a7bff, 0.12),
    );
    for (const m of [ts, hp, bow]) {
      m.quaternion.copy(orient);
      this.scene.add(m);
    }

    // streaming solar wind
    const rand = mulberry32(3);
    const n = 6000;
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.set([s * Math.cos(a), u, s * Math.sin(a)], i * 3);
      phase[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    this.windMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uOpacity: { value: 0.6 }, uNose: { value: nose } },
      vertexShader: windVertex,
      fragmentShader: windFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const wind = new THREE.Points(geo, this.windMat);
    wind.frustumCulled = false;
    this.scene.add(wind);

    // Kuiper belt hint for continuity with the planetary level
    const kRand = mulberry32(11);
    const kn = 3000;
    const kp = new Float32Array(kn * 3);
    const kc = new Float32Array(kn * 3);
    const ks = new Float32Array(kn).fill(1.4);
    for (let i = 0; i < kn; i++) {
      const r = 30 + 20 * kRand();
      const a = kRand() * Math.PI * 2;
      kp.set(toThree([r * Math.cos(a), r * Math.sin(a), (kRand() - 0.5) * r * 0.25]), i * 3);
      kc.set([0.4, 0.48, 0.6], i * 3);
    }
    this.scene.add(createPoints(kp, kc, ks, createPointsMaterial({ minSize: 1.2, maxSize: 2 })));

    const noseAt = (r: number) => nose.clone().multiplyScalar(r);
    const sideAt = (r: number) => {
      const side = new THREE.Vector3(0, 1, 0).cross(nose).normalize();
      return side.multiplyScalar(r);
    };
    this.markers = [
      this.fixedMarker({ id: 'sun', label: '太陽', labelEn: 'Sun', kind: 'body', at: new THREE.Vector3(), sMin: 13.0, sMax: 14.9, infoId: 'Sun', jumpToS: 12.25 }),
      this.fixedMarker({ id: 'termination-shock', label: '終端震波', labelEn: 'Termination shock', kind: 'region', at: sideAt(TERMINATION_SHOCK_AU * 1.15), sMin: 13.3, sMax: 14.6, infoId: 'TerminationShock' }),
      this.fixedMarker({ id: 'heliopause', label: '日球層頂', labelEn: 'Heliopause', kind: 'region', at: noseAt(HELIOPAUSE_AU), sMin: 13.3, sMax: 14.8, infoId: 'Heliopause' }),
      this.fixedMarker({ id: 'bow', label: '弓形波（推測）', labelEn: 'Bow wave', kind: 'region', at: noseAt(230), sMin: 13.6, sMax: 14.9, infoId: 'BowWave' }),
      this.fixedMarker({ id: 'kuiper', label: '古柏帶', labelEn: 'Kuiper belt', kind: 'region', at: new THREE.Vector3(...toThree([-40, -24, 0])), sMin: 13.0, sMax: 13.9, infoId: 'KuiperBelt' }),
      ...VOYAGERS.map((v, i) => ({
        id: v.id,
        label: v.label,
        labelEn: v.labelEn,
        kind: 'probe' as const,
        position: (o: THREE.Vector3) => o.copy(this.voyagerPos[i]),
        sMin: 13.1,
        sMax: 15.0,
        infoId: v.id,
      })),
    ];
  }

  protected async build(): Promise<void> {
    const now = new Date();
    for (const p of ['Jupiter', 'Saturn', 'Uranus', 'Neptune'] as const) {
      this.scene.add(polyline(sampleOrbit(p, now, 256), 0x8899bb, 0.25));
    }
    for (const v of VOYAGERS) {
      const line = polyline([[0, 0, 0], [0, 0, 0]], 0xffffff, 0.5);
      this.voyagerLines.push(line);
      this.scene.add(line);
      void v;
    }
    await this.sky.load();
  }

  update(ctx: FrameContext): void {
    VOYAGERS.forEach((v, i) => {
      const dir = normalize(eqToEcl(raDecToVec(v.raH, v.dec)));
      const d = voyagerDistanceAu(v, ctx.date);
      const p = toThree(dir).map((x) => x * d) as Vec3;
      this.voyagerPos[i].set(...p);
      const line = this.voyagerLines[i];
      if (line) {
        const attr = line.geometry.attributes.position as THREE.BufferAttribute;
        // start the trail beyond the planets (outbound leg is roughly straight there)
        const start = toThree(dir).map((x) => x * 40) as Vec3;
        attr.setXYZ(0, ...start);
        attr.setXYZ(1, ...p);
        attr.needsUpdate = true;
      }
    });
    this.windMat.uniforms.uTime.value = ctx.elapsed;
    const pr = Math.min(window.devicePixelRatio, 2);
    this.windMat.uniforms.uScale.value = (ctx.viewportHeight * pr) / (2 * Math.tan((ctx.camera.fov * Math.PI) / 360));
    this.sky.update(ctx.camera, 1);
  }
}
