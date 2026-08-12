# BIM 3.0 Contract Review — PART E: the user reasoning loop

> **Stamp**: 2026-08-12 · **Branch**: `main` (HEAD `774a91e6`) · **Scope**: FINAL discovery pass of the
> founder-commissioned BIM 3.0 capability review. Sections owned here: **§0** the four-state
> discriminator (AUTHORED→REACHABLE→COMPOSABLE→CERTIFIED) applied to every assessed capability ·
> **§1** the 18-step reasoning loop · **§2** WHAT-IF/IMPACT as a capability (incl. the
> Impact ≠ Preview ruling) · **§3** preview/dry-run · **§4** the post-mutation consequence report ·
> **§5** causal explanation ≠ provenance · **§6** authored-state protection as a scenario ·
> **§7** regeneration-authority executable rows · **§8** AI as an invoker · **§9** the
> golden-operations 4-question matrix · **§10** scenarios D/E/G/H · **§11** the token census ·
> **§12** the founder's closing question, answered in 12-field blocks.
>
> **STR-06** (`docs/01-strategy/STR-06-bim30-reasoning-loop-directive.md`, filed mid-review) is
> cited throughout; this file measures the distance between HEAD and it rather than re-deriving
> its need. See §E-verdict-preview for the two measured facts about STR-06 itself (E-27/E-28).
>
> **DISCOVERY ONLY.** Nothing was implemented; no contract was edited; this file is this agent's only
> repo write. No `git stash` was run. Nothing here grades capability from source-reading as
> runtime-proven (C70 §0.1); the evidence class is stated on every claim.
>
> **The hypothesis under test** (not assumed): *"The current BIM 3.0 corpus defines how to prove that
> the model is truthful, deterministic and internally consistent, but it does not fully define how
> BIM 3.0 reasons about an intended change BEFORE and AFTER that change."*
>
> **Evidence vocabulary (binding, per C70 §0.1)**: EXECUTED · EXECUTED-CITED · BY-READ · UNPROVEN ·
> MISSING · PARTIAL · AMBIGUOUS. **Findings E-01…** use the founder's 10-class taxonomy:
> MISSING CAPABILITY · MISSING SPECIFICATION · MISSING EXPOSURE · MISSING WIRING ·
> MISSING STATE/RETENTION · MISSING REASONING · MISSING REPORTING · MISSING AUTHORITY/PROVENANCE ·
> MISSING CERTIFICATION · UNPROVEN.
>
> **Sibling reviews**: PART-A (A-01…A-46, contract-suite internal consistency), PART-B (B-01…B-33,
> C74/C75 semantics), PART-C (C-01…C-26, Story A + the ten chains + the cascade matrix), PART-D
> (in flight: unwired capability, queryability, regeneration authority 12-question tables, ownership,
> element census). Their findings are cited, never re-derived.

---

## §E-verdict-preview (for the coordinator's synthesis, not a verdict)

The hypothesis is **CONFIRMED, and it is confirmable from the corpus's own text**. The corpus is an
after-the-fact truth system: every one of its instruments — the Golden Chain, the 12 pillars, the
23 readiness gates, the certification plan — measures whether a change that **already happened** was
truthful, deterministic and consistent. The words *predict*, *preview*, *dry-run*, *confirm*,
*warn*, and *plan* (as a command mode) appear in **no invariant, no gate, no golden operation and no
Definition-of-Done condition of C70–C75 or the nine BIM30 documents** (§11, honest zeros). The
Golden Chain itself has no link between `intent` and `command` where a prediction or an
authorization could live (§1, E-01/E-02). This is not a wiring gap in the GAP-REGISTER's sense: the
register's own taxonomy (WIRING / RETENTION / EXPOSURE / …) has no class for it, because the
register indexes defects in machinery that exists or was declared — and the before-the-change half
of the reasoning loop was never declared.

**Mid-review event, changing this file's job**: the founder's reasoning-loop implementation
directive was FILED during this pass as `docs/01-strategy/STR-06-bim30-reasoning-loop-directive.md`
(stamp 2026-08-12). STR-06 canonicalises most of what this review would otherwise have had to argue
for cold — the single consequence contract, the plan→execute→report lifecycle with preview purity,
`planOpeningRefit` as the seed idiom, actor/origin vs proposal/approval, behavioural AI parity,
planHash-bound confirmation, explicit batch semantics, first-class UNDETERMINED, the derived
untouched set, the G-REASON-01..07 gate family, the wire/replace/remove disposition rule, and the
AUTHORED→REACHABLE→COMPOSABLE→CERTIFIED ladder. Findings below therefore cite STR-06 where they
align, and this file's product is the **measured distance** between HEAD and that directive.
Two distance facts about STR-06 itself, measured this session (EXECUTED grep):
- **its own binding-interpretation chain is unrooted at HEAD** — ADR-0322/0323/0324 and
  `BIM30-REASONING-LOOP-PLAN.md` do not exist (0 hits); STR-06's header says where they will bind,
  and until they land every one of its clauses is intent without interpretation → **E-27**;
- of the **five overlapping consequence systems** its §5–6 names, two — `ImpactEngine`,
  `CommandImpact` — have **zero hits in packages/plugins/apps at HEAD**. The convergence problem is
  three systems plus a type, not five; the directive's inventory should be corrected before a plan
  schedules the retirement of things that do not exist → **E-28**.

---

## §0 — The four-state discriminator, applied

Per STR-06's ladder (**AUTHORED → REACHABLE → COMPOSABLE → CERTIFIED**; a MISSING-WIRING finding is
A✓/R✗, a MISSING-CERTIFICATION finding is C✓/CERT✗), every capability this review assessed, with
values verified this session (evidence class per row; ✗* = the founder's example table predicted
this value and the measurement confirms it):

| Capability | AUTHORED | REACHABLE | COMPOSABLE | CERTIFIED | Evidence |
|---|---|---|---|---|---|
| `SpeculativeEngine.preview` (consequence core) | ✓ | **✗*** — its only trigger event has zero emitters (§3.2, E-17) | ✗ — not a bus verb; reads `window` globals, not the composed runtime | ✗ — refusal-semantics spec only; no purity or accuracy invariant | BY-READ |
| `ConsequencePreviewOverlay` (answer surface) | ✓ | ✗ (same dead event) | ✗ (runtime injected as nothing) | ✗ | BY-READ `initDataPlatform.ts:430` |
| `CascadeRunner` + 3 `plugins/cross` rules | ✓ (typed, cycle-handling, unit-tested) | **✗*** — "registered nowhere in production", stated verbatim in **eleven** handler headers (`MoveWall.ts:45`, `MoveDoor.ts:38`, `MoveWindow.ts:37`, `MoveSlab.ts:42`, `MoveColumn.ts:37`, `MoveStair`/`RotateStair.ts:34`, `MoveFurniture.ts:38`, `RotateFurniture.ts:41`, `MoveStructural.ts:37`, `MoveDimension.ts:40`, `TransformWall.ts:257`) | ✗ | ✗ — unit tests ≠ the STR-06 §6 promotion test, which does not exist | EXECUTED grep |
| `planOpeningRefit` (seed idiom, STR-06 §3) | ✓ | ✓ | ✓ — inside the canonical wall-mutation path | **CONTESTED** — C-17: EXECUTED-proved absent 08-11, recorded CLOSED 08-12; no gate at HEAD; re-measure before either claim | EXECUTED-CITED |
| `CommandResult.affectedElementIds` | ✓ | ✓ | ✓ | ✗ — content unspecified (E-03); STR-06 §1 now deprecates it toward the consequence contract | BY-READ |
| Six-section consequence report | **✗** — no type, no owner | — | — | — | §4, §11 |
| Consequence contract object (STR-06 §1) | **✗** — does not exist | — | — | — | EXECUTED grep (E-27 chain) |
| `CommandProposalFactory.createFromIntent` | ✓ | **✗/UNPROVEN** — zero production call sites found; referenced only by doc-comments in the two intent mappers and the barrel | ✗ | ✗ | EXECUTED grep this session |
| `AIApprovalRecord` (approval half of STR-06 §8) | ✓ | PARTIAL — legacy panels only; the live chat bridge never writes it (§8.2) | ✗ — localStorage, not model state | ✗ | BY-READ |
| Actor/origin envelope (STR-06 §7) | **✗** — unrepresentable; `audit.actorId` is a boot-time constant (§8.1) | — | — | — | BY-READ |
| IFC importer `dryRun` mode | ✓ | ✓ | ✓ within the import path only — no generalisation to the bus | ✗ | BY-READ |
| Graph query surface (UBG) | ✓ | ✗ — dev-hook only (GR-16, owned) | ✗ | ✗ | EXECUTED-CITED |
| Generation engines ×6 (as closed loop) | ✓ | ✓ manual-only | PARTIAL — emit through commands; **no trigger** (§7) | ✗ — no generated fixture ever round-tripped (E-21) | BY-READ |
| Cascade event log / causation state (§5) | **✗** | — | — | — | §5 |
| Provenance import mapping | ✗ | — | — | — | PV-02/C75 |
| Provenance export mapping | ✗* | — | — | — | PV-04 |

Reading: of sixteen rows, **six are A✓/R✗ orphans** (the wire/replace/remove disposition rule of
STR-06 has six immediate customers), **five are not yet authored at all**, and **zero rows reach
CERTIFIED**. The one capability that is A✓/R✓/C✓ (`planOpeningRefit`) is the one STR-06 names as
the seed — and its certification cell is the corpus's one open evidence dispute (C-17).

---

## §1 — The 18-step reasoning loop, run against "Move this wall 300 mm"

Method: each of the founder's questions asked against contracts + corpus + measured evidence.
Sibling evidence is cited by id. Steps that PART-C's §2 matrix (`wall.updateBaseline` row) and §17
already scored are cited, not re-scored; the delta here is the four steps that exist **nowhere in
the Golden Chain**: prediction, authorization, explanation-as-content, and the answer surfaces.

