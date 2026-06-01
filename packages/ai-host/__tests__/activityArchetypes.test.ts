// F4.1 — Activity-archetype data model tests (S1 Media Wall).
//
// Validates the activity-archetype substrate shipped in
// packages/ai-host/src/workflows/furnishLayout/activityArchetypes.ts
// per APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F4.1 / §Z.10.

import { describe, expect, it } from 'vitest';
import {
    ACTIVITY_ARCHETYPES,
    ENTRY_STORAGE,
    MEDIA_WALL,
    activityMembersAsFurnitureRequests,
    getActivityArchetype,
    type ActivityArchetype,
    type ActivitySystemKind,
} from '../src/workflows/furnishLayout/activityArchetypes.js';
import { archetypeFor } from '../src/workflows/furnishLayout/archetypes.js';

describe('F4.1 — MEDIA_WALL archetype (S1)', () => {
    it('has id "media-wall"', () => {
        expect(MEDIA_WALL.id).toBe('media-wall');
    });

    it('has tv as primary, required member', () => {
        const tv = MEDIA_WALL.members.find((m) => m.kind === 'tv');
        expect(tv).toBeDefined();
        expect(tv?.role).toBe('primary');
        expect(tv?.required).toBe(true);
    });

    it('has tv_unit as anchor, required member', () => {
        const tvUnit = MEDIA_WALL.members.find((m) => m.kind === 'tv_unit');
        expect(tvUnit).toBeDefined();
        expect(tvUnit?.role).toBe('anchor');
        expect(tvUnit?.required).toBe(true);
        expect(tvUnit?.relPositionHint).toBe('below');
    });

    it('has bookshelf as optional companion (flanking shelving)', () => {
        const shelf = MEDIA_WALL.members.find((m) => m.kind === 'bookshelf');
        expect(shelf).toBeDefined();
        expect(shelf?.role).toBe('companion');
        expect(shelf?.required).toBe(false);
        expect(shelf?.relPositionHint).toBe('beside');
    });

    it('has wall_art as optional companion (above)', () => {
        const art = MEDIA_WALL.members.find((m) => m.kind === 'wall_art');
        expect(art).toBeDefined();
        expect(art?.role).toBe('companion');
        expect(art?.required).toBe(false);
        expect(art?.relPositionHint).toBe('above');
    });

    it('anchor strategy is wall-opposite-sofa', () => {
        expect(MEDIA_WALL.anchor).toEqual({
            strategy: 'wall-opposite-room-feature',
            feature: 'sofa',
        });
    });

    it('minAreaM2 = 12 m² (small living minimum)', () => {
        expect(MEDIA_WALL.minAreaM2).toBe(12);
    });

    it('maxAreaM2 = 60 m² (large-living soft ceiling)', () => {
        expect(MEDIA_WALL.maxAreaM2).toBe(60);
    });

    it('exposes a human-readable label and description', () => {
        expect(MEDIA_WALL.label).toBe('TV / Media Wall');
        expect(MEDIA_WALL.description).toMatch(/TV/);
        expect(MEDIA_WALL.description.length).toBeGreaterThan(20);
    });

    it('every member has a role field', () => {
        for (const m of MEDIA_WALL.members) {
            expect(['primary', 'anchor', 'companion', 'optional']).toContain(m.role);
        }
    });

    it('member kinds are non-empty strings (FurnitureKind shape sanity)', () => {
        for (const m of MEDIA_WALL.members) {
            expect(typeof m.kind).toBe('string');
            expect(m.kind.length).toBeGreaterThan(0);
        }
    });
});

describe('F4.1 — getActivityArchetype lookup', () => {
    it('returns MEDIA_WALL for "media-wall"', () => {
        expect(getActivityArchetype('media-wall')).toBe(MEDIA_WALL);
    });

    it('returns undefined for unrealized stubs', () => {
        const stubs: ActivitySystemKind[] = [
            'study-workstation',
            'bathroom-vanity',
            'utility-laundry',
            'bedroom-dressing',
            'window-dressing',
        ];
        for (const k of stubs) {
            expect(getActivityArchetype(k)).toBeUndefined();
        }
    });
});

