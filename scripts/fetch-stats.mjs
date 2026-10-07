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
  const key = process.env.ROOTME_API_KEY;
  if (!key) { console.warn("root-me: ROOTME_API_KEY not set, keeping previous"); return; }
  let id = process.env.ROOTME_AUTHOR_ID;
  if (!id) id = await discoverRootmeId(key); // find it from the key if the id secret is absent
  if (!id) { console.warn("root-me: no author id (set ROOTME_AUTHOR_ID), keeping previous"); return; }
  try {
    const data = await getJson(`https://api.www.root-me.org/auteurs/${id}`, { Cookie: `api_key=${key}` });
    // observed shape: { nom, score, validations: [ {...}, ... ] }
    const solved = Array.isArray(data?.validations) ? data.validations.length
      : int(data?.nb_validations);
    const score = int(data?.score);
    if (solved == null || score == null) {
      console.warn("root-me: unexpected response shape, keeping previous. keys: " + Object.keys(data || {}).join(", "));
      return;
    }
    keepOrSet(next.rootme, "solved", solved, prev.rootme.solved);
    keepOrSet(next.rootme, "score", score, prev.rootme.score);
    next.rootme.updated = now;
  } catch (e) {
    console.warn(`root-me: fetch failed (${e.message}), keeping previous`);
  }
}

/* ---------- Hack The Box (optional) ---------- */
async function updateHtb() {
  const tok = process.env.HTB_TOKEN;
  if (!tok) { console.warn("htb: HTB_TOKEN not set, skipping (optional)"); return; }
  let id = process.env.HTB_USER_ID;
  if (!id) id = await discoverHtbId(tok); // find it from the token if the id secret is absent
  if (!id) { console.warn("htb: no user id (set HTB_USER_ID), keeping previous"); return; }
  try {
    const data = await getJson(`https://labs.hackthebox.com/api/v4/user/profile/basic/${id}`, {
      Authorization: `Bearer ${tok}`,
      "User-Agent": "etwale-portfolio-stats",
    });
    const machines = htbMachineCount(data);
    if (machines == null) {
      const p = data?.profile ?? data ?? {};
      console.warn("htb: no machines-owned count found, keeping previous. profile fields: " + Object.keys(p).join(", "));
      return;
    }
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

// Discover the IDs from the key/token when the id secrets are absent, so the
// owner only has to provide the key and token. Logs the id (not secret) once.
async function discoverRootmeId(key) {
  try {
    const data = await getJson("https://api.www.root-me.org/auteurs?nom=etwale", { Cookie: `api_key=${key}` });
    // Root-Me returns author matches in a few shapes; collect {id, nom} pairs from any of them.
    const pairs = [];
    const scan = (v) => {
      if (Array.isArray(v)) { v.forEach(scan); return; }
      if (v && typeof v === "object") {
        if (v.id_auteur && v.nom) pairs.push({ id: v.id_auteur, nom: v.nom });
        for (const [k, val] of Object.entries(v)) {
          if (/^\d+$/.test(k) && typeof val === "string") pairs.push({ id: k, nom: val });
          else scan(val);
        }
      }
    };
    scan(data);
    const hit = pairs.find((p) => String(p.nom).toLowerCase() === "etwale") || pairs[0];
    const id = hit ? int(hit.id) : null;
    if (id) console.log(`root-me: discovered author id ${id} (set ROOTME_AUTHOR_ID to skip this lookup)`);
    else console.warn("root-me: could not parse an author id from the search. raw: " + JSON.stringify(data).slice(0, 300));
    return id;
  } catch (e) { console.warn(`root-me: author-id discovery failed (${e.message})`); return null; }
}
async function discoverHtbId(tok) {
  try {
    const data = await getJson("https://labs.hackthebox.com/api/v4/user/info", {
      Authorization: `Bearer ${tok}`, "User-Agent": "etwale-portfolio-stats",
    });
    const id = int(data?.info?.id ?? data?.id);
    if (id) console.log(`htb: discovered user id ${id} (set HTB_USER_ID to skip this lookup)`);
    return id;
  } catch (e) { console.warn(`htb: user-id discovery failed (${e.message})`); return null; }
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
