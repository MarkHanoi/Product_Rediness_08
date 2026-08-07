/**
 * declaredProjectScopes — ADR-0298 §PROBE-SET-DECLARED.
 *
 * THE DECLARED EXPECTED PROBE SET. The single place that says which subsystems
 * MUST hold a project-isolation probe, why, what each one must RESET, and what
 * its probe must COUNT before it is allowed to answer `null`.
 *
 * Contract: C13 §3.10 (named owners; the audit enumerates OWNERS, not symptoms).
 * ADR:      docs/02-decisions/adrs/ADR-0298-isolation-probes-are-declared-not-discovered.md
 * Related:  ADR-0292 (no tool reports a result it cannot verify against external
 *           ground truth) — this list IS that external ground truth for the audit.
 * Gate:     tools/ga-gate/check-declared-project-scopes.ts
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * `ProjectIsolationAudit` used to derive its population from the thing under
 * review: it asked every REGISTERED probe whether it was dirty. A subsystem that
 * registered nothing was not reported as unknown — it was absent from the report
 * entirely, and the audit printed `✓ loaded clean`. That has now failed four
 * times in the same family:
 *
 *   §L-676  the GIS/site half had no owner at all      → PRESENCE gap
 *   L-694a  `ui/layout/` was outside the swept dirs    → PRESENCE gap
 *   L-694b  `CesiumViewport`'s probe modelled fields   → COMPLETENESS gap
 *           `resetProjectScopedState` cleared, but it
 *           never counted the CAMERA SEAT — the one
 *           thing the founder could actually see
 *   L-711   `ProjectLoader`'s expected-id set omitted  → COMPLETENESS gap
 *           `snapshot.lighting`, so every restored light
 *           was reported as a "FOREIGN root from a prior
 *           project" in a fresh session with no prior project
 *
 * Two of those four are COMPLETENESS failures, not presence failures. Which is
 * why this declaration carries `resets` and `counts`, not merely a name.
 *
 * ── ADR-0298's OPEN QUESTION, DECIDED: YES, AND STATICALLY ───────────────────
 *
 * ADR-0298 left open whether the declared set should also carry WHAT each owner
 * must reset. It must, and the third and fourth data points settle it: presence
 * checking alone would not have caught half of this family.
 *
 * But completeness cannot be checked at RUNTIME. Asking a probe "did you look at
 * everything?" derives the answer from the probe again — the exact circularity
 * ADR-0298 rejects, one level up. It CAN be checked STATICALLY, because this file
 * is an INDEPENDENT source of truth about the owner, authored separately from it.
 *
 * So each entry carries identifier lists checked as source text against the
 * owning module by the GA gate:
 *
 *   • `resets`   — identifiers the owner's clear/reset path MUST contain.
 *   • `counts`   — identifiers `owningProjectId()` MUST read before answering.
 *   • `uncounted`— reset identifiers deliberately NOT counted, each with a reason.
 *
 * and the gate enforces `resets ⊆ counts ∪ uncounted`: **every field you reset is
 * either counted by the probe, or you have written down why not.** That is the
 * machine-checkable form of "a null answer must be earned", and it is exactly
 * L-694b: `cameraSeatedAt` was reset and not counted, so the probe answered
 * `null` — truthfully about its own model, falsely about the world. Under this
 * rule that omission is a red gate, and it requires no insight to catch.
 *
 * ── PRESENCE, AND WHY ABSENCE IS NOT ALWAYS CLEAN ────────────────────────────
 *
 * `presence` records WHERE registration happens, and it is load-bearing:
 *
 *   'module-scope'   — registered as an import side effect. If the module is in
 *                      the heap it HAS registered; if it never loaded it holds no
 *                      state. Absence is therefore PROVEN clean by construction,
 *                      and the audit reports it as "not loaded", not a violation.
 *   'instance-scope' — registered inside a constructor or a mount/install
 *                      function. Absence is INDISTINGUISHABLE between "never
 *                      constructed" (clean) and "constructed, registration
 *                      skipped or thrown" (a leak). Absence is UNPROVEN, and the
 *                      audit MUST report it as a C13 violation.
 *
 * ── L-712 — THE PRESENCE DEBT IS PAID ───────────────────────────────────────
 *
 * v1 of this list declared all five owners `instance-scope`. That was the honest
 * state of the codebase, and it is why `096e12b4` could say "1 GIS scope(s) had NO
 * registered owner … teardown complete" in one breath. It also meant the founder saw
 * `teardown INCOMPLETE [gis.cesiumViewport]` on EVERY project switch — the audit
 * correctly refusing to certify a viewport it could not see, on a switch that was in
 * fact perfectly clean because no globe had ever been opened.
 *
 * v2 moves all five to `module-scope`. The pattern in each case is the same and is
 * worth naming, because it is the general answer to "how do you prove absence?":
 *
 *   THE OWNER OF PROJECT-SCOPED STATE IS THE MODULE, NOT THE INSTANCE.
 *   A module can always answer — it knows how many instances it has made, including
 *   zero. An instance cannot answer on behalf of an instance that was never built.
 *
 * Concretely: `CesiumViewport` registers once at import and folds over a live-viewport
 * `Set`; `GISAreaLayout` registers once at import over a delegate that `mountGISArea`
 * installs; `siteProjectScope` registers once at import and resolves its runtime
 * lazily. In all three, absence now means exactly one thing — the module was never
 * imported — and a module that was never imported holds nothing.
 *
 * `DECLARED_SCOPES_REQUIRING_PRESENCE` is consequently empty, and that is CORRECT,
 * not a weakening: the runtime check it feeds existed to catch UNPROVABLE absence,
 * and there is none left to catch. The invariant is now enforced STATICALLY instead —
 * the GA gate requires every declared owner's registration to sit at column 0 of its
 * module. If a future owner registers from a constructor again, it must declare
 * `instance-scope`, it must be baselined as debt, and the runtime check turns back on
 * for it automatically.
 */

