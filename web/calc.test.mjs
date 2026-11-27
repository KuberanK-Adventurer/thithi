// Same checks as calculator/test_thithi_calc.py. Run: node --test web/calc.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import SwissEph from "./vendor/swisseph-wasm/src/swisseph.js";
import { makeCalculator, hhmm, msFromJd, TAMIL_MONTHS, thithiName, jdFromMs, zonedToMs } from "./calc.js";

const swe = new SwissEph();
await swe.initSwissEph();
const calc = makeCalculator(swe);

const DELHI = { name: "New Delhi", lat: 28.6356, lng: 77.2244, tz: "Asia/Kolkata" };
const CHENNAI = { name: "Chennai", lat: 13.0827, lng: 80.2707, tz: "Asia/Kolkata" };
const TORONTO = { name: "Toronto", lat: 43.6532, lng: -79.3832, tz: "America/Toronto" };
const JAFFNA = { name: "Jaffna", lat: 9.6615, lng: 80.0255, tz: "Asia/Colombo" };

function withinAMinute(jd, tz, published) {
  const [h, m] = published.split(":").map(Number);
  const got = hhmm(jd, tz);
  const [gh, gm] = got.split(":").map(Number);
  return Math.abs(gh * 60 + gm - (h * 60 + m)) <= 1;
}

test("annual date, advaita-l example (death 19 Oct 2018 -> 6 Nov 2019)", () => {
  const { info, dates } = calc.memorialDates({ y: 2018, m: 10, d: 19, h: 12, mi: 0 }, CHENNAI, CHENNAI, 1);
  assert.equal(info.tamilMonth, "Aippasi");
  assert.equal(info.thithiName, "Shukla Dashami");
  assert.equal(dates.find((x) => x.kind === "annual").date, "2019-11-06");
});

test("Puthandu 2025 and 2026 (Drik Panchang, New Delhi)", () => {
  for (const y of [2025, 2026]) {
    assert.equal(TAMIL_MONTHS[calc.tamilMonthIndex(`${y}-04-13`, DELHI)], "Panguni");
    assert.equal(TAMIL_MONTHS[calc.tamilMonthIndex(`${y}-04-14`, DELHI)], "Chittirai");
  }
});

test("19 Apr 2026 New Delhi: sunrise 05:52, sunset 18:49, Shukla Dvitiyai until 10:49", () => {
  const [rise, set] = calc.sunriseSunset("2026-04-19", DELHI);
  assert.equal(hhmm(rise, DELHI.tz), "05:52");
  assert.equal(hhmm(set, DELHI.tz), "18:49");
  assert.equal(thithiName(calc.thithiAt(rise)), "Shukla Dvitiyai");
  assert.ok(withinAMinute(calc.thithiEnd(rise), DELHI.tz, "10:49"));
});

test("15 Jan 2026 New Delhi: sunrise 07:15, sunset 17:46, Krishna Dvadashi until 20:16", () => {
  const [rise, set] = calc.sunriseSunset("2026-01-15", DELHI);
  assert.equal(hhmm(rise, DELHI.tz), "07:15");
  assert.equal(hhmm(set, DELHI.tz), "17:46");
  assert.equal(thithiName(calc.thithiAt(rise)), "Krishna Dvadashi");
  assert.ok(withinAMinute(calc.thithiEnd(rise), DELHI.tz, "20:16"));
});

test("death before sunrise belongs to the previous day", () => {
  assert.equal(calc.deathInfo({ y: 2026, m: 4, d: 19, h: 4, mi: 0 }, DELHI).hinduDay, "2026-04-18");
});

test("Sankranti moments 03:30 on 14 Apr 2025 and 21:15 on 13 Apr 2024 (within 2 minutes)", () => {
  for (const [y, m, d, h, mi] of [[2025, 4, 14, 3, 30], [2024, 4, 13, 21, 15]]) {
    const published = jdFromMs(zonedToMs(y, m, d, h, mi, DELHI.tz));
    assert.ok(calc.lon(published - 2 / 1440, 0, true) > 359);
    assert.ok(calc.lon(published + 2 / 1440, 0, true) < 1);
  }
});

test("matches the Python calculator's Toronto and Jaffna forecast", () => {
  // Output of calculator/example.py (death 10 Mar 2025, 14:30, Toronto).
  const expected = {
    Toronto: ["2025-04-08", "2025-05-08", "2025-06-07", "2025-07-06", "2025-08-05", "2025-09-04",
      "2025-10-03", "2025-11-02", "2025-12-01", "2025-12-31", "2026-01-29",
      "2026-02-27", "2027-02-17", "2028-03-07", "2029-02-25", "2030-02-14"],
    Jaffna: ["2025-04-09", "2025-05-08", "2025-06-07", "2025-07-07", "2025-08-05", "2025-09-04",
      "2025-10-04", "2025-11-02", "2025-12-02", "2025-12-31", "2026-01-29",
      "2026-02-28", "2027-02-18", "2028-03-08", "2029-02-25", "2030-02-14"],
  };
  for (const place of [TORONTO, JAFFNA]) {
    const { dates } = calc.memorialDates({ y: 2025, m: 3, d: 10, h: 14, mi: 30 }, TORONTO, place, 5);
    assert.deepEqual(dates.map((x) => x.date), expected[place.name]);
  }
});
