// D-FLE × Program Rules — the furniture archetypes must SATISFY the rules database.
// Contract: SPEC-ARCHITECTURAL-PROGRAM-RULES §program. The rules DB is the single
// source of truth for WHAT each room must contain; the archetypes add placement.
// This test pins them consistent so the two never drift (e.g. the user's rule that
// a bedroom requires bed + 2 bedside tables + lighting + a wardrobe).
//
// §FURNITURE-SPEC (2026-05-28): the rules DB now also carries door-vector-aware
// placement metadata (sizes mm, clearances mm, placementRule, exclusion flags).
// This test pins those specs against the D-FLE archetype kinds + footprint
// dimensions so the two sources cannot drift while D-FLE migration is in flight.

import { describe, expect, it } from 'vitest';
import { archetypeFor, FURNISHABLE_OCCUPANCIES } from '../src/workflows/furnishLayout/archetypes.js';
import { footprintOf } from '../src/workflows/furnishLayout/footprints.js';
import {
    ROOM_RULES,
    furnitureSpecsFor,
    programForOccupancy,
} from '../src/workflows/apartmentLayout/rules/programRules.js';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import type { FurnitureKind } from '../src/workflows/furnishLayout/types.js';
import type { FurnishRoomInput, Pt } from '../src/workflows/furnishLayout/types.js';

describe('furniture archetypes satisfy the rules database', () => {
    it('every archetype contains all DB-required furniture kinds for its occupancy', () => {
        for (const occ of FURNISHABLE_OCCUPANCIES) {
            const archetype = archetypeFor(occ);
            const kinds = new Set((archetype?.items ?? []).map(i => i.kind));
            const required = programForOccupancy(occ).required;
            for (const k of required) {
                expect(kinds.has(k as never), `${occ} archetype is missing required '${k}'`).toBe(true);
            }
        }
    });

    it('bedroom archetype: bed + 2 bedside tables + lighting + wardrobe', () => {
        const a = archetypeFor('bedroom')!;
        const bed = a.items.find(i => i.kind === 'bed');
        const bedside = a.items.find(i => i.kind === 'bedside_table');
        const wardrobe = a.items.find(i => i.kind === 'wardrobe');
        const lamp = a.items.find(i => i.kind === 'lamp');
        expect(bed).toBeDefined();
        expect(bedside?.count).toBe(2);
        expect(wardrobe).toBeDefined();
        expect(lamp).toBeDefined();
    });
});

describe('§FURNITURE-SPEC ↔ D-FLE — pin specs against the footprint catalogue', () => {
    it('every furnitureSpec kind has a matching D-FLE footprint with identical dimensions', () => {
        for (const rule of Object.values(ROOM_RULES)) {
            for (const spec of rule.furnitureSpec) {
                const fp = footprintOf(spec.kind as FurnitureKind);
                expect(fp, `${rule.type}.${spec.kind} has no D-FLE footprint`).toBeDefined();
                // Specs are in mm; footprints in m. ×1000 with float tolerance.
                expect(Math.round(fp.w * 1000), `${rule.type}.${spec.kind} sizeW (mm)`).toBe(spec.sizeW);
                expect(Math.round(fp.l * 1000), `${rule.type}.${spec.kind} sizeD (mm)`).toBe(spec.sizeD);
                expect(Math.round(fp.clearFront * 1000), `${rule.type}.${spec.kind} clearFoot (mm)`).toBe(spec.clearFoot);
                expect(Math.round(fp.clearSides * 1000), `${rule.type}.${spec.kind} clearSide (mm)`).toBe(spec.clearSide);
            }
        }
    });

    it('furnitureSpec includes every requiredFurniture kind for every room', () => {
        for (const rule of Object.values(ROOM_RULES)) {
            const specKinds = new Set(rule.furnitureSpec.map(s => s.kind));
            for (const k of rule.requiredFurniture) {
                expect(specKinds.has(k), `${rule.type}.furnitureSpec missing required '${k}'`).toBe(true);
            }
            // Every spec marked `required: true` must appear in requiredFurniture
            // (the spec is the architect's truth — required-here means required-everywhere).
            for (const s of rule.furnitureSpec) {
                if (s.required) {
                    expect(rule.requiredFurniture.includes(s.kind), `${rule.type}: spec.${s.kind} is required but missing from requiredFurniture`).toBe(true);
                }
            }
        }
    });

    it('bedroom spec is door-vector-aware: bed opposite_door, wardrobe excludes window wall', () => {
        // Architect's interactive plan database: bed is anchored opposite the
        // door, the wardrobe goes on the longest free wall but NEVER on the
        // window wall (tall furniture blocks daylight).
        const bedroom = furnitureSpecsFor('bedroom');
        const bed = bedroom.find(s => s.kind === 'bed')!;
        const wardrobe = bedroom.find(s => s.kind === 'wardrobe')!;
        const bedside = bedroom.find(s => s.kind === 'bedside_table')!;

        expect(bed.placementRule).toBe('opposite_door');
        expect(bed.excludeDoorSwing).toBe(true);
        expect(bed.excludeWindowWall).toBe(true);

        expect(wardrobe.placementRule).toBe('longest_wall');
        expect(wardrobe.excludeDoorSwing).toBe(true);
        expect(wardrobe.excludeWindowWall).toBe(true);

        expect(bedside.placementRule).toBe('flank_group');
        expect(bedside.group).toBe('bed');
        expect(bedside.count).toBe(2);
    });
});

