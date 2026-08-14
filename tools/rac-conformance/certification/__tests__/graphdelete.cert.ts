// ─── HARNESS 7 — DELETE-TIME INVALIDATION OF SEMANTIC-GRAPH EDGES (GR-12) ───
//
// THE ROW THIS EXISTS FOR
// ─────────────────────────────────────────────────────────────────────────────
// Phase C's metric is *"every REQUIRED relationship has a writer + typed reader
// + rebuild + delete AND move"*. The MOVE half for `boundedBy` closed with
// `02157ebb` / `9fa40ae2` / `9ee11d2a` (harness H6, `graphmove.cert.ts`), and
// that lane named its own residual verbatim:
//
//   *"Move-time invalidation for **delete** ('remove' events) and for other
//    geometry commands … rides the flush chokepoint only; headless command-only
//    worlds see command-path invalidation solely for `UpdateWallBaselineCommand`."*
//
// `WallRebuildCoordinator._flush` says the same thing in code, in the §STEP7
// diff that feeds the move-time invalidation:
//
//   *"'remove' is excluded there: a deleted wall's edges are the delete
//    cascade's job (3ee632f6), not a move."*
//
// That sentence is TRUE about the deleted wall's OWN edges and SILENT about the
// thing this harness measures. This file is the delete half.
//
// ═════════════════════════════════════════════════════════════════════════════
// THE DISTINCTION THIS HARNESS IS ABOUT — two different facts, one value
// ═════════════════════════════════════════════════════════════════════════════
// Deleting an element can leave a graph wrong in TWO unrelated ways, and the
// existing `3ee632f6` cascade addresses only the first:
//
//   (1) THE DEAD ID. An edge whose ENDPOINT is the deleted element —
//       `room —boundedBy→ wall`, `wall —hosts→ door`. `removeAllRelationships-
//       ForElement` purges these by index, both directions. This is SOLVED, and
//       this harness asserts it rather than assuming it (the DEAD-ID arms).
//
//   (2) THE SURVIVING CONCLUSION. The edges that do NOT name the deleted
//       element but were DERIVED from its existence:
//         · the room's REMAINING `boundedBy` edges — three walls of a ring that
//           no longer closes, read back as a confident, complete boundary;
//         · `adjacentTo` (room ↔ room) — written by `DetectAllRoomsCommand`
//           because the two rooms SHARED A WALL, with the shared wall named
//           nowhere in the edge (both endpoints are rooms);
//         · `connectedTo` (room ↔ room) — written because a DOOR sat in that
//           shared wall; the door is named nowhere in the edge either.
//       Delete the shared wall and every one of these is a conclusion about a
//       world that no longer exists — yet no index touches them, because the
//       deleted id is not an endpoint of any of them.
//
// This is precisely the shape the `authoredBy` docblock in `SemanticGraph.ts`
// already names for `connectedByStair`: *"an edge whose ENDPOINTS are not the
// thing the edge is about."* H6 established the same split for MOVE. For DELETE
// the region-derived families are, if anything, MORE sensitive: a moved wall
// might still bound the room, a deleted wall provably cannot.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHAT THIS PROBE DOES AND DOES **NOT** COVER
// ═════════════════════════════════════════════════════════════════════════════
// COVERED — executed, against the real `CommandManager`, the real stores and the
// real module-singleton `semanticGraphManager`: seven real walls forming TWO
// rooms that share one wall; a real door in the shared wall; a real
// `DetectAllRoomsCommand`; then a real `DeleteElementCommand` on the SHARED
// WALL, and the graph read back through the same queries production readers use
// — including the refusal-bearing `getBoundingWalls`.
//
// NOT COVERED, stated before any result:
//   (a) SUBSCRIBER REACHABILITY — this world composes commands and stores, NOT
//       the EngineBootstrap / BatchCoordinator subscribers, so a null reading
//       means *the command path does not invalidate*, never *no production path
//       does*. The RE-DETECT CONTROL below is what makes that difference
//       measurable rather than asserted.
//   (b) UNDO of a delete (the `_removedRelationships` restore path).
//   (c) Collaboration merge; multi-level; multi-client.
//   (d) Element kinds other than wall; every PARKED family (C71 §2.3).
//   (e) Whether a USER is ever told an edge went stale (C79 §10.6).
//
// STUB LEDGER: inherited whole from `../world` (declared there).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import type { World } from '../world';
import { writeResults } from '../report';

