/**
 * materialUsageRegistry — the BOTH-DIRECTIONS gate on the Material Schedule's
 * element axis. Lane MAT50, 2026-08-23. Issues L-8600 .. L-8606.
 *
 * ⭐ WHY A SET AND NEVER A COUNT.
 *
 * The array this replaces was six strings long and six columns wide, so every
 * count anybody could have written about it was RIGHT while its membership was
 * WRONG in both directions at once: 'Ceiling' was a column that could never tick,
 * and `handrailTypeStore` — 44 types, 26 distinct materialIds — had no column at
 * all. This is the same failure CLAUDE.md records for the contract index, where
 * "the count and the range are different facts" had to be written down after the
 * fifth recurrence. So ARM A and ARM B below compare SETS, and the failure
 * messages print the symmetric difference rather than two integers.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import {
    MATERIAL_USAGE_FAMILIES,
    EXCLUDED_TYPE_STORES,
    buildMaterialUsageIndex,
    collectMaterialIds,
} from '../src/ui/dataworkbench/materialUsageRegistry';

const REPO_ROOT = resolve(__dirname, '../../..');
const PACKAGES  = join(REPO_ROOT, 'packages');

/** Every `*TypeStore.ts` source file under packages/, tests excluded. */
function findTypeStoreFiles(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return out; }
    for (const entry of entries) {
        if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) { findTypeStoreFiles(full, out); continue; }
        if (/TypeStore\.ts$/.test(entry) && !/\.(test|spec)\.ts$/.test(entry)) out.push(full);
    }
    return out;
}

/**
 * The repository's own answer to "what type stores exist?", derived by scanning
 * for the module-level singleton export. This is the INDEPENDENT source the
 * registry is checked against — §PROBE-CAN-BE-WRONG-THREE-WAYS: a registry that
 * checked itself would prove nothing.
 */
function discoverSingletonTypeStores(): Map<string, string> {
    const found = new Map<string, string>();
    for (const file of findTypeStoreFiles(PACKAGES)) {
        const src = readFileSync(file, 'utf8');
        const re = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*new\s+([A-Za-z0-9_]+)\s*\(/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
            const cls = m[2];
            if (cls !== undefined && /TypeStore$/.test(cls)) found.set(cls, basename(file));
        }
    }
    return found;
}

/**
 * Every exported `class …TypeStore` on disk, whether or not it has a singleton.
 *
 * ⚠ This is a DIFFERENT set from the singletons above, and conflating the two is
 * what made the first draft of ARM B3 self-contradictory: it asserted that the
 * excluded stores had singletons, when "has no module-level singleton" is
 * precisely the stated reason three of them are excluded. Kept as two functions
 * so the distinction cannot quietly collapse again.
 */
function discoverTypeStoreClasses(): Map<string, string> {
    const found = new Map<string, string>();
    for (const file of findTypeStoreFiles(PACKAGES)) {
        const src = readFileSync(file, 'utf8');
        const re = /export\s+class\s+([A-Za-z0-9_]+TypeStore)\b/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
            const cls = m[1];
            if (cls !== undefined) found.set(cls, basename(file));
        }
    }
    return found;
}

/** Class name a family's store was declared from, e.g. 'wall' -> WallSystemTypeStore. */
const FAMILY_TO_CLASS: Readonly<Record<string, string>> = {
    wall:        'WallSystemTypeStore',
    floor:       'FloorSystemTypeStore',
    slab:        'SlabSystemTypeStore',
    handrail:    'HandrailTypeStore',
    door:        'DoorSystemTypeStore',
    window:      'WindowSystemTypeStore',
    ceiling:     'CeilingSystemTypeStore',
    curtainWall: 'CurtainWallTypeStore',
};

