import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLOSE_UP_IDS, CLOSE_UP_RANGES } from '../src/core/closeUp';
import { LEVEL_IDS } from '../src/core/scale';
import { MAGNIFIED_VIEWS, magnifyNote } from '../src/content/magnify';
import { PLANET_MAGNIFY, SUN_MAGNIFY } from '../src/levels/planetary';
import { MOON_MAGNIFY } from '../src/levels/earthMoon';
import { GALAXY_MAGNIFY } from '../src/levels/localGroup';
import { STAR_MAGNIFY } from '../src/closeUps/sgrA';

/** View id → does its scene source react to Magnified Bodies? */
function viewsUsingMagnify(): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const dir of ['src/levels', 'src/closeUps']) {
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      const id = src.match(/readonly id = '([a-z0-9-]+)' as const/)?.[1];
      if (id) out.set(id, /ctx\.magnify|magnifiedFactor/.test(src) || id === 'cygnus-x1');
    }
  }
  return out;
}

describe('Magnified Bodies explanation', () => {
  it('has a note for every level and close-up', () => {
    for (const id of [...LEVEL_IDS, ...CLOSE_UP_IDS]) expect(magnifyNote(id).length).toBeGreaterThan(10);
  });

  it('lists exactly the views whose scenes actually react to the toggle', () => {
    const uses = viewsUsingMagnify();
    expect(uses.size).toBe(LEVEL_IDS.length + CLOSE_UP_IDS.length);
    for (const [id, used] of uses) expect(MAGNIFIED_VIEWS.includes(id as never), id).toBe(used);
  });

  it('says "nothing to magnify" exactly where nothing is magnified', () => {
    for (const id of [...LEVEL_IDS, ...CLOSE_UP_IDS]) {
      expect(magnifyNote(id).includes('沒有需要放大'), id).toBe(!MAGNIFIED_VIEWS.includes(id));
    }
  });

  it('quotes the factors the scenes really use', () => {
    const has = (id: Parameters<typeof magnifyNote>[0], x: number) => expect(magnifyNote(id)).toContain(`${x.toLocaleString('en-US')} 倍`);
    has('earth-moon', MOON_MAGNIFY);
    has('planetary', PLANET_MAGNIFY);
    has('planetary', SUN_MAGNIFY);
    has('local-group', GALAXY_MAGNIFY);
    has('cygnus-x1', CLOSE_UP_RANGES['cygnus-x1'].magnifyFactor);
    has('sgr-a', STAR_MAGNIFY);
  });

  it('tells how to get back to true scale wherever it changes something', () => {
    for (const id of MAGNIFIED_VIEWS) expect(magnifyNote(id)).toContain('真實比例');
  });
});
