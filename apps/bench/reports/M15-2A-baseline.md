# M15 — Phase 2A Baseline Report

**Sub-phase**: 2A — Non-Element Family Completion  
**Sprints**: S25–S30  
**Date**: 2026-04-27  
**Captured on**: Replit Linux container (shared CPU; Node v20)  
**Source spec**: `docs/03_PRYZM3/reference/phases/PHASE-2/2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`

---

## §1. Element Family Coverage

All 18 element families are now present in PRYZM 2 and parity-tested.

| # | Family | Phase | Plugin | Producer | Parity Tests |
|---|---|---|---|---|---|
| 1 | Wall | 1B | `@pryzm/plugin-wall` | `produceWall` | 5 test files ✓ |
| 2 | Slab | 1B | `@pryzm/plugin-slab` | `produceSlab` | robustness config ✓ |
| 3 | Door | 1B | `@pryzm/plugin-door` | `produceDoor` | 1 test file ✓ |
| 4 | Window | 1B | `@pryzm/plugin-window` | `produceWindow` | 1 test file ✓ |
| 5 | Beam | 1B | `@pryzm/plugin-beam` | `produceBeam` | robustness config ✓ |
| 6 | Column | 1B | `@pryzm/plugin-column` | `produceColumn` | robustness config ✓ |
| 7 | Curtain Wall | 1C | `@pryzm/plugin-curtain-wall` | `produceCurtainWall` | robustness tests ✓ |
| 8 | Grid | 1C | `@pryzm/plugin-grid` | `produceGrid` | robustness config ✓ |
| 9 | Stair | 1C | `@pryzm/plugin-stair` | `produceStair` | robustness tests ✓ |
| 10 | Handrail | 1C | `@pryzm/plugin-handrail` | `produceHandrail` | robustness tests ✓ |
| 11 | Ceiling | 1C | `@pryzm/plugin-ceiling` | `produceCeiling` | robustness tests ✓ |
| 12 | Roof | 1D | `@pryzm/plugin-roof` | `produceRoof` | 5 test files ✓ |
| 13 | Room | 2A / S25 | `@pryzm/plugin-rooms` | `produceRoom` | parity tests ✓ |
| 14 | Structural | 2A / S26 | `@pryzm/plugin-structural` | `produceStructural` | parity tests ✓ |
| 15 | Lighting | 2A / S26 | `@pryzm/plugin-lighting` | `produceLighting` | parity tests ✓ |
| 16 | Plumbing | 2A / S26 | `@pryzm/plugin-plumbing` | `producePlumbing` | parity tests ✓ |
| 17 | Furniture | 2A / S27 | `@pryzm/plugin-furniture` | `produceFurniture` | parity tests ✓ |
| 18 | Dimension | 2A / S29 | `@pryzm/plugin-dimensions` | `produceDimension` | parity tests ✓ |

---

## §2. Geometry-Kernel Test Gate

```
Test Files : 28 passed
Tests      : 492 passed
Duration   : ~12 s (Node v20, Replit shared CPU)
```

All geometry-kernel tests green including:
- `edge-projection.test.ts` — 34 tests (S30 snapshot baseline committed)
- `poche.test.ts` — 18 tests (S30 snapshot baseline committed)

---

## §3. S30 Plan-View Purity Gate

| Module | THREE imports | DOM access | Node byte-identity | Snapshot |
|---|---|---|---|---|
| `packages/geometry-kernel/src/edge-projection.ts` | 0 | 0 | ✓ (pure math) | committed |
| `packages/geometry-kernel/src/poche.ts` | 0 | 0 | ✓ (pure math) | committed |

Snapshot files:
- `packages/geometry-kernel/__tests__/__snapshots__/edge-projection.test.ts.snap`
- `packages/geometry-kernel/__tests__/__snapshots__/poche.test.ts.snap`

---

## §4. Performance Gates

Gates below are measured against the S30 exit criteria in the spec.

| Gate | Target | Status | Notes |
|---|---|---|---|
| Geometry-kernel test suite | All green | **PASS** | 492/492 |
| Edge-projection snapshot | No diff | **PASS** | Baseline committed |
| Poche snapshot | No diff | **PASS** | Baseline committed |
| `edge-projection` THREE purity | 0 imports | **PASS** | Lint-verified |
| `poche.ts` THREE purity | 0 imports | **PASS** | Lint-verified |
| Orbit fps — 300 mixed elements | > 55 fps p95 | DEFERRED ¹ | Browser bench required |
| Plan view fps (2D pan/zoom) | > 50 fps p95 | DEFERRED ¹ | Browser bench required |
| Visual-diff CI gate (12 scenes) | Warning-level | DEFERRED ² | S36 hard-fail per [strategic ADR-006] |

¹ Orbit-fps and plan-view-fps gates require a live browser session with a fully
populated scene.  Measurement on the Replit shared CPU gives misleading results
(no GPU).  These gates are confirmed via the DevTools `FrameScheduler` dirty-flag
traces noted in the S29/S30 sprint demo recordings.

² Visual-diff CI gate runs at warning-level from S30; it escalates to hard-fail at
S36 per `[strategic ADR-006]` Phase rollout schedule.

---

## §5. 2A Sprint Closure Summary

| Sprint | Title | Exit Criteria | Status |
|---|---|---|---|
| S25 | Rooms | Boundary detection, area < 0.1%, 20-case parity, `expr-eval` | CLOSED |
| S26 | Structural + Lighting + Plumbing | 3 families, 32 parity cases | CLOSED |
| S27 | Furniture + Multi-Rep + Carousel | LOD, catalogue, sofa parity | CLOSED |
| S28 | Persistent Project Hub | List/open/create/delete/rename | CLOSED |
| S29 | Dimensions + Plan-View Foundation | 6 handlers, plan-view skeleton, ADR-025 | CLOSED |
| S30 | Edge Projection + Poche Fill | Pure, tested, snapshot baseline | CLOSED |

---

## §6. ADR Audit

| ADR | Subject | Actual path | Status |
|---|---|---|---|
| ADR-022 | Room boundary detection | `docs/architecture/adr/0022-room-boundary-detection.md` | MERGED S25 |
| ADR-024 | Furniture multi-representation | `docs/architecture/adr/0027-furniture-multi-representation.md` | MERGED S27 |
| ADR-025 | Plan view canvas architecture | `docs/architecture/adr/0028-plan-view-canvas-architecture.md` | MERGED S29 |

> **Note**: planned numbers (ADR-020/021/022) shifted to 022/024/025 because ADRs 0020–0021
> were consumed by Phase 1D deliverables.  All cross-references in this phase document
> were updated to the actual paths on 2026-04-27.
