// C58 §1.14 / STRUCTURAL-SEAM-1 — `envelopeToMassing`: the ONE pure function that turns a whole
// `BuildableEnvelope` into the complete set of solids the 3D massing render draws.
//
// WHY THIS EXISTS (the L-616 seam, docs/04-reference/SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md
// Part 3 §3.1). Every §1 invariant makes the ENGINE's envelope honest — non-overstating (§1.4),
// tier-complete (§1.7b), zeroed on refusal (§1.13.3), with the `BuildableEnvelope.ts:466–507`
// refinement that pins the legacy scalars to the principal tier. None of that bound the SOLID THE
// USER SEES: the render narrowed the envelope to `{ ring, maxHeightM, farLimitedHeightM, confidence }`
// and re-derived one prism = `ring × maxHeightM`, discarding `maxVolumeM3`, `tiers[]`, `maxCoverage`
// and `footprintIsUpperBound`. So each honesty field had to be hand-threaded into that subset one
// defect at a time (`farLimitedHeight_m` per L-616; `confidence`→hue per L-608; `footprintIsUpperBound`
// per L-619). That is the per-city patch treadmill C58 §1.14 exists to end.
//
// THE INVERSION: the ENGINE emits the solid; the render only rasterises it. This function is the
// render-side DUAL of the §466–507 refinement — it consumes the WHOLE contract in one place and is
// the single authority for how each field becomes geometry. `renderFormaMassing` (CesiumViewport) and
// `ParcelBoundarySceneRenderer` become dumb rasterisers: they extrude what this returns and hold NO
// per-field knowledge of the envelope. `check-envelope-solid-never-overstates`
// (`__tests__/envelopeToMassingNeverOverstates.test.ts`) binds the invariant for EVERY registered
// rule pack at once, so no jurisdiction can overstate at the render.
//
// PURITY: L2-pure (C58 §1.9). No THREE, no DOM, no I/O, no RNG, no OTel — a per-frame render helper.
// Deterministic: identical envelope ⇒ byte-identical solids.
//
// Strategic context — C58 §1.14; SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md Part 3 §3.1;
// jurisdictions/ENVELOPE-REALISM-MATRIX.md (L-616).

import type { EnvelopeConfidence, EnvelopeStatus, EnvelopeTier, Pt } from '@pryzm/schemas';

// ── Style constants — the ONE knob set, matched to the pre-seam render (byte-compatible). ──────────
/** A footprint-only "we do not claim a height" slab (§1.12.6 / §ENVELOPE-NO-FABRICATED-HEIGHT L-525a). */
export const FOOTPRINT_ONLY_HEIGHT_M = 0.5;
/** The opaque study massing fill — the pre-seam single-solid + FAR-solid + tier alpha. */
export const SOLID_FILL_ALPHA = 0.34;
/** §L-619 — a MAXIMUM-extent footprint (no published setbacks) draws near-wireframe, not a solid. */
export const UPPER_BOUND_FILL_ALPHA = 0.06;
/** §L-616 — the translucent legal-ceiling shell drawn AROUND a FAR-limited solid. */
export const SHELL_FILL_ALPHA = 0.08;

/** Confidence tiers that represent a REAL determination rather than an estimate/guess (C58 §1.2). */
const TRUSTED_CONFIDENCE: ReadonlySet<EnvelopeConfidence> = new Set<EnvelopeConfidence>([
    'authoritative',
    'structured',
    'block-constructed',
]);

/**
 * The honesty classification of a solid's colour/fill — the SINGLE authority shared by the 3D
 * massing (`envelopeToMassing`) and the flat overlay/card (`envelopeRenderStyle`, L5, which delegates
 * here). Keeping the RULE in one place is the §1.14 discipline applied to presentation: a rule about
 * the determination must not live in one of its consumers, or the globe and the plan view drift.
 */
export interface EnvelopeCompleteness {
    /** True ⇒ a confident, complete determination (violet). False ⇒ estimate/flat/unknown (grey). */
    readonly complete: boolean;
    /** §L-619 — the FOOTPRINT is a whole-parcel UPPER BOUND (setbacks unpublished), never a solved area. */
    readonly footprintUpperBound: boolean;
    /** One line for logs / an aria hint — WHY it is grey, when it is. */
    readonly reason: string;
}

