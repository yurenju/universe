import * as THREE from 'three';
import { gaussian, mulberry32 } from './assets';

export interface WebNode {
  p: THREE.Vector3;
  /** Relative mass; sets how many points cluster there. */
  w: number;
}

export interface WebOptions {
  seed: number;
  points: number;
  /** Fraction of points in node clumps (rest along filaments). */
  clumpFraction: number;
  clumpRadius: number;
  filamentWidth: number;
  neighbours: number;
  colorize: (p: THREE.Vector3, rand: () => number) => [number, number, number];
  size: (rand: () => number) => number;
}

/**
 * Procedural cosmic web: galaxies clumped at nodes and strung along filaments
 * connecting each node to its nearest neighbours.
 */
export function buildWeb(nodes: WebNode[], o: WebOptions): { pos: Float32Array; col: Float32Array; size: Float32Array; edges: [number, number][] } {
  const rand = mulberry32(o.seed);
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  nodes.forEach((n, i) => {
    const near = nodes
      .map((m, j) => ({ j, d: m.p.distanceToSquared(n.p) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, o.neighbours);
    for (const { j } of near) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([i, j]);
      }
    }
  });

  const totalW = nodes.reduce((s, n) => s + n.w, 0);
  const pos = new Float32Array(o.points * 3);
  const col = new Float32Array(o.points * 3);
  const size = new Float32Array(o.points);
  const tmp = new THREE.Vector3();
  for (let k = 0; k < o.points; k++) {
    if (rand() < o.clumpFraction) {
      // pick a node by weight
      let t = rand() * totalW;
      let n = nodes[0];
      for (const m of nodes) {
        t -= m.w;
        if (t <= 0) {
          n = m;
          break;
        }
      }
      const r = o.clumpRadius * Math.sqrt(n.w) * Math.abs(gaussian(rand)) * 0.6;
      tmp.set(gaussian(rand), gaussian(rand), gaussian(rand)).normalize().multiplyScalar(r).add(n.p);
    } else {
      const [a, b] = edges[Math.floor(rand() * edges.length)];
      const t = rand();
      tmp.lerpVectors(nodes[a].p, nodes[b].p, t);
      const w = o.filamentWidth * (0.4 + 0.6 * Math.sin(Math.PI * t));
      tmp.x += gaussian(rand) * w;
      tmp.y += gaussian(rand) * w;
      tmp.z += gaussian(rand) * w;
    }
    pos.set([tmp.x, tmp.y, tmp.z], k * 3);
    col.set(o.colorize(tmp, rand), k * 3);
    size[k] = o.size(rand);
  }
  return { pos, col, size, edges };
}

/** Uniform random point inside a sphere. */
export function randomInSphere(rand: () => number, radius: number, out = new THREE.Vector3()): THREE.Vector3 {
  const r = radius * Math.cbrt(rand());
  const u = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(r * s * Math.cos(a), r * u, r * s * Math.sin(a));
}
