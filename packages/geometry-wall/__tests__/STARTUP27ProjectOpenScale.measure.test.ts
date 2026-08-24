/**
 * §STARTUP27-PROJECT-OPEN-SCALE (L-10440) — THE 1x / 20x / 100x PROJECT-OPEN LEDGER.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * THE FOUNDER'S MANDATE: *"Our projects are still small — they will likely be 20x and
 * 100x larger, many elements within. I need to make sure the project's opening and
 * startup is sound."*
 *
 * ⭐ RULE ONE: A 100x CLAIM CANNOT BE REASONED ABOUT FROM A 50-ELEMENT PROJECT.
 * Every recommendation this lane makes has to point at a row in the table this file
 * prints. Nothing here asserts a performance THRESHOLD — a threshold encodes today's
 * hardware and would turn a shared suite red on a slow CI box. This file MEASURES and
 * prints; the assertions guard only that the measurement actually HAPPENED (a harness
 * that silently builds nothing would otherwise report a flawless 0 ms).
 *
 * ── WHAT IS MEASURED, AND WHY IT IS THE REAL PATH ────────────────────────────────
 *
 * `ProjectLoader` replays a saved project's walls through the SAME three calls the
 * live rebuild coordinator makes, per level:
 *
 *     builder.refreshV2Cache(specs)                 <- the V2 footprint spec cache
 *     WallJoinResolver.resolveLevel(walls)          <- junction / mitre solve
 *     builder.buildWall(w, join, renderMap, off)    <- geometry + instancing decision
 *
 * So those three phases ARE the wall half of project open, and they are what this
 * file times. It does NOT time GPU upload, shader compile or first paint — those need
 * a browser, and they are named as UNMEASURED in the report rather than estimated.
 * ⛔ An estimate printed beside three real numbers reads as a fourth real number.
 *
 * ── THE DECISIVE COLUMN: `instanced` vs `notInstanced` ───────────────────────────
 *
 * `WallFragmentBuilder`'s `isSimpleWall` predicate disqualifies a wall from the GPU
 * instanced arm if it has ANY opening. Lane DRAGPERF17 established that clause exists;
 * what nobody had measured is what fraction of a REAL building it disqualifies.
 * ⭐ In a real building almost every wall carries a door or a window, so the
 * hypothesis under test is that the instanced arm covers almost nothing at scale.
 *
 * ⛔ THE CONTROL ROW IS READ FIRST. Every scale is generated TWICE: once with the
 * realistic opening profile, once with `openings: []` and nothing else changed. If the
 * two rows instance identically then openings are CORRELATED with the cost, not
 * causal, and saying so is the finding. A census of the subject with no control cannot
 * tell those two apart — the lesson `wallJointHarness.ts` records twice.
 *
 * ── THE BUILDING IS A GRID, DELIBERATELY ─────────────────────────────────────────
 *
 * A `g x g` cell grid per level: (g+1)*g horizontal + (g+1)*g vertical segments, so
 * every interior segment meets three others at a cross and every perimeter segment
 * mitres at a corner. That is the DENSEST realistic junction topology, which makes it
 * the honest stress case for the junction solve; a real plate is sparser, so these
 * junction numbers are an UPPER bound and are labelled as such in the report.
 *
 * @file packages/geometry-wall/__tests__/STARTUP27ProjectOpenScale.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import {
    armPerf,
    disarmPerf,
    resetPerfCounters,
    perfSnapshot,
} from '@pryzm/frame-scheduler';
import { InstancedElementRenderer } from '@pryzm/core-app-model/rendering';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallInstanceBridge } from '../src/WallInstanceBridge';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { specOf } from './support/wallJointHarness';
import type { WallData } from '../src/WallTypes';

// ── Scene constants ──────────────────────────────────────────────────────────
const CELL = 4;          // metres between grid lines — a realistic room module
const H = 3;             // storey height
const T = 0.2;           // wall thickness
const LEVEL_H = 3.2;     // floor-to-floor

const WINDOW = { type: 'window', offset: CELL / 2, width: 1.2, height: 1.4, sillHeight: 0.9 };
const DOOR = { type: 'door', offset: CELL / 2, width: 0.9, height: 2.1, sillHeight: 0 };

// ── The synthetic building ───────────────────────────────────────────────────

/** How openings are distributed. `realistic` = the founder's building; `none` = the CONTROL. */
type OpeningProfile = 'realistic' | 'none';

