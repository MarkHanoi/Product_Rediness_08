#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fly-manual-deploy.sh — deploy to Fly WITHOUT GitHub Actions.
#
# WHEN TO USE THIS: only when `.github/workflows/deploy-fly.yml` cannot run at
# all (e.g. the GitHub Actions platform outage of 2026-08-06, where runs sat
# `queued` for hours because no runner could be assigned). CI remains THE deploy
# path — see memory/fly-production-deploy.md.
#
# ⚠ WHY THIS SCRIPT EXISTS INSTEAD OF A HAND-TYPED `flyctl deploy`:
# CI passes NINE --build-arg values. A hand-composed command passes none, and
# Docker accepts a missing (or MISSPELLED) --build-arg SILENTLY, baking nothing.
# Every VITE_* value is inlined by vite AT BUILD TIME, so the result is not a
# runtime misconfiguration you can fix with `fly secrets` — it is a permanently
# degraded bundle:
#   • VITE_CESIUM_TOKEN empty      → CesiumViewport ships tokenless (no globe)
#   • VITE_GLB_URL empty           → falls back to local /items/ (404s in prod,
#                                    because public/items is .dockerignore'd)
#   • VITE_CONTEXT_TILES_URL empty → falls back to live Overpass, not R2 tiles
# §L-570-BUNDLE-PROOF catches this in CI. IT DOES NOT RUN ON A MANUAL DEPLOY,
# which is why this script fails closed and why you MUST run the post-deploy
# proof at the bottom of this file.
#
# ⚠ ARG NAMES ARE TAKEN VERBATIM FROM THE Dockerfile (L96–L123):
#       VITE_CESIUM_TOKEN        NOT VITE_CESIUM_ION_TOKEN
#       VITE_GOOGLE_MAPS_KEY     NOT VITE_GOOGLE_MAPS_API_KEY
# The plausible-looking wrong names are the exact trap this script prevents.
#
# HOW THE SECRETS ARE RECOVERED WITHOUT REPO-SECRET ACCESS:
# The four VITE_* values are inlined by vite into the DEPLOYED bundle and served
# publicly to every browser. So the currently-live bundle IS the source of truth
# for what production runs. We fetch assets/main-*.js from the live site and read
# them back. This reproduces production exactly rather than guessing, and needs
# no access to the ion dashboard, the GCP console, or the repo secrets.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP="${FLY_APP:-pryzm}"
SITE="${PRYZM_SITE:-https://pryzm.fly.dev}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$REPO_ROOT"

echo "→ recovering build-args from the LIVE bundle at $SITE"
curl -fsS --max-time 60 "$SITE/" -o "$WORK/index.html"
CHUNK="$(grep -oE 'assets/main-[A-Za-z0-9_-]+\.js' "$WORK/index.html" | head -1)"
if [ -z "$CHUNK" ]; then
  echo "ABORT: could not find assets/main-*.js in $SITE/ — is the site up?" >&2
  exit 1
fi
curl -fsS --max-time 120 "$SITE/$CHUNK" -o "$WORK/main.js"

read_arg() {
  node -e '
    const fs = require("fs");
    const s = fs.readFileSync(process.argv[1], "utf8");
    const m = s.match(new RegExp(process.argv[2] + ":\"([^\"]*)\""));
    process.stdout.write(m ? m[1] : "");
  ' "$WORK/main.js" "$1"
}

CESIUM="$(read_arg VITE_CESIUM_TOKEN)"
GOOGLE="$(read_arg VITE_GOOGLE_MAPS_KEY)"
GLB="$(read_arg VITE_GLB_URL)"
TILES="$(read_arg VITE_CONTEXT_TILES_URL)"

