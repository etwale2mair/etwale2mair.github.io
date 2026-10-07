#!/usr/bin/env bash
# One command: sync from vault -> leak check -> build -> commit -> push -> watch deploy.
#   scripts/publish.sh            full publish
#   scripts/publish.sh --dry-run  sync + leak check + build, prints diff, no commit
set -euo pipefail
cd "$(dirname "$0")/.."

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

echo "== sync from vault =="
node scripts/sync-vault.mjs

echo "== leak check =="
node scripts/leak-check.mjs

echo "== build =="
bash scripts/build-site.sh >/dev/null
echo "built."

git add content/ landing/data/stats.json

if [ "$DRY" = "1" ]; then
  echo "== dry run: content diff =="
  git --no-pager diff --cached --stat content/ landing/data/stats.json || echo "(no changes)"
  git reset -q content/ landing/data/stats.json >/dev/null 2>&1 || true
  echo "dry run complete. nothing committed."
  exit 0
fi

if git diff --cached --quiet content/ landing/data/stats.json; then
  echo "no changes, nothing to publish."
  exit 0
fi

BODY=$(git diff --cached --name-status content/ landing/data/stats.json)
git -c user.name="etwale2mair" -c user.email="duylamlevo.paris@gmail.com" \
  commit -q -m "content: sync from vault" -m "$BODY" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main

# record the sealing commit for any new active-box stub, then re-sync so the
# stub body carries the proof link (second small commit).
if node scripts/seal-commit.mjs; then :; else
  if [ "$?" = "10" ]; then
    node scripts/sync-vault.mjs >/dev/null
    git add content/
    if ! git diff --cached --quiet content/; then
      git -c user.name="etwale2mair" -c user.email="duylamlevo.paris@gmail.com" \
        commit -q -m "content: seal commit links" \
        -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
      git push origin main
    fi
  fi
fi

echo "== watch deploy =="
gh run watch "$(gh run list --workflow=deploy.yaml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
echo "root: $(curl -s -o /dev/null -w '%{http_code}' https://etwale2mair.github.io/)"
