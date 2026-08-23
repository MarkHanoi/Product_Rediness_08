# AUDIT-B — COMMANDS · STORE · DTO · UNDO

**Lane:** AUDIT-B of five · **Date measured:** 2026-08-23 · **For:** C107 (production-readiness contract)
**Subject:** the mutation path, end to end, in Pascal Editor vs PRYZM.

**Trees compared**

| | Pascal | PRYZM |
|---|---|---|
| Path | `…/scratchpad/pascal` (MIT, `pascalorg/editor`) | `C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08` |
| `.ts`/`.tsx` files | **1 929** | **8 010** |
| Test files | **459** | **2 684** |
| Package manager / build | bun 1.3.14 + Turborepo | pnpm 10.26.1 + Vite |

> Commands, verbatim:
> `find . -path ./node_modules -prune -o -name '*.ts' -print -o -name '*.tsx' -print | wc -l` (Pascal → 1929)
> `find . \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' -not -path './dist/*' | wc -l` (PRYZM → 8010)
> `find . -name '*.test.ts' -o -name '*.test.tsx' | grep -v node_modules | wc -l` (Pascal → 459)
> `find . \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' \) -not -path '*/node_modules/*' -not -path './dist/*' | wc -l` (PRYZM → 2684)

---

## 1. Scope and method

### 1.1 What I read

**Pascal — the whole mutation path, read in full:**

