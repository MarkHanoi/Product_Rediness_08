// SpaceEnvelopeTypes — the vocabulary the space-envelope solver speaks.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §9 / §12 · ADR-0380 D4 / D6 · C83 §1.4.
//
// ─── LAYER / PURITY ─────────────────────────────────────────────────────────────
// Pure types + frozen constants. No I/O, no THREE, no DOM. This file has no runtime
// behaviour beyond the two exhaustiveness helpers at the bottom.

// ═══════════════════════════════════════════════════════════════════════════════
// FACE IDENTITY — how a caller names ONE face of a prism
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A prism over an n-vertex ring has exactly `n + 2` faces: one SIDE per ring edge,
 * plus TOP and BOTTOM.
 *
 * ⭐ SIDE FACES ARE IDENTIFIED BY THEIR EDGE INDEX, AND THE EDGE INDEX IS THE RING
 * INDEX. Edge `i` runs from `footprint[i]` to `footprint[(i + 1) % n]`. This is the
 * ONE indexing convention in this package, stated once here, because a face-move
 * that is off by one silently moves the wrong wall — a defect that looks like a
 * physics bug and is an arithmetic one.
 */
export type SpaceEnvelopeFaceRef =
    | { readonly kind: 'side'; readonly edgeIndex: number }
    | { readonly kind: 'top' }
    | { readonly kind: 'bottom' };

