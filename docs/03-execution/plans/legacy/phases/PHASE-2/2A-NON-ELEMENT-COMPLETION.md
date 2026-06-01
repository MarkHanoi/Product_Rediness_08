# Phase 2A — Non-Element Family Completion
## Q1 of Phase 2 · Months 13–15 · Sprints S25–S30

> **Strategic anchor**: subordinate to `08-VISION.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → this file.
> Conflict order: `06-PRYZM-IDENTITY-AND-RECOUNT.md` + format spec → `08-VISION.md` → `10-MASTER…` → this doc.

> **Authority note (added 2026-04-27).** This document is *implementation guidance* and is subordinate to:
>
> 1. The 12 specs in `docs/03-execution/specs/` (SPEC-01..SPEC-12).
> 2. The 22 strategic ADRs in `docs/02-decisions/adrs/` (the `[strategic ADR-001]`..`[strategic ADR-024]` collective range — individual files live as `adrs/ADR-NNN-<slug>.md`).
> 3. `docs/archive/pryzm3-internal/superseded-2026-04-30/03_STATUS/CRITICAL-REVIEW-2026-04-27.md`.
> 4. `docs/03-execution/plans/legacy/plan-detail/01-MASTER-36M.md`.
>
> Where this phase document conflicts with any of the above, the higher-precedence document wins. **ADR citations**: bare `ADR-NNN` is forbidden. Use `[strategic ADR-NNN]` for entries in `02-decisions/adrs/`, or fully-qualified `code-level ADR docs/02-decisions/adrs/NNNN-<slug>.md` for sprint-scoped decisions.
>
> **Sprint-scoped ADRs introduced in this document** (slug map):
>
> | §6 heading | Code-level slug | Sprint |
> |---|---|---|
> | ADR-022 — Room boundary detection strategy | `docs/02-decisions/adrs/0022-room-boundary-detection.md` | S25 |
> | ADR-024 — Furniture multi-representation model | `docs/02-decisions/adrs/0024-furniture-multi-representation.md` | S27 |
> | ADR-025 — Plan view canvas architecture | `docs/02-decisions/adrs/0025-plan-view-canvas-architecture.md` | S29 |
>
> **Numbering note (updated 2026-04-27).** The planned numbers (ADR-020/021/022) were predicted before Phase 2A started; ADRs 0020 and 0021 were already reserved by Phase 1D deliverables, and the actual Phase 2A ADRs were assigned as 0022, 0024, and 0025. All references in this document use the actual file paths above.

**SPECs binding Phase 2A**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-01 (Light parametric expressions) | §3 robustness; §4.1 light parametric expressions (no solver) | S25–S30 |
| SPEC-04 (Drawing primitives) | §1 architecture; §2 vector primitives (foundations) | S30 |
| SPEC-05 (Family/type/instance) | §1, §6 level association; rooms/spaces | S25 |
| SPEC-10 (Plugin manifest + capability surface) | All | All |

**Capacity envelope**

> **Capacity envelope (`[strategic ADR-018]`).** Phase 2A accepts the 6-sprint scope. If sprint capacity is exhausted, the cut-list defined in `02-decisions/adrs/ADR-018-capacity-cut-list.md` is the ratified order; in 2A the most likely cuts are the dimensions polish work (S29) and the poche fill quality bar at S30 (raise from "pixel-perfect" to "within hatch alignment tolerance"). Defer items per the `[strategic ADR-018]` ranking — never improvise scope reductions.

---

## Executive Summary

**Sub-phase goal**: By end of M15, every BIM element type that PRYZM 1 supports for construction authoring has a PRYZM 2 plugin. The twelve Phase 1 element families are joined by six more — Rooms, Structural, Lighting, Plumbing, Furniture, and Dimensions — completing the element library at 18 families. The plan-view skeleton lands in S29–S30 as preparation for the highest-risk sub-project of Phase 2 (2B).

**Why 2A matters strategically**: Phase 2B (plan view) cannot begin until the plan-view foundation is ready — specifically, until `edge-projection.ts` and `poche.ts` are pure and headless-tested (S30), and until dimensions are in the system (S29). Every day 2A slips, 2B slips. 2B is already identified as the highest-risk sub-project of the entire 36-month plan. 2A is the unlocking sprint block — it must execute on schedule.

**The multiplier pattern**: the Wall pattern from Phase 1B was proven to multiply (K1-C confirmed in S12). Phase 2A depends on that proof. Every element added in 2A should take ≤ 3 days of focused work. If any single element takes > 4 days, the pattern is wrong and must be diagnosed before continuing. This is the same K1-C principle reapplied at Phase 2 scale.

**The two hardest items in 2A**:
1. **Room boundary detection (S25)** — computing room boundaries from wall geometry is non-trivial. Curved walls, openings, adjacent rooms, multi-level rooms, and rooms with "island" obstacles all produce edge cases. The PRYZM 1 implementation is in `RoomDetectionService.ts` (~520 LOC) and is the canonical reference. The parity fixture must cover all variants.
2. **Edge projection + poche fill (S30)** — these are the pure math foundations that 2B's plan view depends on. Getting them wrong means 2B is built on a broken base. Getting them right and headless-tested means 2B's risks reduce to rendering and UX, not math.

> **Two new strategic gates land in 2A:**
> 1. **Drawing engine foundation (`[strategic ADR-016]`)** — `packages/drawing-primitives/` lands at S30, ahead of Phase 2B. The `edge-projection.ts` and `poche.ts` modules referenced in 2A's track-A allocation are now subordinate to the SPEC-04 vector primitive model. Edge projection is **classifier** (Cut/Beyond/Hidden/Symbolic), not a primitive emitter; the primitive emission lives in `packages/drawing-primitives/`.
> 2. **Light parametric expressions (`[strategic ADR-024]` §Phase-2A)** — the small expression evaluator (`length = a + b`, `angle = 90°`) lands at S25 onward as a SPEC-01 §4.1 deliverable. **No constraint solver** is introduced in 2A; the solver is Phase 3A.

> **Family count revision (per `[strategic ADR-017]` and SPEC-05 §1.2):** Phase 2A's "six new families" (Rooms, Structural, Lighting, Plumbing, Furniture, Dimensions) are reaffirmed, but their *types* must conform to SPEC-05's family/type/instance hierarchy from S25 onward. Loadable-family authoring (the Component Editor) is Phase 3A and depends on `[strategic ADR-024]` (constraint solver).

---

## §0 Reading Conventions

**Sprint rhythm** (10 working days): D1 kickoff (30 min), D2–D4 deep implementation, D5 mid-sprint sync (1 h, mandatory performance measurement), D6–D8 completion + tests + docs, D9 demo + retro (1 h), D10 buffer.

**The element recipe is fixed**: every Phase 2A element follows the canonical recipe established in Phase 1B and documented in `docs/04-reference/architecture-detail/element-recipe.md`. Deviations require F sign-off.

---

## §1 Track Allocation for 2A

Phase 2A continues the Track A (logic-heavy, headless-compatible) vs Track B (scenic, renderer) split, with more paired sessions given the shorter sprint budgets per element.

### Track A — Logic, Stores, Handlers, Producers (Agent A)

| Item | Sprint |
|---|---|
| `plugins/rooms/` — store, handlers (8), producer, parity tests | S25 |
| `plugins/structural/` — store, handlers (7), producer | S26 |
| `plugins/lighting/` — store, handlers (5), producer | S26 |
| `plugins/plumbing/` — store, handlers (4), producer | S26 |
| `plugins/furniture/` — store, handlers (7), multi-rep producer | S27 |
| `apps/editor/src/projects/` — project hub store + sync-server handlers | S28 |
| `plugins/dimensions/` — store, handlers (6), producer | S29 |
| `packages/geometry-kernel/edge-projection.ts` (pure) | S30 |
| `packages/geometry-kernel/poche.ts` (pure) | S30 |

### Track B — Committers, Tools, UI, Bench (Agent B)

| Item | Sprint |
|---|---|
| `plugins/rooms/` — committer, tool, visual boundary overlay | S25 |
| `plugins/structural/` — committer, tool | S26 |
| `plugins/lighting/` — committer, tool | S26 |
| `plugins/plumbing/` — committer, tool | S26 |
| `plugins/furniture/carousel/` — catalogue UI + committer + mesh-swap | S27 |
| `apps/editor/src/projects/` — hub UI, thumbnails, deep-link routing | S28 |
| `plugins/dimensions/` — committer, tool | S29 |
| `plugins/plan-view/` — canvas-host skeleton, level-store, projection skeleton | S29 |
| `packages/geometry-kernel/__tests__/{edge-projection,poche}.snap` | S30 |
| Node + browser byte-identity tests for edge-projection + poche | S30 |

### Joint Deliverables

| Item | Sprint |
|---|---|
| ADR-020 — Room boundary detection strategy | S25 D1 |
| ADR-021 — Furniture multi-representation model | S27 D1 |
| ADR-022 — Plan view canvas architecture | S29 D1 |
| Sub-phase 2A demo recording (8-min screencast) | S30 D9 |
| `apps/bench/reports/M15-2A-baseline.md` | S30 D9 |

---

## §2 Sprint-by-Sprint Detail

---

### S25 — Rooms (Boundary Detection, Area, Naming)

> **Sprint anchors (added 2026-04-27):**
> - **Family schema (`[strategic ADR-017]` + SPEC-05 §1.2):** Room/Space schemas land in `packages/types-schema/space.ts` per SPEC-05's family/type/instance hierarchy.
> - **IFC mapping (`[strategic ADR-008]` + SPEC-05 §5):** Room types map to `IfcSpace` per SPEC-05 §5; full IFC export is Phase 3B.
> - **Light expressions (`[strategic ADR-024]` §Phase-2A + SPEC-01 §4.1):** the `packages/expr-eval/` light expression evaluator (`length = a + b`, `angle = 90°`) lands here. **No constraint solver in 2A.**
**Weeks 49–50 (Month 13)**

---

#### Context and Why This Matters

Rooms are the first element in Phase 2A that require **reading other elements' geometry** during their own production. A room's boundary is derived from the surrounding wall edges — the room producer calls `ctx.getNeighbour(wallId)` for every wall that might contribute a boundary edge, very similar to how the handrail producer reads stair geometry in S14. This pattern is now established and well-understood.

Rooms underpin three other systems:
1. **Schedules** (S41): room schedules (room area, name, number by floor) depend on `RoomStore`.
2. **Visibility-Intent** (S46–S49): the 11-wave system uses rooms as visibility regions.
3. **PDF export** (S40): room labels appear on sheets and reference room numbers from `RoomStore`.

Getting rooms right now, with correct boundary detection and area calculation, prevents all three downstream systems from being compromised by bad room data.

---

#### Implementation Detail — Room Boundary Detection (`code-level ADR docs/02-decisions/adrs/0022-room-boundary-detection.md`)

The boundary detection algorithm is the hardest part of S25. There are two candidate approaches, and F must decide at D1:

**Option A — Topological construction** (recommended):
Build a half-edge mesh of wall centerlines, then flood-fill enclosed regions. This is how PRYZM 1's `RoomDetectionService.ts` works internally. It handles T-junctions, openings, and curved walls correctly because it reasons about the wall topology rather than raw geometry.

```typescript
// packages/geometry-kernel/producers/room.ts

