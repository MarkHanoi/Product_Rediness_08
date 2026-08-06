#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fly-bundle-proof.sh — the local stand-in for §L-570-BUNDLE-PROOF.
#
# CI verifies that the VITE_* build-args actually made it into the shipped
# bundle. That job does NOT run on a manual `flyctl deploy`, so this script is
# the only thing standing between a hand-run deploy and a silently degraded
# production bundle (tokenless Cesium, /items/ 404s, live-Overpass tiles).
#
# Usage:  tools/deploy/fly-bundle-proof.sh [expected-git-sha]
# Exit 0 = bundle is good. Exit 1 = ROLL BACK, do not retry.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

SITE="${PRYZM_SITE:-https://pryzm.fly.dev}"
EXPECT_SHA="${1:-}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fail=0

echo "→ bundle proof against $SITE"

if ! curl -fsS --max-time 60 "$SITE/" -o "$WORK/index.html"; then
  echo "FAIL: could not fetch $SITE/" >&2
  exit 1
fi

CHUNK="$(grep -oE 'assets/main-[A-Za-z0-9_-]+\.js' "$WORK/index.html" | head -1)"
echo "  served chunk: ${CHUNK:-<none>}"
if [ -z "$CHUNK" ]; then
  echo "FAIL: no assets/main-*.js referenced by index.html" >&2
  exit 1
fi

curl -fsS --max-time 120 "$SITE/$CHUNK" -o "$WORK/main.js" || { echo "FAIL: chunk fetch" >&2; exit 1; }

check() { # name  expected-description  test-result
  if [ "$3" = "ok" ]; then echo "  PASS  $1 — $2"; else echo "  FAIL  $1 — $2" >&2; fail=1; fi
}

val() {
  node -e '
    const fs = require("fs");
    const s = fs.readFileSync(process.argv[1], "utf8");
    const m = s.match(new RegExp(process.argv[2] + ":\"([^\"]*)\""));
    process.stdout.write(m ? m[1] : "");
  ' "$WORK/main.js" "$1"
}

CESIUM="$(val VITE_CESIUM_TOKEN)"; GOOGLE="$(val VITE_GOOGLE_MAPS_KEY)"
GLB="$(val VITE_GLB_URL)";        TILES="$(val VITE_CONTEXT_TILES_URL)"

# Token/key: report LENGTH ONLY, never the value.
[ "${#CESIUM}" -ge 200 ] && check VITE_CESIUM_TOKEN "len=${#CESIUM} (expect 257)" ok \
                         || check VITE_CESIUM_TOKEN "len=${#CESIUM} — EMPTY/SHORT: tokenless Cesium" bad
[ "${#GOOGLE}" -ge 30 ]  && check VITE_GOOGLE_MAPS_KEY "len=${#GOOGLE} (expect 39)" ok \
                         || check VITE_GOOGLE_MAPS_KEY "len=${#GOOGLE} — EMPTY/SHORT" bad
case "$GLB"   in *r2.dev/items/) check VITE_GLB_URL "$GLB" ok ;;
                *) check VITE_GLB_URL "'$GLB' — not an R2 items URL (local /items/ 404s)" bad ;; esac
case "$TILES" in *r2.dev/tiles/) check VITE_CONTEXT_TILES_URL "$TILES" ok ;;
                *) check VITE_CONTEXT_TILES_URL "'$TILES' — not an R2 tiles URL (live Overpass)" bad ;; esac

if [ -n "$EXPECT_SHA" ]; then
  if grep -q "$EXPECT_SHA" "$WORK/main.js" || grep -q "$EXPECT_SHA" "$WORK/index.html"; then
    check GIT_SHA "$EXPECT_SHA present" ok
  else
    check GIT_SHA "$EXPECT_SHA NOT found — old bundle may still be served" bad
  fi
fi

if curl -fsS --max-time 30 "$SITE/api/health/live" -o "$WORK/live.json"; then
  echo "  PASS  /api/health/live — $(cat "$WORK/live.json" | head -c 120)"
else
  echo "  FAIL  /api/health/live did not return 200" >&2; fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo >&2
  echo "BUNDLE PROOF FAILED — ROLL BACK NOW, DO NOT RETRY:" >&2
  echo "  flyctl machines list -a pryzm      # read the PREVIOUS deployment tag" >&2
  echo "  flyctl deploy --image registry.fly.io/pryzm:<previous-tag> -a pryzm" >&2
  exit 1
fi

echo "BUNDLE PROOF PASSED."
