# AXIS L FIX — LANE 1 findings (2026-08-31)

Scope: `apps/editor/src/engine/initTools.ts` — ten bus→legacy-store bridges whose dedup
guard early-returned BEFORE VDT + bimManager registration. Fix tag in code: `§AXIS-L-W1`.

## Idempotency precondition — PROVEN for both shared sinks (source read)

- **VDT** — `packages/core-app-model/src/views/ViewDependencyTracker.ts:453-455`:
  `registerElement(elementId, levelId) { this._elementLevelMap.set(elementId, levelId); }`
  → `Map.set` = REPLACE. Re-registering an existing id is a no-op (same level) or a
  re-home (changed level). Never appends. Cannot throw.
- **bimManager** — the instance is `new BimManager(...)` (`apps/editor/src/engine/initScene.ts:878`),
  class in `packages/core-app-model/src/BimKernel.ts:243-268`. `registerElement`:
  exclusive-containment filter over other levels, then
  `if (!level.childrenIds.includes(elementId)) level.childrenIds.push(elementId);`
  → includes-guarded push = NO-OP on an existing id in the same level. Never appends a
  duplicate row. It DOES throw `SpatialResolutionError` on: Component editor mode, empty
  levelId, unknown levelId — all previously swallowed by empty catches, now surfaced by
  name (see below). A doubled BIM-tree row is therefore impossible from re-registration.

No family was refused on the idempotency precondition — both sinks are shared by all ten.

## Per-family changes (all in initTools.ts, line numbers post-edit)

| family | shape before | change |
|---|---|---|
| curtain-wall (§P3.1-CW, guard now :2108) | REGISTER-BEFORE-ADD but guard above registration | guard moved BELOW registration; bim catch → named console.error |
| lighting (§FT-LIGHTING, guard now :2930) | REGISTER-BEFORE-ADD but guard above registration | registration block (incl. §DIAG-WALL-LEVEL empty-level refusal) hoisted above guard; bim catch → named console.error. Guard still gates store-add + `LightingFragmentBuilder.add` (mesh) — a dup event MUST NOT double-build the mesh |
| ceiling (§P3.2-CL, guard now :2220) | ADD-BEFORE-REGISTER, guard first | registration hoisted above add() AND above guard (§G3-STALE-FIX); bim catch named |
| roof (§P3.2-RF, guard now :2309) | ADD-BEFORE-REGISTER, guard first | registration after record null-check (a refused event registers nothing — beam/roof mirrors have null returns beyond the pre-guard), before guard-gated add |
| column (§P3.3-CO, guard now :2365) | ADD-BEFORE-REGISTER, guard first | registration hoisted above guard + add |
| slab (§FT1, guard now :2444) | ADD-BEFORE-REGISTER, guard first | same |
| beam (§FT2, guard now :2534) | ADD-BEFORE-REGISTER, guard first | registration after `beamRecordFromCreatedEvent` null-check (extra null arms at beamCreatedMirror.ts:145,163), before guard-gated add |
| floor (§P3.2-FL, guard now :2583, keys ev.floorId) | ADD-BEFORE-REGISTER, guard first | registration hoisted above guard + add |
| handrail (§FT-HANDRAIL, guard now :2716) | ADD-BEFORE-REGISTER, guard first | registration hoisted BELOW the N>2 path refusal (a refused rail registers nothing) and above guard + add |
| furniture (§FT-FURNITURE, guard now :3110) | ADD-BEFORE-REGISTER, guard first | registration hoisted above guard + add; `elementRegistry.registerSemanticOrReplace` left inside the guarded mirror (unchanged behaviour — brief scope is VDT + bimManager) |

## Empty-catch conversions (C74/CA-18)

All 10 bimManager register sites in these families now log
`console.error('[initTools] §TAG: bimManager.registerElement FAILED for <family>', id, '—', message)`.
No rethrow. Note: because registerElement is idempotent, "already registered" does NOT
throw — the error fires only on real failures (empty/unknown levelId, Component mode),
which were previously silent. Lighting refuses registration for empty levelId BEFORE the
call (pre-existing §DIAG-WALL-LEVEL behaviour, preserved), so it cannot spam on the
known empty-level path. The other seven families register with `ev.levelId ?? ''` — an
event arriving with NO levelId will now print a named error where it was silent. That is
the intended C74/CA-18 behaviour (refuse by name).

## Deliberately NOT done

- No family outside the ten touched (door/window/stair/room/water/lift/etc. — wire
  decisions for the founder). Wall untouched (already correct, and its bim catch is
  outside the briefed families).
- C11 §11 legend order (add-then-register) NOT followed — it is the documented order
  that caused §G3-STALE; wall/curtain-wall/lighting NOT re-ordered to match it.
- No new bridges, no ceiling raises, no gate edits.

## Proof

