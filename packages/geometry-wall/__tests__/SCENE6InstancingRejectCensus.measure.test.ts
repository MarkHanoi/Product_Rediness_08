/**
 * §SCENE6-INSTANCING-REJECT-CENSUS (L-10000)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * THE QUESTION, VERBATIM FROM THE CODE THAT ASKS IT.
 *
 * `WallFragmentBuilder.ts:1404-1415` says of the founder's 367-wall freeze:
 *
 *   > "A generated building MITRES ITS CORNERS, so the live hypothesis is that
 *   >  `joinData.startMN` / `endMN` disqualify most of the batch. **That is a guess
 *   >  until it is counted**, which is what these lines do."
 *
 * The per-clause counters it then bumps (`PERF_KEYS.WALL_REJECT_*`) are real, and
 * `apps/editor/src/engine/pryzmPerfConsole.ts:987-1020` already prints them — but only
 * inside a running browser, only for whoever is holding the mouse. AUDIT-C §6 row 9 names
 * that exact gap: *"Without it, row 1's prerequisite cannot be satisfied by anyone but the
 * founder."*
 *
 * ⭐ THIS FILE IS THAT SAME READOUT, HEADLESS AND REPRODUCIBLE. It drives the REAL
 * `WallJoinResolver.resolveLevel` → `WallFragmentBuilder.buildWall` pipeline over wall
 * corpora shaped like the things the founder actually creates, arms the REAL
 * `PerfCounters` registry, and reads the REAL `PERF_KEYS.WALL_REJECT_*` keys. Nothing is
 * re-implemented: if the router changes, this census changes with it, because it does not
 * know what the router does — it only counts what the router bumped.
 *
 * ── WHY A CORPUS MATRIX AND NOT ONE NUMBER ──────────────────────────────────────
 *
 * "What fraction of walls instance?" has no single answer; it is a property of the
 * TOPOLOGY the user drew. A wall standing alone instances; the same wall with a
 * neighbour at its end may not. So the census reports one row per corpus and names what
 * each corpus is a model OF. A single blended percentage would hide the whole finding.
 *
 * ⛔ THE CONTROL ROW IS LOAD-BEARING AND IS READ FIRST. `control-freestanding` is 364
 * walls that touch nothing. If it does NOT come back ~100 % instanced, this instrument is
 * broken and every other row is meaningless — a census that reports 0 % everywhere is
 * indistinguishable from a census that never armed. Reading a "0 % instanced" row as a
 * finding without first reading the control is the exact failure this repo's memory calls
 * *"failure and empty are the same value"*.
 *
 * ── HOW TO READ A ROW ───────────────────────────────────────────────────────────
 *
 * Clause counts are PER FAILING CLAUSE, not per wall — `WallFragmentBuilder.ts:1417-1421`
 * says so, and a wall that is both curved and mitred bumps two keys. Read each clause
 * against `notInstanced`, NEVER against the other clauses. When one clause alone ≈ equals
 * `notInstanced`, that clause IS the answer.
 *
 * @file packages/geometry-wall/__tests__/SCENE6InstancingRejectCensus.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import {
    armPerf, disarmPerf, resetPerfCounters, perfSnapshot, PERF_KEYS,
} from '@pryzm/frame-scheduler';

import { materialInstanceSignature } from '@pryzm/renderer-three';

import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { WallInstanceBridge } from '../src/WallInstanceBridge';
import type { IInstancedRenderer } from '../src/IInstancedRenderer';
import type { WallData } from '../src/WallTypes';
import { mk, specOf, levelProvider } from './support/wallJointHarness';

// ── A renderer stand-in that only COUNTS ────────────────────────────────────────
//
// ⚠ It deliberately does NOT model InstancedElementRenderer's grouping. Group count is a
// different question (`window.__instancedElementRenderer` answers it) and conflating the
// two is how "instancing collapsed nothing" and "instancing was never reached" become
// indistinguishable. This object exists for exactly one reason: to make
// `_instanceBridge !== null` true, so that clause 1 is not the trivial answer to every row.
class CountingInstancedRenderer implements IInstancedRenderer {
    readonly registered = new Set<string>();
    register(elementId: string): void { this.registered.add(elementId); }
    updateTransform(): void { /* not measured here */ }
    unregister(elementId: string): void { this.registered.delete(elementId); }
    isRegistered(elementId: string): boolean { return this.registered.has(elementId); }
}

