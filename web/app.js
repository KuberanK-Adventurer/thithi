import SwissEph from "./vendor/swisseph-wasm/src/swisseph.js";
import { makeCalculator, addDays } from "./calc.js";
import { initAccount, signedIn, saveRecord } from "./account.js";

const $ = (id) => document.getElementById(id);
const status = (t) => { $("status").textContent = t; };

// Start loading the astronomy engine straight away (about 12 MB the first time, then cached).
const calcReady = (async () => {
  const swe = new SwissEph();
  await swe.initSwissEph();
  return makeCalculator(swe);
})();

// ---------- place search (Open-Meteo geocoding, free, no key) ----------

const chosen = {};
let timer;
document.querySelectorAll("[data-place]").forEach((input) => {
  const list = document.querySelector(`.suggest[data-for="${input.id}"]`);
  input.addEventListener("input", () => {
    delete chosen[input.id];
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { list.innerHTML = ""; return; }
    timer = setTimeout(async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&name=${encodeURIComponent(q)}`);
        const { results = [] } = await r.json();
        list.innerHTML = "";
        for (const p of results) {
          const li = document.createElement("li");
          const where = [p.admin1, p.country].filter(Boolean).join(", ");
          li.innerHTML = `${esc(p.name)} <small>${esc(where)}</small>`;
          li.onclick = () => {
            chosen[input.id] = { name: `${p.name}, ${where}`, lat: p.latitude, lng: p.longitude, tz: p.timezone };
            input.value = chosen[input.id].name;
            list.innerHTML = "";
          };
          list.appendChild(li);
        }
      } catch { list.innerHTML = "<li>Couldn't search places. Check your connection.</li>"; }
    }, 300);
  });
});

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- accounts ----------

let lastInput = null;
initAccount((r) => {
  $("name").value = r.name;
  $("date").value = r.death_date;
  $("time").value = r.death_time ? r.death_time.slice(0, 5) : "";
  chosen.lived = r.lived; chosen.home = r.hometown;
  $("lived").value = r.lived.name; $("home").value = r.hometown.name;
  $("region").value = r.region;
  $("form").requestSubmit();
}).catch((e) => console.error("sign-in setup failed", e));

$("save").addEventListener("click", async () => {
  if (!lastInput) return;
  $("save").disabled = true;
  const err = await saveRecord({ ...lastInput, email_reminders: $("remind").checked });
  $("saveStatus").textContent = err || "Saved.";
  $("save").disabled = false;
});

// ---------- results ----------

const fmt = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString(undefined,
  { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const today = new Date().toISOString().slice(0, 10);

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!chosen.lived || !chosen.home) { status("Please pick both places from the suggestions list."); return; }
  $("go").disabled = true;
  status("Working out the dates…");
  try {
    const calc = await calcReady;
    const [y, m, d] = $("date").value.split("-").map(Number);
    const [h, mi] = ($("time").value || "12:00").split(":").map(Number);
    const death = { y, m, d, h, mi };
    const years = Math.max(10, new Date().getFullYear() - y + 10);
    const places = [chosen.lived, chosen.home];
    const runs = places.map((p) => ({ place: p, ...calc.memorialDates(death, chosen.lived, p, years) }));
    lastInput = { name: $("name").value.trim(), death_date: $("date").value, death_time: $("time").value || null,
      lived: chosen.lived, hometown: chosen.home, region: $("region").value };
    show($("name").value.trim(), runs, !$("time").value);
    $("saveBox").hidden = !signedIn();
    $("saveStatus").textContent = "";
    status("");
  } catch (err) {
    console.error(err);
    status("Something went wrong working out the dates. Please check the details and try again.");
  } finally { $("go").disabled = false; }
});

function show(name, runs, noTime) {
  const { info } = runs[0];
  const next = runs[0].dates.find((x) => x.date >= today);
  $("summary").innerHTML = `
    <h2>${esc(name)}</h2>
    <p>Thithi: <strong>${info.thithiName}</strong></p>
    <p>Tamil month: <strong>${info.tamilMonth}</strong></p>
    ${noTime ? '<p class="hint">No time given, so noon was used.</p>' : ""}
    ${next ? `<div class="next">Next date (${esc(runs[0].place.name.split(",")[0])})<strong>${fmt(next.date)}</strong>
      ${next.kind === "monthly" ? `Monthly ${next.number} of 11` : `Year ${next.number}`}</div>` : ""}`;

  $("tabs").innerHTML = "";
  $("lists").innerHTML = "";
  runs.forEach((run, i) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.role = "tab";
    tab.textContent = run.place.name.split(",")[0];
    tab.setAttribute("aria-selected", i === 0);
    $("tabs").appendChild(tab);

    const card = document.createElement("div");
    card.className = "card";
    card.hidden = i !== 0;
    const rows = (kind, title) => {
      const items = run.dates.filter((x) => x.kind === kind);
      return `<h3>${title}</h3>` + items.map((x) => `
        <li class="${x.date < today ? "past" : ""}">
          <span><span class="when">${fmt(x.date)}</span><br>
          <span class="what">${x.kind === "monthly" ? `Monthly ${x.number}` : `Year ${x.number}`} · ${x.tamilMonth}</span>
          ${x.notes.map((n) => `<span class="note">${esc(n)}</span>`).join("")}</span>
        </li>`).join("");
    };
    card.innerHTML = `<p class="hint">Using sunrise and sunset in ${esc(run.place.name)}.</p>
      <ul class="list">${rows("monthly", "First year, monthly")}${rows("annual", "Every year")}</ul>`;
    const cal = document.createElement("button");
    cal.type = "button";
    cal.className = "cal";
    cal.textContent = "Add upcoming dates to my calendar";
    cal.onclick = () => downloadIcs(name, run);
    card.appendChild(cal);
    $("lists").appendChild(card);

    tab.onclick = () => {
      [...$("tabs").children].forEach((t, j) => t.setAttribute("aria-selected", j === i));
      [...$("lists").children].forEach((c, j) => { c.hidden = j !== i; });
    };
  });
  $("results").hidden = false;
  $("results").scrollIntoView({ behavior: "smooth" });
}

// ---------- calendar file (.ics), opens in Apple, Google and Outlook calendars ----------

function downloadIcs(name, run) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const ev = run.dates.filter((x) => x.date >= today).map((x, i) => {
    const d = x.date.replace(/-/g, ""), d2 = addDays(x.date, 1).replace(/-/g, "");
    const title = `${name}: ${x.kind === "monthly" ? `monthly thithi ${x.number}` : `annual thithi (year ${x.number})`}`;
    return ["BEGIN:VEVENT", `UID:thithi-${d}-${i}@thithi`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`, `SUMMARY:${title}`,
      `DESCRIPTION:${x.tamilMonth}. Dates for ${run.place.name}.`,
      "BEGIN:VALARM", "TRIGGER:-P7D", "ACTION:DISPLAY", `DESCRIPTION:${title} in one week`, "END:VALARM",
      "END:VEVENT"].join("\r\n");
  });
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Thithi//EN", ...ev, "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `thithi-${run.place.name.split(",")[0].toLowerCase()}.ics`;
  a.click();
}
