import type { Engine } from '../core/engine';

/** Wheel / pinch zooms across scales, drag rotates, keyboard as fallback. */
export function attachControls(el: HTMLElement, engine: Engine, onInteract: () => void): void {
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;

  // Listen on window so the wheel also works over marker labels; let the
  // scrollable panels and dialogs keep their own scrolling.
  window.addEventListener(
    'wheel',
    (e) => {
      if ((e.target as HTMLElement)?.closest?.('#panel, dialog, #ladder')) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      engine.zoomBy(e.deltaY * unit * 0.0016);
      onInteract();
    },
    { passive: false },
  );

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) pinchDist = distance();
  });

  el.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pointers.size === 1) {
      engine.rotateBy(-(cur.x - prev.x) * 0.005, (cur.y - prev.y) * 0.005);
      onInteract();
    }
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2) {
      const d = distance();
      if (pinchDist > 0 && d > 0) engine.zoomBy(-Math.log10(d / pinchDist) * 2.2);
      pinchDist = d;
      onInteract();
    }
  });

  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    pinchDist = pointers.size === 2 ? distance() : 0;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.closest('input, select, textarea')) return;
    const k = e.key;
    if (k === '+' || k === '=' || k === 'ArrowUp') engine.zoomBy(-0.25);
    else if (k === '-' || k === '_' || k === 'ArrowDown') engine.zoomBy(0.25);
    else if (k === 'ArrowLeft') engine.rotateBy(0.12, 0);
    else if (k === 'ArrowRight') engine.rotateBy(-0.12, 0);
    else return;
    onInteract();
  });

  function distance(): number {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
