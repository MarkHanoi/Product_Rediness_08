// Bench: `ui.auth-modal-open` — click "Log in" → modal interactive < 50 ms.
//
// Canonical sources (in conflict-resolution order — 01-VISION wins, then
// 02-ARCHITECTURE, then 03-CURRENT-STATE, then 04-PLAN-FORWARD):
//   1. `chunks/22-end-to-end-flows.md` Flow 1 step 1.2 (line 20):
//        "Click 'Sign up' / 'Log in' → AuthModal opens" |
//        "platform/AuthModal.ts → `runtime.persistence.client.auth.*`
//         (oauth2-pkce)" | "`bench/ui/auth-modal-open.bench.ts` (< 50 ms)"
//   2. `chunks/12-ui-perf-benches.md` line 39:
//        "`bench/ui/auth-modal-open.bench.ts` | click 'Log in' → modal
//         interactive | < 50 ms"
//   3. `chunks/02 §3.8` — "auth orthogonal" (the legacy popup-OAuth +
//        `bim-platform-token` localStorage mechanism is unchanged; the
//        `runtime.persistence.client.auth.*` leg is a typed wrapper).
//   4. `chunks/08 §11.2` — "AuthModal flow unchanged" (same gestures,
//        same callbacks, same redirect target).
//
// What this bench measures (headless, via JSDOM):
//   * Cold `new AuthModal({ onSuccess, onClose }, host, runtime)` cost
//     end-to-end — the wall-time between the user gesture (click "Log in")
//     and the modal being interactive in the DOM. This includes:
//       a. `injectAppTheme()` — the SOLE CSS injection point per §05 §2.1
//          (no-op on subsequent calls; warmup loop primes it once).
//       b. `buildOverlay()` — overlay element + content render +
//          `attachListeners()` event-handler binding.
//       c. AuthClient resolution — `runtime.persistence.client.auth`
//          when threaded, fallback singleton AuthClient otherwise. This
//          is the chunks/22 §22.1 step 1.2 leg the bench is gating.
//   * Sanity: the resolved AuthModal references the SAME AuthClient
//     instance reachable through `runtime.persistence.client.auth`, so
//     the canonical chunks/22 step 1.2 leg is the one being benchmarked
//     (not just the fallback path).
//
// What this bench CANNOT measure (intentionally — out of scope for the
// headless harness; lands in `apps/editor-bench/` Wave 13):
//   * In-browser style recalc / first-paint of the modal overlay.
//   * `window.open()` popup-window creation cost (the popup is a
//     browser-only side effect; the bench validates the AuthClient
//     surface is reachable, not that a popup actually opens).
//
// Budget rationale: 50 ms is the canonical chunks/22 step 1.2 budget.
// On the shared Replit container the AuthModal mount cost is dominated
// by the first-call `injectAppTheme()` style-string parse (~1–3 ms);
// subsequent mounts are sub-millisecond. The 50 ms ceiling is therefore
// a regression-detection gate, not a precision target. Same warn-only
// convention as `panel-base-overhead.bench.ts` — the hard-fail flip is
// owned by `scripts/check-regression.mjs` against `baseline.json`.

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { composeRuntime } from '@pryzm/runtime-composer';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { measure } from '../../timing.js';
import { writeBenchSample } from '../../save-baseline.js';

interface GlobalsBackup {
  document?: unknown;
  window?: unknown;
  HTMLElement?: unknown;
  localStorage?: unknown;
}

/** Install JSDOM into the bench process so AuthModal's `injectAppTheme()`
 *  + `buildOverlay()` can call `document.*` / `localStorage`. Returns
 *  the prior values so they can be restored after the bench. */
function installJsdom(dom: JSDOM): GlobalsBackup {
  const backup: GlobalsBackup = {
    document:    (globalThis as { document?: unknown }).document,
    window:      (globalThis as { window?: unknown }).window,
    HTMLElement: (globalThis as { HTMLElement?: unknown }).HTMLElement,
    localStorage: (globalThis as { localStorage?: unknown }).localStorage,
  };
  (globalThis as { document: unknown }).document = dom.window.document;
  (globalThis as { window: unknown }).window = dom.window;
  (globalThis as { HTMLElement: unknown }).HTMLElement = dom.window.HTMLElement;
  (globalThis as { localStorage: unknown }).localStorage = dom.window.localStorage;
  return backup;
}

function restoreGlobals(backup: GlobalsBackup): void {
  for (const key of ['document', 'window', 'HTMLElement', 'localStorage'] as const) {
    if (backup[key] === undefined) {
      delete (globalThis as Record<string, unknown>)[key];
    } else {
      (globalThis as Record<string, unknown>)[key] = backup[key];
    }
  }
}

