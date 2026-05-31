// P0.3 slice A (Family Platform) — L0 FamilyRegistry substrate tests.
//
// Covers:
//   - identity schema validation (semver, non-empty fields)
//   - registered-family schema validation (enums, archetype hints, IFC mapping)
//   - registry state shape
//   - pure register/unregister + find helpers (incl. `Object.freeze` input)
//   - index re-registration semantics (stale secondary-index entries are stripped)
//
// Goes hand-in-hand with 100% coverage thresholds enforced by
// `vitest.config.ts` (branches/functions/lines/statements all at 100).

import { describe, expect, it } from 'vitest';
import {
    // identity
    FamilyIdentitySchema,
    FAMILY_VERSION_PATTERN,
    // registered family
    RegisteredFamilySchema,
    FamilyOriginSchema,
    FamilyMountClassSchema,
    FamilyCategorySchema,
    FamilyOccupancySchema,
    ArchetypeHintSchema,
    IfcMappingSchema,
    type RegisteredFamily,
    // registry
    FamilyRegistryStateSchema,
    emptyFamilyRegistryState,
    registerFamily,
    unregisterFamily,
    findById,
    findByCategory,
    findByOccupancy,
    findByMountClass,
    findByTag,
} from '../src/family-registry/index.js';

// ── Fixture builders ───────────────────────────────────────────────────────

const identity = (overrides: Partial<ReturnType<typeof baseIdentity>> = {}) => ({
    ...baseIdentity(),
    ...overrides,
});
const baseIdentity = () => ({
    id:      'family/com.pryzm.core/desk',
    name:    'Desk',
    version: '1.0.0',
    author:  'PRYZM',
    license: 'MIT',
});

const family = (overrides: Partial<RegisteredFamily> = {}): RegisteredFamily =>
    RegisteredFamilySchema.parse({
        identity: identity(),
        category:    'desks',
        mountClass:  'floor',
        origin:      'core',
        archetypeHints: [
            { occupancy: 'study',   anchor: 'wall-window' },
            { occupancy: 'bedroom', anchor: 'wall-window', group: 'workstation' },
        ],
        ifcMapping: {
            entityType:     'IfcFurniture',
            predefinedType: 'TABLE',
            psets:          ['Pset_FurnitureTypeCommon'],
        },
        schemaHash: 'sha256:deadbeef',
        tags:       ['workstation', 'office'],
        ...overrides,
    });

// ── identity ────────────────────────────────────────────────────────────────

describe('FamilyIdentitySchema', () => {
    it('accepts a valid identity', () => {
        expect(FamilyIdentitySchema.safeParse(baseIdentity()).success).toBe(true);
    });

    it('rejects empty id', () => {
        expect(FamilyIdentitySchema.safeParse(identity({ id: '' })).success).toBe(false);
    });

    it('rejects empty name', () => {
        expect(FamilyIdentitySchema.safeParse(identity({ name: '' })).success).toBe(false);
    });

    it('rejects empty author', () => {
        expect(FamilyIdentitySchema.safeParse(identity({ author: '' })).success).toBe(false);
    });

    it('rejects empty license', () => {
        expect(FamilyIdentitySchema.safeParse(identity({ license: '' })).success).toBe(false);
    });

    it('rejects non-semver version (missing patch)', () => {
        expect(FamilyIdentitySchema.safeParse(identity({ version: '1.0' })).success).toBe(false);
    });

    it('rejects non-semver version (pre-release suffix)', () => {
        expect(FamilyIdentitySchema.safeParse(identity({ version: '1.0.0-beta' })).success).toBe(false);
    });

    it('rejects non-semver version (non-numeric)', () => {
        expect(FamilyIdentitySchema.safeParse(identity({ version: 'one.zero.zero' })).success).toBe(false);
    });

    it('accepts a multi-digit semver', () => {
        expect(FamilyIdentitySchema.safeParse(identity({ version: '12.34.567' })).success).toBe(true);
    });

    it('FAMILY_VERSION_PATTERN matches strict semver only', () => {
        expect(FAMILY_VERSION_PATTERN.test('0.0.1')).toBe(true);
        expect(FAMILY_VERSION_PATTERN.test('1.0.0-rc1')).toBe(false);
        expect(FAMILY_VERSION_PATTERN.test('1.0')).toBe(false);
    });
});

