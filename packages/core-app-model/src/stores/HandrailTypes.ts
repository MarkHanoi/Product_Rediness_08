import { CoreElement, ElementType } from '../CoreElement';

export interface Point3D {
    x: number;
    y: number;
    z: number;
}

/**
 * §FEAT-HANDRAIL-PANEL-FIELDS (C95 §15.15) — THE MEMBERS, ONCE, AT RUNTIME.
 *
 * These were TYPE-ONLY unions. A type union vanishes at compile time, so every UI
 * that needs to OFFER the choices had to re-type the members as a string array —
 * and a re-typed enum is the "census by one spelling" defect: the second copy is a
 * second answer, and the two drift silently (C84 EI-8/EI-9). `'centred'` vs
 * `'centered'` in one of them would be a dropdown option that writes a value no
 * consumer recognises, with no error anywhere.
 *
 * The arrays are now the AUTHORITY and the unions are DERIVED from them, so adding
 * a member in one place adds it to the type, the picker and any future validator at
 * once, and a member cannot exist in the type but be missing from the picker.
 *
 * ⛔ DO NOT re-type these members in a panel, a command, or a test. Import the array.
 */
export const HANDRAIL_FILL_TYPES = ['glass', 'baluster', 'panel', 'open'] as const;
export type HandrailFillType = typeof HANDRAIL_FILL_TYPES[number];

export const HANDRAIL_RAIL_PROFILES = ['rectangular', 'round'] as const;
export type HandrailRailProfile = typeof HANDRAIL_RAIL_PROFILES[number];

export const HANDRAIL_BALUSTER_SHAPES = ['rectangular', 'round'] as const;
export type HandrailBalusterShape = typeof HANDRAIL_BALUSTER_SHAPES[number];

/**
 * How a run DIVIDES — see `HandrailData.postEndCondition` below for what each
 * convention means and why absent is `'redistribute'`. Published here for the same
 * reason as the three above: the panel must offer exactly these three spellings.
 */
export const HANDRAIL_POST_END_CONDITIONS = ['redistribute', 'fixed', 'centred'] as const;
export type HandrailPostEndCondition = typeof HANDRAIL_POST_END_CONDITIONS[number];

/**
 * §FEAT-HANDRAIL-PANEL-FIELDS (C95 §15.15, C65 §3.5) — THE PUBLISHED BOUNDS.
 *
 * ⚠ THIS EXISTS BECAUSE THE PANEL AND THE COMMAND ALREADY DISAGREED. The property
 * panel offered `Height` as **0.5 – 2.0 m**; `UpdateHandrailCommand.canExecute`
 * refuses outside **0.3 – 2.5 m**. So the panel's spinner silently narrowed a range
 * the model accepts — a 0.4 m planter-edge rail and a 2.3 m security rail were both
 * authorable through chat and NOT through the panel, for no stated reason. That is
 * §FIX-STAIR-PANEL-BOUNDS-DRIFT one family over, and it is exactly what re-typing a
 * policy in a second place produces.
 *
 * Two KINDS of number live here and they are deliberately labelled, because
 * conflating them is how a panel-only refusal gets born:
 *
 *   · **ENFORCED** — `UpdateHandrailCommand.canExecute` REFUSES outside these.
 *     `HEIGHT_MIN/MAX`, `RAIL_DIAMETER_MIN` (exclusive), `POST_SPACING_MIN`.
 *   · **ADVISORY** — spinner affordances only. Nothing refuses on them, and the
 *     panel's number input does not block a typed value either. They exist so the
 *     arrows step sensibly, NOT to gate anything. Do not "harden" one into a
 *     refusal without adding the arm in the command at the same time — a UI that
 *     refuses what the command accepts is a lie about the model (L-942).
 */
export const HANDRAIL_CONSTRAINTS = {
    /** ENFORCED — UpdateHandrailCommand.canExecute. */
    HEIGHT_MIN: 0.3,
    /** ENFORCED — UpdateHandrailCommand.canExecute. */
    HEIGHT_MAX: 2.5,
    /** ENFORCED — must be finite and STRICTLY greater than 0. */
    RAIL_DIAMETER_MIN: 0.005,
    /** ADVISORY. */
    RAIL_DIAMETER_MAX: 0.25,
    /**
     * ENFORCED — must be finite and >= 0. Zero is MEANINGFUL and must stay
     * reachable: the built-in "Stair Handrail" type declares `postSpacing: 0`
     * (no posts), so a picker that forbade 0 would make a shipped type unauthorable.
     */
    POST_SPACING_MIN: 0,
    /** ADVISORY. */
    POST_SPACING_MAX: 5,
    /** ADVISORY. */
    THICKNESS_MIN: 0.005,
    /** ADVISORY. */
    THICKNESS_MAX: 0.3,
    /** ADVISORY. */
    BALUSTER_WIDTH_MIN: 0.005,
    /** ADVISORY. */
    BALUSTER_WIDTH_MAX: 0.3,
    /** ADVISORY. */
    BALUSTER_SPACING_MIN: 0.02,
    /** ADVISORY. */
    BALUSTER_SPACING_MAX: 1,
    /**
     * ADVISORY. The common guarding rules are the 100 mm sphere (0.099 m) and the
     * 90 mm sphere (0.089 m); the range is wider than both on purpose, because this
     * is a CODE value whose real authority is the jurisdiction, not this file.
     */
    INFILL_MAX_GAP_MIN: 0.02,
    /** ADVISORY. */
    INFILL_MAX_GAP_MAX: 0.3,
} as const;

