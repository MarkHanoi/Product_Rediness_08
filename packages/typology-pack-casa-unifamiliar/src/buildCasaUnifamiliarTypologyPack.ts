// A.21.a — Casa Unifamiliar pack factory.
//
// The single export `composeRuntime()` calls to register the house pack into the
// runtime's `TypologyRegistry`. Returns a `RegisteredTypologyPack` with the
// validated manifest + the bridge stage handlers.
//
//   runtime.typology.registry.register(buildCasaUnifamiliarTypologyPack());
//
// Once registered, the typology appears in the TypologyPicker (registry-driven)
// and the RAC chatbot's `parseTypologyIdFromText` (data-driven off listIds()).
//
// Strategic context: docs/03-execution/plans/master-execution-tracker.md A.21.a.

import type { RegisteredTypologyPack } from '@pryzm/typology-pipeline';
import { CASA_UNIFAMILIAR_MANIFEST } from './manifest.js';
import { casaUnifamiliarGenerativeStage } from './stages/generative.js';
import { casaUnifamiliarBimEmitStage } from './stages/bimEmission.js';

/**
 * Construct the Casa Unifamiliar typology pack. Pure — no I/O, no global state.
 * Safe to call repeatedly (each call returns a fresh object referencing the
 * shared static manifest).
 *
 * The stages bundle ships bridge handlers (generative + bimEmit); all other
 * stages use the pipeline defaults. The real multi-storey generator + command
 * emitter replace the bridges in A.21.c–A.21.x.
 */
export function buildCasaUnifamiliarTypologyPack(): RegisteredTypologyPack {
    return {
        manifest: CASA_UNIFAMILIAR_MANIFEST,
        stages: {
            generative: casaUnifamiliarGenerativeStage,
            bimEmit: casaUnifamiliarBimEmitStage,
        },
    };
}
