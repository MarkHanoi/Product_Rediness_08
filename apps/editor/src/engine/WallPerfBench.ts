/**
 * @migration S90-WIRE — moved from src/dev/WallPerfBench.ts
 * Relative imports corrected: ../commands/ → ../../commands/ etc.
 *
 * §PERF-2026-BENCH — Wall + Curtain-Wall Creation Benchmark Harness
 *
 * Devtool that programmatically places N walls (default: 25 four-wall square
 * rooms = 100 walls, 100 corner-joins) and an optional curtain wall on the
 * active level, then measures and prints:
 *
 *   1. Per-CreateWallCommand.execute() sync time  (what the user feels per click)
 *   2. WallJoinResolver.resolveLevel() time on the resulting level
 *      (5 repetitions, statistics)        (the §F1–§F3 hot path under audit)
 *   3. CreateCurtainWallCommand.execute() time
 *   4. End-to-end "place wall + flush" time including the rAF flush callback
 *
 * After measurement, every test wall + curtain wall is deleted via the
 * standard DeleteElementCommand so the user's project is left exactly as it
 * was found.
 *
 * Usage from the browser console:
 *   await window.__wallPerfBench.run()                         // 100 walls + 1 cw, default
 *   await window.__wallPerfBench.run({ wallCount: 200 })       // bigger batch
 *   await window.__wallPerfBench.run({ withCurtainWall: false })
 *   await window.__wallPerfBench.run({ cleanup: false })       // leave walls for inspection
 *
 * The harness is registered as a window global by EngineBootstrap so it is
 * available immediately after the engine boots. Production-safe: pure
 * read-only on disk, all writes go through the standard command pipeline,
 * and the cleanup step is undoable via Cmd-Z if cleanup: false is used and
 * the user later wants to revert.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { CreateWallCommand, CreateCurtainWallCommand, DeleteElementCommand } from '@pryzm/command-registry';
import { WallJoinResolver } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';

interface BenchOptions {
    /** Number of walls to create. Default 100 (= 25 rooms × 4 walls). */
    wallCount?: number;
    /** Whether to additionally create one curtain wall. Default true. */
    withCurtainWall?: boolean;
    /** Whether to delete the test elements after measurement. Default true. */
    cleanup?: boolean;
    /** Spacing in meters between adjacent test rooms in the grid. Default 8. */
    roomSpacing?: number;
    /** Side length of each square test room in meters. Default 4. */
    roomSize?: number;
    /** Number of repetitions for the resolveLevel() timing pass. Default 5. */
    resolverRepeats?: number;
}

interface BenchSummary {
    wallCount: number;
    levelId: string;
    perCreate: { min: number; avg: number; max: number; total: number };
    resolveLevel: { min: number; avg: number; max: number; samples: number[] };
    curtainWall?: { createMs: number };
    flushE2E: { totalMs: number };
}

function _stats(samples: number[]): { min: number; avg: number; max: number } {
    if (samples.length === 0) return { min: 0, avg: 0, max: 0 };
    let min = Infinity, max = -Infinity, sum = 0;
    for (const s of samples) { if (s < min) min = s; if (s > max) max = s; sum += s; }
    return { min, avg: sum / samples.length, max };
}

function _waitFrame(): Promise<void> {
    // D.7.5 batch #5: yield one scheduler tick (semantically equivalent to a
    // single animation frame yield, routed through getFrameScheduler()).
    return new Promise<void>((resolve) => {
        getFrameScheduler().scheduleOnce('wall-perf-bench-yield', () => resolve());
    });
}

async function _waitFlushed(framesAfter = 3): Promise<void> {
    for (let i = 0; i < framesAfter; i++) await _waitFrame();
}

class WallPerfBench {

