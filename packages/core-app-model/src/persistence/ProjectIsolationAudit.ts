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
 *   5. §L-676 — a registered PROJECT-SCOPE PROBE reports that its live state
 *      belongs to a DIFFERENT project than the one that just loaded.
 *
 * §L-676 — WHY (5) EXISTS. Surfaces 1–4 inspect the THREE scene, fifteen element
 * stores and two window globals. That is the whole BIM half. The GIS/site half —
 * `CesiumViewport` (placed massing, `formaMassingOrigin`, context layers, terrain
 * datum), the C19 `SiteModelStore`, the `siteDispatch` module singletons
 * (`_ltpAdapter`, `_lastEnvelope`, …) and the neighbour-footprint snapshot — is
 * touched by NONE of them. The founder's reproduction is exact: a brand-new,
 * zero-element project reported `✓ loaded clean` while Cesium was still framing
 * the PREVIOUS project's placed building 697 km away. An audit that cannot fail
 * on a real leak manufactures confidence (C13 §3.10).
 *
 * A probe does NOT enumerate symptoms. It answers ONE question — "which project
 * does the state you are holding belong to?" — and the audit compares that answer
 * to the project that just loaded. `null` means "holding nothing", which is always
 * clean. This is why it has a zero false-positive rate on a legitimately-populated
 * load: a correctly-restored GIS project answers with its OWN id.
 *
 * On detection
 * ────────────
 * Logs a single `[C13 VIOLATION] …` error, dispatches
 * `pryzm-project-isolation-leak`, and posts a structured payload to
 * `window.__pryzmIsolationLeaks` for console inspection.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import {
    DECLARED_PROJECT_SCOPE_NAMES,
    DECLARED_PROJECT_SCOPE_SET_VERSION,
    DECLARED_SCOPES_REQUIRING_PRESENCE,
} from './declaredProjectScopes';

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

/**
 * §L-676 (C13 §3.10) — a per-project surface that declares WHICH project the state
 * it is currently holding belongs to.
 *
 * Implemented by every subsystem that survives a project switch as a singleton and
 * therefore cannot be audited by id-set comparison (the GIS/site half: the Cesium
 * viewport, the C19 site store, the site-dispatch module globals). The contract is
 * deliberately one question wide:
 *
 *   - return `null`  → "I hold no per-project state" → always clean.
 *   - return an id   → "the state I hold belongs to THIS project".
 *
 * The audit flags the surface iff the returned id differs from the project that
 * just loaded. Probes MUST NOT throw; a throwing probe is reported as a leak of
 * its own (a probe that cannot answer is not evidence of cleanliness — the
 * "probe can be wrong three ways" lesson).
 */
export interface ProjectScopeProbe {
    /** Stable identifier used in the leak report, e.g. `gis.cesiumViewport`. */
    readonly scope: string;
    /** The project whose state this surface currently holds, or null when empty. */
    owningProjectId(): string | null;
    /** Optional detail attached to the finding (what exactly is being held). */
    describe?(): unknown;
}

/** One probe's answer, as consumed by the pure detector. */
export interface ScopeProbeReading {
    scope: string;
    /** null ⇒ the surface holds nothing. */
    owningProjectId: string | null;
    detail?: unknown;
    /** Set when `owningProjectId()` threw — itself a finding. */
    error?: string;
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
    /**
     * §L-676 — readings from the registered {@link ProjectScopeProbe}s. Optional so
     * the existing BIM-only call sites and unit tests keep compiling; the runtime
     * audit always supplies it.
     */
    scopeProbes?: Iterable<ScopeProbeReading>;
    /**
     * §CONTEXT-DATA-HONESTY — names from {@link AUDITED_STORE_GLOBALS} that the
     * audit COULD NOT READ this run (absent from `window`, or `getAll()` threw).
     * An unreadable store contributes zero ids, which is indistinguishable from a
     * clean store — so it must be reported, not skipped. Defaults to "none".
     */
    unreadableStores?: readonly string[];
    /**
     * ADR-0298 §2 — the scope names that MUST have answered this run, from the
     * DECLARED expected probe set. A declared name with no reading is a finding
     * (`scope.probeMissing`), exactly as loud as a registered probe reporting
     * foreign state: *"expected probe `gis.cesiumViewport` did not register"* is a
     * failure, never a silent absence.
     *
     * Optional so the pure-detector unit tests and the BIM-only call sites keep
     * compiling; the runtime audit always supplies it. Defaults to "expect
     * nothing", which reproduces the pre-ADR-0298 discovered-population behaviour.
     */
    declaredScopes?: readonly string[];
    /**
     * §CONTEXT-DATA-HONESTY — false when the THREE scene could not be traversed.
     * `sceneObjects: []` alone cannot express the difference between "the scene is
     * empty" and "there was no scene to look at". Defaults to `true` so existing
     * call sites that genuinely hand over a scene keep their meaning.
     */
    sceneReadable?: boolean;
}

