# C20 — Building & Apartment Aggregates

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: the architectural aggregation hierarchy — Building → Level → Apartment → Room — its schemas, stores, commands, and invariants. Wraps [C13 Project Lifecycle & Isolation](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) with the architectural hierarchy and provides the data model that [C27 BIM 3.0 Inspect](./C27-BIM3-INSPECT-MODEL.md) visualises.
> **Depends on**: [C03 Schemas, Commands & State](./C03-SCHEMAS-COMMANDS-AND-STATE.md) · [C11 Element Creation Pipeline](./C11-ELEMENT-CREATION-PIPELINE.md) · [C13 Project Lifecycle](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) · [C16 Command Authoring Protocol](./C16-COMMAND-AUTHORING-PROTOCOL.md) · [C19 Site Model & Parcel](./C19-SITE-MODEL-AND-PARCEL.md) (sibling — Site sits one level above Building).
> **Downstream**: [C27 BIM 3.0 Inspect](./C27-BIM3-INSPECT-MODEL.md) (tree view) · [C28 Data Panel & Automation](./C28-DATA-PANEL-AND-AUTOMATION.md) (panels A–F edit the aggregate parameters) · [C25 IFC Export](./C25-IFC-EXPORT-PRODUCTION.md) (IfcBuilding / IfcBuildingStorey / IfcSpatialZone mapping) · the apartment-layout workflow ([SPEC-APARTMENT-LAYOUT-GENERATOR](../../03-execution/specs/SPEC-APARTMENT-LAYOUT-GENERATOR.md)) and every downstream furniture / lighting / ceiling engine.
> **Key principles**: **P1** (single composition root) · **P5** (schemas are pure) · **P6** (commands are the only mutation path) · **P8** (every aggregate operation emits a span).
> **Authority**: when code disagrees with this contract, the code is wrong — fix the code or raise a superseding ADR. This contract supersedes any implicit hierarchy assumptions in `apps/editor/`, `packages/stores/`, and `packages/ai-host/`.

---

## §1 — Invariants

The numbered rules below are binding. Every subsystem that creates, mutates, queries, persists, or renders any of the four aggregate node kinds (Building, Level, Apartment, Room) **MUST** uphold them. Violations are CI-blocking under the gates in §6.

### §1.1 — One Project = (today) one Building

A PRYZM project **MUST** contain exactly one `Building` aggregate. The Building **MUST** be created automatically as part of the project bootstrap — the user **MUST NOT** be required to explicitly create a Building before drawing elements.

Multi-Building projects (campus, multi-tower master plan, mixed-use schemes) are a deliberate future capability and are tracked as the **C20.1 multi-Building amendment** (see §10). Until C20.1 is ratified, code **MUST NOT** create a second Building inside a project; any such attempt **MUST** fail validation at the command boundary (§4.1).

The single-Building constraint is enforced by `BuildingStore.size() ≤ 1` at every quiescent point in the session.

### §1.2 — Levels are ordered by elevation and uniquely numbered within a Building

Every `Level` (also called Storey, per IFC IfcBuildingStorey) **MUST** belong to exactly one Building. Within a Building:

- Each Level **MUST** have a unique `id` (a typed `LevelId` brand per [ADR-0001](../adrs/0001-typed-id-brand-strategy.md)).
- Each Level **MUST** have a unique `levelNumber` (signed integer; ground = `0`, basement = `-1, -2, …`, upper floors = `1, 2, …`).
- Each Level **MUST** have a finite `elevation` (metres above project origin Y-plane).
- The `elevation` ordering **MUST** be monotonically increasing in `levelNumber`: if `Lᵢ.levelNumber < Lⱼ.levelNumber`, then `Lᵢ.elevation < Lⱼ.elevation`.

Two Levels with identical `levelNumber` is a hard validation failure. Two Levels with identical `elevation` is a hard validation failure (slabs would collide; structural plate cannot be in two horizontal planes).

CI gate: `check-aggregate-uniqueness.ts` (§6).

### §1.3 — Apartments are single-Level (multi-Level deferred)

Every `Apartment` aggregate **MUST** belong to exactly one Level today. The `Apartment.levelId` field is mandatory and points to a single `LevelId`.

Multi-Level apartments (duplex, triplex, penthouse with mezzanine) are a deliberate future capability tracked as the **C20.2 multi-Level apartments amendment** (see §10). The schema includes an `ApartmentTypology` `'duplex'` literal today (see [`packages/schemas/src/apartment/ApartmentParameters.ts`](../../../packages/schemas/src/apartment/ApartmentParameters.ts)) — but until C20.2 lands, a `'duplex'` typology **MUST** be realised as a single-Level aggregate with the upper unit decomposed into a separate Apartment whose adjacency to the lower unit is recorded only in semantic metadata, not in the aggregate.

Single-Level is enforced by the schema `Apartment.levelId: LevelId` (not `LevelId[]`) and by CI gate `check-aggregate-uniqueness.ts`.

### §1.4 — Rooms belong to exactly one Level and at most one Apartment

Every `Room` aggregate:

- **MUST** belong to exactly one Level (`Room.levelId`).
- **MAY** belong to at most one Apartment (`Room.apartmentId: ApartmentId | null`).
- **MUST NOT** belong to multiple Apartments simultaneously.
- **MAY** be apartment-less — e.g. a public corridor, lift lobby, plant room in a multi-apartment floor plate; an external balcony classified as a Room; a common-area space.

If `Room.apartmentId` is non-null, then `Room.levelId` **MUST** equal `Apartment(Room.apartmentId).levelId`. Cross-Level room↔apartment binding is forbidden and fails CI gate `check-room-apartment-coherence.ts` (§6).

### §1.5 — Aggregate stores propagate parameter updates downward via D-α-3

