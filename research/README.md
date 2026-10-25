# Historical price research log

Rule: only actual published prices for the same product and pack size as our item. No estimates, no index back-casting.
Every point in `public/data/historic-prices.json` carries its source and a label shown on hover.

| Source | Period | Items used | Notes |
|---|---|---|---|
| Stats SA, *South African Statistics 2010*, table 7.3.1 (historical consumer prices) | 1910–1996, annual | Milk per litre (GRO-057), butter 500 g (GRO-065) from 1910; white sugar 2.5 kg (GRO-111) from 1976 | Sugar before 1976 not factory-packed (Stats SA footnote). Bread excluded: 900 g loaf before July 1985, 800 g after (ours is 700 g). Beef topside, mutton shoulder, eggs per dozen, potatoes per kg: not items we track. Figures agree with the 2000 edition and with P0141.3. |
| Stats SA, Retail prices 1996 (P0141.3) | 1995, 1996 annual | 14 items (see `scripts/build-historic.py`) | Only edition online; other years return 404. |
| AC Nielsen via NAMC (FPMC report 2004, Table 3.1) | Jan 2000, Oct 2003 | 9 generic items | Brand-specific and "cheapest" lines excluded. |
| AC Nielsen via NAMC Food Price Trends / Monitoring releases | 2005–2008 | Bread (white, brown), butter, fresh milk 2 L, long-life milk 1 L, sugar 2.5 kg, apricot jam 450 g, brick margarine 500 g | Only months where releases agree; see `namc_2005_2008.json`. |
| Stats SA urban averages via NAMC Food Price Monitor, Table 2 | 2009–2016, quarterly | Bread (white, brown), long-life milk, rice 2 kg, sugar 2.5 kg, peanut butter 400 g, super maize 2.5 kg | Urban column of each issue's current month. Hand-checked corrections and one dropped figure (rice Jul 2014, same as sugar: source typo) are in `build-historic.py`. Joins Stats SA 2017 series within ~1%. |
| Stats SA CPI average prices (Excel) | 2017–now, monthly, national + provinces | 119 items | `scripts/build-statssa.py`; skips the extra "March Online Price" (2020) column. |

## Leads not yet used
- SA History Online "Prices General 1979–1980" newspaper clippings (OCR'd; gazetted regional maximum prices, e.g. 2.5 kg sugar 98c East London, 87c Durban, c. 1979). Regional maxima, not national averages: logged, not charted.
- Gazetted controlled prices (bread, maize meal, milk) 1970s–1990s: Government Gazette archives.
- Other P0141.3 years and pre-2000 *South African Statistics* editions: not online; Stats SA library request.
