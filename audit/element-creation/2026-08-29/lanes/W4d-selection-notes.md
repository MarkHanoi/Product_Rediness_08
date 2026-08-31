# WAVE 4d — selection — running notes (write-as-you-go)

## Consumer analysis of ELEMENT_PLUGIN_IDS (done BEFORE judging)
1. apps/editor/__tests__/bootstrap.everything.test.ts:134-136 — the ONLY behavioural
   consumer: `for (const id of ELEMENT_PLUGIN_IDS) expect(rt.registeredStoreKeys[id]?.length).toBeGreaterThan(0)`.
   It asserts a NON-EMPTY storeKey. It makes NO "is an element" claim.
2. tools/ga-gate/check-plugin-census-equivalence.ts — header line 17-19:
   "A fourth, ELEMENT_PLUGIN_IDS, is the list the bootstrap suite's storeKey assertion
   iterates — so a descriptor missing from it is registered and unasserted."
   Arm F (ratchet, baseline ['floor','lighting','view']) = REGISTRY \ ELEMENT_PLUGIN_IDS —
   punishes OMISSION. Arm G (hard 0) = ELEMENT_PLUGIN_IDS \ REGISTRY.
   => REMOVING 'selection' would ADD it to arm F and BREACH a shrink-only ratchet (HARD STOP 1).
3. apps/editor/src/bootstrap.everything.ts / index.ts — re-export only.
VERDICT: NOT a misclassification that warrants removal. The list is misnamed, not miskeyed.
Disposition on the row: DOCUMENT the dual meaning; do NOT remove.

## Refuted premise
Brief said: "in ELEMENT_PLUGIN_IDS with no create verb and no element schema".
- "no create verb": REFUTED — five verbs registered (selection.select/.deselect/.clear,
  copy-selection, paste-clipboard). Selection correctly has NO create verb: it is not an element.
- "no element schema": TRUE and CORRECT — selection is per-user ephemeral UI state
  (ADR-0015; packages/sync-client/src/syncDisposition.ts:330/331/1207 => not-synced).

## The REAL defect (measured)
apps/editor/src/bootstrap.ts:94 storesProvider = () => storesAsRecordView(stores)
apps/editor/src/bootstrap.ts:148-158 storesAsRecordView => Object.fromEntries(store.getState())
=> ctx.stores.selection is a PLAIN Record<id,dto>, never the SelectionStore instance.
All four store-touching handlers call STORE METHODS on it:
  Select.ts:71 .select(...) · Deselect.ts:38 .deselect(...) · ClearSelection.ts:29 .clear()
  · CopySelectionHandler.ts:54/65 .getState()
=> "is not a function" at the composition root. storeKey/INTERFACE mismatch, not name mismatch.

## Capability search (what already ANSWERS "what is selected") — rival avoidance
- packages/input-host/src/SelectionManager.ts — the LIVE 3-D raycaster selection authority,
  emits 'bim-selection-changed'. NOT touched.
- packages/runtime-composer/src/composeRuntime.ts:328 buildSelectionStub -> runtime.selection
  (SelectionSlot, ids/add/remove/clear/set/subscribe), emits 'selection.changed'. LIVE. NOT touched.
- packages/core-app-model/src/SelectionBus.ts. LIVE. NOT touched.
- plugins/wall/src/committer/selection-highlight.ts binds via `bootstrap.render.data.ts` — that
  file was DELETED (apps/editor/__tests__/bootstrap-shape.test.ts:50 asserts it MUST NOT exist),
  so that consumer of SelectionStore is dead.
=> I am NOT creating a selection authority. SelectionStore ALREADY exists and is ALREADY
   registered at the composition root under stores.selection. The handlers cannot REACH it.
   AUTHORED but not REACHABLE => the fix is WIRE.

## Why NOT produceCommand (the shape every other plugin uses)
CommandBus.ts:576-578 `skipRingBuffer = suppressUndo || isEmptyPatchRecord`. `suppressUndo` is a
per-execute OPTION (CommandBus.ts:321), not a handler flag, and no selection call site passes it.
Converting the selection handlers to real forward/inverse patches would push every click onto the
ring buffer and make Ctrl+Z undo a SELECTION — precisely what ADR-0015 "Consequences" forbids.
=> rejected with reason; the store-instance wire keeps the empty patch pair.

## Second live defect found at the registration site
apps/editor/src/engine/engineLauncher.ts:767 calls
  registerSelectionHandlers(_bus, { pastePort: copyPastePort })