// ── enums + sub-schemas ─────────────────────────────────────────────────────

describe('FamilyOriginSchema', () => {
    it('accepts every documented origin', () => {
        for (const o of ['core', 'plugin', 'user', 'ai-generated'] as const) {
            expect(FamilyOriginSchema.safeParse(o).success).toBe(true);
        }
    });
    it('rejects unknown origin', () => {
        expect(FamilyOriginSchema.safeParse('community').success).toBe(false);
    });
});

describe('FamilyMountClassSchema', () => {
    it('accepts every documented mount class', () => {
        for (const m of ['floor', 'wall', 'ceiling', 'embedded'] as const) {
            expect(FamilyMountClassSchema.safeParse(m).success).toBe(true);
        }
    });
    it('rejects unknown mount class', () => {
        expect(FamilyMountClassSchema.safeParse('roof').success).toBe(false);
    });
});

describe('FamilyCategorySchema / FamilyOccupancySchema', () => {
    it('accepts non-empty strings', () => {
        expect(FamilyCategorySchema.safeParse('sofas').success).toBe(true);
        expect(FamilyOccupancySchema.safeParse('living').success).toBe(true);
    });
    it('rejects empty strings', () => {
        expect(FamilyCategorySchema.safeParse('').success).toBe(false);
        expect(FamilyOccupancySchema.safeParse('').success).toBe(false);
    });
});

describe('ArchetypeHintSchema', () => {
    it('accepts a minimal hint', () => {
        expect(ArchetypeHintSchema.safeParse({
            occupancy: 'bedroom', anchor: 'wall-longest',
        }).success).toBe(true);
    });
    it('accepts an optional group', () => {
        expect(ArchetypeHintSchema.safeParse({
            occupancy: 'kitchen', anchor: 'center', group: 'dining-set',
        }).success).toBe(true);
    });
    it('rejects unknown anchor', () => {
        expect(ArchetypeHintSchema.safeParse({
            occupancy: 'bedroom', anchor: 'floating',
        }).success).toBe(false);
    });
});

describe('IfcMappingSchema', () => {
    it('accepts a full mapping', () => {
        expect(IfcMappingSchema.safeParse({
            entityType: 'IfcDoor', predefinedType: 'DOOR', psets: ['Pset_DoorCommon'],
        }).success).toBe(true);
    });
    it('accepts an empty psets array', () => {
        expect(IfcMappingSchema.safeParse({
            entityType: 'IfcFurniture', psets: [],
        }).success).toBe(true);
    });
    it('rejects empty entityType', () => {
        expect(IfcMappingSchema.safeParse({
            entityType: '', psets: [],
        }).success).toBe(false);
    });
});

// ── RegisteredFamilySchema ─────────────────────────────────────────────────

describe('RegisteredFamilySchema', () => {
    it('accepts a fully-populated family', () => {
        const parsed = RegisteredFamilySchema.safeParse({
            identity: baseIdentity(),
            category:   'desks',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [{ occupancy: 'study', anchor: 'wall-window' }],
            ifcMapping: { entityType: 'IfcFurniture', psets: [] },
            schemaHash: 'sha256:abc',
            tags:       ['office'],
        });
        expect(parsed.success).toBe(true);
    });

    it('applies the default empty tags array', () => {
        const parsed = RegisteredFamilySchema.parse({
            identity: baseIdentity(),
            category:   'desks',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [],
            ifcMapping: { entityType: 'IfcFurniture', psets: [] },
            schemaHash: 'sha256:abc',
        });
        expect(parsed.tags).toEqual([]);
    });

    it('rejects when category is empty', () => {
        const v = family();
        expect(RegisteredFamilySchema.safeParse({ ...v, category: '' }).success).toBe(false);
    });

    it('rejects when schemaHash is empty', () => {
        const v = family();
        expect(RegisteredFamilySchema.safeParse({ ...v, schemaHash: '' }).success).toBe(false);
    });

    it('rejects when origin is invalid', () => {
        const v = family();
        expect(RegisteredFamilySchema.safeParse({ ...v, origin: 'community' }).success).toBe(false);
    });

    it('round-trips through JSON', () => {
        const v = family();
        const round = RegisteredFamilySchema.parse(JSON.parse(JSON.stringify(v)));
        expect(round).toEqual(v);
    });
});

