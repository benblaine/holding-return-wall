"""
universe.py - the ~100 base assets and the hold-length horizons.

Composition (SPEC §6): 88 equities + 3 crypto + 4 spot metals + 6 currencies = 101.
The equities are deliberately mixed (winners / disasters / tortoises) so the wall
teaches contrast, not "everything goes up." Keep that balance if you trim.

HARD RULE (SPEC §2): base assets only. Spot metals (XAU/XAG/XPT/XPD), never the
futures (GC/SI/PL/PA) and never the ETFs (GLD/SLV). Index funds (SPY/QQQ) are NOT
tiles; the S&P 500 appears only as the optional benchmark overlay (see baselines.py).

Excluded on purpose (SPEC §10) - do not re-add without handling the corporate action:
  GE (2024 three-way split), Block (SQ -> XYZ in 2025), Nikola (reverse split).
"""

HZ = [1, 2, 3, 4, 5, 10, 15, 20]

# (ticker, display name, bucket)
EQUITIES = [
 ("NVDA","Nvidia","generational winner"),("AAPL","Apple","generational winner"),
 ("MSFT","Microsoft","generational winner"),("AMZN","Amazon","generational winner"),
 ("GOOGL","Alphabet","generational winner"),("META","Meta","generational winner"),
 ("AVGO","Broadcom","generational winner"),("NFLX","Netflix","generational winner"),
 ("AMD","AMD","generational winner"),("ORCL","Oracle","generational winner"),
 ("TSM","TSMC","generational winner"),("ASML","ASML","generational winner"),
 ("LLY","Eli Lilly","generational winner"),("COST","Costco","generational winner"),
 ("MNST","Monster","generational winner"),("DPZ","Domino's","generational winner"),
 ("CMG","Chipotle","generational winner"),("ANET","Arista","generational winner"),
 ("MELI","MercadoLibre","generational winner"),("RACE","Ferrari","generational winner"),
 ("V","Visa","generational winner"),("MA","Mastercard","generational winner"),
 ("BRK-B","Berkshire","generational winner"),("NVO","Novo Nordisk","generational winner"),
 ("PLTR","Palantir","newer rocket"),("TSLA","Tesla","newer rocket"),
 ("CRWD","CrowdStrike","newer rocket"),("NOW","ServiceNow","newer rocket"),
 ("SNOW","Snowflake","newer rocket"),("NET","Cloudflare","newer rocket"),
 ("DDOG","Datadog","newer rocket"),("PANW","Palo Alto","newer rocket"),
 ("APP","AppLovin","newer rocket"),("SMCI","Super Micro","newer rocket"),
 ("SHOP","Shopify","newer rocket"),("SE","Sea","newer rocket"),
 ("HOOD","Robinhood","newer rocket"),("ABNB","Airbnb","newer rocket"),
 ("UBER","Uber","newer rocket"),("COIN","Coinbase","newer rocket"),
 ("NU","Nu Holdings","newer rocket"),("ELF","e.l.f.","newer rocket"),
 ("INTC","Intel","fallen tech"),("CSCO","Cisco","fallen tech"),("IBM","IBM","fallen tech"),
 ("PYPL","PayPal","fallen tech"),("SNAP","Snap","fallen tech"),("ZM","Zoom","fallen tech"),
 ("ROKU","Roku","fallen tech"),("BABA","Alibaba","fallen tech"),
 ("PTON","Peloton","boom-bust"),("BYND","Beyond Meat","boom-bust"),("GME","GameStop","boom-bust"),
 ("AMC","AMC","boom-bust"),("MRNA","Moderna","boom-bust"),("CVNA","Carvana","boom-bust"),
 ("RIVN","Rivian","boom-bust"),("LCID","Lucid","boom-bust"),
 ("KO","Coca-Cola","staple tortoise"),("PEP","PepsiCo","staple tortoise"),("PG","P&G","staple tortoise"),
 ("WMT","Walmart","staple tortoise"),("MCD","McDonald's","staple tortoise"),("SBUX","Starbucks","staple tortoise"),
 ("HD","Home Depot","staple tortoise"),("PM","Philip Morris","staple tortoise"),("MO","Altria","staple tortoise"),
 ("LULU","Lululemon","staple tortoise"),
 ("NKE","Nike","value trap"),("DIS","Disney","value trap"),("KHC","Kraft Heinz","value trap"),("BUD","AB InBev","value trap"),
 ("UNH","UnitedHealth","healthcare"),("JNJ","J&J","healthcare"),("PFE","Pfizer","healthcare"),("ISRG","Intuitive Surg.","healthcare"),
 ("JPM","JPMorgan","financials"),("GS","Goldman","financials"),("BAC","Bank of America","financials"),
 ("AXP","Amex","financials"),("WFC","Wells Fargo","financials"),
 ("BA","Boeing","industrial/energy"),("CAT","Caterpillar","industrial/energy"),("LMT","Lockheed","industrial/energy"),
 ("F","Ford","industrial/energy"),("XOM","Exxon","industrial/energy"),("OXY","Occidental","industrial/energy"),
 ("ENPH","Enphase","industrial/energy"),
]

# (ticker, display name)
CRYPTO = [("BTC","Bitcoin"),("ETH","Ethereum"),("DOGE","Dogecoin")]

# (spot ticker, display name) - SPOT metals only, never futures, never ETFs
METALS = [("XAUUSD","Gold (spot)"),("XAGUSD","Silver (spot)"),
          ("XPTUSD","Platinum (spot)"),("XPDUSD","Palladium (spot)")]

# (code, display name, yfinance symbol, invert?, eodhd symbol)
#   value of 1 unit of the currency in USD; EUR/GBP are direct, the rest invert a
#   USD-quoted pair. The yfinance and EODHD symbols carry the SAME invert flag
#   because both quote JPY/CHF/ZAR/TRY as USD-per-unit (USDxxx).
FX = [("EUR","Euro",        "EURUSD=X", False, "EURUSD.FOREX"),
      ("GBP","Pound",       "GBPUSD=X", False, "GBPUSD.FOREX"),
      ("JPY","Japanese yen","JPY=X",    True,  "USDJPY.FOREX"),
      ("CHF","Swiss franc", "CHF=X",    True,  "USDCHF.FOREX"),
      ("ZAR","S.A. rand",   "ZAR=X",    True,  "USDZAR.FOREX"),
      ("TRY","Turkish lira","TRY=X",    True,  "USDTRY.FOREX")]

# Benchmark overlays (SPEC §6/§7.3) - reference lines, NOT tiles.
# The S&P 500 TOTAL-RETURN index is always pulled from yfinance (^SP500TR: free,
# dividends reinvested, history to 1988, not licensed universe data) even when
# DATA_SOURCE=eodhd. CPI comes from FRED (keyless). See baselines.py.
BASELINE_SYMBOLS = {"sp500": {"yfinance": "^SP500TR", "eodhd": "^SP500TR"}}