// ── §C13-SCENE-ID-KEY — the scene check must read the key the SCENE actually uses ──
//
// C13 §3.11 / ADR-0298 lineage, variant FIVE of one family: L-676 no owner →
// L-694 wrong PROPERTY → L-711 incomplete expected set → L-713 unmodelled channel →
// **L-7xx wrong property, on the SCENE surface.**
//
// The scene tripwire was gated on `userData.elementId != null && userData.elementType
// != null`. Exactly ONE production builder stamps `elementId` on a scene root
// (`StairMeshBuilder`, packages/geometry-stair/src/StairMeshBuilder.ts:154). Every other
// family stamps `id`:
//
//   WallFragmentBuilder:822        { id, elementType:'wall',  type:'wall',  selectable }
//   SlabFragmentBuilder:398        { id, type:'slab', elementType:'Slab', … }
//   RoomBoundingLineBuilder:87     { id, type, levelId, version }
//   BimGridRenderer:167            { elementType:'BimGrid', id }
//   LevelVisualizer:241            { elementType:'LevelLine', id }
//
// So `scene.foreignElement` could only ever fire for STAIRS. Fourteen of the fifteen
// audited families — including the walls the founder actually sees — were structurally
// invisible to it, and the audit printed `✓ loaded clean` over a scene full of Project
// A geometry. This is the C13 §3.10 failure verbatim: *a clean verdict that never
// looked is worse than no verdict, because it manufactures confidence.*
//
// WHY THE POSITIVE CONTROL DID NOT CATCH IT (the load-bearing lesson):
// `ProjectIsolationAudit.plantedLeak.test.ts` DOES plant a scene leak and DOES assert
// the audit fails — but it plants `{ elementId, elementType }`, a shape that exists
// nowhere except in the test. The control validated the detector against the
// detector's own model of the world rather than against the world. A positive control
// is only evidence when the thing it plants is the thing the system really produces;
// the fixtures below are therefore copied verbatim from the builders, cited by
// file:line, so a rename breaks the test rather than silently re-blinding the audit.

/**
 * The element id a scene object claims, reading BOTH keys the builders use.
 * Returns null when the object carries no usable id.
 */
