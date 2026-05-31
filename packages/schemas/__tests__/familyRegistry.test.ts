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
    // from-pipeline (Stage-5 assembler)
    assembleRegisteredFamily,
} from '../src/family-registry/index.js';
// `import type` is REQUIRED here: the runtime barrels for family-parametric /
// family-geometry / family-schemas are NOT loaded by this test file (they
// transitively pull the in-flight Stage-3 synthesiser's primitive substrate
// — a sister slice — which is outside this test's blast radius).  Stage-5
// only consumes the four shapes structurally; types are erased at compile time.
import type { FamilyDefinition } from '../src/family-definition/definition.js';
import type { ParametricFamily } from '../src/family-parametric/family.js';
import type { GeneratedGeometry } from '../src/family-geometry/generated.js';
import type { GeneratedSchemas } from '../src/family-schemas/generated.js';

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

// ── assembleRegisteredFamily (Stage-5 transformer) ─────────────────────────

const PIPELINE_ID = 'family/com.pryzm.core/desk' as const;

const makeDefinition = (
    overrides: { id?: string; semanticNames?: string[]; mountClass?: 'floor' | 'wall' | 'ceiling' | 'embedded' } = {},
): FamilyDefinition => ({
    identity: {
        id:      overrides.id ?? PIPELINE_ID,
        name:    'Desk',
        version: '1.0.0',
        author:  'PRYZM',
        license: 'MIT',
    },
    documentation: {
        pdfs: [], specSheets: [], referenceImages: [],
    },
    geometry: {
        dimensions:         { widthM: 1, depthM: 0.6, heightM: 0.75 },
        parametricRanges:   [],
        hostedRelationship: { hostKind: 'none' },
    },
    behaviour: {
        movable:    true,
        hosted:     false,
        mountClass: overrides.mountClass ?? 'floor',
    },
    constraints: {
        excludeWallTypes: [],
    },
    placement: {
        defaultAnchor:  'wall-window',
        allowedAnchors: [],
        excludedWalls:  [],
    },
    bim: {
        entityType:     'IfcFurniture',
        predefinedType: 'TABLE',
        psets:          ['Pset_FurnitureTypeCommon'],
    },
    ai: {
        semanticNames:  overrides.semanticNames ?? ['desk', 'workstation'],
        synonyms:       [],
        cuesForPrompts: [],
    },
    derived: {
        canonicalSemanticNames: ['desk', 'workstation'],
        volumeM3:               0.45,
        footprintAreaM2:        0.6,
        canonicalHash:          'canonical:desk@v1',
        ingestedAt:             '2026-01-01T00:00:00.000Z',
    },
});

const makePipelineParametric = (id: string = PIPELINE_ID): ParametricFamily => ({
    identity: {
        id, name: 'Desk', version: '1.0.0', author: 'PRYZM', license: 'MIT',
    },
    parameters: {},
    primitives: [
        {
            id:           'box-0',
            kind:         'box',
            dimensions:   { boxWidth: 1, boxDepth: 0.6, boxHeight: 0.75 },
            transform:    {
                translate: { x: 0, y: 0, z: 0 },
                rotateDeg: { x: 0, y: 0, z: 0 },
                scale:     { x: 1, y: 1, z: 1 },
            },
            materialSlot: 'default',
        },
    ],
    parametricHash: 'parametric:desk@v1',
    decomposedAt:   '2026-01-01T00:00:00.000Z',
});

const makePipelineGeometry = (id: string = PIPELINE_ID): GeneratedGeometry => ({
    identity: {
        id, name: 'Desk', version: '1.0.0', author: 'PRYZM', license: 'MIT',
    },
    builder: {
        kind:        'parametric',
        modulePath:  '@pryzm/family-builders/desk.js',
        exportName:  'buildDesk',
        builderHash: 'builder:desk@v1',
    },
    planSymbol: {
        kind:       'parametric',
        modulePath: '@pryzm/family-plan-symbols/desk.js',
        exportName: 'deskSymbol',
        bboxMinX:   -0.5,
        bboxMinY:   -0.3,
        bboxMaxX:    0.5,
        bboxMaxY:    0.3,
    },
    footprint: {
        lengthM:          1,
        depthM:           0.6,
        clearFrontM:      0,
        clearSideM:       0,
        clearBackM:       0,
        clearAboveM:      0,
        excludeDoorSwing: false,
    },
    geometryHash:  'geometry:desk@v1',
    synthesisedAt: '2026-01-01T00:00:00.000Z',
});

