/**
 * §REGION-HOST-ATTRIBUTION — C79 §6.3 rows 6 / 7 / 8.
 *
 * THE DEFECT UNDER TEST: `CreateFloorCommand` and `CreateCeilingCommand` wrote
 * `boundingWallIds: []` UNCONDITIONALLY (C79 §7.1's named anti-pattern — none of
 * the three legal branches), and never wrote the reference-capable `sketch` field
 * their own types already declared. A floor or ceiling created from a room could
 * therefore never know, let alone follow, the walls that bounded it — silently.
 *
 * ⚠ WHAT MAKES THIS PROBE HONEST (C74 §3.4 — the fixture must not supply the
 * answer): no test below writes a `hostReference` literal, and none asserts
 * against a hand-built sketch. Every reference asserted on is one the command
 * PRODUCED from a plain room + wall fixture. The `boundingWallIds` assertions are
 * likewise read off the created record, not off the payload. A test that merely
 * echoed its own input would pass against the old `[]` code too, which is exactly
 * the failure mode this note exists to rule out.
 */

import { describe, it, expect } from 'vitest';
import { CreateFloorCommand } from '../src/floors/CreateFloorCommand';
import { CreateCeilingCommand } from '../src/ceilings/CreateCeilingCommand';
import {
    buildRoomFinishBoundarySketch,
    formatFinishBoundaryAttributionReport,
    type IdentifiedFinishWall,
} from '../src/rooms/roomBoundarySketch';
import type { CommandContext } from '../src/types';

// ── Fixture ────────────────────────────────────────────────────────────────
//
// A 6 m × 4 m rectangular room bounded by four 200 mm straight walls, authored on
// the wall CENTRELINES — the shape every room-derived finish is created from.
// Corners at (0,0) (6,0) (6,4) (0,4).

const T = 0.2; // wall thickness (m)

function straightWall(id: string, ax: number, az: number, bx: number, bz: number): IdentifiedFinishWall {
    return { id, baseLine: [{ x: ax, z: az }, { x: bx, z: bz }], thickness: T, openings: [] };
}

/** The four bounding walls of the reference room, on the centrelines. */
function refWalls(): IdentifiedFinishWall[] {
    return [
        straightWall('w-south', 0, 0, 6, 0),
        straightWall('w-east', 6, 0, 6, 4),
        straightWall('w-north', 6, 4, 0, 4),
        straightWall('w-west', 0, 4, 0, 0),
    ];
}

/** The room's CENTRELINE ring (what `room.boundary.polygon` holds). */
const CENTRELINE = [
    { x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 },
];

/** The ring as STORED after the inner-face inset (centreline pulled in by T/2). */
const INSET = [
    { x: T / 2, z: T / 2 }, { x: 6 - T / 2, z: T / 2 },
    { x: 6 - T / 2, z: 4 - T / 2 }, { x: T / 2, z: 4 - T / 2 },
];

function makeLookup(walls: IdentifiedFinishWall[], boundingWallIds?: string[]) {
    const byId = new Map(walls.map(w => [w.id, w]));
    return {
        getRoomById: (_id: string) => ({ boundingWallIds: boundingWallIds ?? walls.map(w => w.id) }),
        getWallById: (id: string) => byId.get(id),
    };
}

// ── §1.1 / §2.1 — references by construction ───────────────────────────────

describe('§REGION-HOST-ATTRIBUTION — references by construction (C79 §1.1, §2.1)', () => {
    it('emits a hostReference per boundary edge, attributed to the wall that produced it', () => {
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(refWalls()));

        expect(s.outerLoop.edges).toHaveLength(4);
        // Every edge is a REFERENCE, not a copied coordinate pair (§1.1).
        expect(s.outerLoop.edges.every(e => e.type === 'hostReference')).toBe(true);
        expect(s.attribution.hostEdges).toBe(4);
        expect(s.attribution.freeEdges).toBe(0);
    });

    it('attributes each edge to the CORRECT wall — not merely to some wall (§2.3)', () => {
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(refWalls()));
        const hosts = s.outerLoop.edges.map(e => (e.type === 'hostReference' ? e.hostId : null));

        // Edge order follows the stored ring, so the south edge is first, then east,
        // north, west. A wrong host is strictly worse than no host — so this asserts
        // the identity, not just the presence.
        expect(hosts).toEqual(['w-south', 'w-east', 'w-north', 'w-west']);
    });

    it('§1.3 — references and non-references are DISTINGUISHABLE in the record', () => {
        // Three bounding walls declared; the fourth edge has no wall behind it.
        const walls = refWalls().filter(w => w.id !== 'w-north');
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(walls, walls.map(w => w.id)));

        const kinds = s.outerLoop.edges.map(e => e.type);
        expect(kinds.filter(k => k === 'hostReference')).toHaveLength(3);
        expect(kinds.filter(k => k === 'freeLine')).toHaveLength(1);
        // The system can say WHICH parts of the element will follow (§5 precondition).
        expect(s.attribution.hostEdges).toBe(3);
        expect(s.attribution.freeEdges).toBe(1);
    });
});

