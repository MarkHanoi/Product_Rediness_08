# LANE L3b — stair / plumbing / bathroomPod-member VDT wires (2026-08-31)

Executes the three SOUND rows of the L2b table (`no-registration-families-measurement.md`
§"Where the wall-pattern wire would be sound"). Seam copied from the named precedent
`CreateCurtainWallCommand.ts:201` (§CW90 item 7): direct singleton import
`import { viewDependencyTracker } from '@pryzm/core-app-model'` — the same seam
`initTools.ts:176` already uses. No new seam, no bridge, no ceiling, no gate touched.
**NOT COMMITTED** — working-tree only, per the lane brief.

## The three wires

1. **STAIR** — `packages/command-registry/src/stair/CreateStairCommand.ts`
   - execute(): `viewDependencyTracker.registerElement(stairId, baseLevelId)` immediately
     AFTER the `ctx.bimManager.registerElement` try/catch (so a refused level cannot leak
     a VDT entry) and BEFORE `stairStore.add()` (whose `'stair'` emit the VDT must resolve
     — else §G3-STALE coarse fallback). Now at `:352` (was the ":340 beside" site; re-grepped).
   - undo(): `unregisterElement(this.createdStairId)` beside the bimManager unregister
     (the former `:700`).
2. **PLUMBING** — `packages/command-registry/src/plumbing/CreatePlumbingFixtureCommand.ts`
   - execute(): `registerElement(id, this.payload.levelId)` beside the bimManager register
     (former `:64`, now `:72`), before `plumbingStore.add()`.
   - undo(): `unregisterElement(this.createdId)` beside the bimManager unregister (former `:123`).
3. **BATHROOMPOD MEMBERS** — `apps/editor/src/engine/bathroomPodMemberMirror.ts`
   (`projectBathroomPodMembers` — the ONE function execute/undo/redo all reach via
   `subscribeDirty`, so registration survives undo by construction)
   - project loop: `registerElement(m.id, pod.levelId)` BEFORE `store.add(...)` (now `:243`).
   - reap loop: `unregisterElement(memberId)` AFTER `store.remove(...)` — so the store's
     `'plumbing'` delete emit still resolves targeted, THEN the map entry goes; outside the
     try, since a stale entry is exactly the phantom §A.2 prunes.
   - ⛔ The POD's own id is NOT registered (precondition (1) fails — nothing draws it);
     the test asserts this negatively.

## Proof (all foreground)

- `packages/command-registry/__tests__/StairVdtRegistration.test.ts` — 2/2 PASS
  (register with (stairId,'L0') BEFORE add; undo unregisters). Harness copied from
  `stairDeleteHealsHole.test.ts`, spy pattern from `CW90VdtRegistration.test.ts`.
- `packages/command-registry/__tests__/PlumbingVdtRegistration.test.ts` — 2/2 PASS
  (real `PlumbingStore`; register BEFORE add; undo unregisters).
- `apps/editor/__tests__/bathroomPodMemberVdtRegistration.test.ts` — 3/3 PASS
  (per-member register-before-add + NEVER the pod id; reap unregisters; create→undo→redo
  cycle re-registers — 2 registrations per member across the cycle).
- **Falsification control (per wire):** each `registerElement` line commented out →
  stair suite RED (1 test), plumbing suite RED (1 test), mirror suite RED (2 tests);
  lines restored → all 7 GREEN again. The zeros are measurements, not blind spies.
- **Regressions:** command-registry neighbors (`stairDeleteHealsHole`,
  `stairOpeningFollowsStair`, `stairDeleteLeavesGraphEdges`, `stairLevelSpanChange`,
  `wallAnchorFollowsHost`, `CW90VdtRegistration`) — 46/46 PASS. apps/editor
  (`bathroomPodUndoDeleteAndMembers` + the L2b control `DuplicateCreateStillRegisters`)
  — 16/16 PASS.
- **Root tsc:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`
  → **RC=0**.

## What this does NOT close (so a green run is not over-read)

- bimManager registration for pod MEMBERS is still absent (the mirror bypasses
  `CreatePlumbingFixtureCommand` by design; this lane wired VDT only, per the brief).
- The door/window §P2.3 initTools wire (the other SOUND row) is a different lane.
- No browser pixels were driven; proof is at the spy-on-the-real-singleton layer plus
  real-store reads, same bar as the L2b probes.
- L-11405 (pod parent lost on reload) and L-11486 (pod members on slab datum) unchanged.
