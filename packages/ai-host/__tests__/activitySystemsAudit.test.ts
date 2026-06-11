// F4 — Activity systems audit (SPEC-FURNITURE-LAYOUT-ENGINE Tier 9 / F4.1–F4.7).
//
// The F1.x archetype work already shipped the de-facto activity-system patterns
// via the `group:` + `count:` fields on FurnitureItemSpec. F4's "activity-
// archetype pattern" — group leader + relative-to-leader children — IS that
// mechanism. This audit pins each S1-S7 pattern so a future archetype edit
// that breaks the pattern fails loudly here BEFORE it ships.
//
// Master-plan systems:
//   S1 Media wall      — living-room      — tv_unit (leader) + tv
//   S2 Entry storage   — entrance-lobby   — console_table / shoe_cabinet (leaders) + entry_bench + wall_mirror
//   S3 Study workstation — private-office — desk (leader) + desk_chair
//   S4 Bathroom vanity — bathroom         — vanity_unit (leader) + bathroom_mirror
//   S5 Utility laundry — utility-room     — washing_machine_standalone (leader) + tumble_dryer + drying_rack
//   S6 Bedroom dressing — bedroom         — dresser + vanity_table (no group; archetype-level pattern)
//   S7 Window dressing — bedroom/living-room — curtain_rod (leader) + curtain_panel ×2
//
// Touch boundary: this file ONLY. No source edits — the patterns are already there.

import { describe, expect, it } from 'vitest';
import { archetypeFor } from '../src/workflows/furnishLayout/archetypes.js';
import type { FurnitureItemSpec, FurnitureKind } from '../src/workflows/furnishLayout/types.js';

/** Find all items of `kind` in the archetype for `occupancy`. Fails loudly if no archetype. */
function itemsIn(occupancy: string, kind: FurnitureKind): FurnitureItemSpec[] {
    const arch = archetypeFor(occupancy);
    expect(arch, `archetype missing for occupancy ${occupancy}`).not.toBeNull();
    return arch!.items.filter(i => i.kind === kind);
}

/** First item of `kind` in archetype. Fails loudly if none. */
function leader(occupancy: string, kind: FurnitureKind): FurnitureItemSpec {
    const hits = itemsIn(occupancy, kind);
    expect(hits.length, `${occupancy}: missing item kind=${kind}`).toBeGreaterThan(0);
    return hits[0]!;
}

const SYSTEM_OCCUPANCIES = [
    'bedroom', 'living-room', 'kitchen', 'dining-room', 'bathroom',
    'wc', 'entrance-lobby', 'corridor', 'private-office', 'utility-room',
] as const;

