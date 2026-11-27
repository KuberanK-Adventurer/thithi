import datetime as dt

import send_reminders as sr

TORONTO = {"name": "Toronto", "lat": 43.6532, "lng": -79.3832, "tz": "America/Toronto"}
JAFFNA = {"name": "Jaffna", "lat": 9.6615, "lng": 80.0255, "tz": "Asia/Colombo"}
REC = {"id": "m1", "user_id": "u1", "name": "Appa", "death_date": "2025-03-10", "death_time": "14:30:00",
       "lived": TORONTO, "hometown": JAFFNA, "region": "Tamil Nadu", "email_reminders": True}


class FakeDB:
    def __init__(self):
        self.sent = set()

    def memorials(self):
        return [REC]

    def user_emails(self):
        return {"u1": "family@example.com"}

    def already_sent(self):
        return set(self.sent)

    def mark_sent(self, mid, d, place):
        self.sent.add((mid, d, place))


def test_due_one_week_before(monkeypatch):
    # Python calculator: annual year 2 is 17 Feb 2027 in Toronto, 18 Feb 2027 in Jaffna.
    outbox = []
    monkeypatch.setattr(sr, "send", lambda to, s, b: outbox.append((to, s, b)))
    db = FakeDB()
    assert sr.run(db, dt.date(2027, 2, 10)) == 1
    assert outbox[0][0] == "family@example.com"
    assert "Wednesday 17 February 2027" in outbox[0][1]
    assert "Toronto" in outbox[0][2]
    # Next day: the Jaffna date is due; Toronto is not sent again.
    assert sr.run(db, dt.date(2027, 2, 11)) == 1
    assert "Jaffna" in outbox[1][2] and "using Toronto" not in outbox[1][2]
    # Running the same day twice sends nothing new.
    assert sr.run(db, dt.date(2027, 2, 11)) == 0


def test_nothing_due():
    db = FakeDB()
    assert sr.run(db, dt.date(2027, 1, 1)) == 0
