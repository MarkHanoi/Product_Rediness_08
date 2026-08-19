/**
 * RK1 — THE RAKED-WALL COMBINATION MATRIX. A MEASUREMENT, NOT A FIX.
 *
 * C85 §11 #1 was CLOSED on 2026-08-18 (lane J1, `002db1c2`): one corner rule now serves
 * the three body paths it named — the plain sheared prism, the V2 layered band slicer,
 * and the opening-bearing body. C85 §12 R-9 binds that closure in place: the two
 * combinations it unblocked must NOT be re-refused.
 *
 * THIS FILE ASKS THE QUESTION THAT CLOSURE DOES NOT ANSWER: **which combinations does it
 * reach?** J1 measured ONE scene — an L-corner, 80 deg, h = 3 — against ONE neighbour.
 * The founder's subject is wider than that scene, so this file walks the cross-product
 * and PRINTS IT, including the cells where the answer is "the model will not hold this".
 *
 * -- THE THREE AXES, KEPT SEPARATE ON PURPOSE ----------------------------------------
 *
 * A cell can fail in three unrelated ways, and collapsing them is how "raked walls work"
 * becomes a claim nobody can check:
 *
 *   GATE      -- will `rakeAuthorability` let the MODEL hold this combination at all?
 *                This is the store-boundary question (`WallDataSchema` create,
 *                `WallStore.update`, `WallStore.addOpening` all consult it).
 *   BODY      -- does the built solid actually LEAN? Measured as the displacement of the
 *                TOP ring's extent midpoint from the BASE ring's, ALONG THE WALL'S PLAN
 *                LEFT NORMAL, which must equal `height * |cot theta|`. A raked wall that
 *                measures 0 here is the silently-wrong outcome: bolt upright on screen
 *                while the store holds 80. (It is an extent midpoint and not a centroid
 *                for a reason this probe found the hard way -- §RK1-LEAN-IS-NOT-A-CENTROID.)
 *   JOINT     -- does the corner CLOSE at the top as well as at the floor? Reported TWICE,
 *                because one number cannot serve all three topologies: `gap` is the rings'
 *                vertex-to-vertex closest approach, which is the right question at an L
 *                (a sound mitre makes the two walls SHARE corner vertices) and the wrong
 *                one at a T or an X (§RK1-VERTEX-GAP-IS-NOT-A-T-JOINT); `sep` is the plan
 *                HULL-to-HULL separation, which is 0 whenever the two solids touch and is
 *                therefore meaningful at all three. `openUp = topSep - baseSep` is the
 *                signature: sound at the floor, open at the top, is L-955's exact shape --
 *                the wedge of daylight that widens with height.
 *
 * -- WHY REFUSED COMBINATIONS ARE STILL BUILT AND STILL MEASURED ---------------------
 *
 * `WallFragmentBuilder` does not consult `rakeAuthorability` -- the gate lives at the
 * store boundary. So a refused combination can still be handed to the builder here, and
 * what it draws is EVIDENCE ABOUT THE REFUSAL: a refusal whose stated reason is
 * "this path has no shear" is only honest for as long as that path has no shear.
 * Measuring it is how the reason stays checkable instead of becoming folklore. Nothing
 * in this file changes a gate; it reports `GATE=REFUSED` and the geometry side by side.
 *
 * THIS FILE MUST NOT BE READ AS AUTHORISING ANY COMBINATION. It reports. C85 section 12
 * R-9 binds what may not be re-refused; nothing here lifts or adds a refusal.
 *
 * -- HONEST BLANKS ------------------------------------------------------------------
 *
 * What this file does NOT reach is listed in `§RK1-MATRIX-BLANKS` at the foot, and the
 * blanks are the point: they tell the next reader where to look. A matrix with blanks
 * beats a claim that "joins work".
 *
 * Tolerance is the canonical `COINCIDENT_M` (1 mm) from `@pryzm/geometry-kernel`, per
 * C73 section 2.2 -- no epsilon is invented here.
 *
 * @file packages/geometry-wall/__tests__/RK1RakedCombinationMatrix.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
import { profileAuthorability } from '../src/WallProfile';
import { rakeAuthorability } from '../src/WallRake';
import { buildWallProfileBodyGeometry } from '../src/WallProfileBodyBuilder';
import type { WallData } from '../src/WallTypes';

// ⭐ THE MEASUREMENT RIG NOW LIVES IN `support/wallJointHarness.ts` (WJ1, 2026-08-19).
// It was extracted rather than copied when a second suite needed it: four of its helpers
// carry corrections earned the hard way (§RK1-LEAN-IS-NOT-A-CENTROID,
// §RK1-VERTEX-GAP-IS-NOT-A-T-JOINT, §RK1-MAX-Y-CANNOT-SEE-A-PARTIAL-CUT,
// §WJ1-CROSSING-HULLS-SHARE-NO-VERTEX), and two copies would have meant the fifth
// correction landing in only one of them. Nothing about the readings changed.
import {
    COINCIDENT_M, RAKE, VERT, H, T, LAYERS3, LAYERS1, K, EXPECTED_LEAN,
    mk, WINDOW, DOOR, levelProvider, measure, record, rows, dump, setDumpFile,
    makeA, ALL_KINDS, pairFor,
    type Cell, type Kind, type Topo,
} from './support/wallJointHarness';

setDumpFile('rk1-raked-matrix.txt');

// --- AXIS 1 -- the BODY. Does a raked wall of each kind actually lean? -------

describe('RK1 §RK1-MATRIX -- AXIS 1: does the BODY lean, per body path', () => {
    it('every body kind, raked 80 deg and vertical 90 deg, measured against h*cot(theta)', () => {
        const results = new Map<Kind, { raked: Cell; vert: Cell }>();
        for (const kind of ALL_KINDS) {
            // A lone wall: B is placed far away so no join is resolved and the ONLY thing
            // measured is A's own body. A joint cannot mask a missing shear here.
            const far = () => mk([50, 50], [55, 50], { rake: VERT });
            const raked = record(`BODY ${kind} @80`, measure(makeA(kind, [0, 0], [5, 0], RAKE), far()));
            const vert = record(`BODY ${kind} @90`, measure(makeA(kind, [0, 0], [5, 0], VERT), far()));
            results.set(kind, { raked, vert });
        }
        dump('AXIS 1: BODY');

        // (a) THE CONTROL, and it must never move: a VERTICAL wall of every kind measures
        // exactly zero lean. If this ever fails the PROBE is wrong -- as it was on the
        // first run, see §RK1-LEAN-IS-NOT-A-CENTROID -- and nothing else here is believable.
        for (const kind of ALL_KINDS) {
            const v = results.get(kind)!.vert;
            expect(Number.isFinite(v.leanA), `${kind} @90 produced a measurable body`).toBe(true);
            expect(v.leanA, `${kind} @90 must be bolt upright`).toBeLessThan(COINCIDENT_M);
        }

        // (b) THE R-9 GUARD. `plain`, `layered3` and the two opening-bearing kinds are
        // SHIPPED and FOUNDER-CONFIRMED (C85 section 12 R-9: "the bodies are correct and
        // founder-confirmed"). Their lean is asserted EXACTLY, not merely observed, so
        // that no later change can quietly stand one of them back up -- which is the
        // silently-wrong outcome, and the one this subsystem refuses to ship.
        for (const kind of ['plain', 'layered3', 'plain+window', 'plain+door'] as Kind[]) {
            expect(results.get(kind)!.raked.leanA, `${kind} @80 must lean by h*cot(theta)`)
                .toBeCloseTo(EXPECTED_LEAN, 6);
        }

        // (c) THE REST IS MEASUREMENT, DELIBERATELY UNASSERTED. Which of the remaining
        // kinds lean and which do not is the finding this file exists to publish; asserting
        // today's reading would freeze the current defects in as the specification. The
        // readings are pinned as named defects in the dedicated tests below instead.
    });
});

// --- AXIS 2 -- the JOINT, at three topologies -------------------------------
// L: shared endpoint. T: stem meets host mid-edge. X: two walls crossing.

describe('RK1 §RK1-MATRIX -- AXIS 2: the JOINT, L / T / X', () => {
    it('every body kind against a PLAIN RAKED neighbour, at all three topologies', () => {
        for (const topo of ['L', 'T', 'X'] as Topo[]) {
            for (const kind of ALL_KINDS) {
                const [A, B] = pairFor(topo, kind, RAKE, 'plain', RAKE);
                record(`${topo} ${kind}@80 vs plain@80`, measure(A, B));
            }
        }
        dump('AXIS 2: JOINT vs plain raked');
    });

    it('MIXED neighbours -- raked vs vertical, raked vs opposite lean, raked vs layered raked', () => {
        for (const kind of ['plain', 'layered3', 'plain+window', 'layered3+window'] as Kind[]) {
            record(`L ${kind}@80 vs plain@90 VERTICAL`, measure(...pairFor('L', kind, RAKE, 'plain', VERT)));
            record(`L ${kind}@80 vs plain@110 OPPOSITE`, measure(...pairFor('L', kind, RAKE, 'plain', 110)));
            record(`L ${kind}@80 vs layered3@80`, measure(...pairFor('L', kind, RAKE, 'layered3', RAKE)));
        }
        dump('AXIS 2b: MIXED neighbours');
    });
});

// --- AXIS 3 -- never conclude from one sample -------------------------------

describe('RK1 §RK1-MATRIX -- AXIS 3: the angle and the length are not one sample', () => {
    it('the plain CONTROL corner holds across five rake angles and three wall lengths', () => {
        const cells: Array<{ deg: number; len: number; c: Cell }> = [];
        for (const deg of [20, 60, 80, 110, 160]) {
            for (const len of [1.0, 5.0, 12.0]) {
                const A = mk([0, 0], [len, 0], { rake: deg });
                const B = mk([0, 0], [0, len], { rake: deg });
                cells.push({ deg, len, c: record(`CONTROL plain@${deg} L=${len}m`, measure(A, B)) });
            }
        }
        dump('AXIS 3: angle x length sweep');

        // EVERY cell closes at the FLOOR. ADR-0310's uniform shear is exact there, on every
        // angle and every length -- so a failure here would be a different and much larger
        // defect than the one below, and separating them is the point of asserting it.
        for (const { deg, len, c } of cells) {
            expect(Number.isFinite(c.baseGap), `plain@${deg} L=${len}: a BASE ring was measured`).toBe(true);
            expect(c.baseGap, `plain@${deg} L=${len}: the mitre closes at the FLOOR`).toBeLessThan(COINCIDENT_M);
            expect(c.baseShared, `plain@${deg} L=${len}: >= 2 shared corners at the FLOOR`).toBeGreaterThanOrEqual(2);
        }

        // THE TOP closes only inside a BAND, and the band is the finding. It is asserted
        // for the shallow leans a building actually uses -- which is the founder-confirmed
        // configuration and the one J1 measured -- and NOT asserted outside it, because
        // outside it the corner is open TODAY and pinning it green would be a lie while
        // pinning it open would freeze a defect in as the specification. The open half is
        // pinned separately, and deliberately, as L-1060 below.
        for (const { deg, len, c } of cells) {
            const lean = H * Math.abs(1 / Math.tan((deg * Math.PI) / 180));
            if (lean > len) continue;                     // outside the band -- see L-1060
            expect(c.topGap, `plain@${deg} L=${len} (lean ${lean.toFixed(2)} <= L): TOP faces touch`)
                .toBeLessThan(COINCIDENT_M);
            expect(c.topShared, `plain@${deg} L=${len}: as many corners at TOP as at floor`)
                .toBeGreaterThanOrEqual(c.baseShared);
        }
    });

    /**
     * L-1060 -- THE OPEN CORNER AT A STEEP LEAN IS **CORRECT GEOMETRY, SILENTLY DELIVERED**.
     *
     * C85 section 11 #1 was closed on ONE scene: 80 deg, h = 3, L = 5, an L-corner. The
     * sweep above walks the same axis to its ends and finds, on the plain-to-plain path
     * that is otherwise FOUNDER-CONFIRMED GOOD:
     *
     *     plain@20 L=1m   TOP gap 7.142 m,  0 shared corners   (floor: 3 shared, gap 0)
     *     plain@20 L=5m   TOP gap 3.142 m,  0 shared corners
     *     plain@20 L=12m  TOP gap 0,        3 shared corners   -- closed again
     *
     * ⚠ AND THE FIRST READING OF THAT WAS WRONG, SO IT IS RECORDED RATHER THAN QUIETLY
     *   REPLACED (C84 section 6). This pin was first written as `it.fails` demanding the
     *   top corner CLOSE. It must not. At 20 deg and h = 3 each wall's top travels
     *   `3 * cot(20 deg)` = 8.24 m along its OWN plan normal, and the two normals are
     *   perpendicular -- so at the top A occupies a band 8.24 m in +Z while B occupies one
     *   8.24 m in -X, and the two solids DO NOT INTERSECT AT ALL up there. There is no
     *   mitre to draw. Demanding one would have been demanding geometry that cannot exist,
     *   and `it.fails` would have made that demand look like a defect report.
     *
     * WHAT IS ACTUALLY WRONG IS THE SILENCE, and it is two things:
     *
     *   (a) The ADR-0312 twin-solve loft DECLINED this corner -- `loftOffsets`
     *       (`WallPipelineV2.ts:91`) returns null on an orientation flip (`:111`) or a
     *       drift past `RAKE_JOINT_MAX_DRIFT_PER_M` (`:104`) -- and the build degraded to
     *       ADR-0310's uniform shear, which is floor-exact by construction. That is an
     *       honest degradation IN THE CODE and an invisible one IN THE SCENE: nothing on
     *       the built group distinguishes "the loft solved this corner" from "the loft
     *       gave up and you are looking at a floor-exact joint". Failure and emptiness
     *       print alike, which is the one thing this subsystem's contract forbids.
     *   (b) NOTHING RELATES THE RAKE TO THE WALL IT IS ON. `rakeAuthorability` checks the
     *       ANGLE against [15, 165] and nothing else -- not the height, not the length. A
     *       15 deg rake on a 3 m wall leans 11.2 m, which is authorable on a 1 m wall and
     *       is not a building. Whether that should be refused, warned, or left alone is a
     *       FOUNDER decision (it is an authoring policy, not a geometry bug) and this lane
     *       does not take it.
     *
     * So this is a CHARACTERISATION, asserted in the direction the geometry actually goes.
     * It fails if the band moves -- in either direction -- which is what makes it a pin.
     */
    it('L-1060 -- a steep lean SEPARATES the two solids, and the floor stays exact', () => {
        const steep = measure(mk([0, 0], [1, 0], { rake: 20 }), mk([0, 0], [0, 1], { rake: 20 }));
        expect(steep.baseGap, 'the FLOOR still closes -- this is not a collapsed corner')
            .toBeLessThan(COINCIDENT_M);
        expect(steep.baseShared, 'and it closes on the same corners as any other angle')
            .toBeGreaterThanOrEqual(2);
        // The tops are far apart because the wall leans further than it is long. Asserted
        // as a LOWER bound so the reading cannot be mistaken for a tolerance.
        expect(steep.topGap, 'the two TOPS genuinely separate -- there is no mitre to draw')
            .toBeGreaterThan(1.0);

        // The SAME angle on a wall long enough to still overlap at the top closes exactly,
        // which is what makes the reading above a RATIO effect and not an ANGLE effect.
        const long = measure(mk([0, 0], [12, 0], { rake: 20 }), mk([0, 0], [0, 12], { rake: 20 }));
        expect(long.topGap, 'at L = 12 m the same 20 deg corner closes at the TOP')
            .toBeLessThan(COINCIDENT_M);
        expect(long.topShared, 'and shares as many corners at the top as at the floor')
            .toBeGreaterThanOrEqual(long.baseShared);
    });
});

