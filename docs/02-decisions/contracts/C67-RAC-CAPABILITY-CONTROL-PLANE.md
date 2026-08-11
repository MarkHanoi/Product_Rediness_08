# C67 — RAC: The Natural-Language Capability Control Plane

> **Stamp**: 2026-08-11 (rev 3 — the U0–U10 refresh) · **Status**: CANONICAL
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`; peers with C03 (commands/state), C11 (element creation), C15 (hosted elements), C16 (command authoring / semantic engine), C65 (element types). Supersedes nothing. **ADR-0313** records the resolver ladder and the registry; **ADR-0314** the parity/batch layer and undo-neutral `runBatch`; **[ADR-0315](../adrs/ADR-0315-universal-capability-architecture.md)** the universal capability architecture as it was actually built (one semantic front door, four execution classes, five context services).
> **Scope**: what the chat can do today (AS-IS, measured), what it must become (TO-BE), and the binding architecture for getting there.

---

## §0 — The one-sentence principle

> **The AI layer is never the source of truth for what the editor can do. The editor registers capabilities; language resolves against them; the LLM is an escalation mechanism, not the command router.**

Everything below is this sentence applied.

---

## §0.1 — What changed in rev 3, and why

Rev 2 was written on 2026-08-10, at the end of ADR-0313 phase 3: **16 capabilities**, a one-utterance-one-command resolver, no scope algebra, no planner, no LLM rung, and a §2 "TO-BE" describing all four as future work. Phases **U0–U8 and U10** landed in the following day. Left unedited, rev 2 would have understated the system by roughly a factor of three *and* described its own shipped layers as aspirational — the mirror image of the over-claim this contract exists to forbid.

Rev 3 therefore **moves four things out of TO-BE and into AS-IS** (the generator pattern, the scope algebra, the plan executor, the LLM rung), **re-states the enforcement section** against the eight checks added by `bccf08dc`, and **adds §1.6 — the open defects**, because a contract that records only what works is the lying table of C68 §2.2 wearing a governance badge.

**U9 (batch-creation parametrics + the remainder of the safe destructive tranche) is IN FLIGHT and is NOT claimed here.** Its first slice, U9.2 scoped deletion, is committed (`f5f3a5a1`); the rest is not, and §5 says so.

---

## §1 — AS-IS (measured at commit `f5f3a5a1`, 2026-08-11)

Every number in this section is printed by `npx tsx tools/ga-gate/check-chat-capability-coverage.ts`. Re-run it rather than trusting the transcription.

### §1.1 The resolution ladder that exists

```
utterance
  → §PLAN     compound splitter (U6)          — explicit connectives only, 0 tokens
  → tier 0    deterministic grammar            0 tokens
  → tier 1    synonyms + bounded typo repair   0 tokens
  → tier NL   semantic parse → SemanticIntent  0 tokens
  → §PLANNER  LlmPlanner (U10)                — LAST rung, paid, rare, skippable
        ↓ every rung emits the SAME IR and nothing else
  applySemanticIntent  ← THE ONE semantic authority
        ↓
  runtime.bus.executeCommand   (P6)
