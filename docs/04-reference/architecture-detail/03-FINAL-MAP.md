# PRYZM 2 — Final Architecture & Orchestration

> **Status**: ratified 2026-04-29.  Single-page synthesis of `06-PRYZM-IDENTITY-AND-RECOUNT`, `08-VISION`, `09-AS-IS-VS-TO-BE`, `10-MASTER-IMPLEMENTATION-PLAN-36M`, `12-BIM-2-AND-3-POST-GA-ROADMAP`, `01-TARGET-ARCHITECTURE`, `02-ORCHESTRATION`, `CONFLICT-ANALYSIS`, all 41 ratified ADRs (+ 4 queued: ADR-041..044), all 39 SPECs, and the 25 chunks under `phases/audits/PRYZM2-WIREUP-PLAN-S72/`.
>
> **Purpose**: this is the one document a new engineer reads to understand *how Pryzm 2 actually works end-to-end*. It is the canonical map: every layer, every package, every plugin, every app, every wire, and every life-cycle that runs across them.
>
> **What it is not**: it is not a replacement for the source documents above. It is a synthesis. When this doc disagrees with `06-PRYZM-IDENTITY` (Tier 1) or the `.pryzm` format spec, those win. When it disagrees with `08-VISION` (Tier 3), `08` wins. When it disagrees with an ADR, the ADR wins.
>
> **Companion docs**:
> - [`SUMMARY-IMPLEMENTATION-PLAN.md`](../02_PLAN/02-SUMMARY.md) — the 36-month + post-S72 wireup + post-GA roadmap on a single page.
> - [`PROCESS-TRACKER.md`](../03_STATUS/01-PROCESS-TRACKER.md) — the live status board (workflows, ADR queue, sub-phase tickbox, bench results, risk register, health snapshot).
> - [`PRYZM-3-CONVERGENCE-PLAN.md`](../02_PLAN/03-CONVERGENCE.md) — the one-way ratchet: how the PRYZM 1 + PRYZM 2 dual reality collapses into a single clean product called PRYZM 3, with day-1 acceptance checklist and the single command that proves it.

---

## §0  Reading order and authority

```
06-PRYZM-IDENTITY-AND-RECOUNT.md           ← Tier 1: what Pryzm IS (non-negotiable)
.pryzm format spec (packages/file-format/) ← Tier 2: wire-compatible artifact
08-VISION.md                                ← Tier 3: 8 P / 8 L (+L7.5) / 10 D / NFTs
10-MASTER-IMPLEMENTATION-PLAN-36M.md  +  phases/PHASE-*.md  +  12-BIM-2-AND-3 ← Tier 4
00..05, 07, 09, 11-FILE-STRUCTURE, 11-GAP-CLOSURE, CONFLICT-ANALYSIS         ← Tier 5
adrs/ADR-001..044   +   specs/SPEC-01..48 + SPEC-FAMILY-EDITOR               ← Tier 6
audits/* and phases/audits/* (chunks 01–25)                                  ← Tier 7
00_Contracts/ legacy (survives only where CONFLICT §3/§4 say)                ← Tier 8
THIS DOC                                                                      ← synthesis
```

This doc never overrides anything above; it summarises everything below.

---

## §1  The frame — what Pryzm 2 *is* in one paragraph

Pryzm 2 is a browser-native BIM editor that **preserves the white PRYZM 1 UI verbatim** (220 files in `src/ui/`, ~96.6K LOC, zero pixel changes) while replacing everything underneath it with a typed, layered, headless-capable, plugin-extensible architecture. The new architecture is composed of **44 packages** (the layered runtime), **38 plugins** (12 element families + 5 importers/exporters + 5 AI plugins + 16 view/selection/layout/annotation plugins — `floor` is the only one still missing scaffolding, queued at sub-phase E.6.0), and **12 apps** (editor shell, sync server, AI worker, bake worker, headless CLI, marketplace, docs site, bench harness, …). The whole thing is wired by **one composition root** — `composeRuntime()` — that returns a strongly-typed `PryzmRuntime` handle which the white UI binds to via vanilla TS adapters in `packages/ui/`. There is **no React migration**; the UI stays as it is.

---

## §2  The 8-layer (+L7.5) architecture — top-down