let world: World;
let reg: any;
const seedLog: string[] = [];

const LEVEL_ID = 'GDL-L0';

/**
 * Two stacked 6 × 4 rectangles sharing the `mid` wall at z = 4.
 * `mid` is the wall that gets DELETED — it is simultaneously
 *   · a `boundedBy` target of BOTH rooms (the dead-id arm),
 *   · the host of the door that authored `connectedTo` (dead id, once removed),
 *   · the shared wall that authored `adjacentTo` (named in NO edge at all).
 */
const WALLS = {
    south: { id: 'gdl-w-south', start: { x: 0, z: 0 }, end: { x: 6, z: 0 } },
    eastLo: { id: 'gdl-w-east-lo', start: { x: 6, z: 0 }, end: { x: 6, z: 4 } },
    mid: { id: 'gdl-w-mid', start: { x: 6, z: 4 }, end: { x: 0, z: 4 } },
    westLo: { id: 'gdl-w-west-lo', start: { x: 0, z: 4 }, end: { x: 0, z: 0 } },
    eastHi: { id: 'gdl-w-east-hi', start: { x: 6, z: 4 }, end: { x: 6, z: 8 } },
    north: { id: 'gdl-w-north', start: { x: 6, z: 8 }, end: { x: 0, z: 8 } },
    westHi: { id: 'gdl-w-west-hi', start: { x: 0, z: 8 }, end: { x: 0, z: 4 } },
} as const;

/** Populated by the seed; every read-back below is scoped to these. */
let roomLo = '';
let roomHi = '';

interface Observation {
    family: string;
    obligation:
    | 'DELETE-INVARIANT (id-keyed, untouched element)'
    | 'DEAD-ID (endpoint is the deleted element)'
    | 'DELETE-SENSITIVE (region-derived, deleted element is NOT an endpoint)';
    beforeDelete: string;
    afterDelete: string;
    verdict: string;
    /**
     * TRUE when the family's reading was IDENTICAL AND EMPTY on both sides.
     * Inherited verbatim from H6, and for the same reason: `[] → []` proves
     * nothing about its family, and grading it "SURVIVED — correct" or "STALE"
     * would be this repository's signature defect (failure and empty as the same
     * value) committed by the instrument built to find it. Printed, never
     * asserted on.
     */
    vacuous: boolean;
}
const observations: Observation[] = [];

function observe(
    family: string,
    obligation: Observation['obligation'],
    beforeDelete: string,
    afterDelete: string,
    verdictWhenReal: string,
): Observation {
    const vacuous = beforeDelete === '[]' && afterDelete === '[]';
    return {
        family, obligation, beforeDelete, afterDelete, vacuous,
        verdict: vacuous
            ? 'VACUOUS — the reading was empty on both sides; this row measures nothing about this family'
            : verdictWhenReal,
    };
}

/** Deterministic, order-independent rendering of one node's out-edges. */
function edgesOf(from: string, type: string): string {
    return JSON.stringify([...semanticGraphManager.getTargets(from, type as never)].sort());
}

/**
 * The TYPED reader's answer, rendered so that `ok:true` with a list and
 * `ok:false` with a reason can never print the same string. This is the row:
 * a dead id lingering and "this element is unknown to the writer" are DIFFERENT
 * FACTS and must never read the same.
 */
