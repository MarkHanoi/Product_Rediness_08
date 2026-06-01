# 10 — Verifiers Catalog

> **Anchored to**: every wave file in this folder (each defines its verifiers); `../03-CURRENT-STATE.md §1` (the 13 live metric verifiers); `12-DISCIPLINE-AND-DOD.md §1` rule 6 (`pnpm ga-gate` runs the catalog).
> **Authority**: this document is the **single source of truth for thresholds**. When a wave file cites a threshold (e.g. "EngineBootstrap LOC ≤ 35"), the actual enforced threshold is the one in this catalog. Per-wave files are commentary; this catalog is normative.
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§1 dashboard shell verifier column if a threshold changes; §3 wave ledger gate condition if a verifier definition changes).
> **Format**: each verifier has (a) a name, (b) the shell command, (c) the target value, (d) the wave that closes it, (e) the boolean it advances (if any), (f) what the failure message says.

---

## §1 — How to use this catalog

```bash
# Run a single verifier
pnpm ga-gate --check <verifier-name>

# Run all verifiers (Rule 6: this is the merge gate)
pnpm ga-gate

# Run wave-specific verifier composite
pnpm ga-gate --check wave-N-exit
pnpm ga-gate --check d4-exit
```

When a verifier fails, the output names:
1. The verifier that failed
2. Today's value vs the target
3. The wave file with the recovery plan
4. The boolean affected (if any)

---

## §2 — Tripwires (Wave 1 — installed week 1, run on every PR)

These three tripwires prevent regression. They auto-ratchet (lower the baseline when a PR brings the metric down) and hard-fail when a PR brings the metric up.

### `loc-tripwire`

