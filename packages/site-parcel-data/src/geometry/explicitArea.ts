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
//   2. `solveExplicitArea({ parcelRing, footprintParts })` — the GEOMETRIC SOLVE. Clips the
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
import { intersectPolygons2D } from '@pryzm/geometry-kernel';
import { clipPolygonToConvex, isConvexRing } from './polygonClip.js';
import {
    boundsDisjoint,
    describeRingDefect,
    normaliseRing,
    ringBounds,
    validateRing,
    type RingDefect,
} from './ringValidation.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 1 — THE ringRef RESOLVER
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * §MULTI-PART-EXPLICIT-AREA — ONE PART of a published buildable footprint: an outer ring plus the
 * interior holes cut out of it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE PRIMITIVE HAD TO GROW A PART
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `explicit-area` originally carried ONE ring, and refused anything else. That refusal was correct
 * for a single-ring implementation but it is not what the ordinances say: a published buildable
 * footprint is very often a MULTI-POLYGON — one plan feature holding several separate building
 * fields — and sometimes carries interior holes.
 *
 * Measured on the Danish national byggefelt register (n = 1,000 systematic sample of the 13,629
 * BINDING features, 2026-07-31): **19.4 % are multi-part** (tail up to 55 parts) and 1.2 % have
 * holes. Nothing legal blocks those — they are binding, published geometry that the primitive
 * simply could not represent. Madrid's NZ 1 *Fondo de la Edificación* and Córdoba's *fondos* have
 * exactly the same shape, which is why this lives in the SHARED primitive and not in a DK branch.
 *
 * ⚠ A HOLE IS A PUBLISHED "DO NOT BUILD HERE". It is carried, never dropped: dropping it inflates
 * the buildable area, which is the one direction C58 §1.4 forbids (the L-616 shape).
 */
export interface ExplicitAreaPart {
    /** The part's outer ring. Open or closed; consumers must not assume. */
    readonly outer: ReadonlyArray<Pt>;
    /** Interior holes cut out of `outer`. Empty/omitted for the common case. NEVER dropped. */
    readonly holes?: ReadonlyArray<ReadonlyArray<Pt>>;
}

/**
 * The published source geometry for one `explicit-area` parcel, ALREADY FETCHED and projected into
 * scene-XZ metres by an L5 provider. Jurisdiction-agnostic — a Madrid layer-6/10 polygon, a
 * Córdoba fondo, a Danish byggefelt, etc., all arrive in this one shape.
 *
 * ⚠ `footprintRing` AND `footprintParts` ARE MUTUALLY EXCLUSIVE, and the resolver refuses when both
 * or neither is set. That is deliberate rather than a convenience default: if `footprintRing` stayed
 * required and mirrored "part 0" of a multi-part source, every reader that had not heard of parts
 * would silently place ONE of N published building fields and report success. Leaving it `undefined`
 * on a multi-part source makes that reader fail loudly instead — the mistake is unrepresentable
 * rather than merely discouraged.
 */
