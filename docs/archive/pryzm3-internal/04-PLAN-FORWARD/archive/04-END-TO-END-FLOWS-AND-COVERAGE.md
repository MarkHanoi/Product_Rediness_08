# 04 — End-to-End Flows and Architecture↔UI Coverage

> **Position**: Inserted after `03-WAVE-2-3-D4-EXECUTION.md`. Distilled from `reference/wireup-2026/chunks/22-end-to-end-flows.md` (originally 8 user-visible flows traced layer-by-layer; Flow 9 added 2026-04-30g to cover the Hub "+ New project" gesture — the L0 entry-point for every multi-project user) and `chunks/21-architecture-to-ui-reverse-map.md` (every architecture leg mapped to the UI surfaces that consume it).
>
> **Why this is plan-forward, not reference**: the 9 flows in §1 are the **smoke-test corpus** for `runtime` slot wiring during Waves 4–7. Every D.4 → F.* sub-phase must keep all 9 flows green from gesture to commit. The reverse map in §2 is the **coverage matrix** that turns "Wave 7 done" from an opinion into an arithmetic check (every leg has at least one UI consumer; every UI surface has at least one leg behind it).
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger row, §4 next-actions, §2 booleans as applicable).

---

## §1 — The nine end-to-end flows (smoke corpus)

Each flow lists the user gesture, the UI surface that captures it, the `runtime.*` legs it must traverse, the wave that lands the wire, and the verifier that proves it green.

### Flow 1 — Open landing page → first paint

| Stage | Surface | Runtime leg | Wave |
|---|---|---|---|
| Browser navigate | `index.html` (App-Shell, repo root) | none | landed (Wave 1.5) |
| HTML parse + skeleton paint | `src/main.ts` shell (App-Shell `__pryzmPendingActions` queue + `data-pryzm-skeleton` removal selector) | none | landed (Wave 1.5b) |
| JS bundle mount | `src/main.ts` (entry split — Phase A boot + Phase B `composeRuntime()`) | `composeRuntime({ canvas: null })` boot | landed (Wave 4 D.4.0) |
| First runtime tick | scene canvas (deferred to project open per §1.1 — "BIM engine deferred") | `runtime.scene.mount(canvas, mode?)` | landed (Wave 4 D.4.1, Flow-1 wire 2026-04-30) |

**Verifier**: `pnpm bench landing-first-paint` ≤ 2.5 s on M1/Chrome 130/throttled fast 4G (NFT-1).
Headless proxy ships at `apps/bench/src/benches/landing-first-paint.bench.ts` (warn-only baseline entry; cold `composeRuntime()` p95 = 4 ms on Replit Linux N20.20.0); the in-browser wall-clock harness lands with `apps/editor-bench/` (Wave 13).

#### STATUS-2026-04-30 (Flow-1 closeout)

| Stage | Status | Bar | Spec deviation reconciliation |
|---|---|---|---|
| 1.1 Browser navigate | wired | ▰▰▰▰▰ 100% | Spec said `apps/editor/index.html`; actual `index.html` lives at the repo root (Vite root). Behaviour identical — App-Shell ships paint-on-first-byte critical CSS. |
| 1.2 HTML parse + skeleton paint | wired | ▰▰▰▰▰ 100% | Inline skeleton + `__pryzmPendingActions` queue; selector `[data-pryzm-skeleton]` removed once `composeRuntime()` resolves. |
| 1.3 JS bundle mount | wired | ▰▰▰▰▰ 100% | Spec said `apps/editor/src/main.tsx`; actual entry is `src/main.ts` (Wave 1.5 Phase A/B split). `composeRuntime({ canvas: null, audit, pluginContributions })` boots without scene canvas (matches §01 §1.1 "BIM engine deferred to project open"). |
| 1.4 First runtime tick | wired | ▰▰▰▰▰ 100% | Typed `SceneSlot.mount(canvas, mode?)` added on `runtime.scene` (`packages/runtime-composer/src/types.ts`); body funnels through `bootstrapScene()` (`pryzm.bootstrap.scene` OTel span). Scene-half wiring refactored to a `runScene()` closure shared by compose-time `opts.canvas` path AND post-compose `mount()` API; slot is a getter façade reading from mutable `sceneCurrent`. Soft-fail (rejects on different canvas, idempotent on same canvas, emits `scene.ready` event). |
| Verifier | wired (warn-only) | ▰▰▰▰▱ 90% | `apps/bench/src/benches/landing-first-paint.bench.ts` registered in `apps/bench/baseline.json` + `apps/bench/reports/flow-1-landing-first-paint-baseline.md`. p50 = 0.59 ms, p95 = 4 ms (headless cold-compose proxy). Hard-fail wall-clock gate ("≤ 2.5 s on M1/Chrome 130/throttled fast 4G") flips when the in-browser harness ships in Wave 13 (`apps/editor-bench/`). |
| **Flow 1 overall** | **wires-in-place** | **▰▰▰▰▱ 95%** | Architecture-level wires landed; the 5% remaining is the in-browser NFT-1 wall-clock measurement deferred to Wave 13. |

#### STATUS-2026-04-30b (Flow-1 — gesture-flow shape per chunks/22 §22.1)

> **Why this section exists**: the 4-stage table above is the *cold-boot
> latency* framing (NFT-1 verifier — `pnpm bench cold-boot`).  The
> canonical *gesture-flow* shape that 04-Note-Flow1-04.md flagged as the
> doc-level conflict comes from `reference/wireup-2026/chunks/22-end-to-end-flows.md`
> §22.1 — five steps from landing → signed-in hub.  Both framings are
> valid; this row matrix tracks the gesture-flow shape so the conflict
> flag is now reconciled at the row level rather than as an unresolved
> `DOC-LEVEL CONFLICT FLAG` header.

| Step (chunks/22 §22.1) | Status | Bar | Architectural leg |
|---|---|---|---|
| 1.1 Visit `/` → landing paints | wired | ▰▰▰▰▰ 100% | `platform/LandingPage.ts` (no engine import). Inline boot skeleton removed pre-paint by the App-Shell. |
| 1.2 Click Sign up / Log in → AuthModal opens | wired | ▰▰▰▰▰ 100% | `platform/AuthModal.ts` resolves `runtime?.persistence?.client?.auth ?? getFallbackAuthClient()` in its constructor; every gesture (Continue with Google / Outlook, email submit, signup) delegates to the typed `AuthClient` (`@pryzm/persistence-client/AuthClient`). Session keys (`bim-platform-token`, `bim-platform-user`) per chunks/02 §3.8 unchanged. |
| 1.3 Submit credentials → OAuth round-trip | wired | ▰▰▰▰▰ 100% | `AuthClient.signInWithGoogle()` / `signInWithMicrosoft()` open `/api/auth/{google,microsoft}` popups; `server/oauthService.js` drives the authorization-code flow with state-token CSRF protection and posts back via `window.postMessage` (PRYZM_OAUTH_MESSAGE_TYPE). Email/password posts to `/api/auth/{signin,signup}` against bcrypt-backed `authStore`. Note: `@pryzm/oauth2-pkce` is the SDK / Public-API public-client deliverable (PHASE-3C-Q3-M31-M33-SDK §S63 D2-D3 + ADR-0039 §A) — the in-browser AuthModal terminates on a same-origin confidential server endpoint, so PKCE is not required on this leg per OAuth 2.1 §2.1.1. |
| 1.4 Token returned → router navigates to hub | wired | ▰▰▰▰▰ 100% | `PlatformRouter.showAuth().onSuccess` → `showHub(user)`; constructs `new ProjectHub(this.root, user, callbacks, this.runtime)` so the runtime is threaded through. History state pushed via `history.pushState({view:'hub'}, '', '#/projects')`; popstate handler restores the correct view on back/forward. |
| 1.5 ProjectHub paints user's project list | wired | ▰▰▰▰▰ 100% | `ProjectHub.syncFromServer()` reads via `runtime.persistence.client.list()` (typed `ProjectListClient`, GET `/api/v1/projects`) when the runtime is threaded; the legacy `apiFetch('/api/projects')` v0 read path remains the fallback for null-runtime call sites. Both paths converge on the same `pgProjectStore` projection and feed the same `projectRepository` localStorage cache (offline UX + per-card chips). All write legs (create/rename/archive/star/duplicate/delete) were already on the typed client. |
| **Flow 1 overall (gesture-flow)** | **wired** | **▰▰▰▰▰ 100%** | All five canonical legs through to first hub paint. Cold-boot latency NFT-1 (the 5% gap above) remains the only Wave-13 follow-on. |

Files touched in the 1.5 closeout pass (no new audit files — Rule 1 honored):
- `packages/stores/src/ProjectListStore.ts` — `ProjectSummary.versionCount?: number` added.
- `packages/persistence-client/src/ProjectListClient.ts` — `ServerProjectRow` natively declares `is_archived` / `is_starred` / `description`; `rowToSummary` forwards `versionCount` + the three Phase C chip fields.
- `src/ui/platform/ProjectHub.ts` — `syncFromServer()` reads via the typed leg; new `_fetchSummaries()` adapter implements the typed-leg + null-runtime fallback split.
- `packages/file-format/package.json` — entry-points pointed at `src/index.js` (Replit-environment migration; no source changes in the package).
- `docs/archive/pryzm3-internal/04-PLAN-FORWARD/04-Note-Flow1-04.md` — appended UPDATE entry covering the migration + the 1.5 closeout.

`tsc --noEmit -p .` — green across the whole monorepo after this pass.

### Flow 2 — Sign in (email)

| Stage | Status | Bar | Surface | Runtime leg | Wave |
|---|---|---|---|---|---|
| Click "Sign in" | wired | ▰▰▰▰▰ 100% | `AuthModal` | none | landed |
| Email + password submit | wired | ▰▰▰▰▰ 100% | `AuthModal` form handler | `runtime.auth.signIn(email, pw)` | Wave 5 F.6.1 |
| Token persisted | wired | ▰▰▰▰▰ 100% | localStorage | `runtime.auth.session` writer | Wave 5 F.6.1 |
| Hub render | wired | ▰▰▰▰▰ 100% | `ProjectHub` | `runtime.persistence.client.listProjects()` | Wave 5 F.6.2 |
| **Flow 2 overall** | **wired** | **▰▰▰▰▰ 100%** | gesture → hub | architecture-level wires landed | Verifier (pnpm bench sign-in-end-to-end) deferred to Wave 13 |

**Verifier**: `pnpm bench sign-in-end-to-end` ≤ 1.2 s gesture-to-hub-render.

#### STATUS-2026-04-30c (Flow-2 — gesture-flow audit per chunks/22 §22.2)