// ── Corpus builders ─────────────────────────────────────────────────────────────

interface Opening { id: string; type: string; offset: number; width: number; height: number; sillHeight: number }

/** N walls that touch nothing. The non-vacuity control. */
function freestanding(n: number): WallData[] {
    const out: WallData[] = [];
    for (let i = 0; i < n; i++) out.push(mk([0, i * 3], [4, i * 3]));
    return out;
}

/** One closed rectangular ring — what `CreateWallsFromSlabCommand` emits per slab. */
function ring(ox: number, oz: number, w: number, d: number, opts: Parameters<typeof mk>[2] = {}): WallData[] {
    return [
        mk([ox, oz], [ox + w, oz], opts),
        mk([ox + w, oz], [ox + w, oz + d], opts),
        mk([ox + w, oz + d], [ox, oz + d], opts),
        mk([ox, oz + d], [ox, oz], opts),
    ];
}

/** `rings` separated rectangular rings — "create walls on all slabs" at scale. */
function slabRings(rings: number): WallData[] {
    const out: WallData[] = [];
    for (let i = 0; i < rings; i++) {
        const gx = (i % 10) * 20, gz = Math.floor(i / 10) * 20;
        out.push(...ring(gx, gz, 8, 6));
    }
    return out;
}

/**
 * A room grid: `cols` × `rows` rooms of `cw` × `ch`, walls drawn segment-by-segment so
 * every interior endpoint is a real junction — the shape every PRYZM plate generator
 * emits (`weldPartitionsToShell.ts`: *"draws edge-by-edge and the WallJoinResolver mitres
 * the corners"*). Wall count = 2·rows·cols + rows + cols.
 */
function roomGrid(
    cols: number, rows: number, cw = 6, ch = 5,
    opts: { layers?: number[]; openingEvery?: number } = {},
): WallData[] {
    const out: WallData[] = [];
    const mkOpts = opts.layers ? { layers: opts.layers } : {};
    for (let r = 0; r <= rows; r++) {
        for (let c = 0; c < cols; c++) {
            out.push(mk([c * cw, r * ch], [(c + 1) * cw, r * ch], mkOpts));
        }
    }
    for (let c = 0; c <= cols; c++) {
        for (let r = 0; r < rows; r++) {
            out.push(mk([c * cw, r * ch], [c * cw, (r + 1) * ch], mkOpts));
        }
    }
    if (opts.openingEvery) {
        out.forEach((w, i) => {
            if (i % opts.openingEvery! !== 0) return;
            const op: Opening = {
                id: `op-${i}`, type: 'door', offset: 1.0, width: 0.9, height: 2.1, sillHeight: 0,
            };
            (w as unknown as { openings: Opening[] }).openings = [op];
        });
    }
    return out;
}

// ── The measurement ─────────────────────────────────────────────────────────────