# §DEPLOY-ARG-OVERRIDE (L-776) — recovery-from-the-live-bundle is the DEFAULT, not a
# law. An ENV value of the same name wins.
#
# ⚠ WHY THIS EXISTS. Recovering args from the deployed bundle is what makes this
# path safe (§3.5) — but it also makes it SELF-PERPETUATING: a value that is wrong
# in production copies itself into every subsequent deploy, and there was no way to
# break the loop short of editing this script. That is exactly what happened when
# the app moved to app.pryzm.so: the recovered `VITE_CONTEXT_TILES_URL` /
# `VITE_GLB_URL` point straight at the R2 bucket, whose CORS allowlist names only
# the OLD origin, so every baked tile and every GLB is refused by the browser.
#
# Overriding is deliberately explicit and LOGGED below — a silent override would be
# worse than no override, because the recovered value is the thing everyone trusts.
[ -n "${VITE_CESIUM_TOKEN:-}" ]      && CESIUM="$VITE_CESIUM_TOKEN"      && echo "  ⚠ OVERRIDE: VITE_CESIUM_TOKEN from env"
[ -n "${VITE_GOOGLE_MAPS_KEY:-}" ]   && GOOGLE="$VITE_GOOGLE_MAPS_KEY"   && echo "  ⚠ OVERRIDE: VITE_GOOGLE_MAPS_KEY from env"
[ -n "${VITE_GLB_URL:-}" ]           && GLB="$VITE_GLB_URL"              && echo "  ⚠ OVERRIDE: VITE_GLB_URL from env = '$VITE_GLB_URL'"
[ -n "${VITE_CONTEXT_TILES_URL:-}" ] && TILES="$VITE_CONTEXT_TILES_URL"  && echo "  ⚠ OVERRIDE: VITE_CONTEXT_TILES_URL from env = '$VITE_CONTEXT_TILES_URL'"

