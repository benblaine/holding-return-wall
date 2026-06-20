"""
base.py - the source-adapter interface (SPEC §4, §7.4).

A Source abstracts the *fetch* layer only. It returns a monthly pandas Series
(month-end indexed) or None on any failure - it NEVER raises, so a single bad
feed degrades to a labelled placeholder tile, never an error card (SPEC §2.4).

The compute layer (compute.py: build / rolling_returns / decmonth) is identical
for every source, so swapping yfinance <-> eodhd cannot change the output shape,
which is FROZEN (SPEC §5).
"""
from abc import ABC, abstractmethod


class Source(ABC):
    name = "base"

    # ---- fetch -------------------------------------------------------------
    @abstractmethod
    def monthly(self, symbol, invert=False):
        """Month-end resampled price Series, or None on any failure. Never raises."""

    @abstractmethod
    def metal_monthly(self, base):
        """Spot-metal month-end Series (kept separate so 'metals must be spot'
        is explicit per source), or None. Never raises."""

    # ---- per-class symbol resolution --------------------------------------
    @abstractmethod
    def equity_symbol(self, yf_ticker):
        """Map a base ticker (e.g. NVDA, BRK-B) to this source's symbol."""

    @abstractmethod
    def crypto_symbol(self, base):
        """Map a coin (e.g. BTC) to this source's symbol."""

    @abstractmethod
    def fx_symbol(self, code, yf_symbol, eodhd_symbol):
        """Pick the right FX symbol for this source from the universe tuple."""
