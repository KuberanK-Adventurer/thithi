// Tamil thithi memorial-date calculator for the browser.
// A line-by-line port of calculator/thithi_calc.py; the same rules and the same checks apply.
// Uses swisseph-wasm (Swiss Ephemeris compiled to WebAssembly, GPL-3.0-or-later) in Moshier mode.

const SUN = 0, MOON = 1;
const SEFLG_MOSEPH = 4, SEFLG_SIDEREAL = 64 * 1024;
const SE_CALC_RISE = 1, SE_CALC_SET = 2;
const SE_SIDM_LAHIRI_VP285 = 44; // matches Drik Panchang sankranti times (see the rules document)
const STEPS = 60;

export const TAMIL_MONTHS = ["Chittirai", "Vaikasi", "Aani", "Aadi", "Aavani", "Purattasi",
  "Aippasi", "Karthigai", "Margazhi", "Thai", "Maasi", "Panguni"];
const THITHI = ["Prathamai", "Dvitiyai", "Tritiyai", "Chaturthi", "Panchami", "Shashti", "Saptami",
  "Ashtami", "Navami", "Dashami", "Ekadashi", "Dvadashi", "Trayodashi", "Chaturdashi"];

export function thithiName(n) {
  if (n === 15) return "Shukla Pournami";
  if (n === 30) return "Krishna Amavasai";
  return (n < 15 ? "Shukla " : "Krishna ") + THITHI[(n - 1) % 15];
}

// ---------- dates and time zones ----------

const MS_DAY = 86400000;
export const jdFromMs = (ms) => ms / MS_DAY + 2440587.5;
export const msFromJd = (jd) => (jd - 2440587.5) * MS_DAY;

function zoneParts(ms, tz) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

function offsetMs(ms, tz) {
  const p = zoneParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** UTC milliseconds for a local wall-clock time in `tz`. */
export function zonedToMs(y, m, d, h = 0, mi = 0, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ms = guess - offsetMs(guess, tz);
  ms = guess - offsetMs(ms, tz);
  return ms;
}

/** Local civil date (as "YYYY-MM-DD") of a Julian day in `tz`. */
export function localDate(jd, tz) {
  const p = zoneParts(msFromJd(jd), tz);
  return iso(p.y, p.m, p.d);
}

/** Local time rounded to the nearest minute, as panchangams print it. */
export function hhmm(jd, tz) {
  const p = zoneParts(msFromJd(jd) + 30000, tz);
  return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}

const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * MS_DAY);
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / MS_DAY;

// ---------- calculator ----------

/**
 * Build a calculator around an initialised swisseph-wasm instance:
 *   const swe = new SwissEph(); await swe.initSwissEph(); const calc = makeCalculator(swe);
 */
