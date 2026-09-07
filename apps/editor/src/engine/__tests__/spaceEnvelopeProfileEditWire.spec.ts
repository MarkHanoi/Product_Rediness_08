// THE WIRE — the four static links that make the footprint editor REACHABLE from a gesture.
// §RESI-STAGE-G (2026-09-06) · C114 §10b / §11 item 7 / §14 · [[committed-is-not-reachable]].
//
// ⭐ WHY A SOURCE-ASSERTION TEST, AND WHY IT IS NOT AN APOLOGY FOR ONE.
// `WPE1WallProfileEditMode.test.ts` established the precedent for this family of feature and
// states the reason in its own words: *"a missing static link still breaks the chain, and a
// chain is only as good as the link nobody tested."* `initTools` cannot be imported in a unit
// test — it constructs a renderer, a camera and thirty tools — so the alternative to reading
// its source is not a better test, it is NO test, and the failure mode that leaves open is
// precisely the one this lane exists to close: a tool that is authored, committed, green in
// its own spec, and wired to nothing.
//
// ✅ ESTABLISHES: the resolver lists `spaceEnvelope`; `initTools` assigns the handle that
//    resolver reads, passes the DIALOG FACTORY, dispatches through the BUS, and passes the
//    double-click seam; the controller installs a `dblclick` listener and removes it again.
// ⛔ DOES NOT ESTABLISH: that any of it works on screen. Source is not behaviour. Nothing in
//    this lane is browser-verified (C114 §14d).

import { describe, expect, it } from 'vitest';
import { resolveProfileEditTool } from '../../ui/elementTypeKey';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const EDITOR_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(EDITOR_SRC, rel), 'utf8');

describe('(1) the BUTTON is offered — the resolver lists the family', () => {
    const table = read('ui/elementTypeKey.ts');

    it('maps the `spaceEnvelope` element type to window.spaceEnvelopeTool', () => {
        // The dispatch table's own row. Visibility and the click handler both read THIS,
        // which is what stops an offered affordance and an implemented action drifting apart.
        //
        // ⚠ REPOINTED 2026-09-07 (§FIX-ELEMENT-TYPE-KEY-CASING · L-13045). The table moved
        // out of `ContextualEditBar.ts` into the dependency-free `ui/elementTypeKey.ts`
        // *because of what this assertion could not see*: it went GREEN on a row that was
        // DEAD. The bar lowercases the element type before the lookup, the key is camelCase,
        // and `candidates['spaceenvelope']` was `undefined` on every selection — so the
        // button this file certifies as "offered" was HIDDEN. Source proved the ROW; nothing
        // proved the READ. The behavioural arm below is now the primary assertion and this
        // regex is demoted to a spelling check on the handle name.
        expect(table).toMatch(/spaceEnvelope:\s*w\.spaceEnvelopeTool/);
        expect(table).toMatch(/spaceEnvelopeTool\?:\s*ProfileEditCapableTool/);
    });

    it('⭐ RESOLVES the type the PRODUCER stamps, after the bar lowercases it', () => {
        // The end-to-end casing contract, DERIVED rather than hard-coded: take the literal
        // `SpaceEnvelopeMeshBuilder` actually stamps on `userData.elementType`, put it
        // through the same `.toLowerCase()` the `bim-selection-changed` handler applies, and
        // require the resolver to still find the tool. This is the assertion whose absence
        // let the dead row ship — and it fails at the parent commit.
        const builder = read('engine/SpaceEnvelopeMeshBuilder.ts');
        const stamped = /group\.userData\['elementType'\] = '([^']+)'/.exec(builder)?.[1];
        expect(stamped).toBeTruthy();

        const spaceEnvelopeTool = { enterProfileEditMode: () => undefined };
        expect(resolveProfileEditTool(stamped!.toLowerCase(), { spaceEnvelopeTool }))
            .toBe(spaceEnvelopeTool);
    });
});

