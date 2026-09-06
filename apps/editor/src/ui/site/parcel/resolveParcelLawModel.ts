// §PARCEL-LAW-MODEL (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.11 clause 1 · C06 §13.3 ·
// C19 §5.6 · C58 §1.4) — THE READER that turns this session's stores into the ONE
// `ParcelLawModel`.
//
// `parcelLawModel.ts` is PURE and takes everything as arguments, which is what makes it
// testable and what stops it acquiring a second store read path. This file is the other
// half: the ONE place the two inputs are resolved, so a surface never has to decide for
// itself which envelope is current or how to reach the committed ring.
//
// ── THE THREE RESOLUTIONS IT INHERITS RATHER THAN RESTATES ─────────────────────────────
//
//  1. **Which envelope is current.** `refreshEnvelopePanel` established the rule and it is
//     mirrored here exactly: the SESSION-solved envelope wins when present, because it IS
//     this session's answer; otherwise the FULL determination persisted at parcel-commit
//     time is hydrated and its date is carried through as `determinedAtIso`, so a stored
//     snapshot can never be presented as freshly derived (C58 §1.4). A `status: 'none'`
//     that carries a REFUSAL is a real answer and is NOT replaced by the stored one
//     (§L-574) — a refusal rendered as an empty card is the L-553 failure.
//  2. **Which store.** The caller's runtime first, then the ambient `window.runtime`,
//     taking the first that actually exists — the §L-545 resolution `mountParcelSection`
//     and `buildParcelRailPanel` both had to learn: the store is a PER-RUNTIME instance
//     and the ambient one is not always the one the caller holds.
//  3. **Which cadastral view-model.** `parcelProvenanceToCardModel` — the ONE adapter
//     (§L-1581). This file does not build a second one and does not read `provenance`
//     field by field.
//
// ⛔ NOT IMPORTED BY `parcelRailPanel.ts`, deliberately. That panel's own spec asserts it
// imports no envelope reader (`parcelRailPanel.spec.ts`: *"⛔ NEVER re-derives"*), and the
// rail keeps its route by hosting the SINGLETON card — which now renders from this model
// via `GISAreaLayout`. The rail therefore agrees with the tab by construction, without
// gaining a second reader. See §25.11 clause 4.
//
// Throw-safe by construction: every arm returns a MODEL, never an exception. "No site yet"
// is a normal render-path case, and a surface that cannot build is a surface the founder
// cannot open.

import { trace } from '@opentelemetry/api';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { BuildableEnvelope, SiteModel } from '@pryzm/schemas';
import {
    getLastBuildableEnvelope,
    resolveStoredBuildableDetermination,
} from '../siteDispatch.js';
import { parcelProvenanceToCardModel } from './parcelCard.js';
import {
    buildParcelLawModel,
    type ParcelLawIdentityAbsence,
    type ParcelLawModel,
} from './parcelLawModel.js';

const _tracer = trace.getTracer('pryzm.site.resolveParcelLawModel');

/** The minimal store surface this reader needs. Structural — a test needs no runtime. */
interface SiteStoreLike {
    getSite(): SiteModel | null;
}

/** Injectable so a spec drives the reader with plain objects instead of module stubs. */
export interface ParcelLawModelDeps {
    /** Production: `getLastBuildableEnvelope` — this session's solved envelope, or null. */
    readonly readLiveEnvelope: () => BuildableEnvelope | null;
    /** Production: `resolveStoredBuildableDetermination` — the dated, persisted record. */
    readonly readStoredDetermination: (
        runtime: PryzmRuntime | null | undefined,
    ) => { readonly envelope: BuildableEnvelope; readonly determinedAtIso: string } | null;
}

/** The production wiring. Resolved when CALLED, so a runtime composed after boot is seen. */
export function defaultParcelLawModelDeps(): ParcelLawModelDeps {
    return {
        readLiveEnvelope: getLastBuildableEnvelope,
        readStoredDetermination: (rt) => resolveStoredBuildableDetermination(rt ?? null),
    };
}

