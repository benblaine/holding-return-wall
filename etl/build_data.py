#!/usr/bin/env python3
"""
build_data.py - populates the holding-return wall with REAL data (SPEC §1, §7).

Refactor of the prototype: the rolling-return MATHS (compute.py) and the FROZEN
output shape (SPEC §5) are unchanged. Only the fetch layer is abstracted behind a
source adapter, and a `baselines` block is appended.

  DATA_SOURCE = yfinance (default, zero-cost) | eodhd (licensed, needs EODHD_API_KEY)
  GRID_DATA_OUT = output path (default web/public/grid_data.json); argv[1] overrides.

Run (from repo root):
    pip install -r etl/requirements.txt
    python etl/build_data.py
Then validate:
    python etl/validate.py web/public/grid_data.json

Emits { "assets": [...], "realIds": [...], "baselines": {...} }.
"""
import json
import os
import sys

from universe import EQUITIES, CRYPTO, METALS, FX
from compute import build, placeholder
from baselines import build_baselines

_FALLBACK_METALS = os.path.join(os.path.dirname(__file__), "fallback", "metals.json")


def make_source():
    name = os.environ.get("DATA_SOURCE", "yfinance").lower()
    if name == "eodhd":
        from sources.eodhd_source import EODHDSource
        return EODHDSource()
    from sources.yfinance_source import YFinanceSource
    return YFinanceSource()


def load_fallback_metals():
    """Committed real-data snapshot (LBMA spot gold) used only when a metal's live
    fetch misses - so the marquee gold tile renders instead of a placeholder when
    stooq is bot-walled and no EODHD key is set. Real data, never fabricated."""
    try:
        with open(_FALLBACK_METALS) as f:
            return json.load(f)
    except Exception:
        return {}


def main():
    src = make_source()
    print(f"DATA_SOURCE = {src.name}\n")
    assets = []

    for tk, nm, bk in EQUITIES:
        a = build(tk, nm, "equity", bk, src.monthly(src.equity_symbol(tk)))
        print(("ok   " if a else "MISS ") + tk)
        assets.append(a or placeholder(tk, nm, "equity", bk))

    for tk, nm in CRYPTO:
        a = build(tk, nm, "crypto", "crypto", src.monthly(src.crypto_symbol(tk)))
        print(("ok   " if a else "MISS ") + tk)
        assets.append(a or placeholder(tk, nm, "crypto", "crypto"))

    fb_metals = load_fallback_metals()
    for tk, nm in METALS:
        mid = tk.lower().replace("-", "")
        live = build(tk, nm, "metal", "precious metal", src.metal_monthly(tk))
        if live:
            a, tag = live, "ok   "
        elif mid in fb_metals:
            a, tag = fb_metals[mid], "fb   "   # committed real-data fallback (gold)
        else:
            a, tag = placeholder(tk, nm, "metal", "precious metal"), "MISS "
        print(tag + tk)
        assets.append(a)

    for code, nm, yfsym, inv, eodsym in FX:
        a = build(code, nm, "currency", "currency",
                  src.monthly(src.fx_symbol(code, yfsym, eodsym), inv))
        print(("ok   " if a else "MISS ") + code)
        assets.append(a or placeholder(code, nm, "currency", "currency"))

    real = [a["id"] for a in assets if a.get("hasData")]

    print("\nbaselines...")
    baselines = build_baselines()

    out = sys.argv[1] if len(sys.argv) > 1 else os.environ.get(
        "GRID_DATA_OUT", "web/public/grid_data.json")
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w") as f:
        json.dump({"assets": assets, "realIds": real, "baselines": baselines},
                  f, separators=(",", ":"))

    print(f"\nWrote {out}  |  {len(real)}/{len(assets)} tiles populated")


if __name__ == "__main__":
    main()