| Field | Value |
|---|---|
| Command | `tsx tools/ga-gate/check-engine-bootstrap-loc.ts` |
| Target | ≤ 2,100 LOC (hard fail above; today's value 2,066 + buffer) |
| Soft warn | > 200 LOC (Wave 7 deletes the file entirely) |
| Wave that closes (= file deleted) | Wave 7 (S86-WIRE) |
| Boolean | #5 |
| Failure | `[loc-tripwire] FAIL: src/engine/EngineBootstrap.ts = N LOC > 2,100. This is a regression. Wave 7 target is < 35 LOC.` |

### `cast-tripwire`

| Field | Value |
|---|---|
| Command | `tsx tools/ga-gate/check-cast-count.ts` |
| Target | ≤ baseline at `.ga-gate/baselines/cast-count.json` (today: 2,070; auto-ratchets) |
| Wave that closes (= count reaches 0 outside allowlist) | Wave 7 (S85-WIRE) |
| Boolean | #2 |
| Failure | `[cast-tripwire] FAIL: (window as any) count = N > baseline B. Added M cast(s).` |

### `raf-tripwire`

| Field | Value |
|---|---|
| Command | `tsx tools/ga-gate/check-raf-count.ts` |
| Target | ≤ 68 owners (hard fail above) |
| Soft warn | > 1 (P3 absolute target) |
| Wave that closes (= count reaches 1) | Wave 7 (S85-WIRE) |
| Boolean | #3 |
| Failure | `[raf-tripwire] FAIL: N files own requestAnimationFrame > 68. Wave 7 target = 1.` |

---

## §3 — D.4 slice verifiers (Wave 2-3)

### `d4-1` — Scene + viewport extraction

```bash
# Option A (founder decision 2026-04-30 night): SceneBootstrap.ts landed in packages/renderer/,
# NOT packages/renderer-three/ (which is the Wave 8 THREE-leaf stub, L1).
# Original spec said packages/renderer-three/ — corrected per 01-CRITICAL-PATH-D4.md §3 STATUS-UPDATE.
[ -f packages/renderer/src/SceneBootstrap.ts ] || exit 1
grep -q 'pryzm.bootstrap.scene' packages/renderer/src/SceneBootstrap.ts || exit 1
pnpm --filter @pryzm/renderer test
[ "$(rg -l 'EngineBootstrap' src/core/views/ | wc -l)" -eq 0 ] || exit 1
```

Closes: D.4.1 PR. Wave 2 day 5. ✅ DONE (2026-04-30 night — `packages/renderer/src/SceneBootstrap.ts` 188 LOC, 61/61 tests green).

### `d4-2` — Persistence extraction + bridge half-retire

```bash
[ "$(wc -l < src/engine/EngineBootstrap.ts)" -le 1250 ] || exit 1
[ "$(rg -l 'WorkspaceMountBridge' | wc -l)" -le 3 ] || exit 1
! rg -q 'new WorkspaceMountBridge' packages/runtime-composer/src/ || exit 1
[ -f packages/persistence-client/src/bootstrap.ts ] || exit 1
grep -q 'pryzm.bootstrap.persistence' packages/persistence-client/src/bootstrap.ts || exit 1
pnpm --filter @pryzm/persistence-client test -- --reporter=default
```

Closes: D.4.2 PR + de-quarantines `pryzm-persistence`. Wave 2 day 10.

### `d4-3` — Physics extraction

```bash
[ "$(wc -l < src/engine/EngineBootstrap.ts)" -le 970 ] || exit 1
[ "$(rg -l 'EngineBootstrap' src/physics/ | wc -l)" -eq 0 ] || exit 1
[ -f packages/physics-host/src/bootstrap.ts ] || exit 1
grep -q 'pryzm.bootstrap.physics' packages/physics-host/src/bootstrap.ts || exit 1
! rg "import \* as THREE\|from 'three'" packages/physics-host/src/ || exit 1
! rg 'requestAnimationFrame' packages/physics-host/src/ || exit 1
grep -q 'runtime\.frame\.subscribe' packages/physics-host/src/Stepper.ts || exit 1
```

Closes: D.4.3 PR. Wave 3 day 4.

### `d4-4` — Input + selection extraction

```bash
[ "$(wc -l < src/engine/EngineBootstrap.ts)" -le 630 ] || exit 1
[ "$(rg -l 'EngineBootstrap' src/tools/ | wc -l)" -eq 0 ] || exit 1
[ -f packages/input-host/src/bootstrap.ts ] || exit 1
grep -q 'pryzm.bootstrap.input' packages/input-host/src/bootstrap.ts || exit 1
[ "$(rg -c 'runtime\.tools\.register' src/ui/Layout.ts 2>/dev/null || echo 0)" -eq 0 ] || exit 1
[ "$(rg -c 'runtime\.tools\.register' packages/input-host/src/ToolBindings.ts)" -ge 20 ] || exit 1
! rg "import \* as THREE\|from 'three'" packages/input-host/src/ || exit 1
! rg "from 'react'" packages/input-host/src/ || exit 1
```

Closes: D.4.4 PR. Wave 3 day 8.

### `d4-5` — Re-export shim

```bash
[ "$(wc -l < src/engine/EngineBootstrap.ts)" -le 35 ] || exit 1
[ "$(rg -l 'WorkspaceMountBridge' | wc -l)" -eq 0 ] || exit 1
START_IMPORTERS=124
END_IMPORTERS=$(rg -L 'EngineBootstrap' src apps packages | wc -l)
[ "$((START_IMPORTERS - END_IMPORTERS))" -ge 80 ] || exit 1
[ "$(rg -c 'composeRuntime\(' src/main.ts)" -ge 1 ] || exit 1
[ "$(rg -c 'new EngineBootstrap' src/main.ts)" -eq 0 ] || exit 1
pnpm --filter @pryzm/lint-config test -- boundaries-l4-l5
[ -f .ga-gate/baselines/engine-bootstrap-importers.json ] || exit 1
```

Closes: D.4.5 PR + Wave 3 + Boolean #4 ✅. Wave 3 day 10.

### `d4-exit` — Composite

```bash
pnpm ga-gate --check d4-1 && \
pnpm ga-gate --check d4-2 && \
pnpm ga-gate --check d4-3 && \
pnpm ga-gate --check d4-4 && \
pnpm ga-gate --check d4-5 && \
[ "$(rg -c '(?<=import.*from\s+["])three(?=["])' packages/ -t ts | grep -v 'renderer-three' | wc -l)" -eq 0 ] && \
pnpm test:phase-d-real-binding
```

Closes: D.4 + Wave 3.

---

## §4 — Wave-exit verifiers

### `wave-1-exit`

```bash
# Tasks 1–3: the three tripwire scripts (composite, run together)
pnpm ga-gate --check wave-1-exit

# Task 4: workflows green; quarantine convention scaffolded
pnpm test:ci   # today: 9/9 green, 0 quarantined
test -f .github/ISSUE_TEMPLATE/quarantine.md

# Task 5: §10 cadence (≥ 4 dated entries)
[ "$(rg -c '^### 2026-' docs/archive/pryzm3-internal/03-CURRENT-STATE.md | head -1)" -ge 4 ]

# Task 6: 0 stale MARKDOWN LINK TARGETS in the seven active wave-plan docs.
# Matches `](…OLD…)` syntax only — plain prose mentions are allowed because
# the convention paragraphs in 02-WAVE-1-TRIPWIRES.md §7 and file 11 §8 row 8
# necessarily quote the OLD strings to document the rewrite.
# The 344-reach repo-wide rewrite is Wave 8 T1 (file 11 §8 row 8), NOT Wave 1.
[ "$(rg --no-heading -n '\]\(.{0,200}?(00_NEW_ARCHITECTURE/|wireup-S72/)' docs/archive/pryzm3-internal/04-PLAN-FORWARD/[0-9][0-9]-*.md | wc -l)" -eq 0 ]

# Task 7: importer-snapshot file format scaffolded
[ -f .ga-gate/baselines/engine-bootstrap-importers.json ]
jq -e '.deletionTargetWave == 7' .ga-gate/baselines/engine-bootstrap-importers.json
```