Mutating an aggregate parameter **MUST** trigger downward propagation through the `ApartmentParameterPropagator` (BIM 2/3 D-α-3, file [`packages/stores/src/ApartmentParameterPropagator.ts`](../../../packages/stores/src/ApartmentParameterPropagator.ts)). The propagator:

- Observes `ApartmentParametersStore` and `RoomParametersStore` change events.
- Resolves the impact set (which Rooms inherit which Apartment parameter; which downstream geometry needs re-derivation).
- Emits derived patches into the geometry stores (walls, openings, slabs, ceilings, furniture) through the command bus — never via direct store writes.

The propagator is the **single** authority for "an aggregate parameter changed, here is what geometry / furniture / lighting must re-solve." UI code, AI workflows, and import readers **MUST NOT** mutate downstream geometry in response to an aggregate parameter change; they dispatch the aggregate-level command and rely on the propagator to fan out.

Detail: [APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM §6 (D-α workstream)](../../03-execution/plans/apartment/bim2-bim3-data-mgmt.md).

### §1.6 — Every aggregate mutation flows through the command bus

Per **P6**, no UI surface, no AI workflow, no IFC reader, no test fixture, and no internal subsystem **MAY** write directly to `BuildingStore`, `LevelStore`, `ApartmentParametersStore`, or `RoomParametersStore`. Every mutation **MUST** dispatch through `commandBus` using one of the commands enumerated in §4.

Direct `store.applyPatch(…)` from outside the registered command handler is a CI violation (`check-commandmanager.mjs` extended for aggregate stores). The single exception: the project-bootstrap loader, which seeds the stores from a persisted project file inside a guarded "bootstrap window" between `pryzm-project-context-set` and `pryzm-project-loaded` ([C13 §5](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md)). Outside that window, applyPatch from a non-command source fails the test suite.

### §1.7 — Every aggregate operation emits a span `pryzm.aggregate.<verb>`

Per **P8**, every exported aggregate operation **MUST** open an OpenTelemetry span with name `pryzm.aggregate.<verb>` where `<verb>` is the lower-camel-case action: `pryzm.aggregate.buildingCreate`, `pryzm.aggregate.levelUpdate`, `pryzm.aggregate.apartmentDelete`, `pryzm.aggregate.roomAssignToApartment`, etc.

Span attributes (minimum):

| Attribute | Type | Meaning |
|---|---|---|
| `aggregate.kind` | `'building' \| 'level' \| 'apartment' \| 'room'` | The node kind being mutated |
| `aggregate.id` | string | The typed-id brand value |
| `aggregate.parentId` | string \| null | The parent aggregate's id (Building.parentId = projectId; Level.parentId = buildingId; Apartment.parentId = levelId; Room.parentId = levelId) |
| `aggregate.verb` | string | The mutation verb (create / update / delete / assign / unassign) |

Spans are emitted at the command-handler boundary, not inside the store. This keeps the store layer pure and the observability layer composable. CI gate `check-aggregate-spans.ts` (§6).

### §1.8 — Aggregate ids are typed brands

Per [ADR-0001](../adrs/0001-typed-id-brand-strategy.md), every aggregate id **MUST** be a TypeScript branded string type. The four brands are:

```typescript
type BuildingId   = string & { readonly __brand: 'BuildingId' };
type LevelId      = string & { readonly __brand: 'LevelId' };
type ApartmentId  = string & { readonly __brand: 'ApartmentId' };
type RoomId       = string & { readonly __brand: 'RoomId' };
```

Cross-kind id assignment (e.g. passing a `BuildingId` where a `LevelId` is expected) **MUST** fail at the TypeScript type level. Schemas in `packages/schemas/src/aggregates/` provide the `z.string().brand<…>()` parsers; runtime parsing **MUST** validate the brand against the expected kind.

CI gate: `check-aggregate-id-brands.ts` (uses the existing typed-id detector).

### §1.9 — Deletion is cascading and reference-checked

Deleting an aggregate **MUST** propagate downward with explicit user acknowledgement:

| Delete | Cascade |
|---|---|
| `building.delete` | Forbidden today (one project = one Building, §1.1); reserved for C20.1 |
| `level.delete` | Cascades to every Apartment and Room on the Level. All hosted elements (walls, slabs, openings, furniture) on the Level are removed via the element-creation contract ([C11 §7 deletion semantics](./C11-ELEMENT-CREATION-PIPELINE.md)). |
| `apartment.delete` | Does NOT cascade to Rooms. Rooms on the Apartment have their `apartmentId` set to `null` (unassigned). User MAY then re-assign or delete each Room individually. |
| `room.delete` | Cascades to every element whose `roomId` is this Room (room-scoped furniture, ceilings). Elements whose host is a wall facing into the Room (doors, windows) are NOT cascaded — they remain hosted on the wall. |

Cascade semantics **MUST** be implemented inside the corresponding command handler (`level.delete`, `apartment.delete`, `room.delete`). The handler **MUST** dispatch sub-commands to remove the cascaded children, not perform direct store writes. Deletion order: deepest first (elements → rooms → apartments → level), to keep referential integrity at every commit point.

Reference checks: before any aggregate is deleted, the handler **MUST** verify that no in-flight command has the aggregate's id in its payload. If a stale reference is found, the delete fails with `AggregateInUseError`.

### §1.10 — Aggregates are pure data (no THREE, no DOM)

Per **P5**, the aggregate schemas in `packages/schemas/src/aggregates/` **MUST** be pure Zod — no THREE, no DOM, no I/O, no transitive imports of `three`, `apps/editor/`, `packages/renderer-three/`, or anything in L1+.

The Building / Level / Apartment / Room nodes are L0 schemas. Their geometric representations (the Building's outline, the Level's slab, the Apartment's perimeter polygon, the Room's bounding rectangle) are computed by L2 services from the L0 parameters + the L0 element store. The aggregate schema **MUST NOT** carry pre-computed geometry — that is derived state, owned by [C04 Rendering & Scheduling](./C04-RENDERING-AND-SCHEDULING.md).

