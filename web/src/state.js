// state.js - app state, shared render context, and URL <-> state sync.
// Pure module: no DOM, no fetch. Imported by data/render/controls/main.

export const HZ = ['1', '2', '3', '4', '5', '10', '15', '20'];

// horizon colour ramps (darker = shorter hold, brighter = longer) - verbatim from prototype
export const GREEN = { '1':'#0d5530','2':'#147240','3':'#1c9450','4':'#28b561','5':'#45d579','10':'#74e69a','15':'#a3f2bd','20':'#cdf9da' };
export const RED   = { '1':'#6e1f29','2':'#8a2632','3':'#b22e3b','4':'#cc3744','5':'#e0414f','10':'#ef5965','15':'#ff8a93','20':'#ffb6bc' };
export const CLSCOL = { metal:'#d8b25a', equity:'#5fb98a', currency:'#c07fd0', crypto:'#7f9cd0' };

export const state = {
  vis: new Set(),          // visible asset ids
  hz: new Set(HZ),         // active hold lengths
  price: true,             // amber price overlay
  shared: false,           // shared vs per-tile Y scale
  hoverYear: null,         // synced crosshair decimal-year
  sort: 'universe',        // universe | latest | best | median | worst
  sortH: null,             // pinned sort horizon ('5'...) or null => longest active
  ovSp: false,             // vs S&P 500 overlay
  ovInf: false,            // vs inflation overlay
};

// the one mutable render context, populated by data.loadData()
export const ctx = { A: [], byId: {}, cards: {}, realIds: [], baselines: null, XMAX: 2026.42 };

export function longestActive() {
  const ns = [...state.hz].map(Number);
  return ns.length ? String(Math.max(...ns)) : null;
}

// the horizon that drives sort, the overlay reference line, and the badges
export function activeSortH() {
  return state.sortH ?? longestActive();
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// ---- URL state (SPEC §7.6): ?a=btc,gold&h=2,4&sort=best5&ov=sp,inf ----------
// Every param is omitted when at its default, so a default view is a clean URL.
export function encodeURL() {
  const p = new URLSearchParams();
  const allIds = ctx.A.map(a => a.id);

  if (!setsEqual(state.vis, new Set(ctx.realIds))) {
    if (state.vis.size === 0) p.set('a', 'none');
    else if (state.vis.size === allIds.length) p.set('a', 'all');
    else p.set('a', allIds.filter(id => state.vis.has(id)).join(',')); // stable universe order
  }
  if (state.hz.size !== HZ.length) p.set('h', HZ.filter(h => state.hz.has(h)).join(','));
  if (state.sort !== 'universe') {
    const h = state.sortH ?? longestActive();
    p.set('sort', state.sort + (h || '')); // pin the effective horizon so links reproduce exactly
  }
  const ov = [state.ovSp && 'sp', state.ovInf && 'inf'].filter(Boolean);
  if (ov.length) p.set('ov', ov.join(','));

  const qs = p.toString();
  return qs ? location.pathname + '?' + qs : location.pathname;
}

// Defensive: unknown ids/horizons are dropped, malformed sort ignored.
export function decodeURL(search) {
  const p = new URLSearchParams(search);
  const patch = {};
  if (p.has('a')) {
    const v = p.get('a');
    if (v === 'all') patch.vis = new Set(ctx.A.map(a => a.id));
    else if (v === 'none') patch.vis = new Set();
    else patch.vis = new Set(v.split(',').filter(id => ctx.byId[id]));
  }
  if (p.has('h')) {
    const hs = p.get('h').split(',').filter(h => HZ.includes(h));
    if (hs.length) patch.hz = new Set(hs);
  }
  if (p.has('sort')) {
    const m = /^(universe|latest|best|median|worst)(\d+)?$/.exec(p.get('sort'));
    if (m) { patch.sort = m[1]; if (m[2] && HZ.includes(m[2])) patch.sortH = m[2]; }
  }
  if (p.has('ov')) {
    const set = new Set(p.get('ov').split(','));
    patch.ovSp = set.has('sp');
    patch.ovInf = set.has('inf');
  }
  return patch;
}