Closes: Wave 1 (S78-WIRE D-last). **Verified all-green 2026-04-30 night** — see `03-CURRENT-STATE.md §10` "2026-04-30 night" entry.

### `wave-2-exit`

```bash
# D.4.1 Option A (founder 2026-04-30 night): SceneBootstrap.ts landed in packages/renderer/,
# not packages/renderer-three/ — see 01-CRITICAL-PATH-D4.md §3 STATUS-UPDATE.
! rg -q 'new WorkspaceMountBridge' packages/runtime-composer/src/
[ -f packages/renderer/src/SceneBootstrap.ts ]
[ -f packages/persistence-client/src/bootstrap.ts ]
grep -q 'pryzm.bootstrap.scene' packages/renderer/src/SceneBootstrap.ts
grep -q 'pryzm.bootstrap.persistence' packages/persistence-client/src/bootstrap.ts
[ "$(pnpm test:ci -- --reporter=basic 2>&1 | grep -c 'PASS')" -ge 8 ]
```

Closes: Wave 2 (S79-WIRE D-last). ✅ DONE — `packages/renderer/src/SceneBootstrap.ts` 188 LOC, 61/61 tests green (2026-04-30 night).

### `wave-3-exit` (= `d4-exit`)

```bash
pnpm ga-gate --check d4-exit
```

Closes: Wave 3 (S80-WIRE D-last) + Boolean #4 ✅.

### `wave-4-exit`

```bash
# Track A
[ "$(rg -c 'unknown' packages/runtime-composer/src/types.ts)" -eq 0 ]
[ "$(rg -c 'as unknown as' packages/runtime-composer/src/)" -eq 0 ]
pnpm --filter @pryzm/runtime-composer test -- --reporter=verbose | grep -c '✓ slot:' | grep -q '^14$'

# Track B
[ "$(rg -c 'platformRouter\.start' src/main.ts)" -ge 1 ]
[ "$(wc -l < src/main.ts)" -le 50 ]
pnpm ga-gate --check boundary-lint-l7
[ "$(rg -l 'WorkspaceMountBridge' | wc -l)" -eq 0 ]
```

Closes: Wave 4 (S81-WIRE D-last).

### `wave-5-exit`

