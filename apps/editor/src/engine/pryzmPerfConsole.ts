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
// §NAV-THE-EVIDENCE-NOBODY-CAN-REACH (L-5910) — the surviving refusal counts for
// §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS. A named function import, not `* as THREE`
// (P2 holds); `surfaceArea.ts` is structurally typed and pulls no renderer with it.
import { getZeroAreaSurfaceReport } from '@pryzm/renderer-three';

// ── Structural views of live objects (no THREE import — P2) ─────────────────

/** The little of an Object3D a mesh census needs. */
interface TraversableLike {
    traverse(cb: (o: SceneNodeLike) => void): void;
}

interface SceneNodeLike {
    isMesh?: boolean;
    isInstancedMesh?: boolean;
    /** §NAV-FAMILY-CENSUS — line objects (edge overlays) draw too, and are not meshes. */
    isLine?: boolean;
    isLineSegments?: boolean;
    visible?: boolean;
    count?: number;
    castShadow?: boolean;
    userData?: {
        id?: string;
        elementType?: string;
        isInstancedGroup?: boolean;
        role?: string;
    };
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
    /** §INSTANCE-GROUP-SPILL (L-1400) — one row per REAL group identity, not per shard. */
    spillSummary?: { baseKey: string; shards: number; instances: number; capacity: number }[];
    /** §INSTANCE-GROUP-SPILL (L-1400) — instances the renderer failed to place. Must be 0. */
    droppedInstanceCount?: number;
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

/**
 * §NAV-FAMILY-CENSUS (L-1780) — one family's contribution to the frame.
 *
 * ⭐ THIS IS THE ROW THE PRIOR REPORT COULD NOT PRINT, and its absence is why
 * "are railings instanced?" had to be answered by reading code. `elementsByType`
 * counts objects carrying `userData.id` + `elementType`, which for a family that
 * stamps EVERY child mesh (stair-railing does) is a mesh count wearing an element
 * label, and for a family that stamps only its root is an element count. One
 * column, two meanings, no way to tell them apart — so both are broken out here.
 */
interface FamilyRow {
    /** Distinct `userData.id` values seen — real ELEMENTS. */
    elements: number;
    /** Plain meshes attributed to this family — ONE DRAW CALL EACH. */
    standaloneMeshes: number;
    /** InstancedMesh aggregates stamped with this family — one draw call each. */
    instancedGroups: number;
    /** Instances packed into those aggregates — these cost NO extra draw call. */
    instances: number;
    /** Meshes flagged `castShadow` — a shadow pass RE-SUBMITS every one of them. */
    shadowCasters: number;
    /** Line / LineSegments objects (edge overlays) — decoration that still draws. */
    lines: number;
}

interface SceneCensus {
    meshes: number;
    visibleMeshes: number;
    instancedMeshes: number;
    instancedGroupMeshes: number;
    elements: number;
    elementsByType: Record<string, number>;
    /** §NAV-FAMILY-CENSUS — family → what it costs the renderer. */
    families: Record<string, FamilyRow>;
    /** Every Line/LineSegments in the scene, visible or not. */
    lineObjects: number;
    visibleLineObjects: number;
    /** Meshes with castShadow — the shadow pass re-draws these. */
    shadowCasters: number;
    /**
     * ⭐ THE HEADLINE, computed the way a forward pass counts:
     * visible standalone meshes + visible instance groups + visible line objects.
     * EXCLUDES the shadow pass and frustum culling — compare it against the
     * renderer's own `drawCalls` row and the GAP is the shadow/post/multi-pass cost.
     */
    estimatedForwardDrawCalls: number;
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
        families: {},
        lineObjects: 0,
        visibleLineObjects: 0,
        shadowCasters: 0,
        estimatedForwardDrawCalls: 0,
    };
    const idsByFamily: Record<string, Set<string>> = {};
    const famRow = (name: string): FamilyRow => (c.families[name] ??= {
        elements: 0, standaloneMeshes: 0, instancedGroups: 0,
        instances: 0, shadowCasters: 0, lines: 0,
    });

