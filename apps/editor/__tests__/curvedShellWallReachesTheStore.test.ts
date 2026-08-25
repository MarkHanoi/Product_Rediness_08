/**
 * @vitest-environment happy-dom
 */
// §L-11171 (lane ARCS66) — a boundary drawn in CURVED mode becomes a CURVED WALL in
// the AUTHORITATIVE wall store, proven end to end on the runtime `composeRuntime()`
// produces, through the chat entry point the founder uses.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS
// ═══════════════════════════════════════════════════════════════════════════════
//
// Commit 1329a3a4 (L-11130) taught the residential shell builders to emit ONE
// curved wall per arc run. Its evidence was a helper spec on hand-drawn circles and
// the generator's existing tests on a rectangle. Nothing in that evidence started
// from a boundary the CURVED TOOL drew, and nothing read a `Wall.curve` back out of
// the store the editor renders from. This repo's dominant defect is authored-but-
// unreachable ([[committed-is-not-reachable]], L-10930/L-10931), so this file walks
// the chain at the layer the user experiences:
//
//   Curved tool sampler → boundaryLine.create (real bus) → generation.building
//   (real chat seam, real controller, real orchestrator, real executor)
//   → wall.batch.create (real bus, real handler) → the geometry-wall singleton
//   `ProjectSerializer` reads → `wall.curve` with the AUTHORED control point.
//
// ─── STUB LEDGER (read before trusting any green below) ─────────────────────────
//
// The runtime is a real `composeRuntime`; the bus is its real bus; the boundary-line
// store, the seam, the controller, the orchestrator, the executor, the wall handler
// and the wall store are all the production objects. Four INPUTS the browser supplies
// and a headless process does not are declared here:
//
//   1. `window.projectContext.activeLevelId` — what `resolveActiveLevelId()` reads.
//   2. `window.bimManager` — `getLevelById` / `getActiveLevel` (elevation + height),
//      the same two members `residentialFacadeAllFloors.test.ts` supplies.
//   3. `window.commandManager` — the legacy manager the executor requires for level
//      minting and every OPENING (doors, windows, entrance). It is a recorder here:
//      it returns success and captures the minted upper-storey ids. ⛔ So NOTHING on
//      the legacy path is proven by this file — no door, no window, no level record.
//      Walls do NOT go through it: `wall.batch.create` is a bus verb, and that is the
//      leg this file measures.
//   4. The wall store's engine half, attached the way `initBuilders.ts` does, with a
//      level authority that answers for ANY level id — because the upper storeys are
//      minted through stub 3 and exist nowhere else in this process. The
//      `composedBusElementReadback` A-3 arm uses the same substitution for one level.
//
// ⚠ WHAT IS NOT PROVEN: rendering. The curved wall's mesh, its plan symbol and its
// joins are built by the engine from the record asserted here; that is measured by
// the geometry-wall suites and in the browser. This file proves the RECORD.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { composeRuntime } from '@pryzm/runtime-composer';
import { arcSegmentThroughMidpoint, bezierControlFromMidpoint } from '@pryzm/geometry-slab';
import { detectJunctionClusters, DEFAULT_SNAP_RADIUS } from '@pryzm/geometry-wall';
import { Vector3 } from '@pryzm/renderer-three/three';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { runGenerationBuilding } from '../src/ui/generation/generationChatSeam.js';

const AUDIT = { actorId: 'arcs66', projectId: 'arcs66', clientId: 'node' } as const;
const BL = 'boundaryLine_01ARZ3NDEKTSV4RRFFQ69G5H66';
const LEVEL = 'L0';
const FLOORS = 3;               // ground + 2 upper storeys
const FTF = 3;

type XZ = { x: number; z: number };

