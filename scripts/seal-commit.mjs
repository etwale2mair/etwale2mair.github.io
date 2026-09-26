// After a commit that first adds an active-box stub, record the commit sha as
// the sealed timestamp proof. Sets manifest sealed.commit = HEAD for any note
// whose commit is still null. Prints whether a re-sync is needed to bake the
// link into the stub body. No-op when there are no active boxes.
import fs from "node:fs";
import { execSync } from "node:child_process";

const MANIFEST = "content/.vault-sync.json";
if (!fs.existsSync(MANIFEST)) process.exit(0);
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const head = execSync("git rev-parse HEAD").toString().trim();

let changed = 0;
for (const note of Object.values(manifest.notes || {})) {
  if (note.sealed && note.sealed.commit == null) { note.sealed.commit = head; changed += 1; }
}
if (changed) {
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`sealed ${changed} commit link(s) at ${head.slice(0, 8)}; re-run sync to bake into stubs`);
  process.exit(10); // signal to publish.sh that a follow-up sync/commit is worthwhile
}
process.exit(0);
