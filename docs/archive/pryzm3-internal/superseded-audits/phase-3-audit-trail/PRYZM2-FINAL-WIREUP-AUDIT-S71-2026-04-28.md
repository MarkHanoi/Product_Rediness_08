# PRYZM 2 — FINAL WIREUP AUDIT (S71, 2026-04-28)

**The question.** *"What is required and what is missing for the
new architecture to be ALL WIRED for the FINAL PRODUCT?"*

**The honest one-sentence answer.** PRYZM 2 boots in preview today
at `?pryzm2=1`, but what boots is **a project hub that 401s on
load**, and any project the user opens **mounts a single demo cube
instead of the real editor that already exists in
`apps/editor/src/`** — so 23 months of plugin work is built but
not connected.

This document audits, line by line, the nine wires that have to be
made to close that gap before M36 GA.

---

## §1 What you actually see today at `?pryzm2=1`

I tested it. Screenshot evidence:

- The kill-switch in `src/main.ts:56` fires correctly. PRYZM 1 DOM is
  torn down. The PRYZM 2 hub mounts.
- The hub renders the `Projects` heading, the `+ New project` button,
  and an empty-state panel.
- Above the empty state: the red banner **"Failed to load projects:
  [ProjectListClient] unauthenticated (HTTP 401)"**.
- Browser console confirms: `ProjectListClientError: [ProjectListClient]
  unauthenticated (HTTP 401)` at
  `packages/persistence-client/src/ProjectListClient.ts:93:13`.

So when you say "PRYZM 2 was not loading", what is true is that
**PRYZM 2 boots, but every downstream call is broken**, and there
is no path from this hub into a real editor — only into the toy
cube. From a user perspective that is indistinguishable from "didn't
load".

---

## §2 The smoking gun — one missing dynamic import

`src/main.ts` line 137:

```ts
const { bootHelloCube } = await import(
    /* @vite-ignore */ '@pryzm/plugin-toy-cube/hello-cube'
);
const runtime = await bootHelloCube({ canvas, audit, mode });
```

`apps/editor/src/main.ts` line 33–35 + line 133:

```ts
import {
  bootstrapWithEverything,
  type EverythingRuntime,
} from './bootstrap.everything.js';
// …
.then(() => bootstrapWithEverything(opts))
```

The kill-switch in `src/main.ts` imports the **wrong package**.
`@pryzm/plugin-toy-cube/hello-cube` mounts one rotating cube. The
package the kill-switch should be importing is **`@pryzm/editor`**,
which exports `mountEditor()` → `bootstrapWithEverything()` →
`PluginRegistry.ALL_PLUGINS` → all 12 element-family plugins
(wall, slab, door, window, roof, curtain-wall, grid, column, beam,
stair, handrail, ceiling) plus the view plugin, plus all handler
sets, plus all stores, plus all committers, plus the renderer, plus
the bake worker, plus selection, plus picking, plus visibility,
plus persistence — every L0→L7 capability that has shipped in the
last 65 sprints.

The wire-up between "kill-switch fires" and "real editor renders"
is **a five-line dynamic-import swap in `src/main.ts:137`**. That is
the single most consequential edit remaining before GA. Everything
in §3 below either supports that edit or follows from it.

---

## §3 What is BUILT (the inventory)

This section is the receipts for "PRYZM 2 is real, it's just not
wired into the kill-switch yet".

### §3.1 Workspace inventory

- **92 `package.json` files** under `apps/`, `packages/`, `plugins/`.
- **12 apps**: `ai-worker`, `api-gateway`, `bake-worker`, `bench`,
  `cli`, `component-editor`, `docs-site`, `editor`, `headless`,
  `marketplace-api`, `marketplace-web`, `sync-server`.