export interface RoomDto {
  id: RoomId;
  levelId: string;
  name: string;
  number: string;
  seedPoint: Vec2;   // a point known to be inside the room (placed by user click or centroid)
  computedBoundary?: Vec2[]; // filled by producer; empty if not yet computed
  computedArea?: number;     // m², filled by producer
  computedPerimeter?: number; // m, filled by producer
  materialId?: string;        // for floor fill colour
  heightOffset?: number;      // above floor level; default = 0
}

export function produceRoomGeometry(dto: RoomDto, ctx: ProducerContext): GeometryIR {
  // 1. Fetch all walls in the same level.
  const levelWalls = ctx.getElementsByLevel(dto.levelId, 'wall');

  // 2. Build half-edge graph from wall centerlines.
  const graph = buildHalfEdgeGraph(levelWalls, ctx);

  // 3. Flood-fill from dto.seedPoint to find the enclosed face that contains it.
  const face = floodFillFace(graph, dto.seedPoint);

  if (!face) {
    // Seed point is not enclosed by walls — return empty IR, watch for wall changes.
    return emptyGeometryIR(dto.id);
  }

  // 4. Triangulate the face polygon for the floor fill mesh.
  const { polygon, area, perimeter } = extractPolygon(face);
  const triangles = triangulate(polygon);

  // 5. Build the visual boundary outline for the committer (dashed line at wall inner face).
  const boundary = extractInnerFaceBoundary(face, levelWalls, ctx);

  return {
    meshes: [{
      positions: new Float32Array(triangles.flat()),
      indices: new Uint32Array(triangles.flatMap((_, i) => [i * 3, i * 3 + 1, i * 3 + 2])),
      materialId: dto.materialId ?? 'room-fill-default',
    }],
    edges: [{ kind: 'room-boundary', vertices: boundary }],
    bounds: computeAABBFromPolygon(polygon, dto.heightOffset ?? 0),
    metadata: {
      sourceId: dto.id,
      version: hashDto(dto),
      materialIds: [dto.materialId ?? 'room-fill-default'],
      extra: {
        computedArea: area,
        computedPerimeter: perimeter,
        computedBoundary: polygon,
      },
    },
  };
}
```

**The `emptyGeometryIR` + `watchForReady` pattern**: room detection fails if walls change after the room is placed (a gap opens in the boundary). The committer must subscribe to `WallStore.subscribeDirty` and re-queue the room producer whenever any wall in the same level is modified. This is the same coupling pattern used for handrails (S14) — reference `docs/04-reference/architecture-detail/element-coupling.md`.

**Option B — Ray-casting grid scan**: simpler to implement, fails on non-convex rooms, L-shaped rooms, and rooms with wall openings. Not recommended — do not use.

**`code-level ADR docs/02-decisions/adrs/0022-room-boundary-detection.md` decision**: Option A (topological) is the correct approach. Document: "Room boundary detection uses half-edge graph flood-fill from seed point. The algorithm is O(walls) per room. For projects with > 500 walls per level, detect > 100 ms boundary detection time and switch to spatial indexing (R-tree of wall AABBs)."

---

#### Implementation Detail — Area Calculation Accuracy

The target is < 0.1% error vs PRYZM 1 on the 20-case parity fixture. PRYZM 1 uses the Shoelace formula (signed area of polygon). The pure producer must use the same formula:

```typescript
// packages/geometry-kernel/utils/area.ts

export function shoelaceArea(polygon: Vec2[]): number {
  // Signed area via Shoelace formula. Positive = counter-clockwise.
  // Always take Math.abs() for room area display.
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return Math.abs(area) / 2;
}
```

**Why not THREE.ShapeUtils.area?** `THREE.ShapeUtils.area` is THREE-dependent — it cannot be used in the pure producer. The Shoelace implementation above is pure and produces identical results. This is the kind of subtle purity violation to watch for: any use of THREE in a pure function will fail the `pryzm-no-three-in-kernel` lint gate.

---

#### Implementation Detail — `plugins/rooms/committer.ts`

The room committer renders two visual layers:
1. **Floor fill** — a translucent `THREE.Mesh` with the triangulated floor polygon.
2. **Boundary outline** — a `THREE.Line` tracing the inner wall face boundary.

Both are driven by `RoomStore.subscribeDirty`:

```typescript
// plugins/rooms/committer.ts

