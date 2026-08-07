/**
 * §FIX-WALL-LAYER-EDIT-DETACHED-STORE (founder 2026-08-06) — the wall LAYERS editor must
 * write the store the viewport reads.
 *
 * THE DEFECT: "Save Layers" dispatched `wall.setLayers`, whose handler
 * (`plugins/wall/src/handlers/SetWallLayers.ts:118-124`) writes the PLUGIN Immer wall store.
 * That store is detached from the legacy `wallStore` that `WallFragmentBuilder`, the plan
 * projection and IFC export read — only `wall.created` is mirrored across, never updates. The
 * edit was therefore written faithfully to a store nothing renders from: the panel updated,
 * the geometry did not, and nothing errored. One bug, not two — the missing rebuild is a
 * consequence of writing the wrong store, not a separate omission.
 *
 * These are STATIC guards, deliberately. The defect was a wrong dispatch STRING, invisible to
 * type-checking and to any test that mocks the bus; the repo already relies on static checks
 * for exactly this class (`check:isolation`, `check:commandmanager`). A behavioural test that
 * stubs `executeCommand` would have passed against the broken code.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(HERE, rel), 'utf8');

const BODY_RENDERER = 'src/ui/property-panel/PropertyPanelBodyRenderer.ts';
const TYPE_WIDGET   = 'src/ui/property-panel/WallTypeSelectorWidget.ts';

/** The wall layers editor block — from its marker to the slab block that follows it. */
function wallLayersBlock(src: string): string {
    const start = src.indexOf("if (section === 'definition' && elType === 'wall')");
    const end   = src.indexOf("if (section === 'definition' && elType === 'slab')");
    expect(start, 'wall definition block found').toBeGreaterThan(-1);
    expect(end, 'slab definition block found (block terminator)').toBeGreaterThan(start);
    return src.slice(start, end);
}

describe('§FIX-WALL-LAYER-EDIT-DETACHED-STORE — the layers editor routes to the legacy store', () => {

    it('the wall LAYERS editor dispatches element.changeType, not the detached wall.setLayers', () => {
        const block = wallLayersBlock(read(`../${BODY_RENDERER}`));
        expect(block, 'routes through the legacy-store command surface')
            .toContain("executeCommand('element.changeType'");
        // Match the CALL, not the word: the block's comment names the old dispatch on purpose,
        // to explain why it is gone. A bare substring check would fail on the explanation.
        expect(block, 'must NOT dispatch wall.setLayers — that store is detached')
            .not.toContain("executeCommand('wall.setLayers'");
    });

    it('it passes the edited layers AND the derived thickness through', () => {
        // §03-WALL-THICKNESS-CONTRACT §1: thickness is DERIVED from the stack. Sending layers
        // without the recomputed total leaves the wall body at its old thickness.
        const block = wallLayersBlock(read(`../${BODY_RENDERER}`));
        expect(block).toContain('elementType: \'wall\'');
        expect(block).toMatch(/\blayers\b/);
        expect(block).toMatch(/\bthickness\b/);
    });

    it('the wall and slab layer editors use the SAME route (the comment finally tells the truth)', () => {
        // The slab branch has claimed since it landed that it "mirrors the wall layers editor's
        // legacy route". It did not. If these two ever diverge again, the claim is false again.
        const src = read(`../${BODY_RENDERER}`);
        const wall = wallLayersBlock(src);
        const slabStart = src.indexOf("if (section === 'definition' && elType === 'slab')");
        const slab = src.slice(slabStart, slabStart + 2500);
        expect(wall).toContain("'element.changeType'");
        expect(slab).toContain("'element.changeType'");
    });

    it('element.changeType has a wall branch that forwards layers to the legacy command', () => {
        const bus = read('../src/engine/initBusHandlers.ts');
        const at = bus.indexOf("type: 'element.changeType'");
        expect(at, 'handler registered').toBeGreaterThan(-1);
        const body = bus.slice(at, at + 3000);
        expect(body).toContain('UpdateWallSystemTypeCommand');
        expect(body).toMatch(/layers:\s*\(cmd\.layers/);
    });
});

describe('§FIX-WALL-TYPE-APPLY-CLOBBERS-LAYER-EDITS — Apply never silently resets instance edits', () => {

    it('re-applying the SAME type short-circuits before onApply', () => {
        // `buildPayload` always re-resolves layers from the catalogue, so applying the type the
        // wall already has would silently overwrite the LAYERS table edits directly below it.
        const src = read(`../${TYPE_WIDGET}`);
        const at = src.indexOf("applyBtn.addEventListener('click'");
        expect(at).toBeGreaterThan(-1);
        const handler = src.slice(at, at + 2200);
        const guardAt  = handler.indexOf('currentTypeId');
        const applyAt  = handler.indexOf('onApply(buildPayload(selectedId))');
        expect(guardAt, 'same-type guard present').toBeGreaterThan(-1);
        expect(applyAt, 'apply call present').toBeGreaterThan(-1);
        expect(guardAt, 'the guard must run BEFORE onApply, or it guards nothing')
            .toBeLessThan(applyAt);
        expect(handler, 'the guard returns rather than falling through').toMatch(/return;\s*\}/);
    });

    it('the user is TOLD it was a no-op — ADR-0299 forbids silent outcomes either way', () => {
        const src = read(`../${TYPE_WIDGET}`);
        const at = src.indexOf("applyBtn.addEventListener('click'");
        const handler = src.slice(at, at + 2200);
        expect(handler).toContain('No change');
    });

    it('choosing a DIFFERENT type still re-stamps layers — a type swap is meant to', () => {
        // The guard must be keyed on equality only. If it ever widened to skip Apply generally,
        // the type selector would stop working.
        const src = read(`../${TYPE_WIDGET}`);
        const at = src.indexOf("applyBtn.addEventListener('click'");
        const handler = src.slice(at, at + 2200);
        expect(handler).toMatch(/selectedId\s*===\s*currentTypeId/);
    });
});
