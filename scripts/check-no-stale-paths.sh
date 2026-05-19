#!/usr/bin/env bash
# Wave 8 D1 — citation-rot CI gate.
# Asserts that the RESTRUCTURE-2026-04-30 stale paths do not appear in
# canonical (non-archive, non-meta) docs. Failures point at the codemod
# at scripts/codemod-restructure-2026-04-30.mjs.

set -euo pipefail

# Files that ARE allowed to contain the stale strings (mapping table,
# verifier docs, plan rows that describe the rot itself, replit.md
# historical sprint blocks per §15.11.10).
ALLOW=(
  "replit.md"
  "docs/03_PRYZM3/03-CURRENT-STATE.md"
  "docs/03_PRYZM3/04-PLAN-FORWARD/02-WAVE-1-TRIPWIRES.md"
  "docs/03_PRYZM3/04-PLAN-FORWARD/10-VERIFIERS-CATALOG.md"
  "docs/03_PRYZM3/04-PLAN-FORWARD/11-PACKAGE-POPULATION-GAP.md"
  "scripts/codemod-restructure-2026-04-30.mjs"
  "scripts/check-no-stale-paths.sh"
)

# Build glob exclusions: archive/ + the allowlist above.
EXCLUDES=(
  "-g" "!docs/03_PRYZM3/archive/**"
  "-g" "!node_modules/**"
  "-g" "!.local/**"
  "-g" "!attached_assets/**"
  "-g" "!dist/**"
  "-g" "!build/**"
)
for f in "${ALLOW[@]}"; do EXCLUDES+=("-g" "!$f"); done

PATTERN='00_NEW_ARCHITECTURE/'
COUNT=$(rg -c "$PATTERN" --type md "${EXCLUDES[@]}" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')

if [ "$COUNT" -ne 0 ]; then
  echo "[FAIL] check-no-stale-paths: $COUNT reaches to $PATTERN remain in canonical docs."
  echo ""
  echo "Run the codemod:"
  echo "  node scripts/codemod-restructure-2026-04-30.mjs"
  echo ""
  echo "First 20 offenders:"
  rg -n "$PATTERN" --type md "${EXCLUDES[@]}" 2>/dev/null | head -20
  exit 1
fi

echo "[PASS] check-no-stale-paths: 0 reaches to $PATTERN in canonical docs."
exit 0