// --- AXIS 4 -- the two standing refusals, and whether their REASONS are still true ---

/**
 * `rakeAuthorability` refuses exactly two combinations that this lane's subject contains,
 * and each refusal states a GEOMETRIC reason. A refusal is only honest for as long as its
 * stated reason is true, so each is checked against what the builder actually draws.
 *
 * ⛔ NOTHING HERE LIFTS A REFUSAL, and nothing here is a re-refusal either -- both arms
 *    PREDATE C85 section 12 R-9 and neither was ever shipped. R-9 binds two DIFFERENT
 *    combinations: layered-raked with NO openings, and a single-layer raked wall HOSTING
 *    an opening. The matrix above confirms both of those lean correctly and are gated OK.
 */
describe('RK1 §RK1-MATRIX -- AXIS 4: are the two standing refusals still factually true?', () => {
    const far = () => mk([50, 50], [55, 50], { rake: VERT });

    /**
     * ⚠ THIS TEST ONCE ASSERTED THE OPPOSITE, AND THE REVERSAL IS RECORDED RATHER THAN
     *   OVERWRITTEN (C84 §6). As first written it read *"the gate refuses, and the path
     *   really has NO shear"*, and it ended:
     *
     *       expect(c.leanA, 'and it builds BOLT UPRIGHT: the refusal reason is TRUE,
     *                        not folklore').toBeLessThan(COINCIDENT_M);
     *
     *   That was TRUE when measured, and it was the evidence that justified the fix. It
     *   is FALSE now, because §FEAT-RAKE-LAYERED-OPENINGS gave the path its shear — so
     *   the assertion had become a demand for the defect's return, which is the trap
     *   `A2b`/`A3b` in `WallProfileNonRegressionBaseline` were sitting in when this lane
     *   picked them up. A pin that records a defect MUST say what to do when it goes red.
     *   This one now records both states, and asserts the fixed one.
     *
     * WHAT REMAINS TRUE: the GATE still refuses. That is a separate fact from the
     * geometry, and it is deliberately left alone — see the assertion's own comment.
     */
    it('L-1061 -- layered x openings x rake LEANS, and the gate now ADMITS it', () => {
        // ⚠ THIS ASSERTION HAS NOW BEEN REVERSED TWICE, AND BOTH REVERSALS ARE RECORDED
        //   (C84 §6). Draft 1 asserted the path had NO shear and built BOLT UPRIGHT — true
        //   when measured, and the evidence that justified the fix. Draft 2 asserted the
        //   body leaned while the GATE still refused, and flagged that state as knowingly
        //   incoherent and awaiting a decision. The founder has now given it
        //   (2026-08-19, *"this needs to be in place"*), so the arm is lifted and this is
        //   draft 3: the combination is authorable AND correct.
        const g = rakeAuthorability({ rakeAngleDeg: RAKE, layers: [{}, {}, {}], openings: [{ id: 'o' }] });
        expect(g.ok, 'L-1064: the layered x openings arm is LIFTED — its stated reason was measured false').toBe(true);
        expect(g.code).toBeUndefined();

        // The body measurement that made the lift defensible, kept as the standing proof.
        const c = measure(makeA('layered3+window', [0, 0], [5, 0], RAKE), far());
        expect(Number.isFinite(c.leanA), 'the combination BUILDS -- it does not throw').toBe(true);
        expect(c.leanA, 'the body LEANS by h*cot(theta) -- the refusal reason no longer holds')
            .toBeCloseTo(EXPECTED_LEAN, 6);

        // The control that makes the reading mean something: the SAME layer stack with the
        // openings removed leans identically, so the two arms of the layered router now
        // agree about the shear instead of differing by it.
        const ctl = measure(makeA('layered3', [0, 0], [5, 0], RAKE), far());
        expect(ctl.leanA, 'layered WITHOUT openings leans by the same amount')
            .toBeCloseTo(EXPECTED_LEAN, 6);
        expect(Math.abs(c.leanA - ctl.leanA), 'and the two arms agree to within COINCIDENT_M')
            .toBeLessThan(COINCIDENT_M);
    });

    /**
     * THE JOINT half of the same fix — the body leaning is not enough. Before
     * §FEAT-RAKE-LAYERED-OPENINGS this corner opened by 0.7097 m between floor and top
     * (measured: `L layered3+window@80 vs plain@80  base sep 7.713e-4 → TOP sep 5.298e-1`),
     * which is L-955's exact signature on a path L-955 never reached.
     */
    it('§FEAT-RAKE-LAYERED-OPENINGS -- and the CORNER does not open with height', () => {
        for (const kind of ['layered1+window', 'layered3+window'] as Kind[]) {
            const c = measure(...pairFor('L', kind, RAKE, 'plain', RAKE));
            expect(c.baseSep, `${kind}: the solids meet at the FLOOR`).toBeLessThan(COINCIDENT_M);
            expect(c.topSep, `${kind}: and they still meet at the TOP`).toBeLessThan(COINCIDENT_M);
            expect(Math.abs(c.openUp), `${kind}: the corner does not OPEN between floor and top`)
                .toBeLessThan(COINCIDENT_M);
        }
    });

    /**
     * §RK1-THE-REFUSAL-HAS-A-HOLE — and this is the row that makes L-1061 a LIVE defect
     * rather than a statement about code nobody can reach.
     *
     * `rakeAuthorability`'s `layered` arm refuses `layers.length > 1 AND openings.length > 0`.
     * `WallFragmentBuilder`'s layered branch is entered on `layers.length > 0`. **The two
     * thresholds differ by one**, so a ONE-LAYER wall that hosts an opening and carries a
     * rake is fully authorable — schema, store, occupancy gate, property panel, chat — and
     * lands on exactly the body path the refusal exists to keep raked walls off.
     *
     * That wall is not hypothetical. `CreateWallCommand` stamps `layers` from the wall's
     * WallSystemType, and a 1-layer "Plain Wall" is what L-960 was reported on — the
     * founder's own. So "layered × openings × rake has no shear" was reachable in
     * production the whole time, through the gap in its own gate.
     *
     * This is asserted, not merely measured: the gate must keep admitting it (refusing it
     * would be the wrong fix — the geometry is what needed repair, not the affordance) and
     * the body must lean.
     */
    it('§RK1-THE-REFUSAL-HAS-A-HOLE -- a ONE-layer raked wall with an opening is AUTHORABLE', () => {
        const g = rakeAuthorability({ rakeAngleDeg: RAKE, layers: [{}], openings: [{ id: 'o' }] });
        expect(g.ok, 'one layer is not the layered case: the gate admits this wall').toBe(true);

        const c = measure(makeA('layered1+window', [0, 0], [5, 0], RAKE), far());
        expect(Number.isFinite(c.leanA), 'it builds').toBe(true);
        expect(c.leanA, 'and it must LEAN -- it is reachable, so it cannot be left upright')
            .toBeCloseTo(EXPECTED_LEAN, 6);
    });

    it('L-1062 -- curved x rake is ADMITTED and BUILT as a cone; only COLLAPSE is refused', () => {
        // ⚠ REVERSED, AND THE PRIOR STATE RECORDED (C84 §6). This asserted that the curved
        //   arm refuses and that the path "really has NO shear" — both true when measured.
        //   §FEAT-RAKE-CURVED replaced the blanket refusal with the conical sweep, so the
        //   gate now admits a curved rake and refuses only the case that is geometrically
        //   impossible: a top arc pushed inward past its own centre of curvature.
        const g = rakeAuthorability({ rakeAngleDeg: RAKE, curve: { control: { x: 1, y: 0, z: 1 }, segments: 16 } });
        expect(g.ok, 'a curved wall may now hold a rake').toBe(true);

        // The surviving arm, and it names BOTH numbers rather than saying "invalid".
        const collapse = rakeAuthorability({
            rakeAngleDeg: 20, curve: { control: { x: 1, y: 0, z: 1 }, segments: 16 },
            height: 3, curveMinRadiusM: 0.5,
        });
        expect(collapse.ok, 'a lean deeper than the turn radius is refused').toBe(false);
        expect(collapse.code).toBe('curved-collapse');
        expect(collapse.reason, 'the refusal quotes the shift').toMatch(/8\.24/);
        expect(collapse.reason, 'and the radius').toMatch(/0\.500/);

        // UNJUDGEABLE IS NOT FAILURE: without height and radius the arm cannot run, and
        // the wall proceeds rather than being refused on a fact nobody measured.
        expect(rakeAuthorability({ rakeAngleDeg: 20, curve: { control: { x: 1, y: 0, z: 1 }, segments: 16 } }).ok)
            .toBe(true);
    });

    /**
     * The half of R-9 that a future lane is most likely to walk into by accident. Both
     * combinations R-9 protects are asserted GATE-OPEN here, so a change that re-adds
     * either arm to `rakeAuthorability` fails in this file with R-9 named, rather than
     * being discovered by the founder on a deploy.
     */
    it('R-9 GUARD -- layered-raked and opening-on-raked are AUTHORABLE and must stay so', () => {
        expect(rakeAuthorability({ rakeAngleDeg: RAKE, layers: [{}, {}, {}] }).ok,
            'C85 section 12 R-9: layered-raked (no openings) must NOT be re-refused').toBe(true);
        expect(rakeAuthorability({ rakeAngleDeg: RAKE, openings: [{ id: 'o' }] }).ok,
            'C85 section 12 R-9: an opening on a raked wall must NOT be re-refused').toBe(true);
        expect(rakeAuthorability({ rakeAngleDeg: RAKE, layers: [{}], openings: [{ id: 'o' }] }).ok,
            'a SINGLE-layer wall with an opening is not the layered case').toBe(true);
    });
});

