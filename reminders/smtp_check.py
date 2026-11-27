"""Check the email settings without printing any secret. Run by hand when sending fails."""
import os
import smtplib
import ssl

host = os.environ["SMTP_HOST"].strip()
port = int(os.environ.get("SMTP_PORT", "465").strip())
user = os.environ["SMTP_USER"].strip()
pw = "".join(os.environ["SMTP_PASSWORD"].split())
frm = os.environ["MAIL_FROM"].strip()
print("host:", host, "port:", port)
print("user domain:", user.split("@")[-1] if "@" in user else "(no @ in SMTP_USER)")
print("MAIL_FROM same as SMTP_USER:", frm.lower() == user.lower())
print("password length:", len(pw), "| all letters:", pw.isalpha(), "| all lowercase:", pw.islower(), "| ascii:", pw.isascii())
s = smtplib.SMTP_SSL(host, port, timeout=30, context=ssl.create_default_context())
code, msg = s.ehlo()
print("ehlo:", code, [l for l in msg.decode().splitlines() if l.startswith("AUTH")])
for mech in ("PLAIN", "LOGIN"):
    try:
        s = smtplib.SMTP_SSL(host, port, timeout=30)
        s.ehlo()
        s.user, s.password = user, pw
        auth = {"PLAIN": s.auth_plain, "LOGIN": s.auth_login}[mech]
        print(mech, "->", s.auth(mech, auth, initial_response_ok=(mech == "PLAIN")))
        s.quit()
        break
    except Exception as e:
        print(mech, "failed:", type(e).__name__, str(e)[:200])
