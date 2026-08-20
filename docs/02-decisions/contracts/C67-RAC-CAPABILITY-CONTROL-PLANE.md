# C67 — RAC: The Natural-Language Capability Control Plane

> **Stamp**: 2026-08-19 (rev 5 — §1.8, the per-family AS-IS/TO-BE surface, lane RAC1; rev 4 was the conformance-study fold-in) · **Status**: CANONICAL
> *(rev 3 was 2026-08-11, the U0–U10 refresh, measured at `f5f3a5a1`. Rev 4 re-measures at
> `f89c735c` and folds in the RAC conformance study; §0.2 says what moved and what was retracted.)*
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

## §0.2 — What changed in rev 4, and the one thing that was PROVEN in production

Rev 3 was written on the day the RAC conformance study was measured, and did not know its results.
The study is five documents plus a harness:

| Document | What it measures |
|---|---|
| [`RAC-CONFORMANCE-SCORECARD-CAT1-5.md`](../../04-reference/RAC-CONFORMANCE-SCORECARD-CAT1-5.md) | founder operations 1–53 (PROJECT/STRUCTURE · WALLS · OPENINGS · SLABS · ROOFS) — **55 rows × 7 verdicts**, plus a millimetre geometry oracle, an adversarial corpus, and §5A's headless composition-root probe |
| [`RAC-CONFORMANCE-SCORECARD-CATEGORIES-6-10.md`](../../04-reference/RAC-CONFORMANCE-SCORECARD-CATEGORIES-6-10.md) | ROOMS · VISIBILITY · MATERIALS/METADATA · BATCH · COLLABORATION — **39 rows × 7 verdicts** |
| `RAC-CAPABILITY-PARITY-INVENTORY.md` · `RAC-GENERATIVE-INFRA-INVENTORY.md` · `RAC-SITE-CONTEXT-INVENTORY.md` | the parity, generative and site-context surfaces |
| `tools/rac-conformance/` | the re-runnable harness behind all of the above (§9 of the cat-1-5 scorecard lists every command) |

Rev 4 folds four things out of those documents into this contract: **§1.0** (the seven-claim
vocabulary), **§1.2** (numbers re-derived with the command that produces each), **§1.6** (every
open defect reconciled against a 2026-08-19 measurement), and **§1.7** (the scorecards' verdicts,
with the UNPROVEN cells preserved as UNPROVEN). §4 gains two binding rules and §6.1 gains the
authoritative-state gate that did not exist in rev 3.

### ⭐ The study's central claim was CONFIRMED IN PRODUCTION, four times over, by the founder

The 2026-08-11 engineering audit called D14 the strongest subsystem in the repository — and then
named the exact limit of that strength, verbatim:

> *"It proves **declaration ↔ route**. It does **not** prove **route → AUTHORITATIVE STATE**.
> §8 questions 7–9 are UNPROVEN for every sampled capability."*

Seven days later the founder typed *"make all inner finishes walls on the ground floor to wood"*
on the live deploy. The chat answered *"Set the interior finish of all 17 walls on Ground to Wood ·
Oak (Light). **Done — undo with Ctrl+Z.**"* **Nothing changed.** Lane WF1 took it apart and found
**four independent defects behind one sentence** — one per column of §1.0, in the order the columns
are written:

| Verdict | The defect | Where | Closed |
|---|---|---|---|
| **V3 STATE** | `WallStore.updateWall()` projects the incoming snapshot onto a **twelve-field editable whitelist**; `sideFinishes` was not on it. The store returned normally, `SetWallSideFinishCommand.execute()` returned `{success:true}`, the record held `undefined`. | `packages/geometry-wall/src/WallStore.ts:929` · `packages/command-registry/src/walls/SetWallSideFinishCommand.ts:133` | **L-995**, `5f126d33` |
| **V5 UNDO** | `restoreSnapshot()` carried the **identical** omission, so undo would have left the new value standing (C84 EI-7a — WRITES ⊋ RESTORES). | same file, second projection | **L-995**, `5f126d33` |
| **V4 PERSIST** | **Four** hand-written whitelists across two serializers and two loaders dropped the field on save/load, plus `CreateWallCommand`, the chokepoint both loaders rebuild through. | `{packages/persistence-client,apps/editor/src/engine}/…/Project{Serializer,Loader}.ts` | **L-999**, `d36a1932` (+ test `53223b42`) |
| **V7 REPORT** | `wall.setSideFinishBatch` was absent from `BATCH_REPORT_EVENTS`, so `expectsReport` was false and the canned *"Done — undo with Ctrl+Z"* printed for **17-of-17, 0-of-17 and never-ran alike**. Two further verbs (`slab.updateSystemTypeBatch`, `ceiling.updateSystemTypeBatch`) had the same hole. | `apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:1201` | **L-996**, `137a86d9` |

Two more from the same sitting: **L-997** (`bf135764`) — a wall type carrying no layers reached the
store as `layers: null` against a schema wanting `array | undefined`, and threw; and **L-998**
(`0db767c5`, RED-proof `5c74d0b2`) — **a refusal that advertised, in its own sentence, the
capability it was refusing**: *"Wall material isn't connected to chat yet. I can change … **wall
side finish and finish layer**."* The "what I CAN do" half is generated from this registry, so the
topic table was denying what the registry was offering.

⭐ **And the reason it went unseen for a week is the finding to carry forward.**
`L960SideFinishDisclosure.test.ts:60` "proved" the write against a hand-written store whose entire
update method was `updateWall(next) { map.set(next.id, structuredClone(next)); }` — **a fake that
accepts every field, standing in for a real store that accepts twelve.** *A fake more capable than
the real thing cannot falsify the real thing.* See [[fake-more-capable-than-real]].

**This converts the study's UNPROVEN V3 column from a harness limitation into a measured,
recurring defect class**, and it is why §4 gains rule 12.

---

## §1 — AS-IS (re-measured 2026-08-19 at commit `f89c735c`)

⚠ **Rev 3 opened this section with:** *"Every number in this section is printed by
`npx tsx tools/ga-gate/check-chat-capability-coverage.ts`."* **That is no longer sufficient and it
was never quite true.** Four of the eight rows in rev 3's §1.2 table are printed only on the gate's
**success** path (`check-chat-capability-coverage.ts:1554-1565`), and **the gate exits 3 before
reaching it** — so a RED run hides its own census. Every row of §1.2 now carries **the command that
derives it**, and rows nothing currently derives are marked **NOT PRINTED**, not transcribed.

### §1.0 — "It worked" is SEVEN claims, and this contract scores them separately

This vocabulary comes from the RAC conformance study and is now **part of this contract**, not a
footnote in a reference document. **A capability's conformance is a vector, never a boolean.**

| | Verdict | What would prove it |
|---|---|---|
| **V1** | **RESOLVE** | the utterance lands on the intended capability, not a rival grammar |
| **V2** | **DISPATCH** | it reaches the intended bus command **carrying the intended numbers** |
| **V3** | **STATE** | **the store the renderer and persistence actually consult now holds the new value** — not `success === true`, not a call count, not the plugin DTO store |
| **V4** | **PERSIST** | save → reload → still there |
| **V5** | **UNDO** | one undo reverses it, and reverses **the right thing** |
| **V6** | **SYNC** | a **second client** receives the authoritative change (only where C66 claims it does) |
| **V7** | **REPORT** | the transcript is TRUE — partial says partial, refusal names its code |

**Three values, never two: `PASS` ≠ `FAIL` ≠ `UNPROVEN`.** *"UNPROVEN is a different fact from FAIL,
and the two are never merged"* (cat-1-5 scorecard §0). An UNPROVEN cell is an invitation to measure;
a FAIL cell is a defect with an owner; collapsing either into the other destroys the difference.

#### What the ladder and its gate ESTABLISH today — and what they do not