- `packages/core/src/store/use-scene.ts` (2 114 lines) — the single scene store.
- `packages/core/src/store/actions/node-actions.ts` (1 769 lines) — the four mutation actions.
- `packages/core/src/store/history-control.ts` (278 lines) — undo pause/transaction primitives.
- `packages/core/src/store/use-live-node-overrides.ts`, `use-live-transforms.ts` — the ephemeral preview layer.
- `packages/core/src/registry/scene-api.ts` (196 lines), `registry/types.ts` (2 432 lines, `NodeDefinition` + `Capabilities`), `registry/registry.ts` (437 lines).
- `packages/nodes/src/shared/slot-paint.ts` — the material-assignment path (the DTO question's Pascal answer).
- `packages/nodes/src/spawn/**` — the minimal complete node kind (927 lines total).
- `packages/editor/src/lib/history.ts` — the single undo entry point.
- `packages/editor/src/components/ui/panels/parametric-inspector.tsx` — the generic property-edit commit path.
- `packages/mcp/src/bridge/scene-bridge.ts`, `packages/mcp/src/tools/create-wall.ts`, `tools/live-sync.ts`, `storage/sqlite-scene-store.ts` — the agent write path and persistence.
- `apps/editor/lib/scene-api-security.ts`, `apps/editor/app/api/scenes/[id]/events/route.ts` — the server write gate and the change feed.
- `packages/core/src/architecture.test.ts` — Pascal's only architectural gate.

**PRYZM — the corresponding path:**

- `packages/command-bus/src/CommandBus.ts` (644 lines), `bootstrap.ts` storesProvider.
- `apps/editor/src/engine/undo/performUndoRedo.ts` (940 lines) — the two-stack arbiter.
- `packages/command-registry/src/generic/UpdateElementParameterCommand.ts` (1 112 lines) — the generic parameter path.
- `packages/runtime-composer/src/CommandEventBridge.ts` — the create-mirror switch.
- `plugins/slab/src/handlers/SetSlabMaterial.ts` — the `§FIX-MATERIAL-DEAD-DISPATCH` exhibit.
- `apps/editor/src/engine/initBusHandlers.ts`, `initTools.ts` — bridge registration and the create mirror.
- `docs/02-decisions/contracts/C16-*.md` §5.1 (`CA-17`…`CA-21`), `C68-*.md` §5.a, `docs/04-reference/API-VERB-REGISTER.md`.

### 1.2 What I ran (all read-only; no `--write`, no commit, no edit to either tree)

| Command | Result |
|---|---|
| `npx tsx tools/ga-gate/check-verb-register.ts` | **RC=1** (4 failures) — see §2.2 |
| `npx tsx tools/ga-gate/check-no-direct-store-writes.ts` | **RC=0** — `✓ within baseline (37/37)` |
| `grep -rn "commandBus\|dispatchCommand\|executeCommand" pascal/` | **0 hits** — §2.1 |
| `grep -rn "opentelemetry\|startSpan\|tracer" pascal/` | **0 hits** |
| `grep -rn "yjs\|Y.Doc\|automerge" pascal/` | **0 hits** |
| `grep -rnE "^\s+case 'pool\." CommandEventBridge.ts` | **RC=1, 0 hits** |
| `grep -rnE "^\s+case 'boundaryLine\." CommandEventBridge.ts` | **RC=1, 0 hits** |

### 1.3 What I could not reach — stated, not guessed

I did not run either application. Every liveness claim below is **static** (grep/read), except where the codebase's own gate executes the check (`check-verb-register.ts`, `check-no-direct-store-writes.ts`). Where a claim needs a browser, §8 says so and does not upgrade UNPROVEN to PASS.

⛔ **Absence claims in this document are measurements.** Each carries the exact command whose exit code was 1 or whose count was 0. I distinguish **ABSENT** (no such code) from **UNREACHABLE** (code exists, nothing calls it) throughout, because this session has produced twelve instances of the second being reported as the first.

---

## 2. Measured facts

### 2.1 The mutation path exists in only one of the two codebases as a *command* layer

| Fact | Command | Pascal | PRYZM |
|---|---|---|---|
| A command bus exists | `grep -rn "commandBus\|dispatchCommand\|executeCommand" --include=*.ts --include=*.tsx .` | **0 hits** (ABSENT) | `packages/command-bus/src/CommandBus.ts:317` `executeCommand` |
| Files named `*command*` | `find . -iname '*command*' \| grep -v node_modules` | **7** — 5 are CLI/UI *palette*, 2 are `nodes/src/block/commands.ts` (block presets). **No command pattern.** | 268 handler files under `plugins/*/src/handlers/*.ts` (`ls plugins/*/src/handlers/*.ts \| grep -v index \| wc -l` → **268**) |
| Registered mutation verbs | `npx tsx tools/ga-gate/check-verb-register.ts` | n/a — no verbs | **351** |
| Handler-side mutation entry points | see §3.1 | **4** — `createNodesAction`, `applyNodeChangesAction`, `updateNodesAction`, `deleteNodesAction` (`packages/core/src/store/actions/node-actions.ts:1725,1738,1755,1765`) | 351 verbs → 268 handler files + `CommandManagerImpl` legacy commands |

### 2.2 PRYZM verb register — live reading, 2026-08-23

`npx tsx tools/ga-gate/check-verb-register.ts` → **RC=1**

| Metric | Reading | vs the checked-in artefact (`docs/04-reference/API-VERB-REGISTER.md`, generated 2026-08-19) |
|---|---|---|
| Handler files read | **1 364** | 1 285 |
| Verbs discovered | **351** | 337 |
| LIVE | **134** | 127 |
| REFUSES | **37** | 37 |
| SHADOWED (dead route) | **1** (`sheet.create`) | 0 |
| UNKNOWN | **179** | 173 |
| **Authoritative store NONE / UNKNOWN** | **217 of 351 = 61.8 %** | 210 of 337 |
| Sync UNDECLARED | 2 | 0 |
| Chat UNDECLARED | 11 | 4 |

The four failures:

1. **14 registered bus commands have NO row** in the register: `balcony.create`, `balcony.delete`, `balcony.updateProfile`, `boundaryLine.attach/create/delete/detach/move/update`, `floor.setFinishBatch`, `lift.create`, `lift.delete`, `room.setColourMode`, `view.setCategoryVisibility`.
2. **1 NEW SHADOWED verb**: `sheet.create` — two registration sites; the skip at `initBusHandlers.ts` means one never registers.
3. **11 NEW UNKNOWN-liveness verbs** — lone plugin `produceCommand` handlers.
4. **5 baseline UNKNOWN verbs no longer qualify** — paid debt that did not leave the baseline.

⭐ **The headline number for this audit is 217/351 (61.8 %).** Nearly two thirds of PRYZM's registered mutation verbs cannot name the store they write. Pascal's equivalent number is structurally **0/0**, because there is exactly one store and every mutation goes to it (§3.1).

### 2.3 The `*.setMaterial` exhibit, re-measured

`grep "setMaterial\`" docs/04-reference/API-VERB-REGISTER.md` → **16 rows**, of which:

| Disposition | Count | Verbs |
|---|---|---|
| `REFUSES` / store `NONE` | **13** | `beam`, `ceiling`, `column`, `curtain-wall`, `floor`, `furniture`, `handrail`, `lighting`, `plumbing`, `roof`, `slab`, `stair`, `structural` |
| `LIVE` (legacy geometry store via `commandManager`) | **3** | `rhino.setMaterial`, `rhino.resetMaterial`, `room.setMaterial` |

> The brief said 14; the generated artefact says **13**. Both counts are of the same shape — the number moved, which is exactly why the register is generated. Cite the register, not this line.

⛔ **There is no `wall.setMaterial` row at all** (`grep "wall.setMaterial" docs/04-reference/API-VERB-REGISTER.md` → 0). That is ABSENT, not refusing — the flagship element family has no material verb on the bus.

### 2.4 Store-count asymmetry — the structural root

| Fact | Command | Pascal | PRYZM |
|---|---|---|---|
| Authoritative model stores | read | **1** — `useScene` (`packages/core/src/store/use-scene.ts:1286`) | **≥ 3 layers**: 35 plugin DTO stores + ~81 `window.*Store` legacy geometry globals + `packages/stores/*` (40 files) |
| Plugin DTO stores | `ls plugins/*/src/store.ts \| wc -l` | n/a | **35** |
| `window.*Store =` assignment sites | `grep -rn "window\.[a-zA-Z]*Store\s*=" --include=*.ts apps/editor/src \| wc -l` | n/a | **81** |
| Create-mirrors DTO → geometry store | `grep -on "'[a-z-]*\.created'" apps/editor/src/engine/initTools.ts` | n/a | **13 distinct families** (wall, lift, curtain-wall, ceiling, roof, column, slab, beam, floor, handrail, lighting, furniture, + dupes) |
| **Update-mirrors DTO → geometry store** | `grep -c "\.updated'" apps/editor/src/engine/initTools.ts` | n/a | **0** ⛔ |

⭐ **That single zero is the whole `§FIX-MATERIAL-DEAD-DISPATCH` family, mechanically.** 13 of 35 plugin stores get their *creates* mirrored; **none of the 35 get their updates mirrored**. Every `*.setX` verb whose handler writes only `ctx.stores.<family>` is therefore dead by construction, not by accident.

### 2.5 The live worked example — `pool.create` and `boundaryLine.create` (2026-08-23)

| Assertion | Command | Result |
|---|---|---|
| `CommandEventBridge` has a case for `pool.*` | `grep -nE "^\s+case 'pool\." packages/runtime-composer/src/CommandEventBridge.ts` | **RC=1 — 0 hits** |
| `CommandEventBridge` has a case for `boundaryLine.*` | `grep -nE "^\s+case 'boundaryLine\."` | **RC=1 — 0 hits** |
| Total `case` arms in that switch | `grep -cE "^\s+case '" packages/runtime-composer/src/CommandEventBridge.ts` | **31** — against **351** registered verbs |
| `boundaryLine` appears in either serializer | `grep -c "boundaryLine" apps/editor/src/engine/persistence/ProjectSerializer.ts packages/persistence-client/src/loader/ProjectSerializer.ts` | **0 : 0** |
| `pool` appears in either serializer | same | **0 : 0** |
| `boundaryLineSolid()` production callers | `grep -rn "boundaryLineSolid" --include=*.ts packages plugins apps \| grep -v test` | **its own `export` (`packages/geometry-boundary-line/src/BoundaryLineGeometry.ts:234`), one barrel re-export (`index.ts:56`), and TWO comments about its deadness**. Zero calls. |

So: `boundaryLine.create` **validates, executes, mutates its DTO store, returns a `PatchPair`, reports success — and (a) never reaches a mesh builder, (b) never reaches the serializer.** The record dies on reload. That is three independent breaks in one verb, and the verb is *registered*, so the gate counts it as a verb that exists.

### 2.6 Undo topology

| Fact | Pascal | PRYZM |
|---|---|---|
| Undo stacks | **1** — zundo `temporal` middleware on `useScene` (`use-scene.ts:1287,1583-1592`), `limit: 50` | **2** — `RingBufferUndoStack` (`packages/command-bus/src/CommandBus.ts:589`) + `commandManager.history` (`packages/command-registry/src/CommandManagerImpl.ts`) |
| Undo entry points | **1** — `runUndo()` / `runRedo()` (`packages/editor/src/lib/history.ts:73,82`); 2 callers (`hooks/use-keyboard.ts:30`, `command-palette/editor-commands.tsx:40`) | **1** — `performUndo()` / `performRedo()` (`apps/editor/src/engine/undo/performUndoRedo.ts`), *after* OI-054 unified four divergent triggers |
| Arbitration logic between stacks | **none needed** | `_cmEntryIsNewer()` (`performUndoRedo.ts:190-208`) + `_isSameGestureTwin()` + shadow-drop + `buildUndoStoreMap()` (`:390`) + `UNMAPPED_BUS_STORE_KEYS` (`:503`) |
| Store keys with a real undo adapter | 1 (the store itself) | 18 working adapters; **16 declared-uncovered keys** in `UNMAPPED_BUS_STORE_KEYS` (`:503-575`) — 3 deliberate (`door`, `window`, `level` → legacy stack), **13 with owner `'nothing'`** (11 stranded + 2 unreachable) |
| Undo result type | `{ kind: 'applied' \| 'empty' \| 'unavailable' }` (`history.ts:11-14`) — a three-valued honest answer | `ApplyRingBufferOutcome` incl. `{status:'stranded'}` — correct, but "every caller but the AI chat bridge threw the value away" (`performUndoRedo.ts:471-474`) |

### 2.7 Authoring cost — measured, both directions

| Task | Pascal | Command / evidence | PRYZM | Command / evidence |
|---|---|---|---|---|
| **Add one new editable property to an existing kind** | **2 files** — the Zod schema (`packages/core/src/schema/nodes/<kind>.ts`) + one `ParametricDescriptor` field row (`packages/nodes/src/<kind>/parametrics.ts`). Undo, persistence, MCP exposure, validation, dirty-marking, multi-select edit all follow. | `packages/nodes/src/spawn/parametrics.ts` (26 lines, whole file) writes both fields spawn has; commit is the generic `parametric-inspector.tsx:60-79` | **≥ 8 touchpoints** — L0 Zod schema, command class, handler (`canExecute`/`execute`/`affectedStores`), handler-set registration, store, `syncDisposition.ts` row, chat classification, verb-register regeneration, ≥1 OTel span. | C16 §5, §5.1; `packages/sync-client/src/syncDisposition.ts` (1 206 lines); `packages/ai-host/src/capabilities/ChatCommandClassification.ts` (466 lines) |
| **Add one new mutating verb end-to-end** | *concept does not exist* — there are only 4 verbs (create/update/delete/applyChanges), forever | `grep -rn "executeCommand" pascal/` → 0 | **25 files** for `lift.create` | `grep -rln "lift\.create" --include=*.ts --include=*.tsx packages plugins apps \| wc -l` → **25** (22 source + 3 test) |
| **Add one new element kind** | **1 folder, 6–15 files**; register by appending one line to `packages/nodes/src/index.ts` | `for d in packages/nodes/src/*/; do ls "$d" \| wc -l; done \| sort -n` → min **6**; spawn = 11 files / 927 lines | 1 `plugins/<x>` + 1 `packages/geometry-<x>` + serializer + `CommandEventBridge` case + `initTools` mirror + `initBuilders` + `buildUndoStoreMap` + PluginRegistry storeKey + verb rows | C11 §11.2 checklist; the `lift` / `pool` / `balcony` / `boundaryLine` post-mortems in `performUndoRedo.ts:503-575` enumerate what happens when any one is missed |
| Node kinds shipped | **53** | `grep -c "Definition," packages/nodes/src/index.ts` → 53 | 51 plugins / 18 `geometry-*` packages | `ls plugins \| wc -l` → 51; `ls -d packages/geometry-* \| wc -l` → 18 |

### 2.8 Governance/quality machinery

| Fact | Pascal | PRYZM |
|---|---|---|
| Architectural CI gates | **1** — `packages/core/src/architecture.test.ts` (core has no runtime `three` import) | **68** — `ls tools/ga-gate/check-*.ts \| wc -l` |
| Generated API register | **ABSENT** (`find . -iname '*verb*' -o -iname '*api-register*'` → 0 in Pascal) | `docs/04-reference/API-VERB-REGISTER.md`, generated + CI-diffed both directions |
| OpenTelemetry spans | **0** | ZONE A 246/246 instrumented (CLAUDE.md P8) |
| Sync disposition per verb | **ABSENT** | 1 206 lines, gate-enforced |
| Duplicate-registration policy | **THROWS in production** (`packages/core/src/registry/registry.ts:114-119`) | **first-registration-wins + silent `continue`** at `initBusHandlers.ts:469,517,2882,3033` |
| README ↔ code drift found | **YES** — README:87,159 claim `useScene` is "Persisted to IndexedDB" via a `persist` middleware. `grep -n "persist\|indexedDB\|idb" packages/core/src/store/use-scene.ts` → **0 hits**. The store is `create()(temporal(...))` only. | documented and self-corrected in `CLAUDE.md` (five recurrences of the contract-range rot, each boxed) |

---

## 3. Pascal's design

### 3.1 One store, four verbs, and the store IS the model

`packages/core/src/store/use-scene.ts:1286-1596`. The whole editable model is five fields:

```ts
// use-scene.ts:1286-1300
const useScene: UseSceneStore = create<SceneState>()(
  temporal(
    (set, get) => ({
      nodes: {},              // 1. Flat dictionary of all nodes
      rootNodeIds: [],        // 2. Root node IDs
      dirtyNodes: new Set<AnyNodeId>(),   // 3. Dirty set
      collections: {} as Record<CollectionId, Collection>,
      materials: {} as Record<SceneMaterialId, SceneMaterial>,
      installedPlugins: [],
```

Every mutation, from every surface — 3D tool, floor-plan tool, inspector, MCP agent, paint brush, terrain sculpt — passes through exactly **four** delegating actions:

```ts
// use-scene.ts:1448-1459
createNodes: (ops) => nodeActions.createNodesAction(set, get, ops),
createNode: (node, parentId) => nodeActions.createNodesAction(set, get, [{ node, parentId }]),
applyNodeChanges: (changes) => nodeActions.applyNodeChangesAction(set, get, changes),
updateNodes: (updates) => nodeActions.updateNodesAction(set, get, updates),
updateNode: (id, data) => nodeActions.updateNodesAction(set, get, [{ id, data }]),
deleteNodes: (ids) => nodeActions.deleteNodesAction(set, get, ids),
deleteNode: (id) => nodeActions.deleteNodesAction(set, get, [id]),
```

There is no policy layer above these. **Measured: 325 non-test `updateNode(` call sites, 116 `createNode(`, 98 `deleteNode(`** (`grep -rn "updateNode(" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v '\.test\.' | wc -l`). Any component may call any of them. Pascal has **no P6-equivalent invariant and no gate for one** — and it does not claim to.

**What replaces the policy layer is validation at the write:**

```ts
// node-actions.ts:542-557
function parseUpdatedNode(currentNode: AnyNode, data: Partial<AnyNode>): AnyNode {
  const candidate = mergeNodeUpdate(currentNode, data)
  const parsed = AnyNodeSchema.safeParse(candidate)
  if (parsed.success) return parsed.data

  const schema = getNodeSchemaForType(candidate.type)
  const sanitized = sanitizeNumericValue(schema, data, currentNode, [])
  if (sanitized.issues.length === 0) return candidate
  warnSanitizedNodeMutation('update', currentNode.id, sanitized.issues)
  return mergeNodeUpdate(currentNode, sanitized.value as Partial<AnyNode>)
}
```

Every write is Zod-re-parsed against the *whole* node, and out-of-range numbers are **clamped and warned**, not rejected. That is a deliberate trade: the model can never hold a schema-invalid node, and the user never sees a rejection — but a silently clamped value is a silent partial success (§7 gives PRYZM the win on this axis).

The only mutation gate is a boolean:

```ts
// node-actions.ts:1187, 1263, 1437, 1555 — identical in all four action impls
if (get().readOnly) return
```

`readOnly` is set from exactly one production site, `packages/editor/src/components/editor/index.tsx:1319` (`acquireSceneReadOnlyLease()` during version-preview mode). This is Pascal's **only** silent-no-op hazard, and it is one flag with one caller.

### 3.2 The DTO question — Pascal cannot have PRYZM's defect, structurally

⭐ **This is the finding of the audit.** In Pascal, setting a material is *a node field update*:

```ts
// packages/nodes/src/shared/slot-paint.ts:100-138 (abridged)
function commitSlotPaint(node, role, material, materialPreset): void {
  const state = useScene.getState()
  const resolution = resolveSlotPaintMaterialRef(state.materials, material, materialPreset)
  if (!resolution) return
  const { ref, newSceneMaterial } = resolution

  const nextSlots = { ...(currentNode.slots ?? {}) }
  if (ref) nextSlots[role] = ref; else delete nextSlots[role]

  if (newSceneMaterial) {
    // Creating the scene material and setting the slot ref are one logical
    // edit, so apply both in a single `set` — zundo records one history entry,
    // and one undo removes both the ref and its (now orphaned) material.
    useScene.setState((s) => { … })
    useScene.getState().markDirty(nodeId)
    return
  }
  state.updateNode(nodeId, { slots: nextSlots } as Partial<AnyNode>)   // ← line 138
}
```

The material ref lands in `node.slots[role]`, inside the node, inside `useScene.nodes`. That is:

- what the renderer reads (`slot-paint.ts:234-243` `getEffectiveMaterial` reads `node.slots[role]`);
- what undo reverts (`sceneHistorySnapshotFromState` partializes `nodes`, `use-scene.ts:1583`);
- what persists (`SceneGraph` = `{nodes, rootNodeIds, collections, materials, installedPlugins}`, `packages/core/src/utils/clone-scene-graph.ts:11-17` — byte-identical to `SceneSnapshot`, `history-control.ts:8-14`);
- what MCP reads and writes.

**There is exactly one representation of an element, so there is no wrong store to write to.** `grep -rn "setMaterial\|assignMaterial" pascal/` returns 19 hits, and every one is either a *Three.js material object* helper (`applyMaterialPresetToMaterials`, `packages/viewer/src/lib/materials.ts:503`) or the block panel's UI callback. **There is no material verb, no material store, and therefore no material dead-dispatch.**

### 3.3 Batch and transaction semantics — collapse the history array, don't build a transaction

Pascal's one-gesture-one-undo is `runAsSingleSceneHistoryStep` (`packages/core/src/store/history-control.ts:252-278`). It does not wrap the writes; it **splices the zundo past-state array afterwards**:

```ts
// history-control.ts:252-277
export function runAsSingleSceneHistoryStep(sceneStore, run) {
  const beforePastStates = sceneStore.temporal.getState().pastStates
  beginSceneCommitTransaction()
  try {
    const result = run()
    const afterPastStates = sceneStore.temporal.getState().pastStates
    const retainedCount = retainedPastStateCount(beforePastStates, afterPastStates)
    const addedCount = afterPastStates.length - retainedCount

    if (addedCount > 0 && pendingSceneCommitIsNoOp()) {
      // the whole gesture changed nothing → REMOVE the entry entirely
      sceneStore.temporal.setState({ pastStates: afterPastStates.slice(0, retainedCount) })
    } else if (addedCount > 1) {
      // N entries → keep only the FIRST (the pre-gesture state)
      const firstAddedState = afterPastStates[retainedCount]
      sceneStore.temporal.setState({
        pastStates: [...afterPastStates.slice(0, retainedCount), firstAddedState],
      })
    }
    return result
  } finally { endSceneCommitTransaction() }
}
```

Two properties worth naming:

1. **A no-op gesture leaves NO undo entry.** A drag that returns to origin does not consume a Ctrl+Z. PRYZM's C03 §4.6 U-3 refuses to *push* an empty pair; Pascal goes further and retracts an entry whose net effect is nil, measured by `areSceneSnapshotsEqual` over the *authoritative* snapshot (`history-control.ts:115`).
2. It composes with `beginSceneCommitTransaction` so subscribers (persistence, live-sync, space-detection) see **one** commit for the gesture (`history-control.ts:141-166` coalesces `pendingSceneCommit` by merging `before` of the first with `current` of the last).

**19 non-test call sites** (`grep -rn "runAsSingleSceneHistoryStep" … | grep -v test | wc -l`) — handle drags, wall drafting, terrain sculpt, floor-plan affordances, and the two floating action menus, which declare it per-action: `action.history === 'single' ? runAsSingleSceneHistoryStep(useScene, run) : run()` (`floating-action-menu.tsx:755`).

The complementary primitive is the **pause window** (`pauseSceneHistory` / `acquireSceneHistoryPause`, `history-control.ts:186-215`), used at **79 non-test sites** for live drag preview, refcounted so nested pauses do not strand `isTracking:false`.

### 3.4 The preview layer — a read-merge overlay, not a rival record

Pascal *does* have a second store for element state during a drag: `useLiveNodeOverrides` and `useLiveTransforms` (`packages/core/src/store/use-live-node-overrides.ts`, `use-live-transforms.ts`). This is the closest structural analogue to PRYZM's plugin DTO store — and the design difference is decisive:

```ts
// use-live-node-overrides.ts:66-72
export function getEffectiveNode<T extends { id: string }>(node: T): T {
  const override = useLiveNodeOverrides.getState().overrides.get(node.id)
  if (!override || Object.keys(override).length === 0) return node
  return { ...node, ...override } as T
}
```

The override is a **partial spread over the real node**, keyed by the same id, consumed only through `getEffectiveNode`. Consequences:

- A consumer that forgets to merge sees the **committed** value — stale preview, never a lost write. PRYZM's DTO store is a *complete rival copy*, so a consumer reading the wrong one sees a **different element**.
- Host patches **refuse** while an override is live: `sceneOperationPatchHasLiveConflict(beforeState, changes)` → `applySceneOperationPatch` returns `false` (`use-scene.ts:1381-1395, 1925`). An agent write cannot silently clobber a drag in progress.
- Every commit path clears them (`use-scene.ts:1948-1951`; `history.ts:65-67` on undo/redo).

### 3.5 Read-back discipline — the store's own return value is the read-back

The four store actions return `void` (`use-scene.ts:1166-1177`). **They cannot lie about success because they never claim it.** The verification is pushed into the *commit notification*, which is computed by comparing authoritative snapshots:

```ts
// history-control.ts:137-140
export function notifySceneCommit(commit: SceneCommit): void {
  if (areSceneSnapshotsEqual(commit.before, commit.current)) return
  …
```

and the host-patch entry point returns a real boolean derived from that comparison:

```ts
// use-scene.ts:1918-1990 (abridged)
export function applySceneOperationPatch(changes: SceneOperationPatch): boolean {
  const beforeState = useScene.getState()
  if (…all four change arrays empty…) return false
  if (sceneOperationPatchHasLiveConflict(beforeState, changes)) return false
  const next = sceneOperationPatchNextState(beforeState, changes)
  if (!next) return false                       // ← validation failed; nothing written
  const before = sceneHistorySnapshotFromState(beforeState)
  …useScene.setState(next)…
  const current = sceneHistorySnapshotFromState(useScene.getState())
  …
  if (areSceneSnapshotsEqual(before, current)) return false   // ← EXECUTED READ-BACK
  …
  notifySceneCommit({ origin: 'host', before, current })
  return true
}
```

⭐ **`sceneOperationPatchNextState` (`use-scene.ts:1753-1906`, 154 lines) is a full dry-run validator.** It re-parses every created/updated node against the registered schema (`parseSceneOperationPatchNode`, `:1704`), verifies structural positions, refuses parent/child asymmetry, refuses an update that changes `id`/`type`/`object`, and returns `null` on any violation — **before a single byte is written**. That is transaction semantics implemented as "compute the whole next state, or refuse".

**Where Pascal fails this test:** the MCP tool layer does *not* read back.

```ts
// packages/mcp/src/bridge/scene-bridge.ts:284-287
createNode(node: AnyNode, parentId?: AnyNodeId): AnyNodeId {
  useScene.getState().createNode(node, parentId)
  return node.id as AnyNodeId        // ← returns the id it generated, not one it read
}
```

and the tool reports it as the result (`packages/mcp/src/tools/create-wall.ts:66-70`). If `readOnly` were true, `createNodesActionImpl` returns at `node-actions.ts:1187` and the agent is told `{ wallId: "wall_abc" }` for a wall that does not exist. **This is the same defect class as PRYZM's dead dispatch** — narrower (one flag, one caller, one store), but present, and Pascal has no gate that would catch it. `updateNode`/`deleteNode` *do* pre-check existence and throw (`scene-bridge.ts:291-293, 307-309`); `createNode` alone does not post-check.

### 3.6 The registry — declare capabilities, not verbs

`packages/core/src/registry/types.ts:970-1500` defines `NodeDefinition`, **69** top-level fields (`sed -n '970,1500p' packages/core/src/registry/types.ts | grep -cE "^  [a-zA-Z]+\??:"`). A kind declares what it *is*; the framework supplies the behaviour. `Capabilities` (`types.ts:1524-1631`) has **26** slots — `movable`, `rotatable`, `scalable`, `hostable`, `cuttable`, `snappable`, `duplicable`, `deletable`, `groupable`, `selectable`, `floorPlaced`, `paint`, `slots`, `sceneAction`, …

The complete registration of a new kind is one appended line:

```ts
// packages/nodes/src/index.ts:69-72
nodes: [
    shelfDefinition as unknown as AnyNodeDefinition,
    blockDefinition as unknown as AnyNodeDefinition,
    …53 total
```

and a third-party plugin uses **the same `Plugin` type and the same `loadPlugin` call path** (`registry/types.ts:919-927`; README "External plugins follow the exact same shape … the API is stress-tested by built-ins before any third-party plugin lands"). `grep -c "Definition," packages/nodes/src/index.ts` → **53**.

Duplicate kinds are a **hard startup error in production**:

```ts
// packages/core/src/registry/registry.ts:113-120
if (this.defs.has(def.kind)) {
  if (isDevMode()) {
    console.warn(`[registry] re-registering node kind "${def.kind}" (HMR)`)
  } else {
    throw new Error(`[registry] duplicate node kind: "${def.kind}" already registered`)
```

### 3.7 The generic property-edit path — 20 lines serve all 53 kinds

```ts
// packages/editor/src/components/ui/panels/parametric-inspector.tsx:60-79
const handleUpdate = useCallback((patch: Partial<AnyNode>) => {
    if (!selectedId) return
    const scene = useScene.getState()
    const node = scene.nodes[selectedId]
    if (parametrics?.derive && node) {
      const next = { ...node, ...patch } as AnyNode
      patch = { ...patch, ...parametrics.derive(next, patch, node as AnyNode) }
    }
    // Bundle the edited node + any reconcile follow-ups into ONE
    // updateNodes call so a single inspector edit is a single undo step.
    const updates = [{ id: selectedId, data: patch }]
    if (parametrics?.reconcile && node) {
      const next = { ...node, ...patch } as AnyNode
      updates.push(...parametrics.reconcile(node as AnyNode, next))
    }
    scene.updateNodes(updates)
  }, [selectedId, parametrics])
```

A new field on a new plugin kind is editable, undoable, persisted and MCP-visible the moment its Zod field and its `ParametricDescriptor` row exist. **No verb, no handler, no registration, no mirror, no disposition.**

### 3.8 Persistence and "collaboration"

- Persistence: SQLite via `packages/mcp/src/storage/sqlite-scene-store.ts`, WAL mode, **optimistic concurrency at whole-graph granularity** — `if (currentVersion !== opts.expectedVersion) throw new SceneVersionConflictError(…)` (`:354-360`), version monotonic (`:372`).
- The browser sees agent writes through an **SSE poll** at `apps/editor/app/api/scenes/[id]/events/route.ts` (`POLL_MS = 250`, `HEARTBEAT_MS = 15_000`, `MAX_EVENTS_PER_POLL = 50`), each event carrying a full `graph`.
- **Measured ABSENT:** CRDT (`grep -rn "yjs\|Y.Doc\|automerge" pascal/` → 0), presence/awareness, per-element merge, operational transform.
- **Measured UNREACHABLE:** `installHistoryCommandDelegate` (`packages/editor/src/lib/history.ts:26`) — the seam that would swap in a collaborative history — has **zero in-tree production callers** (`grep -rn "installHistoryCommandDelegate(" … | grep -v test` → 1 hit, the definition itself). It is re-exported publicly at `packages/editor/src/index.tsx:427`, so it is a *published extension point*, not dead code — but in this repository nothing installs it, and `mode: 'collaborative'` appears only in `history.test.ts`.

---

## 4. PRYZM's design

### 4.1 Three model layers, and the bus writes the one nobody reads

```
 UI / tool / AI
      │  runtime.bus.executeCommand('slab.setMaterial', …)
      ▼
 CommandBus.executeCommand  (CommandBus.ts:317)
      │  ctx.stores = storesProvider(required)     ← bootstrap.ts:94
      ▼
 PLUGIN DTO STORE  (35 of them, plugins/*/src/store.ts)   ← the handler writes HERE
      ┊
      ┊  13 families mirror *.created only  (initTools.ts, 13 distinct verbs)
      ┊  0 families mirror any update       (grep -c "\.updated'" initTools.ts → 0)
      ▼
 LEGACY GEOMETRY STORE (~81 window.*Store globals)        ← builders / plan projector /
      │                                                      IFC export / ProjectSerializer READ HERE
      ▼
 fragments → mesh
```

The bus refuses to guess:

```ts
// packages/command-bus/src/CommandBus.ts:284-292
for (const key of required) {
  if (!Object.prototype.hasOwnProperty.call(provided, key)) {
    throw new CommandBusError(
      `${handler.type}: required store '${key}' is missing from HandlerContext.stores. ` +
        `The bus does NOT fall back to globals — declare the store in your storesProvider. ` +
        `(ADR-002 §3 / R1A-16)`,
    );
  }
}
```

That guard is correct and is why `pool.create` is *unreachable* rather than *silently wrong* (it throws before mutating — `performUndoRedo.ts:540-548`). But the guard checks that the key **exists**, not that the store behind it is the one anybody reads. That distinction is the whole defect family.

### 4.2 The exhibit, quoted

`plugins/slab/src/handlers/SetSlabMaterial.ts:28-56` — the clearest statement of the failure I found anywhere in either codebase:

```
 * §FIX-DEAD-VERB-REFUSE (W3-3, Class A "dead verb") — why `slab.setMaterial` now REFUSES.
 *
 * This handler produced a correct Immer patch against `ctx.stores`, reported SUCCESS,
 * and changed nothing any user could ever see. In production the bus's storesProvider
 * (apps/editor/src/bootstrap.ts:92-97) hands it a snapshot of the FRESH plugin DTO store
 * built by PluginRegistry — not the legacy geometry singleton that the fragment builders,
 * the 2-D plan projector, the IFC exporter and persistence all read. Only `*.created` is
 * mirrored across (initTools.ts); there is no update bridge in either direction.
 *
 * A command that reports success while authoritative state is unchanged is the worst
 * failure mode in a BIM system: the user is told the model changed, saves, reloads, and
 * the change is gone.
```

and the mechanism of the refusal:

```ts
// SetSlabMaterial.ts:64-82 (abridged)
canExecute(ctx, cmd): ValidationResult {
    …4 payload-shape checks…
    if (!ctx.stores.slab[cmd.slabId]) return { valid: false, reason: `slab not found: …` };
    // §FIX-DEAD-VERB-REFUSE (W3-3) — the payload is well-formed, and it still cannot
    // reach authoritative state. Say so; never report success.
    return { valid: false, reason: SLAB_MATERIAL_UNREACHABLE };
}
```

`execute()` is deliberately left intact and correct — "it is a correct plugin-store mutation for a host that binds the authoritative store under this key" (`:52-53`). This is the right call: the verb keeps its declaration honest at both ends, `check-chat-capability-coverage.ts` still resolves the name, and any third dispatcher gets a reason instead of a lie.

**13 verbs carry this shape** (§2.3). It is a *correct response to a structural defect*, not a fix for it.

### 4.3 The dead-verb shape reaching the user today

`packages/runtime-composer/src/CommandEventBridge.ts` is where a bus patch becomes a legacy-store event. It is a `switch` with **31 case arms against 351 verbs**, and its own `default:` branch documents the failure twice over:

```
// CommandEventBridge.ts:1366-1372
// ⛔ IT WAS THIS SWITCH. `lift.create` had no case, so it fell to
// `default: break;` — which is a SILENT DROP dressed as exhaustiveness.
// Measured 2026-08-23, and stated as a pattern because a bare substring
// matches this very comment and reports the opposite of the truth:
//     grep -nE "^\s+case 'lift\.(create|delete)'" CommandEventBridge.ts
//     -> RC=1, zero matches.   (`grep -in lift` over the whole file: 0.)
```

```
// CommandEventBridge.ts:1661-1667
// ⭐ THAT DESCRIBES `pool.create` TODAY, and the balcony case above already
// said so in prose … A comment is not a detector: the lift shipped afterwards with
// the identical defect and the identical silence. So the observation is
// MECHANISED here — the next compound to arrive without a case announces
// itself the first time a person uses it, instead of being discovered from a
// founder's screenshot of an element count that did not move.
```

**`boundaryLine.*` is the un-mechanised residue.** It is not a multi-store compound, so the new `default:` detector (which fires on `path.length === 2`) does not see it, and it is broken on **three** axes simultaneously:

| Axis | Measured | Consequence |
|---|---|---|
| Render mirror | no `case 'boundaryLine.*'` in `CommandEventBridge.ts` (RC=1) | never reaches a mesh builder |
| Geometry builder | `boundaryLineSolid()` (`packages/geometry-boundary-line/src/BoundaryLineGeometry.ts:234`) has **0 production callers** | even a mirrored event would find no builder |
| Persistence | `grep -c "boundaryLine" …/ProjectSerializer.ts` → **0** in both serializers | the record dies on save/reload |

And the verb-register gate reports it as one of the **14 registered verbs with no row** — so the register cannot describe it either.

### 4.4 Two undo stacks and the arbiter between them

`apps/editor/src/engine/undo/performUndoRedo.ts:1-89` names the origin: four divergent undo triggers, unified. But unification did not remove the second stack; it made the arbitration explicit.

```ts
// performUndoRedo.ts:190-208
function _cmEntryIsNewer(pair: PatchPair | null, cm: CommandManagerLike | undefined): boolean {
  const pairTime = pair?.timestamp;
  if (typeof pairTime !== 'number') {
    // §UNDO-ORDERING-KEY (L-7300) — this early return is not a tie-break, it is
    // an UNCONDITIONAL WIN for the ring buffer, and it used to be silent.
    if (cm?.canUndo?.()) _reportUnorderable('Undo', pair);
    return false;
  }
  if (!cm?.canUndo?.()) return false;
  const cmTime = cm.peekUndoTimestamp?.();
  if (typeof cmTime !== 'number' || cmTime <= pairTime) return false;
  if (_isSameGestureTwin(pair, cm.peekUndoTargetIds?.() ?? [], cm.peekUndoGestureId?.() ?? null)) return false;
  return true;
}
```

The file's own header records the cost, measured (`:62-77`): **six of the eight production ring-buffer push sites minted entries with no timestamp** (`initBusHandlers.ts:825,1596,1647,1703,1798`, `commitAnnotationSet.ts`), so `"missing ⇒ ring-buffer first"` was *"not a fallback … it is the routing rule."* The founder's three wall edits (rake, rake, profile — all `commandManager`-only) were jumped over by an older `slab` entry.

The arbitration needs **four** pieces of metadata a single stack would not need: `timestamp`, `gestureId`, `affectedStores`, `commandType` (`CommandBus.ts:589-620`), plus a **shadow-drop** for dual-dispatch twins, plus a **coverage map** (`buildUndoStoreMap()`, `:390-450`) with 18 working adapters and hand-written aliases (`curtainwall` / `curtain-wall` / `curtainWall` / `curtainWalls` all → `w.curtainWallStore`, `:401-402`).

**The declared gaps** (`UNMAPPED_BUS_STORE_KEYS`, `:503-575`) — **16 keys**, and only 3 are deliberate (`sed -n '/export const UNMAPPED_BUS_STORE_KEYS/,/^};/p' performUndoRedo.ts | grep -cE "^\s+'?[a-zA-Z-]+'?:\s*\{"` → 16):

| owner | keys | user-visible effect |
|---|---|---|
| `legacy-stack` (correct routing) | `door`, `window`, `level` | Ctrl+Z works via the fallback |
| `nothing` (stranded) | `structural`, `dimension`, `section`, `selection`, `sheet`, `schedule`, `view`, `active-view`, `balcony`, `lift`, `liftPart` | **Ctrl+Z is a total no-op** |
| `nothing` (unreachable) | `pool`, `water` | the verb throws before mutating; nothing strands |

And the `key overload` hazard C16 CA-19 names is live: at write time `'wall'` is the L1 DTO store; at undo time `buildUndoStoreMap()` resolves the same key to `window.wallStore`, the geometry store — so an inverse patch can be applied to a store that never received the forward (C03 §4.6 U-2b). The file explicitly refuses to "fix" `lift` this way (`:568-575`).

### 4.5 The generic parameter path — where PRYZM's design converges on Pascal's, and where it stops

`packages/command-registry/src/generic/UpdateElementParameterCommand.ts` is PRYZM's closest thing to Pascal's `updateNodes`, and its `ELEMENT_STORE_ROUTES` table (`:118-155`, 20 rows) is a genuinely good piece of design — the snapshot scope and the store selector are **two fields of one row**, so they cannot drift:

```ts
// UpdateElementParameterCommand.ts:118-125
const ELEMENT_STORE_ROUTES: Readonly<Record<string, ElementStoreRoute>> = Object.freeze({
    wall:   route(['wall'],   c => c.stores.wallStore),
    slab:   route(['slab'],   c => c.stores.slabStore),
    column: route(['column'], c => c.stores.columnStore),
    beam:   route(['beam'],   c => c.stores.beamStore),
    …
```

with the reason stated (`:77-88`): the previous `affectedStores = ["wall"] as const` hard-code meant *"for every NON-WALL element type the command wrote store X and CommandManagerImpl snapshotted store W"* — a transaction scoped to the wrong store, "a LIE IN BOTH DIRECTIONS."

**But the table covers 20 alias rows → 9 distinct store selectors.** Measured families NOT routable through this generic path: `ceiling`, `floor`, `lighting`, `plumbing`, `structural`, `grid`, `annotation`, `dimension`, `lift`, `balcony`, `pool`, `boundaryLine`, `section`, `sheet`, `schedule`. For those, `snapshotScopeForElementType` returns `[]` and `execute()` refuses with `No store for elementType` — which is honest, and is also a property panel that cannot edit those families.

Pascal's equivalent table has **one row**, because there is one store.

### 4.6 Registration order is not visible in the file you are editing

`CommandBus.register()` throws on duplicates (`CommandBus.ts:101`), so the editor's bridge tables guard themselves:

```ts
// apps/editor/src/engine/initBusHandlers.ts:469, 517, 2882, 3033 — FOUR sites
if (runtime.bus.registry?.has?.(spec.type as any)) continue;
```

⚠ **Locator rot found:** C16 CA-20 cites this skip at `initBusHandlers.ts:2202`. Measured 2026-08-23, the four skip sites are at **:469, :517, :2882, :3033**; line 2202 is a comment inside the curtain-wall panel-material block. The rule survives; the locator does not. (Same defect shape CLAUDE.md documents five times for the contract range.)

The consequence, stated in the contract: *"a plugin handler registered during `composeRuntime` silently shadows a bridge registered later"* — and the gate found **1 live instance today**, `sheet.create` (§2.2).

---

## 5. Head-to-head

| Sub-axis | Pascal (file:line) | PRYZM (file:line) | Winner | Why, in one sentence | Evidence |
|---|---|---|---|---|---|
| **B1. How a change reaches the model** | 4 store actions, no policy layer — `use-scene.ts:1448-1459` → `node-actions.ts:1725-1769` | Bus + 351 verbs + 268 handlers — `CommandBus.ts:317` | **DIFFERENT-BY-DESIGN** | Pascal buys zero-ceremony correctness by having nothing to get wrong; PRYZM buys audit, refusal, sync and AI dispatch by having a verb layer — and pays for it in liveness. | `grep -rn "executeCommand" pascal/` → 0; verb gate → 351 verbs |
| **B2. What is ENFORCED vs STATED about the mutation path** | Nothing is stated, so nothing rots; the one gate is `architecture.test.ts` (core has no runtime `three`) | P6 stated as an invariant, enforced at a **baseline of 37**, not 0; `check-no-direct-store-writes.ts` → RC=0 `within baseline (37/37)` | **PRYZM** | A ratchet at 37 is measurably better than 325 ungated direct writes, and PRYZM's gate names its own gap in its own output. | `grep -rn "updateNode(" pascal/ \| grep -v test \| wc -l` → 325; PRYZM gate RC=0 |
| **B3. ⛔ The DTO-store question** | **Structurally impossible** — material is `node.slots[role]`, one store, one snapshot shape (`slot-paint.ts:138`; `clone-scene-graph.ts:11-17` ≡ `history-control.ts:8-14`) | 35 plugin DTO stores; **13 create-mirrors, 0 update-mirrors**; 13 `setMaterial` verbs REFUSE; 217/351 verbs cannot name a store | **PASCAL — decisively** | One representation of an element means there is no wrong store to write to; PRYZM's second representation is the mechanical cause of every dead verb in the register. | `grep -c "\.updated'" initTools.ts` → **0**; `SetSlabMaterial.ts:28-56` |
| **B4. Dead-verb detection** | ABSENT — no verbs, so nothing to detect; but MCP `createNode` returns an unverified id (`scene-bridge.ts:284-287`) | `check-verb-register.ts` (351 verbs, 5 dispositions, CI-diffed both ways), `CommandEventBridge` `default:` compound detector (`:1649-1690`) | **PRYZM** | PRYZM is the only one of the two that can *enumerate* what is dead; the register is a real, generated, gate-enforced asset with no Pascal equivalent. | gate RC=1 with 4 named failures; `find pascal -iname '*verb*'` → 0 |
| **B5. Undo topology** | 1 stack, 1 entry point, 1 arbitration rule (there is none) — `history.ts:73`, `use-scene.ts:1287` | 2 stacks, 1 entry point, 4 metadata keys + shadow-drop + coverage map + 15 declared gaps — `performUndoRedo.ts:190,390,503` | **PASCAL** | PRYZM's arbiter is excellent engineering solving a problem Pascal does not have; 12 store keys where `owner: 'nothing'` means Ctrl+Z is a total no-op. | `performUndoRedo.ts:503-575`; §2.6 |
| **B6. Batch / one-gesture-one-undo** | `runAsSingleSceneHistoryStep` (`history-control.ts:252`) collapses N→1 **and retracts a net-no-op entry**; 19 call sites; 79 pause sites | `gestureScope.ts` + `gestureId` + shadow-drop; C104 lift = 19 records, one entry | **PASCAL (narrowly)** | Both achieve one-gesture-one-undo; Pascal's also deletes an entry whose net effect is nil, verified against the authoritative snapshot, which PRYZM does not do. | `history-control.ts:259-262`; `areSceneSnapshotsEqual` (`:115`) |
| **B7. Read-back discipline (C16 CA-21)** | Store actions return `void` (never lie); host patches return a boolean derived from an authoritative before/after compare (`use-scene.ts:1953`); full dry-run validator (`:1731-1907`). **MCP `createNode` does NOT read back** (`scene-bridge.ts:284-287`) | CA-21 is written and binding — "an executed read-back from a RENDER/PERSIST/EXPORT store, never `success: true`" (C16 §5.1); and 217/351 verbs still cannot name that store | **DIFFERENT-BY-DESIGN** | PRYZM has the *rule* and Pascal has the *property*: PRYZM states the strongest read-back doctrine I have seen in either tree and cannot yet satisfy it; Pascal satisfies it by construction for the store and violates it at exactly one seam (MCP create). | C16 §5.1 CA-21; `use-scene.ts:1918-1990`; `scene-bridge.ts:284-287` |
| **B8. Authoring cost — one new property** | **2 files** (Zod field + `ParametricDescriptor` row); generic commit at `parametric-inspector.tsx:60-79` | **≥ 8 touchpoints** incl. sync disposition, chat class, verb-register row, OTel span | **PASCAL — decisively** | Pascal's cost per property is bounded by the schema; PRYZM's is bounded by the number of registries the property must be declared in. | `packages/nodes/src/spawn/parametrics.ts` (26 lines, entire file); C16 §5 |
| **B9. Authoring cost — one new verb/operation** | *no such concept* | **25 files** for `lift.create` | **PASCAL** | A framework where "new operation" is not a unit of work has zero cost for it; the trade is that Pascal cannot express an operation that is not a node CRUD. | `grep -rln "lift\.create" packages plugins apps \| wc -l` → 25 |
| **B10. Authoring cost — one new element kind** | 1 folder, 6–15 files, +1 line in `nodes/src/index.ts` | 1 plugin + 1 geometry pkg + serializer + bridge case + mirror + builder + undo map + storeKey + verb rows | **PASCAL** | Pascal's kind is complete when its manifest is complete; PRYZM's kind is complete when eight independent registries agree, and `lift`/`balcony`/`pool`/`boundaryLine` are four measured cases where they did not. | §2.7; `performUndoRedo.ts:540-575` |
| **B11. Duplicate registration** | **Throws in production**, warns under HMR (`registry.ts:113-120`) | **First-registration-wins + silent `continue`** (`initBusHandlers.ts:469,517,2882,3033`); 1 live SHADOWED verb | **PASCAL** | A collision that throws at startup is found by the first developer; a collision that skips is found by a founder's screenshot. | gate output: `V4 1 NEW SHADOWED verb(s): sheet.create` |
| **B12. Validation at the write** | Full Zod re-parse of the whole node on every write; out-of-range numbers **clamped + `console.warn`** (`node-actions.ts:344-482, 500-510`) | `canExecute` returns `{valid,reason}`; `CommandBus` throws `CommandBusError` on rejection (`CommandBus.ts:427-431`); refusals are values (C16 CA-18) | **PRYZM** | A clamped-and-warned value is a silent partial success the user never sees; PRYZM's refusal-with-a-named-reason is the better contract and is now doctrine. | `node-actions.ts:500-510`; C16 §5.1 CA-18 |
| **B13. Preview / live-drag state** | Read-merge overlay keyed on the same node (`use-live-node-overrides.ts:66-72`); host patches **refuse** while an override is live (`use-scene.ts:1391-1395`) | Preview state varies per tool; `pauseHistory`-equivalents exist per-plugin | **PASCAL** | A partial spread over the real node degrades to a stale preview; a rival full record degrades to a lost write. | `getEffectiveNode` (`:66`); `sceneOperationPatchHasLiveConflict` (`:1391`) |
| **B14. Multi-user collaboration on the store** | SSE poll (250 ms) of whole-graph snapshots + optimistic version check (`sqlite-scene-store.ts:354-360`); **CRDT ABSENT** (grep → 0); collaborative-history seam **UNREACHABLE** (0 in-tree callers) | Yjs CRDT applier wired directly in the bus (`CommandBus.ts:629-641`), 126 real `YjsDocAdapter` merges under `check-conflict-surfacing.ts` with 0 SILENT losses | **PRYZM** | Pascal's story is agent↔browser sync at whole-document granularity with last-writer-wins; PRYZM has per-command CRDT routing and a hard-0 conflict-surfacing gate. | `grep -rn "yjs\|automerge" pascal/` → 0; CLAUDE.md P8 |
| **B15. Observability of the mutation path** | **0 spans** (`grep -rn "opentelemetry\|startSpan\|tracer" pascal/` → 0) | ZONE A 246/246 CommandBus handlers instrumented; `withHandlerSpan` per handler | **PRYZM** | You cannot debug a production mutation you cannot trace; Pascal has no trace at all. | `SetSlabMaterial.ts:84`; CLAUDE.md P8 |
| **B16. Documentation ↔ code fidelity** | README:87,159 claim IndexedDB persist middleware; `grep -n "persist" use-scene.ts` → **0** | CLAUDE.md carries five dated correction boxes; `check-contract-index-equivalence.ts` and `check-contract-cited-paths.ts` mechanise the rule | **PRYZM** | Both drift; only one of them has built gates that detect the drift and correct the document in place. | Pascal README:159 vs `use-scene.ts:1286`; CLAUDE.md §Governance |

**Score across 16 sub-axes: PASCAL 8 (B3,B5,B6,B8,B9,B10,B11,B13) · PRYZM 6 (B2,B4,B12,B14,B15,B16) · DIFFERENT-BY-DESIGN 2 (B1,B7).** The eight Pascal wins are almost all consequences of **one** decision (single representation). The six PRYZM wins are consequences of **investment** (gates, registers, doctrine, telemetry, CRDT) that Pascal has not made and, at its scale, does not need.

---

## 6. What PRYZM should adopt

Ranked by value-over-cost. Every row is handable to a lane that has not read this audit.

| # | Change | Files to touch | Effort | Value | Risk | Blast radius | Contract/ADR impact | Prerequisite |
|---|---|---|---|---|---|---|---|---|
| **1** | **§MIRROR-COMPLETENESS gate — a bus verb whose `affectedStores` names a plugin DTO store MUST have a `CommandEventBridge` case OR a declared `MIRROR-EXEMPT` reason.** Mechanise §2.4's zero: for each of the 351 verbs, resolve `affectedStores` → is that key a `plugins/*/src/store.ts` class? If yes, require a `case '<verb>'` arm in `CommandEventBridge.ts` or a row in a new `mirror-debt.json`. Ratchet, shrink-only, seeded at today's count. | NEW `tools/ga-gate/check-mirror-completeness.ts`; NEW `tools/ga-gate/mirror-debt.json`; `tools/ga-gate/run-all.ts` | **M** | ⭐ **Highest.** This is the ONE gate that would have caught `pool.create`, `lift.create`, `balcony.create`, `boundaryLine.create` and all 13 `setMaterial` refusals *before* the founder saw them. `CommandEventBridge.ts:1661-1667` already concedes "a comment is not a detector" and mechanised only the compound sub-case; this generalises it to every verb. | LOW — a new gate, no runtime change | CI only | New §, cite from C16 §5.1 CA-17 and C69 | none — `check-verb-register.ts` already computes `affectedStores` per verb; reuse its extractor |
| **2** | **`boundaryLine` + `pool`: retire or complete, in one commit each.** For each: either (a) add the `CommandEventBridge` case + serializer field + builder call, or (b) flip `canExecute` to REFUSE with the `SetSlabMaterial.ts:56` text pattern naming all three breaks. **Do not leave a third state.** | `packages/runtime-composer/src/CommandEventBridge.ts`; `apps/editor/src/engine/persistence/ProjectSerializer.ts`; `packages/persistence-client/src/loader/ProjectSerializer.ts`; `packages/geometry-boundary-line/src/BoundaryLineGeometry.ts`; `plugins/boundary-line/src/handlers/*`; `plugins/pool/src/handlers/*` | **M** (refuse) / **L** (complete) | High — these are live today; §2.5 measures all three breaks | MED if completing (new render path); LOW if refusing | one family each | C16 CA-18; ISSUE-LOG row per family | Prove it worked: dispatch `boundaryLine.create`, then **read the id back out of `ProjectSerializer`'s snapshot** (CA-21). `success:true` is not the proof. |
| **3** | **Adopt Pascal's net-no-op retraction into `RingBufferUndoStack.push()`.** Pascal computes `areSceneSnapshotsEqual(before, current)` over the *authoritative* snapshot and **removes** the history entry when a gesture's net effect is nil (`history-control.ts:259-262`). PRYZM's C03 §4.6 U-3 already refuses to push an *empty patch pair*; it does not refuse a pair whose forward and inverse cancel. | `packages/command-bus/src/UndoStack.ts`; `packages/runtime-undo-stack/src/*`; `packages/command-bus/src/CommandBus.ts:576-579` | **S** | Medium-high — removes the "phantom Ctrl+Z" class without touching the two-stack arbiter | LOW — pure subtraction from the stack | undo only | C03 §4.6, extend U-3 | Needs a value-equality over `PatchSide.ops`; `areScenePatchValuesEqual` (`use-scene.ts:1681-1702`) is a ready-made 40-line reference implementation |
| **4** | **Make duplicate bus registration a startup ERROR, matching `registry.ts:113-120`.** Replace the four `if (runtime.bus.registry?.has?.(spec.type)) continue;` skips with: throw in production, `console.warn` + replace under HMR. Today a shadow is a silent skip and the gate finds it after the fact (`sheet.create`). | `apps/editor/src/engine/initBusHandlers.ts:469,517,2882,3033`; `packages/command-bus/src/CommandBus.ts:95-101` | **S** | High — converts CA-20's "boot order is not visible in the file you are editing" from a doctrine into a crash | **MED** — will surface existing shadows at boot; land behind an env flag first, then flip | boot path | C16 CA-20 — upgrade from "MUST be stated" to "MUST NOT exist" | Run `check-verb-register.ts` first and drive SHADOWED to 0 (today: 1) |
| **5** | **Fix CA-20's stale locator in C16, and add the locator to the gate.** C16 cites `initBusHandlers.ts:2202`; measured today the skips are at :469, :517, :2882, :3033. Have `check-verb-register.ts` emit the *current* skip line numbers into the generated register so the contract can cite the artefact instead of a literal. | `docs/02-decisions/contracts/C16-*.md`; `tools/ga-gate/check-verb-register.ts` | **S** | Medium — this is CLAUDE.md's five-times-recurring defect shape, in a contract, found live | NONE | docs | C16 §5.1 CA-20 | none |
| **6** | **Extend `ELEMENT_STORE_ROUTES` to the 15 unrouted families, or REFUSE them by name.** `UpdateElementParameterCommand.ts:118-155` routes 20 alias rows → 9 distinct store selectors. `ceiling`, `floor`, `lighting`, `plumbing`, `structural`, `grid`, `annotation`, `dimension`, `lift`, `balcony`, `section`, `sheet`, `schedule`, `pool`, `boundaryLine` fall to `No store for elementType`. Add a row where a legacy store exists; where none exists, keep the refusal but make its text name the missing store. | `packages/command-registry/src/generic/UpdateElementParameterCommand.ts`; `packages/command-registry/src/__tests__/updateElementParameterSnapshotScope.test.ts` | **M** | High — this is the single generic property path; each added row makes one family's property panel work | LOW — the table's scope/selector pairing (`:100-117`) makes drift structurally impossible | property panel | C16 §5; C84 per-family | The existing test *"every store the command WRITES is a store it DECLARED"* is the proof harness; extend it per new row |
| **7** | **Adopt the `ParametricDescriptor` idea for PRYZM's property panel — a per-family declarative field manifest that the panel renders generically.** Pascal's `parametric-inspector.tsx:60-79` serves all 53 kinds in 20 lines because each kind declares `{ key, kind, unit, step }` rows. PRYZM's panel is per-family. This is the structural change that would collapse recommendation #6 from "add a row per family" to "the panel already works". | NEW `packages/schemas/src/parametrics/*`; `apps/editor/src/ui/**/PropertyPanel*`; one descriptor per `plugins/*` | **XL** | Very high, long horizon — this is the authoring-cost win (B8), worth more than everything above combined *if* PRYZM intends third-party element kinds | **HIGH** — touches every family's inspector | whole editor UI | New contract or C16 §6; interacts with C84 | Do #6 first; the routing table is the data this descriptor would consume |
| **8** | **Single-representation migration (ADR-0251 / C03 U-7's "one store, derived geometry, one timeline").** The 35 plugin DTO stores and the ~81 `window.*Store` globals become one. This is what Pascal has and what makes eight of its twelve wins in §5 automatic — the dead-verb family, the undo arbiter, the coverage map, the mirror switch and the snapshot-scope table all cease to exist. | everything on the mutation path | **XL+** | ⭐ **The single highest-value change to PRYZM, and the one this audit exists to name.** | **VERY HIGH** | total | ADR-0251 supersession; C03 §4 rewrite | #1 first — you cannot migrate what you cannot enumerate; the mirror gate's debt file IS the migration backlog |
| **9** | **Read-back the MCP/AI create path the way CA-21 demands, and note Pascal fails this too.** Pascal's `scene-bridge.ts:284-287` returns a generated id without reading it back; PRYZM should not copy that seam. Any PRYZM agent-facing create must `getState()[id]` after the write. | `packages/ai-host/src/**`; `plugins/*/src/handlers/Create*.ts` | **S** per site | Medium | LOW | AI path | C16 CA-21 | none |

### 6.1 What NOT to adopt from Pascal

- ⛔ **Do not adopt clamp-and-warn validation** (`node-actions.ts:500-510`). A value silently clamped into range is a partial success the user is not told about. PRYZM's refusal-is-a-value (C16 CA-18) is strictly better and is already doctrine.
- ⛔ **Do not adopt "no policy layer."** Pascal's 325 ungated `updateNode` sites work because there is no permission model, no audit log, no server-side authority and no chat dispatch. PRYZM has all four as product requirements.
- ⛔ **Do not adopt whole-graph LWW persistence** (`sqlite-scene-store.ts:354-360`). It is right for one user + one agent; it is wrong for PRYZM's collaboration claim.

---

## 7. What PRYZM does BETTER

This section is not a courtesy. Five things exist in PRYZM that have **no Pascal equivalent at all**, measured by grep.

1. **The generated API verb register (C69).** `docs/04-reference/API-VERB-REGISTER.md` + `tools/ga-gate/check-verb-register.ts`. 351 verbs, five liveness dispositions, CI-diffed **in both directions** so a new verb cannot merge without a row. Pascal: `find . -iname '*verb*' -o -iname '*api-register*'` → **0**. Pascal cannot tell you what its API surface is, because it does not think it has one. ⭐ **This register is what made this audit possible.** Every hard number in §2 came from it or from the gate that generates it. Keep it, and feed recommendation #1 into it.

2. **The refusal culture, as a *value*.** `SetSlabMaterial.ts:28-56` is the single best piece of engineering writing I read in either codebase: it names the defect, names the two stores, names the contract clause, names why REFUSE beat RETIRE, and names where the refusal lives and why (`canExecute`, because "CommandBus throws before touching either undo stack … so no PatchPair keyed to a geometry store can be armed for a write geometry never saw"). Pascal has no vocabulary for a refusal — its actions return `void`. **13 verbs currently carry this shape and they should stay refusing until #1/#8 land.**

3. **OpenTelemetry spans on the mutation path.** ZONE A: **246/246** CommandBus handlers instrumented. Pascal: `grep -rn "opentelemetry\|startSpan\|tracer" .` → **0 hits, repo-wide.** For a multi-tenant SaaS this is not a nice-to-have; it is the only way a production mutation failure is diagnosable at all.

4. **Per-verb sync disposition + chat classification.** `packages/sync-client/src/syncDisposition.ts` (1 206 lines) and `packages/ai-host/src/capabilities/ChatCommandClassification.ts` (466 lines), both gate-enforced. Pascal has neither concept: its MCP layer exposes whatever the node schema says, and its "sync" is a 250 ms whole-graph poll.

5. **The documented-correction discipline.** CLAUDE.md carries five dated correction boxes for one recurring defect and then *built a gate for it* (`check-contract-index-equivalence.ts`, which compares SETS not counts). Pascal's README states as fact that `useScene` is persisted to IndexedDB via a `persist` middleware (README:87,159); `grep -n "persist\|indexedDB\|idb" packages/core/src/store/use-scene.ts` → **0 hits**. Both codebases drift. Only one detects it.

**A sixth, smaller one, worth naming:** PRYZM's `CommandBus.buildContext` refusal to fall back to globals (`CommandBus.ts:284-292`) is why `pool.create` is *unreachable* rather than *silently writing the wrong thing*. That guard converted a would-be corruption into a throw. Keep it.

---

## 8. Not established

Each of these is a **measurement I did not take**, not an inference I declined to make.

1. **Whether Pascal's `readOnly` silent no-op reaches a user.** MEASURED: the guard exists at `node-actions.ts:1187,1263,1437,1555`; the only production setter is `editor/index.tsx:1319` (version-preview mode), which also forces `setMode('select')`. Whether every tool is actually inert in that mode requires running the app. **Verdict: UNPROVEN, not PASS.**

2. **Whether Pascal's MCP `createNode` unverified return ever lies in practice.** The MCP server runs in its own Node process (`packages/mcp/src/bin/pascal-mcp.ts` + `bridge/node-shims.ts`) with its own `useScene` instance, and I found no site that sets `readOnly` in that process. So the seam is *latent*, not *live*. Confirming it needs the MCP server running. **I did not claim it is a live defect.**

3. **Whether PRYZM's 179 UNKNOWN-liveness verbs are dead.** The gate says UNKNOWN, C68 §5.a says the presumption has been right 13/13 times, and neither is a measurement of these 179. Each needs an executed read-back per CA-21. **I did not extrapolate 13/13 to 179.**

4. **Whether `boundaryLine.create` and `pool.create` are reachable from the UI.** I measured that their *outputs* die (no bridge case, no serializer field, no builder caller). I did **not** measure whether a user can dispatch them — `pool.create` is documented at `performUndoRedo.ts:540-548` as throwing at `buildContext` before mutating, which would make it unreachable rather than dead; `boundaryLine` has plan-tool handlers (`elementCreationMatrix.ts:512` discusses it) but I did not trace the arming path. **The distinction matters for recommendation #2 and a lane should measure it before choosing (a) or (b).**

5. **Runtime performance of either store.** Pascal's per-frame dirty-set sweep vs PRYZM's committer/frame-scheduler is AUDIT-D/E territory and I did not benchmark either.

6. **Pascal's third-party plugin path end-to-end.** `registry.ts` and `Plugin` (`types.ts:919-927`) say built-ins and externals use the same shape, and `pascalorg/plugin-trees` is cited as a worked example — but that repository was not cloned and I did not verify the claim by reading an actual external plugin. **"Same shape" is Pascal's claim, read in its types; it is not a measurement of a shipped external plugin.**

7. **Whether `check-verb-register.ts`'s `affectedStores` extractor can be reused for recommendation #1 without modification.** I read that the gate resolves `affectedStores` per verb (its output prints "Authoritative store NONE / UNKNOWN : 217"), but I did not read the extractor function itself. Recommendation #1's "reuse its extractor" is a **design suggestion**, not a verified capability.

8. **Whether PRYZM's 37 tolerated direct store writes are equivalent in kind to Pascal's 325.** They are not obviously comparable: PRYZM's 37 are UI files writing app stores (`DxfImportPanel.ts` ×12, `ValidatePanel.ts` ×6 — the gate's own by-file listing); Pascal's 325 are tools writing the model store, which is Pascal's *sanctioned* path. I reported both numbers and did not compute a ratio, because the denominators are different things.

---

### Appendix — commands, in one block, for re-running

```bash
# PASCAL
P="…/scratchpad/pascal"
find $P -path $P/node_modules -prune -o -name '*.ts' -print -o -name '*.tsx' -print | wc -l   # 1929
grep -rn "commandBus\|dispatchCommand\|executeCommand" --include=*.ts --include=*.tsx $P      # 0
grep -rn "opentelemetry\|startSpan\|tracer"            --include=*.ts --include=*.tsx $P      # 0
grep -rn "yjs\|Y.Doc\|automerge"                       --include=*.ts --include=*.tsx $P      # 0
grep -rn "updateNode(" --include=*.ts --include=*.tsx $P | grep -v node_modules | grep -v '\.test\.' | wc -l  # 325
grep -rn "runAsSingleSceneHistoryStep" $P | grep -v node_modules | grep -v '\.test\.' | wc -l # 19
grep -rn "pauseSceneHistory\|acquireSceneHistoryPause\|pauseHistory()" $P | grep -v node_modules | grep -v '\.test\.' | wc -l  # 79
grep -c "Definition," $P/packages/nodes/src/index.ts                                          # 53
grep -n "persist\|indexedDB\|idb" $P/packages/core/src/store/use-scene.ts                     # 0  (README says otherwise)
grep -rn "installHistoryCommandDelegate(" $P | grep -v node_modules | grep -v '\.test\.'      # 1 (the definition)

# PRYZM
npx tsx tools/ga-gate/check-verb-register.ts            # RC=1 · 351 verbs · 217/351 store NONE|UNKNOWN
npx tsx tools/ga-gate/check-no-direct-store-writes.ts   # RC=0 · within baseline (37/37)
grep -c "\.updated'"  apps/editor/src/engine/initTools.ts                                     # 0
grep -on "'[a-z-]*\.created'" apps/editor/src/engine/initTools.ts | wc -l                     # 17 (13 distinct)
grep -cE "^\s+case '" packages/runtime-composer/src/CommandEventBridge.ts                     # 31
grep -nE "^\s+case 'pool\."         packages/runtime-composer/src/CommandEventBridge.ts       # RC=1
grep -nE "^\s+case 'boundaryLine\." packages/runtime-composer/src/CommandEventBridge.ts       # RC=1
grep -c "boundaryLine" apps/editor/src/engine/persistence/ProjectSerializer.ts \
                        packages/persistence-client/src/loader/ProjectSerializer.ts           # 0 : 0
grep -rn "boundaryLineSolid" --include=*.ts packages plugins apps | grep -v '\.test\.'        # 0 calls
ls plugins/*/src/store.ts | wc -l                                                             # 35
grep -rn "window\.[a-zA-Z]*Store\s*=" --include=*.ts apps/editor/src | wc -l                  # 81
grep -rln "lift\.create" --include=*.ts --include=*.tsx packages plugins apps | wc -l         # 25
ls tools/ga-gate/check-*.ts | wc -l                                                           # 68
```
