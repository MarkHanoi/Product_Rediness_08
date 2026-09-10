// liveBuildingSubstrate — ONE read of the containment authority AND the envelope
// geometry that routes elements on a storey several blocks share, for every L7
// surface that asks "which building is this element in".
//
// ADR-0385 §2 / §4 · applies ADR-0328 · C84 EI-9 · §CONTEXT-DATA-HONESTY (L-581 / L-616).
//
// ⛔ THIS FILE CONTAINS NO RULE. `readBuildingSubstrate` in `@pryzm/core-app-model`
// decides how the two reads combine and `resolveElementBuilding` decides where an
// element goes. What lives here is the one thing L2 cannot see: the composed
// runtime's envelope store (`runtime.stores.spaceEnvelope`, C114 §2), read exactly
// the way `initTools.ts` reads it for the projection and `ExportIFC.ts` reads it
// for the exporter. A second L7 copy of that lookup is how the PRYZM tree and the
// IFC file would come to route the same wall differently.

import {
    hierarchyStore,
    readBuildingSubstrate,
    type BuildingSubstrate,
} from '@pryzm/core-app-model';

/**
 * The envelope records the live runtime holds, or `null`.
 *
 * ⛔ `null`, never `[]`, when the runtime or its envelope slot is unreachable or
 * throws. At L7 in production the slot exists whenever the runtime does, so its
 * absence is a FAILURE to read — and `readBuildingSubstrate` then reports every
 * element on a fanned storey as unrouted WITH that reason, rather than treating
 * a missing store as a project with no envelopes.
 */
export function liveEnvelopeRecords(): Iterable<unknown> | null {
    try {
        const slot = (window as unknown as {
            runtime?: { stores?: { spaceEnvelope?: unknown } };
        }).runtime?.stores?.spaceEnvelope;
        if (!slot || typeof (slot as { getState?: unknown }).getState !== 'function') return null;
        return [...(slot as { getState(): ReadonlyMap<string, unknown> }).getState().values()];
    } catch {
        return null;
    }
}

/** The substrate every L7 consumer should read: hierarchy store + live envelope geometry. */
export function readLiveBuildingSubstrate(): BuildingSubstrate {
    return readBuildingSubstrate(hierarchyStore, liveEnvelopeRecords());
}
