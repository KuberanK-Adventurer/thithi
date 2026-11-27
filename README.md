# Thithi

A free tool for Tamil families to find the dates to remember a family member who has passed away. It finds the monthly dates for the first year and the annual date each year after, using the Tamil solar month and the lunar day (thithi) of the death.

- `calculator/`: the date calculator in Python, with checks against published panchangams.
- `web/`: the phone-first website. It runs the same calculator in the browser (`web/calc.js`), so dates appear instantly with no server. It is published to GitHub Pages on every change to `main`.

Sign-up and email reminders will follow.

## How dates are worked out

- **Thithi of death:** the thithi in effect at the moment of death.
- **Tamil month:** the sidereal sign the Sun is in at local sunset (Thirukanitha method, Lahiri offset). If the Sun changes sign before sunset, the new month starts that day.
- **Memorial day:** the day in the right Tamil month when the thithi covers the most of *aparahna*, the 4th of 5 equal parts of daylight.
- **First year:** one date in each of the next 11 Tamil months. **After that:** one date a year, in the Tamil month of death.
- Dates are worked out for each place separately, because sunrise and sunset differ.

When a case is unusual (the thithi falls twice in a month, or covers no aparahna), the result carries a note asking the family to confirm with their priest.

## Run it

```bash
cd calculator
pip install -r requirements.txt
python example.py        # sample forecast for two places
python -m pytest -q      # checks against published panchangam values
cd ..
node --test web/calc.test.mjs   # same checks for the browser version
python3 -m http.server -d web 8000   # then open http://localhost:8000
```

## Licence

AGPL-3.0, because the calculator uses the [Swiss Ephemeris](https://www.astro.com/swisseph/swephinfo_e.htm) under its AGPL option. The website bundles [swisseph-wasm](https://github.com/prolaxu/swisseph-wasm) (GPL-3.0-or-later) in `web/vendor/`. Place search uses the free [Open-Meteo geocoding API](https://open-meteo.com/en/docs/geocoding-api) (non-commercial use) with data from GeoNames.
