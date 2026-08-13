// ─── HARNESS 5 — GRAPH RUNTIME READ-BACK (GR-18 · CE-05) ────────────────────
//
// THE ROWS THIS EXISTS FOR
// ─────────────────────────────────────────────────────────────────────────────
// GR-18: *"No runtime probe has ever been executed against a live graph. Every
//         claim in EV-04/EV-05 is source-level. A writer that exists and is never
//         reached still reads ✅."*  Fix column: *"a CA-21-equivalent read-back
//         discipline for the graph."*
// CE-05: *"Static discovery counts authored-but-unreached code as present. No gate
//         in the suite answers the REACHABILITY question."*  Three executed gates
//         say the same thing in their own not-measured blocks —
//         `check-graph-write-coverage` ("a writer that exists but is never reached
//         counts as PRESENT"), `check-topology-survives` ("LIVE-SESSION
//         REACHABILITY … UNPROVEN"), `check-no-empty-means-unknown` ("static only").
//
// This file is the first instrument in the suite that does not read source. It
// EXECUTES a real command through the real `CommandManager` against the real
// production stores, and then READS THE LIVE `semanticGraphManager` BACK. The
// verdict per case is the state of the graph after the write, never the presence
// of the write in a file.
//
// ═════════════════════════════════════════════════════════════════════════════
// EXACTLY WHAT THIS PROBE DOES AND DOES **NOT** COVER — read this before quoting it
// ═════════════════════════════════════════════════════════════════════════════
// COVERED — the middle link, which nothing measured before:
//   command constructed → `cm.execute()` → the command body runs → the graph
//   write inside it is REACHED → the edge is READABLE from the live graph by the
//   same query production readers use (`getTargets` / `hasRelationship`).
//   A writer that is dead behind a guard, that throws before it, that writes the
//   wrong direction, or that writes an id nothing can query, comes back
//   NOT-REACHED here. Static discovery calls all four PRESENT.
//
// NOT COVERED — every one of these is still UNPROVEN and this file must never be
// cited as evidence for them:
//   (a) GESTURE reachability. This probe constructs the command itself. It does
//       NOT prove any user gesture, tool, bus verb or panel can reach that
//       command. L-847 (a whole workbench shipping unreachable) lives in this gap
//       and this instrument does not close it.
//   (b) PERSISTENCE. Nothing here saves or reloads; whether the edge survives
//       serialize→deserialize is `check-graph-persistence`'s question.
//   (c) MULTI-CLIENT and MULTI-LEVEL. One client, one session, and only the
//       levels seeded below (CE-06 remains exactly as stated).
//   (d) The 25-type relationship census. Only the edges the cases below name are
//       exercised; every other declared family is untouched, and untouched is not
//       absent (C71 §2.3 — PARKED is a different state from gap).
//   (e) DELETE and MOVE propagation into the graph. Creation only.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHY GREEN IS REACHABLE (L-716) AND WHY RED IS REACHABLE (C70 §5.6)
// ═════════════════════════════════════════════════════════════════════════════
// A gate with no demonstrated passing state is a defect, not a standard; a
// comparator never watched go red is not trusted. Both states are DEMONSTRATED
// IN THIS FILE, on every run, by two permanent controls rather than by a one-off
// experiment in a commit message:
//   POSITIVE CONTROL — `column.create` drives a writer that IS reached; the case
//     returns REACHED. Green exists.
//   NEGATIVE CONTROL — `wall.create` executes successfully and creates a real
//     wall, and `packages/command-registry/src/walls/CreateWallCommand.ts` holds
//     ZERO `semanticGraphManager` calls. The identical read-back therefore MUST
//     return NOT-REACHED. If this case ever reports REACHED, the probe is
//     manufacturing edges and every other verdict in the file is void.
//   PHANTOM CONTROL — the same query shape against an element id that was never
//     created must be empty, so "found" can never be the reader's default.
//
// STUB LEDGER: inherited whole from `../world` (declared there) — detached
// plugin-DTO record stores, a recording ring buffer, no fragment builders. None
// of them is on the measured path: `semanticGraphManager` is the real module
// singleton `@pryzm/core-app-model` exports, the same instance
// `ProjectSerializer.ts:1083` serialises and `initDataPlatform.ts:163` publishes
// on `window`.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import type { World } from '../world';
import { writeResults } from '../report';