    async run(opts: BenchOptions = {}): Promise<BenchSummary> {
        const wallCount       = opts.wallCount       ?? 100;
        const withCurtainWall = opts.withCurtainWall ?? true;
        const cleanup         = opts.cleanup         ?? true;
        const roomSpacing     = opts.roomSpacing     ?? 8;
        const roomSize        = opts.roomSize        ?? 4;
        const resolverRepeats = opts.resolverRepeats ?? 5;

        // E.5.8: use window.commandManager directly (P4.4 legacy bridge deleted).
        // Synchronous execute() preserves per-call timing accuracy
        // (bus.executeCommand() is async and would inflate measurements).
        const bridge = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
        if (!bridge) throw new Error('[WallPerfBench] CommandManagerBridge not available — engine not bootstrapped?');

        const bim = window.bimManager;
        if (!bim?.getLevels) throw new Error('[WallPerfBench] bimManager not available');

        const wallStore = window.wallStore; // TODO(TASK-08)
        if (!wallStore) throw new Error('[WallPerfBench] wallStore not available');

        const levels = bim.getLevels();
        if (!levels?.length) throw new Error('[WallPerfBench] no levels in project');
        const level = levels[0];
        const levelId: string = level.id;

        // Find an empty area: offset the test grid 1000m from origin so it
        // never collides with the user's existing geometry.
        const ORIGIN_X = 1000;
        const ORIGIN_Z = 1000;

        // 4 walls per room, lay rooms in a square-ish grid.
        const rooms = Math.max(1, Math.ceil(wallCount / 4));
        const cols  = Math.ceil(Math.sqrt(rooms));

        const createdWallIds: string[] = [];
        const perCreateMs: number[] = [];
        let createdCount = 0;

        const e2eStart = performance.now();

        for (let r = 0; r < rooms && createdCount < wallCount; r++) {
            const cx = ORIGIN_X + (r % cols) * roomSpacing;
            const cz = ORIGIN_Z + Math.floor(r / cols) * roomSpacing;

            // 4 corners of a room
            const c00 = { x: cx,            z: cz            };
            const c10 = { x: cx + roomSize, z: cz            };
            const c11 = { x: cx + roomSize, z: cz + roomSize };
            const c01 = { x: cx,            z: cz + roomSize };

            const segs: Array<{ s: { x: number, z: number }, e: { x: number, z: number } }> = [
                { s: c00, e: c10 },
                { s: c10, e: c11 },
                { s: c11, e: c01 },
                { s: c01, e: c00 },
            ];

            for (const seg of segs) {
                if (createdCount >= wallCount) break;
                const wallId = crypto.randomUUID();
                const cmd = new CreateWallCommand(wallId, {
                    start:     seg.s,
                    end:       seg.e,
                    height:    2.7,
                    thickness: 0.2,
                    levelId,
                });
                const t0 = performance.now();
                const res: any = bridge.execute(cmd);
                const dt = performance.now() - t0;
                if (res?.ok) {
                    perCreateMs.push(dt);
                    createdWallIds.push(wallId);
                    createdCount++;
                } else {
                    console.warn('[WallPerfBench] CreateWallCommand failed:', res);
                }
            }
        }

        // Wait for the rAF-debounced wall flush + join resolver pass to settle.
        await _waitFlushed();
        const e2eMs = performance.now() - e2eStart;

        // ── Pure resolver timing — isolates the §F1–§F3 hot path ────────────
        const levelWallsAll: WallData[] = wallStore.getAll().filter((w: WallData) => w.levelId === levelId);
        const resolverSamples: number[] = [];
        for (let i = 0; i < resolverRepeats; i++) {
            const t0 = performance.now();
            WallJoinResolver.resolveLevel(levelWallsAll);
            resolverSamples.push(performance.now() - t0);
        }

        // ── Optional curtain wall ──────────────────────────────────────────
        let curtainWallStat: { createMs: number } | undefined;
        let cwId: string | null = null;
        if (withCurtainWall) {
            cwId = crypto.randomUUID();
            const cwCmd = new CreateCurtainWallCommand({
                id:     cwId,
                start:  { x: ORIGIN_X - 5, z: ORIGIN_Z - 5 },
                end:    { x: ORIGIN_X - 5, z: ORIGIN_Z + 5 },
                height: 3.0,
                levelId,
            });
            const t0 = performance.now();
            const res: any = bridge.execute(cwCmd);
            const dt = performance.now() - t0;
            if (res?.ok) curtainWallStat = { createMs: dt };
            else { console.warn('[WallPerfBench] CreateCurtainWallCommand failed:', res); cwId = null; }
            await _waitFlushed();
        }

        // ── Cleanup ────────────────────────────────────────────────────────
        if (cleanup) {
            for (const wid of createdWallIds) bridge.execute(new DeleteElementCommand(wid));
            if (cwId)                         bridge.execute(new DeleteElementCommand(cwId));
            await _waitFlushed();
        }

        const summary: BenchSummary = {
            wallCount: createdCount,
            levelId,
            perCreate: { ...(_stats(perCreateMs)), total: perCreateMs.reduce((a, b) => a + b, 0) },
            resolveLevel: { ..._stats(resolverSamples), samples: resolverSamples.map(s => +s.toFixed(2)) },
            curtainWall: curtainWallStat,
            flushE2E: { totalMs: e2eMs },
        };

        // ── Print ─────────────────────────────────────────────────────────
        console.log(`%c[WallPerfBench] ${createdCount}-wall benchmark on level "${levelId}"`, 'font-weight:bold;color:#0aa;');
        console.table({
            'CreateWallCommand.execute() (per call, ms)': {
                min: +summary.perCreate.min.toFixed(2),
                avg: +summary.perCreate.avg.toFixed(2),
                max: +summary.perCreate.max.toFixed(2),
                total: +summary.perCreate.total.toFixed(2),
            },
            [`WallJoinResolver.resolveLevel() (${resolverRepeats}x ${createdCount} walls, ms)`]: {
                min: +summary.resolveLevel.min.toFixed(2),
                avg: +summary.resolveLevel.avg.toFixed(2),
                max: +summary.resolveLevel.max.toFixed(2),
                total: '—',
            },
            'End-to-end (creates + rAF flush, ms)': {
                min: '—', avg: '—', max: '—',
                total: +summary.flushE2E.totalMs.toFixed(2),
            },
            ...(curtainWallStat ? {
                'CreateCurtainWallCommand.execute() (ms)': {
                    min: '—', avg: '—', max: '—',
                    total: +curtainWallStat.createMs.toFixed(2),
                },
            } : {}),
        });
        console.log('[WallPerfBench] resolveLevel samples (ms):', summary.resolveLevel.samples);
        console.log('[WallPerfBench] cleanup:', cleanup ? 'completed' : 'skipped — test elements remain');

        return summary;
    }
}

export const wallPerfBench = new WallPerfBench();

/** Register on window so it's runnable from the browser console. */
export function registerWallPerfBench(): void {
    window.__wallPerfBench = wallPerfBench;
    console.log('[WallPerfBench] Ready. Run: await window.__wallPerfBench.run()');
}
