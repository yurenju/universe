import { COMET_BY_ID, returnTimes, type CometInfo } from '../content/comets';
import { CREDITS, DATA_CREDITS } from '../content/credits';
import { amongPlanets, aphelionAu, bracketReturns, cometPosition, formatSpan, perihelionAu, periodMs, type Return } from '../core/comet';
import { BODY_INFO, CLOSE_UP_INFO, LEVEL_INFO, type BodyInfo, type LevelInfo } from '../content/info';
import type { CloseUpId } from '../core/closeUp';
import { LOCAL_GROUP } from '../content/localGroup';
import { CLUSTERS } from '../content/largeScale';
import type { Marker } from '../core/level';
import { METERS, type LevelId } from '../core/scale';
import { formatDistance, formatLightTime } from '../core/units';
import { assetUrl } from '../render/assets';
import { STAR_NAMES_ZH } from '../levels/stellar';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function factsTable(facts: [string, string][]): string {
  return `<dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

export function renderLevel(id: LevelId): string {
  return renderInfo(LEVEL_INFO[id], CREDITS.filter((c) => c.kind === 'photo' && c.level === id && !c.closeUp), '這一層怎麼畫的');
}

export function renderCloseUp(id: CloseUpId): string {
  return renderInfo(CLOSE_UP_INFO[id], CREDITS.filter((c) => c.kind === 'photo' && c.closeUp === id), '這個特寫怎麼畫的');
}

function renderInfo(info: LevelInfo, photos: typeof CREDITS, howTitle: string): string {
  const photoHtml = photos
    .map(
      (p) => `
      <figure class="photo">
        <a href="${esc(assetUrl(p.file))}" target="_blank" rel="noopener"><img src="${esc(assetUrl(p.file))}" alt="${esc(p.titleZh ?? p.title)}" loading="lazy"></a>
        <figcaption>
          <span class="badge ${p.observed ? 'obs' : 'inf'}">${p.observed ? '真實觀測' : '示意圖'}</span>
          <strong>${esc(p.titleZh ?? p.title)}</strong>
          ${p.captionZh ? `<span class="cap">${esc(p.captionZh)}</span>` : ''}
          <span class="credit">${esc(p.author)} · <a href="${esc(p.source)}" target="_blank" rel="noopener">${esc(p.license)}</a></span>
        </figcaption>
      </figure>`,
    )
    .join('');
  const observedPhotos = photos.some((p) => p.observed);
  return `
    <header class="panel-head">
      <h2>${esc(info.title)} <small>${esc(info.titleEn)}</small></h2>
      <p class="span">畫面範圍${esc(info.span)}</p>
    </header>
    <p class="intro">${esc(info.intro)}</p>
    ${factsTable(info.facts)}
    ${photos.length ? `<h3>${observedPhotos ? '對照照片' : '對照圖'}</h3>${photoHtml}` : ''}
    <h3>${esc(howTitle)}</h3>
    <ul class="provenance">
      ${info.observed.map((t) => `<li><span class="badge obs">觀測資料</span>${esc(t)}</li>`).join('')}
      ${info.inferred.map((t) => `<li><span class="badge inf">推測呈現</span>${esc(t)}</li>`).join('')}
    </ul>`;
}

function lookupBody(infoId: string, marker: Marker): BodyInfo | null {
  if (BODY_INFO[infoId]) return BODY_INFO[infoId];
  const [kind, key] = infoId.split(':');
  if (kind === 'star') {
    const zh = STAR_NAMES_ZH[key]?.zh ?? key;
    return { title: zh, en: marker.labelEn, text: '這顆恆星的位置、亮度與顏色來自 HYG 星表的實際測量。' };
  }
  if (kind === 'lg') {
    const g = LOCAL_GROUP.find((x) => x.id === key);
    if (!g) return null;
    const kindZh = { spiral: '螺旋星系', irregular: '不規則星系', dwarf: '矮星系' }[g.kind];
    return { title: g.zh, en: g.en, facts: [['類型', kindZh], ['距離', `約 ${formatDistance(g.distMly * 1e6 * METERS.LY)}`], ['直徑', `約 ${formatDistance(g.diameterKly * 1e3 * METERS.LY)}`]], text: '方向與距離來自本星系群成員目錄；外觀為示意。' };
  }
  if (kind === 'ls') {
    const c = CLUSTERS.find((x) => x.id === key);
    if (!c) return null;
    return { title: c.zh, en: c.en, facts: [['距離', `約 ${formatDistance(c.distMly * 1e6 * METERS.LY)}`], ['屬於拉尼亞凱亞', c.insideLaniakea ? '是' : '否']], text: '方向與距離來自星系目錄；周圍的星系點為示意。' };
  }
  return null;
}

export function renderBody(marker: Marker): string {
  if (marker.infoId?.startsWith('comet:')) {
    const c = COMET_BY_ID[marker.infoId.slice(6)];
    return c ? renderComet(c) : '';
  }
  const info = marker.infoId ? lookupBody(marker.infoId, marker) : null;
  if (!info) return '';
  return `
    <div class="body-card">
      <button class="close" type="button" aria-label="關閉">×</button>
      <h3>${esc(info.title)} ${info.en ? `<small>${esc(info.en)}</small>` : ''}</h3>
      ${info.facts ? factsTable(info.facts) : ''}
      <p>${esc(info.text)}</p>
    </div>`;
}

export function renderCredits(): string {
  const rows = CREDITS.map(
    (c) => `<li><strong>${esc(c.titleZh ?? c.title)}</strong><span class="badge ${c.observed ? 'obs' : 'inf'}">${c.observed ? '觀測' : '示意'}</span><br>
      <span class="credit">${esc(c.author)} · <a href="${esc(c.licenseUrl ?? c.source)}" target="_blank" rel="noopener">${esc(c.license)}</a> · <a href="${esc(c.source)}" target="_blank" rel="noopener">來源</a> · <code>${esc(c.file)}</code></span></li>`,
  ).join('');
  const data = DATA_CREDITS.map(
    (d) => `<li><strong>${esc(d.title)}</strong> — ${esc(d.use)}<br><span class="credit">${esc(d.author)} · ${esc(d.license)} · <a href="${esc(d.url)}" target="_blank" rel="noopener">連結</a></span></li>`,
  ).join('');
  return `
    <h2>資料來源與授權</h2>
    <p>本網站的程式碼以 MIT 授權釋出。圖片與資料依各自原始授權使用，列於下方。</p>
    <h3>資料與軟體</h3><ul class="credit-list">${data}</ul>
    <h3>圖片與貼圖</h3><ul class="credit-list">${rows || '<li>（尚未載入圖片素材，目前使用程式產生的外觀）</li>'}</ul>`;
}

// ---- Periodic Comets ----

const DAY_MS = 864e5;
const YEAR_MS = 365.25 * DAY_MS;

function formatReturnDate(r: Return): string {
  const d = new Date(r.time);
  const y = d.getUTCFullYear();
  if (r.approx) return `約 ${y} 年 ${d.getUTCMonth() + 1} 月（推算）`;
  // before the Gregorian reform the records use the Julian calendar; the year is enough
  if (y < 1583) return `${y} 年`;
  return `${y} 年 ${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`;
}

function formatPeriod(c: CometInfo): string {
  const yr = periodMs(c.orbit) / YEAR_MS;
  return `約 ${yr >= 10 ? Math.round(yr) : yr.toFixed(1)} 年`;
}

function renderComet(c: CometInfo): string {
  const facts: [string, string][] = [
    ['週期', formatPeriod(c)],
    ['軌道範圍', `近日點在${amongPlanets(perihelionAu(c.orbit))}，遠日點在${amongPlanets(aphelionAu(c.orbit))}`],
  ];
  if (c.showers) facts.push(['流星雨', c.showers]);
  return `
    <div class="body-card comet-card" data-comet="${esc(c.id)}">
      <button class="close" type="button" aria-label="關閉">×</button>
      <h3>${esc(c.zh)} <small>${esc(c.designation)}</small></h3>
      <dl class="facts">
        <dt>下次回歸</dt><dd data-live="next"></dd>
        <dt>上次回歸</dt><dd data-live="prev"></dd>
        <dt>離太陽</dt><dd data-live="dist"></dd>
        ${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
      </dl>
      <div class="jump-returns">
        <button type="button" data-jump="prev">⏮ 跳到上次回歸</button>
        <button type="button" data-jump="next">跳到下次回歸 ⏭</button>
      </div>
      <p>${esc(c.nextViewing)}</p>
      <p>${esc(c.story)}</p>
      <ul class="provenance">
        <li><span class="badge obs">觀測資料</span>軌道來自 JPL 小天體資料庫，回歸日期來自觀測紀錄與已發表的預測</li>
        <li><span class="badge inf">推測呈現</span>彗尾的長度與外觀是示意；「推算」的回歸是用平均週期往後推的</li>
      </ul>
    </div>`;
}

/** Fill in the Sim Time–dependent fields of an open comet Body Card. */
export function updateCometCard(root: HTMLElement, date: Date): void {
  const card = root.querySelector<HTMLElement>('.comet-card');
  const c = card && COMET_BY_ID[card.dataset.comet!];
  if (!card || !c) return;
  const t = date.getTime();
  const { prev, next } = bracketReturns(returnTimes(c), c.orbit, t);
  const ago = t - prev.time < DAY_MS ? '就是現在' : `${formatSpan(t - prev.time)}前`;
  const p = cometPosition(c.orbit, returnTimes(c), t);
  const rM = Math.hypot(p[0], p[1], p[2]) * METERS.AU;
  const set = (key: string, text: string) => {
    const el = card.querySelector(`[data-live="${key}"]`);
    if (el && el.textContent !== text) el.textContent = text;
  };
  set('next', `${formatReturnDate(next)}，還有 ${formatSpan(next.time - t)}`);
  set('prev', `${formatReturnDate(prev)}，${ago}`);
  set('dist', `${formatDistance(rM)}，陽光要走 ${formatLightTime(rM)}`);
}

/**
 * Sim Time to jump to for a comet's previous or next Return. "Previous" skips a
 * Return passed within the last month, so pressing it again keeps going back.
 */
export function cometJumpTime(id: string, which: 'prev' | 'next', t: number): number | null {
  const c = COMET_BY_ID[id];
  if (!c) return null;
  const ret = returnTimes(c);
  return which === 'next' ? bracketReturns(ret, c.orbit, t).next.time : bracketReturns(ret, c.orbit, t - 30 * DAY_MS).prev.time;
}
