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
- **Pipeline + observability.** Every `plane.submit()` runs budget pre-check (CostMeter, SPEC-28) → impl → cost record → enqueue, inside one `pryzm.ai.workflow.{kind}` OTel span (P8). Generative workflows are read-only at submit (ADR-0214): they emit **zero** `proposedCommands`; mutation happens only in a later, explicit execute step that goes through the command bus (P6).

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
- **Phase A — generate (read-only, ADR-0214):** prompt → relay (§2.2 proxy) → loud-fail-soft parse → validate → retry ≤3 (feeding failures back) → score → rank. Persists to `runtime.ai.layoutOptions` (the AIStore) + emits `apartment.layout-options-ready` on `runtime.events` (P4). **Zero mutation.** Surfaced as the §11 modal (cards with an SVG plan thumbnail — declarative, no rAF, P3-trivial — score breakdown, room areas).
- **Phase B — execute (on the user's pick):** `apartment.layout-execute {optionIndex}` → `buildLayoutCommands` pre-mints `wall_`/`door_`/`opening_` ids (`createId`) so doors reference host walls with **no read-back** → dispatches `wall.batch.create` + per-door `wall.createOpening` (`opening.elementId === door id`, the C15 hosted-element cascade) + `door.batch.create` through the command bus (P6) **inside one `batchCoordinator.runBatch`** → **one undo entry** → rooms auto-redetect (`skipRedetectRooms: false`).
- **Cost:** estimate ≤ $0.18 (SPEC-28 §3 ceiling); recorded per-run by the plane CostMeter.
- **Offline path (deterministic, no token):** when the AI is unavailable (no key / 401 / 500 / all-invalid), the same Phase-A orchestrator falls back to the **D-TGL engine** (`apartmentLayout/tgl/`, governed by SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE) — a pure, deterministic generative pipeline (rectilinear dissection → bubble graph → squarified subdivision → walls/doors → a persistent semantic `LayoutGraph` → Space-Syntax-weighted Pareto rank → geometry emission). It produces the **same `ScoredLayoutOption` shape**, so Phase B + the modal are identical. The engine is L2-pure (no THREE/DOM/RNG, P2/P4/§6) and emits the C15 cascade; spans stay at the plane boundary (P8). The `LayoutGraph` is the BIM3.0 payload (IFC5/RDF-ready, P10).
- **Governed by:** SPEC-APARTMENT-LAYOUT-GENERATOR (normative), **SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE (offline engine)**, **SPEC-CEILING-LAYOUT-ENGINE / SPEC-LIGHTING-LAYOUT-ENGINE / SPEC-FURNITURE-LAYOUT-ENGINE (auto-pipeline engines, §3.4.1)**, C15 (hosted doors), C16 (command authoring), C17 §#51 (catalogue), SPEC-28 (cost), SPEC-07 (approval surface). **User guide:** `docs/05-guides/user/apartment-layout.md`.

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

### §4.5.1 — A DEFAULT IS NOT AN OVERRIDE (normative; ADR-0308, L-777)

**The legacy VG cascade MAY contribute to a drawn line ONLY where a human explicitly set
the property. Where it is echoing a built-in default or a template seed, it MUST
contribute nothing.**

This follows from §4.3 (LocalViewOverrides is the LAST tier, not a seed ahead of the
intent) and §4.5 (intents REPLACE view templates). It is stated separately because the
code violated it for every element in every view while appearing to honour it.

**AS-IS defect, now fixed.** `PlanViewCanvas.render()` resolved a correct pen through
`graphicsRulesEngine.resolveStyle()` and then overwrote it:

```js
ctx.strokeStyle = vgEdge ?? _pen.color;                       // colour discarded
ctx.lineWidth   = max(hairline, _penPx * (vgLineWeight / 1)); // weight multiplied
```

`vgGovernanceStore.resolveStyle()` **never returns nothing** — `ensureModel()` stamps
every model with `templateId: 'pryzm-default'`, whose built-in template hard-codes an
`edgeColor` and `lineWeight` for wall, slab, column, beam, door, window, roof, stair,
furniture, plumbing and grid. The `??` therefore never fell through: the intent-derived
pen was dead code at every call. Authored colours were discarded outright; authored
weights were doubled for wall / column / beam.

**Binding rules:**

1. A VG contribution is admissible only if the property appears in `overriddenProps` —
   VG's own record of an explicit human decision, written by
   `SetVGCategoryStyleCommand` / `SetVGViewCategoryStyleCommand`. Any future writer to
   `vgGovernanceStore` MUST register the property there, or its value will correctly be
   ignored as a default.
2. There is **ONE** resolver — `VgCanvasStyleResolver` — and it is the only place the
   legacy cascade may speak to the 2D canvas. It was previously a hand-copied closure in
   both `PlanViewManager` and `SplitViewManager`, which had already drifted (one passed
   the `viewId` where the other passed the `modelId`).
3. The rule binds **plan, section and elevation** identically. `PlanViewCanvas` treats
   `section` / `elevation` / `building-elevation` as vertical views through the same path.
4. ⚠ **A claim that the intent governs MUST be proved by a positive control** — plant a
   deliberately extreme rule and show the COMPOSED STROKE moves, per view type, asserting
   that type's own `lineWeightMultiplier`. A test asserting the intent RECORD
   (`intent.elementRules.wall.cut.line.colour === …`) scores 1.000 on a broken build and
   is not a guard.

⚠ **Known gap, not a defect of this rule:** `DefaultViewsManager` creates a 3D view, one
plan and four elevations — **no section view**. Sections are supported and governed; none
exists by default.

### §4.6 — THE SOLIDITY RULE (normative, all view types)

> **Every element is a SOLID.** For any given view, every projected segment is in exactly one
> of **FOUR ZONES**: **CUT** by the view plane, **PROJECTED** and directly visible, **BEYOND**
> the plane but deliberately still shown, or **HIDDEN** behind another solid.
> **Nothing behind a solid is drawn through it — in ANY view type.**
> Line weight, fill, dash and visibility for each zone are resolved from **VIEW INTENT** through
> the pen/graphics table (**Contract-23 §3/§8**). They are NEVER hardcoded in a builder, and
> they are NEVER re-derived per view type.
>
> **AND: ONLY THE `hidden` ZONE DASHES.**
> *"Dashed lines should be reserved ONLY for true hidden edges."* (founder, L-277)

This rule is normative for **plan, elevation and section alike**. It exists because the same
concept was re-invented three times in three view types and drifted apart each time (see
ADR-0110). A rule that lives only inside a builder gets re-invented per view type; a rule
written here does not.

**§4.6.0 — THE FOUR ZONES, AND THE ONE THAT DASHES** *(added by L-277,
`§FEAT-REVIT-LINE-TYPE-SEMANTICS`; the type is
`DrawingZone` in `packages/core-app-model/src/drawing/DrawingZone.ts`)*

| Zone | What it MEANS | How it DRAWS | Canonical examples |
|---|---|---|---|
| **`cut`** | the solid ∩ the view's cut plane | **SOLID** · heaviest weight · **cut fill (poché)** if defined · **NEVER dashed** | walls cut in a floor plan; a column intersected by the section plane |
| **`projection`** | directly **VISIBLE** to the viewer, but **not** intersected by the cut plane. Includes geometry above/below the plane that is directly visible, surfaces seen in elevation, edges visible in 3D, and geometry *behind* the plane that is still directly visible | **SOLID** · typically thinner than CUT · **NO DASHES** | furniture in plan; an un-cut door/window; a visible wall face in elevation |
| **`beyond`** | past the cut plane, and the view **DELIBERATELY keeps showing it**. **THIS IS NOT HIDDEN GEOMETRY.** | **SOLID** · usually lighter than CUT · **NEVER dashed** unless the user explicitly overrides | the lower run of a stair; the storey below in a plan's view range |
| **`hidden`** | **OCCLUDED by another solid**, but intentionally shown with hidden-line graphics | **DASHED** · thin · **no fill** — **THE ONLY ZONE THAT DASHES BY DEFAULT** | a pipe behind a wall; a back-face edge when hidden lines are enabled |

> **DISTANCE FROM THE VIEWER DOES NOT MAKE AN EDGE HIDDEN.** A projected edge stays SOLID
> however far away it is. *"Is it far?"* and *"is something in front of it?"* are **different
> questions**, and the drawing layer must answer the one it was asked.
>
> `hidden` is an **OCCLUSION FACT**. It is produced by **`applyOcclusion()` and by nothing
> else** (§4.6.5). **It MUST NEVER be derived from a depth, a distance, or a view-range band.**
> Any code path that assigns a dash from a depth comparison is in breach of this contract.

*Why this is written here and not left to the builders (L-277).* Before this section existed,
the code had no zone **type** — it reasoned in ad-hoc booleans (`isCut`, `isBeyond`), layer-name
suffixes, and a private zone union re-declared in the drawing worker. `hidden` was therefore
**unproducible**: the canvas's zone resolver took two booleans and could only return three
answers, the worker's edge extractor dropped `HIDDEN` on the floor, and the pen table's `HIDDEN`
entry was an empty object. So when occlusion needed somewhere to put an occluded span, the only
bucket carrying a dashed pen was `beyond` — which is also where the **depth** classifier puts
everything far away. Distance and occlusion merged into one bucket, and the bucket dashed.
**A ZONE THAT CANNOT BE NAMED CANNOT BE STYLED CORRECTLY, AND THAT IS EXACTLY HOW `projection`
ENDED UP DASHED.**

**§4.6.1 — Zone assignment.** The zone is a property of the **(SOLID, view)** pair, derived from
geometry — never a per-element flag, and never a property of the (element, view) pair (see
§4.6.1a, which corrects that earlier wording in place):

| View type | CUT | PROJECTION | BEYOND | HIDDEN |
|---|---|---|---|---|
| plan / ceiling-plan / structural-plan / detail | the solid ∩ the horizontal cut plane | solid between the cut plane and the view range's near/below bound | solid beyond the view range | *(occlusion only — §4.6.5)* |
| section | the solid ∩ the section plane | solid within the projection depth behind the plane | solid beyond the projection depth | *(occlusion only — §4.6.5)* |
| elevation | **empty by definition** — an elevation slices nothing (`ViewScope.cut = false`) | the façade: solid within the near depth band | receding solid behind it | *(occlusion only — §4.6.5)* |

**The `HIDDEN` column is deliberately empty of geometry rules.** It is not a band of space. The
first three columns are **depth/range** classifications and produce **only** SOLID linework;
`hidden` is produced **exclusively** by the occlusion engine. That separation is the contract.

`ViewScope` (`packages/core-app-model/src/views/ViewScope.ts`) is the ONE encoding of this
table. `viewPlane.isVertical` is the only legitimate difference between the three consumers.

---

**§4.6.1a — THE GRANULARITY RULE: CLASSIFICATION IS PER SOLID, NEVER PER HIERARCHY**
*(normative, added by L-282 / §FIX-PER-SOLID-ZONE-CLASSIFICATION; the founder's words are the
spec)*

> *"Classification is performed **PER GEOMETRY**, not per element hierarchy.*
> *`wallClass = classify(wallSolid)` and `doorClass = classify(doorSolid)` are **completely
> independent**. `Wall → Door` does **NOT** mean `Door == Cut ⇒ Wall == Cut`. **No logic of the
> form `if (door.isCut()) wall.setCut(true)` — or any equivalent — may exist.** Host/hosted,
> parent/child, assembly members and family instances must **NEVER** inherit or propagate
> visibility state. **The ONLY determinant of CUT vs PROJECTION is whether THAT SPECIFIC SOLID
> intersects the cut plane.***"

Normatively:

1. **The unit of classification is the RENDERABLE SOLID** (a mesh), not the element, not the
   group, not the host tree. `for each renderableSolid: zone = classify(solid, view)`. A wall
   segmented into `WallPart` / `WallLayer` meshes is N solids, and each is classified on its own
   geometry.
2. **The predicate is INTERSECTION, not PROXIMITY.** A solid is CUT **iff its own geometry
   intersects the plane**. A tolerance may only refine *which of a cut solid's edges* are the cut
   ones; **it may never promote an un-intersected solid into the cut zone.** (`solidIntersectsPlanCutPlane`
   / `solidIntersectsDepthPlane` in `EdgeProjectorService` are the ONE encoding of this predicate,
   and they are the same predicate the cut-FACE builder uses, so linework and poché can never
   disagree about whether a solid is cut.)
3. **A merge is a performance decision and MUST NOT be a semantic one.** The projector merges an
   element's edge geometries per ISO layer before classifying. That merge must be done per
   **(layer × cut verdict)**: merging an un-intersected wall's solids together with a hosted solid
   that *does* meet the plane hands the classifier a bag of geometry with one shared answer — and
   that is exactly how "the door is cut" became "the wall is cut".
4. **THE COROLLARY — THE OPENING IS NOT A CUT UNLESS THE WALL IS CUT.** The edges bounding a
   hosted opening (jambs, head, sill) are edges of the **WALL's** solid and belong to the **WALL's
   cut representation**. If the wall is PROJECTION, then for that wall the view MUST NOT render
   cut edges around the opening, MUST NOT render cut faces, MUST NOT switch it to cut graphics,
   and MUST NOT expose opening edges that exist only in the cut representation. **The wall renders
   exactly like any other projection wall.** This is the half that gets missed; it is asserted
   explicitly in the guard.
5. **THE MODEL HIERARCHY STAYS — IT IS THE DRAWING THAT MUST STOP READING IT.** C15's host
   relationship is real and load-bearing for **GEOMETRY** (an opening *is* a void in a wall, and
   that void is why the wall's cut section is interrupted at the opening BY CONSTRUCTION, §4.6.2).
   What is forbidden is the **DRAWING layer inferring a ZONE from it.** A host relationship is a
   MODEL fact and never a DRAWING fact.

**Why this is the third instance of one disease.** L-275 resolved a wall's ISO layer from a
case-sensitive TYPE NAME rather than from the element; L-266 emitted a door's 3D MESH EDGES
alongside its own plan SYMBOL; L-282 inferred a zone from proximity to a plane rather than from
the solid. **All three are a decision taken at the wrong level of the hierarchy.** Naming the
pattern is half the fix.

**Guard (merge-blocking):** `apps/editor/__tests__/perSolidZoneClassification.test.ts` —
a door whose solid intersects the plane while its host wall's solid does NOT ⇒ **door = CUT,
wall = PROJECTION**, and the wall emits **no cut edges, no cut faces, no opening-cut edges**;
then the converse — push the plane INTO the wall ⇒ **both** CUT. *A test that only checks the
second case passed before the fix and proves nothing*, so the first case is asserted first and
the pre-fix (ungated) behaviour is pinned alongside it, to keep the guard from going vacuous.

---

**§4.6.2 — CUT ⇒ POCHÉ.** A cut solid is a **filled region**, not an outline. The fill is a
per-(category × zone) graphic property of the intent — exactly like a pen weight — resolved
through the same intent → pen/graphics table → layer chain, so a view can override it and a
template can carry it. The **system default is a LIGHT GREY** (`ISO_CUT_LAYER_TO_POCHE_FILL`);
the dense near-black poché is an EXPLICIT `construction-docs` purpose modifier, not the
default. Elevations have no cut and therefore no poché (`ViewScope.poche = false`).

**§4.6.3 — A LAYERED element pochés PER LAYER.** Where an element stores a construction
build-up (`wall.layers`, `slab.layers`, …), the cut region is subdivided into one filled
region **per stored layer**, toned by the layer's stored `function`. The regions, their count
and their tones derive from the **stored record** (L-127 dimensional truth) — never from a
magic literal, never from a hardcoded layer count. The tone is a deterministic **spread of the
intent-resolved colour**, not a second palette: override the intent and every tone moves with
it (`resolveWallLayerPocheFill`, Contract-23 §3).

**§4.6.4 — The pen hierarchy is intent, and the DASH is part of it.** For every category:
`weight(CUT) > weight(PROJECTION) > weight(BEYOND) ≥ weight(HIDDEN)` (ISO 13567 / the Revit
principle). It is resolved from the intent through `PenWeightTable`; a builder that writes its
own line weight is in breach. This holds in **section and elevation** exactly as it does in
plan.

**The dash is governed by the same table and by the same rule:**

| Zone | dash by default |
|---|---|
| `cut` | ✗ — **never** (a cut solid is a filled region, not a line style) |
| `projection` | ✗ — **never**, *at any distance* |
| `beyond` | ✗ — **never** by default; a user MAY override it through the intent chain |
| `hidden` | ✓ — **always**. The only one. |

*Two consequences worth stating explicitly, because both were live defaults before L-277:*

- **The ISO "overhead dashed" convention is NOT a default.** A roof or a ceiling above the plan
  cut plane is `projection` — *"objects above/below the cut plane that are directly visible"* —
  and it is drawn **SOLID**. Drafting standards that dash overhead geometry are expressed as an
  **explicit intent override** (`GraphicsRulesEngine`), which is precisely what P7 is for. A
  dash that arrives from a code branch rather than from intent is in breach.
- **DATUM categories are the ONE exemption, and it is closed.** `grid`, `level` and `annotation`
  are **not solids** — they have no cut, no projection and no occlusion. Their chain/centre-line
  dash is an ISO 128-24 *category* convention, not a hidden-line reading. `DATUM_CATEGORIES`
  enumerates them; the merge-blocking ladder guard skips exactly those three and no others.

**§4.6.4d — THE `beyond` DASH IS PER-VIEW-TYPE INTENT — AND `beyond` MUST BE TELLABLE FROM
`hidden` BEFORE IT DASHES** *(added by L-290, §FEAT-BEYOND-DASH-IN-ELEVATION; normative)*

The founder's decision, and it is the **override clause §4.6.4 already carries** (*"never dashed
… unless explicitly overridden"*):

| view type | `beyond` draws |
|---|---|
| **elevation**, **section** | **DASHED**, with the LONG `BEYOND_DASH_PX` `[8,4]` |
| **plan** (and the whole plan family) | **SOLID**, lighter — *unchanged* |

**THIS DOES NOT RE-OPEN L-277.** That bug was **dashing by DISTANCE** — far-but-VISIBLE geometry
drawn as if something were in front of it, because depth and occlusion shared one bucket. The
buckets remain separate; `hidden` is still produced ONLY by `applyOcclusion` (§4.6.5). This is a
deliberate, view-scoped STYLE, chosen by the user.

**(a) SEPARATE `beyond` FROM `hidden` *BEFORE* DASHING `beyond`.** They carry the **SAME WIDTH**
(0.09 mm — since L-277 they differ by DASH, not by weight). Dash `beyond` with `hidden`'s dash and
the drawing **GAINS A DASH AND LOSES A DISTINCTION**: a stair's lower run reads identically to a
pipe behind a wall, in exactly the views the founder asked for.

**(b) THE AXIS IS THE DASH PATTERN, NOT THE WEIGHT — and that is a MEASUREMENT.** Both pens are
≈ **one device pixel** at the canvas's backing scale (§4.6.4e / L-288 measured it), so any WIDTH
difference between them is **sub-pixel by construction** — the eye cannot receive it, and making
`hidden` thinner would additionally drag `MIN_LEGIBLE_BACKING_SCALE` from 3 to 4 (it is derived
from the thinnest pen) for a difference nobody can see. The dash PERIOD is multi-pixel: `[8,4]`
(12 px) against `[4,3]` (7 px) survives a 1× projector and is exact in print. It is also the
standard drafting distinction (ISO 128-24: a LONG dash for a member behind the plane; a fine
SHORT dash for hidden detail). **A distinction the raster destroys is not a distinction.**

**(c) IT IS DATA, NOT A BRANCH.** `ViewScope.beyondLineStyle` carries the per-view-type default
and `ViewDefinition.output.beyondLineStyle` overrides it per view — the **same channel and the
same precedence** as `occlusionDisposition` (§4.6.5 / L-279): *instance beats type beats default*,
resolved ONLY through `resolveBeyondLineStyle()`. An `if (isElevation)` inside a renderer is in
breach. **The PEN TABLE still says `beyond` is SOLID** — §4.6.4 stays literally true: no dash
arrives by DEFAULT from a code branch; it arrives from VIEW INTENT (P7). The engine applies it at
`RULE_PRIORITY_VIEW_TYPE_MODIFIER` (5000): above the intent tier (which seeds `beyond` solid and
would otherwise erase it), below the VIEW and ELEMENT tiers (so a user's explicit style wins).

**(d) DASHING CHANGES STYLE, NEVER RANK.** `weight(CUT) > weight(PROJECTION) > weight(BEYOND)`
remains strict in every view type.

**§4.6.4e — THE LADDER MUST BE STRICT *ON SCREEN*, NOT MERELY IN MILLIMETRES** *(added by L-288,
§FIX-PLAN-CANVAS-HAIRLINE-FLOOR; normative)*

A pen hierarchy the user cannot SEE is not a hierarchy. `PlanViewCanvas` floored every stroke at
`max(0.5, 1/dpr)` = **1.0 CSS px at `devicePixelRatio` 1**, and at 96 DPI that is above four of
the table's pens at once:

    wall PROJECTION 0.25 mm → 0.945 px · door PROJECTION 0.18 → 0.680
    ceiling PROJECTION 0.13 → 0.491   · any BEYOND 0.09 → 0.340      ⇒ ALL clamped to 1 px

So on a 1× display — most laptops, most projectors — the **entire PROJECTION tier and the whole
BEYOND tier rendered at ONE uniform width**, and with them §4.6.4a's function axis. The drawing
had a hierarchy; the screen did not.

**(a) THE PENS ARE CORRECT — THE RASTERISER WAS NOT. IT IS FORBIDDEN TO "FIX" THIS BY INFLATING
THE PEN TABLE.** The hierarchy is already right in EXPORT (at `EXPORT_DPI` those pens are 2.95 px
and 2.07 px), and that is the proof the pens were never the bug. Fattening them to clear a screen
floor would CORRUPT the export.

**(b) THE CANVAS RENDERS AT A BACKING SCALE SUFFICIENT TO DRAW THE TABLE.**
`MIN_LEGIBLE_BACKING_SCALE = ceil(1 / (thinnestPenMm × SCREEN_PX_PER_MM))` — **DERIVED by scanning
the pen table**, never typed, so a finer pen added tomorrow raises the scale with it. Bounded by
`MAX_BACKING_SCALE = 4`, the budget the product has always spent on high-DPI machines.

**(c) THE STROKE FLOOR IS ONE DEVICE PIXEL** — the thinnest mark the rasteriser can physically
make — and it is **not** the dash scale. Conflating the two (as the old `hairline` did) is why the
defect could not be fixed in place: dash *periods* are multi-pixel, were never clamped, and must
keep following the DISPLAY's ratio.

**(d) GUARD IT IN DEVICE PIXELS.** A guard written in millimetres passes on the broken product —
the millimetres were always right. That is the entire nature of this defect.

**§4.6.4a — THE FUNCTION AXIS: `pen = f(ZONE, CATEGORY, FUNCTION)`** *(added by L-285,
§FEAT-PEN-WEIGHT-BY-WALL-FUNCTION; normative)*

§4.6.4 says a cut wall outweighs a projected wall. It does not say **which wall is the
building**. A 100 mm partition and a 300 mm shell draw with the same pen, and the eye cannot
find the envelope. The pen therefore takes a third axis — exactly what ISO 13567
sub-categorisation and Revit's subcategory line weights exist for:

| function | meaning | weight scale |
|---|---|---|
| `exterior` | part of the building **ENVELOPE** — it separates inside from outside | **1.00** (the datum) |
| `interior` | it subdivides the inside — a partition, **however thick** | **0.70** |
| *(undeclared)* | the model does not say | **1.00 — unmodulated** |

**(a) THE FUNCTION IS NOT THE THICKNESS.** Keying the pen off `wall.thickness` is the obvious
implementation and it is **in breach**: a 300 mm ACOUSTIC or PARTY wall is INTERIOR and would
draw as heavy as the shell — leaving the envelope unreadable in precisely the buildings (flats,
hotels) where finding it matters most — and a thin EXTERIOR infill panel would vanish. Thickness
is a coincidence of construction; **FUNCTION is the drawing fact.** It is **DECLARED on the
element's TYPE** (`WallSystemType.function`, as IFC's `IfcWallTypeEnum` and Revit's *Function*
parameter model it) and MUST NOT be inferred from geometry.

**(b) NOR FROM THE LAYER STACK.** `WallLayer.function` is a *layer* function, not a *wall*
function: the built-in `wt-interior-partition` has a layer whose function is literally
`finish-exterior` (its outer plaster face). Sniffing for one would classify a partition as
envelope — the defect this rule exists to prevent, reintroduced by its own fix.

**(c) THE ZONE LADDER IS SACRED.** FUNCTION modulates **within** a zone; it **NEVER** reorders
zones. Both halves are normative and both are guarded:

> `weight(CUT, ·, interior) < weight(CUT, ·, exterior)` — the new fact; **AND**
> `weight(CUT, ·, ANY fn) > weight(PROJECTION, ·, ANY fn)` — §4.6.4, still strictly true.

An interior CUT wall (0.50 × 0.70 = **0.35 mm**, an existing ISO line-group width) is lighter
than an exterior CUT wall and **still heavier than any projection line**. A guard that asserts
only the modulation silently undoes L-277.

**(d) ONLY THE HIERARCHY ZONES ARE MODULATED — `CUT` and `PROJECTION`.** `BEYOND` and `HIDDEN`
are **de-emphasis** zones: their pen says *"this is background — read past it"*, not *"how
important is this"*, and whether a faint grey background line is envelope or partition is not a
question the drawing asks. It is also a **ladder invariant**: since L-277 those two zones carry
the SAME base width (0.09 mm — they differ by DASH, not by weight), so modulating one puts an
interior BEYOND (0.063) *under* an exterior HIDDEN (0.09) and **inverts the bottom of the
§4.6.4 ladder**. The merge-blocking guard caught exactly this on the feature's first run.

**(e) UNDECLARED IS AN ANSWER, NOT A GAP.** An element whose type declares no function — the
default "Monolithic" wall type, which is what a user draws with until they choose one — is
**UNMODULATED**: bit-identical to its pre-L-285 pen. There is no default-guess branch, so no
existing drawing silently re-weights and no wall is promoted to "envelope" because a heuristic
liked its thickness.

**(f) THE MODULATION IS APPLIED AT THE END OF THE RULE CHAIN.** `GraphicsRulesEngine.
resolveStyle()` applies it **after** the intent/view/element tiers, never by seeding
`resolvePen()`'s base value. `_intentRules()` **always** contributes a `widthMm` at priority
1000, so anything written into the base is unconditionally overwritten downstream — an axis fed
into the base is a **no-op with a green unit test**, which is the precise mechanism that nearly
cost L-277 its `hidden` pen. It is also what the axis *means*: FUNCTION must scale whatever the
chain resolved, so a user who re-weights the `wall` category still gets his envelope drawn
heavier than his partitions.

*Types:* `packages/core-app-model/src/drawing/ElementFunction.ts` (the drawing half — the axis,
the scale, the modulated-zone set) and `packages/geometry-wall/src/WallFunction.ts` (the wall
half — what the wall's type declares). The boundary is deliberate: **FUNCTION is a wall-domain
fact; the PEN is a drawing fact.** `EdgeProjectorService` is the one place the fact crosses,
stamping it on the projected `LineSegments.userData` (`ELEMENT_FUNCTION_KEY`) — the same
transport `elementUUID` and `VIEW_DEPTH_KEY` already use.

**§4.6.4b — THE PEN TABLE IS THE *ONLY* PEN AUTHORITY, INCLUDING FOR SYMBOLS** *(added by
L-280, §FIX-WINDOW-PLAN-FRAME-THICKNESS; normative)*

A **symbolic renderer** (door swing, window cased opening — Contract-25a §3.4) dispatches
**SYMBOL GEOMETRY**. It MUST NOT resolve a pen. Every line in a drawing — symbol or not —
takes the pen that `graphicsRulesEngine.resolveStyle(zone, category, { …, elementFunction })`
returns for **the segment's own zone**, composed with the VG factor and the hairline **once**,
by the canvas.

*The defect this closes.* `PlanViewCanvas` resolved the pen correctly and then, for door and
window symbols, discarded it: it re-resolved an appearance via `resolveIntentStyle(…,
'projection', …)` — **the state hard-coded** — and `SymbolicRuleRenderer` stroked
`appearance.line.weight` over the top. Consequences, both shipped:

- **The zone was discarded for the only two element types that have symbols.**
  `symbolicRuleForLayer()` declines `-CUT` and `-BEYOND`, so what reached the symbolic path was
  `-PROJ` **and `A-DOOR-HIDDEN` / `A-GLAZ-HIDDEN` — the layers `applyOcclusion()` demotes onto**
  (§4.6.5). An OCCLUDED door frame painted **SOLID, at the PROJECTION weight**. L-277 named the
  `hidden` zone, produced it and priced it; this flattened all three back to `projection`.
- **The rule chain was skipped.** `resolveIntentStyle` is the INTENT tier alone (priority 1000);
  `resolveStyle()` runs that tier **and then** the VIEW (9000) and ELEMENT (10000) tiers and the
  VG weight factor. Per-element pen overrides therefore reached every line in the drawing
  **except** door and window symbols.
- …and consequently **no new pen axis could ever reach a symbol** — §4.6.4a would have been
  built, tested at the seam, and been invisible on screen for hosted elements. L-280 and L-285
  were **one bug**.

**A symbol renderer MUST receive a fully-resolved, screen-space pen (`SymbolPen`) and MUST NOT
import the pen table, the intent resolver, or `SCREEN_PX_PER_MM`.** It cannot re-decide a weight
if it is not given the means to.

**§4.6.4c — A WINDOW IN PLAN READS `frame | glazing | frame`, NOT A SOLID SLAB** *(L-280,
drawing convention; normative for plan symbols)*

The plan cut plane slices a window's **frame members** and its **glazing** (they are solids at
sill+ height — §4.6.1a). It does **not** slice the void between them. Therefore:

- the frame's **wall-face lines are CUT linework and MUST span only the frame members**
  (`±halfWidth → ±(halfWidth − frameThickness)` each side);
- they **MUST NOT be bridged across the full opening width**. A heavy CUT line drawn along the
  wall face *across the glazing* asserts a solid that is not there, and closes the symbol into a
  rectangle: the window then reads as **one continuous band of the full wall thickness** — a
  solid slab — instead of two members with glass between them. That is what the founder sees.
- The jamb seam is *already* sealed without the bridge: the host wall's face lines are clipped
  at the opening's **void edges** (`_suppressPlanViewOpeningLines`), which is exactly where the
  frame's jamb ticks stand, so wall → frame is continuous and the glazing zone carries **glazing
  lines only**.

*(Implementation note: the bridging lines live in `WindowPlanSymbolBuilder._computeSymbolGeometry`
— the `for (const n of [-halfThk, +halfThk]) cutSeg(at(-halfW, n), at(+halfW, n))` pair. The full
bridge remains correct **only** in the degenerate `!framed` case, where `frameThickness ≥
halfWidth` and there are no distinct members to draw.)*

**§4.6.5 — Occlusion is ONE engine, three consumers.** There MUST NOT be a second occluder
implementation per view type. The single entry point is
**`applyOcclusion(drawing, { disposition, minProjectionOccluderDepth })`**
(`packages/core-app-model/src/drawing/HiddenLineRemoval.ts`). It is **the only producer of the
`hidden` zone in the product.**

**(a) The occluder set — every SOLID, depth-ordered.** For each element (grouped by
`elementUUID`, so an element never hides its own linework), the occluder is built from its
front-facing linework:

- its **`:cut`** section — a cut solid is *at* the view plane, so its depth is −∞ and it occludes
  everything behind it, unconditionally;
- its **`:proj`** silhouette — a **projected** solid, ordered by the `viewDepth` stamp the
  projector writes for **every view type**.

> **The `:proj` half of that set is the hole L-277 closed, and it is worth recording why it
> survived so long.** `removeHiddenLines()` *was* called for plan and section — the call was
> never missing. But plan and section built their occluders from **`:cut` linework only**, so a
> *projected* solid occluded **nothing**, and a section showed you the far wall straight through
> the near one. The depth stamp that would have ordered a projection occluder existed under the
> name `elevationDepth` and was written for elevations only. **The engine was not absent; it was
> being handed a crippled occluder set by two of its three callers.** There was never a third
> occluder to write.

**(b) The disposition — INTENT, not a code branch.** Carried on `ViewScope.occlusionDisposition`:

- `remove` — the occluded span is not drawn (plan / section default: the slab does not show
  through the wall);
- `demote` — the occluded span is re-classified to the element's **`:hidden`** sibling layer and
  drawn on the **dashed hidden-line pen** (the elevation default, per L-190).

Both are legitimate drafting conventions; **which one applies is a property of the view's
intent**, and a view MUST be able to choose. What is NOT legitimate is a view type having no
occlusion at all, or having its own private occluder.

> **A demoted span goes to `:hidden`, NEVER to `:beyond`.** Writing occlusion into `:beyond` —
> which is what the elevation pass did before L-277, because `:beyond` was the only layer with a
> dashed pen — **merges an occlusion fact with a distance fact into one bucket**, and that merge
> is the entire L-277 defect. `:beyond` is SOLID.

**(c) Two structural rules the engine MUST enforce.** Both exist because a naïve "every nearer
solid occludes" rule has a catastrophic degenerate case in plan:

1. **`beyond` is clipped by `cut` occluders ONLY — never by `projection` occluders.** `beyond`
   is, by definition, geometry the view **deliberately keeps showing** past the plane. A floor
   slab is a *projected* solid that spans the whole plate and lies nearer to the viewer than
   everything below it; if projected solids could clip `beyond`, the slab would silently delete
   the entire below-storey reference band the view range was configured to include — and with it
   the founder's stair example. A **cut** solid still occludes it: you do not see the storey
   below through a wall's poché.
2. **A plan looks down FROM its cut plane, not from infinity** (`minProjectionOccluderDepth: 0`).
   Geometry *above* the plan cut plane has a negative view depth and **is not an occluder**.
   Without this clip a roof — the nearest solid in the drawing, with a silhouette covering the
   whole plate — would occlude the **entire plan**.

**§4.6.6 — Guards (merge-blocking).** Per view type:
- no segment behind a solid survives inside that solid's projected silhouette (subject to the
  view's disposition);
- `weight(CUT) > weight(PROJECTION) > weight(BEYOND) ≥ weight(HIDDEN)`, resolved from the intent;
- **a segment that is merely FAR is SOLID; a segment that is OCCLUDED is DASHED** — asserted at
  the **outcome** (the pen the canvas actually resolves via `graphicsRulesEngine.resolveStyle()`),
  never at the seam;
- **only the `hidden` zone dashes**, for every zone × every solid category, `DATUM_CATEGORIES`
  excepted;
- **`hidden` is `visible`** — it is drawn, dashed, with a non-zero weight and opacity and no
  fill. A "hidden" zone that resolves to a zero pen is a zone that cannot exist;
- occlusion is **idempotent** — a second pass must not re-occlude already-resolved `:hidden`
  linework;
- a plain cut solid yields exactly ONE filled region; a layered cut solid yields exactly N,
  where N is its **stored** layer count;
- no poché colour, pen weight, **or dash array** literal appears in any builder;
- **(§4.6.1a, L-282)** a hosted solid that meets the plane while its HOST's solid does not ⇒
  **hosted = CUT, host = PROJECTION**, and the host emits **no cut edges, no cut faces and no
  opening-cut edges**; the converse (plane pushed INTO the host) ⇒ **both** CUT. **A guard that
  asserts only the converse is vacuous** — it passed before the fix.

*Guarded by* `packages/core-app-model/src/drawing/DrawingZone.test.ts` (20 assertions),
`apps/editor/__tests__/perSolidZoneClassification.test.ts` (§4.6.1a, 11 assertions),
`HiddenLineRemoval.planPoche.test.ts`, `HiddenLineRemoval.elevationOcclusion.test.ts`.

**§4.6.7 — Open cells (recorded, not faked).**
- **A per-VIEW override of `occlusionDisposition`.** §4.6.5(b) says a view MUST be able to
  choose; today the default is carried per view *type* on `ViewScope` and the engine honours
  whatever it is handed, but there is no field on `ViewDefinition` and therefore no user-facing
  switch. The type is in place; only the plumbing is missing.
- **Plan projection-occluders are enabled but conservative** — see §4.6.5(c). Widening rule (1)
  requires a real answer to "may a slab occlude the storey below?", which is a *view-range*
  question, not an occlusion one.

---

## §5 — AI Cost Governance

`packages/ai-cost/` (L1) tracks per-call token usage and aggregates cost by project and workflow type. It:
- Records every AI call to `ai_usage` rows.
- Exposes `/api/ai/spend/summary` for the admin dashboard.
- MUST enforce `enforceAIQuota` before each call (§2.3).
- MAY block calls that would exceed a per-project monthly budget ceiling (configurable by the project owner).
