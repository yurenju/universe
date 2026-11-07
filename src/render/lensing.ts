import * as THREE from 'three';
import { DISK_PEAK, ISCO, MAX_STEPS, STEP_FRACTION, TRACE_RADIUS } from '../core/blackhole';
import type { PointsVertexHook } from './points';

/**
 * Gravitational lensing around a Schwarzschild hole at the scene origin.
 *
 * Pipeline per frame:
 *   1. the scene's foreground (jets, gas, orbits — everything except the sky,
 *      the accretion flow and the companion star) is rasterised twice, split by
 *      a clipping plane through the hole facing the camera: a *back* layer
 *      (beyond the hole) and a *front* layer (between camera and hole). The
 *      companion star writes depth first, so foreground behind it is hidden.
 *      Foreground stuff sits at finite distance, so it is not lensed by the
 *      tracer; points can bend themselves with `vertexLensHook` (thin lens).
 *   2. the sky is a cube map rendered once from `skyScene`;
 *   3. a full-screen pass traces every pixel's light ray. Rays that pass
 *      within TRACE_RADIUS·Rs are integrated with the same RK4 scheme as
 *      src/core/blackhole.ts; the bent ray then looks up the sky and the star.
 *      The accretion flow is drawn by the tracer itself so its far side bends
 *      over the hole. The back layer goes under the flow (and is swallowed by
 *      the shadow), the front layer over everything.
 */

export type FlowMode = 'disk' | 'diffuse';

export interface LensParams {
  /** Schwarzschild radius, scene units (already magnified if Magnified Bodies is on). */
  rs: number;
  /** Disk normal (scene coordinates, unit); also the rotation axis. */
  diskNormal: THREE.Vector3;
  /** Disk inner/outer radius in Rs units. */
  diskInner: number;
  diskOuter: number;
  /** Seconds, for the swirl animation. */
  time: number;
  brightness: number;
  /**
   * Optional companion star, scene units. It is drawn by the tracer itself
   * (not rasterised), so light bent around the hole can land on it.
   */
  occluder?: {
    center: THREE.Vector3;
    radius: number;
    /** World → star-body rotation; its surface pattern is fixed in this frame, so it spins with it. */
    rotation?: THREE.Matrix3;
  };
  /** false → no ray bending (straight rays with a black shadow); for slow GPUs. */
  lensing: boolean;
  /** Fade in/out of the whole close-up (applied by the compositor, kept for parity). */
  opacity?: number;
}

const vertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragment = (mode: FlowMode) => /* glsl */ `
precision highp float;
#define TRACE_R ${TRACE_RADIUS.toFixed(1)}
#define STEP_F ${STEP_FRACTION.toFixed(4)}
#define MAX_STEPS ${MAX_STEPS}
#define ISCO ${ISCO.toFixed(1)}
#define DISK_PEAK ${DISK_PEAK.toFixed(6)}
#define DIFFUSE ${mode === 'diffuse' ? 1 : 0}

uniform sampler2D tBack;
uniform sampler2D tFront;
uniform samplerCube tSky;
uniform mat4 uCamWorld;
uniform mat4 uView;
uniform mat4 uProj;
uniform vec3 uCamPos;
uniform float uRs;
uniform vec3 uN;
uniform float uInner;
uniform float uOuter;
uniform float uTime;
uniform float uBright;
uniform vec3 uOccC;
uniform float uOccR;
uniform mat3 uOccRot;
uniform float uLensing;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

vec3 sky(vec3 d) { return textureCube(tSky, d).rgb; }


vec3 tone(vec3 c) {
#if DIFFUSE == 1
  return vec3(1.0) - exp(-c); // emission adds up along the path; roll it off
#else
  return c; // the disk already saturates per layer
#endif
}

vec3 behind(vec3 d) {
  return sky(d);
}

// temperature → colour, a blackbody-ish ramp from deep red to blue-white
vec3 ramp(float t) {
  vec3 c = mix(vec3(0.55, 0.06, 0.02), vec3(1.0, 0.42, 0.08), smoothstep(0.0, 0.35, t));
  c = mix(c, vec3(1.0, 0.82, 0.55), smoothstep(0.35, 0.7, t));
  return mix(c, vec3(0.92, 0.95, 1.0), smoothstep(0.7, 1.0, t));
}

float diskTemp(float r) {
  if (r <= ISCO) return 0.0;
  return pow(r, -0.75) * pow(1.0 - sqrt(ISCO / r), 0.25);
}

// front-to-back accumulation
vec3 accC = vec3(0.0);
float accA = 0.0;
void addLayer(vec3 c, float a) {
  accC += (1.0 - accA) * c * a;
  accA += (1.0 - accA) * a;
}

// foreground layers at this pixel (premultiplied colour + alpha)
vec4 layerBack;
vec4 layerFront;

// Final colour: what the ray ends on (back), the back foreground layer unless the
// ray fell into the hole, the accumulated flow, then the front layer on top. The
// foreground is glowing, optically thin gas (and thin lines), so it adds light
// rather than covering what is behind it.
vec3 finish(vec3 back, bool swallowed) {
  if (!swallowed) back += layerBack.rgb;
  return tone(accC) + (1.0 - accA) * back + layerFront.rgb;
}

// emission where the ray (direction d) meets the disk plane at x (Rs units)
void diskEmit(vec3 x, vec3 d) {
#if DIFFUSE == 0
  float r = length(x);
  if (r < uInner || r > uOuter) return;
  float t = diskTemp(r) / DISK_PEAK; // 0…1
  // swirl pattern that winds with Keplerian shear (visual time, not real)
  vec3 e1 = normalize(cross(uN, abs(uN.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0)));
  vec3 e2 = cross(uN, e1);
  float phi = atan(dot(x, e2), dot(x, e1));
  float lr = log(r);
  float omega = 0.9 * pow(r / ISCO, -1.5);
  // periodic in angle (no seam at ±π), winding with radius
  float ang = phi - uTime * omega + lr * 1.6;
  float sw = fbm(vec2(cos(ang), sin(ang)) * 2.2 + vec2(lr * 6.0, lr * 2.0));
  // relativistic beaming and gravitational redshift
  vec3 vdir = normalize(cross(uN, x));
  float beta = sqrt(0.5 / (r - 1.0));
  float gamma = 1.0 / sqrt(1.0 - beta * beta);
  float g = sqrt(1.0 - 1.0 / r) / (gamma * (1.0 + beta * dot(vdir, d)));
  float shift = clamp(g, 0.25, 2.5);
  float temp = clamp(t * shift, 0.0, 1.2);
  // Visual brightness: the true profile (∝ T⁴) spans many orders of
  // magnitude, so compress it; the outer disk stays visible as dim red gas.
  float vis = 0.3 * pow(t, 0.22) + 0.8 * pow(t, 1.5);
  float lum = uBright * vis * shift * shift * shift * (0.5 + 0.9 * sw);
  float edge = smoothstep(uInner, uInner * 1.15, r) * (1.0 - smoothstep(uOuter * 0.6, uOuter, r));
  float a = clamp(lum * 3.0, 0.0, 0.97) * edge;
  // roll the brightness off so hot gas saturates to its colour, not to white
  vec3 col = ramp(temp) * (1.0 - exp(-lum * 1.6)) * 1.15 * edge;
  addLayer(col / max(a, 1e-4), a);
#endif
}

// a ray segment p→q crossing the disk plane
void diskCross(vec3 p, vec3 q, vec3 d) {
#if DIFFUSE == 0
  float sp = dot(p, uN), sq = dot(q, uN);
  if (sp * sq > 0.0 || sp == sq) return;
  diskEmit(mix(p, q, sp / (sp - sq)), d);
#endif
}

// hot, thin, roughly spherical gas (Sgr A*): emission along the path
void diffuseGas(vec3 p, vec3 q, vec3 d) {
#if DIFFUSE == 1
  vec3 m = 0.5 * (p + q);
  float r = length(m);
  if (r < 1.0 || r > 30.0) return;
  float ds = length(q - p);
  // emissivity concentrated within a few Rs, slightly flattened toward the spin plane
  float h = dot(m, uN) / r;
  float j = exp(-(r - 1.0) / 1.6) / (r * r) * (1.0 - 0.5 * h * h);
  vec3 vdir = normalize(cross(uN, m));
  float beta = 0.6 * sqrt(0.5 / max(r - 1.0, 0.3));
  float g = sqrt(max(1.0 - 1.0 / r, 0.0)) / (1.0 + beta * dot(vdir, d));
  float lum = uBright * j * ds * g * g * g * g;
  accC += (1.0 - accA) * vec3(1.0, 0.5, 0.16) * lum;
#endif
}

// straight segment from p along d for t in [t0, t1] (Rs units)
void straightFlow(vec3 p, vec3 d, float t0, float t1) {
#if DIFFUSE == 0
  float sp = dot(p, uN);
  float dn = dot(d, uN);
  if (abs(dn) < 1e-6) return;
  float tc = -sp / dn;
  if (tc > t0 && tc < t1) diskEmit(p + d * tc, d);
#endif
}

// Bend direction d toward the hole (at x, Rs units) by a small angle a.
vec3 bendToward(vec3 d, vec3 x, float a) {
  vec3 toHole = -x - dot(-x, d) * d;
  float l = length(toHole);
  return l > 0.0 ? normalize(d + toHole / l * a) : d;
}

// Weak-field deflection a straight ray picks up beyond TRACE_R on one side
// (same as outsideTail() in src/core/blackhole.ts).
float outsideTail(float b) {
  if (b >= TRACE_R) return 1.0 / b;
  float x0 = sqrt(TRACE_R * TRACE_R - b * b);
  return (1.0 - x0 * (2.0 * x0 * x0 + 3.0 * b * b) / (2.0 * TRACE_R * TRACE_R * TRACE_R)) / b;
}

// ---- the companion star, drawn here (not rasterised) so bent rays can hit it ----
float h3(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 51.3))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}

// Distance along the ray p + t·d (Rs units) to the star's surface, or −1.
// Uses the closest-approach form so it stays precise for a far-away start.
float starHit(vec3 p, vec3 d) {
  if (uOccR <= 0.0) return -1.0;
  vec3 oc = p - uOccC / uRs;
  float R = uOccR / uRs;
  float tc = -dot(oc, d);
  vec3 q = oc + d * tc;
  float h = R * R - dot(q, q);
  if (h <= 0.0) return -1.0;
  float t = tc - sqrt(h);
  return t > 0.0 ? t : -1.0; // only in front of the ray's start
}

// Blue supergiant surface seen along d at the hit point (granulation + limb darkening).
vec3 starShade(vec3 p, vec3 d, float t) {
  vec3 n = normalize(p + d * t - uOccC / uRs);
  float mu = clamp(dot(n, -d), 0.0, 1.0);
  float limb = 0.35 + 0.65 * pow(mu, 0.6);
  vec3 q = (uOccRot * n) * 9.0 + vec3(uTime * 0.02);
  float g = n3(q) * 0.5 + n3(q * 2.3) * 0.3 + n3(q * 5.1) * 0.2;
  return mix(vec3(0.22, 0.38, 0.85), vec3(0.62, 0.74, 0.95), g) * limb * 0.95;
}

vec3 accel(vec3 x, float h2) {
  float r2 = dot(x, x);
  return x * (-1.5 * h2 / (r2 * r2 * sqrt(r2)));
}

void main() {
  // view-space ray from the focal lengths (unprojecting the far plane loses
  // all precision with our huge far/near ratio); the [2][x] terms are the
  // off-centre shift a view offset adds
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = vec3((ndc.x + uProj[2][0]) / uProj[0][0], (ndc.y + uProj[2][1]) / uProj[1][1], -1.0);
  vec3 d = normalize((uCamWorld * vec4(dv, 0.0)).xyz);
  vec3 o = uCamPos / uRs;

  // closest approach, computed so precision survives a far-away camera
  float tc = -dot(o, d);
  vec3 perp = o + d * tc;
  float p2 = dot(perp, perp);

  // the companion star along the unbent ray
  float tStar = starHit(o, d);
  float tOcc = tStar > 0.0 ? tStar : 1e30;

  layerBack = texture2D(tBack, vUv);
  layerFront = texture2D(tFront, vUv);
  vec3 straightBehind = sky(d);

  if (uLensing < 0.5 || p2 > TRACE_R * TRACE_R || (tc < 0.0 && dot(o, o) > TRACE_R * TRACE_R)) {
    // no strong lensing: straight ray, flow drawn analytically
    straightFlow(o, d, 0.0, min(tOcc, 1e30));
    bool shadow = tc > 0.0 && p2 < 2.598 * 2.598 && tc < tOcc;
    vec3 back = shadow ? vec3(0.0) : tStar > 0.0 ? starShade(o, d, tStar) : straightBehind;
    // weak lensing of what lies behind the hole
    float bImp = sqrt(p2);
    float alpha = 2.0 / bImp + 2.9452 / (bImp * bImp) + 5.3333 / (bImp * bImp * bImp); // farDeflection()
    if (!shadow && uLensing > 0.5 && tc > 0.0 && tc < tOcc && alpha > 2e-4) {
      vec3 bent = bendToward(d, perp, alpha);
      float tb = starHit(perp, bent);
      back = tb > 0.0 ? starShade(perp, bent, tb) : behind(bent);
    }
    gl_FragColor = vec4(finish(back, shadow), 1.0);
    return;
  }

  float inside = sqrt(TRACE_R * TRACE_R - p2);
  float t0 = max(0.0, tc - inside);
  if (tOcc < t0) {
    straightFlow(o, d, 0.0, tOcc);
    gl_FragColor = vec4(finish(starShade(o, d, tOcc), false), 1.0);
    return;
  }
  straightFlow(o, d, 0.0, t0);
  vec3 x = t0 > 0.0 ? perp - d * inside : o;
  vec3 vel = d;
  vec3 hv = cross(x, vel);
  float h2 = dot(hv, hv);
  bool captured = false;
  bool escaped = false;
  for (int n = 0; n < MAX_STEPS; n++) {
    float r = length(x);
    if (r < 1.0) { captured = true; break; }
    if (r > TRACE_R && dot(x, vel) > 0.0) { escaped = true; break; }
    if (accA > 0.995) break;
    float dt = STEP_F * r;
    vec3 k1x = vel, k1v = accel(x, h2);
    vec3 k2x = vel + k1v * dt * 0.5, k2v = accel(x + k1x * dt * 0.5, h2);
    vec3 k3x = vel + k2v * dt * 0.5, k3v = accel(x + k2x * dt * 0.5, h2);
    vec3 k4x = vel + k3v * dt, k4v = accel(x + k3x * dt, h2);
    vec3 nx = x + dt / 6.0 * (k1x + 2.0 * k2x + 2.0 * k3x + k4x);
    vec3 nv = vel + dt / 6.0 * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);
    diskCross(x, nx, normalize(nx - x));
    diffuseGas(x, nx, normalize(nx - x));
    x = nx;
    vel = nv;
  }
  vec3 back = vec3(0.0);
  if (escaped) {
    // plus the weak-field bending outside the trace sphere, on the way in and out
    vec3 dd = bendToward(normalize(vel), x, 2.0 * outsideTail(sqrt(h2)));
    // the bent ray continues from x (not from the camera), so test the star from there
    float ts = starHit(x, dd);
    straightFlow(x, dd, 0.0, ts > 0.0 ? ts : 1e30);
    back = ts > 0.0 ? starShade(x, dd, ts) : behind(dd);
  } else if (!captured) {
    back = behind(normalize(vel));
  }
  gl_FragColor = vec4(finish(back, captured), 1.0);
}
`;

