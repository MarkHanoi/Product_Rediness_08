#!/usr/bin/env bash
# wireup-baseline.sh — emit the live PRYZM 2 wireup floor as JSON.
#
# Source-of-truth implementation per
# docs/03_PRYZM3/00_NEW_ARCHITECTURE/phases/audits/PRYZM2-WIREUP-PLAN-S72/26-plan-self-corrections.md §26.3.
#
# Replaces every literal floor number sprinkled across chunks 23/24/25/26
# with a single JSON file at .local/state/replit/agent/wireup-floor.json.
# Per §26.10 (Z.10) this script also emits per-folder rAF + canvas drilldowns.
#
# Usage:
#   scripts/wireup-baseline.sh > .local/wireup-floor.json
#
# Note: chunk 26 §26.3 originally specified
# `.local/state/replit/agent/wireup-floor.json`; that path is reserved
# by the Replit platform. The floor file lives at `.local/wireup-floor.json`
# instead.
#
# Exit codes:
#   0 — JSON emitted
#   1 — required tool missing (rg, find, awk, jq)
#
# Notes:
#   - Uses `-g '*.ts' -g '*.tsx'` per §26.2 (Z.0) — `tsx` is not a built-in
#     ripgrep type and `--type=tsx` silently skips .tsx files.
#   - Counts run against working tree (does not honour .gitignore beyond rg's
#     defaults). Run from repo root.

set -uo pipefail
# Note: `set -e` deliberately omitted — the drilldown loops accept that
# `rg` exits 1 on "no matches" inside a $(...) expansion. Errors that
# matter (missing tools) are caught explicitly below.

for tool in rg find awk; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "FATAL: required tool '$tool' not found in PATH" >&2
    exit 1
  fi
done

emit() { printf '  "%s": %s,\n' "$1" "$2"; }
emit_str() { printf '  "%s": "%s",\n' "$1" "$2"; }

count_pattern_glob() {
  # $1=pattern $2..=paths to count over (.ts/.tsx only)
  local pattern="$1"; shift
  rg -c "$pattern" "$@" -g '*.ts' -g '*.tsx' 2>/dev/null \
    | awk -F: '{s+=$NF} END {print s+0}'
}

count_lines_no_filter() {
  # rg -n produces one line per match; filter then count.
  # Multiple paths are passed via $@ (positional) so word-splitting works.
  local pattern="$1"; shift
  local exclude_substr="$1"; shift
  rg -n "$pattern" "$@" -g '*.ts' -g '*.tsx' 2>/dev/null \
    | rg -v "$exclude_substr" 2>/dev/null \
    | wc -l \
    | awk '{print $1+0}'
}

# ── core floor numbers ─────────────────────────────────────────────────────
UI_CASTS=$(count_pattern_glob '\(window as any\)' src/ui/)
TOTAL_CASTS=$(count_pattern_glob '\(window as any\)' src/)
UI_TS_FILES=$(find src/ui -name '*.ts' 2>/dev/null | wc -l | awk '{print $1+0}')
SRC_TS_FILES=$(find src \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | wc -l | awk '{print $1+0}')
PACKAGES_COUNT=$(ls packages/ 2>/dev/null | wc -l | awk '{print $1+0}')
PLUGINS_COUNT=$(ls plugins/ 2>/dev/null | wc -l | awk '{print $1+0}')
APPS_COUNT=$(ls apps/ 2>/dev/null | wc -l | awk '{print $1+0}')
RAF_OUTSIDE=$(count_lines_no_filter 'requestAnimationFrame\(' 'packages/frame-scheduler/' src/ packages/ plugins/ apps/)
CANVAS_OUTSIDE=$(count_lines_no_filter "document\\.createElement\\(['\"]canvas['\"]\\)" 'packages/renderer/' src/ packages/ plugins/ apps/)
ADR_COUNT=$(ls docs/03_PRYZM3/00_NEW_ARCHITECTURE/adrs/ADR-*.md 2>/dev/null | wc -l | awk '{print $1+0}')
SPEC_COUNT=$(ls docs/03_PRYZM3/00_NEW_ARCHITECTURE/specs/SPEC-*.md 2>/dev/null | wc -l | awk '{print $1+0}')
SRC_TOP_DIRS=$(find src -maxdepth 1 -type d 2>/dev/null | tail -n +2 | wc -l | awk '{print $1+0}')

