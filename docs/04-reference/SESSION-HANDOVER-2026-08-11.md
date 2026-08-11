# SESSION HANDOVER — 2026-08-11 audit remediation

**Written mid-session for an account switch. Resume from here.**
**Baseline:** `main` @ `e205864e` · **HEAD now:** `35caa5a5` · **36 commits, all pushed to `origin/main`.**

---

## 1. STATE RIGHT NOW — verified, not remembered

| Measure | Audit baseline | Now |
|---|---|---|
| GA gates passing | **15** | **35** |
| Failing | **17** | **4** (all declared debt) |
| **Regressions** | **3** | **0** |
| Debt ledger | 14 | **4** |
| Gates blind to their subject | **15** | **0** |
| Root `tsc --noEmit` (6 GB heap) | — | **CLEAN, exit 0** |
| Audit P0s open | 12 | **ZERO** |

**DEPLOYED AND PROVEN LIVE:** https://pryzm.fly.dev · chunk `main-C5WfTpEZ.js` ·
`fly-bundle-proof.sh` **PASSED** — `VITE_CESIUM_TOKEN` len 257, `VITE_GOOGLE_MAPS_KEY` len 39,
`VITE_GLB_URL` `/api/catalog/items/`, `VITE_CONTEXT_TILES_URL` `/api/context-tiles/`,
`/api/health/live` `{"ok":true}`.

The only thing keeping `run-all.ts` at BLOCKED is **`check-cast-count` exit 3** (218 vs a
shrink-only ceiling of 215) — the R7 mechanism added this session working as designed.
Before R7 that would have printed 🟡 KNOWN-DEBT and been absorbed silently.

---

## 2. ⚠ SIX AGENTS WERE MID-FLIGHT WHEN THE SESSION STOPPED

Their work is **UNCOMMITTED IN THE WORKING TREE**. Do not `git stash` (the stash stack is
GLOBAL across worktrees here and already holds three foreign entries). Inventory first.

```
 M apps/editor/src/engine/views/plantools/MovePlanToolHandler.ts
 M apps/editor/src/ui/SheetEditor/SheetEditorCommands.ts
 M plugins/ceiling/src/handlers/index.ts
 M tools/ga-gate/check-sync-disposition.ts          ← CLOSE-2, substantially DONE
 M tools/ga-gate/lib/sourceScan.ts
?? apps/editor/__tests__/CeilingUpdateReachesGeometryStore.test.ts   ← CLOSE-1 probe
?? .tmp-verbs-cap/    ← agent scratch, DELETE
?? .w2a-tmp/          ← agent scratch, DELETE
```

| Agent | Task | State when stopped |
|---|---|---|
| **CLOSE-1** | `ceiling.update` + `wall.updateCurtainWall` | probe written (`CeilingUpdateReachesGeometryStore.test.ts`), `plugins/ceiling/src/handlers/index.ts` edited |
| **CLOSE-2** | sync gate 19 % blindness | **effectively DONE** — see §3 |
| **CLOSE-3** | `packages/headless` cannot compose | early |
| **CLOSE-4** | `cast-count` 218 → 215 | measuring, no edits yet |
| **CLOSE-6** | write the CA-21 liveness gate | early; `check-verb-liveness.ts` NOT yet created |
| **CLOSE-7** | refuse the ~20 dead verbs in ONE commit | reading the `5e74b178` precedent |

**Resume instruction:** re-read each brief from §5 below, `git diff` the files above, judge what
is there, finish it. Do NOT restart from scratch — that is how the earlier round lost work.

---

## 3. CLOSE-2's RESULT (already in the tree, verify then commit)

`check-sync-disposition` discovered handlers by the **object-literal form only**. Most handlers
here are **classes** (`readonly type = 'wall.create';`), so it saw **60 of 320** registered types
(**19 %**) and printed *"✓ Every property-mutation command type declares its sync disposition"*
over **39 property verbs when there are 184**. Its `propertyVerbs.length < 20` floor could not
catch it — 60 clears 20.

It added **S6 — CROSS-GATE AGREEMENT**: the handler set is diffed against
`check-verb-register.ts`'s generated artefact, and *a verb the register lists which this gate
cannot see is a HARD FAILURE*. That makes the defect unrepeatable rather than merely fixed.

Found by a **third gate**, exactly as `check-chat-capability-coverage` was caught in its own
first draft at *"102 of the ~300 … confidently wrong."*

---

## 4. WHAT WAS DELIVERED (36 commits — the short version)

**Product:** roof geometry **300 mm requested → 300.00 mm, spread 0.000 mm** on square,
elongated, L and U plans (was 212 mm / spread 268.66) · batch reporting produces **six distinct
transcripts**, never "Done" for a partial · **17 dead verbs now REFUSE** with named reasons ·
`roof.update` reaches the geometry store (L-839) · P7 visibility writes and is read · read-only
questions cannot mutate · PDF honesty (0 doors vs 12 rejected are now different values) ·
sync legs A and B · benches **0 → 16 of 19 executing in CI** · C63 denominator is a type.

**Enforcement:** 15 blind gates → 0 · L-811 closed as a class · R3/R4/R5/R7 ratchets ·
**C69 API Verb Register** (generated + gated — a PR adding a bus command without a register row
FAILS) · **C16 §5.1 + CA-17…CA-21** make liveness binding · ADR-0316, ADR-0317.

**Governance:** CLAUDE.md said the contract suite was **C01–C15**; it is **C01–C68**.

---

## 5. THE OPEN ITEMS, WITH THEIR ROUTES ALREADY ESTABLISHED

Full plan: `docs/03-execution/plans/DEAD-WRITE-REMEDIATION-PLAN.md`.
Full audit scoring: `docs/04-reference/ENGINEERING-AUDIT-2026-08-11.md` **§17**.