```
                                         ╔══════════════════════════════════════════════╗
                                         ║  L7  PRESENTATION (white UI — src/ui/)       ║
                                         ║  220 files · vanilla TS · 0 visual change    ║
                                         ║  bound via packages/ui/ adapter to RuntimeHandle
                                         ╚══════════════════════▲═══════════════════════╝
                                                                │ runtime.bind(uiRoot)
                                                                │
   ╔════════════════════════════════════════════════════════════╧════════════════════════╗
   ║  L7.5  AI ORCHESTRATION  (above L5–L7 — propose/approve/apply, not "another layer") ║
   ║  packages/ai-host · ai-cost · ai-spend · apps/ai-worker                             ║
   ║  plugins/ai-floorplan · ai-generative · ai-query · ai-rules · ai-voice              ║
   ║  · NEVER mutates state directly · always emits Commands through L4 approval queue   ║
   ║  · cost meter, prompt pinning, BYOK custody (ADR-038), spend limits (ADR-014)       ║
   ╚════════════════════════════════════════════════════════════▲════════════════════════╝
                                                                │ proposes → approval queue
                                                                │ approved → enters as L4 Command
   ╔════════════════════════════════════════════════════════════╧════════════════════════╗
   ║  L6  PLUGIN SDK & CONTRIBUTION SURFACE                                              ║
   ║  packages/plugin-sdk · drawing-primitives · family-runtime · family-loader          ║
   ║  · 38 plugins contribute Tools, Commands, Producers, Renderers, Panels, Schedules   ║
   ║  · sandboxed (ADR-009) · marketplace-distributable (apps/marketplace-*)             ║
   ╚════════════════════════════════════════════════════════════▲════════════════════════╝
                                                                │
   ╔════════════════════════════════════════════════════════════╧════════════════════════╗
   ║  L5  VIEW STATE & VISIBILITY-INTENT  (the verbatim PRYZM 1 system, re-housed)       ║
   ║  packages/view-state · visibility · picking · stores                                ║
   ║  · 11-wave VI engine (ADR-015 places L4/L5/L7 split)  · per-element soft-locks      ║
   ║  · selection-state, hover, camera, view tabs, cut planes, isolation                 ║
   ╚════════════════════════════════════════════════════════════▲════════════════════════╝
                                                                │
   ╔════════════════════════════════════════════════════════════╧════════════════════════╗
   ║  L4  COMMAND BUS & DOMAIN  (CQRS write-side)                                        ║
   ║  packages/command-bus · schemas · types-builtin · constraint-solver · expr-eval     ║
   ║  · formula-library · family-instance                                                ║
   ║  · 264 Command handlers · ULID-stamped · MessagePack-encoded events (ADR-004)       ║
   ║  · property-tested replay determinism (SPEC-11)                                     ║
   ╚════════════════════════════════════════════════════════════▲════════════════════════╝
                                                                │ Patch[] from handlers
                                                                │
   ╔════════════════════════════════════════════════════════════╧════════════════════════╗
   ║  L3  PERSISTENCE & SYNC  (the .pryzm format + multi-user)                           ║
   ║  packages/persistence-client · sync-client · file-format · storage-driver           ║
   ║  · protocol · legacy-shim                                                           ║
   ║  · event log + CRDT bridge (ADR-002) · MessagePack wire (ADR-004) · R2 (ADR-003)    ║
   ║  · soft-lock semantics (ADR-019) · migration & rollback (SPEC-27)                   ║
   ╚════════════════════════════════════════════════════════════▲════════════════════════╝
                                                                │ snapshots/chunks/baked refs
                                                                │
   ╔════════════════════════════════════════════════════════════╧════════════════════════╗
   ║  L2  GEOMETRY KERNEL  (pure functions, no THREE, no DOM)                            ║
   ║  packages/geometry-kernel · scene-committer                                         ║
   ║  · MaterialDescriptor · GeometryIR · BoundingVolume                                 ║
   ║  · per-element robustness budget (ADR-020) · runs in workers (Comlink-wrapped)      ║
   ╚════════════════════════════════════════════════════════════▲════════════════════════╝
                                                                │ committed scene deltas
                                                                │
   ╔════════════════════════════════════════════════════════════╧════════════════════════╗
   ║  L1  RENDER RUNTIME  (the single canvas, the single rAF owner)                      ║
   ║  packages/renderer · render-runtime · frame-scheduler · engine-router               ║
   ║  · WebGPU primary, WebGL2 fallback (ADR-006) · three.js 0.183 pinned (ADR-025)      ║
   ║  · ONE rAF · ONE canvas · 58 legacy rAF owners → 1 by Phase G (ADR-023)             ║
   ╚════════════════════════════════════════════════════════════▲════════════════════════╝
                                                                │
   ╔════════════════════════════════════════════════════════════╧════════════════════════╗
   ║  L0  PLATFORM PRIMITIVES  (env, transports, observability, security)                ║
   ║  packages/api-spec · api-rbac · oauth2-pkce · rate-limit · webhooks · perf-budgets  ║
   ║  · feature-flags · admin-overrides · crash-reporter · wcag-audit · email-transport  ║
   ║  · beta-signup · ai-host (substrate) · OTel + Tempo (ADR-007)                       ║
   ╚═════════════════════════════════════════════════════════════════════════════════════╝
```

**Key invariants** (enforced by ESLint `eslint-plugin-boundaries` + the §23.x cross-doc invariants block in `pnpm ga-gate`):
- A higher layer may import a lower layer.  A lower layer **may not** import a higher layer.
- L7.5 (AI) is the **only** layer that may sit above L5/L6/L7 simultaneously, and it may **never** mutate state — it can only emit Commands through the L4 approval queue.
- L1 owns the **single** rAF and the **single** canvas.  No other layer owns either.  Any library that wants its own rAF (Cesium / OBC) is rAF-quarantined per ADR-023.
- L7 (the white UI) communicates with everything below it only through the `PryzmRuntime` handle (§6).  No layer imports `src/ui/` ever.

---

## §3  The complete folder structure (S72 D0 reality)

