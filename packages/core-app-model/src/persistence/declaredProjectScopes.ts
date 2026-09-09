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
export const DECLARED_PROJECT_SCOPE_SET_VERSION = 9;

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
        scope: 'site.cadastralBoundaries',
        module: 'apps/editor/src/ui/geospatial/cadastralBoundaries.ts',
        why: 'The drawn set of neighbouring cadastral parcels is the ground around ONE plot. '
            + "Carried across a switch it draws Project A's neighbours over Project B's site, "
            + 'and the module\'s own header already rules that leaving a previous answer on '
            + 'screen is worse than either state \u2014 “the user would be looking at real lines '
            + 'from the wrong place”. The in-flight lookups are the same fact with a delay on '
            + 'it: clearing the map drops the handle, not the promise, so a run started for the '
            + 'old project would repopulate the set AFTER teardown \u2014 which is why the reset '
            + 'bumps a generation the run re-checks before it writes.',
        presence: 'module-scope',
        resets: ['resetCadastralBoundariesProjectState'],
        counts: ['getCadastralBoundariesOwningProjectId'],
        uncounted: {
            resetCadastralBoundariesProjectState:
                'The module stamps _owningProjectId beside `current` and clears both in one body; '
                + 'the probe reads that stamp and answers '
                + "'<cadastral-boundaries-project-unresolved>' rather than null for a set it "
                + 'cannot attribute. `_cache` is outside the reset ON PURPOSE: it is keyed by '
                + 'rounded lat/lon/radius, so a row is a fact about the LAND and a public '
                + "register's answer for it, not about a project. Dropping it per switch would "
                + 'put a second hit on a shared government register for an answer already held '
                + '\u2014 the defect the in-flight map beside it exists to stop.',
        },
    },
    {
        scope: 'site.massingGroupSelection',
        module: 'apps/editor/src/ui/site/massingGroupSelectionState.ts',
        why: 'ADR-0383 D6 \u2014 the ONE channel telling the Site panel, the 2D map and the 3D '
            + 'scene which massing group is the subject. It holds a `SpaceEnvelope.group.id`, '
            + 'and a group id is only meaningful inside its own project: carried across a '
            + 'switch it either matches nothing (three surfaces reporting a selection and '
            + 'emphasising nothing) or collides with a real group in Project B and emphasises '
            + 'a building nobody selected. `reconcileMassingGroupSelection` cannot cover this '
            + '\u2014 it is driven by a caller that has already read the store, and on a switch '
            + 'the panel is torn down before it reads anything.',
        presence: 'module-scope',
        resets: ['resetMassingGroupSelectionProjectState'],
        counts: ['getMassingGroupSelectionOwningProjectId'],
        uncounted: {
            resetMassingGroupSelectionProjectState:
                'The module stamps _owningProjectId beside the slot and clears both in one '
                + 'body; the probe reads that stamp and answers '
                + "'<selection-project-unresolved>' rather than null for a hold it cannot "
                + 'attribute. The listener SET is deliberately outside the reset \u2014 a '
                + "subscriber is a surface's handle, not this project's data, and dropping it "
                + 'would leave a panel that outlives the switch permanently deaf with nothing '
                + 'reporting it.',
        },
    },
    {
        scope: 'site.envelopeDrawArming',
        module: 'apps/editor/src/ui/site/siteEnvelopeDrawArming.ts',
        why: '\u00a7ENVELOPE-DRAW holds the settled perimeter ring, the in-flight '
            + 'BoundaryPathAuthor points, the armed surfaces, the draw mode and the last '
            + 'refusal. Every one of those is SCENE COORDINATES OR A SENTENCE ABOUT ONE PLOT: '
            + "carried across a switch, Project A's half-drawn ring previews over Project B's "
            + 'ground, and a refusal about a parcel that is no longer open is a message with '
            + 'no subject. `armEnvelopeDraw` restarts the gesture on re-arm, which is not the '
            + 'same event as a project switch and does not fire on one.',
        presence: 'module-scope',
        resets: ['resetEnvelopeDrawProjectState'],
        counts: ['getEnvelopeDrawArmingOwningProjectId'],
        uncounted: {
            resetEnvelopeDrawProjectState:
                'The module stamps _owningProjectId in armEnvelopeDraw and clears it with the '
                + "gesture; the probe reads that stamp behind a holdsProjectScopedState() "
                + 'presence test and answers '
                + "'<envelope-draw-project-unresolved>' rather than null for a hold it cannot "
                + 'attribute. `registered`, `statusListeners` and `modeListeners` are outside '
                + "the reset on purpose \u2014 they are the HOSTS' registrations, and removing a "
                + 'live 2D-Site canvas from them would report ENVELOPE_DRAW_NO_SURFACE_REASON '
                + 'on a view that is plainly on screen.',
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
        scope: 'ai.roomMeaningRestoreProposal',
        module: 'apps/editor/src/ui/ai/RoomMeaningRestoreProposal.ts',
        why: '§ROOM-TOMBSTONE (L-10814) / C94 RM-3 — the THIRD surface of the offer family, '
            + 'declared for the same §L-910-CLASS reason as its two siblings. The tombstone '
            + 'offer de-duplicates per LEVEL while a card is on screen, and level ids are '
            + 'not unique across projects: a switch mid-answer strands `lvl-0` in `asking` '
            + "forever, because the `finally` that clears it only runs when that promise "
            + 'settles — and that level would then never be offered a restore again in the '
            + 'new project. ⛔ The failure mode here is WORSE than a leak in the sibling '
            + 'scopes: a stale `_owningProjectId` attached to a live offer would attribute '
            + "one project's lost room to another project's building.",
        presence: 'module-scope',
        resets: ['asking.clear()', '_owningProjectId = null'],
        counts: ['asking.size', '_owningProjectId'],
        uncounted: {
            'asking.clear()':
                'COUNTED, under its read literal `asking.size` in `counts`. Same deliberate '
                + 'split as `ai.openedRegionProposal` — the CALL is pinned by D3 so deleting '
                + 'the teardown step fails, the READ is pinned by D4 so the probe going '
                + 'blind fails.',
            '_owningProjectId = null':
                'COUNTED, under the bare identifier `_owningProjectId` in `counts`. Declared '
                + 'separately as a reset so that dropping the stamp-clear — which would '
                + 'leave a stale owner attached to a cleared container — fails D3 rather '
                + 'than silently degrading the report.',
        },
        // NOT in `resets`, deliberately, and for the identical reason as its sibling:
        // `installed` latches the subscription to `roomMeaningNotifier`, which is
        // app-lifetime state, not project state. Clearing it on a project switch would let
        // the next bootstrap subscribe a SECOND time and ask every restore question twice.
        // It is reported through describe() (`installed`) so it stays visible in a leak
        // report.
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
    {
        scope: 'render.instancedElements',
        module: 'apps/editor/src/engine/instancedRendererProjectScope.ts',
        why: '§C13-INSTANCED-RENDERER-OWNER (L-8100) — THE GPU-INSTANCING RENDERER HAD NO '
            + 'OWNER AT ALL, and that is how 36 of project A\'s stair-railings plus their '
            + 'aggregate InstancedMesh reached project B\'s scene in the founder\'s 2026-08-23 '
            + 'report. `InstancedElementRenderer` is a module singleton holding one '
            + 'InstancedMesh per (elementType × levelId × geometry × material), parented '
            + 'straight into world.scene, plus the pick-membership maps that resolve a click '
            + 'to an element id. Its documented teardown, `clear()`, had ONE production call '
            + 'site — initScene.ts:708, bound to `clear-project`, AN EVENT WITH ZERO '
            + 'DISPATCHERS IN THE REPOSITORY (measured with rg and with plain grep -rn; 8 '
            + 'hits, all listeners or comments; not in the event catalog either). L-224 '
            + 'verbatim, third recurrence: a teardown that ships, passes its tests, and runs '
            + 'nowhere. NOTE the group key is (elementType × level × geometry × material) and '
            + 'contains NO project, so the renderer had no project identity to be torn down '
            + 'BY — which is why the repair is an OWNER plus a PROBE and not a smarter key. '
            + 'The probe deliberately does not trust the teardown: `stampInstancedRendererOwner` '
            + 'refuses to re-stamp while a previous owner is still attached, so a switch on '
            + 'which the clear did not run reports project A while project B is open, instead '
            + 'of laundering the leak as clean.',
        presence: 'module-scope',
        resets: ['instancedElementRenderer.clear()', '_ownerProjectId = null'],
        counts: ['instancedElementRenderer.groupCount', '_ownerProjectId'],
        uncounted: {
            'instancedElementRenderer.clear()':
                'COUNTED, under its read literal `instancedElementRenderer.groupCount` in '
                + '`counts`. The split is the same deliberate one the ai.* scopes use: `resets` '
                + 'carries the CALL so D3 fails if the teardown step is deleted, `counts` carries '
                + 'the READ so D4 fails if the probe stops looking. `groupCount === 0` is also '
                + 'the ONLY route to a null answer, which is what makes the probe independent of '
                + 'the stamp — an empty renderer is clean whatever the stamp says.',
            '_ownerProjectId = null':
                'COUNTED, under the bare identifier `_ownerProjectId` in `counts`. Declared '
                + 'separately as a reset because dropping the stamp-clear is the ONE edit that '
                + 'would silently invert this probe: the stamp would survive its own teardown, '
                + 'every subsequent load would look like a leak, and the resulting permanent red '
                + 'trains people to ignore the audit — the failure mode C13 §3.10 rates as worse '
                + 'than having no audit. D3 now fails instead.',
        },
    },
    {
        scope: 'analysis.graphView',
        module: 'apps/editor/src/ui/analysis/graphViewState.ts',
        why: '§C13-ANALYSIS-GRAPH-OWNER (L-10480) — THE ENTIRE ANALYSIS SURFACE HAD ZERO '
            + 'PROJECT-LIFECYCLE WIRING. Measured, not asserted: `grep -rn "pryzm-project" '
            + 'apps/editor/src/ui/analysis/` returned NOTHING, and the surface\'s only '
            + 'teardown (`disposeGraphViewport`) had exactly one caller — '
            + '`AnalysisSurface._hide()`, which fires when the reader LEAVES the workspace, '
            + 'not when the project changes under it. So switching project with the Analysis '
            + 'tab open carried Project A\'s force-solved node layout into Project B. '
            + 'THE LAYOUT CACHE IS A CONFIDENTIALITY SURFACE, not a cosmetic one: it maps '
            + 'ELEMENT ID -> position, so it discloses part of Project A\'s element id set to '
            + 'whoever is looking at Project B — the same class of risk the ProjectScopeRegistry '
            + 'header records for the leaked IFC/DXF overlays. NOTE the cache key is '
            + '`view|nodeCount|edgeCount|ids.join(",")` and contains NO project, so a smarter '
            + 'key was never the repair: two projects with colliding element ids produce the '
            + 'SAME key and there is no cache miss to stop the swap. The repair is an OWNER '
            + 'plus an explicit STAMP. This file also carried a doc comment claiming '
            + '`resetGraphViewState()` was "used by a project switch" — false since the card '
            + 'shipped, and corrected in the same commit: a comment asserting a lifecycle no '
            + 'caller implements is the L-694a defect in prose.',
        presence: 'module-scope',
        resets: [
            '_layoutKey = null',
            '_layoutPos = null',
            '_layoutProjectId = null',
            '_orbit.yaw = -0.62',
            'resetGraphViewState()',
        ],
        counts: ['_layoutPos', '_layoutProjectId'],
        uncounted: {
            '_layoutPos = null':
                'COUNTED, under its read literal `_layoutPos` in `counts`. The split is the '
                + 'deliberate one `render.instancedElements` uses: `resets` carries the '
                + 'ASSIGNMENT so D3 fails if the teardown step is deleted, `counts` carries the '
                + 'bare READ so D4 fails if the probe stops looking. `_layoutPos === null` is '
                + 'also the ONLY route to a null answer, which makes the probe independent of '
                + 'the stamp — an empty cache is clean whatever the stamp says.',
            '_layoutProjectId = null':
                'COUNTED, under the bare identifier `_layoutProjectId` in `counts`. Declared '
                + 'separately as a reset because dropping the stamp-clear is the ONE edit that '
                + 'would silently invert this probe: the stamp would survive its own teardown '
                + 'and every subsequent load would look like a leak, training people to ignore '
                + 'the audit — the failure C13 §3.10 rates worse than having no audit.',
            '_layoutKey = null':
                'NOT COUNTED, deliberately. The key is a DERIVED shape descriptor '
                + '(`view|nodeCount|edgeCount|ids`), never an ownership fact — it is exactly '
                + 'the field that CANNOT distinguish two projects, which is why the stamp had '
                + 'to be added. It is reset so a stale key can never resurrect a dropped cache; '
                + 'counting it would add a field that is null precisely when `_layoutPos` is.',
            '_orbit.yaw = -0.62':
                'NOT COUNTED. The orbit is yaw/pitch/zoom over the NORMALISED unit cube '
                + '(`normaliseToCube`), so it holds no project-derived coordinate — unlike '
                + 'L-694b\'s `cameraSeatedAt`, which held real lat/lon and was the one thing '
                + 'the founder could see. It is RESET because an angle chosen to look at a '
                + 'cluster of Project A\'s would seat Project B\'s first render at a pose framing '
                + 'something that no longer exists; it is not COUNTED because a camera angle '
                + 'cannot tell you WHICH project it was chosen over. Counting it would let a '
                + 'reader who merely orbited Project B\'s own graph read as a leak.',
            'resetGraphViewState()':
                'NOT COUNTED. Resets the card CONTROLS (view, 2D/3D, labels, node scale, focus '
                + 'depth) — UI preferences with no project content, carried across a switch '
                + 'harmlessly. Reset for consistency with the layout they describe, not because '
                + 'they leak; counting them would report a reader who changed a dropdown.',
        },
    },
    {
        scope: 'analysis.graphViewport',
        module: 'apps/editor/src/ui/analysis/widgetRenderers.ts',
        why: '§C13-ANALYSIS-VIEWPORT-OWNER (L-10480) — the sibling of `analysis.graphView`, '
            + 'and SPLIT FROM IT ON PURPOSE. `_liveViewport` is a live 3-D WebGL mount holding '
            + "Project A's graph geometry AND one refcount on the ONE shared offscreen context "
            + 'the element showrooms also use. A cache and a GPU mount have different disposal '
            + 'semantics — dropping a Map is free and idempotent, releasing a context refcount '
            + 'must happen exactly once — so folding them into a single scope would force one '
            + 'probe to answer for two resources it could only describe as one, which is the '
            + 'COMPLETENESS half of L-694b. Before this entry the only disposal was '
            + '`AnalysisSurface._hide()`; a project switch with the workspace open disposed '
            + 'NOTHING, so the mount survived and the refcount never fell — pinning a context '
            + 'whose eviction victim, per the file\'s own header, is the MAIN VIEWPORT.',
        presence: 'module-scope',
        resets: [
            '_liveViewport?.dispose()',
            '_liveViewport = null',
            '_liveViewportProjectId = null',
        ],
        counts: ['_liveViewport', '_liveViewportProjectId'],
        uncounted: {
            '_liveViewport?.dispose()':
                'COUNTED, under its read literal `_liveViewport` in `counts`. `resets` carries '
                + 'the DISPOSE CALL so D3 fails if the release of the shared WebGL refcount is '
                + 'ever dropped — the one step whose deletion is invisible in every test that '
                + 'does not own a GPU.',
            '_liveViewport = null':
                'COUNTED, under the bare identifier `_liveViewport` in `counts`. Declared '
                + 'separately so D3 fails if the handle is disposed but not dropped: a disposed '
                + 'handle still held is a use-after-free the probe would otherwise report as a '
                + 'live mount belonging to the new project.',
            '_liveViewportProjectId = null':
                'COUNTED, under the bare identifier `_liveViewportProjectId` in `counts`. Same '
                + 'reason as `analysis.graphView`: a stamp that survives its own teardown '
                + 'inverts the probe into a permanent false red.',
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