// --- AXIS 4b -- D-CURVED #4: a curved RAKED wall against EVERY other wall ------------

/**
 * The founder's words were *"with sound joints with any other walls"*, so this walks the
 * neighbour axis rather than sampling it. A is a curved raked wall throughout; only B
 * changes.
 *
 * WHAT "SOUND" MEANS HERE, and why it is `sep` and not `gap`: at an L the two solids must
 * TOUCH at the floor and still touch at the top. Shared-vertex counting (`gap`) is the
 * right question when both ends are straight mitres, and the wrong one the moment an arc
 * is involved — a curved end face meets a straight one along a line neither tessellates
 * the same way, so they can be flush and still share no vertex. Hull separation answers
 * "do these two solids meet?" for every combination, which is what the founder asked.
 *
 * `openUp = topSep - baseSep` is the L-955 signature: sound at the floor, open at the top.
 */
describe('RK1 D-CURVED #4 -- a curved RAKED wall joined to every other kind', () => {
    const NEIGHBOURS: ReadonlyArray<readonly [string, Kind, number]> = [
        ['straight plain VERTICAL', 'plain', VERT],
        ['straight plain RAKED (same lean)', 'plain', RAKE],
        ['straight plain RAKED (opposite)', 'plain', 110],
        ['straight LAYERED raked', 'layered3', RAKE],
        ['straight raked + WINDOW', 'plain+window', RAKE],
        ['CURVED unraked', 'curved', VERT],
        ['CURVED raked', 'curved', RAKE],
        ['CURVED layered raked', 'curved+layered3', RAKE],
    ];

    for (const aKind of ['curved', 'curved+layered3', 'curved+window'] as Kind[]) {
        it(`${aKind}@80 closes against every neighbour, at the floor AND at the top`, () => {
            const results: Array<{ label: string; c: Cell }> = [];
            for (const [label, bKind, bRake] of NEIGHBOURS) {
                const [A, B] = pairFor('L', aKind, RAKE, bKind, bRake);
                results.push({ label, c: record(`L ${aKind}@80 vs ${label}`, measure(A, B)) });
            }
            dump(`AXIS 4b: ${aKind}@80 vs every neighbour`);

            for (const { label, c } of results) {
                expect(Number.isFinite(c.baseSep), `${label}: both bodies built`).toBe(true);
                // THE FLOOR IS EXACT AT EVERY NEIGHBOUR, and that is asserted hard. It is
                // ADR-0310's guarantee and it survives the conical sweep unchanged.
                expect(c.baseSep, `${label}: the two solids MEET at the floor`).toBeLessThan(COINCIDENT_M);
                // ✅ THE TOP IS NOW ASSERTED CLOSED TOO (L-1066, closed 2026-08-19). This
                //    block used to assert only that the opening was BOUNDED by the leans
                //    that caused it, because the top genuinely did not close and pinning
                //    it green would have been a lie. It closes now, at every neighbour.
                expect(c.topSep, `${label}: and they still MEET at the top`)
                    .toBeLessThan(COINCIDENT_M);
                expect(Math.abs(c.openUp), `${label}: the corner does not OPEN with height`)
                    .toBeLessThan(COINCIDENT_M);
            }
        });
    }

    /**
     * L-1066 — THE CURVED CORNER IS FLOOR-EXACT ONLY. The bodies are right; the JOINT is
     * where L-955's fix has not reached.
     *
     * Measured, curved raked ↔ straight raked at an L, 80°, h = 3:
     *
     *     baseSep 0.000    topSep 0.555    openUp 0.555
     *
     * and the pattern across neighbours names the mechanism exactly:
     *
     *     vs plain VERTICAL        openUp 0.026   (neighbour barely moves)
     *     vs plain RAKED opposite  openUp 0.000   (tops move TOWARD each other)
     *     vs plain RAKED same lean openUp 0.555   (tops move APART)
     *     vs CURVED unraked        openUp 0.000
     *     vs CURVED raked          openUp 0.347
     *
     * THE CAUSE IS NOT THE CONICAL SWEEP — the bodies are correct and pinned exactly by
     * `RK1CurvedRakedConicalSweep.test.ts`. It is that the ADR-0312 TWIN-SOLVE LOFT, which
     * re-solves the mitre in the DISPLACED plan and is what closed L-955 for straight
     * walls, never runs for a curved one: `rakeJointCapDrift` is gated `!wall.curve`, and
     * `WallPipelineV2Cache.refresh` takes straight `startXZ`/`endXZ` specs and has no way
     * to describe an arc. So a curved raked wall places its shared top corner by ADR-0310's
     * uniform rule while its straight raked neighbour places the same corner by the lofted
     * one — two rules at one corner, which is verbatim the defect class L-955 was.
     *
     * ⚠ THIS IS THE REMAINING HALF OF THE FOUNDER'S MANDATE. The bodies asked for are
     *   built; *"sound joints with any other walls"* is not finished until the loft reaches
     *   the arc. Closing it means teaching the V2 probe-solve about curved walls — a real
     *   piece of work, not a patch, and larger than the sweep itself.
     *
     * ✅ CLOSED 2026-08-19 by §FEAT-RAKE-CURVED-JOINT, and the pin did its job: it was
     * written `it.fails`, and the day the fix landed vitest reported "expected to fail but
     * passed" — which is exactly why it was written that way rather than deleted. Flipped
     * to a live assertion here rather than removed, so the corner cannot silently reopen.
     *
     * THE FIX, and the two wrong drafts that preceded it, because the ORDER was the whole
     * thing and neither wrong draft was obviously wrong:
     *   · draft 1 ADDED the loft to the already-coned corner — `openUp` unmoved at 0.555 m,
     *     lean 0.497 → 0.773. One displacement counted twice.
     *   · draft 2 replaced the cone but applied the loft BEFORE `projectCapVertex` —
     *     `openUp` BIT-IDENTICAL to the pre-fix run. The projection solves for the
     *     along-axis coordinate on the base mitre plane, so it overwrote the drift.
     *   · draft 3 (this one) strips the cone from the cap columns, projects, THEN adds the
     *     loft. The top cap corner is `base mitre corner + loft` — the same answer
     *     `rakeJointCapDrift` hands the straight neighbour for the same corner.
     */
    it('L-1066 -- a curved raked corner closes at the TOP, at every neighbour', () => {
        const c = measure(...pairFor('L', 'curved', RAKE, 'plain', RAKE));
        expect(c.baseSep, 'the floor is exact').toBeLessThan(COINCIDENT_M);
        expect(c.topSep, 'L-1066: and so is the top').toBeLessThan(COINCIDENT_M);
        // The sharper statement, and the one that would catch a regression the hull
        // metric could miss: the top corner sits in the SAME relative position as the
        // base corner, i.e. the joint does not open with height at all.
        expect(Math.abs(c.topGap - c.baseGap), 'the corner does not move between floor and top')
            .toBeLessThan(COINCIDENT_M);
    });

    it('the curved BODY leans -- without which the joint result above would be vacuous', () => {
        // A joint between two upright walls closes trivially. This is the non-vacuity
        // guard for the whole block: A must actually be a cone.
        const far = () => mk([50, 50], [55, 50], { rake: VERT });
        for (const kind of ['curved', 'curved+layered3', 'curved+window', 'curved+layered3+window'] as Kind[]) {
            const c = measure(makeA(kind, [0, 0], [5, 0], RAKE), far());
            expect(c.leanA, `${kind} @80 leans`).toBeGreaterThan(0.1);
        }
    });
});

