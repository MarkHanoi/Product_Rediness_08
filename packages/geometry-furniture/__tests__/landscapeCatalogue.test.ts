// §LANDSCAPE-CATALOGUE (L-1380) — the LANDSCAPE panel's catalogue, asserted
// against the LIVE maps, the LIVE builder dispatch and the LIVE plan-symbol
// predicate.
//
// ## Why every arm here refuses to stub
//
// ⛔ A test that stubs the catalogue proves nothing. The failure mode this file
// exists to catch is precisely the one a stub cannot express: an entry that the
// panel offers, that *looks* fine in a fixture, and that resolves to no builder,
// no material intent or no category at runtime — an offer that produces nothing.
// So every lookup below goes through the module production imports:
//
//   FurnitureFactory.createBuilder      the real dispatch the renderer calls
//   FURNITURE_TYPE_TO_MATERIAL_INTENT   the real semantic map
//   FURNITURE_TYPE_TO_CATEGORY          the real category map
//   isTreeSpeciesId                     the real predicate TreePlanSymbolBuilder keys on
//   ParametricTreeEngine.create         the real mesh build
//
// ## The control that keeps ARM A honest
//
// ARM A would pass trivially if the catalogue were empty. It asserts a floor of
// 33 entries (25 species + 8 potted) and that the tree half is exactly
// TREE_SPECIES_ORDER — so "derived from the species table" is checked as an
// identity, not asserted in a comment.

import { describe, it, expect } from 'vitest';
import {
    LANDSCAPE_CATALOGUE,
    LANDSCAPE_TREE_ENTRIES,
    LANDSCAPE_POTTED_ENTRIES,
    getLandscapeEntry,
    formatLandscapeSpec,
    formatLandscapeLabel,
} from '../src/LandscapeCatalogue';
import {
    TREE_SPECIES_ORDER,
    TREE_SPECIES_TABLE,
    ARCHETYPE_FORM,
    ARCHETYPE_TRUNK_CLEAR_RATIO,
    isTreeSpeciesId,
} from '../src/TreeTypes';
import { FURNITURE_TYPE_TO_CATEGORY } from '../src/FurnitureCategoryMap';
import { FURNITURE_TYPE_TO_MATERIAL_INTENT } from '../src/FurnitureMaterialIntent';
import { FurnitureFactory } from '../src/builders/FurnitureFactory';
import { MaterialService } from '../src/MaterialService';
import { ParametricTreeEngine } from '../src/engines/ParametricTreeEngine';
import type { FurnitureFragmentBuilder } from '../src/FurnitureFragmentBuilder';
import type { FurnitureData } from '../src/FurnitureTypes';

// The factory takes a FurnitureFragmentBuilder purely to reach its
// MaterialService. Standing in for that ONE accessor keeps the subject under
// test — the dispatch table and the builders themselves — entirely real; it is
// the harness that is minimal, never the catalogue.
function factoryHost(): FurnitureFragmentBuilder {
    const svc = new MaterialService();
    return { getMaterialService: () => svc } as unknown as FurnitureFragmentBuilder;
}

function datumFor(furnitureType: string, w: number, l: number, h: number): FurnitureData {
    return {
        id: `t-${furnitureType}`,
        furnitureType,
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        width: w, length: l, height: h,
        material: 'wood',
    } as unknown as FurnitureData;
}

function meshCount(root: { traverse: (cb: (o: unknown) => void) => void }): number {
    let n = 0;
    root.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) n++; });
    return n;
}

describe('§LANDSCAPE-CATALOGUE — ARM A: the catalogue is DERIVED, not transcribed', () => {
    it('offers every tree species in TREE_SPECIES_ORDER, in order, and nothing else', () => {
        expect(LANDSCAPE_TREE_ENTRIES.map(e => e.furnitureType))
            .toEqual([...TREE_SPECIES_ORDER]);
    });

    it('carries at least the 25 species + 8 potted rows the panel ships', () => {
        // A floor, not an equality: adding a species must NOT break this test,
        // it must widen the panel. Removing the library silently would.
        expect(LANDSCAPE_CATALOGUE.length).toBeGreaterThanOrEqual(33);
        expect(LANDSCAPE_POTTED_ENTRIES.length).toBe(8);
    });

    it('derives canopy diameter and trunk clear height from the species table, not from prose', () => {
        for (const e of LANDSCAPE_TREE_ENTRIES) {
            const def = TREE_SPECIES_TABLE[e.furnitureType as keyof typeof TREE_SPECIES_TABLE];
            expect(def, `${e.furnitureType} must exist in TREE_SPECIES_TABLE`).toBeDefined();
            expect(e.canopyDiameter).toBeCloseTo(def.crownRadius * 2, 6);
            expect(e.matureHeight).toBe(def.height);
            expect(e.form).toBe(ARCHETYPE_FORM[def.archetype]);
            const expectedClear = def.height * ARCHETYPE_TRUNK_CLEAR_RATIO[def.archetype];
            expect(e.trunkClearHeight).toBeCloseTo(expectedClear, 1);
        }
    });

    it('never lets trunk clear height exceed the tree — a clear height a designer walks under', () => {
        for (const e of LANDSCAPE_TREE_ENTRIES) {
            expect(e.trunkClearHeight, e.furnitureType).toBeLessThan(e.matureHeight);
            expect(e.trunkClearHeight, e.furnitureType).toBeGreaterThan(0);
        }
    });

    it('gives every entry a real, distinct, non-placeholder label', () => {
        const labels = LANDSCAPE_CATALOGUE.map(formatLandscapeLabel);
        // The defect being closed: eight rows reading `Plant 01`…`Plant 08`.
        for (const l of labels) {
            expect(l).not.toMatch(/^Plant\s*0?\d+$/);
            expect(l.trim().length).toBeGreaterThan(3);
        }
        expect(new Set(labels).size, 'labels must be unique').toBe(labels.length);
    });

    it('prints a specification carrying the two numbers that decide whether it fits', () => {
        for (const e of LANDSCAPE_CATALOGUE) {
            const spec = formatLandscapeSpec(e);
            expect(spec, e.furnitureType).toMatch(/m H × .* m Ø/);
        }
        // ⛔ and NEVER a hardiness / climate / code claim: no layer in this repo
        // evaluates a planting code rule, so a suitability string here would be
        // a fabricated compliance claim. See C97 §LANDSCAPE.
        for (const e of LANDSCAPE_CATALOGUE) {
            expect(formatLandscapeSpec(e)).not.toMatch(/zone|hardin|USDA|complian|permitted/i);
        }
    });
});