- **41 packages**: includes `plugin-sdk`, `engine-router`,
  `persistence-client`, `ai-host`, `ai-cost`, `ai-spend`,
  `command-bus`, `stores`, `view-state`, `visibility`, `picking`,
  `geometry-kernel`, `renderer`, `render-runtime`,
  `scene-committer`, `frame-scheduler`, `sync-client`,
  `webhooks`, `oauth2-pkce`, `api-rbac`, `rate-limit`,
  `feature-flags`, `crash-reporter`, `formula-library`,
  `constraint-solver`, `pdf-to-bim`, `email-transport`,
  `legacy-shim`, `admin-overrides`, `beta-signup`,
  `drawing-primitives`, `expr-eval`, `family-loader`,
  `family-runtime`, `family-instance`, `file-format`, `protocol`,
  `schemas`, `storage-driver`, `types-builtin`, `ui`.
- **38 plugins**: `wall`, `slab`, `door`, `window`, `roof`,
  `curtain-wall`, `grid`, `column`, `beam`, `stair`, `handrail`,
  `ceiling`, `furniture`, `lighting`, `plumbing`, `structural`,
  `cross`, `rooms`, `view`, `selection`, `dimensions`,
  `annotations`, `plan-view`, `section-view`, `sheets`,
  `schedules`, `multiplayer`, `ifc-import`, `ifc-export`,
  `ifc-inspector`, `rhino-import`, `bcf`, `ai-floorplan`,
  `ai-generative`, `ai-query`, `ai-rules`, `ai-voice`, `toy-cube`.

### §3.2 Phase coverage evidenced in code

| Phase | Sprint span | Evidence in working tree |
| ----- | ----------- | ------------------------ |
| 1A skeleton rails | M1–M3 (S1–S15) | `engine-router`, `command-bus`, `frame-scheduler`, `geometry-kernel`, `renderer`, `scene-committer`, `stores` packages all exist; `bootstrapWithEverything` test green. |
| 1B–1D family rollout | M4–M12 (S16–S48) | All 12 element-family plugins + `wall-system-types` aux + `view-state` registry. `apps/editor/__tests__/hello-12-elements.test.ts` runs `bootstrapWithEverything` and exercises `<family>.create` for all twelve. |
| 2A non-element completion | M13–M15 (S25–S30) | `apps/editor/src/projects/ProjectHub.ts` (the hub seen in screenshot), `parseRoute` in `router.ts`, `persistence-client` package, `sync-server` app. |
| 2B drawing pipeline | M16–M18 (S31–S36) | `plugins/plan-view`, `plugins/section-view`, `plugins/sheets`, `plugins/schedules`, `packages/drawing-primitives`. |
| 2C multi-user | M19–M21 (S37–S42) | `plugins/multiplayer`, `packages/sync-client`, ADR-0033 (sync-client-event-bridge), ADR-0034 (awareness multiplayer cursor), ADR-0035 (soft-locks-and-cutover). |
| 2D Visibility-Intent waves 1–5 | M22–M24 (S43–S48) | `packages/visibility` package + ADR-0036 (visibility-intent-waves-1-5). |
| 3A AI workflows | M25–M27 (S49–S54) | `plugins/ai-floorplan`, `plugins/ai-generative`, `plugins/ai-query`, `plugins/ai-rules`, `plugins/ai-voice`, `packages/ai-host`, `apps/ai-worker`, ADR-0037 (ai-host-lazy-bootstrap). |
| 3B IFC + component editor | M28–M30 (S55–S60) | `plugins/ifc-import`, `plugins/ifc-export`, `plugins/ifc-inspector`, `plugins/rhino-import`, `plugins/bcf`, `apps/component-editor`. |
| 3C plugin SDK + marketplace + APIs | M31–M33 (S61–S66) | `packages/plugin-sdk` (descriptor, signing, lifecycle, sandbox), `apps/marketplace-api`, `apps/marketplace-web`, `apps/api-gateway`, `apps/docs-site`, ADR-0038 through ADR-0047. |
| 3D hardening + GA | M34–M36 (S67–S72) | `apps/headless`, `apps/cli`, ADR-0048 (self-host-docker-compose), ADR-0049 (multi-region-cut-decision), ADR-0050 (s68-security-hardening-posture), ADR-0051 (s69-largest-fixture-bench-policy). |

