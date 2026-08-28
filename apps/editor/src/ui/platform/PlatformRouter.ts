/**
 * PlatformRouter — Orchestrates the platform entry flow
 *
 * Flow:
 *   Landing Page → Auth Modal → Project Hub → BIM Workspace
 *
 * Contract compliance:
 *   §01 §1.1 — BIM engine init is deferred until user explicitly opens a project
 *   §05 §7.1 — No direct store mutation; engine init delegated to caller
 *   §05 §7.6 — All CSS through AppTheme.ts
 *   §06 §3   — Implements destroy() for full cleanup (removes popstate listener)
 *   §06 §10  — Hash-based URL routing: #/ (landing) · #/projects (hub)
 *
 * Phase A.4 (S73-WIRE) — `start(runtime: PryzmRuntime)` accepts the
 * composed runtime built by `composeRuntime()` in `src/main.ts`.  The
 * router holds it `public readonly` so Phase B+ panels can reach it
 * via `router.runtime` once their constructors widen per §16.2.
 *
 * Phase C.3.01 (S74-WIRE) — `launchWorkspace()` is the canonical
 * "Open project" gesture.  It calls
 *   `await this.runtime.persistence.openProject(id)`
 * which: (a) hydrates the project list + sets projectContext, (b)
 * invokes the `workspace bridge (D.4)` injected into `composeRuntime` —
 * that bridge lazy-boots the legacy engine and drives the legacy
 * scene-load / version-restore / collaboration wiring on first open,
 * (c) emits `'persistence.openProgress'` so the overlay can paint
 * progress.  No page reload, no `?pryzm2=1` round-trip, no
 * window-global reach in this file — every workspace-mount detail
 * lives behind `runtime.persistence.openProject`.
 *
 * The `?pryzm2=1` URL flag remains explicitly opt-in for the
 * new-architecture editor scaffold per the convergence plan §5.
 *
 * The router mounts into #platform-root (added to index.html).
 * It never touches #container (the BIM three.js canvas).
 */

import { injectAppTheme } from '../styles/AppTheme';
import { LandingPage } from './LandingPage';
import { CONTACT_MAILTO } from './landingMarkup';
import { AuthModal } from './AuthModal';
import { ProjectHub } from './ProjectHub';
import { projectRepository } from './ProjectRepository';
import { getCurrentUser, signOut, PlatformUser } from './AuthModal';
import { UpgradeModal } from './UpgradeModal';
import { PricingPage } from './PricingPage';
import { PricingPage as MarketingPricingPage } from '../marketing/PricingPage';
import { ManifestoPage } from '../marketing/ManifestoPage';
import { TrustPage } from '../marketing/TrustPage';
import { OwnerFeatureFlags } from '../OwnerFeatureFlags';
import { EngineLoadingOverlay } from './EngineLoadingOverlay';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
// A.5.f — RAC onboarding canvas re-mounted in the editor (the public /start
// surface was retired with the Astro docs-site; per ADR-055 §5.2 RAC runs
// INSIDE app.pryzm.so as the pre-auth onboarding).
import { RACChatbotPanel } from '../onboarding/RACChatbotPanel';
import type { PipelineBrief } from '@pryzm/typology-pipeline';
// A.5.g.4 — RAC→site bootstrap (the G1 seam). Subscribes to the
// `pryzm:onboarding-brief-ready` event this router emits and auto-drives
// create-project → create-Site → generate, so the onboarding journey runs with
// ZERO console commands. The router injects its create+open path so the
// bootstrap reuses the hub's proven flow rather than re-minting project ids.
import { installBriefBootstrap } from '../onboarding/briefBootstrap';
// O.14 (perf/boot) — warm the heavy BIM-engine MODULE download during onboarding
// so the post-brief "Downloading BIM engine…" wait is short. `ensureEngineWarm()`
// is idempotent + best-effort (never throws); the cold `loadEngine()` path in
// `src/main.ts` is the fallback. We import only the warm facade (a ≤90 LOC module
// that does the engine `import()` dynamically), so this static import adds no
// engine bytes to the platform critical-path chunk.
import { ensureEngineWarm } from '@app/engine/engineWarmup';
// §STARTUP-CESIUM-CHUNK-WARM + §STARTUP-BUDGET (founder 2026-08-07, 5× startup) — the Cesium
// counterpart of the engine warm above (same start-earlier-skip-nothing shape), plus the one
// end-to-end startup phase budget every startup perf claim is measured against.
import { ensureCesiumWarm } from '@app/engine/cesiumWarmup';
import { requestEagerGlobeStart, prewarmGlobe } from '@app/engine/eagerGlobeStart';
import { beginStartupBudget, markStartupPhase } from '@app/engine/startupBudget';
// PRYZM-EARTH-ONBOARDING PRD Phase 2 — DOM-free typology-seed resolver (see
// resolveSeededTypologyId.ts header for why this lives outside PlatformRouter).
import { resolveSeededTypologyId } from './resolveSeededTypologyId';
// §L-1186 / §UX1-PHASE-CHROME — the project-open seam declares the app phase.
// `launchWorkspace` is the ONE gesture every project open passes through (hub
// click, deep link, reopen-after-reload, create), and it runs before any editor
// chrome mounts — which is exactly why the declaration belongs here and not in a
// view-change handler that a direct open never reaches. See
// `declarePhaseForProjectOpen` for the full defect note.
import { declarePhaseForProjectOpen } from '../layout/panelDefaults';

/** ADR-055 §7 — marketing routes moved from apps/docs-site/ into the
 *  editor.  Names match the apex pre-render bucket (/, /pricing,
 *  /manifesto, /trust). */
type MarketingRoute = 'pricing' | 'manifesto' | 'trust';

const ROOT_ID = 'platform-root';
const HASH_LANDING = '#/';
const HASH_PROJECTS = '#/projects';

// §PERF-WEBGPU-FRAGMENT / ADR-0076 — renderer-backend-toggle reopen-project keys.
//   LAST_OPEN_PROJECT_KEY — written by launchWorkspace on every project open.
//   REOPEN_AFTER_RELOAD_KEY — set by RendererBackendToggle just before it reloads;
//     read once on the next boot to relaunch LAST_OPEN_PROJECT_KEY's project.
const LAST_OPEN_PROJECT_KEY   = 'pryzm.lastOpenProject';
const REOPEN_AFTER_RELOAD_KEY = 'pryzm.reopenProjectAfterReload';

/**
 * §FIX-CREATE-TIMEOUT-RETRY (L-132) — turn a project-create failure into a
 * short, human, retriable message for the loading overlay's error state.
 *
 * The persistence layer now rejects with a typed `ProjectListClientError`
 * (`kind` + `retriable`) on a timeout / connection blip instead of hanging, so
 * we can say "couldn't reach the server, try again" for transient transport
 * failures (the Fly-redeploy window the founder's push→test loop hits) versus a
 * generic message for everything else. Duck-typed on the error shape so this L7
 * file doesn't take a value import from the persistence package.
 */
function describeCreateFailure(err: unknown): string {
    const e = err as { kind?: string; retriable?: boolean } | null | undefined;
    if (e && (e.kind === 'timeout' || e.kind === 'network-error')) {
        return "Couldn't reach the server to create your project — check your connection and try again.";
    }
    if (e && e.kind === 'unauthenticated') {
        return 'Your session expired — please sign in again to create a project.';
    }
    if (e && (e.retriable === true || e.kind === 'server-error')) {
        return 'The server had a hiccup creating your project — please try again.';
    }
    return 'Could not create the project.';
}

