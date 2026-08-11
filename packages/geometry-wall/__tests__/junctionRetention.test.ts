// §CONNECT-3 — the RETAINED junction index must never go stale, and must never
// answer "I don't know" with an empty list.
//
// BIM30-CONTINUITY-DELIVERABLE §D-7 / §G Tier 2; BIM30-EVOLUTION-AUDIT §3 (Q4) + §17.6.
//
// WHAT THIS FILE IS FOR. The retention change extends the lifetime of a record the
// ADR-0055 ring sweep already computed. The failure mode of ANY extended lifetime is
// SILENT STALENESS: the index still answers, confidently, with the previous solve. A
// test that only checks the index is POPULATED proves nothing about that — so every
// mutation below is followed by a comparison against a FRESH solve of the same scene,
// and by a semantic assertion that the specific connection that changed actually
// changed. Both halves are required: the fresh-solve comparison catches "the cache did
// not update"; the semantic assertion catches "both the cache AND the fresh solve are
// wrong in the same way" for the scenes where an independent oracle is cheap.

import { describe, it, expect } from 'vitest';
import { WallPipelineV2Cache, type LevelWallSpec } from '../src/WallPipelineV2';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import {
    resolveJunctionsWithRecords,
    type Pt2, type WallInput, type WallJunctionRecord,
} from '../src/JunctionResolverV2';

const T = 0.20;   // wall thickness used throughout

function w(id: string, sx: number, sz: number, ex: number, ez: number): LevelWallSpec {
    return { id, startXZ: { x: sx, z: sz }, endXZ: { x: ex, z: ez }, thickness: T };
}

function toInputs(specs: readonly LevelWallSpec[]): WallInput[] {
    return specs.map(s => ({ id: s.id, start: s.startXZ, end: s.endXZ, thickness: s.thickness }));
}

/** Stable, comparable projection of the whole retained index — everything a consumer
 *  can observe, so a drift anywhere in the record shows up as an inequality. */
function indexShape(records: readonly WallJunctionRecord[]): string {
    return JSON.stringify(records.map(r => ({
        id: r.id, type: r.type, degree: r.degree,
        point: { x: +r.point.x.toFixed(9), z: +r.point.z.toFixed(9) },
        participants: r.participants,
        wallIds: r.wallIds,
    })));
}

/** The FRESH-SOLVE oracle: the index a brand-new cache would hold for this scene. */
function freshIndex(scene: readonly LevelWallSpec[]): string {
    const fresh = new WallPipelineV2Cache();
    fresh.refresh(scene);
    return indexShape(fresh.junctions);
}

/** The connectivity answer for every wall, as a comparable map. Refusals are encoded
 *  distinctly from empty answers, so a test can never mistake one for the other. */
function connectivityShape(cache: WallPipelineV2Cache, scene: readonly LevelWallSpec[]): string {
    const out: Record<string, string> = {};
    for (const s of scene) {
        const q = cache.connectedWallIds(s.id);
        out[s.id] = q.ok ? `ok:[${[...q.connectedWallIds].sort().join(',')}]` : `refused:${q.reason}`;
    }
    return JSON.stringify(out);
}

// ── The INDEPENDENT oracle ───────────────────────────────────────────────────
// Deliberately NOT the resolver: a hand-written O(n²) adjacency using the resolver's
// documented 0.20 m band. Two walls are adjacent when an endpoint of one is within the
// band of an endpoint of the other, OR an endpoint of one lands on the other's body
// (strictly interior) within the band. This is the plain-English definition of "these
// walls connect"; it agrees with the resolver on the CLEAN, exactly-authored scenes
// used below. It is used only where it is trustworthy — see the honesty note at the
// bottom of this file.
const BAND = 0.20;
function bruteForceConnected(scene: readonly LevelWallSpec[], id: string): string[] {
    const byId = new Map(scene.map(s => [s.id, s]));
    const self = byId.get(id)!;
    const d = (a: Pt2, b: Pt2): number => Math.hypot(a.x - b.x, a.z - b.z);
    const onBody = (p: Pt2, s: LevelWallSpec): boolean => {
        const ab = { x: s.endXZ.x - s.startXZ.x, z: s.endXZ.z - s.startXZ.z };
        const l2 = ab.x * ab.x + ab.z * ab.z;
        if (l2 < 1e-12) return false;
        const t = ((p.x - s.startXZ.x) * ab.x + (p.z - s.startXZ.z) * ab.z) / l2;
        if (!(t > 0 && t < 1)) return false;                 // strictly interior
        const foot = { x: s.startXZ.x + ab.x * t, z: s.startXZ.z + ab.z * t };
        return d(p, foot) <= BAND;
    };
    const out: string[] = [];
    for (const o of scene) {
        if (o.id === id) continue;
        const ends: [Pt2, Pt2][] = [
            [self.startXZ, o.startXZ], [self.startXZ, o.endXZ],
            [self.endXZ, o.startXZ], [self.endXZ, o.endXZ],
        ];
        const endpointTouch = ends.some(([a, b]) => d(a, b) <= BAND);
        const bodyTouch =
            onBody(self.startXZ, o) || onBody(self.endXZ, o) ||
            onBody(o.startXZ, self) || onBody(o.endXZ, self);
        if (endpointTouch || bodyTouch) out.push(o.id);
    }
    return out.sort();
}