// ── THE FOUNDER'S SHAPE, DRAWN WITH THE TOOL ─────────────────────────────────────
// A 30 × 16 block whose two RIGHT-HAND corners are rounded at r = 4: (0,0) → (26,0)
// in Linear; Curved: midpoint on the circle's 45° point, end (30,4); Linear (30,12);
// Curved: 45° point, end (26,16); Linear (0,16); Enter. Each corner is ONE gesture
// and `arcSegmentThroughMidpoint` is the function `BoundaryLinePlanToolHandler`
// calls for it, at its default 16 chords.
const R = 4;
const BR = { S: { x: 26, z: 0 }, M: { x: 26 + R * Math.SQRT1_2, z: 4 - R * Math.SQRT1_2 }, E: { x: 30, z: 4 } };
const TR = { S: { x: 30, z: 12 }, M: { x: 26 + R * Math.SQRT1_2, z: 12 + R * Math.SQRT1_2 }, E: { x: 26, z: 16 } };
const CONTROL_BR = bezierControlFromMidpoint(BR.S, BR.M, BR.E);
const CONTROL_TR = bezierControlFromMidpoint(TR.S, TR.M, TR.E);

function drawnRing(): XZ[] {
    const ring: XZ[] = [{ x: 0, z: 0 }, BR.S];
    ring.push(...arcSegmentThroughMidpoint(BR.S, BR.M, BR.E));
    ring.push(TR.S);
    ring.push(...arcSegmentThroughMidpoint(TR.S, TR.M, TR.E));
    ring.push({ x: 0, z: 16 });
    return ring;
}
const RING = drawnRing();

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let priorRuntime: unknown;
const mintedLevelIds: string[] = [];
/** Every legacy-manager command the executor issued, by class name, with the wall it
 *  targets when it targets one — so K-6 can ask whether any OPENING was aimed at a
 *  curved host. */
const legacyCommands: Array<{ name: string; wallId?: string }> = [];

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    const w = window as unknown as Record<string, unknown>;
    priorRuntime = w['runtime'];
    w['runtime'] = rt;
    w['projectContext'] = { activeLevelId: LEVEL };
    w['bimManager'] = {
        getLevelById: () => ({ elevation: 0, height: FTF }),
        getActiveLevel: () => ({ id: LEVEL, elevation: 0, height: FTF }),
    };
    w['commandManager'] = {
        execute: (cmd: unknown) => {
            const c = cmd as {
                constructor?: { name?: string };
                payload?: { levelId?: string; name?: string; wallId?: string; hostWallId?: string; hostId?: string };
            };
            const name = c?.constructor?.name ?? '(anonymous)';
            // Upper STOREYS are the levels the executor names `Level N`; it also mints
            // a roof level, which is not a storey (`residentialFacadeAllFloors` filters
            // the same way).
            if (name === 'AddLevelCommand' && typeof c.payload?.levelId === 'string' && /^Level \d+$/.test(c.payload.name ?? '')) {
                mintedLevelIds.push(c.payload.levelId);
            }
            const wallId = c.payload?.hostWallId ?? c.payload?.wallId ?? c.payload?.hostId;
            legacyCommands.push({ name, ...(typeof wallId === 'string' ? { wallId } : {}) });
            return { success: true };
        },
    };
    (globalThis as { __pryzmProgressiveGeneration?: boolean }).__pryzmProgressiveGeneration = false;

    // Stub 4 — the engine half, as initBuilders.ts:551 attaches it.
    const { projectContext } = await import('@pryzm/core-app-model/context');
    const { wallStore } = await import('@pryzm/geometry-wall/store');
    const levelAuthority = {
        getLevelById: (id: string) => ({ id, name: id, elevation: 0, childrenIds: [] as string[] }),
        getLevels: () => [{ id: LEVEL, name: 'Ground', elevation: 0, childrenIds: [] as string[] }],
        registerElement: () => { /* spatial registration is an L7 concern */ },
    };
    (wallStore as any).attachEngine(projectContext, levelAuthority);
}, 600_000);

afterAll(() => {
    (window as unknown as { runtime?: unknown }).runtime = priorRuntime;
    try { rt?.tearDown?.(); } catch { /* non-fatal */ }
});

function authoritative(kind: string): any {
    return rt.stores.elements.get(kind);
}

async function transcriptOf(fn: () => Promise<void>): Promise<{ success: boolean; info: string[] }> {
    let seen: { success: boolean; info: string[] } | null = null;
    const listener = (e: Event): void => {
        const d = (e as CustomEvent).detail as { success: boolean; info: string[] };
        seen = { success: d.success === true, info: [...(d.info ?? [])] };
    };
    window.addEventListener('pryzm-generation-report', listener);
    try { await fn(); } finally { window.removeEventListener('pryzm-generation-report', listener); }
    expect(seen, 'the seam emitted no pryzm-generation-report at all').not.toBeNull();
    return seen!;
}