CI gate: existing `tools/ga-gate/check-schemas-purity.ts` extended to scan `aggregates/`.

### §1.11 — A Level's `apartments[]` and `rooms[]` are derived, not stored

`LevelStore` **MUST NOT** carry an `apartments: ApartmentId[]` or `rooms: RoomId[]` array. The relationship is owned by the child store's foreign key (`Apartment.levelId` / `Room.levelId`). Derived queries (`getApartmentsByLevel(levelId)`, `getRoomsByLevel(levelId)`) are pure selectors on the child store; they are NOT cached on the parent.

This invariant prevents two well-known classes of bug: stale parent arrays after a delete, and dual sources of truth that diverge. The cost (an O(n) scan over the child store for each query) is acceptable; the child stores are small (< 100 Rooms typical, < 20 Apartments typical, < 5 Levels typical). For larger scales the selector caches its result via the shallow-memoisation pattern in `packages/stores/src/selectorMemo.ts`.

### §1.12 — Apartment parameters drive room geometry; not the reverse

The `ApartmentParametersStore` (D-α-1, BIM 2/3) is the **upstream** node. The `RoomParametersStore` is **downstream** of it. The propagation engine (§1.5) flows changes from apartment → room → derived geometry, never the reverse.

Therefore: editing `ApartmentParameters.bedrooms = 3` **MAY** add or remove `RoomParameters` rows. Editing a single `RoomParameters.areaM2` **MUST NOT** silently mutate `ApartmentParameters.shellAreaM2` — area mismatches at the apartment scale surface as a validator failure (D2.4 envelope validator) and a user-resolvable conflict per [P8](../../01-strategy/engineering-vision.md). The user adjudicates.

### §1.13 — Project-isolation: aggregate stores are project-scoped

Per [C13 §3.8](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md), no command handler or background callback **MUST** mutate aggregate stores belonging to a prior project session. The four aggregate stores **MUST** be cleared as part of the C13 teardown sequence, before the new project's `pryzm-project-context-set` event fires.

The clear order: Room → Apartment → Level → Building (deepest first, mirrors §1.9 deletion cascade). Each clear MUST run inside the synchronous teardown phase and MUST emit a `pryzm.aggregate.<kind>.clearForSwitch` span.

---

## §2 — Schema

All four aggregate schemas live in `packages/schemas/src/aggregates/`. They are pure Zod per §1.10 and consumed by the stores (§3), commands (§4), and the Inspect tree (§5).

### §2.1 — Building

```typescript
export const Building = z.object({
    id:           z.string().brand<'BuildingId'>(),
    projectId:    z.string().brand<'ProjectId'>(),
    name:         z.string().min(1).max(120),
    description:  z.string().max(2000).default(''),
    siteId:       z.string().brand<'SiteId'>().optional(),  // forward link to C19 Site
    createdAt:    z.string().datetime(),
    updatedAt:    z.string().datetime(),
    /** Inspect-tree display ordinal among siblings (for C20.1 multi-Building). */
    ordinal:      z.number().int().min(0).default(0),
});
```

| Field | Type | Default | Validation |
|---|---|---|---|
| `id` | `BuildingId` (branded string) | — | unique within project; auto-generated UUID v4 |
| `projectId` | `ProjectId` (branded string) | — | matches the active `ProjectContext.projectId` (C13) |
| `name` | string | `'Building 1'` | 1–120 chars, free text |
| `description` | string | `''` | ≤ 2000 chars |
| `siteId` | `SiteId` \| undefined | undefined | forward reference to a [C19 Site](./C19-SITE-MODEL-AND-PARCEL.md) (optional) |
| `createdAt` / `updatedAt` | ISO 8601 datetime | now | server-managed |
| `ordinal` | int ≥ 0 | 0 | display order for C20.1; single-Building today always = 0 |

### §2.2 — Level

```typescript
export const Level = z.object({
    id:           z.string().brand<'LevelId'>(),
    buildingId:   z.string().brand<'BuildingId'>(),
    name:         z.string().min(1).max(80),
    levelNumber:  z.number().int(),
    elevation:    z.number().finite(),       // metres above project Y-origin
    height:       z.number().positive().max(20),  // floor-to-floor height in metres
    isActive:     z.boolean().default(false),
    isReference:  z.boolean().default(false),  // reference plane (e.g. roof, ceiling plane)
    createdAt:    z.string().datetime(),
    updatedAt:    z.string().datetime(),
});
```

| Field | Type | Default | Validation |
|---|---|---|---|
| `id` | `LevelId` | — | unique within Building; auto UUID v4 |
| `buildingId` | `BuildingId` | — | MUST point at an existing Building in the same project |
| `name` | string | `'Ground Floor'`, `'L1'`, … | 1–80 chars |
| `levelNumber` | signed int | 0 | unique within Building; ground = 0, basement = -1, -2, …, upper floors = 1, 2, … |
| `elevation` | finite number | 0 metres | unique within Building; monotonically increasing with `levelNumber` (§1.2) |
| `height` | positive number | 2.7 metres | typical residential 2.4–3.2; max 20 m |
| `isActive` | boolean | false | exactly zero or one Level may have `isActive=true` at any quiescent point (C13) |
| `isReference` | boolean | false | true for ceiling-reference planes; reference levels don't carry Apartments or Rooms |

### §2.3 — Apartment

The Apartment aggregate composes [`ApartmentParameters`](../../../packages/schemas/src/apartment/ApartmentParameters.ts) (the user-editable parameters) with the aggregate identity (id + parent + name).

