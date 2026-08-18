# C95 — ELEMENT: HANDRAIL

> **Stamp**: 2026-08-18 · **Status**: CANONICAL — binding on every PR touching the handrail family
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
| 2 | **Plugin DTO store** | `plugins/handrail/src/store.ts:10` (`super('handrail')` `:11`) | **1 verb** (`handrail.create`) | **ZERO in production** | **write-only, and it LEAKS (§4.3)** |
| 3 | **Legacy geometry store** | `packages/core-app-model/src/stores/HandrailStore.ts:24`, built once at `initBuilders.ts:872`, `window.handrailStore` `:873` | legacy commands + the `.created` bridge | **everything** | 🟢 **THE AUTHORITY** |
| 4 | Scene `userData` | `HandrailFragmentBuilder.ts:174-175` | the builder | picking, delete routing, plan layers | derived |
| 5 | Kernel producer | `producers/handrail.ts:81` | — | **nothing** | **DEAD — but not deletable** |

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
- **(b) Bus axis.** Of 7 plugin verbs, **exactly one has a production dispatcher** — `handrail.create`,
  from `RailingPlanToolHandler.ts:92` and `HandrailTool.ts:158`. `delete` / `setPath` / `setShape` /
  `setHost` / `recompute` / `setMaterial` have **zero**.

**⇒ 0 readers, 1 writer, and that writer's two dispatchers are precisely the two residual defect sites
(§6). ⛔ Do NOT reconcile or mirror ([C84 §8.c](C84-ELEMENT-INTEGRITY.md) / EI-5a) — DECLARE.**

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
| `CreateHandrail.ts:30` | `handrail.create` | ✅ | ✅ ×2 | **LIVE — and both dispatchers are defective (§6)** |
| `DeleteHandrail.ts:19` | `handrail.delete` | ✅ | ⛔ **0 dispatchers** | **DORMANT** — ⛔ not deletable; **causes the leak (§4.3)** |
| `SetHandrailPath.ts:23` | `handrail.setPath` | ✅ | ⛔ 0 | DORMANT |
| `SetHandrailShape.ts:24` | `handrail.setShape` | ✅ | ⛔ 0 | DORMANT |
| `SetHandrailHost.ts:22` | `handrail.setHost` | ✅ | ⛔ 0 | DORMANT |
| `RecomputeHandrail.ts:26` | `handrail.recompute` | ✅ | ⛔ 0 — its only emitter is itself dead (§8) | DORMANT |
| `SetHandrailMaterial.ts:62` | `handrail.setMaterial` | ✅ | ⛔ **refuses `:82-83`** | ✅ **C16 CA-18 CONFORMANT** |

### 4.2 The live path is legacy

`CreateHandrailCommand` (`packages/command-registry/src/handrails/`), `UpdateHandrailCommand`,
`DeleteHandrailCommand` — reached from `HandrailTool.ts:159`, `initBusHandlers.ts:1136,1434`,
`DeleteElementCommand.ts:513-529`, `ProjectLoader.ts:1225`, `IfcRailingToNativeConverter.ts:27`.

### 4.3 ⛔ THE PLUGIN-STORE LEAK — measured, and it is unbounded

`handrail.create` writes the DTO store (`CreateHandrail.ts:68-70`) from **both** dispatchers.
**Nothing dispatches `handrail.delete`** (§3.1b). Legacy deletes purge only the legacy store —
`DeleteElementCommand.ts:529` `handrailStore.remove(id)`, `DeleteHandrailCommand.ts:95`.

**⇒ Every handrail ever created remains in the plugin DTO store for the life of the session.** The
store grows monotonically, and the DORMANT handlers' `canExecute` checks then validate against those
ghosts (`DeleteHandrail.ts:23`, `SetHandrailMaterial.ts:79`) — so if any of them is ever wired, it will
find and act on records the user deleted. **EI-5 violation with a latent correctness consequence, not
merely a memory one.**

### 4.4 ⛔ A JUNK RECORD PER 3-D HANDRAIL

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

**⇒ A ghost 1 m rail at the world origin is minted per 3-D handrail drawn**, and per §4.3 it is never
removed. ⛔ **A telemetry call MUST NOT be a mutation.** **TO-BE:** delete the call, or route telemetry
through an observer that writes no store. ⚠ **NOT MEASURED:** whether `CommandEventBridge` re-emits
`handrail.created` for this defaulted payload and thereby mints a phantom **legacy** handrail too — if
it does, this is user-visible, not merely internal. **Measure before closing §11 item 6.**

