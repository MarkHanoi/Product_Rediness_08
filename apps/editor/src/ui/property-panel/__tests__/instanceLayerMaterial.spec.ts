/**
 * @file apps/editor/src/ui/property-panel/__tests__/instanceLayerMaterial.spec.ts
 *
 * §MAT-INSTANCE-LAYER-IS-A-REFERENCE (L-10064 … L-10067) — lane LAYERMAT10, 2026-08-23.
 *
 * Founder, looking at a selected WALL: *"I wanted to have the material for each
 * layer — so the user can change not only the colour but the material also — why
 * is not in place?"* His LAYERS table read `NAME · FUNCTION · MM` with a
 * `Color Override` swatch above it and no material anywhere.
 *
 * ⭐ A DIFFERENT SURFACE FROM THE ONE THAT WAS FIXED. Lane MAT50 (L-8610) put this
 * control in `WallTypeEditorModal` — the element TYPE editor. These two editors are
 * the INSTANCE surface, which is what the property panel renders when you click a
 * wall or a slab, and nobody wired them. Measured before building:
 * `grep materialId apps/editor/src/ui/property-panel/*.ts` → 0 hits in either file.
 *
 * ⛔ THESE FAIL ON THE PRE-FIX TREE at arm 1 — there was no picker to find.
 *
 * ⚠ WHAT THIS SUITE IS CAREFUL ABOUT: the two families resolve a layer's colour by
 * OPPOSITE rules (slab: the material wins; wall: the layer colour wins, and the wall
 * builder never reads `materialId`). A single shared sentence would be false for one
 * of them, so the precedence assertions are per-family and deliberately not merged.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildWallLayersEditor } from '../WallLayersEditor';
import { buildSlabLayersEditor } from '../SlabLayersEditor';
import { LAYER_COLOUR_PRECEDENCE } from '../LayerMaterialCell';
// ⚠ C100 §1.3 — `materialHexById` is the DESIGNATED accessor and the contract's
// wording is a MUST: never hand-roll the lookup. This suite reaches for the master
// hex through it for the same reason the picker does, so a catalogue reshape moves
// the expectation and the implementation together.
import { STANDARD_MATERIAL_LIBRARY, materialHexById } from '@pryzm/core-app-model/material-library';

afterEach(() => { document.body.innerHTML = ''; });

const wallEl = (layers?: any[]) => ({
    id: 'wall_1', elementType: 'wall', type: 'wall',
    layers: layers ?? [
        { name: 'External Render', function: 'finish-exterior', thickness: 0.015, materialColor: '#c8bfa8' },
        { name: 'Structure',       function: 'structure',       thickness: 0.170, materialColor: '#a0a0a0' },
    ],
});

const slabEl = (layers?: any[]) => ({
    id: 'slab_1', elementType: 'slab', type: 'slab', thickness: 0.2,
    layers: layers ?? [
        { name: 'Screed',      function: 'screed',    thickness: 0.05, materialColor: '#c8bfa8' },
        { name: 'RC Concrete', function: 'structure', thickness: 0.15, materialColor: '#909090' },
    ],
});

/** Mount an editor and return the saved layers on demand. */
function mount(kind: 'wall' | 'slab', el: any) {
    let saved: any[] | null = null;
    const node = kind === 'wall'
        ? buildWallLayersEditor(el, (l) => { saved = l; })
        : buildSlabLayersEditor(el, (l) => { saved = l; });
    expect(node, `${kind} editor returned null`).toBeTruthy();
    document.body.appendChild(node!);
    return { node: node!, save: () => { clickSave(); return saved; } };
}

const pickers = (): HTMLSelectElement[] =>
    [...document.querySelectorAll('.fms-wrap select')] as HTMLSelectElement[];

const badges = (): HTMLButtonElement[] =>
    [...document.querySelectorAll('button.lmc-override')] as HTMLButtonElement[];

const colourInputs = (): HTMLInputElement[] =>
    [...document.querySelectorAll('input[type=color]')] as HTMLInputElement[];

function clickSave(): void {
    const btn = [...document.querySelectorAll('button')]
        .find(b => (b.textContent ?? '').includes('Save Layers')) as HTMLButtonElement;
    expect(btn, 'no Save Layers button').toBeTruthy();
    btn.click();
}

