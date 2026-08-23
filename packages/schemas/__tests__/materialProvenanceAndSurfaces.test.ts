// §MATERIAL-UPSTREAM-LEDGER + §MATERIAL-DECLARED-SURFACES (L-9700..L-9703).
//
// ⭐ WHAT THIS SUITE DELIBERATELY DOES NOT DO. It does not assert that
// `MATERIAL_UPSTREAMS` has five entries, and it does not assert that N rows carry
// `surfaces`. Both are counts, both move the moment anyone adds a material, and
// C100 §0.3's ruling is that a count belongs in the gate's OUTPUT and never in a
// literal a human maintains. What it asserts is the INVARIANTS — the properties
// that must survive every future row.
//
// ⚠ And it does not assert that a declared surface is ARCHITECTURALLY right. That
// a shingle suits a roof is an authored claim; no test can read a specifier's
// mind, and pretending otherwise is the "fake more capable than real" defect.

import { describe, expect, it } from 'vitest';
import { MATERIAL_CATALOG } from '../src/materials/materialCatalog.js';
import {
    MATERIAL_UPSTREAMS,
    findMaterialUpstream,
    isUpstreamClearedToShip,
    materialUpstreamsRequiringNotice,
    unclearedMaterialUpstreams,
} from '../src/materials/materialProvenance.js';
import {
    MATERIAL_SURFACES,
    isDeclaredForSurface,
    isMaterialSurface,
    materialSurfacesDefect,
} from '../src/materials/materialSurfaces.js';