    scene.traverse((o) => {
        const type = o.userData?.elementType;
        // §NAV-FAMILY-CENSUS — an unlabelled object is NOT silently folded into a
        // family. "(unattributed)" is a finding in its own right: it is geometry
        // nobody can hide, isolate or select by type.
        const fam = type ?? '(unattributed)';

        if (o.isLine || o.isLineSegments) {
            c.lineObjects++;
            if (o.visible !== false) {
                c.visibleLineObjects++;
                c.estimatedForwardDrawCalls++;
            }
            famRow(fam).lines++;
            return;
        }
        if (!o.isMesh) return;

        c.meshes++;
        const visible = o.visible !== false;
        if (visible) c.visibleMeshes++;
        if (o.castShadow === true) {
            c.shadowCasters++;
            famRow(fam).shadowCasters++;
        }

        if (o.isInstancedMesh) {
            c.instancedMeshes++;
            if (o.userData?.isInstancedGroup) c.instancedGroupMeshes++;
            const row = famRow(fam);
            row.instancedGroups++;
            row.instances += o.count ?? 0;
            if (visible) c.estimatedForwardDrawCalls++;
        } else {
            famRow(fam).standaloneMeshes++;
            if (visible) c.estimatedForwardDrawCalls++;
        }

        const id = o.userData?.id;
        if (id && type) {
            c.elementsByType[type] = (c.elementsByType[type] ?? 0) + 1;
            (idsByFamily[type] ??= new Set<string>()).add(id);
        }
    });

    // DISTINCT ids, so a family that stamps every child mesh (stair-railing does)
    // reports its real element count and not its mesh count under an element label.
    for (const [name, ids] of Object.entries(idsByFamily)) famRow(name).elements = ids.size;
    c.elements = Object.values(idsByFamily).reduce((n, set) => n + set.size, 0);
    return c;
}

/**
 * §NAV-MESH-PER-ELEMENT-CENSUS (L-3312) — print the per-family census, ONCE, on the
 * console the founder already reads.
 *
 * ⚠ THE INSTRUMENT WAS NOT MISSING. The performance ledger §9.5 ranked *"no
 * per-family mesh census exists"* as the #1 open item for the 10–20x target. That was
 * WRONG: `censusScene()` above computes exactly that — elements, standalone meshes,
 * instanced groups, instances, shadow casters and lines, per family — and has done
 * since INSTR1. What was missing is that NOTHING EVER CALLED IT unless a human typed
 * `pryzmPerf.report()`, and nobody did. That is `authored-but-unwired` one more time,
 * and the correction is worth more than the tool would have been.
 *
 * ⭐ THE ROW THAT ANSWERS THE QUESTION is `meshes/elem` — standalone + groups divided
 * by distinct element ids. At 1947 meshes over 331 elements the scene-wide figure is
 * ~5.9, and the scene-wide figure is USELESS for deciding what to fix: it is an average
 * over families that differ by an order of magnitude. Sorted by draw cost descending,
 * the first row of this table IS the thing to fix.
 *
 * ⛔ ONE TRAVERSE, ON AN EXPLICIT EVENT, NEVER ON A TIMER — the rule `censusScene`
 * already states: an instrument that walks the scene on a timer joins the population it
 * is measuring. This fires once per project load and prints nothing thereafter.
 */
