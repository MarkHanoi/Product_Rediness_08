# C09 — AI & Visibility Intent

> **Stamp**: 2026-05-02 · **Status**: CANONICAL  
> **Scope**: `packages/ai-host/` (L2), `packages/visibility/` (L1), AI plan critique, AI 3-options generation, cost governance, and the visibility intent system.  
> **Key principles**: P7 (visibility intent ≠ UI state).  
> **References**: [SPEC-46] AI plan critique, [SPEC-47] AI 3-options generation, [SPEC-07] AI as a first-class layer.

---

## §1 — AI as a First-Class Layer (Differentiator D5)

AI in PRYZM is not a bolt-on feature. It is a first-class L2 domain package (`packages/ai-host/`) that:
- Reads from stores (via subscriptions, never direct writes).
- Expresses intent through the command bus (dispatches commands with `source: 'ai'`).
- Operates within the same CQRS flow as every other mutation path.
- Has its costs tracked per-project in `ai_usage` rows.

AI MUST NOT call `window.*`, mutate stores directly, or bypass the command bus.

---

## §2 — AI Host (L2)

`packages/ai-host/` orchestrates AI workflows. It owns:

- The Anthropic model client (relay via `CF_WORKER_URL` or direct `ANTHROPIC_API_KEY`).
- The prompt templates for plan critique, 3-options generation, and query workflows.
- The cost accounting integration (`packages/ai-cost/`).
- The AI workflow state machine (idle → running → complete / failed).

### §2.1 — Model identity

The active model id is `ANTHROPIC_MODEL_ID` (env var; default: `claude-haiku-4-5`). All server-side AI calls MUST use this constant. It MUST NOT be hardcoded at call sites.

### §2.2 — AI upstream routing

```
Browser → /api/anthropic/v1/messages (Express + authMiddleware + aiLimiter)
  → CF_WORKER_URL (if set)  — preferred; holds the Anthropic key as a Cloudflare secret
  → api.anthropic.com        — fallback when CF_WORKER_URL is not set and ANTHROPIC_API_KEY is set
  → 503 error                — if neither is configured
```

The browser MUST NOT call `api.anthropic.com` directly. All AI requests flow through the Express `/api/anthropic/*` proxy, which enforces auth, rate limits, and quota.

### §2.3 — AI quota enforcement

`enforceAIQuota(userId, tokens)` in `server/planStore.js` MUST be called before any AI call. If the user has exceeded their plan quota, the call MUST be rejected with HTTP 429 and a user-visible quota message. Quota counters reset monthly.

### §2.4 — In-process workflow registration (the AiPlane, L7.5)

Two execution modes exist for AI workflows:

1. **Server worker** — `getAiHost().submit(req)` POSTs to `/api/ai-worker`. The classic path for workflows that run server-side.
2. **In-process plane** — the `AiPlane` (`packages/ai-host/src/AiPlane.ts`) runs a registered workflow's impl **in the browser**, calling the relay via the §2.2 proxy. This is how generative L7.5 workflows (e.g. apartment-layout, §3.4) run today.

The in-process plane is wired through the **single composition root** (P1, C02): `composeRuntime()` constructs an `AiApprovalQueueStore` + a `LayoutOptionsStore` and passes `getAiHost({ approvalQueue })` so the host builds its `AiPlane` (without an approval queue the host has no plane). The plane + its stores are exposed as `runtime.ai.{ getHost, layoutOptions, approvalQueue }`.

Rules:

- **Registration is lazy (K3-A).** Workflows are bound onto `host.plane` only on first use (e.g. the editor's first generate click), via a `*.attach(runtime)` / `ensure*Registered(runtime)` helper that **dynamic-imports** `@pryzm/ai-host`. No AI bytes in the first-paint chunk; `scripts/check-ai-host-lazy.mjs` enforces no static `AiHost.impl` import.
- **Dep-clean layering.** `packages/runtime-composer` (P1 root) and `packages/ai-host` MUST NOT import the editor's stores/services (`core-app-model` `storeRegistry`, `spatial-index` `FacadeOrientationService`). Those accessors are **injected from L5** (the editor) into the registration helper. Pure cores (prompt/validate/score/shell/command builders) take injected ports (relay, `mintId`, store readers) so they unit-test in plain Node.
- **Pipeline + observability.** Every `plane.submit()` runs budget pre-check (CostMeter, SPEC-28) → impl → cost record → enqueue, inside one `pryzm.ai.workflow.{kind}` OTel span (P8). Generative workflows are read-only at submit (ADR-014): they emit **zero** `proposedCommands`; mutation happens only in a later, explicit execute step that goes through the command bus (P6).

---

## §3 — AI Workflows

### §3.1 — Plan Critique (SPEC-46)

- Input: the current `ElementStore` snapshot (serialised via `packages/file-format/`).
- Output: an array of `CritiqueItem { severity, element_ids, message, suggestion }`.
- Latency SLA: < 8 s end-to-end (NFT 14).
- Results MUST be surfaced as a read-only panel (no automatic mutations).

### §3.2 — 3-Options Generation (SPEC-47)

- Input: a natural-language prompt + the current floor plan geometry.
- Output: three distinct `PryzmProject` snapshots (not full projects — floor plan elements only).
- The user selects one option; selection dispatches a `source: 'ai'` command to replace the current layout.
- Generated layouts MUST be validated against `packages/schemas/` before dispatch.

### §3.3 — AI Query

- Input: a natural-language question about the current model.
- Output: a text answer with optional element IDs highlighted.
- MUST NOT mutate any store.

### §3.4 — Apartment Layout Generation (SPEC-APARTMENT-LAYOUT-GENERATOR)

The capstone generative workflow (`apartment-layout-generate`; Semantic Design Assistant prompt #51). A **two-phase, in-process (§2.4) L7.5 workflow** following the SPEC-47 pattern: *generate → preview/approve → execute*.

- **Input:** an apartment **shell** already in the model — perimeter walls + the entrance door + windows (the shell's exterior walls on the active level). Built by `gatherLayoutPayload` from the wall store + `FacadeOrientationService` (SL-3).
- **Output:** N ranked, **hard-validated** (§8: min areas, natural light, direct access, corridor width, door clearance, adjacency, program satisfaction) and **scored** (§9: light / privacy / kitchen-workflow / corridor-efficiency) interior layouts — internal walls + hosted doors.
- **Phase A — generate (read-only, ADR-014):** prompt → relay (§2.2 proxy) → loud-fail-soft parse → validate → retry ≤3 (feeding failures back) → score → rank. Persists to `runtime.ai.layoutOptions` (the AIStore) + emits `apartment.layout-options-ready` on `runtime.events` (P4). **Zero mutation.** Surfaced as the §11 modal (cards with an SVG plan thumbnail — declarative, no rAF, P3-trivial — score breakdown, room areas).
- **Phase B — execute (on the user's pick):** `apartment.layout-execute {optionIndex}` → `buildLayoutCommands` pre-mints `wall_`/`door_`/`opening_` ids (`createId`) so doors reference host walls with **no read-back** → dispatches `wall.batch.create` + per-door `wall.createOpening` (`opening.elementId === door id`, the C15 hosted-element cascade) + `door.batch.create` through the command bus (P6) **inside one `batchCoordinator.runBatch`** → **one undo entry** → rooms auto-redetect (`skipRedetectRooms: false`).
- **Cost:** estimate ≤ $0.18 (SPEC-28 §3 ceiling); recorded per-run by the plane CostMeter.
- **Offline path (deterministic, no token):** when the AI is unavailable (no key / 401 / 500 / all-invalid), the same Phase-A orchestrator falls back to the **D-TGL engine** (`apartmentLayout/tgl/`, governed by SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE) — a pure, deterministic generative pipeline (rectilinear dissection → bubble graph → squarified subdivision → walls/doors → a persistent semantic `LayoutGraph` → Space-Syntax-weighted Pareto rank → geometry emission). It produces the **same `ScoredLayoutOption` shape**, so Phase B + the modal are identical. The engine is L2-pure (no THREE/DOM/RNG, P2/P4/§6) and emits the C15 cascade; spans stay at the plane boundary (P8). The `LayoutGraph` is the BIM3.0 payload (IFC5/RDF-ready, P10).
- **Governed by:** SPEC-APARTMENT-LAYOUT-GENERATOR (normative), **SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE (offline engine)**, **SPEC-CEILING-LAYOUT-ENGINE / SPEC-LIGHTING-LAYOUT-ENGINE / SPEC-FURNITURE-LAYOUT-ENGINE (auto-pipeline engines, §3.4.1)**, C15 (hosted doors), C16 (command authoring), C17 §#51 (catalogue), SPEC-28 (cost), SPEC-07 (approval surface). **User guide:** `docs/guides/USER-GUIDE-APARTMENT-LAYOUT.md`.

### §3.4.1 — Auto-pipeline chain (post-execute)

Phase B's `runBatch` only places walls + hosted doors. The architecturally complete apartment (floor finishes, ceilings, furniture, lighting) is produced by a deterministic **auto-pipeline chain** that fires after `apartment.layout-executed`:

```
apartment.layout-executed
    ├──► floor-finish    (CreateFloorsByRoomTypeCommand, C17 #34)
    ├──► ceiling         (D-CE)            → ceiling.layout-executed
                                                  └──► furnish (D-FLE) → furnish.layout-executed
                                                                              └──► lighting (D-LE) → lighting.layout-executed
```

Floor-finish and ceiling fire **in parallel** after the apartment event (neither bounds rooms). Furniture waits for ceilings to settle so the architect sees an enclosed shell before furniture appears. Lighting waits for furniture so fixtures align with placed items.

Each stage MUST:
1. Be **L2-pure** — no THREE/DOM/RNG; the trigger lives in `apps/editor/src/ui/{ceiling,furnish,lighting,floor}-layout/` and dispatches into the pure engine in `packages/ai-host/src/workflows/{ceilingLayout,furnishLayout,lightingLayout}/`.
2. Pre-mint ids (no read-back; same doctrine as Phase B).
3. Be **idempotent under chain re-fire** — listening to a duplicate `apartment.layout-executed` MUST NOT double-emit. The triggers use a `state.fired` latch + clear on the chain link.
4. Emit a typed `<stage>.layout-executed` event on completion so the next stage can chain or the human can observe.

**§CHAIN-TIMEOUT (12 s per-stage fallback).** Each downstream trigger arms a `setTimeout(12_000)` on the predecessor event. If the predecessor never emits its `*.layout-executed` (a stage threw, hung, or skipped), the timeout fires the next stage anyway with a `console.warn`. This prevents a single bad stage from stranding the whole pipeline.

**§RELIABILITY (15 s regenerate guard).** The §11 modal's regenerate path (`§MODAL-DYNAMIC` re-issues Phase A on every program edit) arms a 15 s `_regenerateTimer` so a hung relay never strands the busy spinner.

**§POLL-TELEMETRY.** The two silent post-runBatch waits (`_finishLayout` wall-store poll + room-rename poll) emit structured `apartment.wall-poll-completed` + `apartment.room-name-completed` telemetry events so the operator can observe what would otherwise be invisible latency.

**§F-Sprint-5 circulation gate.** Post-D-FLE the furnish workflow MUST run a pure circulation reachability validator (`packages/ai-host/src/workflows/furnishLayout/validate.ts`). Per-room warnings are collected on `furnish.layout-executed` (`validationWarnings: string[]`) + cached in-memory (`§VALIDATE-CACHE`); a single summary toast (`§VALIDATE-TOAST`) signals the user when warnings exist. The user reviews via `pryzmShowFurnishWarnings()`.

**§HELP discoverability.** The console command `pryzmShowApartmentHelp()` MUST list every `pryzm…()` pipeline command (`pryzmGenerateApartmentLayout()`, `pryzmFloorAllRooms()`, `pryzmCeilAllRooms()`, `pryzmFurnishAllRooms()`, `pryzmLightAllRooms()`, `pryzmFurnishAndLightAllRooms()`, `pryzmShowFurnishWarnings()`).

### §3.4.2 — Modal contract (§11)

The §11 modal is the user-facing approval surface for apartment-layout. Beyond cards + thumbnails it MUST:

- **§MODAL-DYNAMIC** — render an editable program form (bedrooms, bathrooms, master-en-suite, open-plan, per-room area overrides). Edits debounce 250 ms then re-fire Phase A IN-PLACE without dismissing the modal. The same modal updates its cards (`refresh(options)`) rather than re-opening.
- **§ROOM-AREAS / §ROOM-AREAS-BY-NAME** — accept per-RoomType absolute area overrides AND per-instance ("Bedroom 1") area overrides. The engine honours both; per-instance wins over per-type. Overrides are clamped UP to the architectural minimum (`programRules.minAreaM2`).
- **§WINDOW-SYMBOLS** — render perimeter windows + the user-placed front door as symbols on the thumbnail.
- **Scale bar + occupancy legend** — every thumbnail carries a metre-scale bar and a colour legend keyed to the occupancy palette.
- **Accessibility (§A11Y).** Every room polygon MUST be focusable (`role="button"`, `tabindex="0"`, `aria-label`) and activatable with Enter or Space; activation focuses the per-instance area input (`§CLICK-FOCUS`). The modal is operable with a keyboard alone.
- **Build completion (§BUILD-TOAST).** The completion toast after `apartment.layout-executed` MUST surface dropped-wall count from `set.warnings` ("(K dropped — see console)") when the §PREVIEW-VS-BUILD gate rejected items.

### §3.4.3 — Pre-furnishing dimensional + topological validators (2026-05-29)

Between D-TGL subdivision (Phase A's geometry emission) and D-FLE furnishing (auto-pipeline §3.4.1), every candidate apartment passes through TWO orthogonal validator layers. The validators run inside `enumerate.ts` per candidate; failures tier the candidate down via a 5-tier admissibility fallback **before** Pareto ranking.

**Part A — dimensional validators (`packages/ai-host/src/workflows/apartmentLayout/dimensions/`).**

- `validateApartmentEnvelope` — apartment-LEVEL gross-area sanity (§3.1 by-bedroom-count: studio 28–55 m², 1-bed 42–80 m², …). Hard rejections (200 m² 1-bed; 35 m² 3-bed) return EMPTY from `enumerateLayouts` BEFORE the 8-strategy loop. Trigger surfaces a structured `[apartment-layout] §D3.5 envelope reject:` console warning naming the architectural mismatch.
- `validateRoomShape` — per-room G1 area + G2 width + G3 length + G4 aspect + G6 wall against `roomDimensions.ts`. Hard findings (e.g. 1.1 × 5 m tunnel bathroom, 20 m² bathroom rejected per §5.5) flag `shapeAdmissible: false`. Soft findings (area outside comfortable band, aspect above soft max) accumulate into `objectives.shapeQuality ∈ [0, 1]`.

**Part B — topology validators (`packages/ai-host/src/workflows/apartmentLayout/topology/`).**

- `validateMandatoryAdjacencies` (HARD) — every program-derived mandatory adjacency (master↔ensuite when `program.masterEnSuite`, hall↔corridor, hall↔living) has a realised door.
- `validateForbiddenAdjacencies` (HARD) — every door is a permitted pair per `doorAllowedBetween` (single source of truth in `programRules.ts`).
- `validateWetCluster` (SOFT) — wet rooms (kitchen + bathroom + ensuite + wc + utility) share a single plumbing-stack group via shared-wall union-find. Each extra stack group adds one finding with delta `1 / numWet`.
- `validateAcousticZoning` (SOFT) — acoustic sources (living / dining / kitchen / utility) sharing a wall with receivers (master / bedroom / study) emit a finding with delta `1 / (sources × receivers)`.

Soft findings accumulate into `objectives.topologyQuality ∈ [0, 1]`.

**Gate semantics.** `enumerate.ts` extends the existing legality gate to a 5-tier fallback that AND's all admissibility flags:

```
clean (shape + topology) + legal      ← best (architecturally complete + rule-legal)
clean (shape + topology) + connected  ← complete; reconciliation doors present
legal                                  ← rule-legal but a soft finding
connected                              ← reachable; multiple compromises
anything                               ← last resort
```

Pareto ranks within the chosen tier over the 8-axis ObjectiveVector: `efficiency · adjacency · daylight · circulation · regularity · hierarchy · shapeQuality · topologyQuality`. The single-source-of-truth specification for the validators + envelopes is `SPEC-ARCHITECTURAL-PROGRAM-RULES.md §7.5`.

---

## §4 — Visibility Intent System (P7)

### §4.1 — Core principle

**ALL visibility is derived from intent, not per-view configuration.** A Visibility Intent is a declarative template that governs the graphical representation of every element type across every view state. Views consume intents; they do not define style.

### §4.2 — Ownership

`packages/visibility/` (L1) owns the intent model. It is a **domain concept**, not a UI concern. Plugins and AI MUST express visibility changes as intent deltas dispatched via the command bus — never by setting UI state directly.

**CI gate**: `packages/visibility/__tests__/intent-not-ui.test.ts` (hard-fail, P7).

### §4.3 — Rendering equation

```
FinalElementAppearance =
    VisibilityIntentRules        — master template (intent)
  + ViewGeometryLens             — cut plane, beyond, hidden, projection
  + ElementStateRules            — selected, hovered, isolated
  + LocalViewOverrides           — per-view ad-hoc overrides (lowest precedence)
```

Each layer is evaluated in strict precedence order. Local overrides win over intent rules but MUST NOT mutate the master intent.

### §4.4 — Intent lifecycle

1. A plugin or AI workflow creates an `IntentProposal` and dispatches `ApplyVisibilityIntentCommand`.
2. The command handler in `packages/visibility/` validates the proposal, merges it into `VisibilityStore`.
3. The scene committer picks up the delta and updates the THREE material parameters.
4. The change is recorded in the command log (undo-able).

### §4.5 — Visibility intent vs. view templates

Visibility intents replace Revit-style view templates. A view MUST NOT have its own stored material overrides. Override state is always computed from the intent + view lens + element state.

---

## §5 — AI Cost Governance

`packages/ai-cost/` (L1) tracks per-call token usage and aggregates cost by project and workflow type. It:
- Records every AI call to `ai_usage` rows.
- Exposes `/api/ai/spend/summary` for the admin dashboard.
- MUST enforce `enforceAIQuota` before each call (§2.3).
- MAY block calls that would exceed a per-project monthly budget ceiling (configurable by the project owner).