export function makeCalculator(swe) {
  const M = swe.SweModule;
  swe.set_sid_mode(SE_SIDM_LAHIRI_VP285, 0, 0);

  const lon = (jd, body, sidereal = false) =>
    swe.calc_ut(jd, body, SEFLG_MOSEPH | (sidereal ? SEFLG_SIDEREAL : 0))[0];

  const thithiAt = (jd) => Math.floor((((lon(jd, MOON) - lon(jd, SUN)) % 360 + 360) % 360) / 12) + 1;

  function thithiEnd(jd) {
    const n = thithiAt(jd);
    let lo = jd, hi = jd;
    while (thithiAt(hi) === n) { lo = hi; hi += 0.25; }
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (thithiAt(mid) === n) lo = mid; else hi = mid;
    }
    return hi;
  }

  // The package's own rise_trans wrapper passes the wrong arguments, so call the C function directly.
  function riseTrans(jd, rsmi, place) {
    const geo = M._malloc(24), tret = M._malloc(80), serr = M._malloc(256);
    M.HEAPF64.set([place.lng, place.lat, 0], geo / 8);
    const rc = M.ccall("swe_rise_trans", "number",
      ["number", "number", "number", "number", "number", "number", "number", "number", "number", "number"],
      [jd, SUN, 0, SEFLG_MOSEPH, rsmi, geo, 0, 0, tret, serr]);
    const t = M.HEAPF64[tret / 8];
    M._free(geo); M._free(tret); M._free(serr);
    if (rc < 0) throw new Error("sunrise/sunset not found");
    return t;
  }

  const cache = new Map();
  function sunriseSunset(date, place) {
    const key = `${date}|${place.lat}|${place.lng}`;
    if (cache.has(key)) return cache.get(key);
    const [y, m, d] = date.split("-").map(Number);
    const j0 = jdFromMs(zonedToMs(y, m, d, 0, 0, place.tz));
    const rise = riseTrans(j0, SE_CALC_RISE, place);
    const set = riseTrans(rise, SE_CALC_SET, place);
    cache.set(key, [rise, set]);
    return [rise, set];
  }

  const tamilMonthIndex = (date, place) =>
    Math.floor(lon(sunriseSunset(date, place)[1], SUN, true) / 30);

  function aparahnaCoverage(date, place, n) {
    const [rise, set] = sunriseSunset(date, place);
    const a0 = rise + (3 * (set - rise)) / 5, a1 = rise + (4 * (set - rise)) / 5;
    let hits = 0;
    for (let i = 0; i < STEPS; i++) if (thithiAt(a0 + ((a1 - a0) * (i + 0.5)) / STEPS) === n) hits++;
    return hits / STEPS;
  }

  /** `death` = {y, m, d, h, mi} local wall-clock time at `place`. */
  function deathInfo(death, place) {
    const jd = jdFromMs(zonedToMs(death.y, death.m, death.d, death.h, death.mi, place.tz));
    let day = iso(death.y, death.m, death.d);
    if (jd < sunriseSunset(day, place)[0]) day = addDays(day, -1);
    const n = thithiAt(jd), mi = tamilMonthIndex(day, place);
    return { thithi: n, thithiName: thithiName(n), monthIndex: mi, tamilMonth: TAMIL_MONTHS[mi], hinduDay: day };
  }

  function monthDays(start, monthIndex, place) {
    const days = [];
    let d = start;
    for (let i = 0; i < 420; i++) {
      if (tamilMonthIndex(d, place) === monthIndex) days.push(d);
      else if (days.length) break;
      d = addDays(d, 1);
    }
    return days;
  }

  function bestDay(days, n, place) {
    const hits = days.map((d) => [d, aparahnaCoverage(d, place, n)]).filter((s) => s[1] > 0);
    const notes = [];
    if (hits.length) {
      let runs = 0, prev = null;
      for (const [d] of hits) { if (prev === null || daysBetween(prev, d) > 2) runs++; prev = d; }
      if (runs > 1) notes.push("The thithi falls twice in this Tamil month; the day with the most " +
        "aparahna coverage was chosen. Please confirm with your priest.");
      const best = hits.reduce((a, b) => (b[1] > a[1] ? b : a));
      return { date: best[0], coverage: best[1], notes };
    }
    for (const d of days) {
      if (thithiAt(sunriseSunset(d, place)[0]) === n) {
        notes.push("The thithi does not cover aparahna on any day this month; the day it is in " +
          "effect at sunrise was used. Please confirm with your priest.");
        return { date: d, coverage: 0, notes };
      }
    }
    throw new Error("thithi not found in month");
  }

  /** Monthly dates for the first year, then annual dates, found using sunrise and sunset at `place`. */
  function memorialDates(death, deathPlace, place, years = 10) {
    const info = deathInfo(death, deathPlace);
    const out = [];
    let cursor = addDays(info.hinduDay, 1);
    for (let k = 1; k <= 11; k++) {
      const m = (info.monthIndex + k) % 12;
      const days = monthDays(cursor, m, place);
      out.push({ kind: "monthly", number: k, tamilMonth: TAMIL_MONTHS[m], ...bestDay(days, info.thithi, place) });
      cursor = addDays(days[days.length - 1], 1);
    }
    for (let y = 1; y <= years; y++) {
      const days = monthDays(cursor, info.monthIndex, place);
      out.push({ kind: "annual", number: y, tamilMonth: info.tamilMonth, ...bestDay(days, info.thithi, place) });
      cursor = addDays(days[days.length - 1], 1);
    }
    return { info, dates: out };
  }

  return { thithiAt, thithiEnd, sunriseSunset, tamilMonthIndex, deathInfo, memorialDates, lon };
}
