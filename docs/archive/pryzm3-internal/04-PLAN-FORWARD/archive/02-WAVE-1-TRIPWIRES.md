# 02 — Wave 1: Stop the Bleed (S78-WIRE, weeks 1–2)

> **Anchored to**: `../01-VISION.md §8` (discipline rules 1, 3, 6); `../02-ARCHITECTURE.md §4` (the 6 cross-cutting CI gates that need infrastructure to enforce).
> **Boolean it advances**: none directly. **Wave 1 is the infrastructure that makes Waves 2–7 possible to verify.** Without these tripwires, every subsequent wave is "we shipped the PR" rather than "the verifier is green".
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger row, §4 next-actions, §2 booleans as applicable).
> **Why this wave exists**: the 13 metrics in `../03-CURRENT-STATE.md §1` are drifting in the wrong direction (cast +9, EngineBootstrap +3 LOC, importers +14, rAF +10) **because nothing blocks regressions**. Wave 1 installs the gates so the rest of the plan can hold ground.

---

## §1 — The 7 tasks

> **2026-04-30 night — STATUS: ALL 7 TASKS CLOSED.** `pnpm ga-gate --check wave-1-exit` returns 3/3 PASS on HEAD; the three synthetic regressions all FAIL with exit 1 as designed. See `../03-CURRENT-STATE.md §10` "2026-04-30 night" entry for the full closeout log.

| # | Task | Owner | Effort | Hard exit | Status |
|---|---|---|---|---|:---:|
| 1 | EngineBootstrap LOC tripwire | tooling | 1 day | `pnpm ga-gate --check loc-tripwire` exits non-zero on a synthetic >2,100-LOC commit; passes on HEAD | ✅ DONE 2026-04-30 |
| 2 | `(window as any)` cast-count tripwire | tooling | 2 days | `pnpm ga-gate --check cast-tripwire` blocks a PR adding a new cast; passes on HEAD | ✅ DONE 2026-04-30 |
| 3 | rAF-owner tripwire | tooling | 1 day | `pnpm ga-gate --check raf-tripwire` blocks a synthetic new rAF; passes on HEAD | ✅ DONE 2026-04-30 |
| 4 | Quarantine the 2 persistent-red workflows | tooling | 2 days | Workflows already 9/9 green on re-verify; convention scaffolded in `__tests__/quarantined/**` for future use | ✅ DONE 2026-04-30 evening (premise change — see §5 STATUS UPDATE) |
| 5 | Restart §10 weekly delta cadence in `../03-CURRENT-STATE.md` | architecture lead | 0.5 day | §10 carries ≥ 4 dated entries (today: 8) | ✅ DONE 2026-04-30 |
| 6 | Doc-link sweep | tooling | 0.5 day | Scope partition (see §7 below): the active 04-PLAN-FORWARD/[0-9][0-9]-*.md files contain no stale OLD link targets outside explicit prose-describing-the-rewrite blocks; the 344-reach repo-wide rewrite is owned by Wave 8 T1 (file 11 §8 row 8) | ✅ DONE 2026-04-30 (scope partition recorded; Wave 1 portion verified) |
| 7 | Snapshot file format for the future D.4.5 residual importers | tooling | 0.5 day | `.ga-gate/baselines/engine-bootstrap-importers.json` exists with the schema documented in §8 | ✅ DONE 2026-04-30 (file scaffolded; D.4.5 PR will populate the `files: []` array) |
| 1.5 | `src/main.ts` boot-order correction (NOT a new tripwire — paint-fast Phase A vs. deferred Phase B) | architecture lead | 0.25 day | Landing DOM mounts via `PlatformRouter.start()` BEFORE the four module-load singleton hand-offs (`UiPreferences`, `gridDrawingHUD`, `dataCommandCenter`, `syncStateDetailDrawer`) and the 2,433 LOC `PlatformShell` constructor; `_heavyWiringDone` gates `workspaceMount.{ensure,show}()` so a fast project-open click cannot land before `window.platformShell` exists; brings `bootPlatform()` into compliance with §01 §1.1; full diagnosis + evidence in `../03-CURRENT-STATE.md §10` (2026-04-30 night entry) | ✅ DONE 2026-04-30 night |
| 1.5b | App-Shell paint-on-first-byte landing skeleton in `index.html` (NOT a new tripwire — boot-shell carve-out, sibling of 1.5 above) | architecture lead | 0.25 day | The boot-order correction alone left the user staring at a blank pale-blue body for >1.5 s in dev mode while Vite resolves the ~233-module plugin graph; no `bootPlatform()` re-ordering can move first paint earlier than the JS bundle finishes loading. Inline `<style>` (~2 KB, `lp-skel-*` prefixed) + matching markup inside `#platform-root` with `data-pryzm-skeleton="landing"` + inline `<script>` that sets `<html data-pryzm-auth="in">` for signed-in users (so they skip the skeleton) and queues pre-boot CTA clicks into `window.__pryzmPendingActions` for the real `LandingPage` to drain. `LandingPage.ts` removes the skeleton on mount + replays the first queued action; `PlatformRouter.start()`'s signed-in branch removes it before `showHub`. Documented as an explicit carve-out from the AppTheme.ts §05 §2.1 "sole CSS injection" comment because the boot shell paints *before* JS runs. Full diagnosis + evidence in `../03-CURRENT-STATE.md §10` (2026-04-30 late entry) | ✅ DONE 2026-04-30 late |