interface ProbeCase {
    /** Human name of the production path driven. */
    readonly path: string;
    /** The edge the source declares it writes. */
    readonly edge: { type: string; from: () => string; to: () => string };
    /** Drive the real command. Return the id it created, or a reason it could not run. */
    readonly drive: () => { id: string } | { unprovable: string };
    /** DECLARED expectation, from reading the source — the probe still MEASURES. */
    readonly expect: 'REACHED' | 'NOT-REACHED';
    /** Why the expectation is what it is (cited, not asserted). */
    readonly because: string;
}

interface ProbeRow {
    path: string;
    edgeType: string;
    declared: string;
    measured: 'REACHED' | 'NOT-REACHED' | 'UNPROVEN';
    detail: string;
}

let world: World;
let reg: any;
const rows: ProbeRow[] = [];
const seedLog: string[] = [];

const LEVEL_ID = 'GRT-L0';
const ROOM_ID = 'grt-room-1';

/** Ids captured at drive time so the read-back can query them. */
const made: Record<string, string> = {};

beforeAll(async () => {
    const { buildWorld } = await import('../world');
    world = await buildWorld();
    reg = await import('@pryzm/command-registry');

    const cm = world.cm;
    const s = (name: string, fn: () => { success?: boolean; error?: string } | void): void => {
        try {
            const r = fn();
            seedLog.push(`${name}: ${r && r.success === false ? 'REFUSED ' + (r.error ?? '') : 'OK'}`);
        } catch (e) { seedLog.push(`${name}: THREW ${String(e).slice(0, 200)}`); }
    };

    s('level ' + LEVEL_ID, () => cm.execute(new reg.AddLevelCommand({
        levelId: LEVEL_ID, name: 'Graph Probe Level', elevation: 0, height: 3,
    })));

    // The graph starts EMPTY for this probe, so nothing below can be satisfied by
    // a residue of the seeding. This is the read-back discipline's precondition.
    semanticGraphManager.clear();
    console.log('[H5] seed: ' + seedLog.join(' | ') +
        ' | graph size after clear = ' + semanticGraphManager.size);
}, 600_000);

const CASES: ProbeCase[] = [
    {
        path: 'CreateColumnCommand  (POSITIVE CONTROL)',
        edge: { type: 'sitsOn', from: () => made.column, to: () => LEVEL_ID },
        expect: 'REACHED',
        because: 'CreateColumnCommand.ts:186 writes sitsOn(columnId → levelId)',
        drive: () => {
            const id = 'grt-col-1';
            const r = world.cm.execute(new reg.CreateColumnCommand({
                id, position: { x: 1, y: 0, z: 1 }, height: 3, rotation: 0,
                profile: 'rectangular', width: 0.4, depth: 0.4, baseOffset: 0,
                levelId: LEVEL_ID,
            })) as { success?: boolean; error?: string } | void;
            if (r && r.success === false) return { unprovable: 'command refused: ' + (r.error ?? '') };
            made.column = id;
            return { id };
        },
    },
    {
        path: 'CreateRoofCommand',
        edge: { type: 'sitsOn', from: () => made.roof, to: () => LEVEL_ID },
        expect: 'REACHED',
        because: 'CreateRoofCommand.ts:236 writes sitsOn(roofId → levelId)',
        drive: () => {
            const id = 'grt-roof-1';
            const r = world.cm.execute(new reg.CreateRoofCommand(id, {
                levelId: LEVEL_ID,
                footprint: { polygon: [[-1, -1], [7, -1], [7, 5], [-1, 5]], centroid: [3, 2] },
                roofType: 'flat', overhang: 0.3, baseOffset: 3, thickness: 0.2,
            })) as { success?: boolean; error?: string } | void;
            if (r && r.success === false) return { unprovable: 'command refused: ' + (r.error ?? '') };
            made.roof = id;
            return { id };
        },
    },
    {
        path: 'CreatePlumbingFixtureCommand',
        edge: { type: 'sitsOn', from: () => made.plumbing, to: () => LEVEL_ID },
        expect: 'REACHED',
        because: 'CreatePlumbingFixtureCommand.ts:102 writes sitsOn(fixtureId → levelId)',
        drive: () => {
            const id = 'grt-wc-1';
            const r = world.cm.execute(new reg.CreatePlumbingFixtureCommand({
                id, fixtureType: 'sink', position: { x: 2, y: 0, z: 2 },
                rotation: { x: 0, y: 0, z: 0 }, levelId: LEVEL_ID, baseOffset: 0,
            })) as { success?: boolean; error?: string } | void;
            if (r && r.success === false) return { unprovable: 'command refused: ' + (r.error ?? '') };
            made.plumbing = id;
            return { id };
        },
    },
    {
        path: 'CreateFurnitureCommand — sitsOn',
        edge: { type: 'sitsOn', from: () => made.furniture, to: () => LEVEL_ID },
        expect: 'REACHED',
        because: 'CreateFurnitureCommand.ts:201 writes sitsOn(furnitureId → levelId), authoritative (failures bubble)',
        drive: () => driveFurniture(),
    },
    {
        path: 'CreateFurnitureCommand — contains (§CONTAINS-FIRST-PARTY-WRITER)',
        edge: { type: 'contains', from: () => ROOM_ID, to: () => made.furniture },
        expect: 'REACHED',
        because: 'CreateFurnitureCommand.ts:249 mirrors metadata.hostedSpaceId as contains(roomId → furnitureId); ' +
                 'GR-01 was CLOSED on this writer by STATIC discovery only',
        drive: () => driveFurniture(),
    },
    {
        path: 'CreateWallCommand  (NEGATIVE CONTROL)',
        edge: { type: 'sitsOn', from: () => made.wall, to: () => LEVEL_ID },
        expect: 'NOT-REACHED',
        because: 'packages/command-registry/src/walls/CreateWallCommand.ts contains ZERO semanticGraphManager ' +
                 'calls at HEAD — the command succeeds and writes no edge. If this reads REACHED the probe is broken.',
        drive: () => {
            const id = 'grt-wall-1';
            const r = world.cm.execute(new reg.CreateWallCommand(id, {
                start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, height: 3, thickness: 0.2,
                levelId: LEVEL_ID, materialColor: '#aaaaaa',
            })) as { success?: boolean; error?: string } | void;
            if (r && r.success === false) return { unprovable: 'command refused: ' + (r.error ?? '') };
            made.wall = id;
            return { id };
        },
    },
];

