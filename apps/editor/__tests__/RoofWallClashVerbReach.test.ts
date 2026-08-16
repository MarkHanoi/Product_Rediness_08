/**
 * §GE-06-ROOF-WALL-WIRE — THE REACHABILITY PROOF.
 *
 * ── What this file is for, stated before the first assertion ────────────────
 * `packages/geometry-roof/src/pure/roofWallClash.ts` has been green since
 * `83c82c02`: 13 oracle tests, a real algorithm. That proved the FUNCTION. It
 * proved nothing about whether a user pressing "Run clash detection" could ever
 * reach it — and for four months, they could not. GE-06's own manifest called
 * that state `EXISTS_BUT_UNWIRED`.
 *
 * So this suite deliberately does NOT call `detectRoofWallClashes`. Every
 * assertion below goes through `bus.executeCommand('clash-run', {})` on a REAL
 * `CommandBus` — the same class `engineLauncher` constructs — and reads the
 * `EventRecord` that comes back. A pure function's return value is not
 * evidence that a verb works (§COMMITTED-IS-NOT-REACHABLE); a record off the
 * bus is.
 *
 * ── The three answers a clash verb must be able to give ─────────────────────
 * §2  a real clash        → `report.findings` names the roof, the wall, the depth
 * §3  a real NON-clash    → `report.findings` is `[]` AND `report.checked` says
 *                           what that emptiness is scoped to
 * §4  an unreadable model → `refusal`, and NO `report` at all
 *
 * §3 and §4 are the pair that matters. Before this lane both were the same
 * observation: nothing came back either way. C70 L-INV-1 forbids exactly that
 * collapse, and §5 asserts the two records do not even serialise alike.
 */

import { describe, expect, it } from 'vitest';
import {
    CommandBus,
    registerClashRun,
    registerClashRefusalHandlers,
    type ClashRunner,
} from '@pryzm/command-bus';
import {
    createRoofWallClashRunner,
    type RoofWallClashSource,
} from '@pryzm/geometry-roof';

const audit = { actorId: 'u', projectId: 'p', clientId: 'c' };

const newBus = (): CommandBus => new CommandBus({ audit, storesProvider: () => ({}) });

// ─── The model fixtures — plain records, the shape the real stores hold ──────

/** A 10×10 m square footprint, origin corner. */
const SQUARE: Array<[number, number]> = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
];

/** One wall crossing the middle of that square, from edge to edge. */
const midWall = (height: number) => ({
    id: 'w-1',
    baseLine: [
        { x: 1, z: 5 },
        { x: 9, z: 5 },
    ],
    height,
});

/**
 * A source over ONE level holding ONE flat roof and ONE wall.
 *
 * The arithmetic every case below relies on, written once:
 *   roof underside = (elevation + baseOffset) − thickness
 *   wall top       = elevation + wallHeight
 * so `elevation 0, baseOffset 3, thickness 0.3` puts the soffit at 2.7 m, and
 * the wall height alone decides clash / clean.
 */
function sourceWith(opts: {
    elevation: number | undefined;
    baseOffset: number;
    thickness: number;
    wallHeight: number;
    /**
     * Set to strip the roof's footprint, for the §4 unreadable case. Named as
     * a POSITIVE flag rather than an optional polygon: an optional field that
     * defaults to absent is how the first draft of this fixture silently made
     * every case refuse.
     */
    withoutFootprint?: boolean;
}): RoofWallClashSource {
    return {
        levelIds: () => ['L0'],
        roofsOnLevel: () => [
            {
                id: 'r-1',
                footprint: opts.withoutFootprint === true ? undefined : { polygon: SQUARE },
                roofType: 'flat',
                baseOffset: opts.baseOffset,
                thickness: opts.thickness,
                overhang: 0,
            },
        ],
        wallsOnLevel: () => [midWall(opts.wallHeight)],
        levelElevation: () => opts.elevation,
    };
}

