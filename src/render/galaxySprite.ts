import * as THREE from 'three';
import { mulberry32, gaussian } from './assets';

export interface GalaxyLook {
  arms: number;
  /** Winding tightness; larger = more tightly wound. */
  wind: number;
  /** Colour of the old central bulge. */
  core: [number, number, number];
  /** Colour of young stars in the arms. */
  arm: [number, number, number];
  /** 0 = smooth elliptical/dwarf, 1 = strong spiral. */
  spiral: number;
  bar?: boolean;
  seed: number;
}

const cache = new Map<string, THREE.Texture>();

/** Face-on galaxy image painted on a canvas (used where no photo exists). */
export function galaxyTexture(look: GalaxyLook, size = 512): THREE.Texture {
  const key = JSON.stringify(look) + size;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  const rand = mulberry32(look.seed);
  const cx = size / 2;
  const R = size * 0.46;

  const dot = (x: number, y: number, r: number, col: [number, number, number], a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`);
    grad.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  };

  // diffuse disk
  for (let i = 0; i < 2500; i++) {
    const r = Math.abs(gaussian(rand)) * R * 0.35;
    const a = rand() * Math.PI * 2;
    dot(cx + r * Math.cos(a), cx + r * Math.sin(a), size * 0.04, look.core, 0.025);
  }
  // spiral arms
  const n = Math.floor(9000 * look.spiral);
  for (let i = 0; i < n; i++) {
    const arm = Math.floor(rand() * look.arms);
    const t = Math.pow(rand(), 0.8);
    const r = R * (0.12 + 0.88 * t);
    const phi = (arm / look.arms) * Math.PI * 2 + Math.log(r / (R * 0.12)) * look.wind + gaussian(rand) * 0.22;
    const x = cx + r * Math.cos(phi);
    const y = cx + r * Math.sin(phi);
    const pink = rand() < 0.04;
    dot(x, y, size * (0.006 + rand() * 0.012), pink ? [255, 120, 170] : look.arm, pink ? 0.5 : 0.18);
  }
  // bar
  if (look.bar) {
    for (let i = 0; i < 600; i++) {
      const u = gaussian(rand) * R * 0.18;
      const v = gaussian(rand) * R * 0.05;
      dot(cx + u, cx + v, size * 0.03, look.core, 0.05);
    }
  }
  // bright core
  dot(cx, cx, R * 0.35, look.core, 0.6);
  dot(cx, cx, R * 0.12, [255, 245, 225], 0.9);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** A flat disc showing a galaxy texture, additive so it glows over black. */
export function galaxyDisc(tex: THREE.Texture, diameter: number, opacity = 1): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(diameter, diameter), mat);
  return m;
}

export const LOOKS = {
  milkyWay: { arms: 4, wind: 2.4, core: [255, 214, 160], arm: [170, 200, 255], spiral: 1, bar: true, seed: 1 } as GalaxyLook,
  andromeda: { arms: 2, wind: 3.4, core: [255, 220, 175], arm: [185, 205, 255], spiral: 0.8, seed: 31 } as GalaxyLook,
  triangulum: { arms: 2, wind: 1.8, core: [240, 220, 200], arm: [160, 195, 255], spiral: 0.9, seed: 33 } as GalaxyLook,
  irregular: { arms: 1, wind: 0.6, core: [215, 220, 240], arm: [170, 200, 255], spiral: 0.35, seed: 5 } as GalaxyLook,
  dwarf: { arms: 1, wind: 0, core: [255, 225, 190], arm: [255, 225, 190], spiral: 0, seed: 9 } as GalaxyLook,
};
