/**
 * DoorPlacementFlip.test.ts — §FEAT-DOOR-FLIP-ON-SPACE (L-92, ADR-0107).
 *
 * Proves the shared SPACE-to-flip state that both door placement tools
 * (DoorPlanToolHandler in plan view, DoorTool in 3D) converge on:
 *
 *   1. each SPACE press advances the door config through ALL FOUR states —
 *      swing INWARD/OUTWARD × hinge LEFT/RIGHT — cyclically, wrapping 3 → 0;
 *   2. the committed door reads the chosen swingDirection()/hingesSide() — so the
 *      configuration the user flipped to before clicking is what gets placed;
 *   3. the four states are DISTINCT (every hand × swing combination is reachable);
 *   4. reset() (Esc / deactivate) returns to the first state (inward / left), which
 *      matches the DoorOpening schema defaults;
 *   5. the installed key handler ignores SPACE while a form field is focused and
 *      calls preventDefault(); detach() removes it (no leak).
 *
 * Node vitest — the class only touches `document` when attach()ed, which
 * happy-dom / jsdom provide. The DOM block self-skips under the node env
 * core-app-model runs (mirrors PrePlacementRotation.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    DoorPlacementFlip,
    DOOR_FLIP_STATES,
} from './DoorPlacementFlip.js';

describe('DoorPlacementFlip — §FEAT-DOOR-FLIP-ON-SPACE', () => {
    it('starts at the first state (inward / left) — matches DoorOpening schema defaults', () => {
        const f = new DoorPlacementFlip();
        expect(f.index()).toBe(0);
        expect(f.swingDirection()).toBe('inward');
        expect(f.hingesSide()).toBe('left');
    });

    it('exposes exactly the four hand × swing configurations', () => {
        expect(DOOR_FLIP_STATES).toHaveLength(4);
        const combos = new Set(DOOR_FLIP_STATES.map(s => `${s.swingDirection}/${s.hingesSide}`));
        expect(combos).toEqual(new Set([
            'inward/left', 'inward/right', 'outward/left', 'outward/right',
        ]));
    });

    it('SPACE cycles through ALL 4 states and wraps back to the first', () => {
        const f = new DoorPlacementFlip();

        // state 0 — inward / left (start)
        expect(f.swingDirection()).toBe('inward');
        expect(f.hingesSide()).toBe('left');

        f.advance(); // state 1 — inward / right
        expect(f.swingDirection()).toBe('inward');
        expect(f.hingesSide()).toBe('right');

        f.advance(); // state 2 — outward / left
        expect(f.swingDirection()).toBe('outward');
        expect(f.hingesSide()).toBe('left');

        f.advance(); // state 3 — outward / right
        expect(f.swingDirection()).toBe('outward');
        expect(f.hingesSide()).toBe('right');

        // Fourth press wraps back to state 0.
        f.advance();
        expect(f.index()).toBe(0);
        expect(f.swingDirection()).toBe('inward');
        expect(f.hingesSide()).toBe('left');
    });

    it('visits four DISTINCT configurations across one full cycle', () => {
        const f = new DoorPlacementFlip();
        const seen = new Set<string>();
        for (let i = 0; i < 4; i++) {
            const s = f.state();
            seen.add(`${s.swingDirection}/${s.hingesSide}`);
            f.advance();
        }
        expect(seen.size).toBe(4);
    });

    it('the values committed to the create command are the flipped swing/hand', () => {
        const f = new DoorPlacementFlip();
        f.advance(); // inward / right
        f.advance(); // outward / left
        // A door tool reads these straight into the wall.opening.create payload.
        expect(f.swingDirection()).toBe('outward');
        expect(f.hingesSide()).toBe('left');
    });

    it('label() reads the live configuration for the HUD', () => {
        const f = new DoorPlacementFlip();
        expect(f.label()).toBe('In · Left');
        f.advance();
        expect(f.label()).toBe('In · Right');
        f.advance();
        expect(f.label()).toBe('Out · Left');
        f.advance();
        expect(f.label()).toBe('Out · Right');
    });

    it('reset() returns to the first state (Esc / deactivate)', () => {
        const f = new DoorPlacementFlip();
        f.advance();
        f.advance();
        expect(f.index()).toBe(2);
        f.reset();
        expect(f.index()).toBe(0);
        expect(f.swingDirection()).toBe('inward');
        expect(f.hingesSide()).toBe('left');
    });

    it('honours a custom initial index, normalized into range', () => {
        const f = new DoorPlacementFlip({ initialIndex: 3 });
        expect(f.index()).toBe(3);
        f.advance(); // wraps to 0
        expect(f.index()).toBe(0);
    });

    it('fires onChange with the new state on each advance', () => {
        const seen: string[] = [];
        const f = new DoorPlacementFlip({ onChange: (s) => seen.push(`${s.swingDirection}/${s.hingesSide}`) });
        f.advance();
        f.advance();
        expect(seen).toEqual(['inward/right', 'outward/left']);
    });

    it('normalization keeps the index in [0,4) after many presses', () => {
        const f = new DoorPlacementFlip();
        for (let i = 0; i < 9; i++) f.advance(); // 9 mod 4 = 1
        expect(f.index()).toBe(1);
        expect(f.swingDirection()).toBe('inward');
        expect(f.hingesSide()).toBe('right');
    });

    // The attach()/detach() handler touches `document`, which only exists under a
    // DOM test env — self-skips under the node env core-app-model runs.
    const dom = typeof document !== 'undefined' ? describe : describe.skip;
    dom('attach()/detach() key handling', () => {
        let f: DoorPlacementFlip;

        beforeEach(() => { f = new DoorPlacementFlip(); });
        afterEach(() => { f.detach(); });

        function press(code: string, key: string, target?: EventTarget): KeyboardEvent {
            const ev = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true });
            if (target) Object.defineProperty(ev, 'target', { value: target });
            document.dispatchEvent(ev);
            return ev;
        }

        it('SPACE advances the flip and preventDefault()s (no page scroll)', () => {
            f.attach();
            const ev = press('Space', ' ');
            expect(f.index()).toBe(1);
            expect(ev.defaultPrevented).toBe(true);
        });

        it('non-SPACE keys are ignored', () => {
            f.attach();
            press('KeyR', 'r');
            expect(f.index()).toBe(0);
        });

        it('SPACE is ignored while a form field is focused', () => {
            f.attach();
            const input = document.createElement('input');
            document.body.appendChild(input);
            press('Space', ' ', input);
            expect(f.index()).toBe(0); // typing a dimension is unaffected
            input.remove();
        });

        it('detach() removes the listener — SPACE no longer advances', () => {
            f.attach();
            press('Space', ' ');
            expect(f.index()).toBe(1);
            f.detach();
            press('Space', ' ');
            expect(f.index()).toBe(1);
        });

        it('attach() is idempotent — a single SPACE advances exactly one step', () => {
            f.attach();
            f.attach();
            press('Space', ' ');
            expect(f.index()).toBe(1);
        });
    });
});
