"""
yfinance_source.py - the zero-cost dev/default adapter (SPEC §4, §7.4).

Lifts the prototype's monthly_yf / monthly_stooq fetch functions UNCHANGED in
spirit:
  - equities/crypto/FX  -> yfinance adjusted close (auto_adjust=True == dividends
    + splits reinvested, i.e. total-return proxy; FX = value of 1 unit in USD).
  - spot metals         -> stooq xauusd/xagusd/... monthly (SPOT, never GC=F/GLD).

The MultiIndex guard (a single-ticker yfinance download can return a DataFrame
column) is preserved verbatim - SPEC §10 calls it out explicitly.
"""
import io
import pandas as pd

from .base import Source


class YFinanceSource(Source):
    name = "yfinance"

    def monthly(self, symbol, invert=False):
        try:
            import yfinance as yf
            df = yf.download(symbol, period="max", interval="1mo", auto_adjust=True,
                             progress=False, threads=False)
            if df is None or df.empty:
                return None
            s = df["Close"].dropna()
            if isinstance(s, pd.DataFrame):      # SPEC §10: single-ticker MultiIndex guard
                s = s.iloc[:, 0]
            if invert:
                s = 1.0 / s
            s.index = pd.to_datetime(s.index)
            return s.resample("ME").last().dropna()
        except Exception as e:
            print(f"  yf MISS {symbol}: {e}")
            return None

    def metal_monthly(self, base):
        try:
            import requests
            url = f"https://stooq.com/q/d/l/?s={base.lower()}&i=m"
            txt = requests.get(url, timeout=30).text
            df = pd.read_csv(io.StringIO(txt))
            if "Close" not in df:                # stooq spot can be flaky -> placeholder
                return None
            df["Date"] = pd.to_datetime(df["Date"])
            s = df.set_index("Date")["Close"].astype(float)
            return s.resample("ME").last().dropna()
        except Exception as e:
            print(f"  stooq MISS {base}: {e}")
            return None

    # ---- symbol resolution -------------------------------------------------
    def equity_symbol(self, yf_ticker):
        return yf_ticker                          # NVDA, BRK-B (hyphen kept)

    def crypto_symbol(self, base):
        return f"{base}-USD"                       # BTC-USD

    def fx_symbol(self, code, yf_symbol, eodhd_symbol):
        return yf_symbol                           # EURUSD=X / JPY=X ...
