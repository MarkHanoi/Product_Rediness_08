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
 *   (2b) §WPE-CHROME-LAYER (L-10200) — the OVERLAY FACTORY is actually supplied by
 *       `initTools.ts`. NEW LINK, minted with the move described below. It is the same class
 *       of link as (2) and it exists for the same reason;
 *   (5) the commit is a COMMAND and the gate is not re-stated.
 *
 * These are read from source rather than executed because the files that carry them are an
 * app-layer UI file and a composition root, neither constructible in this package's test
 * environment. That is stated rather than hidden: they are STATIC links in the chain, and a
 * static link that is missing still breaks the chain — which is the whole value of asserting
 * them at all.
 *
 * ─── ⭐ WHERE LINKS (3) AND (4) WENT — §WPE-CHROME-LAYER (L-10200, 2026-08-24) ───────
 *
 * They MOVED, with the thing they test; nothing was dropped. `WallProfileEditor` used to
 * build its dialog HERE, in an L2 geometry package. The founder asked for that dialog to be
 * draggable and resizable, and the app's two shared helpers for exactly that
 * (`apps/editor/src/ui/makeDraggable.ts`, `.../makeResizable.ts`) are **L7** — which L2 may
 * not import. So the DOM moved UP to `apps/editor/src/ui/WallProfileEditor.ts`, and every
 * overlay behaviour this file used to assert — activate / seed / Apply / Clear / Cancel /
 * insert / delete / one-commit-per-gesture / degenerate-refusal — is asserted there, in
 * `apps/editor/__tests__/wallProfileEditorChrome.test.ts`, ALONGSIDE the new chrome and the
 * proof that a resize does not move a single vertex.
 *
 * What stayed here is what stayed at L2: the model-side authoring conventions, and the
 * assertion that this package no longer builds a dialog at all.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    WALL_PROFILE_SNAP_M,
    wallProfileEditorRectangle,
    wallProfileEditorSnap,
} from '../src/WallProfileEditor';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

/**
 * §COMMENT-BLIND — strip comments before asserting that code does NOT contain something.
 *
 * ⚠ THIS IS NOT TIDINESS. The first run of the "L2 builds no DOM" assertion below FAILED, on
 * the file's own header, which EXPLAINS that the `document.createElement` calls moved to L7.
 * Prose about an import is not an import — the same defect `tools/ga-gate/check-layer-boundaries.ts`
 * records under §COMMENT-BLIND (40 `@pryzm/*` specifiers repo-wide live in comments), and the
 * same shape as the P4 strict arm, where 16 of 20 "casts" were comments asserting compliance.
 * An absence assertion that reads comments punishes documentation and can be satisfied by
 * deleting a sentence.
 */
const code = (rel: string) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

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