function connectedSorted(cache: WallPipelineV2Cache, id: string): string[] {
    const q = cache.connectedWallIds(id);
    if (!q.ok) throw new Error(`expected an answer for ${id}, got refusal ${q.reason}`);
    return [...q.connectedWallIds].sort();
}

// ─────────────────────────────────────────────────────────────────────────────

describe('§CONNECT-3 — the record the resolver used to discard is now returned', () => {
    it('resolveJunctions is a projection of resolveJunctionsWithRecords (no behaviour change)', () => {
        // The whole point of routing the old entry point through the new one: the
        // ≈130 existing call sites cannot observe the retention at all.
        const scene = [w('A', 0, 0, 4, 0), w('B', 4, 0, 4, 3), w('C', 4, 3, 0, 3)];
        const both = resolveJunctionsWithRecords(toInputs(scene));
        // Re-solve to prove the projection is not just object identity.
        const { miters } = resolveJunctionsWithRecords(toInputs(scene));
        expect(JSON.stringify(both.miters)).toEqual(JSON.stringify(miters));
        expect(both.junctions.length).toBe(2);   // A–B and B–C
    });

    it('classifies L / T / X with the participant roles the sweep actually used', () => {
        const L = new WallPipelineV2Cache();
        L.refresh([w('A', 0, 0, 4, 0), w('B', 4, 0, 4, 3)]);
        expect(L.junctions.map(j => j.type)).toEqual(['L']);
        expect(L.junctions[0]!.degree).toBe(2);
        expect(L.junctions[0]!.participants.every(p => p.role === 'endpoint')).toBe(true);
        // The record names WHICH end of each wall is at the node — the thing the
        // discarded draft knew and nothing downstream could recover.
        expect(L.junctions[0]!.participants.map(p => p.isStart).sort()).toEqual([false, true]);

        // T: a stem terminating on a host's BODY, mid-span (far from either host end).
        const Tj = new WallPipelineV2Cache();
        Tj.refresh([w('host', 0, 0, 6, 0), w('stem', 3, 0, 3, 3)]);
        expect(Tj.junctions.map(j => j.type)).toEqual(['T']);
        expect(Tj.junctions[0]!.degree).toBe(3);              // host counts twice
        expect(Tj.junctions[0]!.wallIds.slice().sort()).toEqual(['host', 'stem']);
        const roles = Object.fromEntries(Tj.junctions[0]!.participants.map(p => [p.wallId, p.role]));
        expect(roles).toEqual({ host: 'passthrough', stem: 'endpoint' });

        // X: four arms co-terminating at one node.
        const X = new WallPipelineV2Cache();
        X.refresh([w('n', 0, 0, 0, -3), w('s', 0, 0, 0, 3), w('e', 0, 0, 3, 0), w('ww', 0, 0, -3, 0)]);
        expect(X.junctions.map(j => j.type)).toEqual(['X']);
        expect(X.junctions[0]!.degree).toBe(4);
    });

    it('a passthrough wall is ONE participant even though it is two sweep directions', () => {
        const c = new WallPipelineV2Cache();
        c.refresh([w('host', 0, 0, 6, 0), w('stem', 3, 0, 3, 3)]);
        const rec = c.junctions[0]!;
        expect(rec.participants.filter(p => p.wallId === 'host')).toHaveLength(1);
        expect(rec.degree).toBe(3);          // …but the ring degree still counts both
    });
});

