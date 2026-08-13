/**
 * C79 §10.1 — DOES THE REGION RELATIONSHIP SURVIVE A PERSISTENCE ROUND TRIP?
 *
 * C79 calls this **"the single highest-risk unknown in this contract"** and records
 * that *"no evidence either way was found for the slab sketch under snapshot
 * round-trip"*. This file is that evidence. It is a MEASUREMENT probe, not a fix.
 *
 * THE STAKE (C79 §10.1, verbatim): *"If it does not [survive], a region slab follows
 * its walls until the file is saved and reloaded, and then silently stops — the §0
 * defect with a delay."*
 *
 * ── WHAT IS REAL HERE, AND WHAT IS NOT (C74 §3.4 — a test whose fixture supplies the
 *    value under test proves nothing) ─────────────────────────────────────────────
 *
 * REAL (imported from the production module, never re-implemented in this file):
 *   • `traceRegionSketchAtPoint` — `packages/geometry-slab/src/SlabRegionTracer.ts:728`,
 *     the ONE host-reference-producing region entry point in the tree (C79 §6.4).
 *     The sketch under test is PRODUCED BY THE TRACER. This file never writes a
 *     `hostReference` edge literal, so a tracer that stopped emitting them would
 *     fail these tests rather than be masked by them.
 *   • `serializeProjectSlabs` — the REAL `serializeSlab` reached through the REAL
 *     `ProjectSerializer.serialize`. Not a hand-rolled `JSON.stringify` of the store.
 *   • `validateSlabData` — `packages/geometry-slab/src/SlabValidator.ts:105`, the exact
 *     Zod gate `SlabStore.add()` applies at line 201. This is the schema-validate
 *     stage, the most likely place for a silent field drop.
 *   • The load-side payload construction is asserted against the REAL loader source
 *     (`ProjectLoader.ts:531` / `ImportProjectCommand.ts:546`) by the §5 source-pin
 *     tests, so a loader that stops forwarding `sketch` turns this suite red.
 *
 * NOT REAL, and why (stated so the proof is not overclaimed):
 *   • The full `ProjectLoader.load()` is NOT executed. It requires a live
 *     `CommandManager`, an attached `BimManager`/`ProjectContext`, a `DOMEventBus`
 *     and ~40 singleton stores — none available in this Node-env package suite.
 *     The round trip therefore covers **serialise → JSON → schema-validate → the
 *     payload the loader builds**, and PINS the loader's own forwarding by source
 *     assertion (§5). It does NOT cover post-load re-projection, which is
 *     `SlabDependencyTracker`'s territory and a different lane.
 *
 * ── ADVERSARIAL SELF-CHECK (required by the brief) ───────────────────────────────
 * `describe('§4 — the probe would DETECT a silent drop')` deliberately feeds a
 * dropped-`sketch` and a stripped-`hostId` snapshot through the SAME assertions and
 * proves they go RED. Without that block, a green result here would be worthless.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    traceRegionSketchAtPoint,
    type RegionWallLike,
    type RegionSketchResult,
} from '../../geometry-slab/src/SlabRegionTracer';
import type { HostReferenceEdge, SlabSketch } from '../../geometry-slab/src/SketchTypes';
import { validateSlabData } from '../../geometry-slab/src/SlabValidator';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');

/**
 * `@pryzm/file-format` (imported by ProjectSerializer for `dxfOverlayStore`) pulls
 * `pdfjs-dist` at module load, which touches `DOMMatrix` in a Node env. These are
 * pure module-load shims — nothing under test reads them.
 */
beforeAll(() => {
    const g = globalThis as Record<string, unknown>;
    if (!g.DOMMatrix) g.DOMMatrix = class { };
    if (!g.Path2D) g.Path2D = class { };
    if (!g.ImageData) g.ImageData = class { };
});