describe('§LANDSCAPE-CATALOGUE — ARM B: every entry resolves against the LIVE maps', () => {
    it('resolves a material intent from the production map — never a hand-typed colour', () => {
        for (const e of LANDSCAPE_CATALOGUE) {
            const live = FURNITURE_TYPE_TO_MATERIAL_INTENT[e.furnitureType];
            expect(live, `${e.furnitureType} has no live material intent`).toBeDefined();
            expect(e.materialIntent).toBe(live);
        }
    });

    it('resolves a category from the production map', () => {
        for (const e of LANDSCAPE_CATALOGUE) {
            const live = FURNITURE_TYPE_TO_CATEGORY[e.furnitureType];
            expect(live, `${e.furnitureType} has no live category`).toBeDefined();
            expect(e.category).toBe(live);
        }
    });

    it('classifies trees as outdoor and potted plants as decor — the split the panel groups on', () => {
        for (const e of LANDSCAPE_TREE_ENTRIES) expect(e.category, e.furnitureType).toBe('outdoor');
        for (const e of LANDSCAPE_POTTED_ENTRIES) expect(e.category, e.furnitureType).toBe('decor');
    });

    it('reports plan-symbol availability from the SAME predicate the renderer keys on', () => {
        for (const e of LANDSCAPE_CATALOGUE) {
            expect(e.hasPlanSymbol).toBe(isTreeSpeciesId(e.furnitureType));
        }
    });
});

describe('§LANDSCAPE-CATALOGUE — ARM C: every entry BUILDS real geometry, live', () => {
    // ⚠ THE ASSERTION THAT MATTERS, AND WHY IT IS NOT `toBeTruthy()`.
    // `FurnitureFactory.getBuilder`'s `default:` branch (FurnitureFactory.ts:300)
    // returns `{ build: () => new THREE.Group() }` — an EMPTY group, silently.
    // So "a builder was returned" is true for EVERY string on earth and proves
    // nothing. An offer that dispatches to the default branch is exactly the
    // "authored but invisible" outcome: the panel row works, the click works,
    // the element is created, and nothing renders. Only MESH COUNT separates a
    // real builder from that silent no-op.

    it('CONTROL — an uncatalogued type falls to the default branch and builds NOTHING', () => {
        const b = FurnitureFactory.getBuilder('definitely_not_a_furniture_type', factoryHost());
        const g = b.build(datumFor('definitely_not_a_furniture_type', 1, 1, 1));
        expect(meshCount(g), 'the control must be empty, or ARM C cannot fail').toBe(0);
    });

    it('builds at least one mesh for EVERY catalogue entry', () => {
        const host = factoryHost();
        const empties: string[] = [];
        for (const e of LANDSCAPE_CATALOGUE) {
            const b = FurnitureFactory.getBuilder(e.furnitureType, host);
            const g = b.build(datumFor(
                e.furnitureType, e.footprint.width, e.footprint.length, e.footprint.height,
            ));
            if (meshCount(g) === 0) empties.push(e.furnitureType);
        }
        expect(empties, 'these entries would be offered and render nothing').toEqual([]);
    });

    it('builds real geometry for every tree species through the parametric engine', () => {
        const eng = new ParametricTreeEngine();
        for (const e of LANDSCAPE_TREE_ENTRIES) {
            const g = eng.create(e.furnitureType as never);
            expect(g.children.length, `${e.furnitureType} built an empty group`).toBeGreaterThan(0);
        }
    });
});

describe('§LANDSCAPE-CATALOGUE — ARM D: lookup', () => {
    it('finds every catalogued type and refuses an uncatalogued one', () => {
        for (const e of LANDSCAPE_CATALOGUE) {
            expect(getLandscapeEntry(e.furnitureType)?.furnitureType).toBe(e.furnitureType);
        }
        // Control: a real FurnitureType that is NOT landscape must not resolve.
        expect(getLandscapeEntry('sofa_2seat')).toBeUndefined();
        expect(getLandscapeEntry('not_a_type')).toBeUndefined();
    });
});