interface Scale {
    readonly name: string;
    /** cells per side of the square floor plate */
    readonly g: number;
    readonly levels: number;
}

/**
 * ⭐ THE SCALES ARE ANCHORED ON WALL COUNT, NOT ON A GUESS ABOUT THE FOUNDER'S FILE.
 * 1x is a small multi-storey house (200 walls). 20x and 100x are his stated targets.
 * Both larger rows deliberately land PAST the two thresholds his console reports —
 * `FrustumCullingService` large-model at 500 elements, and `LevelScoped3DCullingService`
 * massing-LOD auto-escalation at 4000 elements — because a scale test that stops short
 * of a threshold cannot say what happens at it.
 */
const SCALES: Scale[] = [
    { name: '1x', g: 4, levels: 5 },     // 40/level   x 5  =    200 walls
    { name: '20x', g: 10, levels: 18 },  // 220/level  x 18 =  3,960 walls
    { name: '100x', g: 22, levels: 20 }, // 1012/level x 20 = 20,240 walls
];

let _seq = 0;

function mkWall(
    levelId: string,
    s: [number, number],
    e: [number, number],
    opening: Record<string, unknown> | null,
): WallData {
    _seq++;
    return {
        id: `s27-${_seq}`,
        type: 'wall',
        levelId,
        properties: {},
        childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: H,
        thickness: T,
        baseOffset: 0,
        openings: opening ? [{ ...opening, id: `op-${_seq}`, elementId: `el-${_seq}` }] : [],
        metadata: { createdAt: _seq, modifiedAt: _seq, createdBy: 's27', version: 1 },
    } as unknown as WallData;
}

/**
 * One level of walls on a `g x g` cell grid.
 *
 * Opening assignment mirrors how a building is actually inhabited rather than a random
 * sprinkle: a PERIMETER segment gets a window (facade), an INTERIOR segment gets a door
 * (every room needs a way in). That is what makes the realistic profile land near 100%
 * — and whether that matches the founder's file is exactly the question the control row
 * exists to bracket.
 */
function buildLevel(levelId: string, g: number, profile: OpeningProfile): WallData[] {
    const out: WallData[] = [];
    for (let r = 0; r <= g; r++) {
        for (let c = 0; c < g; c++) {
            const exterior = r === 0 || r === g;
            const op = profile === 'none' ? null : exterior ? WINDOW : DOOR;
            out.push(mkWall(levelId, [c * CELL, r * CELL], [(c + 1) * CELL, r * CELL], op));
        }
    }
    for (let c = 0; c <= g; c++) {
        for (let r = 0; r < g; r++) {
            const exterior = c === 0 || c === g;
            const op = profile === 'none' ? null : exterior ? WINDOW : DOOR;
            out.push(mkWall(levelId, [c * CELL, r * CELL], [c * CELL, (r + 1) * CELL], op));
        }
    }
    return out;
}

function levelProviderFor(levels: number) {
    const all = Array.from({ length: levels }, (_, k) => ({
        id: `L${k}`, name: `Level ${k}`, elevation: k * LEVEL_H, height: H, childrenIds: [],
    }));
    const byId = new Map(all.map(l => [l.id, l]));
    return {
        getLevelById: (id: string) => { const l = byId.get(id); return l ? { ...l } : undefined; },
        getLevels: () => all.map(l => ({ ...l })),
    };
}

// ── THREE allocation probes (the DRAGPERF17 technique) ───────────────────────
// three.js stamps every BufferGeometry and Material with a monotonically increasing
// integer id from one module counter, so the difference of two probe ids is EXACTLY
// the number of CONSTRUCTIONS between them. That cannot be fooled by pooling, cloning
// or caching — which is the property a "did the shared-material cache actually share?"
// reading needs.
function geoIdNow(): number { return new THREE.BufferGeometry().id; }
function matIdNow(): number { return new THREE.MeshBasicMaterial().id; }

// ── The row ──────────────────────────────────────────────────────────────────

interface Row {
    scale: string;
    profile: OpeningProfile;
    walls: number;
    levels: number;
    msSpecCache: number;
    msResolve: number;
    msBuild: number;
    msTotal: number;
    instanced: number;
    notInstanced: number;
    rejOpenings: number;
    rejMitreStart: number;
    rejMitreEnd: number;
    rejNoBridge: number;
    rejCurve: number;
    rejRake: number;
    rejLayers: number;
    rejProfile: number;
    groupCount: number;
    totalInstances: number;
    geometriesCreated: number;
    materialsCreated: number;
    sceneMeshes: number;
    note: string;
}

