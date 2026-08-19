/**
 * WallProfileVariants — §FEAT-WALL-PROFILE-EDIT-MATRIX. WHICH WALLS MAY BE PROFILE-EDITED,
 * asked per VARIANT rather than per element type.
 *
 * ─── THE DEFECT THIS EXISTS TO CLOSE (L-1065) ─────────────────────────────────
 *
 * The first cut of the Edit-Profile gate asked ONE question: *"is this a wall?"* A wall is
 * not one thing. It is straight or curved, vertical or raked, one layer or many, hosting
 * doors or not — and the profile geometry exists for some of those and not others. A single
 * boolean cannot say that, so it said the most optimistic thing it could: a RAKED wall was
 * OFFERED the editor while nothing had ever built a profile on a raked wall. That is C84
 * EI-3 live (UI offers ⇒ pipeline accepts), and it is the same defect
 * `ContextualEditBar.ts` records for floor and ceiling — *"came to show a button that did
 * nothing"* — wearing a different variant's clothes.
 *
 * ─── WHY A DATA TABLE AND NOT AN `if` CHAIN ───────────────────────────────────
 *
 * Three stated wall constraints dissolved on measurement in a single week: the curved rake
 * refusal was argued ill-posed and now ships as a cone (L-1062); the profiled wall's missing
 * mitre turned out to be *"the wrong FRAME rather than a real constraint"* (WJ1, c23157d1);
 * and the profile machinery itself was already built and merely unauthored. The honest
 * prior is therefore that MOST of these cells open shortly. A hard-coded chain would be
 * rewritten four times this week; a table gets one row flipped per delivery, by the lane
 * that measured it, with the assertion that proves it named in the row.
 *
 * ─── UNBUILT IS NOT IMPOSSIBLE (L-1067, and the founder's explicit point) ──────
 *
 * Every closed cell carries a `status`, and today **every single one of them is `unbuilt`**
 * — *not yet*, not *never*. That is a finding, not a formality: nothing in this matrix is
 * refused as a law. A refusal that reads like a law when it means "not yet" teaches the
 * author that their building is impossible, and they stop asking. `'impossible'` exists in
 * the type for a real one when a real one is found; it is currently unused, and the test
 * suite asserts that it is, so the day someone adds one they have to say so out loud.
 *
 * ─── ONE VOICE PER REFUSAL ────────────────────────────────────────────────────
 *
 * The sentences for `curved`, `layered` and `hosted-openings` are NOT written here. They are
 * obtained by asking `profileAuthorability` — the gate `WallStore.update`,
 * `WallDataSchema` and `UpdateElementParameterCommand.canExecute` all consult — with a
 * subject carrying exactly one axis, so the sentence the user reads is the gate's own,
 * verbatim, and cannot drift from the refusal the command would produce (C84 EI-9,
 * §REFUSAL-IDENTITY). Only `raked` is written here, because the gate has no rake arm at
 * all: the store would ACCEPT a profile on a raked wall. That gap is precisely L-1065.
 */

import { profileAuthorability, type ProfilePt2 } from './WallProfile';

/** How closed a closed cell is. */
export type WallProfileVariantStatus =
    /** The geometry exists and is asserted. Open. */
    | 'available'
    /** NOT YET. The combination is buildable and someone is building it. */
    | 'unbuilt'
    /** Never — the combination is ill-posed, not merely unwritten. NONE TODAY. */
    | 'impossible';

/** The independent axes a wall can differ on. One row each; combinations are conjunctions. */
export type WallProfileAxis = 'curved' | 'raked' | 'layered' | 'hosted-openings';

export interface WallProfileAxisRow {
    readonly axis: WallProfileAxis;
    readonly status: WallProfileVariantStatus;
    /**
     * When the reason is the shared gate's, name the probe that elicits it and leave the
     * text to the gate. When it is this module's own (rake), the text lives here and says
     * why the gate could not supply it.
     */
    readonly ownReason?: string;
    /** The lane / tag that will flip this row, so the row says who is holding it. */
    readonly owner?: string;
}

/**
 * THE MATRIX. Flip a row to `'available'` only when the lane that built the combination has
 * reported it BY NAME with an assertion behind it. An offered-but-unbuilt cell is worse than
 * a closed one, because the user believes it worked.
 *
 * Measured 2026-08-19: four rows, four `unbuilt`, zero `impossible`, zero `available`
 * beyond the plain wall (which is the absence of every axis and needs no row).
 */