// --- AXIS 4c -- WJ1: the curved RAKED wall at a T and at an X ------------------------

/**
 * L-1066 closed the **L** corner and said so plainly: *"T and X for curved-raked are still
 * not asserted."* This is that assertion — and it could not be written until the METRIC was
 * fixed, because the X arm of `hullSeparation` was measuring the test geometry rather than
 * the building (§WJ1-CROSSING-HULLS-SHARE-NO-VERTEX, above).
 *
 * ── WHAT CHANGED IN THE READINGS, AND WHY EVERY OLD X NUMBER WAS FICTION ───────────
 *
 * Before the metric fix, with the SAME builder and the SAME walls:
 *
 *     X plain@90 vs plain@90   baseSep 2.400   topSep 2.400   openUp  0.000   <- the CONTROL
 *     X plain@80 vs plain@80   baseSep 2.400   topSep 1.871   openUp -0.529
 *     X curved@80 vs plain@90  baseSep 0.000   topSep 0.019   openUp  0.019
 *     X curved@80 vs layered3  baseSep 0.021   topSep 0.061   openUp  0.040
 *
 * After:  **every one of those is 0.000, control included.** The `2.400` was `2.5 − 0.1`,
 * half the test wall's length minus half its thickness — a fact about the fixture. The
 * `openUp = −0.529` was a negative opening, which is not a thing. And the 19 mm and 40 mm
 * "openings" that looked like small real defects worth chasing were the same artefact at a
 * smaller amplitude. ⭐ **The plausible ones are the dangerous ones**: `2.400` announces
 * itself, `0.019` reads as a lead.
 *
 * ── WHAT IS ASSERTED, AND WHAT A T AND AN X CAN EVEN CLAIM ─────────────────────────
 *
 * `baseGap` / `topGap` are VERTEX-to-VERTEX and are meaningless here — RK1 established
 * that (§RK1-VERTEX-GAP-IS-NOT-A-T-JOINT): at a T the stem's end face lands on the middle
 * of the host's side face, where the host has no vertex at all, so the nearest host vertex
 * is half a wall away. They are still RECORDED, never asserted. The claim at a T and an X
 * is the one the founder's sentence makes: the solids MEET at the floor, they still MEET
 * at the top, and the joint does not OPEN with height.
 */