export class RoomCommitter implements PrimitiveCommitter<RoomDto> {
  private fillMeshes = new Map<string, THREE.Mesh>();
  private outlineLines = new Map<string, THREE.Line>();
  private fillMaterial: THREE.MeshStandardMaterial;
  private outlineMaterial: THREE.LineBasicMaterial;

  constructor(private scene: THREE.Scene, private scheduler: FrameScheduler) {
    this.fillMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.7, 0.85, 1.0),
      transparent: true,
      opacity: 0.12,
      depthWrite: false,  // rooms are transparent — do not write to depth
      side: THREE.DoubleSide,
    });
    this.outlineMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(0.2, 0.4, 0.8),
      linewidth: 1,
    });
  }

  commit(diff: SceneDiff, store: ReadonlyMap<string, RoomDto>, ir: GeometryIR): void {
    for (const [id, room] of diff.added) {
      this.addRoom(room, ir.get(id));
    }
    for (const [id] of diff.removed) {
      this.removeRoom(id);
    }
    for (const [id, room] of diff.modified) {
      this.removeRoom(id);
      this.addRoom(room, ir.get(id));
    }
    this.scheduler.requestFrame('room-commit');
  }

  private addRoom(room: RoomDto, ir: GeometryIR | undefined): void {
    if (!ir || ir.meshes.length === 0) return; // empty IR = unenclosed room

    const geometry = buildBufferGeometry(ir.meshes[0]);
    const mesh = new THREE.Mesh(geometry, this.fillMaterial);
    mesh.renderOrder = -1; // render before walls so walls appear on top
    this.scene.add(mesh);
    this.fillMeshes.set(room.id, mesh);

    // Boundary outline.
    const edge = ir.edges?.find(e => e.kind === 'room-boundary');
    if (edge) {
      const points = edge.vertices.map(v => new THREE.Vector3(v[0], room.heightOffset ?? 0.01, v[1]));
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeo, this.outlineMaterial);
      this.scene.add(line);
      this.outlineLines.set(room.id, line);
    }
  }

  private removeRoom(id: string): void {
    const mesh = this.fillMeshes.get(id);
    if (mesh) { this.scene.remove(mesh); mesh.geometry.dispose(); this.fillMeshes.delete(id); }
    const line = this.outlineLines.get(id);
    if (line) { this.scene.remove(line); line.geometry.dispose(); this.outlineLines.delete(id); }
  }

  dispose(): void {
    this.fillMeshes.forEach((m, id) => this.removeRoom(id));
    this.outlineLines.clear();
    this.fillMaterial.dispose();
    this.outlineMaterial.dispose();
  }
}
```

---

#### D1 — Kickoff (30 min)

- A presents `code-level ADR docs/02-decisions/adrs/0022-room-boundary-detection.md` draft — topological flood-fill approach. F decides.
- B confirms the room committer's `renderOrder = -1` approach for transparency (rooms render behind walls in 3D).
- Agree: the 20 parity-case fixture is extracted from real PRYZM 1 projects, not synthetic. Types of rooms covered: rectangular, L-shaped, with openings, with curved walls, multi-level (same boundary, different heights), rooms with island obstacles.

#### D2–D8 Parallel Work

| Day | Agent A (Logic Track) | Agent B (Visual Track) |
|---|---|---|
| D2 | Implement `buildHalfEdgeGraph(walls, ctx)` — core algorithm. Unit test on a simple 4-wall rectangle: graph has 4 faces (room + 3 outer); flood-fill from centroid returns the room face. | Room committer skeleton — `THREE.Mesh` for fill + `THREE.Line` for boundary. Test visual with a hard-coded rectangle. |
| D3 | Implement `floodFillFace` + `extractPolygon`. Handle T-junctions (common: doorway in a wall creates a junction). | Room tool — click inside enclosed area → places a room `seedPoint` → command `CreateRoom` with `seedPoint`. |
| D4 | Implement full `produceRoomGeometry` per spec. Shoelace area + perimeter. `emptyGeometryIR` for un-enclosed seeds. | Wire room to `WallStore.subscribeDirty` — wall move → room re-queued → boundary recomputed. |
| D5 | **Mid-sprint sync (1 h)** — run 5 of the 20 parity cases. Confirm area < 0.1% error and boundary outline matches PRYZM 1. Verify `emptyGeometryIR` for an open room (wall has gap). | Same session — visual comparison of committer output vs PRYZM 1 plan view screenshot. Confirm transparency + outline look correct. |
| D6 | Run all 20 parity cases. Fix failures (most common: curved wall boundary not closed cleanly, T-junction not resolved). | Room label in 3D — text overlay at room centroid showing room name + area. Uses the same text-overlay mechanism as dimension labels. |
| D7 | `tests/parity/rooms/` — 20 snapshot tests green. OTel `pryzm.geometry.produce.room` span. | Room area label updates automatically when boundary recomputes (area change triggers label redraw). |
| D8 | `docs/04-reference/architecture-detail/room-boundary.md` — algorithm description, edge case coverage, known limitations (rooms spanning multiple levels are not supported in Phase 2; deferred to Phase 3). | Playwright integration test: place 5 rooms → edit walls → confirm area recomputes on each edit. |

#### D9 — Sprint Demo + Retro

- A: 20 parity cases green; area < 0.1% error on all; demonstrate the open-room (empty IR) edge case.
- B: click-to-place room in the 3D editor; room boundary overlays correctly; wall edit → room auto-recomputes; room label updates.
- Retro: how long did the half-edge graph approach take vs estimated? Any parity failures still open?

#### S25 Exit Criteria

- [ ] `Room` / `Space` family schemas in `packages/types-schema/space.ts` per SPEC-05 §1.2.
- [ ] Room types map to `IfcSpace` per SPEC-05 §5 + `[strategic ADR-008]`.
- [ ] Light expression evaluator (`packages/expr-eval/`) lands per SPEC-01 §4.1; supports `length = a + b`, `angle = 90°`. **No constraint solver.**

- [ ] Room boundary detection functional for rectangular, L-shaped, openings, curved-wall variants.
- [ ] Area < 0.1% error vs PRYZM 1 on all 20 parity cases.
- [ ] 20-case parity fixture green: `tests/parity/rooms/`.
- [ ] Wall edit → room boundary and area recompute automatically.
- [ ] OTel `pryzm.command.room.create`, `pryzm.geometry.produce.room` spans visible.
- [ ] `code-level ADR docs/02-decisions/adrs/0022-room-boundary-detection.md` merged.
- [ ] `plugins/rooms/README.md` committed.

**Kill-switch K2A-S25**: if the topological flood-fill algorithm fails to produce correct boundaries for more than 3 of the 20 parity cases by D5, and the failures involve structural edge cases (not just implementation bugs), escalate: consider a simplified boundary detection (convex hull of wall inner faces) as a temporary Phase 2 approach, with the full topological algorithm deferred to Phase 3A. Document the limitation: "rooms with non-convex boundaries or island obstacles not supported in Phase 2."

---

### S26 — Structural + Lighting + Plumbing
**Weeks 51–52 (Month 13–14)**

---

#### Context and Why This Matters

Three element families in one sprint — the K1-C multiplier principle in action. Structural, Lighting, and Plumbing are significantly simpler than Walls or Rooms because:
- No joins between elements (a light fixture doesn't join to another light fixture).
- No openings (plumbing pipes don't punch holes in walls — that's Phase 3B IFC territory).
- Simple geometric producers: most are extrusions or standard shapes.
- Small handler counts (7, 5, 4 respectively).

The sprint's discipline is **speed without sloppiness**. The pattern is fully established. The agent can produce all three families mechanically once the first one is hand-verified. The day budget is: Structural D1–D3, Lighting D4–D6, Plumbing D7–D9, D10 integration.

---

#### Implementation Detail — Structural Producer

Structural elements (columns, beams, bracing, footings) are already partly present from Phase 1B (`plugins/column/`, `plugins/beam/`). Phase 2A "Structural" refers to the **second-tier structural elements** that PRYZM 1 classifies under structural but Phase 1B did not include: **bracing members**, **footings**, **foundation slabs**, and **structural connections**.

```typescript
// packages/geometry-kernel/producers/structural.ts

