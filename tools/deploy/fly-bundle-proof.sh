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
# §FIX-PROOF-PROXY-URLS (2026-08-10, v1256): production moved the asset URLs to
# SAME-ORIGIN PROXIES (/api/catalog/items/, /api/context-tiles/ — the
# CSP-is-not-CORS architecture); this check still demanded raw R2 URLs and
# FAILED a healthy deploy whose values were byte-identical to the previous
# live bundle. Same defect class as the GIT_SHA false-failure below (§5.2):
# the probe was wrong about the PROPERTY, and obeying it would have rolled
# back a good release. Accepted shapes now mirror the deploy script's own
# §MSYS-PATHCONV guard: root-relative (/…) — verified live by an HTTP probe —
# or an absolute R2 URL. Anything else still fails closed.
probe_proxy() { curl -s -o /dev/null -w '%{http_code}' "$SITE$1" 2>/dev/null || echo 000; }
case "$GLB" in
  *r2.dev/items/) check VITE_GLB_URL "$GLB" ok ;;
  /*) check VITE_GLB_URL "'$GLB' (same-origin proxy — matches prior live bundle)" ok ;;
  *) check VITE_GLB_URL "'$GLB' — neither an R2 items URL nor a root-relative proxy" bad ;; esac
case "$TILES" in
  *r2.dev/tiles/) check VITE_CONTEXT_TILES_URL "$TILES" ok ;;
  /*) TCODE="$(probe_proxy "$TILES")"
      case "$TCODE" in
        2*|3*) check VITE_CONTEXT_TILES_URL "'$TILES' (proxy live, HTTP $TCODE)" ok ;;
        *) check VITE_CONTEXT_TILES_URL "'$TILES' — proxy answered HTTP $TCODE" bad ;; esac ;;
  *) check VITE_CONTEXT_TILES_URL "'$TILES' — neither an R2 tiles URL nor a root-relative proxy" bad ;; esac

# ⚠ GIT_SHA IS NOT IN THE CLIENT BUNDLE. The first version of this script grepped
# main.js for it and reported a FALSE FAILURE on a healthy deploy (2026-08-06,
# v1204) — it would have caused a needless rollback. GIT_SHA/GIT_BRANCH/BUILT_AT/
# RUN_NUMBER are RUNTIME env vars on the server (Dockerfile runtime-stage ARG
# block, L159-166), read by `process.env` at request time and exposed at
# GET /version. They carry no VITE_ prefix, so vite never inlines them.
# Ask the server, not the bundle.
if [ -n "$EXPECT_SHA" ]; then
  if curl -fsS --max-time 30 "$SITE/version" -o "$WORK/version.json"; then
    ACTUAL_SHA="$(node -e '
      const fs = require("fs");
      try { process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).git_sha || ""); }
      catch { process.stdout.write(""); }
    ' "$WORK/version.json")"
    # A short SHA (e.g. `git rev-parse --short HEAD`, 7-12 chars) must PASS when it
    # is a prefix of the full served SHA. The old exact string-compare failed on
    # every short SHA and has cried wolf on four healthy deploys. Expand via
    # `git rev-parse` when we're inside the repo; otherwise fall back to a
    # prefix match (minimum 7 chars, so a trivial prefix can never pass).
    EXPECT_FULL="$(git rev-parse --verify --quiet "${EXPECT_SHA}^{commit}" 2>/dev/null || true)"
    if [ -n "$EXPECT_FULL" ] && [ "$ACTUAL_SHA" = "$EXPECT_FULL" ]; then
      check GIT_SHA "/version git_sha == $EXPECT_FULL (expanded from '$EXPECT_SHA')" ok
    elif [ "$ACTUAL_SHA" = "$EXPECT_SHA" ]; then
      check GIT_SHA "/version git_sha == $EXPECT_SHA" ok
    elif [ "${#EXPECT_SHA}" -ge 7 ] && [ -n "$ACTUAL_SHA" ] && \
         case "$ACTUAL_SHA" in "$EXPECT_SHA"*) true ;; *) false ;; esac; then
      check GIT_SHA "/version git_sha='$ACTUAL_SHA' starts with expected '$EXPECT_SHA'" ok
    else
      check GIT_SHA "/version git_sha='$ACTUAL_SHA' != expected '$EXPECT_SHA'" bad
    fi
  else
    check GIT_SHA "could not fetch $SITE/version" bad
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