describe('§CONNECT-3 — Q4 lookup agrees with an INDEPENDENT adjacency oracle', () => {
    const scenes: Record<string, LevelWallSpec[]> = {
        'closed square': [
            w('A', 0, 0, 6, 0), w('B', 6, 0, 6, 6), w('C', 6, 6, 0, 6), w('D', 0, 6, 0, 0),
        ],
        'open U': [w('A', 0, 0, 6, 0), w('B', 6, 0, 6, 6), w('C', 6, 6, 0, 6)],
        'T into a run': [w('host', 0, 0, 8, 0), w('stem', 4, 0, 4, 4)],
        'two disjoint pairs': [
            w('A', 0, 0, 3, 0), w('B', 3, 0, 3, 3),
            w('P', 40, 40, 43, 40), w('Q', 43, 40, 43, 43),
        ],
        'one lonely wall': [w('lonely', 0, 0, 5, 0)],
    };

    for (const [name, scene] of Object.entries(scenes)) {
        it(`${name}`, () => {
            const cache = new WallPipelineV2Cache();
            cache.refresh(scene);
            for (const s of scene) {
                expect(connectedSorted(cache, s.id)).toEqual(bruteForceConnected(scene, s.id));
            }
        });
    }
});

describe('§CONNECT-3 — STALENESS: the index tracks every mutation', () => {
    // ONE long-lived cache is reused across the whole sequence, exactly as
    // `WallFragmentBuilder._v2Cache` is reused across level rebuilds. If retention
    // leaked ANY state across a refresh, this is where it would show.
    it('move · resize · delete · add-junction · remove-junction — index == fresh solve, every time', () => {
        const cache = new WallPipelineV2Cache();

        const square = (): LevelWallSpec[] => [
            w('A', 0, 0, 6, 0), w('B', 6, 0, 6, 6), w('C', 6, 6, 0, 6), w('D', 0, 6, 0, 0),
        ];

        const steps: { label: string; scene: LevelWallSpec[]; expect: (c: WallPipelineV2Cache) => void }[] = [
            {
                label: '0 — baseline closed square',
                scene: square(),
                expect: c => {
                    expect(c.junctions).toHaveLength(4);
                    expect(connectedSorted(c, 'A')).toEqual(['B', 'D']);
                },
            },
            {
                label: '1 — MOVE: D translated far away, breaking BOTH its corners',
                scene: (() => {
                    const s = square();
                    s[3] = w('D', 30, 30, 30, 36);
                    return s;
                })(),
                expect: c => {
                    // The stale answer would still be ['B','D'].
                    expect(connectedSorted(c, 'A')).toEqual(['B']);
                    expect(connectedSorted(c, 'D')).toEqual([]);
                    expect(c.junctions).toHaveLength(2);
                },
            },
            {
                label: '2 — RESIZE: A shortened so it no longer reaches B',
                scene: (() => {
                    const s = square();
                    s[0] = w('A', 0, 0, 4, 0);     // was 0,0 → 6,0
                    return s;
                })(),
                expect: c => {
                    expect(connectedSorted(c, 'A')).toEqual(['D']);
                    expect(connectedSorted(c, 'B')).toEqual(['C']);
                },
            },
            {
                label: '3 — DELETE: B removed from the level entirely',
                scene: square().filter(s => s.id !== 'B'),
                expect: c => {
                    expect(connectedSorted(c, 'A')).toEqual(['D']);
                    expect(connectedSorted(c, 'C')).toEqual(['D']);
                    // A deleted wall must REFUSE, not answer empty.
                    const q = c.connectedWallIds('B');
                    expect(q.ok).toBe(false);
                    if (!q.ok) expect(q.reason).toBe('wall-not-on-level');
                },
            },
            {
                label: '4 — ADD a junction: a stem tees into the middle of A',
                scene: [...square(), w('stem', 3, 0, 3, 3)],
                expect: c => {
                    expect(connectedSorted(c, 'stem')).toEqual(['A']);
                    expect(connectedSorted(c, 'A')).toEqual(['B', 'D', 'stem']);
                    expect(c.junctions).toHaveLength(5);
                    expect(c.junctions.filter(j => j.type === 'T')).toHaveLength(1);
                },
            },
            {
                label: '5 — REMOVE a junction: the stem is deleted again',
                scene: square(),
                expect: c => {
                    // The stale answer would still carry 'stem'.
                    expect(connectedSorted(c, 'A')).toEqual(['B', 'D']);
                    expect(c.junctions).toHaveLength(4);
                    expect(c.junctions.some(j => j.type === 'T')).toBe(false);
                },
            },
            {
                label: '6 — EMPTY level: every previous record must be gone',
                scene: [],
                expect: c => {
                    expect(c.junctions).toHaveLength(0);
                    const q = c.junctionsFor('A');
                    expect(q.ok).toBe(false);   // A is no longer on the level
                },
            },
            {
                label: '7 — back to the square (the cache must not resurrect step 6)',
                scene: square(),
                expect: c => {
                    expect(c.junctions).toHaveLength(4);
                    expect(connectedSorted(c, 'A')).toEqual(['B', 'D']);
                },
            },
        ];

        for (const step of steps) {
            cache.refresh(step.scene);

            // (a) THE STALENESS ORACLE — byte-equal to what a cache that never saw
            //     any previous scene would hold for this scene.
            expect(indexShape(cache.junctions), `${step.label}: index != fresh solve`)
                .toEqual(freshIndex(step.scene));

            // (b) …and the derived per-wall connectivity too, refusals included.
            const fresh = new WallPipelineV2Cache();
            fresh.refresh(step.scene);
            expect(connectivityShape(cache, step.scene), `${step.label}: connectivity != fresh solve`)
                .toEqual(connectivityShape(fresh, step.scene));

            // (c) THE INDEPENDENT ORACLE — the connection that changed really changed.
            for (const s of step.scene) {
                expect(connectedSorted(cache, s.id), `${step.label}: ${s.id} vs brute force`)
                    .toEqual(bruteForceConnected(step.scene, s.id));
            }

            // (d) the step's own semantic assertion.
            step.expect(cache);
        }
    });

    it('a wall MOVED by less than the junction band keeps its junction (no false invalidation)', () => {
        const cache = new WallPipelineV2Cache();
        cache.refresh([w('A', 0, 0, 6, 0), w('B', 6, 0, 6, 6)]);
        expect(connectedSorted(cache, 'A')).toEqual(['B']);
        // 50 mm of drift — inside the 0.20 m §RESI-L0 band, so the corner survives.
        cache.refresh([w('A', 0, 0, 6, 0), w('B', 6.05, 0.0, 6.05, 6)]);
        expect(connectedSorted(cache, 'A')).toEqual(['B']);
        expect(indexShape(cache.junctions)).toEqual(freshIndex([w('A', 0, 0, 6, 0), w('B', 6.05, 0.0, 6.05, 6)]));
    });

    it('the index is never populated by the RAKE PROBE solve (a second, displaced solve)', () => {
        // `refresh()` runs a second `resolveJunctions` at a 2e-5 m probe elevation for
        // §WALL-RAKE-JOINT. Retaining ITS records would double the index with
        // near-duplicate nodes. The probe result must stay where it was: in the
        // probe maps only.
        const scene: LevelWallSpec[] = [
            { ...w('A', 0, 0, 6, 0), rakeAngleDeg: 75 },
            w('B', 6, 0, 6, 6),
        ];
        const cache = new WallPipelineV2Cache();
        cache.refresh(scene);
        expect(cache.hasRake).toBe(true);
        expect(cache.junctions).toHaveLength(1);
        expect(connectedSorted(cache, 'A')).toEqual(['B']);
    });
});