export interface ExplicitAreaSource {
    /** The handle this source answers for; MUST equal `rule.ringRef` or the resolver refuses. */
    readonly ringRef: string;
    /**
     * SINGLE-PART, HOLE-FREE sources only. Mutually exclusive with `footprintParts`; a source with
     * several parts or any hole MUST use `footprintParts` (see the interface note above).
     */
    readonly footprintRing?: ReadonlyArray<Pt>;
    /**
     * §MULTI-PART-EXPLICIT-AREA — the published footprint as N parts, each with its own holes.
     * Mutually exclusive with `footprintRing`.
     */
    readonly footprintParts?: ReadonlyArray<ExplicitAreaPart>;
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
    | 'parcel-override'
    /**
     * §MULTI-PART-EXPLICIT-AREA — the source set BOTH `footprintRing` and `footprintParts` (or
     * neither). The two are mutually exclusive and there is no principled way to pick, so this
     * refuses rather than let a provider bug become a silently halved footprint.
     */
    | 'ambiguous-footprint'
    /**
     * §MULTI-PART-EXPLICIT-AREA — a part's ring is genuinely malformed (self-intersecting,
     * zero-area, non-finite). ⚠ REFUSED, NEVER REPAIRED: see `ringValidation.ts`.
     */
    | 'invalid-footprint-geometry';

export type ExplicitAreaResolution =
    | {
          readonly ok: true;
          /**
           * ⚠ The resolved footprint as PARTS, not a single ring. This replaced a `footprintRing`
           * field deliberately: a reader that has not been updated for multi-part sources now gets a
           * COMPILE error instead of silently placing part 0 and reporting success.
           */
          readonly footprintParts: ExplicitAreaPart[];
          readonly edificabilidad: number | null;
      }
    | {
          readonly ok: false;
          readonly reason: ExplicitAreaRefusalReason;
          /** Human detail for the refusal (which part, which defect). Never a justification. */
          readonly detail?: string;
      };

/** Normalise whichever footprint form the source used into parts, or say why it cannot. */
function sourceParts(
    source: ExplicitAreaSource,
): { readonly ok: true; readonly parts: ExplicitAreaPart[] } | { readonly ok: false; readonly reason: 'ambiguous-footprint' | 'no-footprint'; readonly detail: string } {
    const hasRing = Array.isArray(source.footprintRing);
    const hasParts = Array.isArray(source.footprintParts);
    if (hasRing && hasParts) {
        return {
            ok: false,
            reason: 'ambiguous-footprint',
            detail:
                'the source set BOTH footprintRing and footprintParts — they are mutually exclusive ' +
                'and there is no principled way to choose, so this refuses rather than silently use one',
        };
    }
    if (hasParts) {
        const parts = source.footprintParts!;
        if (parts.length === 0) {
            return { ok: false, reason: 'no-footprint', detail: 'footprintParts is empty' };
        }
        return { ok: true, parts: parts.map((p) => ({ outer: p.outer, holes: p.holes ?? [] })) };
    }
    if (hasRing) {
        return { ok: true, parts: [{ outer: source.footprintRing!, holes: [] }] };
    }
    return {
        ok: false,
        reason: 'no-footprint',
        detail: 'the source carried neither footprintRing nor footprintParts',
    };
}

/**
 * Resolve an `ExplicitAreaRule`'s `ringRef` against a fetched `ExplicitAreaSource`. Pure, and it
 * never fabricates: every path that cannot produce an authoritative footprint returns a typed
 * refusal, so the caller shows "no envelope / defer" rather than a guess (C58 §1.4).
 *
 * §MULTI-PART-EXPLICIT-AREA — accepts multi-part and holed footprints, and VALIDATES every ring it
 * is handed. A malformed ring is named and refused, never quietly repaired (`ringValidation.ts`).
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
    const normalised = sourceParts(source);
    if (!normalised.ok) {
        return { ok: false, reason: normalised.reason, detail: normalised.detail };
    }

    const parts: ExplicitAreaPart[] = [];
    for (let i = 0; i < normalised.parts.length; i += 1) {
        const part = normalised.parts[i]!;
        const outer = normaliseRing(part.outer);
        if (outer.length < 3) {
            return {
                ok: false,
                reason: 'no-footprint',
                detail: `part ${i} outer ring has ${outer.length} distinct vertices (< 3)`,
            };
        }
        const outerDefect: RingDefect | null = validateRing(outer);
        if (outerDefect !== null) {
            // `zero-area` keeps the historic `degenerate-footprint` code so the existing Madrid
            // behaviour (and its tests) is unchanged; the genuinely NEW defects get the new code.
            const reason: ExplicitAreaRefusalReason =
                outerDefect === 'zero-area' || outerDefect === 'too-few-vertices'
                    ? 'degenerate-footprint'
                    : 'invalid-footprint-geometry';
            return {
                ok: false,
                reason,
                detail: `part ${i} outer ring is ${outerDefect} — ${describeRingDefect(outerDefect)}`,
            };
        }
        const holes: Pt[][] = [];
        for (let h = 0; h < (part.holes?.length ?? 0); h += 1) {
            const hole = normaliseRing(part.holes![h]!);
            // A degenerate HOLE is dropped rather than fatal: a zero-area hole removes nothing, so
            // ignoring it changes no area. ⚠ A hole with real area and a real DEFECT is fatal —
            // ignoring THAT would over-state the buildable area, which is the forbidden direction.
            if (hole.length < 3) continue;
            const holeDefect = validateRing(hole);
            if (holeDefect === 'zero-area' || holeDefect === 'too-few-vertices') continue;
            if (holeDefect !== null) {
                return {
                    ok: false,
                    reason: 'invalid-footprint-geometry',
                    detail:
                        `part ${i} hole ${h} is ${holeDefect} — ${describeRingDefect(holeDefect)}. ` +
                        'A hole is a published ' +
                        '"do not build here" — an unusable one is refused, never ignored, because ' +
                        'ignoring it OVER-STATES the buildable area (C58 §1.4).',
                };
            }
            holes.push(hole);
        }
        parts.push({ outer, holes });
    }

    return {
        ok: true,
        footprintParts: parts,
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
    /** SINGLE-PART convenience. Mutually exclusive with `footprintParts`. */
    readonly footprintRing?: ReadonlyArray<Pt>;
    /**
     * §MULTI-PART-EXPLICIT-AREA — the published footprint's parts (from `resolveExplicitAreaRing`).
     * Mutually exclusive with `footprintRing`.
     */
    readonly footprintParts?: ReadonlyArray<ExplicitAreaPart>;
}