/**
 * Decide the honesty class of a buildable-envelope solid from its signals (C58 §1.2 / L-608 / L-619).
 *
 * An envelope reads CONFIDENT only when its confidence is a REAL determination AND it carries a real
 * height. An UPPER-BOUND footprint is NEVER confident, however trusted its height/FAR — the footprint
 * is the thing in doubt (setbacks unpublished). Otherwise provisional. Conservative by construction:
 * an unknown confidence greys.
 */
export function classifyEnvelopeCompleteness(
    confidence: EnvelopeConfidence | null | undefined,
    hasRealHeight: boolean,
    footprintIsUpperBound: boolean = false,
): EnvelopeCompleteness {
    // §L-619 — the upper-bound signal wins over EVERY confidence tier: the FOOTPRINT is unknown.
    if (footprintIsUpperBound) {
        return {
            complete: false,
            footprintUpperBound: true,
            reason: 'maximum extent — ordinance publishes no setbacks, footprint is an upper bound (L-619)',
        };
    }
    const trusted = confidence != null && TRUSTED_CONFIDENCE.has(confidence);
    const complete = trusted && hasRealHeight;
    if (complete) {
        return { complete: true, footprintUpperBound: false, reason: `confident (${confidence})` };
    }
    const why = !trusted
        ? `provisional — confidence=${confidence ?? 'unknown'} (estimate/unverified)`
        : 'provisional — no confirmed height (flat footprint)';
    return { complete: false, footprintUpperBound: false, reason: why };
}

/** The colour intent of a solid. Mapped to a concrete hue by the rasteriser (violet vs grey). */
export type MassingHue = 'confident' | 'provisional';

/**
 * The kind of solid, which fixes its VOLUME semantics — see `claimsVolume`. Names are stable because
 * a `height-shell` and a `far-massing` are legally different statements (§1.7b.6), not two fills.
 */
export type MassingSolidRole =
    /** The single buildable prism (no FAR limit, no tiers) — the 13a/13b/every-current-good case. */
    | 'massing'
    /** §L-616 — the FAR-realistic solid drawn INSIDE a translucent height shell. */
    | 'far-massing'
    /** §L-616 — the translucent legal-ceiling boundary. NOT a buildable-volume claim. */
    | 'height-shell'
    /** §1.12.6 / L-525a — a flat "we do not claim a height" slab. NOT a buildable-volume claim. */
    | 'footprint-slab'
    /** §1.7b.4 / ADR-0273 — one tier of a multi-tier envelope, at its own height. */
    | 'tier';

/** Presentation intent of a solid — decided HERE, mapped to pixels by the dumb rasteriser. */
export interface MassingSolidStyle {
    readonly hue: MassingHue;
    /** Fill opacity fraction (0..1) — the one knob the pre-seam render used. */
    readonly fillAlpha: number;
    /** True ⇒ confident+real determination (violet). Mirrors `EnvelopeCompleteness.complete`. */
    readonly complete: boolean;
    /** §L-619 — true on EVERY solid of an upper-bound-footprint envelope. */
    readonly footprintUpperBound: boolean;
    /** WHY the hue is what it is (logs / aria). */
    readonly reason: string;
}

/**
 * ONE solid to draw. Heights are metres above the site datum (0 = ground); the rasteriser adds the
 * resolved terrain base + its own ground sink. The rasteriser NEVER re-derives a height — it extrudes
 * `[baseHeightM, topHeightM]` exactly, and reads `style` for colour/fill and `id` for the entity name.
 */
export interface MassingSolid {
    /** Stable name → Cesium entity name / THREE mesh name. Preserves the pre-seam names. */
    readonly id: string;
    /** The footprint ring in scene-XZ metres (same frame as the parcel + walls). */
    readonly ring: ReadonlyArray<Pt>;
    /** `area(ring)` in m² — carried so the never-overstate test agrees with the drawn geometry. */
    readonly areaM2: number;
    /** Underside above the datum (0 = ground). */
    readonly baseHeightM: number;
    /** Top above the datum. */
    readonly topHeightM: number;
    readonly role: MassingSolidRole;
    /**
     * Does this solid assert BUILDABLE VOLUME? `true` for the opaque massing/FAR/tier solids; `false`
     * for the translucent legal-ceiling shell (a boundary, not a claim) and the flat footprint slab
     * (which explicitly claims no height). The never-overstate invariant sums only `claimsVolume`.
     */
    readonly claimsVolume: boolean;
    readonly style: MassingSolidStyle;
}

