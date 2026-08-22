// @vitest-environment happy-dom
//
// happy-dom for the SAME reason composeRuntime.test.ts states: the module's
// transitive import chain reads DOM globals at load time (pdfjs-dist, reached
// via file-format/PDFToImageConverter, reads `DOMMatrix`). Nothing in these
// tests touches the DOM.
/**
 * §FIX-ACTIVATE-REPORTS-WHETHER-ANYTHING-RAN — L-4600 (lane PERF13, founder 2026-08-22)
 *
 * ─── What broke ──────────────────────────────────────────────────────────────
 *
 * The founder typed "Create Stair" into the PRYZM chat and was told
 *
 *     "Stair tool is active — … click to place — nothing is created until you click."
 *
 * Nothing was created. The sentence came from the chat placement bridge, which
 * calls `runtime.tools.activate(<matrix tool id>)` and then — unconditionally —
 * reported success, because `activate()` returned `void` and took the SAME code
 * path whether or not an activator had ever been registered under that id.
 *
 * Six declared families were in exactly that state (measured 2026-08-22:
 * `furniture`, `grid`, `lift`, `lighting`, `railing`, `stair-path`).
 *
 * ─── What these tests pin ────────────────────────────────────────────────────
 *
 * That the two outcomes are now DIFFERENT VALUES at the slot boundary. This is
 * `[[context-data-honesty-family]]`'s rule applied to an activation: a failure
 * and a success must never look the same.
 *
 * ⚠ SCOPE, STATED PLAINLY. These tests prove the SLOT reports truthfully. They
 * do NOT prove any real tool arms, that a canvas click places, or that a panel
 * appears — none of that is observable without a browser (ISSUE-LOG L-4600).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildToolsStub } from '../src/composeRuntime.js';

/**
 * The slot under test, built directly.
 *
 * ⛔ NOT a rival composition root (P1). `buildToolsStub` builds ONE slot — a Map
 * and a Set, no I/O — and `composeRuntime()` remains its only production caller.
 * Going through `composeRuntime()` here would stand up 46 plugins, the renderer
 * and the persistence client in order to observe a Map lookup; `picking.slot.test.ts`
 * already established the per-slot pattern for exactly this reason.
 */
const toolsSlot = () => buildToolsStub();

describe('§FIX-ACTIVATE-REPORTS-WHETHER-ANYTHING-RAN — ToolsSlot.activate', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        warn.mockRestore();
    });

    it('returns TRUE when a registered activator ran, and passes the mode through', () => {
        const tools = toolsSlot();
        const seen: (string | undefined)[] = [];
        tools.register('wall', (m) => { seen.push(m); });

        expect(tools.activate('wall', 'ortho')).toBe(true);
        expect(seen).toEqual(['ortho']);
    });

    it('⭐ returns FALSE when NO activator is registered — the exact founder case', () => {
        const tools = toolsSlot();
        // Nothing registered under 'stair'.
        expect(tools.activate('stair')).toBe(false);
    });

    it('returns FALSE when the activator THREW — a throw did not arm the tool either', () => {
        const tools = toolsSlot();
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        tools.register('slab', () => { throw new Error('boom'); });

        // Must not propagate (one bad activator may not break the palette) …
        expect(() => tools.activate('slab')).not.toThrow();
        // … and must not claim success.
        expect(tools.activate('slab')).toBe(false);
        err.mockRestore();
    });

    it('warns, naming the id AND the registered set, so one console line diagnoses it', () => {
        const tools = toolsSlot();
        tools.register('wall', () => {});
        tools.register('door', () => {});

        tools.activate('stair-path');

        expect(warn).toHaveBeenCalled();
        const msg = warn.mock.calls.map((c) => String(c[0])).join('\n');
        expect(msg).toContain('NO ACTIVATOR registered');
        expect(msg).toContain('stair-path');
        // The remedy needs the set that DOES work, not just the one that does not.
        expect(msg).toContain('wall');
        expect(msg).toContain('door');
    });

    it('hasActivator() answers without activating anything', () => {
        const tools = toolsSlot();
        const calls: string[] = [];
        tools.register('door', () => { calls.push('door'); });

        expect(tools.hasActivator('door')).toBe(true);
        expect(tools.hasActivator('stair')).toBe(false);
        // Asking must not arm, and must not move the active-tool id.
        expect(calls).toEqual([]);
        expect(tools.activeToolId).toBeNull();
    });

    it('⛔ STILL records activeToolId and notifies even with no activator — deliberately', () => {
        // This is the half that must NOT change. Panels that only mirror "which
        // tool id is current" (rail highlight, mode bars) keep working for the
        // pseudo-families that legitimately have no activator. The fix RETURNS
        // the fact; it does not withhold the state.
        const tools = toolsSlot();
        const seen: (string | null)[] = [];
        tools.subscribe((id) => { seen.push(id); });

        expect(tools.activate('lighting')).toBe(false);
        expect(tools.activeToolId).toBe('lighting');
        expect(seen).toEqual(['lighting']);
    });

    it('a re-activation of the ALREADY-ACTIVE tool still runs the activator', () => {
        // The early `if (activeToolId === id) return` used to sit BEFORE the
        // return value existed; a caller re-picking the live tool must still be
        // told truthfully whether it armed.
        const tools = toolsSlot();
        let runs = 0;
        tools.register('wall', () => { runs++; });

        expect(tools.activate('wall')).toBe(true);
        expect(tools.activate('wall')).toBe(true);
        expect(runs).toBe(2);
    });
});