---

## 5. THE BRIDGE FIELD MAP — four live defects, omission forbidden (EI-2)

The bridge is `apps/editor/src/engine/initTools.ts:1909-1956` (`§FT-HANDRAIL`), subscriber `:1919`.

| Source field (`handrail.created`) | Bridge line | Disposition | Defect |
|---|---|---|---|
| `id` | `:1930` | **CARRIED** | — |
| `levelId` | `:1930-1934` | **CARRIED** | — |
| `parentId` | `:1930-1934` | **CARRIED** | — |
| **`path` (N points)** | `:1928-1938` | ⛔ **COLLAPSED to `[path[0], path[last]]`** | **D1 — EI-2(d)** |
| `path[i].y` | `:1936-1937` | **CARRIED into `baseLine` and NEVER READ** (§7 datum) | **D5** |
| `height` | `:1939` | **CARRIED** | — |
| **`diameter`** | `:1940` | ⛔ **written to `thickness`, which the round branch ignores** | **D3** |
| `baseOffset` | `:1941` | ⛔ **hard-coded `0`** — the catalogue value never crosses | **D6** |
| **`shape`** | `:1942` | ⛔ **CONSTANT `'round'`** | **D2 — EI-2(b)** |
| `materialId` | `:1943-1944` | CARRIED (optional) | — |
| **`fillType`** | — | ⛔ **ABSENT — no slot at all** | **D4** |
| **`postSpacing`** | — | ⛔ **ABSENT** | **D4** |
| **`railDiameter`** | — | ⛔ **ABSENT** | **D3** |
| **`materialColor`** | — | ⛔ **ABSENT** | **D7** |
| `properties` | `:1930-1948` | CARRIED | — |

### D1 — N-point path collapsed, SILENTLY. **No refusal exists.**

```
1925:                ev.path.length < 2
1926:            ) return;
1928:                const p0 = ev.path[0];
1929:                const p1 = ev.path[ev.path.length - 1];
1935:                    baseLine:  [
1936:                        { x: p0.x, y: p0.y ?? 0, z: p0.z },
1937:                        { x: p1.x, y: p1.y ?? 0, z: p1.z },
1938:                    ],
```

**No `length > 2` check, no `console.warn`, no diagnostic.** A 3-point L-rail becomes a diagonal across
the corner it was drawn to guard. **This is not truncation; it is collapse, and it is silent** —
[C84 EI-2(d)](C84-ELEMENT-INTEGRITY.md) verbatim. Pinned green by `HandrailBridgeDivergenceProbe.spec.ts:99,113-115`.
**A refusal string is requested by the brief: it does not exist — NOT MEASURED because NOT PRESENT.**

### D2 — the `'rectangular'` ternary is a CONSTANT

```
1942:                    railProfile: ev.shape === 'rectangular' ? 'rectangular' : 'round',
```

`ev.shape` comes from `z.enum(['round','square','flat'])` (`Handrail.ts:7`, default `'round'` `:53`).
**`'rectangular'` is not in the enum, so the condition is unsatisfiable and the expression is the
constant `'round'`.** Downstream `HandrailFragmentBuilder.ts:216` takes the round branch for **every**
bridged handrail; the box branch at `:226` is **unreachable from the plan tool**. `tsc` cannot see it —
[C84 EI-2(b)](C84-ELEMENT-INTEGRITY.md). ⇒ **`square` and `flat` are affordances without an
implementation (EI-3).**

### D3 — the authored diameter lands in a field the taken branch ignores

`:1940 thickness: ev.diameter ?? 0.04` — and **no `railDiameter` key is written**. The round branch
reads `HandrailFragmentBuilder.ts:217` `const radius = (handrail.railDiameter ?? 0.04) / 2;`.
`thickness` is read **only** by the box branch (`:226`), which per D2 is never selected.
**⇒ an authored 0.05 renders at radius 0.02.** Probe `:154,159-160,168`.

### D4 — no `fillType`: the same line drawn in plan and in 3D builds different geometry

