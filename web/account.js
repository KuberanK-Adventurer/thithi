// Sign-in (email link) and saved records, using Supabase.
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let sb = null;
let user = null;
let onOpen = () => {};

/** Set up sign-in. `open(record)` is called when someone taps a saved family member. */
export async function initAccount(open) {
  onOpen = open;
  if (!SUPABASE_URL) return; // not configured yet: the page works without accounts
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  $("account").hidden = false;

  $("signin").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("signinStatus").textContent = "Sending…";
    const { error } = await sb.auth.signInWithOtp({
      email: $("email").value.trim(),
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    $("signinStatus").textContent = error
      ? "Couldn't send the link. Please check the email address and try again."
      : "Check your email and tap the link to sign in.";
  });
  $("signout").addEventListener("click", async (e) => { e.preventDefault(); await sb.auth.signOut(); });

  sb.auth.onAuthStateChange((_event, session) => { user = session?.user ?? null; render(); });
  const { data } = await sb.auth.getSession();
  user = data.session?.user ?? null;
  render();
}

export const signedIn = () => !!user;

async function render() {
  $("signedOut").hidden = !!user;
  $("signedIn").hidden = !user;
  if (!user) return;
  $("whoEmail").textContent = user.email;
  const { data, error } = await sb.from("memorials").select("*").order("created_at");
  const list = $("saved");
  list.innerHTML = "";
  $("savedEmpty").hidden = !!(data && data.length);
  if (error) { $("savedEmpty").hidden = false; $("savedEmpty").textContent = "Couldn't load your saved family members."; return; }
  for (const r of data) {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" class="open">${esc(r.name)}
      <small>Passed ${esc(r.death_date)} · ${esc(r.lived.name.split(",")[0])}${r.email_reminders ? " · reminders on" : ""}</small></button>
      <button type="button" class="del" aria-label="Remove ${esc(r.name)}">Remove</button>`;
    li.querySelector(".open").onclick = () => onOpen(r);
    li.querySelector(".del").onclick = async () => {
      if (!confirm(`Remove ${r.name}? This can't be undone.`)) return;
      await sb.from("memorials").delete().eq("id", r.id);
      render();
    };
    list.appendChild(li);
  }
}

/** Save a family member for the signed-in person. Returns an error message or null. */
export async function saveRecord(rec) {
  if (!user) return "Please sign in first.";
  const { error } = await sb.from("memorials").insert(rec);
  if (error) return "Couldn't save. Please try again.";
  render();
  return null;
}