describe('(2) the HANDLE the resolver reads is assigned, with a real dialog behind it', () => {
    const init = read('engine/initTools.ts');

    it('initTools constructs the tool and registers it under that exact name', () => {
        expect(init).toMatch(/new SpaceEnvelopeProfileEditTool\(/);
        expect(init).toMatch(/window\.spaceEnvelopeTool\s*=\s*spaceEnvelopeProfileEditTool/);
    });

    it('⛔ passes the DIALOG FACTORY — without it the button opens nothing', () => {
        // The exact defect `WallProfileEditor.ts`'s header names: a port whose implementation
        // nobody supplies is a dead feature with an interface attached.
        expect(init).toMatch(/createProfileEditor:\s*\(\)\s*=>\s*new WallProfileEditor\(\)/);
    });

    it('⛔ writes through the BUS, not a store (P6), on the setFootprint verb', () => {
        expect(init).toMatch(/dispatchSetFootprint:/);
        expect(init).toMatch(/executeCommand\('spaceEnvelope\.setFootprint'/);
    });

    it('reads the record LAZILY off the composed store, never a captured snapshot', () => {
        expect(init).toMatch(/getRecord:\s*\(id: string\)\s*=>\s*\n?\s*spaceEnvelopeStore\.getState\(\)\.get\(id\)/);
    });

    it('passes the double-click seam into the render attachment', () => {
        expect(init).toMatch(/onProfileEdit:\s*\(spaceEnvelopeId: string\)\s*=>/);
        expect(init).toMatch(/spaceEnvelopeProfileEditTool\.enterProfileEditMode\(spaceEnvelopeId\)/);
    });
});

describe('(3) the GESTURE exists — and is cleaned up', () => {
    // ⚠ REPOINTED 2026-09-07 (§ENVELOPE-DRAG-PORTS · L-13045). The gesture moved out of
    // `spaceEnvelopeFaceDragController.ts` — which is now the THREE WIRING and nothing else
    // — into the renderer-free `spaceEnvelopeDragSurface.ts`, with the six THREE-touching
    // lines in `spaceEnvelopeDragSurfaceThree.ts`. The three claims below are unchanged;
    // only the file that has to satisfy each one moved.
    const core = read('engine/spaceEnvelopeDragSurface.ts');
    const threeAdapter = read('engine/spaceEnvelopeDragSurfaceThree.ts');
    const attach = read('engine/attachSpaceEnvelopeRender.ts');

    it('the gesture installs a dblclick listener and REMOVES it in the disposer', () => {
        expect(core).toMatch(/addEventListener\('dblclick', onDoubleClick\)/);
        // ⛔ A listener that outlives the scene gives the next runtime two of them — the same
        // reason the disposer already exists for the four pointer listeners.
        expect(core).toMatch(/removeEventListener\('dblclick', onDoubleClick\)/);
    });

    it('the double-click resolves through the SAME pick the drag uses', () => {
        // Two picks would be two answers to "which envelope is under the pointer?".
        const dblBody = core.slice(core.indexOf('const onDoubleClick'));
        expect(dblBody).toMatch(/surface\.pickFace\(ev\)/);
        // ⭐ AND THERE IS EXACTLY ONE PICK IMPLEMENTATION ON THE THREE SURFACE. This is the
        // assertion the port extraction makes possible and the old one could not express:
        // the core cannot raycast at all, so hover, drag-start and double-click physically
        // cannot resolve through different rays (C84 EI-9).
        expect(core).not.toMatch(/Raycaster|setFromCamera/);
        expect((threeAdapter.match(/new THREE\.Raycaster\(\)/g) ?? [])).toHaveLength(1);
    });

    it('⛔ the RENDERER-FREE half stays renderer-free — no THREE value import', () => {
        // P2 and the whole point of the split: a Cesium or MapLibre adapter must be able to
        // import the gesture without dragging a renderer in behind it. `import type` is
        // erased and is allowed; a value import is not.
        expect(core).not.toMatch(/^import \* as THREE/m);
        expect(core).not.toMatch(/^import \{[^}]*\} from '@pryzm\/renderer-three/m);
    });

    it('attachSpaceEnvelopeRender threads onProfileEdit through to the controller', () => {
        expect(attach).toMatch(/readonly onProfileEdit\?:/);
        expect(attach).toMatch(/deps\.onProfileEdit \? \{ onProfileEdit: deps\.onProfileEdit \}/);
    });
});
