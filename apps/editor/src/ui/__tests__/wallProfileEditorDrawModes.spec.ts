// §PL-ENVELOPE-AUTHORING — the SHARED profile panel offers DRAWING modes to the subjects that ask.
//
// ⭐ THE DEFECT THIS CLOSES, MEASURED BEFORE IT WAS WRITTEN. `ElevationOutlineSurface` has had
// click-to-place polylines, 3-click arcs and ABSOLUTE ortho since §OUTLINE81 — its own header says
// so at `:18-24` — and it ends that paragraph with *"The wall profile modal simply never leaves
// `select` mode."* `WindowOutlineEditorDialog` builds the three controls (`:100-101`, `:131`);
// `WallProfileEditor.ts` built none. So when C114 §14 joined the SPACE ENVELOPE's footprint to the
// wall modal, the founder's *"CURVED LINES, STRAIGHT LINES, OR ORTHOGONALS"* was present in the
// surface and unreachable through the only dialog that could open it —
// [[committed-is-not-reachable]] at the level of one mode flag.
//
// ⛔ THE WALL PATH MUST NOT MOVE ONE BYTE. `wallProfileEditorChrome.test.ts` pins this panel's
// exact box (`:386-387`) and its exact title (`:285`), and it reads 30/30 with this change in
// place. The first case below is the one that keeps it that way: a subject with no `drawModes`
// gets NO bar and the wall hint verbatim.

import { describe, it, expect, beforeEach } from 'vitest';
import { WallProfileEditor } from '../WallProfileEditor';
import type { WallProfileEditorSubject } from '@pryzm/geometry-wall/profile-editor';

const WALL: WallProfileEditorSubject = {
    wallId: 'w1',
    length: 10.106,
    height: 2.7,
    ring: null,
};

const ENVELOPE: WallProfileEditorSubject = {
    wallId: 'spaceEnvelope_L',
    length: 20,
    height: 12,
    ring: null,
    title: 'Edit Level Footprint - Ground - 20.000 m across X, 12.000 m deep in Z',
    drawModes: true,
};

const noop = { onCommit: () => { }, onCancel: () => { } };

const modeButtons = (): HTMLButtonElement[] =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('#wall-profile-editor [data-wpe-mode]'));

beforeEach(() => { document.body.innerHTML = ''; });

describe('WallProfileEditor — the mode bar is OPT-IN', () => {
    it('⛔ builds NO mode bar, and keeps the wall hint verbatim, for a subject that did not ask', () => {
        const ed = new WallProfileEditor();
        ed.activate(WALL, noop);
        expect(document.querySelector('.wpe-mode-bar')).toBeNull();
        expect(modeButtons()).toHaveLength(0);
        expect(document.querySelector('.wpe-hint')!.textContent).toBe(
            'Drag a vertex to reshape. Click a hollow midpoint to insert a vertex. '
            + 'Double-click a vertex to delete it. Shift = free (no 50 mm grid). '
            + 'Esc = cancel, Enter = apply.',
        );
        ed.deactivate();
    });

    it('builds Move points · Straight · Curved · Orthogonal for a subject that did', () => {
        const ed = new WallProfileEditor();
        ed.activate(ENVELOPE, noop);
        expect(document.querySelector('.wpe-mode-bar')).not.toBeNull();
        expect(modeButtons().map((b) => b.textContent)).toEqual(
            ['Move points', 'Straight', 'Curved'],
        );
        expect(document.querySelector<HTMLInputElement>('.wpe-ortho')).not.toBeNull();
        // The hint names the gestures the bar actually offers — a hint that described modes the
        // panel does not have would be the naming-vs-behaviour defect one layer out.
        const hint = document.querySelector('.wpe-hint')!.textContent ?? '';
        expect(hint).toContain('Straight places corners');
        expect(hint).toContain('three clicks');
        expect(hint).toContain('Orthogonal locks each segment to an axis');
        ed.deactivate();
    });

    it('⭐ the buttons drive the EXISTING surface — no rival drawing code was written', () => {
        const ed = new WallProfileEditor();
        ed.activate(ENVELOPE, noop);
        const [movePoints, straight, curved] = modeButtons();
        expect(ed.mode).toBe('select');
        straight!.click();
        expect(ed.mode).toBe('polyline');
        curved!.click();
        expect(ed.mode).toBe('arc');
        movePoints!.click();
        expect(ed.mode).toBe('select');
        ed.deactivate();
    });

    it('⛔ ORTHO IS ABSOLUTE, and the checkbox only carries the intent', () => {
        const ed = new WallProfileEditor();
        ed.activate(ENVELOPE, noop);
        const box = document.querySelector<HTMLInputElement>('.wpe-ortho')!;
        expect(ed.orthoOn).toBe(false);
        box.checked = true;
        box.dispatchEvent(new Event('change'));
        expect(ed.orthoOn).toBe(true);
        ed.deactivate();
    });
});

describe('WallProfileEditor — mid-gesture, the keys are about the DRAFT', () => {
    it('Esc while drawing abandons the draft and returns to select — it does NOT cancel the dialog', () => {
        let cancelled = 0;
        const ed = new WallProfileEditor();
        ed.activate(ENVELOPE, { onCommit: () => { }, onCancel: () => { cancelled++; } });
        modeButtons()[1]!.click();                       // Straight
        expect(ed.mode).toBe('polyline');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(ed.mode).toBe('select');
        expect(cancelled).toBe(0);                       // ⛔ the whole edit was not thrown away
        // Out of the gesture, Esc means what it always meant.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(cancelled).toBe(1);
        ed.deactivate();
    });

    it('Apply while drawing closes the DRAFT rather than committing an open path', () => {
        let commits = 0;
        const ed = new WallProfileEditor();
        ed.activate(ENVELOPE, { onCommit: () => { commits++; }, onCancel: () => { } });
        modeButtons()[1]!.click();                       // Straight
        const apply = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-wpe-action]'))
            .find((b) => b.textContent === 'Apply')!;
        apply.click();
        // Nothing has been placed, so the draft cannot close — and the ring is NOT committed.
        expect(commits).toBe(0);
        expect(ed.statusText).toContain('placed points before it can close');
        ed.deactivate();
    });

    it('⛔ a WALL subject keeps the original key behaviour exactly — Esc cancels, Enter applies', () => {
        let cancelled = 0;
        let commits = 0;
        const ed = new WallProfileEditor();
        ed.activate(WALL, { onCommit: () => { commits++; }, onCancel: () => { cancelled++; } });
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(commits).toBe(1);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(cancelled).toBe(1);
        ed.deactivate();
    });
});