export type StructuralType = 'brace' | 'footing' | 'foundation-slab' | 'connection';

export interface StructuralDto {
  id: StructuralId;
  type: StructuralType;
  levelId: string;
  start: Vec3;
  end?: Vec3;      // for brace (linear element)
  polygon?: Vec2[]; // for footing/foundation-slab (planar element)
  profile?: 'square' | 'round' | 'I-section';
  dimensions: { width?: number; depth?: number; height?: number };
  materialId: string;
}

export function produceStructuralGeometry(dto: StructuralDto, ctx: ProducerContext): GeometryIR {
  switch (dto.type) {
    case 'brace':
      return produceBraceMesh(dto);       // linear extrusion between start + end
    case 'footing':
      return produceFootingMesh(dto);     // rectangular or circular pad below a column
    case 'foundation-slab':
      return produceFoundationSlabMesh(dto); // like slab but below ground level
    case 'connection':
      return produceConnectionMesh(dto);  // bolt plate or gusset at intersection
  }
}
```

**Handler count**: 7 handlers per triage from `09-AS-IS-VS-TO-BE.md §4`. The seven are: `CreateStructural`, `DeleteStructural`, `MoveStructural`, `SetStructuralType`, `SetStructuralProfile`, `SetDimensions`, `SetMaterial`. All follow the `produceWithPatches` pattern verbatim.

---

#### Implementation Detail — Lighting Producer

Lighting elements are the simplest producer in Phase 2A — they are point or area sources with a visible fixture model:

```typescript
// packages/geometry-kernel/producers/lighting.ts

export type LightingType = 'downlight' | 'pendant' | 'strip' | 'wall-sconce' | 'emergency';

export interface LightingDto {
  id: LightingId;
  type: LightingType;
  levelId: string;
  position: Vec3;
  rotation?: number;   // horizontal rotation in degrees
  materialId: string;
  lumens?: number;     // informational; not used for geometry
  colorTemp?: number;  // informational; not used for geometry
}

export function produceLightingGeometry(dto: LightingDto, _ctx: ProducerContext): GeometryIR {
  // For Phase 2A: produce a simple parametric fixture mesh.
  // In Phase 3B the component editor will allow custom fixture models.
  switch (dto.type) {
    case 'downlight':      return produceDownlightMesh(dto.position, dto.materialId);
    case 'pendant':        return producePendantMesh(dto.position, dto.materialId);
    case 'strip':          return produceStripLightMesh(dto.position, dto.rotation ?? 0, dto.materialId);
    case 'wall-sconce':    return produceWallSconceMesh(dto.position, dto.materialId);
    case 'emergency':      return produceEmergencyLightMesh(dto.position, dto.materialId);
  }
}
```

Note: the lighting committer also adds a `THREE.PointLight` or `THREE.RectAreaLight` to the scene to illuminate the model. This is the committer's responsibility (THREE side), not the producer's (pure side).

---

#### D1 — Kickoff (30 min)

- A and B agree the day allocation: Structural (D2–D4), Lighting (D4–D6), Plumbing (D7–D9).
- Confirm: each family gets 3 days total (A+B combined). If any family is not done in 3 days by D5, it's a K1-C signal — diagnose the pattern rather than pushing harder.
- Confirm: OTel spans must exist for all three families on D9.

#### D2–D8 Parallel Work — Element-Paired Ownership

| Day | Element | Agent A (Logic) | Agent B (Visual) |
|---|---|---|---|
| D2 | **Structural** | Store + 7 handlers (CreateStructural, DeleteStructural, MoveStructural, SetStructuralType, SetProfile, SetDimensions, SetMaterial). All with `produceWithPatches`. | Structural committer skeleton + tool (placement). |
| D3 | **Structural** | Producer for all 4 structural types. 14 parity cases. | Structural committer full impl. Playwright: place brace + footing + foundation slab. |
| D4 | **Structural / Lighting** | Structural parity cases green. Start Lighting store + 5 handlers. | **Structural done.** Start Lighting committer + `THREE.PointLight` wiring. |
| D5 | **Lighting** | **Mid-sprint sync (1 h)** — mid-sprint check. Lighting producer complete (5 types). 10 parity cases. | Lighting committer + tool. Confirm PointLight from committer doesn't violate P2 (THREE in committer only — it does not, this is correct). |
| D6 | **Lighting / Plumbing** | **Lighting done.** Start Plumbing store + 4 handlers (CreatePipe, DeletePipe, SetDiameter, SetMaterial). | **Lighting done.** Start Plumbing committer (pipe tube mesh + fitting spheres). |
| D7 | **Plumbing** | Plumbing producer (pipe tube extrusion; straight + elbow + tee). 8 parity cases. | Plumbing committer + tool (draw pipe between two clicks). |
| D8 | **Integration** | All 3 families parity tests green. Cross-element integration test: scene with structural + lighting + plumbing + all 12 Phase 1 elements → no crashes, orbit > 55 fps. | `apps/bench/orbit-fps.ts` re-run with all 18 elements. Target: > 55 fps p95 on a 300-element mixed scene. |

#### D9 — Sprint Demo + Retro

- Demonstrate a scene with bracing members + downlights + plumbing pipes — all three families in one view, orbit > 55 fps.
- K1-C check: did each family complete in ≤ 3 days? If any overran, diagnose now.

#### S26 Exit Criteria

- [ ] 3 element families functional: Structural (4 types), Lighting (5 types), Plumbing (3 types).
- [ ] Parity tests: 14 Structural + 10 Lighting + 8 Plumbing = 32 cases green.
- [ ] Orbit-fps with 300 mixed elements (all 18 families) > 55 fps p95.
- [ ] All 3 families follow canonical recipe exactly (A confirms against `docs/04-reference/architecture-detail/element-recipe.md`).
- [ ] K1-C check: no family overran 3-day budget.

---

### S27 — Furniture + Multi-Representation + Carousel
**Weeks 53–54 (Month 14)**

---

#### Context and Why This Matters

Furniture is the element that delivers **Contract 48** — the sofa with 5 representations promise. This is the first instance in PRYZM 2 of a **multi-representation element**: the same furniture item renders differently depending on the active LOD level (Level-of-Detail). This concept becomes the basis for the parametric component editor in Phase 3B.

**Why 5 representations for a sofa?** PRYZM 1's furniture system distinguishes:
- **R0** — plan symbol (2D footprint for plan view).
- **R1** — schematic solid (grey box for fast orbit).
- **R2** — simplified mesh (~200 triangles, LOD2 — used when 50+ furniture items in scene).
- **R3** — medium mesh (~2,000 triangles, LOD1 — used when < 50 items visible).
- **R4** — full mesh (~20,000 triangles, LOD0 — used for close-up renders).

The producer selects the representation based on `dto.activeLod`. The committer swaps meshes when `activeLod` changes.

---

#### Implementation Detail — Multi-Representation Producer

```typescript
// packages/geometry-kernel/producers/furniture.ts

