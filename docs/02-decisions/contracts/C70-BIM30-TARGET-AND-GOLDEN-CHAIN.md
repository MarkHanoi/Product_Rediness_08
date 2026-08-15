# C70 — BIM 3.0: the target, the Golden Chain, and what may be claimed

> **Stamp**: 2026-08-12 · **Status**: CANONICAL
> **Scope**: what BIM 3.0 **is**, stated as a testable claim. Owns the twelve capability pillars as binding invariants, the **Golden Chain** and its no-partial-credit rule, the **maturity ladder L4–L8** and its award condition, the **Definition of Done**, and the **four-exit-code contract** with the minimum-evidence floor that every BIM 3.0 gate must obey. It does **not** grade where PRYZM stands — a re-baseline artefact owns the live reading.
> **Key principle**: *A capability is what an executed run proves, not what a document declares.* Every claim in this contract is falsifiable, and the mechanism that decides it is a program that could have said otherwise.
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`. Peers with **C03** (owns what a command *is*), **C16** (owns how one is written), **C69** (owns the enumeration of verbs), **C05**/**C47** (own persistence and its versioning), **C08** (owns collaboration transport and merge), **C66** (owns what capacity may be *claimed*), **C23**/**C62** (own provenance and confidence), **C65** (owns element types), **C11**/**C15** (own creation and hosting), **C67**/**C68** (own chat reachability), and **C71** (owns the relationship vocabulary and the three graphs — C70 states *that* topology must be explicit; C71 states *which* edges and with what semantics). Supersedes nothing.
> **Evidence appendices** (READ-ONLY, cited never restated): [`bim30-evidence/`](../../04-reference/bim30-evidence/) EV-03/04/05 · [`BIM20-CERTIFICATION-RESULTS.md`](../../04-reference/BIM20-CERTIFICATION-RESULTS.md) · [`BIM20-ACCEPTANCE-10-OF-10.md`](../../03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md) §0.1 (the close-out) · the live measured reading in [`BIM30-MASTER-COMPLETION-TRACKER.md`](../../03-execution/plans/BIM30-MASTER-COMPLETION-TRACKER.md) · the plan and its absorbed rules in [`BIM30-IMPLEMENTATION-ROADMAP.md`](../../03-execution/plans/BIM30-IMPLEMENTATION-ROADMAP.md). ⚠ **Four appendices this contract was written against were deleted in the 2026-08-15 corpus collapse and are citable from git history only** — `BIM30-TARGET-DEFINITION.md` (the pillar arguments and the Golden Chain table) · `BIM30-CAPABILITY-MODEL.md` (the 16 capability domains wired to machinery) · `BIM30-EVOLUTION-AUDIT.md` incl. §17 · `BIM30-CONTINUITY-DELIVERABLE.md`. Nothing in this contract depends on re-reading them; where one is cited below, it is cited as provenance, not as a live link.
> **Gate**: the certification suite at `tools/rac-conformance/certification/` — `certify.ts` over `gates/*`, under the exit-code contract implemented once in `tools/rac-conformance/certification/contract.ts`.
> **Changelog**: 2026-08-12 — created as Phase 0 of the founder's BIM 3.0 master directive, on the close-out of BIM 2.0 at 9/10.

---

## §0 — Why this contract exists, and why its mechanism is an executed run

BIM 3.0 could be specified as a definition and graded by reading the code. **This repository
spent one session proving that reading is not evidence**, and every instance below is recorded in
its own artefacts, with the commit that closed it:

- **~15 gates were green and blind at once.** Every one passed by conflating *emptiness* with
  *success* — a scan that established no subject printed a pass (recorded in `BIM30-CONTINUITY-DELIVERABLE.md` §I
  and carried into `BIM30-TARGET-DEFINITION.md` pillar L — both deleted 2026-08-15, see git
  history; the surviving binding form is pillar **L** in §2 below).
- **A compile gate fabricated ~90 PASS lines per run, for its entire life.** It never compiled
  the thing it reported on. Un-blinded at `2b1e7e99`; it immediately surfaced **27 packages that
  fail isolated compilation** ([`BIM20-ACCEPTANCE-10-OF-10.md`](../../03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md) §0.1 C9).
- **A maximally broken run scored better than any real one.** An **empty seed** — a certification
  with nothing in it — produced the best-looking certification the repo had ever recorded. That
  run now exits **2 MISCONFIGURED** (`e5addac8`, §0.1 C10).
- **The "FreeCAD-grade constraint solver" is a mock.** `PlanegcsAdapter` delegates 100 % to
  `MockSolver`, the WASM worker entry was never written, and **the 31/33 passing tests test the
  mock** (`BIM30-EVOLUTION-AUDIT.md` §17.1, deleted 2026-08-15 — see git history). A green suite over a
  substituted implementation is worse than no suite: it is a suite that argues *for* the claim.
- **Four typed cascade events have zero listeners.** `defaultRebuildDispatcher` emits
  `pryzm-dep-cascade`, `pryzm-room-reval`, `pryzm-hosted-reval`, `pryzm-structural-cascade`;
  nothing in the repository subscribes to any of them, and `setRebuildDispatcher` is never called
  (`BIM30-EVOLUTION-AUDIT.md` §17.2, deleted 2026-08-15 — see git history). The propagation layer at the
  centre of the BIM 3.0 story was authored, typed, tested-shaped — and unwired.

Those five are not five careless mistakes. They are **one defect with five faces**: the artefact
that decided the claim was never made to *fail*. So this contract does not define BIM 3.0 and ask
to be believed.

> **§0.1 — MUST.** No BIM 3.0 capability may be **claimed** on the strength of source-reading.
> Reading proves *"this code exists and says X"*; it never proves runtime behaviour. The
> certification vocabulary is binding on this contract's own claims: **BY-READ is never an
> award.** A pillar, a ladder level, or a Definition-of-Done line is satisfied by an **executed
> run whose comparator has been watched go red** against a tampered state, or it is not satisfied.

> **§0.2 — MUST NOT.** No section of this contract, and no document citing it, may restate a
> measured count. Counts rot; this contract's job is the *ordering and the rule*. Cite the
> evidence appendix, or the gate's own output. Where evidence is absent the correct word is
> **UNPROVEN** — never a blank, never an optimistic default (§L below is the general form of this).

---

## §1 — What BIM 3.0 is

> **§1.1 — the binding definition.** BIM 3.0 is a **computational building model**: a persistent,
> authoritative, identity-preserving model whose topology is explicit, whose geometry is a
> deterministic consequence of model state, whose relationships are computable by algorithms,
> whose changes propagate deterministically, whose every datum knows how it came to be known, and
> which **refuses honestly** where it cannot answer.

> **§1.2 — MUST NOT.** BIM 3.0 is **not** a renderer, a chat interface, a file format, or an AI
> product. **"No UI acknowledgement counts as success."** A panel that shows a number, a toolbar
> that enables, a rendered mesh that appears — none is evidence of a model capability. The only
> evidence of a mutation is an **independent read-back of authoritative state**.

> **§1.3 — MUST.** The AI interface sits **beside the user, above the model** — the founder's
> rule: *"The LLM may sit above the computational model, not underneath it."* Nothing an LLM
> emits is model truth; it becomes truth only by passing through the same command path, the same
> constraints, the same provenance and the same refusals as every other mutation. **Removing the
> AI box entirely must cost the system no capability except conversation.** Production deploys
> carrying no AI key while every generation engine still runs is the standing proof of this
> posture (audit §9, §17.3) — and it is a property to be *kept*, tested, not admired.

---

## §2 — The twelve pillars, as binding invariants

Each pillar's argument, its measured anti-targets and its line-level citations were recorded in
`BIM30-TARGET-DEFINITION.md` §3, and the machinery that must meet it in
`BIM30-CAPABILITY-MODEL.md`; **both were deleted in the 2026-08-15 corpus collapse and neither
was carried forward — read them from git history if the argument is needed.** The invariants
themselves are restated in full below and are binding here, so nothing normative depends on
recovering either document. **The invariant ids below are stable and are the citable form.** A pillar with no falsifiable
invariant is marketing, not a pillar.

| Pillar | Binding invariants (ids are stable) |
|---|---|
| **A — Authoritative model** | **A-INV-1** one authoritative store per element kind, nameable by the composition root · **A-INV-2** discarding every derived representation and regenerating yields an equivalent model · **A-INV-3** no verb may succeed against a detached copy — *a mutation that changes a DTO nobody reads is a lie, not a capability* |
| **B — Persistent identity** | **B-INV-1** save→reload restores every element under its original `id` and `ifcData.guid`, byte-identical, no tolerance · **B-INV-2** undo→redo walks no identity or monotonic counter forward · **B-INV-3** the GUID is the IFC round-trip join key |
| **C — Explicit topology** | **C-INV-1** every REQUIRED relationship has ≥1 production writer AND ≥1 typed production reader, plus rebuild coverage and delete/move mutation-update · **C-INV-2** junction records are retained with identity — wall connectivity is a lookup, never a per-query re-run of the resolver · **C-INV-3** move/resize/regenerate/save-load/undo never mint a new semantic identity for a surviving topological entity · **C-INV-4** the count of declared-but-unwritten relationship types never grows. **The vocabulary, the per-edge semantics and these four invariants' gates are owned by [C71](C71-GRAPH-AND-TOPOLOGY.md).** |
| **D — Computational graph** | **D-INV-1** `graph.query` / `graph.neighbors` / `graph.path` exist as read-only, refusal-honest bus verbs over the composed runtime · **D-INV-2** rebuilding twice from the same authoritative state yields identical snapshots · **D-INV-3** every consumer above the bus — the AI interface included — reaches graph answers through the same verbs with the same refusals |
| **E — Deterministic geometry** | **E-INV-1** regenerating from a restored snapshot equals regenerating from the pre-save model (no F-3-class per-reload drift) · **E-INV-2** each geometric predicate family has ONE canonical implementation under ONE declared epsilon policy, pinned by a counting gate · **E-INV-3** geometric impossibility is a refusal, never a silently-wrong mesh |
| **F — Propagation** | **F-INV-1** every declared cascade event has ≥1 live listener AND its emitter carries `prevState` · **F-INV-2** deletes propagate — a delete never returns an empty cascade *by design* · **F-INV-3** host mutation re-validates hosted state: refit where it fits, refuse naming **both numbers** where it does not, never delete a hosted element to make room |
| **G — Constraints** | **G-INV-1** no adapter reports a solve it did not perform; a mock must announce itself · **G-INV-2** every constraint family carries a declared strength — *validation · enforcement · solving* — and executable evidence **at that strength**; "solver-driven" without a solver is a contract violation · **G-INV-3** violations are queryable model state, not log lines · **G-INV-4** a refused mutation names the rule and **both numbers** |
| **H — Provenance** | **H-INV-1** no code path stamps an origin it did not observe · **H-INV-2** repair is legible — an invented boundary is recorded as `repaired`, never as authored or detected · **H-INV-3** confidence exists only on OBSERVED/INFERRED data and is **ceiling-only**. The vocabulary is fixed: AUTHORED · OBSERVED · COMPUTED · INFERRED · REGENERATED, with `'unknown'` first-class and legible. **Provenance is never invented.** |
| **I — Regenerability** | **I-INV-1** rebuild-from-authoritative ≡ restored snapshot · **I-INV-2** the persist-or-lose list is **enumerated by name and shrink-only** · **I-INV-3** a pre-graph snapshot loses nothing *silently*: either the rebuild reconstructs it or the load reports the named loss |
| **J — Algorithmic reasoning** | **J-INV-1** every algorithm is a pure consumer of authoritative state + graph reads, writing back only through commands · **J-INV-2** outputs carry COMPUTED/INFERRED provenance and, where inferred, confidence · **J-INV-3** insufficient input refuses with the named gap — it never pads the answer. **Zero-LLM BIM 3.0 is the target posture, not a fallback.** |
| **K — Collaboration** | **K-INV-1** concurrent edits to a host and its hosted element converge with the hosting edge intact · **K-INV-2** any merge discarding a user's authored state produces an explicit, resolvable conflict artefact — **no silent substitution** · **K-INV-3** collaboration claims are EXECUTED claims; no capacity tier is described as supported while [C66](C66-CONCURRENCY-AND-SCALE.md) §1 marks it CLAIMED |
| **L — Honest failure** | **L-INV-1** no production API returns `[]`/`null`/`0` to mean *"I could not answer"* · **L-INV-2** every gate and certification obeys the four-exit-code contract (§5) with a declared floor · **L-INV-3** refusals speak: rule, both numbers, reaching the user verbatim · **L-INV-4** the only evidence of a mutation is an independent read-back of authoritative state |

> **§2.1 — MUST NOT.** A pillar may not be scored from a neighbouring pillar. E holding says
> nothing about F. This is the no-partial-credit rule (§3.2) applied across pillars rather than
> along the chain, and it is why the pillar list is twelve rows and not one grade.

> **§2.2 — MUST.** Where a pillar's current standing is not measured, the correct entry is
> **UNPROVEN**, and UNPROVEN is neither a pass nor a fail — it is *"nobody looked"*, and it must
> read differently from both. K-INV-3 is the standing example: as of the close-out, collaboration
> is UNPROVEN on every certification row **by construction**, because no transport is deployed —
> and that is a founder decision, not an engineering task
> ([`BIM20-ACCEPTANCE-10-OF-10.md`](../../03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md) §0.1 C8).

---

## §3 — The Golden Chain

> **§3.1 — MUST.** Every BIM 3.0 capability holds along the **entire** chain:
>
> ```
> intent → command → state → geometry → topology → graph → propagation
>       → persistence → undo/redo → collaboration → report
> ```

| Link | What must be true at this link |
|---|---|
| **intent** | a user action or an accepted AI proposal resolves to a typed command; ambiguity **refuses**, never guesses |
| **command** | the ONLY mutation path; `canExecute` refuses with reasons; the dispatch outcome is structured (C03, C16) |
| **state** | the authoritative store moved on exactly the intended properties, proven by **independent read-back** |
| **geometry** | derived meshes follow deterministically |
| **topology** | affected relationships are written / updated / removed — **retained, not re-detected** (C71) |
| **graph** | the change is visible to graph queries |
| **propagation** | dependents update or are explicitly invalidated, with `prevState` in hand |
| **persistence** | survives save→reload with identity and authored state byte-intact (C05/C47, ADR-0319 classes) |
| **undo/redo** | returns exactly to the prior state; no counter walks forward |
| **collaboration** | converges under concurrent editing with relationships intact; conflicts explicit (C08) |
| **report** | the outcome — success, refusal, or conflict — is stated truthfully; **failure ≠ empty** |

> **§3.2 — the no-partial-credit rule. MUST.** A capability missing a link **is not BIM 3.0
> complete**, and it may not be described as "mostly there", "90 %", or "complete except".
> One axis per link · **no axis is inferred from a neighbour** · partial evidence is never
> promoted. A wall-move that updates geometry but strands the schedule is an **incomplete
> chain**, not a working feature with a known issue.

> **§3.3 — MUST NOT.** A link may not be scored by the subsystem that owns it. The chain is
> scored by the certification harness against read-backs of authoritative state; a subsystem
> asserting its own success is the bench-asserts-its-own-header defect C69 §0 catalogues.

> **§3.4 — MUST.** A link that has not been executed is reported **UNPROVEN**, and a chain
> containing an UNPROVEN link scores as **incomplete**, never as passing. This is the rule that
> stops "we have no transport" from silently reading as "collaboration is fine".

---

## §4 — The maturity ladder, Levels 4–8

The scale below Level 4 is history. Each level is awarded on an **executed run**, never on a
reading, and a level is awarded **whole** — there is no 5.5.

| Level | Definition | Award condition — all EXECUTED |
|---|---|---|
| **4** | derived topology auto-maintained: detection, invalidation and cascade keep derived state current | executable propagation evidence at unit level |
| **5** | unified queryable graph as a **runtime service** — certified, failure-honest, exposed as verbs | graph verbs answer the topology questions **through the composed runtime**, with typed refusals, in an executed probe (D-INV-1/2/3) |
| **6** | constraint- and dependency-driven modelling — stored model-space constraints, honest solving where proven necessary, reverse-dependency queries | a stored constraint **survives persistence** and is checked / enforced / solved **at its declared strength** in an executed run; `check-constraint-honesty` green (G-INV-1/2) |
| **7** | collaborative, versioned graph — merge semantics preserve topology; per-element history; explicit conflicts | `check-collab-graph-integrity` green **against a real transport** (K-INV-1/2/3) |
| **8** | full BIM 3.0 — explanation-capable, provenance-complete, interchange-round-tripping | the eight golden operations each pass their **full** Golden Chain; provenance answers *who/how* for every element; IFC round-trips on the GUID join key |

> **§4.1 — MUST.** *"No level is awarded without an executed run."* A level claimed from
> source-reading is **BY-READ**, and BY-READ is never an award. This applies to the ladder
> itself, not only to the capabilities beneath it.

> **§4.2 — MUST NOT.** A level may not be awarded on the strength of the machinery existing.
> Level 6 was graded *"one constraint store away"* and the grading was wrong: it is one
> constraint store **plus a real solver** away, because the solver in the tree is a mock
> (audit §17.1, §17.4). **Machinery present ≠ capability reachable** — the reachability
> question is the one to ask.

> **§4.3 — MUST.** A level, once awarded, is held only while its gate stays green. A ladder
> level is a **ratchet subject**, not a milestone: it can be lost, and losing it must exit
> non-zero rather than quietly re-grading the level downward in prose.

---

## §5 — The four-exit-code contract and the minimum-evidence floor

> **§5.1 — MUST.** Every BIM 3.0 gate, harness and certification obeys exactly four exit codes.
> The single implementation is `tools/rac-conformance/certification/contract.ts`; a gate that
> implements its own is a contract violation.

| Code | Meaning | Absorbable as declared debt? |
|---|---|---|
| **0** | **CLEAN** — the gate measured its subject and found nothing wrong | n/a |
| **1** | **DECLARED-LEVEL** — exactly the failures its named ledger declares | yes, by name, shrink-only |
| **2** | **MISCONFIGURED** — the gate could not **establish its subject** | **NEVER** |
| **3** | **RATCHET EXCEEDED** — worse than the ledger declares, or the ledger is stale | **NEVER** |

> **§5.2 — the minimum-evidence floor. MUST.** Every gate declares a **floor** — `minFiles`,
> `minRecords`, artefact freshness — and **exits 2 when the floor is unmet**. It does not exit 0.
> *Emptiness is never a pass.* A comparator reporting "0 divergences" **must also report how many
> objects it compared**; a report of zero over a subject of zero is the empty-seed lie (§0), and
> it is the single defect this whole suite exists to make impossible.

> **§5.3 — MUST NOT.** A floor may never be lowered to make a run green. Floors are
> **misconfiguration detectors**, not difficulty settings. Lowering one is the same act as
> deleting the gate, and it must be reviewed as such.

> **§5.4 — MUST.** Debt that has been paid **leaves the ledger in the commit that pays it**. A
> stale entry — declared but no longer measured — exits **3**, deliberately, because folding it
> into the finding count would let one fix and one un-struck entry cancel out and read as
> "no change". That is precisely how a ratchet stops ratcheting.

> **§5.5 — MUST.** Ledgers name their entries. A **bare count** as a baseline lets a PR fix one
> finding, break another, and stay level (C69 §7.c). Named, and checked in **both directions**:
> an entry that leaves its class must leave the list in the same commit.

> **§5.6 — MUST.** Every comparator in the evidence set is **watched go red** against a tampered
> state before it is trusted. A comparator that has never failed has not been shown to be able
> to. The standing bar is the harness discipline recorded at BIM 2.0 close-out: *an empty seed
> made the certification look better than it ever has — that is now impossible.*

---

## §6 — Definition of Done

> **§6.1 — MUST.** BIM 3.0 is DONE when **every** condition below passes as an **executed run**.
> Nothing on this list is a UI feature, and nothing on it can be satisfied by a document —
> **including this one**.

1. **The canonical test passes** — a fixture building (two levels, stair, six rooms, doors,
   windows, roof) driven entirely through bus verbs in a **composed headless runtime**; the graph
   rebuilt twice → identical snapshots; serialize → restore → rebuild → diff ∅; one wall moved →
   graph queries prove **exactly** the predicted junction / room / area / dependency edges changed
   and nothing else, with `prevState` as the oracle.
2. **The eight golden operations** — query · impact · validation · geometry · provenance ·
   propagation · collaboration · explanation — each hold their **entire** Golden Chain, scored by
   the certification harness, statuses **derived from axes, never hand-assigned**.
3. **VERIFIED is reachable and reached** — the collaboration axis has a transport, and at least
   the golden-operation rows reach VERIFIED. An arithmetic ceiling below VERIFIED must be
   *declared on day one* so the number cannot be quietly redefined later.
4. **The readiness gates are green at their declared levels** under §5, each with a floor (§7).
5. **Every REQUIRED relationship** has writer + typed reader + rebuild + mutation-update on
   **delete AND move**; the parked list has produced no writer-without-reader ([C71](C71-GRAPH-AND-TOPOLOGY.md)).
6. **The persist-or-lose ledger is empty**, or every remaining member is a founder-signed
   exception with a named reason.
7. **Provenance is complete at element grain** — every element carries an origin in the
   AUTHORED / OBSERVED / COMPUTED / INFERRED / REGENERATED vocabulary; `'unknown'` appears only on
   pre-migration data and is **never silently rewritten**.
8. **Falsifiability is proven in-run** (§5.6).

---

## §7 — The gates, and the exit condition per invariant

The BIM 3.0 gates live under `tools/rac-conformance/certification/gates/`, driven by
`tools/rac-conformance/certification/certify.ts`, under the exit-code contract in
`tools/rac-conformance/certification/contract.ts`.

| Gate | Invariants it decides | Floor | Exit condition (when this gate may stop being a ratchet) |
|---|---|---|---|
| `check-identity-roundtrip` | B-INV-1, B-INV-2 | kinds captured ≥ declared minimum | hard-0 across every kind the harness covers, **including** the GUID join key (B-INV-3) |
| `check-topology-survives` | C-INV-2, C-INV-3 | junction records read > 0 | no surviving topological entity is re-identified across move / resize / regenerate / save-load / undo |
| `check-graph-write-coverage` | C-INV-1, C-INV-4 | declared types read from source > 0 | ratchet over the **REQUIRED** families reaches 0 — owned and specified by [C71](C71-GRAPH-AND-TOPOLOGY.md) §6 |
| `check-derived-regenerable` | I-INV-1, I-INV-2, I-INV-3 | records compared ≥ minimum | the persist-or-lose ledger is empty or founder-signed (§6.6) |
| `check-propagation-reaches` | F-INV-1, F-INV-2 | declared cascade events read > 0 | every declared cascade event has a live listener **and** deletes stop returning an empty cascade |
| `check-constraint-honesty` | G-INV-1, G-INV-2 | adapters discovered > 0 | no adapter reports a solve it did not perform, and every family's declared strength has executable evidence at that strength |
| `check-epsilon-policy` | E-INV-2 | predicate call sites scanned ≥ minimum | one canonical implementation per predicate family under one declared policy; the count gate reaches its declared 1 |
| `check-provenance-not-invented` | H-INV-1, H-INV-2, H-INV-3 | provenance-bearing records > 0 | no path stamps an unobserved origin; `'unknown'` is representable and never rewritten |
| `check-derived-classification` | B-INV-2, I-INV-1 (ADR-0319) | fields classified ≥ minimum | every field carries its ADR-0319 class and the class is enforced, not documented |
| `check-collab-graph-integrity` | K-INV-1, K-INV-2 | concurrent sessions established ≥ 2 | green **against a real transport**; until then it reports UNPROVEN, never green (§3.4) |

> **§7.1 — MUST.** A gate named here that does not exist at HEAD is a **named gap**, and the
> correct entry in any status document is UNPROVEN — never a blank row and never an inherited
> green. **Measured 2026-08-12**: `check-identity-roundtrip`, `check-derived-regenerable` and
> `check-propagation-reaches` exist under
> `tools/rac-conformance/certification/gates/`; `check-collab-graph-integrity` exists under
> `tools/ga-gate/`; the remaining rows in the table above have **no file at HEAD**. Whether the
> gates that do exist are green today is **UNPROVEN in this contract by design** — §0.2: read the
> gate, not this line.

> **§7.2 — MUST.** Gates that decide BIM 3.0 invariants live in **one** suite. The measured split
> above (`check-collab-graph-integrity` under `tools/ga-gate/`, the rest under
> `tools/rac-conformance/certification/gates/`) is recorded as a **finding**, not blessed: two
> suites with two exit-code implementations is how the four-exit-code contract quietly becomes
> two contracts.

> **§7.3 — what these gates CANNOT see**, stated so no reader takes the table for coverage:
> **(a)** static discovery counts authored-but-unreached code as present — the reachability
> question (§4.2) is not answered by any gate here; **(b)** a green gate proves its own assertion,
> never the pillar around it; **(c)** single-client by construction — every non-collaboration gate
> says nothing about multi-client behaviour; **(d)** an executed run proves the seeded fixture,
> not the user's project, and the fixture is itself a declared, reviewable artefact.

---

## §8 — Anti-patterns

- **§8.a — Grading BIM 3.0 by reading.** §0.1. BY-READ is never an award.
- **§8.b — A second target definition.** Any new document restating the pillars, the chain or the
  ladder. Cite this contract; the arguments live in the evidence appendices.
- **§8.c — Restating a measured count in prose.** §0.2. Counts rot in documents and do not rot in
  gates.
- **§8.d — Partial credit along the chain.** §3.2 — "geometry works, persistence is next" is an
  incomplete chain, not a partial capability.
- **§8.e — Inferring one axis from its neighbour.** §2.1, §3.2.
- **§8.f — Lowering a floor to go green.** §5.3 — identical in effect to deleting the gate.
- **§8.g — Absorbing a 2 or a 3.** §5.1 — MISCONFIGURED and RATCHET EXCEEDED are never debt.
- **§8.h — A ledger of bare counts.** §5.5.
- **§8.i — Claiming a level because the machinery exists.** §4.2 — the mock solver is the
  standing example.
- **§8.j — A UI acknowledgement as evidence.** §1.2, L-INV-4.
- **§8.k — Reporting UNPROVEN as a blank, a zero, or a pass.** §2.2, §3.4 — failure and emptiness
  are never the same value.
