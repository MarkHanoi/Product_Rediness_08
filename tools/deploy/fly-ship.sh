#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fly-ship.sh — the whole manual Fly path as ONE command: gate → deploy → prove.
#
# §6.10 of docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md, executed rather than
# re-derived. Written 2026-09-09 because the manual path is currently the ONLY
# path — CI is red across six jobs, so `deploy-fly.yml`'s §L-540-CI-GATE refuses
# every SHA — and a nine-lane fleet is landing commits that each need shipping.
# Re-deriving the recipe per deploy is how a step gets skipped.
#
#   usage: tools/deploy/fly-ship.sh [<sha>]        # default: origin/main
#          SKIP_TSC=1 tools/deploy/fly-ship.sh     # only when tsc was JUST run green
#
# ⛔ THIS SCRIPT DOES NOT REPLACE THE CONTRACT, AND IT IS NOT A LICENCE TO STOP
#    READING IT. It automates the steps whose ORDER and FLAGS are settled. Every
#    novel failure still goes back to the contract, and §6.8.1 still applies:
#    grep for the FIRST error, never the last — the trailing line lies.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO_MAIN='C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08'
TREE='/c/pryzm-deploy/tree'
BUILDER_APP='fly-builder-misty-bird-965'
BUILDER_MACHINE='e82d10e1bd7528'

# ── §6.10.2 — flyctl cannot read ~/.fly/config.yml from a sandboxed shell and
#    reports "no access token available" over a PERFECTLY VALID token. That is
#    NOT an expired login; `flyctl auth login` is the wrong response and costs a
#    browser round-trip. Hand the existing token over explicitly.
#    ⚠ `tr -d '\r'` is load-bearing on Windows: a trailing CR makes the header
#      malformed and the failure reads exactly like a bad token.
export FLY_API_TOKEN="$(awk -F': ' '/^access_token:/{print $2}' "$HOME/.fly/config.yml" | tr -d '\r')"
# ── §6.5.6 / §6.7.2 — Docker Desktop actively BREAKS `--remote-only`; the config
#    path must be WINDOWS-shaped.
export DOCKER_CONFIG='C:/pryzm-deploy/empty-docker-config'
export PATH="$HOME/.fly/bin:$PATH"
unset DOCKER_HOST
# ⛔ NO `MSYS_NO_PATHCONV=1`. §6.6.1: the script defends itself now and the export
#    BREAKS its own `curl -o` (exit 23). §6.5.2's advice is STALE. Do not restore it.

SHA_IN="${1:-}"
say() { echo "[ship] $*"; }
die() { echo "[ship] ⛔ $*" >&2; exit 1; }

# ── 1 · resolve the SHA ──────────────────────────────────────────────────────
git -C "$REPO_MAIN" fetch origin --quiet 2>/dev/null || true
if [ -z "$SHA_IN" ]; then
  SHA="$(git -C "$REPO_MAIN" rev-parse origin/main)"
else
  SHA="$(git -C "$REPO_MAIN" rev-parse "$SHA_IN")"
fi
SHORT="$(git -C "$REPO_MAIN" rev-parse --short "$SHA")"
LOG="/c/pryzm-deploy/deploy-$SHORT.log"

LIVE="$(curl -s --max-time 30 https://pryzm.fly.dev/version | sed -n 's/.*"git_sha":"\([0-9a-f]*\)".*/\1/p')"
say "target $SHORT  ·  live ${LIVE:0:8}"
[ "${LIVE:0:8}" = "$SHORT" ] && { say "already live — nothing to do"; exit 0; }

# ── 2 · §6.9.2 — the context is the WORKING TREE, not the commit ─────────────
# The Dockerfile does `COPY . .` and GIT_SHA only LABELS the image. Deploying
# from the main tree with lanes mid-flight ships half-finished features under a
# SHA containing none of them — and the bundle proof PASSES, because it checks
# the SHA and the four inlined values, never whether the tree was clean.
say "checking out $SHORT into the detached deploy worktree"
git -C "$TREE" fetch origin --quiet 2>/dev/null || true
git -C "$TREE" checkout --detach "$SHA" --quiet || die "checkout failed"
DIRTY="$(git -C "$TREE" status --porcelain | wc -l)"
[ "$DIRTY" = "0" ] || die "deploy worktree DIRTY ($DIRTY files) — §6.9.2 forbids shipping it"
say "worktree clean at $(git -C "$TREE" rev-parse --short HEAD)"