/** Why the geometric solve refused. Distinct from a resolver refusal — this is about the clip. */
export type ExplicitAreaSolveRefusal =
    /** A ring has < 3 vertices. */
    | 'degenerate-input'
    /** Parcel and footprint do not overlap in a region of ≥ 3 vertices. */
    | 'no-overlap'
    /**
     * ⚠ **NO LONGER MINTED — the general clipper landed (GE-05, §C73-POLY-BOOLEAN).**
     *
     * This used to fire whenever NEITHER ring was convex, because the convex-clip contract could
     * not compute that intersection exactly and a result would have been a fabricated region
     * (C58 §1.4). It was not a rare corner: the DK Tier-1 run measured it on **472 of 1,000 real
     * cadastral parcels (47.2%)** — see `docs/04-reference/jurisdictions/dk/findings/
     * DK-TIER1-LIVE.md`, where it is the load-bearing finding.
     *
     * `packages/geometry-kernel/src/pure/polygonBoolean.ts` now computes concave-vs-concave
     * intersection exactly, so the non-convex path returns an ANSWER. The member is RETAINED,
     * not deleted, because `tools/dk-byggefelt-probe/measure-tier1-reach.ts` compares against it
     * and the DK finding cites it by name; deleting it would break the probe that measured the
     * problem this solved. **Nothing in this module returns it any more** — a general-clipper
     * failure comes back as `'general-clip-refused'`.
     */
    | 'non-convex-both'
    /**
     * The general 2-D boolean itself refused (`degenerate-input` / `self-intersecting-input` /
     * `unresolved-topology` — the kernel's reason is carried in `detail`). This is NOT the old
     * convexity limitation: it means the ring geometry is malformed or hit the boolean's stated
     * resolution limit, so no exact intersection exists to publish. Refusing is still the correct
     * answer — it just has a different, narrower cause than it used to.
     */
    | 'general-clip-refused'
    /** Both / neither of `footprintRing` and `footprintParts` were supplied. */
    | 'ambiguous-input'
    /**
     * §MULTI-PART-EXPLICIT-AREA — after clipping to THIS parcel, the buildable area is TWO OR MORE
     * DISJOINT REGIONS.
     *
     * ⚠ THIS IS THE REFUSAL THAT REPLACED "the source is multi-part". The old rule refused on a
     * property of the SOURCE (a plan feature spanning many plots is multi-part almost by
     * definition), which threw away the whole feature even when only ONE of its parts touched the
     * user's parcel. This refuses on a property of the ANSWER — the buildable area on THIS parcel
     * genuinely is disjoint — which is both far rarer and actually true.
     *
     * It still refuses rather than pick the largest region, because `BuildableEnvelope.insetPolygon`
     * is one ring: publishing the biggest region would UNDER-state the permitted footprint while
     * `insetAreaM2` and the study volume silently described a different solid.
     */
    | 'multi-region-on-parcel'
    /**
     * §MULTI-PART-EXPLICIT-AREA — a published HOLE ("do not build here") falls inside this parcel.
     * A single-ring inset cannot carry a hole, and dropping it would OVER-STATE the buildable area
     * (C58 §1.4, the L-616 direction), so the solve refuses. A hole that lies entirely outside the
     * parcel makes no statement about this plot and is correctly ignored.
     */
    | 'hole-intersects-parcel';

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
          /** How many parts the source published (1 for a single-ring source). */
          readonly partsConsidered: number;
          /**
           * How many of them were PROVABLY irrelevant to this parcel (disjoint bounding boxes) and
           * so were skipped without a clip. This is the number that turns a 55-part lokalplan
           * feature into a one-part answer — carried so a report can say the parts were not lost,
           * they were shown not to touch the plot.
           */
          readonly partsProvablyDisjoint: number;
      }
    | {
          readonly ok: false;
          readonly reason: ExplicitAreaSolveRefusal;
          /** Human detail (which part, how many regions). Never a justification for a guess. */
          readonly detail?: string;
      };

