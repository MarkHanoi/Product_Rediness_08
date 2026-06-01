# ADR-051 — Undo as single-source-of-truth + derived mesh (patch-inverse on one store)

| Field | Value |
|---|---|
| Status | **Proposed** (end-state) — **interim SHIPPED 2026-05-24** (see "Interim shipped" below) |
| Closes | OI-054 (undo broken on plan-view create); U-B1–U-B5 cluster; the §4.7 B1/B2 gaps |
| Supersedes (on accept) | the transitional dual-path bridge described in C03 §4.3 |
| Owner | State / undo architecture |
| Constraint reference | C03 §4 (undo invariants U-1…U-7), C02 §3 (migration bridges), C04 (rendering), C13 (lifecycle), P6 (commands-only mutation) |
| Reference studied | `pascalorg/editor` — Zustand + **Zundo** temporal middleware on ONE `useScene` store; geometry **derived** from the store via **dirty-node tracking** in the render loop (no separate mesh store). |

---

## Context

Undo is currently half-broken (OI-054): drawing walls in plan view then Ctrl+Z is a silent
no-op. A deep trace (2026-05-24) established the precise cause — there are **three** store
representations of the same element, and undo targets the wrong one:

| Layer | Object | `applyPatch`? | Drives mesh? | Role |
|---|---|---|---|---|
| **L1 bus store** | `storesProvider('wall')` → `Store<WallData>` state `Record<id,WallData>` (`packages/stores`, `plugins/wall`) | **Yes** | **No** | `CreateWallHandler.execute` writes here via `produceCommand(ctx.stores.wall, d => d[id]=wall)`; the ring-buffer inverse patch is `{op:'remove', path:[id]}`; `bus.fetchStores()` returns it. |
| **Legacy store** | `window.wallStore` → `WallStore` (`packages/geometry-wall`, Map-based) | **No** | **Yes** (`WallFragmentBuilder` via `StoreEventBus`/`WallRebuildCoordinator`) | Populated by the `§P2.1` **event** bridge (`initTools.ts:868`) on the `wall.created` event; also the source for snapshot serialization. |
| **Command snapshot** | legacy `CommandManager.history` | n/a | reverts legacy store | Path-A undo only; **empty** for plan-view bus creates. |

The mesh is **derived from the legacy store via an event bridge**, but undo applies a patch to
the **L1 store**. Result: `applyRingBufferSide` calls `store.applyPatch()` on the legacy store
(no such method) → `TypeError`, swallowed → false "undo applied" (B3, fixed 2026-05-24). Even
the *correct* apply path (`runtime.undoStack` → `bus.fetchStores`) would revert L1 data but not
the mesh (B2). Four UI sites hand-roll the apply against the legacy map (B1).

**Pascalorg does it the sound way:** one store; undo restores it (Zundo snapshots); the existing
**dirty→geometry** pipeline that handles normal edits *also* handles undo. There is no second
store to keep in sync, so undo can never desync data from mesh.

## Interim shipped (2026-05-24) — single undo PATH (precedes the single STORE)

The live bug turned out to be a **trigger divergence**, not a broken applicator: the undo
**button** (`SaveUndoRedoHUD`) called `commandManager.undo()` only and never consulted the ring
buffer, while plan-view elements (bus-only) live only in the ring buffer. The keyboard handler
already did ring-buffer-first, so undo "worked" via keyboard but not the button — and the user was
clicking the button.

Shipped, as the behaviour-preserving step toward this ADR:

1. **One undo path** — `apps/editor/src/engine/undo/performUndoRedo.ts` (`performUndo`/`performRedo`).
   Every trigger (HUD buttons, `initUI` keydown, `BimService` ← `ContextualEditBar`, the
   Nav/Docking GIS-reset) calls it; the four hand-rolled `applyRingBufferSide` maps are deleted.
   Realises C03 §4.6 **U-5**.
2. **Ring-buffer-first + coverage pre-check** — applies the inverse patch via the
   `elementUndoStoreAdapter` (drives the legacy mesh store); if the affected stores aren't all
   covered (hosted door/window, `level`) the cursor is NOT stepped and it falls back to
   `commandManager.undo()`.
3. **Shadow-drop (U-8)** — after a ring-buffer undo, the dual-dispatch twin (the 8 legacy 3D tools
   run `commandManager.execute(CreateXCommand)` too) is removed via
   `commandManager.dropEntriesForTargets(ids)` so one action = one undo (no phantom keypress).
