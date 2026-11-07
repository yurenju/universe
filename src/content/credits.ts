import type { LevelId } from '../core/scale';

export interface Credit {
  id: string;
  file: string;
  kind: 'texture' | 'photo';
  level: LevelId | null;
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
  { title: 'Three.js', author: 'three.js authors', license: 'MIT', url: 'https://threejs.org/', use: '3D 繪圖' },
];
