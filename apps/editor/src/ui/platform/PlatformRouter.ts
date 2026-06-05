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

/** ADR-055 §7 — marketing routes moved from apps/docs-site/ into the
 *  editor.  Names match the apex pre-render bucket (/, /pricing,
 *  /manifesto, /trust). */
type MarketingRoute = 'pricing' | 'manifesto' | 'trust';

const ROOT_ID = 'platform-root';
const HASH_LANDING = '#/';
const HASH_PROJECTS = '#/projects';

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
            signOut();
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
            router.showHub(user);
        } else {
            router.showLanding();
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
            onContactSales: () => window.open('mailto:hello@pryzm.io?subject=PRYZM+Sales+Enquiry', '_blank'),
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
            onStartOnboarding: (seedFromModal?: { name?: string; projectType?: string }) => {
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
    /**
     * O.5 — map the New-Project modal's `projectType` select value to a
     * registered typology id, or `undefined` when there is no confident mapping
     * (the conversation then asks normally). Only returns an id the registry
     * actually has, so a degraded boot (no apartment pack) never seeds a
     * phantom typology. Today only Residential → `apartment` is wired (the one
     * shipped generator); other types intentionally fall through.
     */
    private static _typologyForProjectType(
        projectType: string | undefined,
        registryHas: (id: string) => boolean,
    ): string | undefined {
        if (!projectType) return undefined;
        // §A.6.c — the modal now offers explicit building typologies. Map each to
        // a registered Pack id; "residential — let me choose" / commercial / mixed /
        // other return undefined so the RAC asks (showing the typology chips).
        const v = projectType.trim().toLowerCase();
        let candidate: string | undefined;
        if (v === 'apartment') candidate = 'apartment';
        else if (v === 'casa-unifamiliar' || v === 'house' || v === 'casa') candidate = 'casa-unifamiliar';
        if (candidate && registryHas(candidate)) return candidate;
        return undefined;
    }

    showOnboarding(seed?: { name?: string; projectType?: string }): void {
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

        const registry = this.runtime?.typology?.registry;
        if (!registry) {
            console.warn('[PlatformRouter] showOnboarding — no typology registry on runtime; opening auth directly.');
            this.showAuth();
            return;
        }

        // O.5 — map the modal's Project Type select to a registered typology id
        // so the RAC conversation pre-captures it (skipping the "what type?"
        // question). Only `apartment` has a shipped generator today, so
        // Residential → apartment; other types fall through to a normal ask (the
        // panel ignores an unknown / absent seed). The chosen NAME is carried in
        // the brief metadata so the created project keeps it (briefBootstrap
        // reads `metadata.projectName`).
        const seededTypologyId = PlatformRouter._typologyForProjectType(
            seed?.projectType,
            (id: string) => registry.has(id),
        );
        const seededName = seed?.name?.trim();
        const seedMetadata: Record<string, unknown> = {};
        if (seededName) seedMetadata.projectName = seededName;
        if (seed?.projectType) seedMetadata.projectType = seed.projectType;
        if (seed) {
            console.log('[onboarding] showOnboarding seeded from New-Project modal:', {
                name: seededName ?? '(none)',
                projectType: seed.projectType ?? '(none)',
                seededTypologyId: seededTypologyId ?? '(none — conversation will ask)',
            });
        }

        const panel = new RACChatbotPanel({
            registry,
            ...(seededTypologyId ? { seedTypologyId: seededTypologyId } : {}),
            ...(Object.keys(seedMetadata).length ? { seedMetadata } : {}),
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
                this.launchWorkspace(summary.id, summary.name, { isNewProject: true });
            } catch (err) {
                console.error('[PlatformRouter] createAndOpenProject failed (swallowed — onboarding flow unaffected):', err);
                this._failEngineLoadingOverlay((err as Error)?.message ?? 'Could not create the project.');
            }
        })();
    }

    private launchWorkspace(projectId: string, projectName: string, opts?: { isNewProject?: boolean }): void {
        console.log(`[PlatformRouter] Opening project: "${projectName}" (${projectId})${opts?.isNewProject ? ' [new]' : ''}`);

        // Phase 10: Maintenance Mode — block BIM editor for all users
        if (OwnerFeatureFlags.isEnabled('maintenanceMode')) {
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