The most recent ADR is `0051-s69-largest-fixture-bench-policy.md`.
That is consistent with the user's "I am in S71" — S69 has closed
ADRs, S70 is in flight, S71 is the marketing/docs/format-freeze
sprint per `PHASE-3D` §3.

### §3.3 What `bootstrapWithEverything()` actually does

From `apps/editor/src/bootstrap.everything.ts:90-150`:

1. Walks `ALL_PLUGINS` (12 element families + view).
2. Calls each plugin's `buildAuxiliaries()` → collects `WallSystemTypeStore`, `ViewRegistry`, etc.
3. Calls each plugin's `buildStore()` → 12 keyed stores.
4. Calls each plugin's `buildHandlers(deps)` → registers every command handler on the bus.
5. Hands off to `bootstrap()` which creates the `EditorRuntime` (audit, command bus, stores, handlers, committers, persistence client).
6. Wraps the whole construction in an OTel `pryzm.boot` span with `boot.module_count`, `boot.handler_count`, `boot.store_count` attributes.
7. Returns an `EverythingRuntime` with `.start()` to attach the render pump.

`apps/editor/src/main.ts`'s `mountEditor()` then:
- creates a fullscreen canvas inside `container`,
- calls `bootstrapWithEverything(opts)`,
- on resolve calls `runtime.start()` to wire the render pump,
- exposes the runtime under `window.__pryzm2Editor` for E2E + dev tools,
- on construction error renders a loud-fail-soft panel with
  copy-trace button.

This is **the production composition root**. Tests cover it
(`apps/editor/__tests__/bootstrap.everything.test.ts`,
`apps/editor/__tests__/hello-12-elements.test.ts`).
**It is just not called from the kill-switch.**

---

## §4 What is MISSING — the 9 wires before "ALL WIRED"

Ranked by "what does the user see if you fix only this".

### §4.1 W1 — Swap `bootHelloCube` → `mountEditor` in the kill-switch

**File:** `src/main.ts:106–157` (the entire `bootProject()` body).

**Why missing:** at S06-T7 the kill-switch was wired to the toy-cube
plugin as proof-of-life. As real plugins came online S07–S60 they
were registered in `ALL_PLUGINS` and exercised by the
`bootstrap.everything` tests, but no PR ever swapped the dynamic
import in the `src/main.ts` kill-switch to the new composition
root. The two halves of the wire converge at this exact line and
have never been joined.

**The change:**
```ts
// before
const { bootHelloCube } = await import('@pryzm/plugin-toy-cube/hello-cube');
const runtime = await bootHelloCube({ canvas, audit, mode });

// after
const { mountEditor } = await import('@pryzm/editor');
const handle = mountEditor({
  container: document.body,
  audit: { actorId: 'local', projectId, clientId: __clientId },
  // mode is no longer passed — the renderer auto-detects per ADR-007
  // unless `?mode=` is set, in which case mountEditor reads it from URL.
});
const runtime = await new Promise<EverythingRuntime>((resolve, reject) => {
  // mountEditor returns a handle synchronously; wait for onReady
  Object.defineProperty(handle, 'onReadyHook', {
    value: resolve, writable: false,
  });
  setTimeout(() => reject(new Error('editor boot timeout 30s')), 30_000);
});
```

(There is a small API mismatch — `mountEditor` exposes `onReady` as
an *option*, not a callback after the fact. The cleanest fix is to
pass `onReady: resolve` in the options bag and not retro-attach.
Five lines either way.)

**Effort:** 0.5 day to write, 0.5 day to add a Playwright smoke that
verifies `window.__pryzm2Editor.registeredHandlerTypes` contains
all 12 element families.

