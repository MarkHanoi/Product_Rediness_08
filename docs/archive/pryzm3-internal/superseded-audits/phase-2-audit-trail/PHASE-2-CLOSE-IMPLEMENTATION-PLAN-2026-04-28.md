# PHASE 2 CLOSE — IMPLEMENTATION PLAN

> **Date**: 2026-04-28
> **Author**: post-audit follow-up to `PHASE-2-CODE-VS-SPEC-AUDIT-2026-04-28.md`
> **Goal**: Close every gap identified in the Phase 2 audit's §3, §4, §5, §7 so that
> all Phase 2 exit criteria (across sub-phases 2A · 2B · 2C · 2D) hold both
> **at code level** and **at the M24 beta-gate level** — and so that the
> audit's code-grounded score (B / 83) rises to A− / 90+ on a clean re-audit.
> **Audience**: an engineer or task-agent who will execute the work, plus the
> founder who needs to track progress.
> **Out of scope**: any new Phase 3 / 3A scope (Visibility waves 6-11 are
> already shipped; Constraint solver, AI subsystem completion, IFC/DXF/Rhino
> all stay parked); the Phase-1 close items still tracked in
> `PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` (cross-referenced where
> they overlap, e.g. `audit-log-middleware`).

---

## §0 Executive summary

The Phase 2 audit identified **7 CRITICAL items**, **7 HIGH**, **10 MEDIUM**,
and **9 LOW / process** for a total of **33 open items**. Several map onto
the same fix (the `PlanViewCanvasHost` SceneCommitter import causes 3 of the
test-suite failures), so this plan consolidates the 33 audit findings into
**21 work items** (`W-01` … `W-21`) with **exact file paths**, **the specific
code change**, **acceptance criteria**, **a verification command**, and an
**estimated effort**.

**Time budget** for the engineering items (excluding W-21 demo recordings
which are founder-only):

| Item | Severity | Owner | Effort |
|---|---|---|---|
| W-01 — Fix `@pryzm/ai-cost` module resolution + 9 red ai-host tests | CRITICAL | Single agent | 90 min |
| W-02 — Fix `PlanViewCanvasHost` SceneCommitter import (boundary) | CRITICAL | Single agent | 3 h |
| W-03 — Implement `authz.can` middleware in `apps/sync-server` | CRITICAL | Single agent | 6 h |
| W-04 — Author chaos-test harness for sync-client | CRITICAL | Single agent | 4 h |
| W-05 — Author `pnpm bench yjs-collab` | HIGH | Single agent | 4 h |
| W-06 — Land Supabase cutover (S43 D9 binding event) | CRITICAL | Single agent + founder | 6 h + provisioning |
| W-07 — Wire `featureFlags.plan_view_v2` runtime gate | HIGH | Single agent | 2 h |
| W-08 — Build `apps/export-worker/` skeleton + PDF job | HIGH | Single agent | 6 h |
| W-09 — Section-view continuation (handlers + renderer + store + producer move) | CRITICAL | Single agent | 10 h |
| W-10 — Wire `view-sync.ts` renderer plumbing into canvas hosts | HIGH | Single agent | 4 h |
| W-11 — Verify + pin bake-worker 250 ms debounce | HIGH | Single agent | 30 min |
| W-12 — Lazy AI chunk size CI gate (`vite build --report` parser) | MEDIUM | Single agent | 2 h |
| W-13 — Load-test soft-locks (50 peers × 100 elements × 10 Hz churn) | HIGH | Single agent | 4 h |
| W-14 — Threat-model `apps/sync-server/` + write `threat_model.md` | PROCESS | Single agent | 4 h |
| W-15 — ADR ↔ code drift CI check + amend ADR-0036 (waves 1-11 not 1-5) | MEDIUM | Single agent | 3 h |
| W-16 — Author missing ADR-0038, ADR-0039, ADR-0040 | MEDIUM | Single agent | 2 h |
| W-17 — Two-column scoring + red-tests column in audit template | PROCESS | Single agent | 1 h |
| W-18 — Resurrect `audit-log-middleware` workflow (carry-over from Phase 1 W-11) | LOW | Single agent | 30 min |
| W-19 — ADR housekeeping cluster (RecomputeRoomBoundary, view-chip rename, visibility-intent location, ActiveStores doc) | LOW | Single agent | 90 min |
| W-20 — Scope-creep classification of new packages + plugins (extends Phase-1 W-06) | MEDIUM | Single agent | 2 h |
| W-21 — Sub-phase demo recordings (2A · 2B · 2C · 2D) | PROCESS | Founder | n/a |

**Total engineering effort: ≈ 65 hours** = roughly **1.5 focused engineer-weeks**,
OR 4-5 parallel agents each picking a track. Done in less than a calendar
fortnight if W-06 (Supabase provisioning) is started in parallel from
day 1.

---

## §1 Workstream organization (parallel tracks)

The 21 items group naturally into **6 independent tracks**. Cross-track
dependencies are listed explicitly under each work item.

| Track | Items | Theme | Can start day 1? |
|---|---|---|---|
| **A — Test-suite triage** | W-01, W-02, W-18 | Make the test runs honest (no skipped suites, no red tests) | YES |
| **B — Multi-user safety** | W-03, W-04, W-13, W-14 | Authz, chaos harness, soft-lock load test, threat model | YES |
| **C — Cutover infrastructure** | W-06, W-11, W-12 | Supabase landing + perf gates around it | YES (provisioning runs in parallel) |
| **D — Documentation pipeline gap-close** | W-08, W-09, W-10 | export-worker, section view, view-sync renderer plumbing | YES |
| **E — Editor safety + perf measurement** | W-05, W-07 | Plan-view fallback wiring + yjs-collab bench | YES |
| **F — ADR / process / housekeeping** | W-15, W-16, W-17, W-19, W-20, W-21 | Doc/code drift, missing ADRs, scoring template | YES |

**Inter-track dependencies** (only 4):

* **W-02 → W-09**: section-view canvas-host borrows the corrected pattern
  from `PlanViewCanvasHost` once it no longer imports `scene-committer`.
* **W-06 → W-11 → W-12**: bake-worker debounce check + chunk-size gate
  both depend on Supabase running so they can be measured against a real
  pipeline, not a mock.
* **W-04 → W-13**: chaos harness + soft-lock load test share fixture
  scaffolding (`MockProvider` factories, peer count config). W-13 should
  reuse W-04's helpers.
* **W-15 → W-16**: the ADR ↔ code drift CI check enforces ADR-0036 is
  amended *before* it is added to the gate.

Everything else is fully parallelizable.

---

## §2 Work items — detailed implementation

Each work item below follows the same template:

> **Severity** · **Owner** · **Effort**
> **Why this exists** (one paragraph linking back to audit §3.x or §5.x)
> **Files touched** (exhaustive)
> **Step-by-step implementation** (every command + every code edit)
> **Acceptance criteria** (literal pass/fail checks)
> **Verification command** (single shell line)
> **Rollback plan** (how to undo if it goes wrong)

---

### W-01 — Fix `@pryzm/ai-cost` module resolution + 9 red ai-host tests

> **Severity**: CRITICAL
> **Owner**: single agent
> **Effort**: 90 minutes
> **Audit reference**: §3 C-6, §1.5 (test results), §3 M-7
> **Depends on**: nothing
> **Blocks**: nothing (but unblocks honest S47 score)

#### Why this exists

Running `cd packages/ai-host && npx vitest run` produces:

```
Test Files  4 failed | 5 passed (9)
     Tests  9 failed | 66 passed (75)
Error: Failed to load url @pryzm/ai-cost (resolved id: @pryzm/ai-cost)
       in __tests__/AiPlane.batch.test.ts. Does the file exist?
```

The package directory exists at `packages/ai-cost/`, but its
`package.json` lacks the `"exports"` field (or `"main"` / `"types"`
pointing at the built artefact), so Vite's resolver returns null when
`@pryzm/ai-cost` is requested from a sibling package. The 5 failing
`AiHost.test.ts > submit workflow > *` cases share a transitive cause
(workflow submission paths instantiate `CostMeter` from `@pryzm/ai-cost`).

PHASE-2D-S47-AUDIT scores S47 100/100 PARTIAL-RATIFIED based on "package
+ skeleton + ADR + bound deferral" but does not have a row for failing
tests. This work item closes the test failures so the score can be honest.

#### Files touched

| File | Change |
|---|---|
| `packages/ai-cost/package.json` | Add `"main"`, `"types"`, and `"exports"` fields pointing at `./src/index.ts` (TS-direct) or `./dist/index.js` (built). |
| `packages/ai-cost/src/index.ts` | Verify it re-exports `CostMeter`, `BudgetGuard`, every type the ai-host needs. |
| `packages/ai-host/package.json` | Add `"@pryzm/ai-cost": "workspace:*"` to `dependencies` (verify it is there; if not, add). |
| `packages/ai-host/__tests__/AiHost.test.ts` | Verify the 5 failing `submit workflow` cases now pass; if any still fails, investigate root cause separately. |
| `packages/ai-host/__tests__/AiPlane.batch.test.ts` | Verify suite now loads. |

#### Step-by-step

1. **Inspect current state**:
   ```sh
   cat packages/ai-cost/package.json
   ls packages/ai-cost/src/
   ```
2. **If `package.json` lacks `"exports"`**, add:
   ```jsonc
   {
     "name": "@pryzm/ai-cost",
     "version": "0.1.0",
     "type": "module",
     "main": "./src/index.ts",
     "types": "./src/index.ts",
     "exports": {
       ".": {
         "types": "./src/index.ts",
         "import": "./src/index.ts"
       }
     }
   }
   ```
   (TS-direct config matches the rest of the workspace per the
   `vitest.config.ts` pattern.)
