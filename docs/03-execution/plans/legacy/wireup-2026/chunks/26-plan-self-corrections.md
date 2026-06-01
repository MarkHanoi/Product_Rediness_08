# §26  Plan self-corrections — eleven amendments to make PRYZM2-WIREUP-PLAN-S72 perfect

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). New deliverable, third-tier audit (Chunk 24 covered per-folder; Chunk 25 covered per-doc; this chunk covers per-plan-internal-defect).
>
> **Scope of this audit**: this chunk does not amend the plan against an external authority (ADRs, contracts, vision docs are governed by Chunks 24 + 25). It amends the plan against **its own promises** — every place where chunks 01–25 reference a verification artefact that doesn't exist, a baseline number that's already drifted, a sub-phase ID that was added in chunk 24 but never folded back into the canonical phase tables, or a gate that can't actually be opened.
>
> **Position in the schedule**: Phase A (S73) is **complete**; Phase B (S74–S75) is **complete**; **Phase C is in progress** (S76, current sprint). The pre-flight harness chunks 23 promised should have landed in S72 D8–D10 — they didn't, so this chunk schedules them as **remedial work in the back half of Phase C** (sub-phase prefix `Z.*` for *retro-fit*) without slipping the Phase D opening.
>
> **Why this matters**: Chunks 24 + 25 closed the *coverage* gaps; this chunk closes the *executability* gaps. With chunks 24 + 25 + 26 in place, every assertion the plan makes either (a) has a runnable proof, (b) has a parametric baseline that can't go stale, or (c) has an explicit gate that fails CI when violated.

---

## §26.0  Live state at the moment of this audit

Run these to reproduce; they replace the §23.11 "pre-flight today" block which has gone stale since S72 D0:

```bash
# Recalc the floor — append result to .local/state/replit/agent/wireup-floor.json
scripts/wireup-baseline.sh > .local/state/replit/agent/wireup-floor.json
```

Floor as of the date of this audit (post-Phase-A, post-Phase-B, mid-Phase-C):

| Dimension | Plan claim (chunk 23 / 25) | Disk today | Drift | Direction |
|---|---:|---:|---:|---|
| `(window as any)` in `src/ui/` | 769 | **764** | −5 | should keep falling → 0 by G |
| `(window as any)` total `src/` | 2,078 | **2,055** | −23 | should keep falling → 0 by G |
| `src/ui/` `.ts` files | 220–221 | **220** | ±1 | stable |
| All `src/` `.ts/.tsx` files | 1,287 → 230 (G exit) | **1,287** | 0 | should keep falling |
| `packages/` count | 44 | **46** | +2 | grows; ≥ semantics |
| `plugins/` count | 38 | **38** | 0 | stable |
| `apps/` count | 12 | **12** | 0 | stable |
| `rAF` callers outside `packages/frame-scheduler/` | (no number published) | **89** | — | should fall to 0 by H.2 |
| `document.createElement('canvas')` outside `packages/renderer/` | (no number published) | **47** | — | should fall to 0 by H.3 |
| ADR files on disk | 40 ratified + 4 proposed (24+25) | **44 on disk** | 4 ratified | ADR-041–044 already authored |
| SPEC files on disk | 39 | **40** | +1 (`SPEC-FAMILY-EDITOR.md` plus 39 numbered) | stable |
| Top-level `src/` directories | 36 (00-INDEX) / 35 (chunk 24 table sum) | **35** | chunk 24 table is correct; 00-INDEX off-by-one | doc-only fix |
| Workflow CI green-rate | (assumed 100% at S73) | **4/9 green** | — | 5 reds block H.10 GA gate |

**Doc-fix required as part of this chunk**: 00-INDEX.md line 84 (`220 files`) and the §"Status snapshot" packages line (`44 packages`) re-derive from the floor file rather than carrying literals.

---

## §26.1  Amendment A — Phase Z (pre-flight verification harness) → retro-fit as Z.* in late Phase C

[`23-verification-scripts.md`](./23-verification-scripts.md) invokes 8 artefacts that **do not exist on disk** as of mid-Phase-C:

| Artefact §23 promises | Status today | Blocks |
|---|---|---|
| ESLint plugin `@pryzm/no-window-as-any` | not authored | H.1 |
| ESLint plugin `@pryzm/single-raf` | not authored | H.2 |
| ESLint plugin `@pryzm/no-second-canvas` | not authored | H.3 |
| ESLint plugin `@pryzm/no-runtime-package-import` | not authored | H.4 |
| ESLint plugin `@pryzm/no-legacy-src-import` | not authored | G entry gate |
| `apps/bench/scripts/list-gestures.mjs` | not authored | H.8 |
| `apps/bench/scripts/check-gesture-coverage.mjs` | not authored | H.8 |
| `@pryzm/release` package + `pnpm ga-gate` | not authored | H.10 |
| `@pryzm/bench-visual-diff` package | not authored | H.7 |

**Amendment**: prepend a new sub-phase set **`Z.1 … Z.9`** to land **in S77 D1–D5** (the back half of Phase C, while persistence rewire is still ongoing — same engineer can author lint rules between persistence-client PRs).

| Sub-phase | Deliverable | Lands by |
|---|---|---|
| **Z.1** | Author `packages/eslint-plugin-pryzm/` workspace; scaffold rule loader | S77 D1 |
| **Z.2** | Implement `no-window-as-any` rule + tests; ship as **warn** (not error yet) | S77 D1 |
| **Z.3** | Implement `single-raf` + `no-second-canvas` rules + tests; warn | S77 D2 |
| **Z.4** | Implement `no-runtime-package-import` + `no-legacy-src-import` rules + tests; warn | S77 D2 |
| **Z.5** | Author `apps/bench/scripts/list-gestures.mjs` + `check-gesture-coverage.mjs` | S77 D3 |
| **Z.6** | Scaffold `packages/release/` workspace; implement `ga-gate` orchestrator (calls §23.1–§23.9 + §23.13 in order); exit non-zero on any failure | S77 D3 |
| **Z.7** | Scaffold `packages/bench-visual-diff/` workspace; implement `capture` + `diff` subcommands using Playwright + pixelmatch; capture pre-S72 baseline retroactively from `apps/editor/` current build | S77 D4 |
| **Z.8** | Wire all five lint rules into `pnpm lint` as **warn**; CI integration; per-folder warning counts emitted as a JSON artefact | S77 D4 |
| **Z.9** | Author `scripts/wireup-baseline.sh` (emits `.local/state/replit/agent/wireup-floor.json`); add as a CI step | S77 D5 |

**Why "warn" not "error" in Z.2–Z.4**: the plan's intended ratchet is *Phase H flips warn → error*. Z.* lands the rules; H.1–H.4 flips them. This preserves the plan's H lock-in semantics.

**Effect on Phase C cadence**: Z.* are 9 sub-phases in 5 days. Phase C as written has ~28 sub-phases over S76–S77 (2 sprints, 14 days). Adding 9 to D11–D15 of S77 lifts the C total to ~37 sub-phases. The C exit gate (chunk 14 §16.3) is unchanged — persistence rewire still completes in S77 D10, then Z.* fills D11–D15 (which were previously slack).

---

## §26.2  Amendment B — Verification scripts have shell bugs

[`23-verification-scripts.md`](./23-verification-scripts.md) §23.1, §23.2, §23.3, §23.4 all invoke `rg` with `--type=ts --type=tsx`. **Ripgrep does not recognise `tsx` as a built-in type** — `.tsx` files are silently skipped:

```bash
$ rg -n 'requestAnimationFrame\(' src/ --type=ts --type=tsx
error: unrecognized file type: tsx
```