/**
 * ── WHY THE IMPORT IS HOISTED INTO ITS OWN `beforeAll` (2026-08-13) ──────────────
 *
 * `ProjectSerializer` sits on a very large import graph — ~30 `@pryzm/core-app-model`
 * specifiers alone, plus twelve `geometry-*` stores and `@pryzm/file-format`. Vitest
 * must transform that whole graph on first import, which measures ~30 s cold on this
 * tree (`transform 22.8 s` of a 30.2 s run).
 *
 * When the `await import(...)` lived inside `serializeThroughProduction`, that cost was
 * charged to whichever test called it FIRST. Vitest's default `testTimeout` is 5000 ms,
 * so those tests were killed mid-import; the teardown then surfaced as the *misleading*
 * `TypeError: Cannot read properties of undefined (reading 'serialize')` — which reads
 * like a broken/circular barrel export but is not one. Measured directly:
 * `KEYS SNAPSHOT_SCHEMA_VERSION,ProjectSerializer` / `PS_TYPE function` — the export is
 * intact and the module graph is acyclic. Tests running LATER, on the now-warm module
 * cache, passed — which is exactly the 10-failed/6-passed split that was observed.
 *
 * Paying the cost ONCE here, with an explicit timeout, makes the transform budget
 * visible instead of silently billing it to an unrelated assertion. This does NOT
 * weaken the probe: it is the same real `ProjectSerializer`, reached by the same
 * specifier, and `serializeThroughProduction` still drives the real `serialize()`.
 * If the module ever genuinely fails to load, `expect(...).toBeDefined()` below fails
 * LOUDLY and every round-trip test still goes red.
 */
let ProjectSerializer: typeof import('../src/loader/ProjectSerializer')['ProjectSerializer'];

beforeAll(async () => {
    ({ ProjectSerializer } = await import('../src/loader/ProjectSerializer'));
    expect(ProjectSerializer, 'ProjectSerializer failed to load').toBeDefined();
    expect(typeof ProjectSerializer.serialize).toBe('function');
}, 120_000);

// ── The reference fixture C79 §2.5 names: 3 straight walls + 1 arc ──────────────
// "The measured reference reading on the 3-straight + 1-arc fixture: 3 host edges,
//  16 curved fallbacks — a measurement, not a silent gap."

function wall(id: string, x0: number, z0: number, x1: number, z1: number): RegionWallLike {
    return { id, baseLine: [{ x: x0, z: z0 }, { x: x1, z: z1 }] };
}

/** 3 straight walls + 1 arc (16 tessellation segments) enclosing a 6 × 4 room. */
function threeStraightPlusArc(): RegionWallLike[] {
    return [
        wall('w-south', 0, 0, 6, 0),
        wall('w-east', 6, 0, 6, 4),
        wall('w-north', 6, 4, 0, 4),
        {
            id: 'w-west-arc',
            baseLine: [{ x: 0, z: 4 }, { x: 0, z: 0 }],
            curve: { control: { x: -1.2, z: 2 }, segments: 16 },
        },
    ];
}

/** The founder's four-straight-wall room — every edge attributable. */
function fourWallRoom(): RegionWallLike[] {
    return [
        wall('w-south', 0, 0, 6, 0),
        wall('w-east', 6, 0, 6, 4),
        wall('w-north', 6, 4, 0, 4),
        wall('w-west', 0, 4, 0, 0),
    ];
}

const hostEdgesOf = (s: SlabSketch): HostReferenceEdge[] =>
    s.outerLoop.edges.filter((e): e is HostReferenceEdge => e.type === 'hostReference');

/**
 * The CONSUMER's contract, reproduced from `SlabDependencyTracker.registerSlab`
 * (`packages/geometry-slab/src/SlabDependencyTracker.ts:86`): walk the loops and
 * collect every `hostReference` as a `wallId → slabId` dependency. If this yields
 * nothing AFTER the round trip, the reloaded slab cannot follow anything — which is
 * precisely the C79 §10.1 failure mode.
 */
function dependencyGraphFor(sketch: SlabSketch, slabId: string): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    for (const loop of [sketch.outerLoop, ...(sketch.innerLoops ?? [])]) {
        for (const edge of loop.edges) {
            if (edge.type === 'hostReference') {
                if (!graph.has(edge.hostId)) graph.set(edge.hostId, new Set());
                graph.get(edge.hostId)!.add(slabId);
            }
        }
    }
    return graph;
}

