// Office building — Stage 7 (BIM emit) BRIDGE.
//
// Returns a single placeholder command the editor's typology bridge handler
// intercepts (`typology.office-building.bridge`). The real per-floor emitter (the
// circular shell + slabs + zone room-bounding lines + core) is owned by the editor
// office-building executor (apps/editor/src/ui/office-building/).
//
// Per C50 §1.10 the pipeline does NOT call commandBus.execute — it returns commands;
// the L5 dispatch caller feeds them to runBatch().

import type { BimEmitStage, EmittedCommand } from '@pryzm/typology-pipeline';

export const officeBuildingBimEmitStage: BimEmitStage = ({ plan }) => {
    const bridge: EmittedCommand = {
        type: 'typology.office-building.bridge',
        payload: {
            note: 'Office tower scaffold — per-floor circular plate emitted by the editor executor (GATED default-OFF)',
            plan,
        },
    };
    return { ok: true, artifact: [bridge] };
};
