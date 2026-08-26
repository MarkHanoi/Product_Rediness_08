/**
 * §TOOLBAR-MODE-GATE (L-12220..L-12222) — the editing toolbar is Author-only.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE REPORT
 * ═════════════════════════════════════════════════════════════════════════════
 * Founder, verbatim: "On selection, exclude the mode tools on the top (cut,
 * move, rotate…) — this should be omitted on Analysis and Inspect mode views."
 * His screenshot has two green arrows pointing at `.ceb-bar` — undo/redo on
 * the left, the transform/operation cluster on the right — i.e. the WHOLE
 * strip. Those are AUTHORING affordances; in Analysis and Inspect they are
 * noise at best (they crowd a read surface) and a hazard at worst (they
 * invite an edit from a mode built to not make one).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EXTENDING §PANEL-MODE-GATE, NOT A RIVAL MECHANISM
 * ═════════════════════════════════════════════════════════════════════════════
 * §PANEL130 (commit 8dd29a62) solved the identical problem shape for the
 * properties panel: a `propertiesPanel: 'shown' | 'suppressed'` COLUMN on
 * `WorkspaceModeDef`, one predicate (`propertiesPanelAllowedIn`), read at the
 * panel's own single visibility choke point. This suite proves the same shape
 * for `editingToolbar` / `editingToolbarAllowedIn`, read by `ContextualEditBar`
 * at ITS single choke point (`setVisible`) — never a second `if (mode !==
 * 'author')` scattered at call sites, and never a poke at `.ceb-bar` from
 * `WorkspaceController` (that rival-authority shape is exactly what §PANEL130
 * deleted for the panel; see WorkspaceController.ts's own comment naming
 * `.ceb-bar` as "the bar the founder actually reported").
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠ THE HALF THAT MUST NOT BREAK
 * ═════════════════════════════════════════════════════════════════════════════
 * Selection is load-bearing in the very modes the toolbar is suppressed in
 * (Inspect's isolation pipeline, Analysis's selection-driven widgets). This
 * bar never owned selection highlighting — it only reads `selectionBus` and
 * the `bim-selection-changed` / `pryzm-grid-selected` channels others already
 * populate — so ARM D pins that suppressing the BAR leaves `selectionBus`
 * completely unaffected, the same split §PANEL130 drew for the panel.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE CANNOT ESTABLISH
 * ═════════════════════════════════════════════════════════════════════════════
 * happy-dom performs no layout and paints nothing; `classList.contains
 * ('ceb-bar--visible')` is read as a class, not a pixel — nothing here proves
 * the bar was ever ON TOP of an Analysis widget in a real browser. The plan-
 * tool overlays (`window.planViewToolOverlay` / `svpPlanToolOverlay`) are not
 * stood up here, so `_activatePlanTool('none')`'s effect on Move/Copy is
 * exercised as "does not throw with no overlay attached", not as "the plan
 * handler actually deactivated" — that would need `PlanViewToolOverlay`
 * fixtures this suite does not have.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { selectionBus } from '@pryzm/core-app-model';
import {
    WORKSPACE_MODES,
    editingToolbarAllowedIn,
} from '../platform/workspaceModes';
import { ContextualEditBar, type OperationTools } from '../ContextualEditBar';

// ── Harness ──────────────────────────────────────────────────────────────────

interface Bus {
    emit: (event: string, payload: unknown) => void;
}

/**
 * A minimal runtime event bus, installed BEFORE the bar is constructed so its
 * `window.runtime?.events?.on(...)` subscriptions (bim-selection-changed,
 * pryzm-grid-selected, pryzm-workspace-mode) attach immediately — mirroring
 * production, where `window.runtime` is assigned (engineLauncher.ts:179)
 * before `ContextualEditBar` is constructed inside `initUI()` (DockingLayout.ts).
 */
function installRuntimeBus(): Bus {
    const handlers = new Map<string, Array<(p: unknown) => void>>();
    const events = {
        on(event: string, handler: (p: unknown) => void): () => void {
            const list = handlers.get(event) ?? [];
            list.push(handler);
            handlers.set(event, list);
            return () => {
                const i = list.indexOf(handler);
                if (i !== -1) list.splice(i, 1);
            };
        },
        emit(event: string, payload: unknown): void {
            for (const h of [...(handlers.get(event) ?? [])]) h(payload);
        },
    };
    (window as unknown as { runtime?: unknown }).runtime = {
        events,
        bus: { executeCommand: () => Promise.resolve({}) },
    };
    return { emit: (e, p) => events.emit(e, p) };
}