/**
 * Clip the published buildable footprint to the parcel — the `explicit-area` geometric solve.
 *
 * Uses convex-clip Sutherland–Hodgman (`polygonClip.ts`) FIRST: whichever of the two rings is
 * convex becomes the clip polygon (the intersection is symmetric, so either assignment yields the
 * same region). Cadastral parcels are convex quadrilaterals far more often than manzana footprints
 * are, so this resolves the overwhelming majority exactly and robustly — including the shared
 * street-frontage edge that a general clipper would choke on.
 *
 * §GE-05-WIRED — when NEITHER ring is convex this no longer refuses. It falls through to the
 * kernel's general 2-D boolean (`@pryzm/geometry-kernel` §C73-POLY-BOOLEAN), which computes
 * concave-vs-concave intersection exactly. The convex path is UNCHANGED, so no input that already
 * produced an answer produces a different one — see `intersectRings` for why the branch order is
 * load-bearing. The old `'non-convex-both'` refusal is retained in the union but is no longer
 * minted; a general-clipper failure surfaces as `'general-clip-refused'`.
 *
 * §MULTI-PART-EXPLICIT-AREA — every part is clipped, not just the first. Parts whose bounding box
 * is disjoint from the parcel's are PROVABLY irrelevant and skipped without a clip (a sound
 * one-sided test — see `boundsDisjoint`); the rest are clipped and the surviving regions counted.
 * Exactly one surviving region is placeable; two or more, or a hole that bites, refuse with a typed
 * reason rather than publish a ring that is not the answer.
 */
/**
 * §GE-05-WIRED — `subject ∩ clip`, by the exact route available for THIS pair of rings.
 *
 * ⚠ THE ORDER OF THE TWO BRANCHES IS LOAD-BEARING, AND IT IS WHY THIS WIRING IS
 * BEHAVIOUR-PRESERVING. When either ring is convex the convex-clip Sutherland–Hodgman path runs
 * EXACTLY as before, bit for bit — every input that already produced an answer produces the same
 * answer, and the general clipper never touches it. The general path is reached ONLY on inputs
 * that previously returned the `'non-convex-both'` REFUSAL. This wiring can therefore turn a
 * refusal into an answer; it cannot change an answer.
 *
 * That is not a marginal set. The DK Tier-1 run measured `'non-convex-both'` on **472 of 1,000
 * real cadastral parcels (47.2%)** — the load-bearing finding of `DK-TIER1-LIVE.md`.
 *
 * Why keep the convex path at all, rather than route everything through the general clipper?
 * Because S-H against a convex clip is EXACT and carries no arrangement/chaining step at all, so
 * it has no near-coincidence resolution limit (§C73-POLY-BOOLEAN's `COINCIDENT_M × perimeter / 2`
 * area bound). On a legally-binding buildable-area path the narrower, exact tool wins wherever it
 * applies. Replacing it would be a behaviour change dressed as a simplification.
 *
 * The general path may return MORE THAN ONE region — two concave rings genuinely can overlap in
 * disjoint pieces. Every region is returned; the caller's `'multi-region-on-parcel'` refusal is
 * what decides that a single-ring inset cannot carry them.
 */
function intersectRings(
    subject: ReadonlyArray<Pt>,
    clip: ReadonlyArray<Pt>,
):
    | { readonly ok: true; readonly regions: Pt[][] }
    | { readonly ok: false; readonly reason: 'general-clip-refused'; readonly detail: string } {
    if (isConvexRing(clip)) return { ok: true, regions: [clipPolygonToConvex(subject, clip)] };
    if (isConvexRing(subject)) return { ok: true, regions: [clipPolygonToConvex(clip, subject)] };
    // Neither is convex — the case that used to refuse. §C73-POLY-BOOLEAN computes it exactly.
    const r = intersectPolygons2D(
        subject.map((p) => [p.x, p.z] as [number, number]),
        clip.map((p) => [p.x, p.z] as [number, number]),
    );
    if (!r.ok) {
        return { ok: false, reason: 'general-clip-refused', detail: `general 2-D boolean refused: ${r.reason}` };
    }
    return { ok: true, regions: r.loops.map((loop) => loop.map((p) => ({ x: p[0], z: p[1] }))) };
}

