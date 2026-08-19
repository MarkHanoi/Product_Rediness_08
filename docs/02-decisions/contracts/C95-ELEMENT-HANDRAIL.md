# C95 — ELEMENT: HANDRAIL

> **Stamp**: 2026-08-18, **re-measured 2026-08-19 (lane HR1)** · **Status**: CANONICAL
> ⭐ **§15 carries the founder's FULL railing specification (2026-08-19) and is NORMATIVE.**
> It supersedes the narrower 2026-08-18 brief §§1-14 were measured against. Read §15 first if
> you are implementing; read §§1-14 first if you are auditing what is there today. — binding on every PR touching the handrail family
> **Parent**: [C84 §6](C84-ELEMENT-INTEGRITY.md). C84 owns `EI-1…EI-13`; C95 owns their application
> to handrail. **Structure**: C84 §6's twelve mandatory sections, in order, **AS-IS** (measured,
> `file:line`, HEAD `3384f076`) beside **TO-BE** (normative).
> **Cites, does not restate**: [C03 §4.6 U-2/U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md) owns
> `affectedStores` · [ADR-0319 §2](../adrs/ADR-0319-audit-fields-are-derived-not-authored.md) owns
> audit fields across undo (**NOT C75**) · [C15](C15-HOSTED-ELEMENT-CONTRACT.md) owns hosting ·
> [C16 CA-17…CA-21](C16-COMMAND-AUTHORING-PROTOCOL.md) owns authoring and refusal ·
> [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) owns tolerance · [ADR-0332](../adrs/) is the
> handrail deep audit this contract normalises.
> **Two headline results, in tension, and both must be carried:**
> **(1)** handrail is the **cleanest family in the repo on the EI-1 authority axis** — every consumer
> reads legacy, and that proves the split-brain is **per-family, not repo-wide** (§3);
> **(2)** it is simultaneously **the worst family on the EI-2 bridge axis** — four silent defects, all
> still live at HEAD, all now pinned by a probe that asserts them as green (§5).

---

## 0. THE CORRECTION — "the fixes landed today" is FALSE

> ### ⚠ THIS SECTION IS KEPT, AND IT IS NOW PARTLY HISTORICAL. READ §5 WITH IT.
> Every row below was TRUE when written. **D1–D4 have since been fixed for real** — §5 carries
> the line-by-line re-measurement at HEAD and the retraction. §0 is not deleted, per C84 §6:
> it is the account of a report that outran its code, which is the most re-usable thing here.
> **D5, D6 and D7 are still open.** ⛔ And the sharpest 2026-08-19 finding is not in this
> section at all: the bridge these defects live in now has **no traffic** — `handrail.create`
> has ZERO production dispatchers (§3.1b). A defect on an unreachable path is still a defect,
> but it is no longer what the user is losing (§11).

⛔ **This contract was commissioned on the premise that four bridge defects had been MEASURED AND
FIXED today, and that slope had shipped. Measured at HEAD: nothing was fixed. The premise is
REFUTED, and the refutation is the most useful thing in this document** — a lane that believed it
would have marked four live defects closed.

| Claimed | Measured at HEAD `3384f076` |
|---|---|
| "N-point path collapse now refuses by name" | ⛔ **STILL COLLAPSES SILENTLY.** `initTools.ts:1928-1929` keeps `path[0]` and `path[last]`. **No refusal string exists** |
| "the `'rectangular'` constant-ternary is fixed" | ⛔ **STILL PRESENT** — `initTools.ts:1942` |
| "the authored diameter now reaches the round branch" | ⛔ **STILL PRESENT** — `initTools.ts:1940` writes `thickness`; the round branch reads `railDiameter` |
| "`fillType` now crosses the bridge" | ⛔ **STILL ABSENT** — `initTools.ts:1930-1948` |
| **"slope shipped by reading `baseLine[i].y`"** | ⛔ **FALSE.** `HandrailFragmentBuilder.ts:135-137` reads **X and Z only**; `grep "baseLine\["` → **ZERO hits**; `start.y`/`end.y` → **ZERO hits**. Y is `level.elevation + baseOffset` (`:145`), applied at `:186`. **A sloped handrail is impossible in the live builder** |

**What DID land today** — three commits, none a fix:

| Commit | What it is |
|---|---|
| `1c22b4ec` | `docs(ADR-0332)` — the audit |
| `db7e62d5` | `test(Z9/§HANDRAIL-BRIDGE-PROBE)` — **1 file, +221 lines, characterisation only** |
| `6e049a7b` | `wip(Z9)` — `packages/geometry-stair/src/HandrailRunGeometry.ts`, **NOT WIRED** |

> ### ⚠ §C95-A-GREEN-PROBE-IS-NOT-A-FIX
> `HandrailBridgeDivergenceProbe.spec.ts` **asserts the defective behaviour as expected**:
> `:113` `expect(legacy.baseLine).toHaveLength(2)` · `:137` `expect(legacy.railProfile).toBe('round')` ·
> `:168` `radiusTop` `toBeCloseTo(0.02)` · `:188` `toHaveLength(3)`.
> **This is correct practice** — it is the watched-RED control, inverted: it locks today's behaviour so
> the fix has to change a green test to green-differently, which is visible in review. **But a suite of
> passing tests over a defect reads to a reviewer exactly like a suite of passing tests over a fix.**
> Every one of these `it()` names MUST keep the word the probe uses (*"loses"*, *"maps to"*, *"renders
> as the default"*) and MUST be converted to the asserted-correct value in the same commit as the fix.
> ⛔ Do not report `HandrailBridgeDivergenceProbe` green as evidence of conformance.

Also measured: `HandrailRunGeometry.ts` has **exactly one importer — its own test**
(`packages/geometry-stair/src/__tests__/HandrailWallParity.spec.ts:27`), a **16-`it()` suite against
code nothing calls**, including slope (`:184`), curve (`:145`) and fill types (`:216,223`). **The
capability is written, specified, tested and unreachable** — [C72 §0.1](C72-PROPAGATION-AND-PREVSTATE.md)'s
*"a typed declaration is not wiring"*, in its most expensive form.

---

## 1. Identity

| Axis | AS-IS (measured) | TO-BE (normative) |
|---|---|---|
| 3D mesh tag | **`'Handrail'`** — `packages/geometry-stair/src/HandrailFragmentBuilder.ts:175` (`:174` also sets `type:'Handrail'`) | **`'Handrail'` frozen**, consumers normalise per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) |
| stair-railing mesh tag | **`'stair-railing'`** — `StairRailingBuilder.ts:1114,1120,1134` | ✅ **a DIFFERENT FAMILY, correctly tagged** — see §1.1 |
| storeEventBus tag | `'handrail'` — `packages/core-app-model/src/stores/HandrailStore.ts:112` | ✅ casing only — C15 §12 compliant |
| Delete branch label | `'handrail'` — `DeleteElementCommand.ts:517` | ✅ casing only |
| **Property-panel type selector** | ⛔ **`'railing'` — a FOURTH SPELLING** — `apps/editor/src/ui/property-panel/PropertyPanelTypeSelector.ts:279` | ⛔ **VIOLATION — must become `'handrail'`** |
| Move-verb alias table | **both** `handrail` **and** `railing` → `handrail.moveBaseLine` — `apps/editor/src/engine/transforms/elementMove.ts:125-126` | the alias is the workaround that lets the violation survive; delete it with the violation |
| Plan-view layer table | `Handrail`, `HandrailPart`, `'stair-railing'`, `stairRailing` → `A-STRS` — `EdgeProjectorService.ts:153-154` | declare `HandrailPart` as a **sub-part** with `parentId` per C15 §12, not a tag |
| L0 Zod schema | `packages/schemas/src/elements/Handrail.ts:12`; shape enum `:7` `z.enum(['round','square','flat'])`; default `:53`; endpoint refinement `:64`; registry `registry.ts:51`; `HandrailId` `types/Id.ts:28` | unchanged |
| Bus verb namespace | **9 verbs, in TWO places** — 7 in `plugins/handrail/src/handlers/index.ts:13-19`, **plus** `handrail.moveBaseLine` (`initBusHandlers.ts:1128`) and `handrail.updateColor` (`:1427`) declared in the **editor host** | **one declaration site**; both host verbs join [C69](C69-API-VERB-REGISTER.md) |

⛔ **`'railing'` is a C15 §12 violation and `.toLowerCase()` cannot save it** — `'railing' ≠ 'handrail'`
under any normalisation. Per [C84 §4E](C84-ELEMENT-INTEGRITY.md): *multiple spellings of one family are
the violation; multiple casings of one spelling are not.* Handrail has **two spellings** (`handrail`,
`railing`) plus a legitimately separate family (`stair-railing`).

⛔ **The GA gate under-counts this family: `tools/ga-gate/check-verb-register.ts:487-492` lists 6 of
the 9 verbs.** The two host-declared verbs and one plugin verb are outside its field of view. **This is
[C84 §5](C84-ELEMENT-INTEGRITY.md)'s `check-verb-register` `TYPE_DECL_RE` blind spot, hitting a second
family.** Its readings for handrail MUST NOT be quoted as a denominator.

### 1.1 There are THREE railing concepts and only ONE is this family

| Concept | Live? | What it can do | Site |
|---|---|---|---|
| **`HandrailFragmentBuilder`** — **THIS FAMILY** | ✅ LIVE, `initBuilders.ts:876` | **strictly horizontal**; 2-point only; one Y rotation (`:189`) | `packages/geometry-stair/src/HandrailFragmentBuilder.ts` |
| `StairRailingBuilder` — **a DIFFERENT family** | ✅ LIVE, `initBuilders.ts:926` | **slopes correctly** — quaternion from the full 3-D direction, `:1127` `end.clone().sub(start).normalize()`, `:1129` `setFromUnitVectors` | `packages/geometry-stair/src/StairRailingBuilder.ts:1122-1139` |
| `produceHandrail` + `HandrailCommitter` | ⛔ **DEAD** | **slope AND N-point curve** — `producers/handrail.ts:94-96` reads `p.y` per point; `:100-116` averages interior tangents; `:73-79` handles a vertical tangent | `packages/geometry-kernel/src/producers/handrail.ts:81` |

> ⛔ **THE CENTRAL IRONY, AND IT IS A MEASUREMENT:** *the only handrail geometry in this repository
> that can express slope or an N-point curve is the code that is never called.* `produceHandrail(` has
> **zero production call sites** (tests, bench and the dead committer only); `new HandrailCommitter` has
> **zero hits repo-wide**, including `apps/bake-worker`, `apps/export-worker`, `apps/cli` and `tools/`.
> The live builder discards both. **The capability was built, then routed around.**

⚠ **C95 does NOT authorise deleting `produceHandrail`.** [C84 §3.5.2](C84-ELEMENT-INTEGRITY.md) and
ADR-0331 §D5 — *"what is Stack B for?"* — is an **open founder question**, and until it is answered
nothing in `packages/geometry-kernel/src/producers/` may be deleted. ⚠ C84 §3.5.2 states handrail's
producer *"is genuinely dead"*; that is true of **reachability**, not of **disposition**.

---

## 2. Stores

| # | Representation | Path | Writers | Readers | Verdict |
|---|---|---|---|---|---|
| 1 | L0 Zod schema | `packages/schemas/src/elements/Handrail.ts:12` | bus payload | `Handrail.parse` in `CreateHandrail.ts` | — |
| 2 | **Plugin DTO store** | `plugins/handrail/src/store.ts:10` (`super('handrail')` `:11`) | ⭐ **ZERO as of 2026-08-19** (was 1 verb) | **ZERO in production** | ⛔ **INERT — 0 writers, 0 readers. §4.3** |
| 3 | **Legacy geometry store** | `packages/core-app-model/src/stores/HandrailStore.ts:24`, built once at `initBuilders.ts:872`, `window.handrailStore` `:873` | legacy commands + the `.created` bridge | **everything** | 🟢 **THE AUTHORITY** |
| 4 | Scene `userData` | `HandrailFragmentBuilder.ts:174-175` | the builder | picking, delete routing, plan layers | derived |
| 5 | Kernel producer | `producers/handrail.ts:81` | — | **nothing** | **DEAD — but not deletable** |
| 6 | **Type catalogue** | `packages/core-app-model/src/stores/HandrailTypeStore.ts`, singleton `handrailTypeStore` | built-ins + `add()` at runtime | the pre-draw panel, the property-panel retype widget, `HandrailTool`, `StairRailingTypeMapping` | 🟢 **THE TYPE AUTHORITY — 20 built-ins.** Wall's `WallSystemTypeStore` twin. ⚠ REFERENCED by nobody: `HandrailData` carries no `typeId`, so a type is MATERIALISED into the record (§9.3) |