export const WALL_PROFILE_AXES: ReadonlyArray<WallProfileAxisRow> = [
    {
        axis: 'raked',
        status: 'unbuilt',
        owner: 'WJ1 — profile × rake',
        ownReason:
            'Editing the outline of a RAKED (leaning) wall is not available YET — not because ' +
            'it is impossible, but because it has not been measured. The wall body already ' +
            'applies the lean to the profiled solid, and the profile is authored in the ' +
            'un-sheared frame precisely so the two compose — but no test has yet built a wall ' +
            'carrying BOTH, and an unverified promise is worse than a stated wait. It is being ' +
            'built now. Straighten the wall to vertical to edit its outline today.',
    },
    { axis: 'curved',          status: 'unbuilt', owner: 'WJ1 — profile × curved' },
    { axis: 'layered',         status: 'unbuilt', owner: 'WJ1 — profile × layers' },
    { axis: 'hosted-openings', status: 'unbuilt', owner: 'WJ1 — profile × openings' },
];

/** The wall subset this module reads. Same shape `profileAuthorability` judges. */
export interface WallProfileVariantSubject {
    readonly baseLine?: readonly [ProfilePt2, ProfilePt2];
    readonly height?: number;
    readonly curve?: unknown;
    readonly rakeAngleDeg?: number;
    readonly layers?: ReadonlyArray<unknown>;
    readonly openings?: ReadonlyArray<unknown>;
}

export interface WallProfileVariantVerdict {
    readonly ok: boolean;
    /** The axes that are active on this wall AND not yet open. Empty when `ok`. */
    readonly blockedBy: ReadonlyArray<WallProfileAxis>;
    readonly status?: WallProfileVariantStatus;
    /** Ready to show in a disabled-control tooltip or a status line. */
    readonly reason?: string;
}

/** 90° is vertical; absent / null / non-finite is vertical too. Same reading `WallRake` uses. */
function isRaked(deg: unknown): boolean {
    if (typeof deg !== 'number' || !Number.isFinite(deg)) return false;
    return Math.abs(deg - 90) > 1e-6;
}

/** Which axes are active on this wall. Exported for the census tests. */
export function wallProfileActiveAxes(w: WallProfileVariantSubject): WallProfileAxis[] {
    const out: WallProfileAxis[] = [];
    if (w.curve !== undefined && w.curve !== null) out.push('curved');
    if (isRaked(w.rakeAngleDeg)) out.push('raked');
    if (w.layers != null && w.layers.length > 1) out.push('layered');
    if (w.openings != null && w.openings.length > 0) out.push('hosted-openings');
    return out;
}

/**
 * The gate's OWN sentence for a single axis, elicited by a subject carrying only that axis
 * on an otherwise unremarkable wall. Returns `null` for an axis the gate has no arm for
 * (today: `raked`), which is itself the fact that makes L-1065 possible.
 */
export function gateSentenceForAxis(axis: WallProfileAxis): string | null {
    const base = {
        wallProfile: { ring: [{ u: 0, v: 0 }, { u: 4, v: 0 }, { u: 4, v: 3 }] },
        baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }] as readonly [ProfilePt2, ProfilePt2],
        height: 3,
    };
    const probe =
        axis === 'curved'  ? { ...base, curve: { control: { x: 2, z: 1 }, segments: 8 } } :
        axis === 'layered' ? { ...base, layers: [{}, {}] } :
        axis === 'hosted-openings' ? { ...base, openings: [{}] } :
        base;
    const verdict = profileAuthorability(probe as Parameters<typeof profileAuthorability>[0]);
    return verdict.ok ? null : (verdict.reason ?? null);
}

/** What IS available today — named in every refusal, per C16 CA-18. */
export const WALL_PROFILE_AVAILABLE_TODAY =
    'Straight, vertical, single-layer walls that host no doors or windows can have their ' +
    'outline edited today.';

/**
 * May THIS wall's outline be edited?
 *
 * `ok` iff every active axis is an open cell. The refusal names each blocking axis with the
 * gate's own words where the gate has them, states whether it is NOT-YET or NEVER, and names
 * what does work — so an author is never left with a "no" that sounds like a law.
 */
export function wallProfileVariantAvailability(
    w: WallProfileVariantSubject,
): WallProfileVariantVerdict {
    const active = wallProfileActiveAxes(w);
    const blocked = WALL_PROFILE_AXES.filter(
        (row) => active.includes(row.axis) && row.status !== 'available',
    );
    if (blocked.length === 0) return { ok: true, blockedBy: [] };

    // `impossible` dominates `unbuilt` when both are present: the stronger claim is the one
    // that describes the author's situation truthfully.
    const status: WallProfileVariantStatus =
        blocked.some((r) => r.status === 'impossible') ? 'impossible' : 'unbuilt';

    const parts = blocked.map(
        (row) => row.ownReason ?? gateSentenceForAxis(row.axis) ?? `Not available for a ${row.axis} wall.`,
    );
    const lead = status === 'unbuilt' ? 'NOT YET — ' : '';

    return {
        ok: false,
        blockedBy: blocked.map((r) => r.axis),
        status,
        reason: `${lead}${parts.join(' ')} ${WALL_PROFILE_AVAILABLE_TODAY}`,
    };
}