/**
 * The subset of `BuildableEnvelope` this function reads. Declared as an interface (not the full type)
 * so BOTH a real `BuildableEnvelope` (structurally assignable — it has every field) AND the minimal
 * geometry-only fallback the render builds on reload (persisted ring, C58 §1.7a / L-445) can be
 * passed without a cast. "Maps the WHOLE envelope" (§1.14.1) — a `BuildableEnvelope` satisfies it.
 */
export interface BuildableEnvelopeMassingInput {
    readonly insetPolygon: ReadonlyArray<Pt>;
    readonly insetAreaM2?: number;
    readonly maxHeight_m: number | null;
    readonly farLimitedHeight_m?: number | null;
    readonly maxVolumeM3?: number | null;
    readonly maxCoverage?: number | null;
    readonly footprintIsUpperBound?: boolean;
    readonly confidence?: EnvelopeConfidence | null;
    readonly status?: EnvelopeStatus;
    readonly tiers?: ReadonlyArray<EnvelopeTier>;
}

/** Shoelace area (absolute). Pure; matches the engine's `polygonArea`. */
function polygonAreaM2(ring: ReadonlyArray<Pt>): number {
    if (ring.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

/**
 * Turn a WHOLE `BuildableEnvelope` into the complete set of solids to draw (C58 §1.14).
 *
 * Honours every field in ONE place:
 *   • `status !== 'ok'` / degenerate ring → `[]` (§1.13.3 — a refused envelope draws nothing).
 *   • `tiers[]` → one solid per tier at its own `[baseHeight_m, maxHeight_m]` (§1.7b.4 — a multi-tier
 *     envelope is NEVER one prism); a tier with a null height → a flat footprint slab for that tier.
 *   • single prism, no height → a flat footprint slab (§1.12.6 — never an invented prism).
 *   • single prism + `farLimitedHeight_m` below the height cap → a translucent height SHELL at the
 *     legal max plus an opaque FAR solid inside it (§L-616 — FAR caps buildable volume, not the ring).
 *   • single prism otherwise → one opaque solid to `maxHeight_m` (13a/13b + every current-good case).
 *   • `footprintIsUpperBound` → EVERY solid carries the provisional grey + near-wireframe study style
 *     (§L-619 — a footprint we could not shape can never read as a confident buildable solid).
 *
 * The never-overstate guarantee (§1.14.4): the sum of `claimsVolume` solid volumes never exceeds the
 * envelope's `maxVolumeM3` (or the tier-summed geometric cap). Proven for all packs in the CI guard.
 */
export function envelopeToMassing(env: BuildableEnvelopeMassingInput): MassingSolid[] {
    // §1.13.3 — a refused / degenerate envelope zeroes the render: no ring, no solid.
    if (env.status !== undefined && env.status !== 'ok') return [];
    const inset = env.insetPolygon;
    if (!Array.isArray(inset) || inset.length < 3) return [];

    const upperBound = env.footprintIsUpperBound === true;
    const solidAlpha = upperBound ? UPPER_BOUND_FILL_ALPHA : SOLID_FILL_ALPHA;

    // ── Tiered envelope (§1.7b.4 / ADR-0273): one solid per tier at its own height. ────────────────
    const tiers = env.tiers ?? [];
    if (tiers.length > 0) {
        const solids: MassingSolid[] = [];
        for (const t of tiers) {
            if (!Array.isArray(t.polygon) || t.polygon.length < 3) continue;
            const areaM2 = t.areaM2 > 0 ? t.areaM2 : polygonAreaM2(t.polygon);
            const base = Math.max(0, t.baseHeight_m ?? 0);
            const hasHeight = typeof t.maxHeight_m === 'number' && t.maxHeight_m > 0;
            const cls = classifyEnvelopeCompleteness(env.confidence, hasHeight, upperBound);
            const style: MassingSolidStyle = {
                hue: cls.complete ? 'confident' : 'provisional',
                fillAlpha: solidAlpha,
                complete: cls.complete,
                footprintUpperBound: cls.footprintUpperBound,
                reason: cls.reason,
            };
            if (hasHeight) {
                solids.push({
                    id: `pryzm-forma-envelope-tier-${t.id}`,
                    ring: t.polygon,
                    areaM2,
                    baseHeightM: base,
                    topHeightM: base + t.maxHeight_m!,
                    role: 'tier',
                    claimsVolume: true,
                    style,
                });
            } else {
                // A tier that is a real permitted REGION with no published vertical limit — a footprint
                // slab, never an invented prism (§1.12.6). Claims no volume.
                solids.push({
                    id: `pryzm-forma-envelope-tier-${t.id}`,
                    ring: t.polygon,
                    areaM2,
                    baseHeightM: base,
                    topHeightM: base + FOOTPRINT_ONLY_HEIGHT_M,
                    role: 'footprint-slab',
                    claimsVolume: false,
                    style,
                });
            }
        }
        return solids;
    }

    // ── Single-prism envelope. ─────────────────────────────────────────────────────────────────────
    const areaM2 = env.insetAreaM2 && env.insetAreaM2 > 0 ? env.insetAreaM2 : polygonAreaM2(inset);
    const hasRealHeight = typeof env.maxHeight_m === 'number' && env.maxHeight_m > 0;
    const cls = classifyEnvelopeCompleteness(env.confidence, hasRealHeight, upperBound);
    const baseStyle = (fillAlpha: number): MassingSolidStyle => ({
        hue: cls.complete ? 'confident' : 'provisional',
        fillAlpha,
        complete: cls.complete,
        footprintUpperBound: cls.footprintUpperBound,
        reason: cls.reason,
    });

    // §1.12.6 / L-525a — no constructed height ⇒ a flat footprint slab, never an invented prism.
    if (!hasRealHeight) {
        return [{
            id: 'pryzm-forma-buildable-envelope',
            ring: inset,
            areaM2,
            baseHeightM: 0,
            topHeightM: FOOTPRINT_ONLY_HEIGHT_M,
            role: 'footprint-slab',
            claimsVolume: false,
            style: baseStyle(solidAlpha),
        }];
    }

    const maxHeightM = env.maxHeight_m!;
    const farM = env.farLimitedHeight_m ?? null;
    const hasFarLimit =
        typeof farM === 'number' && farM > 0 && farM < maxHeightM - 1e-6;

    // §L-616 — FAR caps floorspace below the height cap: draw a translucent legal SHELL to the max
    // height AND an opaque FAR solid inside it. The shell is the outer bound, NOT a volume claim.
    if (hasFarLimit) {
        return [
            {
                id: 'pryzm-forma-envelope-height-shell',
                ring: inset,
                areaM2,
                baseHeightM: 0,
                topHeightM: maxHeightM,
                role: 'height-shell',
                claimsVolume: false,
                style: baseStyle(SHELL_FILL_ALPHA),
            },
            {
                id: 'pryzm-forma-envelope-far-massing',
                ring: inset,
                areaM2,
                baseHeightM: 0,
                topHeightM: farM!,
                role: 'far-massing',
                claimsVolume: true,
                style: baseStyle(solidAlpha),
            },
        ];
    }

    // The unchanged single-solid path — same entity name so any name-based consumer is unaffected.
    return [{
        id: 'pryzm-forma-buildable-envelope',
        ring: inset,
        areaM2,
        baseHeightM: 0,
        topHeightM: maxHeightM,
        role: 'massing',
        claimsVolume: true,
        style: baseStyle(solidAlpha),
    }];
}

/** The buildable VOLUME a single solid asserts (m³): 0 for a shell / footprint slab (no claim). */
export function massingSolidVolumeM3(s: MassingSolid): number {
    if (!s.claimsVolume) return 0;
    return Math.max(0, s.areaM2) * Math.max(0, s.topHeightM - s.baseHeightM);
}

/** Total buildable volume asserted by a set of solids (§1.14.4 — the never-overstate LHS). */
export function totalMassingVolumeM3(solids: ReadonlyArray<MassingSolid>): number {
    let v = 0;
    for (const s of solids) v += massingSolidVolumeM3(s);
    return v;
}
