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
    ClimateRefIdSchema,
    BuildingIdSchema,
    ProvenanceRecordSchema,
    ParcelProvenanceSchema,
    PtSchema,
    BuildableDeterminationRecordSchema,
    SiteScopeSchema,
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
    /**
     * §L-1580 (C57 §1.4 / §2.2) — the cadastral provenance of THIS ring, recorded in the
     * SAME command that commits it.
     *
     * WHY IT RIDES ON THIS PAYLOAD RATHER THAN A SECOND COMMAND: C57 §1.4 says provenance
     * is not optional, and a two-command sequence has a state where the ring is committed
     * and its attribution is not — which is precisely the state every project was already
     * in, and the state this field exists to make unreachable. One command, one write.
     *
     * OMITTED / `null` = the caller has no provenance to record (a hand-drawn boundary
     * whose author did not stamp `kind: 'user-drawn'`, or any pre-§L-1580 call site). The
     * stored value is then `null`, which readers MUST render as "not recorded", never as a
     * blank or a zero (C84 EI-1b).
     */
    provenance: ParcelProvenanceSchema.nullable().optional(),
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
    /**
     * ADR-0270 option A / C58 §1.7a — each field is NULLABLE as well as optional, and the two
     * mean different things:
     *   • OMITTED  → leave the stored value untouched (delta semantics, as every field here).
     *   • `null`   → this zone is NOT setback-governed; record that explicitly.
     *   • a number → the requirement, in metres.
     * Omitting on an alignment zone is NOT good enough: it leaves STALE numbers from a previous
     * setback solve sitting on a parcel they no longer describe, which §1.7a forbids precisely
     * because they still look well-formed. Only an explicit `null` erases them honestly.
     */
    setbacks: z
        .object({
            front: z.number().min(0).nullable().optional(),
            side: z.number().min(0).nullable().optional(),
            rear: z.number().min(0).nullable().optional(),
        })
        .optional(),
    maxFAR: z.number().min(0).nullable().optional(),
    maxHeight: z.number().min(0).nullable().optional(),
    /**
     * ADR-0270 option A / C58 §1.7a (L-451) — the buildable-envelope INSET RING, which is now
     * the PERSISTED TRUTH for "what may I build here".
     *
     * `null` explicitly CLEARS a previously-solved envelope (e.g. the parcel changed and no
     * envelope has been re-solved). Omitted leaves it untouched, matching every other field
     * here — the caller supplies deltas only.
     *
     * WHY IT IS SEPARATE FROM `setbacks`: an alignment-governed zone (*alineación a vial* +
     * *profundidad edificable*) has NO front/side/rear triple that encodes it, so the three
     * numbers cannot carry the answer. C58 §2.4 already computed this ring and §1.8 already
     * threaded THE POLYGON — not the numbers — into generation; this is the field that finally
     * lets it survive close+reopen (cf. L-188).
     */
    buildableRing: z.array(PtSchema).nullable().optional(),
    /**
     * §GIS-ENVELOPE-DETERMINATION-PERSIST (L-1654) — the FULL determination as a dated record
     * (`Parcel.buildableDetermination`). Same delta semantics as `buildableRing`:
     *   • OMITTED → leave the stored record untouched;
     *   • `null`  → explicitly CLEAR a record that no longer describes this parcel;
     *   • a record → persist it (refusal determinations included — a cited refusal is a
     *     determination too and must survive reload).
     * Written by the same dispatch that writes `buildableRing`, so the two can never
     * describe different solves.
     */
    buildableDetermination: BuildableDeterminationRecordSchema.nullable().optional(),
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

/**
 * `site.addContextBuilding` payload — per [C19 §4.1].
 * Appends a single ContextBuilding to `SiteModel.contextBuildings[]`.
 * Per §1.5 the appended entry MUST carry `editable: false` (the schema
 * enforces this via the L0 literal `z.literal(false)`).
 */
export const SiteAddContextBuildingPayloadSchema = z.object({
    siteId: SiteIdSchema,
    contextBuilding: ContextBuildingSchema,
});
export type SiteAddContextBuildingPayload = z.infer<
    typeof SiteAddContextBuildingPayloadSchema