```bash
TARGET=670
ACTUAL=$(rg -c '\(window as any\)' src --type ts | awk -F: '{s+=$2} END {print s}')
[ "$ACTUAL" -le "$TARGET" ]
[ -f src/legacy/window-shim.ts ]
NON_SHIM_CASTS=$(rg -c '\(window as any\)' src --type ts -g '!src/legacy/window-shim.ts' | awk -F: '{s+=$2} END {print s}')
[ "$NON_SHIM_CASTS" -le 520 ]
grep -q "'pryzm/no-window-cast': 'error'" .eslintrc.json
NEW_BASELINE=$(jq .count .ga-gate/baselines/cast-count.json)
[ "$NEW_BASELINE" -le 670 ]
pnpm test:ci   # 9/9 green expected (vi-parity de-quarantined)
```

Closes: Wave 5 (S82-WIRE D-last) + Boolean #6 ✅ (workflows fully green).

### `wave-6-exit` (= convergence gate)

```bash
pnpm test:phase-b-binding
[ "$(find src/ui/__tests__/binding -name '*Panel.spec.ts' | wc -l)" -ge 40 ]
[ "$(rg -c '\(window as any\)\.viewRegistry' src/ui/)" -eq 0 ]
pnpm test:phase-c-binding
[ "$(find src/ui/toolbar/__tests__ -name '*Toolbar.spec.ts' | wc -l)" -ge 30 ]
[ "$(rg -c '\(window as any\)\.commandManager' src/ui/toolbar/)" -eq 0 ]
[ "$(rg -c '^\s*\x27[a-z-]+\x27:' packages/command-bus/src/commands.ts)" -ge 280 ]
COUNT=$(pnpm pryzm-3-day-1-dry-run | grep -c '✓\|⚠ on-track')
[ "$COUNT" -ge 6 ]
```

Closes: Wave 6 (S83-WIRE D-last) + **Phase F unblocked** + 6/9 booleans on-track.

### `wave-7-exit` (= structural PRYZM 3 day 1)

```bash
pnpm pryzm-3-day-1
```

Closes: Wave 7 (S87-WIRE D-last) + Booleans #1, #2, #3, #5 fully ✅.

---

## §5 — Cross-cutting principle gates (always-on)

### `p1-single-compose`

```bash
tsx scripts/ci-check-single-compose.ts
```

Greps for any composition outside `composeRuntime()`. Today: soft-fail (counts violations); turns hard-fail at end of Wave 3 (D.4.5 close).

### `p2-three-owner`

```bash
pnpm --filter @pryzm/lint-config test:p2
```

Boundary lint blocks `import * as THREE` outside `packages/renderer-three/`. Hard-fail since Wave 3 (D.4.5).

### `p3-single-raf`

```bash
tsx scripts/ci-check-single-raf.ts
```

Greps for `requestAnimationFrame(` outside `packages/runtime-composer/src/scheduler.ts` (Wave 7: this is the canonical owner location). Soft-fail until Wave 7 (S85-WIRE close), hard-fail thereafter.

### `p4-no-window-any`

```bash
tsx scripts/ci-check-no-window-any.ts
```

The cast tripwire from §2. Soft-fail tripwire (count must not increase) until Wave 5 close, hard-fail at error-level after Wave 5 (only `src/legacy/window-shim.ts` allowed).

### `p5-domain-purity`

```bash
tsx scripts/ci-check-domain-purity.ts
```

Greps `packages/domain/**/*.ts` for any I/O / DOM / THREE / `import` from non-stdlib. Hard-fail since project start.

### `p6-no-direct-store-writes`

```bash
tsx scripts/ci-check-no-direct-store-writes.ts
```

Greps UI files for direct store mutation (e.g. `store.set(...)` outside command handlers). Hard-fail since Phase 2.

### `p7-vis-not-ui`

```bash
pnpm --filter @pryzm/visibility test:contract
```

Asserts `packages/visibility/` has no UI imports. Hard-fail since Phase 3 Q1.

### `p8-spans-on-pr`

```bash
tsx tools/ga-gate/check-spans.ts
```

Reads PR diff; verifies new exported functions have spans. Hard-fail since Wave 1.

---

## §6 — `pryzm-3-day-1` (the convergence acceptance script)

This is the single command that proves PRYZM 3 (structural) exists. Lives at `apps/bench/pryzm-3-day-1.ts`.

```bash
pnpm pryzm-3-day-1
```

Composite (full content):

