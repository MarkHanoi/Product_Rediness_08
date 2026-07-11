/**
 * ProjectIsolationAudit — runtime tripwire for project-isolation leaks.
 *
 * Contract C13 — Project Lifecycle and Isolation (§3.9 / §3.10).
 * (Historically mis-cited as "Contract 48"; C48 is Backup & DR. Corrected in
 *  L-224 §AUDIT-PROJECT-ISOLATION-E2E.)
 *
 * What it does
 * ────────────
 * Subscribes to `pryzm-project-loaded` on the typed `runtime.events` bus — i.e.
 * every time ANY project finishes loading (not only empty ones). At that moment
 * the world MUST contain ONLY the just-loaded project's state. Anything else is
 * a leak: the previous project bled into the new one.
 *
 * §L-224 — TWO FIXES over the previous incarnation:
 *
 *   (1) LISTENER REVIVED. The old listener used `window.addEventListener(...)`,
 *       but `pryzm-project-loaded` is emitted ONLY on the in-memory typed
 *       `runtime.events` bus (the `F.events` migration re-pointed the emitter
 *       and orphaned this DOM listener). The audit therefore never fired. It now
 *       subscribes via `runtime.events.on(...)` — the same bus PlatformShell /
 *       PlatformVersionController emit on.
 *
 *   (2) RUNS ON EVERY LOAD, not only `empty:true`. The previous audit only ran
 *       on empty loads because it could not tell "legitimately-restored saved
 *       geometry" from "leftover from the previous project". It now compares
 *       live state against the EXPECTED element-id set the loader just restored
 *       (published by `ProjectLoader` on `globalThis.__pryzmLoadedProjectExpectation`).
 *       Only state whose id is NOT in that set (or scene junk that is never a
 *       legitimate BIM element) is flagged — zero false positives on a populated
 *       load, full coverage of the "open another project" case (L-224).
 *
 * Tripwire surfaces:
 *
 *   1. THREE scene contains an underlay / IFC / DXF import (never a legitimate
 *      BIM element — always a leak if present after a fresh/other-project load).
 *   2. THREE scene contains a BIM element whose id is NOT in the loaded
 *      project's expected set (a foreign element from the previous project).
 *   3. An element store holds an element whose id is NOT in the expected set.
 *   4. `window.floorPlanUnderlayTool` / `window._ifcServerUploadIds` survived.
 *
 * On detection
 * ────────────
 * Logs a single `[C13 VIOLATION] …` error, dispatches
 * `pryzm-project-isolation-leak`, and posts a structured payload to
 * `window.__pryzmIsolationLeaks` for console inspection.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';

export interface IsolationLeakReport {
    timestamp: string;
    projectId: string;
    findings: Array<{
        surface: string;
        count: number;
        details?: unknown;
    }>;
}

/** Loader-published expectation for the project that just loaded. */
interface LoadedProjectExpectation {
    projectId: string;
    elementIds: string[];
}

const _leakHistory: IsolationLeakReport[] = [];
let _installed = false;
let _dispose: (() => void) | null = null;

/** Lightweight structural view of a THREE.Object3D — no THREE import (P5). */
export interface SceneObjectLike {
    name?: string;
    userData?: Record<string, unknown>;
}

/** One element store's live ids, tagged with the store name for reporting. */
export interface StoreElementIds {
    store: string;
    ids: readonly string[];
}

export interface AuditInput {
    projectId: string;
    /**
     * The set of element ids the loader restored for this project. `null` means
     * the expectation is unknown (a load path that bypassed ProjectLoader): in
     * that case the id-based checks are skipped to preserve zero false positives,
     * and only always-junk surfaces (underlay/IFC/DXF/globals) are inspected.
     * An EMPTY set means an empty/new project → every element is a leak.
     */
    expectedIds: ReadonlySet<string> | null;
    sceneObjects: Iterable<SceneObjectLike>;
    storeElements: Iterable<StoreElementIds>;
    /** Offender descriptions for surviving window singletons. */
    globals: readonly string[];
}

/**
 * PURE leak detector — no window, no THREE, no I/O. Unit-testable in isolation.
 * Returns a report when a leak is found, else null.
 */
