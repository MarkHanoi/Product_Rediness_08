# C68 — Element & Attribute Chat Onboarding

> **Stamp**: 2026-08-11 · **Status**: CANONICAL (governance authored; **§6 records which items are machine-checked and which are review-only — three checklist items have NO gate today and say so**)
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`. Sits **under [C67](./C67-RAC-CAPABILITY-CONTROL-PLANE.md)** (which owns *what the chat is*) and **beside [C16](./C16-COMMAND-AUTHORING-PROTOCOL.md)** (which owns *how a command is authored*). Peers with [C11](./C11-ELEMENT-CREATION-PIPELINE.md), [C15](./C15-HOSTED-ELEMENT-CONTRACT.md), [C65](./C65-ELEMENT-TYPE-SYSTEM.md), [C13](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md).
> **Scope**: the onboarding obligation attached to **every new element type and every new attribute on an existing element**. It is the procedural expansion of C67 §6 (which states the obligation in five lines and stops).
> ⚠ **Number note**: C17 is taken ([Batch Creation Catalogue & Panel Binding](./C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md)). C61 is a RESERVED slot. C68 is the next free number.

---

## §1 — The rule

> **A new element type, or a new attribute on an existing element, is NOT DONE until the chat can either REACH it or REFUSE it out loud with a stated reason — and which of the two is true is decided by a CI gate, never by memory.**

Everything below is the procedure that makes that sentence checkable. C67 §0 governs the direction of truth (*the editor registers capabilities; language resolves against them*); C68 governs the **moment of arrival** — the PR in which a new element or attribute first exists.

---

## §2 — Why this contract exists

### §2.1 The `c1902a5a` defect — the founding incident

Commit `c1902a5a` shipped `wall.updateSystemTypeBatch` (retype every wall in one undo step). Commit `48750f9c` shipped the AI chat panel. **Same release.** The founder typed the obvious sentence —

> *"make all walls interior partition"*

— and got **"I'm not sure how to help with that yet."**

Nothing was broken. The command existed, the language was unambiguous, and the resolver simply had no idea the command was there, because the chat's idea of the editor's abilities lived in a hand-maintained list of thirteen intents and **nothing compared that list to the bus**. Every new capability silently required someone to remember a fourteenth. Recorded verbatim in the headers of `packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts` and `tools/ga-gate/check-chat-capability-coverage.ts`.

**It recurred after the gate existed.** On 2026-08-10 the founder typed *"Create 3 bedroom apparment"* and got the same sentence, while the apartment-layout engine had been shipping for months — the capability had never been declared. Fixed by `generate-apartment-layout` (RAC U5b.2), whose noun matcher is deliberately spelling-tolerant, on the stated principle that **a capability that cannot be spelled at is a capability that does not exist**. The gate forces the *declaration*; it cannot force the declaration to be reachable by the words a human uses. That is what §5.f exists for.

### §2.2 The `ElementCapabilities.ts` counter-example — the lying table

`packages/input-host/src/operations/ElementCapabilities.ts` advertises **Mirror / Offset / Scale** on slab, floor, roof, door, window, column and furniture. Those commands are **wall-only** and refuse at `canExecute`. It is a second source of truth that drifted from the first.

> **A capability table that LIES is worse than none.** A blank table produces an honest "I can't do that". A lying table produces a confident "Done" over a mutation that never happened.

This is why §5.c requires `targets` to be proven **twice, independently**, and why the gate's target-failure banner names `ElementCapabilities.ts` by path in its own failure text: *"Do not repeat it here."*

The same disease inside the chat has already been caught once by this machinery: the probe found that *"set height to 3 m"* on a **room** was accepted and answered **"Done"** while `UpdateElementParameterCommand.resolveStore()` resolved no store and changed nothing (§FIX-CHAT-HEIGHT-OVERCLAIM).

---

## §3 — What this contract binds, and what it does not

| Question | Owner |
|---|---|
| What IS an element type; where does it live; does it survive a save | **C65** |
| How is the command written (anatomy, CA-1…CA-16, batch coalescing) | **C16** |
| How does an instance get created (UI + AI paths, geometry lifecycle) | **C11** |
| Doors/windows in walls: offsets, voids, baseline dual-write | **C15** |
| What the chat IS (ladder, five layers, honesty invariants, roadmap) | **C67** |
| **What a new element/attribute OWES the chat before it can merge** | **C68 (this)** |

C68 adds no new architecture. It is a **checklist with a gate behind each item**, plus the honest list of items that have no gate yet (§6.3).

---

## §4 — Applicability

C68 binds a PR when **any** of the following is true:

1. it registers a **new bus command** in `plugins/*/src/handlers/*.ts`, `apps/editor/src/engine/initBusHandlers.ts` or `apps/editor/src/engine/engineLauncher.ts` (these are the `HANDLER_GLOBS` the gate scans);
2. it adds a **new element kind** (a new `geometry-*` package + plugin pair per C11 §11);
3. it adds a **user-visible attribute** to an existing element record — a new field on a `*Data` schema, a new property-panel row, or a new value in an existing type's layer/enum vocabulary.

Case 1 is enforced arithmetically today. **Cases 2 and 3 are NOT independently detected by any gate** — an attribute added to a schema and edited only through an existing generic verb (e.g. `element.updateParameters`) registers no new command and therefore trips no ratchet. See §6.3-G1. For those, C68 binds by **review**, and the reviewer's question is fixed: *"which sentence reaches this new field, and if none, where is it written down that none does?"*

---

## §5 — The onboarding checklist

Every item names the file that carries the proof. An item marked ⚙ is machine-checked (§6 says by which check); an item marked 👁 is review-enforced today (§6.3 says why).

### a. ⚙ A LIVE command route — and, for mass edits, a BATCH command

The verb MUST reach the **geometry store that the fragment builders, the plan projector, the exporters and persistence read**, through a command in `packages/command-registry/**` or an `apps/editor/**` handler/bridge.

> **A plugin `produceCommand` DTO store is presumed DEAD until proven otherwise, because that presumption has been right 13/13 times.**

This is the **L-620 / §FIX-MATERIAL-DEAD-DISPATCH / §FIX-CHAT-DEAD-ROUTES** lesson. Thirteen dead routes shipped across two sessions because proofs pinned target *keying* while handlers wrote to fresh `PluginRegistry` instances nothing in production reads, with no committer bridging updates back. **Chat said "Done" and changed nothing.** L-815 closed the last of them: `wall.updateDimensions` was audited **DEAD**, re-routed to a legacy bridge, and `PLUGIN_LIVE_ALLOWLIST` was emptied — the gate now proves route liveness with **zero exemptions**.

The three accepted execution authorities (gate check 3d):

| Root | Verdict | Why |
|---|---|---|
| `packages/command-registry/**` | LIVE by construction | mutates the geometry stores everything downstream reads |
| `apps/editor/**` | LIVE | app-registered handlers/bridges wired against the real runtime |
| `plugins/**` with the **bridge signature** | LIVE | delegates to `commandManager` **and** declares `affectedStores: [] as const` (undo lives on the legacy stack). **Both literals must appear.** |

Anything else FAILS. An allowlist entry requires **dated liveness evidence**, and the allowlist is expected to shrink, not grow.

**For mass edits, a BATCH command is mandatory**, so one sentence costs ONE undo entry. Per **ADR-0314**, `runBatch` is **undo-NEUTRAL**: N commands inside it are N history entries. A capability that fans out per element without a true batch verb MUST NOT be described as one undo — see §7.f.

### b. ⚙ A declaration, in exactly one of three places

Every registered verb MUST be **DECLARED** — and the three surfaces are **disjoint** (the gate fails a verb that appears in two):

1. a **`ChatCapability`** in `ChatCapabilityRegistry.ts` (it is reachable), or
2. a **`CHAT_UNAVAILABLE`** entry — a refusal a *user* could read (*"Openings are placed by pointing at a spot on the wall — use the Door or Window tool."*), or
3. a **`ChatCommandClassification.ts`** entry — B needs-design · C internal · D duplicate · E unsafe-without-bigger-confirmation · F deferred-scope — with an engineering reason **a reviewer can falsify**. The gate rejects a reason under 40 characters as "too thin to be falsifiable", and rejects a classified verb that is no longer registered as a stale entry.

Undeclared is not an option: the ratchet is **0**.

### c. ⚙ `targets` proven BOTH ways

For any capability whose `targets` is not `'global'`:

- **3a EXECUTABLE.** The gate runs `applySemanticIntent(cap.probe, ctxSelecting(kind))` for **every** kind in `PROBE_ELEMENT_KINDS` (16 kinds: wall, door, window, room, slab, roof, stair, column, beam, ceiling, floor, furniture, curtain-wall, handrail, lighting, plumbing) and requires **declared set == accepted set, exactly, both directions**. A declared target the guard refuses fails. **An undeclared kind the guard accepts fails too — silent over-reach is the same lie facing the other way.**
- **3b SOURCE-ANCHORED.** `commandProof {file, mustMention, note}` names the file that **decides** which kinds the command can reach (a store switch, an id-keyed payload) and the literals that must appear in it. The gate reads the file. An unprovable claim fails.
- **3c NORMALIZATION.** A declared target must survive `normalizeElementKind` unchanged and be inside `PROBE_ELEMENT_KINDS`, or `capabilityAppliesTo` silently answers `false` forever.

Neither 3a nor 3b alone is sufficient: **3a would happily certify a resolver that confidently dispatches into a command that refuses.**

### d. ⚙ Every parameter names a `valueSource` — resolved by the ONE table

Each declared parameter carries a `valueSource` drawn from `KNOWN_VALUE_SOURCES`: `measurement` · `angle` · `wall-system-types` · `window-system-types` · `door-system-types` · `slab-system-types` · `ceiling-system-types` · `finish` · `color` · `project-levels` · `project-rooms` · `orientation` · `level-range` · `user-text` · `coordinates`. An unknown source fails: *"nothing can resolve it."* A **required** parameter whose value shape is absent from the probe fails too — otherwise the target proof runs with a parameter the capability could never resolve at runtime.

**One vocabulary, one table.** Colour resolves in `intents/colorRef.ts`; finish in `intents/finishRef.ts`; every catalogue reference on the ONE ladder `packages/command-registry/src/catalogue/resolveCatalogueRef.ts` (exact id → exact name → case-insensitive → unambiguous word-subset → **refusal listing the real candidates**). Authoring a second name→value matcher is an anti-pattern (§7.c), even when it is shorter.

A refusal from a value source MUST **list the project's real options**, never guess: *"There is no wall type called "X" in this project. The wall types here are: …"* (§CONTEXT-DATA-HONESTY).

### e. ⚙/👁 `scopeModes` only for scopes the resolver honours

`scopeModes` is validated against `KNOWN_SCOPE_MODES` (`selection` · `all` · `global` · `level` · `room` · `orientation`) and must include the capability's own default `scope`. Beyond that: **declaring a spatial mode before the U3 `ScopeResolver` honours it would be the ElementCapabilities lie in a new costume** — U2.5 states this in the plan and it is convention, not a check (§6.3-G3). When the resolver is absent the arm refuses honestly (*"spatial scoping isn't wired into this chat context"*) rather than silently widening to `all`.

**A filter over the selection never bypasses the selection's own gate** (U8.1/U8.3): an empty or wrong-kind selection refuses with the capability's copy *before* anything is filtered — a filtered sentence may never reach a capability that the plain sentence would be refused for.

### f. ⚙/👁 Acceptance families + adversarial pins

- `examples` MUST be non-empty, and the capability id MUST be referenced by `packages/ai-host/__tests__/capability-acceptance.test.ts`. **A capability with no natural-language test is a claim nobody checked.**
- Examples MUST be **natural phrasings**, plural — the way a user says it, not the way the grammar was written. `set-door-type` carries three: *"change all doors to white primed softwood"*, *"change the door type to glazed timber"*, *"convert the selected doors to fire door fd30"*.
- **Adversarial pins are mandatory and are review-enforced** (§6.3-G2). Every capability reachable by "a bare number + a noun" inherits the founder-doctrine guards and MUST have them pinned:
  - **`descriptiveReportReason`** (`capabilities/CapabilityRefusal.ts`) — report-shaped and past-tense text must **MISS**. §FIX-CHAT-REPORT-PASTEBACK: the founder pasted the assistant's own line back into the chat and the ladder **created a level from it, twice**, stacking two levels at 6.000 m. Mechanism: the typo corrector rewrote *built → build*, the synonym table rewrote *floors → level*, and add-level read the bare 6 as an elevation.
  - **`Normalized.corrected`** (`intents/LocalNaturalLanguageResolver.ts`) — the index set of typo-corrected tokens. **Typo correction may repair a word the user meant; it must never MANUFACTURE the imperative that authorises a mutation.** `add-level` now requires an **uncorrected** creation verb in opener position.
  - **`PROTECTED_FUNCTION_WORDS`** (`intents/ZeroTokenResolver.ts`) — §FIX-CHAT-STOPWORD-CORRECTION: bounded Levenshtein rewrote **with → width**, turning *"Created Aparment with 2 bedrooms"* into *"select an element first, then set its width"*. **A correctly spelled English function word is never a misspelled domain term** — while *aparment → apartment* is exactly what tier 1 exists to do.
  - Guards apply **per clause** inside a compound plan (U6), so a paste-back wearing a compound sentence refuses WHOLE.

### g. 👁 Refusals quote real values; partial outcomes are reported as partial

- A refusal MUST name real names, numbers and units — the project's actual type names, the geometry package's actual bounds (`RAKE_MIN_DEG`/`RAKE_MAX_DEG`, imported, **never re-typed**), the real extremum when a filter matched nothing (*"No wall is thicker than 300 mm — the thickest is 250 mm (Interior – Partition). Nothing was changed."*). When nothing carried the property at all, the copy says **that** (*"3 windows have no recorded area"*) rather than inventing an extremum.
- Ambiguity **refuses naming both candidates** rather than retyping a building on a coin flip.
- Success is reported as what happened: **"Changed N of M — K skipped: `<reason>`"**, with the reason read off the command's or engine's own report payload, never re-narrated. **"Done" only after a command reports success.**
- Granularity gaps are refused by **naming the gap** (*"every room-scale engine reads 'every qualifying room on ONE level'"*), never silently widened to a larger scope than the user named.

### h. 👁 For catalogued families: if no catalogue exists, AUTHOR one

**Founder ruling, 2026-08-11.** When a family's "type" has no named catalogue, the answer is not to skip the capability — it is to **author the catalogue**, following the `WallSystemTypeStore` shape (`packages/geometry-wall/src/WallSystemTypeStore.ts`):

1. **Built-ins are protected** — `isBuiltIn(id)` guards `update` and `remove`; user types live in the same map alongside them.
2. **Layers carry material + thickness**; the type is the assembly, not a label.
3. **Derived totals are computed, never stored by hand** — `totalThickness` is recomputed on `add` and on every layer patch (a bug fixed exactly once already: a patched type used to report its pre-edit total).
4. **`{id, name}` is the minimum shape**, because that is what `resolveCatalogueRef` reads and what a refusal lists. A catalogue that is a bare string union has no display names, so a refusal could not list anything — this is why `furniture` is deliberately absent from `CATALOGUE_FAMILIES`.
5. **Project-scoped**: per **C65 §3.3** the store is declared in `declaredProjectScopes.ts` and cleared on project switch, or it leaks across projects (**C13**).
6. Per **C65 §3.4** a missing type is an **explicit visible state, never a silent default**.

`CatalogueFamilies.ts` already records the honest per-family reasons for absence — roof/column/beam (the "type" is a closed enum on the record, no catalogue names exist), curtain-wall (type is per-PANEL, command ORPHANED), floor (catalogue *and* live command both exist — **this is the next entry to add**, deferred only because users call `floor` and `slab` by the same word and that disambiguation deserves its own decision), furniture, handrail (`HandrailData` has no `typeId`; a type must be materialised whole into its fields). **A family the chat cannot drive is said out loud, never silently missing.**

### i. ⚙/👁 Batch-shaped capabilities land as U4 SPEC TABLE ENTRIES

If the shape is *resolve scope → resolve value → dispatch ONE batch verb*, it MUST be added as a `CapabilityExecutionSpec` **table entry** in `intents/CapabilityExecutionSpec.ts` (or, for a catalogue family, a row in `intents/CatalogueFamilies.ts`, from which the spec **and** the grammar are generated) — consumed by the ONE generic arm `applyExecutionSpec`. **Target: zero new resolver case code.** The PR description MUST state the resolver LOC added (review-enforced, §6.3-G5).

The irregular shapes that stay hand-written are listed, with reasons, in the `CapabilityExecutionSpec.ts` header — creation (`create-windows-parametric`), level-query (`duplicate-level` / `go-to-level` / `add-level`), whole-model reference (`set-rhino-material`), coordinate entry (`create-wall`), and the selection-fan-out dimension family. **`wall` is deliberately not a catalogue-family row**: its grammar is entangled with the colour and rake grammars that share the *"make all walls …"* opening and must be tried in a specific order, and its refusal copy is the founding incident's verbatim wording.

---

## §6 — Enforcement

### §6.1 The gate

**`tools/ga-gate/check-chat-capability-coverage.ts`** (GA gate 31, run via `tools/ga-gate/run-all.ts`; the `.github/workflows/ci.yml` gate is hard-fail). Exit 0 only if the ratchet holds **and every hard check passes**.

| Checklist item | Check | Failure text (verbatim shape) |
|---|---|---|
| **b** declaration | **1. COVERAGE** (ratchet) | `FAIL — N undeclared bus command(s), baseline 0.` + *"Shipping neither is how "make all walls interior partition" reached a command that already existed and was told "I'm not sure how to help with that yet"."* |
| **b** disjointness | **1b. CLASSIFICATION CONSISTENCY** | `"x.y" is BOTH a capability dispatch and classified — pick one.` · `… classified but not a registered bus command — stale entry.` · `classification reason is too thin to be falsifiable.` |
| **a** the verb exists | **2. NO PHANTOM CAPABILITIES** | `<cap> → "x.y" is not a registered bus command.` · `busCommand is null but no localAction is declared — it does nothing.` · a `composite` that also claims bus commands |
| **c** targets, chat side | **3a. EXECUTABLE PROBE** | `DECLARES target "slab" but applySemanticIntent REFUSES it. This is the ElementCapabilities defect — remove the target or fix the guard.` · `ACCEPTS "x" but does not declare it. Silent over-reach…` |
| **c** targets, command side | **3b. SOURCE-ANCHORED PROOF** | `commandProof names <file>, but it never mentions "<literal>" — the target claim is not proven by the command.` · `declares element targets but no commandProof — the claim is unverifiable.` |
| **a** route liveness | **3d. ROUTE LIVENESS** | `commandProof file "<f>" is a PLUGIN handler with neither the legacy-bridge signature (commandManager + empty affectedStores) nor a PLUGIN_LIVE_ALLOWLIST entry. Plugin produceCommand stores are presumed DETACHED (§FIX-CHAT-DEAD-ROUTES, 13/13 dead so far)…` |
| **c** normalization | **3c** | `target "x" is not in normalized form` · `target "x" is outside PROBE_ELEMENT_KINDS, so it is never probed.` |
| **f** acceptance | **4. ACCEPTANCE COVERAGE** | `declares no examples — nothing proves the phrasing resolves.` · `not referenced by packages/ai-host/__tests__/capability-acceptance.test.ts.` |
| **d** value sources | **5. PARAMETER SOURCE RESOLVABILITY** | `unknown valueSource "x" — nothing can resolve it.` · `required parameter (source "measurement") is absent from the probe — the target proof runs with a parameter the capability cannot resolve.` |
| **e** scopes | **5b. SCOPE MODES** | `unknown scope mode "x" — the resolver has no such scope.` · `scopeModes must include the default scope "all".` |

The gate also cross-checks `CapabilityRefusal`'s unconnected-topic table: a topic refused by the language table but **not** listed in `CHAT_UNAVAILABLE` fails, because *"the two halves of the same decision disagree."*

### §6.2 The ratchets (shrink-only)

- **`MAX_UNDECLARED = 0`** since 2026-08-10 (was 269, frozen and drained the same day — each of the 269 was walked and placed; the classification file *is* the roadmap). Raising it requires **a dated justification in the gate source naming the commands**.
- **SDK-facade bypass baseline (172)** — the reason the chat metadata lives in `ChatCapabilityRegistry.ts` and not on the handler object: a `plugins → ai-host` runtime import would add a bypass, and the L2 resolver must answer before any plugin loads. The coupling is made **static** instead, and CI proves it against the real registration lists. *"The guarantee 'a feature cannot ship without its chat metadata' is delivered by the gate, not by an import."*
- **The M-maturity line** printed every run — `M2/M3 direct+selection · M4 scope · M5 true-batch · M6 plans · M7 generative` — makes the roadmap a measured dial rather than a claim.

### §6.3 What is NOT enforced today — stated as gaps, not implied as covered

Per the suite's NOT-YET-TRUE convention, these are recorded so nobody mistakes §5 for a fully machine-checked list:

- **G1 — §4 cases 2 and 3 are undetected.** The ratchet counts **registered bus commands**. A new *attribute* edited through an existing generic verb (e.g. `element.updateParameters`) adds no verb, so nothing turns red. C68 binds those by review only. Closing this needs a schema-field-level ratchet that does not exist.
- **G2 — adversarial pins are not gate-checked.** Check 4 verifies only that `examples` is non-empty and that the capability **id** appears somewhere in the acceptance spec — it does **not** verify each example string is exercised, and it does not require a single adversarial (report-shaped / past-tense / function-word) case. §5.f is therefore review-enforced.
- **G3 — `scopeModes` truthfulness is unproven.** The gate checks the mode is a *known* name and includes the default. **Nothing executes the resolver to prove the mode is honoured** — the ElementCapabilities failure mode, one layer over.
- **G4 — no gate proves "one undo".** M5 *counts* verbs matching `/Batch$/` and reports the number; no check fails a capability that fans out N commands while its copy claims a single undo step. §7.f is review-enforced.
- **G5 — "zero resolver LOC" is a convention.** Nothing measures the resolver diff of a capability PR.
- **G6 — partial-outcome honesty (§5.g) has no gate.** The copy is pinned byte-for-byte by the acceptance suite where it exists, which catches *regressions* but does not force a *new* capability to report partials at all.
- **G7 — `targets: 'global'` capabilities skip liveness.** Checks 3a/3b/3d all return early for `'global'`, so a global capability's route is never classified by execution authority.
- **G8 — §5.h (catalogue authoring) has no gate whatsoever.** It is a founder ruling recorded here for the first time.
- **G9 — ADR-0315 has no file.** `ADR-0315` is cited by name in the gate source, `CapabilityExecutionSpec.ts`, the RAC plans and the issue log, but **no `docs/02-decisions/adrs/ADR-0315-*.md` exists** (the ADR directory ends at ADR-0314). The U-phase architecture it names is recorded in `docs/03-execution/plans/RAC-UNIVERSAL-CAPABILITY-ARCHITECTURE.md` and sequenced in `RAC-IMPLEMENTATION-PLAN.md`. Either the ADR is written or the citations are corrected; until then, **treat every "ADR-0315" reference as pointing at those plans.**

---

## §7 — Anti-patterns

Each is a defect that has actually shipped in this repository.

| # | Anti-pattern | Citation |
|---|---|---|
| **a** | **The detached-plugin-DTO-store dead verb.** A handler `produceCommand`s against a fresh `PluginRegistry` instance nothing renders, exports or persists. Chat says "Done"; nothing changed. | **L-620 / L-815 / §FIX-MATERIAL-DEAD-DISPATCH / §FIX-CHAT-DEAD-ROUTES** (`8447911f`) — 13 dead verbs, pinned in `DEAD_VERBS`; `wall.updateDimensions` audited DEAD in U1.1 |
| **b** | **The lying targets table.** Advertising a family whose command refuses at `canExecute`. | `packages/input-host/src/operations/ElementCapabilities.ts` (Mirror/Offset/Scale on seven wall-only families); reproduced inside chat as §FIX-CHAT-HEIGHT-OVERCLAIM |
| **c** | **A second name→value matcher.** Any colour/finish/catalogue matcher other than `colorRef.ts`, `finishRef.ts`, `resolveCatalogueRef`. Two ladders drift, and the second one's refusal lists a different set of options than the first — so the user is told two different truths about one project. | C65 §3.5 (*one policy, one place*); the `RAKE_MIN_DEG`/`RAKE_MAX_DEG` import exists for exactly this reason |
| **d** | **Claiming a scope the resolver does not honour.** Declaring `level`/`room`/`orientation` in `scopeModes` before the `ScopeResolver` arm exists. | RAC U2.5, verbatim: *"declaring a spatial mode before the resolver honours it would be the ElementCapabilities lie"* |
| **e** | **Silent partial success.** Reporting "Done" for a scope where K of M elements were skipped, or widening a named scope (*"the kitchen"*) to a larger one the engine happens to support. | §CONTEXT-DATA-HONESTY; U5c's granularity HARD STOPPER |
| **f** | **"One undo" claimed for N commands.** `runBatch` is **undo-NEUTRAL** — N commands are N history entries. | **ADR-0314**; U6.3 states the plan's undo cost as the SUM of its steps **on the Confirm card, before consent** |
| **g** | **Report text that commands.** Letting the assistant's own output re-enter as an imperative, or letting typo correction manufacture one. | §FIX-CHAT-REPORT-PASTEBACK · §FIX-CHAT-STOPWORD-CORRECTION (`795cbec1`, `05930960`) |

---

## §8 — Worked example: `set-door-type` (RAC U4.3)

The proof that the checklist is cheap when the machinery is used: **a catalogue family added as ~94 lines of metadata with ZERO new resolver case code.** Gate after it: 27 capabilities, undeclared 0/0.

| Item | How `set-door-type` satisfies it |
|---|---|
| **a** live route + batch | `door.updateSystemTypeBatch` → `packages/command-registry/src/doors/UpdateDoorsSystemTypeBatchCommand.ts`, whose children are the **L-620-proven** `UpdateDoorSystemTypeCommand` against the geometry `doorStore` (`planDoorTypeChange` preserves id / openingId / host void, **C15**) — explicitly **not** the plugin `door.setType` detached-store route. One batch verb ⇒ ONE undo entry. |
| **b** declaration | A `ChatCapability` (`id: 'set-door-type'`) in `ChatCapabilityRegistry.ts`. Not `CHAT_UNAVAILABLE`, not classified. |
| **c** targets both ways | `targets: ['door']`. **3a**: `probe: { intent: 'set-door-type', typeRef: 'White Primed Softwood', scope: 'selection' }` — a *selection*-scope probe deliberately, because the `'all'` scope never reads the selection and so could not exercise the target guard. **3b**: `commandProof.file` = the batch command; `mustMention: ['doorStore', 'UpdateDoorSystemTypeCommand']`; the `note` records *why* the reachable set is doors only (`_resolveDoorIds` reads the geometry `doorStore` **and nothing else**). **3d**: the file is under `packages/command-registry/` ⇒ LIVE by construction. |
| **d** value source | One parameter, `type`, `valueSource: 'door-system-types'`, required, `example: 'White Primed Softwood'`. Resolved by `resolveDoorSystemTypeRef` — the ONE `resolveCatalogueRef` ladder — injected as `ctx.resolveDoorSystemType`. Probe carries `typeRef`, so check 5's shape arm passes. |
| **e** scopes | `scope: 'all'`, `scopeModes: ['all', 'selection']` — both honoured by `applyExecutionSpec`'s scope stage. No spatial mode is claimed. |
| **f** acceptance | Three natural phrasings; the id is referenced by `capability-acceptance.test.ts`. Verbs `change/set/convert/swap/make/turn`, aliases `door type` / `door style`. |
| **g** honest refusals | The generated family refusal LISTS the project's real door type names; the empty-selection and wrong-kind copies come from the family row (`noSelectionReason` / `mismatchPrefix`); the batch command reports "Changed N of M — K skipped". |
| **h** catalogue | Already existed (`DoorSystemTypeStore`), so nothing to author. |
| **i** spec table entry | `'set-door-type'` in `SpecDrivenIntentId` + a `CatalogueFamilies.ts` row from which `catalogueFamilySpec()` **generates** the `CapabilityExecutionSpec` and the grammar. **Zero new case arms in `applySemanticIntent`.** |

The same row shape then delivered `set-slab-type` and `set-ceiling-type` (U7.2) for the same price — *"a fifth family is a table row — not a spec literal, not a parser, not a matcher."*

---

## §9 — Conflict resolution + status

**Order (strongest first):** `STR-03` / `STR-04` → **C67** (what the chat is; §4's binding architecture rules, especially P6 absolutism and *no fictional capabilities*) → **C68** (this: the per-element/attribute onboarding obligation) → **C16** (how the command itself is authored) → **C11 / C15 / C65** (the element's own pipeline, hosting and type rules) → ADR-0313 / ADR-0314 → the RAC plans.

Where C68 and C67 §6 appear to disagree, **C67 §6 is the summary and C68 is the expansion**; a genuine contradiction is a defect in C68 and must be fixed here.

C68 adds **no Tier-1 launch-gate obligation** — it governs correctness of a claim, not data integrity or durability. It is **CANONICAL, not ACTIVE**: it does not certify that every shipped capability satisfies every item, because §6.3 records six checklist obligations with no gate behind them. It becomes ACTIVE when G1–G8 are closed or explicitly retired.

**Review question for every PR in scope, exactly as C67 §6 puts it:**

> *Does the registry entry describe what the command provably does — nothing more, nothing less?*

And C68's addition:

> *If the answer is "the chat cannot do this", where is that written down in a sentence a user could read?*
