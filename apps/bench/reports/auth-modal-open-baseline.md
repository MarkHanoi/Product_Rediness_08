# Flow 1 Step 1.2 — `ui.auth-modal-open` Baseline

> **Sprint**: 2026-04-30 — Flow 1 step 1.2 closeout (chunks/22 §22.1)
> **Captured**: 2026-04-30
> **Hardware**: Replit Linux container ; Node v20.20.0 ; shared CPU
> **Bench harness**: `apps/bench/src/benches/ui/auth-modal-open.bench.ts` (vitest run)
> **Source spec (canonical, conflict-resolution wins-order)**:
>   1. `docs/03_PRYZM3/reference/wireup-2026/chunks/22-end-to-end-flows.md` Flow 1 step 1.2 (line 20):
>      "Click 'Sign up' / 'Log in' → AuthModal opens" |
>      "platform/AuthModal.ts → `runtime.persistence.client.auth.*` (oauth2-pkce)" |
>      "`bench/ui/auth-modal-open.bench.ts` (< 50 ms)"
>   2. `docs/03_PRYZM3/reference/wireup-2026/chunks/12-ui-perf-benches.md` line 39:
>      "`bench/ui/auth-modal-open.bench.ts` | click 'Log in' → modal interactive | < 50 ms"
> **Source spec (architectural anchor)**:
>   - `chunks/02 §3.8` — "auth orthogonal" (legacy popup-OAuth + `bim-platform-token` localStorage mechanism unchanged; the typed `runtime.persistence.client.auth.*` surface is a wrapper, not a replacement).
>   - `chunks/08 §11.2` — "AuthModal flow unchanged" (same gestures, same callbacks, same redirect target).

---

## bench: ui.auth-modal-open

- **sprint**: 2026-04-30 — Flow 1 step 1.2 closeout
- **timestamp**: 2026-04-30T12:33:10Z
- **hardware**: linux x64 ; node v20.20.0 ; shared CPU
- **samples**: 100 (after 30 warmups)
- **p50**: 2.206 ms
- **p95**: 7.99 ms
- **p99**: 9.227 ms
- **target**: ≤ 25 ms warn / ≤ 50 ms budget (canonical chunks/22 §22.1 ceiling)
- **status**: green (6× headroom under canonical ceiling)
- **notes**: Cold `new AuthModal({ onSuccess, onClose }, host, runtime)` round-trip end-to-end. Includes `injectAppTheme()` (no-op after warmup), `buildOverlay()` (overlay element + content render + event-handler binding via `attachListeners()`), and AuthClient resolution — the canonical chunks/22 step 1.2 leg via `runtime.persistence.client.auth`.

---

## Sanity assertions (architectural verification)

The bench performs two architectural shape checks BEFORE the timing loop, so a future refactor that breaks the canonical chunks/22 §22.1 step 1.2 wiring fails the bench loudly instead of silently passing on the fallback path:

1. **chunks/22 step 1.2 leg reachable**:
   `runtime.persistence.client.auth` is defined and exposes
   `{ signInWithGoogle, signInWithMicrosoft, signInWithEmail, signUpWithEmail, signOut, getCurrentUser }` — all `function`-typed. This is the architectural surface chunks/22 §22.1 line 20 mandates.
2. **AuthModal binds to the canonical leg, not the fallback**:
   The `AuthModal` instance constructed with the threaded `runtime` references the SAME `AuthClient` object as `runtime.persistence.client.auth`. If a future change inadvertently routes the threaded path through the singleton fallback (`getFallbackAuthClient()`), this assertion fails.

---

## Layer-rule note

`AuthClient` lives in `packages/persistence-client` (L0). The white UI (`src/ui/platform/AuthModal.ts`, L5) reads it back through the loose `AuthClientLike` contract declared in `packages/runtime-composer/src/types.ts` — never importing the L5 typed `Plan` / `PlanStatus` enums into the L0 package. The boundary type-coercion is owned by AuthModal's `toPlatformUser(u: AuthUser): PlatformUser` adapter (single point of conversion).

---

## Headroom posture

The canonical ceiling is `< 50 ms`. The captured p95 of 7.99 ms gives **6.26× headroom**. The `warnMs = 25` line gives 3× headroom over the current p95 — generous on purpose because:

- The shared Replit runner has noisier wall-clock measurements than the dev workstations the canonical budget targets.
- `injectAppTheme()` is amortised across the warmup loop (it is a no-op after the first call thanks to its `getElementById(APP_THEME_ID)` short-circuit), so the timed iterations measure the steady-state `buildOverlay()` + `attachListeners()` + AuthClient-resolution cost.

Per the same warn-only convention used by `panel-base-overhead.bench.ts` and `tool-activate.bench.ts`, the hard-fail flip is owned by `scripts/check-regression.mjs` against `baseline.json`, not by the bench itself.

---

## Wireup recap

This bench is the first artefact of the Flow 1 step 1.2 closeout. Companion changes:
- `packages/persistence-client/src/AuthClient.ts` (NEW) — typed wrapper over the legacy `/api/auth/{signin,signup,google,microsoft}` endpoints + popup OAuth + `bim-platform-token` localStorage contract.
- `packages/persistence-client/src/AuthClient.types.ts` (NEW) — types-only module (`Plan`, `PlanStatus`, `AuthUser`, `AuthResult`, `AuthClientErrorKind`, `PryzmOAuthMessage`) + canonical key constants.
- `packages/persistence-client/src/ProjectListClient.ts` — exposes `readonly auth: AuthClient` (composition).
- `packages/persistence-client/src/index.ts` — exports `AuthClient` + supporting types.
- `packages/runtime-composer/src/types.ts` — adds `AuthClientLike` + `readonly auth: AuthClientLike` to `PersistenceClientLike` (canonical access path: `runtime.persistence.client.auth`).
- `packages/runtime-composer/src/buildPersistence.ts` — wires both the override-client path and the default-client path to expose `client.auth`.
- `src/ui/platform/AuthModal.ts` — every gesture (Google / Microsoft / email signin / signup) delegates to `this.authClient.*` (resolved from `runtime.persistence.client.auth` when threaded, falling back to a singleton `AuthClient` for legacy null-runtime call sites).