function cancelableTool(): { activate: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> } {
    return { activate: vi.fn(), cancel: vi.fn() };
}

function makeTools(): Record<string, ReturnType<typeof cancelableTool>> {
    return {
        joinTool: cancelableTool(),
        cutTool: cancelableTool(),
        mirrorTool: cancelableTool(),
        copyPasteTool: { ...cancelableTool() },
        scaleTool: cancelableTool(),
        offsetTool: cancelableTool(),
        referenceEditTool: cancelableTool(),
    };
}

let bar: ContextualEditBar;
let bus: Bus;
let tools: ReturnType<typeof makeTools>;

const setMode = (mode: string): void => bus.emit('pryzm-workspace-mode', { mode });
const display = (): boolean => bar.element.classList.contains('ceb-bar--visible');
const btn = (actionOrOpId: string): HTMLElement => {
    const el =
        bar.element.querySelector(`[data-action-id="${actionOrOpId}"]`) ??
        bar.element.querySelector(`[data-op-id="${actionOrOpId}"]`);
    if (!el) throw new Error(`no button for "${actionOrOpId}"`);
    return el as HTMLElement;
};

/** Select a single wall, via BOTH channels the bar actually listens on. */
function selectWall(id = 'w1'): void {
    selectionBus.select(id, 'test');
    bus.emit('bim-selection-changed', {
        object: { userData: { id, elementType: 'wall' } },
        elementId: id,
        elementType: 'wall',
    });
}

function deselect(): void {
    selectionBus.clearAll('test');
    bus.emit('bim-selection-changed', { object: null, elementId: null, elementType: null });
}

beforeEach(() => {
    document.body.innerHTML = '';
    bus = installRuntimeBus();
    selectionBus.clear();
    selectionBus.setSelectionManager(null);
    tools = makeTools();
    const service = { undo: vi.fn(), redo: vi.fn(), deleteSelected: vi.fn() };
    bar = new ContextualEditBar(service as never, null);
    bar.injectOperationTools(tools as unknown as OperationTools);
    // Neutral start: Author mode, nothing selected.
    setMode('author');
});

afterEach(() => {
    selectionBus.clear();
    bar.element.remove();
});

// ── ARM A — the gate itself ──────────────────────────────────────────────────

describe('§TOOLBAR-MODE-GATE ARM A — the registry column is the one gate', () => {
    it('exactly one shipped mode shows the editing toolbar, and it is Author', () => {
        const shown = WORKSPACE_MODES.filter((m) => m.editingToolbar === 'shown').map((m) => m.id);
        expect(shown).toEqual(['author']);
    });

    it('every mode row declares the column — a new mode cannot forget it', () => {
        for (const m of WORKSPACE_MODES) {
            expect(['shown', 'suppressed'], `${m.id}: bad editingToolbar`).toContain(m.editingToolbar);
        }
    });

    it('the predicate answers per mode, and FAILS OPEN on unknown / not-yet-known', () => {
        expect(editingToolbarAllowedIn('author')).toBe(true);
        expect(editingToolbarAllowedIn('inspect')).toBe(false);
        expect(editingToolbarAllowedIn('analysis')).toBe(false);
        expect(editingToolbarAllowedIn('data')).toBe(false);
        expect(editingToolbarAllowedIn('some-future-mode')).toBe(true);
        expect(editingToolbarAllowedIn(null)).toBe(true);
        expect(editingToolbarAllowedIn(undefined)).toBe(true);
    });
});

// ── ARM B — selecting, per mode ──────────────────────────────────────────────

describe('§TOOLBAR-MODE-GATE ARM B — selection does not show the toolbar outside Author', () => {
    for (const mode of WORKSPACE_MODES) {
        const allowed = mode.editingToolbar === 'shown';

        it(`${mode.id}: selecting a wall ${allowed ? 'SHOWS' : 'leaves hidden'} the toolbar`, () => {
            setMode(mode.id);
            selectWall();
            expect(display()).toBe(allowed);
        });
    }

    // ⭐ THE CONTROL. Without a real gate — e.g. a blanket `setVisible` no-op or a
    // `return` inserted unconditionally — this assertion fails along with every
    // suppressed-mode case above, so it proves the gate discriminates rather
    // than merely hiding everything.
    it('Author is genuinely unaffected — the toolbar shows AND carries its buttons', () => {
        setMode('author');
        selectWall();
        expect(display()).toBe(true);
        expect(bar.element.querySelector('[data-op-id="move"]')).toBeTruthy();
        expect(bar.element.querySelector('[data-action-id="delete"]')).toBeTruthy();
    });

    it('a MULTI-selection is gated identically to a single one', () => {
        for (const mode of WORKSPACE_MODES) {
            selectionBus.clearAll('test');
            setMode(mode.id);
            selectionBus.selectMany(['w1', 'w2', 'w3'], 'test', false);
            expect(display(), mode.id).toBe(mode.editingToolbar === 'shown');
        }
    });
});