export type FurnitureLod = 0 | 1 | 2 | 3 | 4;

export interface FurnitureRepresentation {
  positions: Float32Array;
  normals?: Float32Array;
  indices: Uint32Array;
  uvs?: Float32Array;
}

export interface FurnitureDto {
  id: FurnitureId;
  levelId: string;
  catalogueId: string;    // reference to the furniture catalogue entry
  position: Vec3;
  rotation: number;       // Y-axis rotation in degrees
  scale: Vec3;            // per-axis scale for parametric sizing
  activeLod: FurnitureLod;
  representations: {
    [K in FurnitureLod]?: FurnitureRepresentation;
  };
  materialIds: Record<string, string>;  // named material slots → materialId
}

export function produceFurnitureGeometry(dto: FurnitureDto, ctx: ProducerContext): GeometryIR {
  const rep = dto.representations[dto.activeLod];
  if (!rep) {
    // Requested LOD not available — fall back to nearest available LOD.
    const fallback = findNearestLod(dto.representations, dto.activeLod);
    if (!fallback) return emptyGeometryIR(dto.id);
    return buildFurnitureIR(dto, fallback);
  }
  return buildFurnitureIR(dto, rep);
}

function buildFurnitureIR(dto: FurnitureDto, rep: FurnitureRepresentation): GeometryIR {
  // Apply position + rotation + scale to positions.
  const transformed = applyTransform(rep.positions, dto.position, dto.rotation, dto.scale);

  return {
    meshes: [{
      positions: transformed,
      normals: rep.normals,
      indices: rep.indices,
      uvs: rep.uvs,
      materialId: dto.materialIds['primary'] ?? 'furniture-default',
    }],
    bounds: computeAABBFromPositions(transformed),
    metadata: {
      sourceId: dto.id,
      version: hashDto(dto),
      materialIds: Object.values(dto.materialIds),
      extra: { activeLod: dto.activeLod },
    },
  };
}
```

**LOD switching mechanism**: the committer subscribes to `FurnitureStore.subscribeDirty` and detects `activeLod` changes in the diff. When `activeLod` changes, the committer disposes the current mesh and creates a new one from the new LOD's geometry — a pure mesh swap with no producer re-call needed (the producer already ran for all 5 LODs at creation time; results are cached in the chunk).

**Auto-LOD based on distance**: the committer reads `camera.position` and computes distance to each furniture item in the `postUpdate` phase (after the frame's camera transform is final). If distance > 10 m: LOD = 2. If distance > 20 m: LOD = 3. Sends `SetActiveLod` commands in batch. These commands are `ephemeral: true` (like selection events) — not persisted in the event log.

---

#### Implementation Detail — Furniture Carousel UI

```typescript
// plugins/furniture/carousel/index.ts
// Vanilla TS furniture catalogue browser — no React.

export class FurnitureCarousel {
  private container: HTMLElement;
  private catalogue: FurnitureCatalogueEntry[];
  private onSelect: (entry: FurnitureCatalogueEntry) => void;

  constructor(host: HTMLElement, catalogue: FurnitureCatalogueEntry[], onSelect: (e: FurnitureCatalogueEntry) => void) {
    this.container = host;
    this.catalogue = catalogue;
    this.onSelect = onSelect;
    this.render();
  }

  private render(): void {
    // Build a grid of catalogue cards (thumbnail + name + dimensions).
    // Each card: click → onSelect → activates furniture placement tool.
    this.container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'furniture-carousel-grid';

    for (const entry of this.catalogue) {
      const card = document.createElement('div');
      card.className = 'furniture-carousel-card';
      card.innerHTML = `
        <img src="${entry.thumbnailUrl}" alt="${entry.name}" loading="lazy" />
        <span class="name">${entry.name}</span>
        <span class="dims">${entry.width}×${entry.depth} m</span>
      `;
      card.addEventListener('click', () => this.onSelect(entry));
      grid.appendChild(card);
    }

    this.container.appendChild(grid);
  }

  filter(query: string): void {
    // Client-side filter — no network request.
    const filtered = this.catalogue.filter(e =>
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.category.toLowerCase().includes(query.toLowerCase())
    );
    this.catalogue = filtered;
    this.render();
  }

  dispose(): void {
    this.container.innerHTML = '';
  }
}
```

**Catalogue source**: in Phase 2A, the catalogue is a static JSON file at `public/data/furniture-catalogue.json` — a curated list of common furniture items with all 5 representation geometries pre-baked. The dynamic component editor (S58) will allow custom catalogue entries. Phase 3C's Plugin SDK will allow third-party catalogue providers.

---

#### S27 Exit Criteria

- [ ] Sofa renders correctly at all 5 LODs — `tests/parity/furniture/sofa-multi-rep.test.ts` green.
- [ ] LOD auto-switches based on camera distance (no flickering).
- [ ] Furniture carousel loads and filters catalogue correctly.
- [ ] Orbit-fps with 100 furniture items (LOD auto-managed) > 55 fps p95.
- [ ] `code-level ADR docs/02-decisions/adrs/0024-furniture-multi-representation.md` (furniture multi-representation model) merged.
- [ ] `plugins/furniture/README.md` committed.

---

### S28 — Persistent Project Hub + Portfolio View
**Weeks 55–56 (Month 14)**

---

#### Context and Why This Matters

Until S28, PRYZM 2 has been a **single-project application** — the `?pryzm2=1` flag opens one hardcoded project. S28 introduces the **project hub**: a multi-project workspace that allows listing, creating, opening, deleting, and renaming projects. This is the moment PRYZM 2 becomes a real application (not just an architecture demo).

The project hub also introduces the first major **server-side non-bake-worker feature**: project list management in the sync server. The sync server from Phase 1D handled only event linearisation. S28 adds project lifecycle commands.

---

#### Implementation Detail — Project Hub Store + Sync-Server Handlers

```typescript
// packages/stores/ProjectListStore.ts

export interface ProjectSummary {
  id: string;
  name: string;
  lastModifiedAt: string;
  thumbnailUrl: string | null;  // R2 signed URL; null if not yet generated
  ownerName: string;
  collaboratorCount: number;
  schemaVersion: number;
}

export interface ProjectListState {
  projects: ReadonlyArray<ProjectSummary>;
  isLoading: boolean;
  error: string | null;
}