```
3d-view-app/                              (the Replit project root)
├── src/                                  ← PRYZM 1, intact
│   ├── ui/                               220 files · ~96.6K LOC · ZERO PIXEL CHANGES
│   │   ├── components/                   white-themed React components
│   │   ├── hooks/                        hooks bound to PryzmRuntime via packages/ui/
│   │   ├── pages/                        landing · auth · projects · editor · marketplace
│   │   └── theme/                        the white identity (immutable)
│   └── (everything else in src/)         ← legacy, deleted gradually across Phase G S82–S84
│                                            see chunk 24 §24.1 for the 36-folder cut list
│
├── packages/                             ← THE LAYERED RUNTIME (44 packages)
│   ├── L0  Platform primitives
│   │   ├── api-spec/                     OpenAPI source · runtime contract
│   │   ├── api-rbac/                     role/permission matrix · ADR-011
│   │   ├── oauth2-pkce/                  browser auth · ADR-021
│   │   ├── rate-limit/                   token-bucket · per-tier
│   │   ├── webhooks/                     outbound delivery · retries
│   │   ├── perf-budgets/                 17 NFT bench targets · ADR-007
│   │   ├── feature-flags/                PRYZM_NEW_ARCH=on|off per primitive
│   │   ├── admin-overrides/              ops-only · audit-logged
│   │   ├── crash-reporter/               sourcemapped · privacy-filtered
│   │   ├── wcag-audit/                   AA pass-gate · CI-enforced
│   │   ├── email-transport/              transactional only
│   │   └── beta-signup/                  alpha/beta intake
│   │
│   ├── L1  Render runtime
│   │   ├── renderer/                     three.js 0.183 pinned · ADR-022 + ADR-025
│   │   ├── render-runtime/               worker pool host · backend abstraction
│   │   ├── frame-scheduler/              THE single rAF owner · idle continuation budget
│   │   └── engine-router/                WebGPU/WebGL2 routing · ADR-006
│   │
│   ├── L2  Geometry kernel
│   │   ├── geometry-kernel/              pure producers · MaterialDescriptor · IR
│   │   └── scene-committer/              kernel result → THREE scene deltas
│   │
│   ├── L3  Persistence & sync
│   │   ├── persistence-client/           manifest fetcher · range-request reader
│   │   ├── sync-client/                  Yjs-over-MessagePack · soft-locks
│   │   ├── file-format/                  .pryzm spec authority · validators
│   │   ├── storage-driver/               R2 adapter · pluggable backends
│   │   ├── protocol/                     codecs · ULID · envelopes
│   │   └── legacy-shim/                  PRYZM 1 importer · v5 JSON → event log
│   │
│   ├── L4  Command bus & domain
│   │   ├── command-bus/                  264 handlers · property-tested
│   │   ├── schemas/                      Zod-style schemas · IFC mapping (SPEC-13)
│   │   ├── types-builtin/                system catalog (Wall/Slab/Roof/Beam/…)
│   │   ├── constraint-solver/            SPEC-48 · ADR-024
│   │   ├── expr-eval/                    safe formula evaluator
│   │   ├── formula-library/              SPEC-27 catalogue · 14+10 built-ins
│   │   └── family-instance/              instance vs type parameter resolver
│   │
│   ├── L5  View state & visibility
│   │   ├── view-state/                   tabs · cameras · cut planes
│   │   ├── visibility/                   11-wave VI engine · ADR-015
│   │   ├── picking/                      hit-testing · selection-set algebra
│   │   └── stores/                       27 typed stores · zero global state
│   │
│   ├── L6  Plugin SDK
│   │   ├── plugin-sdk/                   contribution interfaces · sandbox · ADR-009
│   │   ├── drawing-primitives/           shared primitives for plugins
│   │   ├── family-runtime/               loaded family execution
│   │   └── family-loader/                family discovery · validation
│   │
│   ├── L7  UI bridge
│   │   └── ui/                           vanilla TS adapter · binds src/ui/ ↔ runtime
│   │
│   └── L7.5  AI substrate
│       ├── ai-host/                      LLM-agnostic host · prompt pinning
│       ├── ai-cost/                      $/token meter · per-tenant
│       └── ai-spend/                     spend limits · ADR-014
│
├── plugins/                              ← 38 PLUGINS
│   ├── 12 element families (1 missing — `floor` queued at E.6.0)
│   │   wall · slab · roof · beam · column · door · window · stair
│   │   curtain-wall · ceiling · handrail · furniture
│   │
│   ├── 5 importers/exporters
│   │   ifc-import · ifc-export · ifc-inspector · rhino-import · bcf
│   │
│   ├── 5 AI plugins (all run through L7.5 host)
│   │   ai-floorplan · ai-generative · ai-query · ai-rules · ai-voice
│   │
│   └── 16 view/selection/layout/annotation
│       view · plan-view · section-view · selection · grid · cross
│       annotations · dimensions · schedules · sheets · rooms
│       lighting · plumbing · structural · multiplayer · toy-cube
│
├── apps/                                 ← 12 APPS
│   ├── editor/                           the white-UI shell host (binds src/ui/)
│   ├── sync-server/                      Yjs WebSocket + soft-lock TTLs
│   ├── ai-worker/                        LLM gateway · BYOK · ADR-038
│   ├── bake-worker/                      offline geometry baking → R2 chunks
│   ├── api-gateway/                      REST/RPC entry · OpenAPI from packages/api-spec
│   ├── marketplace-api/                  plugin registry (Phase 4)
│   ├── marketplace-web/                  plugin storefront (Phase 4)
│   ├── component-editor/                 family/component authoring sub-app
│   ├── headless/                         @pryzm/headless · CI/CD-callable
│   ├── cli/                              @pryzm/cli · scripting · automation
│   ├── docs-site/                        public docs
│   └── bench/                            load-bench harness · 17 NFT gates
│
├── docs/archive/pryzm3-internal/             ← THE CORPUS (this doc lives here)
│   ├── 06-PRYZM-IDENTITY-AND-RECOUNT.md  Tier 1
│   ├── 08-VISION.md                      Tier 3
│   ├── 10-MASTER-IMPLEMENTATION-PLAN-36M.md
│   ├── 12-BIM-2-AND-3-POST-GA-ROADMAP.md
│   ├── adrs/ADR-001..ADR-044             44 ratified/queued
│   ├── specs/SPEC-01..SPEC-48 + SPEC-FAMILY-EDITOR
│   ├── phases/PHASE-1A..PHASE-3D-S65/
│   └── phases/audits/PRYZM2-WIREUP-PLAN-S72/
│       └── 00..25 (24 + 25 are the cross-audits)
│
└── docs/operations/                      v2 candidate cuts (ADR-018 Tier 1/2/3)
```

---

## §4  Architecture files per layer (the canonical contracts)

