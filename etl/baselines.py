"""
baselines.py - benchmark overlays (SPEC §6, §7.3, §5 `baselines`).

Reference lines only, never tiles. Emits, under `baselines`:

  sp500.r      : S&P 500 TOTAL-RETURN rolling N-year returns, SAME rolling shape
                 as an asset's `r` (reuses compute.rolling_returns). Always sourced
                 from yfinance ^SP500TR (free, dividends reinvested, history to 1988)
                 even when DATA_SOURCE=eodhd - one symbol, not licensed universe data.
  inflation.cum: cumulative US CPI index, normalised so the first month = 1.0. The
                 frontend derives the per-horizon hurdle cum(t+N)/cum(t) on the fly;
                 that ratio is normalisation-independent (SPEC §5).

CPI is fetched FRED first (one request, works on CI), then BLS as a keyless
fallback (works where FRED is blocked). Both degrade to empty on failure so the
frontend simply hides the overlay.
"""
import io
import pandas as pd

from compute import rolling_returns, series_to_idx, decmonth
from universe import BASELINE_SYMBOLS


# ---- S&P 500 total return ---------------------------------------------------
def _sp500_total_return():
    try:
        import yfinance as yf
        sym = BASELINE_SYMBOLS["sp500"]["yfinance"]
        df = yf.download(sym, period="max", interval="1mo", auto_adjust=True,
                         progress=False, threads=False)
        if df is None or df.empty:
            return None
        s = df["Close"].dropna()
        if isinstance(s, pd.DataFrame):
            s = s.iloc[:, 0]
        s.index = pd.to_datetime(s.index)
        return s.resample("ME").last().dropna()
    except Exception as e:
        print(f"  baseline sp500 MISS: {e}")
        return None


def sp500_rolling():
    s = _sp500_total_return()
    if s is None or len(s) < 13:
        return {"r": {}}
    return {"r": rolling_returns(series_to_idx(s))}


# ---- US CPI (FRED -> BLS fallback) ------------------------------------------
def _cum_from_pairs(pairs):
    """[(year, month, value), ...] -> normalised cumulative [[decYear, idx], ...]."""
    dedup = {}
    for y, m, v in pairs:
        dedup[(y, m)] = v
    ordered = sorted(dedup.items())            # by (year, month)
    if not ordered:
        return []
    base = ordered[0][1]
    return [[decmonth(y * 12 + (m - 1)), round(v / base, 4)] for (y, m), v in ordered]


def _cpi_fred():
    """FRED CPIAUCSL CSV (keyless). Bot-blocks bare fetchers, so use a browser UA."""
    import requests
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL"
    r = requests.get(url, timeout=25, headers={"User-Agent": "Mozilla/5.0"})
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}")
    df = pd.read_csv(io.StringIO(r.text))
    dcol, vcol = df.columns[0], df.columns[1]   # positional: header has been renamed historically
    df[dcol] = pd.to_datetime(df[dcol])
    vals = pd.to_numeric(df[vcol], errors="coerce")
    return [(ts.year, ts.month, float(v)) for ts, v in zip(df[dcol], vals) if pd.notna(v)]


def _cpi_bls(start_year=1960):
    """BLS CPI-U (CUUR0000SA0), keyless, chunked into <=10-year windows."""
    import requests
    end_year = pd.Timestamp.now().year
    series = "CUUR0000SA0"
    out = []
    y0 = start_year
    while y0 <= end_year:
        y1 = min(y0 + 9, end_year)
        r = requests.post(
            "https://api.bls.gov/publicAPI/v2/timeseries/data/",
            json={"seriesid": [series], "startyear": str(y0), "endyear": str(y1)},
            headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
            timeout=45,
        )
        if r.status_code == 200:
            for s in r.json().get("Results", {}).get("series", []):
                for d in s.get("data", []):
                    per = d.get("period", "")
                    if per.startswith("M") and per != "M13":   # skip annual average
                        try:
                            out.append((int(d["year"]), int(per[1:]), float(d["value"])))
                        except (ValueError, KeyError):
                            pass
        y0 = y1 + 1
    return out


def inflation_cum():
    pairs = []
    try:
        pairs = _cpi_fred()
        print(f"  CPI via FRED: {len(pairs)} months")
    except Exception as e:
        print(f"  CPI FRED MISS: {e}")
    if not pairs:
        try:
            pairs = _cpi_bls()
            print(f"  CPI via BLS: {len(pairs)} months")
        except Exception as e:
            print(f"  CPI BLS MISS: {e}")
    return {"cum": _cum_from_pairs(pairs)}


def build_baselines():
    sp = sp500_rolling()
    inf = inflation_cum()
    print(f"  sp500 horizons={list(sp['r'].keys())} | cpi points={len(inf['cum'])}")
    return {"sp500": sp, "inflation": inf}
