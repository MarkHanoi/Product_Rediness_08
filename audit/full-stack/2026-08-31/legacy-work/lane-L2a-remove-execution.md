# Lane L2a — REMOVE dispositions, small-blast-radius execution
HEAD at execution: 4318c2f0e8a171f19882590a7417b81b3c99fcda (2026-08-31)
Source: audit/full-stack/2026-08-31/legacy.json -> part2_repo_wide_legacy_inventory.legacy_artifact_inventory_dispositions.REMOVE (11 rows)

## Verdict summary (11 rows)
| # | Row | Verdict |
|---|-----|---------|
| 1 | packages/speculative-engine | REFUSED — entire package + disposition is DATED "delete 2026-11-12" (future) |
| 2 | packages/persistence-client/src/loader/GeometryCacheStore.ts | DELETED — deadness re-proven at HEAD |
| 3 | apps/editor/src/engine/persistence/GeometryCacheStore.ts | DELETED — byte-identical, deadness re-proven at HEAD |
| 4 | packages/stores/src/RoomStore.ts | REFUSED — deadness claim INVERTED at file level (P1 composition root imports it) |
| 5 | plugins/dxf | REFUSED — entire plugin dir, named DO-NOT-DELETE in brief → FOUNDER DECISION |
| 6 | plugins/export-pdf | REFUSED — entire plugin dir → FOUNDER DECISION |
| 7 | plugins/render | REFUSED — entire plugin dir → FOUNDER DECISION |
| 8 | plugins/family-editor | REFUSED — entire plugin dir → FOUNDER DECISION |
| 9 | channel dimension.created | REFUSED — premise inverted at HEAD (verb IS dispatchable) + would need NEW gate-debt rows |
| 10 | channel structural.created | REFUSED — premise inverted at HEAD (store IS constructed, handlers registered) |
| 11 | duplicate storeEventBus.emit initTools.ts (L-1056) | REFUSED — in-code deliberate deferral; unwatchable behaviour change |

## Row 2+3 — GeometryCacheStore.ts (DELETED)
Deadness proof at HEAD 4318c2f0:
- `cmp packages/persistence-client/src/loader/GeometryCacheStore.ts apps/editor/src/engine/persistence/GeometryCacheStore.ts` -> BYTE-IDENTICAL, 330 lines each (matches audit row).
- `git grep -n "GeometryCacheStore" -- packages apps plugins src server tools scripts tests index.html server.js` minus the two files themselves -> ONLY 3 comment-mentions (design-pattern citations):
  - apps/editor/src/engine/UnderlayRasterStore.ts:21 (comment)
  - apps/editor/src/ui/platform/ThumbnailCacheStore.ts:27 (comment)
  - apps/editor/src/ui/platform/VersionCacheStore.ts:23 (comment)
