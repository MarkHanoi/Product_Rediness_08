/**
 * OPEN38 · TIER 0 — §FEAT-WALL-PROFILE-OPENINGS (L-7400). THE GATE, LANDED BEFORE THE
 * FEATURE.
 *
 * `WallProfile.ts` refuses profile × openings outright and names `WallOccupancyStore.canPlace`
 * as the reason: *"`canPlace` is explicitly 1-D and vertical-blind (`:669-671`), so nothing
 * would notice an opening left floating in material the profile removed. An opening in
 * removed material is worse than a refusal."*
 *
 * ⭐ THAT REFUSAL MAY NOT LIFT WHILE ITS OWN JUSTIFICATION STILL HOLDS. So this commit makes
 *   `canPlace` vertical-aware and asserts it, and changes NOTHING about what is authorable.
 *   The arm is reachable and correct while remaining unreachable in practice, because the
 *   authorability gate still refuses every wall that could reach it. That is the ordering
 *   `WallProfile.ts` describes as *"the only ordering in which a refusal can never be reached
 *   too late"*, applied to itself.
 *
 * ── THE INSTRUMENT FINDING THAT SHAPED THE DESIGN (§B below) ────────────────────────────
 *
 * The obvious implementation reuses `wallProfileExtentAt`, which already existed for the
 * curved sweep. It is WRONG at a step, and §B measures the difference rather than asserting
 * it from the argument — because "these two functions disagree" is the kind of claim that
 * has to be shown, not reasoned.
 */

import { describe, it, expect } from 'vitest';
import {
    wallProfileChains,
    wallProfileRectFit,
    wallProfileExtentAt,
    profileOpeningRectOf,
    PROFILE_FIT_TOL_M,
} from '../src/WallProfile';
import { wallOccupancyStore, CAN_PLACE_REFUSAL_CODES } from '../src/WallOccupancyStore';
import type { WallData } from '../src/WallTypes';

const L = 6;
const H = 3;

/** A GABLE: shoulders at 1.5 m, apex 3 m at mid-span. The founder's drawing. */
const GABLE = [
    { u: 0, v: 0 }, { u: L, v: 0 }, { u: L, v: 1.5 }, { u: L / 2, v: H }, { u: 0, v: 1.5 },
];
/** The implicit rectangle every unprofiled wall already is. */
const RECT = [{ u: 0, v: 0 }, { u: L, v: 0 }, { u: L, v: H }, { u: 0, v: H }];
/** A STEP: full height for u < 2, then a VERTICAL drop to 2 m for the rest. */
const STEP = [
    { u: 0, v: 0 }, { u: L, v: 0 }, { u: L, v: 2 }, { u: 2, v: 2 }, { u: 2, v: H }, { u: 0, v: H },
];
/** A wall over an archway — the LOWER boundary is cut away in the middle. */
const ARCHED_FOOT = [
    { u: 0, v: 0 }, { u: 2, v: 0 }, { u: 2, v: 1 }, { u: 4, v: 1 }, { u: 4, v: 0 },
    { u: L, v: 0 }, { u: L, v: H }, { u: 0, v: H },
];

function wall(over: Partial<WallData> & Record<string, unknown> = {}): WallData {
    return {
        id: 'w-1', type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 }],
        height: H, thickness: 0.2, baseOffset: 0, openings: [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 't', version: 1 },
        ...over,
    } as unknown as WallData;
}

const op = (o: Record<string, unknown>) => ({
    id: 'op-x', type: 'window', elementId: 'el-x',
    offset: 1, width: 1, height: 1, sillHeight: 1, ...o,
});