describe('§CONNECT-3 — FAILURE ≠ EMPTINESS (the refusal idiom)', () => {
    it('an un-refreshed cache REFUSES; it does not report "no junctions"', () => {
        const cache = new WallPipelineV2Cache();
        const q = cache.junctionsFor('A');
        expect(q.ok).toBe(false);
        if (!q.ok) {
            expect(q.reason).toBe('cache-not-refreshed');
            expect(q.detail).toContain('A');
            expect(q.detail).toContain('never been refreshed');
        }
    });

    it('an UNKNOWN wall id REFUSES and names the level size', () => {
        const cache = new WallPipelineV2Cache();
        cache.refresh([w('A', 0, 0, 6, 0), w('B', 6, 0, 6, 6)]);
        const q = cache.junctionsFor('ghost');
        expect(q.ok).toBe(false);
        if (!q.ok) {
            expect(q.reason).toBe('wall-not-on-level');
            expect(q.detail).toContain('ghost');
            expect(q.detail).toContain('2 wall(s)');
            // The sentence must say the thing out loud, so a log reader cannot
            // mistake it for "this wall has nothing attached".
            expect(q.detail).toContain('not an empty answer');
        }
    });

    it('a KNOWN wall with no junctions ANSWERS empty — and the two are distinguishable', () => {
        const cache = new WallPipelineV2Cache();
        cache.refresh([w('lonely', 0, 0, 5, 0), w('far', 50, 50, 55, 50)]);

        const known = cache.junctionsFor('lonely');
        const unknown = cache.junctionsFor('ghost');

        expect(known.ok).toBe(true);
        if (known.ok) expect(known.junctions).toEqual([]);
        expect(unknown.ok).toBe(false);

        // The discriminant is the WHOLE point: no consumer can reach a `junctions`
        // field on the refusal, so "absent evidence" can never be read as "[]".
        expect(known.ok).not.toEqual(unknown.ok);
        expect('junctions' in unknown).toBe(false);
    });

    it('connectedWallIds refuses on the same two conditions, with the same reasons', () => {
        const empty = new WallPipelineV2Cache();
        const e = empty.connectedWallIds('A');
        expect(e.ok).toBe(false);
        if (!e.ok) expect(e.reason).toBe('cache-not-refreshed');

        empty.refresh([w('A', 0, 0, 5, 0)]);
        const known = empty.connectedWallIds('A');
        expect(known.ok).toBe(true);
        if (known.ok) expect(known.connectedWallIds).toEqual([]);

        const ghost = empty.connectedWallIds('ghost');
        expect(ghost.ok).toBe(false);
        if (!ghost.ok) expect(ghost.reason).toBe('wall-not-on-level');
    });

    it('a wall never excludes itself into a false connection', () => {
        const cache = new WallPipelineV2Cache();
        cache.refresh([w('A', 0, 0, 6, 0), w('B', 6, 0, 6, 6), w('C', 6, 6, 0, 6)]);
        for (const id of ['A', 'B', 'C']) {
            expect(connectedSorted(cache, id)).not.toContain(id);
        }
    });
});