describe('F4.1 — ACTIVITY_ARCHETYPES registry', () => {
    it('has MEDIA_WALL under "media-wall" key', () => {
        expect(ACTIVITY_ARCHETYPES['media-wall']).toBe(MEDIA_WALL);
    });

    it('has no entries for unrealized stubs (yet)', () => {
        expect(ACTIVITY_ARCHETYPES['study-workstation']).toBeUndefined();
        expect(ACTIVITY_ARCHETYPES['bathroom-vanity']).toBeUndefined();
    });
});

describe('F4.1 — activityMembersAsFurnitureRequests', () => {
    it('default opts returns ONLY required members (tv + tv_unit)', () => {
        const reqs = activityMembersAsFurnitureRequests(MEDIA_WALL);
        expect(reqs).toHaveLength(2);
        expect(reqs.map((r) => r.kind).sort()).toEqual(['tv', 'tv_unit']);
        for (const r of reqs) expect(r.required).toBe(true);
    });

    it('includeOptional:true returns all 4 members', () => {
        const reqs = activityMembersAsFurnitureRequests(MEDIA_WALL, { includeOptional: true });
        expect(reqs).toHaveLength(4);
        expect(reqs.map((r) => r.kind).sort()).toEqual(
            ['bookshelf', 'tv', 'tv_unit', 'wall_art'],
        );
    });

    it('preserves required flag on each request', () => {
        const reqs = activityMembersAsFurnitureRequests(MEDIA_WALL, { includeOptional: true });
        const tv = reqs.find((r) => r.kind === 'tv');
        const art = reqs.find((r) => r.kind === 'wall_art');
        expect(tv?.required).toBe(true);
        expect(art?.required).toBe(false);
    });

    it('handles an archetype with only optional members (synthetic)', () => {
        const optionalOnly: ActivityArchetype = {
            id: 'window-dressing',
            label: 'X',
            description: 'X',
            members: [{ kind: 'curtain_rod', role: 'optional', required: false }],
            anchor: { strategy: 'window-wall' },
        };
        expect(activityMembersAsFurnitureRequests(optionalOnly)).toHaveLength(0);
        expect(
            activityMembersAsFurnitureRequests(optionalOnly, { includeOptional: true }),
        ).toHaveLength(1);
    });

    it('round-trip: required-only list contains tv and tv_unit', () => {
        const reqs = activityMembersAsFurnitureRequests(MEDIA_WALL);
        const kinds = new Set(reqs.map((r) => r.kind));
        expect(kinds.has('tv')).toBe(true);
        expect(kinds.has('tv_unit')).toBe(true);
        expect(kinds.has('bookshelf')).toBe(false);
        expect(kinds.has('wall_art')).toBe(false);
    });
});