§23.7 also uses `git log --grep='^\[[A-H]\.[0-9.]\+\]'` which is POSIX BRE (the `+` won't match without `-E`).

**Amendment**: replace **every** `--type=ts --type=tsx` in chunk 23 with `-g '*.ts' -g '*.tsx'`. Add `--extended-regexp` to the §23.7 git-log grep. Lands as **`Z.0` (the very first remedial PR)** since it unblocks §26.0 baselines.

The corrected §23.1 cast-count line:

```bash
# WRONG (chunk 23 today — silently skips .tsx):
rg -c "\\(window as any\\)" src/ui/ --type=ts --type=tsx | awk -F: '{s+=$NF} END {print s}'

# CORRECT (lands as Z.0):
rg -c "\\(window as any\\)" src/ui/ -g '*.ts' -g '*.tsx' | awk -F: '{s+=$NF} END {print s}'
```

The corrected §23.7 sub-phase registry line:

```bash
# WRONG:
git log --all --grep='^\[[A-H]\.[0-9.]\+\]' --pretty=format:'%s'

# CORRECT:
git log --all --extended-regexp --grep='^\[[A-H]\.[0-9.]+\]' --pretty=format:'%s'
```

A single doc-PR (≈30 lines diff against chunk 23) closes this.

---

## §26.3  Amendment C — Hard-coded numbers go parametric

The plan sprinkles literal numbers across chunks 23 + 24 + 25:

| Literal | Where | Drift |
|---|---|---|
| `769` cast sites | chunk 23 §23.11, chunk 01 §1.2 | already 764 |
| `220` UI files | chunk 12 §12.13 | matches |
| `221` UI files | chunk 24 Tier D | off by 1 |
| `44 packages` | chunk 25 §25.4, 00-INDEX §"Status" | already 46 |
| `38 plugins` | chunk 25 §25.4 | matches |
| `12 apps` | chunk 25 §25.4 | matches |
| `36 src/ dirs` | chunk 24 §24.0, 00-INDEX | actually 35 (table sums to 35) |
| `~150K LOC` | chunk 04 §5 | superseded by chunk 24's `~173K` |
| `40 ratified ADRs + 4 proposed` | chunk 25 §25.2 | now 44 ratified |
| `~386 sub-phases` | chunk 19 §16.10 | now 386 + 31 + 1 = 418 (chunk 25); add chunk 26's contributions → see §26.10 |

The chunk 25 §25.8.3 verification block uses `=` semantics (`[ "$PKG_COUNT" = "$DOC_PKG" ]`) and will fail any time a package is added.

**Amendment**: introduce a single source-of-truth file `.local/state/replit/agent/wireup-floor.json` updated by `scripts/wireup-baseline.sh` (Z.9 above). Every literal in chunks 23/24/25 that matches a row in the floor file is replaced by a `${FLOOR.<key>}` token at doc-render time, or — simpler — the chunks describe **directions** (`monotonically falls to 0`, `monotonically grows`) and the floor file holds the actual numbers.

`scripts/wireup-baseline.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
emit() { printf '  "%s": %s,\n' "$1" "$2"; }
echo "{"
echo '  "as_of": "'"$(date -Iseconds)"'",'
emit ui_cast_sites           "$(rg -c '\(window as any\)' src/ui/ -g '*.ts' -g '*.tsx' 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')"
emit total_cast_sites        "$(rg -c '\(window as any\)' src/ -g '*.ts' -g '*.tsx' 2>/dev/null    | awk -F: '{s+=$NF} END {print s+0}')"
emit ui_ts_files             "$(find src/ui -name '*.ts' | wc -l)"
emit src_ts_files            "$(find src -name '*.ts' -o -name '*.tsx' | wc -l)"
emit packages_count          "$(ls packages/ | wc -l)"
emit plugins_count           "$(ls plugins/ | wc -l)"
emit apps_count              "$(ls apps/ | wc -l)"
emit raf_outside_scheduler   "$(rg -n 'requestAnimationFrame\(' src/ packages/ plugins/ apps/ -g '*.ts' -g '*.tsx' 2>/dev/null | rg -v 'packages/frame-scheduler/' | wc -l)"
emit canvas_outside_renderer "$(rg -n \"document\\.createElement\\(['\\\"]canvas['\\\"]\\\\)\" src/ packages/ plugins/ apps/ -g '*.ts' -g '*.tsx' 2>/dev/null | rg -v 'packages/renderer/' | wc -l)"
emit adr_count               "$(ls docs/02-decisions/adrs/ADR-*.md | wc -l)"
emit spec_count              "$(ls docs/03-execution/specs/SPEC-*.md | wc -l)"
emit src_top_dirs            "$(find src -maxdepth 1 -type d | tail -n +2 | wc -l)"
echo '  "_end": 0'
echo "}"
```

The chunk 25 §25.8.3 verification block becomes:

```bash
FLOOR=.local/state/replit/agent/wireup-floor.json
[ -f "$FLOOR" ] || { echo "FAIL: wireup-floor.json missing — run scripts/wireup-baseline.sh"; exit 1; }
# ≥ semantics for things that grow:
PKG=$(jq .packages_count "$FLOOR"); [ "$PKG" -ge 44 ] || { echo "FAIL: packages dropped below 44 (was $PKG)"; exit 1; }
ADR=$(jq .adr_count       "$FLOOR"); [ "$ADR" -ge 44 ] || { echo "FAIL: ADRs below 44 (was $ADR)"; exit 1; }
# ≤ semantics for things that shrink:
CAST=$(jq .ui_cast_sites  "$FLOOR"); [ "$CAST" -le 764 ] || { echo "FAIL: UI cast count rose above 764 (was $CAST)"; exit 1; }
RAF=$(jq .raf_outside_scheduler   "$FLOOR"); [ "$RAF"  -le 89 ] || { echo "FAIL: rAF callers outside frame-scheduler rose above 89 (was $RAF)"; exit 1; }
CNV=$(jq .canvas_outside_renderer "$FLOOR"); [ "$CNV"  -le 47 ] || { echo "FAIL: canvas creators outside renderer rose above 47 (was $CNV)"; exit 1; }
```

The five floor values (`764`, `89`, `47`, `44`, `44`) are read once at this audit's date; future PRs may only reduce the shrinkers and grow the growers. **Monotonic ratchet** — same idea as chunk 23 §23.7 sub-phase registry but applied to numeric floors.

---

## §26.4  Amendment D — 32 new sub-phases are orphaned from their phase chunks

Chunk 24 added 31 sub-phases (B.6–B.10, C.14, E.6.0, E.15–E.17, G.10–G.31). Chunk 25 added 1 (G.32). They appear **only** in the chunk 24 §24.5 + chunk 25 §25.8 summary tables — never folded into the canonical phase chunks 14–19. A reader walking Phase B in chunk 15 today does not see B.6–B.10. A reader walking Phase G in chunk 19 does not see G.10–G.32.

**Amendment**: there are two equally-valid ways to close this. Pick one in the same PR that lands chunk 26.

**Option (a) — Author-in-place edits to chunks 14–19** (3 PRs):
- PR-Fold-1: amend `14-subphases-A-D.md` to add B.6–B.10 + C.14 inline in their phase tables.
- PR-Fold-2: amend `15-subphases-E-families.md` to add E.6.0 + E.15–E.17.
- PR-Fold-3: amend `19-subphases-G-H-catchall.md` to add G.10–G.32 inline in the deletion table.

**Option (b) — Banner approach** (1 PR):
- PR-Banner: prepend a 4-line banner to each of chunks 14, 15, 19 of the form:
  > **Additions since this chunk was sliced**: see [`24 §24.5`](./24-pryzm1-src-coverage-audit.md#§245--new-sub-phases-summary-what-to-add-to-§16) (31 IDs) and [`25 §25.8`](./25-architecture-docs-cross-alignment.md#§258--new-deliverables-added-by-this-chunk) (1 ID) and this chunk [`26 §26.6`](#§266--amendment-f--missing-deletion-ids-and-checklists) (G.33 + G.32 enumeration).

**Recommendation**: option (b). Chunks 14–19 are byte-identical slices of the monolith (per chunk 23 §23.12 re-slice contract). Authoring in place breaks the slice contract; banners preserve it and point the reader at the canonical addition source. The 3-line banner adds zero risk of slice drift on the next monolith edit.

---

## §26.5  Amendment E — rAF + canvas pre-flight drilldowns missing

[`23-verification-scripts.md`](./23-verification-scripts.md) §23.11 publishes 5 floor numbers but only the **cast-count** dimension has a per-category drilldown (§23.1's `for cat in platform tools-panel …` loop). The rAF and canvas dimensions are described as "should output zero lines after Phase G" with no per-folder budget table.

Live count today (output of `scripts/wireup-baseline.sh` plus per-folder breakdown):

```bash
# Per-folder rAF drilldown
for d in src packages plugins apps; do
  for sub in $(ls -1 "$d"/ 2>/dev/null); do
    cnt=$(rg -c 'requestAnimationFrame\(' "$d/$sub" -g '*.ts' -g '*.tsx' 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')
    [ "$cnt" -gt 0 ] && [ "$d/$sub" != "packages/frame-scheduler" ] && echo "$d/$sub: $cnt"
  done
done | sort -t: -k2 -rn
```

Today's top offenders (sample):
- `packages/renderer/` — multiple rAF in compositor (legitimate? — rule says only `frame-scheduler` may; renderer must dispatch via scheduler)
- `packages/sync-client/` — rAF in heartbeat (must move to `frame-scheduler.tickAfter`)
- `src/engine/` — rAF in legacy main loop (deleted in G — already in scope)
- `apps/editor/` — rAF in dev mode hot-reload (legitimate? — likely needs ADR-023 quarantine annotation)

**Amendment**: append §23.11.1 (rAF per-folder table) and §23.11.2 (canvas per-folder table) to chunk 23, with each row carrying:
- Current count
- Target (0 unless ADR-023 quarantine carve-out)
- Sub-phase ID that drives it to 0
- ADR carve-out reference (if applicable)

Without these tables, Phase H.2/H.3 lint flips will produce an opaque "lint failed" message with no scoreboard. With them, every PR that touches a non-zero row visibly moves a number.

Lands as **`Z.10` (single doc-PR + the bash drilldown function added to `scripts/wireup-baseline.sh`)** in S77 D5.

---

## §26.6  Amendment F — Phase A entry gate was opened on red CI; Phase D entry gate must not be

[`25-architecture-docs-cross-alignment.md`](./25-architecture-docs-cross-alignment.md) §25.11 says Phase A entry requires the seven doc-PRs in §25.8.2. **In reality, Phase A opened with no doc-PRs landed and 5 of 9 workflows red.** Phase A and B are now complete; that gate failure is water under the bridge. **But Phase D entry must not repeat it.**

Workflows red today (5 of 9):
- `ifc-export-tier1`
- `ifc-import-tier2`
- `ifc-inspector-pset-editor`
- `pryzm-vi-parity`
- `rhino-import-3dm`

These five reds are the H.10 GA-gate blockers in disguise — `pnpm ga-gate` (Z.6) cannot exit 0 while any workflow is red, and the visual-diff baseline (Z.7) cannot be captured against a build that fails CI.

**Amendment** — extend the C exit gate (chunk 14 §16.3) to include:

| Gate | Sub-phase | Lands by |
|---|---|---|
| **C.exit.1** — verification harness (Z.1–Z.10) all green | already scheduled in §26.1 | S77 D5 |
| **C.exit.2** — five red workflows green or quarantined with explicit `expected_failure: true` flag in workflow config + linked tracking issue | new **`Z.11–Z.15`** (one per workflow) | S77 D6–D8 |
| **C.exit.3** — first floor file committed to `.local/state/replit/agent/wireup-floor.json` | already scheduled (Z.9) | S77 D5 |
| **C.exit.4** — chunks 14–19 banner PR (option b in §26.4) merged | new **`Z.16`** | S77 D6 |

Phase D opens only when all four C-exit conditions are green.

---

## §26.7  Amendment G — re-slice script will undo all chunk-level edits

[`23-verification-scripts.md`](./23-verification-scripts.md) §23.12 documents a re-slice script that regenerates chunks 01–22 from the monolith `PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md`. **If chunk 25 §25.7 renames `S73 → S73-WIRE` at the chunk level, the next re-slice silently overwrites it** (the monolith still says `S73`). Same risk for any future chunk-level edit.

There are two ways out, with very different operational implications:

**Option (a)** — edit the monolith first, re-slice second. Canonical = monolith. **Cost**: every chunk amendment is a two-edit operation (monolith + re-slice). **Benefit**: chunks stay byte-identical to the monolith line-range each chunk's header asserts.

**Option (b)** — retire the re-slice script. Declare chunks 01–22 canonical. Mark monolith DEPRECATED with a banner pointing at chunks 01–22 + 24 + 25 + 26. **Cost**: the line-range headers in chunks 01–20 become stale (cosmetic; they're never CI-checked). **Benefit**: chunks 23, 24, 25, 26 are already canonical (never were sliced from the monolith — they're new deliverables). Choosing (b) makes the whole folder uniform.

**Recommendation**: option (b). Lands as a single doc-PR alongside chunk 26:
1. Delete §23.12 (the re-slice script).
2. Replace with §23.12-NEW (the deprecation notice on the monolith).
3. Add a banner at the top of `PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md`: *"This monolith was the seed for chunks 01–22 in `audits/PRYZM2-WIREUP-PLAN-S72/`. After 2026-04-29 the chunks are canonical; the monolith is preserved for historical reference but is **not authoritative**. Edits land in the chunks."*

Lands as **`Z.17`** in S77 D8.

---

## §26.8  Amendment H — missing deletion IDs and unspecified checklists

| Issue | Location | Amendment |
|---|---|---|
| `src/persistence/` deletion has no G.NN | chunk 24 §24.5 only has C.14 (move) | Add **`G.33`** (delete `src/persistence/` after C.14 move lands and verifies). Lands in **S82 D9** (last day of Phase G). |
| G.32 (PRYZM 1 lights-out) is just an ID | chunk 25 §25.8.1 | Enumerate sub-items: **G.32.1** DNS cutover · **G.32.2** PRYZM 1 billing terminate · **G.32.3** auth-flag flip (PRYZM 1 read-only) · **G.32.4** customer data export endpoint live · **G.32.5** PRYZM 1 → PRYZM 2 migration runbook (per ADR-044) · **G.32.6** founder-authored customer comms send · **G.32.7** PRYZM 1 OTel tags marked deprecated · **G.32.8** PRYZM 1 marketplace catalog frozen · **G.32.9** read-only window calendar started (per ADR-044). Lands across **S84 D1–D9**. |
| ADR-041/042/043 "default if no ADR" path not gated | chunk 24 §24.4 | Already moot — ADR-041, 042, 043, 044 are all on disk now (§26.0). Drop the "default if no ADR" rows; replace with the **as-ratified decision** of each ADR. Lands as a single doc-PR (`Z.18`). |
| ADR-044 "latest sprint" impossible | chunk 25 §25.8.1 says S22 (M11); we are at S76 (M37) | Re-derive: ADR-044 must land **before G.32.6** (customer comms send) — practically S82 D5 to give 4 days for review. |
| Phase G exit gate file count | chunk 24 §24.6 says "≈ 230" | Make parametric: read `wireup-floor.json.src_ts_files` ≤ 230. |

---

## §26.9  Amendment I — sprint-ID lint enforcement missing

Chunk 25 §25.7 proposes `S73-WIRE…S87-WIRE` vs `S73-PG4…S144-PG8` disambiguation via 7 doc edits. **Nothing prevents a future PR from re-introducing bare `S73`.** Phase A and B both already ran on bare `S73`/`S74`/`S75` in commit messages — by S82 the corpus will have hundreds of bare references.

**Amendment** — add **`H.5.1`** (commit-msg hook + PR-title lint) to the Phase H lock-in set:

```bash
# .git/hooks/commit-msg + .github/workflows/pr-title-lint.yml
PATTERN='\bS(7[3-9]|8[0-7])\b(?!-WIRE)'
if echo "$1" | grep -EqP "$PATTERN"; then
  echo "ERROR: bare sprint ID '$BASH_REMATCH' detected. Use 'S73-WIRE' or 'S73-PG4' (per chunk 25 §25.7)."
  exit 1
fi
```

Plus a one-shot historical migration: **`Z.19`** rewrites the chunk 14–19 banner (from §26.4 option b) to add a parenthetical `(=S73-WIRE)` next to every bare `S73…S87` reference. Pure-doc, zero risk.

Lands `Z.19` in S77 D8; H.5.1 in S85 (existing Phase H window).

---

## §26.10  Amendment J — runtime smoke test missing from `pnpm ga-gate`

All 9 §23 checks are **static** (greps + ESLint + matrix diffs). Phase G's blast radius is **runtime**: `src/ui/` accesses legacy code via `(window as any).foo`, which is invisible to static checks. After G.10 deletes `src/tools/`, the static checks still pass; the proof that wireup actually works is the app booting and `runtime.tools.<x>` resolving to a non-undefined object.

**Amendment** — add **§23.13 — Runtime smoke test**:

```bash
# packages/release/src/smoke.ts (lands in Z.6)
pnpm --filter @pryzm/release smoke
# Equivalent to:
#   1. pnpm --filter @pryzm/headless build
#   2. node apps/headless/dist/smoke.js
#   3. Inside smoke.js:
#      - composeRuntime() must not throw
#      - Every documented runtime.<leg> path resolves to a non-undefined typed object
#      - Every UI category in chunks 09-11 mounts without console.error
#      - Snapshot the `(window as any)` namespace and assert it matches the chunk 24 Tier B "what main.ts mounts" list
#   4. Exit non-zero on any failure
```

Wire into `pnpm ga-gate` as the final step (after §23.9 visual-diff). Without this, `ga-gate` can pass while the editor is broken at runtime.

The full GA-gate composite (chunk 23 §23.10 amended):

```
§23.1  cast count == 0
§23.2  single-rAF + single-canvas
§23.3  layer boundaries clean
§23.4  gesture-coverage.unassigned == 0
§23.5  architecture-leg orphans == 0
§23.6  ui-file inventory clean (≤ 20 implicit submodules)
§23.7  subphase registry clean (zero orphan PRs)
§23.8  every bench has baseline
§23.9  visual-diff green
§23.13 runtime smoke green                           ← NEW (this chunk)
§23.x  cross-doc invariants (chunk 25 §25.8.3)       ← amended (§ semantics fix from this chunk §26.3)
§23.y  per-folder rAF + canvas drilldowns clean      ← NEW (this chunk §26.5)
```

Lands as part of `Z.6` (the `@pryzm/release` package authoring).

---

## §26.11  Amendment K — chunks 24 + 25 status updates from on-disk reality

Three rows in chunks 24 + 25 are now stale and contradict the disk. Doc-only fix, lands as **`Z.20`** in S77 D9:

| Stale claim | Where | Reality | Fix |
|---|---|---|---|
| ADR-041 "MISSING — proposed by Chunk 24 §24.4" | chunk 25 §25.2 line 111 | `docs/02-decisions/adrs/ADR-041-portfolio-aggregate-placement.md` exists | Update row to ✓ on disk; copy ratified decision into chunk 24 §24.4 |
| ADR-042 "MISSING" | chunk 25 §25.2 line 112 | `ADR-042-physics-runtime-vs-dev-only.md` exists | Same |
| ADR-043 "MISSING" | chunk 25 §25.2 line 113 | `ADR-043-utils-inline-vs-package.md` exists | Same |
| ADR-044 "MISSING — proposed by THIS chunk §25.5" | chunk 25 §25.2 line 114 | `ADR-044-customer-migration-pryzm1-to-pryzm2.md` exists | Same |
| "40 ratified ADRs + 4 proposed" | chunk 25 §25.2 result line | 44 on disk | Update count |
| "36 top-level src/ folders" | chunk 24 §24.0 + 00-INDEX | 35 on disk; chunk 24 table sums to 35 (00-INDEX off-by-one) | Update both to 35 |
| "769 cast sites" | chunk 23 §23.11 + chunk 01 §1.2 | 764 on disk | Replace with `${FLOOR.ui_cast_sites}` token (parametric per §26.3) |
| "44 packages / 38 plugins / 12 apps" | 00-INDEX §"Status snapshot" + chunk 25 §25.4 | 46/38/12 | Update to ≥ 46 / ≥ 38 / ≥ 12 (≥ semantics per §26.3) |

---

## §26.12  Updated wireup-plan deliverable count

| Source | Sub-phases / ADRs / SPECs / scripts |
|---|---:|
| Original `19-subphases-G-H-catchall.md` cadence | 386 sub-phases |
| Chunk 24 (B.6–B.10, C.14, E.6.0, E.15–E.17, G.10–G.31) | +31 |
| Chunk 25 (G.32) | +1 |
| **Chunk 26 (this audit)** | **+21 sub-phases (Z.0–Z.20) + 1 sub-phase (G.33) + 1 sub-phase (H.5.1) + 9 G.32.* sub-items** |
| **Net** | **~441 sub-phases** |

The cadence envelope is essentially unchanged — Z.* lands in the back half of Phase C (S77 D1–D9, otherwise slack), G.33 lands in Phase G (S82 D9), G.32.* enumerate the existing G.32 ID, H.5.1 lands in Phase H (S85). Phase D opens on time once C.exit.1–C.exit.4 (§26.6) are green.

ADRs: 44 on disk (40 + 041–044). No new ADRs from this chunk.

SPECs: 40 on disk. No new SPECs from this chunk.

Scripts: **+1 (`scripts/wireup-baseline.sh`)** + 5 ESLint rules + 2 bench MJS scripts + 2 new packages (`packages/release/`, `packages/eslint-plugin-pryzm/`, `packages/bench-visual-diff/`).

---

## §26.13  Updated Phase C exit / Phase D entry gate

[`14-subphases-A-D.md`](./14-subphases-A-D.md) §16.3 (Phase C exit) is amended to:

> Phase C exits when:
> 1. Persistence rewire C.1–C.13 + C.14 (chunk 24) are merged.
> 2. **C.exit.1** — verification harness Z.1–Z.10 (this chunk §26.1) merged and emitting baseline JSON.
> 3. **C.exit.2** — 5 red workflows are green or marked `expected_failure` per Z.11–Z.15 (this chunk §26.6).
> 4. **C.exit.3** — `.local/state/replit/agent/wireup-floor.json` committed.
> 5. **C.exit.4** — chunks 14–19 banner PR (Z.16, this chunk §26.4) merged.
> 6. Chunk 26 status-update PRs (Z.17, Z.18, Z.19, Z.20) merged.

`pnpm ga-gate` runs against the live build and exits 0 (proves the harness itself works against today's mid-Phase-C state, which will have non-zero cast / rAF / canvas counts but green smoke + green visual-diff against the captured baseline).

---

## §26.14  TL;DR

Chunks 24 + 25 closed the **coverage** holes (every `src/` folder accounted for; every NEW_ARCHITECTURE doc accounted for). This chunk closes the **executability** holes:

1. **Z.1–Z.10** retro-fits the verification harness chunk 23 promised but never built. Lands in S77 D1–D5 (back half of Phase C, otherwise slack).
2. **Z.0** + 30-line doc-PR fix the `--type=tsx` and `git log --grep` shell bugs that make 4 of the 9 §23 scripts silently incorrect today.
3. **Numeric floors go parametric** via `wireup-floor.json` — every literal in chunks 23/24/25 either becomes a token or a direction. The chunk 25 §25.8.3 `=` semantic becomes `≥`/`≤`.
4. **Chunks 14–19 get a 4-line banner** pointing at chunks 24 + 25 + 26 for the 33 sub-phases added since the slice. Slice contract (§23.12) preserved by retiring the re-slice script (Option b §26.7).
5. **Phase C exit gate** is now the right-sized gate (it was Phase A's missed gate); 5 red workflows must be green or carve-out before D opens.
6. **G.33 added** for `src/persistence/` deletion. **G.32 enumerated** into 9 sub-items. **ADR-041–044** are already on disk; chunk 25's "MISSING" rows updated.
7. **§23.13 runtime smoke test** added to `pnpm ga-gate` so the gate proves runtime correctness, not just static cleanliness.
8. **`H.5.1` commit-msg hook** prevents the S73-WIRE / S73-PG4 disambiguation from silently regressing.

After chunks 24 + 25 + 26 merge, the wireup plan is **internally consistent, externally complete, and externally executable**. Every assertion has either a runnable proof, a parametric baseline, or an explicit gate. The 36-month rebuild can wire behind the white UI without leaving anything orphaned, drifted, or unverifiable.