describe('WJ1 -- a curved RAKED wall at a T and at an X, against every neighbour', () => {
    const NEIGHBOURS: ReadonlyArray<readonly [string, Kind, number]> = [
        ['straight plain VERTICAL', 'plain', VERT],
        ['straight plain RAKED (same lean)', 'plain', RAKE],
        ['straight plain RAKED (opposite)', 'plain', 110],
        ['straight LAYERED raked', 'layered3', RAKE],
        ['straight raked + WINDOW', 'plain+window', RAKE],
        ['CURVED unraked', 'curved', VERT],
        ['CURVED raked', 'curved', RAKE],
        ['CURVED layered raked', 'curved+layered3', RAKE],
    ];

    /**
     * ⭐ THE METRIC'S OWN CONTROL, and it runs FIRST at every topology.
     *
     * This is the test that would have caught the X defect on the day it was written. Two
     * plain UPRIGHT walls at a T and at an X cannot be unsound — there is no rake, no
     * curve, no opening and no layering to get wrong. If the metric reports daylight
     * there, the metric is broken and nothing below it means anything. It reported 2.400 m
     * for months.
     */
    it('CONTROL -- plain vertical and plain raked pairs read CLOSED at L, T and X', () => {
        for (const topo of ['L', 'T', 'X'] as Topo[]) {
            for (const [tag, rake] of [['@90 upright', VERT], ['@80 raked', RAKE]] as const) {
                const c = record(`${topo} CONTROL plain${tag} vs plain${tag}`,
                    measure(...pairFor(topo, 'plain', rake as number, 'plain', rake as number)));
                expect(c.baseSep, `${topo} plain${tag}: the floor`).toBeLessThan(COINCIDENT_M);
                expect(c.topSep, `${topo} plain${tag}: the top`).toBeLessThan(COINCIDENT_M);
                expect(Math.abs(c.openUp), `${topo} plain${tag}: does not open`).toBeLessThan(COINCIDENT_M);
            }
        }
        dump('AXIS 4c CONTROL: plain pairs at L / T / X');
    });

    /**
     * ⭐ THE CONTROL CAN FAIL. A green control proves nothing if the instrument cannot
     * produce a red. Two walls placed genuinely apart must read genuinely apart — and the
     * SAT overlap test added above is exactly the kind of change that could have made
     * `hullSeparation` return 0 unconditionally, which would have turned every assertion
     * in this block into a tautology.
     */
    it('CONTROL CAN FAIL -- two walls 2 m apart read as SEPARATED, not as touching', () => {
        const A = makeA('plain', [0, 0], [5, 0], RAKE);
        const B = makeA('plain', [0, 2], [5, 2], RAKE);
        const c = record('CONTROL-CAN-FAIL plain@80 vs plain@80, 2 m apart', measure(A, B));
        dump('AXIS 4c: the instrument can still report a gap');
        expect(c.baseSep, 'a real 2 m gap is reported as a gap').toBeGreaterThan(1.5);
    });

    for (const topo of ['T', 'X'] as Topo[]) {
        for (const aKind of ['curved', 'curved+layered3', 'curved+window'] as Kind[]) {
            it(`${topo}: ${aKind}@80 closes against every neighbour, floor AND top`, () => {
                const results: Array<{ label: string; c: Cell }> = [];
                for (const [label, bKind, bRake] of NEIGHBOURS) {
                    const [A, B] = pairFor(topo, aKind, RAKE, bKind, bRake);
                    results.push({ label, c: record(`${topo} ${aKind}@80 vs ${label}`, measure(A, B)) });
                }
                dump(`AXIS 4c: ${topo} ${aKind}@80 vs every neighbour`);

                for (const { label, c } of results) {
                    expect(Number.isFinite(c.baseSep), `${label}: both bodies built`).toBe(true);
                    expect(c.baseSep, `${topo} ${label}: the two solids MEET at the floor`)
                        .toBeLessThan(COINCIDENT_M);
                    expect(c.topSep, `${topo} ${label}: and they still MEET at the top`)
                        .toBeLessThan(COINCIDENT_M);
                    expect(Math.abs(c.openUp), `${topo} ${label}: does not OPEN with height`)
                        .toBeLessThan(COINCIDENT_M);
                }
            });
        }
    }

    /**
     * The T with the CURVE ON THE STEM rather than on the host. Every row above puts the
     * curved wall in the A slot, which at a T is the HOST — so without this the curved
     * wall's own END would never be the thing landing on a neighbour's side face, and "T
     * is asserted" would be half true.
     */
    it('T-STEM -- a curved raked STEM landing on a straight host, raked and upright', () => {
        const results: Array<{ label: string; c: Cell }> = [];
        for (const aKind of ['curved', 'curved+layered3'] as Kind[]) {
            for (const [tag, hostRake] of [['raked host', RAKE], ['upright host', VERT]] as const) {
                const A = makeA(aKind, [2.5, 0], [2.5, 5], RAKE);
                const B = makeA('plain', [0, 0], [5, 0], hostRake as number);
                results.push({ label: `${aKind} stem, ${tag}`, c: record(`T-STEM ${aKind}@80 onto plain ${tag}`, measure(A, B)) });
            }
        }
        dump('AXIS 4c: T-STEM, the curve on the stem');
        for (const { label, c } of results) {
            expect(c.baseSep, `${label}: meets at the floor`).toBeLessThan(COINCIDENT_M);
            expect(c.topSep, `${label}: meets at the top`).toBeLessThan(COINCIDENT_M);
            expect(Math.abs(c.openUp), `${label}: does not open`).toBeLessThan(COINCIDENT_M);
        }
    });

    /**
     * NON-VACUITY. A T or an X between two upright walls closes trivially; every row above
     * would be green on a builder that had forgotten the rake entirely. A must be a cone.
     */
    it('the curved body still LEANS at T and X placements -- the block is not vacuous', () => {
        const far = () => mk([50, 50], [55, 50], { rake: VERT });
        for (const kind of ['curved', 'curved+layered3', 'curved+window'] as Kind[]) {
            const stem = measure(makeA(kind, [2.5, 0], [2.5, 5], RAKE), far());
            expect(stem.leanA, `${kind} @80 at the T-stem placement leans`).toBeGreaterThan(0.1);
            const cross = measure(makeA(kind, [-2.5, 0], [2.5, 0], RAKE), far());
            expect(cross.leanA, `${kind} @80 at the X placement leans`).toBeGreaterThan(0.1);
        }
    });
});