| Layer | Canonical contract file | Owner package | Authority |
|---|---|---|---|
| L0 | `packages/api-spec/src/openapi.yaml` | api-spec | ADR-021, SPEC-15 |
| L0 | `packages/perf-budgets/src/budgets.ts` | perf-budgets | 17 NFTs from `08-VISION §6` |
| L1 | `packages/frame-scheduler/src/Scheduler.ts` (the **single** rAF) | frame-scheduler | ADR-022, ADR-023, ADR-025 |
| L1 | `packages/render-runtime/src/RuntimeBackend.ts` | render-runtime | ADR-022 Part B |
| L2 | `packages/geometry-kernel/src/Producer.ts` (`produce<T>(dto, ctx) → IR`) | geometry-kernel | SPEC-01, ADR-020 |
| L2 | `packages/scene-committer/src/Committer.ts` | scene-committer | SPEC-21 |
| L3 | `packages/file-format/spec.md`  +  `…/Codec.ts` | file-format | Tier 2 authority + ADR-004 |
| L3 | `packages/persistence-client/src/Manifest.ts` + `EventReader.ts` | persistence-client | SPEC-02, ADR-013 |
| L3 | `packages/sync-client/src/SyncSession.ts`  +  `SoftLock.ts` | sync-client | SPEC-03, ADR-002, ADR-019 |
| L4 | `packages/command-bus/src/Command.ts`  +  `Handler.ts` | command-bus | SPEC-21 (10 steps) |
| L4 | `packages/schemas/src/index.ts`  +  IFC map | schemas | SPEC-13 |
| L4 | `packages/types-builtin/src/Catalog.ts` | types-builtin | ADR-017 |
| L5 | `packages/visibility/src/VIEngine.ts` (the 11 waves) | visibility | ADR-015, SPEC-FAMILY-EDITOR |
| L5 | `packages/stores/src/store.ts` (typed store contract) | stores | SPEC-24 |
| L6 | `packages/plugin-sdk/src/Contribution.ts` | plugin-sdk | ADR-009, SPEC-09 |
| L6 | `plugins/<each>/plugin.json`  +  `index.ts` (manifest + entry) | each plugin | SPEC-09 |
| L7 | `packages/ui/src/RuntimeBinding.ts` | ui | ADR-026 (vanilla TS, Path A) |
| L7 | `src/ui/**` (untouched) | n/a | `06-PRYZM-IDENTITY §1` |
| L7.5 | `packages/ai-host/src/AIHost.ts` | ai-host | ADR-014, SPEC-07, SPEC-28 |
| L7.5 | `packages/ai-host/src/ApprovalQueue.ts` | ai-host | ADR-014 |

Every contract above has at least one property test (SPEC-11).  Every contract has at least one OTel span (ADR-007).

---

## §5  The composition root — `composeRuntime()`

There is exactly **one** entry point that wires all 8 layers together.  It lives in `apps/editor/src/composeRuntime.ts`.  Sub-apps (`apps/headless`, `apps/cli`, `apps/component-editor`) each re-use it with overrides for the surfaces they don't need.

```ts
// apps/editor/src/composeRuntime.ts  (signature only — see Phase A S73)
export interface ComposeOptions {
  // L0
  env: 'browser' | 'node' | 'worker';
  flags: FeatureFlagSource;
  otel: TelemetryConfig;

  // L1
  renderBackend: 'webgpu' | 'webgl2' | 'auto';
  canvas?: HTMLCanvasElement;          // omitted in headless

  // L3
  storage: StorageDriver;              // R2 / S3 / local
  syncEndpoint?: string;               // omitted in single-user

  // L6
  plugins: PluginManifest[];           // discovered or explicit
  sandbox: SandboxPolicy;              // ADR-009

  // L7
  ui?: UIRoot;                          // omitted in headless / CLI

  // L7.5
  ai?: { host: AIHostConfig; cost: CostBudget; spend: SpendLimits };
}

export async function composeRuntime(opts: ComposeOptions): Promise<PryzmRuntime>;
```

The function performs **one** ordered wiring (this is the only place dependencies cross layers explicitly):

```
1. Boot L0          → telemetry, flags, perf budgets, RBAC, rate limits
2. Boot L1          → frame scheduler claims the single rAF · render-runtime spawns worker pool
3. Boot L2          → geometry-kernel producers registered into worker pool
4. Boot L3          → persistence-client opens manifest · sync-client opens session (if endpoint)
5. Boot L4          → command-bus loads 264 handlers · schemas registered · types-builtin loaded
6. Boot L5          → stores hydrated from persistence · VI engine warmed · view-state restored
7. Boot L6          → plugin-sdk discovers manifests · loads sandboxes · contributes Tools/Cmds/Producers/Renderers/Panels/Schedules
8. Boot L7.5        → ai-host wired · approval queue subscribed to L4 inbox · cost meter armed
9. Boot L7          → packages/ui binds src/ui/ to runtime via RuntimeBinding · UI hydrates
10. Returns         → typed PryzmRuntime handle
```

Each step has a **kill-switch** named in `02-ORCHESTRATION §1.1` (K1A-1..3, K1B-1..3, K1C-1..3, K1D-1..3 in PHASE-1; equivalents in PHASE-2/3).  If any step fails, the runtime returns a `RuntimeError` with the failed step ID and the prior steps' resources are torn down in reverse order.

---

## §6  The `PryzmRuntime` typed handle (the only thing L7 sees)

```ts
export interface PryzmRuntime {
  // L4 entry — the only way to mutate state
  command: {
    dispatch<C extends Command>(c: C): Promise<CommandResult>;
    canDispatch<C extends Command>(c: C): boolean;     // RBAC + soft-lock + schema checks
    inFlight: Set<CommandId>;
  };

  // L5 read — typed access to stores; never returns `any`
  stores: TypedStores;                                 // generated from L4 schemas
  selection: SelectionAPI;
  view: ViewAPI;
  visibility: VisibilityAPI;

  // L3 — explicit, never implicit
  persistence: { save(): Promise<void>; load(id): Promise<void>; export(fmt): Promise<Blob> };
  sync:        { presence: PresenceAPI; locks: SoftLockAPI; status: SyncStatusSignal };

  // L6 — plugin contributions, read-only from L7's POV
  contributions: { tools: Tool[]; panels: Panel[]; commands: CommandSpec[]; ... };

  // L7.5 — propose, never mutate
  ai: {
    propose(intent: AIIntent): Promise<ProposalId>;
    queue: ApprovalQueueAPI;                           // L7 renders this; user clicks accept/reject
    cost: CostMeterAPI;
  };

  // L0 — observability + lifecycle
  telemetry: TelemetryAPI;
  flags: FeatureFlagAPI;
  dispose(): Promise<void>;
}
```

