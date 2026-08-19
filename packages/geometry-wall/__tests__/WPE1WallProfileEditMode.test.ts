/**
 * §FEAT-WALL-PROFILE-EDIT — REACHABILITY, not "the function returns the right thing".
 *
 * [[committed-is-not-reachable]] is the standing lesson this file is written against: four
 * fixes in one session ran nowhere because each was proved at a pure function and none at
 * the layer the user touches. So this suite walks the chain the USER walks and asserts each
 * link, in order:
 *
 *   (1) the BUTTON is offered for `wall` — the resolver in `ContextualEditBar` lists it,
 *       and the click handler passes the RESOLVED element id (an instanced wall's
 *       `userData.id` is a synthetic group handle, not a store row);
 *   (2) the WINDOW HANDLE the resolver reads (`window.wallTool`) is actually assigned by
 *       `initTools.ts` — without this the map entry is decoration;
 *   (3) the METHOD exists on the tool and OPENS a real overlay in the document;
 *   (4) the OVERLAY commits a ring, clears a profile, and cancels — through the callbacks
 *       the tool supplies, which is the seam the command dispatch hangs on.
 *
 * (1) and (2) are read from source rather than executed because the two files that carry
 * them are an app-layer UI file and a composition root, neither constructible in this
 * package's test environment. That is stated rather than hidden: they are STATIC links in
 * the chain, and a static link that is missing still breaks the chain — which is the whole
 * value of asserting them at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WallProfileEditor } from '../src/WallProfileEditor';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

describe('§FEAT-WALL-PROFILE-EDIT (1) — the button is OFFERED for a wall', () => {
    const bar = () => read('apps/editor/src/ui/ContextualEditBar.ts');

    it('the resolver maps wall to window.wallTool', () => {
        expect(bar()).toMatch(/wall:\s*w\.wallTool,/);
    });

    it('the click passes the RESOLVED element id, not the instanced group handle', () => {
        // An instanced wall's Object3D is the shared InstancedMesh whose `userData.id` is
        // `instanced-group-<key>`. Handing that to the tool opens nothing — the store has no
        // such row — which is the dead button in different clothes.
        expect(bar()).toMatch(/_selectedElementId\s*\?\?\s*this\._selectedObj\?\.userData\?\.id/);
    });
});

describe('§FEAT-WALL-PROFILE-EDIT (2) — the handle the resolver reads is assigned', () => {
    it('initTools assigns window.wallTool', () => {
        expect(read('apps/editor/src/engine/initTools.ts')).toMatch(/window\.wallTool\s*=\s*wallTool/);
    });
});

describe('§FEAT-WALL-PROFILE-EDIT (3+4) — the overlay opens, edits and commits', () => {
    let editor: WallProfileEditor;

    beforeEach(() => {
        document.body.replaceChildren();
        editor = new WallProfileEditor();
    });

    const subject = { wallId: 'w1', length: 4, height: 3, ring: null };

    it('activate puts a real overlay in the document, seeded with the wall rectangle', () => {
        editor.activate(subject, { onCommit: () => {}, onCancel: () => {} });
        const root = document.getElementById('wall-profile-editor');
        expect(root).not.toBeNull();
        expect(root!.getAttribute('data-wall-id')).toBe('w1');
        // The absent profile IS the rectangle — WallProfile.ts's round-trip guarantee, and
        // therefore the only honest starting outline.
        expect(editor.ring.map((p) => [p.u, p.v])).toEqual([[0, 0], [4, 0], [4, 3], [0, 3]]);
    });

    it('an existing ring is loaded rather than replaced by the rectangle', () => {
        editor.activate(
            { ...subject, ring: [{ u: 0, v: 0 }, { u: 4, v: 0 }, { u: 2, v: 3 }] },
            { onCommit: () => {}, onCancel: () => {} },
        );
        expect(editor.ring).toHaveLength(3);
    });

    it('Apply hands the tool the working ring', () => {
        const onCommit = vi.fn();
        editor.activate(subject, { onCommit, onCancel: () => {} });
        clickButton('Apply');
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit.mock.calls[0]![0]).toEqual([
            { u: 0, v: 0 }, { u: 4, v: 0 }, { u: 4, v: 3 }, { u: 0, v: 3 },
        ]);
    });

    it('Clear profile commits NULL — the field is removed, not set to a rectangle ring', () => {
        const onCommit = vi.fn();
        editor.activate(subject, { onCommit, onCancel: () => {} });
        clickButton('Clear profile');
        expect(onCommit).toHaveBeenCalledWith(null);
    });

    it('Cancel commits nothing', () => {
        const onCommit = vi.fn();
        const onCancel = vi.fn();
        editor.activate(subject, { onCommit, onCancel });
        clickButton('Cancel');
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('inserting a vertex on an edge adds it BETWEEN its endpoints, not at the end', () => {
        editor.activate(subject, { onCommit: () => {}, onCancel: () => {} });
        // The hollow midpoint handles are the first `_ring.length` circles in the handle
        // layer; edge 0 spans (0,0)-(4,0), so its midpoint is (2, 0).
        const mids = midHandles();
        mids[0]!.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
        expect(editor.ring.map((p) => [p.u, p.v])).toEqual([[0, 0], [2, 0], [4, 0], [4, 3], [0, 3]]);
    });

    it('deactivate removes the overlay and is safe to call twice', () => {
        editor.activate(subject, { onCommit: () => {}, onCancel: () => {} });
        editor.deactivate();
        editor.deactivate();
        expect(document.getElementById('wall-profile-editor')).toBeNull();
        expect(editor.isActive).toBe(false);
    });

    it('activating twice never leaves two overlays in the document', () => {
        editor.activate(subject, { onCommit: () => {}, onCancel: () => {} });
        editor.activate({ ...subject, wallId: 'w2' }, { onCommit: () => {}, onCancel: () => {} });
        expect(document.querySelectorAll('#wall-profile-editor')).toHaveLength(1);
    });

    it('a degenerate outline is REFUSED at Apply, not committed (C84 EI-2)', () => {
        const onCommit = vi.fn();
        // Three collinear points enclose no area — `profileAuthorability` would refuse it,
        // so the editor must not produce it.
        editor.activate(
            { ...subject, ring: [{ u: 0, v: 0 }, { u: 2, v: 0 }, { u: 4, v: 0 }] },
            { onCommit, onCancel: () => {} },
        );
        clickButton('Apply');
        expect(onCommit).not.toHaveBeenCalled();
    });
});

function clickButton(label: string): void {
    const btn = Array.from(document.querySelectorAll('#wall-profile-editor button'))
        .find((b) => b.textContent === label) as HTMLButtonElement | undefined;
    if (!btn) throw new Error(`no "${label}" button in the profile editor overlay`);
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function midHandles(): Element[] {
    const g = document.querySelector('#wall-profile-editor svg g')!;
    const circles = Array.from(g.children);
    // Midpoints are appended first, one per edge, then one vertex handle per vertex.
    return circles.slice(0, circles.length / 2);
}

describe('§FEAT-WALL-PROFILE-EDIT (5) — the commit is a COMMAND, and the gate is not re-stated', () => {
    const tool = () => read('packages/geometry-wall/src/WallTool.ts');

    it('WallTool dispatches element.updateParameters / UpdateElementParameterCommand', () => {
        const s = tool();
        expect(s).toMatch(/executeCommand\('element\.updateParameters'/);
        expect(s).toMatch(/new UpdateElementParameterCommand\(/);
    });

    it('WallTool never writes the store directly from the profile path (P6)', () => {
        expect(tool()).not.toMatch(/wallStore\.update\(/);
    });

    it('the refusal comes from profileAuthorability, not from a second predicate here', () => {
        const s = tool();
        expect(s).toMatch(/profileAuthorability\(/);
        // no hand-rolled "is this wall curved/layered/hosting" test beside the gate
        expect(s).not.toMatch(/§FEAT-WALL-PROFILE-EDIT[\s\S]{0,4000}?openings\.length\s*>\s*0/);
    });

    it('the editor itself owns no store, no bus and no THREE', () => {
        const s = read('packages/geometry-wall/src/WallProfileEditor.ts');
        expect(s).not.toMatch(/from '@pryzm\/renderer-three/);
        expect(s).not.toMatch(/WallStore|executeCommand|commandManager/);
    });
});
