// consequenceExecutionServiceComposition — the COMPOSITION SITE for the R4 executor.
//
// Same split as the R2/R3 composition files and for the same reason: the SERVICE
// (ConsequenceExecutionService.ts) takes every collaborator by injection and imports
// only types, so its tests and the certification gate run window-free; THIS file is
// the one that reaches for production singletons, invoked from the composition layer.
//
// The bus is a PARAMETER, not an import: the live CommandBus instance is owned by
// `composeRuntime` (P1 — another phase's territory), and the caller that wires the
// consequence-carrying execution surface (R6's confirmation flow) already holds the
// runtime. Taking it as an argument keeps this file free of any runtime-acquisition
// path that could rival the single composition root.
//
// R4 STATUS, stated honestly: no production surface calls this factory yet. That is
// DELIBERATE, not neglect — the R3 hover preview's plan is computed for a hover-time
// payload, so consuming it at drag-end would ALWAYS refuse binding (the payload —
// hence planHash — differs), and the plan-at-confirm-time flow that makes binding
// meaningful is R6's confirmation policy (BIM30 plan R6). R4's own exit condition is
// G-REASON-03 landing with its ledger (plan doc R4), which the certification gate
// (tools/rac-conformance/certification/gates/check-execution-plan-agreement.ts)
// satisfies by driving THIS service over the real bus + real wall.updateBaseline
// handler. Disposition per STR-06's ladder: AUTHORED ✓ / REACHABLE via this factory /
// COMPOSABLE+production-wired lands with R6.
//
// R5 (2026-08-12): the executor now takes an optional SINK — where the finished
// `ExecutionConsequence` is delivered for display. `createConsequenceExecutionServiceWithReportView`
// below composes the production `ConsequenceReportView` as that sink. The R4 status above
// is UNCHANGED by this: the drag-end binding problem is still R6's, so the factory pair
// remains reachable-not-production-called. R5 makes the report RENDERABLE, and the gate
// (check-consequence-report-completeness) drives the real view; it does not claim a
// production trigger it does not have.

import type { ConsequencePlanner, PredictedGeometry } from '@pryzm/command-bus';
import type { WallMoveCommand } from './WallMoveConsequencePlanner.js';
import { createWallMoveConsequencePlanner } from './wallMovePlannerComposition.js';
import { buildPlanningContext } from './consequencePreviewServiceComposition.js';
import {
  ConsequenceExecutionService,
  type ConsequenceDispatcher,
  type ConsequenceSink,
  type RoomGeometryReader,
  type RedetectSuppressor,
} from './ConsequenceExecutionService.js';
import { ConsequenceReportView } from '@app/ui/canvas/ConsequenceReportView';
import { storeRegistry } from '@pryzm/core-app-model';
// §BRIDGE-EXPORTS (2026-08-12) — the applier's `ApplyPredictedRoomGeometryCommand`
// dispatch is a typed-world → legacy-commandManager bridge, so it lives in the ONE
// authorised bridge file (`initBusHandlers.ts` — the file check-no-commandmanager
// excludes by design) rather than as a scattered legacy call site here. Behaviour
// is byte-identical to the factory that used to be defined below; the full WHY
// (one undo stack, one gesture, one Ctrl+Z) is documented at the definition.
import { createPredictedRoomGeometryApplier } from '../initBusHandlers';
export { createPredictedRoomGeometryApplier };

/**
 * Build the production R4 executor over the live bus: the SAME `wall.move` planner
 * the preview composes (one planner, both surfaces — ADR-0322 §1), the SAME
 * PlanningContext factory over the live `storeRegistry`, and the default read-back
 * store set. No violation snapshotter yet: assembling the ConstraintContext outside
 * the planner is R5/R6 work, so reports carry `validationUndetermined` — a typed
 * blind spot, not a fabricated "no delta" (consequence.ts §5).
 */