export const ProjectListStore: DomainStore<ProjectListState, ProjectListEvent> = {
  name: 'projectList',
  schema: ProjectListStateSchema,
  idPrefix: 'proj',

  reduce(state, event) {
    switch (event.command) {
      case 'project.create':
        return produce(state, d => {
          d.projects.unshift({
            id: event.payload.id,
            name: event.payload.name,
            lastModifiedAt: event.timestamp,
            thumbnailUrl: null,
            ownerName: event.actorId,
            collaboratorCount: 0,
            schemaVersion: 1,
          });
        });
      case 'project.delete':
        return produce(state, d => {
          d.projects = d.projects.filter(p => p.id !== event.payload.id);
        });
      case 'project.rename':
        return produce(state, d => {
          const p = d.projects.find(p => p.id === event.payload.id);
          if (p) p.name = event.payload.name;
        });
      case 'projectList.thumbnailUpdate':
        return produce(state, d => {
          const p = d.projects.find(p => p.id === event.payload.id);
          if (p) p.thumbnailUrl = event.payload.signedUrl;
        });
    }
    return state;
  },
};
```

**Thumbnail generation**: the bake worker (S21) is extended to generate a project thumbnail on every Nth event commit (N = 20 events). The thumbnail is a 512×512 PNG rendered by the headless renderer (the same geometry kernel, but using `node-canvas` or a WebGL headless surface in the bake worker). The thumbnail is uploaded to R2 alongside chunks, and the sync server broadcasts a `projectList.thumbnailUpdate` event to all connected clients.

**Deep-link routing**: projects open at `/project/:id`. The `bootstrap.ts` reads `window.location.pathname` at startup. The view-state system (S17) restores the last-active `viewId` from `localStorage` so the user returns to the same view they left.

---

#### D1 — Kickoff (30 min)

- A: present project hub data model. Key decision: is the project list loaded from Postgres via REST (simpler) or via the WebSocket sync protocol (consistent)? **Decision**: REST GET `/projects` on hub load (one-time fetch), WebSocket `projectList.thumbnailUpdate` for live thumbnail updates. This keeps the project hub snappy while ensuring thumbnails appear as they're generated.
- B: present the project card UI design — thumbnail, name, last-modified, collaborator count, overflow menu (rename, delete, export).

#### D2–D8 Parallel Work

| Day | Agent A (Logic) | Agent B (UI) |
|---|---|---|
| D2 | `ProjectListStore` + 4 sync-server handlers (`ListProjects`, `CreateProject`, `DeleteProject`, `RenameProject`). REST API `GET /projects` + `POST /projects` + `DELETE /projects/:id` + `PATCH /projects/:id/name`. | Project hub HTML skeleton (`apps/editor/src/projects/hub.html`). Project card component — thumbnail, name, meta, overflow menu. |
| D3 | Thumbnail generation in bake worker — extend `processRebakeJob` to count events and trigger a thumbnail render every 20 events. `node-canvas` headless render of visible level. R2 upload at `thumbnails/<projectId>.png`. | Project card loading states — skeleton screen while projects load; thumbnail placeholder until R2 URL arrives. |
| D4 | Deep-link routing: `apps/editor/src/router.ts` — maps `pathname` to `ProjectHubView` or `ProjectEditorView`. `bootstrap.ts` reads the route at startup. | Confirm: clicking a project card navigates to `/project/:id` → `ProjectEditorView` opens with tier-streamed loader. |
| D5 | **Mid-sprint sync (1 h)** — end-to-end: create project → open → edit 20 things → thumbnail appears on hub card. | Same paired session. |
| D6 | Project delete — confirm: deleting a project sends `DELETE /projects/:id` → sync server marks project deleted in Postgres → `ProjectListStore.reduce` removes it from the list → committer removes all element meshes from the scene. | "New project" dialog — name input + template picker (blank, from `.pryzm` file upload). |
| D7 | Import from `.pryzm` file: hub "New from file" → file picker → `unpack()` → create project → tier-streamed load of the unpacked fixture. | Hub animation: project cards animate in on load (staggered CSS transitions). |
| D8 | E2E test: create 3 projects → open each → add a wall in each → hub shows 3 cards with correct names and timestamps. | Performance: hub renders < 100 ms for 50 projects (all cards in viewport); thumbnail lazy-loads via Intersection Observer. |

#### S28 Exit Criteria

- [ ] List, open, create, delete, rename projects all work.
- [ ] Deep links `/project/:id` open correct project.
- [ ] Thumbnails appear on hub cards within < 30 s of project creation.
- [ ] Import from `.pryzm` file works.
- [ ] PRYZM 1 hub unchanged at default URL.

---

### S29 — Dimensions + Plan-View Foundation

> **Plan-view substrate (`[strategic ADR-016]`)** — S29 must produce the first `Primitive[]` stream from the kernel through `packages/drawing-primitives/` to a Canvas2D back-end. The `(ViewDef, sceneRevision) → Primitive[]` purity contract per SPEC-04 §6 begins here. Visual-diff harness extension required.
**Weeks 57–58 (Month 15)**

---

#### Context and Why This Matters

S29 is the **gateway sprint** for Sub-phase 2B. It delivers two linked things:
1. **Dimensions** — a core annotation element present in virtually every technical drawing.
2. **Plan-view canvas host skeleton** — the minimal framework that S31 will build into the full plan view.

The plan-view skeleton in S29 deliberately does very little. Its purpose is to prove the architecture decision made in `code-level ADR docs/02-decisions/adrs/0025-plan-view-canvas-architecture.md`: a vanilla `CanvasHost` subclass owning a 2D HTML canvas, driven by `FrameScheduler`, reading from the same element stores as the 3D scene. This proof-of-architecture is worth one sprint before committing to full implementation in S31.

---

#### Implementation Detail — Dimension Producer

```typescript
// packages/geometry-kernel/producers/dimension.ts

export type DimensionType = 'linear' | 'aligned' | 'angular' | 'radial' | 'ordinate';

export interface DimensionDto {
  id: DimensionId;
  type: DimensionType;
  levelId: string;
  startPoint: Vec3;
  endPoint: Vec3;
  offsetDistance: number;   // how far the dim line is from the measured edge
  text?: string;            // if null, auto-computed from measurement
  textOffset?: Vec2;        // fine adjustment of text position
  precision: 0 | 1 | 2 | 3; // decimal places
  unit: 'mm' | 'm' | 'ft' | 'in';
  style: 'architectural' | 'engineering' | 'custom';
}

export function produceDimensionGeometry(dto: DimensionDto, _ctx: ProducerContext): GeometryIR {
  // Dimensions are 2D in nature (drawn in plan + section views).
  // In 3D view, they are shown as billboard lines with text.
  // The producer computes: two extension lines + one dimension line + text anchor point.

  const measurement = computeMeasurement(dto);
  const label = dto.text ?? formatMeasurement(measurement, dto.unit, dto.precision);

  const extLine1 = buildExtensionLine(dto.startPoint, dto.offsetDistance, dto.type);
  const extLine2 = buildExtensionLine(dto.endPoint, dto.offsetDistance, dto.type);
  const dimLine  = buildDimensionLine(dto.startPoint, dto.endPoint, dto.offsetDistance, dto.type);
  const arrow1   = buildArrowhead(dimLine.start, dto.style);
  const arrow2   = buildArrowhead(dimLine.end, dto.style);

  return {
    meshes: [...arrow1.meshes, ...arrow2.meshes],
    edges: [
      { kind: 'extension-line', vertices: [extLine1.start, extLine1.end] },
      { kind: 'extension-line', vertices: [extLine2.start, extLine2.end] },
      { kind: 'dimension-line', vertices: [dimLine.start, dimLine.end] },
    ],
    labels: [{ text: label, anchor: dimLine.midpoint, offset: dto.textOffset }],
    bounds: computeAABBFromLines([extLine1, extLine2, dimLine]),
    metadata: { sourceId: dto.id, version: hashDto(dto), materialIds: [], extra: { measurement, label } },
  };
}
```

---

#### Implementation Detail — Plan-View Canvas Host Skeleton (`code-level ADR docs/02-decisions/adrs/0025-plan-view-canvas-architecture.md`)

```typescript
// plugins/plan-view/canvas-host.ts (skeleton)

import { CanvasHost } from '@pryzm/ui/CanvasHost';
import { FrameScheduler } from '@pryzm/frame-scheduler';

export class PlanViewCanvasHost extends CanvasHost {
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  private camera: PlanCamera; // pan/zoom camera for 2D view

  constructor(
    private container: HTMLElement,
    private scheduler: FrameScheduler,
    private levelStore: LevelStore,
    private stores: StoreRegistry,
  ) {
    super();
    this.canvas = document.createElement('canvas');
    this.ctx2d = this.canvas.getContext('2d')!;
    this.container.appendChild(this.canvas);
    this.camera = new PlanCamera(this.canvas);

    // When any store in the current level changes, dirty the plan view.
    ['wall', 'slab', 'door', 'window'].forEach(storeName => {
      stores.get(storeName).subscribeDirty(() => {
        this.scheduler.requestFrame('plan-view-dirty');
      });
    });

    // Register render function with scheduler.
    this.scheduler.onFrame('plan-view', () => this.render());
  }

