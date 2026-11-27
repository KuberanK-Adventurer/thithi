"""Print a sample forecast for two places. Run: python example.py"""
import datetime as dt

from thithi_calc import Place, memorial_dates

LIVED = Place("Toronto", 43.6532, -79.3832, "America/Toronto")
HOMETOWN = Place("Jaffna", 9.6615, 80.0255, "Asia/Colombo")

death = dt.datetime(2025, 3, 10, 14, 30, tzinfo=LIVED.zone)  # made-up example

for place in (LIVED, HOMETOWN):
    info, dates = memorial_dates(death, LIVED, place, years=5)
    print(f"\n{place.name}: death thithi {info.thithi_name}, Tamil month {info.tamil_month}")
    for m in dates:
        flag = "  * " + " ".join(m.notes) if m.notes else ""
        print(f"  {m.kind:7} {m.number:2}  {m.date:%a %d %b %Y}  {m.tamil_month}{flag}")
