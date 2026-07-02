# ADR-0105 — Uniform "change element type" (replace-in-place) across families (§FEAT-ELEMENT-CHANGE-TYPE)

> Defines ONE command contract for swapping a **placed** element's type/asset in place — preserving
> its id, transform, host and offset, rebuilding its mesh, and keeping the swap undoable — and fixes
> the reference case (the wall WALL TYPE dropdown) which did not work for existing placed walls. No
> `*-AUDIT.md` derivative created — canonical behaviour recorded here per governance.

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-02 |
| Owner | Property panel type selectors + command bus bridges (`apps/editor/src/ui/property-panel`, `apps/editor/src/engine/initBusHandlers.ts`) + furniture command (`packages/command-registry/src/furniture`) |
| Builds on | C11 (element-creation pipeline) · C03 (schemas/commands/state) · C16 (command authoring) · C17 (batch catalogue + panel binding) · the wall WALL TYPE picker (`UpdateWallSystemTypeCommand`) as reference |
| Governs | The "change type" / "swap asset" control in the shared PropertyPanel for every family with a type/variant catalogue: walls (system types), doors/windows (system types), furniture (asset/variant), with the door/window openings re-rendered via a host-wall rebuild |
| Tags | §FEAT-ELEMENT-CHANGE-TYPE |
| Contracts | P2 (no THREE outside renderer-three — none added) · P3 (no new rAF) · P6 (all mutation via commands; the new bus command routes to CommandManager commands, never direct store writes from UI) · P8 (the bus handler emits an OTel span via `withHandlerSpan`) · 8-layer import rule respected (the furniture command is L-low command-registry; the widgets are L5 editor) |

## Context

Founder priority (L-17): every placed element must have a "change type" dropdown in its properties
panel to REPLACE it with another type of the same family, in place (keeping position / rotation /
host). This already exists visually for **walls** (the WALL TYPE dropdown → system types), but the
founder reports it "is not working for existing/placed elements", and it is absent for other
families (furniture, etc.).

## Root cause of the wall reference failure

There are **two** wall stores in the running editor:

1. The L1 **bus DTO** `WallStore` (`plugins/wall/src/store.ts`), keyed `wall` in the command-bus
   `storesProvider`. The clean plugin handler `SetWallSystemTypeHandler` (`wall.setSystemType`)
   `produceCommand`s against this store and returns Immer patches. `attachStores`
   (`packages/stores/src/attachStores.ts`) re-applies those forward patches to this bus store,
   emitting its subscribe event.
2. The legacy **geometry** `WallStore` (`packages/geometry-wall`), created in
   `apps/editor/src/engine/initBuilders.ts` and subscribed to by
   `apps/editor/src/engine/WallRebuildCoordinator.ts` — this subscription is what drives the 3D mesh
   rebuild.

The live PropertyPanel's wall type selector dispatched **`wall.setSystemType`**, which mutates only
the **bus DTO store**. The bus→legacy bridge in `initTools.ts` mirrors only element **creation**
events (`wall.created`, `wall.opening.create`) into the geometry store — there is **no bridge for a
type/layer change**. So for an already-placed wall the systemType/layers updated in the bus store but
the geometry store — and therefore the mesh — was never notified. Nothing rebuilt. That is exactly
"the WALL TYPE dropdown doesn't work for existing placed walls."

The **working** path is the older one: `wall.updateSystemType` → `UpdateWallSystemTypeHandler` bridges
to `window.commandManager.execute(new UpdateWallSystemTypeCommand)`, whose `ctx.stores.wallStore` **is**
the geometry store — `updateWall()` emits `update` → `WallRebuildCoordinator` rebuilds. The CommandBus
never applies handler `nextStates`; only the legacy CommandManager path reaches the geometry stores
that the builders subscribe to.

## Decision

Introduce **one uniform bus command `element.changeType`** and route every family's "Type" dropdown
through it. The command bridges — per family — to the **legacy CommandManager command that already
reaches the geometry store / builder** (the proven working path), NOT to the detached bus DTO
handlers. This is a deliberate reuse of the one mechanism that rebuilds existing elements, rather
than building N new bus→legacy mirror bridges.

Payload: `{ elementId, elementType, newTypeId, …family extras }`. Routing:

