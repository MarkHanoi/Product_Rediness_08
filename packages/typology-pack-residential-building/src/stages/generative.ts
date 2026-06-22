// Residential building (multi-family) — Slice 0 / Tracker P1.A — Stage 4 BRIDGE.
//
// Returns a pipeline-compliant `GeneratedPlan`. Until the building orchestrator
// ships (later slices: level minting + centred core + per-level plate partition +
// corridor spine + per-cell D-TGL), this is a BRIDGE that validates the §5.1 input
// model and echoes it forward as a documented STOPGAP — so selecting "Residential
// Building" in the picker dispatches cleanly end-to-end rather than dead-ending.
//
// Per C50 §1.7 a stage handler MUST NOT throw for "I can't do it" cases — it
// returns `{ ok: false, reason }`. An invalid input combination (min > max, or
// no typology enabled) is exactly such a soft-fail.
//
// See docs/03-execution/plans/RESIDENTIAL-BUILDING-MULTI-FAMILY-AUDIT-AND-PLAN.md §3, §6.

import { selectEngine, type GenerativeStage } from '@pryzm/typology-pipeline';
import { parseResidentialBuildingInput, enabledTypologies } from '../inputModel.js';

export const residentialBuildingGenerativeStage: GenerativeStage = (input, ctx) => {
    // Validate the §5.1 input model from the brief. Soft-fail (C50 §1.7) on bad input.
    let parsed;
    try {
        parsed = parseResidentialBuildingInput(input.brief.raw.metadata);
    } catch (err) {
        return {
            ok: false,
            stage: 'generative',
            reason:
                err instanceof Error
                    ? `residential-building input invalid: ${err.message}`
                    : 'residential-building input invalid',
        };
    }

    const engine = selectEngine(ctx.manifest, ctx.input);
    return {
        ok: true,
        artifact: {
            engine,
            payload: {
                kind: 'residential-building-bridge',
                version: ctx.manifest.version,
                // STOPGAP: the orchestrator (level partition + corridor + per-cell
                // D-TGL) lands in later slices. The editor bridge handler routes
                // this; for now it carries the validated input forward.
                delegateTo: 'residential-building-orchestrator',
                stopgap:
                    'scaffold only (orchestrator + lift-core + commercial + corridor land in later slices, all GATED)',
                buildingInput: parsed,
                enabledTypologies: enabledTypologies(parsed),
                site: input.site.snapshot,
            },
        },
    };
};
