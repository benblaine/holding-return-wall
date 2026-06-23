// main.js - orchestrator: load data, build cards, lazy-draw, sync, URL write-back.
// Holds the app glue (redrawAll / rafRedraw / sync / pushURL) that controls.js calls.
import { state, ctx, decodeURL, encodeURL } from './state.js';
import { loadData } from './data.js';
import { draw, invX } from './render.js';
import { initControls, applySort, refreshBadges } from './controls.js';
import { initFullscreen, openFullscreen } from './fullscreen.js';

const grid = document.getElementById('grid');

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
// URL write-back is only ever called from user handlers (never during boot), so the
// debounced replaceState can't race the initial seed-from-URL.
const pushURL = debounce(() => history.replaceState(null, '', encodeURL()), 250);

// ---- states ----------------------------------------------------------------
function showSkeleton() {
  grid.innerHTML = '';
  for (let i = 0; i < 24; i++) {
    const d = document.createElement('div'); d.className = 'card skel';
    d.innerHTML = '<div class="skelbar"></div><div class="skelcanvas"></div>';
    grid.appendChild(d);
  }
}
function showError(e) {
  grid.innerHTML = `<div class="err">Couldn't load the data feed (${e.message}).<br><button id="retry">Retry</button></div>`;
  document.getElementById('retry').onclick = () => boot();
}

function seedStateFromURL() {
  const patch = decodeURL(location.search);
  state.vis = patch.vis ? patch.vis : new Set(ctx.realIds);  // default = real-data assets
  if (patch.hz) state.hz = patch.hz;
  if (patch.sort) state.sort = patch.sort;
  if (patch.sortH != null) state.sortH = patch.sortH;
  if (patch.ovSp != null) state.ovSp = patch.ovSp;
  if (patch.ovInf != null) state.ovInf = patch.ovInf;
}

// ---- cards (built once; sort only re-appends them) -------------------------
function buildCards() {
  grid.innerHTML = '';
  ctx.cards = {};
  ctx.A.forEach(a => {
    const card = document.createElement('div'); card.className = 'card' + (a.hasData ? '' : ' ph'); card.dataset.id = a.id;
    const since = a.hasData ? `since ${Math.floor(a.inc)} &middot; ${a.p.length} months` : `${a.bucket}`;
    card.innerHTML = `<h3>${a.name}<span class="tag ${a.cls}">${a.cls}</span></h3><div class="badges"></div><div class="meta">${since}</div>`;
    const badges = card.querySelector('.badges');
    if (a.hasData) {
      const exp = document.createElement('button');
      exp.className = 'expand'; exp.type = 'button'; exp.title = 'Full screen';
      exp.setAttribute('aria-label', `Open ${a.name} full screen`); exp.innerHTML = '&#9974;';
      exp.addEventListener('click', () => openFullscreen(a.id));
      card.appendChild(exp);
      const cv = document.createElement('canvas'); card.appendChild(cv);
      ctx.cards[a.id] = { card, cv, badges };
      const move = clientX => { const r = cv.getBoundingClientRect(); state.hoverYear = invX((clientX - r.left) / r.width); state.hoverId = a.id; rafRedraw(); };
      cv.addEventListener('mousemove', e => move(e.clientX));
      cv.addEventListener('mouseleave', () => { state.hoverYear = null; state.hoverId = null; rafRedraw(); });
      cv.addEventListener('touchmove', e => { if (e.touches[0]) move(e.touches[0].clientX); }, { passive: true });
      cv.addEventListener('touchend', () => { state.hoverYear = null; state.hoverId = null; rafRedraw(); });
    } else {
      const pb = document.createElement('div'); pb.className = 'phbox';
      pb.innerHTML = `<span class="big">&#9633;</span>awaiting price feed<span style="color:#36465f">spot metal &middot; feed pending</span>`;
      card.appendChild(pb); ctx.cards[a.id] = { card, cv: null, badges };
    }
    grid.appendChild(card);
  });
}

// ---- lazy draw + redraw ----------------------------------------------------
function setupIO() {
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { const id = e.target.dataset.id; if (state.vis.has(id)) draw(id); } });
  }, { rootMargin: '250px' });
  Object.values(ctx.cards).forEach(c => io.observe(c.card));
}
function visibleOnScreen() {
  const out = [];
  for (const id in ctx.cards) {
    if (!state.vis.has(id)) continue;
    const r = ctx.cards[id].card.getBoundingClientRect();
    if (r.bottom > -250 && r.top < innerHeight + 250) out.push(id);
  }
  return out;
}
function redrawAll() { visibleOnScreen().forEach(draw); }
let raf = null;
function rafRedraw() { if (raf) return; raf = requestAnimationFrame(() => { raf = null; redrawAll(); }); }

function sync() {
  let n = 0;
  for (const id in ctx.cards) { const on = state.vis.has(id); ctx.cards[id].card.style.display = on ? '' : 'none'; if (on) n++; }
  const real = [...state.vis].filter(id => ctx.byId[id]?.hasData).length;
  document.getElementById('count').textContent = `${n} shown · ${real} with data`;
  let emp = document.getElementById('emptyMsg');
  if (n === 0 && !emp) { emp = document.createElement('div'); emp.id = 'emptyMsg'; emp.className = 'empty'; emp.textContent = 'No assets selected.'; grid.appendChild(emp); }
  else if (n > 0 && emp) { emp.remove(); }
  redrawAll();
}

const app = { grid, redrawAll, rafRedraw, sync, pushURL };

async function boot() {
  showSkeleton();
  try { await loadData(); }
  catch (e) { showError(e); return; }
  seedStateFromURL();
  buildCards();
  setupIO();
  initControls(app);
  initFullscreen();
  applySort();
  refreshBadges();
  sync();
}

addEventListener('resize', () => rafRedraw());
addEventListener('scroll', () => rafRedraw(), { passive: true });
boot();