- Zero imports, zero `new GeometryCacheStore`, zero barrel exports (`packages/persistence-client/src/loader/index.ts` and `src/index.ts` do not mention it), zero test files (`git grep -ln GeometryCacheStore -- "**/__tests__/**" "**/*.test.ts" "**/*.spec.ts"` -> empty). No CA-21 dead-test pinning exists for this artifact.
- No contracts/** citation (`git grep -c GeometryCacheStore -- docs/02-decisions` -> 0), so check-contract-cited-paths is untouched. No tools/ ledger cites the path.
- ⚠ OVERLAP NOTE for orchestrator: ISSUE-LOG L-810 (OPEN, P2) reserved deletion of the WHOLE loader/ dead fork (3,439 lines incl. ProjectLoader/ProjectSerializer/SnapshotStreaming/MigrationEngine) for a founder call. This lane deletes ONLY the two GeometryCacheStore.ts files the 2026-08-31 audit explicitly dispositioned REMOVE; the rest of the L-810 fork is NOT touched. The 3 comment-mentions were left unedited (comments cite ThumbnailCacheStore.ts as surviving referent of the same pattern).
- PIN (deadness + return-detection): `git grep -l GeometryCacheStore -- packages/persistence-client apps/editor/src/engine/persistence` MUST return nothing. Any return of either file makes it return the path.

(tsc + falsification transcripts appended below as executed)

## Executed transcripts (rows 2+3)

### Root tsc after deletion (FOREGROUND, exit code captured directly)
```
$ NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json; echo "TSC_EXIT_CODE=$?"
TSC_EXIT_CODE=0
```

### Falsification = RESTORATION control
```
$ git grep -l GeometryCacheStore -- packages/persistence-client apps/editor/src/engine/persistence
PIN_RC=1                                                    # pin silent with files deleted
$ git checkout -- packages/persistence-client/src/loader/GeometryCacheStore.ts
$ git grep -l GeometryCacheStore -- packages/persistence-client apps/editor/src/engine/persistence
packages/persistence-client/src/loader/GeometryCacheStore.ts
PIN_RC=0                                                    # pin DETECTS the return, names the path
$ rm packages/persistence-client/src/loader/GeometryCacheStore.ts
PIN_RC_FINAL=1                                              # deleted again; pin silent
$ git status --porcelain | grep GeometryCacheStore
 D apps/editor/src/engine/persistence/GeometryCacheStore.ts
 D packages/persistence-client/src/loader/GeometryCacheStore.ts
```
Left UNSTAGED — orchestrator owns commits.

## Refusal evidence (rows re-proven at HEAD 4318c2f0)

### Row 1 — packages/speculative-engine — REFUSED (dated decision + lockfile blast radius)
- `SpeculativeEngine.ts:5`: "Scheduled deletion of this package: **2026-11-12**".
- `src/index.ts:14`: "kept only until its scheduled deletion (2026-11-12) to avoid a pnpm-lock desync."
- Today is 2026-08-31: the disposition's own date is 2.5 months out. Deleting now also forces a
  pnpm-lock/workspace change ([[agent-packagejson-breaks-frozen-lockfile]] hazard). Only outside
  reference: comment at packages/command-bus/src/consequence.ts:376.
- FOUNDER/DATED DECISION — execute on or after 2026-11-12, as its own lockfile-aware change.

### Row 4 — packages/stores/src/RoomStore.ts — REFUSED (deadness claim INVERTED at file level)
The audit row says "zero readers". True ONLY of the runtime slot `runtime.stores.roomStore`'s READERS.
The FILE has live importers at HEAD:
- packages/runtime-composer/src/composeRuntime.ts:58 (import), :1135 (`const roomStore = new RoomStore()`), ~:1973 (dispose), ~:2070 (re-create) — the P1 SINGLE COMPOSITION ROOT constructs it.
- packages/runtime-composer/src/types.ts:31 (import), :4591 (`readonly roomStore: RoomStore`).
- 5 handler files packages/stores/src/aggregate-commands/{apartmentDelete,roomAssignToApartment,roomCreate,roomDelete,roomUpdate}.ts (`import type { AggregateRoomStore } from '../RoomStore.js'`).
- Barrel packages/stores/src/index.ts:74 (`export { AggregateRoomStore, RoomStore }`).
- 3 test files packages/stores/__tests__/{RoomStore,apartment-commands,room-commands}.test.ts.
- Certification gate tools/rac-conformance/certification/gates/check-census-verified-invariants.ts carries a NAMED EXCLUSION keyed to this exact path (lines 172-175, 342, 364) whose revocation logic depends on the file existing with class AggregateRoomStore.
- The file's own header: whether the C20 aggregate Room concept lives or collapses "needs an ADR, not a silent pick (C73 §3.7)".
Deletion would drag composeRuntime + runtime-composer types + 5 handlers + barrel + 3 suites + a certification gate — NOT small blast radius, and the decision is contractually reserved for an ADR.

### Rows 5-8 — plugins/dxf, plugins/export-pdf, plugins/render, plugins/family-editor — REFUSED (scope guard)
Entire plugin directories = authored user-facing capability surfaces, all four literally named in the
lane brief as DO-NOT-DELETE examples. FOUNDER DECISION rows. (Their ARM-A/line-count evidence from the
audit was not re-litigated here; no deletion attempted.)

### Rows 9+10 — channels dimension.created / structural.created — REFUSED (premise inverted + gate-debt required)
Deadness of the CHANNEL is still true at HEAD: `git grep -nE "\.on\(\s*['\"](dimension\.created|structural\.created)['\"]"` -> RC=1
(zero subscribers; the only sites are the two emits CommandEventBridge.ts:1799/:1819 and type-map rows
runtime-composer/src/types.ts:1120/:1134). BUT:
1. The audit's causal premises are INVERTED at HEAD (the sheet.create pattern):
   - dimension: "verb undispatchable" — FALSE at HEAD: engineLauncher.ts:722 calls registerDimensionHandlers(_bus) (§P3.5-DI); PluginRegistry.ts:718 builds the handler set. The verb IS dispatchable.
   - structural: "consumer class never constructed" — StructuralStore IS constructed (PluginRegistry.ts:702 `new StructuralStore()`), handlers registered (engineLauncher.ts:704, §P3.4-ST), and performUndoRedo.ts:540,681 reads these stores on the composed runtime.
2. Removing the case arms flips LIVE verbs from TYPED-EVENT-NO-SUB into NO-TYPED-EVENT — the exact
   "founder's defect" category check-mirror-reachability.ts is built to catch.
3. Gate mechanics make this NOT a mechanical delete:
   - tools/ga-gate/mirror-reachability-ledger.json orphanChannels rows (2) must be STRUCK "with the alternative route named" — no alternative mirror route exists to name for either family.
   - tools/ga-gate/fidelity-axis-ledger.json has ~9 dead-channel `drops` rows per family; ARM A5 forces exit 3 on stale rows, so they must be struck — AND the families would then classify as `unbound`/`unchannelled`, each requiring a NEW ledger row. Adding a gate-debt entry is forbidden for this lane.
Correct direction at HEAD looks like WIRE (give the channels a subscriber), consistent with the WIRE
rows for annotation.created / grid.created. FOUNDER/LANE DECISION, not a REMOVE.

### Row 11 — duplicate storeEventBus.emit, initTools.ts (§L-1056, now at ~:2144) — REFUSED (deliberate deferral, unwatchable)
The site's own comment (added with L-1056): "The duplicate is left in place DELIBERATELY and not
quietly removed... removing it changes the ORDER in which subscribers observe the wall relative to the
panel-storm events CurtainPanelSyncHandler fires synchronously INSIDE add(), and this bridge is not
reachable from any suite... A behaviour change that cannot be watched is not one to make in passing."
The audit disposition itself concedes "deliberately deferred". The lane's falsification protocol
(restore -> prove detection) is IMPOSSIBLE for an admittedly unwatchable ordering change: no pin can
detect regression in either direction. Prerequisite: a suite that reaches this bridge (L-972 lesson),
then remove under observation. REFUSED as a mechanical delete.

## Hard-rule compliance
No ceiling raised, no gate disabled, no gate-debt entry added, no rival built. All greps scoped
(git grep over tracked pathspecs, each <10s). tsc run in FOREGROUND, exit code captured directly
(TSC_EXIT_CODE=0). Nothing committed.
