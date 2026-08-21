# Plugin, SDK & External-API Readiness Register

> **Lane AUD-5 · measured 2026-08-21 · HEAD `5cb4d8a4`.**
> Scope: **L5 `packages/plugin-sdk/`**, **L6 `plugins/*` (48)**, the plugin marketplace surface,
> `apps/api-gateway`, `apps/marketplace-api`, the eight unlayered backend packages, and the
> production `server.js` BFF.
>
> **Method.** Every number below was produced by running a gate or a scan on this tree today, not
> quoted from a document. Where a document and a measurement disagree, the measurement is recorded
> and the document is named as defective. Cells are **SOUND** (evidence) · **GAP/DEFECT**
> (`file:line` + consequence) · **UNMEASURED** (not traced — no inference offered).
>
> Governing contracts: **C07** (Plugin SDK & Marketplace), **C76** (Platform & API Surface,
> minted 2026-08-19), **C69** (API Verb Register).

---

## §0 — Verdict

**Is the API ready for externals? NO — and the blocking gaps are not in the API code, they are in
the fact that no external-facing surface is both reachable and defended.**

Three separate things are called "the PRYZM API", and each fails for a different reason:

| Surface | State | The one-line reason |
|---|---|---|
| `@pryzm/plugin-sdk` (the SDK a third party would compile against) | **NOT SHIPPABLE** | Declares `publishConfig.access: public` as `@pryzm/sdk@1.0.0`, but **all 12 of its `@pryzm/*` runtime dependencies are `private: true`** and every export resolves to a raw `.ts` path. `npm i @pryzm/sdk` cannot install. |
| `apps/api-gateway` + `apps/marketplace-api` (the versioned `/v1/` REST surface) | **NOT DEPLOYED, AND AUTH IS A HEADER SHIM** | Neither appears in any workflow file; the production Fly app runs `server.js`. Its shipped bootstrap trusts `X-Test-Scopes` / `X-Test-Roles` from the caller. |
| `server.js` (what is actually deployed) | **DEPLOYED, BUT THERE IS NO CREDENTIAL AN EXTERNAL DEVELOPER CAN OBTAIN** | 158 live routes. No API key, no PAT, no OAuth2 authorization server; `packages/oauth2-pkce/` has **zero consumers**. The only credential is a 30-day, full-account, **unscoped** JWT from `POST /api/auth/signin`. **0 of its 158 routes are documented; the 12 documented paths do not exist.** |

⭐ **The founder's question — "is the API ready for externals?" — has a shorter answer than the
9 axes suggest: there is no way for an external party to get a credential.** Everything else in this
document is downstream of that. `apps/docs-site/src/content/docs/api/auth.md:7-10` states OAuth2+PKCE
is *"its sole authentication mechanism"*; `server.js:446-447` states in a comment that the OAuth2
grant flow *"is explicitly deferred to S65."* **The docs describe an API that does not exist** (§5.5).

**The single most important finding is §1.3:** the ESLint rule that **C76 §1.1 and C07 §61 both name
as the enforcement of the SDK boundary is not enabled in `eslint.config.js`.** It is defined, it is
exported by the plugin, and it is switched on nowhere. This is the fourth recorded instance of the
L-809 defect shape in this repo — *a document describing enforcement that does not exist* — and it
landed inside a contract minted **two days ago**.

Ranked gaps that must close before the word "external" is usable — §7.

---

## §1 — The layer contract, re-measured

### §1.1 — `check-layer-boundaries.ts` is **RED**. `CLAUDE.md` says it is green.

```
$ npx tsx tools/ga-gate/check-layer-boundaries.ts
[check-layer-boundaries] workspace packages: 161 · classified: 147 · UNCLASSIFIED: 14
[check-layer-boundaries] upward imports between classified packages: 103
[check-layer-boundaries] L6 plugin imports bypassing the L5 SDK facade: 173
[check-layer-boundaries] banned third-party imports (OBC / express) outside their allowed homes: 117
...
[check-layer-boundaries] FAIL — 103 upward import(s), baseline 102.
[check-layer-boundaries] FAIL — 14 unclassified package(s), baseline 13.
[check-layer-boundaries] FAIL — 117 banned third-party import(s), baseline 113.
RC=3
```

| Arm | `CLAUDE.md` (measured 2026-08-16) | **Measured 2026-08-21** | State |
|---|---|---|---|
| upward imports | 102 / 102 | **103 / 102** | **BREACHED (+1)** |
| unclassified packages | 13 / 13 | **14 / 13** | **BREACHED (+1)** |
| SDK-facade bypasses | 171 / 182 | **173 / 182** | within (rose by 2) |
| banned third-party | *not mentioned in `CLAUDE.md`* | **117 / 113** | **BREACHED (+4)** |
| exit code | 0 | **3** | **RED** |

`CLAUDE.md`'s own instruction — *"Read the gate, not this line"* — was correct. Its 8-layer section
now understates three arms and omits the fourth arm entirely. The 14th unclassified package is
`@pryzm/geometry-handrail`; the eight unlayered **backend** packages `CLAUDE.md` flags as an open
question are all still in that list (`admin-overrides`, `ai-spend`, `api-rbac`, `api-spec`,
`beta-signup`, `email-transport`, `rate-limit`, `webhooks`).

### §1.2 — Worst bypassers, ranked by SOURCE plugin

The gate reports bypasses **by target package only**. Ranked by source (my scan, same file list,
same comment-stripping, 788 plugin source files; my total is **172** against the gate's **173** —
I disclose the one-import discrepancy rather than round it away):

| Rank | Plugin | Bypasses | Reaching past the SDK for |
|---:|---|---:|---|
| 1 | `annotations` | **68** | `renderer-three` 25 · `core-app-model` 24 · `scene-committer` 19 |
| 2 | `wall` | 13 | `command-registry` 10 · `renderer-three` 3 |
| 3 | `curtain-wall` | 7 | `renderer-three` 3 · `geometry-curtain-wall` 3 · `command-registry` 1 |
| 3 | `view` | 7 | `command-registry` 7 |
| 5 | `stair` | 6 | `renderer-three` 3 · `command-registry` 3 |
| 6 | `slab`, `window` | 5 each | `renderer-three` 3 · `command-registry` 2 |
| 8 | `ceiling`, `door`, `floor`, `furniture`, `plumbing`, `rooms`, `structural` | 4 each | |
| 15 | `beam`, `column`, `dimensions`, `grid`, `handrail`, `lighting`, `roof` | 3 each | `renderer-three` 3 |

`annotations` alone is **40 % of the whole bypass budget**. The remaining ~100 are one shape
repeated: `renderer-three` (3 per element plugin, 17 plugins) and `command-registry`.

### §1.3 — ⛔ DEFECT · The rule two contracts call a hard-fail gate **is not enabled**

**C76 §1.1** (`docs/02-decisions/contracts/C76-PLATFORM-AND-API-SURFACE.md:63-66`), verbatim:

> *"This is not advisory: the ESLint rule `pryzm/no-direct-pryzm-in-plugins` enforces it at error
> level (`packages/plugin-sdk/src/index.ts:124-128`)"*

**C07** (`docs/02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md:61`), verbatim:

> *"**CI gate**: `no-direct-pryzm-in-plugins` ESLint rule — hard-fail."*

**Measured.** `eslint.config.js` is the **only** ESLint config in the repo
(`git ls-files | grep -c 'eslint.config\|.eslintrc'` → 1). The complete set of `pryzm/*` rules it
enables is 16 entries at lines 431, 432, 433, 438, 531, 564, 578, 579, 599, 603, 611, 618, 619,
620, 634, 649. **`pryzm/no-direct-pryzm-in-plugins` is not among them.** Neither are its three
siblings `no-l7-direct-import`, `no-l7-boundary-violation`, `no-l7-allowlist-grow`.

**Proven empirically, not merely by grep.** `plugins/floor/src/store.ts:17` reads
`import type { FloorData } from '@pryzm/core-app-model';` — a textbook violation of the rule
(`ALLOWED_PKGS = new Set(['@pryzm/plugin-sdk'])`,
`packages/eslint-plugin-pryzm/src/rules/no-direct-pryzm-in-plugins.js:26-28`):

```
$ npx eslint plugins/floor/src/store.ts --format json
plugins/floor/src/store.ts | errors=0 warnings=0 | messages: []
ESLINT-RC=0
```

ESLint **opened the file, linted it, and reported nothing.**

Two further defects in the same citation chain:

- `packages/plugin-sdk/src/index.ts:126-128` cites the rule as living at
  `packages/lint-config/src/plugin-boundary.ts`. **That path does not exist.** The rule is at
  `packages/eslint-plugin-pryzm/src/rules/no-direct-pryzm-in-plugins.js`.