function resolveSiteStore(runtime: PryzmRuntime | null | undefined): SiteStoreLike | null {
    const fromArg = (runtime as unknown as { siteModelStore?: SiteStoreLike } | null | undefined)
        ?.siteModelStore;
    if (fromArg && typeof fromArg.getSite === 'function') return fromArg;
    const ambient = typeof window !== 'undefined'
        ? (window as unknown as { runtime?: { siteModelStore?: SiteStoreLike } }).runtime?.siteModelStore
        : undefined;
    return ambient && typeof ambient.getSite === 'function' ? ambient : null;
}

/** §L-574 — a `'none'` WITHOUT a refusal is "nothing to say"; with one it is an ANSWER. */
function isNoneWithoutRefusal(e: BuildableEnvelope | null): boolean {
    return e !== null && e.status === 'none' && !e.refusal;
}

/**
 * §PARCEL-LAW-MODEL — resolve the model for whatever this session currently holds.
 *
 * Never throws: the catch arm returns the fully-absent model, which every renderer already
 * has to handle (it is the state of every project before a plot is selected).
 */
export function resolveParcelLawModel(
    runtime: PryzmRuntime | null | undefined,
    deps: ParcelLawModelDeps = defaultParcelLawModelDeps(),
): ParcelLawModel {
    const span = _tracer.startSpan('pryzm.site.resolveParcelLawModel');
    try {
        const site = resolveSiteStore(runtime)?.getSite() ?? null;
        const polygon = site?.parcel?.boundary?.polygon ?? null;
        const hasBoundary = Array.isArray(polygon) && polygon.length >= 3;
        const provenance = site?.parcel?.provenance ?? null;

        // The THREE identity states `buildParcelSectionBody` distinguishes, carried as a
        // VALUE rather than re-decided by each renderer (§L-1582). State 2 — a real ring
        // whose attribution was never recorded — is the state every pre-§L-1580 project is
        // in, and it must never render as a blank card or as zeros (C84 EI-1b).
        const identityAbsence: ParcelLawIdentityAbsence = !hasBoundary
            ? 'no-boundary'
            : provenance === null
            ? 'provenance-not-recorded'
            : 'none';

        const live = deps.readLiveEnvelope();
        const hydrated = !live || isNoneWithoutRefusal(live)
            ? deps.readStoredDetermination(runtime)
            : null;
        const envelope = hydrated ? hydrated.envelope : live;

        const model = buildParcelLawModel({
            parcelRing: hasBoundary ? polygon : null,
            // UNDEFAULTED — `?? []` would report "examined, landlocked" about a parcel
            // nobody measured (`parcelEdgeClassificationDetermination.ts`).
            edgeClassifications: site?.parcel?.boundary?.edgeClassifications,
            identity: provenance ? parcelProvenanceToCardModel(provenance, site?.parcel?.area) : null,
            identityAbsence,
            committedAreaM2:
                typeof site?.parcel?.area === 'number' && Number.isFinite(site.parcel.area)
                    ? site.parcel.area
                    : null,
            // §L-574 — a bare `'none'` is not an envelope; a `'none'` with a refusal is.
            envelope: isNoneWithoutRefusal(envelope ?? null) ? null : envelope,
            determinedAtIso: hydrated?.determinedAtIso ?? null,
        });
        span.setAttribute('pryzm.parcelLaw.identityAbsence', identityAbsence);
        span.setAttribute('pryzm.parcelLaw.envelopeState', model.envelopeState);
        return model;
    } catch (e) {
        console.warn('[site][parcel-law-model] resolve failed (non-fatal) — reporting the absent model:', e);
        return buildParcelLawModel({
            parcelRing: null,
            edgeClassifications: undefined,
            identity: null,
            identityAbsence: 'no-boundary',
            envelope: null,
        });
    } finally {
        span.end();
    }
}