export function logSceneCensusOnce(scene: unknown, label: string): void {
    if (_censusPrintedFor === label) return;
    _censusPrintedFor = label;
    try {
        const c = censusScene(scene as TraversableLike);
        const rows = Object.entries(c.families)
            .map(([family, r]) => {
                const drawn = r.standaloneMeshes + r.instancedGroups;
                return {
                    family,
                    elements: r.elements,
                    standalone: r.standaloneMeshes,
                    groups: r.instancedGroups,
                    instances: r.instances,
                    // ⛔ A family with 0 distinct ids reports '—', never Infinity and never 0.
                    // "(unattributed)" geometry has no elements BY DEFINITION, and printing a
                    // ratio there would invent a denominator.
                    'meshes/elem': r.elements > 0 ? +(drawn / r.elements).toFixed(2) : '—',
                    'draws (fwd)': drawn,
                    shadowCasters: r.shadowCasters,
                    lines: r.lines,
                };
            })
            .sort((a, b) => b['draws (fwd)'] - a['draws (fwd)']);

        console.log(
            `[pryzmPerf] §NAV-MESH-PER-ELEMENT-CENSUS (${label}) — ${c.meshes} mesh(es), ` +
            `${c.elements} element(s), scene-wide ${c.elements > 0 ? (c.meshes / c.elements).toFixed(2) : '?'} meshes/element. ` +
            `⭐ The scene-wide number is an AVERAGE and decides nothing — read the top row, sorted by forward draw cost. ` +
            `estimatedForwardDrawCalls=${c.estimatedForwardDrawCalls} (EXCLUDES the shadow pass: ` +
            `${c.shadowCasters} caster(s) are re-submitted whenever the shadow map refreshes — §NAV-SHADOW-CAMERA-CANNOT-CHANGE-IT).`,
        );
        console.table(rows);
        if (c.families['(unattributed)']) {
            console.log(
                '[pryzmPerf] ⚠ "(unattributed)" is geometry carrying no `userData.elementType`. It is a FINDING, ' +
                'not a rounding bucket: nothing can hide it, isolate it, or select it by type, and no per-family ' +
                'optimisation can reach it.',
            );
        }
    } catch (e) {
        // A diagnostic that throws must never take a load with it.
        console.warn('[pryzmPerf] §NAV-MESH-PER-ELEMENT-CENSUS could not run:', e);
    }
}
let _censusPrintedFor: string | null = null;

/** Re-arm the once-per-load guard (project switch). */
export function resetSceneCensusOnce(): void { _censusPrintedFor = null; }

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
        /**
         * §INSTANCE-GROUP-SPILL (L-1400) — instances that are in the MODEL and not
         * on the SCREEN.
         *
         * ⭐ This is the number the founder needed and did not have. Before spill,
         * a group that filled its 512 slots refused every further instance and
         * `WindowBuilder` had already deleted the real sub-mesh, so the part simply
         * vanished — 488 window frame members on a 100-window storey (measured).
         * The only signal was a `console.warn` per refused part, i.e. the flood that
         * hid it. `null` = the renderer is not published, NOT zero.
         */
        droppedInstances: number | null;
        /**
         * §INSTANCE-GROUP-SPILL (L-1400) — per-BASE-key shard census, densest first.
         * `groups` above counts SHARDS, so a spilled key appears there as several
         * rows and drags `collapseRatio` down for a reason that is not a defect.
         * Any row with `shards > 1` is the honest, once-per-key statement that this
         * (geometry × material × level) exceeded 512 slots.
         */
        spill: { baseKey: string; shards: number; instances: number; capacity: number }[] | null;
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

/**
 * §NAV-PICK-QUADRATIC (L-1850) — run the EXACT membership-signature loop that
 * `packages/picking/src/gpu-pick.ts` `_syncInstancedGroup` (lines 1190-1201) runs
 * on every hover rAF, and time it.
 *
 * ⛔ It calls the PRODUCTION closures (`getOccupiedInstanceSlots` /
 * `getInstanceElementId`) on the LIVE scene's groups. It does not re-derive them,
 * because a probe that re-implements what it measures is free to be fast while
 * production is slow — which is exactly the failure mode this whole lane exists
 * to correct. The only thing reproduced here is the CALL PATTERN.
 *
 * Warm pass first, then the measured one: the first touch of a Map after a GC is
 * not the steady-state cost the user pays sixty times a second.
 */