>;

/**
 * `site.removeContextBuilding` payload — per [C19 §4.1].
 * Removes one entry by id. No-op-with-warning when the id is unknown.
 */
export const SiteRemoveContextBuildingPayloadSchema = z.object({
    siteId: SiteIdSchema,
    contextBuildingId: z.string().min(3),
});
export type SiteRemoveContextBuildingPayload = z.infer<
    typeof SiteRemoveContextBuildingPayloadSchema
>;

/**
 * `site.replaceContextBuilding` payload — per [C19 §4.1] + §1.5.
 * Atomic remove + add preserving order. `replacement.id` MAY equal
 * `contextBuildingId` or differ (the contract is silent — we allow both).
 */
export const SiteReplaceContextBuildingPayloadSchema = z.object({
    siteId: SiteIdSchema,
    contextBuildingId: z.string().min(3),
    replacement: ContextBuildingSchema,
});
export type SiteReplaceContextBuildingPayload = z.infer<
    typeof SiteReplaceContextBuildingPayloadSchema
>;

/**
 * `site.linkClimate` payload — per [C19 §4.1].
 * Sets `SiteModel.climateRef` so workflows can resolve climate data
 * via the ClimateStore (per [C21 §1.1] climate is anchored to a Site
 * via siteRef; this is the inverse pointer on the Site element).
 * `null` clears the link.
 */
export const SiteLinkClimatePayloadSchema = z.object({
    siteId: SiteIdSchema,
    climateRef: ClimateRefIdSchema.nullable(),
});
export type SiteLinkClimatePayload = z.infer<
    typeof SiteLinkClimatePayloadSchema
>;

/**
 * `site.linkBuilding` payload — per [C19 §4.1].
 * Sets `SiteModel.buildingRef`. Called once at C20 Building.create time
 * by the C20 command surface (out of scope C19; a later slice wires it).
 */
export const SiteLinkBuildingPayloadSchema = z.object({
    siteId: SiteIdSchema,
    buildingRef: BuildingIdSchema.nullable(),
});
export type SiteLinkBuildingPayload = z.infer<
    typeof SiteLinkBuildingPayloadSchema
>;

/**
 * `site.replace` payload — per [C19 §4.1] + §1.4.
 *
 * Complete replacement — the ONLY legitimate path to change the
 * parcel polygon after `site.create` (the polygon is immutable
 * per §1.4). The replacement SiteModel MUST have the same `id` and
 * `projectId` as the current Site. Caller is responsible for
 * preserving any state the user expects to survive (eg manual edits
 * to setbacks / zoning).
 *
 * Per C19 §4.4: site.replace produces a SINGLE undo entry that
 * snapshots the entire prior SiteModel. The undo entry actor is
 * preserved for the C23 audit trail.
 *
 * Provenance: the replacement's `provenance.source` MUST be the
 * legitimate origin of the new model (eg `'user-authored'` when the
 * user redraws the parcel; `'ifc-import'` when a new IFC is imported).
 */
export const SiteReplacePayloadSchema = z.object({
    siteId: SiteIdSchema,
    replacement: z.object({
        id: SiteIdSchema,
        projectId: ProjectIdSchema,
        name: z.string().min(1).default('Site'),
        location: SiteLocationSchema,
        // We do NOT re-validate the full SiteModel nested shape here —
        // the L0 SiteModelSchema (used by siteCreate) does that on commit.
        // Instead, the replacement is permissive at the payload level;
        // the handler runs SiteModelSchema.parse to validate before set.
        parcel: z.unknown(),
        footprint: z.unknown().optional(),
        contextBuildings: z.unknown().optional(),
        climateRef: ClimateRefIdSchema.nullable().optional(),
        buildingRef: BuildingIdSchema.nullable().optional(),
        provenance: ProvenanceRecordSchema,
        /** §SITE-SCOPE (C12 §13) — permissive here like the other nested fields; the handler's
         *  `SiteModelSchema.parse` validates it. Omitted ⇒ `null` (a whole-site replace that
         *  does not carry a scope has not authored one). */
        scope: z.unknown().optional(),
    }),
});
export type SiteReplacePayload = z.infer<typeof SiteReplacePayloadSchema>;