interface Reading {
    corpus: string;
    what: string;
    walls: number;
    instanced: number;
    notInstanced: number;
    clauses: Record<string, number>;
    /**
     * ⛔ THE SECOND NON-VACUITY ARM, and it is the one that makes a LOW mitre count
     * readable. `notInstanced` tells you a wall left the fast arm; it does NOT tell you
     * the resolver ever looked at that wall. A corpus where `joined === 0` and
     * `mitreStart === 0` is INDISTINGUISHABLE, from the clause counters alone, from a
     * corpus the resolver mitred everywhere via a mechanism that is not an MN — and the
     * two demand opposite conclusions. `joined` = walls the resolver returned a JoinData
     * for; `trimmed` = walls whose BASELINE the resolver actually moved. A row with
     * `trimmed` high and `mitreStart` ~0 is a real finding (the resolver engaged and
     * declined to mint a miter normal); a row with both at 0 is a dead instrument.
     */
    joined: number;
    trimmed: number;
    expectJoins: boolean;
    /**
     * Scene meshes after building the whole corpus. The founder's freeze is quoted as
     * "2069 scene meshes" for 367 walls; a per-corpus mesh count is the only way to say
     * which topology can even produce that ratio.
     */
    meshes: number;
    /**
     * ⭐ DISTINCT MATERIAL INSTANCES vs DISTINCT VISUAL SIGNATURES in the built scene.
     *
     * This pair is here because "2069 scene meshes" is NOT, on its own, a draw-call
     * problem — a current GPU draws 2069 meshes without noticing. What DOES cost
     * whole seconds is a TSL/shader compile per UNIQUE material, which is precisely
     * why `RendererHandleFactory.ts:155-176` picks the WebGL-only rung "deliberately
     * for heavy generation to kill the TSL node-compile tail".
     *
     * `matInstances` counts `material.uuid`; `matSignatures` counts
     * `materialInstanceSignature()` — the VISUAL identity. When instances >>
     * signatures, N identical-looking materials were minted as N objects, which is
     * §PERF-INSTANCE-MATERIAL-DEDUP's exact failure and defeats instancing *and*
     * merging at the same time, because both group by material.
     */
    matInstances: number;
    matSignatures: number;
    /**
     * ⛔ WHAT THE MESHES ACTUALLY ARE. Without this the material count above is
     * unreadable: 364 materials on 364 meshes means one per wall BODY; 364 materials
     * on meshes that are all pick/overlay proxies would mean something completely
     * different. A number whose subject is unidentified is not a measurement.
     */
    meshKinds: Record<string, number>;
    resolveMs: number;
    buildMs: number;
}

const CLAUSES: [string, string][] = [
    ['noBridge',   PERF_KEYS.WALL_REJECT_NO_BRIDGE],
    ['openings',   PERF_KEYS.WALL_REJECT_OPENINGS],
    ['curved',     PERF_KEYS.WALL_REJECT_CURVE],
    ['mitreStart', PERF_KEYS.WALL_REJECT_MITRE_START],
    ['mitreEnd',   PERF_KEYS.WALL_REJECT_MITRE_END],
    ['raked',      PERF_KEYS.WALL_REJECT_RAKE],
    ['multiLayer', PERF_KEYS.WALL_REJECT_LAYERS],
    ['profile',    PERF_KEYS.WALL_REJECT_PROFILE],
];

/**
 * @param expectJoins  Does this corpus CONTAIN junctions? The control does not, so a
 *   `joined === 0` reading is correct there and must not raise the dead-instrument
 *   banner — a banner that fires on a healthy row teaches the reader to ignore it.
 */
function census(corpus: string, what: string, walls: WallData[], expectJoins = true): Reading {
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, levelProvider() as never);
    builder.setInstanceBridge(new WallInstanceBridge(new CountingInstancedRenderer()));

    builder.refreshV2Cache(walls.map(specOf));

    resetPerfCounters();
    armPerf();
    const t0 = Date.now();
    const joins = WallJoinResolver.resolveLevel(walls.map(w => ({ ...w })), { snapRadius: 0.5 });
    const t1 = Date.now();
    for (const w of walls) builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);
    const t2 = Date.now();
    const snap = perfSnapshot();
    disarmPerf();

    const clauses: Record<string, number> = {};
    for (const [label, key] of CLAUSES) clauses[label] = snap.counters[key] ?? 0;

    // Join engagement, read off the resolver's OWN output rather than off a counter,
    // so it cannot be satisfied by the same bug that would zero the counters.
    let joined = 0, trimmed = 0;
    for (const w of walls) {
        const jd = joins.get(w.id);
        if (!jd) continue;
        joined++;
        const moved =
            Math.hypot(jd.baseLine[0].x - w.baseLine[0].x, jd.baseLine[0].z - w.baseLine[0].z) > 1e-6 ||
            Math.hypot(jd.baseLine[1].x - w.baseLine[1].x, jd.baseLine[1].z - w.baseLine[1].z) > 1e-6;
        if (moved) trimmed++;
    }

    let meshes = 0;
    const meshKinds: Record<string, number> = {};
    const matUuids = new Set<string>();
    const matSigs = new Set<string>();
    scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        meshes++;
        const ud = (m.userData ?? {}) as { elementType?: string };
        const kind = `${m.name || '(unnamed)'}|${ud.elementType ?? '-'}|${(m.material as THREE.Material | undefined)?.type ?? '-'}`;
        meshKinds[kind] = (meshKinds[kind] ?? 0) + 1;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
            if (!mat) continue;
            matUuids.add(mat.uuid);
            // `null` ⇒ the serializer declines to fingerprint this material; count the
            // uuid so a declined material can never read as "shared with everything".
            matSigs.add(materialInstanceSignature(mat) ?? `uuid:${mat.uuid}`);
        }
    });

    return {
        corpus, what,
        walls: walls.length,
        instanced: snap.counters[PERF_KEYS.WALL_INSTANCED] ?? 0,
        notInstanced: snap.counters[PERF_KEYS.WALL_NOT_INSTANCED] ?? 0,
        clauses,
        joined, trimmed, meshes, expectJoins,
        matInstances: matUuids.size,
        matSignatures: matSigs.size,
        meshKinds,
        resolveMs: t1 - t0,
        buildMs: t2 - t1,
    };
}

