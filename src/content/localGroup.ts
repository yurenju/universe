// Local Group members. Galactic l, b (degrees) and heliocentric distance
// (million light-years), rounded from McConnachie (2012, AJ 144, 4) and NED.
// Diameters are rough optical sizes in thousands of light-years.

export type GalaxyKind = 'spiral' | 'irregular' | 'dwarf';

export interface LocalGalaxy {
  id: string;
  zh: string;
  en: string;
  l: number;
  b: number;
  distMly: number;
  diameterKly: number;
  kind: GalaxyKind;
  /** Label only when zoomed in this far (log10 m). */
  labelSMax: number;
  /** Equatorial position + disc orientation for spirals. */
  disc?: { raH: number; dec: number; pa: number; incl: number };
}

export const LOCAL_GROUP: LocalGalaxy[] = [
  { id: 'm31', zh: '仙女座星系（M31）', en: 'Andromeda Galaxy', l: 121.17, b: -21.57, distMly: 2.54, diameterKly: 152, kind: 'spiral', labelSMax: 24.0, disc: { raH: 0.7123, dec: 41.269, pa: 38, incl: 77 } },
  { id: 'm33', zh: '三角座星系（M33）', en: 'Triangulum Galaxy', l: 133.61, b: -31.33, distMly: 2.73, diameterKly: 61, kind: 'spiral', labelSMax: 23.7, disc: { raH: 1.5641, dec: 30.66, pa: 22.5, incl: 55 } },
  { id: 'lmc', zh: '大麥哲倫雲', en: 'Large Magellanic Cloud', l: 280.47, b: -32.89, distMly: 0.163, diameterKly: 32, kind: 'irregular', labelSMax: 23.1 },
  { id: 'smc', zh: '小麥哲倫雲', en: 'Small Magellanic Cloud', l: 302.8, b: -44.3, distMly: 0.2, diameterKly: 19, kind: 'irregular', labelSMax: 22.9 },
  { id: 'sgr-dsph', zh: '人馬座矮橢球星系', en: 'Sagittarius Dwarf', l: 5.6, b: -14.2, distMly: 0.07, diameterKly: 10, kind: 'dwarf', labelSMax: 22.4 },
  { id: 'm32', zh: 'M32', en: 'M32', l: 121.15, b: -21.98, distMly: 2.49, diameterKly: 6.5, kind: 'dwarf', labelSMax: 22.9 },
  { id: 'm110', zh: 'M110', en: 'M110 (NGC 205)', l: 120.72, b: -21.14, distMly: 2.69, diameterKly: 17, kind: 'dwarf', labelSMax: 22.9 },
  { id: 'ngc6822', zh: '巴納德星系（NGC 6822）', en: "Barnard's Galaxy", l: 25.34, b: -18.4, distMly: 1.63, diameterKly: 7, kind: 'irregular', labelSMax: 23.3 },
  { id: 'ic1613', zh: 'IC 1613', en: 'IC 1613', l: 129.73, b: -60.58, distMly: 2.38, diameterKly: 12, kind: 'irregular', labelSMax: 23.1 },
  { id: 'ic10', zh: 'IC 10', en: 'IC 10', l: 118.97, b: -3.33, distMly: 2.2, diameterKly: 5, kind: 'irregular', labelSMax: 23.0 },
  { id: 'wlm', zh: 'WLM', en: 'Wolf–Lundmark–Melotte', l: 75.86, b: -73.62, distMly: 3.04, diameterKly: 8, kind: 'irregular', labelSMax: 23.2 },
  { id: 'leo-a', zh: '獅子座 A', en: 'Leo A', l: 196.9, b: 52.4, distMly: 2.6, diameterKly: 5, kind: 'irregular', labelSMax: 23.0 },
  { id: 'pegasus-dirr', zh: '飛馬座矮不規則星系', en: 'Pegasus Dwarf Irregular', l: 94.77, b: -43.55, distMly: 3.0, diameterKly: 4, kind: 'irregular', labelSMax: 22.9 },
  { id: 'leo-i', zh: '獅子座 I', en: 'Leo I', l: 225.99, b: 49.11, distMly: 0.82, diameterKly: 2, kind: 'dwarf', labelSMax: 22.7 },
  { id: 'leo-ii', zh: '獅子座 II', en: 'Leo II', l: 220.17, b: 67.23, distMly: 0.68, diameterKly: 1.2, kind: 'dwarf', labelSMax: 22.6 },
  { id: 'fornax-dsph', zh: '天爐座矮星系', en: 'Fornax Dwarf', l: 237.1, b: -65.7, distMly: 0.46, diameterKly: 2.5, kind: 'dwarf', labelSMax: 22.6 },
  { id: 'sculptor-dsph', zh: '玉夫座矮星系', en: 'Sculptor Dwarf', l: 287.5, b: -83.2, distMly: 0.28, diameterKly: 1.5, kind: 'dwarf', labelSMax: 22.5 },
  { id: 'draco', zh: '天龍座矮星系', en: 'Draco Dwarf', l: 86.37, b: 34.72, distMly: 0.26, diameterKly: 1.3, kind: 'dwarf', labelSMax: 22.5 },
  { id: 'ursa-minor', zh: '小熊座矮星系', en: 'Ursa Minor Dwarf', l: 104.97, b: 44.8, distMly: 0.2, diameterKly: 1, kind: 'dwarf', labelSMax: 22.4 },
  { id: 'carina', zh: '船底座矮星系', en: 'Carina Dwarf', l: 260.1, b: -22.2, distMly: 0.33, diameterKly: 1, kind: 'dwarf', labelSMax: 22.4 },
  { id: 'sextans', zh: '六分儀座矮星系', en: 'Sextans Dwarf', l: 243.5, b: 42.3, distMly: 0.28, diameterKly: 1.4, kind: 'dwarf', labelSMax: 22.4 },
  { id: 'ngc3109', zh: 'NGC 3109', en: 'NGC 3109', l: 262.1, b: 23.07, distMly: 4.3, diameterKly: 25, kind: 'irregular', labelSMax: 23.5 },
  { id: 'sextans-a', zh: '六分儀座 A', en: 'Sextans A', l: 246.15, b: 39.88, distMly: 4.6, diameterKly: 5, kind: 'irregular', labelSMax: 23.3 },
];