Total effort spent: **2 engineer-days** (tripwire scripts + composite wiring + doc reconciliation, against an estimate of 7.5; the discount came from task 4's premise change and from re-using `pnpm ga-gate`'s existing `--check` switch).

**Wave 1 closes 2026-04-30. The team has earned the right to start Wave 2 (D.4.1 + D.4.2).**

---

## §2 — Task 1: EngineBootstrap LOC tripwire

### Implementation

`tools/ga-gate/check-engine-bootstrap-loc.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Tripwire: EngineBootstrap.ts LOC.
 *
 * Hard-fail at > 2,100 LOC (regression gate — today's value is 2,066).
 * Soft-warn at > 200 LOC (vision target — Wave 7 deletes the file entirely).
 *
 * Anchored to: 04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md §1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = 'src/engine/EngineBootstrap.ts';
const HARD_FAIL = 2100;
const SOFT_WARN = 200;

function loc(path: string): number {
  return readFileSync(path, 'utf8').split('\n').length;
}

function main(): number {
  const n = loc(FILE);
  if (n > HARD_FAIL) {
    console.error(`[loc-tripwire] FAIL: ${FILE} = ${n} LOC > ${HARD_FAIL} (hard fail).`);
    console.error(`  This is a regression. The Wave 7 target is < 35 LOC (a re-export shim).`);
    console.error(`  Read: docs/archive/pryzm3-internal/04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md`);
    return 1;
  }
  if (n > SOFT_WARN) {
    console.warn(`[loc-tripwire] WARN: ${FILE} = ${n} LOC > ${SOFT_WARN} (soft warn). Wave 7 target is < 35.`);
    return 0;
  }
  console.log(`[loc-tripwire] OK: ${FILE} = ${n} LOC.`);
  return 0;
}

process.exit(main());
```

### Wiring into `pnpm ga-gate`

`tools/ga-gate/index.ts`:

```ts
import { spawnSync } from 'node:child_process';

const checks: Array<{ name: string; cmd: string }> = [
  { name: 'loc-tripwire',  cmd: 'tsx tools/ga-gate/check-engine-bootstrap-loc.ts' },
  { name: 'cast-tripwire', cmd: 'tsx tools/ga-gate/check-cast-count.ts' },
  { name: 'raf-tripwire',  cmd: 'tsx tools/ga-gate/check-raf-count.ts' },
  // ... existing checks
];

const failed = checks.filter(c => spawnSync('sh', ['-c', c.cmd], { stdio: 'inherit' }).status !== 0);
process.exit(failed.length === 0 ? 0 : 1);
```

### Verifier (Wave 1 task #1 done when)

