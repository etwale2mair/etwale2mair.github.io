// Sync published notes from the Obsidian vault into content/.
// The site repo is PUBLIC. Only notes with `publish: true` are copied, and
// a set of vault paths is refused outright (see EXCLUDED). Active Hack The
// Box boxes are published as sealed stubs only, never their body.
//
// usage: node scripts/sync-vault.mjs [--content-dir DIR]
//   VAULT=/path overrides the vault location (default below).
//
// no external deps beyond `yaml` (already installed). writes nothing to the
// vault. only ever modifies/deletes content files it recorded in the manifest.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import YAML from "yaml";

const VAULT = process.env.VAULT || "/home/etwale/Documents/Obsidian/MyNewVault";
const args = process.argv.slice(2);
const CONTENT = argValue("--content-dir") || "content";
const SEALED_DIR = path.join(os.homedir(), ".local/share/writeups-site/sealed");
const MANIFEST = path.join(CONTENT, ".vault-sync.json");

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

// Refused vault paths, even with publish: true.
// reasons: private life and job-search material; employer and client work;
// an active bug bounty program; Root-Me forbids publishing challenge solutions.
const EXCLUDED = [
  "life stuff/",
  "dfast/",
  "OTERIA/Mission/",
  "projets/bugbounty-mediamarkt/",
  "NOTES/repo/Root moi/",
  ".trash/",
  ".obsidian/",
];

function die(msg) {
  console.error(`\n✗ sync aborted: ${msg}\n`);
  process.exit(1);
}

/* ---------- small helpers ---------- */
function slugify(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function parseFront(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: {}, body: raw };
  let fm = {};
  try { fm = YAML.parse(m[1]) ?? {}; } catch (e) { fm = { __error: e.message }; }
  return { fm, body: raw.slice(m[0].length) };
}
function normalizeBody(body) {
  return body.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/g, "")).join("\n").trim();
}
function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(base, abs);
    if (e.isDirectory()) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      walk(abs, base, out);
    } else if (e.name.endsWith(".md")) {
      out.push(rel);
    }
  }
  return out;
}
function isExcluded(rel) {
  const p = rel.split(path.sep).join("/");
  return EXCLUDED.some((x) => p === x.replace(/\/$/, "") || p.startsWith(x));
}
function toFrontmatter(obj) {
  // stable, minimal YAML for the generated files
  return "---\n" + YAML.stringify(obj).trimEnd() + "\n---\n";
}

/* ---------- load state ---------- */
const manifest = fs.existsSync(MANIFEST)
  ? JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
  : { version: 1, notes: {} };
const oldNotes = manifest.notes || {};
const oldManaged = new Set(Object.values(oldNotes).flatMap((n) => n.files || []));

if (!fs.existsSync(VAULT)) die(`vault not found: ${VAULT}`);

/* ---------- pass 1: collect published notes ---------- */
const files = walk(VAULT).filter((rel) => !isExcluded(rel));
const published = [];
for (const rel of files) {
  const raw = fs.readFileSync(path.join(VAULT, rel), "utf8");
  const { fm, body } = parseFront(raw);
  if (fm.__error) die(`invalid frontmatter in vault note: ${rel} (${fm.__error})`);
  if (fm.publish !== true) continue;
  for (const need of ["title", "description", "date"]) {
    if (!fm[need]) die(`published note is missing "${need}": ${rel}`);
  }
  const section = String(fm.section || "misc");
  const slugField = fm.slug ? String(fm.slug) : slugify(fm.title);
  const publicSlug = `${slugify(section)}/${slugify(slugField)}`;
  const active = fm.htb && fm.htb.status === "active";
  published.push({ rel, fm, body, section, slugField, publicSlug, active });
}

// map for wikilink resolution: basename + title (lowercased) -> publicSlug
const byName = new Map();
for (const n of published) {
  byName.set(path.basename(n.rel, ".md").toLowerCase(), n.publicSlug);
  if (n.fm.title) byName.set(String(n.fm.title).toLowerCase(), n.publicSlug);
}

