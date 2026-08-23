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

The browser MUST NOT call `api.anthropic.com` directly **on this path**. All AI requests **that use PRYZM's key** flow through the Express `/api/anthropic/*` proxy, which enforces auth, rate limits, and quota.

> ⚠ **Amended 2026-08-23 (lane BYOK44, C105 §3.1).** This paragraph used to end at the full stop after *"directly"*, with no qualifier — and read literally it forbids the one topology under which a **user-supplied** provider key can keep its promise. The two bolded qualifiers are the amendment. The unqualified rule remains correct and binding **for PRYZM's own key**, which is the only key it was written about. See §2.2.1 and [C08 §5.1](./C08-COLLABORATION-AND-SECURITY.md).

### §2.2.1 — BYOM: a SECOND upstream, owned by [C105](./C105-AI-PROVIDER-CREDENTIALS-BYOM.md)

A user may supply their own provider credential (Claude · ChatGPT · Gemini · DeepSeek · OpenRouter · Ollama). When they have done so **and selected it**, that request takes a different topology:

```
Browser → the provider the user chose, DIRECTLY
  (PRYZM's server is NOT on the path; the key never reaches it)
```

The two paths are discriminated by **one pure function**, `resolveAiRoute()` in `packages/ai-host/src/byom/ByomRoute.ts`, returning `keyClass: 'pryzm-managed' | 'user-supplied'`. Relay construction, chat attribution, provenance and privacy tier all read **that same value** — none of them re-derives it.

⛔ **§2.2 above is UNCHANGED for the default path, and that is normative, not incidental.** A user with no BYOM provider configured — and a user who has *saved* a key but not *selected* it — MUST get bit-for-bit today's behaviour: same proxy, same quota, same spend accounting, same model id. **C105 §1.1**, proven at the wire by `byomPlannerRouting.spec.ts §DEFAULT-UNCHANGED`.

**Current scope:** BYOM routes the **chat planner rung only**. `AIElementFactory`, `FloorPlanAIFactory`, `AnnotateViewCommand` and `StrategizeBucket` still use §2.2 unconditionally. A deliberate first scope, declared at C105 §10.6 — not an oversight.

### §2.3 — AI quota enforcement

`enforceAIQuota(userId, tokens)` in `server/planStore.js` MUST be called before any AI call **on the §2.2 path**. If the user has exceeded their plan quota, the call MUST be rejected with HTTP 429 and a user-visible quota message. Quota counters reset monthly.

> ⚠ **Amended 2026-08-23 (lane BYOK44).** **Quota MUST NOT apply to a `user-supplied` request** ([C105 §1.5](./C105-AI-PROVIDER-CREDENTIALS-BYOM.md)) — metering someone else's spend against your quota is wrong. Note that this requires **no bypass and no exemption branch**: a BYOM request never reaches the route that calls `enforceAIQuota`, so the rule above is satisfied vacuously rather than weakened. The same holds for `ai-spend`: PRYZM's ledger records **0** because PRYZM paid 0 (C105 §1.6), and PRYZM deliberately does **not** guess the user's own cost (C105 §5.2).

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

**CI gate**: ~~`packages/visibility/__tests__/intent-not-ui.test.ts` (hard-fail, P7)~~ ⛔ **CORRECTED 2026-08-18 — THAT FILE DOES NOT EXIST, AND THE REAL GATE IS NOT HARD-FAIL.**

> ```
> ls packages/visibility/__tests__/intent-not-ui.test.ts   # -> No such file or directory
> ls packages/visibility/__tests__/                        # IsolationIntent.test.ts
> #   intent-path-alive.test.ts  visibility-intent.test.ts  waves
> ```
>
> **The real P7 gate is [`tools/ga-gate/check-visibility-intent-not-ui.ts`](../../../tools/ga-gate/check-visibility-intent-not-ui.ts).**
> `npx tsx tools/ga-gate/check-visibility-intent-not-ui.ts > /tmp/vis.txt 2>&1; echo "RC=$?" >> /tmp/vis.txt`
> → **RC=0**, `✓ arm A clean (0), arm B within baseline (**40/43**)`.
>
> ⛔ **It is hard-fail on ONE arm only.** ARM A is hard-0 inside `packages/visibility/src`. **ARM B is a RATCHET that currently TOLERATES 40 violations** across the UI tree. Describing P7 as *"hard-fail"* flatly is the L-812 error: it reads as an invariant and is a ceiling.
>
> ⚠ The gate's own output further names **persistence, per-view scoping and the AI intent path as NOT CHECKED** — so *"P7 holds"* is not something this gate can tell you, whichever arm you quote.

### §4.3 — Rendering equation

```
FinalElementAppearance =
    VisibilityIntentRules        — master template (intent)
  + ViewGeometryLens             — cut plane, beyond, hidden, projection
  + ElementStateRules            — selected, hovered, isolated
  + LocalViewOverrides           — per-view ad-hoc overrides (lowest precedence)
```

Each layer is evaluated in strict precedence order. Local overrides win over intent rules but MUST NOT mutate the master intent.

### §4.3.1 — DERIVED GEOMETRY IS NOT A VISIBILITY SUBJECT (normative; L-3510, 2026-08-22)

**An object that exists only to depict another object — an edge outline, a ghost profile, a
highlight clone, a diagnostic overlay — MUST inherit its visibility and its transform from the
object it depicts, by being its CHILD. It MUST NOT be enrolled as a visibility subject in its own
right, and it MUST NOT carry a level tag, an element id, or any other attribution that would make a
visibility or transform pass treat it as an element.**

⭐ **WHY THIS IS NORMATIVE AND NOT A STYLE NOTE — the measurement that produced it.** The founder
reported two Inspect defects on 2026-08-22 and they were **ONE population**:

* *"SOLO = Ground, yet wireframe from every level is still drawn."*
* *"EXPLODE does not separate every element — a lot of geometry stays behind."*

`DiagnosticMaterialManager._applyGhostToNonRoomMesh()` built one cyan `THREE.LineSegments` per
structural mesh and attached it to a **scene-root** overlay group, copying the source mesh's WORLD
transform into it. Every level pass then missed it, twice over:

* the solo filter runs inside `if (!this._isBimObject(obj)) return;`, and that predicate demands
  `userData.id || levelId || storeyName`. A derived clone has an **empty** `userData`, so solo never
  looked at it — it was not *failing to hide*, **it was not in the pass**;
* the explode buckets on `userData.levelId`, so the clone got no offset — and the world-transform
  copy is a **snapshot**, so it stayed at the pose the mesh held when the ghost was applied.

⛔ **THE TEMPTING FIX IS FORBIDDEN BY THIS CLAUSE.** Stamping a `levelId` on the clone makes both
passes reach it and is WRONG: the clone then has its own opinion about where it is, is transformed
independently of its subject, and acquires a start-of-lift race (a ghost applied while the model is
already exploded records the LIFTED Y as its baseline and double-shifts on the next apply). The
correct fix removes the question instead of answering it — parent the clone to its subject at
identity, and transform + `visible` are inherited from THREE with nothing left to maintain.