// ── §3 — reference frame is contracted, not chosen ─────────────────────────

describe('§3 — reference frame is centerLine at offset 0', () => {
    it('names centerLine, never a face, at offset 0 (§3.1, §3.2)', () => {
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(refWalls()));
        for (const e of s.outerLoop.edges) {
            if (e.type !== 'hostReference') continue;
            expect(e.reference).toBe('centerLine');
            expect(e.offset).toBe(0);
        }
    });

    it('§3.2 — no edge ever names interiorFace / exteriorFace (the side is undeterminable)', () => {
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(refWalls()));
        const refs = s.outerLoop.edges
            .filter(e => e.type === 'hostReference')
            .map(e => (e as { reference: string }).reference);
        expect(refs).not.toContain('interiorFace');
        expect(refs).not.toContain('exteriorFace');
    });

    it('§1.1 — every reference carries all five facts', () => {
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(refWalls()));
        for (const e of s.outerLoop.edges) {
            if (e.type !== 'hostReference') continue;
            expect(e).toHaveProperty('hostId');
            expect(e).toHaveProperty('hostType', 'wall');
            expect(e).toHaveProperty('reference');
            expect(e).toHaveProperty('offset');
            expect(e).toHaveProperty('fallback');
        }
    });
});

// ── §4.3 — fallback present AT AUTHORING TIME ──────────────────────────────

describe('§4.3 — fallback populated at authoring time', () => {
    it('every emitted reference ships a fallback (never a rebuild dependency)', () => {
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(refWalls()));
        for (const e of s.outerLoop.edges) {
            if (e.type !== 'hostReference') continue;
            expect(e.fallback).toBeDefined();
            expect(Number.isFinite(e.fallback.start.x)).toBe(true);
            expect(Number.isFinite(e.fallback.end.z)).toBe(true);
        }
    });

    it('the fallback IS the traced geometry — so a wall deleted before any rebuild degrades to the authored line, not to nothing', () => {
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(refWalls()));
        const first = s.outerLoop.edges[0];
        expect(first?.type).toBe('hostReference');
        if (first?.type !== 'hostReference') return;
        // Edge 0 of the stored ring is INSET[0] → INSET[1].
        expect(first.fallback.start).toEqual({ x: INSET[0]!.x, z: INSET[0]!.z });
        expect(first.fallback.end).toEqual({ x: INSET[1]!.x, z: INSET[1]!.z });
    });
});

// ── §2.4 / §2.5 — the named failures and the counts ────────────────────────