// --- AXIS 5 -- L-1034 #4: WHERE IS "EDIT PROFILE" ACTUALLY OFFERED? -----------------

/**
 * The founder re-raised PROFILE EDIT alongside the three curved/raked cells (L-1034). The
 * feature itself is already on `main` — `62479227` (slice 0) and `f9ed3ee9` (slice 1),
 * with a live **Edit Profile** button in `ContextualEditBar.ts` under `§EDIT-PROFILE`.
 * So the open question is NOT "build it"; it is **REACHABILITY**: the bar shows the button
 * only where an editor actually exists, so which wall SHAPES offer it has never been
 * measured — and "raked" and "curved" are exactly the shapes this lane owns.
 *
 * `profileAuthorability` is the gate that decides, and this axis reads it directly. The
 * result is a genuine, complete answer to half the question. The other half — whether the
 * BUTTON follows the gate — is an `apps/editor` question and is declared a blank below
 * rather than guessed at: an L2 test importing an L7 bar would be a layer violation, and
 * a mirrored copy of the rule here would be the C84 §8.d defect ("a comment as the
 * synchronisation mechanism") this repo has already been bitten by twice.
 */
describe('RK1 §RK1-MATRIX -- AXIS 5: L-1034 #4, profile-edit reachability by wall shape', () => {
    it('the four cells the founder asked about, read off the gate that decides them', () => {
        // ⚠ THE SHAPE MATTERS, AND THE FIRST DRAFT GOT IT WRONG — recorded, not hidden.
        //   The profile was passed as a BARE ARRAY of `{u, v}`; `resolveWallProfile`
        //   wants `{ ring: [...] }`, so every one of the six cells came back
        //   `REFUSED:malformed` and the axis measured NOTHING. The tell was that all six
        //   agreed: a probe returning the same value for every input is measuring itself.
        //   The `expect`s below are what caught it, which is the whole reason an axis
        //   like this must assert and not merely print.
        const PROFILE = { ring: [{ u: 0, v: 0 }, { u: 5, v: 0 }, { u: 5, v: 3 }, { u: 0, v: 2 }] };
        const BASELINE: readonly [{ x: number; z: number }, { x: number; z: number }] =
            [{ x: 0, z: 0 }, { x: 5, z: 0 }];
        const curve = { control: { x: 2.5, y: 0, z: 1.2 }, segments: 24 };
        const base = { wallProfile: PROFILE, baseLine: BASELINE, height: H };
        const cells: Array<[string, Record<string, unknown>]> = [
            ['plain VERTICAL',      { ...base }],
            ['plain RAKED',         { ...base, rakeAngleDeg: RAKE }],
            ['CURVED',              { ...base, curve }],
            ['CURVED + RAKED',      { ...base, curve, rakeAngleDeg: RAKE }],
            ['LAYERED (3)',         { ...base, layers: [{}, {}, {}] }],
            ['hosting an OPENING',  { ...base, openings: [{ id: 'o' }] }],
        ];
        for (const [label, subject] of cells) {
            const a = profileAuthorability(subject as never);
            rows.push(`PROFILE on ${label.padEnd(24)} ${a.ok ? 'OFFERED' : `REFUSED:${a.code}`}`);
        }
        dump('AXIS 5: profile-edit reachability (L-1034 #4)');

        // THE CONTROL FIRST: a plain vertical wall must be OFFERED the editor. If this
        // fails, the subject is malformed again and nothing below means anything.
        expect(profileAuthorability({ ...base } as never).ok,
            'CONTROL — a plain vertical wall is offered profile edit').toBe(true);

        // THE FINDING. `profileAuthorability` has arms for curved, layered and
        // hosted-openings and NONE for the rake — `ProfileSubject` does not even carry
        // `rakeAngleDeg`, so the rake is not an INPUT to the decision, let alone a
        // refusal. A raked wall is therefore offered the profile editor.
        expect(profileAuthorability({ ...base, rakeAngleDeg: RAKE } as never).ok,
            'a RAKED wall IS offered profile edit — the gate cannot even see the rake').toBe(true);
        // ✅ THE TWO CURVED CELLS INVERTED 2026-08-19 (§FEAT-WALL-PROFILE-CURVED, WJ1,
        //    L-1072). They read `REFUSED:curved` when this axis was written, and that was
        //    the finding of the day — *"a curved wall never offers profile edit, raked or
        //    not"* (L-1065). The refusal has since been LIFTED, not worked around: `u` on an
        //    arc is arc length, the per-station tessellation is `insertStationsAt`, and the
        //    per-station top the refusal said the builder lacked is `CurvedProfileHeights`.
        //    Inverted rather than deleted, so the cell keeps its history.
        expect(profileAuthorability({ ...base, curve } as never).ok,
            'a CURVED wall is now OFFERED profile edit').toBe(true);
        expect(profileAuthorability({ ...base, curve, rakeAngleDeg: RAKE } as never).ok,
            'CURVED + RAKED too — and the rake was never why either was refused').toBe(true);
        // The two axes that are still closed, so this cell can still go red for a reason.
        expect(profileAuthorability({ ...base, layers: [{}, {}, {}] } as never).code)
            .toBe('layered');
        expect(profileAuthorability({ ...base, openings: [{ id: 'o' }] } as never).code)
            .toBe('hosted-openings');
    });
});