**This clause codifies what the element builders already do**: `WallEdgeOverlayBuilder` and
`SlabFragmentBuilder` stamp `role:'edges'` and nest their overlay INSIDE the element subtree
(`GLBExporter.ts` describes them as living *"INSIDE an element subtree"*). The Inspect ghost was the
one edge overlay in the repo that did not, and that divergence is exactly what the founder
photographed.

**Consequence, accepted deliberately:** a derived overlay disappears whenever its subject does. That
is the definition of an outline. An outline of something you cannot see is the defect.

### §4.3.2 — HIDDEN IS NOT PICKABLE, AND INJECTED SYMBOLS ARE NOT EXEMPT (normative; L-3902/L-3903, 2026-08-22)

**A drawing element the resolved intent does not paint MUST NOT be hit-testable, selectable, or
otherwise reachable by the pointer. "What is drawn" and "what can be picked" MUST be decided by the
SAME predicate, called from both paths — never by two expressions that happen to agree today.**

⭐ **THE MEASUREMENT.** `PlanViewCanvas.render()` dropped a hidden line twice — VG
`resolved.visible === false`, then the intent's `appearanceToPenStyle()` returning
`{ widthMm: 0, opacity: 0 }` so the stroke painted at `globalAlpha = 0`. **`hitTest()` applied
NEITHER.** It traversed every `LineSegments`, took the first `DrawingSelectionIndex` id inside the
pixel threshold and returned it. A category switched off in the Visibility Intent panel stayed
**fully selectable**: click blank paper, select the element that is not drawn, drag it, and an
invisible thing moves. Measured RED for `A-FURN` **and** `A-WALL:cut` — this is not a
symbol-builder problem, it is a canvas problem, and a per-family fix would have missed walls.

⛔ **THE PREDICATE MUST BE SHARED, NOT DUPLICATED.** A second copy of the visibility test inside the
pointer path is forbidden by this clause. The two copies drift the first time either is edited, and
this repo has already paid for that shape twice in this very subsystem: `vgCategoryForLayer()`
existed twice and the copies diverged (one lacked the ISO hyphen sub-layer arm, so `A-GLAZ-CUT` /
`A-FURN-SHADOW` resolved to a null category), and L-1600 was seven hand-copied answers to "which
layer is this line on", one of which had silently gone wrong. Encoded as
`PlanViewCanvas._lineIsDrawn()` over `penCategoryForLayerTag()`.

**Visibility is keyed on OPACITY, not width.** `ctx.lineWidth` is floored at one device pixel
(§4.6.4e / L-288), so a `widthMm: 0` pen still lays down a hairline; it is `globalAlpha = 0` that
makes a line invisible. Keying pickability on width would make the pointer disagree with the screen
for any zero-width-but-visible pen.

**§4.3.2a — AUTHORED SYMBOL INJECTION IS SUBJECT TO INTENT.** A producer that adds authored 2D
linework AFTER the edge projection — a plan symbol, a swing arc, a walking line, a slope arrow —
has no mesh counterpart and therefore never passed the projection's own intent veto. **Such
producers MUST be gated on the bound intent for the element family they emit for**, and the gate
MUST be resolved by the CALLER, once, not re-implemented inside each producer: visibility intent is
a DOMAIN concept (P7) and does not belong in `packages/geometry-*`, which exist to do geometry
maths.

> Measured 2026-08-22 over all fifteen `*SymbolBuilder*` / `*SymbolTechnicalDrawingBridge*` files:
> `grep -icE "visibilityIntent|isVisible|categoryVisible|vgOverride"` → **0 of 15**. Encoded as
> `makeSymbolInjectionGate()` (`presentation/SymbolInjectionGate.ts`), constructed once in
> `EdgeProjectorService`.

⚠ **THIS CLAUSE DOES NOT CLAIM THAT UNGATED INJECTION MADE HIDDEN ELEMENTS VISIBLE.** It did not —
the canvas drops them, and that was measured before the gate was written. The cost of ungated
injection is everything DOWNSTREAM of the canvas, where no alpha is applied: the drawing carries
geometry for a switched-off category, the selection index records it, and the work is redone every
re-projection. Stating the narrower true claim rather than the broader convenient one.

**The gate MUST FAIL OPEN.** An unbound view, a missing intent or a resolver throw resolve to
"inject". A gate that failed closed would silently delete authored linework from a drawing whenever
intent resolution had a bad day — strictly worse than the unconditional injection it replaces.
**Absence of a decision is not a hide** (§4.5.1: a default is not an override, in its other
direction).

### §4.3.3 — A DIAGNOSTIC LENS OWNS EMPHASIS, AND EMPHASIS IS ELEMENT-SHAPED (normative; L-8200, 2026-08-23)

**A lens that replaces the materials of the meshes it traverses OWNS every visual distinction the
user is meant to see while it is active — including "this is the thing I selected". It MUST re-mint
that emphasis on every application, and it MUST key it on an ELEMENT id resolved for any family,
never on the identity of one privileged family.**

⭐ **THE MEASUREMENT THAT PRODUCED IT.** Founder, production, WebGL, 2026-08-23: *"INSPECT TAB: when
I select the room, it highlights in the 3-D view in inspect mode and works perfect. However, when I
select a wall it highlights for a second — or less — and stops being highlighted."*

`DiagnosticMaterialManager` carried exactly one focus parameter and it was named
`selectedRoomId: string`. Every lens that can emphasise anything decided it with, verbatim:

```ts
if (ud.isRoomVolume) {
  const isSelected = !!(selectedRoomId && ud.roomId === selectedRoomId);
```

**A wall mesh has no `roomId` and is not `isRoomVolume`, so that comparison is UNREACHABLE FOR A
WALL BY CONSTRUCTION** — not "wrong for some builders", not "wrong at some times": there is no scene
in which it can be true. The room *works* for one reason and one only: the jewel is **re-minted by
the lens itself** on every apply. A wall's only emphasis was `SelectionManager`'s purple overlay,
which lives OUTSIDE the lens — and the next lens pass repaints it, because a highlight clone carries
`isHelper`/`sharedGeometry` and **no `type`**, so `resolveGhostRole` classifies it `'non-structural'`
and it takes the flat 4% white ghost. **One frame. That is the founder's "second — or less",
measured, not inferred.**

⛔ **THE TEMPTING FIX IS REJECTED BY THIS CLAUSE.** Exempting `userData.isHelper` meshes from the
ghost pass would let the purple survive — and would also change how `PreviewManager` previews
(`PreviewManager.ts:121`) and `LevelMassingRenderer` proxies (`LevelMassingRenderer.ts:295`) render
**with nothing selected**, because they carry the same tag. A lens that stops ghosting whole
populations to rescue another subsystem's overlay has traded one defect for a wider one. The lens
owning its own emphasis removes the question instead of answering it — the same move §4.3.1 makes.

⛔ **A SECOND SPECIAL CASE IS FORBIDDEN.** Adding a wall arm beside the room arm is how the third one
becomes inevitable (C84 EI-8). The focus slot is a `ReadonlySet<string>` of ELEMENT ids resolved
through an ancestor walk, so a hosted door's untagged sub-mesh (C15 — a hosted element is a group)
resolves like everything else, and multi-select needs no second shape.

**THREE SKIPS ARE NORMATIVE, each named for the defect it prevents:**