// F4 follow-up (2026-05-31) — activity-group + curtain wiring follow-ons.
// (1) towel_rail joins the bathroom 'vanity' group.
// (2) bedroom dressing — dresser + vanity_table share a 'dressing' group.
// (3) curtain_panel wired into every room WHERE PROGRAM-RULES SAYS A WINDOW
//     EXISTS (kitchen, dining, private-office); SKIPPED for bathroom / wc /
//     utility-room because programRules.{bathroom,wc,utility}.needsWindow is
//     false (those rooms get no exterior glazing → no curtain to wire).
describe('F4 activity-groups follow-ups', () => {
    it("(1) bathroom 'vanity' group includes towel_rail (not floating on a random wall)", () => {
        const items = archetypeFor('bathroom')!.items;
        const towel = items.find(i => i.kind === 'towel_rail');
        expect(towel).toBeDefined();
        expect(towel!.group).toBe('vanity');
        // vanity_unit + bathroom_mirror are the existing 'vanity'-group anchors;
        // pinning all three together prevents the group label from drifting away
        // from the basin cluster.
        const groupKinds = items.filter(i => i.group === 'vanity').map(i => i.kind);
        expect(groupKinds).toContain('vanity_unit');
        expect(groupKinds).toContain('bathroom_mirror');
        expect(groupKinds).toContain('towel_rail');
    });

    it("(2) 'dressing' group exists in the bedroom archetype and binds dresser + vanity_table", () => {
        const items = archetypeFor('bedroom')!.items;
        const dresser = items.find(i => i.kind === 'dresser');
        const vanityTable = items.find(i => i.kind === 'vanity_table');
        expect(dresser).toBeDefined();
        expect(vanityTable).toBeDefined();
        expect(dresser!.group).toBe('dressing');
        expect(vanityTable!.group).toBe('dressing');
        // The 'dressing' group is exclusively dresser + vanity_table — no other
        // bedroom item should leak in (the bed has its own 'bed' group, the
        // curtains 'curtains'). Pin the membership.
        const dressingKinds = new Set(items.filter(i => i.group === 'dressing').map(i => i.kind));
        expect(dressingKinds).toEqual(new Set(['dresser', 'vanity_table']));
    });

    it("(2) 'dressing' group also applies to the master bedroom (master uses the bedroom archetype)", () => {
        // D-FLE's FurnishableOccupancy union has ONE 'bedroom' archetype that
        // services both standard bedrooms and master bedrooms (no separate
        // 'master-bedroom' occupancy in this engine). The 'dressing' group
        // therefore applies to the master via the shared bedroom archetype.
        // Pin by re-asserting the group on the same archetype the master
        // resolves to.
        const items = archetypeFor('bedroom')!.items;
        const dressers = items.filter(i => i.group === 'dressing');
        expect(dressers.length).toBeGreaterThanOrEqual(2);
    });

    it('(3) curtain_panel wired in kitchen, dining-room, private-office (rooms WITH windows)', () => {
        // Map FurnishableOccupancy → canonical RoomType for programRules lookup.
        const TYPE_OF: Record<string, string> = {
            'kitchen': 'kitchen', 'dining-room': 'dining', 'private-office': 'study',
        };
        for (const occ of ['kitchen', 'dining-room', 'private-office'] as const) {
            const items = archetypeFor(occ)!.items;
            const rod = items.find(i => i.kind === 'curtain_rod');
            const panel = items.find(i => i.kind === 'curtain_panel');
            expect(rod, `${occ} archetype missing curtain_rod`).toBeDefined();
            expect(panel, `${occ} archetype missing curtain_panel`).toBeDefined();
            expect(rod!.group).toBe('curtains');
            expect(panel!.group).toBe('curtains');
            expect(panel!.count).toBe(2);
            // Pinch the program-rules contract: these rooms must have a window
            // for the curtain wiring to make sense. needsWindow gates wiring.
            const rule = ROOM_RULES[TYPE_OF[occ] as keyof typeof ROOM_RULES];
            expect(rule.needsWindow, `${occ} (program-type ${TYPE_OF[occ]}).needsWindow must be true for curtain wiring`).toBe(true);
        }
    });

    it('(3) curtain_panel NOT wired in bathroom / wc / utility-room (rooms WITHOUT windows per programRules)', () => {
        // Bathroom / wc / utility-room have needsWindow: false in the
        // programRules DB — there's no glazing, so curtains would attach to a
        // nonexistent window wall. The archetypes MUST stay curtain-free for
        // these three.
        const TYPE_OF: Record<string, string> = {
            'bathroom': 'bathroom', 'wc': 'wc', 'utility-room': 'utility',
        };
        for (const occ of ['bathroom', 'wc', 'utility-room'] as const) {
            const rule = ROOM_RULES[TYPE_OF[occ] as keyof typeof ROOM_RULES];
            expect(rule.needsWindow, `${occ} (program-type ${TYPE_OF[occ]}).needsWindow expected false`).toBe(false);
            const items = archetypeFor(occ)!.items;
            const kinds = items.map(i => i.kind);
            expect(kinds, `${occ} must NOT carry curtain_rod`).not.toContain('curtain_rod');
            expect(kinds, `${occ} must NOT carry curtain_panel`).not.toContain('curtain_panel');
        }
    });

    it('(3) curtain wiring follows the rod+panel(count:2) pattern in every PANEL-wired room', () => {
        // Pin the wiring shape: every curtain-PANEL-bearing archetype must use the
        // same canonical pair (rod on window wall + two panels flanking via
        // 'beside') so the engine treats them uniformly.
        // §bedroom-mirror (2026-06-11) — the BEDROOM dropped its curtain_panel in
        // favour of a wall_mirror (founder swap), so it is no longer panel-wired;
        // its rod-on-window-wall + wall_mirror×2 shape is covered separately below.
        const wired = ['living-room', 'kitchen', 'dining-room', 'private-office'] as const;
        for (const occ of wired) {
            const items = archetypeFor(occ)!.items;
            const rod = items.find(i => i.kind === 'curtain_rod')!;
            const panel = items.find(i => i.kind === 'curtain_panel')!;
            expect(rod.anchor, `${occ} curtain_rod anchor`).toBe('wall-window');
            expect(panel.anchor, `${occ} curtain_panel anchor`).toBe('beside');
            expect(panel.count, `${occ} curtain_panel count`).toBe(2);
        }
    });

    it('(3) bedroom: rod on the window wall + wall_mirror×2 (panel→mirror swap)', () => {
        // §bedroom-mirror — the bedroom keeps the rod but swapped the flanking
        // curtain panels for reflective wall_mirror panels.
        const items = archetypeFor('bedroom')!.items;
        const rod = items.find(i => i.kind === 'curtain_rod')!;
        const mirror = items.find(i => i.kind === 'wall_mirror' && i.group === 'curtains')!;
        expect(rod.anchor, 'bedroom curtain_rod anchor').toBe('wall-window');
        expect(items.some(i => i.kind === 'curtain_panel'), 'bedroom must NOT carry curtain_panel').toBe(false);
        expect(mirror.anchor, 'bedroom window-wall mirror anchor').toBe('beside');
        expect(mirror.count, 'bedroom window-wall mirror count').toBe(2);
    });
});