/* ---------- transforms ---------- */
function shortenPrompts(md) {
  // only inside fenced code blocks; shorten a leading shell prompt to "$ " / "# "
  const out = [];
  let inFence = false;
  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) { inFence = !inFence; out.push(line); continue; }
    if (inFence) {
      // e.g. "[etwale🎴exegol]:/workspace $ cmd" or "user@host:/path# cmd"
      const m = line.match(/^\s*(?:\[[^\]]+\]|[^\s#$]+@[^\s#$]+)\s*:?\s*\S*\s*([#$])\s+(.*)$/);
      if (m) { out.push(`${m[1]} ${m[2]}`); continue; }
    }
    out.push(line);
  }
  return out.join("\n");
}
function rewriteWikilinks(md) {
  return md.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const [rawTarget, rawLabel] = inner.split("|");
    const target = rawTarget.split("#")[0].trim();
    const label = (rawLabel ?? rawTarget).trim();
    const slug = byName.get(target.toLowerCase());
    return slug ? `[[${slug}|${label}]]` : label; // unpublished -> plain label
  });
}
function findImage(noteRel, name) {
  const noteDir = path.dirname(path.join(VAULT, noteRel));
  const local = path.join(noteDir, "images", name);
  if (fs.existsSync(local)) return local;
  const sibling = path.join(noteDir, name);
  if (fs.existsSync(sibling)) return sibling;
  // vault-wide fallback by filename
  const hit = walkAny(VAULT).find((p) => path.basename(p) === name);
  return hit || null;
}
let _allFiles = null;
function walkAny(dir, base = dir, out = []) {
  if (_allFiles) return _allFiles;
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) rec(abs); else out.push(abs);
    }
  };
  rec(dir); _allFiles = out; return out;
}
function rewriteImages(md, note, writtenFiles) {
  let n = 0;
  const handle = (name, alt) => {
    const src = findImage(note.rel, name.trim());
    if (!src) { console.warn(`  ! image not found, left as-is: ${name}`); return null; }
    n += 1;
    const ext = path.extname(src).toLowerCase() || ".png";
    const outName = `${note.slugField}-${n}${ext}`;
    const outRel = `${note.section}/images/${outName}`;
    const outAbs = path.join(CONTENT, outRel);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.copyFileSync(src, outAbs);
    writtenFiles.push(outRel);
    return `![${alt || ""}](images/${outName})`;
  };
  // Obsidian embed: ![[name.ext]]  or  ![[name.ext|alt]]
  md = md.replace(/!\[\[([^\]|]+\.(?:png|jpe?g|gif|webp|svg))(?:\|([^\]]*))?\]\]/gi,
    (m, name, alt) => handle(name, alt) ?? m);
  return md;
}

/* ---------- pass 2: write ---------- */
fs.mkdirSync(SEALED_DIR, { recursive: true });
const newNotes = {};
const added = [], updated = [], removed = [];
const activeChecks = [];