3. **Verify `packages/ai-host/package.json` declares the dep**:
   ```sh
   rg "ai-cost" packages/ai-host/package.json
   ```
   If missing, add `"@pryzm/ai-cost": "workspace:*"` under
   `"dependencies"` and run `pnpm install` from repo root.
4. **Re-run ai-host tests**:
   ```sh
   cd packages/ai-host && npx vitest run --reporter=basic
   ```
5. **Investigate any remaining failures** in `AiHost.test.ts > submit
   workflow > *`. Root causes likely:
   * `CostMeter` constructor signature mismatch (compare against test
     setup).
   * `AiPlane` calling `costMeter.budgetGuard()` before initialisation.
6. **Update PHASE-2D-S47-AUDIT** to reflect the now-green state (move
   "9 red tests" into a closed-row).

#### Acceptance criteria

* `cd packages/ai-host && npx vitest run` reports `Test Files 9 passed
  (9) | Tests 75 passed (75)`.
* No "Failed to load url" errors in any sibling workspace's test output.
* `cd packages/ai-host && npx tsc --noEmit` returns zero errors.

#### Verification command

```sh
cd packages/ai-host && npx vitest run --reporter=basic 2>&1 | tail -5 | grep -q "0 failed" && echo PASS || echo FAIL
```

#### Rollback

Revert the `packages/ai-cost/package.json` change. Tests revert to the
pre-fix red state; no other code is affected.

---

### W-02 — Fix `PlanViewCanvasHost` SceneCommitter import (architectural breach)

> **Severity**: CRITICAL
> **Owner**: single agent
> **Effort**: 3 hours
> **Audit reference**: §3 C-1, §1.5 (plan-view + sheets test failures), §5 R-6
> **Depends on**: nothing
> **Blocks**: W-09 (section-view canvas-host pattern), `plugins/sheets/__tests__/view-renderer.test.ts` recovery

#### Why this exists

`plugins/plan-view/src/PlanViewCanvasHost.ts` imports `@pryzm/scene-committer`.
ADR-0023 § "Boundary contract" and ADR-0028 § 2 both state: *"plan view does
NOT use THREE.js. It owns a 2D HTML Canvas. The packages/renderer/ package is
irrelevant to plan view. The SceneCommitter is irrelevant."* This is a
direct architectural breach. The breach surfaces as 2 plan-view test
suites failing to load and 1 sheets test suite failing transitively.

The `pryzm-no-three-outside-committer` lint rule should have caught
this; either it allowlists `plugins/plan-view/` or the import is via a
re-export the rule cannot see. Both are fixable.

#### Two acceptable resolutions

| Option | Description | Effort | Recommendation |
|---|---|---|---|
| **A — Refactor (spec-correct)** | Find the SceneCommitter usage in PlanViewCanvasHost, lift it out into a Canvas2D-only API. Plan view talks to `@pryzm/drawing-primitives`, never to `scene-committer`. | 3 h | **Preferred** — preserves ADR-0023 / ADR-0028. |
| **B — Allowlist + ADR amendment** | Amend ADR-0023 to acknowledge the dependency. Update the lint-rule allowlist. | 30 min | Acceptable but precedent-setting; SceneCommitter is L5 and importing it from L7 plan-view is exactly the leak ADR-0005 prohibits. |

This plan implements **Option A**.

#### Files touched

| File | Change |
|---|---|
| `plugins/plan-view/src/PlanViewCanvasHost.ts` | Remove `import * as SC from '@pryzm/scene-committer'` (or equivalent). Replace with `@pryzm/drawing-primitives` API calls. |
| `plugins/plan-view/src/PlanViewRenderer.ts` | If the renderer also leaks, fix here too. |
| `plugins/plan-view/__tests__/plan-view-canvas-host.test.ts` | Verify it loads + passes once the import is removed. |
| `plugins/plan-view/__tests__/plan-view-auto-dim.test.ts` | Verify it loads + passes. |
| `plugins/sheets/__tests__/view-renderer.test.ts` | Verify the transitive failure resolves. |
| `tools/eslint-plugin-pryzm/src/rules/no-three-outside-committer.js` | Confirm `plugins/plan-view/` is **not** in the allowlist; add it to the deny-list explicitly if helpful. |

#### Step-by-step

1. **Locate the breach**:
   ```sh
   rg "@pryzm/scene-committer|sceneCommitter|SceneCommitter" plugins/plan-view/src/
   ```
2. **For each usage** in `PlanViewCanvasHost.ts`:
   * If the call is producing geometry, route through `produceXxx` in
     `@pryzm/geometry-kernel` directly + render via
     `@pryzm/drawing-primitives` Canvas2D backend.
   * If the call is committing to the THREE scene graph, **delete it** —
     plan view paints to a 2D canvas, it does not commit to THREE.
3. **Replace the import line** with whatever drawing-primitives or
   geometry-kernel modules are now needed.
4. **Run the failing suites**:
   ```sh
   cd plugins/plan-view && npx vitest run __tests__/plan-view-canvas-host.test.ts __tests__/plan-view-auto-dim.test.ts
   ```
   Expect both to load and pass.
5. **Run the dependent sheets suite**:
   ```sh
   cd plugins/sheets && npx vitest run __tests__/view-renderer.test.ts
   ```
6. **Tighten the lint rule** (verify it bites):
   * Temporarily re-add `import * as SC from '@pryzm/scene-committer'` to
     `PlanViewCanvasHost.ts`.
   * `npx eslint plugins/plan-view/src/PlanViewCanvasHost.ts` — expect
     `error pryzm/no-three-outside-committer`.
   * Remove the import again.
7. **Update ADR-0023 § "Status"** to record that the breach was found
   in audit and resolved — preserve the audit trail.

#### Acceptance criteria

* `rg "@pryzm/scene-committer" plugins/plan-view/src/` returns zero matches.
* `cd plugins/plan-view && npx vitest run` reports all 16 test files load
  + 0 fail.
* `cd plugins/sheets && npx vitest run` reports all 28 test files load
  + 0 fail.
* `npx eslint plugins/plan-view/` returns 0 errors.

#### Verification command

```sh
rg -q "@pryzm/scene-committer" plugins/plan-view/src/ && echo FAIL || echo PASS
```

#### Rollback

Restore the import. Tests return to the 2-fail baseline. Lint passes
because the rule allowlists plan-view (verify allowlist state first).

---

### W-03 — Implement `authz.can` middleware in `apps/sync-server`

> **Severity**: CRITICAL
> **Owner**: single agent
> **Effort**: 6 hours
> **Audit reference**: §3 C-4, §4 D11, §5 R-8
> **Depends on**: nothing
> **Blocks**: M24 beta (authz is the open data-integrity hole on the multi-user surface)

#### Why this exists

`apps/sync-server/src/index.ts` header comment: *"auth model: client
passes clientId + userId; server trusts. Full JWT lands in Phase 3C."*
The Phase 2D spec line 49 makes `authz.can` an **S43 D7** deliverable in
**every** gateway route. Today the only mention of `authz.can` in the
codebase is a comment in `SyncClient.ts` saying it's a server-side
concern. The server side does not have it.

Without `authz.can`, any client that can enumerate `projectId`s can
append events to projects it has no permission to edit — a data
integrity hole that opens the moment two beta users share a workspace.

#### Files touched

| File | Change |
|---|---|
| `apps/sync-server/src/authz/Authz.ts` | NEW — `Authz` interface + default impl. |
| `apps/sync-server/src/authz/policies.ts` | NEW — per-action policies (`projectEdit`, `projectRead`, `lockAcquire`). |
| `apps/sync-server/src/authz/index.ts` | NEW — barrel. |
| `apps/sync-server/src/handlers/AppendEvent.ts` | Add `authz.can('projectEdit', { actor, projectId })` check before persist. Reject with 403. |
| `apps/sync-server/src/handlers/LoadEvents.ts` | Add `authz.can('projectRead', …)`. |
| `apps/sync-server/src/locks/handlers.ts` | Add `authz.can('lockAcquire', …)` to acquire / release routes. |
| `apps/sync-server/src/index.ts` | Wire `Authz` instance into `SyncServerOptions` (DI). Update header comment to remove the "Phase 3C" defer. WS `project.subscribe` route uses `authz.can('projectRead', …)`. |
| `apps/sync-server/__tests__/authz.test.ts` | NEW — per-route negative tests (unauth user gets 403). |
| `apps/sync-server/src/session/SessionManager.ts` | Surface authorisation state on the session object so the WS push fan-out doesn't leak to peers without `projectRead`. |
| `docs/architecture/adr/0038-authz-middleware-sync-server.md` | NEW ADR documenting the policy taxonomy + JWT migration path to Phase 3C. (See also W-16.) |

#### Step-by-step

1. **Author `Authz` interface** in `apps/sync-server/src/authz/Authz.ts`:
   ```ts
   export type AuthzAction = 'projectRead' | 'projectEdit' | 'lockAcquire';
   export interface AuthzContext {
     readonly actor: { id: string; roles?: readonly string[] };
     readonly projectId: string;
   }
   export interface Authz {
     can(action: AuthzAction, ctx: AuthzContext): Promise<boolean>;
   }
   ```
2. **Default impl** in `policies.ts`:
   * v0 (Phase 2D): allow if `actor.id` is a member of `projectId` per a
     `project_members` table (add the SQL migration alongside).
   * Phase 3C: parse JWT → derive `actor.id` + roles → same check.
3. **SQL migration** at `apps/sync-server/src/authz/project-members.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS project_members (
     project_id  uuid NOT NULL,
     user_id     text NOT NULL,
     role        text NOT NULL DEFAULT 'editor',
     PRIMARY KEY (project_id, user_id)
   );
   ```
4. **Wire into handlers** — every handler that takes `projectId` calls
   `if (!await authz.can(action, { actor, projectId })) return res.status(403)…`
