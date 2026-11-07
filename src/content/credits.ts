import type { CloseUpId } from '../core/closeUp';
import type { LevelId } from '../core/scale';

export interface Credit {
  id: string;
  file: string;
  kind: 'texture' | 'photo';
  level: LevelId | null;
  /** Reference Photo for a Close-up instead of a level. */
  closeUp?: CloseUpId;
  title: string;
  titleZh?: string;
  captionZh?: string;
  author: string;
  license: string;
  licenseUrl?: string;
  source: string;
  observed: boolean;
}

// credits.json is produced while gathering assets; tolerate it being absent.
const found = import.meta.glob<{ default: Credit[] }>('./credits.json', { eager: true });
export const CREDITS: Credit[] = Object.values(found)[0]?.default ?? [];

/** Data and software sources that are not image files. */
export const DATA_CREDITS: { title: string; author: string; license: string; url: string; use: string }[] = [
  { title: 'HYG Database v4.1', author: 'David Nash (astronexus)', license: 'CC BY-SA 4.0', url: 'https://github.com/astronexus/HYG-Database', use: '肉眼可見恆星與 160 光年內恆星的位置、亮度、顏色' },
  { title: 'Astronomy Engine', author: 'Don Cross', license: 'MIT', url: 'https://github.com/cosinekitty/astronomy', use: '行星、月球位置與地球自轉（天文曆表）' },
  { title: 'Local Group catalogue', author: 'A. W. McConnachie (2012), AJ 144, 4', license: '學術文獻數據', url: 'https://doi.org/10.1088/0004-6256/144/1/4', use: '本星系群成員的方向與距離' },
  { title: 'The Laniakea supercluster of galaxies', author: 'R. B. Tully et al. (2014), Nature 513, 71', license: '學術文獻數據', url: 'https://doi.org/10.1038/nature13674', use: '拉尼亞凱亞的範圍與巨引源位置' },
  { title: 'Cygnus X-1 contains a 21 solar mass black hole', author: 'J. C. A. Miller-Jones et al. (2021), Science 371, 1046', license: '學術文獻數據', url: 'https://doi.org/10.1126/science.abb3363', use: '天鵝座 X-1 的距離、質量、軌道方位（含作者公開的擬合程式 github.com/bersavosh/CygX-1_JMJ2021）' },
  { title: 'Cygnus X-1 orbital ephemeris', author: 'C. Brocksopp et al. (1999), MNRAS 309, 1063', license: '學術文獻數據', url: 'https://doi.org/10.1046/j.1365-8711.1999.02885.x', use: '天鵝座 X-1 的軌道週期與相位' },
  { title: 'The jet of Cygnus X-1', author: 'A. M. Stirling et al. (2001), MNRAS 327, 1273', license: '學術文獻數據', url: 'https://doi.org/10.1046/j.1365-8711.2001.04821.x', use: '天鵝座 X-1 噴流的方向與長度' },
  { title: 'Mass distribution in the Galactic Center', author: 'GRAVITY Collaboration (2022), A&A 657, L12', license: '學術文獻數據', url: 'https://doi.org/10.1051/0004-6361/202142465', use: '人馬座 A* 的質量、距離與 S 星群軌道' },
  { title: 'First Sagittarius A* EHT results', author: 'EHT Collaboration (2022), ApJL 930, L12', license: '學術文獻數據', url: 'https://doi.org/10.3847/2041-8213/ac6674', use: '人馬座 A* 光環的大小' },
  { title: 'JPL Small-Body Database & Horizons', author: 'NASA/JPL Solar System Dynamics', license: '公開資料', url: 'https://ssd.jpl.nasa.gov/', use: '週期彗星的軌道要素與回歸（近日點）日期' },
  { title: 'The long-term motion of comet Halley', author: 'D. K. Yeomans & T. Kiang (1981), MNRAS 197, 633', license: '學術文獻數據', url: 'https://doi.org/10.1093/mnras/197.3.633', use: '哈雷彗星 1066 年的回歸日期' },
  { title: 'Three.js', author: 'three.js authors', license: 'MIT', url: 'https://threejs.org/', use: '3D 繪圖' },
];
