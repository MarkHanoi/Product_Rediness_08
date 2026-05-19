# SPEC-13 — Context Envelopes (Per-Family Pure-Kernel Inputs)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `GAP-REVIEW-2026-04-27.md §10, §29 #2` (missing pure-input definition for kernel producers) |
| Phases | 1B (Wall recipe — historical reference), 2A (rooms/structural/MEP/furniture/dimensions), 2B (plan view), 2C (sheets) |
| Replaces / extends | `[strategic ADR-002]` boundary; SPEC-01 §2 |

> Every producer in `packages/geometry-kernel/` accepts a **Context Envelope**: a fully-resolved, side-effect-free, JSON-serialisable struct that contains *exactly* what that producer needs to deterministically generate its output. No hidden state, no implicit globals, no THREE references, no I/O. The envelope is the kernel's single source of input truth and the boundary that lets the same producer run identically in `apps/editor/` (browser worker), `apps/bake-worker/` (Node), and `apps/headless/` (CLI).

---

## §1 Why this spec exists

The Phase 1 re-audit reports 12 element families wired end-to-end. They all work because the Wall recipe established the input/output discipline implicitly. Phase 2A is in active development adding 6 more families (Rooms, Structural, Lighting, Plumbing, Furniture, Dimensions) following the same implicit recipe; Phase 2B then adds the plan-view producer. Without codification the implicit discipline becomes a leak — the next family writer guesses what `WallContext` should contain, gets it slightly wrong, and the kernel ends up reaching for `window.bimKernel.foo()` to fill the gap. **This SPEC ratifies at S31 (Phase 2B start) and reverse-documents all 18 envelopes (12 Phase-1 GREEN + 6 Phase-2A in-flight) at the same time** — Phase 2A holds no gap-closure work per the 2026-04-27 directive.

This SPEC makes the discipline explicit: **every family declares a TypeScript-typed envelope** under `packages/schemas/contexts/<family>.ts` and the producer signature is `(ctx: <Family>Context) => Result<BufferGeometryDescriptor, KernelError>`. The boundary lint forbids any producer file from importing anything except `packages/schemas/`, `packages/ids/`, the kernel's own internal modules, and `manifold-3d`/`planegcs`.

---

## §2 Envelope shape — universal fields

Every Context Envelope extends `BaseContext`:

```ts
interface BaseContext {
  /** ULID of the element instance this envelope describes. */
  readonly instanceId: InstanceId;
  /** ULID of the type the instance refers to (resolved from project type catalog). */
  readonly typeId: TypeId;
  /** Family discriminator. Used by the kernel router; must match the file location. */
  readonly family: ElementFamily;
  /** Resolved level — z-elevation, level-id, discipline-group. */
  readonly level: ResolvedLevel;
  /** Project-wide unit + tolerance settings. */
  readonly units: UnitsContext;
  /** Resolved material registry — id → MaterialEnvelope (already deref'd). */
  readonly materials: ReadonlyMap<MaterialId, MaterialEnvelope>;
  /** Bake target — controls LOD selection, mesh budget. */
  readonly bake: BakeTarget;
}
```

**`ElementFamily`** is one of: `wall | slab | door | window | roof | curtainWall | grid | column | beam | stair | handrail | ceiling | room | structural | lighting | plumbing | furniture | dimension | annotation | sheet`.

**`ResolvedLevel`** carries z + discipline group already merged (per SPEC-06 §4). Producers never re-resolve.

**`UnitsContext`** carries `lengthUnit` (mm/m/ft/in), `angleUnit`, `epsilonLength` (default 0.0005 mm), `epsilonAngle` (default 0.001°). Per SPEC-01 §3.

**`MaterialEnvelope`** is the *already-resolved* material — colour, layers, IFC Pset values. Producers never look up materials.

**`BakeTarget`** is `{ lod: 0|1|2, maxVertices: number, maxMaterials: number, allowExpensive: boolean }`. Per SPEC-02 §6.4.

---

## §3 Per-family envelopes (Phase 1 baseline — frozen)

The 12 Phase 1 families are the canonical reference. Their envelopes are frozen at the shapes used by the GREEN audit fixtures.

### §3.1 WallContext (canonical)
```ts
interface WallContext extends BaseContext {
  family: 'wall';
  centerline: Polyline2D;          // analytic axis (per SPEC-01 §2.1)
  baseHeight: number;
  topHeight: number | { offsetFromLevelAbove: number };
  layers: WallLayerEnvelope[];     // resolved from type
  endCaps: { start: WallEndCap; end: WallEndCap };
  openings: ResolvedOpening[];     // doors/windows/punches resolved into local coords
  hostedElements: HostedElementRef[]; // elements that need to query our face
  joinSpec: WallJoinSpec[];        // resolved joins with adjacent walls
}
```

