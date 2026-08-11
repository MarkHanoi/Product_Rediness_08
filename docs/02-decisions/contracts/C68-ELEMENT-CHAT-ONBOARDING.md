# C68 — Element & Attribute Chat Onboarding

> **Stamp**: 2026-08-11 (rev 3 — reconciled against C67 rev 3; §5.j added) · **Status**: CANONICAL (governance authored; **§6.3 records exactly which obligations are machine-checked, which are half-checked, and which are review-only. Of the nine gaps this contract shipped with, FIVE are now machine-enforced, THREE are partly enforced with the unprovable half named, and one — refusal *quality* — remains a review judgement.**)
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`. Sits **under [C67](./C67-RAC-CAPABILITY-CONTROL-PLANE.md)** (which owns *what the chat is*) and **beside [C16](./C16-COMMAND-AUTHORING-PROTOCOL.md)** (which owns *how a command is authored*). Peers with [C11](./C11-ELEMENT-CREATION-PIPELINE.md), [C15](./C15-HOSTED-ELEMENT-CONTRACT.md), [C65](./C65-ELEMENT-TYPE-SYSTEM.md), [C13](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md).
> **Scope**: the onboarding obligation attached to **every new element type and every new attribute on an existing element**. It is the procedural expansion of C67 §6 (which states the obligation in a dozen lines and stops).
> **Rev 3 changes, all of them corrections rather than additions of scope**: §5.a gains the FOURTH accepted proof root (read-side geometry proof, U7.3) that check 3d already honours; **§5.j is new** — the claiming-discipline corpus, which the 29 pinned MISREAD phrasings (C67 §1.6.1) show was an unwritten obligation; §6.2's ratchet baselines are re-measured at 45 capabilities; §6.3 gains the tenth gap the drain measurement exposed. Nothing here was relaxed.
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

Case 1 is enforced arithmetically. **Case 3 is detected indirectly since 2026-08-11** — check 9 ratchets the panel-editable property surface against the chat surface, so a new attribute that gets a property-panel row and no sentence raises the count and fails (§6.3-G1 states the four things that measure cannot see). **Case 2 — a whole new element KIND — is still detected only through the commands it registers.** For what the gates cannot see, C68 binds by **review**, and the reviewer's question is fixed: *"which sentence reaches this new field, and if none, where is it written down that none does?"*

---

## §5 — The onboarding checklist

Every item names the file that carries the proof. An item marked ⚙ is machine-checked (§6 says by which check); an item marked 👁 is review-enforced today (§6.3 says why).

### a. ⚙ A LIVE command route — and, for mass edits, a BATCH command

The verb MUST reach the **geometry store that the fragment builders, the plan projector, the exporters and persistence read**, through a command in `packages/command-registry/**` or an `apps/editor/**` handler/bridge.

> **A plugin `produceCommand` DTO store is presumed DEAD until proven otherwise, because that presumption has been right 13/13 times.**

This is the **L-620 / §FIX-MATERIAL-DEAD-DISPATCH / §FIX-CHAT-DEAD-ROUTES** lesson. Thirteen dead routes shipped across two sessions because proofs pinned target *keying* while handlers wrote to fresh `PluginRegistry` instances nothing in production reads, with no committer bridging updates back. **Chat said "Done" and changed nothing.** L-815 closed the last of them: `wall.updateDimensions` was audited **DEAD**, re-routed to a legacy bridge, and `PLUGIN_LIVE_ALLOWLIST` was emptied — the gate now proves route liveness with **zero exemptions**.

The accepted proof roots (gate check 3d):

| Root | Verdict | Why |
|---|---|---|
| `packages/command-registry/**` | LIVE by construction | mutates the geometry stores everything downstream reads |
| `apps/editor/**` | LIVE | app-registered handlers/bridges wired against the real runtime |
| `plugins/**` with the **bridge signature** | LIVE | delegates to `commandManager` **and** declares `affectedStores: [] as const` (undo lives on the legacy stack). **Both literals must appear.** |
| `packages/geometry-*/**` | **READ-SIDE proof only — never sufficient alone** | added U7.3. These are pure builders: no dispatch, no store writes, no command, so they can never be an execution authority. What they prove is the half the §FIX-CHAT-DEAD-ROUTES model never covered — that **the field being written is actually READ by the geometry**. `proveCommandTargets` enforces that such a file is never the sole proof. |

Anything else FAILS. An allowlist entry requires **dated liveness evidence**, and the allowlist is expected to shrink, not grow.

> **Liveness has two directions, and both are "Done" over nothing from the user's chair.** A dead route writes a store nothing reads. The mirror defect writes a **field** nothing reads: `set-height` claimed `beam` while `BeamData` carries `width` and `depth` and no height, and `BeamFragmentBuilder` builds from those two. U7.1 removed the chat-side claim. **The panel-side twin is still open** — `PropertyDescriptorGenerator.ts` renders `beam.height` as an editable NUMBER row, and it is one of check 9's 42.

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

### e. ⚙ `scopeModes` only for scopes the resolver honours

`scopeModes` is validated against `KNOWN_SCOPE_MODES` (`selection` · `all` · `global` · `level` · `room` · `orientation`) and must include the capability's own default `scope`. Beyond that: **declaring a spatial mode before the U3 `ScopeResolver` honours it would be the ElementCapabilities lie in a new costume** — and since 2026-08-11 that is a CHECK, not a convention: check 5c drives every declared spatial mode through `applySemanticIntent` with an injected stub resolver and requires the descriptor to arrive with the declared kind (§6.3-G3). When the resolver is absent the arm refuses honestly (*"spatial scoping isn't wired into this chat context"*) rather than silently widening to `all`.

**A filter over the selection never bypasses the selection's own gate** (U8.1/U8.3): an empty or wrong-kind selection refuses with the capability's copy *before* anything is filtered — a filtered sentence may never reach a capability that the plain sentence would be refused for.

### f. ⚙ Acceptance families + adversarial pins

- `examples` MUST be non-empty, and the capability id MUST be referenced by `packages/ai-host/__tests__/capability-acceptance.test.ts`. **A capability with no natural-language test is a claim nobody checked.**
- Examples MUST be **natural phrasings**, plural — the way a user says it, not the way the grammar was written. `set-door-type` carries three: *"change all doors to white primed softwood"*, *"change the door type to glazed timber"*, *"convert the selected doors to fire door fd30"*.
- **Adversarial pins are mandatory and the corpus is EXECUTED by the gate** (check 4c; per-capability pin coverage is ratcheted — §6.3-G2). Every capability reachable by "a bare number + a noun" inherits the founder-doctrine guards and MUST have them pinned:
  - **`descriptiveReportReason`** (`capabilities/CapabilityRefusal.ts`) — report-shaped and past-tense text must **MISS**. §FIX-CHAT-REPORT-PASTEBACK: the founder pasted the assistant's own line back into the chat and the ladder **created a level from it, twice**, stacking two levels at 6.000 m. Mechanism: the typo corrector rewrote *built → build*, the synonym table rewrote *floors → level*, and add-level read the bare 6 as an elevation.
  - **`Normalized.corrected`** (`intents/LocalNaturalLanguageResolver.ts`) — the index set of typo-corrected tokens. **Typo correction may repair a word the user meant; it must never MANUFACTURE the imperative that authorises a mutation.** `add-level` now requires an **uncorrected** creation verb in opener position.
  - **`PROTECTED_FUNCTION_WORDS`** (`intents/ZeroTokenResolver.ts`) — §FIX-CHAT-STOPWORD-CORRECTION: bounded Levenshtein rewrote **with → width**, turning *"Created Aparment with 2 bedrooms"* into *"select an element first, then set its width"*. **A correctly spelled English function word is never a misspelled domain term** — while *aparment → apartment* is exactly what tier 1 exists to do.
  - Guards apply **per clause** inside a compound plan (U6), so a paste-back wearing a compound sentence refuses WHOLE.

### g. 👁 Refusals quote real values; partial outcomes are reported as partial

- A refusal MUST name real names, numbers and units — the project's actual type names, the geometry package's actual bounds (`RAKE_MIN_DEG`/`RAKE_MAX_DEG`, imported, **never re-typed**), the real extremum when a filter matched nothing (*"No wall is thicker than 300 mm — the thickest is 250 mm (Interior – Partition). Nothing was changed."*). When nothing carried the property at all, the copy says **that** (*"3 windows have no recorded area"*) rather than inventing an extremum.
- Ambiguity **refuses naming both candidates** rather than retyping a building on a coin flip.
- Success is reported as what happened: **"Changed N of M — K skipped: `<reason>`"**, with the reason read off the command's or engine's own report payload, never re-narrated. **"Done" only after a command reports success.**
- Granularity gaps are refused by **naming the gap** (*"every room-scale engine reads 'every qualifying room on ONE level'"*), never silently widened to a larger scope than the user named.

### h. ⚙/👁 For catalogued families: if no catalogue exists, AUTHOR one

**Founder ruling, 2026-08-11.** When a family's "type" has no named catalogue, the answer is not to skip the capability — it is to **author the catalogue**, following the `WallSystemTypeStore` shape (`packages/geometry-wall/src/WallSystemTypeStore.ts`):

1. **Built-ins are protected** — `isBuiltIn(id)` guards `update` and `remove`; user types live in the same map alongside them.
2. **Layers carry material + thickness**; the type is the assembly, not a label.
3. **Derived totals are computed, never stored by hand** — `totalThickness` is recomputed on `add` and on every layer patch (a bug fixed exactly once already: a patched type used to report its pre-edit total).
4. **`{id, name}` is the minimum shape**, because that is what `resolveCatalogueRef` reads and what a refusal lists. A catalogue that is a bare string union has no display names, so a refusal could not list anything — this is why `furniture` is deliberately absent from `CATALOGUE_FAMILIES`.
5. **Project-scoped**: per **C65 §3.3** the store is declared in `declaredProjectScopes.ts` and cleared on project switch, or it leaks across projects (**C13**).
6. Per **C65 §3.4** a missing type is an **explicit visible state, never a silent default**.

`CatalogueFamilies.ts` already records the honest per-family reasons for absence — roof/column/beam (the "type" is a closed enum on the record, no catalogue names exist), curtain-wall (type is per-PANEL, command ORPHANED), floor (catalogue *and* live command both exist — **this is the next entry to add**, deferred only because users call `floor` and `slab` by the same word and that disambiguation deserves its own decision), furniture, handrail (`HandrailData` has no `typeId`; a type must be materialised whole into its fields). **A family the chat cannot drive is said out loud, never silently missing.**

### i. ⚙ Batch-shaped capabilities land as U4 SPEC TABLE ENTRIES

If the shape is *resolve scope → resolve value → dispatch ONE batch verb*, it MUST be added as a `CapabilityExecutionSpec` **table entry** in `intents/CapabilityExecutionSpec.ts` (or, for a catalogue family, a row in `intents/CatalogueFamilies.ts`, from which the spec **and** the grammar are generated) — consumed by the ONE generic arm `applyExecutionSpec`. **Target: zero new resolver case code.** The PR description MUST state the resolver LOC added; the hand-written `case`-arm count is ratcheted at 27 (check 8, §6.3-G5).

The four generator tables, and what each one turns into a row: `CapabilityExecutionSpec.ts` (scope → value → one batch verb) · `CatalogueFamilies.ts` (a type-change family, from which the spec **and** the tier-0 grammar are generated) · `PropertyVocabulary.ts` (a property: noun + synonyms, accepting kinds, live route per kind, bounds) · `DeleteFamilies.ts` (a scoped destructive family, with `destructive` and `requireResolvedIds` set by the generator, never by hand).

The irregular shapes that stay hand-written are listed, with reasons, in the `CapabilityExecutionSpec.ts` header — creation (`create-windows-parametric`), level-query (`duplicate-level` / `go-to-level` / `add-level`), whole-model reference (`set-rhino-material`), coordinate entry (`create-wall`), and the selection-fan-out dimension family. **`wall` is deliberately not a catalogue-family row**: its grammar is entangled with the colour and rake grammars that share the *"make all walls …"* opening and must be tried in a specific order, and its refusal copy is the founding incident's verbatim wording.

### j. ⚙/👁 CLAIMING DISCIPLINE — the grammar must be pinned against the misread corpus

**Added rev 3.** §5.f pins what a capability must *not* be tricked into by a hostile sentence. §5.j pins the opposite failure and the more common one: **a capability that claims a sentence it had no right to claim, and then confidently does the wrong thing.** The evidence is the U10.3 drain measurement (`e08530b8`), which classified every hand-written panel pill by *executing* it and found **29 phrasings the ladder claims and gets WRONG** — enumerated one by one in `apps/editor/src/ui/ai/__tests__/QueryEngineDrain.spec.ts`, so that fixing any one of them FAILS the test and forces the inventory to move.

> **The worst one is destructive.** *"highlight walls taller than 3m"* and *"isolate doors higher than 2 meters"* resolve to `set-height` and dispatch `wall.updateDimensions`. **A read-only visibility question silently RESIZES a wall.** Nothing warned, nothing refused, and the sentence contains no imperative to change anything.

A new capability MUST be pinned against a claiming-discipline corpus, and the three named failure modes below are the ones this repository has actually shipped. Each is a rule about the **opener and the shape** of the sentence, not about its nouns:

1. **A VISIBILITY or QUERY opener may never reach a MUTATION.** `highlight` · `isolate` · `hide` · `show` · `select` · `how many` · `what` · `which` · `list` — these ask about the model or change what is drawn; none of them authorises a write. A dimension grammar that matches on *"…taller than 3m"* while ignoring the verb in front of it is claiming a sentence it cannot serve. (P7 is the deeper reason this is not merely a parsing bug: visibility **intent** is a domain concept in `packages/visibility`, so these sentences have a rightful owner that does not exist yet — see §6.3-G10.)
2. **A COUNT may never be read as a DIMENSION.** *"create 10 levels at 3m"* creates **one** level at **10 m**: `add-level` read the quantity as the elevation and the elevation was discarded. A grammar that accepts a bare number must state which quantity that number is, and refuse — naming the ambiguity — when the sentence carries two.
3. **A catalogue-family grammar MUST resolve its ref at PARSE time, not swallow the tail.** *"make all slabs blue"* produces `set-slab-type {typeRef: "blue"}`, and *"set all slabs thickness to 0.2m"* produces `typeRef: "thickness to 0.2m"`. The command then refuses correctly — **but the summary has already stated a falsehood**, because the family's copy is generated before the ref is known to exist. A colour word, a dimension clause or a unit in the ref position means the family does **not** own the sentence; it must decline so the colour or property grammar can answer, and never emit a summary about a type it has not resolved.

**Machine half (⚙)**: check 4c executes the declared adversarial corpus with zero tolerance, and the drain spec pins the 29 as a falsifiable inventory. **Review half (👁)**: no gate yet forbids a *new* misread — §6.3-G10 — so the reviewer's question is fixed: *"which opener does this grammar accept, and is every one of them an imperative that authorises this mutation?"*

**This obligation is not discharged by fixing the 29.** The instances are debt; the rule is permanent.

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
| **f** examples EXECUTED | **4b. EXAMPLE EXECUTION** (ratchet) | `no acceptance FAMILY in … — the id is not enough; the gate needs the family's declared context to execute the capability's own examples.` · `example "…" is REFUSED in the context its acceptance family declares` |
| **f** adversarial pins | **4c. ADVERSARIAL CORPUS** (hard + ratchet) | `tier 0/1 MUTATED on "make all walls white" (intent set-wall-color).` · `N capability(ies) with no adversarial pin, baseline 9.` |
| **a** global route liveness | **3e. GLOBAL ROUTE LIVENESS** (ratchet) | `create-wall: commandProof file "plugins/wall/src/handlers/CreateWall.ts" is a PLUGIN handler with neither the legacy-bridge signature … nor a PLUGIN_LIVE_ALLOWLIST entry.` |
| **e** scopes HONOURED | **5c. SCOPE MODES HONOURED** (hard + ratchet) | `DECLARES scope mode "level" but the intent never reached ctx.resolveScope` · `with NO resolveScope injected, scope mode "room" produced "commands" instead of an honest refusal` |
| **a** one undo · **g** partials | **6. ONE DISPATCH + HONEST REPORT** | `a mass edit dispatched 3 bus commands, not one.` · `none of its proof files (…) mention a partial outcome ("skipped" / "of")` |
| **d/h** catalogue exists | **7. CATALOGUE SOURCE** | `packages/ai-host/src/intents/colorRef.ts no longer exports "resolveColorRef" — the ONE resolveCatalogueRef ladder entry point for "color" moved or was renamed.` |
| **i** zero resolver LOC | **8. CASE-ARM RATCHET** | `N hand-written resolver case arms, baseline 27.` |
| §4 case 3 attributes | **9. PROPERTY SURFACE RATCHET** | `N panel-editable propert(ies) the chat cannot reach, baseline 42.` |
| **j** claiming discipline | **4c** + `QueryEngineDrain.spec.ts` (test, not gate) | `"highlight walls taller than 3m" is no longer misread — move it out of MISREAD` · the drain's classification assertion fails when a pill silently changes state |

Rev 2's five original checks (1/1b, 2, 3a–3d, 4, 5/5b) were joined on 2026-08-11 by **eight** more — 4b, 4c, 3e, 5c, 6, 7, 8, 9 — in `bccf08dc`, closing six of the nine §6.3 gaps.

The gate also cross-checks `CapabilityRefusal`'s unconnected-topic table: a topic refused by the language table but **not** listed in `CHAT_UNAVAILABLE` fails, because *"the two halves of the same decision disagree."*

### §6.2 The ratchets (shrink-only)

- **`MAX_UNDECLARED = 0`** since 2026-08-10 (was 269, frozen and drained the same day — each of the 269 was walked and placed; the classification file *is* the roadmap). Raising it requires **a dated justification in the gate source naming the commands**.
- **SDK-facade bypass baseline (172)** — the reason the chat metadata lives in `ChatCapabilityRegistry.ts` and not on the handler object: a `plugins → ai-host` runtime import would add a bypass, and the L2 resolver must answer before any plugin loads. The coupling is made **static** instead, and CI proves it against the real registration lists. *"The guarantee 'a feature cannot ship without its chat metadata' is delivered by the gate, not by an import."*
- **The M-maturity line** printed every run — `M2/M3 direct+selection · M4 scope · M5 true-batch · M6 plans · M7 generative` — makes the roadmap a measured dial rather than a claim.

**Added by the 2026-08-11 closure pass** — six more shrink-only ratchets, each with a dated justification in the gate source naming exactly what it counts and what it cannot see:

| Ratchet | Baseline, **re-measured at `f5f3a5a1`** | What raising it would mean |
|---|---|---|
| unresolved declared examples | **1** (was 5 at authoring) | four of the original five were closed by widening their acceptance family's `ctx`; the survivor is a selection-form example whose family declares no such context, and whose refusal is *correct*. |
| capabilities with no adversarial pin | **9** of 45 (36 pinned) | `redo` · `zoom-fit` · `zoom-selected` · `set-wall-rake` · `add-wall-layer` · `duplicate-level` · `rename-room` · `finish-apartment-chain` · `execute-plan`. The last two matter most — a pasted report line is exactly a level/plan-shaped noun phrase. |
| spatial modes the ARM honours undeclared | **24** (was 20) | spec-driven capabilities × three modes, plus `create-windows-parametric` on room+orientation; the U9.2 delete families raised it by four. **ARM reach, not LANGUAGE reach** — `applyExecutionSpec` handles the scope superset by design and no grammar produces those sentences. |
| unclassified global routes | **1** | `create-wall`. Closes when someone supplies a `commandProof` naming the committer that carries plugin wall patches into the geometry store — or re-routes the verb, as **L-815** did for `wall.updateDimensions`. |
| hand-written resolver case arms | **27** | a new capability that needs an arm is a capability that is not a table row (§5.i). |
| panel-editable properties the chat cannot reach | **42** | the honest §4-case-3 measure; see G1 for the four things it cannot see. `beam.height` is in here, and it is a *lie* rather than a gap (§5.a). |

⚠ **These baselines are measurements of a moving tree.** They were first taken with **41** capabilities registered and are restated above at **45** (41 authored + 4 generated delete families). A tranche landing new capabilities re-measures them **in the same commit**, with the same dated-justification bar. Two of the six moved between rev 2 and rev 3 — one **down** (examples 5 → 1, real closure) and one **up** (spatial reach 20 → 24, a mechanical consequence of four generated capabilities, justified in the gate source). **A baseline is not permission — it is a debt with a name.**

### §6.3 What is enforced, what is partly enforced, and what is not — after the 2026-08-11 closure pass

The nine gaps below were written the day this contract was authored, when six checklist obligations had no gate at all. A hardening pass on **2026-08-11** turned most of them into machine checks. The list is kept **in place, with its original numbering**, so the history is legible: what each gap said, and what is true now. **Rev 3 appends a tenth (G10)** — not because the closure pass missed it, but because the U10.3 drain measurement *created* the evidence for it after the pass ran. Finding a new gap is what a measured system is supposed to do.

Every check named here was **negative-tested** — the fault it exists to catch was injected, the failure watched, and the injection removed. A gate nobody has watched fail is a gate nobody should trust.

#### Now MACHINE-ENFORCED (five)

- **G2 — adversarial corpus + example execution. ✅ ENFORCED (checks 4b / 4c).** Check 4 used to verify only that `examples` was non-empty and that the capability **id** appeared *somewhere* in the acceptance file — a grep, not a proof. The gate now **executes** every declared example through the real ladder (compound → tier 0/1 → NL) in the context the acceptance family declares, and requires it to land on its own capability and not be refused; a capability with no acceptance FAMILY (not merely no mention) fails hard. It also **executes the declared adversarial corpus** — the report-shaped paste-backs, the negations, the hypotheticals, the `with → width` repro — and fails, zero tolerance, on any utterance that produces a command or a local action. The corpus is read out of the acceptance suite itself (`tools/ga-gate/lib/acceptanceCorpus.ts`), so there is one source of truth, not two.
  *Partly:* per-capability adversarial PIN coverage is a **shrink-only ratchet** (9 of 41 capabilities have no pin), because writing a new pin means editing the acceptance suite. The pin heuristic matches a capability's declared verbs/aliases, so it measures *whether anyone aimed a hostile sentence at this capability's vocabulary*, not the strength of the attack.
- **G3 — `scopeModes` truthfulness. ✅ ENFORCED (check 5c).** Each declared spatial mode is driven through `applySemanticIntent` with an injected stub `resolveScope`, and the gate requires the intent to actually reach the resolver **with a descriptor of that kind** — and requires an ABSENT resolver to produce an honest refusal, never a silent widen to `'all'`. The symmetric direction (honoured-but-undeclared) is a **shrink-only ratchet**, baseline 20, because `applyExecutionSpec` handles the scope superset by design: this is ARM reach, not LANGUAGE reach, and no grammar produces those sentences today.
- **G7 — `targets: 'global'` liveness. ✅ ENFORCED (check 3e).** Global capabilities no longer skip classification: the gate takes the capability's `commandProof`, or falls back to the handler file that registers its `busCommand`, and runs the same execution-authority rule as 3d. **It immediately found one:** `create-wall` → `wall.create` → `plugins/wall/src/handlers/CreateWall.ts`, a plugin handler with neither the legacy-bridge signature nor a proof — the exact shape §FIX-CHAT-DEAD-ROUTES found dead 13/13 times. It is **not asserted dead** (composeRuntime registers it as authoritative and the P1 wall path is the flagship plugin route); it is recorded as **unclassified**, ratchet baseline 1, with the audit it needs named in the gate source.
- **G8 — catalogue sources. ✅ ENFORCED (check 7).** A parameter whose `valueSource` is a catalogue kind must name a resolver **module + export that really exists**; a dangling reference fails hard. This proves something answers to the source — `KNOWN_VALUE_SOURCES` only proved it was spelled correctly.
- **G9 — ADR-0315. ✅ CLOSED.** [`ADR-0315 — The universal capability architecture`](../adrs/ADR-0315-universal-capability-architecture.md) is written: one semantic front door, four execution classes, five context services, the U0→U10 phases as actually built with their commits, the founder doctrine (*open language in, hard stoppers at the execution layer*), and the four lies the architecture found. Every "ADR-0315" citation in the gate, the specs, the plans and the issue log now resolves.

#### Now PARTLY enforced (three)

- **G1 — §4 case 3, new attributes. 🔶 PARTLY (check 9).** The coverage ratchet still counts bus VERBS, so an attribute routed through `element.updateParameters` adds no verb. A second ratchet now counts the **property surface**: panel-editable `(kind, field)` pairs from the `SCHEMAS` table in `PropertyDescriptorGenerator.ts` (the exact set the panel writes through the generic verb) against the chat surface **derived by executing every capability probe** and reading the parameter names out of the resulting payloads. Nothing is transcribed. Baseline 42, shrink-only.
  **What it cannot see, and the contract says so:** fields owned by dedicated sections (`WindowSection` / `DoorSection` render width/height/sill/type/colour, so window and door look emptier here than they are); a new field on a `*Data` schema that no panel row exposes; fields written by a dedicated verb; and whether a reachable field is LIVE (that is 3b/3d's job). §4 case 2 — a whole new element kind — is still detected only via the commands it registers.
- **G4 / G6 — "one undo" and partial-outcome honesty. 🔶 PARTLY (check 6).** The provable halves are now proven: a mass-edit capability's probe is executed at scope `'all'` and must emit **exactly ONE bus command** (a fan-out calling itself one undo fails), and the command carrying the edit must speak the **partial-outcome vocabulary** (`skipped` / `N of M`) in its own source, so §5.g's report is read off a real payload rather than narrated. Thirteen capabilities are under this bar today.
  **Runtime-only, and still review-enforced:** whether that one command pushes exactly one history entry at runtime, and whether the report payload is populated *truthfully*. No static check can see either.
- **G5 — "zero resolver LOC". 🔶 PARTLY (check 8).** Made measurable as a **shrink-only count of hand-written `case` arms in `applySemanticIntent`** (baseline 27): a new capability that adds an arm fails. A git-diff check ("a new capability id in the same commit as a new `case '<id>':`") was **considered and rejected** — it needs a reliable merge base, is silent on a two-commit PR, and says nothing when run on a clean tree. **It cannot see LOC inside an existing arm**; it measures the number of shapes the resolver hand-writes, which is what §5.i is about.

#### Still NOT enforced

- **§5.g refusal QUALITY.** That a refusal quotes real names, numbers and units — and names the gap rather than widening the scope — is pinned byte-for-byte by the acceptance suite where it exists, which catches regressions but cannot force a *new* capability to write good copy. Review-enforced, and the reviewer's question is §9's.
- **§5.h catalogue AUTHORING.** Check 7 proves a *declared* catalogue source exists. Whether a family that *should* have a catalogue has one — the founder ruling that the answer to "no catalogue" is *author one* — is a judgement about absence, and `CatalogueFamilies.ts` records the honest per-family reasons rather than a gate.
- **§4 case 2, a new element KIND**, independent of the commands it registers.
- **G10 — §5.j claiming discipline, for a NEW grammar. ❌ NOT ENFORCED (added rev 3).** Check 4c executes the declared adversarial corpus with zero tolerance, and `QueryEngineDrain.spec.ts` pins the **29 known misreads** as a falsifiable inventory that fails when one is fixed. Neither can stop a *new* capability from claiming a sentence it has no right to: 4c only runs the corpus someone thought to write, and the drain only knows the phrasings that happen to be hand-written panel pills. The general check would be *"no capability claims an utterance whose opener is a visibility or query verb"*, which needs an opener taxonomy the resolver does not currently expose. **Until it exists this is §9's reviewer question, and it is the item most likely to ship a destructive defect** — one of the 29 already is.
  *Related and NOT the same gap:* a **read-only / visibility capability class** does not exist at all. P7 says visibility intent is a domain concept in `packages/visibility`, not UI state, so *"hide all walls"* and *"how many elements are in the model?"* have a rightful owner that has never been built — which is why they are the largest of the four families the U10.3 drain measured as still uniquely SERVED by the legacy QueryEngine (**71 phrasings**). A capability with no bus command is a design step, not a transcription.

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
| **g** | **Report text that commands.** Letting the assistant's own output re-enter as an imperative, or letting typo correction manufacture one. | §FIX-CHAT-REPORT-PASTEBACK · §FIX-CHAT-STOPWORD-CORRECTION (`795cbec1`, `05930960`), **L-823** |
| **h** | **The grammar that claims a question.** Matching on the nouns and numbers while ignoring the OPENER, so a read-only ask reaches a write. *"highlight walls taller than 3m"* → `set-height` → `wall.updateDimensions`. | §5.j · the 29 pinned MISREADs in `apps/editor/src/ui/ai/__tests__/QueryEngineDrain.spec.ts` (`e08530b8`) |
| **i** | **The summary that speaks before the ref resolves.** A catalogue family swallowing a colour or dimension tail as a `typeRef`, printing a confident sentence about a type that does not exist, and only then refusing. | §5.j.3 · *"make all slabs blue"* → `set-slab-type {typeRef: "blue"}` |

---

## §8 — Worked example: `set-door-type` (RAC U4.3)

The proof that the checklist is cheap when the machinery is used: **a catalogue family added as ~94 lines of metadata with ZERO new resolver case code.** Gate immediately after it: 27 capabilities, undeclared 0/0. (At `f5f3a5a1` the same gate reads **45 capabilities covering 31 commands, undeclared 0/0** — the machinery scaled; the checklist did not change.)

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

C68 adds **no Tier-1 launch-gate obligation** — it governs correctness of a claim, not data integrity or durability.

**Reconciliation with C67 rev 3.** C67 was refreshed on the same day to the U0–U10 state: 45 capabilities, the generator pattern, the scope algebra, the plan executor and the LLM rung all moved from TO-BE into AS-IS, with C67 §1.6 recording the open defects and C67 §4.7 stating **claiming discipline** as a binding rule. C68 §5.j is the procedural expansion of that rule, exactly as C68 as a whole is the expansion of C67 §6. **The two contracts state the same live numbers, measured at `f5f3a5a1`; if they ever diverge, re-run the gate and fix both — neither is a second source of truth about the other.**

It remains **CANONICAL, not ACTIVE**, and neither the closure pass nor rev 3 changed that verdict, deliberately. Five of ten gaps are machine-enforced and three more are half-enforced, which is a large move — but ACTIVE would mean C68 *certifies* that every shipped capability satisfies every item, and four things stand in the way:

1. **§5.g refusal quality** is a review judgement with no gate;
2. **§5.j claiming discipline has no general gate** (G10) — and unlike the others, this one has a **known live destructive instance**: a visibility question that resizes a wall. It is now the item most likely to be got wrong by someone in a hurry, and rev 3 promotes it above §5.g for that reason;
3. **the runtime halves of §5.a and §5.g** — one history entry, and a truthfully populated report payload — are provable only against a running editor;
4. **six of the new checks are ratchets, not zero-tolerance bars.** A ratchet at baseline 42 is an honest debt, not a clean sheet.

C68 becomes **ACTIVE** when the six ratchets reach zero (or are retired with a stated reason), the 29 pinned misreads are drained, and the two runtime obligations acquire a probe — U0.4's dev-mode store-generation assertion is the shape that would do it. Until then, §9's review questions are not optional decoration; they are the part of the contract a machine is not doing.

**Review question for every PR in scope, exactly as C67 §6 puts it:**

> *Does the registry entry describe what the command provably does — nothing more, nothing less?*

And C68's two additions:

> *If the answer is "the chat cannot do this", where is that written down in a sentence a user could read?*

> *Which openers does this grammar accept — and is every one of them an imperative that authorises this mutation?* (§5.j)
