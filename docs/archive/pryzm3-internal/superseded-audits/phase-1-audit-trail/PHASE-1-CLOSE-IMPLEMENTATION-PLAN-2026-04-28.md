# PHASE 1 CLOSE — IMPLEMENTATION PLAN

> **Date**: 2026-04-28
> **Author**: post-audit follow-up to `PHASE-1-CODE-VS-SPEC-AUDIT-2026-04-28.md`
> **Goal**: Close every gap identified in the audit's §3 and §4 so that all
> Phase 1 exit criteria (across sub-phases 1A · 1B · 1C · 1D) hold both **at code
> level** and **on a clean clone**.
> **Audience**: an engineer or task-agent who will execute the work, plus the
> founder who needs to track progress.
> **Out of scope**: any new feature work; any Phase 2 / 2A scope; the
> human-process items (founder rest week, demo recording). Phase-1 process
> deferreds are tracked but not implemented here.

---

## §0 Executive summary

The audit identified **16 open items**: 3 HIGH (block "Phase 1 closes"), 5
MEDIUM (ship around), 8 LOW / process. This plan turns each one into a
concrete work item (`W-01` … `W-16`) with **exact file paths**, **the
specific code change**, **acceptance criteria**, **a verification command**,
and **estimated effort**.

**Time budget** for the engineering items (excluding LOW process items
W-13/W-14 which are human-only):

| Item | Severity | Owner | Effort |
|---|---|---|---|
| W-01 — CI: npm → pnpm | HIGH | Single agent | 30 min |
| W-02 — view-state THREE leak | HIGH | Single agent | 90 min |
| W-03 — Bundle-size measurement | HIGH | Single agent | 90 min |
| W-04 — Cold-load real-fixture bench | MEDIUM | Single agent | 4 h |
| W-05 — ADR-0008 / ADR-0011 reconciliation | MEDIUM | Single agent | 60 min |
| W-06 — Scope-creep classification | MEDIUM | Single agent | 2 h |
| W-07 — R2 driver wiring (aws-sdk + smoke test) | MEDIUM | Single agent | 2 h |
| W-08 — `pryzm.boot` root span | LOW | Single agent | 30 min |
| W-09 — Filesystem persistence backend (headless) | LOW | Single agent | 4 h |
| W-10 — Visual-diff corpus extension | LOW | Single agent | 4 h |
| W-11 — `audit-log-middleware` workflow fix | LOW | Single agent | 30 min |
| W-12 — Per-element parity test strength audit | LOW | Single agent | 6 h (12 × 30 min) |
| W-13 — Sprint retros S01–S24 | PROCESS | Founder | n/a |
| W-14 — Demo recording | PROCESS | Founder | n/a |
| W-15 — `bootstrap.*.ts` consolidation | LOW | Single agent | 2 h |
| W-16 — `legacy-shim` package documentation | LOW | Single agent | 60 min |

**Total engineering effort: ≈ 28 hours** = 1 focused engineer-week, OR 2-3
parallel agents each picking 2 tracks. Done in less than a calendar week.

---

## §1 Workstream organization (parallel tracks)

Items group naturally into **5 independent tracks**. All dependencies are
listed explicitly under each work item; nothing here is implicitly serial
that does not need to be.

| Track | Items | Theme | Can start day 1? |
|---|---|---|---|
| **CI** | W-01, W-11 | Make CI green on a clean clone | YES |
| **Architecture purity** | W-02, W-15, W-16 | Restore the THREE allowlist + tidy bootstraps | YES |
| **Performance gates** | W-03, W-04, W-10 | Prove the spec gates with real measurements | YES |
| **Phase-1 deploy readiness** | W-07, W-09 | R2 + filesystem backends so a real deploy works | YES |
| **Documentation truth** | W-05, W-06, W-08, W-12 | ADR ↔ code reconciliation + telemetry polish | YES |

**Dependencies between tracks** (only 2 exist):
* W-03 (bundle size) depends on W-01 (CI works) **only if** the bundle
  measurement is wired into CI. The bundle-size script can run locally
  without CI, so the two tracks can proceed in parallel — re-converge in W-03
  step 4.
* W-12 (per-element parity strength) is informational; if any element is
  found to lack a strong parity assertion, that becomes a follow-up item
  (W-12-Δ) outside this plan.

---

## §2 Work items — detailed implementation

Each work item below follows the same template:

> **Severity** · **Owner** · **Effort**
> **Why this exists** (one paragraph linking back to audit §3.x)
> **Files touched** (exhaustive)
> **Step-by-step implementation** (every command + every code edit)
> **Acceptance criteria** (literal pass/fail checks)
> **Verification command** (single shell line)
> **Rollback plan** (how to undo if it goes wrong)

---

### W-01 — Switch CI from npm to pnpm

> **Severity**: HIGH
> **Owner**: single agent
> **Effort**: 30 minutes
> **Audit reference**: §3.1
> **Depends on**: nothing
> **Blocks**: W-03 (bundle gate in CI), W-11 (workflow re-runs)

#### Why this exists

`.github/workflows/ci.yml` currently runs `npm ci --workspaces
--include-workspace-root`. Many workspace packages declare
`"@pryzm/foo": "workspace:*"` in their `package.json`; npm cannot resolve
the `workspace:*` protocol and will error out at install time. The Replit
dev environment installs successfully precisely because it uses pnpm. CI
on a clean GitHub Actions runner cannot pass today.

#### Files touched

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | Replace `setup-node`'s `cache: 'npm'` + `npm ci` with `pnpm/action-setup` + `pnpm install --frozen-lockfile`. |
| `package.json` (root) | Add `"packageManager": "pnpm@10.26.1"` field if missing. Add `"engines.pnpm": ">=10"`. |
| `pnpm-lock.yaml` | Verify it is committed and current. If not, run `pnpm install` once to regenerate. |
| `.npmrc` (create if missing) | Add `auto-install-peers=true` and `strict-peer-dependencies=false` to mirror the dev container's behaviour. |

#### Step-by-step

1. **Inspect current state**:
   ```sh
   cat .github/workflows/ci.yml | head -80
   ls -la pnpm-lock.yaml package-lock.json 2>/dev/null
   ```
2. **Edit `.github/workflows/ci.yml`** — the `Setup Node` and `Install`
   steps become:
   ```yaml
   - name: Setup pnpm
     uses: pnpm/action-setup@v4
     with:
       version: 10.26.1

   - name: Setup Node
     uses: actions/setup-node@v4
     with:
       node-version: '20'
       cache: 'pnpm'

   - name: Install (pnpm workspaces, frozen lockfile)
     run: pnpm install --frozen-lockfile
   ```
   Replace **every subsequent** `npm test --workspaces`, `npm run build
   --workspaces`, etc. with their pnpm equivalents:
   * `npm test --workspaces` → `pnpm -r test`
   * `npm run typecheck --workspaces` → `pnpm -r typecheck`
   * `npm run lint` → `pnpm lint` (already root-level)
   * `npm run build --workspaces` → `pnpm -r build`
3. **Add `packageManager` field** to root `package.json`:
   ```jsonc
   {
     "name": "3d-view-app",
     "packageManager": "pnpm@10.26.1",
     // …
   }
   ```
4. **Delete `package-lock.json`** if it exists (it will conflict).
5. **Mirror the change** in any other workflow under `.github/workflows/`
   (currently only `ci.yml`, but check).
6. **Verify locally** (Replit container has pnpm):
   ```sh
   pnpm install --frozen-lockfile
   pnpm -r test --if-present
   ```
7. **Commit + push** and watch the Actions run.

#### Acceptance criteria