/** Furniture is driven once and reused by both of its cases (sitsOn + contains). */
function driveFurniture(): { id: string } | { unprovable: string } {
    if (made.furniture) return { id: made.furniture };
    const id = 'grt-furn-1';
    const r = world.cm.execute(new reg.CreateFurnitureCommand({
        id, furnitureType: 'table', position: { x: 3, y: 0, z: 2 },
        rotation: { x: 0, y: 0, z: 0 }, levelId: LEVEL_ID, baseOffset: 0,
        width: 1.2, length: 0.8, height: 0.75, material: 'wood',
        // The authoritative field the `contains` edge MIRRORS. Without it the
        // command deliberately writes no edge (inventing containment is the
        // provenance-invented defect one layer over) — so the probe supplies the
        // real field rather than expecting the command to guess.
        metadata: { hostedSpaceId: ROOM_ID },
    })) as { success?: boolean; error?: string } | void;
    if (r && r.success === false) return { unprovable: 'command refused: ' + (r.error ?? '') };
    made.furniture = id;
    return { id };
}

describe('HARNESS 5 — live-graph runtime read-back (GR-18 · CE-05)', () => {
    it('MISCONFIGURED GUARD — the world seeded a level and the graph starts empty', () => {
        console.log('[H5] registrationFailures=' + JSON.stringify(world.registrationFailures));
        expect(world.stores, 'no stores — harness MISCONFIGURED').toBeTruthy();
        expect(semanticGraphManager.size,
            'the probe must start from an empty graph or every read-back is contaminated').toBe(0);
    });

    for (const c of CASES) {
        it(`${c.path} → ${c.edge.type}`, () => {
            const driven = c.drive();
            if ('unprovable' in driven) {
                rows.push({
                    path: c.path, edgeType: c.edge.type, declared: c.expect,
                    measured: 'UNPROVEN', detail: driven.unprovable,
                });
                console.log(`[H5 ${c.path}] UNPROVEN — ${driven.unprovable}`);
                // UNPROVEN is neither pass nor fail (C70 §2.2). It is recorded and
                // the case does not assert — but it is never silently dropped.
                return;
            }

            // ── THE READ-BACK. Exactly the queries production readers use. ──
            const from = c.edge.from();
            const to = c.edge.to();
            const targets = semanticGraphManager.getTargets(from, c.edge.type as never);
            const has = semanticGraphManager.hasRelationship(from, to, c.edge.type as never);
            const measured: 'REACHED' | 'NOT-REACHED' = has ? 'REACHED' : 'NOT-REACHED';

            const detail = `getTargets('${from}','${c.edge.type}')=${JSON.stringify(targets)} ` +
                `hasRelationship('${from}'→'${to}')=${has}`;
            rows.push({ path: c.path, edgeType: c.edge.type, declared: c.expect, measured, detail });
            console.log(`[H5 ${c.path}] declared=${c.expect} MEASURED=${measured} — ${detail}\n` +
                `      because: ${c.because}`);

            expect(measured, `${c.path}: declared ${c.expect}, ${c.because}`).toBe(c.expect);
        });
    }

    it('PHANTOM CONTROL — an element that was never created has no edges (found ≠ the reader default)', () => {
        const ghost = 'grt-never-created-' + Math.random().toString(36).slice(2);
        const targets = semanticGraphManager.getTargets(ghost, 'sitsOn' as never);
        const has = semanticGraphManager.hasRelationship(ghost, LEVEL_ID, 'sitsOn' as never);
        console.log(`[H5 PHANTOM] getTargets('${ghost}','sitsOn')=${JSON.stringify(targets)} has=${has}`);
        expect(targets).toEqual([]);
        expect(has).toBe(false);
    });

    it('DIRECTION CONTROL — the read-back is direction-sensitive, so a reversed edge cannot pass', () => {
        // `contains` is room → furniture. Asking the reverse must come back empty:
        // a probe that ignored direction would grade a reversed write as REACHED,
        // and direction is precisely what makes `getTargets(room.id,'contains')`
        // — the query BOTH production readers use — return anything at all.
        if (!made.furniture) { console.log('[H5 DIRECTION] UNPROVEN — furniture case never drove'); return; }
        const forward = semanticGraphManager.hasRelationship(ROOM_ID, made.furniture, 'contains' as never);
        const reverse = semanticGraphManager.hasRelationship(made.furniture, ROOM_ID, 'contains' as never);
        console.log(`[H5 DIRECTION] contains room→furniture=${forward} furniture→room=${reverse}`);
        expect(forward).toBe(true);
        expect(reverse).toBe(false);
    });

    it('SUMMARY — every case carries a measured verdict, and the totals are printed', () => {
        const reached = rows.filter((r) => r.measured === 'REACHED').length;
        const notReached = rows.filter((r) => r.measured === 'NOT-REACHED').length;
        const unproven = rows.filter((r) => r.measured === 'UNPROVEN').length;
        console.log('[H5 SUMMARY] ' + rows.length + ' cases — REACHED ' + reached +
            ' · NOT-REACHED ' + notReached + ' · UNPROVEN ' + unproven +
            ' | live graph size = ' + semanticGraphManager.size);
        for (const r of rows) {
            console.log(`  · ${r.path} [${r.edgeType}] declared=${r.declared} measured=${r.measured}`);
        }
        console.log('[H5 STILL UNPROVEN — NOT MEASURED BY THIS HARNESS] ' +
            'GESTURE reachability (no user gesture is driven; L-847 lives here) · ' +
            'PERSISTENCE of these edges (check-graph-persistence owns it) · ' +
            'MULTI-CLIENT and MULTI-LEVEL (CE-06 unchanged) · ' +
            'the other declared relationship families · DELETE and MOVE propagation.');
        expect(rows.length, 'the summary must cover every case').toBe(CASES.length);
        expect(reached, 'at least one REACHED is required — otherwise green is unreachable (L-716)')
            .toBeGreaterThan(0);
        expect(notReached, 'at least one NOT-REACHED is required — otherwise the probe cannot report absence')
            .toBeGreaterThan(0);
    });
});

afterAll(() => {
    try {
        const p = writeResults('graphruntime.json', {
            harness: 'H5-graph-runtime-readback',
            generatedAt: new Date().toISOString(),
            seedLog,
            registrationFailures: world?.registrationFailures ?? [],
            notMeasured: [
                'GESTURE reachability — no user gesture, tool or panel is driven',
                'PERSISTENCE — no serialize/deserialize round-trip',
                'MULTI-CLIENT / MULTI-LEVEL — one client, one seeded level',
                'the relationship families not named in the cases',
                'DELETE and MOVE propagation into the graph',
            ],
            rows,
        });
        console.log('[H5] results written: ' + p);
    } catch (e) {
        console.log('[H5] results NOT written: ' + String(e).slice(0, 200));
    }
});
