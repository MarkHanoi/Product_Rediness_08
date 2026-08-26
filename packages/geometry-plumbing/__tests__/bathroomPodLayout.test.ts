/**
 * §FEAT-BATHROOM-POD-COMPOUND (L-11400..L-11404) · C109 §5 · C74 · C16 CA-18.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ WHAT THIS SUITE IS FOR, AND THE ONE ASSERTION IT REFUSES TO MAKE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * C109 R-10 (inherited from C104 R-9) FORBIDS asserting that a dimension EQUALS a
 * documented default: such a test goes RED on a deliberate change and GREEN on a
 * silently-ignored override, which is the exact inverse of what a test is for. So
 * nothing below reads `TOILET_FOOTPRINTS.close_coupled_round.width === 0.42`.
 *
 * What it asserts instead is RELATIONSHIPS and HONOURED INPUTS:
 *   • a fixture's footprint is UNCHANGED when the room changes (§1.1 — the whole ask);
 *   • the required run is the SUM of footprints plus the MAX-not-SUM of clearances;
 *   • Rule A is preferred over Rule B when both fit;
 *   • a refusal carries BOTH numbers and they are ARITHMETICALLY TRUE;
 *   • the solver is DETERMINISTIC, which is what makes `arrangement` derivable.
 */

import { describe, it, expect } from 'vitest';
import {
    BATHROOM_POD_CLEARANCES,
    BATHROOM_POD_DEFAULT_MEMBERS,
    podGapBetween,
    podShowerVariantFor,
} from '../src/BathroomPodRules';
import {
    bathroomPodMemberCount,
    bathroomPodMemberOrder,
    buildBathroomPod,
    solveBathroomPodLayout,
    type BathroomPodLayoutInput,
} from '../src/BathroomPodAssembly';
import {
    bathroomPodChildIds,
    bathroomPodMemberOfKind,
    validateBathroomPod,
    type BathroomPodMemberKind,
} from '../src/BathroomPodTypes';

/** A room at the origin, unrotated, so local == world and a failure is readable. */
const room = (clearWidth: number, clearDepth: number, rotation = 0): BathroomPodLayoutInput['room'] => ({
    clearWidth,
    clearDepth,
    origin: { x: 0, y: 0, z: 0 },
    rotation,
});

const idsFor = (members: readonly BathroomPodMemberKind[]): string[] =>
    bathroomPodMemberOrder(members).map((k, i) => `m_${k}_${i}`);

const input = (
    clearWidth: number,
    clearDepth: number,
    members: readonly BathroomPodMemberKind[] = BATHROOM_POD_DEFAULT_MEMBERS,
    handedness: 'left' | 'right' = 'left',
    rotation = 0,
): BathroomPodLayoutInput => ({
    room: room(clearWidth, clearDepth, rotation),
    handedness,
    members,
    memberIds: idsFor(members),
});

describe('§BATH98 A — PARAMETRIC means the LAYOUT adapts; the FIXTURES do not scale (C109 §1.1)', () => {
    it('A-1 ⭐ the SAME WC footprint comes out of a 2.6 m room and a 4.0 m room', () => {
        // ⚠ 2.6 m, not 2.2 m, AND THAT IS A MEASUREMENT RATHER THAN A CONVENIENCE.
        // The default module needs 2.27 m of clear wall (walk-in shower 1.00 + 0.10 +
        // WC 0.42 + 0.10 + basin 0.65), so a 2.2 m room is CORRECTLY REFUSED — see D-6,
        // which pins that refusal rather than letting this test quietly hide it by
        // choosing a room that fits.
        const small = solveBathroomPodLayout(input(2.6, 2.4));
        const large = solveBathroomPodLayout(input(4.0, 3.5));
        expect(small.ok).toBe(true);
        expect(large.ok).toBe(true);
        if (!small.ok || !large.ok) return;

        const wcSmall = small.members.find((m) => m.kind === 'wc')!;
        const wcLarge = large.members.find((m) => m.kind === 'wc')!;

        // ⛔ THE CLAUSE THE WHOLE FAMILY EXISTS FOR. A WC is ~700 mm deep whatever the
        // room is. If a future change makes the solver scale, THIS is the assertion that
        // goes red — and it is a RELATIONSHIP (two solves agree), not a pinned literal,
        // so a deliberate change to the WC's real size leaves it green.
        expect(wcLarge.footprint).toEqual(wcSmall.footprint);
        expect(large.members.find((m) => m.kind === 'basin')!.footprint)
            .toEqual(small.members.find((m) => m.kind === 'basin')!.footprint);
        expect(large.members.find((m) => m.kind === 'shower')!.footprint)
            .toEqual(small.members.find((m) => m.kind === 'shower')!.footprint);
    });

    it('A-2 what DOES change is the position — the wall run is re-laid, not re-scaled', () => {
        const a = solveBathroomPodLayout(input(2.2, 2.2, ['wc', 'basin']));
        const b = solveBathroomPodLayout(input(3.4, 2.2, ['wc', 'basin']));
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        // Same footprints...
        expect(a.members[0]!.footprint).toEqual(b.members[0]!.footprint);
        // ...and the run starts at the same place, because the run is packed from the
        // left end of the primary wall rather than centred. A pod in a wider room leaves
        // the surplus at the far end, which is what a real bathroom does.
        expect(a.members.map((m) => m.position.x)).toEqual(b.members.map((m) => m.position.x));
    });
});