### §3.2 SlabContext
```ts
interface SlabContext extends BaseContext {
  family: 'slab';
  boundary: Polygon2D;             // outer + holes; planar
  thickness: number;
  edgeProfile: EdgeProfile;        // straight | chamfer | recess | sloped
  layers: SlabLayerEnvelope[];
  openings: ResolvedOpening[];
  slope?: { axis: Vec3; rise: number };
}
```

### §3.3 DoorContext
```ts
interface DoorContext extends BaseContext {
  family: 'door';
  hostWallSegment: HostWallSegmentRef; // resolved: wallId + segment range
  insertionPoint2D: Vec2;          // along host centerline
  width: number;
  height: number;
  swing: 'left' | 'right' | 'double' | 'sliding';
  frameType: FrameType;
  panelType: PanelType;
  hardware: HardwareEnvelope[];
}
```

### §3.4 WindowContext
- Similar shape to Door but with `sillHeight` and `mullionPattern`.

### §3.5 RoofContext
- `boundary: Polygon2D`, `roofType: 'flat' | 'gable' | 'hip' | 'shed' | 'mansard' | 'curved' | 'butterfly'`, `slopes: SlopeEnvelope[]`, `ridgePolyline?`, `eaves: EaveEnvelope`, `layers: RoofLayerEnvelope[]`.

### §3.6 CurtainWallContext
- `centerline: Polyline2D`, `panelGrid: GridSpec`, `mullionFamily: MullionFamilyEnvelope`, `panelFamilies: PanelFamilyEnvelope[]`, `cornerCondition: CornerCondition`.

### §3.7 GridContext
- `axes: GridAxisEnvelope[]` (each with `direction: Vec3`, `spacings: number[]`, `bubbleStyle: BubbleStyle`), `extents: BBox2D`.

### §3.8 ColumnContext
- `position: Vec3`, `crossSection: CrossSectionEnvelope`, `baseLevel: ResolvedLevel`, `topLevel: ResolvedLevel`, `material: MaterialEnvelope`, `rotation: number`.

### §3.9 BeamContext
- `start: Vec3`, `end: Vec3`, `crossSection: CrossSectionEnvelope`, `justification: 'top'|'center'|'bottom'`, `cuts: BeamCutEnvelope[]`, `connections: BeamConnectionRef[]`.

### §3.10 StairContext
- `flight: 'straight'|'L'|'U'|'spiral'|'curved'`, `riserCount: number`, `riserHeight: number`, `treadDepth: number`, `landings: LandingEnvelope[]`, `nosing: NosingProfile`, `stringers: StringerEnvelope[]`, `width: number`, `floorToFloor: number`.

### §3.11 HandrailContext
- `pathPolyline: Polyline3D`, `hostElement?: HostStairOrSlabRef`, `topRail: RailProfile`, `bottomRail?: RailProfile`, `balusters: BalusterPattern`, `terminations: { start: Termination; end: Termination }`.

### §3.12 CeilingContext
- `boundary: Polygon2D`, `elevation: number`, `pattern: CeilingPatternEnvelope`, `tileSize?: Vec2`, `hostedFixtures: HostedFixtureRef[]`.

---

## §4 Phase 2A in-flight families: envelopes reverse-documented at S31 (Phase 2B start)

### §4.1 RoomContext
```ts
interface RoomContext extends BaseContext {
  family: 'room';
  bounding: 'wallBound' | 'sketched';
  boundary: Polygon2D;             // computed from walls or user-drawn
  ceiling: ResolvedCeiling | null;
  floorFinish: ResolvedFinish | null;
  occupancy?: OccupancyEnvelope;
  programmeTags: string[];
  adjacencies: RoomAdjacencyRef[]; // resolved at envelope-build time
}
```

### §4.2 StructuralContext
- For analytical models: `loadPathGraph: LoadPathGraphEnvelope` (per `src/structural/`), `analyticalNodes: AnalyticalNode[]`, `analyticalMembers: AnalyticalMember[]`, `loadCases: LoadCaseRef[]`.

### §4.3 LightingContext
- `fixtureType: 'pendant'|'recessed'|'surface'|'wall'|'track'`, `position: Vec3`, `aim?: Vec3`, `photometricRef?: IES_FileRef`, `wattage: number`, `colorTemperature?: number`, `mountingHost?: HostRef`.

### §4.4 PlumbingContext
- `fixtureType: 'sink'|'toilet'|'tub'|'shower'|'other'`, `position: Vec3`, `connections: { hot?:Connection; cold?:Connection; waste:Connection; vent?:Connection }`, `mountingHost: HostRef`.

### §4.5 FurnitureContext
- `familyId: FamilyId`, `position: Vec3`, `rotation: number`, `representations: { lod0: AssetRef; lod1: AssetRef; lod2: AssetRef }`, `hostingMode: 'free'|'wallHosted'|'floorHosted'|'ceilingHosted'`, `hostRef?: HostRef`.

### §4.6 DimensionContext
- `kind: 'linear'|'angular'|'radial'|'arc'|'spot'|'continuous'`, `references: DimensionReferenceRef[]` (resolved to anchor points at envelope-build time), `style: DimensionStyleRef`, `view: ViewRef`.

