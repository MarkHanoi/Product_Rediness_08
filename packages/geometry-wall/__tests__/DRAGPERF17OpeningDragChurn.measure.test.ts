/**
 * §DRAGPERF17-OPENING-DRAG-CHURN (L-10240) — THE PER-FRAME CREATE/DISPOSE LEDGER.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * THE FOUNDER'S REPORT: *"while moving a window ghosted on a raked, edited-profile wall
 * (it seems performance is terrible) the WebGL collapsed."*
 *
 * TWO CLAIMS ARE BEING TESTED HERE, AND THEY ARE NOT THE SAME CLAIM:
 *
 *   1. COST — how much geometry/material does ONE ghost-drag frame allocate?
 *   2. BALANCE — does that allocation come back? `creates ≫ disposes` is a LEAK, and a
 *      leak is the classic path to GPU memory exhaustion → device lost → "collapsed".
 *      `creates ≈ disposes` means the collapse is NOT here and optimising this path
 *      would be optimising something innocent.
 *
 * ⭐ WHY THIS MEASURES `builder.updateWall` AND NOTHING ELSE. A window ghost-drag in plan
 * runs `PlanElementDragController._moveDoorWindow` → `WallStore.updateWindow` per
 * pointermove. That bumps `wall._renderVersion` and emits `'update'` with a prevState, so
 * `classifyWallDelta` returns `openings-only` and `WallRebuildCoordinator._flushOpeningsOnly`
 * calls exactly this: `builder.updateWall(fresh, cachedJoin, renderMap, slabOff)`. So the
 * per-frame wall cost IS this call. (The window-frame leg —
 * `WindowBuilder.rebuildForWall` — lives in a package this one does not depend on and is
 * measured separately; see the lane report.)
 *
 * ── HOW CREATES ARE COUNTED, AND WHY IT IS EXACT ─────────────────────────────────
 *
 * three.js stamps every `BufferGeometry` and every `Material` with a monotonically
 * increasing integer `id` from one module-level counter. So the number of geometries
 * constructed between two instants is EXACTLY the difference of two probe ids, minus the
 * probes themselves. That is a count of CONSTRUCTIONS, not of live objects, and it cannot
 * be fooled by pooling, cloning or caching — which is the property this measurement needs.
 *
 * Disposes are counted by wrapping the two `dispose` prototypes. Both counters are
 * restored in `afterEach`, so nothing leaks into a sibling suite.
 *
 * ⛔ THE CONTROL ROW IS READ FIRST. `plain-vertical` is the same wall with the same window
 * and NO rake and NO profile. If the founder's raked+profiled row and the control row
 * churn the same amount, then rake and profile are CORRELATED with his report, not
 * CAUSAL — and saying so is the finding. A census that reports a big number for the
 * subject without a control cannot tell those two apart.
 *
 * @file packages/geometry-wall/__tests__/DRAGPERF17OpeningDragChurn.measure.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import { drainGpuReleaseQueue, pendingGpuReleaseCount } from '@pryzm/renderer-three';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import type { WallData } from '../src/WallTypes';
import { mk, levelProvider, specOf } from './support/wallJointHarness';

// ── The instrument ────────────────────────────────────────────────────────────

let geoDisposed = 0;
let matDisposed = 0;
let origGeoDispose: () => void;
let origMatDispose: () => void;

function armInstrument(): void {
    geoDisposed = 0;
    matDisposed = 0;
    origGeoDispose = THREE.BufferGeometry.prototype.dispose;
    origMatDispose = THREE.Material.prototype.dispose;
    THREE.BufferGeometry.prototype.dispose = function (this: THREE.BufferGeometry) {
        geoDisposed++;
        return origGeoDispose.call(this);
    };
    THREE.Material.prototype.dispose = function (this: THREE.Material) {
        matDisposed++;
        return origMatDispose.call(this);
    };
}

function disarmInstrument(): void {
    THREE.BufferGeometry.prototype.dispose = origGeoDispose;
    THREE.Material.prototype.dispose = origMatDispose;
}

/** three.js `id` counters — a probe allocation reads the counter without side effects. */
function geoIdNow(): number { return new THREE.BufferGeometry().id; }
function matIdNow(): number { return new THREE.MeshBasicMaterial().id; }