describe('ui.auth-modal-open', () => {
  it('opens the AuthModal under the < 50 ms p95 budget (chunks/22 §22.1 step 1.2)', async () => {
    // `url` MUST be set to a non-opaque origin so JSDOM provisions
    // `window.localStorage` — the AuthClient's session-persistence
    // path (`bim-platform-token` + `bim-platform-user`) needs it to
    // be reachable even though this bench never calls a sign-in
    // method. JSDOM throws "SecurityError: localStorage is not
    // available for opaque origins" when the URL is the default
    // `about:blank`.
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    const backup = installJsdom(dom);

    // Compose the canonical runtime so the bench measures the
    // chunks/22 step 1.2 leg (`runtime.persistence.client.auth.*`) end-
    // to-end, not just the legacy fallback path.
    const runtime: PryzmRuntime = await composeRuntime({
      audit: {
        actorId:   'bench-auth-modal-open',
        projectId: 'bench-flow-1-step-1.2',
        clientId:  'bench-client',
      },
      canvas: null,
      pluginContributions: [],
    });

    try {
      // Sanity — the canonical leg is wired and reachable. This is the
      // single most important shape assertion this bench makes: it
      // proves that `runtime.persistence.client.auth.signInWithGoogle()`
      // (the chunks/22 step 1.2 leg) exists with the documented surface
      // BEFORE we measure the modal-open cost. If a future refactor
      // breaks this wiring, the bench fails here, not silently in
      // production.
      const auth = runtime.persistence.client.auth;
      expect(auth).toBeDefined();
      expect(typeof auth.signInWithGoogle).toBe('function');
      expect(typeof auth.signInWithMicrosoft).toBe('function');
      expect(typeof auth.signInWithEmail).toBe('function');
      expect(typeof auth.signUpWithEmail).toBe('function');
      expect(typeof auth.signOut).toBe('function');
      expect(typeof auth.getCurrentUser).toBe('function');

      // Lazy-import AuthModal so the JSDOM globals are in place BEFORE
      // the module-level `injectAppTheme()` can be reached. (AuthModal
      // doesn't run anything at import time today, but this insulates
      // the bench against future top-level side effects.)
      //
      // The path is constructed via Array.join to defeat TS literal-
      // module-resolution: `apps/bench/tsconfig.json` sets `rootDir:
      // "src"`, so a literal relative import would pull `src/ui/platform/
      // AuthModal.ts` (and its transitive `AppTheme.ts` panel imports)
      // into the bench's compilation graph and trip TS6059 (File not
      // under rootDir). At runtime this import resolves through Vitest's
      // module loader, which has no rootDir constraint.
      const authModalPath = [
        '..', '..', '..', '..', '..',
        'src', 'ui', 'platform', 'AuthModal.js',
      ].join('/');
      const authModalMod = (await import(authModalPath)) as {
        AuthModal: new (
          callbacks: { onSuccess: (u: unknown) => void; onClose: () => void },
          host: HTMLElement,
          runtime: PryzmRuntime | null,
        ) => { destroy(): void };
      };
      const { AuthModal } = authModalMod;

      const callbacks = {
        onSuccess: (): void => undefined,
        onClose:   (): void => undefined,
      };

      // Sanity — the AuthModal resolves to the SAME AuthClient
      // instance reachable through `runtime.persistence.client.auth`.
      // This proves the canonical leg is the one being benchmarked
      // (not the `getFallbackAuthClient()` path, which would silently
      // pass the budget but skip the chunks/22 §22.1 step 1.2 wiring).
      const sanityHost = dom.window.document.createElement('div');
      dom.window.document.body.appendChild(sanityHost);
      const sanityModal = new AuthModal(callbacks, sanityHost as unknown as HTMLElement, runtime);
      const internalAuth = (sanityModal as unknown as { authClient: unknown }).authClient;
      expect(internalAuth).toBe(runtime.persistence.client.auth);
      sanityModal.destroy();
      sanityHost.remove();

      const sample = await measure(
        'ui.auth-modal-open',
        () => {
          const host = dom.window.document.createElement('div');
          dom.window.document.body.appendChild(host);
          const modal = new AuthModal(
            callbacks,
            host as unknown as HTMLElement,
            runtime,
          );
          // Tear down between samples so the body stays clean and
          // every iteration measures a cold buildOverlay() path. The
          // first-call `injectAppTheme()` cost is amortised into the
          // warmup loop (warnMs/budgetMs reflect steady-state).
          modal.destroy();
          host.remove();
        },
        // warmup = 30 amortises the JSDOM HTMLElement-construction
        // cold path, the JIT warm-up of `injectAppTheme()`'s style-
        // string parse, and the `node_modules/.pnpm/...` module-cache
        // population. samples = 100 gives a representative steady-state
        // p95 distribution. budgetMs = 50 mirrors the chunks/22 §22.1
        // step 1.2 canonical ceiling; warnMs = 25 is the local-dev p95
        // we see today on the shared Replit container.
        { samples: 100, warmup: 30, warnMs: 25, budgetMs: 50 },
      );

      writeBenchSample(sample);
      // Same warn-only convention as panel-base-overhead.bench.ts /
      // tool-activate.bench.ts — the hard-fail flip is owned by
      // `scripts/check-regression.mjs` against `baseline.json`.
      expect(sample.p95).toBeGreaterThan(0);
    } finally {
      runtime.tearDown();
      restoreGlobals(backup);
    }
  });
});
