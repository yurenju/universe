import * as THREE from 'three';
import type { Engine } from '../core/engine';
import type { Marker } from '../core/level';

const FADE = 0.2; // dex over which a marker fades in/out at the edges of its range
const PRIORITY: Record<Marker['kind'], number> = { here: 0, body: 1, probe: 2, region: 3 };

interface Placed {
  el: HTMLElement;
  x: number;
  y: number;
  w: number;
  h: number;
  prio: number;
  alpha: number;
}

/** Approximate label box so overlapping labels can be thinned out. */
function labelSize(m: Marker): { w: number; h: number } {
  const zh = m.label.length * 13;
  const en = m.labelEn && window.innerWidth > 760 ? m.labelEn.length * 6 : 0;
  return { w: 12 + Math.max(zh, en), h: en ? 28 : 16 };
}

/** DOM overlay of Position Markers: fixed-pixel dots and labels. */
export class MarkerOverlay {
  private els = new Map<string, HTMLElement>();
  private tmp = new THREE.Vector3();

  constructor(
    private root: HTMLElement,
    private engine: Engine,
  ) {}

  private element(key: string, levelIndex: number, m: Marker): HTMLElement {
    let el = this.els.get(key);
    if (!el) {
      const btn = document.createElement('button');
      btn.type = 'button';
      el = btn;
      el.className = `marker marker-${m.kind}`;
      el.innerHTML = `<span class="dot"></span><span class="label"><span class="zh"></span>${m.labelEn ? '<span class="en"></span>' : ''}</span>`;
      el.querySelector('.zh')!.textContent = m.label;
      if (m.labelEn) el.querySelector('.en')!.textContent = m.labelEn;
      el.setAttribute('aria-label', m.label);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.engine.selectMarker(levelIndex, m);
      });
      this.root.appendChild(el);
      this.els.set(key, el);
    }
    return el;
  }

  update(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = this.engine.s;
    const seen = new Set<string>();
    const placed: Placed[] = [];
    for (const view of this.engine.views) {
      for (const m of view.level.markers) {
        const edge = Math.min((s - m.sMin) / FADE, (m.sMax - s) / FADE, 1);
        const alpha = Math.max(0, edge) * view.weight;
        if (alpha <= 0.02) continue;
        const p = m.position(this.tmp).project(view.camera);
        if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2) continue;
        const key = `${view.level.id}:${m.id}`;
        const el = this.element(key, view.index, m);
        seen.add(key);
        const x = (p.x * 0.5 + 0.5) * w;
        const y = (-p.y * 0.5 + 0.5) * h;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        el.style.opacity = alpha.toFixed(3);
        el.style.display = '';
        el.style.pointerEvents = alpha > 0.4 ? 'auto' : 'none';
        const { w: lw, h: lh } = labelSize(m);
        placed.push({ el, x: x + 9, y: y - 9, w: lw, h: lh, prio: PRIORITY[m.kind] - alpha * 0.5, alpha });
      }
    }
    // greedy de-cluttering: important, opaque labels claim space first
    placed.sort((a, b) => a.prio - b.prio);
    const kept: Placed[] = [];
    for (const p of placed) {
      const hit = kept.some((k) => p.x < k.x + k.w && k.x < p.x + p.w && p.y < k.y + k.h && k.y < p.y + p.h);
      p.el.classList.toggle('label-hidden', hit);
      if (!hit) kept.push(p);
    }
    for (const [key, el] of this.els) if (!seen.has(key)) el.style.display = 'none';
  }
}
