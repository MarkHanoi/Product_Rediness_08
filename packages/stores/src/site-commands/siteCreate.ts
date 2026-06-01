// A.7.c (Phase A · Sprint 2) — `site.create` command handler.
//
// Per [C19 §4.1]: creates the project's single Site. Idempotent —
// re-issuing for an existing project replaces the auto-promoted default
// (§1.1). Per §1.7 emits an OTel span `pryzm.site.create` — the wiring
// adapter (NOT this pure handler) opens the span.
//
// L3-layer: pure. Takes (payload, store) → result. No I/O.

import {
    SiteModelSchema,
    type SiteModel,
} from '@pryzm/schemas';
import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteCreatePayloadSchema,
    type SiteCreatePayload,
    type SiteCommandResult,
    type SiteCreatedEvent,
} from './types.js';

/**
 * Compute the deterministic SiteId for an auto-promoted Site
 * (`site_<projectId>` per [C19 §1.1] / §2.1). The `site.create` handler
 * uses this when the caller does not supply one.
 */
export function deterministicSiteId(projectId: string): string {
    return `site_${projectId}`;
}

/**
 * Compute the parcel polygon's signed area in square metres (shoelace).
 * Returns 0 for degenerate (< 3 vertices) polygons.
 */
function computeArea(polygon: ReadonlyArray<{ x: number; z: number }>): number {
    if (polygon.length < 3) return 0;
    let signed = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        signed += a.x * b.z - b.x * a.z;
    }
    return Math.abs(signed) / 2;
}

/**
 * Execute `site.create`. Idempotent per §1.1.
 *
 *   - Validates the payload (Zod).
 *   - Builds a complete `SiteModel` (applies defaults from L0 schema).
 *   - Computes `parcel.area` from the supplied boundary polygon.
 *   - Calls `store.set(site)` to atomically replace the current SiteModel.
 *   - Returns the `site.created` event ready for emission.
 */
export function siteCreate(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteCreatedEvent> {
    // Step 1 — payload validation (Zod). Throws synchronously on schema
    // failure; the L5 dispatch caller catches + surfaces.
    let payload: SiteCreatePayload;
    try {
        payload = SiteCreatePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.create payload invalid: ${(err as Error).message}`,
        };
    }

    // Step 2 — build the SiteModel. Apply L0 defaults for unspecified
    // sub-fields. Compute the parcel area from the boundary polygon
    // (per [C19 §2.3] `area` is computed; the L3 store fills it).
    const siteId = deterministicSiteId(payload.projectId);
    const boundary = payload.parcel?.boundary ?? {
        polygon: [],
        edgeClassifications: [],
    };
    // Cross-schema check (§2.7 invariant 3): edgeClassifications length
    // MUST equal polygon length when both are non-empty.
    if (
        boundary.polygon.length > 0 &&
        boundary.edgeClassifications.length !== boundary.polygon.length
    ) {
        return {
            ok: false,
            reason: 'edge-classifications-mismatch',
            message:
                `edgeClassifications.length (${boundary.edgeClassifications.length}) ` +
                `MUST equal polygon.length (${boundary.polygon.length}) per C19 §2.7`,
        };
    }

    const site: SiteModel = SiteModelSchema.parse({
        id: siteId,
        projectId: payload.projectId,
        name: payload.name ?? 'Site',
        location: payload.location,
        parcel: {
            boundary,
            setbacks: payload.parcel?.setbacks ?? {
                front: 0,
                side: 0,
                rear: 0,
            },
            maxFAR: payload.parcel?.maxFAR ?? null,
            maxHeight: payload.parcel?.maxHeight ?? null,
            zoning: { category: null, overlays: [], jurisdictionRef: null },
            area: computeArea(boundary.polygon),
        },
        footprint: payload.footprint ?? null,
        contextBuildings: payload.contextBuildings ?? [],
        climateRef: null,
        buildingRef: null,
        provenance: { source: 'user-authored', actor: 'system' },
    });

    // Step 3 — commit + emit.
    store.set(site);
    const event: SiteCreatedEvent = {
        type: 'site.created',
        siteId,
        projectId: payload.projectId,
    };
    return { ok: true, event, site };
}