describe('§2.4 / §2.5 — attribution failures are NAMED and COUNTED', () => {
    it('curved walls ALWAYS fall back, with reason `curved` (§2.5, §10.5)', () => {
        const walls = refWalls();
        // Bow the south wall into an arc. Its ring edge can no longer be attributed:
        // WallFaceRef cannot express "the Nth chord of this arc".
        walls[0] = { ...walls[0]!, curve: { control: { x: 3, z: -1.2 } } };
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(walls));

        // §2.5's reference reading, this family's analogue of the slab's
        // "3 straight + 1 arc → 3 host edges, N curved fallbacks": the curved wall
        // refuses, and the three straight walls are UNAFFECTED.
        expect(s.attribution.hostEdges).toBe(3);
        expect(s.attribution.curvedFallbacks).toBe(1);
        // The curved wall contributed NO reference.
        expect(s.attribution.hostWallIds).not.toContain('w-south');
        expect([...s.attribution.hostWallIds].sort()).toEqual(['w-east', 'w-north', 'w-west']);
    });

    it('§CURVED-RIVAL-IS-NOT-AMBIGUITY — one arc must not strip the STRAIGHT walls of their references', () => {
        // REGRESSION GUARD, measured before it was fixed. The curved candidate test
        // accepts on chord proximity bounded by the chord length (an arc bulges away
        // from its chord), which initially made the arc a rival on all four edges:
        // `curved=1, ambiguous=3`, hostEdges=0 — the three straight walls lost
        // references they had legitimately earned. Directional evidence outranks
        // positional evidence; over-refusal discards authored information too.
        const walls = refWalls();
        walls[0] = { ...walls[0]!, curve: { control: { x: 3, z: -1.2 } } };
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(walls));

        expect(s.attribution.ambiguousFallbacks).toBe(0);
        expect(s.boundingWallIds).toHaveLength(3);
    });

    it('…but two welded STRAIGHT walls still refuse, even with an arc in the candidate set', () => {
        // The curved-demotion must not become a licence to resolve genuine ambiguity.
        const walls = refWalls();
        walls[0] = { ...walls[0]!, curve: { control: { x: 3, z: -1.2 } } };
        walls.push(straightWall('w-east-twin', 6, 0, 6, 4));
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(walls));

        expect(s.attribution.ambiguousFallbacks).toBe(1);
        expect(s.attribution.hostWallIds).not.toContain('w-east');
        expect(s.attribution.hostWallIds).not.toContain('w-east-twin');
    });

    it('an id-less wall falls back with reason `noWallId`, never with an invented id (§2.4)', () => {
        const walls = refWalls();
        // The room names a wall the store cannot resolve — nothing to point at.
        const s = buildRoomFinishBoundarySketch(
            INSET, 'room-1',
            makeLookup(walls.filter(w => w.id !== 'w-east'), walls.map(w => w.id)),
        );
        expect(s.attribution.missingIdFallbacks).toBeGreaterThanOrEqual(1);
        expect(s.attribution.hostWallIds).not.toContain('w-east');
    });

    it('two DIFFERENT walls welded onto one edge drop to null with `ambiguous` — never first-writer (§2.3)', () => {
        const walls = refWalls();
        // A second, collinear wall welded over the south run. Keeping either would be
        // a coin flip; §2.3 says a wrong host is strictly worse than no host.
        walls.push(straightWall('w-south-twin', 0, 0, 6, 0));
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(walls));

        expect(s.attribution.ambiguousFallbacks).toBeGreaterThanOrEqual(1);
        // NEITHER of the rivals was kept.
        expect(s.attribution.hostWallIds).not.toContain('w-south');
        expect(s.attribution.hostWallIds).not.toContain('w-south-twin');
    });

    it('§10.3-TRANSITIVE — an undetected room yields `roomUndetected`, not a silent zero', () => {
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(refWalls(), []));
        expect(s.attribution.roomUndetectedFallbacks).toBe(4);
        expect(s.attribution.hostEdges).toBe(0);
        expect(s.boundingWallIds).toEqual([]);
        // …and it is NOT confused with a curved or ambiguous refusal.
        expect(s.attribution.curvedFallbacks).toBe(0);
        expect(s.attribution.ambiguousFallbacks).toBe(0);
    });

    it('§2.5 — all five counts surface on the result', () => {
        const s = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(refWalls()));
        for (const k of [
            'hostEdges', 'freeEdges', 'curvedFallbacks',
            'missingIdFallbacks', 'ambiguousFallbacks',
        ] as const) {
            expect(typeof s.attribution[k]).toBe('number');
        }
        expect(Array.isArray(s.attribution.hostWallIds)).toBe(true);
    });

    it('§2.6 — zero-host and all-host are NOT the same value at the caller', () => {
        const all = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(refWalls()));
        const none = buildRoomFinishBoundarySketch(INSET, 'room-1', makeLookup(refWalls(), []));

        expect(all.attribution.hostEdges).not.toBe(none.attribution.hostEdges);
        expect(all.boundingWallIds).not.toEqual(none.boundingWallIds);
        // The REPORT distinguishes them too — a fallback is never silently absorbed.
        const rAll = formatFinishBoundaryAttributionReport('floor', all.attribution);
        const rNone = formatFinishBoundaryAttributionReport('floor', none.attribution);
        expect(rAll).not.toBe(rNone);
        expect(rNone).toMatch(/room-undetected=4/);
        expect(rAll).toMatch(/4 wall-attributed edge\(s\)/);
    });

    it('a finish with NO host room attributes nothing and says why', () => {
        const s = buildRoomFinishBoundarySketch(INSET, undefined, makeLookup(refWalls()));
        expect(s.attribution.hostEdges).toBe(0);
        expect(s.attribution.roomUndetectedFallbacks).toBe(4);
        expect(s.boundingWallIds).toEqual([]);
    });
});

