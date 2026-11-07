import type { CometOrbit } from '../core/comet';

export interface CometInfo {
  id: string;
  /** Short label for the Position Marker. */
  zh: string;
  en: string;
  /** Full designation, e.g. "1P/Halley". */
  designation: string;
  orbit: CometOrbit;
  /** Returns (perihelion passages), Gregorian calendar dates, ascending. */
  returns: string[];
  /** One or two sentences about how good the next Return is to see. */
  nextViewing: string;
  /** Meteor showers the comet's debris causes, if any. */
  showers?: string;
  story: string;
  color: number;
  /** Relative tail length (illustrative): bright, active comets 1, faint ones less. */
  tailScale: number;
}

// Orbital elements: osculating J2000 ecliptic elements from the JPL Small-Body
// Database (sbdb.api, full precision, fetched 2026-11-07), one solution each:
//   1P   soln 75,      epoch JD 2439875.5 (1968)
//   2P   soln K273/28, epoch JD 2460582.5 (2024)
//   55P  soln J985/69, epoch JD 2451040.5 (1998)
//   109P soln 32,      epoch JD 2450000.5 (1995)
//   67P  soln K284/1,  epoch JD 2457305.5 (2015)
// Return dates: observed perihelion passages (the recent ones match the SBDB tp
// of these solutions to the day; SBDB's 1P solution puts 1986 at Feb 8.47, the
// commonly cited date is Feb 9.46 TT) and the next predicted one, from JPL
// Horizons osculating Tp near that date (fetched 2026-11-07): 1P 2061-07-28,
// 2P 2027-02-10, 55P 2031-05-20, 109P 2126-07-12, 67P 2028-04-09. Beyond the
// table, Returns are extrapolated and shown as approximate (ADR 0003). The
// other dates were checked against Horizons Tp too, except Halley 1066 (Horizons
// starts in 1600): that one is Yeomans & Kiang (1981), 1066 Mar 20 Julian.
export const COMETS: readonly CometInfo[] = [
  {
    id: '1P',
    zh: '哈雷彗星',
    en: '1P/Halley',
    designation: '1P/Halley',
    orbit: { a: 17.92864, e: 0.967936, i: 162.1905, Omega: 59.0989, omega: 112.2414 },
    // 1066-03-20 in the Julian calendar is 1066-03-26 Gregorian.
    returns: ['1066-03-26', '1835-11-16', '1910-04-20', '1986-02-09', '2061-07-28'],
    nextViewing: '2061 年回歸時，哈雷彗星和地球在太陽的同一側，觀測條件會比 1986 年好很多。',
    showers: '寶瓶座 η 流星雨（5 月）與獵戶座流星雨（10 月）',
    story:
      '史上最有名的彗星。哈雷在 1705 年算出 1531、1607、1682 年出現的是同一顆彗星，並預言它會在 1758 年回來，它也真的回來了。1066 年的回歸被織進了貝葉掛毯；1986 年歐洲的 Giotto 探測器從離彗核約 600 公里處飛過，第一次拍到彗核。它的軌道是逆行的，繞太陽的方向和行星相反。',
    color: 0x9fd8ff,
    tailScale: 1,
  },
  {
    id: '2P',
    zh: '恩克彗星',
    en: '2P/Encke',
    designation: '2P/Encke',
    orbit: { a: 2.218357, e: 0.846989, i: 11.3393, Omega: 334.014, omega: 187.2839 },
    returns: ['2017-03-10', '2020-06-25', '2023-10-22', '2027-02-10'],
    nextViewing: '恩克彗星很暗，通常要用雙筒望遠鏡或小望遠鏡才看得到。',
    showers: '金牛座流星雨（10–11 月）',
    story: '已知週期最短的明亮彗星，每 3.3 年繞太陽一圈，所以被觀測過的回歸次數也最多。它的軌道完全在木星軌道以內。',
    color: 0xb8ffd0,
    tailScale: 0.35,
  },
  {
    id: '55P',
    zh: '坦普爾–塔特爾彗星',
    en: '55P/Tempel–Tuttle',
    designation: '55P/Tempel–Tuttle',
    orbit: { a: 10.33834, e: 0.905553, i: 162.4866, Omega: 235.271, omega: 172.5003 },
    returns: ['1965-04-30', '1998-02-28', '2031-05-20'],
    nextViewing: '彗星本身不亮，要用望遠鏡看；值得期待的是它回歸前後的獅子座流星雨。',
    showers: '獅子座流星雨（11 月）',
    story: '每 33 年回來一次。它回歸前後，地球穿過它新留下的碎屑，獅子座流星雨就可能變成流星暴：1833 年和 1966 年都出現過每小時數萬顆流星的景象。',
    color: 0xffd9a0,
    tailScale: 0.5,
  },
  {
    id: '109P',
    zh: '斯威夫特–塔特爾彗星',
    en: '109P/Swift–Tuttle',
    designation: '109P/Swift–Tuttle',
    orbit: { a: 26.09207, e: 0.963226, i: 113.4538, Omega: 139.3812, omega: 152.9822 },
    returns: ['1862-08-23', '1992-12-12', '2126-07-12'],
    nextViewing: '2126 年回歸時預計亮到肉眼可見。',
    showers: '英仙座流星雨（8 月）',
    story: '彗核直徑約 26 公里，是會反覆經過地球軌道附近的天體中最大的之一。每年 8 月地球穿過它留下的碎屑帶，就是英仙座流星雨。',
    color: 0xd0c0ff,
    tailScale: 1,
  },
  {
    id: '67P',
    zh: '67P 彗星',
    en: '67P/Churyumov–Gerasimenko',
    designation: '67P/Churyumov–Gerasimenko',
    orbit: { a: 3.462249, e: 0.640908, i: 7.0403, Omega: 50.1356, omega: 12.7982 },
    returns: ['2015-08-13', '2021-11-02', '2028-04-09'],
    nextViewing: '很暗，要用望遠鏡才看得到。',
    story:
      '歐洲 Rosetta 探測器在 2014 到 2016 年環繞這顆彗星兩年，2014 年 11 月 12 日 Philae 著陸器降落在彗核上，是人類第一次降落在彗星上。彗核像一隻 4 公里長的橡皮鴨。',
    color: 0xffb0c8,
    tailScale: 0.3,
  },
];

export const COMET_BY_ID: Record<string, CometInfo> = Object.fromEntries(COMETS.map((c) => [c.id, c]));

/** Return dates as ms since the epoch (UTC midnight), in table order. */
export function returnTimes(c: CometInfo): number[] {
  return c.returns.map((d) => {
    const [y, m, day] = d.split('-').map(Number);
    const t = new Date(0);
    t.setUTCFullYear(y, m - 1, day);
    t.setUTCHours(0, 0, 0, 0);
    return t.getTime();
  });
}