- The rule's own header (`:5-7`) asserts *"all 46 L7 plugin packages are L8-compliant — they import
  ONLY from `@pryzm/plugin-sdk`"*. The gate measures **173 bypasses across 30 plugins**, and there
  are 48 plugins, not 46.

**Consequence.** The SDK boundary — the thing that makes a facade a facade — has had **no
line-level enforcement at any point a developer would feel it**. The only thing standing is the
ratchet in §1.1, which is a repo-wide *count* and permits any individual import as long as the
total holds.

### §1.4 — The gate that *does* exist ratchets the wrong subject

```
$ npx tsx tools/ga-gate/check-l7-boundary.ts
[l7-boundary] files scanned: 789 (floor 500) · dir: plugins · comments stripped · 102 violating import line(s) in 83 file(s)
[l7-boundary] WARN: 83 file(s) across 21 plugin(s) still import L0–L5 packages directly. Baseline ceiling: 84 files. No regressions — ratchet holding.
RC=0
```

- It is **WARN-mode**, not the hard-fail C07 §61 describes.
- Its subject is **files, not imports** — header line 11: *"Hard-fail if ANY plugin's L0–L5 import
  **file count** GROWS beyond its baseline."* **Adding a new direct import inside an
  already-violating file is free.** 102 import lines currently hide inside 83 counted files.
- Its denominator (83 files / 21 plugins) disagrees with §1.1's (173 imports / 30 plugins) because
  they count different things. **Two gates, two denominators, one subject** — name the gate before
  quoting a number.

---

## §2 — The SDK facade: what it exports, and what plugins reach past it for

### §2.1 — What it re-exports (SOUND)

`packages/plugin-sdk/src/index.ts` (693 lines) re-exports from **11 upstream packages**:
`command-bus`, `stores`, `schemas` (incl. `/annotation/dimension`, `/view/view-template`, `/ifc`,
`/schedule`, `/sheet`, `/sheet/widget-payloads`), `scene-committer`, `geometry-kernel`,
`view-state`, `frame-scheduler`, `sync-client`, `renderer`, `ui`, `types-builtin` (door, window,
roof, curtain-wall) — plus its own `descriptor`, `lifecycle`, `hosts`, `sandbox`, `signing`,
`canonical-json`, `bsdd`, `tracing`.

**C76 §1.3 is genuinely well-designed and holds:** `storeRegistry` is re-exported at
`index.ts:693` **without** its `register()` method — *"Plugins ask; they do not fill."* That is a
facade making a capability decision, and it is the strongest thing in this subsystem.

### §2.2 — The gap: what it does **not** re-export is exactly what plugins take

| Target | SDK re-exports it? | Bypass imports |
|---|---|---:|
| `@pryzm/renderer-three` | **NO** | **83** |
| `@pryzm/command-registry` | **NO** | **32** |
| `@pryzm/core-app-model` | only `/store-registry` (`index.ts:693`) | **27** |
| `@pryzm/scene-committer` | yes (curated) | 19 |
| `@pryzm/geometry-curtain-wall` | **NO** | 3 |
| `@pryzm/ai-host` | **NO** | 2 |
| `@pryzm/geospatial`, `@pryzm/geometry-pool`, `@pryzm/drawing-primitives` | **NO** | 1 each |
| `apps/editor` (L7 — an inversion, not a bypass) | n/a | 1 (`plugins/toy-cube/src/HelloCubeBoot.ts`) |

**142 of 173 bypasses (82 %) are three packages the facade has never re-exported.** That difference
*is* the gap between the SDK that exists and an SDK that could be published: a third-party plugin
author would hit the same wall at the same three names, with no workspace symlink to fall through
to.

`renderer-three` is the hard one — **P2 forbids `import * as THREE` outside it**, so any plugin
needing scene objects must reach it, and re-exporting it through an L5 facade would put THREE types
on the public surface. That is a design decision this register cannot make; it must be **named**,
because 83 imports are currently deciding it by default.

### §2.3 — ⛔ DEFECT · The SDK is declared publishable and **cannot install**

`packages/plugin-sdk/package.json`:

- `"version": "1.0.0"`, `"publishConfig": { "name": "@pryzm/sdk", "access": "public", "registry": "https://registry.npmjs.org/" }`
- `"main": "./src/index.ts"`, `"types": "./src/index.ts"`; **all 8 subpath exports resolve to raw `.ts`**
- `"files": ["src", "examples", "docs", ...]` — **no `dist`**, and `ls packages/plugin-sdk/dist` → *No such file or directory*
- `"bin": { "pryzm": "./src/dev/bin.ts" }` — a `.ts` file as a CLI entry point; `node` cannot run it

And the blocking one — **every runtime `@pryzm/*` dependency is `private: true`:**

| dependency | `private` | `main` |
|---|---|---|
| `@pryzm/command-bus`, `stores`, `schemas`, `scene-committer`, `geometry-kernel`, `view-state`, `frame-scheduler`, `sync-client`, `renderer`, `types-builtin`, `ui`, `core-app-model` | **`true`** (12 / 12) | `./src/index.ts` (12 / 12) |

Publishing `@pryzm/sdk@1.0.0` produces a package whose install resolves 12 names that are not on
the registry and never will be while they carry `private: true`. **UNMEASURED:** whether it has
ever actually been published to npm — I did not query the registry.

### §2.4 — ⛔ DEFECT · The third-party plugin execution path is defined and **never mounted**

The SDK ships the full third-party story: manifest schema (D1), lifecycle (D2), host proxies (D3),
iframe sandbox + CSP (D4/D7), Ed25519 signing (D8), `pryzm dev` CLI. Reachability, measured:

| SDK capability | Consumers outside `plugin-sdk/src` + its own tests |
|---|---|
| `definePlugin` (the lifecycle entry point) | **0** — only `packages/plugin-sdk/examples/{hello,format,ai-workflow}-plugin/index.ts` |
| `IframeSandbox` / `iframe-sandbox` / `plugin-sdk/sandbox` | **0** |
| `HostProxies` / `CommandBusProxy` / `StoresProxy` | **0** |
| `validateManifest` / `PluginManifestSchema` | **0** |

`packages/plugin-sdk/src/sandbox/iframe-sandbox.ts:27-28` states: *"the full runtime implementation
lives in `apps/editor/src/plugin-runtime/` (which consumes this module)."*
**`ls apps/editor/src/plugin-runtime/` → No such file or directory.**

**Consequence.** **None of the 48 in-repo plugins is a "plugin" in the SDK's sense.** They are
compile-time workspace packages wired by hand in `apps/editor/src/PluginRegistry.ts` and
`engineLauncher.ts`. The permission model, the sandbox, the manifest lock and the hook timeouts
have never executed against a real plugin. `plugin.manifest.json` exists for **5 of 48** plugins
(`bcf`, `family-editor`, `ifc-inspector`, `schedules`, `wall`) plus the 3 SDK examples — and
nothing loads them.

---

## §3 — Plugin health, all 48

**Denominators:** 48 plugin packages · 788 non-test source files · **82 076 LOC** · 22
`PluginDescriptor` entries in `ALL_PLUGINS` (`apps/editor/src/PluginRegistry.ts:224`) + 3 tool-only
imports (`bcf`, `cross`, `toy-cube`, lines 35/36/40).

"store in composed runtime" is the **executed** census from
`npx tsx tools/ga-gate/check-verb-liveness.ts` (real `composeRuntime`, happy-dom, 395 s) — see
§3.3. That gate names **families**, not packages; the package↔family mapping in this column is
mine.

