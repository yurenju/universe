// Close-ups: self-contained scenes centred on a distant object, outside the
// scale axis (docs/adr/0002-close-ups-outside-the-scale-axis.md).

import { schwarzschildRadius } from './blackhole';
import { LEVEL_IDS, smoothstep, type LevelId } from './scale';

export const CLOSE_UP_IDS = ['cygnus-x1', 'sgr-a'] as const;
export type CloseUpId = (typeof CLOSE_UP_IDS)[number];

export interface CloseUpRange {
  /** Black-hole mass, M☉. */
  massSun: number;
  /** Magnified Bodies multiplies the hole's Rs by this. */
  magnifyFactor: number;
  /** s the close-up opens at. */
  homeS: number;
  /** Zooming out past this s leaves the close-up. */
  exitS: number;
  /** The level the close-up is entered from and returns to. */
  returnLevel: LevelId;
}

/**
 * Closest the camera may get, in units of the (possibly magnified) Rs. Nearer
 * than this the hole's shadow is wider than the whole field of view (at 2 Rs
 * it spans ~130°), so the screen would just be black.
 */
export const CLOSEST_RS = 6;
/** How far past exitS the zoom may overshoot (so the exit can trigger). */
export const EXIT_OVERSHOOT = 0.25;

export const CLOSE_UP_RANGES: Record<CloseUpId, CloseUpRange> = {
  'cygnus-x1': { massSun: 21.2, magnifyFactor: 3e3, homeS: 11.3, exitS: 12.2, returnLevel: 'milky-way' },
  'sgr-a': { massSun: 4.297e6, magnifyFactor: 1, homeS: 15.0, exitS: 15.9, returnLevel: 'milky-way' },
};

/** Effective Schwarzschild radius in metres (magnified when Magnified Bodies is on). */
export function effectiveRs(id: CloseUpId, magnify: boolean): number {
  const r = CLOSE_UP_RANGES[id];
  return schwarzschildRadius(r.massSun) * (magnify ? r.magnifyFactor : 1);
}

export function closeUpSMin(id: CloseUpId, magnify: boolean): number {
  return Math.log10(CLOSEST_RS * effectiveRs(id, magnify));
}

export function closeUpSMax(id: CloseUpId): number {
  return CLOSE_UP_RANGES[id].exitS + EXIT_OVERSHOOT;
}

// ---- routing ----

export type Route = { kind: 'level'; id: LevelId } | { kind: 'closeUp'; id: CloseUpId };

export function parseRoute(hash: string): Route | null {
  const id = decodeURIComponent(hash.replace(/^#\/?/, '')).trim().toLowerCase();
  if ((LEVEL_IDS as readonly string[]).includes(id)) return { kind: 'level', id: id as LevelId };
  if ((CLOSE_UP_IDS as readonly string[]).includes(id)) return { kind: 'closeUp', id: id as CloseUpId };
  return null;
}

// ---- lifecycle ----

export type CloseUpPhase = 'idle' | 'approach' | 'fadeIn' | 'inside' | 'fadeOut';

/** Seconds the main view spends flying toward the marker before fading. */
export const APPROACH_SECONDS = 0.9;
/** Seconds for the cross-fade between the main view and the close-up. */
export const FADE_SECONDS = 0.7;

/**
 * Enter/exit state machine. `progress` is the linear fade position (0 = main
 * view only, 1 = close-up only); `mix` is its eased version, the close-up's
 * visibility weight.
 */
export class CloseUpTransition {
  phase: CloseUpPhase = 'idle';
  id: CloseUpId | null = null;
  progress = 0;
  private approachLeft = 0;

  get mix(): number {
    return smoothstep(0, 1, this.progress);
  }

  /** True while input (zoom, rotate) should drive the close-up camera. */
  get controlsCloseUp(): boolean {
    return this.phase === 'fadeIn' || this.phase === 'inside';
  }

  /** Whether the close-up scene needs rendering this frame. */
  get visible(): boolean {
    return this.progress > 0;
  }

  /**
   * Start entering. Returns false if the request is ignored (another close-up
   * is in progress). `immediate` skips the approach and the fade (page load).
   */
  enter(id: CloseUpId, immediate = false): boolean {
    if (this.phase === 'fadeOut' && this.id === id) {
      this.phase = 'fadeIn';
      return true;
    }
    if (this.phase !== 'idle') return this.id === id;
    this.id = id;
    if (immediate) {
      this.phase = 'inside';
      this.progress = 1;
    } else {
      this.phase = 'approach';
      this.approachLeft = APPROACH_SECONDS;
      this.progress = 0;
    }
    return true;
  }

  exit(): void {
    if (this.phase === 'approach') {
      this.reset();
    } else if (this.phase === 'fadeIn' || this.phase === 'inside') {
      this.phase = 'fadeOut';
    }
  }

  /**
   * Advance by dt seconds. `s` is the close-up camera's current scale; zooming
   * out past the exit scale leaves. Returns the phase transitions that happened.
   */
  step(dt: number, s: number): { entered: boolean; left: boolean } {
    let entered = false;
    let left = false;
    if (this.phase === 'approach') {
      this.approachLeft -= dt;
      if (this.approachLeft <= 0) this.phase = 'fadeIn';
    } else if (this.phase === 'fadeIn') {
      this.progress = Math.min(1, this.progress + dt / FADE_SECONDS);
      if (this.progress >= 1) {
        this.phase = 'inside';
        entered = true;
      }
    } else if (this.phase === 'fadeOut') {
      this.progress = Math.max(0, this.progress - dt / FADE_SECONDS);
      if (this.progress <= 0) {
        this.reset();
        left = true;
      }
    }
    if ((this.phase === 'inside' || this.phase === 'fadeIn') && this.id && s > CLOSE_UP_RANGES[this.id].exitS) {
      this.exit();
    }
    return { entered, left };
  }

  private reset(): void {
    this.phase = 'idle';
    this.id = null;
    this.progress = 0;
    this.approachLeft = 0;
  }
}