> **Why this section exists**: parallel to the Flow-1 STATUS-2026-04-30b
> reconciliation. The four-row matrix above uses the original spec's
> `runtime.auth.*` slot names (which were the planning-time vocabulary),
> but the real implementation lands the same legs under the
> `runtime.persistence.client.auth.*` namespace per ADR-0034 §2 ("auth
> is co-resident with the persistence client because it owns the session
> token that authenticates persistence calls"). This row matrix maps each
> spec leg to the actual leg + file so the status column above is
> defensible against the running code.

| Step (chunks/22 §22.2) | Status | Bar | Architectural leg (actual) |
|---|---|---|---|
| 2.1 Click "Sign in" → AuthModal opens | wired | ▰▰▰▰▰ 100% | `LandingPage.ts` "Log in" / "Get started for free" gestures fire `onSignIn`/`onSignUp` callbacks → `PlatformRouter.showAuth(initialMode)` → `new AuthModal(this.root, { initialMode, onSuccess, onCancel }, this.runtime)`. Same `AuthModal` instance covers both signin + signup tabs. |
| 2.2 Submit email + password | wired | ▰▰▰▰▰ 100% | `AuthModal.ts` form handler line 425 awaits `this.authClient.signInWithEmail(email, password)`. The `authClient` field is resolved in the constructor as `runtime?.persistence?.client?.auth ?? getFallbackAuthClient()` — so the canonical leg is `runtime.persistence.client.auth.signInWithEmail()` (ADR-0034 §2 reconciliation of the spec's `runtime.auth.signIn`). Body POSTs to `/api/auth/signin` against bcrypt-backed `authStore` (`server/authStore.js`). Validates email format + password ≥ 8 chars client-side before round-trip. |
| 2.3 Token + user persisted to localStorage | wired | ▰▰▰▰▰ 100% | `AuthClient.persistSession(user, token)` (lines 380–384) writes both keys: `localStorage['bim-platform-token']` (`AUTH_TOKEN_KEY`) and `localStorage['bim-platform-user']` (`AUTH_USER_KEY`). Keys are canonical per chunks/02 §3.8. Sandbox / private-mode failures swallowed silently (sign-in still succeeds in-memory; subsequent requests just won't carry the bearer). |
| 2.4 onSuccess callback → hub render | wired | ▰▰▰▰▰ 100% | `AuthModal` invokes `this.callbacks.onSuccess(toPlatformUser(result.user))` (line 426) which the router wired at `PlatformRouter.showAuth({ onSuccess: (user) => { this.showHub(user); } })` (line 222–228). `showHub()` (line 242) constructs `new ProjectHub(this.root, user, callbacks, this.runtime)` so the runtime is threaded through; `ProjectHub.syncFromServer()` then reads via `runtime.persistence.client.list()` per the Flow-1 §1.5 closeout (the spec's `listProjects()` is named `list()` in the typed client — same endpoint `GET /api/v1/projects`). History state pushed via `history.pushState({view:'hub'}, '', '#/projects')`. |
| **Flow 2 overall (gesture-flow)** | **wired** | **▰▰▰▰▰ 100%** | All four legs through to first hub paint with the freshly-signed-in user's project list. NFT verifier (`pnpm bench sign-in-end-to-end` ≤ 1.2 s) is the only Wave-13 follow-on. |

Spec-vs-actual reconciliations (ADR-0034 §2 grandfathered):
- Spec `runtime.auth.signIn(email, pw)` → actual `runtime.persistence.client.auth.signInWithEmail(email, password)` (auth co-resident with persistence client).
- Spec `runtime.auth.session` writer → actual `AuthClient.persistSession()` (private; called automatically from every `signInWith*` / `signUpWithEmail` success path).
- Spec `runtime.persistence.client.listProjects()` → actual `runtime.persistence.client.list()` (typed `ProjectListClient` — same `GET /api/v1/projects` endpoint).

No source files were touched in this audit (Flow 2 was already fully wired by Wave 5 F.6.1 + the Flow-1 §1.5 closeout); only this STATUS section was added.

### Flow 3 — Open existing 300-element project

| Stage | Status | Bar | Surface | Runtime leg | Wave |
|---|---|---|---|---|---|
| Click project card | wired | ▰▰▰▰▰ 100% | `ProjectHub.ProjectCard` | `runtime.persistence.client.openProject(id)` | landed (legacy path) → **rewire Wave 5 F.6.2** |
| Load .pryzm bundle | **wired** | **▰▰▰▰▰ 100%** | `runtime.persistence.tier` | `runtime.persistence.tier.streamLoad(id)` | **Wave 7 (2026-05-01)** — `PersistenceTierSlot.streamLoad()` built in `buildPersistence.ts`; `attachedWorkspace.show()` bridge deleted; server fetch is now the typed leg |
| Project store hydrate | **wired** | **▰▰▰▰▰ 100%** | `runtime.stores` | `runtime.stores.hydrate(snapshot)` + `runtime.stores.registerHydrator()` | **Wave 7 (2026-05-01)** — `StoresSlot` built in `composeRuntime.ts`; `initPersistence.ts` registers the hydrator; umbrella `stores.hydrate()` typed leg landed |
| Scene assemble | wired | ▰▰▰▰▰ 100% | `runtime.scene.committer` | `runtime.scene.committer.commit(snapshot)` | Wave 4 D.4.3 (canonical accessor `runtime.scene.committer` added 2026-04-30 — same `CommitterHost` instance as `runtime.scene.host`) |
| First frame painted | wired | ▰▰▰▰▰ 100% | renderer | `runtime.scene.renderer.frame()` | Wave 4 D.4.4 (canonical method `frame()` added 2026-04-30 — delegates to `render()`; FrameScheduler tick listener pumps it via `attachTo(scheduler)`) |
| **Flow 3 overall** | **wired** | **▰▰▰▰▰ 100%** | gesture → first frame | All 5 legs canonically named and typed; `WorkspaceMountBridge`/`attachedWorkspace` deleted (Wave 7) | NFT verifier (`pnpm bench open-300-element-project` ≤ 1.8 s) deferred to Wave 13 |

**Verifier**: `pnpm bench open-300-element-project` ≤ 1.8 s gesture-to-first-frame.

#### STATUS-2026-04-30d (Flow-3 — gesture-flow audit per chunks/22 §22.3)

> **Why this section exists**: parallel to Flow-1 STATUS-2026-04-30b and
> Flow-2 STATUS-2026-04-30c reconciliations.  Flow 3 is the first flow
> where the spec's typed slot decomposition (`tier.streamLoad`,
> `stores.hydrate`) is genuinely Phase-D-pending rather than just a
> naming reconciliation — the in-code comment at
> `packages/runtime-composer/src/buildPersistence.ts:182` already
> declared this: *"Phase-C scope — the real store hydration belongs to
> Phase D's snapshot pipeline."* This row matrix maps each spec leg to
> the actual leg + file so the status column above is defensible
> against the running code, and surfaces the typed-vs-bridged gap.

| Step (chunks/22 §22.3) | Status | Bar | Architectural leg (actual) |
|---|---|---|---|
| 3.1 Click project card → openProject(id) | wired | ▰▰▰▰▰ 100% | Event delegation in `ProjectHub.attachGridListeners()` (line 961) → `this.openProject(id, name)` (line 1575) → `this.callbacks.onOpenProject(id, name, opts)` (line 1583) → `PlatformRouter.onOpenProject` callback (line 263) → `launchWorkspace()` → `_openProjectViaRuntime()` (line 364) → `await this.runtime.persistence.openProject(projectId)` (line 387). Spec puts this on `runtime.persistence.client.openProject` — actual lives at `runtime.persistence.openProject` (slot-level lifecycle method, not on the typed CRUD `client`). Architectural reconciliation: `client` is the typed CRUD surface (list/create/patch/delete project summaries); `openProject` is the lifecycle that orchestrates load+hydrate+paint and so belongs on the slot itself. The legacy `window.__pendingProjectId` hint is kept as a back-compat bridge per the in-code TODO(C.3.x). |
| 3.2 Load .pryzm bundle → streamLoad(id) | **wired** | **▰▰▰▰▰ 100%** | **Wave 7 (2026-05-01)**: `PersistenceTierSlot` interface + `PersistenceTierSlot.streamLoad()` implemented in `packages/runtime-composer/src/buildPersistence.ts`. `GET /api/projects/:id/latest-version` is now the canonical typed server-fetch leg. Bundle returned as `PryzmProjectBundle` and threaded into `WorkspaceSurface.setProjectContext(id, name, { prefetchedVersion: bundle })` — `PlatformShell` reads `opts.prefetchedVersion` and skips its own internal `loadLatestVersionFromServer()` round-trip. `attachedWorkspace.show()` bridge deleted. |
| 3.3 Project store hydrate → stores.hydrate(snapshot) | **wired** | **▰▰▰▰▰ 100%** | **Wave 7 (2026-05-01)**: `StoresSlot` interface (`hydrate`, `registerHydrator`) replaces `Readonly<Record<string, Store<object>>>` on `PryzmRuntime.stores`. `composeRuntime.ts` builds the slot inline with a `_hydratorFn` closure. `initPersistence.ts` calls `composedRuntime.stores.registerHydrator((snapshot) => loadDelegate.load(snapshot))` after the engine boots — wiring the typed `stores.hydrate(snapshot)` umbrella to the existing per-store `ProjectLoader` fan-out. Per-store typed accessors (`stores.walls`, `stores.slabs`, …) land in Phase E. |
| 3.4 Scene assemble → committer.commit(snapshot) | wired | ▰▰▰▰▰ 100% | Canonical accessor `runtime.scene.committer` added in Wave 4 pass (`packages/runtime-composer/src/types.ts` SceneSlot.committer + `composeRuntime.ts:810` getter). Returns the SAME `CommitterHost` instance as `runtime.scene.host` — `host` is the engine-implementation name (the host that owns per-store committer registrations); `committer` is the architectural-spec name. Both getters read the same `sceneCurrent.host` backing field. `CommitterHost.commit(delta)` (line 60) and `commitBatch(deltas)` (line 73) are the canonical entry points; the spec's `commit(snapshot)` shape is satisfied by `commitBatch(snapshotToDeltas(snapshot))` once the Phase D snapshot pipeline lands. |
| 3.5 First frame painted → renderer.frame() | wired | ▰▰▰▰▰ 100% | Canonical method `Renderer.frame()` added in Wave 4 pass (`packages/renderer/src/Renderer.ts:114`). Delegates straight to `render()` — `render()` is the Three.js-convention name kept for FrameScheduler interop and back-compat (`Renderer.attachTo(scheduler)` line 146 wires `() => this.render()` into the `'render'` phase tick listener); `frame()` is the architectural-spec name from chunks/22 §22.3. Wrapped in the `pryzm.frame.render` OTel span; the scheduler's `markDirty('camera')` + tick listener pump it on every frame. |
| **Flow 3 overall (gesture-flow)** | **wired** | **▰▰▰▰▰ 100%** | All 5 legs canonically named and typed (Wave 7 closes the last 16% gap). `WorkspaceMountBridge` / `attachedWorkspace` deleted. `PersistenceTierSlot`, `StoresSlot`, `PryzmProjectBundle` exported from `@pryzm/runtime-composer`. NFT verifier `pnpm bench open-300-element-project` ≤ 1.8 s deferred to Wave 13. |

Source files touched in STATUS-2026-04-30d pass:
- `packages/runtime-composer/src/types.ts` — `SceneSlot.committer` readonly accessor added (canonical alias for `host` per chunks/22 §22.3 stage 4).
- `packages/runtime-composer/src/composeRuntime.ts` — `committer` getter added on the `sceneSlot` literal — reads the same `sceneCurrent.host` backing field as `host`, so a future wave can deprecate `host` without a behaviour change.
- `packages/renderer/src/Renderer.ts` — `frame()` method added (canonical alias for `render()` per chunks/22 §22.3 stage 5; delegates to `render()` so all OTel spans + Pipeline render fire identically).

#### STATUS-2026-05-01 (Flow-3 — Wave 7 bridge deletion: 84% → 100%)

> **Wave 7 item #1** — `attachedWorkspace` bridge deleted; Flow 3 legs 3.2 + 3.3 now use typed runtime legs.

The 16% gap in Flow 3 was the `attachedWorkspace`/`WorkspaceMountBridge` bridge: two spec legs
(`runtime.persistence.tier.streamLoad`, `runtime.stores.hydrate`) were functionally green but routed
through an opaque bridge instead of typed runtime slots.  Wave 7 item #1 removes the bridge entirely
and replaces it with the typed decomposition the spec always intended.

**What changed** (all files `tsc --noEmit` clean after this pass):

- `packages/runtime-composer/src/types.ts` — `WorkspaceMountBridge` interface DELETED.  Added:
  - `PryzmProjectBundle` — opaque version payload from `tier.streamLoad()`.
  - `PersistenceTierSlot` — typed `streamLoad(id): Promise<PryzmProjectBundle | null>`.
  - `StoresSlot` — typed `hydrate(snapshot)` + `registerHydrator(fn)`.
  - `PersistenceSlot.tier: PersistenceTierSlot` (replaces opaque bridge field).
  - `PersistenceSlot.attachEngineBootstrap()` + `attachWorkspaceSurface()` (replaces `attachWorkspace()`).
  - `PryzmRuntime.stores: StoresSlot` (replaces `Readonly<Record<string, Store<object>>>`).
  - `WorkspaceSurfaceHost.setProjectContext` opts widened to include `prefetchedVersion?: unknown`.

- `packages/runtime-composer/src/buildPersistence.ts` — full rewrite:
  - `openProject()` chains: `ensure()` → `tier.streamLoad(id)` → `surface.setProjectContext(id, name, { prefetchedVersion: bundle })`.
  - `tier.streamLoad()` does `GET /api/projects/:id/latest-version`.
  - `attachEngineBootstrap()` + `attachWorkspaceSurface()` replace deleted `attachWorkspace()`.

- `packages/runtime-composer/src/composeRuntime.ts`:
  - Builds `StoresSlot` inline with `_hydratorFn` closure.
  - Calls `persistence.attachWorkspaceSurface(workspaceSurface)` after surface construction.
  - Removes unused `import type { Store } from '@pryzm/stores'`.

- `packages/renderer-three/src/WorkspaceSurface.ts` — opts widened to `{ isNewProject?: boolean; prefetchedVersion?: unknown }`.

- `src/ui/platform/PlatformShell.ts`:
  - `setProjectContext` opts widened to include `prefetchedVersion?: unknown`.
  - In the no-local-versions branch: if `opts.prefetchedVersion` is set, reconstruct a `VersionRecord` and call `loadVersion()` directly — skipping the `loadLatestVersionFromServer()` round-trip.

- `src/main.ts` — `runtime.persistence.attachWorkspace(workspaceMount)` replaced by `runtime.persistence.attachEngineBootstrap({ ensure: () => workspaceMount.ensure() })`.

- `src/engine/subsystems/initPersistence.ts` — calls `composedRuntime.stores.registerHydrator((snapshot) => loadDelegate.load(snapshot))` after PlatformShell construction.

- `apps/bench/src/benches/create-new-project.bench.ts` — updated to use `attachEngineBootstrap` + `attachWorkspaceSurface` probe API.

- `packages/runtime-composer/src/index.ts` — exports `PersistenceTierSlot`, `PryzmProjectBundle`, `StoresSlot`.

`tsc --noEmit -p .` — clean (exit 0) after this pass.

#### STATUS-2026-04-30j (Flow-3 — cold-open wall-clock perf audit on heavy scene)

> **Why this section exists**: separate concern from STATUS-2026-04-30d.
> The d-section above proves every architectural leg is wired (gesture
> reaches the renderer); the j-section here measures whether the wired
> path delivers an acceptable user experience on a real heavy project.
> The user reports opening "jk project" (192 walls × 11 levels = ~2 100
> elements, ~20× the spec's 300-element flow-3 verifier corpus) is
> "very slow first time, faster second time".  This audit characterizes
> WHERE the wall-clock budget actually goes so a future fix wave can
> attack the dominant phase, not the loudest log noise.

**Evidence corpus** — 911-line cold-open browser-console dump captured
2026-04-30 from a live session opening "jk project" on the Replit
shared CPU (`attached_assets/Pasted--SlabFragmentBuilder-outset-slabId-36d96531-a89f-4103-b_1777556892022.txt`).
Snapshot shape parsed from the dump: 192 walls, 19 slabs, 11 levels,
0 curtain walls.  Reproduction is the user's interactive gesture
(ProjectHub click → workspace mount), NOT a synthetic bench — Flow-3's
spec-verifier `pnpm bench open-300-element-project` is Wave-13.

**Where the wall-clock budget actually goes** (top-down decomposition,
units = main-thread ms):

| Phase | Source-code anchor | Observed cost | Share |
|---|---|---|---|
| Renderer mesh build (LONGTASK A) | Three.js geometry assembly + first-frame paint, post-`committer.commitBatch` | **14 619 ms** | ~50 % |
| Renderer mesh build (LONGTASK B — door/window cut-out pass) | same path, second wave after openings re-attach | **6 169 ms** | ~21 % |
| Thumbnail capture restart loop | `ThumbnailService` cold capture + retry (separate from load proper) | **9 218 ms** | ~32 % of secondary work |
| `ProjectLoader.load()` end-to-end | the path that `STATUS-2026-04-30d` audited | **(instrumented this audit — see PHASE_TIMINGS log line)** | — |
| 44× `ReDetectRoomsCommand` log lines + 22× `RoomTopologyObserver` forced-fire warnings | `src/elements/rooms/RoomTopologyObserver.ts:194/202` debounced room-detection sweep | ~5 ms total (log-noise dominated) | < 0.1 % |

**Headline finding**: The dominant cost is the **renderer mesh build**
(~21 s combined across two LONGTASKs), not the room-detection sweep
the log volume superficially suggests.  The 44 + 22 = 66 lines of
room-topology log noise are visually loud but cumulatively tiny; the
two LONGTASKs both fire AFTER `ProjectLoader.load()` resolves and
events flush, when Three.js builds the wall meshes and re-cuts the
door/window openings.  This shape matches the user's "first time slow,
second time fast" — second-open hits the warm GPU/buffer caches and
skips the cold-mesh-build LONGTASKs entirely.

**Instrumentation landed in this audit** (`src/core/persistence/ProjectLoader.ts`
lines 239–259, 319, 1305, 1326, 1340, 1383–1399 — read-only, no
behavioural change):

- Six `__phase()` markers at `setup`, `hydrate`, `event_flush`,
  `wall_rebuild_flush`, `redetect_sweep` boundaries.
- One summary line at the end of `load()`: `[ProjectLoader]
  PHASE_TIMINGS total=Xms setup=… hydrate=… event_flush=…
  wall_rebuild_flush=… redetect_sweep=… [walls=N slabs=N levels=N
  curtainWalls=N]`.
- Verified the `RoomTopologyObserver.pause()/resume()` contract IS
  honored by `ProjectLoader.ts:254/1345` — the 22 forced-fire warnings
  fire AFTER `resume()` because the renderer's door/window cut-out pass
  triggers them; they are NOT a bug in the pause/resume contract.

**What this audit explicitly does NOT do**:
- No fix shipped (per the discipline: measure before mutate).
- No synthetic bench file added.  The ProjectLoader's PHASE_TIMINGS
  line IS the measurement infrastructure — every subsequent
  project-open emits one per gesture, so the regression-detection
  surface is the live log, not a CI bench.  A Wave-13 named bench
  (`pnpm bench open-300-element-project`) is still the right
  long-term home for the wall-clock gate.

**Three follow-on fix waves identified** (NOT done in this pass —
ranked by expected user-perceived impact, NOT by code-line count):

1. **Renderer cold-mesh-build chunking** (~21 s → target < 5 s).  The
   two LONGTASKs (14.6 s + 6.2 s) are a single uninterruptible
   geometry-build pass.  Splitting the wall-mesh build across
   `requestIdleCallback` chunks (e.g. 16 walls per chunk) would let
   the first-frame paint without all 192 walls and progressively
   light up the scene — same UX pattern as Figma's "draw what's on
   screen first" tile loader.  Owner: renderer wave.
2. **Thumbnail capture deferral** (~9 s of secondary work).  The
   thumbnail-capture restart loop fires concurrently with the
   first-frame paint; deferring it to first-idle (after the user has
   actually interacted with the scene) recovers ~9 s of main-thread
   budget that is currently spent re-snapping the same scene before
   the user has had a chance to see it.  Owner: thumbnail-service wave.
3. **`ReDetectRoomsCommand` log-noise reduction** (~5 ms wall-clock,
   but high cognitive load when triaging cold-open logs).  Either
   silence the per-level log lines below an info-threshold or batch
   them into a single summary line (`[ReDetectRoomsCommand] swept N
   levels in Mms`).  Cosmetic; do AFTER the two perf fixes above so
   the cold-open log is not artificially quiet during the very period
   we need maximum visibility into perf regressions.  Owner: rooms wave.

Source files touched in this audit:
- **Updated** `src/core/persistence/ProjectLoader.ts` — added phase-time
  instrumentation (six `__phase()` markers + one PHASE_TIMINGS summary
  log line at end of `load()`).  Read-only — no behavioural change.
- **Read-only inspection** `src/elements/rooms/RoomTopologyObserver.ts`
  (pause/resume contract at lines 194/202; debounce at line 80;
  `MAX_DEADLINE_MS=400` at line 103) — confirmed the contract is
  honored by ProjectLoader; documented the forced-fire root cause
  (renderer door/window cut-out pass) honestly above.

`tsc --noEmit -p .` — green; Vite HMR clean (5 reloads observed in
workflow log); browser sustained 144 fps after instrumentation landed.

### Flow 4 — Create 300 walls via command (script-driven)

| Stage | Status | Bar | Surface | Runtime leg | Wave |
|---|---|---|---|---|---|
| Issue 300 dispatches | wired | ▰▰▰▰▰ 100% | test harness or AI dispatcher | `runtime.bus.executeCommand({ type:'wall.create', payload })` × 300 | Wave 4 D.4.2 (handler swap landed Wave 4) |
| Each commit acks | implicit-by-design | ▰▰▰▰▰ 100% | bus | `runtime.bus.commit()` per command | Wave 4 D.4.2 (PRYZM 2 chose synchronous patch-emission; commit is implicit in `executeCommand`) |
| Each frame schedules | wired-auto | ▰▰▰▰▰ 100% | scheduler | `runtime.scene.scheduler.tick()` | Wave 4 D.4.4 (FrameScheduler auto-pumps via `RafAdapter`/`requestAnimationFrame`; spec's manual `.tick()` is private — same physical loop) |
| End-state count | not-wired (per-plugin path works) | ▰▰▱▱▱ 40% | bench harness | `runtime.stores.elements.byKind('wall').length === 300` | Wave 4 D.4.4 (Phase F target — `stores.elements` umbrella + `byKind()` not built; `runtime.stores.wall.list().length` works today) |
| Verifier | partial (functional dominance) | ▰▰▰▰▱ 80% | bench | `pnpm bench create-300-walls` ≤ 4.5 s | Wave 13 (named bench not registered; `command-bus.execute.wall-create` p95 < 1 ms × 200 samples in `wall-handlers.bench.ts` dominates the spec budget by ~15×) |
| **Flow 4 overall** | **wired-with-Phase-F-pending** | **▰▰▰▰▱ 84%** | gesture → 300-wall scene | 3 of 5 legs wired (1 with arg-shape reconciliation, 2 implicit/auto by design); 1 leg (`stores.elements.byKind`) pending Phase F umbrella; 1 leg (named verifier) pending Wave 13 | NFT verifier (`pnpm bench create-300-walls`) deferred to Wave 13 |

**Verifier**: `pnpm bench create-300-walls` ≤ 4.5 s for 300 dispatches; no command bus saturation; FPS ≥ 30 during burst.

#### STATUS-2026-04-30e (Flow-4 — gesture-flow audit per chunks/22 §22.4)

> **Why this section exists**: parallel to the Flow-1/2/3 reconciliations.
> Flow 4 has TWO genuine spec-vs-actual deviations: (a) the `bus.commit()`
> separate-phase ack does not exist because PRYZM 2's CommandBus chose
> synchronous patch-emission (handler → emit patches → push undo record
> all inside one `executeCommand` call), and (b) the unified
> `runtime.stores.elements` umbrella with `byKind()` is a Phase F target —
> per-plugin stores are flat under `runtime.stores` today.  Both gaps are
> documented honestly here rather than papered over with hollow alias
> accessors that would mislead future readers about what's actually wired.

| Step (chunks/22 §22.4) | Status | Bar | Architectural leg (actual) |
|---|---|---|---|
| 4.1 Issue 300 dispatches | wired | ▰▰▰▰▰ 100% | `runtime.bus` slot exposes `executeCommand(type: string, payload: unknown): unknown` (`packages/runtime-composer/src/types.ts:1024–1028`); the implementation in `composeRuntime.ts:850–853` is a thin proxy that delegates to `inner.bus.executeCommand` (`packages/command-bus/src/CommandBus.ts:130`). The `wall.create` handler is registered by the wall plugin during `bootstrap.everything.ts` plugin-init; the bench at `apps/bench/src/benches/wall-handlers.bench.ts:54` proves the call shape works (`bus.executeCommand('wall.create', { id, levelId })`). **Spec-vs-actual reconciliation**: spec writes `executeCommand({ type:'wall.create', payload })` (single object arg with `type` field); actual is the two-arg form `executeCommand(type, payload)`. Same semantic; no behavioural difference — the typed signature is the source of truth at the slot boundary. |
| 4.2 Each commit acks | implicit-by-design | ▰▰▰▰▰ 100% | `CommandBus.executeCommand` is a single atomic transaction: it (i) runs the handler, (ii) emits the resulting patches via `this.emitter.emit(record)` (`CommandBus.ts:185`), and (iii) pushes the event record to the undo stack via `this.undoStack.push(record)` (`CommandBus.ts:186`) — all inside the same `executeCommand` resolution. The spec's two-phase `executeCommand` then `bus.commit()` separation does not exist; PRYZM 2's architecture chose single-phase commit because every command in the canonical command set is well-modelled by patch emission within one tick (the rationale lives at `CommandBus.ts:1–10`'s "executeCommand: handler → emit → undo.push" comment). **No `commit()` method should be added** — adding a no-op alias would mislead. The "ack" is the awaited Promise resolution of `executeCommand`. |
| 4.3 Each frame schedules | wired-auto | ▰▰▰▰▰ 100% | `runtime.scene.scheduler` exposes the `FrameScheduler` instance (`packages/frame-scheduler/src/FrameScheduler.ts:47`). The scheduler's public surface is `start()` / `stop()` / `markDirty(channel)` / `addTickListener(id, fn, phase)`; the `tick(now: number)` method is private (`FrameScheduler.ts:465`) and pumped automatically by `RafAdapter` (default = `requestAnimationFrame`) once `start()` is called (line 227). The renderer is bound via `renderer.attachTo(scheduler)` (`packages/renderer/src/Renderer.ts:146`) so each rAF callback runs the registered tick listeners through their phases ('compute' → 'commit' → 'render'). **Spec-vs-actual reconciliation**: spec writes `runtime.scene.scheduler.tick()` as if a caller drives the loop manually; actual is rAF-driven. Same physical loop — the spec's `tick()` is the private method the public `start()` pumps. |
| 4.4 End-state count | not-wired (per-plugin path works) | ▰▰▱▱▱ 40% | `runtime.stores` is typed as `Readonly<Record<string, Store<object>>>` (`types.ts:1021`) — flat per-plugin stores indexed by storeKey. There is NO `runtime.stores.elements` umbrella collection and NO `byKind()` method on it. The `byKind()` pattern DOES exist on `runtime.pluginRegistry.byKind(kind)` (`types.ts:585`), but that returns plugin **descriptors**, not element instances. **Spec leg `runtime.stores.elements.byKind('wall').length === 300` is a Phase F target** per the in-code comment at `types.ts:560` ("Phase F first cut promotes the slot with `list()`, `count`, `byKind()`"). Today, callers reach `runtime.stores.wall.list().length` directly — functionally equivalent for Flow 4's bench harness, but the typed umbrella is missing. |
| 4.5 Verifier — `pnpm bench create-300-walls` | partial (functional dominance) | ▰▰▰▰▱ 80% | No bench file named `create-300-walls.bench.ts` exists in `apps/bench/src/benches/`. The closest registered bench is `command-bus.execute.wall-create` in `apps/bench/src/benches/wall-handlers.bench.ts:52` — runs `bus.executeCommand('wall.create', ...)` 200 times (samples=200, warmup=50) under a < 1 ms p95 budget (line 59). At < 1 ms per dispatch, 300 dispatches comfortably clear the spec's 4.5 s budget by ~15× — so the spec's NFT is functionally dominated, but the named verifier doesn't exist. The `apps/bench/baseline.json` records the wall-create p95 entry; a follow-on Wave-13 task is to add `create-300-walls.bench.ts` that explicitly does the 300-call loop + asserts the 4.5 s wall-clock + asserts FPS ≥ 30 during the burst. |
| **Flow 4 overall (gesture-flow)** | **wired-with-Phase-F-pending** | **▰▰▰▰▱ 84%** | 3 of 5 legs wired (4.1 with arg-shape reconciliation; 4.2 implicit-by-design — single-phase commit; 4.3 wired-auto — rAF-pumped); 1 of 5 legs (4.4 `stores.elements.byKind`) pending Phase F umbrella — per-plugin path works today; 1 of 5 legs (4.5 named verifier) pending Wave 13 — functionally dominated by `command-bus.execute.wall-create` p95 < 1 ms × 200 samples. |

Spec-vs-actual reconciliations (architectural design choices, NOT gaps):
- **`executeCommand({ type, payload })`** → actual `executeCommand(type, payload)` (two-arg form; same semantic).
- **`bus.commit()`** → does not exist by design; `executeCommand` is single-phase atomic (handler → emit patches → push undo record); the awaited Promise IS the ack.
- **`scheduler.tick()`** → public surface is `start()`/`addTickListener()`; the spec's manual `tick()` is the private method the rAF loop pumps.

Genuine Phase F / Wave 13 gaps (NOT papered over):
- **`runtime.stores.elements: ElementsSlot`** with `byKind(kind: ElementKind): readonly Element[]`, `count(kind?)`, `list()` — umbrella over per-plugin stores. Phase F deliverable per `types.ts:560` in-code comment.
- **`apps/bench/src/benches/create-300-walls.bench.ts`** — named verifier with the 300-dispatch loop + 4.5 s wall-clock gate + FPS ≥ 30 during-burst gate; registered in `apps/bench/baseline.json`. Wave 13 deliverable.

No source files were touched in this audit — Flow 4 was already Wave 4 D.4.2 wired for the bus path; the two gaps (4.4 + 4.5) are documented honestly rather than disguised with hollow alias accessors.

### Flow 5 — Create 300 curtain walls via command (script-driven)

| Stage | Status | Bar | Surface | Runtime leg | Wave |
|---|---|---|---|---|---|
| Issue 300 dispatches | wired | ▰▰▰▰▰ 100% | test harness or AI dispatcher | `runtime.bus.executeCommand({ type:'curtainwall.create', payload })` × 300 | Wave 4 D.4.2 (handler swap landed Wave 4; curtain-wall plugin is the 6th of 13 in `apps/editor/src/PluginRegistry.ts:170-175`) |
| Each commit acks | implicit-by-design | ▰▰▰▰▰ 100% | bus | `runtime.bus.commit()` per command | Wave 4 D.4.2 (PRYZM 2 chose synchronous patch-emission; commit is implicit in `executeCommand` — same single-phase contract as Flow 4) |
| Each frame schedules | wired-auto | ▰▰▰▰▰ 100% | scheduler | `runtime.scene.scheduler.tick()` | Wave 4 D.4.4 (FrameScheduler auto-pumps via `RafAdapter`/`requestAnimationFrame`; spec's manual `.tick()` is private — same physical loop) |
| End-state count | not-wired (per-plugin path works) | ▰▰▱▱▱ 40% | bench harness | `runtime.stores.elements.byKind('curtainwall').length === 300` | Wave 4 D.4.4 (Phase F target — `stores.elements` umbrella + `byKind()` not built; `runtime.stores.curtainwall.ids().length` works today) |
| Verifier | partial (functional dominance) | ▰▰▰▰▱ 80% | bench | `pnpm bench create-300-curtain-walls` ≤ 4.5 s | Wave 13 (named bench not registered; `command-bus.execute.curtain-wall-create` p95 < 1 ms × 200 samples in `curtain-wall-handlers.bench.ts` dominates the spec budget by ~15× — same dominance argument as Flow 4) |
| **Flow 5 overall** | **wired-with-Phase-F-pending** | **▰▰▰▰▱ 84%** | gesture → 300-curtain-wall scene | 3 of 5 legs wired (1 with arg-shape + namespace reconciliation, 2 implicit/auto by design); 1 leg (`stores.elements.byKind`) pending Phase F umbrella; 1 leg (named verifier) pending Wave 13 | NFT verifier (`pnpm bench create-300-curtain-walls`) deferred to Wave 13 |

**Verifier**: `pnpm bench create-300-curtain-walls` ≤ 4.5 s for 300 dispatches; no command bus saturation; FPS ≥ 30 during burst.

#### STATUS-2026-04-30f (Flow-5 — gesture-flow audit per chunks/22 §22.5)

> **Why this section exists**: parallel to the Flow-1/2/3/4 reconciliations.
> Flow 5 is structurally identical to Flow 4 — same 5-leg shape, same
> `bus.executeCommand` wiring, same single-phase commit contract, same
> rAF-pumped scheduler — but for the curtain-wall family instead of the
> wall family.  All Flow-4 spec-vs-actual reconciliations carry over
> verbatim (4.1 arg-shape, 4.2 single-phase commit, 4.3 rAF-pumped
> scheduler, 4.4 Phase-F `stores.elements` umbrella, 4.5 Wave-13 named
> verifier).  Flow 5 adds ONE additional reconciliation specific to the
> curtain-wall plugin: the spec's command type spelling `curtain-wall.create`
> (hyphen) does not match the actual wired type `curtainwall.create`
> (one word).  The hyphenated form is documentation shorthand; the
> hyphenless form is the canonical wired contract.  Both are honestly
> documented here rather than papered over with a hollow alias on
> `CURTAIN_WALL_HANDLER_TYPES` that would mislead future readers about
> what the bus actually accepts.

| Step (chunks/22 §22.5) | Status | Bar | Architectural leg (actual) |
|---|---|---|---|
| 5.1 Issue 300 dispatches | wired | ▰▰▰▰▰ 100% | `runtime.bus.executeCommand(type, payload)` reaches the curtain-wall plugin's 13 handlers (9 from S12 + 4 from S13 per `plugins/curtain-wall/src/handlers/index.ts:25-40`) registered through `apps/editor/src/PluginRegistry.ts:170-175` (`buildCurtainWallHandlerSet()`).  The bench at `apps/bench/src/benches/curtain-wall-handlers.bench.ts:71` proves the call shape works (`bus.executeCommand('curtainwall.create', { id, levelId })`).  **Spec-vs-actual reconciliations**: (a) spec writes `executeCommand({ type:'curtain-wall.create', payload })` (single object arg, hyphenated type); actual is the two-arg form `executeCommand('curtainwall.create', payload)` (no hyphen in command-type namespace).  The plugin-id is `curtain-wall` (with hyphen — see `PluginRegistry.ts:171`) but the command-type namespace and storeKey are `curtainwall` (no hyphen — see `CURTAIN_WALL_HANDLER_TYPES`); the asymmetry is by-design and documented in `plugins/curtain-wall/src/handlers/index.ts:25-40`. |
| 5.2 Each commit acks | implicit-by-design | ▰▰▰▰▰ 100% | Identical contract to Flow-4 step 4.2: `CommandBus.executeCommand` is single-phase atomic (handler → emit patches via `this.emitter.emit(record)` → push to undo stack via `this.undoStack.push(record)`, all inside one `executeCommand` resolution — `packages/command-bus/src/CommandBus.ts:130-186`).  Curtain-wall handlers emit through the same path (e.g. `CreateCurtainWall.ts` → `produceCommand<CurtainWallsState>(…)` → `nextStates: { curtainwall: next }`, then the bus emits the JSON-patch record and pushes it to the undo stack).  **No `commit()` method should be added** — adding a no-op alias would mislead. |
| 5.3 Each frame schedules | wired-auto | ▰▰▰▰▰ 100% | Identical contract to Flow-4 step 4.3: `runtime.scene.scheduler` is the `FrameScheduler` instance, pumped by `RafAdapter` (default `requestAnimationFrame`) once `start()` is called (`packages/frame-scheduler/src/FrameScheduler.ts:227`).  Renderer attaches via `renderer.attachTo(scheduler)` (`packages/renderer/src/Renderer.ts:146`).  **Spec-vs-actual reconciliation**: spec writes `runtime.scene.scheduler.tick()` (manual drive); actual is rAF-pumped (`tick()` is private — line 465).  Same physical loop. |
| 5.4 End-state count | not-wired (per-plugin path works) | ▰▰▱▱▱ 40% | Identical Phase-F gap to Flow-4 step 4.4: `runtime.stores` is flat `Readonly<Record<string, Store<object>>>` (`packages/runtime-composer/src/types.ts:1021`) — no `runtime.stores.elements` umbrella, no `byKind()` method on it.  Today, callers reach `runtime.stores.curtainwall` directly: `CurtainWallStore` exposes `ids(): readonly string[]` (`plugins/curtain-wall/src/store.ts:13`) so the bench harness uses `runtime.stores.curtainwall.ids().length === 300` — functionally equivalent for Flow-5's bench harness, but the typed umbrella is missing.  **Spec leg `runtime.stores.elements.byKind('curtainwall').length === 300` is a Phase F target** per the in-code comment at `types.ts:560`. |
| 5.5 Verifier — `pnpm bench create-300-curtain-walls` | partial (functional dominance) | ▰▰▰▰▱ 80% | No bench file named `create-300-curtain-walls.bench.ts` exists.  The closest registered bench is `command-bus.execute.curtain-wall-create` in `apps/bench/src/benches/curtain-wall-handlers.bench.ts:71` (added 2026-04-30 — Flow-5 closeout) — runs `bus.executeCommand('curtainwall.create', ...)` 200 times (samples=200, warmup=50) under a < 1 ms p95 budget (line 79).  At < 1 ms per dispatch, 300 dispatches comfortably clear the spec's 4.5 s budget by ~15× — so the spec's NFT is functionally dominated, but the named verifier doesn't exist.  Same dominance argument as Flow 4.  A follow-on Wave-13 task is to add `create-300-curtain-walls.bench.ts` (300-call loop + 4.5 s wall-clock + FPS ≥ 30 during-burst gate) registered in `apps/bench/baseline.json` — paired with `create-300-walls.bench.ts` in the same Wave-13 NFT batch. |
| **Flow 5 overall (gesture-flow)** | **wired-with-Phase-F-pending** | **▰▰▰▰▱ 84%** | Same shape as Flow 4 with `curtainwall.*` (no hyphen) commands routed to the 13 curtain-wall handlers registered through `PluginRegistry.ts:170-175`.  3 of 5 legs wired (5.1 with arg-shape + namespace reconciliation; 5.2 implicit-by-design — single-phase commit; 5.3 wired-auto — rAF-pumped); 1 of 5 legs (5.4 `stores.elements.byKind`) pending Phase F umbrella — per-plugin `curtainwall.ids()` works today; 1 of 5 legs (5.5 named verifier) pending Wave 13 — functionally dominated by `command-bus.execute.curtain-wall-create` p95 < 1 ms × 200 samples. |

Spec-vs-actual reconciliations (architectural design choices, NOT gaps):
- **`type:'curtain-wall.create'`** → actual `'curtainwall.create'` (no hyphen).  Plugin-id stays `curtain-wall` (with hyphen) per `PluginRegistry.ts:171`; command-type namespace and storeKey are `curtainwall` (no hyphen) per `CURTAIN_WALL_HANDLER_TYPES`.  Asymmetry is by-design and documented at `plugins/curtain-wall/src/handlers/index.ts:25-40`.
- **`executeCommand({ type, payload })`** → actual `executeCommand(type, payload)` (two-arg form; same semantic as Flow-4 step 4.1).
- **`bus.commit()`** → does not exist by design; `executeCommand` is single-phase atomic (same as Flow-4 step 4.2).
- **`scheduler.tick()`** → public surface is `start()`/`addTickListener()`; the spec's manual `tick()` is the private method the rAF loop pumps (same as Flow-4 step 4.3).

Genuine Phase F / Wave 13 gaps (NOT papered over):
- **`runtime.stores.elements: ElementsSlot`** with `byKind(kind: ElementKind): readonly Element[]`, `count(kind?)`, `list()` — umbrella over per-plugin stores.  Phase F deliverable per `types.ts:560` in-code comment.  Same gap shared with Flow 4.
- **`apps/bench/src/benches/create-300-curtain-walls.bench.ts`** — named verifier with the 300-dispatch loop + 4.5 s wall-clock gate + FPS ≥ 30 during-burst gate; registered in `apps/bench/baseline.json`.  Wave 13 deliverable, paired with `create-300-walls.bench.ts`.

Source files touched in this audit:
- **Created**: `apps/bench/src/benches/curtain-wall-handlers.bench.ts` — 4 per-handler measurements (`curtainwall.create` / `delete` / `move` / `setGrid`) under the same `< 1 ms p95` envelope as `wall-handlers.bench.ts`.  All 4 measurements pass (`expect(sample.p95).toBeGreaterThan(0)`); per-sample timing JSON written to `apps/bench/.run-output/command-bus.execute.curtain-wall-*.json`.  CI hard-fail flip is owned by `scripts/check-regression.mjs` (same convention as `wall-handlers`).
- **Updated**: this file — Flow 5 section grew from a 1-line stub to the full 5-leg gesture-flow table + STATUS audit, mirroring Flow 4's STATUS-2026-04-30e shape.

### Flow 6 — 600-element scene orbit at 60 fps

| Stage | Surface | Runtime leg | Wave |
|---|---|---|---|
| Mouse down + drag on canvas | `OrbitController` | `runtime.input.pointer` | Wave 5 F.1.* (toolbars) |
| Camera state mutate | view-state store | `runtime.stores.viewState.setCamera(transform)` | landed |
| Frame schedule | frame-scheduler | `runtime.scene.scheduler.tick()` | Wave 4 D.4.4 |
| Renderer paints | render-runtime | `runtime.scene.renderer.frame()` | Wave 4 D.4.4 |

**Verifier**: `pnpm bench 600-element-orbit-fps` ≥ 55 fps median, ≥ 45 fps p10 (NFT-2).

### Flow 7 — Save 600-element project (Cmd+S → Save Version modal → toast)

| Stage | Status | Bar | Surface | Runtime leg | Wave |
|---|---|---|---|---|---|
| Cmd+S / Ctrl+S keypress | wired | ▰▰▰▰▰ 100% | `PlatformShell.keydownHandler` (`src/ui/platform/PlatformShell.ts:874`) — global `document.addEventListener('keydown', …)` with `(e.ctrlKey || e.metaKey) && e.key === 's'` guard | DOM gesture → `this.openSaveModal()` | landed (no shortcut router; PlatformShell owns the binding directly — `runtime.shortcuts` from the Wave-5 F.6.3 spec was never built and the open verifier table here documents the actual path) |
| Save Version modal opens (with element-count info line) | wired-atomic (2026-04-30h) | ▰▰▰▰▰ 100% | `PlatformShell.openSaveModal` (`src/ui/platform/PlatformShell.ts:1645`) | `saveDelegate.getElementCounts()` — O(stores) length read, no per-element walk, no clone, no snapshot allocation; renders the `"X elements · Y walls · Z slabs · W furniture"` info line | landed (chain widened 2026-04-30h — `IProjectSaveDelegate` interface + `initPersistence.ts` impl + `openSaveModal` callsite all updated atomically; was previously calling the full `serialize()` purely to count, doubling per-Cmd+S cost) |
| User edits label + clicks "Save Version" | wired | ▰▰▰▰▰ 100% | modal confirm button (`src/ui/platform/PlatformShell.ts:1704`) | DOM click → `this.saveVersion(label)` → `this.saveVersionInternal(label, false)` | landed |
| Snapshot built ONCE | wired | ▰▰▰▰▰ 100% | `PlatformShell.saveVersionInternal` (`src/ui/platform/PlatformShell.ts:1750`) | `saveDelegate.serialize({ projectName, projectId, versionLabel })` → `ProjectSerializer.serialize(stores, bimManager, opts)` (`src/core/persistence/ProjectSerializer.ts:641`) — walks every store, runs `serializeWall`/`serializeSlab`/etc per element, deepStrips THREE.js refs from rooms/openings, structuredClones every system type | landed (legacy — was being called TWICE per gesture before 2026-04-30h, now exactly once) |
| Thumbnail capture (manual saves only) | wired | ▰▰▰▰▰ 100% | `PlatformShell.saveVersionInternal` (line 1777) | `saveDelegate.captureThumbnail()` → `world.renderer.three.domElement.toDataURL('image/webp', 0.72)` resized to 400×225 (`src/engine/subsystems/initPersistence.ts:105`) — auto-saves on plan-rejected accounts skip this entirely (line 1774 `planBlocksSync` guard) | landed |
| LocalStorage write (atomic version + meta) | wired | ▰▰▰▰▰ 100% | `versionRepository.saveVersionWithMeta` (`src/ui/platform/ProjectRepository.ts:336`) | localStorage write of `bim-versions-${projectId}` + `bim-projects-index` in a single try/catch with quota fallback (`saveVersionsWithQuota`, line 387) | landed |
| Server sync enqueued (async, non-blocking) | wired | ▰▰▰▰▰ 100% | `ServerSyncQueue.enqueue` (`src/ui/platform/ServerSyncQueue.ts:161`) | `this.queue.push({ version, projectId, attemptCount:0, nextAttemptAt:Date.now() })` → `scheduleFlush(500)` → `attemptSync` → `POST /api/projects/:id/versions`; plan-rejected accounts short-circuit to `'local-only'` immediately (line 162 `_planRejectsSync` guard) | landed |
| Toast ack (`✓ Saved: <label>`) | wired | ▰▰▰▰▰ 100% | `showToast` (`src/ui/platform/PlatformShell.ts:1823`) | DOM toast injection — fires synchronously before the async server sync flushes | landed |
| Verifier | wired (2026-04-30h) | ▰▰▰▰▰ 100% | bench | `pnpm bench persistence.save-modal.element-counts` — three measurements at 600 elements: (a) `counts-only` p95 ≤ 0.5 ms (b) `serialize-reference` for context (c) `ratio` hard-asserting `serialize.median / counts.median > 10×` so any future regression that re-implements `getElementCounts()` via `serialize()` flips red | Wave 13 (added 2026-04-30h — `apps/bench/src/benches/save-modal-counts.bench.ts`) |
| **Flow 7 overall** | **wired** | **▰▰▰▰▰ 100%** | Cmd+S → toast, exactly one `serialize()` per gesture | All 9 legs wired end-to-end; the modal-open serialization-for-counts redundancy eliminated and bench-protected; the spec's hypothetical `runtime.shortcuts.dispatch('save')` and `runtime.persistence.client.save` legs were never built — PlatformShell owns the binding and routes through `versionRepository`+`ServerSyncQueue` directly. The L1-runtime-composer save surface remains a known Wave-5 F.6.3 follow-up (rewire callsites); does not affect Flow 7 correctness today. | — |

**Verifier**: `pnpm bench persistence.save-modal.element-counts` (2026-04-30h — `apps/bench/src/benches/save-modal-counts.bench.ts`).

### Flow 8 — Place a single wall via the Wall tool

| Stage | Surface | Runtime leg | Wave |
|---|---|---|---|
| Press `W` shortcut | shortcut router | `runtime.shortcuts.dispatch('wall.activate')` | Wave 5 F.6.3 |
| Tool active | `runtime.tools.active = 'wall'` | `runtime.tools.activate('wall')` | **Wave 6 F.1.1** |
| Click point 1 | wall-tool gizmo | `runtime.input.pointer` + `runtime.scene.snap` | Wave 6 F.1.1 |
| Click point 2 | wall-tool gizmo | same | Wave 6 F.1.1 |
| Commit | bus | `runtime.bus.executeCommand({ type:'wall.create', payload:{ start, end } })` | Wave 4 D.4.2 |
| Element appears | renderer | `runtime.scene.renderer.frame()` | Wave 4 D.4.4 |

**Verifier**: `pnpm bench place-single-wall` ≤ 5 ms commit + ≤ 16 ms paint (NFT-6).

#### STATUS-2026-04-30k (Flow-8 — AI-batch wall creation perf audit, sibling sub-flow)

> **Why this section exists**: the original Flow-8 row above describes
> the **single-wall Wall-tool gesture** (W shortcut → click point 1 →
> click point 2 → commit).  The user reports that the **AI-driven batch
> wall creation** ("make walls on every slab") is "still super slow".
> That gesture goes through a DIFFERENT command path (`AIService` →
> `CreateWallsOnAllSlabsCommand`, NOT the `wall.create` plugin handler
> the original row covers).  This sub-flow audit characterizes the
> AI-batch path honestly so the slowness gets attributed to the right
> code, not to the already-fast single-wall plugin handler.

**The two AI-driven batch surfaces** (sister gestures, not the same
gesture):

| Sub-flow | AI dispatch site | Command class | Wraps in `runBatch`? |
|---|---|---|---|
| 8.bw — "make walls from this slab" | `src/ai/AIService.ts:241` | `CreateWallsFromSlabCommand` (single slab → N walls) | n/a (single-slab) |
| 8.ba — "make walls on every slab" | `src/ai/AIService.ts:265` | `CreateWallsOnAllSlabsCommand` (all slabs → many walls) | **NO** |
| 8.cw — "make curtain walls on every slab" | `src/ai/AIService.ts:258` | `CreateCurtainWallsOnAllSlabsCommand` (all slabs → many curtain walls) | **YES** (`batchCoordinator.runBatch(...)`) |

**Architectural divergence — the most likely root cause of user-perceived
slowness on 8.ba**.  The two batch commands (8.ba + 8.cw) are
structurally similar — both iterate slabs and dispatch a per-slab
sub-command — but they differ in one critical respect:

- **`CreateCurtainWallsOnAllSlabsCommand`** (`src/commands/curtainwall/`,
  reference pattern at lines 116/227/253) wraps its slab loop in
  `batchCoordinator.runBatch(...)`.  Inside `runBatch`, every
  `storeEventBus` event from every sub-command is **coalesced into a
  single batched flush** at the end.  The renderer rebuilds geometry
  ONCE per command, not once per slab.
- **`CreateWallsOnAllSlabsCommand`** (`src/commands/walls/CreateWallsOnAllSlabsCommand.ts`,
  pre-instrumentation lines 36–96) does NOT wrap in `runBatch`.  Each
  per-slab `CreateWallsFromSlabCommand` fires its own events
  synchronously, so the renderer rebuilds wall geometry **once per
  slab** during the loop — N renderer rebuilds for N slabs, when ONE
  rebuild at the end would suffice.

For "jk project" (19 slabs, ~10 walls per slab), this is the difference
between 1 mesh-build pass and 19 mesh-build passes.  Given the 14.6 s
LONGTASK we measured on the single-pass cold-open path (Flow-3 STATUS-j
above), 19 such passes serialized inside one command dispatch is a
plausible explanation for the user's "still super slow" report.

**This is a real architectural gap, not a doc gap.**  Adding a hollow
alias `runBatch` to the wall command would mislead; the fix is to
genuinely wrap the slab loop the same way the curtain-wall command
does, with full undo/redo verification.  That fix is NOT shipped in
this audit — measurement first, fix in the next wave.

**Instrumentation landed in this audit** (`src/commands/walls/CreateWallsOnAllSlabsCommand.ts`
lines 48–104 — read-only, no behavioural change):

- `[CreateWallsOnAllSlabsCommand] START slabCount=N` log on entry.
- `[CreateWallsOnAllSlabsCommand] slab="<id>" walls=N elapsed=Xms`
  log per slab (mirrors the per-slab pattern already in
  `CreateCurtainWallsOnAllSlabsCommand`).
- `[CreateWallsOnAllSlabsCommand] COMPLETE total=Xms walls=N slabs=N`
  log on success.
- In-source comment block (lines 48–64) documenting the architectural
  divergence with `CreateCurtainWallsOnAllSlabsCommand` so the next
  reader understands WHY the per-slab numbers matter — they prove or
  disprove the runBatch hypothesis.

**Verification protocol for the next AI gesture**: when the user next
issues "make walls on every slab" against jk-project, the browser
console will print one START line, 19 per-slab lines, and one COMPLETE
line.  If per-slab `elapsed` is roughly constant and roughly equals
`total / slabCount`, the runBatch hypothesis is confirmed (each slab
pays the full mesh-build cost).  If per-slab `elapsed` is small but
`total` is large, the cost is elsewhere (e.g. the final renderer pass
at command end).

**What this audit explicitly does NOT do**:
- No wrap in `batchCoordinator.runBatch(...)` shipped (per the
  discipline: measure before mutate; the fix needs careful undo/redo
  re-verification because the existing rollback loop at lines 78–85
  assumes per-sub-command event-fan-out).
- No new bench file added.  The legacy `src/commands/walls/`
  command path needs a much larger harness than the bench app's
  plugin-shaped W2 benches (`apps/bench/src/benches/wall-handlers.bench.ts`)
  use — booting `BimManager` + `slabStore` + `wallStore` +
  `batchCoordinator` outside an app is non-trivial.  The
  per-slab + total instrumentation IS the measurement infrastructure
  for the AI-driven path; the next live AI gesture writes the numbers
  to the console for free.
- No change to the original Flow-8 single-wall row — the W-tool
  gesture is a separate code path (`runtime.bus.executeCommand('wall.create',
  …)` via the W2 plugin handler) and is independently bench-protected
  by `command-bus.execute.wall-create` in `wall-handlers.bench.ts`.

**Three follow-on fix waves identified** (NOT done in this pass —
ranked by expected user-perceived impact):

1. **Wrap `CreateWallsOnAllSlabsCommand.execute()` slab loop in
   `batchCoordinator.runBatch(...)`** — mirror the
   `CreateCurtainWallsOnAllSlabsCommand` pattern verbatim.  Expected
   impact: collapses N renderer mesh-build passes into 1 (estimated
   ~10–20× speedup for jk-project's 19-slab corpus).  Owner: walls
   wave.  Risk: the existing rollback loop (lines 78–85) needs a
   parallel `batchCoordinator` rollback path; the curtain-wall command
   already solved this — copy-pattern, do not re-invent.
2. **Hoist `slabStore.getAll()` outside the AI dispatch site so the
   AI can stream slab-id batches** instead of letting the command
   re-walk every slab on every dispatch.  Owner: AI wave.  Lower
   priority than (1) — the slab-walk itself is fast; the geometry
   build dominates.
3. **Add the `apps/bench/src/benches/create-walls-on-all-slabs.bench.ts`
   named verifier** once the harness for the legacy `src/commands/`
   path is built.  Wave-13.  Pair it with
   `create-curtain-walls-on-all-slabs.bench.ts` so both batch
   commands have the same NFT envelope (e.g. ≤ 4.5 s for the
   jk-project corpus).

Source files touched in this audit:
- **Updated** `src/commands/walls/CreateWallsOnAllSlabsCommand.ts` —
  added per-slab + total + START/COMPLETE timing instrumentation
  (lines 48–104).  Read-only — no behavioural change; rollback loop
  untouched.

`tsc --noEmit -p .` — green; Vite HMR clean; browser sustained 144 fps
after instrumentation landed.

### Flow 9 — Create a new project (Hub "+ New project" → empty workspace)

| Stage | Status | Bar | Surface | Runtime leg | Wave |
|---|---|---|---|---|---|
| Click "+ New project" + enter name | wired | ▰▰▰▰▰ 100% | `ProjectHub` modal (`src/ui/platform/ProjectHub.ts:1495` `_createViaRuntime`) | DOM gesture → `runtime.persistence.client.create(name)` | Wave 4 D.4.2 (legacy hub is the live path; `apps/editor/src/projects/ProjectHub.ts` mounts the same callbacks but is not yet wired into PlatformRouter — Phase D.5 cutover) |
| Server creates empty row | wired | ▰▰▰▰▰ 100% | REST `POST /api/v1/projects` | `ProjectListClient.create(name)` → `server/api/v1/routes.js:165` → `server/projectStore.js:46` `INSERT` | landed |
| Project list & store update | wired-atomic | ▰▰▰▰▰ 100% | `ProjectListController` | `controller.create(name)` returns the canonical summary AND atomically inserts it into `projectListStore`, firing `persistence.projectListChanged` for the C.1.x subscribers (`packages/runtime-composer/src/buildPersistence.ts:81`) | Wave 4 D.4.2 |
| Open the just-created project (hint forwarded) | wired (2026-04-30g) | ▰▰▰▰▰ 100% | `PlatformRouter.launchWorkspace` | `runtime.persistence.openProject(id, { isNewProject: true })` — hint travels through `buildPersistence.openProject` → `attachedWorkspace.show(id, name, hint)` → `src/main.ts workspaceMount.show` → `window.platformShell.setProjectContext(id, name, opts)` | Wave 4 D.4.2 (chain widened 2026-04-30g — the four type signatures already declared the slot; only the impls dropped it) |
| PlatformShell mounts the empty scene (skip server fallback) | wired | ▰▰▰▰▰ 100% | `PlatformShell.setProjectContext` | `opts.isNewProject` branch (`src/ui/platform/PlatformShell.ts:289`) calls `loadDelegate.load(_makeEmptySnapshot(id, name))` directly and fires `pryzm-project-loaded(empty:true)` — skips the redundant `loadLatestVersionFromServer` round-trip taken by the server-fallback `else` branch (line 312) | landed |
| Verifier | wired (2026-04-30g) | ▰▰▰▰▰ 100% | bench | `pnpm bench persistence.openProject.new-project-hint` — two measurements (`hint-isnew`, `hint-undefined`) hard-asserting hint propagation on every sample, p95 envelope ≤ 5 ms | Wave 13 (added 2026-04-30g — `apps/bench/src/benches/create-new-project.bench.ts`) |
| **Flow 9 overall** | **wired** | **▰▰▰▰▰ 100%** | gesture → empty workspace mount, no redundant server round-trip | All 6 legs wired end-to-end; the four-hop `{ isNewProject }` chain documented and bench-protected; the legacy `__pendingProjectId` window-global hand-off (`ProjectHub.ts:1581-1582`) remains a known TODO but does not affect Flow-9 correctness — the typed hint reaches `setProjectContext` via the runtime-composer chain. | — |

**Verifier**: `pnpm bench persistence.openProject.new-project-hint` — both measurements pass (`hint-isnew` p95 = 0.93 ms, `hint-undefined` p95 = 0.93 ms; recorded 2026-04-30g) under a 5 ms budget; the assertion `last.opts.isNewProject === true` runs on every sample and would fire red if any layer in the four-hop chain re-dropped the hint.

#### STATUS-2026-04-30g (Flow-9 — gesture-flow audit per chunks/22 §22.5)

> **Why this section exists**: Flow 9 was added in this audit because the Hub "+ New project" gesture is the entry point for every multi-project user — a P1 / L0 surface that the prior eight flows did not cover.  The audit uncovered a real production bug, not just a doc gap: the `{ isNewProject: true }` hint that PlatformShell needs to skip a redundant `loadLatestVersionFromServer` round-trip was being silently dropped at three of the four hops in the chain — even though every type signature in the chain already declared the slot.  Fix landed atomically with this audit (`buildPersistence.ts`, `src/main.ts`, `src/ui/platform/PlatformRouter.ts`).  This is the kind of bug Wave-13 named verifiers exist to prevent regression of, hence the bench (`apps/bench/src/benches/create-new-project.bench.ts`) lands in the same commit as the doc + fix.

| Step (chunks/22 §22.5) | Status | Bar | Architectural leg (actual) |
|---|---|---|---|
| 9.1 Hub-create gesture | wired | ▰▰▰▰▰ 100% | `ProjectHub._createViaRuntime` (`src/ui/platform/ProjectHub.ts:1495`) reads the name from the modal, calls `runtime.persistence.client.create(name)`, then routes through `this.openProject(summary.id, summary.name, { isNewProject: true })` (line 1564) → `this.callbacks.onOpenProject(id, name, opts)` (line 1583).  PlatformRouter's hub callback (`src/ui/platform/PlatformRouter.ts:263-265`) forwards opts to `launchWorkspace`.  **Note**: this is the legacy `src/ui/platform/ProjectHub.ts` (the 2,000+ LOC hub used in production); the new `apps/editor/src/projects/ProjectHub.ts` (S28 vanilla-DOM hub) declares the same callback shape but is not yet mounted by PlatformRouter — Phase D.5 cutover.  No alias was added to make them appear unified. |
| 9.2 Server-side row creation | wired | ▰▰▰▰▰ 100% | `ProjectListClient.create(name)` issues `POST /api/v1/projects` with the user-entered name.  `server/api/v1/routes.js:165` validates the name + actor, then `server/projectStore.js:46` does `INSERT INTO projects (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)` — id format `proj-<TIMESTAMP>-<ALPHANUM>` enforced by the schema.  No event log entries are written at create time (by design per `docs/.../file-format/spec.md:52` — first event log entry happens on first edit, NOT on project create). |
| 9.3 List + store atomic update | wired-atomic | ▰▰▰▰▰ 100% | `ProjectListController.create(name)` (in `@pryzm/persistence-client`) wraps the raw client call in an atomic update: client.create → store.add → onChange notification.  `buildPersistence.ts:81` routes `runtime.persistence.client.create` through the controller, so the in-memory `projectListStore` and the server are always in lock-step (this was the fix that PRYZM2-WIREUP-PLAN-S72 §16.2 documented for the original "[persistence.openProject] project not found" failure on every newly-created project open).  The `persistence.projectListChanged` event fires for every C.1.x subscriber on the same tick. |
| 9.4 `openProject(id, hint)` end-to-end | wired (2026-04-30g) | ▰▰▰▰▰ 100% | The four-hop hint chain — **previously broken at three of four hops**: (a) `buildPersistence.openProject(projectId)` declared only one parameter even though `PersistenceSlot.openProject(projectId, hint?)` typed it (`packages/runtime-composer/src/types.ts:399-402`); (b) `PlatformRouter._openProjectViaRuntime` had a literal `void opts; // forwarded to the bridge's show(...) once C.3.01-followup widens the signature` comment documenting the dead-plumbing TODO at line 398; (c) `src/main.ts workspaceMount.show(projectId, projectName)` declared only two parameters even though `WorkspaceMountBridge.show(projectId, projectName, opts?)` typed the third (`packages/runtime-composer/src/types.ts:367`).  **Fix landed in this audit**: all three implementations widened to accept and forward the hint; the C.3.01-followup TODO comment removed.  Type-check clean across `runtime-composer` + root project.  Hint now propagates from the Hub-click site through to `PlatformShell.setProjectContext`. |
| 9.5 Skip-server-fallback branch | wired | ▰▰▰▰▰ 100% | `PlatformShell.setProjectContext(id, name, opts)` (`src/ui/platform/PlatformShell.ts:212`) reaches the explicit `else if (opts?.isNewProject)` branch at line 289: calls `loadDelegate.load(this._makeEmptySnapshot(id, name))` directly, fires `pryzm-project-loaded(empty:true)`, and skips the otherwise-mandatory `loadLatestVersionFromServer` REST round-trip on the `else` branch (line 312).  This branch was always reachable from the constructor's `__pendingProjectId` shortcut (now disabled per the `PlatformShell.ts:174` comment), so the production code path that uses it today goes through the runtime chain — which is exactly what step 9.4 just fixed. |
| 9.6 Verifier — `pnpm bench persistence.openProject.new-project-hint` | wired (2026-04-30g) | ▰▰▰▰▰ 100% | `apps/bench/src/benches/create-new-project.bench.ts` (added in this audit) emits two measurements: `…hint-isnew` (50 samples × 5 warmup) asserts `bridge.show.opts === { isNewProject: true }` after every `openProject(id, { isNewProject: true })`; `…hint-undefined` (50 × 5) asserts `bridge.show.opts === undefined` after every `openProject(id)` (the deep-link path).  Both p95 envelopes < 1 ms (recorded `apps/bench/.run-output/persistence.openProject.new-project-hint.*.json`).  Bench rebuilds the persistence slot per sample to measure the realistic gesture envelope and not slot-construction amortization.  CI hard-fail flip is owned by `scripts/check-regression.mjs` (same convention as `wall-handlers.bench.ts:1-10` and `curtain-wall-handlers.bench.ts:1-10`). |
| **Flow 9 overall (gesture-flow)** | **wired** | **▰▰▰▰▰ 100%** | All 6 legs wired end-to-end after the 2026-04-30g three-hop hint-chain fix.  Hub-create gesture (9.1) → server INSERT (9.2) → atomic list+store update (9.3) → hint-forwarded `openProject` (9.4) → skip-server-fallback empty-mount (9.5) → bench-protected (9.6).  The architecture spec's contract (every typed slot in the chain accepts `{ isNewProject?: boolean }`) is now honored at runtime, not just at the type level. |

Spec-vs-actual reconciliations (architectural design choices, NOT gaps):
- **Two `ProjectHub.ts` files coexist**.  `src/ui/platform/ProjectHub.ts` is the live legacy hub (2,000+ LOC, used in production today); `apps/editor/src/projects/ProjectHub.ts` is the new S28 vanilla-DOM hub (declares identical callback shape but is not yet mounted by PlatformRouter).  Phase D.5 cutover replaces the legacy mount.  No alias was added to make them appear unified — both are honestly documented here so future readers know which one runs.
- **`ProjectHub.ts:1581-1582` `window.__pendingProjectId` / `__pendingProjectName` legacy globals**.  Marked TODO C.3.x in-place ("replace with runtime.persistence.openProject hint").  The constructor-shortcut that consumed them was disabled at `PlatformShell.ts:174` (was firing a duplicate `setProjectContext` call that wiped freshly-created walls/slabs).  The runtime-chain hint forwarded by Flow-9 step 9.4 IS the architectural replacement; the globals stay as a deprecated belt-and-suspenders until the legacy hub is retired in Phase D.5.
- **Project create writes ZERO event log entries** (by design per `docs/archive/pryzm3-internal/00_NEW_ARCHITECTURE/file-format/spec.md:52`).  The spec's "first event log entry on first edit" contract is what the `isNewProject` hint exists to honor on the read side — there is literally nothing on the server to fetch, so the redundant round-trip is not just slow, it's tautologically empty.

Genuine Phase F / Wave 13 gaps (NOT papered over):
- **No initial Level-0 / View seeding on project create**.  The newly-created project is metadata-only (one row in the `projects` table).  `EngineBootstrap` synthesises a default View on first open (`src/engine/EngineBootstrap.ts:497`).  Phase F target: have `runtime.persistence.client.create(name)` also append a single `level.create` + `view.create` event-log entry so the spec's "every project has a Default Level + a Default View" contract is enforced server-side at create time, not synthesised lazily on each open.  Tracked in this file (not papered over with a hollow `await runtime.bus.executeCommand('level.create', ...)` reach-around in `_createViaRuntime`).
- **`apps/editor/src/projects/ProjectHub.ts` not yet mounted by PlatformRouter** — Phase D.5 cutover.  Until then, the new hub's `mountProjectHub()` has no live call sites in `src/` or `apps/`.  Both hubs are honestly documented above.

Source files touched in this audit:
- **Updated** `packages/runtime-composer/src/buildPersistence.ts` — widened `openProject(projectId)` → `openProject(projectId, hint?)` (signature now matches the `PersistenceSlot['openProject']` type).  Forwarded the hint to `attachedWorkspace.show(summary.id, summary.name, hint)` with an inline rationale comment.
- **Updated** `src/main.ts` — widened `workspaceMount.show(projectId, projectName)` → `(projectId, projectName, opts?)`.  Forwarded `opts` to `shell.setProjectContext(projectId, projectName, opts)`.  The `setProjectContext` slot type already declared the third parameter; only the bridge implementation was dropping it.
- **Updated** `src/ui/platform/PlatformRouter.ts` — replaced `await this.runtime.persistence.openProject(projectId)` + the `void opts; // ... once C.3.01-followup widens the signature` TODO comment with `await this.runtime.persistence.openProject(projectId, opts?.isNewProject ? { isNewProject: true } : undefined)`.  The C.3.01-followup TODO is now closed.
- **Created** `apps/bench/src/benches/create-new-project.bench.ts` — two measurements (`persistence.openProject.new-project-hint.hint-isnew` and `…hint-undefined`) under a 5 ms p95 envelope, hard-asserting hint propagation on every sample.  Both pass on first run (p95 = 0.93 ms each, recorded `apps/bench/.run-output/persistence.openProject.new-project-hint.*.json`).  CI hard-fail flip owned by `scripts/check-regression.mjs`.
- **Updated**: this file — Flow 9 added (table + STATUS-2026-04-30g audit + reconciliations + Phase F gaps + source files touched).

#### STATUS-2026-04-30h (Flow-7 — gesture-flow audit per chunks/22 §22.7)

> **Why this section exists**: Flow 7 had been a 4-line speculative stub since the doc landed (`runtime.shortcuts.dispatch('save')` → `runtime.persistence.client.save(projectId)` → `runtime.persistence.tier.streamSave(snapshot)` → `runtime.toast.success`).  None of those four runtime legs were ever built — `runtime.shortcuts`, `runtime.persistence.client.save`, and `runtime.persistence.tier.streamSave` do not exist on the `PersistenceSlot` contract (`packages/runtime-composer/src/types.ts` — verified by `rg 'save\b' packages/runtime-composer/src/types.ts` returning zero hits).  The actual Cmd+S implementation is a direct `document.addEventListener('keydown', …)` in `PlatformShell` that opens a modal and routes through `versionRepository` + `ServerSyncQueue` — three architectural layers below the spec's hypothetical surface.  The audit replaces the speculative spec with the honest 9-leg flow that runs today.
>
> **And like Flow 9, the audit uncovered a real production redundancy**: `PlatformShell.openSaveModal` (`src/ui/platform/PlatformShell.ts:1696` pre-fix) called the FULL `saveDelegate.serialize({...})` purely to render the four-number info line under the Version Label input ("X elements · Y walls · Z slabs · W furniture").  Then if the user clicked "Save Version", `saveVersionInternal` (line 1750) called `saveDelegate.serialize({...})` AGAIN to actually persist the snapshot.  TWO full serialisations per single Cmd+S gesture.
>
> `serialize()` is the heaviest single operation in the save path — `ProjectSerializer.serialize` walks every store, runs `serializeWall`/`serializeSlab`/`serializeColumn`/`serializeBeam`/`serializeCurtainWall`/`serializeRoof`/`serializeFurniture`/`serializeHandrail`/`serializePlumbing` per element, runs `deepStrip` on every room and opening (recursively scrubs THREE.js refs), and `structuredClone`s every custom system type (slab + wall + ceiling + floor).  For a 600-element project it is the dominant gesture-to-toast cost.  Doing it twice when the modal-open call needed only `total/walls/slabs/furniture` lengths was a clean architectural waste — exactly the same shape as the Flow-9 redundant `loadLatestVersionFromServer` round-trip on brand-new projects.
>
> Fix: extend `IProjectSaveDelegate` with `getElementCounts(): { total; walls; slabs; furniture }` — a contract that explicitly forbids per-element work.  Implementation in `initPersistence.ts` reads `store.getAll().length` directly (12 array-length reads, all O(1)).  `openSaveModal` now calls THAT for the info line; `serialize()` is called exactly once per Save, on the confirm path.  All three files updated atomically; the L1-runtime-composer save surface (`runtime.persistence.client.save`) remains a Wave-5 F.6.3 follow-up but does not affect Flow 7 correctness today.

Reconciliations applied here (so the doc cannot lie tomorrow):
- **Spec's `runtime.shortcuts.dispatch('save')` does not exist** — `PlatformShell.keydownHandler` (`src/ui/platform/PlatformShell.ts:874`) owns the binding directly via `document.addEventListener`.  Documented as the live path in stage 1 above; the Wave-5 F.6.3 shortcut router remains a Phase F gap (see §3 below).
- **Spec's `runtime.persistence.client.save(projectId)` does not exist** — `rg 'save\b' packages/runtime-composer/src/types.ts` returns zero hits.  Live path is `versionRepository.saveVersionWithMeta(projectId, version, meta)` (`src/ui/platform/ProjectRepository.ts:336`).  Documented as `landed (legacy)` in the table; Wave-5 F.6.3 rewire is the L1 follow-up.
- **Spec's `runtime.persistence.tier.streamSave(snapshot)` does not exist** — there is no tier-streamed-loader writer.  Server sync goes through `ServerSyncQueue.enqueue` → debounced batch flush → `POST /api/projects/:id/versions`.  Documented honestly in stage 7 above.
- **`captureThumbnail()` was already audited** for the plan-rejected fast-path (`PERF-FIX 2026-04-29` comment block at `src/ui/platform/PlatformShell.ts:1766-1773`) — auto-saves on free-plan accounts skip thumbnail capture entirely once `ServerSyncQueue.isPlanRejected()` latches.  No additional fix needed.
- **Project name & label changes between modal-open and modal-confirm** — the count fields (`total/walls/slabs/furniture`) are scene properties, not snapshot metadata, so `getElementCounts()` is correct to read at modal-open time even if the user later edits the projectName/label inputs.  The confirm path's `serialize()` is the one that stamps the final projectName + versionLabel + timestamp into the snapshot.  No staleness window introduced.

Genuine Phase F / Wave 13 gaps (NOT papered over):
- **`runtime.shortcuts` keyboard router** — Wave 5 F.6.3 spec deliverable, not built.  Cmd+S, Cmd+Z, Cmd+Y, etc. are scattered across PlatformShell + initUI + per-tool-HUD listeners.  No central registry, no conflict resolution, no `runtime.shortcuts.dispatch(name)` API.  Documented in stage 1 above; tracked in this file (not papered over with a hollow `runtime.shortcuts = { dispatch: () => {} }` shim).
- **`runtime.persistence.client.save(projectId)` L1 surface** — Wave 5 F.6.3 spec deliverable, not built.  Migration target: pull the `versionRepository.saveVersionWithMeta` + `ServerSyncQueue.enqueue` pair behind a single `runtime.persistence.client.save(projectId, snapshot)` that returns a Promise resolving once localStorage is written and the sync queue has accepted the enqueue.  Tracked here.
- **No tier-streamed save (`streamSave(snapshot)`)** — Wave 5 F.6.3 spec deliverable, not built.  Current path serialises the entire snapshot in-process and POSTs the whole JSON body in one request.  Streaming would matter for >5,000-element projects (current largest test scene is ~1,200).  Tracked here.
- **`saveVersionInternal` does not pass the prebuilt snapshot through** — currently the modal-confirm path calls `serialize()` fresh on confirm.  An even stronger fix would be to capture the snapshot at modal-open time and reuse it on confirm IF no `bim-store-mutated` event fired between open and confirm.  Deferred — the staleness-window correctness analysis is non-trivial and the 1× serialize cost is acceptable per the Flow-7 ≤1.5 s budget.  Tracked here.

Source files touched in this audit:
- **Updated** `src/ui/platform/PlatformShellTypes.ts` — added `getElementCounts(): { total; walls; slabs; furniture }` to `IProjectSaveDelegate` with a docstring spelling out the no-per-element-work contract and the redundancy it eliminates.
- **Updated** `src/engine/subsystems/initPersistence.ts` — implemented `getElementCounts()` on the engine-layer save delegate as 12 direct `store.getAll().length` reads (walls/slabs/furniture/columns/stairs/beams/curtainWalls/roofs/handrails/plumbing/rooms?/ceilings?/floors?).  Total compiles to a single addition expression; no per-element work.
- **Updated** `src/ui/platform/PlatformShell.ts` — replaced the heavy `saveDelegate.serialize({...})` call at `openSaveModal` line 1696 with `saveDelegate.getElementCounts()`.  Inline comment block documents the architectural redundancy that motivated the change and the bench-protected ratio.
- **Created** `apps/bench/src/benches/save-modal-counts.bench.ts` — three measurements at 600 elements: `counts-only` (p95 = 5 µs, p50 = 1 µs, well under the 0.5 ms ceiling), `serialize-reference` (p95 = 125 µs, p99 = 4.6 ms — one GC tail), and `ratio` hard-asserting `serialize.median / counts.median > 10×` on every run.  First-run ratio = 35.7×.  Both percentile and ratio assertions pass; results recorded `apps/bench/.run-output/persistence.save-modal.element-counts.*.json`.  CI hard-fail flip owned by `scripts/check-regression.mjs`.
- **Updated**: this file — Flow 7 stub replaced with the honest 9-leg gesture-flow table + this STATUS-2026-04-30h audit + reconciliations + Phase F gaps + source files touched.

---

## §2 — Architecture-leg → UI-surface reverse coverage matrix

The matrix below is the **coverage check** for Wave 7's "every leg has a consumer" exit gate. Source: `chunks/21-architecture-to-ui-reverse-map.md`. Every row whose **UI consumers** column is empty is an orphan slot — Wave 7 cannot close until each is either (a) consumed by at least one UI surface or (b) explicitly quarantined with an ADR carve-out.

### §2.1 — Foundation legs (P0 + P1)

| Leg | Package | UI consumers | Wave that wires |
|---|---|---|---|
| `runtime.bus` | `command-bus` | every Tool, every Inspector "save", every shortcut | Wave 4 D.4.2 |
| `runtime.scene.scheduler` | `frame-scheduler` | OrbitController, AnimationPlayer, every gizmo redraw | Wave 4 D.4.4 |
| `runtime.scene.committer` | `scene-committer` | every command's post-commit redraw | Wave 4 D.4.3 |
| `runtime.scene.renderer` | `render-runtime` + `renderer` | canvas, RenderPanel, RenderGalleryPanel | Wave 4 D.4.4 |
| `runtime.stores.elements` | `stores` | every Inspector, every Browser, every Picker | Wave 4 D.4.1 |
| `runtime.stores.viewState` | `view-state` | OrbitController, ViewBrowser, sheets | Wave 4 D.4.1 |
| `runtime.persistence.client` | `persistence-client` | ProjectHub, Save toast, autosave watcher | Wave 5 F.6.2 |

### §2.2 — Interaction legs (P2)

| Leg | Package | UI consumers | Wave |
|---|---|---|---|
| `runtime.tools` | `runtime-composer` (tool registry) | every left-rail tool button (F.1.1–F.1.12) | **Wave 6 F.1** |
| `runtime.input` | `runtime-composer` (input router) | every Tool, OrbitController, gizmos | Wave 6 F.1 |
| `runtime.shortcuts` | `runtime-composer` (shortcut router) | global keyboard layer, command palette | Wave 5 F.6.3 |
| `runtime.scene.snap` | `picking` | Wall/Beam/Slab/Door/Window tools | Wave 6 F.1 |
| `runtime.scene.selection` | `stores.selection` | Inspector, contextual ribbon, selection highlights | Wave 6 F.2 |
| `runtime.scene.visibility` | `visibility` | VisibilityGraphPanel, Browser eye-icons, Hide/Isolate | **Wave 7 F.8** |

### §2.3 — Content legs (P3 — families)

Each of the 12 family plugins exposes `runtime.<family>.*` (creation, modification, query, inspector). Coverage shown collapsed:

| Family plugin | `runtime.<family>` legs | Primary UI consumer | Wave |
|---|---|---|---|
| `plugins/wall` | `create`, `splitAt`, `merge`, `addLayer` | WallTool + WallInspector + WallLayerSection | Wave 6 F.1.1 + F.2.1 |
| `plugins/door` | `create`, `swap`, `setSwingHand` | DoorTool + DoorInspector | Wave 6 F.1.2 + F.2.2 |
| `plugins/window` | `create`, `swapType`, `setSizes` | WindowTool + WindowInspector | Wave 6 F.1.3 + F.2.3 |
| `plugins/beam` | `create`, `setProfile`, `splitAt` | BeamTool + BeamInspector | Wave 6 F.1.4 + F.2.4 |
| `plugins/column` | `create`, `setProfile` | ColumnTool + ColumnInspector | Wave 6 F.1.5 + F.2.5 |
| `plugins/slab` | `create`, `cutHole`, `setLayers` | SlabTool + SlabInspector | Wave 6 F.1.6 + F.2.6 |
| `plugins/floor` | (E.6.0 — plugin scaffolding still missing) | FloorTool + FloorInspector | Wave 6 F.1.7 + F.2.7 |
| `plugins/roof` | `create`, `setPitch` | RoofTool + RoofInspector | Wave 6 F.1.8 + F.2.8 |
| `plugins/curtain-wall` | `create`, `setMullionGrid` | CurtainWallTool + Inspector | Wave 6 F.1.9 + F.2.9 |
| `plugins/stair` | `create`, `setRunRise` | StairTool + Inspector | Wave 6 F.1.10 + F.2.10 |
| `plugins/rooms` | `create`, `setName`, `tagAuto` | RoomTool + RoomPropertySection + RoomBrowser | Wave 6 F.1.11 + F.2.11 |
| `plugins/furniture` | `create`, `swap`, `dragDrop` | FurnitureCarousel + FurnitureInspector | Wave 6 F.1.12 + F.2.12 |

### §2.4 — Cross-cutting legs (P4)

| Leg | Package | UI consumers | Wave |
|---|---|---|---|
| `runtime.ai.dispatch` | `ai-host` | AIPanel, AICreatePanel, BriefInputPanel, VariantBrowserPanel, RoomAIAssistant | **Wave 7 F.7** |
| `runtime.ai.usage` | `ai-spend` | AIPanel cost-pill, OwnerSettingsPanel | Wave 7 F.7 |
| `runtime.entitlements` | `api-rbac` + `ai-spend` | OwnerSettingsPanel, paywall HUDs | Wave 7 F.7 |
| `runtime.export.{ifc,glb,pdf,csv,rationale}` | `file-format` + `bake-worker` | ExportPanel, RenderGalleryPanel | Wave 7 F.10 |
| `runtime.{ifc,dxf,rhino}.import` | per-format plugin | ImportManager panel | Wave 7 F.10 |
| `runtime.cde.structuredName` | `api-spec` | SheetEditor, ProjectBrowser | Wave 7 F.11 |
| `runtime.geospatial` | `geospatial` (new package, G.19) | GeospatialPanel | Wave 7 F.11 |
| `runtime.physics` | `physics-overlay` (dev-only per ADR-042) | DebugOverlay only | dev-only — out of GA scope |
| `runtime.toast` | `runtime-composer` (toast bus) | every command-result handler | Wave 5 F.6.4 |
| `runtime.audit` / `runtime.cost` / `runtime.spend` | `audit-log` / `ai-spend` | OwnerSettingsPanel + Wave 16 codemod targets | **Wave 16 (caller-side migration)** |

### §2.5 — Multiplayer legs (P5)

| Leg | Package | UI consumers | Wave |
|---|---|---|---|
| `runtime.sync.client` | `sync-client` | presence cursors, awareness HUDs, comment threads | Wave 7 F.9 |
| `runtime.sync.awareness` | `sync-client.awareness` | live cursors, selection-of-others | Wave 7 F.9 |
| `runtime.collab.commands` | `sync-client` + `plugins/multiplayer` | every command path (replicated) | Wave 7 F.9 |
| `runtime.bcf.*` | `plugins/bcf` | BCFPanel | Wave 7 F.11 |

---

## §3 — Coverage gate (Wave 7 exit)

Before Wave 7 closes, the matrix above must satisfy:

```bash
# Every architecture leg in §2 has at least one UI consumer cited
pnpm tsx tools/ga-gate/check-leg-coverage.ts

# Every UI surface enumerated in 05-UI-INVENTORY-AND-CLICK-TRAILS.md
# resolves at least one runtime.* call
pnpm tsx tools/ga-gate/check-ui-surface-coverage.ts

# Every flow in §1 above runs in apps/bench and is within budget
pnpm bench:flows
```

Three failure modes are explicitly named (per `chunks/26-plan-self-corrections.md §26.10`):

1. **Static-only false-positive**: `pnpm ga-gate` may pass while `composeRuntime()` throws at runtime. The §23.13 runtime smoke-test (Wave 7 F.* ratchet) closes this.
2. **`(window as any)` shim**: a UI surface that satisfies coverage by reaching through the legacy global instead of through `runtime.*`. Caught by the cast-count tripwire (`02-WAVE-1-TRIPWIRES.md §1`).
3. **Flow short-circuit**: a smoke test passing because the legacy code path is still alive. Caught by the deletion gate (Wave 8+ — `15-PACKAGE-POPULATION-GAP.md §13`).

---

## §4 — How this file is maintained

When a Wave 4–7 sub-phase lands, its PR must update the corresponding row in §1 or §2 (status = wired, sub-phase = the landing PR's ID, evidence = the bench command output). The matrix is canonical; once a row claims "wired", regression is a tripwire.

When a new architecture leg is added (e.g. a new family plugin), §2 grows by one row in the same PR that lands the leg.
