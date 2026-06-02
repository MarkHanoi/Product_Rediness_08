// A.7.e (Phase A · Sprint 2) — Legacy `Project.location` ↔ `SiteLocation`
// adapter.
//
// Per [C19 §8.1 + §8.2] every snapshot loaded from disk is promoted from
// the v1 shape (`Project.location` as source of truth) to the v2 shape
// (Project.site populated; Project.location is a getter delegating to
// `Project.site.location`). The L4 persistence loader calls
// `promoteProjectLocationToSite()` synchronously BEFORE the rest of the
// project hydrates so that store wiring is never asked to choose between
// the two sources of truth.
//
// L0-pure: no I/O, no THREE, no DOM.
//
// Strategic context:
//   - docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md §8
//   - docs/03-execution/plans/master-execution-tracker.md A.7.e

import { SiteLocationSchema, type SiteLocation } from './SiteLocation.js';
import type { Vec3 } from '../base/primitives.js';

/**
 * The legacy `Project.location` shape (mirrors `packages/schemas/src/elements/Project.ts`
 * lines 16-26 verbatim — kept as a separate interface so this adapter has
 * a stable contract independent of future Project schema churn).
 *
 * Fields:
 *   - latitude       WGS84 lat, decimal degrees
 *   - longitude      WGS84 lon, decimal degrees
 *   - elevationAsl   metres above sea level
 *   - trueNorth      radians
 *   - basePoint      Vec3 — scene-space origin
 *
 * Note: the v1 shape did NOT carry CRS / siteAddress / landTitleNumber —
 * those are v2 (C19) additions. Promotion fills them with safe defaults
 * (null) — the legacy snapshot had no PII so this is information-preserving.
 */
export interface LegacyProjectLocation {
    readonly latitude: number;
    readonly longitude: number;
    readonly elevationAsl: number;
    readonly trueNorth: number;
    readonly basePoint: Vec3;
}

/**
 * Promote a legacy `Project.location` to the v2 `SiteLocation` shape.
 *
 * Per [C19 §8.1] this is INFORMATION-PRESERVING — the 5 v1 fields are
 * copied verbatim; the 3 v2-only fields (crs / siteAddress /
 * landTitleNumber) default to null (no PII was tracked in v1).
 *
 * Idempotent: calling twice with the same input yields equivalent output
 * (Zod default values are deterministic). Pure: no side effects.
 *
 * The L4 persistence loader calls this synchronously during the v1→v2
 * promotion step BEFORE `pryzm-project-context-set` fires.
 */
export function promoteProjectLocationToSite(
    legacy: LegacyProjectLocation,
): SiteLocation {
    return SiteLocationSchema.parse({
        latitude: legacy.latitude,
        longitude: legacy.longitude,
        elevationAsl: legacy.elevationAsl,
        trueNorth: legacy.trueNorth,
        basePoint: legacy.basePoint,
        // v2-only fields — no v1 data to populate them.
        crs: null,
        siteAddress: null,
        landTitleNumber: null,
    });
}

/**
 * Read a v1 `Project.location` view of a v2 `SiteLocation`. Used by the
 * legacy `Project.location` getter (per [C19 §8.2]) so existing code that
 * reads `project.location.{latitude,longitude,...}` keeps working until
 * v3 retires the field entirely (per [C47](file format versioning)).
 *
 * Strips the v2-only fields (crs / siteAddress / landTitleNumber). This
 * is LOSSY in the v2→v1 direction by design — legacy readers never knew
 * about those fields.
 */
export function siteLocationToLegacyProjectLocation(
    site: SiteLocation,
): LegacyProjectLocation {
    return {
        latitude: site.latitude,
        longitude: site.longitude,
        elevationAsl: site.elevationAsl,
        trueNorth: site.trueNorth,
        basePoint: site.basePoint,
    };
}

/**
 * Detect whether two SiteLocations carry the same v1-relevant fields.
 *
 * Used by the dual-write legacy adapter ([C19 §8.2] v2 phase) to decide
 * whether a `project.updateLocation` write needs to forward to
 * `site.updateLocation` — same v1 fields = no-op; different = forward.
 *
 * Compares ONLY the 5 v1 fields. v2-only fields (crs etc) are ignored
 * because v1 writers cannot set them anyway.
 */
export function v1FieldsEqual(a: SiteLocation, b: SiteLocation): boolean {
    return (
        a.latitude === b.latitude &&
        a.longitude === b.longitude &&
        a.elevationAsl === b.elevationAsl &&
        a.trueNorth === b.trueNorth &&
        a.basePoint.x === b.basePoint.x &&
        a.basePoint.y === b.basePoint.y &&
        a.basePoint.z === b.basePoint.z
    );
}