describe('materialUsageRegistry — the element axis is DERIVED, not transcribed', () => {

    it('ARM A — every family in the registry resolves to a usable store', () => {
        const broken = MATERIAL_USAGE_FAMILIES
            .filter(f => typeof f.store?.getAll !== 'function')
            .map(f => f.id);
        expect(broken, 'families whose store has no getAll()').toEqual([]);
        expect(MATERIAL_USAGE_FAMILIES.length).toBeGreaterThan(0);
    });

    it('ARM A2 — family ids and labels are unique (a duplicate column is a silent overwrite)', () => {
        const ids    = MATERIAL_USAGE_FAMILIES.map(f => f.id);
        const labels = MATERIAL_USAGE_FAMILIES.map(f => f.label);
        expect(new Set(ids).size, 'duplicate family id').toBe(ids.length);
        expect(new Set(labels).size, 'duplicate column label').toBe(labels.length);
    });

    /**
     * ⭐ ARM B — THE ONE THAT MATTERS.
     *
     * Fails when a type-store singleton exists in the repository and is neither
     * on the axis nor explicitly excluded. That is the exact condition under
     * which `handrailTypeStore` stayed invisible while carrying 26 real material
     * references, and under which any family shipping next week would repeat it.
     */
    it('ARM B — registry ∪ excluded covers EVERY type-store singleton in the repo', () => {
        const discovered = discoverSingletonTypeStores();
        expect(discovered.size, 'the scanner found no type stores at all — it is broken, not the registry')
            .toBeGreaterThan(4);

        const accounted = new Set<string>([
            ...MATERIAL_USAGE_FAMILIES.map(f => FAMILY_TO_CLASS[f.id] ?? `UNMAPPED:${f.id}`),
            ...EXCLUDED_TYPE_STORES.map(e => e.store),
        ]);

        const unaccounted = [...discovered.keys()].filter(c => !accounted.has(c)).sort();
        expect(
            unaccounted,
            'Type-store singleton(s) exist that the Material Schedule neither shows nor ' +
            'explicitly excludes. Add each to MATERIAL_USAGE_FAMILIES (with a column) or to ' +
            'EXCLUDED_TYPE_STORES (with the reason). Do not delete this assertion.',
        ).toEqual([]);
    });

    it('ARM B2 — no family is mapped to a class name that does not exist on disk', () => {
        const discovered = discoverSingletonTypeStores();
        const phantom = MATERIAL_USAGE_FAMILIES
            .map(f => FAMILY_TO_CLASS[f.id])
            .filter((c): c is string => c !== undefined)
            .filter(c => !discovered.has(c));
        expect(phantom, 'family mapped to a store class with no singleton on disk').toEqual([]);
    });

    it('ARM B3 — every exclusion names a store CLASS that really exists, and gives a reason', () => {
        // Checked against the CLASS set, not the singleton set: three exclusions
        // exist BECAUSE they have no singleton (see discoverTypeStoreClasses).
        const classes = discoverTypeStoreClasses();
        const stale = EXCLUDED_TYPE_STORES
            .filter(e => !classes.has(e.store))
            .map(e => e.store);
        // A stale exclusion is debt too: it silently keeps a slot warm for a file
        // that is gone, which is how a hand-list rots in the other direction.
        expect(stale, 'exclusion(s) naming a store that no longer has a singleton').toEqual([]);
        for (const e of EXCLUDED_TYPE_STORES) {
            expect(e.reason.length, `exclusion ${e.store} has no reason`).toBeGreaterThan(30);
        }
    });
});

describe('materialUsageRegistry — the THIRD state is real and is measured, not assumed', () => {

    it('classifies each family as seeded / unseeded from live store data', () => {
        const { familyStates } = buildMaterialUsageIndex();
        for (const f of MATERIAL_USAGE_FAMILIES) {
            expect(familyStates.get(f.id), `no state computed for ${f.id}`).toBeDefined();
        }
    });

    /**
     * Pins the 2026-08-23 measurement. If a family moves seeded↔unseeded this
     * goes red ON PURPOSE — that is a material-authoring event somebody should
     * see, in either direction. Seeding Ceiling is L-8602 and changes pixels.
     */
    it('the measured split at 2026-08-23: 6 families can tick, 2 on the axis cannot', () => {
        const { familyStates, usageByMaterial } = buildMaterialUsageIndex();

        const seeded   = MATERIAL_USAGE_FAMILIES.filter(f => familyStates.get(f.id) === 'seeded').map(f => f.id).sort();
        const unseeded = MATERIAL_USAGE_FAMILIES.filter(f => familyStates.get(f.id) === 'unseeded').map(f => f.id).sort();

        expect(seeded).toEqual(['door', 'floor', 'handrail', 'slab', 'wall', 'window']);
        expect(unseeded).toEqual(['ceiling', 'curtainWall']);

        // The regression this lane exists to prevent: handrail carries real data.
        const handrailMaterials = [...usageByMaterial.entries()].filter(([, fams]) => fams.has('handrail'));
        expect(handrailMaterials.length, 'handrail lost its material references').toBeGreaterThan(20);
    });

    it('a family whose store throws degrades to unseeded rather than blanking the schedule', () => {
        const exploding = { getAll() { throw new Error('store is broken'); } };
        const { familyStates } = buildMaterialUsageIndex([
            { id: 'boom', label: 'Boom', store: exploding },
        ]);
        expect(familyStates.get('boom')).toBe('unseeded');
    });
});

describe('collectMaterialIds — structural, so a new finish slot cannot be missed', () => {

    it('finds ids at any depth and ignores non-material keys', () => {
        const ids = collectMaterialIds({
            layers: [{ materialId: 'a' }, { materialId: '' }],
            frameFinish: { materialId: 'b' },
            nested: { deeper: { parts: [{ materialId: 'c' }] } },
            somethingElse: { id: 'not-a-material' },
        });
        expect([...ids].sort()).toEqual(['a', 'b', 'c']);
    });

    it('is not fooled by a non-string materialId', () => {
        expect(collectMaterialIds({ materialId: 42 }).size).toBe(0);
        expect(collectMaterialIds({ materialId: null }).size).toBe(0);
    });

    it('terminates on a cyclic graph', () => {
        const a: Record<string, unknown> = { materialId: 'x' };
        a['self'] = a;
        expect([...collectMaterialIds(a)]).toEqual(['x']);
    });

    /**
     * The bespoke-accessor regression, stated as a test. The replaced code read
     * `t.frameFinish` and `t.leafFinish` by name; a family gaining a third slot
     * was under-reported until somebody remembered the schedule.
     */
    it('counts a finish slot nobody has taught it about', () => {
        const doorLikeWithNewSlot = {
            frameFinish:     { materialId: 'm1' },
            leafFinish:      { materialId: 'm2' },
            thresholdFinish: { materialId: 'm3' },
        };
        expect(collectMaterialIds(doorLikeWithNewSlot).size).toBe(3);
    });
});