export class PlatformRouter {
    private root: HTMLElement;
    private landing: LandingPage | null = null;
    private auth: AuthModal | null = null;
    private hub: ProjectHub | null = null;
    private pricing: PricingPage | null = null;
    /** ADR-055 §7 marketing surface — one slot reused across the three
     *  routes (pricing / manifesto / trust); switching routes disposes
     *  the previous page so only one is mounted at a time. */
    private marketing: { dispose(): void } | null = null;
    /** A.5.f — RAC onboarding canvas slot (one at a time, like `marketing`). */
    private onboarding: { dispose(): void } | null = null;
    /** A.5.f — the brief the RAC conversation captured, handed to the editor
     *  after auth (A.5.g project pre-load reads this; no `window` per P4). */
    private capturedBrief: PipelineBrief | null = null;
    /**
     * Phase A.4 — the composed `PryzmRuntime` handle passed to
     * `start(runtime)`.  Exposed `public readonly` so Phase B+ panels
     * can reach it via `router.runtime` once they widen their
     * constructors per §16.2.  Phase A itself does not consume it,
     * which is why the field is `public` rather than `private` —
     * a `private` declaration trips `noUnusedLocals` until the first
     * Phase B reader lands.
     */
    public readonly runtime: PryzmRuntime;
    private popStateHandler: ((e: PopStateEvent) => void) | null = null;
    /**
     * O.15 RESIDUAL — the single engine-loading overlay for the current
     * open gesture.  Held on the router (not minted inside
     * `_openProjectViaRuntime`) so the brief→create path can paint it
     * SYNCHRONOUSLY — before the `await client.create` hop — closing the
     * sub-second blank that used to show between hiding the hub and the
     * loader.  `_ensureEngineLoadingOverlay()` is show-once/idempotent:
     * the first caller constructs + shows it; later callers (the existing
     * `_openProjectViaRuntime` mount) reuse the same instance, so there is
     * no double-mount flash.  Cleared on hide/error so the next open
     * gesture mints a fresh overlay.
     */
    private engineOverlay: EngineLoadingOverlay | null = null;

    /**
     * §FIX-OPEN-GESTURE-ONCE (L-1282) — the project id whose open gesture is
     * currently in flight, or `null` when none is.
     *
     * Holds an ID rather than a boolean on purpose: the question `launchWorkspace`
     * must answer is "is THIS project already opening?", not "is anything
     * opening?". A boolean would silently swallow a genuine open of project B
     * issued while A is loading — the failure mode that WAS live one layer down in
     * `buildPersistence`'s `openProjectInflight`, which coalesced on nothing at all
     * and handed B's caller A's promise.
     *
     * ✅ That layer is now fixed too (§FIX-OPEN-COALESCE-KEYED-ON-NOTHING): identity
     * is compared before the in-flight promise is reused, and a different id
     * SUPERSEDES rather than silently resolving with the wrong project. This
     * comment previously said "not fixed here (it is a different layer's row)" —
     * true when written, stale now, and left uncorrected it would send the next
     * reader looking for a defect that is closed.
     *
     * Released in `_openProjectViaRuntime`'s `finally` — see the note there for why
     * a latch that survives a failed open would be a regression.
     */
    private _openGestureProjectId: string | null = null;

    private constructor(
        root: HTMLElement,
        runtime: PryzmRuntime,
    ) {
        this.root = root;
        this.runtime = runtime;
        injectAppTheme();
    }