export function detectLeaks(input: AuditInput): IsolationLeakReport | null {
    const { projectId, expectedIds, sceneObjects, storeElements, globals } = input;
    const idKnown = expectedIds !== null;

    let underlayCount = 0;
    let ifcCount = 0;
    let dxfCount = 0;
    const foreignSceneIds: string[] = [];

    for (const obj of sceneObjects) {
        const ud = (obj.userData ?? {}) as Record<string, unknown>;
        const name = (obj.name ?? '') as string;

        if (name.startsWith('FloorPlanUnderlay') || ud.isFloorPlanUnderlay === true) {
            underlayCount += 1;
        }
        if (ud.isIfcGroup === true || ud.isIFCModel === true || ud.ifcModelId != null) {
            ifcCount += 1;
        }
        if (ud.isDxfOverlay === true || ud.dxfId != null) {
            dxfCount += 1;
        }
        // A BIM element whose id is NOT part of the loaded project is foreign.
        if (idKnown && ud.elementId != null && ud.elementType != null) {
            const id = String(ud.elementId);
            if (!expectedIds!.has(id)) foreignSceneIds.push(id);
        }
    }

    // Store-level foreign elements (id-based; skipped when expectation unknown).
    const foreignStoreDetails: Array<{ store: string; ids: string[] }> = [];
    let foreignStoreCount = 0;
    if (idKnown) {
        for (const { store, ids } of storeElements) {
            const foreign = ids.filter(id => !expectedIds!.has(id));
            if (foreign.length > 0) {
                foreignStoreCount += foreign.length;
                // Cap the reported ids so a large leak does not flood the log.
                foreignStoreDetails.push({ store, ids: foreign.slice(0, 20) });
            }
        }
    }

    const findings: IsolationLeakReport['findings'] = [];
    if (underlayCount > 0)        findings.push({ surface: 'scene.underlay',        count: underlayCount });
    if (ifcCount > 0)             findings.push({ surface: 'scene.ifc',             count: ifcCount });
    if (dxfCount > 0)             findings.push({ surface: 'scene.dxf',             count: dxfCount });
    if (foreignSceneIds.length)   findings.push({ surface: 'scene.foreignElement',  count: foreignSceneIds.length, details: foreignSceneIds.slice(0, 20) });
    if (foreignStoreCount > 0)    findings.push({ surface: 'store.foreignElement',  count: foreignStoreCount, details: foreignStoreDetails });
    if (globals.length > 0)       findings.push({ surface: 'window.globals',        count: globals.length, details: globals });

    if (findings.length === 0) return null;

    return { timestamp: new Date().toISOString(), projectId, findings };
}

/** The element stores whose ids map 1:1 to a restored snapshot array. Derived
 *  stores (rooms, room-bounding-lines, annotations, curtain panels) are excluded
 *  because post-load redetection legitimately creates entries not present in the
 *  snapshot — checking them would produce false positives (L-224). */
const AUDITED_STORE_GLOBALS: readonly string[] = [
    'wallStore', 'slabStore', 'columnStore', 'beamStore', 'stairStore',
    'roofStore', 'furnitureStore', 'handrailStore', 'curtainWallStore',
    'plumbingStore', 'ceilingStore', 'floorStore', 'gridStore',
    'doorStore', 'windowStore',
];

/** Read a window global by name. */
function w<T = unknown>(name: string): T | undefined {
    return (window as unknown as Record<string, T>)[name];
}

/** Gather the live scene objects (flattened) from `window.scene`. */
function gatherSceneObjects(): SceneObjectLike[] {
    const scene = w<{ traverse?: (cb: (o: SceneObjectLike) => void) => void }>('scene');
    const out: SceneObjectLike[] = [];
    if (scene && typeof scene.traverse === 'function') {
        scene.traverse((o) => out.push({
            name: (o as { name?: string }).name,
            userData: (o as { userData?: Record<string, unknown> }).userData,
        }));
    }
    return out;
}

/** Gather live element ids from every audited store exposed on `window`. */
function gatherStoreElements(): StoreElementIds[] {
    const out: StoreElementIds[] = [];
    for (const name of AUDITED_STORE_GLOBALS) {
        const store = w<{ getAll?: () => Array<{ id?: unknown }> }>(name);
        if (!store || typeof store.getAll !== 'function') continue;
        try {
            const ids = store.getAll()
                .map(e => (e && typeof e.id === 'string' ? e.id : null))
                .filter((id): id is string => id !== null);
            out.push({ store: name, ids });
        } catch { /* defensive — a store that throws on getAll is skipped */ }
    }
    return out;
}