describe('§BATH98 B — the run arithmetic (C109 §5.3)', () => {
    it('B-1 required run is Σ footprints + Σ gaps, and a gap is MAX not SUM of the two side clearances', () => {
        const solved = solveBathroomPodLayout(input(4.0, 3.0));
        expect(solved.ok).toBe(true);
        if (!solved.ok) return;

        const order = bathroomPodMemberOrder(BATHROOM_POD_DEFAULT_MEMBERS);
        const placed = order.map((k) => solved.members.find((m) => m.kind === k)!);

        for (let i = 1; i < placed.length; i++) {
            const prev = placed[i - 1]!;
            const cur = placed[i]!;
            const prevRight = prev.position.x + prev.footprint.width / 2;
            const curLeft = cur.position.x - cur.footprint.width / 2;
            const gap = curLeft - prevRight;
            const expected = podGapBetween(prev.kind, cur.kind);
            expect(gap).toBeCloseTo(expected, 9);
            // ⭐ MAX, NOT SUM — the property `podGapBetween`'s docstring argues. Summing
            // would inflate every module by the total of every clearance and refuse rooms
            // that build perfectly well.
            expect(expected).toBe(
                Math.max(
                    BATHROOM_POD_CLEARANCES[prev.kind].clearSides,
                    BATHROOM_POD_CLEARANCES[cur.kind].clearSides,
                ),
            );
            expect(gap).toBeLessThanOrEqual(
                BATHROOM_POD_CLEARANCES[prev.kind].clearSides +
                    BATHROOM_POD_CLEARANCES[cur.kind].clearSides +
                    // Float noise from `curLeft - prevRight`: the measured value came out
                    // 0.10000000000000009 against a 0.1 ceiling. A nanometre is a million
                    // times finer than any tolerance this repo models with (C73), and
                    // asserting exact binary equality on a subtraction would make this
                    // test fail for a reason that has nothing to do with clearances.
                    1e-9,
            );
        }
    });

    it('B-2 no two members overlap, ever (C109 R-3)', () => {
        for (const w of [2.2, 2.6, 3.0, 4.0, 5.0]) {
            const solved = solveBathroomPodLayout(input(w, 3.0));
            if (!solved.ok) continue;
            const onPrimary = solved.members
                .filter((m) => m.wall === 'primary')
                .sort((a, b) => a.position.x - b.position.x);
            for (let i = 1; i < onPrimary.length; i++) {
                const prevRight = onPrimary[i - 1]!.position.x + onPrimary[i - 1]!.footprint.width / 2;
                const curLeft = onPrimary[i]!.position.x - onPrimary[i]!.footprint.width / 2;
                expect(curLeft).toBeGreaterThanOrEqual(prevRight - 1e-9);
            }
        }
    });

    it('B-3 every member sits with its BACK on its wall, inside the room depth', () => {
        const solved = solveBathroomPodLayout(input(4.0, 3.0));
        expect(solved.ok).toBe(true);
        if (!solved.ok) return;
        for (const m of solved.members) {
            if (m.wall !== 'primary') continue;
            // ⚠ AMENDED 2026-08-26 (§PLUMBFRAME, founder · L-11490). This read
            // `expect(m.position.z).toBeCloseTo(m.footprint.length / 2, 9)` with the
            // comment *"Back face at local z = 0 => centre at half the depth"*. The
            // PREMISE was right and the assertion pinned the WRONG POINT: `position` on
            // a `PlumbingFixtureData` is the midpoint of the WALL-CONTACT EDGE, and
            // every consumer builds the body over z ∈ [0, length] from it
            // (`PlumbingFixtureFrame.ts`). Asserting the centre made this suite GREEN on
            // a solver that pushed every member half its own depth into the room — the
            // founder's straddling shower plate, at pod scale.
            expect(m.position.z).toBeCloseTo(0, 9);
            // …and the whole body still fits inside the room depth, measured from the
            // anchor rather than about it.
            expect(m.position.z + m.footprint.length).toBeLessThanOrEqual(3.0 + 1e-9);
        }
    });

    it('B-4 an ACCESSORY consumes no wall run — a towel rail must not refuse a room', () => {
        const withoutRail = solveBathroomPodLayout(input(2.4, 2.2, ['wc', 'basin']));
        const withRail = solveBathroomPodLayout(input(2.4, 2.2, ['wc', 'basin', 'accessory']));
        expect(withoutRail.ok).toBe(true);
        expect(withRail.ok).toBe(true);
        if (!withoutRail.ok || !withRail.ok) return;
        // The floor-standing members land in exactly the same places.
        for (const kind of ['wc', 'basin'] as const) {
            expect(withRail.members.find((m) => m.kind === kind)!.position)
                .toEqual(withoutRail.members.find((m) => m.kind === kind)!.position);
        }
        expect(withRail.members.some((m) => m.kind === 'accessory')).toBe(true);
    });
});

