import * as THREE from 'three';
import {
  CYG_X1,
  CYG_X1_DISK_OUTER_M,
  CYG_X1_STAR_RADIUS_M,
  cygX1Orbit,
} from '../content/blackholes';
import { ISCO, schwarzschildRadius } from '../core/blackhole';
import { CLOSE_UP_RANGES } from '../core/closeUp';
import { toThree } from '../core/frames';
import type { FrameContext } from '../core/level';
import { dateToJulianYear, orbitNormalSky, skyBasisGal, skyPosition, skyToGal } from '../core/orbit';
import { METERS } from '../core/scale';
import { SPEED_OF_LIGHT } from '../core/units';
import { gaussian, mulberry32 } from '../render/assets';
import { LensedRenderer } from '../render/lensing';
import { chainHooks, createPoints, createPointsMaterial, updatePointsScale } from '../render/points';
import { glowSprite, glowTexture } from '../render/primitives';
import { BaseCloseUp, galToScene, lensQuality, starfield } from './common';

const RS = schwarzschildRadius(CYG_X1.massBH);
const AU_IN_RS = METERS.AU / RS;
const STAR_R = CYG_X1_STAR_RADIUS_M / RS;

// Jet flow, driven by Sim Time (all distances in Rs, times in simulated seconds).
// Gas leaves ~20 Rs from the hole, accelerates (speed ∝ distance, so every zoom
// level sees motion) until JET_COAST_FROM, then coasts at JET_SPEED to the tip.
const JET_SPEED = (0.5 * SPEED_OF_LIGHT) / RS; // ~0.5 c (published estimates ≳ 0.6 c)
const JET_BASE = 20;
const JET_COAST_FROM = (3 * METERS.AU) / RS;
const JET_TIP = (CYG_X1.jetLengthAU * METERS.AU) / RS;
const JET_ACCEL_RATE = JET_SPEED / JET_COAST_FROM; // 1/s, exponential growth while accelerating
const JET_ACCEL_TIME = Math.log(JET_COAST_FROM / JET_BASE) / JET_ACCEL_RATE;
const JET_PERIOD = JET_ACCEL_TIME + (JET_TIP - JET_COAST_FROM) / JET_SPEED; // base to tip
/** Brighter knots are launched about this often; a whole number of them fits in one period. */
const JET_KNOTS = Math.round(JET_PERIOD / (2 * 3600));
/** Faster Sim Time than this just strobes the jet, so it is capped (simulated s per real s). */
const JET_MAX_RATE = 6 * 3600;

const jetHook = {
  declarations: /* glsl */ `
attribute float seed;
uniform float uJetT;
uniform float uPeriod;
uniform float uAccelT;
uniform float uAccelK;
uniform float uBase;
uniform float uCoast;
uniform float uSpeed;
uniform float uTip;
uniform float uKnots;
float jetHash(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
`,
  // position = (transverse offset per unit distance, side ±1); size = per unit distance
  body: /* glsl */ `
  float tau = mod(seed * uPeriod + uJetT, uPeriod);
  float d = tau < uAccelT ? uBase * exp(uAccelK * tau) : uCoast + uSpeed * (tau - uAccelT);
  pos = position * d;
  sz = size * d;
  // emission time stays fixed while the particle flies, so knots travel outward with the gas
  float kn = (uJetT - tau) / uPeriod * uKnots;
  float strength = 0.5 + jetHash(mod(floor(kn + 0.5), uKnots));
  float knot = pow(0.5 + 0.5 * cos(6.2831853 * kn), 6.0) * strength;
  float fade = min(0.5, 0.25 * pow(d / uTip, -0.12)); // brighter near the base
  col = color * fade * (0.45 + 1.6 * knot);
`,
  worldBody: /* glsl */ `
  // Relativistic beaming toward the camera: the jet coming at you outshines the
  // one going away: δ = 1 / γ(1 − β cos θ), brightness ∝ δ^(2−α) with α ≈ −0.5
  // (flat radio spectrum), which also tames the far jet piling up in perspective.
  vec3 toCam = cameraPosition - wp.xyz;
  float camDist = length(toCam);
  vec3 flowDir = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, position.z));
  float beta = 0.5 * min(1.0, d / uCoast);
  float dop = 1.0 / (inversesqrt(1.0 - beta * beta) * (1.0 - beta * dot(flowDir, toCam / camDist)));
  col *= 0.2 * pow(dop, 2.5);
  // gas passing right by the camera would fill the screen with big blobs: fade it
  col *= 1.0 - smoothstep(0.01, 0.05, sz / camDist);
`,
  uniforms: {
    uJetT: { value: 0 },
    uPeriod: { value: JET_PERIOD },
    uAccelT: { value: JET_ACCEL_TIME },
    uAccelK: { value: JET_ACCEL_RATE },
    uBase: { value: JET_BASE },
    uCoast: { value: JET_COAST_FROM },
    uSpeed: { value: JET_SPEED },
    uTip: { value: JET_TIP },
    uKnots: { value: JET_KNOTS },
  },
};