  private render(): void {
    const { width, height } = this.canvas;
    this.ctx2d.clearRect(0, 0, width, height);

    // Apply camera transform.
    this.ctx2d.save();
    this.camera.applyTransform(this.ctx2d);

    // Render level outline — walls only for now.
    const levelId = this.levelStore.getSnapshot().activeLevel;
    const walls = this.stores.get('wall').selectors(
      this.stores.get('wall').getSnapshot()
    ).byLevel(levelId);

    for (const wall of walls) {
      this.renderWallOutline(wall);
    }

    this.ctx2d.restore();
  }

  private renderWallOutline(wall: WallDto): void {
    // Simple 2D line from start to end, with thickness representing wall depth.
    const { start, end, thickness } = wall;
    this.ctx2d.strokeStyle = '#333';
    this.ctx2d.lineWidth = thickness * this.camera.scale;
    this.ctx2d.beginPath();
    this.ctx2d.moveTo(start[0], start[2]); // note: Y in world = Z in plan view
    this.ctx2d.lineTo(end[0], end[2]);
    this.ctx2d.stroke();
  }

  dispose(): void {
    this.container.removeChild(this.canvas);
    this.camera.dispose();
  }
}
```

**Why the skeleton deliberately does so little**: the full plan view renderer (S31) involves edge projection, poche fill, annotation rendering, and multi-view sync. Starting with a skeleton that merely draws wall centre lines confirms the architecture (CanvasHost + FrameScheduler + dirty-flag) before adding the complex rendering logic. Rushing to implement everything in S29 would produce an untestable monolith.

---

#### S29 Exit Criteria

- [ ] 6 dimension handlers: `CreateDimension`, `DeleteDimension`, `MoveDimension`, `SetPrecision`, `SetUnit`, `SetText` — all with `produceWithPatches`.
- [ ] 6-case dimension parity fixture green.
- [ ] Plan view skeleton renders walls/slabs/doors of active level (outline only, no poche fill yet).
- [ ] Level switcher works: change active level → plan view updates.
- [ ] Plan view at 60 fps interactive, 0 fps idle (FrameScheduler dirty-flag verified in DevTools).
- [ ] `code-level ADR docs/02-decisions/adrs/0025-plan-view-canvas-architecture.md` merged.

---

### S30 — Edge Projection + Poche Fill (Pure)

> **Edge projection placement (`[strategic ADR-016]`)** — `packages/geometry-kernel/edge-projection/` is the **classifier** producing `ClassifiedPrimitive[]`. Primitive emission lives downstream in `packages/drawing-primitives/`. The "pure-and-headless-tested" requirement per the original sprint goal is preserved.
>
> **WebGPU compute path (`[strategic ADR-006]`)** — projection has a WebGPU compute-shader fast path with a CPU fallback; both paths must produce byte-identical output. CPU fallback is the Node target; the WebGPU path is browser-only.
**Weeks 59–60 (Month 15)**

---

#### Context and Why This Matters

S30 delivers the **mathematical foundation** of the plan view rendering pipeline. Without `edge-projection.ts` and `poche.ts` being pure, tested, and headless-compatible, the full plan view (S31) cannot be built with confidence. These two modules are the most mathematically sophisticated pieces of code in Phase 2A.

**Edge projection**: transforms 3D wall geometry into 2D plan view edges. Specifically:
- Given a set of wall DTOs and a horizontal cut plane at `levelZ + 1m` (the standard plan view cut height), return the visible edges of each wall as 2D `Edge2D` objects.
- Must handle: wall openings (door/window apertures produce visible edges at the cut), wall joins (mitered corners produce correct edge geometry), curved walls (arc segments).

**Poche fill**: computes the solid fill of wall cross-sections at the plan view cut height. This is the dark gray fill that appears inside wall thickness in technical drawings. It is more visually significant than it sounds — the poche fill is what distinguishes a professional plan drawing from a wireframe.

```typescript
// packages/geometry-kernel/edge-projection.ts (excerpt)

export interface Edge2D {
  kind: 'wall-outer' | 'wall-inner' | 'opening' | 'poche-boundary';
  start: Vec2;
  end: Vec2;
  elementId: string;    // which wall or opening this edge belongs to
  lineWeight: number;   // 0.1, 0.25, 0.5, 0.7, 1.0 mm (following ISO 128-21)
}

export function projectWallEdges(
  walls: WallDto[],
  doors: DoorDto[],
  windows: WindowDto[],
  levelZ: number,
  cutHeight: number = 1.0, // metres above level Z; standard is 1m
): Edge2D[] {
  const cutPlane = levelZ + cutHeight;
  const edges: Edge2D[] = [];

  for (const wall of walls) {
    // Skip walls that don't intersect the cut plane.
    if (wall.base > cutPlane || wall.base + wall.height < cutPlane) continue;

    // 1. Compute outer face edges (projected to XZ plane).
    const outerLeft  = projectSegment(wall.start, wall.end, wall.thickness / 2, cutPlane);
    const outerRight = projectSegment(wall.start, wall.end, -wall.thickness / 2, cutPlane);

    // 2. Subtract openings (doors, windows hosted by this wall).
    const hostedOpenings = [...doors, ...windows].filter(d => d.hostWallId === wall.id);
    const clearedEdges = subtractOpenings([outerLeft, outerRight], hostedOpenings);

    edges.push(...clearedEdges.map(e => ({ ...e, elementId: wall.id, lineWeight: 0.5 })));
  }

  return edges;
}
```

**`poche.ts`** implementation:

```typescript
// packages/geometry-kernel/poche.ts

export interface PocheFill {
  polygon: Vec2[];     // the fill polygon (wall cross-section at cut height)
  elementId: string;
}

export function computePocheFills(walls: WallDto[], levelZ: number, cutHeight: number = 1.0): PocheFill[] {
  const cutPlane = levelZ + cutHeight;
  return walls
    .filter(w => w.base <= cutPlane && w.base + w.height >= cutPlane)
    .map(wall => {
      // Wall cross-section at cutPlane = a rectangle parallel to wall direction.
      const polygon = computeWallCrossSectionPolygon(wall, cutPlane);
      return { polygon, elementId: wall.id };
    })
    .filter(f => f.polygon.length >= 3); // degenerate check
}
```

**Snapshot tests**: both functions must have byte-identical outputs between the browser worker and Node vitest. The snapshot is committed and checked in CI:

```typescript
// packages/geometry-kernel/__tests__/edge-projection.test.ts
import { describe, it, expect } from 'vitest';
import { projectWallEdges } from '../edge-projection';
import { sampleWalls, sampleDoors } from '../__fixtures__/plan-view-fixture';