describe('§BATH98 C — arrangement: Rule A first, Rule B as the fallback (C109 §5.3)', () => {
    it('C-1 ⭐ SINGLE-WALL is chosen whenever it fits, even though L-SHAPED would also fit', () => {
        // A generous room: both arrangements are geometrically possible.
        const solved = solveBathroomPodLayout(input(5.0, 3.5));
        expect(solved.ok).toBe(true);
        if (!solved.ok) return;
        // ⛔ Preferring the L-shape "because it fits more" would silently choose the more
        // expensive building (drainage on two walls) every time both fit.
        expect(solved.arrangement).toBe('single-wall');
        expect(solved.members.every((m) => m.wall === 'primary')).toBe(true);
    });

    it('C-2 a BATH pod too narrow for one wall but deep enough falls back to L-SHAPED', () => {
        // A bath is 1.70 wide x 0.75 deep, so turning it onto a return wall trades a
        // 1.70 m bite out of the primary run for a 0.75 m one — a real ~1.0 m saving,
        // which is what an L-shaped bathroom IS.
        const wide = solveBathroomPodLayout(input(5.0, 3.0, ['bath', 'wc', 'basin']));
        expect(wide.ok).toBe(true);
        if (!wide.ok) return;
        expect(wide.arrangement).toBe('single-wall');

        const narrow = solveBathroomPodLayout(input(2.4, 2.4, ['bath', 'wc', 'basin']));
        expect(narrow.ok).toBe(true);
        if (!narrow.ok) return;
        expect(narrow.arrangement).toBe('l-shaped');
        const bath = narrow.members.find((m) => m.kind === 'bath')!;
        expect(bath.wall).toBe('left-return');
        // The rest stay on the primary wall.
        expect(narrow.members.filter((m) => m.wall === 'primary').map((m) => m.kind).sort())
            .toEqual(['basin', 'wc']);
    });

    it('C-2b ⭐ L-SHAPED is NOT offered when it would free NO run — measured, not assumed', () => {
        // ═══════════════════════════════════════════════════════════════════════
        // ⭐ A FINDING THIS SUITE PRODUCED, AND IT REFUTES THE OBVIOUS READING OF
        // "L-SHAPED IS THE FALLBACK FOR A NARROW ROOM".
        // ═══════════════════════════════════════════════════════════════════════
        // Turning a wet member onto a return wall frees primary-wall run ONLY when the
        // member's DEPTH is smaller than its WIDTH plus its gap — i.e. only when it is
        // wider than it is deep. The default walk-in shower is 1.00 wide x 1.20 deep,
        // so moving it onto a return wall COSTS 0.10 m rather than saving any:
        //     single-wall bite = 1.00 (width) + 0.10 (gap) = 1.10
        //     return-wall bite = 1.20 (depth)
        // The solver therefore correctly DECLINES Rule B for the default member set and
        // refuses instead. ⛔ That is not a hole in Rule B — it is what an L-shaped
        // bathroom actually is, and a "fallback" that made this case fit would have to
        // overlap the shower with the WC. Rule B earns its place on the BATH (C-2),
        // where the same arithmetic frees a full metre.
        const solved = solveBathroomPodLayout(input(2.2, 3.0));
        expect(solved.ok).toBe(false);
        if (solved.ok) return;
        expect(solved.shortfall.axis).toBe('width');
        expect(solved.reason).toMatch(/remove the shower/);
    });

    it('C-3 handedness mirrors the run: the shower takes the other end', () => {
        const left = solveBathroomPodLayout(input(4.0, 3.0, BATHROOM_POD_DEFAULT_MEMBERS, 'left'));
        const right = solveBathroomPodLayout(input(4.0, 3.0, BATHROOM_POD_DEFAULT_MEMBERS, 'right'));
        expect(left.ok && right.ok).toBe(true);
        if (!left.ok || !right.ok) return;
        const lShower = left.members.find((m) => m.kind === 'shower')!;
        const rShower = right.members.find((m) => m.kind === 'shower')!;
        expect(lShower.position.x).toBeLessThan(2.0);
        expect(rShower.position.x).toBeGreaterThan(2.0);
        // ⭐ And the GLASS HAND follows, so the screen never ends up against the wall.
        expect(lShower.variant).toBe(podShowerVariantFor('left'));
        expect(rShower.variant).toBe(podShowerVariantFor('right'));
        expect(lShower.variant).not.toBe(rShower.variant);
    });

    it('C-4 the default shower variant is a WALK-IN, so the module has GLASS (C109 §2.1 / R-8)', () => {
        const solved = solveBathroomPodLayout(input(4.0, 3.0));
        expect(solved.ok).toBe(true);
        if (!solved.ok) return;
        const shower = solved.members.find((m) => m.kind === 'shower')!;
        // ⛔ NOT `shower_system_shelf` — that is a rain SYSTEM: a column of pipework with
        // no tray and no glass. Choosing the family default here would have produced a
        // module with a shower head and no shower.
        expect(shower.variant).toMatch(/^shower_walkin_/);
        // ⛔ AND THERE IS NO SEPARATE `panel` MEMBER. The glass is the shower's.
        expect(solved.members.some((m) => (m.kind as string) === 'panel')).toBe(false);
    });
});

