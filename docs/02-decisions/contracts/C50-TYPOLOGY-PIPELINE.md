# C50 — Typology Pipeline

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs the **multi-typology generative-AI pipeline** — the substrate that lets PRYZM serve apartment, house, small-office, gym, pharmacy, car-park, hospital, school, and every future building type from one editor. Codifies the `TypologyRegistry`, the 7-stage `PipelineRouter`, the `TypologyStageBundle` shape every pack ships, the `dispatch(input) → result` contract, the AI-vs-deterministic engine-selection policy, the plan-tier gating rule, and the per-stage observability requirements. Companion to [C07](./C07-PLUGIN-SDK-AND-MARKETPLACE.md) (which governs how packs are packaged + signed + distributed) and [C09](./C09-AI-AND-VISIBILITY-INTENT.md) (which governs the AI-host plane that Stage 4 of the pipeline calls into).
> **Depends on**: [C01](./C01-ARCHITECTURE-AND-GOVERNANCE.md) (P1 single composition root · P5 schemas pure · P8 spans), [C02](./C02-COMPOSITION-ROOT-AND-BOOT.md) (registry slot in `composeRuntime()`), [C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md) (TypologyManifestSchema lives here), [C07](./C07-PLUGIN-SDK-AND-MARKETPLACE.md) (`.pryzm-typology` ZIP container + Ed25519 signature), [C09](./C09-AI-AND-VISIBILITY-INTENT.md) (AI plane that Stage 4 dispatches into), [C13](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) (registry MUST NOT leak across projects), [C16](./C16-COMMAND-AUTHORING-PROTOCOL.md) (Stage 7 emits commands authored per C16), [C19](./C19-SITE-MODEL-AND-PARCEL.md) (Stage 2 reads the SiteModel snapshot), [C21](./C21-CLIMATE-INGESTION.md) (Stage 2 reads ClimateSummary), [C23](./C23-PROVENANCE-AND-AI-AUDIT.md) (every dispatch carries a correlation id), [C39](./C39-PRICING-AND-PLAN-TIERS.md) (plan-tier gate on `requiredPlanTier`).
> **Downstream**: every typology pack (apartment in Phase A; house + small-office in Phase A; +22 more later phases per [typology-expansion-roadmap §3](../../03-execution/plans/typology-expansion-roadmap.md)); `apps/editor/src/ui/onboarding/RACChatbot.tsx` (the user-facing dispatch surface); the marketplace publisher (signs + lists packs); the inspect-debug panel (renders `PipelineMetadata` + `stagesRun` + per-stage timings).
> **Key principles**: **P1** (one `TypologyRegistry` per runtime, registered in `composeRuntime()` only), **P5** (`packages/typology-pipeline/` is pure orchestration — no I/O; adapters live in apps/editor where the auth + storage substrates are), **P6** (Stage 7 emits commands the editor's commandBus dispatches; the pipeline NEVER mutates stores directly), **P8** (outer dispatch span + per-stage child span; every public surface emits ≥1 OTel span).
> **Master plan**: [typology-expansion-roadmap.md §4-§6](../../03-execution/plans/typology-expansion-roadmap.md), [master-execution-tracker.md A.1 + A.3 + A.4 + A.20](../../03-execution/plans/master-execution-tracker.md), [roadmap-phase-1-alpha.md §3](../../03-execution/plans/roadmap-phase-1-alpha.md).
> **Audit context**: written 2026-06-01 to codify the invariants the A.1 implementation (`packages/typology-pipeline/`, commit `172fc8c`) embeds. C50 supersedes the implicit "apartment is the one workflow" assumption in early `@pryzm/ai-host` code.

---

## §1 — Invariants

The numbered rules below are binding on every PR that touches `packages/typology-pipeline/`, any per-typology pack package, or the editor's pack-dispatch wiring. Each invariant has an `§1.N` id usable in `TODO(C50.N)` annotations and in `check-typology-*.ts` CI gate failure messages.

### §1.1 — One TypologyRegistry per runtime

A `PryzmRuntime` MUST contain exactly one `TypologyRegistry` — created in `composeRuntime()`, never elsewhere. Parallel registries (one per project, one per app instance, one inside a worker) are forbidden.

- `composeRuntime()` allocates the registry with `createTypologyRegistry()` and exposes it on `runtime.typology.registry`.
- Per-typology pack registration MUST happen during the runtime's `boot()` phase — never lazily on first dispatch. Lazy registration would mean a pack's availability depends on dispatch order; the `TypologyPicker` UI MUST be able to enumerate all packs at mount.
- Test code MAY construct fresh registries with `createTypologyRegistry()` for isolated assertions; tests MUST NOT mutate the runtime-shared registry.

**Why**: an unambiguous `WHICH PACK?` resolution surface is a P1 requirement. The `RACChatbot` UI and the marketplace install hook are both first-class callers; they need the same answer to `registry.list()`. Two registries means two truths, means the picker UI and the dispatch path can disagree.

**Enforcement**: `check-typology-registry-singleton.ts` lints for any `createTypologyRegistry()` call outside `composeRuntime()` + the `__tests__/` directories.

### §1.2 — TypologyId is branded and validated at every boundary

The `TypologyId` is a branded string (`string & { readonly __brand: 'TypologyId' }`) — slug-style, lowercase-kebab-case, 3–64 chars, matching `TYPOLOGY_ID_PATTERN` per [C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md). Every public boundary that accepts a `TypologyId` MUST validate the slug at the boundary OR accept the branded type.

- The registry's lookup methods (`get`, `has`, `unregister`) accept `TypologyId | string` and brand internally — this is the API-ergonomics carve-out (callers usually receive raw strings from URLs / chatbot output).
- The registry's `register()` method validates the manifest's `id` via `assertTypologyId()` — registration of a pack with an invalid slug throws.
- The router's `dispatch()` accepts a `PipelineInput.brief.typologyId: TypologyId`; the brief schema validates it before dispatch.

**Why**: typology ids are the marketplace path slug, the in-product identifier, and the cache-key for `programRules.json`. A malformed id at any of those surfaces is a silent bug. Branding makes the type compiler-checkable; runtime validation closes the gap for callers that bypass the type system (JSON deserialisation, URL parsing).

**Enforcement**: `check-typology-id-validation.ts` lints for any `as TypologyId` cast outside `packages/typology-pipeline/src/`.

### §1.3 — The pipeline shape is the 7 canonical stages, in order

Every dispatch flows through the same 7 stages in the same order:

```
brief → site → constraints → generative → validators → cognition → bim-emit
```

No pack MAY reorder, skip, merge, or insert a stage. Packs that don't need a stage's logic supply `undefined` (or omit it) — the router supplies the default no-op handler.

- The constant `PIPELINE_STAGES: readonly PipelineStage[]` lives in `packages/typology-pipeline/src/types.ts` and is the canonical ordered list. CI lints assert that any per-stage iteration code in the editor / inspect-panel uses this constant, not a hand-written array.
- Adding a new stage is a **contract change** — a new C50 invariant + a new ADR + an entry under §1.3 here.

**Why**: a fixed stage shape is the only way the inspect-debug panel, the per-stage timing telemetry, the partial-failure semantics (`partial.stagesRun`), and the cross-pack visual comparison (the marketplace "compare two packs" UI) can be implemented uniformly. Per-pack stage shapes would fragment all of those surfaces.

### §1.4 — Stage 4 (generative) is mandatory; Stages 1·2·3·5·6·7 default to no-ops

Every `TypologyStageBundle` MUST supply a `generative: GenerativeStage` handler. Every other stage handler is optional; the router supplies a sensible default:

| Stage | Default handler |
|---|---|
| `brief` | Echoes `PipelineBrief` → `ValidatedBrief` with `metadata` copied as `normalised` |
| `site` | Echoes `SiteContextSnapshot` → `ResolvedSiteContext` with `derived: {}` |
| `constraints` | Empty rule set: `{ programRules: {}, regulatory: {} }` |
| `validators` | Pass-through: returns the plan unchanged |
| `cognition` | Empty evaluation array `[]` |
| `bim-emit` | Empty command list `[]` (means "no commands") |

- A pack overrides ONLY the stages it cares about — the apartment pack overrides Stages 3 / 4 / 5 / 6 / 7; the (very-simple) car-park pack might only override Stage 4.
- The defaults are exported from `@pryzm/typology-pipeline` as `defaultBriefStage`, `defaultSiteStage`, etc., for tests and for packs that want to compose against the default.

**Why**: forcing every pack to author 7 handlers when 5 are usually no-ops is friction with no payoff. Mandating Stage 4 makes the pipeline meaningful (a pack that doesn't generate anything has no reason to exist). The defaults are conservative: empty outputs propagate cleanly to the end of the chain.

### §1.5 — Registration is idempotent-by-rejection

`registry.register(pack)` THROWS if a pack with the same `TypologyId` is already registered. Callers MUST `unregister(id)` first to replace.

- Version bumps go: `unregister('apartment') → register(newApartmentPack)`. This is an explicit two-step so any state attached to the registry (subscribers, picker UI) sees both the removal and the re-registration.
- The marketplace install flow MUST detect a duplicate id at install time and prompt the user before overwriting; the runtime does not silently overwrite.
- `unregister()` of an absent id is a no-op (not an error).

**Why**: silent replace-in-place hides a class of bugs where two packs of the same id are loaded from different sources (first-party + marketplace, or two marketplace versions). The user expects to know which is active; explicit unregister/register surfaces it.

### §1.6 — Plan-tier gating is a soft-fail return

When `pack.manifest.requiredPlanTier > input.userTier` (per the [C39](./C39-PRICING-AND-PLAN-TIERS.md) tier ordering), `dispatch()` returns `{ ok: false, failedAt: 'brief', reason: "requires plan tier '<X>'; user is on '<Y>'." }` — it does NOT throw.

- The `developer` and `admin` tiers bypass the consumer-tier gate (developer is the marketplace-publisher surface; admin is PRYZM internal staff).
- The editor UI catches the soft-fail and shows an "Upgrade your plan" surface; it MUST NOT show a generic error.
- The pack itself MUST NOT do its own tier check — the router owns the gate. Pack-side checks duplicate the registry surface and drift on tier renames.

**Why**: thrown errors propagate to crash reporters and surface as "something went wrong" to the user. A plan-tier mismatch is a normal commercial flow — it deserves a real UI, not an error toast. The soft-fail shape lets the editor render a buy-flow.

### §1.7 — Programmer errors throw; pack errors fail-soft

The router distinguishes:

- **Programmer errors** (typology not registered · stage handler threw instead of returning `ok: false` · malformed `PipelineInput`): the router **throws**. These are bugs, surfaced to the crash reporter.
- **Pack errors** (a stage handler returned `ok: false`): the router returns `{ ok: false, failedAt: <stage>, reason: <message>, partial: { stagesRun: [...], engine: <engine>, stageTimings: { ... } }`. These are normal "I can't generate this layout" flows; the editor shows a "tweak your brief and retry" UI.

- Stage handlers MUST NOT throw for "I can't do it" cases — they MUST return `{ ok: false, reason }`. Throwing instead of returning is itself a programmer error.
- The router's `try/catch/finally` wraps every stage handler call; uncaught throws end up in the outer `dispatch` catch.

**Why**: throws and returns mean different things. Mixing them produces "this random thing failed, was it a bug or expected?" ambiguity in the support / ops UI.

### §1.8 — Every dispatch + every stage emits an OTel span

Per **P8**:

- The outer `dispatch()` opens a span `typology-pipeline.dispatch` with attributes: `pryzm.typology.id`, `pryzm.typology.version`, `pryzm.correlation.id`, `pryzm.user.tier`, `pryzm.user.role`.
- Each stage opens a child span `typology-pipeline.stage.<stage>` (e.g. `typology-pipeline.stage.generative`) with attributes: `pryzm.typology.id`, `pryzm.pipeline.stage`.
- Stage spans set `SpanStatusCode.OK` on success, `SpanStatusCode.ERROR` with `message: reason` on soft-fail, `recordException` + `SpanStatusCode.ERROR` on throw.
- The outer span MUST be `end()`ed in a `finally` — half-open spans are forbidden.

**Why**: per-stage timing is the canonical performance probe — without it the inspect-debug panel can't tell users where their 4-second dispatch went. Spans on soft-fails are critical for the "why did this pack reject this brief?" support flow.

### §1.9 — `packages/typology-pipeline/` is pure orchestration — no I/O

The pipeline package MUST NOT call:
- `fetch()` / `XMLHttpRequest` / WebSocket APIs
- `fs.*` / `process.cwd` / Node-only filesystem APIs
- `localStorage` / `sessionStorage` / IndexedDB / Yjs
- THREE / DOM / canvas APIs
- Any `@pryzm/persistence-client`, `@pryzm/sync-client`, `@pryzm/renderer-three`

Allowed dependencies: `@pryzm/schemas`, `@opentelemetry/api`, `zod` (transitive).

- I/O adapters live in `apps/editor/` (ZIP unpacking the `.pryzm-typology` container, Ed25519 verification, AI workflow execution, deterministic-engine loading). The pipeline accepts already-loaded stage bundles via `registry.register()`.
- Pack authors who need I/O at Stage 4 (eg AI workflow that POSTs to `/api/ai-worker`) wire the I/O ADAPTER in the pack's own L5 package and pass a pure function to the registry.

**Why**: the pipeline runs in the L3 layer (per [C01](./C01-ARCHITECTURE-AND-GOVERNANCE.md) layered model). L3 cannot depend on L4+ (rendering, persistence, sync). Keeping the pipeline pure also lets it run in workers, tests, and headless smoke harnesses without mocking the entire editor.

**Enforcement**: `check-typology-pipeline-pure.ts` lints for any I/O import inside `packages/typology-pipeline/src/`. The package's own `package.json` lists only the allowed dependencies above.

### §1.10 — Stage 7 emits commands; the pipeline never mutates stores directly

Stage 7 (`bim-emit`) returns a `readonly EmittedCommand[]` — opaque to the pipeline. The L5 dispatch caller (editor) feeds them to the editor's `commandBus` inside one batch (single undo per [C16](./C16-COMMAND-AUTHORING-PROTOCOL.md) §8).

- The pipeline does NOT call `commandBus.execute()`. It does NOT depend on `@pryzm/command-bus`.
- Each `EmittedCommand` MUST be a `{ type: string; payload: unknown }` shape; the editor's `commandBus` runs the per-command Zod schema validation.
- The editor's dispatch caller wraps the command sequence in `batchCoordinator.runBatch(emitted)` — exactly one undo-stack entry per pipeline dispatch.

**Why**: P6 is universal — UI dispatches commands, never writes stores. The pipeline layer is technically not UI, but the same rule applies because its output IS commands. Letting the pipeline dispatch directly would bypass undo, plugin hooks, and the per-command schema validation.

### §1.11 — AI-vs-deterministic engine selection is deterministic per input

Stage 4's engine selection (when a pack ships both an AI workflow AND a deterministic engine) follows a deterministic rule:

1. If `input.preferDeterministic === true` AND `manifest.deterministicEngineEntry` is set → deterministic.
2. Else if `manifest.aiWorkflowEntry` is set → AI workflow.
3. Else if `manifest.deterministicEngineEntry` is set → deterministic.
4. Else throw (the manifest should have failed `manifestHasEntry()` validation, so reaching here is a programmer error).

Helper: `selectEngine(manifest, input)` exported from `@pryzm/typology-pipeline`.

- A pack that ships both engines MUST behave identically on Stage 4 outputs (`engine: 'ai-workflow' | 'deterministic'`) up to the engine-tag field — the same brief + same site + same constraints SHOULD yield equivalent semantic layouts (cognition scores within a tolerance).
- Offline mode forces `preferDeterministic: true`.
- The demo path forces `preferDeterministic: true` (no token cost during demo).

**Why**: deterministic selection is the only way the inspect panel can label "this layout came from the AI" vs "this layout came from the offline engine" without a side-channel. It also lets us pin a regression test to either branch without flakiness.

### §1.12 — The cognition layer set declared in the manifest equals the set evaluated

`manifest.cognitionLayers: CognitionLayer[]` is the source of truth for which L1–L7 cognition evaluators run at Stage 6. The pack's Stage 6 handler MUST evaluate EXACTLY these layers, in the same order, no more no less.

- If the manifest declares `['L1-environmental', 'L3-semantic-topology', 'L7-typology-priors']`, Stage 6 returns 3 `CognitionEvaluation` entries in that order.
- A layer in the manifest with no registered evaluator emits a stub `{ score: 0, violations: ['evaluator not registered'] }` so the inspect panel surfaces the gap (rather than silently dropping it).
- Adding a new cognition layer to the manifest mid-flight (between dispatches) is a pack-author bug — the registry's `register()` snapshots the manifest; in-flight dispatches see the snapshot, not the post-mutation manifest.

**Why**: the cognition layer set is a contract between the pack and the user — the picker UI shows "this pack reasons about: L1, L2, L3" and the user trusts that claim. Silent divergence between declared layers and evaluated layers is a credibility bug.

### §1.13 — The Registry MUST reset on project switch

Per [C13](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) §3.8, no cross-project state leak is permitted. The registry itself does NOT carry per-project state — its contents are global (the apartment pack is "the apartment pack" regardless of project). BUT: any per-project pack-state cached by an adapter (the loaded AI workflow function, the loaded deterministic engine bytes, ephemeral per-project parameters) MUST reset on project switch.

- `registry.clear()` is the canonical reset hook. The C13 project-lifecycle reset path MAY call it, but for first-party packs the standard behaviour is to keep them registered across project switches (no reload needed).
- Adapter caches (`apps/editor/src/typology/loadedWorkflows.ts`) MUST register a C13 reset handler.

**Why**: the marketplace-pack install flow attaches per-project pack metadata (eg "this project has the gym-pack-v2 installed"). That metadata is per-project. Sharing it across project switches is the canonical project-isolation bug.

### §1.14 — Marketplace packs MUST be Ed25519 signed and signature-verified at load

Per [C07](./C07-PLUGIN-SDK-AND-MARKETPLACE.md) §3.2, marketplace-distributed packs MUST carry an Ed25519 signature in `manifest.signature` of the form `<base64-signature>:<base64-publicKey>`. The editor's pack-loader verifies the signature before passing the unpacked bundle to `registry.register()`.

- PRYZM-first-party packs MAY omit the signature in dev mode (signature is `optional` in the schema). The dev-mode loader logs a warning.
- Production builds (`NODE_ENV === 'production'`) MUST refuse to load unsigned marketplace packs — even dev-mode unsigned first-party packs require a signed-by-PRYZM build flag.
- Signature mismatch on load is a hard fail (no fall-through to "load anyway") — the loader returns a structured error the marketplace UI surfaces.

**Why**: code execution (Stage 4 generative handlers, Stage 7 emitters) runs inside the editor's authority. Unsigned third-party code is a supply-chain risk. Marketplace integrity demands signature verification.

---

## §2 — Types

The canonical type surface lives in `packages/typology-pipeline/src/types.ts`. The summary below is the source of truth for the contract; the code MUST mirror this shape.

### §2.1 — `PipelineStage`

```ts
type PipelineStage =
    | 'brief' | 'site' | 'constraints' | 'generative'
    | 'validators' | 'cognition' | 'bim-emit';

const PIPELINE_STAGES: readonly PipelineStage[] =
    ['brief', 'site', 'constraints', 'generative',
     'validators', 'cognition', 'bim-emit'];
```

### §2.2 — `PipelineInput`

```ts
interface PipelineInput {
    readonly brief: PipelineBrief;       // typology id + user role + metadata
    readonly site: SiteContextSnapshot;  // C19 SiteModel snapshot
    readonly userTier: PlanTier;         // C39 plan tier of caller
    readonly preferDeterministic?: boolean;
    readonly correlationId?: string;     // provenance per C23
}
```

### §2.3 — `PipelineResult`

Discriminated union — `ok: true` carrying commands + cognition + metadata, OR `ok: false` carrying the failed stage + reason + partial metadata.

```ts
type PipelineResult =
    | { ok: true; correlationId; typologyId; commands;
        cognition; metadata }
    | { ok: false; correlationId; typologyId; failedAt;
        reason; partial };
```

### §2.4 — `TypologyStageBundle`

The per-pack handler bundle. Only `generative` is mandatory; others fall back to the defaults in §1.4.

```ts
interface TypologyStageBundle {
    brief?: BriefStage;
    site?: SiteStage;
    constraints?: ConstraintsStage;
    generative: GenerativeStage;        // MANDATORY
    validators?: ValidatorsStage;
    cognition?: CognitionStage;
    bimEmit?: BimEmitStage;
}
```

### §2.5 — Per-stage handler signature

```ts
type StageHandler<TIn, TOut> = (
    input: TIn,
    ctx: { manifest: TypologyManifest; input: PipelineInput; spanName: string },
) => Promise<StageOutcome<TOut>> | StageOutcome<TOut>;

type StageOutcome<TArtifact> =
    | { ok: true; artifact: TArtifact }
    | { ok: false; reason: string; stage: PipelineStage };
```

---

## §3 — TypologyRegistry

The L3 in-memory registry. Construction: `createTypologyRegistry(): TypologyRegistry`.

### §3.1 — Registry surface

```ts
interface TypologyRegistry {
    register(pack: RegisteredTypologyPack): void;       // throws on dup id
    unregister(id: TypologyId | string): void;          // no-op if absent
    get(id: TypologyId | string): RegisteredTypologyPack | undefined;
    has(id: TypologyId | string): boolean;
    listIds(): readonly TypologyId[];                   // alphabetical
    list(): readonly RegisteredTypologyPack[];
    subscribe(listener: RegistryChangeListener): () => void;
    clear(): void;                                       // per C13 reset path
}
```

### §3.2 — Change listener event shape

```ts
type RegistryChangeListener = (event: {
    type: 'registered' | 'unregistered' | 'cleared';
    typologyId: TypologyId | null;
}) => void;
```

- `cleared` carries `typologyId: null`.
- An empty `clear()` (clearing an already-empty registry) MUST NOT emit.
- A throwing listener MUST NOT crash the registry — the implementation catches per-listener throws and logs via `console.error`.

---

## §4 — PipelineRouter

### §4.1 — Construction

```ts
createPipelineRouter(
    registry: TypologyRegistry,
    options?: {
        tracer?: Tracer;                  // OTel override
        now?: () => number;               // performance.now override
        newCorrelationId?: () => string;  // crypto.randomUUID override
    },
): PipelineRouter;
```

The overrides are for testing. Production wiring lets them default.

### §4.2 — Dispatch surface

```ts
interface PipelineRouter {
    dispatch(input: PipelineInput): Promise<PipelineResult>;
}
```

### §4.3 — Per-dispatch flow

Per §1.3, the router runs the 7 stages in fixed order. Each stage:

1. Open child span.
2. Record `t0 = now()`.
3. Call the stage handler (or its default per §1.4).
4. Record `stageTimings[stage] = now() - t0`.
5. Push `stage` to `stagesRun`.
6. If handler returned `ok: false`, set span ERROR + return partial result.
7. If handler threw, set span ERROR + recordException + rethrow (programmer-error path, §1.7).
8. Close span.

After Stage 7 succeeds, return `{ ok: true, ..., metadata: { stagesRun, engine, stageTimings } }`.

---

## §5 — UI surface

### §5.1 — Dispatch caller responsibilities

The L5 dispatch caller (`apps/editor/src/ui/onboarding/RACChatbot.tsx` in Phase A) MUST:

1. Construct a `PipelineInput` with the chatbot brief + the current `SiteContextSnapshot` from `SiteStore`.
2. Set `userTier` from the auth subject's current plan.
3. Set `correlationId` from `crypto.randomUUID()` (so the same id flows to the AI-host call + the inspect panel).
4. Call `runtime.typology.router.dispatch(input)`.
5. On `ok: true`: feed `result.commands` to `batchCoordinator.runBatch()` (single undo per [C16](./C16-COMMAND-AUTHORING-PROTOCOL.md) §8).
6. On `ok: false`: render the appropriate UI (paywall for tier-gate fails; "tweak brief" surface for generative fails; etc.).

### §5.2 — Inspect-debug panel

`apps/editor/src/ui/inspect/TypologyDispatchPanel.tsx` (Phase A polish — A.24) renders:
- `result.metadata.stagesRun` as a 7-step indicator (✅ green for stages that ran, ⚪ grey for stages that didn't).
- `result.metadata.stageTimings` as a per-stage millisecond bar chart.
- `result.metadata.engine` as a chip: `AI WORKFLOW` (purple) or `DETERMINISTIC` (cream).
- `result.correlationId` for support / replay lookup.
- `result.cognition` as a per-layer score grid.
- `result.commands.length` as a "commands emitted" count.

### §5.3 — TypologyPicker

`apps/editor/src/ui/onboarding/TypologyPicker.tsx` (A.6) reads `registry.list()` at mount, subscribes to `registry.subscribe()`, and renders one card per registered pack. The picker MUST NOT filter packs by tier — it shows every pack, with a "Requires Studio plan" lock badge on packs the current user can't dispatch. Filtering would hide the upgrade path from the user.

---

## §6 — Migration: apartment refactored as a TypologyPack (A.4)

The Phase 0 apartment-layout pipeline lives in `packages/ai-host/src/workflows/apartmentLayout/`. A.4 refactors it into a TypologyPack registered against C50.

| Phase 0 location | C50 location |
|---|---|
| `ai-host/.../apartmentLayout/workflow.ts` | `packages/typology-pack-apartment/src/stages/generative.ts` (AI branch) |
| `ai-host/.../apartmentLayout/generate.ts` (D-TGL) | `packages/typology-pack-apartment/src/stages/generative.ts` (deterministic branch) |
| `ai-host/.../apartmentLayout/buildLayoutCommands.ts` | `packages/typology-pack-apartment/src/stages/bimEmission.ts` |
| `rules/programRules.ts` | `packages/typology-pack-apartment/src/programRules.ts` (Stage 3) |
| Bathroom-corridor-only validator | `packages/typology-pack-apartment/src/validators/bathroomCorridorOnly.ts` (Stage 5) |
| Daylight rule (A.38) | Stage 6 L5 evaluator (cognition) |

After A.4, the pack registers itself in `composeRuntime()` via `registry.register(apartmentPack)`. The existing `apartment.layout-executed` event remains (the inspect tree + furnish + ceiling subscribers depend on it) — Stage 7 emits it.

Backwards compatibility: the legacy `window.pryzmGenerateApartmentLayout()` console command remains during the A.4 transition, dispatching via the new router instead of the legacy ai-host path. It is removed in B.1.

---

## §7 — Non-Functional Targets (NFTs)

| NFT | Target | Source | Notes |
|---|---|---|---|
| **NFT-50.1** Dispatch latency p95 | < 8 s for AI workflow; < 250 ms for deterministic | Inspect panel telemetry | Apartment AI workflow currently ~6 s; deterministic ~150 ms |
| **NFT-50.2** Stage 4 cancellation | User cancel < 200 ms | A.5 RAC chatbot | AbortController plumbed through Stage 4 only |
| **NFT-50.3** Registry mount cost | < 5 ms for 25 registered packs | A.6 picker UI | Worst case = Phase C (15 packs); Phase D (community marketplace) MAY grow this |
| **NFT-50.4** Memory per registered pack | < 50 KB resident (manifest + bundle handles) | Inspect panel | Code + workflow assets are LAZY-loaded — not counted here |
| **NFT-50.5** OTel span volume | ≤ 8 spans per dispatch (1 outer + 7 stage) | C10 §3 | Above this is a bug — packs SHOULD NOT open ad-hoc spans inside stage handlers |

---

## §8 — Open questions

| # | Question | Owner | Resolution path |
|---|---|---|---|
| 50.OQ.1 | Should Stage 4 support streaming partial outputs to the editor (incremental layout reveal)? | A.4 author | Defer to B-phase — adds complexity to the discriminated-union result; current "wait for full dispatch" is acceptable per NFT-50.1 |
| 50.OQ.2 | Should the router run Stages 2 and 3 in parallel? | A.3 author | NO in Phase A — Stage 3 reads Stage 2's derived facts. Could be parallelised if a pack declares independence; not worth the complexity now |
| 50.OQ.3 | How does the marketplace handle a `requiredPlanTier` upgrade between pack v1 and v2? | A.20 author | Loader compares the user's tier to the installed pack's tier on load; below-tier packs unregister with a deprecation surface; covered by C40 marketplace governance |

---

## §9 — Cross-contract references

| Contract | Touchpoint with C50 |
|---|---|
| [C01](./C01-ARCHITECTURE-AND-GOVERNANCE.md) | P1 single-composition (`composeRuntime` registers the registry); P5 schemas pure; P6 commands only; P8 spans |
| [C02](./C02-COMPOSITION-ROOT-AND-BOOT.md) | `composeRuntime()` exposes `runtime.typology.{registry, router}` |
| [C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md) | `TypologyManifestSchema` lives here (the L0 schema A.2 shipped) |
| [C07](./C07-PLUGIN-SDK-AND-MARKETPLACE.md) | `.pryzm-typology` ZIP container + Ed25519 signing (§1.14) |
| [C09](./C09-AI-AND-VISIBILITY-INTENT.md) | Stage 4 AI branch dispatches to the AI plane registered there |
| [C13](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | Registry adapter caches reset on project switch (§1.13) |
| [C16](./C16-COMMAND-AUTHORING-PROTOCOL.md) | Stage 7 emits commands authored per CA-1…CA-16 |
| [C19](./C19-SITE-MODEL-AND-PARCEL.md) | Stage 2 reads `SiteContextSnapshot` from C19's `SiteStore` |
| [C21](./C21-CLIMATE-INGESTION.md) | Stage 2 reads `ClimateSummary` from C21's climate cache |
| [C23](./C23-PROVENANCE-AND-AI-AUDIT.md) | Correlation id + per-stage spans feed the provenance audit trail |
| [C39](./C39-PRICING-AND-PLAN-TIERS.md) | `requiredPlanTier` gate (§1.6) consumes C39's tier ordering |
| [C40](./C40-MARKETPLACE-ECONOMICS.md) | Pack-author revenue share (downstream — when marketplace ships in Phase D) |

---

## §10 — Status

- **§1.1–§1.14**: DRAFT (this commit).
- **Code**: `packages/typology-pipeline/` shipped at commit `172fc8c` (A.1), 54/54 tests pass, implements §1.1–§1.12 directly.
- **Pending implementation**:
  - §1.13 (project-switch reset hook) — wired in A.3 with `composeRuntime()` slot integration.
  - §1.14 (signature verification) — wired in the pack-loader, deferred to the marketplace work (A.12-A.15 + Phase D).
- **Ratification gate**: C50 ratifies (DRAFT → CANONICAL) when:
  - A.3 ships the `composeRuntime()` slot.
  - A.4 ships the refactored apartment pack and the legacy `ai-host/.../apartmentLayout/` path is removed.
  - 100% of `dispatch()` call sites in the editor go through `runtime.typology.router.dispatch()`.

---

> **Last reviewed**: 2026-06-01.
> **Author**: PRYZM core platform.
