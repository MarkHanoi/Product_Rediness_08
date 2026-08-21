/**
 * §INSPECT-EVERY-CATEGORY (L-2032) / §CONTEXT-DATA-HONESTY (L-2034) —
 * lane INSP1, 2026-08-21.
 *
 * Founder: *"in Inspect mode all categories should be mapped."*
 *
 * ⛔ THE DEFECT THIS GATE EXISTS FOR is not that six categories were wired and
 * twenty exist. It is that the shortfall was SILENT: `ELEMENT_TYPE_LABELS` was a
 * hand-written six-entry object, and adding an element family to PRYZM changed
 * nothing about it and produced no error anywhere. A hand-written table degrades
 * every time the model grows, and says nothing.
 *
 * ⭐ ARM A reads the SAME `window.<x>Store =` assignments the engine bootstrap
 * publishes — the authority the panel actually reads from — and fails when one
 * has neither an `INSPECT_CATEGORIES` row nor a reasoned `NON_ELEMENT_STORE_GLOBALS`
 * entry. It compares SETS, never a count, because a correct count with the wrong
 * membership is the failure mode this repo keeps rediscovering.
 *
 * ⚠ WHAT THIS GATE CANNOT TELL YOU: that a category's records actually carry a
 * measurable field. A store that exists and is empty passes ARM A and refuses
 * honestly at runtime (ARM C). Reachability in the LIVE app — the panel's
 * dropdown really offering all twenty — is not measured here; it needs a browser.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    INSPECT_CATEGORIES,
    NON_ELEMENT_STORE_GLOBALS,
    ELEMENT_TYPE_LABELS,
    ELEMENT_TYPE_ICONS,
    meshTypeForCategory,
} from '../src/ui/inspect/audit/inspectCategories';
import {
    buildAttributeMapping,
    resolveCategoryAttributes,
    deriveNumericAttributes,
    rampColorToHex,
    UNMEASURED_COLOR,
} from '../src/ui/inspect/audit/ElementTypeSelectorZone';

const ENGINE_DIR = join(__dirname, '..', 'src', 'engine');

/** Every `window.<name>Store = …` the engine bootstrap publishes. */
function publishedStoreGlobals(): string[] {
    const found = new Set<string>();
    for (const f of readdirSync(ENGINE_DIR)) {
        if (!f.endsWith('.ts')) continue;
        const src = readFileSync(join(ENGINE_DIR, f), 'utf8');
        for (const m of src.matchAll(/^\s*window\.(\w+Store)\s*=/gm)) found.add(m[1]);
    }
    return Array.from(found).sort();
}