but `_bus` is the §OI-053 skip-if-present Proxy (engineLauncher.ts:630-641) and PluginRegistry
already registered all five types at composeRuntime => that call is a GUARANTEED no-op, so the
paste port NEVER lands. Probe b7Edge2 saw exactly that: "paste-clipboard: canExecute rejected —
Paste is not available (no paste port wired)".

## LADDER
AUTHORED ✔ · REACHABLE ✘ (first failing) · COMPOSABLE n/a · CERTIFIED n/a
=> AUTHORED-but-not-REACHABLE => the fix is WIRE. A new selection store/bridge would be the rival.

## WHAT SHIPPED
NEW  apps/editor/__tests__/selectionVerbsReachTheComposedSelectionStore.test.ts
     7 arms. Constructs NOTHING: composeRuntime({bootstrapFn: bootstrapWithEverything}).
     Read-back is `copy-selection` — a DIFFERENT verb on the SAME provider — so store
     IDENTITY is asserted, not assumed. ARM F is the negative control; ARM G pins the
     paste-port gap as a MEASUREMENT so it is not mistaken for working paste.
NEW  plugins/selection/src/handlers/selectionStoreAccess.ts
     resolveSelectionStore(injected, ctx.stores, verb) + SelectionStoreUnavailableError.
     Injected handle wins; ctx duck-typed fallback keeps the plugin suite passing unchanged.
MOD  plugins/selection/src/handlers/{Select,Deselect,ClearSelection,CopySelectionHandler}.ts
     optional ctor store; every ctx.stores.selection.<method> goes through the resolver.
MOD  plugins/selection/src/handlers/index.ts — SelectionHandlerOptions.store threaded.
MOD  apps/editor/src/PluginRegistry.ts — the selection descriptor hands buildHandlers the
     SAME instance buildStore returned (holder `selectionStoreForThisBootstrap`, ordering
     stated). Also corrects the descriptor comment that claimed the storeKey "satisfies
     that contract" — it satisfied the NAME, never the SHAPE.
MOD  plugins/selection/__tests__/handlers/CopyPaste.test.ts — import path repaired.

## NUMBERS
proof test        BEFORE 1 passed / 6 FAILED (RC=1, "ctx.stores.selection.select is not a
                  function")  ->  AFTER 7 passed / 0 failed (RC=0)
plugins/selection BEFORE 4 files / 9 tests (CopyPaste.test.ts NEVER COLLECTED)
                  AFTER  5 files / 14 tests, RC=0  — 5 previously-dark tests now run and pass
bootstrap.everything  8 passed (RC=0)
check-plugin-census-equivalence  RC=0, arms unchanged: F still 3 (floor, lighting, view);
                  selection NOT added to F. G/H hard-0 clean.
root tsc --noEmit -p tsconfig.json (NODE_OPTIONS=8192)  RC=0, 0 lines of output
check-verb-register  RC=1 BEFORE and AFTER. CONTROL RUN with my new file temporarily moved
                  out: RC=1, 3 failures (sheet.create SHADOWED; 13 NEW UNKNOWN verbs across
                  balcony/bathroomPod/boundaryLine/lift/room; 5 stale baseline rows) — none
                  mine. WITH my file: 4 failures, the extra one being ONLY the generated
                  doc census line `Handler files read 1407 -> 1408`. Not regenerated here:
                  `--write` rewrites the WHOLE shared docs/04-reference/API-VERB-REGISTER.md
                  and would bake other lanes' in-flight verbs into it.

## OPEN — REPORTED, NOT FIXED (fixing blind would mint a rival)
1. Nothing populates the canonical SelectionStore from the 3-D viewport. SelectionManager,
   runtime.selection and SelectionBus are three separate live authorities. The toolbar's
   Copy button therefore still cannot see the user's 3-D selection — it now REFUSES
   "Nothing selected to copy" instead of throwing a TypeError. Which surface is
   authoritative is an architecture decision, not a lane decision.
2. engineLauncher.ts:768 registerSelectionHandlers(_bus,{pastePort}) is a guaranteed no-op
   behind the §OI-053 skip-if-present proxy => paste-clipboard has no port in production.
   Pinned by ARM G.
3. runtime.stores.selection is undefined on the composed runtime (StoresSlot copies only
   boundaryLine) — pre-existing L-11064, untouched.