/** Wall batches are dispatched without awaiting; give the bus and the mirror a
 *  bounded chance to land them before reading. */
async function settle(predicate: () => boolean, ms = 5000): Promise<void> {
    const t0 = Date.now();
    while (!predicate() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 25));
}

type StoredWall = {
    id: string; levelId: string;
    baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
    curve?: { control: { x: number; y: number; z: number }; segments: number };
};

const near = (a: XZ, b: XZ, tol = 1e-6): boolean => Math.hypot(a.x - b.x, a.z - b.z) < tol;

/** Walls with BOTH endpoints inside ONE junction cluster — what WallJoinResolver
 *  §SELF-CLUSTER-GUARD skips. Measured with the real clustering code at the real
 *  default snap radius (the L-965 metric). */
function selfClusteredWallCount(walls: ReadonlyArray<{ id: string; baseLine: StoredWall['baseLine'] }>): number {
    const bl = new Map<string, [Vector3, Vector3]>();
    for (const w of walls) {
        bl.set(w.id, [
            new Vector3(w.baseLine[0].x, w.baseLine[0].y, w.baseLine[0].z),
            new Vector3(w.baseLine[1].x, w.baseLine[1].y, w.baseLine[1].z),
        ]);
    }
    const clusters = detectJunctionClusters(walls as never[], bl, DEFAULT_SNAP_RADIUS);
    const offenders = new Set<string>();
    for (const cluster of clusters) {
        const seen = new Map<string, number>();
        for (const ep of cluster.endpoints) seen.set(ep.wallId, (seen.get(ep.wallId) ?? 0) + 1);
        for (const [id, count] of seen) if (count >= 2) offenders.add(id);
    }
    return offenders.size;
}