describe('ARM A — no element family reaches main without an Inspect decision', () => {
    it('finds the engine bootstrap store globals at all (the gate can fail)', () => {
        const globals = publishedStoreGlobals();
        // If this ever reads 0 the regex or the bootstrap moved, and ARM A would
        // be passing vacuously — the exact shape of an unenforceable gate.
        expect(globals.length).toBeGreaterThan(10);
        expect(globals).toContain('windowStore');
        expect(globals).toContain('roomStore');
    });

    it('every published store global is either a category or explicitly excluded', () => {
        const categorised = new Set(INSPECT_CATEGORIES.map(c => c.storeKey));
        const excluded    = new Set(Object.keys(NON_ELEMENT_STORE_GLOBALS));
        const undecided   = publishedStoreGlobals()
            .filter(g => !categorised.has(g) && !excluded.has(g));

        expect(
            undecided,
            'Add an INSPECT_CATEGORIES row, or a reasoned NON_ELEMENT_STORE_GLOBALS entry, ' +
            `for: ${undecided.join(', ')}`,
        ).toEqual([]);
    });

    it('the fourteen families the founder named on 2026-08-21 are categories', () => {
        // The pre-fix list was exactly: rooms, walls, doors, windows, slabs, columns.
        const ids = new Set(INSPECT_CATEGORIES.map(c => c.id as string));
        for (const id of [
            'furniture', 'stairs', 'handrails', 'columns', 'beams', 'roofs',
            'ceilings', 'floors', 'openings', 'rooms', 'walls', 'slabs',
            'windows', 'doors',
        ]) {
            expect(ids.has(id), `missing Inspect category: ${id}`).toBe(true);
        }
    });

    it('every category is fully declared — no blank label, icon, store or mesh type', () => {
        for (const c of INSPECT_CATEGORIES) {
            expect(ELEMENT_TYPE_LABELS[c.id], c.id).toBeTruthy();
            expect(ELEMENT_TYPE_ICONS[c.id], c.id).toBeTruthy();
            expect(c.storeKey.endsWith('Store'), c.id).toBe(true);
            expect(c.meshType.length, c.id).toBeGreaterThan(0);
        }
        const ids = INSPECT_CATEGORIES.map(c => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('ARM B — the 3D lens is told the BUILDER’s type, not a de-pluralised label', () => {
    it('states the mesh type for families the old `replace(/s$/,)` guess got wrong', () => {
        // The guess: 'curtainWalls' → 'curtainwall'; the builders stamp 'curtain-wall'.
        expect(meshTypeForCategory('curtainWalls')).toBe('curtain-wall');
        expect(meshTypeForCategory('stairRailings')).toBe('stair-railing');
        expect(meshTypeForCategory('furniture')).toBe('furniture');   // guess → 'furnitur'
        expect(meshTypeForCategory('lighting')).toBe('lighting');
    });

    it('still agrees with the guess where the guess was right', () => {
        expect(meshTypeForCategory('walls')).toBe('wall');
        expect(meshTypeForCategory('windows')).toBe('window');
        expect(meshTypeForCategory('doors')).toBe('door');
    });
});

describe('ARM C — refusal and emptiness are DIFFERENT values (C75 §1.4)', () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const withStore = (key: string, records: unknown[] | null, fn: () => void) => {
        const prev = g[key];
        g[key] = records === null ? undefined : { getAll: () => records };
        try { fn(); } finally { g[key] = prev; }
    };

    it('a MISSING store is "no-store" — unknown, not "none in model"', () => {
        withStore('beamStore', null, () => {
            const m = buildAttributeMapping('beams', 'length');
            expect(m.status).toBe('no-store');
            expect(m.entries).toEqual([]);
            expect(m.reason).toMatch(/UNKNOWN/);
        });
    });

    it('an EMPTY store is "no-elements" — a different fact, a different sentence', () => {
        withStore('beamStore', [], () => {
            const m = buildAttributeMapping('beams', 'length');
            expect(m.status).toBe('no-elements');
            expect(m.reason).not.toMatch(/UNKNOWN/);
        });
    });

    it('elements that carry NO value for the attribute REFUSE — never a fake zero ramp', () => {
        withStore('beamStore', [{ id: 'b1' }, { id: 'b2' }], () => {
            const m = buildAttributeMapping('beams', 'length');
            expect(m.status).toBe('unmeasured');
            expect(m.measured).toBe(0);
            expect(m.total).toBe(2);
            expect(m.entries).toEqual([]);      // nothing is coloured
            expect(m.reason).toMatch(/NOT MAPPED/);
            expect(m.reason).toMatch(/UNKNOWN, not zero/);
        });
    });

    it('ALL-ZERO is a real answer and maps — it must NOT look like "unmeasured"', () => {
        withStore('beamStore', [{ id: 'b1', width: 0 }, { id: 'b2', width: 0 }], () => {
            const m = buildAttributeMapping('beams', 'width');
            expect(m.status).toBe('mapped');
            expect(m.measured).toBe(2);
            expect(m.min).toBe(0);
            expect(m.max).toBe(0);
            expect(m.reason).toMatch(/share one value/);
        });
    });

    it('a PARTIALLY measured category maps, and the unmeasured members are not on the ramp', () => {
        withStore('beamStore', [{ id: 'b1', width: 0.2 }, { id: 'b2' }], () => {
            const m = buildAttributeMapping('beams', 'width');
            expect(m.status).toBe('mapped');
            expect(m.measured).toBe(1);
            expect(m.total).toBe(2);
            expect(m.entries.find(e => e.id === 'b2')!.color).toBe(UNMEASURED_COLOR);
            expect(m.entries.find(e => e.id === 'b1')!.color).not.toBe(UNMEASURED_COLOR);
        });
    });
});

describe('ARM D — attributes are DERIVED from the records, not only hand-written', () => {
    it('a numeric field nobody wrote a descriptor for becomes mappable', () => {
        const derived = deriveNumericAttributes(
            [{ id: 'x', spanRatio: 1.75 }], new Set(['length']),
        );
        const keys = derived.map(d => d.key);
        expect(keys).toContain('spanRatio');
        const d = derived.find(x => x.key === 'spanRatio')!;
        expect(d.label).toBe('Span Ratio');
        expect(d.extract({ spanRatio: 2 })).toBe(2);
        expect(d.extract({})).toBeNull();          // absent ⇒ UNKNOWN, never 0
    });

    it('curated descriptors are never shadowed by derived ones', () => {
        const g = globalThis as unknown as Record<string, unknown>;
        const prev = g.beamStore;
        g.beamStore = { getAll: () => [{ id: 'b', width: 0.2, spanRatio: 1 }] };
        try {
            const attrs = resolveCategoryAttributes('beams');
            expect(attrs.filter(a => a.key === 'width').length).toBe(1);
            expect(attrs.find(a => a.key === 'width')!.unit).toBe('m'); // the curated one
            expect(attrs.some(a => a.key === 'spanRatio')).toBe(true);  // plus the derived one
        } finally { g.beamStore = prev; }
    });

    it('non-measure bookkeeping fields are not offered as attributes', () => {
        const derived = deriveNumericAttributes(
            [{ id: 'x', timestamp: 1, version: 2, _internal: 3, height: 2.4 }], new Set(),
        );
        const keys = derived.map(d => d.key);
        expect(keys).toContain('height');
        expect(keys).not.toContain('timestamp');
        expect(keys).not.toContain('version');
        expect(keys).not.toContain('_internal');
    });

    it('the ramp→hex conversion never silently yields black', () => {
        expect(rampColorToHex('rgb(102,0,255)')).toBe(0x6600ff);
        expect(rampColorToHex('not a colour')).toBe(UNMEASURED_COLOR);
    });
});