describe('§MATERIAL-UPSTREAM-LEDGER — a verdict is inseparable from its sentence', () => {
    it('every CLEARED or REFUSED upstream quotes the sentence that decided it, and names when it was read', () => {
        for (const u of MATERIAL_UPSTREAMS) {
            if (u.status === 'NOT_ESTABLISHED') continue;
            expect(u.licenceNote, `${u.id} has a verdict with no quoted sentence`).toBeTruthy();
            expect(u.verifiedOn, `${u.id} has a verdict with no reading date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
    });

    it('NOT_ESTABLISHED means nobody read a licence — so it carries NO sentence and NO date', () => {
        // ⛔ The inverse matters as much as the rule. A NOT_ESTABLISHED row that
        // quotes a licence is claiming both "we read it" and "nobody read it".
        for (const u of MATERIAL_UPSTREAMS) {
            if (u.status !== 'NOT_ESTABLISHED') continue;
            expect(u.licenceNote, `${u.id} is NOT_ESTABLISHED but quotes a licence`).toBeNull();
            expect(u.verifiedOn, `${u.id} is NOT_ESTABLISHED but names a reading date`).toBeNull();
        }
    });

    it('⭐ the ledger CARRIES a refusal — a ledger with none has not been used', () => {
        // This is the assertion that stops the file decaying into a rubber stamp.
        // If someone ever "cleans up" the Pascal-textures row, this goes red and the
        // reviewer has to say out loud that the provenance question was resolved.
        expect(unclearedMaterialUpstreams().length).toBeGreaterThan(0);
        expect(isUpstreamClearedToShip('pascalorg-editor-textures')).toBe(false);
    });

    it('⛔ NO catalogue row names an upstream that is not cleared to ship', () => {
        for (const m of MATERIAL_CATALOG) {
            if (!m.upstream) continue;
            expect(findMaterialUpstream(m.upstream), `'${m.id}' names unledgered upstream '${m.upstream}'`).toBeDefined();
            expect(isUpstreamClearedToShip(m.upstream), `'${m.id}' ships under '${m.upstream}'`).toBe(true);
        }
    });

    it('an attribution obligation always carries the text that discharges it', () => {
        for (const u of materialUpstreamsRequiringNotice()) {
            expect(u.attributionText, `${u.id} owes a notice but names no text`).toBeTruthy();
            expect((u.attributionText ?? '').length).toBeGreaterThan(40);
        }
    });

    it('every upstream id is unique and every row resolves through the ONE lookup', () => {
        const ids = MATERIAL_UPSTREAMS.map((u) => u.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const u of MATERIAL_UPSTREAMS) expect(findMaterialUpstream(u.id)).toBe(u);
        expect(findMaterialUpstream('no-such-upstream')).toBeUndefined();
    });
});

describe('§MATERIAL-DECLARED-SURFACES — absent means NOT DECLARED, never universal', () => {
    it('⭐ an undeclared material answers `null`, not `false` and not `true`', () => {
        // THE CENTRAL ASSERTION OF THE FACET. The reference product spells this
        // "absent = universal", which would make this `true`; a naive
        // `surfaces?.includes(x) ?? false` would make it `false`. Both collapse
        // "nobody classified this" into an answer the catalogue never gave.
        expect(isDeclaredForSurface({}, 'roof')).toBeNull();
        expect(isDeclaredForSurface({ surfaces: [] }, 'roof')).toBeNull();
    });

    it('a declared material answers true/false, and the two are distinguishable from null', () => {
        const shingle = { surfaces: ['roof'] as const };
        expect(isDeclaredForSurface(shingle, 'roof')).toBe(true);
        expect(isDeclaredForSurface(shingle, 'floor')).toBe(false);
        // The three states are three values, and `null !== false` is the whole point.
        expect(isDeclaredForSurface(shingle, 'floor')).not.toBeNull();
    });

    it('⛔ an EMPTY surfaces array is a DEFECT, because it reads as absent', () => {
        expect(materialSurfacesDefect({ id: 'x', surfaces: [] })).toMatch(/indistinguishable from NOT DECLARED/);
        // ...while a genuinely absent field is fine — it is the honest third state.
        expect(materialSurfacesDefect({ id: 'x' })).toBeNull();
    });

    it('rejects an unknown surface and a repeated one', () => {
        expect(materialSurfacesDefect({ id: 'x', surfaces: ['ceiling', 'ceiling'] })).toMatch(/repeats/);
        expect(materialSurfacesDefect({ id: 'x', surfaces: ['gable' as never] })).toMatch(/not one of/);
    });

    it('every catalogue row is well-formed on this axis', () => {
        for (const m of MATERIAL_CATALOG) {
            expect(materialSurfacesDefect(m), `row '${m.id}'`).toBeNull();
        }
    });

    it('the vocabulary is closed and `isMaterialSurface` agrees with it', () => {
        for (const s of MATERIAL_SURFACES) expect(isMaterialSurface(s)).toBe(true);
        expect(isMaterialSurface('gable')).toBe(false);
    });

    it('⭐ every ROOF-declared row is in a category a roof could plausibly be made of', () => {
        // ⚠ A WEAK ASSERTION, ON PURPOSE, AND ITS WEAKNESS IS THE POINT. It cannot
        // check that a finish is architecturally right — see the header. What it CAN
        // catch is the class of mistake a bulk edit makes: sweeping `'roof'` onto
        // everything, or onto a category (Glass, Fabric & Soft) where it would be
        // obviously wrong. It is a smoke alarm, not a fire inspection.
        const plausible = new Set(['Roofing', 'Metal', 'Wood', 'Ceramic & Tile', 'Stone', 'Membrane & Waterproofing', 'Concrete', 'Timber Engineered']);
        for (const m of MATERIAL_CATALOG) {
            if (isDeclaredForSurface(m, 'roof') !== true) continue;
            expect(plausible.has(String(m.category)), `'${m.id}' declares roof but is category '${m.category}'`).toBe(true);
        }
    });

    it('the founder\'s four named finishes exist, are declared for the right surface, and carry a real-world scale', () => {
        // ⛔ NOT A COUNT AND NOT A LABEL MATCH. These are the four things the founder
        // asked for by name; this asserts each is REACHABLE as a catalogue row with a
        // physical size, which is the property that makes it render as a product
        // rather than as wallpaper.
        const want: ReadonlyArray<[string, 'roof' | 'floor']> = [
            ['roof-shingle-asphalt-charcoal', 'roof'],   // "dark roof shingles"
            ['roof-tile-clay-012', 'roof'],              // clay scallop tile
            ['decking-oak-145', 'floor'],                // timber decking
            ['parquet-oak-basket-weave', 'floor'],       // basket-weave parquet
        ];
        for (const [id, surface] of want) {
            const row = MATERIAL_CATALOG.find((m) => m.id === id);
            expect(row, `founder-named material '${id}' is missing from the master`).toBeDefined();
            expect(isDeclaredForSurface(row!, surface), `'${id}' is not declared for ${surface}`).toBe(true);
            const size = row!.tiling?.realWorldSizeM;
            expect(size, `'${id}' has maps but no real-world scale`).toBeDefined();
            expect(size![0]).toBeGreaterThan(0);
            expect(size![1]).toBeGreaterThan(0);
            // A finish whose repeat is bigger than a building or smaller than a coin
            // is a transcription error, not a product.
            expect(size![0]).toBeLessThan(10);
            expect(size![1]).toBeLessThan(10);
        }
    });
});