function pick(sel: HTMLSelectElement, materialId: string): void {
    sel.value = materialId;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
}

/** A real master row, so nothing here transcribes a hex (C100 §1.1). */
const MASTER = STANDARD_MATERIAL_LIBRARY[0];
const MASTER_HEX = String(materialHexById(MASTER.id)).toLowerCase();

// ── ARM 1 — the control exists at all, on BOTH instance editors ──────────────

describe('L-10064 — a LAYER can name a MATERIAL, on the instance editors', () => {

    it('FAILS PRE-FIX: the wall layers editor renders one master-backed picker per layer', () => {
        mount('wall', wallEl());
        expect(pickers().length, 'no per-layer material picker in the WALL layers editor').toBe(2);
    });

    it('FAILS PRE-FIX: the slab layers editor renders one master-backed picker per layer', () => {
        mount('slab', slabEl());
        expect(pickers().length, 'no per-layer material picker in the SLAB layers editor').toBe(2);
    });

    it('a layer added with "+ Add Layer" gets a picker too', () => {
        mount('wall', wallEl());
        const add = [...document.querySelectorAll('button')]
            .find(b => (b.textContent ?? '').includes('Add Layer')) as HTMLButtonElement;
        add.click();
        expect(pickers().length).toBe(3);
    });

    /**
     * C100 §1.1 / §6.1 MUST — the options ARE the master, never a hand-written list.
     * Apply §3's review test: rename a material in the catalogue and this passes
     * unchanged, because nothing here enumerates one.
     */
    it('every option is a master id (0 foreign ids)', () => {
        mount('slab', slabEl());
        const masterIds = new Set(STANDARD_MATERIAL_LIBRARY.map(m => m.id));
        const foreign = [...pickers()[0].querySelectorAll('optgroup option')]
            .map(o => (o as HTMLOptionElement).value)
            .filter(v => v !== '' && !masterIds.has(v));
        expect(foreign, 'the picker invented material ids').toEqual([]);
    });
});

// ── ARM 2 — the reference and the hex move together (C100 §10.12.b) ──────────

describe('L-10065 — the reference and the hex move together', () => {

    for (const kind of ['wall', 'slab'] as const) {
        it(`${kind}: picking a material writes BOTH materialId and the master's hex`, () => {
            const h = mount(kind, kind === 'wall' ? wallEl() : slabEl());
            pick(pickers()[0], MASTER.id);
            const saved = h.save()!;
            expect(saved[0].materialId, 'the reference was not written').toBe(MASTER.id);
            expect(
                String(saved[0].materialColor).toLowerCase(),
                'the hex did not follow the id — every §2.1 resolver would read this ' +
                'freshly-picked layer as a deliberate user OVERRIDE',
            ).toBe(MASTER_HEX);
        });

        it(`${kind}: the visible colour swatch is repainted in the same gesture`, () => {
            mount(kind, kind === 'wall' ? wallEl() : slabEl());
            const before = colourInputs()[0].value;
            pick(pickers()[0], MASTER.id);
            expect(colourInputs()[0].value.toLowerCase()).toBe(MASTER_HEX);
            expect(colourInputs()[0].value).not.toBe(before);
        });

        /**
         * A narrowing copy would delete every material on every unrelated edit and
         * would look like a tidy-up in review. MAT50 pinned this for the type
         * editor; the instance editors copy layers TWICE (`sourceLayers` then
         * `editableLayers`) and then a third time into the save snapshot.
         */
        it(`${kind}: an existing materialId survives a round trip untouched`, () => {
            const layers = [{
                name: 'Structure', function: 'structure', thickness: 0.2,
                materialColor: MASTER_HEX, materialId: MASTER.id,
            }];
            const h = mount(kind, kind === 'wall' ? wallEl(layers) : slabEl(layers));
            const saved = h.save()!;
            expect(saved[0].materialId).toBe(MASTER.id);
        });
    }
});

// ── ARM 3 — overrides are MARKED, and the mark is the way out (C100 §2.2) ────

