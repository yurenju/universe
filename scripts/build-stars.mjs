// Preprocess the HYG v4.1 star catalog (CC BY-SA 4.0, astronexus/HYG-Database)
// into two compact binary files used by the app:
//
//   public/data/sky.bin   naked-eye stars (mag <= 6.5) as equatorial unit vectors
//                         Float32 records: x, y, z, mag, ci
//   public/data/near.bin  stars within NEAR_LY light-years, galactic coordinates in ly
//                         Float32 records: gx, gy, gz, absmag, ci
//   public/data/near-names.json  [index, properName, distLy] for named nearby stars
//
// Usage: node scripts/build-stars.mjs <path/to/hygdata_v41.csv>

import fs from 'node:fs';
import path from 'node:path';

const NEAR_LY = 160;
const PC_TO_LY = 3.26156;
const SKY_MAG_LIMIT = 6.5;

// J2000 equatorial -> galactic rotation (IAU 1958, Hipparcos convention)
const EQ_TO_GAL = [
  [-0.0548755604, -0.873437090, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-stars.mjs <hygdata_v41.csv>');
  process.exit(1);
}

const lines = fs.readFileSync(src, 'utf8').split('\n');
const header = parseCsvLine(lines[0]);
const col = Object.fromEntries(header.map((h, i) => [h, i]));

const sky = [];
const near = [];
const names = [];

for (let i = 1; i < lines.length; i++) {
  if (!lines[i]) continue;
  const f = parseCsvLine(lines[i]);
  const proper = f[col.proper];
  if (proper === 'Sol') continue;
  const mag = parseFloat(f[col.mag]);
  const absmag = parseFloat(f[col.absmag]);
  let ci = parseFloat(f[col.ci]);
  if (!Number.isFinite(ci)) ci = 0.65;
  const x = parseFloat(f[col.x]);
  const y = parseFloat(f[col.y]);
  const z = parseFloat(f[col.z]);
  const distPc = parseFloat(f[col.dist]);

  if (mag <= SKY_MAG_LIMIT) {
    const r = Math.hypot(x, y, z) || 1;
    sky.push(x / r, y / r, z / r, mag, ci);
  }

  // dist 100000 marks unknown distance in HYG
  if (distPc > 0 && distPc < 100000 && distPc * PC_TO_LY <= NEAR_LY) {
    const ex = x * PC_TO_LY;
    const ey = y * PC_TO_LY;
    const ez = z * PC_TO_LY;
    const g = EQ_TO_GAL.map((row) => row[0] * ex + row[1] * ey + row[2] * ez);
    const idx = near.length / 5;
    near.push(g[0], g[1], g[2], absmag, ci);
    if (proper) names.push([idx, proper, +(distPc * PC_TO_LY).toFixed(2)]);
  }
}

const outDir = path.resolve('public/data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'sky.bin'), Buffer.from(new Float32Array(sky).buffer));
fs.writeFileSync(path.join(outDir, 'near.bin'), Buffer.from(new Float32Array(near).buffer));
fs.writeFileSync(path.join(outDir, 'near-names.json'), JSON.stringify(names));
console.log(`sky: ${sky.length / 5} stars, near (<=${NEAR_LY} ly): ${near.length / 5} stars, named: ${names.length}`);
