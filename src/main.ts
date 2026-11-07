import './style.css';
import { CLOSE_UP_INFO, LEVEL_INFO } from './content/info';
import { magnifyNote, type ViewId } from './content/magnify';
import { CREDITS } from './content/credits';
import { RATE_PRESETS } from './core/clock';
import { CLOSE_UP_RANGES, parseRoute } from './core/closeUp';
import { Engine } from './core/engine';
import type { ScaleLevel } from './core/level';
import { HOME_S, LEVEL_IDS, type LevelId } from './core/scale';
import { CygnusX1CloseUp } from './closeUps/cygnusX1';
import { SgrACloseUp } from './closeUps/sgrA';
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
import { renderBody, renderCloseUp, renderCredits, renderLevel } from './ui/panel';

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
  const route = parseRoute(location.hash);
  const initial: LevelId = route?.kind === 'level' ? route.id : route?.kind === 'closeUp' ? CLOSE_UP_RANGES[route.id].returnLevel : 'earth-moon';
  const engine = new Engine($<HTMLCanvasElement>('#scene'), levels, [new CygnusX1CloseUp(), new SgrACloseUp()], initial);
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
    if (engine.activeCloseUp()) return;
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

  // ---- Close-ups ----
  const back = $<HTMLButtonElement>('#back');
  const fromEarth = $('#from-earth');
  engine.onCloseUpChange = (id) => {
    ladder.hidden = !!id;
    back.hidden = !id;
    fromEarth.hidden = !id;
    bodySlot.innerHTML = '';
    if (!id) {
      showLevel(engine.dominant);
      return;
    }
    const info = CLOSE_UP_INFO[id];
    back.textContent = `← 回到${LEVEL_INFO[CLOSE_UP_RANGES[id].returnLevel].title}`;
    fromEarth.textContent = info.fromEarth;
    $('#level-title').innerHTML = `${info.title}<small>${info.titleEn}</small>`;
    levelSlot.innerHTML = renderCloseUp(id);
    $('#time').hidden = false;
    if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
    document.title = `${info.title}｜宇宙尺度`;
    panel.scrollTop = 0;
  };
  back.addEventListener('click', () => engine.exitCloseUp());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && engine.activeCloseUp() && !document.querySelector('dialog[open]')) engine.exitCloseUp();
  });
  if (route?.kind === 'closeUp') engine.enterCloseUp(route.id, undefined, true);

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
    const r = parseRoute(location.hash);
    if (!r) return;
    if (r.kind === 'closeUp') {
      if (engine.activeCloseUp() !== r.id) engine.enterCloseUp(r.id, undefined, true);
      return;
    }
    if (engine.activeCloseUp()) engine.exitCloseUp();
    if (LEVEL_IDS[engine.dominant] !== r.id) engine.goToLevel(r.id);
  });

  // ---- magnify ----
  const magnify = $<HTMLInputElement>('#magnify');
  engine.magnify = magnify.checked; // on by default (see GLOSSARY: 放大天體)
  magnify.addEventListener('change', () => (engine.magnify = magnify.checked));

  // Explanation of what the toggle does in the current view: shown while the
  // mouse is over the toggle or it has keyboard focus; the "?" button pins it
  // open (the way to read it on touch screens) until tapped again, tapped
  // elsewhere, or Esc.
  const magnifyWrap = $('#magnify-wrap');
  const magnifyInfo = $<HTMLButtonElement>('#magnify-info');
  const magnifyTip = $('#magnify-tip');
  let tipPinned = false;
  let tipHover = false;
  const currentView = (): ViewId => engine.activeCloseUp() ?? LEVEL_IDS[engine.dominant];
  const syncTip = () => {
    const open = tipPinned || tipHover;
    if (open) magnifyTip.textContent = magnifyNote(currentView());
    magnifyTip.hidden = !open;
    magnifyInfo.setAttribute('aria-expanded', String(tipPinned));
    if (open) {
      // keep the box inside the screen (on phones the toolbar sits at the bottom edge)
      magnifyTip.style.transform = '';
      const r = magnifyTip.getBoundingClientRect();
      const dx = Math.min(0, window.innerWidth - 8 - r.right) + Math.max(0, 8 - r.left);
      if (dx) magnifyTip.style.transform = `translateX(${dx}px)`;
    }
  };
  magnifyWrap.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    tipHover = true;
    syncTip();
  });
  magnifyWrap.addEventListener('pointerleave', () => {
    tipHover = false;
    syncTip();
  });
  magnifyWrap.addEventListener('focusin', (e) => {
    if ((e.target as HTMLElement).matches(':focus-visible')) {
      tipHover = true;
      syncTip();
    }
  });
  magnifyWrap.addEventListener('focusout', () => {
    tipHover = false;
    syncTip();
  });
  magnifyInfo.addEventListener('click', (e) => {
    e.stopPropagation();
    tipPinned = !tipPinned;
    syncTip();
  });
  document.addEventListener('click', (e) => {
    if (tipPinned && !magnifyWrap.contains(e.target as Node)) {
      tipPinned = false;
      syncTip();
    }
  });
  // capture, so Esc closes the explanation before it would leave a Close-up
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && !magnifyTip.hidden) {
        tipPinned = tipHover = false;
        syncTip();
        e.stopImmediatePropagation();
      }
    },
    { capture: true },
  );

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
      if (!magnifyTip.hidden) magnifyTip.textContent = magnifyNote(currentView());
      if (engine.dominant <= 1 || engine.activeCloseUp()) dateEl.textContent = dateFmt.format(engine.clock.date);
    }
  };

  engine.start();
}

main();