/** Build the SlabData a region creation writes, from a REAL traced sketch. */
function slabDataFromRegion(id: string, traced: RegionSketchResult) {
    return {
        id,
        type: 'slab' as const,
        levelId: 'L1',
        parentId: 'L1',
        thickness: 0.2,
        position: { x: 0, y: 0 as const, z: 0 },
        polygon: traced.ring.map(p => ({ x: p.x, y: p.y })),
        materialColor: '#808080',
        properties: { mark: 'SB001' },
        ifcData: { guid: id, ifcClass: 'IfcSlab' },
        sketch: traced.sketch,
    };
}

/**
 * Drive the REAL `ProjectSerializer.serialize` with a stub store set. Only
 * `slabStore.getAll()` feeds the path under test; every other store is a legitimate
 * empty stub, because `serialize()` is documented read-only ("it never writes to any
 * store, calls any builder, or publishes any event", ProjectSerializer.ts:645-647).
 *
 * This routes the slab through the production `serializeSlab()`
 * (ProjectSerializer.ts:421-437) — the `deepStrip(s.sketch)` at :432 is the
 * serialise-stage step under test.
 */
async function serializeThroughProduction(slabs: unknown[]): Promise<Record<string, unknown>> {
    const empty = { getAll: () => [] as unknown[] };
    const stores = {
        wallStore: { getAll: () => [], getLevels: () => [{ id: 'L1', name: 'Level 1', elevation: 0 }] },
        slabStore: { getAll: () => slabs },
        columnStore: empty, gridStore: empty, stairStore: empty, beamStore: empty,
        curtainWallStore: empty, roofStore: empty, plumbingStore: empty,
        furnitureStore: empty, handrailStore: empty, openingStore: empty,
    } as unknown as Parameters<typeof ProjectSerializer.serialize>[0];

    return ProjectSerializer.serialize(
        stores,
        {} as Parameters<typeof ProjectSerializer.serialize>[1],
        { projectName: 'C79-10.1-probe' },
    ) as unknown as Record<string, unknown>;
}

/**
 * The load side, exactly as `ProjectLoader.ts:519-531` builds it. Kept in lock-step
 * with the real source by the §5 source-pin tests below, so this cannot silently
 * drift into a more generous copy than production runs.
 */
function loaderSlabPayload(slab: Record<string, unknown>) {
    return {
        id: slab.id,
        width: slab.width,
        depth: slab.depth,
        thickness: slab.thickness,
        position: slab.position,
        levelId: slab.levelId,
        polygon: slab.polygon,
        holes: slab.holes,
        sketch: slab.sketch,
    } as Record<string, unknown>;
}