describe('F4.2 — ENTRY_STORAGE archetype (S2)', () => {
    it('has id "entry-storage"', () => {
        expect(ENTRY_STORAGE.id).toBe('entry-storage');
    });

    it('has shoe_cabinet as anchor, required member', () => {
        const shoe = ENTRY_STORAGE.members.find((m) => m.kind === 'shoe_cabinet');
        expect(shoe).toBeDefined();
        expect(shoe?.role).toBe('anchor');
        expect(shoe?.required).toBe(true);
    });

    it('has console_table as primary, required member', () => {
        const console_ = ENTRY_STORAGE.members.find((m) => m.kind === 'console_table');
        expect(console_).toBeDefined();
        expect(console_?.role).toBe('primary');
        expect(console_?.required).toBe(true);
        expect(console_?.relPositionHint).toBe('beside');
    });

    it('has coat_rack as companion, REQUIRED (architecturally non-optional in halls)', () => {
        const coat = ENTRY_STORAGE.members.find((m) => m.kind === 'coat_rack');
        expect(coat).toBeDefined();
        expect(coat?.role).toBe('companion');
        expect(coat?.required).toBe(true);
        expect(coat?.relPositionHint).toBe('beside');
    });

    it('has entry_bench as companion, NOT required (optional — width-permitting)', () => {
        const bench = ENTRY_STORAGE.members.find((m) => m.kind === 'entry_bench');
        expect(bench).toBeDefined();
        expect(bench?.role).toBe('companion');
        expect(bench?.required).toBe(false);
        expect(bench?.relPositionHint).toBe('beside');
    });

    it('has wall_mirror as optional, NOT required', () => {
        const mirror = ENTRY_STORAGE.members.find((m) => m.kind === 'wall_mirror');
        expect(mirror).toBeDefined();
        expect(mirror?.role).toBe('optional');
        expect(mirror?.required).toBe(false);
        expect(mirror?.relPositionHint).toBe('above');
    });

    it('anchor strategy is longest-free-wall', () => {
        expect(ENTRY_STORAGE.anchor).toEqual({ strategy: 'longest-free-wall' });
    });

    it('minAreaM2 = 3 m² and maxAreaM2 = 20 m²', () => {
        expect(ENTRY_STORAGE.minAreaM2).toBe(3);
        expect(ENTRY_STORAGE.maxAreaM2).toBe(20);
    });

    it('exposes a human-readable label and description', () => {
        expect(ENTRY_STORAGE.label).toBe('Entry Storage');
        expect(ENTRY_STORAGE.description.length).toBeGreaterThan(20);
        expect(ENTRY_STORAGE.description).toMatch(/shoe|console|coat|hall/i);
    });

    it('every member has a role drawn from the allowed set', () => {
        for (const m of ENTRY_STORAGE.members) {
            expect(['primary', 'anchor', 'companion', 'optional']).toContain(m.role);
        }
    });

    it('member kinds are non-empty strings (FurnitureKind shape sanity)', () => {
        for (const m of ENTRY_STORAGE.members) {
            expect(typeof m.kind).toBe('string');
            expect(m.kind.length).toBeGreaterThan(0);
        }
    });

    it('getActivityArchetype("entry-storage") returns ENTRY_STORAGE', () => {
        expect(getActivityArchetype('entry-storage')).toBe(ENTRY_STORAGE);
    });

    it('ACTIVITY_ARCHETYPES["entry-storage"] === ENTRY_STORAGE', () => {
        expect(ACTIVITY_ARCHETYPES['entry-storage']).toBe(ENTRY_STORAGE);
    });

    it('activityMembersAsFurnitureRequests returns 3 required members (shoe_cabinet, console_table, coat_rack)', () => {
        const reqs = activityMembersAsFurnitureRequests(ENTRY_STORAGE);
        expect(reqs).toHaveLength(3);
        expect(reqs.map((r) => r.kind).sort()).toEqual(
            ['coat_rack', 'console_table', 'shoe_cabinet'],
        );
        for (const r of reqs) expect(r.required).toBe(true);
    });

    it('activityMembersAsFurnitureRequests includeOptional:true returns all 5', () => {
        const reqs = activityMembersAsFurnitureRequests(ENTRY_STORAGE, { includeOptional: true });
        expect(reqs).toHaveLength(5);
        expect(reqs.map((r) => r.kind).sort()).toEqual(
            ['coat_rack', 'console_table', 'entry_bench', 'shoe_cabinet', 'wall_mirror'],
        );
    });

    it('ENTRY_STORAGE is a distinct registry entry from MEDIA_WALL', () => {
        // Identity check — confirms the registry holds two distinct archetypes,
        // not a single shared reference accidentally aliased under two keys.
        expect(ENTRY_STORAGE).not.toBe(MEDIA_WALL);
        expect(ACTIVITY_ARCHETYPES['entry-storage']).not.toBe(ACTIVITY_ARCHETYPES['media-wall']);
        expect(ENTRY_STORAGE.id).not.toBe(MEDIA_WALL.id);
    });

    it('the entrance-lobby room archetype self-declares activitySystems: ["entry-storage"]', () => {
        const lobby = archetypeFor('entrance-lobby');
        expect(lobby).not.toBeNull();
        expect(lobby?.activitySystems).toBeDefined();
        expect(lobby?.activitySystems).toEqual(['entry-storage']);
    });
});