1. **`ceiling.update`** — exact twin of the roof bug. Route **(c)**: remove the verb from the
   plugin's `HANDLER_TYPES` and handler set, delete the handler, let the `initBusHandlers`
   bridge register. Transplant `git show 2c8b4904`. Payload keys already match; **zero lying
   tests to convert**. ⚠ FIRST verify `UpdateCeilingCommand` registers an **inverse** on the
   legacy stack — if not, the route changes.
2. **`wall.updateCurtainWall`** — **every curtain-wall move in production is a silent no-op.**
   `elementMove.ts:104` dispatches it from BOTH move surfaces; plugin `produceCommand`, no
   bridge, orphaned `UpdateCurtainWallCommand` on the geometry store. Route is the **L-220
   distinct-verb bridge**, NOT (c) — there is no shadow to un-shadow.
3. **Sync gate 19 %** — see §3. Verify and commit.
4. **`packages/headless` v1.0.0-rc.1 CANNOT COMPOSE** — omits the required `bootstrapFn`. Its
   test **mocks `@pryzm/runtime-composer` wholesale**, *which is how it shipped*. Un-mock it.
   `tools/rac-conformance/runtime-harness/__tests__/compose.probe.ts` proves it is fixable.
5. **`cast-count` 218 → 215.** 8 casts added this session, all in
   `apps/editor/__tests__/undoGestureOrdering.test.ts`. ⚠ **FORBIDDEN:** rewriting as
   `window as unknown as X` — a known blind spot; using it is gaming the ratchet. Use a typed
   global declaration (`src/global-window.d.ts`). That file's **3 `it.fails` tests are RED BY
   DESIGN** — confirm `2 passed | 3 expected fail` afterwards.
6. **CA-21 gate does not exist.** `grep -rl CA-21 tools/ga-gate/` → nothing. The liveness rule
   minted today is **canonical and unenforced**. Generalise
   `tools/rac-conformance/runtime-harness/__tests__/v3v4v5.probe.ts`.
7. **~20 dead verbs, ONE commit.** Follow `5e74b178` (refuse, don't retire — `CapabilityRefusal`
   NAMES them, so retiring breaks chat's own refusal). ⚠ **19 lying test cases across 8 files**;
   `transformDragUndoCapture.matrix.test.ts` pins **14** cases, so refusing only five leaves it
   half-converted. **CONVERT, NEVER DELETE.**

### TWO FOUNDER DECISIONS — not agent work

- **Collaboration leg C.** `apps/sync-server` **does ship** (Dockerfile, `ws`, `yjs`, Postgres
  advisory locks, chaos suite). The gaps are **undeployed** and **wrong protocol** (zero
  `y-protocols` server-side vs a stock `y-websocket` client). Scoped in
  `L-391-CRDT-COLLAB-PLAN.md`. C66: **0 of 3 tiers HELD** — no tier may be described as
  supported.
- **`composeRuntime` composes ONLY the plugin-DTO half.** Twelve element kinds
  (`wallStore`, `slabStore`, `roofStore`, `roomStore`, `ceilingStore`, `floorStore`,
  `furnitureStore`, `plumbingStore`, `stairStore`, `columnStore`, `curtainWallStore`,
  `gridStore`, `beamStore`, `handrailStore`) have **NO authoritative store in the composed
  runtime**; doors/windows are reachable only by accident of module scope. **This is very
  likely the single cause behind the dead verbs, the 15 shadowed routes and the lying move
  verbs — one ADR, not seventeen accidents.**

---

## 6. THE TWO THINGS THAT REFRAME EVERYTHING

**The meta-finding.** The audit's premise was that implementation had drifted from
documentation. What the remediation found is that **the measuring instruments were broken.**
Fifteen gates reported numbers they had never taken; eight guarded invariants that had been
clean for months. `check-motion-gate-coverage` printed a **false structural claim** about a
directory holding 83 files — **while exiting 0**, so it was never even on the debt ledger.

**The audit was wrong six times**, and every correction came from measuring rather than reading:
P0-10 (the gate was falsely accusing honest source) · P0-1 (three "regressions" were one deleted
file plus one lying gate; exactly one was real) · the *"49 % of cadastral vertices"* figure was
**not reproducible and effectively fabricated** (real loss is 1–3 vertices absolute, and the
share *falls* with density) · P1-7 undo is correct at 400 ms, the cliff is at gap = 125 ms ·
P6 is **11**, not 14 · *"no move or rotate verb for any element kind"* is **FALSE** — and the
real defect is worse: five move verbs write a detached store, **but nothing dispatches them**,
while `wall.updateCurtainWall`, which IS dispatched, silently no-ops.

---

## 7. WORKING DOCTRINE — carry this forward

1. **Ship the probe before the fix.** Watch it fail against pre-fix code (`git show HEAD:<path>`,
   never `git stash`), paste both runs.
2. **Failure and emptiness are never the same value.**
3. **The layer that knows must be the layer that reports.**
4. **Verify the right invariant on the right object** — not `success === true`, not a count, not
   the plugin DTO store.
5. **A baseline is not permission; it is a debt with a name.** Never raise a ratchet to reach
   green. If a raise is genuinely correct it needs a dated justification in the gate file, same
   commit.
6. **NEVER `git stash`** — the stack is global across worktrees.
7. Do NOT run a bare root `npx tsc` in an agent (OOM) — `NODE_OPTIONS=--max-old-space-size=6144`.
8. **Deploy only per `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md`**, and never hand-type the
   docker command: Docker accepts a **misspelled** `--build-arg` silently and ships a
   permanently degraded bundle that `fly secrets` cannot repair. Use
   `tools/deploy/fly-manual-deploy.sh`, then `tools/deploy/fly-bundle-proof.sh`.