/** serialise → JSON.stringify/parse (what actually lands on disk) → loader payload. */
async function roundTrip(slabData: unknown) {
    const snapshot = await serializeThroughProduction([slabData]);
    const wire = JSON.parse(JSON.stringify(snapshot)) as { slabs: Record<string, unknown>[] };
    const serialisedSlab = wire.slabs[0]!;
    const payload = loaderSlabPayload(serialisedSlab);
    // The store gate `SlabStore.add()` applies at line 201, on the record
    // `CreateSlabCommand.execute()` assembles from that payload.
    const rebuilt = {
        id: payload.id,
        type: 'slab' as const,
        levelId: payload.levelId,
        parentId: payload.levelId,
        thickness: payload.thickness,
        position: { x: 0, y: 0 as const, z: 0 },
        polygon: payload.polygon,
        holes: payload.holes,
        materialColor: '#808080',
        properties: { mark: 'SB001' },
        ifcData: { guid: payload.id, ifcClass: 'IfcSlab' },
        // CreateSlabCommand.ts:153 — `structuredClone(this.payload.sketch)`.
        sketch: payload.sketch ? structuredClone(payload.sketch) : undefined,
    };
    validateSlabData(rebuilt);          // ← the schema-validate stage
    return { snapshot, wire, serialisedSlab, payload, rebuilt };
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('C79 §10.1 — region relationship under a persistence round trip', () => {

    // ── §1 — the authored state, produced by the REAL tracer ────────────────────
    describe('§1 — authoring: the tracer emits the relationship', () => {
        it('the 4-wall room yields 4 host edges (nothing to lose is not a proof)', () => {
            const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2);
            expect(traced).not.toBeNull();
            expect(traced!.attribution.hostEdges).toBe(4);
            expect(traced!.attribution.hostWallIds.sort()).toEqual(
                ['w-east', 'w-north', 'w-south', 'w-west'],
            );
        });

        it('C79 §2.5 reference fixture — 3 straight + 1 arc gives 3 host edges', () => {
            const traced = traceRegionSketchAtPoint(threeStraightPlusArc(), 3, 2);
            expect(traced).not.toBeNull();
            expect(traced!.attribution.hostEdges).toBe(3);
            expect(traced!.attribution.curvedFallbacks).toBeGreaterThan(0);
        });
    });

    // ── §2 — THE ANSWER TO §10.1 ────────────────────────────────────────────────
    describe('§2 — the round trip', () => {
        it('hostId, reference frame, and offset SURVIVE serialise → JSON → schema', async () => {
            const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2)!;
            const before = hostEdgesOf(traced.sketch);
            expect(before).toHaveLength(4);

            const { rebuilt } = await roundTrip(slabDataFromRegion('slab-rt-1', traced));

            const after = hostEdgesOf(rebuilt.sketch as SlabSketch);
            expect(after).toHaveLength(before.length);

            // C79 §1.5 — hostId intact.
            expect(after.map(e => e.hostId).sort()).toEqual(before.map(e => e.hostId).sort());
            // C79 §3.1 — the reference frame is the TRACED frame, at offset 0.
            for (const e of after) {
                expect(e.reference).toBe('centerLine');
                expect(e.offset).toBe(0);
                expect(e.hostType).toBe('wall');
            }
            // Nothing at all was mutated in transit.
            expect(after).toEqual(before);
        });

        it('the reloaded slab is still REGION-DERIVED — the dependency graph rebuilds', async () => {
            const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2)!;
            const { rebuilt } = await roundTrip(slabDataFromRegion('slab-rt-2', traced));

            // SlabDependencyTracker.registerSlab's own walk, on the RELOADED sketch.
            const graph = dependencyGraphFor(rebuilt.sketch as SlabSketch, 'slab-rt-2');
            expect([...graph.keys()].sort()).toEqual(
                ['w-east', 'w-north', 'w-south', 'w-west'],
            );
            for (const slabIds of graph.values()) expect(slabIds.has('slab-rt-2')).toBe(true);
        });

        it('a freehand slab stays DISTINGUISHABLE from a region slab (C79 §1.5)', async () => {
            const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2)!;

            // Identical geometry, drawn freehand — no sketch at all.
            const freehand = {
                ...slabDataFromRegion('slab-freehand', traced),
                id: 'slab-freehand',
                sketch: undefined,
            };
            const region = slabDataFromRegion('slab-region', traced);

            const rtFree = await roundTrip(freehand);
            const rtRegion = await roundTrip(region);

            // Same polygon…
            expect(rtFree.rebuilt.polygon).toEqual(rtRegion.rebuilt.polygon);
            // …different MODEL RECORDS, after the round trip. This is C79 §1.5.
            expect(rtFree.rebuilt.sketch).toBeUndefined();
            expect(hostEdgesOf(rtRegion.rebuilt.sketch as SlabSketch).length).toBeGreaterThan(0);
        });

        it('C79 §2.5 counts are REPRODUCIBLE from the reloaded sketch', async () => {
            const traced = traceRegionSketchAtPoint(threeStraightPlusArc(), 3, 2)!;
            const { rebuilt } = await roundTrip(slabDataFromRegion('slab-rt-3', traced));

            const loaded = rebuilt.sketch as SlabSketch;
            const host = loaded.outerLoop.edges.filter(e => e.type === 'hostReference').length;
            const free = loaded.outerLoop.edges.filter(e => e.type === 'freeLine').length;

            expect(host).toBe(traced.attribution.hostEdges);
            expect(free).toBe(traced.attribution.freeEdges);
            expect(host).toBe(3);   // C79 §2.5's stated reference reading
            expect(host + free).toBe(loaded.outerLoop.edges.length);
        });
    });

    // ── §3 — the one field that does NOT survive, because it is never written ────
    describe('§3 — `fallback` (C79 §4.3): the DEFECT, pinned', () => {
        /**
         * C79 §4.3 is a MUST: *"The `fallback` geometry a reference degrades to MUST
         * exist AT AUTHORING TIME, populated from the traced geometry itself."*
         * `SlabRegionTracer.buildRegionSketch`'s own docstring (:655-661) states it
         * populates `fallback` on EVERY `HostReferenceEdge`.
         *
         * IT DID NOT, when this probe was first executed at `458c013a` — the two lines
         * that wrote it had been removed from `buildRegionSketch`, so the field was
         * absent from the emitted edge and only the docstring still claimed it. This
         * test was therefore pinned as `it.fails`, with the standing instruction:
         * *"When the `fallback` write is restored, this test goes GREEN-as-failure and
         * must be converted to a plain `it`."*
         *
         * ── THAT HAPPENED (2026-08-13) ──────────────────────────────────────────────
         * `SlabRegionTracer.ts:693` now writes `fallback: { start, end }` on every
         * emitted host reference. The `it.fails` consequently began reporting
         * *"Expect test to fail"* — the pin firing correctly to announce that the defect
         * it guarded is closed. Converted to a plain `it` per that instruction, so the
         * restored write is now POSITIVELY ENFORCED: if the two lines are removed again,
         * this test goes red instead of quietly reverting to "expected".
         *
         * The C79 §4.3 stake this guards, unchanged: `WallFaceResolver.degrade` →
         * `resolveOrFallback` returns `null` when the host is gone and no fallback was
         * stored — a wall deleted before any rebuild would leave an edge resolving to
         * NOTHING. Note this was never a PERSISTENCE loss: round-tripping preserved the
         * edge byte-for-byte (§2 proves that); the value simply was never authored.
         */
        it('C79 §4.3 — every emitted host reference carries a `fallback`', () => {
            const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2)!;
            for (const e of hostEdgesOf(traced.sketch)) {
                expect(e.fallback, `host edge for ${e.hostId} has no fallback`).toBeDefined();
            }
        });

        it('whatever `fallback` the tracer DOES author survives the round trip', async () => {
            const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2)!;
            const { rebuilt } = await roundTrip(slabDataFromRegion('slab-rt-4', traced));

            const before = hostEdgesOf(traced.sketch).map(e => e.fallback);
            const after = hostEdgesOf(rebuilt.sketch as SlabSketch).map(e => e.fallback);
            // Equal whether authored or absent — persistence is not the lossy stage.
            expect(after).toEqual(before);
        });

        it('a HAND-INJECTED fallback survives — proving persistence carries the field', async () => {
            const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2)!;
            // Deliberately synthetic: isolates the PERSISTENCE question from the
            // AUTHORING question above. This asserts the transport, not the tracer.
            const sketch: SlabSketch = structuredClone(traced.sketch);
            for (const e of sketch.outerLoop.edges) {
                if (e.type === 'hostReference') {
                    e.fallback = { start: { x: 1, y: 2 }, end: { x: 3, y: 4 } };
                }
            }
            const { rebuilt } = await roundTrip({
                ...slabDataFromRegion('slab-rt-5', traced),
                sketch,
            });
            for (const e of hostEdgesOf(rebuilt.sketch as SlabSketch)) {
                expect(e.fallback).toEqual({ start: { x: 1, y: 2 }, end: { x: 3, y: 4 } });
            }
        });
    });

    // ── §4 — ADVERSARIAL: would this probe CATCH a silent drop? ──────────────────
    describe('§4 — the probe would DETECT a silent drop (C74 §3.4)', () => {
        /**
         * A green suite above is worth nothing unless the same assertions go RED when
         * the relationship is removed. These three simulate the exact regressions
         * C79 §10.1 fears, and prove the probe is load-bearing.
         */
        it('DETECTS a serializer that drops `sketch` entirely', async () => {
            const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2)!;
            const { serialisedSlab } = await roundTrip(slabDataFromRegion('slab-neg-1', traced));

            const dropped = { ...serialisedSlab, sketch: undefined };
            const payload = loaderSlabPayload(dropped);
            const graph = dependencyGraphFor(
                (payload.sketch as SlabSketch) ?? { outerLoop: { edges: [] } },
                'slab-neg-1',
            );
            expect(graph.size).toBe(0);              // the defect, reproduced…
            expect(() => {
                expect(graph.size).toBe(4);          // …and the §2 assertion goes RED.
            }).toThrow();
        });

        it('DETECTS a loader that forwards `sketch` but strips `hostId`', async () => {
            const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2)!;
            const stripped: SlabSketch = {
                outerLoop: {
                    edges: traced.sketch.outerLoop.edges.map(e =>
                        e.type === 'hostReference'
                            ? { type: 'freeLine' as const, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }
                            : e,
                    ),
                },
            };
            const { rebuilt } = await roundTrip({
                ...slabDataFromRegion('slab-neg-2', traced),
                sketch: stripped,
            });
            const graph = dependencyGraphFor(rebuilt.sketch as SlabSketch, 'slab-neg-2');
            expect(graph.size).toBe(0);
            expect(hostEdgesOf(rebuilt.sketch as SlabSketch)).toHaveLength(0);
        });

        it('DETECTS a round trip that silently rewrites the reference frame', async () => {
            const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2)!;
            const faced: SlabSketch = structuredClone(traced.sketch);
            for (const e of faced.outerLoop.edges) {
                // C79 §3.2 forbids this — a face reference on a centreline-traced edge.
                if (e.type === 'hostReference') e.reference = 'interiorFace';
            }
            const { rebuilt } = await roundTrip({
                ...slabDataFromRegion('slab-neg-3', traced),
                sketch: faced,
            });
            for (const e of hostEdgesOf(rebuilt.sketch as SlabSketch)) {
                expect(e.reference).toBe('interiorFace');   // it round-tripped verbatim…
            }
            // …so the §2 frame assertion is a real check, not a tautology: the
            // transport does NOT normalise `reference` back to 'centerLine'.
            expect(hostEdgesOf(traced.sketch).every(e => e.reference === 'centerLine')).toBe(true);
        });
    });

    // ── §5 — SOURCE PINS: keep this probe honest about what production does ──────
    describe('§5 — the real serialise/load sites, pinned by source', () => {
        it('BOTH ProjectSerializers persist `sketch` via deepStrip', () => {
            for (const p of [
                'packages/persistence-client/src/loader/ProjectSerializer.ts',
                'apps/editor/src/engine/persistence/ProjectSerializer.ts',
            ]) {
                const src = readFileSync(resolve(REPO, p), 'utf8');
                expect(src, `${p} stopped persisting slab.sketch`)
                    .toContain('sketch: s.sketch ? deepStrip(s.sketch) : undefined');
            }
        });

        it('BOTH load paths forward `sketch` into CreateSlabCommand', () => {
            const loader = readFileSync(
                resolve(REPO, 'packages/persistence-client/src/loader/ProjectLoader.ts'), 'utf8');
            expect(loader).toContain('sketch: slab.sketch');

            const importCmd = readFileSync(
                resolve(REPO, 'packages/command-registry/src/project/ImportProjectCommand.ts'), 'utf8');
            expect(importCmd).toMatch(/sketch:\s*slab\.sketch/);
        });

        it('CreateSlabCommand writes `sketch` onto SlabData', () => {
            const src = readFileSync(
                resolve(REPO, 'packages/command-registry/src/slabs/CreateSlabCommand.ts'), 'utf8');
            expect(src).toContain('sketch: this.payload.sketch ? structuredClone(this.payload.sketch) : undefined');
        });

        it('the store schema admits `sketch` rather than stripping it', () => {
            const src = readFileSync(
                resolve(REPO, 'packages/geometry-slab/src/SlabValidator.ts'), 'utf8');
            // z.any() passes the value through untouched; a typed object schema here
            // WITHOUT passthrough would silently strip unknown keys — the classic
            // schema-boundary loss. If this line ever tightens, re-measure §2.
            expect(src).toContain('sketch:        z.any().optional()');
        });
    });
});