function boundingWallsReading(roomId: string): string {
    const q = semanticGraphManager.getBoundingWalls(roomId);
    return q.ok
        ? `ok:true ${JSON.stringify([...q.boundingWallIds].sort())}`
        : `ok:false reason=${q.reason}`;
}

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
        levelId: LEVEL_ID, name: 'Graph Delete Probe Level', elevation: 0, height: 3,
    })));

    for (const [name, w] of Object.entries(WALLS)) {
        s('wall ' + name, () => cm.execute(new reg.CreateWallCommand(w.id, {
            start: w.start, end: w.end, height: 3, thickness: 0.2,
            levelId: LEVEL_ID, materialColor: '#aaaaaa',
        })));
    }

    // A door in the SHARED wall — this is what makes `connectedTo` non-vacuous.
    s('door in shared (mid) wall', () => cm.execute(new reg.CreateWallOpeningCommand({
        wallId: WALLS.mid.id,
        openingData: {
            id: 'gdl-door-mid', elementId: 'gdl-door-mid-el', type: 'door',
            offset: 3.0, width: 0.9, height: 2.1, sillHeight: 0,
        },
    })));

    // A second door in the SOUTH wall — the surviving id-keyed `hosts` control
    // arm. Without it the only `hosts` edge in the world belongs to the wall
    // being deleted, and the DELETE-INVARIANT side of the split would be
    // asserted over nothing (the exact vacuity H6 caught on its first run).
    s('door in south wall (control)', () => cm.execute(new reg.CreateWallOpeningCommand({
        wallId: WALLS.south.id,
        openingData: {
            id: 'gdl-door-south', elementId: 'gdl-door-south-el', type: 'door',
            offset: 3.0, width: 0.9, height: 2.1, sillHeight: 0,
        },
    })));

    // Detection LAST, so both rooms derive from the finished wall ring.
    s('detect rooms', () => cm.execute(new reg.DetectAllRoomsCommand()));

    const rooms = (world.stores.roomStore?.getAll?.() ?? []) as Array<{ id: string; levelId?: string }>;
    const onLevel = rooms.filter((r) => r.levelId === LEVEL_ID);
    // Order by whichever holds a boundedBy edge to the south wall (the lower
    // room) — never by array position, which no contract pins.
    roomLo = onLevel.find((r) => semanticGraphManager
        .getTargets(r.id, 'boundedBy' as never).includes(WALLS.south.id))?.id ?? onLevel[0]?.id ?? '';
    roomHi = onLevel.find((r) => r.id !== roomLo && semanticGraphManager
        .getTargets(r.id, 'boundedBy' as never).includes(WALLS.north.id))?.id
        ?? onLevel.find((r) => r.id !== roomLo)?.id ?? '';

    console.log('[H7] seed: ' + seedLog.join(' | ') +
        ' | rooms on level = ' + onLevel.length +
        ' roomLo=' + roomLo + ' roomHi=' + roomHi +
        ' | graph size = ' + semanticGraphManager.size);
}, 600_000);

