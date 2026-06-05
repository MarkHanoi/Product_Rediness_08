// A.21.a — Casa Unifamiliar Stage 7 (bim-emit) — BRIDGE handler.
//
// Returns a single placeholder command the editor's typology bridge handler
// intercepts (`typology.casa-unifamiliar.bridge`) and forwards to the legacy
// layout-execute path. The real multi-storey emitter — per-storey level-stamped
// command sets + `AddLevelCommand` for each upper floor + `CreateStairCommand`
// per level pair (with the auto stairwell void) + slab replication — ships in
// A.21.e–A.21.g.
//
// Per [C50 §1.10] the pipeline does NOT call commandBus.execute — it returns
// commands; the L5 dispatch caller feeds them to runBatch().
//
// See docs/03-execution/specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md §7.

import type { BimEmitStage, EmittedCommand } from '@pryzm/typology-pipeline';

export const casaUnifamiliarBimEmitStage: BimEmitStage = ({ plan }) => {
    const bridge: EmittedCommand = {
        type: 'typology.casa-unifamiliar.bridge',
        payload: {
            note: 'A.21.a bridge — delegate to legacy layout-execute (single-storey stopgap until A.21.e)',
            plan,
        },
    };
    return { ok: true, artifact: [bridge] };
};