describe('furnishRoom places the bedroom program', () => {
    const bedroom = (w: number, d: number): FurnishRoomInput => {
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
        return {
            roomId: 'space-1', levelId: 'L0', occupancy: 'bedroom',
            polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
            walls: [
                { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },
                { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: false },
                { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },
                { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: false },
            ],
            doors: [{ type: 'door', center: { x: w / 2, z: d }, normal: { x: 0, z: -1 }, width: 0.9 }],
            windows: [], levelElevation: 0,
        };
    };

    it('a generous bedroom gets a bed, both bedside tables, a wardrobe and a lamp', () => {
        // Deeper-than-wide so the longest wall (the wardrobe wall) is NOT the bed wall
        // — both bedside tables then flank the bed head without colliding the wardrobe.
        const placed = furnishRoom(bedroom(3.6, 5.2));
        const kinds = placed.map(p => p.kind);
        // §67.2 (2026-06-11) — bed variety: the bedroom may carry the plain `bed`
        // OR an integrated variant bed (nordic_bed / solid_wood_bed).
        const isBed = (k: string): boolean => k === 'bed' || k === 'nordic_bed' || k === 'solid_wood_bed';
        expect(kinds.some(isBed)).toBe(true);
        expect(kinds.filter(k => k === 'bedside_table').length).toBe(2);
        expect(kinds).toContain('wardrobe');
        expect(kinds).toContain('lamp');
    });
});