/** Where a scope's probe/registry registration is executed. See the header. */
export type ProjectScopePresence = 'module-scope' | 'instance-scope';

export interface DeclaredProjectScope {
    /** The probe key AND the `projectScopeRegistry` scopeName. One name, one owner. */
    readonly scope: string;
    /** Repo-relative path of the module that owns the state and registers the probe. */
    readonly module: string;
    /** Why this subsystem holds project-scoped state that survives a switch. */
    readonly why: string;
    /** Where registration happens — determines whether ABSENCE is a violation. */
    readonly presence: ProjectScopePresence;
    /**
     * Identifiers the owner's clear/reset path MUST contain, as literal source
     * substrings. Checked against `module` by the GA gate, so a rename or a
     * deletion of a reset step fails CI rather than silently narrowing teardown.
     */
    readonly resets: readonly string[];
    /**
     * Identifiers `owningProjectId()` MUST read before it may answer `null`.
     * Checked against `module` the same way.
     */
    readonly counts: readonly string[];
    /**
     * Reset identifiers deliberately NOT counted by the probe, each mapped to the
     * reason. The gate enforces `resets ⊆ counts ∪ keys(uncounted)` — you may
     * leave a reset field uncounted, but only in writing.
     */
    readonly uncounted: Readonly<Record<string, string>>;
}

/**
 * Bumped whenever an entry is added or removed, or a `resets`/`counts` list
 * changes. The runtime audit stamps this into its report, so a leak report from
 * the field can be tied to the declaration that was in force when it was written.
 */
export const DECLARED_PROJECT_SCOPE_SET_VERSION = 2;

/**
 * ADR-0298 §1 — the declared expected probe set.
 *
 * Adding a subsystem that holds project-scoped state is a DELIBERATE edit to this
 * list, reviewable in a diff. A probe registered without an entry here fails the
 * GA gate; an entry here whose module does not register fails the gate too. New
 * subsystems are born declared or born failing — never born invisible.
 */