export interface HandrailRailLayer {
    height: number;
    profile: HandrailRailProfile;
    thickness: number;
    diameter?: number;
    color?: string;
}

export interface HandrailData extends CoreElement {
    type: ElementType;
    baseLine: [Point3D, Point3D];
    height: number;
    thickness: number;
    baseOffset: number;
    /**
     * §FIX-STAIR-DELETE-ORPHANS-HANDRAILS (C95 §15.1) — the element this railing
     * is hosted BY, when it is hosted at all.
     *
     * ⛔ WITHOUT THIS FIELD THE MODEL COULD NOT ANSWER "which handrails belong to
     * this stair?", AND THAT IS WHY C95 §8.2 STOOD OPEN. The plugin DTO store had
     * a `hostId`; the authoritative record never did, and the bus bridge dropped
     * it (C95 §5). No stair-to-handrail semantic edge was written in production
     * either. So deleting a stair left its railings floating, and the comment in
     * `plugins/cross/src/stair-handrail.ts` deferred the cleanup to a
     * garbage-collect pass THAT DOES NOT EXIST — C84 §8.d's worst form, an open
     * defect made to look closed.
     *
     * Absent means FREE-STANDING, which is every handrail that existed before this
     * field, so it is additive and no record changes (C47 §1.2).
     */
    hostId?: string;
    /**
     * What KIND of thing hosts this railing. Kept beside `hostId` rather than
     * inferred from the id's prefix: an id-shape sniff is a vocabulary nobody
     * declared, and it silently mis-classifies the moment id formats change.
     */
    hostKind?: 'stair' | 'slab';
    materialId?: string;
    materialColor?: string;
    fillType?: HandrailFillType;
    railProfile?: HandrailRailProfile;
    railDiameter?: number;
    postSpacing?: number;
    balusterSpacing?: number;
    balusterShape?: HandrailBalusterShape;
    balusterWidth?: number;
    /**
     * §FEAT-HANDRAIL-INFILL-MAX-GAP (C95 §9, D5) — the maximum CLEAR opening
     * permitted between adjacent balusters, in metres.
     *
     * This is a CODE value, not a styling one: most guarding standards state the
     * rule as "a sphere of D mm must not pass through" (0.099 m under the common
     * 100 mm sphere rule; 0.089 m where a 90 mm rule applies). `balusterSpacing`
     * is a CENTRE-TO-CENTRE pitch, which is a different quantity — a 0.11 m pitch
     * with 0.02 m balusters leaves a 0.09 m gap, and the two numbers are only
     * equal when the baluster has zero width.
     *
     * ⚠ EI-8: this does NOT duplicate `balusterSpacing`. It is the CONSTRAINT;
     * the pitch is the RESULT. `HandrailFragmentBuilder` derives
     * `pitch = infillMaxGap + balusterWidth` only when no explicit
     * `balusterSpacing` / `postSpacing` is present, so an authored pitch always
     * wins and no existing handrail changes shape.
     */
    infillMaxGap?: number;
    /**
     * §FEAT-HANDRAIL-RUN-JOIN (C95 §D4) — suppress THIS segment's START post.
     *
     * A multi-segment run (an L-shaped rail, or a closed square / circular /
     * elliptical guard) is stored as N two-point handrails that share their
     * interior vertices. `HandrailFragmentBuilder` emits an end post at BOTH ends
     * of every segment, so a shared vertex would receive TWO coincident posts —
     * visible as a thickened, z-fighting stub at every corner and at the closure
     * point of a loop.
     *
     * The run generator therefore makes each vertex the responsibility of exactly
     * ONE segment: every segment after the first suppresses its start post, and in
     * a CLOSED loop the first segment suppresses its too (the last segment's END
     * post already stands on that vertex). Absent / false → previous behaviour,
     * bit-identical, so every existing handrail is unaffected.
     */
    suppressStartPost?: boolean;
    /**
     * §FEAT-HANDRAIL-POST-REDISTRIBUTE (C95 §15.3, R5) — HOW the run divides.
     *
     * `'redistribute'` (the DEFAULT, and what absent means) treats `postSpacing`
     * / `balusterSpacing` as a MAXIMUM: `n = ceil(L/s)` equal bays of `L/n`, so
     * the authored value is an upper bound that is never exceeded. That is what
     * the founder's *"every 10 cm, every 20 cm"* asks for and what
     * `infillMaxGap` already means (§9.3).
     *
     * `'fixed'` keeps the exact authored pitch and accepts one short end bay;
     * `'centred'` keeps the pitch and splits the remainder into two equal short
     * end bays. Both are real conventions and both must be ASKED FOR BY NAME —
     * the convention is never an accident.
     *
     * ⚠ Absent no longer means the historical `Math.floor(L/s) - 1`, which was an
     * off-by-one that left a final bay of up to TWICE the authored spacing. That
     * is a defect, not an authored intent, so it is not preserved. See
     * `packages/geometry-handrail/src/postStations.ts`.
     */
    postEndCondition?: HandrailPostEndCondition;
    railStructure?: HandrailRailLayer[];
    parameters?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface HandrailFragment {
    id: string;
    mesh: import('three').Mesh;
    parentId: string;
    levelId: string;
}