```

Three properties hold across the whole ladder and are what make it safe to extend:

1. **Every rung emits `SemanticIntent ∪ ScopeDescriptor ∪ ValueRefs` and nothing else** (ADR-0315 D1). No rung dispatches, resolves a catalogue, or invents a scope. This is precisely what made it safe to add the LLM *last* — it is validated and refused by the same code as tier 0.
2. **The local rungs are PURE** — no DOM, no stores, no network in the resolver; the five context services (`ScopeResolver` · `ValueResolvers` · `SiteQuery` · `RoomQuery` · `FacadeOrientation`) are **injected** through `ResolverContext`. An absent service **refuses honestly**; it never silently widens.
3. **Ladder order is pinned by test**, not by convention — `packages/ai-host/__tests__/llm-planner.test.ts` §PLANNER and `apps/editor/src/ui/ai/__tests__/LlmPlannerBridge.spec.ts` assert that a sentence any deterministic rung claims produces **zero relay calls**. The token guarantee cannot regress quietly.

Destructive resolutions render a Confirm/Cancel card and dispatch nothing until confirmed.

### §1.2 The live measurement

| Measure | Value at `f5f3a5a1` |
|---|---|
| registered bus commands | **319** |
| chat capabilities | **45**, covering **31** commands |
| explicitly deferred (`CHAT_UNAVAILABLE`) | **51** |
| classified (`ChatCommandClassification.ts`) | **237** — B needs-design 133 · C internal 50 · D duplicate 48 · E unsafe 3 · F deferred 3 |
| **UNDECLARED** | **0** (baseline 0) |
| maturity | M2/M3 direct+selection **45** · M4 scope **13** · M5 true-batch **12** · M6 plans **1** · M7 generative **4** |
| examples EXECUTED through the real ladder | **138** (1 unresolved, ratchet 1) |
| adversarial utterances executed, none mutating | **18** |
| spatial scope probes honoured | **15** |
| capabilities with an adversarial pin | **36 / 45** |

Of the 45, **41 are authored records** in `ChatCapabilityRegistry.ts` and **4 are GENERATED** (`delete-furniture-scoped` · `delete-windows-scoped` · `delete-doors-scoped` · `delete-columns-scoped`, from `DeleteFamilies.ts`). That the count is no longer equal to the number of hand-written records is the point of §1.3.

### §1.3 The generator pattern — a capability is a TABLE ROW, not resolver code

This is the substantive architectural change since rev 2 and the reason the count moved 16 → 45 without the resolver growing. Four tables now feed **one generic arm** each, and `applySemanticIntent` remains the single switch:

| Table | Shape it generates | Landed |
|---|---|---|
| `intents/CapabilityExecutionSpec.ts` | *resolve scope → resolve value → dispatch ONE batch verb*, consumed by the one generic `applyExecutionSpec` | U4 |
| `intents/CatalogueFamilies.ts` | a **type-change family** — from ONE record the execution spec **and** the tier-0 grammar are both generated | U7.2 (`63f22496`) |
| `intents/PropertyVocabulary.ts` | a **property** — noun + synonyms (grammar), the kinds that genuinely accept it, the live route per kind, its bounds | U7.1 (`99f8efab`) / U7.3 (`f21fd6c6`) |
| `intents/DeleteFamilies.ts` | a **scoped destructive family** — `destructive: true` + `requireResolvedIds: true` set by the generator, never by hand | U9.2 (`f5f3a5a1`) |

The extension proofs are recorded in the source, not asserted here:

- **`set-door-type` (U4.3)** — a catalogue family added as **~94 lines of metadata with zero new resolver case code**.
- **U7.2** — window and door were moved onto the generator **byte-for-byte**, and **slab and ceiling were authored as new families** against `UpdateSlabsSystemTypeBatchCommand` / `UpdateCeilingsSystemTypeBatchCommand`, which reach the live geometry stores.
- **U7.3** — four new properties (`set-mullion-size`, `set-panel-thickness`, `set-baluster-spacing`, `set-baluster-width`) whose commit contains **zero changed lines in `ZeroTokenResolver.ts` and zero in `CapabilityExecutionSpec.ts`**.

The irregular shapes that remain hand-written are **listed with reasons** in the `CapabilityExecutionSpec.ts` header — creation, the level-query family, whole-model reference, coordinate entry, and the selection-fan-out dimension family. `wall` is deliberately not a catalogue-family row: its grammar is entangled with the colour and rake grammars that share the *"make all walls …"* opening, and its refusal copy is the founding incident's verbatim wording. **A hand-written arm is now a stated exception, and the count of them is ratcheted at 27.**

### §1.4 The scope algebra (U3 + U8)

Scope was an `'all' | 'selection'` field in rev 2, with three incompatible rival encodings elsewhere. It is now one type, `ScopeDescriptor`:

```
BASE      selection · ids · all · level · room · orientation
FILTER    filter{ base: BaseScopeDescriptor, predicates }   — WRAPS a base
```

- **Filters compose for free.** `FilterScope.ts` is a **pre-stripper**: it lifts the filter clause out of the sentence *first* and hands the capability grammar the remainder unchanged. No capability regex learned a filter, and every base arm the resolver already honoured is filterable. Nesting is deliberately **one level deep** — two stacked filters are one filter with two predicates.
- **Predicates** compare numeric properties that genuinely exist on (or are derived by a stated formula from) a stored record — `area` · `width` · `height` · `thickness` · `length` — plus type filters. **A property a record does not carry is a SKIP with a reason, never a silent zero** ([[context-data-honesty-family]]: failure and empty are the same value until you make them different).
- **Resolution happens ONCE, editor-side, over ids-only indexed paths** — never inside token loops. A resolution always reports what it SKIPPED and why. **An unresolvable scope is an `error`, never an empty-ids success.**
- **A filter never bypasses its base's own gate**: an empty or wrong-kind selection refuses with the capability's copy *before* anything is filtered.
- A filter that matches nothing becomes a refusal **quoting the real extremum** (U8.3), never an empty success — and where nothing carried the property at all, the copy says *that* rather than inventing an extremum.

### §1.5 The plan executor (U6) and the LLM rung (U10)

**`intents/SemanticPlan.ts` — compound sentences.** A splitter and nothing more. It cuts on **explicit** sequencing connectives (`then`, `and then`, `, then`, `after that`, a leading `first … then …`), hands each clause to the *existing* single-intent ladder, and packages the results as one `execute-plan` intent. It is **not** a second resolver (a clause no capability claims alone is not claimed inside a plan either), **not** an `and` splitter (`and` is overwhelmingly a noun conjunction in this domain), and **not** a way around a guard — every claiming guard is applied **per clause**, so a paste-back wearing a compound sentence refuses WHOLE.

> **Undo cost is stated truthfully, on the Confirm card, before consent.** Per **ADR-0314** `runBatch` is **undo-NEUTRAL**: N commands inside it are N history entries. A plan of N steps states N, never "one undo". Claiming "one undo" for a fan-out is anti-pattern C68 §7.f.

**`intents/LlmPlanner.ts` + `apps/editor/src/ui/ai/LlmPlannerBridge.ts` — the last rung.**

- **The vocabulary is GENERATED** from `allChatCapabilities()`. A hand-written prompt list would be the `c1902a5a` defect wearing a different hat, drifting silently, and the failure would look like *"the AI is dumb"* rather than *"the list is stale"*.
- **The field shapes are generated too**, and from something stronger than a hand-written schema: each capability's gate-verified `probe` UNION the intents the deterministic ladder produces for that capability's own declared examples.
- **The response schema is intents-only.** There is no free-text command string in it.
- **Validation REJECTS and never coerces**: an unknown intent id, an undeclared parameter, a scope mode the capability does not declare — all refused. The model gains **exactly zero new authority**; it emits the same IR every other rung emits and meets the same hard stoppers.
- **No relay configured is SKIPPED, not a mystery.** This deploy carries neither `CF_WORKER_URL` nor `ANTHROPIC_API_KEY`, so the rung is skipped cleanly and the panel **names what is missing**, using the same shipped `/api/health` `features.anthropic` read the PDF-import ladder uses — not a second opinion about the same fact.

**U10.3 drained the legacy QueryEngine by MEASUREMENT, not by deletion** (`e08530b8`). Every hand-written `AIPanel.COMMAND_TREE` pill is classified SERVED / SHADOWED / MISREAD by executing it, because *"drained"* is otherwise unfalsifiable — a pattern that stopped being reached because something upstream started eating it looks exactly like a pattern that was properly replaced. **71 phrasings are still uniquely SERVED** by the legacy path, in four families with stated reasons (read-only questions · visibility/selection · document surfaces · the wardrobe configurator), and **exactly one** provably-shadowed pill was removed. The panel now advertises the **registry**, not a transcription: one leaf per capability that declares an example, sending that capability's own declared example, with destructive ones warning *"asks first"* before they are clicked.

### §1.6 OPEN defects — recorded, not hidden

These are true at `f5f3a5a1`. Each is pinned by a test that fails when it is fixed, so the inventory cannot rot.

1. **29 MISREAD phrasings**, enumerated one by one in `apps/editor/src/ui/ai/__tests__/QueryEngineDrain.spec.ts`. The ladder claims them and produces the WRONG thing. The worst is **destructive**: *"highlight walls taller than 3m"* / *"isolate doors higher than 2 meters"* resolve to `set-height` and dispatch `wall.updateDimensions` — **a read-only visibility question silently RESIZES a wall.** Also: *"create 10 levels at 3m"* → `add-level` reading the COUNT as an elevation (one level at 10 m); *"create floor plan view"* / *"create stairs between levels"* / *"create slabs in all levels"* → `add-level`; *"make all slabs blue"* → `set-slab-type {typeRef: "blue"}`, whose **summary states a falsehood before the command refuses the nonsense type**; *"isolate level 2"* → `go-to-level`.
   > **The CLASS, not the instances, is the standing obligation.** These are all **claiming-discipline** failures: a grammar claimed a sentence whose opener it had no right to. C68 §5.j binds every new capability against the claiming-discipline corpus. Fixing the 29 does not discharge §5.j.
2. **`create-wall` → `wall.create` is an UNCLASSIFIED route.** Check 3e found it: a plugin handler (`plugins/wall/src/handlers/CreateWall.ts`) with neither the legacy-bridge signature nor a proof — the exact shape §FIX-CHAT-DEAD-ROUTES found dead 13/13 times. It is **not asserted dead** (composeRuntime registers it as authoritative and the P1 wall path is the flagship plugin route). Recorded as unclassified, ratchet baseline **1**, with the audit it needs named in the gate source.
3. **`beam.height` is an editable property-panel row while `BeamData` has no height.** `PropertyDescriptorGenerator.ts` renders `beam.height` as a writable NUMBER; the record carries `width` and `depth`, and `BeamFragmentBuilder` builds from those. This is the panel-layer twin of the lie U7.1 removed from the chat layer (`set-height` used to claim `beam`). The chat half is fixed; **the panel half is not**, and it is inside check 9's 42.
4. **Selection context is effectively single-element in the bridge** — *"the three doors I selected"* confirms against one.
5. **A stale selection id from a previous rebuild still fails at dispatch** — surfaced honestly; the fix belongs to the selection manager, not chat.

---

## §2 — The five layers, as they now exist

Rev 2 described these as the target. Four of five are built; the table says which, and against what.

| # | Layer | State | Where it lives |
|---|---|---|---|
| **1** | **CONVERSATION** — phrasing · pronouns · follow-ups · confirmations · replies | ✅ built | `ZeroTokenChatBridge.ts`, the Confirm/Cancel card |
| **2** | **SEMANTICS** — utterance → `SemanticIntent` + `ScopeDescriptor` + `ValueRefs`, implementation-independent | ✅ built, and now with a real scope algebra (§1.4) | `ZeroTokenResolver.ts`, `LocalNaturalLanguageResolver.ts`, `SemanticPlan.ts`, `FilterScope.ts` |
| **3** | **CAPABILITIES** — the registry, every entry carrying the §4.3 proof obligations | ✅ built, **and now generated** from four tables (§1.3) | `ChatCapabilityRegistry.ts` + the four generator tables |
| **4** | **PLANNING** — intent + capability → resolved targets, resolved values, N ordered steps, destructive flag, validation BEFORE dispatch | 🔶 **partly** — ordered multi-step plans with per-clause validation and truthful undo cost ship (U6); **parametric arithmetic and per-command precondition validation (`canPlace`) are U9, IN FLIGHT** | `SemanticPlan.ts`, `applyPlan` |
| **5** | **EXECUTION** — plan → the bus (P6) | ✅ built, in **four classes** per ADR-0315 D2: EXEC-1 command · EXEC-2 fan-out with an honest N-undo summary · EXEC-3 plan · EXEC-4 GenerationRequest (a **mapper** onto the shipped controllers, not a second pipeline) | `applySemanticIntent` → `runtime.bus` |

**The end-state invariant is now REAL, not promised:** level 2 receives the capability graph as its tools. One registry feeds local resolution, LLM tool selection, the command palette pills, help and suggestions — one source of truth, several consumers.

### §2.1 Three intelligence levels, permanently

| Level | Handles | Tokens |
|---|---|---|
| 0 deterministic | "undo", "set height to 3m" | 0 |
| 1 local semantic | "make all south-facing windows on level 2 larger", "duplicate level 0 then furnish it" | 0 |
| 2 LLM | "make it feel more open without changing the envelope" — *consuming the same registry as its tool list, emitting the same IR* | paid, rare, **skippable** |

---

## §3 — The canonical composite case: *"select a wall → create 4 windows, 2×2, sill 0.1, at equal distances"*

**Status: `create-windows-parametric` is registered and is one of the deliberately hand-written arms** (creation is a different template from batch mutation: two-mode payload, stated-default sizing, overlap maths, Confirm-card destructive flag). What U9 still owes is the **generalisation** — parametric creation across a resolved scope, with `canPlace` precondition validation per planned element and a pure preview count. The trace below is the acceptance shape for that generalisation and is **NOT-YET-TRUE in full**.

```
1 SEMANTICS   {verb: create, target: window, quantity: 4,
               dims: {w:2, h:2}, sill: 0.1, distribution: equal-spacing,
               host: current selection}
