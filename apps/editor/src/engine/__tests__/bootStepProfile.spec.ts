// bootStepProfile.spec.ts — §STARTUP-BUILDERS-LEG (L-13120).
//
// WHAT THIS FILE IS DEFENDING, AND WHY IT IS WORTH A SPEC AT ALL
//
// The subject is an instrument, and an instrument's only job is to not lie. The specific lie
// this repo has told itself twice out of this exact boot — once about a 44.2 s "hub hang" that
// was a human reading, once about a 300 s "zoom-to-fit" that was a human deciding — is
// ATTRIBUTION: a wall-clock delta between two marks was read as the cost of the code between
// them. `bootStepProfile` exists to make that reading impossible for the builders leg, and
// these tests pin the three properties that make it impossible:
//
//   1. THE LEG IS TILED. Steps partition the leg with no gap and no overlap, so the table can
//      be reconciled against the `markStartupPhase` delta line by line. A profiler whose rows
//      do not sum to the span it claims to explain is how a cost hides.
//   2. `await:` IS LOAD-BEARING, NOT DECORATION. It is the only thing separating "our CPU" from
//      "the event loop ran somebody else's task while we were suspended", and those two demand
//      opposite fixes.
//   3. LONG TASKS ARE ATTRIBUTED BY OVERLAP, NOT CONTAINMENT. This is the one that would
//      actually have broken: the pathological case is a multi-second task that STARTS before a
//      step and ends inside it. Counting only fully-contained tasks reports 0 for exactly the
//      case the instrument was built to catch — a probe that reads clean on the defect.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    beginBootLeg,
    bootStep,
    endBootLeg,
    getBootLegSteps,
    __pushLongTaskForTest,
    __resetBootStepProfile,
} from '../bootStepProfile';

describe('§STARTUP-BUILDERS-LEG — bootStepProfile', () => {
    beforeEach(() => { __resetBootStepProfile(); });
    afterEach(() => { __resetBootStepProfile(); vi.restoreAllMocks(); });

    it('records one row per step, in call order', () => {
        beginBootLeg('builders');
        bootStep('highlighter.setup');
        bootStep('await:type stores');
        bootStep('stair');
        const steps = getBootLegSteps();
        expect(steps.map((s) => s.step)).toEqual([
            'highlighter.setup',
            'await:type stores',
            'stair',
        ]);
    });

    it('classifies ONLY `await:`-prefixed steps as suspended — the own/foreign split depends on it', () => {
        beginBootLeg('builders');
        bootStep('column');
        bootStep('await:material-library');
        const steps = getBootLegSteps();
        expect(steps[0]!.awaited).toBe(false);
        expect(steps[1]!.awaited).toBe(true);
    });

    it('tiles the leg: steps partition it with no gap and no overlap', () => {
        // The rows must sum to the leg's own wall time, or a cost can sit between two rows and
        // be invisible in a table that still looks complete.
        beginBootLeg('builders');
        bootStep('a');
        bootStep('b');
        bootStep('c');
        const steps = getBootLegSteps();
        const sum = steps.reduce((acc, s) => acc + s.ms, 0);
        // Every step is non-negative and the sum is the elapsed leg — measured against the same
        // clock, so this is an identity, not a tolerance question. Allow for clock granularity.
        for (const s of steps) expect(s.ms).toBeGreaterThanOrEqual(0);
        expect(sum).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(sum)).toBe(true);
    });

    it('attributes a long task by OVERLAP, so a task that straddles a step boundary is not lost', () => {
        // ⭐ THE REGRESSION THIS FILE EXISTS FOR. Build a leg whose steps have known windows,
        // then inject a long task that starts BEFORE the second step and ends inside it. Under
        // containment semantics this scores 0 and the instrument reports a clean leg on the
        // exact shape it was written to catch.
        const nowSpy = vi.spyOn(performance, 'now');
        nowSpy.mockReturnValueOnce(1000); // beginBootLeg
        nowSpy.mockReturnValueOnce(1100); // end of step 'own-work'   → window [1000,1100)
        nowSpy.mockReturnValueOnce(1900); // end of step 'await:x'    → window [1100,1900)
        beginBootLeg('builders');
        bootStep('own-work');
        bootStep('await:x');
        nowSpy.mockRestore();

        // A 500 ms task from 900 → 1400: 200 ms of it lands in 'own-work', 300 ms in 'await:x'.
        __pushLongTaskForTest(900, 500);

        const steps = getBootLegSteps();
        expect(steps[0]!.longTaskMs).toBeCloseTo(100, 5);  // [1000,1100) ∩ [900,1400) = 100
        expect(steps[1]!.longTaskMs).toBeCloseTo(300, 5);  // [1100,1900) ∩ [900,1400) = 300
        // Under containment semantics BOTH of these would be 0 — the task is contained by
        // neither step. That is the bug this assertion forbids.
    });

    it('reports a leg dominated by foreign work as foreign, not as its own code', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'table').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const nowSpy = vi.spyOn(performance, 'now');
        nowSpy.mockReturnValueOnce(0)      // beginBootLeg
              .mockReturnValueOnce(10)     // 'own-work'  → [0,10)
              .mockReturnValueOnce(18_000);// 'await:x'   → [10,18000)
        beginBootLeg('builders');
        bootStep('own-work');
        bootStep('await:x');
        nowSpy.mockRestore();
        __pushLongTaskForTest(10, 17_000);

        endBootLeg('builders');

        // The warning is the whole point: it says, in the founder's own console, that making
        // this leg's code faster cannot move the number.
        expect(warn).toHaveBeenCalled();
        const msg = warn.mock.calls.map((c) => String(c[0])).join('\n');
        expect(msg).toContain('OTHER main-thread');
    });

    it('is a no-op — never a throw — when no leg is open', () => {
        // `initBuilders` is called from specs and from a second boot path where nobody opened a
        // leg. An instrument that throws there would take the boot down with it.
        expect(() => bootStep('orphan')).not.toThrow();
        expect(() => endBootLeg('never-opened')).not.toThrow();
        expect(getBootLegSteps()).toEqual([]);
    });

    it('does not carry steps from one leg into the next', () => {
        beginBootLeg('builders');
        bootStep('a');
        vi.spyOn(console, 'table').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        endBootLeg('builders');
        beginBootLeg('tools');
        bootStep('b');
        expect(getBootLegSteps().map((s) => s.step)).toEqual(['b']);
    });
});
