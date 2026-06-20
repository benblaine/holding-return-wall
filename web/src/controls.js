// controls.js - all control-bar wiring: presets, chips, search, horizons, price/
// shared toggles, SORT (§7.2), benchmark overlays + badges (§7.3), mobile drawer.
// Mutates `state`, then calls back into the app glue (passed via initControls).
import { state, ctx, HZ, GREEN, CLSCOL, activeSortH, longestActive } from './state.js';
import { sampleAt, inflHurdle } from './render.js';

let app; // { grid, redrawAll, rafRedraw, sync, pushURL }

// =====================================================================  SORT
function metricFor(a, h, mode) {
  const ln = a.hasData ? a.r[h] : null;
  if (!ln || !ln.length) return null;
  if (mode === 'latest') return ln[ln.length - 1][1];
  const vals = ln.map(p => p[1]);
  if (mode === 'best') return Math.max(...vals);
  if (mode === 'worst') return Math.min(...vals);
  if (mode === 'median') { const s = [...vals].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  return null;
}

// Reorder grid DOM by re-appending the existing card nodes (moving an in-DOM node
// preserves its canvas, listeners, and IntersectionObserver registration).
// Tiers: 0 has-metric (sorted), 1 has-data-but-not-this-horizon, 2 placeholder (last).
export function applySort() {
  const h = activeSortH(), mode = state.sort;
  const order = ctx.A.map((a, i) => {
    const tier = !a.hasData ? 2 : (mode !== 'universe' && metricFor(a, h, mode) === null ? 1 : 0);
    const m = (mode === 'universe' || tier !== 0) ? 0 : metricFor(a, h, mode);
    return { id: a.id, i, tier, m };
  }).sort((p, q) => {
    if (p.tier !== q.tier) return p.tier - q.tier;
    if (p.tier !== 0 || mode === 'universe') return p.i - q.i;       // stable universe order
    return (mode === 'worst' ? p.m - q.m : q.m - p.m) || p.i - q.i;  // worst asc, others desc
  });
  const frag = document.createDocumentFragment();
  for (const o of order) { const c = ctx.cards[o.id]; if (c) frag.appendChild(c.card); }
  app.grid.appendChild(frag);
  const emp = document.getElementById('emptyMsg'); if (emp) app.grid.appendChild(emp);
  app.rafRedraw();
}

// =================================================================  BADGES
function badge(label, ok) { return `<span class="badge ${ok ? 'ok' : 'no'}">${label} ${ok ? '✓' : '✗'}</span>`; }

function badgeHTML(a) {
  const H = activeSortH();
  const ln = a.r[H];
  const latest = ln && ln.length ? ln[ln.length - 1] : null;   // [buyYear, assetMultiple]
  if (!latest) return '';
  const out = [];
  if (state.ovSp && ctx.baselines?.sp500?.r?.[H]) {
    const sp = sampleAt(ctx.baselines.sp500.r[H], latest[0]);  // S&P N-yr return at the SAME buy month
    if (sp != null) out.push(badge(`beat S&P ${H}y`, latest[1] >= sp));
  }
  if (state.ovInf && ctx.baselines?.inflation?.cum?.length) {
    const hur = inflHurdle(latest[0], Number(H));               // inflation hurdle at the same buy month
    if (hur != null) out.push(badge('beat inflation', latest[1] >= hur));
  }
  return out.join('');
}

export function refreshBadges() {
  const anyOv = ctx.baselines && (state.ovSp || state.ovInf);
  for (const id in ctx.cards) {
    const c = ctx.cards[id]; if (!c.badges) continue;
    const a = ctx.byId[id];
    c.badges.innerHTML = (anyOv && a.hasData && state.vis.has(id)) ? badgeHTML(a) : '';
  }
}

// =================================================================  SELECTION
function refreshChips() {
  document.querySelectorAll('.chip.asset').forEach(c => c.classList.toggle('on', state.vis.has(c.dataset.id)));
}
function afterSelectionChange() { app.sync(); refreshBadges(); app.pushURL(); }
function setVis(pred) { state.vis = new Set(ctx.A.filter(pred).map(a => a.id)); refreshChips(); afterSelectionChange(); }

function buildPresets() {
  const $ = id => document.getElementById(id);
  $('bReal').textContent = `real data (${ctx.realIds.length})`;
  $('bAll').textContent = `all ${ctx.A.length}`;
  $('bReal').onclick = () => setVis(a => a.hasData);
  $('bAll').onclick = () => setVis(() => true);
  $('bCrypto').onclick = () => setVis(a => a.cls === 'crypto');
  $('bEquity').onclick = () => setVis(a => a.cls === 'equity');
  $('bMetal').onclick = () => setVis(a => a.cls === 'metal');
  $('bFx').onclick = () => setVis(a => a.cls === 'currency');
  $('bNone').onclick = () => setVis(() => false);
  $('search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('.chip.asset').forEach(c => { c.style.display = (!q || c.dataset.search.includes(q)) ? '' : 'none'; });
  });
}

