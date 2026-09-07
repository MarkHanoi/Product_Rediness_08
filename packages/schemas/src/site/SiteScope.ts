// §SITE-SCOPE (L-645 re-opened 2026-09-07, founder: "I want to have a slide of the scope on 3D Site
// view — like cityweft does — basically we have a scope — could be circular or rectangular — and
// then we crop everything — absolutely everything — but within the scope should be sound — really
// detailed and completed.") — the PERSISTED site scope: the one value every 3D-Site context layer
// reads for "how far out do we load, draw and cut".
//
// ⭐ ONE VALUE, ONE OWNER. Before this schema the 3D-Site had five radial limits in five modules
// (L-13058: near cap ~600 m · far tier ~1225 m · trees ~891 m · street life ~890 m · footprint
// read), and the retired §CTX-EARTH-SLAB cut a SIXTH disc of its own. The scope IS the extent: the
// slider the founder asked for and the radii the loaders use are the same axis, so the value lives
// here (L0, pure Zod, persisted on `SiteModel.scope`) and every consumer derives from it. The
// runtime projection the loaders read (`SiteContextScope` in
// `apps/editor/src/ui/geospatial/contextExtentBudget.ts`, lane CONTEXT-EXTENT-2X) uses EXACTLY this
// field vocabulary so that a stored scope is passed to `CesiumViewport.setContextScope` unchanged —
// no adapter, no second shape. Governed by C12 §13 (ADR-0382).
//
// FRAME. The scope is centred on the SITE FRAME ORIGIN (`resolveSiteFrameOrigin`, C12 §9 — the one
// origin, never a re-read geocode) and expressed in the PROJECT frame (scene-XZ): a `rectangle`'s
// `halfWidthM` runs along scene +X (project east) and `halfDepthM` along scene Z (project north/
// south), so it stays aligned with the parcel's dominant edge — the frame walls are orthogonal in —
// and is rotated onto true north by the site's θ exactly once, at the frame boundary
// (`sceneXZToEnu`, C12 §9 clause 2). At θ = 0 (every un-rotated site) that is literally E–W / N–S.
// There is deliberately NO centre field and NO rotation field: both would be a second authority for
// a fact the SiteFrame already owns.
//
// BOUNDS. These are SANITY bounds for a persisted value (a scope must be a positive, finite, city-
// scale distance), NOT the product's slider range. The slider range (150 m … 1781 m today) is a
// MEASURED tile-fan-out fact that moves when the bake or the fan-out cap moves, so it lives beside
// that measurement (`CTX_SCOPE_MIN_RADIUS_M` / `CTX_SCOPE_MAX_RADIUS_M`) and is applied by the
// editor's `clampSiteScope`, never re-stated here. A stored value outside the slider range is still
// a VALID file — it is clamped on read and the product says so — because a schema that rejected a
// file the moment a ceiling was re-measured would turn a tuning change into data loss (C47).
//
// `null` on `SiteModel.scope` means "no scope authored" — the render resolves the product default
// at read time (`resolveSiteScope`). It is never persisted as a number, so a later change to the
// default reaches every project that never chose one.

import { z } from 'zod';

/** A persisted scope may not be smaller than this (metres). A plot-tight slab still needs room. */
export const SITE_SCOPE_SANITY_MIN_M = 10;
/** A persisted scope may not be larger than this (metres). 10 km is past any city-scale context. */
export const SITE_SCOPE_SANITY_MAX_M = 10_000;

const scopeMetres = z
    .number()
    .finite()
    .min(SITE_SCOPE_SANITY_MIN_M)
    .max(SITE_SCOPE_SANITY_MAX_M);

export const SiteScopeShapeSchema = z.enum(['circle', 'rectangle']);
export type SiteScopeShape = z.infer<typeof SiteScopeShapeSchema>;

/**
 * The scope value. A discriminated union so a `circle` cannot carry stale half-extents and a
 * `rectangle` cannot carry a stale radius — each branch holds exactly the numbers that define it.
 */
export const SiteScopeSchema = z.discriminatedUnion('shape', [
    z.object({
        shape: z.literal('circle'),
        /** Disc radius, metres, about the site frame origin. */
        radiusM: scopeMetres,
    }),
    z.object({
        shape: z.literal('rectangle'),
        /** Half-extent along scene +X (project east), metres. */
        halfWidthM: scopeMetres,
        /** Half-extent along scene Z (project north/south), metres. */
        halfDepthM: scopeMetres,
    }),
]);
export type SiteScope = z.infer<typeof SiteScopeSchema>;