/** Stable, loggable, greppable spelling of a face — for refusal sentences. */
export function describeFaceRef(face: SpaceEnvelopeFaceRef): string {
    return face.kind === 'side' ? `side face #${face.edgeIndex}` : `${face.kind} face`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE REFUSAL VOCABULARY — C83 §1.4's `CanPlaceRefusalCode` pattern, adopted wholesale
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ⛔ WHY THIS IS ITS OWN UNION AND NOT NEW `CanPlaceRefusalCode` MEMBERS.
 * C83 §1.4 requires the refusal vocabulary to EXTEND rather than rival — and the
 * extension point matters. `canPlace` is about **wall occupancy**: whether a thing
 * fits in a host. A code about the *solidity of a prism* placed into that union
 * would widen a wall concept to mean "any spatial refusal", and the next reader
 * would have no way to tell which members apply to which subject.
 *
 * The SHAPE is copied exactly, which is the part C83 says to adopt: a closed union,
 * a value roster, a compile-time completeness assertion, and a `Record<>`-typed
 * sentence per member so a code can never exist without an explanation.
 */
export const SPACE_ENVELOPE_REFUSAL_CODES = [
    'face-move-collapses-solid',
    'face-move-inverts-ring',
    'face-move-degenerate-corner',
    'face-index-out-of-range',
    'footprint-too-few-vertices',
    'footprint-not-on-level-plane',
    'role-not-authorable',
] as const;

export type SpaceEnvelopeRefusalCode = (typeof SPACE_ENVELOPE_REFUSAL_CODES)[number];

/**
 * ⭐ THE GROUND, FORKED FROM `WallMoveReweld`'s `moveRefusalGround` (ADR-0380 D6).
 *
 * `IMPOSSIBLE` — the geometry contradicts itself. No site, no brief and no user
 *   preference makes it correct. C83 §1.2's test: *"a rule that can never be wrong
 *   may refuse."*
 * `INCUMBENT` — something already there prevents it. Reversible by changing the
 *   incumbent, so it is a report about the world rather than about the request.
 *
 * ⛔ THERE IS DELIBERATELY NO THIRD MEMBER. C83 §1.3 forbids inferring a verdict
 * from magnitude, and a third ground is how a threshold sneaks in.
 */
export type SpaceEnvelopeRefusalGround = 'IMPOSSIBLE' | 'INCUMBENT';

/**
 * One sentence per code, typed `Record<>` so **adding a code without a sentence is a
 * compile error**. C84 EI-8a: a licensed copy is pinned by a test, never a comment —
 * and the cheapest way to have no second copy of a sentence is to have exactly one.
 *
 * ⚠ These are TEMPLATES, not final text. The numbers are appended by the planner
 * from the measured geometry (C114 §12a: every refusal carries BOTH numbers, read
 * from the geometry and never re-typed).
 */
export const SPACE_ENVELOPE_REFUSAL_SENTENCE: Record<SpaceEnvelopeRefusalCode, string> = {
    'face-move-collapses-solid':
        'That move would leave the envelope with no volume. An envelope with zero or '
        + 'negative extent is a footprint pretending to be a solid, and every consumer '
        + 'that divides by it would produce a confidently wrong number.',
    'face-move-inverts-ring':
        'That move would turn the footprint inside out. The ring would cross itself, '
        + 'which asserts two mutually exclusive things about one volume — no site and no '
        + 'brief makes that correct.',
    'face-move-degenerate-corner':
        'That move would leave a corner with no position: the face and its neighbour '
        + 'would become parallel, so the vertex where they meet has no intersection to sit at.',
    'face-index-out-of-range':
        'That face is not part of this envelope.',
    'footprint-too-few-vertices':
        'A footprint needs at least three vertices to bound an area.',
    'footprint-not-on-level-plane':
        'Footprint vertices must lie on the level plane (y = 0). The vertical extent of '
        + 'an envelope lives in baseOffset and height, and there is no second place for it to hide.',
    'role-not-authorable':
        'The maximum buildable volume is SOLVED from the zoning rules, not drawn.',
};

/** A refusal, carrying its ground, its sentence and — always — its measured numbers. */
export interface SpaceEnvelopeRefusal {
    readonly code: SpaceEnvelopeRefusalCode;
    readonly ground: SpaceEnvelopeRefusalGround;
    /** The full sentence INCLUDING both numbers. This is what a user reads. */
    readonly message: string;
    /** The value the request would have produced. */
    readonly requestedValue: number;
    /** The value the geometry actually permits — the second of C114 §12a's BOTH numbers. */
    readonly permittedValue: number;
    /** Unit of the two numbers above, so a caller never guesses. */
    readonly unit: 'm' | 'm2' | 'm3';
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE CENSUS TRIPLE — forked from `computeMoveReweldCensus` (ADR-0380 D6)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ⭐ THREE OUTCOMES, KEPT APART ON PURPOSE, AND THIS IS THE PART OF `WallMoveReweld`
 * WORTH COPYING.
 *
 * `entries`       — it applied, here is the result.
 * `refusals`      — it was asked and answered NO, with a reason and numbers.
 * `notApplicable` — it was never in scope.
 *
 * ⛔ FOLDING `refusals` INTO `notApplicable` IS THE DEFECT THIS SHAPE EXISTS TO
 * PREVENT: "nothing happened" and "I refused, here is why" become the same value,
 * and a caller cannot tell a working system with nothing to do from a system that
 * declined every request. That is [[context-data-honesty-family]]'s *"failure and
 * empty are the SAME VALUE"* at the command seam.
 */
export interface SpaceEnvelopeCensus<TEntry> {
    readonly entries: readonly TEntry[];
    readonly refusals: readonly SpaceEnvelopeRefusal[];
    readonly notApplicable: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE STRUCTURAL INPUT — why this is not the schema type
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The minimum a solver needs to reason about a prism.
 *
 * ⭐ THIS IS DELIBERATELY NOT `import type { SpaceEnvelope }`. The solver reasons
 * about GEOMETRY, and a function that accepts the whole element record invites a
 * caller to believe it also reasons about `standing`, `basis` or `provenance` — which
 * it does not and must not. Narrowing the input to the four fields that bear on the
 * answer is the same discipline `MoveReweldMovedWall` uses, and it makes the test
 * fixtures honest: a test cannot accidentally prove something about a field the
 * function never reads.
 *
 * The real `SpaceEnvelope` record is structurally assignable to this.
 */
export interface SpaceEnvelopePrism {
    readonly id: string;
    /** OPEN ring on the level's XZ plane. `y` MUST be 0 (C114 §10). */
    readonly footprint: readonly { readonly x: number; readonly y: number; readonly z: number }[];
    readonly baseOffset: number;
    readonly height: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURAL EPSILONS — named, with the reason each exists
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ⚠ THESE ARE STRUCTURAL DEGENERACY GUARDS, NOT EMPIRICAL TOLERANCES.
 * [[tolerance-from-measured-error-not-the-test]] applies to a tolerance that decides
 * whether an ANSWER is right; these decide whether a computation is DEFINED at all
 * (division by a near-zero cross product, a solid with no interior). They are set
 * from double-precision behaviour at metre scale, not tuned to make a named fixture
 * pass — and if one is ever adjusted to make a test go green, that is the defect the
 * memory names arriving by another door.
 */
/** Below this, two edge directions are parallel and their intersection is undefined. */
export const PARALLEL_CROSS_EPSILON = 1e-9;
/** Below this many m², a ring bounds no area worth calling a footprint. */
export const MIN_FOOTPRINT_AREA_M2 = 1e-6;
/** Below this many metres, a prism has no vertical extent. */
export const MIN_HEIGHT_M = 1e-4;

// ═══════════════════════════════════════════════════════════════════════════════
// EXHAUSTIVENESS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compile-time completeness assertion (C83 §1.4). Calling this in a `default:` arm
 * makes a new union member a BUILD failure at every switch, which is the whole point
 * of a closed union with a roster.
 */
export function assertNeverSpaceEnvelope(value: never, context: string): never {
    throw new Error(`Unhandled space-envelope case in ${context}: ${JSON.stringify(value)}`);
}

/**
 * ⭐ The roster and the sentence map are pinned to each other AT MODULE LOAD, not by
 * a test that someone might not run. A code with no sentence cannot ship.
 */
const MISSING_SENTENCES = SPACE_ENVELOPE_REFUSAL_CODES.filter(
    (code) => !SPACE_ENVELOPE_REFUSAL_SENTENCE[code],
);
if (MISSING_SENTENCES.length > 0) {
    throw new Error(
        `SPACE_ENVELOPE_REFUSAL_SENTENCE is missing ${MISSING_SENTENCES.join(', ')} — `
        + 'every refusal code MUST carry an explanation (C114 §12).',
    );
}
