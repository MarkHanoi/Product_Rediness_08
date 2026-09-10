// A.5.g.4 + O.2 — RAC → site bootstrap router (the G1 seam, zero-console journey).
//
// WHY THIS EXISTS
// ---------------
// Post-auth, `PlatformRouter` emits `pryzm:onboarding-brief-ready` (a typed
// RuntimeEvent — see `runtime-composer/src/types.ts:1830`) carrying the brief the
// RAC onboarding conversation captured, then lands the user on the project hub.
// Until now the captured brief just sat there: the founder still had to type
// console commands (`pryzmCreateSiteFromRect()` → `pryzmGenerateApartmentFromBoundary()`)
// to see the journey complete. This module CLOSES that gap (G1 in the
// RAC→SITE→DESIGN pipeline plan §3/§5): on brief-ready it auto-drives
//
//     create project → [O.2 guided LOCATION + DRAW-OR-SKIP step flow] → generate
//
// so the user lands in a finished apartment result with ZERO console commands.
//
// O.2 RE-SEQUENCE (ONBOARDING-WORKFLOW-DESIGN-2026-06-03.md §3.3 + §6 O.2)
// -----------------------------------------------------------------------
// Originally this module jumped STRAIGHT from project-open to a DEFAULT 10×8 m
// rectangle (`createSiteFromRect`) → generate. O.2 inserts a guided step flow
// (`OnboardingStepController`) BETWEEN project-open and generate:
//     1. Location  — address → geocode → site location
//     2. Site      — ⚡ default footprint (skip)  |  ✏️ draw on the map (GIS)
//     3. Generate  — generateApartmentFromBoundary → land in the canvas.
// The default-rectangle path is KEPT verbatim as the skip/no-GIS fallback (the
// founder's "GIS is skippable" ratification). This module now only creates +
// opens the project and HANDS OFF to the step controller.
//
// WHAT THIS REUSES (vs writes)
// ----------------------------
// - REUSES the EXISTING project create+open path: it does NOT mint project ids or
//   touch `runtime.persistence.client.create` directly (that logic — server-id
//   reconciliation, localStorage mirror, `{isNewProject}` hint — lives in
//   ProjectHub and is server-id-mismatch-prone). Instead the router injects a
//   `createAndOpenProject(name)` callback that runs the SAME create+open flow the
//   hub's "New project" button uses. This module only ORCHESTRATES.
// - REUSES the EXISTING site + generate seams: `createSiteFromRect` (A.7.c.x) and
//   `generateApartmentFromBoundary` (A.5.g.3) — both already shipped + tested.
// - WRITES only the subscription + the timing/orchestration glue here.
//
// TIMING (the hard part)
// ----------------------
// The post-auth flow lands on the HUB, not a project. The site + generate seams
// require an OPEN project (`createSiteFromRect` bails on empty
// `runtime.audit.projectId`; the generator needs an active level). So the chain is
// gated on project readiness:
//
//   brief-ready ──► createAndOpenProject(name) ──► (router opens it) ──►
//   `pryzm-project-loaded` (one-shot, filtered to OUR projectId) ──►
//   createSiteFromRect ──► await `site.parcel-boundary-set` (or store poll) ──►
//   generateApartmentFromBoundary
//
// Every step is guarded: a missing runtime / project / event simply logs
// `[onboarding-bootstrap]` + bails — it NEVER throws into the auth flow.
//
// TYPOLOGY-AGNOSTIC-READY
// -----------------------
// Only `typologyId === 'apartment'` is auto-wired today (the one shipped
// generator). Other typologies log "not yet auto-wired" and bail — when their
// Packs land (A.21/A.22), they slot into the same brief-ready → project →
// site → generate spine; only the final generate call differs.
//
// FUTURE GIS SEAM
// ---------------
// The default rectangle is the NO-GIS fallback. When the GIS authoring UI lands
// (A.8.a geocode + A.8.c polygon-draw), the flow inserts a "draw boundary" step
// BETWEEN project-open and generate, replacing `createSiteFromRect`'s rectangle
// with the user's drawn parcel boundary. See the §FUTURE-GIS marker below.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { startOnboardingStepFlow } from './OnboardingStepController.js';
import { markStartupPhase } from '../../engine/startupBudget.js';
// §STARTUP-MOVE-THE-GATE (L-13277) — two DIFFERENT questions, one authority each:
// "can the user click the globe?" (the location step) vs "can we author a site?" (the commit).
import { whenGlobeSurfaceLive, markEngineReadyForSite } from '../../engine/globeSurfaceGate.js';
import { setActiveBrief } from '../apartment-layout/activeBrief.js';
import { resolveGenerateRoute } from './typologyChoiceModel.js';