/** Close-up of Cygnus X-1: the black hole, its disk and jets, and the supergiant HDE 226868. */
export class CygnusX1CloseUp extends BaseCloseUp {
  readonly id = 'cygnus-x1' as const;
  /** One scene unit is the (true) Schwarzschild radius, ~63 km. */
  readonly unit = RS;
  readonly defaultView: { yaw: number; pitch: number };

  private lens = new LensedRenderer('disk');
  private orbit = cygX1Orbit();
  private basis = skyBasisGal(CYG_X1.raHours, CYG_X1.decDeg);
  private normal = new THREE.Vector3();
  private starPos = new THREE.Vector3();
  private starGlow: THREE.Sprite;
  private stream: THREE.Points;
  private streamSeeds: Float32Array;
  private streamMat = createPointsMaterial({ attenuate: true, minSize: 1.2, maxSize: 26, softness: 2.5, vertexHook: this.lens.vertexLensHook });
  private jets = new THREE.Group();
  private jetMat = createPointsMaterial({ attenuate: true, minSize: 1.4, maxSize: 30, softness: 3, vertexHook: chainHooks(jetHook, this.lens.vertexLensHook) });
  /** Simulated seconds of jet flow, wrapped to one period. */
  private jetTime = 0;
  private lastSimMs: number | null = null;
  private starRot = new THREE.Matrix3();
  private diskMarkerPos = new THREE.Vector3();
  private jetMarkerPos = new THREE.Vector3();
  private frameBasis = new THREE.Matrix4();
  private rsScene = 1;
  private diskOuter = 1;
  private time = 0;

  constructor() {
    super();
    // open looking at the system from Earth's direction
    const toEarth = toThree(skyToGal(this.basis, [0, 0, -1]));
    this.defaultView = { yaw: Math.atan2(toEarth[0], toEarth[2]), pitch: Math.asin(toEarth[1]) };

    galToScene(skyToGal(this.basis, orbitNormalSky(this.orbit)), 1, this.normal).normalize();

    this.starGlow = glowSprite(
      glowTexture([[0, 'rgba(160,190,255,0.5)'], [0.32, 'rgba(110,150,255,0.22)'], [0.6, 'rgba(80,120,255,0.05)'], [1, 'rgba(70,110,255,0)']]),
      0xffffff,
      STAR_R * 3.2,
      0.9,
    );
    // the star's surface is drawn by the lensing tracer (see LensParams.occluder); only its glow is rasterised
    this.lens.foreground.add(this.starGlow);

    // Gas pulled from the supergiant toward the hole (focused wind), drawn in a
    // local frame: +x toward the star, +z along the orbit axis.
    const n = 5000;
    const rand = mulberry32(61);
    this.streamSeeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.streamSeeds.set([rand(), gaussian(rand), gaussian(rand)], i * 3);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    this.stream = createPoints(pos, col, size, this.streamMat);
    this.stream.matrixAutoUpdate = false;
    this.lens.foreground.add(this.stream);

    this.buildJets();
    this.lens.foreground.add(this.jets);
    this.jets.matrixAutoUpdate = false;

    const origin = new THREE.Vector3();
    this.markers = [
      this.liveMarker({ id: 'bh', label: '黑洞（事件視界）', labelEn: 'Black hole — event horizon', kind: 'body', sMin: 4, sMax: 12.4, infoId: 'cyg:bh' }, origin),
      this.liveMarker({ id: 'star', label: '伴星 HDE 226868', labelEn: 'Supergiant HDE 226868', kind: 'body', sMin: 10.2, sMax: 12.4, infoId: 'cyg:star' }, this.starPos),
      this.liveMarker({ id: 'disk', label: '吸積盤', labelEn: 'Accretion disk', kind: 'region', sMin: 8.9, sMax: 10.9, infoId: 'cyg:disk' }, this.diskMarkerPos),
      this.liveMarker({ id: 'jet', label: '噴流', labelEn: 'Jet', kind: 'region', sMin: 10.3, sMax: 12.4, infoId: 'cyg:jet' }, this.jetMarkerPos),
    ];
  }

  protected async build(): Promise<void> {
    this.lens.skyScene.add(starfield(9000, 7, [0.75, 0.8, 0.95], 0.55));
  }