# §DEPLOY-ARG-SAME-ORIGIN (L-776b) — accept a same-origin base WITHOUT a leading
# slash, and add the slash here.
#
# ⚠ WHY THIS EXISTS AND WHY THE OBVIOUS FIX IS WRONG. Git Bash (MSYS) rewrites any
# argument that looks like an absolute POSIX path into a Windows path before a
# NATIVE binary sees it. Passing `VITE_GLB_URL=/api/catalog/items/` to `flyctl`
# therefore baked **'C:/Program Files/Git/api/catalog/items/'** into the production
# bundle — caught by fly-bundle-proof.sh, which earned its keep.
#
# The obvious fix, `MSYS_NO_PATHCONV=1`, is WORSE: this script's own `curl -o
# "$WORK/main.js"` RELIES on that conversion to turn the mktemp POSIX path into
# something curl.exe can write. Disabling it globally made arg-recovery die with
# `curl: (23) client returned ERROR on write` before the build even started. A
# global switch to fix one argument broke a different one — twice.
#
# So the values are passed slash-LESS (`api/context-tiles/`), which MSYS leaves
# alone because it is not an absolute path, and the slash is restored here where no
# shell can touch it. Absolute `https://…` values are untouched.
case "$GLB"   in api/*) GLB="/$GLB"     && echo "  ↳ same-origin base normalised: $GLB" ;; esac
case "$TILES" in api/*) TILES="/$TILES" && echo "  ↳ same-origin base normalised: $TILES" ;; esac

# FAIL CLOSED. Never ship a degraded bundle just because extraction came back
# empty — an empty value here is indistinguishable in the build from "not passed".
if [ -z "$CESIUM" ] || [ -z "$GOOGLE" ] || [ -z "$GLB" ] || [ -z "$TILES" ]; then
  echo "ABORT: a build-arg is EMPTY — refusing to ship a degraded bundle." >&2
  echo "  cesium:${#CESIUM} google:${#GOOGLE} glb:${#GLB} tiles:${#TILES}" >&2
  exit 1
fi

# ── §MSYS-PATHCONV — belt to the slash-less brace above.
#
# The prevention lives in the slash-LESS passing documented above; that is the
# correct fix and it is load-bearing. An earlier attempt in this session used
# `export MSYS_NO_PATHCONV=1` instead — which the block above already warns is
# WORSE, and it proved it: the script aborted at `curl: (23) client returned ERROR
# on write` before the build started, because curl -o RELIES on that conversion.
# Those exports have been REMOVED. Do not reintroduce them.
#
# What remains is the check that was actually missing when the bug shipped: the
# guard above only asked "is it non-empty?", and 39 characters of mangled Windows
# path passes that test. A LENGTH CHECK IS NOT A VALUE CHECK.
for pair in "VITE_GLB_URL=$GLB" "VITE_CONTEXT_TILES_URL=$TILES"; do
  name="${pair%%=*}"; val="${pair#*=}"
  case "$val" in
    /*|http://*|https://*) ;;   # root-relative or absolute URL — correct
    *) echo "ABORT: $name = '$val' is neither root-relative nor an absolute URL." >&2
       echo "  This is the MSYS2 path-conversion bug (§MSYS-PATHCONV): a value like" >&2
       echo "  api/... was rewritten to a local Windows path. Do NOT 'fix' this" >&2
       echo "  with MSYS_NO_PATHCONV=1 — see the block above, it breaks curl -o." >&2
       echo "  Pass the value SLASH-LESS (api/catalog/items/) so MSYS leaves it" >&2
       echo "  alone, or run from PowerShell." >&2
       exit 1 ;;
  esac
done

# ── §OBS-TRACING-COLLECTOR (L-10300) — the BROWSER half of the tracing switch ──
#
# 346 of the repo's 347 `trace.getTracer()` sites are in the browser, and the
# browser flag is INLINED BY VITE AT BUILD TIME (C10 §2.6.1) — so it is a
# --build-arg, exactly like the four above, and NOT something `fly secrets` can
# repair afterwards. The server half is a runtime secret instead; see fly.toml.
#
# ⛔ THIS BLOCK IS ADDITIVE AND CANNOT BREAK THE EXISTING FOUR. It runs AFTER
# their fail-closed guard, reads only its own variables, and every one of them
# defaults EMPTY. Empty is OFF **by construction**: `vite.config.ts`'s `pick()`
# requires `v.length > 0`, so an empty value bakes the JS literal `undefined`,
# `typeof __PRYZM_TRACING__ === 'undefined'` folds to the OFF branch, and the
# tracing path is dead-code-eliminated. That is deliberately UNLIKE VITE_GLB_URL,
# where empty is a cliff — which is why these are NOT added to the abort above.
#
# ⛔ AND THEY ARE NOT RECOVERED FROM THE LIVE BUNDLE, on purpose. Recovery is
# what makes §3.5 safe for the four, but it is also SELF-PERPETUATING (§L-776):
# once traced, every later deploy would silently keep tracing on and keep paying
# for it. Tracing is opt-in per deploy, from the environment, or it is off.
#
#   VITE_PRYZM_TRACING=console  tools/deploy/fly-manual-deploy.sh
#   VITE_PRYZM_TRACING=otlp VITE_OTEL_EXPORTER_OTLP_ENDPOINT=https://… \
#     VITE_PRYZM_TRACING_SAMPLE=0.05  tools/deploy/fly-manual-deploy.sh
TRACING="${VITE_PRYZM_TRACING:-}"
TRACING_SAMPLE="${VITE_PRYZM_TRACING_SAMPLE:-}"
TRACING_ENDPOINT="${VITE_OTEL_EXPORTER_OTLP_ENDPOINT:-}"

# FAIL CLOSED, but ONLY on a mode that was explicitly asked for. `initTracing()`
# already refuses an endpoint-less OTLP at runtime — but it would do so in a
# bundle that took ~25 minutes to build and ship (§4.2). Catching it here costs
# nothing and saves the whole round trip. Empty TRACING skips this entirely.
case "$TRACING" in
  ""|off) ;;
  console)
    echo "  ⚠ TRACING: console — spans go to the browser console. Debug builds only." ;;
  otlp|1|true|on)
    if [ -z "$TRACING_ENDPOINT" ]; then
      echo "ABORT: VITE_PRYZM_TRACING='$TRACING' asks for OTLP export but" >&2
      echo "  VITE_OTEL_EXPORTER_OTLP_ENDPOINT is empty. The built bundle would REFUSE" >&2
      echo "  at boot (C10 §2.6.2) — a 25-minute deploy that ships tracing-off anyway." >&2
      echo "  Set the endpoint, or use VITE_PRYZM_TRACING=console." >&2
      exit 1
    fi
    case "$TRACING_ENDPOINT" in
      http://*|https://*) ;;
      *) echo "ABORT: VITE_OTEL_EXPORTER_OTLP_ENDPOINT='$TRACING_ENDPOINT' is not an" >&2
         echo "  absolute URL. The browser posts to it cross-origin; it must be a" >&2
         echo "  publicly addressable, CORS-enabled ingest URL. (If this looks like a" >&2
         echo "  Windows path, see §MSYS-PATHCONV above.)" >&2
         exit 1 ;;
    esac
    echo "  ⚠ TRACING: otlp → $TRACING_ENDPOINT (PUBLIC — baked into the bundle)" ;;
  *)
    echo "ABORT: VITE_PRYZM_TRACING='$TRACING' is not a recognised mode." >&2
    echo "  Use: console | otlp | (empty = off).  A value the runtime does not" >&2
    echo "  recognise parses to OFF, which would ship a bundle you believe is traced." >&2
    exit 1 ;;
esac

GIT_SHA="$(git rev-parse HEAD)"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Mirrors CI's audit line. Lengths only — never echo the token or the key.
echo "build-arg lengths — cesium:${#CESIUM} google:${#GOOGLE}   (expect 257 / 39)"
echo "build-arg VITE_GLB_URL           = '$GLB'"
echo "build-arg VITE_CONTEXT_TILES_URL = '$TILES'"
echo "build-arg GIT_SHA=$GIT_SHA GIT_BRANCH=$GIT_BRANCH BUILT_AT=$BUILT_AT"
echo "build-arg VITE_PRYZM_TRACING     = '${TRACING:-<empty → tracing OFF>}'"

# --depot=false forces the LEGACY builder app, which (unlike the managed/Depot
# builder) can be resized. fly-builder-autumn-headland-88 was raised to 16GB on
# 2026-08-06 because the vite build peaks ~6GB and OOM-killed an 8GB builder.
# §MSYS-ARG-EXCL — disable the conversion for THIS COMMAND ONLY.
# The slash restored above is re-mangled the moment it crosses into flyctl.exe,
# which is why v1246 AND v1247 both shipped 'C:/Program Files/Git/api/...' even
# with a correct slash-less override: the shell VARIABLE was right and the
# ARGUMENT was still rewritten. A global export fixes the argument but breaks
# curl -o above (proved: curl 23). A per-command prefix fixes the argument
# without touching any other process in this script.
MSYS2_ARG_CONV_EXCL='*' MSYS_NO_PATHCONV=1 \
flyctl deploy --depot=false --remote-only -a "$APP" --yes \
  --build-arg LOWMEM=0 \
  --build-arg VITE_CESIUM_TOKEN="$CESIUM" \
  --build-arg VITE_GOOGLE_MAPS_KEY="$GOOGLE" \
  --build-arg VITE_GLB_URL="$GLB" \
  --build-arg VITE_CONTEXT_TILES_URL="$TILES" \
  --build-arg GIT_SHA="$GIT_SHA" \
  --build-arg GIT_BRANCH="$GIT_BRANCH" \
  --build-arg BUILT_AT="$BUILT_AT" \
  --build-arg RUN_NUMBER=manual \
  --build-arg VITE_PRYZM_TRACING="$TRACING" \
  --build-arg VITE_PRYZM_TRACING_SAMPLE="$TRACING_SAMPLE" \
  --build-arg VITE_OTEL_EXPORTER_OTLP_ENDPOINT="$TRACING_ENDPOINT"

cat <<'PROOF'

──────────────────────────────────────────────────────────────────────────────
POST-DEPLOY BUNDLE PROOF — MANDATORY. §L-570-BUNDLE-PROOF does NOT run here.
Run tools/deploy/fly-bundle-proof.sh, or by hand:

  curl -s https://pryzm.fly.dev/ | grep -oE 'assets/main-[A-Za-z0-9_-]+\.js'
      → MUST differ from the pre-deploy filename; if identical, the old bundle
        is still being served and the deploy did not take effect.
  Fetch that chunk and confirm all four inlined values are present:
      VITE_CESIUM_TOKEN len 257, VITE_GOOGLE_MAPS_KEY len 39,
      VITE_GLB_URL .../items/, VITE_CONTEXT_TILES_URL .../tiles/
  curl -s https://pryzm.fly.dev/api/health/live

ANY failure ⇒ roll back immediately, do not retry:
  flyctl deploy --image registry.fly.io/pryzm:<previous-deployment-tag> -a pryzm
  (read the tag from `flyctl machines list -a pryzm` BEFORE deploying)
──────────────────────────────────────────────────────────────────────────────
PROOF
