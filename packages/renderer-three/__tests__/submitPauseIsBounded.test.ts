/**
 * §SUBMIT-PAUSE-IS-BOUNDED (founder 2026-09-09 · L-13270 · C04 §SHADOW rule 7)
 *
 * MEASURED, on the founder's own project open:
 *   [RenderPipelineManager] SHADOW_REBUILD_COMPLETE elapsed=16011.5ms
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ SIXTEEN SECONDS OF FROZEN VIEWPORT, INSIDE A LOADER BUILT TO PAINT PROGRESSIVELY
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `SHADOW_REBUILD_COMPLETE` does NO shadow work and nothing proportional to the scene — it
 * times a post-processing pipeline rebuild whose body is O(1). The 16 s is WAIT: the rebuild's
 * `await import('three/webgpu')` continuation was not serviced while the main thread ran a
 * 17.16 s chunked hydrate beside it.
 *
 * ⛔ THE HARM IS NOT THE WAIT, IT IS THE GUARD HELD OPEN ACROSS IT. While
 * `_shadowRebuildPaused` is true, `render()` returns at the `shadowRebuildPaused` gate and
 * NOTHING repaints. The chunked loader yields specifically so *"the user sees a progressive
 * build"* — it painted nothing for 16 of its 17 s.
 *
 * ⛔⛔ AND THE PAUSE IS CORRECT AND MUST STAY — deleting it was the obvious fix and the wrong
 * one. It exists to close the exact crash the founder hit in the same session: *"a shadow depth
 * texture (ShadowDepthTexture) was released while the GPU was still drawing with it"* (L-231,
 * ADR-0111). Removing the pause to recover 16 s would trade a frozen viewport for a dead one.
 *
 * ⭐ SO: A CEILING, NOT A DELETION — and the precedent was already in this file. The sibling
 * caster-release guard is frame-capped *because* **"an unbounded window is a frozen viewport —
 * the L-663 shape"** and **"a bounded guard that degrades is worth more than an unbounded one
 * that blanks the screen."** That reasoning was written for the derived guard and never applied
 * to the primary one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
    resolve(__dirname, '../src/pipeline/RenderPipelineManager.ts'), 'utf8',
);
/** Comments stripped — ban the CONSTRUCT, not the word (three arms hit that trap on 09-08). */
const CODE = SRC.split(String.fromCharCode(10))
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join(' ');

describe('§SUBMIT-PAUSE-IS-BOUNDED — the ceiling exists and the gate consults it', () => {
    it('⭐ a ceiling is declared, in TIME not frames', () => {
        // ⚠ TIME, deliberately. The sibling counts FRAMES because it closes at a frame boundary.
        // This window is held across an await whose continuation is not serviced while the main
        // thread runs a multi-second hydrate — there are no frames to count.
        expect(CODE).toContain('MAX_SUBMIT_PAUSE_MS');
        const m = SRC.match(/const MAX_SUBMIT_PAUSE_MS\s*=\s*(\d+)/);
        expect(m, 'the ceiling must be a literal, readable number').not.toBeNull();
        const ms = Number(m![1]);
        // A healthy rebuild here is single-digit ms (the founder's empty-project open logged
        // 6.0 ms), so the ceiling must sit far above healthy and far below the 16 s observed.
        expect(ms).toBeGreaterThan(500);
        expect(ms).toBeLessThan(16_000);
    });

    it('⭐ the FRAME GATE consults it — a ceiling nothing reads is decoration', () => {
        // §COMMITTED-IS-NOT-REACHABLE. The constant is worthless unless the one hot path that
        // skips the frame asks whether the window has overstayed.
        expect(CODE).toContain('_submitPauseHasOverstayed()');
        const gateAt = CODE.indexOf("_skipFrame('shadowRebuildPaused')");
        expect(gateAt).toBeGreaterThan(-1);
        const window = CODE.slice(Math.max(0, gateAt - 260), gateAt + 60);
        expect(window, 'the gate must be conditional on the ceiling')
            .toContain('_submitPauseHasOverstayed()');
    });

    it('⛔ THE DEVICE-LOSS GUARD IS NOT WEAKENED — the realloc freeze is untouched', () => {
        // THE ARM THAT MATTERS MOST. Releasing the SUBMIT pause lets the viewport paint the
        // scene it already has; releasing the SHADOW-REALLOC freeze would re-open the
        // ShadowDepthTexture crash. `_submitPauseHasOverstayed` must not touch the freeze.
        const at = SRC.indexOf('private _submitPauseHasOverstayed()');
        expect(at).toBeGreaterThan(-1);
        const body = SRC.slice(at, SRC.indexOf('\n    }', at));
        expect(body).not.toContain('setShadowReallocFrozen');
        expect(body).not.toContain('_endShadowRebuildGuard');
        expect(body).not.toContain('_submitPauseDepth--');
    });
});

describe('§SUBMIT-PAUSE-IS-BOUNDED — the clock belongs to the OUTERMOST window', () => {
    it('⭐ a NESTED guard does not restart the clock', () => {
        // §L930-SUBMIT-PAUSE-DEPTH. If an inner pause reset the stamp, a re-arming inner guard
        // could hold the ceiling off forever — which is the unbounded case this ends.
        const at = SRC.indexOf('private _beginShadowRebuildGuard()');
        const body = SRC.slice(at, SRC.indexOf('\n    }', at));
        expect(body).toContain('_submitPauseOpenedAtMs === null');
    });

    it('and only the outermost release clears it', () => {
        const at = SRC.indexOf('private _endShadowRebuildGuard()');
        const body = SRC.slice(at, SRC.indexOf('\n    }', at));
        expect(body).toContain('_submitPauseDepth === 0');
        expect(body).toContain('_submitPauseOpenedAtMs = null');
    });

    it('an overstay is REPORTED, once, with the elapsed time — never silent', () => {
        // A pause that overstays is a defect report: it says the rebuild continuation is not
        // being serviced. Silently releasing would hide the very condition worth knowing about.
        expect(SRC).toContain('_submitPauseCapReported');
        expect(SRC).toMatch(/§SUBMIT-PAUSE-IS-BOUNDED[\s\S]{0,400}held the viewport dark/);
    });
});

describe('§SUBMIT-PAUSE-IS-BOUNDED — the sibling precedent is intact', () => {
    it('the frame-capped caster-release guard still exists and still says why', () => {
        // The reasoning this lane borrowed must survive, or the next lane will not find it.
        expect(SRC).toContain('MAX_CASTER_RELEASE_PAUSED_FRAMES');
        expect(SRC).toMatch(/an unbounded window is a frozen viewport/);
    });

    it('⛔ and the pause itself was NOT deleted — the L-231 gate is still there', () => {
        // The tempting fix. An arm so a later lane does not "simplify" the pause away and
        // re-open the device loss.
        expect(CODE).toContain("_skipFrame('shadowRebuildPaused')");
        expect(CODE).toContain('_shadowRebuildPaused = true');
    });
});
