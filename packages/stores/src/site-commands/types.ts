// A.7.c (Phase A · Sprint 2) — site.* command payloads + result shapes.
//
// Per [C19 §4.1] every `site.*` command has a Zod-validated payload.
// Handlers return a discriminated union: `{ ok: true, event }` on
// success (with the C19 §4.2 domain event ready for emission) or
// `{ ok: false, reason }` on a soft-rejection (invariant violated).
// Handlers throw ONLY for programmer errors (missing siteId match).
//
// L3-layer: imports ONLY from `@pryzm/schemas` (L0) + this directory.
// No I/O, no THREE, no DOM.
//
// Strategic context — see:
//   - docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md §4
//   - docs/03-execution/plans/master-execution-tracker.md A.7.c

import { z } from 'zod';
import {
    SiteIdSchema,
    ProjectIdSchema,
    SiteLocationSchema,
    ParcelBoundarySchema,
    BuildingFootprintSchema,
    ContextBuildingSchema,
    type SiteModel,
} from '@pryzm/schemas';
import type { ContainmentReport, FARReport } from '@pryzm/site-validators';

// ─────────────────────────────────────────────────────────────────────────────
// Payload schemas (Zod-validated at the handler entry point per C16).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `site.create` payload — per [C19 §4.1].
 * Idempotent: re-issuing for an existing project replaces the
 * auto-promoted default (§1.1).
 */
export const SiteCreatePayloadSchema = z.object({
    projectId: ProjectIdSchema,
    name: z.string().min(1).optional(),
    location: SiteLocationSchema,
    /** Parcel may be supplied; if absent, an empty parcel is used per §1.4. */
    parcel: z
        .object({
            boundary: ParcelBoundarySchema.optional(),
            setbacks: z
                .object({
                    front: z.number().min(0),
                    side: z.number().min(0),
                    rear: z.number().min(0),
                })
                .optional(),
            maxFAR: z.number().min(0).nullable().optional(),
            maxHeight: z.number().min(0).nullable().optional(),
        })
        .optional(),
    footprint: BuildingFootprintSchema.optional(),
    contextBuildings: z.array(ContextBuildingSchema).optional(),
});
export type SiteCreatePayload = z.infer<typeof SiteCreatePayloadSchema>;

/**
 * `site.updateLocation` payload — per [C19 §4.1].
 * MUST trigger an `LTPENURebase.setOrigin()` synchronously before the
 * event emits (per §1.3) — wiring is the caller's responsibility.
 */
export const SiteUpdateLocationPayloadSchema = z.object({
    siteId: SiteIdSchema,
    location: SiteLocationSchema,
});
export type SiteUpdateLocationPayload = z.infer<
    typeof SiteUpdateLocationPayloadSchema
>;

/**
 * `site.setParcelBoundary` payload — per [C19 §4.1].
 * REJECTED if `Parcel.boundary` is already non-empty (§1.4 — parcel
 * polygon is immutable post-create).
 */
export const SiteSetParcelBoundaryPayloadSchema = z.object({
    siteId: SiteIdSchema,
    boundary: ParcelBoundarySchema,
});
export type SiteSetParcelBoundaryPayload = z.infer<
    typeof SiteSetParcelBoundaryPayloadSchema
>;

/**
 * `site.updateZoning` payload — per [C19 §4.1].
 * Patches mutable parcel fields. The polygon is NOT touched (§1.4
 * immutability). All four sub-fields are optional — caller supplies
 * only what changes.
 *
 * NOTE: we declare the partial sub-objects explicitly (NOT
 * `ParcelSetbacksSchema.partial()`) so Zod does not apply the L0
 * schema's `.default(0)` when the caller omits a sub-axis — `partial()`
 * on a defaulted schema still fills in defaults, which would erase the
 * current setback values on patch.
 */
