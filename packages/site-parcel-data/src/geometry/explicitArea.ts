// C58 §2.2 (KG-4) / ADR-0270 — the `explicit-area` SOLVER PRIMITIVE + its `ringRef` resolver.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — a JURISDICTION-AGNOSTIC, REUSABLE engine primitive
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Every other geometricRule kind ERODES or CLIPS a parcel from PARAMETERS (setback distances, a
// depth). `explicit-area` is the kind for a very different ordinance shape: the plan **publishes
// the buildable footprint DIRECTLY as geometry**, so transcribing it into parameters would be a
// lossy re-derivation of something already authoritative (ADR-0270 / `ExplicitAreaRuleSchema`).
//
// This module is the shared primitive for **any jurisdiction that publishes a buildable footprint
// as geometry**, NOT for Madrid specifically:
//   • Madrid PGOUM-97 Norma Zonal 1 publishes `Fondo de la Edificación` per manzana — the first
//     consumer, and the reason KG-4 exists.
//   • Córdoba's PGOU likewise defines certain *alineaciones/fondos* as drawn footprints.
//   • Barcelona could later expose per-site *ordenació de volums* geometry the same way.
// It contains ZERO city-specific logic — no `sigma.madrid.es`, no `COEF_Z` / `CODMANZANA` field
// names. A pack ADAPTS its source into the generic `ExplicitAreaSource` below; the solver never
// knows which city it is serving.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO HALVES
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. `resolveExplicitAreaRing(rule, source)` — the `ringRef` RESOLVER. `ExplicitAreaRuleSchema`
//      carries only a string `ringRef` (geometry is never inlined in a pack — it stays small and
//      diffable). A provider (L5) fetches the published geometry for the clicked parcel and hands
//      it in as an `ExplicitAreaSource`; this pure function validates the handle, checks for a
//      per-parcel override the general footprint does not govern, and yields the footprint ring +
//      any published edificabilidad — or a typed REFUSAL. It never fabricates.
//   2. `solveExplicitArea({ parcelRing, footprintRing })` — the GEOMETRIC SOLVE. Clips the
//      published footprint to the parcel (`parcel ∩ footprint`) so the answer is THIS plot's
//      buildable area, not the whole manzana's. Refuses honestly where the intersection cannot be
//      computed exactly (see `polygonClip.ts` on the convex-clip contract) rather than guess.
//
// The engine (`ZoningRulesEngine.ts`) is the only production caller: it injects the resolved
// footprint (never fetches — C58 §1.9 purity, exactly as `blockRing` is injected) and delegates
// the clip here. The edificabilidad rides the normal `maxFAR` resolution path (structured field
// or pack), so this primitive stays purely about GEOMETRY.
//
// PURE (C58 §1.9) — no THREE, no DOM, no I/O, no RNG. Deterministic (C58 §1.1).

import type { Pt, ExplicitAreaRule } from '@pryzm/schemas';
import { polygonArea, polygonContains } from '@pryzm/site-validators';
import { clipPolygonToConvex, isConvexRing } from './polygonClip.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 1 — THE ringRef RESOLVER
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The published source geometry for one `explicit-area` parcel, ALREADY FETCHED and projected into
 * scene-XZ metres by an L5 provider. Jurisdiction-agnostic — a Madrid layer-6/10 polygon, a
 * Córdoba fondo, etc., all arrive in this one shape.
 */
export interface ExplicitAreaSource {
    /** The handle this source answers for; MUST equal `rule.ringRef` or the resolver refuses. */
    readonly ringRef: string;
    /** The published, closed buildable-footprint ring for the parcel's block/manzana. */
    readonly footprintRing: ReadonlyArray<Pt>;
    /**
     * Published edificabilidad / FAR that travels with the footprint (e.g. Madrid `COEF_Z`),
     * ALREADY parsed to a number by the provider. `null` when the source publishes none — never a
     * fabricated default. The provider is responsible for parsing under assertion and refusing on
     * an unparseable code before it reaches here.
     */
    readonly edificabilidad?: number | null;
    /**
     * True when the source flags this parcel as having INDIVIDUALLY-DEFINED conditions that the
     * general published footprint does not govern (Madrid's *Ficha Específica* override). When set,
     * the resolver DEFERS — the honest answer is "a per-parcel document PRYZM does not hold",
     * never the general footprint applied to a parcel it was not drawn for.
     */
    readonly hasParcelOverride?: boolean;
}

/** Why a `ringRef` resolution refused. Closed vocabulary — these are legally different states. */
export type ExplicitAreaRefusalReason =
    /** The source does not answer for this rule's `ringRef` (wrong vintage / wrong plane). */
    | 'ringref-mismatch'
    /** The source carried no footprint geometry at all. */
    | 'no-footprint'
    /** The footprint has < 3 vertices or zero area — not a usable ring. */
    | 'degenerate-footprint'
    /** A per-parcel override is present; the general footprint does not govern this parcel. */
    | 'parcel-override';

export type ExplicitAreaResolution =
    | {
          readonly ok: true;
          readonly footprintRing: Pt[];
          readonly edificabilidad: number | null;
      }
    | { readonly ok: false; readonly reason: ExplicitAreaRefusalReason };

/**
 * Resolve an `ExplicitAreaRule`'s `ringRef` against a fetched `ExplicitAreaSource`. Pure, and it
 * never fabricates: every path that cannot produce an authoritative footprint returns a typed
 * refusal, so the caller shows "no envelope / defer" rather than a guess (C58 §1.4).
 */
export function resolveExplicitAreaRing(
    rule: ExplicitAreaRule,
    source: ExplicitAreaSource,
): ExplicitAreaResolution {
    if (source.ringRef !== rule.ringRef) {
        return { ok: false, reason: 'ringref-mismatch' };
    }
    if (source.hasParcelOverride === true) {
        // A *Ficha Específica* (or any per-parcel override) means the general footprint is NOT the
        // rule for this parcel. Deferring is the honest answer, not the general polygon.
        return { ok: false, reason: 'parcel-override' };
    }
    const ring = source.footprintRing;
    if (!ring || ring.length < 3) {
        return { ok: false, reason: 'no-footprint' };
    }
    if (polygonArea(ring) <= 0) {
        return { ok: false, reason: 'degenerate-footprint' };
    }
    return {
        ok: true,
        footprintRing: ring.map((p) => ({ x: p.x, z: p.z })),
        edificabilidad: source.edificabilidad ?? null,
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 2 — THE GEOMETRIC SOLVE (parcel ∩ published footprint)
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface ExplicitAreaSolveInput {
    /**
     * The parcel ring (or the setback inset of it) to clip the footprint to, in scene-XZ metres.
     * The published footprint is per-block, so clipping to the parcel is what makes the answer
     * THIS plot's buildable area.
     */
    readonly parcelRing: ReadonlyArray<Pt>;
    /** The resolved published buildable footprint (from `resolveExplicitAreaRing`). */
    readonly footprintRing: ReadonlyArray<Pt>;
}

/** Why the geometric solve refused. Distinct from a resolver refusal — this is about the clip. */
export type ExplicitAreaSolveRefusal =
    /** A ring has < 3 vertices. */
    | 'degenerate-input'
    /** Parcel and footprint do not overlap in a region of ≥ 3 vertices. */
    | 'no-overlap'
    /**
     * NEITHER ring is convex, so the exact convex-clip intersection cannot be computed and a
     * result would be a fabricated region (C58 §1.4). The honest limitation of this MVP; a future
     * general (concave-vs-concave) clipper lifts it. Reported so the caller can say WHY.
     */
    | 'non-convex-both';

export type ExplicitAreaSolveResult =
    | {
          readonly ok: true;
          /** The buildable ring for the parcel (`parcel ∩ footprint`). */
          readonly ring: Pt[];
          readonly areaM2: number;
          /**
           * The published footprint fully COVERS the parcel — the whole plot is buildable, the
           * footprint did not bite. Not an error (a historic core plot inside a large buildable
           * block is legitimately fully buildable), but surfaced so a report never cites a
           * footprint limit that never applied (mirrors `depthBandClip.bandInactive`, C58 §1.3).
           */
          readonly footprintCoversParcel: boolean;
      }
    | { readonly ok: false; readonly reason: ExplicitAreaSolveRefusal };

/**
 * Clip the published buildable footprint to the parcel — the `explicit-area` geometric solve.
 *
 * Uses convex-clip Sutherland–Hodgman (`polygonClip.ts`): whichever of the two rings is convex
 * becomes the clip polygon (the intersection is symmetric, so either assignment yields the same
 * region). Cadastral parcels are convex quadrilaterals far more often than manzana footprints are,
 * so this resolves the overwhelming majority exactly and robustly — including the shared
 * street-frontage edge that a general clipper would choke on. When NEITHER ring is convex it
 * refuses (`non-convex-both`) rather than fabricate.
 */
export function solveExplicitArea(input: ExplicitAreaSolveInput): ExplicitAreaSolveResult {
    const { parcelRing, footprintRing } = input;
    if (parcelRing.length < 3 || footprintRing.length < 3) {
        return { ok: false, reason: 'degenerate-input' };
    }

    let ring: Pt[];
    if (isConvexRing(parcelRing)) {
        ring = clipPolygonToConvex(footprintRing, parcelRing);
    } else if (isConvexRing(footprintRing)) {
        ring = clipPolygonToConvex(parcelRing, footprintRing);
    } else {
        return { ok: false, reason: 'non-convex-both' };
    }

    if (ring.length < 3) {
        return { ok: false, reason: 'no-overlap' };
    }

    // Did the footprint actually constrain the parcel? If every parcel vertex lies inside the
    // footprint, the plot is wholly buildable and the clip was a no-op — reported, not swallowed.
    const footprintCoversParcel = polygonContains(footprintRing, parcelRing);

    return { ok: true, ring, areaM2: polygonArea(ring), footprintCoversParcel };
}