/**
 * `site.setScope` payload — §SITE-SCOPE (L-645, C12 §13 / ADR-0382).
 * Sets the persisted 3D-Site scope, or clears it with `null` (= "not authored; use the
 * product default"). The ONLY mutation path for `SiteModel.scope` (P6).
 */
export const SiteSetScopePayloadSchema = z.object({
    siteId: SiteIdSchema,
    scope: SiteScopeSchema.nullable(),
});
export type SiteSetScopePayload = z.infer<typeof SiteSetScopePayloadSchema>;

/**
 * `site.delete` payload — per [C19 §4.1] + §1.1.
 *
 * FORBIDDEN in normal flow (§1.1 — one Site per Project). Only
 * legitimately called from the project-delete cascade. The handler
 * accepts a `cascadeFromProjectDelete: true` flag — without it, the
 * command is rejected. This is the "explicit-tag" pattern that lets
 * the command-bus enforce the cascade-only path without inspecting
 * the call stack.
 */
export const SiteDeletePayloadSchema = z.object({
    siteId: SiteIdSchema,
    /** MUST be `true` — without it the handler refuses. */
    cascadeFromProjectDelete: z.literal(true),
});
export type SiteDeletePayload = z.infer<typeof SiteDeletePayloadSchema>;

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
    | 'context-building-not-found'       // §1.5 — remove/replace by id missed
    | 'context-building-duplicate-id'    // §1.5 — add would shadow an existing id
    | 'id-mismatch'                      // §1.4 site.replace — id MUST match
    | 'project-mismatch'                 // §1.1 site.replace — projectId MUST match
    | 'delete-not-cascaded'              // §1.1 site.delete WITHOUT cascade flag
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
    /**
     * §L-1580 (C57 §1.4) — the provenance recorded WITH this ring, or `null` when the
     * caller had none. Carried on the event so a subscriber re-anchoring on a fresh commit
     * reads the same attribution the store just persisted, rather than re-deriving it from
     * a registry lookup that may have moved on.
     */
    readonly provenance: SiteModel['parcel']['provenance'];
}

export interface SiteZoningUpdatedEvent {
    readonly type: 'site.zoning-updated';
    readonly siteId: string;
    readonly parcel: SiteModel['parcel'];
}

/** §SITE-SCOPE (C12 §13) — emitted after `site.setScope`; the 3D-Site pane reloads its context
 *  layers to the new extent on this event, never on the slider's pointer moves. */
export interface SiteScopeChangedEvent {
    readonly type: 'site.scope-changed';
    readonly siteId: string;
    /** The post-write scope, or `null` when cleared (= product default resolves at read time). */
    readonly scope: SiteModel['scope'];
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

export interface SiteContextBuildingAddedEvent {
    readonly type: 'site.context-building-added';
    readonly siteId: string;
    readonly contextBuildingId: string;
}

export interface SiteContextBuildingRemovedEvent {
    readonly type: 'site.context-building-removed';
    readonly siteId: string;
    readonly contextBuildingId: string;
}

export interface SiteContextBuildingReplacedEvent {
    readonly type: 'site.context-building-replaced';
    readonly siteId: string;
    readonly contextBuildingId: string;
    readonly replacementId: string;
}

export interface SiteClimateLinkedEvent {
    readonly type: 'site.climate-linked';
    readonly siteId: string;
    readonly climateRef: string | null;
}

export interface SiteBuildingLinkedEvent {
    readonly type: 'site.building-linked';
    readonly siteId: string;
    readonly buildingRef: string | null;
}

export interface SiteReplacedEvent {
    readonly type: 'site.replaced';
    readonly siteId: string;
    /** Full snapshot of the prior SiteModel — supports the single
     *  undo entry per [C19 §4.4]. */
    readonly priorSnapshot: SiteModel;
}

export interface SiteDeletedEvent {
    readonly type: 'site.deleted';
    readonly siteId: string;
    /** Full snapshot of the deleted SiteModel — supports undo. */
    readonly priorSnapshot: SiteModel;
}