describe('edge-projection (Node)', () => {
  it('produces edges matching snapshot', () => {
    const edges = projectWallEdges(sampleWalls, sampleDoors, [], 0, 1.0);
    expect(edges).toMatchSnapshot();
    // The same test runs in the browser worker via the browser test suite.
    // If outputs differ, the function has a platform dependency — must be fixed.
  });
});
```

---

#### D9 — Sub-Phase 2A Demo Recording (Joint, 8-min Screencast)

Scene 1 (2 min): Open the project hub. Create a new project. Add walls, rooms, a structural brace, lighting, and plumbing. Demonstrate each element type.

Scene 2 (2 min): Place furniture from the carousel. Orbit near a sofa → LOD high detail. Orbit far away → LOD auto-switches. 100 furniture items in scene → orbit > 55 fps.

Scene 3 (2 min): Place dimensions. Switch to the plan view skeleton (level outline). Level switcher demonstrates correct level scoping.

Scene 4 (2 min): CI bench dashboard updated — all 18 element families green. OTel trace from a room computation showing floor-fill geometry production. Node + browser snapshot comparison proving edge-projection is pure.

#### S30 Exit Criteria (= Sub-Phase 2A Exit)

- [ ] Visual-diff CI gate covers the `edge-projection` output for 12 reference scenes (warning-level at S30; error-level at S36 per `[strategic ADR-006]` Phase rollout).
- [ ] Hatch alignment in poche fill follows the *element's local coordinate system*, never the view origin (per SPEC-04 §2.3).

- [ ] `edge-projection.ts` and `poche.ts` both pure — zero THREE imports, zero DOM access.
- [ ] Byte-identical outputs between Node vitest and browser worker for both functions.
- [ ] Snapshot tests committed: `edge-projection.snap`, `poche.snap`.
- [ ] All 18 element families parity-tested and green.
- [ ] Plan view skeleton renders walls + slabs + doors at 60 fps interactive, 0 fps idle.
- [ ] Level switcher correctly scopes all 18 element families.
- [ ] 2A demo recording committed to `docs/05-guides/developer/demos/M15-2A.mp4`.
- [ ] `apps/bench/reports/M15-2A-baseline.md` committed.

---

## §3 Cross-Cutting Deliverables for 2A

### §3.1 ADRs Merged by M15

| ID | Subject | Key Decision | Sprint |
|---|---|---|---|
| `code-level ADR docs/02-decisions/adrs/0022-room-boundary-detection.md` | Room boundary detection | Topological half-edge flood-fill; `emptyGeometryIR` for unenclosed seeds; re-queue on wall dirty | S25 |
| `code-level ADR docs/02-decisions/adrs/0024-furniture-multi-representation.md` | Furniture multi-representation | 5 LOD levels (R0–R4); auto-LOD by camera distance; `ephemeral: true` for `SetActiveLod` events | S27 |
| `code-level ADR docs/02-decisions/adrs/0025-plan-view-canvas-architecture.md` | Plan view canvas architecture | Vanilla `CanvasHost` subclass; 2D HTML Canvas API; `FrameScheduler` dirty-flag driven; NO THREE in plan view | S29 |

### §3.2 CI Gates Added in 2A

| Gate | Hard-fail Threshold | Sprint |
|---|---|---|
| Room area accuracy | > 0.1% error vs PRYZM 1 on 20-case parity | S25 |
| K1-C element velocity | Any single family > 4 days of A+B combined | S26 |
| Furniture LOD parity | `sofa-multi-rep.test.ts` failure | S27 |
| Orbit-fps (18 families, 300 elements) | < 50 fps p95 | S26 |
| Edge-projection snapshot | Any diff vs committed snapshot | S30 |
| Poche snapshot | Any diff vs committed snapshot | S30 |
| Plan view fps | < 50 fps p95 (2D pan/zoom) | S29 |

### §3.3 OTel Spans Added in 2A

| Span | Layer | Sprint |
|---|---|---|
| `pryzm.geometry.produce.room` | L4 | S25 |
| `pryzm.geometry.produce.structural` | L4 | S26 |
| `pryzm.geometry.produce.lighting` | L4 | S26 |
| `pryzm.geometry.produce.plumbing` | L4 | S26 |
| `pryzm.geometry.produce.furniture` | L4 | S27 |
| `pryzm.geometry.produce.dimension` | L4 | S29 |
| `pryzm.plan-view.render` | L5 (2D) | S29 |
| `pryzm.plan-view.edge-project` | L4 | S30 |
| `pryzm.plan-view.poche` | L4 | S30 |

---

## §4 Risk Register (2A-Specific)

| ID | Risk | Likelihood | Impact | Mitigation | Trigger |
|---|---|---|---|---|---|
| **R2A-01** | Room boundary detection fails on complex floor plans (non-convex, islands) | Medium | High | 20-case parity fixture from real PRYZM 1 projects; K2A-S25 kill-switch if > 3 failures by D5 | S25 D5 |
| **R2A-02** | K1-C velocity failure — one element family takes > 4 days | Low | Medium | Diagnose pattern immediately; do not push harder — the pattern is wrong if this fires | S26 |
| **R2A-03** | Furniture LOD mesh-swap produces visual pop (visible gap between LOD levels) | Medium | Medium | Crossfade duration = 200 ms; LOD hysteresis band of ±5 m prevents rapid switching | S27 |
| **R2A-04** | Project hub REST API becomes a bottleneck at 100+ projects per user | Low | Medium | Server-side pagination (50 projects per page); client-side search as immediate mitigation | S28 |
| **R2A-05** | Edge projection produces incorrect edges at wall joins (miter not correctly handled) | High | High | Parity fixture includes join-heavy scenes (10 wall joins); any failure = immediate fix before S31 starts | S30 |
| **R2A-06** | Poche fill polygon is not closed (produces gaps in fill) | Medium | Medium | Unit test: assert `polygon[0] === polygon[polygon.length - 1]` for every fill | S30 |
| **R2A-07** | 2A overruns, delaying 2B (the highest-risk sub-project) | Low | Critical | Buffer days (D10 of each sprint); 2A has no luxury of overrun — 2B has a fixed kill-switch of its own | S30 |

### Kill-Switches

- **K2A-1**: If room boundary detection fails > 3 of 20 parity cases at S25 D5 — drop complex room shapes from Phase 2 scope; deliver rectangular rooms only; defer complex detection to Phase 3A. Document clearly.
- **K2A-2**: If edge-projection produces incorrect edges at wall joins — do not proceed to S31 (Plan View). Fix edge-projection first. Phase 2B depends on this being correct.

---

## §5 2A → 2B Handoff Checklist

- [ ] All 18 element families parity-tested and CI green.
- [ ] `edge-projection.ts` and `poche.ts` pure, snapshot-tested, byte-identical in Node and browser.
- [ ] Plan view skeleton renders all 18 families at 60 fps idle-0.
- [ ] Level switcher working and correctly scoped.
- [ ] ADRs 020–022 all merged.
- [ ] `apps/bench/reports/M15-2A-baseline.md` committed.
- [ ] S31 sprint plan drafted in `docs/03-execution/status/sprints/S31.md`.
- [ ] No element family has open parity failures.
- [ ] Room boundary limitation documented if K2A-1 fired.

---

## §Gap-Closure Note (2026-04-27)

**Phase 2A holds no gap-closure work.** Phase 2A is in active development against the existing `§1`–`§5` plan; introducing new SPEC/ADR ratification or reverse-doc work mid-sprint here is forbidden. All gap-closure work surfaced by `GAP-REVIEW-2026-04-27.md` — SPEC-13/15/21/24/26/27/28/29/30 ratification, ADR-022/023/025/026/028/030 ratification, reverse-doc of Phase-1 + Phase-2A in-flight envelopes, service-role-key removal, BullMQ sweep, `02-decisions/contracts/` archival, drawing-primitives MVP, ESLint rule promotion to error, and the 5-operation Canvas2D pre-port — is **deferred to Phase 2B (S31)** and lives in `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §Gap-Closure Subphase.

The new families being built in this phase (Rooms, Structural, Lighting, Plumbing, Furniture, Dimensions) follow the existing element recipe documented in code; their context envelopes will be reverse-documented in Phase 2B per SPEC-13 §3 + SPEC-21 Step 2 (the same pattern that closed the Phase 1 envelopes).

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead.*
*Predecessor: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`. Successor: `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md`.*