```bash
# Synthetic regression: prepend 50 lines to EngineBootstrap.ts and confirm the gate fails
cp src/engine/EngineBootstrap.ts /tmp/eb.bak
yes '// noise' | head -100 >> src/engine/EngineBootstrap.ts
pnpm ga-gate --check loc-tripwire
test $? -eq 1 || { echo "TRIPWIRE BROKEN"; mv /tmp/eb.bak src/engine/EngineBootstrap.ts; exit 1; }
mv /tmp/eb.bak src/engine/EngineBootstrap.ts
pnpm ga-gate --check loc-tripwire   # should pass on restored HEAD
```

---

## §3 — Task 2: `(window as any)` cast-count tripwire

### Implementation

`tools/ga-gate/check-cast-count.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Tripwire: (window as any) reaches across src/.
 *
 * Hard-fail if the count increases commit-over-commit.
 * Baseline lives at .ga-gate/baselines/cast-count.json and is updated
 * exactly when a sprint close ratifies a new lower number.
 *
 * Anchored to: 01-VISION.md §2 P4; 04-PLAN-FORWARD/09-WAVE-5-CAST-DELETION.md.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const BASELINE_FILE = '.ga-gate/baselines/cast-count.json';
const PATTERN = '(window as any)';

function count(): number {
  const out = execSync(
    `rg -c '${PATTERN.replace(/[()]/g, m => '\\' + m)}' src --type ts | awk -F: '{s+=$2} END {print s}'`,
    { encoding: 'utf8' }
  );
  return parseInt(out.trim() || '0', 10);
}

function loadBaseline(): number {
  if (!existsSync(BASELINE_FILE)) return Number.MAX_SAFE_INTEGER;  // first run = anything passes
  return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).count;
}

function main(): number {
  const current = count();
  const baseline = loadBaseline();

  if (current > baseline) {
    console.error(`[cast-tripwire] FAIL: ${PATTERN} count = ${current} > baseline ${baseline}.`);
    console.error(`  A regression added ${current - baseline} new cast(s).`);
    console.error(`  Read: docs/archive/pryzm3-internal/04-PLAN-FORWARD/09-WAVE-5-CAST-DELETION.md`);
    return 1;
  }

  if (current < baseline) {
    // ratchet: lower the baseline so we cannot regress to it
    writeFileSync(BASELINE_FILE, JSON.stringify({ count: current, ratchedAt: new Date().toISOString() }, null, 2));
    console.log(`[cast-tripwire] OK: ${current} (ratchet lowered from ${baseline}).`);
  } else {
    console.log(`[cast-tripwire] OK: ${current} = baseline.`);
  }
  return 0;
}

process.exit(main());
```

### Initial baseline

`.ga-gate/baselines/cast-count.json`:

```json
{
  "count": 2070,
  "ratchedAt": "2026-04-30T00:00:00Z",
  "comment": "Wave 1 initial baseline. Wave 5 target: 670. Wave 7 target: 0."
}
```

### Verifier

```bash
# Synthetic regression: add a cast to a file
cp src/main.ts /tmp/main.bak
echo 'const x = (window as any).foo;' >> src/main.ts
pnpm ga-gate --check cast-tripwire
test $? -eq 1 || { echo "TRIPWIRE BROKEN"; mv /tmp/main.bak src/main.ts; exit 1; }
mv /tmp/main.bak src/main.ts

# Confirm pass on HEAD
pnpm ga-gate --check cast-tripwire
test $? -eq 0
```

### What the PR comment looks like when blocked

GitHub Actions / Replit CI integration (`tools/ga-gate/post-pr-comment.ts`):

```
🚨 ga-gate failed: cast-tripwire

This PR adds 3 new `(window as any)` cast(s):
  - src/ui/PropertyPanel.ts:1247 (line added by this PR)
  - src/ui/SheetEditorPanel.ts:889  (line added by this PR)
  - src/services/persistence/AutosaveDriver.ts:42 (line added by this PR)

The ratchet baseline is 2,070 (set 2026-04-30). PRs are not allowed to increase the count.

To fix:
  1. Replace `(window as any).<service>` with `runtime.<service>` (typed access).
  2. If the cast is genuinely necessary (e.g. browser global), add it to the allowlist
     in src/legacy/window-shim.ts (currently empty until Wave 5).

See: docs/archive/pryzm3-internal/04-PLAN-FORWARD/09-WAVE-5-CAST-DELETION.md §3 for the migration patterns.
```