export class LensedRenderer {
  /** Everything drawn in front of the sky, except the accretion flow. */
  readonly foreground = new THREE.Scene();
  /** Sky at infinity, rendered once into a cube map around the origin. */
  readonly skyScene = new THREE.Scene();

  /**
   * Thin-lens bending for foreground points (chain it into their material's hook):
   * a point beyond the hole is moved to its primary image; nearer points are left alone.
   * The faint secondary image inside the Einstein ring is not drawn.
   */
  readonly vertexLensHook: PointsVertexHook = {
    declarations: /* glsl */ `
uniform float uVLensRs;
uniform float uVLensOn;
`,
    worldBody: /* glsl */ `
  if (uVLensOn > 0.5) {
    vec3 lc = cameraPosition;
    float lDl = length(lc);            // camera → hole (hole at the origin)
    vec3 lAx = -lc / lDl;
    vec3 lRel = wp.xyz - lc;
    float lZ = dot(lRel, lAx);         // camera → source, along the axis
    if (lZ > lDl) {
      vec3 lTr = lRel - lAx * lZ;
      float lTrL = length(lTr);
      float lBeta = lTrL / lZ;
      // θE² = 2 Rs · D_ls / (D_l · D_s); primary image θ = (β + √(β² + 4θE²)) / 2
      float lThE2 = 2.0 * uVLensRs * (lZ - lDl) / (lDl * lZ);
      float lTheta = 0.5 * (lBeta + sqrt(lBeta * lBeta + 4.0 * lThE2));
      if (lTrL > 0.0) wp.xyz = lc + lAx * lZ + lTr / lTrL * (lTheta * lZ);
    }
  }
`,
    uniforms: { uVLensRs: { value: 1 }, uVLensOn: { value: 1 } },
  };

