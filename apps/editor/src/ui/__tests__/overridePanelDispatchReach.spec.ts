/**
 * §OVERRIDE-PANEL-DISPATCH-IS-DEAD (L-1870) — REACHABILITY suite for OverridePanel.
 *
 * THE DEFECT THIS PINS
 * ────────────────────────────────────────────────────────────────────────────
 * `OverridePanel` dispatches every one of its mutations through
 * `this.runtime?.bus?.executeCommand(...)`. BOTH of its production construction
 * sites called `new OverridePanel()` with NO argument:
 *
 *   apps/editor/src/engine/views/PlanViewManager.ts:344
 *   apps/editor/src/ui/views/ViewHeaderButtons.ts:66
 *
 * so `this.runtime` was `null`, the optional chain short-circuited, and the
 * whole per-view Visibility & Graphics panel — intent picker, clear-override,
 * clear-all, promote-to-intent — mutated NOTHING. No throw, no log, no type
 * error: `?.` converts a wiring defect into silence.
 *
 * WHY THE TEST CONSTRUCTS WITH NO ARGUMENT
 * ────────────────────────────────────────────────────────────────────────────
 * Passing a runtime explicitly here would test the fix and MISS the defect —
 * the call sites' mistake was the omission itself. Every case below therefore
 * uses `new OverridePanel()`, exactly as production did, and asserts the panel
 * still reaches a bus. Against the pre-fix code these fail; that is the point.
 *
 * This is a reachability suite, not a behaviour suite: it asserts the command
 * ARRIVES at the bus. Whether the handler then does the right thing is
 * initBusHandlers' contract, covered elsewhere.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { OverridePanel } from '../OverridePanel';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';

type Dispatch = { name: string; payload: unknown };

function installFakeRuntime(): Dispatch[] {
    const seen: Dispatch[] = [];
    (window as unknown as { runtime?: unknown }).runtime = {
        bus: {
            executeCommand: (name: string, payload: unknown) => {
                seen.push({ name, payload });
                return { success: true };
            },
        },
        events: { on: () => ({ dispose: () => {} }) },
    };
    return seen;
}

describe('§OVERRIDE-PANEL-DISPATCH-IS-DEAD — the panel reaches a bus even when built with no argument', () => {
    let seen: Dispatch[];

    beforeEach(() => {
        seen = installFakeRuntime();
        viewIntentInstanceStore.reset();
        // The panel is reached in production as a `window.overridePanel` singleton;
        // clear it so each case constructs its own.
        delete (window as unknown as { overridePanel?: unknown }).overridePanel;
    });

    afterEach(() => {
        delete (window as unknown as { runtime?: unknown }).runtime;
        viewIntentInstanceStore.reset();
    });

    it('resolves a runtime from window when the caller omits the argument (the exact call-site shape)', () => {
        const panel = new OverridePanel(); // ← PlanViewManager.ts:344 / ViewHeaderButtons.ts:66
        // Pre-fix this was `null`, which is what made all nine dispatch sites no-ops.
        expect(panel.runtime).not.toBeNull();
        expect(panel.runtime?.bus?.executeCommand).toBeTypeOf('function');
    });

    it('open() on an UNBOUND view dispatches vg.assignIntent — pre-fix it dispatched nothing', () => {
        const panel = new OverridePanel();
        expect(viewIntentInstanceStore.has('view-unbound')).toBe(false);

        panel.open('view-unbound');

        const assigns = seen.filter(d => d.name === 'vg.assignIntent');
        expect(assigns.length).toBeGreaterThan(0);
        expect(assigns[0].payload).toMatchObject({ viewId: 'view-unbound' });
    });

    it('an explicitly injected runtime still WINS over the window fallback', () => {
        const injectedSeen: Dispatch[] = [];
        const injected = {
            bus: {
                executeCommand: (name: string, payload: unknown) => {
                    injectedSeen.push({ name, payload });
                    return { success: true };
                },
            },
            events: { on: () => ({ dispose: () => {} }) },
        } as unknown as import('@pryzm/runtime-composer/types').PryzmRuntime;

        const panel = new OverridePanel(injected);
        panel.open('view-injected');

        // The injected bus saw it; the window fallback did not.
        expect(injectedSeen.some(d => d.name === 'vg.assignIntent')).toBe(true);
        expect(seen.some(d => d.name === 'vg.assignIntent')).toBe(false);
    });

    it('constructing with NO runtime available anywhere does not throw (degrades, never crashes)', () => {
        delete (window as unknown as { runtime?: unknown }).runtime;
        expect(() => {
            const panel = new OverridePanel();
            expect(panel.runtime).toBeNull();
            panel.open('view-no-runtime');
        }).not.toThrow();
    });
});

describe('§OVERRIDE-PANEL-DISPATCH-IS-DEAD — the two production call sites pass a runtime', () => {
    // A source-level assertion, deliberately. The construction sites live in modules
    // whose full load graph (OBC, fragments, a World) cannot be instantiated under
    // happy-dom, so the reachable proof that they no longer call `new OverridePanel()`
    // bare is to read them. This is the cheapest gate that would have caught L-1870.
    it('neither PlanViewManager nor ViewHeaderButtons constructs OverridePanel bare', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        for (const rel of [
            'apps/editor/src/engine/views/PlanViewManager.ts',
            'apps/editor/src/ui/views/ViewHeaderButtons.ts',
        ]) {
            const src = readFileSync(resolve(process.cwd(), rel), 'utf8');
            // Comment lines are excluded deliberately: the fix's own note QUOTES the
            // defective call (`was \`new OverridePanel()\``), and a naive whole-file
            // regex reads that quotation as the defect. Scan CODE lines only.
            const codeLines = src
                .split('\n')
                .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
                .filter(l => l.includes('new OverridePanel('));

            expect(codeLines.length, `${rel} no longer constructs OverridePanel at all`)
                .toBeGreaterThan(0);
            for (const line of codeLines) {
                expect(line, `${rel} still constructs OverridePanel with no argument`)
                    .not.toMatch(/new OverridePanel\(\s*\)/);
            }
        }
    });
});
