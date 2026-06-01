# SPEC — Lighting Layout Engine (D-LE) v1.0

**Status.** Live (shipped 2026-05-29, commit `f89ebd0`).

**Governed by.** C09 §3.4 / §3.4.1 (auto-pipeline chain). Sibling of `SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md`, `SPEC-FURNITURE-LAYOUT-ENGINE.md`, `SPEC-CEILING-LAYOUT-ENGINE.md`.

**Owner.** `packages/ai-host/src/workflows/lightingLayout/`. Editor trigger in `apps/editor/src/ui/lighting-layout/`.

## §1 — Purpose

For every lit room on the active level, place one centred ceiling fixture per occupancy archetype. Pure + deterministic; no THREE / DOM / RNG (L2 doctrine).

## §2 — Inputs

- The set of detected rooms on the active level.
- Per-room `occupancyType` + centroid + polygon.
- The level's ceiling height (defaults: 2.4 m residential).

## §3 — Output

A `LightingCommandSet` projected to `lighting.create` commands (geometry-lighting `FurnitureType` value). Pre-minted ids.

```ts
interface LightingCommandSet {
    readonly levelId: string;
    readonly commands: readonly LightingCommand[];
    readonly ids: readonly string[];
    readonly totalElementCount: number;
    readonly warnings: readonly string[];
}
```

## §4 — Archetypes (per occupancy)

The current v1 baseline places ONE fixture per ceilable room. The wishlist below extends to task lighting (kitchen under-cabinet, bedside, bathroom mirror) — see §11.

| Occupancy | Fixture | Anchor | Rationale |
|---|---|---|---|
| `living-room` | `pendant` (hanging cylinder) | room centroid | warm ambient + visual anchor |
| `dining-room` | `pendant` (hanging cylinder) | room centroid | over the dining table |
| `kitchen` | `downlight` (recessed canister) | room centroid | functional task light |
| `master-bedroom` / `bedroom` | `pendant_pebble` or `pendant` | room centroid | soft ambient |
| `bathroom` / `ensuite` / `wc` | `downlight` | room centroid | IP-rated cool light |
| `corridor` | `downlight` | room centroid | circulation |
| `study` | `downlight` or `pendant` | centroid | task |
| `entrance-lobby` | `downlight` | centroid | bright welcome |
| `utility-room` | `linear_led` | centroid | functional |
| (any other) | not lit | — | — |

The archetype lookup MUST be pure-function-of-occupancy. New occupancies require a new archetype entry.

## §5 — Execution order

1. **Read** the active level + detected rooms.
2. **Filter** to rooms with a lighting archetype.
3. **Build** one `LightingCommand` per filtered room (id pre-minted; position = centroid in world-XZ at ceiling height; rotation 0).
4. **Dispatch** the set through `batchCoordinator.runBatch({ levelIds: [activeLevel], totalElementCount, skipRedetectRooms: true })` — lighting fixtures don't bound rooms.
5. **Emit** `lighting.layout-executed` on `runtime.events` with `{ placedCount, roomCount, levelId }`.

## §6 — Trigger semantics (`apps/editor/src/ui/lighting-layout/`)

### §6.1 — Console command

`window.pryzmLightAllRooms()` invokes the trigger manually. Listed in `pryzmShowApartmentHelp()`. `window.pryzmFurnishAndLightAllRooms()` is the manual-walls shortcut that chains furnish + lighting in one call.

### §6.2 — Auto-fire

Subscribes to `furnish.layout-executed` and defers one tick. The chain reads: `… → furnish.layout-executed → lighting.layout-execute → lighting.layout-executed`.

### §6.3 — §CHAIN-TIMEOUT

The trigger arms a 12 s fallback on `ceiling.layout-executed`. If furniture throws / hangs, lighting fires anyway with `console.warn('§CHAIN-TIMEOUT — no furnish.layout-executed within 12 s — firing lighting anyway.')`. D-LE itself MUST emit `lighting.layout-executed` on **both** success AND empty paths.

## §7 — Toasts

- `Lighting rooms…` — `info` on dispatch.
- `Lit X/Y rooms — N fixtures placed.` — `success` on completion.
- `No lighting placed — no rooms match a lighting archetype.` — `warn` on empty-result.
- `Lighting auto-place failed — see console.` — `error` on runBatch throw.

## §8 — Invariants

- **L2-pure.** Pure engine has no THREE/DOM/RNG.
- **One-undo.** All commands sit inside one `batchCoordinator.runBatch`.
- **Idempotent.** Re-firing on a chain replay MUST NOT double-emit; the engine reads detected rooms.
- **Skip-on-existing.** A room already hosting a lighting fixture is skipped (matched via `hostRoomId`).
- **P8 spans at the plane boundary.**

## §9 — Files

- `packages/ai-host/src/workflows/lightingLayout/types.ts`
- `packages/ai-host/src/workflows/lightingLayout/archetypes.ts`
- `packages/ai-host/src/workflows/lightingLayout/buildLightingCommands.ts`
- `apps/editor/src/ui/lighting-layout/lightingLayoutTrigger.ts`
- `apps/editor/src/ui/lighting-layout/LightingLayoutExecutor.ts`

## §10 — Tests

ai-host: archetype-mapping, polygon plumbing, deterministic id stub, empty-set behaviour. Editor: typecheck.

## §11 — Wishlist (NOT YET IMPLEMENTED)

The current v1 places ONE fixture per ceilable room. Architecturally a complete lighting plan layers:

- **Ambient** (current — one pendant/downlight per room).
- **Task.** Kitchen under-cabinet `linear_led`; bedside `table_terracotta` on the bedside_table; bathroom mirror `linear_led` (waterproof); study desk `linear_led`.
- **Accent.** Living `floor_arc_brass` or `floor_tripod_black`; corner accents.

These layered fixtures are part of the apartment-furnish-quality-wishlist Tier 2D ("proper lighting"). The matrix in `APARTMENT-DRIVING-PRINCIPLES-AND-ROOM-ELEMENT-MATRIX-2026-05-29.md` §B.2 enumerates per-room recommendations.

## §12 — Linked

- C09 §3.4 / §3.4.1 — auto-pipeline chain.
- SPEC-CEILING-LAYOUT-ENGINE — predecessor in the chain.
- SPEC-FURNITURE-LAYOUT-ENGINE — predecessor.
- `packages/geometry-lighting/src/LightingTypes.ts` — the full `LightingFixtureType` enum.
- `apartment-furnish-quality-wishlist` memory note — Tier 2D ("proper lighting").