The bridge writes no `fillType`. `HandrailFragmentBuilder.ts:235` (`'glass'`) and `:249` (`'baluster'`)
both see `undefined` and skip ⇒ **1 rail + 2 end posts = 3 meshes**. The 3-D path defaults it:
`CreateHandrailCommand.ts:76` `const fillType = (this.data.fillType as any) ?? 'baluster';`, and `:78`
derives `ifcPredefined = fillType === 'glass' || 'panel' ? 'GUARDRAIL' : 'HANDRAIL'`.

⛔ **This is not only a geometry divergence — it changes the IFC `PredefinedType`.** A plan-drawn barrier
and a 3-D-drawn barrier on the identical line export as **different IFC entities**. Probe `:177-188`, `:195-219`.

> **TO-BE for D1-D4, and the SHAPE is normative.** ⛔ **Do not fix these by widening the bridge's
> hand-written field list** — that mints the eighteenth named-subset re-emit. The bridge MUST become a
> **declared, gated field map** ([C84 §7](C84-ELEMENT-INTEGRITY.md)) in which every payload field is
> carried or **declared dropped**, consumed by `check-bridge-field-coverage.ts`. D1 specifically MUST
> **refuse by name** until the legacy record can hold an N-point path — a 2-point `baseLine` cannot
> represent a 3-point rail, so carrying is impossible and silence is the only forbidden option.

---

## 6. Verbs

| Verb | Lineage | Handler | `affectedStores` | WRITTEN | RESTORED | Equal? |
|---|---|---|---|---|---|---|
| `handrail.create` | **L1** | `CreateHandrail.ts:30`, `produceCommand :68-70` | `:31` `['handrail']` | plugin DTO | legacy | ⛔ **disjoint** |
| **CREATE (live)** | **L2** | `CreateHandrailCommand` | `['handrail']` | legacy | own undo | ✅ |
| `handrail.delete` | **L1** | `DeleteHandrail.ts:19` | `:20` `['handrail']` | plugin DTO | legacy | ⛔ **disjoint + DORMANT** |
| **DELETE (live)** | **L2** | `DeleteHandrailCommand.ts:7` / `DeleteElementCommand.ts:513-529` | `["handrail"]` `:8` | legacy + graph | ✅ `_captureRelationships` `:91`, restore `:100-107` / `:917-925` | ✅ **and it captures graph edges** |
| **`handrail.moveBaseLine`** | **L3/L4 hybrid** | `initBusHandlers.ts:1128` | **`:1129` `['handrail']`** | legacy via `_cmExec` `:1136` | hand-forged `PatchPair` `:1137-1140` | ⚠ **two mechanisms, one gesture** |
| **`handrail.updateColor`** | **L3** | `initBusHandlers.ts:1427` | **`:1428` `[] as const`** | legacy via `_cmExec` `:1434` | **NO `undoPatch`** | ⚠ **relies wholly on L2's stack** |
| `handrail.setPath` | **L1** | `SetHandrailPath.ts:23` | `['handrail']` | plugin DTO | legacy | ⛔ DORMANT |
| `handrail.setShape` | **L1** | `SetHandrailShape.ts:24` | `['handrail']` | plugin DTO | legacy | ⛔ DORMANT |
| `handrail.setHost` | **L1** | `SetHandrailHost.ts:22` | `['handrail']` | plugin DTO | legacy | ⛔ DORMANT |
| `handrail.recompute` | **L1** | `RecomputeHandrail.ts:26` | `['handrail']` | plugin DTO | legacy | ⛔ DORMANT |
| `handrail.setMaterial` | **L1** | `SetHandrailMaterial.ts:62` | `:65` `['handrail']` | **nothing — refuses `:82-83`** | n/a | ✅ **CA-18 conformant** |
| ROTATE | — | **NO VERB** | — | — | — | rotation is implicit in `baseLine` |
| PARAMETER | **L2** | `UpdateElementParameterCommand` `:137` `handrail: route(['handrail'], HANDRAIL_STORE)` | `['handrail']` | legacy | ⚠ **NOT audit-neutral — §7.3** | ⚠ |
| LEVEL CHANGE | — | **NOT MEASURED** | — | — | — | — |

**Refusal string, `SetHandrailMaterial.ts:56-57`, verbatim — and note it is doubly honest:**

> *"It writes the detached plugin DTO store that nothing renders (§FIX-MATERIAL-DEAD-DISPATCH). Use
> `handrail.updateColor`, which reaches handrailStore. **Note that HandrailFragmentBuilder has NO
> material-library lookup — it reads only `materialColor` — so a catalogue materialId cannot be shown
> on a handrail at all**; pick a colour override."*