Test: `apps/editor/__tests__/DuplicateCreateStillRegisters.test.ts` — extracts the REAL
handler closures from initTools.ts via the TypeScript AST (no hand-copied logic),
transpiles and executes them against real CeilingStore / LightingStore + recording
VDT/bimManager stubs that reproduce the proven idempotent semantics. Drives the SAME
create event TWICE for ceiling (order-fixed shape) and lighting (guard-only shape).
Falsification control + run transcripts recorded below when executed.

## Executed proof — run transcripts (2026-08-31)

### Baseline run (fixed code)
`cd apps/editor && npx vitest run __tests__/DuplicateCreateStillRegisters.test.ts`
```
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  22.55s
```

### Falsification control — defect re-introduced
Inserted ONE line into initTools.ts (ceiling bridge), an early return ABOVE the
hoisted registration block, at what became :2190:
`if (ceilingStore.has(ceilingRecord.id)) return; // FALSIFICATION CONTROL - early return ABOVE registration`
Same command:
```
 ❯ __tests__/DuplicateCreateStillRegisters.test.ts (3 tests | 1 failed) 181ms
     × same event twice: ONE store record, registration on BOTH deliveries, registration BEFORE add, no doubled BIM row 65ms
 FAIL  ... > §AXIS-L-W1 ceiling — duplicate ceiling.created still registers (order-fixed shape) > ...
AssertionError: registration must sit ABOVE the dedup guard (§AXIS-L-W1): expected 3081 to be less than 1034
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```

### Restore — byte-for-byte
`cp <backup> initTools.ts && cmp initTools.ts <backup>` → `CMP: BYTE-IDENTICAL`
Same command:
```
 Test Files  1 passed (1)
      Tests  3 passed (3)
```
The harness reads initTools.ts at run time and extracts the real closure via the
TypeScript AST, so the control genuinely flips on the shipped text.

## Verification (foreground)

- New test RC=0 (3/3).
- initTools-adjacent suites (one vitest run, apps/editor):
  DuplicateCreateStillRegisters, CeilingBridgeCarriesAuthoredFinish,
  CurtainWallBridgeCarriesAuthoredValues, ElementLevelChangeReachesLegacyStore,
  BatchAndCompoundFidelityReachesTheStore, BeamBaseLineReachesStore,
  BeamPlanLoadBearingParity, L931GroundCatcherPoisonsFraming
  → `Test Files 8 passed (8) · Tests 55 passed (55)`.
- Root tsc: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`
  → `TSC_RC=0`.
- `npx tsx tools/ga-gate/run-all.ts` → exceeded the 10-minute foreground cap on
  first attempt (exit 143, killed by timeout); re-run captured to file — RC
  recorded below when it completes.

## Notes for the orchestrator

- `BatchAndCompoundFidelityReachesTheStore.test.ts:350` asserts a warn message
  containing the literal citation `initTools.ts:2377-2392` (the citation lives in
  the EMITTING file, not initTools). The test still passes — the message text is
  unchanged — but my edits shifted initTools line numbers, so that cited range no
  longer points at the slab-bridge lines it describes (now ~:2437-2452). Fixing
  the citation means touching the emitting file, which is outside this lane's
  file scope. Line-literal citations into initTools.ts rot on every edit.
- `packages/command-registry/tsconfig.tsbuildinfo` shows modified — build
  artifact touched by the tsc run (it was already dirty in the session-start
  snapshot); not part of this change.

## GA gate (run-all.ts) — completed run, verbatim verdict

`npx tsx tools/ga-gate/run-all.ts` → **GATE_RC=1** ·
`── 63 passing · 37 failing ──` · `🟡 1 declared debt · 🔵 9 newly measured ·
❌ 23 ratchet exceeded · ❌ 0 misconfigured · ❌ 4 regression · ❌ 0 ledger-malformed ·
⛔ 0 not executed` · final line `BLOCKED — a gate regressed, or the debt baseline is stale.`
Full log: scratchpad `ga-gate-run.txt` (session temp dir).

**Attribution — none of the 37 is caused by this lane's diff:**
- All SIX gates that read initTools.ts PASS with the edits in place:
  material-id-required, mirror-completeness, mirror-reachability, fidelity-axis,
  verb-register, render-aggregate-seam.
- The 4 REGRESSION gates (tool-activator-coverage, sync-disposition,
  dependent-adapts-on-host-move, shear-survives-transport) do not read
  initTools.ts (grep over tools/ga-gate: the only initTools-readers are the six
  above + run-all), and this lane's only other files are a `__tests__/` file
  (excluded by scan filters, e.g. check-layer-boundaries.ts:455) and an audit/ doc.
- Spot-checked breach lists: xss-sink-scan = innerHTML sites in UI files;
  layer-boundaries = OBC/express third-party imports + command-registry→plugin
  edges; declared-project-scopes = 7 module-level-state files, none of them mine;
  per-package-compile = committed command-registry TS errors (commit 3831c165,
  another lane). My test's `new Function` harness is in an excluded test file and
  appears in no gate output.
- `DuplicateCreateStillRegisters` appears nowhere in the gate log.

The repo-wide RED state pre-exists this lane and is the orchestrator's to
arbitrate; nothing here raised a ceiling, added debt, or built a rival.