const rows: Row[] = [];

function runScale(scale: Scale, profile: OpeningProfile): Row {
    const levelProvider = levelProviderFor(scale.levels);
    const scene = new THREE.Scene();
    const renderer = new InstancedElementRenderer();
    renderer.setScene(scene);
    const builder = new WallFragmentBuilder(scene, levelProvider as never);
    builder.setInstanceBridge(new WallInstanceBridge(renderer as never));

    const byLevel: WallData[][] = [];
    for (let k = 0; k < scale.levels; k++) byLevel.push(buildLevel(`L${k}`, scale.g, profile));
    const wallCount = byLevel.reduce((a, b) => a + b.length, 0);

    resetPerfCounters();
    armPerf();

    const g0 = geoIdNow();
    const m0 = matIdNow();

    let msSpecCache = 0, msResolve = 0, msBuild = 0;
    let note = '';
    const tAll0 = performance.now();

    try {
        for (const walls of byLevel) {
            const t0 = performance.now();
            builder.refreshV2Cache(walls.map(specOf));
            const t1 = performance.now();
            const joins = WallJoinResolver.resolveLevel(walls.map(w => ({ ...w })), { snapRadius: 0.5 });
            const t2 = performance.now();
            for (const w of walls) {
                builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);
            }
            const t3 = performance.now();
            msSpecCache += t1 - t0;
            msResolve += t2 - t1;
            msBuild += t3 - t2;
        }
    } catch (e) {
        // A throw is recorded as a cell value, never as a missing row: "this scale
        // crashes the builder" is itself a finding and must not be indistinguishable
        // from "not measured".
        note = `THREW: ${(e as Error).message.slice(0, 90)}`;
    }

    const msTotal = performance.now() - tAll0;
    const geometriesCreated = geoIdNow() - g0 - 1;
    const materialsCreated = matIdNow() - m0 - 1;

    const snap = perfSnapshot();
    disarmPerf();
    const c = (k: string): number => snap.counters[k] ?? 0;

    let sceneMeshes = 0;
    scene.traverse(o => {
        const m = o as unknown as { isMesh?: boolean };
        if (m.isMesh) sceneMeshes++;
    });

    return {
        scale: scale.name,
        profile,
        walls: wallCount,
        levels: scale.levels,
        msSpecCache, msResolve, msBuild, msTotal,
        instanced: c('wall.instanced'),
        notInstanced: c('wall.notInstanced'),
        rejOpenings: c('wall.reject.hasOpenings'),
        rejMitreStart: c('wall.reject.mitreStart'),
        rejMitreEnd: c('wall.reject.mitreEnd'),
        rejNoBridge: c('wall.reject.noInstanceBridge'),
        rejCurve: c('wall.reject.curved'),
        rejRake: c('wall.reject.rakedNonVertical'),
        rejLayers: c('wall.reject.multiLayer'),
        rejProfile: c('wall.reject.hasProfile'),
        groupCount: renderer.groupCount,
        totalInstances: renderer.totalInstances,
        geometriesCreated, materialsCreated, sceneMeshes,
        note,
    };
}

// ── Reporting ────────────────────────────────────────────────────────────────
//
// §RK1-MATRIX-GOES-TO-A-FILE — the table goes to a FILE as well as the console. A
// matrix whose delivery depends on a test reporter can silently arrive empty, and an
// empty matrix is indistinguishable from a matrix of zeros.
const OUT = process.env.STARTUP27_OUT ?? join(tmpdir(), 'startup27-project-open-scale.txt');

