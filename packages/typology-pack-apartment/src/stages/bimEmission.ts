// A.4.a (Phase A · Sprint 2) — Apartment Stage 7 (bim-emit) — BRIDGE handler.
//
// The bridge does not emit commands directly — it signals the dispatch
// caller (apps/editor) that the plan is a bridge intent and the existing
// `apartment.layout-execute` legacy path should fire instead.
//
// A.4.b replaces this with a real emitter that maps the generated plan to:
//   - wall.batch.create (the apartment shell + interior walls)
//   - wall.createOpening (door + window openings)
//   - door.batch.create
//   - window.batch.create
//   - slab.batch.create (floor + ceiling slabs)
//
// Per [C50 §1.10] the pipeline does NOT call commandBus.execute — it
// returns commands; the L5 dispatch caller feeds them to runBatch().

import type { BimEmitStage, EmittedCommand } from '@pryzm/typology-pipeline';

export const apartmentBimEmitStage: BimEmitStage = ({ plan }) => {
    // Until A.4.b, return a single placeholder command the editor's
    // bridge handler intercepts and forwards to the legacy path. Real
    // commands ship when A.4.b moves buildLayoutCommands into this package.
    const bridge: EmittedCommand = {
        type: 'typology.apartment.bridge',
        payload: {
            note: 'A.4.a bridge — delegate to legacy apartment-layout-execute',
            plan,
        },
    };
    return { ok: true, artifact: [bridge] };
};
