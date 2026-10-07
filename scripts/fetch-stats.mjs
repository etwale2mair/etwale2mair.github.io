// Fetch Root-Me and HTB counts at build time and write landing/data/stats.json.
// This must NEVER break the build: on any failure, timeout, bad shape, or a
// count that dropped, it keeps the previous value and exits 0. No dependencies.
// Secrets come from process.env (GitHub Actions) or a gitignored local .env;
// the published JSON contains counts only, never a key.
//
// env: ROOTME_API_KEY, ROOTME_AUTHOR_ID, HTB_TOKEN, HTB_USER_ID
import fs from "node:fs";

const OUT = "landing/data/stats.json";
const TIMEOUT_MS = 10000;

loadDotenv(".env");

const prev = readJson(OUT) || {
  rootme: { solved: 109, score: 2090, updated: null },
  htb: { machines: 12, updated: null },
};
const next = JSON.parse(JSON.stringify(prev));
const now = new Date().toISOString();

await updateRootme();
await updateHtb();

fs.writeFileSync(OUT, JSON.stringify(next, null, 2) + "\n");
console.log(`stats: root-me ${next.rootme.solved} solved / ${next.rootme.score} pts, htb ${next.htb.machines} machines`);

/* ---------- Root-Me ---------- */
async function updateRootme() {
  const key = process.env.ROOTME_API_KEY, id = process.env.ROOTME_AUTHOR_ID;
  if (!key || !id) { console.warn("root-me: ROOTME_API_KEY / ROOTME_AUTHOR_ID not set, keeping previous"); return; }
  try {
    const data = await getJson(`https://api.www.root-me.org/auteurs/${id}`, { Cookie: `api_key=${key}` });
    // observed shape: { nom, score, validations: [ {...}, ... ] }
    const solved = Array.isArray(data?.validations) ? data.validations.length
      : int(data?.nb_validations);
    const score = int(data?.score);
    if (solved == null || score == null) { console.warn("root-me: unexpected response shape, keeping previous"); return; }
    keepOrSet(next.rootme, "solved", solved, prev.rootme.solved);
    keepOrSet(next.rootme, "score", score, prev.rootme.score);
    next.rootme.updated = now;
  } catch (e) {
    console.warn(`root-me: fetch failed (${e.message}), keeping previous`);
  }
}

/* ---------- Hack The Box (optional) ---------- */
async function updateHtb() {
  const tok = process.env.HTB_TOKEN, id = process.env.HTB_USER_ID;
  if (!tok || !id) { console.warn("htb: HTB_TOKEN / HTB_USER_ID not set, skipping (optional)"); return; }
  try {
    const data = await getJson(`https://labs.hackthebox.com/api/v4/user/profile/basic/${id}`, {
      Authorization: `Bearer ${tok}`,
      "User-Agent": "etwale-portfolio-stats",
    });
    const machines = htbMachineCount(data);
    if (machines == null) { console.warn("htb: could not find a machines-owned count in the response, keeping previous"); return; }
    keepOrSet(next.htb, "machines", machines, prev.htb.machines);
    next.htb.updated = now;
  } catch (e) {
    console.warn(`htb: fetch failed (${e.message}), keeping previous`);
  }
}

// Try the known places a system-own machine count can live in the HTB v4 profile.
// If the shape differs once a token exists, this returns null and we keep previous.
function htbMachineCount(data) {
  const p = data?.profile ?? data;
  const candidates = [
    p?.system_owns, p?.machine_owns, p?.owns?.machines, p?.machines_owned,
    p?.user_owns_count, p?.system_owns_count,
  ];
  for (const c of candidates) { const n = int(c); if (n != null) return n; }
  return null;
}

/* ---------- helpers ---------- */
function keepOrSet(obj, field, value, previous) {
  if (typeof previous === "number" && value < previous) {
    console.warn(`${field}: new value ${value} < previous ${previous}, keeping previous (counts never drop)`);
    obj[field] = previous;
  } else {
    obj[field] = value;
  }
}
function int(v) {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
async function getJson(url, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function loadDotenv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const k = m[1];
    let v = m[2].replace(/^["']|["']$/g, "");
    if (process.env[k] === undefined) process.env[k] = v; // real env wins
  }
}