// --- AXIS 6 -- L-1067: WHAT THE "EDIT PROFILE" BUTTON ACTUALLY DOES TODAY ------------

/**
 * The founder asked about Edit Profile twice and has not had a straight answer. This axis
 * is the straight answer, measured rather than inferred from commit messages.
 *
 * WHAT EXISTS: the model (`wallProfile`, a `{ ring: [{u,v}] }` on `WallData`), ONE
 * authorability gate wired into all three write boundaries, Zod validation, persistence,
 * cache invalidation (`WallDeltaClassifier`), the geometry hash (`composeWallGeometryHash`),
 * an instanced-arm exclusion so a profiled wall cannot be flattened into a T·R·S matrix,
 * and a live button in `ContextualEditBar` under §EDIT-PROFILE.
 *
 * ⛔ WHAT DOES NOT EXIST: **any body builder that reads the ring.** A census of
 *    `packages/geometry-wall/src` finds `wallProfile` consumed by the schema, the store,
 *    the delta classifier, the geometry hash and the instanced-arm exclusion — and by NO
 *    geometry path. `WallFragmentBuilder`'s own comment says so in its own words: *"INERT
 *    TODAY, DELIBERATELY. Nothing in the repo authors `wallProfile` yet."*
 *
 * SO THE HONEST STATEMENT IS NOT "profile × rake is unverified" — it is that **a profile
 * draws nothing on ANY wall shape.** Authoring one makes the wall REBUILD (the hash
 * changes) and takes it OFF the instanced arm (the exclusion fires), and then renders the
 * identical full rectangle. That is worse than a refusal, because a refusal at least tells
 * the author why nothing happened.
 *
 * This test does not fix it. It makes the state MEASURED instead of assumed, which is what
 * C84 EI-3 requires of an affordance that is offered — and it gives the lane that builds
 * the body a harness that is already RED in the right place.
 */