| Skip | Why it must out-rank the focus test |
|---|---|
| `ShaderMaterial` | Replacing the OBC `SimpleGrid` material makes `grid.material.uniforms` undefined and every camera move throws on `uZoom`. |
| `userData.role === 'hit-proxy'` | The ancestor walk resolves an invisible `colorWrite:false` proxy to its element's id. Painting it opaque surfaces a raycast helper as a solid box (L-2031). |
| room volume / room overlay | The volume owns the §1.3 jewel. A room volume that also stamps `userData.id` would otherwise be repainted by the solid arm and lose its violet. |

**THE TREATMENT IS CHOSEN BY THE SUBJECT'S DIMENSIONALITY, not shared for convenience.** The §1.3
jewel is a translucent violet **volume** with an opacity pulse; that is right for a room and wrong
for a wall twice over — a 0.4-opacity skin on a 200 mm solid standing in a 4–10% ghost is
indistinguishable from the ghost at grazing angles, and an opacity pulse on a solid reads as
flickering **geometry**. A focused solid is therefore painted **opaque**, in `INSPECT_BLUE`, with an
emissive lift and **no pulse**, plus a crisp outline as a second axis so one focused element still
reads inside a family focus already wearing the same blue. That outline is a **child of its mesh at
identity** — §4.3.1 applies to it in full.

**PALETTE SEPARATION IS BINDING.** Inspect (§INSPECT-FOCUS-IS-THE-ONLY-COLOUR, L-3511 — cyan edge /
violet room / blue focus) and Analysis (§ANALYSIS-IS-GREY-AND-PURPLE, L-6410 — light grey ghost /
PRYZM purple `#6600FF`) share the **mechanism** — a set of element ids resolved by the same ancestor
walk — and MUST NOT share **constants**. The focus post-pass is skipped for the `'analysis'` lens for
exactly this reason. One shared constant would silently restyle Inspect the next time Analysis moved.

**THE EMPTY SET IS A CONTRACT, NOT AN OPTIMISATION.** With nothing focused the pass MUST return
before visiting a single mesh, so the founder's standing *"don't compromise graphics"* constraint is
true **by construction** rather than by argument: no material is replaced and the saved-material
list does not grow.

⚠ **WHAT THIS CLAUSE DOES NOT ESTABLISH.** It makes emphasis reachable for any family whose mesh —
or an ancestor — carries `userData.id`. It says nothing about families rendered through
`InstancedElementRenderer`, which stamps `group.mesh.userData.id = 'instanced-group-<key>'` and
whose own comment records that *"an InstancedMesh exposes NO per-element `userData.id`"*
(`InstancedElementRenderer.ts:460,480`). For those the focus is not wrong, it is **unreachable**, and
the per-family reading is kept in `docs/05-guides/developer/editor-chrome-map.md` §13 rather than
asserted here.

### §4.3.4 — THE WORKSPACE OWNS THE PALETTE; A LENS VARIABLE DOES NOT (normative; L-9200, 2026-08-23)

**When two surfaces render the same scene with different palettes, the SURFACE — the workspace mode
— is the authority on which palette is legal. A lens/mode variable set by one surface MUST NOT be
consulted by another. Exactly ONE expression in the system may answer "which treatment applies", and
every call site MUST route through it.**

⭐ **THE MEASUREMENT.** §4.3.3 made Inspect's emphasis element-shaped. Within a day that shipped a
graphics regression on the *Analysis* surface, and the instructive part is that **the guard written
to prevent it was correct and still failed**:

```ts
if (lens !== 'analysis' && !familyFocusRanTheFocusPass) {
  this._applyElementFocus(scene, focusedElementIds);   // paints INSPECT_BLUE
}
```

`_activeLens` had exactly one writer — the handler for `pryzm-set-inspect-lens`, whose only emitter
is a user clicking an **Inspect** lens chip. Entering Analysis passed the literal `'analysis'` to
`applyLens` and never assigned the field, so it kept its `'ghost'` default. Entry therefore looked
perfect — *"Entered analysis — lens: analysis"* — and the first Analysis **family highlight**, which
dispatches on `selectionBus`, re-applied `_activeLens` and repainted 1016 meshes in Inspect's blue.
The founder: *"before this deployment it was graphically good, now it goes to 'inspect' graphic
modes."* **Entry was never broken; USING the surface took the palette away.**

⛔ **A SECOND GUARD IS FORBIDDEN BY THIS CLAUSE.** The tempting repair is to add
`workspaceMode !== 'analysis'` beside the existing test. That yields two guards that must agree, and
this contract already records twice what happens next (§4.3.2's duplicated visibility predicate;
L-1600's seven hand-copied layer answers). **A guard can only be as right as whoever set the value
it tests** — the defect is not a missing test, it is that the value was owned by the wrong actor.

⭐ **THE REQUIRED SHAPE.** Demote the lens variable to what it truly is — *the user's remembered
choice within its own surface* — and derive the effective treatment from the workspace:
`effectiveLens() = workspaceMode === 'analysis' ? 'analysis' : rememberedInspectLens`. The remembered
choice is still STORED while the other surface shows, so returning restores it; it is simply no
longer consulted by a surface it does not govern. This is §4.3.3's own move (`selectedRoomId` →
`focusedElementIds`) applied one level up: **a slot was answering a question it was not the
authority on.**

**ENTRY POINTS THAT BYPASS THE RESOLVER MUST ASK THE SAME QUESTION IN THE SAME WORDS.** Any public
method that paints without going through the lens application path (in this codebase,
`applyGhostWithFocus`) is unreachable by the resolver and MUST consult one shared predicate — and
MUST **refuse out loud**, never silently no-op.

**PALETTE SEPARATION REMAINS BINDING** (§4.3.3): Inspect's cyan/violet/blue and Analysis' light grey
+ PRYZM purple `#6600FF` share the mechanism and never the constants.

⚠ **WHAT IS CONTRACTUAL AND WHAT IS NOT, for the Analysis selection.** The **hue** is contractual —
C18 §1 fixes `#6600FF` and C16 CA-13 makes it mandatory. The **alpha is not**: C18's only opacity is
`0.55` for object *placement previews* (§3), and C18 §2.4 states that a non-preview overlay inherits
*"the palette and the single-source rule, nothing else"*. Where a user request names a value no
contract states, the implementation MUST record **which reading it took and why**, at the constant,
so the choice can be overturned in one edit instead of re-derived. (Here: *"80% transparent"* read
as alpha `0.20`, on the grounds that it is the literal wording and the falsifiable option.)

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
| elevation | **NOT empty** — see the correction below: the solid the elevation plane is drawn THROUGH (`ViewScope.cut = false` selects the SECTION ROUTING branch, it does not mean "no cut band") | the façade: solid within the near depth band | receding solid behind it | *(occlusion only — §4.6.5)* |

**The `HIDDEN` column is deliberately empty of geometry rules.** It is not a band of space. The
first three columns are **depth/range** classifications and produce **only** SOLID linework;
`hidden` is produced **exclusively** by the occlusion engine. That separation is the contract.

`ViewScope` (`packages/core-app-model/src/views/ViewScope.ts`) is the ONE encoding of this
table. `viewPlane.isVertical` is the only legitimate difference between the three consumers.

