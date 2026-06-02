// A.4.a (Phase A · Sprint 2) — Apartment Stage 4 (generative) — BRIDGE handler.
//
// Returns a pipeline-compliant `GeneratedPlan` marked with `kind: 'bridge'`.
// The plan payload describes the BRIDGE intent — the L5 dispatch caller
// (apps/editor) sees `engine === 'ai-workflow'` (per the bridge selection)
// and routes through the EXISTING `@pryzm/ai-host` `apartment-layout-generate`
// workflow until A.4.b moves the actual generation logic into this package.
//
// Per [C50 §1.11] the engine choice is deterministic:
//   - `preferDeterministic === true` → deterministic stub
//   - else → ai-workflow stub
//
// Strategic context: master-execution-tracker.md A.4 (refactor apartment as TypologyPack).
// The full code migration of D-TGL / D-FLE / D-CE / D-LE / validators /
// cognition evaluators / command emitters from `@pryzm/ai-host` happens
// in A.4.b-A.4.x.

import { selectEngine, type GenerativeStage } from '@pryzm/typology-pipeline';

export const apartmentGenerativeStage: GenerativeStage = (input, ctx) => {
    const engine = selectEngine(ctx.manifest, ctx.input);
    return {
        ok: true,
        artifact: {
            engine,
            payload: {
                kind: 'apartment-bridge',
                version: ctx.manifest.version,
                // The bridge does not actually generate a plan — it signals
                // the dispatch caller to delegate to the existing
                // `@pryzm/ai-host` workflow. A.4.b replaces this stub with
                // a real generator that produces the same `GenerateLayoutResult`
                // shape the old workflow returned.
                delegateTo:
                    engine === 'ai-workflow'
                        ? 'apartment-layout-generate'
                        : 'apartment-layout-deterministic',
                brief: input.brief.raw,
                site: input.site.snapshot,
            },
        },
    };
};
