// §PRYZM-PERF — the READING half: `window.pryzmPerf.report()`.
//
// THE FOUNDER'S WORKFLOW, WHICH IS THE WHOLE SPEC
// -----------------------------------------------
//   window.pryzmPerf.on()        ← BEFORE the gesture. Arms + zeroes.
//   …do the gesture (create walls by slab, bulk-create, orbit, whatever)…
//   window.pryzmPerf.report()    ← AFTER. Prints one table.
//   window.pryzmPerf.reset()     ← between gestures. Zeroes, STAYS armed.
//   window.pryzmPerf.off()       ← done. Counters are retained so a late
//                                  report() still works.
//
// WHY THIS FILE EXISTS
// --------------------
// A 367-element "create walls by slab" batch froze the viewport for 32.7 s at
// 2069 scene meshes and ended with the collaboration socket disconnected. The
// prior investigation ranked the suspects and could settle none of them, because
// the instruments did not exist. Most starkly: `RenderPerformanceService.getStats()`
// — draw calls, triangles, programs — had ZERO CALLERS REPO-WIDE. The capability
// to see our own draw calls has been sitting in the tree unread, which is how "we
// can see our draw calls" became believed rather than true (L-1149).
//
// This module is the reading half of §PRYZM-PERF. `PerfCounters` (L1,
// @pryzm/frame-scheduler) accumulates; this samples LIVE state at report time and
// joins the two into one compact, copy-pasteable table.
//
// ⭐ THE THREE RULES THIS FILE IS BUILT AROUND
// --------------------------------------------
// 1. "NOT ARMED" IS NOT "ZERO". The worst outcome for this instrument is not
//    being wrong — it is reading as evidence while unmeasured. If the founder
//    runs a gesture without arming, `traverse.perAdd.* = 0` is not a finding,
//    it is an absence of measurement, and printing it as `0` would manufacture a
//    false exoneration of the prime suspect. So the header hard-gates on
//    `armedForMs === null` and every accumulated section prints UNMEASURED.
//
// 2. EVERY LABEL IS DERIVED FROM LIVE STATE, NEVER ASSUMED. A sibling lane's log
//    line names "WebGPU PSO compile" in a session whose backend was NOT WebGPU.
//    A misattributing instrument is worse than none: it does not merely fail to
//    inform, it actively sends the next reader to the wrong subsystem. So the
//    backend row CROSS-CHECKS two independent sources (the renderer object's own
//    constructor/`isWebGPURenderer`, and `RenderPipelineManager.status.webGpuActive`)
//    and PRINTS THE DISAGREEMENT when they differ rather than picking a winner.
//
// 3. AN ABSENT SOURCE PRINTS "unavailable", NEVER A NUMBER. A zero that means
//    "the handle was undefined" is indistinguishable from a zero that means
//    "we measured, it was zero" — and the second is a finding while the first is
//    a bug in the instrument.
//
// P2 (single THREE owner): this file imports NO THREE. It reaches the scene through
// minimal structural types (`{ traverse(cb) }`), which is all a mesh census needs.
// P3: no rAF is created here — the report samples on demand, from the console.

import {
    armPerf,
    disarmPerf,
    resetPerfCounters,
    perfSnapshot,
    PERF_KEYS,
    type PerfSnapshot,
    type PerfTimer,
} from '@pryzm/frame-scheduler';
// §INSTANCE-WINDOWS-DEFAULT-ON (L-1180) — the report must ask the SAME resolver
// the builders ask. Re-deriving the flag precedence here would be a second
// implementation free to disagree with the one that decides what actually renders.
import { isElementInstancingEnabled } from '@pryzm/core-app-model/rendering';

// ── Structural views of live objects (no THREE import — P2) ─────────────────

/** The little of an Object3D a mesh census needs. */
interface TraversableLike {
    traverse(cb: (o: SceneNodeLike) => void): void;
}

interface SceneNodeLike {
    isMesh?: boolean;
    isInstancedMesh?: boolean;
    visible?: boolean;
    count?: number;
    userData?: { id?: string; elementType?: string; isInstancedGroup?: boolean };
}

/** `renderer.info`-shaped stats, as returned by RenderPerformanceService.getStats(). */
interface RenderStatsLike {
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
    pixelRatio: number;
    dprScale: number;
}

/** The `renderer.info` surface, read directly off `window.pryzmRenderer`. */
interface RendererInfoLike {
    info?: {
        render?: { calls?: number; triangles?: number };
        memory?: { geometries?: number; textures?: number };
        programs?: { length?: number };
    };
    getPixelRatio?: () => number;
}

/**
 * FALLBACK draw-call source: read `renderer.info` straight off `window.pryzmRenderer`.
 *
 * WHY A FALLBACK EXISTS AT ALL. The brief points at
 * `RenderPerformanceService.getStats()`, and that IS the right source — it is also
 * the reason this instrument was needed, because it has had ZERO CALLERS REPO-WIDE.
 * But that service is a local inside `initScene`'s composition root, so reading it
 * requires the composition root to inject it, and that wiring is in flight in a
 * sibling lane's uncommitted work (L-1149, §PERF-DPR-BINDS-THE-LIVE-RENDERER).
 *
 * Making the report DEPEND on that landing would mean shipping an instrument that
 * prints "unavailable" for its headline number until someone else's commit merges —
 * so it reads the renderer global instead, which `initScene:2096` publishes at init
 * and re-publishes on every backend swap (`:4496`, and `:4573` on swap rollback).
 * That global is therefore always the LIVE renderer, which is exactly the property
 * L-1149 was fixing the service to have.
 *
 * `getStats()` remains the preferred source and wins whenever injected — this only
 * fills the gap, and the report labels which one it used so the reading is never
 * ambiguous about its own provenance.
 */
