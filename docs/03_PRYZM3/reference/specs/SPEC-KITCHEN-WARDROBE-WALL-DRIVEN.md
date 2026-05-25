# SPEC — Smart Kitchen & Wardrobe (Wall-Driven Generation)

| Field | Value |
|---|---|
| Status | **QUEUED — not started.** Phase 0 (audit) MUST run first; the build is **approval-gated** (STOP after every phase, await sign-off). |
| Version | 0.1 (queued 2026-05-25) |
| Owner | Architecture lead |
| Governed by | **C16** (command authoring — level-oriented, semantic-first), **C17** (batch/panel binding — a "kitchen/wardrobe from walls" catalogue entry), **C11** (element creation pipeline), **C15** (wall-hosted reasoning), **C04** (rendering/instancing for P2/P3) |
| Proposed new package | **`packages/kitchen-planner/`** — pure wall-reading + layout-detection utilities (P5: no DOM/THREE/I-O). Adding a package is an architectural decision to confirm at Phase 0. |
| P-gates | P2 (THREE only in renderer-three — geometry via RendererHandle/instancing), P3 (FrameScheduler, no raw rAF), P5 (schemas + WallSegmentReader pure), P6 (mutation via commandBus only), P8 (≥1 OTel span per new exported fn) |

> A heavy, multi-phase feature: replace bounding-box kitchen/wardrobe placement with **wall-driven generation** — the user selects 1–3 walls, the system auto-detects `straight | L-shape | U-shape`, hugs the walls with cabinet segments, auto-places appliances, and builds detailed (LOD'd, instanced) carcasses/doors/worktops/appliances. **Queued behind the Semantic Design Assistant work** (SPEC-SEMANTIC-DESIGN-ASSISTANT) and the #51 capstone. It is **approval-gated**: each phase is committed and reviewed before the next begins; Phase 0 produces an audit document and **stops for approval before any code**.

---

## §1 — Why queued + the discipline

This feature touches schemas (P5), command handlers (C16/P6), the geometry/instancing pipeline (P2/P3), and the UI tool. Its own execution prompt (Appendix A) mandates: **Phase 0 audit first, one commit per phase, STOP for approval between phases.** It is therefore captured here as a governed, queued SPEC rather than started inline. **Dequeue trigger:** explicit go-ahead from the architect (ideally once the current semantic-engine + #51 capstone work is at a natural break).

## §2 — The phased plan (0 → 6)

- **Phase 0 — Audit & Discovery (gate: a committed `docs/kitchen-wardrobe-audit.md`).** Read the current kitchen + wardrobe schemas, creation command(s)/handler(s), geometry builders, and UI tools; document current shape, gaps vs target, and a risk list flagging anything touching P2/P3/P6. **STOP for approval.** *(No code in Phase 0.)*
- **Phase 1 — Schema redesign (`packages/schemas/`, P5).** Kitchen + Wardrobe schemas keyed on `layoutType` + a `segments[]` array (1–3), each referencing a `wallId` with offsets/depth/heights; kitchen `appliances` (fridge/sink/oven with segmentIndex + position hint) + `materials` slots; wardrobe `internalConfig` per segment + `door`. Run `ci-check-domain-purity.ts` after every change; `pnpm --filter @pryzm/schemas test`. Target shapes in §3.
- **Phase 2 — Commands & handlers (C16/P6/P8).** New commands: `kitchen.create-from-walls`, `kitchen.update-materials`, `kitchen.update-appliance`, `wardrobe.create-from-walls`, `wardrobe.update-config`, `wardrobe.update-door`. The create handler: OTel span → read wall geometry → detect layout (1=straight, 2-at-corner=L, 3=U, 2-parallel=`DomainError('invalid-kitchen-layout')`) → segment lengths minus corner overlaps (600 mm) → auto-place appliances (fridge at long-segment end, sink centred near a window, oven beside sink, never at a corner) → validate (no segment < 1200 mm, no appliance overlap, interior side only) → Immer draft ≤16 ms → `FrameScheduler.schedule('pre-render', buildFn)` → `runtime.events.emit('kitchen.created')` → close span.
- **Phase 3 — Geometry builder (P2/P3, the heaviest phase).** Base units (600 mm carcass modules, continuous worktop 40 mm + 20 mm overhang, recessed 150 mm kickboard, one door per module); wall units (870→2100 mm); appliances (fridge 600×600×2000, sink cutout + tap, oven face + hob); corner treatment for L/U (blind corner unit, mitred worktop, angled filler). **Instanced meshes for repeated modules via RendererHandle only (P2).** LOD: full <3 m, simplified 3–10 m, bbox >10 m; adaptive drain ≤10 ms/frame.
- **Phase 4 — `WallSegmentReader` (P5, pure — can run parallel to Phase 3).** `packages/kitchen-planner/src/WallSegmentReader.ts`: `readWallSegments(wallIds, stores)`, `detectLayoutType(segments)`, `calculateCornerOverlaps(segments, depth)`, `findBestWindowProximity(segments)` → `WallSegmentData[]` (start/end/length/interiorNormal/windowIds/adjacentWalls). Full unit tests. **Note:** `detectLayoutType` overlaps conceptually with SL-3's exterior/orientation + the adjacency substrate — reuse `FacadeOrientationService` + `boundingWallIds` where possible rather than re-deriving wall geometry.
- **Phase 5 — UI tool update.** Switch kitchen/wardrobe tools from bounding-box to **wall-selection** (1–3 walls), live layout-type + run-length labels, ghost preview via FrameScheduler, confirm → dispatch via commandBus only (P6).
- **Phase 6 — Tests.** Unit + integration: straight/L/U creation, corner-overlap subtraction, appliance placement, min-segment + parallel-wall `DomainError`s, wardrobe module/door counts. Run `pnpm run test` + the GA gates (three-imports, raf-count, spans).

## §3 — Target schemas (Phase 1 reference)

**Kitchen** — `layoutType` (straight|L-shape|U-shape); `segments[]` `{ wallId, side, startOffset, endOffset, depth=600, heightBase=870, heightWall=2100, heightKick=150 }`; `appliances` `{ fridge{segmentIndex,position,width=600,height=2000,depth=600}, sink{segmentIndex,position,width=600}, oven{segmentIndex,position,width=600} }`; `materials` `{ carcass, door, worktop, kickboard, handle }` (defaulted to existing material IDs); `wallIds` (1–3).

**Wardrobe** — `layoutType`; `segments[]` `{ wallId, startOffset, endOffset, depth=600, height=2400, internalConfig: hanging-full|hanging-shelf|shelves-full|hanging-double }`; `door` `{ type: hinged|sliding|none, count (auto), material }`; `materials` `{ carcass, interior }`; `wallIds` (1–3).

(Full Zod in Appendix A; P5 — zero imports beyond zod.)

## §4 — Alignment notes (read before dequeue)

- **C16 (level-oriented, semantic-first):** the create handler must resolve + register `levelId` across the three authorities (CA-4) and register the kitchen/wardrobe (+ any appliance sub-elements) in the semantic registry (CA-5); undoable as one unit (CA-11); ≥1 OTel span (CA-14).
- **C17:** a "Kitchen from walls" / "Wardrobe from walls" entry belongs in the CREATE catalogue (Architecture or Interior); the wall-selection is the `from-selected`/multi-wall scope.
- **Reuse, don't re-derive:** the wall-reading service should reuse `FacadeOrientationService` (orientation/exterior), `wallOccupancyStore` (placement), and `room.boundingWallIds` (adjacency) rather than re-implement wall geometry — same discipline that kept the semantic engine duplication-free.
- **P2 instancing:** repeated cabinet modules MUST instance via the renderer handle (mirror `WallInstanceBridge` / `InstancedElementRenderer`); remember the §INSTANCED-ISOLATE-FIX lesson — stamp `elementType` + `levelId` on instanced groups so hide/isolate-by-level work.

## §5 — Appendix A — verbatim execution prompt (preserved for dequeue)

> The architect-authored, phase-gated prompt is preserved verbatim in the project conversation/queue (2026-05-25). On dequeue, run it exactly as written: **PHASE 0 first (audit only) → STOP for approval**, then one phase + one commit at a time with the exact commit messages, `pnpm --filter` for all tests, never npm/yarn, and the P1–P8 rules enforced after every phase. (The full text is the message that created this SPEC.)

## §6 — Cross-references

C16 (command authoring), C17 (catalogue + panel), C11 (creation pipeline), C04 (rendering/instancing), C15 (wall-hosted), SPEC-SEMANTIC-DESIGN-ASSISTANT (the work this is queued behind), `WallInstanceBridge`/`InstancedElementRenderer` (P2 instancing precedent), `FacadeOrientationService` (SL-3, reuse for wall reading).
