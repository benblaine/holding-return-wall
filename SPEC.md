# Holding-Return Wall — Build Spec

## 0. What this is

A static web app: a responsive grid of ~100 small charts, one per asset. Each chart shows that asset's **rolling holding returns** over time at five-to-eight hold lengths (1, 2, 3, 4, 5, 10, 15, 20 years). A line is green where that hold made money and red where it lost. Global controls pick which assets show and which hold lengths draw, and apply to every chart at once. The product answers "if I had bought asset X in month T and sold N years later, what would my money have multiplied by," for every asset and every month, side by side.

You are **productionising two existing files**, not building from scratch.

## 1. Starting artifacts (reuse, do not rebuild)

- `holding_return_wall_8yr.html` — the working frontend. Contains the canvas tile renderer, the asset/horizon controls, lazy rendering, the synced crosshair, the price overlay, and the shared/independent Y-scale logic. **This already works.**
- `build_data.py` — the ETL. Fetches prices, computes the rolling returns, and emits the JSON the frontend consumes. **This already works** (it just needs a live data feed, which the prototype sandbox lacked).

Your job: split the HTML into a real project, wire the ETL output into it via fetch, add three features (sort, benchmark overlays, EODHD source), automate the refresh, and deploy.

## 2. Hard rules (correctness, non-negotiable)

1. **Base assets only, no derivatives.** Spot metals (XAU/XAG/XPT/XPD), never the futures contracts (GC/SI/PL/PA) and never the ETFs (GLD/SLV). Individual equities, the three coins, and spot FX are fine. Index funds (SPY/QQQ) are **not** tiles; the S&P 500 appears only as an optional benchmark overlay line.
2. **Return definition:** for hold length N and buy month *t*, `return = Price(t + N years) / Price(t)`, plotted at the buy month *t*. Each line therefore ends N years before the last data month. This is already implemented in `build_data.py`; reuse it, do not reinvent.
3. **Total return.** Equities use dividend-and-split-adjusted close. Everything is denominated in USD. FX tiles are the value of one unit of the currency in USD (invert the Yahoo pair where needed).
4. **Horizon eligibility is a feature, not a bug.** An asset with fewer than N years of history simply has no N-year line. Never fabricate, pad, or extrapolate price history. If a data fetch fails for an asset, that tile renders as a labelled placeholder, never a guess and never an error card.
5. **Never frame past returns as forecasts.** The methodology page and any tooltips say so plainly.

## 3. Architecture

Decoupled batch + static, because trailing/rolling returns over years barely move day to day and the payload is tiny.

```
  build_data.py  (Python, weekly cron)
        │   pulls adjusted prices, computes rolling returns
        ▼
  grid_data.json  (< 1 MB, committed to repo by CI)
        │   static asset, fully CDN-cacheable
        ▼
  web frontend  (vanilla + canvas, no runtime API calls)
        ▼
  Cloudflare Pages / Vercel  (static hosting)
```

The browser makes **zero** data API calls. It fetches one JSON file and renders.

## 4. Tech stack (opinionated, follow it)

- **Frontend rendering: keep the vanilla `<canvas>` renderer from the prototype. Do NOT port it to React, Vue, Chart.js, D3, or any chart library.** One hundred tiles times up to eight lines is far too much DOM/SVG for a framework, and instantiating 100 Chart.js charts will jank or crash. The custom canvas renderer plus `IntersectionObserver` lazy drawing is the whole reason it is fast. This is the single most important constraint in this document. Confidence: high.
- **Build tooling:** wrap the existing HTML in **Vite (vanilla template)** for module structure, a dev server, and a production build. Split the single HTML file into `index.html` + ES modules (see repo layout). Move the inline `<style>` into a stylesheet. Plain CSS is fine; Tailwind is optional and not required.
- **ETL:** Python 3.11+, `build_data.py` as the base. Refactor the fetch functions behind a **source-adapter** interface selected by a `DATA_SOURCE` env var (`yfinance` for MVP, `eodhd` for production). `pandas` for the resampling and return maths.
- **Hosting:** Cloudflare Pages or Vercel (static).
- **Refresh:** GitHub Actions scheduled workflow, weekly.

## 5. Data contract (the ETL ↔ frontend interface) — FROZEN

`build_data.py` already emits this. Do not change the shape; both sides depend on it.