describe('§CONNECT-3 — the builder accessors the graph writer will call', () => {
    // These are the exact three reads the SemanticGraph writer is specified against.
    // They must refuse BEFORE the first `refreshV2Cache`, and answer after it —
    // otherwise a writer landing at the flush site would silently emit zero edges on
    // the first pass and treat that as "this level has no connected walls".
    const makeBuilder = (): WallFragmentBuilder =>
        new WallFragmentBuilder({} as never, {} as never);

    it('refuses before refreshV2Cache has ever run — it does not report "no junctions"', () => {
        const b = makeBuilder();
        expect(b.levelJunctions).toEqual([]);          // the blunt accessor, documented as blunt
        const q = b.junctionsForWall('A');
        expect(q.ok).toBe(false);
        if (!q.ok) expect(q.reason).toBe('cache-not-refreshed');
        const c = b.connectedWallIds('A');
        expect(c.ok).toBe(false);
        if (!c.ok) expect(c.reason).toBe('cache-not-refreshed');
    });

    it('answers after refreshV2Cache, and tracks a subsequent refresh', () => {
        const b = makeBuilder();
        b.refreshV2Cache([w('A', 0, 0, 6, 0), w('B', 6, 0, 6, 6)]);
        expect(b.levelJunctions).toHaveLength(1);
        const c = b.connectedWallIds('A');
        expect(c.ok).toBe(true);
        if (c.ok) expect([...c.connectedWallIds]).toEqual(['B']);

        // Same builder, next level rebuild: B moved away.
        b.refreshV2Cache([w('A', 0, 0, 6, 0), w('B', 40, 40, 40, 46)]);
        const c2 = b.connectedWallIds('A');
        expect(c2.ok).toBe(true);
        if (c2.ok) expect([...c2.connectedWallIds]).toEqual([]);
        expect(b.levelJunctions).toHaveLength(0);

        // …and an id that is not on the level still refuses.
        const ghost = b.junctionsForWall('ghost');
        expect(ghost.ok).toBe(false);
        if (!ghost.ok) expect(ghost.reason).toBe('wall-not-on-level');
    });
});

// ── HONESTY NOTE (what this file does NOT prove) ─────────────────────────────
//
// UNPROVEN 1 — the brute-force oracle is trustworthy only on the CLEAN, exactly
//   authored scenes above. The resolver carries several deliberate reclassification
//   guards (§FIX-WALL-TJUNCTION-BUTT, §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE,
//   §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE, §FIX-WALL-CLUSTER-DEGENERATE) that change
//   PARTICIPATION or ROLE on drifted / welded / stub geometry. On those inputs the
//   record is by construction whatever the sweep used — that is the design — but this
//   file does not independently re-derive it, and no claim is made that the brute-force
//   definition matches the resolver there.
//
// UNPROVEN 2 — nothing here exercises the LIVE invalidation, i.e. that
//   `WallRebuildCoordinator._flush` calls `refreshV2Cache` on every mutation that can
//   change a junction. The index inherits exactly the freshness of the miters it ships
//   beside — no better, no worse — which is the reason it was placed there. If a
//   mutation path exists that changes wall geometry WITHOUT a level rebuild, the miters
//   are already stale on that path today and the index would be too.
//
// UNPROVEN 3 — `WallJunctionRecord.id` is deterministic per solve, not a persistent
//   identity. No test asserts stability across an edit, because it does not hold.