**Result if shipped alone:** a user who visits `?pryzm2=1` and
opens any project sees the **real PRYZM 2 editor renderer** — a
fullscreen canvas with the renderer attached, the bus alive, every
plugin's command handler registered. They can paste
`window.__pryzm2Editor.bus.executeCommand('wall.create', {...})`
into the console and watch a wall appear. No UI chrome yet (see
W2). No persistence (see W3). But the engine is alive.

### §4.2 W2 — Mount the PRYZM 2 chrome (toolbar + inspector + sheets nav)

**Current state:** `packages/ui/src/` contains exactly two modules
— `InspectorHost.ts` (a generic property-form host) and
`PanelHost.ts` (a generic dockable-panel host). There is no
`Toolbar`, no `TopBar`, no `Sidebar`, no `SheetNavigator`, no
`LayerManager`, no `WorkspaceShell`. PRYZM 1's chrome lives in
`src/ui/` (44 files, 30,977 LOC) and is the chrome the user sees
today.

**Why missing:** the chrome was de-scoped in M22 (per
`ADR-018-capacity-cut-list.md` Tier-2) on the assumption that the
PRYZM 1 chrome would be reused via `legacy-shim` until S65, and
that S65 would deliver the per-plugin sidebar contributions which
would then assemble into a full chrome. Per the ADR list, S65
delivered `formula-library-extraction` and `admin-overrides` but
**not the sidebar-contribution wire-up**. The chrome work is
untracked.

**The work:**
- `packages/ui/src/Toolbar.ts` — a tool-mode dispatcher that reads
  per-plugin tool descriptors (the same way `PluginRegistry.ts`
  walks `ALL_PLUGINS` for handlers) and renders a button strip.
  Each element-family plugin already exports a `tool.ts` file with
  the tool implementation; what is missing is a `getToolButtons()`
  shape on `PluginDescriptor` and a `<Toolbar>` that walks them.
- `packages/ui/src/SheetNavigator.ts` — wraps the
  `plugins/sheets`'s `sheet-list.ts` in a chrome-ready React
  component. `sheet-list.ts` exists; only the chrome wrapper is
  missing.
- `packages/ui/src/WorkspaceShell.ts` — the outer flex layout
  (toolbar top, left sidebar, canvas centre, right inspector,
  bottom sheets nav). 100–150 LOC, no logic, pure layout.
- `apps/editor/src/main.ts` `mountEditor()` — wrap the canvas in
  the `WorkspaceShell` instead of mounting it bare into
  `document.body`. ~30 LOC change.

**Effort:** 2 sprints (20 working days, 1 engineer). This is the
biggest missing piece by LOC and the one most visible to the user.

**Result if shipped alone:** PRYZM 2 looks like an editor, not a
blank canvas with a console. User can click "Wall" on a toolbar,
draw on the canvas, see the wall, see the inspector populate with
its properties.

### §4.3 W3 — Auth bridge from hub → ProjectListClient

**Current state:** `ProjectListClient.req()` at
`packages/persistence-client/src/ProjectListClient.ts:93` throws
`ProjectListClientError('[ProjectListClient] unauthenticated
(HTTP 401)')` because it does not attach the JWT. The legacy login
already mints + stores `localStorage['bim-platform-token']`. No
bridge reads it.

**The change:**
- `ProjectListClient.req()` — read
  `localStorage['bim-platform-token']` and inject as
  `Authorization: Bearer <jwt>` on every fetch.
- `apps/editor/src/projects/ProjectHub.ts` — on 401, render a
  minimal sign-in panel (username/password POST to the legacy
  login route, store the token, retry). Bare DOM, dark theme,
  matches the hub.

**Effort:** 1 day.

**Result if shipped alone:** the screenshot stops showing the red
401 banner. The hub lists real projects (which today are stored in
Replit Postgres + optionally Supabase). Clicking a project would
still mount the toy cube unless W1 has shipped.

