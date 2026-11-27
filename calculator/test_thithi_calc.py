"""Checks against published values. Sources are listed in each test."""
import datetime as dt

from thithi_calc import (Place, hhmm, death_info, from_jd, memorial_dates, sunrise_sunset,
                         tamil_month_index, thithi_at, thithi_end, thithi_name, TAMIL_MONTHS)

DELHI = Place("New Delhi", 28.6356, 77.2244, "Asia/Kolkata")  # Drik Panchang default location
CHENNAI = Place("Chennai", 13.0827, 80.2707, "Asia/Kolkata")


def hm(j, place):
    return hhmm(j, place.zone)


def within_a_minute(j, place, published):
    """Published thithi end times are to the minute; allow up to 1 minute either way."""
    t = from_jd(j, place.zone)
    h, m = map(int, published.split(":"))
    target = t.replace(hour=h, minute=m, second=30, microsecond=0)
    return abs((t - target).total_seconds()) <= 90


def test_annual_date_advaita_example():
    # advaita-l, Oct 2019: death 19 Oct 2018 (Aippasi Shukla Dashami) -> 6 Nov 2019.
    # Place and time not given in the source; Chennai at noon assumed.
    death = dt.datetime(2018, 10, 19, 12, 0, tzinfo=CHENNAI.zone)
    info, dates = memorial_dates(death, CHENNAI, CHENNAI, years=1)
    assert info.tamil_month == "Aippasi"
    assert info.thithi_name == "Shukla Dashami"
    annual = [m for m in dates if m.kind == "annual"][0]
    assert annual.date == dt.date(2019, 11, 6)


def test_puthandu_2025_and_2026():
    # Drik Panchang (New Delhi): Puthandu 14 Apr 2025 and 14 Apr 2026.
    for y in (2025, 2026):
        assert TAMIL_MONTHS[tamil_month_index(dt.date(y, 4, 13), DELHI)] == "Panguni"
        assert TAMIL_MONTHS[tamil_month_index(dt.date(y, 4, 14), DELHI)] == "Chittirai"


def test_thithi_19_apr_2026_delhi():
    # Drik Panchang: sunrise 05:52, sunset 18:49, Dvitiyai (Shukla) until 10:49.
    rise, sset = sunrise_sunset(dt.date(2026, 4, 19), DELHI)
    assert hm(rise, DELHI) == "05:52"
    assert hm(sset, DELHI) == "18:49"
    assert thithi_name(thithi_at(rise)) == "Shukla Dvitiyai"
    assert within_a_minute(thithi_end(rise), DELHI, "10:49")


def test_thithi_15_jan_2026_delhi():
    # Drik Panchang: sunrise 07:15, sunset 17:46, Krishna Dwadashi until 20:16.
    rise, sset = sunrise_sunset(dt.date(2026, 1, 15), DELHI)
    assert hm(rise, DELHI) == "07:15"
    assert hm(sset, DELHI) == "17:46"
    assert thithi_name(thithi_at(rise)) == "Krishna Dvadashi"
    assert within_a_minute(thithi_end(rise), DELHI, "20:16")


def test_death_before_sunrise_belongs_to_previous_day():
    death = dt.datetime(2026, 4, 19, 4, 0, tzinfo=DELHI.zone)
    assert death_info(death, DELHI).hindu_day == dt.date(2026, 4, 18)


def test_first_year_shape():
    death = dt.datetime(2018, 10, 19, 12, 0, tzinfo=CHENNAI.zone)
    _, dates = memorial_dates(death, CHENNAI, CHENNAI, years=3)
    monthly = [m for m in dates if m.kind == "monthly"]
    annual = [m for m in dates if m.kind == "annual"]
    assert len(monthly) == 11 and len(annual) == 3
    assert [m.tamil_month for m in monthly][:2] == ["Karthigai", "Margazhi"]
    all_days = [m.date for m in dates]
    assert all_days == sorted(all_days)


def _sankranti(start):
    import swisseph as swe
    from thithi_calc import FLAGS, to_jd
    t = start
    while swe.calc_ut(to_jd(t), swe.SUN, FLAGS | swe.FLG_SIDEREAL)[0][0] > 300:
        t += dt.timedelta(minutes=1)
    return t


def test_puthandu_sankranti_moments():
    # Drik Panchang (New Delhi): 03:30 AM 14 Apr 2025; 09:15 PM 13 Apr 2024.
    # Checks the zodiac offset (ayanamsa). Allow 2 minutes.
    cases = [(dt.datetime(2025, 4, 14, 3, 30, tzinfo=DELHI.zone)),
             (dt.datetime(2024, 4, 13, 21, 15, tzinfo=DELHI.zone))]
    for published in cases:
        got = _sankranti(published - dt.timedelta(hours=1))
        assert abs((got - published).total_seconds()) <= 120