describe('§WPE-CHROME-LAYER (2b) — the OVERLAY FACTORY is wired, so the port is not a dead seam', () => {
    /**
     * ⚠ THE HAZARD THIS EXISTS FOR. Moving the overlay to L7 bought clean layering at the
     * price of ONE WIRE that can be forgotten — and a forgotten wire is indistinguishable
     * from a shipped feature until a user clicks. Two things close that, and this is the
     * cheap one: assert, from source, that the composition root really passes the factory.
     * The other is `WallTool.enterProfileEditMode` refusing OUT LOUD when it is absent.
     */
    const initTools = () => read('apps/editor/src/engine/initTools.ts');

    it('initTools imports the L7 overlay', () => {
        expect(initTools()).toMatch(/import\s*\{\s*WallProfileEditor\s*\}\s*from\s*'@app\/ui\/WallProfileEditor'/);
    });

    it('initTools passes createProfileEditor into WallToolCallbacks', () => {
        expect(initTools()).toMatch(/createProfileEditor:\s*\(\)\s*=>\s*new WallProfileEditor\(\)/);
    });

    it('WallTool REFUSES OUT LOUD when the factory is absent — it does not fail silently', () => {
        const s = read('packages/geometry-wall/src/WallTool.ts');
        expect(s).toMatch(/this\.callbacks\.createProfileEditor\?\.\(\)/);
        // A bare `return` with no user-visible sentence is the dead-button defect.
        expect(s).toMatch(/createProfileEditor[\s\S]{0,900}?showStatus\(/);
    });
});

describe('§WPE-CHROME-LAYER — L2 keeps the MODEL and no longer builds a dialog', () => {
    const src = () => code('packages/geometry-wall/src/WallProfileEditor.ts');

    it('the L2 file builds no DOM at all', () => {
        const s = src();
        expect(s).not.toMatch(/document\.createElement/);
        expect(s).not.toMatch(/createElementNS/);
        expect(s).not.toMatch(/addEventListener/);
    });

    it('it still owns no store, no bus and no THREE', () => {
        const s = src();
        expect(s).not.toMatch(/from '@pryzm\/renderer-three/);
        expect(s).not.toMatch(/WallStore|executeCommand|commandManager/);
    });

    it('WallTool holds the PORT, not a concrete overlay class', () => {
        const s = code('packages/geometry-wall/src/WallTool.ts');
        expect(s).toMatch(/import type \{ WallProfileEditorPort \} from '\.\/WallProfileEditor'/);
        expect(s).not.toMatch(/new WallProfileEditor\(\)/);
    });

    it('the 50 mm authoring grid has exactly ONE definition (C84 EI-9)', () => {
        // The hint line in the L7 panel derives its "(no 50 mm grid)" text from this constant
        // rather than hard-coding it, so the sentence and the snap cannot drift apart.
        expect(WALL_PROFILE_SNAP_M).toBe(0.05);
        expect(read('apps/editor/src/ui/WallProfileEditor.ts'))
            .toMatch(/WALL_PROFILE_SNAP_M \* 1000/);
    });
});

describe('§WPE-CHROME-LAYER — the model-side authoring conventions', () => {
    it('the implicit rectangle is the wall extent, counter-clockwise from the base origin', () => {
        expect(wallProfileEditorRectangle({ length: 10.106, height: 2.7 }))
            .toEqual([
                { u: 0,      v: 0   },
                { u: 10.106, v: 0   },
                { u: 10.106, v: 2.7 },
                { u: 0,      v: 2.7 },
            ]);
    });

    it('snapping is a 50 mm round when on, and the identity when off', () => {
        expect(wallProfileEditorSnap(1.234, true)).toBeCloseTo(1.25, 10);
        expect(wallProfileEditorSnap(1.234, false)).toBe(1.234);
    });
});

describe('§FEAT-WALL-PROFILE-EDIT (5) — the commit is a COMMAND, and the gate is not re-stated', () => {
    const tool = () => read('packages/geometry-wall/src/WallTool.ts');

    it('WallTool dispatches element.updateParameters / UpdateElementParameterCommand', () => {
        const s = tool();
        expect(s).toMatch(/executeCommand\('element\.updateParameters'/);
        expect(s).toMatch(/new UpdateElementParameterCommand\(/);
    });

    it('WallTool never writes the store directly from the profile path (P6)', () => {
        expect(code('packages/geometry-wall/src/WallTool.ts')).not.toMatch(/wallStore\.update\(/);
    });

    it('the refusal comes from profileAuthorability, not from a second predicate here', () => {
        const s = tool();
        expect(s).toMatch(/profileAuthorability\(/);
        // no hand-rolled "is this wall curved/layered/hosting" test beside the gate
        expect(s).not.toMatch(/§FEAT-WALL-PROFILE-EDIT[\s\S]{0,4000}?openings\.length\s*>\s*0/);
    });

    it('the L7 overlay owns no store and no bus either — onCommit is its only route out', () => {
        const s = code('apps/editor/src/ui/WallProfileEditor.ts');
        expect(s).not.toMatch(/from '@pryzm\/renderer-three/);
        expect(s).not.toMatch(/WallStore|executeCommand|commandManager/);
    });
});
