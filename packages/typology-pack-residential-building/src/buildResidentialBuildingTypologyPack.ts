// Residential building (multi-family) — Slice 0 / Tracker P1.A — pack factory.
//
// The single export `composeRuntime()` calls to register the residential-building
// pack into the runtime's `TypologyRegistry`. Returns a `RegisteredTypologyPack`
// with the validated manifest + the bridge stage handlers:
//
//   runtime.typology.registry.register(buildResidentialBuildingTypologyPack());
//
// GATING: composeRuntime registers this behind a default-OFF flag until the
// orchestrator slices are browser-validated (so production is byte-identical and
// the pack does not appear in the picker prematurely). See the composeRuntime call.
//
// Strategic context: docs/03-execution/plans/RESIDENTIAL-BUILDING-IMPLEMENTATION-TRACKER.md P1.A.

import type { RegisteredTypologyPack } from '@pryzm/typology-pipeline';
import { RESIDENTIAL_BUILDING_MANIFEST } from './manifest.js';
import { residentialBuildingGenerativeStage } from './stages/generative.js';
import { residentialBuildingBimEmitStage } from './stages/bimEmission.js';

/**
 * Construct the residential-building typology pack. Pure — no I/O, no global state.
 * Safe to call repeatedly (each call returns a fresh object referencing the shared
 * static manifest).
 *
 * The stages bundle ships bridge handlers (generative + bimEmit); all other stages
 * use the pipeline defaults. The real building orchestrator + command emitter
 * replace the bridges in later slices.
 */
export function buildResidentialBuildingTypologyPack(): RegisteredTypologyPack {
    return {
        manifest: RESIDENTIAL_BUILDING_MANIFEST,
        stages: {
            generative: residentialBuildingGenerativeStage,
            bimEmit: residentialBuildingBimEmitStage,
        },
    };
}
