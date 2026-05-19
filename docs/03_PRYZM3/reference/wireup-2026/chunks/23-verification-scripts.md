# §23  Verification scripts — runnable proofs

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). New deliverable — not in the source monolith.
>
> The plan asserts a lot ("zero cast sites", "every gesture mapped", "no orphan architecture leg"). This file gives the **runnable shell + lint recipes** that prove each assertion. The operator (or CI) executes these in order. If all pass, the GA gate ([H.10](./19-subphases-G-H-catchall.md)) opens.
>
> Every script in §1–§5 below is read-only. The Phase H lint flips ([H.1–H.5](./19-subphases-G-H-catchall.md)) turn the warn outputs into hard CI failures.

> **Corrections since this chunk was authored** (per [Chunk 26](./26-plan-self-corrections.md) — apply these when running anything below):
> 1. **Shell bugs** ([§26.2](./26-plan-self-corrections.md#§262--amendment-b--verification-scripts-have-shell-bugs)): every `--type=ts --type=tsx` invocation in §23.1, §23.2, §23.3, §23.4 must be `-g '*.ts' -g '*.tsx'` — `tsx` is not a built-in ripgrep type and `.tsx` files are silently skipped today. The §23.7 git-log grep needs `--extended-regexp` (the `+` won't match POSIX BRE). Lands as **Z.0** (the very first remedial PR in S77-WIRE D1).
> 2. **Hard-coded baselines go parametric** ([§26.3](./26-plan-self-corrections.md#§263--amendment-c--hard-coded-numbers-go-parametric)): every literal in this chunk (`769`, `220`, `44`, `36`) is replaced by a value read from `.local/state/replit/agent/wireup-floor.json` produced by `scripts/wireup-baseline.sh`. The §25.8.3 `=` semantic becomes `≥` for growers and `≤` for shrinkers (monotonic ratchet). Lands as **Z.9** in S77-WIRE D5.
> 3. **Per-folder rAF/canvas drilldown tables** added as new sub-sections **§23.11.1** (rAF) and **§23.11.2** (canvas) — see [Chunk 26 §26.5](./26-plan-self-corrections.md#§265--amendment-e--raf--canvas-pre-flight-drilldowns-missing). Lands as **Z.10** in S77-WIRE D5.
> 4. **§23.13 — Runtime smoke test** added as the final step of `pnpm ga-gate` — see [Chunk 26 §26.10](./26-plan-self-corrections.md#§2610--amendment-j--runtime-smoke-test-missing-from-pnpm-ga-gate). Without it the gate proves only static invariants. Lands as part of **Z.6** in S77-WIRE D3.
> 5. **§23.12 — Re-slice script — RETIRED** per [Chunk 26 §26.7](./26-plan-self-corrections.md#§267--amendment-g--re-slice-script-will-undo-all-chunk-level-edits). Chunks 01–22 are now declared **canonical**; the monolith `PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md` is **DEPRECATED for editing** (preserved for historical reference only). Lands as **Z.17** in S77-WIRE D8.
> 6. **Verification harness deliverables** (5 ESLint rules in `packages/eslint-plugin-pryzm/`, 2 bench scripts in `apps/bench/scripts/`, 2 new packages `@pryzm/release` and `@pryzm/bench-visual-diff`) are **not on disk yet** — this chunk references them as if they exist. Lands as **Z.1–Z.8** in S77-WIRE D1–D4 per [Chunk 26 §26.1](./26-plan-self-corrections.md#§261--amendment-a--phase-z-pre-flight-verification-harness--retro-fit-as-z-in-late-phase-c).

---

## §23.1  Cast-site count (`(window as any)`)

**Assertion**: `src/ui/` cast sites drop from 769 (today) to 0 by end of Phase G (S84).

```bash
# Count today (S72 D0)
rg -l "\\(window as any\\)" src/ui/ | wc -l                          # files touched
rg -c "\\(window as any\\)" src/ui/ | awk -F: '{s+=$NF} END {print s}'  # total occurrences

# Per-category drilldown (matches §12 categories A–L)
for cat in platform tools-panel property-panel property-inspector ai dataworkbench rendering bottom-menu canvas overlays intent generative furniture-carousel kitchen wardrobe rooms SheetEditor SchedulePanel ViewBrowser views grids levels icons fallbacks primitives inspect import import-manager interop geospatial imported-models; do
  count=$(rg -c "\\(window as any\\)" src/ui/$cat/ 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')
  echo "$cat: $count"
done

# Drop monitor (run after every Phase B/F PR)
git log --oneline -p -G "\\(window as any\\)" src/ui/ | rg "^[+-].*\\(window as any\\)" | sort | uniq -c
```

**Phase H.1 enforcement** (S85):
```bash
# .eslintrc adds:
#   "@pryzm/no-window-as-any": ["error", {"ignoreFiles": ["src/main.ts"]}]
# This converts WARN → ERROR on every PR.
pnpm lint --filter ./src/ui
```

---

## §23.2  Single-rAF + single-canvas check

**Assertion**: only `packages/frame-scheduler/` calls `requestAnimationFrame`; only `packages/renderer/` and `composeRuntime.ts` call `document.createElement('canvas')` (Vision principles P2 + P3).

```bash
# raf callers (today)
rg -n "requestAnimationFrame\\(" src/ packages/ plugins/ apps/ \
  -g '*.ts' -g '*.tsx' \
  | rg -v "packages/frame-scheduler/"

# canvas creators (today)
rg -n "document\\.createElement\\(['\"]canvas['\"]\\)" src/ packages/ plugins/ apps/ \
  -g '*.ts' -g '*.tsx' \
  | rg -v "packages/renderer/" | rg -v "packages/runtime-composer/"

# Both should output zero lines after Phase G.
```

**Phase H.2–H.3 enforcement** (S85):
```bash
# .eslintrc:
#   "@pryzm/single-raf": "error"            # only frame-scheduler may call rAF
#   "@pryzm/no-second-canvas": "error"      # only renderer + composer may create canvas
pnpm lint
```

---

## §23.3  Layer-boundary check (`src/ui/` import allowlist)

**Assertion**: `src/ui/` imports only from `@pryzm/runtime-composer/types` (the typed handle), never directly from individual packages (Vision P5).

```bash
# Today: every direct package import from src/ui/
rg -n "^import .* from ['\"]@pryzm/" src/ui/ -g '*.ts' -g '*.tsx' \
  | rg -v "@pryzm/runtime-composer"

# Phase H.4 enforcement:
#   .eslintrc adds "@pryzm/no-runtime-package-import": "error"
#   forbids src/ui/* from importing @pryzm/<anything-but-runtime-composer-types>
```

```bash
# Also forbid src/ui/ from importing src/engine/, src/elements/, src/commands/, src/services/
rg -n "from ['\"]\\.\\./engine|from ['\"]\\.\\./elements|from ['\"]\\.\\./commands|from ['\"]\\.\\./services" src/ui/

# After Phase G these directories are deleted, so the rule becomes inert — but until then:
#   .eslintrc "@pryzm/no-legacy-src-import": "error"
```

---

## §23.4  Gesture coverage (catch-all sweep, Phase H.8)

**Assertion**: every `addEventListener`, every template `onclick=`, every hotkey registration in `src/ui/` is assigned to a sub-phase ID in [`14`–`19`](./14-subphases-A-D.md).

```bash
# Step 1 — enumerate every gesture site
mkdir -p .local/audits
{
  rg -n "addEventListener\\(['\"](click|mousedown|mouseup|mousemove|keydown|keyup|dragstart|drop|wheel|contextmenu|input|change|submit)" src/ui/ -g '*.ts' -g '*.tsx'
  rg -n 'onclick="[^"]+"' src/ui/ -g '*.ts' -g '*.tsx'
  rg -n "\\(window as any\\)" src/ui/ -g '*.ts' -g '*.tsx'
  rg -n "registerHotkey\\(" src/ui/ -g '*.ts' -g '*.tsx'
} > .local/audits/gestures-raw.txt

# Step 2 — bucket by file, output gesture-coverage.json
node apps/bench/scripts/list-gestures.mjs \
  --input .local/audits/gestures-raw.txt \
  --output .local/audits/gesture-coverage.json

# Step 3 — cross-reference §16.* sub-phase IDs from this folder
node apps/bench/scripts/check-gesture-coverage.mjs \
  --gestures .local/audits/gesture-coverage.json \
  --plan-dir docs/03_PRYZM3/reference/phases/audits/PRYZM2-WIREUP-PLAN-S72/

# Output (non-zero exit = unassigned gestures present):
#   { assigned: 1832, unassigned: 0, by_subphase: {...} }
```

**Phase H.10**: GA gate opens when `unassigned == 0`.

---

## §23.5  Architecture-leg orphan check (uses §21 matrix)

**Assertion**: every package in `packages/`, every plugin in `plugins/`, every worker in `apps/` has a UI consumer or is `internal` to a chain that does.

```bash
# Step 1 — enumerate the actual filesystem
{
  ls -1 packages/ | sed 's/^/package:/'
  ls -1 plugins/  | sed 's/^/plugin:/'
  ls -1 apps/     | sed 's/^/app:/'
} > .local/audits/architecture-legs.txt

# Step 2 — extract the matrix entries
rg -nP '^\| `(packages/|plugins/|apps/)?[\w-]+`' \
  docs/03_PRYZM3/reference/phases/audits/PRYZM2-WIREUP-PLAN-S72/21-architecture-to-ui-coverage-matrix.md \
  | sed -E 's/.*`([^`]+)`.*/\1/' \
  | sort -u > .local/audits/matrix-legs.txt

# Step 3 — diff
echo "=== Legs in filesystem but missing from §21 matrix ==="
comm -23 <(cat .local/audits/architecture-legs.txt | sed 's/^[a-z]*://' | sort) \
         .local/audits/matrix-legs.txt

echo "=== Legs in §21 matrix but missing from filesystem ==="
comm -13 <(cat .local/audits/architecture-legs.txt | sed 's/^[a-z]*://' | sort) \
         .local/audits/matrix-legs.txt
```

Both lists must be empty for GA. The first list catches new packages added after S72 that nobody wired; the second catches matrix entries that lost their backing package.

---

## §23.6  UI-file inventory check (uses §12)

**Assertion**: every file under `src/ui/` is enumerated in [`09`–`11`](./09-ui-inventory-A-D.md) (Categories A–L).

```bash
# Filesystem
find src/ui -name '*.ts' | sort > .local/audits/ui-fs.txt

# Files mentioned in §12
rg -nP '`src/ui/[A-Za-z0-9_/-]+\.ts`' \
  docs/03_PRYZM3/reference/phases/audits/PRYZM2-WIREUP-PLAN-S72/{09,10,11}-ui-inventory-*.md \
  | sed -E 's/.*`(src\/ui\/[^`]+)`.*/\1/' \
  | sort -u > .local/audits/ui-cited.txt

echo "=== Files on disk but not cited in §12 ==="
comm -23 .local/audits/ui-fs.txt .local/audits/ui-cited.txt

echo "=== Files cited in §12 but absent from disk ==="
comm -13 .local/audits/ui-fs.txt .local/audits/ui-cited.txt
```

**Note**: §12.13 acknowledges 20 sub-modules are covered implicitly (`property-panel/types.ts`, `data/buckets/*.ts`, etc). The first comm output is allowed up to 20 entries; if it exceeds 20, a new file slipped in untreated.

---

## §23.7  Sub-phase ID registry check

**Assertion**: every sub-phase ID promised in [`14`–`19`](./14-subphases-A-D.md) shows up either as a merged commit/PR or as an open todo in `.local/state/`.

```bash
# Step 1 — extract every promised sub-phase ID
rg -nP '\*\*[A-H](\.\d+){1,3}\*\*' \
  docs/03_PRYZM3/reference/phases/audits/PRYZM2-WIREUP-PLAN-S72/{14,15,16,17,18,19}-subphases-*.md \
  | sed -E 's/.*\*\*([A-H](\.\d+){1,3})\*\*.*/\1/' \
  | sort -u > .local/audits/subphases-promised.txt

wc -l .local/audits/subphases-promised.txt
# Expect ~386 (cadence summary in §16.10)

# Step 2 — extract every merged sub-phase ID from git
git log --all --extended-regexp --grep='^\[[A-H]\.[0-9.]+\]' --pretty=format:'%s' \
  | grep -oE '^\[[A-H]\.[0-9.]+\]' \
  | sed 's/^\[//;s/\]$//' \
  | sort -u > .local/audits/subphases-merged.txt

# Step 3 — diff
echo "=== Promised but not yet merged (in-flight or todo) ==="
comm -23 .local/audits/subphases-promised.txt .local/audits/subphases-merged.txt

echo "=== Merged but not promised (orphan PR — nobody documented it) ==="
comm -13 .local/audits/subphases-promised.txt .local/audits/subphases-merged.txt
```

The second list must always be empty: every merged PR must have a sub-phase ID registered in this folder. Orphan PRs are rejected by the PR template hook (Phase H.5).

---

## §23.8  Bench-baseline check

**Assertion**: every bench named in [`12-ui-perf-benches.md`](./12-ui-perf-benches.md) (60 benches) exists as a file under `apps/bench/src/benches/ui/` and has an entry in `apps/bench/baseline.json`.

```bash
# Step 1 — promised benches
rg -nP '`bench/ui/[a-z0-9-]+\.bench\.ts`' \
  docs/03_PRYZM3/reference/phases/audits/PRYZM2-WIREUP-PLAN-S72/12-ui-perf-benches.md \
  | sed -E 's/.*`bench\/ui\/([^`]+)`.*/\1/' \
  | sort -u > .local/audits/benches-promised.txt

# Step 2 — actual benches
ls apps/bench/src/benches/ui/*.bench.ts 2>/dev/null \
  | xargs -n1 basename \
  | sort > .local/audits/benches-disk.txt

# Step 3 — baseline
node -e "const b=require('./apps/bench/baseline.json'); console.log(Object.keys(b.ui||{}).join('\\n'))" \
  | sort > .local/audits/benches-baseline.txt

echo "=== Promised but not on disk ==="
comm -23 .local/audits/benches-promised.txt .local/audits/benches-disk.txt

echo "=== On disk but not in baseline.json ==="
comm -23 .local/audits/benches-disk.txt .local/audits/benches-baseline.txt
```

**Phase H.6 (S86)** flips every entry in baseline to `hardFail: true` simultaneously.

---

## §23.9  Visual-diff baseline check (Phase H.7)

**Assertion**: every screen state captured pre-S72 still pixel-matches post-PR.

```bash
# Capture (one-time, before Phase A starts):
pnpm --filter @pryzm/bench-visual-diff capture --baseline pre-s72

# Per-PR:
pnpm --filter @pryzm/bench-visual-diff diff --against pre-s72 --threshold 0.05
# Exits non-zero if any captured screen has SSIM > 2 px or pixel-diff > 0.05%.
```

---

## §23.10  GA gate composite (Phase H.10)

A single command runs §23.1–§23.9 in order and emits one summary:

```bash
pnpm --filter @pryzm/release ga-gate
# Equivalent to:
#   §23.1 cast count == 0
#   §23.2 single-rAF + single-canvas
#   §23.3 layer boundaries clean
#   §23.4 gesture-coverage.unassigned == 0
#   §23.5 architecture-leg orphans == 0
#   §23.6 ui-file inventory clean (≤ 20 implicit submodules)
#   §23.7 subphase registry clean (zero orphan PRs)
#   §23.8 every bench has baseline
#   §23.9 visual-diff green
# Exits 0 only if ALL pass.
```

**The GA cut is the moment this command exits 0 on `main`.**

---

## §23.11  Pre-flight today (S72 D0) — what an engineer can run right now

The Phase A composer doesn't exist yet, so most of the above will be red until S73+. But the following are runnable today as the floor against which Phase B PRs will be graded:

```bash
# Cast site count today (the number Phase B drives down)
rg -c '\\(window as any\\)' src/ui/ | awk -F: '{s+=$NF} END {print s}'
# Expect ~769 (matches §2.2)

# UI file count (the number §12 categorises)
find src/ui -name '*.ts' | wc -l
# Expect 220 (matches §12.13)

# Architecture leg count (the number §21 matrix categorises)
{ ls -1 packages/; ls -1 plugins/; ls -1 apps/; } | wc -l
# Expect 44 + 38 + 12 = 94

# rAF callers outside frame-scheduler today (the number Phase D drives down)
rg -n 'requestAnimationFrame\\(' src/ packages/ plugins/ apps/ -g '*.ts' -g '*.tsx' \
  | rg -v 'packages/frame-scheduler/' | wc -l

# Canvas creators outside renderer today
rg -n "document\\.createElement\\(['\\\"]canvas['\\\"]\\)" src/ packages/ plugins/ apps/ -g '*.ts' -g '*.tsx' \
  | rg -v 'packages/renderer/' | wc -l

# Reproducible single-shot — emit all five floor numbers at once via Z.9 (§26.3)
# Note: §26.3 spelt the path `.local/state/replit/agent/wireup-floor.json`;
# that prefix is reserved by Replit. The floor file lives at `.local/wireup-floor.json`.
scripts/wireup-baseline.sh > .local/wireup-floor.json
```

These five numbers are the living scoreboard. Phase A → H drives them all to their target values.

---

## §23.12  Re-slice script — keep this folder in sync with the monolith

If the monolith [`../PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md`](../00-PLAN.md) is edited, regenerate the chunk files in this folder so they stay byte-identical to the source:

```bash
SRC=docs/03_PRYZM3/reference/phases/audits/PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md
DST=docs/03_PRYZM3/reference/phases/audits/PRYZM2-WIREUP-PLAN-S72

extract() {
  local out="$1" start="$2" end="$3" title="$4"
  {
    echo "# $title"
    echo
    echo "> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines $start–$end."
    echo
    echo "---"
    echo
    sed -n "${start},${end}p" "$SRC"
  } > "$DST/$out"
}

# (re-run the same `extract` calls used to build this folder; see git log for the canonical list)
```

The 21–23 chunks are author-maintained (not regenerated) — keep them in sync by hand whenever the matrix or flows change.