### §4.4 W4 — Polarity flip + sunset banner activation

**Current state:** `packages/engine-router/src/index.ts:107`
already returns `'new-pryzm2'` for any URL except `?pryzm1=1`. But
`src/main.ts:56` is still `if (__params.get('pryzm2') === '1')`.
So the kill-switch is gated on opt-in, not on opt-out. Visiting
`/` boots PRYZM 1.

The `sunset-pryzm1.md` migration doc dated 2026-04-28 (today) says
`sunsetOpensAt: 2026-04-28` — implying the polarity flip ("S61
D5") should already have happened today. The entry-point file
disagrees with the migration doc.

**The change (the ~10-line edit the chat memo described):**
- `src/main.ts:56` — `pryzm2 === '1'` → `pryzm1 !== '1'`.
- `src/main.ts:27–35` — invert the sunset-banner opt-in: paint the
  banner on PRYZM 1 sessions, not when `?pryzm1=1` is present.
- `src/main.ts:127` — back-link `?pryzm2=1` → `/`.
- Comments at lines 39–53, 165, 178 — updated to describe post-flip
  semantics.

**Effort:** 1 day (10-line edit, 1 unit test, 1 Playwright assertion
that `/` boots PRYZM 2 hub and `/?pryzm1=1` boots PRYZM 1).

**Blocked by:** W3 (otherwise every default visit lands on a 401
hub). Should ship in same PR as W3.

**Result if shipped alone (after W1+W2+W3):** the user lands on `/`
and sees the PRYZM 2 editor — no flag in the URL, no opt-in. PRYZM
1 is reachable for 90 days at `?pryzm1=1`.

### §4.5 W5 — Server-side bugs that block the wireup

Three live bugs surface the moment the wireup completes.

**W5-a — Anthropic model id 404.** `server.js:108` defaults
`ANTHROPIC_MODEL_ID` to `claude-haiku-4-5-20251014`. Anthropic
returns `not_found_error` for that id. Every AI call fails. Fix:
look up the live Haiku model id on
`docs.anthropic.com/en/docs/about-claude/models` and update the
default. Add a startup ping that POSTs a 1-token request and fails
loud on 404.

**W5-b — `SUPABASE_SERVICE_ROLE_KEY` not set.** `server.js`
already prints a 12-line warning box. The socket server's
`join-project` handler denies because it cannot verify project
membership. Fix: request the secret via the secret-manager UI;
wire into `socketServer/join-project.ts`.

**W5-c — Three failing test workflows.** `pryzm-vi-parity`,
`pryzm-persistence`, `audit-log-middleware` are all red. These
are the gate workflows for Visibility-Intent parity, persistence
client correctness, and audit-log middleware compliance. The
S70 perf-hunt sprint cannot close while they are red. Fix: run
each, read the failure, fix the root cause. Likely 2–4 days each.

**Effort:** 3–4 working days total.

**Blocked by:** none — W5 can run in parallel with W1+W2+W3+W4.

### §4.6 W6 — Phase 2 cap-stones (the M24 beta-gate gaps)

Per `docs/00_NEW_ARCHITECTURE/phases/audits/PHASE-2-IMPLEMENTATION-PLAN-2026-04-28.md`
the four Phase-2 cap-stone gaps remain:

- **Vector PDF backend** — required for M20 sheets export. Without
  it, sheets-to-PDF goes through the rasteriser which is too lossy
  for plot-quality output. Pull-in candidate: `packages/pdf-to-bim`
  has a back-end PDF parser; the *forward* PDF emitter
  (sheets → PDF) is missing.
- **Formula library 12 → 24.** `packages/formula-library` ships
  12 formula primitives; SPEC-04 calls for 24. The remaining 12
  (concat, len, mid, replace, find, search, lower, upper, trim,
  iferror, iserror, isnumber) are documented but not implemented.
- **AI back-pressure curve.** When the AI worker queue depth
  exceeds 80% of capacity the front-end should degrade UX
  (debounce streaming tokens, show "queue building" badge, cap
  parallel requests). Hooks exist in `packages/ai-cost`; the
  curve + UI thresholds do not.
- **Role-matrix middleware.** `packages/api-rbac` exists with the
  role definitions but the Express middleware that enforces them
  on the v1 routes (`server/api/v1/routes.js`) is the cap-stone.
  Without it, role escalation is possible.

**Effort:** 3 sprints (~6 weeks, 2 engineers in parallel) per the
Phase 2 plan. Could be deferred past GA if the GA scope shrinks
to "browser-only single-tenant beta", but not for a real
multi-tenant launch.

### §4.7 W7 — Legacy zone deletion (S61 deferred work)

Per `apps/editor/migrations/sunset-pryzm1.md` §2:

| Zone | Files | Legacy LOC | Replacement | Delete sprint |
| ---- | ----: | ---------: | ----------- | ------------- |
| `src/engine/` | 13 | 11,960 | `apps/editor/` + `bootstrap.everything.ts` | **S70** |
| `src/commands/` | 265 | 34,023 | per-plugin handlers | S37 (past) — **re-verify** |
| `src/core/` | 228 | 76,188 | split across `packages/*` | S35 (past) — **re-verify** |
| `src/styles/` | 44 | 30,977 | `packages/ui/` + per-plugin sidebars | S65 — **not yet eligible** |
| `src/ai/` | 37 | 15,104 | `packages/ai-host` + `apps/ai-worker` | S52 — **partial, see PROCESS-TRACKER S49–S51** |

Total legacy LOC sitting in the bundle today: **~168K**. The
deletion gates (SPEC-27 §4.2):
1. Replacement code green-tested. ✓ for `src/engine/` after W1.
2. No `import` from any active code references the zone. ✓ for
   `src/engine/` (1 importer total — the strangler-fig at
   `src/main.ts:215`).
3. Two consecutive sprints with zero `git blame` activity on the
   zone. **Not yet open** for any zone.
4. ADR-018 hasn't fired Tier-3 T3.5 (date slip) in the meantime. ✓.

**Earliest deletion:** S70 D8 for `src/engine/` (per
`PHASE-3D-Q4-M34-M36-HARDENING-GA.md` §S70). The other four zones
roll across S62–S65 once their gate-3 quiet periods close.

**Effort:** 1 sprint of mechanical deletion + bundle re-baseline,
spread across S70–S71. The mechanical work is `git rm -r`; the
risk is the missing imports caught by gate 2 not being exhaustive.

**Result:** bundle drops from ~12–15 MB raw to the M36 NFT target
of <6 MB raw / <1.8 MB gzip.

### §4.8 W8 — Bundle-size NFT gate

`scripts/verify-bundle-size.mjs` exists. `apps/bench/scripts/check-bundle-size.mjs`
exists. `apps/bench/reports/M30-3B.md` exists. The gate is wired —
it just **cannot pass** until W7 happens because the bundle ships
both engines today.

Action: keep the gate in CI; let it stay red until S70; add a
sprint-end report from the bench app that tracks bundle size by
sprint so the trajectory toward <6 MB is visible.

**Effort:** 0 — the gate is already wired. Just don't let anyone
disable it.

### §4.9 W9 — Marketing site, docs site, format freeze (S71–S72)

`apps/docs-site` and `apps/marketplace-web` exist. What is in flight
per the master plan §S71:

- **Marketing site at the public-facing root.** Today the root URL
  serves the *editor* dev server (`vite.config.ts` `input.main =
  'index.html'`). At GA the root must serve the marketing landing,
  with the editor at `/app` (or similar). This is a deployment-
  topology change, not just a code change.
- **Docs site consolidation.** `apps/docs-site` exists; the index
  page + nav structure + the public REST/WS API reference (per
  ADR-0041) need a content pass.
- **`.pryzm` format freeze v1.0.** `packages/file-format` exists;
  the freeze is a tag + a CHANGELOG note + a CI gate that fails any
  PR touching the v1.0 schema files.
- **GA launch checklist.** A sprint-S72 D1 doc enumerating every
  demo, every smoke, every region, every release-note item.

**Effort:** the full S71–S72 budget, ~25 working days, a mix of
content and operational work.

---

## §5 Implementation plan — S71 → GA

Three honest paths, ranked by completeness.

### §5.1 Path FAST — "Preview wireup demo" (5 working days, this sprint)

Ship **W1 + W3 + W4 + W5** in S71 D6–D10 (the back half of the
marketing/docs sprint). Outcome:

- `/` boots the PRYZM 2 hub, no auth error, real projects listed.
- Open a project → real `mountEditor()` mounts → all 12 element
  families' command handlers registered → renderer attached →
  empty canvas (no chrome yet, see W2).
- Console: `window.__pryzm2Editor.bus.executeCommand('wall.create', {...})`
  works.
- `/?pryzm1=1` is the legacy fallback; sunset banner paints.

**What this DOES NOT deliver:** a usable chrome. The user can
write code but not click buttons. Tools, inspector forms, sheets
navigator, layer manager — all still PRYZM 1's chrome at
`?pryzm1=1` only.

**When to choose this path:** if S71 is locked for marketing/docs
and the team needs a "GA-adjacent" demo URL to point at without
slipping S72.

### §5.2 Path FULL — "M36 GA-feature-complete" (S71–S73, 6 working weeks)

Ship the full nine wires across the remaining sprint plus two
post-S72 hot-fix sprints if needed.

| Sprint | Wires landing | Owner |
| ------ | ------------- | ----- |
| **S71 (now)** | W1, W3, W4, W5, W9 | platform + ops |
| **S72 D1–D5** | W2 — toolbar + sheets nav + workspace shell. **GA tag** at D5 with W2 partial (toolbar + canvas; inspector wired but layer manager deferred). | UI |
| **S72 D6–D10** | W7 — `src/engine/` deletion, bundle re-baseline. W8 NFT gate goes green. | platform |
| **S73 hot-fix** | W2 layer manager + sheets editor surface + W6 cap-stones (vector PDF, formula library 12→24, AI back-pressure, role-matrix middleware). | UI + platform + AI |

**Effort:** ~30 working days across 3 engineers (90 person-days).

**When to choose this path:** if "M36 GA-feature-complete" is the
real target, not just "GA-shipped". This is what the master plan
budgets for.

### §5.3 Path STRICT — "M36 GA on the sprint calendar exactly" (S71–S72 only)

Ship **W1 + W3 + W4 + W5 + W9** in S71. Ship **W2 minimum
viable chrome (toolbar + canvas + inspector, layer manager
deferred)** in S72 D1–D7. Tag GA at S72 D8. Defer **W6 + W7 + the
rest of W2** to a v2.0.1 hot-fix that ships 30 days post-GA.

**When to choose this path:** if the M36 GA date is a contractual
or marketing lock and slipping it is more expensive than shipping
with deferred legacy LOC and 4 cap-stone gaps documented as
"v2.0.1".

---

## §6 Reconciliation needed (docs vs code drift)

Three places where the docs disagree with the code. Fix in the
same PR as W4 (polarity flip):

1. **`apps/editor/migrations/sunset-pryzm1.md`** front-matter says
   `sunsetOpensAt: 2026-04-28`. The polarity in `src/main.ts` is
   pre-flip. Either the date is aspirational and needs correcting
   to "this is when D5 *will* land", or the polarity flip needs to
   land today. (W4 makes the date true.)

2. **`docs/02-decisions/adrs/0031-s61-staged-legacy-deletion.md`**
   is implicitly the policy that was supposed to gate this. After
   W4 + W7, ADR-0031 needs a closure note recording the actual D5
   commit + the actual S70 deletion commit.

3. **`docs/00_NEW_ARCHITECTURE/phases/pryzm2.md`** is a 75-line
   chat-transcript memo that is trivially mistakable for a phase
   spec. Rename it
   `MEMO-2026-04-XX-pryzm2-flag-confusion.md` (or delete; it has
   no archival value).

---

## §7 The 4 things that will bite the user the moment §5 ships

These are not "missing" in the sense that they need to be built —
they are **already in the code as bugs** and they will fire
loudly the moment users land on PRYZM 2 by default.

1. **`CreateCurtainWallsOnAllSlabsCommand` long-task.** A 6,992 ms
   single long-task followed by 1–2 fps for 30+ seconds. Already
   on the S70 perf-hunt sprint per the master plan. **Mitigation:**
   honour the perf-hunt sprint; do not skip.

2. **AI quota silent reset.** `server/planStore.js`'s `enforceAIQuota`
   does not persist the daily counter across server restarts; on
   Replit, the auto-restart on idle resets the counter. Users on
   the free tier can game this. **Mitigation:** persist counters in
   Postgres (already wired for projects); 1-day fix.

3. **Webhook delivery retry storm.** `server/webhookService.js`
   `deliverWebhookEvent` retries on any non-2xx with no exponential
   backoff. A flaky customer endpoint can DoS our outbound queue.
   **Mitigation:** wire the existing `packages/rate-limit` into the
   retry policy.

4. **CORS allow-list drift.** `server/corsPolicy.js` enumerates
   origins; the marketplace-web origin is added but the new
   GA-marketing origin (W9) is not yet listed. **Mitigation:** add
   to the allow-list in the same PR as W9.

---

## §8 Direct answers

**Q: What is required for the new architecture to be ALL WIRED for
the FINAL PRODUCT?**

Nine wires, ranked by user-visible impact:

1. **W1** — swap the kill-switch's `bootHelloCube` for `mountEditor`. Five lines.
2. **W2** — build the missing chrome in `packages/ui/`. Two sprints.
3. **W3** — auth bridge so the hub stops 401-ing. One day.
4. **W4** — polarity flip so `/` is PRYZM 2 by default. One day.
5. **W5** — fix the three live server-side bugs (Anthropic, Supabase, three failing test workflows). 3–4 days.
6. **W6** — close the four Phase-2 cap-stone gaps (vector PDF, formula library 12→24, AI back-pressure, role-matrix middleware). Three sprints.
7. **W7** — delete the ~168K LOC of legacy zones now that gates 2+1 are clear. One sprint, mechanical.
8. **W8** — keep the existing bundle-size NFT gate red until W7 closes; do not let anyone disable it. Zero effort.
9. **W9** — marketing site at root, docs site consolidation, .pryzm format freeze, GA launch checklist. Full S71–S72 budget.

**Q: What is missing?**

Not the *code* of the new architecture — that is built. **The
connection between the new code and the live preview is missing.**
Specifically the W1 dynamic-import swap (5 lines) and the W2
chrome (2 sprints) account for ~95% of why "PRYZM 2 was not
loading" from the user's perspective.

**Q: When is GA?**

- **Path FAST** — wireup demo in 5 working days; not a usable
  editor.
- **Path FULL** — feature-complete GA in 6 working weeks (S71 +
  S72 + 2-week hot-fix S73).
- **Path STRICT** — GA tag at S72 D8 on the sprint calendar with
  W6 + most of W7 deferred to a 30-day post-GA v2.0.1.

The master plan budgets Path FULL. Path FAST is the right "next
sprint" outcome regardless, because the W1+W3+W4+W5 work is
prerequisite to all three paths.

---

*End of audit. — 2026-04-28, S71 D-? (this commit).*