// ── The subject ───────────────────────────────────────────────────────────────

const WALL_LEN = 5;
const HEIGHT = 3;
const RAKE_DEG = 80;

/** The founder's window on the host, as `WallStore.updateWindow` would write it. */
function windowOpening(offset: number) {
    return {
        id: 'op-1',
        elementId: 'win-1',
        type: 'window',
        offset,
        width: 1.2,
        height: 1.4,
        sillHeight: 0.9,
    };
}

/**
 * An EDITED profile: the authored elevation outline of a wall whose top has been cut
 * down at one end. Deliberately a real, bounded, CCW ring inside [0,L]x[0,h] so
 * `hasWallProfile` accepts it and the profiled body path is genuinely entered.
 */
const EDITED_PROFILE = {
    ring: [
        { u: 0, v: 0 },
        { u: WALL_LEN, v: 0 },
        { u: WALL_LEN, v: HEIGHT * 0.55 },
        { u: 0, v: HEIGHT },
    ],
};

interface Variant {
    readonly name: string;
    readonly rake: boolean;
    readonly profile: boolean;
}

const VARIANTS: readonly Variant[] = [
    { name: 'plain-vertical  (CONTROL)', rake: false, profile: false },
    { name: 'raked-only', rake: true, profile: false },
    { name: 'profile-only', rake: false, profile: true },
    { name: "raked+profile   (FOUNDER'S)", rake: true, profile: true },
];

function makeWall(v: Variant, offset: number, renderVersion: number): WallData {
    const w = mk([0, 0], [WALL_LEN, 0], {
        openings: [windowOpening(offset)] as never,
        ...(v.rake ? { rake: RAKE_DEG } : {}),
    }) as WallData & Record<string, unknown>;
    w.id = 'subject';
    w.height = HEIGHT;
    w._renderVersion = renderVersion;
    if (v.profile) w.wallProfile = EDITED_PROFILE;
    return w as WallData;
}

interface Row {
    variant: string;
    frames: number;
    geoCreated: number;
    geoDisposed: number;
    matCreated: number;
    matDisposed: number;
    meshesBefore: number;
    meshesAfter: number;
    pendingAfter: number;
    msTotal: number;
}

const rows: Row[] = [];

function countMeshes(scene: THREE.Scene): number {
    let n = 0;
    scene.traverse(o => { if ((o as THREE.Mesh).isMesh) n++; });
    return n;
}

/**
 * ONE ghost-drag, measured. `FRAMES` pointermove frames, each nudging the opening by
 * 20 mm and bumping `_renderVersion` exactly as `WallStore.updateWindow` does, each
 * followed by a frame-boundary drain exactly as `RenderPipelineManager.render()` does.
 */
function dragCensus(v: Variant, FRAMES: number): Row {
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene as never, levelProvider() as never);
    builder.refreshV2Cache([specOf(makeWall(v, 0.5, 0))] as never);

    // Frame 0 — the wall as it stood when the user grabbed the window. Not counted.
    builder.updateWall(makeWall(v, 0.5, 0) as never, null, undefined, 0);
    drainGpuReleaseQueue();
    const meshesBefore = countMeshes(scene);

    armInstrument();
    const g0 = geoIdNow();
    const m0 = matIdNow();
    const t0 = Date.now();

    for (let f = 1; f <= FRAMES; f++) {
        const wall = makeWall(v, 0.5 + f * 0.02, f);
        builder.updateWall(wall as never, null, undefined, 0);
        drainGpuReleaseQueue();               // the frame boundary
    }

    const t1 = Date.now();
    const g1 = geoIdNow();
    const m1 = matIdNow();
    const row: Row = {
        variant: v.name,
        frames: FRAMES,
        // −1 for this probe, −1 for the opening probe: both probes sit inside the span.
        geoCreated: g1 - g0 - 1,
        geoDisposed: geoDisposed,
        matCreated: m1 - m0 - 1,
        matDisposed: matDisposed,
        meshesBefore,
        meshesAfter: countMeshes(scene),
        pendingAfter: pendingGpuReleaseCount(),
        msTotal: t1 - t0,
    };
    disarmInstrument();
    rows.push(row);
    return row;
}

