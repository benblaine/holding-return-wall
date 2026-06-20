// render.js - the vanilla-canvas tile renderer, lifted from the prototype and
// preserved exactly in spirit (SPEC §4: NO framework / chart library). The only
// addition to draw() is one drawBaselines() call for the §7.3 overlays.
import { state, ctx, HZ, GREEN, RED, activeSortH } from './state.js';

export function xdom() {
  let x0 = ctx.XMAX;
  state.vis.forEach(id => { const a = ctx.byId[id]; if (a && a.hasData) x0 = Math.min(x0, a.inc); });
  if (x0 >= ctx.XMAX) x0 = 2010;
  return [x0, ctx.XMAX];
}

export function invX(xr) { const [x0, x1] = xdom(); return x0 + xr * (x1 - x0); }

export function sharedYdom() {
  let lo = 0, hi = 0;
  state.vis.forEach(id => {
    const a = ctx.byId[id]; if (!a || !a.hasData) return;
    state.hz.forEach(h => { const ln = a.r[h]; if (!ln) return; ln.forEach(p => { const L = Math.log10(p[1]); if (L < lo) lo = L; if (L > hi) hi = L; }); });
  });
  return [Math.floor(lo) - 0.05, Math.ceil(hi) + 0.05];
}

// ---- inflation hurdle + baseline sampling (SPEC §7.3) -----------------------
// cum(t) = cumulative CPI index at decimal year t (linear interpolation).
function cumLookup(t) {
  const cum = ctx.baselines?.inflation?.cum;
  if (!cum || !cum.length) return null;
  if (t <= cum[0][0]) return cum[0][1];
  if (t >= cum[cum.length - 1][0]) return cum[cum.length - 1][1];
  let lo = 0, hi = cum.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (cum[mid][0] <= t) lo = mid; else hi = mid; }
  const [x0, y0] = cum[lo], [x1, y1] = cum[hi];
  return y0 + (y1 - y0) * (t - x0) / (x1 - x0);
}

// the inflation "hurdle": the multiple needed to just keep pace with CPI over N yr from buy month t
export function inflHurdle(t, N) {
  const a = cumLookup(t), b = cumLookup(t + N);
  if (a == null || b == null || a <= 0) return null;
  return b / a;
}

// value of a rolling line at decimal year t (nearest point within half a year)
export function sampleAt(line, t) {
  if (!line || !line.length) return null;
  let best = null, bd = 1e9;
  for (const p of line) { const d = Math.abs(p[0] - t); if (d < bd) { bd = d; best = p; } }
  return best && bd < 0.5 ? best[1] : null;
}

// Thin NEUTRAL reference lines, mapped through the tile's existing yr() so they
// share the return axis. We deliberately do NOT widen rlo/rhi to fit them - they
// clamp to the edge exactly like the rolling lines (preserves renderer scale).
function drawBaselines(g, a, px, yr, x0) {
  const H = activeSortH();
  if (!H) return;
  const bl = ctx.baselines;
  if (state.ovSp && bl?.sp500?.r?.[H]) {
    g.save(); g.strokeStyle = 'rgba(184,194,214,.6)'; g.lineWidth = 1; g.setLineDash([5, 3]);
    g.beginPath(); let st = false;
    for (const p of bl.sp500.r[H]) { if (p[0] < x0) continue; const X = px(p[0]), Y = yr(p[1]); st ? g.lineTo(X, Y) : (g.moveTo(X, Y), st = true); }
    g.stroke(); g.restore();
  }
  if (state.ovInf && bl?.inflation?.cum?.length && a.r[H]) {
    g.save(); g.strokeStyle = 'rgba(205,178,122,.55)'; g.lineWidth = 1; g.setLineDash([2, 3]);
    g.beginPath(); const N = Number(H); let st = false;
    for (const pt of a.r[H]) { const t = pt[0]; if (t < x0) continue; const hur = inflHurdle(t, N); if (hur == null) continue; const X = px(t), Y = yr(hur); st ? g.lineTo(X, Y) : (g.moveTo(X, Y), st = true); }
    g.stroke(); g.restore();
  }
}