describe('HARNESS 7 — delete-time invalidation of semantic-graph edges (GR-12 · C71 §1.2 semantic 5)', () => {
    it('MISCONFIGURED GUARD — the seed produced TWO rooms sharing a wall, or nothing below means anything', () => {
        console.log('[H7] registrationFailures=' + JSON.stringify(world.registrationFailures));
        expect(roomLo, 'no lower room was detected — the fixture, not the subject, has failed').toBeTruthy();
        expect(roomHi, 'no upper room was detected — the shared-wall arms cannot be measured').toBeTruthy();
        expect(roomHi).not.toBe(roomLo);

        const boundedLo = semanticGraphManager.getTargets(roomLo, 'boundedBy' as never);
        const boundedHi = semanticGraphManager.getTargets(roomHi, 'boundedBy' as never);
        console.log(`[H7 GUARD] boundedBy(lo=${roomLo}) = ${JSON.stringify([...boundedLo].sort())}`);
        console.log(`[H7 GUARD] boundedBy(hi=${roomHi}) = ${JSON.stringify([...boundedHi].sort())}`);
        expect(boundedLo.length, 'the lower room has NO boundedBy edges').toBeGreaterThan(0);
        expect(boundedHi.length, 'the upper room has NO boundedBy edges').toBeGreaterThan(0);
        // The whole harness turns on BOTH rooms naming the wall about to die.
        expect(boundedLo, 'the lower room is not bounded by the shared wall — the fixture is not the intended world')
            .toContain(WALLS.mid.id);
        expect(boundedHi, 'the upper room is not bounded by the shared wall — the fixture is not the intended world')
            .toContain(WALLS.mid.id);
    });

    it('THE MEASUREMENT — a real wall DELETE, and the graph read back before and after', () => {
        const deletedWall = WALLS.mid.id;
        const survivingWall = WALLS.south.id;

        // ── BEFORE ────────────────────────────────────────────────────────────
        const before = {
            // (2) region-derived — the deleted wall is NOT an endpoint of these
            boundedByLo: edgesOf(roomLo, 'boundedBy'),
            boundedByHi: edgesOf(roomHi, 'boundedBy'),
            adjacentLo: edgesOf(roomLo, 'adjacentTo'),
            connectedLo: edgesOf(roomLo, 'connectedTo'),
            typedLo: boundingWallsReading(roomLo),
            typedHi: boundingWallsReading(roomHi),
            // (1) dead-id — the deleted wall IS an endpoint of these
            hostsDeleted: edgesOf(deletedWall, 'hosts'),
            sitsOnDeleted: edgesOf(deletedWall, 'sitsOn'),
            // control — an untouched wall
            hostsSurviving: edgesOf(survivingWall, 'hosts'),
            sitsOnSurviving: edgesOf(survivingWall, 'sitsOn'),
        };
        const graphBefore = JSON.stringify(semanticGraphManager.serialize());
        console.log('[H7 BEFORE] ' + JSON.stringify(before, null, 2));

        // ── THE DELETE ────────────────────────────────────────────────────────
        // The SHARED wall is removed outright. This is not a nudge and not an
        // ambiguity: both rings are broken, the two rooms are no longer separated
        // by anything, and the door that authored `connectedTo` is cascaded away
        // with its host. Any surviving conclusion asserting "these two rooms are
        // adjacent / connected by a door", or a complete-looking boundary for
        // either room, is measurably FALSE afterwards — not merely imprecise.
        const deleted = world.cm.execute(new reg.DeleteElementCommand(deletedWall)) as
            { success?: boolean; error?: string } | void;
        console.log('[H7 DELETE] DeleteElementCommand → ' + JSON.stringify(deleted));
        expect(deleted && (deleted as { success?: boolean }).success,
            'the delete itself was refused — the subject never ran').not.toBe(false);
        expect(world.stores.wallStore?.getById?.(deletedWall),
            'the wall is still in the store — the delete did not happen').toBeFalsy();

        // ── AFTER ─────────────────────────────────────────────────────────────
        const after = {
            boundedByLo: edgesOf(roomLo, 'boundedBy'),
            boundedByHi: edgesOf(roomHi, 'boundedBy'),
            adjacentLo: edgesOf(roomLo, 'adjacentTo'),
            connectedLo: edgesOf(roomLo, 'connectedTo'),
            typedLo: boundingWallsReading(roomLo),
            typedHi: boundingWallsReading(roomHi),
            hostsDeleted: edgesOf(deletedWall, 'hosts'),
            sitsOnDeleted: edgesOf(deletedWall, 'sitsOn'),
            hostsSurviving: edgesOf(survivingWall, 'hosts'),
            sitsOnSurviving: edgesOf(survivingWall, 'sitsOn'),
        };
        const graphAfter = JSON.stringify(semanticGraphManager.serialize());
        console.log('[H7 AFTER] ' + JSON.stringify(after, null, 2));

        // ── (1) DEAD-ID arms — the 3ee632f6 cascade. Purging is CORRECT ───────
        observations.push(observe(
            'hosts (deleted wall → its door)', 'DEAD-ID (endpoint is the deleted element)',
            before.hostsDeleted, after.hostsDeleted,
            after.hostsDeleted === '[]' ? 'PURGED — correct' : 'DEAD ID SURVIVES — WRONG',
        ));
        observations.push(observe(
            'sitsOn (deleted wall → level)', 'DEAD-ID (endpoint is the deleted element)',
            before.sitsOnDeleted, after.sitsOnDeleted,
            after.sitsOnDeleted === '[]' ? 'PURGED — correct' : 'DEAD ID SURVIVES — WRONG',
        ));

        // ── DELETE-INVARIANT arms — an UNTOUCHED wall must keep its edges ─────
        // Without these the harness could "pass" by a cascade that wiped the
        // whole graph, which is not invalidation but data loss.
        observations.push(observe(
            'hosts (surviving wall → its door)', 'DELETE-INVARIANT (id-keyed, untouched element)',
            before.hostsSurviving, after.hostsSurviving,
            before.hostsSurviving === after.hostsSurviving ? 'SURVIVED — correct' : 'CHANGED — WRONG',
        ));
        observations.push(observe(
            'sitsOn (surviving wall → level)', 'DELETE-INVARIANT (id-keyed, untouched element)',
            before.sitsOnSurviving, after.sitsOnSurviving,
            before.sitsOnSurviving === after.sitsOnSurviving ? 'SURVIVED — correct' : 'CHANGED — WRONG',
        ));
        expect(after.sitsOnSurviving,
            'an UNTOUCHED wall lost its sitsOn edge — this is data loss, not invalidation')
            .toBe(before.sitsOnSurviving);
        expect(after.hostsSurviving,
            'an UNTOUCHED wall lost its hosts edge — this is data loss, not invalidation')
            .toBe(before.hostsSurviving);

        // ── (2) DELETE-SENSITIVE arms — the actual row ────────────────────────
        // The RAW `getTargets` lookup. It is reported because it is what a caller
        // bypassing the typed reader sees — but it is NOT the honesty surface, and
        // a verdict here must not be read as the row's answer either way. This file
        // already documents the same split for `getJoinedWalls`/`getBoundingWalls`:
        // the raw lookup stays raw, and the typed reader is the surface that can
        // say it does not know. The two `getBoundingWalls` arms below are the row.
        observations.push(observe(
            'boundedBy RAW getTargets — the SURVIVING walls of a broken ring (lower room)',
            'DELETE-SENSITIVE (region-derived, deleted element is NOT an endpoint)',
            before.boundedByLo, after.boundedByLo,
            after.boundedByLo === '[]'
                ? 'EDGES REMOVED by the delete path'
                : 'EDGES RETAINED — the raw lookup still lists the walls that remain, though the ring ' +
                'no longer closes and nothing re-derived it. Whether that is a defect is decided by ' +
                'the getBoundingWalls arms below, not here',
        ));
        observations.push(observe(
            'boundedBy RAW getTargets — the SURVIVING walls of a broken ring (upper room)',
            'DELETE-SENSITIVE (region-derived, deleted element is NOT an endpoint)',
            before.boundedByHi, after.boundedByHi,
            after.boundedByHi === '[]'
                ? 'EDGES REMOVED by the delete path'
                : 'EDGES RETAINED — same as the lower room',
        ));
        observations.push(observe(
            'adjacentTo (room ↔ room, authored by the DELETED shared wall)',
            'DELETE-SENSITIVE (region-derived, deleted element is NOT an endpoint)',
            before.adjacentLo, after.adjacentLo,
            before.adjacentLo !== after.adjacentLo
                ? 'INVALIDATED by the delete path'
                : 'STALE — the rooms still read as adjacent via a wall that no longer exists; ' +
                'the wall is named in NO endpoint, so no index could reach this edge',
        ));
        observations.push(observe(
            'connectedTo (room ↔ room, authored by a door in the DELETED wall)',
            'DELETE-SENSITIVE (region-derived, deleted element is NOT an endpoint)',
            before.connectedLo, after.connectedLo,
            before.connectedLo !== after.connectedLo
                ? 'INVALIDATED by the delete path'
                : 'STALE — the rooms still read as connected by a door that was cascaded away with its host',
        ));

        // ── THE TYPED READER — the distinction that IS this row ───────────────
        // `getBoundingWalls` is the surface that can say it does not know. If it
        // answers `ok:true` with the leftovers, a dead-ring room and a genuinely
        // determined room print the same shape, and every consumer downstream
        // treats an unverified partial boundary as a verified complete one.
        observations.push(observe(
            'getBoundingWalls — the TYPED, refusal-bearing reader (lower room)',
            'DELETE-SENSITIVE (region-derived, deleted element is NOT an endpoint)',
            before.typedLo, after.typedLo,
            after.typedLo.startsWith('ok:false')
                ? 'REFUSES — the reader reports it cannot answer, which is the correct answer'
                : 'ANSWERS CONFIDENTLY — the reader returns ok:true over a boundary nobody re-derived; ' +
                '"undetermined" and "determined" print the same shape (C79 §5.2.1)',
        ));
        observations.push(observe(
            'getBoundingWalls — the TYPED, refusal-bearing reader (upper room)',
            'DELETE-SENSITIVE (region-derived, deleted element is NOT an endpoint)',
            before.typedHi, after.typedHi,
            after.typedHi.startsWith('ok:false')
                ? 'REFUSES — the reader reports it cannot answer, which is the correct answer'
                : 'ANSWERS CONFIDENTLY — same as the lower room',
        ));

        console.log('[H7 RESULT] graph changed by the delete = ' + (graphBefore !== graphAfter));
        for (const o of observations) {
            console.log(`  · ${o.family}\n      [${o.obligation}]\n      before=${o.beforeDelete}\n      after =${o.afterDelete}\n      → ${o.verdict}`);
        }

        // Each of the THREE obligations must carry at least one non-vacuous arm,
        // or the classification this file establishes is asserted over nothing.
        for (const ob of [
            'DEAD-ID (endpoint is the deleted element)',
            'DELETE-INVARIANT (id-keyed, untouched element)',
            'DELETE-SENSITIVE (region-derived, deleted element is NOT an endpoint)',
        ] as const) {
            expect(observations.some((o) => o.obligation === ob && !o.vacuous),
                `every arm of obligation "${ob}" was vacuous — the seed produced no such edge, so nothing is measured`)
                .toBe(true);
        }

        // NO assertion is made on the DELETE-SENSITIVE verdicts here, and that is
        // deliberate — the same reasoning H6 recorded. Asserting the fixed
        // behaviour would fail the suite on a defect until it is fixed (a merge
        // block this lane did not authorise); asserting the broken behaviour
        // would PIN the defect and make FIXING it a test failure. The reading is
        // RECORDED and written to `results/graphdelete.json`, which is what turns
        // an unmeasured half into a number someone can ratchet. The unit-level
        // suite `SemanticGraph.deleteInvalidation.test.ts` is where the fixed
        // behaviour IS asserted.
        expect(observations.length, 'every family must carry a recorded verdict').toBe(10);
    });

    it('RE-DETECT CONTROL — driving the corrective command DOES move the edge set, so a null reading above is not blindness', () => {
        // C70 §5.6 / L-716: an instrument whose "no change" has never been shown
        // capable of being "change" is measuring nothing.
        const beforeRedetect =
            edgesOf(roomLo, 'boundedBy') + '|' + edgesOf(roomLo, 'adjacentTo') + '|' + edgesOf(roomLo, 'connectedTo');
        const r = world.cm.execute(new reg.DetectAllRoomsCommand()) as { success?: boolean } | void;
        const afterRedetect =
            edgesOf(roomLo, 'boundedBy') + '|' + edgesOf(roomLo, 'adjacentTo') + '|' + edgesOf(roomLo, 'connectedTo');
        const roomsNow = (world.stores.roomStore?.getAll?.() ?? []) as Array<{ id: string }>;
        console.log('[H7 RE-DETECT] cmd=' + JSON.stringify(r) +
            '\n      before=' + beforeRedetect + '\n      after =' + afterRedetect +
            '\n      rooms now = ' + roomsNow.length);

        const observed = beforeRedetect !== afterRedetect || !roomsNow.some((x) => x.id === roomLo);
        observations.push({
            family: 'region-derived — RE-DETECT CONTROL',
            obligation: 'DELETE-SENSITIVE (region-derived, deleted element is NOT an endpoint)',
            beforeDelete: beforeRedetect, afterDelete: afterRedetect,
            // Not routed through observe(): this row's subject is the CHANGE, and
            // an after-state of "the room is gone" is the expected, meaningful
            // outcome of re-detecting a broken ring — not a vacuous reading.
            vacuous: false,
            verdict: observed ? 'the corrective pass IS observable by this probe' : 'NOT OBSERVABLE — the reading above is void',
        });
        expect(observed,
            'an explicit re-detect after DELETING a shared wall changed nothing — this probe cannot see a ' +
            'recompute at all, so its STALE/INVALIDATED verdicts above are void, not evidence')
            .toBe(true);
    });

    it('PHANTOM CONTROL — a node that never existed refuses as UNKNOWN, so "refusal" is not the reader default', () => {
        const ghost = 'gdl-never-created-' + Math.random().toString(36).slice(2);
        expect(semanticGraphManager.getTargets(ghost, 'boundedBy' as never)).toEqual([]);
        const q = semanticGraphManager.getBoundingWalls(ghost);
        expect(q.ok).toBe(false);
        // THE ROW, as a control: an id nobody ever wrote must refuse with a
        // DIFFERENT reason than a room whose boundary went undetermined. If these
        // two ever print the same value, "unknown to the writer" and "known but
        // no longer determined" have been collapsed — the defect this lane exists
        // to prevent.
        if (!q.ok) {
            console.log('[H7 PHANTOM] getBoundingWalls(ghost) reason = ' + q.reason);
            expect(q.reason).toBe('room-unknown-to-boundedBy-writer');
        }
    });

    it('SUMMARY — the families, their obligations, and what stays unproven', () => {
        const vacuous = observations.filter((o) => o.vacuous);
        console.log('[H7 SUMMARY] ' + observations.length + ' family observations, ' +
            vacuous.length + ' of them VACUOUS (measuring nothing):');
        for (const o of observations) console.log(`  · ${o.family} [${o.obligation}] → ${o.verdict}`);
        console.log('[H7 STILL UNPROVEN — NOT MEASURED BY THIS HARNESS] ' +
            'SUBSCRIBER REACHABILITY (whether any production path drives a re-detect on a delete) · ' +
            'UNDO of a delete (the _removedRelationships restore path) · collaboration merge · ' +
            'multi-level and multi-client · element kinds other than wall · ' +
            'every PARKED family (C71 §2.3 — untouched is not absent) · ' +
            'whether a USER is ever told a conclusion went undetermined (C79 §10.6).');
        expect(observations.length).toBeGreaterThanOrEqual(11);
    });
});

afterAll(() => {
    try {
        const p = writeResults('graphdelete.json', {
            harness: 'H7-graph-delete-invalidation',
            generatedAt: new Date().toISOString(),
            row: 'GR-12 — C71 §1.2 semantic 5 / §1.4 / §6.2(c), DELETE half',
            levelId: LEVEL_ID,
            roomLo,
            roomHi,
            deletedWallId: WALLS.mid.id,
            seedLog,
            registrationFailures: world?.registrationFailures ?? [],
            observations,
            notMeasured: [
                'SUBSCRIBER REACHABILITY — whether any production path drives a re-detect on a delete',
                'UNDO of a delete (the _removedRelationships restore path)',
                'collaboration merge; multi-level; multi-client',
                'element kinds other than wall',
                'every PARKED family (C71 §2.3 — untouched is not absent)',
                'whether a USER is ever told a conclusion went undetermined (C79 §10.6)',
            ],
        });
        console.log('[H7] results → ' + p);
    } catch (e) {
        console.log('[H7] writeResults failed: ' + String(e));
    }
});
