# RAC Implementation Plan — phases, subphases, and what you can TEST when

**Status: living plan.** Created 2026-08-10. The execution companion to
`RAC-UNIVERSAL-CAPABILITY-ARCHITECTURE.md` (which owns the WHY and the design;
this doc owns sequencing, granular subphases, and per-phase acceptance sentences).
Evidence base: the three RAC inventories in `docs/04-reference/`.
**Update the Status column in the same commit as the work — a stale plan is a lie.**
**Onboarding a new capability is governed by [C68 — Element & Attribute Chat Onboarding](../../02-decisions/contracts/C68-ELEMENT-CHAT-ONBOARDING.md)** (the nine-item checklist + which GA-gate-31 check catches each omission, and §6.3's honest list of what no gate enforces); C68 expands [C67](../../02-decisions/contracts/C67-RAC-CAPABILITY-CONTROL-PLANE.md) §6.

Legend: ✅ shipped · 🔶 partial · ⬜ not started · 🧪 = "you can type this into AI
Chat and it must work" (the phase's founder-testable acceptance).

---

## Phase U0 — Liveness gate + maturity metrics ✅ (`56e0c5e3`)

| Sub | What | Status |
|---|---|---|
| U0.1 | Gate 31 check 3d: proof files classified by execution authority; plugin DTO stores presumed dead; dated allowlist | ✅ |
| U0.2 | DEAD_VERBS pin test (13 verbs) | ✅ (`8447911f`/`ba17c2b4`) |
| U0.3 | M-maturity report line in gate output | ✅ |
| U0.4 | Runtime liveness probe (dev-mode store-generation assertion after dispatch) | ⬜ later hardening |

🧪 Nothing new to type — this phase guarantees every FUTURE sentence is real.
CI now prints: `maturity: M2/M3 21 · M4 2 · M5 2 · M6 0 · M7 0`.

## Phase U1 — Liveness verdicts + dead-edit fixes ✅ (§FIX-DIMS-REACH-RECORD, L-815)

| Sub | What | Status |
|---|---|---|
| U1.1 | `wall.updateDimensions` production-liveness verdict | ✅ verdict: **DEAD** (detached plugin store; founder-approved fix) |
| U1.2 | Re-route wall height/thickness | ✅ same-verb bridge in initBusHandlers → `UpdateWallDimensionsCommand` vs geometry wallStore + ring-parity undo pair |
| U1.3 | Property-Inspector dead-edit verbs (window.setSize/setSillHeight, door.setWidth/setHeight/setSillHeight) | ✅ five bridges → `UpdateElementParameterCommand` (production-proven Inspector route); plugin handlers retired; ISSUE-LOG **L-815** |
| U1.4 | Sweep remaining chat-adjacent verbs | ✅ `PLUGIN_LIVE_ALLOWLIST` emptied — gate 3d now proves route liveness with zero exemptions; 13 dead verbs pinned in DEAD_VERBS |

🧪 After U1 (now TESTABLE): *"make this wall 3 m tall"*, *"make this wall 30 cm
thick"*, and the Inspector's window/door width & sill edits are **guaranteed**
real — geometry store, render, persistence, and one truthful undo step each.

## Founder capability asks (2026-08-10) — interleaved with U3

| # | Ask | Status |
|---|---|---|
| 1 | Wall rake by degrees ("make all walls angled by 120 degrees") | ✅ `set-wall-rake` — batch command (8dcaf00d) + grammar/NL/registry; scopes all·selection·level·room; per-wall `rakeAuthorability` refusals reported honestly |
| 2 | Add finish layer to a wall type | ✅ `add-wall-layer` — `wall.addLayerBatch` (one undo, instance-scoped via UpdateWallSystemTypeCommand, exterior-first array semantics, raked walls skip honestly); finishRef.ts = the ONE finish vocabulary |
| 3 | Parametric window creation (count / spacing) | ✅ `create-windows-parametric` — `window.parametricCreate` (one undo, CreateWallOpeningCommand children w/ occupancy gate, §WINDOW-CORNER-OVERFLOW capping, Confirm card, honest created/skipped report); scopes all·selection·level |
| 4 | Change window type by catalogue name | ✅ `set-window-type` — `window.updateSystemTypeBatch` batch (one undo, L-620-proven child, host-wall reveal nudge); scopes all·selection; catalogue-listed refusals |

## Phase U5a — Conversational level duplication ✅ (`9d7ffaeb`) *(pulled ahead — zero new execution code)*

| Sub | What | Status |
|---|---|---|
| U5a.1 | `duplicate-level` intent + all-or-nothing target resolution + honest not-cloned summary + Confirm card | ✅ |
| U5a.2 | NL/polite forms via shared parse (tier-0 + NL) | ✅ |
| U5a.3 | Post-duplicate offer: re-detect rooms + finishing chain (conversational follow-up) | ✅ `442d4d30` (U5c.3) |
| U5a.4 | "the next three floors" / auto-create missing target levels | ⬜ |

🧪 NOW (after current deploy): *"Duplicate level 0 to levels 1 and 2"* →
Confirm card that names what is NOT copied → one undo.
❌ Not yet: *"duplicate to the next three floors"* (targets must exist and be named).

## Phase U2 — Context wirings (the five) ✅ 5/5 → unlocks true spatial language

| Sub | What | Test unlock |
|---|---|---|
| U2.1 ✅ | θ-provider injected (initTools ← `runtime.siteModelStore.trueNorth`; explicit θ still wins, failures degrade to 0) + `getFacadesAllLevels` roll-up + zero-rooms footprint-centroid fallback (per level) + AIPanel literal-0 removed. Tests: spatial-index 20/20 (pure math) + editor spec (service/provider) | "south-facing" is TRUE south |
| U2.2 ✅ | Room predicates on RoomStore: `findByName` (exact-first, ci-substring) / `findByOccupancy` / `findByArea` (no-metric ≠ 0), level-filterable, clone-returning; room-topology 81/81 | "rooms named Bedroom", "rooms > 15 m²" |
| U2.3 ✅ | `getElementsInRoom` completed: windows (via host-wall membership, both `wallId`/`hostWallId`), columns/lighting/stairs (centroid containment); the lying doc comment fixed; `getBoundaryElements` reports real `curtain-wall` kind. Editor spec green. (Beams: no reliable centroid on record — deferred to U8 spatial service, noted honestly) | "the windows in the living room" |
| U2.4 ✅ | Headless `SiteQueryService` in @pryzm/stores (provider-injected; θ/lat-lng/parcel/buildableRing-wins/setbacks null≠0/maxHeightM null="no cap recorded"/point-in-footprint with unknown≠outside); wired in initTools + `window.siteQueryService`; 6/6 tests | envelope/height answers for U5b |
| U2.5 ✅ | `CapabilityScopeMode` (level/room/orientation) + optional `scopeModes` on capabilities (gate-validated: known modes only, must include default scope) + value sources `project-rooms`/`orientation`/`level-range` with probe shapes. Vocabulary only — first consumers land with U3; declaring a spatial mode before the resolver honours it would be the ElementCapabilities lie | gates U3 |

🧪 After U2: no new sentences yet (U3 consumes these), but `describeGraph`/room
queries become chat-answerable data.

## Phase U3 — ScopeDescriptor + ScopeResolver ✅ (all five arms live) → the big sentence unlock

| Sub | What | Status |
|---|---|---|
| U3.1 ✅ | `ScopeDescriptor` union + ScopeResolution/ScopeError contracts (selection/ids/all/level/room/orientation) | all forms consumed |
| U3.2 ✅ | Injected resolver: all/level/ids + room (boundingWallIds + roomQueryService) + ORIENTATION (θ-threaded facadesByOrientation, exterior-only, detect-rooms-first refusal) | ✅ |
| U3.3 ✅ | Phrases live: "on level N" · "in the kitchen" · "all south-facing (exterior) walls" across the colour + rake grammars | ✅ |
| U3.4 ✅ | ids-only store accessors — `WallStore.getAllIds()` / `getIdsByLevel()` off the Map keys and the secondary level index; the bridge prefers them and keeps the clone walk only as the fallback for stores without the twin. A scope needs identity, not state, and `getAll()` was deep-cloning the whole project to read one string per record | `f86935bc` (U8.2) |
| U3.5 | In-repo scope benchmarks in CI (level/type < 0.5 ms @5k; orientation < 2 ms @5k) — see the note under Phase U8 for why this belongs in the EDITOR suite, not ai-host | ⬜ |

🧪 After U3:
*"Make all doors on Level 2 900 mm wide"* ·
*"Make all walls on Level 2 white"* (scope × existing colour batch) ·
*"Delete all furniture in the kitchen"* (scope × delete, with count + confirm) ·
*"Make all south-facing exterior walls 3 m"* (needs U2.1).
Refusals name skipped kinds: "7 found, 2 are curtain walls — nothing changed there".

## Phase U4 — Spec-driven capability interpreter ✅ 2026-08-10 → scaling wall removed

| Sub | What |
|---|---|
| U4.1 | ✅ cea504cf — `CapabilityExecutionSpec` + the ONE generic arm (`applyExecutionSpec`, the switch's default); set-wall-type first table entry. |
| U4.2 | ✅ 1fc83042 · a14409e3 · 657f3aa5 · be4e550a — the batch-shaped family (set-wall-color, set-wall-rake, set-window-type, add-wall-layer) migrated one commit each, refusal copy byte-pinned by the 257-test suite; irregular arms (creation, level-query, rhino, selection-fan-out) documented as deliberately hand-written in the spec header. |
| U4.3 | ✅ set-door-type shipped purely via metadata (spec table entry + registry entry; zero new resolver case code) riding new `door.updateSystemTypeBatch` → L-620-proven `UpdateDoorSystemTypeCommand` children, ONE undo. Gate: 27 capabilities, undeclared 0/0. |

🧪 After U4: no new sentences — but the NEXT 50 capabilities cost metadata +
proofs + acceptance families only. Gate maturity counts become the roadmap dial.

## Phase U5b — GenerationRequest adapters (Dimension B core) ✅

| Sub | What | Test unlock |
|---|---|---|
| U5b.1 ✅ | `GenerationRequest` union + brief mappers (`houseRequestFromBrief`, `officeRequestFromBrief`, `apartmentRequestFromBrief`, `residentialGenerationFromBrief`) + the route-keyed `generationRequestFromBrief` dispatcher; `residentialRequestFromBrief` lifted to the pure `residentialBriefMapper.ts` (`c30fbc8f`, 10 tests) | — |
| U5b.2 ✅ | Two chat capabilities, two bus verbs, ZERO new pipelines (`671153df`). `generation.building` → the SAME controller entry points the onboarding modal calls (`ResidentialBuildingController.request{autoBuild}`, new `HouseLayoutController.buildDirect`, shipped `OfficeBuildingController.buildDirect`); `generation.apartment` → the shared `apartmentLayoutTrigger` the AI-panel leaf already uses. `autoBuild` suppresses the MODAL only — the executors' own `beginBuildingGeneration` lease still coalesces each build into ONE undo entry. `destructive:true` ⇒ Confirm card states typology + floors (or bedrooms/bathrooms + "fills the EXISTING shell") | 29 capabilities, undeclared 0/0 |
| U5b.3 ✅ | `maxHeightM` enforcement — `checkMaxHeightGate` (§GEN-MAXHEIGHT-GATE, `8bb9dac8`) on all three building paths incl. the new house `buildDirect`; U5b.2 CONSUMES it rather than redoing it | honest "that exceeds the permitted height", both numbers quoted |
| U5b.4 ✅ | Engine honesty relayed on `'pryzm-generation-report'` through the existing `BATCH_REPORT_EVENTS` mechanism — resi floors/apartments-per-floor/plate-fill + per-cell rejects with the packer's own reason, house scored-variant + room/stair counts, office as-built storeys/desks + auto-fit notes verbatim. Refusals carry `success:false` so they render "Nothing was changed — …" and can never read like a build | §RESI-ZERO-APARTMENTS-REFUSE and the height gate reach the transcript unedited |

**Founder P0 folded into U5b.2 (2026-08-10).** "Create 3 bedroom apparment"
(his spelling) returned *"I'm not sure how to help with that yet"* while the
apartment-layout engine had been shipping for months — the `c1902a5a` failure
the coverage gate exists to prevent, recurring. Fixed by the
`generate-apartment-layout` capability, whose noun matcher is deliberately
spelling-tolerant: **a capability that cannot be spelled at is a capability
that does not exist.** The two generation grammars are disjoint — any building
word ("building" / "block" / "tower" / a storey count) routes to
`generate-building`; everything else fills the walls already drawn.

🧪 After U5b — all founder-testable today:
*"generate a 3-storey residential building"* · *"generate a 2-storey house"* ·
*"generate an office building with 5 floors"* ·
*"create a residential building with 2-bed and 3-bed apartments"* ·
*"create a 3 bedroom apartment"* (fills the drawn shell) ·
*"make a 3-bedroom apartment with 2 bathrooms"*.

**Deferred, deliberately:** chat OPTION-CARDS in place of the modal. The
building arms need no picker (the Confirm card stands in for the preview and
the best-scored variant is built), and the apartment arm still opens the
shipped §11 layout picker — that modal IS the post-run report on that path.
Headless apartment auto-pick belongs with U5c's auto-chain.

## Phase U5c — Room-scale generation + chain ✅

| Sub | What | Test unlock |
|---|---|---|
| U5c.1 ✅ | `generate-room-finishes` → `generation.rooms` (`7c18a187`). Four engines that had shipped for months behind console entries only — D-CE ceilings, the room-type floor-finish pass, D-FLE furniture, D-LE lighting — driven from chat through the **same shared triggers** `pryzmCeilAllRooms` / `pryzmFloorAllRooms` / `pryzmFurnishAllRooms` / `pryzmFurnishAllFloors` / `pryzmLightAllRooms` call. Any combination of steps in ONE ask, ordered by the pipeline's own order | *"furnish all rooms"* · *"add ceilings to every room"* · *"add floor finishes to all rooms"* · *"light all rooms"* · *"furnish and light this floor"* · *"add ceilings to level 1"* · *"furnish every floor"* |
| U5c.2 ✅ | `finish-apartment-chain` → `generation.finish-chain` (`7c18a187`). ONE Confirm card naming the stages in order; the seam fires the FIRST link and then OBSERVES the shipped cascade (`apartment/ceiling/furnish.layout-executed`), because firing the later links itself would double-place. `withLayout` distinguishes "generate and finish" from "finish what's here" | *"finish this apartment"* · *"finish this floor"* · *"generate and finish an apartment"* |
| U5c.3 ✅ | Post-duplicate offer (`442d4d30`) — `ConversationContext.pendingOffer`, one turn, accepted by a bare *"yes"*; never an automatic mutation, and the accepted chain still shows its own Confirm card. **Closes U5a.3** | *"duplicate level 0 to level 2"* → *"yes"* |

**Granularity is a HARD STOPPER, not a language limit.** Every room-scale engine
reads *"every qualifying room on ONE level"* and has no per-room entry point, so
*"furnish the kitchen"* is RECOGNIZED and then refused with that reason — never
silently widened to the level, which would furnish rooms the user did not name.
Only furnishing has a shipped every-floor driver (`triggerFurnishAllFloors`), so
*"add ceilings to every floor"* refuses by naming that exact gap rather than
inventing a capability. An unknown level refuses by listing the real ones. The
Confirm card also states §FURNISH-ALWAYS-LIGHTS: the shipped cascade lights after
every furnish run, so a "furnish" ask really does place fixtures too — a surprise
is a small dishonesty.

**Honest partial outcomes.** Every transcript line is read off the engines' own
`*.layout-executed` payloads (`roomCount` / `roomsFurnished` / `roomsSkipped` /
`skipped[]` / `placedCount`), e.g. *"Ceilings 24/24 · Furniture 22/24 — 2 rooms
skipped: \<the engine's own reason\> · Lighting 24/24"*. A stage that reports
nothing within its budget is NAMED — the trigger modules' 12 s §CHAIN-TIMEOUT
fallback is reported, never hidden. Gate after U5c: **31 capabilities,
undeclared 0/0**.

**Deferred, deliberately:** per-room furnishing (needs a room-scoped entry point
on the D-FLE engine — an ENGINE change, not a chat change, so it is refused
honestly today rather than faked); an every-floor driver for ceilings / floor
finishes / lighting (same shape as `triggerFurnishAllFloors`, three more of it);
and headless apartment auto-pick, still on the §11 layout picker.

### Founder P0 folded into U5c (2026-08-10) — the chat acted on its own report

Two live repros, both fixed with hard stoppers rather than narrower language.

- **§FIX-CHAT-REPORT-PASTEBACK (`795cbec1`).** The founder pasted the assistant's
  own line — `Built 6 floors — 18 apartments, 3 per apartment floor on average
  (apartments 72% of the plate)` — back into the chat and the ladder CREATED A
  LEVEL from it, twice, stacking two levels at 6.000 m. Mechanism: the NL typo
  corrector rewrote *built → build*, the synonym table rewrote *floors → level*,
  and the add-level branch read the bare 6 as an elevation. Fixed by
  `descriptiveReportReason` (past-tense report openers + report shape), checked
  at the LADDER level in both `resolveUtterance` and `nonImperativeReason` —
  every intent reachable by "a bare number + a noun" had the same weakness — plus
  an add-level grammar that now requires an UNCORRECTED creation verb in opener
  position. Typo correction may repair a word the user meant; it must never
  MANUFACTURE the imperative that authorises a mutation.
- **§FIX-CHAT-LEVEL-ELEVATION-CLASH (`795cbec1`).** `add-level` now refuses an
  occupied elevation: *"Level 2 is already at 6 m — nothing was added, because
  two levels at the same elevation stack invisibly. Say "add a level at 9 m", or
  "duplicate level 2" to copy its floor plan."*
- **§FIX-CHAT-STOPWORD-CORRECTION (`05930960`).** `Created Aparment with 2
  bedrooms and 1 bathroom` → *"select an element first, then set its width"*.
  Bounded Levenshtein had rewritten the function word **with → width**. Fixed by
  `PROTECTED_FUNCTION_WORDS`, one list shared by both correctors: a correctly
  spelled English function word is never a misspelled domain term, while
  *aparment → apartment* is exactly what tier 1 exists to do. The sentence he
  MEANT now works end to end, bathrooms included.

## Phase U6 — Plan executor (compound sentences) ✅ SHIPPED 2026-08-11

| Sub | What | Status |
|---|---|---|
| U6.1 | `execute-plan` IR + the clause splitter (`intents/SemanticPlan.ts`) — every clause resolved by the EXISTING single-intent ladder | ✅ `1d9eb83e` |
| U6.2 | ONE Confirm card for the whole plan + one ordered dispatch pass, stop-on-failure with an honest partial report | ✅ `cba04ca7` |
| U6.3 | Truthful undo cost — the SUM of the steps, stated on the card before consent | ✅ `cba04ca7` |
| U6.4 | Capability registration (the first COMPOSITE), gate + acceptance + adversarial families | ✅ `b6863d70` |

**The IR is the thinnest thing that can be true.** `execute-plan` carries an
ordered list of ORDINARY `SemanticIntent`s plus the user's own clause text.
There is no plan grammar per capability, no second resolver and no second
dispatcher: each clause goes through tier 0 → tier 1 → NL exactly as it would
typed alone, and `applySemanticIntent` executes the plan as one more arm.

**What made it possible.** The tier-0 matchers each ended with
`applySemanticIntent(si, ctx)`, so the grammar was reachable only as "understand
and apply in one step". Matchers now return the intent and `runGrammar` applies,
once, for all of them — which is what the file's own header always claimed they
did. 307 existing tests passed unchanged, so the refactor is behaviour-neutral
by measurement.

**Three things a plan adds, and nothing else.**
1. **All-or-nothing validation.** Every step is applied before one command is
   handed back; one refusing step refuses the whole plan with the step number,
   the user's words and the capability's OWN reason.
2. **The ONE projection.** "Add a level at 9 m, then duplicate level 0 onto it"
   validates step 2 against the level step 1 will create — read off step 1's own
   produced `level.add` payload, never re-derived. `add-level` is the only
   intent that projects anything.
3. **Truthful undo cost (ADR-0314).** `runBatch` is undo-NEUTRAL, so N commands
   are N entries: a plan costs the SUM of its steps and says so on the card,
   *before* consent. The generation verbs are the declared exceptions, each with
   the reason in the code they call (a build lease coalesces to one; a chain's
   stages are the engines' own count, reported as "at least N").

**Guards apply PER CLAUSE** — a plan may never reach a grammar the same words
typed alone could not. `descriptiveReportReason` and `nonImperativeReason` run
on every clause, so the founder's paste-back defect wearing a compound sentence
("make all walls white, then Built 6 floors — 18 apartments…") refuses WHOLE,
even though the report opener is not in opener position of the utterance.

**"and" is NOT a splitter.** It is a noun conjunction here ("furnish the kitchen
and the living room"), so only explicitly temporal connectives split. And there
is deliberately NO "whole sentence wins" short-circuit: several capability
parsers are token-based and ignore trailing text, so "generate a 2-storey house
and then furnish all rooms" is claimed WHOLE by two different grammars, each of
which silently drops half of the ask. The whole-sentence reading is used only as
the tie-break when a clause does not resolve at all.

**No second waiting mechanism.** The `generation.*` handlers already await their
seam, which awaits the engines' own `*.layout-executed` events under the shipped
§CHAIN-TIMEOUT budgets and emits the report BEFORE resolving — so awaiting
`executeCommand` per step is already awaiting the run.

🧪 Testable today (real card copy, verbatim):

```
add a level at 9 m, then duplicate level 0 onto it, then furnish and light this floor
→ 3 steps, in this order:
  1. Add "Level 2" at elevation 9 m
  2. Duplicate Level 0's floor plan onto Level 2 (walls with their doors/windows,
     slabs, columns and furniture — rooms, ceilings, roofs, stairs, curtain walls
     and lighting are NOT copied; re-detect rooms afterwards)
  3. Run furniture and lighting on every qualifying room on Level 0
  Undo cost: 3 steps, 4 undo entries — Ctrl+Z four times.
  At least one step creates or replaces real geometry. Run the whole plan?
```

…plus `duplicate level 0 to level 1, then furnish it` ("it" = the level step 1
duplicates onto) · `generate a 2-storey house and then furnish all rooms` ·
`make all walls white then add ceilings to every room` · `create a 3 bedroom
apartment, then light all rooms`. Gate after U6: **32 capabilities, undeclared
0/0, M6 plans 1**.

**Deferred, deliberately:** a plan step may not be a LOCAL action (undo / redo /
switch level) — those act on the view, not the model, so they are refused inside
a plan rather than faked into the command list; plans are capped at 6 steps so
the Confirm card stays readable; and a generation step followed by a finishing
step is WARNED about rather than de-duplicated (the generators' shipped
auto-chain already finishes what they generate, so the later step runs a second
time over the same rooms — collapsing it is an engine change, not a chat change).

## Phase U7 — Property vocabulary + catalogue families ⬜

U7.1 top-20 panel fields (per-kind proven routes, bounds from L2 authorities,
gate-pinned vs PropertyDescriptorGenerator) · U7.2 `element.changeType` +
door/window types via `resolveCatalogueRef` · U7.3 enums (swing, accessibility,
fire ratings) · U7.4 marks, frame colours, room occupancy/fill.

🧪 *"Set the base offset to 150 mm"* · *"change these doors to fire doors"* ·
*"make this door accessible"* · *"set the mark to W-101"*.

## Phase U8 — Filter scopes + spatial service ✅ 3/4 (2026-08-11)

| Sub | What | Status |
|---|---|---|
| U8.1 ✅ | `FilterScopeDescriptor` — a base scope NARROWED by predicates, never replaced by them: `PropertyFilter` (area/width/height/thickness/length/sillHeight × `>` `<` `>=` `<=` `=` between, SI values + the unit the user SPOKE) and `TypeFilter` (a catalogue id resolved at parse time). Plus the grammar as a PRE-STRIPPER — filter clauses are lifted out and the capability grammar parses the remainder unchanged, so composition with level/room/orientation is automatic in either word order and cost no capability a single line. `IntentScope` widened every spec-driven capability at once | `5da99e10` |
| U8.2 ✅ | The editor-side resolution service: base scope first, then ONE record read per surviving id (never a `getAll()` project clone). Missing property ⇒ SKIP with the property named, never a silent 0; unreadable record ⇒ skip with its own reason; `filterStats` carries the extrema. **Closes U3.4** — `WallStore.getAllIds()` / `getIdsByLevel()` are the ids-only twins, and the bridge prefers them | `f86935bc` |
| U8.3 ✅ | Refusals + summaries that QUOTE the filter: *"No wall is thicker than 300 mm — the thickest is 250 mm (Interior – Partition). Nothing was changed."* · *"Paint all 2 walls on Level 2 thicker than 300 mm white"*. When nothing carried the property at all the copy says THAT ("3 windows have no recorded area") rather than inventing an extremum. 23 tests in `filter-scope.test.ts` | `⟨grammar wiring pending⟩` |
| U8.4 | 50k-element benchmarks (and U3.5's 5k scope budgets) | ⬜ |

🧪 *"make all walls thicker than 300 mm on level 2 white"* · *"paint all
south-facing walls longer than 4 m white"* · *"change all doors narrower than
900 mm on level 2 to fire door"* · *"change all interior – partition walls to
exterior – brick"* · *"all windows with a sill below 900 mm"*.

❌ Not yet: proximity (*"furniture near the entrance"*) and `adjacentTo`
traversal — those need a spatial-index service, not a predicate over a record.

> **U3.5 / U8.4 stay open, and the reason is not time.** The thing worth
> measuring — the indexed store walk and the per-id record read — lives
> editor-side in the bridge, and the ai-host suite is a Node environment with
> no stores in it. A benchmark there would time a synthetic stand-in and report
> a number about the wrong system ([[probe-can-be-wrong-three-ways]]). The
> honest home for it is the editor spec suite, against real stores.

## Phase U9 — Batch-creation parametrics + safe E-class ⬜

U9.1 parametric creation plans (columns every N m, windows on scoped walls)
with pure preview counts · U9.2 E-class (`create-on-all-*`) behind
count-preview; single-slab variant first.

🧪 *"Create a row of columns every 6 metres along this wall"* ·
*"add walls on this slab"* → "this will create 14 columns — proceed?".

## Phase U10 — LLM planner + the drain ✅ 3/3 (2026-08-11)

**The rule the phase exists to enforce.** The LLM may only ever produce the SAME
validated structures the deterministic layers produce — a `SemanticIntent`, or
the U6 `execute-plan` IR — handed to the EXISTING `applySemanticIntent`. It may
never dispatch a bus command, invent a verb, invent a parameter, bypass a
refusal or clear a Confirm flag. Founder doctrine, written down: open language
is the goal, and safety comes from the rule gates at the EXECUTION layer, never
from narrowing what the user may say.

| Sub | What | Status |
|---|---|---|
| U10.1 ✅ | `packages/ai-host/src/intents/LlmPlanner.ts` — the planner contract. (a) The prompt's tool surface is GENERATED from `allChatCapabilities()`; a hand-maintained prompt list is the c1902a5a defect wearing a different hat. (b) The FIELD SHAPES are generated from something stronger than a hand-written schema: each capability's registry `probe` UNION the intents the deterministic ladder itself produces for that capability's declared `examples`, widened by its DECLARED `scopeModes`. The planner's legal output space is by construction the shape space the grammar already produces. (c) Validation REJECTS — never coerces — an unknown intent id, a bus verb used as an id, an unknown parameter, a wrong value type, an undeclared scope and the composite plan id; value LEGALITY stays `applySemanticIntent`'s job. (d) Transport-agnostic: `complete()` + `isConfigured()` injected, so ai-host stays pure. 23 tests | `e1fea0a3` |
| U10.2 ✅ | The ladder: tier 0 → tier 1 → NL → **planner** → legacy. `apps/editor/src/ui/ai/LlmPlannerBridge.ts` validates, applies, and hands the result back to `ZeroTokenChatBridge`'s own executor (two new exported seams; no grammar, dispatch or refusal copy duplicated) — so a planned intent gets literally the Confirm card, refusals and undo cost a typed sentence gets. TOKEN COST is pinned: a grammar-claimed sentence never calls the relay and still replies *"resolved without AI tokens"*; a planned reply says the opposite in words. NO-RELAY is the production truth — the deploy carries neither `CF_WORKER_URL` nor `ANTHROPIC_API_KEY`, so the rung reuses the shipped `/api/health` `features.anthropic` probe, skips cleanly, makes no request, and the panel then names the missing piece instead of a bare *"I'm not sure"*. 10 specs | `9ded0d9a` |
| U10.3 ✅ | The drain, MEASURED before anything is deleted. `QueryEngineDrain.spec.ts` classifies all ~100 hand-written `COMMAND_TREE` phrasings through the live ladder and pins the result. Plus the half that could move today: the panel's new "Chat can…" hub is GENERATED from `allChatCapabilities()`, so a capability is discoverable on the commit that declares it | `e08530b8` |

**What the legacy `QueryEngine` / `aiService` path still uniquely serves (71
phrasings), and why each family has not moved:**

1. **Read-only questions** — *"how many elements are in the model"*, *"what
   levels exist"*, *"summarise the building model"*, *"list all rooms"*. No
   capability answers a QUESTION: the whole registry is built around commands
   that mutate and refuse honestly. Migrating these needs a read-only capability
   class (a query verb with no bus command, no Confirm, no undo cost), which is
   a design step, not a transcription.
2. **Visibility / selection** — hide / isolate / highlight / select by level,
   category, type and height. **P7** says visibility INTENT is a domain concept
   in `packages/visibility`, not UI state, so these belong to a visibility
   capability family that does not exist yet.
3. **Document surfaces** — views, sheets, schedules, IFC import/export,
   compliance audits, parameter CSV. These drive stores the chat registry does
   not cover at all (`CHAT_UNAVAILABLE`'s B/C classes).
4. **The wardrobe configurator** — the one genuinely bespoke flow, with its own
   multi-clause parser inside `QueryEngine`.

**Nothing was deleted on suspicion**, and only ONE pill (*"add ceilings to all
rooms"*) is provably shadowed-and-correct. That is the honest number.

> ⚠ **29 pills are MISREAD, and that is a defect list, not drain progress.**
> The ladder claims them and produces the wrong thing. Named individually in the
> spec so that fixing any one FAILS the test and forces the inventory to move.
> The worst: **_"highlight walls taller than 3m"_ and _"isolate doors higher
> than 2 meters"_ resolve to `set-height` and dispatch `wall.updateDimensions`
> on the SELECTED wall** — a read-only visibility question silently RESIZES
> geometry. Also *"create 10 levels at 3m"* → ONE level with the count read as
> an elevation; *"create floor plan view"* → `add-level`; *"make all slabs
> blue"* → `set-slab-type` with `typeRef: "blue"`. All live in
> `LocalNaturalLanguageResolver.ts` / the catalogue-family grammar, and are
> logged for the owning phase rather than patched from U10.

**Deferred, deliberately:** M8 solar-aware objectives (*"orient the living
spaces for the best south exposure"*) — the sun-sample / θ /
`accumulateRoomHeatGain` wiring is an ENGINE capability, and giving the planner
a vocabulary entry for it before the engine can be driven by one would be the
`ElementCapabilities` lie in a new place. The planner needs no change to gain
it: declare the capability and it appears in the generated prompt.

🧪 A free-form sentence the grammar cannot parse: *"give the whole place a fresh
coat of white"* → validated `set-wall-color {scope: all}` → the same
`wall.updateColorBatch`, one undo entry · *"somewhere for a family of four to
live, over two floors"* → `generate-building` → the same Confirm card · and the
adversarial half: a planner output naming `demolish-building` or the raw bus
verb `wall.updateColorBatch` is refused out loud — *"I understood it as …, but
that isn't something I can do — … Nothing was changed."* **Requires an AI
upstream; with none configured the rung is skipped and the panel says so.**

---

## What you can test TODAY (after the current deploy, SHA `b9ea47ae`)

- All 21 capabilities: dimensions (height/thickness/width/sill/riser/tread/
  room-offset/pitch), *"make all walls white"*, *"make all walls interior
  partition"*, delete/undo/redo/zoom, levels, room rename/number,
  **"Duplicate level 0 to levels 1 and 2"** (Confirm + honest not-cloned list).
- Multi-selection fan-outs with honest "(N steps)" undo summaries.

## Explicitly NOT ready yet (do not expect these to work)

Level/room/orientation/filter scopes (U3/U8) · any "create a building/house/
office" sentence (U5b — SHIPPED) · furnish/ceiling by sentence (U5c — SHIPPED) · compound plans
(U6 — SHIPPED) · property-panel breadth (U7) · parametric creation (U9) ·
free-phrasing LLM planning (U10 — SHIPPED, but INERT on this deploy: it needs
`CF_WORKER_URL` or `ANTHROPIC_API_KEY`, and with neither the rung is skipped and
the panel says so) · solar objectives (M8, deferred). Tread COUNT has no live
carrier at all (editor gap). `wall.updateDimensions` liveness is PENDING the auditor (U1).