---

## §4 — Task 3: rAF-owner tripwire

### Implementation

`tools/ga-gate/check-raf-count.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Tripwire: requestAnimationFrame owner files.
 *
 * Hard-fail if count > today's empirically-measured ceiling (69 as of 2026-04-30 evening;
 * the morning audit in `03-CURRENT-STATE.md §1` recorded 68, which was off by one — the
 * shipped tripwire holds the empirical line per discipline rule 1).
 * Soft-warn at any count > 1 (P3 absolute target — only `packages/frame-scheduler` may own rAF).
 *
 * Anchored to: 01-VISION.md §2 P3; 04-PLAN-FORWARD/11-WAVE-7-CLEANUP-PHASE-F.md §3.
 */
import { execSync } from 'node:child_process';

const HARD_FAIL = 69;
const SOFT_WARN = 1;

function count(): number {
  // The explicit `.` path arg matters: when stdin is not a TTY (the default
  // under `execSync` and CI), ripgrep would otherwise read from stdin and
  // silently report 0 matches.
  const out = execSync(
    `rg -l 'requestAnimationFrame\\(' . --type ts -g '!node_modules' -g '!dist' -g '!build' -g '!.next' | wc -l`,
    { encoding: 'utf8' }
  );
  return parseInt(out.trim() || '0', 10);
}

function main(): number {
  const n = count();
  if (n > HARD_FAIL) {
    console.error(`[raf-tripwire] FAIL: ${n} files own requestAnimationFrame > ${HARD_FAIL} (hard fail).`);
    console.error(`  Wave 7 target is exactly 1 file: packages/runtime-composer/src/scheduler.ts.`);
    return 1;
  }
  if (n > SOFT_WARN) {
    console.warn(`[raf-tripwire] WARN: ${n} files own requestAnimationFrame (target = ${SOFT_WARN}).`);
    return 0;
  }
  console.log(`[raf-tripwire] OK: ${n} owner.`);
  return 0;
}

process.exit(main());
```

### Verifier

```bash
# Synthetic regression: add an rAF in a file that doesn't have one
cp packages/visibility/src/index.ts /tmp/vis.bak
echo 'requestAnimationFrame(() => {});' >> packages/visibility/src/index.ts
pnpm ga-gate --check raf-tripwire
test $? -eq 1 || { mv /tmp/vis.bak packages/visibility/src/index.ts; exit 1; }
mv /tmp/vis.bak packages/visibility/src/index.ts
```

---

## §5 — Task 4: Quarantine the 2 persistent-red workflows

> **2026-04-30 evening — STATUS UPDATE (premise change)**: Empirical re-verification of HEAD this evening showed both workflows GREEN (`pryzm-persistence` 144/144, `pryzm-vi-parity` 82/82) and `ifc-export-tier1` GREEN (16/16). The morning audit's "❌ red (persistent)" claim was a **workflow-runner cold-start npx hang** (`Need to install vitest@4.1.5? Ok to proceed? (y) `) — not a code defect. Neither the `WorkspaceMountBridge` leak theory (rg in `packages/persistence-client/__tests__/` returns 0 hits) nor the `(window as any).visibilityRegistry` theory (rg in `packages/visibility/__tests__/` returns 0 hits) matched what the test files actually assert. **Quarantine deferred — 0 tests need quarantining today.** Convention scaffolding installed anyway so a future red test has a documented place to go. See `../03-CURRENT-STATE.md §10` "2026-04-30 evening" entry for the discipline lesson recorded. The original task body below is preserved for the convention it documents (directory layout, scripts, tracking-issue template); the **Implementation** and **Verifier** subsections are rewritten to match the new reality.

