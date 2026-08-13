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

import type { PredictedGeometry, MetricTransition } from '@pryzm/command-bus';
import {
  buildPlanningContext,
  createConsequencePlanners,
} from './consequencePreviewServiceComposition.js';
import {
  ConsequenceExecutionService,
  type ConsequenceDispatcher,
  type ConsequenceSink,
  type RoomGeometryReader,
  type MetricReader,
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
  return new ConsequenceExecutionService({
    bus,
    // The SHARED registry (preview + execute + confirm register identically — one factory,
    // so a family cannot be reachable on one surface and missing on another). Carries
    // `wall.move` AND, since 2026-08-13, the Phase 6c `wall.create` planner.
    planners: createConsequencePlanners(),
    context: buildPlanningContext,
    // SAFE MODE ROOM RESHAPE — preview and execution now share ONE algorithm.
    applyPredictedRoomGeometry: createPredictedRoomGeometryApplier(),
    redetectSuppressor: liveRedetectSuppressor(),
    readRoomGeometry: createRoomGeometryReader(),
    // R5 — the METRIC arm of the independent read-back. Composed from the same
    // authoritative room store the geometry reader uses, so the report can put a
    // MEASURED area beside the predicted one. Without it the report would carry a
    // typed `metricsUndetermined` — honest, but a capability gap this runtime does
    // not actually have.
    readMetrics: createMetricReader(),
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
 * R5 — INDEPENDENT read-back of the metrics the plan predicted, straight off the
 * authoritative room store. Same discipline as {@link createRoomGeometryReader}
 * and for the same reason: it never consults the plan's own numbers, because a
 * reader that echoed the prediction back would report perfect agreement no matter
 * what was committed.
 *
 * ONLY the pairs it can actually measure are returned. A predicted metric whose
 * element the store does not hold, or whose quantity this reader has no source
 * for, is OMITTED rather than defaulted to zero or to the predicted value — the
 * service leaves such a pair without a `measured …` line instead of inventing
 * agreement. Omission here is the small, local version of the same rule the
 * service applies globally: never manufacture a determination you did not make.
 *
 * Scope today is deliberately narrow — room `area` and `perimeter`, the two
 * quantities `room.computed` actually holds. Wall/opening metrics have no
 * equivalent authoritative source yet; when the plan predicts one, this reader
 * omits it and the renderer simply shows the prediction unverified. Widening the
 * scope is additive and needs no contract change.
 */
export function createMetricReader(): MetricReader {
  return (predicted) => {
    const store = storeRegistry.getStoreForType('room');
    if (!store) return [];
    const out: MetricTransition[] = [];
    for (const p of predicted) {
      if (p.metric !== 'area' && p.metric !== 'perimeter') continue;
      const room = store.getById?.(p.elementId) as {
        computed?: { area?: number; perimeter?: number };
      } | null | undefined;
      const measured = p.metric === 'area' ? room?.computed?.area : room?.computed?.perimeter;
      if (typeof measured !== 'number' || !Number.isFinite(measured)) continue;
      // `before` and `unit` are carried from the PREDICTION verbatim — they describe
      // the same question; only `after` is the newly measured fact.
      out.push({ ...p, after: measured });
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
