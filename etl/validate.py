#!/usr/bin/env python3
"""
validate.py - anchor checks for grid_data.json (SPEC §9).

The job is NOT to verify exact returns - it is to catch order-of-magnitude
pipeline breaks: price-return instead of adjusted close, a ticker rename, a 10x
scaling bug. Each anchor is a wide band; "off by ~10x" trips it.

Tiering, designed to be robust to a transient feed/rate-limit on the weekly run:
  - present but OUTSIDE its band  -> FAIL  (a real pipeline bug)
  - absent (feed hiccup)          -> WARN  (next run retries; doesn't block)
  - present and inside band       -> PASS
Plus a hard coverage floor: < 50 real tiles -> FAIL (mass feed failure).

Exit 1 on any FAIL (aborts the CI commit), else 0.

    python etl/validate.py [path]      # default web/public/grid_data.json
"""
import json
import sys
from statistics import median

PATH = sys.argv[1] if len(sys.argv) > 1 else "web/public/grid_data.json"

results = []  # (status, label, detail)


def record(status, label, detail):
    results.append((status, label, detail))


def latest(line):
    """Last [decYear, multiple] value of a rolling line, or None."""
    return line[-1][1] if line else None


def check_band(label, value, lo, hi, unit="x"):
    if value is None:
        record("WARN", label, "unavailable (feed pending / rate-limited)")
    elif lo <= value <= hi:
        record("PASS", label, f"{value:.3g}{unit} in [{lo:g}, {hi:g}]")
    else:
        record("FAIL", label, f"{value:.3g}{unit} OUTSIDE [{lo:g}, {hi:g}]")


def main():
    try:
        with open(PATH) as f:
            D = json.load(f)
    except Exception as e:
        print(f"[FAIL] cannot read {PATH}: {e}")
        sys.exit(1)

    by = {a["id"]: a for a in D.get("assets", [])}
    real = D.get("realIds", [])
    baselines = D.get("baselines", {}) or {}

    def asset_line(aid, h):
        a = by.get(aid)
        if not a or not a.get("hasData"):
            return None
        return a.get("r", {}).get(h)

    # --- core asset anchors ------------------------------------------------
    check_band("gold 20yr multiple", latest(asset_line("xauusd", "20")), 2, 20)
    check_band("BTC 10yr multiple", latest(asset_line("btc", "10")), 50, 100000)

    comp = latest(asset_line("mnst", "20"))
    comp_label = "Monster 20yr multiple"
    if comp is None:
        comp, comp_label = latest(asset_line("aapl", "20")), "Apple 20yr multiple"
    check_band(comp_label, comp, 20, 100000)

    # --- S&P 500 long-run CAGR (SPEC: ~9-11%; wide band catches 10x breaks) -
    sp20 = (baselines.get("sp500", {}) or {}).get("r", {}).get("20")
    if sp20:
        cagrs = [(mult ** (1 / 20) - 1) for _, mult in sp20 if mult > 0]
        med = median(cagrs) if cagrs else None
        check_band("S&P500 20yr CAGR (median)", med, 0.04, 0.15, unit="")
    else:
        record("WARN", "S&P500 20yr CAGR (median)", "baseline unavailable")

    # --- CPI cumulative must rise ------------------------------------------
    cum = (baselines.get("inflation", {}) or {}).get("cum", [])
    if not cum:
        record("WARN", "CPI cumulative rises", "baseline unavailable")
    elif cum[-1][1] > cum[0][1]:
        record("PASS", "CPI cumulative rises", f"{cum[0][1]:.3g} -> {cum[-1][1]:.3g}")
    else:
        record("FAIL", "CPI cumulative rises", f"{cum[0][1]:.3g} -> {cum[-1][1]:.3g} (not rising)")

    # --- coverage floor ----------------------------------------------------
    n = len(real)
    if n >= 80:
        record("PASS", "tile coverage", f"{n} real tiles")
    elif n >= 50:
        record("WARN", "tile coverage", f"only {n} real tiles (some feeds pending)")
    else:
        record("FAIL", "tile coverage", f"only {n} real tiles (mass feed failure)")

    # --- report ------------------------------------------------------------
    width = max(len(l) for _, l, _ in results)
    print(f"\nValidating {PATH}\n" + "-" * (width + 30))
    for status, label, detail in results:
        print(f"[{status}] {label.ljust(width)}  {detail}")
    fails = sum(1 for s, _, _ in results if s == "FAIL")
    warns = sum(1 for s, _, _ in results if s == "WARN")
    print("-" * (width + 30))
    print(f"{len(results)} checks | {fails} FAIL | {warns} WARN\n")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