**Invariant**: `src/ui/**` may import **only** `import type { PryzmRuntime } from '@pryzm/ui'` and the runtime instance passed at boot.  Any other cross-layer import fails the lint gate (`pryzm-no-window-any` + `eslint-plugin-boundaries`).

---

## §7  Request flow — life of one user gesture

The canonical example: **the user drags a wall endpoint by 200 mm**.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│  L7  src/ui/ MouseDown / MouseMove / MouseUp on wall endpoint handle              │
│      → DOM event captured by PryzmRuntime UI binding                              │
└──────────────────────────────────┬────────────────────────────────────────────────┘
                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│  L6  plugins/wall/tools/MoveEndpointTool.ts                                       │
│      → translates UI event into intent · hit-tests · constructs draft transform   │
└──────────────────────────────────┬────────────────────────────────────────────────┘
                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│  L5  packages/picking · packages/visibility                                       │
│      → confirms wall is selectable · not soft-locked by another user              │
│      → packages/visibility wave 6/11 verifies the endpoint is not hidden          │
└──────────────────────────────────┬────────────────────────────────────────────────┘
                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│  L4  packages/command-bus · WallUpdateCommand handler                             │
│      → schema-validates · RBAC-checks · acquires soft-lock (TTL 30 s)             │
│      → calls constraint-solver (ADR-024) for joins/openings/dimension chains      │
│      → produces Patch[] · stamps ULID · MessagePack-encodes event                 │
└──────────────────────────────────┬────────────────────────────────────────────────┘
                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│  L3  packages/persistence-client (event log append)                               │
│      packages/sync-client (Yjs broadcast to peers + server)                       │
│      → server persists event · echoes to peers · soft-lock confirmed              │
└──────────────────────────────────┬────────────────────────────────────────────────┘
                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│  L2  packages/geometry-kernel · produceWallGeometry(dto, ctx) in worker           │
│      → pure function · returns GeometryIR{positions, indices, materials, bbox}    │
│      packages/scene-committer applies delta to THREE scene                        │
└──────────────────────────────────┬────────────────────────────────────────────────┘
                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│  L1  packages/frame-scheduler  →  one rAF tick                                    │
│      packages/renderer  →  WebGPU / WebGL2 draw                                   │
└──────────────────────────────────┬────────────────────────────────────────────────┘
                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│  L7  src/ui/ re-renders side panels (length / area / room totals) reactively      │
│      via stores subscription · NO direct DOM mutation                             │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Latency budget** (per ADR-007 + perf-budgets): from `MouseUp` to first frame containing the moved endpoint is **≤ 80 ms p95** at the medium-fixture scale (1 K walls).  Each layer has its own OTel span; `pnpm bench` regression-checks this on every PR.

---

## §8  Data flow — patches → events → CRDT → R2

```
                       ┌──────────────────────────────────┐
                       │ L4  Patch[]  (in-memory delta)   │  produced by Handler
                       └──────────────┬───────────────────┘
                                      ▼ ULID + MessagePack
                       ┌──────────────────────────────────┐
                       │ L3  Event  (immutable, ordered)  │  one per dispatched Command
                       └──────────────┬───────────────────┘
                       ┌──────────────┴───────────────────┐
                       ▼                                  ▼
             ┌──────────────────┐               ┌────────────────────┐
             │ Local IndexedDB  │               │ Yjs CRDT doc       │
             │  event log       │               │ ↔ sync-server      │
             └─────────┬────────┘               └─────────┬──────────┘
                       │                                  │
                       │           ┌──────────────────────┘
                       ▼           ▼
              ┌──────────────────────────┐
              │ snapshot every N events  │
              │ → MessagePack snapshot   │
              └─────────────┬────────────┘
                            ▼
              ┌──────────────────────────────────┐
              │ apps/bake-worker (offline)       │
              │ → produce per-level glTF+Draco   │
              │ → upload chunks to R2 (ADR-003)  │
              └─────────────┬────────────────────┘
                            ▼
                  ┌──────────────────┐
                  │ R2 object store  │   manifest.json + chunks/*.glb + events/*.bin
                  └──────────────────┘
                            ▲
                            │ on warm load: range-read manifest + active level chunk
                            │              + tail event segment
                  ┌─────────┴─────────┐
                  │ L3 PersistenceCli │
                  └───────────────────┘
```

**ADR-002 bridge rule**: the event log is the **source of truth**; the Yjs CRDT is a **transport and conflict-resolver**.  Snapshots are derivative and rebuildable from any point in the event log.  R2 chunks are derivative of snapshots.

---

## §9  Threading topology

```
─── BROWSER PROCESS ────────────────────────────────────────────────────────────────
  Main thread (UI)
    ├── frame-scheduler (THE rAF — ADR-023)
    ├── packages/ui adapter
    ├── src/ui/ React render
    ├── command-bus dispatch
    └── stores subscriptions (typed signals)

  Worker pool (size = hardwareConcurrency - 1, ADR-005)
    ├── geometry-kernel workers   × N
    ├── persistence chunk workers × 1–2
    ├── ai-host orchestrator      × 1 (proxies to apps/ai-worker over WebSocket)
    └── crash-reporter sink       × 1

─── SERVER PROCESSES (per tenant region — ADR-037) ─────────────────────────────────
  apps/sync-server      Yjs WebSocket + soft-lock TTL daemon (ADR-019, ADR-021)
  apps/ai-worker        LLM gateway (BYOK custody — ADR-038); cost meter persists to PG
  apps/bake-worker      consumes "snapshot ready" → produces R2 chunks
  apps/api-gateway      REST/RPC entry · OpenAPI from packages/api-spec · feeds UI
  apps/marketplace-api  plugin registry (Phase 4 / post-GA)

─── INFRASTRUCTURE ─────────────────────────────────────────────────────────────────
  Postgres              event log shadow · soft-lock TTL · audit log · billing
  R2                    snapshots + chunks + assets
  OTel/Tempo            traces + metrics (ADR-007)
```