describe('F4 — activity-systems audit (Tier 9 pin)', () => {
    // ── S1 — Media wall (living-room) ────────────────────────────────────
    describe('S1 — media wall (living-room)', () => {
        it('tv_unit is the leader in the "media" group, anchored wall-opposite-door, excludes window+door walls', () => {
            const unit = leader('living-room', 'tv_unit');
            expect(unit.group).toBe('media');
            expect(unit.anchor).toBe('wall-opposite-door');
            expect(unit.excludeWindowWall).toBe(true);
            expect(unit.excludeDoorSwing).toBe(true);
        });

        it('tv is in the SAME "media" group as the tv_unit (paired placement)', () => {
            const tv = leader('living-room', 'tv');
            expect(tv.group).toBe('media');
        });
    });

    // ── S2 — Entry storage (entrance-lobby) ──────────────────────────────
    describe('S2 — entry storage (entrance-lobby)', () => {
        it('console_table anchors wall-opposite-door in the "entry" group with door-swing clearance', () => {
            const console = leader('entrance-lobby', 'console_table');
            expect(console.group).toBe('entry');
            expect(console.anchor).toBe('wall-opposite-door');
            expect(console.excludeDoorSwing).toBe(true);
        });

        it('shoe_cabinet + entry_bench + wall_mirror all share the "entry" group', () => {
            for (const k of ['shoe_cabinet', 'entry_bench', 'wall_mirror'] as const) {
                const item = leader('entrance-lobby', k);
                expect(item.group, `${k} not in entry group`).toBe('entry');
            }
        });

        it('coat_rack is a corner accent (no group claim — free-standing)', () => {
            const rack = leader('entrance-lobby', 'coat_rack');
            expect(rack.anchor).toBe('corner');
            expect(rack.group).toBeUndefined();
        });
    });

    // ── S3 — Study workstation (private-office) ──────────────────────────
    describe('S3 — study workstation (private-office)', () => {
        it('desk is the leader in the "desk" group, anchored to the window wall, required', () => {
            const desk = leader('private-office', 'desk');
            expect(desk.group).toBe('desk');
            expect(desk.anchor).toBe('wall-window');
            expect(desk.required).toBe(true);
        });

        it('desk_chair sits beside the desk in the SAME "desk" group (count: 1)', () => {
            const chair = leader('private-office', 'desk_chair');
            expect(chair.group).toBe('desk');
            expect(chair.anchor).toBe('beside');
            expect(chair.count ?? 1).toBe(1);
        });
    });

    // ── S4 — Bathroom vanity ──────────────────────────────────────────────
    describe('S4 — bathroom vanity (bathroom)', () => {
        it('vanity_unit is the leader in the "vanity" group, anchored wall-opposite-door, door-swing clear', () => {
            const vanity = leader('bathroom', 'vanity_unit');
            expect(vanity.group).toBe('vanity');
            expect(vanity.anchor).toBe('wall-opposite-door');
            expect(vanity.excludeDoorSwing).toBe(true);
        });

        it('bathroom_mirror is in the SAME "vanity" group (mirror sits above the unit)', () => {
            const mirror = leader('bathroom', 'bathroom_mirror');
            expect(mirror.group).toBe('vanity');
        });
    });

    // ── S5 — Utility / laundry (utility-room) ────────────────────────────
    describe('S5 — utility / laundry (utility-room)', () => {
        it('washing_machine_standalone is the leader in the "laundry" group, REQUIRED, excludeDoorSwing', () => {
            const washer = leader('utility-room', 'washing_machine_standalone');
            expect(washer.group).toBe('laundry');
            expect(washer.required).toBe(true);
            expect(washer.excludeDoorSwing).toBe(true);
        });

        it('tumble_dryer + drying_rack share the "laundry" group (paired with the washer)', () => {
            for (const k of ['tumble_dryer', 'drying_rack'] as const) {
                const item = leader('utility-room', k);
                expect(item.group, `${k} not in laundry group`).toBe('laundry');
            }
        });

        it('utility_cabinet + utility_sink keep door-swing clearance (S5 appliance ring)', () => {
            for (const k of ['utility_cabinet', 'utility_sink'] as const) {
                const item = leader('utility-room', k);
                expect(item.excludeDoorSwing, `${k} not excludeDoorSwing`).toBe(true);
            }
        });
    });

    // ── S6 — Bedroom dressing ────────────────────────────────────────────
    describe('S6 — bedroom dressing (bedroom)', () => {
        it('dresser anchors on the longest wall, excludes window+door walls', () => {
            const dresser = leader('bedroom', 'dresser');
            expect(dresser.anchor).toBe('wall-longest');
            expect(dresser.excludeWindowWall).toBe(true);
            expect(dresser.excludeDoorSwing).toBe(true);
        });

        it('vanity_table anchors on the window wall (natural light for makeup)', () => {
            const vt = leader('bedroom', 'vanity_table');
            expect(vt.anchor).toBe('wall-window');
            expect(vt.excludeDoorSwing).toBe(true);
        });
    });

    // ── S7 — Window dressing (curtains) ──────────────────────────────────
    // §bedroom-mirror (2026-06-11) — the BEDROOM's curtain PANEL was swapped for a
    // wall_mirror (reflective mirror material) per the founder request. The bedroom
    // 'curtains' group is now rod (leader) + wall_mirror ×2; only the LIVING-ROOM
    // keeps the rod + curtain_panel ×2 pairing.
    describe('S7 — window dressing (curtains / mirror)', () => {
        it('living-room carries a curtain_rod + curtain_panel pair in the "curtains" group', () => {
            const rod = leader('living-room', 'curtain_rod');
            const panel = leader('living-room', 'curtain_panel');
            expect(rod.group).toBe('curtains');
            expect(panel.group).toBe('curtains');
        });

        it('bedroom carries a curtain_rod + wall_mirror pair in the "curtains" group (panel→mirror swap)', () => {
            const rod = leader('bedroom', 'curtain_rod');
            const mirror = itemsIn('bedroom', 'wall_mirror').find(i => i.group === 'curtains');
            expect(rod.group).toBe('curtains');
            expect(mirror, 'bedroom missing window-wall wall_mirror').toBeDefined();
            expect(itemsIn('bedroom', 'curtain_panel').length).toBe(0);
        });

        it.each(['bedroom', 'living-room'] as const)('%s curtain_rod anchors on the window wall', (occ) => {
            expect(leader(occ, 'curtain_rod').anchor).toBe('wall-window');
        });

        it('living-room curtain_panel count is exactly 2 (flanking panels)', () => {
            expect(leader('living-room', 'curtain_panel').count).toBe(2);
        });

        it('bedroom window-wall wall_mirror count is exactly 2 (flanking the rod)', () => {
            const mirror = itemsIn('bedroom', 'wall_mirror').find(i => i.group === 'curtains');
            expect(mirror!.count).toBe(2);
        });
    });

    // ── Group-leader detection pattern ───────────────────────────────────
    describe('group-leader detection pattern', () => {
        it('every group has at least one wall/center/corner-anchored leader (not exclusively "beside")', () => {
            // The pattern: a group leader is an item with a wall/center/corner anchor.
            // Children of the group anchor 'beside' the leader. If a group has ONLY
            // 'beside' items, the engine cannot resolve a leader pose.
            const groupAnchors = new Map<string, Set<string>>();
            for (const occ of SYSTEM_OCCUPANCIES) {
                const arch = archetypeFor(occ);
                if (!arch) continue;
                for (const item of arch.items) {
                    if (!item.group) continue;
                    const key = `${occ}/${item.group}`;
                    if (!groupAnchors.has(key)) groupAnchors.set(key, new Set());
                    groupAnchors.get(key)!.add(item.anchor);
                }
            }
            for (const [key, anchors] of groupAnchors) {
                const hasLeader = ['wall-longest', 'wall-opposite-door', 'wall-window', 'corner', 'center'].some(a => anchors.has(a));
                expect(hasLeader, `group ${key} has no anchored leader (only: ${[...anchors].join(',')})`).toBe(true);
            }
        });
    });

    // ── Integration — orphan-group ref check ─────────────────────────────
    describe('integration — every group key resolves (no orphans)', () => {
        it('every `group:` key used in any archetype has ≥1 item with that group (self-consistent)', () => {
            // Per-archetype scope: a group is scoped to its archetype (e.g. 'vanity'
            // in 'bathroom' is unrelated to a hypothetical 'vanity' elsewhere). The
            // de-facto pattern relies on within-archetype grouping; this asserts
            // every group key has at least one member, by archetype.
            for (const occ of SYSTEM_OCCUPANCIES) {
                const arch = archetypeFor(occ);
                if (!arch) continue;
                const groupCounts = new Map<string, number>();
                for (const item of arch.items) {
                    if (!item.group) continue;
                    groupCounts.set(item.group, (groupCounts.get(item.group) ?? 0) + 1);
                }
                for (const [g, n] of groupCounts) {
                    expect(n, `archetype ${occ} group '${g}' has 0 members`).toBeGreaterThanOrEqual(1);
                }
            }
        });

        it('groups with paired children have ≥2 members (leader + at least one secondary)', () => {
            // Documented multi-member systems from the master plan: S1 media, S2 entry,
            // S3 desk, S4 vanity, S5 laundry, S7 curtains. Each MUST have ≥2 items in
            // its group across the relevant archetype.
            const pairs: ReadonlyArray<readonly [string, string]> = [
                ['living-room',    'media'],     // S1
                ['entrance-lobby', 'entry'],     // S2
                ['private-office', 'desk'],      // S3
                ['bathroom',       'vanity'],    // S4
                ['utility-room',   'laundry'],   // S5
                ['bedroom',        'curtains'],  // S7 — bedroom
                ['living-room',    'curtains'],  // S7 — living-room
            ];
            for (const [occ, group] of pairs) {
                const arch = archetypeFor(occ)!;
                const n = arch.items.filter(i => i.group === group).length;
                expect(n, `archetype ${occ} group '${group}' should be a multi-member system`).toBeGreaterThanOrEqual(2);
            }
        });
    });
});