```ts
// apps/bench/pryzm-3-day-1.ts
import { execSync } from 'node:child_process';

const checks: Array<{ name: string; cmd: string; expect: (out: string) => boolean }> = [
  // Code state
  { name: 'src/ folders',       cmd: "ls src/",                                     expect: o => o.trim().split(/\s+/).length === 2 },
  { name: 'window-any in ui/',  cmd: "rg -c '\\(window as any\\)' src/ui/ --type ts | awk -F: '{s+=$2} END {print s+0}'", expect: o => parseInt(o) === 0 },
  { name: 'rAF owners',         cmd: "rg -l 'requestAnimationFrame\\(' --type ts | wc -l",                                expect: o => parseInt(o) === 1 },
  { name: 'EngineBootstrap',    cmd: "rg -l 'EngineBootstrap' src apps packages plugins | wc -l",                          expect: o => parseInt(o) === 0 },
  { name: 'bundle size',        cmd: "stat -c%s apps/editor/dist/assets/index-*.js | awk '{print int($1/1024/1024)}'",     expect: o => parseInt(o) <= 4 },
  // Runtime state
  { name: 'composeRuntime callers', cmd: "rg -l 'composeRuntime\\(' apps/ src/main.ts | wc -l",                            expect: o => parseInt(o) >= 4 },
  // Verification state
  { name: 'pnpm ga-gate',           cmd: "pnpm ga-gate 2>&1 | tail -1",                                                    expect: o => o.includes('PASS') },
  { name: 'workflows green',         cmd: "pnpm test:ci -- --reporter=basic 2>&1 | grep -c 'PASS'",                         expect: o => parseInt(o) >= 9 },
  { name: 'lint-pryzm-no-window',   cmd: "grep -c \"'pryzm/no-window-cast': 'error'\" .eslintrc.json",                     expect: o => parseInt(o) >= 1 },
  { name: 'lint-pryzm-no-raf',      cmd: "grep -c \"'pryzm/no-raf': 'error'\" .eslintrc.json",                             expect: o => parseInt(o) >= 1 },
];

let pass = 0;
for (const c of checks) {
  const out = execSync(c.cmd, { encoding: 'utf8' }).trim();
  const ok = c.expect(out);
  console.log(`  ${ok ? '✓' : '✗'} ${c.name.padEnd(35)} = ${out}`);
  if (ok) pass++;
}

const totalBooleans = 9;
const structuralBooleans = 6;  // 1, 2, 3, 4, 5, 6
const phaseFBooleans = 3;      // 7, 8, 9 (in active dev post-Wave-6)

console.log(`\n${pass}/${checks.length} structural checks passed.`);
if (pass === checks.length) {
  console.log(`\n  ${structuralBooleans} of 9 booleans ✅ — STRUCTURAL CONVERGENCE REACHED.`);
  console.log(`  ${phaseFBooleans} of 9 booleans in active Phase F development.`);
  console.log(`  Cleared to label this SHA "PRYZM 3 day 1 (structural)".`);
  process.exit(0);
} else {
  console.log(`\n  Structural convergence NOT reached. Re-run after fixes.`);
  process.exit(1);
}
```

---

## §7 — Catalog summary table

