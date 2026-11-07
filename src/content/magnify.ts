// What "放大天體" (Magnified Bodies) does in each view, for the toggle's
// explanation. Built from the same constants the scenes use, so the numbers
// in the text cannot drift from what is drawn.

import { CLOSE_UP_RANGES, type CloseUpId } from '../core/closeUp';
import type { LevelId } from '../core/scale';
import { STAR_MAGNIFY } from '../closeUps/sgrA';
import { MOON_MAGNIFY } from '../levels/earthMoon';
import { GALAXY_MAGNIFY } from '../levels/localGroup';
import { PLANET_MAGNIFY, SUN_MAGNIFY } from '../levels/planetary';

export type ViewId = LevelId | CloseUpId;

const n = (x: number) => x.toLocaleString('en-US');
const OFF = '取消勾選就是真實比例。';

/** Views where Magnified Bodies changes something. */
export const MAGNIFIED_VIEWS: readonly ViewId[] = ['earth-moon', 'planetary', 'local-group', 'cygnus-x1', 'sgr-a'];

const NOTES: Partial<Record<ViewId, string>> = {
  'earth-moon': `月球放大 ${n(MOON_MAGNIFY)} 倍，在地球旁邊比較看得清楚；地球維持真實大小，距離也是真實的。${OFF}真實的月球只有地球的四分之一寬。`,
  planetary: `行星放大 ${n(PLANET_MAGNIFY)} 倍、太陽放大 ${n(SUN_MAGNIFY)} 倍，不然依真實比例它們小到連一個像素都不到。軌道與距離維持真實。${OFF}`,
  'local-group': `星系放大 ${n(GALAXY_MAGNIFY)} 倍，讓暗淡的矮星系也看得見；星系之間的距離維持真實。${OFF}`,
  'cygnus-x1': `黑洞放大 ${n(CLOSE_UP_RANGES['cygnus-x1'].magnifyFactor)} 倍，才看得到吸積盤和被彎曲的光線；光線彎曲的程度也跟著放大，伴星被黑洞扭曲的樣子比真實明顯得多。真實的事件視界只有約 126 公里寬，在雙星的尺度下比一個像素還小。伴星、軌道與距離都維持真實。${OFF}`,
  'sgr-a': `S 星放大 ${n(STAR_MAGNIFY)} 倍，靠近時看得出是一顆恆星；黑洞本身夠大，不需要放大，軌道也是真實的。${OFF}`,
};

const NOTHING = '這一層沒有需要放大的天體，畫面本來就是真實比例，勾不勾都一樣。';

export function magnifyNote(view: ViewId): string {
  return NOTES[view] ?? NOTHING;
}