function dump(): void {
    const pct = (n: number, d: number) => (d === 0 ? '  n/a' : `${((100 * n) / d).toFixed(1)}%`);
    const ms = (n: number) => n.toFixed(1).padStart(9);
    const L: string[] = [];
    L.push('');
    L.push('=== §STARTUP27 — PROJECT-OPEN SCALE LEDGER ===============================================');
    L.push(`  generated ${new Date().toISOString()}`);
    L.push('  PHASES ARE THE REAL LOAD PATH: refreshV2Cache -> WallJoinResolver.resolveLevel -> buildWall.');
    L.push('  NOT MEASURED HERE (needs a browser): GPU upload, shader/PSO compile, first paint,');
    L.push('     plugin registration, store hydration, culling-service escalation.');
    L.push('');
    L.push('  scale profile     walls  lvls |  specCache    resolve      build      TOTAL |  instanced   notInst   inst%');
    L.push('  ' + '-'.repeat(116));
    for (const r of rows) {
        L.push(
            `  ${r.scale.padEnd(5)} ${r.profile.padEnd(9)} ${String(r.walls).padStart(6)} ${String(r.levels).padStart(5)} |`
            + `${ms(r.msSpecCache)} ${ms(r.msResolve)} ${ms(r.msBuild)} ${ms(r.msTotal)} |`
            + `${String(r.instanced).padStart(10)} ${String(r.notInstanced).padStart(9)}  ${pct(r.instanced, r.walls)}`
            + (r.note ? `  ${r.note}` : ''),
        );
    }
    L.push('');
    L.push('  REJECTION CLAUSES (counted per FAILING CLAUSE — a wall failing three bumps three keys;');
    L.push('  read each against notInstanced, NEVER against the other clauses):');
    L.push('  scale profile   notInst  openings  mitreStart  mitreEnd   curve    rake  layers profile noBridge');
    L.push('  ' + '-'.repeat(116));
    for (const r of rows) {
        L.push(
            `  ${r.scale.padEnd(5)} ${r.profile.padEnd(9)} ${String(r.notInstanced).padStart(7)}`
            + `${String(r.rejOpenings).padStart(10)}${String(r.rejMitreStart).padStart(12)}${String(r.rejMitreEnd).padStart(10)}`
            + `${String(r.rejCurve).padStart(8)}${String(r.rejRake).padStart(8)}${String(r.rejLayers).padStart(8)}`
            + `${String(r.rejProfile).padStart(8)}${String(r.rejNoBridge).padStart(9)}`,
        );
    }
    L.push('');
    L.push('  ALLOCATION + DRAW-CALL SHAPE (geometries/materials are CONSTRUCTIONS, not live objects):');
    L.push('  scale profile     walls   sceneMeshes   geomCreated   matCreated  instGroups  instTotal  mat/wall');
    L.push('  ' + '-'.repeat(116));
    for (const r of rows) {
        const mpw = r.walls ? (r.materialsCreated / r.walls).toFixed(2) : 'n/a';
        L.push(
            `  ${r.scale.padEnd(5)} ${r.profile.padEnd(9)} ${String(r.walls).padStart(6)}`
            + `${String(r.sceneMeshes).padStart(14)}${String(r.geometriesCreated).padStart(14)}${String(r.materialsCreated).padStart(13)}`
            + `${String(r.groupCount).padStart(12)}${String(r.totalInstances).padStart(11)}${mpw.padStart(10)}`,
        );
    }
    L.push('');
    L.push('  SCALING (per-wall cost — superlinear growth here is what breaks at 100x):');
    L.push('  scale profile   us/wall(total)  us/wall(resolve)  us/wall(build)');
    L.push('  ' + '-'.repeat(116));
    for (const r of rows) {
        const per = (n: number) => (r.walls ? ((n * 1000) / r.walls).toFixed(1) : 'n/a');
        L.push(
            `  ${r.scale.padEnd(5)} ${r.profile.padEnd(9)}${per(r.msTotal).padStart(15)}${per(r.msResolve).padStart(18)}${per(r.msBuild).padStart(16)}`,
        );
    }
    L.push('==========================================================================================');
    const body = L.join('\n') + '\n';
    // eslint-disable-next-line no-console
    console.log(body);
    try {
        writeFileSync(OUT, body);
    } catch { /* a probe that cannot write its file still reports to the console */ }
}

// ── The suite ────────────────────────────────────────────────────────────────

describe('§STARTUP27 — project-open scale ledger (1x / 20x / 100x)', () => {
    for (const scale of SCALES) {
        for (const profile of ['realistic', 'none'] as OpeningProfile[]) {
            it(`${scale.name} / ${profile} — builds and reports`, () => {
                const row = runScale(scale, profile);
                rows.push(row);

                // ⭐ The ONLY assertions are that the measurement HAPPENED. A harness
                // that silently built nothing would otherwise print a flawless 0 ms,
                // and "failure and emptiness are the same value" is the defect class
                // this whole file is written against.
                expect(row.walls).toBeGreaterThan(0);
                expect(row.instanced + row.notInstanced).toBe(row.walls);
            }, 15 * 60_000);
        }
    }

    it('prints the ledger', () => {
        dump();
        expect(rows.length).toBe(SCALES.length * 2);
    });
});