// ─── 1 · The port is satisfied by the real geometry package ─────────────────

describe('GE-06 §1 — geometry-roof\'s runner IS a bus ClashRunner', () => {
    it('the L2 runner assigns to the L1 port without a cast', () => {
        // The two shapes are declared in different packages on purpose (L1 must
        // not import L2, and L2 should not take a package edge for a type
        // alias). THIS ASSIGNMENT is what stops them drifting: if either side
        // changes shape, this file stops compiling — which is a failing test,
        // not a comment nobody re-reads.
        const runner: ClashRunner = createRoofWallClashRunner(
            sourceWith({ elevation: 0, baseOffset: 3, thickness: 0.3, wallHeight: 2.7 }),
        );
        expect(runner.pairs).toEqual(['roof×wall']);
    });
});

// ─── 2 · A REAL CLASH, through the bus ──────────────────────────────────────

describe('GE-06 §2 — a real clash comes back off the bus as a finding', () => {
    it('a wall that overshoots the roof underside is REPORTED, with the depth', async () => {
        // Level at 0; flat roof origin 3.0, thickness 0.3 ⇒ underside at 2.7.
        // Wall top = 0 + 3.2 = 3.2 ⇒ penetrates by 0.5 m.
        const bus = newBus();
        registerClashRun(
            bus,
            createRoofWallClashRunner(
                sourceWith({ elevation: 0, baseOffset: 3, thickness: 0.3, wallHeight: 3.2 }),
            ),
        );

        const evt = await bus.executeCommand('clash-run', {});

        expect(evt.refusal).toBeUndefined();
        expect(evt.report).toBeDefined();
        expect(evt.report?.kind).toBe('ran');
        expect(evt.report?.findings).toHaveLength(1);

        const f = evt.report!.findings[0]!;
        expect(f.scope).toBe('roof×wall');
        expect(f.aId).toBe('r-1');
        expect(f.bId).toBe('w-1');
        expect(f.kind).toBe('penetrates');
        // The magnitude is the hand-computed overshoot, not "some number > 0":
        // a detector that returned a constant would pass the weaker assertion.
        expect(f.magnitudeM).toBeCloseTo(0.5, 6);
        // The sentence names both participants, so a log line is actionable.
        expect(f.detail).toContain('r-1');
        expect(f.detail).toContain('w-1');
    });

    it('a wall that falls short is reported as a GAP, distinctly from a penetration', async () => {
        // Underside 2.7; wall top 2.0 ⇒ 0.7 m short.
        const bus = newBus();
        registerClashRun(
            bus,
            createRoofWallClashRunner(
                sourceWith({ elevation: 0, baseOffset: 3, thickness: 0.3, wallHeight: 2.0 }),
            ),
        );

        const evt = await bus.executeCommand('clash-run', {});
        const f = evt.report!.findings[0]!;
        expect(f.kind).toBe('gap');
        expect(f.magnitudeM).toBeCloseTo(0.7, 6);
    });

    it('the run is UNDO-NEUTRAL — a question must not land on the undo stack', async () => {
        const bus = newBus();
        registerClashRun(
            bus,
            createRoofWallClashRunner(
                sourceWith({ elevation: 0, baseOffset: 3, thickness: 0.3, wallHeight: 3.2 }),
            ),
        );
        const evt = await bus.executeCommand('clash-run', {});
        // Empty patch pair BESIDE a populated report. If the answer rode on
        // `forward`, Ctrl+Z would "undo" having asked a question.
        expect(evt.forward).toEqual([]);
        expect(evt.inverse).toEqual([]);
    });
});

// ─── 3 · A REAL EMPTY, through the bus ──────────────────────────────────────