5. **WS path** in `apps/sync-server/src/index.ts`: on `project.subscribe`,
   reject with `error.unauthorised` if `authz.can('projectRead', …)`
   returns false. On `event.append`, reject with `error.unauthorised` if
   `authz.can('projectEdit', …)` returns false.
6. **Negative tests** in `apps/sync-server/__tests__/authz.test.ts`:
   * Unauth user → AppendEvent → 403.
   * Unauth user → LoadEvents → 403.
   * Unauth user → WS subscribe → ws close 1008.
   * Auth user without lock perm → acquire → 403.
7. **Update header comment** in `index.ts` — remove the "Phase 3C" defer
   line. Replace with: *"v0 authz: per-route `authz.can` check against
   `project_members`. JWT actor derivation lands in Phase 3C; the policy
   surface is stable."*
8. **Author ADR-0038** documenting the design.

#### Acceptance criteria

* `rg "authz\.can" apps/sync-server/src/handlers/ apps/sync-server/src/index.ts` returns ≥ 5 matches across handlers + WS routes.
* `apps/sync-server/__tests__/authz.test.ts` reports 4+ tests, all green.
* `apps/sync-server/src/index.ts` header comment no longer mentions "server trusts".
* Existing sync-server tests still pass (no regressions).
* ADR-0038 exists and is linked from `docs/architecture/adr/README.md`.

#### Verification command

```sh
rg -c "authz\.can" apps/sync-server/src/handlers/ apps/sync-server/src/index.ts apps/sync-server/src/locks/handlers.ts | awk -F: '{s+=$2}END{print s>=5?"PASS":"FAIL"}'
```

#### Rollback

Comment out the `authz.can` calls (do not delete the module). Tests fail
on the negative cases; production behaviour falls back to the previous
trust-the-client model. Document the rollback in an incident note —
this should never be done in prod with shared projects.

---

### W-04 — Author chaos-test harness for sync-client

> **Severity**: CRITICAL
> **Owner**: single agent
> **Effort**: 4 hours
> **Audit reference**: §3 C-5, §4 D12, §5 R-8 (related)
> **Depends on**: nothing
> **Blocks**: nothing (but is the named "sleep at night" gate)

#### Why this exists

Phase 2D spec lines 188-203 (S43 D5-D6) explicitly write:
```
// packages/sync-client/causal-test/chaos.test.ts
it('100 random edits across 4 tabs converge in < 5s', ...)
```
The executive-summary line: *"The chaos-test harness is the gate that
lets us sleep at night through Phase 3."* Currently
`packages/sync-client/__tests__/` has 6 test files (all green) — none of
them is the chaos test.

The chaos harness is the existence proof for CRDT correctness. Without
it, "73/73 sync-client tests pass" demonstrates handler-level correctness
but not concurrent convergence under stress.

#### Files touched

| File | Change |
|---|---|
| `packages/sync-client/__tests__/chaos.test.ts` | NEW — the named test. |
| `packages/sync-client/__tests__/_chaos/RandomEditGenerator.ts` | NEW — seeded random `wall.create / wall.move / wall.delete` event factory. |
| `packages/sync-client/__tests__/_chaos/PeerHarness.ts` | NEW — spawns N `SyncClient`s sharing a Y.Doc via `MockProvider`s wired to a single in-memory broker. |
| `packages/sync-client/__tests__/_chaos/convergence.ts` | NEW — `assertDocsConverge(docs)` checks every Y.Map slice equality across all peers. |
| `packages/sync-client/vitest.config.ts` | Add `testTimeout: 30_000` for the chaos suite (default 5 s is too tight). |

#### Step-by-step

1. **Author `RandomEditGenerator`** with a seeded PRNG (use
   `mulberry32(seed)` — no external dep). Yields edits at 10 Hz with a
   distribution of 60 % create / 30 % move / 10 % delete.
2. **Author `PeerHarness`**:
   ```ts
   export interface PeerHarness {
     readonly clients: readonly SyncClient[];
     dispose(): void;
   }
   export function makePeerHarness(opts: {
     peerCount: number;
     projectId: string;
   }): PeerHarness;
   ```
   All peers share a single in-memory broker that fans `Y.Doc` updates
   to every peer with a configurable jitter (0-50 ms).
3. **Author `convergence`**: pure function that compares every peer's
   Y.Doc content (via `toJSON()`) and asserts deep-equality.
4. **Author `chaos.test.ts`**:
   ```ts
   it('100 random edits across 4 tabs converge in < 5s', async () => {
     const harness = makePeerHarness({ peerCount: 4, projectId: 'P' });
     const gen = new RandomEditGenerator(seed: 42, ratePerSecond: 25);
     const start = Date.now();
     for (let i = 0; i < 100; i++) {
       const edit = gen.next();
       const peer = harness.clients[i % 4];
       peer.bridge.applyLocal(edit);
     }
     await waitForQuiet(harness, { quietMs: 200, maxMs: 5_000 });
     assertDocsConverge(harness.clients.map(c => c.doc));
     expect(Date.now() - start).toBeLessThan(5_000);
   });
   ```
5. **Add a "soak" variant** (skipped by default, runnable with `--grep
   chaos-soak`): 10 000 edits across 8 peers, 60 s budget. Useful for
   nightly CI.
6. **Wire into the `pryzm-vi-parity`-style workflow** so the chaos test
   runs on every push.

#### Acceptance criteria

* `cd packages/sync-client && npx vitest run __tests__/chaos.test.ts`
  reports `Tests 1+ passed`.
* The named test ("100 random edits across 4 tabs converge in < 5s")
  exists and passes.
* The harness files are reusable from W-13 (soft-lock load test).

#### Verification command

```sh
cd packages/sync-client && npx vitest run __tests__/chaos.test.ts --reporter=basic 2>&1 | tail -5 | grep -q "0 failed" && echo PASS || echo FAIL
```

#### Rollback

Delete the new test file + helpers. Sync-client tests return to 73/73
green. No production code is affected.

---

### W-05 — Author `pnpm bench yjs-collab`

> **Severity**: HIGH
> **Owner**: single agent
> **Effort**: 4 hours
> **Audit reference**: §3 H-2, §4 D5, §6 (Phase 2D scorecard)
> **Depends on**: W-04 (reuse `PeerHarness`)
> **Blocks**: M24 §2 gate

#### Why this exists

`M24-beta.md` §2 lists `pnpm bench yjs-collab` as a TODO gate
("≤ 250 ms broadcast lag p95 at 50 concurrent users"). `find apps/bench
-name '*yjs*'` returns nothing. The bench is not implemented. Without
a measurement, "ships within 250 ms" is a hope.

#### Files touched

| File | Change |
|---|---|
| `apps/bench/src/benches/yjs-collab.bench.ts` | NEW — the named bench. |
| `apps/bench/scripts/run-yjs-collab.mjs` | NEW — invocation script. |
| `apps/bench/package.json` | Add `"bench:yjs-collab": "node scripts/run-yjs-collab.mjs"` script. |
| `apps/bench/reports/yjs-collab-baseline.md` | NEW — captures the first measurement. |
| `apps/bench/reports/M24-beta.md` | Update §2 to flip the box from `[ ]` to `[x]` with the measured p95. |

#### Step-by-step

1. **Author the bench**:
   ```ts
   // Spawn 50 SyncClients via PeerHarness (W-04).
   // Author is each peer; sustains 5 ops/sec/peer for 30 s.
   // For each op, measure t_local_apply → t_observed_on_peer_50.
   // Report p50 / p95 / p99 + total ops / observed convergence.
   ```
2. **Use `process.hrtime.bigint()`** for sub-ms timing.
3. **Run the bench** and write the result to
   `apps/bench/reports/yjs-collab-baseline.md` in the same shape as
   `export-schedule-baseline.md` (table with budget + headroom column).
4. **Update M24-beta.md §2** to record the measured p95 + a green ✅
   if it is ≤ 250 ms (or a red ❌ + remediation plan if not).

#### Acceptance criteria

* `pnpm bench:yjs-collab` runs end-to-end without error.
* `apps/bench/reports/yjs-collab-baseline.md` contains a measured p95.
* `M24-beta.md` §2 shows the bench checkbox flipped to `[x]` with the
  measured number.

#### Verification command

```sh
test -f apps/bench/reports/yjs-collab-baseline.md && grep -q "p95" apps/bench/reports/yjs-collab-baseline.md && echo PASS || echo FAIL
```

#### Rollback

Delete the new bench script + report. M24 gate returns to TODO state.

---

### W-06 — Land Supabase cutover (S43 D9 binding event)

> **Severity**: CRITICAL
> **Owner**: single agent + founder (provisioning)
> **Effort**: 6 h engineering + ~24 h provisioning + 14 day burn-in
> **Audit reference**: §3 C-7, §4 D1 / D2 / D3 / D4, §6 (Phase 2D)
> **Depends on**: W-03 recommended (otherwise authz hole goes live with cutover)
> **Blocks**: D2, D3, D4, D5, D6 in §4 of audit; M24 beta gate

#### Why this exists

`SUPABASE_URL` is unset; `apps/bench/src/benches/restore-verify.bench.ts`
SKIPS with the explicit reason *"Supabase cutover (S43 D9) has not
landed yet"*. ADR-0035 captures the cutover as PARTIAL-RATIFIED with
D5 deletions correctly gated behind a checklist enforcer. **6 of the 7
M24 beta gates light up only after this lands.**

#### Files touched