> ⚠ **CORRECTED 2026-08-22 (lane VIEW6, L-3904) — the elevation CUT cell read *"empty by
> definition — an elevation slices nothing"*, and it had been false for months.** `ViewScope.ts`
> carries its own correction notice saying so: §ELEV-LINEWEIGHT (**L-182**) makes
> `EdgeProjectorService` emit a `:cut` layer for elevations too, for geometry the elevation plane is
> drawn THROUGH, so the heavy cut pen can establish the weight hierarchy.
>
> **The confusion is the `ViewScope.cut` flag, which does not mean what its name suggests here.** It
> selects `EdgeProjectorService`'s SECTION ROUTING branch. It is `false` for elevation because the
> elevation branch emits its own `:cut` linework (L-182) — **not** because there is no cut band.
> Reading the flag as "an elevation has no cut" is what kept this row wrong, and what kept
> §4.6.2's poché sentence wrong beside it.
>
> **Read `ViewScope.ts`, never this table**, and when they disagree the code is the newer fact here —
> raise the correction in place rather than restating the flag.

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
default.

**§4.6.2a — ELEVATION POCHÉ IS *VIEW-TYPE-DECLARED*, NEVER INHERITED** *(normative; corrects
§4.6.2 in place — lane VIEW6, L-3904, 2026-08-22; the clause implements L-1601)*

⚠ **§4.6.2 used to end: *"Elevations have no cut and therefore no poché (`ViewScope.poche =
false`)."* BOTH HALVES ARE FALSE.** An elevation HAS a cut band (§4.6.1, corrected above) and
`_ELEVATION_SCOPE.poche` is **`true`** — §ELEVATION-POCHE-IS-INTENT-DECLARED (**L-1601**) turned it
on, and `PlanViewCanvas._renderPocheFills()` runs for elevations today.

**The normative rule.** An elevation MUST paint a cut fill **only** where the bound intent declares
one **for the elevation view type** — a `viewTypeProfiles['elevation']` entry or a
`viewTypeModifiers` row scoped to it (`viewTypeDeclaresCutFill()`). The
`ISO_CUT_LAYER_TO_POCHE_FILL` default and the VG template seed are **NOT fallbacks** for an
elevation, and **a fill inherited from the intent's BASE element rules is NOT a declaration.**

⭐ **WHY INHERITANCE MUST NOT COUNT — measured twice.** Every system intent seeds PLAN poché tones
on its base element rules (slab `#dcdcdc`, wall `#c9c9c9`). An elevation that merely asked *"does
the resolved cut appearance have a fill?"* would answer YES for every category in every project and
paint the whole façade grey — which is §FIX-ELEVATION-POCHE (**L-119**) recurring in a lighter
colour. L-1601 measured exactly that on its first cut, and this predicate is what the failing arm
forced.

⛔ **CONSEQUENCE THE UI MUST DISCLOSE (normative).** The Element Rules surface writes BASE rules, so
a cut fill set there is inert for elevations *by this clause*. **A control that stores a value which,
for a whole view family, nothing can ever draw MUST say so at the point of entry and MUST name the
surface that does work** — here, the View Modifiers tab. Storing it silently is a defect of the same
family as a gate whose "yes" branch is unreachable from the UI. Implemented by
`VisibilityIntentPanel.renderElevationPocheNote()`, scoped to the `cut` state (on any other state
the sentence would be false).

Both directions are pinned by `apps/editor/__tests__/elevationCutPocheIsIntentDeclared.test.ts`:
arm 1 — a declared elevation cut fill FILLS; arm 2 — no declaration fills NOTHING. Arm 2 is what
makes arm 1 safe to ship: a suite with only arm 1 would pass on a build that fills unconditionally,
i.e. on the L-119 regression.

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

**§4.6.4f — AN ELEVATION IS A DRAWING, NOT A PHOTOGRAPH OF A SOLID — AND ITS PICTURE PLANE MUST
BE TOTAL** *(added by L-1240, §ELEV-SYMBOL-OPENING; normative)*

