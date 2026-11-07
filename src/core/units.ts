import { METERS } from './scale';

export const SPEED_OF_LIGHT = 299792458; // m/s

function fmt(x: number): string {
  if (x >= 100) return Math.round(x).toLocaleString('en-US');
  if (x >= 10) return x.toFixed(1).replace(/\.0$/, '');
  return x.toFixed(2).replace(/\.?0+$/, '');
}

/** Human-readable distance in Traditional Chinese, choosing a sensible unit. */
export function formatDistance(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '—';
  if (m < 1e3) return `${fmt(m)} 公尺`;
  if (m < 0.01 * METERS.AU) {
    const km = m / 1e3;
    if (km >= 1e4) return `${fmt(km / 1e4)} 萬公里`;
    return `${fmt(km)} 公里`;
  }
  if (m < 0.1 * METERS.LY) return `${fmt(m / METERS.AU)} 天文單位`;
  if (m < 1e3 * METERS.LY) return `${fmt(m / METERS.LY)} 光年`;
  if (m < 1e6 * METERS.LY) return `${fmt(m / (1e4 * METERS.LY))} 萬光年`;
  if (m < 1e8 * METERS.LY) return `${fmt(m / (1e6 * METERS.LY))} 百萬光年`;
  return `${fmt(m / (1e8 * METERS.LY))} 億光年`;
}

/** How long light takes to cross distance m, in Traditional Chinese. */
export function formatLightTime(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '—';
  const sec = m / SPEED_OF_LIGHT;
  if (sec < 60) return `${fmt(sec)} 秒`;
  const min = sec / 60;
  if (min < 60) return `${fmt(min)} 分鐘`;
  const hr = min / 60;
  if (hr < 24) return `${fmt(hr)} 小時`;
  const day = hr / 24;
  if (day < 365.25) return `${fmt(day)} 天`;
  const yr = day / 365.25;
  if (yr < 1e4) return `${fmt(yr)} 年`;
  if (yr < 1e8) return `${fmt(yr / 1e4)} 萬年`;
  return `${fmt(yr / 1e8)} 億年`;
}
