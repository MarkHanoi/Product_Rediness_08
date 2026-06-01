// A.4.a (Phase A · Sprint 2) — Apartment pack factory.
//
// The single export used by `composeRuntime()` to register the apartment
// pack into the runtime's `TypologyRegistry`. Returns a
// `RegisteredTypologyPack` with the validated manifest + the bridge
// stage handlers.
//
// `composeRuntime()` calls this once at boot:
//
//   runtime.typology.registry.register(buildApartmentTypologyPack());
//
// Strategic context: docs/03-execution/plans/master-execution-tracker.md A.4.

import type { RegisteredTypologyPack } from '@pryzm/typology-pipeline';
import { APARTMENT_MANIFEST } from './manifest.js';
import { apartmentGenerativeStage } from './stages/generative.js';
import { apartmentBimEmitStage } from './stages/bimEmission.js';

/**
 * Construct the apartment typology pack. Pure — no I/O, no global state.
 * Safe to call repeatedly (each call returns a fresh object referencing
 * the shared static manifest).
 *
 * Returns the C50-compliant pack the typology-pipeline's TypologyRegistry
 * accepts. The stages bundle ships:
 *   - generative: the bridge handler (A.4.b will replace with real D-TGL + AI workflow)
 *   - bimEmit:    the bridge handler (A.4.b will replace with real command emitter)
 *   - all other stages: pipeline defaults (no-ops)
 */
export function buildApartmentTypologyPack(): RegisteredTypologyPack {
    return {
        manifest: APARTMENT_MANIFEST,
        stages: {
            generative: apartmentGenerativeStage,
            bimEmit: apartmentBimEmitStage,
        },
    };
}