export const DECLARED_PROJECT_SCOPES: readonly DeclaredProjectScope[] = [
    {
        scope: 'site.model',
        module: 'apps/editor/src/ui/site/siteProjectScope.ts',
        why: 'The C19 SiteModelStore holds the live parcel, boundary and location for '
            + 'the open project. It is a runtime singleton that survives a switch, and '
            + 'C19 §1.11 requires reset() to be called from the C13 teardown.',
        presence: 'module-scope',
        resets: ['resolveSiteModelStore(runtimeRef)?.reset()'],
        counts: ['getSite()?.projectId'],
        uncounted: {
            'resolveSiteModelStore(runtimeRef)?.reset()':
                'The SiteModel carries its own projectId, so the probe reads that '
                + 'directly (getSite()?.projectId) as an INDEPENDENT source of truth '
                + 'rather than mirroring the clear. Nothing to count separately.',
        },
    },
    {
        scope: 'site.dispatch',
        module: 'apps/editor/src/ui/site/siteProjectScope.ts',
        why: 'siteDispatch module singletons (_ltpAdapter, _lastEnvelope, _lastSiteOrigin, '
            + '_lastParcelQueryPoint, _dkByggefeltProducer) are app-lifetime module state '
            + 'with no per-project keying.',
        presence: 'module-scope',
        resets: ['resetSiteDispatchProjectState'],
        counts: ['getSiteDispatchOwningProjectId'],
        uncounted: {
            resetSiteDispatchProjectState:
                'siteDispatch stamps _owningProjectId alongside the state it holds and '
                + 'clears both in one body; the probe reads that stamp. The per-field '
                + 'symmetry is enforced inside siteDispatch.ts by its own owner test.',
        },
    },
    {
        scope: 'site.neighbourFootprints',
        module: 'apps/editor/src/ui/site/siteProjectScope.ts',
        why: 'The neighbour-footprint snapshot feeds blind-facade resolution in the '
            + "apartment generator. Carried across a switch it blinds Project B's walls "
            + "against buildings that stand next to Project A.",
        presence: 'module-scope',
        resets: ['clearNeighbourFootprints'],
        counts: ['getNeighbourFootprints'],
        uncounted: {
            clearNeighbourFootprints:
                'The snapshot records no project id, so ownership follows the site store; '
                + 'the probe counts the snapshot\'s PRESENCE (getNeighbourFootprints() !== null) '
                + 'and attributes it to the live site. A snapshot with no site behind it is '
                + 'already a leak and is reported as one.',
        },
    },
    {
        scope: 'gis.cesiumViewport',
        module: 'apps/editor/src/ui/geospatial/CesiumViewport.ts',
        why: 'One viewport per tab, never disposed on a switch: placed massing, '
            + 'formaMassingOrigin, context layers, terrain datum, ground-resolved flag, '
            + 'render mode and the CAMERA SEAT — the field L-694b proved the first probe '
            + 'did not count. Registered at MODULE scope over a live-viewport set, so the '
            + 'module answers even when no globe was ever opened (L-712).',
        presence: 'module-scope',
        resets: [
            'formaMassingOrigin',
            'contextBuildingsAt',
            'contextSeaAt',
            'formaTerrainCity',
            'committedParcelLonLat',
            'globeGroundResolved',
            'cameraSeatedAt',
            'formaMode',
        ],
        counts: [
            'formaMassingOrigin',
            'contextBuildingsAt',
            'contextSeaAt',
            'formaTerrainCity',
            'committedParcelLonLat',
            'globeGroundResolved',
            'cameraSeatedAt',
            'formaMode',
        ],
        uncounted: {},
    },
    {
        scope: 'gis.areaLayout',
        module: 'apps/editor/src/ui/layout/GISAreaLayout.ts',
        why: 'mountGISArea() runs once per tab, so every `let` inside it is app-lifetime '
            + 'CLOSURE state. `lastGeocodeFrame` was the sole surviving source of '
            + "Project A's lat/lon in L-694a, and reflection cannot see closure variables — "
            + 'only a declared, hand-written probe can. Registered at MODULE scope over a '
            + 'delegate that mountGISArea installs, so an early return in that ~4500-line '
            + 'function can no longer skip the registration (L-712).',
        presence: 'module-scope',
        resets: [
            'lastGeocodeFrame',
            'isBimPlacedOnEarth',
            'globeRealPlaced',
            'formaRealPlaced',
            'globeRealLastSig',
            'formaRealLastSig',
            'siteAuthoringPaneLastFramedCentroid',
            'gisReactivationSelfPlaceSuppressed',
            'closeBoundaryMap2D',
            'boundaryTool',
        ],
        counts: [
            'lastGeocodeFrame',
            'isBimPlacedOnEarth',
            'globeRealPlaced',
            'formaRealPlaced',
            'globeRealLastSig',
            'formaRealLastSig',
            'siteAuthoringPaneLastFramedCentroid',
        ],
        uncounted: {
            gisReactivationSelfPlaceSuppressed:
                'A one-shot re-entry latch, not evidence of held project state: it is false '
                + 'in the steady state, so counting it would never change the answer.',
            closeBoundaryMap2D:
                'DOM teardown of the 2D boundary-draw map. The map is a VIEW over the '
                + 'closure state already counted above; it cannot outlive it.',
            boundaryTool:
                'In-progress boundary-draw tool cancel. Transient interaction state, not '
                + 'per-project data — it cannot survive into a project that never drew.',
        },
    },
];