describe('§BATH98 D — ⛔ THE REFUSAL NAMES BOTH NUMBERS, AND THEY ARE TRUE (C109 §5.4 / C74)', () => {
    it('D-1 a room too narrow is REFUSED, with the required and available widths in the sentence', () => {
        const solved = solveBathroomPodLayout(input(1.4, 2.4));
        expect(solved.ok).toBe(false);
        if (solved.ok) return;

        expect(solved.shortfall.axis).toBe('width');
        expect(solved.shortfall.availableM).toBe(1.4);
        expect(solved.shortfall.requiredM).toBeGreaterThan(1.4);

        // ⭐ BOTH NUMBERS ARE IN THE SENTENCE, and they are the SAME numbers the
        // machine-readable arm carries — a message that quoted a different figure from
        // the one the solver used would be the worst available kind of refusal.
        expect(solved.reason).toContain(`${solved.shortfall.requiredM.toFixed(2)} m of clear wall`);
        expect(solved.reason).toContain(`this room offers ${solved.shortfall.availableM.toFixed(2)} m`);
        // C16 CA-18: the route back to success is NAMED.
        expect(solved.reason).toMatch(/Widen the room to .* m, or remove the shower/);
        // The itemised arithmetic is shown, so the number is arguable rather than magic.
        expect(solved.reason).toContain('shower ');
        expect(solved.reason).toContain('WC ');
        expect(solved.reason).toContain('basin ');
    });

    it('D-2 a room too SHALLOW is refused on the depth axis, naming the deepest member', () => {
        // Wide enough for the run; far too shallow for a WC plus its activity space.
        const solved = solveBathroomPodLayout(input(6.0, 0.9, ['wc']));
        expect(solved.ok).toBe(false);
        if (solved.ok) return;
        expect(solved.shortfall.axis).toBe('depth');
        expect(solved.shortfall.availableM).toBe(0.9);
        expect(solved.reason).toContain('m of clear depth');
        expect(solved.reason).toContain('activity space');
        expect(solved.reason).toContain('wall-hung WC');
    });

    it('D-3 ⛔ the refusal is ARITHMETICALLY TRUE — required really is the run of the fixtures', () => {
        const wide = solveBathroomPodLayout(input(6.0, 3.5));
        expect(wide.ok).toBe(true);
        if (!wide.ok) return;
        const trueRun =
            wide.members.reduce((s, m) => s + (m.kind === 'accessory' ? 0 : m.footprint.width), 0) +
            podGapBetween('shower', 'wc') +
            podGapBetween('wc', 'basin');

        const refused = solveBathroomPodLayout(input(1.0, 3.5));
        expect(refused.ok).toBe(false);
        if (refused.ok) return;
        // The number in the refusal is the run the solver would actually have needed.
        expect(refused.shortfall.requiredM).toBeCloseTo(trueRun, 9);
    });

    it('D-4 ⛔ REFUSING is the ONLY failure mode — nothing overlaps, shrinks or is dropped', () => {
        const refused = solveBathroomPodLayout(input(1.0, 1.0));
        expect(refused.ok).toBe(false);
        // There is no `members` array on the failure arm at all, so there is no shape in
        // which a caller can accidentally build a half-fitted pod. C109 R-3.
        expect((refused as unknown as { members?: unknown }).members).toBeUndefined();
    });

    it('D-6 ⭐ a 2.2 m room is REFUSED for the default module, and the number is 2.27', () => {
        // The room A-1 could not use, pinned here so the refusal is a stated property of
        // the family rather than an accident another test quietly routes around.
        const solved = solveBathroomPodLayout(input(2.2, 2.4));
        expect(solved.ok).toBe(false);
        if (solved.ok) return;
        expect(solved.shortfall.availableM).toBe(2.2);
        // 1.00 shower + 0.10 + 0.42 WC + 0.10 + 0.65 basin = 2.27 — asserted as a
        // RELATIONSHIP against the solved footprints, never as a pinned literal (R-10).
        const wide = solveBathroomPodLayout(input(6.0, 3.5));
        expect(wide.ok).toBe(true);
        if (!wide.ok) return;
        const trueRun =
            wide.members.reduce((s, m) => s + (m.kind === 'accessory' ? 0 : m.footprint.width), 0) +
            podGapBetween('shower', 'wc') +
            podGapBetween('wc', 'basin');
        expect(solved.shortfall.requiredM).toBeCloseTo(trueRun, 9);
        expect(solved.shortfall.requiredM).toBeGreaterThan(2.2);
    });

    it('D-5 a mismatched pre-minted id count is refused BEFORE anything is placed (CA-2)', () => {
        const solved = solveBathroomPodLayout({
            room: room(4.0, 3.0),
            handedness: 'left',
            members: BATHROOM_POD_DEFAULT_MEMBERS,
            memberIds: ['only-one'],
        });
        expect(solved.ok).toBe(false);
        if (solved.ok) return;
        expect(solved.reason).toContain('pre-minted id');
        expect(solved.reason).toContain('redo');
    });
});