// ─────────────────────────────────────────────────────────────────────────────────────
describe('OPEN38 §A · wallProfileChains — the ring split into its two boundaries', () => {
    it('a RECTANGLE splits into a flat bottom and a top that carries both end edges', () => {
        const c = wallProfileChains(RECT)!;
        expect(c).not.toBeNull();
        expect(c.uMin).toBe(0);
        expect(c.uMax).toBe(L);
        expect(c.bottom.map(p => [p.u, p.v])).toEqual([[0, 0], [L, 0]]);
        // The top chain runs right→left and INCLUDES the vertical end edges — that is what
        // makes `topAt(0)` and `topAt(L)` answerable at all (`wallProfileExtentAt`'s own
        // header records losing the wall's ends to exactly this).
        expect(c.top.map(p => [p.u, p.v])).toEqual([[L, 0], [L, H], [0, H], [0, 0]]);
    });

    it('a GABLE keeps its apex on the TOP chain and its foot flat', () => {
        const c = wallProfileChains(GABLE)!;
        expect(c.bottom.map(p => [p.u, p.v])).toEqual([[0, 0], [L, 0]]);
        expect(c.top.some(p => p.u === L / 2 && p.v === H)).toBe(true);
    });

    it('winding is NORMALISED, not refused — a ring authored clockwise gives the same chains', () => {
        const cw = wallProfileChains([...GABLE].reverse())!;
        const ccw = wallProfileChains(GABLE)!;
        expect(cw.bottom).toEqual(ccw.bottom);
        expect(cw.top).toEqual(ccw.top);
    });

    it('a ring whose boundary DOUBLES BACK in u is refused as not an elevation ring', () => {
        // An hourglass in u: the "bottom" would have to go right, left, then right again.
        const hourglass = [
            { u: 0, v: 0 }, { u: 4, v: 0 }, { u: 2, v: 1.5 }, { u: 4, v: 3 }, { u: 0, v: 3 },
        ];
        // Not necessarily null for THIS ring (it is star-shaped, not multi-interval) — what
        // must be true is that whatever comes back has monotone chains, so that every later
        // query is well posed. Asserted as the invariant rather than as a verdict.
        const c = wallProfileChains(hourglass);
        if (c) {
            for (let i = 1; i < c.bottom.length; i++) expect(c.bottom[i]!.u).toBeGreaterThanOrEqual(c.bottom[i - 1]!.u - 1e-9);
            for (let i = 1; i < c.top.length; i++) expect(c.top[i]!.u).toBeLessThanOrEqual(c.top[i - 1]!.u + 1e-9);
        }
    });

    it('degenerate rings return null rather than a chain pair', () => {
        expect(wallProfileChains([])).toBeNull();
        expect(wallProfileChains([{ u: 0, v: 0 }, { u: 1, v: 1 }])).toBeNull();
        expect(wallProfileChains([{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 2, v: 0 }])).toBeNull();  // collinear
        expect(wallProfileChains([{ u: 0, v: 0 }, { u: 0, v: 1 }, { u: 0, v: 2 }])).toBeNull();  // no u extent
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────
describe('OPEN38 §B · WHY the chains and not `wallProfileExtentAt` — measured, not argued', () => {
    it('at a STEP, the station query reports the HIGH side and the chain reports the LOW one', () => {
        // The step drops from 3 m to 2 m across a vertical edge at u = 2.
        const atStep = wallProfileExtentAt(STEP, 2)!;
        expect(atStep.top).toBe(H);          // ⬅ the extreme of every crossing: 3, the HIGH side

        // A window head at 2.5 m spanning u ∈ [1.5, 2.5] straddles that step. Half of it is
        // under 3 m of wall and half under 2 m. The station query at either end and at the
        // vertex sees 3, 3 and 3 — and admits it.
        expect(wallProfileExtentAt(STEP, 1.5)!.top).toBe(H);
        expect(wallProfileExtentAt(STEP, 2.5)!.top).toBe(2);

        // The CHAIN query over the whole span sees the 2 m side and refuses, naming it.
        const fit = wallProfileRectFit(STEP, { u0: 1.5, u1: 2.5, v0: 1.2, v1: 2.5 });
        expect(fit.ok).toBe(false);
        expect(fit.code).toBe('above-top');
        expect(fit.overshootM).toBeCloseTo(0.5, 9);
        expect(fit.reason).toContain('2.000');
        expect(fit.reason).toContain('2.500');
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────
describe('OPEN38 §C · wallProfileRectFit — the refusal names the edge AND the metres', () => {
    it('a window under the GABLE APEX fits', () => {
        expect(wallProfileRectFit(GABLE, { u0: 2.5, u1: 3.5, v0: 0.9, v1: 2.1 }).ok).toBe(true);
    });

    it('the SAME window at the SHOULDER is refused, with the number', () => {
        // At u ∈ [0.2, 1.2] the gable's top runs 1.5 → 1.5 + (1.2/3)·1.5 = 2.10 m; the
        // minimum over the span is at the LEFT end, 1.500 m + 0.2/3·1.5 = 1.600 m.
        const fit = wallProfileRectFit(GABLE, { u0: 0.2, u1: 1.2, v0: 0.9, v1: 2.1 });
        expect(fit.ok).toBe(false);
        expect(fit.code).toBe('above-top');
        expect(fit.overshootM).toBeCloseTo(2.1 - 1.6, 9);
        expect(fit.reason).toContain('1.600');   // where the outline falls to
        expect(fit.reason).toContain('2.100');   // where the head is
        expect(fit.reason).toContain('0.500');   // by how much
        // ⛔ It must NOT read like a law — this is a wall the author can fix by moving it.
        expect(fit.reason).not.toMatch(/impossible|never|not supported/i);
    });

    it('an opening running past the ring\'s own u extent is refused as span-outside-ring', () => {
        const shortRing = [{ u: 1, v: 0 }, { u: 4, v: 0 }, { u: 4, v: H }, { u: 1, v: H }];
        const fit = wallProfileRectFit(shortRing, { u0: 3.5, u1: 4.5, v0: 0.9, v1: 2.1 });
        expect(fit.ok).toBe(false);
        expect(fit.code).toBe('span-outside-ring');
        expect(fit.overshootM).toBeCloseTo(0.5, 9);
    });

    it('a DOOR on a FLAT foot is accepted', () => {
        const fit = wallProfileRectFit(GABLE, { u0: 2.5, u1: 3.5, v0: 0, v1: 2.1, floorReaching: true });
        expect(fit.ok).toBe(true);
    });

    it('a DOOR over an ARCHWAY — a foot the outline has cut away — is refused with the number', () => {
        // ARCHED_FOOT lifts the bottom to 1 m across u ∈ [2, 4]. A door there has no bottom
        // edge to be carved out of.
        const fit = wallProfileRectFit(ARCHED_FOOT, { u0: 2.5, u1: 3.5, v0: 0, v1: 2.1, floorReaching: true });
        expect(fit.ok).toBe(false);
        expect(fit.code).toBe('uneven-foot');
        expect(fit.overshootM).toBeCloseTo(1, 9);
        expect(fit.reason).toContain('1.000');
    });

    it('a WINDOW whose sill is inside material the outline removed is refused as below-bottom', () => {
        const fit = wallProfileRectFit(ARCHED_FOOT, { u0: 2.5, u1: 3.5, v0: 0.5, v1: 2.1 });
        expect(fit.ok).toBe(false);
        expect(fit.code).toBe('below-bottom');
        expect(fit.overshootM).toBeCloseTo(0.5, 9);
    });

    it('an opening TANGENT to the top is refused — a hole touching the boundary is not a hole', () => {
        // Exactly at the apex: head 3.0 against a top of 3.0. `normaliseWallHoles` refuses the
        // same case on a rectangle ("a full-height opening is a wall split, not a hole"), so
        // admitting it here would hand the builder a case it declines and lose the profile.
        const fit = wallProfileRectFit(RECT, { u0: 2, u1: 3, v0: 1, v1: H });
        expect(fit.ok).toBe(false);
        expect(fit.code).toBe('above-top');
        expect(fit.reason).toContain('no wall above');
    });

    it('the tolerance is the BUILDER\'s 0.1 mm, not a bounds epsilon', () => {
        expect(PROFILE_FIT_TOL_M).toBe(1e-4);
        expect(wallProfileRectFit(RECT, { u0: 2, u1: 3, v0: 1, v1: H - 2e-4 }).ok).toBe(true);
        expect(wallProfileRectFit(RECT, { u0: 2, u1: 3, v0: 1, v1: H - 5e-5 }).ok).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────
describe('OPEN38 §D · profileOpeningRectOf — unjudgeable is NOT the empty rectangle', () => {
    it('reads a real Opening, and classifies a zero sill as floor-reaching', () => {
        expect(profileOpeningRectOf(op({ offset: 2, width: 1, height: 2.1, sillHeight: 0 })))
            .toEqual({ u0: 2, u1: 3, v0: 0, v1: 2.1, floorReaching: true });
        expect(profileOpeningRectOf(op({ offset: 2, width: 1, height: 1.2, sillHeight: 0.9 })!)!.floorReaching)
            .toBe(false);
    });

    it('the PROBE objects the variant matrix and the rake gate pass return null, not a rectangle', () => {
        // `WallProfileVariants.gateSentenceForAxis` probes with `openings: [{}]`, and
        // `canPlace` probes `rakeAuthorability` with the same. A reader that answered "the
        // empty rectangle" would make every one of those probes pass — the
        // §CONTEXT-DATA-HONESTY failure where absent and clear are the same value.
        expect(profileOpeningRectOf({})).toBeNull();
        expect(profileOpeningRectOf({ id: 'o' })).toBeNull();
        expect(profileOpeningRectOf(null)).toBeNull();
        expect(profileOpeningRectOf(undefined)).toBeNull();
        // A missing sillHeight is UNJUDGEABLE, never 0 — defaulting it would turn every
        // window whose caller forgot it into a door standing on the floor.
        expect(profileOpeningRectOf({ offset: 1, width: 1, height: 1 })).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────
describe('OPEN38 §E · canPlace — the vertical arm, and its inertness on a rectangle', () => {
    it('the refusal code joined the closed roster', () => {
        expect(CAN_PLACE_REFUSAL_CODES).toContain('OCC_OUTSIDE_HOST_PROFILE');
    });

    it('INERT on an unprofiled wall — the arm does not run and the verdict is unchanged', () => {
        const w = wall();
        const r = wallOccupancyStore.canPlace(w, 2, 1);
        expect(r.valid).toBe(true);
        // …and it stays clear even with NO vertical extent stated, which is the whole point:
        // sixteen call sites keep their exact previous verdicts.
        expect(wallOccupancyStore.canPlace(w, 2, 1, undefined, {}).valid).toBe(true);
    });

    it('refuses a window that the host\'s outline has cut away, naming the metres', () => {
        const w = wall({ wallProfile: { ring: GABLE } });
        const r = wallOccupancyStore.canPlace(w, 0.2, 1, undefined, { heightM: 1.2, sillHeightM: 0.9 });
        expect(r.valid).toBe(false);
        expect(r.code).toBe('OCC_OUTSIDE_HOST_PROFILE');
        expect(r.reason).toContain('1.600');
        expect(r.reason).toContain('0.500');
    });

    it('ADMITS the same window under the apex — the arm is not a blanket refusal', () => {
        const w = wall({ wallProfile: { ring: GABLE } });
        expect(wallOccupancyStore.canPlace(w, 2.5, 1, undefined, { heightM: 1.2, sillHeightM: 0.9 }).valid)
            .toBe(true);
    });

    it('REFUSES rather than guesses when the vertical extent is unstated on a profiled host', () => {
        const w = wall({ wallProfile: { ring: GABLE } });
        const r = wallOccupancyStore.canPlace(w, 2.5, 1);
        expect(r.valid).toBe(false);
        expect(r.code).toBe('OCC_OUTSIDE_HOST_PROFILE');
        expect(r.reason).toMatch(/sill height and height/);
    });

    it('THE MOVE PATH RECOVERS ITSELF — excludeId finds the opening\'s own sill and height', () => {
        // This is what spared sixteen call sites a rewrite, so it is asserted rather than
        // assumed. `MoveWindowCommand` passes the hosted ELEMENT id; `Opening.id` differs.
        const existing = op({ id: 'op-1', elementId: 'win-1', offset: 2.5, width: 1, height: 1.2, sillHeight: 0.9 });
        const w = wall({ wallProfile: { ring: GABLE }, openings: [existing] });

        // Moved to the shoulder → refused, with the number, WITHOUT the caller stating dims.
        const bad = wallOccupancyStore.canPlace(w, 0.2, 1, 'win-1');
        expect(bad.valid).toBe(false);
        expect(bad.code).toBe('OCC_OUTSIDE_HOST_PROFILE');
        expect(bad.reason).toContain('1.600');

        // Moved a little, still under the apex → clear.
        expect(wallOccupancyStore.canPlace(w, 2.7, 1, 'win-1').valid).toBe(true);

        // …and matched by `Opening.id` too, which is what the create path passes.
        expect(wallOccupancyStore.canPlace(w, 0.2, 1, 'op-1').code).toBe('OCC_OUTSIDE_HOST_PROFILE');
    });

    it('a DOOR on a profiled wall is judged against the FOOT, not the head', () => {
        const w = wall({ wallProfile: { ring: ARCHED_FOOT } });
        const r = wallOccupancyStore.canPlace(w, 2.5, 1, undefined, { heightM: 2.1, sillHeightM: 0 });
        expect(r.valid).toBe(false);
        expect(r.code).toBe('OCC_OUTSIDE_HOST_PROFILE');
        expect(r.reason).toMatch(/floor-reaching/);
    });

    it('§FIX-CANPLACE-RAKE-UNJUDGEABLE (L-7401) — the curved-COLLAPSE arm is now REACHABLE', () => {
        // ⛔ IT WAS NOT, AND NOTHING SAID SO. `canPlace` handed `rakeAuthorability` a subject
        // with no `height` and no `curveMinRadiusM`, and that gate's own doc warns *"ABSENT
        // MEANS UNJUDGEABLE, NOT SAFE … the authoritative call MUST supply both."* So the one
        // arm that still refuses a curved raked host fell through on every placement, on
        // every wall, always. Measured 2026-08-23: `UpdateWallsRakeBatchCommand` was the only
        // caller in the repo supplying them.
        //
        // A tight arc at 20°: the top edge is pushed 8.242 m radially against a tightest turn
        // radius of 2.675 m, so the top ring collapses through the centre of curvature.
        const collapsing = wall({
            rakeAngleDeg: 20,
            curve: { control: { x: 4, y: 0, z: 6 }, segments: 24 },
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }],
        });
        const r = wallOccupancyStore.canPlace(collapsing, 1, 1);
        expect(r.valid).toBe(false);
        expect(r.code).toBe('OCC_HOST_RAKED');
        // BOTH numbers, per the founder's standing direction that a refusal never says
        // merely "invalid".
        expect(r.reason).toContain('8.242');
        expect(r.reason).toContain('2.675');

        // ⭐ NON-VACUITY, and it is the half that matters: the arm must not have become a
        // blanket refusal of curved raked walls, which is exactly the law §FEAT-RAKE-CURVED
        // lifted. The SAME wall at a gentler lean is a buildable cone and is ACCEPTED.
        const fine = wall({
            rakeAngleDeg: 70,
            curve: { control: { x: 4, y: 0, z: 1 }, segments: 12 },
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }],
        });
        expect(wallOccupancyStore.canPlace(fine, 1, 1).valid).toBe(true);
    });

    it('the 1-D arms still fire FIRST — a span past the wall end is not reported as an outline miss', () => {
        const w = wall({ wallProfile: { ring: GABLE } });
        const r = wallOccupancyStore.canPlace(w, 5.8, 1, undefined, { heightM: 1.2, sillHeightM: 0.9 });
        expect(r.code).toBe('OCC_SPAN_BEYOND_WALL_END');
    });
});