| elementType | routes to | rebuild path |
|---|---|---|
| `wall` | `UpdateWallSystemTypeCommand` (layers/thickness forwarded; empty `newTypeId` ⇒ detach to Plain Wall) | geometry `WallStore.updateWall()` → `WallRebuildCoordinator` |
| `furniture` | **`ChangeFurnitureTypeCommand`** (new) | `FurnitureStore.update()` → `bim-furniture-updated` → `FurnitureFragmentBuilder.updateFurniture()` → `FurnitureFactory.getBuilder(newType)` |
| `door` / `window` | existing `door.setType` / `window.setType` **plus** a host-wall rebuild nudge via `window.__wallRebuildControl.rebuildWalls([wallId])` | the opening render map is resolved at wall-build time, so re-queuing the host wall re-renders the opening with the new type's finish |

Guarantees for every route:
1. the type/asset is swapped;
2. placement (id, position, rotation, level, base offset, host) is **preserved** — the commands copy
   these verbatim and change only the type (+ optionally re-seed catalogue-default dimensions);
3. the mesh rebuilds for the **existing** element;
4. the swap is **undoable in one step** (each underlying command implements `undo()`);
5. the bus handler wraps execution in an OTel span (`element.changeType.handler`) per P8.

### Wall reference fix

The PropertyPanel wall type selector now dispatches `element.changeType` (→ `UpdateWallSystemTypeCommand`,
the working geometry-store path) instead of `wall.setSystemType` (the detached DTO path). No change to
the wall join / opening geometry.

### Furniture — `ChangeFurnitureTypeCommand`

New `packages/command-registry/src/furniture/ChangeFurnitureTypeCommand.ts` (`CHANGE_FURNITURE_TYPE`).
It sets `furnitureType` (and optionally re-seeds dimensions / colour / material / config from the
target type's catalogue defaults), **preserves** id / position / rotation / level / baseOffset / mark /
hostedSpaceId, **sheds** a stale config that belonged to the previous type (e.g. a wardrobe's
`wardrobeConfig` when swapping to a sofa), and calls `store.update()` — the same event the proven
`UpdateFurnitureParametersCommand` uses. `undo()` restores the exact prior record. Registered in the
editor `CommandRegistry` and in `initBusHandlers` under both `element.changeType` and its own
`CHANGE_FURNITURE_TYPE` key so it survives collaboration replay (same class of gap as
§FURNITURE-UPDATE-REPLAY).

### Furniture "Type" dropdown

New `apps/editor/src/ui/property-panel/FurnitureTypeSelectorWidget.ts` (reusing the wall picker's
`wts-*` styling for a consistent inspector primitive). It lists the placed element's **category
peers** (from the pure `FurnitureCategoryRegistry`; category derived from `furnitureType` when the
element carries no explicit `furnitureCategory`), pre-selects the current type, and on Apply forwards
the target type + its catalogue default dimensions. Wired into `_buildTypeSelector`
(`PropertyPanelTypeSelector.ts`) alongside the existing per-family selectors.

## Consequences

- The founder's reference control now works for **existing placed walls** and a new **furniture "Type"
  swap** (sofa → another sofa, etc.) lands, both via one contract.
- Door/window swaps route through the uniform command and repaint via the existing wall-rebuild
  machinery — no new opening/wall-join geometry edits (C11 single-pipeline respected).
- The design leans on the legacy CommandManager as the mesh-reaching path. When the plugin bus stores
  own rendering end-to-end (Phase E), the `element.changeType` routes collapse onto typed bus handlers
  and the CommandManager bridge is deleted — the UI and the command surface are unchanged.
- Not in scope here: forking dedicated command-registry door/window *type*-change commands (they only
  exist as plugin bus handlers today); slabs/floors/ceilings keep their existing layer-update selectors.
  These can adopt `element.changeType` routing incrementally without changing the contract.

## Tests

- `packages/command-registry/__tests__/changeFurnitureType.test.ts` — swap preserves id + transform +
  host; re-seeds dims when provided; sheds stale config; is undoable; rejects unknown id; declares
  `affectedStores`/type and serializes for replay.
- `apps/editor/__tests__/FurnitureTypeSelectorWidget.test.ts` — declines for non-furniture; lists
  category peers with current pre-selected; Apply fires with target type + defaults; no-op on unchanged.
- `apps/editor/__tests__/CommandRegistryReplayFactories.test.ts` — extended to assert
  `CHANGE_FURNITURE_TYPE` stays registered and round-trips (collab-replay regression guard).