| plugin | LOC | src | tests | in ALL_PLUGINS | importers | SDK bypasses | store in composed runtime |
|---|---:|---:|---:|---|---:|---:|---|
| `ai-floorplan` | 302 | 5 | 2 | **no** | **0** | 2 | — |
| `ai-generative` | 85 | 3 | 1 | **no** | **0** | 0 | — |
| `ai-query` | 62 | 3 | 1 | **no** | **0** | 0 | — |
| `ai-rules` | 50 | 3 | 1 | **no** | **0** | 0 | — |
| `ai-voice` | 56 | 3 | 1 | **no** | **0** | 0 | — |
| `annotations` | 16932 | 76 | 9 | yes | 55 | **68** | REACHABLE |
| `bcf` | 1733 | 14 | 4 | tool only | 3 | 0 | — |
| `beam` | 1261 | 19 | 1 | yes | 2 | 3 | **ABSENT** |
| `ceiling` | 1397 | 20 | 2 | yes | 2 | 4 | **ABSENT** |
| `column` | 1219 | 19 | 1 | yes | 2 | 3 | **ABSENT** |
| `cross` | 896 | 9 | 4 | tool only | 1 | 0 | — |
| `curtain-wall` | 3201 | 33 | 8 | yes | 4 | 7 | **ABSENT** |
| `dimensions` | 1191 | 18 | 1 | yes | 2 | 3 | — |
| `door` | 1843 | 20 | 5 | yes | 3 | 4 | REACHABLE |
| `dxf` | 78 | 4 | 1 | **no** | **0** | 0 | — |
| `export-pdf` | 80 | 4 | 1 | **no** | 1 | 0 | — |
| `family-editor` | 28 | 1 | **0** | **no** | **0** | 0 | — |
| `floor` | 817 | 10 | 1 | yes | 2 | 4 | **ABSENT** |
| `furniture` | 1962 | 24 | 7 | yes | 2 | 4 | **ABSENT** |
| `geospatial` | 502 | 6 | 2 | **no** | 1 | 1 | — |
| `grid` | 702 | 15 | 1 | yes | 2 | 3 | **ABSENT** |
| `handrail` | 985 | 19 | 1 | yes | 2 | 3 | **ABSENT** |
| `ifc-export` | 6004 | 32 | 15 | **no** | 2 | 2 | — |
| `ifc-import` | 971 | 12 | 4 | **no** | 2 | 1 | — |
| `ifc-inspector` | 393 | 7 | 1 | **no** | 1 | 0 | — |
| `levels` | 146 | 5 | 1 | launcher only | 1 | 1 | — |
| `lighting` | 1183 | 18 | 2 | yes | 2 | 3 | — |
| `multiplayer` | 969 | 10 | 4 | **no** | **0** | 0 | — |
| `navigate` | 183 | 5 | 1 | **no** | **0** | 0 | — |
| `plan-view` | 3821 | 22 | 16 | **no** | 2 | 1 | — |
| `plumbing` | 1080 | 18 | 2 | yes | 2 | 4 | **ABSENT** |
| `pool` | 570 | 7 | 1 | launcher only | 1 | 1 | — |
| `render` | 38 | 3 | 1 | **no** | **0** | 0 | — |
| `rhino-import` | 394 | 5 | 1 | **no** | 1 | 0 | — |
| `roof` | 1489 | 23 | 4 | yes | 2 | 3 | **ABSENT** |
| `rooms` | 3708 | 29 | 6 | yes | 2 | 4 | REACHABLE |
| `schedules` | 2833 | 23 | 13 | **no** | **0** | 1 | REACHABLE |
| `section-view` | 920 | 15 | 3 | launcher only | 1 | 0 | — |
| `selection` | 822 | 12 | 5 | yes | 2 | 0 | — |
| `sheets` | 4998 | 46 | 29 | **no** | 1 | 0 | REACHABLE |
| `slab` | 2277 | 27 | 2 | yes | 3 | 5 | REACHABLE |
| `stair` | 1560 | 23 | 4 | yes | 1 | 6 | **ABSENT** |
| `structural` | 1459 | 20 | 2 | yes | 12 | 4 | — |
| `toy-cube` | 376 | 9 | 1 | tool only | 3 | 2 | — |
| `view` | 1467 | 22 | 3 | yes | 2 | 7 | REACHABLE |
| `visibility-intent` | 158 | 4 | 1 | **no** | **0** | 0 | — |
| `wall` | 7187 | 44 | 20 | yes | 22 | 13 | REACHABLE |
| `window` | 1688 | 19 | 5 | yes | 3 | 5 | REACHABLE |

### §3.1 — ⛔ 12 of 48 plugins have **ZERO importers repo-wide**

Measured two ways, agreeing: (a) a scan of every non-test `.ts/.tsx` in `apps/`, `packages/`,
`src/`, `server/` plus cross-plugin imports for the exact package specifier; (b)
`grep -rl "plugin-<name>" apps/ packages/ src/ server/ index.html vite.config.ts` → **0** for each.

`ai-floorplan` · `ai-generative` · `ai-query` · `ai-rules` · `ai-voice` · `dxf` · `family-editor` ·
`multiplayer` · `navigate` · `render` · `schedules` · `visibility-intent`

**4 842 LOC — 5.9 % of the plugin tree — reachable from nothing.** Two are not scaffolds:

- **`schedules` — 2 833 LOC, 23 src files, 13 test files, its own `plugin.manifest.json`, 6 handlers
  (`AddColumn`, `CreateSchedule`, `DeleteSchedule`, `RemoveColumn`, `SetFilter`, `SetGroupBy`), and
  `exceljs` + `pdf-lib` dependencies.** A complete, tested schedules feature that no code path
  reaches. (The schedule *store* is REACHABLE in the composed runtime — via `@pryzm/stores`, not via
  this plugin. Whatever ships schedules today, it is not `plugins/schedules`.)
- **`multiplayer` — 969 LOC, 4 test files, `registerMultiplayerHandlers` defined, zero call sites.**

`family-editor` is the sharpest single row: `version: 1.0.0`, **`private: false`** (the only
non-private plugin in the tree), 28 LOC, **0 tests**, an `activate()` whose entire body is
`console.info('… stub implementation')` (`plugins/family-editor/src/index.ts:24`), and a
`plugin.manifest.json` on disk. Its own header says it exists *"so the package builds and the
manifest passes K3-C Gate #1"* — **a package shaped to satisfy a gate.**

Five more are declared shells by their own headers — *"empty workspace-package shell (F-prereq.0) …
This file intentionally contains no handlers, stores, or contributions"*: `render` (38 LOC), `dxf`
(78), `export-pdf` (80). These are honest and cheap; they are listed for completeness, not as
defects.

### §3.2 — 7 registration functions defined with **zero call sites**

`registerBCFHandlers` · `registerCrossHandlers` · `registerIFCExportHandlers` ·
`registerMultiplayerHandlers` · `registerPlanViewHandlers` · `registerStairHandlers` ·
`registerCubeHandlers` — each defined in `plugins/<p>/src/handlers/index.ts`, each with **0**
matches across `apps/`, `packages/`, `src/`, `server/`, `server.js`.

⚠ **`stair` and `toy-cube` and `bcf` and `cross` are still reachable** — via the *second*
registration path, `PluginRegistry.ts`'s `buildHandlers: () => build<X>HandlerSet()`
(`apps/editor/src/PluginRegistry.ts:313` for stair). **There are two rival registration mechanisms**
(`register<X>Handlers(bus)` called from `engineLauncher.ts`/`initBusHandlers.ts`, and
`build<X>HandlerSet()` declared in `PluginRegistry.ts`), and a plugin can be live on one while its
other entry point is dead. `ifc-export` (6 004 LOC), `multiplayer` and `plan-view` (3 821 LOC) are
dead on **both**.

### §3.3 — ⛔ The detached-DTO-store condition, measured by an executed gate

```
$ npx tsx tools/ga-gate/check-verb-liveness.ts        # 395 s, real composeRuntime
── STORE CENSUS (executed against the composed runtime) ──
   REACHABLE (11): door, window, annotation, sheet, schedule, view, hierarchy, template, wall, slab, room
   ABSENT    (12): roof, ceiling, floor, furniture, plumbing, stair, column, curtain-wall, grid, beam, handrail, opening
   For every ABSENT family, CA-21 is unprovable BY CONSTRUCTION in this process.

── VERDICT DISTRIBUTION over the register ──
   register verbs        337
   PROVEN                7   (executed dispatch + executed read-back)
   UNPROVABLE-NO-STORE   116   (authoritative store absent from the composed runtime)
   UNKNOWN               214
RC=0   ✅ PASS — all 7 baseline verbs still prove their write by an executed read-back.
```

**Read the last three lines together: 7 of 337 registered verbs (2.1 %) are proven to write
anything.** 116 are unprovable because their store is not in the composed runtime at all. The gate
**passes**, because its ratchet is grow-only on the 7 — and its own closing line says so: *"116
verbs remain UNPROVABLE-NO-STORE and 214 UNKNOWN. Neither is a pass; both are the work."*

**11 element families own a store that the composed runtime does not contain** — `roof`, `ceiling`,
`floor`, `furniture`, `plumbing`, `stair`, `column`, `curtain-wall`, `grid`, `beam`, `handrail`
(plus `opening`, which is not a plugin). Every one of those 11 is nonetheless a **registered
`PluginDescriptor` in `ALL_PLUGINS` with a `storeKey`**. That is the detached-DTO-mirror condition,
at 11 plugins, established by execution rather than by reading.

`floor` is the worked example the lane brief named, and it is *documented as such in the code*:
`plugins/floor/src/handlers/SetFloorFinishBatch.ts:11-12` — *"`floor.setMaterial` is a **DECLARED
DEAD VERB**. `SetFloorMaterial.ts` in this same directory returns `{valid:false}` from `canExecute`
with the §FIX-DEAD-VERB-REFUSE …"*. The same `§FIX-DEAD-VERB-REFUSE` (W3-3) / `§FIX-DEAD-MOVE-VERB-REFUSE`
(W3-4) pattern is present in **13 handlers across 10 plugins**:

| verb | file |
|---|---|
| `beam.setMaterial`, `beam.move` | `plugins/beam/src/handlers/SetBeamMaterial.ts:28`, `MoveBeam.ts:22` |
| `ceiling.setMaterial` | `plugins/ceiling/src/handlers/SetCeilingMaterial.ts:28` |
| `column.setMaterial`, `column.move` | `plugins/column/src/handlers/SetColumnMaterial.ts:28`, `MoveColumn.ts:22` |
| `curtain-wall.setMaterial` | `plugins/curtain-wall/src/handlers/SetCurtainWallMaterial.ts:28` |
| `dimension.move` | `plugins/dimensions/src/handlers/MoveDimension.ts:25` |
| `door.move` | `plugins/door/src/handlers/MoveDoor.ts:23` |
| `floor.setMaterial` | `plugins/floor/src/handlers/SetFloorMaterial.ts:29` |
| `furniture.setMaterial`, `furniture.move`, `furniture.rotate` | `plugins/furniture/src/handlers/{SetFurnitureMaterial:28, MoveFurniture:23, RotateFurniture:26}.ts` |
| `handrail.setMaterial` | `plugins/handrail/src/handlers/SetHandrailMaterial.ts:28` |
| `lighting.setMaterial`, `lighting.move` | `plugins/lighting/src/handlers/{SetLightingMaterial:28, MoveLighting:22}.ts` |
| `plumbing.setMaterial`, `plumbing.move` | `plugins/plumbing/src/handlers/{SetPlumbingMaterial:28, MovePlumbing:22}.ts` |

**These are the honest ones.** A verb that refuses with a cited rationale is strictly better than one
that silently writes a store nothing reads. The defect is not the refusal — it is that **9 of these
10 plugins are exactly the plugins whose store is ABSENT from the composed runtime**, i.e. the
refusal is a symptom, and the underlying detachment is unfixed.

### §3.4 — ⛔ Undeclared dependencies: 26 of 48 plugins build by accident

Scan of every non-test plugin source file's import specifiers against its own
`dependencies` + `peerDependencies` + `devDependencies`:

```
plugins: 48 | plugins with >=1 UNDECLARED runtime import: 26
total UNDECLARED import specifiers: 32 | total DECLARED-but-never-imported deps: 56
```

The headline: **21 plugins import `@pryzm/renderer-three`; exactly 1 (`annotations`) declares it.**
20 plugins resolve it purely through pnpm workspace hoisting. Others: `geospatial` imports `cesium`
undeclared; `levels` imports **`@pryzm/plugin-sdk` itself** undeclared; `sheets` imports `zod`
undeclared; `ceiling`/`door`/`window`/`floor`/`levels` import `@pryzm/command-registry` undeclared.

Conversely **56 declared-but-never-imported** deps, including all four `ai-*` plugins declaring
`@pryzm/ai-host` and using nothing (`ai-generative`, `ai-query`, `ai-rules`, `ai-voice`).

**Consequence.** Every one of these 26 plugins is unextractable — moving it out of this monorepo, or
publishing it, fails at install. It is also why the SDK-facade rule *feels* optional: the imports
work regardless of what the manifest says.

### §3.5 — The L8 manifest rule, measured

The stated rule (`no-direct-pryzm-in-plugins.js:20-21`): *"a plugin's package.json lists ONLY
`@pryzm/plugin-sdk`."*

| | count / 48 |
|---|---:|
| declare `@pryzm/plugin-sdk` at all | **35** |
| whose **only** `@pryzm/*` dep is `plugin-sdk` | **13** |
| declare a non-SDK `@pryzm/*` dep | 26 |
| declare `three` directly | 16 |

**13 / 48 (27 %) comply.**

### §3.6 — A plugin importing something its own header forbids (SOUND — self-caught)

`plugins/sheets/src/view-renderer/view-source.ts:47-51` names it in its own comment: the module
*"transitively imports `@pryzm/plugin-plan-view` … which is precisely what the rule at the top of
this file forbids"*, and records the fix (moving `EditCamera`/`IDENTITY_EDIT_CAMERA` to
`./view-camera.ts`, §SHEET-NAVIGATE-INSIDE-THE-VIEWPORT / L-1865). `plugins/sheets` still holds a
declared `@pryzm/plugin-plan-view` dependency and a value import at `sheet-editor-host.ts:56`. This
is the healthy shape — the constraint is written down at the file it governs, and the breach was
caught and annotated. It is recorded here because it is a **plugin→plugin** edge the layer gate
cannot see (L6→L6 is allowed) and no other artefact counts.

### §3.7 — Legacy dispatch still inside plugins

**14 real `commandManager.execute(...)` call sites survive in `plugins/`** (207 textual mentions;
14 are executable, the rest are comments/migration notes). **All 14 are in `plugins/annotations`**
— `DimensionPropertiesPanel.ts:158,167`, `tools/CalloutDetailTool.ts:180`,
`tools/ElevationMarkTool.ts:152`, `tools/LevelDatumLineBuilder.ts:112,131`,
`tools/LinearDimensionAnnotationTool.ts:832,910`, `tools/MatchlineTool.ts:142`,
`tools/NorthArrowTool.ts:115`, `tools/ScaleBarTool.ts:129`, `tools/SectionGridLineBuilder.ts:110`, +2.
This is P6's exception surface living inside the single worst bypasser (§1.2). Only **4**
`(window as any)` / `window.__pryzm` bridge accesses remain across all 48 plugins — that half is
close to clean.

---

## §4 — The external API, 9 axes

**Two REST surfaces exist and neither is what production serves.** Establish that first:

| | evidence | verdict |
|---|---|---|
| Root `fly.toml:36` `app = "pryzm"`, `:44` `dockerfile = "Dockerfile"`, `:85` `internal_port = 5000` | root `Dockerfile:264` `CMD ["node","./dist/index.cjs"]` | production = **`server.js`** |
| `apps/api-gateway`, `apps/marketplace-api` in `.github/workflows/**` | **0 matches across all 8 workflow files** | **not deployed** |
| `apps/api-gateway/Dockerfile:68` `CMD ["pnpm","start"]` → `tsx src/index.ts`, port 5101 | referenced only by `pryzm-selfhost/docker-compose.yml:120-125` | self-host bundle only |
| `apps/marketplace-api` deploy artifact | **none** — no Dockerfile, no fly.toml, absent from docker-compose | **dead code w.r.t. every deploy target** |