---

## §5 Phase 2B/2C new envelopes (drawing & sheets)

### §5.1 PlanViewContext (per SPEC-30)
```ts
interface PlanViewContext extends BaseContext {
  family: 'planView';
  viewId: ViewId;
  cutPlane: { z: number; range: { below: number; above: number } };
  visibleElementIds: ReadonlyArray<InstanceId>;
  visibilityIntent: ResolvedVI;    // already collapsed from 11-wave VG
  scale: ViewScale;
  symbolLibrary: SymbolLibraryRef;
  styles: { stroke: StrokeStyleEnvelope; hatch: HatchStyleEnvelope; text: TextStyleEnvelope };
}
```

### §5.2 SectionViewContext
- Same as PlanView but `cutPlane: PlaneEquation`, plus `lookDirection: Vec3` and `farClip: number`.

### §5.3 SheetContext
- `sheetSize: SheetSize` (A0–A4, ANSI A–E, custom), `titleBlock: TitleBlockRef`, `viewports: ViewportEnvelope[]`, `revisionTable: RevisionEntry[]`, `paperUnits: 'mm'|'in'`.

### §5.4 ScheduleContext
- `family: 'schedule'`, `targetFamily: ElementFamily`, `columns: ScheduleColumnEnvelope[]`, `filters: ScheduleFilter[]`, `groupBy: ColumnId[]`, `sortBy: ColumnId[]`, `formulas: ScheduleFormulaRef[]` (per ADR-027).

---

## §6 Envelope build pipeline

The envelope is **assembled by L1 stores**, not the kernel. The pipeline is:

```
L1 store (writes element)
  ↓ scene-committer.commit(elementId)
  ↓ resolves: type catalog → material registry → level discipline groups → adjacency graph
  ↓ produces ContextEnvelope (frozen, deepEqual-stable)
  ↓ emits to scheduler queue
L4 kernel.produce(envelope)
  ↓ pure → BufferGeometryDescriptor
  ↓ no return path back to L1; result enters scene-cache
```

**Frozen** means `Object.freeze` recursive; envelopes are immutable.
**deepEqual-stable** means two envelopes built from the same L1 state produce equal-by-value results — no timestamps, no UUIDs-of-the-build, no Map iteration order leakage. CI gate `envelope-stability.test.ts` enforces this on every PR.

---

## §7 Anti-patterns (lint-enforced)

The boundary ESLint rule `pryzm/no-impure-context` forbids in producer files:
- `Date.now()`, `performance.now()`, `Math.random()` (use seeded RNG passed via envelope when needed).
- `import('three')`, `import('@thatopen/components')`, `import('cesium')`.
- `globalThis`, `window`, `self`, `process.env` reads.
- Any read-side effect (`fetch`, `localStorage`, `IndexedDB`, `worker_threads`, `fs`).

Producers that need entropy declare `seedRng?: SeededRng` on their envelope. Producers that need time declare `clock?: VirtualClock`. Both must be supplied by L1; both are deterministic in CI.

---

## §8 Backward-compat with Phase 1 GREEN audit

Phase 1's 12 families already follow this pattern in spirit. SPEC-13 codifies it. The audit's 163 parity fixtures continue to pass *because* the envelopes were already implicit; this SPEC makes them explicit.

**No code changes required at S31 ratification** — the envelopes for the 12 Phase 1 families and the 6 Phase-2A in-flight families are *documented* here and the existing producer signatures already match (or will match by Phase 2A exit). Any drift between the doc and code is a doc bug fixed at S31 reverse-doc.

---

## §9 Phase rollout

| Sprint | Deliverable |
|---|---|
| S31 (Phase 2B start; Phase 2A holds no gap-closure work per 2026-04-27 directive) | SPEC-13 land; all 18 envelopes reverse-documented in one sprint — 12 Phase-1 GREEN families + 6 Phase-2A in-flight families (RoomContext, StructuralContext, LightingContext, PlumbingContext, FurnitureContext, DimensionContext); PlanViewContext envelope lit per SPEC-30; ESLint rule `pryzm/no-impure-context` lit at warning. |
| S32 | ESLint rule promoted to error. |
| S37 (Phase 2C start) | SectionView, Sheet, Schedule envelopes lit. |
| S43 (Phase 2D Yjs) | Envelope build pipeline replays after Yjs apply (no envelope changes — just trigger source). |

---

## §10 Cross-references
- Pure-kernel mandate: SPEC-01 §1, SPEC-01 §3.
- Two byte streams: `[strategic ADR-002]`.
- Type catalog → envelope merge: SPEC-05 §3 (inheritance order).
- Discipline-scoped levels: SPEC-06 §4.
- Plan-view envelope detail: SPEC-30.
- Schedule formula references: SPEC-29 §6, ADR-027.
- Phase doc binding: PHASE-2A §1 (track A producers), PHASE-2B §3, PHASE-2C §2.
