# L wave 3 — ADVERSARIAL VERIFIER (2026-08-31)

Verifier for lanes L3a (door/window §P2.3-REG in initTools.ts) and L3b (stair / plumbing /
bathroomPod-member VDT wires). All verification FOREGROUND. Nothing committed. VERDICT: PASS.

## CHECK 1 — independent falsification, DIFFERENT wire than each lane's own control

Both falsifications were LINE REMOVALS (different in kind from L3a's guard-injection controls),
each followed by a byte-identical restore proven with `cmp`.

- **Stair** (≠ L3a's door control): deleted `CreateStairCommand.ts:352`
  (`viewDependencyTracker.registerElement(stairId, baseLevelId);`) →
  `StairVdtRegistration.test.ts` RED: `AssertionError: expected "registerElement" to be called
  with arguments: [ 'stair-vdt-1', 'L0' ]` — Tests 1 failed | 1 passed (2).
- **Door/window** (≠ L3b's stair/plumbing/pod controls): deleted `initTools.ts:1559-1560`
  (the §P2.3-REG VDT try/catch pair) → `DuplicateCreateStillRegisters.test.ts` RED:
  `AssertionError: opening handler must register the ELEMENT id in VDT: expected -1 to be
  greater than -1` — Tests 1 failed | 4 passed (5).
- Restore: `cp` from pre-mutation backups; `cmp` → BYTE-IDENTICAL on both files; reruns GREEN
  (command-registry 4/4, apps/editor 8/8).

## CHECK 2 — pattern conformance (read from the code, not the lane reports)

- §P2.3-REG registration is UNCONDITIONAL (no wrapping condition) and sits immediately after
  `elementId`/`type`/`_legacyWall` resolution, ABOVE the dedup guard
  `if (_legacyWall?.openings?.some(...)) return;` — the guard's comment now says it gates the
  mirror writes only. VDT failure → console.warn; bimManager throw → NAMED console.error;
  neither escapes the handler.
- Stair (`:32` import / `:352` register / `:713` unregister) and plumbing (`:7` / `:72` /
  `:134`) copy the `CreateCurtainWallCommand.ts:41`+`:201` seam exactly — same
  `import { viewDependencyTracker } from '@pryzm/core-app-model'` singleton; NO rival seam.
- `bathroomPodMemberMirror.ts` registers ONLY member ids (`:243`, `m.id` vs `pod.levelId`);
  the POD's own id is never registered — asserted negatively
  (`expect(reg).not.toHaveBeenCalledWith(POD_ID, expect.anything())`) and confirmed by reading
  the mirror (only `:230` unregister / `:243` register exist).

## CHECK 3 — undo leg

- `StairVdtRegistration` undo arm: `cmd.undo(ctx)` → `unregisterElement('stair-vdt-2')` PASS.
- `PlumbingVdtRegistration` undo arm: same shape for `plumbing-vdt-2` PASS.
- `bathroomPodMemberVdtRegistration`: reap loop unregisters every reaped member (removed diff),
  redo (added diff again) re-registers — full create→undo→redo cycle PASS (3/3).
- Code: stair unregister `:713` beside bimManager `:709`; plumbing `:134` beside `:131`;
  mirror unregisters AFTER `store.remove()` so the delete event still resolves targeted.

## CHECK 4 — no regression

- Root tsc: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` →
  **TSC_RC=0**, output = the npm package-manager-strict warning only.
- `DuplicateCreateStillRegisters` FULL suite 5/5 (committed §AXIS-L-W1 ceiling/lighting arms +
  the new door arms) — ran GREEN twice post-restore.
- Committed §AXIS-L-W1 family: `CW90VdtRegistration` PASS, inside a 5-suite command-registry
  sweep (`stairDeleteHealsHole`, `stairOpeningFollowsStair`, `stairRedoOneUndoUnit`,
  `wallAnchorFollowsHost`) → **33/33**.
- apps/editor sweep: `bathroomPodUndoDeleteAndMembers`, `StairCreateReachesGeometryStore`
  (the L2b pin), `bathroomPodReachableThroughComposedRuntime` → **23/23**.

## CHECK 5 — scope, both directions

- `git diff --name-only` = EXACTLY the 5 lane files + `packages/command-registry/tsconfig.tsbuildinfo`
  (incremental-build artifact, modified before the wave). Untracked = the 3 new lane tests, the
  2 lane findings docs, this doc, and `audit/full-stack/2026-08-31/_p5/annotations-inversion-scout.md`
  (7B2 scout — a DOC; **zero packages/plugins source from the scout**).
- Gate/ledger probe: `git diff/status` under `tools/`, `scripts/`, `.github/`, `*gate-debt*`,
  `*baseline*` → **0**. No ceiling raised, no gate touched, no gate-debt entry, no rival.
- Deleted lines across the 4 production files = 2 stale-comment corrections in initTools + the
  2 import lines rewritten to add `viewDependencyTracker`. Nothing behavioral removed.

## Still open (carried refusals + caveats)

1. L3a test's legacy wall store is a recording fake (faithful to `WallStore.addOpening`
   semantics); DoorStore/buildDoorStoreRecord/generateMark legs are real. Deliberate scoping.
2. Bus-path bathroomPod MEMBERS get VDT only — the mirror still bypasses
   `CreatePlumbingFixtureCommand`, so members remain absent from bimManager
   `level.childrenIds` (out of L3b scope by brief).
3. Door/window bimManager registration keys on `_legacyWall?.levelId ?? ''`; if the legacy wall
   record is absent mid-migration the bim leg lands in the named console.error and the id still
   does not enter `level.childrenIds` (non-fatal by design).
4. Families the L2b table marked NOT-SOUND remain unwired on purpose: liftPart per-part
   (contract change), grid/annotation (not the wall pattern), dimension (store nothing renders),
   structural (no consumer constructed).
5. Verification layer = stores + invalidation semantics + tests; no browser pixels (L2b's own
   caveat stands).
6. Nothing committed — orchestrator owns commit/cherry-pick per the shared-tree protocol.
