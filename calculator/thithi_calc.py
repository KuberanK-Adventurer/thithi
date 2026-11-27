"""Tamil thithi memorial-date calculator.

Rules (see the project's rules document):
- Thithi = which 12-degree step the Moon is ahead of the Sun (1-15 Shukla, 16-30 Krishna).
- Thithi of death = the thithi in effect at the moment of death.
- Tamil month (Thirukanitha, Lahiri ayanamsa, VP285 variant): the sidereal sign the Sun is in at local
  sunset. This applies the rule "if the Sun enters the sign before sunset, the month
  starts that day, otherwise the next day".
- A Hindu day runs sunrise to sunrise, so a death before sunrise belongs to the previous day.
- Memorial day = the day in the target Tamil month on which the death thithi covers the
  most of aparahna (the 4th of 5 equal parts of daylight).
- If the thithi covers no aparahna that month, the day the thithi is in effect at sunrise
  is used and the result is flagged for the family to confirm (no source covers this case).
- First year: one date in each of the next 11 Tamil months; then the annual date in the
  Tamil month of death.

Positions come from Swiss Ephemeris (Moshier mode, no data files), AGPL licensed.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

import swisseph as swe

FLAGS = swe.FLG_MOSEPH
# Lahiri, VP285 variant: matches Drik Panchang's published sankranti moments
# (03:30 on 14 Apr 2025 and 21:15 on 13 Apr 2024, New Delhi) to within 1 minute.
# Standard SIDM_LAHIRI comes out about 9 minutes earlier.
swe.set_sid_mode(swe.SIDM_LAHIRI_VP285)

TAMIL_MONTHS = ["Chittirai", "Vaikasi", "Aani", "Aadi", "Aavani", "Purattasi", "Aippasi",
                "Karthigai", "Margazhi", "Thai", "Maasi", "Panguni"]
_THITHI = ["Prathamai", "Dvitiyai", "Tritiyai", "Chaturthi", "Panchami", "Shashti", "Saptami",
           "Ashtami", "Navami", "Dashami", "Ekadashi", "Dvadashi", "Trayodashi", "Chaturdashi"]

_STEPS = 60  # samples across the aparahna window (about every 2-3 minutes)


@dataclass(frozen=True)
class Place:
    name: str
    lat: float
    lng: float
    tz: str

    @property
    def zone(self) -> ZoneInfo:
        return ZoneInfo(self.tz)


@dataclass
class Memorial:
    kind: str            # "monthly" or "annual"
    number: int          # monthly 1-11, or annual year 1, 2, ...
    date: dt.date
    tamil_month: str
    coverage: float      # share of aparahna covered by the thithi (0-1)
    notes: list[str] = field(default_factory=list)


# ---------- astronomy helpers ----------

def to_jd(t: dt.datetime) -> float:
    u = t.astimezone(dt.timezone.utc)
    return swe.julday(u.year, u.month, u.day,
                      u.hour + u.minute / 60 + (u.second + u.microsecond / 1e6) / 3600)


def from_jd(j: float, zone: ZoneInfo) -> dt.datetime:
    y, m, d, h = swe.revjul(j)
    base = dt.datetime(y, m, d, tzinfo=dt.timezone.utc)
    return (base + dt.timedelta(hours=h)).astimezone(zone)


def hhmm(j: float, zone: ZoneInfo) -> str:
    """Local time rounded to the nearest minute, as published panchangams show it."""
    return (from_jd(j, zone) + dt.timedelta(seconds=30)).strftime("%H:%M")


def _lon(j: float, body: int, sidereal: bool = False) -> float:
    fl = FLAGS | (swe.FLG_SIDEREAL if sidereal else 0)
    return swe.calc_ut(j, body, fl)[0][0]


def thithi_at(j: float) -> int:
    """Thithi number 1-30 at Julian day j (UT)."""
    elong = (_lon(j, swe.MOON) - _lon(j, swe.SUN)) % 360
    return int(elong // 12) + 1


def thithi_name(n: int) -> str:
    if n == 15:
        return "Shukla Pournami"
    if n == 30:
        return "Krishna Amavasai"
    return ("Shukla " if n < 15 else "Krishna ") + _THITHI[(n - 1) % 15]


def thithi_end(j: float) -> float:
    """Julian day (UT) when the thithi in effect at j ends (to about 1 second)."""
    n = thithi_at(j)
    lo, hi = j, j
    while thithi_at(hi) == n:
        lo, hi = hi, hi + 0.25
    for _ in range(40):
        mid = (lo + hi) / 2
        if thithi_at(mid) == n:
            lo = mid
        else:
            hi = mid
    return hi


def sunrise_sunset(day: dt.date, place: Place) -> tuple[float, float]:
    """Sunrise and sunset (JD UT) for a local civil date. Upper edge of the Sun, with refraction."""
    local_midnight = dt.datetime(day.year, day.month, day.day, tzinfo=place.zone)
    j0 = to_jd(local_midnight)
    geo = (place.lng, place.lat, 0)
    rise = swe.rise_trans(j0, swe.SUN, swe.CALC_RISE, geo, 0, 0, FLAGS)[1][0]
    sset = swe.rise_trans(rise, swe.SUN, swe.CALC_SET, geo, 0, 0, FLAGS)[1][0]
    return rise, sset


def tamil_month_index(day: dt.date, place: Place) -> int:
    _, sset = sunrise_sunset(day, place)
    return int(_lon(sset, swe.SUN, sidereal=True) // 30)


def aparahna_coverage(day: dt.date, place: Place, n: int) -> float:
    rise, sset = sunrise_sunset(day, place)
    a0 = rise + 3 * (sset - rise) / 5
    a1 = rise + 4 * (sset - rise) / 5
    hits = sum(thithi_at(a0 + (a1 - a0) * (i + 0.5) / _STEPS) == n for i in range(_STEPS))
    return hits / _STEPS


# ---------- memorial rules ----------

@dataclass
class DeathInfo:
    thithi: int
    thithi_name: str
    month_index: int
    tamil_month: str
    hindu_day: dt.date


def death_info(death: dt.datetime, place: Place) -> DeathInfo:
    """`death` must be timezone-aware (local time at the place of death)."""
    j = to_jd(death)
    day = death.astimezone(place.zone).date()
    rise, _ = sunrise_sunset(day, place)
    if j < rise:
        day -= dt.timedelta(days=1)
    n = thithi_at(j)
    m = tamil_month_index(day, place)
    return DeathInfo(n, thithi_name(n), m, TAMIL_MONTHS[m], day)


def _month_days(start: dt.date, month_index: int, place: Place) -> list[dt.date]:
    """All days of the first run of `month_index` on or after `start`."""
    d, days = start, []
    for _ in range(420):
        if tamil_month_index(d, place) == month_index:
            days.append(d)
        elif days:
            break
        d += dt.timedelta(days=1)
    return days


def best_day(days: list[dt.date], n: int, place: Place) -> tuple[dt.date, float, list[str]]:
    scored = [(d, aparahna_coverage(d, place, n)) for d in days]
    hits = [s for s in scored if s[1] > 0]
    notes: list[str] = []
    if hits:
        # Separate runs (the thithi can come round twice in one solar month).
        runs, prev = 0, None
        for d, _ in hits:
            if prev is None or (d - prev).days > 2:
                runs += 1
            prev = d
        if runs > 1:
            notes.append("The thithi falls twice in this Tamil month; the day with the most "
                         "aparahna coverage was chosen. Please confirm with your priest.")
        d, c = max(hits, key=lambda s: s[1])
        return d, c, notes
    # Fallback: thithi in effect at sunrise.
    for d in days:
        rise, _ = sunrise_sunset(d, place)
        if thithi_at(rise) == n:
            notes.append("The thithi does not cover aparahna on any day this month; the day it "
                         "is in effect at sunrise was used. Please confirm with your priest.")
            return d, 0.0, notes
    raise ValueError("thithi not found in month")


def memorial_dates(death: dt.datetime, death_place: Place, place: Place,
                   years: int = 10) -> tuple[DeathInfo, list[Memorial]]:
    """Monthly dates for the first year and annual dates, calculated for `place`.

    The thithi and Tamil month of death are fixed at the place of death; the memorial days
    are then found using sunrise and sunset at `place`.
    """
    info = death_info(death, death_place)
    out: list[Memorial] = []
    cursor = info.hindu_day + dt.timedelta(days=1)
    for k in range(1, 12):
        m = (info.month_index + k) % 12
        days = _month_days(cursor, m, place)
        d, c, notes = best_day(days, info.thithi, place)
        out.append(Memorial("monthly", k, d, TAMIL_MONTHS[m], c, notes))
        cursor = days[-1] + dt.timedelta(days=1)
    for y in range(1, years + 1):
        days = _month_days(cursor, info.month_index, place)
        d, c, notes = best_day(days, info.thithi, place)
        out.append(Memorial("annual", y, d, info.tamil_month, c, notes))
        cursor = days[-1] + dt.timedelta(days=1)
    return info, out