| Verifier | Wave closes | Boolean | Always-on? |
|---|:---:|:---:|:---:|
| `loc-tripwire` | 7 | #5 | ✓ (since W1) |
| `cast-tripwire` | 7 | #2 | ✓ (since W1) |
| `raf-tripwire` | 7 | #3 | ✓ (since W1) |
| `d4-1` … `d4-5` | 2-3 | #4 (at d4-5) | per-PR |
| `wave-1-exit` | 1 | — | wave close |
| `wave-2-exit` | 2 | — | wave close |
| `wave-3-exit` | 3 | #4 | wave close |
| `wave-4-exit` | 4 | — | wave close |
| `wave-5-exit` | 5 | #6 | wave close |
| `wave-6-exit` (convergence) | 6 | (6/9 on-track) | wave close |
| `wave-7-exit` (= `pryzm-3-day-1`) | 7 | #1, #2, #3, #5 | structural day-1 |
| `p1-single-compose` | (Wave 3 hard-fail) | #4 | ✓ |
| `p2-three-owner` | (Wave 3 hard-fail) | (P2) | ✓ |
| `p3-single-raf` | (Wave 7 hard-fail) | #3 | ✓ |
| `p4-no-window-any` | (Wave 5 hard-fail) | #2 | ✓ |
| `p5-domain-purity` | always | (P5) | ✓ |
| `p6-no-direct-store-writes` | always | (P6) | ✓ |
| `p7-vis-not-ui` | always | (P7) | ✓ |
| `p8-spans-on-pr` | always | (P8) | ✓ |
| `no-new-doc-files` (Rule 1) | always | — | ✓ |
| `no-vacuous-binding-test` (Rule 2) | always | — | ✓ |
| `require-weekly-delta` (Rule 3) | always | — | ✓ (weekend window) |
| `no-phase-f-prs-pre-gate` (Rule 4) | (Wave 6 unblock) | (#7,8,9 gate) | ✓ |

### `ctrl-z-wired` — Wave 36 U-5 (Ctrl-Z ring-buffer regression guard)

| Field | Value |
|---|---|
| Command | `tsx tools/ga-gate/check-ctrl-z-wired.ts` |
| Target | `undoPatch()` ≥ 1 call in `src/engine/subsystems/initUI.ts`; zero unconditional `commandManager.undo()` calls (fallback lines must carry `TODO(Wave36-U1)`) |
| Wave that closes | Wave 36 U-5 (2026-05-04) |
| Boolean | — |
| Failure | `[FAIL] check-ctrl-z-wired: no undoPatch() call found` or `unconditional commandManager.undo() found` |

---

## §7 — Catalog summary table

| Verifier | Wave closes | Boolean | Always-on? |
|---|:---:|:---:|:---:|
| `loc-tripwire` | 7 | #5 | ✓ (since W1) |
| `cast-tripwire` | 7 | #2 | ✓ (since W1) |
| `raf-tripwire` | 7 | #3 | ✓ (since W1) |
| `d4-1` … `d4-5` | 2-3 | #4 (at d4-5) | per-PR |
| `wave-1-exit` | 1 | — | wave close |
| `wave-2-exit` | 2 | — | wave close |
| `wave-3-exit` | 3 | #4 | wave close |
| `wave-4-exit` | 4 | — | wave close |
| `wave-5-exit` | 5 | #6 | wave close |
| `wave-6-exit` (convergence) | 6 | (6/9 on-track) | wave close |
| `wave-7-exit` (= `pryzm-3-day-1`) | 7 | #1, #2, #3, #5 | structural day-1 |
| `p1-single-compose` | (Wave 3 hard-fail) | #4 | ✓ |
| `p2-three-owner` | (Wave 3 hard-fail) | (P2) | ✓ |
| `p3-single-raf` | (Wave 7 hard-fail) | #3 | ✓ |
| `p4-no-window-any` | (Wave 5 hard-fail) | #2 | ✓ |
| `p5-domain-purity` | always | (P5) | ✓ |
| `p6-no-direct-store-writes` | always | (P6) | ✓ |
| `p7-vis-not-ui` | always | (P7) | ✓ |
| `p8-spans-on-pr` | always | (P8) | ✓ |
| `ctrl-z-wired` | Wave 36 U-5 | — | ✓ (since Wave 36) |
| `no-new-doc-files` (Rule 1) | always | — | ✓ |

---

## §8 — When a verifier is wrong

Per `13-RISK-REGISTER.md` R10: a verifier might have a bug (false-positive green or false-negative red). When that happens:

1. **Architecture lead investigates** within 24 hours of detection.
2. **Verifier is corrected** in a doc-only PR (this catalog) + a code-only PR (`tools/ga-gate/`).
3. **The wave that was incorrectly closed is re-opened**: the wave file's "Exit gate evidence" section is amended; the boolean state is re-evaluated; if a boolean was prematurely declared ✅, it is reverted with a §10 incident log entry.

The catalog is normative, but it is **fallible**. The mechanism for correction is itself a verifier (the architecture lead's manual smoke test from each wave file's "What the founder sees" section). When verifier and smoke test disagree, the smoke test wins and the verifier is fixed.