```typescript
export const Apartment = z.object({
    id:           z.string().brand<'ApartmentId'>(),
    buildingId:   z.string().brand<'BuildingId'>(),
    levelId:      z.string().brand<'LevelId'>(),
    name:         z.string().min(1).max(120),
    /** The unit number as shown in the inspect tree, e.g. "1A", "203", "Penthouse". */
    unitNumber:   z.string().min(1).max(20),
    /** Composes the existing user-editable parameter record (see ApartmentParameters.ts). */
    parameters:   ApartmentParameters,
    createdAt:    z.string().datetime(),
    updatedAt:    z.string().datetime(),
});
```

| Field | Type | Default | Validation |
|---|---|---|---|
| `id` | `ApartmentId` | — | unique within Building; auto UUID v4 |
| `buildingId` | `BuildingId` | — | matches the Level's buildingId |
| `levelId` | `LevelId` | — | single Level only (§1.3) |
| `name` | string | derived from `unitNumber` | 1–120 chars |
| `unitNumber` | string | `'1A'`, `'101'`, … | 1–20 chars, unique within Building |
| `parameters` | `ApartmentParameters` | see [`ApartmentParameters.ts`](../../../packages/schemas/src/apartment/ApartmentParameters.ts) | the existing Zod record — bedrooms, bathrooms, masterEnSuite, openPlanKitchenDining, livingRoom, entranceHall, typology, shellAreaM2 envelope |

Note: `parameters.id` is the **same value** as the `Apartment.id` field (composition keeps a single canonical id surface). The store enforces this on `applyPatch`.

### §2.4 — Room

The Room aggregate composes [`RoomParameters`](../../../packages/schemas/src/apartment/ApartmentParameters.ts) (the user-editable parameters) with the aggregate identity and parent links.

```typescript
export const Room = z.object({
    id:           z.string().brand<'RoomId'>(),
    levelId:      z.string().brand<'LevelId'>(),
    /** Null when the Room is not currently assigned to an Apartment
     *  (e.g. public corridor, lift lobby, plant room). */
    apartmentId:  z.string().brand<'ApartmentId'>().nullable(),
    name:         z.string().min(1).max(120),
    parameters:   RoomParameters,
    createdAt:    z.string().datetime(),
    updatedAt:    z.string().datetime(),
});
```

| Field | Type | Default | Validation |
|---|---|---|---|
| `id` | `RoomId` | — | unique within Building; auto UUID v4 |
| `levelId` | `LevelId` | — | MUST equal `Apartment(apartmentId).levelId` if `apartmentId` is non-null (§1.4) |
| `apartmentId` | `ApartmentId` \| null | null | (§1.4) |
| `name` | string | derived from `parameters.type` (e.g. "Master Bedroom") | 1–120 chars |
| `parameters` | `RoomParameters` | the existing Zod record | type, areaM2 envelope, widthM/depthM envelopes, daylightRequired, privacyTier, acousticIsolation |

Note: `parameters.id` and `parameters.apartmentId` **MUST** match `Room.id` and `Room.apartmentId` respectively.

### §2.5 — Aggregate relationship diagram

```
Project (C13)
└── Building (1, today; N in C20.1)
    ├── Level 0  (active)         [Apartments + Rooms below]
    │   ├── Apartment "1A"
    │   │   ├── Room "Master Bedroom"
    │   │   ├── Room "Living"
    │   │   ├── Room "Kitchen"
    │   │   └── Room "Bathroom"
    │   ├── Apartment "1B"
    │   │   └── Room "Studio"
    │   ├── Room "Public Corridor"  (apartmentId = null)
    │   └── Room "Lift Lobby"        (apartmentId = null)
    ├── Level 1 (inactive)
    └── Level 2 (inactive)
```

---

## §3 — Stores & API surface

The four aggregate stores live in `packages/stores/src/aggregates/`. Two already exist (Apartment, Room); two are new (Building, Level). All four extend `Store<T>` from `@pryzm/plugin-sdk` and follow the project-scoped lifecycle.

### §3.1 — `BuildingStore` (NEW)

```typescript
class BuildingStore extends Store<Building> {
    static readonly ephemeral = true;          // not in command-event log; loaded at bootstrap
    constructor() { super('building'); }
    addBuilding(b: Building): void;             // applyPatch insert
    updateBuilding(id: BuildingId, p: Partial<Building>): void;
    removeBuilding(id: BuildingId): void;       // forbidden today by §1.1
    getActive(): Building | undefined;          // the (only, today) Building
}
```

File: `packages/stores/src/aggregates/BuildingStore.ts` (NEW). Mutations only via the registered `building.*` command handlers (§4.1).

### §3.2 — `LevelStore` (NEW)

Today's `plugins/plan-view/src/LevelStore.ts` is a transitional plugin-local store. C20 promotes it to `packages/stores/src/aggregates/LevelStore.ts` with the schema in §2.2 and the typed-id brand (§1.8).

```typescript
class LevelStore extends Store<Level> {
    static readonly ephemeral = true;
    constructor() { super('level'); }
    addLevel(l: Level): void;
    updateLevel(id: LevelId, p: Partial<Level>): void;
    removeLevel(id: LevelId): void;
    setActive(id: LevelId): void;
    getActive(): Level | undefined;
    getLevelsForBuilding(b: BuildingId): Level[];   // sorted by levelNumber ascending
}
```

Migration plan for the plugin-local LevelStore: see §8.

### §3.3 — `ApartmentParametersStore` (existing — extended)

Existing file: [`packages/stores/src/ApartmentParametersStore.ts`](../../../packages/stores/src/ApartmentParametersStore.ts). C20 keeps the existing store but introduces a NEW companion `ApartmentStore` that wraps it with the aggregate-level identity (buildingId, levelId, name, unitNumber). The parameters store is the inner data; the new `ApartmentStore` is the outer aggregate.

Equivalent surface:

```typescript
class ApartmentStore extends Store<Apartment> {
    static readonly ephemeral = true;
    constructor() { super('apartment'); }
    addApartment(a: Apartment): void;
    updateApartment(id: ApartmentId, p: Partial<Apartment>): void;
    removeApartment(id: ApartmentId): void;
    getApartmentsForLevel(l: LevelId): Apartment[];
    getApartmentsForBuilding(b: BuildingId): Apartment[];
}
```

The existing `ApartmentParametersStore` continues to expose `ApartmentParameters` for the Data Panel (D-α-4) and the propagation engine (§1.5). Both stores **MUST** stay in sync: `Apartment.parameters` and the matching row in `ApartmentParametersStore` carry the same `ApartmentParameters` value. The sync is enforced by the `apartment.*` command handlers (§4.3) which apply patches to both stores atomically.

### §3.4 — `RoomParametersStore` (existing — extended)

Existing file: [`packages/stores/src/RoomParametersStore.ts`](../../../packages/stores/src/RoomParametersStore.ts). Same composition pattern as §3.3: a NEW companion `RoomStore` wraps the parameter store with aggregate identity (levelId, apartmentId, name).

```typescript
class RoomStore extends Store<Room> {
    static readonly ephemeral = true;
    constructor() { super('room'); }
    addRoom(r: Room): void;
    updateRoom(id: RoomId, p: Partial<Room>): void;
    removeRoom(id: RoomId): void;
    assignRoomToApartment(roomId: RoomId, apartmentId: ApartmentId | null): void;
    getRoomsForApartment(a: ApartmentId): Room[];
    getRoomsForLevel(l: LevelId): Room[];
    getUnassignedRoomsForLevel(l: LevelId): Room[];  // apartmentId = null
}
```

### §3.5 — `ApartmentParameterPropagator` (existing)

The propagator (D-α-3) at [`packages/stores/src/ApartmentParameterPropagator.ts`](../../../packages/stores/src/ApartmentParameterPropagator.ts) subscribes to the four aggregate stores and fans out parameter changes to downstream stores. C20 codifies the subscription pattern (§1.5) but does not duplicate the propagator's implementation surface; it is the binding between C20 (aggregates) and the geometry contracts (C04, C11, C15).

### §3.6 — Composition root wiring

Per **P1** (single composition root), the four aggregate stores **MUST** be constructed inside `composeRuntime()` (in `packages/runtime-composer/`) and exposed on the `PryzmRuntime` surface. No second wiring path may exist.

Composition snippet (pseudo-code, illustrative):

```typescript
function composeRuntime(deps): PryzmRuntime {
    const buildingStore = new BuildingStore();
    const levelStore    = new LevelStore();
    const apartmentStore = new ApartmentStore();
    const roomStore      = new RoomStore();
    // … wired into commandBus + ApartmentParameterPropagator + sceneCommitter …
    return { stores: { building: buildingStore, level: levelStore, apartment: apartmentStore, room: roomStore, … }, … };
}
```

---

## §4 — Commands

Every aggregate mutation is a command on the bus (§1.6). The command names follow [C16 Command Authoring Protocol §3](./C16-COMMAND-AUTHORING-PROTOCOL.md) (lower-camel verb, dot-separated namespace).

### §4.1 — `building.*`

| Command | Payload | Effect | Today's status |
|---|---|---|---|
| `building.create` | `{ projectId, name, description? }` | Inserts a Building. **MUST** fail if a Building already exists (§1.1). | LOW frequency — fires once per project bootstrap |
| `building.update` | `{ id, patch: Partial<Building> }` | Mutates the Building. **MUST** validate that `id` exists; **MUST NOT** change `projectId`. | LOW — name / description / siteId edits |
| `building.delete` | `{ id }` | Forbidden today (§1.1); reserved for C20.1 amendment | Forbidden |

### §4.2 — `level.*`

| Command | Payload | Effect |
|---|---|---|
| `level.create` | `{ buildingId, name, levelNumber, elevation, height }` | Inserts a Level. Validates uniqueness of `levelNumber` and monotonic-elevation invariant (§1.2). |
| `level.update` | `{ id, patch: Partial<Level> }` | Mutates a Level. If `elevation` or `levelNumber` changes, re-validates §1.2 across the Building. |
| `level.delete` | `{ id }` | Cascades to every Apartment + Room + element on the Level (§1.9). |
| `level.setActive` | `{ id }` | Single-active enforcement; clears any other Level's `isActive=true`. |

### §4.3 — `apartment.*`

| Command | Payload | Effect |
|---|---|---|
| `apartment.create` | `{ buildingId, levelId, name, unitNumber, parameters }` | Inserts both `Apartment` (in `ApartmentStore`) and the matching `ApartmentParameters` row (in `ApartmentParametersStore`) atomically. |
| `apartment.update` | `{ id, patch: Partial<Apartment>, parameterPatch?: Partial<ApartmentParameters> }` | Mutates one or both. Triggers the propagator (§1.5). |
| `apartment.delete` | `{ id }` | Unassigns every Room (`Room.apartmentId = null`); does NOT delete the Rooms (§1.9). |

### §4.4 — `room.*`

| Command | Payload | Effect |
|---|---|---|
| `room.create` | `{ levelId, apartmentId?, name, parameters }` | Inserts the Room. `apartmentId` MAY be null. |
| `room.update` | `{ id, patch: Partial<Room>, parameterPatch?: Partial<RoomParameters> }` | Mutates one or both. Triggers the propagator. |
| `room.delete` | `{ id }` | Cascades to room-scoped elements (furniture, ceilings, room-scoped lighting) per §1.9. |
| `room.assignToApartment` | `{ roomId, apartmentId: ApartmentId \| null }` | Sets `Room.apartmentId`. Validates the same-Level constraint (§1.4). |

### §4.5 — Authoring discipline (cross-link to C16)