4. **Adapter spatial/semantic cleanup** — the adapter now also unregisters/re-registers
   `bimManager` (`level.childrenIds`) + `elementRegistry` on whole-element remove/add, replacing
   the cleanup the shadow-dropped command used to do (no registration leak).

This is **not** the end-state: there are still two stores (L1 Immer + legacy mesh) bridged by the
adapter, the dual-dispatch still exists (shadow-dropped, not removed), and cross-stack redo
ordering is best-effort. Those collapse only when the single-store decision below lands. Gated by
12/12 unit tests (`performUndoRedo.test.ts` 5/5, `elementUndoStoreAdapter.test.ts` 7/7).

## Decision

Adopt the pascalorg-aligned model: **one element store is the single source of truth; the 3D
mesh and the plan projection are DERIVED from it via dirty-diff subscription; undo/redo is
patch-inverse applied through exactly one path (`runtime.undoStack`).**

Concretely:

1. **Single source of truth = the L1 bus store** (`Store<WallData>` etc.). It is what commands
   write (P6), what the ring buffer patches, and what `bus.fetchStores()` returns.
2. **Mesh + plan derive from the L1 store via a dirty-diff bridge.** Replace the create-only
   `§P2.1` *event* bridge with a subscription to the L1 store's `subscribeDirty()` that mirrors
   **every** add/update/remove to the rendering machinery (today: the legacy `WallStore`'s
   `add/update/remove`, which already drive `WallFragmentBuilder` + VDT + plan projection). The
   legacy store thus becomes a **derived projection**, not a parallel source. (End-state: collapse
   it entirely so `WallFragmentBuilder` subscribes to L1 directly — pascalorg's dirty-node model.)
3. **One undo apply path.** All Ctrl+Z / redo entry points (`initUI`, `BimService`,
   `NavigationAreaLayout`, `DockingLayout`) call `runtime.undoStack.undo()/redo()` — they MUST
   NOT hand-roll `applyRingBufferSide()` with a private store map (C03 §4.6 **U-5**). Delete
   `_buildRingBufferStoreMap()` / `BimService._buildStoreMap()`.
4. **Path A (legacy `CommandManager` snapshot undo) is retired** as each element type migrates,
   per C03 §4.3. Undo becomes patch-inverse only (U-1…U-7).

This satisfies C03 §4 U-5 (single apply path) and U-7 (the store a patch targets is the store
that renders), and aligns undo with the PRYZM3 vision (P6 commands-only + a single composed
data half).

## Migration plan (incremental, per element type — each slice gated)

Undo is an **interactive behaviour**: every slice MUST be verified in the running app, not only
by unit tests. Per element type (wall → slab → room → curtain-wall → door/window → furniture):

1. Add the **L1-dirty → render bridge** (subscribe `Store.subscribeDirty`; mirror add/update/remove
   to the legacy store/builder). Remove the old create-only event bridge for that type. Guard
   against double-apply during the bus's own create.
2. Route the type through `runtime.undoStack` (drop the hand-rolled apply for it).
3. **Unit test (CI gate):** dispatch `<type>.create` → assert L1 store + legacy store both have
   it; `runtime.undoStack.undo()` → assert both no longer have it; `redo()` → both have it again.
4. **Live verification (human gate):** create N elements in plan + 3D, Ctrl+Z each → mesh AND
   data revert; redo → reappear; no ghost mesh; no console error; cross-project Ctrl+Z is a no-op
   (C13 U-6).

Only after a type passes both gates is its Path-A dual-write removed.

## Consequences

- **Positive:** undo finally reverts both data and mesh, uniformly, for every element type; the
  four duplicated/wrong apply sites collapse to one (`runtime.undoStack`); the dual-store class
  of bugs (this ADR, the §FIX-VDT-DUAL-PATH race, the §SERVER stores divergence pattern) shrinks;
  matches a proven reference (pascalorg) and the PRYZM3 vision.
- **Negative / risk:** touches the **working create/render path** for every element type. A wrong
  dirty-bridge (double-apply, timing vs the FrameScheduler-batched `WallRebuildCoordinator`, or
  missing an update op) can break creation or leave ghost geometry. This is why migration is
  **incremental + live-gated**, not a single blind change.
- **Interim (already shipped, behaviour-preserving):** B3 fixed — `applyRingBufferSide` reports
  `{applied,failed}`; callers log honestly + fall back to `commandManager.undo()` on total
  failure. This keeps undo *honest* until the migration lands.

## Alternatives considered

| Option | Description | Verdict |
|---|---|---|
| **A (chosen)** | Single source (L1) + mesh derived via dirty bridge; patch-inverse undo via `runtime.undoStack`. | Matches pascalorg + P6 + C03 §4 U-7. |
| **B** | Make the **legacy** store the single source: give it `applyPatch`, route the bus + ring buffer at it. | Rejected — its state is a class+`Map`, not an Immer-draftable `Record`; `produceCommand` can't target it without rewriting the store, and it's the *legacy* layer we're retiring (C14). |
| **C** | Transitional: dual-write plan-view creates to `commandManager` so the B3 fallback reverts via Path A. | Rejected as the *end-state* (re-grows the retired dual-write, C02 §3.2; risks double-add vs the §P2.1 bridge), but acceptable as a stop-gap for a single type if a faster interim is needed. |
| **D** | Command-inverse undo (re-dispatch the inverse command, e.g. undo create = dispatch delete through the full pipeline). | Viable + robust, but a different undo model than the existing ring-buffer patch infra; larger blast radius than A. Revisit if A's dirty-bridge proves fragile. |

## Deep-trace addendum (2026-05-24) — the snapshot finding + executed wall slice

A full trace to ground truth (every layer) surfaced a detail that sharpens the plan:

- `produceCommand` is **pure** (`produceWithPatches`) and `CommandBus.executeCommand` **never
  commits `nextStates`** to a store. The L1 `Store<T>` is mutated only by **`attachStores`**
  (`bootstrap.ts:103`), which re-applies the **forward** patches from the PatchEmitter.
- The production bus `storesProvider` returns a **snapshot `Record`** view
  (`storesAsRecordView` = `Object.fromEntries(store.getState())`) — **not** the live `Store<T>`.
  So `bus.fetchStores()` (used by the canonical `runtime.undoStack`) hands back a plain object
  with **no `applyPatch`** → even that path can't apply inverse patches as written. Undo never
  flows through `attachStores` (the only live-store applicator).
- The hand-rolled UI handlers instead map `wall → window.wallStore` — the **live legacy** store
  that *does* drive the mesh (`add`/`remove` → `WallFragmentBuilder`) but has no `applyPatch`.

**Executed — all geometry element types (2026-05-24, behaviour-preserving, live-gated):**
`apps/editor/src/engine/undo/elementUndoStoreAdapter.ts` adapts any live legacy element store to
an `applyPatch` surface via its own mutators (which drive the mesh): inverse `{op:'remove',path:[id]}`
→ `remove(id)`/`delete(id)` (undo), forward `{op:'add',path:[id],value}` → `add(value)` (**redo**),
field `replace` → `update`. **Duck-typed** over the verified store surface union (`add` + `remove`
or `delete` + `getById` or `get` + `update`) and **never throws**. `adaptElementStoreMap()` wraps a
whole `{key→store}` map; wired into **all four** hand-rolled undo/redo sites (`initUI`, `BimService`,
`NavigationAreaLayout`, `DockingLayout`) for **wall, slab, room, curtain-wall, furniture, column,
beam, stair, handrail, roof, floor, ceiling, plumbing** (+ plural aliases). So undo/redo revert
**both data and mesh** for every geometry element type. Unit-gated
(`apps/editor/__tests__/elementUndoStoreAdapter.test.ts`, 7/7: undo, redo, round-trip on both
store shapes, field, idempotency/never-throw, map-wrapper). **Excluded (left RAW → B3 fallback to
`commandManager.undo()`):** `door`/`window` (HOSTED — undo must also remove the wall opening, a
two-part undo = the next ADR-051 slice) and `level` (Path-A). This is the per-type bridge; the
end-state (single store + derived mesh, retiring `window.*Store` + the snapshot/`fetchStores` undo
path) still stands.

**Refined plan consequence:** the canonical `runtime.undoStack` path must additionally route
inverse patches through the **live-store applicator** (`attachStores`/`Store.applyPatch`), not the
`fetchStores` snapshot — fold this into the per-type migration when each type's mesh derives from
its L1 store.

## Open question for the architect

A's per-type migration changes the create/render path and **must be live-verified**. Confirm
whether to execute it incrementally (wall first, behind the two gates) — and whether the
unit-test gate is sufficient to proceed between live checks, or every slice waits for a manual
pass.