// ── FamilyRegistryStateSchema ──────────────────────────────────────────────

describe('FamilyRegistryStateSchema', () => {
    it('accepts the empty state', () => {
        expect(FamilyRegistryStateSchema.safeParse(emptyFamilyRegistryState()).success).toBe(true);
    });

    it('accepts a populated state produced by registerFamily', () => {
        const s = registerFamily(emptyFamilyRegistryState(), family());
        expect(FamilyRegistryStateSchema.safeParse(s).success).toBe(true);
    });
});

// ── emptyFamilyRegistryState ───────────────────────────────────────────────

describe('emptyFamilyRegistryState', () => {
    it('returns an all-empty indexes object', () => {
        const s = emptyFamilyRegistryState();
        expect(s).toEqual({
            byId: {}, byCategory: {}, byOccupancy: {}, byMountClass: {}, byTag: {},
        });
    });

    it('returns a FRESH object each call', () => {
        const a = emptyFamilyRegistryState();
        const b = emptyFamilyRegistryState();
        expect(a).not.toBe(b);
        expect(a.byId).not.toBe(b.byId);
    });
});

// ── registerFamily ─────────────────────────────────────────────────────────

describe('registerFamily', () => {
    it('inserts into byId', () => {
        const s = registerFamily(emptyFamilyRegistryState(), family());
        expect(s.byId['family/com.pryzm.core/desk']).toBeDefined();
    });

    it('updates byCategory + byMountClass indexes', () => {
        const s = registerFamily(emptyFamilyRegistryState(), family());
        expect(s.byCategory['desks']).toEqual(['family/com.pryzm.core/desk']);
        expect(s.byMountClass['floor']).toEqual(['family/com.pryzm.core/desk']);
    });

    it('updates byOccupancy with every archetype hint', () => {
        const s = registerFamily(emptyFamilyRegistryState(), family());
        expect(s.byOccupancy['study']).toEqual(['family/com.pryzm.core/desk']);
        expect(s.byOccupancy['bedroom']).toEqual(['family/com.pryzm.core/desk']);
    });

    it('updates byTag with every tag', () => {
        const s = registerFamily(emptyFamilyRegistryState(), family());
        expect(s.byTag['workstation']).toEqual(['family/com.pryzm.core/desk']);
        expect(s.byTag['office']).toEqual(['family/com.pryzm.core/desk']);
    });

    it('aggregates multiple families in the same category bucket', () => {
        let s = registerFamily(emptyFamilyRegistryState(), family());
        s = registerFamily(s, family({
            identity: identity({ id: 'family/com.pryzm.core/desk-2', name: 'Desk 2' }),
        }));
        expect(s.byCategory['desks']!.sort()).toEqual([
            'family/com.pryzm.core/desk',
            'family/com.pryzm.core/desk-2',
        ]);
    });

    it('is idempotent for repeat registration of the same payload', () => {
        const f = family();
        const s1 = registerFamily(emptyFamilyRegistryState(), f);
        const s2 = registerFamily(s1, f);
        expect(s2.byCategory['desks']).toEqual(['family/com.pryzm.core/desk']);
        expect(s2.byTag['workstation']).toEqual(['family/com.pryzm.core/desk']);
        expect(Object.keys(s2.byId)).toEqual(['family/com.pryzm.core/desk']);
    });

    it('STRIPS stale secondary entries when the same id is re-registered with a new category', () => {
        const f1 = family();
        const f2 = family({ category: 'tables' });          // category changed
        let s = registerFamily(emptyFamilyRegistryState(), f1);
        s = registerFamily(s, f2);
        // Old category bucket cleaned up (empty buckets are deleted entirely):
        expect(s.byCategory['desks']).toBeUndefined();
        expect(s.byCategory['tables']).toEqual(['family/com.pryzm.core/desk']);
    });

    it('STRIPS stale tag entries when tags change on re-registration', () => {
        const f1 = family();                                  // tags: workstation + office
        const f2 = family({ tags: ['lounge'] });
        let s = registerFamily(emptyFamilyRegistryState(), f1);
        s = registerFamily(s, f2);
        expect(s.byTag['workstation']).toBeUndefined();
        expect(s.byTag['office']).toBeUndefined();
        expect(s.byTag['lounge']).toEqual(['family/com.pryzm.core/desk']);
    });

    it('does NOT mutate frozen input state (purity)', () => {
        const empty = emptyFamilyRegistryState();
        Object.freeze(empty);
        Object.freeze(empty.byId);
        Object.freeze(empty.byCategory);
        Object.freeze(empty.byOccupancy);
        Object.freeze(empty.byMountClass);
        Object.freeze(empty.byTag);
        expect(() => registerFamily(empty, family())).not.toThrow();
    });

    it('does NOT mutate frozen prior-state buckets on a re-register', () => {
        let s = registerFamily(emptyFamilyRegistryState(), family());
        Object.freeze(s);
        Object.freeze(s.byId);
        Object.freeze(s.byCategory);
        Object.freeze(s.byCategory['desks']);
        Object.freeze(s.byMountClass);
        Object.freeze(s.byMountClass['floor']);
        Object.freeze(s.byTag);
        for (const k of Object.keys(s.byTag)) Object.freeze(s.byTag[k]);
        Object.freeze(s.byOccupancy);
        for (const k of Object.keys(s.byOccupancy)) Object.freeze(s.byOccupancy[k]);
        expect(() => registerFamily(s, family({
            identity: identity({ id: 'family/com.pryzm.core/desk-2' }),
        }))).not.toThrow();
    });
});