export function createConsequenceExecutionService(
  bus: ConsequenceDispatcher,
  sink?: ConsequenceSink,
): ConsequenceExecutionService {
  const planners = new Map<string, ConsequencePlanner<WallMoveCommand>>();
  planners.set('wall.move', createWallMoveConsequencePlanner());
  return new ConsequenceExecutionService({
    bus,
    planners,
    context: buildPlanningContext,
    // SAFE MODE ROOM RESHAPE — preview and execution now share ONE algorithm.
    applyPredictedRoomGeometry: createPredictedRoomGeometryApplier(),
    redetectSuppressor: liveRedetectSuppressor(),
    readRoomGeometry: createRoomGeometryReader(),
    ...(sink !== undefined ? { sink } : {}),
  });
}

// ─── SAFE MODE ROOM RESHAPE — the three production collaborators ──────────────

// (createPredictedRoomGeometryApplier moved to `../initBusHandlers.ts` — see the
// §BRIDGE-EXPORTS import above. Re-exported unchanged for API stability.)

/**
 * The live `RoomTopologyObserver`, read at CALL time (not captured at composition
 * time): the observer is constructed by `initTools` and republished on
 * `window.roomTopologyObserver`, and a project switch replaces the instance. A
 * captured reference would hold a disposed observer and suppress nothing.
 */
export function liveRedetectSuppressor(): RedetectSuppressor {
  const observer = (): RedetectSuppressor | undefined =>
    (window as unknown as { roomTopologyObserver?: RedetectSuppressor }).roomTopologyObserver;
  return {
    markPlanCoveredLevels: (levelIds) => observer()?.markPlanCoveredLevels(levelIds),
    releasePlanCoveredLevels: (levelIds) => observer()?.releasePlanCoveredLevels(levelIds),
  };
}

/**
 * INDEPENDENT read-back of committed room geometry, straight off the authoritative
 * room store. Deliberately does NOT consult the plan, the command, or any cached
 * copy: a read-back that read the prediction back to itself would report perfect
 * fidelity no matter what was committed — the blind-comparator failure.
 *
 * A room the store does not hold is OMITTED, and the service treats an omission as
 * a divergence rather than a pass.
 */
export function createRoomGeometryReader(): RoomGeometryReader {
  return (elementIds) => {
    const store = storeRegistry.getStoreForType('room');
    if (!store) return [];
    const out: PredictedGeometry[] = [];
    for (const id of elementIds) {
      const room = store.getById?.(id) as {
        boundary?: { polygon?: readonly { x: number; z: number }[] };
        computed?: {
          area?: number; perimeter?: number;
          centroid?: { x: number; z: number };
          boundingBox?: { minX: number; minZ: number; maxX: number; maxZ: number };
        };
      } | null | undefined;
      const polygon = room?.boundary?.polygon;
      if (!room || !Array.isArray(polygon)) continue;
      out.push({
        elementId: id,
        polygon: polygon.map((v) => ({ x: v.x, z: v.z })),
        area: room.computed?.area ?? 0,
        perimeter: room.computed?.perimeter ?? 0,
        centroid: room.computed?.centroid ?? { x: 0, z: 0 },
        boundingBox: room.computed?.boundingBox ?? { minX: 0, minZ: 0, maxX: 0, maxZ: 0 },
      });
    }
    return out;
  };
}

/**
 * R5 — the production report surface, wired as the executor's sink. Builds the DOM view
 * (which touches `document` at construction, hence a factory and not a module singleton)
 * and returns BOTH, so the caller can hide/inspect the panel.
 *
 * ALL THREE consequence arms are routed through `showConsequence`: a reconciled report
 * renders predicted-vs-actual, and the stale / plan-less arms render the TYPED ABSENCE of
 * a prediction rather than an empty panel (STR-06 §2 / ADR-0322 §5 at the last mile).
 */
export function createConsequenceExecutionServiceWithReportView(
  bus: ConsequenceDispatcher,
): { service: ConsequenceExecutionService; view: ConsequenceReportView } {
  const view = new ConsequenceReportView();
  const service = createConsequenceExecutionService(bus, (c) => view.showConsequence(c));
  return { service, view };
}
