/**
 * §SHEET-MOVE-DISPATCH-IS-DEAD (L-1633) + §SHEET-DROP-WHERE-THE-CURSOR-IS (L-1632)
 *
 * THE FOUNDER'S REPORT (2026-08-21):
 *   "I would like the user to be able to drag and drop the views onto the sheet
 *    (at the moment it works by selecting and being placed automatically
 *    somewhere) — like Mural. Then at the moment I can move the view but it
 *    doesn't stay in place — the layout doesn't work."
 *
 * WHY THESE ASSERT AT THE STORE, THROUGH THE GESTURE
 *   The move verb was never missing. `MoveViewportCommand` exists, `sheetStore.
 *   moveViewport()` works, and `initBusHandlers` bridges `sheet.moveViewport` to
 *   both. What was missing was the UI ever REACHING any of it: the drag's
 *   mouse-up read `(this.runtime?.bus as any)?.executeCommand(...)`, and the
 *   panel is constructed with no runtime, so the whole expression evaluated to
 *   `undefined`. Silently.
 *
 *   A test of `dispatchMoveViewport` alone would have passed against that bug —
 *   the function was fine, nothing called it. So these drive the real mouse
 *   gesture on the real panel and read the real store afterwards
 *   [committed ≠ reachable].
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { sheetStore } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { SheetDefinition } from '@pryzm/core-app-model';

import { SheetEditorPanel } from '../SheetEditor/SheetEditorPanel';
import { VIEW_DRAG_MIME } from '../SheetEditor/SheetEditorContracts';

const SHEET_ID = 'sheet-l1632';
const VIEW_ID = 'view-l1632';
const VP_ID = 'vp-l1632';

/** A1 landscape — the default title block template. */
const PAPER_W = 841;
const PAPER_H = 594;

let panel: SheetEditorPanel | null = null;

function seedSheet(viewports: SheetDefinition['viewports']): void {
    sheetStore.delete(SHEET_ID);
    sheetStore.restore({
        id: SHEET_ID,
        sheetNumber: 'A102',
        name: 'Placement',
        revision: 'A',
        viewports,
        titleBlock: undefined,
        dataPanels: [],
        metadata: {
            createdAt: Date.now(),
            modifiedAt: Date.now(),
            createdBy: 'test',
            version: 1,
        },
    } as unknown as SheetDefinition);
}

/**
 * Minimal command manager: executes the command it is handed.
 *
 * Deliberately NOT a mock that records calls. Recording calls would let a
 * regression that dispatches the right command against the wrong sheet pass;
 * running the command means the assertion is on the STORE, which is the thing
 * the sheet is redrawn from.
 */
interface ExecutableCommand {
    execute: (ctx: unknown) => unknown;
    canExecute?: (ctx: unknown) => { ok: boolean; reason?: string };
}

beforeEach(() => {
    document.body.innerHTML = '';
    window.__pryzmInitComplete = true;
    window.commandManager = {
        execute: (cmd: unknown) => {
            const c = cmd as ExecutableCommand;
            const check = c.canExecute?.({});
            if (check && !check.ok) return { success: false, error: check.reason };
            return c.execute({});
        },
    } as unknown as typeof window.commandManager;

    viewDefinitionStore.create({
        id: VIEW_ID,
        name: 'Ground Floor',
        viewType: 'plan',
    });
});

afterEach(() => {
    try { panel?.close(); } catch { /* already closed */ }
    panel = null;
    document.body.innerHTML = '';
});

/** happy-dom does not lay out, so the paper's screen box must be declared. */
function stubCanvasRect(el: Element, left = 0, top = 0, w = PAPER_W, h = PAPER_H): void {
    Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            left, top, width: w, height: h,
            right: left + w, bottom: top + h,
            x: left, y: top, toJSON: () => ({}),
        }),
    });
}

// ── Position persistence ───────────────────────────────────────────────────