# ── §26.5 (Z.10) — per-folder rAF + canvas drilldowns ──────────────────────
emit_drilldown() {
  # $1=pattern $2=exclude_substr — emits a JSON array of {path,count}
  local pattern="$1" exclude="$2"
  printf '  "_drilldown_open": 0,\n'  # placeholder so trailing comma is fine
  local first=1
  for d in src packages plugins apps; do
    [ -d "$d" ] || continue
    for sub in $(ls -1 "$d"/ 2>/dev/null); do
      [ -d "$d/$sub" ] || continue
      local path="$d/$sub"
      [ "$path" = "$exclude" ] && continue
      local cnt
      cnt=$(rg -c "$pattern" "$path" -g '*.ts' -g '*.tsx' 2>/dev/null \
        | awk -F: '{s+=$NF} END {print s+0}')
      if [ "$cnt" -gt 0 ]; then
        if [ "$first" -eq 1 ]; then first=0; else printf ',\n'; fi
        printf '    {"path": "%s", "count": %s}' "$path" "$cnt"
      fi
    done
  done
}

echo "{"
emit_str as_of                  "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
emit ui_cast_sites              "$UI_CASTS"
emit total_cast_sites           "$TOTAL_CASTS"
emit ui_ts_files                "$UI_TS_FILES"
emit src_ts_files               "$SRC_TS_FILES"
emit packages_count             "$PACKAGES_COUNT"
emit plugins_count              "$PLUGINS_COUNT"
emit apps_count                 "$APPS_COUNT"
emit raf_outside_scheduler      "$RAF_OUTSIDE"
emit canvas_outside_renderer    "$CANVAS_OUTSIDE"
emit adr_count                  "$ADR_COUNT"
emit spec_count                 "$SPEC_COUNT"
emit src_top_dirs               "$SRC_TOP_DIRS"

# rAF drilldown
printf '  "raf_drilldown": [\n'
emit_drilldown 'requestAnimationFrame\(' 'packages/frame-scheduler' >/dev/null
# Re-emit (the function above is silenced for the placeholder); produce real array:
first=1
for d in src packages plugins apps; do
  [ -d "$d" ] || continue
  for sub in $(ls -1 "$d"/ 2>/dev/null); do
    [ -d "$d/$sub" ] || continue
    path="$d/$sub"
    [ "$path" = "packages/frame-scheduler" ] && continue
    cnt=$(rg -c 'requestAnimationFrame\(' "$path" -g '*.ts' -g '*.tsx' 2>/dev/null \
      | awk -F: '{s+=$NF} END {print s+0}')
    if [ "$cnt" -gt 0 ]; then
      if [ "$first" -eq 1 ]; then first=0; else printf ',\n'; fi
      printf '    {"path": "%s", "count": %s}' "$path" "$cnt"
    fi
  done
done
printf '\n  ],\n'

# canvas drilldown
printf '  "canvas_drilldown": [\n'
first=1
for d in src packages plugins apps; do
  [ -d "$d" ] || continue
  for sub in $(ls -1 "$d"/ 2>/dev/null); do
    [ -d "$d/$sub" ] || continue
    path="$d/$sub"
    [ "$path" = "packages/renderer" ] && continue
    cnt=$(rg -c "document\\.createElement\\(['\"]canvas['\"]\\)" "$path" -g '*.ts' -g '*.tsx' 2>/dev/null \
      | awk -F: '{s+=$NF} END {print s+0}')
    if [ "$cnt" -gt 0 ]; then
      if [ "$first" -eq 1 ]; then first=0; else printf ',\n'; fi
      printf '    {"path": "%s", "count": %s}' "$path" "$cnt"
    fi
  done
done
printf '\n  ],\n'

echo '  "_end": 0'
echo "}"