Two rules, from one founder report (*"it MALFORMS the window in elevation. Where the bottom and
top are TRUE HORIZONTAL, we ANGLED them"*) and one measurement. The per-family detail is
[C86 §10.2](C86-ELEMENT-WALL-OPENING.md); what belongs HERE is the part that binds every family.

**(1) THE PICTURE-PLANE BASIS MUST BE TOTAL, AND MUST REFUSE RATHER THAN NO-OP.**
An elevation's or section's orientation MUST be computed for **every** horizontal projection
direction, with its vertical axis **always world +Y**, and MUST **refuse by name** (C16 CA-18)
for a direction with no horizontal component. ⛔ A table of N supported directions whose
otherwise-branch leaves the orientation UNCHANGED is forbidden.

*The defect this closes, measured 2026-08-19.* The pipeline oriented its drawing through OBC's
`TechnicalDrawing.orientTo(direction)`, which handles **six** axes and ends
`else console.warn("… does not match any of the 6 standard axes.")` — **warning and leaving the
quaternion untouched**, i.e. the IDENTITY on a fresh drawing. `toDrawingSpace` then keeps
`(x, z)` and discards `y`. **A non-cardinal elevation therefore drew the model's PLAN**, while
`PlanViewCanvas.setSectionAxes(…, flipV = true)` had already committed to reading the result as
an elevation. Every horizontal line came back tilted by its host's plan BEARING. Reachable
today from `SectionPlanToolHandler`, which writes the tail the **user drew** as
`projectionDirection`. The authority is now
`packages/core-app-model/src/drawing/ElevationViewBasis.ts`, whose four cardinal quaternions are
asserted **byte-identical** to the library's, so adopting it cannot move a line in any view that
already worked.

⭐ **This is the §CONTEXT-DATA-HONESTY shape in a renderer**: *"unsupported"* and *"drawn
correctly"* had the same value on screen. The `console.warn` existed and nobody was reading the
console.

**(2) AN ELEMENT WITH A CONVENTIONAL ELEVATION REPRESENTATION MUST HAVE AN AUTHORED SYMBOL FOR
IT.** Where a drawing convention exists for a family in elevation, its linework MUST be **set out
from the element's own record** and MUST NOT be the projected edge-dump of its mesh. The symbol's
polylines MUST each carry a `DrawingZone` and **no pen** (§4.6.4b), and MUST be injected onto
**zone-suffixed** layers so the ladder of §4.6.0 and the per-element overrides of §4.6.4b reach
them.

⛔ **A flat, zone-less symbol layer is in breach of this clause.** Named rather than implied,
because the tree contains a live example: `PlumbingElevationSymbolBuilder` injects onto a bare
`'A-PLMB'`, which `drawingZoneFromLayerName()` classifies as `null`. That is the L-280
flattening in a second file. `OpeningElevationSymbolBuilder` emits `A-GLAZ-SYM:proj` /
`A-DOOR-SYM:hidden` instead; the plumbing builder is **OWED** the same correction (L-1240).

**(3) A SYMBOL REPLACES THE SOLID'S LINEWORK — AND WHICH ELEMENTS IT REPLACES MUST BE DERIVED.**
Where a symbol is emitted for an element, that element's raw projected linework MUST be removed,
so the drawing shows the symbol INSTEAD OF the wireframe. ⛔ **The suppression MUST be keyed on
the elements whose symbol was ACTUALLY EMITTED, never on a list of element types assumed to have
one.** A type list silently deletes the linework of every element the builder skipped or refused
— strictly worse than the clutter it removes — and does not cover a family that gains a symbol
later. Both directions MUST be pinned: *emitted ⇒ removed*, **and** *absent ⇒ retained*.

*Shipping the symbol without this clause is not a partial fix, it is a regression.* The original
report was *"it MALFORMS the window in elevation"*; a correct symbol drawn ON TOP of the malformed
wireframe leaves the malformed linework on screen and adds more.

⛔ **AND THE FORBIDDEN "FIX" IS NAMED.** A malformed projected outline MUST NOT be clamped,
snapped or straightened to the axis it ought to lie on. That substitutes a plausible drawing for
a wrong one and removes the evidence. Fix the construction, never the appearance.


**§4.6.4g — A TESSELLATION SEAM IS NOT AN EDGE** *(added by L-1242, §ELEV-SYMBOL-WALL; normative)*

A curved or otherwise tessellated solid MUST NOT contribute its **facet boundaries** to a drawing.
An element in elevation or section shows its **silhouette and its real features**; the seams that
exist only because a smooth surface was approximated by flat facets are an artefact of the mesh, not
of the building.

*The measurement.* A curved wall projected at `THREE.EdgesGeometry`'s default ~1° dihedral threshold
emitted **`2 × (segments + 1)`** vertical lines — 34 at 16 segments, 66 at 32, exactly. ⭐ **The
count of lines in the drawing was a function of the tessellation density**, which no architect
authored. The founder's words were *"MANY VERTICAL LINES — they should render CONTINUOUSLY"*.

⛔ **This MUST NOT be fixed by raising a global dihedral threshold.** That buys one clean curved wall
by silently dropping genuine edges on every other element. The correct fix is that the seam is
**never created**: the element's authored symbol traces the curve as a continuous polyline, and the
faceted solid is suppressed by the §4.6.4f(3) rule. Where a per-mesh threshold IS used, it MUST be
derived from that mesh's own tessellation rather than set to a global constant, so the rule holds for
a 4 m arc and a 40 m one alike.

⚠ **A genuinely faceted element MUST still show its edges.** Both directions MUST be pinned — a
curved element shows no seam lines, **and** a faceted one still shows its creases — because a
one-way assertion cannot tell a correct seam rule from a threshold that has swallowed real geometry.

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

> ⚠ **AND THE OCCLUDER SET WAS *STILL* NOT THE PROBLEM — corrected in place, lane HLR18,
> L-5300, 2026-08-22.** The paragraph above is true and was, for nine months, read as the whole
> story: *"the set was crippled, we widened it, done."* An elevation then registered its
> occluders, ordered them, selected them as nearer — and hid **nothing**, and the founder
> reported seeing an interior door through a façade. The engine's own log said so in one line
> and nobody read it as the refutation it was:
>
> ```
> 3 occluder(s) (0 cut, 3 projected), disposition=demote, 0 sub-segment(s) demoted
> ```
>
> **Three uncut, projected occluders present. Zero demotions.** Presence is not coverage. A
> census of the occluder SET can be complete while every member of it covers the empty region,
> and the count reads healthy either way.

**(a1) THE SILHOUETTE RULE — NORMATIVE (added L-5300).** *An occluder's coverage region MUST be
derived from a CANONICAL edge set, and the coverage predicate MUST be one the edge set can
actually support.*

`EdgeProjectorService` builds `:proj` linework from `THREE.EdgesGeometry(mesh.geometry, angleDeg)`
— the solid's full **wireframe**, not its outline. Measured on a face-on 6 × 3 × 0.3 m wall box:
**12 projected edges**, of which **4 are zero-length** (edges parallel to the view direction
collapse to points under orthographic projection) and the remaining **8 are the outline rectangle
traced TWICE**, front face over back face, exactly coincident. Even-odd point-in-polygon counts
two crossings for every one real boundary transition, reads EVEN, and answers **OUTSIDE for every
interior point**. A wireframe is not an outline, and the difference is not a rounding error: it is
total.

Three rules follow, all binding:

1. **CANONICALISE FIRST.** Zero-length edges are dropped; coincident edges are de-duplicated on a
   quantised vertex grid. Measured effect: the box above goes 12 → 4 edges and covers correctly;
   a wall with a real window opening goes 24 → 8, outer loop plus hole loop, and the hole still
   reads see-through; an L-shaped massing goes 18 → 6 and keeps its notch.
2. **EVEN-ODD IS ONLY SOUND OVER A UNION OF CLOSED CURVES** — every vertex of even degree. It is
   forbidden anywhere else. The same box **rotated 30° about the vertical** canonicalises to 12
   edges with **8 degree-3 vertices**: its four vertical corner edges and its collapsed top and
   bottom faces meet in T-junctions, no closed curve exists, and even-odd still answers OUTSIDE
   across its interior.
3. **DEGRADE EXPLICITLY, AND COUNT IT.** Where even-odd is unsound the engine falls to the
   **vertical-span hull** — at each H, cover the interval between the lowest and highest crossing
   of the vertical line through the sample. Exact for any *vertically simple* silhouette (an
   oblique wall, a stair profile, an L-massing notch); strictly tighter than the AABB; over-claims
   only where a silhouette has a vertical concavity that is not a closed void (an archway, a U).
   Below that sits the AABB, reached only when fewer than three canonical edges survive. **Every
   step down the ladder is counted (`vspanFallbacks`, `aabbFallbacks`) and printed on every pass**
   — Contract 23 §9 forbids a silent cap, and here a silent cap is a false NEGATIVE, which is the
   founder's report.

**(a2) ONE OCCLUDER PER `(element, ZONE)` — NOT per element (added L-5300).** Occluders were
grouped by `elementUUID` alone, which unioned an element's `:cut` section ring with its `:proj`
wireframe into ONE region at depth −∞. That union is not the boundary of any region — even-odd
cancels wherever the two overlap — and it credited a merely-*projected* face with the *cut* band's
−∞ depth. In an elevation, where §ELEV-LINEWEIGHT (L-182) gives many elements **both** bands, the
merged set was geometric nonsense. The element's `uuid` is still carried on each occluder, so
*"an element never hides its own linework"* is unaffected — that guarantee never depended on the
grouping key.

**(a3) A SYMBOL THAT *REPLACES* A SOLID INHERITS ITS DEPTH (added L-5303).** Where a builder
injects an authored elevation symbol and then deletes the solid's raw linework
(`suppressSymbolisedElementLinework`), the symbol MUST carry the `viewDepth` of the solid it
replaced. Otherwise the solid's occluder is deleted and its replacement is refused as an
unstamped `:proj` node — and **a symbolised façade wall occludes nothing**, which is a second,
independent cause of the same user-visible defect, in a different file, that (a1) does not touch.
The transfer is the only admissible source for the number: the symbol stands where the solid
stood. An element whose solid carried no stamp leaves its symbol unstamped, and the engine goes
on refusing to guess.

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

- **(§4.6.5(a2), L-6010) A HOST NEVER OCCLUDES WHAT IT HOSTS, AND THE RULE IS SEMANTIC.** *True
  projection*: what the eye sees from the view direction is PROJECTION; what lies BEHIND a solid is
  HIDDEN. A window hosted in the façade is **part of the face the viewer is looking at** — it is not
  behind that wall, it is IN it, and a wall cannot be in front of its own aperture. Founder,
  2026-08-22: *"even the windows that should be seen in projection line — which are the hosted
  windows on the main wall — are in hidden line — this is incorrect."*

  The occluder guard `o.uuid !== uuid` is **NOT sufficient**: a wall and the window it hosts are two
  different uuids, so the wall's nearer `:proj` occluder demoted every façade opening whose glazing
  sits back inside its reveal. **Three relations are exempt, and each is a separate claim:**
  (1) the occluder IS the target's host; (2) the target IS the occluder's host (a window projecting
  PROUD of its wall must not punch a hole in it); (3) both declare the SAME host (two windows in one
  wall are both on the visible face).

  ⛔ **The exemption MUST be HOST-SCOPED, never family-scoped.** A blanket *"openings are never
  occluded"* rule re-opens §ELEV-FACADE-HIDES-INTERIOR (L-5300) — the founder's other named case, an
  interior door on a partition behind the façade, which MUST still demote. The regression guard is
  therefore part of the rule, not an optional companion to it.

  ⛔ **AND IT MUST NOT BE A DEPTH MARGIN.** §FEAT-WINDOW-REVEAL (L-1920) makes the recess
  USER-AUTHORED, so no `depthMargin` is safe at any value. The relation is **declared data** —
  `Window.wallId` / `Door.wallId` (C15) — carried to the drawing as `userData.hostId`.

- **(§4.6.5(a2), L-6013) THE HOST RELATION MUST BE PROVED *AT THE DRAWING*, NOT AT THE ENGINE.**
  A suite that hand-stamps `hostId` onto its own fixtures proves the engine honours the stamp and
  **nothing** about whether the stamp arrives. MEASURED: in an ELEVATION a window's linework is the
  **injected symbol**, because `suppressSymbolisedElementLinework` deletes the projected solid's
  wireframe for every element `OpeningElevationSymbolBuilder` covered (§ELEV-SYMBOL-OPENING, L-1240).
  A stamp made only on the mesh wrapper therefore lands on a layer that is no longer there. Every
  producer of occludable linework — native projection, **the projection cache's replay branch**, and
  each symbol injector that emits for a hosted family — MUST carry the relation, and a guard MUST
  assert it after a real `inject()`.

- **(§4.6.5(a1), L-5300) EVERY OCCLUDER FIXTURE MUST BE BUILT FROM A REAL SOLID.** A guard that
  hand-authors an occluder as one clean closed rectangle CANNOT FALSIFY THE PRODUCT, because
  `EdgeProjectorService` never emits that shape. `HiddenLineRemoval.elevationOcclusion.test.ts`
  passed, and has always passed, across the entire lifetime of a defect in which an elevation
  façade hid nothing at all. **A fixture easier than production is not a weak test; it is a test
  of a different system.** Occluder fixtures MUST be pushed through the same `EdgesGeometry` the
  projector uses.
- **(§4.6.5, L-5310) THE FAMILY CENSUS IS EXECUTABLE, NOT PROSE.** *"Reviewed for every possible
  element"* is discharged by a table with one row per family and a measured verdict in both
  directions — **does it occlude · is it occludable** — driven through the real engine with a
  representative solid. A family that legitimately does neither (a grid datum) is a correct row;
  a family that should and does not is a finding, and MUST carry its `file:line` reason.

*Guarded by* `packages/core-app-model/src/drawing/DrawingZone.test.ts` (20 assertions),
`apps/editor/__tests__/perSolidZoneClassification.test.ts` (§4.6.1a, 11 assertions),
`HiddenLineRemoval.planPoche.test.ts`, `HiddenLineRemoval.elevationOcclusion.test.ts`,
**`HiddenLineRemoval.facadeSilhouette.test.ts`** (L-5300..L-5303, 10 assertions — the founder's
named interior-door case, built from real solids) and **`HiddenLineRemoval.familyCensus.test.ts`**
(L-5310, 42 assertions — 18 families plus the six family-blind zone rules).

**§4.6.7 — Open cells (recorded, not faked).**
- **A per-VIEW override of `occlusionDisposition`.** §4.6.5(b) says a view MUST be able to
  choose; today the default is carried per view *type* on `ViewScope` and the engine honours
  whatever it is handed, but there is no field on `ViewDefinition` and therefore no user-facing
  switch. The type is in place; only the plumbing is missing.
- **Plan projection-occluders are enabled but conservative** — see §4.6.5(c). Widening rule (1)
  requires a real answer to "may a slab occlude the storey below?", which is a *view-range*
  question, not an occlusion one.
- **Two families reach the drawing on a ZONE-LESS layer and are therefore invisible to occlusion
  in BOTH directions** (measured, lane HLR18, L-5310/L-5311, and pinned in
  `HiddenLineRemoval.familyCensus.test.ts`):
  - **imported IFC linework** — `EdgeProjectorService.addIfcLayer` writes the flat base name with
    no zone suffix, no `elementUUID` and no `viewDepth`. An IFC model neither hides nor is hidden.
  - **the plumbing ELEVATION symbol** — `PlumbingElevationSymbolBuilder` injects onto a flat
    `A-PLMB` (`packages/geometry-plumbing/src/PlumbingElevationSymbolBuilder.ts`:33,:72), and the
    fixtures carry `skipInElevation` so the raw solid never projects either. This is the flattening
    §4.6.4b already names, reaching occlusion as well as the pen.
  Both are emitter defects, not engine defects, and neither is repaired by L-5300.
- **A solid OBLIQUE to the picture plane is covered by the vertical-span hull, not its true
  silhouette** (§4.6.5(a1) rule 3). Exact for walls, stairs and L-massings; over-claims on an
  archway or a U-section.
  > ⚠ **L-6017 (lane ELEV28, 2026-08-22) — the hull was NOT the cause of the founder's demoted
  > façade windows, and this cell stays OPEN anyway.** It was offered as the leading hypothesis
  > (36 of 78 occluders had degraded to it on his pass, and a hull is strictly larger than the
  > solid it replaces). MEASURED against it: the HULL CASE in
  > `HiddenLineRemoval.trueProjection.test.ts` builds a 30°-yawed host, asserts `vspanFallbacks > 0`
  > so the hull is genuinely in play, and asserts the hosted window survives — **RED before the host
  > exemption (§4.6.5(a2)) and GREEN after, with no change to the hull code at all.** The hull was
  > the mechanism by which the missing exemption bit hardest, not the defect.
  > ⛔ **Its own over-inclusiveness remains UNPROVEN IN EITHER DIRECTION**: nothing measures whether
  > it over-claims for an **unhosted** element behind an oblique wall. Do not close this cell on the
  > strength of that lane. The exact answer needs the projected FACE loops, which the drawing layer
  does not receive — it receives an edge soup. Closing it means the projector emitting a silhouette
  alongside the wireframe, which is a projector change, not an engine one.
- **`beyond` is still clipped by `cut` occluders only** even in an elevation, where the founder's
  rule (*"whatever seats behind the wall is with hidden lines"*) argues for projected solids
  clipping it too. The carve-out that forbids this exists to protect PLAN (§4.6.5(c)1) and must
  survive any change. The right shape is a per-view option resolved off `ViewScope`, the same
  precedence as `occlusionDisposition`; it is NOT plumbed, and it is recorded rather than guessed.

---

### §4.6.7 — THE CROP IS THE CLIP (normative; elevation + section)

> **The far plane of an elevation or section is EXACTLY the far edge of its crop rectangle, and
> the near plane is EXACTLY the near edge.** There is no epsilon, no margin and no half-thickness
> between what the user draws in plan and what the drawing contains.

Founder, 2026-08-21: *"the elevation line … really defines accurately the place of cut of the view,
which is sound — however the extension of it is not aligned with the further line of the square crop
in plan view … the user should be able to absolutely and super accurately define the crop view, and
this would/should define precisely what the elevation shows."*

This clause sits beside §4.6 for the same stated reason §4.6 exists: **the quantity was re-invented
per caller and drifted.** §4.6 governs which ZONE a segment is in; §4.6.7 governs which segments
EXIST at all. They compose — narrowing the crop removes geometry, it does **not** reclassify what
remains, and no change made to satisfy §4.6.7 may alter a cut / projected / beyond / hidden verdict.

**§4.6.7a — ONE resolver, named.** Every producer of an elevation/section depth window — the
projector's clip planes, the oriented section volume, the plan scope rectangle, its depth caption,
and the scope-drag seed — **MUST** resolve through `resolveElevationClipRange()`
(`packages/core-app-model/src/views/ViewDefinitionTypes.ts`). A second expression for this quantity is
a contract violation regardless of whether its answer currently agrees, because agreement between two
producers is a coincidence and not an invariant (C06 §13.3).

**§4.6.7b — the three stores, and the precedence between them.** The window is persisted redundantly
and this is not yet unified (`crop.farClip.offset`, `spatial.sectionVolume.near/far`,
`spatial.viewRange.nearOffset/farOffset`). Until it is, the resolution order is normative:

- **far** — `crop.farClip.offset` → `sectionVolume.far` → `viewRange.farOffset` → the caller's named
  fallback. The dedicated field wins because it is the one the *"View Depth (m)"* input writes; if its
  mirror won, a typed depth would be silently inert.
- **near** — `sectionVolume.near` → `viewRange.nearOffset` → `0`. `viewRange.nearOffset` means *"cut
  height above the FLOOR"* (DOC-1.5d) — a **plan** concept with no meaning in depth space — and
  survives only because `roomInteriorElevations` writes it on views carrying no section volume.

**§4.6.7c — `spatial.cropRegion` is NOT a clip range.** It is an axis-aligned XZ AABB used to CULL
before the edge pass, read **only** for plan-family views (`resolveViewScope(viewType).planFamily`),
and inflated outward by `CROP_REGION_CULL_MARGIN_M` on every side. Diagnostics **MUST NOT** print it
adjacent to a clip range without labelling it as a cull box: an unlabelled pairing invites the reading
that the margin is a clip defect, which it is not, and that misreading has already cost a lane.

**§4.6.7d — no writer may store a depth window it cannot draw.** A stored `far` below
`near + MIN_ELEVATION_CLIP_DEPTH_M` yields an elevation showing nothing behind a grab handle sitting
on its own origin. Every writer clamps above that floor today; the floor lives in the shared resolver
so it cannot be applied to one side of the equality only.

**Gate:** `packages/core-app-model/src/views/__tests__/elevationCropIsTheClip.test.ts` (the rule over a
depth sweep) and `apps/editor/__tests__/ElevationCropIsTheClipBox.test.ts` (the oriented box, plus a
structural arm that fails when a fifth rival expression appears). ISSUE-LOG **L-4500..L-4506**.
**Status:** added 2026-08-22.

**§4.6.7e — THE CROP IS ALSO THE SCOPE: an elevation's crop bounds THREE axes, and every stage that
selects elements MUST read the SAME frame** (normative; L-6000..L-6004, added 2026-08-22).

Founder, 2026-08-22: *"i am selecting a window that should be on the scope of the crop box but is
not, is way further away — absolutely incorrect"* … *"also the performance of opening the elevation
view is really slow."* ⭐ **These are ONE defect.** A depth-projected view that applies no spatial
scope at element-selection time puts out-of-crop linework into the drawing — where it is hit-testable
— **and** pays the full edge-projection cost for it. Fixing the selection symptom without the cost
symptom, or the reverse, means the root was not found.

- **§4.6.7e(1) — an elevation's crop is its SCOPE, not merely its picture window.** It bounds
  **LATERAL** (`±width/2` along `right`), **DEPTH** (`[near, far]` along `forward`, from §4.6.7a's one
  resolver) and **VERTICAL** (§FIX-ELEVATION-VERTICAL-CROP / L-302: the whole level stack by default,
  `crop.region[1]` once dragged). ⚠ A remedy that addresses only the depth axis does not close this:
  the founder's own case is a window off to the SIDE at the SAME depth.

- **§4.6.7e(2) — ONE frame, delegated, never re-derived.** The oriented frame is resolved by
  `packages/core-app-model/src/views/ElevationScopeFrame.ts`. `EdgeProjectorService`'s
  `resolveSectionVolumeBox` DELEGATES its explicit-`sectionVolume` branch to it, `SectionVolumeBox` is
  a type ALIAS of `ElevationScopeFrame`, and `sectionBoxIntersectsWorldAABB` delegates to
  `scopeFrameIntersectsWorldAABB`. **It lives at L2 because the element-selection stage
  (`NativeElementMeshExporter`) is L2 and could not import an L7 answer** — which is exactly why it
  had none. A second implementation at either layer is a §4.6.7a-class violation.

- **§4.6.7e(3) — the scope test is INTERSECTION, and the cull is a COST decision, never a graphics
  one.** A cull earlier in the pipeline MUST be provably implied by a drop the pipeline already
  performs: the exporter tests an element's ROOT world AABB — the union of its meshes' AABBs — so a
  root that misses the frame contains no mesh that could have passed the projector's own per-mesh
  gate. Containment testing is FORBIDDEN: a straddling solid survives the cull and is CLIPPED at the
  boundary by `clipSegmentToSectionBox` (this is §FIX-ELEVATION-CROP-CLIP / L-123's real concern, and
  it is honoured rather than reintroduced).

- **§4.6.7e(4) — ABSENT ≠ UNREACHABLE, and the diagnostic MUST say which.** A view carrying no
  explicit `spatial.sectionVolume` is framed from its linked annotation, which lives in an L7 store;
  that case culls NOTHING and MUST report `scope=ABSENT`. A stage that silently applies no scope is
  indistinguishable from one that has decided the view is unbounded — which is precisely how
  `No levelId — exporting all 385 elements` read as a fact about the model for as long as it did.
  ⚠ §4.6.7c stands unchanged: `spatial.cropRegion` is still the plan-family CULL box and is still not
  read for an elevation. The elevation's scope is the ORIENTED frame, not that AABB.

**Gate:** `packages/core-app-model/src/geometry/NativeElementMeshExporter.elevationScope.test.ts`
(three axes plus the depth-straddler and the cost ratio, over the founder's own reconstructed frame).
ISSUE-LOG **L-6000..L-6004**. **Status:** added 2026-08-22.

---

### §4.7 — THE ELEMENT FILTER WRITES INTENT (normative; ADR-0336, OI-058, P7 ARM B)

**The Project Browser's ELEMENTS list is a WRITER of visibility intent, never an authority over
what is visible.** It MUST express a hide / isolate / reset as an intent delta on the ACTIVE
view, dispatched through the command bus. It MUST NOT mutate `Object3D.visible`.

This is §4.1 ("ALL visibility is derived from intent") and §4.2 ("never by setting UI state
directly") applied to the one control that has always violated both. It is stated separately
because the violation was invisible for as long as only ONE view was consulted.

#### §4.7.1 — Why this was never a rendering bug

`Object3D.visible` is read by the **3D viewport only**. The projected views (plan · section ·
elevation, and the sheet viewports that delegate to them) are built by
`EdgeProjectorService` **Source B** from `NativeElementMeshExporter.exportForView()` — i.e. from
**BimManager levels + elementRegistry**, never from the scene graph. Source B contains **zero**
reads of `Object3D.visible` (the file's only such read, `:3288`, is in the IFC branch).

⇒ *"the browser filter does not work in plan"* was **UNSATISFIABLE, not broken**. Before asking
*why does this not apply?*, ask **can this condition ever be true?** — this is the sixth defect
of that shape recorded in this repo.

⚠ **3D "working great" was the misleading signal, not the healthy one.** Mutating
`Object3D.visible` is the correct *application* of intent in the one surface whose output medium
is the scene graph. The filter was writing THE ANSWER FOR ONE VIEW where it owed THE QUESTION
FOR ALL OF THEM.

#### §4.7.2 — The authority (binding)

`ViewIntentInstance.localOverrides` (`OverrideLayer.visibilityOverrides`) is **the single
authority** for per-element and per-category visibility. It is per-VIEW, persisted
(`ProjectSerializer` / `ProjectLoader`), undoable, and keyed by
`targetKind: 'element' | 'elementType' | 'category'`.

Every view type is a **READER** of that one authority:

| Reader | Mechanism | State |
|---|---|---|
| plan · section · elevation | `graphicsRulesEngine.resolveStyle({ viewId, elementId })` → `appearanceToPenStyle` → `opacity/widthMm = 0` | **works today** |
| sheets / viewports | delegate to the plan source via `ViewSource` | inherits |
| 3D viewport | applicator arm reading the resolved layer → sets `Object3D.visible` | **to build** (§4.7.5) |

⛔ **A second per-view traversal MUST NOT be added.** N enumerated arms is the defect this
contract exists to prevent.

⚠ **`applyToProjectionLayers` is NOT the per-element route and MUST NOT be extended into one.**
It drives `drawing.layers.setVisibility(layerName, …)` across 14 ISO-13567 DXF layers and has
**no `elementId` in scope anywhere in the method**. It is per-CATEGORY by construction. **The
per-element route is the PEN, not the LAYER.**

#### §4.7.3 — Scope semantics (per-VIEW; Revit alignment)

A hide issued from the Project Browser is **VIEW-scoped** — not project-wide, not
template-wide. An INTENT is shared by N views (the panel's *"Used by 8 views"*); an OVERRIDE is
local to one (the panel's *"NO OVERRIDES"*). Binding consequences:

1. Switching views does **not** carry the hide across. This is correct.
2. Because it is correct-but-surprising, **the panel MUST name the view it is acting on.** A
   control that silently retargets on view switch is indistinguishable from a broken one.
3. A project-wide hide is a **separate, named act** — editing the bound intent's
   `elementRules[elementType].visible`. It MUST NOT be an unlabelled side effect of the same
   control.

#### §4.7.4 — `Reset visibility` clears OVERRIDES

It MUST dispatch `view.clearAllOverrides` for the active view, restoring the *"Pure intent / NO
OVERRIDES"* state. It MUST NOT walk the scene setting everything visible — that desynchronises
the scene from the authority and is what the code does today.

#### §4.7.5 — Ordering is binding: 3D reads intent BEFORE the traverses are deleted

`ProjectVisibilitySection.ts` holds **8 full-scene traverses** and **13 of the 40** tolerated P7
ARM-B violations — the largest single holder, and the same code counted twice (once as perf,
once as P7).

They MUST NOT be removed in the change that starts writing intent. Until 3D reads
`OverrideLayer`, deleting them regresses the only view that works — a refusing half with no
escape hatch. Therefore:

- **Step 1** — the filter writes intent *in addition to* the existing scene write.
  Plan/elevation/section begin working. **No P7 or OI-058 credit may be claimed at Step 1.**
- **Step 2** — the 3D applicator arm lands; only then do the traverses and the `bag.*Visible`
  maps come out, retiring 13 ARM-B violations and 8 traverses together.

**Claiming Step 2's numbers while shipping Step 1 is forbidden.**

#### §4.7.6 — Panel state is a PROJECTION, never a source of truth

`UnifiedBrowserPanel._elemVisible` / `_catVisible` / `_levelVisible` / `_isolateMode` are
in-memory `Map`s with **no serializer entry** and **no re-apply hook** — so any scene rebuild
silently drops the filter while the panel still renders the eye-off icon (state and scene
disagree, and the UI reports the state). The remedy is **not to persist them**: they MUST become
a projection of the override layer, which is already persisted and already survives reload and
project switch.

#### §4.7.7 — Open cells (recorded, not faked)

- **`OverrideTargetKind` has no `'level'`.** The browser's LEVEL axis and the `ifc-storey:` path
  have no intent expression. Mint a kind, expand to N element overrides, or leave the level axis
  3D-only — **undecided; MUST NOT be silently mapped onto `category`.**
- **Five rival visibility mechanisms exist; this section blesses ONE.**
  `vgInstanceOverrideStore` is `@deprecated`, zero writers, not persisted;
  `visibilityRuleEngine` is persisted but has no human UI (AI-only);
  `packages/visibility`'s `ViewVisibilityIntentStore` is bus-wired and read by `SpatialTree`, but
  its own header declares **NOT PERSISTED · NOT UNDOABLE · NOT REPLICATED**. Consolidation is
  **not** attempted here and MUST NOT be assumed.
- **A hidden element's hit-testing is unspecified.** The pen route drives `opacity → 0`; whether
  a zero-opacity line still selects in plan is **not measured**. A hidden element that remains
  clickable is a defect, but it is not one this section has proven either way.

---

## §5 — AI Cost Governance

`packages/ai-cost/` (L1) tracks per-call token usage and aggregates cost by project and workflow type. It:
- Records every AI call to `ai_usage` rows.
- Exposes `/api/ai/spend/summary` for the admin dashboard.
- MUST enforce `enforceAIQuota` before each call (§2.3).
- MAY block calls that would exceed a per-project monthly budget ceiling (configurable by the project owner).
