// ─── HARNESS 6 — MOVE-TIME INVALIDATION OF SEMANTIC-GRAPH EDGES (GR-12) ─────
//
// THE ROW THIS EXISTS FOR
// ─────────────────────────────────────────────────────────────────────────────
// GR-12: *"Mutation-update on MOVE is UNPROVEN for every family. Semantic 5 of
//         the six required semantics has never been measured, and no arm of any
//         of the three specified gates covers it. `boundedBy` after a
//         room-boundary change is the row most likely to be wrong."*
// Fix column, quoting the contract at itself: *"a move-time arm; it is named
// 'the first thing to add' by the contract itself"* (C71 §1.4, §6.2(c)).
//
// `check-graph-write-coverage` prints, in its own cannot-see block and on every
// run: **"move-time invalidation (C71 §1.2 semantic 5) — NO ARM. UNPROVEN for
// every family."** That sentence is this file's subject, and after this file it
// is no longer true for the two families measured here.
//
// WHY THIS IS NOT `check-move-propagation`
// ─────────────────────────────────────────────────────────────────────────────
// That gate exists, runs, and answers the founder's ORIGINAL question — "move a
// wall, does the SLAB follow?" — over the four REGION-DERIVED GEOMETRY families
// (slab, floor finish, ceiling, roof). It says nothing about semantic-graph EDGE
// families, and the register records exactly that residual: *"`check-graph-write-
// coverage` still prints NO ARM for move-time invalidation of the semantic-graph
// edge families — that half (e.g. `boundedBy` after a boundary change) remains
// UNPROVEN."* Geometry following and edges staying true are two different claims
// over two different substrates. This file is the second one.
//
// ═════════════════════════════════════════════════════════════════════════════
// THE CLASSIFICATION THIS HARNESS ESTABLISHES — and why it is the real finding
// ═════════════════════════════════════════════════════════════════════════════
// "Is the edge invalidated when geometry moves?" is the WRONG question asked of
// every family at once, and asking it that way is why the answer has been
// UNPROVEN rather than merely bad. The declared families split in two:
//
//   ID-KEYED (`sitsOn`, `hosts`/`hostedBy`, `contains`, `supports`) — the edge
//     asserts a relation between two IDENTITIES. Moving either endpoint's
//     geometry cannot falsify it: a wall that slides two metres still sits on
//     the same level and still hosts the same door. For these families
//     move-time invalidation is NOT REQUIRED, and a gate that demanded it would
//     be manufacturing work. **Surviving a move is the CORRECT behaviour**, and
//     this file proves they do survive rather than assuming it.
//
//   REGION-DERIVED (`boundedBy`, `adjacentTo`, `connectedTo`) — the edge is a
//     CONCLUSION recomputed from geometry: which walls enclose this room, which
//     rooms touch. Move a bounding wall and the conclusion can become false
//     while the edge still reads true and confident. For these families move-time
//     invalidation IS required, and this is the family C71 §1.4 was pointing at.
//
// Nothing in the repository writes that split down, so every previous reading
// scored all ten families against one obligation and got an unusable number.
//
// ═════════════════════════════════════════════════════════════════════════════
// EXACTLY WHAT THIS PROBE DOES AND DOES **NOT** COVER
// ═════════════════════════════════════════════════════════════════════════════
// COVERED — executed, against the real `CommandManager`, the real stores and the
// real module-singleton `semanticGraphManager`:
//   a room is detected from four real walls; its `boundedBy` edges are read; ONE
//   bounding wall is then MOVED by a real `UpdateWallBaselineCommand`; the graph
//   is read back by the same queries production readers use.
//
// NOT COVERED — and this one is load-bearing, so it is stated before any result:
//   **(a) SUBSCRIBER REACHABILITY.** In the live editor a store mutation can
//   reach a re-detect through the `BatchCoordinator` / EngineBootstrap
//   subscribers. This world composes commands and stores, NOT those subscribers.
//   So a "the edge did not change" reading here means *the command path does not
//   invalidate it* — it does NOT prove no production path does. Reporting it as
//   the stronger claim would be the failure-vs-empty conflation this suite exists
//   to forbid, so the RE-DETECT CONTROL below establishes the difference: it
//   drives the corrective command EXPLICITLY and shows the edge set does move
//   when something drives it. What is measured is therefore precisely: *the move
//   command itself performs no invalidation, and correction requires a separate,
//   explicitly-driven detection pass.* Whether any production path drives that
//   pass on a move is a REACHABILITY question and remains UNPROVEN (GR-18/CE-05).
//   (b) Undo/redo of a move, collaboration merge, multi-level and multi-client.
//   (c) The other seven declared families, and every PARKED family (C71 §2.3 —
//       untouched is not absent).
//   (d) Whether a USER is ever told an edge went stale (C79 §10.6, no UI surface).
//
// STUB LEDGER: inherited whole from `../world` (declared there).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import type { World } from '../world';
import { writeResults } from '../report';