// ── §7.2(a) — boundingWallIds is POPULATED, on the real commands ───────────
//
// These drive the COMMANDS, not the helper, because C79 §7.1's defect was in the
// commands: the field was hardcoded `[]` at the record-construction site.

interface Stores {
    floorStore: ReturnType<typeof makeElementStore>;
    ceilingStore: ReturnType<typeof makeElementStore>;
    roomStore: { getById: (id: string) => unknown };
    wallStore: { getById: (id: string) => IdentifiedFinishWall | undefined; getByLevel: () => IdentifiedFinishWall[] };
}

function makeElementStore() {
    const items = new Map<string, any>();
    return {
        add: (el: any) => { items.set(el.id, el); },
        remove: (id: string) => { items.delete(id); },
        getById: (id: string) => items.get(id),
        getAll: () => [...items.values()],
    };
}

/** A context whose room reports the four bounding walls, as detection produces it. */
function makeCtx(opts?: { boundingWallIds?: string[]; walls?: IdentifiedFinishWall[] }): CommandContext {
    const walls = opts?.walls ?? refWalls();
    const byId = new Map(walls.map(w => [w.id, w]));
    const stores: Stores = {
        floorStore: makeElementStore(),
        ceilingStore: makeElementStore(),
        roomStore: {
            getById: (_id: string) => ({
                boundary: { polygon: CENTRELINE, height: 2.7 },
                boundingWallIds: opts?.boundingWallIds ?? walls.map(w => w.id),
                finishes: {},
            }),
        },
        wallStore: {
            getById: (id: string) => byId.get(id),
            getByLevel: () => walls,
        },
    };
    return {
        stores,
        projectContext: { activeLevelId: 'L0' },
        bimManager: {
            getLevelById: (id: string) => ({ id, elevation: 0 }),
            registerElement: () => {},
            unregisterElement: () => {},
        },
    } as unknown as CommandContext;
}