> ### EI-1 — THE AUTHORITY IS `packages/core-app-model/src/stores/HandrailStore.ts` (`window.handrailStore`)

**EI-1a — the `'handrail'` key resolves to two objects** ([C03 §4.6 U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md)):
**WRITE** (bus verb) → the plugin DTO snapshot; **UNDO** → `performUndoRedo.ts:329`
`handrail: w.handrailStore, handrails: w.handrailStore` — the **legacy** store. Declared here as
required by EI-1a. ⚠ `stairRailing: w.stairRailingStore` is a **separate row at `:327`** — correctly so.

---

## 3. Consumers — ✅ THE CLEAN NEGATIVE RESULT, RECORDED EXPLICITLY

⭐ **This section exists because [C84 EI-1b](C84-ELEMENT-INTEGRITY.md) requires a clean family to be
RECORDED as clean. A blank would read as "fine" and be indistinguishable from "nobody looked."**

| Consumer | Reads | Evidence | Verdict |
|---|---|---|---|
| **Renderer (3D)** | **legacy** | `initBuilders.ts:898` `handrailStore.getById(id)` → `:899` `handrailBuilder.updateHandrail(h)`; events `HandrailStore.ts:118-120` | ✅ |
| **Plan view** | **legacy** | `HandrailStore.ts:106-111` `storeEventBus.emit({elementType:'handrail'})`; layers `EdgeProjectorService.ts:153`, families `:1950-1954` | ✅ |
| **Persistence — SAVE** | **legacy** | **LIVE pair** `apps/editor/src/engine/persistence/ProjectSerializer.ts:1022`; serializer fn `:738-740` | ✅ |
| **Persistence — LOAD** | **legacy** | **LIVE pair** `apps/editor/src/engine/persistence/ProjectLoader.ts:1221-1238`, `:1225` `new CreateHandrailCommand({…})` | ✅ |
| **IFC export** | **legacy** | `packages/file-format/src/export/ifc/readers/HandrailReader.ts:1,7,12`; `:39` `ifcClass ?? 'IfcRailing'` | ✅ |
| **GLB export** | **legacy (via the IFC/fragment chain)** | handrail tokens appear only under `export/ifc/*` | ⚠ **partly NOT MEASURED — §13** |
| **Schedules** | **legacy** | `packages/core-app-model/src/schedules/ScheduleExtractor.ts:475-477` | ✅ |
| **Undo** | **legacy** | `performUndoRedo.ts:329` | ✅ |
| **Rollback snapshot** | **legacy** | `CommandManagerImpl.ts` `optionalStores` — `['handrail','handrailStore',…]` | ✅ |
| **Bake worker** | — | `grep -ril handrail apps/bake-worker` → **ZERO files** | ⛔ **ABSENT** |

> ⭐ **EI-1 VERDICT: ✅ CLEAN. Nine consumers, one store, zero divergence.** Handrail is the
> counter-example to wall. **The split-brain is per-family, not repo-wide** — recorded here as C84
> EI-1b's worked instance, and it is the evidence that a per-family contract is the right granularity.

### 3.1 The plugin DTO store — ZERO production readers, censused on BOTH axes

Per [C84 §3.5.1](C84-ELEMENT-INTEGRITY.md), a deletion claim needs both axes; a **disposition** claim
needs both too, because a name-based census misses bus writes — a mistake C84 records being made and
corrected on this very family.

- **(a) Import / construction axis.** Constructed **once**: `apps/editor/src/PluginRegistry.ts:58`
  (import), `:320` `buildStore: () => new HandrailStore()`. Read only by the 7 plugin handlers
  (`CreateHandrail.ts:65,68`; `DeleteHandrail.ts:23,30,31`; `SetHandrailMaterial.ts:79,88`) and the
  plugin's own tests. `byHost()` / `ids()` have **zero** callers outside the plugin.
- **(b) Bus axis — ⭐ RE-MEASURED 2026-08-19: ZERO of the 7 verbs has a production dispatcher.**
  It was one (`handrail.create`, from `RailingPlanToolHandler.ts:92` and `HandrailTool.ts:158`).
  Both are gone, for two independent and both-deliberate reasons:
  - **`RailingPlanToolHandler`** moved to the L2 command path (L-982) because
    `CreateHandrailPayload` **cannot carry a catalogue type** — no `fillType`, `railProfile`,
    `postSpacing`, `baseOffset`, `materialColor` or baluster field exists on it (§5). Routing a
    type through the bus would have silently dropped most of it.
  - **`HandrailTool.ts:158`** was a `{}`-payload call labelled telemetry that was in fact a
    MUTATION minting a ghost record per 3-D draw; deleted (L-985, §4.4).
  The only remaining `handrail.create` call site in the repository is
  **`plugins/handrail/src/tool.ts:33`, inside `HandrailPlacementTool` — a class that is NEVER
  CONSTRUCTED** (zero hits repo-wide outside its own barrel re-export). ⚠ The **AI axis was checked
  too**, because a name-based census misses it: `ChatCommandClassification.ts:59-72` files
  `handrail.create` under **class B — "needs design"**, blocked on a per-family placement grammar,
  so the chat cannot dispatch it either.

**⇒ 0 readers AND 0 writers. The plugin DTO store is INERT.** ⛔ This is a **disposition, not a
deletion licence**, and the distinction is C84 §3.5's whole point: the store and its seven handlers
are the declared PRYZM-3 target vocabulary (C84 §3.5.3 / §12 R5). ⛔ **Do NOT reconcile or mirror**
([C84 §8.c](C84-ELEMENT-INTEGRITY.md) / EI-5a) — **DECLARE**, which the store's file header still
owes (§11 row 18).

### 3.2 ⚠ THE CLEAN RESULT HAS ONE HOLE: a SECOND persistence pair carries handrail code

The `✅` above is scoped to the **LIVE** pair. **`packages/persistence-client/` contains a near-verbatim
duplicate handrail persistence path across SIX files** — `loader/ProjectSerializer.ts:650,694,713,785`;
`loader/ProjectLoader.ts:735-741`; `SnapshotStreaming.ts:128,165,262,337,383`; `MigrationEngine.ts:68,88`;
`rebuildSemanticGraph.ts:46,79`. **EI-9 violation.** It is **NOT deletable** — `apps/cli`, `apps/bench`
and RAC gates import that package (C84 §3.5 `RENDER-DEAD / OTHER-HOST-LIVE`). **TO-BE:** declare which
pair is authoritative for which host, and pin the pair with an EI-8a equality test.

### 3.3 IFC — a stair railing round-trips as a handrail, and identity is lost

`packages/file-format/src/import/ifc/conversion/IfcRailingToNativeConverter.ts` imports **only**
`CreateHandrailCommand` (`:1`) and its `convert()` (45 lines) has **no branch** — `:27`
`executeHumanDirect(this.commandManager, new CreateHandrailCommand({…}))`. The sole early return is
`:10-13` (no level).

**⇒ Every `IfcRailing` becomes a `HandrailData`.** Export a stair railing, re-import it, and it returns
as a free-standing handrail — **and there is NO `StairRailingReader`**, so the stair-railing family has
no IFC export path at all. **TO-BE:** the converter MUST branch on the IFC `PredefinedType` / host
relationship, or **refuse by name** rather than silently re-classify (EI-2).

---

## 4. Plugin ↔ DTO ↔ command ↔ builder

### 4.1 Handlers

| Handler | `type` | Registered | UI-reachable | Verdict |
|---|---|---|---|---|
| `CreateHandrail.ts:30` | `handrail.create` | ✅ | ⛔ **0 dispatchers as of 2026-08-19** (was 2) | ⭐ **NOW DORMANT — see §4.3** |
| `DeleteHandrail.ts:19` | `handrail.delete` | ✅ | ⛔ **0 dispatchers** | **DORMANT** — ⛔ not deletable, and ⛔ **must not be wired** (§4.3) |
| `SetHandrailPath.ts:23` | `handrail.setPath` | ✅ | ⛔ 0 | DORMANT |
| `SetHandrailShape.ts:24` | `handrail.setShape` | ✅ | ⛔ 0 | DORMANT |
| `SetHandrailHost.ts:22` | `handrail.setHost` | ✅ | ⛔ 0 | DORMANT |
| `RecomputeHandrail.ts:26` | `handrail.recompute` | ✅ | ⛔ 0 — its only emitter is itself dead (§8) | DORMANT |
| `SetHandrailMaterial.ts:62` | `handrail.setMaterial` | ✅ | ⛔ **refuses `:82-83`** | ✅ **C16 CA-18 CONFORMANT** |

### 4.2 The live path is legacy

`CreateHandrailCommand` (`packages/command-registry/src/handrails/`), `UpdateHandrailCommand`,
`DeleteHandrailCommand` — reached from `HandrailTool.ts:159`, `initBusHandlers.ts:1136,1434`,
`DeleteElementCommand.ts:513-529`, `ProjectLoader.ts:1225`, `IfcRailingToNativeConverter.ts:27`.

### 4.3 THE PLUGIN-STORE LEAK — ✅ CLOSED 2026-08-19, and **by removing its writers, not by wiring its delete**

**What it was.** `handrail.create` wrote the DTO store (`CreateHandrail.ts:68-70`) from both
dispatchers; **nothing dispatches `handrail.delete`**; legacy deletes purge only the legacy store
(`DeleteElementCommand.ts:529`, `DeleteHandrailCommand.ts:95`). ⇒ every handrail ever created stayed
in the DTO store for the life of the session, growing monotonically — and the DORMANT handlers'
`canExecute` checks validate against those ghosts (`DeleteHandrail.ts:23`,
`SetHandrailMaterial.ts:79`), so wiring any of them would have acted on records the user had deleted.
**EI-5, with a latent correctness consequence rather than merely a memory one.**

**How it closed.** Both writers are gone (§3.1b): the plan tool moved off the bus because the bus
payload cannot carry a type, and the 3-D tool's junk telemetry call was deleted. **Nothing writes
the store, so nothing accumulates.**

