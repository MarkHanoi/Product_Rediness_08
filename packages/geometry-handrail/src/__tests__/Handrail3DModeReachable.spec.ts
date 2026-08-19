/**
 * Handrail3DModeReachable — §FIX-HANDRAIL-3D-MODE-BLIND (L-1106 / C95 §15.13).
 *
 * ═══ WHY THIS FILE EXISTS, STATED AS THE HOLE IT FILLS ══════════════════════
 *
 * L-1106 is a breach **on the 3-D surface**: `elementCreationMatrix`'s `railing`
 * row declares `views: ['plan','3d']` for all SEVEN modes, and the 3-D tool
 * implemented ONE. The fix landed as `HandrailSketchController` — but when this
 * suite was written, **the entire proof of it was plan-shaped**:
 * `HandrailCreationParityReachable` drives `RailingPlanToolHandler`, and
 * `handrailRunGenerators.spec` proves the MATHS. Neither asserts anything about
 * 3-D, and the package's other six suites import the controller ZERO times.
 *
 * So the state on arrival was this family's signature defect, one level up: **a
 * fix that compiles, reads correctly, and is measured by nothing on the surface it
 * exists to repair.** 74 green tests said nothing about whether a user can draw a
 * circular handrail in 3-D.
 *
 * ═══ WHAT IS REAL HERE AND WHAT IS A DOUBLE ════════════════════════════════
 * ═══ ([[fake-more-capable-than-real]], applied to this file itself) ═════════
 *
 * REAL: `HandrailSketchController` — the actual production class, constructed
 * exactly as `HandrailTool` constructs it (`surface: '3d'`) — plus the actual
 * `CreateHandrailCommand` / `CreateHandrailRunCommand` instances it builds, read
 * through their OWN `serialize().payload`. No handrail semantics are restated.
 *
 * DOUBLED: only the `HandrailSketchHost` seam — pointer-event→world-XZ and
 * ghost-painting. That seam is *definitionally* the surface-specific half (it is
 * the reason the controller exists), so replacing it is not stubbing the thing
 * under test; it supplies the one part a headless run cannot have.
 *
 * ⛔ AND THE SEAM IS NOT WHERE THE ANSWER LIVES. The By-Slab test that passed over
 * a dead feature stubbed `window.selectionManager` — *the only place in the
 * universe where its condition held* (L-1103). Nothing below is decided by the
 * host: the mode comes from the real store, the vertices from the real generators,
 * the payload from the real command.
 *
 * ═══ AND ONE ASSERTION THAT IS NOT BEHAVIOURAL, DELIBERATELY ════════════════
 *
 * §5 reads `HandrailTool.ts`'s SOURCE. A behavioural suite over the controller
 * proves the controller does seven modes; it CANNOT prove the 3-D tool still
 * routes through it rather than re-growing a gesture of its own — which is the
 * precise regression C95 §15.13 forbids by name. Instantiating `HandrailTool`
 * needs an `OBC.World` with a live WebGL `domElement`, so the declaration is
 * asserted instead: it is the declaration that decides reachability, and it is a
 * handful of lines. (`HandrailCreationParityReachable` asserts the plan registry
 * binding the same way, for the same reason.)
 *
 * CONTRACTS: C84 EI-3 (UI offers ⇒ pipeline accepts) · C84 EI-9 · C95 §15.13 ·
 * C16 §8.6 (one gesture ⇒ one undo entry).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HandrailSketchController, type HandrailSketchPreviewState } from '../HandrailSketchController';
import {
    setActiveHandrailDrawMode,
    setActiveHandrailTypeId,
    setHandrailBySlabTarget,
    __resetActiveHandrailAuthoringForTests,
    type HandrailDrawMode,
} from '../handrailAuthoring';
import type { HandrailBySlabOutcome } from '../handrailCommit';

type AnyRec = Record<string, unknown>;
type Pt = { x: number; z: number };

interface SerializableCommand { serialize(): { type?: string; payload: unknown } }

/** Recorder, not re-implementation — it keeps the REAL command instances. */
const executed: SerializableCommand[] = [];
const bySlabOutcomes: HandrailBySlabOutcome[] = [];
const rendered: HandrailSketchPreviewState[] = [];

function payloadOf(i: number): AnyRec {
    return executed[i]!.serialize().payload as AnyRec;
}
function nameOf(i: number): string {
    return executed[i]!.constructor.name;
}
function segmentsOf(i: number): AnyRec[] {
    return payloadOf(i).segments as AnyRec[];
}

/**
 * The 3-D surface's host, doubled at EXACTLY the seam `HandrailTool` implements:
 * `dispatcher()`, `levelId()`, `preview`, `onBySlab`. Compare `HandrailTool`'s
 * constructor — the same object shape, with the two 3-D-only hooks (raycast, THREE
 * ghost) replaced by recorders.
 */