for (const n of published) {
  const fileName = `${n.slugField}.md`;
  const contentRel = `${n.section}/${fileName}`;
  const contentAbs = path.join(CONTENT, contentRel);
  fs.mkdirSync(path.dirname(contentAbs), { recursive: true });
  const writtenFiles = [contentRel];

  const fmOut = {
    title: n.fm.title,
    description: n.fm.description,
    date: fmtDate(n.fm.date),
    tags: n.fm.tags || [],
    featured: n.fm.featured === true,
  };

  let out;
  if (n.active) {
    // sealed stub only: no body, no images ever written
    fmOut.featured = false; // locked items are never featured
    fmOut.tags = []; // no technique tags on active boxes: they hint the path
    fmOut.locked = true;
    if (n.fm.htb) fmOut.htb = pickHtb(n.fm.htb);

    const sealedName = n.publicSlug.replace(/\//g, "-");
    const prev = oldNotes[n.publicSlug]?.sealed;
    const bodyHash = sha256(normalizeBody(n.body));
    let sealed;
    if (prev) {
      sealed = prev; // never change a published hash
      if (prev.hash !== bodyHash) {
        console.log(`  · note "${n.publicSlug}" differs from its sealed snapshot (informative)`);
      }
    } else {
      const snap = normalizeBody(n.body) + "\n";
      fs.writeFileSync(path.join(SEALED_DIR, `${sealedName}.md`), snap);
      sealed = { hash: bodyHash, date: today(), commit: null };
      console.log(`  · sealed new active box "${n.publicSlug}" (sha256 ${bodyHash.slice(0, 8)})`);
    }
    fmOut.sealed = { hash: sealed.hash, date: sealed.date, commit: sealed.commit };

    out = toFrontmatter(fmOut) + stubBody(sealed);
    activeChecks.push({ note: n });
    newNotes[n.publicSlug] = { source: n.rel, files: writtenFiles, sealed };
  } else {
    let md = n.body;
    md = rewriteImages(md, n, writtenFiles);
    md = rewriteWikilinks(md);
    md = shortenPrompts(md);
    out = toFrontmatter(fmOut) + "\n" + md.replace(/^\n+/, "");
    // retirement: if this note was a sealed active box before, publish the snapshot verbatim
    const sealedName = n.publicSlug.replace(/\//g, "-");
    const snapAbs = path.join(SEALED_DIR, `${sealedName}.md`);
    if (oldNotes[n.publicSlug]?.sealed && fs.existsSync(snapAbs)) {
      const outSnap = path.join("landing", "sealed", `${sealedName}.md`);
      fs.mkdirSync(path.dirname(outSnap), { recursive: true });
      fs.copyFileSync(snapAbs, outSnap);
      console.log(`  · published sealed snapshot for retired box: landing/sealed/${sealedName}.md`);
    }
    newNotes[n.publicSlug] = { source: n.rel, files: writtenFiles };
  }

  const existed = fs.existsSync(contentAbs);
  const before = existed ? fs.readFileSync(contentAbs, "utf8") : null;
  fs.writeFileSync(contentAbs, out);
  if (!oldNotes[n.publicSlug]) added.push(n.publicSlug);
  else if (before !== out) updated.push(n.publicSlug);
}

/* ---------- remove files for notes no longer published ---------- */
const newManaged = new Set(Object.values(newNotes).flatMap((n) => n.files));
for (const slug of Object.keys(oldNotes)) {
  if (!newNotes[slug]) removed.push(slug);
}
for (const f of oldManaged) {
  if (!newManaged.has(f)) {
    const abs = path.join(CONTENT, f);
    if (fs.existsSync(abs)) fs.rmSync(abs);
  }
}

/* ---------- active-box self check: body must not leak into content/ ---------- */
for (const { note } of activeChecks) {
  const lines = normalizeBody(note.body).split("\n").map((l) => l.trim())
    .filter((l) => l.length >= 25).slice(0, 3);
  for (const line of lines) {
    const hit = grepContent(line);
    if (hit) {
      const stub = path.join(CONTENT, `${note.section}/${note.slugField}.md`);
      if (fs.existsSync(stub)) fs.rmSync(stub);
      die(`active box body leaked into ${hit} (line: ${line.slice(0, 40)}...). stub removed.`);
    }
  }
}

/* ---------- write manifest ---------- */
manifest.version = 1;
manifest.generatedAt = new Date().toISOString();
manifest.notes = newNotes;
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

console.log(`\n✓ vault sync: ${added.length} added, ${updated.length} updated, ${removed.length} removed`);
if (added.length) console.log(`  added:   ${added.join(", ")}`);
if (updated.length) console.log(`  updated: ${updated.join(", ")}`);
if (removed.length) console.log(`  removed: ${removed.join(", ")}`);

/* ---------- tail helpers ---------- */
function fmtDate(d) {
  const dt = new Date(d);
  return isNaN(dt) ? String(d) : dt.toISOString().slice(0, 10);
}
function today() { return new Date().toISOString().slice(0, 10); }
function pickHtb(h) {
  const o = {};
  for (const k of ["os", "difficulty", "owned", "achievement"]) if (h[k] != null) o[k] = h[k];
  return o;
}
const COMMIT_URL = "https://github.com/etwale2mair/etwale2mair.github.io/commit/";
function stubBody(sealed) {
  const line = sealed.commit
    ? `sealed on ${sealed.date} ([timestamp proof](${COMMIT_URL}${sealed.commit})) · sha256 \`${sealed.hash}\``
    : `sealed ${sealed.date} · sha256 \`${sealed.hash}\``;
  return `\n> [!info] still active\n> this box is still active on Hack The Box. the writeup goes public when it retires.\n\n${line}\n\nthe full writeup is already written and its hash is published above. when the box retires, the exact file goes public and anyone can check it matches with \`sha256sum\`. the hash cannot change after this point, so the published date is a real commitment.\n`;
}
function grepContent(line) {
  const stack = [CONTENT];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) { stack.push(abs); continue; }
      if (!e.name.endsWith(".md")) continue;
      const txt = fs.readFileSync(abs, "utf8");
      if (txt.includes(line)) return path.relative(CONTENT, abs);
    }
  }
  return null;
}
