import * as THREE from 'three';
import { toThree, type Vec3 } from '../core/frames';

/** Radial glow texture drawn on a canvas. */
export function glowTexture(stops: [number, string][] = [
  [0, 'rgba(255,255,255,1)'],
  [0.2, 'rgba(255,240,210,0.55)'],
  [0.5, 'rgba(255,200,140,0.12)'],
  [1, 'rgba(255,180,120,0)'],
]): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function glowSprite(tex: THREE.Texture, color: THREE.ColorRepresentation, size: number, opacity = 1): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

/** Line through points given in an astronomical frame (converted to Three coords). */
export function polyline(points: Vec3[], color: THREE.ColorRepresentation, opacity = 0.5, scale = 1): THREE.Line {
  const arr = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    const t = toThree(p);
    arr[i * 3] = t[0] * scale;
    arr[i * 3 + 1] = t[1] * scale;
    arr[i * 3 + 2] = t[2] * scale;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  return line;
}

/** Circle of radius r in the frame's XY plane (the ecliptic or galactic plane). */
export function planeCircle(r: number, color: THREE.ColorRepresentation, opacity = 0.35, segments = 256): THREE.Line {
  const pts: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([r * Math.cos(a), r * Math.sin(a), 0]);
  }
  return polyline(pts, color, opacity);
}

export function v3(p: Vec3, scale = 1): THREE.Vector3 {
  const t = toThree(p);
  return new THREE.Vector3(t[0] * scale, t[1] * scale, t[2] * scale);
}