```jsonc
{
  "assets": [
    {
      "id": "nvda",                 // lowercase ticker, no punctuation
      "name": "Nvidia",
      "cls": "equity",              // equity | crypto | metal | currency
      "bucket": "generational winner",
      "role": "winner",             // optional: winner|rocket|cautionary|boombust|tortoise|fx|store
      "inc": 1999.04,               // decimal-year of first priced month
      "p":  [[1999.04, 0.38], ...], // [decYear, price] monthly, for the faint price overlay
      "r":  {                       // rolling-return lines, keyed by hold length in years
        "1":  [[2000.04, 1.84], ...],   // [decYear (buy month), multiple]
        "5":  [[2004.04, 21.3], ...],
        "10": [...], "20": [...]    // only present when history allows
      },
      "hasData": true
    },
    {
      "id": "tsla", "name": "Tesla", "cls": "equity",
      "bucket": "newer rocket", "hasData": false   // placeholder: omit inc/p/r
    }
  ],
  "realIds": ["nvda", "btc", "gold", ...],   // ids where hasData === true; the default selection

  // NEW (you add this for the benchmark-overlay feature, §7.3):
  "baselines": {
    "sp500":     { "r": { "1": [...], "5": [...], "10": [...] } },  // S&P 500 total-return, same rolling shape
    "inflation": { "cum": [[1999.04, 1.00], [2000.04, 1.034], ...] } // cumulative US CPI index
  }
}
```

`decYear = year + (month - 0.5) / 12`. Resolution is **monthly** throughout (light, mixes daily crypto with monthly macro cleanly, and is plenty for multi-year returns).

## 6. The universe (~100 base assets) — provided, editable

The full list lives in `build_data.py` (the `EQUITIES`, `CRYPTO`, `METALS`, `FX` arrays) and in `universe.csv`. Composition: **88 equities + 3 crypto (BTC, ETH, DOGE) + 4 spot metals + 6 currencies vs USD.** The equities are deliberately mixed: roughly a third generational winners, a third famous disasters / boom-busts / value traps, a third tortoises, so the wall teaches contrast rather than "everything goes up." Keep that balance if you trim.

**Benchmark overlays (NOT tiles):** S&P 500 total return, US CPI inflation, optionally 3-month T-bill. These are reference lines and badges only. Source the S&P 500 total-return series and a CPI series in the ETL and emit them under `baselines` (§5).

## 7. Work items

### 7.1 Wire ETL output into the frontend
Replace the embedded `const DATA = {...}` in the HTML with `await fetch('/grid_data.json')`. Show a loading skeleton until it resolves. Tiles already draw lazily via `IntersectionObserver`; keep that so only on-screen tiles render.

### 7.2 Sort-tiles control
Add a "Sort by" dropdown. Options: `Universe order` (default) · `Latest N-yr return` · `Best-ever N-yr return` · `Median N-yr return` · `Worst N-yr return`. It operates on the **currently active hold length** (if several are toggled on, use the longest, or expose a small "sort horizon" selector). Re-order the grid DOM accordingly. Placeholders (`hasData:false`) always sort to the end. This is what turns the explorer into "which asset is actually best," which was the original ask.

### 7.3 Benchmark overlays
Two toggles: `vs S&P 500` and `vs inflation`. When on, draw a thin neutral reference line on every tile — the S&P 500's own rolling N-year return curve, or the cumulative-inflation hurdle — using the `baselines` data. Add small per-tile badges driven by the active horizon: `beat S&P (5y) ✓/✗` and `beat inflation ✓/✗`. These are the highest-value teaching feature for a novice; build them well.

### 7.4 EODHD source adapter
Mirror the yfinance fetch functions with EODHD equivalents (EOD All-World endpoint, adjusted close, one key covers equities/FX/crypto/metals). Select via `DATA_SOURCE=eodhd|yfinance`. Document the env vars (`DATA_SOURCE`, `EODHD_API_KEY`) in the README. yfinance stays the zero-cost default for local/dev; EODHD is the licensed path for the deployed site.