| # | Axis | Verdict | Evidence |
|---|---|---|---|
| 1 | **Surface definition** | **GAP** | `packages/api-spec/openapi.yaml` is a real OpenAPI 3.1.0 doc (408 lines) declaring **12 paths / 14 operations**. Implemented HTTP routes across both apps: **27**. Spec covers **12 / 27 (44 %)**; 15 undeclared (7 webhook routes, all 7 marketplace-api routes, `/v1/health`). **No conformance gate exists** — the two `packages/api-spec/__tests__/*.test.ts` never import Express. **`@pryzm/api-spec` is imported by zero source files anywhere in the repo outside its own package** (7 total references: 2 dependency-manifest lines, its own name/doc/2 tests, 1 CI-skip-ledger entry). The spec is inert. Drift is already present and unmeasured: spec sets `security: oauth2:['project:read']` at `openapi.yaml:77-78, 99-100, 257-258, 266-267`; `routes/ai.ts:47,55` and `routes/formulas.ts:34,39` apply no `requireScopes`. |
| 2 | **AuthN/AuthZ** | **GAP — critical** | `apps/api-gateway/src/app.ts:73` — `const authShim = opts.authShim ?? defaultTestAuthShim;`. The shipped bootstrap `apps/api-gateway/src/index.ts:73-81` passes **no `authShim`**, and `Dockerfile:68` runs exactly that bootstrap. `defaultTestAuthShim` (`src/auth-shim.ts:39-44`, docstring *"Default test shim — production wires a real OAuth2 resource server"*) reads **`x-test-subject`, `x-test-scopes`, `x-test-roles`, `x-test-tier` straight off the request**. `curl -H 'X-Test-Roles: owner' -H 'X-Test-Scopes: project:write ai:invoke'` is full admin. The shim **never rejects** — it only populates `req.auth`. Per-route coverage: api-gateway **15 / 20** have `requireScopes`; marketplace-api **2 / 7**. `apps/api-gateway/src/index.ts:87` — WS `authResolver: (token) => (token ? {subject:'demo',scopes:['project:read']} : null)`: any non-empty string reads any project. `POST /v1/admin/plugins/:publisher/:slug/versions/:version/revoke` (`apps/marketplace-api/src/app.ts:189`) has **no admin check at all** (`requireAdmin` does not exist in that app) — anyone with `project:write` revokes any publisher's plugin. `packages/api-rbac/src/index.ts:197-199` explicitly disclaims token introspection; **nothing else provides it.** |
| 3 | **Rate limiting** | **GAP** | 11 `rateLimit()` call sites, all in the two undeployed apps; **25 / 27 routes covered** (both `/v1/health` uncovered; WS upgrade path `src/ws.ts:78-106` uncovered). **Zero call sites in the deployed `server/` tree.** Two structural bypasses: the bucket key is `req.auth?.subject` (`packages/rate-limit/src/index.ts:215`) which is the client-supplied `X-Test-Subject`, so rotating a header yields unlimited buckets; and the tier is `req.auth?.tier` (`:216`) from `X-Test-Tier`, so `paid` lifts reads 60→600 (`:129-138`). Registry is an in-process `Map` (`:145`) — no shared store across replicas. |
| 4 | **Versioning** | **GAP** | `/v1/` prefix present on every route in both apps, and in the spec's server URL (`openapi.yaml:25`). Everything else is absent: `grep 'deprecat\|sunset\|api-version\|accept-version'` across both apps + the YAML → **0 matches**; OpenAPI's own `deprecated:` flag on **0 of 14** operations; no version negotiation header; the spec version `1.0.0-draft` (`openapi.yaml:23`) is **never emitted on the wire**. A breaking change ships with zero failing checks, because the only guard is a SHA-256 byte-pin (`__tests__/openapi-spec.test.ts:30`) over a file nothing imports, in a package CI skips. `app.ts:37` says `API_GATEWAY_VERSION='0.2.0'`; `package.json:3` says `0.1.0`. |
| 5 | **Error contract** | **GAP** | **Zero error schemas in the spec** — `grep -i error openapi.yaml` → 0 matches; every 4xx/5xx response carries a `description:` and **no `content:`**. In code, **16 distinct error body shapes** are emitted across the two apps; only the `error` key is universal. No `code`/`message`/`details` triple, **no `requestId`/correlation id on any error**. 4 sites return the raw internal exception to the caller (`routes/projects.ts:87,126`, `routes/ai.ts:113`, `routes/admin.ts:166` — `error_description: err.message`). `src/ws.ts` has **10 silent `catch {}`** (lines 89,115,147,168,187,192,196,204,213,220) — every WS failure discarded with no log and no metric. |
| 6 | **Input validation** | **READY (mostly)** | **18 / 27** routes validate with Zod at the boundary; 8 take no input; **2** read raw. Body parsing is per-route with explicit limits rather than a global `express.json()` (`ai.ts:73` 256 kb, `admin.ts:143` 64 kb, `webhooks.ts:111` 16 kb, `:168` 1 kb, `:220` 4 kb, `projects.ts:97` 5 MiB raw) — that is good practice. One unbounded field: `apps/marketplace-api/src/app.ts:199` `reason` is taken raw under a 5 MiB `express.json()` limit (`:62`) and served publicly from `/v1/revocations.json`. Separately `routes/webhooks.ts:59-67` uses the client-supplied `X-Test-Workspace` header as the **tenant key** for its isolation checks (`:96,153,181,204,228`) — cross-workspace read/write on the shipped bootstrap. |
| 7 | **Idempotency / concurrency** | **GAP** | `Idempotency-Key`: **0** occurrences. `If-Match`: **0**. `412` / `precondition_failed`: **0**. `optimistic`: **0**. No `rev`/version field on any mutable resource — `PUT /v1/admin/overrides/:k/:i` (`routes/admin.ts:158`) and `PUT /v1/admin/webhooks/:id/active` (`routes/webhooks.ts:185`) are last-write-wins with no precondition. ETag exists but **read-side only** (`routes/projects.ts:73-81`, `If-None-Match` → 304 cache validation). The two `409`s (`marketplace-api/src/app.ts:159,182`) are duplicate-insert, not concurrency. **The 412 re-base the client hit today is not implemented on this surface and appears nowhere in `openapi.yaml`.** Every retryable write is non-idempotent with no dedupe key. |
| 8 | **Observability** | **GAP — zero** | **0 / 16** source files under `apps/api-gateway` + `apps/marketplace-api` import an OTel tracer; neither `package.json` lists `@opentelemetry/api`. No request logging, no access log, no correlation header, no metrics — `grep console\.` in `apps/api-gateway/src` finds **1** line (the boot banner, `index.ts:91`). The pattern exists elsewhere in the repo (`apps/sync-server/src/otel.ts:11-20`, `authz/PgAuthz.ts:262`, `auth/WsAuthGate.ts:193`) and was simply never applied to the public surface. A third party hitting a 500 has no trace id to quote. |
| 9 | **Docs / SDK for a third party** | **GAP** | The SDK is unpublishable (§2.3) and its execution path unmounted (§2.4). `openapi.yaml` covers 44 % of a surface that is not deployed. See §5 for what covers the surface that *is* deployed. |

### §4.1 — ⛔ None of the 10 API packages is tested in CI

Root `package.json:54` — `"test:ci": "pnpm -r --workspace-concurrency=1 --if-present run test:ci"`.
**Every one of the 10 declares `test`, not `test:ci`**, so `--if-present` makes each a silent no-op.
The repo already tracks this: `scripts/check/test-ci-coverage-baseline.json:2` — *"Workspaces that
declare `test` but not `test:ci`, and are therefore silently skipped …"* — and all 10 targets are on
that 124-entry list (lines 6, 9, 11, 12, 13, 15, 24, 43, 95, 126). `api-gateway`, `marketplace-api`
and `api-spec` appear in **no** workflow file. The 10 `api-gateway` test files and the SHA-256 spec
pin **have never gated a merge.**

### §4.2 — Two further traced findings

- **Both apps are in-memory only.** `apps/api-gateway/src/index.ts:69,77,78` construct
  `InMemoryProjectStore`, `InMemoryAiSpendStore`, `InMemoryOverrideStore`;
  `apps/marketplace-api/src/app.ts:59` `createInMemoryStore()`. `apps/marketplace-api/migrations/0001_marketplace_plugins.sql`
  exists but is referenced only in comments; **no Postgres client is imported in either app.** All
  data lost on restart.
- **Webhooks never fire.** `deliverOnce` has exactly one non-test call site —
  `apps/api-gateway/src/routes/webhooks.ts:247`, inside the manual *test* route.
  `enqueueWithRetry`/`DeliveryQueue` (`packages/webhooks/src/delivery.ts:125,133,172`) is used only
  by that package's own tests. The file header concedes it (`routes/webhooks.ts:11-14`). **A third
  party can subscribe to a webhook that will never fire.** The signing itself is sound
  (HMAC-SHA256, 300 s replay window, `packages/webhooks/src/signature.ts:24-26,55-61`).
- **`@pryzm/beta-signup` and `@pryzm/email-transport` are unmounted** — zero HTTP routes, zero
  consumers in either app or in `server/`.

---

## §5 — `server.js` as an external-facing surface

**The honest headline: `server.js` is the only surface that is deployed, and it is a browser BFF,
not an external API. An external developer cannot obtain a credential for it at all.**

### §5.1 — Route census

**158 route registrations** across `server.js` (6 270 lines) + `server/**`:

| File | routes | mount |
|---|---:|---|
| `server.js` | **96** | root |
| `server/api/v1/routes.js` | 24 | `/api/v1` (`server.js:439`) |
| `server/jurisdiction/index.js` | 22 | root, absolute paths (`server.js:411`) |
| `server/aiPublicApiRoutes.js` | 5 | `/v1/ai` (`server.js:448`) |
| `server/stripeRoutes.js` | 4 | `/api/stripe` (`server.js:2398`) |
| `server/familyMarketplaceRoutes.js` | 4 | `/api/v1/families` (`server.js:427`) |
| `server/context-delivery/index.js` | 3 | root (`server.js:406`) |
| **total** | **158** | |

`server.js`'s 96 by prefix: `/api/projects/*` **27** · `/api/ai/*` **13** · `/marketplace/api/*`
**12** · `/api/auth/*` **9** · `/api/render/*` 4 · `/api/panorama/*` 4 · `/api/health/*` 3 ·
`/api/export/*` 3 · `/api/manual-zone/*` 2 · 2 marketing-redirect arrays · 17 singletons.

### §5.2 — SOUND: the write-path gate passes, and it is real