---

## §10  Deployment topology (per ADR-012, ADR-021, ADR-031, ADR-037)

```
                   ┌─────────────────────────────────────────────┐
                   │ Browser (the user's machine — the editor)   │
                   │ apps/editor + src/ui/ + packages/* + plugins│
                   └─────────────┬───────────────────────────────┘
                                 │ HTTPS / WSS  (mTLS at proxy)
                                 ▼
        ┌───────────────────────────────────────────────────────────────┐
        │ Edge / Region (default: closest to tenant — ADR-037)          │
        │  ├── apps/api-gateway       REST + RPC                        │
        │  ├── apps/sync-server       Yjs WS (sticky session)           │
        │  ├── apps/ai-worker         LLM gateway · BYOK · spend caps   │
        │  ├── apps/bake-worker       offline glTF/Draco baking         │
        │  └── apps/marketplace-api   plugin registry (Phase 4)         │
        └───────────────────┬─────────────────────────┬─────────────────┘
                            ▼                         ▼
                ┌──────────────────────┐  ┌───────────────────────────┐
                │ Postgres (per region)│  │ R2 / S3 / on-prem object  │
                │ event log shadow     │  │ snapshots · chunks · BLOBs│
                │ soft-lock TTL        │  │                           │
                │ audit log · billing  │  │                           │
                └──────────────────────┘  └───────────────────────────┘

  Self-host minimum (ADR-012): one box, docker-compose with all five apps + PG + MinIO.
  Enterprise (ADR-021):       SSO (SAML/OIDC) + SCIM + audit-log streaming + BYOK.
```

`apps/headless` and `apps/cli` are deployable wherever Node 20 runs — CI/CD, scheduled jobs, on-prem builds.  Both bind the same `composeRuntime()` with `env: 'node'` and `ui: undefined`.

---

## §11  Boot sequence (cold load)

```
T0     User navigates to /editor/<projectId>
T0+10  apps/editor bootstrap fetches /api/projects/:id/manifest
T0+30  composeRuntime() begins:
         L0  telemetry + flags fetched (parallel)
         L1  frame-scheduler claims rAF · render-runtime spawns worker pool
         L2  geometry-kernel registered in workers
         L3  persistence-client opens manifest · sync-client opens WS (parallel)
T0+200 first chunk (active level) downloaded from R2
T0+250 L4 loads handlers (lazy — only those needed for active level's element types)
T0+300 L5 hydrates stores from active-level chunk
T0+400 L6 plugin sandbox loads (installed plugins only — marketplace ones lazy)
T0+450 L7.5 ai-host spawns approval queue worker
T0+500 L7  packages/ui binds src/ui/ to runtime · React hydrates
T0+800 first paint (medium fixture)  — gate: ≤ 1 s p95 (ADR-007 + 04-PRODUCTION-PARITY §5)
T0+1500 background event-log tail catches up; remaining levels stream in idle frames
```

**Warm load** (project re-opened within session): T0 → first paint **≤ 200 ms** because manifest, chunks, and event log are already in the persistence-client cache; only L7 re-binds.

---

## §12  Edit sequence (single-user)

```
1. UI gesture (§7 above)              MouseDown→MouseMove→MouseUp
2. Plugin tool builds intent          plugins/wall/tools/MoveEndpointTool.ts
3. Command dispatched                 runtime.command.dispatch(WallUpdate{...})
4. Handler validates + locks          schema · RBAC · soft-lock acquired
5. Constraint solver runs             joins/openings/dimensions resolved
6. Patch[] emitted                    pure delta description
7. Event logged + appended            ULID · MessagePack · IndexedDB
8. Stores updated                     L5 reactive subscribers fire
9. Geometry kernel re-bakes element   in worker · pure · returns IR
10. Scene committer applies delta     THREE meshes swapped in place
11. Frame scheduler ticks             one rAF · one draw
12. UI side panels reactively update  via store subscription · zero direct DOM
```

End-to-end p95 budget: **80 ms** at medium fixture scale.

---

## §13  Sync sequence (multi-user via Yjs over MessagePack)

```
User A dispatches WallUpdate                 User B (peer) is editing same project
─────────────────────────                    ───────────────────────────
  L4 handler emits Patch[]                          (idle, listening)
  L3 sync-client wraps in Yjs update
  ──────── WS frame ─────►  apps/sync-server
                              · validates token (RBAC)
                              · forwards to all peers
                              · persists event to PG (shadow)
                              · refreshes soft-lock TTL
                            ────────► User B
                                        · L3 sync-client receives
                                        · L4 reduces Patch[] into stores
                                        · L5 fires subscribers
                                        · L2 re-bakes affected element
                                        · L1 ticks
                                        · L7 side panels update (reactive)
  L3 ack received                                   (display change ≤ 200 ms p95)
```

**Soft-lock blast radius** (ADR-019): the lock covers the **single element** being edited (the wall), not the level, not the project.  TTL 30 s, refreshed on every dispatch.  If User B tries to edit the same wall, the L4 `canDispatch` check returns false and the UI surfaces a "User A is editing this wall" badge.

---

## §14  AI sequence (L7.5 — propose / approve / apply)