function buildAssetChips() {
  const ac = document.getElementById('assetChips');
  ac.innerHTML = '';
  ctx.A.forEach(a => {
    const c = document.createElement('span');
    c.className = 'chip asset' + (a.hasData ? '' : ' nodata') + (state.vis.has(a.id) ? ' on' : '');
    c.dataset.id = a.id; c.dataset.search = (a.name + ' ' + a.id).toLowerCase();
    c.innerHTML = `<span class="cd" style="background:${CLSCOL[a.cls] || '#7f9cd0'}"></span>${a.name}`;
    c.onclick = () => { c.classList.toggle('on'); c.classList.contains('on') ? state.vis.add(a.id) : state.vis.delete(a.id); afterSelectionChange(); };
    ac.appendChild(c);
  });
}

// =================================================================  HORIZONS
function hzStyle(c, h, on) {
  if (on) { c.style.background = GREEN[h]; c.style.color = (h === '1' || h === '2' || h === '3') ? '#cfeede' : '#06210f'; }
  else { c.style.background = ''; c.style.color = ''; }
}
function buildHorizons() {
  document.querySelectorAll('[data-h]').forEach(c => {
    const h = c.dataset.h;
    if (state.hz.has(h)) { c.classList.add('on'); hzStyle(c, h, true); }
    c.onclick = () => {
      const on = c.classList.toggle('on');
      on ? state.hz.add(h) : state.hz.delete(h);
      hzStyle(c, h, on);
      onHorizonChange();
    };
  });
}
function onHorizonChange() {
  app.redrawAll();
  if (state.sort !== 'universe' && state.sortH == null) applySort(); // sort horizon follows longest active
  syncSortHz();
  updateSortLabels();
  refreshBadges();
  app.pushURL();
}

function buildToggles() {
  const tp = document.getElementById('togPrice'), ts = document.getElementById('togShared');
  tp.classList.toggle('on', state.price); ts.classList.toggle('on', state.shared);
  tp.onclick = function () { this.classList.toggle('on'); state.price = this.classList.contains('on'); app.redrawAll(); };
  ts.onclick = function () { this.classList.toggle('on'); state.shared = this.classList.contains('on'); app.redrawAll(); };
}

// =================================================================  SORT UI
const SORT_LABELS = { latest: 'Latest', best: 'Best-ever', median: 'Median', worst: 'Worst' };
function syncSortHz() { const hz = document.getElementById('sortHz'); if (hz) hz.value = activeSortH() || longestActive() || '20'; }
function updateSortLabels() {
  const mode = document.getElementById('sortMode'); if (!mode) return;
  const H = activeSortH() || '?';
  for (const opt of mode.options) { if (opt.value !== 'universe') opt.textContent = `${SORT_LABELS[opt.value]} ${H}-yr`; }
}
function buildSort() {
  const mode = document.getElementById('sortMode'), hz = document.getElementById('sortHz');
  hz.innerHTML = HZ.map(h => `<option value="${h}">${h}-yr</option>`).join('');
  mode.value = state.sort;
  hz.disabled = (state.sort === 'universe');
  syncSortHz(); updateSortLabels();
  mode.onchange = () => { state.sort = mode.value; hz.disabled = (state.sort === 'universe'); updateSortLabels(); applySort(); refreshBadges(); app.pushURL(); };
  hz.onchange = () => { state.sortH = hz.value; updateSortLabels(); applySort(); app.redrawAll(); refreshBadges(); app.pushURL(); };
}

// =================================================================  OVERLAYS
function buildOverlays() {
  const sp = document.getElementById('togSp'), inf = document.getElementById('togInf');
  if (!ctx.baselines) { sp.style.display = inf.style.display = 'none'; return; }
  const haveSp = Object.keys(ctx.baselines.sp500?.r || {}).length > 0;
  const haveInf = (ctx.baselines.inflation?.cum || []).length > 0;
  if (!haveSp) { sp.style.display = 'none'; state.ovSp = false; }
  if (!haveInf) { inf.style.display = 'none'; state.ovInf = false; }
  sp.classList.toggle('on', state.ovSp); inf.classList.toggle('on', state.ovInf);
  sp.onclick = function () { this.classList.toggle('on'); state.ovSp = this.classList.contains('on'); app.redrawAll(); refreshBadges(); app.pushURL(); };
  inf.onclick = function () { this.classList.toggle('on'); state.ovInf = this.classList.contains('on'); app.redrawAll(); refreshBadges(); app.pushURL(); };
}

// =================================================================  MOBILE
function buildMobileDrawer() {
  const bar = document.getElementById('bar'), tog = document.getElementById('barToggle');
  if (!tog) return;
  tog.onclick = () => { const open = bar.classList.toggle('open'); tog.setAttribute('aria-expanded', open ? 'true' : 'false'); };
}

export function initControls(a) {
  app = a;
  buildPresets();
  buildAssetChips();
  buildHorizons();
  buildToggles();
  buildSort();
  buildOverlays();
  buildMobileDrawer();
}