describe('§BATH98 E — determinism, which is what makes `arrangement` DERIVED (C109 §4)', () => {
    it('E-1 the same input produces a byte-identical layout, ten times over', () => {
        const first = solveBathroomPodLayout(input(2.6, 2.4));
        for (let i = 0; i < 10; i++) {
            expect(solveBathroomPodLayout(input(2.6, 2.4))).toEqual(first);
        }
    });

    it('E-2 the arrangement is RE-DERIVABLE from the stored room + member set', () => {
        const built = buildBathroomPod('pod_1', 'level-1', input(2.6, 2.4));
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const reSolved = solveBathroomPodLayout({
            room: built.pod.room,
            handedness: built.pod.handedness,
            members: built.pod.members.map((m) => m.kind),
            memberIds: built.pod.members.map((m) => m.id),
        });
        expect(reSolved.ok).toBe(true);
        if (!reSolved.ok) return;
        // ⭐ If this ever fails, `arrangement` must become STORED — that is the whole
        // argument C109 §4 makes for keeping it derived.
        expect(reSolved.arrangement).toBe(built.pod.arrangement);
        expect(reSolved.members).toEqual(built.pod.members);
    });

    it('E-3 a rotated room rotates the whole pod rigidly — one transform, applied once', () => {
        const flat = solveBathroomPodLayout(input(4.0, 3.0, BATHROOM_POD_DEFAULT_MEMBERS, 'left', 0));
        const turned = solveBathroomPodLayout(
            input(4.0, 3.0, BATHROOM_POD_DEFAULT_MEMBERS, 'left', Math.PI / 2),
        );
        expect(flat.ok && turned.ok).toBe(true);
        if (!flat.ok || !turned.ok) return;
        for (let i = 0; i < flat.members.length; i++) {
            const a = flat.members[i]!;
            const b = turned.members[i]!;
            // Footprints are invariant under rotation (§1.1 again, from another angle).
            expect(b.footprint).toEqual(a.footprint);
            // A quarter turn about world Y maps local (x, z) -> (-z, x).
            expect(b.position.x).toBeCloseTo(-a.position.z, 9);
            expect(b.position.z).toBeCloseTo(a.position.x, 9);
            expect(b.rotationY).toBeCloseTo(a.rotationY + Math.PI / 2, 9);
        }
    });
});

