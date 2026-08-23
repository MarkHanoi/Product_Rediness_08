/**
 * §OPENING-PANEL-CHAT (L-9630 … L-9639)
 * =====================================
 *
 * The founder: *"enable AI chat while in this new creation panel — the user could
 * either do it via UI or chat — 'create a window with…' — and all parameters
 * should be accessible via RAC / AI."*
 *
 * ⭐ THE CLAIM UNDER TEST IS NOT "the chat understands eight phrases." It is that
 * the chat's vocabulary IS the dialog's declaration, so *"all parameters"* is true
 * by construction and cannot rot. The first test asserts exactly that
 * correspondence; if someone adds a field to `ElementTypeAuthoringRegistry` and it
 * is not chat-reachable, this file goes red without anyone remembering to update it.
 *
 * The rest pin the honesty rules that make it safe to say things to a modal:
 * out-of-range REFUSES with both numbers instead of clamping; an unknown material
 * REFUSES instead of picking a near neighbour; ambiguity LISTS the candidates; and
 * "auto" clears a dimension rather than writing a zero.
 */

import { describe, it, expect } from 'vitest';
import {
    draftFieldsFor,
    resolveDraftUtterance,
    exampleAsks,
    morphologyIsGrounded,
    type DraftField,
} from '../FinishTypeDraftIntent';
import { resolveElementTypeAuthoring } from '../ElementTypeAuthoringRegistry';

const windowAuthoring = resolveElementTypeAuthoring('window');
const doorAuthoring = resolveElementTypeAuthoring('door');
if (!windowAuthoring || !doorAuthoring) throw new Error('window/door authoring must be declared');

const WINDOW_FIELDS = draftFieldsFor(windowAuthoring);
const DOOR_FIELDS = draftFieldsFor(doorAuthoring);

const edits = (text: string, fields: readonly DraftField[] = WINDOW_FIELDS) => {
    const r = resolveDraftUtterance(text, fields);
    if (r.kind !== 'edits') throw new Error(`expected edits for "${text}", got ${r.kind}: ${JSON.stringify(r)}`);
    return r.edits;
};

describe('§OPENING-PANEL-CHAT — the vocabulary IS the declaration', () => {
    it('every declared dimension, slot, grid axis and glazing control is chat-reachable', () => {
        // ⛔ This is the test that makes "all parameters accessible via AI" a
        // structural fact rather than a maintenance promise.
        const declared = windowAuthoring.finishEditor!;
        const ids = new Set(WINDOW_FIELDS.map((f) => f.id));
        for (const d of declared.dimensions ?? []) expect(ids, `dimension ${d.key}`).toContain(d.key);
        for (const s of declared.slots) expect(ids, `slot ${s.key}`).toContain(s.key);
        expect(ids).toContain(declared.grid!.columnsKey);
        expect(ids).toContain(declared.grid!.rowsKey);
        expect(ids).toContain('glazingOpacity');
    });

    it('serves a family that declares FEWER controls, without a branch', () => {
        // Door declares no grid — deliberately (its subdivision is typed bands, not a
        // rows x columns slider). The chat must therefore not offer one.
        const ids = new Set(DOOR_FIELDS.map((f) => f.id));
        expect(ids).toContain('leafThickness');
        expect(ids).toContain('leafFinish');
        expect(ids).not.toContain('defaultColumnRatios');
        expect(exampleAsks(DOOR_FIELDS).join(' ')).not.toMatch(/columns/i);
    });

    it('the morphology layer can only reach words the declaration already uses', () => {
        // The one authored table in the module. If it ever names a field the registry
        // does not declare it has become a rival vocabulary, which is the thing the
        // derived design exists to prevent.
        expect(morphologyIsGrounded([...WINDOW_FIELDS, ...DOOR_FIELDS])).toEqual([]);
    });
});

describe('§OPENING-PANEL-CHAT — the founder’s own sentence', () => {
    it('"create a window with a 2m width" sets the width to 2 m', () => {
        const e = edits('create a window with a 2m width');
        expect(e).toHaveLength(1);
        expect(e[0]!.field.id).toBe('width');
        expect(e[0]!.value).toBe(2);
        expect(e[0]!.clearsToAuto).toBe(false);
    });

    it('reaches the same field through natural morphology', () => {
        for (const said of ['make it 2 m wide', '2m wide', 'width 2 m', 'set the width to 2 metres']) {
            const e = edits(said);
            expect(e[0]!.field.id, said).toBe('width');
            expect(e[0]!.value, said).toBe(2);
        }
    });

    it('reads mm and cm into metres — one place interprets a unit', () => {
        expect(edits('frame face 50mm')[0]!.value).toBeCloseTo(0.05, 6);
        expect(edits('frame depth 7 cm')[0]!.value).toBeCloseTo(0.07, 6);
    });

    it('handles a compound ask as several independent edits', () => {
        const e = edits('1.8m wide and 2.1 m high and 3 columns');
        const byId = new Map(e.map((x) => [x.field.id, x.value]));
        expect(byId.get('width')).toBe(1.8);
        expect(byId.get('height')).toBe(2.1);
        expect(byId.get('defaultColumnRatios')).toBe(3);
    });

    it('percentages reach glazing opacity, and bare numbers above 1 are read as percent', () => {
        expect(edits('glazing 20% opaque')[0]!.field.id).toBe('glazingOpacity');
        expect(edits('glazing 20% opaque')[0]!.value).toBeCloseTo(0.2, 6);
        expect(edits('glazing opacity 80')[0]!.value).toBeCloseTo(0.8, 6);
    });
});