| File | Change |
|---|---|
| **Operational** | Provision Supabase project; configure region us-east-1 (R2 colocation per ADR-016). |
| **Secrets** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — set via the Replit secrets panel. **Do NOT commit.** |
| `apps/sync-server/src/eventLog/createEventLog.ts` | Confirm Supabase PG connection string parsing matches the existing PG path. Default `SYNC_EVENT_LOG=pg` when `SUPABASE_URL` is set. |
| `apps/sync-server/src/locks/createSoftLockStore.ts` | Same — default to PG when Supabase is configured. |
| `apps/bench/src/benches/restore-verify.bench.ts` | Once `SUPABASE_URL` is set + `PRYZM_RESTORE_VERIFY_WIRED=true` is exported, the bench runs. |
| `scripts/cutover-checklist.mjs` | NEW (or audit existing) — runs the 5 D5 actions in order, refusing to proceed unless burn-in green-streak ≥ 14. |
| `apps/bench/reports/M24-beta.md` | Update §3 + §4 to reflect cutover landed; restart the 14-day burn-in clock. |

#### Step-by-step

1. **Founder action**: provision Supabase project; capture URL + keys.
2. **Set Replit secrets**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`. Use the secrets management mechanism
   (do not put keys in `.env` files committed to the repo).
3. **Run a connectivity smoke test**:
   ```sh
   node -e 'console.log(await fetch(process.env.SUPABASE_URL + "/rest/v1/").then(r => r.status))'
   ```
4. **Migrate the 4 schemas** to Supabase:
   * `event_log` (from `apps/sync-server/src/eventLog/PgEventLog.ts`)
   * `soft_locks` (from `apps/sync-server/src/locks/soft-locks.sql`)
   * `project_members` (from W-03)
   * `ai_usage` (from `packages/ai-cost/`)
   ```sh
   for f in apps/sync-server/src/{eventLog,locks}/*.sql apps/sync-server/src/authz/project-members.sql packages/ai-cost/src/*.sql; do
     [ -f "$f" ] && psql "$SUPABASE_URL" -f "$f"
   done
   ```
5. **Restart sync-server** with `SYNC_EVENT_LOG=pg DATABASE_URL=<supabase>`.
   Verify a `event.append` round-trips end-to-end via curl + WS.
6. **Set `PRYZM_RESTORE_VERIFY_WIRED=true`** + run
   `pnpm bench restore-verify` for the first night. Capture the streak
   counter at `.local/restore-verify-streak.json` (per ADR-0036).
7. **Start the 14-day burn-in clock**. The `scripts/cutover-checklist.mjs`
   enforcer will refuse to drop the Replit-PG tables until burn-in is
   green for 14 consecutive nights.
8. **After 14 nights green**: run the 5 D5 actions through the enforcer
   (DROP TABLE project_command_log, drop Replit-PG, gate fallback on
   NODE_ENV, delete `src/snapping/`, tag commit).
9. **Update M24-beta.md** §3 functional readiness — Supabase row green;
   §2 restore-verify row green after 7 nights.

#### Acceptance criteria

* `process.env.SUPABASE_URL` is set in production env (verify via Replit
  secrets panel; do not echo to logs).
* `pnpm bench restore-verify` runs and writes a non-skip result.
* After 7 nights of green streak: M24 §2 restore-verify checkbox flips.
* After 14 nights: D5 actions executed via enforcer; commit tagged
  `m24-cutover-burn-in-complete`.

#### Verification command

```sh
test -n "$SUPABASE_URL" && node -e "fetch(process.env.SUPABASE_URL + '/rest/v1/').then(r => process.exit(r.ok ? 0 : 1))" && echo PASS || echo FAIL
```

#### Rollback

The cutover-checklist enforcer is the rollback safeguard — by design,
nothing irreversible happens until burn-in clears. If something fails
during burn-in, simply set `SYNC_EVENT_LOG=memory` and Replit-PG remains
the source of truth. Engineering effort to invert is < 1 hour.

---

### W-07 — Wire `featureFlags.plan_view_v2` runtime gate

> **Severity**: HIGH
> **Owner**: single agent
> **Effort**: 2 hours
> **Audit reference**: §3 H-1, §4 D13, §6 (Phase 2B scorecard)
> **Depends on**: W-02 recommended (clean plan-view first)
> **Blocks**: nothing

#### Why this exists

`packages/persistence-client/src/manifest.ts` declares
`plan_view_v2: z.boolean().default(true)` in the schema and has a doc
comment about "fall back to PRYZM 1 plan view" — but **zero runtime
consumers** in `apps/editor/` or `plugins/plan-view/`. The "built-in
safety" for the highest-risk sub-project of the 36-month plan is a
manifest field that nothing reads.

In a fresh PRYZM 2 codebase with no PRYZM 1 plan view to fall back to
(legacy `apps/editor` deletion is S61 / Phase 3C), the absence of an
actual fallback target may be defensible — but the **flag must at least
be observable**: editor logs which mode it ran in; bench harness reports
which mode was active; ADR is amended to acknowledge "no fallback in
v0, flag observed for telemetry".

#### Files touched

| File | Change |
|---|---|
| `apps/editor/src/projects/ProjectHub.ts` (or wherever a project is opened) | Read `manifest.featureFlags.plan_view_v2`. Pass to plan-view bootstrap. |
| `plugins/plan-view/src/index.ts` | Accept a `featureFlags` option; if `plan_view_v2 === false`, log a warning + render a "PRYZM 1 plan view fallback is not available in this build (Phase 3C)." panel. |
| `packages/persistence-client/src/manifest.ts` | Update the doc comment to acknowledge the flag is observable but no fallback target exists yet (point to ADR-0023 amendment). |
| `docs/architecture/adr/0023-plan-view-architecture.md` | Add an amendment section "v0 fallback policy: no PRYZM 1 plan view in repo; flag is observed for telemetry only; reactivation requires Phase 3B legacy preservation work." |
| `apps/editor/__tests__/featureFlags.plan-view.test.ts` | NEW — verifies the flag is read + branch is taken. |

#### Step-by-step

1. **Identify the editor's plan-view bootstrap site** (likely
   `apps/editor/src/main.ts` or similar — search:
   ```sh
   rg "plan-view|PlanView" apps/editor/src/ | head -20
   ```
2. **Read the flag** at the bootstrap, with a default of `true`:
   ```ts
   const planViewV2 = manifest.featureFlags?.plan_view_v2 ?? true;
   if (!planViewV2) {
     console.warn('[plan-view] plan_view_v2 is false — fallback not available in v0');
     mountFallbackPanel(host);
     return;
   }
   ```
3. **Log the active mode** at bootstrap (OTel span attribute
   `pryzm.plan_view.version = "v2"` or `"v1-fallback"`).
4. **Author the test** — open a project with the flag set to false,
   verify the warning + fallback panel render.
5. **Amend ADR-0023**.

#### Acceptance criteria

* `rg "plan_view_v2" apps/editor/src/ plugins/plan-view/src/` returns ≥ 2
  matches (was zero pre-fix).
* The new test passes.
* ADR-0023 contains an amendment acknowledging the v0 policy.

#### Verification command

```sh
rg -c "plan_view_v2" apps/editor/src/ plugins/plan-view/src/ | awk -F: '{s+=$2}END{print s>=2?"PASS":"FAIL"}'
```

#### Rollback

Revert the bootstrap edit. The manifest schema retains the flag; consumers
revert to ignoring it.

---

### W-08 — Build `apps/export-worker/` skeleton + PDF job

> **Severity**: HIGH
> **Owner**: single agent
> **Effort**: 6 hours
> **Audit reference**: §3 C-2, §4 D10, §5 R-5, §6 (Phase 2C scorecard)
> **Depends on**: nothing
> **Blocks**: M24 named-infra item

#### Why this exists

`ls apps/` does not contain `export-worker/`. Phase 2C spec line 39
(S40 deliverable) called for it. The team's 2C audit deferred it to
"ADR-039" which does not exist on disk. PDF export currently runs
in-process; M24's documentation pipeline contract requires server-side
export for production load patterns.

The bench numbers (M21-2C) prove in-process is fine for the beta cohort
(190 ms p95 for 500 rows) — so the work item is to ship the **bone
structure**, not to migrate the actual rasterisation. The worker
accepts jobs, runs them in-process for v0 (delegating to
`plugins/sheets/src/book/book-exporter.ts` + `plugins/schedules/src/
export/pdf.ts`), returns the PDF bytes. BullMQ + Redis lands in S49+.

#### Files touched

| File | Change |
|---|---|
| `apps/export-worker/package.json` | NEW — `@pryzm/export-worker` workspace. |
| `apps/export-worker/tsconfig.json` | NEW — mirror `apps/ai-worker/tsconfig.json`. |
| `apps/export-worker/src/index.ts` | NEW — Express + queue entry. |
| `apps/export-worker/src/queue.ts` | NEW — InMemoryQueue + BullMQ DI seam (mirror ai-worker). |
| `apps/export-worker/src/jobs/SheetPdfJob.ts` | NEW — wraps `book-exporter`. |
| `apps/export-worker/src/jobs/ScheduleExportJob.ts` | NEW — wraps `plugins/schedules/src/export/{csv,xlsx,pdf}.ts`. |
| `apps/export-worker/src/handlers.ts` | NEW — HTTP handlers for `POST /jobs/sheet-pdf`, `POST /jobs/schedule-export`. |
| `apps/export-worker/__tests__/SheetPdfJob.test.ts` | NEW — end-to-end test with the existing 500-row fixture. |
| `apps/export-worker/__tests__/ScheduleExportJob.test.ts` | NEW. |
| `docs/architecture/adr/0039-export-worker-skeleton.md` | NEW (covers W-16 too). |
| `apps/bench/reports/M24-beta.md` | §3 update — export-worker present (in-process for v0). |

#### Step-by-step

1. **Scaffold the workspace** at `apps/export-worker/`:
   ```sh
   mkdir -p apps/export-worker/src/jobs apps/export-worker/__tests__
   cp apps/ai-worker/package.json apps/export-worker/package.json   # then edit name
   cp apps/ai-worker/tsconfig.json apps/export-worker/tsconfig.json
   ```
   Edit `package.json`: name → `@pryzm/export-worker`; deps include
   `@pryzm/sheets`, `@pryzm/schedules`, `pdf-lib`.
2. **Implement `queue.ts`**: same shape as `apps/ai-worker/src/queue.ts`
   — InMemoryQueue + BullMQ DI seam.
3. **Implement `SheetPdfJob.ts`**: input `{ projectId, sheetId, manifest }`,
   output `{ pdfBytes: Uint8Array, byteSize, durationMs }`. Calls
   `book-exporter.exportSheet(...)`.
4. **Implement `ScheduleExportJob.ts`**: input `{ projectId, scheduleId,
   format }` where format ∈ csv|xlsx|pdf. Output `{ bytes, mime,
   filename }`. Calls into `plugins/schedules/src/export/{format}.ts`.
5. **Implement `handlers.ts`**:
   * `POST /jobs/sheet-pdf` → enqueue SheetPdfJob.
   * `POST /jobs/schedule-export` → enqueue ScheduleExportJob.
   * `GET /jobs/:id` → status / result.
6. **Implement `index.ts`**: Express app + queue + graceful shutdown.
   Port via `EXPORT_WORKER_PORT` (default 4002, mirror sync-server's
   pattern).
7. **Author `__tests__/SheetPdfJob.test.ts`**: instantiate the job,
   submit the existing 500-row fixture, assert PDF bytes are non-empty
   + duration < 1 s.
8. **Add a workflow** (Replit) so `audit-log-middleware`-style monitoring
   keeps it green on every push.
9. **Author ADR-0039**.

#### Acceptance criteria

* `ls apps/export-worker/` returns the new structure.
* `cd apps/export-worker && npx vitest run` passes both job tests.
* `pnpm install` from repo root completes (workspace resolution works).
* Sync-server / editor are unchanged — the worker is additive, not a
  replacement. (Migration to server-side default lands in Phase 3.)

#### Verification command

```sh
test -d apps/export-worker/src && cd apps/export-worker && npx vitest run --reporter=basic 2>&1 | tail -5 | grep -q "0 failed" && echo PASS || echo FAIL
```

#### Rollback

Remove `apps/export-worker/`. PDF export reverts to in-process — the
v0 path is unchanged.

---

### W-09 — Section-view continuation (handlers + renderer + store + producer move)

> **Severity**: CRITICAL
> **Owner**: single agent
> **Effort**: 10 hours
> **Audit reference**: §3 C-3, M-1, §4 D9, §6 (Phase 2B scorecard)
> **Depends on**: W-02 (clean plan-view canvas-host pattern to mirror)
> **Blocks**: M24 §3 functional-readiness "section view functional" claim

#### Why this exists

`plugins/section-view/` is 3 files / 221 LOC with zero handlers, no
renderer, no store. The shell records `render()` call counts but does
not draw. Spec called for 6 handlers + canvas-host + renderer +
SectionStore + section-cut producer in `geometry-kernel/producers/`.
M24 functional-readiness checklist claims "section view functional" —
not true today.

#### Files touched

| File | Change |
|---|---|
| `packages/geometry-kernel/src/producers/section-cut.ts` | MOVE from `plugins/section-view/src/section-cut-producer.ts`. Re-export from old location for source-compat. |
| `packages/stores/src/SectionStore.ts` | NEW — mirror `SheetStore`. |
| `packages/stores/src/ActiveSectionStore.ts` | NEW — mirror `ActiveSheetStore`. |
| `plugins/section-view/src/handlers/CreateSection.ts` | NEW. |
| `plugins/section-view/src/handlers/DeleteSection.ts` | NEW. |
| `plugins/section-view/src/handlers/MoveSectionLine.ts` | NEW. |
| `plugins/section-view/src/handlers/SetSectionDepth.ts` | NEW. |
| `plugins/section-view/src/handlers/SetSectionMark.ts` | NEW. |
| `plugins/section-view/src/handlers/SetSectionScale.ts` | NEW. |
| `plugins/section-view/src/handlers/index.ts` | NEW barrel. |
| `plugins/section-view/src/SectionViewRenderer.ts` | NEW — Canvas2D backend feeding `classifierToPrimitives`. |
| `plugins/section-view/src/SectionViewCanvasHost.ts` | UPDATE — actually drive a canvas (ref-pattern from W-02-fixed PlanViewCanvasHost). |
| `plugins/section-view/__tests__/handlers.*.test.ts` | NEW — one per handler, mirror plan-view-handler tests. |
| `plugins/section-view/__tests__/canvas-host.test.ts` | NEW — assert the host actually draws (via `getImageData` of the canvas backend). |
| `docs/architecture/adr/0030-phase-2b-post-audit-reconciliation.md` | Append amendment: "Section-view continuation landed in W-09 of the Phase 2 close plan." |

#### Step-by-step

1. **Move section-cut-producer** to its spec'd home:
   ```sh
   git mv plugins/section-view/src/section-cut-producer.ts packages/geometry-kernel/src/producers/section-cut.ts
   ```
   Update `packages/geometry-kernel/src/producers/index.ts` to re-export.
   Add a tiny re-export shim at the old path so plugin imports keep
   working during transition.
2. **Author `SectionStore` + `ActiveSectionStore`** in `packages/stores/`,
   following the exact `SheetStore` shape.
3. **Author the 6 handlers** in `plugins/section-view/src/handlers/`,
   each with a `describe → mutate → emit` shape mirroring
   `plugins/sheets/src/handlers/CreateSheet.ts`. Wire each into the
   handler registry.
4. **Author `SectionViewRenderer.ts`**:
   * Accepts the SectionCut output.
   * Maps `cutEdges` to filled regions (poche per ADR-0024 §"Marks").
   * Maps `beyondEdges` to thin lines.
   * Calls into `@pryzm/drawing-primitives/backends/canvas2d` — exactly
     the path plan-view uses.
5. **Promote `SectionViewCanvasHost.ts`** from shell to live host:
   * Holds a `CanvasRenderingContext2D`.
   * Subscribes to `SectionStore` + `ActiveSectionStore` + the AABB
     element source.
   * On change, calls `produceSectionCut` then renders via the new
     `SectionViewRenderer`.
6. **Author tests**: 1 per handler (6) + 1 canvas-host integration test
   that asserts non-zero pixels are painted.
7. **Update M24-beta.md** §3 — section view row truthfully green.
8. **Append amendment** to ADR-0030.

#### Acceptance criteria

* `ls plugins/section-view/src/handlers/ | wc -l` returns ≥ 7 (6
  handlers + index).
* `packages/stores/src/SectionStore.ts` + `ActiveSectionStore.ts` exist.
* `packages/geometry-kernel/src/producers/section-cut.ts` exists.
* `cd plugins/section-view && npx vitest run` passes ≥ 7 test files
  with 0 failures.
* The canvas-host integration test asserts pixels-painted > 0.

#### Verification command

```sh
test -f packages/stores/src/SectionStore.ts && \
  test -f packages/geometry-kernel/src/producers/section-cut.ts && \
  test "$(ls plugins/section-view/src/handlers/ 2>/dev/null | wc -l)" -ge 7 && \
  cd plugins/section-view && npx vitest run --reporter=basic 2>&1 | tail -5 | grep -q "0 failed" && echo PASS || echo FAIL
```

#### Rollback

`git revert` the section-view + producer move + store creation. Tests
return to "section-view 3-file shell" baseline.

---

### W-10 — Wire `view-sync.ts` renderer plumbing into canvas hosts

> **Severity**: HIGH
> **Owner**: single agent
> **Effort**: 4 hours
> **Audit reference**: §3 H-3, §4 D14, §6 (Phase 2B scorecard)
> **Depends on**: W-02 (PlanView clean), W-09 (SectionView host live)
> **Blocks**: nothing (degraded UX without it)

#### Why this exists

`packages/view-state/src/view-sync.ts` ships a `ViewSyncBus`
publisher-subscriber but the file header acknowledges *"the actual
transport into the renderer (camera move, selection paint) is plumbing
that lives in each canvas host and is wired in S46 D2"*. PHASE-2D-S46-AUDIT
does not claim S46 D2 landed. The bus exists with no effective
subscribers.

#### Files touched

| File | Change |
|---|---|
| `plugins/plan-view/src/PlanViewCanvasHost.ts` | Subscribe to `viewSyncBus` for `selection`, `viewport`, `cut-plane` topics. On selection events from peer views, mirror the highlight. On viewport events, optionally pan/zoom in lockstep. On cut-plane, propagate to dependent section view. |
| `plugins/section-view/src/SectionViewCanvasHost.ts` | Subscribe to `cut-plane` (incoming from plan view) + publish `selection` outbound. |
| `apps/editor/src/main.ts` (or workbench bootstrap) | Construct a single `ViewSyncBus` instance. Pass into each canvas host on mount. |
| `packages/view-state/__tests__/view-sync.bus.integration.test.ts` | NEW — 2 mock canvas hosts, publish event from A, assert B receives it. |

#### Step-by-step

1. **Construct the bus** at editor bootstrap:
   ```ts
   const viewSyncBus = new ViewSyncBus();
   ```
2. **Pass into each canvas host** as an option:
   ```ts
   const planHost = new PlanViewCanvasHost({ ..., viewSyncBus });
   const sectionHost = new SectionViewCanvasHost({ ..., viewSyncBus });
   ```
3. **In each host's constructor**, subscribe to relevant topics:
   ```ts
   const dispose = viewSyncBus.subscribe(
     this.viewId,
     ['selection', 'viewport', 'cut-plane'],
     (event) => this.applySyncEvent(event),
   );
   ```
4. **Publish from the right places**:
   * Selection change → publish `selection` topic with element ids.
   * Camera move → publish `viewport` with `{ pan, zoom }`.
   * Cut-plane move (plan view → section view) → publish `cut-plane`
     with section-line endpoints.
5. **`applySyncEvent`** in each host: re-route to the canvas paint
   path. For selection, repaint with the new highlight set; for
   viewport, animate camera; for cut-plane, re-run `produceSectionCut`.
6. **Add an integration test** in `packages/view-state/__tests__/`.

#### Acceptance criteria

* The integration test passes: event published in mock host A is
  received in mock host B.
* Plan view → section view cut-plane sync works in the running editor
  (manual smoke test via `pnpm dev`).
* `view-sync.ts` file header is updated — the "wired in S46 D2"
  comment becomes "wired in W-10 (Phase 2 close plan)".

#### Verification command

```sh
cd packages/view-state && npx vitest run __tests__/view-sync.bus.integration.test.ts --reporter=basic 2>&1 | tail -3 | grep -q "0 failed" && echo PASS || echo FAIL
```

#### Rollback

Don't pass `viewSyncBus` into canvas hosts. Bus stays in place; subscribers
revert to none. UX degrades but no errors.

---

### W-11 — Verify + pin bake-worker 250 ms debounce

> **Severity**: HIGH
> **Owner**: single agent
> **Effort**: 30 minutes
> **Audit reference**: §3 H-4
> **Depends on**: nothing
> **Blocks**: nothing

#### Why this exists

`[strategic ADR-010]` mandates 250 ms coalescing window. Phase 2D spec
line 50 (S43): *"`apps/bake-worker` debounce window pinned at 250 ms"*.
This audit did not verify the actual constant — it is a 5-minute check
that should be done explicitly.

#### Files touched

| File | Change |
|---|---|
| `apps/bake-worker/src/queue.ts` (or wherever debounce is configured) | Verify constant is 250. If 500, change to 250 + add a comment citing ADR-010. |
| `apps/bake-worker/__tests__/debounce.test.ts` | NEW (if absent) — fire 5 events 50 ms apart, assert exactly 1 bake invocation after 250 ms. |
| `docs/architecture/adr/0010` (if exists) | Verify cited correctly. |

#### Step-by-step

1. **Locate the debounce constant**:
   ```sh
   rg -n "debounce|250|500" apps/bake-worker/src/ | head -20
   ```
2. **If 500 ms or other**, change to 250 with a comment.
3. **Author/update the test**.
4. **Run**:
   ```sh
   cd packages/bake-worker && npx vitest run __tests__/debounce.test.ts
   ```

#### Acceptance criteria

* The constant is 250 (verified by source inspection + test).
* Test passes.

#### Verification command

```sh
rg -q "debounce.*250\|250.*debounce" apps/bake-worker/src/ && echo PASS || echo FAIL
```

#### Rollback

Restore prior value. Tests revert.

---

### W-12 — Lazy AI chunk size CI gate (`vite build --report` parser)

> **Severity**: MEDIUM
> **Owner**: single agent
> **Effort**: 2 hours
> **Audit reference**: §3 (M24 §2 gate), §5 R-10, §6 (Phase 2D)
> **Depends on**: nothing (uses existing build output)
> **Blocks**: M24 §2 final checkbox

#### Why this exists

ADR-0014 / ADR-0037 K3-A gate: `AiHost.impl` must be in a separate Vite
chunk. M24 §2 has the unchecked TODO `vite build --report confirms
packages/ai-host/AiHost.impl is in a separate chunk`. The static linter
`scripts/check-ai-host-lazy.mjs` covers source-side; the build-side
verification is missing. Even if the chunk is correctly split, no one
measures or asserts its size.

#### Files touched

| File | Change |
|---|---|
| `scripts/check-vite-chunks.mjs` | NEW — runs `vite build --report`, parses the output, asserts `AiHost.impl` is in a distinct chunk + reports its gzip size. |
| `apps/editor/package.json` | Add `"check:chunks": "node ../../scripts/check-vite-chunks.mjs"`. |
| `apps/bench/reports/M24-beta.md` | Update §2 — chunk gate green. |
| `.github/workflows/ci.yml` | Add a step that runs `pnpm --filter @pryzm/editor check:chunks`. |

#### Step-by-step

1. **Author `scripts/check-vite-chunks.mjs`**:
   * Spawn `vite build --report` in `apps/editor/`.
   * Read `dist/stats.html` (or `--report json`).
   * Find a chunk containing `AiHost.impl`.
   * If absent: exit 1 with "AiHost.impl not split — K3-A gate broken".
   * If present: print chunk size in KB gzip.
   * If size > threshold (suggested 200 KB gzip): exit 1.
2. **Wire into CI**.
3. **Update M24-beta.md**.

#### Acceptance criteria

* Running `node scripts/check-vite-chunks.mjs` from a clean build prints
  the chunk size and exits 0.
* Manually breaking the lazy import (e.g. converting `await import` to
  static `import`) makes the script exit 1.

#### Verification command

```sh
cd apps/editor && pnpm build && node ../../scripts/check-vite-chunks.mjs && echo PASS || echo FAIL
```

#### Rollback

Remove the script + CI step. The static lint guard
(`check-ai-host-lazy.mjs`) remains.

---

### W-13 — Load-test soft-locks (50 peers × 100 elements × 10 Hz churn)

> **Severity**: HIGH
> **Owner**: single agent
> **Effort**: 4 hours
> **Audit reference**: §5 R-9, §6 (Phase 2D)
> **Depends on**: W-04 (reuse PeerHarness)
> **Blocks**: nothing (informs the 5 s sweep-interval decision)

#### Why this exists

Soft-locks ship with PG implementation + sweeper + UI. The sweeper
interval is 5 s — a guess, not a measurement. Without load-test data
the badge-staleness ceiling is hypothetical. With 25 invited beta
users, this is a tier-2 risk; without measurement it is unknown.

#### Files touched

| File | Change |
|---|---|
| `apps/bench/src/benches/soft-locks-load.bench.ts` | NEW. |
| `apps/bench/scripts/run-soft-locks-load.mjs` | NEW. |
| `apps/bench/package.json` | Add `"bench:soft-locks-load": "node scripts/run-soft-locks-load.mjs"`. |
| `apps/bench/reports/soft-locks-load-baseline.md` | NEW — captures the sweeper-staleness measurement. |

#### Step-by-step

1. **Use `PeerHarness`** (W-04) to spawn 50 peers.
2. **Each peer** acquires/releases locks on a random element from a 100-
   element pool at 10 Hz.
3. **Measure**:
   * Acquire latency p50/p95/p99.
   * PG sweeper invocation rate.
   * Badge staleness (time from `lock.released` true → UI sees it).
4. **Write the report**. If sweeper-staleness exceeds 5 s under load,
   raise an issue + recommend interval reduction or push-broadcast
   route (per ADR-0035 §2.5 future-task).

#### Acceptance criteria

* Bench runs to completion.
* Report captures p50/p95/p99 + sweeper invocation rate + staleness.

#### Verification command

```sh
test -f apps/bench/reports/soft-locks-load-baseline.md && grep -q "p95" apps/bench/reports/soft-locks-load-baseline.md && echo PASS || echo FAIL
```

#### Rollback

Delete the bench + report. No production code is affected.

---

### W-14 — Threat-model `apps/sync-server/` + write `threat_model.md`

> **Severity**: PROCESS
> **Owner**: single agent
> **Effort**: 4 hours
> **Audit reference**: §5 R-8, §7.4
> **Depends on**: W-03 (authz lands first so the model has a real surface)
> **Blocks**: nothing (recommended pre-M24 as defense-in-depth)

#### Why this exists

Phase 2D ships multi-user collaboration. With Supabase about to land
(W-06), the public attack surface widens. The repo has a
`threat_modeling` skill but it has not been run against sync-server.

#### Files touched

| File | Change |
|---|---|
| `apps/sync-server/threat_model.md` | NEW — STRIDE-style analysis of every endpoint + WS frame. |
| Findings → opens issues / W-items as needed. |

#### Step-by-step

1. **Read** `.local/skills/threat_modeling/SKILL.md`.
2. **Catalogue trust boundaries**: client ↔ server, server ↔ Supabase,
   server ↔ bake worker, server ↔ AI worker.
3. **For each endpoint** (HTTP + WS), enumerate STRIDE:
   * Spoofing: actor identity (W-03 closes most of this).
   * Tampering: event payload integrity (currently trusted).
   * Repudiation: audit log present?
   * Information disclosure: peer-event push fan-out leakage.
   * Denial of service: per-IP rate limit; `event.append` spam.
   * Elevation of privilege: anyone can become editor of any project?
4. **Write `threat_model.md`** with mitigations + open work items.
5. **File W-items** for any P1 findings.

#### Acceptance criteria

* `apps/sync-server/threat_model.md` exists with at least one finding
  per STRIDE category.
* Any P1 findings are converted into new W-items.

#### Verification command

```sh
test -f apps/sync-server/threat_model.md && grep -q "STRIDE" apps/sync-server/threat_model.md && echo PASS || echo FAIL
```

#### Rollback

n/a — additive doc only.

---

### W-15 — ADR ↔ code drift CI check + amend ADR-0036

> **Severity**: MEDIUM
> **Owner**: single agent
> **Effort**: 3 hours
> **Audit reference**: §3 H-6, §5 R-1
> **Depends on**: nothing
> **Blocks**: W-16 (uses the same lint shape)

#### Why this exists

ADR-0036 says *"waves 1-5 shipped; waves 6-11 bound to S49 / Phase 3A"*.
Code reality: `packages/visibility/src/waves/w01..w11` all exist; 82/82
visibility tests pass. ADR is stale. The fix is one-line; the
**precedent** is the worry — same drift could happen to ADR-0035
(soft-locks) or ADR-0033 (sync-client).

A simple CI check enforces ADR claims line up with directory contents.

#### Files touched

| File | Change |
|---|---|
| `docs/architecture/adr/0036-visibility-intent-waves-1-5.md` | Amend status: change "waves 6-11 deferred to S49" → "all 11 waves shipped 2026-04-28; ADR title retained for historical accuracy". |
| `scripts/check-adr-code-drift.mjs` | NEW — for each ADR with a `<!-- code-anchor: PATTERN -->` comment, run `rg PATTERN` and assert claim ↔ presence match. |
| `docs/architecture/adr/README.md` | Document the `<!-- code-anchor: ... -->` convention. |
| `.github/workflows/ci.yml` | Add `node scripts/check-adr-code-drift.mjs` step. |

#### Step-by-step

1. **Amend ADR-0036** — one-line title amendment + status block update.
2. **Author the script**:
   ```js
   // For each ADR-XXXX file:
   //   parse <!-- code-anchor: <glob> --> directives
   //   for each: rg the pattern in the workspace
   //   compare against the ADR's "claim" annotations
   ```
3. **Add anchors to a few ADRs** to seed the check (ADR-0036, ADR-0033,
   ADR-0035).
4. **Wire into CI**.

#### Acceptance criteria

* ADR-0036 status reflects waves 1-11 shipped.
* `scripts/check-adr-code-drift.mjs` exists and exits 0 on the current
  state.
* CI step added.

#### Verification command

```sh
node scripts/check-adr-code-drift.mjs && echo PASS || echo FAIL
```

#### Rollback

Remove the script + CI step. ADR-0036 amendment can stay independently.

---

### W-16 — Author missing ADR-0038, ADR-0039, ADR-0040

> **Severity**: MEDIUM
> **Owner**: single agent
> **Effort**: 2 hours
> **Audit reference**: §3 L-3, L-4
> **Depends on**: W-03 (ADR-0038 documents authz design); W-08 (ADR-0039 documents export-worker)
> **Blocks**: W-15 (drift check assumes ADRs exist)

#### Why this exists

PHASE-2C-AUDIT references ADR-039 + ADR-040 by name; the ADR directory
ends at 0037. Three ADRs need to exist to back the work in W-03 + W-08
+ schedule export.

#### Files touched

| File | Change |
|---|---|
| `docs/architecture/adr/0038-authz-middleware-sync-server.md` | NEW (authored as part of W-03). |
| `docs/architecture/adr/0039-export-worker-skeleton.md` | NEW (authored as part of W-08). |
| `docs/architecture/adr/0040-schedule-export-formats.md` | NEW (covers the CSV/XLSX/PDF tri-output decision retroactively). |
| `docs/architecture/adr/README.md` | Update index. |

#### Step-by-step

For each ADR:
1. Use the existing ADR template format (`# ADR-XXXX — Title` /
   `Status: Accepted` / `Date` / `Sprint` / `Authors` / `Related`).
2. Document context, decision, consequences.
3. Cross-reference the relevant work item / spec line / PR.
4. Add to the README index.

#### Acceptance criteria

* `ls docs/architecture/adr/0038*.md docs/architecture/adr/0039*.md docs/architecture/adr/0040*.md` returns 3 files.
* The README index lists them.

#### Verification command

```sh
ls docs/architecture/adr/00{38,39,40}-*.md 2>/dev/null | wc -l | awk '{print $1==3?"PASS":"FAIL"}'
```

#### Rollback

Delete the three ADRs.

---

### W-17 — Two-column scoring + red-tests column in audit template

> **Severity**: PROCESS
> **Owner**: single agent
> **Effort**: 1 hour
> **Audit reference**: §3 L-5, §5 R-2, R-3
> **Depends on**: nothing
> **Blocks**: nothing (improves all future audits)

#### Why this exists

The team's per-sprint audits use "100/100 PARTIAL-RATIFIED" pattern that
conflates SHIPPED with CLOSED. PHASE-2D-S44-AUDIT alone gets it right
with raw 70/100 + closure 100/100. Standardising this shape — plus
adding a "red-tests" column — would surface the test failures W-01 +
W-02 closed.

#### Files touched

| File | Change |
|---|---|
| `docs/00_NEW_ARCHITECTURE/phases/audits/_TEMPLATE.md` | NEW — canonical audit shape. |
| `docs/00_NEW_ARCHITECTURE/phases/audits/PHASE-2A-AUDIT-2026-04-28.md` | Retroactively re-format with two-column score + red-tests row. (Optional; nice-to-have.) |
| `docs/00_NEW_ARCHITECTURE/phases/audits/PHASE-2D-S47-AUDIT-2026-04-28.md` | Update score from 100/100 PARTIAL-RATIFIED to e.g. 80/100 raw + 100/100 closure (with the 9 red tests row that closes after W-01). |

#### Step-by-step

1. **Author the template** with sections:
   * `§0 Scoring Summary` — `Sprint | Raw % | Closure % | Red tests`
   * `§1 Verdict`
   * `§2 Per-exit-criterion`
   * `§3 Deferred bindings`
   * `§4 Cross-references`
2. **Update PHASE-2D-S47-AUDIT** as a worked example.

#### Acceptance criteria

* Template file exists.
* At least one historical audit re-formatted to the new shape.

#### Verification command

```sh
test -f docs/00_NEW_ARCHITECTURE/phases/audits/_TEMPLATE.md && echo PASS || echo FAIL
```

#### Rollback

Delete template; old audits are unchanged.

---

### W-18 — Resurrect `audit-log-middleware` workflow

> **Severity**: LOW
> **Owner**: single agent
> **Effort**: 30 minutes
> **Audit reference**: §3 H-5 (Phase 2 carries this from Phase 1)
> **Depends on**: nothing
> **Blocks**: nothing

#### Why this exists

Same gap as W-11 in `PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`.
Phase 2 has not regressed it but has not fixed it either. With multi-
user authz landing (W-03), the audit-log middleware becomes more
relevant — every authz denial should be audit-logged.

#### Files touched

Same as Phase-1 W-11 — refer to that plan. Tip: the `tests/audit-log-s57/`
suite likely needs updates to cover the new authz code paths from W-03.

#### Step-by-step / acceptance / verification / rollback

Inherit from Phase-1 W-11. Re-run the audit-log workflow after the
fix; expect green.

---

### W-19 — ADR housekeeping cluster (small fixes)

> **Severity**: LOW
> **Owner**: single agent
> **Effort**: 90 minutes
> **Audit reference**: §3 M-3, M-4, M-5, M-8
> **Depends on**: nothing
> **Blocks**: nothing

#### Why this exists

Four small audit findings, each ~15 min:

* M-3: `RecomputeRoomBoundary` is a +1 over spec — ADR-0022 amendment.
* M-4: `view-chip.ts` named (spec said `peer-view-chip.ts`) — rename or
  amend ADR-0034.
* M-5: `plugins/visibility-intent/` directory absent (waves live in
  `packages/visibility/`) — amend Phase 2D spec wording or move the
  code; recommendation: amend the spec because package-location is
  architecturally correct.
* M-8: `ActiveSheetStore.ts` + `ActiveScheduleStore.ts` over-spec —
  amend ADR-0031 (sheets) + ADR-0032 (schedules) to acknowledge.

#### Files touched

| File | Change |
|---|---|
| `docs/architecture/adr/0022-room-boundary-detection.md` | Amend: 9th handler `RecomputeRoomBoundary` for half-edge re-flood. |
| `docs/architecture/adr/0034-awareness-multiplayer-cursor.md` | Amend: file is `view-chip.ts` (rationale: drops the redundant `peer-` prefix; sibling files are `cursor.ts`, `peer-list.ts`, `lock-ui.ts`). |
| `docs/00_NEW_ARCHITECTURE/phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` | Amend: visibility waves live in `packages/visibility/` not `plugins/visibility-intent/` — pure functions, not L7 plugins. |
| `docs/architecture/adr/0031-sheets-architecture.md` (or wherever) | Amend: `ActiveSheetStore` + `ActiveScheduleStore` exist for runtime focus state. |

#### Step-by-step

Each is a 1-paragraph amendment to the relevant ADR/spec.

#### Acceptance criteria

* Each amended file contains the new amendment block under a clearly
  labelled "Amendment 2026-04-28" heading.

#### Verification command

```sh
rg "Amendment 2026-04-28" docs/architecture/adr/ docs/00_NEW_ARCHITECTURE/phases/ | wc -l | awk '{print $1>=4?"PASS":"FAIL"}'
```

#### Rollback

Revert the amendments.

---

### W-20 — Scope-creep classification of new packages + plugins (extends Phase-1 W-06)

> **Severity**: MEDIUM
> **Owner**: single agent
> **Effort**: 2 hours
> **Audit reference**: §3 M-9 (extension of Phase-1 W-06)
> **Depends on**: nothing
> **Blocks**: nothing

#### Why this exists

Phase 1 W-06 called for KEEP/PARK/TRIM classification of all packages +
plugins. Phase 2 added 6 new packages + 14 new plugins; the
classification table is now even more useful and remains undelivered.

#### Files touched

| File | Change |
|---|---|
| `docs/00_NEW_ARCHITECTURE/PACKAGE-CLASSIFICATION-2026-04-28.md` | NEW — table of every package + plugin with KEEP / PARK / TRIM, owner, sprint of origin, current usage count. |

#### Step-by-step

1. `ls packages/ plugins/ apps/ | sort`
2. For each:
   * KEEP if used by ≥ 2 consumers in current code.
   * PARK if shipped but not yet wired (e.g. `constraint-solver`,
     `pdf-to-bim`, `family-loader`).
   * TRIM if unused or duplicated (e.g. `legacy-shim` if Phase-1 W-16
     decided so).
3. Cross-link to the relevant ADR / spec section.

#### Acceptance criteria

* Document exists with every package + plugin + app classified.

#### Verification command

```sh
test -f docs/00_NEW_ARCHITECTURE/PACKAGE-CLASSIFICATION-2026-04-28.md && echo PASS || echo FAIL
```

#### Rollback

Delete the document.

---

### W-21 — Sub-phase demo recordings (2A · 2B · 2C · 2D)

> **Severity**: PROCESS
> **Owner**: founder (not engineering)
> **Effort**: ~4 × 8 min screencasts + script writing (founder rest week)
> **Audit reference**: §3 L-2, §6 (every sub-phase scorecard)
> **Depends on**: W-09 (section view actually working) for 2B demo
> **Blocks**: nothing

#### Why this exists

Each sub-phase's spec named a screencast. None is in the repo. Same
pattern as Phase-1 W-14. Useful for investor + alumni updates.

#### Files touched

| File | Change |
|---|---|
| `docs/demos/M15-2A.script.md` | NEW. |
| `docs/demos/M18-2B.script.md` | NEW. |
| `docs/demos/M21-2C.script.md` | NEW. |
| `docs/demos/M24-2D.script.md` | NEW. |
| Recorded `.mp4` files stored in `attached_assets/screencasts/` (not committed; uploaded to founder's archive). |

#### Step-by-step

Founder action — outside the scope of this engineering plan.

#### Acceptance criteria

* Four scripts exist; four `.mp4`s referenced in the M-bench reports.

#### Verification command

n/a — process item.

#### Rollback

n/a — additive only.

---

## §3 Done-gate matrix — what "Phase 2 closes" looks like

The following 18 commands, run sequentially on a clean clone, **all
return PASS** when this plan is complete:

| # | Command | Closes |
|---|---|---|
| G-01 | `cd packages/ai-host && npx vitest run --reporter=basic 2>&1 \| tail -5 \| grep -q "0 failed"` | W-01 |
| G-02 | `! rg -q "@pryzm/scene-committer" plugins/plan-view/src/` | W-02 |
| G-03 | `cd plugins/plan-view && npx vitest run --reporter=basic 2>&1 \| tail -5 \| grep -q "0 failed"` | W-02 |
| G-04 | `cd plugins/sheets && npx vitest run --reporter=basic 2>&1 \| tail -5 \| grep -q "0 failed"` | W-02 |
| G-05 | `[ "$(rg -c 'authz\.can' apps/sync-server/src/handlers/ apps/sync-server/src/index.ts apps/sync-server/src/locks/handlers.ts \| awk -F: '{s+=$2}END{print s}')" -ge 5 ]` | W-03 |
| G-06 | `cd apps/sync-server && npx vitest run __tests__/authz.test.ts --reporter=basic 2>&1 \| tail -3 \| grep -q "0 failed"` | W-03 |
| G-07 | `cd packages/sync-client && npx vitest run __tests__/chaos.test.ts --reporter=basic 2>&1 \| tail -3 \| grep -q "0 failed"` | W-04 |
| G-08 | `test -f apps/bench/reports/yjs-collab-baseline.md && grep -q "p95" apps/bench/reports/yjs-collab-baseline.md` | W-05 |
| G-09 | `[ -n "$SUPABASE_URL" ]` (Supabase live in prod env) | W-06 |
| G-10 | `[ "$(rg -c 'plan_view_v2' apps/editor/src/ plugins/plan-view/src/ \| awk -F: '{s+=$2}END{print s}')" -ge 2 ]` | W-07 |
| G-11 | `test -d apps/export-worker/src && cd apps/export-worker && npx vitest run --reporter=basic 2>&1 \| tail -3 \| grep -q "0 failed"` | W-08 |
| G-12 | `test -f packages/stores/src/SectionStore.ts && test -f packages/geometry-kernel/src/producers/section-cut.ts && [ "$(ls plugins/section-view/src/handlers/ \| wc -l)" -ge 7 ]` | W-09 |
| G-13 | `cd plugins/section-view && npx vitest run --reporter=basic 2>&1 \| tail -3 \| grep -q "0 failed"` | W-09 |
| G-14 | `cd packages/view-state && npx vitest run __tests__/view-sync.bus.integration.test.ts --reporter=basic 2>&1 \| tail -3 \| grep -q "0 failed"` | W-10 |
| G-15 | `rg -q "250" apps/bake-worker/src/queue.ts` | W-11 |
| G-16 | `cd apps/editor && pnpm build && node ../../scripts/check-vite-chunks.mjs` | W-12 |
| G-17 | `test -f apps/bench/reports/soft-locks-load-baseline.md && grep -q "p95" apps/bench/reports/soft-locks-load-baseline.md` | W-13 |
| G-18 | `test -f apps/sync-server/threat_model.md && grep -q "STRIDE" apps/sync-server/threat_model.md` | W-14 |
| G-19 | `node scripts/check-adr-code-drift.mjs` | W-15 |
| G-20 | `[ "$(ls docs/architecture/adr/00{38,39,40}-*.md 2>/dev/null \| wc -l)" -eq 3 ]` | W-16 |
| G-21 | `test -f docs/00_NEW_ARCHITECTURE/phases/audits/_TEMPLATE.md` | W-17 |
| G-22 | `test -f docs/00_NEW_ARCHITECTURE/PACKAGE-CLASSIFICATION-2026-04-28.md` | W-20 |

**21 done-gates total** (W-18 audit-log fix and W-19 ADR housekeeping
have soft pass criteria embedded in the items themselves; W-21 is
process-only).

---

## §4 Calendar — suggested execution order

If a single agent picks this up:

| Day | Morning | Afternoon | Notes |
|---|---|---|---|
| Mon | W-01 (90 min) + W-02 (3 h) | W-18 (30 min) + start W-09 (2 h of 10 h) | Test triage day |
| Tue | W-09 continued (4 h) + W-09 done (2 h) | W-10 (4 h) | Section view + view-sync |
| Wed | W-03 (6 h) | W-04 (4 h) | Multi-user safety |
| Thu | W-05 (4 h) | W-13 (4 h) | Bench day; reuse W-04 helpers |
| Fri | W-08 (6 h) | W-11 (30 min) + W-19 (90 min) | Export worker + housekeeping |
| Mon | W-07 (2 h) + W-12 (2 h) | W-14 (4 h) | Editor flag + chunk gate + threat model |
| Tue | W-15 (3 h) + W-16 (2 h) | W-17 (1 h) + W-20 (2 h) | ADR + process |
| Wed-Fri | W-06 founder + agent collab + 14-day burn-in starts | | Cutover |

If parallel agents (3-4): collapse Mon-Fri into 3 calendar days.

W-06 (cutover + 14-day burn-in) is the natural critical path. If it
starts Mon Day 1 in parallel with engineering, the 14-day burn-in
window completes ≈ end of W-06 + 14 = day 17, which is the fastest
possible M24 close.

---

## §5 Out-of-scope explicit list

The following are deliberately NOT in this plan:

| Item | Why out of scope |
|---|---|
| Visibility waves 6-11 implementation | Already shipped (over-delivered vs spec); only ADR amendment in W-15. |
| Constraint solver | Phase 3A. Parked package exists; usage waits. |
| Full AI subsystem migration | Phase 3A. AI host lazy-bootstrap + worker skeleton are the Phase 2 contract. |
| IFC, DXF, Rhino plugins | Phase 3B. Workflows already exist for the parked plugins. |
| Component editor migration | Phase 3B. |
| BCF round-trip | Phase 3B. |
| Plugin SDK 1.0 publish + marketplace | Phase 3C. |
| Public REST + WS APIs | Phase 3C. |
| Headless npm publish | Phase 3C. |
| Self-host packaging | Phase 3D. |
| Browser matrix beyond Chromium | Phase 3D. |
| Legacy `apps/editor` deletion | S61 (Phase 3C). |
| Phase 1 close items | Tracked separately in `PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`. |

---

## §6 Cross-link to Phase 1 close plan

The following Phase-1 items have analogues here; closing both in the
same engineering window is efficient:

| Phase 1 item | Phase 2 analogue | Combined closure |
|---|---|---|
| W-11 — `audit-log-middleware` | W-18 (Phase 2) | Single fix; do once |
| W-06 — Scope-creep classification | W-20 (Phase 2) | Phase 2 extends the Phase 1 table; merge into one document |
| W-04 — Cold-load real-fixture bench | (no direct analogue) | Phase 1 perf gate; independent |
| W-03 — Bundle-size measurement | W-12 (Phase 2 — chunk-size for AiHost) | Different gates, same script pattern; reuse the parser |

If both close plans run in parallel, total combined effort drops from
≈ 95 hours to ≈ 80 hours due to shared infrastructure work.

---

## §7 Summary

This plan converts the Phase-2 audit's 33 findings into 21 actionable
work items totalling ≈ 65 hours of engineering work + Supabase
provisioning lead time + 14-day burn-in.

* **6 CRITICAL items** (W-01, W-02, W-03, W-04, W-06, W-09) close the
  data-integrity / boundary / functional-readiness blockers. These
  raise Phase 2 from B (83) to A− (90+).
* **5 HIGH items** (W-05, W-07, W-08, W-10, W-11, W-13) close the
  remaining gaps that distort the architecture or invalidate measured
  gates.
* **5 MEDIUM items** (W-12, W-15, W-16, W-19, W-20) close ADR / docs
  drift.
* **5 PROCESS items** (W-14, W-17, W-18, W-21) tidy the audit framework
  + carry-overs.

If completed end-to-end, Phase 2 closes at code-grounded **A− / 90+**
with the 14-day burn-in clock running on Supabase. The M24 beta gate
becomes truly green (not "PARTIAL-RATIFIED green") at burn-in day 14.

— end —
