// @vitest-environment happy-dom
/**
 * wallLayerMaterialAuthoring — §MAT-LAYER-IS-A-REFERENCE (L-8610..L-8613).
 * Lane MAT50, 2026-08-23.
 *
 * The founder: *"Can you please add material for each layer? and that the user
 * can change the material via UI and via RAC?"*
 *
 * This suite is the UI half, proved AT THE SURFACE — it opens the REAL wall-type
 * editor, finds the REAL picker, fires a REAL change event, and reads the draft
 * that reaches `onSave`. §COMMITTED-IS-NOT-REACHABLE: asserting that
 * `DraftLayer` has an optional field would prove nothing about whether a user can
 * set it.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { openWallTypeEditor, type WallTypeDraft } from '../src/ui/property-panel/WallTypeEditorModal';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';
import { MATERIAL_CATALOG } from '@pryzm/schemas/materials';

const authoring = {
    family: 'wall',
    singular: 'wall type',
    plural: 'wall types',
    instanceNoun: 'wall',
} as never;

const baseDraft = (): WallTypeDraft => ({
    name: 'Test Type',
    description: '',
    layers: [
        { name: 'External Render', thickness: 0.015, function: 'finish-exterior', materialColor: '#c8bfa8' },
        { name: 'Structure',       thickness: 0.170, function: 'structure',       materialColor: '#a0a0a0' },
    ],
} as WallTypeDraft);

let dispose: (() => void) | null = null;
afterEach(() => { dispose?.(); dispose = null; document.body.innerHTML = ''; });

function open(initial: WallTypeDraft, onSave: (d: WallTypeDraft) => void = () => {}) {
    dispose = openWallTypeEditor({
        mode: 'create', authoring, initial, existingNames: [],
        onSave: (d) => onSave(d),
    });
}

/** The picker the door/window lane shipped renders a <select> inside .fms-wrap. */
function pickers(): HTMLSelectElement[] {
    return [...document.querySelectorAll('.fms-wrap select')] as HTMLSelectElement[];
}