| | Established by | Reading (2026-08-19) |
|---|---|---|
| **V1** | ✅ **gate 31 check 4b** — every declared example is *executed* through the real ladder and must land on its own capability un-refused; **check 4c** executes the adversarial corpus with zero tolerance | **182** declared examples across **56** capabilities; **1** unresolved (ratchet 1/1) |
| **V2** | ✅ **gate 31 checks 2 / 3d / 6 / 7** — the declared target is really accepted, the route's proof file sits in an execution-authority root, a mass edit emits exactly one command | but see **F-3** in §1.7: `cap.busCommand` is **one value describing a one-to-many route**, so every check keyed on it reasons about one of the verbs a capability can emit |
| **V3** | ⚠ **PARTIAL, and outside gate 31.** `tools/rac-conformance/certification/gates/check-authoritative-state.ts` executes verbs against the composed headless world and diffs the authoritative store. | **18 distinct verbs / 21 cases** (`results/authoritative-state.json`, last written **2026-08-16**) against **325** registered bus commands and **35** commands the chat covers. **Gate 31 itself proves no V3 at all** — check 3d classifies liveness by the **directory the proof file lives in**. |
| **V4** | ⚠ **PARTIAL, outside gate 31** — `certification/__tests__/persistence.cert.ts`, graded by `certify.ts` (0 FAILED of 18 rows, `cert-ratchet.json`) | 18 rows, **all "PARTIALLY VERIFIED"** — Collaboration is UNPROVEN by construction on every row |
| **V5** | ⚠ **PARTIAL, outside gate 31** — `certification/__tests__/undoredo.cert.ts` | 16 rows, 0 FAILED, **all "PARTIALLY VERIFIED"** |
| **V6** | ❌ **NOT ESTABLISHED for the chat.** `check-two-client-convergence.ts` exists; the cat-6-10 scorecard §1.7 source-proves that the CRDT **read-back leg does not exist** (`YjsDocAdapter.ts` has zero `.observe`) and the transport defaults OFF | **V6 = FAIL on all 39 cat-6-10 rows**, one identical reason |
| **V7** | ⚠ **PARTIAL** — `ReportPayloadHonesty.spec.ts` drives six engine payloads to six distinct transcripts, and `batchReportEventsCompleteness.spec.ts` (added by L-996) derives the required `BATCH_REPORT_EVENTS` key set from the handlers themselves | the table-row omission class is now gated; refusal **quality** remains a review judgement (C68 §6.3-G9) |

> ⛔ **So: "138 examples EXECUTED" — or today's 182 — is a V1/V2 statement and nothing more.**
> It was read as end-to-end proof once, and L-995 is what that cost. The certification gates that
> reach V3/V4/V5 are **advisory** in CI (`bim20-certification` is `continue-on-error: true`,
> `.github/workflows/ci.yml`), cover **18 of 325** verbs, and **did not cover
> `wall.setSideFinishBatch`** — the verb the founder's sentence failed on.

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

### §1.2 The live measurement — every row with the command that derives it

**Re-derived 2026-08-19 at `f89c735c`.** ⛔ **Never transcribe a number without its derivation.**
`G` = `npx tsx tools/ga-gate/check-chat-capability-coverage.ts`.

| Measure | 2026-08-19 `f89c735c` | 2026-08-11 `f5f3a5a1` | Derivation |
|---|---|---|---|
| registered bus commands | **325** | 319 | `G` line 2 |
| chat capabilities | **56**, covering **35** commands | 45 / 31 | `G` line 3 |
| explicitly deferred (`CHAT_UNAVAILABLE`) | **52** | 51 | `G` line 4 |
| classified (`ChatCommandClassification.ts`) | **238** — B needs-design 133 · C internal 50 · D duplicate 48 · **E unsafe 4** · F deferred 3 | 237 (E 3) | `G` line 5 |
| **UNDECLARED** | **0** (baseline 0) | 0 | `G` line 7 |
| maturity | M2/M3 **56** · M4 scope **17** · M5 true-batch **16** · M6 plans **1** · M7 generative **4** | 45 · 13 · 12 · 1 · 4 | `G` line 6 |
| declared examples across all capabilities | **182** (0 capabilities with none) | — | `npx tsx tools/rac-conformance/dump-capabilities.ts` → sum of `examples[]` |
| adversarial corpus size | **41** | 18 / 24 (two different figures were in circulation) | the `it.each([…])` block at `packages/ai-host/__tests__/capability-acceptance.test.ts:1156-1238` |
| examples EXECUTED · adversarial EXECUTED · scope probes honoured · pinned | **NOT PRINTED at this reading** | 138 · 18 · 15 · 36/45 | `check-chat-capability-coverage.ts:1554-1565` — these four print **only on the success path**, and the gate exits 3 first (see below) |

**The C68 §6.3 ratchets, printed on every run** (`G` line 8):

| Ratchet | Reading | Baseline | State |
|---|---|---|---|
| unresolved examples | 1 | 1 | at level |
| unpinned capabilities | 7 | 9 | **below** — 49 of 56 pinned |
| **undeclared spatial reach** | **26** | **24** | 🔴 **EXCEEDED — the gate exits 3** |
| unclassified global routes | 1 | 1 | at level (still `create-wall`, §1.6 retraction-table row 2) |
| resolver case arms | 27 | 27 | at level |
| unreachable properties | 40 | 42 | **below** |

> 🔴 **GATE 31 IS RED AT THIS READING — `RC=3`, and rev 3 did not record it because it was green
> then.** The two over baseline are **`set-wall-side-finish honours "level"`** and **`… "room"`**,
> and they are a **direct and foreseeable consequence of the L-998 fix** (`0db767c5`): making the
> bare *"change wall finish to X"* phrasing claim moved that capability onto the generic
> `applyExecutionSpec` arm, which handles the scope SUPERSET. Per the ratchet's own header this is
> **ARM reach, not LANGUAGE reach** — the gate injects the descriptor directly, no grammar produces
> *"…in the kitchen"* for this capability, and **nothing user-visible over-claims**. It is
> nonetheless a breach of a shrink-only ratchet and **a baseline is not permission** (§4.9). Logged
> **L-1080**; the fix is to declare the two modes once the grammar produces them, or to narrow the
> arm — **never to raise the number.**

Of the 56, the great majority are authored records in `ChatCapabilityRegistry.ts`; **4 are
GENERATED** (`delete-furniture-scoped` · `delete-windows-scoped` · `delete-doors-scoped` ·
`delete-columns-scoped`, from `DeleteFamilies.ts`). That the count is not equal to the number of
hand-written records is the point of §1.3.

**Capabilities added since rev 3, each of which moved a scorecard row:** the read-only /
visibility class — `hide-selection`, `isolate-selection`, `reveal-all`, `visibility-query`
(`a48fa88d`, the first capabilities ever to carry a read-only marker; **1 of 56** does) — and
`set-overhang` (`ee6ad0d8`), which turned cat-1-5 row 5.6 from FAIL/FAIL to PASS/PASS.

### §1.3 The generator pattern — a capability is a TABLE ROW, not resolver code