let world: World;
let reg: any;
const seedLog: string[] = [];

const LEVEL_ID = 'GMV-L0';

/** The four walls of a closed 6 × 4 rectangle. `south` is the one that moves. */
const WALLS = {
    south: { id: 'gmv-w-south', start: { x: 0, z: 0 }, end: { x: 6, z: 0 } },
    east: { id: 'gmv-w-east', start: { x: 6, z: 0 }, end: { x: 6, z: 4 } },
    north: { id: 'gmv-w-north', start: { x: 6, z: 4 }, end: { x: 0, z: 4 } },
    west: { id: 'gmv-w-west', start: { x: 0, z: 4 }, end: { x: 0, z: 0 } },
} as const;

/** Populated by the seed; every read-back below is scoped to it. */
let roomId = '';

interface Observation {
    family: string;
    obligation: 'MOVE-INVARIANT (id-keyed)' | 'MOVE-SENSITIVE (region-derived)';
    beforeMove: string;
    afterMove: string;
    verdict: string;
    /**
     * TRUE when the family's edge set was EMPTY on both sides of the move.
     *
     * This flag is the whole reason the file can be quoted. `[] → []` is
     * unchanged, and a comparator that graded it "SURVIVED — correct" or
     * "STALE" would be reporting a verdict about an observation that never
     * happened — the *this repository's signature defect* (failure and empty as
     * the same value) committed by the very instrument built to find it. A
     * vacuous row proves NOTHING about its family and is excluded from the
     * asserted arms; it is still printed, because a silently-dropped row is how
     * a fixture stops covering a family without anyone noticing.
     */
    vacuous: boolean;
}
const observations: Observation[] = [];

/** Build an observation, deriving vacuity rather than trusting the caller. */
function observe(
    family: string,
    obligation: Observation['obligation'],
    beforeMove: string,
    afterMove: string,
    verdictWhenReal: string,
): Observation {
    const vacuous = beforeMove === '[]' && afterMove === '[]';
    return {
        family, obligation, beforeMove, afterMove, vacuous,
        verdict: vacuous
            ? 'VACUOUS — the edge set was empty on both sides; this row measures nothing about this family'
            : verdictWhenReal,
    };
}