> ⭐ **THIS IS THE SHAPE THE DELTA ASKED FOR, AND IT IS WORTH NAMING.** §11 row 18 (formerly delta
> #8) said: *close the leak by DECLARING the store retired, **NOT** by wiring `handrail.delete` —
> wiring the delete makes a zero-reader shadow look authoritative* (C84 §8.c). It closed by the
> writers disappearing as a **side-effect of fixing a different, user-visible defect**, which is
> strictly better than either option: no new code runs, and the store did not acquire a lifecycle
> that would have implied it mattered. ⛔ **The header declaration is still owed** — the code is
> now inert but does not SAY it is inert, and "nobody dispatches it today" is not a contract.

### 4.4 A JUNK RECORD PER 3-D HANDRAIL — ✅ CLOSED 2026-08-19 (L-985), and the blocking question is ANSWERED

`packages/geometry-stair/src/HandrailTool.ts:157-159`:

```ts
// [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
if (window.runtime?.bus) { window.runtime.bus.executeCommand('handrail.create', {}).catch(() => {}); }
this.commandManager.execute(cmd);
```

**The `{}` payload is VALID**: every check in `CreateHandrail.canExecute` (`:33-44`) is guarded by
`!== undefined`, so an empty object passes. `execute` then seeds a **complete record** — `:49`
`id = createId('handrail')`, `:52-55` `levelId:''`, `shape:'round'`, `height:1.0`, `diameter:0.04`, and
**`:58` `seed.path = cmd.path ?? [{x:0,y:0,z:0},{x:1,y:0,z:0}]`** — written to the store at `:68-70`.

**⇒ A ghost 1 m rail at the world origin was minted per 3-D handrail drawn**, and per §4.3 it was
never removed. ⛔ **A telemetry call MUST NOT be a mutation** (C16 CA-17).

> ### ✅ THE CALL IS DELETED — but the ORDER matters, and it is the transferable part
> This section blocked its own fix on a question (§13 item 1): does the ghost ALSO reach the LEGACY
> store and become **user-visible**? Deleting the call without answering would have closed the
> defect and thrown the answer away — and had the answer been *yes*, there would have been a
> second, worse defect nobody had logged.
>
> **MEASURED FIRST.** `CommandEventBridge.ts:886-913` forwards `record.payload` — which is `{}` —
> so it emits `handrail.created` with `id: undefined`. The `initTools` §FT-HANDRAIL bridge's
> **first** guard is `!ev.id` (`:1970-1975`), so it returns before touching `handrailStore`.
> ⇒ **NO phantom LEGACY handrail was ever minted.** The damage was confined to the DTO store:
> real, but internal.
>
> **THEN DELETED.** Nothing replaces it — the creation is already observable on the L2 path, which
> is where handrail creation is counted (§4.2). The site now carries the whole measurement in a
> comment, so the next reader does not re-open the question.

---
## 5. THE BRIDGE FIELD MAP — one row per field, CARRIED / TRANSFORMED / DROPPED (EI-2)

> ### ⚠ RE-MEASURED 2026-08-19 (lane HR1). §0's headline is RETRACTED IN PART, and both halves matter.
>
> §0 recorded, correctly at the time, that D1–D4 were **claimed fixed and were not**. They are
> fixed now — `initTools.ts` carries `§FIX-HANDRAIL-BRIDGE-TRUNCATION` / `-PROFILE` / `-DIAMETER` /
> `-FILL` at HEAD, measured line-by-line below. **§0 is NOT deleted** (C84 §6: record retractions,
> do not silently rewrite) — it remains the account of a claim that outran its code, which is the
> most re-usable thing in this document.
>
> ⛔ **AND THE SECOND HALF IS THE ONE A READER WILL MISS: the bridge is now MUCH LESS IMPORTANT
> THAN IT WAS, because nothing dispatches into it any more.** Measured 2026-08-19:
> `handrail.create` has **ZERO production dispatchers** (§3.1b). The plan tool moved to the L2
> command path (L-982) because the bus payload cannot carry a catalogue type at all; the 3-D tool's
> junk telemetry call is deleted (L-985); `HandrailPlacementTool` (`plugins/handrail/src/tool.ts:33`,
> the only remaining `handrail.create` call site) is **never constructed anywhere** — zero hits
> repo-wide outside its own barrel re-export; and the AI cannot reach it either, because
> `ChatCommandClassification.ts:59-72` files `handrail.create` under **class B, "needs design"**,
> blocked on a per-family placement grammar. **The bridge is live code on a road with no traffic.**
> That is a disposition, not a deletion licence: it is the declared migration target (C11 §11.9),
> and the map below stays because the day something dispatches again, every row must already be
> honest.

The bridge is `apps/editor/src/engine/initTools.ts:1959-2073` (`§FT-HANDRAIL`), subscriber `:1969`.

> ⚠ **These line numbers drifted twice during a single working session** — `initTools.ts` is a
> 2000-line file nine lanes touch. They were re-measured and re-verified by a checker immediately
> before this stamp, but **grep the `§FIX-HANDRAIL-BRIDGE-*` tags, not the numbers**: the tags are
> stable and the numbers are not. This is the C85 lesson (67 filename citations, several stale)
> arriving on schedule.
Source fields are those `CommandEventBridge.ts:886-913` forwards on `handrail.created`.

| Source field | Bridge line | **Disposition** | Note |
|---|---|---|---|
| `id` | `:2034` | **CARRIED** | — |
| `levelId` | `:2035` | **CARRIED** | also written to `parentId` `:2036` |
| `path[0]`, `path[last]` | `:2038-2041`, `:2036-2039` | **CARRIED** → `baseLine` | including `.y` on both endpoints |
| **`path` when N > 2** | `:1993-2002` | ⛔ **REFUSED BY NAME** | ✅ **D1 CLOSED.** No record is created; the message states the point count, the 2-tuple limit and what the old code silently did instead |
| `height` | `:2042` | **CARRIED** | `?? 1.0` |
| `diameter` | `:2031`, `:2043-2044` | **TRANSFORMED** | ✅ **D3 CLOSED.** Written to **both** `thickness` and `railDiameter`, because each profile branch reads a different one |
| `shape` | `:2019-2021` | **TRANSFORMED** | ✅ **D2 CLOSED.** `round → round`; `square`/`flat` → `rectangular`. The unsatisfiable `'rectangular'` ternary is gone. ⚠ The mapping is total but **lossy**: `square` and `flat` are not distinguishable in `HandrailData.railProfile`, whose vocabulary is `'rectangular' \| 'round'`. Declared, not hidden — §9.1 |
| `materialId` | `:2061` | **CARRIED** (optional) | — |
| **`baseOffset`** | `:2045` | ⛔ **DROPPED — hard-coded `0`** | **D6 STILL OPEN.** The catalogue value never crosses. A `glass-channel` type declaring a 30 mm base shoe seats flush |
| **`fillType`** | `:2060` | ⚠ **CONSTANT `'baluster'`** | **D4 PARTIALLY CLOSED.** The geometry divergence is gone — plan and 3-D now build the same mesh count and export the same IFC `PredefinedType` — but the value is a **constant, not the authored one**, because `CreateHandrailPayload` has no `fillType` field to author. A glass guardrail dispatched on the bus still arrives as a balustrade |
| **`postSpacing`** | — | ⛔ **DROPPED — no slot in the payload** | |
| **`railProfile`** (authored) | — | ⛔ **DROPPED — no slot** | only derivable from `shape`, above |
| **`materialColor`** | — | ⛔ **DROPPED — no slot** | **D7 STILL OPEN.** And per §9.2 `materialColor` is the ONLY thing the live builder reads for colour besides a repository `materialId` |
| **`balusterShape` / `balusterWidth` / `balusterSpacing` / `infillMaxGap`** | — | ⛔ **DROPPED — no slot** | added to `HandrailData` and to the L2 command by L-983; the bus payload never learned them |
| **`suppressStartPost`** | — | ⛔ **DROPPED — no slot** | so a multi-segment run cannot be authored across this bridge at all |
| `hostId` | — | ⛔ **DROPPED** | forwarded by CEB (`:906`), never written by the bridge. ⇒ a bus-created handrail has no host, so §8's cascades could not find it even if they ran |
| `properties` | `:2062` | **TRANSFORMED** | always `{}` |

⇒ **9 CARRIED/TRANSFORMED · 9 DROPPED · 1 REFUSED.** The remaining drops are **not** the bridge's
fault in the sense D1–D4 were: nine of them have **no field in `CreateHandrailPayload` to carry**.
⛔ **The fix is therefore NOT to widen the bridge's hand-written list** — that mints another
named-subset re-emit. Per C84 §7 the payload and the bridge must become a **declared, gated field
map** where every field is carried or **declared dropped**, checked by
`check-bridge-field-coverage.ts`. Until then the honest statement is the one above: **the bus path
can express roughly half of a handrail, and the half it cannot express is the half a catalogue type
is made of.** That is precisely why L-982 routed the plan tool around it.

---

## 6. Verbs

| Verb / command | Lineage | Handler | `affectedStores` | WRITTEN | RESTORED | Equal? |
|---|---|---|---|---|---|---|
| **CREATE (live)** | **L2** | `CreateHandrailCommand` | `['handrail','level']` | legacy + semantic graph | own `undo` | ✅ |
| **CREATE RUN (live)** ⭐ NEW | **L2** | `CreateHandrailRunCommand.ts:98` | `['handrail','level']` | legacy, via N `CreateHandrailCommand` children | `undo` reverses the children in reverse creation order | ✅ **one gesture = ONE undo entry (C16 §8.6)** |
| **DELETE (live)** | **L2** | `DeleteHandrailCommand` / `DeleteElementCommand:513-529` | `['handrail']` | legacy + graph | ✅ `_captureRelationships`, verbatim restore | ✅ |
| **UPDATE / RETYPE (live)** | **L2** | `UpdateHandrailCommand` | `['handrail']` | legacy | `restoreSnapshot` from a full JSON snapshot | ✅ |
| `handrail.moveBaseLine` | **L3/L4** | `initBusHandlers.ts:1128` | `['handrail']` | legacy via `_cmExec` | hand-forged `PatchPair` | ⚠ two mechanisms, one gesture |
| `handrail.updateColor` | **L3** | `initBusHandlers.ts:1427` | `[] as const` | legacy via `_cmExec` | no `undoPatch` | ⚠ relies wholly on L2's stack |
| `element.changeType` (railing branch) | **L3** | `initBusHandlers.ts:1952-1971` | via `UpdateHandrailCommand` | legacy | L2 snapshot | ✅ **and it now carries the infill fields (L-984)** |
| `handrail.create` | **L1** | `CreateHandrail.ts:30` | `['handrail']` | plugin DTO | legacy | ⛔ disjoint — **and now DORMANT: 0 dispatchers (§3.1b)** |
| `handrail.delete` | **L1** | `DeleteHandrail.ts:19` | `['handrail']` | plugin DTO | legacy | ⛔ disjoint + DORMANT |
| `handrail.setPath` / `setShape` / `setHost` / `recompute` | **L1** | `plugins/handrail/src/handlers/` | `['handrail']` | plugin DTO | legacy | ⛔ DORMANT |
| `handrail.setMaterial` | **L1** | `SetHandrailMaterial.ts:62` | `['handrail']` | **nothing — refuses `:82-83`** | n/a | ✅ **C16 CA-18 conformant** |
| ROTATE | — | **NO VERB** | — | — | — | rotation is implicit in `baseLine` |
| PARAMETER | **L2** | `UpdateElementParameterCommand:137` | `['handrail']` | legacy | ⚠ **NOT audit-neutral — §7.3** | ⚠ |
| LEVEL CHANGE | — | **NOT MEASURED** | — | — | — | — |

> ### ⭐ EI-7a: the systemic inequality is now UNREACHABLE, and by removal rather than containment
> §7.2 recorded that all seven plugin verbs write the DTO store while `performUndo` applies the
> inverse to the LEGACY store — `WRITES ⊋ RESTORES` on every one — contained only because six were
> dormant and the seventh (`handrail.create`) was re-done into legacy by the `.created` bridge.
> **As of 2026-08-19 the seventh is dormant too**: zero dispatchers. The inequality is now
> unreachable because **nothing reaches the verbs at all**, which is a stronger statement than the
> containment was, and a weaker one than a fix. ⛔ It must not be reported as "EI-7a resolved for
> handrail". The disjoint write/restore mapping is still declared in code and would bite the day a
> dispatcher returns.

**Refusal string, `SetHandrailMaterial.ts:56-57`, verbatim — doubly honest, and still the model:**

> *"It writes the detached plugin DTO store that nothing renders (§FIX-MATERIAL-DEAD-DISPATCH). Use
> `handrail.updateColor`, which reaches handrailStore. **Note that HandrailFragmentBuilder has NO
> material-library lookup … so a catalogue materialId cannot be shown on a handrail at all** — pick
> a colour override."*

⚠ **The second sentence is now PARTLY STALE and is corrected here rather than in place** (the
string is not this lane's to edit): `HandrailFragmentBuilder.resolveColour` **does** resolve a
`materialId` through `userMaterialStore`, the Materials Repository (`§FIX-HANDRAIL-MATERIAL-ID`,
ADR-0332 §7). What remains true is the *reason* it was written: `materialColor` always wins, and a
repository material contributes **only a hex** — no roughness, metalness or transparency. So a
catalogue material still cannot be *shown* on a handrail in the sense a user means.

---

## 7. Undo / redo

### 7.1 Coverage — ✅ clean

`buildUndoStoreMap` — `performUndoRedo.ts:329` maps **both** `handrail` and `handrails` to
`w.handrailStore`. Handrail is **not** among EI-7c's seven stranded families.
`createSnapshot` — `CommandManagerImpl.ts` `optionalStores` carries `['handrail','handrailStore',…]`.
**Handrail is NOT among L-953's twelve unrecognised keys.** ✅ Both recorded per **EI-1b**.

⚠ **But `stairRailingStore` is NOT in `optionalStores`** — a stair-railing edit is not snapshot-scoped.
Adjacent family, real hole, recorded here because nobody else will (§13 item 5).

### 7.2 EI-7a — the systemic inequality holds, and is now UNREACHABLE BY REMOVAL

> ⚠ **Re-measured 2026-08-19.** The paragraph below is unchanged and still describes the
> declared mapping. What changed is the traffic: **all seven plugin verbs now have ZERO
> dispatchers** (§3.1b), so the inequality cannot be reached at all. ⛔ That is *stronger*
> than the containment described below and *weaker* than a fix — it must NOT be reported as
> "EI-7a resolved for handrail". The disjoint WRITE/RESTORE mapping is still declared in
> code and would bite the day a dispatcher returns. See §6.

All seven plugin verbs write the DTO store; `performUndo` applies the inverse to the **legacy** store.
`WRITES ⊋ RESTORES` on every one. Six are DORMANT and one refuses, so **the inequality is currently
unreachable through the UI** — a containment, not a fix. ⇒ **`handrail.create` is the single live
instance**, and it is contained only because the `.created` bridge re-does the write into legacy.

### 7.3 Audit envelope across undo — ADR-0319 §2

`UpdateElementParameterCommand.captureWallAudit` `:410-419` gates on `wall` / `door` / `window` only;
handrail returns `null`. Its own concession `:213-219` names the uncovered families. Handrail **is**
routed for the write (`:137`) but its undo is **not audit-neutral**: the restore at `:432-445` is
hard-coded to `wallStore.update(..., true)`.

**⇒ a handrail parameter undo ratchets `metadata.version`.** Governed by
[ADR-0319 §2](../adrs/ADR-0319-audit-fields-are-derived-not-authored.md) DERIVED-BUT-CAUSAL —
*"a counter that ratchets through an undo/redo cycle means the model is not the same model … a real
defect, not a tolerance candidate."* **NOT C75.**

⚠ **DISCREPANCY, recorded not resolved.** [ISSUE-LOG L-952](../../04-reference/ISSUE-LOG.md) names
**eight** ratcheting families including `handrail`. The gate at `:414-418` names **three covered**
families; an eight-member uncovered list was **not found in code**. The membership finding (handrail is
uncovered) is CONFIRMED; **the "eight" figure is NOT MEASURED.**

### 7.4 EI-7e — restore, or recompute?

**Restores.** No handrail service consults `isReverting()` and none needs to — the stair→handrail
cascade never runs (§8). ✅

---

## 8. Cascades

| Cascade | Reversed? | Evidence |
|---|---|---|
| `handrail.create` → legacy store via `.created` | ✅ rides the L2 command's undo | `initTools.ts:1919-1948` |
| delete → semantic-graph edges | ✅ | `DeleteHandrailCommand.ts:42` declared, **`:91` called before `:95` remove**; restore `:54-56`. Pinned by `packages/command-registry/__tests__/handrailDeleteLeavesGraphEdges.test.ts` |
| **stair move → hosted handrail re-sample** | ⛔ **NEVER RUNS** | see below |
| **stair delete → hosted handrail cleanup** | ⛔ **NEVER RUNS — handrails are ORPHANED** | see below |
| level delete → handrail cleanup | ✅ | `HandrailLevelCleanupHandler` (`initBuilders.ts:874`); `HandrailStore.removeByLevel` (⚠ `@deprecated`) |

### 8.1 ⛔ The stair→handrail cascade is not "unreversed" — it NEVER REGISTERS

This is [C84 EI-12](C84-ELEMENT-INTEGRITY.md)'s exact shape, and it nearly bought a wrong fix here too.

- The rule exists: `plugins/cross/src/stair-handrail.ts:87` `buildStairHandrailCascadeRule`, firing
  `handrail.recompute` at `:118,130` for six stair verbs (`:34-48`).
- It is assembled: `plugins/cross/src/handlers/index.ts:111`.
- **`registerCrossHandlers` (`:105`) returns `capabilityRefusal({ reason: 'ENGINE_NOT_AVAILABLE' })` at
  `:116-131`** unless handed a `CascadeRunner`-shaped registry — detail: *"CommandBus has no cascade
  surface; production registration is deferred to BIM30 R2."*
- The host hands it the **CommandBus** (`plugins/cross/src/tool.ts:47-49`), activated from
  `PluginRegistry.ts:656-660`.
- ⛔ **The refusal is swallowed** by `.catch(this.onError)` at `tool.ts:49`, **and the console still
  prints `'cascade rules activated'` at `PluginRegistry.ts:660`.**

> ⛔ **A log line that says a subsystem activated, printed on the path where it refused, is worse than
> silence** — it is a false green a reviewer will believe. **TO-BE:** the log MUST be conditional on the
> registration result, and the refusal MUST surface. ⛔ **Do NOT "fix" this by dispatching
> `handrail.recompute`** — [C84 §8.h](C84-ELEMENT-INTEGRITY.md): the runner does not exist, so it would
> ship a no-op with a success report. The real gap is the unregistered cascade subsystem (BIM30 R2 /
> ADR-0322).

**Measured consequence, and it is user-visible:** `HandrailFragmentBuilder` subscribes to exactly three
events — `bim-handrail-added/updated/removed` (`initBuilders.ts:901-906`). **No stair event reaches this
family.** A handrail whose `hostId` is a stair does **not** re-sample when the stair moves.
*(The `StairRailingBuilder` family DOES re-sample, inside `MoveStairCommand`'s single undo entry — a
different family, correctly wired. §1.1.)*

### 8.2 ⛔ Stair delete orphans hosted handrails, and the stated mitigation does not exist

`plugins/cross/src/stair-handrail.ts:25-30` declares the exclusion deliberately:

```
//   • stair.delete   — handrail lifecycle managed by the host plugin
//                      (orphan handrails are pruned by a separate
//                      garbage-collect pass, not the cascade).
```

**No such garbage-collect pass exists.** The only handrail lifecycle cleanup is **level-scoped**
(`HandrailLevelCleanupHandler`, `HandrailStore.removeByLevel`); **neither keys on `hostId`.**
⇒ **deleting a stair leaves its handrails floating.** ⛔ **A comment naming a mechanism that does not
exist is [C84 §8.d](C84-ELEMENT-INTEGRITY.md) at its worst** — it converted an open defect into a
closed-looking one. **TO-BE:** build the pass, or delete the sentence and log the defect.

---

## 9. Vocabularies

### 9.1 Shape — ⚠ PART-CLOSED, and the residue is a LOSSY MAPPING, not an unbuildable affordance

**Was:** `z.enum(['round','square','flat'])` (`Handrail.ts:7`) against a bridge whose `railProfile`
was the constant `'round'` — **2 of 3 shapes silently substituted**, worse than lighting's EI-3
because that one at least refuses.

**Now** (`initTools.ts:1996-1998`, §FIX-HANDRAIL-BRIDGE-PROFILE): `round → round`,
`square`/`flat` → `rectangular`. **Total in the correct direction, and no longer a constant.**
⚠ **But it is LOSSY, and that is declared rather than hidden:** `HandrailData.railProfile` is
`'rectangular' | 'round'` — a two-member vocabulary — so `square` and `flat` **collapse onto one
value and cannot be told apart downstream.** A user who asked for a flat strap rail and one who
asked for a square bar get the same record.

⛔ **The fix is NOT to widen the mapping.** It is to decide whether `HandrailData` carries the L0
vocabulary (three members) or the L0 schema carries the legacy one (two). Two vocabularies for one
concept is C84 **EI-8**; picking either is fine, keeping both is not.

### 9.2 THREE material vocabularies coexist in one family

| # | Vocabulary | Site | Live? |
|---|---|---|---|
| **V5** | `materialName?: 'steel'\|'chrome'\|'wood'\|'timber'\|'concrete'\|'glass'` | `packages/core-app-model/src/stores/HandrailTypeStore.ts:28` (header `:16-27`) | ✅ live — **stair-railing only** |
| **V3** | constant hex, key discarded | `plugins/handrail/src/committer/material-bridge.ts:5-7` | ⛔ dead |
| — | raw `materialColor` string | `HandrailFragmentBuilder.ts` — **no library lookup at all** | ✅ **the live handrail path** |

**V5's header, `HandrailTypeStore.ts:19-26`, verbatim:**

> *"`materialColor` is a render tint; it is not a material. The stair-railing family
> (`StairRailingBuilder.makeMaterial`) is driven by a NAME … because **the name carries roughness /
> metalness / transparency**, not just a hue."*

⛔ **[C84 EI-8](C84-ELEMENT-INTEGRITY.md) forbids collapsing V5 to a hex, and that prohibition STANDS —
but its stated justification is CONTRADICTED by the code it names, and the contradiction must be
recorded rather than inherited.** `StairRailingBuilder.makeMaterial` (`:1141`) is `:1142-1145`:

```ts
const colors: Record<string, number> = {
    steel: 0x888899, wood: 0x8B5E3C, timber: 0x8B5E3C,
    concrete: 0xaaaaaa, chrome: 0xccccdd, glass: 0xaaddff
};
```

**A bare hex map. No roughness, no metalness, no transparency** — and `wood === timber === 0x8B5E3C`,
so **the six-value enum has five distinct outcomes**.

> **The header is ASPIRATIONAL, not DESCRIPTIVE — and that is exactly why the prohibition must hold.**
> The physical semantics V5 exists to carry are **specified and unimplemented**. Collapsing V5 to a hex
> would make the loss permanent by erasing the only place the intent is written down.
> **TO-BE:** ⛔ **do not design the V1-V5 unification here — lane ZA owns it.** C95 owes ZA two facts:
> **(a)** V5 is the only vocabulary carrying physical intent and MUST survive; **(b)** its
> implementation is a colour map today, so ZA is implementing the header, not preserving the code.
> ⚠ **`glass: 0xaaddff` is opaque** — the one member whose name is unambiguously about transparency
> renders solid.

⛔ **`materialId` cannot be shown on a handrail at all** — `SetHandrailMaterial.ts:57` says so. A
catalogue material assigned to a handrail is inert. **EI-3: the panel MUST NOT offer it** (C82).

---

### 9.3 ⭐ The type catalogue — 20 built-ins, and what a type CANNOT say

`HandrailTypeStore` ships **20** built-in `HandrailTypeDefinition`s (founder, 2026-08-18) — wall's
`WallSystemTypeStore` twin, and the store the creation panel reads, so the create list and the
retype list cannot differ (**EI-9**). The **5 pre-existing ids are kept verbatim**: saved projects
reference them, and dropping an id for a nicer name is a silent data loss (**EI-6** — absence must
be loud).

**A type is MATERIALISED, never REFERENCED.** `PropertyPanelTypeSelector.ts` states the family's
rule: *"HandrailData carries no `typeId`, so a railing type is materialised into the record."*
⛔ No `systemTypeId` field was minted — a second answer to *"what type is this railing?"* would be
EI-9. The consequence is declared, not hidden: the retype widget resolves "current" by **matching
the record's materialised fields against the catalogue**, so a railing whose fields were edited
individually matches nothing and the dropdown opens on no selection. Honest — but it means the
model cannot answer *"which catalogue entry was this?"* after any manual edit.

**The builder implements FOUR infills** — `glass`, `panel`, `baluster`, `open`. Several real railing
families have an infill outside that set. Each is mapped to the nearest BUILDABLE one and **the
substitution is stated in the description the user reads** (§12 R10-R14): cable strands → `open`;
mesh weave and perforation → `panel`; pipe mid-rails → `open`. A catalogue that pretended otherwise
would be an affordance with no implementation (C65 §3.9 / C84 **EI-3**), and silent, which is the
worst form of it.

⚠ **`thickness` is the RAIL SECTION, not the glass.** Measured: the rectangular top rail is
`BoxGeometry(len, 0.05, handrail.thickness)`; the glass infill's depth is a hard-coded `0.01` and a
solid panel's is `thickness * 0.4`. **A glass type cannot express "17.6 mm laminated."** Declared in
the type-library header, not faked in the data.

⭐ **`infillMaxGap` is a CONSTRAINT, not a second name for the pitch.** Guarding codes state the
rule as *"a sphere of D mm must not pass"*; the pitch is centre-to-centre. `clear gap = pitch −
balusterWidth`, so the builder derives `pitch = maxGap + width` **only when no pitch is authored**.
An authored pitch always wins, which is why no existing handrail changed shape — asserted by a test
that pins the authored-pitch case at its old mesh count.

## 10. Geometry

| Axis | AS-IS |
|---|---|
| **Stack A (live)** | `HandrailFragmentBuilder.ts` — `:135` destructures `baseLine` to **exactly two points**; `:136-137` `dx`/`dz` **only**; `:138` planar length; `:189` `root.rotation.y = -angle` — **one rotation axis, no pitch** |
| **Stack B (dead)** | `producers/handrail.ts:81` — slope (`:94-96`, reads `p.y`), N-point sweep (`:100-126`), vertical-tangent frame (`:73-79`) |
| **Third stack (unwired)** | `packages/geometry-stair/src/HandrailRunGeometry.ts` — 338 lines, 282 lines of spec, **one importer: its own test** |
| **Proven to agree?** | ⛔ **NO, and they cannot be** — Stack A is 2-point planar, Stack B is N-point sloped. `tests/parity/handrail/cw-snapshot.test.ts:7` imports **`produceHandrail`** — it snapshots the **DEAD** stack against itself. **[C84 §8.e](C84-ELEMENT-INTEGRITY.md): a parity test that compares a stack to itself does not satisfy EI-11.** It cannot catch D1-D4 |
| **Datum** | `HandrailFragmentBuilder.ts:143-145` — **Y = `level.elevation + (handrail.baseOffset ?? 0)`**, set on the root group at `:186`; members placed in the group's local frame (`:222` rail at `y = handrail.height`, i.e. **height is top-of-rail from the base**). **`baseLine[i].y` is carried into the record and never read** |

### 10.1 ⛔ Plan and 3D use the same datum FORMULA and different INPUTS — five divergences

| Input | Plan (`RailingPlanToolHandler.ts`) | 3D (`HandrailTool.ts`) |
|---|---|---|
| `height` | **`:15` `const DEFAULT_HEIGHT = 1.1;`** hard-coded, used `:98` | `:146` `typeDef?.height ?? 1.0` |
| `diameter` | **`:16` `const DEFAULT_THICK = 0.05;`** hard-coded, used `:99` | `:140-155` from the selected type |
| `baseOffset` | bridge forces **`0`** (`initTools.ts:1941`) | `:148` `typeDef?.baseOffset ?? 0` |
| `fillType` | **absent** ⇒ 3 meshes | `?? 'baluster'` |
| `railProfile` | constant `'round'` (D2) | from the type |

**The plan tool imports no `handrailTypeStore` and has no `_selectedTypeId`. It cannot express any
catalogue type.** Even with no type selected the two paths disagree on height — **1.1 vs 1.0**.

⛔ **This is EI-9 — one question ("what handrail did the user ask for?"), two answers, selected by which
view they happened to be in.** ⚠ **`baseOffset` forced to 0 is a SIXTH bridge defect, not among the four
named in the brief.**

> ### ✅ CLOSED 2026-08-19 (L-982) — and the literals were DELETED, not re-synchronised
> `RailingPlanToolHandler` now resolves **every** field from `HandrailTypeStore` through
> `resolveArmedHandrailSpec()`, the ONE resolution shared by the preview and the commit — so the
> ghost can never describe a rail the command will not build. `DEFAULT_HEIGHT = 1.1` and
> `DEFAULT_THICK = 0.05` are **gone from the file**, not kept in step by a comment (C84 §8.d). The
> un-typed fallback is `1.0 / 0.05`, which is `HandrailTool`'s own `typeDef?.height ?? 1.0`, so the
> two surfaces agree on the un-typed case too.
>
> The five divergences in the table above are now **height ✅ · diameter ✅ · fillType ✅ ·
> railProfile ✅ · baseOffset ✅ on the L2 path**. ⚠ `baseOffset` is still forced to `0` **on the
> bus bridge** (§5, D6) — but nothing dispatches into that bridge any more (§3.1b), so no user
> reaches it today. Open, and no longer what the user is losing.
>
> ⭐ **Proven at the layer the user experiences**, not at the resolver:
> `apps/editor/__tests__/HandrailCreationParityReachable.test.ts` drives a real click sequence and
> asserts the dispatched command's own payload carries the armed type's fields — including
> `expect(p.height).not.toBe(1.1)`, so the deleted literal cannot come back unnoticed.

---
## 11. THE DELTA — ordered by WHAT THE USER LOSES

> **Re-ordered and re-scored 2026-08-19 (lane HR1).** The previous ordering was by defect id. This
> one is by loss: an item that silently produces the wrong element outranks one that produces a
> right element inefficiently, and both outrank a governance item. Closed rows are kept with their
> evidence — a delta that deletes what it closes cannot be audited.

| # | Loss the USER experiences | Fix | Invariant | Status |
|---|---|---|---|---|
| **1** | *"I picked Timber Picket and got generic 20 mm balusters."* | `CreateHandrailCommand` carries the baluster members + `materialId` | **EI-2** | ✅ **CLOSED** — L-983, watched-RED (5 assertions fail pre-fix) |
| **2** | *"Retyping into Timber Picket gives a different railing from drawing one."* | the four fields carried across all four retype hops | **EI-9** | ✅ **CLOSED** — L-984, same commit as #1 so a per-path divergence never existed |
| **3** | *"The plan tool can't use any of my railing types, and it draws them 100 mm taller than 3-D does."* | both surfaces resolve from `HandrailTypeStore`; the two plan literals **deleted** | **EI-9**, C84 §8.d | ✅ **CLOSED** — L-982 |
| **4** | *"I can only draw a straight two-click rail."* | seven modes: linear / ortho / curved / by-slab / square / circular / ellipse | founder D4 | ✅ **CLOSED** — L-982, 24 reachability assertions |
| **5** | *"My guard has a doubled, z-fighting post at every corner and at the closure."* | `suppressStartPost`; one vertex, one owner | founder D4 | ✅ **CLOSED** — L-986, asserted by counting the REAL builder's meshes |
| **6** | *"Undoing a circular guard takes 32 presses."* | `CreateHandrailRunCommand` — one gesture, one entry | **C16 §8.6** | ✅ **CLOSED** — L-982 |
| **7** | *"Every rail I draw in 3-D leaks a ghost rail at the world origin."* | the telemetry mutation deleted | **EI-5**, C16 CA-17 | ✅ **CLOSED** — L-985; §13 item 1 measured first, which is what unblocked it |
| **8** | *"A 3-point rail I drew became a straight diagonal across the corner."* | refuse by name | **EI-2(d)** | ✅ **CLOSED** — `§FIX-HANDRAIL-BRIDGE-TRUNCATION`. ⚠ §0's claim that this was unfixed was TRUE when written; see §5's retraction |
| **9** | *"A square/flat rail comes out round."* | the enum mapped, the constant ternary deleted | **EI-2(b)**, EI-3 | ✅ **CLOSED** — `§FIX-HANDRAIL-BRIDGE-PROFILE`. ⚠ lossy: `square` and `flat` still collapse to `rectangular` (§9.1) |
| **10** | *"An authored 50 mm rail renders at 40 mm."* | `railDiameter` written | **EI-2(a)** | ✅ **CLOSED** — `§FIX-HANDRAIL-BRIDGE-DIAMETER` |
| **11** | *"The same line drawn in plan and in 3-D builds different geometry and exports a different IFC entity."* | `fillType` written | **EI-2(a)** | ⚠ **PARTIAL** — the divergence is gone, but the value is a CONSTANT `'baluster'`; the payload has no `fillType` (§5) |
| **12** | **Deleting a stair leaves its handrails floating.** | build the GC pass, or delete the comment that claims one exists | **EI-5**, C84 §8.d | ⛔ **OPEN** — §8.2. **The highest-value remaining user-visible loss** |
| **13** | **A handrail hosted on a stair does not move when the stair moves.** | the cascade subsystem must actually register | **EI-12** | ⛔ **OPEN** — §8.1, blocked on BIM30 R2 / ADR-0322. ⛔ Do NOT "fix" by dispatching `handrail.recompute`: the runner does not exist |
| **14** | **A stair railing re-imported from IFC comes back as a free-standing handrail.** | branch on `PredefinedType` / host, or refuse | **EI-2**, C25 | ⛔ **OPEN** — §3.3 |
| **15** | **A handrail parameter undo ratchets `metadata.version`.** | audit-neutral undo | **ADR-0319 §2** | ⛔ **OPEN** — §7.3 |
| **16** | **A catalogue `baseOffset` never crosses the bus bridge** (a channel-fixed glass guard seats flush). | carry it | **EI-2(a)** | ⛔ **OPEN** — D6, §5 |
| **17** | Handrails cannot slope; the only code that can express slope is unreachable. | wire it or declare it | **EI-12**, C72 §0.1 | ⚠ **PART-CLOSED** — `HandrailFragmentBuilder` now reads the endpoint `rise` (`§FEAT-HANDRAIL-SLOPE`), so the LIVE builder can slope. **The bus payload and both tools still author `y = 0`**, so no user can produce one (§10) |
| **18** | *(internal)* the plugin DTO store leaks monotonically. | retire it | **EI-5 / EI-5a** | ✅ **CLOSED BY REMOVAL OF ITS WRITERS** — 0 dispatchers (§3.1b). ⛔ Still to DECLARE retired in the file header; ⛔ still not to be closed by wiring `handrail.delete` (C84 §8.c) |
| **19** | *(internal)* three byte-identical snapshot implementations. | retire two, or declare why both survive | **EI-9** | ⛔ **OPEN** — L-987. Declared + pinned by an equality test; retirement needs the barrels' owner |
| **20** | *(internal)* handrail lives inside `packages/geometry-stair` with **zero** coupling either way. | own package, or a recorded reason | **EI-10** | ⛔ **OPEN — DECISION, not a fix.** L-988, §14.2 |
| **21** | *(governance)* `'railing'` is a fourth spelling of one family. | `'railing'` → `'handrail'`; drop the `elementMove.ts:126` alias | **C15 §12 / C84 §4E** | ⛔ **OPEN** — §1. ⚠ **and this lane ADDED a consumer of the alias**: `showHandrailPreDraw` seeds `elementType: 'railing'` because `buildRailingTypeSelectorWidget` gates on it. Declared, not hidden |
| **22** | *(governance)* the cascade refusal prints *"activated"*. | make the refusal loud | **EI-12** | ⛔ **OPEN** — §8.1 |
| **23** | *(governance)* the `persistence-client` duplicate pair (6 files). | declare which pair is authoritative per host, + an EI-8a equality test | **EI-9 / EI-10** | ⛔ **OPEN** — §3.2 |
| **24** | *(governance)* `stairRailingStore` absent from `createSnapshot`'s `optionalStores`. | add it | **EI-7d**, L-953 | ⛔ **OPEN** — §7.1 |
| **25** | *(governance)* `HandrailRunGeometry.ts` — 338 lines, one importer, its own test. | wire it or delete it | **EI-12**, C72 §0.1 | ⛔ **OPEN** — ⚠ **and `handrailRunGenerators.ts` now occupies part of its intended ground.** Whoever resolves #25 must reconcile the two rather than leave a fourth stack |

---

## 12. REFUSALS

**Refusals that EXIST and are correct**

| # | Refusal | Named where | Verdict |
|---|---|---|---|
| **R1** | `handrail.setMaterial` is unreachable; use `handrail.updateColor` | `SetHandrailMaterial.ts:56-57` | ✅ **EXEMPLARY** — mechanism, alternative, and a second disclosed limitation. ⚠ its second sentence is now partly stale — §6 |
| **R2** | An N > 2 path cannot be held by a 2-tuple `baseLine`, so the bridge **declines it by name** | `initTools.ts:1994-2001` | ✅ names the count, the limit, and what the old code did instead |
| **R3** | `handrail.recompute` does not fire on `stair.setType` — material-only swap, no edge motion | `plugins/cross/src/stair-handrail.ts:27` | ✅ correct and reasoned |
| **R4** | `RecomputeHandrail` refuses to write, returning a determination | `RecomputeHandrail.ts` | ✅ CA-18 conformant |
| **R5** | The six DORMANT verbs are the PRYZM-3 target vocabulary | C84 §3.5.3 | ✅ ⛔ not deletable |
| **R6** ⭐ | A handrail RUN with no buildable segment refuses, naming the first child's reason and the 0.1 m limit | `CreateHandrailRunCommand.ts` `canExecute` | ✅ **NEW** — and a partially-refused run still creates what it can and NAMES each skipped segment in `info` |
| **R7** ⭐ | BY SLAB with no slab selected refuses, naming the alternative (*"Select a slab first, or draw the guard with Linear / Orthogonal"*) | `RailingPlanToolHandler._commitBySlab` | ✅ **NEW** |
| **R8** ⭐ | A degenerate loop gesture refuses, naming both thresholds (0.2 m per axis, 0.1 m per chord) | `RailingPlanToolHandler._commitLoop` | ✅ **NEW** |
| **R9** ⭐ | No `commandManager` on the plan context ⇒ refuse and say **nothing was written directly to a store** | `RailingPlanToolHandler._dispatchRun` | ✅ **NEW** — the P6 escape hatch says which invariant it is protecting |

**Capability gaps DECLARED as refusals by the 20-type catalogue (each stated in the description the user reads)**

| # | The type says | The builder does | Verdict |
|---|---|---|---|
| **R10** | *"The horizontal cable strands are NOT modelled — posts and rail only"* (`cable-stainless`) | `fillType: 'open'` | ✅ DECLARED. `infillMaxGap` still carries the code constraint for schedules |
| **R11** | *"Modelled as a solid infill panel — the weave is not modelled"* (`mesh-infill`) | `fillType: 'panel'` | ✅ DECLARED |
| **R12** | *"the perforation pattern is not modelled"* (`perforated-panel`) | `fillType: 'panel'` | ✅ DECLARED |
| **R13** | *"Intermediate horizontal mid-rails are NOT modelled"* (`industrial-pipe`) | `fillType: 'open'` | ✅ DECLARED |
| **R14** | *"Glass thickness is not modelled"* (`glass-frameless`) | glass infill depth is the hard-coded `0.01`; `thickness` is the RAIL section | ✅ DECLARED in the type-library header |
| **R15** | BY SLAB sets the guard out on the slab EDGE, with no inset by half the rail thickness | matches wall's By Slab, which uses the wall centreline | ✅ DECLARED in `slabOutlineSegments` |
| **R16** | No `graspableProfile` field was minted; `railProfile` + (`railDiameter`\|`thickness`) IS the graspable rail's profile and section | — | ✅ DECLARED (C84 EI-8 — one vocabulary per concept) |

**⛔ NOT refusals — undeclared absences**

| # | | Verdict |
|---|---|---|
| **R17** | `stair-handrail.ts:25-30` defers `stair.delete` cleanup to *"a separate garbage-collect pass"* | ⛔ **INVALID — the pass does not exist** (§8.2). A comment naming a mechanism that does not exist converts an open defect into a closed-looking one |
| **R18** | Handrails cannot be AUTHORED sloping | ⛔ **silent gap.** The live builder gained slope (`§FEAT-HANDRAIL-SLOPE`), but every authoring path writes `y = 0`, so no user can make one. **Declare it or wire it** |
| **R19** | Handrail is absent from the bake worker | ⛔ **undeclared absence**, blocked behind ADR-0331 §D5 |

---

## 13. NOT MEASURED

**Closed since the last stamp**

1. ~~Whether `HandrailTool.ts:158`'s junk create also mints a phantom LEGACY handrail.~~ ✅ **MEASURED
   2026-08-19 — IT DOES NOT.** `CommandEventBridge` forwards `record.payload` = `{}`, so it emits
   `handrail.created` with `id: undefined`, and the bridge's first guard is `!ev.id`. Damage was
   confined to the DTO store. **This is what unblocked delta #7** (now §11 row 7).
2. ~~Whether `HandrailStore.update` merges or replaces, and whether the undo adapter declares it
   correctly.~~ ✅ **MEASURED — MERGE, AND THE DECLARATION IS CORRECT.** `HandrailStore.ts:56-66` is
   `structuredClone(existing)` then `Object.assign(updated, updates)`, i.e. a partial leaves every
   unmentioned field intact. `legacyStoreUpdateSemantics.ts:217-221` declares
   `semantics: 'merge'` citing exactly `HandrailStore.ts:56-66`. **Handrail is NOT one of L-977's
   four REPLACE stores** (slab, column, furniture, plumbing), so the "Ctrl+Z hands a partial to a
   replace store and destroys the record" failure **cannot occur on this family**.
   ⚠ Undo does not in fact go through `update()` for the two live L2 commands —
   `UpdateHandrailCommand.undo` and `DeleteHandrailCommand.undo` both call `restoreSnapshot`, which
   is a whole-record `set`. The merge semantics matter for the **patch-adapter** path
   (`performUndoRedo.ts:341`, both `handrail` and `handrails` → `w.handrailStore`).
3. ~~Whether handrail-in-`geometry-stair` is deliberate.~~ ✅ **MEASURED — ZERO coupling in both
   directions** (§14.2). Accidental co-location. **Not moved**; needs a decision.

**Still not measured**

4. **GLB export's handrail path** — handrail tokens appear only under `export/ifc/*`; whether GLB
   consumes that chain or walks the THREE scene directly was not determined.
5. **L-952's "eight ratcheting families"** — the gate names three *covered*; no eight-member
   uncovered list was found in code. The membership finding (handrail is uncovered) is CONFIRMED;
   the figure is not.
6. **`handrail.setPath` / `setShape` / `setHost` dynamic dispatch** — zero by literal grep; computed
   verb strings (`` `handrail.${x}` ``) were not swept.
7. **`stairRailingStore` snapshot-coverage consequences** — its absence from `optionalStores` is
   measured; what breaks on a failed stair-railing execute is not.
8. **An end-to-end RUNTIME handrail undo** — the map entry exists and `CreateHandrailRunCommand.undo`
   is proven against the REAL `HandrailStore` in `handrailTypeMaterialisationAndRun.test.ts`, but
   **not** driven through `performUndo` with a live ring buffer. Per C16 CA-21 a declaration is not
   a proof, and neither is a direct `.undo()` call.
9. **Persistence of the new fields** — `serializeHandrailSnapshot` is proven whitelist-free
   (L-987), so UNDO carries them. **`ProjectSerializer` / `ProjectLoader` were NOT checked**, and
   L-999 is this exact defect on wall: four hand-written whitelists, all omitting one field.
   ⛔ **Assume `infillMaxGap`, `suppressStartPost` and the baluster members do NOT survive
   save/load until someone measures it.** This is the largest honest hole this lane leaves.
10. **`HandrailFragmentBuilder` baluster arithmetic beyond the pitch** — the `infillMaxGap`
    derivation is proven by mesh count; end-margins and the `count = floor(len/pitch) - 1`
    convention are not independently verified against a drawing standard.
11. **`handrail` level-change** — whether `element.changeLevel` has a branch.
12. **Sub-part tagging** — whether `HandrailPart` carries `role` / `parentId` per C15 §12.
13. **The 3-D `HandrailTool` still offers only ONE gesture.** The seven modes are PLAN-side. The 3-D
    tool reads the armed TYPE (via `window.handrailTool.setTypeId`) but not the armed MODE, so
    `elementCreationMatrix`'s `views: ['plan','3d']` for the railing row is **true of the tool and
    false of the modes**. Declared here rather than fixed; it is the honest half of §14.1.
14. **`pryzm-selfhost`** — no such directory under the repo root.

---

## 14. THE AUTHORING SURFACE — ⭐ NEW (founder, 2026-08-18)

### 14.1 Creation modes

| Mode | Key | Gesture | Commits as | Reachable |
|---|---|---|---|---|
| Linear | **L** | click, click… (chains) | one `CreateHandrailCommand` per segment | ✅ plan |
| Orthogonal | **O** | as Linear, 90°-constrained | one per segment | ✅ plan |
| Curved | **C** | start, arc mid-point, end | ONE `CreateHandrailRunCommand` (flattened Bézier) | ✅ plan |
| By Slab | **S** | select a slab, click | ONE run around its ring | ✅ plan |
| Square | **Q** | two opposite corners | ONE run, closed | ✅ plan |
| Circular | **R** | centre, rim | ONE run, closed | ✅ plan |
| Ellipse | **E** | centre, bounding corner | ONE run, closed | ✅ plan |

L / O / C are **spread from the wall's own `WALL_DRAW_MODES`**, so the two bars cannot drift.
The mode ids are `HandrailRunMode` in `@pryzm/geometry-stair`, the module that turns each into
geometry — the bar cannot offer a mode the generator does not implement.

**THE JOIN, which is the part that is easy to get wrong.** `HandrailFragmentBuilder` posts BOTH
ends of every segment, so a shared vertex takes two coincident posts unless someone owns it.
`suppressStartPost` gives each vertex exactly one owner: in an OPEN run only the first segment
keeps its start post; in a CLOSED run none does, because the last segment's END post already stands
on the first's start. Both cases: `|posts| = |distinct vertices|`, asserted by counting the meshes
the REAL builder emits, with the naive 8-post case kept as a live control.

⛔ **NOT DONE, stated plainly: the 3-D `HandrailTool` still has ONE gesture.** See §13 item 13.

### 14.2 Package location — MEASURED, and it is a decision, not a fix

Every other family has `packages/geometry-<family>`. Handrail does not: five source files sit in
`packages/geometry-stair/`.

* **handrail → stair: ZERO.** `HandrailFragmentBuilder`, `HandrailTool`,
  `HandrailLevelCleanupHandler`, `handrailSnapshotUtils`, `handrailRunGenerators` import only
  `@pryzm/core-app-model`, `@pryzm/renderer-three`, `@pryzm/command-registry`, `@pryzm/snapping`,
  `@thatopen/components`. No `./Stair*` import exists.
* **stair → handrail: ZERO.** The only `./Handrail*` references in the package are five re-export
  lines in `index.ts`. `StairRailingTypeMapping.ts` and `StairRailingTypes.ts` import
  `HandrailTypeDefinition` from `@pryzm/core-app-model` — the shared catalogue, not the neighbour.

⇒ **The co-location is ACCIDENTAL.** ⚠ This is **not** the same question as §1.1's three railing
CONCEPTS: `StairRailingBuilder` is a genuinely different family that belongs in `geometry-stair`.
⛔ **Not moved.** A move needs a new workspace (an unsynced `pnpm-lock` breaks `--frozen-lockfile`
for every concurrent lane) plus four import sites, two of them in orchestrator-owned files.
**Decision required: create `packages/geometry-handrail`, or record the co-location as deliberate
with a stated reason.** The one answer that must not stand is the current one — no reason recorded.

---

# 15. THE FULL RAILING SPECIFICATION — founder, 2026-08-19

> **Status: NORMATIVE (TO-BE). This section supersedes the narrower 2026-08-18 brief.**
> Every clause is marked **MUST** / **MUST NOT** / **SHOULD**, and every AS-IS statement carries a
> `file:line` that was opened. Where a decision is the founder's to make, it is raised as a
> **⛔ DECISION** and **not silently picked** — that is the C84 §8.d failure this family has already
> paid for twice (the garbage-collect pass that does not exist; the cascade that logs "activated"
> while refusing).

**The request, in substance:**

> *"The handrail element should behave for STAIRS **and** as a STANDALONE element. It should have
> **all the capabilities the wall element has** — creation via UI (line, ortho, curved, same panel),
> handrail type selection with the 20+ types, and the possibility to **duplicate and create NEW
> types**. The handrail could be **raked, curved**, etc. The user should be able to change the
> **distance between the vertical railings — like mullions on a curtain wall** — every 10 cm, every
> 20 cm. The user should be able to decide **if there is panelling within the vertical mullions**,
> and the **materials**. All of this via the **properties panel** and via **RAC**. Materials from
> the **material library — check C100**. The user could select a slab and ask via RAC: **'create a
> railing on the edge of this slab'** / **'…on the edge of the slab that doesn't have walls'**.
> **BIM 3.0 oriented — conscious about every other element.**"*

---

## 15.0 THE TWO QUESTIONS THE PREVIOUS BRIEF LEFT OWED — ANSWERED

### Q1. Is handrail living inside `packages/geometry-stair/` a defect or deliberate co-location?

**A DEFECT. Measured, both directions, zero coupling either way** — full evidence in §14.2.
Five handrail files sit in `packages/geometry-stair/src/` and import **nothing** from any `./Stair*`
module; the only `./Handrail*` references in the whole package are **five re-export lines in
`index.ts`**. The two stair files that mention "Handrail" read `HandrailTypeDefinition` from
`@pryzm/core-app-model` — the shared catalogue, not the neighbour.

⭐ **RECOMMENDATION, and this section is why it changed from "cosmetic" to "load-bearing":** the
founder now requires handrail to be a **first-class standalone family with wall-parity capability**
— its own creation modes, its own type authoring, its own rake/curve model, its own panel model, its
own RAC surface. That is a *family-sized* subsystem living inside another family's package, and
every item in §15 makes the mismatch worse. **Create `packages/geometry-handrail`.**

⚠ **Cost, stated so the decision is informed, not sold:** a new workspace manifest + tsconfig, a
`pnpm-lock` sync (**an unsynced lockfile breaks `--frozen-lockfile` for every concurrent lane**), and
four import sites — **two of them in orchestrator-owned files** (`initBuilders.ts` ×2,
`initTools.ts` ×1). It is a mechanical change with a coordination cost, not a risky one.
⛔ **Not started without a decision** (ISSUE-LOG L-988).

### Q2. Does `HandrailStore.update` MERGE or REPLACE, and is it declared correctly?

**MERGE — and the declaration is CORRECT.** Measured 2026-08-19:

```
packages/core-app-model/src/stores/HandrailStore.ts:56-66
    update(id, updates: Partial<HandrailData>) {
        const handrail = this.handrails.get(id);
        if (!handrail) return undefined;
        const updated = structuredClone(handrail);   // :60
        Object.assign(updated, updates);             // :61  ← MERGE
        …
```

`apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts:217-221` declares
`handrail: { semantics: 'merge', evidence: 'HandrailStore.ts:56-66 (structuredClone + Object.assign)' }`.
**The declaration names the exact lines and the exact mechanism, and both are right.**

⇒ **L-977's failure mode CANNOT occur on this family.** That defect is a store whose `update()`
REPLACES being handed a one-key partial by the undo adapter, leaving the record as `{ <field>: v }`.
Handrail is **not** among the four REPLACE stores (slab, column, furniture, plumbing). **"Ctrl+Z on a
railing edit destroys the record" is REFUTED.**

⚠ **Two honest qualifications, because the clean answer is the one most likely to be over-read:**
1. The two live L2 undo paths **do not go through `update()` at all** —
   `UpdateHandrailCommand.undo` and `DeleteHandrailCommand.undo` both call `restoreSnapshot`, a
   whole-record `set` from a JSON snapshot proven whitelist-free (L-987). The merge semantics matter
   for the **patch-adapter** path (`performUndoRedo.ts:341`).
2. **NOT MEASURED:** an end-to-end runtime undo driven through `performUndo` with a live ring
   buffer (§13 item 8). A direct `.undo()` call is proven; the adapter path is declared.

---

## 15.1 R1 — STANDALONE **and** STAIR-HOSTED, with the difference DECLARED

**AS-IS.** There are three railing concepts and only one is this family (§1.1). The free-standing
`HandrailFragmentBuilder` family is the subject here. `HandrailData` carries **no `hostId`** — the
field exists on the *plugin DTO* (`plugins/handrail/src/store.ts`) and is **DROPPED by the bridge**
(§5), so **no handrail in the authoritative store has ever had a host**. That is why §8's cascades
could not find one even if they ran.

| Property | Standalone | Stair-hosted (TO-BE) |
|---|---|---|
| `baseLine` | authored | **DERIVED** from the stair's flight edge; re-sampled on stair move |
| `height` | authored / from type | authored / from type (independent) |
| `baseOffset` | authored / from type | **DERIVED** — rides the tread nosing line |
| rake / slope | authored (§15.4) | **DERIVED** — equals the flight pitch |
| type, spacing, infill, materials | authored | authored (independent) |
| level | authored | **DERIVED** from the host |

**MUST**: `HandrailData` gains `hostId?: string` and `hostKind?: 'stair' | 'slab'`, and the bridge
and every creation path carry it (it is an EI-2 drop today).
**MUST**: a hosted railing's DERIVED properties are recomputed, never authored — a user edit to a
derived property **MUST refuse by name** and say which host owns it (C16 CA-18).
**MUST (EI-5)**: deleting the host deletes its hosted railings **in the same undo entry**.
⛔ §8.2's comment claims a garbage-collect pass does this. **No such pass exists.** Delete the
comment or build the pass — a comment naming a mechanism that does not exist is worse than silence.
**MUST (EI-12)**: the stair→handrail cascade **MUST NOT** be "fixed" by dispatching
`handrail.recompute`; the CascadeRunner does not exist (§8.1) and that would ship a no-op with a
success report. The real gap is the unregistered cascade subsystem (BIM30 R2 / ADR-0322).

---

## 15.2 R2 — CREATION UI AT WALL PARITY ✅ **LANDED**, with the mode set reconciled

The founder named **line, ortho, curved**. The lane shipped **seven** (§14.1). Reconciliation,
stated so nobody has to guess which were asked for:

| Mode | Origin | Status |
|---|---|---|
| Linear · Orthogonal · Curved | **founder-named**, spread from wall's `WALL_DRAW_MODES` | ✅ landed |
| By Slab | wall's own ACTION, and R8's UI-side twin | ✅ landed |
| Square · Circular · Ellipse | **added by this lane** (2026-08-18 brief) | ✅ landed |

**MUST**: the panel is the wall panel's shape (badge, ready-hint naming the armed type, dropdown fed
**from the store**, Esc note) — ✅ `showHandrailPreDraw`.
⛔ **NOT DONE:** the **3-D tool still has ONE gesture** (§13 item 13). The matrix row claims
`views: ['plan','3d']`, which is **true of the tool and false of the modes**.

---

## 15.3 R5 — POST SPACING, PARAMETRIC — ⛔ THE END CONDITION IS A DECISION, NOT AN IMPLEMENTATION

**AS-IS, and it is worse than "unspecified".** `HandrailFragmentBuilder` places posts at
`i * spacing` for `i` in `1..floor(length/spacing) - 1`, plus the two ends. **The `- 1` is
unexplained and it is wrong at the boundary:** on a 4.0 m run at 1.0 m spacing it emits interior
posts at 1, 2 and 3 m — correct — but on a 4.001 m run it emits the same three, leaving a 2.001 m
final bay. **The last bay is silently up to twice the authored spacing.** The same `- 1` governs
balusters.

**⛔ DECISION REQUIRED — three defensible conventions, and they give different buildings:**

| | Rule | Consequence |
|---|---|---|
| **A · FIXED PITCH, short last bay** | posts every `s`; the remainder is one short bay | spacing is exactly as authored; the end bay is ragged |
| **B · REDISTRIBUTE** | `n = ceil(L/s)` bays of `L/n` each | every bay equal, actual pitch ≤ authored — **this is what most guarding schedules assume** |
| **C · CENTRED** | fixed pitch, equal short bays at BOTH ends | symmetrical; two odd bays |

**SHOULD: B**, because the founder's framing is *"every 10 cm, every 20 cm"* — a **maximum** clear
spacing, which is also how `infillMaxGap` already reads the code rule (§9.3). Under B the authored
value is an upper bound that is never exceeded, which is the safe direction for a guard.
⛔ **Not applied without the founder's word**, because A is what the code does today and switching
silently would move every existing baluster.

**MUST**: post positions are a **PURE FUNCTION** of `(run, spacing, endCondition)`.
⛔ **MUST NOT** copy `migrateToGridSystem`'s shape: it mints `crypto.randomUUID()` on nine `??` call
sites, a **C73 §1.1** determinism violation that L-1051 proved made a delete button dead for every
wall with no stored grid. **A railing's posts get no identity from a random source.** If a post ever
needs an id it is `derivedPostId(railId, index)`, exported so no caller transcribes the format —
exactly the fix CW1 landed for grid lines.
**MUST**: `postSpacing` and `balusterSpacing` are authored on the INSTANCE, not only on the type
(the founder's "the user should be able to change…"), and reach the record through the same command
that carries the rest of the type (`UpdateHandrailCommand` already has both).

---

## 15.4 R4 — RAKED AND CURVED — ⛔ ONE DECISION, AND ONE MODULE TO WIRE RATHER THAN REWRITE

**AS-IS: three stacks, and the capability exists twice unreachably (§10).**
`HandrailFragmentBuilder` gained endpoint slope (`§FEAT-HANDRAIL-SLOPE`) — the LIVE builder can
follow a rise. **But every authoring path writes `y = 0`**, so no user can produce one (§12 R18).

⭐ **`HandrailRunGeometry.ts` ALREADY IMPORTS `rakeShearPerMetre`** — measured: it is one of the
eight consumers of `WallRake.ts:245`. **So R4 is a WIRING task, not a geometry task**, and the
instruction "do not mint a ninth copy of `cot(rake)`" is already satisfied by the module that exists.
⛔ **MUST NOT** write a new rake helper. **MUST** either wire `HandrailRunGeometry` or delete it and
move its rake consumption into the live builder — §11 row 25 requires that decision anyway, and
`handrailRunGenerators.ts` now occupies part of its intended ground. **A fourth stack is forbidden.**

> ### ⛔ DECISION — a rake on an ARC is a CONICAL SURFACE, not a shear
> RK1 measured the wall case: `WallRake`'s vocabulary takes a **single `direction`**, an arc has
> none, and all four curved×raked wall cells measure `lean = 0.000`. **The identical question
> applies to a curved raked railing**, and the two answers build different objects:
> - **KEEP THE RADIUS** — the rail leans outward by `k·h` along the *local* normal at every station,
>   so the top rail is a circle of radius `r + k·h` in a higher plane. Simple, and each post leans
>   the same amount.
> - **SWEEP CONICALLY** — the run is a frustum element; the top rail's radius varies if the rake
>   direction is not radial, and posts are not parallel.
>
> **This is the founder's call. It is raised, not picked.** Whichever is chosen MUST be recorded here
> before implementation, and the *other* MUST be refused by name if a user asks for it.

---

## 15.5 R6 — INFILL PANELLING — AND THE HOP IT MUST NOT DIE AT

**The founder's analogy is exact:** *"like mullions on a curtain wall"* — posts are mullions, the
infill between them is a panel. **MUST reuse C87's vocabulary** (bay/spacing, panel kind, per-panel
material), **MUST NOT** mint a rival one (C84 EI-8).

**AS-IS.** `HandrailFillType` is `'glass' | 'baluster' | 'panel' | 'open'` — **one value for the
WHOLE run**. There is no per-bay panel, no per-panel kind and no per-panel material.

**TO-BE — MUST:**
- `HandrailData.panels?: HandrailPanel[]`, one per bay, each `{ index, kind, materialId?,
  overrideColor? }`, where `kind` reuses the curtain-wall panel vocabulary.
- **absent `panels`** means "uniform, per `fillType`" — so every existing handrail is unchanged and
  the field is additive (C47 §1.2, no MAJOR bump).
- the panel array is **DERIVED-INDEXED, not id-keyed** — see §15.3's prohibition on random ids.

> ### ⛔ THE TRAP, MEASURED ON THE NEIGHBOUR, AND IT IS THE MOST LIKELY WAY THIS FEATURE FAILS
> C87 records that curtain-wall `panels[]` **crosses the bridge and is then dropped one hop later
> because the legacy record has no field to receive it** — a curtain wall authored with a door panel
> reloads as uniform glazing. Handrail is *primed for the identical failure*: §5 already measures
> **nine DROPPED fields**, all for the same reason (no slot on the receiving shape).
>
> **MUST: the acceptance test for R6 is a ROUND TRIP, not a write.** Author a per-bay panel →
> serialize → load → read back the panel's `kind` and `materialId` from the authoritative store.
> ⚠ **§13 item 9 is the standing warning:** persistence of the fields this lane ALREADY added is
> **not measured**, and L-999 is that exact defect on wall — four hand-written whitelists, all
> omitting one field. **R6 MUST NOT be reported as landed on a session-only proof.**

---

## 15.6 MATERIALS — C100 IS BINDING, AND THE 20 TYPES CURRENTLY VIOLATE IT

**C100 §2.1, verbatim:** *"An element REFERENCES a material by `materialId`. A resolved colour is a
CACHE, never an authority. A stored hex is legal in exactly ONE role — an explicit, user-authored
OVERRIDE."* And: *"**MUST NOT**: a family store only a hex and call it a material."*

**AS-IS — MEASURED, AND IT IS A VIOLATION THIS LANE INTRODUCED AT SCALE:** all **20** built-in
`HandrailTypeDefinition`s carry `materialColor` (a hex) and `materialName` (the V5 six-member enum,
§9.2). **None carries a `materialId`.** So applying a catalogue type **materialises a hex**, which
is precisely C100's MUST NOT. ⚠ Recorded against this lane's own work rather than inherited: the
five pre-existing types had the same shape, and adding fifteen more multiplied it.

⚠ **The builder's resolution ORDER is already C100-correct** —
`HandrailFragmentBuilder.resolveColour` reads `materialColor` first (the override), then
`materialId` via `userMaterialStore`. What is missing is **step 3**: C100 §2.1 requires a **NAMED
UNRESOLVED state**, never a silent default; the builder falls through to `'#cccccc'` / `'#888888'`.

**TO-BE — MUST:**
1. every `HandrailTypeDefinition` carries a **`materialId` from `MATERIAL_CATALOG`**
   (`packages/schemas/src/materials/materialCatalog.ts`) — real ids exist for every one of the 20:
   `steel-stainless-brushed`, `steel-structural`, `steel-galvanised`, `aluminium-powder-coated-dark`,
   `cast-iron`, `wood-oak`, `wood-teak`, `glass-clear`, `glass-structural`, `glass-frosted`, …
2. `materialColor` is **demoted to an explicit override** and MUST be distinguishable as one in the
   UI (C100 §6.1 — *"an invisible override is indistinguishable from a stale copy"*).
3. an unresolved `materialId` produces the **named** state, not a grey rail.
4. ⛔ **`materialName` (V5) MUST NOT be collapsed into the hex.** §9.2 already records why: it is the
   only vocabulary carrying physical intent, its stated justification is contradicted by its own
   implementation (a bare hex map where `wood === timber`, and `glass: 0xaaddff` is **opaque**), and
   erasing it would make the loss permanent. **Lane ZA owns the V1–V5 unification.** This section
   owes ZA one more fact: **a sixth vocabulary was NOT minted here** — the 20 types reuse V5's exact
   six members.

---

## 15.7 R3 — TYPE AUTHORING (duplicate / new) — FOLLOW THE ONE EXISTING PATTERN

**AS-IS.** `HandrailTypeStore` already has `add()` / `update()` / `remove()` with built-in
protection, and `clearCustomTypes()` registered on `projectScopeRegistry`. **The machinery exists;
the UI does not offer it.** The door/window pre-draw pickers already have the shared
`appendTypeAuthoringOptions` / `handleFinishTypeAuthoring` (`FinishTypeAuthoringActions.ts`,
§FEAT-HOSTED-TYPE-AUTHORING / C65).

**MUST**: reuse that machinery, gated by `ElementTypeAuthoringRegistry`, so there is **one** authoring
pattern rather than a handrail-shaped second one (C84 EI-9).
**MUST**: user types **PERSIST**. ⚠ `clearCustomTypes()` proves the store expects project scoping;
whether custom handrail types are **saved and reloaded** is **NOT MEASURED** and is the same hop
§15.5 warns about.
**MUST**: duplicating copies the source type's fields **including** `materialId` and the infill
members, or it reproduces L-983's half-application on a new surface.

---

## 15.8 R8 — SLAB-EDGE DERIVATION VIA RAC — THE SIMPLE CASE, AND AN HONEST REFUSAL FOR THE HARD ONE

**Case A — *"create a railing on the edge of this slab"*.** ✅ The geometry is LANDED and proven:
`slabOutlineSegments()` + the By-Slab mode, reading the ring the way `CreateWallsFromSlabCommand`
does (`polygon` + `slab.position`, re-wound). **What is missing is only the RAC verb.**

**Case B — *"…on the edges of the slab that don't have walls"*.** ⛔ **This is a real spatial query
and it is NOT implemented.** It requires, per edge: is there a wall whose baseline lies within
tolerance of and roughly parallel to that edge, on this level?

**MUST**: Case B **refuses by name** until the query exists — naming the edge count it could not
classify and offering Case A as the live alternative (C16 CA-18). ⛔ **MUST NOT guess an edge set.**
A guard placed on the wrong edges of a balcony is a **safety-relevant** wrong answer, and this
repo's §CONTEXT-DATA-HONESTY lesson — *failure and emptiness are the same value* — applies with
force: "no walls found" and "wall query failed" **MUST NOT** both produce a railing on every edge.

---

## 15.9 R7 — PANEL **and** RAC, ONE AUTHORITY PER CAPABILITY

**MUST (EI-9)**: each capability has **one** command; the panel and the chat both dispatch **it**.
⛔ **MUST NOT** grow a panel path and a chat path that diverge — §10.1 is this family's own worked
example of what that costs.

> ### ⛔ V3 IS THE BAR, AND IT IS NOT THE ONE MOST LANES CLEAR
> RC1 measured that the chat ladder proves **V1 RESOLVE** and **V2 DISPATCH** only — **V3, the write
> reaching the AUTHORITATIVE store, is gated for 18 verbs of 325.** Four founder-visible defects in
> one day were V3/V7 failures. **MUST: every railing capability added here is proven by EXECUTED
> READ-BACK from `window.handrailStore`** (C16 CA-21), not by a `success: true`, and not by a return
> value. ⚠ This family has a specific reason to distrust dispatch-level proof: **seven bus verbs
> exist, all write a store with zero readers, and until 2026-08-19 one of them was live** (§3.1b).
> A V2-level proof on `handrail.create` would have been GREEN for a write nothing rendered.

**Capability → verb map (TO-BE).** ⛔ **MUST NOT** be built on the seven DORMANT plugin verbs
(§6): they write the inert DTO store. New capabilities extend the **L2 commands**, which is where
the authority is.

| Capability | Command | Panel | RAC | Status |
|---|---|---|---|---|
| create (line/ortho/curved) | `CreateHandrailCommand` / `CreateHandrailRunCommand` | ✅ pre-draw | ⛔ blocked class B | plan ✅ |
| retype | `UpdateHandrailCommand` via `element.changeType` | ✅ | ⛔ | ✅ |
| post / baluster spacing | `UpdateHandrailCommand` | ⛔ | ⛔ | **R5** |
| infill panels + per-panel material | **NEW** | ⛔ | ⛔ | **R6** |
| material (C100) | `UpdateHandrailCommand` + `materialId` | ⛔ | ⛔ | **§15.6** |
| rake / slope | **NEW** | ⛔ | ⛔ | **R4** |
| duplicate / new type | `HandrailTypeStore.add` | ⛔ | ⛔ | **R3** |
| railing on slab edge | `CreateHandrailRunCommand` | ✅ By Slab | ⛔ | **R8** |

⚠ `handrail.create` is class **B — "needs design"** in `ChatCommandClassification.ts:59-72`, blocked
on a per-family placement grammar. **The RAC column is ⛔ for every row, and that is the honest
starting position** — R7 is not a wiring task on top of a working chat surface; the grammar has to
be written first.

---

## 15.10 BIM 3.0 — "CONSCIOUS ABOUT EVERY OTHER ELEMENT"

The axes every family must participate in, with handrail's measured state:

| Axis | State | Where |
|---|---|---|
| hosting | ⛔ **`hostId` never reaches the authoritative store** | §5, §15.1 |
| cascades (host moves / deletes) | ⛔ **never registers**; the refusal is swallowed and the console still prints "activated" | §8.1, §8.2 |
| level change | ⚠ **NOT MEASURED** | §13 item 11 |
| undo | ✅ covered; ⚠ not audit-neutral (`metadata.version` ratchets) | §7.1, §7.3 |
| persistence | ⚠ **the new fields are NOT MEASURED across save/load** | §13 item 9 |
| schedules | ✅ | §3 |
| IFC | ⚠ export ✅; **import re-classifies every stair railing as a handrail** | §3.3 |
| plan projection | ✅ | §3 |
| semantic graph | ✅ `sitsOn`, captured and restored verbatim on delete | §8 |
| bake worker | ⛔ **absent, undeclared** | §12 R19 |

⇒ **Four of ten axes are broken or unmeasured, and three of them (hosting, cascades, persistence)
are prerequisites for R1 and R6.** ⛔ **R1 and R6 MUST NOT be reported as landed while `hostId` is
dropped at the bridge and persistence is unmeasured** — that would be the "committed ≠ reachable"
failure with a contract citation attached.

---

## 15.11 IMPLEMENTATION ORDER, AND WHAT BLOCKS WHAT

Requested order **R2 → R5 → R6 → R3 → R8 → R4**, annotated with the blockers measured above:

| # | Item | Blocked by |
|---|---|---|
| **R2** | creation UI | ✅ **LANDED** (plan). 3-D modes outstanding |
| **R5** | post spacing | ⛔ **the end-condition DECISION** (§15.3) — implementable the moment it is made |
| **R6** | infill panels | ⚠ **must not be started before the persistence hop is measured** (§13 item 9), or it inherits C87's exact failure |
| **R3** | type authoring | ⚠ needs the same persistence answer; machinery already exists |
| **R8** | slab edge | Case A implementable now; **Case B refuses by name** until the wall-occupancy query exists |
| **R4** | rake / curve | ⛔ **the conical-vs-radius DECISION** (§15.4) + the `HandrailRunGeometry` wire-or-delete decision (§11 row 25) |

⭐ **THE ONE ITEM NOT ON THE FOUNDER'S LIST THAT OUTRANKS MOST OF IT:** §11 row 12 —
**deleting a stair still leaves its handrails floating**, and the comment claiming a
garbage-collect pass handles it names a mechanism that does not exist. That is a live,
user-visible data defect on the very interaction (*"behave for STAIRS"*) R1 is about.