/** The narrowed brief payload carried by `pryzm:onboarding-brief-ready`. */
interface OnboardingBrief {
    readonly role: string;
    readonly typologyId: string;
    readonly metadata: Record<string, unknown>;
}

/** Injected by the router so this module reuses the hub's proven create+open
 *  flow instead of duplicating the server-id-mismatch-prone logic. Resolves once
 *  the create call has been issued; project readiness is signalled separately by
 *  the `pryzm-project-loaded` runtime event. */
export interface BriefBootstrapDeps {
    /** Create a brand-new project named `name` and open it (the SAME path the
     *  hub's "New project" button drives). Implemented by the router. */
    readonly createAndOpenProject: (name: string) => void;
}

const DEFAULT_PROJECT_NAME = 'My first apartment';
// NOTE (O.2): the default parcel rectangle (10×8 m) + the boundary-settle wait
// now live in `OnboardingStepController` — the step controller owns the
// site-create + draw-or-skip + generate sequence. This module only creates +
// opens the project and hands off to it.

/** Idempotency guard — `installBriefBootstrap` must wire the subscription exactly
 *  once per page, even if called from multiple boot paths. Keyed off the runtime
 *  identity so a fresh runtime (re-compose) re-arms cleanly. */
let installedForRuntime: WeakSet<object> | null = null;

/**
 * Wire the RAC→site bootstrap once. Subscribes to `pryzm:onboarding-brief-ready`
 * on the runtime event bus and auto-drives the create→site→generate chain.
 *
 * Idempotent: calling twice with the same runtime is a no-op (logged). Safe to
 * call from any post-engine boot site; the router is the canonical caller.
 *
 * @returns a disposer that removes the subscription, or a no-op if already wired.
 */
export function installBriefBootstrap(
    runtime: PryzmRuntime | null | undefined,
    deps: BriefBootstrapDeps,
): () => void {
    if (!runtime?.events?.on) {
        console.warn('[onboarding-bootstrap] no runtime.events — cannot wire brief bootstrap; bailing.');
        return () => { /* no-op */ };
    }

    installedForRuntime ??= new WeakSet<object>();
    if (installedForRuntime.has(runtime)) {
        console.log('[onboarding-bootstrap] already wired for this runtime — skipping (no double-fire).');
        return () => { /* no-op */ };
    }
    installedForRuntime.add(runtime);

    console.log('[onboarding-bootstrap] wiring pryzm:onboarding-brief-ready subscription.');

    const sub = runtime.events.on('pryzm:onboarding-brief-ready', (brief) => {
        // Never let an exception escape into the auth/event-emit flow.
        try {
            void handleBriefReady(runtime, deps, brief);
        } catch (err) {
            console.error('[onboarding-bootstrap] handler threw (swallowed — auth flow unaffected):', err);
        }
    });

    return () => {
        installedForRuntime?.delete(runtime);
        sub.dispose();
    };
}

/**
 * The orchestration: gate on typology, create+open a project, then run the
 * site→generate chain once the project is loaded.
 */
