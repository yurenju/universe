// Galaxy clusters and superclusters around Laniakea. Galactic l, b (degrees)
// and distances in million light-years, rounded from NED / Tully et al. (2014).

export interface Structure {
  id: string;
  zh: string;
  en: string;
  l: number;
  b: number;
  distMly: number;
  /** Relative richness: how many galaxies to scatter around it. */
  richness: number;
  insideLaniakea: boolean;
  labelSMin: number;
  labelSMax: number;
}

export const CLUSTERS: Structure[] = [
  { id: 'virgo', zh: '室女座星系團', en: 'Virgo Cluster', l: 283.8, b: 74.5, distMly: 54, richness: 1.0, insideLaniakea: true, labelSMin: 23.3, labelSMax: 25.0 },
  { id: 'fornax', zh: '天爐座星系團', en: 'Fornax Cluster', l: 236.7, b: -53.6, distMly: 62, richness: 0.45, insideLaniakea: true, labelSMin: 23.4, labelSMax: 24.9 },
  { id: 'eridanus', zh: '波江座星系群', en: 'Eridanus Group', l: 208, b: -50, distMly: 75, richness: 0.3, insideLaniakea: true, labelSMin: 23.6, labelSMax: 24.6 },
  { id: 'antlia', zh: '唧筒座星系團', en: 'Antlia Cluster', l: 272.9, b: 19.2, distMly: 132, richness: 0.45, insideLaniakea: true, labelSMin: 23.8, labelSMax: 25.0 },
  { id: 'hydra', zh: '長蛇座星系團', en: 'Hydra Cluster', l: 269.6, b: 26.5, distMly: 158, richness: 0.7, insideLaniakea: true, labelSMin: 23.9, labelSMax: 25.1 },
  { id: 'centaurus', zh: '半人馬座星系團', en: 'Centaurus Cluster', l: 302.4, b: 21.6, distMly: 170, richness: 0.9, insideLaniakea: true, labelSMin: 23.9, labelSMax: 25.2 },
  { id: 'norma', zh: '矩尺座星系團（巨引源）', en: 'Norma Cluster — Great Attractor', l: 325.3, b: -7.3, distMly: 220, richness: 1.0, insideLaniakea: true, labelSMin: 24.0, labelSMax: 25.4 },
  { id: 'pavo-indus', zh: '孔雀－印第安超星系團', en: 'Pavo–Indus', l: 335, b: -25, distMly: 200, richness: 0.6, insideLaniakea: true, labelSMin: 24.1, labelSMax: 25.1 },
  { id: 'perseus-pisces', zh: '英仙－雙魚超星系團', en: 'Perseus–Pisces Supercluster', l: 150, b: -13, distMly: 250, richness: 1.0, insideLaniakea: false, labelSMin: 24.1, labelSMax: 25.6 },
  { id: 'coma', zh: '后髮座星系團', en: 'Coma Cluster', l: 58.1, b: 87.96, distMly: 320, richness: 1.0, insideLaniakea: false, labelSMin: 24.2, labelSMax: 25.6 },
  { id: 'shapley', zh: '沙普利超星系團', en: 'Shapley Supercluster', l: 312, b: 31, distMly: 650, richness: 1.4, insideLaniakea: false, labelSMin: 24.4, labelSMax: 26.0 },
];

/** Laniakea's gravitational "basin" is roughly centred near the Great Attractor. */
export const LANIAKEA_CENTER = { l: 320, b: 0, distMly: 200 };
export const LANIAKEA_RADIUS_MLY = 260;