/** Deterministic, order-independent rendering of one node's out-edges. */
function edgesOf(from: string, type: string): string {
    return JSON.stringify([...semanticGraphManager.getTargets(from, type as never)].sort());
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
        levelId: LEVEL_ID, name: 'Graph Move Probe Level', elevation: 0, height: 3,
    })));

    for (const [name, w] of Object.entries(WALLS)) {
        s('wall ' + name, () => cm.execute(new reg.CreateWallCommand(w.id, {
            start: w.start, end: w.end, height: 3, thickness: 0.2,
            levelId: LEVEL_ID, materialColor: '#aaaaaa',
        })));
    }

    // A door hosted in the SOUTH wall — the wall that will move. Its `hosts` /
    // `hostedBy` edges are the ID-KEYED contrast arm.
    s('opening in south wall', () => cm.execute(new reg.CreateWallOpeningCommand({
        wallId: WALLS.south.id,
        openingData: {
            id: 'gmv-door-1', elementId: 'gmv-door-el-1', type: 'door',
            offset: 2.5, width: 0.9, height: 2.1, sillHeight: 0,
        },
    })));

    // Detection LAST, so the room is derived from the finished wall ring.
    s('detect rooms', () => cm.execute(new reg.DetectAllRoomsCommand()));

    const rooms = (world.stores.roomStore?.getAll?.() ?? []) as Array<{ id: string; levelId?: string }>;
    roomId = rooms.find((r) => r.levelId === LEVEL_ID)?.id ?? rooms[0]?.id ?? '';

    console.log('[H6] seed: ' + seedLog.join(' | ') +
        ' | rooms=' + rooms.length + ' roomId=' + roomId +
        ' | graph size = ' + semanticGraphManager.size);
}, 600_000);