function readRendererInfoDirect(): RenderStatsLike | null {
    const r = g<RendererInfoLike>('pryzmRenderer');
    const info = r?.info;
    if (!info) return null;
    const px = safe(() => r?.getPixelRatio?.() ?? null);
    return {
        drawCalls: info.render?.calls ?? 0,
        triangles: info.render?.triangles ?? 0,
        geometries: info.memory?.geometries ?? 0,
        textures: info.memory?.textures ?? 0,
        programs: info.programs?.length ?? 0,
        pixelRatio: px ?? 0,
        // Unknown from the raw renderer — the DPR *scale factor* is the service's
        // own state, not the renderer's. Reported as 1 with the source labelled
        // "renderer.info (direct)" so it is never read as a service-confirmed value.
        dprScale: 1,
    };
}

/**
 * Just enough of a THREE renderer to IDENTIFY it without importing THREE.
 *
 * ⚠ `isWebGPURenderer` is DELIBERATELY ABSENT from this interface. It is a KNOWN
 * FALSE POSITIVE — a `WebGPURenderer` constructed with `forceWebGL: true` reports
 * `isWebGPURenderer === true` while actually driving a WebGL2 backend, which
 * `RenderPipelineManager.isRealWebGPUBackend` (renderer-three, :516-550) exists
 * specifically to defeat by reading `renderer.backend.isWebGPUBackend` instead.
 * An instrument that identified the backend by the class name would print exactly
 * the misattribution this whole file is built to prevent. See `describeBackend`.
 */
interface RendererLike {
    constructor?: { name?: string };
}

/** The read-only surface of InstancedElementRenderer this report uses. */
interface InstancedRendererLike {
    totalInstances?: number;
    groupCount?: number;
    groupSummary?: { key: string; active: number; allocated: number }[];
}

/**
 * Sources injected by the composition root (initScene), rather than scraped off
 * `window`. Injection is preferred wherever the composition root already holds the
 * object: a global can be absent for reasons the report cannot distinguish (never
 * assigned / assigned later / cleared on swap), and each of those would print as
 * the same "unavailable".
 */
export interface PryzmPerfSources {
    /** RenderPerformanceService.getStats — the ONLY draw-call instrument we have. */
    getRenderStats?: () => RenderStatsLike | null;
    /** The LIVE renderer object, for backend cross-checking. */
    getRenderer?: () => RendererLike | null;
    /** The live scene root, for the mesh census. */
    getScene?: () => TraversableLike | null;
    /**
     * Current scene quality tier. INJECTED rather than read off a global because
     * `sceneQualityTierManager` is a module singleton that is on NO global — the
     * only console-reachable proxy today is scraping a throttled
     * `[SceneQualityTier] … tier=…` log line, which is not a readable instrument.
     */
    getQualityTier?: () => string | null;
    /**
     * Live collaboration socket status. INJECTED because `YjsDocAdapter` is a local
     * const in `engineLauncher` and reaches no global.
     *
     * ⚠ Do NOT substitute `window.runtime.sync.status` — that field is a FROZEN
     * literal `'disconnected'` set once by `composeRuntime.buildSyncSlot()` and never
     * updated by the client. It would report the founder's socket as dead in every
     * report, including the healthy ones, and manufacture the exact symptom under
     * investigation.
     */
    getSocketStatus?: () => string | null;
}

const _sources: PryzmPerfSources = {};

/** Called once from the composition root. Merges; a later call can add a source. */
export function setPryzmPerfSources(s: PryzmPerfSources): void {
    Object.assign(_sources, s);
}

// ── Safe readers ────────────────────────────────────────────────────────────

/**
 * Every live read goes through here. A source that throws or is missing yields
 * `null`, which the formatter renders as "unavailable" — never as 0.
 */
function safe<T>(fn: () => T | null | undefined): T | null {
    try {
        const v = fn();
        return v === undefined ? null : v;
    } catch {
        return null;
    }
}

function g<T>(name: string): T | null {
    return safe(() => (globalThis as unknown as Record<string, T | undefined>)[name]);
}

function flag(name: string): boolean {
    return (globalThis as unknown as Record<string, unknown>)[name] === true;
}

// ── Formatting ──────────────────────────────────────────────────────────────

const W = 34;
const LINE = '─'.repeat(72);

function row(label: string, value: string | number | null, note = ''): string {
    const v = value === null ? 'unavailable' : String(value);
    return `  ${label.padEnd(W)}${v}${note ? '   ' + note : ''}`;
}

function num(n: number | null | undefined): string | null {
    if (n === null || n === undefined || !Number.isFinite(n)) return null;
    return n.toLocaleString('en-US');
}