  private fgBack: THREE.WebGLRenderTarget;
  private fgFront: THREE.WebGLRenderTarget;
  /** Depth-only stand-in for the companion star, so foreground behind it is hidden. */
  private occluder = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ colorWrite: false }));
  private backPlane = new THREE.Plane();
  private frontPlane = new THREE.Plane();
  private axis = new THREE.Vector3();
  private cube = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType });
  private cubeCamera = new THREE.CubeCamera(0.01, 10, this.cube);
  private cubeReady = false;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private clear = new THREE.Color();

  constructor(mode: FlowMode) {
    this.fgBack = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.fgFront = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.occluder.renderOrder = -1;
    this.occluder.visible = false;
    this.foreground.add(this.occluder);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tBack: { value: this.fgBack.texture },
        tFront: { value: this.fgFront.texture },
        tSky: { value: this.cube.texture },
        uCamWorld: { value: new THREE.Matrix4() },
        uView: { value: new THREE.Matrix4() },
        uProj: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uRs: { value: 1 },
        uN: { value: new THREE.Vector3(0, 1, 0) },
        uInner: { value: ISCO },
        uOuter: { value: 100 },
        uTime: { value: 0 },
        uBright: { value: 1 },
        uOccC: { value: new THREE.Vector3() },
        uOccR: { value: 0 },
        uOccRot: { value: new THREE.Matrix3() },
        uLensing: { value: 1 },
      },
      vertexShader: vertex,
      fragmentShader: fragment(mode),
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  /** Re-render the sky cube next frame (after the sky scene changes). */
  invalidateSky(): void {
    this.cubeReady = false;
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, target: THREE.WebGLRenderTarget, p: LensParams): void {
    for (const t of [this.fgBack, this.fgFront]) if (t.width !== target.width || t.height !== target.height) t.setSize(target.width, target.height);
    const prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clear);

    if (!this.cubeReady) {
      renderer.setClearColor(0x000000, 1);
      this.cubeCamera.update(renderer, this.skyScene);
      this.cubeReady = true;
    }

    this.occluder.visible = !!p.occluder;
    if (p.occluder) {
      this.occluder.position.copy(p.occluder.center);
      this.occluder.scale.setScalar(p.occluder.radius);
    }
    this.vertexLensHook.uniforms!.uVLensRs.value = p.rs;
    this.vertexLensHook.uniforms!.uVLensOn.value = p.lensing ? 1 : 0;
    // split the foreground at the plane through the hole, facing the camera
    this.axis.copy(camera.position).negate().normalize();
    this.backPlane.set(this.axis, 0);
    this.frontPlane.set(this.axis.negate(), 0);
    const prevPlanes = renderer.clippingPlanes;
    renderer.setClearColor(0x000000, 0);
    for (const [layer, plane] of [[this.fgBack, this.backPlane], [this.fgFront, this.frontPlane]] as const) {
      renderer.clippingPlanes = [plane];
      renderer.setRenderTarget(layer);
      renderer.clear();
      renderer.render(this.foreground, camera);
    }
    renderer.clippingPlanes = prevPlanes;
    renderer.setClearColor(this.clear, prevAlpha);

    const u = this.material.uniforms;
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uView.value.copy(camera.matrixWorldInverse);
    u.uProj.value.copy(camera.projectionMatrix);
    u.uCamPos.value.copy(camera.position);
    u.uRs.value = p.rs;
    u.uN.value.copy(p.diskNormal);
    u.uInner.value = p.diskInner;
    u.uOuter.value = p.diskOuter;
    u.uTime.value = p.time;
    u.uBright.value = p.brightness;
    u.uOccR.value = p.occluder?.radius ?? 0;
    if (p.occluder) u.uOccC.value.copy(p.occluder.center);
    if (p.occluder?.rotation) u.uOccRot.value.copy(p.occluder.rotation);
    else u.uOccRot.value.identity();
    u.uLensing.value = p.lensing ? 1 : 0;

    renderer.setRenderTarget(target);
    renderer.render(this.quadScene, this.quadCamera);
  }
}
