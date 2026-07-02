/**
 * PrePlacementRotation.test.ts — §FEAT-PLACEMENT-SPACEBAR-ROTATE (ADR-0105).
 *
 * Proves the shared SPACE-to-rotate state that every one-click placement tool
 * (FurniturePlanToolHandler, 3D FurnitureTool, FurnitureDragDropHandler GLB
 * click-to-place, …) converges on:
 *
 *   1. each SPACE press advances the preview yaw +90° (π/2), cumulative and
 *      wrapping 90→180→270→0 (mod 360);
 *   2. the committed element reads the ACCUMULATED yaw via rotationY() — so the
 *      orientation the user chose before clicking is what gets placed;
 *   3. Esc/tool-switch reset() returns the state to 0°;
 *   4. the installed key handler ignores SPACE while a form field is focused
 *      (so typing a dimension is unaffected) and calls preventDefault() so the
 *      page never scrolls;
 *   5. detach() removes the listener (no leak after Esc / commit).
 *
 * Node vitest — the class only touches `document` when attach()ed, which
 * happy-dom / jsdom provide. This suite drives the state directly (unit-level),
 * mirroring the direct-import style used by the sibling preview tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    PrePlacementRotation,
    PRE_PLACEMENT_ROTATION_STEP,
} from './PrePlacementRotation.js';

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

describe('PrePlacementRotation — §FEAT-PLACEMENT-SPACEBAR-ROTATE', () => {
    it('starts at 0°', () => {
        const r = new PrePlacementRotation();
        expect(r.rotationY()).toBe(0);
        expect(r.degrees()).toBe(0);
    });

    it('exports a 90° default step (Revit parity)', () => {
        expect(PRE_PLACEMENT_ROTATION_STEP).toBeCloseTo(HALF_PI, 10);
    });

    it('advances +90° per press, cumulative and wrapping 90→180→270→0', () => {
        const r = new PrePlacementRotation();

        r.advance();
        expect(r.rotationY()).toBeCloseTo(HALF_PI, 10);
        expect(r.degrees()).toBe(90);

        r.advance();
        expect(r.rotationY()).toBeCloseTo(Math.PI, 10);
        expect(r.degrees()).toBe(180);

        r.advance();
        expect(r.rotationY()).toBeCloseTo(3 * HALF_PI, 10);
        expect(r.degrees()).toBe(270);

        // Fourth press wraps back to 0 (mod 360), not 360.
        r.advance();
        expect(r.rotationY()).toBeCloseTo(0, 10);
        expect(r.degrees()).toBe(0);
    });

    it('the value committed to the create command is the ACCUMULATED yaw', () => {
        const r = new PrePlacementRotation();
        r.advance(); // 90
        r.advance(); // 180
        // A placement tool reads rotationY() straight into the command payload.
        const committedRotation = r.rotationY();
        expect(committedRotation).toBeCloseTo(Math.PI, 10);
    });

    it('reset() returns to 0° (Esc / tool-switch)', () => {
        const r = new PrePlacementRotation();
        r.advance();
        r.advance();
        expect(r.degrees()).toBe(180);
        r.reset();
        expect(r.rotationY()).toBe(0);
        expect(r.degrees()).toBe(0);
    });

    it('honours a custom step and initial rotation, normalized to [0, 2π)', () => {
        const r = new PrePlacementRotation({ step: HALF_PI, initial: 3 * HALF_PI });
        expect(r.rotationY()).toBeCloseTo(3 * HALF_PI, 10);
        r.advance(); // wraps to 0
        expect(r.rotationY()).toBeCloseTo(0, 10);
    });

    it('setBase() sets a base facing WITHOUT firing onChange (wall-snap tools)', () => {
        const onChange = vi.fn();
        const r = new PrePlacementRotation({ onChange });
        r.setBase(Math.PI);
        expect(r.rotationY()).toBeCloseTo(Math.PI, 10);
        expect(onChange).not.toHaveBeenCalled();
        // A subsequent SPACE offset stacks on top of the base.
        r.advance();
        expect(r.rotationY()).toBeCloseTo(3 * HALF_PI, 10);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('fires onChange with the new rotation on each advance', () => {
        const seen: number[] = [];
        const r = new PrePlacementRotation({ onChange: (rad) => seen.push(rad) });
        r.advance();
        r.advance();
        expect(seen).toHaveLength(2);
        expect(seen[0]).toBeCloseTo(HALF_PI, 10);
        expect(seen[1]).toBeCloseTo(Math.PI, 10);
    });

    // The attach()/detach() handler touches `document`, which only exists under a
    // DOM test env. core-app-model runs the default node env (no jsdom/happy-dom
    // dep) to stay free of window-touching siblings, so this block self-skips
    // there — the mandated advance/commit/reset assertions above always run.
    const dom = typeof document !== 'undefined' ? describe : describe.skip;
    dom('attach()/detach() key handling', () => {
        let r: PrePlacementRotation;

        beforeEach(() => {
            r = new PrePlacementRotation();
        });

        afterEach(() => {
            r.detach();
        });

        function press(code: string, key: string, target?: EventTarget): KeyboardEvent {
            const ev = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true });
            if (target) Object.defineProperty(ev, 'target', { value: target });
            document.dispatchEvent(ev);
            return ev;
        }

        it('SPACE advances the rotation and preventDefault()s (no page scroll)', () => {
            r.attach();
            const ev = press('Space', ' ');
            expect(r.degrees()).toBe(90);
            expect(ev.defaultPrevented).toBe(true);
        });

        it('non-SPACE keys are ignored', () => {
            r.attach();
            press('KeyR', 'r');
            expect(r.degrees()).toBe(0);
        });

        it('SPACE is ignored while a form field is focused', () => {
            r.attach();
            const input = document.createElement('input');
            document.body.appendChild(input);
            press('Space', ' ', input);
            expect(r.degrees()).toBe(0); // typing a dimension is unaffected
            input.remove();
        });

        it('detach() removes the listener — SPACE no longer advances', () => {
            r.attach();
            press('Space', ' ');
            expect(r.degrees()).toBe(90);
            r.detach();
            press('Space', ' ');
            expect(r.degrees()).toBe(90); // unchanged after detach
        });

        it('attach() is idempotent — a single SPACE advances exactly one step', () => {
            r.attach();
            r.attach();
            press('Space', ' ');
            expect(r.degrees()).toBe(90);
        });
    });

    it('normalization keeps rotation in [0, 2π) after many presses', () => {
        const r = new PrePlacementRotation();
        for (let i = 0; i < 9; i++) r.advance(); // 9 × 90° = 810° → 90°
        expect(r.rotationY()).toBeGreaterThanOrEqual(0);
        expect(r.rotationY()).toBeLessThan(TAU);
        expect(r.degrees()).toBe(90);
    });
});
