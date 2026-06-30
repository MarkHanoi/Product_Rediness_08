// Office building — pack factory. The single export `composeRuntime()` calls to
// register the office-building pack into the runtime's `TypologyRegistry`:
//
//   runtime.typology.registry.register(buildOfficeBuildingTypologyPack());
//
// GATING: composeRuntime registers this behind a default-OFF flag
// (`__PRYZM_OFFICE_BUILDING__`) until browser-validated, so production is byte-
// identical and the pack does not appear in the picker prematurely.

import type { RegisteredTypologyPack } from '@pryzm/typology-pipeline';
import { OFFICE_BUILDING_MANIFEST } from './manifest.js';
import { officeBuildingGenerativeStage } from './stages/generative.js';
import { officeBuildingBimEmitStage } from './stages/bimEmission.js';

/**
 * Construct the office-building typology pack. Pure — no I/O, no global state. Safe
 * to call repeatedly (each call returns a fresh object referencing the shared static
 * manifest). The stages bundle ships bridge handlers; all other stages use the
 * pipeline defaults. The editor office-building executor builds the real geometry.
 */
export function buildOfficeBuildingTypologyPack(): RegisteredTypologyPack {
    return {
        manifest: OFFICE_BUILDING_MANIFEST,
        stages: {
            generative: officeBuildingGenerativeStage,
            bimEmit: officeBuildingBimEmitStage,
        },
    };
}
