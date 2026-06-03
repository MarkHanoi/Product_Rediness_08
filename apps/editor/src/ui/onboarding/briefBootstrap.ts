// A.5.g.4 — RAC → site bootstrap router (the G1 seam, zero-console journey).
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
//     create project → create a default Site (rectangle parcel) → generate
//
// so the user lands in a finished apartment result with ZERO console commands.
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
import { createSiteFromRect } from '../site/createSiteFromRect.js';
import { generateApartmentFromBoundary } from '../apartment-layout/apartmentFromBoundary.js';

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
// Default parcel rectangle (metres) — the no-GIS fallback. Matches the demoable
// "stub GIS" rectangle from the pipeline plan §5.
const DEFAULT_PARCEL_WIDTH_M = 20;
const DEFAULT_PARCEL_DEPTH_M = 16;
// How long to wait for the site boundary event before falling back to the store
// poll / bailing. The boundary is set synchronously inside `createSiteFromRect`,
// so this is a generous safety net, not the happy path.
const BOUNDARY_WAIT_MS = 4000;

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
    if (brief.typologyId !== 'apartment') {
        console.log(
            `[onboarding-bootstrap] typology "${brief.typologyId}" is not yet auto-wired ` +
            '(only "apartment" has a shipped generator today) — bailing gracefully. ' +
            'Its Pack will slot into this same brief→project→site→generate spine.',
        );
        return;
    }

    if (typeof deps.createAndOpenProject !== 'function') {
        console.warn('[onboarding-bootstrap] no createAndOpenProject dep — cannot create a project; bailing.');
        return;
    }

    // The post-auth flow is on the HUB, not a project. We must create + open a
    // project, then wait for it to LOAD before the site/generate seams (which
    // need an open project + active level) can run. We arm the one-shot
    // `pryzm-project-loaded` listener BEFORE issuing the create+open so we never
    // miss the event (it can fire synchronously-ish for the empty-new-project
    // path — PlatformShell fires `pryzm-project-loaded(empty:true)` immediately).
    toast('Setting up your first apartment…', 'info');

    const md = brief.metadata ?? {};
    const address = typeof md.address === 'string' ? md.address : undefined;

    let fired = false;
    const onLoaded = runtime.events.on('pryzm-project-loaded', (p) => {
        if (fired) return;
        fired = true;
        onLoaded.dispose();
        console.log('[onboarding-bootstrap] pryzm-project-loaded — project ready', {
            projectId: p.projectId,
            empty: p.empty,
        });
        void runSiteAndGenerate(runtime, { address });
    });

    // Safety net: if the project never reports loaded, dispose the listener so we
    // don't leak it across the next manual open.
    setTimeout(() => {
        if (!fired) {
            fired = true;
            onLoaded.dispose();
            console.warn(
                '[onboarding-bootstrap] timed out waiting for pryzm-project-loaded — ' +
                'the project may have failed to open. The user can still create a site + ' +
                'generate manually. Bailing without throwing.',
            );
        }
    }, 30_000);

    console.log(`[onboarding-bootstrap] creating + opening project "${DEFAULT_PROJECT_NAME}".`);
    deps.createAndOpenProject(DEFAULT_PROJECT_NAME);
}

/**
 * Once a project is open, run the site → generate chain:
 *   createSiteFromRect → await site.parcel-boundary-set → generateApartmentFromBoundary
 */
async function runSiteAndGenerate(
    runtime: PryzmRuntime,
    opts: { address?: string },
): Promise<void> {
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        runtime.events?.emit('pryzm:toast', { message, severity });
    };

    try {
        // Guard: the seam helpers themselves guard (no runtime / no project / no
        // store), but check up front so a missing project logs ONE clear reason
        // rather than three downstream warnings.
        if (!runtime.audit?.projectId) {
            console.warn('[onboarding-bootstrap] project loaded but runtime.audit.projectId is empty — bailing before site create.');
            return;
        }

        // §FUTURE-GIS ──────────────────────────────────────────────────────────
        // When the GIS authoring UI (A.8.a geocode + A.8.c polygon-draw) lands, a
        // "draw your site boundary" step inserts HERE — between project-open and
        // generate. It replaces the default-rectangle `createSiteFromRect` call
        // below with the user's drawn parcel boundary (which lands the SAME
        // `ParcelBoundary` in the SAME `siteModelStore`, so the generate step
        // downstream is unchanged). The default rectangle is the no-GIS fallback.
        console.log('[onboarding-bootstrap] creating default Site (no-GIS rectangle fallback).');
        const siteOk = createSiteFromRect(runtime, {
            ...(opts.address ? { address: opts.address } : {}),
            width: DEFAULT_PARCEL_WIDTH_M,
            depth: DEFAULT_PARCEL_DEPTH_M,
        });
        if (!siteOk) {
            console.warn('[onboarding-bootstrap] createSiteFromRect returned false — bailing before generate.');
            // createSiteFromRect already toasted the specific reason.
            return;
        }

        // Wait for the parcel boundary to be authored before generating.
        // `createSiteFromRect` sets it synchronously and emits
        // `site.parcel-boundary-set`, so this resolves immediately on the happy
        // path; the event wait + store poll is a belt-and-braces safety net.
        const haveBoundary = await waitForParcelBoundary(runtime);
        if (!haveBoundary) {
            console.warn('[onboarding-bootstrap] parcel boundary did not settle — bailing before generate.');
            toast('Site created but boundary did not settle — try generating from the menu.', 'error');
            return;
        }

        console.log('[onboarding-bootstrap] boundary ready — generating apartment from site boundary.');
        await generateApartmentFromBoundary(runtime);
        console.log('[onboarding-bootstrap] generate complete — onboarding journey finished (zero console commands).');
    } catch (err) {
        console.error('[onboarding-bootstrap] site/generate chain threw (swallowed):', err);
        toast(`Onboarding generation failed: ${String(err)}`, 'error');
    }
}

/**
 * Resolve when the active Site's parcel boundary is authored. Races the
 * `site.parcel-boundary-set` event against a `siteModelStore.getParcelBoundary()`
 * poll (the boundary is normally set synchronously inside `createSiteFromRect`,
 * so the poll usually wins on the first tick). Times out at `BOUNDARY_WAIT_MS`.
 */
function waitForParcelBoundary(runtime: PryzmRuntime): Promise<boolean> {
    const store = runtime.siteModelStore;
    // Fast path: already authored synchronously by createSiteFromRect.
    const existing = store?.getParcelBoundary?.();
    if (existing && (existing.polygon?.length ?? 0) >= 3) {
        return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean): void => {
            if (settled) return;
            settled = true;
            sub?.dispose();
            clearInterval(poll);
            clearTimeout(timer);
            resolve(ok);
        };

        const sub = runtime.events?.on('site.parcel-boundary-set', () => finish(true));

        // Poll the store too — covers the case where the event fired before this
        // subscription was attached (the boundary is set synchronously).
        const poll = setInterval(() => {
            const b = store?.getParcelBoundary?.();
            if (b && (b.polygon?.length ?? 0) >= 3) finish(true);
        }, 100);

        const timer = setTimeout(() => finish(false), BOUNDARY_WAIT_MS);
    });
}
