# Thithi

A free tool for Tamil families to find the dates to remember a family member who has passed away. It finds the monthly dates for the first year and the annual date each year after, using the Tamil solar month and the lunar day (thithi) of the death.

This repository holds the date calculator (Step 2 of the plan). The website and email reminders will follow.

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
```

## Licence

AGPL-3.0, because the calculator uses the [Swiss Ephemeris](https://www.astro.com/swisseph/swephinfo_e.htm) under its AGPL option.
