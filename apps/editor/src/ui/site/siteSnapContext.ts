// §L-432 — the SITE SNAP CONTEXT: parcel boundary + buildable-envelope rings, published for
// the L1 snapping package.
//
// WHY A PUBLISHED READER RATHER THAN A DIRECT IMPORT
// --------------------------------------------------
// `packages/snapping` is L1. It may not import the site store, `@pryzm/site-parcel-data` (L2),
// or anything under `apps/` — so it cannot read this itself. The app layer owns the read and
// exposes it as a callback, exactly as the slab-corner reference already does. The provider
// stays pure geometry over a data source it knows nothing about.
//
// ONE SOURCE, TWO CONSUMERS: the Canvas2D plan pane (L-431 site linework + the L-430 north
// arrow) and the snap provider both read through here. Keeping it in one place is not tidiness
// — it is what stops the pane drawing a setback line in one place while the snap fires in
// another, which would be a maddening bug to chase and trivial to introduce with two readers.

import { getLastBuildableEnvelope } from './siteDispatch';

/** A ring in world XZ metres. Mirrors `SiteSnapContext` in @pryzm/snapping (L1, no import). */
export interface SiteContextRings {
    readonly parcelRing: ReadonlyArray<{ x: number; z: number }> | null;
    readonly envelopeRing: ReadonlyArray<{ x: number; z: number }> | null;
    /** θ (project→true north, radians) — consumed by the plan north arrow (C34 §1.4). */
    readonly projectNorthRad: number;
}

/**
 * Read the current site context: the committed parcel ring, the buildable-envelope INSET ring
 * (the setback line) and θ. Read fresh on every call — a newly committed parcel or a
 * recomputed envelope must become snappable immediately, without re-registration.
 *
 * Fully guarded: any failure yields `null` rather than throwing into a draw interaction.
 */
export function readSiteContextRings(): SiteContextRings | null {
    try {
        const store = (window.runtime as unknown as {
            siteModelStore?: {
                getParcelBoundary?: () => { polygon?: ReadonlyArray<{ x: number; z: number }> } | null;
                getLocation?: () => { trueNorth?: number } | null;
            };
        } | undefined)?.siteModelStore;

        const parcel = store?.getParcelBoundary?.()?.polygon ?? null;
        const env = getLastBuildableEnvelope();
        const envelopeRing = env && env.status === 'ok' && env.insetPolygon.length >= 3
            ? env.insetPolygon.map((pt) => ({ x: pt.x, z: pt.z }))
            : null;

        const rawTheta = store?.getLocation?.()?.trueNorth;
        const projectNorthRad = typeof rawTheta === 'number' && Number.isFinite(rawTheta) ? rawTheta : 0;

        // A context is worth returning when there is ANYTHING to convey. θ alone counts: an
        // underlay-defined project north can exist before a parcel is committed, and bailing
        // out would silently leave the north arrow at 0 — pointing at project north while
        // labelling itself true north.
        if (!parcel && !envelopeRing && projectNorthRad === 0) return null;

        return {
            parcelRing: parcel && parcel.length >= 3 ? parcel : null,
            envelopeRing,
            projectNorthRad,
        };
    } catch {
        return null;
    }
}

/**
 * Publish {@link readSiteContextRings} for `SnapManager.createWithDefaults`, which picks it up
 * lazily via `window.__pryzmSiteSnapContext`.
 *
 * WHY A GLOBAL: the snap managers are constructed deep inside the tools (WallTool, BeamTool,
 * HandrailTool…), each forwarding only the stores it happens to know about — WallTool passes
 * just `{ gridStore }`. Threading a site reader through every one of those constructors would
 * touch a dozen call sites and still miss any tool added later, which is precisely where a
 * user draws walls. The same lazy-global pattern is already the accepted approach here for the
 * slab-corner reference (`window.slabStore`).
 *
 * Idempotent — safe to call on every project open.
 */
export function installSiteSnapContext(): void {
    try {
        (window as unknown as { __pryzmSiteSnapContext?: () => SiteContextRings | null })
            .__pryzmSiteSnapContext = readSiteContextRings;
        console.log(
            '[site] §L-432 site-context snap reader published — parcel boundary + buildable-envelope '
            + 'setback line are now snap targets for hand-drawn elements.',
        );
    } catch (e) {
        // Never fatal: without it, snapping simply offers no site candidates.
        console.warn('[site] §L-432 failed to publish the site-context snap reader (advisory):', e);
    }
}