```
1. User opens AI panel                     src/ui/ panel reads runtime.ai.queue
2. User prompts (or speaks via ai-voice)   "add a 1.2 m corridor along the north wall"
3. UI calls runtime.ai.propose(intent)     L7.5 ai-host packages prompt + project context
4. Cost meter checks budget                ai-cost says OK · ai-spend deducts estimate
5. apps/ai-worker invokes LLM (BYOK)       prompt pinned · response schema-checked
6. Proposal returns as Command[]           NEVER as state mutation — Commands only
7. Approval queue surfaces in UI           src/ui/ shows diff preview of proposed Cmds
8. User clicks Approve                     queue.approve(proposalId) called
9. Approved Commands enter L4 dispatch     same path as any user gesture (§12)
10. Cost meter reconciles actual spend     ai-spend persists to PG
```

**Invariant** (ADR-014): step 6 — AI **never** writes to stores, **never** mutates events, **never** bypasses RBAC.  Every AI mutation is auditable as a normal user-dispatched Command, attributed to the AI agent via the actor field on the event envelope.

---

## §15  Bake / persistence sequence

```
Trigger:                                 Action:
──────────────────────────────────────   ─────────────────────────────────────
event-log length grows by 250 events  →  L3 persistence-client buffers
debounce 250 ms (ADR-010, per-element) →  flush snapshot delta
                                          send "bake-needed" message to apps/bake-worker
apps/bake-worker:
  · loads latest snapshot from R2
  · applies pending events (catch up)
  · re-bakes affected level(s) to glTF + Draco + Meshopt
  · uploads chunks/<level>.glb to R2
  · updates manifest.json (atomic swap via R2 conditional write)
  · records OTel span "bake.commit"
on next user load: persistence-client reads new manifest, fetches new chunk
```

**Authority**: the **event log is canonical**; chunks are derivative.  If a chunk is corrupted, it is discarded and re-baked from the events.  Migration & rollback semantics live in SPEC-27.

---

## §16  White UI binding contract (the most important invariant)

The white PRYZM 1 UI in `src/ui/` is **immutable** at the pixel level. The new architecture binds **behind** it via exactly one adapter:

```ts
// packages/ui/src/RuntimeBinding.ts   (signature only)
export function bindRuntime(uiRoot: UIRoot, runtime: PryzmRuntime): UnbindHandle;
```

Concretely:

| Old PRYZM 1 surface | New backing | How it's wired |
|---|---|---|
| `useStore(...)` hooks | `runtime.stores.<storeName>` | adapter exposes the same hook signature; backed by typed store |
| `dispatch({ type, payload })` | `runtime.command.dispatch(Command)` | adapter translates legacy actions → typed Commands via a generated mapping table |
| `useSelection()` | `runtime.selection` | identical signature |
| `useViewState()` | `runtime.view` | identical signature |
| direct Three.js access (legacy) | **forbidden** | lint rule `pryzm-no-three-in-ui` fails CI |
| `(window as any).foo` (769 sites) | **forbidden** | lint rule `pryzm-no-window-any` reduces to 0 by Phase G S84 |
| ad-hoc `requestAnimationFrame` | **forbidden** | lint rule `pryzm-no-raf` (only frame-scheduler may call rAF) |
| AI panels | `runtime.ai.queue` + `runtime.ai.propose(...)` | new propose/approve UX, identical white styling |

`apps/editor/src/main.ts` is the only file that calls both `composeRuntime()` and `bindRuntime()`.  Every other entry point (headless, CLI, component-editor) calls `composeRuntime()` with `ui: undefined` — the runtime works identically without a UI.

---

## §17  Plugin contribution flow (how the 38 plugins extend everything)

A plugin manifest declares its contributions; the SDK validates, sandboxes, and wires them into the right layers:

```
plugins/wall/plugin.json
{
  "id": "@pryzm/wall",
  "version": "1.0.0",
  "contributes": {
    "elementType":  "Wall",                          // → L4 schemas + types-builtin
    "producers":    ["produceWallGeometry"],         // → L2 geometry-kernel
    "tools":        ["DrawWallTool", "MoveEndpoint"],// → L6 tools surface (used by L7)
    "commands":     ["WallCreate", "WallUpdate", …], // → L4 command-bus
    "renderers":    ["WallRenderer"],                // → L1 via scene-committer
    "panels":       ["WallProperties"],              // → L7 panels area
    "schedules":    ["WallScheduleColumns"],         // → plugins/schedules consumes
    "ifc":          { "class": "IfcWall", "psets": […] }   // → plugins/ifc-export
  }
}
```

The plugin SDK enforces (ADR-009):
- No direct DOM access (sandboxed iframe + Comlink).
- No direct THREE access (must go through scene-committer).
- No `(window as any)`.
- No long-running CPU on main thread (must use worker).
- Capability-scoped permissions (read-only / write / network) declared in manifest.

---

## §18  Verification — how we know it actually works

`pnpm ga-gate` runs all of the following before any release tag is cut. **All must pass.**

| Group | Gate | Source |
|---|---|---|
| Boundaries | `eslint-plugin-boundaries` — no upward imports | `packages/*/eslint.config.js` |
| No casts | `pryzm-no-window-any` — 0 `(window as any)` in `src/ui/` | custom ESLint rule |
| One rAF | `pryzm-no-raf` — only frame-scheduler may call rAF | custom ESLint rule |
| Renderer parity | visual diff < 1 px MSE on N fixtures | `apps/bench/visual.ts` |
| Load bench | 17 NFTs from `08-VISION §6` | `apps/bench/loadbench.ts` |
| Replay determinism | random Cmd sequences → same state | `packages/command-bus/__tests__/replay.test.ts` |
| Round-trip | IFC import → export → import preserves all PSets | `plugins/ifc-export` workflow |
| Persistence | snapshot + events → identical state | `packages/persistence-client` workflow |
| VI parity | 11-wave engine matches PRYZM 1 results | `packages/visibility` workflow |
| BCF round-trip | issue export → import preserves viewpoints | `plugins/bcf` workflow |
| Family editor | quality-gates over the component-editor | `apps/component-editor/__tests__/quality-gates` |
| Cross-doc | §23.x invariants (chunk 25 §25.8.3) | `pnpm ga-gate` § cross-doc |

