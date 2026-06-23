// Residential building (multi-family) — Slice 0 / Tracker P1.A — Stage 7 BRIDGE.
//
// Returns a single placeholder command the editor's typology bridge handler will
// intercept (`typology.residential-building.bridge`) once the orchestrator ships.
// The real multi-level emitter — per-level level-stamped command sets + AddLevel
// per floor + the centred stair/lift core + per-level corridor walls + per-apartment
// D-TGL command sets + ground-floor curtain-wall shopfronts — lands in later slices.
//
// Per C50 §1.10 the pipeline does NOT call commandBus.execute — it returns commands;
// the L5 dispatch caller feeds them to runBatch().
//
// See docs/03-execution/plans/RESIDENTIAL-BUILDING-MULTI-FAMILY-AUDIT-AND-PLAN.md §12.

import type { BimEmitStage, EmittedCommand } from '@pryzm/typology-pipeline';

export const residentialBuildingBimEmitStage: BimEmitStage = ({ plan }) => {
    const bridge: EmittedCommand = {
        type: 'typology.residential-building.bridge',
        payload: {
            note: 'Slice 0 scaffold — orchestrator + executor land in later slices (GATED default-OFF)',
            plan,
        },
    };
    return { ok: true, artifact: [bridge] };
};