### 7.5 Refresh automation
GitHub Actions workflow, `schedule: cron` weekly. Steps: checkout, `pip install -r etl/requirements.txt`, run `build_data.py`, commit `web/public/grid_data.json` only if it changed, push (which triggers the host's redeploy). Put `EODHD_API_KEY` in repo secrets.

### 7.6 Polish
- **Mobile:** cards collapse to one column; the control bar collapses into a drawer/sheet. Keep the sticky control bar on desktop.
- **URL state (build this):** encode the current selection and horizons in the query string, e.g. `?a=btc,gold,nvda,tsla&h=2,4&sort=best5`. This makes any view shareable and directly serves the canonical workflow ("show me gold, BTC, Tesla, Nvidia at 2-yr and 4-yr"). Do **not** use localStorage.
- **Methodology / About page:** explain rolling return, total return via adjusted close, base-assets-only, the survivorship caveat, and "past returns, not forecasts." This is the credibility surface; keep it short and honest.
- **States:** loading skeleton, empty-selection message, placeholder tiles for feed-pending assets.

## 8. Repo layout

```
holding-return-wall/
├─ etl/
│  ├─ build_data.py            # base ETL (provided)
│  ├─ universe.py              # the asset arrays (extract from build_data.py)
│  ├─ sources/
│  │  ├─ yfinance_source.py
│  │  └─ eodhd_source.py
│  └─ requirements.txt
├─ web/
│  ├─ index.html
│  ├─ src/
│  │  ├─ data.js               # fetch + parse grid_data.json
│  │  ├─ render.js             # the canvas tile renderer (lifted from prototype, unchanged in spirit)
│  │  ├─ controls.js           # chips, search, horizon toggles, sort, overlays
│  │  ├─ state.js              # app state + URL <-> state sync
│  │  └─ style.css
│  └─ public/
│     └─ grid_data.json        # generated; committed by CI
├─ .github/workflows/refresh.yml
├─ README.md
└─ SPEC.md
```

## 9. Acceptance criteria

- **Numbers reconcile with known anchors.** S&P 500 long-run nominal CAGR lands ~9–11%. Gold's 20-year multiple is strong (high single to low double digit CAGR). Bitcoin's 10-year return is enormous. A famous compounder (Monster, Apple) shows an absurd 20-year multiple. If any anchor is off by ~10x, the pipeline is wrong (usually price-return instead of adjusted, or a ticker rename). Add a small `etl/validate.py` that asserts these.
- All ~100 tiles render; feed-pending tiles show a labelled placeholder, never an error.
- 100 tiles with up to 8 lines each scroll smoothly (only on-screen tiles draw).
- Toggling a hold length updates every visible tile instantly.
- The synced crosshair reads every visible tile at the same date.
- Sort reorders correctly; placeholders last.
- A shared URL reproduces the exact selection, horizons, and sort.
- Mobile is usable.
- The weekly Action produces a fresh `grid_data.json`.

## 10. Known gotchas (pre-empt these)

- **Ticker renames / formats:** META (ex-FB), GOOGL share classes, `BRK-B` (hyphen) for Berkshire. Already excluded from the universe to avoid corrupt history: **GE** (2024 three-way split), **Block** (ticker changed SQ→XYZ in 2025), **Nikola** (reverse split / near-delisting). Do not re-add them without handling the splits.
- **yfinance quirks:** monthly bars with `auto_adjust=True`; a single-ticker download can return a MultiIndex column — the provided code already guards for this.
- **FX inversion:** EUR/GBP use `EURUSD=X`/`GBPUSD=X` directly; JPY/CHF/ZAR/TRY use `1 / <CUR>=X`. The `FX` map in `build_data.py` carries the invert flag.
- **Metals must be spot.** stooq `xauusd`/`xagusd`/`xptusd`/`xpdusd` monthly, or EODHD spot. Never `GC=F`. stooq spot can be flaky; if a metal misses, leave it a placeholder.
- **Mixed trading calendars:** crypto trades 7 days, equities don't. Monthly resampling (`resample("ME").last()`) handles this; do not try to align daily bars.
- **Canvas sharpness:** scale the canvas by `devicePixelRatio` (the renderer already does).
- **Per-tile vs shared Y:** magnitudes differ by orders of magnitude (Bitcoin's curves reach thousands of x, gold barely clears 3x). Independent per-tile log Y is the correct default; the shared-scale toggle exists for deliberate comparison. Both are already implemented.

## 11. Out of scope for v1 (note as backlog)

- A "typical vs best-case" averaged-return mode beyond the rolling curves.
- A standalone max-drawdown / risk column (sort by worst return covers the basics).
- A delisted "graveyard" of cautionary busts (Enron, Lehman, Luna, FTX, Wirecard).
- A "$1,000 grows to $X" dollar-framing overlay.
- User accounts / saved views (URL state covers sharing for now).

---

### One-paragraph brief to paste with this spec

> Build the project described in SPEC.md. Start from the two provided files (`holding_return_wall_8yr.html`, `build_data.py`); reuse the canvas renderer and the ETL exactly as they are. Do not rewrite the renderer in a framework or chart library. Wire the ETL's `grid_data.json` into the frontend via fetch, split the HTML into a Vite vanilla project per the repo layout, then implement the three features (sort-tiles, benchmark overlays, EODHD source adapter), URL state, the methodology page, mobile layout, and the weekly GitHub Action. Honour the hard rules in §2 (base assets only, spot metals, total return, no fabricated history) and hit the acceptance criteria in §9, including the anchor-value validation.
