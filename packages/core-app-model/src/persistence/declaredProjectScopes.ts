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
    /**
     * L-713 — whether this owner ALSO holds a `projectScopeRegistry` teardown entry.
     *
     * Defaults to true, and true is the normal case: one module owns both the probe
     * and the clear. `events.storeBus` is the exception — a registry entry would be
     * invoked by `ClearProjectCommand.clearAll()`, which runs INSIDE the batch bracket
     * `ProjectLoader` opened for the incoming project, and discarding there would
     * reset the depth mid-load and strand every subsequent create event. Its
     * switch-time owner is `BatchCoordinator.forceReset()` instead, which runs before
     * any bracket exists. The exception must be declared so the gate stops requiring
     * a registry entry — and so the reason is in the diff rather than in someone's head.
     */
    readonly ownsTeardown?: boolean;
    /** Required when `ownsTeardown` is false: who tears this surface down instead. */
    readonly teardownOwner?: string;
}

/**
 * Bumped whenever an entry is added or removed, or a `resets`/`counts` list
 * changes. The runtime audit stamps this into its report, so a leak report from
 * the field can be tied to the declaration that was in force when it was written.
 */
export const DECLARED_PROJECT_SCOPE_SET_VERSION = 5;

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
    {
        scope: 'events.storeBus',
        module: 'packages/core-app-model/src/StoreEventBus.ts',
        why: 'L-713 — THE FIRST DECLARED SURFACE THAT IS A CHANNEL, NOT A VALUE. Every '
            + 'other probe models held state and answers honestly about it; the founder '
            + 'created a new project and saw the previous one because 74 delete events '
            + "naming the OUTGOING project's windows sat in the bus queue that nothing "
            + 'modelled, and were flushed into the incoming project milliseconds after '
            + 'both audits reported clean. The stores really were clean when asked. A '
            + 'leak can live in an undelivered message, not only in a held value.',
        presence: 'module-scope',
        // The bus cannot attribute a queued event to a project (StoreChangeEvent has no
        // projectId), so the probe counts PENDENCY, not ownership, and answers with an
        // explicit unattributed marker rather than inventing a project id.
        resets: ['discardBatch', 'suppressDuring'],
        counts: ['batchDepth', 'bufferedCount'],
        uncounted: {
            discardBatch:
                'The switch-time discard is owned by BatchCoordinator.forceReset(), not by '
                + 'this probe. Counting it would report every completed teardown as held state.',
            suppressDuring:
                'A completed suppression is reported through describe().lastSuppression so '
                + 'the drop is always evidence, but it is not held state: by the time the '
                + 'audit runs the region has closed and the events are already gone.',
        },
        ownsTeardown: false,
        teardownOwner: 'BatchCoordinator.forceReset() on pryzm-project-switch — a '
            + 'projectScopeRegistry entry would run inside ProjectLoader\'s open bracket '
            + 'and reset the batch depth mid-load.',
    },
    {
        scope: 'views.mountedDrawing',
        module: 'apps/editor/src/engine/views/mountedDrawingScope.ts',
        why: '§C13-MOUNTED-DRAWING-OWNER (founder 2026-08-07) — THE FIRST DECLARED SURFACE '
            + 'THAT IS A SCENE PARENTING, and the fifth variant of this family. '
            + '`ViewController._mountDrawing` parents the projected plan/section linework '
            + '(solid wall outlines + grey dashed hidden lines from EdgeProjectorService) '
            + 'into the SHARED world.scene.three, and `_unmountDrawing` was reachable only '
            + 'from view activation — ViewController subscribes to no project event at all. '
            + 'The C13 render teardown called viewTechnicalDrawingCache.clear(), which '
            + 'disposes the drawing and empties the map the PLAN pane reads but never calls '
            + 'scene.remove(), because the cache does not own the mount. So a new project '
            + "showed the previous project's wall projection in 3D while its plan pane read "
            + '"Add walls to see the floor plan": ONE surface, TWO readers, a teardown that '
            + 'owned only the reader it knew about. The group is OBC linework carrying no '
            + 'elementId and no id, so no scene sweep keyed on element identity can see it — '
            + 'it needs an owner that can be ASKED, not one that can be searched for.',
        presence: 'module-scope',
        resets: ['clearMountedDrawing'],
        counts: ['_mounted?.projectId'],
        uncounted: {
            clearMountedDrawing:
                'The module stamps the owning project alongside the detach handle and drops '
                + 'both in one body, so the probe reads that stamp (_mounted?.projectId) as '
                + 'the single source rather than mirroring the clear field-by-field. A mount '
                + 'whose project could not be resolved answers with an explicit unattributed '
                + 'marker, never null — "holding nothing" and "holding something I cannot '
                + 'attribute" are the L-713 mistake if they share a value.',
        },
    },
    {
        scope: 'ai.wallMoveClashProposal',
        module: 'apps/editor/src/ui/ai/WallMoveClashProposal.ts',
        why: '§L-910-CLASS — the C83 wall-move clash offer de-duplicates its questions in '
            + 'two module-level containers keyed by WALL ID, and wall ids are not unique '
            + 'across projects. `lastAskedKey` does not merely waste memory when it survives '
            + "a switch: it SUPPRESSES a question — Project A's entry for wall `w-12` "
            + "silences a genuine, defensible clash offer on Project B's unrelated `w-12`, "
            + 'so the user drags into a real clash and the chat stays quiet. `asking` is '
            + 'rarer and worse: a switch while a card is on screen strands the wall in the '
            + '"already asking" set forever, because the `finally` that removes it only runs '
            + 'when that promise settles. Both symptoms are a correct thing that silently '
            + 'fails to happen — invisible to any audit that does not model this surface. '
            + 'The module shipped with a probe and a registry entry in commit 895b8d49 but '
            + 'no declaration, which is exactly the born-invisible state ADR-0298 §3 forbids; '
            + 'this entry is the missing half.',
        presence: 'module-scope',
        resets: ['lastAskedKey.clear()', 'asking.clear()', '_owningProjectId = null'],
        counts: ['lastAskedKey.size', 'asking.size', '_owningProjectId'],
        uncounted: {
            'lastAskedKey.clear()':
                'COUNTED, under its read literal: the probe reads `lastAskedKey.size`, which '
                + 'is declared in `counts`. The pair is split deliberately — `resets` carries '
                + 'the CALL so D3 fails if the teardown step is deleted, `counts` carries the '
                + 'READ so D4 fails if the probe stops looking. One container, both halves '
                + 'pinned; nothing here is exempt from the L-694b symmetry rule.',
            'asking.clear()':
                'COUNTED, under its read literal `asking.size` in `counts`. Same split as '
                + 'above: the call is pinned by D3, the read by D4, and neither can be removed '
                + 'without a failure naming which half went.',
            '_owningProjectId = null':
                'COUNTED, under the bare identifier `_owningProjectId` in `counts` — the probe '
                + 'returns it as the owner whenever either container is non-empty. The assignment '
                + 'literal is declared separately so that dropping the stamp-clear from the '
                + 'teardown (leaving a stale owner behind cleared containers) fails D3.',
        },
    },
    {
        scope: 'ai.openedRegionProposal',
        module: 'apps/editor/src/ui/ai/OpenedRegionProposal.ts',
        why: '§L-910-CLASS, the sibling of `ai.wallMoveClashProposal` and the second surface '
            + 'of this family. The §OPENED-REGION offer (L-880) de-duplicates per LEVEL, and '
            + 'level ids are not unique across projects either: a surviving `lastAskedKey` '
            + "entry for `lvl-0` silences a genuine \"this wall move left a room standing "
            + 'open" offer on the next project\'s `lvl-0`. It was found by this gate\'s '
            + 'CANDIDATE SWEEP holding module-level project-scoped state with no owner at '
            + 'all — no probe, no registry entry, no declaration — and was given all three '
            + 'rather than baselined as debt: the sweep exists to find exactly this, and a '
            + 'file that matches it is either declared or genuinely not project-scoped, and '
            + 'this one is project-scoped.',
        presence: 'module-scope',
        resets: ['lastAskedKey.clear()', 'asking.clear()', '_owningProjectId = null'],
        counts: ['lastAskedKey.size', 'asking.size', '_owningProjectId'],
        uncounted: {
            'lastAskedKey.clear()':
                'COUNTED, under its read literal `lastAskedKey.size` in `counts`. `resets` '
                + 'carries the CALL so D3 fails if the teardown step is deleted; `counts` '
                + 'carries the READ so D4 fails if the probe stops looking at it.',
            'asking.clear()':
                'COUNTED, under its read literal `asking.size` in `counts`. Same deliberate '
                + 'split as its sibling scope — the call is pinned by D3, the read by D4.',
            '_owningProjectId = null':
                'COUNTED, under the bare identifier `_owningProjectId` in `counts`. Declared '
                + 'separately as a reset so that dropping the stamp-clear — which would leave '
                + 'a stale owner attached to cleared containers — fails D3 rather than '
                + 'silently degrading the report.',
        },
        // NOT in `resets`, and deliberately so: `installed` latches the subscription to
        // `openedRegionNotifier`, which is app-lifetime state, not project state. Clearing
        // it on a project switch would let the next bootstrap subscribe a SECOND time and
        // ask every opened-region question twice. It is reported through describe()
        // (`subscribed`) so its value is still visible in a leak report.
    },
    {
        scope: 'links.linkedModels',
        module: 'apps/editor/src/engine/links/linkedModelScope.ts',
        why: '§C13-LINKED-MODEL-OWNER (ADR-0346, L-2900) — THE FIRST SANCTIONED '
            + 'CROSS-PROJECT SURFACE IN THIS REPOSITORY, and the reason C13 gained §3.13. '
            + "A LINKED MODEL puts ANOTHER project's geometry into the active scene on purpose: "
            + "project B's building shown read-only inside project A, anchored on the shared "
            + 'parcel datum. Every other mechanism in this neighbourhood exists to PREVENT '
            + 'exactly that, so the feature cannot be built on an allowlist — C13 §3.10 '
            + 'says a clean verdict that never looked is worse than no verdict. It is built on '
            + 'an OWNER that can be ASKED instead. The subtree carries no `userData.id` and no '
            + '`type`, so `scene.foreignElement` cannot recognise it — the same blindness '
            + '`views.mountedDrawing` was created for, and C13 §7.5 names that scope as THE '
            + 'pattern for a producer a sweep cannot see. The probe answers the HOST project id '
            + '(the project that created the link), never the source id: the geometry is '
            + 'foreign, the MOUNT is host state, so a link left mounted across a switch reads '
            + 'as a leak through the ordinary scope.foreignProject arm with no new detector. '
            + 'Stamping the SOURCE id instead would have made every correctly-mounted link '
            + 'report a permanent violation, which trains people to ignore the audit — the '
            + 'failure mode that is worse than having none.',
        presence: 'module-scope',
        resets: ['clearMountedLinks'],
        counts: ['hostProjectId'],
        uncounted: {
            clearMountedLinks:
                'The module stamps `hostProjectId` alongside each detach handle and drops both '
                + 'in one body, so the probe reads that stamp as a SINGLE source rather than '
                + 'mirroring the clear map-field by map-field — the `views.mountedDrawing` '
                + 'shape. A mount whose host could not be resolved answers with an explicit '
                + "`'<link-host-unresolved>'` marker, never null: “I hold nothing” and "
                + '“I hold something I cannot attribute” are the L-713 mistake if they '
                + 'share a value.',
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