function sceneElementId(ud: Record<string, unknown>): string | null {
    const raw = ud.elementId ?? ud.id;
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/** The element type a scene object claims, reading BOTH keys the builders use. */
function sceneElementType(ud: Record<string, unknown>): unknown {
    return ud.elementType ?? ud.type;
}

/**
 * Scene objects that legitimately carry an id + type but are NEVER in a snapshot's
 * expected id set. DECLARED, not sniffed — each exemption is a written decision, in
 * the diff, for the same reason `declaredProjectScopes.uncounted` is:
 *
 *  • `isProjectOrigin`  — the always-on ProjectOrigin datum (C11: a project singleton,
 *    auto-created at world origin, never user-drawn, never serialized as an element).
 *    It is NOT unowned: `initProjectOrigin` registers the `projectOrigin` scope and
 *    re-seeds it on every switch, so it is torn down by a named owner and must not
 *    also be accused here.
 *  • `isPreview`        — transient tool-preview ghosts. Not project state; swept by
 *    the `bim-project-cleared` handler in `initTools.ts`.
 *  • `role: 'hit-proxy'`— invisible pick proxies parented under an element root; they
 *    mirror their parent's id and would only ever double-count it.
 *
 * NOTE what is deliberately NOT exempt: LEVEL lines. Levels are serialized project
 * state, so the honest fix is to put them in the EXPECTATION (`ProjectLoader` now
 * pushes `snapshot.levels`, exactly as §L-711 did for `snapshot.lighting`) rather
 * than to blind the audit to them.
 */
function isExemptSceneSingleton(ud: Record<string, unknown>): boolean {
    return ud.isProjectOrigin === true
        || ud.isPreview === true
        || ud.role === 'hit-proxy';
}

/**
 * PURE leak detector — no window, no THREE, no I/O. Unit-testable in isolation.
 * Returns a report when a leak is found, else null.
 */
export function detectLeaks(input: AuditInput): IsolationLeakReport | null {
    const {
        projectId, expectedIds, sceneObjects, storeElements, globals, scopeProbes,
        unreadableStores = [], sceneReadable = true, declaredScopes = [],
    } = input;
    const idKnown = expectedIds !== null;

    let underlayCount = 0;
    let ifcCount = 0;
    let dxfCount = 0;
    // §C13-SCENE-ID-KEY — deduped so a wall's root + its N part meshes (which all
    // carry the SAME id) count as ONE foreign element, not N.
    const foreignSceneIdSet = new Set<string>();

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
        if (idKnown && !isExemptSceneSingleton(ud)) {
            const id = sceneElementId(ud);
            if (id !== null && sceneElementType(ud) != null && !expectedIds!.has(id)) {
                foreignSceneIdSet.add(id);
            }
        }
    }
    const foreignSceneIds = [...foreignSceneIdSet];

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

    // §L-676 — project-scope probes. A surface holding state that belongs to a
    // DIFFERENT project than the one that just loaded is a leak, full stop. This
    // check is INDEPENDENT of `expectedIds`: it works on an empty new project (the
    // founder's reproduction) and on a fully-populated one, because it compares
    // ownership, not contents.
    const foreignScopes: Array<{ scope: string; owningProjectId: string; detail?: unknown }> = [];
    const brokenProbes: Array<{ scope: string; error: string }> = [];
    const answered = new Set<string>();
    for (const reading of scopeProbes ?? []) {
        answered.add(reading.scope);
        if (reading.error != null) {
            brokenProbes.push({ scope: reading.scope, error: reading.error });
            continue;
        }
        const owner = reading.owningProjectId;
        if (owner != null && owner !== projectId) {
            foreignScopes.push({ scope: reading.scope, owningProjectId: owner, detail: reading.detail });
        }
    }

    // ADR-0298 §2 — DECLARED-BUT-ABSENT. The audit's population is now the DECLARED
    // set, not the set of things that happened to register. A declared owner that did
    // not answer is a finding: "nothing registered" and "the owner was never wired"
    // are the same value, and this family has now produced four bugs out of failing to
    // distinguish them. `DECLARED_SCOPES_REQUIRING_PRESENCE` deliberately contains only
    // the owners whose absence is UNPROVEN (instance-scope registration); a module-scope
    // owner that never loaded provably holds nothing and is not reported here.
    const missingDeclared = declaredScopes.filter(s => !answered.has(s));

    const findings: IsolationLeakReport['findings'] = [];
    if (underlayCount > 0)        findings.push({ surface: 'scene.underlay',        count: underlayCount });
    if (ifcCount > 0)             findings.push({ surface: 'scene.ifc',             count: ifcCount });
    if (dxfCount > 0)             findings.push({ surface: 'scene.dxf',             count: dxfCount });
    if (foreignSceneIds.length)   findings.push({ surface: 'scene.foreignElement',  count: foreignSceneIds.length, details: foreignSceneIds.slice(0, 20) });
    if (foreignStoreCount > 0)    findings.push({ surface: 'store.foreignElement',  count: foreignStoreCount, details: foreignStoreDetails });
    if (globals.length > 0)       findings.push({ surface: 'window.globals',        count: globals.length, details: globals });
    if (foreignScopes.length)     findings.push({ surface: 'scope.foreignProject',   count: foreignScopes.length, details: foreignScopes });
    if (brokenProbes.length)      findings.push({ surface: 'scope.probeFailed',      count: brokenProbes.length, details: brokenProbes });
    if (missingDeclared.length)   findings.push({ surface: 'scope.probeMissing',     count: missingDeclared.length, details: { expected: missingDeclared, declarationVersion: DECLARED_PROJECT_SCOPE_SET_VERSION } });

    // §CONTEXT-DATA-HONESTY — a surface the audit COULD NOT INSPECT is not a clean
    // surface. Every check above turns "found nothing" into "clean"; that inference
    // is only valid if the looking actually happened. `gatherStoreElements` skips a
    // missing/throwing store and `gatherSceneObjects` returns `[]` for a missing
    // scene, so a rename, a disposal, or the pending `TODO(TASK-08)` removal of the
    // `window.*Store` globals would silently reduce this audit to a rubber stamp —
    // the exact shape of L-224 (dead listener) and L-676 (unwatched GIS half),
    // where a green verdict WAS the evidence that nothing was wrong. Reported as a
    // finding about the AUDIT, alongside `scope.probeFailed`, which is the same
    // principle already applied to probes.
    if (unreadableStores.length > 0 || !sceneReadable) {
        findings.push({
            surface: 'audit.coverageLoss',
            count: unreadableStores.length + (sceneReadable ? 0 : 1),
            details: { unreadableStores: [...unreadableStores], sceneReadable },
        });
    }

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

// ── §L-676 — project-scope probe registry ────────────────────────────────────
//
// A module-level registry (not a window global) so probe registration is a real
// import-time dependency the type system can see, and so the GA gate can assert
// that the GIS/site scopes are registered. Keyed by `scope` so HMR re-registration
// replaces rather than duplicates.
const _scopeProbes = new Map<string, ProjectScopeProbe>();

/**
 * Register a per-project surface with the isolation audit (C13 §3.10 — every
 * stateful surface has a NAMED OWNER, and the audit enumerates owners).
 *
 * Call this from the same module that owns the state, at the point the owner is
 * constructed. Returns an unregister disposer.
 */
export function registerProjectScopeProbe(probe: ProjectScopeProbe): () => void {
    if (!probe?.scope) {
        console.warn('[ProjectIsolationAudit] Refusing to register a probe with no scope name');
        return () => { /* no-op */ };
    }
    _scopeProbes.set(probe.scope, probe);
    return () => {
        if (_scopeProbes.get(probe.scope) === probe) _scopeProbes.delete(probe.scope);
    };
}

/** The scopes currently registered — used by tests and the C13 §3.10 owner gate. */
export function listProjectScopeProbes(): readonly string[] {
    return [..._scopeProbes.keys()];
}

/** Read every registered probe, converting a throw into a reportable finding. */
export function readProjectScopeProbes(): ScopeProbeReading[] {
    const out: ScopeProbeReading[] = [];
    for (const probe of _scopeProbes.values()) {
        try {
            out.push({
                scope: probe.scope,
                owningProjectId: probe.owningProjectId(),
                detail: probe.describe?.(),
            });
        } catch (e) {
            out.push({
                scope: probe.scope,
                owningProjectId: null,
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }
    return out;
}

/** Test hook — drop every registered probe. */
export function _resetProjectScopeProbesForTest(): void {
    _scopeProbes.clear();
}

/** Read a window global by name. */
function w<T = unknown>(name: string): T | undefined {
    return (window as unknown as Record<string, T>)[name];
}

/**
 * Gather the live scene objects (flattened) from `window.scene`.
 *
 * §CONTEXT-DATA-HONESTY — returns `null` (not `[]`) when there is no traversable
 * scene, so the caller can tell "the scene is empty" from "there was no scene".
 */
function gatherSceneObjects(): SceneObjectLike[] | null {
    const scene = w<{ traverse?: (cb: (o: SceneObjectLike) => void) => void }>('scene');
    if (!scene || typeof scene.traverse !== 'function') return null;
    const out: SceneObjectLike[] = [];
    try {
        scene.traverse((o) => out.push({
            name: (o as { name?: string }).name,
            userData: (o as { userData?: Record<string, unknown> }).userData,
        }));
    } catch { return null; }
    return out;
}

/**
 * Gather live element ids from every audited store exposed on `window`.
 *
 * §CONTEXT-DATA-HONESTY — also returns the names that could NOT be read. A store
 * that is absent or whose `getAll()` throws contributes zero ids, which the
 * detector would otherwise read as "this store is clean".
 */
function gatherStoreElements(): { readable: StoreElementIds[]; unreadable: string[] } {
    const readable: StoreElementIds[] = [];
    const unreadable: string[] = [];
    for (const name of AUDITED_STORE_GLOBALS) {
        const store = w<{ getAll?: () => Array<{ id?: unknown }> }>(name);
        if (!store || typeof store.getAll !== 'function') { unreadable.push(name); continue; }
        try {
            const ids = store.getAll()
                .map(e => (e && typeof e.id === 'string' ? e.id : null))
                .filter((id): id is string => id !== null);
            readable.push({ store: name, ids });
        } catch {
            // A store that throws on getAll() is BLIND, not clean.
            unreadable.push(name);
        }
    }
    return { readable, unreadable };
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
    const scene = gatherSceneObjects();
    const { readable, unreadable } = gatherStoreElements();
    return detectLeaks({
        projectId,
        expectedIds: resolveExpectedIds(projectId, emptyHint),
        sceneObjects: scene ?? [],
        sceneReadable: scene !== null,
        storeElements: readable,
        unreadableStores: unreadable,
        globals: gatherGlobalOffenders(),
        scopeProbes: readProjectScopeProbes(),
        // ADR-0298 §2 — the audit is checked against the DECLARATION, not against
        // whatever registered.
        declaredScopes: DECLARED_SCOPES_REQUIRING_PRESENCE,
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
                // §L-676 — SAY WHAT WAS INSPECTED. The previous "✓ loaded clean" line
                // was indistinguishable between "everything was checked and is clean"
                // and "nothing that could have leaked was ever looked at" — which is
                // exactly how the GIS leak survived. Name the scopes.
                // ADR-0298 — `✓ clean` now means "every subsystem we REQUIRE to answer,
                // answered, and none holds foreign state" — not "nobody who spoke up is
                // dirty". Name the declaration it was checked against, and its version,
                // so a log line from the field can be tied to the list in force.
                const scopes = listProjectScopeProbes();
                // L-712 — report ANSWERED / DECLARED, not a tautological N/N. Since every
                // declared owner now registers on import, a declared owner that did not
                // answer means its module was never loaded — which is a fact about
                // coverage worth printing, even though it is not a violation.
                const answered = DECLARED_PROJECT_SCOPE_NAMES.filter(s => scopes.includes(s));
                const notLoaded = DECLARED_PROJECT_SCOPE_NAMES.filter(s => !scopes.includes(s));
                console.log(
                    `[ProjectIsolationAudit] ✓ project ${projectId} loaded clean — ` +
                    `${AUDITED_STORE_GLOBALS.length} stores + scene + ` +
                    `${answered.length}/${DECLARED_PROJECT_SCOPE_NAMES.length} DECLARED scope probe(s) ` +
                    `answered (declaration v${DECLARED_PROJECT_SCOPE_SET_VERSION}) [${answered.join(', ') || 'none'}]` +
                    (notLoaded.length > 0
                        ? ` — ${notLoaded.length} module(s) not loaded, provably empty: [${notLoaded.join(', ')}]`
                        : ''),
                );
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
