// Scan content/ for anything the denylist forbids. Fails loudly.
// usage: node scripts/leak-check.mjs [--content-dir DIR]
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const i = args.indexOf("--content-dir");
const CONTENT = i >= 0 && args[i + 1] ? args[i + 1] : "content";
const DENYLIST = "scripts/publish-denylist.txt";

if (!fs.existsSync(DENYLIST)) {
  console.error(`✗ leak check: missing ${DENYLIST}`);
  process.exit(1);
}
const patterns = fs.readFileSync(DENYLIST, "utf8").split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((src) => {
    try { return { src, re: new RegExp(src, "i") }; }
    catch (e) { console.error(`✗ bad regex in denylist: ${src} (${e.message})`); process.exit(1); }
  });

const TEXT = /\.(md|json|txt|html|css|js|svg|xml)$/i;
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (TEXT.test(e.name)) out.push(abs);
  }
  return out;
}

let hits = 0;
for (const file of walk(CONTENT)) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, n) => {
    for (const { src, re } of patterns) {
      if (re.test(line)) {
        console.error(`  ✗ ${path.relative(CONTENT, file)}:${n + 1}  matches /${src}/`);
        hits += 1;
      }
    }
  });
}

if (hits) {
  console.error(`\n✗ leak check failed: ${hits} match(es). nothing built or committed.\n`);
  process.exit(1);
}
console.log("✓ leak check passed");
