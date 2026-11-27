"""Daily job: email people one week before each saved memorial date.

Runs on GitHub Actions (see .github/workflows/reminders.yml). Needs these secrets:
  SUPABASE_URL          e.g. https://abcdefgh.supabase.co
  SUPABASE_SERVICE_KEY  the secret (service_role) key; never put this in the website
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM
For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER/MAIL_FROM = the Gmail address,
SMTP_PASSWORD = an app password.

Set DRY_RUN=1 to print the emails instead of sending them.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import smtplib
import sys
import urllib.error
import urllib.request
from email.message import EmailMessage
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "calculator"))
from thithi_calc import Place, memorial_dates  # noqa: E402

DAYS_AHEAD = 7
SITE = "https://kuberank-adventurer.github.io/thithi/"


# ---------- Supabase (REST, service key) ----------

class Supabase:
    def __init__(self, url: str, key: str):
        self.url, self.key = url.rstrip("/"), key

    def _req(self, method: str, path: str, body=None, headers=None):
        req = urllib.request.Request(self.url + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None)
        req.add_header("apikey", self.key)
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("Content-Type", "application/json")
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
                return json.loads(data) if data else None
        except urllib.error.HTTPError as e:  # show Supabase's reason, not just the code
            raise RuntimeError(f"{method} {path.split('?')[0]} -> {e.code}: {e.read()[:300].decode(errors='replace')}") from None

    def memorials(self) -> list[dict]:
        return self._req("GET", "/rest/v1/memorials?email_reminders=eq.true&select=*")

    def user_emails(self) -> dict[str, str]:
        emails, page = {}, 1
        while True:
            res = self._req("GET", f"/auth/v1/admin/users?page={page}&per_page=1000")
            users = res.get("users", [])
            emails.update({u["id"]: u.get("email") for u in users if u.get("email")})
            if len(users) < 1000:
                return emails
            page += 1

    def already_sent(self) -> set[tuple[str, str, str]]:
        rows = self._req("GET", "/rest/v1/reminders_sent?select=memorial_id,for_date,place")
        return {(r["memorial_id"], r["for_date"], r["place"]) for r in rows}

    def mark_sent(self, memorial_id: str, for_date: str, place: str) -> None:
        self._req("POST", "/rest/v1/reminders_sent",
                  {"memorial_id": memorial_id, "for_date": for_date, "place": place},
                  {"Prefer": "resolution=ignore-duplicates"})


# ---------- what is due ----------

def place_from(p: dict) -> Place:
    return Place(p["name"], float(p["lat"]), float(p["lng"]), p["tz"])


def due_reminders(rec: dict, today: dt.date) -> list[dict]:
    """Dates exactly DAYS_AHEAD days after `today`, for both places of one saved record."""
    lived, home = place_from(rec["lived"]), place_from(rec["hometown"])
    d = dt.date.fromisoformat(rec["death_date"])
    hh, mm = map(int, (rec.get("death_time") or "12:00")[:5].split(":"))
    death = dt.datetime(d.year, d.month, d.day, hh, mm, tzinfo=lived.zone)
    target = today + dt.timedelta(days=DAYS_AHEAD)
    years = max(10, target.year - d.year + 1)
    out = []
    for place in (lived, home):
        _, dates = memorial_dates(death, lived, place, years=years)
        for m in dates:
            if m.date == target:
                out.append({"place": place.name, "memorial": m})
    return out


def compose(rec: dict, items: list[dict]) -> tuple[str, str]:
    m = items[0]["memorial"]
    what = f"monthly thithi ({m.number} of 11)" if m.kind == "monthly" else f"annual thithi (year {m.number})"
    subject = f"{rec['name']}: {what} on {m.date:%A %d %B %Y}"
    lines = [f"This is a reminder that {rec['name']}'s {what} is in one week.", ""]
    for it in items:
        mm = it["memorial"]
        lines.append(f"  {mm.date:%A %d %B %Y}  ({mm.tamil_month}), using {it['place']}")
        lines += [f"  Note: {n}" for n in mm.notes]
    lines += ["", "Please confirm important dates with your family priest.", "",
              f"See all dates or turn off reminders: {SITE}"]
    return subject, "\n".join(lines)


def send(to: str, subject: str, body: str) -> None:
    if os.environ.get("DRY_RUN"):
        print(f"--- would send to {to}\nSubject: {subject}\n{body}\n")
        return
    msg = EmailMessage()
    msg["From"] = f"Thithi reminders <{os.environ['MAIL_FROM']}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    host, port = os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "465"))
    with smtplib.SMTP_SSL(host, port, timeout=30) as s:
        s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        s.send_message(msg)


def run(db: Supabase, today: dt.date) -> int:
    emails = db.user_emails()
    sent = db.already_sent()
    count = 0
    for rec in db.memorials():
        to = emails.get(rec["user_id"])
        if not to:
            continue
        try:
            items = due_reminders(rec, today)
        except Exception as e:  # one bad record must not stop the others
            print(f"skipped record {rec.get('id')}: {e}", file=sys.stderr)
            continue
        items = [i for i in items if (rec["id"], i["memorial"].date.isoformat(), i["place"]) not in sent]
        if not items:
            continue
        subject, body = compose(rec, items)
        send(to, subject, body)
        for i in items:
            db.mark_sent(rec["id"], i["memorial"].date.isoformat(), i["place"])
        count += 1
    return count


def send_test() -> None:
    """Send one sample email to MAIL_FROM, to check the email settings work."""
    to = os.environ["MAIL_FROM"]
    send(to, "Thithi reminders: test email",
         "This is a test from the Thithi reminder job. If you can read this, email sending works.\n\n"
         f"{SITE}")
    print("sent a test email to the MAIL_FROM address")


if __name__ == "__main__":
    if os.environ.get("SEND_TEST"):
        send_test()
        sys.exit(0)
    db = Supabase(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    n = run(db, dt.datetime.now(dt.timezone.utc).date())
    print(f"sent {n} reminder email(s)")