export function draw(id) {
  const a = ctx.byId[id], C = ctx.cards[id]; if (!a || !a.hasData || !C.cv) return;
  const cv = C.cv; const cssW = C.card.clientWidth - 20, cssH = 176;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = cssW * dpr; cv.height = cssH * dpr; cv.style.height = cssH + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cssW, cssH);
  const padL = 38, padR = state.price ? 32 : 12, padT = 8, padB = 18, W = cssW, H = cssH;
  const [x0, x1] = xdom(); const px = x => padL + (x - x0) / (x1 - x0) * (W - padL - padR);
  let rlo, rhi;
  if (state.shared) { [rlo, rhi] = sharedYdom(); }
  else {
    rlo = 0; rhi = 0; state.hz.forEach(h => { const ln = a.r[h]; if (!ln) return; ln.forEach(p => { const L = Math.log10(p[1]); if (L < rlo) rlo = L; if (L > rhi) rhi = L; }); });
    rlo = Math.floor(rlo) - 0.05; rhi = Math.ceil(rhi) + 0.05; if (rhi - rlo < 1) rhi = rlo + 1;
  }
  const yr = m => { let L = Math.log10(m); L = Math.max(rlo, Math.min(rhi, L)); return padT + (1 - (L - rlo) / (rhi - rlo)) * (H - padT - padB); };
  let plo = 1e9, phi = -1e9; a.p.forEach(p => { const L = Math.log10(p[1]); if (L < plo) plo = L; if (L > phi) phi = L; });
  const yp = v => { let L = Math.log10(v); L = Math.max(plo, Math.min(phi, L)); return padT + (1 - (L - plo) / (phi - plo)) * (H - padT - padB); };
  // grid x
  g.font = "9px 'IBM Plex Mono'"; g.fillStyle = '#54627e';
  const span = x1 - x0, step = span > 18 ? 4 : (span > 9 ? 3 : 2);
  for (let yy = Math.ceil(x0 / step) * step; yy <= x1; yy += step) {
    const X = px(yy);
    g.beginPath(); g.moveTo(X, padT); g.lineTo(X, H - padB); g.strokeStyle = 'rgba(27,39,66,.4)'; g.lineWidth = 1; g.stroke();
    g.fillText("'" + String(yy).slice(2), X - 7, H - 6);
  }
  for (let e = Math.ceil(rlo); e <= Math.floor(rhi); e++) {
    const Y = yr(Math.pow(10, e));
    g.beginPath(); g.moveTo(padL, Y); g.lineTo(W - padR, Y); g.strokeStyle = e === 0 ? 'rgba(159,171,196,.2)' : 'rgba(27,39,66,.45)'; g.stroke();
    const lab = e < 0 ? (Math.pow(10, e) + '').replace('0.', '.') + '×' : Math.pow(10, e) + '×';
    g.fillStyle = '#5f6e8c'; g.textAlign = 'right'; g.fillText(lab, padL - 4, Y + 3); g.textAlign = 'left';
  }
  g.setLineDash([4, 4]); g.strokeStyle = 'rgba(159,171,196,.6)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(padL, yr(1)); g.lineTo(W - padR, yr(1)); g.stroke(); g.setLineDash([]);
  if (state.price) {
    g.strokeStyle = 'rgba(247,147,26,.5)'; g.lineWidth = 1.2; g.beginPath(); let st = false;
    a.p.forEach(p => { if (p[0] < x0) return; const X = px(p[0]), Y = yp(p[1]); st ? g.lineTo(X, Y) : (g.moveTo(X, Y), st = true); }); g.stroke();
  }
  g.lineWidth = 1.7;
  HZ.filter(h => state.hz.has(h)).forEach(h => {
    const ln = a.r[h]; if (!ln) return;
    for (let i = 1; i < ln.length; i++) {
      const p0 = ln[i - 1], p1 = ln[i]; if (p1[0] < x0) continue;
      g.strokeStyle = (p0[1] < 1 || p1[1] < 1) ? RED[h] : GREEN[h];
      g.beginPath(); g.moveTo(px(p0[0]), yr(p0[1])); g.lineTo(px(p1[0]), yr(p1[1])); g.stroke();
    }
  });
  drawBaselines(g, a, px, yr, x0);   // §7.3 overlays (no-op unless toggled)
  if (state.hoverYear != null && state.hoverYear >= x0 && state.hoverYear <= x1) {
    const X = px(state.hoverYear);
    g.strokeStyle = 'rgba(232,236,246,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X, padT); g.lineTo(X, H - padB); g.stroke();
    const rows = []; HZ.filter(h => state.hz.has(h)).forEach(h => {
      const ln = a.r[h]; if (!ln) return;
      let best = null, bd = 1e9; ln.forEach(p => { const d = Math.abs(p[0] - state.hoverYear); if (d < bd) { bd = d; best = p; } });
      if (best && bd < 0.5) rows.push([h, best[1], best[1] < 1 ? RED[h] : GREEN[h]]);
    });
    if (rows.length) {
      const bw = 72, bh = 11 * rows.length + 8; let bx = X + 6; if (bx + bw > W - 2) bx = X - bw - 6;
      g.fillStyle = 'rgba(8,12,22,.93)'; g.strokeStyle = '#2a3a5e'; g.lineWidth = 1; g.beginPath(); g.rect(bx, padT + 2, bw, bh); g.fill(); g.stroke();
      g.textAlign = 'left'; g.font = "9px 'IBM Plex Mono'";
      rows.forEach((r, i) => {
        g.fillStyle = r[2]; const v = r[1] >= 10 ? Math.round(r[1]) + '×' : r[1].toFixed(r[1] < 1 ? 2 : 1) + '×';
        g.fillText(r[0] + 'y  ' + v, bx + 5, padT + 13 + i * 11);
      });
    }
  }
}
