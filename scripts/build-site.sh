#!/usr/bin/env bash
# Local build: Quartz under /writeups + hand-made landing at root -> ./public
set -euo pipefail
cd "$(dirname "$0")/.."

npx quartz build -o public/writeups
node scripts/gen-writeups-index.mjs public/writeups landing/writeups.json
cp landing/index.html landing/style.css landing/app.js landing/writeups.json landing/cv.pdf public/
mkdir -p public/data
cp landing/data/profile.json public/data/profile.json

echo "built ./public  (open with: npx serve public  or  python3 -m http.server -d public)"
