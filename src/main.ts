import './style.css';
import { LEVEL_INFO } from './content/info';
import { CREDITS } from './content/credits';
import { RATE_PRESETS } from './core/clock';
import { Engine } from './core/engine';
import type { ScaleLevel } from './core/level';
import { HOME_S, LEVEL_IDS, parseHash, type LevelId } from './core/scale';
import { formatDistance, formatLightTime } from './core/units';
import { EarthMoonLevel } from './levels/earthMoon';
import { HeliosphereLevel } from './levels/heliosphere';
import { LaniakeaLevel } from './levels/laniakea';
import { LocalGroupLevel } from './levels/localGroup';
import { MilkyWayLevel } from './levels/milkyWay';
import { ObservableLevel } from './levels/observable';
import { OortLevel } from './levels/oort';
import { PlanetaryLevel } from './levels/planetary';
import { StellarLevel } from './levels/stellar';
import { assetUrl } from './render/assets';
import { attachControls } from './ui/controls';
import { MarkerOverlay } from './ui/markers';
import { renderBody, renderCredits, renderLevel } from './ui/panel';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

function showFallback(): void {
  const box = $('#no-webgl');
  box.hidden = false;
  const list = $('#no-webgl-list');
  list.innerHTML = LEVEL_IDS.map((id) => {
    const info = LEVEL_INFO[id];
    const photo = CREDITS.find((c) => c.kind === 'photo' && c.level === id);
    return `<section><h2>${info.title}</h2><p>${info.intro}</p>${photo ? `<img src="${assetUrl(photo.file)}" alt="${photo.titleZh ?? photo.title}"><p class="credit">${photo.author} · ${photo.license}</p>` : ''}</section>`;
  }).join('');
}

function main(): void {
  if (!webglAvailable()) {
    showFallback();
    return;
  }

  const levels: ScaleLevel[] = [
    new EarthMoonLevel(),
    new PlanetaryLevel(),
    new HeliosphereLevel(),
    new OortLevel(),
    new StellarLevel(),
    new MilkyWayLevel(),
    new LocalGroupLevel(),
    new LaniakeaLevel(),
    new ObservableLevel(),
  ];
  const initial: LevelId = parseHash(location.hash) ?? 'earth-moon';
  const engine = new Engine($<HTMLCanvasElement>('#scene'), levels, initial);
  const overlay = new MarkerOverlay($('#markers'), engine);

  // ---- Scale Ladder ----
  const ladder = $('#ladder');
  const ladderButtons = LEVEL_IDS.map((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="pip"></span><span>${LEVEL_INFO[id].title}</span><span class="exp">10<sup>${Math.round(HOME_S[id])}</sup> m</span>`;
    b.addEventListener('click', () => {
      engine.goToLevel(id);
      dismissHint();
    });
    ladder.appendChild(b);
    return b;
  });

  // ---- panel ----
  const panel = $('#panel');
  const panelBtn = $('#panel-btn');
  const setPanel = (open: boolean) => {
    panel.classList.toggle('collapsed', !open);
    panelBtn.setAttribute('aria-expanded', String(open));
  };
  setPanel(window.innerWidth > 760);
  panelBtn.addEventListener('click', () => setPanel(panel.classList.contains('collapsed')));
  const levelSlot = $('#level-slot');
  const bodySlot = $('#body-slot');

  const showLevel = (i: number) => {
    const id = LEVEL_IDS[i];
    ladderButtons.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    $('#level-title').innerHTML = `${LEVEL_INFO[id].title}<small>${LEVEL_INFO[id].titleEn}</small>`;
    levelSlot.innerHTML = renderLevel(id);
    $('#time').hidden = i > 1;
    if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
    document.title = `${LEVEL_INFO[id].title}｜宇宙尺度`;
  };
  engine.onDominantChange = (i) => {
    showLevel(i);
    bodySlot.innerHTML = '';
  };
  showLevel(engine.dominant);

  engine.onFocusChange = (marker) => {
    bodySlot.innerHTML = marker ? renderBody(marker) : '';
    bodySlot.querySelector('.close')?.addEventListener('click', () => {
      bodySlot.innerHTML = '';
      engine.releaseFocus();
    });
    if (marker && bodySlot.innerHTML) {
      setPanel(true);
      panel.scrollTop = 0;
    }
  };

  window.addEventListener('hashchange', () => {
    const id = parseHash(location.hash);
    if (id && LEVEL_IDS[engine.dominant] !== id) engine.goToLevel(id);
  });

  // ---- magnify ----
  const magnify = $<HTMLInputElement>('#magnify');
  magnify.addEventListener('change', () => (engine.magnify = magnify.checked));

  // ---- Sim Time ----
  const rate = $<HTMLSelectElement>('#time-rate');
  rate.innerHTML = RATE_PRESETS.map((p, i) => `<option value="${i}">${p.label}</option>`).join('');
  rate.addEventListener('change', () => (engine.clock.rate = RATE_PRESETS[+rate.value].rate));
  const play = $('#time-play');
  play.addEventListener('click', () => {
    engine.clock.paused = !engine.clock.paused;
    play.textContent = engine.clock.paused ? '▶' : '⏸';
  });
  $('#time-now').addEventListener('click', () => {
    engine.clock.resetToNow();
    rate.value = '0';
    play.textContent = '⏸';
  });
  const dateEl = $('#date');
  const dateFmt = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  // ---- credits ----
  const dialog = $<HTMLDialogElement>('#credits');
  $('#credits-btn').addEventListener('click', () => {
    dialog.querySelector('.content')!.innerHTML = renderCredits();
    dialog.showModal();
  });
  dialog.querySelector('.close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());

  // ---- hint ----
  const hint = $('#hint');
  let hinted = false;
  function dismissHint() {
    if (hinted) return;
    hinted = true;
    setTimeout(() => hint.classList.add('gone'), 2500);
  }

  attachControls($('#scene'), engine, dismissHint);

  const loading = $('#loading');
  engine.onLoadingChange = (on) => (loading.hidden = !on);

  // ---- HUD readout ----
  const widthEl = $('#view-width');
  const lightEl = $('#light-time');
  let frame = 0;
  engine.onFrame = () => {
    overlay.update();
    if (frame++ % 6 === 0) {
      const w = engine.viewWidthMeters();
      widthEl.textContent = `畫面寬度約 ${formatDistance(w)}`;
      lightEl.textContent = `光走過要 ${formatLightTime(w)}`;
      if (engine.dominant <= 1) dateEl.textContent = dateFmt.format(engine.clock.date);
    }
  };

  engine.start();
}

main();
