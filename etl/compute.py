"""
compute.py - the rolling-return maths (SPEC §2.2), shared verbatim by every asset
AND by the S&P 500 baseline so the two can never diverge.

Lifted UNCHANGED from the prototype build_data.py: decmonth, the month-index dict,
the per-horizon return loop, and the asset record shape (FROZEN, SPEC §5).

    return at buy month t, hold N years = Price(t + N yr) / Price(t)
    plotted at t; each line therefore ends N years before the last data month.
    Never fabricate, pad, or extrapolate - missing history simply means no line.
"""
from universe import HZ


def decmonth(p):
    """Month-integer (year*12 + month-1) -> decimal year at mid-month."""
    y = p // 12
    m = p % 12
    return round(y + (m + 0.5) / 12, 4)


def series_to_idx(s):
    """pandas month-end Series -> {month_integer: float price}."""
    return {(ts.year * 12 + (ts.month - 1)): float(v) for ts, v in s.items()}


def rolling_returns(idx):
    """{month_int: price} -> {"N": [[decYear, multiple], ...]} for each horizon
    with enough history. Identical to the prototype's inner loop."""
    months = sorted(idx)
    r = {}
    for N in HZ:
        step = 12 * N
        line = [[decmonth(p), round(idx[p + step] / idx[p], 4)] for p in months
                if (p + step) in idx and idx[p] > 0]
        if line:
            r[str(N)] = line
    return r


def build(aid, name, cls, bucket, s):
    """A fetched Series -> the frozen asset record, or None if too little history."""
    if s is None or len(s) < 13:
        return None
    idx = series_to_idx(s)
    months = sorted(idx)
    price = [[decmonth(p), round(idx[p], 6 if idx[p] < 1 else 2)] for p in months]
    return {"id": aid.lower().replace("-", ""), "name": name, "cls": cls, "bucket": bucket,
            "inc": decmonth(months[0]), "p": price, "r": rolling_returns(idx), "hasData": True}


def placeholder(aid, name, cls, bucket):
    """Feed-pending / failed fetch -> labelled placeholder tile (SPEC §2.4)."""
    return {"id": aid.lower().replace("-", ""), "name": name, "cls": cls,
            "bucket": bucket, "hasData": False}