// ── unregisterFamily ───────────────────────────────────────────────────────

describe('unregisterFamily', () => {
    it('removes from byId', () => {
        let s = registerFamily(emptyFamilyRegistryState(), family());
        s = unregisterFamily(s, 'family/com.pryzm.core/desk');
        expect(s.byId['family/com.pryzm.core/desk']).toBeUndefined();
    });

    it('removes from every secondary index', () => {
        let s = registerFamily(emptyFamilyRegistryState(), family());
        s = unregisterFamily(s, 'family/com.pryzm.core/desk');
        expect(s.byCategory['desks']).toBeUndefined();
        expect(s.byMountClass['floor']).toBeUndefined();
        expect(s.byOccupancy['study']).toBeUndefined();
        expect(s.byOccupancy['bedroom']).toBeUndefined();
        expect(s.byTag['workstation']).toBeUndefined();
        expect(s.byTag['office']).toBeUndefined();
    });

    it('preserves siblings in shared category buckets', () => {
        let s = registerFamily(emptyFamilyRegistryState(), family());
        s = registerFamily(s, family({
            identity: identity({ id: 'family/com.pryzm.core/desk-2' }),
        }));
        s = unregisterFamily(s, 'family/com.pryzm.core/desk');
        expect(s.byCategory['desks']).toEqual(['family/com.pryzm.core/desk-2']);
    });

    it('returns the input state unchanged on unknown id', () => {
        const s = registerFamily(emptyFamilyRegistryState(), family());
        const after = unregisterFamily(s, 'family/unknown/nope');
        expect(after).toBe(s);
    });

    it('does NOT mutate frozen input state', () => {
        let s = registerFamily(emptyFamilyRegistryState(), family());
        Object.freeze(s);
        Object.freeze(s.byId);
        Object.freeze(s.byCategory);
        Object.freeze(s.byCategory['desks']);
        Object.freeze(s.byMountClass);
        Object.freeze(s.byMountClass['floor']);
        Object.freeze(s.byTag);
        for (const k of Object.keys(s.byTag)) Object.freeze(s.byTag[k]);
        Object.freeze(s.byOccupancy);
        for (const k of Object.keys(s.byOccupancy)) Object.freeze(s.byOccupancy[k]);
        expect(() => unregisterFamily(s, 'family/com.pryzm.core/desk')).not.toThrow();
    });
});

// ── Query helpers ──────────────────────────────────────────────────────────

describe('findById', () => {
    it('resolves a registered family', () => {
        const s = registerFamily(emptyFamilyRegistryState(), family());
        expect(findById(s, 'family/com.pryzm.core/desk')?.identity.name).toBe('Desk');
    });
    it('returns undefined for unknown id', () => {
        const s = emptyFamilyRegistryState();
        expect(findById(s, 'family/unknown/nope')).toBeUndefined();
    });
});

