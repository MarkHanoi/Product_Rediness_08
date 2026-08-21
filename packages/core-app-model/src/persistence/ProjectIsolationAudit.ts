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
 *   6. §C13-AUDIT-BLIND-CLASSES — a COALESCED INSTANCED ROOT
 *      (`InstancedMeshCoalescer`) whose `coalescedKey` names a level outside the
 *      loaded project. It carries no element id at all, only the level — and the
 *      level is enough, because §L-711 put `snapshot.levels` in the expectation.
 *
 * §C13-AUDIT-BLIND-CLASSES — WHAT THIS AUDIT STRUCTURALLY CANNOT SEE. The scene
 * half of this audit traverses exactly ONE graph, `window.scene`. The running app
 * holds at least three more (Cesium's `viewer.scene.primitives`, the furniture
 * carousel's private `THREE.Scene`, the drag-drop `indicatorScene`) — see
 * {@link SCENE_GRAPHS_NOT_TRAVERSED}, which is printed next to EVERY verdict,
 * clean or violating, so no count of "scene roots" can be read as a count of
 * everything on screen. Attribution below a scene root is by INHERITANCE and is
 * counted, never asserted: nothing in a scene graph distinguishes a wall's
 * legitimately-unstamped layer mesh from a foreign group parented under that wall,
 * which is exactly why `views.mountedDrawing` needed a declared PROBE rather than
 * a sweep.
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
        /** §STARTUP-C13-IDENTITY (founder 2026-08-10) — human-readable WHO for each
         *  leaked id (`"<id> ⇐ <elementType> \"<scene name>\""`), so the collapsed
         *  console line names the culprit without devtools expansion. Report-only:
         *  the audit still never auto-repairs (ADR-0298). Only `scene.foreignElement`
         *  populates this today; `details` keeps its bare-id shape (pinned by tests +
         *  downstream consumers). */
        identities?: string[];
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
    /**
     * §C13-SCENE-ROOT-COVERAGE — THREE's `Object3D.type` discriminator ('Mesh',
     * 'Group', 'LineSegments', 'DirectionalLight', …). Read structurally; no THREE
     * import (P5). Optional so existing call sites and unit tests keep compiling.
     */
    type?: string;
    /** True when this object is a DIRECT child of the scene (a scene ROOT). */
    isRoot?: boolean;
    /**
     * §C13-AUDIT-BLIND-CLASSES — true when some ANCESTOR of this object carries an
     * element id, so this object's attribution is INHERITED from that ancestor and
     * was never checked on its own.
     *
     * The coverage floor inspects scene ROOTS. Everything below a root is attributed
     * by inheritance, which is correct for a wall's layer meshes and WRONG for a
     * foreign group that happens to have been parented under an owned element — and
     * nothing in the scene graph distinguishes the two (this is precisely why
     * `views.mountedDrawing` needed a declared PROBE rather than a scene sweep).
     * The audit therefore does not invent a violation for them; it COUNTS them, so
     * "N/M roots" can never be read as "M objects were checked".
     */
    attributedByAncestor?: boolean;
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

// ── §C13-SCENE-ROOT-COVERAGE — what the scene tripwire STILL cannot see ──────
//
// Everything above this line inspects objects that carry `userData.id`/`elementId`
// AND a type. That is the BIM half of the scene, and it is a minority of it. The
// founder's 2026-08-10 report is the proof: the console said
// `[C13 VIOLATION] … 1 finding(s): [scene.foreignElement×1]` while the viewport
// showed a whole black plan-linework drawing and several floating grey boxes. The
// audit was not wrong about the one element it named — it simply never looked at
// anything else, and a count of 1 over a scene full of foreign geometry reads as
// "almost clean". That is the §CONTEXT-DATA-HONESTY defect in its purest form: an
// under-counting audit is more dangerous than no audit, because the number looks
// like a measurement.
//
// The honest repair is NOT to invent a violation for every unrecognised object —
// scene roots legitimately include lights, cameras, helpers, the grid and the sky,
// and an audit that cries wolf on a clean switch gets muted, which costs the same
// as under-counting. It is to SAY, on every run, how many scene roots the audit
// could not attribute to a project, and name them. That number is a fact about the
// audit's own coverage, printed next to its verdict, so "clean" can never again be
// read as "everything was checked".
//
// Once a root's owner is known it should either publish its ids into the loader
// expectation (like `snapshot.lighting` in §L-711) or register a
// {@link ProjectScopeProbe}; either way it stops being unattributed and the number
// falls. The number IS the remaining C13 debt, measured rather than estimated.

/** THREE object types that can carry visible geometry (and so can leak visibly). */
const GEOMETRY_BEARING_TYPES: ReadonlySet<string> = new Set([
    'Mesh', 'InstancedMesh', 'BatchedMesh', 'SkinnedMesh',
    'Line', 'LineSegments', 'LineLoop', 'Points', 'Sprite',
    'Group', 'Object3D',
]);

/**
 * §C13-AUDIT-BLIND-CLASSES — scene graphs this sweep STRUCTURALLY CANNOT REACH.
 *
 * `gatherSceneObjects()` traverses exactly ONE graph: `window.scene`. The word
 * "scene" in the coverage line therefore over-claims — the running app holds at
 * least three more object graphs, each of which has already been observed holding
 * the previous project's state. Naming them next to the count is the only thing
 * that stops "N/M scene roots" being read as "N/M of everything on screen".
 *
 * DECLARED, not sniffed, for the same reason `declaredProjectScopes.uncounted` is:
 * an exclusion you cannot count is indistinguishable from a check you deleted.
 */
export const SCENE_GRAPHS_NOT_TRAVERSED: readonly string[] = [
    // apps/editor/src/ui/geospatial/CesiumViewport.ts — six `scene.primitives.add()`
    // sites (tilesets, placed massing models, context layers). A Cesium
    // PrimitiveCollection is a SECOND renderer's graph: it is not reachable from
    // `window.scene` and exposes no `.traverse()`. Covered ONLY by the
    // `gis.cesiumViewport` probe, which counts EIGHT NAMED FIELDS — not primitives.
    'cesium viewer.scene.primitives (probe gis.cesiumViewport counts 8 named fields, NOT primitives)',
    // apps/editor/src/ui/furniture-carousel/FloatingObjectCarousel.ts:305 — its own
    // `new THREE.Scene()`. Its GLB-404 handler (:427) adds a completely unstamped
    // grey box to it.
    'apps/editor furniture-carousel private THREE.Scene (GLB-404 fallback boxes)',
    // apps/editor/src/ui/furniture-carousel/FurnitureDragDropHandler.ts — `indicatorScene`.
    'apps/editor FurnitureDragDropHandler indicatorScene',
];

export interface SceneCoverage {
    /** Direct children of the scene that were inspected. */
    readonly rootCount: number;
    /** Geometry-bearing roots the audit could not attribute to any project. */
    readonly unattributed: readonly string[];
    /**
     * Non-root objects whose attribution is INHERITED from an id-bearing ancestor
     * and which were therefore never checked individually. See
     * {@link SceneObjectLike.attributedByAncestor}.
     */
    readonly inheritedCount: number;
    /** {@link SCENE_GRAPHS_NOT_TRAVERSED}, carried so every renderer of a verdict
     *  states the limitation without having to remember to. */
    readonly excludedGraphs: readonly string[];
}

/**
 * §C13-AUDIT-BLIND-CLASSES — the ONE predicate for "this object carries an identity
 * the id-based checks will actually act on".
 *
 * It must be the SAME predicate `detectLeaks` gates its scene check on, or objects
 * fall through the seam between the two functions and VANISH — reported by neither.
 * Measured on current main before this fix: a root stamped `{ id, levelId }` and no
 * type produced NO finding AND NO unattributed entry, because `detectLeaks` skipped
 * it as untyped while `summariseSceneCoverage` waved it through as "attributed by
 * id". That is the Class-E under-counting defect in one line of disagreement.
 */
function isIdAttributable(ud: Record<string, unknown>): boolean {
    return sceneElementId(ud) !== null && sceneElementType(ud) != null;
}

/**
 * §C13-AUDIT-BLIND-CLASSES — name the CLASS of a root the audit cannot attribute.
 *
 * The audit cannot say WHOSE an unattributed root is. It can very often say WHAT it
 * is, and a floor that reads `Mesh (unnamed)` three times is far harder to act on
 * than one that reads `coalesced instanced root`. Keyed on the stamps the production
 * builders really write, cited by file:line so a rename breaks the classification
 * rather than silently degrading it back to `(unnamed)`.
 */
function classifyUnattributedRoot(ud: Record<string, unknown>, type: string, name: string): string {
    // packages/scene-committer/src/InstancedMeshCoalescer.ts:326 / :417
    if (ud.isCoalesced === true) return 'coalesced instanced root';
    // packages/core-app-model/src/rendering/LevelMassingRenderer.ts:296
    if (ud.isMassingLod === true) return 'level massing LOD';
    if (ud.isHelper === true) return 'render helper';
    // packages/room-topology/src/RoomLabelRenderer.ts:57 — `userData.type='room-label'`
    if (ud.type === 'room-label' || ud.roomId != null) return 'room label sprite';
    if (type === 'Sprite') return 'label sprite';
    // apps/editor/src/ui/site/ParcelBoundarySceneRenderer.ts:388
    if (ud.isBuildableEnvelopeVolume === true) return 'buildable envelope volume';
    if (type === 'LineSegments' || type === 'Line' || type === 'LineLoop') return 'linework';
    if (name.length === 0 && Object.keys(ud).length === 0) return 'UNSTAMPED';
    return 'unclassified';
}

/**
 * Summarise how much of the scene the id-based checks could actually attribute.
 * PURE — no window, no THREE. A root is "attributed" when it carries an element id
 * AND a type (the predicate `detectLeaks` acts on), or is one of the declared exempt
 * singletons; anything else is geometry the audit is blind to, and is named — and
 * now CLASSIFIED — here rather than silently counted as clean.
 */
export function summariseSceneCoverage(sceneObjects: Iterable<SceneObjectLike>): SceneCoverage {
    let rootCount = 0;
    let inheritedCount = 0;
    const unattributed: string[] = [];
    for (const obj of sceneObjects) {
        if (obj.isRoot !== true) {
            // §C13-AUDIT-BLIND-CLASSES — a descendant of an id-bearing root is
            // attributed by INHERITANCE and never checked. Count it; do not accuse
            // it (a wall's layer meshes are legitimately unstamped, and an audit that
            // cries wolf on every part mesh gets muted, which costs what
            // under-counting costs).
            if (obj.attributedByAncestor === true) inheritedCount += 1;
            continue;
        }
        rootCount += 1;
        const ud = (obj.userData ?? {}) as Record<string, unknown>;
        if (isExemptSceneSingleton(ud)) continue;
        if (isIdAttributable(ud)) continue;                    // attributed by id + type
        if (!GEOMETRY_BEARING_TYPES.has(obj.type ?? '')) continue; // lights/cameras/helpers
        const type = obj.type ?? 'Object3D';
        const name = obj.name ?? '';
        const klass = classifyUnattributedRoot(ud, type, name);
        unattributed.push(`${type}${name ? ` "${name}"` : ' (unnamed)'} [${klass}]`);
    }
    return {
        rootCount,
        unattributed,
        inheritedCount,
        excludedGraphs: SCENE_GRAPHS_NOT_TRAVERSED,
    };
}

/**
 * §C13-AUDIT-BLIND-CLASSES — the limitation clause EVERY verdict carries.
 *
 * Printed unconditionally, on the clean path and the violation path alike, because
 * the graphs below are excluded on every run regardless of what was found in the one
 * graph that was traversed.
 */
function formatExcludedGraphs(c: SceneCoverage): string {
    // The exclusion is UNCONDITIONAL — it holds on every run regardless of what the
    // caller passed. A caller that omits the field must not thereby receive a SHORTER,
    // over-claiming verdict, so fall back to the declaration rather than to silence.
    const graphs = Array.isArray(c.excludedGraphs) ? c.excludedGraphs : SCENE_GRAPHS_NOT_TRAVERSED;
    const inherited = (typeof c.inheritedCount === 'number' ? c.inheritedCount : 0) > 0
        ? ` · ${c.inheritedCount} descendant(s) attributed BY INHERITANCE from an id-bearing ancestor, never checked individually`
        : '';
    return (
        `${inherited} · this count covers ONE scene graph (window.scene) and EXCLUDES ` +
        `${graphs.length} graph(s) it cannot traverse: [${graphs.join('; ')}]`
    );
}

/** Render {@link SceneCoverage} as the honesty clause appended to every verdict. */
export function formatSceneCoverage(c: SceneCoverage): string {
    const head = c.rootCount === 0
        ? ' — scene had NO roots to inspect'
        : c.unattributed.length === 0
            ? ` — all ${c.rootCount} scene root(s) attributable`
            : (
                ` — ⚠ ${c.unattributed.length}/${c.rootCount} scene root(s) UNATTRIBUTED, i.e. outside this ` +
                `audit's reach, neither proven clean nor proven leaked: [${c.unattributed.slice(0, 8).join(', ')}` +
                `${c.unattributed.length > 8 ? `, +${c.unattributed.length - 8} more` : ''}]`
            );
    return head + formatExcludedGraphs(c);
}

/**
 * §C13-AUDIT-BLIND-CLASSES — the level a coalesced instanced root belongs to.
 *
 * `packages/scene-committer/src/InstancedMeshCoalescer.ts:303` builds the key as
 *
 *     const key = `${levelId}:${geoUUID}:${matUUID}`;
 *
 * and stamps it on the merged root (`:327`, `:418`) before `scene.add(merged)`. So
 * the merged root is NOT unattributable: the owning LEVEL is written on it in plain
 * text, and levels ARE part of the loader expectation (§L-711 put `snapshot.levels`
 * there alongside `snapshot.lighting`). The audit simply never read it.
 *
 * This is the one blind class of the five that closes with a real ATTRIBUTION rather
 * than a bigger floor. Returns null when the key is absent or malformed — in which
 * case the root falls through to the unattributed floor, which is the honest answer.
 *
 * NOTE the geometry/material UUIDs are v4 UUIDs containing no ':' , and levelId is a
 * UUID likewise, so the FIRST segment is the level. Split defensively anyway.
 */
function coalescedLevelId(ud: Record<string, unknown>): string | null {
    if (ud.isCoalesced !== true) return null;
    const key = ud.coalescedKey;
    if (typeof key !== 'string') return null;
    const levelId = key.split(':')[0];
    return levelId && levelId.length > 0 ? levelId : null;
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
    // §C13-LINKED-MODEL-ARM (ADR-0346 D3 / C13 §3.13, L-2900) — a LINKED MODEL
    // subtree whose HOST is not the loaded project.
    //
    // A linked model is the ONE sanctioned cross-project surface in this repository:
    // project B's building drawn read-only inside project A. C13 §3.13 makes it legal
    // only when it is TAGGED, never when it is EXEMPTED — §3.10's rule is that a clean
    // verdict that never looked is worse than no verdict.
    //
    // Note this arm ADDS coverage and weakens nothing. The link subtree deliberately
    // carries NO `userData.id` and NO `type`, so `sceneElementId`/`sceneElementType`
    // return null for it and the element-id arm below never saw it in the first place:
    // there is no exemption anywhere in this file for a link, and `isExemptSceneSingleton`
    // is untouched. Without this arm the subtree would be invisible — the C13 §7.5
    // LINEWORK gap, reproduced. With it, a link mounted under the WRONG host is a
    // finding, exactly as any other cross-project residue is.
    //
    // §7.4 rule 3 — ROOT-SCOPED. `pryzmLinkId` is stamped on the subtree root AND on
    // its instanced mesh (so the perf census can attribute cost per link); matching
    // unscoped would report one finding per mesh and bury every other finding, which is
    // exactly what the IFC arm above had to be corrected for.
    //
    // §7.4 rule 1 — the PRODUCER of this shape is
    // `apps/editor/src/engine/links/LinkedModelSceneRenderer.ts` (`_mountLink`), and the
    // fixture in the test suite is copied from it by file:line, never written to match
    // this detector.
    let foreignLinkCount = 0;
    const foreignLinkIdentity: string[] = [];
    // §C13-SCENE-ID-KEY — deduped so a wall's root + its N part meshes (which all
    // carry the SAME id) count as ONE foreign element, not N.
    const foreignSceneIdSet = new Set<string>();
    // §STARTUP-C13-IDENTITY — first-seen identity per foreign id (type + scene name),
    // so the report can NAME the leaked object, not just number it.
    const foreignSceneIdentity = new Map<string, string>();
    // §C13-AUDIT-BLIND-CLASSES — coalesced instanced roots whose key names a level
    // the loaded project does not have. Deduped by key: one merged root per
    // (level × geometry × material), and a project switch leaves several.
    const foreignCoalesced = new Map<string, string>();

    for (const obj of sceneObjects) {
        const ud = (obj.userData ?? {}) as Record<string, unknown>;
        const name = (obj.name ?? '') as string;

        // §UND-VIEW-SCOPE (L-1197) — THE UNDERLAY DETECTOR WAS UNSATISFIABLE.
        // It keyed on `name.startsWith('FloorPlanUnderlay')` or `ud.isFloorPlanUnderlay`.
        // Grep both across the repo: the ONLY producers are this file's own two test
        // suites, which PLANT them. The real underlay — `FloorPlanUnderlayTool.create()`,
        // packages/input-host — sets NO `name` at all and stamps
        // `{ id, type:'floor_plan_underlay', isUnderlay:true, isNonBIM:true, … }`.
        // So `underlayCount` could never be non-zero in production: the audit had a
        // green light wired to a bulb it never installed, and its tests passed against a
        // shape production does not emit (the [[fake-more-capable-than-real]] defect).
        //
        // Attribution: the real shape is counted only when it is FOREIGN — i.e. it does
        // not carry the loaded project's id. `UnderlayPersistence.restoreUnderlayForProject`
        // stamps `userData.projectId`, so THIS project's legitimately restored underlay is
        // not a leak, while Project A's mesh surviving a switch into Project B is. The two
        // legacy planted shapes keep their unconditional reading (they carry no projectId,
        // so they remain foreign) — no existing assertion moves.
        const isRealUnderlayShape =
            ud.isUnderlay === true || ud.type === 'floor_plan_underlay';
        const underlayOwner = typeof ud.projectId === 'string' ? ud.projectId : null;
        if (
            name.startsWith('FloorPlanUnderlay') ||
            ud.isFloorPlanUnderlay === true ||
            (isRealUnderlayShape && underlayOwner !== projectId)
        ) {
            underlayCount += 1;
        }
        // §AUDIT-UNSATISFIABLE-COUNTERS (L-1225) — THE SECOND DEAD COUNTER IN THIS
        // FILE, FOUND BY APPLYING L-1197's SUSPICION TO EVERY ARM RATHER THAN ONE.
        //
        // This read `isIfcGroup || isIFCModel || ifcModelId`. Grep all three across the
        // repo: the ONLY producers are this file's own two test suites. What production
        // actually stamps is `packages/file-format/src/import/ifc/IfcGeometryRenderer.ts`
        //   :66   group.userData = { modelId, name, source: 'ifc-import' }
        //   :195  mesh.userData  = { …, source: 'ifc-import' }
        // — `modelId`, not `ifcModelId`, and `source`, not `isIfcGroup`. The rest of the
        // app reads the REAL key (`initScene.ts:1247`, `PlanViewManager.ts:858`,
        // `SectionViewService.ts:168`, `EdgeProjectorService.ts:2151` all match
        // `userData.source === 'ifc-import'`); only the audit invented its own.
        //
        // So `ifcCount` could never be non-zero in production — and IFC groups have NO
        // project-switch teardown (`importedIfcGroups` in `initUI.ts:1029` is a session
        // Map with no declared scope), which is precisely the leak this arm exists to
        // catch. The surface most likely to hold residue was the surface that could not
        // report it.
        //
        // Attribution mirrors the underlay arm (L-1197): counted only when the group
        // does not name the loaded project. `initUI` stamps `projectId` at import.
        //
        // Counted at the MODEL ROOT only. `source:'ifc-import'` is stamped on the group
        // AND on every mesh inside it (:66 and :195), so an un-scoped match would report
        // one leak per triangle-bearing mesh — thousands — and bury every other finding.
        // The root is the direct scene child; its meshes are separately covered by the
        // element-id arm below, which is where a per-element leak belongs.
        const isRealIfcRoot = obj.isRoot === true && ud.source === 'ifc-import';
        const ifcOwner = typeof ud.projectId === 'string' ? ud.projectId : null;
        if (
            ud.isIfcGroup === true ||
            ud.isIFCModel === true ||
            ud.ifcModelId != null ||
            (isRealIfcRoot && ifcOwner !== projectId)
        ) {
            ifcCount += 1;
        }
        if (ud.isDxfOverlay === true || ud.dxfId != null) {
            dxfCount += 1;
        }
        // §C13-LINKED-MODEL-ARM — see the counter declaration above for the reasoning.
        const isRealLinkRoot = obj.isRoot === true && typeof ud.pryzmLinkId === 'string';
        if (isRealLinkRoot) {
            const linkHost = typeof ud.pryzmLinkHostProjectId === 'string'
                ? (ud.pryzmLinkHostProjectId as string)
                : null;
            if (linkHost !== projectId) {
                foreignLinkCount += 1;
                const src = typeof ud.pryzmLinkSourceProjectId === 'string'
                    ? (ud.pryzmLinkSourceProjectId as string)
                    : '<source-unknown>';
                // "held by nobody" and "held by another project" are different facts and
                // must not print the same — §CONTEXT-DATA-HONESTY.
                foreignLinkIdentity.push(
                    `${String(ud.pryzmLinkId)} ⇐ linked model of ${src}, host `
                    + `${linkHost ?? '<unstamped>'} ≠ loaded ${projectId}`,
                );
            }
        }
        // §C13-AUDIT-BLIND-CLASSES — a coalesced instanced root whose key names a
        // level outside the loaded project is Project A's merged geometry, still
        // drawn. Independent of the element-id path: the merged root carries no
        // element id at all, only the level.
        if (idKnown) {
            const lvl = coalescedLevelId(ud);
            if (lvl !== null && !expectedIds!.has(lvl)) {
                const key = String(ud.coalescedKey);
                if (!foreignCoalesced.has(key)) {
                    foreignCoalesced.set(key, `level ${lvl} ⇐ coalesced instanced root (key ${key})`);
                }
            }
        }
        // A BIM element whose id is NOT part of the loaded project is foreign.
        if (idKnown && !isExemptSceneSingleton(ud)) {
            const id = sceneElementId(ud);
            if (id !== null && sceneElementType(ud) != null && !expectedIds!.has(id)) {
                foreignSceneIdSet.add(id);
                // §STARTUP-C13-IDENTITY — keep the first-seen identity (the root usually
                // scans before its part meshes; any of them names the same element).
                if (!foreignSceneIdentity.has(id)) {
                    foreignSceneIdentity.set(
                        id,
                        `${id} ⇐ ${String(sceneElementType(ud))}${name ? ` "${name}"` : ''}`,
                    );
                }
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
    if (foreignLinkCount > 0)     findings.push({ surface: 'scene.linkedModel',     count: foreignLinkCount, details: foreignLinkIdentity.slice(0, 20), identities: foreignLinkIdentity.slice(0, 20) });
    if (foreignSceneIds.length)   findings.push({ surface: 'scene.foreignElement',  count: foreignSceneIds.length, details: foreignSceneIds.slice(0, 20), identities: foreignSceneIds.slice(0, 20).map(id => foreignSceneIdentity.get(id) ?? id) });
    if (foreignCoalesced.size)    findings.push({ surface: 'scene.foreignCoalescedRoot', count: foreignCoalesced.size, details: [...foreignCoalesced.keys()].slice(0, 20), identities: [...foreignCoalesced.values()].slice(0, 20) });
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

/** Structural view of a traversable THREE.Object3D graph — no THREE import (P5). */
interface TraversableNode {
    name?: string;
    type?: string;
    parent?: unknown;
    userData?: Record<string, unknown>;
    traverse?: (cb: (o: TraversableNode) => void) => void;
}

/**
 * §C13-AUDIT-BLIND-CLASSES — does any ancestor of `node` (up to, but excluding, the
 * scene) carry an element identity? If so this object is attributed by INHERITANCE.
 * Bounded so a cyclic or absurdly deep graph cannot hang the audit.
 */
function hasIdBearingAncestor(node: TraversableNode, scene: TraversableNode): boolean {
    let p = node.parent as TraversableNode | undefined;
    for (let depth = 0; p != null && p !== scene && depth < 256; depth += 1) {
        const ud = (p.userData ?? {}) as Record<string, unknown>;
        if (sceneElementId(ud) !== null) return true;
        p = p.parent as TraversableNode | undefined;
    }
    return false;
}

/**
 * Flatten a THREE scene graph into the audit's structural view.
 *
 * EXPORTED so the injection experiment can drive the REAL traversal against a REAL
 * THREE.Scene. Pinning the detector against a hand-written object literal is the
 * §C13-SCENE-ID-KEY mistake — the positive control then validates the detector
 * against the detector's own model of the world rather than against the world.
 *
 * §CONTEXT-DATA-HONESTY — returns `null` (not `[]`) when there is no traversable
 * scene, so the caller can tell "the scene is empty" from "there was no scene".
 */
export function collectSceneObjects(sceneRoot: unknown): SceneObjectLike[] | null {
    const scene = sceneRoot as TraversableNode | undefined;
    if (!scene || typeof scene.traverse !== 'function') return null;
    const out: SceneObjectLike[] = [];
    try {
        scene.traverse((o) => {
            // `traverse` visits the scene itself first; it is not a root OF the scene.
            if (o === scene) return;
            const isRoot = o.parent === scene;
            out.push({
                name: o.name,
                userData: o.userData,
                // §C13-SCENE-ROOT-COVERAGE — carried so the audit can report the
                // scene it CANNOT attribute, not only the elements it recognises.
                type: o.type,
                isRoot,
                // §C13-AUDIT-BLIND-CLASSES — walk to the scene, so the coverage line
                // can state how much of the graph it never checked individually.
                attributedByAncestor: isRoot ? false : hasIdBearingAncestor(o, scene),
            });
        });
    } catch { return null; }
    return out;
}

/** Gather the live scene objects (flattened) from `window.scene`. */
function gatherSceneObjects(): SceneObjectLike[] | null {
    return collectSceneObjects(w('scene'));
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

function runAudit(
    projectId: string,
    emptyHint: boolean,
): { report: IsolationLeakReport | null; coverage: SceneCoverage } {
    const scene = gatherSceneObjects();
    const { readable, unreadable } = gatherStoreElements();
    const coverage = summariseSceneCoverage(scene ?? []);
    const report = detectLeaks({
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
    return { report, coverage };
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
            const { report, coverage } = runAudit(projectId, emptyHint);
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
                        : '') +
                    // §C13-SCENE-ROOT-COVERAGE — "clean" is only a verdict about what
                    // was inspected. State the scene the audit could not attribute in
                    // the SAME breath, so the word never over-claims again.
                    formatSceneCoverage(coverage),
                );
                return;
            }
            _leakHistory.push(report);
            (window as unknown as { __pryzmIsolationLeaks?: IsolationLeakReport[] }).__pryzmIsolationLeaks = _leakHistory;

            // §L-820 — name the leaking SURFACE(S) in the message string itself. The
            // production console showed "[C13 VIOLATION] … Array(1)" collapsed, so the
            // one fact that matters — WHICH surface leaked (a scene underlay? a store
            // id? a GIS scope probe?) — was invisible without expanding the object in
            // devtools nobody had open. The structured findings still follow for
            // detail; the summary makes the collapsed line self-sufficient.
            // §STARTUP-C13-IDENTITY (founder 2026-08-10) — when a finding carries
            // identities (scene.foreignElement), put the first few IN the string, so the
            // empty-first-load `scene.foreignElement×1` names its culprit right in the
            // collapsed line. Report-only — the audit never auto-repairs (ADR-0298).
            const surfaceSummary = report.findings
                .map((f) => {
                    const who = Array.isArray(f.identities) && f.identities.length > 0
                        ? ` (${f.identities.slice(0, 3).join('; ')}${f.count > 3 ? '; …' : ''})`
                        : describeFindingDetails(f);
                    return `${f.surface}×${f.count}${who}`;
                })
                .join(', ');
            console.error(
                `[C13 VIOLATION] Project-isolation leak detected on load of ${projectId} — ` +
                `${report.findings.length} finding(s): [${surfaceSummary}]` +
                // §C13-SCENE-ROOT-COVERAGE — a violation count is a FLOOR, not a total.
                // The same clause that qualifies "clean" must qualify the number, or the
                // founder reads `×1` over a scene full of foreign geometry as "almost fine".
                `${formatSceneCoverage(coverage)}\n`,
                report.findings,
            );
            window.dispatchEvent(new CustomEvent('pryzm-project-isolation-leak', { detail: report }));
        });
    });

    console.log('[ProjectIsolationAudit] Installed — will audit every project load (typed runtime.events)');
}

/**
 * §STARTUP-C13-IDENTITY — name the culprit of a finding that carries no `identities`.
 *
 * `scene.foreignElement` names its elements; every other surface used to collapse to
 * `surface×N` in the console, so `store.foreignElement×74` did not say WHICH store and
 * `scope.foreignProject×1` did not say which project it still belonged to — the one
 * fact that identifies the outgoing project. Report-only; ADR-0298's no-auto-repair
 * rule is untouched.
 */
function describeFindingDetails(f: IsolationLeakReport['findings'][number]): string {
    const d = f.details;
    if (d == null) return '';
    // store.foreignElement — [{ store, ids }]
    if (Array.isArray(d) && d.length > 0 && typeof d[0] === 'object' && d[0] !== null && 'store' in (d[0] as object)) {
        const rows = d as Array<{ store: string; ids: string[] }>;
        return ` (${rows.slice(0, 3).map(r => `${r.store}: ${r.ids.slice(0, 2).join(', ')}${r.ids.length > 2 ? ', …' : ''}`).join('; ')})`;
    }
    // scope.foreignProject — [{ scope, owningProjectId }]
    if (Array.isArray(d) && d.length > 0 && typeof d[0] === 'object' && d[0] !== null && 'owningProjectId' in (d[0] as object)) {
        const rows = d as Array<{ scope: string; owningProjectId: string }>;
        return ` (${rows.slice(0, 3).map(r => `${r.scope} still owned by ${r.owningProjectId}`).join('; ')})`;
    }
    // scope.probeFailed — [{ scope, error }]
    if (Array.isArray(d) && d.length > 0 && typeof d[0] === 'object' && d[0] !== null && 'error' in (d[0] as object)) {
        const rows = d as Array<{ scope: string; error: string }>;
        return ` (${rows.slice(0, 3).map(r => `${r.scope}: ${r.error}`).join('; ')})`;
    }
    // window.globals — string[]
    if (Array.isArray(d) && d.every(x => typeof x === 'string')) {
        return ` (${(d as string[]).slice(0, 3).join('; ')})`;
    }
    return '';
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