```
$ npx tsx tools/ga-gate/check-write-route-auth.ts
[write-route-auth] ✅ 47 mutating route(s) scanned in server.js: 40 behind authMiddleware,
                      7 declared-exempt with a rationale. 8 router mount(s) seen.
RC=0
```

The 7 exemptions are pre-declared in `tools/ga-gate/write-route-auth-exemptions.json` and
reconciled **bidirectionally**, each with a compensating control: CSP report sink (204, no
persistence, `server.js:380`) · `/api/leads` (rate + size cap, `:386`) · `/api/overpass`
(`apiLimiter`, `:398`) · `/api/auth/set-plan` (`x-internal-secret` vs `INTERNAL_PLAN_SECRET`,
**fail-closed**, `:1834-1836`) · signup (`:1915`) · signin (`:1946`) · Stripe webhook (HMAC,
`:2152`). **No undeclared unauthenticated write route exists.** This is a genuinely good control and
it is better than anything in §4.

### §5.3 — ⛔ DEFECT · But `authMiddleware` **is fail-open**, so "behind authMiddleware" is not "requires auth"

`server.js:787-905`. Read its two terminal branches:

```js
// server.js:898-899  — token present but INVALID
req.auth = { userId: 'anonymous', sessionId: null, email: null };
return next();
// server.js:903-904  — no token at all
req.auth = { userId: 'anonymous', sessionId: null };
return next();
```

**`authMiddleware` never returns 401.** It is an *identity-population* middleware, not a gate. The
actual rejection happens per-route in `_httpRequireAccess` (`server.js:959-965`, 403/503),
`requireBearer` (`server/aiPublicApiRoutes.js:80-89`) and `requireSnapshot`
(`server/api/v1/routes.js`).

**Consequence for how §5.2 must be read.** The gate's *"40 behind authMiddleware"* means *the
middleware ran on 40 routes*, not *40 routes reject an anonymous caller*. **Whether each of those 40
also carries a per-route rejection is UNMEASURED** — the gate does not assert it, and neither did I.
That is the single most important caveat in this document, because the gate's green is otherwise
easy to read as "the write path is authenticated."

Coverage across all 158: **105 have an auth middleware applied, 53 do not** — 22 jurisdiction
routes (`server.js:411` mounts with `apiLimiter` only), 3 context-delivery routes (`:406`), 28 in
`server.js` itself. One anonymous-readable leak: `GET /api/v1/diagnostic`
(`server/api/v1/routes.js:142`) uses `req.auth?.userId ?? 'anonymous'` with **no 401 guard** and
returns DB-configuration probes plus **raw PostgreSQL error strings**.

### §5.4 — ⛔ THE ANSWER TO THE FOUNDER'S QUESTION · There is no credential an external developer can obtain

- Authentication is **Bearer JWT only** — HS256 over `SESSION_SECRET`, `TOKEN_EXPIRY = '30d'`
  (`server/authStore.js:29`), minted at `authStore.js:99,135,183,219`.
- **Zero cookies** (`grep -i cookie server.js server/authStore.js` → nothing).
- **No API key. No personal access token. No OAuth2 authorization server.** There is no
  `/oauth/authorize`, no `/oauth/token`, no `code_challenge` handling anywhere in `server.js` or
  `server/**`. `server/oauthService.js` is login-*with*-Google/Microsoft for PRYZM's own users — the
  opposite direction.
- **`packages/oauth2-pkce/` is dead code** — `grep -rl "@pryzm/oauth2-pkce"` over `apps/ packages/
  server/ server.js` returns **only `packages/oauth2-pkce/src/index.ts` itself**.
- **No scopes.** The JWT carries `sub` + `email`; every token is full-account. There is no scope
  claim and no scope check anywhere in the deployed server.

**An external developer's only path to a credential is to POST a user's email and password to
`/api/auth/signin` (`server.js:1946`) and hold a 30-day, full-account, unscoped JWT.** That is not
an external API; it is credential sharing.

### §5.5 — ⛔ DEFECT · The published documentation describes an API that does not exist

`apps/docs-site/src/content/docs/api/auth.md:7-10`, verbatim:

> *"The PRYZM Public API uses **OAuth2 with PKCE** (RFC 7636) as its **sole** authentication
> mechanism. There are no API keys, no client secrets, no HTTP Basic Auth — every authenticated
> request carries a short-lived bearer token obtained through the PKCE flow."*

**None of that is implemented** (§5.4). `server.js:446-447` says the opposite in a code comment:
*"the OAuth2 grant flow is explicitly deferred to S65; the Bearer/PAT path is the 3A-draft
contract."* `auth.md:35-38` further declares three scopes; the deployed server has none.

And the OpenAPI document is worse than merely incomplete:

| | |
|---|---|
| `packages/api-spec/openapi.yaml` paths | **12** |
| …of which exist in `server.js` / `server/**` | **0** |
| `server.js` + `server/**` live routes | **158** |
| …of which are documented anywhere | **0** |

The 12 documented paths (`/projects/{id}/export.pryzm`, `/projects/import`, `/ai/workflows*`,
`/admin/ai-spend`, `/admin/overrides*`, `/formulas*`, `/projects/{id}/stream`, `/awareness`) belong
to `apps/api-gateway` — **the app that is not deployed** (§4 preamble). Against production they fall
through to the SPA catch-all (`server.js:5949`) and return `index.html`.

`server/aiPublicApiRoutes.js:85` returns `docsUrl: '/api/v1/docs'` in **every 401 body**. That route
does not exist; it too returns HTML.

**No client SDK, no Postman collection, no served docs endpoint.** An external developer following
the published docs would build against 12 endpoints that return an HTML page, using an OAuth2 flow
that does not exist.

### §5.6 — ⛔ DEFECT · The revocation list **fails open**

`server.js:5879-5895`:

```js
let crl = { revokedPublisherKeysB64: [], revokedPluginIdAtVersion: [], issuedAt: … };
try { … if (pool) crl = await fetchRevocationList(pool); }
catch { /* DB unavailable — return empty CRL */ }
res.setHeader('Cache-Control', 'public, max-age=3600');
res.json(crl);
```

⭐ **A CRL that answers "nothing is revoked" when it cannot reach the database is the
§CONTEXT-DATA-HONESTY defect on a security control — failure and "nothing revoked" are the same
value** — and it is then cached for an hour. The same fail-open shape appears at
`GET …/purchase-status` (`:5720-5722` → `purchased:false`) and `GET …/reviews`
(`:5805-5808` → empty 200, a success-shaped failure).

### §5.7 — SOUND, with three holes: the Ed25519 marketplace path

`POST /marketplace/api/plugins/submit` (`server.js:5223`) is **the best-built external-facing
endpoint in the repo**: rejects anonymous (`:5228`), requires a signature (`:5241`,
`MISSING_SIGNATURE` / `MALFORMED_SIGNATURE`), requires the key be registered to the publisher
(`:5261`, 403 `UNREGISTERED_KEY`), verifies cryptographically via
`server/pluginSigningService.js:49` (`node:crypto` `createPublicKey` + `verify`, SPKI DER wrapper),
and inserts as `review_status='pending', is_active=FALSE` (`:5294-5319`). Install re-verifies
(`:5478`) and refuses unsigned third-party bundles (`:5492-5498`).

**Four traced holes:**

1. **`server.js` never imports `@pryzm/plugin-sdk`** (`grep -n "@pryzm/" server.js` → **0 lines** —
   the whole file has no workspace imports at all). Manifest validation is
   `if (!manifest.id || !manifest.name || !manifest.version)` (`:5234`). **The locked D1 descriptor
   schema (ADR-0038) — the `id` regex, `version` regex, `pryzmPlugin` literal, permission enum, and
   the `network:fetch` invariant — is not enforced at the boundary it exists to defend.** Requested
   `permissions` are stored verbatim (`:5312`) with no check against the SDK's permission set.
2. **`canonicalJSONStringify` is hand-copied.** `server/pluginSigningService.js:35-46` re-implements
   it, and its own header (`:5-8, :27-29`) says so. **Nothing pins the two implementations to each
   other** — a divergence produces silent verification failures on valid bundles.
3. **The publisher-key check is skipped when the DB is down.** `:5256-5263` catches the pool lookup
   (`catch { /* DB unavailable — fall through to signature check only */ }`) and the guard at
   `:5265` is `if (pool && !keyRow)`. With `pool === null` the signature verifies against the public
   key supplied **in the same request** — self-attestation, not authentication.
4. **`bundleSha256` is self-declared.** `:5273-5276` takes it from the request; `bundleUrl` is
   stored (`:5310`) and **never fetched, never hashed**. Nothing proves the bundle at that URL is
   the bundle that was signed. `install` returns only a `bundleUrl` plus instructions text
   (`:5515-5526`) — **it does not serve the bundle**, so nothing downstream can check it either.