describe('C79 §7.2(a) — boundingWallIds is POPULATED by the commands (row 6 / row 7)', () => {
    it('CreateFloorCommand writes the walls that produced the boundary — not `[]`', () => {
        const ctx = makeCtx();
        const cmd = new CreateFloorCommand({
            floorId: 'f-1', ifcGuid: 'g-1', polygon: CENTRELINE,
            boundarySource: 'room-centreline', levelId: 'L0', hostRoomId: 'room-1',
        });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);

        const floor = (ctx.stores as unknown as Stores).floorStore.getById('f-1');
        expect(floor).toBeDefined();
        // THE REGRESSION GUARD: this was `[]` on every path before C79 row 6 closed.
        expect(floor.boundingWallIds.length).toBeGreaterThan(0);
        expect([...floor.boundingWallIds].sort())
            .toEqual(['w-east', 'w-north', 'w-south', 'w-west']);
    });

    it('CreateFloorCommand writes a reference-carrying sketch (the field was never written)', () => {
        const ctx = makeCtx();
        new CreateFloorCommand({
            floorId: 'f-2', ifcGuid: 'g-2', polygon: CENTRELINE,
            boundarySource: 'room-centreline', levelId: 'L0', hostRoomId: 'room-1',
        }).execute(ctx);

        const floor = (ctx.stores as unknown as Stores).floorStore.getById('f-2');
        expect(floor.sketch).toBeDefined();
        expect(floor.sketch.outerLoop.edges.length).toBeGreaterThan(0);
        const refs = floor.sketch.outerLoop.edges.filter((e: any) => e.type === 'hostReference');
        expect(refs.length).toBe(4);
        // §4.3 — the fallback is there at CREATION, not after a later rebuild.
        expect(refs.every((e: any) => e.fallback && e.fallback.start && e.fallback.end)).toBe(true);
        // §3.1
        expect(refs.every((e: any) => e.reference === 'centerLine' && e.offset === 0)).toBe(true);
    });

    it('CreateCeilingCommand does the same, via the SAME helper (§3.4 one edge shape)', () => {
        const ctx = makeCtx();
        const cmd = new CreateCeilingCommand({
            ceilingId: 'c-1', ifcGuid: 'g-3', polygon: CENTRELINE, height: 2.7,
            boundarySource: 'room-centreline', levelId: 'L0', hostRoomId: 'room-1',
        });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);

        const ceiling = (ctx.stores as unknown as Stores).ceilingStore.getById('c-1');
        expect([...ceiling.boundingWallIds].sort())
            .toEqual(['w-east', 'w-north', 'w-south', 'w-west']);
        expect(ceiling.sketch.outerLoop.edges.filter((e: any) => e.type === 'hostReference')).toHaveLength(4);
    });

    it('§7.4 — a room\'s FLOOR and CEILING carry byte-identical references (no per-path divergence)', () => {
        const ctx = makeCtx();
        new CreateFloorCommand({
            floorId: 'f-3', ifcGuid: 'g-4', polygon: CENTRELINE,
            boundarySource: 'room-centreline', levelId: 'L0', hostRoomId: 'room-1',
        }).execute(ctx);
        new CreateCeilingCommand({
            ceilingId: 'c-3', ifcGuid: 'g-5', polygon: CENTRELINE, height: 2.7,
            boundarySource: 'room-centreline', levelId: 'L0', hostRoomId: 'room-1',
        }).execute(ctx);

        const s = ctx.stores as unknown as Stores;
        expect(s.floorStore.getById('f-3').sketch.outerLoop.edges)
            .toEqual(s.ceilingStore.getById('c-3').sketch.outerLoop.edges);
        expect(s.floorStore.getById('f-3').boundingWallIds)
            .toEqual(s.ceilingStore.getById('c-3').boundingWallIds);
    });

    it('an undetected room yields an EMPTY boundingWallIds that is MEASURED, not hardcoded', () => {
        // The distinction matters: the old code produced `[]` here AND on the fully
        // attributable fixture above. Now the two differ, which is the whole point.
        const ctx = makeCtx({ boundingWallIds: [] });
        new CreateFloorCommand({
            floorId: 'f-4', ifcGuid: 'g-6', polygon: CENTRELINE,
            boundarySource: 'explicit-polygon', levelId: 'L0', hostRoomId: 'room-1',
        }).execute(ctx);

        const floor = (ctx.stores as unknown as Stores).floorStore.getById('f-4');
        expect(floor.boundingWallIds).toEqual([]);
        // …and every edge is a free line carrying its own geometry, so the element
        // still survives and is inspectable (§4.1).
        expect(floor.sketch.outerLoop.edges.every((e: any) => e.type === 'freeLine')).toBe(true);
    });

    it('a floor with no host room at all still creates, with nothing attributed (§4.1 fail-safe)', () => {
        const ctx = makeCtx();
        new CreateFloorCommand({
            floorId: 'f-5', ifcGuid: 'g-7', polygon: CENTRELINE,
            boundarySource: 'explicit-polygon', levelId: 'L0',
        }).execute(ctx);

        const floor = (ctx.stores as unknown as Stores).floorStore.getById('f-5');
        expect(floor).toBeDefined();
        expect(floor.boundingWallIds).toEqual([]);
    });
});

// ── Row 8 — the batch variants INHERIT, they do not copy ───────────────────

/** Read a source file under this package's `src/`. The suite runs in happy-dom,
 *  where `import.meta.url` is not a `file:` URL, and `process.cwd()` is the repo
 *  root rather than the package — so walk up from cwd to the package directory. */
async function readSrc(rel: string): Promise<string> {
    const [fs, path] = await Promise.all([import('node:fs/promises'), import('node:path')]);
    const cwd = process.cwd();
    const pkgRoot = cwd.endsWith(path.join('packages', 'command-registry'))
        ? cwd
        : path.resolve(cwd, 'packages', 'command-registry');
    return fs.readFile(path.resolve(pkgRoot, 'src', rel), 'utf8');
}

