"""
eodhd_source.py - the licensed production adapter (SPEC §7.4).

One EODHD key (EODHD_API_KEY) covers equities/FX/crypto/metals via the EOD
end-of-day endpoint with adjusted close:

    https://eodhd.com/api/eod/{SYMBOL}?api_token={KEY}&fmt=json&period=m

Verified (June 2026): period=m returns one row per month, each record has
`adjusted_close`, and rows are stamped on the month's FIRST trading day - so the
defensive resample("ME").last() is REQUIRED to align with the yfinance/^SP500TR
month-end grid (omitting it offsets the S&P overlay by ~1 month).

Symbol conventions (differ from yfinance - hence the per-source resolvers):
    equity  NVDA.US , BRK-B.US        crypto  BTC-USD.CC
    fx      EURUSD.FOREX / USDJPY...   metal   XAUUSD.FOREX  (= "Gold Spot")

Docs: https://eodhd.com/financial-apis/api-for-historical-data-and-volumes
Never raises - returns None on any failure -> placeholder tile (SPEC §2.4).
"""
import os
import pandas as pd

from .base import Source

_EOD = "https://eodhd.com/api/eod/{sym}?api_token={key}&fmt=json&period=m"


class EODHDSource(Source):
    name = "eodhd"

    def __init__(self):
        self.key = os.environ.get("EODHD_API_KEY")
        if not self.key:
            raise RuntimeError(
                "DATA_SOURCE=eodhd but EODHD_API_KEY is not set. "
                "Add it to your environment / repo secrets, or use DATA_SOURCE=yfinance."
            )

    def _fetch(self, sym, invert=False, field="adjusted_close"):
        try:
            import requests
            r = requests.get(_EOD.format(sym=sym, key=self.key), timeout=30)
            if r.status_code != 200:
                print(f"  eodhd MISS {sym}: HTTP {r.status_code}")
                return None
            rows = r.json()
            if not rows:
                return None
            df = pd.DataFrame(rows)
            if field not in df or "date" not in df:
                return None
            df["date"] = pd.to_datetime(df["date"])
            s = df.set_index("date")[field].astype(float).dropna()
            if s.empty:
                return None
            if invert:
                s = 1.0 / s
            return s.resample("ME").last().dropna()   # 1st-of-month -> month-end (align)
        except Exception as e:
            print(f"  eodhd MISS {sym}: {e}")
            return None

    def monthly(self, symbol, invert=False):
        return self._fetch(symbol, invert)

    def metal_monthly(self, base):
        return self._fetch(f"{base}.FOREX")           # XAUUSD.FOREX = spot gold

    # ---- symbol resolution -------------------------------------------------
    def equity_symbol(self, yf_ticker):
        return f"{yf_ticker}.US"                       # NVDA.US, BRK-B.US

    def crypto_symbol(self, base):
        return f"{base}-USD.CC"                         # BTC-USD.CC

    def fx_symbol(self, code, yf_symbol, eodhd_symbol):
        return eodhd_symbol                            # EURUSD.FOREX / USDJPY.FOREX