# ── 3 · the gate cover. CI is red, so this local run is the ONLY gate. ───────
if [ "${SKIP_TSC:-0}" = "1" ]; then
  say "⚠ SKIP_TSC=1 — type-check cover NOT RUN for this deploy (recorded, not hidden)"
else
  say "root tsc (the only gate while CI is red)…"
  # ⛔ RC captured as the FIRST element of the pipe. A trailing `tail`/`grep`
  #    swallows tsc's exit code and reports a FALSE GREEN — that exact mistake
  #    was made on 2026-09-09 and hid 11 real type errors.
  ( cd "$TREE" && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --skipLibCheck ) > /tmp/ship-tsc.log 2>&1
  TSC_RC=$?
  if [ "$TSC_RC" != "0" ]; then
    echo "── first errors ──" >&2; grep -m 10 "error TS" /tmp/ship-tsc.log >&2
    die "root tsc RC=$TSC_RC — Fly WILL hard-fail. Fix before shipping."
  fi
  say "root tsc RC=0, 0 errors"
fi

# ── 4 · §5.3 rollback target, captured BEFORE deploying ─────────────────────
say "rollback target (§5.3):"
flyctl releases -a pryzm 2>&1 | head -3 | sed 's/^/[ship]   /'

# ── 5 · §2.1 builder ≥16 GB, and §6.6.2 — it gets REAPED and recreated at 8 GB
BUILDER_LINE="$(flyctl apps list 2>/dev/null | grep -i builder | head -1)"
if [ -z "$BUILDER_LINE" ]; then
  say "⚠ no builder app listed — Fly will create one; it may come up at 8 GB (§6.6.2)"
else
  SIZE="$(flyctl machine list -a "$BUILDER_APP" 2>/dev/null | grep -o 'shared-cpu-[0-9]*x:[0-9]*MB' | head -1)"
  say "builder $BUILDER_APP  size=${SIZE:-unknown}"
  case "$SIZE" in
    *:163[0-9][0-9]MB|*:1638[0-9]MB|*:[2-9][0-9][0-9][0-9][0-9]MB) : ;;
    *) say "⚠ builder is NOT 16384MB — §2.1 wants a resize: flyctl machine update $BUILDER_MACHINE --vm-memory 16384 -a $BUILDER_APP" ;;
  esac
  # §6.5.10 — warming has succeeded on every attempt since §6.9.5. Five-plus data
  # points, NOT evidence the §6.5.9 flake is fixed. Cheap either way.
  flyctl machine start "$BUILDER_MACHINE" -a "$BUILDER_APP" >/dev/null 2>&1 || true
fi

# ── 6 · deploy ───────────────────────────────────────────────────────────────
say "deploying (expect ~15 min: ~7 min context upload at ~280 KB/s, then build)"
bash "$TREE/tools/deploy/fly-manual-deploy.sh" 2>&1 | tee "$LOG"
RC=${PIPESTATUS[0]}
if [ "$RC" != "0" ]; then
  echo "── FIRST error in the log (§6.8.1: the trailing line lies) ──" >&2
  grep -m 5 -iE "error|failed|refus" "$LOG" >&2
  die "deploy RC=$RC — see $LOG"
fi

# ── 7 · §5 bundle proof — MANDATORY. §L-570-BUNDLE-PROOF does NOT run here. ──
say "bundle proof (§5) — mandatory, this path has no CI equivalent"
bash "$TREE/tools/deploy/fly-bundle-proof.sh" 2>&1 | tee -a "$LOG" | sed 's/^/[ship]   /'
PROOF=${PIPESTATUS[0]}
[ "$PROOF" = "0" ] || die "BUNDLE PROOF FAILED — roll back, do not retry (§5): flyctl deploy --image registry.fly.io/pryzm:<prev-tag> -a pryzm"

NOW="$(curl -s --max-time 30 https://pryzm.fly.dev/version)"
say "live now: $NOW"
case "$NOW" in
  *"$SHA"*) say "✅ SHIPPED AND PROVEN — $SHORT is live" ;;
  *) die "served /version does not name $SHORT — investigate before claiming success" ;;
esac