Every aggregate command **MUST** follow C16 §3 (verb-first naming), §4 (payload schema validation at the boundary), §5 (idempotency for re-entry), and §6 (undoability via ADR-051 single-store undo). The four aggregate stores are first-class undo participants — undoing an `apartment.create` removes the apartment AND its parameters row in one ring-buffer step.

---

## §5 — UI

The aggregate model has **no direct UI editor** in the C20 surface. C27 owns the read-side; the Data Panel (C28) owns the write-side.

### §5.1 — Read surface: the Inspect tree

[C27 BIM 3.0 Inspect](./C27-BIM3-INSPECT-MODEL.md) renders the aggregate hierarchy. Per C27 §2 the tree levels correspond directly to the C20 aggregates:

| Tree level | Backing C20 store |
|---|---|
| Site (L0) | `SiteModelStore` (C19) |
| Building (L1) | `BuildingStore` (this contract §3.1) |
| Level (L2) | `LevelStore` (this contract §3.2) |
| Apartment (L3) | `ApartmentStore` (this contract §3.3) |
| Room (L4) | `RoomStore` (this contract §3.4) |
| Element Type / Instance (L5, L6) | `ElementStore` (C03) |

C27 selection drives [C09 visibility intent](./C09-AI-AND-VISIBILITY-INTENT.md) isolation; C20 owns the model that C27 displays.

### §5.2 — Write surface: the Data Panel (D-α-4 / D-α-5)

The Data Panel ([C28 §3](./C28-DATA-PANEL-AND-AUTOMATION.md)) and the apartment-specific Data Management Panel ([APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM §6](../../03-execution/plans/apartment/bim2-bim3-data-mgmt.md)) edit the aggregates via the §4 commands. The six D-β panels (apartment data, room data, adjacency, constraint, furniture program, activity systems) correspond to slice-views over the C20 stores.

C20 does NOT mandate the editor visual; it only mandates that every edit dispatches via `commandBus`.

### §5.3 — Aggregate ↔ element synchronisation

When the apartment-layout workflow ([SPEC-APARTMENT-LAYOUT-GENERATOR](../../03-execution/specs/SPEC-APARTMENT-LAYOUT-GENERATOR.md)) commits a generated layout:

1. It first dispatches `apartment.create` (and any necessary `room.create` calls).
2. Then it dispatches the element commands (`wall.batch.create`, `wall.createOpening`, `door.batch.create`) per [C09 §3.4](./C09-AI-AND-VISIBILITY-INTENT.md).
3. The walls / doors / windows carry `roomId` foreign keys so room-detection (and Inspect-tree population) is deterministic.

The reverse — element creation triggering room aggregate creation — is performed by the room-detection pass (`rooms.redetect`), which is the only authority that **MAY** insert a `Room` aggregate in response to geometry, and it does so only via the `room.create` command (§4.4).

---

## §6 — Tests & CI gates

### §6.1 — Static CI gates

| Gate | What it checks | File |
|---|---|---|
| `check-aggregate-uniqueness.ts` | One Building per project; unique `levelNumber` and unique `elevation` per Building; unique `unitNumber` per Building; unique aggregate ids globally | `tools/ga-gate/check-aggregate-uniqueness.ts` (NEW) |
| `check-room-apartment-coherence.ts` | If `Room.apartmentId != null` then `Room.levelId == Apartment(apartmentId).levelId`; no orphaned `apartmentId` references; no cross-Building Apartment ↔ Room links | `tools/ga-gate/check-room-apartment-coherence.ts` (NEW) |
| `check-aggregate-spans.ts` | Every `apartment.*` / `level.*` / `building.*` / `room.*` command handler opens a `pryzm.aggregate.<verb>` span with the four required attributes (§1.7) | `tools/ga-gate/check-aggregate-spans.ts` (NEW) |
| `check-aggregate-id-brands.ts` | All aggregate ids in code are typed brands; no raw `string` slot accepts a `LevelId` etc. | extend the existing typed-id detector |
| `check-aggregate-direct-mutation.ts` | No `applyPatch` to aggregate stores outside the registered command handler set | extend `check-commandmanager.mjs` |
| `check-schemas-purity.ts` | `packages/schemas/src/aggregates/` has zero I/O, THREE, DOM, or L1+ imports | extend the existing purity gate |

### §6.2 — Unit + integration tests

| Suite | What it covers |
|---|---|
| `packages/schemas/src/aggregates/__tests__/Building.test.ts` | Zod parse + brand validation + round-trip serialisation |
| `packages/schemas/src/aggregates/__tests__/Level.test.ts` | Monotonic-elevation refinement; unique-`levelNumber` validation |
| `packages/schemas/src/aggregates/__tests__/Apartment.test.ts` | `Apartment.id === parameters.id` invariant; `levelId` brand check |
| `packages/schemas/src/aggregates/__tests__/Room.test.ts` | `apartmentId == null` is valid; same-Level constraint when non-null |
| `packages/stores/__tests__/aggregates/cascade.test.ts` | `level.delete` cascades correctly; `apartment.delete` unassigns Rooms (does NOT delete); `room.delete` cascades to elements |
| `packages/stores/__tests__/aggregates/propagation.test.ts` | `apartment.update` triggers the propagator; downstream room areas re-target; geometry stores receive derived patches |
| `tests/e2e/aggregate-isolation.spec.ts` | After C13 project switch, all four aggregate stores are empty; new project bootstrap creates a fresh Building |

### §6.3 — Telemetry tests

`packages/runtime-composer/__tests__/aggregate-spans.test.ts` asserts that every of the 14 commands in §4 emits a `pryzm.aggregate.<verb>` span with the four mandatory attributes (`aggregate.kind`, `aggregate.id`, `aggregate.parentId`, `aggregate.verb`).

---

## §7 — NFT targets

Per [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md), the C20 surface carries these performance budgets:

| Operation | Budget | Bench |
|---|---|---|
| `apartment.create` (single, with 8 rooms) | < 50 ms (incl. propagation kickoff) | `aggregate-create.bench.ts` |
| `level.delete` (with 4 apartments, 32 rooms, ~400 elements) | < 250 ms (cascade) | `aggregate-cascade.bench.ts` |
| Inspect-tree population for 1 Building / 5 Levels / 20 Apartments / 120 Rooms | < 30 ms | `aggregate-tree.bench.ts` (feeds C27 §11) |
| `getRoomsForApartment(apartmentId)` selector | < 1 ms (with memo cache) | `aggregate-selectors.bench.ts` |
| Aggregate-store project-switch teardown (all 4 stores) | < 20 ms total | `aggregate-isolation.bench.ts` |

These targets are advisory until the Inspect tree (C27) and the Data Panel (C28) reach ACTIVE status; once they do, the targets become hard CI failures via the existing performance-regression harness.

---

## §8 — Migration plan

C20 is mostly codification of existing surfaces. The new constructions are `BuildingStore` and the promoted `LevelStore` + the wrapper `ApartmentStore` / `RoomStore` around the existing parameter stores.

### §8.1 — Stage M1 — schema authorship (≈ 1 dev-week)

- Author `packages/schemas/src/aggregates/{Building, Level, Apartment, Room}.ts` per §2.
- Author the four typed-id brands per §1.8.
- Add the Zod schemas to the package barrel and to the snapshot serializer.

### §8.2 — Stage M2 — store construction (≈ 1.5 dev-weeks)

- New `BuildingStore` in `packages/stores/src/aggregates/BuildingStore.ts` per §3.1.
- Promote `plugins/plan-view/src/LevelStore.ts` → `packages/stores/src/aggregates/LevelStore.ts` per §3.2. Keep a re-export shim in the old path with a deprecation warning for one release; remove the shim once `plan-view` is rewired.
- New `ApartmentStore` per §3.3 wrapping the existing `ApartmentParametersStore`.
- New `RoomStore` per §3.4 wrapping the existing `RoomParametersStore`.

### §8.3 — Stage M3 — command-handler wiring (≈ 1 dev-week)

- Register the 14 commands from §4 in `packages/command-registry/`.
- Each handler opens its `pryzm.aggregate.<verb>` span before dispatching the store patch.
- The bootstrap loader is updated to dispatch `building.create` + `level.create` (for the default Ground Floor) once per cold project boot.

### §8.4 — Stage M4 — Inspect-tree integration (≈ 0.5 dev-week)

- C27 tree branches subscribe to the four new aggregate stores per the §2 — §3 binding.
- Existing PropertyInspector code that reads aggregates directly via `BimManager` is migrated to selectors over the new stores.

### §8.5 — Stage M5 — CI gates ratchet (≈ 0.5 dev-week)

- Land the six new gates in `tools/ga-gate/` per §6.1.
- Until M2 + M3 are complete, gates are soft-fail counters.
- Once M3 is complete, gates ratchet to hard-fail.

### §8.6 — Stage M6 — apartment-layout workflow rewiring (≈ 0.5 dev-week)

- The existing apartment-layout pipeline (D-TGL, D-FLE, D-CE, D-LE) is rewired to dispatch `apartment.create` + `room.create` ahead of its element commands. Today the workflow inserts rooms into the parameter stores directly; M6 routes through the new command surface.

Total: ≈ 5 dev-weeks single-contributor.

---

## §9 — What is NOT in this contract

C20 owns only the architectural aggregate hierarchy. The following adjacent concerns live in sibling contracts:

