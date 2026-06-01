// A.1 (Phase A · Sprint 1) — Stage 4 helpers: generative.
//
// Stage 4 is the heart of the pipeline — it produces a `GeneratedPlan`
// from the brief + site + constraints.  Every typology pack ships its own
// Stage 4 handler: AI workflow (calls @pryzm/ai-host) OR deterministic
// engine (calls its embedded layout engine, eg D-TGL for the apartment
// pack).
//
// This file ships the policy decision: AI-vs-deterministic.  The Stage 4
// handler each pack composes calls `selectEngine()` first, then dispatches
// to the chosen branch.

import type { TypologyManifest } from '@pryzm/schemas';
import type { PipelineInput } from '../types.js';

/**
 * Decide which branch of Stage 4 to run for a given dispatch.  The pack
 * MAY ship both an AI workflow and a deterministic engine; the runtime
 * picks one per:
 *
 *   1. If `input.preferDeterministic === true` AND the pack ships a
 *      deterministic engine → use deterministic.
 *   2. Else if the pack ships an AI workflow → use AI workflow.
 *   3. Else if the pack ships a deterministic engine → use deterministic.
 *   4. Else throw (the manifest should have failed `manifestHasEntry()`
 *      validation, so reaching this branch is a programmer error).
 *
 * Per typology-expansion-roadmap §6.3.
 */
export function selectEngine(
    manifest: TypologyManifest,
    input: PipelineInput,
): 'ai-workflow' | 'deterministic' {
    const hasAi = Boolean(manifest.aiWorkflowEntry);
    const hasDet = Boolean(manifest.deterministicEngineEntry);
    if (input.preferDeterministic && hasDet) return 'deterministic';
    if (hasAi) return 'ai-workflow';
    if (hasDet) return 'deterministic';
    throw new Error(
        `Typology '${manifest.id}' ships neither aiWorkflowEntry nor ` +
            `deterministicEngineEntry — manifestHasEntry() should have rejected it.`,
    );
}