/** Surviving window singletons that must be null/empty after a fresh load. */
function gatherGlobalOffenders(): string[] {
    const offenders: string[] = [];
    if (w('floorPlanUnderlayTool') != null) offenders.push('window.floorPlanUnderlayTool is non-null');
    const ifcUploads = w<Record<string, unknown>>('_ifcServerUploadIds');
    if (ifcUploads && typeof ifcUploads === 'object' && Object.keys(ifcUploads).length > 0) {
        offenders.push(`window._ifcServerUploadIds has ${Object.keys(ifcUploads).length} entries`);
    }
    return offenders;
}

/** Resolve the loader-published expected id set for `projectId`, or null. */
function resolveExpectedIds(projectId: string, emptyHint: boolean): ReadonlySet<string> | null {
    const exp = (globalThis as unknown as { __pryzmLoadedProjectExpectation?: LoadedProjectExpectation })
        .__pryzmLoadedProjectExpectation;
    if (exp && exp.projectId === projectId && Array.isArray(exp.elementIds)) {
        return new Set(exp.elementIds);
    }
    // No expectation published for this project. An empty-flagged load still has
    // a well-defined expectation (nothing) → treat as an empty set so leftover
    // geometry is caught even without a ProjectLoader publish.
    if (emptyHint) return new Set<string>();
    return null;
}

function runAudit(projectId: string, emptyHint: boolean): IsolationLeakReport | null {
    return detectLeaks({
        projectId,
        expectedIds: resolveExpectedIds(projectId, emptyHint),
        sceneObjects: gatherSceneObjects(),
        storeElements: gatherStoreElements(),
        globals: gatherGlobalOffenders(),
    });
}

/**
 * Install the runtime audit. Idempotent — call once at app boot from initTools.ts
 * after `installUnderlayPersistence()` so the persistence layer's switch/load
 * listeners win the event-ordering race; the audit runs LAST, observing the
 * post-clear/post-restore state.
 *
 * §L-224 — subscribes on the TYPED `runtime.events` bus (not `window`), because
 * `pryzm-project-loaded` is emitted only there.
 */
export function installProjectIsolationAudit(): void {
    if (_installed) return;
    if (typeof window === 'undefined') return;

    const bus = (window as unknown as {
        runtime?: { events?: { on(ev: string, cb: (p: unknown) => void): (() => void) } };
    }).runtime?.events;
    if (!bus || typeof bus.on !== 'function') {
        console.error('[ProjectIsolationAudit] runtime.events unavailable at install — audit NOT wired.');
        return;
    }

    _installed = true;

    _dispose = bus.on('pryzm-project-loaded', (payload: unknown) => {
        const detail = (payload as { projectId?: string; empty?: boolean } | undefined) ?? {};
        const projectId = detail.projectId ?? '<unknown>';
        const emptyHint = detail.empty === true;

        // Defer one frame so listeners that mount geometry on `pryzm-project-loaded`
        // have completed (legitimate setup vs. leak).
        getFrameScheduler().scheduleOnce('project-isolation-audit', () => {
            const report = runAudit(projectId, emptyHint);
            if (!report) {
                console.log(`[ProjectIsolationAudit] ✓ project ${projectId} loaded clean — no leftover state`);
                return;
            }
            _leakHistory.push(report);
            (window as unknown as { __pryzmIsolationLeaks?: IsolationLeakReport[] }).__pryzmIsolationLeaks = _leakHistory;

            console.error(
                `[C13 VIOLATION] Project-isolation leak detected on load of ${projectId}:\n`,
                report.findings,
            );
            window.dispatchEvent(new CustomEvent('pryzm-project-isolation-leak', { detail: report }));
        });
    });

    console.log('[ProjectIsolationAudit] Installed — will audit every project load (typed runtime.events)');
}

/** Test hook — read the in-memory leak history. */
export function getIsolationLeakHistory(): ReadonlyArray<IsolationLeakReport> {
    return _leakHistory;
}

/** Test hook — tear down the listener + reset install state. */
export function _resetProjectIsolationAuditForTest(): void {
    _dispose?.();
    _dispose = null;
    _installed = false;
    _leakHistory.length = 0;
}