const readings: Reading[] = [];

function report(): string {
    const L = '─'.repeat(112);
    const lines: string[] = [
        '',
        '  §SCENE6-INSTANCING-REJECT-CENSUS (L-10000) — WHY A WALL LEFT THE INSTANCED ARM',
        '  Counters are the PRODUCTION PERF_KEYS, bumped by WallFragmentBuilder.ts:1428-1443.',
        '  Clause counts are PER FAILING CLAUSE — read each against notInstanced, never against each other.',
        L,
    ];
    for (const r of readings) {
        const pct = r.walls > 0 ? ((r.instanced / r.walls) * 100).toFixed(1) : '—';
        lines.push(`  ${r.corpus}`);
        lines.push(`      ${r.what}`);
        lines.push(
            `      walls=${String(r.walls).padStart(4)}   INSTANCED=${String(r.instanced).padStart(4)} (${pct.padStart(5)}%)` +
            `   standard-mesh=${String(r.notInstanced).padStart(4)}` +
            `   scene-meshes=${String(r.meshes).padStart(5)}` +
            `   resolve=${r.resolveMs}ms  build=${r.buildMs}ms`,
        );
        lines.push(
            `      materials: ${r.matInstances} distinct INSTANCES for ${r.matSignatures} distinct VISUAL SIGNATURES` +
            (r.matInstances > r.matSignatures * 2
                ? `   ⭐ ${r.matInstances - r.matSignatures} redundant material objects — a shader compile each`
                : ''),
        );
        const kinds = Object.entries(r.meshKinds).sort((a, b) => b[1] - a[1]).slice(0, 3);
        lines.push(`      mesh kinds (name|elementType|materialType): ${kinds.map(([k, v]) => `${k} ×${v}`).join('   ') || '(none)'}`);
        lines.push(
            `      join engagement: resolver returned JoinData for ${r.joined}/${r.walls}` +
            `, MOVED the baseline of ${r.trimmed}/${r.walls}` +
            (r.expectJoins && r.joined === 0
                ? '   ⛔ RESOLVER NEVER ENGAGED — clause counts below are vacuous'
                : (!r.expectJoins ? '   (corpus has no junctions — 0 is the correct reading)' : '')),
        );
        const hits = CLAUSES.map(([l]) => [l, r.clauses[l]] as const).filter(([, v]) => v > 0);
        if (hits.length === 0) {
            lines.push('        (no reject clause fired)');
        } else {
            for (const [label, v] of hits) {
                const share = r.notInstanced > 0 ? `${((v / r.notInstanced) * 100).toFixed(0)}% of rejects` : '';
                const dom = r.notInstanced > 0 && v === r.notInstanced ? '   ⭐ ALONE ACCOUNTS FOR EVERY REJECT' : '';
                lines.push(`        ✗ ${label.padEnd(11)} ${String(v).padStart(4)}   ${share}${dom}`);
            }
        }
        lines.push(L);
    }
    return lines.join('\n');
}