describe('wall layer authoring — a layer can NAME a master material', () => {

    it('renders one master-backed picker per layer', () => {
        open(baseDraft());
        expect(pickers().length, 'no per-layer material picker rendered').toBe(2);
    });

    /**
     * C100 §6.1's MUST: the options come FROM THE MASTER, never a hand-written
     * swatch list. Before this lane the only control was <input type="color">,
     * which is not even a swatch list — it is an unconstrained hex with no
     * reference at all.
     */
    it('C100 §6.1 — the options are the master library, not a local list', () => {
        open(baseDraft());
        const select = pickers()[0];
        expect(select).toBeDefined();
        const values = [...select!.options].map(o => o.value).filter(v => v && !v.startsWith('__'));
        expect(values.length, 'picker offers too few materials to be the master').toBeGreaterThan(100);

        const masterIds = new Set(STANDARD_MATERIAL_LIBRARY.map(m => m.id));
        const foreign = values.filter(v => !masterIds.has(v));
        expect(foreign, 'picker offers ids that are not in the master library').toEqual([]);
    });

    /**
     * ⭐ THE ONE THAT MATTERS — the founder's sentence, end to end through the UI.
     */
    it('picking a material puts materialId on the layer that reaches onSave', () => {
        let saved: WallTypeDraft | null = null;
        open(baseDraft(), (d) => { saved = d; });

        const target = STANDARD_MATERIAL_LIBRARY.find(m => m.id === 'wood-oak')
            ?? STANDARD_MATERIAL_LIBRARY[0]!;

        const select = pickers()[0]!;
        select.value = target.id;
        select.dispatchEvent(new Event('change', { bubbles: true }));

        const saveBtn = [...document.querySelectorAll('button')]
            .find(b => /create|save/i.test(b.textContent ?? ''));
        expect(saveBtn, 'no save button found').toBeDefined();
        saveBtn!.click();

        expect(saved, 'onSave never fired').not.toBeNull();
        expect(saved!.layers[0]!.materialId).toBe(target.id);
    });

    /**
     * C100 §10.12.b, quoted: an id added beside a DISAGREEING hex is read by every
     * downstream resolver as a deliberate user override. So the reference and the
     * cached hex must move in the SAME change, or every freshly-picked layer would
     * claim to have been overridden.
     */
    it('C100 §10.12.b — picking a material brings the hex to the master value too', () => {
        open(baseDraft());

        // ⚠ Asserted against the L0 master (`MATERIAL_CATALOG`, plain scalars),
        // NOT against `STANDARD_MATERIAL_LIBRARY` — that is the THREE-typed
        // PROJECTION whose `params.color` is a `THREE.Color`, and NOT against the
        // product's own `finishMaterialHex`, which would make this circular.
        // §PROBE-CAN-BE-WRONG-THREE-WAYS: demand an independent source.
        const target = MATERIAL_CATALOG.find(m => m.id === 'wood-oak') ?? MATERIAL_CATALOG[0]!;

        const select = pickers()[0]!;
        select.value = target.id;
        select.dispatchEvent(new Event('change', { bubbles: true }));

        const colourInput = document.querySelector('input[type="color"]') as HTMLInputElement;
        expect(colourInput).not.toBeNull();
        expect(colourInput.value.toLowerCase()).toBe(target.color.toLowerCase());
    });

    /**
     * C100 §2.2 / §6.1: where an element carries an explicit override the UI MARKS
     * it. §10.12.e: the state IS `materialColor ≠ masterHex(materialId)` — no new
     * field, so no codec change.
     */
    it('C100 §2.2 — an override is MARKED, and is resettable', () => {
        open(baseDraft());
        const select = pickers()[0]!;
        select.value = 'wood-oak';
        select.dispatchEvent(new Event('change', { bubbles: true }));

        const resetBtn = [...document.querySelectorAll('button')]
            .find(b => (b.getAttribute('aria-label') ?? '').includes('master value')) as HTMLButtonElement;
        expect(resetBtn, 'no override-reset control rendered').toBeDefined();

        // Resolved, hex == master: the badge must be HIDDEN.
        expect(resetBtn.style.display).toBe('none');

        // Now override the colour by hand.
        const colourInput = document.querySelector('input[type="color"]') as HTMLInputElement;
        const masterHex = colourInput.value;
        colourInput.value = '#ff00ff';
        colourInput.dispatchEvent(new Event('input', { bubbles: true }));
        expect(resetBtn.style.display, 'override was not marked').not.toBe('none');

        // And it resets to the master value, not to some remembered default.
        resetBtn.click();
        expect(colourInput.value.toLowerCase()).toBe(masterHex.toLowerCase());
        expect(resetBtn.style.display).toBe('none');
    });

    /**
     * ⛔ The migration rule C100 §10.12.d binds: a user's existing value is never
     * silently dropped. A layer with a free-text name and no id is `legacy`, and
     * the name stays in the record until the user replaces it.
     */
    it('a pre-reference layer reads as legacy and keeps its name', () => {
        let saved: WallTypeDraft | null = null;
        open(baseDraft(), (d) => { saved = d; });

        const wrap = document.querySelector('.fms-wrap') as HTMLElement;
        expect(wrap.dataset['finishState'], 'a layer with a name and no id is not classified legacy')
            .toBe('legacy');

        const saveBtn = [...document.querySelectorAll('button')]
            .find(b => /create|save/i.test(b.textContent ?? ''));
        saveBtn!.click();
        expect(saved!.layers[0]!.name).toBe('External Render');
        expect(saved!.layers[0]!.materialId).toBeUndefined();
    });

    /**
     * ⛔ NO SILENT DROP on the way back OUT. The modal deep-copies its input and
     * `WallTypeSelectorWidget` structuredClones for duplicate; both spread whole
     * layer objects, so an id survives a round trip. Pinned because a narrowing
     * copy (`{name, thickness, function, materialColor}`) would delete a user's
     * material on every edit and would look like a tidy-up in review.
     */
    it('an existing materialId survives open → save untouched', () => {
        const withId = baseDraft();
        withId.layers[0]!.materialId = 'wood-oak';
        let saved: WallTypeDraft | null = null;
        open(withId, (d) => { saved = d; });

        const wrap = document.querySelector('.fms-wrap') as HTMLElement;
        expect(wrap.dataset['finishState']).toBe('resolved');

        const saveBtn = [...document.querySelectorAll('button')]
            .find(b => /create|save/i.test(b.textContent ?? ''));
        saveBtn!.click();
        expect(saved!.layers[0]!.materialId).toBe('wood-oak');
    });

    /**
     * ⛔ GRAPHICS ARE NOT COMPROMISED — the standing founder constraint, asserted
     * rather than promised. A draft that is opened and saved with no material
     * interaction must be byte-identical, so no existing wall type recolours.
     */
    it('opening and saving without touching a material changes NOTHING', () => {
        const before = baseDraft();
        let saved: WallTypeDraft | null = null;
        open(structuredClone(before), (d) => { saved = d; });

        const saveBtn = [...document.querySelectorAll('button')]
            .find(b => /create|save/i.test(b.textContent ?? ''));
        saveBtn!.click();

        expect(saved!.layers.map(l => l.materialColor)).toEqual(before.layers.map(l => l.materialColor));
        expect(saved!.layers.map(l => l.thickness)).toEqual(before.layers.map(l => l.thickness));
        expect(saved!.layers.every(l => l.materialId === undefined)).toBe(true);
    });

    /**
     * The whole point of the founder's ask: naming a material must NOT move the
     * wall's thickness. That is what `add-wall-layer` correctly refuses to guess,
     * and this verb is the one that side-steps the question entirely.
     */
    it('naming a material never changes a layer thickness', () => {
        const before = baseDraft();
        let saved: WallTypeDraft | null = null;
        open(structuredClone(before), (d) => { saved = d; });

        const select = pickers()[0]!;
        select.value = 'wood-oak';
        select.dispatchEvent(new Event('change', { bubbles: true }));

        const saveBtn = [...document.querySelectorAll('button')]
            .find(b => /create|save/i.test(b.textContent ?? ''));
        saveBtn!.click();

        expect(saved!.layers.map(l => l.thickness)).toEqual(before.layers.map(l => l.thickness));
    });
});