### §5.8 — Other measured gaps on the deployed surface

| Axis | Reading |
|---|---|
| **Versioning** | **33 / 158 versioned (20.9 %)** — `/api/v1/*` 24, `/api/v1/families/*` 4, `/v1/ai/*` 5. All 27 `/api/projects/*`, all 12 `/marketplace/api/*`, all 13 `/api/ai/*` and all 22 jurisdiction routes are **unversioned**. The two v1 namespaces are inconsistent (`/api/v1/…` vs `/v1/ai/…`). |
| **Input validation** | **5 of 53 body-accepting routes are schema-validated (9.4 %)**; **52 raw `req.body` reads**. Zod is imported in exactly 3 non-test server files (`server.js:101`, `aiPublicApiRoutes.js:40`, `api/v1/routes.js:45`). |
| **Error contract** | Central handler exists (`server.js:5985-6034`) and mints an `errorId` (`:6013`). But **5 distinct JSON error shapes + 7 non-JSON responses**; **`code` is present on only 38 of 247** 4xx/5xx bodies; and casing is split — `SCREAMING_SNAKE` in marketplace (`:5282`) vs `lower_snake` in projects/v1 (`server/errors.js:29`). **A client cannot switch on `code`.** `server.js:1010` returns prose that **names environment variables** (`'No AI upstream configured: set CF_WORKER_URL or ANTHROPIC_API_KEY'`). 91 `res.status(500)` sites total. |
| **Rate limiting** | Applied (`express-rate-limit`, `server/rateLimiter.js`), **not** `@pryzm/rate-limit` (0 hits in `server/` or `server.js`). ⛔ **`app.use('/api', globalLimiter)` at `server.js:374` does not cover `/marketplace/api/*`** — the path starts `/marketplace`. **All 12 marketplace routes have no limiter of any kind**, including the unauthenticated catalog, reviews and `revocations.json`. ⛔ `globalLimiter` and `apiLimiter` are **disabled outside production** — `skip: SKIP_IN_DEV` (`rateLimiter.js:58,74`; `SKIP_IN_DEV = () => !IS_PROD` at `:21`). |
| **Idempotency / concurrency** | **UNMEASURED on `server.js`** — I did not sweep it for `If-Match` / `Idempotency-Key` / 412. |
| **Observability** | **0 OTel spans on the HTTP path** (`grep -nE "opentelemetry|getTracer|startSpan" server.js` → 0). `server/telemetry.js:41-42` no-ops unless `PRYZM_TRACING` is set; the OTLP block (`:48-110`) registers only a `BatchSpanProcessor` with **no HTTP auto-instrumentation**, and `@opentelemetry/sdk-node` is **not installed** (`:104-108` documents this). **0 request-IDs** — `grep -inE "requestId|x-request-id|correlationId" server.js` → 0. No `morgan`/`pino`/`winston`. The only correlation key is the `errorId` minted **at failure time**, so successful requests and multi-hop failures cannot be correlated. |
| **CORS** | `server.js:370-371` + `server/corsPolicy.js`. In production with `ALLOWED_ORIGIN` unset, `getAllowedOrigins()` returns `[]` — **deny-all cross-origin** (`corsPolicy.js:35-41`). With it set, it is a **static env allowlist** with `credentials: true` (`:51-59`): no dynamic origin callback, no per-client registration, so every third-party origin must be hand-added and the server restarted. **`Access-Control-Allow-Origin: *` can never be emitted in production**, so even the public `GET /marketplace/api/plugins` is unreachable from an arbitrary browser origin. This is a partner-integration model, not a public API. ⚠ Whether the deployed instance sets `ALLOWED_ORIGIN` is **UNMEASURED** (runtime secret; `fly.toml:13` names it only in a comment). |
| **`GET /embed`** | `server.js:4967` — **unauthenticated**, `applyEmbedHeaders(res)` strips `X-Frame-Options` and sets `frame-ancestors *` so *"any third-party site can embed this route in an iframe"* (`:4974`), and it takes `?token=` in the **query string** (`:4969`) — a JWT in a URL, which lands in referrer headers, proxy logs and browser history. `x-internal-secret` — the header gating `/api/auth/set-plan` — is in the CORS `allowedHeaders` list (`corsPolicy.js:56`). |

### §5.9 — Two rival marketplace front-ends

`apps/marketplace` (React/TSX; scripts `dev,build,preview`) and `apps/marketplace-web` (vanilla;
scripts `dev,build,preview,test,test:watch,typecheck`) both target the same `/marketplace/api` base
(`apps/marketplace/src/api/client.ts:1`, `apps/marketplace-web/src/api/client.ts`). Both are
`private: true`. **Neither appears in `vite.config.ts` or in any workflow file.** This is C84 EI-9
(one answer per question) at the app layer, and it is recorded nowhere.

---

## §6 — Legacy inventory

| Item | Location | Still called in production? |
|---|---|---|
| `WallOpeningLegacyAdapterHandler` | `plugins/wall/src/handlers/CreateWallOpeningLegacyAdapter.ts:44`, registered at `handlers/index.ts:137` | **YES** — registered into the live bus via `registerWallHandlers`; `apps/editor/src/engine/initBusHandlers.ts:149` names it as the owner of the legacy `wall.createOpening` verb |
| 14 `commandManager.execute()` sites, all in `plugins/annotations` | §3.7 | **YES** — annotation tools are live (`annotations` has 55 external importers) |
| `plugins/family-editor` — `private:false`, v1.0.0, stub `activate()` | `plugins/family-editor/src/index.ts:24` | **NO** — 0 importers; exists to pass "K3-C Gate #1" |
| `plugins/render`, `plugins/dxf`, `plugins/export-pdf` — declared empty shells | own headers, "F-prereq.0" | `export-pdf` referenced once by `apps/export-worker/src/index.ts`; `render` and `dxf` **not at all** |
| `plugins/schedules` (2 833 LOC), `plugins/multiplayer` (969), `plugins/plan-view` (3 821 — reached only by `plugins/sheets`), `plugins/ifc-export` (6 004 — reached only by a bench + `ImportExportSlots.ts`) | §3.1–3.2 | **NO** for schedules/multiplayer; the others are reachable but not from the editor bootstrap |
| `plugins/ai-{generative,query,rules,voice}` — 253 LOC total, all declare `@pryzm/ai-host` and import nothing | package.json vs source (§3.4) | **NO** — 0 importers |
| `@pryzm/legacy-shim` | `packages/legacy-shim/` | **Not legacy** despite the name — reclassified 2026-08-12 (ADR-0323) as a deliberate lint fixture for `pryzm/no-raf`; zero-importer **by design**. Recorded so a future sweep does not delete it. |
| `apps/marketplace` vs `apps/marketplace-web` | §5 | Neither is built by any config I found |
| `apps/marketplace-api` | §4 preamble | **NO** — no Dockerfile, no fly.toml, absent from docker-compose |
| `pryzm/no-l7-direct-import`, `no-l7-boundary-violation`, `no-l7-allowlist-grow`, `no-direct-pryzm-in-plugins` | `packages/eslint-plugin-pryzm/src/index.js:60-77` | **NO** — 4 rules defined and exported, **none enabled** in `eslint.config.js` (§1.3) |
| **`packages/oauth2-pkce/`** | `packages/oauth2-pkce/src/index.ts` | **NO** — `grep -rl "@pryzm/oauth2-pkce"` over `apps/ packages/ server/ server.js` returns **only the file itself**. Dead, while `docs-site/api/auth.md` documents PKCE as the *sole* auth mechanism (§5.5) |
| **2 orphan Express routers, never mounted** | `server/jurisdiction/mucZoningProxy.js:456-457` (`mucRouter`), `server/jurisdiction/mucInstrumentProxy.js:495-496` (`mucInstrumentRouter`) | **NO** — `server/jurisdiction/index.js:224-225` registers the handlers directly instead; no mount exists for either router |
| **Zero-caller routes** — `GET /api/auth/plan` (`server.js:1822`), `GET /api/me/plan` (`:2850`), `POST /api/auth/set-plan` (`:1834`), `POST /api/import/dwg` (`:2676`) | `server.js` | **NO client caller** in `apps/`, `src/` or `plugins/`. `/api/auth/plan` and `/api/me/plan` are the same question asked twice, and **neither has a caller** |
| **`POST /api/ai/cache/lookup` + `/store`** (`server.js:1668`, `:1695`) | | Reached **only** via `packages/ai-host/src/AiResponseCache.ts` — no editor UI call site |
| **Duplicated project CRUD** — `server.js:2891/2972/3165/3236` `/api/projects` vs `server/api/v1/routes.js:482/495/512/538` `/api/v1/projects` | | **BOTH LIVE, neither deprecated.** `/api/projects` is called from 11 editor files; `/api/v1/projects` from 2 — and `apps/editor/src/ui/platform/ProjectHub.ts` calls **both**. This is C84 EI-9 on the most-used route family in the product. |
| **Duplicated AI surface** — 6× `/api/ai/*` advise/parse (`server.js:1085–1537`) vs `/v1/ai/{query,generate,validate}` (`server/aiPublicApiRoutes.js:318/327/336`) | | Both live; `/api/ai/*` from `apps/editor` + `packages/ai-host`, `/v1/ai/*` only from the undeployed `apps/api-gateway` and `plugins/ai-query/src/descriptor.ts` |
| **`GET /marketplace/api/plugins/:id/versions`** (`server.js:5158`) | | **LIVE but SYNTHETIC** — comment at `:5156` *"no separate versions table yet"*; always returns exactly one element built from the plugin row (`:5178-5186`) with `revokedAt` hardcoded `null` |
| **`REFERENCE_PLUGINS_SEED`** — 4 hardcoded plugins, every one `downloads: 0, rating: 5.0` | `server.js:~5030-5091`, served by `:5103` | **LIVE** — it is what `GET /marketplace/api/plugins` serves whenever `getPgPool()` is null |
| **Stale tables** | — | **None found.** All 8 referenced tables (`marketplace_plugins`, `plugin_publisher_keys`, `plugin_purchases`, `plugin_reviews`, `plugin_revocations`, `ai_response_cache`, `ai_usage`, `template_registry`) are created in `server/dbMigrate.js`. |