describe('§SCENE6-INSTANCING-REJECT-CENSUS (L-10000) — the ITEM 10 prerequisite', () => {

    it('CONTROL — 364 free-standing walls must be ~100% instanced (non-vacuity)', () => {
        const r = census(
            'control-freestanding',
            '364 walls touching nothing. If this is not ~100% instanced the instrument is broken.',
            freestanding(364),
            /* expectJoins */ false,
        );
        readings.push(r);
        expect(r.walls).toBe(364);
        // The control is the instrument's own calibration. A failure here invalidates every
        // other row in this file and must NOT be relaxed into a range that a broken census
        // could also satisfy.
        expect(r.instanced).toBe(364);
        expect(r.notInstanced).toBe(0);
        // §SCENE6-PROXY-MAT-IS-ONE-MATERIAL (L-10003) — this row USED to read
        // "364 distinct material INSTANCES for 1 distinct VISUAL SIGNATURE": every
        // instanced wall's §INSTANCED-SELECTION-FIX hit proxy minted its own
        // MeshBasicMaterial, i.e. 363 needless node-material compiles on the arm that
        // is supposed to be the FAST one. The proxy writes no colour and no depth, so
        // one object serves every wall. Pinned here rather than only in
        // SCENE6HitProxySharedMaterial.test.ts because this census is what would
        // notice the regression at scale.
        expect(r.matInstances).toBe(1);
        expect(r.matSignatures).toBe(1);
    });

    it('SLAB RINGS — 91 rectangular slab perimeters (364 walls), the founder\'s literal gesture', () => {
        const r = census(
            'slab-rings-91x4',
            '91 separated closed rectangular rings = 364 walls. What CreateWallsFromSlabCommand emits.',
            slabRings(91),
        );
        readings.push(r);
        expect(r.walls).toBe(364);
        expect(r.instanced + r.notInstanced).toBe(364);
    });

    it('ROOM GRID — 13x13 rooms (364 walls), a generated floor plate', () => {
        const r = census(
            'room-grid-13x13',
            '13x13 rooms drawn edge-by-edge = 364 walls; every interior endpoint is a junction.',
            roomGrid(13, 13),
        );
        readings.push(r);
        expect(r.walls).toBe(364);
        expect(r.instanced + r.notInstanced).toBe(364);
    });

    it('ROOM GRID + OPENINGS — same plate with a door on every 3rd wall', () => {
        const r = census(
            'room-grid-8x8-doors',
            '8x8 rooms = 144 walls, a door on every 3rd. Separates the mitre clause from the opening clause.',
            roomGrid(8, 8, 6, 5, { openingEvery: 3 }),
        );
        readings.push(r);
        expect(r.instanced + r.notInstanced).toBe(r.walls);
    });

    it('ROOM GRID + 3-LAYER PARTITIONS — separates the mitre clause from the layer clause', () => {
        const r = census(
            'room-grid-8x8-layered',
            '8x8 rooms = 144 walls, all wt-interior-partition (3 layers). Both clauses fire on every wall.',
            roomGrid(8, 8, 6, 5, { layers: [0.0125, 0.075, 0.0125] }),
        );
        readings.push(r);
        expect(r.instanced + r.notInstanced).toBe(r.walls);
    });

    it('REALISTIC PLATE — 13x13 rooms where EVERY wall carries an opening', () => {
        // ⭐ THE ROW THAT DECIDES ITEM 11, and it is deliberately the LEAST flattering.
        // The two rows above bracket the founder's gesture (a ring is 100% mitre-rejected;
        // a bare grid is 98% instanced), but neither is a BUILDING. A building's interior
        // walls carry doors and its exterior walls carry windows, and `hasOpenings` is
        // clause 2. If a plate whose walls all have an opening still instances well, the
        // merge batcher is not needed; if it collapses, the merge batcher is the only
        // mechanism that reaches these walls, because an opening is a HOLE and a hole is
        // not expressible in a unit box × T·R·S any more than a shear is.
        const r = census(
            'realistic-plate-13x13-openings',
            '13x13 rooms = 364 walls, EVERY wall carries a door. What a real floor actually is.',
            roomGrid(13, 13, 6, 5, { openingEvery: 1 }),
        );
        readings.push(r);
        expect(r.walls).toBe(364);
        expect(r.instanced + r.notInstanced).toBe(364);
    });

    it('REPORT — dump the matrix (console AND file; a reporter can swallow one, not both)', () => {
        const text = report();
        // eslint-disable-next-line no-console
        console.log(text);
        const out = join(tmpdir(), 'scene6-instancing-reject-census.txt');
        writeFileSync(out, text, 'utf8');
        // eslint-disable-next-line no-console
        console.log(`  [census] written to ${out}`);
        expect(readings.length).toBe(6);
    });
});