function fmt(r: Row): string {
    const per = (n: number) => (n / r.frames).toFixed(1).padStart(7);
    return (
        `${r.variant.padEnd(28)}` +
        ` geo ${String(r.geoCreated).padStart(5)}c/${String(r.geoDisposed).padStart(5)}d` +
        ` (${per(r.geoCreated)}c ${per(r.geoDisposed)}d per frame)` +
        ` | mat ${String(r.matCreated).padStart(4)}c/${String(r.matDisposed).padStart(4)}d` +
        ` (${per(r.matCreated)}c ${per(r.matDisposed)}d per frame)` +
        ` | meshes ${r.meshesBefore}→${r.meshesAfter}` +
        ` | queue-left ${r.pendingAfter}` +
        ` | ${String(r.msTotal).padStart(5)} ms (${(r.msTotal / r.frames).toFixed(2)} ms/frame)`
    );
}

describe('§DRAGPERF17 — window ghost-drag: what ONE frame allocates, and whether it comes back', () => {
    beforeEach(() => { drainGpuReleaseQueue(); });
    afterEach(() => { drainGpuReleaseQueue(); });

    it('⭐ the per-frame create/dispose ledger, four wall variants, control read FIRST', () => {
        const FRAMES = 30;
        for (const v of VARIANTS) dragCensus(v, FRAMES);

        const report = [
            '§DRAGPERF17-OPENING-DRAG-CHURN — per-frame GPU-object ledger',
            `frames per drag: ${FRAMES}   (one pointermove each, +20 mm, +1 _renderVersion)`,
            '',
            ...rows.map(fmt),
            '',
            'READ THE CONTROL FIRST: if plain-vertical churns the same as raked+profile,',
            'rake and profile are CORRELATED with the founder\'s report, not CAUSAL.',
        ].join('\n');
        // eslint-disable-next-line no-console
        console.log('\n' + report + '\n');
        try {
            writeFileSync(join(tmpdir(), 'dragperf17-opening-drag-churn.txt'), report);
        } catch { /* diagnostics only */ }

        // The instrument must have measured something at all — a census of zeros is
        // indistinguishable from a census that never ran.
        for (const r of rows) {
            expect(r.geoCreated, `${r.variant} created no geometry — instrument dead?`).toBeGreaterThan(0);
        }
    });

    it('⛔ THE LEAK GATE — a ghost-drag frame must RETURN what it allocates', () => {
        // Pinned as a RATIO, not a count: the absolute number is a property of how many
        // segments an opening-bearing wall is cut into and will move with the builder.
        // What must NOT move is the balance. A frame that allocates 40 geometries and
        // frees 39 is a leak that reaches device-loss in a few thousand frames; a frame
        // that allocates 40 and frees 40 is expensive but survivable.
        for (const r of rows) {
            const ratio = r.geoDisposed / Math.max(1, r.geoCreated);
            expect(
                ratio,
                `${r.variant}: geometry creates ${r.geoCreated} vs disposes ${r.geoDisposed} ` +
                `(ratio ${ratio.toFixed(3)}) — a ratio below 0.9 is an unbounded per-frame leak`,
            ).toBeGreaterThan(0.9);
        }
    });

    it('⛔ the scene-graph mesh count must not GROW across a drag (no orphan accumulation)', () => {
        for (const r of rows) {
            expect(
                r.meshesAfter,
                `${r.variant}: scene meshes grew ${r.meshesBefore} → ${r.meshesAfter} across the drag`,
            ).toBeLessThanOrEqual(r.meshesBefore + 2);
        }
    });

    it('⛔ the deferred-release queue must be EMPTY after the last frame boundary', () => {
        for (const r of rows) {
            expect(r.pendingAfter, `${r.variant}: ${r.pendingAfter} releases never drained`).toBe(0);
        }
    });
});