The 9 workflows currently configured in this Replit project are exactly the gates above.

---

## §19  The 36-month plan in one line per quarter

| Q | Months | Sprints | Theme | Exit gate |
|---|---|---|---|---|
| Q1 | M1–M3 | S01–S06 | Skeleton rails (PHASE-1A) | Composition root + 5 ref Cmds |
| Q2 | M4–M6 | S07–S12 | Headless geometry + walls (PHASE-1B) | Walls render new path identically |
| Q3 | M7–M9 | S13–S18 | Persistence + sync (PHASE-1C) | Cold load < 3 s medium fixture |
| Q4 | M10–M12 | S19–S24 | Bake worker + alpha (PHASE-1D) | Alpha gate — ADR-018 T1 cuts |
| Q5–Q6 | M13–M18 | S25–S36 | All element families (PHASE-2A/B) | 12/13 element types ship; floor at E.6.0 |
| Q7–Q8 | M19–M24 | S37–S48 | Drawing engine + AI L7.5 + Beta (PHASE-3A/B) | Beta gate — soft-locks live |
| Q9–Q10 | M25–M30 | S49–S60 | PDF-to-BIM + IFC cert + Component editor (PHASE-3B/C) | PDF-to-BIM moat live |
| Q11–Q12 | M31–M36 | S61–S72 | Constraint solver + lifecycle + GA (PHASE-3D) | GA — `pnpm ga-gate` green |
| **Post-S72 wireup** | M37–M40 | **S73-WIRE..S87-WIRE** | white-UI binding · 418 sub-phases · chunks 14–24 + chunk 25 G.32 | PRYZM 1 lights-out S84 D9 |
| **Post-GA roadmap** | M37+ | **S73-PG4..S144-PG8** | CDE · clash · MEP · COBie · 4D/5D · LCA · cloud baked · cert | per `12-BIM-2-AND-3` |

Sprint-ID disambiguation per chunk 25 §25.7:  `-WIRE` for the post-S72 white-UI wireup, `-PG4..PG8` for the post-GA roadmap phases — they run in parallel from M37.

---

## §20  Cross-references — where to dig deeper for each topic

| Want to know about… | Read |
|---|---|
| Why Pryzm 2 is identity-preserving | `06-PRYZM-IDENTITY-AND-RECOUNT.md` |
| The 8 principles, 17 NFTs, 10 differentiators | `08-VISION.md` |
| What old code dies and when | `09-AS-IS-VS-TO-BE.md` + chunk 24 |
| The 36-month sprint calendar | `10-MASTER-IMPLEMENTATION-PLAN-36M.md` + `phases/PHASE-*.md` |
| What ships AFTER GA | `12-BIM-2-AND-3-POST-GA-ROADMAP.md` |
| Composition root contract | `02-ORCHESTRATION.md` + this doc §5 |
| Strangler-fig migration policy | `02-ORCHESTRATION §1` |
| Single rAF + library quarantine | ADR-022, ADR-023, ADR-025 |
| Persistence + CRDT bridge | ADR-002, ADR-013, SPEC-02 |
| Visibility-Intent placement | ADR-015 + `packages/visibility` |
| AI as L7.5 (above the stack) | ADR-014, SPEC-07, SPEC-28 |
| Plugin sandbox & marketplace | ADR-009, SPEC-09, `apps/marketplace-*` |
| The white UI binding rule | this doc §16 + ADR-026 |
| Customer migration (PRYZM 1 → 2) | **ADR-044 (queued)** + chunk 25 §25.5 |
| Folder-level coverage proof | `phases/audits/PRYZM2-WIREUP-PLAN-S72/24-…` |
| Doc-level alignment proof | `phases/audits/PRYZM2-WIREUP-PLAN-S72/25-…` |
| All 11 §6 contradictions resolved | `CONFLICT-ANALYSIS.md §6` + chunk 25 §25.9 |
| Verification scripts | `phases/audits/…/23-verification-scripts.md` |

---

## §21  TL;DR — Pryzm 2 in seven sentences

1. The white PRYZM 1 UI in `src/ui/` is preserved verbatim — zero pixel changes — and binds to the new runtime through exactly one adapter (`packages/ui/`).
2. The new runtime is composed of 8 layers (L0–L7) plus L7.5 (AI orchestration above the stack), realised as 44 packages on disk, plus 38 plugins for element/view/AI extensibility, plus 12 apps for the editor / sync / AI / bake / headless / CLI / marketplace / docs / bench surfaces.
3. There is one composition root — `composeRuntime()` — that wires all layers in a fixed order and returns one typed `PryzmRuntime` handle; the white UI sees only that handle.
4. State mutations flow exclusively through the L4 command bus (264 typed handlers); writes become MessagePack events, events are bridged to a Yjs CRDT for multi-user, snapshots are derivative and re-bakeable.
5. Geometry runs as pure functions in workers (L2 kernel) and is committed to a single THREE scene by the scene committer; one rAF (frame-scheduler) drives all rendering — no other rAF is permitted.
6. AI lives at L7.5 and **only proposes** Commands through an approval queue — it never mutates state directly, never bypasses RBAC, and is fully cost-metered with BYOK custody.
7. Every layer is verified by `pnpm ga-gate` against 17 NFTs, the 9 workflow gates, ESLint boundary rules, and the cross-doc invariants block from chunk 25 — the corpus closes with 103 enumerated gaps fixed (85 original + 17 folder-level + 1 customer-migration), 44 ADRs queued, 39 SPECs ratified, and 418 sub-phases scheduled across S73-WIRE → S87-WIRE.

This is what the user demos at GA M36, and this is what serves the next 36 months of post-GA evolution per `12-BIM-2-AND-3`.