const makePipelineSchemas = (id: string = PIPELINE_ID): GeneratedSchemas => ({
    identity: {
        id, name: 'Desk', version: '1.0.0', author: 'PRYZM', license: 'MIT',
    },
    instanceSchema: {
        parameters: [],
        specHash:   'spec:desk@v1',
    },
    commandPayloads: {
        create: { command: 'create', parameters: [], payloadHash: 'create:desk@v1' },
        update: { command: 'update', parameters: [], payloadHash: 'update:desk@v1' },
        remove: { command: 'remove', parameters: [], payloadHash: 'remove:desk@v1' },
    },
    schemasHash:   'schemas:desk@v1',
    synthesisedAt: '2026-01-01T00:00:00.000Z',
});

describe('assembleRegisteredFamily', () => {
    it('produces a valid RegisteredFamily that round-trips through the schema', () => {
        const out = assembleRegisteredFamily(
            makeDefinition(),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        const parsed = RegisteredFamilySchema.safeParse(out);
        expect(parsed.success).toBe(true);
    });

    it('throws when parametric identity id mismatches the definition', () => {
        expect(() => assembleRegisteredFamily(
            makeDefinition(),
            makePipelineParametric('family/other/wrong'),
            makePipelineGeometry(),
            makePipelineSchemas(),
        )).toThrow(/identity mismatch/);
    });

    it('throws when geometry identity id mismatches the definition', () => {
        expect(() => assembleRegisteredFamily(
            makeDefinition(),
            makePipelineParametric(),
            makePipelineGeometry('family/other/wrong'),
            makePipelineSchemas(),
        )).toThrow(/geometry.identity.id \(family\/other\/wrong\)/);
    });

    it('throws when schemas identity id mismatches the definition', () => {
        expect(() => assembleRegisteredFamily(
            makeDefinition(),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas('family/other/wrong'),
        )).toThrow(/schemas.identity.id \(family\/other\/wrong\)/);
    });

    it("defaults origin to 'user'", () => {
        const out = assembleRegisteredFamily(
            makeDefinition(),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        expect(out.origin).toBe('user');
    });

    it('propagates opts.origin', () => {
        const out = assembleRegisteredFamily(
            makeDefinition(),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
            { origin: 'core' },
        );
        expect(out.origin).toBe('core');
    });

    it("defaults category to 'general' for v1", () => {
        const out = assembleRegisteredFamily(
            makeDefinition(),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        expect(out.category).toBe('general');
    });

    it('propagates opts.category', () => {
        const out = assembleRegisteredFamily(
            makeDefinition(),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
            { category: 'desks' },
        );
        expect(out.category).toBe('desks');
    });

    it('mountClass matches definition.behaviour.mountClass', () => {
        const out = assembleRegisteredFamily(
            makeDefinition({ mountClass: 'wall' }),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        expect(out.mountClass).toBe('wall');
    });

    it('ifcMapping passes through the definition.bim by REFERENCE', () => {
        const def = makeDefinition();
        const out = assembleRegisteredFamily(
            def,
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        expect(out.ifcMapping).toBe(def.bim);
    });

    it('archetypeHints has length 1 in v1', () => {
        const out = assembleRegisteredFamily(
            makeDefinition(),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        expect(out.archetypeHints).toHaveLength(1);
    });

    it('archetypeHints[0].anchor === definition.placement.defaultAnchor', () => {
        const out = assembleRegisteredFamily(
            makeDefinition(),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        expect(out.archetypeHints[0]!.anchor).toBe('wall-window');
    });

    it('archetypeHints[0].occupancy is derived from semantic names when one matches', () => {
        const out = assembleRegisteredFamily(
            makeDefinition({ semanticNames: ['queen bed', 'bedroom'] }),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        expect(out.archetypeHints[0]!.occupancy).toBe('bedroom');
    });

    it("archetypeHints[0].occupancy normalises 'Living Room' → 'living_room'", () => {
        const out = assembleRegisteredFamily(
            makeDefinition({ semanticNames: ['Living Room', 'sofa'] }),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        expect(out.archetypeHints[0]!.occupancy).toBe('living_room');
    });

    it("archetypeHints[0].occupancy falls back to 'general' when no semantic match", () => {
        const out = assembleRegisteredFamily(
            makeDefinition({ semanticNames: ['desk', 'workstation', 'flat-pack'] }),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        expect(out.archetypeHints[0]!.occupancy).toBe('general');
    });

    it('schemaHash is deterministic — same input → same output', () => {
        const def = makeDefinition();
        const p = makePipelineParametric();
        const g = makePipelineGeometry();
        const s = makePipelineSchemas();
        const a = assembleRegisteredFamily(def, p, g, s);
        const b = assembleRegisteredFamily(def, p, g, s);
        expect(a.schemaHash).toBe(b.schemaHash);
    });

    it('schemaHash CHANGES when the parametric hash changes', () => {
        const def = makeDefinition();
        const p1 = makePipelineParametric();
        const p2 = { ...makePipelineParametric(), parametricHash: 'parametric:desk@v2' };
        const a = assembleRegisteredFamily(def, p1, makePipelineGeometry(), makePipelineSchemas());
        const b = assembleRegisteredFamily(def, p2, makePipelineGeometry(), makePipelineSchemas());
        expect(a.schemaHash).not.toBe(b.schemaHash);
    });

    it('schemaHash CHANGES when the geometry hash changes', () => {
        const def = makeDefinition();
        const g2 = { ...makePipelineGeometry(), geometryHash: 'geometry:desk@v2' };
        const a = assembleRegisteredFamily(def, makePipelineParametric(), makePipelineGeometry(), makePipelineSchemas());
        const b = assembleRegisteredFamily(def, makePipelineParametric(), g2, makePipelineSchemas());
        expect(a.schemaHash).not.toBe(b.schemaHash);
    });

    it('schemaHash CHANGES when the schemas hash changes', () => {
        const def = makeDefinition();
        const s2 = { ...makePipelineSchemas(), schemasHash: 'schemas:desk@v2' };
        const a = assembleRegisteredFamily(def, makePipelineParametric(), makePipelineGeometry(), makePipelineSchemas());
        const b = assembleRegisteredFamily(def, makePipelineParametric(), makePipelineGeometry(), s2);
        expect(a.schemaHash).not.toBe(b.schemaHash);
    });

    it('tags include lower-cased semantic names + mountClass + derived occupancy', () => {
        const out = assembleRegisteredFamily(
            makeDefinition({ semanticNames: ['Bed', 'Bedroom'], mountClass: 'floor' }),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        expect(out.tags).toContain('bed');
        expect(out.tags).toContain('bedroom');
        expect(out.tags).toContain('floor');
    });

    it('tags drop empty / whitespace-only semantic names defensively', () => {
        // Exercises the `trimmed.length > 0` branch in deriveTags — the
        // Zod schema for `semanticNames` is `z.array(z.string()).min(1)`,
        // which permits an empty entry in the array.  Stage-5 should be
        // robust against such upstream slop.
        const out = assembleRegisteredFamily(
            makeDefinition({ semanticNames: ['desk', '', '   '] }),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        expect(out.tags).not.toContain('');
        expect(out.tags).toContain('desk');
    });

    it('tags are sorted + deduped', () => {
        const out = assembleRegisteredFamily(
            // 'bedroom' appears in semantic names AND becomes the occupancy →
            // forces the de-dup branch.  'B' / 'b' force the lower-case branch.
            makeDefinition({ semanticNames: ['bedroom', 'B', 'b'], mountClass: 'floor' }),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        const sorted = [...out.tags].sort();
        expect(out.tags).toEqual(sorted);
        const set = new Set(out.tags);
        expect(set.size).toBe(out.tags.length);
    });

    it('opts.tags overrides + are sorted / deduped / lower-cased', () => {
        const out = assembleRegisteredFamily(
            makeDefinition(),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
            { tags: ['Office', 'office', 'Workstation', '', '  '] },
        );
        // Empty-string + all-whitespace entries are dropped; case-collisions
        // collapse to a single canonical tag.
        expect(out.tags).toEqual(['office', 'workstation']);
    });

    it('is pure — same input twice yields a deeply-equal output', () => {
        const def = makeDefinition();
        const p = makePipelineParametric();
        const g = makePipelineGeometry();
        const s = makePipelineSchemas();
        const a = assembleRegisteredFamily(def, p, g, s);
        const b = assembleRegisteredFamily(def, p, g, s);
        expect(a).toEqual(b);
    });

    it('output.identity === definition.identity by reference', () => {
        const def = makeDefinition();
        const out = assembleRegisteredFamily(
            def,
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
        );
        expect(out.identity).toBe(def.identity);
    });

    it('round-trips through the RegisteredFamilySchema via JSON', () => {
        const out = assembleRegisteredFamily(
            makeDefinition(),
            makePipelineParametric(),
            makePipelineGeometry(),
            makePipelineSchemas(),
            { category: 'desks', tags: ['office'] },
        );
        const round = RegisteredFamilySchema.parse(JSON.parse(JSON.stringify(out)));
        expect(round).toEqual(out);
    });
});