✅ **EXEMPLARY** — it names the mechanism, offers the live alternative **and** discloses a second
limitation the user would otherwise discover by trial. This is the C16 CA-18 model.

---

## 7. Undo / redo

### 7.1 Coverage — ✅ clean

`buildUndoStoreMap` — `performUndoRedo.ts:329` maps **both** `handrail` and `handrails` to
`w.handrailStore`. Handrail is **not** among EI-7c's seven stranded families.
`createSnapshot` — `CommandManagerImpl.ts` `optionalStores` carries `['handrail','handrailStore',…]`.
**Handrail is NOT among L-953's twelve unrecognised keys.** ✅ Both recorded per **EI-1b**.

⚠ **But `stairRailingStore` is NOT in `optionalStores`** — a stair-railing edit is not snapshot-scoped.
Adjacent family, real hole, recorded here because nobody else will (§13 item 5).

### 7.2 EI-7a — the systemic inequality holds

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

### 9.1 Shape — `square` and `flat` cannot be built (EI-3)

`z.enum(['round','square','flat'])` (`Handrail.ts:7`) — and D2 makes the profile a constant `'round'`.
**2 of 3 shapes the schema offers cannot be produced through the plan bridge.** Unlike lighting's EI-3,
this one **does not refuse** — it silently substitutes. **Strictly worse.**

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
named in the brief.** **TO-BE:** both tools resolve defaults from `HandrailTypeStore`; the two literals
are deleted, not re-synchronised (C84 §8.d — a comment is not a synchronisation mechanism).

---

## 11. THE DELTA

| # | Fix | Invariant | Proof required |
|---|---|---|---|
| **1** | **Correct the record that these are fixed.** ADR-0332 documents them; nothing else may report them closed. §0 is the correction | governance | §0 stands; the probe's `it()` names keep their defect wording |
| **2** | **D1 — N-point collapse: REFUSE BY NAME.** A 2-point `baseLine` cannot hold a 3-point rail, so carrying is impossible and silence is the only forbidden option | **EI-2(d)**, C16 CA-18 | probe `:99` flips from *"loses its middle vertex with no diagnostic"* to an asserted refusal |
| **3** | **D2 — delete the `'rectangular'` dead branch**; map the real enum `round\|square\|flat` | **EI-2(b)**, **EI-3** | probe `:132` asserts `square → square` |
| **4** | **D3 — write `railDiameter`**, the field the round branch reads | **EI-2(a)** | probe `:154` asserts radius 0.025 for an authored 0.05 |
| **5** | **D4 — carry `fillType`** (and `postSpacing`) | **EI-2(a)** | probe `:195` asserts plan ≡ 3D mesh count **and** IFC `PredefinedType` |
| **6** | **D6 — carry `baseOffset`** instead of hard-coding `0` | **EI-2(a)** | a catalogue type with non-zero `baseOffset` seats identically from both views |
| **7** | **Delete the telemetry mutation** at `HandrailTool.ts:158`. First **measure** whether it also mints a phantom legacy handrail (§4.4) | **EI-5**, C16 CA-17 | a watched-RED test asserting the DTO store is unchanged by a 3-D draw |
| **8** | **Close the plugin-store leak** — ⛔ **by DECLARING the store retired (EI-5a), NOT by wiring `handrail.delete`.** Wiring the delete makes a zero-reader shadow look authoritative ([C84 §8.c](C84-ELEMENT-INTEGRITY.md)) | **EI-5 / EI-5a** | `plugins/handrail/src/store.ts` header on the `plugins/rooms/src/store.ts:1-29` model |
| **9** | **One default source for both tools** — delete `RailingPlanToolHandler.ts:15-16` | **EI-9** | plan and 3D produce byte-equal records for one line |
| **10** | **`'railing'` → `'handrail'`** in `PropertyPanelTypeSelector.ts:279`; drop the alias at `elementMove.ts:126` | **C15 §12 / C84 §4E** | one spelling per family |
| **11** | **Make the cascade refusal LOUD** — `PluginRegistry.ts:660` must not print *"activated"* on the refusal path; `tool.ts:49` must not swallow it | **EI-12** | the console states `ENGINE_NOT_AVAILABLE` |
| **12** | **Stair delete orphans handrails** — build the pass or delete the comment claiming it | **EI-5**, C84 §8.d | a stair delete leaves no hosted handrail |
| **13** | **IFC: stop re-classifying stair railings as handrails**, or refuse | **EI-2**, C25 | round-trip preserves the family |
| **14** | **Audit-neutral undo for handrail parameters** | **ADR-0319 §2** | watched-RED: `metadata.version` byte-equal across undo |
| **15** | **Declare the `persistence-client` duplicate pair** (6 files) | **EI-9 / EI-10** | a named reason + an EI-8a equality test, or retirement |
| **16** | **Add `stairRailingStore` to `createSnapshot`'s `optionalStores`** | **EI-7d**, L-953 | the C84 §5 sweep |
| **17** | **Decide `HandrailRunGeometry`'s fate** — wire it or delete it; a 282-line spec over an unreachable module is debt with a green badge | **EI-12**, C72 §0.1 | one importer that is not a test |