describe('findByCategory', () => {
    it('returns only families in that category', () => {
        let s = registerFamily(emptyFamilyRegistryState(), family());
        s = registerFamily(s, family({
            identity: identity({ id: 'family/com.pryzm.core/sofa', name: 'Sofa' }),
            category: 'sofas',
            archetypeHints: [{ occupancy: 'living', anchor: 'wall-longest' }],
            tags: ['lounge'],
        }));
        const desks = findByCategory(s, 'desks');
        const sofas = findByCategory(s, 'sofas');
        expect(desks.map(f => f.identity.id)).toEqual(['family/com.pryzm.core/desk']);
        expect(sofas.map(f => f.identity.id)).toEqual(['family/com.pryzm.core/sofa']);
    });

    it('returns [] for an unknown category', () => {
        expect(findByCategory(emptyFamilyRegistryState(), 'nothing')).toEqual([]);
    });
});

describe('findByOccupancy', () => {
    it('returns families whose archetype hints contain the occupancy', () => {
        let s = registerFamily(emptyFamilyRegistryState(), family());  // study + bedroom
        s = registerFamily(s, family({
            identity: identity({ id: 'family/com.pryzm.core/sofa' }),
            category: 'sofas',
            archetypeHints: [{ occupancy: 'living', anchor: 'wall-longest' }],
        }));
        expect(findByOccupancy(s, 'study').map(f => f.identity.id))
            .toEqual(['family/com.pryzm.core/desk']);
        expect(findByOccupancy(s, 'living').map(f => f.identity.id))
            .toEqual(['family/com.pryzm.core/sofa']);
        expect(findByOccupancy(s, 'bedroom').map(f => f.identity.id))
            .toEqual(['family/com.pryzm.core/desk']);
    });

    it('returns [] for an unknown occupancy', () => {
        expect(findByOccupancy(emptyFamilyRegistryState(), 'unknown')).toEqual([]);
    });
});

describe('findByMountClass', () => {
    it('returns only families with the given mount class', () => {
        let s = registerFamily(emptyFamilyRegistryState(), family());                  // floor
        s = registerFamily(s, family({
            identity: identity({ id: 'family/com.pryzm.core/pendant' }),
            category: 'lights',
            mountClass: 'ceiling',
            archetypeHints: [{ occupancy: 'living', anchor: 'center' }],
            tags: [],
        }));
        const floors = findByMountClass(s, 'floor');
        const ceilings = findByMountClass(s, 'ceiling');
        expect(floors.map(f => f.identity.id)).toEqual(['family/com.pryzm.core/desk']);
        expect(ceilings.map(f => f.identity.id)).toEqual(['family/com.pryzm.core/pendant']);
    });

    it('returns [] when no family has that mount class', () => {
        expect(findByMountClass(emptyFamilyRegistryState(), 'embedded')).toEqual([]);
    });
});

describe('findByTag', () => {
    it('returns families tagged with the given tag', () => {
        const s = registerFamily(emptyFamilyRegistryState(), family());
        expect(findByTag(s, 'workstation').map(f => f.identity.id))
            .toEqual(['family/com.pryzm.core/desk']);
        expect(findByTag(s, 'office').map(f => f.identity.id))
            .toEqual(['family/com.pryzm.core/desk']);
    });

    it('returns [] for an unknown tag', () => {
        expect(findByTag(emptyFamilyRegistryState(), 'nope')).toEqual([]);
    });

    it('skips dangling secondary-index ids defensively', () => {
        // Hand-craft a state with a dangling id in byTag — exercises the
        // resolve() guard.  (Real workflows never hit this; the helpers
        // maintain invariant 1.  We still verify the defensive branch.)
        const s = {
            ...emptyFamilyRegistryState(),
            byTag: { 'orphan': ['family/missing/id'] },
        };
        expect(findByTag(s, 'orphan')).toEqual([]);
    });
});

// ── Round-trip ─────────────────────────────────────────────────────────────

describe('round-trip', () => {
    it('FamilyRegistryStateSchema.parse(serialize(state)) === state', () => {
        const s = registerFamily(emptyFamilyRegistryState(), family());
        const parsed = FamilyRegistryStateSchema.parse(JSON.parse(JSON.stringify(s)));
        expect(parsed).toEqual(s);
    });
});
