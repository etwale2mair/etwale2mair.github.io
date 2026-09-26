// Builds writeups.json for the landing page from Quartz's content index
// plus each note's frontmatter (date, description, tags).
// usage: node scripts/gen-writeups-index.mjs <quartzOutDir> <outFile>
import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"

const [outDir, outFile] = process.argv.slice(2)
const index = JSON.parse(fs.readFileSync(path.join(outDir, "static/contentIndex.json"), "utf8"))

const items = []
for (const [slug, entry] of Object.entries(index)) {
  const file = entry.filePath
  if (!file || !file.endsWith(".md")) continue
  if (slug === "index" || slug.endsWith("/index") || slug.startsWith("tags/")) continue

  const raw = fs.readFileSync(path.join("content", file), "utf8")
  const m = raw.match(/^---\n([\s\S]*?)\n---/)
  const fm = m ? YAML.parse(m[1]) ?? {} : {}
  if (fm.draft) continue

  items.push({
    slug,
    title: fm.title ?? entry.title,
    description: fm.description ?? "",
    tags: fm.tags ?? [],
    date: fm.date ? new Date(fm.date).toISOString().slice(0, 10) : null,
    section: file.split("/")[0].replace(/\.md$/, ""),
  })
}

items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
fs.writeFileSync(outFile, JSON.stringify({ count: items.length, items }, null, 2))
console.log(`writeups.json: ${items.length} writeups`)