  /** Jet particles; where each one is along the jet is worked out on the GPU (see jetHook). */
  private buildJets(): void {
    const rand = mulberry32(17);
    const n = 24000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const w = 0.02 * Math.abs(gaussian(rand)); // opening angle ~2°
      const a = rand() * Math.PI * 2;
      pos.set([w * Math.cos(a), w * Math.sin(a), side], i * 3);
      col.set([0.7, 0.82, 1.0], i * 3); // beaming is applied per view in jetHook

      size[i] = 0.012;
      seed[i] = rand();
    }
    const pts = createPoints(pos, col, size, this.jetMat);
    pts.geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.jets.add(pts);
  }

  /** Advance the jet with Sim Time, capped so fast rates (and jumps like "back to now") don't strobe. */
  private advanceJet(ctx: FrameContext): void {
    const ms = ctx.date.getTime();
    const dSim = this.lastSimMs === null ? 0 : (ms - this.lastSimMs) / 1000;
    this.lastSimMs = ms;
    const cap = JET_MAX_RATE * ctx.dt;
    const t = this.jetTime + THREE.MathUtils.clamp(dSim, -cap, cap);
    this.jetTime = ((t % JET_PERIOD) + JET_PERIOD) % JET_PERIOD;
    this.jetMat.uniforms.uJetT.value = this.jetTime;
  }

  update(ctx: FrameContext): void {
    this.time = ctx.elapsed;
    if (ctx.weight > 0.99) lensQuality.sample(ctx.dt);
    const f = ctx.magnify ? CLOSE_UP_RANGES['cygnus-x1'].magnifyFactor : 1;
    this.rsScene = f;
    this.diskOuter = CYG_X1_DISK_OUTER_M / (RS * f);

    // supergiant position relative to the hole, from the orbital ephemeris
    const sky = skyPosition(this.orbit, dateToJulianYear(ctx.date));
    galToScene(skyToGal(this.basis, sky), AU_IN_RS, this.starPos);
    this.starGlow.position.copy(this.starPos);

    // local frame: x toward the star (in the orbital plane), z along the orbit axis
    const z = this.normal;
    const x = this.starPos.clone().addScaledVector(z, -this.starPos.dot(z)).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    this.frameBasis.makeBasis(x, y, z);
    this.stream.matrix.copy(this.frameBasis);
    this.jets.matrix.copy(this.frameBasis);
    const towardUs = galToScene(skyToGal(this.basis, [0, 0, -1]));
    this.updateStream(this.starPos.length());
    // tidally locked: the supergiant turns once per orbit, keeping one face to the hole
    this.starRot.setFromMatrix4(this.frameBasis).transpose();
    this.advanceJet(ctx);

    this.diskMarkerPos.copy(y).multiplyScalar((CYG_X1_DISK_OUTER_M / RS) * 0.7);
    this.jetMarkerPos.copy(z).multiplyScalar(((z.dot(towardUs) >= 0 ? 1 : -1) * 0.6 * METERS.AU) / RS);

    updatePointsScale(this.streamMat, ctx.camera, ctx.viewportHeight);
    updatePointsScale(this.jetMat, ctx.camera, ctx.viewportHeight);
  }

  /** Gas leaves near L1, is swept ahead by the orbit (Coriolis) and wraps into the disk. */
  private updateStream(sep: number): void {
    const geo = this.stream.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const size = geo.getAttribute('size') as THREE.BufferAttribute;
    const start = sep - STAR_R * 0.98;
    const end = (CYG_X1_DISK_OUTER_M / RS) * 0.85;
    const n = pos.count;
    for (let i = 0; i < n; i++) {
      const p = (this.streamSeeds[i * 3] + this.time * 0.05) % 1;
      const r = start + (end - start) * Math.pow(p, 0.75);
      const th = 1.3 * Math.pow(p, 1.6);
      const spread = (0.06 + 0.22 * p) * STAR_R * 0.5;
      const gx = this.streamSeeds[i * 3 + 1] * spread;
      const gz = this.streamSeeds[i * 3 + 2] * spread * 0.4;
      pos.setXYZ(i, r * Math.cos(th) + gx * Math.cos(th), r * Math.sin(th) + gx * Math.sin(th), gz);
      const fade = Math.sin(Math.PI * Math.min(1, p * 1.15)) * 0.22;
      col.setXYZ(i, fade * (0.45 + 0.55 * p), fade * (0.6 - 0.15 * p), fade * (1.0 - 0.6 * p));
      size.setX(i, spread * 0.1 + STAR_R * 0.006);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    size.needsUpdate = true;
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, target: THREE.WebGLRenderTarget): void {
    this.lens.render(renderer, camera, target, {
      rs: this.rsScene,
      diskNormal: this.normal,
      diskInner: ISCO,
      diskOuter: this.diskOuter,
      time: this.time,
      brightness: 1.0,
      occluder: { center: this.starPos, radius: STAR_R, rotation: this.starRot },
      lensing: lensQuality.enabled,
    });
  }
}