describe('§SHEET-MOVE-DISPATCH-IS-DEAD (L-1633) — a dragged viewport stays where it is dropped', () => {

    it('drag → mouse-up writes the new position to the sheet store', () => {
        seedSheet([
            { id: VP_ID, viewId: VIEW_ID, position: { x: 60, y: 200 }, scale: 100 } as never,
        ]);

        panel = new SheetEditorPanel();
        panel.open(SHEET_ID);

        const vpEl = document.querySelector('.sh-viewport') as HTMLElement;
        expect(vpEl, 'no viewport rendered').toBeTruthy();

        vpEl.dispatchEvent(new MouseEvent('mousedown', {
            button: 0, clientX: 300, clientY: 300, bubbles: true, cancelable: true,
        }));
        document.dispatchEvent(new MouseEvent('mousemove', {
            clientX: 400, clientY: 250, bubbles: true,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', {
            clientX: 400, clientY: 250, bubbles: true,
        }));

        const after = sheetStore.get(SHEET_ID)!.viewports[0]!;
        expect(
            after.position,
            'the drag never reached the store — the viewport will snap back on the ' +
            'next canvas rebuild, which is exactly "it doesn\'t stay in place"',
        ).not.toEqual({ x: 60, y: 200 });

        // Right direction, not merely "changed": dragging right must increase X,
        // dragging up (smaller clientY) must increase Y, because sheet Y is
        // measured from the paper's bottom edge.
        expect(after.position.x).toBeGreaterThan(60);
        expect(after.position.y).toBeGreaterThan(200);
    });

    it('arrow-key nudge writes to the sheet store too', () => {
        seedSheet([
            { id: VP_ID, viewId: VIEW_ID, position: { x: 60, y: 200 }, scale: 100 } as never,
        ]);

        panel = new SheetEditorPanel();
        panel.open(SHEET_ID);

        (document.querySelector('.sh-viewport') as HTMLElement)
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const canvas = document.querySelector('.sh-canvas') as HTMLElement;
        canvas.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowRight', bubbles: true, cancelable: true,
        }));

        const after = sheetStore.get(SHEET_ID)!.viewports[0]!;
        expect(after.position.x, 'arrow-key nudge dispatched nothing').toBe(61);
    });
});

// ── Drag-and-drop placement ────────────────────────────────────────────────

describe('§SHEET-DROP-WHERE-THE-CURSOR-IS (L-1632) — Mural-style placement', () => {

    it('the Available Views entry is draggable and carries the view id', () => {
        seedSheet([]);
        panel = new SheetEditorPanel();
        panel.open(SHEET_ID);

        const entry = Array.from(document.querySelectorAll('.sh-view-entry'))
            .find(el => el.textContent?.includes('Ground Floor')) as HTMLElement | undefined;

        expect(entry, 'the view is not listed in Available Views').toBeTruthy();
        expect(
            entry!.getAttribute('draggable'),
            'the view entry is not draggable — there is nothing to drag onto the sheet',
        ).toBe('true');
    });

    it('dropping on the paper places the view AT THE CURSOR, not on a fixed cascade', () => {
        seedSheet([]);
        panel = new SheetEditorPanel();
        panel.open(SHEET_ID);

        const canvas = document.querySelector('.sh-canvas') as HTMLElement;
        expect(canvas, 'no sheet canvas').toBeTruthy();
        stubCanvasRect(canvas);

        // Drop at three-quarters across, one-quarter down the paper.
        const dropX = PAPER_W * 0.75;
        const dropY = PAPER_H * 0.25;

        const data = new Map<string, string>([[VIEW_DRAG_MIME, VIEW_ID]]);
        const drop = new Event('drop', { bubbles: true, cancelable: true }) as Event & {
            clientX: number; clientY: number; dataTransfer: unknown;
        };
        Object.assign(drop, {
            clientX: dropX,
            clientY: dropY,
            dataTransfer: {
                types: [VIEW_DRAG_MIME],
                getData: (t: string) => data.get(t) ?? '',
                dropEffect: 'copy',
            },
        });
        canvas.dispatchEvent(drop);

        const vps = sheetStore.get(SHEET_ID)!.viewports;
        expect(vps.length, 'the drop placed nothing on the sheet').toBe(1);

        const pos = vps[0]!.position;

        // The auto-placement cascade for an empty sheet is exactly (50, 100).
        // Landing there would mean the drop coordinates were discarded and the
        // old "placed automatically somewhere" path ran.
        expect(
            pos,
            'the view landed on the auto-placement cascade — the cursor position was ignored',
        ).not.toEqual({ x: 50, y: 100 });

        // Paper mm under the cursor: X measured from the left edge, Y from the
        // BOTTOM edge (the sheet's own convention, hence the flip).
        expect(pos.x).toBeGreaterThan(PAPER_W * 0.5);
        expect(pos.y).toBeGreaterThan(PAPER_H * 0.5);
    });

    it('a drop carrying no view id is ignored rather than placing something arbitrary', () => {
        seedSheet([]);
        panel = new SheetEditorPanel();
        panel.open(SHEET_ID);

        const canvas = document.querySelector('.sh-canvas') as HTMLElement;
        stubCanvasRect(canvas);

        const drop = new Event('drop', { bubbles: true, cancelable: true });
        Object.assign(drop, {
            clientX: 100, clientY: 100,
            dataTransfer: { types: ['text/plain'], getData: () => '' },
        });
        canvas.dispatchEvent(drop);

        expect(sheetStore.get(SHEET_ID)!.viewports.length).toBe(0);
    });
});
