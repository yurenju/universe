import * as THREE from 'three';
import { loadTexture } from './assets';

const vertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const surfaceFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D cloudMap;
uniform float hasDay;
uniform float hasNight;
uniform float hasClouds;
uniform vec3 sunDir;
uniform float cloudShift;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormalW);
  float ndl = dot(n, sunDir);
  vec3 day = hasDay > 0.5 ? texture2D(dayMap, vUv).rgb : vec3(0.08, 0.2, 0.45);
  vec3 night = hasNight > 0.5 ? texture2D(nightMap, vUv).rgb : vec3(0.0);
  float cloud = hasClouds > 0.5 ? texture2D(cloudMap, vUv + vec2(cloudShift, 0.0)).r : 0.0;
  float light = clamp(ndl, 0.0, 1.0);
  vec3 lit = day * (light * 1.6 + 0.004);
  lit = mix(lit, vec3(1.0) * light * 1.5, cloud * 0.85);
  // city lights on the night side, dimmed by clouds
  float nightMask = smoothstep(0.05, -0.15, ndl);
  lit += night * nightMask * (1.0 - cloud * 0.8) * 1.4;
  // warm terminator
  float term = smoothstep(-0.05, 0.1, ndl) * smoothstep(0.35, 0.0, ndl);
  lit += vec3(0.25, 0.08, 0.02) * term * 0.15;
  gl_FragColor = vec4(lit, 1.0);
}
`;

const atmosphereFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 sunDir;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  float rim = pow(1.0 - abs(dot(n, v)), 2.5);
  float day = smoothstep(-0.25, 0.4, dot(n, sunDir));
  vec3 col = mix(vec3(0.25, 0.45, 1.0), vec3(0.55, 0.75, 1.0), day) * rim * day * 1.4;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Earth with day/night textures, clouds and a thin atmosphere rim. */
export class EarthMesh {
  readonly group = new THREE.Group();
  readonly surface: THREE.Mesh;
  private surfaceMat: THREE.ShaderMaterial;
  private atmoMat: THREE.ShaderMaterial;

  constructor() {
    this.surfaceMat = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: null },
        nightMap: { value: null },
        cloudMap: { value: null },
        hasDay: { value: 0 },
        hasNight: { value: 0 },
        hasClouds: { value: 0 },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        cloudShift: { value: 0 },
      },
      vertexShader: vertex,
      fragmentShader: surfaceFragment,
    });
    this.atmoMat = new THREE.ShaderMaterial({
      uniforms: { sunDir: this.surfaceMat.uniforms.sunDir },
      vertexShader: vertex,
      fragmentShader: atmosphereFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.surface = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), this.surfaceMat);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.018, 96, 48), this.atmoMat);
    this.surface.add(atmo);
    this.surface.matrixAutoUpdate = false;
    this.group.add(this.surface);
  }

  async load(): Promise<void> {
    const [day, night, clouds] = await Promise.all([
      loadTexture('textures/earth_day.jpg'),
      loadTexture('textures/earth_night.jpg'),
      loadTexture('textures/earth_clouds.jpg', THREE.NoColorSpace),
    ]);
    const u = this.surfaceMat.uniforms;
    if (day) (u.dayMap.value = day), (u.hasDay.value = 1);
    if (night) (u.nightMap.value = night), (u.hasNight.value = 1);
    if (clouds) {
      clouds.wrapS = THREE.RepeatWrapping;
      u.cloudMap.value = clouds;
      u.hasClouds.value = 1;
    }
  }

  /** sunDir in scene (Three) coordinates. */
  setSun(dir: THREE.Vector3): void {
    (this.surfaceMat.uniforms.sunDir.value as THREE.Vector3).copy(dir).normalize();
  }

  setCloudDrift(elapsed: number): void {
    this.surfaceMat.uniforms.cloudShift.value = (elapsed * 0.0004) % 1;
  }
}