| # | Step | Founder's question | Answer | Evidence |
|---|---|---|---|---|
| 1 | **Intent** | does "move this wall 300 mm" resolve to a typed command? | **YES** — `wall.updateBaseline` / `MOVE_COMMAND_BY_TYPE`; NL path via RAC intent ladder | EXECUTED-CITED: PART-C §2 row 2, capability model §15 |
| 2 | **Preconditions** | is the move validated before execution? | **PARTIAL** — `canExecute` exists per C03/C16 and returns `CommandValidationResult {ok, reason?, blockingIssues?, warnings?}` (`packages/command-registry/src/types.ts:381–387`, BY-READ), but for a wall move the only spatial validation is length ≥ 0.1 m; nothing checks hosted openings, junctions, rooms (PART-C §3 "wall moved" row Q9) | BY-READ + EXECUTED-CITED |
| 3 | **Prediction** — "what WILL change if I do this?" | can the system state the consequence set before mutating? | **NO — the step exists nowhere.** Not a Golden Chain link, not a pillar invariant, not a gate, not a golden operation. The only machinery shaped for it (`SpeculativeEngine`) is dead code returning `[]` (§3). → **E-01** | EXECUTED-CITED (EV-04 §5b) + §11 zeros |
| 4 | **Authorization / confirmation** | is a consequential change confirmed with the user before commit? | **NO — not specified anywhere.** No contract distinguishes a destructive from a non-destructive command; no confirmation, warning, or approval concept exists in C70–C75 or the gates (§11: "confirmation", "destructive-operation warning" = absent from the corpus). The RAC modal (memory: relay→modal→runBatch) is a UI acknowledgement of a *proposal*, which C70 §1.2 itself rules out as evidence — and it previews the intent, not the consequences. → **E-02** | §11 census + BY-READ |
| 5 | **Mutation** | single command path, structured outcome? | **YES** (the corpus's strongest half) — with the MT-01 caveat that `wall.create` was readback-negative; `wall.updateBaseline` state link holds | EXECUTED-CITED: PART-C §2 |
| 6 | **Propagation** | do dependents update? | **PARTIAL** — openings translate (EXECUTED, EV-03 §1); joins rebuild; schedules stranded (PR-12), graph edges never rewritten (GR-12), redetect suppressed on generated levels (PR-05) | EXECUTED-CITED |
| 7 | **Validation after** | are constraints re-checked at the new position? | **NO for walls** — nothing but length; the §17 matrix has exactly two honest constraint-recheck cells in fourteen rows | EXECUTED-CITED: PART-C §17 |
| 8 | **Resulting state** | independent read-back? | **YES in the harness** — capture.ts before/after diff; but only inside certification, not as a product surface | EXECUTED-CITED: cert plan §2 |
| 9 | **Explanation** — "what did this change and why?" | **NO** — no post-mutation explanation object, no owner (C-04); `CommandResult` is `{success, affectedElementIds, info?, error?}` (`types.ts:403–408`, BY-READ) — `affectedElementIds` is the embryo of the answer and no contract specifies what it must contain, so a handler may fill it with the primary target only and remain compliant. → **E-03** | BY-READ + PART-C C-04 |
| 10 | **Provenance** | does the moved wall record who moved it and that it was moved? | **NO** — PV-02: no element carries origin at all; `project_command_log` retains commands server-side with no query surface (PART-C §1.3.2) | EXECUTED-CITED |
| 11 | **Undo/redo** | one gesture, exact restore? | **PARTIAL** — state restores, counters fixed (`8552de14`); graph-edge reversal on *edit* UNPROVEN (EV-03 §10.3, C-10); unified path uncertified (CE-04) | EXECUTED-CITED |
| 12 | **Persistence** | survives save/reload? | **YES for identity** (cert 0 CLEAN); PARTIAL for state (F-3/F-4/F-5 classes); wall `baseLine[*].y` staleness MT-07 | EXECUTED-CITED |
| 13 | **Regeneration** | do derived engines re-run where the move invalidated their output? | **NO** — the measured trigger answer for every generation engine is "nothing" (§7); rooms re-detect only where not suppressed | §7 below |
| 14 | **Export** | does the change survive export with identity and provenance? | **PARTIAL/UNPROVEN** — GUID key asserted at snapshot level only (C-25); provenance mapping absent (PV-04) | EXECUTED-CITED |
| 15 | **AI-boundary parity** | is the same move via chat identical in validation/refusal/undo? | **PARTIAL — same bus, but the system cannot TELL the difference** (see §8): no actor field anywhere in the command envelope, so "identical treatment" is true by *inability to discriminate*, not by tested invariant → **E-04** | BY-READ (§8) |
| 16 | "What is now invalid?" | | **MISSING** — C-21; violations are log lines (CO-10) | EXECUTED-CITED |
| 17 | "What did NOT change?" | can the system enumerate what it deliberately left untouched? | **MISSING as a concept** — no artefact in the corpus (contracts, gates, cert plan) requires stating the not-changed set; the certification oracle ("nothing else changed") computes it in-harness and discards it (§4) → **E-05** | §11 census |
| 18 | **Report** | is the outcome stated truthfully? | **PARTIAL** — Golden Chain link 11 requires the outcome be *stated truthfully* but never says what a statement must contain (§4); today: a toast | PART-C C-04/C-14 |

**Findings on the Chain itself:**

- **E-01 · MISSING CAPABILITY + MISSING SPECIFICATION — prediction is not a link in the Golden Chain.**
  The chain runs `intent → command → state → …`: the mutation is the second link. There is no
  place in the chain where "the system states the expected consequence set" could be scored, so
  the no-partial-credit rule (C70 §3.2) can never fail a capability for lacking prediction —
  the strictest scoring instrument in the corpus is structurally blind to the before-the-change
  half. This is a finding about C70 §3.1, not about any implementation.
- **E-02 · MISSING SPECIFICATION — authorization/confirmation exists nowhere.** No contract
  defines a destructive-operation class, a confirmation step, or the rule for when a command may
  proceed without one. Note the asymmetry: refusal (the model says no) is specified to the level
  of "both numbers" (G-INV-4); *consent* (the user says yes, knowing the consequences) is
  specified nowhere. A system that can refuse but cannot warn treats every non-refusable change
  as consequence-free.
- **E-03 · MISSING REPORTING — `CommandResult.affectedElementIds` is an unspecified answer surface.**
  The field exists on every command result (BY-READ `types.ts:405`) and no contract (C03 §
  dispatch-outcome, C16, C70 link 11) states what it must include (direct? cascaded? refused?),
  so it cannot be wrong — which means it cannot be right.
- **E-04, E-05** — see §8 and §4.

---

## §2 — WHAT-IF / IMPACT as a capability, not a graph verb

The corpus defines Impact once: *"Impact ('what changes if this wall moves?') → `graph.query` over
`dependsOn` + junction index (CONNECT-3/4)"* (BIM30-EVOLUTION-AUDIT §15 table, row 2 — BY-READ).
That is a **graph traversal**, and the founder's expected answer has eleven parts. Scored part by
part against everything the corpus specifies or the repo holds:

| # | Expected answer component | Specified anywhere? | Machinery | Verdict |
|---|---|---|---|---|
| 1 | directly affected elements | implied by `dependsOn` traversal | `dependsOn` is pull-only (UBG adapter, audit §2); `DependencyResolver` forward index live for spatial deps | PARTIAL (spec), MISSING (surface — no verb, GR-16) |
| 2 | indirectly affected (transitive) | no — no traversal depth semantics anywhere | `graph.path` named in D-INV-1 but path ≠ transitive-closure-of-impact | MISSING SPECIFICATION |
| 3 | topology edges that will change | no | GR-12: even *post-hoc* edge update on move is UNPROVEN for every family; predicting it has no substrate | MISSING CAPABILITY |
| 4 | rooms whose boundaries change | no | room re-detect is post-hoc, whole-level, suppressed on generated levels (PR-05) | MISSING CAPABILITY |
| 5 | metrics (areas, quantities) that change | no | `Room.area` is a persisted cache with no staleness marker (audit §17.3); schedules unsubscribed (PR-12) | MISSING CAPABILITY |
| 6 | hosted elements needing revalidation | post-hoc only — F-INV-3 / `planOpeningRefit` at commit time | the refit *plan* is computed inside the mutation, not offered before it (§3) | PARTIAL |
| 7 | openings becoming invalid | same as 6 | same | PARTIAL |
| 8 | dependents needing regeneration | no — no engine has a trigger at all (§7), so "needs regeneration" is not even representable | MISSING STATE/RETENTION |
| 9 | constraints becoming violated | no — violations are not queryable state (CO-10), so *future* violations are two steps beyond what exists | MISSING CAPABILITY |
| 10 | **elements deliberately left untouched** | **nowhere in the corpus** — the concept has zero hits (§11) | none | MISSING SPECIFICATION + MISSING REPORTING |
| 11 | **elements for which impact cannot be determined** | the *general* honesty rule exists (L-INV-1, C71 §4.4 refusal unions) but no impact-specific "undeterminable" enumeration is specified; the two authored impact paths return `[]` unconditionally — the exact violation | MISSING CAPABILITY (the honesty rule without the capability protects nothing) |

**E-06 · MISSING CAPABILITY — Impact is specified as a verb over one edge family; the founder's
Impact is a model-wide consequence computation.** Even with `graph.query`, `dependsOn` retained,
and the junction index landed (GR-04), components 3–5, 8–11 have no source of truth to query:
predicted topology changes, predicted metric changes, regeneration-need and predicted violations
are not *stored anywhere and not computable by any authored algorithm at HEAD*. The gap is not
"missing graph verb" (that is GR-16, already owned); it is that the eleven-part answer requires a
**consequence engine** that runs the same deterministic rules the mutation path runs, without
committing — i.e. §3's dry-run substrate. `[]` from `SpeculativeEngine.getAffectedByDeletion` is
the standing anti-target (EV-04 §5b), and note the corpus classes that under *query honesty*
(GR-14, INVARIANT); classing it there quietly reframes a missing capability as a typed-refusal
bugfix. Fixing the refusal makes the answer honest — "cannot determine, the impact engine does not
exist" — it does not make the answer exist.

**The Impact ≠ Preview ruling** (align with STR-06 §2's lifecycle, where PLAN/IMPACT is one stage
but preview purity is a separate prohibition): the corpus conflates two different questions under
"impact". *Impact as the golden operation* (audit §15) is a **read over the retained graph as it
is** — answerable by verbs the moment `dependsOn`/junctions are retained and exposed, and it may
legitimately return only what the graph knows. *Preview* is the consequence of a **hypothetical
command** — it requires executing the real consequence rules against non-live state (§3) and must
carry the untouched and undetermined sets. A `graph.query` implementation can close the first and
will silently masquerade as the second — the eleven-part answer is the discriminator. Any future
status document that marks "Impact" done on the strength of graph verbs alone commits the C70
§4.2 machinery-present-≠-capability-reachable error at the specification level. STR-06 §1
resolves the conflation going forward by making both consume ONE consequence object; until that
object exists (§0 table: not authored), the conflation is live.

Note also that STR-06 §6-bis's UNDETERMINED reasons (`NO_DEPENDENCY_INDEX | ENGINE_NOT_AVAILABLE |
UNSUPPORTED_ELEMENT_TYPE | STALE_DERIVED_STATE`) are exactly what components 8–11 above need as a
vocabulary — and **zero code at HEAD can emit any of the four values** (EXECUTED grep, §11 census:
the whole undetermined family is absent).

---

## §3 — Preview / dry-run

**The question**: can a command execute in a non-mutating mode — intent → validate → calculate
consequences → produce plan → NO model mutation — with `model-before == model-after` provable?

**Answer: NO, and no contract asks for it.** (Evidence below; §11 census: `dry-run` zero hits in
corpus and code; `preview` hits are exclusively rendering/thumbnail/marketing surfaces —
`PreviewStyle.ts`, plan thumbnails — never a command mode.) The command dispatch signature carries
no mode flag (BY-READ, `packages/command-registry/src/types.ts`; the bus `execute` path has no
options parameter shaped like `{dryRun}` — TOKEN-CENSUS-CONFIRMED). `canExecute` is the only
pre-commit computation, and it returns a boolean-with-reasons, not a consequence set.

**The founder's eleven preview fields** (predicted state delta · affected elements · topology
delta · metric delta · hosted revalidations · violations created/resolved · regeneration set ·
untouched set · undeterminable set · refusal set · the plan as an inspectable artefact): **zero of
eleven are specified by any contract**; fields 1–2 are computable today only by *executing the
command and undoing it*, which is not a preview (it fires every cascade, marks every dirty flag,
and PR-06-class suppression side-effects are not undone).

### §3.1 — What `planOpeningRefit` proves and does not prove

`planOpeningRefit` (geometry-wall; C73 §4.2, cert plan §2.4) is the corpus's only named
plan-producing function: given a shrinking wall, it computes per-opening
**relocate-or-refuse-with-both-numbers** before the wall commit applies it. Its SHAPE is exactly
the founder's preview shape at single-relationship grain: *inputs → deterministic consequence
calculation → typed plan {fits/refit/refuse + both numbers} → the caller decides*. **It does not
satisfy §3** — the corpus says so itself (an operation-specific plan for one host/hosted pair,
invoked inside the mutation path, not exposed, not a command mode). But it settles a question the
contracts leave open: **the consequence-plan idiom is already native to this codebase**. The
generalisation is a specification problem (which command families must produce which plan fields),
not an idiom-invention problem. → **E-07 · MISSING SPECIFICATION** (the plan object as a
first-class, contract-owned type) on top of **E-08 · MISSING CAPABILITY** (the general dry-run
execution mode).

### §3.2 — What `packages/speculative-engine` actually computes (BY-READ)

**Headline correction to the corpus and to PART-B/C's framing** (all BY-READ at HEAD, this
session's delegated deep-read): **the "dead read" claim is stale.** `getAffectedByDeletion` /
`getSemanticRelationships` no longer exist — commit `60c6acf9` replaced them with a single typed-
refusal read, pinned by `packages/speculative-engine/__tests__/semanticReadRefusal.spec.ts:103–114`.
Under the fixed read there is a **real consequence-prediction core**:

- `speculativeEngine.preview(action)` (`packages/speculative-engine/src/SpeculativeEngine.ts:256–354`)
  is a genuine 6-stage differential simulator: snapshot stores → apply the action to the clones →
  run `constraintEngine.validateAll` on before and after → set-difference violations by
  `ruleId:elementId` (`:323–327`) → project severed relationships to affected far-end ids
  (`:237–249`). Output `ConsequencePreview` (`:81–99`): `newViolations` / `resolvedViolations` /
  `severedRelationships` / `affectedElements` / `semanticReadRefusals` / `computeTimeMs`.
  **That is fields 2, 6 (partially) and 9 of the founder's eleven preview fields, already
  computed** — predicted violations created AND resolved is precisely the hard part.
- **But it is unreachable by any user gesture.** The one production consumer,
  `apps/editor/src/ui/canvas/ConsequencePreviewOverlay.ts:126`, listens for
  `pryzm-consequence-preview` (`:166`) — and the only emitters of that event
  (`triggerConsequencePreview` `:202`, `wireToolForConsequencePreview` `:221`) are **called by
  nothing anywhere in the estate**; the event exists otherwise only as a type in
  `runtime-composer/src/types.ts:1639–1647`. Additionally the overlay's injected `runtime` is
  passed as nothing (`initDataPlatform.ts:430`) and it subscribes on `window.runtime?.events`
  instead — the null-at-mount race, again. The signature authored-but-unwired hazard, one layer
  deeper than PART-B/C recorded: the *read* was fixed; the *invocation* was never wired. → **E-17 ·
  MISSING WIRING + MISSING EXPOSURE.**
- **Structural limits as a dry-run substrate** (what it would take): (a) it snapshots only 3 of 6
  inputs — `windowStore`, `stairStore`, `bimManager` are passed **live and identical** into both
  before- and after-contexts (`:297–309`), so those delta axes are structurally always zero;
  (b) the clone is shallow (`{...item}`, `:108–111`) — nested `baseLine`/`openings`/`computed` are
  shared with live records, so read-only-ness rests on the constraint engine's discipline, not on
  isolation, and **model-before == model-after is currently asserted by nothing**; (c) the four
  `applyActionTo*` transforms (`:117–149`) are **hand-written re-implementations** of
  delete/resize, not the real commands' `execute()` — any drift between `UpdateWall*Command` and
  these forks is silent, which is exactly the E-INV-2 one-canonical-implementation defect applied
  to simulation; (d) it produces a consequence *report*, not an applicable *plan* — no patches, no
  apply/discard handle.
- **The repo already holds the other two pieces of the dry-run triad, unconnected:**
  1. `CommandProposalFactory.createFromIntent` (`packages/command-registry/src/CommandProposalFactory.ts:17–46`)
     already does intent → Command → `canExecute` → **unexecuted proposal**, held in
     `CommandProposalStore` — intent→validate→plan→no-mutation, minus consequences. (Two divergent
     `CommandProposal` interfaces exist — `types.ts:393–401` vs the factory's own — a rival-list
     hazard in the very type a preview contract would standardise.)
  2. The **IFC importer's `dryRun` mode is the one mature same-path dry-run in the repo**:
     `IfcConversionMode = 'dry-run' | 'convert'` threads through ~15 converters, each following
     *mint the id, `if (dryRun) return id;` before any store write* (`IfcConversionCoordinator.ts:35,83,126–189`;
     e.g. `IfcWallToNativeConverter.ts:16`). Structurally the opposite of SpeculativeEngine — it
     gates the writes on the real path instead of forking the logic — and the better pattern to
     generalise to the command bus, whose `dispatch` today accepts no dry-run option
     (`CommandBus.ts:305`; `canExecute` gate at `:363–367`).

**E-18 · MISSING CAPABILITY (with three-quarters of the parts on the shelf).** The dry-run
substrate is: `CommandProposal` envelope + IFC-style write-gating on the real handler path +
`speculativeEngine`'s violation diff + `planOpeningRefit`'s refusal-with-both-numbers plan grain.
All four exist; no C70–C75 contract names the composite; nothing connects them. This is the
strongest confirmation of the founder's hypothesis in code form: the repository *already computes*
pieces of before-the-change reasoning and throws every one of them away or leaves it uncallable.
**Now specified**: STR-06 §2–§4 canonicalise exactly this composite (PLAN must not mutate; EXECUTE
consumes the plan; preview is NEVER execute+undo — §4's purity invariant is deliberately stronger
than `afterModel == beforeModel`, which disposes of the §3.2 limit (b) shortcut). Measured
distance to STR-06 §4's invariant: no purity assertion of any strength exists (the shallow-clone
sharing at `:108–111` means even the weak form is unprovable today), and G-REASON-01 (preview
purity) and G-REASON-02 (plan determinism) exist as names in a directive, not as files.

**Plan-fidelity divergence is a named certification-failure class** (STR-06 §2: *"preview says
openings A/B/C will move; execution moves A/B/D"* — G-REASON-03 execution-plan agreement). Note
what this makes structurally impossible to certify at HEAD: the four `applyActionTo*` forks
(§3.2 limit (c)) are a **second implementation of the mutation semantics**, so plan-vs-actual
divergence is not a risk but a standing expectation; G-REASON-03 cannot be green over a forked
simulator, only over STR-06 §2's execute-consumes-the-plan design. The fork is therefore not
tech-debt to clean later — it is the specific thing G-REASON-03 exists to forbid → the WIRE
disposition for `SpeculativeEngine` (§0 table) cannot be "wire it as-is".

---

## §4 — The post-mutation consequence report

The founder's six-section report: **Changed / Not changed / Regenerated / Refused / Provenance /
Validation**. Scored per section against what any artefact specifies:

| Section | Closest existing thing | Gap |
|---|---|---|
| Changed | `CommandResult.affectedElementIds` (unspecified, E-03); certification's before/after diff (harness-only) | no content requirement anywhere |
| **Not changed** | the certification oracle "exactly the predicted dependents changed **and nothing else**" (C70 §6.1, cert plan §2.1 modify row: "extra paths are findings") | computed in the harness, per fixture, then discarded; **no production artefact ever states the untouched set** → E-05 |
| Regenerated | REGENERATED provenance value (C75 §1.1) — zero writers (C-13); B-16: three unreconciled data models for it | unimplementable until PV-02; unreportable even then — no report owner |
| Refused | the strongest half: G-INV-4 both-numbers, REFUSES-CORRECTLY verdict class | per-command only; a *cascade* that partially refuses (refit 3 openings, refuse 1) has no partial-outcome report shape — "partial success" is absent from the corpus (§11) |
| Provenance | PV-02 zero fields | blocked |
| Validation | C-21: no validate-now verb, violations not queryable | blocked |

**The certification oracle does NOT satisfy the report** — it lives in
`tools/rac-conformance/certification/`, runs against the seeded fixture (C70 §7.3(d)), and its
"nothing else changed" computation is never surfaced to any user-facing path. A report that exists
only inside the instrument that grades the product is evidence, not capability.

**Is Golden Chain link 11 sufficient?** **No — E-09 · MISSING SPECIFICATION.** Link 11 ("report:
the outcome — success, refusal, or conflict — is stated truthfully; failure ≠ empty") is a
*truthfulness* requirement with no *content* requirement. A toast reading "wall moved" is
truthful, states the outcome, and conflates nothing — it passes link 11 while carrying none of the
six sections. PART-C already flagged the explanation half as untestable-as-written (C-04,
AMBIGUOUS); the delta here is that link 11 needs a **minimum content schema** (at least: changed
ids, refused ids with reasons, regenerated ids, and an explicit undeterminable set), and that
schema needs an owner. **Which contract should own it**: C70 owns the chain but §8.b forbids
restating; the natural owner is **C03/C16 (the dispatch outcome is structured)** for the
`CommandResult` shape, with C70 link 11 gaining one sentence pointing at it — mirroring how C70
delegates topology to C71. Today C03/C16 specify that the outcome is structured, not what the
structure must say.

**STR-06 reconciliation**: the directive now supplies the content requirement this section argued
for — §1 (one consequence object, retiring `affectedElementIds` with a migration path), §2 (REPORT
compares actual against plan), §15 ("untouched" is **derived** as `scope − changed − excluded −
undetermined`, never a persisted array — which answers E-05's implementation question and forbids
the naive fix), and G-REASON-06 (consequence-report completeness per declared contract). Measured
distance: the consequence object, the excluded/undetermined sets, the plan-comparison, and
G-REASON-06 all have zero hits at HEAD; and STR-06 assigns the report's *contract* to nobody yet —
the C03/C16-ownership question above survives the directive and should go to ADR-0322..24 when
they land (E-27).

---

## §5 — Causal explanation ≠ provenance

Three distinct questions, three distinct verdicts:

1. **"Who created this and how?"** — provenance. SPECIFIED (C75, complete vocabulary), not
   implemented (PV-02), certification specified-not-built (PV-07). Owned. Nothing to add beyond
   citing B-17/B-30.
2. **"Why did this element change?"** — causation on the element itself. NOT SPECIFIED. C75 §2.7's
   REGENERATED-carries-prior is the only causal fragment in the suite, and it records *that* a
   pass overwrote, not *what triggered the pass* (B-27: the trigger is narrower than the
   vocabulary).
3. **"What caused this OTHER element to change when I moved the wall?"** — consequence attribution
   across a cascade. NOT SPECIFIED, and — the precise point — **not answerable from any state the
   system retains even in principle.**

**The chain walked** (wall → junction → room-boundary → area → hosted-revalidation), asking at
each hop: what state would the answer "because you moved wall W" require?

| Hop | What happens today | What causation would require | Retained? |
|---|---|---|---|
| wall moved → junction | joins rebuilt via `WallRebuildCoordinator` + prevState diff | the rebuild event recording {cause: command-id, trigger: wall W} | **NO** — prevState is consumed for classification and dropped; no cascade event log exists |
| junction → room boundary | `RoomTopologyObserver` full-level redetect | the redetect recording which store event triggered it | **NO** — and the room is potentially a *new identity* (GR-13), destroying even the subject of the question |
| room boundary → area | area recomputed into a persisted cache | cache entry carrying {computedBecause} | **NO** — the cache has no staleness marker, let alone a cause (audit §17.3) |
| area → hosted revalidation | does not happen (nothing subscribes) | the non-event being recorded as "not re-validated because no subscriber" | **NO** — a cascade that dies has no tombstone |

**Classification, precisely, because the fix differs per class:**

- **E-10 · MISSING STATE/RETENTION — there is no cascade event log.** Every hop above *transiently
  possesses* its cause (the subscriber knows which event woke it) and discards it. This is the
  GAP-REGISTER's RETENTION class applied to causation: the value is computed and thrown away. The
  minimal state is an append-only per-mutation record: {commandId → [derived effects with cause
  links]} — note `CommandResult.affectedElementIds` is where such a record would surface (E-03)
  and `project_command_log` is where it could persist (unexposed, PART-C C-04).
- **E-11 · MISSING REASONING — transitive cause assembly.** Even with E-10's log, "what caused X"
  across hops requires walking cause links backwards and compressing them into an answer
  ("X's area changed because its boundary was re-detected because wall W moved"). No algorithm is
  specified or authored. Distinct fix: an algorithm over the log, not more retention.
- **E-12 · MISSING REPORTING — no surface.** Even with log + algorithm, no verb, no chat
  capability, no contract names "why did this change" as an answerable question. (C70 §6.2's
  "explanation" golden op is refusal-explanation only — C-04.)

Three findings, three different fixes, currently indistinguishable in the corpus because the
corpus has no vocabulary for any of them (§11: "why-did-this-change", "what-caused-this",
"causal graph" — zero hits). STR-06 §14 now draws exactly this review's line — *impact answers
what happened because of this command; provenance answers why does this element exist* — as two
separate implementations over one lifecycle, and its §15 `ElementOrigin` must land **before**
regeneration work. What STR-06 does **not** yet cover is E-10/E-11's subject: the per-hop cascade
cause log and the transitive assembly are in neither the consequence contract's fields (§1 lists
per-command sets, not cause *links* between derived effects) nor the NOT-yet list (§18). The
coordinator should flag causation-attribution as unowned even under the new directive.

---

## §6 — Authored-state protection as a SCENARIO

The founder's setup: six elements — an authored wall, a generated wall, an authored opening, a
generated opening, an inferred room, an AI-proposed element — then **"regenerate the affected
area"**, then seven verifications (authored wall byte-intact · authored opening byte-intact ·
generated wall updated · generated opening revalidated · inferred room re-derived with provenance
preserved-or-updated · AI element still marked INFERRED · a report stating which of the six were
touched and why).

**Does ANY document specify this as an executable scenario with an oracle? NO.**

- C75 gives the complete **vocabulary** (AUTHORED/…/REGENERATED, §2.7 regeneration-carries-prior)
  and three gates — all static shape-checks; C75 §6.3(d) itself says the §2.7 prior-value chain
  is **not verifiable statically**.
- The certification plan's canonical world (§1.2) seeds a building but its operations list (§2)
  contains **no regenerate-over-mixed-provenance operation**; the closest is `regenerate`
  (rebuild-from-authoritative ≡ snapshot), which tests *equivalence*, not *protection*.
- `check-derived-not-authored` (READINESS-GATES §3.18-adjacent table; C75 §6) asserts "no
  overwrite of AUTHORED lands without REGENERATED plus the prior value" — as a **source scan**,
  which §6.3(d) concedes cannot see it.
- The known prerequisite gaps are owned: PV-02 (no fields — B-17's lifecycle walk), B-19 (Level 8
  awardable with export mapping absent), C-13/C-22 (no operation-level rewrite policy). Cited,
  not re-derived.

**E-13 · MISSING CERTIFICATION — the authored-protection scenario has no executable form, and none
is *planned*.** This is on top of the provenance gaps: even in the future state where PV-02 is
closed, every C75 gate green, and C-22's rewrite policy written, **no artefact in the corpus would
run the six-element scenario** — the certification plan's operation list would still not contain
it. The oracle is easy to state (byte-diff the two authored elements; provenance-diff the other
four; assert the report names all six) and hard only because three of its seven assertions have no
substrate today. It should be named now, RED, per the roadmap's own §0.1 rule (a gate lands before
its implementation, and lands RED) — the roadmap applies that rule to every gate *except* any gate
of this scenario, because the scenario is nowhere in the roadmap (BY-READ, roadmap §1 phases 0R–9:
provenance phase 8 lands fields and the three static gates only). STR-06 strengthens the ordering
argument — §15: `ElementOrigin` **must exist before regeneration is implemented**, because
"regeneration is an authority question" — but the directive's own gate family (G-REASON-01..07)
contains **no authored-protection gate either**; the six-element scenario remains unowned under
both the corpus and the directive. E-13 stands unreduced.

---

## §7 — Regeneration authority: the four EXECUTABLE-TEST rows + the trigger question

PART-D owns the 12-question authority table. The delta here: per engine, the four executable
questions and the trigger question, each answered from measured evidence.

All BY-READ at HEAD (delegated deep-read, this session), test citations are to existing test
files, not runs performed here.

| Engine | Runs twice deterministically? (test) | After save/reload? | Preserves provenance? | One undo unit? | **Trigger: what EVENT re-runs it?** |
|---|---|---|---|---|---|
| **D-TGL** apartment layout | **YES** — `ai-host/__tests__/tglRunDeterministicLayout.test.ts:85` (two runs JSON-identical) | **NO test exists** | rooms only: `boundary.detectionMethod:'ai-generated'` (`roomFromGraphSpec.ts:81`); walls/doors/windows carry nothing | **NO — 2–3 units** (`ApartmentLayoutExecutor.ts:178`, `:378`, naming `:473`); apartment path never opens `beginBuildingGeneration` (P2-1 debt, `GENERATIVE-PIPELINE-AUDIT-2026-08-10.md:241`) | **NOTHING (manual only)** — no store subscriber, no cascade listener |
| **D-FLE** furnish | component-level YES (`furnishSolver.test.ts:119`, `furnishEmit.test.ts:75`); no whole-executor twice-run | **NO** | **NO** — plain `furniture.create` payloads, no origin field | **YES** — one `runBatch` (`FurnishLayoutExecutor.ts:499`) | **generation-chain only**: `ceiling.layout-executed` → furnish (`furnishLayoutTrigger.ts:316–322`) + 12 s timeout fallback. **No model-change trigger** — editing a room never re-furnishes |
| **D-CE** ceilings | **NO twice-run assertion** (`ceilingLayout.test.ts` covers emission only) | **NO** | **NO** | **YES** — one `runBatch`, one `ceiling.batch.create` (`CeilingLayoutExecutor.ts:198–206`) | **generation-chain only**: `apartment.layout-executed` → next tick (`ceilingLayoutTrigger.ts:51–58`) |
| **Room detection** | **NO twice-run assertion** (idempotency guard test only, `roomRedetectNoProgressGuard.test.ts:90`) | cert round-trips seed rooms via commands, never via detection — **the engine itself untested across reload** | **YES** — `createdBy:'system'`, `detectionVersion`, `detectionMethod:'auto-topology'` (`RoomDetectionEngine.ts:515–521`, `:475`) | **ZERO — explicitly non-undoable** (`ReDetectRoomsCommand` header `:31`) | **the ONLY reactive engine**: subscribes wall/curtain-wall/bounding-line/slab/column stores (`RoomTopologyObserver.ts:156–205`) + `bim-wall-mutation-committed`; suppressed per §H below |
| **Roof generation** | regression "bit-identical to old behaviour" tests only (`roofPureGeometry.test.ts:34`), no run-twice | **NO** | **NO** — `RoofData` has no origin; generated ≡ hand-drawn | **YES, folded into house structural batch** (`HouseLayoutExecutor.ts:1430` inside `beginBuildingGeneration` `:1321`) | **NOTHING** — no subscriber re-derives the roof when the shell beneath changes (the PR-10 structural-unpreventability, from the generation side) |
| **Corridor-spine** | **YES** — `deriveCorridorSpine.test.ts:96` ("two runs identical") | **NO** | **NO** (corridor rooms inherit D-TGL's room marker only) | inherits D-TGL's batches | **NOTHING** — pure function called only inside a layout run |

**The trigger column is the finding.** Measured: **five of six engines can only ever run again
because a user asks**; the sole reactive engine (room detection) is the one PR-05 suppresses
permanently on generated levels. `pryzm-dep-cascade` has zero listeners — confirmed at the gate's
own ledger, `tools/rac-conformance/certification/gates/cascade-events.json:60` ("ARM-A no
listener") — so no engine *could* subscribe to model change through the declared channel without
first wiring PR-01.

- **E-19 · MISSING CAPABILITY — no engine is a closed-loop generative system.** "The engine
  exists" is true six times; "an event causes it to maintain its output" is true zero times
  (detection's reactivity being suppressed exactly where generation ran). C70's pillar I covers
  *regenerability of derived state on load*; **no pillar, gate or roadmap phase covers
  re-generation on model change** — G6 ("closed-loop — the answer feeds back and maintains
  itself") exists in the GAP-REGISTER's maturity ladder and **no gap row is graded against
  reaching it**; the ladder's top rung has no customers.
- **E-20 · MISSING STATE/RETENTION — no engine records its inputs**, so "is this output stale?"
  is unrepresentable (no input signature, no run artefact, no diff/invalidation set; finest
  regeneration grain anywhere is a whole level). Same class as E-10/E-14.
- **E-21 · MISSING CERTIFICATION — generated buildings never round-trip.** Both cert harnesses
  seed via raw commands (`seed.ts:64/95/100/109`), never by running a generator; "does a generated
  building survive save/reload" is untested for all six engines. Capability model §12's own TEST
  line ("a generation run then the full chain") is specified and has no executable form —
  and note the suppression state itself is not persistence-stable: `_graphAuthoritativeLevels` is
  in-memory and never serialized, so **a generated level behaves differently before vs after
  reload** (frozen rooms, then reactive again) — an undeclared behavioural discontinuity across
  the persistence boundary that no gate can currently see.
- **E-22 · UNPROVEN (undo asymmetry)** — house/office/resi get one composite undo via the
  generation lease; apartment is 2–3 gestures (P2-1). Cited to the pipeline audit; runtime
  behaviour unexecuted here.

**STR-06 reconciliation**: the directive rules regeneration an *authority* question and orders
`ElementOrigin` first (§15) — consistent with E-20's finding that without input signatures and
origin, "who may replace this element" is unrepresentable. It also (§18) explicitly defers
"wiring every orphaned event/package" — which means **the trigger column above is out of scope
for the reasoning-loop arc by design**; the coordinator should record that closed-loop generation
(E-19) is thereby deferred twice: absent from the corpus's DoD, and named NOT-yet by STR-06.

---

## §8 — AI as an INVOKER

Not "is AI underneath the model" (proven NO — capability model §15, A4/G-CA-A4) but: **can AI
actually USE the full reasoning surface, and is invoker-parity a tested property or an accident?**
All BY-READ at HEAD (delegated deep-read, this session).

**8.1 · Same command, yes — same *knowable* command, no.** The chat bridge holds a deliberately
narrow handle — `type ChatBus = { executeCommand(type, payload): Promise<unknown> }`
(`apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:1067`, dispatch at `:1129`/`:1144`) — into the
identical `CommandBus.executeCommand(type, payload, opts?: {suppressUndo?, gestureId?})`
(`packages/command-bus/src/CommandBus.ts:314–318`). **The envelope has no actor, issuedBy, or
source field.** The only origin taxonomy on the bus is `'LOCAL'|'REMOTE'|'PROJECT_LOAD'`
(`composeRuntime.ts:1608–1613`), which exists solely to compute `suppressUndo` for collab replay —
no `'AI'`, no `'SCRIPT'` member. `HandlerContext.audit.actorId` is copied from **boot-time
defaults onto every command** (`CommandBus.ts:86, 292–295`) — the field that *looks like* the
invoker record is a constant. → **E-04 · MISSING AUTHORITY/PROVENANCE — invoker identity is
unrepresentable in the command envelope.** Parity of treatment is *architecturally true by
inability to discriminate*, which also means: when PV-02 lands, the INFERRED/ai-origin stamping
the capability model promises (domain 15 MINIMUM CHANGE) has **no signal to stamp from**.

**8.2 · Nothing durable retains WHO.** `project_command_log` columns are
`id, project_id, user_id, command_type, payload, created_at` (`server.js:627–629`) — `user_id` is
the logged-in human whether they typed a sentence or dragged a wall; an AI-issued `wall.create` is
indistinguishable in the durable log. Undo entries (`PatchPair`,
`runtime-undo-stack/src/RingBufferUndoStack.ts:49–86`) carry no actor. The one genuine
human-in-the-loop provenance record, `AIApprovalRecord`
(`packages/ai-host/src/AIApprovalRecord.ts:8–21` — approvedBy, rationale, confidence), is written
only by the legacy AIPanel/ValidatePanel/PDF-batch paths and stored in **localStorage**
(`AIApprovalStore.ts:59–62`); **`ZeroTokenChatBridge` — the path that actually mutates the model
today — never writes it.** → part of E-04.

**8.3 · Refusals: verbatim, with a caveat already gated elsewhere.** `canExecute` rejection text
reaches chat intact (`CommandBus.ts:366–368` → `ZeroTokenChatBridge.ts:1146, :875, :953–960`).
Caveat: `check-refusal-identity` carries **88 named offenders** where the reason is a flattened
`'Validation failed'` — the AI relays whatever the handler produced, honestly relaying a
dishonest string.

**8.4 · The parity converse is specified nowhere.** `check-verb-liveness` (G-CA-A4) and
READINESS-GATES §3.21's A4 arm prove the *read/reasoning* half: answers identical with the AI host
composed and absent. **No gate, contract clause, or test asserts the mutation half — that an
AI-issued command receives the same validation/provenance/undo as the same command issued by a
human or a script.** Grep for "same command path"/"parity" in docs: geometry-fixture and UI-split
parity only. The property is currently true (one bus, a two-argument handle) and **ungated — a
future AI-path convenience shortcut would break it silently.** → **E-23 · MISSING SPECIFICATION +
MISSING CERTIFICATION (invoker-parity invariant).**

**8.5 · Reach: ~31 of ~320 verbs (~10%) are chat-reachable**, with the rest honestly enumerated
(45 capabilities / 51 CHAT_UNAVAILABLE / 237 classified / 0 UNDECLARED — C67 §1.2,
`check-chat-capability-coverage`). This is governance working as designed, not a defect — but it
means **the AI cannot exercise most of the reasoning surface even once it exists** unless each new
verb (graph.*, preview, explain) is also registered as a capability; C67/C68 make that mandatory
per PR, so the exposure cost is real and recurring. Class E ("unsafe — needs a bigger confirmation
model", 3 verbs) is the one place the corpus admits the confirmation concept of E-02 — as a
deferral category, not a specification.

**8.6 · Undo: an N-command AI dispatch is N undo gestures, stated honestly** (`runBatch` is
undo-NEUTRAL by ADR-0314 decision 1; chat prints "undo with Ctrl+Z (N steps)",
`ZeroTokenChatBridge.ts:1007–1011`). One-undo exists only for the 12 true-batch capabilities.
Additionally the chat never opens a gesture scope (no `gestureId` anywhere in the bridge), so
coalescing is impossible later; and **a failed plan step leaves prior steps applied, explicitly
not rolled back** (`:1181–1182`) — the "partial success" state the founder's directive §L names,
reaching the user as prose, with no partial-outcome artefact (§11: specified by STR-05,
implemented nowhere). → **E-24 · MISSING REPORTING — AI plan partial-failure has no structured
outcome.** The transactional question is now DECIDED: STR-06 §12 names the two batch modes
(Atomic / Progressive) and requires `completed / failed / notAttempted / undoUnits` on every
batch report, gated by G-REASON-07 (*no silent partial batch*). Measured distance: neither mode
exists as an API, the chat bridge's sequential loop is an unnamed Progressive with no report
object, and G-REASON-07 is a name in a directive.

**§8.7 · STR-06 reconciliation for the whole section.** E-04 → STR-06 §7–8 (envelope enrichment
`actor{kind}` + `origin{surface, proposalId}`, and the actor/approval separation — the directive's
"far more useful than stamping actorId='ai'" ruling matches the measured boot-time-constant
defect exactly). E-23 → STR-06 §9 + G-REASON-04: parity becomes behavioural
(`normalize(human) === normalize(ai)` excluding actor/origin/timestamp/proposal metadata), which
is *testable today* — it needs no new state, only the gate; of everything in the directive this
is the shortest-distance item, since §8.1–8.3 measured the two paths already converging on one
funnel. E-24 → §12/G-REASON-07 as above. Approval binding (G-REASON-05, planHash + state hash,
stale plan → re-plan) has no substrate until the plan object exists — it is downstream of E-18 by
construction.

---

## §9 — The Golden Operations 4-question matrix

Per operation: can the MODEL answer it (state + algorithm exist)? · can the RUNTIME invoke it
(verb/surface)? · can the system EXPLAIN the answer (why-this-answer)? · can the harness PROVE it
(executable suite)? Machinery-exists never marks a cell complete (C70 §4.2). PART-D's evidence is
cited for the PROVE column: **no suite exists for query/impact/validation/provenance/explanation;
no `query.*`/`graph.*` namespace exists among the ~320 registered verbs.**

| Golden operation | MODEL can answer? | RUNTIME can invoke? | Can EXPLAIN? | Harness can PROVE? |
|---|---|---|---|---|
| **Query** (which rooms border the kitchen?) | PARTIAL — `RoomGraphService` computes adjacency (G5) but `[]`-conflates (GR-14) | **NO** — zero graph verbs (GR-16; PART-D verb census) | NO — answers carry no basis ("adjacent because shared wall W") ; nothing specifies answer provenance for reads (B-20's chat half) | NO — no suite (PART-D) |
| **Impact** (what changes if this wall moves?) | **NO** — §2: 6 of 11 answer components have no source of truth | NO | NO | NO |
| **Validation** (does this violate anything?) | PARTIAL — validators run debounced-advisory; results are logs not state (CO-10) | NO — no validate-now verb (C-21) | PARTIAL — refusals carry both numbers where they exist | NO |
| **Geometry** (area of room X?) | YES — deterministic metrics (the strongest column) | PARTIAL — panel/pull paths, not a certified verb | NO — a number with no derivation trace | PARTIAL — engine suites executable; Geometry axis UNPROVEN headlessly (CE-02) |
| **Provenance** (who created this and how?) | **NO** — PV-02 | NO | NO | NO — gates unbuilt (PV-07) |
| **Propagation** (move it, keep the model consistent) | PARTIAL — bespoke spine works (C72 §0.3); generic dead | YES — the mutation verbs exist | NO — §5 | PARTIAL — `check-propagation-reaches` green-at-declared-level = "known defect has not grown", plus EV-03 traces; bespoke trackers ungated (PR-09) |
| **Collaboration** | UNPROVEN by construction (CB-01) | NO transport | n/a | NO — exit-2 `transport-absent` by design |
| **Explanation** (why can't the door go here?) | PARTIAL — refusal reasons exist at the strong sites (`canPlace`) | PARTIAL — reaches chat verbatim per capability model §15 | **the operation IS explanation, and it covers only refusals** (C-04) | NO — no suite; GE-09: no gate asserts a refusal reaches the user |

**Reading**: not one of the eight operations has all four columns; five of eight fail the MODEL
column itself, which no amount of verb-building or harness-building fixes. The matrix confirms
PART-C's C-26 from the other direction: the corpus's completest column is mutation machinery, its
emptiest is answers-about-mutations.

---

## §10 — Scenarios D, E, G, H (A/B/C/F: PART-C §4–§5, cited)

### Scenario D — corridor boundary change → must route generation rerun
User narrows a corridor room's boundary; which generated elements (doors auto-placed onto the
corridor, furniture, ceiling grid) are affected, and does route/corridor generation re-run?
**Verdict: the scenario cannot start.** (a) A room-boundary change is itself only expressible by
moving walls — there is no room-boundary command; (b) room type/program changes propagate to
nothing (C-08: sole room subscribers are parameter-propagation and naming — EXECUTED grep,
PART-C); (c) corridor-spine generation has no trigger (§7: trigger = nothing, for every engine);
(d) "which generated elements" is unanswerable because generated ≡ authored without provenance
(C-13). Four stacked absences; the new one this scenario isolates: **E-14 · MISSING REASONING —
no artefact can compute "the generated elements whose generating inputs changed"**, because no
engine records its inputs (an engine run is not a retained artefact with an input signature —
MISSING STATE/RETENTION half, same class as E-10).

### Scenario E — generate → manually modify one wall → regenerate
Expected: authored modification protected, generated siblings update. **Verdict: the distinction
does not exist at any layer** — this is §6's scenario at minimum grain, and additionally: the
manual edit after generation lands on a level whose re-detection is permanently suppressed
(PR-05), so even the *derived* state (rooms) will not update — the opposite failure to the one the
founder fears. The system today neither protects the authored wall as authored **nor** updates the
generated fabric: it freezes both. Cited: C-13, PR-05, C75 §2.7 zero implementations, B-17.
No new finding id — the scenario is E-13's oracle case 2.

### Scenario G — ask about a relationship with no retained/typed representation
E.g. "what does this slab support?" (`supports` slab→wall declared-never-written, EV-04 §2) or
"which levels does this stair connect?" (`connectedByStair` write-only, reader-less — C-07).
Expected answer: *"cannot determine, because slab→wall support is not represented"* — never `[]`.
**Verdict: the honesty RULE is specified (L-INV-1, C71 §4.4 typed refusal unions) but the refusal
CONTENT the founder expects — naming the missing representation — is not.** C71 §4.4's unions name
*query-time* causes (unreachable level, empty graph); no specified refusal member says "this edge
family has no writer in this product". The system would need to know its own coverage map to say
it — which exists only as EV-05 prose and an unbuilt gate (GR-07/GR-11). → **E-15 · MISSING
REPORTING + MISSING STATE/RETENTION: refusal-with-named-missing-representation requires the
relationship coverage ledger to be machine-readable model metadata, not review prose.** Today the
true answer would be `[]` from a graph that was never written to — the exact conflation L-INV-1
forbids, with no path to the honest sentence.

### Scenario H — generate → modify → save → export → import: identity/topology/provenance/derived
GUID survives save/reload (cert 0 CLEAN, EXECUTED-CITED); the IFC boundary itself is UNPROVEN
(C-25: no export→import→diff run exists). Topology: `contains` is import-only (GR-01) so a
round-trip *gains* containment edges the native model never wrote — import is more topological
than authoring, an asymmetry no contract names. Provenance: PV-04 (mapping absent, C75's own
largest risk); on re-import every element would enter as OBSERVED-at-best or unmarked, so a
round-trip **launders REGENERATED/INFERRED into observed fact** — the exact §0.1 harm C75 names.
Derived state: rooms re-detected on import; with the **IFC split-brain** — the export orchestrator
maps 6 element kinds while the IFC4X3 path maps rooms/zones (PART-D evidence, cited) — the
re-imported building's room set is derived from whichever mapper ran, and no comparator exists to
say whether the two agree. → **E-16 · MISSING CERTIFICATION — the interchange loop has no
executable scenario** (extends C-25 with the provenance-laundering and split-brain-divergence
oracles, both statable today).

---

## §11 — The token census

Census run this session (EXECUTED greps, delegated) over the 19-file corpus (C70–C75, both
STR-05s, nine `BIM30-*.md`, two plans) and `packages/ plugins/ apps/ tools/`. Classification per
token: **specified** (a contract/doc REQUIRES it) · **implemented** · **exposed** · **tested** ·
**merely mentioned** · **absent**. Honest zeros included; condensed to classes, full per-token
detail preserved in the rows that matter.

| Token | Corpus | Code | Class |
|---|---|---|---|
| preview | C70–C75: **0**; STR-05-breakdown:332 one registry line ("speculative-engine — read-only consequence preview for destructive actions") | `SpeculativeEngine.preview` real; overlay renders; **invocation unwired (E-17)** | implemented + tested, **NOT specified**; "exposed" only in the instantiated-but-unreachable sense |
| dry-run / dryRun | **0** | real, **IFC import only** (`IfcConversionMode='dry-run'`, ~15 converters); CLI stubs | implemented-for-import; absent for model commands; not specified |
| what-if / whatIf | **0** | 1 comment (`command-bus/src/cascade.ts:52` — "in dry-run 'what-if' tooling") | merely mentioned |
| impact prediction / predictImpact | **0** | **0** | **absent** |
| affected-element enumeration | **0** as requirement | `affectedFromRelationships` (speculative-engine) + `cascade.ts:237` `rule.resolveAffected` BFS; ~40 batch handlers use `affectedIds` for undo scope, not prediction | implemented ×2, not specified |
| predicted violations | **0** as term | `SpeculativeEngine.ts:316–327` before/after validateAll diff | implemented, not specified |
| confirmation (destructive) | ~21 corpus hits — **all meaning audit corroboration**, none user-consent | generic `ConfirmDialog.ts`; zero `requireConfirmation`-class API | **absent as a contract concept** (E-02) |
| destructive-operation warning | registry line only | overlay hover warning (unreachable, E-17) | implemented-unreachable, not specified |
| post-command report / cascade report | **0** | **0** | **absent** |
| change / dependency / conflict explanation | **0** / **0** / K-INV-2 names a conflict *artefact* (CB-04 open) | **0** | absent (conflict: specified-adjacently, unimplemented) |
| "causal" | 6 corpus files — **all** the ADR-0319 class label DERIVED-BUT-CAUSAL, not causation | 12 files, same label | **do not count as explanation coverage** |
| regeneration authority / trigger / scope | **0** | **0** as terms (`ElementRebuildRegistry` triggers rebuilds untyped) | **absent** — the §7 subject has no vocabulary anywhere |
| authored-state protection | **SPECIFIED** — C70 K-INV-2; READINESS-GATES §3.22 CM1/CM2 zero-tolerance | collab-gate machinery; no named API; no element-grain form (E-13) | specified for the *merge* case only |
| provenance chain | **0** ("chain" never) | 0 | absent as a construct |
| why-did-this-change / what-caused-this / what-will-change / what-did-not-change / why-regenerated / why-preserved / cannot-regenerate | **0** ×7 | **0** ×7 (stray prose comments only) | **absent ×7 — the founder's question family has zero representation** |
| AI invocation / aiInvoked | **0** | **0** (cost meters only; no actor tag — §8) | absent |
| command consequence / mutation plan / transaction preview | **0** | **0** (`CommandPlan`/`PlanValidator` is a different concept — AI plan steps) | absent |
| **partial success** | **STR-05 founder directive §L names it explicitly** ("distinguish success · partial success · refusal…") | `partialSuccess` **0**; the state occurs (§8.6) and is reported as prose | **specified by the directive, implemented nowhere, carried into no contract** — L-INV-1/L-INV-2 dropped it → **E-25** |
| partial refusal | **0** | **0** (refusals are whole-read) | absent |
| dependency / impact traversal, causal graph | **0** | 0 as named APIs | absent |
| consequence | 14 corpus files — all the *geometry-determinism* sense ("deterministic consequence of model state") | `ConsequencePreview` ×6 + prose | the corpus uses the word for state→geometry entailment; the command-consequence sense exists once, in the unreachable engine |

**Census verdict — the founder's hypothesis in one table.**
- **Absent from BOTH corpus and code: 19 of ~38 tokens**, including the entire
  why-/what- question family, regeneration authority/trigger/scope, post-command report, causal
  graph, impact prediction.
- **Specified but not implemented: 2** — "partial success" (directive §L, dropped by every derived
  document — E-25) and the conflict artefact (CB-04, owned).
- **Implemented but not specified: 5** — preview, affected-enumeration, predicted violations,
  destructive warning, IFC dry-run. **C70–C75 contain zero requirements for any
  preview/prediction/explanation capability; the speculative engine predates and is unreferenced
  by the entire BIM30 contract suite** — the corpus did not merely fail to specify the
  before-the-change half, it failed to *notice the repository had already started building it*
  (the DO-NOT-REBUILD register protects the bespoke propagation spine by name and protects none
  of these five). → **E-26 · MISSING SPECIFICATION — un-inventoried capability**: the inverse of
  the corpus's signature "authored-but-unwired" hazard is "built-but-uncontracted", and it has no
  register.

---

## §12 — The founder's question, answered

> *"If a user treats BIM 3.0 as an intelligent building model rather than as a collection of
> deterministic commands, what questions would they reasonably expect the system to answer that
> the current eight golden operations, 16 capability domains, GAP-REGISTER, roadmap and readiness
> gates do not currently specify?"*

Nine questions. Each is one a user of an "intelligent building model" would reasonably ask; none
is specified by the eight golden operations, the 16 domains, the GAP-REGISTER's 84 rows, the
roadmap's phases 0R–9, or the 23 readiness gates — the artefacts the founder's question names.
(Questions those artefacts DO specify — "which rooms border the kitchen", "does this violate
anything", "who created this" — are excluded; this list is the residue.) **STR-06, filed
mid-review, now claims Q1, Q2, Q4's report-half and Q5 for the reasoning-loop arc** — the per-block
"blocks the target" verdicts below are unchanged (STR-06 is intent; its ADRs, plan, contract
amendments and gates all measure zero at HEAD, E-27), but the coordinator should read Q1/Q2/Q5 as
*directed, distance measured here* and Q3/Q6/Q7/Q8/Q9 as *still unowned even under STR-06* (Q3:
causation log outside §1's field list; Q6: no authored-protection gate in G-REASON; Q7: staleness
census unnamed — though §6-bis's `STALE_DERIVED_STATE` reason presupposes staleness becomes
representable, which is Q7's precondition, unscheduled; Q8: §18 NOT-yet; Q9: coverage
self-knowledge unnamed).

### Q1 — "What will happen if I do this?" (before committing)

| Field | Answer |
|---|---|
| User question | pre-commit consequence enumeration for any mutation (the founder's eleven fields, §2/§3) |
| Expected answer | typed plan: predicted state delta · affected/topology/metric deltas · hosted revalidations · violations created+resolved · regeneration set · **untouched set** · **undeterminable set** · refusals with both numbers |
| Required model state | none new beyond current authoritative stores + retained edges (GR-04/06 close the topology half) |
| Required algorithm | dry-run execution of the REAL handler path with writes gated (the IFC `dryRun` idiom, §3.2) + `speculativeEngine`'s violation diff |
| Required verb | `command.preview` (or a `dispatch(…, {dryRun})` option) in the read-only capability class |
| Required mutation/propagation behaviour | provably none: `model-before == model-after` asserted by a deep capture around the preview (§3.2 limit (b)) |
| Required provenance | the plan is COMPUTED; never persisted as model state |
| Required answer surface | bus verb + chat (C67/C68 registration) + the already-built `ConsequencePreviewOverlay` (E-17) |
| Required certification oracle | preview(move wall W) ≡ (execute; diff; undo) on the canonical world, PLUS zero-mutation proof, PLUS comparator watched go red on a planted store write |
| Current repository evidence | `preview()` computes 3 of 11 fields, unreachable (E-17/E-18); `planOpeningRefit` is the plan grain; bus has no dry-run option (`CommandBus.ts:305`) |
| Gap classification | MISSING CAPABILITY (composite) + MISSING EXPOSURE + MISSING SPECIFICATION |
| Blocks the target? | **BLOCKS** — C70 §6.2's "impact" golden operation cannot mean less than this and still be an *operation*; without it, "impact" is a graph read over one edge family (§2, E-06) |

### Q2 — "What did that just change — and what did it deliberately not touch?"

| Field | Answer |
|---|---|
| User question | the six-section post-mutation report (§4) |
| Expected answer | Changed / Not changed / Regenerated / Refused(+numbers) / Provenance / Validation |
| Required model state | E-10's cascade record for the *changed* set; the certification's "nothing else" computation productionised for the *not changed* set |
| Required algorithm | assembly over the per-command cascade record; already exists in-harness (capture diff) |
| Required verb | none new — a content contract on `CommandResult` (E-03/E-09), surfaced by chat/UI |
| Required mutation/propagation behaviour | every propagation hop appends to the record it already transiently holds (E-10) |
| Required provenance | Regenerated section requires C75 §2.7 writers (blocked on PV-02) |
| Required answer surface | structured `CommandResult` + chat rendering; **the report must state its own blind spots** (dependents with no subscriber = "not re-validated", not "unchanged") |
| Required certification oracle | harness compares the report's Changed/Not-changed sets against its own independent capture diff — the report becomes a *subject*, not just the oracle |
| Current repository evidence | `affectedElementIds` unspecified (E-03); toast-grade reporting (C-14); "not changed"/"partial success" zero corpus hits (§11) |
| Gap classification | MISSING REPORTING + MISSING SPECIFICATION (+ MISSING STATE/RETENTION for the changed-set record) |
| Blocks the target? | **BLOCKS** — Golden Chain link 11 is in every DoD chain score; as written it is satisfiable by a toast (E-09), so either the link means this or the link measures nothing |

### Q3 — "Why did THIS element change when I edited THAT one?"

| Field | Answer |
|---|---|
| User question | consequence attribution across the cascade (§5 question 3) |
| Expected answer | a cause chain: "area of Room 4 changed because its boundary re-detected because wall W moved (command #123, you, 14:02)" |
| Required model state | **E-10: an append-only cascade event log with cause links** — the state that does not exist and nothing plans |
| Required algorithm | E-11: backward walk + compression over the log |
| Required verb | `model.explainChange(elementId, since?)` — read-only, refusal-honest |
| Required mutation/propagation behaviour | subscribers stamp {cause: eventId} on every derived write; dead-end cascades leave tombstones |
| Required provenance | complements C75 (origin says who made it; the log says why it moved); REGENERATED §2.7 prior-chain is the persistence-grade fragment |
| Required answer surface | verb + chat + element inspector |
| Required certification oracle | canonical wall-move: the explanation of each predicted dependent must terminate at the command id; a planted spurious change must yield "no recorded cause" — never a fabricated one |
| Current repository evidence | prevState consumed and dropped at every hop (§5 table); `project_command_log` retains commands only, unexposed |
| Gap classification | MISSING STATE/RETENTION → MISSING REASONING → MISSING REPORTING (three separable fixes, §5) |
| Blocks the target? | **BLOCKS Level 8** ("explanation-capable") *as the founder plainly intends it*; AMBIGUOUS under the letter of C70 §6.2, where "explanation" is today satisfied by refusal text (C-04) — the ambiguity is itself finding E-23 territory: the coordinator should force the definition |

### Q4 — "What became invalid because of my change?" (the temporal half of validation)

| Field | Answer |
|---|---|
| User question | not "does anything violate" (specified, golden op 3) but the *delta*: which violations did THIS change create or resolve |
| Expected answer | {created: [...], resolved: [...], unchanged-violations count}, per command |
| Required model state | violations as queryable state (CO-10) + a violation snapshot per command boundary |
| Required algorithm | the set-difference `speculativeEngine` already implements (`:323–327`) — run post-commit instead of pre |
| Required verb | part of Q2's report; standalone `validation.diff(commandId)` |
| Required mutation/propagation behaviour | constraint re-check actually runs on mutation (today: two honest cells in fourteen rows, PART-C §17) |
| Required provenance | violations carry {detectedAfter: commandId} |
| Required answer surface | report §Validation + chat |
| Required certification oracle | move wall to overlap a door → exactly one created violation named; move back → exactly one resolved |
| Current repository evidence | CO-10, C-21; the diff algorithm exists in the unreachable engine |
| Gap classification | MISSING CAPABILITY (re-check-on-mutation, cited C-06) + MISSING REPORTING |
| Blocks the target? | **BLOCKS** — G-INV-3 makes violations queryable state; a queryable state that mutation never updates fails A-INV-3's spirit (a truth nobody maintains) |

### Q5 — "Warn me before I break something."

| Field | Answer |
|---|---|
| User question | destructive-operation confirmation: consequential commands present their consequence set and require consent |
| Expected answer | "this delete severs 3 hostings and empties 1 room — proceed?" with a consent step |
| Required model state | none beyond Q1's preview |
| Required algorithm | Q1 + a severity classification (which consequence classes demand confirmation) |
| Required verb | dispatch option `{requireConfirmation}` / policy on the command definition |
| Required mutation/propagation behaviour | commit proceeds only after consent token; scripted/AI paths supply consent explicitly (parity, §8) |
| Required provenance | the consent is recorded (who approved, shown what) — the AUTHORED act includes the approval |
| Required answer surface | UI modal + chat turn + scripted parameter |
| Required certification oracle | a delete with dependents refuses without consent, proceeds with it, and the shown consequence set equals the executed one |
| Current repository evidence | zero corpus/code hits for confirmation/destructive-warning (§11); RAC modal previews intent only (E-02) |
| Gap classification | MISSING SPECIFICATION + MISSING CAPABILITY |
| Blocks the target? | **OPTIONAL/DEFERRED as UX; the SPEC gap blocks** — a contract must at least *decide* that no confirmation is required, else L-pillar honesty is asymmetric (can refuse, cannot warn — E-02). Founder decision. |

### Q6 — "Which parts of this building are mine — and will you touch them?"

| Field | Answer |
|---|---|
| User question | authored/generated census + a regeneration promise ("regenerate this area; do not touch what I authored") |
| Expected answer | per-element origin listing; regeneration plan naming preserved vs regenerated vs cannot-regenerate(+reason) |
| Required model state | PV-02 origin fields; E-20 engine input signatures for "cannot-regenerate" |
| Required algorithm | C-22's operation-level rewrite policy, executable |
| Required verb | `provenance.query(scope)` + a scoped `regenerate(scope, {preserveAuthored: true})` — no such verb family exists |
| Required mutation/propagation behaviour | regeneration writes REGENERATED-with-prior (C75 §2.7, zero implementations) |
| Required provenance | this IS provenance, plus the protection semantics above it |
| Required answer surface | chat + inspector + the §6 report |
| Required certification oracle | the six-element scenario (E-13) |
| Current repository evidence | B-17/B-19/PV-02/C-13; engines emit no origin except room `detectionMethod` (§7) |
| Gap classification | MISSING AUTHORITY/PROVENANCE + MISSING CERTIFICATION (E-13) |
| Blocks the target? | **BLOCKS** — DoD condition 7 (provenance at element grain) is already binding; the *scenario* and the *protection operation* are the unspecified halves |

### Q7 — "Is anything I'm looking at stale?"

| Field | Answer |
|---|---|
| User question | staleness census: which derived values no longer reflect authoritative state (schedule areas after a geometry edit, solar results after a model change, rooms on a suppressed level) |
| Expected answer | named list: {value, lastValidAt, invalidatedBy, why-not-recomputed} — including "rooms on level 2 are frozen because generation marked the level authoritative" |
| Required model state | staleness markers on derived caches (`Room.area` has none — audit §17.3); suppression state as queryable, persisted, scoped model state (today an in-memory Set that silently resets on reload — §7/E-21) |
| Required algorithm | invalidation bookkeeping — set the marker where the subscriber is missing, rather than pretending freshness |
| Required verb | `model.staleness()` read-only |
| Required mutation/propagation behaviour | every dependency edge with no live subscriber marks its dependent stale instead of doing nothing (converts every §17 N-cell from silent to declared) |
| Required provenance | markers are COMPUTED metadata |
| Required answer surface | verb + chat + UI badge (badge optional; verb not) |
| Required certification oracle | strand a schedule (PR-12) → staleness names it; wire the subscription → the entry leaves |
| Current repository evidence | pillar F's own definition ("no third state where dependents silently go stale") states the invariant; **no gate, verb, or state implements the "explicitly invalidated" branch anywhere** — propagation either happens or nothing records that it didn't |
| Gap classification | MISSING STATE/RETENTION + MISSING REPORTING |
| Blocks the target? | **BLOCKS** — F's definition already promises it ("updated **or explicitly invalidated**"); the corpus built gates only for the "updated" half. The explicit-invalidation half has no representation, making F unsatisfiable as defined — a contract-completeness finding, not a wish |

### Q8 — "Keep the generated parts up to date as I edit."

| Field | Answer |
|---|---|
| User question | closed-loop generation (G6): the model maintains derived/generated content under edits |
| Expected answer | scoped, provenance-respecting re-runs triggered by model change, or an honest "regeneration available" prompt |
| Required model state | E-20 input signatures; PV-02 |
| Required algorithm | per-engine affected-scope computation (today: none; finest grain is a level) |
| Required verb | engine-level `regenerate(scope)` verbs + a trigger subscription |
| Required mutation/propagation behaviour | PR-01 wired (or engines subscribe bespoke); PR-05 released |
| Required provenance | REGENERATED chains |
| Required answer surface | prompt/report |
| Required certification oracle | edit a wall in a generated apartment → the affected room's furnish re-plans (or a named stale entry appears), authored furniture untouched |
| Current repository evidence | §7: trigger = nothing ×5, suppressed ×1; G6 has zero graded rows (E-19) |
| Gap classification | MISSING CAPABILITY (the closed loop) |
| Blocks the target? | **OPTIONAL/DEFERRED** for the current DoD (G6 appears in no DoD condition) — but then the maturity ladder's G6 rung should say "post-3.0" explicitly rather than dangle |

### Q9 — "What can't you tell me about this building?"

| Field | Answer |
|---|---|
| User question | the model's self-knowledge of its own coverage: which relationship families / analyses / provenance are simply not represented |
| Expected answer | "slab support is not tracked in this product" (E-15) — refusals that name the missing representation, and an enumerable coverage map |
| Required model state | the EV-05-style coverage ledger as machine-readable metadata (GR-07 makes it a gate input; this makes it a runtime input) |
| Required algorithm | none — a lookup |
| Required verb | refusal members on every graph/query verb + `model.capabilities()` |
| Required mutation/propagation behaviour | none |
| Required provenance | n/a |
| Required answer surface | typed refusal unions extended with `not-represented(family)` (C71 §4.4 extension) |
| Required certification oracle | ask for a parked/unwritten family → exact refusal member, never `[]` (scenario G) |
| Current repository evidence | E-15: refusal unions name query-time causes only |
| Gap classification | MISSING REPORTING + MISSING SPECIFICATION |
| Blocks the target? | **BLOCKS** — C70 §1.1's closing clause ("refuses honestly where it cannot answer") is unimplementable without the system knowing what it cannot answer; today that knowledge lives in review documents, outside the model |

**The pattern across the nine**: every question is about the model's relationship to *change* —
before it (Q1/Q5), just after it (Q2/Q4), across time (Q3/Q7/Q8), or about the boundary of its own
knowledge (Q6/Q9). The corpus's existing instruments answer the orthogonal set — is the state
true, stable, deterministic, identified. The founder's hypothesis is therefore confirmed with a
precise boundary: **the corpus specifies the model as a system of record; it does not yet specify
the model as a counterparty in a conversation about change.** Q1–Q4, Q6, Q7, Q9 block the target
as the contracts already define it (each anchors to a binding clause that is unsatisfiable or
unmeasurable without it); Q5 requires a founder decision; Q8 is honestly deferrable.

---

## §F — Findings ledger

Classification uses the founder's 10-class taxonomy. "STR-06" column: which directive clause now
owns the subject (— = unowned even under the directive). Evidence class per finding is stated in
its owning section.

| ID | Finding (one line) | Class | STR-06 | Where |
|---|---|---|---|---|
| **E-01** | Prediction is not a link in the Golden Chain; the no-partial-credit rule cannot fail a capability for lacking it | MISSING CAPABILITY + MISSING SPECIFICATION | §2 lifecycle; certification-time chain extension (predict/authorize links) | §1 |
| **E-02** | Authorization/confirmation specified nowhere in C70–C75; the model can refuse but cannot warn | MISSING SPECIFICATION | §10–11 (consequence-first confirmation, planHash binding) | §1 |
| **E-03** | `CommandResult.affectedElementIds` is an unspecified answer surface — cannot be wrong, so cannot be right | MISSING REPORTING | §1 (deprecated toward the consequence object) | §1 |
| **E-04** | Invoker identity unrepresentable: no actor/origin in the envelope; `audit.actorId` is a boot-time constant; `project_command_log.user_id` conflates human and AI; approval records localStorage-only and unwritten by the live chat path | MISSING AUTHORITY/PROVENANCE | §7–8 | §8.1–8.2 |
| **E-05** | "What did NOT change" exists nowhere as a concept; the harness computes it and discards it | MISSING REPORTING + MISSING SPECIFICATION | §15 (derived, never persisted) | §1/§4 |
| **E-06** | Impact is specified as one edge-family read; 6 of the founder's 11 answer components have no source of truth to query | MISSING CAPABILITY | §1 + Impact≠Preview ruling | §2 |
| **E-07** | The plan object has no contract-owned type despite a native idiom (`planOpeningRefit`) | MISSING SPECIFICATION | §3 (seed idiom, `ConsequencePlanner<T>`) | §3.1 |
| **E-08** | No non-mutating command execution mode; `dispatch` takes no dry-run option | MISSING CAPABILITY | §2/§4 | §3 |
| **E-09** | Golden Chain link 11 is truthfulness without content — satisfiable by a toast | MISSING SPECIFICATION | §1/§2/G-REASON-06; contract owner still unassigned | §4 |
| **E-10** | No cascade event log: every propagation hop transiently holds its cause and drops it | MISSING STATE/RETENTION | — (outside §1's fields and §18's deferral list) | §5 |
| **E-11** | No transitive cause-assembly algorithm | MISSING REASONING | — | §5 |
| **E-12** | No "why did this change" surface (verb/chat/inspector) | MISSING REPORTING | — | §5 |
| **E-13** | The six-element authored-protection scenario has no executable form and none is planned — in the corpus OR in G-REASON | MISSING CERTIFICATION (atop B-17/B-19/PV-02/C-13/C-22) | §15 orders `ElementOrigin` first; no gate | §6 |
| **E-14** | "Which generated elements' inputs changed" is uncomputable — engines record no inputs | MISSING REASONING + MISSING STATE/RETENTION | §15 (authority framing), trigger side — | §10-D |
| **E-15** | Refusals cannot name the missing representation; coverage self-knowledge lives in review prose, not the model | MISSING REPORTING + MISSING STATE/RETENTION | — (§6-bis reasons are per-query, not per-family coverage) | §10-G |
| **E-16** | The interchange loop (generate→modify→save→export→import) has no executable scenario; round-trip launders provenance and nothing compares the split-brain mappers | MISSING CERTIFICATION | — | §10-H |
| **E-17** | The consequence-preview invocation chain is dead: `pryzm-consequence-preview` has zero emitters; the overlay's runtime is injected as nothing | MISSING WIRING + MISSING EXPOSURE | §5–6 disposition rule (WIRE/REPLACE/REMOVE) | §3.2 |
| **E-18** | The dry-run substrate exists as four unconnected parts (proposal envelope, IFC write-gating, violation diff, refit plan); no composite named in C70–C75 | MISSING CAPABILITY | §2–§4 (now the central arc) | §3.2 |
| **E-19** | No engine is a closed-loop generative system: trigger = nothing ×5, suppressed ×1; G6 has zero graded customers | MISSING CAPABILITY | §18 explicitly NOT-yet — deferred twice | §7 |
| **E-20** | No engine records its inputs; staleness/regeneration-need unrepresentable; finest grain is a level | MISSING STATE/RETENTION | §15 partially (authority), signatures — | §7 |
| **E-21** | Generated buildings never round-trip in any harness; suppression state is in-memory only, so generated levels behave differently across reload, invisibly | MISSING CERTIFICATION | — | §7 |
| **E-22** | Apartment generation is 2–3 undo gestures (P2-1); composite-undo parity across engines unexecuted | UNPROVEN | §12 (batch modes) | §7 |
| **E-23** | Invoker-parity (mutation half) is an untested accident of architecture — no clause, no gate | MISSING SPECIFICATION + MISSING CERTIFICATION | §9/G-REASON-04 — the shortest-distance directive item | §8.4 |
| **E-24** | AI plan partial-failure reaches the user as prose; no partial-outcome artefact; prior steps not rolled back | MISSING REPORTING | §12/G-REASON-07 | §8.6 |
| **E-25** | STR-05 §L's "partial success" was dropped by every derived document — no contract, invariant, or gate carries it | MISSING SPECIFICATION (directive→corpus transmission loss) | §12 restores it | §11 |
| **E-26** | Built-but-uncontracted capability has no register: C70–C75 reference none of preview/dry-run/predicted-violations machinery; DO-NOT-REBUILD protects none of it | MISSING SPECIFICATION | §5–6 + disposition rule now demand the inventory | §11 |
| **E-27** | STR-06's binding-interpretation chain is unrooted: ADR-0322/0323/0324 and BIM30-REASONING-LOOP-PLAN.md are 0 hits at HEAD | MISSING SPECIFICATION (governance) | STR-06 header names them | §E-verdict |
| **E-28** | Two of STR-06's five named consequence systems (`ImpactEngine`, `CommandImpact`) do not exist at HEAD — the convergence inventory is over-stated | UNPROVEN → corrected count | §5–6 | §E-verdict |

**One-paragraph synthesis for the coordinator.** PART-C ended at "the coordination columns are the
break"; PART-E's delta is one level up: **the corpus never specified the model's relationship to
change as experienced by the one changing it** — no prediction, no consent, no report content, no
causation, no staleness, no self-knowledge of coverage — and §0's ladder shows the repo had
quietly authored fragments of five of those and left every one short of REACHABLE. STR-06, filed
mid-review, converts seven of this file's MISSING-SPECIFICATION findings into
measured-distance-to-directive items (E-01/02/03/05/07/09/24/25 → owned; E-10/11/12/13/15/16/19/21
→ still unowned); the largest single distances are: the consequence object (not authored), preview
purity (no assertion of any strength possible over the shallow-clone fork), G-REASON-01..07 (zero
files), and the envelope actor field (unrepresentable today). The centrepiece §12 answer stands:
nine questions, seven of which block the target as the contracts already define it.