async function handleBriefReady(
    runtime: PryzmRuntime,
    deps: BriefBootstrapDeps,
    brief: OnboardingBrief,
): Promise<void> {
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        runtime.events?.emit('pryzm:toast', { message, severity });
    };

    console.log('[onboarding-bootstrap] brief-ready received', {
        role: brief.role,
        typologyId: brief.typologyId,
    });

    // ── Typology gate (typology-agnostic-ready) ──────────────────────────────
    // §A.6.c / A.21.j — typologies whose generate path is wired today. Both
    // `apartment` and `casa-unifamiliar` flow through the SAME guided step flow
    // (location → draw-or-skip → confirm → generate). The TYPOLOGY SWITCH happens
    // INSIDE `OnboardingStepController.generateAndFinish`: `apartment` →
    // `generateApartmentFromBoundary` (single plate); `casa-unifamiliar` → the
    // multi-storey HOUSE generator (`generateHouseFromBoundary`, levels + per-storey
    // rooms + stair + roof, A.21.j). Other typologies still bail gracefully until
    // their Pack wires a generator into the SAME brief→project→site→generate spine.
    // §RESI-MULTIFAMILY — the multi-family residential building joins the wired set:
    // it flows through the SAME guided step flow (location → draw-or-skip → confirm →
    // generate); the TYPOLOGY SWITCH in `OnboardingStepController.generateAndFinish`
    // routes `residential-multifamily` to the residential generator (which reads the
    // drawn parcel boundary, runs the orchestrator, and opens the residential preview
    // modal → Build), exactly the way `apartment`/`casa-unifamiliar` route.
    // §OFFICE-ONBOARDING-WIRE — `office` joins the wired set: it flows through the SAME
    // guided step flow (location → draw-or-skip → confirm → generate); the TYPOLOGY SWITCH
    // in `OnboardingStepController.generateAndFinish` routes `office` to the office
    // controller (derives a circular footprint from the drawn parcel, opens the office
    // setup modal → Build), exactly the way the other wired typologies route.
    //
    // §TYPOLOGY-CHOICE-AT-CONFIRM — this readiness gate is now the SAME resolver the
    // step controller dispatches on (`resolveGenerateRoute`), not a second hand-kept
    // list. The two had already drifted: the set below omitted `residential-building`
    // — the id the pack composeRuntime registers actually declares — so a brief
    // captured for the registered residential pack was refused here as "not wired",
    // while `residential-multifamily` (a routing id no manifest declares) was accepted.
    // One resolver means that cannot recur.
    const route = resolveGenerateRoute(brief.typologyId);
    if (!route) {
        console.log(
            `[onboarding-bootstrap] typology "${brief.typologyId}" has no wired generate route ` +
            '— bailing gracefully rather than generating something the user did not ask for. ' +
            'Its Pack slots into this same brief→project→site→generate spine by adding a route.',
        );
        return;
    }
    const typologyNoun = route === 'office' ? 'office building'
        : route === 'residential-building' ? 'residential building'
            : route === 'house' ? 'house'
                : 'apartment';

    if (typeof deps.createAndOpenProject !== 'function') {
        console.warn('[onboarding-bootstrap] no createAndOpenProject dep — cannot create a project; bailing.');
        return;
    }

    // O.12.c — record the STRUCTURED brief as the single source of truth BEFORE
    // generation. The generate chain receives it explicitly (threaded below); the
    // stash additionally lets the "Choose a layout" picker seed from + agree with
    // the same captured values, and lets a later no-arg re-trigger honour them.
    const briefMetadata = (brief.metadata ?? {}) as Record<string, unknown>;
    setActiveBrief({ typologyId: brief.typologyId, metadata: briefMetadata });

    // The post-auth flow is on the HUB, not a project. We must create + open a
    // project, then wait for it to LOAD before the site/generate seams (which
    // need an open project + active level) can run. We arm the one-shot
    // `pryzm-project-loaded` listener BEFORE issuing the create+open so we never
    // miss the event (it can fire synchronously-ish for the empty-new-project
    // path — PlatformShell fires `pryzm-project-loaded(empty:true)` immediately).
    toast(`Setting up your first ${typologyNoun}…`, 'info');

    const md = brief.metadata ?? {};
    const address = typeof md.address === 'string' ? md.address : undefined;
    // O.5 — the "New Project" modal seeds `metadata.projectName` (via the RAC
    // panel's seedMetadata) so the created project is named what the user typed,
    // not the generic default. Falls back to DEFAULT_PROJECT_NAME for the legacy
    // RAC-first path (no modal seed) so existing behaviour is unchanged.
    const projectName = typeof md.projectName === 'string' && md.projectName.trim()
        ? md.projectName.trim()
        : DEFAULT_PROJECT_NAME;

    let fired = false;

    // §STARTUP-MOVE-THE-GATE (lane PERF-OPEN, L-13277) — ⭐ THE LOCATION STEP NO LONGER WAITS
    // FOR THE ENGINE.
    //
    // `startOnboardingStepFlow` used to be called from inside the `pryzm-project-loaded`
    // handler below, which is why the founder waited 3.8 s for a card with a text box over a
    // globe that had been ready since ~550 ms. The step needs a globe it can click and a place
    // to type a cadastral reference; it does not need wall builders, slab stores, a
    // WorkspaceController or a hydrated snapshot. See `globeSurfaceGate.ts` for the full
    // measurement and for why this is TWO QUESTIONS rather than two gates.
    //
    // The project id is NOT a reason to wait here: `buildPersistence.openProject` calls
    // `projectContext.set(...)` in its STEP 1, before it even requests the engine boot
    // (measured `open:persistence-openProject t+518 ms` vs the globe surface at `t+3338 ms`),
    // so `runtime.audit.projectId` is long since populated by the time this resolves. The
    // guard below is kept as a genuine guard, not as a gate.
    let stepFlowStarted = false;
    const startStepFlowOnce = (via: string): void => {
        if (stepFlowStarted) return;
        stepFlowStarted = true;
        if (!runtime.audit?.projectId) {
            console.warn(
                `[onboarding-bootstrap] §STARTUP-MOVE-THE-GATE — ${via}: runtime.audit.projectId ` +
                'is empty, so the step flow cannot start. This should be unreachable — ' +
                'openProject sets the project context in step 1, well before the globe surface ' +
                'comes up. Bailing rather than starting a flow with no project.',
            );
            return;
        }
        try {
            startOnboardingStepFlow({
                runtime,
                ...(address ? { seedAddress: address } : {}),
                // O.7.1 — thread the captured typology so the generate-confirm step
                // copy/label is typology-aware (apartment now; future Packs add
                // their noun).
                typologyId: brief.typologyId,
                // O.12.c — thread the STRUCTURED brief metadata so the final
                // generate consumes the user's bedroom/bathroom/option choices.
                briefMetadata,
            });
        } catch (err) {
            console.error('[onboarding-bootstrap] failed to start onboarding step flow (swallowed):', err);
        }
    };

    // ⛔ ONE await, no poll, no timeout, no second listener racing the one below. If the globe
    // surface never comes up (an engine boot that dies before `mountGISArea`), this never
    // resolves — deliberately: a location card over no globe is a worse answer than none, and
    // the 30 s net further down still surfaces a retriable toast so the user is told.
    void whenGlobeSurfaceLive().then(() => {
        startStepFlowOnce('globe-surface-live');
    });

    const onLoaded = runtime.events.on('pryzm-project-loaded', (p) => {
        if (fired) return;
        fired = true;
        onLoaded.dispose();
        // §STARTUP-BUDGET (L-10722) — ⭐ THE GATE ITSELF, named at last.
        //
        // This handler IS the thing standing between the founder adding a location and
        // PRYZM Earth appearing: `renderLocationStep()` (and therefore
        // `pryzmToggleGIS(true)`) cannot run until this line does, and this line cannot
        // run until the FULL engine bootstrap + the project hydrate have finished
        // (`buildPersistence.openProject` steps 2 and 4). ADR-0369 §6 states the chain;
        // nothing measured WHERE in it the time goes.
        //
        // Read `open:project-loaded` against `boot:ui-done`: the gap between them is O10
        // — the snapshot hydrate + the load-path work — and it is the ONE leg of his
        // complaint that had no mark on either side of it. A large gap means the hydrate
        // owns his wait; a near-zero gap means the boot does, and ADR-0369 §7 Stage 3 is
        // the whole answer. ⛔ Do not deduce which without reading this pair.
        markStartupPhase('open:project-loaded');
        // §STARTUP-MOVE-THE-GATE (L-13277) — ⭐ THE RE-CONVERGENCE, AND IT IS THE LOAD-BEARING
        // HALF OF THIS CHANGE. Decoupling the location step from the boot is only safe because
        // the path that genuinely NEEDS the engine now awaits this fact explicitly:
        // `OnboardingStepController.callCreateSiteFromRect()` awaits `whenEngineReadyForSite()`
        // before `createSiteFromRect(...)` dispatches its first bus command. A user who picks a
        // parcel 400 ms after the globe appears therefore waits AT THE COMMIT — where waiting is
        // correct and invisible — instead of reaching a half-booted editor.
        // ⛔ Any new consumer of the engine on the onboarding path awaits there too.
        markEngineReadyForSite();
        console.log('[onboarding-bootstrap] pryzm-project-loaded — project ready', {
            projectId: p.projectId,
            empty: p.empty,
        });
        // O.2 — hand off to the guided step controller (location → draw-or-skip → generate).
        // ⚠ This is now a FALLBACK, not the gate. On every normal run the globe surface comes
        // up first (measured t+3338 ms vs t+3790 ms) and `startStepFlowOnce` has already run, so
        // this call is a no-op via its latch. It is kept because "project loaded" is the ONE
        // remaining path on which the step flow must still start if the globe surface signal
        // were somehow missed — losing onboarding entirely is a far worse failure than starting
        // it late, and the latch makes double-start impossible.
        startStepFlowOnce('project-loaded (fallback)');
    });

    // Safety net: if the project never reports loaded, dispose the listener so we
    // don't leak it across the next manual open.
    //
    // §FIX-CREATE-TIMEOUT-RETRY (L-132) — previously this bailed SILENTLY (log
    // only), leaving the user staring at a stuck loader with no idea the setup
    // had given up. Now that `createAndOpenProject` rejects on a create timeout
    // (instead of hanging), the loader's own error state usually surfaces first;
    // this net is the backstop for any other "loaded never arrived" case, and it
    // now emits a VISIBLE, retriable toast so the user knows to try again rather
    // than waiting forever. (The loading overlay separately offers "Return to
    // Hub" → re-run the New Project flow.)
    setTimeout(() => {
        if (!fired) {
            fired = true;
            onLoaded.dispose();
            console.warn(
                '[onboarding-bootstrap] timed out waiting for pryzm-project-loaded — ' +
                'the project may have failed to open. Surfacing a retriable toast; the ' +
                'user can retry from the projects hub. Bailing without throwing.',
            );
            toast(
                "We couldn't finish setting up your project — please try again from the projects hub.",
                'error',
            );
        }
    }, 30_000);

    console.log(`[onboarding-bootstrap] creating + opening project "${projectName}".`);
    deps.createAndOpenProject(projectName);
}