- **Element creation (walls, slabs, doors, windows, furniture, fixtures)** — [C11 Element Creation Pipeline](./C11-ELEMENT-CREATION-PIPELINE.md). The aggregates own the spatial buckets; elements are placed into those buckets via C11.
- **Floors / Ceilings as elements** — C20 does NOT model floors or ceilings as aggregates. They are elements (per C11). A Level's "floor" is the topmost slab on the Level below it; a Level's "ceiling" is the slab on the Level above (or a dedicated ceiling element per [#54 D-CE](../../03-execution/specs/SPEC-CEILING-LAYOUT-ENGINE.md)). The aggregate is the Level itself, not the slabs that bound it.
- **Hosted elements (doors / windows in walls)** — [C15 Hosted Element Contract](./C15-HOSTED-ELEMENT-CONTRACT.md). C20 says that a Room may be bounded by walls hosting doors; C15 owns the host/hosted relationship.
- **Inspect-tree visualisation** — [C27 BIM 3.0 Inspect](./C27-BIM3-INSPECT-MODEL.md). C20 owns the model; C27 owns the tree component, isolation engine, and dashboards.
- **Data-panel editing** — [C28 Data Panel & Automation](./C28-DATA-PANEL-AND-AUTOMATION.md). C20 owns the schema + commands; C28 owns the grid + form UI.
- **Site (one level above Building)** — [C19 Site Model & Parcel](./C19-SITE-MODEL-AND-PARCEL.md). `Building.siteId` is a forward reference; the Site itself is owned by C19.
- **Project session model** — [C13 Project Lifecycle & Isolation](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md). C20 inherits C13's session-clear contract (§1.13); it does not redefine the session lifecycle.
- **IFC export** — [C25 IFC Export Production](./C25-IFC-EXPORT-PRODUCTION.md). The Building → Level → Apartment → Room hierarchy maps to IfcBuilding → IfcBuildingStorey → IfcSpatialZone → IfcSpace, but the byte-format and Pset mapping live in C25.
- **AI / cognition stack** — [C09 AI & Visibility Intent](./C09-AI-AND-VISIBILITY-INTENT.md) and the [apartment cognition-stack framework](../../03-execution/plans/apartment/cognition-stack.md). C20 is the data substrate they consume.

---

## §10 — Open design questions (forward amendments)

### §10.1 — C20.1 — Multi-Building amendment

A single project today has one Building (§1.1). Real-world projects routinely cover multi-Building schemes:

- Residential developments (3–8 apartment towers on one parcel)
- Mixed-use schemes (commercial podium + residential tower + community building)
- Campus master plans (university, hospital, corporate HQ)
- Site-aware portfolios where the same project tracks several buildings on one Site

Open questions to be resolved in the C20.1 amendment ADR:

- **Active-Building selector** — does the editor have an "active Building" concept analogous to the active Level? Or do tools always operate on the Level of the currently selected element, with no explicit Building selection?
- **Building deletion semantics** — once a project carries N Buildings, the §1.9 deletion cascade matters; full design needed.
- **Project export when there are N Buildings** — IFC supports IfcSite → many IfcBuilding; what is the user-facing export selector (per-building, all-in-one, federated)?
- **Cross-Building visibility intent** — C09 isolation is per-element; with N Buildings, do we add a Building-tier dimming default analogous to the Level dimming in C27?
- **Coordinate origin** — do all Buildings share the project origin, or does each Building carry an `origin: Vec3` offset within the Site? Tied to C19.

### §10.2 — C20.2 — Multi-Level apartments amendment

The `Apartment.levelId` is a single `LevelId` today (§1.3). Multi-Level apartments are a normal architectural form:

- Duplex (`'duplex'` typology exists in `ApartmentParameters.ts` already)
- Triplex (penthouse + attic + mezzanine)
- Maisonette (ground-floor + first-floor unit)

Open questions to be resolved in the C20.2 amendment ADR:

- **Schema change** — does `Apartment.levelId: LevelId` become `levelIds: LevelId[]`, or do we model a parent Apartment that contains per-Level sub-apartment slices?
- **Rooms across Levels** — a duplex's stairwell Room belongs to both Levels in some sense; does `Room.levelId` become `Room.levelIds: LevelId[]`, or do we split the stairwell into per-Level Room shards?
- **Adjacency semantics** — vertical adjacency (kitchen below master) is a real architectural relationship; today the room-adjacency graph is purely horizontal. C20.2 introduces a vertical adjacency edge type.
- **Inspect tree** — does the C27 tree show a multi-Level Apartment under one Level (the primary) or under each?
- **Apartment-layout solver** — D-TGL is single-Level today; the multi-Level solver introduces stair placement, vertical alignment of wet stacks, and floor-cut openings as new constraints.
- **Backward compatibility** — every persisted single-Level Apartment in existing projects must load forward into the multi-Level schema; the migration runner is non-trivial.

### §10.3 — Aggregate templates / typologies

The `ApartmentTypology` enum (`open-plan-mid-rise`, `closed-plan-mid-rise`, `compact-studio`, `duplex`, `penthouse`) drives default constraint thresholds. Open question: does C20 grow a sibling `BuildingTypology` (residential-tower, mixed-use-podium, masterplan, campus)? Filed for the C20.1 amendment.

### §10.4 — Aggregate naming localisation

`Building`, `Level`, `Apartment`, `Room` are English. The IFC mapping uses these names. The user-facing label may be localised (e.g. "Étage" / "Stockwerk" / "Pisos"). Open: does C20 own the localisation key surface, or is that a downstream concern of [the future C46 i18n contract](../MISSING-CONTRACTS-AUDIT-2026-06-01.md#3.4)?

---

## §11 — Cross-references

- [C03 Schemas, Commands & State](./C03-SCHEMAS-COMMANDS-AND-STATE.md) — the L0 schema + command-bus foundation C20 rides on.
- [C09 AI & Visibility Intent](./C09-AI-AND-VISIBILITY-INTENT.md) — apartment-layout workflow consumer.
- [C11 Element Creation Pipeline](./C11-ELEMENT-CREATION-PIPELINE.md) — elements that populate the aggregate buckets.
- [C13 Project Lifecycle & Isolation](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) — session model wrapping the aggregates.
- [C15 Hosted Element Contract](./C15-HOSTED-ELEMENT-CONTRACT.md) — door/window-in-wall semantics that cross Room boundaries.
- [C16 Command Authoring Protocol](./C16-COMMAND-AUTHORING-PROTOCOL.md) — authoring rules for the 14 commands in §4.
- [C19 Site Model & Parcel](./C19-SITE-MODEL-AND-PARCEL.md) — sibling contract; the `Building.siteId` forward reference.
- [C25 IFC Export Production](./C25-IFC-EXPORT-PRODUCTION.md) — IFC mapping for Building / Level / Apartment / Room.
- [C27 BIM 3.0 Inspect](./C27-BIM3-INSPECT-MODEL.md) — tree visualisation of the C20 hierarchy.
- [C28 Data Panel & Automation](./C28-DATA-PANEL-AND-AUTOMATION.md) — write-side editor for aggregate parameters.
- [APARTMENT-BIM2-BIM3 Data Management & Live Parametric System](../../03-execution/plans/apartment/bim2-bim3-data-mgmt.md) — D-α / D-β / D-γ workstreams that operationalise C20.
- [SPEC-APARTMENT-LAYOUT-GENERATOR](../../03-execution/specs/SPEC-APARTMENT-LAYOUT-GENERATOR.md) — primary consumer of `apartment.create` + `room.create`.
- [`packages/schemas/src/apartment/ApartmentParameters.ts`](../../../packages/schemas/src/apartment/ApartmentParameters.ts) — the existing parameter schemas C20 composes.
- [MISSING-CONTRACTS-AUDIT 2026-06-01 §3.1](../MISSING-CONTRACTS-AUDIT-2026-06-01.md) — the audit row that mandated C20.

---

*End — C20 Building & Apartment Aggregates, 2026-06-01 (DRAFT).*