// ── ARM C — mode changes under an open / armed toolbar ───────────────────────

describe('§TOOLBAR-MODE-GATE ARM C — switching modes with the toolbar open or a tool armed', () => {
    for (const mode of WORKSPACE_MODES.filter((m) => m.editingToolbar === 'suppressed')) {
        it(`author → ${mode.id} CLOSES an already-open toolbar`, () => {
            setMode('author');
            selectWall();
            expect(display()).toBe(true);

            setMode(mode.id);
            expect(display()).toBe(false);
        });
    }

    it('an armed operation is CANCELLED, not stranded, when the mode gates the bar shut', () => {
        setMode('author');
        selectWall();

        // Arm "join" the same way a click does.
        btn('join').click();
        expect(tools.joinTool.activate).toHaveBeenCalledTimes(1);
        expect(btn('join').classList.contains('ceb-btn--active')).toBe(true);

        // The founder's own scope condition: switching away must not leave a
        // live tool with no visible affordance to cancel it.
        setMode('analysis');

        expect(tools.joinTool.cancel).toHaveBeenCalledTimes(1);
        expect(btn('join').classList.contains('ceb-btn--active')).toBe(false);
        expect(display()).toBe(false);
    });

    it('switching to a suppressed mode with NO armed operation does not throw', () => {
        setMode('author');
        selectWall();
        expect(() => setMode('data')).not.toThrow();
        expect(display()).toBe(false);
    });

    /**
     * THE AUTHOR-RETURN DECISION, pinned — and deliberately the OPPOSITE of
     * §PANEL130's choice for the properties panel.
     *
     * `PropertyPanel.hide()` clears the panel's own draft/selection-derived
     * state, so it stays closed until the NEXT selection. `ContextualEditBar`
     * clears no such state when the mode gate hides it — `_selectedObj`,
     * `_selectedIds` and `_selectedGridId` are untouched, because the
     * SELECTION never changed, only the mode did. So returning to Author
     * re-shows the bar for whatever is STILL selected, immediately — waiting
     * for a fresh reselect would be a worse answer for a founder who merely
     * tabbed to Analysis to look at a widget and tabbed straight back.
     */
    it('returning to Author re-shows the toolbar for the selection that never changed', () => {
        setMode('author');
        selectWall();
        expect(display()).toBe(true);

        setMode('analysis');
        expect(display()).toBe(false);
        // The selection itself was never touched by the mode gate.
        expect(selectionBus.currentIds).toEqual(['w1']);

        setMode('author');
        expect(display(), 'the toolbar must reappear without a fresh reselect').toBe(true);
    });

    it('an unknown mode id is IGNORED, not recorded — the toolbar keeps working', () => {
        setMode('author');
        setMode('not-a-real-mode');
        selectWall();
        expect(display()).toBe(true);
    });
});

// ── ARM D — ⭐ the non-regression pin: selection itself is untouched ──────────

describe('§TOOLBAR-MODE-GATE ARM D — selection survives the gate', () => {
    for (const mode of WORKSPACE_MODES.filter((m) => m.editingToolbar === 'suppressed')) {
        it(`${mode.id}: the selection is still held by selectionBus while the bar is hidden`, () => {
            setMode(mode.id);
            selectWall();

            expect(display()).toBe(false);
            expect(selectionBus.currentIds).toEqual(['w1']);
        });
    }

    it('downstream subscribers still receive the select event in a gated mode', () => {
        const seen: number[] = [];
        const unsub = selectionBus.subscribe((ev) => {
            if (ev.type === 'select') seen.push(ev.elementIds.length);
        });
        try {
            setMode('inspect');
            selectionBus.selectMany(['w1', 'w2'], 'test', false);
            expect(seen).toEqual([2]);
        } finally {
            unsub();
        }
    });

    it('deselecting still hides the bar in Author too — the gate does not fake a selection', () => {
        setMode('author');
        selectWall();
        expect(display()).toBe(true);
        deselect();
        expect(display()).toBe(false);
    });
});