describe('L-10066 — an override is marked, with no new field to encode it', () => {

    it('no badge while the colour agrees with the material', () => {
        mount('wall', wallEl());
        pick(pickers()[0], MASTER.id);
        expect(badges()[0].style.display).toBe('none');
    });

    /**
     * ⭐ THE STALE-MARK CASE. The override state is derived from `materialColor`,
     * which is edited by a control `LayerMaterialCell` does not own — the row's
     * `<input type="color">`. A badge painted once at build time would be right on
     * first render and WRONG the instant the user touched the swatch: an override
     * with no mark, which is exactly the C100 §2.2 MUST inverted. This is why the
     * cell exposes `repaint()` and both editors call it from the colour handler.
     */
    it('the badge appears the moment the colour is dragged away from the master', () => {
        mount('wall', wallEl());
        pick(pickers()[0], MASTER.id);
        expect(badges()[0].style.display, 'aligned layer must not be marked').toBe('none');

        const col = colourInputs()[0];
        col.value = '#123456';
        col.dispatchEvent(new Event('input', { bubbles: true }));

        expect(
            badges()[0].style.display,
            'the colour now disagrees with the material and the layer is NOT marked — a stale mark',
        ).not.toBe('none');
    });

    it('clicking the badge resets the colour to the master value', () => {
        const layers = [{
            name: 'Structure', function: 'structure', thickness: 0.2,
            materialColor: '#123456', materialId: MASTER.id,
        }];
        const h = mount('wall', wallEl(layers));
        const badge = badges()[0];
        expect(badge.style.display, 'a diverged layer must be MARKED').not.toBe('none');
        badge.click();
        const saved = h.save()!;
        expect(String(saved[0].materialColor).toLowerCase())
            .toBe(MASTER_HEX);
        // ⭐ No `isOverride` field anywhere — the state IS the disagreement (§10.12.e).
        expect(Object.keys(saved[0])).not.toContain('isOverride');
    });

    it('the badge WORDING differs by family, because the two builders disagree', () => {
        const layers = [{
            name: 'Structure', function: 'structure', thickness: 0.2,
            materialColor: '#123456', materialId: MASTER.id,
        }];
        mount('wall', wallEl(layers));
        const wallText = badges()[0].textContent ?? '';
        document.body.innerHTML = '';
        mount('slab', slabEl(layers));
        const slabText = badges()[0].textContent ?? '';

        expect(wallText).toContain('overridden');
        expect(slabText).toContain('material wins');
        expect(
            wallText,
            'one shared sentence would be FALSE for one of the two families',
        ).not.toBe(slabText);
    });
});

// ── ARM 4 — the precedence is STATED, per family, and it is the MEASURED one ─

describe('L-10067 — the precedence is stated in the UI, not guessed at', () => {

    it('the measured winners are opposite, and that is recorded', () => {
        expect(LAYER_COLOUR_PRECEDENCE.slab.winner).toBe('material');
        expect(LAYER_COLOUR_PRECEDENCE.wall.winner).toBe('colour');
    });

    it('each precedence row cites a file:line rather than asserting from memory', () => {
        for (const fam of ['wall', 'slab'] as const) {
            expect(LAYER_COLOUR_PRECEDENCE[fam].evidence).toMatch(/packages\/geometry-\w+\/src\/\w+\.ts:\d+/);
        }
    });

    it('the wall table tells the user the COLOUR is painted', () => {
        mount('wall', wallEl());
        const note = document.querySelector('.lmc-precedence') as HTMLElement;
        expect(note, 'no precedence note above the LAYERS table').toBeTruthy();
        expect(note.textContent).toContain('colour box is what gets painted');
    });

    it('the slab table tells the user the MATERIAL is painted', () => {
        mount('slab', slabEl());
        const note = document.querySelector('.lmc-precedence') as HTMLElement;
        expect(note, 'no precedence note above the LAYERS table').toBeTruthy();
        expect(note.textContent).toContain('painted in THAT material');
    });

    it('the existing Color Override still works and is not deleted', () => {
        const h = mount('slab', slabEl());
        const col = colourInputs()[0];
        col.value = '#abcdef';
        col.dispatchEvent(new Event('input', { bubbles: true }));
        const saved = h.save()!;
        expect(saved[0].materialColor).toBe('#abcdef');
    });
});