describe('GE-06 §3 — a real non-clash comes back as a SCOPED zero', () => {
    it('a conforming model returns findings: [] — and says what that covers', async () => {
        // Underside 2.7, wall top 2.7 ⇒ the wall meets the soffit exactly. Clean.
        const bus = newBus();
        registerClashRun(
            bus,
            createRoofWallClashRunner(
                sourceWith({ elevation: 0, baseOffset: 3, thickness: 0.3, wallHeight: 2.7 }),
            ),
        );

        const evt = await bus.executeCommand('clash-run', {});

        expect(evt.report?.kind).toBe('ran');
        expect(evt.report?.findings).toEqual([]);
        // THE LOAD-BEARING HALF. An empty findings list is only honest beside
        // the scope it is empty WITHIN. Without `checked`, this record and a
        // verb that never ran are the same observation.
        expect(evt.report?.checked).toEqual(['roof×wall']);
        expect(evt.report?.checked.length).toBeGreaterThan(0);
        // And the five pairs nothing looked at are NAMED, not merely counted,
        // so "no clashes" cannot be read as "no clashes anywhere".
        expect(evt.report?.unchecked).toContain('wall×wall');
        expect(evt.report?.unchecked).toContain('column×slab');
        expect(evt.report?.unchecked).not.toContain('roof×wall');
    });

    it('a readable model with NO roofs is a clean run, not a refusal', async () => {
        // The one empty this runner is allowed to produce: the model was read
        // and contains nothing that could clash in this pair.
        const bus = newBus();
        registerClashRun(
            bus,
            createRoofWallClashRunner({
                levelIds: () => ['L0'],
                roofsOnLevel: () => [],
                wallsOnLevel: () => [midWall(3)],
                levelElevation: () => 0,
            }),
        );
        const evt = await bus.executeCommand('clash-run', {});
        expect(evt.report?.kind).toBe('ran');
        expect(evt.report?.findings).toEqual([]);
        expect(evt.refusal).toBeUndefined();
    });
});

// ─── 4 · UNREADABLE ≠ EMPTY — the invariant, at the bus seam ────────────────

describe('GE-06 §4 — a model that cannot be read REFUSES, and carries no findings', () => {
    it('a level with an unreadable elevation refuses rather than reporting zero', async () => {
        const bus = newBus();
        registerClashRun(
            bus,
            createRoofWallClashRunner(
                sourceWith({
                    elevation: undefined, // the fact that cannot be invented
                    baseOffset: 3,
                    thickness: 0.3,
                    wallHeight: 3.2, // NOTE: this model DOES clash, if it could be read
                }),
            ),
        );

        const evt = await bus.executeCommand('clash-run', {});

        expect(evt.refusal).toBeDefined();
        expect(evt.refusal?.reason).toBe('RELATIONSHIP_NOT_READABLE');
        expect(evt.refusal?.commandType).toBe('clash-run');
        // THE INVARIANT (C70 L-INV-1): there is no empty array to misread. Not
        // `findings: []` — no `report` key at all.
        expect(evt.report).toBeUndefined();
        expect(evt.refusal?.detail).toContain('This is a REFUSAL, not a clean result');
        expect(evt.refusal?.detail).toContain('roof×wall');
    });

    it('a roof with no readable footprint refuses — a roof that cannot be outlined is not "fine"', async () => {
        const bus = newBus();
        registerClashRun(
            bus,
            createRoofWallClashRunner(
                sourceWith({
                    elevation: 0,
                    baseOffset: 3,
                    thickness: 0.3,
                    wallHeight: 3.2,
                    withoutFootprint: true,
                }),
            ),
        );
        const evt = await bus.executeCommand('clash-run', {});
        expect(evt.refusal?.reason).toBe('RELATIONSHIP_NOT_READABLE');
        expect(evt.report).toBeUndefined();
    });

    it('a detector that THROWS refuses — a crash must never surface as "no clashes"', async () => {
        const bus = newBus();
        registerClashRun(bus, {
            pairs: ['roof×wall'],
            run: () => {
                throw new Error('kernel exploded');
            },
        });
        const evt = await bus.executeCommand('clash-run', {});
        expect(evt.refusal?.reason).toBe('PLANNER_THREW');
        expect(evt.refusal?.detail).toContain('kernel exploded');
        expect(evt.report).toBeUndefined();
    });
});