export const SiteUpdateZoningPayloadSchema = z.object({
    siteId: SiteIdSchema,
    zoning: z
        .object({
            category: z.string().min(1).nullable().optional(),
            overlays: z.array(z.string().min(1)).optional(),
            jurisdictionRef: z.string().min(3).max(64).nullable().optional(),
        })
        .optional(),
    setbacks: z
        .object({
            front: z.number().min(0).optional(),
            side: z.number().min(0).optional(),
            rear: z.number().min(0).optional(),
        })
        .optional(),
    maxFAR: z.number().min(0).nullable().optional(),
    maxHeight: z.number().min(0).nullable().optional(),
});
export type SiteUpdateZoningPayload = z.infer<
    typeof SiteUpdateZoningPayloadSchema
>;

/**
 * `site.setFootprint` payload — per [C19 §4.1] + §1.6.
 * Sets or replaces the BuildingFootprint. Containment + setback
 * violations are surfaced as `warnings` per §1.6 ("non-fatal lint at
 * edit time, hard at IFC export"); the command STILL succeeds.
 */
export const SiteSetFootprintPayloadSchema = z.object({
    siteId: SiteIdSchema,
    footprint: BuildingFootprintSchema,
});
export type SiteSetFootprintPayload = z.infer<
    typeof SiteSetFootprintPayloadSchema
>;

/**
 * `site.clearFootprint` payload — per [C19 §4.1].
 * Sets `footprint` to `null`. Used when redrawing.
 */
export const SiteClearFootprintPayloadSchema = z.object({
    siteId: SiteIdSchema,
});
export type SiteClearFootprintPayload = z.infer<
    typeof SiteClearFootprintPayloadSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Result shapes — per the handler discriminated-union convention.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A soft rejection reason — a known invariant violation surfaced to UI.
 * Programmer errors (missing siteId match, malformed payloads) throw
 * instead of returning these.
 */
export type SiteCommandRejection =
    | 'no-site'                          // siteId does not match the current store
    | 'parcel-already-set'              // §1.4 parcel polygon immutability
    | 'edge-classifications-mismatch'    // §2.7 cross-schema validation
    | 'invalid-payload';                 // generic Zod failure shape

/**
 * Optional non-fatal warnings carried by an `ok: true` result. Per
 * [C19 §1.6] containment + setback violations are surfaced as a
 * non-fatal lint at edit time (Site Inspector §5.3) and a HARD fail
 * at IFC export time (per C25 §1.4). Commands that COULD surface them
 * (currently `site.setFootprint`) include them on success.
 */
export interface SiteCommandWarnings {
    readonly containment?: ContainmentReport;
    readonly far?: FARReport;
}

/**
 * Discriminated union — `ok: true` carries the domain event payload
 * ready for emission per [C19 §4.2]; `ok: false` carries the rejection
 * reason for the UI to surface. `warnings` is OPTIONAL on success:
 * commands that do soft-lint checks (containment, FAR) include the
 * report so the Site Inspector can render it without re-running the
 * geometry.
 */
export type SiteCommandResult<TEvent extends { type: string }> =
    | {
          readonly ok: true;
          readonly event: TEvent;
          readonly site: SiteModel;
          readonly warnings?: SiteCommandWarnings;
      }
    | { readonly ok: false; readonly reason: SiteCommandRejection; readonly message: string };

// ─────────────────────────────────────────────────────────────────────────────
// Domain events per [C19 §4.2].
// ─────────────────────────────────────────────────────────────────────────────

export interface SiteCreatedEvent {
    readonly type: 'site.created';
    readonly siteId: string;
    readonly projectId: string;
}

export interface SiteLocationChangedEvent {
    readonly type: 'site.location-changed';
    readonly siteId: string;
    readonly location: SiteModel['location'];
}

export interface SiteParcelBoundarySetEvent {
    readonly type: 'site.parcel-boundary-set';
    readonly siteId: string;
    readonly boundary: SiteModel['parcel']['boundary'];
    readonly area: number;
}

export interface SiteZoningUpdatedEvent {
    readonly type: 'site.zoning-updated';
    readonly siteId: string;
    readonly parcel: SiteModel['parcel'];
}

export interface SiteFootprintSetEvent {
    readonly type: 'site.footprint-set';
    readonly siteId: string;
    readonly footprint: NonNullable<SiteModel['footprint']>;
}

export interface SiteFootprintClearedEvent {
    readonly type: 'site.footprint-cleared';
    readonly siteId: string;
}