describe('C79 §6.3 row 8 — the batch variants inherit the fix (they do not re-implement it)', () => {
    it('CreateFloorsByRoomTypeCommand composes CreateFloorCommand, so the references come free', async () => {
        // STRUCTURAL, not behavioural: row 8's status is "inherits its parent's
        // defect". The inheritance is by COMPOSITION — the batch constructs the
        // parent command rather than building a FloorData of its own — so proving
        // it still routes every creation through the parent proves it inherits the
        // FIX by the same mechanism it inherited the defect. A batch that grew its
        // own record-construction site would be C79 §7.4's per-path divergence.
        const src = await readSrc('floors/CreateFloorsByRoomTypeCommand.ts');

        expect(src).toMatch(/new CreateFloorCommand\(/);
        // It must NOT construct a floor record itself.
        expect(src).not.toMatch(/boundingWallIds\s*:/);
        expect(src).not.toMatch(/floorStore\.add\(/);
    });

    it('CreateCeilingsByRoomCommand likewise composes CreateCeilingCommand', async () => {
        const src = await readSrc('ceilings/CreateCeilingsByRoomCommand.ts');

        expect(src).toMatch(/new CreateCeilingCommand\(/);
        expect(src).not.toMatch(/boundingWallIds\s*:/);
        expect(src).not.toMatch(/ceilingStore\.add\(/);
    });

    it('a floor built through the batch\'s own payload shape carries references end-to-end', () => {
        // The batch hands the parent the CENTRELINE ring + `boundarySource:
        // 'room-centreline'` (CreateFloorsByRoomTypeCommand:184-185). Driving the
        // parent with exactly that payload is the batch's per-room behaviour, minus
        // the store iteration — so this asserts the inherited OUTCOME, not just the
        // call graph above.
        const ctx = makeCtx();
        new CreateFloorCommand({
            floorId: 'f-batch', ifcGuid: 'g-b', polygon: CENTRELINE,
            boundarySource: 'room-centreline', levelId: 'L0', hostRoomId: 'room-1',
            label: 'Room Floor',
        }).execute(ctx);

        const floor = (ctx.stores as unknown as Stores).floorStore.getById('f-batch');
        expect(floor.boundingWallIds).toHaveLength(4);
        expect(floor.sketch.outerLoop.edges.filter((e: any) => e.type === 'hostReference')).toHaveLength(4);
    });

    it('and a ceiling built through the batch\'s payload shape does too', () => {
        const ctx = makeCtx();
        new CreateCeilingCommand({
            ceilingId: 'c-batch', ifcGuid: 'g-c', polygon: CENTRELINE, height: 2.7,
            boundarySource: 'room-centreline', levelId: 'L0', hostRoomId: 'room-1',
            label: 'Room Ceiling',
        }).execute(ctx);

        const ceiling = (ctx.stores as unknown as Stores).ceilingStore.getById('c-batch');
        expect(ceiling.boundingWallIds).toHaveLength(4);
        expect(ceiling.sketch.outerLoop.edges.filter((e: any) => e.type === 'hostReference')).toHaveLength(4);
    });
});

// ── Undo — the new fields must not break the reversal ──────────────────────

describe('undo still reverses cleanly with the sketch present', () => {
    it('CreateFloorCommand.undo removes the floor', () => {
        const ctx = makeCtx();
        const cmd = new CreateFloorCommand({
            floorId: 'f-u', ifcGuid: 'g-u', polygon: CENTRELINE,
            boundarySource: 'room-centreline', levelId: 'L0', hostRoomId: 'room-1',
        });
        cmd.execute(ctx);
        expect((ctx.stores as unknown as Stores).floorStore.getById('f-u')).toBeDefined();
        cmd.undo(ctx);
        expect((ctx.stores as unknown as Stores).floorStore.getById('f-u')).toBeUndefined();
    });

    it('CreateCeilingCommand.undo removes the ceiling', () => {
        const ctx = makeCtx();
        const cmd = new CreateCeilingCommand({
            ceilingId: 'c-u', ifcGuid: 'g-u2', polygon: CENTRELINE, height: 2.7,
            boundarySource: 'room-centreline', levelId: 'L0', hostRoomId: 'room-1',
        });
        cmd.execute(ctx);
        expect((ctx.stores as unknown as Stores).ceilingStore.getById('c-u')).toBeDefined();
        cmd.undo(ctx);
        expect((ctx.stores as unknown as Stores).ceilingStore.getById('c-u')).toBeUndefined();
    });
});