function measurePickPass(): PryzmPickPassReport | null {
    const scene =
        safe(() => _sources.getScene?.() ?? null) ??
        safe(() => g<{ scene?: { three?: TraversableLike } }>('world')?.scene?.three ?? null);
    if (!scene) return null;

    interface PickClosures {
        getOccupiedInstanceSlots?: () => readonly number[];
        getInstanceElementId?: (slot: number) => string | undefined;
    }
    const groups: PickClosures[] = [];
    scene.traverse((o) => {
        if (o.userData?.isInstancedGroup === true && o.isInstancedMesh === true) {
            groups.push((o as { userData?: PickClosures }).userData ?? {});
        }
    });

    const onePass = (): { instances: number; singletons: number; largest: number } => {
        let instances = 0;
        let singletons = 0;
        let largest = 0;
        for (const ud of groups) {
            const occupied = ud.getOccupiedInstanceSlots?.() ?? [];
            const getElemId = ud.getInstanceElementId;
            const pairs: string[] = [];
            if (getElemId !== undefined) {
                for (const slot of occupied) {
                    const eid = getElemId(slot);
                    if (eid !== undefined) pairs.push(`${slot}\x1f${eid}`);
                }
            }
            pairs.sort();
            pairs.join('\x00');
            instances += occupied.length;
            if (occupied.length === 1) singletons++;
            if (occupied.length > largest) largest = occupied.length;
        }
        return { instances, singletons, largest };
    };

    onePass();
    const t0 = performance.now();
    const { instances, singletons, largest } = onePass();
    const passMs = performance.now() - t0;

    return {
        groups: groups.length,
        singletonGroups: singletons,
        instances,
        largestGroup: largest,
        passMs,
    };
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
            droppedInstances: safe(() => ier?.droppedInstanceCount ?? null),
            spill: safe(() => ier?.spillSummary ?? null),
            elementInstancingV1: flag('__pryzmElementInstancingV1'),
            furnitureInstancingV1: flag('__pryzmFurnitureInstancingV1'),
            // Ask the SAME resolver the builders ask, rather than re-deriving the
            // precedence rules here. A report that computes its own answer is a
            // second implementation that can disagree with the one that matters —
            // and this report exists precisely to stop a founder concluding
            // "instancing is broken" when the truth is a switch.
            //
            // ⚠ AND UNTIL §NAV-SMOOTHNESS (L-1781) THIS ROW COULD LIE, in the exact
            // way the paragraph above promises it cannot. It calls the resolver WITH
            // a family name; four of the five builders called it WITHOUT one, which
            // is a different overload with different precedence. So with
            // `__pryzmElementInstancingV1 = true` this row printed `handrail: false`
            // from the per-family default while the builder was busy instancing —
            // the same resolver, a different question, opposite answers. Every
            // builder now names its family, so the row and the behaviour are finally
            // the same fact.
            //
            // ⛔ A future family added WITHOUT naming itself puts this row straight
            // back to lying, and nothing here would notice. The guard is
            // `NavigationDrawCallCensus.spec.ts` "THE GATE ITSELF", which asserts the
            // per-family switch actually moves the draw-call count — add the new
            // family there rather than trusting this row.
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

        // ── ⭐ §NAV-FAMILY-CENSUS (L-1780) — WHICH FAMILIES COST THE FRAME ─────
        //
        // The founder's question was "check all elements are now instanced
        // (railings stairs...)", and until this table existed the only way to
        // answer it was to read builder source. Sorted by DRAW CALLS, because that
        // is the currency: his scene reports 7589 calls against only 470k
        // triangles, so it is draw-call bound and the top row of this table IS the
        // bottleneck.
        //
        // ⚠ The `inst` column is measured FROM THE SCENE GRAPH, never read off a
        // flag. A family showing only `frag` while its flag row below says ON is a
        // WIRING failure — the bridge was never injected — and those two rows
        // disagreeing is itself the finding.
        p('');
        p('  ⭐ PER-FAMILY DRAW-CALL CENSUS  — sorted by cost, not by name');
        p('       family                    elems   draws  = frag + inst(xN)   shadow  lines');
        const famRows = Object.entries(r.scene.families)
            .map(([name, f]) => ({
                name, f, draws: f.standaloneMeshes + f.instancedGroups + f.lines,
            }))
            .sort((a, b) => b.draws - a.draws)
            .slice(0, 12);
        for (const fr of famRows) {
            const inst = fr.f.instancedGroups > 0
                ? `${String(fr.f.instancedGroups)}(x${String(fr.f.instances)})`
                : '-';
            p(
                '       ' + fr.name.slice(0, 24).padEnd(24) +
                String(fr.f.elements).padStart(6) +
                String(fr.draws).padStart(8) +
                '   ' + String(fr.f.standaloneMeshes).padStart(5) +
                '   ' + inst.padStart(11) +
                String(fr.f.shadowCasters).padStart(8) +
                String(fr.f.lines).padStart(7),
            );
        }
        p(row('estimated FORWARD draw calls', num(r.scene.estimatedForwardDrawCalls),
            '← scene-graph count: visible meshes + groups + lines'));
        if (r.render) {
            // ⭐ THE GAP IS THE FINDING, and it is why BOTH numbers are printed.
            // The scene-graph estimate covers ONE forward pass. The renderer's own
            // counter covers everything it actually submitted. A renderer count of
            // roughly 2x the estimate is the signature of a SHADOW PASS re-drawing
            // casters, or of a second render pass — NOT of extra geometry. Those
            // are different fixes, so the report must not collapse them into one
            // number and leave the reader guessing which they are looking at.
            const gap = r.render.drawCalls - r.scene.estimatedForwardDrawCalls;
            p(row('  renderer says', num(r.render.drawCalls),
                gap > 0
                    ? `← ${num(gap)} MORE than one forward pass = shadow/post/multi-pass`
                    : '← at or below the forward estimate (culling is removing work)'));
        }
        p(row('shadow casters', num(r.scene.shadowCasters),
            '← a shadow map pass RE-SUBMITS each one'));
        p(row('line objects (edge overlays)', num(r.scene.lineObjects),
            `(${num(r.scene.visibleLineObjects)} visible) ← decoration, still draws`));
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

    // ── §INSTANCE-GROUP-SPILL (L-1400) ────────────────────────────────
    // The collapse ratio says how WELL instancing worked. It cannot say whether
    // anything was LOST doing it, and for months the answer was "yes, silently":
    // a full 512-slot group refused the instance, `WindowBuilder` had already
    // deleted the real sub-mesh, and the part was drawn by nobody. This row is
    // the missing half. An unarmed counter must never print as a zero, so a
    // renderer that is not published prints as unavailable, not as 0.
    if (i.droppedInstances === null) {
        p(row('dropped instances', null, '← window.__instancedElementRenderer unavailable'));
    } else {
        p(row('dropped instances', num(i.droppedInstances),
            i.droppedInstances === 0
                ? '✅ every registered instance is on screen'
                : '🔴 IN THE MODEL, NOT ON THE SCREEN — group capacity exceeded'));
    }
    if (i.spill && i.spill.length > 0) {
        const spilled = i.spill.filter(x => x.shards > 1);
        if (spilled.length === 0) {
            p(row('  group spill', 'none', '— no key needed more than one shard'));
        } else {
            p(row('  group spill', `${spilled.length} key(s)`,
                '— each spilled key costs 1 extra draw call per shard, 0 elements'));
            for (const x of spilled.slice(0, 6)) {
                p(row(`    ${x.baseKey.slice(0, 44)}…`,
                    `${x.shards} shards`,
                    `${x.instances} instances / ${x.capacity} slots`));
            }
        }
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
            const note =
                name === 'window'       ? '← ~12 meshes/window collapse to 1'
                : name === 'handrail'     ? '← L-1781: ~20 meshes/railing collapse to ~1'
                : name === 'stairRailing' ? '← L-1781: ~20 meshes/railing collapse to ~1'
                : name === 'beam'         ? '(OFF: ADR-0297 L2(b) dispose-in-place OPEN)'
                : name === 'column'       ? '(OFF: no instanced delete-path test yet)'
                : '';
            p(row(`  ${name}`, fam[name] ? 'ON' : 'OFF', note));
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
        // The key is elementType_levelId_idxCt_vtxCt_x0_y0_z0_materialUuid —
        // reading the top keys says whether groups split by TYPE, by LEVEL, by
        // VERTEX COUNT, or by MATERIAL UUID. Four different bugs, and the ratio
        // alone conflates all four. (elementType joined the key in
        // §NAV-TYPE-IN-GROUP-KEY, L-1781: without it two families sharing a
        // geometry + material + level collapsed into ONE group under ONE type
        // stamp, which left hide/isolate-by-type unable to address either.)
        p('       top groups (key = type_level_idxCt_vtxCt_x0_y0_z0_materialUuid):');
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

    // ── THE WALL MOVE (§WALL30-MOVE-COST, L-10520) ──────────────────────────
    //
    // Founder, 2026-08-24: *"Move / propagates doesn't always work … looks slow,
    // not well performance … the wall element is the most important and needs to
    // be the best possible ever."* The gesture had NO row on this table, so the
    // complaint could only be answered from a console transcript — which is how
    // three DIFFERENT correct outcomes came to be reported as one intermittent
    // bug.
    //
    // ⭐ READ `wall drags that reached the weld engine` FIRST. Every row under it
    // is a MULTIPLE of it, and any row that is a multiple > 1 is duplicated work.
    p('  THE WALL MOVE  — what ONE drag actually costs');
    if (!r.armed) {
        p('       UNMEASURED — not armed. These are not zeros.');
    } else {
        const gestures = c[PERF_KEYS.WALL_MOVE_GESTURES] ?? 0;
        const per = (key: string): string =>
            gestures > 0 && c[key] !== undefined
                ? `= ${(c[key]! / gestures).toFixed(2)} per drag`
                : '';
        p(counterRow('⭐ wall drags that reached the weld engine', c,
            PERF_KEYS.WALL_MOVE_GESTURES,
            gestures === 0 ? '(no wall was moved in this window)' : ''));
        p(timerRow('  time in the re-weld engine', t[PERF_KEYS.WALL_MOVE_REWELD_MS]));
        p(counterRow('  baseline re-seats dispatched', c,
            PERF_KEYS.WALL_MOVE_REWELD_ENTRIES, per(PERF_KEYS.WALL_MOVE_REWELD_ENTRIES)));
        p(counterRow('  junctions REFUSED (left open)', c,
            PERF_KEYS.WALL_MOVE_REWELD_REFUSED,
            (c[PERF_KEYS.WALL_MOVE_REWELD_REFUSED] ?? 0) > 0
                ? '⛔ each one is a joint the user can see open — see §MOVE-REWELD-REFUSED'
                : ''));
        p(counterRow('  partners not-applicable', c, PERF_KEYS.WALL_MOVE_REWELD_NA));
        p('       ── the subject seat, split four ways (L-10520) ─────────────');
        p('       These four SUM to the gesture count. Only ONE of them is a defect.');
        p(counterRow('    subject re-seated (entry emitted)', c,
            PERF_KEYS.WALL_MOVE_SUBJECT_ENTRY, '✅ the mover adapted'));
        p(counterRow('    subject already closed', c,
            PERF_KEYS.WALL_MOVE_SUBJECT_ALREADY_CLOSED,
            '✅ nothing to do — this is the line that READ as a failure'));
        p(counterRow('    subject: no corner offered', c,
            PERF_KEYS.WALL_MOVE_SUBJECT_NO_CORNER,
            'the partners formed no corner the subject could terminate on'));
        p(counterRow('    subject seat DECLINED', c,
            PERF_KEYS.WALL_MOVE_SUBJECT_DECLINED,
            (c[PERF_KEYS.WALL_MOVE_SUBJECT_DECLINED] ?? 0) > 0
                ? '⛔ THE DEFECT — corner formed, subject could not reach it, joint LEFT OPEN'
                : ''));
        p(counterRow('    subject seat suppressed (would collapse)', c,
            PERF_KEYS.WALL_MOVE_SUBJECT_COLLAPSE));

        p('       ── what the drag cost the PLAN VIEW ────────────────────────');
        const offered = c[PERF_KEYS.REPROJECT_GRAFT_OFFERED];
        const grafted = c[PERF_KEYS.REPROJECT_GRAFT] ?? 0;
        p(counterRow('  graft-eligible sets OFFERED to the driver', c,
            PERF_KEYS.REPROJECT_GRAFT_OFFERED));
        p(counterRow('  …of which actually GRAFTED O(dirty)', c, PERF_KEYS.REPROJECT_GRAFT,
            offered !== undefined && offered > grafted
                ? `🔴 ${offered - grafted} offered set(s) still took the O(N) full arm`
                : ''));
        p(counterRow('⭐ re-projection flush OVERLAPS', c, PERF_KEYS.REPROJECT_FLUSH_OVERLAP,
            (c[PERF_KEYS.REPROJECT_FLUSH_OVERLAP] ?? 0) > 0
                ? 'coalesced by §FIX-VDT-FLUSH-SERIALISE — each one was a FULL re-projection before'
                : ''));
        p(counterRow('  graft demoted by element TYPE', c,
            PERF_KEYS.REPROJECT_GRAFT_DEMOTED_TYPE,
            'a door/window/furniture edit in the same flush — see PLAN_INCREMENTAL_SAFE_TYPES'));
        p(counterRow('  graft demoted by a COARSE change', c,
            PERF_KEYS.REPROJECT_GRAFT_DEMOTED_COARSE,
            'a delete, a batch, or a §G3 stale-id fallback'));
        p('       ── and what it cost everything else ────────────────────────');
        p(counterRow('  room re-detection passes', c, PERF_KEYS.REDETECT_ROOMS,
            gestures > 0 && (c[PERF_KEYS.REDETECT_ROOMS] ?? 0) > gestures
                ? `⚠ ${per(PERF_KEYS.REDETECT_ROOMS)} — more than one per drag is duplicate work`
                : ''));
        p(timerRow('  time in room re-detection', t[PERF_KEYS.REDETECT_ROOMS_MS]));
        p(counterRow('  autosave runs', c, PERF_KEYS.AUTOSAVE_RUN,
            '⚠ NOT lane WALL30\'s to change (DURABLE25) — measured and reported only'));
        p(timerRow('  time in autosave', t[PERF_KEYS.AUTOSAVE_MS]));
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

    // ── VIEWPORT SUBMIT ─────────────────────────────────────────────────────
    // ⭐ §NAV-THE-EVIDENCE-NOBODY-CAN-REACH (L-5910, lane NAV29, 2026-08-22).
    //
    // Two instruments already existed for exactly the founder's complaint, both
    // correct, both COMPLETELY UNREACHABLE from the workflow he actually uses.
    //
    //   · `renderPipelineManager.getFrameSkipReport()` — §L900-FRAME-SKIP-ATTRIBUTION.
    //     Names WHICH of `render()`'s ten early-return gates declined a frame, and
    //     how many IN A ROW. Its own header states the stakes: nothing else repaints
    //     that canvas, so a declined frame is a FROZEN VIEWPORT.
    //   · `getZeroAreaSurfaceReport()` — §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS.
    //     Survives the flood on purpose, because "a message that scrolled past at
    //     frame 3 of 40,000 is not a finding a human can retrieve".
    //
    // ⛔ AND NEITHER WAS PRINTED HERE. The founder's report is a pasted console
    // line; the reading protocol this module publishes is `on()` → gesture →
    // `report()`. An instrument that requires knowing its own function name is not
    // an instrument he has — it is one a lane has. That is the same defect as a
    // count that survives only in a report nobody re-runs, and it is why the
    // "177 frame(s) were refused" line reached this lane as an anecdote from a
    // scrollback rather than as a retained number with a denominator.
    //
    // ⚠ THIS SECTION MEASURES NOTHING NEW. It reads two existing reports and prints
    // them. Every figure below is the subsystem's own, unmodified.
    p('  VIEWPORT SUBMIT — which frames the pipeline DECLINED, and why');
    const rpmSkip = safe(() =>
        g<{ getFrameSkipReport?: () => {
            skips: Record<string, number>;
            lastSkipReason: string | null;
            consecutiveSkips: number;
            framesPresented: number;
        } }>('renderPipelineManager')?.getFrameSkipReport?.(),
    );
    if (!rpmSkip) {
        p(row('frame-skip attribution', null,
            '← no window.renderPipelineManager.getFrameSkipReport()'));
    } else {
        const entries = Object.entries(rpmSkip.skips).sort((a, b) => b[1] - a[1]);
        const total = entries.reduce((s, [, n]) => s + n, 0);
        p(row('frames declined (all gates)', num(total),
            total === 0 ? '✅ nothing declined' : ''));
        for (const [reason, n] of entries) p(row('  ' + reason, num(n)));
        // ⭐ The load-bearing number is CONSECUTIVE, not total. A view switch is
        // ALLOWED to decline frames; a gate that has declined 600 in a row is a leak.
        p(row('consecutive skips (NOW)', num(rpmSkip.consecutiveSkips),
            rpmSkip.consecutiveSkips > 0
                ? `🔴 STALLED at gate "${rpmSkip.lastSkipReason}" — the image on screen is STALE`
                : '✅ not currently stalled'));
        p(row('frames presented since', num(rpmSkip.framesPresented),
            rpmSkip.framesPresented > 0
                ? '← pipeline is live; any staleness is UPSTREAM of the submit'
                : ''));
    }
    const zeroArea = safe(() => getZeroAreaSurfaceReport());
    if (!zeroArea) {
        p(row('zero-area surface refusals', null, '← getZeroAreaSurfaceReport() unavailable'));
    } else if (zeroArea.length === 0) {
        // ⛔ NOT "0 refusals". The gate registers a site the first time it RUNS, so an
        // empty list means no gated site has been exercised at all — an absence of
        // measurement, not a clean bill of health (§PERF-ZERO-IS-NOT-UNWRITTEN, L-1397).
        p(row('zero-area surface refusals', '—',
            'NO SITE HAS RUN — absence of measurement, NOT a measured zero'));
    } else {
        for (const s of zeroArea) {
            p(row(`  "${s.site}"`,
                `${num(s.suppressedTotal)} refused / ${num(s.episodes)} episode(s)`,
                s.suppressing
                    ? `🔴 REFUSING NOW (${num(s.suppressed)} this episode) — surface has no area`
                    : ''));
        }
        p('       ⚠ A refusal is CORRECT: a draw into a 0×0 attachment is discarded by');
        p('         the driver. What it costs is everything computed to reach it.');
    }
    p(LINE);

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
    /**
     * §NAV-PICK-QUADRATIC (L-1850) — measure ONE GPU-pick membership pass over the
     * live scene, the way `gpu-pick.ts _syncInstancedGroup` does it on the hover rAF.
     *
     * ⭐ THIS IS THE PROBE THAT SETTLES THE FREEZE QUESTION, and it exists because
     * the lane could measure the SHAPE of the cost in node but not the founder's
     * own N. Run `pryzmPerf.pick()` with the project open. It prints:
     *
     *   · N   — total instanced registrations in the singleton (the number squared)
     *   · G   — instanced groups, and how many hold exactly ONE member
     *   · ms  — one full pass, i.e. the cost the main thread pays PER POINTERMOVE
     *
     * A reading above ~16 ms means the hover rAF cannot keep up and the scene will
     * feel frozen; a reading in the single-digit ms means the pick path is NOT what
     * is blocking and the search moves elsewhere. Either answer is progress, which
     * is the point of shipping the probe rather than an opinion.
     */
    pick(): PryzmPickPassReport | null;
}

/** §NAV-PICK-QUADRATIC (L-1850) — one measured GPU-pick membership pass. */
export interface PryzmPickPassReport {
    /** Instanced groups walked. */
    groups: number;
    /** Groups holding exactly ONE instance — high counts mean dedup is failing. */
    singletonGroups: number;
    /** Occupied slots resolved across every group. This is N. */
    instances: number;
    /** Largest single group, by occupied slots. */
    largestGroup: number;
    /** Milliseconds for ONE full pass — the per-pointermove main-thread cost. */
    passMs: number;
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
        pick(): PryzmPickPassReport | null {
            const r = measurePickPass();
            if (r === null) {
                console.warn(
                    '[§PRYZM-PERF] pick() — no scene reachable (window.world.scene.three). ' +
                    'Open a project first.',
                );
                return null;
            }
            console.log(
                `[§PRYZM-PERF] §NAV-PICK-QUADRATIC — ONE pick pass: ${r.passMs.toFixed(2)} ms · ` +
                `N=${r.instances} instances · G=${r.groups} groups ` +
                `(${r.singletonGroups} singleton, largest ${r.largestGroup}). ` +
                `This is the main-thread cost PER POINTERMOVE. Above ~16 ms the hover ` +
                `rAF cannot keep up.`,
            );
            return r;
        },
    };

    (globalThis as unknown as { pryzmPerf?: PryzmPerfApi }).pryzmPerf = api;
    console.log(
        '[§PRYZM-PERF] ready — window.pryzmPerf.on() → gesture → window.pryzmPerf.report()\n' +
        '[§PRYZM-PERF] freeze probe (L-1850) — window.pryzmPerf.pick() prints the ' +
        'main-thread cost of ONE hover pick pass. Above ~16 ms is a frozen scene.',
    );
}
/* eslint-enable no-console */