describe('§L-11171 — a CURVED-mode boundary becomes a CURVED shell wall in the authoritative store', () => {
    let transcript: { success: boolean; info: string[] };

    it('K-1: the drawn ring reaches the boundary-line store with every tessellated vertex intact', async () => {
        await rt.bus.executeCommand('boundaryLine.create', {
            boundaryLineId: BL,
            levelId: LEVEL,
            vertices: RING.map((p) => ({ x: p.x, y: 0, z: p.z })),
            closed: true,
            drawMode: 'curved',
        });
        const rec = rt.stores.boundaryLine.getState().get(BL) as { vertices: XZ[] } | undefined;
        expect(rec).toBeDefined();
        // 2 + 16 + 1 + 16 + 1 — the record keeps the densified polyline, nothing decimated.
        expect(rec!.vertices).toHaveLength(RING.length);
        expect(RING.length).toBe(36);
    });

    it('K-2: the chat entry point builds on it and SAYS it built the rounded corners as curved walls', async () => {
        transcript = await transcriptOf(() => runGenerationBuilding({
            typology: 'residential-building',
            floors: FLOORS,
            footprintSource: 'boundary-line',
        }));
        const all = transcript.info.join(' | ');
        expect(transcript.success, `the build refused: ${all}`).toBe(true);
        expect(all).toContain(BL);
        // One transcript line per rounded corner, naming the chord count it replaced.
        const rounded = all.match(/rounded corner was built as ONE curved wall \(16 drawn chords/g) ?? [];
        expect(rounded, all).toHaveLength(2);
    }, 600_000);

    it('K-3: ⭐ THE ROW — the authoritative wall store holds exactly TWO curved shell walls on the ground level, with the AUTHORED control', async () => {
        const store = authoritative('wall');
        await settle(() => (store.getByLevel(LEVEL) as StoredWall[]).some((w) => w.curve !== undefined));
        const ground = store.getByLevel(LEVEL) as StoredWall[];
        const curved = ground.filter((w) => w.curve !== undefined);
        expect(curved, `ground walls: ${ground.length}, curved: ${curved.length}`).toHaveLength(2);

        for (const w of curved) {
            expect(w.curve!.segments).toBeGreaterThanOrEqual(8);
            const a = { x: w.baseLine[0].x, z: w.baseLine[0].z };
            const b = { x: w.baseLine[1].x, z: w.baseLine[1].z };
            const c = { x: w.curve!.control.x, z: w.curve!.control.z };
            // Endpoints are the tangent points the user clicked; the control is the one
            // the tool computed from the clicked midpoint — recovered, not fitted.
            const isBR = near(a, BR.S) && near(b, BR.E) && near(c, CONTROL_BR);
            const isTR = near(a, TR.S) && near(b, TR.E) && near(c, CONTROL_TR);
            expect(isBR || isTR, `unexpected curved wall ${JSON.stringify({ a, b, c })}`).toBe(true);
        }
        // Not a single straight facet remains on either arc: no ground wall has an
        // endpoint strictly inside an arc's interior vertices.
        const interior = RING.filter((p, i) => i > 1 && !near(p, BR.E) && !near(p, TR.S) && !near(p, TR.E) && i < RING.length - 1);
        for (const w of ground) {
            for (const end of [w.baseLine[0], w.baseLine[1]]) {
                const onArcInterior = interior.some((p) => near({ x: end.x, z: end.z }, p));
                expect(onArcInterior, `a straight facet survived on the arc: wall ${w.id}`).toBe(false);
            }
        }
    }, 60_000);

    it('K-4: every UPPER storey carries the same two curved shell walls', async () => {
        expect(mintedLevelIds.length).toBe(FLOORS - 1);
        const store = authoritative('wall');
        for (const lid of mintedLevelIds) {
            await settle(() => (store.getByLevel(lid) as StoredWall[]).filter((w) => w.curve !== undefined).length >= 2);
            const curved = (store.getByLevel(lid) as StoredWall[]).filter((w) => w.curve !== undefined);
            expect(curved, `level ${lid}`).toHaveLength(2);
        }
    }, 60_000);

    it('K-5: the joins consumer — the curved shell puts NO wall with both ends in one junction cluster; the faceted alternative would', () => {
        const store = authoritative('wall');
        const ground = store.getByLevel(LEVEL) as StoredWall[];
        expect(selfClusteredWallCount(ground)).toBe(0);
        // The contrast, computed rather than stored: one straight wall per ring edge
        // (the pre-L-11130 shell) at r = 4 has ~0.4 m chords, under the 0.5 m snap radius.
        const faceted = RING.map((p, i) => {
            const q = RING[(i + 1) % RING.length]!;
            return { id: `facet-${i}`, baseLine: [{ x: p.x, y: 0, z: p.z }, { x: q.x, y: 0, z: q.z }] as StoredWall['baseLine'] };
        });
        expect(selfClusteredWallCount(faceted)).toBeGreaterThan(0);
    });

    it('K-6: no OPENING was aimed at a curved shell wall — the chord handed to the window resolver did not become a host', () => {
        // `buildingShellWalls` hands every shell wall to the apartment engine's façade
        // window resolver as a straight `{id,start,end}` — a curved wall goes in as its
        // CHORD. C03 §1.2: curved walls take no openings at creation. So an opening
        // command naming a curved wall id here would be a window the engine placed on
        // a chord that is not where the wall is.
        const store = authoritative('wall');
        const curvedIds = new Set<string>();
        for (const lid of [LEVEL, ...mintedLevelIds]) {
            for (const w of store.getByLevel(lid) as StoredWall[]) if (w.curve !== undefined) curvedIds.add(w.id);
        }
        expect(curvedIds.size).toBe(2 * FLOORS);
        const onCurved = legacyCommands.filter((c) => c.wallId !== undefined && curvedIds.has(c.wallId));
        const byName = new Map<string, number>();
        for (const c of legacyCommands) if (c.wallId !== undefined) byName.set(c.name, (byName.get(c.name) ?? 0) + 1);
        // eslint-disable-next-line no-console
        console.log(`[L-11171 K-6] legacy commands targeting a wall: ${JSON.stringify([...byName])}; on a CURVED host: ${onCurved.length} ${JSON.stringify(onCurved.slice(0, 5))}`);
        expect(onCurved).toHaveLength(0);
    });
});
