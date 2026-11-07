import { describe, expect, it } from 'vitest';
import { nextOnTap, snapSheet, viewShiftFor } from '../src/ui/layout';

const stops = { peek: 52, half: 380, full: 760 };

describe('snapSheet', () => {
  it('settles on the nearest stop when released still', () => {
    expect(snapSheet(60, 0, stops)).toBe('peek');
    expect(snapSheet(300, 0, stops)).toBe('half');
    expect(snapSheet(700, 0, stops)).toBe('full');
  });

  it('lets a flick carry past the nearest stop', () => {
    expect(snapSheet(300, 2, stops)).toBe('full'); // fast upward flick from below half
    expect(snapSheet(400, -1.5, stops)).toBe('peek'); // fast downward flick from half
  });
});

describe('nextOnTap', () => {
  it('opens a closed sheet to half and closes a half one; a full one comes back to half', () => {
    expect(nextOnTap('peek')).toBe('half');
    expect(nextOnTap('half')).toBe('peek');
    expect(nextOnTap('full')).toBe('half');
  });
});

describe('viewShiftFor', () => {
  it('lifts the centre by half the covered height', () => {
    expect(viewShiftFor(52, 380)).toBe(26);
    expect(viewShiftFor(380, 380)).toBe(190);
  });

  it('stops following the sheet above half height', () => {
    expect(viewShiftFor(760, 380)).toBe(190);
  });
});