    /**
     * Entry point — called from `src/main.ts` after `composeRuntime()`
     * resolves.  Phase A.4 (S73-WIRE) typed signature: single `runtime`
     * argument.  The legacy-engine bootstrap is no longer wired through
     * the router (it was a Phase A regression); per §16.3 C.3.01 +
     * §16.4 D.4 the legacy engine boot is invoked by the
     * `workspace bridge (D.4)` injected into `composeRuntime` and lives
     * behind `runtime.persistence.openProject(id)`.
     *
     * @param runtime  The composed `PryzmRuntime` handle.  In Phase A
     *                 the router holds it for Phase B+ to consume; the
     *                 white-UI panels render unchanged.
     */
    static start(runtime: PryzmRuntime): void {
        const root = document.getElementById(ROOT_ID);
        if (!root) {
            // No platform root → nothing to mount.  This branch was
            // historically a "fall back to running engine directly"
            // escape hatch; with the composed runtime it would be a
            // bug to reach here, so we log loudly and bail.
            console.error('[PlatformRouter] #platform-root not found, white UI cannot mount.');
            return;
        }

        const router = new PlatformRouter(root, runtime);

        // Phase 10: Early Access Banner — shown when earlyAccessMode flag is true
        if (OwnerFeatureFlags.isEnabled('earlyAccessMode')) {
            PlatformRouter._mountEarlyAccessBanner();
        }

        // Phase 10: gate Stripe upgrade modal on showStripeUpgrade flag
        // Initialize global upgrade modal listener — handles 'pryzm-upgrade-required' events
        // dispatched by AI factories (maintains layer separation — AI layer uses events, not imports)
        if (OwnerFeatureFlags.isEnabled('showStripeUpgrade')) {
            UpgradeModal.globalInit(() => router.showPricing());
        }

        // F.6.3 Wave 14 — runtime.shortcuts wiring (keyboard dispatch facade).
        // Phase F stub: register returns a no-op disposer; dispatch is a no-op.
        // Phase C.shortcuts wires the real global key handler.
        if (runtime?.shortcuts) {
            const _shortcutDisposer = runtime.shortcuts.register('Escape', () => {
                console.debug('[PlatformRouter] Escape shortcut routed via runtime.shortcuts');
            });
            void _shortcutDisposer;
        }

        // F.6.4 Wave 14 — runtime.toast wiring (toast notification facade).
        // Phase F stub: show/info/success/warn/error are all no-ops.
        // Phase C.toast wires the real toast overlay.
        if (runtime?.toast) {
            const _toastFacade = runtime.toast;
            console.debug('[PlatformRouter] Wave 14 runtime.toast wired', typeof _toastFacade.show);
        }

        // F.6.5 Wave 14 — runtime.search.run wiring (global search facade).
        // Phase F stub: run() returns []; Phase C.search wires real search index.
        if (runtime?.search) {
            const _searchFacade = runtime.search;
            console.debug('[PlatformRouter] Wave 14 runtime.search wired', typeof _searchFacade.run);
        }

        // A.5.g.4 — wire the RAC→site bootstrap ONCE (the G1 seam). On
        // `pryzm:onboarding-brief-ready` (emitted by showAuth's onSuccess below)
        // it auto-drives create-project → create-Site → generate, so the
        // onboarding journey completes with zero console commands. We inject the
        // router's create+open path (`createAndOpenProject`) so the bootstrap
        // reuses the hub's proven flow; `installBriefBootstrap` is idempotent
        // (keyed off the runtime) so a re-entrant `start()` cannot double-fire.
        installBriefBootstrap(runtime, {
            createAndOpenProject: (name: string) => router.createAndOpenProject(name),
        });

        // pryzm-open-project — fired by ExistingProjectsPanel when user clicks a project
        // from inside the workspace. Re-launches the workspace with the chosen project.
        window.addEventListener('pryzm-open-project', (e: Event) => {
            const { id, name } = (e as CustomEvent).detail ?? {};
            if (id && name) {
                router.launchWorkspace(id, name);
            }
        });

        // CDE hub-menu events — fired by PlatformShell toolbar logo dropdown.
        // §33-NAV-FIX: these are PLATFORM-lifetime navigation events. PlatformRouter
        // outlives any single project's `runtime` (and is constructed before the
        // first runtime is composed), so listening via `window.runtime?.events?.on`
        // at boot silently registered nothing — `window.runtime` was undefined and
        // `?.` short-circuited. The hub-menu "Projects" / "Sign out" buttons then
        // emitted into the void. Platform-nav events travel on the always-present
        // `window` bus; every emitter also `window.dispatchEvent`s them.
        window.addEventListener('pryzm-go-hub', () => { // §33-NAV-FIX
            const u = getCurrentUser();
            // Re-show platform root (hidden by launchWorkspace) and navigate to hub
            const platformRoot = document.getElementById(ROOT_ID);
            // §BACK-TO-PROJECT (2026-05-23) — the architect reported "Back to
            // Projects" not working. This proves the handler fired and records the
            // navigation decision so a silent no-op is no longer opaque in the logs.
            console.log(
                `[PlatformRouter] §BACK-TO-PROJECT pryzm-go-hub fired — user=${u ? 'present' : 'null'} ` +
                `platformRoot=${platformRoot ? 'found' : 'MISSING'} → ${u ? 'showHub' : 'showLanding'}`,
            );
            if (platformRoot) {
                platformRoot.style.display = '';
                platformRoot.style.opacity = '1';
                platformRoot.style.pointerEvents = '';
                platformRoot.style.transition = 'opacity 0.35s ease';
                // §BACK-TO-PROJECT — the editor's body-mounted chrome (toolbars,
                // floating panels, HUDs, inline editors) can carry a z-index ABOVE
                // the platform root's static 9990 (index.html), so merely un-hiding
                // the root left editor UI floating over the hub → "Back to Projects
                // did nothing." Raise the root above ALL editor chrome while the hub
                // is shown; launchWorkspace sets display:none again on the next open,
                // so this elevation is inert during editing.
                platformRoot.style.zIndex = '2147483000';
            } else {
                console.error('[PlatformRouter] §BACK-TO-PROJECT — #platform-root MISSING; cannot mount hub in place.');
            }
            try {
                if (u) {
                    router.hub?.destroy();
                    router.hub = null;
                    router.showHub(u);
                } else {
                    router.showLanding();
                }
            } catch (err) {
                console.error('[PlatformRouter] §BACK-TO-PROJECT — showHub/showLanding threw (hub will not appear):', err);
            }
        });

        window.addEventListener('pryzm-sign-out', () => { // §33-NAV-FIX — platform-lifetime bus (see pryzm-go-hub above)
            // §FIX-SIGN-OUT-IS-A-DESTRUCTIVE-ACT (L-10401) — `signOut()` now returns
            // false when the user declines a warning about work that exists only in
            // this browser. Honour it: navigating to the landing page after a
            // cancelled sign-out would tear down the hub while the session is still
            // live, which reads as "it signed me out anyway".
            if (!signOut()) return;
            const platformRoot = document.getElementById(ROOT_ID);
            if (platformRoot) {
                platformRoot.style.display = '';
                platformRoot.style.opacity = '1';
                platformRoot.style.pointerEvents = '';
            }
            router.hub?.destroy();
            router.hub = null;
            router.showLanding();
        });

        // §06 §10 — Register popstate listener for browser back/forward navigation
        router.popStateHandler = (e: PopStateEvent) => {
            const state = e.state as { view?: string } | null;
            const user = getCurrentUser();
            if (state?.view === 'hub' && user) {
                router.showHub(user);
            } else {
                const u = getCurrentUser();
                if (u) {
                    router.showHub(u);
                } else {
                    router.showLanding();
                }
            }
        };
        window.addEventListener('popstate', router.popStateHandler);

        // ADR-055 §7 — honor `?page=pricing|manifesto|trust` on initial
        // load so the apex pre-render step can deep-link customers to a
        // marketing route on first paint without bouncing through the
        // landing page first.  Mounted on top of either the landing or
        // the hub so "Back" routes correctly.
        const initialPage = new URLSearchParams(window.location.search).get('page');
        if (initialPage === 'pricing' || initialPage === 'manifesto' || initialPage === 'trust') {
            const user = getCurrentUser();
            document.querySelector('[data-pryzm-skeleton="landing"]')?.remove();
            if (user) router.showHub(user); else router.showLanding();
            router.showMarketing(initialPage);
            return;
        }
        // A.5.f — `?page=signup` (or `?page=start`) deep-links straight into the
        // RAC onboarding canvas, so the apex landing's "Build something" link
        // (→ app.pryzm.so/signup) lands the visitor in the conversation on first
        // paint. Only for signed-OUT visitors; a signed-in user goes to the hub.
        if (initialPage === 'signup' || initialPage === 'start') {
            document.querySelector('[data-pryzm-skeleton="landing"]')?.remove();
            const user = getCurrentUser();
            if (user) { router.showHub(user); return; }
            // O.1 (auth-first) — the apex "Start here" deep-link now opens AUTH
            // first; the RAC onboarding runs post-auth for new users (the
            // showAuth.onSuccess branch decides hub-vs-onboarding by project count).
            router.showLanding();
            router.showAuth();
            return;
        }
        // A.5.f — `?page=signin` opens the auth modal directly (apex "Log in" →
        // /sign-in → server §3.2.2 redirect → ?page=signin). Landing renders as
        // the blurred backdrop behind the modal; a signed-in visitor skips to hub.
        if (initialPage === 'signin') {
            document.querySelector('[data-pryzm-skeleton="landing"]')?.remove();
            const user = getCurrentUser();
            if (user) { router.showHub(user); return; }
            router.showLanding();
            router.showAuth();
            return;
        }

        // §06 §10 — Read hash on initial load to restore correct view.
        // Both #/ and #/projects land on the hub when a session exists —
        // the hash encodes browser-history state, not access control.
        const user = getCurrentUser();
        if (user) {
            // Wave 1.5 (paint-on-first-byte) — signed-in users skip the landing
            // entirely; remove the inline boot skeleton from index.html before
            // showHub mounts.  `showLanding()` removes it via LandingPage's
            // constructor, but the hub path bypasses LandingPage.
            document.querySelector('[data-pryzm-skeleton="landing"]')?.remove();

            // §PERF-WEBGPU-FRAGMENT / ADR-0076 — if a renderer-backend toggle just
            // reloaded the page, REOPEN the project the user was in instead of
            // dumping them at the hub. The reopen flag + last-open project both live
            // in sessionStorage; consume (clear) them so a normal future reload that
            // is NOT toggle-driven still lands on the hub.
            if (router._tryReopenProjectAfterReload()) return;

            router.showHub(user);
        } else {
            router.showLanding();
        }
    }

    /**
     * §PERF-WEBGPU-FRAGMENT / ADR-0076 — consume the renderer-toggle reopen request.
     *
     * Returns true (and launches the workspace) when BOTH the reopen flag and a
     * valid last-open project are present in sessionStorage. Always clears the
     * one-shot reopen flag so it fires exactly once. Returns false otherwise so the
     * caller falls through to the hub.
     */
    private _tryReopenProjectAfterReload(): boolean {
        let reopen: string | null = null;
        let raw: string | null = null;
        try {
            reopen = sessionStorage.getItem(REOPEN_AFTER_RELOAD_KEY);
            // The reopen flag is one-shot — clear it now regardless of outcome.
            if (reopen) sessionStorage.removeItem(REOPEN_AFTER_RELOAD_KEY);
            raw = sessionStorage.getItem(LAST_OPEN_PROJECT_KEY);
        } catch { return false; }

        if (!reopen || !raw) return false;

        try {
            const { projectId, projectName } = JSON.parse(raw) as {
                projectId?: string; projectName?: string;
            };
            if (!projectId) return false;
            console.log(
                `[PlatformRouter] §PERF-WEBGPU-FRAGMENT reopening "${projectName ?? projectId}" ` +
                `after renderer-backend toggle reload.`,
            );
            this.launchWorkspace(projectId, projectName ?? 'Project');
            return true;
        } catch {
            return false;
        }
    }

    private showLanding(): void {
        this.hub?.destroy();
        this.hub = null;
        this.auth?.destroy();
        this.auth = null;

        // §06 §10 — Reflect landing state in URL
        history.replaceState({ view: 'landing' }, '', HASH_LANDING);

        this.landing = new LandingPage(this.root, {
            onGetStarted: () => {
                // O.1 (auth-first, 2026-06-03 — ONBOARDING-WORKFLOW-DESIGN) —
                // "Get started" now opens AUTH first. Post-auth we branch
                // (showAuth.onSuccess): returning users (have projects) → hub;
                // first-time users → RAC onboarding. The brief is captured
                // POST-auth so the project is owned from creation (cleaner than
                // the prior RAC-first → brief-survives-auth path).
                this.showAuth();
            },
            onLogin: () => {
                // Keep landing page alive — it shows as blurred background behind auth modal
                this.showAuth();
            },
            // ADR-055 §7 — landing's "Pricing" link goes to the marketing
            // comparison surface (the entitlement-registry table from
            // pricing.astro).  The Stripe upgrade flow (showPricing()) is
            // still reachable from the hub's "Upgrade" button and from
            // marketplace events; it is NOT the landing-page destination.
            onPricing: () => this.showMarketing('pricing'),
            // §NAV-MAILTO — reads the ONE authority (C84 EI-9) rather than
            // re-spelling the address. It previously hardcoded a dead one.
            onContactSales: () => window.open(
                `${CONTACT_MAILTO}?subject=${encodeURIComponent('PRYZM enquiry')}`,
                '_blank',
            ),
        });
    }