function ms(n: number | null | undefined): string | null {
    if (n === null || n === undefined || !Number.isFinite(n)) return null;
    return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n.toFixed(1)} ms`;
}

function timerRow(label: string, t: PerfTimer | undefined): string {
    if (!t) return row(label, '—', 'NO CALL SITE — nothing writes this key');
    return row(
        label,
        `${ms(t.totalMs)}`,
        `(n=${t.count}, max ${ms(t.maxMs)})`,
    );
}

/**
 * ⭐ §PERF-ZERO-IS-NOT-UNWRITTEN (L-1397) — A COUNTER ROW, HONEST ABOUT ITS OWN ABSENCE.
 *
 * `perfSnapshot().counters` contains a key ONLY if some call site bumped it. The rows
 * below were written as `num(c[KEY] ?? 0)`, which collapses the two cases this whole
 * module exists to keep apart:
 *
 *   • the counter was written, and the answer is 0  — a FINDING;
 *   • no code anywhere bumps that key                — an ABSENCE OF MEASUREMENT.
 *
 * That is not hypothetical here. `REDETECT_ROOMS`, `REDETECT_ROOMS_AFTER_THROW`,
 * `REDETECT_ROOMS_MS`, `PHASE_GEOMETRY_BUILD`, `PHASE_DRAIN`, `PHASE_SHADOW_REACTIVATE`,
 * `PHASE_EVENT_FLUSH`, `PHASE_SHADER_COMPILE`, `PHASE_BOUNDS_FIT`, `TRAVERSE_FIT_BOUNDS`,
 * `TRAVERSE_BOUNDS_CACHE`, `AUTOSAVE_*`, `CRDT_BLACKOUT_MS` and `SOCKET_*` are ALL read
 * here and bumped NOWHERE in the repo. Under an `armed` header this printed
 * "room re-detection passes  0" — a false exoneration of a named prime suspect, which is
 * exactly the misattribution the header of `PerfCounters.ts` forbids in rule 1. The
 * instrument built to stop that failure was committing it.
 *
 * `undefined` now prints `—` and says why. A real measured zero still prints `0`.
 */
function counterRow(label: string, c: Record<string, number>, key: string, note = ''): string {
    const v = c[key];
    if (v === undefined) return row(label, '—', 'NO CALL SITE — nothing writes this key');
    return row(label, num(v), note);
}

// ── Live-state sampling ─────────────────────────────────────────────────────

interface SceneCensus {
    meshes: number;
    visibleMeshes: number;
    instancedMeshes: number;
    instancedGroupMeshes: number;
    elements: number;
    elementsByType: Record<string, number>;
}

/**
 * ONE traverse, at report time only, on an explicit console command. This is the
 * only traverse this instrument performs — an instrument that walks the scene on a
 * timer would join the population it is measuring.
 */
function censusScene(scene: TraversableLike): SceneCensus {
    const c: SceneCensus = {
        meshes: 0,
        visibleMeshes: 0,
        instancedMeshes: 0,
        instancedGroupMeshes: 0,
        elements: 0,
        elementsByType: {},
    };
    scene.traverse((o) => {
        if (o.isInstancedMesh) {
            c.instancedMeshes++;
            if (o.userData?.isInstancedGroup) c.instancedGroupMeshes++;
        }
        if (o.isMesh) {
            c.meshes++;
            if (o.visible !== false) c.visibleMeshes++;
        }
        const t = o.userData?.elementType;
        if (o.userData?.id && t) {
            c.elements++;
            c.elementsByType[t] = (c.elementsByType[t] ?? 0) + 1;
        }
    });
    return c;
}

/**
 * ⭐ RULE 2 IN CODE — the backend row, derived from TWO authoritative live sources
 * and reconciled, with the disagreement printed rather than resolved.
 *
 * WHY THIS ROW IS THE MOST CAREFULLY WRITTEN LINE IN THE FILE. There is a live log
 * line in this product — `UnifiedFrameLoop.ts:510` — that prints "(WebGPU PSO
 * compile LONGTASK begins here)". The word WebGPU there is a HARDCODED STRING
 * LITERAL: that block reads no backend state at all, so it says WebGPU on a WebGL2
 * session, every time. That is not a stale comment, it is an instrument actively
 * naming the wrong subsystem, and it is the reason this report refuses to name a
 * backend it has not read.
 *
 * THE TWO SOURCES, and why neither is the renderer's class name:
 *
 *   1. `window.pryzmRendererBackend` — the RESOLVED THREE-WAY string
 *      ('webgpu' | 'webgl-fallback' | 'webgl-only'), written at the moment the
 *      backend is chosen (`apps/editor/src/rendering/createRenderer.ts:654`). This
 *      is the most informative source, because it separates native WebGPU from the
 *      WebGL2 backend of a force-WebGL WebGPURenderer from a classic WebGLRenderer.
 *   2. `renderPipelineManager.status.webGpuActive` — a boolean derived from
 *      `RenderPipelineManager.isRealWebGPUBackend`, which reads
 *      `renderer.backend.isWebGPUBackend`. It COLLAPSES the middle case into false.
 *
 * `renderer.isWebGPURenderer` is deliberately NOT consulted: a `forceWebGL: true`
 * WebGPURenderer reports true while driving WebGL2. The renderer's constructor name
 * is printed as CONTEXT only, never as the verdict.
 *
 * A disagreement between (1) and (2) is itself a finding — a live backend swap that
 * half-landed — so it is printed, not silently resolved.
 */
function describeBackend(): string {
    const resolved = g<string>('pryzmRendererBackend');
    const rpm = g<{ status?: { webGpuActive?: boolean } }>('renderPipelineManager');
    const rpmSaysWebGpu = safe(() => rpm?.status?.webGpuActive ?? null);
    const ctor = safe(() => _sources.getRenderer?.()?.constructor?.name ?? null);
    const ctorNote = ctor ? ` [class: ${ctor} — context only, NOT the verdict]` : '';

    if (resolved === null && rpmSaysWebGpu === null) {
        return 'unavailable (neither window.pryzmRendererBackend nor renderPipelineManager)';
    }
    if (resolved === null) {
        return `${rpmSaysWebGpu ? 'WebGPU' : 'WebGL2'}  [RPM only — pryzmRendererBackend unset, UNCORROBORATED]${ctorNote}`;
    }
    if (rpmSaysWebGpu === null) {
        return `${resolved}  [createRenderer only — renderPipelineManager unavailable]${ctorNote}`;
    }

    // 'webgpu' is the ONLY resolved value that should pair with webGpuActive=true.
    const expectWebGpu = resolved === 'webgpu';
    if (expectWebGpu !== rpmSaysWebGpu) {
        return (
            `⚠ SOURCES DISAGREE — createRenderer resolved "${resolved}" but ` +
            `RenderPipelineManager.status.webGpuActive=${rpmSaysWebGpu}. ` +
            `A half-landed backend swap looks exactly like this. Do not trust any ` +
            `backend-named timing below until this is reconciled.${ctorNote}`
        );
    }
    return `${resolved}  (corroborated: webGpuActive=${rpmSaysWebGpu})${ctorNote}`;
}

// ── The report ──────────────────────────────────────────────────────────────

/** Everything the report printed, returned so it can be inspected/serialised. */
export interface PryzmPerfReport {
    armed: boolean;
    armedForMs: number | null;
    backend: string;
    qualityTier: string | null;
    socketStatus: string | null;
    /** Where the render numbers came from — never leave provenance implicit. */
    renderSource: 'RenderPerformanceService.getStats()' | 'renderer.info (direct)' | 'unavailable';
    /** Registered BIM elements, summed over levels — the STORE's count, not the scene's. */
    registeredElements: number | null;
    render: RenderStatsLike | null;
    scene: SceneCensus | null;
    instancing: {
        groupCount: number | null;
        totalInstances: number | null;
        collapseRatio: number | null;
        groups: { key: string; active: number; allocated: number }[] | null;
        elementInstancingV1: boolean;
        furnitureInstancingV1: boolean;
        /**
         * §INSTANCE-WINDOWS-DEFAULT-ON (L-1180) — the RESOLVED per-family verdict,
         * which is no longer readable from the master flag alone. Windows ship ON
         * by default, so `__pryzmElementInstancingV1 === undefined` now means
         * "windows instance, the other four do not" — not "nothing instances".
         */
        families: Record<string, boolean>;
    };
    snapshot: PerfSnapshot;
}

function buildReport(): PryzmPerfReport {
    const snap = perfSnapshot();
    // Scene: injected if the composition root offered one, else the published
    // `window.world.scene.three` (initUI.ts:2594 / initTools.ts:2580).
    const scene =
        safe(() => _sources.getScene?.() ?? null) ??
        safe(() => g<{ scene?: { three?: TraversableLike } }>('world')?.scene?.three ?? null);
    const ier = g<InstancedRendererLike>('__instancedElementRenderer');

    // Preferred source first, fallback second, provenance recorded either way.
    const injected = safe(() => _sources.getRenderStats?.() ?? null);
    const render = injected ?? readRendererInfoDirect();
    const renderSource: PryzmPerfReport['renderSource'] =
        injected !== null
            ? 'RenderPerformanceService.getStats()'
            : render !== null
                ? 'renderer.info (direct)'
                : 'unavailable';

    const groupCount = safe(() => ier?.groupCount ?? null);
    const totalInstances = safe(() => ier?.totalInstances ?? null);

    return {
        armed: snap.armedForMs !== null,
        armedForMs: snap.armedForMs,
        backend: describeBackend(),
        qualityTier: safe(() => _sources.getQualityTier?.() ?? null),
        socketStatus: safe(() => _sources.getSocketStatus?.() ?? null),
        renderSource,
        // `bimManager.getLevels()` summed over `childrenIds` is the REGISTERED count.
        // Deliberately not `runtime.elementStore.size()` — that is an LRU-resident
        // count that under-reports evicted elements, so it would silently shrink on
        // exactly the large projects this report exists to explain.
        registeredElements: safe(() => {
            const bim = g<{ getLevels?: () => { childrenIds?: string[] }[] }>('bimManager');
            const levels = bim?.getLevels?.();
            if (!levels) return null;
            return levels.reduce((n, l) => n + (l.childrenIds?.length ?? 0), 0);
        }),
        render,
        scene: scene ? censusScene(scene) : null,
        instancing: {
            groupCount,
            totalInstances,
            collapseRatio:
                groupCount !== null && totalInstances !== null && groupCount > 0
                    ? totalInstances / groupCount
                    : null,
            groups: safe(() => ier?.groupSummary ?? null),
            elementInstancingV1: flag('__pryzmElementInstancingV1'),
            furnitureInstancingV1: flag('__pryzmFurnitureInstancingV1'),
            // Ask the SAME resolver the builders ask, rather than re-deriving the
            // precedence rules here. A report that computes its own answer is a
            // second implementation that can disagree with the one that matters —
            // and this report exists precisely to stop a founder concluding
            // "instancing is broken" when the truth is a switch.
            families: safe(() => {
                const fams = ['window', 'column', 'beam', 'handrail', 'stairRailing'] as const;
                const out: Record<string, boolean> = {};
                for (const f of fams) out[f] = isElementInstancingEnabled(f);
                return out;
            }) ?? {},
        },
        snapshot: snap,
    };
}

/* eslint-disable no-console */
function printReport(r: PryzmPerfReport): void {
    const c = r.snapshot.counters;
    const t = r.snapshot.timers;
    const n = r.snapshot.notes;
    const out: string[] = [];
    const p = (s: string): void => { out.push(s); };

    p('');
    p('╔' + '═'.repeat(70) + '╗');
    p('   PRYZM PERF REPORT   §PRYZM-PERF');
    p('╚' + '═'.repeat(70) + '╝');

    // ── Header: the honesty gate ────────────────────────────────────────────
    if (!r.armed) {
        p('  ⚠⚠  NOT ARMED — every ACCUMULATED row below is UNMEASURED, NOT ZERO.');
        p('       A zero here would be a false exoneration, not a finding.');
        p('       Do:  pryzmPerf.on()  →  redo the gesture  →  pryzmPerf.report()');
    } else {
        p(
            `  accumulation window: ${ms(r.armedForMs)}` +
            `   |   currently ${r.snapshot.on ? 'ON' : 'OFF (counters retained)'}`,
        );
    }
    p(LINE);

    // ── LIVE STATE (valid with or without arming) ───────────────────────────
    p('  LIVE STATE  — sampled now; valid whether or not you armed');
    p(row('backend', r.backend));
    p(row('scene quality tier', r.qualityTier));
    p(row('collab socket', r.socketStatus,
        r.socketStatus === 'disconnected' ? '🔴 socket is DOWN right now' : ''));
    p(row('registered BIM elements', num(r.registeredElements)));
    if (r.render) {
        p(row('draw calls', num(r.render.drawCalls), '← LAST RENDERED FRAME'));
        p(row('triangles', num(r.render.triangles)));
        p(row('shader programs', num(r.render.programs)));
        p(row('geometries (GPU)', num(r.render.geometries)));
        p(row('textures (GPU)', num(r.render.textures)));
        p(row('device pixel ratio', r.render.pixelRatio.toFixed(2)));
        p(row('  ↑ render source', r.renderSource));
    } else {
        p(row('draw calls / triangles', null,
            '← no window.pryzmRenderer and no injected getStats()'));
    }
    if (r.scene) {
        p(row('scene meshes', num(r.scene.meshes),
            `(${num(r.scene.visibleMeshes)} visible)`));
        p(row('scene InstancedMeshes', num(r.scene.instancedMeshes),
            `(${num(r.scene.instancedGroupMeshes)} are instance groups)`));
        p(row('elements in scene', num(r.scene.elements)));
        const byType = Object.entries(r.scene.elementsByType)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([k, v]) => `${k}=${v}`)
            .join('  ');
        if (byType) p(row('  by type (top 8)', byType));
    } else {
        p(row('scene meshes', null, '← no scene handle injected'));
    }
    p(LINE);

    // ── ⭐ INSTANCING COLLAPSE ──────────────────────────────────────────────
    p('  ⭐ INSTANCING COLLAPSE  — the single most decisive number');
    const i = r.instancing;
    p(row('instance groups', num(i.groupCount)));
    p(row('total instances', num(i.totalInstances)));
    if (i.collapseRatio !== null) {
        const verdict =
            i.collapseRatio >= 20 ? '✅ EXCELLENT — instancing is doing its job'
            : i.collapseRatio >= 4 ? '🟡 PARTIAL — real, but groups are fragmenting'
            : '🔴 COLLAPSED NOTHING — ~1 group per element, zero draw-call saving';
        p(row('collapse ratio', `${i.collapseRatio.toFixed(2)}x`, verdict));
    } else if (i.totalInstances === 0) {
        p(row('collapse ratio', 'n/a', '— NOTHING is instanced at all (see flags below)'));
    } else {
        p(row('collapse ratio', null, '← window.__instancedElementRenderer unavailable'));
    }

    // ⭐ The flags that silently decide whether a family can instance AT ALL.
    // Both default to OFF. Without this row, a founder testing columns/beams/
    // windows/handrails/furniture would read "0 instances" as an instancing BUG
    // when it is a switch that was never thrown — a wrong conclusion the report
    // would have caused rather than prevented.
    // §INSTANCE-WINDOWS-DEFAULT-ON (L-1180) — print the RESOLVED per-family
    // verdict, not the master flag's raw value. Before this, an unset master flag
    // printed "column/beam/window/… CANNOT instance", which is now FALSE for
    // windows and would have told the founder his flip had not shipped.
    const fam = i.families ?? {};
    const famNames = Object.keys(fam);
    if (famNames.length > 0) {
        p('       per-family instancing (resolved, incl. defaults + overrides):');
        for (const name of famNames) {
            p(row(`  ${name}`,
                fam[name] ? 'ON' : 'OFF',
                fam[name] && name === 'window' ? '← ~12 meshes/window collapse to 1' : ''));
        }
    }
    p(row('__pryzmElementInstancingV1',
        i.elementInstancingV1 ? 'ON (all families)' : 'unset / off',
        '← master override; = false is the KILL SWITCH for every family'));
    p(row('__pryzmFurnitureInstancingV1',
        i.furnitureInstancingV1 ? 'ON' : 'OFF  ⚠ DEFAULT',
        i.furnitureInstancingV1 ? '' : '← furniture CANNOT instance'));
    p('       (walls have NO flag gate — they instance whenever the bridge is wired)');
    p('       per-family override:  __pryzmElementInstancing = { window: false }');

    if (i.groups && i.groups.length > 0) {
        // The key is levelId_idxCt_vtxCt_x0_y0_z0_materialUuid — reading the top
        // keys says whether groups split by LEVEL, by VERTEX COUNT, or by MATERIAL
        // UUID. Three different bugs, and the ratio alone conflates all three.
        p('       top groups (key = level_idxCt_vtxCt_x0_y0_z0_materialUuid):');
        for (const grp of i.groups.slice(0, 6)) {
            p(`         ${String(grp.active).padStart(5)} active / ${String(grp.allocated).padStart(5)} slots   ${grp.key}`);
        }
        const singletons = i.groups.filter((x) => x.active === 1).length;
        if (singletons > 0) {
            p(row('  groups holding exactly 1',
                num(singletons),
                singletons > i.groups.length * 0.5
                    ? '🔴 the geometry hash is NOT colliding (per-element unique material?)'
                    : ''));
        }
    }
    p(LINE);

    // ── ⭐ WHY A WALL WAS NOT INSTANCED ─────────────────────────────────────
    p('  ⭐ WHY A WALL LEFT THE INSTANCED ARM   (per FAILING CLAUSE, not per wall)');
    if (!r.armed) {
        p('       UNMEASURED — not armed. These are not zeros.');
    } else {
        const inst = c[PERF_KEYS.WALL_INSTANCED] ?? 0;
        const notInst = c[PERF_KEYS.WALL_NOT_INSTANCED] ?? 0;
        p(row('walls built (instanced arm)', num(inst)));
        p(row('walls built (standard mesh)', num(notInst)));
        if (inst + notInst === 0) {
            p('       no walls were built inside the window — was the gesture a wall gesture?');
        }
        const clauses: [string, string][] = [
            ['no instance bridge wired', PERF_KEYS.WALL_REJECT_NO_BRIDGE],
            ['has openings', PERF_KEYS.WALL_REJECT_OPENINGS],
            ['curved', PERF_KEYS.WALL_REJECT_CURVE],
            ['MITRED JOIN (start)', PERF_KEYS.WALL_REJECT_MITRE_START],
            ['MITRED JOIN (end)', PERF_KEYS.WALL_REJECT_MITRE_END],
            ['raked (non-vertical)', PERF_KEYS.WALL_REJECT_RAKE],
            ['multi-layer (>1)', PERF_KEYS.WALL_REJECT_LAYERS],
            ['has wall profile', PERF_KEYS.WALL_REJECT_PROFILE],
        ];
        for (const [label, key] of clauses) {
            const v = c[key] ?? 0;
            if (v === 0) continue;
            const share = notInst > 0 ? `${((v / notInst) * 100).toFixed(0)}% of rejects` : '';
            p(row('  ✗ ' + label, num(v), share));
        }
        if (notInst > 0) {
            p('       Read each clause against "standard mesh", NEVER against each other —');
            p('       a wall failing two clauses is counted in both. When ONE clause ~equals');
            p('       the reject total, that clause IS the answer.');
        }
    }
    p(LINE);

    // ── TRAVERSALS ──────────────────────────────────────────────────────────
    p('  FULL-SCENE TRAVERSALS  — attributed by call site');
    if (!r.armed) {
        p('       UNMEASURED — not armed. These are not zeros.');
    } else {
        // ⭐ The one boolean that decides whether the gesture paid 2 traversals or 734.
        const inBatch = n[PERF_KEYS.NOTE_IN_BATCH];
        p(row('⭐ gesture ran INSIDE a batch',
            inBatch === undefined ? 'not recorded' : String(inBatch),
            inBatch === false
                ? '🔴 UNBATCHED — the per-add gate did NOT engage; every add re-walked the scene'
                : inBatch === true
                    ? '✅ batched — the per-add tier/PBR pass was deferred'
                    : ''));
        p(row('project load active', String(n[PERF_KEYS.NOTE_PROJECT_LOAD_ACTIVE] ?? 'not recorded')));
        // Keys that represent a walk that ACTUALLY HAPPENED. The deferred counter is
        // deliberately NOT in this list: "deferred" means the traversal was SKIPPED,
        // so summing it into the total would report avoided work as work done — the
        // gate would look most expensive exactly when it was doing its job, and a
        // successful batch would print the same total as a failed one.
        const traverseKeys: [string, string][] = [
            ['per-add: PBR mesh collect', PERF_KEYS.TRAVERSE_PER_ADD_PBR],
            ['per-add: tier mesh count', PERF_KEYS.TRAVERSE_PER_ADD_TIER],
            ['PBRSceneUpgrader', PERF_KEYS.TRAVERSE_PBR_UPGRADER],
            ['PascalSceneLighting', PERF_KEYS.TRAVERSE_SCENE_LIGHTING],
            ['bimFitBounds', PERF_KEYS.TRAVERSE_FIT_BOUNDS],
            ['SceneBoundsCache rebuild', PERF_KEYS.TRAVERSE_BOUNDS_CACHE],
            ['FrustumCullingService audit', PERF_KEYS.TRAVERSE_FRUSTUM_CULL],
            ['RealEnvironmentService', PERF_KEYS.TRAVERSE_REAL_ENV],
        ];
        let total = 0;
        for (const [label, key] of traverseKeys) {
            const v = c[key] ?? 0;
            if (v === 0) continue;
            total += v;
            p(row('  ' + label, num(v)));
        }
        p(row('  TOTAL traversals (ACTUAL)', num(total),
            r.scene && total > 0
                ? `≈ ${num(total * r.scene.meshes)} node visits at current scene size`
                : ''));
        // Printed BELOW the total, as avoided work — the gate's receipt.
        const deferred = c[PERF_KEYS.TRAVERSE_PER_ADD_DEFERRED] ?? 0;
        p(row('  per-add passes DEFERRED', num(deferred),
            deferred > 0
                ? '✅ avoided work — the gate engaged (NOT counted in the total above)'
                : '⚠ the gate never deferred anything in this window'));
    }
    p(LINE);

    // ── MULTI-LEVEL ORCHESTRATION ───────────────────────────────────────────
    // §FURNISH-PERF (L-1398). The founder's "Furnish all rooms (AI) → all floors"
    // gesture had NO row on this table at all: the level switch, the view activation it
    // fans out into, the plan re-projection and the room-tag pass were all uncounted, so
    // "super slow" could not be answered with a number. Read TOP-DOWN — everything below
    // the first row is a MULTIPLE of it.
    p('  MULTI-LEVEL ORCHESTRATION  — the cascade a level switch buys');
    if (!r.armed) {
        p('       UNMEASURED — not armed. These are not zeros.');
    } else {
        const sw = c[PERF_KEYS.LEVEL_SWITCH];
        p(counterRow('⭐ activeLevelId switches', c, PERF_KEYS.LEVEL_SWITCH,
            (sw ?? 0) > 1
                ? '⚠ each one drives a plan re-activation + full-scene visibility gates'
                : ''));
        p(counterRow('  view activations', c, PERF_KEYS.VIEW_ACTIVATED));
        p(counterRow('  view-gate full traversals', c, PERF_KEYS.TRAVERSE_VIEW_GATES,
            r.scene ? `≈ ${num((c[PERF_KEYS.TRAVERSE_VIEW_GATES] ?? 0) * r.scene.meshes)} node visits` : ''));
        const full = c[PERF_KEYS.REPROJECT_FULL] ?? 0;
        const graft = c[PERF_KEYS.REPROJECT_GRAFT] ?? 0;
        p(counterRow('  plan re-projections: FULL O(N)', c, PERF_KEYS.REPROJECT_FULL,
            full > 0 && graft === 0
                ? '🔴 the O(dirty) graft arm was NEVER taken — see §DIAG-GRAFT-FALLTHROUGH'
                : ''));
        p(counterRow('  plan re-projections: graft O(dirty)', c, PERF_KEYS.REPROJECT_GRAFT));
        p(timerRow('  time in re-projection', t[PERF_KEYS.REPROJECT_MS]));
        p(counterRow('  room-tag populate passes', c, PERF_KEYS.ROOMTAG_POPULATE,
            '(a level switch can drive TWO — activation + re-projection)'));
        p(timerRow('  time in room-tag populate', t[PERF_KEYS.ROOMTAG_POPULATE_MS]));
        p(counterRow('furnish runs (per storey)', c, PERF_KEYS.FURNISH_LEVEL_RUNS));
        p(timerRow('  time in furnish', t[PERF_KEYS.FURNISH_LEVEL_MS]));
        p('       Compare "time in furnish" against the whole armed window: the gap is');
        p('       what the editor cascade cost, NOT what the layout engine cost.');
    }
    p(LINE);

    // ── PHASES ──────────────────────────────────────────────────────────────
    p('  BATCH PHASE TIMING');
    if (!r.armed) {
        p('       UNMEASURED — not armed. These are not zeros.');
    } else {
        p(timerRow('geometry build', t[PERF_KEYS.PHASE_GEOMETRY_BUILD]));
        p(timerRow('registration drain', t[PERF_KEYS.PHASE_DRAIN]));
        p(timerRow('PBR upgrade', t[PERF_KEYS.PHASE_PBR_UPGRADE]));
        p(timerRow('shadow reactivation', t[PERF_KEYS.PHASE_SHADOW_REACTIVATE]));
        p(timerRow('event flush', t[PERF_KEYS.PHASE_EVENT_FLUSH]));
        p(timerRow('shader/PSO compile', t[PERF_KEYS.PHASE_SHADER_COMPILE]));
        p(timerRow('bounds / fit', t[PERF_KEYS.PHASE_BOUNDS_FIT]));
    }
    p(LINE);

    // ── PERSISTENCE / COLLABORATION ─────────────────────────────────────────
    p('  PERSISTENCE & COLLABORATION');
    if (!r.armed) {
        p('       UNMEASURED — not armed. These are not zeros.');
    } else {
        p(timerRow('autosave (total)', t[PERF_KEYS.AUTOSAVE_MS]));
        p(timerRow('  serialise', t[PERF_KEYS.AUTOSAVE_SERIALISE_MS]));
        p(timerRow('  compress', t[PERF_KEYS.AUTOSAVE_COMPRESS_MS]));
        p(counterRow('autosave runs', c, PERF_KEYS.AUTOSAVE_RUN));
        p(timerRow('CRDT blackout', t[PERF_KEYS.CRDT_BLACKOUT_MS]));
        p(counterRow('socket disconnects', c, PERF_KEYS.SOCKET_DISCONNECT,
            (c[PERF_KEYS.SOCKET_DISCONNECT] ?? 0) > 0 ? '🔴 the socket DIED during this window' : ''));
        p(counterRow('socket reconnects', c, PERF_KEYS.SOCKET_RECONNECT));
    }
    // The blackout is ALSO already logged, independently, by BatchCoordinator — and
    // pointing at an instrument that already exists is worth more than duplicating
    // it. Console filters, so the founder can find them without knowing the code:
    p('       already-logged, filter for these:  §E1-CRDT-BLACKOUT  ·  §TRACE  ·  [SceneQualityTier]');
    p(LINE);

    // ── WASTE ───────────────────────────────────────────────────────────────
    p('  SUSPECTED WASTE PATHS');
    if (!r.armed) {
        p('       UNMEASURED — not armed. These are not zeros.');
    } else {
        const rdThrow = c[PERF_KEYS.REDETECT_ROOMS_AFTER_THROW];
        p(counterRow('room re-detection passes', c, PERF_KEYS.REDETECT_ROOMS));
        p(counterRow('  …after a command that THREW', c, PERF_KEYS.REDETECT_ROOMS_AFTER_THROW,
            (rdThrow ?? 0) > 0 ? '🔴 pure waste — the command failed, the rooms did not change' : ''));
        p(timerRow('  time in re-detection', t[PERF_KEYS.REDETECT_ROOMS_MS]));
        const heal = c[PERF_KEYS.SELECT_SELFHEAL];
        p(counterRow('§SELECT-STUCK-STATE self-heals', c, PERF_KEYS.SELECT_SELFHEAL,
            (heal ?? 0) > 0 ? '⚠ a self-heal that runs often is a bug wearing a bandage' : ''));
        // Counted at ENTRY, so blocked is derived and always reconciles.
        const cpCalls = c[PERF_KEYS.OCCUPANCY_CANPLACE_CALLS];
        const cpOk = c[PERF_KEYS.OCCUPANCY_CANPLACE_OK] ?? 0;
        p(counterRow('WallOccupancy canPlace calls', c, PERF_KEYS.OCCUPANCY_CANPLACE_CALLS,
            '← was a console.log on EVERY pointermove; now a counter'));
        p(cpCalls === undefined
            ? row('  …permitted / refused', '—', 'NO CALL SITE')
            : row('  …permitted / refused', `${num(cpOk)} / ${num(cpCalls - cpOk)}`));
    }
    p(LINE);

    // ── Any counters/timers nobody has a named row for ──────────────────────
    if (r.armed) {
        const named = new Set<string>(Object.values(PERF_KEYS));
        const extraC = Object.entries(c).filter(([k]) => !named.has(k));
        const extraT = Object.entries(t).filter(([k]) => !named.has(k));
        if (extraC.length || extraT.length) {
            p('  UNCLASSIFIED (counters with no named row — added since this reporter):');
            for (const [k, v] of extraC) p(row('  ' + k, num(v)));
            for (const [k, v] of extraT) p(timerRow('  ' + k, v));
            p(LINE);
        }
    }

    p('  pryzmPerf.on() = arm+zero · reset() = zero, stay armed · off() = stop');
    p('  Full object: window.pryzmPerf.data()   ·   Frame costs: __pryzmFrameProfile = true');
    p('');

    console.log(out.join('\n'));
}

// ── Public console API ──────────────────────────────────────────────────────

export interface PryzmPerfApi {
    /** Arm accumulation AND zero the counters. Run this BEFORE the gesture. */
    on(): void;
    /** Stop accumulating. Counters are RETAINED so a later report() still works. */
    off(): void;
    /** Zero the counters, staying armed. Run this BETWEEN gestures. */
    reset(): void;
    /** Print the table. Run this AFTER the gesture. */
    report(): PryzmPerfReport;
    /** The same data as a plain object, for inspection or copy-paste. */
    data(): PryzmPerfReport;
}

/**
 * Install `window.pryzmPerf`. Idempotent — safe to call from a re-init path.
 *
 * NOT dev-gated, deliberately: the founder's method is to test in PRODUCTION on
 * real hardware with real gestures (localhost dev starves the Node event loop and
 * is unusable for this), so an instrument that only exists in dev could never see
 * the freeze it was built to explain. The cost of it existing is one object on
 * `window`; the cost of it RUNNING is zero until `on()`.
 */
export function installPryzmPerfConsole(): void {
    const api: PryzmPerfApi = {
        on(): void {
            armPerf();
            resetPerfCounters();
            console.log(
                '[§PRYZM-PERF] ARMED and zeroed. Do the gesture, then: pryzmPerf.report()',
            );
        },
        off(): void {
            disarmPerf();
            console.log('[§PRYZM-PERF] disarmed. Counters retained — report() still works.');
        },
        reset(): void {
            resetPerfCounters();
            console.log('[§PRYZM-PERF] counters zeroed. Still armed. Next gesture is a clean window.');
        },
        report(): PryzmPerfReport {
            const r = buildReport();
            printReport(r);
            return r;
        },
        data(): PryzmPerfReport {
            return buildReport();
        },
    };

    (globalThis as unknown as { pryzmPerf?: PryzmPerfApi }).pryzmPerf = api;
    console.log(
        '[§PRYZM-PERF] ready — window.pryzmPerf.on() → gesture → window.pryzmPerf.report()',
    );
}
/* eslint-enable no-console */