// ─── 5 · The three records are DISTINGUISHABLE — no two are the same value ──

describe('GE-06 §5 — clash / clean / unreadable are three different values', () => {
    async function recordFor(elevation: number | undefined, wallHeight: number) {
        const bus = newBus();
        registerClashRun(
            bus,
            createRoofWallClashRunner(
                sourceWith({ elevation, baseOffset: 3, thickness: 0.3, wallHeight }),
            ),
        );
        return bus.executeCommand('clash-run', {});
    }

    it('no two of the three serialise alike, and only one of them is a refusal', async () => {
        const clash = await recordFor(0, 3.2);
        const clean = await recordFor(0, 2.7);
        const unreadable = await recordFor(undefined, 3.2);

        const answer = (r: { report?: unknown; refusal?: unknown }) =>
            JSON.stringify({ report: r.report ?? null, refusal: r.refusal ?? null });

        expect(answer(clash)).not.toBe(answer(clean));
        expect(answer(clean)).not.toBe(answer(unreadable));
        expect(answer(clash)).not.toBe(answer(unreadable));

        // The specific collapse C70 L-INV-1 forbids: "found nothing" and
        // "could not look" must not both present as an absence of findings.
        expect(clean.report?.findings).toEqual([]);
        expect(unreadable.report).toBeUndefined();
        expect(clean.refusal).toBeUndefined();
        expect(unreadable.refusal).toBeDefined();
    });
});

// ─── 6 · The real run WINS over the refusal, and the other eleven still refuse ─

describe('GE-06 §6 — registering the detector displaces clash-run\'s refusal only', () => {
    it('clash-run detects while the other eleven verbs still refuse BY NAME', async () => {
        const bus = newBus();
        const checked = registerClashRun(
            bus,
            createRoofWallClashRunner(
                sourceWith({ elevation: 0, baseOffset: 3, thickness: 0.3, wallHeight: 3.2 }),
            ),
        );
        // The refusal pass runs SECOND and skips the id that now has a real
        // handler — the "defers to a real implementation" rule, exercised for
        // the first time by an actual implementation rather than a stub.
        const refusing = registerClashRefusalHandlers(bus, checked);
        expect(refusing).not.toContain('clash-run');
        expect(refusing).toHaveLength(11);

        const ran = await bus.executeCommand('clash-run', {});
        expect(ran.report?.findings).toHaveLength(1);

        const refused = await bus.executeCommand('clash-run-all', {});
        expect(refused.refusal?.commandType).toBe('clash-run-all');
        expect(refused.report).toBeUndefined();
    });

    it('the eleven refusals now tell the truth about THIS build\'s coverage', async () => {
        const bus = newBus();
        const checked = registerClashRun(
            bus,
            createRoofWallClashRunner(
                sourceWith({ elevation: 0, baseOffset: 3, thickness: 0.3, wallHeight: 2.7 }),
            ),
        );
        registerClashRefusalHandlers(bus, checked);

        const refused = await bus.executeCommand('clash-report-export', {});
        // Before the runner was registered this sentence said "this build has
        // no clash engine". Saying that in a build that DOES check roof×wall
        // would be a second lie in the opposite direction.
        expect(refused.refusal?.detail).toContain('this build checks only roof×wall');
        expect(refused.refusal?.detail).not.toContain('has no clash engine');
        expect(refused.refusal?.detail).toContain('1 of 6 element pairs');
        // roof×wall must NOT appear in this build's NOT CHECKED list.
        const notChecked = /NOT CHECKED: ([^.]+)\./.exec(refused.refusal!.detail)?.[1] ?? '';
        expect(notChecked).not.toContain('roof×wall');
        expect(notChecked).toContain('wall×wall');
    });
});
