/**
 * visibilityIntentPanelReadsIntents.spec.ts
 *
 * §RENAME-VIEW-TEMPLATES-TO-VISIBILITY-INTENT (L-5060..L-5063, lane ANNO15,
 * founder 2026-08-22)
 *
 * The founder saw a panel headed VIEW TEMPLATES with twelve rows, every one
 * reading **VIEWS 0** and **SYNC —**. These pin the three things the fix has to
 * be true about, and each one FAILS on the old panel:
 *
 *   1. The panel is headed **Visibility Intent**.
 *   2. It lists rows from `visibilityIntentStore` — never `viewTemplateStore`.
 *   3. ⭐ The VIEWS count reads `viewIntentInstanceStore`, THE STORE THAT ACTUALLY
 *      BINDS A VIEW TO AN INTENT. This is the differentiating assertion: the old
 *      panel counted `viewDefinition.viewTemplateId`, which NOTHING IN PRODUCTION
 *      EVER WRITES (`AssignViewTemplateToViewCommand` / `SetViewTemplateCommand`
 *      have zero callers outside their own files and barrels), so its column was
 *      pinned at 0 by construction and a test asserting "shows 0" would score
 *      1.000 on the broken build.
 *
 *      Test 3 therefore BINDS a view and asserts the number MOVES. A count that
 *      cannot move is not a count.
 *
 *   4. The panel writes NOTHING to the `@deprecated` `viewTemplateStore`. Its
 *      predecessor dispatched twelve `viewTemplate.create` calls on first open,
 *      against that store's own header — "NEW CODE MUST NOT WRITE TO THIS STORE".
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { visibilityIntentStore, viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { VisibilityIntentManagerPanel } from '../../views/VisibilityIntentManagerPanel';

/** Records every verb the panel puts on the bus. */
function makeSpyRuntime(): { runtime: unknown; verbs: string[] } {
    const verbs: string[] = [];
    const runtime = {
        bus: {
            executeCommand: (type: string) => {
                verbs.push(type);
                return Promise.resolve();
            },
        },
    };
    return { runtime, verbs };
}

function rowNames(root: HTMLElement): string[] {
    // Row name cells are the first grid child's first child's textContent.
    return [...root.querySelectorAll('div')]
        .filter((d) => d.style.gridTemplateColumns === '1fr 54px 80px 64px')
        .slice(1) // index 0 is the column header
        .map((g) => (g.children[0] as HTMLElement | undefined)?.textContent ?? '')
        .filter((t) => t.length > 0);
}

function viewsCellFor(root: HTMLElement, name: string): string | null {
    for (const g of [...root.querySelectorAll('div')]) {
        if (g.style.gridTemplateColumns !== '1fr 54px 80px 64px') continue;
        if ((g.children[0] as HTMLElement | undefined)?.textContent !== name) continue;
        return (g.children[1] as HTMLElement | undefined)?.textContent ?? null;
    }
    return null;
}

describe('VisibilityIntentManagerPanel — the rail panel is intent-backed', () => {
    beforeEach(() => {
        viewIntentInstanceStore.reset();
        document.body.innerHTML = '';
    });

    it('is headed "Visibility Intent", not "View Templates"', () => {
        const { runtime } = makeSpyRuntime();
        const el = new VisibilityIntentManagerPanel(runtime as never).build();
        const text = el.textContent ?? '';
        expect(text).toContain('Visibility Intent');
        expect(text).not.toContain('View Templates yet');
    });

    it('lists every intent in visibilityIntentStore, including all five system intents', () => {
        const { runtime } = makeSpyRuntime();
        const el = new VisibilityIntentManagerPanel(runtime as never).build();

        const expected = visibilityIntentStore.getAll().map((i) => i.name).sort();
        expect(expected.length).toBeGreaterThanOrEqual(5); // the SystemIntents fixture
        expect(rowNames(el).sort()).toEqual(expected);
    });

    it('⭐ the VIEWS count reads viewIntentInstanceStore — it MOVES when a view is bound', () => {
        const { runtime } = makeSpyRuntime();
        const panel = new VisibilityIntentManagerPanel(runtime as never);
        const el = panel.build();

        const intent = visibilityIntentStore.getAll()[0]!;

        // Unbound: 0. (True on the broken panel too — which is exactly why this
        // assertion alone would prove nothing.)
        expect(viewsCellFor(el, intent.name)).toBe('0');

        // Bind a view through the REAL binding store, then re-render.
        viewIntentInstanceStore.assign('view-under-test', intent.id);
        window.dispatchEvent(new CustomEvent('vi:instance-updated', { detail: {} }));

        // The old panel counted view.viewTemplateId and would STILL read '0' here.
        expect(viewsCellFor(el, intent.name)).toBe('1');
    });

    it('writes nothing to the @deprecated viewTemplateStore on open', () => {
        const { runtime, verbs } = makeSpyRuntime();
        new VisibilityIntentManagerPanel(runtime as never).build();
        expect(verbs.filter((v) => v.startsWith('viewTemplate.'))).toEqual([]);
        expect(verbs).toEqual([]); // opening the panel dispatches nothing at all
    });

    it('marks system intents SYSTEM and refuses to edit them', () => {
        const { runtime } = makeSpyRuntime();
        const el = new VisibilityIntentManagerPanel(runtime as never).build();
        expect(el.textContent).toContain('SYSTEM');
    });
});
