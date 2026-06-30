// Office building — Stage 4 (generative) BRIDGE.
//
// Returns a pipeline-compliant `GeneratedPlan`. The full per-floor circular-plate
// orchestration runs in the editor office-building controller (apps/editor); this
// stage validates the office input model and echoes it forward so selecting "Office
// Building" in the picker dispatches cleanly end-to-end.
//
// Per C50 §1.7 a stage handler MUST NOT throw for "I can't do it" cases — it returns
// `{ ok: false, reason }`.

import { selectEngine, type GenerativeStage } from '@pryzm/typology-pipeline';
import { parseOfficeBuildingInput } from '../inputModel.js';

export const officeBuildingGenerativeStage: GenerativeStage = (input, ctx) => {
    let parsed;
    try {
        parsed = parseOfficeBuildingInput(input.brief.raw.metadata);
    } catch (err) {
        return {
            ok: false,
            stage: 'generative',
            reason:
                err instanceof Error
                    ? `office-building input invalid: ${err.message}`
                    : 'office-building input invalid',
        };
    }

    const engine = selectEngine(ctx.manifest, ctx.input);
    return {
        ok: true,
        artifact: {
            engine,
            payload: {
                kind: 'office-building-bridge',
                version: ctx.manifest.version,
                delegateTo: 'office-building-orchestrator',
                buildingInput: parsed,
                site: input.site.snapshot,
            },
        },
    };
};
