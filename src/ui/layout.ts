/**
 * Phone layouts. `desktop` keeps the side panel and full toolbar; `sheet` (narrow,
 * portrait phones) turns the Info Panel into a bottom sheet; `side` (short screens,
 * i.e. phones held sideways) uses a narrow side panel that starts closed.
 * The mode is written to <html> as a class so CSS and code agree on it.
 */
export type LayoutMode = 'desktop' | 'sheet' | 'side';

const SHORT = '(max-height: 500px)';
const NARROW = '(max-width: 760px)';

export function layoutMode(): LayoutMode {
  if (matchMedia(SHORT).matches) return 'side';
  if (matchMedia(NARROW).matches) return 'sheet';
  return 'desktop';
}

export function watchLayout(onChange: (mode: LayoutMode) => void): LayoutMode {
  let mode = layoutMode();
  const apply = () => {
    const root = document.documentElement.classList;
    root.toggle('compact', mode !== 'desktop');
    root.toggle('sheet', mode === 'sheet');
    root.toggle('side', mode === 'side');
  };
  apply();
  const check = () => {
    const next = layoutMode();
    if (next === mode) return;
    mode = next;
    apply();
    onChange(mode);
  };
  matchMedia(SHORT).addEventListener('change', check);
  matchMedia(NARROW).addEventListener('change', check);
  return mode;
}

export type SheetState = 'peek' | 'half' | 'full';
/** How many pixels of the sheet show in each state. */
export type SheetStops = Record<SheetState, number>;

const STATES: SheetState[] = ['peek', 'half', 'full'];

/** Where a released drag settles: the stop nearest to where its momentum would carry it. */
export function snapSheet(visible: number, velocity: number, stops: SheetStops): SheetState {
  const target = visible + velocity * 200; // velocity in px/ms, positive = growing
  return STATES.reduce((best, s) => (Math.abs(stops[s] - target) < Math.abs(stops[best] - target) ? s : best), 'peek');
}

/** What a tap on the sheet's bar does. */
export function nextOnTap(state: SheetState): SheetState {
  return state === 'half' ? 'peek' : 'half';
}

/**
 * How far to lift the view's centre so it sits in the middle of the uncovered
 * area. It follows the sheet up to half height and no further: above that so
 * little scene is left that keeping it centred isn't worth the slide.
 */
export function viewShiftFor(visible: number, half: number): number {
  return Math.round(Math.max(0, Math.min(visible, half)) / 2);
}

/** The Info Panel as a bottom sheet: dragged by its bar, pulled down from the top of its content. */
export class BottomSheet {
  state: SheetState = 'peek';
  onShift: (px: number) => void = () => {};
  onStateChange: (s: SheetState) => void = () => {};
  private enabled = false;
  private visible = 0;
  private raf = 0;
  private suppressClick = false;

  constructor(
    private panel: HTMLElement,
    private bar: HTMLElement,
    private toggle: HTMLButtonElement,
    private scroller: HTMLElement,
  ) {
    this.bindBar();
    this.bindPullDown();
    toggle.addEventListener('click', () => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      if (this.enabled) this.set(nextOnTap(this.state));
    });
    window.addEventListener('resize', () => this.enabled && this.place(this.stops()[this.state]));
  }

  stops(): SheetStops {
    const full = this.panel.offsetHeight;
    const peek = this.bar.offsetHeight;
    const half = Math.max(peek, Math.min(full, Math.round(window.innerHeight * 0.45)));
    return { peek, half, full };
  }

  enable(on: boolean): void {
    this.enabled = on;
    cancelAnimationFrame(this.raf);
    if (on) {
      this.state = 'peek';
      this.place(this.stops().peek);
      this.sync();
    } else {
      this.panel.style.transform = '';
      this.onShift(0);
    }
  }

  get active(): boolean {
    return this.enabled;
  }

  set(state: SheetState): void {
    if (!this.enabled) return;
    this.state = state;
    this.sync();
    this.animateTo(this.stops()[state]);
  }

  private sync(): void {
    this.toggle.setAttribute('aria-expanded', String(this.state !== 'peek'));
    this.panel.dataset.sheet = this.state;
    this.onStateChange(this.state);
  }

  private place(v: number): void {
    const stops = this.stops();
    this.visible = Math.max(stops.peek, Math.min(stops.full, v));
    this.panel.style.transform = `translateY(${stops.full - this.visible}px)`;
    this.onShift(viewShiftFor(this.visible, stops.half));
  }

  private animateTo(target: number): void {
    cancelAnimationFrame(this.raf);
    const from = this.visible;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 260);
      this.place(from + (target - from) * (1 - (1 - k) ** 3));
      if (k < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** Follow a vertical drag; returns handlers for move and release. */
  private drag(startY: number) {
    cancelAnimationFrame(this.raf);
    const start = this.visible;
    let last = { y: startY, t: performance.now() };
    let velocity = 0;
    return {
      move: (y: number) => {
        const now = performance.now();
        if (now > last.t) velocity = (last.y - y) / (now - last.t);
        last = { y, t: now };
        this.place(start + (startY - y));
      },
      end: () => {
        this.state = snapSheet(this.visible, velocity, this.stops());
        this.sync();
        this.animateTo(this.stops()[this.state]);
      },
    };
  }

  private bindBar(): void {
    let session: ReturnType<BottomSheet['drag']> | null = null;
    let startY = 0;
    let moved = false;
    this.bar.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      startY = e.clientY;
      moved = false;
      session = null;
      this.bar.setPointerCapture(e.pointerId);
    });
    this.bar.addEventListener('pointermove', (e) => {
      if (!this.enabled || !this.bar.hasPointerCapture(e.pointerId)) return;
      if (!moved && Math.abs(e.clientY - startY) < 6) return;
      if (!moved) {
        moved = true;
        session = this.drag(startY);
      }
      session!.move(e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (!this.bar.hasPointerCapture(e.pointerId)) return;
      this.bar.releasePointerCapture(e.pointerId);
      if (moved && session) {
        session.end();
        this.suppressClick = true; // the click that follows a drag isn't a tap
        setTimeout(() => (this.suppressClick = false), 0);
      }
      session = null;
    };
    this.bar.addEventListener('pointerup', end);
    this.bar.addEventListener('pointercancel', end);
  }

  /** Content scrolls; only once it is scrolled to the top does pulling down move the sheet. */
  private bindPullDown(): void {
    let startY = 0;
    let atTop = false;
    let session: ReturnType<BottomSheet['drag']> | null = null;
    this.scroller.addEventListener(
      'touchstart',
      (e) => {
        startY = e.touches[0].clientY;
        atTop = this.scroller.scrollTop <= 0;
        session = null;
      },
      { passive: true },
    );
    this.scroller.addEventListener(
      'touchmove',
      (e) => {
        if (!this.enabled || !atTop || this.state === 'peek' || e.touches.length > 1) return;
        const y = e.touches[0].clientY;
        if (!session) {
          if (y - startY < 6 || this.scroller.scrollTop > 0) {
            if (y < startY) atTop = false; // scrolling the content up: leave it be
            return;
          }
          session = this.drag(y);
        }
        e.preventDefault();
        session.move(y);
      },
      { passive: false },
    );
    const end = () => {
      session?.end();
      session = null;
    };
    this.scroller.addEventListener('touchend', end);
    this.scroller.addEventListener('touchcancel', end);
  }
}