    private showAuth(): void {
        // Pass this.root so AuthModal mounts inside #platform-root (§06 §3).
        // .am-overlay is position:fixed so it visually covers the full viewport.
        // The landing page is intentionally kept alive behind the modal so its
        // backdrop-filter:blur naturally blurs the landing content.
        this.auth = new AuthModal({
            onSuccess: (user: PlatformUser) => {
                this.auth?.destroy();
                this.auth = null;
                // Landing page has served its purpose as background — clean it up now
                this.landing?.destroy();
                this.landing = null;
                this.showHub(user);
                // A.5.g — if RAC onboarding captured a brief before this sign-up,
                // it survived auth on `getCapturedBrief()`. A.5.g.4 closed the
                // wire-up: `installBriefBootstrap` (wired once in `start()`)
                // subscribes to the event emitted below and AUTO-DRIVES
                // create-project → create-Site → generate, so the journey
                // completes with zero console commands. We still emit on the typed
                // runtime bus (not a `window` global, per P4) so the bootstrap —
                // and any other in-editor consumer — can seed off the conversation.
                if (this.capturedBrief) {
                    // Legacy RAC-first path (brief captured BEFORE auth) — still
                    // reachable if onboarding ran while anonymous. Honor it.
                    const brief = this.capturedBrief;
                    this.showHub(user);
                    console.log(
                        '[onboarding] post-auth — captured brief ready; emitting pryzm:onboarding-brief-ready (A.5.g.4 bootstrap auto-drives from here):',
                        { role: brief.role, typology: brief.typologyId },
                    );
                    this.runtime?.events?.emit('pryzm:onboarding-brief-ready', {
                        role: brief.role,
                        typologyId: brief.typologyId,
                        metadata: brief.metadata ?? {},
                    });
                    return;
                }

                // O.1 (auth-first) — the post-auth branch (ONBOARDING-WORKFLOW-DESIGN
                // §3.1): RETURNING users (have projects) land on the hub; FIRST-TIME
                // users (no projects) go straight into RAC onboarding (no empty hub
                // to stare at). Project count comes from the durable LOCAL list
                // (`projectRepository`, sync) — more reliable than the volatile
                // server list today (OI-059) and per-browser, which is the right
                // grain for "have I used this before on this machine".
                const hasProjects = projectRepository.listProjects().length > 0;
                this.showHub(user);
                if (!hasProjects) {
                    console.log('[onboarding] first-time user (no local projects) — opening RAC onboarding post-auth (O.1).');
                    this.showOnboarding();
                }
            },
            onClose: () => {
                this.auth?.destroy();
                this.auth = null;
                // Landing page is still mounted — no need to recreate it.
                // If it was somehow gone (e.g. showAuth called standalone), recreate it.
                if (!this.landing) {
                    this.showLanding();
                }
            },
        }, this.root);
    }

    private showHub(user: PlatformUser): void {
        // Clear landing and pricing if still present
        this.landing?.destroy();
        this.landing = null;
        this.pricing?.destroy();
        this.pricing = null;

        // §06 §10 — Push hub state so back button can return to landing
        history.pushState({ view: 'hub' }, '', HASH_PROJECTS);

        // Phase B/C (S73-WIRE §16.2) — thread the composed runtime to the
        // hub so C.2.02 (`runtime.persistence.client.create(name)`) and the
        // C.1.x list / store-subscribe paths can resolve.  Without this the
        // hub falls back to the legacy `apiFetch('/api/projects')` path
        // whose client-generated UUID id is rejected by the server's
        // `proj-TIMESTAMP-ALPHANUM` regex (server.js POST /api/projects)
        // and also ignored entirely on the pgPool branch — the resulting
        // server id mismatch is what produced the
        // `[persistence.openProject] project not found` failure on every
        // newly-created project open.
        // §FIX-HUB-GRID-LISTENER-STACK (L-1281) — DESTROY any hub still mounted
        // before minting another. `showAuth.onSuccess` can reach `showHub` twice on
        // one sign-in, and without this the previous `ProjectHub` stayed in the DOM
        // with its own `#ph-grid`, its own document-level listeners and its own
        // sync timers — a second, invisible multiplier on the "one click, three
        // opens" defect this lane closed in `ProjectHub.attachGridListeners`.
        // Duplicate element ids also make `querySelector('#ph-grid')` answer about
        // the WRONG hub, which is how the surviving one would win the click.
        this.hub?.destroy();
        // §PERF100 (L-11440) — the hub CONSTRUCTOR kicks off `_warmThenSync`, so this mark
        // is the start of every leg of hub work the founder's 44.2 s hole contained.
        markStartupPhase('hub:mount-start');
        this.hub = new ProjectHub(this.root, user, {
            onOpenProject: (projectId: string, projectName: string, opts?: { isNewProject?: boolean }) => {
                this.launchWorkspace(projectId, projectName, opts);
            },
            onSignOut: () => {
                this.hub?.destroy();
                this.hub = null;
                this.showLanding();
            },
            onUpgrade: () => this.showPricing(),
            // O.5 (ONBOARDING-WORKFLOW-DESIGN §6 O.5) — the hub's "New Project"
            // primary action now launches the guided RAC onboarding instead of a
            // blank create, seeded by the modal (name + project type). The RAC
            // conversation + briefBootstrap then create+open the project and run
            // site → generate. The hub keeps a "Skip — blank canvas" escape that
            // still does the legacy blank `_createViaRuntime`. We destroy the hub
            // first so the onboarding overlay owns the surface (the bootstrap
            // re-mounts the hub-equivalent flow on completion via launchWorkspace).
            onStartOnboarding: (seedFromModal?: { name?: string; projectType?: string; directEntry?: boolean }) => {
                this.showOnboarding(seedFromModal);
            },
        }, this.runtime);
    }

    /**
     * Mount one of the three customer-facing marketing routes
     * (pricing / manifesto / trust) per ADR-055 §7.  Replaces the
     * previous Astro pages 1:1 inside the editor's L7 surface so the
     * apex pre-render step can hit the same components.
     *
     * Reuses a single `this.marketing` slot — switching routes disposes
     * the previous page so the DOM never holds two marketing surfaces
     * at once.  "Sign in" routes back to AuthModal; "Back" returns to
     * the landing page; the three inter-route links cycle inside this
     * helper.
     */
    showMarketing(page: MarketingRoute): void {
        this.marketing?.dispose();
        this.marketing = null;

        const callbacks = {
            onSignIn: () => {
                this.marketing?.dispose();
                this.marketing = null;
                this.showAuth();
            },
            onBack: () => {
                this.marketing?.dispose();
                this.marketing = null;
                const u = getCurrentUser();
                if (u) this.showHub(u);
                else this.showLanding();
            },
            onPricing: () => this.showMarketing('pricing'),
            onManifesto: () => this.showMarketing('manifesto'),
            onTrust: () => this.showMarketing('trust'),
        };

        switch (page) {
            case 'pricing':
                this.marketing = new MarketingPricingPage(document.body, callbacks);
                break;
            case 'manifesto':
                this.marketing = new ManifestoPage(document.body, callbacks);
                break;
            case 'trust':
                this.marketing = new TrustPage(document.body, callbacks);
                break;
        }
    }

