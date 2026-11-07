import * as THREE from 'three';

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

const textureLoader = new THREE.TextureLoader();
const cache = new Map<string, Promise<THREE.Texture | null>>();

/**
 * Load a colour texture (sRGB). Resolves to null instead of rejecting when the
 * file is missing, so a level can fall back to a procedural look.
 */
export function loadTexture(path: string, colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace): Promise<THREE.Texture | null> {
  const key = `${path}|${colorSpace}`;
  let p = cache.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      textureLoader.load(
        assetUrl(path),
        (tex) => {
          tex.colorSpace = colorSpace;
          tex.anisotropy = 4;
          resolve(tex);
        },
        undefined,
        () => {
          console.warn(`texture missing: ${path}`);
          resolve(null);
        },
      );
    });
    cache.set(key, p);
  }
  return p;
}

export async function loadFloat32(path: string): Promise<Float32Array> {
  const res = await fetch(assetUrl(path));
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return new Float32Array(await res.arrayBuffer());
}

export async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(assetUrl(path));
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

/** Deterministic PRNG so procedural structures look the same on every visit. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number): number {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
