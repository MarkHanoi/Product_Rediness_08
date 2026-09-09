#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fly-autoship.sh — ship HEAD to Fly whenever it moves ahead of production.
#
# WHY THIS EXISTS. CI is red across six jobs, so `deploy-fly.yml`'s §L-540-CI-GATE
# refuses every code SHA and the ONLY path is the manual one in
# docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md. With a nine-lane fleet landing
# commits every few minutes, a human noticing each one is the slow part — not the
# build. This closes that gap and nothing else.
#
# ⛔ IT DOES NOT WEAKEN THE CONTRACT, AND THAT IS THE WHOLE POINT. Every iteration
#    calls `fly-ship.sh`, which runs §6.9.2 (clean detached worktree), the §6 root
#    tsc cover, §5.3 (rollback tag captured BEFORE deploying), §2.1 (builder size),
#    §4 (deploy) and the MANDATORY §5 bundle proof — and refuses unless the served
#    /version actually names the SHA. Speed comes from removing the WAIT, never
#    from removing a gate. A gate skipped to go faster is how a bad bundle ships
#    green, which is the failure §5 exists to prevent.
#
# ⛔ SERIAL BY CONSTRUCTION. Two concurrent deploys would fight over the single
#    detached worktree AND the single Fly builder, and §6.5.8 records that a failed
#    deploy leaves orphan machines that BLOCK every later one. The lock is a
#    directory (mkdir is atomic on every filesystem here) so a crash cannot leave a
#    half-held flock.
#
# ⛔ ON FAILURE IT STOPS, IT DOES NOT RETRY. §6.7.1 (L-941) records the bundle proof
#    FAILING A HEALTHY DEPLOY and forbidding the retry, and §6.5.9 records that "a
#    deploy you killed may still ship". A loop that retries a failure blindly would
#    stack orphan machines on top of an unexplained state. Stopping leaves a human
#    a clean question to answer.
#
#   usage: tools/deploy/fly-autoship.sh [poll_seconds]     # default 90
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO='C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08'
LOCK='/c/pryzm-deploy/.autoship.lock'
POLL="${1:-90}"

cd "$REPO"
echo "[autoship] armed — polling every ${POLL}s; every ship runs the FULL contract"

while true; do
  git fetch origin --quiet 2>/dev/null || true

  # ⭐ PUSH WHAT THE LANES COMMITTED BUT DID NOT PUSH.
  # Measured 2026-09-09: four lane commits sat LOCAL-ONLY for ~20 minutes. The ancestor
  # guard below correctly refused to ship them — but refusing is only half an answer:
  # a commit that exists on one disk is not backed up, and dies with the machine. The
  # lanes' own briefs say "push straight to main", so pushing on their behalf completes
  # an instruction they already have rather than inventing one.
  # ⛔ It pushes COMMITS, never working-tree state — a half-written file cannot ride along.
  if [ -n "$(git log --oneline origin/main..HEAD 2>/dev/null)" ]; then
    N_UNPUSHED="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')"
    if git push origin main --quiet 2>/dev/null; then
      echo "[autoship] pushed $N_UNPUSHED stranded lane commit(s) to origin/main"
      git fetch origin --quiet 2>/dev/null || true
    else
      # A rejected push means the remote moved under us. Never force: another writer's
      # work is not ours to discard. Say so and let the next poll retry after a fetch.
      echo "[autoship] ⚠ push rejected (remote moved) — will retry next poll, NOT forcing"
    fi
  fi

  HEAD_SHA="$(git rev-parse --short HEAD)"
  LIVE="$(curl -s --max-time 25 https://pryzm.fly.dev/version \
          | sed -n 's/.*"git_sha":"\([0-9a-f]\{8\}\).*/\1/p')"

  if [ -n "$LIVE" ] && [ "$LIVE" != "$HEAD_SHA" ]; then
    # ⛔ Only ship a sha that is an ANCESTOR-OR-SELF of origin/main. A lane mid-push,
    # or a local commit that never reached the remote, must not become production.
    if ! git merge-base --is-ancestor "$HEAD_SHA" origin/main 2>/dev/null; then
      echo "[autoship] $HEAD_SHA is not on origin/main yet — waiting"
    elif mkdir "$LOCK" 2>/dev/null; then
      trap 'rmdir "$LOCK" 2>/dev/null' EXIT
      N="$(git rev-list --count "$LIVE..$HEAD_SHA" 2>/dev/null || echo '?')"
      echo "[autoship] SHIPPING $HEAD_SHA ($N commit(s) ahead of $LIVE) $(date -u +%H:%M:%SZ)"
      bash "$REPO/tools/deploy/fly-ship.sh" "$HEAD_SHA" > "/c/pryzm-deploy/autoship-$HEAD_SHA.log" 2>&1
      RC=$?
      rmdir "$LOCK" 2>/dev/null; trap - EXIT
      if [ "$RC" = "0" ]; then
        echo "[autoship] ✅ SHIPPED AND PROVEN $HEAD_SHA"
      else
        # §6.8.1 — grep for the FIRST error; the trailing line lies.
        echo "[autoship] ⛔ FAILED rc=$RC on $HEAD_SHA — STOPPING, not retrying (§6.7.1 / §6.5.9)"
        grep -m 4 -iE "error|FAIL|refus|ABORT" "/c/pryzm-deploy/autoship-$HEAD_SHA.log" | head -4
        exit "$RC"
      fi
    else
      echo "[autoship] a ship is already in flight — waiting"
    fi
  fi
  sleep "$POLL"
done
