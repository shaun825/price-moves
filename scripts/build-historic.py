"""Builds public/data/historic-prices.json: actual published average prices before 2017, each with its source.

Only real, published averages for the same product and pack size as our item are included. No estimates.
Annual averages are dated 1 July of that year and labelled as annual averages.
"""
import json

SOURCES = [
    ("Stats SA via NAMC", "Statistics South Africa urban average retail prices, as published in the National Agricultural Marketing Council (NAMC) Food Price Monitor, Table 2 (2009-2016)"),
    ("Stats SA", "Statistics South Africa, Retail prices 1996 (P0141.3), average annual retail prices 1995 and 1996"),
    ("AC Nielsen via NAMC", "AC Nielsen national average retail prices, as published in NAMC Food Pricing Monitoring Committee report, Part 3, Table 3.1 (Jan 2000 and Oct 2003)"),
    ("Stats SA yearbook", "Statistics South Africa, South African Statistics 2010, table 7.3.1 'Consumer prices: historical table, 1910-2008', retail prices of selected food items (annual, principal urban areas)"),
]
S = {s[0]: i for i, s in enumerate(SOURCES)}
series = {}
def add(iid, date, v, src, label):
    series.setdefault(iid, []).append([date, round(v, 4), S[src], label])

# 1) NAMC Food Price Monitor tables (Stats SA urban averages), parsed from each issue's current month,
#    with these hand-checked corrections from the original tables:
namc = json.load(open("research/namc_parsed.json"))
FIX = {("GRO-060", "2013-07"): 10.70, ("GRO-111", "2013-01"): 23.98,
       ("GRO-060", "2014-10"): 12.59, ("GRO-002", "2014-10"): 9.84, ("GRO-001", "2014-10"): 10.61, ("GRO-015", "2014-10"): 22.58, ("GRO-111", "2014-10"): 26.20,
       ("GRO-060", "2015-01"): 12.59, ("GRO-002", "2015-01"): 10.29, ("GRO-001", "2015-01"): 11.42, ("GRO-015", "2015-01"): 23.45, ("GRO-111", "2015-01"): 26.31}
DROP = {("GRO-015", "2014-07")}  # rice shown with the same urban price as sugar (R27.03) in the source table; likely a typo
MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
for iid, months in namc.items():
    for ym, vals in sorted(months.items()):
        if (iid, ym) in DROP: continue
        v = FIX.get((iid, ym), vals[0][0])
        y, m = ym.split("-")
        add(iid, f"{ym}-15", v, "Stats SA via NAMC", f"{MONTHS[int(m)-1]} {y}, Stats SA urban average (NAMC Food Price Monitor)")

# 2) Stats SA Retail prices 1996 (P0141.3): annual averages, same unit as our item
P1996 = {"GRO-111": (7.03, 7.56), "GRO-015": (5.73, 6.29), "GRO-057": (2.18, 2.39), "GRO-058": (4.83, 5.21),
         "GRO-065": (7.96, 8.86), "GRO-018": (6.96, 7.77), "GRO-039": (28.29, 28.27), "GRO-037": (16.10, 16.15),
         "GRO-044": (18.25, 17.70), "GRO-046": (15.69, 15.86), "GRO-090": (14.30, 13.35), "GRO-093": (3.80, 4.62),
         "PER-003": (4.02, 4.38), "HHC-005": (2.53, 2.67)}
for iid, (a, b) in P1996.items():
    add(iid, "1995-07-01", a, "Stats SA", "1995 annual average, Stats SA Retail prices (P0141.3)")
    add(iid, "1996-07-01", b, "Stats SA", "1996 annual average, Stats SA Retail prices (P0141.3)")

# 2b) Stats SA yearbook historical table (cents, annual): milk per litre and butter 500 g from 1910,
#     white sugar 2.5 kg from 1976 (Stats SA footnote: factory-packed sugar as from 1976). Bread is excluded:
#     the table's loaf is 900 g before July 1985 and 800 g after, not our 700 g loaf.
tab = json.load(open("research/sastats_hist_table.json"))
for iid, col, first in (("GRO-057", "milk", 1910), ("GRO-065", "butter", 1910), ("GRO-111", "sugar", 1976)):
    for y, c in sorted(tab[col].items()):
        if c is None or int(y) < first: continue
        if iid in P1996 and y in ("1995", "1996"): continue  # same figures already added from P0141.3
        add(iid, f"{y}-07-01", c / 100, "Stats SA yearbook", f"{y} annual average, Stats SA (South African Statistics, historical table)")

# 3) AC Nielsen averages, Jan 2000 and Oct 2003 (generic items only; brand-specific and 'cheapest' lines excluded)
ACN = {"GRO-001": (3.12, 3.95), "GRO-002": (2.56, 3.56), "GRO-060": (3.32, 5.88), "GRO-065": (10.71, 15.63),
       "GRO-068": (27.25, 37.29), "GRO-038": (16.84, 22.36), "GRO-090": (13.55, 28.30), "GRO-093": (4.75, 6.66),
       "GRO-095": (2.66, 3.81)}
for iid, (a, b) in ACN.items():
    add(iid, "2000-01-15", a, "AC Nielsen via NAMC", "Jan 2000, AC Nielsen national average (NAMC)")
    add(iid, "2003-10-15", b, "AC Nielsen via NAMC", "Oct 2003, AC Nielsen national average (NAMC)")

for s in series.values(): s.sort()
out = {"note": "Actual published average prices before 2017. Each point names its source; no estimates.",
       "sources": [s[1] for s in SOURCES], "short": [s[0] for s in SOURCES], "series": series}
json.dump(out, open("public/data/historic-prices.json", "w"), separators=(",", ":"))
print(len(series), "items,", sum(len(s) for s in series.values()), "points")