### Background (original — preserved as the convention spec, not a current-state claim)

The design intent of task 4: when a workflow goes persistently red because of a known-cause defect that another wave fixes, **quarantine it instead of letting CI report a false-green by ignoring it**. Quarantine is honest: don't pretend the test is flaky, don't pretend it's green, mark it known-bad with a fixed de-quarantine trigger.

The two workflows the morning audit named are no longer red, so neither is quarantined. The convention exists for the next time a real-red workflow appears.

### Implementation (as actually executed 2026-04-30 evening — scaffolding only)

**1.** Add `__tests__/quarantined/**` to the vitest `exclude` array in the two named packages (so a future test moved into that subdir is automatically skipped by the default test run, no manual flag needed):

```ts
// packages/persistence-client/vitest.config.ts AND packages/visibility/vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '__tests__/quarantined/**'],
  },
});
```

**2.** Add per-package scripts (in those two packages' `package.json`):

```json
{
  "scripts": {
    "test":             "vitest run",
    "test:ci":          "vitest run",
    "test:quarantined": "vitest run __tests__/quarantined --passWithNoTests"
  }
}
```

**3.** Add root orchestrator scripts (in root `package.json`) so the convention works at repo scope:

```json
{
  "scripts": {
    "test:ci":          "pnpm -r --workspace-concurrency=1 --if-present run test:ci",
    "test:quarantined": "pnpm -r --workspace-concurrency=1 --if-present run test:quarantined"
  }
}
```

**4.** Create the tracking-issue template (one file, since neither workflow currently needs quarantining):

`.github/ISSUE_TEMPLATE/quarantine.md` — Markdown issue template with **mandatory** fields: `Quarantined on`, `Quarantined by` (Wave + task number), `De-quarantine trigger` (must name a specific PR / wave-close / metric flip), `Owner`, `Root cause` (must cite actual log evidence — `tail -N <workflow_log>` or failing test names), `What unblocks de-quarantine`, `Verifier on de-quarantine` (the exact shell to run). The template is copied per incident; today, **0 incident files exist**.

**5.** Per-package `quarantined` dirs are NOT created today (no test goes into them). The first quarantine incident creates `<package>/__tests__/quarantined/` on demand.

### Verifier (matches the new reality)

```bash
# Workflow status reflects 9/9 green, 0 quarantined
pnpm --filter @pryzm/persistence-client test:ci   # exits 0
pnpm --filter @pryzm/visibility          test:ci   # exits 0
pnpm --filter @pryzm/persistence-client test:quarantined   # exits 0 (no tests, --passWithNoTests)
pnpm --filter @pryzm/visibility          test:quarantined   # exits 0 (no tests, --passWithNoTests)

# Convention scaffolded in both packages
grep -q "__tests__/quarantined/\*\*" packages/persistence-client/vitest.config.ts || exit 1
grep -q "__tests__/quarantined/\*\*" packages/visibility/vitest.config.ts          || exit 1

# Tracking-issue template exists (the per-incident files do NOT exist today)
[ -f .github/ISSUE_TEMPLATE/quarantine.md ] || exit 1

# Doc reflects the new state
grep -q 'quarantined' docs/archive/pryzm3-internal/03-CURRENT-STATE.md
```

### Honesty point (revised)

The morning audit's claim "❌ red (persistent)" for `pryzm-persistence` and `pryzm-vi-parity` was itself the very kind of stale-reporting failure this whole wave exists to prevent. Re-running the verifiers in `../03-CURRENT-STATE.md §1` *empirically* — not "from memory" or "from a 3-week-old audit trail" — turned 6/9 into 9/9 in one evening. **The §10 weekly cadence (task 5) is the structural fix for this drift; the convention scaffolded here (without moving any green tests) is the structural fix for the next regression.** The number reported from S78-WIRE forward in `../03-CURRENT-STATE.md §7` and §10 paragraphs is **9/9 green, 0 quarantined**.

---

## §6 — Task 5: Restart the §10 weekly delta cadence

### What

`../03-CURRENT-STATE.md §10` is the rolling weekly delta log. It had not been written for 3 weeks before the 2026-04-30 consolidation. Wave 1 task #5: backfill 3 weeks (already done in the consolidation; verify) AND set up the recurring cadence.

### Cadence

Every **Friday at sprint close** (or end-of-week if no sprint closes that week), an architecture-lead engineer:

1. Re-runs the 13 verifiers in `../03-CURRENT-STATE.md §1` and updates any changed values.
2. Re-renders the 9-boolean table in `../03-CURRENT-STATE.md §8`.
3. Writes one paragraph in `../03-CURRENT-STATE.md §10` summarising:
   - Which metrics moved this week (direction + magnitude)
   - Which wave we are in
   - Any incidents (wrong-direction drift on a tripwired metric)
   - Pointer to the specific PRs that drove the deltas

### Sample entry (the form)

```markdown
### 2026-05-15 (S79-WIRE D-last close)
Wave 2 closed. EngineBootstrap.ts dropped 2,066 → 1,243 LOC (D.4.1 + D.4.2 merged).
WorkspaceMountBridge reach dropped 5 → 3 files (composeRuntime + buildPersistence
deletions per D.4.2). Cast count flat at 2,070 (no Wave-5 work this sprint).
Importer count 124 → 89 (35 importers migrated). pryzm-persistence still quarantined
pending PR #N to de-quarantine on D.4.2 merge confirmation.
PRs: #N (D.4.1, scene), #N (D.4.2, persistence + bridge half-retire).
```

### Calendar reminder

Replit personal calendar reminder, every Friday 16:00 UTC, with the link to `../03-CURRENT-STATE.md` and a 5-minute checklist.

---

## §7 — Task 6: Doc-link sweep

> **2026-04-30 night — SCOPE PARTITION (discipline rule 1 reconciliation).** The original task body assumed the `00_NEW_ARCHITECTURE/` and `wireup-S72/` strings were a small handful of stale citations cleanable in 0.5 day. The same-day Round-5 audit (`../03-CURRENT-STATE.md §15.11.2`) measured the actual reach: **272 hits of `00_NEW_ARCHITECTURE/` across 77 PRYZM3 doc files plus 72 hits of `00_VISION/01_ARCHITECTURE/02_PLAN/` = 344 total reaches**. That is not Wave 1 work — it is a multi-day codemod. **The 344-reach rewrite is owned by Wave 8 task T1** in `15-PACKAGE-POPULATION-GAP.md §8 row 8` (effort: 2-3 days, deliverable: `scripts/codemod-restructure-2026-04-30.mjs`, gated by a path-validity CI check).
>
> **What stays in Wave 1 (this task)**: the narrower discipline that the **active 04-PLAN-FORWARD/[0-9][0-9]-*.md files** must not contain a stale OLD link target outside of explicit "prose-describing-the-rewrite" blocks (e.g. the OLD→NEW mapping table at `03-CURRENT-STATE.md §15.11.1`, the Wave-8 T1 deliverable text in file 11 §8 row 8, this very §7 STATUS block). Those prose blocks MUST literally contain the OLD strings to function — stripping them would break the documentation OF the rewrite. The Wave 1 verifier counts only **stale link targets outside such prose blocks**, in the active wave docs.
>
> **What moves to Wave 8 T1**: the bulk-rewrite of the remaining 344 reaches across the rest of `docs/archive/pryzm3-internal/` (e.g. `reference/`, `archive/superseded-2026-04-30/cross-references/`), source-code historical comments (`apps/*`, `plugins/*`, `packages/*` README files), and any external-style references that survived the consolidation.

### Background (preserved as the original intent)

After the 2026-04-30 consolidation, the active 4 docs reference `archive/superseded-2026-04-30/...` for historical sources. But other parts of the tree (the parent `docs/` tree, `apps/*` source comments, README files) still reference the old paths:
- `docs/00_NEW_ARCHITECTURE/` (old name for what is now `docs/archive/pryzm3-internal/`)
- `wireup-S72/...` (old name for what is now `docs/archive/pryzm3-internal/reference/wireup-2026/`)

### Implementation (Wave 1 portion — discipline-rule-1 honest)

The Wave 1 task ensures that within `docs/archive/pryzm3-internal/04-PLAN-FORWARD/[0-9][0-9]-*.md` (the seven active wave plans + critical-path doc), no NEW **markdown link target** points at a stale OLD path. The verifier deliberately matches markdown link target syntax `](…OLD…)` rather than the bare string OLD-path, because the convention paragraphs in this very §7 (and the Wave 8 T1 deliverable spec in file 11 §8 row 8) MUST quote the OLD strings as plain prose to function — stripping prose mentions would break the documentation OF the rewrite. A real bad-merge regression would land as a markdown link of the form `[some text](docs/<OLD_DIR>/foo.md)` where `<OLD_DIR>` is one of the renamed directories listed in the Background block above, and that IS what the verifier catches.

```bash
# 0 stale markdown link targets inside the active wave-plan files:
rg --no-heading -n '\]\(.{0,200}?(00_NEW_ARCHITECTURE/|wireup-S72/)' docs/archive/pryzm3-internal/04-PLAN-FORWARD/[0-9][0-9]-*.md
# Expect: 0 hits (verified 2026-04-30 night). Any hit is a Wave 1 incident.
```

### Implementation (Wave 8 T1 portion — owned elsewhere)

Tracked in `15-PACKAGE-POPULATION-GAP.md §8 row 8`. The bulk-rewrite codemod is:

```bash
# Run by the codemod (Wave 8 T1, S88-WIRE D1-D3):
node scripts/codemod-restructure-2026-04-30.mjs --apply
# Then verify:
[ "$(rg -c '00_NEW_ARCHITECTURE/' docs/ | grep -v ':0$' | wc -l)" -eq 0 ]
[ "$(rg -c '00_VISION/01_ARCHITECTURE/02_PLAN/' docs/ | grep -v ':0$' | wc -l)" -eq 0 ]
```

### Verifier (Wave 1 portion only — what this wave actually has to clear)

```bash
# 0 stale MARKDOWN LINK TARGETS in the active wave-plan + critical-path docs.
# (Plain prose mentions of the OLD strings are allowed and required by the
# convention paragraphs in §7 + file 11 §8 row 8.)
[ "$(rg --no-heading -n '\]\(.{0,200}?(00_NEW_ARCHITECTURE/|wireup-S72/)' docs/archive/pryzm3-internal/04-PLAN-FORWARD/[0-9][0-9]-*.md | wc -l)" -eq 0 ]
```

---

## §8 — Task 7: Snapshot the 41 D.4.5 residual importers

### Why

The ESLint rule in `01-CRITICAL-PATH-D4.md §7` forbids new imports from `src/engine/EngineBootstrap` after S81-WIRE. The allowlist is a frozen snapshot of the 41 importers that exist when D.4.5 lands. Today's count (per `../03-CURRENT-STATE.md §1`) is 124; D.4.1–D.4.4 migrate ~83, leaving ~41. The snapshot is taken when D.4.5 merges and stored at `.ga-gate/baselines/engine-bootstrap-importers.json`.

But Wave 1 needs to **scaffold the file format** so D.4.5 can write to it without inventing a schema mid-merge.

### Implementation

`.ga-gate/baselines/engine-bootstrap-importers.json` (created in Wave 1, populated in Wave 3):

```json
{
  "snapshotAt": null,
  "snapshotSha": null,
  "deletionTargetWave": 7,
  "files": [],
  "comment": "Populated by D.4.5 PR. Each entry is a relative path that is allowed to import from src/engine/EngineBootstrap as a type-only reference. New imports are blocked by eslint-plugin-pryzm/no-engine-bootstrap-shim. The list is deleted along with the shim itself in Wave 7."
}
```

### Verifier

```bash
[ -f .ga-gate/baselines/engine-bootstrap-importers.json ] || exit 1
jq -e '.deletionTargetWave == 7' .ga-gate/baselines/engine-bootstrap-importers.json || exit 1
```

---

## §9 — Wave 1 exit gate

The single shell command:

```bash
pnpm ga-gate --check wave-1-exit
```

…runs the 3-tripwire composite (tasks 1–3). The remaining 4 tasks (4–7) are non-tripwire deliverables verified by direct shell checks below. **All 7 are green on HEAD as of 2026-04-30 night.**

```bash
# Tasks 1–3: the three tripwire scripts (composite, run together)
pnpm ga-gate --check wave-1-exit                                                                        # 3/3 PASS

# Task 4: workflows green; quarantine convention scaffolded
pnpm test:ci                                                                                             # exits 0 (today: 9/9 green, 0 quarantined)
test -f .github/ISSUE_TEMPLATE/quarantine.md                                                             # quarantine template present

# Task 5: §10 cadence (≥ 4 dated entries; today: 8)
[ "$(rg -c '^### 2026-' docs/archive/pryzm3-internal/03-CURRENT-STATE.md | head -1)" -ge 4 ]

# Task 6: 0 stale MARKDOWN LINK TARGETS in the seven active wave-plan docs.
# Plain prose mentions of OLD strings are allowed (the convention paragraphs
# require them). Note: the repo-wide 344-reach rewrite is Wave 8 T1, NOT Wave 1.
[ "$(rg --no-heading -n '\]\(.{0,200}?(00_NEW_ARCHITECTURE/|wireup-S72/)' docs/archive/pryzm3-internal/04-PLAN-FORWARD/[0-9][0-9]-*.md | wc -l)" -eq 0 ]

# Task 7: importer-snapshot file format scaffolded
[ -f .ga-gate/baselines/engine-bootstrap-importers.json ]
jq -e '.deletionTargetWave == 7' .ga-gate/baselines/engine-bootstrap-importers.json
```

When all 7 return 0, Wave 1 closes. **As of 2026-04-30 night, all 7 return 0. The team has earned the right to start D.4.**

---

## §10 — What can go wrong in Wave 1

| Risk | Likelihood | Mitigation |
|---|:---:|---|
| Tripwire scripts contain bugs that block legitimate PRs | Medium | Each script has a synthetic-regression unit test (see verifier sections); enable `--dry-run` flag for the first 3 days |
| Quarantined tests get forgotten ("we'll fix them next sprint" indefinitely) | High without discipline | The tracking issue templates have a hard de-quarantine date (D.4.2 close, Wave 5 close); any open issue past the date is a §10 incident |
| Doc-link sweep breaks an external link (e.g. a marketing site referencing `00_NEW_ARCHITECTURE/`) | Low | Sweep is internal only — `--type md/ts/json` excludes external; spot-check `rg -l 00_NEW_ARCHITECTURE` outside the repo manually |
| The §10 weekly cadence slips again after the calendar reminder is set up | Medium | Discipline rule 3 of `12-DISCIPLINE-AND-DOD.md` is the merge gate: no PR merges between Friday 17:00 UTC and Monday 09:00 UTC unless the §10 entry was written |

---

## §11 — Connection to vision

Wave 1 doesn't touch a single line of `EngineBootstrap.ts`. It doesn't delete a single cast. It doesn't bind a single panel. **What it does is make the next 18 weeks honest.**

- **P3 (single rAF)**: Wave 1 task 3 freezes the 69-owner ceiling (empirical 2026-04-30 evening measurement) so Waves 2–7 cannot regress while consolidating toward 1.
- **P4 (no `(window as any)`)**: Wave 1 task 2 freezes the 2,070 ceiling so Wave 5 cannot land 1,400 deletions while someone else slips 50 new ones in.
- **P5 (mechanical layer boundaries)**: Wave 1 task 1 freezes the EngineBootstrap LOC ceiling so D.4 cannot be undone by a "quick fix" PR adding 100 lines back.
- **Discipline rule 3**: Wave 1 task 5 restarts the cadence that makes the 13 metrics stay live truth.

Without these tripwires, the rest of the plan is hope. With them, it is a measured ratchet.