* `pnpm install --frozen-lockfile` succeeds on a clean clone.
* `.github/workflows/ci.yml` contains zero `npm ci` / `npm install` lines.
* `package.json` declares `"packageManager": "pnpm@10.26.1"`.
* The CI job completes in < 5 min wall-clock per the Phase-1A spec exit
  criterion.

#### Verification command

```sh
grep -E "^\s*(- name|run):" .github/workflows/ci.yml | grep -E "(npm |pnpm )" | head -20
# every line should show pnpm, never npm
```

#### Rollback

`git revert` the commit; CI returns to its previous (broken) state.

---

### W-02 — Resolve view-state THREE leak

> **Severity**: HIGH
> **Owner**: single agent
> **Effort**: 90 minutes
> **Audit reference**: §3.2
> **Depends on**: nothing
> **Blocks**: nothing

#### Why this exists

`packages/view-state/src/ViewController.ts` line 20 imports `* as THREE`
and uses it on six lines (102, 107, 112, 119, 120, 121) — all
`new THREE.Vector3()` allocations for camera-animation interpolation.
The `no-three-outside-committer` rule's `ALLOW_FRAGMENTS` constant in
`tools/eslint-plugin-pryzm/src/rules/no-three-outside-committer.js` lists
only `packages/scene-committer/`, `packages/renderer/`, and `apps/bench/`.
Lint passes only because the root `eslint.config.js` carries an override
block downgrading the rule to `'warn'` for view-state — a silent breach
of the L5 contract (ADR-0005 says: "only L5 committers + renderer may
speak THREE").

#### Two acceptable resolutions

| Option | Description | Effort | Recommendation |
|---|---|---|---|
| **A — Refactor** | Move all THREE allocation into `CameraController`; `ViewController` passes plain `[x, y, z]` tuples through. | 90 min | **Preferred** — preserves the architectural contract. |
| **B — Allowlist + ADR amendment** | Add `packages/view-state/` to `ALLOW_FRAGMENTS` and document the carve-out in ADR-0016. | 15 min | Acceptable but sets precedent. |

This plan implements **Option A**.

#### Files touched

| File | Change |
|---|---|
| `packages/view-state/src/ViewController.ts` | Remove `import * as THREE`. Replace 6 `new THREE.Vector3(...)` with plain `Point3D` tuples. Delegate vector math to a new `CameraController` API. |
| `packages/renderer/src/CameraController.ts` | Add `interpolateTo(endPos, endTarget, endUp, durationMs, onTick, onComplete)` that does the THREE math in-house. |
| `packages/view-state/__tests__/ViewController.test.ts` | Update tests if they rely on THREE-typed inputs. |
| `eslint.config.js` | Remove the `view-state`-scoped `'warn'` override block for `pryzm/no-three-outside-committer`. |

#### Step-by-step

1. **Open `packages/view-state/src/ViewController.ts`**. Identify the
   camera-animation block around lines 95–135.
2. **Define a `Vec3 = [number, number, number]` type alias** in
   `ViewDefinition.ts` if it does not already exist.
3. **In `packages/renderer/src/CameraController.ts`** add a method that
   takes plain numeric tuples and runs the THREE-side interpolation:
   ```ts
   /** Interpolate from the current camera state to (pos, target, up)
    *  over `durationMs`. Calls `onTick(t)` per frame with t ∈ [0,1].
    *  Resolves when the animation completes or is cancelled.
    *  Owner of all THREE allocation. */
   interpolateTo(
     end: { position: Vec3; target: Vec3; up: Vec3 },
     durationMs: number,
     onTick?: (t: number) => void,
   ): { cancel: () => void; done: Promise<void> }
   ```
4. **Rewrite `ViewController.ts`'s camera-animation path** to call the new
   method instead of allocating Vector3s itself. Delete `import * as THREE`.
5. **Run the view-state tests**:
   ```sh
   cd packages/view-state && npx vitest run
   ```
   Adjust any test that needed THREE-typed inputs to use the plain tuple shape.
6. **Verify the lint guard now bites** by temporarily re-adding `import
   * as THREE` to `ViewController.ts` and running:
   ```sh
   npx eslint packages/view-state/src/ViewController.ts
   # expect: error pryzm/no-three-outside-committer
   ```
   Then remove the import again.
7. **Delete the override block** in `eslint.config.js` that downgrades
   `pryzm/no-three-outside-committer` to `'warn'` for view-state.
8. **Final lint sweep**:
   ```sh
   npx eslint packages/view-state/ packages/renderer/
   # expect: 0 errors
   ```

#### Acceptance criteria

* `rg "from 'three'" packages/view-state/src/` returns **zero** matches.
* `npx eslint packages/view-state/` returns **zero** errors with the rule
  at `'error'`.
* All view-state tests pass.
* The S17 view-switch bench (`apps/bench/src/benches/view-switch.bench.ts`)
  still passes the < 250 ms p95 gate.

#### Verification command

```sh
rg "from 'three'" packages/view-state/src/ && echo FAIL || echo PASS
```

#### Rollback

Restore the `import * as THREE` line + the eslint override; tests still pass.
Document the decision in an ADR-0016 amendment if Option B is chosen instead.

---

### W-03 — Bundle-size measurement against `< 1.8 MB gzip`

> **Severity**: HIGH
> **Owner**: single agent
> **Effort**: 90 minutes
> **Audit reference**: §3.3
> **Depends on**: W-01 (only if wiring into CI; standalone measurement is independent)
> **Blocks**: nothing

#### Why this exists

The Phase-1A exit criterion S06-T10 says: *"Initial bundle: `< 1.8 MB gzip`
for the `?pryzm2=1` entry chunk; hard-fails the PR above."* The script
`apps/bench/scripts/check-bundle-size.mjs` is wired and ready (it has both a
per-package report and an entry-chunk gate, with `ENTRY_BUDGET_KB.fail =
1800`), but it has never been **run against a real production build** in
this repo. The M12 alpha report explicitly defers it to "the next production
`vite build` against the alpha-demo URL."

#### Files touched

| File | Change |
|---|---|
| `apps/editor/package.json` | Add a `"build:pryzm2"` script: `vite build --mode pryzm2 --outDir dist/pryzm2`. |
| `apps/editor/vite.pryzm2.config.ts` (NEW) | Vite config that builds **only** the `?pryzm2=1` entry — `apps/editor/src/index.ts` — with code-splitting set so `three`, `@msgpack/msgpack`, `idb`, `ulid`, `immer`, `zod` end up in the entry chunk and OBC / family-loaders are dynamic-imported. |
| `apps/bench/scripts/check-bundle-size.mjs` | Verify the `entryChunkGate()` reads from `apps/editor/dist/pryzm2/index*.js`. |
| `.github/workflows/ci.yml` | Add a `bundle-size` job that builds + measures. |
| `apps/bench/reports/M12-alpha.md` | Update D-1 row from DEFERRED to PASS with the measured number. |

#### Step-by-step

1. **Inspect the entry**:
   ```sh
   cat apps/editor/src/index.ts | head -30
   cat apps/editor/vite.config.ts 2>/dev/null
   ```
2. **Create `apps/editor/vite.pryzm2.config.ts`** with rollup options that
   tree-shake the legacy `src/` tree and split heavy non-essential deps:
   ```ts
   import { defineConfig } from 'vite';
   export default defineConfig({
     build: {
       outDir: 'dist/pryzm2',
       lib: { entry: 'src/index.ts', formats: ['es'] },
       rollupOptions: {
         output: {
           manualChunks: {
             'obc': ['@thatopen/components', '@thatopen/components-front'],
             'family': ['@pryzm/family-loader', '@pryzm/family-runtime'],
           },
         },
       },
     },
   });
   ```
3. **Add the build script** to `apps/editor/package.json`:
   ```jsonc
   "scripts": {
     "build:pryzm2": "vite build --config vite.pryzm2.config.ts"
   }
   ```
4. **Run the build + measure**:
   ```sh
   cd apps/editor
   pnpm build:pryzm2
   node ../../apps/bench/scripts/check-bundle-size.mjs --entry-only
   ```
   Capture the `entry chunk: NN.NN KB gzip` line.
5. **If under 1800 KB**: PASS — write the result into `apps/bench/reports/
   M12-alpha.md` row D-1. **If over**: triage the offending modules with:
   ```sh
   npx vite-bundle-visualizer --output dist/pryzm2/stats.html
   ```
   and either (a) move heavy deps to dynamic imports, or (b) trim
   scope-crept packages from the import graph (intersects with W-06).
6. **Wire into CI** — add a job in `.github/workflows/ci.yml` after the
   build job:
   ```yaml
   bundle-size:
     needs: build
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: pnpm/action-setup@v4
         with: { version: 10.26.1 }
       - uses: actions/setup-node@v4
         with: { node-version: '20', cache: 'pnpm' }
       - run: pnpm install --frozen-lockfile
       - run: pnpm --filter @pryzm/editor build:pryzm2
       - run: node apps/bench/scripts/check-bundle-size.mjs --entry-only --hard-fail
   ```

#### Acceptance criteria

* `pnpm --filter @pryzm/editor build:pryzm2` produces `apps/editor/dist/
  pryzm2/index.js` (or hashed equivalent).
* `node apps/bench/scripts/check-bundle-size.mjs --entry-only` reports the
  entry chunk as **≤ 1800 KB gzip**.
* `apps/bench/reports/M12-alpha.md` D-1 row shows the actual measured KB
  number with `PASS` status.
* CI's `bundle-size` job is green.

#### Verification command

```sh
pnpm --filter @pryzm/editor build:pryzm2 && \
node apps/bench/scripts/check-bundle-size.mjs --entry-only --hard-fail
```

#### Rollback

Remove the new vite config + script; CI job step removed. The audit gate
returns to DEFERRED.

---

### W-04 — Cold-load real-fixture end-to-end bench

> **Severity**: MEDIUM
> **Owner**: single agent
> **Effort**: 4 hours
> **Audit reference**: §3.4
> **Depends on**: nothing

#### Why this exists

The current `load-small-preview.bench.ts`, `load-medium.bench.ts`, and
`load-large.bench.ts` benches all measure orchestration only — `onChunkReady`
is a no-op and the bytes are synthesised. The M12 report's footnote ¹
acknowledges this. The spec's binding target ("first interactive < 800 ms /
1.5 s / 3 s") has therefore never been measured against a real packed
fixture.

#### Files touched

| File | Change |
|---|---|
| `tests/fixtures/large-project.pryzm-stub.json` | Replace stub with a real `.pryzm` fixture **OR** keep stub + generate a real `.pryzm` at test-setup time using the existing pack pipeline. |
| `apps/bench/src/benches/cold-load-real.bench.ts` (NEW) | Boots `bootstrapWithEverything`, calls the unpack pipeline against a real fixture, and stops the clock at "first frame with mesh visible." |
| `tools/generate-large-fixture.mjs` (already exists) | Verify it produces a real `.pryzm` ZIP (not a stub JSON). |
| `apps/bench/reports/M12-alpha.md` | Add a new row "Cold-load — real-fixture end-to-end" with the measured number. |

#### Step-by-step

1. **Audit the fixture generator**:
   ```sh
   head -40 tools/generate-large-fixture.mjs
   ```
   Confirm it produces a real `.pryzm` (msgpack manifest + chunks). If it
   only produces stub JSON, extend it to call `pack()` from
   `@pryzm/file-format`.
2. **Generate three fixtures**:
   ```sh
   node tools/generate-large-fixture.mjs --size small  --out tests/fixtures/cold-load/small.pryzm
   node tools/generate-large-fixture.mjs --size medium --out tests/fixtures/cold-load/medium.pryzm
   node tools/generate-large-fixture.mjs --size large  --out tests/fixtures/cold-load/large.pryzm
   ```
3. **Write `apps/bench/src/benches/cold-load-real.bench.ts`**:
   ```ts
   import { describe, bench } from 'vitest';
   import { measure } from '../timing.js';
   import { unpack } from '@pryzm/file-format';
   import { bootstrapWithEverything } from '@pryzm/editor/src/bootstrap.everything.js';
   import { readFileSync } from 'node:fs';

   const fixtures = {
     small:  readFileSync('tests/fixtures/cold-load/small.pryzm'),
     medium: readFileSync('tests/fixtures/cold-load/medium.pryzm'),
     large:  readFileSync('tests/fixtures/cold-load/large.pryzm'),
   };

   describe('cold-load real-fixture end-to-end', () => {
     for (const [size, bytes] of Object.entries(fixtures)) {
       bench(`cold-load-${size}`, async () => {
         const { ok, project, eventLog, chunks } = await unpack(bytes);
         if (!ok) throw new Error('unpack failed');
         const runtime = bootstrapWithEverything({ audit: { actorId: 'bench' } });
         // Replay events
         for (const evt of eventLog) await runtime.bus.replay(evt);
         // Hydrate chunks (ChunkReader)
         for (const chunk of chunks) await runtime.persistence.loadChunk(chunk);
         // First frame: scene-committer flush
         await runtime.host.flush();
         runtime.tearDown();
       });
     }
   });
   ```
4. **Run** the bench (use a generous max-iters since unpack + bootstrap is
   slow):
   ```sh
   cd apps/bench && npx vitest bench src/benches/cold-load-real.bench.ts \
     --reporter=verbose
   ```
5. **Compare against spec gates** — small p95 < 800 ms, medium < 1.5 s,
   large < 3 s. Update `apps/bench/reports/M12-alpha.md` with the measured
   values.

#### Acceptance criteria

* `tests/fixtures/cold-load/{small,medium,large}.pryzm` exist as real
  packed ZIPs (not stubs).
* `apps/bench/src/benches/cold-load-real.bench.ts` runs and reports p95.
* Each measured p95 is below the spec target.
* M12 report row is updated with the measured number (no longer carries the
  "synthetic" footnote).

#### Verification command

```sh
cd apps/bench && \
npx vitest bench src/benches/cold-load-real.bench.ts --reporter=verbose | \
  grep -E "(cold-load-small|cold-load-medium|cold-load-large)"
```

---

### W-05 — Reconcile wall + curtain-wall handler counts vs ADR-0008 / ADR-0011

> **Severity**: MEDIUM
> **Owner**: single agent
> **Effort**: 60 minutes
> **Audit reference**: §3.5
> **Depends on**: nothing

#### Why this exists

* **Wall**: ADR-0008 mandates 14 handlers (5 wave-1 + 4 wave-2 + 5 wave-3),
  with `wall.join`/`wall.cut` listed as a single combined handler #14. Code
  ships **15 handlers**: `JoinWall.ts` and `CutWall.ts` are split into two
  files (≠ ADR text). Net delta: **+1**.
* **Curtain wall**: ADR-0011 mandates 9 handlers. Code ships **13 handlers**.
  The 4 extras are `AddPanel.ts`, `RemovePanel.ts`, `RotatePanel.ts`,
  `SwapPanel.ts` — all panel-level micro-commands not in the ADR. Net
  delta: **+4**.

The ADR is the contract. Either the code grew legitimately and the ADR
needs amendment, or the code over-shipped and needs triage.

#### Decision matrix per extra handler

| Handler | Likely justification | Recommended resolution |
|---|---|---|
| `JoinWall.ts` (wall #15) | Splitting join/cut keeps each handler's payload type-discriminated; combining them required a `kind: 'join'\|'cut'` discriminator. | **Amend ADR-0008** — record split. |
| `CutWall.ts` (wall #16) | Same | **Amend ADR-0008** — record split. |
| `AddPanel.ts` (cw #10) | Panels are a sub-collection of curtain-wall — adding a panel does not fit `curtainwall.setOutline` cleanly. | **Amend ADR-0011** — add as #10. |
| `RemovePanel.ts` (cw #11) | Same | **Amend ADR-0011** — add as #11. |
| `RotatePanel.ts` (cw #12) | Same | **Amend ADR-0011** — add as #12. |
| `SwapPanel.ts` (cw #13) | Same | **Amend ADR-0011** — add as #13. |

This work item assumes the resolution is "amend the ADRs." If the team
instead decides to triage some handlers out, that is a code-change task
(W-05-Δ) outside this plan's scope.

#### Files touched

| File | Change |
|---|---|
| `docs/02-decisions/adrs/0008-wall-handler-triage.md` | Append "## 2026-04-28 amendment" section listing the 14→15 split (Cut/Join into two handlers). |
| `docs/02-decisions/adrs/0011-curtain-wall-triage-and-producer-split.md` | Append "## 2026-04-28 amendment" section listing the 9→13 expansion (4 panel-level handlers). |
| `docs/00_NEW_ARCHITECTURE/audits/PHASE-1-CODE-VS-SPEC-AUDIT-2026-04-28.md` | Update §3.5 to mark RESOLVED with link to amendments. |

#### Step-by-step

1. **Read both ADRs in full** to understand original triage rationale.
2. **Write the wall amendment**:
   ```markdown
   ## 2026-04-28 amendment — Cut/Join split into two handlers (14 → 15)

   **Context.** The original triage listed `wall.join` and `wall.cut` as a
   single combined handler #14. During implementation we found this required
   a `kind: 'join' | 'cut'` discriminator on the payload, which prevented
   handler-specific type narrowing in the `canExecute` predicate. Splitting
   into two handlers — `wall.join` and `wall.cut` — preserved the parametric
   payload contract and keeps ESLint's `affected-stores-required` rule
   happy on each.

   **Updated count.** 15 wall handlers (was 14).
   **Updated table.** Replace row #14 with rows #14 (`wall.join`) and #15
   (`wall.cut`).
   **Status.** Accepted. The decision does not affect the LOC ratio (still
   ~4.7× reduction vs PRYZM 1's 22 commands).
   ```
3. **Write the curtain-wall amendment** (same shape, listing the 4 panel
   handlers).
4. **Cross-reference the audit** by editing §3.5 of
   `PHASE-1-CODE-VS-SPEC-AUDIT-2026-04-28.md` to mark RESOLVED.

#### Acceptance criteria

* Both ADRs carry a "2026-04-28 amendment" section.
* The audit's §3.5 references the amendment commit SHAs.
* `find plugins/wall/src/handlers -name '*.ts' -not -name index.ts | wc -l`
  returns **15** which matches the amended ADR-0008.
* `find plugins/curtain-wall/src/handlers -name '*.ts' -not -name index.ts | wc -l`
  returns **13** which matches the amended ADR-0011.

#### Verification command

```sh
grep -c "2026-04-28 amendment" docs/02-decisions/adrs/0008-wall-handler-triage.md \
  docs/02-decisions/adrs/0011-curtain-wall-triage-and-producer-split.md
# expect: 1\n1
```

---

### W-06 — Scope-creep classification of extra packages and plugins

> **Severity**: MEDIUM
> **Owner**: single agent
> **Effort**: 2 hours
> **Audit reference**: §3.6
> **Depends on**: nothing
> **Feeds into**: W-03 (bundle size — knowing what to keep out of the entry chunk)

#### Why this exists

The repo carries **32 packages** and **31 plugins**. Phase 1's spec called
for ~13 packages and ~12 plugins. Without classification, future
contributors cannot distinguish "Phase-1 essential" from "Phase-2 work
parked early" from "needs trimming."

#### Files touched

| File | Change |
|---|---|
| `docs/00_NEW_ARCHITECTURE/audits/PHASE-1-PACKAGE-CLASSIFICATION.md` (NEW) | Table of every package + plugin with classification: KEEP (Phase-1 essential), PARK (Phase-2/3 work landed early; no Phase-1 dependency), TRIM (could be removed without losing Phase-1 surface). |
| `docs/00_NEW_ARCHITECTURE/audits/PHASE-1-COMPLETION-PLAN.md` | Add a §References section pointing at the new file. |

#### Step-by-step

1. **Enumerate**:
   ```sh
   ls packages/ > /tmp/pkgs.txt
   ls plugins/ > /tmp/plugins.txt
   ```
2. **For each entry, run a short triage**:
   * Does any Phase-1 spec doc (1A/1B/1C/1D) reference it? → KEEP.
   * Does any KEEP package import from it? → KEEP (transitive).
   * Otherwise → PARK (with phase-of-origin note) or TRIM (with rationale).
3. **Initial classification** (auditor's best estimate; revise during the
   work item):

   | Package | Class | Notes |
   |---|---|---|
   | schemas | KEEP | L1 |
   | protocol | KEEP | L1 |
   | command-bus | KEEP | L2 |
   | persistence-client | KEEP | L0 |
   | frame-scheduler | KEEP | L5 |
   | scene-committer | KEEP | L5 |
   | renderer | KEEP | L5 |
   | stores | KEEP | L1 |
   | file-format | KEEP | L0 |
   | geometry-kernel | KEEP | L4 |
   | view-state | KEEP | L5 |
   | picking | KEEP | L4 |
   | storage-driver | KEEP | needed by bake-worker |
   | sync-client | KEEP | needed by editor's sync-server connector |
   | render-runtime | KEEP | scheduler ↔ renderer ↔ view-state glue |
   | visibility | KEEP | view-state filter pipeline |
   | ai-cost | PARK | Phase 2A AI scope |
   | ai-host | PARK | Phase 2A AI scope |
   | beta-signup | PARK | Phase 2B marketing |
   | constraint-solver | PARK | Phase 2B family-editor |
   | crash-reporter | PARK | Phase 2C ops |
   | drawing-primitives | PARK | Phase 2C drawings |
   | email-transport | PARK | Phase 2B marketing |
   | expr-eval | PARK | Phase 2B family-editor |
   | family-instance | PARK | Phase 2B family-editor |
   | family-loader | PARK | Phase 2B family-editor |
   | family-runtime | PARK | Phase 2B family-editor |
   | feature-flags | PARK | cross-cutting infra |
   | legacy-shim | TRIM-CANDIDATE | sunset support; document scope (W-16) |
   | pdf-to-bim | PARK | Phase 2A AI scope |
   | types-builtin | KEEP | family-loader fundamental types |
   | ui | PARK | Phase 2C UI components |

   | Plugin | Class |
   |---|---|
   | wall, slab, door, window, roof, curtain-wall, grid, column, beam, stair, handrail, ceiling | KEEP × 12 |
   | toy-cube | KEEP (S05 hello-cube reference) |
   | selection | KEEP (M9 multi-element selection) |
   | view | KEEP (M9 view registry plugin) |
   | annotations, dimensions, sheets, schedules | PARK (Phase 2A documentation) |
   | bcf, ifc-export, ifc-import, ifc-inspector, rhino-import | PARK (Phase 2A interop) |
   | ai-floorplan, ai-generative, ai-query, ai-rules, ai-voice | PARK (Phase 2A AI) |
   | furniture, lighting, plumbing, structural | PARK (Phase 2B element families) |
   | rooms | PARK (Phase 2A spaces) |
   | plan-view, section-view | PARK (Phase 2A views) |
   | multiplayer | PARK (Phase 2C collab UX layer) |
   | cross | PARK (Phase 2A) — verify scope |
4. **Write the classification doc** with the full table + rationale per
   PARK / TRIM entry.
5. **Cross-reference** from `PHASE-1-COMPLETION-PLAN.md` and from the
   audit doc.

#### Acceptance criteria

* `docs/00_NEW_ARCHITECTURE/audits/PHASE-1-PACKAGE-CLASSIFICATION.md`
  exists with **every** package and plugin classified.
* No package is in TRIM unless the doc records a removal plan (rename to
  TRIM-CANDIDATE if the team wants to defer the decision).
* The bundle-size work item (W-03) can use the PARK list to verify those
  packages are dynamic-imported and out of the entry chunk.

#### Verification command

```sh
test -f docs/00_NEW_ARCHITECTURE/audits/PHASE-1-PACKAGE-CLASSIFICATION.md && \
  echo PASS || echo FAIL
```

---

### W-07 — Wire R2 storage driver into bake-worker for real

> **Severity**: MEDIUM
> **Owner**: single agent
> **Effort**: 2 hours
> **Audit reference**: §3.7
> **Depends on**: nothing

#### Why this exists

`apps/bake-worker/src/index.ts` already calls `createStorageDriver({ env })`
(verified in audit prep) so the **factory wiring is correct**. However:
1. The R2 driver throws a deterministic install-instructions error because
   `@aws-sdk/client-s3` is intentionally NOT installed.
2. There is no smoke test proving R2 round-trips a chunk.
3. The Replit deploy environment is not configured to provide
   `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` /
   `R2_BUCKET_NAME`.

#### Files touched

| File | Change |
|---|---|
| `packages/storage-driver/package.json` | Add `@aws-sdk/client-s3` as `peerDependency` (NOT regular dep — keep it opt-in). |
| `packages/storage-driver/src/R2StorageDriver.ts` | Replace stub `throw` with real S3 client construction (keeping the deterministic error if dynamic-import fails). |
| `packages/storage-driver/__tests__/R2StorageDriver.smoke.test.ts` (NEW) | Smoke test that uses `R2_TEST_*` env vars (skipped when absent) to upload + download one chunk. |
| `apps/bake-worker/__tests__/r2-end-to-end.skip.test.ts` (NEW) | Optional integration test: enqueue a bake job → bake worker writes chunk to R2 → reader fetches it back. Skipped without env. |
| `apps/bake-worker/README.md` | Document the four required env vars + how to provision an R2 bucket. |

#### Step-by-step

1. **Add aws-sdk as a peer dep** so npm/pnpm warn (not fail) when missing:
   ```sh
   pnpm add --filter @pryzm/storage-driver @aws-sdk/client-s3@^3 --save-peer
   ```
2. **Implement `R2StorageDriver.put()` / `.get()`** with dynamic import:
   ```ts
   private async client() {
     if (!this._client) {
       const { S3Client } = await import('@aws-sdk/client-s3');
       this._client = new S3Client({
         region: 'auto',
         endpoint: `https://${this.opts.accountId}.r2.cloudflarestorage.com`,
         credentials: {
           accessKeyId: this.opts.accessKeyId,
           secretAccessKey: this.opts.secretAccessKey,
         },
       });
     }
     return this._client;
   }

   async put(key: string, bytes: Uint8Array): Promise<void> {
     const { PutObjectCommand } = await import('@aws-sdk/client-s3');
     const client = await this.client();
     await client.send(new PutObjectCommand({
       Bucket: this.opts.bucketName,
       Key: this.opts.keyPrefix + key,
       Body: bytes,
     }));
   }

   async get(key: string): Promise<Uint8Array> {
     const { GetObjectCommand } = await import('@aws-sdk/client-s3');
     const client = await this.client();
     const out = await client.send(new GetObjectCommand({
       Bucket: this.opts.bucketName,
       Key: this.opts.keyPrefix + key,
     }));
     return new Uint8Array(await out.Body.transformToByteArray());
   }
   ```
   Keep the deterministic-error path if `import('@aws-sdk/client-s3')`
   throws.
3. **Smoke test** — `R2StorageDriver.smoke.test.ts`:
   ```ts
   const skip = !process.env.R2_TEST_ACCOUNT_ID;
   describe.skipIf(skip)('R2StorageDriver smoke', () => {
     it('puts and gets a 1 KB chunk', async () => {
       const driver = new R2StorageDriver({
         accountId: process.env.R2_TEST_ACCOUNT_ID!,
         accessKeyId: process.env.R2_TEST_ACCESS_KEY_ID!,
         secretAccessKey: process.env.R2_TEST_SECRET_ACCESS_KEY!,
         bucketName: process.env.R2_TEST_BUCKET_NAME!,
         keyPrefix: 'smoke-test/',
       });
       const key = `chunk-${Date.now()}.bin`;
       const bytes = new Uint8Array(1024).fill(42);
       await driver.put(key, bytes);
       const back = await driver.get(key);
       expect(back).toEqual(bytes);
     });
   });
   ```
4. **Document the env vars** in `apps/bake-worker/README.md` with a brief
   "How to provision a Cloudflare R2 bucket" section.
5. **Update audit §3.7** to RESOLVED + link the smoke test commit.

#### Acceptance criteria

* `pnpm install` succeeds; aws-sdk is a peer dep (warn-not-fail when absent).
* With `R2_*` env vars unset, `apps/bake-worker` boots successfully and
  selects InMemoryStorageDriver.
* With `R2_TEST_*` env vars set, the smoke test passes against a real R2
  bucket.
* `apps/bake-worker/README.md` documents the four env vars.

#### Verification command

```sh
# unset env
node -e "import('@pryzm/bake-worker').then(m => m.createBakeWorker()).then(w => console.log(w.storage.constructor.name))"
# expect: InMemoryStorageDriver

# with R2_TEST_* env vars set
R2_TEST_ACCOUNT_ID=... R2_TEST_ACCESS_KEY_ID=... R2_TEST_SECRET_ACCESS_KEY=... R2_TEST_BUCKET_NAME=... \
  cd packages/storage-driver && npx vitest run __tests__/R2StorageDriver.smoke.test.ts
```

---

### W-08 — Add `pryzm.boot` root OTel span

> **Severity**: LOW
> **Owner**: single agent
> **Effort**: 30 minutes
> **Audit reference**: §3.9
> **Depends on**: nothing

#### Why this exists

Every other Phase-1 OTel span is wired (per M12 §5). Only `pryzm.boot`
is PARTIAL. Without a root span, the "single wall-edit OTel trace spans
all layers" gate is technically green (sibling-span linkage per ADR-0020)
but does not render as one collapsible trace in Honeycomb / Tempo.

#### Files touched

| File | Change |
|---|---|
| `apps/editor/src/bootstrap.everything.ts` | Wrap the `bootstrapWithEverything()` body in `tracer.startActiveSpan('pryzm.boot', ...)`. End the span on first paint via the renderer's `onFirstFrame` callback (or a 1-tick `requestIdleCallback`). |
| `packages/renderer/src/Renderer.ts` | Add a public `onFirstFrame(cb: () => void): Disposable` API if missing. |
| `apps/bench/reports/M12-alpha.md` | Update the `pryzm.boot` row from PARTIAL to PASS. |

#### Step-by-step

1. **Add `Renderer.onFirstFrame`** if not present:
   ```ts
   onFirstFrame(cb: () => void): { dispose: () => void } {
     if (this._firstFramePainted) { cb(); return { dispose: () => {} }; }
     this._firstFrameCallbacks.push(cb);
     return { dispose: () => {
       const i = this._firstFrameCallbacks.indexOf(cb);
       if (i >= 0) this._firstFrameCallbacks.splice(i, 1);
     }};
   }
   // …in the render loop, after the first successful paint:
   this._firstFramePainted = true;
   for (const cb of this._firstFrameCallbacks) cb();
   ```
2. **Wrap the bootstrap body**:
   ```ts
   import { trace, SpanStatusCode } from '@opentelemetry/api';
   const tracer = trace.getTracer('@pryzm/editor');

   export function bootstrapWithEverything(opts: BootstrapEverythingOptions): EverythingRuntime {
     const span = tracer.startSpan('pryzm.boot');
     try {
       const runtime = /* …existing body… */;
       runtime.renderer.onFirstFrame(() => {
         span.setStatus({ code: SpanStatusCode.OK });
         span.end();
       });
       return runtime;
     } catch (err) {
       span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
       span.end();
       throw err;
     }
   }
   ```
3. **Update M12 report** row.

#### Acceptance criteria

* `pryzm.boot` span appears in any in-process tracer exporter test.
* Span ends at first paint (verified by mocking `renderer.onFirstFrame`).
* M12 §5 row 17 shows PASS.

#### Verification command

```sh
cd apps/editor && npx vitest run __tests__/bootstrap-otel.test.ts
```

---

### W-09 — Filesystem persistence backend for headless

> **Severity**: LOW
> **Owner**: single agent
> **Effort**: 4 hours
> **Audit reference**: §3.10
> **Depends on**: nothing

#### Why this exists

`apps/headless` currently runs in-memory only (`apps/headless/src/index.ts`
doc-comment: *"Persistence is in-memory only until a file-system backend
lands in S19+."*). To be useful for AI agents, CI fixtures, and ops scripts,
the CLI needs `--project-path /path/to/project.pryzm` to load + save.

#### Files touched

| File | Change |
|---|---|
| `packages/persistence-client/src/backends/FileSystemBackend.ts` (NEW) | Implements `Backend` interface against the local filesystem. Mirrors `InMemoryBackend.ts` shape. |
| `packages/persistence-client/__tests__/file-system-backend.test.ts` (NEW) | Round-trip test: append events → read back → byte parity. Uses `fs/promises` + a tmpdir. |
| `apps/headless/src/index.ts` | Add `--project-path` parsing; wire `FileSystemBackend` when the flag is present. |
| `apps/headless/__tests__/cli-file-system.test.ts` (NEW) | End-to-end: `pryzm-headless new-project --project-path /tmp/x.pryzm` then `add-wall` then `export-pryzm` → unpack and verify wall in result. |
| `apps/headless/README.md` | Document `--project-path`. |

#### Step-by-step

1. **Read `InMemoryBackend.ts`** to understand the interface contract:
   ```sh
   cat packages/persistence-client/src/backends/InMemoryBackend.ts | head -60
   ```
2. **Implement `FileSystemBackend.ts`** — use one append-only `events.log`
   file per project + a `manifest.json`. Append uses `fs.appendFile()`;
   read iterates line-by-line via `readline`.
3. **Round-trip test** — write 100 events, read them back, byte-equal.
4. **Wire into headless CLI**:
   ```ts
   const backend = args['project-path']
     ? new FileSystemBackend({ projectPath: args['project-path'] })
     : new InMemoryBackend();
   ```
5. **End-to-end test**: run the CLI in a subprocess, verify the produced
   `.pryzm` is readable.

#### Acceptance criteria

* `FileSystemBackend` passes the same conformance tests as `InMemoryBackend`.
* `pryzm-headless new-project --project-path /tmp/test.pryzm && \
  pryzm-headless add-wall --project-path /tmp/test.pryzm` works.
* `apps/headless/README.md` shows the `--project-path` example.

#### Verification command

```sh
cd packages/persistence-client && npx vitest run __tests__/file-system-backend.test.ts && \
cd ../../apps/headless && npx vitest run __tests__/cli-file-system.test.ts
```

---

### W-10 — Visual-diff corpus extension to 24 scenes

> **Severity**: LOW
> **Owner**: single agent
> **Effort**: 4 hours
> **Audit reference**: §3.11
> **Depends on**: W-02 (renderer must be lint-clean to avoid contaminating diffs)

#### Why this exists

Phase 1B/S08 spec called for a 24-scene visual-diff corpus that gates
WebGPU↔WebGL2 parity at < 2 px diff. Today only `tests/visual-diff/plan-view/`
exists. With only plan-view, 3D scene regressions can slip through.

#### Files touched

| File | Change |
|---|---|
| `tests/visual-diff/3d/wall-only.spec.ts` (NEW) | Wall scene fixture; renders in WebGPU + WebGL2; pixelmatch diff < 2 px. |
| `tests/visual-diff/3d/{slab,door,window,roof,curtain-wall,grid,column,beam,stair,handrail,ceiling}.spec.ts` (11 NEW) | One per element family. |
| `tests/visual-diff/3d/multi-{wall+door+window,wall+slab,curtain+slab,…}.spec.ts` (12 NEW) | Multi-element scenes to exercise committer batching. |
| `tests/visual-diff/fixtures/` | Reference PNGs per scene (regenerate via `--update-snapshots`). |
| `apps/bench/scripts/visual-diff.mjs` | Verify the harness handles the 24-scene corpus. |

#### Step-by-step

1. **Inspect the existing plan-view spec** for the harness shape:
   ```sh
   ls tests/visual-diff/plan-view/ && head -30 tests/visual-diff/plan-view/*.ts
   ```
2. **Author 12 single-element 3D specs**, one per element family. Each:
   * Constructs a fixture DTO (1 wall, 1 door, etc.).
   * Boots a minimal renderer in WebGPU mode → screenshot → reference.
   * Boots in WebGL2 mode → screenshot → diff < 2 px against reference.
3. **Author 12 multi-element specs** to exercise committer batching.
4. **Generate reference PNGs** with `pnpm visual-diff --update-snapshots`.
5. **Run the harness** twice (WebGPU, WebGL2) and verify all 24 pass.

#### Acceptance criteria

* `ls tests/visual-diff/3d/*.spec.ts | wc -l` returns **≥ 24**.
* `pnpm visual-diff` exits 0 with all 24 < 2 px.
* M12 report row "WebGPU + WebGL2 visual-diff parity" cites 24 / 24.

#### Verification command

```sh
ls tests/visual-diff/3d/*.spec.ts | wc -l
node apps/bench/scripts/visual-diff.mjs --suite 3d
```

---

### W-11 — Investigate + fix `audit-log-middleware` failing workflow

> **Severity**: LOW
> **Owner**: single agent
> **Effort**: 30 minutes (investigation) + variable (fix)
> **Audit reference**: §5.4

#### Why this exists

The Replit `audit-log-middleware` workflow is in failed state. Phase-1
exit criteria require all configured workflows to be green.

#### Files touched

* `tests/audit-log-s57/auditLogMiddleware.test.js` — likely culprit
* `tests/audit-log-s57/package.json` — verify deps are installed
* `tests/audit-log-s57/vitest.config.ts` — verify config is valid

#### Step-by-step

1. **Restart the workflow** to capture fresh logs.
2. **Read the failing test output**:
   ```sh
   cd tests/audit-log-s57 && npx vitest run --reporter=verbose 2>&1 | tail -60
   ```
3. **Categorise the failure**:
   * Missing dependency → `pnpm install` in the test workspace.
   * Test logic regression → triage and fix.
   * Configuration error → fix vitest.config.ts.
4. **Apply the fix** and re-run. Restart the workflow to confirm green.

#### Acceptance criteria

* The `audit-log-middleware` workflow reports green status.
* `cd tests/audit-log-s57 && npx vitest run` exits 0.

#### Verification command

```sh
cd tests/audit-log-s57 && npx vitest run --reporter=basic
```

---

### W-12 — Per-element parity test strength audit

> **Severity**: LOW
> **Owner**: single agent
> **Effort**: 6 hours (12 elements × 30 min)
> **Audit reference**: §5.5

#### Why this exists

Audit confirmed `tests/parity/wall/` has a strong byte-parity assertion
(`wall-headless-node.test.ts`) and snapshot test. The other 11 element
directories also exist, but each one's assertion strength is uncertain.
The M12 report claims "PASS" globally but did not enumerate per-element
contracts.

#### Files touched

| File | Change |
|---|---|
| `docs/00_NEW_ARCHITECTURE/audits/PHASE-1-PARITY-TEST-MATRIX.md` (NEW) | One row per element listing: snapshot test (Y/N), Node-vs-browser parity (Y/N), assertion shape (byte / digest / structural). |
| `tests/parity/<element>/<element>-headless-node.test.ts` (NEW for missing ones) | Add Node-vs-browser byte-parity test where missing. |

#### Step-by-step

1. **For each of the 12 elements** (`wall, slab, door, window, roof,
   curtain-wall, grid, column, beam, stair, handrail, ceiling`):
   ```sh
   ls tests/parity/<element>/
   head -15 tests/parity/<element>/*.test.ts
   ```
2. **Classify**:
   * **Strong**: snapshot + Node-vs-browser byte-parity (matches wall).
   * **Medium**: snapshot only (digest assertion).
   * **Weak**: structural assertion only (vertex count, etc.).
3. **Write the matrix doc** with one row per element.
4. **For any element classified "Weak"**: open a follow-up task (W-12-Δ-N)
   to add the missing assertion. Do not block this work item on the
   follow-ups unless the team wants to.

#### Acceptance criteria

* Matrix doc exists with all 12 rows.
* Wall, slab, door, window, roof, curtain-wall, grid, column, beam,
  stair, handrail, ceiling each have at least one snapshot or
  Node-vs-browser test (the M12 PASS claim becomes verifiable).

#### Verification command

```sh
test -f docs/00_NEW_ARCHITECTURE/audits/PHASE-1-PARITY-TEST-MATRIX.md && \
  grep -c "^|" docs/00_NEW_ARCHITECTURE/audits/PHASE-1-PARITY-TEST-MATRIX.md
# expect: ≥ 13 (header + 12 rows)
```

---

### W-13 — Sprint retros S01–S24 (PROCESS)

> **Severity**: LOW
> **Owner**: founder + team
> **Effort**: human

The M12 alpha report marks this PARTIAL ("per-sprint closeouts captured
in PROCESS-TRACKER §1; standalone retro files are deferred to the founder
rest week"). This plan does not implement; the founder's rest-week task
list is the right place.

---

### W-14 — Demo recording (PROCESS)

> **Severity**: LOW
> **Owner**: founder
> **Effort**: human

The script lives at `docs/05-guides/developer/demos/M12-alpha.script.md`. The recording is a
manual step planned for the deploy day. Out of scope for this plan.

---

### W-15 — Consolidate `bootstrap.*.ts` files

> **Severity**: LOW
> **Owner**: single agent
> **Effort**: 2 hours
> **Audit reference**: §5.1

#### Why this exists

`apps/editor/src/` ships **five** bootstrap files:
* `bootstrap.ts` (S05-T8 base)
* `bootstrap.data.ts` (S05 data half)
* `bootstrap.render.ts` (S06 render half)
* `bootstrap.render.data.ts` (undocumented)
* `bootstrap.everything.ts` (W-1C-1 all-plugins aggregator)

There is no contract test that they remain coherent. If two drift, only
integration tests catch it.

#### Files touched

| File | Change |
|---|---|
| `apps/editor/src/bootstrap.render.data.ts` | DELETE — verify no production code imports it. |
| `apps/editor/__tests__/bootstrap-shape.test.ts` (NEW) | Single contract test: "every bootstrap entry returns a runtime with `bus`, `stores`, `host`, `tearDown`." Run against `bootstrap()`, `bootstrapWithWalls()`, `bootstrapWithEverything()`. |
| `docs/04-reference/architecture-detail/bootstrap.md` (NEW) | Document the bootstrap pyramid: `bootstrap()` (data + render minimal) → `bootstrapWithWalls()` (one plugin) → `bootstrapWithEverything()` (all plugins). |

#### Step-by-step

1. **Search for imports of the orphan file**:
   ```sh
   rg "bootstrap\.render\.data" --type ts
   ```
   If results are nonempty, port them to either `bootstrap.ts` or
   `bootstrap.everything.ts`.
2. **Delete** `bootstrap.render.data.ts`.
3. **Write the contract test** that boots each entry and asserts shape.
4. **Document** the pyramid in `docs/04-reference/architecture-detail/bootstrap.md`.

#### Acceptance criteria

* `apps/editor/src/bootstrap.render.data.ts` is deleted.
* `apps/editor/__tests__/bootstrap-shape.test.ts` exists and passes.
* `docs/04-reference/architecture-detail/bootstrap.md` exists.
* `pnpm --filter @pryzm/editor test` passes.

#### Verification command

```sh
test ! -f apps/editor/src/bootstrap.render.data.ts && \
  test -f apps/editor/__tests__/bootstrap-shape.test.ts && echo PASS || echo FAIL
```

---

### W-16 — Document `legacy-shim` package scope

> **Severity**: LOW
> **Owner**: single agent
> **Effort**: 60 minutes
> **Audit reference**: §5.2

#### Why this exists

`packages/legacy-shim/` exists with `raf.bad.ts` (a `requestAnimationFrame`
site). It is presumably for the PRYZM 1 sunset but is undocumented in any
phase doc. Its scope (what may import from it, what it must not depend on)
is undefined — a quiet trapdoor.

#### Files touched

| File | Change |
|---|---|
| `packages/legacy-shim/README.md` | Document: purpose, allowed importers, sunset timeline. |
| `eslint.config.js` | Add `legacy-shim` to the `boundaries/element-types` matrix as a separate type with a documented allowlist. |
| `packages/legacy-shim/package.json` | Verify the entrypoints reflect the shim contract. |

#### Step-by-step

1. **Inspect the package**:
   ```sh
   ls packages/legacy-shim/src/ && cat packages/legacy-shim/package.json
   ```
2. **Identify importers**:
   ```sh
   rg "@pryzm/legacy-shim" --type ts | head -10
   ```
3. **Write the README** with sections: Purpose, Allowed Importers, Forbidden
   Importers, Sunset Plan (target sprint + condition for removal).
4. **Wire boundaries** — add a `legacy-shim` element type and explicit
   allowlist (probably "PRYZM 1 `src/` only").

#### Acceptance criteria

* `packages/legacy-shim/README.md` exists with all 4 sections.
* `eslint.config.js` has a `legacy-shim` element type rule.
* No PRYZM 2 package imports from `@pryzm/legacy-shim` (verified by lint).

#### Verification command

```sh
test -f packages/legacy-shim/README.md && \
  ! rg "@pryzm/legacy-shim" packages/ plugins/ apps/ -g '!legacy-shim' --type ts
```

---

## §3 Sequencing & critical path

```
Day 1 (parallel start; no cross-dependencies)
├─ Track CI:           W-01 (CI: npm→pnpm) ──────────┐
├─ Track Architecture: W-02 (view-state THREE)       │
│                      W-15 (bootstrap consolidation)│
│                      W-16 (legacy-shim docs)       │
├─ Track Performance:  W-03 (bundle measure) ────────┤  ⇣ converge
│                      W-04 (cold-load real)         │  on W-01 if
│                      W-10 (visual-diff corpus)     │  CI gate
├─ Track Deploy:       W-07 (R2 wiring)              │
│                      W-09 (FS backend)             │
├─ Track Doc-truth:    W-05 (ADR amendments)         │
│                      W-06 (scope classification) ──┘
│                      W-08 (pryzm.boot span)
│                      W-12 (parity matrix)
└─ Track Maintenance:  W-11 (audit-log fix)
```

**Critical path** (longest single-thread chain):
* W-01 (30 min) → W-03 wired into CI step (extra 15 min) ≈ 45 min cumulative.
* All other items can run in parallel.

**With one engineer, sequential**: ~28 hours of execution + reviews ≈
**1 week**. **With three parallel agents**, **2-3 days** wall-clock.

---

## §4 Verification matrix — the "Phase 1 closes" gate

After all engineering items (W-01…W-12, W-15, W-16) land, the following
single command sequence must pass on a clean clone:

```sh
# 1. Install with pnpm
pnpm install --frozen-lockfile

# 2. Lint (all 5 custom rules + boundaries + no-restricted-imports + tseslint)
pnpm lint
# Expect: 0 errors

# 3. Typecheck per workspace
pnpm -r typecheck
# Expect: 0 errors

# 4. Test all workspaces
pnpm -r test
# Expect: every workspace passes

# 5. Build editor entry chunk
pnpm --filter @pryzm/editor build:pryzm2

# 6. Bundle-size gate
node apps/bench/scripts/check-bundle-size.mjs --entry-only --hard-fail
# Expect: entry chunk ≤ 1800 KB gzip

# 7. Cold-load real-fixture bench
cd apps/bench && npx vitest bench src/benches/cold-load-real.bench.ts
# Expect: small p95 < 800 ms, medium < 1.5 s, large < 3 s

# 8. Visual-diff harness
node apps/bench/scripts/visual-diff.mjs --suite 3d
# Expect: 24/24 < 2 px

# 9. Headless CLI round-trip with filesystem backend
pryzm-headless new-project --project-path /tmp/test.pryzm
pryzm-headless add-wall --project-path /tmp/test.pryzm
pryzm-headless export-pryzm --project-path /tmp/test.pryzm

# 10. Optional R2 smoke test (if env set)
R2_TEST_*=... cd packages/storage-driver && npx vitest run __tests__/R2StorageDriver.smoke.test.ts
```

**A single failure in any of steps 1–9 means Phase 1 has not closed.**
Step 10 is conditional on the operator providing R2 credentials.

---

## §5 Definition of "Phase 1 closed"

Phase 1 is **closed** when **all** of the following hold:

| Gate | Owner | Verifying command/file |
|---|---|---|
| **G-1** CI green on a clean clone in < 5 min wall-clock | W-01 | `.github/workflows/ci.yml` actions run |
| **G-2** Zero `import 'three'` outside committer/renderer/bench (rule at `'error'`) | W-02 | `pnpm lint` |
| **G-3** Editor entry chunk ≤ 1.8 MB gzip | W-03 | `check-bundle-size.mjs --hard-fail` |
| **G-4** Cold-load real-fixture p95 < 800 ms / 1.5 s / 3 s | W-04 | `cold-load-real.bench.ts` |
| **G-5** ADR-0008 + ADR-0011 reflect actual handler counts | W-05 | grep amendment sections |
| **G-6** Every package + plugin classified KEEP / PARK / TRIM | W-06 | `PHASE-1-PACKAGE-CLASSIFICATION.md` |
| **G-7** Bake worker can write a chunk to R2 (if env set) | W-07 | smoke test |
| **G-8** `pryzm.boot` span emitted at boot | W-08 | bootstrap-otel test |
| **G-9** Headless CLI persists to filesystem | W-09 | `--project-path` round-trip |
| **G-10** 24-scene 3D visual-diff corpus passes WebGPU↔WebGL2 < 2 px | W-10 | `visual-diff.mjs --suite 3d` |
| **G-11** All Replit workflows green (incl. `audit-log-middleware`) | W-11 | workflow status |
| **G-12** Parity matrix doc lists all 12 elements with assertion shape | W-12 | `PHASE-1-PARITY-TEST-MATRIX.md` |
| **G-13** Bootstrap pyramid documented + contract-tested | W-15 | `bootstrap-shape.test.ts` |
| **G-14** `legacy-shim` package documented + boundaried | W-16 | `legacy-shim/README.md` |

When **G-1 through G-14** are GREEN, sub-phases 1A · 1B · 1C · 1D close.
The two PROCESS items (W-13 sprint retros, W-14 demo recording) close on
the founder's rest week and are tracked separately.

---

## §6 Risks specific to this plan

| ID | Risk | Mitigation |
|---|---|---|
| P-01 | Switching CI to pnpm exposes a previously-hidden test failure on a clean install (lockfile drift). | Run `pnpm install --frozen-lockfile` locally before pushing the workflow change; regenerate `pnpm-lock.yaml` if drift is found. |
| P-02 | View-state refactor (W-02) breaks the camera-animation visual feel — interpolation timing changes when math moves between modules. | Re-record the view-switch bench baseline; compare visual-diff before/after. |
| P-03 | Bundle-size measurement (W-03) shows the entry chunk is well above 1.8 MB because of scope-creep packages (W-06 PARK list). | Triage from W-06's PARK list; move PARK packages to dynamic imports; re-measure. |
| P-04 | Cold-load real-fixture bench (W-04) reveals a previously-undetected end-to-end regression. | Treat as a Phase-1 blocker — open a follow-up task to bisect; do not close Phase 1 until resolved. |
| P-05 | The `audit-log-middleware` failure (W-11) is a real regression in the audit-log middleware code. | Triage as a code-fix task; may need to extend the plan with a W-11-Δ work item. |
| P-06 | Adding aws-sdk peer dep (W-07) inflates the install graph for users who do not need R2. | aws-sdk is `peerDependency`, not `dependency` — pnpm warns, does not install. |

---

## §7 Roll-up summary

* **3 HIGH** items (W-01 / W-02 / W-03) — close in **3 hours total**. These
  alone shift the Phase 1 verdict from `A−` to `A`.
* **5 MEDIUM** items (W-04 / W-05 / W-06 / W-07 / W-10) — close in **~13
  hours total**. With these, every spec gate has a real measurement.
* **6 LOW** items (W-08 / W-09 / W-11 / W-12 / W-15 / W-16) — close in **~14
  hours total**. With these, the codebase is documented, telemetry is clean,
  and the audit's tail risks are gone.

**Grand total engineering effort: ~30 hours / one engineer-week / 2-3
parallel agents over 2-3 days.**

After execution, Phase 1 closes in the strong sense: every spec gate is
measured, every architectural invariant is enforced, every ADR matches the
code, and every CI workflow is green.

— end —