    /**
     * A.5.f — mount the RAC onboarding canvas (the "Build something" entry).
     * Replaces the public Astro `/start` surface retired with the docs-site;
     * per ADR-055 §5.2 / C51 §5.2 the RAC conversation runs INSIDE the app as
     * the pre-auth onboarding. Sources the `TypologyRegistry` from the composed
     * runtime. When the 4-question conversation reaches `ready`, the captured
     * brief is stashed on `this.capturedBrief` (read post-auth by the project
     * pre-load, A.5.g) and the user continues to the auth/signup modal.
     *
     * If the runtime has no typology registry (degraded boot), falls back to
     * the auth modal directly so "Build something" never dead-ends.
     */
    // O.5 — the modal's `projectType` → registered-typology-id mapping, and the
    // PRYZM-EARTH-ONBOARDING PRD Phase 2 `directEntry` default, now live in
    // `resolveSeededTypologyId.ts` (a DOM-free module so the routing decision is
    // directly unit-testable — see that file's header for why this router
    // itself cannot be imported under the app's node-environment vitest config).

    showOnboarding(seed?: { name?: string; projectType?: string; directEntry?: boolean }): void {
        this.onboarding?.dispose();
        this.onboarding = null;

        // O.14 (perf/boot) — START the heavy BIM-engine MODULE download NOW, while
        // the user is in the RAC role/brief/location/draw steps (several seconds).
        // By the time the brief CTA fires create→site→generate→openProject→ensure()
        // → loadEngine(), the 2.6 MB engine chunk is already downloaded + evaluated
        // (shared cached promise in engineWarmup), so the "Downloading BIM engine…"
        // overlay stage is short. Fire-and-forget + best-effort: a warm failure
        // never blocks onboarding (the cold loadEngine() path in main.ts is the
        // fallback). The project-dependent bootstrap() (scene/builders/tools/UI on
        // the real #container canvas + open project) deliberately STAYS late — it
        // needs a live canvas + project context that don't exist yet.
        ensureEngineWarm();
        // §STARTUP-BUDGET — one measured run per project-startup attempt, from here to
        // §ENTER-CANVAS. §STARTUP-CESIUM-CHUNK-WARM — start the Cesium viewport chunk download
        // NOW (the globe mounts on the location step seconds from now; the user's reading/typing
        // time is free download time — same trade as ensureEngineWarm above, L-433 residual).
        beginStartupBudget();
        markStartupPhase('onboarding:shown');
        markStartupPhase('cesium:warm-start');
        ensureCesiumWarm();
        // §STARTUP-EAGER-GLOBE (founder 2026-08-10) — beyond warming the CHUNK, ask the engine
        // boot this onboarding is about to trigger to CONSTRUCT + MOUNT the Cesium viewer
        // eagerly (warm-hidden), in parallel with the rest of the boot, so the location step's
        // `toggleGIS(true)` is a visibility flip instead of a cold viewer construction. One-shot;
        // consumed by `mountGISArea` during the boot.
        requestEagerGlobeStart();
        // §STARTUP-GLOBE-PREWARM (founder 2026-08-24: "PRYZM Earth should come INSTANTLY", L-10560)
        // — the flag above was correct and its CONSUMER was in the wrong place. `mountGISArea` is
        // reached from `initUI`, the LAST stage of `engineLauncher.bootstrap()`, so on the
        // founder's own §STARTUP-BUDGET run the Cesium chunk was warm at 122 ms and the viewer did
        // not begin constructing until `globe:eager-init-start +2633ms`. Everything between those
        // two marks is `initScene → initBuilders → initTools → initBusHandlers → registerAllStores
        // → initDataPlatform`, and the onboarding globe uses none of it.
        //
        // So CONSTRUCT + MOUNT the viewport HERE, warm-hidden, in genuine parallel with the boot
        // that has not started yet; `mountGISArea` ADOPTS it (`consumePrewarmedGlobe()`) instead
        // of constructing one. Same two verbs as `rendererPrewarm` / `consumePrewarmedRenderer`,
        // which already did exactly this for the WebGPU renderer.
        //
        // ⛔ This changes WHEN the globe is BUILT, never WHO decides it is SHOWN — it mounts
        // warm-hidden and the reveal stays the location step's `pryzmToggleGIS(true)`.
        // ⛔ Best-effort: if the prewarm never fires or fails, `mountGISArea` constructs cold
        // exactly as before. There is no path where the globe fails to appear because of this.
        // ⚠ `#container` is a STATIC element of index.html (it lives under `#dck-workspace`, behind
        // `#platform-root`'s z-index 9990), so it is laid out with real dimensions at this point —
        // which is precisely what the eager path needs and what the old 0×0 mount lacked.
        prewarmGlobe({
            parent: document.getElementById('container'),
            runtime: this.runtime ?? null,
        });

        const registry = this.runtime?.typology?.registry;
        if (!registry) {
            console.warn('[PlatformRouter] showOnboarding — no typology registry on runtime; opening auth directly.');
            this.showAuth();
            return;
        }

        // O.5 / PRYZM-EARTH-ONBOARDING PRD Phase 2 — resolve the typology id the
        // RAC-skip branch below seeds with. `resolveSeededTypologyId` (DOM-free,
        // unit-tested) maps the legacy modal's `projectType` to a registered
        // typology id, OR — per the founder's explicit Phase 2 instruction
        // ("after click new project - go directly to PRYZM EARTH") — defaults to
        // `'apartment'` when `seed.directEntry` is set (the no-modal "+ New
        // Project" gesture), so the existing authed+seededTypologyId bypass below
        // fires and RAC is skipped entirely. See that module's header for the
        // full reasoning and PRD §14 for what this defers.
        const seededTypologyId = resolveSeededTypologyId(seed, (id: string) => registry.has(id));
        const seededName = seed?.name?.trim();
        const seedMetadata: Record<string, unknown> = {};
        if (seededName) seedMetadata.projectName = seededName;
        if (seed?.projectType) seedMetadata.projectType = seed.projectType;
        if (seed) {
            console.log('[onboarding] showOnboarding seeded:', {
                name: seededName ?? '(none)',
                projectType: seed.projectType ?? '(none)',
                directEntry: seed.directEntry ?? false,
                seededTypologyId: seededTypologyId ?? '(none — conversation will ask)',
            });
        }

        // IT-4e (founder 2026-06-11: "remove [the PROJECT BRIEF panel] — I believe
        // everything is covered on the modal now") — for the GUIDED path (an authed
        // user who picked a typology in the New-Project modal) the live "Design your
        // house — live" modal now owns the WHOLE program brief (floors / bedrooms /
        // bathrooms / sizes / design sliders), so the separate RAC PROJECT-BRIEF panel
        // is redundant. SKIP it and drive the proven pipeline directly (create project →
        // location → draw-or-skip → generate → live modal) with a default brief; the
        // user adjusts the program live in the modal. The standalone anonymous "Build
        // something" RAC entry (NOT authed, or no seeded typology) still shows the panel
        // below — it also owns lead capture + the auth handoff. Reversible + scoped:
        // gated on authed + a generator-ready seeded typology; everything else unchanged.
        if (getCurrentUser() && seededTypologyId) {
            // Mirror the authed onBriefReady branch's hub-flash suppression (O.15):
            // hide #platform-root synchronously before the async create→generate chain.
            const platformRoot = document.getElementById(ROOT_ID);
            if (platformRoot) platformRoot.style.display = 'none';
            history.replaceState({ view: 'onboarding' }, '', '#/start');
            console.log(
                '[onboarding] IT-4e — PROJECT-BRIEF panel skipped (authed + seeded "'
                + seededTypologyId + '"); the live modal owns the brief. '
                + 'Emitting pryzm:onboarding-brief-ready with defaults.',
            );
            this.runtime?.events?.emit('pryzm:onboarding-brief-ready', {
                role: 'architect',
                typologyId: seededTypologyId,
                metadata: seedMetadata,
            });
            return;
        }

        const panel = new RACChatbotPanel({
            registry,
            ...(seededTypologyId ? { seedTypologyId: seededTypologyId } : {}),
            ...(Object.keys(seedMetadata).length ? { seedMetadata } : {}),
            // DEMO-1 — skip the persona/profile (role) step for guided onboarding
            // seeded from the New-Project modal. The role is immaterial to house/
            // apartment generation, so default to 'architect' (the value the brief
            // already defaulted to) and jump straight to the site/brief step. Gated on
            // seededTypologyId so the standalone "Build something" RAC entry still asks.
            ...(seededTypologyId ? { seedRole: 'architect' as const } : {}),
            onBriefReady: (brief) => {
                // A.5.f — the conversation captured role · team size · typology ·
                // brief. Stash for the post-auth project pre-load (A.5.g) and
                // fire-and-forget the lead to /api/leads (A.5.e) so it survives
                // even if the visitor abandons sign-up. Then open the auth modal.
                this.capturedBrief = brief;
                void this.captureLead(brief);
                this.onboarding?.dispose();
                this.onboarding = null;
                // O.1 (auth-first) — onboarding now runs POST-auth, so a signed-in
                // user is NOT shown the auth modal again: emit the brief and let
                // A.5.g.4's bootstrap auto-drive create-project → site → generate.
                // Only an anonymous visitor (legacy RAC-first reachability) still
                // hands off to the auth modal.
                if (getCurrentUser()) {
                    // O.15 — KILL THE HUB FLASH. For a first-time authed user the
                    // Project Hub is mounted UNDER this onboarding overlay (see
                    // showAuth.onSuccess: showHub(user) then showOnboarding()).
                    // Disposing the overlay above un-covers the hub, and the
                    // EngineLoadingOverlay is not mounted until the async
                    // createAndOpenProject → client.create → project-loaded chain
                    // completes — so the hub repainted for ~1s between the brief
                    // CTA and the loader. Hide #platform-root SYNCHRONOUSLY now,
                    // before the async chain, so the transition goes straight from
                    // the brief panel to the loader with no intermediate hub paint.
                    // (`_openProjectViaRuntime` sets this again later — idempotent;
                    // `pryzm-go-hub` re-shows the root if the user navigates back.)
                    const platformRoot = document.getElementById(ROOT_ID);
                    if (platformRoot) {
                        platformRoot.style.display = 'none';
                        console.log('[onboarding] O.15 — hid #platform-root pre-generate to suppress the hub flash before the loader.');
                    }
                    console.log('[onboarding] brief captured (authed) — emitting pryzm:onboarding-brief-ready (A.5.g.4 bootstrap):', { role: brief.role, typology: brief.typologyId });
                    this.runtime?.events?.emit('pryzm:onboarding-brief-ready', {
                        role: brief.role,
                        typologyId: brief.typologyId,
                        metadata: brief.metadata ?? {},
                    });
                } else {
                    this.showAuth();
                }
            },
        });

        const el = panel.build();
        el.classList.add('rac-onboarding-overlay');
        this.root.appendChild(el);
        // §06 §10 — reflect the onboarding view in the URL for back-nav.
        history.replaceState({ view: 'onboarding' }, '', '#/start');
        this.onboarding = { dispose: () => panel.dispose() };
    }

