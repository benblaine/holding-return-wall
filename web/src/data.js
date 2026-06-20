// data.js - fetch + parse grid_data.json into the shared ctx (SPEC §7.1).
// The browser makes exactly one data request: this file. No runtime API calls.
import { ctx } from './state.js';

export async function loadData() {
  const res = await fetch(import.meta.env.BASE_URL + 'grid_data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('grid_data.json ' + res.status);
  const D = await res.json();
  ctx.A = D.assets || [];
  ctx.byId = Object.fromEntries(ctx.A.map(a => [a.id, a]));
  ctx.realIds = D.realIds || [];
  ctx.baselines = D.baselines || null;
  ctx.XMAX = deriveXMAX(ctx.A);
  return D;
}

// Right edge of the x-axis = latest priced month across all assets.
// (Replaces the prototype's hardcoded XMAX so the weekly refresh extends the axis.)
function deriveXMAX(assets) {
  let mx = -Infinity;
  for (const a of assets) {
    if (a.hasData && a.p) for (const pt of a.p) if (pt[0] > mx) mx = pt[0];
  }
  return Number.isFinite(mx) ? mx : 2026.42;
}
