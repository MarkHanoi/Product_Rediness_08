// A.21.a — Casa Unifamiliar Stage 4 (generative) — BRIDGE handler.
//
// Returns a pipeline-compliant `GeneratedPlan`. Until the multi-storey house
// generator ships (A.21.c–A.21.f: storey orchestrator + per-storey D-TGL + stair
// auto-placement), this is a BRIDGE that delegates to the EXISTING single-plate
// apartment generator as a documented SINGLE-STOREY STOPGAP — so selecting "Casa
// Unifamiliar" in the picker produces a valid ground-floor layout end-to-end the
// moment the editor onboarding gate accepts the typology (A.21.j), rather than a
// dead "coming soon". The `stopgap` flag + `floors` echo let the editor/UX flag
// that upper storeys + the stair are not yet generated.
//
// Per [C50 §1.11] the engine choice is deterministic (preferDeterministic).
//
// See docs/03-execution/specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md §6.

import { selectEngine, type GenerativeStage } from '@pryzm/typology-pipeline';

export const casaUnifamiliarGenerativeStage: GenerativeStage = (input, ctx) => {
    const engine = selectEngine(ctx.manifest, ctx.input);
    return {
        ok: true,
        artifact: {
            engine,
            payload: {
                kind: 'casa-unifamiliar-bridge',
                version: ctx.manifest.version,
                // SINGLE-STOREY STOPGAP: delegate to the apartment generator until
                // the multi-storey house generator (A.21.c) owns this stage. The
                // editor bridge handler routes this to the existing layout path.
                // The brief (incl. `floors`) is forwarded raw for the consumer.
                delegateTo:
                    engine === 'ai-workflow'
                        ? 'apartment-layout-generate'
                        : 'apartment-layout-deterministic',
                stopgap: 'single-storey (multi-storey + stairs land in A.21.c–A.21.f)',
                brief: input.brief.raw,
                site: input.site.snapshot,
            },
        },
    };
};