This is the substantive architectural change since rev 2 and the reason the count moved 16 → 45 (and now **56**) without the resolver growing. Four tables now feed **one generic arm** each, and `applySemanticIntent` remains the single switch:

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
- ⭐ **The PLACE half of a scope is parsed in exactly ONE place — `intents/SpatialScopeTail.ts` — and the PREPOSITION never decides `level` vs `room` (added rev 6, L-1201).** See §4 rule 16 for the ruling and for what its absence cost. Until L-1201 each grammar wrote its own tail with `on`→level / `in`→room hard-wired, so the founder's *"in level 2"* meant *a room called "level"* and leaked its "2" into the value.
- ⭐ **A LEVEL SCOPE MUST BE SATISFIABLE FOR THE KIND IT NAMES (added rev 6, L-1201).** The editor-side level arm resolved `getAll().filter(e => e.levelId === level.id)` — and `WindowOpening`/`DoorOpening` **carry no `levelId` at all**; a hosted opening takes its level from its **host wall**. So the level arm for windows and doors compared `undefined` to a level id and returned `[]` for **every level of every project**, answering *"There are no windows on Level 2"* about a level full of windows. **Before asking why a scope is wrong, ask whether its condition can EVER be true.** The derivation is now per-RECORD (own `levelId` → host wall's → a **counted skip with its reason**), never a remembered list of hosted kinds — `intents/HostedOpeningScope.ts`.

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

### §1.6 OPEN defects — RECONCILED 2026-08-19, closures recorded with their SHA

⚠ **Rev 3 listed these five as true at `f5f3a5a1`. Four are now CLOSED and one STANDS.** Per C84 §6
the old text is **struck, not deleted** — *what changed* matters more than the new value, and a
reader arriving from C68 §5.j or from the scorecards needs to see which claim was retracted.

| # | Rev-3 claim | 2026-08-19 | Evidence |
|---|---|---|---|
| **1** | *"29 MISREAD phrasings … the worst is destructive: `highlight walls taller than 3m` → `set-height` → `wall.updateDimensions`"* | ✅ **CLOSED for the destructive instance; the inventory is now 7, not 29** | `fd27e513` (§FIX-CHAT-VISIBILITY-MISREAD + §FIX-CHAT-TYPEREF-SWALLOW), plus §FIX-CHAT-HIDE-IS-NOT-NAVIGATE and §FIX-CHAT-PROPERTY-REMOVAL-IS-NOT-DELETE. `QueryEngineDrain.spec.ts`'s `MISREAD` array holds **7** entries and its `DRAINED` array **25**; `probe-categories-6-10.ts` §D prints `LIVE MISREADS: 0 of 7` against its own regression set, with `show level 2` retained as the CONTROL |
| **2** | *"`create-wall` → `wall.create` is an UNCLASSIFIED route"* | 🔴 **STANDS, unchanged** | `G` line 8: `unclassified global routes 1/1`; `probe-route-shadowing.ts` §B independently reaches the same one row — `plugins/wall/src/handlers/CreateWall.ts`, PLUGIN-ONLY, presumed-detached |
| **3** | *"`beam.height` is an editable property-panel row while `BeamData` has no height"* | ✅ **CLOSED** | `PropertyDescriptorGenerator.ts:134-163` — `§PROP-BEAM-PANEL-LIE (RAC U9)` removed **two** dead controls (`height` **and** `baseOffset`); `height` became `depth` with `BEAM_CONSTRAINTS` bounds rather than the invented 0.05–2. ⚠ **This file is now adjacent to lane EL1's property-panel work — reported, not touched** |
| **4** | *"Selection context is effectively single-element in the bridge"* | ✅ **CLOSED** | `ZeroTokenChatBridge.ts:150-174` — `currentSelection()` reads `selectionBus.currentIds`, the full multi-selection (ADR-0314 §Selection batch, `cc796de4`); the single-object walk survives only as a fallback, and an id no store claims is DROPPED rather than guessed |
| **5** | *"A stale selection id from a previous rebuild still fails at dispatch"* | ⚪ **NOT MEASURED** | the drop-unclassifiable rule at `:167` narrows the window but does not close it, and no probe drives a rebuilt-id case. An honest blank rather than a confident sentence |

> **The CLASS, not the instances, was and remains the standing obligation.** The 29 were all
> **claiming-discipline** failures: a grammar claimed a sentence whose opener it had no right to.
> C68 §5.j binds every new capability against the claiming-discipline corpus, and **C68 §6.3-G10
> still records that obligation as ❌ NOT ENFORCED** for a *new* grammar. **Draining 22 of 29 did
> not discharge §5.j — and the four rows below prove it, because three of them are new.**

#### The OPEN list as re-measured 2026-08-19 — rows **O-1 … O-6**

`P15` = `npx tsx tools/rac-conformance/probe-categories-1-5.ts` · `P610` =
`npx tsx tools/rac-conformance/probe-categories-6-10.ts`. Both exit 0 always — they are
measurements, not gates.

**O-1** · 🔴 **DESTRUCTIVE, STILL LIVE — `remove the plasterboard layer from all walls` deletes the WALL.**
`P15` row 2.11: `commands[tier nl] intent=delete-selected → element.delete({"elementId":…,"elementType":"wall"})`.
A user asking to remove a **layer** has their entire **wall** deleted. ⚠ **Its sibling
`remove the material from this wall` was fixed** (§FIX-CHAT-PROPERTY-REMOVAL-IS-NOT-DELETE) and
five `remove <property> from <element>` phrasings were added to the adversarial corpus — **the
`layer` noun was not among them**, and `add-wall-layer` exists while remove does not, so the
asymmetry is also a trap. **L-1081.**

**O-2** · 🔴 **DESTRUCTIVE, STILL LIVE — `undo would remove the wall, right?` deletes the wall.**
`P15` §Adversarial, `1 of 14 mutated`: a **hypothetical whose main verb is `undo`** dispatches
`element.delete`. Neither this utterance nor 2.11's is in the D14 adversarial corpus
(`grep -rn "undo would remove" packages/ apps/` → **only** `tools/rac-conformance/operations-1-5.ts:499`),
so **check 4c executes neither**. C68 §5.f's corpus contains negations and paste-backs but no
HYPOTHETICAL-ABOUT-A-DESTRUCTIVE-VERB class. **L-1082.**

**O-3** · 🟠 **A negative dimension is dispatched with no bound check.** `P610` row 8.8c:
*"make this wall minus three metres tall"* → `commands[wall.updateDimensions] intent=set-height`.
**L-1083.**

**O-4** · 🟠 **An unknown property is claimed by `set-height` and answered with a clarification built from
a nonsense number.** `P610` rows 8.4 / 8.5 / 8.8 / 8.8b: *"set the mark of this wall to W-12"* →
*"Should I set the height, the thickness, or the width to **-12 m**?"*; *"set the acoustic rating
… to 52 dB"* → *"… to **0.052 m**?"*; *"set the classification … to Uniclass EF_25_10"* → *"… to
**10 m**?"*; and the invented property *"flurbosity"* → *"… to **7 m**?"*. Non-mutating, so not a
P0 — but it is §5.j exactly: the grammar matched a number and a noun and ignored the fact that
the property named is one it does not have. The cat-6-10 scorecard scored this as *"a silent
miss, not a refusal"*; **the miss has since become a confident wrong question**, which is worse
to read and no safer. **L-1084.**

**O-5** · 🔵 **`create-wall` → `wall.create` remains an unclassified route** (retraction-table row 2 above), ratchet 1/1.

**O-6** · ⚪ **Stale selection id — NOT MEASURED** (retraction-table row 5 above).

### §1.7 The conformance scorecards — 94 founder operations × 7 verdicts

The founder named ~92 BIM operations and asked whether the RAC performs them **reliably**. Gate 31
cannot answer that (§1.0). Two scorecards do, and their verdicts are **folded in here rather than
summarised away**. ⛔ **The UNPROVEN cells are reproduced AS UNPROVEN.** They are not FAILs, they
are not PASSes, and tidying them into either would destroy the study's most useful output.

#### §1.7.1 Categories 1–5 — 55 rows (PROJECT/STRUCTURE · WALLS · OPENINGS · SLABS · ROOFS)

| Verdict | 2026-08-19 (`P15`) | 2026-08-11 first pass |
|---|---|---|
| **V1 RESOLVE** | **27** PASS · 23 FAIL · 5 UNPROVEN | 26 · 24 · 5 |
| **V2 DISPATCH** | **26** PASS · 26 FAIL · 3 UNPROVEN | 25 · 27 · 3 |
| **V3 STATE** | 0 PASS · 0 FAIL · **55 UNPROVEN** *(this probe is static; §5A's runtime harness separately moved 4 rows to FAIL and 1 to PASS — see below)* | 0 · 1 · 54 |
| **V4 PERSIST** | 0 · 0 · **55 UNPROVEN** *(§5A: 1 PASS, door round-trip)* | 0 · 1 · 54 |
| **V5 UNDO** | 0 · 0 · **55 UNPROVEN** *(§5A: 1 PASS, 1 FAIL)* | 0 · 0 · 55 |
| **V6 SYNC** | 0 · 0 · **55 UNPROVEN** | 0 · 0 · 55 |
| **V7 REPORT** | **6** PASS · **10** FAIL · 39 UNPROVEN | 2 · 21 · 32 |
| adversarial utterances that mutated | **1 of 14** (§1.6.2) | 1 of 14 |

**V7 more than halved its FAILs (21 → 10) and V1/V2 each moved one row.** The shape of the rest is
unchanged, and the honest reading is the scorecard's own: *the failures are overwhelmingly
**absence**, not malfunction.* Roof is the clearest case — `roof.create`, `roof.setShape`,
`roof.setOverhang`, `roof.setPitch`, `roof.setThickness` and `roof.move` all exist and the geometry
beneath them is measurably correct; **the chat reached exactly one of them** at rev 3, and reaches
two now (`set-overhang` landed in `ee6ad0d8`). *A correctly-built subsystem with almost no language
surface is the `c1902a5a` defect C68 exists to prevent.*

**Named findings, and where each now stands:**

| | Finding | 2026-08-19 |
|---|---|---|
| **F-1** | a hypothetical about a destructive verb MUTATES; the same root produces row 2.11 | 🔴 **STANDS** — §1.6 O-1 / O-2, **L-1081 / L-1082** |
| **F-2** | **`roof.update` claimed by TWO handlers that disagree about the authoritative store.** The plugin DTO handler registers inside `composeRuntime` and wins by first-registration; its store has no committer, no reader, no serializer. **The chat said "Done" and the roof did not change — V3 and V4 FAIL, proven by static call graph.** And because the defect was in the VERB, the roof property panel and the 3-D move gizmo dispatched the same dead verb. | ✅ **CLOSED** — `2c8b4904` (**L-839**) applied the L-815 precedent: `'roof.update'` left `ROOF_HANDLER_TYPES`, so the `initBusHandlers.ts:597-602` bridge wins and `UpdateRoofCommand` reaches the geometry `RoofStore`. `probe-route-shadowing.ts` now prints **`A. SHADOWED … (0)`** |
| **F-3** | the registry's declared `busCommand` is **one value describing a one-to-many route** — `set-height` declares `element.updateParameters` and dispatches `wall.updateDimensions` | 🔵 **STANDS as a stated limit on what "UNDECLARED: 0" covers.** Not a defect; every gate 31 check keyed on `cap.busCommand` reasons about one of the verbs a capability can emit |
| **F-4** | four operations with no route are nonetheless *claimed* by a capability — the `ElementCapabilities` lie in live grammar | 🟠 **PARTLY STANDS.** `delete level 2` → `go-to-level` and `create a new project called Villa Alba` → `generation.building` still reproduce (`P15` rows 1.10, 1.1); `set the ridge height to 2m` → `set-height` still substitutes overall height for ridge height (row 5.5) |
| **§3 geometry** | the four founder-flagged roof-geometry defects (centroid dilation sold as parallel offset; `shrinkPolygon` returning 2-vertex "polygons"; mansard silently returning a hip; a convex hull as perimeter) | ✅ **FIXED and MEASURED** — 300.00 mm requested → 300.00 mm delivered, **spread 0.000 mm**, on square/elongated/L/U plans; impossible insets REFUSE. Machine-enforced by `tools/ga-gate/check-offset-implementations.ts`. ⚠ **One residual**: a zero-area **collinear** ring is still reported `degenerate=false` (`packages/geometry-kernel/src/pure/polygonOffset.ts`) — handed to the geometry owner as D-3, **not this lane's tree** |

#### §1.7.2 The §5A runtime finding — this is the structural one

`tools/rac-conformance/runtime-harness/` composes the **real** `composeRuntime()` in Node under
happy-dom with **zero stubs** (51 slots, ~236 bus handlers, `renderer: null`). It found:

> **`runtime.stores` exposes only `registerHydrator, hydrate, viewState, project`.** After a
> successful compose, `wallStore` · `slabStore` · `roofStore` · `stairStore` · `columnStore` ·
> `curtainWallStore` · `gridStore` · `beamStore` · `handrailStore` · `roomStore` · `ceilingStore` ·
> `floorStore` · `furnitureStore` · `plumbingStore` are **ABSENT**. Doors and windows are reachable
> only because they happen to be **module singletons**. The stores the serializer, the fragment
> builders, the 2-D projector and the IFC exporter read are built by
> `apps/editor/src/engine/engineLauncher.ts` — the DOM/renderer half — which `composeRuntime()`
> never references.

Measured consequences, not inferred: `door.create` **dispatches OK and leaves the authoritative
`doorStore` at 0 records**; `door.move` against a door that *is* in the authoritative store is
refused *"door not found"* because the handler consults the DTO store. **V3 = FAIL, not UNPROVEN.**
Two rows moved to PASS with real store reads — a door record surviving the production
`ProjectSerializer` → JSON → real `ProjectLoader` (V4) and `UpdateDoorSystemTypeCommand` reversing
`systemTypeId` (V5) — **and both came through the persistence / command-registry paths, not the
bus.**

> **So V3 is unprovable-by-construction for twelve element kinds until either `composeRuntime`
> constructs the authoritative stores, or the plugin handlers stop writing detached DTO stores.
> That is an ADR, not a patch** — and it is the largest single item this study identifies. ⚪ **NOT
> MEASURED by this pass** whether the certification world (`certification/world.ts`, which imports
> `initBusHandlers` precisely so the LIVE bridge verbs exist) has since closed the gap for the 18
> verbs it covers; its `seedOutcomes` show all 18 kinds SEEDED, which suggests it has for those.

#### §1.7.3 Categories 6–10 — 39 rows (ROOMS · VISIBILITY · MATERIALS · BATCH · COLLABORATION)

**V1 at first pass: 12 PASS · 20 FAIL · 1 UNPROVEN.** **V6 SYNC: 0 PASS, FAIL on all 39, one
identical reason.** **V4 and V5: 0 PASS.** **V7: 5 PASS, all in category 9, all executed.**

| Finding | First pass 2026-08-11 | 2026-08-19 (`P610`) |
|---|---|---|
| adversarial read-only set | 🟢 **0 mutations in 38 phrasings** at the zero-token ladder | 🟢 **`READ-ONLY VIOLATIONS: 0 of 38`** — holds |
| *"hide level 2"* NAVIGATES instead of hiding (the founder's exact case); `hide` and `show` — two opposite asks — produced the same `setActiveLevel` | 🔴 P0-class | ✅ **CLOSED** — `hide level 2` is now an honest miss that falls through to the live legacy hide handler; **`show level 2` → `go-to-level` is retained as the CONTROL**, because for `show` that is the right answer. A blanket refusal would have "fixed" `hide` by breaking `show` |
| *"remove the material from this wall"* → **`element.delete`** | 🔴 P0-class | ✅ **CLOSED** — refuses by naming the gap; five `remove <property> from <element>` phrasings pinned in the adversarial corpus. ⚠ **the `layer` noun was missed — §1.6 O-1** |
| **Category 7 does not exist as a RAC capability; ZERO of 45 carry a read-only marker** | 🔴 | 🟠 **PARTLY CLOSED** — `a48fa88d` shipped `hide-selection` · `isolate-selection` · `reveal-all` · `visibility-query`; `P610` §C now reports **1 of 56** capabilities carrying a read-only marker, and *"what is hidden"* answers without mutating. **Still absent: level-scoped and room-scoped hide** (`hide all the walls`, `isolate the kitchen` → MISS), and **per-element unhide refuses honestly** rather than working |
| visibility has **no undo, no persistence, no sync** — `affectedStores: []`, `serialize()`/`deserialize()` with zero callers, `not-synced` in `syncDisposition.ts` | 🔴 but **honest**: `composeRuntime.ts:573-588` states it outright | 🔵 **STANDS by written decision**, and the refusal copy now says so to the user verbatim — *"(view-only — not undoable, not saved, not shared)"* |
| the founder's own category-9 utterance *"Raise all exterior walls to 3.2 m"* **is not a supported sentence** — `raise` is not a verb, `exterior` is not a scope, and there is no wall-height BATCH command | 🔴 | 🟠 `raise …` still MISSES; **but `make all walls 3.2m tall` and `make all walls on level 2 3.2m tall` now dispatch `wall.updateHeightBatch`** — the batch command exists (M5 = 16) |
| the six category-9 outcome transcripts (applied · partial · refused · dispatch-failed · indeterminate) | 🟡 fixed in the working tree | ✅ shipped, and **L-996 closed the table-row hole that let three verbs bypass the whole five-state union** |
| `room.setFinish` / `room.resize` **do not exist as bus verbs**; `room.create` writes a detached DTO store the renderer and `ProjectSerializer` do not read (an incompatible `RoomData` shape, no translation layer) | 🔴 | 🔵 **STANDS** — `P610` 6.1 → `activate-placement`; 6.4 / 6.4b refuse by naming the gap |
| **Category 10 CANNOT BE DEMONSTRATED — not "works", not "probably".** Leg (a) writes are wired for 25 verbs; **leg (b), reading the element map back, does not exist** (`YjsDocAdapter.ts` has zero `.observe`); the transport defaults OFF; and the adapter is constructed behind `requestIdleCallback`, so any command in the first ~1.5–4 s is never written to the Y.Doc at all | 🔴 | 🔵 **STANDS.** Per **C66 §1.1** all three capacity tiers are CLAIMED, none HELD, and **no tier may be described as supported**. `P610` 10.3 / 10.4 (*"who else is editing this project?"* / *"are there any sync conflicts?"*) both MISS |
| the 15 dead DTO verbs (`wall.setColor`, `wall.setDimensions`, `wall.setLayers`, `wall.bulkSetVisuals`, the `*.setMaterial` family) | 🟡 now **REFUSED**, not silently dead, and `CHAT_UNAVAILABLE` states the true reason | ✅ holds — `P610` §C prints those reasons verbatim |

> ⭐ **The single most transferable lesson in the cat-6-10 scorecard**, and it is the same one
> L-995 taught eight days later: *"Had I probed the DTO store, all fifteen would have shown a
> correct patch and returned a **FALSE PASS**."* And worse than inert — `wall.bulkSetVisuals` armed
> an **inverse keyed to the geometry store it never wrote**, so a later undo would have clobbered a
> value it did not own. **A dead write plus a live undo is worse than either alone.**

---

### §1.8 — THE PER-FAMILY CAPABILITY SURFACE: **AS-IS vs TO-BE** (added rev 5, lane RAC1, 2026-08-19)

> **This section exists because C67 is the CONTROL PLANE, and §0's one-sentence principle names
> exactly the failure it was measured to have:**
> *"The editor registers capabilities; language resolves against them."*
> ⛔ **A capability that the EDITOR can perform and does not REGISTER to the RAC is a control-plane
> defect, and this is where it is named.** It is not a chat bug and not a family bug — the registry
> is the declaration surface, and an undeclared live capability is the registry being wrong.

#### §1.8.0 — The finding, in one sentence

**`element.changeType`** (`apps/editor/src/engine/initBusHandlers.ts:1518`) is a **single, live,
registered bus verb with SIXTEEN family branches** — every one writing the geometry store the
builders, the plan projector and persistence read, every one with ring-buffer undo parity, the whole
set pinned executable by `elementChangeTypeCoverage.spec.ts:178-194`. **The RAC publishes FIVE
type-change capabilities and none of them use it.**

⭐ **So the gap is PUBLICATION, not implementation.** Eleven families have a live, panel-reachable,
undoable, persisting type-change the chat cannot reach — a **C84 EI-3 breach** on nine element
families plus two railing variants. **The remediation is registry wiring against proven executors,
which is a materially smaller and lower-risk job than "build eleven capabilities", and every
document about this work must carry that framing.** Full measurement: **C84 §4F**. Decisions:
**ADR-0334**. Rows: **L-1140 … L-1147**.

#### §1.8.1 — AS-IS: what the chat can do TODAY, per family (measured 2026-08-19)

| Family | Type change | Dimensions | Delete | Other published | Scope modes DECLARED | Scope modes actually HONOURED |
|---|---|---|---|---|---|---|
| **wall** | ✅ `set-wall-type` | ✅ `set-wall-dimensions`, `set-height`, `set-thickness` | ✅ | colour, rake, side-finish, add-layer, base-offset | `all` (none declared) | `all` · `selection` · **`level`** · **`room`** · **`orientation`** |
| **window** | ✅ `set-window-type` | ✅ `set-window-dimensions`, `set-width`, `set-sill-height` | ✅ `delete-windows-scoped` | parametric create | `all` · `selection` | + **`level`** · **`room`** · **`orientation`** |
| **door** | ✅ `set-door-type` | ✅ `set-door-dimensions`, `set-width`, `set-sill-height` | ✅ `delete-doors-scoped` | — | `all` · `selection` | + **`level`** · **`room`** · **`orientation`** |
| **slab** | ✅ `set-slab-type` | ✅ `set-thickness`, `set-base-offset` | ⛔ | — | `all` · `selection` | + **`level`** · **`room`** · **`orientation`** |
| **ceiling** | ✅ `set-ceiling-type` | ✅ `set-height` | ⛔ | — | `all` · `selection` | + **`level`** · **`room`** · **`orientation`** |
| **room/space** | n/a (occupancy) | ✅ `set-room-height-offset` | ⛔ | `rename-room`, `set-room-number`, `set-room-occupancy` | `selection` · `room` | as declared |
| **roof** | ⛔ **NONE** | ✅ `set-roof-pitch`, `set-overhang`, `set-thickness`, `set-base-offset` | ⛔ | — | `selection` | as declared |
| **stair** | ⛔ **NONE** | ✅ `set-riser-height`, `set-tread-depth`, `set-width` | ⛔ | — | `selection` | as declared |
| **column** | ⛔ **NONE** | ✅ `set-width`, `set-depth`, `set-base-offset` | ✅ `delete-columns-scoped` | — | `selection` | + `orientation` |
| **beam** | ⛔ **NONE** | ✅ `set-width`, `set-depth` | ⛔ | — | `selection` | as declared |
| **handrail** | ⛔ **NONE** | ✅ `set-baluster-spacing`, `set-baluster-width`, `set-base-offset` | ⛔ | — | `selection` | as declared |
| **curtain-wall** | ⛔ **NONE** | ✅ `set-mullion-size`, `set-panel-thickness`, `set-base-offset` | ⛔ | — | `selection` | as declared |
| **furniture** | ⛔ **NONE** | ✅ `set-width`, `set-length`, `set-base-offset` | ✅ `delete-furniture-scoped` | — | `selection` | + `orientation` |
| **floor** | ⛔ **NONE** | ⛔ | ⛔ | — | — | — |
| **lighting** | ⛔ **NONE** | ⛔ (excluded from `set-height`) | ⛔ | — | — | — |
| **plumbing** | ⛔ **NONE** | ⛔ | ⛔ | — | — | — |
| **stair-railing** | ⛔ **NONE** | ⛔ | ⛔ | — | — | — |
| **curtain-wall PANEL** | ⛔ **NONE** | ⛔ | ⛔ | — | — | — |

⚠ **The last two columns are a MEASURED DISAGREEMENT, not a presentation choice.**
`check-chat-capability-coverage.ts` (2026-08-19, **RC=3**) prints
*"FAIL — **26** spatial mode(s) the ARM honours without declaring, baseline 24"*. **"By level" and
"by room" already work for every catalogue family** — the shared grammar `makeHostedTypeParser`
(`ZeroTokenResolver.ts:3340`) captures `on level N` and `in the <room>` for free — **and the registry
does not say so.** Since the registry is what the *"what I CAN do"* answer is generated from, **the
system under-reports its own capability to the user**: EI-9 in the reporting direction, the exact
mirror of L-998. See **L-1142**.

#### §1.8.2 — TO-BE: the target surface, and the ONE condition that retires each gap

⛔ Per **ADR-0334 Decision 3**, a family that cannot be published carries **the single
machine-checkable condition that retires its deferral**. *A deferral without a retiring condition is
not a decision; it is a leak* — and §1.8.4 is what that costs.

| Family | Target capability | Catalogue | Executor | Retiring condition |
|---|---|---|---|---|
| **handrail** | `set-handrail-type` | ✅ 20 `{id,name}` (`HandrailTypeStore.ts`) | ✅ `element.changeType` `:1936` → `UpdateHandrailCommand` | HR2 lands `resolveHandrailTypeFields` in `geometry-handrail` (ADR-0334 D2) + RAC1 injects `ctx.catalogues.handrail` |
| **curtain-wall** (wall type) | `set-curtain-wall-type` | ✅ 20 (`CurtainWallTypeStore.ts`) | ✅ `:2022` → `UpdateCurtainWallCommand`; record carries `systemTypeId` | inject `ctx.catalogues['curtain-wall']` — **nothing else** |
| **floor** | `set-floor-type` | ✅ 22 (`FloorSystemTypeStore.ts`) | ✅ `:1600` → `UpdateFloorLayersCommand`; `systemTypeId` | decide the **floor vs slab noun disambiguation** (users say "floor" for both), then inject |
| **roof** | `set-roof-type` | ✅ 8 `{id,name}` (`ElementTypeCatalogRegistry.ts:115-124`) | ✅ `:1979` → `UpdateRoofCommand` | inject; the value is an enum member, so the refusal lists the 8 |
| **lighting** | `set-lighting-type` | ✅ 12 (`LightingTypeDefinitions.ts:54`) | ✅ `:1991`, **validates the id at `:2004`** | inject |
| **stair-railing** | `set-stair-railing-type` | ✅ reuses `handrailTypeStore` | ✅ `:1901`, **already resolves from `newTypeId` alone** | inject — ⭐ **the reference implementation for ADR-0334 D2** |
| **stair** | `set-stair-type` | ✅ 5 (`StairTypeDefinitions.ts`), `typeId` on the record | ✅ `:1850` | **`StairTypeStore` gains `getById()`** (it exposes `get()`; `resolveCatalogueRef.ts:39-42` requires `getById`) — **L-1147**, one method |
| **furniture** | `set-furniture-type` | ⛔ string union, **no display names** | ✅ `:1549` → `ChangeFurnitureTypeCommand` | **MINT an `{id,name}` catalogue** (C65) |
| **plumbing** | `set-plumbing-type` | ⛔ unions + variants, no names | ✅ `:1802` | **MINT an `{id,name}` catalogue** |
| **column** | `set-column-type` | ⛔ `profile` enum, no names | ✅ `:1858` | **MINT an `{id,name}` catalogue** |
| **beam** | `set-beam-type` | ⛔ `sectionType` enum, no names | ✅ `:1883` | **MINT an `{id,name}` catalogue** |
| **curtain-wall PANEL** | `set-panel-type` | ⛔ bare union | ⛔ **`ReplacePanelTypeCommand.ts:1` is `TODO(E.5.x): ORPHANED`** | **the executor must exist first** — lane CW2 |

⛔ **MUST NOT narrow the user's vocabulary to make any of these resolve.** Founder doctrine is
**free-form language + hard stoppers**: safety comes from rule gates that refuse **with both numbers**
— what was asked against what is available — never from a restricted grammar. A refusal for the four
catalogue-less families **must name what IS available for that family** and must not silently absorb
the sentence.

**Every published capability MUST declare its scope modes**, and the target for all of them is
`all` · `selection` · `level` · `room` — the founder's *"BY LEVEL, BY ROOM, ETC"*. The grammar
already honours them (§1.8.1); the declaration is the work.

#### §1.8.3 — TWO BINDING RULES ADDED TO §4 BY THIS SECTION (rules **14** and **15**)

> **Rule 14 — A CAPABILITY THE EDITOR CAN PERFORM AND THE REGISTRY DOES NOT DECLARE IS A C67 DEFECT.**
> Not a chat gap, not a family gap. §0's principle is *"the editor registers capabilities"*; an
> unregistered live capability means the registry is **wrong**, and it is repaired here. The measured
> instance is `element.changeType`: **sixteen live branches, five published.**

> **Rule 15 — A DEFERRAL MUST CARRY A RETIRING CONDITION, AND THE CONDITION MUST BE RE-CHECKED.**
> A `blockedBy` string is a claim about the present that decays. It **MUST** name a condition an
> automated check can evaluate, and **MUST** be re-validated rather than inherited. See §1.8.4.

#### §1.8.4 — ⛔ THE GATE HOLE THIS SECTION EXISTS TO CLOSE

`element.changeType` sits in Class B at `ChatCommandClassification.ts:98` under
`blockedBy: 'catalogue value-source injection'`. **Both halves of that blocker were already
satisfied**: the catalogues ship with `{id,name}` (handrail 20 — including, verbatim,
`name: 'Frameless Glass Balustrade'` at `HandrailTypeStore.ts:227` — curtain-wall 20, floor 22,
lighting 12, roof 8, stair 5), and the injection channel `ResolverContext.catalogues`
(`ZeroTokenResolver.ts:199`) exists with **no production writer** —
`ZeroTokenChatBridge.ts:922-954` is the **only** `ResolverContext` construction site in the repository
and never sets the key. **The blocker is ~6 lines.**

⭐ **And `ChatCommandClassification.ts:84-95` records the SAME MISTAKE, about `room.setOccupancy`,
THREE LINES ABOVE the offending entry**, ending:
> *"when a deferral names a dependency, check the dependency is real for THAT verb before inheriting
> the family's reason."*

**`element.changeType` is on line 98.** The lesson was written and not applied to the next entry of
the same array.

⛔ **NO GATE CAN SEE THIS.** `check-chat-capability-coverage.ts` prints
`explicitly deferred (CHAT_UNAVAILABLE): 52` and `B needs-design 131` and is **green on both** —
**a deferral is invisible to a coverage gate by construction.** The gate measures *declared*
coverage; a capability that declares itself absent is, to the gate, correctly absent.

**TO BUILD — `check-deferral-blockers.ts`**, a shrink-only ratchet: for every Class-B / `CHAT_UNAVAILABLE`
entry whose `blockedBy` names a catalogue, assert the catalogue does **not** already satisfy
`CatalogueReader`. **This is the durable fix; §1.8.2's table is its backlog.** Same family as
[[unsatisfiable-gate-decomposition-is-the-fix]].

#### §1.8.5 — NOT MEASURED (explicit — EI-1b: a blank reads as "fine")

- **Whether a chat-driven `element.changeType` holds V3/V4/V5 per family.** The panel's passing is
  **not transferable evidence**. Each family's C85–C99 §RAC section must carry its own **executed
  read-back** (C16 CA-21).
- **No utterance was typed into a live editor by this lane.** Every verdict in §1.8.1 is
  source-measured.
- **The other 181 deferrals.** Two `blockedBy` claims were re-validated out of **131 Class-B + 52
  `CHAT_UNAVAILABLE`**. **A gap, not a clearance.**
- **`set-slab-type` / `set-ceiling-type` fuzzy-match quality in a real project** — both run the
  raw-string fallback because `ctx.catalogues` has no writer (**L-1146**).
- **V6 SYNC** — inherited FAIL from §1.0, not re-derived.

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
6. **Honesty invariants** — refusal ≠ clarification ≠ miss; recognised-but-unsafe never reaches the LLM; **"Done" only after a command reports success** — ⚠ **rev 4: that is NECESSARY AND NOT SUFFICIENT.** L-995 reported success and changed nothing; see rule 12; partials reported as partial ("Changed N of M — K skipped: reason"), read off the command's own payload and never re-narrated; ambiguity refuses **naming both candidates**; a refusal quotes the project's real names, numbers and units; a granularity gap is refused **by naming the gap**, never widened.
7. **Claiming discipline** — a grammar may claim only sentences whose OPENER authorises it. Three guards are law, and all three came from real production defects recorded as **ISSUE-LOG L-823**:
   - **`descriptiveReportReason`** (`capabilities/CapabilityRefusal.ts`) — report-shaped and past-tense text can never command. §FIX-CHAT-REPORT-PASTEBACK: the founder pasted the assistant's own line back into the chat and the ladder **created a level from it, twice**, stacking two levels at 6.000 m.
   - **`Normalized.corrected`** (`intents/LocalNaturalLanguageResolver.ts`) — **typo correction may repair a word the user meant; it must never MANUFACTURE the imperative that authorises a mutation.** `add-level` now requires an **uncorrected** creation verb in opener position.
   - **`PROTECTED_FUNCTION_WORDS`** (`intents/ZeroTokenResolver.ts`) — §FIX-CHAT-STOPWORD-CORRECTION: bounded Levenshtein rewrote **with → width**, turning *"Created Aparment with 2 bedrooms"* into *"select an element first, then set its width"*. **A correctly spelled English function word is never a misspelled domain term** — while *aparment → apartment* is exactly what tier 1 exists to do.
   Guards apply **per clause** inside a compound plan. ⚠ **rev 4: the "29 misreads" this line used to name are down to 7** (§1.6), **but the rule's debt is NOT discharged** — §1.6 O-1 to O-4 are four live instances, three of them found after the 29 were drained, and C68 §6.3-G10 still records the general check as ❌ NOT ENFORCED.
8. **Truthful undo cost** — `runBatch` is undo-NEUTRAL (ADR-0314). N commands are N history entries, and the Confirm card says N before consent.
9. **Shrink-only gates** — every ratchet in this repo only goes down; a bump needs a **dated in-code justification naming what it counts**. A baseline is not permission; it is a debt with a name.
10. **No fictional capabilities** — the registry describes what the editor *does*, never what we wish it did. If the editor can't do it, the truthful entry is `CHAT_UNAVAILABLE` with a reason a user could read.
11. **Determinism before models** — the LLM is the LAST rung, and a sentence any deterministic rung claims never reaches it. That ordering is pinned by test, not by convention. A local semantic model, if ever added, sits behind the same interface, outputs the same IR, and never becomes a mutation path.
12. **A capability does not ship on V1+V2 alone — it must prove V3 (added rev 4).** *"Done"* may be
    printed only after **the store the renderer and persistence consult** has been read back and
    holds the new value. `success === true` is not evidence; a call count is not evidence; a plugin
    DTO store is not evidence. Concretely, a capability PR must carry **one executed read-back**
    against the **real** authoritative store — and where the write crosses a projection, whitelist
    or serializer, the test must exercise that hop rather than a hand-written stand-in.
    > ⚠ **ENFORCEMENT, STATED HONESTLY. There is a gate and it does not cover this.**
    > `tools/rac-conformance/certification/gates/check-authoritative-state.ts` is the right
    > instrument — it executes verbs against the composed headless world and diffs the authoritative
    > store, with a named shrink-only ledger and a positive/negative/widening control set. But it
    > covers **18 distinct verbs / 21 cases** of **325** registered commands; its job in CI is
    > `continue-on-error: true`; and **`wall.setSideFinishBatch` — the verb the founder's sentence
    > failed on — is not among them.** So rule 12 is **NOT ENFORCED for a new capability today.**
    > It is a review obligation and a roadmap item (§5), not a gate, and this bullet says so rather
    > than implying otherwise.
13. **A test fixture may not be MORE CAPABLE than the thing it stands in for (added rev 4).** A fake
    store that accepts every field, standing in for a real store that accepts twelve, asserts
    nothing and reads as coverage — which is worse than no test at all. Where the real object cannot
    be constructed in the harness, say **NOT MEASURED** and name the residual risk; do not build a
    permissive twin and call the result proof. ([[fake-more-capable-than-real]]; the instance is
    L-995 / `L960SideFinishDisclosure.test.ts:60`.)
    > **Corollary, and it is the cheaper half:** where a field crosses **N** hand-written lists
    > (store projection, restore projection, serializer, loader, command-option literal), **N is the
    > number of places the field can be dropped silently** — L-999 found four, plus a fifth in
    > `CreateWallCommand`. Prefer a derived list; where one is impossible, pin every copy to its
    > master by an **executed** comparison, as `WallProfileNonRegressionBaseline.test.ts` does.

14. **A capability the EDITOR can perform and the REGISTRY does not declare is a C67 DEFECT
    (added rev 5).** §0's principle is *"the editor registers capabilities; language resolves
    against them"* — so an undeclared live capability means **the registry is wrong**, and it is
    repaired here rather than filed as a chat bug or a family bug. **The measured instance:**
    `element.changeType` (`initBusHandlers.ts:1518`) has **sixteen live family branches**, each
    writing the geometry store the builders and persistence read, each with ring-parity undo — and
    the RAC publishes **five** type-change capabilities, **none of which use it**. Eleven families
    were dark for want of a table entry. **§1.8, C84 §4F, ADR-0334, L-1140.**

15. **A deferral MUST carry a RETIRING CONDITION, and the condition MUST be re-validated, never
    inherited (added rev 5).** A `blockedBy` string is a claim about the present, and claims decay.
    It **MUST** name a condition an automated check can evaluate, and a new entry **MUST NOT**
    inherit a family's stated reason without checking that reason is real *for that verb*.
    ⛔ **No gate can currently see a stale deferral** — `check-chat-capability-coverage.ts` is green
    on `deferred 52` and `B needs-design 131`, because **a deferral is invisible to a coverage gate
    by construction**. *(Measured cost: `element.changeType` sat behind a blocker whose catalogues
    had already shipped and whose injection channel already existed — while
    `ChatCommandClassification.ts:84-95`, **three lines above it**, recorded the identical mistake
    for `room.setOccupancy` and ended with the very lesson that was then not applied.)*
    **TO BUILD: `check-deferral-blockers.ts`** — §1.8.4.

16. ⭐ **THE PREPOSITION MUST NOT DECIDE THE SCOPE KIND — THE NOUN MUST. AND EVERY GRAMMAR MUST
    READ ITS PLACE PHRASE THROUGH THE ONE SHARED PARSER (added rev 6, L-1201).**

    **The rule.** A grammar **MUST NOT** derive `level` vs `room` from which preposition the user
    typed. English does not make that distinction — *"on level 2"* and *"in level 2"* are the same
    sentence, and *"in the kitchen"* and *"on the second floor"* are both natural. The kind is
    decided by the **NOUN**: a level noun (`level|floor|storey|story`), `HERE_RE`, or neither.
    A grammar **MUST** obtain that decision from **`packages/ai-host/src/intents/SpatialScopeTail.ts`**
    (`SPATIAL_TAIL_SRC` + `readSpatialTail` / `parseTrailingSpatialScope`) and **MUST NOT** write a
    place-phrase regex of its own. This is the same ruling `extractDimensionBindings` already
    embodies for units — *"so the natural and rigid paths cannot understand '2 meters height'
    differently"* — and the identical argument for spatial scope had simply never been made.

    **What the absence of this rule cost — MEASURED on the real ladder, 2026-08-19, before the fix.**
    The founder typed **"change all windows in level 2 to 1.5 meters wide"**:
    - it resolved to `scope: { kind: 'room', roomRef: 'level' }` — **a room called "level"** — because
      the `in` arm was hard-wired to ROOM and only the `on` arm could reach a level;
    - the room lookup is `RoomStore.findByName`, a **case-insensitive SUBSTRING match with no
      ambiguity guard on the name path** (the guard exists only on the NUMBER path). On a project
      whose rooms are auto-named `Room 00-001` that is a refusal with the wrong reason — safe by
      luck. On any project with a user-authored room name **containing** the substring "level", it
      is a **silent wrong-scope mass edit that reports success**, and every matching room
      contributes;
    - ⭐ and it was worse than a wrong scope. The place capture is LAZY, so the rest of the phrase
      **leaked into the value**: *"set all windows in level 2 width to 1.5m"* dispatched
      **`{ width: 2 }`**. **The user said 1.5 and the command carried 2**, on a `destructive: true`
      mass edit, with a Confirm card that stated the wrong number confidently.

    **Three consequences that are also binding:**
    - a place that was NAMED and cannot be resolved **MUST** make the grammar DECLINE. It **MUST
      NOT** fall back to `'all'` or to the selection — widening a scope the user deliberately
      restricted is the C68 §7.d failure, and on a delete it is unrecoverable;
    - a room genuinely named "Level"/"Floor" **MUST** stay addressable — the level noun with no
      level after it reads as a ROOM name — and where an explicit level noun WINS over a
      same-named room, the Confirm card **MUST** name the reading it took (*"all 12 windows on
      Level 2"*) so the user sees it before consenting;
    - the claim surface **MUST NOT** widen with the tail. Sentences with no scope word, and
      sentences carrying an unresolved qualifier (`exterior`), stay unclaimed exactly as before.

    **The defect class.** *"An enumerated list that must be REMEMBERED rather than DERIVED."* Three
    hand-written spellings of one scope tail across two files, in the same week a hand-written
    element-family event list froze the viewport (L-1189) and a hand-written pick-cache key list
    left column + beam dead (L-1194). ⛔ **No gate sees a fourth spelling being written.**
    **TO BUILD:** a check that no file outside `SpatialScopeTail.ts` contains a
    `(?:on|in)\s.*(?:levels?|floors?)` place-phrase literal.

    > ⭐ **THE FOURTH SPELLING WAS ALREADY ON DISK WHEN THIS RULE WAS WRITTEN — FOUND
    > 2026-08-20, lane RAC1, L-1372.** `ZeroTokenResolver.WALL_RAKE_SCOPE` carried it verbatim:
    >
    > ```
    > (?: on (?:the )?(?:levels?|floors?)?\s*([\w .-]+?)| in the ([\w .-]+?))?
    > ```
    >
    > — the same `on`→LEVEL / `in`→ROOM hard-wiring, in the SAME FILE as two of the three the rule
    > names, about forty lines below the colour grammar. **Measured before the fix:** *"make all
    > walls in level 3 raked 70 degrees"* did not reach the rake grammar at all (its `in` arm
    > requires the literal word "the"), fell through to `parseWallTypeIntent`, and was answered
    > *'There is no wall type called "in level 3 raked 70 degrees"'*. So the rule's own prediction
    > — *"fixing one leaves the next sentence broken in another"* — was live in production while
    > the rule was being written. It is now folded into `SPATIAL_TAIL_SRC`; **the TO-BUILD gate
    > above is still not built, and it is the only thing that would have caught this one.**
    >
    > ⚠ A **FIFTH** spelling is still on disk and is deliberately left: `WALL_COLOR_RE`'s tail
    > carries a `(?!colou?r )` lookahead that keeps *"in the colour white"* out of the place
    > capture, and folding it in without that guard turns *"make all walls in white"* into a place
    > phrase. It is named here rather than silently fixed — an unmeasured rewrite of a shipped
    > grammar is how the fourth one was written in the first place.

17. ⭐ **A GRAMMAR MUST DECLINE A NEAR-MISS THAT BELONGS TO ANOTHER CAPABILITY — AND A
    RECOGNISED-BUT-UNDERSPECIFIED ASK MUST REFUSE **BY NAME** RATHER THAN FALL THROUGH
    (added rev 6, L-1370 / L-1371).**

    **The rule, in two halves that must not be flattened.**

    a. **DECLINE.** A grammar whose value is FREE TEXT (a type name, a colour name, a finish name)
       **MUST NOT** claim a candidate built from another capability's vocabulary. The word set
       **MUST** be IMPORTED from the one definition —
       `DimensionFamilies.OTHER_CAPABILITY_WORD` — and **MUST NOT** be re-typed per grammar; the
       equivalence **MUST** be pinned by a test, never by a comment (C84 EI-8a).
    b. **REFUSE BY NAME.** Where the sentence is *recognised-but-underspecified* — the capability's
       own marker is present and one field is unreadable — the grammar **MUST** claim it and refuse
       **quoting what the user typed**, naming the correction. It **MUST NOT** fall through to a
       neighbouring grammar, **MUST NOT** auto-correct, and **MUST NOT** widen its own pattern to
       absorb the typo. (ADR-0313 HONESTY: this state must never reach an LLM.)

    **What the absence of this rule cost — FOUNDER-REPORTED, PRODUCTION, 2026-08-20.** He typed
    **`make all walls on level 3 raked 90 dregress`** (his typo for *degrees*) and was answered:

    > *"There is no wall type called **"on level 3 raked 90 dregres"** in this project. The wall
    > types here are: Monolithic (Default), Interior – Partition 100mm, … Try: "change all walls to
    > monolithic (default)""*

    A sentence carrying the word **"raked"** and a number, answered **confidently** as a catalogue
    lookup. **The asymmetry is the proof it was a gap and not a design:** `parseWallTypeIntent`
    already declined DIMENSION words (*"make all walls 3m tall" is a dimension ask, not a type
    ask*), and `DimensionFamilies` already declined RAKE words for the mirror-image reason — *"a
    near-miss must never resolve as a resize: rake/pitch carry numbers too."* **The dimension
    grammar protected itself from rake; the type grammar did not reciprocate.**

    **⭐ A GUARD ADDED TO ONE GRAMMAR IS THE ENUMERATED-LIST DEFECT AGAIN — so the sweep is part
    of the rule.** Measured on the real ladder, 2026-08-20 (probe executed, then deleted):

    | Grammar | Before | After | Verdict |
    |---|---|---|---|
    | `parseWallTypeIntent` | ⛔ claimed `typeRef:"on level 3 raked 90 dregress"` | declines | **FIXED** (derived guard) |
    | `makeHostedTypeParser` → window · door · slab · ceiling | ⛔ claimed — its rake list was a **hand-copy of five words** (`pitch\|angle\|angled\|raked\|tilted`) already missing `tilt`, `lean`, `leaning`, `slanted`, `vertical`, `upright`, `slope`, `degrees` | declines | **FIXED** (derived guard replaced the copy) |
    | `parseWallColorIntent` | ⛔ `paint all walls raked 90 dregress` → *"I don't know the colour “raked 90 dregress”"* | declines when the colour table also declines | **FIXED** (found by MEASUREMENT, not by reasoning about the first fix) |
    | `parseWallSideFinishIntent` | claims via the literal word `finish` | unchanged | **DEFENSIBLE** — the marker makes the ask unambiguous; the refusal is already on-topic |
    | `parseAddWallLayerIntent` | claims via `layer`/`coat` | unchanged | **DEFENSIBLE** — same reason |
    | dimension families | already declined | unchanged | the ORIGIN of the shared set |
    | delete families | not claimed | unchanged | — |

    **The exit state for the founder's sentence** is a refusal that names what it did not
    understand: *"I don't recognise the unit “dregress” — did you mean degrees? Nothing was
    changed."*

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
| **U11** | **the read-only / visibility capability class** — `hide-selection`, `isolate-selection`, `reveal-all`, `visibility-query`; the first capabilities to carry a read-only marker, and the fix that split `hide` from `show` instead of blanket-refusing both | ✅ `a48fa88d`, `fd27e513`, §FIX-CHAT-HIDE-IS-NOT-NAVIGATE — **selection-scoped only**; level- and room-scoped hide are **NOT-YET-TRUE** |
| **U12** | multi-select bridge parity (§1.6 rev-3 defect 4) | ✅ `cc796de4` — `selectionBus.currentIds` |
| **next-1** | 🔴 **the two live destructive misreads** — `remove the plasterboard layer from all walls` and `undo would remove the wall, right?` (**L-1081 / L-1082**), *and* their corpus rows, so check 4c executes them thereafter. Highest priority in this table | not started |
| **next-2** | 🔴 **gate 31 back to green** — the `undeclared spatial reach` ratchet is at **26/24** (**L-1080**). Declare the two `set-wall-side-finish` modes once the grammar produces them, or narrow the arm. **Never raise the baseline** | not started |
| **next-3** | **rule 12 needs a gate.** Extend `check-authoritative-state.ts` from 18 verbs toward *every verb a chat capability can dispatch* — starting with the batch verbs, since `wall.setSideFinishBatch` is exactly the shape that escaped. Then flip `bim20-certification` off `continue-on-error` | not started |
| **next-4** | **the §1.7.2 structural item — an ADR, not a patch.** Either `composeRuntime` constructs the authoritative geometry stores, or the plugin handlers stop writing detached DTO stores. Until one of those, **V3 is unprovable-by-construction for twelve element kinds** | not started |
| **next-5** | the §5.j general check: an **opener taxonomy** the resolver exposes, so *"no capability claims an utterance whose opener is a visibility or query verb"* becomes machine-checkable (C68 §6.3-G10, still ❌ NOT ENFORCED). Also closes **L-1083** (a negative dimension dispatched unbounded) and **L-1084** (an unknown property answered with a nonsense number) | not started |
| **next-6** | the `create-wall` route audit (§1.6 O-5), relative-displacement grammar (*no element kind has one*), `room.setFinish` / `room.resize` as bus verbs, and named/spatial references | not started |

**Definition of done for the contract**: a user can speak any request whose primitives the editor supports — single, scoped, filtered or composite — and receive either a correct execution **whose effect is proven in the authoritative store** with a truthfully stated undo cost, a clarification, or a refusal that names what *is* possible; and no capability can ship chat-invisible, because CI forbids it.

> ⚠ **Rev 4 amended that sentence.** Rev 3's version stopped at *"a correct execution"* — and
> **L-995 is a correct execution by rev 3's definition**: the utterance resolved, the command
> dispatched, the reply was polite, the undo cost was stated. Nothing changed. The clause **whose
> effect is proven in the authoritative store** is the whole of rule 12 compressed into the
> definition of done, and it is the difference between the two revisions.

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

### §6.2 What gate 31 does NOT prove, and what does (added rev 4)

**Gate 31 is a V1/V2 instrument.** It is the strongest one in the repository at what it does and it
does not reach V3 — check 3d classifies route liveness by the **directory the `commandProof` file
lives in**, which is a presumption about a path, not an observation of a store. The cat-1-5
scorecard found a `commandProof` whose own first line read *"ORPHANED — no longer called"* passing
that check; `probe-route-shadowing.ts` still lists **8 capabilities whose `commandProof` declares
itself ORPHANED**, and the honest reading of that is *the proof file is not the proof*.

| Claim | Instrument | Residency | CI status | Coverage |
|---|---|---|---|---|
| **V1 / V2** | `tools/ga-gate/check-chat-capability-coverage.ts` | GA gate 31, `run-all.ts` | **hard-fail** in `ci.yml` | all 56 capabilities · 🔴 **currently RC=3**, §1.2 |
| **V3** | `tools/rac-conformance/certification/gates/check-authoritative-state.ts` (4 arms: S1 intended-property diff · S2 no DTO-only effect · S3 one authoritative store per kind · S4 a refusal moves nothing and says why) | certification tree — it **must** run something, so it cannot be a static gate | **ADVISORY** — `bim20-certification` is `continue-on-error: true` | **18 verbs / 21 cases** of 325 |
| **V4** | `certification/__tests__/persistence.cert.ts`, graded by `certify.ts` against `cert-ratchet.json` | certification tree | ADVISORY | 18 rows, 0 FAILED, all *PARTIALLY VERIFIED* |
| **V5** | `certification/__tests__/undoredo.cert.ts` | certification tree | ADVISORY | 16 rows, 0 FAILED, all *PARTIALLY VERIFIED* |
| **V6** | `check-two-client-convergence.ts` exists; the **chat's** V6 is FAIL on all 39 cat-6-10 rows for one source-proven reason (§1.7.3) | certification tree | ADVISORY | ❌ not established for chat |
| **V7** | `ReportPayloadHonesty.spec.ts` (six payloads → six transcripts) + `batchReportEventsCompleteness.spec.ts` (derives the required `BATCH_REPORT_EVENTS` keys from the handlers themselves, and fails both on an omission **and** on a vacuous scan) | app test suites | per-package `test:ci` | the omission class is gated; refusal **quality** is review-only (C68 §6.3-G9) |

⛔ **Two honesty rules about this table, both learned the hard way:**

1. **`certify.ts` grades the ARTEFACT, not vitest's exit code, and that is deliberate** — *"a suite
   that seeds NOTHING is GREEN: every comparator honestly reports 'nothing to compare', every row
   reads UNPROVEN, the FAILED tally is 0. Maximally broken, maximally green."* Exit **2 =
   MISCONFIGURED** and exit **3 = RATCHET EXCEEDED** are never absorbable as debt.
2. **Never conclude from a gate's misconfigured exit, in either direction.** The root typecheck
   **OOMs at the default heap and exits 134 having checked nothing** — a "0 errors" from that run is
   not a pass. Run it as
   `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.json --noEmit`.

**Review questions for every capability PR:**

1. *Does the registry entry describe what the command provably does — nothing more, nothing less?*
2. *Which openers does this grammar accept — and is every one of them an imperative that authorises
   this mutation?* (C68 §5.j)
3. **(added rev 4)** *Which of V1–V7 does this PR's evidence establish, and against what — the real
   authoritative store, or a fixture more capable than it?* (§4.12, §4.13)