describe('§OPENING-PANEL-CHAT — auto is a STATE, not a zero', () => {
    it('"width auto" CLEARS the field rather than writing 0', () => {
        const e = edits('width auto');
        expect(e[0]!.field.id).toBe('width');
        expect(e[0]!.clearsToAuto).toBe(true);
        // ⛔ The value must be null. A 0 here would author "this type asserts zero
        // metres", which is a different type from "this type inherits".
        expect(e[0]!.value).toBeNull();
    });

    it('accepts the other words a user reaches for', () => {
        for (const said of ['height inherit', 'height default', 'clear the height', 'unset height']) {
            const e = edits(said);
            expect(e[0]!.field.id, said).toBe('height');
            expect(e[0]!.clearsToAuto, said).toBe(true);
        }
    });
});

describe('§OPENING-PANEL-CHAT — hard stoppers refuse with BOTH numbers', () => {
    it('a value outside the declared range is refused, never clamped', () => {
        const r = resolveDraftUtterance('width 40 m', WINDOW_FIELDS);
        expect(r.kind).toBe('refusal');
        if (r.kind !== 'refusal') return;
        // What was asked AND what is allowed — the founder's stated rule.
        expect(r.reason).toContain('40');
        expect(r.reason).toContain('6');      // the declared max
        expect(r.reason).toContain('0.3');    // the declared min
        expect(r.reason).toMatch(/not changed/i);
    });

    it('a bare number that cannot be metres names BOTH readings instead of guessing', () => {
        const r = resolveDraftUtterance('frame face 50', WINDOW_FIELDS);
        expect(r.kind).toBe('refusal');
        if (r.kind !== 'refusal') return;
        expect(r.reason).toMatch(/50 mm/);   // the charitable reading, offered
        expect(r.reason).toMatch(/no unit/i); // and why it was not taken
    });

    it('a bare number that IS a plausible metre value is accepted', () => {
        // Refusing here would be pedantry: 1.8 is inside 0.3–6 and means what it says.
        expect(edits('width 1.8')[0]!.value).toBe(1.8);
    });
});

describe('§OPENING-PANEL-CHAT — materials go through the ONE ladder', () => {
    it('an unknown material is REFUSED, not approximated', () => {
        // `suggestMaterialForLegacyName`'s own docstring: "Steel Frame" finding
        // nothing is the CORRECT answer. The chat must inherit that, not soften it.
        const r = resolveDraftUtterance('frame in unobtainium', WINDOW_FIELDS);
        expect(r.kind).toBe('refusal');
        if (r.kind !== 'refusal') return;
        expect(r.reason).toMatch(/not a material in the library/i);
        expect(r.reason).toMatch(/nobody chose/i);
    });

    it('a real library material resolves to an ID, a label and a hex', () => {
        const r = resolveDraftUtterance('frame in oak', WINDOW_FIELDS);
        // Whether "oak" resolves depends on the master catalogue, which is the point:
        // this asserts the SHAPE of a resolution, never a hard-coded colour.
        if (r.kind === 'edits') {
            const e = r.edits[0]!;
            expect(e.field.target).toBe('finish');
            expect(e.materialId, 'a resolved finish must carry the master id').toBeTruthy();
            expect(e.materialHex).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(e.materialLabel).toBeTruthy();
        } else {
            expect(r.kind, 'an unresolvable name must REFUSE, never silently no-op').toBe('refusal');
        }
    });

    it('a material asked for with no name is a refusal that says what is missing', () => {
        const r = resolveDraftUtterance('set the sill finish', WINDOW_FIELDS);
        expect(r.kind).toBe('refusal');
    });
});

describe('§OPENING-PANEL-CHAT — ambiguity is a question, never a coin-flip', () => {
    it('a numeric "frame" names both frame dimensions instead of picking one', () => {
        const r = resolveDraftUtterance('frame 0.05 m', WINDOW_FIELDS);
        expect(r.kind).toBe('refusal');
        if (r.kind !== 'refusal') return;
        expect(r.options).toBeDefined();
        expect(r.options!.length).toBeGreaterThanOrEqual(2);
        expect(r.options).toContain('Frame face');
        expect(r.options).toContain('Frame depth');
    });

    it('the SAME word with a material value is unambiguous — the value narrows the pool', () => {
        // "frame" reaches three fields, but only one of them can hold a material.
        const r = resolveDraftUtterance('frame in oak', WINDOW_FIELDS);
        expect(r.kind).not.toBe('miss');
        if (r.kind === 'edits') expect(r.edits[0]!.field.id).toBe('frameFinish');
    });
});

describe('§OPENING-PANEL-CHAT — the surface never pretends', () => {
    it('an unrecognised ask MISSES with a list of what IS authorable', () => {
        const r = resolveDraftUtterance('paint the roof blue', WINDOW_FIELDS);
        expect(r.kind).toBe('miss');
        if (r.kind !== 'miss') return;
        expect(r.options.length).toBeGreaterThan(0);
    });

    it('"create it" is a COMMIT, not an edit — the dialog owns the save', () => {
        for (const said of ['create it', 'save', 'go', 'done', 'ok create the type']) {
            expect(resolveDraftUtterance(said, WINDOW_FIELDS).kind, said).toBe('commit');
        }
    });

    it('every example the surface offers actually resolves', () => {
        // C06 — never suggest what the surface cannot honour. An example chip that
        // misses is a dead click behind a helpful-looking affordance (C11 §7.6).
        for (const ex of exampleAsks(WINDOW_FIELDS)) {
            const r = resolveDraftUtterance(ex, WINDOW_FIELDS);
            expect(['edits', 'commit'], `example "${ex}" resolved as ${r.kind}`).toContain(r.kind);
        }
    });
});