---

## §7 — What must close first, ranked

| # | Gap | Why it is ranked here |
|---:|---|---|
| **1** | **There is no credential an external developer can obtain** (§5.4) — no API key, no PAT, no OAuth2 authorization server; `packages/oauth2-pkce/` has zero consumers; the only path is a user's password for a 30-day **unscoped, full-account** JWT | Everything below is moot until this lands. It is also the whole of the founder's question. |
| **2** | **`apps/api-gateway`'s shipped bootstrap trusts `X-Test-Roles`/`X-Test-Scopes`** (`src/index.ts:73-81` + `auth-shim.ts:39-44`, run by `Dockerfile:68`) | Not merely "not ready" — *unsafe if used*. It ships in `pryzm-selfhost/docker-compose.yml`. Fix is one line: make `authShim` **required**, no default. Mitigated only by the fact that nothing deploys it. |
| **3** | **The published docs describe an API that does not exist** (§5.5) — `auth.md:7-10` declares OAuth2+PKCE "its sole authentication mechanism"; **0 of `openapi.yaml`'s 12 paths exist in production; 0 of production's 158 routes are documented** | This is worse than no docs. An integrator building against them fails at request one and cannot tell whether the fault is theirs. |
| **4** | **The SDK cannot be installed** (§2.3) — 12 `private:true` deps, raw `.ts` exports, no `dist` | A third-party developer's first command fails. Fix: build to `dist`, publish or bundle the 12, drop `private`. |
| **5** | **§1.3 — enable `pryzm/no-direct-pryzm-in-plugins`**, or delete the claim from C76 §1.1 and C07 §61 | A contract minted two days ago describes enforcement that does not exist. Either end state is fine; the *disagreement* is the defect. Enabling it today fails 173 imports — land it warn-with-baseline, and **fix the two wrong citations immediately**. |
| **6** | **`authMiddleware` is fail-open** (§5.3) — the gate's *"40 behind authMiddleware"* is not *"40 reject an anonymous caller"* | The green gate is easy to misread as "the write path is authenticated." Fix: add an arm that asserts each of the 40 also carries a per-route rejection. |
| **7** | **Security controls that fail open** (§5.6) — `revocations.json` returns an empty CRL when the DB is down and caches it for an hour; `purchase-status` → `false`; `reviews` → empty 200 | Failure and "nothing revoked" are the same value — §CONTEXT-DATA-HONESTY, on a security control. |
| **8** | **Marketplace bundle integrity** (§5.7) — SHA self-declared and never recomputed, manifest not checked against `PluginManifestSchema`, publisher-key check skipped with no DB, `canonicalJSONStringify` hand-copied and unpinned | The Ed25519 signing is real; these four make it attestation rather than proof. |
| **9** | **No spec↔implementation conformance gate**, and `@pryzm/api-spec` is imported by nothing (§4.1) | The spec is documentation, not a contract. 4 routes have already drifted undetected, and its tests never run. |
| **10** | **Error contract** — 5 shapes + 7 non-JSON on `server.js` with `code` on 38 of 247 bodies in two casing conventions (§5.8); 16 shapes and no correlation id on the gateway (§4 axis 5) | A client cannot switch on `code`, and there is no request id to quote in a support ticket. |
| **11** | **12 marketplace routes have no rate limiter at all** (§5.8) — `app.use('/api', globalLimiter)` does not match `/marketplace/api/*` | Unauthenticated, uncapped, publicly cacheable endpoints. |
| **12** | **11 element-family stores are ABSENT from the composed runtime** (§3.3) — 7/337 verbs proven | An API exposing `stair.*` or `roof.*` would expose verbs whose writes nothing can read back. |
| **13** | **Input validation 5/53 on the deployed surface (9.4 %)** (§5.8) | 52 raw `req.body` reads behind a public HTTP boundary. |
| **14** | **No idempotency, no `If-Match`/412** on the gateway (§4 axis 7); unmeasured on `server.js` | Every network retry duplicates an effect. |
| **15** | **0 HTTP spans, 0 request IDs, 0 structured logs on `server.js`** (§5.8); 0/16 files on the gateway (§4 axis 8) | Neither the founder nor an integrator can see what the API did. |
| **16** | **26 plugins have undeclared dependencies** (§3.4); **12 have zero importers** (§3.1) | Blocks extracting or publishing any plugin as a third-party reference. |

---

## §8 — NOT MEASURED (the honest register)

- **Whether the 40 `server.js` write routes that run `authMiddleware` also carry a per-route
  rejection.** §5.3 establishes that `authMiddleware` itself never 401s. The per-route gates
  (`_httpRequireAccess`, `requireBearer`, `requireSnapshot`) exist; **I did not check them
  route-by-route.** This is the largest single blank in this document and it sits directly under a
  green gate.
- **Idempotency / concurrency on `server.js`** — I swept the gateway for `If-Match` /
  `Idempotency-Key` / 412 and found zero; **I did not sweep `server.js`.** The 412 re-base the
  client hit today may be implemented there.
- **Whether the deployed instance sets `ALLOWED_ORIGIN`** (§5.8) — it is a runtime secret. If unset,
  production is deny-all cross-origin; if set, it is a static allowlist. Either way it is not a
  public API, but the two states differ.
- **Whether `@pryzm/sdk` has ever been published to npm** — I did not query the registry.
- **Whether the self-host Docker Compose bundle is used by any real customer** — unknown, and it
  determines whether gap #1 is theoretical or live.
- **CORS/CSP on `apps/api-gateway` / `apps/marketplace-api`** — no CORS middleware was found in
  either `app.ts`; I did not trace `pryzm-selfhost/nginx/editor.conf`.
- **The one-import discrepancy** between the gate's 173 SDK bypasses and my by-source scan's 172.
- **`plugins/annotations`' 16 932 LOC** — the single largest plugin and the worst bypasser; I ranked
  its imports but did not audit its internals.
- **Runtime behaviour of the `api-spec` SHA-256 pin** — I did not execute that suite.
- **`apps/component-editor`, `apps/cli`, `apps/docs-site`** — L7 apps in the neighbourhood of this
  domain that I did not open.
- **Cross-domain, named for whoever owns them:** the `@thatopen/components` restricted-import
  ratchet is at **117 / 113 and breached**, and 27 of those are `packages/core-app-model` — that is
  a packages-layer lane's finding, not mine. Likewise `check-verb-liveness`'s 214 UNKNOWN verbs
  belong to whoever owns the verb register (C69).

---

## §9 — Related

- `docs/02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md` — §61's CI-gate claim is false (§1.3)
- `docs/02-decisions/contracts/C76-PLATFORM-AND-API-SURFACE.md` — §1.1's enforcement claim is false (§1.3); §1.4 (two facades) and §1.5 (uncountable wildcard surface) are both confirmed by this reading
- `docs/02-decisions/contracts/C69-API-VERB-REGISTER.md` · `docs/04-reference/API-VERB-REGISTER.md`
- `tools/ga-gate/check-layer-boundaries.ts` · `check-l7-boundary.ts` · `check-verb-liveness.ts` · `check-write-route-auth.ts`
- `docs/04-reference/ISSUE-LOG.md` — rows **L-2700 … L-2721**
