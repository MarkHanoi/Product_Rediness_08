# Duplication audit and convergence roadmap — every element family

> **Stamp**: 2026-08-18 · **Status**: AUDIT COMPLETE (Phase 1) · ROADMAP PROPOSED (Phase 2), awaiting founder ratification
> **Lane**: Z8 · **Decision record**: [ADR-0331](../../02-decisions/adrs/ADR-0331-the-plugin-dto-store-is-a-rival-substrate-with-a-decided-loser.md)
> **Governing, strongest first** (CLAUDE.md conflict order): [STR-03](../../01-strategy/STR-03-engineering-vision.md) →
> [STR-04](../../01-strategy/STR-04-architecture.md) → C01–C83 → ADRs → SPECs.
> **Binding contracts for this audit**: **C03** §2.3.1 / §4.6 (state + undo) · **C16** §5.1 `CA-17…CA-21`
> (command liveness) · **C68** §5.a (dead-verb presumption) · **C69** (verb register) · **C70** A-INV-1/A-INV-3 ·
> **C78** §21 OQ7 · **ADR-0318** (the decided direction).
> **No code was changed by this lane.** Seven other agents are editing wall / roof / slab / material / chat code
> concurrently; a store migration here would collide with all of them. This document and ADR-0331 are the deliverable.

---

## 0 — Executive summary: what is actually duplicated, and what only looks it

The founder's brief asked for a census of duplication "on the complete repo". The census is §2–§6.
Three headline results, all measured:

1. **There is exactly ONE structural duplication that explains most of the founder-visible defects,
   and it is not a naming coincidence — it is a second substrate.** `apps/editor/src/PluginRegistry.ts`
   constructs **22 plugin DTO stores** (`buildStore: () => new XStore()`, lines 228–465) that are
   *different objects* from the geometry stores the renderer, serializer, exporter and undo stack read.
   Bus handlers write the first; everything the user experiences reads the second. This is the L-946
   mechanism, the L-620 / L-815 / L-839 mechanism, and — per **C68 §5.a** — the presumption has been
   **right 13/13 times**.

2. **The direction is already decided and the loser is already named.** **ADR-0318 (Accepted,
   2026-08-11)** makes `storeRegistry` — which holds the *geometry* stores — the runtime's
   authoritative element-store slot, and states its end-state explicitly. **The plugin DTO store is
   NOT going to become authoritative.** Any roadmap step that mirrors *into* the plugin store, or that
   proposes to promote it, contradicts an accepted ADR. §1 cites this in full because it is the single
   most load-bearing fact in this document, and the most likely to be got backwards.

3. **Most of the rest of the "duplication" is not rivalry.** The measured categories separate sharply,
   and conflating them is how a previous pass over-reported. §7 classifies every finding into
   HARMFUL DUALITY / UNWIRED OVERLAY / DELIBERATE TRANSITIONAL / DEAD, and only the first category
   is scheduled.

---

## 1 — The direction the project is committed to (cited, not chosen by this lane)

This section exists because the brief asked the question directly, and because picking the wrong
direction would invalidate every step below.

### 1.1 — What ADR-0318 decided

**[ADR-0318 — "composeRuntime adopts the authoritative element-store registry"](../../02-decisions/adrs/ADR-0318-composeruntime-owns-authoritative-stores.md),
status Accepted 2026-08-11.** Its own words, at the cited lines:

- **The cause it names** (Context, ¶3): *"This is the single cause behind the dead-verb family, the 16
  shadowed routes and the curtain-wall no-op: handlers kept being authored against fresh plugin-DTO
  stores (`PluginRegistry.buildStore: () => new WallStore()`) because the composition root offered
  nothing authoritative to write."*
- **The winner it names** (Context, fact 1): `packages/core-app-model/src/StoreRegistry.ts:151` exports
  the module singleton `storeRegistry`; `apps/editor/src/engine/initStores.ts` (`registerAllStores`,
  called at `engineLauncher.ts:767–781`) registers **21 element stores** under canonical type keys, and
  *"the instances it registers are expression-for-expression the same ones it hands to `initPersistence`
  for the serializer at `engineLauncher.ts:817–832`"*. **Registry identity ≡ serializer identity.**
- **The loser it names** (Context, fact 3): *"Constructing rivals forks state. The plugin-DTO half
  already demonstrates it: every `new WallStore()` from `PluginRegistry` is a detached store whose
  writes render nowhere and serialize never."*
- **The invariants** (I-1…I-3): `runtime.stores.elements.get(k)` **IS** the instance the serializer
  reads — *"never a copy, never a rival"*; the slot is backed by `storeRegistry` **and nothing else**;
  a kind absent reads `undefined` **loudly** — *"No scaffold, no empty stand-in."*
- **The end state and the increment**: Option 1 (composeRuntime constructs the stores) is *"the right
  end state but the wrong move"*; ADR-0318 reaches it **per kind**, each step provable by the
  same-instance probe. Option 3 (*bless the split*) is explicitly rejected as *"a dead end the
  founder's own decision drivers exclude"*.

### 1.2 — Therefore

> **The geometry store is authoritative. The plugin DTO store is the rival, and it is the one that
> goes. Convergence runs plugin → geometry, never the reverse, and never as a permanent mirror.**

Two corollaries the roadmap obeys:

- **A bridge is a transitional device, not an end state.** It inverts *which copy goes stale* while a
  verb waits its turn; it never becomes the answer. This is exactly what
  **`§FIX-ROOF-UPDATE-REACH-RECORD` (L-839)** did — it *removed* `roof.update` from the plugin handler
  set so a bridge owns the verb against the legacy store. See §8.2 for why that shape is the general
  pattern and where its limits are.
- **Mirroring bus writes *into* the plugin store is prohibited.** It would create the copy ADR-0318
  I-1 forbids. Where a handler needs read access to element state, it must read the registry.

### 1.3 — What is NOT decided, and must not be assumed

ADR-0318's exit condition is *"zero ABSENT element kinds headlessly, **or** the register carries a
per-verb disposition naming the kinds that legitimately have no headless store."* **The second
disjunct has never been exercised.** Nobody has decided which kinds are legitimately storeless.

**C78 §21 open question 7** is still open verbatim: *"Are the six rival plugin DTO stores dead or
live? Cannot be settled by grep; needs a runtime reachability probe. A consequence system cannot plan
against a store it cannot name."* §9 of this document states what this lane could and could not settle
about that.

---

## 2 — The mechanism, measured end to end

Five facts, each read from source in this lane, that together explain the whole defect family.

### 2.1 — Two objects exist, and both are constructed at boot

| | Path | Constructed at | LOC |
|---|---|---|---|
| **Geometry (authoritative)** | `packages/geometry-wall/src/WallStore.ts` | `initTools.ts:977` → `window.wallStore = wallTool.getWallStore()`; also `initBuilders.ts:552` | 1741 |
| **Plugin DTO (rival)** | `plugins/wall/src/store.ts` | `apps/editor/src/PluginRegistry.ts:229` `buildStore: () => new WallStore()`, invoked at `apps/editor/src/bootstrap.everything.ts:142` | 53 |

`plugins/wall/src/store.ts:3` still describes itself as mirroring `src/elements/walls/WallStore.ts`
(1,227 LOC) — a **third** path named in a comment; §2.6 records whether it survives.

### 2.2 — The bus writes one; everything the user experiences reads the other

`plugins/wall/src/handlers/*.ts` produce against `ctx.stores.wall` — 20+ call sites, e.g.
`CreateWall.ts:329`, `ChangeWallLevel.ts:67`, `CutWall.ts:264`, `DeleteWall.ts:60`,
`CreateWallBatch.ts:168`, `BulkSetWallVisuals.ts:139`. `ctx.stores.wall` is resolved from
`stores[plugin.storeKey]` (`bootstrap.everything.ts:145`), i.e. the `PluginRegistry` instance.

`window.wallStore` — the geometry instance — is what `WallRebuildCoordinator` subscribes to, what
`WallFragmentBuilder` derives `worldY` from, what `ProjectSerializer` writes, and what 15+ engine
sites read (`initTransformControllers.ts:55`, `registerTransformDragHandler.ts:153`,
`PlanViewToolOverlay.ts:446`, `ProjectLoader.ts:871`, `WallPerfBench.ts:101`, …).

### 2.3 — Registration order decides the winner, and it is invisible in the file you are editing

**C16 §5.1 CA-20**, verbatim and verified: `CommandBus.register()` **throws** on a duplicate type
(`packages/command-bus/src/CommandBus.ts:95`), so the editor's bridge table guards itself with a skip —
`if (runtime.bus.registry?.has?.(spec.type)) continue;` (`apps/editor/src/engine/initBusHandlers.ts:2202`).
The bus is therefore **first-registration-wins**, and a plugin handler registered during
`composeRuntime` **silently shadows** a bridge registered later by `initBusHandlers` or
`engineLauncher`. *"Authoring a bridge is not wiring it"* — the L-839 defect exactly.

### 2.4 — ⭐ The same store key names two different objects at two different times

This is the sharpest single finding in the audit, and it is already named as a hazard in
**C16 §5.1 CA-19** — but the hazard is **live**, not hypothetical:

- **At WRITE time**, a handler declaring `affectedStores: ['wall']` writes `ctx.stores.wall` — the
  **plugin DTO** store.
- **At UNDO time**, `buildUndoStoreMap()` (`apps/editor/src/engine/undo/performUndoRedo.ts:308-353`)
  resolves the *same key* `'wall'` to `w.wallStore` — the **geometry** store. The map is
  `{ wall: w.wallStore, walls: w.wallStore, slab: w.slabStore, … }` across **24 keys / 21 distinct
  globals**, every one of them a `window.*Store` geometry instance.

The entry is therefore "covered", `_covered()` passes, the ring-buffer path runs, and **an inverse
patch is applied to a store that never received the forward.**

### 2.5 — The base `Store` class already carries scar tissue for this exact duality

