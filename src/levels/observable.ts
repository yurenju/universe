import * as THREE from 'three';
import { eqToGal, raDecToVec, sphereTextureBasis, toThree } from '../core/frames';
import type { FrameContext } from '../core/level';
import { METERS } from '../core/scale';
import { basisToMatrix } from '../core/sphere';
import { loadTexture, mulberry32 } from '../render/assets';
import { buildWeb, randomInSphere, type WebNode } from '../render/cosmicWeb';
import { createPoints, createPointsMaterial, updatePointsScale } from '../render/points';
import { BaseLevel } from './base';
import { LANIAKEA_CENTER_POS } from './laniakea';

/** Comoving radius of the observable universe, Gly. */
export const OBSERVABLE_RADIUS_GLY = 46.5;

const cmbVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDir;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vDir = normalize(position);
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;
const cmbFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform float hasMap;
uniform float uOpacity;
varying vec3 vDir;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 planck(float t) {
  // dark blue → light blue → cream → orange → red
  vec3 c = mix(vec3(0.0, 0.05, 0.35), vec3(0.3, 0.6, 0.95), smoothstep(0.0, 0.35, t));
  c = mix(c, vec3(0.98, 0.92, 0.78), smoothstep(0.35, 0.55, t));
  c = mix(c, vec3(0.95, 0.5, 0.15), smoothstep(0.55, 0.75, t));
  return mix(c, vec3(0.6, 0.08, 0.05), smoothstep(0.75, 1.0, t));
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 col;
  if (hasMap > 0.5) {
    // sky maps are drawn as seen from inside: mirror U (custom shader, so no texture transform)
    col = texture2D(map, vec2(1.0 - vUv.x, vUv.y)).rgb;
  } else {
    float n = 0.0, a = 0.5;
    vec3 p = vDir * 6.0;
    for (int i = 0; i < 5; i++) { n += a * noise(p); p *= 2.1; a *= 0.5; }
    col = planck(clamp((n - 0.2) / 0.6, 0.0, 1.0));
  }
  // a translucent shell: faint face-on so the cosmic web inside stays visible,
  // brighter toward the limb where we look through more of it
  float rim = 1.0 - abs(dot(normalize(vNormalW), normalize(cameraPosition - vPosW)));
  float k = (0.1 + 0.6 * pow(rim, 1.6)) * uOpacity;
  gl_FragColor = vec4(col * k, k);
}
`;

export class ObservableLevel extends BaseLevel {
  readonly id = 'observable-universe' as const;
  readonly unit = METERS.GLY;
  private galaxyMat = createPointsMaterial({ attenuate: true, minSize: 1.2, maxSize: 8, softness: 3 });
  private cmbMat: THREE.ShaderMaterial;

  constructor() {
    super();
    this.anchors = {
      'laniakea-center': LANIAKEA_CENTER_POS.clone().multiplyScalar(1e-3),
      sun: new THREE.Vector3(),
    };
    this.cmbMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, hasMap: { value: 0 }, uOpacity: { value: 1 } },
      vertexShader: cmbVertex,
      fragmentShader: cmbFragment,
      side: THREE.BackSide,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
    const cmb = new THREE.Mesh(new THREE.SphereGeometry(OBSERVABLE_RADIUS_GLY, 128, 64), this.cmbMat);
    cmb.renderOrder = -5;
    // Planck maps are in galactic coordinates; this level's frame is galactic
    const m = basisToMatrix(sphereTextureBasis([1, 0, 0], [0, 0, 1]));
    cmb.matrixAutoUpdate = false;
    cmb.matrix.copy(m);
    this.scene.add(cmb);

    const atEq = (raH: number, dec: number, d: number) => new THREE.Vector3(...toThree(eqToGal(raDecToVec(raH, dec, d))));
    this.markers = [
      this.fixedMarker({ id: 'here', label: '你在這裡（銀河系）', labelEn: 'You are here', kind: 'here', at: new THREE.Vector3(), sMin: 25.0, sMax: 27.5, infoId: 'ObserverCentre', jumpToS: 24.75 }),
      this.fixedMarker({ id: 'laniakea', label: '拉尼亞凱亞', labelEn: 'Laniakea', kind: 'region', at: LANIAKEA_CENTER_POS.clone().multiplyScalar(1e-3), sMin: 25.0, sMax: 26.0, infoId: 'Laniakea', jumpToS: 24.75 }),
      this.fixedMarker({ id: 'sloan', label: '斯隆長城', labelEn: 'Sloan Great Wall', kind: 'region', at: atEq(13, 2, 1.0), sMin: 25.4, sMax: 26.4, infoId: 'SloanWall' }),
      this.fixedMarker({ id: 'hercules', label: '武仙－北冕座長城', labelEn: 'Hercules–Corona Borealis Great Wall', kind: 'region', at: atEq(16.2, 32, 17.3), sMin: 26.0, sMax: 27.3, infoId: 'HerculesWall' }),
      this.fixedMarker({ id: 'hudf', label: '哈伯極深空看向這裡', labelEn: 'Hubble Ultra Deep Field direction', kind: 'region', at: atEq(3 + 32.65 / 60, -27.79, 30), sMin: 26.2, sMax: 27.5, infoId: 'HUDF' }),
      this.fixedMarker({ id: 'cmb', label: '宇宙微波背景', labelEn: 'Cosmic microwave background', kind: 'region', at: new THREE.Vector3(0, OBSERVABLE_RADIUS_GLY, 0), sMin: 26.4, sMax: 27.5, infoId: 'CMB' }),
      this.fixedMarker({ id: 'edge', label: '可觀測宇宙邊界（465 億光年）', labelEn: 'Edge of the observable universe', kind: 'region', at: new THREE.Vector3(OBSERVABLE_RADIUS_GLY, 0, 0), sMin: 26.4, sMax: 27.5, infoId: 'ObservableEdge' }),
    ];
  }

  protected async build(): Promise<void> {
    const rand = mulberry32(1337);
    const nodes: WebNode[] = [];
    for (let i = 0; i < 900; i++) nodes.push({ p: randomInSphere(rand, OBSERVABLE_RADIUS_GLY * 0.97), w: 0.3 + rand() });
    const web = buildWeb(nodes, {
      seed: 1338,
      points: 220000,
      clumpFraction: 0.3,
      clumpRadius: 0.9,
      filamentWidth: 0.35,
      neighbours: 3,
      colorize: (p, r) => {
        // more distant = seen younger and redshifted: fade and redden toward the edge
        const f = p.length() / OBSERVABLE_RADIUS_GLY;
        const k = (0.3 + r() * 0.35) * (1 - 0.6 * f);
        return [k * (0.75 + 0.35 * f), k * (0.8 - 0.1 * f), k * (1.0 - 0.45 * f)];
      },
      size: (r) => 0.08 + r() * 0.12,
    });
    this.scene.add(createPoints(web.pos, web.col, web.size, this.galaxyMat));

    const tex = await loadTexture('textures/cmb.jpg');
    if (tex) {
      this.cmbMat.uniforms.map.value = tex;
      this.cmbMat.uniforms.hasMap.value = 1;
    }
  }

  update(ctx: FrameContext): void {
    updatePointsScale(this.galaxyMat, ctx.camera, ctx.viewportHeight);
  }
}