describe('HARNESS 6 — move-time invalidation of semantic-graph edges (GR-12 · C71 §1.2 semantic 5)', () => {
    it('MISCONFIGURED GUARD — the seed produced a room with `boundedBy` edges, or nothing below means anything', () => {
        // C74 §3.4: a probe that reports "the edge did not change" over an edge
        // set that was EMPTY the whole time is measuring its own fixture. This
        // guard is what separates "move-time invalidation is absent" from "this
        // harness never built a graph".
        console.log('[H6] registrationFailures=' + JSON.stringify(world.registrationFailures));
        expect(roomId, 'no room was detected — the fixture, not the subject, has failed').toBeTruthy();
        const bounded = semanticGraphManager.getTargets(roomId, 'boundedBy' as never);
        console.log(`[H6 GUARD] boundedBy(${roomId}) = ${JSON.stringify(bounded)}`);
        expect(bounded.length, 'the detected room has NO boundedBy edges — nothing below can be measured')
            .toBeGreaterThan(0);
    });

    it('THE MEASUREMENT — a real wall MOVE, and the graph read back before and after', () => {
        const wallId = WALLS.south.id;

        // ── BEFORE ────────────────────────────────────────────────────────────
        const before = {
            boundedBy: edgesOf(roomId, 'boundedBy'),
            adjacentTo: edgesOf(roomId, 'adjacentTo'),
            hosts: edgesOf(wallId, 'hosts'),
            sitsOn: edgesOf(wallId, 'sitsOn'),
        };
        const graphBefore = JSON.stringify(semanticGraphManager.serialize());

        // ── THE MOVE ──────────────────────────────────────────────────────────
        // The south wall slides 3 m south (z 0 → -3). This is not a nudge: it
        // BREAKS the closed ring — the wall no longer meets its two neighbours,
        // so the room it bounded cannot still be bounded by it. Any `boundedBy`
        // edge naming this wall afterwards is measurably FALSE, not merely
        // imprecise. A 20 mm move would have left the answer arguable.
        const moved = world.cm.execute(new reg.UpdateWallBaselineCommand({
            wallId,
            newBaseLine: [
                { x: 0, y: 0, z: -3 },
                { x: 6, y: 0, z: -3 },
            ],
        })) as { success?: boolean; error?: string } | void;
        console.log('[H6 MOVE] UpdateWallBaselineCommand → ' + JSON.stringify(moved));
        expect(moved && (moved as { success?: boolean }).success,
            'the move itself was refused — the subject never ran').not.toBe(false);

        // ── AFTER ─────────────────────────────────────────────────────────────
        const after = {
            boundedBy: edgesOf(roomId, 'boundedBy'),
            adjacentTo: edgesOf(roomId, 'adjacentTo'),
            hosts: edgesOf(wallId, 'hosts'),
            sitsOn: edgesOf(wallId, 'sitsOn'),
        };
        const graphAfter = JSON.stringify(semanticGraphManager.serialize());

        // ── ID-KEYED families: surviving is CORRECT, and it is asserted ───────
        // These two are the reason this file does not simply assert "the graph
        // changed". If it did, it would be demanding invalidation of edges that
        // must not be invalidated.
        observations.push(observe(
            'sitsOn (wall → level)', 'MOVE-INVARIANT (id-keyed)',
            before.sitsOn, after.sitsOn,
            before.sitsOn === after.sitsOn ? 'SURVIVED — correct' : 'CHANGED — WRONG',
        ));
        observations.push(observe(
            'hosts (wall → opening)', 'MOVE-INVARIANT (id-keyed)',
            before.hosts, after.hosts,
            before.hosts === after.hosts ? 'SURVIVED — correct' : 'CHANGED — WRONG',
        ));
        expect(after.sitsOn,
            'a wall that MOVED still sits on the same level — this edge is id-keyed and must survive')
            .toBe(before.sitsOn);
        expect(after.hosts,
            'a wall that MOVED still hosts the same opening — this edge is id-keyed and must survive')
            .toBe(before.hosts);

        // ── REGION-DERIVED families: the actual GR-12 question ────────────────
        observations.push(observe(
            'boundedBy (room → bounding walls)', 'MOVE-SENSITIVE (region-derived)',
            before.boundedBy, after.boundedBy,
            before.boundedBy !== after.boundedBy
                ? 'INVALIDATED by the move command'
                : 'STALE — the move command performed no invalidation, and the edge still names a wall that no longer bounds the room',
        ));
        observations.push(observe(
            'adjacentTo (room → room)', 'MOVE-SENSITIVE (region-derived)',
            before.adjacentTo, after.adjacentTo,
            before.adjacentTo !== after.adjacentTo
                ? 'INVALIDATED by the move command'
                : 'STALE — the move command performed no invalidation',
        ));

        console.log('[H6 RESULT] graph changed by the move = ' + (graphBefore !== graphAfter));
        for (const o of observations) {
            console.log(`  · ${o.family} [${o.obligation}]\n      before=${o.beforeMove}\n      after =${o.afterMove}\n      → ${o.verdict}`);
        }

        // At least ONE arm on each side of the split must be non-vacuous, or the
        // classification this file exists to establish is asserted over nothing.
        // (A first run had BOTH id-keyed arms vacuous: `hosts` was empty because
        // the opening seed was silently REFUSED, and the harness would happily
        // have reported "SURVIVED — correct" for an edge that never existed.)
        expect(observations.some((o) => o.obligation.startsWith('MOVE-INVARIANT') && !o.vacuous),
            'every id-keyed arm was vacuous — the seed produced no such edge, so nothing is measured').toBe(true);
        expect(observations.some((o) => o.obligation.startsWith('MOVE-SENSITIVE') && !o.vacuous),
            'every region-derived arm was vacuous — the seed produced no such edge, so nothing is measured').toBe(true);

        // NO assertion is made on the region-derived families here, and that is
        // deliberate, not a softened test. Asserting `toBe(true)` would fail the
        // suite on a defect the register already carries as OPEN, which converts
        // a measurement into a merge block for work this lane did not authorise;
        // asserting `toBe(false)` would PIN the defect and make fixing it a test
        // failure — the worst of the two. The reading is RECORDED, printed, and
        // written to `results/graphmove.json`, which is what turns "NO ARM,
        // UNPROVEN for every family" into a number someone can ratchet.
        expect(observations.length, 'every family must carry a recorded verdict').toBe(4);
    });

    it('RE-DETECT CONTROL — driving the corrective command DOES move the edge set, so a null reading above is not blindness', () => {
        // C70 §5.6 / L-716: an instrument whose "no change" has never been shown
        // capable of being "change" is measuring nothing. If the reading above is
        // STALE, this control is the entire reason that reading can be believed:
        // it proves the same read-back, over the same node, reports a DIFFERENT
        // edge set the moment something actually recomputes the region — so the
        // earlier null is "nothing drove a recompute", never "the probe is blind".
        const beforeRedetect = edgesOf(roomId, 'boundedBy');
        const r = world.cm.execute(new reg.DetectAllRoomsCommand()) as { success?: boolean } | void;
        const afterRedetect = edgesOf(roomId, 'boundedBy');
        const roomsNow = (world.stores.roomStore?.getAll?.() ?? []) as Array<{ id: string }>;
        console.log('[H6 RE-DETECT] cmd=' + JSON.stringify(r) +
            '\n      before=' + beforeRedetect + '\n      after =' + afterRedetect +
            '\n      rooms now = ' + roomsNow.length + ' (' + roomsNow.map((x) => x.id).join(',') + ')');

        // The ring is broken, so an explicit re-detect must either re-derive a
        // different bounding set for this room or remove the room outright. Both
        // are "the recompute was observed"; only "byte-identical" is blindness.
        const observed = beforeRedetect !== afterRedetect || !roomsNow.some((x) => x.id === roomId);
        observations.push({
            family: 'boundedBy — RE-DETECT CONTROL',
            obligation: 'MOVE-SENSITIVE (region-derived)',
            beforeMove: beforeRedetect, afterMove: afterRedetect,
            // Not routed through observe(): this row's subject is the CHANGE, and
            // an after-set of `[]` is the expected, meaningful outcome of
            // re-detecting a broken ring — not a vacuous reading.
            vacuous: false,
            verdict: observed ? 'the corrective pass IS observable by this probe' : 'NOT OBSERVABLE — the reading above is void',
        });
        expect(observed,
            'an explicit re-detect over a BROKEN wall ring changed nothing — this probe cannot see a ' +
            'recompute at all, so its STALE/INVALIDATED verdicts above are void, not evidence')
            .toBe(true);
    });

    it('PHANTOM CONTROL — a node that never existed answers empty, so "unchanged" is not the reader default', () => {
        const ghost = 'gmv-never-created-' + Math.random().toString(36).slice(2);
        expect(semanticGraphManager.getTargets(ghost, 'boundedBy' as never)).toEqual([]);
    });

    it('SUMMARY — the families, their obligations, and what stays unproven', () => {
        const vacuous = observations.filter((o) => o.vacuous);
        console.log('[H6 SUMMARY] ' + observations.length + ' family observations, ' +
            vacuous.length + ' of them VACUOUS (measuring nothing):');
        for (const o of observations) console.log(`  · ${o.family} [${o.obligation}] → ${o.verdict}`);
        console.log('[H6 STILL UNPROVEN — NOT MEASURED BY THIS HARNESS] ' +
            'SUBSCRIBER REACHABILITY (whether any production path drives a re-detect on a move — ' +
            'this world composes commands and stores, not the EngineBootstrap/BatchCoordinator ' +
            'subscribers) · undo/redo of a move · collaboration merge · multi-level and multi-client · ' +
            'the seven declared families not named above · every PARKED family (untouched ≠ absent).');
        expect(observations.length).toBeGreaterThanOrEqual(5);
    });
});

afterAll(() => {
    try {
        const p = writeResults('graphmove.json', {
            harness: 'H6-graph-move-invalidation',
            generatedAt: new Date().toISOString(),
            row: 'GR-12 — C71 §1.2 semantic 5 / §1.4 / §6.2(c)',
            levelId: LEVEL_ID,
            roomId,
            seedLog,
            registrationFailures: world?.registrationFailures ?? [],
            observations,
            notMeasured: [
                'SUBSCRIBER REACHABILITY — whether any production path drives a re-detect on a move',
                'undo/redo of a move',
                'collaboration merge; multi-level; multi-client',
                'the seven declared families not observed here',
                'every PARKED family (C71 §2.3 — untouched is not absent)',
            ],
        });
        console.log('[H6] results → ' + p);
    } catch (e) {
        console.log('[H6] writeResults failed: ' + String(e));
    }
});