export function solveExplicitArea(input: ExplicitAreaSolveInput): ExplicitAreaSolveResult {
    const { parcelRing } = input;
    const hasRing = Array.isArray(input.footprintRing);
    const hasParts = Array.isArray(input.footprintParts);
    if (hasRing === hasParts) {
        return {
            ok: false,
            reason: 'ambiguous-input',
            detail:
                'exactly one of footprintRing / footprintParts must be supplied — supplying both ' +
                'or neither has no principled resolution',
        };
    }
    const parts: ExplicitAreaPart[] = hasParts
        ? input.footprintParts!.map((p) => ({ outer: p.outer, holes: p.holes ?? [] }))
        : [{ outer: input.footprintRing!, holes: [] }];

    if (parcelRing.length < 3 || parts.length === 0) {
        return { ok: false, reason: 'degenerate-input' };
    }
    const parcelBounds = ringBounds(parcelRing);
    if (parcelBounds === null) {
        return { ok: false, reason: 'degenerate-input', detail: 'parcel ring has a non-finite coordinate' };
    }

    const regions: Pt[][] = [];
    let provablyDisjoint = 0;
    let anyPartCoversParcel = false;

    for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i]!;
        if (part.outer.length < 3) {
            return { ok: false, reason: 'degenerate-input', detail: `part ${i} outer ring has < 3 vertices` };
        }
        const partBounds = ringBounds(part.outer);
        if (partBounds === null) {
            return { ok: false, reason: 'degenerate-input', detail: `part ${i} has a non-finite coordinate` };
        }
        // PROVABLY irrelevant to this plot — skip without a clip. One-sided and sound.
        if (boundsDisjoint(partBounds, parcelBounds)) {
            provablyDisjoint += 1;
            continue;
        }

        const clipped = intersectRings(part.outer, parcelRing);
        if (!clipped.ok) {
            return { ok: false, reason: clipped.reason, detail: `part ${i}: ${clipped.detail}` };
        }
        const partRegions = clipped.regions.filter((r) => r.length >= 3);
        if (partRegions.length === 0) continue; // this part does not actually reach the parcel

        // ⚠ A HOLE THAT BITES THIS PARCEL IS FATAL, a hole that does not is irrelevant. Checked per
        // surviving part only: a hole in a part 400 m away says nothing about this plot.
        for (let h = 0; h < (part.holes?.length ?? 0); h += 1) {
            const hole = part.holes![h]!;
            if (hole.length < 3) continue;
            const holeBounds = ringBounds(hole);
            if (holeBounds === null) continue;
            if (boundsDisjoint(holeBounds, parcelBounds)) continue;
            // §GE-05-HOLE-EXACT — this branch used to REFUSE whenever neither the hole nor the
            // parcel was convex, on the sound reasoning that a hole which cannot be proven to
            // MISS the plot must be assumed to bite (assuming it misses over-states buildable
            // area — C58 §1.4, the L-616 direction). The general clipper removes the need to
            // assume: the hole ∩ parcel region is now computed exactly, so a hole that genuinely
            // misses no longer costs the user their answer, and one that genuinely bites still
            // refuses. The CONSERVATIVE direction is preserved — a general-clipper refusal here
            // still means "cannot prove it misses", and still refuses.
            const holeClip = intersectRings(hole, parcelRing);
            if (!holeClip.ok) {
                return {
                    ok: false,
                    reason: 'hole-intersects-parcel',
                    detail:
                        `part ${i} hole ${h} overlaps this parcel's bounding box and the exact ` +
                        `hole ∩ parcel region could not be computed (${holeClip.detail}), so the ` +
                        'hole cannot be proven to miss the plot. Assuming it misses would ' +
                        'OVER-STATE the buildable area, so this refuses.',
                };
            }
            const holeAreaM2 = holeClip.regions
                .filter((r) => r.length >= 3)
                .reduce((acc, r) => acc + Math.abs(polygonArea(r)), 0);
            if (holeAreaM2 > 1e-9) {
                return {
                    ok: false,
                    reason: 'hole-intersects-parcel',
                    detail:
                        `part ${i} hole ${h} falls inside this parcel (≈${holeAreaM2.toFixed(1)} m²). ` +
                        'A hole is a published "do not build here" and a single-ring inset cannot ' +
                        'carry it; dropping it would OVER-STATE the buildable area (C58 §1.4).',
                };
            }
        }

        for (const r of partRegions) regions.push(r);
        if (!anyPartCoversParcel && polygonContains(part.outer, parcelRing)) anyPartCoversParcel = true;
    }

    if (regions.length === 0) {
        return { ok: false, reason: 'no-overlap' };
    }
    if (regions.length > 1) {
        return {
            ok: false,
            reason: 'multi-region-on-parcel',
            detail:
                `the published footprint leaves ${regions.length} DISJOINT buildable regions on this ` +
                'parcel, and a single-ring inset can carry only one. Publishing the largest would ' +
                'under-state the permitted footprint while the area and study volume described a ' +
                'different solid, so this refuses (§MULTI-PART-EXPLICIT-AREA).',
        };
    }

    const ring = regions[0]!;
    return {
        ok: true,
        ring,
        areaM2: polygonArea(ring),
        footprintCoversParcel: anyPartCoversParcel,
        partsConsidered: parts.length,
        partsProvablyDisjoint: provablyDisjoint,
    };
}