function make3d(): HandrailSketchController {
    return new HandrailSketchController({
        surface: '3d',
        dispatcher: () => ({ execute: (c: unknown) => { executed.push(c as SerializableCommand); } }),
        levelId: () => 'L0',
        preview: {
            render: (state) => { rendered.push(state); },
            clear: () => { /* the real 3-D tool disposes its ghost objects here */ },
        },
        onBySlab: (outcome) => { bySlabOutcomes.push(outcome); },
    });
}

const P = (x: number, z: number): Pt => ({ x, z });

beforeEach(() => {
    executed.length = 0;
    bySlabOutcomes.length = 0;
    rendered.length = 0;
    __resetActiveHandrailAuthoringForTests();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('1. ALL SEVEN modes are ACCEPTED on the 3-D surface (C84 EI-3)', () => {
    /**
     * The breach as one table: the bar offers these seven in 3-D, so the 3-D
     * pipeline must produce an element for each. Before the fix, three of them
     * (square / circular / ellipse) drew a straight line and `byslab` did nothing —
     * 3 of 7 advertised-and-unimplemented, plus a fourth already closed by L-1103.
     */
    const GESTURES: ReadonlyArray<{ mode: HandrailDrawMode; clicks: readonly Pt[] }> = [
        { mode: 'linear', clicks: [P(0, 0), P(4, 0)] },
        { mode: 'ortho', clicks: [P(0, 0), P(5, 1)] },
        { mode: 'curved', clicks: [P(0, 0), P(5, 3), P(10, 0)] },
        { mode: 'square', clicks: [P(0, 0), P(4, 3)] },
        { mode: 'circular', clicks: [P(10, 10), P(13, 10)] },
        { mode: 'ellipse', clicks: [P(0, 0), P(5, 2.5)] },
    ];

    for (const { mode, clicks } of GESTURES) {
        it(`${mode.toUpperCase()} in 3-D dispatches a real creation command`, () => {
            setActiveHandrailDrawMode(mode);
            const c = make3d();
            for (const pt of clicks) c.onClick(pt);

            expect(executed.length).toBeGreaterThan(0);
            expect(nameOf(0)).toMatch(/^CreateHandrail(Run)?Command$/);
        });
    }

    it('BY SLAB in 3-D dispatches ONE slab-naming command', () => {
        setActiveHandrailDrawMode('byslab');
        setHandrailBySlabTarget('slab-1');
        const c = make3d();
        c.onClick(P(0, 0));

        expect(executed).toHaveLength(1);
        expect(nameOf(0)).toBe('CreateHandrailRunOnSlabCommand');
        expect(payloadOf(0).slabId).toBe('slab-1');
    });

    it('BY SLAB with no slab named ASKS — it never invents one, and never draws a line', () => {
        setActiveHandrailDrawMode('byslab');
        const c = make3d();
        c.onClick(P(0, 0));
        c.onClick(P(4, 0)); // the OLD 3-D tool would have built a handrail from these two

        expect(executed).toHaveLength(0);
        expect(bySlabOutcomes.map((o) => o.kind)).toEqual(['no-slab', 'no-slab']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('2. THE THREE MODES THAT USED TO DRAW A STRAIGHT LINE now really close', () => {
    /**
     * ⭐ THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT L-1106.
     *
     * "Dispatches a command" is not enough: the OLD tool dispatched one too — a
     * straight `CreateHandrailCommand` — for every one of these gestures. What
     * distinguishes fixed from broken is that the gesture yields a CLOSED RUN of
     * ≥3 segments as ONE command, so ONE Ctrl+Z removes the whole ring (C16 §8.6).
     */
    const LOOPS = [
        { mode: 'square' as const, a: P(0, 0), b: P(4, 3), edges: 4 },
        { mode: 'circular' as const, a: P(10, 10), b: P(13, 10), edges: undefined },
        { mode: 'ellipse' as const, a: P(0, 0), b: P(5, 2.5), edges: undefined },
    ];

    for (const { mode, a, b, edges } of LOOPS) {
        it(`${mode.toUpperCase()}: ONE run command, closed, contiguous, one post per vertex`, () => {
            setActiveHandrailDrawMode(mode);
            const c = make3d();
            c.onClick(a);
            c.onClick(b);

            expect(executed).toHaveLength(1);
            expect(nameOf(0)).toBe('CreateHandrailRunCommand');
            const segs = segmentsOf(0);
            expect(segs.length).toBeGreaterThanOrEqual(3);
            if (edges !== undefined) expect(segs).toHaveLength(edges);

            // CLOSED: the last segment ends exactly where the first begins.
            const first = segs[0]!.start as Pt;
            const last = segs[segs.length - 1]!.end as Pt;
            expect(Math.hypot(last.x - first.x, last.z - first.z)).toBeLessThan(1e-9);

            // CONTIGUOUS all the way round — no seam anywhere, not only at closure.
            for (let i = 1; i < segs.length; i++) {
                const prevEnd = segs[i - 1]!.end as Pt;
                const curStart = segs[i]!.start as Pt;
                expect(Math.hypot(curStart.x - prevEnd.x, curStart.z - prevEnd.z)).toBeLessThan(1e-9);
            }

            // NO DOUBLED POST: every segment in a closed loop suppresses its start
            // post, so |posts| (one END each) === |vertices| (C95 §14.1's join rule).
            expect(segs.every((s) => s.suppressStartPost === true)).toBe(true);
        });
    }

    it('the straight-line REGRESSION is named: a loop mode must NOT emit a 2-point handrail', () => {
        for (const mode of ['square', 'circular', 'ellipse'] as const) {
            executed.length = 0;
            setActiveHandrailDrawMode(mode);
            const c = make3d();
            c.onClick(P(0, 0));
            c.onClick(P(4, 3));
            // The exact OLD behaviour, asserted as forbidden.
            expect(nameOf(0)).not.toBe('CreateHandrailCommand');
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('3. the 3-D record is the PLAN record — one type, one answer (C84 EI-9)', () => {
    /**
     * The old 3-D payload hand-listed NINE type fields and silently dropped
     * `balusterShape`, `balusterWidth`, `balusterSpacing` and `infillMaxGap`, so
     * the SAME catalogue type produced a DIFFERENT element depending on which view
     * it was drawn in. Asserted by name because those are the ones that were lost,
     * and non-vacuously, since `undefined === undefined` would pass.
     */
    it('an armed catalogue type reaches the 3-D command with its baluster + infill fields', () => {
        setActiveHandrailTypeId('timber-picket');
        setActiveHandrailDrawMode('linear');
        const c = make3d();
        c.onClick(P(0, 0));
        c.onClick(P(4, 0));

        const p = payloadOf(0);
        expect(p.balusterShape).toBe('rectangular');
        expect(p.balusterWidth).toBeCloseTo(0.038, 9);
        expect(p.infillMaxGap).toBeCloseTo(0.099, 9);
        expect(p.postSpacing).toBeCloseTo(1.8, 9);
        // §C100-HANDRAIL-MATERIAL-ID — the material REFERENCE crosses, and the type
        // ships no hex, so nothing shadows it (C100 §2.1).
        expect(p.materialId).toBe('wood-pine');
        expect(p.materialColor).toBeUndefined();
        // C95 §10.1: the deleted plan-only 1.1 m literal must never reappear.
        expect(p.height).toBe(1.0);
        expect(p.levelId).toBe('L0');
    });

    it('CHAINING in 3-D posts each shared vertex ONCE — the doubled-post trap', () => {
        setActiveHandrailDrawMode('linear');
        const c = make3d();
        c.onClick(P(0, 0));
        c.onClick(P(4, 0));
        c.onClick(P(4, 3));

        expect(executed).toHaveLength(2);
        expect(payloadOf(0).suppressStartPost).toBeFalsy(); // head vertex: nothing else posts it
        expect(payloadOf(1).suppressStartPost).toBe(true);  // already posted by segment 0's end
        expect(payloadOf(1).start).toEqual({ x: 4, z: 0 }); // contiguous, no gap
    });

    it('a mid-run mode switch takes effect on the NEXT click, not at activation', () => {
        setActiveHandrailDrawMode('linear');
        const c = make3d();
        c.onClick(P(0, 0));
        c.onClick(P(4, 0));
        expect(nameOf(0)).toBe('CreateHandrailCommand');

        // The bar's whole reason to exist: the mode is re-read per interaction.
        setActiveHandrailDrawMode('circular');
        c.onClick(P(20, 20));
        c.onClick(P(23, 20));
        expect(nameOf(1)).toBe('CreateHandrailRunCommand');
    });

    it('a sub-100 mm gesture REFUSES rather than dispatching what the command rejects', () => {
        setActiveHandrailDrawMode('linear');
        const c = make3d();
        c.onClick(P(0, 0));
        c.onClick(P(0.02, 0));
        expect(executed).toHaveLength(0);

        setActiveHandrailDrawMode('circular');
        const c2 = make3d();
        c2.onClick(P(0, 0));
        c2.onClick(P(0.05, 0));
        expect(executed).toHaveLength(0);
    });

    it('a null level REFUSES by name — it never guesses a storey', () => {
        setActiveHandrailDrawMode('linear');
        const c = new HandrailSketchController({
            surface: '3d',
            dispatcher: () => ({ execute: (x: unknown) => { executed.push(x as SerializableCommand); } }),
            levelId: () => null,
            preview: { render: () => { /* no ghost */ }, clear: () => { /* no ghost */ } },
        });
        c.onClick(P(0, 0));
        c.onClick(P(4, 0));
        expect(executed).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('4. the 3-D GHOST can express a loop — the half that had to move with it', () => {
    /**
     * The old 3-D preview took a single `(start, end)` PAIR. That is why no amount
     * of mode-awareness upstream would have shown a user a circle: the drawing code
     * could not represent one. The preview state is now a POLYLINE with a `closed`
     * flag, computed by the controller so both surfaces paint the same run.
     */
    it('a loop preview is a closed polyline of ≥3 points, not a 2-point segment', () => {
        setActiveHandrailDrawMode('circular');
        const c = make3d();
        c.onClick(P(10, 10));
        c.onMouseMove(P(13, 10));

        const last = rendered[rendered.length - 1];
        expect(last).toBeDefined();
        expect(last!.closed).toBe(true);
        expect(last!.pts.length).toBeGreaterThanOrEqual(3);
        expect(last!.mode).toBe('circular');
    });

    it('the readout NAMES the armed mode, so a user can contradict a wrong gesture', () => {
        // The old 3-D HUD said "Click to set start point" whatever the bar showed,
        // so a user who armed CIRCULAR and got a line had nothing on screen
        // disagreeing with them. That is what kept L-1106 invisible.
        setActiveHandrailTypeId('glass-frameless');
        setActiveHandrailDrawMode('ellipse');
        const c = make3d();
        const state = c.previewState();
        expect(state.mode).toBe('ellipse');
        expect(state.readout).toContain('ellipse');
        expect(state.readout).toContain('Frameless Glass Balustrade');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('5. `HandrailTool` ROUTES through the shared controller and owns no rival gesture', () => {
    const RAW = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), '../HandrailTool.ts'),
        'utf8',
    );

    /**
     * ⚠ THE COMMENT-STRIPPING IS THE POINT, NOT AN OPTIMISATION — and it is here
     * because the first version of this section FAILED, on prose.
     *
     * `HandrailTool`'s header names `crypto.randomUUID()` and `_selectedTypeId`
     * EXPLICITLY, in order to record that it no longer uses either. So a
     * "must not appear" assertion over RAW source is satisfied by DELETING the
     * documentation and broken by WRITING it — it measures the comment, not the
     * code, and it fails in the safe direction only by luck. Both of these matched
     * the header on the first run.
     *
     * (String-aware for `//` so a path inside a literal is not mistaken for a line
     * comment; there are no regex literals in the subject.)
     */
    const SRC = RAW
        // every /** ... */ and /* ... */ block, which is where both false
        // positives lived,
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // ...and whole-line // comments. Trailing // comments are deliberately
        // left: none of the three fingerprints below appears in one, and a
        // string-aware scanner would be more machinery than the claim needs.
        .replace(/^[ \t]*\/\/.*$/gm, '');

    it('the stripper really removed the prose it is there to remove (the control)', () => {
        // Without this, §5's three negative assertions could all pass because the
        // stripper over-deleted — a green that means "nothing was searched".
        expect(RAW).toMatch(/_selectedTypeId/);       // present, in the HEADER
        expect(SRC).toMatch(/new HandrailSketchController\(/); // code survived
        expect(SRC).toMatch(/private _renderGhost/);
    });

    it('it constructs the shared controller, declaring the 3-D surface', () => {
        expect(SRC).toMatch(/new HandrailSketchController\(/);
        expect(SRC).toMatch(/surface:\s*'3d'/);
    });

    it('its pointer handlers DELEGATE — they do not accumulate vertices themselves', () => {
        expect(SRC).toMatch(/_sketch\.onClick\(/);
        expect(SRC).toMatch(/_sketch\.onMouseMove\(/);
        expect(SRC).toMatch(/_sketch\.onDoubleClick\(/);
    });

    /**
     * ⛔ THE REGRESSION C95 §15.13 FORBIDS BY NAME: *"the fix is NOT 'add modes to
     * `HandrailTool`'"*. If a future edit re-grows a commit path here, the family is
     * back to the two answers this lane exists to remove. These are the fingerprints
     * the OLD implementation actually had, so each is a real anti-regression rather
     * than a stylistic rule.
     */
    it('it mints NO handrail record of its own — no command construction, no rival id shape', () => {
        expect(SRC).not.toMatch(/new CreateHandrail(Run(OnSlab)?)?Command\b/);
        expect(SRC).not.toMatch(/crypto\.randomUUID/);
    });

    it('it holds no second answer to "which type is armed?"', () => {
        // The old `_selectedTypeId` field WAS the second authority, kept in step by
        // a write-through mirror (C84 EI-9 / C84 §8.d).
        expect(SRC).not.toMatch(/_selectedTypeId/);
    });
});