describe('RK1 §RK1-MATRIX -- AXIS 6: L-1067, the profile is authorable and DRAWS NOTHING', () => {
    const RING = { ring: [{ u: 0, v: 0 }, { u: 5, v: 0 }, { u: 5, v: 3 }, { u: 0, v: 1 }] };

    const withProfile = (rake?: number): WallData => ({
        ...mk([0, 0], [5, 0], rake === undefined ? {} : { rake }),
        wallProfile: RING,
    } as unknown as WallData);

    it('the gate ADMITS a profile on a plain wall, vertical and raked alike', () => {
        expect(profileAuthorability({ wallProfile: RING, baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }], height: H } as never).ok)
            .toBe(true);
        expect(profileAuthorability({ wallProfile: RING, baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }], height: H, rakeAngleDeg: RAKE } as never).ok)
            .toBe(true);
    });

    /**
     * ✅ INVERTED 2026-08-19 by §FEAT-WALL-PROFILE-BODY, exactly as this test instructed.
     * It used to assert *"the ring draws NOTHING"* and ended: *"⛔ WHEN A LANE BUILDS THE
     * PROFILE BODY, THIS TEST GOES RED. That is correct and intended: invert it to assert
     * the CUT, do not delete it."* Done — and the instruction is the reason it was safe to
     * touch, which is the same discipline that made `A2b`/`A3b` safe.
     */
    it('L-1067 -- the ring is DRAWN: the profiled wall is a DIFFERENT solid, vertical and raked', () => {
        const far = () => mk([50, 50], [55, 50], { rake: VERT });
        for (const rake of [undefined, RAKE]) {
            const withIt = measure(withProfile(rake), far());
            const withoutIt = measure(mk([0, 0], [5, 0], rake === undefined ? {} : { rake }), far());
            expect(Number.isFinite(withIt.leanA), 'the profiled wall builds').toBe(true);
            // The ring cuts the far end from v=3 down to v=1. A wall that DRAWS it has a
            // different silhouette; the pre-fix reading was these two being equal to 9dp.
            // ⚠ NOT `topRingY`. The ring cuts the NEAR end down to v=1 and leaves the far
            //   end at v=3, so the body's MAXIMUM y is unchanged and a whole-body extremum
            //   reads the cut as absent — it failed exactly that way, "expected 3 to be
            //   less than 2.999". What the cut actually changes is how MUCH of the wall
            //   still reaches the top.
            expect(withIt.topRingCount, `rake=${rake ?? 'none'}: less of the wall reaches the top`)
                .toBeLessThan(withoutIt.topRingCount);
        }
    });

    it('L-1067 -- and a profile COMPOSES with a rake rather than replacing it', () => {
        // The ring is authored in the UN-SHEARED frame, so the two are independent: the
        // profile cuts, then the group leans. Asserted because "they compose" is exactly
        // the kind of claim a comment can make and no code can be held to.
        const far = () => mk([50, 50], [55, 50], { rake: VERT });
        const flat = measure(withProfile(undefined), far());
        const leaning = measure(withProfile(RAKE), far());
        expect(flat.leanA, 'un-raked: the profiled wall is upright').toBeLessThan(COINCIDENT_M);
        expect(leaning.leanA, 'raked: the SAME profiled wall leans by h*cot(theta)')
            .toBeCloseTo(EXPECTED_LEAN, 6);
    });
});

/**
 * -- §RK1-MATRIX-BLANKS -- what this file does NOT reach ------------------------------
 *
 * Stated so the blanks are visible rather than mistaken for clearances (C84 EI-1b).
 *
 *  1. **`WallJunctionInfillManager` is never exercised.** `buildWall` does not call it;
 *     the infill is a separate pass, and it carries its own datum
 *     (`WallJunctionInfillManager.ts:122-123` reads the wall BASELINE Y, which means
 *     different things by creation route). The "triangular prism with unclamped
 *     vertices" the founder has seen therefore CANNOT appear in this matrix -- measuring
 *     it needs the infill pass in the harness, not just the fragment builder.
 *  2. **MOVE-time junction behaviour is out of scope** -- that is lane WM1's path
 *     (`WallMoveReweldService`, `moveReweldPreflight`). This file is GEOMETRY-time only.
 *  3. ✅ **THE X METRIC IS FIXED, AND EVERY OLD X READING WAS FICTION** (WJ1,
 *     2026-08-19). This blank used to read *"NO CONCLUSION -- sound or unsound -- may be
 *     drawn from any X row"*, and it named two candidate causes: either the X junction
 *     genuinely produces bodies that do not touch, or `hullSeparation` is wrong on this
 *     input. **It was the metric.** `hullSeparation` decided overlap by testing whether a
 *     VERTEX of one hull lay inside the other, and two convex polygons crossing in a PLUS
 *     SIGN -- which is precisely what an X junction is -- overlap with no vertex of either
 *     inside the other. The proof is the control: `X plain@90 vs plain@90`, two upright
 *     walls crossing at the origin with nothing to get wrong, read `sep = 2.400 m`. See
 *     §WJ1-CROSSING-HULLS-SHARE-NO-VERTEX. X rows are now assertable and are asserted in
 *     AXIS 4c; the T rows, which the old blank correctly said were unaffected, are
 *     unchanged by the fix and are asserted there too.
 *  3b. **Only ONE neighbour at a time.** A three-wall Y-junction, and a four-wall X where
 *     all four are raked, are not measured.
 *  4. **`baseOffset` / `slabBaseOffset` are 0 throughout.** The wall-Y datum was resolved
 *     at `8f63fb6f` and is pinned by `WallYDatumAgreement.test.ts`; composing a plinth
 *     offset WITH a rake is not measured here.
 *  5. **The leaf is not measured, only the wall body.** Whether a door/window LEAF sits
 *     in its raked hole is pinned by `geometry-window`'s `HostedLeafSitsInItsHole` and
 *     the `geometry-door` twin, not here.
 *  6. **Stack B (`produceWall`) is not measured.** C85 section 11 #11's parity harness is
 *     still absent from `main`; every reading in this file is Stack A only.
 *  7. **No PERSISTENCE round-trip.** Whether a raked layered wall with openings survives
 *     save/reload is C85 section 5's subject, not this file's.
 *  8. **L-1034 #4, the UI half.** AXIS 5 measures `profileAuthorability`, which is the
 *     gate that decides whether an editor CAN exist. Whether `ContextualEditBar`'s
 *     **Edit Profile** button actually follows that gate is an `apps/editor` (L7)
 *     question and is NOT measured here — an L2 test may not import L7, and mirroring
 *     the rule into this file would be the C84 section 8.d defect ("a comment as the
 *     synchronisation mechanism"). Somebody must measure the BUTTON where the button
 *     lives.
 *  9. **Profile x rake GEOMETRY is unmeasured.** AXIS 5 establishes that a raked wall is
 *     OFFERED the profile editor — `profileAuthorability` has no rake arm at all. It does
 *     NOT establish that the resulting body is correct. A profile is authored in the
 *     wall's own UN-SHEARED plane (`WallTypes.ts` says so explicitly: *"both measured in
 *     the UN-SHEARED frame, so a profile and a rake compose"*), and that composition has
 *     never been built and measured. **An affordance that is offered and unverified is a
 *     worse state than one that is refused with a reason** — this is the highest-value
 *     blank in this file.
 */