    /**
     * A.5.g (handoff) — the brief the RAC onboarding conversation captured
     * (role · team size · typology · brief), or `null` if onboarding hasn't
     * completed this session. The post-auth project pre-load reads this to seed
     * the first project from the conversation instead of starting blank.
     */
    getCapturedBrief(): PipelineBrief | null {
        return this.capturedBrief;
    }

    /**
     * A.5.e — fire-and-forget the captured brief to `/api/leads` so the lead
     * survives even if the visitor abandons sign-up. Best-effort: any failure
     * is swallowed (lead capture must never block onboarding). `keepalive`
     * lets the request complete across the navigation to the auth modal.
     */
    private async captureLead(brief: PipelineBrief): Promise<void> {
        const md = brief.metadata ?? {};
        try {
            await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body: JSON.stringify({
                    source: 'rac-onboarding',
                    role: brief.role,
                    typology: brief.typologyId,
                    teamSize: md.teamSize,
                    briefText: md.brief ?? md.briefText,
                    email: md.email,
                }),
            });
        } catch (err) {
            console.warn('[onboarding] lead capture failed (non-blocking):', err);
        }
    }

    showPricing(): void {
        // Phase 10: gate pricing page on showPricingPage owner flag
        if (!OwnerFeatureFlags.isEnabled('showPricingPage')) {
            console.log('[PlatformRouter] Pricing page disabled by owner feature flag.');
            return;
        }
        this.pricing?.destroy();
        this.pricing = null;

        const user = getCurrentUser();
        this.pricing = new PricingPage(document.body, {
            onBack: () => {
                this.pricing?.destroy();
                this.pricing = null;
                // Refresh the hub user data (plan may have changed)
                const updatedUser = getCurrentUser();
                if (updatedUser) {
                    this.hub?.destroy();
                    this.hub = null;
                    this.showHub(updatedUser);
                }
            },
            onSelectPlan: (_plan) => {
                // Plan selection handled inside PricingPage.applyPlanLocally()
            },
        });
        void user; // suppress unused warning
    }

    /** Phase 10: Mounts a fixed amber Early Access banner at the top of the page. */
    private static _mountEarlyAccessBanner(): void {
        if (document.getElementById('eab-banner')) return; // already mounted
        const banner = document.createElement('div');
        banner.id = 'eab-banner';
        banner.className = 'eab-banner';
        banner.setAttribute('role', 'status');
        banner.innerHTML = `
            ⚡ Early Access: This is a pre-release version. Expect breaking changes and incomplete features.
            <button class="eab-dismiss" aria-label="Dismiss early access banner" title="Dismiss">×</button>
        `;
        banner.querySelector('.eab-dismiss')?.addEventListener('click', () => banner.remove());
        document.body.prepend(banner);
        console.log('[PlatformRouter] Early Access banner mounted.');
    }

    /**
     * A.5.g.4 — create a brand-new project and open it via the canonical
     * runtime path, then hand off to `launchWorkspace`. This is the SAME
     * create+open contract the hub's "New project" button uses
     * (`runtime.persistence.client.create(name)` → open with
     * `{ isNewProject: true }`), exposed here so the brief-bootstrap
     * (`installBriefBootstrap`) can reuse it rather than duplicating the
     * server-id-reconciliation logic. Fire-and-forget; every failure is logged
     * and swallowed so it never throws into the onboarding/auth flow.
     *
     * NOTE: we deliberately do NOT mirror the project into the legacy
     * localStorage repo here (ProjectHub does that for its sidebar readers) —
     * the bootstrap path drops the user straight into the workspace, and the
     * store is populated atomically by `client.create` (see
     * `buildPersistence.ts`), so the subsequent open resolves the summary
     * without a round-trip.
     */
    createAndOpenProject(name: string): void {
        // O.14 (perf/boot) — safety-net warm. `showOnboarding()` already warms the
        // engine when the guided flow runs, but the captured-brief post-auth branch
        // (showAuth.onSuccess) emits `pryzm:onboarding-brief-ready` WITHOUT calling
        // showOnboarding, so the brief-bootstrap reaches here straight from auth.
        // ensureEngineWarm() is idempotent, so calling it here too just guarantees
        // the download has started by project-create time even on that path; it's a
        // no-op if showOnboarding already kicked it off.
        ensureEngineWarm();

        // O.15 RESIDUAL — paint the engine-loading overlay SYNCHRONOUSLY now,
        // before the async `client.create` hop below. The brief→create path
        // hides `#platform-root` in `onBriefReady` (O.15) and then awaits
        // `client.create` for a beat before `_openProjectViaRuntime` mounts the
        // loader — leaving a sub-second blank (pastel page bg) where neither the
        // hub nor the loader was painted. Showing the overlay here closes that
        // gap: the loader is on screen continuously from the brief CTA through
        // engine boot. `_ensureEngineLoadingOverlay` is show-once, so
        // `_openProjectViaRuntime` reuses this exact instance (no double-mount /
        // no fade-in or progress-timer restart). Done unconditionally — every
        // caller of this method goes on to open a project, so the loader always
        // belongs.
        this._ensureEngineLoadingOverlay();

        void (async () => {
            try {
                if (!this.runtime?.persistence?.client?.create) {
                    console.error('[PlatformRouter] createAndOpenProject — persistence client unavailable; cannot create project.');
                    this._failEngineLoadingOverlay('Could not start a new project.');
                    return;
                }
                console.log(`[PlatformRouter] createAndOpenProject — creating "${name}".`);
                const summary = (await this.runtime.persistence.client.create(name)) as {
                    readonly id: string;
                    readonly name: string;
                };
                if (!summary?.id) {
                    console.error('[PlatformRouter] createAndOpenProject — create returned no id; cannot open.');
                    this._failEngineLoadingOverlay('Could not create the project.');
                    return;
                }
                console.log(`[PlatformRouter] createAndOpenProject — created "${summary.name}" (${summary.id}); opening.`);
                // `launchWorkspace` → `_openProjectViaRuntime` reuses the overlay
                // shown synchronously above (show-once) and owns its hide/error.
                // §L-1186 — `guidedOnboarding` marks THIS open as the create hop of the
                // guided flow, so `launchWorkspace` leaves the phase alone and
                // `OnboardingStepController.start()` gets to declare the globe.
                // `createAndOpenProject` has exactly one caller — `briefBootstrap`, which
                // arms `pryzm-project-loaded` → `startOnboardingStepFlow` before issuing
                // this create — so the flag is a fact about the gesture, not a guess.
                // ⛔ `isNewProject` alone cannot carry this: the hub's "Skip — blank
                // canvas" create is also new and runs no guided flow at all.
                this.launchWorkspace(summary.id, summary.name, { isNewProject: true, guidedOnboarding: true });
            } catch (err) {
                // §FIX-CREATE-TIMEOUT-RETRY (L-132) — the create request now
                // rejects (with a typed, `retriable` ProjectListClientError) on a
                // timeout/connection blip instead of hanging forever. Map that to a
                // human, retriable message on the loader's error state (which offers
                // "Return to Hub" → the user can immediately start the New Project
                // flow again) rather than leaking the raw `[ProjectListClient] …`
                // string. Duck-typed on `kind`/`retriable` so we don't need a
                // cross-package type import here.
                console.error('[PlatformRouter] createAndOpenProject failed (swallowed — onboarding flow unaffected):', err);
                this._failEngineLoadingOverlay(describeCreateFailure(err));
            }
        })();
    }

    private launchWorkspace(
        projectId: string,
        projectName: string,
        opts?: { isNewProject?: boolean; guidedOnboarding?: boolean },
    ): void {
        // §FIX-OPEN-GESTURE-ONCE (L-1282) — ONE gesture must produce ONE open.
        //
        // This guard is defence in depth, NOT the fix: the ×3 in the founder's boot
        // log is `ProjectHub.attachGridListeners` stacking delegated listeners
        // (L-1281), and that is repaired at source. This exists because
        // `launchWorkspace` has FOUR call sites — the `pryzm-open-project` window
        // event, the reopen-after-reload path, the hub callback and the create hop —
        // and any future duplication on any of them lands here. Everything above
        // `_openProjectViaRuntime` (the phase declaration, the sessionStorage write,
        // the overlay mount, an extra `persistence.openProgress` subscription) runs
        // per CALL, not per open; only the hydrate leg downstream is coalesced by
        // `buildPersistence`'s `openProjectInflight`. So a duplicate call was never
        // free even when it looked idempotent.
        //
        // ⚠ Scoped to the SAME project id, and released when the open settles — a
        // user returning to the hub and re-opening the same project must still work.
        // A blanket "one open ever" latch would be a regression wearing a fix's name.
        if (this._openGestureProjectId === projectId) {
            console.log(
                `[PlatformRouter] §FIX-OPEN-GESTURE-ONCE — an open for "${projectId}" is already in flight; ` +
                'ignoring this DUPLICATE call (one gesture, one open).',
            );
            return;
        }
        this._openGestureProjectId = projectId;

        // §PERF100 (L-11440) — the router leg. `hub:open-clicked → open:router-launch` is
        // the delegated-click dispatch + the gesture latch; everything after this is the
        // open pipeline proper.
        markStartupPhase('open:router-launch');
        console.log(`[PlatformRouter] Opening project: "${projectName}" (${projectId})${opts?.isNewProject ? ' [new]' : ''}`);

        // §L-1186 — DECLARE THE APP PHASE FOR THIS OPEN GESTURE, before anything mounts.
        //
        // Every project open reaches this method: a hub card click, the
        // reopen-after-reload path, and the create hops. Opening a project that is not
        // the guided-onboarding create hop IS arriving at the PRYZM canvas, so say so
        // here rather than hoping the user later clicks a BIM view-mode button (which
        // was, literally, the only other thing in the app that moved the phase off the
        // onboarding globe). Without this the launcher rail, the Split View toggle and
        // the View-Properties launcher are skip-mounted for the entire session.
        //
        // Guarded: a phase declaration must never be able to stop a project opening.
        try {
            const phase = declarePhaseForProjectOpen(
                opts?.guidedOnboarding ? { guidedOnboarding: true } : {},
            );
            console.log(`[PlatformRouter] §L-1186 app phase for this open: "${phase}".`);
        } catch (err) {
            console.warn('[PlatformRouter] §L-1186 phase declaration threw (non-fatal):', err);
        }

        // §PERF-WEBGPU-FRAGMENT / ADR-0076 — remember the currently-open project so a
        // renderer-backend toggle (which persists + full-page-reloads) can reopen it
        // after boot instead of dumping the user at the projects hub. Survives the
        // reload via sessionStorage (cleared once consumed on the next boot).
        try {
            sessionStorage.setItem(
                LAST_OPEN_PROJECT_KEY,
                JSON.stringify({ projectId, projectName }),
            );
        } catch { /* sessionStorage unavailable — reopen-after-reload simply won't fire */ }

        // Phase 10: Maintenance Mode — block BIM editor for all users
        if (OwnerFeatureFlags.isEnabled('maintenanceMode')) {
            // §FIX-OPEN-GESTURE-ONCE (L-1282) — this arm never reaches
            // `_openProjectViaRuntime`, so it must release the latch itself or the
            // project becomes permanently unopenable for the rest of the session.
            this._openGestureProjectId = null;
            this._showMaintenanceScreen();
            return;
        }

        // Phase C.3.01 (S74-WIRE) per
        // docs/archive/pryzm3-internal/00_NEW_ARCHITECTURE/phases/audits/PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3:
        //
        //   After: `await runtime.persistence.openProject(id) +
        //          PlatformShell.show('workspace')` (no reload)
        //
        // The single `runtime.persistence.openProject(id)` call:
        //   • hydrates the project list and resolves the summary,
        //   • sets `runtime.projectContext`,
        //   • emits `'persistence.openProgress'` (fetching → hydrating →
        //     painting → done) so the overlay can render progress,
        //   • invokes the `workspace bridge (D.4)` injected into
        //     `composeRuntime` — that bridge lazy-boots the legacy
        //     engine on first open and drives the legacy scene-load /
        //     version-restore / collaboration wiring.
        //
        // No page reload, no `?pryzm2=1` round-trip, no window-global casts
        // reach in this file.
        //
        // The `?pryzm2=1` URL flag remains explicitly opt-in for the
        // new-architecture editor scaffold per the convergence plan §5.
        void this._openProjectViaRuntime(projectId, projectName, opts);
    }

    /**
     * O.15 RESIDUAL — show the engine-loading overlay exactly once for the
     * current open gesture, returning the (possibly pre-existing) instance.
     *
     * The first caller (the brief→create path, BEFORE `await client.create`)
     * constructs the overlay and calls `show()`, so the loader paints
     * synchronously the instant the hub is hidden — there is no blank frame.
     * Subsequent callers (the existing `_openProjectViaRuntime` mount, and
     * the plain hub-open path) reuse the same instance: `show()` is NOT
     * re-invoked, so the fade-in / progress timers never restart and there is
     * no double-mount flash.  The instance is cleared on `hide()`/error (in
     * `_openProjectViaRuntime`) so the next open gesture mints a fresh one.
     */
    private _ensureEngineLoadingOverlay(): EngineLoadingOverlay {
        if (this.engineOverlay) return this.engineOverlay;
        const overlay = new EngineLoadingOverlay(this.runtime);
        overlay.show();
        this.engineOverlay = overlay;
        return overlay;
    }

    /**
     * O.15 RESIDUAL — surface a create-time failure on the synchronously-shown
     * overlay so the loader never strands as a silent spinner when the
     * `createAndOpenProject` create hop fails BEFORE `_openProjectViaRuntime`
     * (where the normal hide/error lives). `showError` self-hides on a timeout
     * and offers "Return to Hub"; we release the instance so a retry mints a
     * fresh one. No-op if no overlay is currently shown.
     */
    private _failEngineLoadingOverlay(message: string): void {
        if (!this.engineOverlay) return;
        this.engineOverlay.showError(message);
        this.engineOverlay = null;
    }

    /**
     * Async helper for `launchWorkspace`.  Drives the canonical
     * Phase C.3.01 wireup via `runtime.persistence.openProject(id)`.
     *
     * Loading UX uses the canonical `EngineLoadingOverlay` (white
     * background + rotating PRYZM pyramid + 5-stage progress) per the
     * §05 §7.6 contract — the overlay is the single source of truth
     * for project-open chrome and must NOT be replaced with ad-hoc
     * spinners (the previous inline `_showWorkspaceLoadingOverlay`
     * regression has been removed).
     */
    private async _openProjectViaRuntime(
        projectId: string,
        projectName: string,
        opts?: { isNewProject?: boolean },
    ): Promise<void> {
        // O.15 RESIDUAL — reuse the overlay if the brief→create path already
        // showed it (BEFORE `await client.create`); otherwise this is the
        // first paint (plain hub-open path).  `_ensureEngineLoadingOverlay`
        // is show-once, so the loader is continuous from the brief CTA through
        // engine boot with no blank frame and no double-mount flash.
        const overlay = this._ensureEngineLoadingOverlay();

        // Subscribe to typed openProgress events.  The pyramid keeps
        // spinning across phase transitions; we only flip the label
        // copy on `painting` to mark the engine-mount handoff.
        // Disposed via the returned `Disposable` in the finally block
        // regardless of success / failure to avoid listener leaks
        // across re-opens.
        let transitioned = false;
        const sub = this.runtime.events.on('persistence.openProgress', (p) => {
            if (p.phase === 'painting' && !transitioned) {
                transitioned = true;
                overlay.transitionToProjectLoad(projectName);
            }
        });

        try {
            // Flow 9 (S81 close-out): forward the `{ isNewProject }` hint
            // through `openProject` → `attachedWorkspace.show` →
            // `PlatformShell.setProjectContext`.  The hint flips
            // PlatformShell.ts:289 onto the explicit-empty branch and
            // skips one full `loadLatestVersionFromServer` round-trip
            // for a project we KNOW was just created (the prior
            // `void opts` was dead plumbing — every brand-new project
            // paid the network round-trip even though the four type
            // signatures in the chain all already declared the slot).
            // OI-059 — always thread the hub's project NAME so that if the server
            // has no record (volatile in-memory store after a restart) the
            // openProject local-restore fallback shows the real name, not the id.
            const hint = {
                name: projectName,
                ...(opts?.isNewProject ? { isNewProject: true } : {}),
            };
            // §PERF100 (L-11440) — `open:persistence-openProject → boot:ensure-requested`
            // is `buildPersistence.openProject` STEP 1 alone: the project-summary resolve,
            // which calls `controller.refresh()` (a server list round-trip) whenever
            // `projectListStore` is still empty. That leg cannot be marked from inside
            // `packages/runtime-composer` without an L3→L7 import, so it is bracketed from
            // here (its only caller) instead.
            markStartupPhase('open:persistence-openProject');
            await this.runtime.persistence.openProject(projectId, hint);

            // Hide the platform root so the editor canvas owns the viewport.
            //   pryzm-go-hub re-shows it when the user navigates back to the
            //   hub (handler at the top of start() restores display/opacity).
            const platformRoot = document.getElementById(ROOT_ID);
            if (platformRoot) {
                platformRoot.style.display = 'none';
            }

            overlay.hide();
            // O.15 — open gesture complete; release the router-held instance so
            // the next open mints a fresh overlay (this one is mid-fade-out).
            this.engineOverlay = null;
        } catch (err) {
            // Error objects don't serialize structurally in console.error —
            // log message + stack explicitly so the failure shows up in logs
            // instead of `{}`.
            const e = err as Error;
            console.error(
                '[PlatformRouter] runtime.persistence.openProject failed:',
                e?.message ?? String(err),
                '\n', e?.stack ?? '(no stack)',
            );
            overlay.showError(e?.message ?? String(err));
            // O.15 — failed open; release the instance (showError self-hides on a
            // timeout) so a retry mints a fresh overlay.
            this.engineOverlay = null;
        } finally {
            sub.dispose();
            // §FIX-OPEN-GESTURE-ONCE (L-1282) — the gesture has SETTLED (either
            // arm), so release the latch. Deliberately in `finally`: a latch that
            // survives a FAILED open would make the retry a silent no-op, which is
            // the "refusing half needs its escape hatch" defect — a guard whose
            // success path is unreachable is a regression with a fix's name on it.
            if (this._openGestureProjectId === projectId) this._openGestureProjectId = null;
        }
    }

    /** Phase 10: Shows a full-screen maintenance message instead of launching the workspace. */
    private _showMaintenanceScreen(): void {
        const overlay = document.createElement('div');
        overlay.id = 'pryzm-maintenance-overlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 99998;
            background: var(--app-bg, #e8edf6);
            display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 16px;
            font-family: var(--app-font, -apple-system, sans-serif);
        `;
        overlay.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
                border-radius: 50%; width: 64px; height: 64px;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 4px 20px rgba(102,0,255,0.4);
            ">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
            </div>
            <h2 style="margin:0; font-size:22px; font-weight:700; color:var(--app-text,#1a2035);">Platform Under Maintenance</h2>
            <p style="margin:0; font-size:14px; color:var(--app-text-2,#5a6a85); max-width:380px; text-align:center; line-height:1.6;">
                PRYZM is currently undergoing scheduled maintenance. Please check back shortly.
            </p>
            <button id="pryzm-maintenance-dismiss" style="
                margin-top:8px; padding:10px 24px;
                background: var(--app-gradient, linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%));
                color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
                cursor: pointer; font-family: inherit;
            ">Back to Hub</button>
        `;
        document.body.appendChild(overlay);
        // CSP (script-src-attr 'none'): wire the dismiss button via
        // addEventListener instead of an inline onclick attribute.
        overlay.querySelector('#pryzm-maintenance-dismiss')?.addEventListener('click', () => {
            overlay.remove();
        });
        console.log('[PlatformRouter] Maintenance mode active — workspace blocked.');
    }

    /**
     * Releases all router resources: removes the popstate listener and
     * destroys any mounted platform components.
     * Contract §06 §3: each component must implement destroy().
     */
    destroy(): void {
        if (this.popStateHandler) {
            window.removeEventListener('popstate', this.popStateHandler);
            this.popStateHandler = null;
        }
        this.landing?.destroy();
        this.landing = null;
        this.hub?.destroy();
        this.hub = null;
        this.auth?.destroy();
        this.auth = null;
        this.pricing?.destroy();
        this.pricing = null;
        this.marketing?.dispose();
        this.marketing = null;
        this.onboarding?.dispose();
        this.onboarding = null;
    }
}
