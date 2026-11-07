import './style.css';
import { CLOSE_UP_INFO, LEVEL_INFO } from './content/info';
import { magnifyNote, type ViewId } from './content/magnify';
import { CREDITS } from './content/credits';
import { RATE_PRESETS, defaultTimeRate } from './core/clock';
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
import { BottomSheet, watchLayout, type LayoutMode } from './ui/layout';
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
  let mode: LayoutMode = 'desktop';

  // ---- Sim Time ----
  // Entering a view switches to its Default Time Rate (pause state is kept); a rate
  // picked by hand lasts until the view changes.
  const rate = $<HTMLSelectElement>('#time-rate');
  let timeView: ViewId = initial;
  const syncRateMenu = () => {
    const def = defaultTimeRate(timeView);
    rate.innerHTML = RATE_PRESETS.map((p, i) => `<option value="${i}">${p.label}${p.rate === def ? '（預設）' : ''}</option>`).join('');
    rate.value = String(Math.max(0, RATE_PRESETS.findIndex((p) => p.rate === engine.clock.rate)));
  };
  const enterTimeView = (view: ViewId) => {
    timeView = view;
    engine.clock.rate = defaultTimeRate(view);
    syncRateMenu();
  };
  rate.addEventListener('change', () => (engine.clock.rate = RATE_PRESETS[+rate.value].rate));
  const play = $('#time-play');
  play.addEventListener('click', () => {
    engine.clock.paused = !engine.clock.paused;
    play.textContent = engine.clock.paused ? '▶' : '⏸';
  });
  $('#time-now').addEventListener('click', () => {
    engine.clock.resetToNow(defaultTimeRate(timeView));
    syncRateMenu();
    play.textContent = '⏸';
  });
  const dateEl = $<HTMLButtonElement>('#date');
  const dateFmt = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const dateFmtShort = new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  // on phones the time controls fold into one chip (date + pause); tapping the date opens the rest
  const timeBox = $('#time');
  const setTimeOpen = (open: boolean) => {
    timeBox.classList.toggle('open', open);
    dateEl.setAttribute('aria-expanded', String(open));
  };
  dateEl.addEventListener('click', () => setTimeOpen(!timeBox.classList.contains('open')));

  // ---- Scale Ladder ----
  const ladder = $('#ladder');
  const ladderButtons = LEVEL_IDS.map((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="pip"></span><span>${LEVEL_INFO[id].title}</span><span class="exp">10<sup>${Math.round(HOME_S[id])}</sup> m</span>`;
    b.addEventListener('click', () => {
      engine.goToLevel(id);
      setLadderOpen(false);
      dismissHint();
    });
    ladder.appendChild(b);
    return b;
  });

  // On phones the level title doubles as the way in: it opens the ladder as a
  // dropdown in a Scale Level and leaves the Close-up in a Close-up.
  const where = $<HTMLButtonElement>('#where');
  const setLadderOpen = (open: boolean) => {
    ladder.classList.toggle('open', open);
    where.setAttribute('aria-expanded', String(open));
  };
  where.addEventListener('click', () => {
    if (engine.activeCloseUp()) engine.exitCloseUp();
    else setLadderOpen(!ladder.classList.contains('open'));
  });

  // ---- Info Panel ----
  const panel = $('#panel');
  const panelBtn = $('#panel-btn');
  const panelScroll = $('#panel-scroll');
  const sheet = new BottomSheet(panel, $('#sheet-bar'), $<HTMLButtonElement>('#sheet-toggle'), panelScroll);
  sheet.onShift = (px) => engine.setViewShift(px);
  const setPanel = (open: boolean) => {
    panel.classList.toggle('collapsed', !open);
    panelBtn.setAttribute('aria-expanded', String(open));
  };
  panelBtn.addEventListener('click', () => setPanel(panel.classList.contains('collapsed')));
  const applyMode = (m: LayoutMode) => {
    mode = m;
    sheet.enable(m === 'sheet');
    setPanel(m !== 'side');
    where.disabled = dateEl.disabled = m === 'desktop';
    setLadderOpen(false);
    setTimeOpen(false);
  };
  applyMode(watchLayout(applyMode));
  const levelSlot = $('#level-slot');
  const bodySlot = $('#body-slot');
  const sheetTitle = $('#sheet-title');
  const setTitle = (title: string, titleEn: string, span: string, closeUp: string | null) => {
    $('#level-title').innerHTML = closeUp
      ? `<span class="back-arrow" aria-hidden="true">←</span>${title}<small>${titleEn}</small>`
      : `${title}<small>${titleEn}</small><span class="chev" aria-hidden="true">▾</span>`;
    where.setAttribute('aria-label', closeUp ? `離開${title}，${closeUp}` : `${title}，切換尺度層級`);
    sheetTitle.innerHTML = `<strong>${title}</strong><span>畫面範圍${span}</span>`;
  };

  const showLevel = (i: number) => {
    if (engine.activeCloseUp()) return;
    const id = LEVEL_IDS[i];
    ladderButtons.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    setTitle(LEVEL_INFO[id].title, LEVEL_INFO[id].titleEn, LEVEL_INFO[id].span, null);
    levelSlot.innerHTML = renderLevel(id);
    $('#time').hidden = i > 1;
    enterTimeView(id);
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
    setTitle(info.title, info.titleEn, info.span, back.textContent.slice(2));
    levelSlot.innerHTML = renderCloseUp(id);
    $('#time').hidden = false;
    enterTimeView(id);
    if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
    document.title = `${info.title}｜宇宙尺度`;
    panelScroll.scrollTop = 0;
  };
  back.addEventListener('click', () => engine.exitCloseUp());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && engine.activeCloseUp() && !document.querySelector('dialog[open]')) engine.exitCloseUp();
  });
  if (route?.kind === 'closeUp') engine.enterCloseUp(route.id, undefined, true);

  // A Body Card opens the sheet to half height; closing it drops the sheet back
  // to its bar (unless the viewer has pulled it all the way up meanwhile).
  const cardClosed = () => {
    if (sheet.active && sheet.state === 'half') sheet.set('peek');
  };
  engine.onFocusChange = (marker) => {
    const hadCard = !!bodySlot.innerHTML;
    bodySlot.innerHTML = marker ? renderBody(marker) : '';
    bodySlot.querySelector('.close')?.addEventListener('click', () => {
      bodySlot.innerHTML = '';
      engine.releaseFocus();
      cardClosed();
    });
    if (marker && bodySlot.innerHTML) {
      if (sheet.active) {
        if (sheet.state === 'peek') sheet.set('half');
      } else setPanel(true);
      panelScroll.scrollTop = 0;
    } else if (hadCard) cardClosed();
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
  // phone dropdowns (ladder, time chip) close on a tap elsewhere or Esc
  document.addEventListener('click', (e) => {
    const t = e.target as Node;
    if (ladder.classList.contains('open') && !ladder.contains(t) && !where.contains(t)) setLadderOpen(false);
    if (timeBox.classList.contains('open') && !timeBox.contains(t)) setTimeOpen(false);
  });
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (ladder.classList.contains('open') || timeBox.classList.contains('open')) {
        setLadderOpen(false);
        setTimeOpen(false);
        e.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
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


  // ---- credits ----
  const dialog = $<HTMLDialogElement>('#credits');
  for (const b of document.querySelectorAll('#credits-btn, .credits-open'))
    b.addEventListener('click', () => {
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
      if (engine.dominant <= 1 || engine.activeCloseUp()) dateEl.textContent = (mode === 'desktop' ? dateFmt : dateFmtShort).format(engine.clock.date);
    }
  };

  engine.start();
}

main();