`packages/stores/src/Store.ts:99-125` (`applyPatch`, §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT / L-220)
tolerates *"a nested patch whose root element is ABSENT from this store by skipping it"*, and its own
comment states why: *"that same `affectedStores` also drives `attachStores` to re-apply the FORWARD
patch to THIS store — a **DETACHED plugin DTO instance** (see PluginRegistry `buildStore: () => new
FloorStore()`) **that never held the element**. Immer then threw error 18 … rejecting the whole drag
(the founder's `floor.update failed`)."*

**A workaround for the duality is compiled into the base class of every plugin store.** That is the
strongest possible evidence that this is one structural defect and not N per-family accidents.

### 2.6 — The L-946 fix, and precisely what it does not cover

`apps/editor/src/engine/elementLevelChangedMirror.ts` (257 LOC) is the mutation channel added for
L-946. Its own header states the shape of the problem better than any summary:

> *"`initTools.ts` bridges the two — twelve times, and every one of the twelve is a `.created` event.
> There was no mutation channel at all, so the command succeeded, the plugin store was right, and the
> layer the user experiences kept its own unchanged copy."*

and states this lane's question as explicitly out of its own scope:

> *"the question 'either the bridge gains a mutation channel, or the rendered model stops being a
> second copy' is architectural and is not answered here."*

**Coverage, measured:** `LEVEL_CHANGE_VERBS` (`packages/runtime-composer/src/CommandEventBridge.ts:126-138`)
holds **2 verbs** — `wall.changeLevel`, `roof.changeLevel`. `LEGACY_LEVEL_MOVERS`
(`elementLevelChangedMirror.ts:101-106`) holds **2 kinds** — `wall`, `roof`. Every other kind returns
`{ applied: false, reason: 'no legacy level-mover registered for kind "…"' }` (`:148-151`) — honest,
and empty.

---

## 3 — Census: STORES, per element family

*(filled from lane measurements — see §3.1 for the inventory that frames it)*

### 3.1 — The inventory, counted

| Population | Count | Command that counts it |
|---|---|---|
| `plugins/*/src/store.ts` | **32** | `ls plugins/*/src/store.ts \| wc -l` |
| `packages/geometry-*/src/*Store.ts` | **26** | `ls packages/geometry-*/src/*Store.ts \| wc -l` |
| Plugin DTO stores actually **contributed to the bus** | **22** | `grep -c buildStore apps/editor/src/PluginRegistry.ts` (lines 228–465) |
| Element stores registered into `storeRegistry` in-browser | **21** | ADR-0318 fact 1, `initStores.ts` `registerAllStores` |
| Element kinds **ABSENT headless** from the ADR-0318 registry | **11** | MT-04, probe 10/10, 2026-08-15 |

**The 22 bus-contributed plugin DTO stores**, with `PluginRegistry.ts` line: wall `229` · slab `248` ·
door `256` · window `264` · roof `272` · curtainwall `280` · grid `288` · column `296` · beam `304` ·
stair `312` · handrail `320` · ceiling `328` · floor `340` · furniture `348` · plumbing `356` ·
lighting `376` · rooms `390` · structural `399` · dimension `414` · selection `431` · annotation `447` ·
view `465`.

**The 11 kinds ABSENT headless** (MT-04, `BIM30-MASTER-COMPLETION-TRACKER.md` §2.7, re-measured
2026-08-15): roof, ceiling, floor, furniture, plumbing, stair, column, curtainwall, grid, beam,
handrail. Present in-browser via `registerAllStores`; PRESENT headless beyond door/window = **0**.

> **Correction to the brief's premise, measured.** `src/elements/` **does not exist**. The comment at
> `plugins/wall/src/store.ts:3` (*"Mirrors `src/elements/walls/WallStore.ts` (1,227 LOC)"*) is a stale
> reference to a deleted path. There is **no** third wall store there. (Stale-comment cleanup is
> logged in §8 as a zero-risk item.)

> **And a correction upward: there are FIVE store locations, not two.**
>
> | # | Location | Count | Kind |
> |---|---|---|---|
> | 1 | `plugins/*/src/store.ts` | 32 | plugin DTO stores (`Store<T>` from plugin-sdk) |
> | 2 | `packages/geometry-*/src/*Store.ts` | 26 | geometry stores |
> | 3 | **`packages/core-app-model/src/stores/*Store.ts`** | **18** | geometry stores — **includes 6 forks of #2** |
> | 4 | **`packages/stores/src/*Store.ts`** | **~30** | `Store<T>` classes; 3 are what PluginRegistry actually constructs |
> | 5 | **`packages/room-topology/src/RoomStore.ts`** | 1 | the *winning* room store |
>
> Plus `packages/core-app-model/src/views/*Store.ts` (10) for sheet / schedule / view / title-block.

### 3.2 — The two construction roots, and the fact that they never meet

There are exactly **two** places element stores are built, and both run in the same browser process.

**Root A — `apps/editor/src/engine/initBuilders.ts`** (the engine). Two disciplines per kind:
- *adopt the module singleton* via `attachEngine(): this` (verified to `return this` at
  `geometry-wall/src/WallStore.ts:253`, `geometry-slab/src/SlabStore.ts:133`,
  `room-topology/src/RoomStore.ts:178`): slab `:342`, room `:454`, wall `:551`, door/window `:537-538`
  (imported singletons, never constructed).
- *`new` a fresh instance*: Column `:288` · CurtainWall `:328` · CurtainPanel `:331` · Ceiling `:387` ·
  Floor `:418` · Roof `:574` · Plumbing `:627` · Opening `:678` · Furniture `:740` · Lighting `:846` ·
  Handrail `:872` · Stair/StairType/StairLanding/StairRailing `:910/916/919/923` · Lift/LiftType
  `:945/950` · Beam `:955` · Grid `:1002`.

**Root B — `apps/editor/src/PluginRegistry.ts` `ALL_PLUGINS`**, whose 22 `buildStore:` thunks are each
invoked exactly once at `apps/editor/src/bootstrap.everything.ts:142`. Fresh instance per bootstrap,
no singleton, no reuse of Root A. Reached in production at `src/main.ts:397-413`
(`bootstrapFn: bootstrapWithEverything` into `composeRuntime`).

> **⭐ The two roots never exchange references.** The only wiring between them is
> `packages/runtime-composer/src/composeRuntime.ts:1548-1559`, which registers the **geometry**
> singletons (door, window, wall, slab, room) into `storeRegistry` — **Root A's objects, not Root B's**.
> Root B is exposed only via `runtime.stores[storeKey]` → `apps/editor/src/bootstrap.ts:94`
> `storesProvider`.

### 3.3 — Per-family: TWO LIVE, ONE, or DEAD

**TWO LIVE** = two construction sites, both reachable, able to hold different records.

| Family | Root A (renders / serializes) | Root B (plugin bus DTO) | Same object? | Bridged? |
|---|---|---|---|---|
| **wall** | `geometry-wall/src/WallStore.ts` (1741) singleton, adopted `initBuilders.ts:551` | `plugins/wall/src/store.ts:27`, `PluginRegistry.ts:229` | **TWO LIVE** | creates + level only |
| **slab** | `geometry-slab/src/SlabStore.ts:318` singleton, `:342` | `plugins/slab/src/store.ts`, `:248` | **TWO LIVE** | creates, **by hand-translation** |
| **room** | `room-topology/src/RoomStore.ts:618` singleton, `:454` | `plugins/rooms/src/store.ts`, `:390` (key `'rooms'`) | **TWO LIVE** | **NO** |
| **door** | `geometry-door/src/DoorStore.ts:224` singleton | `plugins/door/src/store.ts`, `:256` | **TWO LIVE** | **NO** |
| **window** | `geometry-window/src/WindowStore.ts:199` singleton | `plugins/window/src/store.ts`, `:264` | **TWO LIVE** | **NO** |
| **roof** | `new RoofStore` `:574` (`geometry-roof/src/RoofStore.ts`, 210) | `plugins/roof/src/store.ts`, `:272` | **TWO LIVE** | creates + level |
| **column** | `new ColumnStore` `:288` | `plugins/column/src/store.ts`, `:296` | **TWO LIVE** | creates |
| **curtain-wall** | `new CurtainWallStore` `:328` + `new CurtainPanelStore` `:331` | `plugins/curtain-wall/src/store.ts`, `:280` | **TWO LIVE** | creates |
| **ceiling** | `new CeilingStore` `:387` (`core-app-model`) | `plugins/ceiling/src/store.ts`, `:328` | **TWO LIVE** | creates |
| **floor** | `new FloorStore` `:418` (`core-app-model`) | `plugins/floor/src/store.ts`, `:340` | **TWO LIVE** | creates |
| **beam** | `new BeamStore` `:955` (`core-app-model`) | `plugins/beam/src/store.ts`, `:304` | **TWO LIVE** | creates |
| **stair** | `new StairStore` `:910` + Landing `:919` + Railing `:923` + Type `:916` | `plugins/stair/src/store.ts`, `:312` | **TWO LIVE** | **NO** |
| **handrail** | `new HandrailStore` `:872` (`core-app-model`) | `plugins/handrail/src/store.ts`, `:320` | **TWO LIVE** | creates |
| **furniture** | `new FurnitureStore` `:740` | `plugins/furniture/src/store.ts`, `:348` | **TWO LIVE** | creates |
| **plumbing** | `new PlumbingStore` `:627` | `plugins/plumbing/src/store.ts`, `:356` | **TWO LIVE** | **NO** |
| **lighting** | `new LightingStore` `:846` | `plugins/lighting/src/store.ts`, `:376` | **TWO LIVE** | creates |
| **grid** | `new GridStore` `:1002` (`core-app-model`) | `plugins/grid/src/store.ts` (14 LOC), `:288` | **TWO LIVE** | **NO** |
| **annotation** | `plugins/annotations/src/subsystem/AnnotationStore.ts:395` singleton | **`packages/stores/src/AnnotationStore.ts:24`**, `:447` | **TWO LIVE — different classes entirely** | **NO** |
| **view** | `core-app-model/src/views/ViewDefinitionStore.ts` | `ViewRegistry` from `@pryzm/view-state`, `:465` | **TWO LIVE** | **NO** |
| **structural** | *(none)* | `plugins/structural/src/store.ts`, `:399` | ONE (Root B only) | n/a |
| **dimension** | *(none)* | `packages/stores/src/DimensionStore.ts:77`, `:414` (key `'dimension'` singular) | ONE | n/a |
| **selection** | — | `packages/stores/src/SelectionStore.ts:75`, `:431` | ONE | n/a |
| **opening** | `new OpeningStore` `:678` — Root A only | none | ONE | n/a |
| **lift** | `new LiftStore` `:945` + `LiftTypeStore` `:950` — Root A only | none | ONE | n/a |
| **sheet** | `core-app-model/src/views/SheetStore.ts:383` singleton | `plugins/sheets/src/store.ts` — **constructed nowhere** | Root A only; **plugin class DEAD** | n/a |
| **schedule** | `core-app-model/src/views/ScheduleStore.ts:280` singleton | `plugins/schedules/src/store.ts` — **constructed nowhere** | Root A only; **plugin class DEAD** | n/a |
| **section, plan-view, pool, bcf, cross, multiplayer, toy-cube, ifc-export** | — | `plugins/*/src/store.ts`, **no `ALL_PLUGINS` descriptor, no `new` anywhere** | **DEAD classes** | n/a |

**Eight families have a Root B store and NO bridge at all**: room, door, window, grid, stair,
structural, dimension, view. For these, two live objects can disagree with nothing reconciling them.

**Slab's bridge is a translation, not a copy.** `authoritativeElementMirror.ts:122-134` records that the
plugin record is *rejected verbatim* by the authoritative `SlabStore` (`invalid_type` on
`path:['position']`) — the plugin shape is `boundary`, the authoritative shape is
`polygon/position/width/depth`. `initTools.ts §FT1` performs that translation **by hand**.

### 3.4 — Six FORKED class files: same class name, different bodies, both exported

`packages/core-app-model/src/stores/` and `packages/geometry-*/src/` hold six same-named classes with
**different line counts** — real forks, not re-exports:

| Class | `core-app-model` copy | `geometry-*` copy | Imported by the app |
|---|---|---|---|
| `RoofStore` | 161 | **210** | geometry (`initBuilders.ts:81`) — **diverged by 49 lines** |
| `StairStore` | 187 | **194** | geometry — **diverged by 7 lines** |
| `StairTypeStore` | 72 | 73 | geometry |
| `FurnitureStore` | 55 | 55 | geometry (`:98`) |
| `LightingStore` | 63 | 63 | geometry (`:102`) |
| `PlumbingStore` | 40 | 40 | geometry (`:85`) |

The `core-app-model/stores` copies are **exported**
(`packages/core-app-model/src/stores/index.ts:186,194,195,207,211`) yet have **zero non-test importers**
across `apps/editor/src`, `packages`, `plugins`. **Dead-but-exported forks** — and two of them have
already drifted. `BeamStore`, `CeilingStore`, `FloorStore`, `HandrailStore`, `OpeningStore`, `GridStore`
exist **only** in `core-app-model/src/stores/` and are the live ones.

### 3.5 — What IS proven about identity, and exactly how far it reaches

`apps/editor/src/engine/authoritativeStores.ts` builds ONE record (`engineLauncher.ts:916-943`);
`toRegistryBundle` (`:104`) and `toSerializerBundle` (`:145`) are pure property reads off it. For the
15 keys in `SHARED_STORE_KEYS` (`authoritativeStores.ts:78-94`) **the StoreRegistry object IS the
ProjectSerializer object**, proven on the heap with `toBe` across 15 kinds by
`apps/editor/src/engine/__tests__/mt05StoreIdentityHeap.spec.ts` (ARM A), with a negative control
(ARM B) and a completeness arm (ARM C); ARM D is a source scan and self-declares that limit at `:40-47`.

> **This proof covers Root A only. It says nothing about Root A vs Root B** — which is the duality this
> audit is about. It is the right proof, aimed at the adjacent question.

MT-05's residual risk is *narrower than the tracker states but still real*: `initUI.ts:2227`
(`window.curtainWallStore = curtainWallTool.store`) and `initUI.ts:2290`
(`window.columnStore = columnTool.store`) are the only two `window.*Store` assignments not taken
directly from the launcher instance, and `initUI` runs at `engineLauncher.ts:949` — **before** the
guard at `engineLauncher.ts:998-1003`, which *throws* if either global differs from its instance. The
guard passes today because `initTools.ts:954/962` pass those exact instances in. **It is a live runtime
assertion, not a construction-time proof.**

### 3.6 — The second renderer: dormant, and pointed at the wrong store set

`apps/editor/src/bootstrap.render.everything.ts:118` reads **`inner.stores.wall`** — the **Root B**
plugin DTO store — and `bindStore`s it plus slab/door/window to a `CommitterHost` with its own
`Renderer.init(canvas)` (`:160-169`). A complete second render pipeline over the *other* store set.

It is reachable only via `composeRuntime.ts:1396-1401` → `runtime.scene.mount(canvas)`, and
`src/main.ts:407` passes `canvas: null`. **No production `runtime.scene.mount(` call site exists** —
only doc comments in `buildCameraControllerSlot.ts`, `buildPickingSlot.ts`, `PlatformShell.ts:81`.

> **Classification: not a live duality, but the highest-severity loaded gun in the audit.** One
> `mount()` call paints a scene from the store set nothing else reads or persists. Any lane wiring the
> renderer mount (Phase D.3) must read §8 first.

---

## 4 — Census: BUILDERS

### 4.1 — ⭐ The dominant finding: TWO complete parallel geometry stacks, and they do not render the same thing

This dwarfs every per-family builder duplication, and it is **not** dead code — which is why it is
ranked first.

| | Stack | Entry | Size |
|---|---|---|---|
| **A** | **Legacy editor builders — LIVE in the viewport** | `apps/editor/src/engine/initBuilders.ts` (1153 LOC) instantiates 20 builders from `packages/geometry-*`, driven by DOM `bim-*-added/updated/removed`; called from `engineLauncher.ts:337` | 20 builders |
| **B** | **L4 kernel producers + plugin committers — DORMANT in the viewport** | `plugins/*/src/committer/*-committer.ts` (20 files, 3463 LOC) calling `produce*()` from `packages/geometry-kernel/src/producers/` (26 files) | ~14,128 LOC kernel |

**Why Stack B does not render, measured as a chain:**

1. `packages/runtime-composer/src/composeRuntime.ts:1397` imports `bootstrap.render.everything` — but
   only inside `runScene` (`:1389`).
2. `runScene` runs only from `opts.canvas` or `runtime.scene.mount(canvas)`.
3. `src/main.ts:407` passes **`canvas: null`** — *"No canvas in the white-UI boot path — `scene.renderer`
   slot stays null until Phase D.3 consolidates the renderer mount."*
4. The only other candidate, `apps/editor/src/ui/platform/PlatformShell.ts:79-85`, **does not call
   `scene.mount`** — it only `console.debug`s that the slot exists.

⇒ `bootstrapRenderEverything` is never invoked ⇒ `apps/editor/src/bootstrap.render.everything.ts:155-158`
never runs ⇒ **zero committers register**, and every `produce*` in `geometry-kernel/src/producers/` has
**zero production render call sites**.

**And even if it were mounted, it covers 4 of 20 families.**
`bootstrap.render.everything.ts:137-170` builds and binds exactly `wall`, `slab`, `door`, `window`.
The other **16 committers** (roof, ceiling, stair, handrail, curtain-wall, column, beam, furniture,
plumbing, lighting, structural, grid, rooms, dimensions, annotation, toy-cube) are written, exported,
and **never registered by any non-test code**.

> ⭐ **The part that makes this HARMFUL rather than merely DEAD.**
> `apps/bake-worker/src/session/HeadlessBakeSession.ts:23,131` **does** call `produceWall` for real.
> **Stack B is live for bake/export while Stack A is live for the interactive viewport.** These are two
> independent implementations of the same geometry, and they have already drifted — see §4.2 copy #3.
> This is not dead code; it is an **editor-vs-bake geometry divergence** with no gate comparing them.

### 4.2 — The seed, confirmed and worse: `buildCurvedLayerGeometry` exists THREE times

| # | Location | LOC | Output |
|---|---|---|---|
| 1 | `packages/geometry-wall/src/CurvedWallLayerBuilder.ts:36-218` (+ `computeStations` `:224-260`) | 260 (file) | `THREE.BufferGeometry` |
| 2 | **inline copy** `packages/geometry-wall/src/WallFragmentBuilder.ts:1607-1838` | ~231 | `THREE.BufferGeometry` |
| 3 | `packages/geometry-kernel/src/producers/_internal/buildCurvedLayer.ts:56-176` (+ `computeStations` `:25-54`) | 177 (file) | plain `RawGeometry` typed arrays |

**#2 is a near-verbatim duplicate of #1**, verified line-for-line: `:1646-1664` duplicates
`computeStations` (`:238-257`), identical tangent/normal math and identical `nx:-tz, nz:tx`;
`:1637-1639` `halfT`/`yBot`/`yTop` == `:48-50`; `:1706-1707` corner table == `:84-85`; `:1730-1786`
all six face groups + both caps are **triangle-for-triangle identical** to `:157-210`, same winding,
same push order; **both carry the same copy-pasted 15-line `§FIX-CURVED-WALL-MITER-WATERTIGHT`
comment** (`:1692-1705` vs `:69-83`).

**Both are called** — a live fork split by an `if`: `WallFragmentBuilder.ts:1607`
(`wall.curve && no layers`) runs the inline copy; `:1844` (`wall.curve && layers.length > 0`) calls the
extracted one at `:1880`, second call site `:2833`. The only difference is `layerOffset` (copy #2
hardcodes 0 by omission) — **the extracted function with `layerOffset=0` produces byte-identical
geometry.** A true rival implementation of one decision, inside one file, chosen by a layer-count branch.

> ⭐ **Copy #3 is a REGRESSION of the fix applied to #1 and #2.** `buildCurvedLayer.ts:133-137, 159-165`
> projects miter caps **only on the cap quad** and never writes back into an `outerPt/innerPt` corner
> table; the face loops `:95-118` consume unprojected `layerStations`. It still has the exact
> non-watertight bug `#1`'s comment says was fixed. **Combined with §4.1, a curved wall baked or
> exported through the kernel is non-watertight while the same wall in the viewport is watertight.**
> This is the single clearest user-visible consequence in the builder census.

### 4.3 — Wall body extrusion: two rivals both live, plus a parked third

Repo memory said *"plain→CSG single-volume, LAYERED→grid"*. **Partially wrong — CSG is default-OFF and
known-broken.** `buildWall()` (`WallFragmentBuilder.ts:858`) routes openings to:

| Path | Site | Status |
|---|---|---|
| plain straight + openings → segmented boxes / `buildWallHoleBodyGeometry` | `WallHoleBodyBuilder.ts` (171 LOC), imported `:30` | **DEFAULT LIVE** |
| plain straight + openings → CSG single volume | gate `:2334-2350`, producer `:2376` | **OPT-IN, DEFAULT OFF** |
| layered straight + openings → per-layer grid | `:1263`, `LayeredWallOpeningBuilder.ts` (510 LOC) | LIVE |
| curved + openings | `_buildCurvedWallWithOpenings` `:2733`, `CurvedWallOpeningBuilder.ts` (297 LOC) | LIVE |

The CSG arm is gated on `window.__wallSingleVolume === true` (`:2339`); the comment at `:2326-2333`
records that it *"shipped a malformed cut in production: the CSG void's vertical datum does not match
the door/window mesh placement… leaving uncut wall across the opening's lower portion."* **A rival that
was tried, failed, and is parked behind a flag** — not a live duality, but a loaded gun.

**Two rival body extruders ARE both live:**
- `buildMiterPrism` — `MiterPrismBuilder.ts` (282 LOC), called at `:1348, :1506, :2094, :2215, :2261, :3618, :3650`
- `buildWallExtrusion` — `WallPolygonExtruder.ts` (289 LOC), called at `:1451` and `WallPipelineV2.ts:586`

`WallPipelineV2` (615 LOC) is **default-ON**: `isWallPipelineV2Enabled()` returns `false` only on an
explicit `globalThis.__pryzmWallPipelineV2 === false` (pinned by
`packages/ai-host/__tests__/wallPipelineV2.test.ts:41,44`). Gates at `WallFragmentBuilder.ts:1015, 1416,
2065, 3500`; V2 geometry built at `:3529`. **V1 and V2 are both reachable in one build**, selected
per-branch.

### 4.4 — The ten Y-datum sites: which pairs actually co-occur on ONE wall

The question posed to this census was whether the ten independent `yBot`/`yTop` computations are rival
implementations of one decision or legitimately distinct strategies. **Measured answer: at least two
pairs co-occur on a single wall, and those are harmful; the rest are not proven either way.**

| pair | co-occurs? | consequence |
|---|---|---|
| `WallHoleBodyBuilder.ts:133-134` (body) **+** `MiterPrismBuilder.ts:86-87` (end/join segments, via `WallFragmentBuilder.ts:2215, 2261` inside the opening-cluster loop) | **YES — same wall, same build** | two files independently recompute the vertical extent of **two pieces of one continuous solid that share a vertical seam**. Any divergence in rake handling or rounding is **a visible seam at the opening jamb** |
| `WallPolygonExtruder.ts:104-107` (V2 body) **+** `MiterPrismBuilder.ts:86-87` (legacy fallback) | **YES — by construction** | `WallFragmentBuilder.ts:1416` guards `isWallPipelineV2Enabled() && _layCache && _layMiter && !_layMiter.invalid`, so an **invalid miter drops that wall's layer to the legacy arm while neighbouring walls stay on V2** — a per-wall mixed-datum condition |
| `WallFragmentBuilder.ts:1638-1639` (inline curved) **+** `CurvedWallLayerBuilder.ts:49-50` | **NO** — mutually exclusive on layer count | maintenance hazard, not a seam |
| the remaining six sites (`WallInstanceBridge.ts:105,111,147,151`; `WallJunctionInfillManager.ts:122-123`; `LayeredWallOpeningBuilder.ts:140-141,205`; `WallFragmentBuilder.ts:1237/2112/2138/2186/2233/2371-2390`) | **NOT MEASURED** | input divergence not checked |

### 4.5 — Roof: one live stack, one dead hand-port rival

| Builder | LOC | Role |
|---|---|---|
| `packages/geometry-roof/src/RoofGeometryBuilder.ts` | 1540 | **LIVE** core generator |
| `packages/geometry-roof/src/RoofFragmentBuilder.ts` | 346 | **LIVE** scene wrapper (`initBuilders.ts:594`, wired `:602-623`, `setDeps` `:702`) |
| `packages/geometry-roof/src/pure/roofFaces.ts` | 697 | **STAGE** — imported by `RoofGeometryBuilder.ts:15` |
| `packages/geometry-kernel/src/producers/roof.ts` | 300 | **RIVAL, dead in render** |

`producers/roof.ts:3` self-documents as *"S10-T7 — port of PRYZM 1's `RoofGeometryBuilder.generate()`
(875 lines)"*, and five `_internal/roof/*` files each cite the specific `RoofGeometryBuilder` line range
they were lifted from (`buildExtruded.ts:2`, `buildMultiLevel.ts:3`, `buildVariableHeight.ts:4`,
`polygon.ts:3,84`, `roofFormResolution.ts:12`). **A hand-port rival**, exercised only by
`produceRoof.{flat,gable,hip,mansard,mono}.test.ts` and `apps/bench/.../produce-roof.bench.ts`.

> **Handover to the concurrent roof lane:** `pure/roofFaces.ts` **already exists** on this branch —
> 697 LOC exporting `computeRoofFaces:243`, `faceYAt:499`, `resolveHostFace:609`,
> `checkOpeningWithinFace:670`, already consumed by `RoofGeometryBuilder.ts:15`. The
> "roof faces are unaddressable outside the builder" gap **appears already closed**; a second one would
> be a duplicate.

### 4.6 — Families with NO rival (stated so the census is not read as universal)

- **Stair** — `StairMeshBuilder.ts` (731) LIVE (`initBuilders.ts:914`); `StairStringerBuilder.ts` (175)
  is a STAGE constructed at `StairMeshBuilder.ts:52`; `StairRailingBuilder.ts` (1224) and
  `StairLandingBuilder.ts` (99) are LIVE siblings building *different geometry* (`:921,926`);
  `StairPreviewRenderer.ts` (679) + `CurvedStairRenderer.ts` (384) are Canvas2D overlay previews
  (`getContext` at `:77`/`:49`), constructed at `StairPathToolController.ts:295-296`. **Cleanest family
  audited.** Kernel `producers/stair.ts` is the dead rival.
- **Slab / floor / ceiling** — `SlabFragmentBuilder.ts` (1282, private `buildSlabGeometry:917` called
  once at `:1163`), `FloorPanelBuilder.ts` (452), `CeilingPanelBuilder.ts` (462) are **three different
  things** (structural slab vs floor finish vs ceiling finish), all live (`initBuilders.ts:348, 422, 391`).
  **Not rivals.**
- **Curtain wall** — `CurtainWallBuilder.ts` (2292) → `CurtainPanelBuilder.ts` (61) →
  `CurtainPanelFactory.ts` (967) are **STAGES**: `CurtainPanelBuilder.ts:4` calls itself *"Thin façade
  over `CurtainPanelFactory.buildPanelObject()`"*, imports it `:30`; `CurtainWallBuilder.ts:279`
  constructs the façade.
- **Column** — `ColumnFragmentBuilder.ts` (561) live (`:298`); `ColumnSectionGeometry.ts` (160) is a
  STAGE for the plan symbol only (`ColumnPlanSymbolBuilder.ts:46`).
- **Beam** — single builder `BeamFragmentBuilder.ts` (517), `:959`. No duplication.
- **Door / window** — `DoorBuilder.ts` (947) / `WindowBuilder.ts` (1135) live (`:708,711`);
  `*PlanSymbolBuilder` / `*Section.ts` are different *representations* (plan/section), not rivals;
  `*OpeningFactory.ts` produce void cutters — stages.
- **Furniture** — `FurnitureFragmentBuilder.ts` (413) live (`:743`); `builders/` + `engines/`
  (~19,822 LOC) are a **dispatch catalogue** via `builders/FurnitureFactory.ts` (303), not rivals.
- **Handrail** — `HandrailFragmentBuilder.ts` (350) live (`:876`).

### 4.7 — Dead / zero-importer geometry inventory

- **All 26 `packages/geometry-kernel/src/producers/*.ts`** — zero production *render* call sites.
  Largest single block of render-dead geometry in the repo. **But see §4.1: live for bake/export.**
- **16 of 20 `plugins/*/src/committer/*-committer.ts`** — never registered by non-test code.
- **`buildCurvedLayer.ts:56`** (copy #3) — dead in render *and* stale relative to #1/#2.
- `packages/geometry-wall/src/descriptorToBufferGeometry.ts` (68 LOC) — 1 non-test importer;
  **NOT MEASURED** whether that importer is itself reachable.

## 5 — Census: COMMANDS

### 5.1 — The two arms do not share a namespace, so string-level overlap is structurally near-zero

`packages/command-registry/src` is a discovery root for the register (`check-verb-register.ts:106`) but
contributes **zero rows**. Only 3 files in the package carry a `readonly type = '…'` literal and all
three are UPPER_SNAKE `CommandType` names (`CreateBeamCommand.ts:66` `'CREATE_BEAM'`,
`UpdateBeamCommand.ts:12`, `AssignBeamSupportsCommand.ts:15`); `TYPE_DECL_RE`
(`check-verb-register.ts:135-139`) requires a lowercase first character. Owner tally over all 326 rows:
**81 `apps/editor` + 245 `plugins/*` + 0 `command-registry`.**

The 272 exported `*Command` classes are keyed by UPPER_SNAKE in `apps/editor/src/engine/CommandRegistry.ts`
(119 map entries). **Arm A's only bus-facing declaration site is `initBusHandlers.ts`.** So "declared in
both arms" means *plugin handler + `initBusHandlers`*.

### 5.2 — Liveness, and where the register disagrees with source

| class | register (`API-VERB-REGISTER.md:14-26`) | source-corrected |
|---|---|---|
| verbs total | 326 | 326 |
| LIVE | 118 | 118 |
| REFUSES | 37 | 37 |
| SHADOWED | **0** | **1** |
| UNKNOWN | 171 | **170** |

**The one false negative:** `stair.batch.create` is declared twice — `CreateStairBatch.ts:61`
(`readonly type = …`) and `initBusHandlers.ts:445` (`{ type: 'stair.batch.create', stores: ['stair'] }`).
`TYPE_DECL_RE` anchors on `(?:^|\n)\s*(?:public\s+|readonly\s+|static\s+)*type\s*`; the `{ ` before
`type` defeats the anchor. **The shadow is benign** — the losing bridge is a structural stub returning
`{patches: []}` (`:446-449`), not a `commandManager` route — but the gate cannot see it.

**A second, latent masking path:** `check-verb-register.ts:872-873` orders `if (doesRefuse) … else if
(shadowed)`, and `doesRefuse` is `sites.some(...)` (`:861`). Any dual-site verb where *either* arm
refuses publishes as `REFUSES` and its second site is never disclosed. 37 verbs are `REFUSES`; none is
dual-site today, so this is latent, not firing.

**Executed liveness** (`check-verb-liveness.ts`, GROW-ONLY ratchet, run by this lane, **RC=0**):
**PROVEN 7 / baseline 7**; **UNPROVABLE-NO-STORE 109**; **UNKNOWN 210** (119 not-attempted,
7 dispatch-threw, 5 seed-failed, 3 no-handler-registered, and **~76 across 24 families for which the
gate has no census entry** — *"this gate has not established which store is authoritative for it"*).
The gate's own closing line: *"Neither is a pass; both are the work."*

### 5.3 — Registration order decides the winner, and it is invisible in the file you edit

`CommandBus.register()` **throws** on a duplicate (`packages/command-bus/src/CommandBus.ts:99-102`);
alias collisions are equally fatal (`:128-138`). Every later registrar therefore *skips*:
`initBusHandlers.ts:451, 499, 2589, 2732`, and the `engineLauncher.ts:513-525` Proxy whose own comment
reads *"first registration wins is exactly the shipped behaviour"*. Boot order: `composeRuntime()`
(`engineLauncher.ts:131`) → `initBusHandlers` (`:468`) → `registerXxxHandlers` (`:538-652`).

> **⇒ THE PLUGIN ARM WINS BY DEFAULT, SILENTLY.** An `initBusHandlers` bridge is dead code for any verb
> a plugin already claims. This is the mechanism behind L-839, and it is why ADR-0331 §D2 (retire the
> plugin handler) *removes* a shadow rather than adding a mechanism.

**Direction is per-verb, not universal** — three recorded reversals: `registerViewHandlers()` runs at
`engineLauncher.ts:605`, *after* `initBusHandlers`, so the bridge won `view.setCrop` and
`view.updateDefinition`; and the *plugin* was the correct winner for `furniture.updateParameters` and
`stair.move` because it carried the L-72 undo capture.

**Two stale citations inside the checker itself**: `check-verb-register.ts:181` cites `CommandBus.ts:94`
(actual `:101`); `:184` cites `initBusHandlers.ts:2202` (actual `:2589`).

### 5.4 — `DEAD_VERBS`: the source says 15, four governance docs say 13, the test comment says 8

Sole definition: `packages/ai-host/__tests__/chat-capability-registry.test.ts:402-421` (referenced from
`ChatCapabilityRegistry.ts:913`). **15 entries**: `window.setSize`, `window.setSillHeight`,
`door.setWidth`, `slab.setThickness`, `roof.setThickness`, `roof.setPitch`, `stair.setWidth`,
`ceiling.setHeight`, `wall.setColor`, `wall.bulkSetVisuals`, `stair.setRiserHeight`,
`stair.setTreadCount`, `slab.setBaseOffset`, `roof.setOverhang`, `lighting.setIntensity`.

**Disagreement:** `C68-ELEMENT-CHAT-ONBOARDING.md:279`, `RAC-IMPLEMENTATION-PLAN.md:20` and `:34`, and
`ADR-0315-universal-capability-architecture.md:126` all say **13**; the test's own comment at `:406` says
**8**. The pre-P1 half was 10, so 13 matches neither the current nor the prior state. **This is the
hand-transcribed count C69 §0.1 exists to forbid, inside the documents that cite C69.**

### 5.5 — Orphaned legacy commands

`UpdateCurtainWallCommand` is **NOT orphaned today** — the `DEAD-WRITE-REMEDIATION-PLAN` claim is stale.
`initBusHandlers.ts:985` declares `wall.updateCurtainWall` and `:988` bridges it; the plugin rival was
removed (`plugins/curtain-wall/src/handlers/index.ts:61`); pinned by
`CurtainWallUpdateReachesGeometryStore.test.ts:121`.

**19 of the 272 `*Command` classes are genuinely orphaned** — no bus verb, no `CommandRegistry.ts` entry,
no caller anywhere: `ApplyVGTemplateToViewCommand`, `AssignViewTemplateToViewCommand`,
`CaptureViewVGAsTemplateCommand`, `CreateIntentFromViewCommand`, `CreateVGTemplateCommand`,
`DeleteRequirementCommand`, `DeleteScheduleCommand`, `DeleteSheetCommand`,
`DeleteVisibilityIntentCommand`, `GhostElementInViewCommand`, `ReplacePanelWithDoorCommand`,
`SetGeoreferenceCommand`, `SetSheetLayoutRuleCommand`, `SetViewSemanticsCommand`,
`ToggleVisibilityRuleCommand`, `UnbindViewIntentCommand`, `UpdateAIElementParametersCommand`,
`UpdateDataPanelCommand`, `UpdateVGTemplateCategoryStyleCommand`. Heavily view/VG/sheet-skewed.
*Caveat: identifier-name-based scan; a class reached only by a dynamically-built key would be missed.*

## 6 — Census: BRIDGES — what each covers, and what it does NOT

### 6.1 — `initTools.ts`: twelve bridges, twelve creates, one mutation channel

| # | line | event | legacy sink |
|---|---|---|---|
| 1 | `initTools.ts:1059` | `wall.created` | `wallTool.getWallStore()` + VDT + bimManager |
| 2 | `initTools.ts:1260` | `wall.opening.created` | legacy `WallStore` openings |
| 3 | `initTools.ts:1408` | `curtain-wall.created` | `curtainWallStore` |
| 4 | `initTools.ts:1511` | `ceiling.created` | `ceilingStore` |
| 5 | `initTools.ts:1591` | `roof.created` | `roofStore` (mapping in `roofCreatedMirror.ts`) |
| 6 | `initTools.ts:1636` | `column.created` | `columnStore` |
| 7 | `initTools.ts:1708` | `slab.created` | `slabStore` |
| 8 | `initTools.ts:1773` | `beam.created` | `beamStore` |
| 9 | `initTools.ts:1824` | `floor.created` | `floorStore` |
| 10 | `initTools.ts:1919` | `handrail.created` | `handrailStore` |
| 11 | `initTools.ts:1967` | `lighting.created` | `lightingStore` |
| 12 | `initTools.ts:2031` | `furniture.created` | `furnitureStore` |

**Mutation subscriptions, repo-wide: ONE.** `initTools.ts:1234` → `registerElementLevelChangeBridge` →
`elementLevelChangedMirror.ts:241` on `element.level-changed`. A repo-wide search for
`events.on('<x>.updated|.deleted|.moved|.changed')` across `apps/`, `packages/`, `plugins/` returns
**2 hits**: that one, and `composeRuntime.ts:315` (`selection.changed` — not a geometry bridge).
The file states it itself at `initTools.ts:1216-1217`: *"Every bridge above and below this one
subscribes to a `.created` event — twelve of them. That is the whole defect."*

### 6.2 — ⭐ THE LARGEST SINGLE GAP: `*.delete` — ten families, zero bridges

Measured directly, not inferred. Each writes `produceCommand(ctx.stores.<kind>)` + `delete draft[id]`
and contains **zero** `commandManager` references:

| handler | store written | `commandManager` refs |
|---|---|---|
| `plugins/wall/src/handlers/DeleteWall.ts:60` | `ctx.stores.wall` | 0 |
| `plugins/slab/src/handlers/DeleteSlab.ts:38-39` | `ctx.stores.slab` | 0 |
| `plugins/column/src/handlers/DeleteColumn.ts:39-40` | `ctx.stores.column` | 0 |
| `plugins/beam/src/handlers/DeleteBeam.ts:33-34` | `ctx.stores.beam` | 0 |
| `plugins/ceiling/src/handlers/DeleteCeiling.ts:31` | `ctx.stores.ceiling` | 0 |
| `plugins/roof/src/handlers/DeleteRoof.ts:37-38` | `ctx.stores.roof` | 0 |
| `plugins/handrail/src/handlers/DeleteHandrail.ts:31` | `ctx.stores.handrail` | 0 |
| `plugins/lighting/src/handlers/DeleteLighting.ts:37-38` | `ctx.stores.lighting` | 0 |
| `plugins/furniture/src/handlers/DeleteFurniture.ts:39-40` | `ctx.stores.furniture` | 0 |
| `plugins/curtain-wall/src/handlers/DeleteCurtainWall.ts:39-40` | `ctx.stores.curtainwall` | 0 |

There is **no `*.deleted` event emitted by `CommandEventBridge.ts`** and **no `*.deleted` subscriber
anywhere in the repo**. Ten verbs, all the L-946 shape: dispatch succeeds, the plugin store is correct,
the store the renderer reads never hears, **the mesh stays on screen**.

> ⚠ **Honest caveat, stated because it changes the ranking.** This lane did **NOT MEASURE** which UI
> surface dispatches `<kind>.delete`. The editor's delete button may route through the legacy
> `DeleteElementCommand` on `commandManager` instead. The register's `UNKNOWN` liveness for all ten
> says nobody else has measured it either. **The bus verbs are unbridged regardless** — but whether a
> *user* can reach the defect today is unproven, and §8 sequences the probe before the fix
> (STR-03 §12.3 invariant 2).

### 6.3 — Creates bridged, mutations not: the full per-family gap table

Liveness from `docs/04-reference/API-VERB-REGISTER.md`; `UNKNOWN` = *"a lone plugin `produceCommand`
handler; nobody has proven either way"* (`API-VERB-REGISTER.md:38`).

| family | `.created` bridge | verbs with NO bridge and NO refusal (**L-946 shape**) | count |
|---|---|---|---|
| **curtain-wall** | `:1408` | `.move .delete .resize .setGrid .setOutline .setMullionType .setTransomType .setPanelType .addGridLine .removeGridLine .addPanel .removePanel .replacePanel .rotatePanel .swapPanel .batch.update .batch.delete` | **17** |
| **slab** | `:1708` | `.delete .update .updatePolygon .updateLayers .setThickness .setType .setBaseOffset .addHole .removeHole` | 9 |
| **roof** | `:1591` | `.delete .setPitch .setShape .setThickness .setOverhang .addSkylight .removeSkylight .joinRoofs` | 8 |
| **wall** | `:1059` | `.cut .delete .join .split .setSystemType .createBetweenMarks .createFromSlab` | 7 |
| **furniture** | `:2031` | `.delete .setScale .setRepresentation .setActiveLod .updateParameters` | 5 |
| **handrail** | `:1919` | `.delete .setPath .setShape .setHost .recompute` | 5 |
| **ceiling** | `:1511` | `.delete .setBoundary .setHeight .updateLayers` | 4 |
| **column** | `:1636` | `.delete .setHeight .setType` | 3 |
| **beam** | `:1773` | `.delete .setSection .setType` | 3 |
| **lighting** | `:1967` | `.delete .setIntensity .setEmergency` | 3 |
| **floor** | `:1824` | `.updateLayers` | 1 |

`wall.changeLevel` / `roof.changeLevel` are the **only two mutation verbs covered**, by
`elementLevelChangedMirror.ts:104-105`.

### 6.4 — Events emitted into the void

`CommandEventBridge.ts` emits nine events with **zero `events.on` subscribers** repo-wide (only type
declarations in `packages/runtime-composer/src/types.ts`):

| event | emitted | typed | subscribers |
|---|---|---|---|
| `slab.layer-updated` | `CommandEventBridge.ts:937` | `types.ts:443` | **0** |
| `ceiling.layer-updated` | `:957` | `types.ts:575` | **0** |
| `floor.layer-updated` | `:977` | `types.ts:742` | **0** |
| `room.created` | `:689` | `types.ts:585` | **0** |
| `grid.created` | `:699` | `types.ts:592` | **0** |
| `plumbing.created` | `:854` | `types.ts:653` | **0** |
| `structural.created` | `:864` | `types.ts:660` | **0** |
| `annotation.created` | `:874` | `types.ts:667` | **0** |
| `dimension.created` | `:884` | `types.ts:674` | **0** |

The three `*.layer-updated` are the **only** mutation-shaped events CEB emits besides
`element.level-changed`, and all three fall on the floor. `door.created` / `window.created` /
`stair.created` cases were already deleted for the same reason (`CommandEventBridge.ts:627-631`) —
precedent that deleting an unsubscribed emitter is an accepted move here.

### 6.5 — `initBusHandlers.ts`: 83 registrations, a parallel vocabulary

| block | lines | count | `affectedStores` |
|---|---|---|---|
| `__bridges: BridgeSpec[]` (decl `:541`, loop `:2585-2591`) | 904–2583 | **76** | 5 non-empty, 71 `stores: []` |
| `__batchTypes` structural stub | `:436-463` | 1 (`stair.batch.create` `:445`) | `['stair']`, but `execute` returns `{patches: []}` (`:457`) |
| `_projectOriginCmds` | `:475-520` | 2 | `['projectOrigin']` (`:503`) |
| `__generationVerbs` | `:2671-2757` | 4 | `[]` (`:2736`) |
| **total `type:` registrations** | | **83** | |

The five with ring-buffer undo: `column.update` (`:922/923`), `beam.update` (`:930/931`),
`floor.update` (`:938/939`), `slab.movePolygon` (`:1102/1103`), `handrail.moveBaseLine` (`:1128/1129`).

**What it does NOT cover:** the bridged verbs are a **parallel vocabulary**, not the plugins'.
`roof.update` / `column.update` / `ceiling.update` / `wall.updateColor` / `wall.updateDimensions` /
`slab.updateDimensions` are `apps/editor`-declared verbs (`API-VERB-REGISTER.md:220,80,70,351,354,277`);
the plugin families declare a *different, larger* set (`roof.setPitch`, `roof.setShape`,
`slab.setThickness`, `ceiling.setHeight`, …) — **none of which appear in `__bridges`**. And **no
`*.delete` verb of any element family is bridged here.**

### 6.6 — The other mirrors, and their declared holes

| file | mirrors | GAP |
|---|---|---|
| `apps/editor/src/engine/elementLevelChangedMirror.ts` (257 L) | `element.level-changed` → legacy `wallStore`/`roofStore.changeLevel` (`:104-105`) | 2 kinds; the level field only |
| `apps/editor/src/engine/roofCreatedMirror.ts` (106 L) | `roof.created` payload → legacy `RoofData` | create-only |
| `packages/runtime-composer/src/authoritativeElementMirror.ts` (206 L) | `add` patches → authoritative store. `MIRRORED` (`:105-108`) = **`wall.create`, `wall.batch.create` ONLY** | **self-documented at `:117-145` (`UNMIRRORED_KINDS`)**: `slab` excluded (shape mismatch — plugin emits `boundary`, authoritative store demands `position`); `room` excluded (`CreateRoomHandler` declares `affectedStores: []`) |

### 6.7 — Rebuild coordinators: exactly one file

`apps/editor/src/engine/WallRebuildCoordinator.ts:471` subscribes to `deps.wallTool.getWallStore()` —
the **legacy** `@pryzm/geometry-wall` store. It never reads the plugin Immer `wall` store. There is no
`SlabRebuildCoordinator` / `RoofRebuildCoordinator` / etc.; every other family's rebuild rides its own
store-subscribing builder — **NOT MEASURED per family which store each subscribes to.**

### 6.8 — `material-bridge.ts` × 18 — appearance translators, not state bridges

`plugins/<kind>/src/committer/material-bridge.ts` for beam (25 L), ceiling (33), column (30),
curtain-wall (67), dimensions (28), door (62), furniture (46), grid (27), handrail (16), lighting (50),
plumbing (41), roof (56), rooms (36), slab (54), stair (32), structural (28), wall (51), window (88).

They translate a pipe-separated `MaterialKey`
(`wall|<systemTypeId>|<materialId>|<color>|<layerName>`, `plugins/wall/src/committer/material-bridge.ts:8-10`)
into a `THREE.MeshStandardMaterial` factory for `MaterialPool.acquire(key, factory)` (`:39-51`).
**They carry no identity, level or geometry** — this is NOT the store duality, and must not be counted
as it.

**Their real defect is different and smaller:** the key is parsed positionally with a **silent**
fallback — `:34-36` returns `FALLBACK_COLOR = '#d4c5b0'` on any key whose slot count ≠ 5 or whose
prefix ≠ `'wall'`, **with no diagnostic**. A drifted key spelling degrades to default beige silently.
That is STR-03 §12.3 invariant 1 (*failure and emptiness are never the same value*) violated 18 times.

## 7 — Classification of every finding *(C84 §3.5 verdicts, with the test applied)*

### 7.1 — HARMFUL DUALITY, ranked by user-visible risk

| # | Finding | Evidence | User-visible? |
|---|---|---|---|
| **H1** | **Viewport ≠ bake for a mitered curved wall** — `CurvedWallLayerBuilder.ts:69-83` writes back into the corner table; `buildCurvedLayer.ts:133-137,159-165` does not | **EXECUTED: 9.774 m**, `stackAB-miter-parity.test.ts` | **YES** — bake/export differs from screen (self-host) |
| **H2** | **The same line drawn in PLAN vs 3D builds different geometry** (handrail: `fillType` never crosses the bridge) | handrail lane, runtime-proven | **YES** |
| **H3** | **Wall Y-datum authority ≠ hosted-leaf Y-datum authority** — §10.5 | `WallFragmentBuilder.ts:728` vs `DoorBuilder.ts:498` / `WindowBuilder.ts:818`; `slabBaseOffset` count in geometry-door + geometry-window = **0** | **LATENT** — invisible at `baseOffset=0`; blocks raked/layered walls |
| **H4** | **One store key, two objects** — write-time `'wall'` = DTO store; undo-time `'wall'` = `window.wallStore` | `performUndoRedo.ts:308-353`, 24 keys / 21 globals | **YES** — inverse patch on a store that never got the forward |
| **H5** | **Colour-name→hex drifted across 6 tables** — `black` `#333333` vs `#000000`; `green` `#008000` vs `#00ff00` | `QueryEngine.ts:1139` vs `:727`; `PropertyRenderer.ts:209` vs 4 others | **YES** — one word, two colours in one session |
| **H6** | **`element.delete` vs `BimService.deleteSelected()`** — lighting/opening deleted nothing from the context menu | `DeleteElementCommand.ts:651` tail | **YES — FIXED this lane** (§FIX-ONE-DELETE-PATH) |
| **H7** | **Style alias maps drifted** — `rustic`→mediterranean vs →farmhouse; `modern`→minimalist vs →japanese | `styleFinish.ts:246` vs `StyleRegistry.ts:283` | **YES** |
| **H8** | **`ElementType` spelled two ways** — `curtain-wall` vs `curtainwall` ⇒ IFC fallback | `CoreElement.ts:86` / `:102` | **YES** — curtain walls export as `IfcBuildingElementProxy` |
| **H9** | **Openings have two authoritative copies** — `OpeningStore` + `WallData.openings[]` | MT-06, OPEN — *"the single authority has never been declared and the loser never deleted"* | persisted-path risk |
| **H10** | **Level membership has two authorities** — `hierarchyStore` + `BimKernel`, both serialized | ADR-0327; `ProjectSerializer.ts:792` and `:685` | persisted-path risk |
| **H11** | **`ElementType` union cloned byte-for-byte** — `AITypes.ts:16` ≡ `ai/types.ts:16` | verified by `diff`, 0 differences | latent |
| **H12** | **Material id→hex ×3, in agreement, held only by a comment** | `materialLibrary.ts` / `finishRef.ts:28-89` / `WallSystemTypeStore.ts:144,157`; all 15 values verified identical | latent |
| **H13** | **`GLBExporter.ts:246` transcribes a module-PRIVATE const** from `CesiumViewport.ts:463` — structurally unsyncable | in agreement today | latent |
| **H14** | **18 `material-bridge.ts` files fall back to beige silently** on a drifted key | `plugins/wall/src/committer/material-bridge.ts:34-36` | latent |

### 7.2 — LIVE FORK *(same question, one branch chooses)*

- `buildCurvedLayerGeometry` #1 vs #2 — `WallFragmentBuilder.ts:1607` vs `:1844`, split on layer count.
  **Identical output at `layerOffset = 0`.** Maintenance duplication inside one file.
- `buildMiterPrism` (`MiterPrismBuilder.ts:53`) vs `buildWallExtrusion` (`WallPolygonExtruder.ts`) —
  V1/V2 both reachable in one build; V2 default-ON, per-wall fallback at `WallFragmentBuilder.ts:1416`.

### 7.3 — PARKED *(loaded guns, not dualities today)*

- **CSG single-volume wall** — `WallFragmentBuilder.ts:2334-2350`, gated on `window.__wallSingleVolume`,
  failure recorded inline at `:2326-2333` (*"the CSG void's vertical datum does not match the door/window
  mesh placement"* — **i.e. H3 by another name**).
- **The second renderer** — `bootstrap.render.everything.ts:118` binds **Root B** stores to its own
  `Renderer.init(canvas)`. One `runtime.scene.mount()` from painting the store set nothing persists.
- **A constant-ternary dead branch** — handrail compares against a literal the schema enum cannot
  produce, so the "choice" is a constant. **Invisible to type-checking and to review.** §10.2 asks every
  family for this shape.

### 7.4 — UNWIRED OVERLAY *(⚠ do NOT inflate these)*

- `RENDER_MATERIAL_LIBRARY` — 16 entries, 1 display-only importer (`MaterialsBucket.ts:16`), **0** call
  sites for `createRenderMaterial` / `BIM_TO_RENDER_MATERIAL_MAP`.
- `ELEMENT_TYPE_REGISTRY` — 18 of 19 entries unreachable; `getElementTypeRules` has **one** production
  caller (`BimGridRenderer.ts:126`) passing the literal `'grid'`.
- `findMaterialById` (`materialLibrary.ts:690`) — **0** call sites while 7+ sites hand-roll the `.find()`
  its own header warns against.
- Nine `CommandEventBridge` events with zero subscribers (§6.4).

### 7.5 — DELIBERATE TRANSITIONAL *(cited, correct, leave alone — this is the standard)*

- The **five `*Determination` modules** (`windowOpeningStoreDetermination.ts`, `boundingWallDetermination`,
  `wallRoomAdjacencyDetermination`, `storeReadDetermination`, `roomStoreDetermination`) each restate ONE
  member of the closed `UndeterminedReason` union as a literal because `@pryzm/command-bus` is not a
  declared dependency — **and each is pinned by a companion test against the command-bus source.** This
  is what C84 EI-10 + §1.7 compliance looks like.
- `plugins/rooms/src/store.ts:1-29` — a deprecated shim naming its winner, its zero readers/writers, and
  a three-step retirement path.

### 7.6 — RENDER-DEAD / OTHER-HOST-LIVE *(⛔ NOT deletable — C84 §3.5.2)*

All **26** `geometry-kernel/src/producers/*.ts`; **16 of 20** `plugins/*/src/committer/*-committer.ts`.
Zero editor render call sites; `produceWall` is called for real by `HeadlessBakeSession.ts:23,131` →
`RebakeChunkJob.ts:79`, shipped in `pryzm-selfhost/docker-compose.yml:94`.

> ⚠ **Per-family, not blanket.** The handrail lane measured `produceHandrail` + `HandrailCommitter` as
> **genuinely dead — never instantiated, and handrail is absent from the bake worker entirely.** So
> membership of this class must be proven per family; wall's answer does not transfer.

### 7.7 — DEAD *(deletable after the C84 §3.5.2 census)*

- **Ten plugin store classes constructed nowhere**: `sheets`, `schedules`, `section-view`, `plan-view`,
  `pool`, `bcf`, `cross`, `multiplayer`, `toy-cube`, `ifc-export`.
- **Six forked `core-app-model/src/stores/*Store.ts`** — exported, **zero non-test importers**;
  `RoofStore` diverged 49 lines, `StairStore` 7.
- **19 orphaned `*Command` classes** (§5.5).
- `MATERIAL_COLORS['acousitc-tile']` — `DiagnosticMaterialManager.ts:827`, a typo'd key no correct input reaches.

### 7.8 — REFUTED / MEASURED DOWN *(recorded because the discipline is the deliverable)*

| Claim | Verdict |
|---|---|
| "Ten `<kind>.delete` verbs are latent bugs" | **REFUTED** — all ten DORMANT. No UI, chat or collab path dispatches any. ⛔ Do **not** delete them: they are the PRYZM 3 target vocabulary |
| "The wall→room cascade never fires because `wall.delete` is never dispatched" | **MIS-ATTRIBUTED** — see §8.1 |
| "`WallHoleBodyBuilder` and `MiterPrismBuilder` co-occur on one wall ⇒ a seam" | **RETRACTED** — mutually exclusive by construction at `WallFragmentBuilder.ts:2301-2307`; bit-identical Y across 4 cases |
| "`src/elements/walls/WallStore.ts` is a third copy" | **REFUTED** — `src/elements/` does not exist |
| "`RENDER_MATERIAL_LIBRARY` is a rival master" | **REFUTED** — unwired overlay |
| "`UpdateCurtainWallCommand` is orphaned" | **STALE** — bridged at `initBusHandlers.ts:985-988` |
| "`pure/roofFaces.ts` is a gap" | **CLOSED** — 697 LOC, merged, consumed at `RoofGeometryBuilder.ts:15` |
| "The kernel/legacy split-brain is repo-wide" | **REFUTED as a generalisation** — handrail reads legacy in all six consumers. **It is per-family** |
| `DeleteElementCommand`'s fall-through is at `:651` | **WRONG — MINE.** Re-measured: `:650` is the `return {success:false…}`; `:651` is the closing brace. Off by one |
| `DeleteElementCommand` lacks a branch for "lighting and bare opening" | **INCOMPLETE — MINE.** It also lacks one for **`room`**: `grep -n roomStore packages/command-registry/src/walls/DeleteElementCommand.ts` → **zero matches**. I never checked `room` |

### 7.8a — ⭐ THE AUDIT'S OWN PATTERN, COMMITTED BY THE AUDIT

**C84 was minted TWICE on 2026-08-18, under the same number, by two agents each told to write it.** The
four-audit sweep committed `C84-ELEMENT-INTEGRITY` to `main` (`c0c144b2`); this lane wrote
`C84-ONE-ANSWER-PER-QUESTION` in its worktree. Neither knew of the other.

**It is the exact failure class in §7.1, with the exact mechanism: no declared authority.** The contract
number was allocated in one place and consumed in another with **no register between them** —
structurally identical to `affectedStores: ['wall']` naming one object at write time and another at undo
time (H4), and to two builders answering one geometry question (H1). *A contract minted to forbid rival
answers was itself a rival answer.*

**Resolved by merge, not by choosing.** `C84-ELEMENT-INTEGRITY` keeps the number — already on `main`,
already cited by two running fix lanes. This lane's thirteen invariants were folded in as **EI-9…EI-13**
plus the `[Z8]`-marked amendments, and **both readings of every disagreement are recorded in C84 §0**
rather than silently reconciled. This lane's draft survives verbatim at
[`Z8-SOURCE-DRAFT-one-answer-per-question.md`](Z8-SOURCE-DRAFT-one-answer-per-question.md), so the merge
that reconciles the two derivations does not destroy the evidence that there were two.

**What it cost, and what it bought.** It cost a duplicate contract. It bought three cross-checks a single
derivation could not have produced: **two of my claims were wrong** (the two rows above) and **one of the
sweep's was** (lighting — it read *"zero matches in both serializer and loader"*; the loader has 18, and
the load half existing is exactly why the gap looked wired). **Two independent measurements disagreeing
is how all three were caught — which is the argument for EI-10(b) stated as history rather than as
principle.**

### 7.9 — ⚠ A METHOD BLIND SPOT, checked against this audit's own census

The handrail lane's first answer was wrong because it **grepped for callers of the STORE** when the
write arrives through a **BUS VERB** (`RailingPlanToolHandler.ts:92` dispatches `handrail.create`).

**This audit's method checked against that fault:**
- The store census keyed on **construction sites** (`new XStore()`, `ALL_PLUGINS` `buildStore` thunks) —
  not on store callers. Construction is the right test for *"is this class instantiated"*, and the ten
  §7.7 classes have **no `ALL_PLUGINS` descriptor**, so no bus handler can receive them via `ctx.stores`
  either. **The conclusion survives the blind spot.**
- The delete census keyed on **dispatch call sites** of the verb string, plus the chat registry and
  collab replay — the correct axis.
- ⚠ **Where the blind spot is NOT closed:** §7.7's *"zero non-test importers"* for the six forked
  `core-app-model` stores is an **importer** census. A consumer reaching one through a bus verb or a
  dynamically-built key would be missed. Re-run on the bus axis before deleting them.

---

## 8 — The roadmap

### 8.1 — ⛔ THE ITEM THAT MUST NOT BE "FIXED": the wall→room cascade

Briefed as *"`plugins/cross/src/wall-room.ts:53,61` registers `wall.delete` as a cascade trigger;
nothing dispatches `wall.delete`, so room boundaries go stale."* **The premise is mis-attributed, and
acting on it would have shipped a no-op with a success report — this audit's own subject.**

**Measured:** `buildWallRoomCascadeRule` has **zero non-test call sites**. `new CascadeRunner()` occurs
only in `packages/command-bus/__tests__/cascade.test.ts`, `cascade-promotion.test.ts` and
`plugins/cross/__tests__/handlers.test.ts`. The registration example at `wall-room.ts:45` is **commented
out**. Ten plugin handlers carry the identical header: *"`CascadeRunner` is registered nowhere in
production (only in tests)"*.

`plugins/rooms/src/handlers/RecomputeRoomBoundary.ts:39-45` states it outright, **with the disposition**:

> *"`registerCrossHandlers` has ZERO production callers and `CascadeRunner` is instantiated only in
> tests, so the rule fires on ZERO wall edits. **Production registration of the cascade is DEFERRED to
> BIM30 plan R2 by a recorded disposition (ADR-0322 verdict / STR-06 §18)** — it is not this lane's to
> pre-empt."*

> **⇒ Dispatching `wall.delete` would change NOTHING** — the rule would still never run, because no
> runner exists to run it. The gap is the unregistered cascade subsystem, already owned by BIM30 plan R2.
> C84 EI-2's rule — *a registered trigger must have a proven dispatcher* — is generalised from this, and
> this lane's contribution is the correction, not a patch.

### 8.2 — Ordered migration steps, each with a proof gate

| # | Step | Why here | Proof gate (not a promise) | Risk |
|---|---|---|---|---|
| **1** | **Fix `check-verb-register`'s `TYPE_DECL_RE` anchor** so `{ type: '…'` is discovered; regenerate | Every step below is graded by this instrument, and it is wrong by one today | exit 0 with **SHADOWED = 1**, not 0 | none — gate only |
| **2** | **Land the §Z8-CURVED-MITER-BAKE-DIVERGENCE fix** (port the corner-table write-back into `buildCurvedLayer.ts`) | H1 — the only measured user-visible geometry divergence | `stackAB-miter-parity.test.ts` — delete the `it.fails`, case moves into `CURVED_CASES` | ⚠ `geometry-kernel`; **not** the files Z1/Z2/Z4 hold |
| **3** | **Extend the parity harness to slab, door, window** | C84 EI-11 owes three more — the families `bootstrap.render.everything.ts:137-170` covers | 3 new parity files, each green or each pinning a named divergence | none — additive |
| **4** | **ONE wall-Y authority** consumed by the wall body *and* its hosted leaves (§10.5 / H3) | Latent today, but blocks raked + layered walls where Z1/Z2 are working | a test asserting leaf centre-Y and wall body base share a datum at `baseOffset = 0.15` | ⛔ **`packages/geometry-wall` — patch plan to the orchestrator, do not edit** |
| **5** | **Collapse the 6 colour-name tables to `colorRef.ts`** (H5) | Live drift, trivially provable, zero geometry | a test asserting every consumer resolves `black`/`green` identically | low |
| **6** | **One `ElementType` union** — delete `ai/types.ts`, re-export `AITypes.ts`; fix `curtain-wall` at `CoreElement.ts:86` (H8, H11) | Live IFC-export defect | a test asserting a `curtainwall` element does not export as `IfcBuildingElementProxy` | low |
| **7** | **Probe ADR-0331 §D3 on ONE verb** — dispatch, then read back from the authoritative store, before wiring anything | STR-03 §12.3 invariant 2: *ship the probe before the fix* | `check-verb-liveness` PROVEN **7 → 8** by name | none — probe only |
| **8** | **Wire the forward patch through `elementUndoStoreAdapter`** (§D3), opt-in per verb, creates excluded | Converts the per-verb programme into one wiring change | PROVEN rises per PR; H4 closes | medium — see ADR §D3 hazards |
| **9** | **Retire the losing plugin handler per converged verb** (§D2) | Only after 8 proves the route | the verb leaves UNKNOWN in the register | low, per verb |
| **10** | **Purge-or-declare the DTO-store leak** — every real delete leaves the plugin record behind | Decide once, repo-wide; a per-family fix would have to be undone | a test asserting the declared behaviour, whichever is chosen | see §8.4 |
| **11** | **Delete the §7.7 dead set** after a C84 §3.5.2 census **on the bus axis too** (§7.9) | Cheapest win, but only with the full census | `check-per-package-compile` unchanged; no importer lost | low |
| **12** | **Gates for C84 EI-2, §1.6, §1.7** — bridge completeness, unconsumed emitters, pinned constant copies | Five of eight invariants are ungated | three new gates registered in `run-all.ts` | none |
| — | **ADR-0331 §D5 — what is Stack B for?** | ⛔ **FOUNDER DECISION.** Everything about deleting or investing in Stack B waits on it | — | — |

### 8.3 — Gate readings taken by this lane

| Gate | Exit | Reading |
|---|---|---|
| `check-verb-liveness` | **0** | PROVEN 7/7 (GROW-ONLY); 109 UNPROVABLE-NO-STORE; 210 UNKNOWN |
| `check-predicate-canonical` | **1** | 138 findings at declared level 138; 6776 files. **14 distinct degenerate-segment guard conventions** in the point-to-segment family, **6 with NO guard** ⇒ `NaN` reads as a clean miss |
| `check-epsilon-policy` | **3 — RATCHET EXCEEDED** | **319 / 318.** The one new declaration is `geometry-roof/src/pure/roofFaces.ts:PLANAR_EPS_M = COINCIDENT_M` — *a correct alias of the canonical role* that the name-anchored recipe still counts as a rival |
| `check-otel-spans` | **3 — RATCHET EXCEEDED** | Zone B 53/52; the new one is `UpdateElementParameterCommand.ts` |
| `check-no-commandmanager` | 1 | KNOWN-DEBT, at declared level |
| root `tsc --noEmit -p tsconfig.json` | **0** | after this lane's code changes |
| `run-all.ts` (83 gates) | — | **killed at ~11 min on gate 13 of 83** (`per-package-compile`). Gates 14–83 **NOT MEASURED** |
| `check-sync-disposition` | **NOT RUN** by this lane | prior measurement stands: exits 0 while seeing ~60 of ~320 handler types |

### 8.4 — The DTO-store leak: the decision, and why it is NOT "purge on delete"

Every real delete reaches `DeleteElementCommand`, which writes **only** legacy stores. **The plugin DTO
store therefore retains a row for every element the user has deleted**, for the session's life — plus, in
handrail's case, a junk record minted per 3-D creation by an empty-payload telemetry call.

**Adding a purge would be adding a MIRROR** — writing the plugin store to keep it consistent with the
geometry store — and ADR-0331 §D1 prohibits exactly that, because it makes both copies authoritative and
neither trustworthy.

> **DECISION (proposed, founder-ratifiable): DECLARE, do not purge.** The plugin DTO store is
> **non-authoritative and derived**; a stale row is harmless *by construction* because nothing that
> renders, persists or exports reads it. The declaration goes in each plugin's `store.ts` header in the
> `plugins/rooms/src/store.ts:1-29` form — winner named, reader/writer counts stated, retirement path
> given — and the leak stops being a leak the moment step 9 retires the write.
> **⚠ This is only sound while the count is zero.** If any consumer is ever found reading a plugin DTO
> store, this decision inverts and the purge becomes mandatory. §7.9's bus-axis re-census is the check.

---

## 9 — What this lane could NOT measure

- **Runtime divergence of contents.** The audit proves two roots that never exchange references and 19
  TWO-LIVE families **structurally**. It did not run a live browser session to observe two stores holding
  different records. **C78 §21 OQ7 is therefore answered structurally, not by a runtime probe.**
- **ADR-0331 §D3 has never been executed** — inferred from `elementUndoStoreAdapter.ts`'s own header and
  surface analysis. Step 7 exists for exactly this.
- **The parity harness covers two functions, not `produceWall` end to end.** The opening-carve, layered
  and instanced arms are unmeasured across stacks; slab/door/window have no harness at all.
- **Six of ten wall Y-datum sites** were not measured for input divergence (`WallInstanceBridge.ts:105,111,147,151`;
  `WallJunctionInfillManager.ts:122-123`; `LayeredWallOpeningBuilder.ts:140-141,205`;
  `WallFragmentBuilder.ts:1237/2112/2138/2186/2233/2371-2390`).
- **`singleVolumeWallProducer.ts` was not located** at the cited path by this lane; the CSG-cutter claim
  in §10.5 is carried from the orchestrator's measurement, unverified here.
- **Whether the two UI delete paths produced identical state for every OTHER kind** before the fix — only
  lighting and bare-opening were traced to the `success:false` tail.
- **Which store each non-wall family's builder subscribes to** — only `WallRebuildCoordinator` was
  inspected; no other family has a `*RebuildCoordinator`.
- **Gates 14–83** of `run-all.ts`.
- **Whether an alternate host (`pryzm-selfhost`, `server/`) mounts a canvas** and thereby activates the
  second renderer.

---

## 10 — THE SEVEN-QUESTION ELEMENT-INTEGRITY MATRIX

> **Rule (C84 §3.5): every cell is a runtime fact with file:line, or the literal `NOT MEASURED`. A blank
> reads as "fine" and is forbidden.**
> Q1–Q4 are being swept by dedicated lanes. Cells below carry what THIS lane and the handrail lane
> measured. **Q5 is complete and is this lane's.**

### 10.0 — ⛔ READ FIRST: the three findings that are LIVE USER-VISIBLE DATA LOSS

**L1 — LIGHTING IS NEVER PERSISTED. Every light the user places is destroyed on save/reload.**
Verified by this lane: `grep -ci "lighting" packages/persistence-client/src/loader/ProjectSerializer.ts`
→ **0**, and `grep -in "light"` on the same file → **0 matches**. It renders
(`initBuilders.ts:102, 846`) and it exports to GLB. `ProjectLoader.ts` carries 18 `lighting` hits — so
the **load** half exists and the **save** half does not, which is the worst arrangement: it looks wired.
**This is not latent. It is happening today, and it is the single most user-visible thing the audit
found.** Owed: an ISSUE-LOG row and a fix. ⚠ Not this lane's to write — the orchestrator owns
`ISSUE-LOG.md`.

**L2 — `wall.opening` has TWO RIVAL RECORDS FOR THE SAME DOOR, and nothing reconciles them.**
Persistence reads the standalone singletons (`ProjectSerializer.ts:47-48, 704-705` — `doorStore` +
`windowStore`). IFC export reads openings **embedded on the wall record**
(`WindowDoorReader.ts:1,7,12` `this.store.getAllWindows()`, wired at `FragmentReader.ts:89` with
`wallStore`). Two different records for one door. **No reconciliation was measured.** This is MT-06's
shape (§7.1 H9) confirmed on the export path, and it is the purest split-brain in the repo.

**L3 — SILENT ABSENCES FROM IFC EXPORT.** `packages/file-format/src/export/ifc/readers/` contains
Beam, Column, CurtainWall, Furniture, Handrail, Plumbing, Roof, Room, Slab, Stair, WallReader,
WindowDoor — and **no `CeilingReader`, no `FloorReader`, no `LightingReader`** (directory listed by this
lane). Ceilings, floors and lights are **absent from IFC with no refusal and no warning**: the export
succeeds and the elements are simply gone. STR-03 §12.3 invariant 1 — *failure and emptiness are never
the same value* — violated on the export path.

### 10.0b — ⭐ SETTLED: `stores.elements.get('wall')` vs `ctx.stores.wall` are NOT one slot

The code comments assert unification and **nobody had verified it**. Measured by this lane:

- **`runtime.stores`** is a `StoresSlot` = `{ elements, registerHydrator, hydrate, viewState, project }`
  (`composeRuntime.ts:1581-1583`). `elements` is the ADR-0318 live view over `storeRegistry`
  (`elements.get = (kind) => storeRegistry.getStoreForType(kind)`), and `composeRuntime.ts:1549-1559`
  registers the **geometry singletons** into it (`wallStore` from `@pryzm/geometry-wall/store`, etc.).
- **The plugin DTO stores never appear on `runtime.stores` at all.** They reach handlers through a
  different channel entirely: `CommandBus`'s `storesProvider` (`apps/editor/src/bootstrap.ts:94`) →
  `storesAsRecordView(stores)` → `ctx.stores`.

> **⇒ VERDICT: not two slots on one object — TWO OBJECTS ON TWO CHANNELS, and it is worse than a split.**
> `storesAsRecordView` (`bootstrap.ts:148-159`) returns `Object.fromEntries(store.getState())`.
> **`ctx.stores.wall` is not a store at all — it is a plain-object SNAPSHOT of a DTO store's state,
> rebuilt on every dispatch.** So a handler's `produceCommand(ctx.stores.wall, …)` produces patches
> against a snapshot, which `attachStores` then replays into the real DTO `Store` instance.
>
> **The comments are not lying — they are answering a different question.** `composeRuntime.ts:1540-1543`
> claims the registered instance IS the one `registerAllStores()` registers and `ProjectSerializer`
> reads — i.e. **Root A internal identity**, which is true and heap-proven
> (`mt05StoreIdentityHeap.spec.ts`). Nothing there ever claimed `ctx.stores.wall` unification. A reader
> scanning for reassurance would take it as such, which is precisely why C84 EI-10(b) demands an executed
> proof rather than a comment.

### 10.1 — Q1 · PER-CONSUMER STORE AUTHORITY

**The headline, and it outranks every feature in the repo:** for the **wall** family, **the viewport and
the bake worker read different stores AND run different geometry code.**
Viewport → `window.wallStore` (`geometry-wall`) → `WallFragmentBuilder`.
Bake → `new WallStore()` from **`@pryzm/plugin-wall`** (`HeadlessBakeSession.ts:52`) → `produceWall`.
Those are the two rival stores *and* the two rival stacks, wired end to end, one per host.

> ⭐ **But it is NOT universal — it is per-family.** The handrail lane measured handrail as **clean**:
> 3-D, plan, persistence, IFC, GLB and schedules **all read legacy**; the plugin store has **zero
> production readers**; `produceHandrail` and `HandrailCommitter` are **never instantiated**; handrail is
> **absent from the bake worker**. A family that reads legacy everywhere is a valid, clean answer and is
> recorded as **CLEAN**, never as unmeasured.

| family | renderer | persistence | IFC export | bake | verdict |
|---|---|---|---|---|---|
| **lighting** | legacy, renders (`initBuilders.ts:102, 846`) | **NONE — 0 hits in `ProjectSerializer.ts`** | **NO READER** | absent | **⛔ DATA LOSS (L1)** |
| **wall.opening (door/window)** | Root A singletons (`initBuilders.ts:537-538`) | standalone `doorStore`+`windowStore` (`ProjectSerializer.ts:47-48, 704-705`) | **openings EMBEDDED ON THE WALL** (`WindowDoorReader.ts:1,7,12`; wired `FragmentReader.ts:89`) | n/a | **⛔ SPLIT-BRAIN (L2)** — two records, no reconciliation |
| **wall** | geometry-wall singleton (`initBuilders.ts:77, 553`) | Root A (heap-proven, `mt05StoreIdentityHeap.spec.ts`) | `WallReader` | **plugin DTO `WallStore`** (`HeadlessBakeSession.ts:31,51,131`), populated **only by in-job command replay** (`:76-84`), never from the editor's store | **⛔ SPLIT ACROSS PROCESSES** |
| **ceiling** | Root A (`initBuilders.ts:387`) | Root A | **NO READER** | absent | **⛔ silent IFC absence (L3)** |
| **floor** | Root A (`initBuilders.ts:418`) | Root A | **NO READER** | absent | **⛔ silent IFC absence (L3)** |
| **handrail** | legacy | legacy | `HandrailReader` | absent | **✅ CLEAN** — plugin store has **0** production readers; `produceHandrail` + `HandrailCommitter` never instantiated |
| slab, roof, column, beam, furniture, plumbing, curtain-wall, room, stair | Root A (`initBuilders.ts`, §3.2) | Root A | reader present | not wired — bake covers wall only (`HeadlessBakeSession.ts:56-60`) | no bake divergence; **plan view NOT MEASURED** |
| grid | Root A (`initBuilders.ts:1002`) | **NOT MEASURED** | no reader (not an IFC product) | absent | **NOT MEASURED** |
| **plan view, per family** | — | — | — | — | **NOT MEASURED** |

> **Seed correction, carried forward.** An earlier framing said the kernel-producer stack is *"live for
> the viewport"*. **Superseded.** It is wired for wall/slab/door/window at
> `bootstrap.render.everything.ts:135-169` but **never mounted in the editor** — reachable only via
> `composeRuntime.ts:1391` `bootstrapScene` inside `runScene(canvas, mode)`, and production boot passes
> `canvas: null` (`src/main.ts:407`, comment at `:405`). A search for `scene.mount(` across
> `apps/editor/src`, `src` and `packages/renderer/src` returns **one comment**. **Dead in the editor,
> alive in bake.** §4.1 of this document already states it that way; this note pins the correction.

> **⭐ The DTO stores are not a leaking rival — they are a WRITE-ONLY SHADOW that is empty half the time.**
> The `.created` bridges are one-way and create-only; every subsequent edit goes legacy-only with no
> write-back (`PropertyInspectorApply.ts:446` → `UpdateHandrailCommand`; `initBusHandlers.ts:1136`). And
> `ProjectLoader.ts:743` reloads via **legacy commands with no bus event**, so **after any project load
> every DTO store is EMPTY while the legacy stores hold N records.** This reframes §8.4: the retention
> "leak" is a symptom of a shadow that is never authoritative and frequently empty — which strengthens
> the DECLARE-don't-purge decision, since purging would be maintaining a mirror that is already
> structurally worthless.

### 10.2 — Q2 · LOSSY BRIDGE TRANSLATION

**The sentence that names the class:** *the same line drawn in plan vs 3-D builds different geometry.*

| bridge | narrows | evidence |
|---|---|---|
| **handrail** `path[]` → `baseLine[2]` | N-point path **silently TRUNCATED**, not refused | handrail lane, runtime-proven — **the canonical instance** |
| **handrail** `fillType` | never crosses the bridge ⇒ a plan-drawn railing is 3 meshes (tube + 2 posts); the same line in 3-D builds different geometry | handrail lane |
| **handrail** rail diameter | authored value written to a field the round branch ignores | handrail lane |
| **handrail** shape ternary | compares against a literal the schema enum **cannot produce** ⇒ the condition is a **CONSTANT**; a dead branch masquerading as a choice | handrail lane |
| **slab** `.created` | plugin `boundary` → authoritative `polygon/position/width/depth`; **rejected verbatim** (`invalid_type` on `path:['position']`) | `authoritativeElementMirror.ts:122-134`; hand-translated in `initTools.ts §FT1` |
| **level-change mirror** | mirrors the LEVEL only; **`baseLine.y` deliberately NOT mirrored** | `elementLevelChangedMirror.ts:39-46` |
| **18 × `material-bridge.ts`** | any key whose slot count ≠ 5 → silent `FALLBACK_COLOR` | `plugins/wall/src/committer/material-bridge.ts:34-36` |
| **bake** `produceWallDescriptors` | **joins discarded (`NO_JOINS`), level elevation forced to 0** | `HeadlessBakeSession.ts:139` |
| **the other ELEVEN `.created` bridge bodies** — `initTools.ts:1059, 1260, 1408, 1511, 1591, 1636, 1708, 1773, 1824, 1967, 2031` | **NOT MEASURED.** ⚠ Only the handrail bridge body was read in full. **These eleven are NOT recorded as clean** — a dedicated lane is sweeping them for all four handrail shapes, especially the **constant-ternary**, which is invisible to type-checking and to review | — |

### 10.3 — Q3 · UNDO SEMANTICS

| fact | evidence |
|---|---|
| The undo map resolves every key to a **legacy `window.*Store`** — 24 keys, 21 globals | `performUndoRedo.ts:308-353` |
| Write-time `'wall'` is the **plugin DTO** store ⇒ **one key, two objects** | C16 CA-19; §2.4 |
| `door` / `window` / `level` **intentionally absent** ⇒ fall through to `commandManager` | `performUndoRedo.ts:348-353` |
| Only **5** `initBusHandlers` bridges carry ring-buffer undo | `:922, 930, 938, 1102, 1128` |
| The other **71** bridges are `stores: []` ⇒ undo on the legacy stack | §6.5 |
| **Per family, per edit kind** | **NOT MEASURED** (dedicated lane sweeping) |

### 10.4 — Q4 · DELETE

| family | what the UI delete button reaches | evidence |
|---|---|---|
| all kinds — Delete key + property panel | `element.delete` → `DeleteElementHandler` → routes on `elementType` | `initUI.ts:2449`; `PropertyPanel.ts:978`; `DeleteElement.ts:51-57` |
| all kinds — context menu + edit bar | **was** always `DeleteElementCommand`; **now** the same bus verb | `BimService.ts` §FIX-ONE-DELETE-PATH (this lane) |
| lighting, bare opening | **were deleted by nothing** from the second surface (`success:false`) | `DeleteElementCommand.ts:651` |
| **all families** | **plugin DTO record RETAINED on delete** — the mirror-image leak | §8.4 |
| handrail | plus a junk plugin record minted per 3-D creation by an empty-payload telemetry call | handrail lane |
| the ten `<kind>.delete` bus verbs | **dispatched by nothing** — dormant | §7.8 |
| MainToolbar "Delete selection" | **disabled** — not in `BACKED_TOOLBAR_VERBS` | `commandBacking.ts:54-59` |
| whether every other kind reaches an identical end state via both surfaces | **NOT MEASURED** | — |

### 10.5 — ⭐ Q5 · Y-DATUM AUTHORITY — COMPLETE, and a real latent defect

**Independently re-verified by this lane at the cited lines:**

| site | expression | `slabBaseOffset`? | `wall.baseOffset`? |
|---|---|---|---|
| **wall body** `WallFragmentBuilder.ts:728` | `level.elevation + (slabBaseOffset ?? 0) + (wall.baseOffset ?? 0)` | **yes** | **yes** |
| — applied to the group | `wallGroup.position.set(start.x, resolvedY, start.z)` — `:1097` | | |
| — then every geometry site adds `wall.baseOffset` **again** ⇒ body base = `elevation + slabOffset + 2 × baseOffset` | orchestrator-measured; **this lane verified the group placement, not the second addition** | | |
| **door leaf** `DoorBuilder.ts:498` | `elevation + door.sillHeight + door.height / 2` | **NO** | **NO** |
| **window leaf** `WindowBuilder.ts:818` | `elevation + win.sillHeight + win.height / 2` | **NO** | **NO** |
| `slabBaseOffset` occurrences in `geometry-door/src` + `geometry-window/src` | **0** — measured by this lane | | |

**⇒ leaf-vs-hole delta = `slabBaseOffset + 2 × wall.baseOffset`.**

**Why it is invisible today:** no call site in `apps/editor/src` or `packages/geometry-wall/src` assigns
`slabBaseOffset` a non-zero value — only parameter declarations at `WallRebuildCoordinator.ts:274`,
`composeWallGeometryHash.ts:107`, `WallFragmentBuilder.ts:168` — and no wall creation path authors
`baseOffset ≠ 0`. **LATENT, not currently visible.**

**Independent corroboration that the delta is real:** the parked CSG arm's recorded failure
(`WallFragmentBuilder.ts:2326-2333`) is *"the CSG void's vertical datum does not match the door/window
mesh placement… leaving uncut wall across the opening's lower portion."* **That is this defect, observed
in production, and it is why the CSG arm is switched off.**

**The fix is NOT to dedupe the extrusion builders** — `WallHoleBodyBuilder` and `MiterPrismBuilder` are
mutually exclusive by construction (`WallFragmentBuilder.ts:2301-2307`) and produce bit-identical Y.
**The fix is ONE wall-Y authority consumed by the wall body AND its hosted leaves.** ⛔ Lives in
`packages/geometry-wall` — patch plan only, per §8.2 step 4.

### 10.6 — Q6 · RIVAL REPRESENTATIONS OF ONE REAL-WORLD THING

> ⭐ **The pattern to hunt, named by the handrail lane:** *the capability the founder asked for EXISTS
> TWICE and is UNREACHABLE BOTH TIMES.* That is "authored-but-unwired" at the geometry layer, and
> **counting only live code makes it invisible.**

| thing | concepts | verdict |
|---|---|---|
| **railing** | (1) `StairRailingBuilder.ts` 1224 LOC — live, **slopes correctly** by quaternion at `:1127-1131`; (2) `HandrailFragmentBuilder.ts` 350 LOC — live, **strictly horizontal, never reads `baseLine[i].y`** though the field exists in the model; (3) `produceHandrail` — **dead**, does slope **and** curve by 3-D frame sweep. Plus `IfcRailingToNativeConverter` **always** yields `HandrailData`, collapsing the distinction on import | **THREE concepts, and sloped railing is authored twice and reachable zero times** |
| **wall curved layer** | 3 implementations (§4.2) | **LIVE FORK + cross-stack divergence (H1)** |
| **miter prism** | 2 (`MiterPrismBuilder.ts:53`, `producers/_internal/buildMiterPrism.ts:21`) | cross-stack; **measured to AGREE** |
| **roof geometry** | `RoofGeometryBuilder.ts` 1540 vs `producers/roof.ts` 300 (self-declared hand-port) | rival; bake-live only if roof is ever wired into bake |
| **level** | 2 authorities + 1 phantom + 2 miscounted | ADR-0327 |
| **opening** | `OpeningStore` + `WallData.openings[]` | MT-06 — authority never declared |
| **element type** | 4 unions (30 / 18 / 11 / 11) | H8, H11 |
| **material** | 5 vocabularies | ⛔ **lane ZA owns — report only** |
| wall, curtain-wall, ceiling, column, slab, beam, floor, lighting, furniture, room | **NOT MEASURED** for the authored-but-unwired shape | — |

### 10.7 — Q7 · MATERIAL VOCABULARY *(report only — lane ZA owns)*

`STANDARD_MATERIAL_LIBRARY` (204 entries, 32 importers) · `RENDER_MATERIAL_LIBRARY` (16, unwired) ·
`finishRef.ts` (15, transcribed) · `FRAME_KEYWORD_COLORS` (`plugins/window/.../material-bridge.ts:26-36`,
transcribed across an L7→L6 boundary) · `UserMaterialStore` (overlay by design). Plus the 6 drifted
colour-name tables (H5). Handrail: **`materialId` is written by the UI and read by NOTHING in the
builder.** **No action taken by this lane.**
