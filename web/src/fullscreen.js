// fullscreen.js - the per-tile fullscreen view + period-selection -> Google News.
// Reuses render.js draw() against a big canvas (SPEC §4: same vanilla renderer,
// no chart framework). Drag across the chart to pick a buy-date period; on
// release we offer a Google News link filtered to that custom date range.
import { state, ctx } from './state.js';
import { draw } from './render.js';

let overlay, cv, nameEl, metaEl, hintEl, newsEl;
let curId = null, target = null, dragging = false;

export function initFullscreen() {
  overlay = document.getElementById('fsOverlay');
  if (!overlay) return;
  cv = document.getElementById('fsCanvas');
  nameEl = document.getElementById('fsName');
  metaEl = document.getElementById('fsMeta');
  hintEl = document.getElementById('fsHint');
  newsEl = document.getElementById('fsNews');
  target = { cv, cssW: 0, cssH: 0, focus: true, sel: null, _geom: null };

  document.getElementById('fsClose').onclick = close;
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  addEventListener('keydown', e => { if (!overlay.hidden && e.key === 'Escape') close(); });
  addEventListener('resize', () => { if (!overlay.hidden) redraw(); });

  cv.addEventListener('mousedown', e => onDown(e.clientX));
  cv.addEventListener('mousemove', e => onMove(e.clientX));
  addEventListener('mouseup', onUp);
  cv.addEventListener('mouseleave', () => { if (!dragging) { state.hoverYear = null; redraw(); } });
  cv.addEventListener('touchstart', e => { if (e.touches[0]) onDown(e.touches[0].clientX); }, { passive: true });
  cv.addEventListener('touchmove', e => { if (e.touches[0]) onMove(e.touches[0].clientX); }, { passive: true });
  cv.addEventListener('touchend', onUp);
}

export function openFullscreen(id) {
  if (!overlay) return;
  const a = ctx.byId[id]; if (!a || !a.hasData) return;
  curId = id;
  nameEl.innerHTML = `${a.name} <span class="tag ${a.cls}">${a.cls}</span>`;
  metaEl.textContent = `since ${Math.floor(a.inc)} · ${a.p.length} months`;
  target.sel = null; state.hoverYear = null;
  hideNews();
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(redraw);
}

function close() {
  overlay.hidden = true;
  document.body.style.overflow = '';
  curId = null; target.sel = null; dragging = false; state.hoverYear = null;
}

function redraw() {
  if (curId == null) return;
  const wrap = cv.parentElement;
  target.cssW = wrap.clientWidth;
  target.cssH = wrap.clientHeight;
  draw(curId, target);
}

// canvas-relative px -> decimal year, clamped to the asset's plotted x-domain
function xToYear(clientX) {
  const g = target._geom; if (!g) return null;
  const x = clientX - cv.getBoundingClientRect().left;
  const t = (x - g.padL) / (g.W - g.padL - g.padR);
  return g.x0 + Math.max(0, Math.min(1, t)) * (g.x1 - g.x0);
}

function onDown(clientX) {
  const y = xToYear(clientX); if (y == null) return;
  dragging = true; target.sel = { a: y, b: y }; state.hoverYear = null;
  hideNews(); redraw();
}
function onMove(clientX) {
  const y = xToYear(clientX); if (y == null) return;
  if (dragging) { target.sel.b = y; redraw(); }
  else { state.hoverYear = y; redraw(); }
}
function onUp() {
  if (!dragging) return;
  dragging = false;
  const s = target.sel;
  if (s && Math.abs(s.b - s.a) > 0.04) showNews(Math.min(s.a, s.b), Math.max(s.a, s.b));
  else { target.sel = null; hideNews(); redraw(); }
}

// ---- decimal year <-> calendar, and the Google News link --------------------
function decYearToDate(y) {
  const yr = Math.floor(y);
  const ms = Date.UTC(yr, 0, 1) + (y - yr) * (Date.UTC(yr + 1, 0, 1) - Date.UTC(yr, 0, 1));
  return new Date(ms);
}
function mdy(d) { return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`; }
function monLabel(d) { return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) + ' ' + d.getUTCFullYear(); }

function showNews(ya, yb) {
  const a = ctx.byId[curId];
  const da = decYearToDate(ya), db = decYearToDate(yb);
  // Google web search, News tab (tbm=nws), custom date range (tbs=cdr).
  const tbs = `cdr:1,cd_min:${mdy(da)},cd_max:${mdy(db)}`;
  const url = 'https://www.google.com/search?tbm=nws&q=' + encodeURIComponent(a.name)
    + '&tbs=' + encodeURIComponent(tbs);
  newsEl.href = url;
  newsEl.textContent = `Open Google News — ${a.name}, ${monLabel(da)} → ${monLabel(db)}`;
  newsEl.hidden = false; hintEl.hidden = true;
  redraw();
}
function hideNews() { if (newsEl) { newsEl.hidden = true; newsEl.removeAttribute('href'); } if (hintEl) hintEl.hidden = false; }