describe('§BATH98 F — the record, its members and its validator (C109 §2 / §3.2)', () => {
    it('F-1 every member is a real PLUMBING fixture type — no pod-private object (R-2)', () => {
        const built = buildBathroomPod('pod_1', 'level-1', input(4.0, 3.0));
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const allowed = new Set(['toilet', 'sink', 'shower', 'bath', 'accessory']);
        for (const m of built.pod.members) expect(allowed.has(m.fixtureType)).toBe(true);
        expect(bathroomPodMemberOfKind(built.pod, 'wc')!.fixtureType).toBe('toilet');
        expect(bathroomPodMemberOfKind(built.pod, 'basin')!.fixtureType).toBe('sink');
    });

    it('F-2 ⭐ childrenIds come from the RECORD, in member order (R-5)', () => {
        const built = buildBathroomPod('pod_1', 'level-1', input(4.0, 3.0));
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        // Nothing traverses a scene to answer this — it is a pure read of the record, so
        // it is correct on a level whose fragments have never been built (C99 EI-5a).
        expect(bathroomPodChildIds(built.pod)).toEqual(built.pod.members.map((m) => m.id));
        expect(bathroomPodChildIds(built.pod).length).toBe(
            bathroomPodMemberCount(BATHROOM_POD_DEFAULT_MEMBERS),
        );
    });

    it('F-3 the validator accepts a built pod and names the field on every rejection', () => {
        const built = buildBathroomPod('pod_1', 'level-1', input(4.0, 3.0));
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(validateBathroomPod(built.pod).ok).toBe(true);

        const cases: Array<[unknown, RegExp]> = [
            [null, /must be an object/],
            [{ ...built.pod, id: '' }, /id must be a non-empty string/],
            [{ ...built.pod, type: 'pod' }, /type must be "bathroomPod"/],
            [{ ...built.pod, levelId: '' }, /levelId/],
            [{ ...built.pod, handedness: 'up' }, /handedness/],
            [{ ...built.pod, arrangement: 'circular' }, /arrangement/],
            [{ ...built.pod, room: { ...built.pod.room, clearWidth: 0 } }, /clearWidth/],
            [{ ...built.pod, room: { ...built.pod.room, clearDepth: NaN } }, /clearDepth/],
            [{ ...built.pod, members: [] }, /at least one member/],
        ];
        for (const [value, pattern] of cases) {
            const v = validateBathroomPod(value);
            expect(v.ok).toBe(false);
            if (!v.ok) expect(v.reason).toMatch(pattern);
        }
    });

    it('F-4 two WCs in one pod are REFUSED — the second would be invisible under the first', () => {
        const built = buildBathroomPod('pod_1', 'level-1', input(4.0, 3.0));
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const wc = bathroomPodMemberOfKind(built.pod, 'wc')!;
        const doubled = { ...built.pod, members: [...built.pod.members, { ...wc, id: 'wc_2' }] };
        const v = validateBathroomPod(doubled);
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.reason).toMatch(/only one wc/);
    });

    it('F-5 several ACCESSORIES are allowed — a towel rail and a paper holder are normal', () => {
        const built = buildBathroomPod(
            'pod_1',
            'level-1',
            input(4.0, 3.0, ['wc', 'basin', 'accessory', 'accessory']),
        );
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.pod.members.filter((m) => m.kind === 'accessory').length).toBe(2);
        expect(validateBathroomPod(built.pod).ok).toBe(true);
    });

    it('F-6 a refusal from buildBathroomPod is the SOLVER refusal, unchanged', () => {
        const built = buildBathroomPod('pod_1', 'level-1', input(1.0, 1.0));
        expect(built.ok).toBe(false);
        if (built.ok) return;
        expect(built.reason).toMatch(/this room offers/);
        expect((built as unknown as { pod?: unknown }).pod).toBeUndefined();
    });
});