/**
 * §L-711 (C13 §3.10) — element `StoreType`s that are CONSTRUCTED DURING/AFTER A
 * LOAD rather than restored one-for-one from the snapshot, and whose ids are
 * therefore legitimately absent from `__pryzmLoadedProjectExpectation`.
 *
 * C13 §3.10 already states this exclusion normatively for the DATA-side audit
 * ("derived state — redetected rooms, room-bounding lines, annotations, curtain
 * panels — is deliberately excluded"). The §L-325 RENDER-side audit inspects
 * `elementRegistry` roots, and derived elements DO register roots, so it needs the
 * same list — declared once, here, instead of re-derived at each call site.
 *
 * ⚠ This list is an EXCLUSION and therefore dangerous: every name in it is a
 * surface the render-side audit stops policing. It is deliberately short, it
 * contains only types with no snapshot array of their own, and the audit REPORTS
 * how many roots it excluded rather than dropping them silently — an exclusion
 * you cannot count is indistinguishable from a check you deleted.
 */
export const LOAD_DERIVED_ELEMENT_TYPES: readonly string[] = [
    'room',           // ReDetectRoomsCommand re-derives these on every load.
    'annotation',     // Re-derived by live documentation views (§FEAT-SET-OUT-LIVE…).
    'curtain-panel',  // Built by CurtainWallBuilder from the parent curtain wall.
    'stair-railing',  // Built by StairRailingBuilder from the parent stair.
    'stair-landing',  // Built by StairMeshBuilder from the parent stair.
    'opening',        // Derived from the hosting wall + hosted door/window (C15).
];

/** Every declared scope name, in declaration order. */
export const DECLARED_PROJECT_SCOPE_NAMES: readonly string[] =
    DECLARED_PROJECT_SCOPES.map(s => s.scope);

/**
 * The declared scopes whose ABSENCE at audit time is UNPROVEN and therefore a C13
 * violation (see "PRESENCE" in the header). `module-scope` entries are excluded:
 * if their module never loaded, they provably hold nothing.
 */
export const DECLARED_SCOPES_REQUIRING_PRESENCE: readonly string[] =
    DECLARED_PROJECT_SCOPES.filter(s => s.presence === 'instance-scope').map(s => s.scope);