2 CAPABILITY  window.create-on-host  (family: openings/creation)
3 PLANNING    host = selected wall (refuse with reason if none / not a wall /
              RAKED — the L-812 gate, surfaced as chat text, never a throw)
              L = wallLength(host)          ← ARC length on curved hosts
              closed-form equal spacing; refuse if gap < min jamb, quoting the
              real numbers: "4 windows of 2 m need ≥ 10.4 m of wall; this wall
              is 8.2 m — 3 fit, shall I?"
              VALIDATE each: WallOccupancyStore.canPlace(host, oᵢ, 2) — the same
              gate the mouse uses; any conflict → per-window skip-with-reason,
              never a silent drop                       ← NOT-YET-TRUE (U9)
4 CONFIRM     the count, the dimensions and the UNDO COST, before consent
5 EXECUTION   N × ADD_OPENING with the C15 payloads (window type from C65
              defaults or a named type via resolveCatalogueRef)
6 REPLY       "Done — 4 windows placed at 1.24 m intervals." or the honest
              partial: "Placed 3; the 4th conflicted with the door at 6.1 m."
```

**Why this stays architecturally cheap:** every hard part exists as a proven primitive — `canPlace` (arc-aware, rake-refusing), `ADD_OPENING`, C65 type defaults, the C15 hosted-element frame, the refusal grammar, and now the scope algebra that says *which* walls. The planner adds **arithmetic and orchestration**, not new geometry and not a second mutation path.

---

## §4 — Binding architecture rules (merge-blocking, aligned with STR-03/04)

1. **P6 absolutism** — chat, and any LLM output, mutates only via the bus. An LLM may *propose* intents; they pass the same validator; there is no direct-execute path. Ever.
2. **One semantic front door** — `applySemanticIntent` is THE semantic authority. Every rung produces the same IR and dispatches nothing. A second resolution path is a defect regardless of how convenient it is.
3. **Two proofs per target** — probe-executed acceptance == declaration (**both directions**; silent over-reach is the same lie facing the other way) **plus** a source-anchored `commandProof`. A capability the gate cannot prove does not ship.
4. **Registry = only source of chat truth** — no second intent list, no per-feature `if` ladder, and no hand-written LLM prompt vocabulary. A command with no chat metadata turns the coverage gate red.
5. **A capability of a known shape is a TABLE ROW** — if the shape is *resolve scope → resolve value → dispatch one batch verb* (or a catalogue family, a property, a scoped delete), it is a row and it adds **zero resolver case arms**. A new hand-written arm must be justified in the `CapabilityExecutionSpec.ts` header, and the arm count is ratcheted.
6. **Honesty invariants** — refusal ≠ clarification ≠ miss; recognised-but-unsafe never reaches the LLM; **"Done" only after a command reports success**; partials reported as partial ("Changed N of M — K skipped: reason"), read off the command's own payload and never re-narrated; ambiguity refuses **naming both candidates**; a refusal quotes the project's real names, numbers and units; a granularity gap is refused **by naming the gap**, never widened.
7. **Claiming discipline** — a grammar may claim only sentences whose OPENER authorises it. Three guards are law, and all three came from real production defects recorded as **ISSUE-LOG L-823**:
   - **`descriptiveReportReason`** (`capabilities/CapabilityRefusal.ts`) — report-shaped and past-tense text can never command. §FIX-CHAT-REPORT-PASTEBACK: the founder pasted the assistant's own line back into the chat and the ladder **created a level from it, twice**, stacking two levels at 6.000 m.
   - **`Normalized.corrected`** (`intents/LocalNaturalLanguageResolver.ts`) — **typo correction may repair a word the user meant; it must never MANUFACTURE the imperative that authorises a mutation.** `add-level` now requires an **uncorrected** creation verb in opener position.
   - **`PROTECTED_FUNCTION_WORDS`** (`intents/ZeroTokenResolver.ts`) — §FIX-CHAT-STOPWORD-CORRECTION: bounded Levenshtein rewrote **with → width**, turning *"Created Aparment with 2 bedrooms"* into *"select an element first, then set its width"*. **A correctly spelled English function word is never a misspelled domain term** — while *aparment → apartment* is exactly what tier 1 exists to do.
   Guards apply **per clause** inside a compound plan. §1.6's 29 misreads are this rule's remaining debt.
8. **Truthful undo cost** — `runBatch` is undo-NEUTRAL (ADR-0314). N commands are N history entries, and the Confirm card says N before consent.
9. **Shrink-only gates** — every ratchet in this repo only goes down; a bump needs a **dated in-code justification naming what it counts**. A baseline is not permission; it is a debt with a name.
10. **No fictional capabilities** — the registry describes what the editor *does*, never what we wish it did. If the editor can't do it, the truthful entry is `CHAT_UNAVAILABLE` with a reason a user could read.
11. **Determinism before models** — the LLM is the LAST rung, and a sentence any deterministic rung claims never reaches it. That ordering is pinned by test, not by convention. A local semantic model, if ever added, sits behind the same interface, outputs the same IR, and never becomes a mutation path.

---

## §5 — Roadmap (conflict order: STR → this contract → ADR-0313/0314/0315 → the RAC plans)

Superseding rev 2's phase 1–6 numbering with the U0–U10 sequence actually built (`docs/03-execution/plans/RAC-UNIVERSAL-CAPABILITY-ARCHITECTURE.md` §8; per-phase acceptance sentences in `RAC-IMPLEMENTATION-PLAN.md`).

| Phase | Deliverable | State |
|---|---|---|
| **ADR-0313 ph.1–3** | Registry, coverage gate, honest refusals, 269-command A–F classification, compound dimensions, symmetry tranche, undeclared → **0** | ✅ `603e0d32`, `26eec228` |
| **U0** | route-liveness check 3d + the maturity report in gate 31 | ✅ |
| **U1** | `wall.updateDimensions` and remaining-route liveness verdicts; `PLUGIN_LIVE_ALLOWLIST` emptied (**L-815**) | ✅ |
| **U2** | the five context wirings (θ-threading, facade roll-up, room predicates, `getElementsInRoom`, SiteQuery) | ✅ |
| **U3** | `ScopeDescriptor` / `ScopeResolver`, ids-only accessors | ✅ |
| **U4** | the spec interpreter — capabilities as table entries; `set-door-type` the extension proof | ✅ |
| **U5a/b/c** | conversational generation over the four proven executors, room-scale sentences, the finishing chain, the post-duplicate offer | ✅ |
| **U6** | the plan executor — compound sentences, one Confirm card, ordered dispatch, truthful undo cost | ✅ `b6863d70` |
| **U7** | property vocabulary (U7.1, and the beam-height lie it found) + catalogue families (U7.2 `63f22496`) + four properties as rows (U7.3 `f21fd6c6`) | ✅ |
| **U8** | filter scopes + the editor-side resolution service + refusals that quote the filter | ✅ `5da99e10`, `f86935bc`, `8a0b23d6` |
| **U9** | **batch-creation parametrics + the safe destructive tranche** | 🔶 **IN FLIGHT** — U9.2 scoped deletion committed (`f5f3a5a1`); parametric creation across a resolved scope with `canPlace` validation and pure preview counts is **NOT-YET-TRUE** |
| **U10** | QueryEngine drain by measurement + the LLM planner emitting the same IR through the same validation | ✅ `e1fea0a3`, `9ded0d9a`, `e08530b8` |
| **next** | the §1.6 defect classes: claiming discipline (the 29), a **read-only / visibility capability class** (P7 says visibility intent is a domain concept — the largest SERVED family), the `create-wall` route audit, multi-select bridge parity, named/spatial references | not started |

**Definition of done for the contract**: a user can speak any request whose primitives the editor supports — single, scoped, filtered or composite — and receive either a correct execution with a truthfully stated undo cost, a clarification, or a refusal that names what *is* possible; and no capability can ship chat-invisible, because CI forbids it.

---

## §6 — Governance: how a new feature ships chat-ready

Any PR adding a user-facing bus command MUST either:

1. declare its chat capability — **as a table row wherever the shape is known** (§4.5) — with metadata, probe, `commandProof`, an acceptance family, and an adversarial pin, **or**
2. add a truthful `CHAT_UNAVAILABLE` entry or an internal classification with a falsifiable reason.

**The full procedural expansion of this section is [C68](./C68-ELEMENT-CHAT-ONBOARDING.md)**, which states it as a nine-item checklist with a named gate behind each item and an honest list of what has no gate. Where C68 and this section appear to disagree, **C67 §6 is the summary and C68 is the expansion**; a genuine contradiction is a defect in C68.

### §6.1 Enforcement

**`tools/ga-gate/check-chat-capability-coverage.ts`** (GA gate 31, run via `tools/ga-gate/run-all.ts`; `.github/workflows/ci.yml` is hard-fail). Rev 2 described five checks. `bccf08dc` added **eight** more — closing six of C68's nine stated §6.3 gaps — and every one was **negative-tested**: the fault it exists to catch was injected, the failure watched, and the injection removed. *A gate nobody has watched fail is a gate nobody should trust.*

| Check | What it now proves |
|---|---|
| **4b** EXAMPLE EXECUTION | every declared example is **run** through the real ladder in its acceptance family's context and must land on its own capability un-refused. Check 4 was a grep; this is a proof. |
| **4c** ADVERSARIAL CORPUS | the declared corpus (report paste-backs, negations, hypotheticals, the `with → width` repro) is **executed**; any utterance producing a command or a local action fails, **zero tolerance**. Read out of the acceptance suite itself, so there is one source of truth. |
| **5c** SCOPE MODES HONOURED | each declared spatial mode is driven through `applySemanticIntent` with a stub resolver and must reach it **with a descriptor of that kind** — and an **absent** resolver must refuse, never widen to `'all'`. |
| **3e** GLOBAL ROUTE LIVENESS | `targets: 'global'` no longer skips classification. **It immediately found `create-wall`** (§1.6.2). |
| **6** ONE DISPATCH + HONEST REPORT | a mass edit must emit **exactly one** bus command, and the command carrying it must speak the partial-outcome vocabulary (`skipped` / `N of M`) in its own source. |
| **7** CATALOGUE SOURCE | a catalogue-kind `valueSource` must name a resolver module **and export that really exists**. `KNOWN_VALUE_SOURCES` only proved it was spelled correctly. |
| **8** CASE-ARM RATCHET | "zero new resolver LOC" made measurable — hand-written `case` arms in `applySemanticIntent`, baseline **27**. |
| **9** PROPERTY SURFACE RATCHET | panel-editable `(kind, field)` pairs against a chat surface **derived by executing every probe**, baseline **42** — the only check that can see an attribute routed through the generic verb. Nothing is transcribed. |

The gate prints the **M-maturity line** every run, making the roadmap a measured dial rather than a claim, and cross-checks `CapabilityRefusal`'s unconnected-topic table against `CHAT_UNAVAILABLE` — a topic refused by one and absent from the other fails, because *"the two halves of the same decision disagree."*

**Review question for every capability PR**: *does the registry entry describe what the command provably does — nothing more, nothing less?*