---

## 12. REFUSALS

| # | Refusal | Named where | Verdict |
|---|---|---|---|
| **R1** | **`handrail.setMaterial` is unreachable; use `handrail.updateColor`** | `SetHandrailMaterial.ts:56-57` | ✅ **EXEMPLARY** — mechanism, alternative, and a second disclosed limitation |
| **R2** | **A catalogue `materialId` cannot be displayed on a handrail** — the builder has no library lookup | same string | ✅ **DECLARED** — ⛔ but the panel MUST stop offering it (C82) |
| **R3** | **`handrail.recompute` does not fire on `stair.setType`** — material-only swap, no edge motion | `plugins/cross/src/stair-handrail.ts:27` | ✅ **correct and reasoned** |
| **R4** | **`handrail.recompute` does not fire on `stair.delete`** | `stair-handrail.ts:28-30` | ⛔ **NOT A VALID REFUSAL** — it defers to a garbage-collect pass that **does not exist** (§8.2) |
| **R5** | **The six DORMANT verbs** are the PRYZM-3 target vocabulary | [C84 §3.5.3](C84-ELEMENT-INTEGRITY.md) | ✅ ⛔ **not deletable** |
| **R6** | **`RecomputeHandrail` refuses to write** and returns a determination instead | `RecomputeHandrail.ts` | ✅ **CA-18 conformant** |
| **R7** | **Handrail is absent from the bake worker** | nowhere | ⛔ **NOT A REFUSAL — an undeclared absence.** Blocked behind ADR-0331 §D5 |
| **R8** | **Handrails cannot slope** | nowhere | ⛔ **NOT A REFUSAL — a silent capability gap.** The geometry exists twice (Stack B, `HandrailRunGeometry`) and is reachable neither time. **Declare it or wire it** |

---

## 13. NOT MEASURED

1. **Whether `HandrailTool.ts:158`'s junk create also mints a phantom LEGACY handrail** — depends on
   `CommandEventBridge` re-emitting `handrail.created` for the defaulted 2-point path. **Blocks DELTA #7.**
2. **GLB export's handrail path** — handrail tokens appear only under `export/ifc/*`; whether GLB
   consumes that chain or walks the THREE scene directly was not determined.
3. **L-952's "eight families"** — the gate names three *covered*; no eight-member list was found in code.
4. **`handrail.setPath` / `setShape` / `setHost` dynamic dispatch** — zero by literal grep; computed verb
   strings (`` `handrail.${x}` ``) were not swept.
5. **`stairRailingStore` snapshot coverage consequences** — its absence from `optionalStores` is measured;
   what breaks on a failed stair-railing execute is not.
6. **An end-to-end runtime handrail undo** — the map entry exists; no executed read-back was run.
   Per [C16 CA-21](C16-COMMAND-AUTHORING-PROTOCOL.md) a declaration is not a proof.
7. **`HandrailFragmentBuilder` baluster/post spacing arithmetic** (`balusterSpacing ?? postSpacing ?? 0.11`).
8. **`handrail` level-change** — whether `element.changeLevel` has a branch.
9. **Sub-part tagging** — whether `HandrailPart` carries `role`/`parentId` per C15 §12.
10. **`pryzm-selfhost`** — no such directory under the repo root; the census was repo-wide, but the host
    named in C84 §3.5.2 could not be located as a directory.
