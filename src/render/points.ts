import * as THREE from 'three';

const vertex = (hook: PointsVertexHook | undefined) => /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
attribute float size;
attribute vec3 color;
uniform float uScale;      // pixels per world unit at distance 1
uniform float uAttenuate;  // 0 = size is pixels, 1 = size is world units
uniform float uMinSize;
uniform float uMaxSize;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vFade;
${hook?.declarations ?? ''}
void main() {
  vec3 pos = position;
  float sz = size;
  vec3 col = color;
  ${hook?.body ?? ''}
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  ${hook?.worldBody ?? ''}
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  float px = mix(sz * uPixelRatio, sz * uScale / max(-mvPosition.z, 1e-9), uAttenuate);
  // Points smaller than the minimum keep the minimum size but dim instead,
  // so tiny distant things fade out rather than flicker.
  vFade = clamp(px / uMinSize, 0.0, 1.0);
  gl_PointSize = clamp(px, uMinSize, uMaxSize);
  vColor = col;
  #include <clipping_planes_vertex>
  #include <logdepthbuf_vertex>
}
`;

const fragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
uniform float uOpacity;
uniform float uSoftness;
varying vec3 vColor;
varying float vFade;
void main() {
  #include <clipping_planes_fragment>
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(p, p);
  if (d2 > 1.0) discard;
  float core = exp(-d2 * uSoftness);
  float a = core * (1.0 - d2) * vFade * uOpacity;
  gl_FragColor = vec4(vColor * a, a);
}
`;

export interface PointsOptions {
  /** Interpret `size` as world units (true) or CSS pixels (false). */
  attenuate?: boolean;
  minSize?: number;
  maxSize?: number;
  opacity?: number;
  softness?: number;
  blending?: THREE.Blending;
  /** Move or restyle points on the GPU (e.g. animate them without re-uploading buffers). */
  vertexHook?: PointsVertexHook;
}

/**
 * GLSL spliced into the points vertex shader. `body` runs first in main() and may
 * rewrite `pos` (model space), `sz` (the size attribute's meaning) and `col`;
 * `worldBody` then runs with the world position `wp` and may rewrite it, `sz` or `col`.
 * The built-in `cameraPosition` (world) is available to both.
 */
export interface PointsVertexHook {
  declarations?: string;
  body?: string;
  worldBody?: string;
  uniforms?: Record<string, THREE.IUniform>;
}

/** Run hooks one after the other (declarations and uniforms are pooled). */
export function chainHooks(...hooks: PointsVertexHook[]): PointsVertexHook {
  return {
    declarations: hooks.map((h) => h.declarations ?? '').join('\n'),
    body: hooks.map((h) => h.body ?? '').join('\n'),
    worldBody: hooks.map((h) => h.worldBody ?? '').join('\n'),
    uniforms: Object.assign({}, ...hooks.map((h) => h.uniforms ?? {})),
  };
}

export function createPointsMaterial(opts: PointsOptions = {}): THREE.ShaderMaterial {
  const darken = opts.blending === THREE.SubtractiveBlending;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 1 },
      uAttenuate: { value: opts.attenuate ? 1 : 0 },
      uMinSize: { value: opts.minSize ?? 1.5 },
      uMaxSize: { value: opts.maxSize ?? 64 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uOpacity: { value: opts.opacity ?? 1 },
      uSoftness: { value: opts.softness ?? 3 },
      ...opts.vertexHook?.uniforms,
    },
    vertexShader: vertex(opts.vertexHook),
    clipping: true, // honours renderer.clippingPlanes (see LensedRenderer's depth layers)
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: darken ? THREE.CustomBlending : (opts.blending ?? THREE.AdditiveBlending),
  });
  if (darken) {
    // dst = dst × (1 − src): dust dims whatever is behind it
    mat.blendEquation = THREE.AddEquation;
    mat.blendSrc = THREE.ZeroFactor;
    mat.blendDst = THREE.OneMinusSrcColorFactor;
  }
  return mat;
}

/**
 * Build THREE.Points from flat arrays. `sizes` are pixels or world units
 * depending on the material.
 */
export function createPoints(
  positions: Float32Array,
  colors: Float32Array,
  sizes: Float32Array,
  material: THREE.ShaderMaterial,
): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.computeBoundingSphere();
  const pts = new THREE.Points(geo, material);
  pts.frustumCulled = false;
  return pts;
}

/** Keep world-size points correct: call each frame with the level camera. */
export function updatePointsScale(material: THREE.ShaderMaterial, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
  const pr = Math.min(window.devicePixelRatio, 2);
  material.uniforms.uScale.value = (viewportHeight * pr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
