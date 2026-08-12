# BIM 3.0 contract review — PART A (founder's §1–§9)

> **Stamp**: 2026-08-12 · **Status**: REVIEW FINDINGS, not a contract, not an amendment.
> **Scope**: the founder's sections **1–9** of the C70–C75 completeness review. PART B (§10–§16)
> is another author's; the **classification, the four lists and the verdict are the coordinator's**
> and are deliberately absent here.
> **Standard applied**, verbatim: *is the contract itself complete, internally consistent,
> falsifiable, correctly owned, and impossible to misread into a stronger claim than the evidence
> supports?*
> **Rule of evidence used here**: every claim about code carries `file:line`. Where I could not
> establish something I wrote **UNPROVEN** rather than inferring it. No contract file was edited.

## §0 — What was read, and what was executed

**Read in full**: `docs/02-decisions/contracts/C70…C75`, `docs/01-strategy/STR-05-bim30-founder-directive.md`,
`tools/rac-conformance/certification/contract.ts`, `certify.ts`, the four built BIM 3.0 gates
(`tools/ga-gate/check-solver-is-real.ts`, `check-provenance-not-invented.ts`, `check-epsilon-policy.ts`,
`tools/rac-conformance/certification/gates/check-propagation-trackers-reach.ts`),
`tools/ga-gate/run-all.ts`, `tools/ga-gate/gate-newly-measured.json`, and
`docs/04-reference/BIM30-READINESS-GATES.md` §2.

**Measured at HEAD for this review** (commands, so the numbers are re-derivable, per C70 §0.2):

| Fact | Command | Reading |
|---|---|---|
| gate files existing vs named by C70–C75 | `find tools -name 'check-*.ts'` | **6 of 21** named gates exist |
| `clearGraphAuthoritative` callers | `grep -rn clearGraphAuthoritative packages apps plugins src` | 1 definition (`packages/room-topology/src/RoomTopologyObserver.ts:110`), **0 production callers**, 1 test caller (`packages/room-topology/src/__tests__/observerGraphAuthoritative.test.ts:61`) — **C72 §4.1 confirmed** |
| `initPersistence` pause | `apps/editor/src/engine/initPersistence.ts:362,366,372,376` | pause ×2, resume ×2, **no `try`/`finally`** — **C72 §4.2 confirmed** |
| production `.pause()` suppression sites | `grep -rn '\.pause()' packages apps plugins src` (tests excluded) | **≥15 call sites across ≥6 files** — see A-35 |
| `RelationshipType` members | `packages/core-app-model/src/SemanticGraph.ts` | 25 members; `joinedTo` absent — **C71 §3.7 confirmed** |
| `joinedTo` in production | `grep -rn joinedTo packages plugins apps` | only `joinedToRoofIds`, an unrelated roof field — **no writer, C71 §3.7 confirmed** |

I did **not** run `run-all.ts` or `certify.ts` (both are minutes-to-tens-of-minutes and one of them
compiles every package). Every statement below about a gate's *reading* is cited from
`gate-newly-measured.json`'s recorded `firstReading`, never asserted by me — where I have no
recorded reading, I write UNPROVEN.

---

## §1 — Authority chain

The founder asked for **ownership conflicts reported separately from implementation gaps**. That
split is honoured: §1A is ownership only (two contracts able to issue different rulings on the same
question, or a rule sitting in the wrong contract). §1B is implicit boundaries. Implementation gaps
appear in §2, §3 and §5.

### §1A — Ownership conflicts

---

**A-01 · Two contracts define the constraint vocabulary differently, and both are CANONICAL.**

- **Contract · section**: C70 §2 pillar G, **G-INV-2** · C74 §1.1.
- **Problem**: C70 G-INV-2 states *"every constraint family carries a declared strength —
  **validation · enforcement · solving**"*. C74 §1.1 states *"Every constraint in the system is
  classified as exactly one of: **VALIDATION · ENFORCEMENT · ADVISORY · SOLVING**"* — four kinds,
  and the fourth is load-bearing: C74 §2's first row (`./compliance` `ConstraintEngine`) is
  classified **ADVISORY**, a strength C70's invariant does not admit.
- **Why it matters**: a gate written to C70 G-INV-2 must classify the advisory registry as one of
  three things it is not, and the cheapest available answer is ENFORCEMENT — which C74 §2.1
  explicitly forbids (*"an advisory registry silently becoming blocking … is a user-facing
  behaviour change disguised as a refactor"*). Two CANONICAL contracts can therefore rule opposite
  ways on the same component, and C70 is the senior document, so the wrong one wins by default.
- **Exact amendment required** — C70 §2, pillar G row, replace the G-INV-2 cell text with:

  > **G-INV-2** every constraint family carries a declared strength — *validation · enforcement ·
  > advisory · solving*, **the four-kind classification owned by [C74](C74-CONSTRAINT-HONESTY.md)
  > §1.1, which this invariant cites and does not restate** — and executable evidence **at that
  > strength**; "solver-driven" without a solver is a contract violation

---

**A-02 · H-INV-3 is assigned to a gate whose owning contract disclaims the subject.**

- **Contract · section**: C70 §7 (row `check-provenance-not-invented`, "Invariants it decides:
  H-INV-1, H-INV-2, **H-INV-3**") · C75 §1.3, §6.
- **Problem**: H-INV-3 is *"confidence exists only on OBSERVED/INFERRED data and is
  **ceiling-only**"*. C75 §1.3 rules that confidence is **C62's**, that *"C75 does not redefine,
  wrap, or duplicate anything C62 owns"*, and none of C75 §6's three gates carries a
  confidence arm. The built gate has none either: `tools/ga-gate/check-provenance-not-invented.ts`
  implements V1, V3, V5 only, and its own header declares V2 and V4 **NOT IMPLEMENTED / UNPROVEN**
  (`check-provenance-not-invented.ts:48–52`). Nothing anywhere decides H-INV-3.
- **Why it matters**: C70 §7 is the table a reader consults to learn which invariant is covered.
  A row claiming a gate decides H-INV-3 is precisely the "machine existence → coverage" upgrade the
  suite exists to prevent, and it makes an unowned invariant read as owned.
- **Exact amendment required** — C70 §7 table, `check-provenance-not-invented` row, "Invariants it
  decides" cell becomes:

  > H-INV-1, H-INV-2. **H-INV-3 (confidence is ceiling-only) is decided by NO gate: C75 §1.3
  > assigns confidence to [C62](C62-DATA-CONFIDENCE.md) and C75 §6 specifies no confidence arm.
  > H-INV-3 is UNPROVEN and its gate is a named gap under §7.1 until C62 mints one.**

---

**A-03 · E-INV-2 is one invariant with two halves, assigned to one gate that implements one half.**

- **Contract · section**: C70 §7 (row `check-epsilon-policy`, "Invariants it decides: E-INV-2") ·
  C73 §5.1 / §5.2.
- **Problem**: E-INV-2 is *"each geometric predicate family has ONE canonical implementation under
  ONE declared epsilon policy, pinned by a counting gate"* — two conjoined claims. C73 splits them:
  `check-epsilon-policy` owns the tolerance half (§5.1 E1–E5), `check-predicate-canonical` owns the
  one-implementation half (§5.2 C0–C3). The gate that exists,
  `tools/ga-gate/check-epsilon-policy.ts`, implements **only** E1/E2/E4/E5 (E3 prints
  `NOT EVALUATED`, line 432) and contains no predicate-counting arm at all.
- **Why it matters**: on the day E2/E5 reach 0 the epsilon gate goes green and C70 §7 says E-INV-2
  is decided — while sixty-one point-in-polygon bodies are still in the tree. That is the exact
  "green local gate → complete capability" upgrade of §4 below.
- **Exact amendment required** — C70 §7 table, split the row in two:

  > | `check-epsilon-policy` | E-INV-2 **(tolerance half only — one declared policy)** | predicate call sites scanned ≥ minimum | one declared tolerance module in `geometry-kernel`, consumed rather than reinvented; E2 and E5 reach 0 |
  > | `check-predicate-canonical` | E-INV-2 **(canonicalisation half — one implementation per family)** | per-family structural scan ≥ `minFiles` | every family in [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) §3.1 reads 0 non-canonical implementations, each with an oracle fixture |
  >
  > **Neither half alone satisfies E-INV-2.**

---

**A-04 · Two gates decide BIM 3.0 invariants and no contract specifies them.**

- **Contract · section**: C70 §7 rows `check-topology-survives` (C-INV-2, C-INV-3) and
  `check-derived-classification` (B-INV-2, I-INV-1, ADR-0319).
- **Problem**: C71 §6 specifies exactly three gates — `check-graph-write-coverage`,
  `check-graph-delete-integrity`, `check-graph-persistence` — and `check-topology-survives` is not
  among them, despite C-INV-2/C-INV-3 being C71's declared territory (C70 §2 pillar C: *"these four
  invariants' gates are owned by C71"*). `check-derived-classification` is specified by no contract
  in the suite at all; C75 §2.9 explicitly declines ADR-0319's subject. Confirmed at HEAD: neither
  file exists (`find tools -name 'check-topology-survives.ts'` → nothing).
- **Why it matters**: a gate named in a table and specified nowhere cannot be written to a
  standard. Whoever builds it invents the floor, the ledger and the arms, which is how the two
  suites acquired two interpretations of the same rule.
- **Exact amendment required** — C71 §6, add a fourth gate specification block:

  > ### `check-topology-survives` — a surviving entity keeps its identity
  >
  > | | |
  > |---|---|
  > | **Subject** | every retained topological entity — junction records, room identities, hosting edges — read back from the composed runtime across **move · resize · regenerate · save-load · undo** |
  > | **Asserts** | (a) no surviving entity is re-identified across any of the five operations (C70 C-INV-3); (b) wall connectivity is answered from the **retained junction index**, never by re-running the resolver (C-INV-2), proven by asserting the resolver is not entered during a connectivity read |
  > | **Floor** (exit **2**) | junction records read > 0 **and** all five operations executed. Fewer than five operations executed is MISCONFIGURED, not a partial pass |
  > | **Exit condition** | hard-0 across all five operations for every element kind the harness covers |
  >
  > This gate is **EXECUTED** and therefore lives in `tools/rac-conformance/certification/gates/`
  > (see the residency rule as amended per C70 §7.2).

  and — C70 §7 table, `check-derived-classification` row, "Invariants it decides" cell gains:

  > **This gate is specified by NO contract in the C70–C75 suite; ADR-0319 owns the field
  > classification and C75 §2.9 declines it. Until a contract specifies its arms, its floor and its
  > ledger, this row is a named gap under §7.1 and may not be built to an invented standard.**

---

**A-05 · C70 commissions a gate to decide a question C74 declares not machine-checkable.**

- **Contract · section**: C70 §7 (row `check-constraint-honesty`, exit condition: *"…and every
  family's declared strength has executable evidence at that strength"*) · C74 §6.3(c).
- **Problem**: C74 §6.3(c) states, of its own gates, *"**the classification in §1.1** — whether a
  family truly needs SOLVING is a written judgement (§4.2), not a machine-checkable property"*, and
  C74 §6's table assigns `check-constraint-honesty` only §3.1/§3.2 (adapter identity + stand-in
  self-announcement). C70's exit condition is therefore unreachable by the gate C70 names, and it
  is unreachable **by design**, not by omission.
- **Why it matters**: an exit condition nobody can satisfy means the gate never leaves the ledger,
  which is indistinguishable from a gate that is failing. C70 §5.4/§8.g depend on the difference.
- **Exact amendment required** — C70 §7 table, `check-constraint-honesty` exit condition cell:

  > no adapter reports a solve it did not perform. **The second half — every family's declared
  > strength carrying executable evidence at that strength — is NOT machine-decidable
  > ([C74](C74-CONSTRAINT-HONESTY.md) §6.3c) and is discharged by the written per-family
  > classification C74 §1.3/§4.2 requires, reviewed by a human. A gate may not be cited as evidence
  > for it.**

---

**A-06 · Four of the twenty-five relationship types are in NEITHER the REQUIRED nor the PARKED list, and C71 relies on two of them elsewhere.**

- **Contract · section**: C71 §2.1 (the REQUIRED nine), §2.2 (the PARKED twelve), §5.4.
- **Problem** (measured): `RelationshipType` in `packages/core-app-model/src/SemanticGraph.ts`
  declares **25** members. §2.1's nine families cover nine members
  (`hosts`, `hostedBy`, `boundedBy`, `adjacentTo`, `connectedTo`, `sitsOn`, `supports`, `contains`,
  `partOf` — `joinedTo` is not a member at HEAD, per C71 §3.7). §2.2 parks twelve. **9 + 12 = 21.**
  The four unaccounted-for members are **`connectedByStair`, `connectedByLift`, `measuredAt`,
  `decidedBy`**. C71 §5.4 then names `connectedByStair` and `connectedByLift` as **PERSIST-OR-LOSE**
  — a normative disposition assigned to families the contract never classified.
- **Why it matters**: C71 §2.3 turns on *parked* and *gap* being different states and forbids
  conflating them. A third de-facto state — *unclassified* — reopens exactly that conflation, and
  `check-graph-write-coverage`'s floor (§6: *"declared types read from source > 0 **and** ≥ the
  count of families the ledger names"*) cannot discriminate: 21 ledgered families against 25
  declared types passes the floor while four types are invisible to both directions of the ratchet.
- **Exact amendment required** — C71, insert after §2.2:

  > **§2.2a — MUST. The two lists are EXHAUSTIVE over the declared union.** Every member of
  > `RelationshipType` is either REQUIRED (§2.1) or PARKED (§2.2). There is no third state, and a
  > member in neither list is a **finding**, not a pending decision — it is the shape §2.3 forbids,
  > wearing a different name. `check-graph-write-coverage` asserts the partition and **exits 3** on
  > any unclassified member.
  >
  > **Measured 2026-08-12**: `connectedByStair`, `connectedByLift`, `measuredAt` and `decidedBy`
  > are unclassified. `connectedByStair` and `connectedByLift` are **PARKED with a named
  > exception**: §5.4 already assigns them a persist-or-lose disposition, so they are on the
  > persist-or-lose ledger while remaining outside the coverage ratchet, and unparking either
  > requires §2.5's named consumer like any other. `measuredAt` and `decidedBy` are **PARKED**.

---

**A-07 · C-INV-4 is delegated to a gate whose asserted arms do not implement it.**

- **Contract · section**: C70 §2 pillar C (**C-INV-4**: *"the count of declared-but-unwritten
  relationship types never grows"*) · C70 §7 (row `check-graph-write-coverage`, "Invariants it
  decides: C-INV-1, **C-INV-4**") · C71 §6.
- **Problem**: `check-graph-write-coverage`'s specification in C71 §6 lists four asserts — (a)
  writer+typed reader per REQUIRED family, (b) writer-without-reader exits 3, (c) new members carry
  §2.6's four elements, (d) PARKED members are not counted. **None of the four is a monotonic count
  of declared-but-unwritten types**, and (d) actively removes the parked families from the
  denominator that C-INV-4's count would need. C-INV-4 is cited by C70 and implemented by nobody.
- **Why it matters**: the gate can go green while the declared-but-unwritten set grows, because
  growth lands in the parked set which the gate is instructed to ignore.
- **Exact amendment required** — C71 §6, `check-graph-write-coverage`, **Asserts** cell, append:

  > ; **(e) C-INV-4 — the count of declared-but-unwritten types is a NAMED, shrink-only ledger over
  > the WHOLE union including PARKED members. This arm and arm (d) measure different sets on
  > purpose: (d) keeps parked families out of the REQUIRED coverage ratchet, (e) stops the union
  > acquiring new unwritten members. A new PARKED member with no writer is legal under (d) and
  > **exits 3 under (e)** unless it lands with §2.6's four elements.**

---

**A-08 · C71 re-interprets a C70 invariant it does not own.**

- **Contract · section**: C71 §4.2 · C70 §2 pillar D (**D-INV-1**).
- **Problem**: C71 §4.2 says *"This is what C70 **D-INV-1** means by *one canonical query
  vocabulary*"*. C70's D-INV-1 reads, in full: *"`graph.query` / `graph.neighbors` / `graph.path`
  exist as read-only, refusal-honest bus verbs over the composed runtime."* It says nothing about a
  canonical query vocabulary and contains no such phrase. C71 quotes an invariant text that does
  not exist and then binds the UBG to it.
- **Why it matters**: C70 is the senior contract. A subordinate contract asserting what a senior
  invariant "means", against wording the senior invariant does not carry, is a rewrite by citation
  — and the claim it installs (the UBG owns the query vocabulary) has C52 as its real owner.
- **Exact amendment required** — C71 §4.2, replace the second sentence with:

  > This is **C71's own rule**, not a reading of C70 D-INV-1 (which governs only that
  > `graph.query` / `graph.neighbors` / `graph.path` exist as refusal-honest bus verbs over the
  > composed runtime, and says nothing about vocabulary). The rule is: one vocabulary at the query
  > surface, three stores beneath it, mappings declared in code rather than assumed by name. Where
  > it touches what the UBG *is*, [C52](C52-EDITABLE-BUILDING-GRAPH.md) governs.

---

**A-09 · C75 subordinates itself to an ADR on an intersecting subject, inverting the conflict order.**

- **Contract · section**: C75 §2.9 · `CLAUDE.md` conflict-resolution order (contracts > ADRs).
- **Problem**: C75 §2.9 states *"where they [C75 and ADR-0319] intersect, **ADR-0319 governs
  persistence behaviour** and C75 governs the origin label"*. That is a contract handing an ADR
  authority over a shared boundary. The repo's conflict order is explicit that a contract outranks
  an ADR; C71 §2 states the correct form for exactly this situation (*"Where this contract and that
  ADR disagree, **this contract wins** (contract suite > ADR)"*). The two contracts in the same
  suite state opposite subordination rules on the same day.
- **Why it matters**: at the intersection — a persisted provenance field — an ADR change can now
  silently override a CANONICAL contract, and the reviewer of that ADR has no signal that it is
  doing so.
- **Exact amendment required** — C75 §2.9, replace the second sentence with:

  > They are siblings and they intersect. **Where they disagree, this contract wins (contract suite
  > > ADR, per `CLAUDE.md`), and the disagreement is a finding to raise against ADR-0319 rather
  > than a licence to pick either.** In the intended division ADR-0319 describes persistence
  > behaviour and C75 describes the origin label; neither may copy the other's vocabulary into
  > itself (C69 §3.2 — a second copy becomes a rival list).

---

**A-10 · C72's authority line claims a peer relationship C73 does not reciprocate on the seam question.**

- **Contract · section**: C72 Authority line + §0 (*"Owns nothing about *what* the dependent
  element then recomputes: that is C73"*) · C73 Authority line (*"C72 (propagation — owns *reaching*
  the dependent; this contract owns what it then computes)"*).
- **Problem**: the two halves are stated symmetrically and are therefore *believed* to partition the
  chain. They do not: **neither contract claims the ORDER in which dependents recompute**, which is
  the subject of §6 below. This is an ownership gap dressed as a clean handoff, and it is only
  visible because both sides describe the boundary in the same words.
- **Why it matters**: a boundary both sides describe identically reads as closed. See A-33/A-34 for
  the invariant and its wording.
- **Exact amendment required**: see **A-34**.

### §1B — Implicit boundaries (no conflict yet; a decision is unmade)

- **A-08b · Which contract owns the *refusal* vocabulary?** C70 L-INV-3, C71 §4.4, C73 §4.1/§4.4 and
  C74 §3.3 each state a refusal rule in their own words ("names the rule and both numbers" /
  "refuses with a named reason" / "user-legible" / "different observable outcomes"). Four
  formulations of one rule, none citing a single owner. **Amendment**: C70 §2 pillar L, append to
  L-INV-3: *"**This is the single refusal specification; C71 §4.4, C73 §4.1/§4.4 and C74 §3.3 are
  domain applications of it and may narrow it, never restate or vary it.**"*
- **A-08c · Nothing owns the boundary between a *domain band* and an *epsilon*.** C73 §2.1 excludes
  `defaultJunctionBandM` and `CENTROID_MATCH_RADIUS` by name, and the built gate hard-codes the same
  two exclusions (`check-epsilon-policy.ts:154–157`). No rule says who may add a third. **Amendment**:
  C73 §2.1, append: *"**A constant is a DOMAIN BAND, not an epsilon, only where the owning domain
  contract names it as such. A new exclusion is an edit to that contract, not to the gate's
  exclusion list; a gate-only exclusion is a silent widening of §2.2.**"*

---

## §2 — Cross-contract gate architecture

This is the section the founder asked to be checked hardest. It is also the one where the contracts
are furthest from HEAD.

### §2.1 — The table

`CS` = `tools/rac-conformance/certification/gates/` · `GG` = `tools/ga-gate/`.

| Contract | Gate | Stated location | Belongs in the canonical (executed) suite? | Exit-code authority | Problem |
|---|---|---|---|---|---|
| C70 §7 | `check-identity-roundtrip` | CS | **Yes** — executed round-trip | `contract.ts` ✓ (exists, in `certify.ts`) | none found |
| C70 §7 | `check-topology-survives` | CS | Yes | n/a — **file does not exist** | **A-04**: named by C70, specified by no contract |
| C70 §7 · C71 §6 | `check-graph-write-coverage` | CS (C71 §6: *"All three belong beside the BIM 3.0 certification gates"*) | **No — it is a static source scan.** Under the boundary test it belongs in GG | n/a — does not exist | **A-16**: C71 assigns three static gates to the executed tree; contradicts the residency reality |
| C71 §6 | `check-graph-delete-integrity` | CS | **Mixed** — arm (b) requires *"executed read-back"*, so CS; arms (a)/(c)/(d) are static | n/a — does not exist | same; a gate straddling both homes needs splitting or an explicit ruling |
| C71 §6 | `check-graph-persistence` | CS | **No** — static + ledger read | n/a — does not exist | same |
| C70 §7 · C73 §5.3 | `check-derived-regenerable` | CS | **Yes** | `contract.ts` ✓ (exists, in `certify.ts`) | none found |
| C70 §7 · C72 §6.1 | `check-propagation-reaches` | CS *("`tools/ga-gate/`-peer path: …certification/gates/…")* | **No** — C72 §6.1.1 argues it is static **on purpose** | `contract.ts` ✓ (exists; registered in **BOTH** `run-all.ts:204` and `certify.ts:171`) | C72's location line is self-contradictory prose; **A-16** |
| — (no contract) | `check-propagation-trackers-reach` | **unstated** | **Yes** — composes stores, drives commands | `contract.ts` ✓ (exists, in `certify.ts:171`) | **A-13**: a built certification gate named by no contract section |
| C70 §7 · C74 §6 | `check-constraint-honesty` | **GG** (C74 Gate line) | **No** — static | n/a — does not exist | **A-05**, **A-11** |
| C74 §6 | `check-solver-is-real` | **GG** | **No** — manifest + source scan | `contract.ts` ✓ (`check-solver-is-real.ts:93`) — **exists, GG, in `run-all.ts:226`** | **A-11**: C70 §7 says CS and does not name this gate at all |
| C74 §6 | `check-no-hidden-mock` | **GG** | **No** — static | n/a — does not exist | **A-11**, **A-15** |
| C70 §7 · C73 §5.1 | `check-epsilon-policy` | C73 §5.1: **unstated**; C70 §7: CS | **No** — static | `contract.ts` ✓ (`check-epsilon-policy.ts:122`) — **exists, GG, in `run-all.ts:228`** | **A-11**, **A-12**, **A-45** |
| C73 §5.2 | `check-predicate-canonical` | unstated (§5.2 C0 cites `lib/sourceScan.ts`, a GG library) | **No** — static | n/a — does not exist | **A-45**: residency implied by a library citation, never stated |
| C73 §5.3 | `check-deterministic-regeneration` | unstated | **Yes** — regenerates twice in-process | n/a — does not exist | **A-11** |
| C70 §7 · C75 §6 | `check-provenance-not-invented` | **GG** | **No** — static | `contract.ts` ✓ (`check-provenance-not-invented.ts:96`) — **exists, GG, in `run-all.ts:227`** | **A-11**, **A-12** |
| C75 §6 | `check-provenance-coverage` | **GG** | **No** — static | n/a — does not exist | **A-11**, **A-15** |
| C75 §6 | `check-derived-not-authored` | **GG** | **No** — static | n/a — does not exist | **A-11**, **A-25** |
| C70 §7 | `check-derived-classification` | CS | UNPROVEN — no specification exists | n/a — does not exist | **A-04** |
| C70 §7 | `check-collab-graph-integrity` | CS (C70 §7.2 records the GG split as a finding) | **Yes** — two live transport clients | UNPROVEN (not read for this review) — **exists, GG** | recorded finding; exit condition now exists in READINESS-GATES §2.1c, **not in C70** |
| C72 §6.2 | `check-prevstate-contract` | unstated | **No** — static | n/a — does not exist | **A-11** |
| C72 §6.3 | `check-suppression-is-reversible` | unstated | **No** — static | n/a — does not exist | **A-11**, **A-17** |
| C73 §0.3 (precedent) | `check-offset-implementations` | **GG** | **No** — static | UNPROVEN — hand-rolled `process.exit(1)` at `check-offset-implementations.ts:173–186`, **does not import `contract.ts`** | **A-46** below |

**Summary of the table**: of **21** gates named across C70–C75, **6 exist**. Of those six, **three
sit in `tools/ga-gate/` while C70 §7's preamble says the BIM 3.0 gates live under
`tools/rac-conformance/certification/gates/`**, one (`check-collab-graph-integrity`) is a recorded
finding, and one (`check-propagation-reaches`) runs in both suites. A seventh built gate
(`check-propagation-trackers-reach`) is named by no contract at all.

### §2.2 — The C70 §2.1 / C74 / C75 residency reconciliation

**A-11 · The residency rule is settled in a reference document that contracts outrank, and no contract carries it.**

- **Contract · section**: C70 §7 preamble + **§7.2** · C74 Gate line · C75 Gate line · C73 §5
  (silent) · `docs/04-reference/BIM30-READINESS-GATES.md` **§2.1 / §2.1a–§2.1e**.
- **Problem**, stated precisely because the founder asked for it explicitly:
  - C70 §7's preamble asserts *"The BIM 3.0 gates live under
    `tools/rac-conformance/certification/gates/`"*, and **§7.2 — MUST** asserts *"Gates that decide
    BIM 3.0 invariants live in **one** suite"*, recording the single `tools/ga-gate/` case as a
    finding *"not blessed"*.
  - **C74's Gate line names all three of its gates in `tools/ga-gate/`. C75's Gate line names all
    three of its gates in `tools/ga-gate/`.** Both are CANONICAL, both are subordinate to C70, and
    both were stamped the same day as the §7.2 MUST they violate on their face.
  - `BIM30-READINESS-GATES.md` §2.1 **struck** the one-folder rule on 2026-08-12 and replaced it
    with **§2.1a**: *"Residency follows what a gate must REACH to establish its subject, not what it
    asserts… The boundary test is one question: **does this gate need something that does not exist
    until something runs?** Yes → certification. No → ga-gate."* §2.1b then narrows C70 §7.2's real
    objection to *"two exit-code **implementations**"*, not two folders — and I verified that
    narrowing holds at HEAD: all three GG BIM 3.0 gates import `reportGate` from
    `../rac-conformance/certification/contract.js` (`check-solver-is-real.ts:93`,
    `check-provenance-not-invented.ts:96`, `check-epsilon-policy.ts:122`).
  - **The defect is governance, not layout.** `BIM30-READINESS-GATES.md` is a
    `docs/04-reference/` artefact. Under `CLAUDE.md`'s conflict order it ranks **below** the
    contract suite. So the repository's actual, argued, correct residency rule sits in the weakest
    document in the chain, and the binding documents still say the opposite. Any future reviewer
    applying the conflict order literally must rule the three built gates **misplaced** and C74/C75
    **in violation of C70 §7.2** — which is false, and would be resolved by moving working gates.
- **Why it matters**: this is the same defect class C70 §0 exists to name — a document describing
  enforcement that does not match the enforcement. It also makes C70 §7.2, a **MUST**, currently
  violated by two of its own subordinate contracts, which is the strongest available signal that
  the rule and not the code is wrong.
- **Exact amendment required** — C70, replace §7.2 in its entirety with:

  > **§7.2 — MUST. One exit-code implementation; residency follows the boundary test.** Gates that
  > decide BIM 3.0 invariants use **exactly one** implementation of the four codes —
  > `tools/rac-conformance/certification/contract.ts`. A gate that hand-rolls `process.exit()` for
  > a ratchet breach is the violation; **its address is not.** Two homes sharing one contract is a
  > split; two contracts is a fork, and only the fork is forbidden.
  >
  > Residency follows **what a gate must reach to establish its subject**, and the boundary test is
  > one question: *does this gate need something that does not exist until something runs?*
  >
  > - **No** — it establishes its subject by reading the tree at HEAD (sources, manifests,
  >   committed artefacts, ledger JSON): `tools/ga-gate/`, registered in `run-all.ts`.
  > - **Yes** — it composes a runtime, seeds a world, dispatches verbs, opens a transport, or
  >   grades an artefact a suite wrote in the same invocation:
  >   `tools/rac-conformance/certification/gates/`, registered in `certify.ts`.
  >
  > Every gate is registered in **exactly one** runner and **both registration points are swept**:
  > a `check-*.ts` file in either home registered in neither runner is the §AUTHORED-BUT-UNWIRED
  > failure and **exits 2**. `docs/04-reference/BIM30-READINESS-GATES.md` §2.1a–§2.1e carries the
  > worked argument and the per-case rulings; it is cited, and where it and this section disagree,
  > **this section governs**.
  >
  > **Standing exception, with an exit condition**: `check-collab-graph-integrity` is an EXECUTED
  > gate sitting in `tools/ga-gate/`. It is a **recorded finding**, not blessed, and it moves to
  > `certification/gates/` in the same change that resolves its transport question.

  and — C74 Gate line, replace with:

  > **Gate**: `check-constraint-honesty` · `check-solver-is-real` · `check-no-hidden-mock`. All
  > three are **static source/manifest scans** and therefore live in `tools/ga-gate/`, registered in
  > `run-all.ts`, under the single exit-code implementation at
  > `tools/rac-conformance/certification/contract.ts` (C70 §7.2). **Measured 2026-08-12:
  > `check-solver-is-real` EXISTS; the other two are UNBUILT** (§6).

  and — C75 Gate line, replace with:

  > **Gate**: `check-provenance-not-invented` · `check-provenance-coverage` ·
  > `check-derived-not-authored`. All three are **static source scans** and therefore live in
  > `tools/ga-gate/`, registered in `run-all.ts`, under the single exit-code implementation at
  > `tools/rac-conformance/certification/contract.ts` (C70 §7.2). **Measured 2026-08-12:
  > `check-provenance-not-invented` EXISTS; the other two are UNBUILT** (§6).

  and — C73 Gate line, append:

  > `check-epsilon-policy` and `check-predicate-canonical` are **static scans** →
  > `tools/ga-gate/`. `check-deterministic-regeneration` **regenerates a model and is therefore
  > EXECUTED** → `tools/rac-conformance/certification/gates/`. **Measured 2026-08-12:
  > `check-epsilon-policy` EXISTS in `tools/ga-gate/`; the other two are UNBUILT.**

  and — C71 §6, replace the sentence *"All three belong beside the BIM 3.0 certification gates at
  `tools/rac-conformance/certification/gates/`"* with:

  > `check-graph-write-coverage` and `check-graph-persistence` are **static scans** →
  > `tools/ga-gate/`. `check-graph-delete-integrity` **splits**: its static arms (a), (c), (d) go
  > to `tools/ga-gate/`; arm (b) — undo restores the purged edges, *proven by executed read-back
  > rather than by the presence of a restore call* — is an **EXECUTED** arm and belongs in
  > `tools/rac-conformance/certification/gates/`. **A gate may not carry both; the two halves are
  > two gates sharing one ledger, and the ledger names which arm owns each entry.**

---

**A-12 · C70 §7.1's "Measured 2026-08-12" statement is false at HEAD, in the direction of understatement.**

- **Contract · section**: C70 §7.1.
- **Problem**: §7.1 states *"**Measured 2026-08-12**: `check-identity-roundtrip`,
  `check-derived-regenerable` and `check-propagation-reaches` exist under
  `tools/rac-conformance/certification/gates/`; `check-collab-graph-integrity` exists under
  `tools/ga-gate/`; **the remaining rows in the table above have no file at HEAD**."* Measured for
  this review: `tools/ga-gate/check-epsilon-policy.ts` and
  `tools/ga-gate/check-provenance-not-invented.ts` both exist, both are rows in that table, and both
  are registered in `run-all.ts:227–228`. A third BIM 3.0 gate `check-solver-is-real.ts` exists and
  is not a row in the table at all.
- **Why it matters**: this is C70 §0.2's own hazard (a count restated in prose) firing on the same
  day the section was written, and it under-reports coverage — a reviewer reading §7.1 would
  conclude E-INV-2 and H-INV-1/2 are ungated when instruments for both are running in a
  merge-blocking job.
- **Exact amendment required** — C70 §7.1, replace the measured sentence with:

  > **Measured 2026-08-12 (and re-measurable with `find tools -name 'check-*.ts'`):**
  > `check-identity-roundtrip`, `check-derived-regenerable`, `check-propagation-reaches` and
  > `check-propagation-trackers-reach` exist under `tools/rac-conformance/certification/gates/`;
  > `check-collab-graph-integrity`, `check-epsilon-policy`, `check-provenance-not-invented` and
  > `check-solver-is-real` exist under `tools/ga-gate/`. **The remaining rows have no file at
  > HEAD.** This sentence rots; the command replaces it, and §0.2 applies to it as to every other
  > count in this contract.

---

**A-13 · A built certification gate is named by no contract section.**

- **Contract · section**: C72 §6 (specifies three gates, none of them this one) · C70 §7 (ten rows,
  none of them this one).
- **Problem**: `tools/rac-conformance/certification/gates/check-propagation-trackers-reach.ts`
  exists, is registered in `certify.ts:171`, is pinned in `gate-newly-measured.json`, and is the
  only **executed** propagation gate in the repository. C72 §6.1.2(d) states the hole it closes
  (*"UNPROVEN: no gate asserts that the bespoke trackers still reach their pairs"*) — and C72 was
  never updated when the gate landed. Its own header (lines 7–14) cites C72 §6.1.2(d) as its
  authority, so the gate cites a contract that does not cite it back.
- **Why it matters**: C72's §7 exit conditions enumerate what closes each gate. A gate outside that
  enumeration has no exit condition inside the contract suite, and its one declared finding (the
  `_computeWallSig` height/y divergence, `packages/room-topology/src/RoomTopologyObserver.ts:566–584`
  per `gate-newly-measured.json`) is a topology decision with no contractual home.
- **Exact amendment required** — C72 §6, insert as **§6.1b** and update the Gate line:

  > ### §6.1b — `check-propagation-trackers-reach` — EXISTS, EXECUTED
  >
  > `tools/rac-conformance/certification/gates/check-propagation-trackers-reach.ts`, ledger
  > `./tracker-pairs.json`, run by `certify.ts`. **Subject**: the four bespoke pairs §0.3 protects
  > — `DoorDependencyTracker`, `WindowDependencyTracker`, the `DeleteElementCommand`
  > §CASCADE-DELETE path, and `RoomTopologyObserver`. It closes §6.1.2(d) and it is EXECUTED
  > because the question *"does the registered listener still REACH its pair?"* is not answerable by
  > a scan: a tracker whose `subscribe()` is intact and whose `touch()` has been commented out
  > passes every grep ever written.
  >
  > | Check | Kind | What it asserts |
  > |---|---|---|
  > | **floors** | exit **2** | ≥8 pairs exercised; the positive control (an observed `touch` with no wall in the picture) must be seen, and every negative control must go red — a blind comparator exits 2, never 0 |
  > | **A1–A8** | finding | each pair reached, read back independently (C70 L-INV-4), including the HEIGHT-only and THICKNESS-only wall edits no other suite drives |
  > | **ledger** | exit **3** | `declaredFindings` named and shrink-only |
  >
  > **What it cannot see** is recorded in its own header and includes six of
  > `RoomTopologyObserver`'s seven suppression guards — see §4 and A-35.
  >
  > **§7 exit condition, added**: §6.1b exits when `tracker-pairs.json.declaredFindings` reaches 0
  > — which today requires deciding whether `_computeWallSig` must include wall height and baseline
  > `y`. **That decision belongs to this contract, not to the gate**, and until it is made
  > §6.1b's finding stands.

---

**A-14 · The exit-code contract has acquired a third absorption category, and C70 §5 does not know about it.**

- **Contract · section**: C70 §5.1 (the four-code table, "Absorbable as declared debt?" column) ·
  `tools/ga-gate/gate-newly-measured.json` · `run-all.ts` §NEWLY-MEASURED.
- **Problem**: `run-all.ts` now recognises **three** states for a failing gate — 🟡 KNOWN-DEBT
  (`gate-debt.json`), 🔵 **NEWLY-MEASURED** (`gate-newly-measured.json`), ❌ REGRESSION — and the
  third absorbs **exit 1 only**, with enforced `exitCondition` + `reviewBy` fields, a
  both-files-is-fatal check, and an expiry check. All four built BIM 3.0 gates are pinned there.
  C70 §5.1's table admits exactly one absorbing state ("**1** DECLARED-LEVEL … yes, by name,
  shrink-only") and C70 §5.4 speaks only of "the ledger".
- **Why it matters**: the distinction NEWLY-MEASURED draws is *exactly* C70's own doctrine —
  *"nobody looked"* must read differently from *"we accepted this"* (C70 §2.2, §8.k) — and it is
  currently doctrine implemented in a JSON `$comment` and a runner, with no contract behind it. If
  someone deletes the file, no contract is violated.
- **Exact amendment required** — C70, insert after §5.5:

  > **§5.5a — MUST. A gate that lands red on defects that PREDATE it is NEITHER a regression NOR
  > declared debt.** Filing it as a regression says the tree got worse on the day someone wrote a
  > scanner, which trains readers to treat red as noise. Filing it as declared debt backdates a
  > decision nobody made. Both are the §CONTEXT-DATA-HONESTY failure — two different facts printing
  > one value. A **first reading** is therefore recorded in its own ledger
  > (`tools/ga-gate/gate-newly-measured.json`), separate from the debt ledger, and it:
  >
  > 1. absorbs **exit 1 only** — exit 2 and exit 3 are never absorbable (§5.1) and are decided by
  >    the gate before this ledger is consulted;
  > 2. carries a **pinned reading, a named exit condition and a review date**, all three enforced
  >    at load; an entry lacking any of them is rejected, because a category with no exit is how
  >    "temporary" becomes permanent;
  > 3. may be added **only in the commit that introduces its gate** — a later addition is a
  >    regression or debt, and goes through the debt ledger's founder rule;
  > 4. may have its pinned reading **lowered only, never raised**, founder or not;
  > 5. is subject to §5.4 in both directions: an entry whose gate starts passing must leave the
  >    ledger in the commit that earns it.
  >
  > Turning an instrument **on** is not a decision to ship a defect and does not require the
  > founder. Moving an entry to the debt ledger, or extending its review date, **is** that decision
  > and does.

---

**A-15 · C74 §7 and C75 §7 name the wrong ledger file in their exit conditions.**

- **Contract · section**: C74 §7.4 (*"`check-no-hidden-mock`'s named baseline reaches 0, at which
  point it leaves `tools/ga-gate/gate-debt.json`"*) · C75 §7.6 (same wording for
  `check-provenance-coverage`).
- **Problem**: the two BIM 3.0 gates from these contracts that exist are pinned in
  `gate-newly-measured.json`, not `gate-debt.json`, and `run-all.ts` **hard-fails** any gate present
  in both. `grep -nE "epsilon|solver|provenance" tools/ga-gate/gate-debt.json` → no matches.
- **Why it matters**: an exit condition naming a file the gate must never be in is unsatisfiable as
  written, and following it literally would trip the both-files fatal check.
- **Exact amendment required** — C74 §7 item 4:

  > 4. `check-no-hidden-mock`'s named baseline reaches **0**, at which point it flips to hard-0 and
  >    its entry leaves **`tools/ga-gate/gate-newly-measured.json`** (C70 §5.5a) — or
  >    `gate-debt.json`, if the founder has by then explicitly chosen to live with a remaining
  >    entry. A gate may never be on both.

  and — C75 §7 item 6, the identical substitution for `check-provenance-coverage`.

---

**A-16 · Per-gate audit against the founder's seven criteria.**

Criteria: four exit codes · minimum-evidence floor · exit 2 on insufficient subject discovery ·
cannot lower its floor to become green · distinguishes declared debt from misconfiguration ·
negative tests · named shrink-only baseline.

| Gate (as specified in the contract) | 4 codes | floor stated | exit 2 on thin subject | floor-lowering forbidden | debt ≠ misconfig | negative test required | named shrink-only baseline | Gap |
|---|---|---|---|---|---|---|---|---|
| C71 `check-graph-write-coverage` | via C70 §5 | ✓ | ✓ | inherited only | ✓ | **✗ not required** | ✓ | negative control unstated |
| C71 `check-graph-delete-integrity` | via C70 §5 | ✓ | ✓ | inherited only | ✓ | **✗** | **✗ no ledger named** | no baseline; hard-0 target only |
| C71 `check-graph-persistence` | via C70 §5 | ✓ | ✓ | inherited only | ✓ | **✗** | ✓ | negative control unstated |
| C72 `check-propagation-reaches` | ✓ | ✓ (≥1500 files, ≥200 catalog entries) | ✓ | inherited | ✓ | **✗** | ✓ | negative control unstated; **built and running** |
| C72 `check-prevstate-contract` | via C70 §5 | ✓ (P0) | ✓ | ✓ (§6.2 closing note) | ✓ | **✗** | ✓ | negative control unstated |
| C72 `check-suppression-is-reversible` | via C70 §5 | ✓ (S0) | ✓ | inherited | ✓ | **✗** | ✓ (S3) | **floor is ≥1 against a subject of ≥15 — A-17** |
| C73 `check-epsilon-policy` | via C70 §5 | ✓ (E0) | ✓ | inherited | ✓ | **✗ in the contract** — the built gate does it anyway | ✓ (E2/E5) | **A-18**: §5.1 pins "267", a number §0.1 already retracted |
| C73 `check-predicate-canonical` | via C70 §5 | ✓ (C0) | ✓ | ✓ (§3.4) | ✓ | **✗** | ✓ (C1) — **for one family only, A-43** | four families unbaselined |
| C73 `check-deterministic-regeneration` | via C70 §5 | ✓ (D0) | ✓ | inherited | ✓ | **✗** | ✓ (D3) | negative control unstated |
| C74 `check-constraint-honesty` | via C70 §5 | ✓ (§6.1) | ✓ | inherited | ✓ | **✓ (§6.2)** | hard, none needed | **A-05** |
| C74 `check-solver-is-real` | via C70 §5 | ✓ | ✓ | inherited | ✓ | **✓** | hard | **built**; ledger is 4 named entries, contract says "hard" — see below |
| C74 `check-no-hidden-mock` | via C70 §5 | ✓ | ✓ | inherited | ✓ | **✓** | ✓ | **A-15** |
| C75 all three | via C70 §5 | ✓ (§6.1) | ✓ | inherited | ✓ | **✓ (§6.2)** | ✓ (§3.2) | **A-02** (H-INV-3), **A-25** |

**The systematic gap**: **C70 §5.6 requires every comparator to be watched go red, but only C74
§6.2 and C75 §6.2 restate it as a per-gate obligation. C71 §6, C72 §6 and C73 §5 do not.** In
practice the three built gates all run in-process controls anyway (`check-solver-is-real.ts:462`,
`check-provenance-not-invented.ts:435`, `check-epsilon-policy.ts:300`, each with a
`control.ok ? 1 : 0` **floor** so a blind comparator exits 2) — so the *practice* is uniformly
better than the *contract* in three of six contracts, which is exactly backwards.

- **Exact amendment required** — C70, insert after §5.6:

  > **§5.6a — MUST. The control is a FLOOR, not a finding.** A gate's negative control runs **on
  > every invocation**, inside the gate, over the same analyser and the same scanner as the real
  > run; a control that fails to fire counts against a floor, so a blind comparator exits **2** and
  > can never be absorbed. Where a clean subject exists it is asserted as a **positive** control in
  > the same run, and where none exists in the real tree the positive control is synthetic **and
  > says so**. A gate specification that does not name its controls is incomplete, and every gate
  > specification in [C71](C71-GRAPH-AND-TOPOLOGY.md) §6, [C72](C72-PROPAGATION-AND-PREVSTATE.md)
  > §6 and [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) §5 is amended by this section without
  > restating it.

---

**A-17 · `check-suppression-is-reversible`'s floor cannot detect the misconfiguration it exists for.**

- **Contract · section**: C72 §6.3, check **S0**: *"exit **2** — ≥1 suppression site discovered (a
  scan finding none is misconfigured, not clean)"*.
- **Problem**: measured for this review, production `.pause()` suppression sites number **≥15
  across ≥6 files** (`CommandManagerImpl.ts:597–598`, `BatchCoordinator.ts:1204–1206,1575,1585,1594`,
  `persistence-client/.../ProjectLoader.ts:280,298`, `apps/editor/.../ProjectLoader.ts:542,560`,
  `initPersistence.ts:362,366`, `performUndoRedo.ts:398–399`, `engineLauncher.ts:326`). A scan that
  resolved **one** of those fifteen — a broken glob, a wrong root, a regex that only matches
  `roomTopologyObserver` — meets S0 and reports "0 violations" over 1/15 of its subject. That is the
  empty-seed lie at 93 % rather than 100 %, which is harder to see, not easier.
- **Why it matters**: C70 §5.2's rule is that a comparator reporting zero **must report how many
  objects it compared**, and a floor of 1 makes that number meaningless.
- **Exact amendment required** — C72 §6.3, replace the S0 row:

  > | **S0** | exit **2** | suppression sites discovered ≥ **12** (measured 2026-08-12: ≥15 production `pause()`/marker sites across ≥6 files — `CommandManagerImpl`, `BatchCoordinator`, both `ProjectLoader` copies, `initPersistence`, `performUndoRedo`, `engineLauncher`), **and** ≥1 release path discovered, **and** the count is printed beside every verdict. A floor of 1 over a subject of fifteen is not a floor; it is a scan that cannot fail. |

---

**A-18 · C73 §5.1 pins a number C73 §0.1 has already retracted, in the same contract.**

- **Contract · section**: C73 §0.1 (the AMENDED block) vs C73 §5.1, arm **E2**.
- **Problem**: §0.1 states, in a same-day amendment, *"**The gate is now the authority for the
  number; this section is the authority for the ordering**"* and that 267 *"is NOT re-derivable
  from the recipe above"*. §5.1's E2 row then says *"pinned at the measured reading (**267 today**),
  shrink-only"*. The built gate reads **271 production keys / 279 sites**
  (`gate-newly-measured.json`, `check-epsilon-policy.firstReading`) and its header explicitly
  refuses to import 267 (`check-epsilon-policy.ts:48–57`).
- **Why it matters**: C70 §5.3/§8.f. A contract-stated baseline of 267 against a measured 271 is a
  **ratchet pinned four slots below its reading** — the exact "free slots" error C73 §3.4 was
  written to prevent, committed inside C73 itself.
- **Exact amendment required** — C73 §5.1, E2 row:

  > | **E2** | ratchet, **named** | count of tolerance literals declared **outside** the module, pinned **at the gate's own reproducible reading**, shrink-only, listed by `file:NAME → value` (§3.4). **This contract does not state the number** — §0.1: the gate prints its recipe and its histogram every run and is the authority; a baseline transcribed from prose is a baseline nobody can re-derive. |

---

**A-46 · The reference implementation of the R3 recipe does not use the single exit-code implementation.**

- **Contract · section**: C73 §0.3 / Gate line (`check-offset-implementations.ts` cited as *"the
  reference implementation of the recipe"*, C73 §3.1) · C70 §5.1 (*"a gate that implements its own
  [exit codes] is a contract violation"*).
- **Problem**: measured — `tools/ga-gate/check-offset-implementations.ts` hand-rolls
  `process.exit(1)` at lines 173–186 and does not import
  `tools/rac-conformance/certification/contract.ts`. It therefore has **no exit 2 and no exit 3**:
  a scan that read too few files, and a baseline exceeded, both surface as the same `1`. (Its
  `minFiles: 500` floor at line 127 is enforced inside `scanFiles`, so the floor exists — but the
  code it surfaces is UNPROVEN from this reading, and the contract's four-code guarantee does not
  hold for it either way.)
- **Why it matters**: C73 holds this gate up four separate times as the shape every predicate gate
  must copy. Copying it propagates a two-code gate into five more families.
- **Exact amendment required** — C73 §0.3, append to the numbered recipe:

  > 5. **…and it reports through the single exit-code implementation.** `check-offset-implementations.ts`
  >    predates that rule and hand-rolls `process.exit(1)`, so it cannot distinguish MISCONFIGURED
  >    from RATCHET EXCEEDED (C70 §5.1). **That is a defect in the reference, recorded here so it is
  >    not copied**: every gate built to this recipe imports `reportGate` from
  >    `tools/rac-conformance/certification/contract.ts`, and the reference is migrated to it before
  >    the next family is collapsed.

---

## §3 — "Document says it, gate cannot prove it"

Classification of every numbered MUST / MUST NOT clause. Legend:
**M** = machine-enforceable by a static gate · **R** = runtime-enforceable (a type, a branded value,
an assertion in production code) · **P** = executed-probe required · **H** = human/judgement ·
**U** = **currently unenforced** (no gate exists, none is specified, or the specified gate cannot
decide it).

The founder's rule — *a contract may not call something an invariant if nothing can falsify it* —
bites on every **H** and **U** row, and the individually-argued ones follow the tables.

### C70 (23 numbered clauses + 36 pillar invariants)

| Clause | Class | Note |
|---|---|---|
| §0.1 no claim from source-reading | **H** | a rule about how humans write claims; no artefact can check it |
| §0.2 no restated counts | **M** *(unbuilt)* | decidable — a doc-lint could diff prose numbers against gate output; **U today**, and **A-12/A-18 are it firing** |
| §1.2 no UI acknowledgement | **H** | |
| §1.3 removing the AI box costs no capability | **P** | **U** — see **A-19** |
| §2.1 no cross-pillar scoring | **H** | |
| §2.2 unmeasured = UNPROVEN | **M** *(unbuilt)* | report-shape check; **U** |
| §3.1 chain holds end to end | **P** | partially — see §5 |
| §3.2 no partial credit | **M** *(unbuilt)* | status derivation is machine-checkable; **U** |
| §3.3 no self-scoring link | **H** | **U** — see **A-21** |
| §3.4 unexecuted link = UNPROVEN | **M** *(unbuilt)* | **U** |
| §4.1 no level without an executed run | **H** | |
| §4.2 no level from machinery existing | **H** | |
| §4.3 a level is a ratchet subject | **M** *(unbuilt)* | **U** — no gate holds a ladder level |
| §5.1 four exit codes, one implementation | **M** | **enforceable and partly enforced**; `check-gate-subject-floors.ts` is the meta-gate, but whether it asserts the *import* is **UNPROVEN** (not read) — **A-46** shows at least one gate escapes |
| §5.2 minimum-evidence floor | **M** | enforced by `contract.ts:63–73` |
| §5.3 no floor lowering | **H** | reviewable only; a diff can show it, nothing can forbid it |
| §5.4 paid debt leaves the ledger | **M** | enforced, `contract.ts:74–82,97–104` |
| §5.5 ledgers name entries | **M** | enforced per gate |
| §5.6 comparator watched go red | **M** | enforced in the three built GG gates as a **floor**; **not required by C71/C72/C73** — **A-16** |
| §6.1 Definition of Done (8 items) | **P** | items 1, 2, 3, 8 have no harness at HEAD — **U** |
| §7.1 a named gate that does not exist is a named gap | **M** | `certify.ts:176–181` + `run-all.ts` inventory checks |
| §7.2 one suite | **M** | **contradicted at HEAD — A-11** |
| Pillars A/B/D/E/F/G/H/I (24 invariants) | **P** | gated in part; see §5 |
| Pillar C (4) | **P** | **U** — no C71 gate exists |
| Pillar J (3 — algorithmic reasoning) | **U** | **no gate is named for J anywhere in C70 §7** |
| Pillar K (3) | **P** | `check-collab-graph-integrity` exists; verdict UNPROVEN |
| Pillar L (4) | **M/P** | L-INV-2 enforced by `contract.ts`; L-INV-1/3/4 **U** |

### C71 (22 clauses)

| Clause | Class | Note |
|---|---|---|
| §0.1 no restated counts | **M** *(unbuilt)* | **U** |
| §1.1 an edge is retained, typed, updated, removed | **P** | **U** |
| §1.2 six semantics per REQUIRED family | **M** | specified in §6, **unbuilt** |
| §1.3 untyped enumeration is not a reader | **M** | in §6 asserts, unbuilt |
| §1.4 invalidation-on-move is required | **U** | §6.2(c) admits **no arm in any of the three gates** — **A-22** |
| §2.1 the REQUIRED nine | **M** | unbuilt; **A-06** |
| §2.2 the PARKED twelve | **M** | unbuilt; **A-06** |
| §2.3 parked ≠ gap | **H** | |
| §2.4 no deleting parked members | **M** | unbuilt |
| §2.5 unparking needs a named consumer | **M** | §6 assert (b), unbuilt |
| §2.6 the addition rule (four elements, one PR) | **M** | §6 assert (c), unbuilt |
| §3.1 `joinedTo` both directions with junction metadata | **M/P** | **U** — no writer exists |
| §3.2 no overloading `connectedTo` | **M** | unbuilt |
| §3.3 no near-miss name | **H** | |
| §3.4 stale-edge removal is part of the writer | **P** | **U** |
| §3.5 no `WallJunctionRecord.id` as a stored key | **M** | unbuilt |
| §3.7 C-INV-2 is UNPROVEN until `joinedTo` lands | **H** | correctly stated |
| §4.1 no merging the stores | **M** | unbuilt |
| §4.2 UBG is the canonical query vocabulary | **H** | **A-08** |
| §4.3 no cross-graph coverage inference | **M** | §6.1 requires each gate to name its graph; unbuilt |
| §4.4 a query refuses with a named reason | **R** | **U** — enforceable at the type level (a result union), no gate |
| §6.1/§6.2 gate scoping and blind spots | **H** | correctly stated |

### C72 (18 clauses)

| Clause | Class | Note |
|---|---|---|
| §1.1 both arms | **M** | **enforced** — `check-propagation-reaches`, 8 findings all declared |
| §1.2 no "wired" from a catalog entry | **H** | |
| §1.3 the detector is generous | **M** | enforced |
| §2.1 WIRED or DELETED, no third state | **M** | enforced via the ledger |
| §2.2 no building on the unwired cascade | **M** *(unbuilt)* | **U** |
| §2.3 `delete → []` is a finding | **M** *(unbuilt)* | **U** — no arm; C70 F-INV-2 depends on it |
| §2.4 bespoke trackers are protected | **P** | **enforced** by `check-propagation-trackers-reach` — which C72 does not name (**A-13**) |
| §3.1 diff-consuming stores emit `prevState` | **M** | §6.2 P1, **unbuilt** |
| §3.2 the notification type declares the field | **M** | §6.2, unbuilt |
| §3.3 no classifier whose only shipping branch is `no-prevState` | **M** | §6.2 P2, unbuilt |
| §3.4 the seam rule | **M** | §6.2 P3, unbuilt |
| §3.5 no reconstructing `prevState` | **M** | unbuilt |
| §4.1 reachable release path | **M** | §6.3 S1, unbuilt — **A-36** |
| §4.2 `try/finally` around a fallible pause | **M** | §6.3 S2, unbuilt — **A-36** |
| §4.3 no by-construction no-op release | **M** | §6.3 S1, unbuilt |
| §4.4 suppression is scoped and announced | **M** | §6.3 S3, unbuilt — **A-23** |
| §5.1 a whitelist handles what it names | **M** *(unbuilt)* | **U** — no gate specified for §5 at all |
| §5.2 no exported whitelist without a consumer | **M** *(unbuilt)* | **U** — same |

### C73 (19 clauses)

| Clause | Class | Note |
|---|---|---|
| §1.1 geometry is a pure function of model state | **P** | §5.3 D1, unbuilt |
| §1.2 forbidden inputs (clock, unseeded random, unstable sort, iteration order, renderer state) | **M + P** | §5.3 D2 covers *iteration order* only; clock / `Math.random` / unstable sort are **statically detectable and ungated** — **A-24** |
| §1.3 three-state derived classification | **P** | **enforced** — `check-derived-regenerable` exists |
| §1.4 REGENERABLE ≠ blessed | **H** | |
| §2.1 one declared tolerance module | **M** | **enforced** — E1, RED today |
| §2.2 predicates consume the declared tolerance | **M** | E3, **NOT EVALUATED** while E1 is red (`check-epsilon-policy.ts:432`) — honestly reported, still **U** |
| §2.3 unit-qualified names | **M** | **enforced** — E5 |
| §2.4 no per-call-site divide guard | **M** | §5.2 C3, **unbuilt** |
| §2.5 no widening | **M** | **enforced** — E4, negative-tested at 1e-9→1e-6 (`check-epsilon-policy.ts:333–345`) |
| §3.1 one implementation per family | **M** | §5.2 C1, unbuilt |
| §3.2 structural, not name-based, matching | **M** | unbuilt for 5 of 6 families |
| §3.3 exclusions named individually with reasons | **M** | enforced in the built gates (`check-epsilon-policy.ts:154`, `check-provenance-not-invented.ts:120`) |
| §3.4 baseline pinned at the reading | **M** | **violated by C73 itself — A-18** |
| §3.5 one family per PR | **H** | |
| §3.6 name the shipping consumer first | **H** | |
| §3.7 name the canonical behaviour where copies disagree | **H** | |
| §4.1 refuse, naming both numbers | **R** | **U** — no gate; §5.4(d) records refusal *reachability* as UNPROVEN |
| §4.3 no `[]`/`null`/`0` for "could not compute" | **M** *(unbuilt)* | **U** |
| §4.4 a refusal is user-legible | **H** | |

### C74 (21 clauses)

| Clause | Class | Note |
|---|---|---|
| §0.1 not a mandate to build a solver | **H** | |
| §1.1 four kinds | **H** | §6.3(c) — explicitly not machine-checkable; **A-01** |
| §1.2 SOLVING is reserved | **H** | |
| §1.3 classification written per family | **H** | |
| §2.1 no silent replacement of the four real components | **H** | |
| §2.2 the duplicated `StairValidationAuthority` | **M** *(unbuilt)* | **U** — a duplicate-count gate would decide it; none is specified |
| §3.1 no reported solve that did not happen | **M** | **enforced** — R1, `check-solver-is-real.ts` |
| §3.2 a stand-in announces itself | **M** | `check-constraint-honesty`, unbuilt |
| §3.3 no silent fallback | **M** | **enforced** — R2, and it found a second site (`AnthropicRelay.ts:loadRelay`) the contract never named |
| §3.4 a scaffold carries owner, date, gate | **M** *(unbuilt)* | **U** |
| §3.5 a substituted double is declared | **M** *(unbuilt)* | `check-no-hidden-mock`, **U** |
| §3.6 test count is not a health claim | **H** | |
| §3.7 dependency-free capability refuted | **M** | **enforced** — R1 manifest arm |
| §3.8 dead capability deleted or declared | **M** | **enforced** — R3 |
| §4.1 no solver on category grounds | **H** | |
| §4.2 three questions in order | **H** | |
| §4.3 truthfulness first, in a separate commit | **H** | a commit-shape rule; nothing can enforce it |
| §4.4 honesty not deferred | **H** | |
| §6.1 exit-2 floor per gate | **M** | **enforced** in the built gate (4 floors, `check-solver-is-real.ts:525–530`) |
| §6.2 negative-tested before trusted | **M** | **enforced as a floor** (`:529`) |

### C75 (17 clauses)

| Clause | Class | Note |
|---|---|---|
| §1.1 five values | **R** | **U** — the union does not exist in `packages/schemas` (C75 §0 Finding 2); the built gate discovers vocabularies rather than asserting this one |
| §1.2 COMPUTED and INFERRED never merged | **R** | **U** — same |
| §1.3 orthogonal to confidence | **H** | |
| §1.4 UNKNOWN is a value | **M** | partly — the gate's `UNKNOWN_MEMBERS` set (`check-provenance-not-invented.ts:147`) treats it as the correct default, but nothing asserts a vocabulary *has* one |
| §2.1 no stamping an unobserved origin | **M** | **enforced** — V1, 7 named findings |
| §2.2 a default is INFERRED and says so | **U** | **V2 NOT IMPLEMENTED**, declared as such (`:48–52`) |
| §2.3 repair records what it did | **M** | **enforced** — V3 |
| §2.4 provenance belongs in the schema package | **M** *(unbuilt)* | `check-provenance-coverage`, **U** |
| §2.5 backward-compatible optional field | **U** | **V4 NOT IMPLEMENTED**, declared |
| §2.6 no downstream widening | **M/H** | `check-derived-not-authored`, **U** |
| §2.7 regeneration carries what it replaced | **P** | **U** — §6.3(d): *"not verifiable statically"*; **no runtime probe is named** — **A-25** |
| §2.8 prefer unrepresentable | **H** | correctly framed; the built gate says so itself (`:29–35`) |
| §2.9 no restating ADR-0319 | **H** | **A-09** |
| §3.1 per-kind coverage | **M** | unbuilt |
| §3.2 shrink-only both directions | **M** | unbuilt |
| §6.1 exit-2 floor | **M** | **enforced** (4 floors, `:492–497`) |
| §6.2 negative-tested | **M** | **enforced as a floor** (`:496`) |

### The clauses that fail the founder's test individually

---

**A-19 · C70 §1.3's strongest claim has no falsifier and is stated as a proven property.**

- **Contract · section**: C70 §1.3.
- **Problem**: *"**Removing the AI box entirely must cost the system no capability except
  conversation.** Production deploys carrying no AI key while every generation engine still runs is
  **the standing proof of this posture**"*. That is a **MUST** whose evidence is a deployment
  configuration nobody measures in a gate, and the sentence calls it *proof*. It is also the only
  invariant for C70 pillar **J** (algorithmic reasoning), for which C70 §7's gate table has **no
  row at all**.
- **Why it matters**: pillar J is one of twelve and is the founder's zero-token principle (STR-05
  §4). An invariant with no falsifier, described as proven, is precisely what C70 §0 exists to make
  impossible — and here it appears in C70 §1.
- **Exact amendment required** — C70 §1.3, replace the final sentence with:

  > Production deploys carrying no AI key while every generation engine still runs is **consistent
  > with** this posture; it is **not proof of it**, because nothing measures which capabilities a
  > keyless deploy actually retains. **UNPROVEN**: pillar J has no gate row in §7 and no probe. The
  > falsifier is named here so the gap has a home — **`check-zero-llm-capability`**: an executed run
  > of the canonical fixture (§6.1) in a composed runtime with **no AI provider bound**, asserting
  > that every non-conversational golden operation reaches the same authoritative read-back as the
  > AI-bound run, with a floor of *operations executed ≥ 8* and exit **2** below it.

---

**A-20 · C70 §5.6 is enforced in the built gates and by no meta-gate; whether the meta-gate can see it is UNPROVEN.**

- **Contract · section**: C70 §5.6.
- **Problem**: §5.6 is a **MUST** over *"every comparator in the evidence set"*. The four built BIM
  3.0 gates each run their controls as a **floor**, which is the correct shape. Whether
  `tools/ga-gate/check-gate-subject-floors.ts` (the R5 meta-gate, `run-all.ts:230`) asserts the
  presence of a control in *other* gates is **UNPROVEN** — I did not read that file. What is
  certain from A-46 is that at least one gate C73 holds up as a reference has no `contract.ts`
  import at all, so a meta-gate that checks only floors would not catch it.
- **Exact amendment required** — C70 §5.6, append:

  > The obligation is **checked by a meta-gate over the gate suite**, not by each gate's author:
  > every registered `check-*.ts` in either home must import `reportGate` from
  > `tools/rac-conformance/certification/contract.ts` **and** declare at least one floor whose
  > subject is a control outcome. A gate that does neither is **MISCONFIGURED** and the meta-gate
  > exits 2, because a suite that cannot audit itself cannot be the authority on whether anything
  > else is honest.

---

**A-21 · C70 §3.3 forbids self-scoring and names no mechanism.** §3.3 is a **MUST NOT** (*"A link
may not be scored by the subsystem that owns it"*) with no gate, no report-shape rule and no owner.
It is **H/U**. **Exact amendment** — C70 §3.3, append: *"**The mechanism is structural, not
cultural: a link's status is derived by the certification harness from an independent read-back
artefact, and the harness refuses a status field it did not compute (§6.1 item 2 —
"statuses derived from axes, never hand-assigned"). A subsystem-supplied status field in a
certification artefact is a MISCONFIGURATION and exits 2.**"*

**A-22 · C71 §1.4 names invalidation as REQUIRED and §6.2(c) admits no gate covers it.** The
contract states both truths honestly, which is correct — but §1.2 lists invalidation as one of six
semantics *"without all six is not a capability"*, so every REQUIRED family is, by C71's own
definition, **not a capability**, permanently, with no gate scheduled. **Exact amendment** — C71
§6.2(c), replace *"and is the first thing to add"* with: *"**and is therefore a named gap with an
owner: `check-graph-write-coverage` gains arm (f) — mutation-update on MOVE per REQUIRED family,
proven by an EXECUTED read-back of the edge set before and after a move — in the same change that
lands `joinedTo` (§3.7). Until arm (f) exists, §1.2 semantic 5 is UNPROVEN for every family and no
REQUIRED family may be described as complete.**"*

**A-23 · C72 §4.4 requires suppression to be "scoped and announced" and defines neither.** There is
no declaration syntax, no location, and S3 (unbuilt) says only *"a flag with no declared scope is a
finding"* — which cannot be evaluated without a form. **Exact amendment** — C72 §4.4, append:
*"**A scope is DECLARED in the source, beside the flag, in a form a program can read: a
`@suppressionScope` tag naming one of `level` | `batch` | `load` | `drag` | `session`, plus the
release site's `file:line`. `session` is legal only with a founder-signed reason on the record. An
undeclared flag is a finding; an undeclared flag whose only scope is process lifetime is a
violation of this section, not a finding.**"*

**A-24 · C73 §1.2 forbids five inputs and gates one.** D2 covers iteration order. Wall-clock
reads, `Math.random` without a model-derived seed, and unstable sort are all statically detectable
in geometry paths and are ungated. **Exact amendment** — C73 §5.3, add a row:

> | **D4** | ratchet, **named** | non-deterministic inputs in any geometry-producing path: `Date.now`/`new Date`, `Math.random` without a model-derived seed, and `.sort()` with no comparator or with a comparator that can return 0 for distinct model keys (§1.2). Static, named, shrink-only. **D1/D2 cannot see these — they run once, on one machine, and a clock read is deterministic within a single run.** |

**A-25 · C75 §2.7 is unfalsifiable as specified and the contract says so without naming a
replacement.** §6.3(d) records *"cross-session regeneration — §2.7's prior-value chain is not
verifiable statically"*. §2.7 is a **MUST** and it is also the clause C75 calls *"the most expensive
form of this defect and the hardest to detect after the fact"*. **Exact amendment** — C75 §2.7,
append: *"**Statically this is unfalsifiable (§6.3d), so it is discharged by an EXECUTED probe, not
by `check-derived-not-authored`: `check-provenance-survives-regeneration` — author a value, run the
regeneration pass, read the record back independently, and assert REGENERATED plus the prior
provenance. Floor: elements regenerated ≥ 1 and prior provenance chains read ≥ 1; exit 2 below it.
It is an EXECUTED gate and lives in `tools/rac-conformance/certification/gates/`. Until it exists,
§2.7 is UNPROVEN and may not be cited as covered by any static arm.**"*

---

## §4 — Evidence vocabulary consistency

The vocabulary — EXECUTED · EXECUTED-CITED · BY-READ · UNPROVEN · MISCONFIGURED · DECLARED-LEVEL ·
RATCHET EXCEEDED — is used **consistently for the four machine terms**. `MISCONFIGURED`,
`DECLARED-LEVEL` and `RATCHET EXCEEDED` appear only as exit-code names and always with the same
meaning; `contract.ts` is their single definition and all six contracts defer to it. **UNPROVEN** is
used correctly and generously (C70 §2.2/§3.4, C71 §3.7/§5.8, C72 §6.1.2, C73 §5.4, C74 §4.5, C75
§3.3/§5) — this is the suite's strongest habit and it should be protected.

**EXECUTED vs BY-READ is where the leaks are.** Four sentences silently upgrade:

---

**A-26 · C73 §0.3 upgrades a green counting gate to a solved family.**

- **Contract · section**: C73 §0.3, closing paragraph.
- **Problem**: *"Result: **1 implementation across the whole tree** (baseline
  `MAX_IMPLEMENTATIONS = 0` non-canonical, **exit target met**), oracle-true at 300 mm with spread
  0.000."* The first clause is a **static count**; the second is an **executed oracle**; the
  sentence fuses them so the reader carries "offset is done" into §3.1, where offset is named *"the
  reference implementation of the recipe"*. C73 §5.4(a) says the opposite in its own words:
  *"counting gates are deliberately blind to correctness"*.
- **Why it matters**: this is the model every other family is told to copy, so the fused claim
  propagates. It is also the specific upgrade "green local gate → complete capability".
- **Exact amendment required** — C73 §0.3, replace the closing sentence with:

  > Result, stated as **two** findings because they are two: **(a) a static count** — 1
  > implementation across the whole tree, `MAX_IMPLEMENTATIONS = 0` non-canonical, exit target met;
  > **(b) an executed oracle** — the surviving implementation is oracle-true at a 300 mm eave with
  > spread 0.000. **(a) says nothing about correctness and (b) says nothing about duplication.** A
  > family is collapsed only when both hold, and citing either alone is the upgrade §5.4(a)
  > forbids.

---

**A-27 · C70 and C73 state the same exit target as two different numbers.**

- **Contract · section**: C70 §7 (`check-epsilon-policy` exit condition: *"the count gate reaches
  its declared **1**"*) vs C73 §0.3 / §5.2 (`MAX_IMPLEMENTATIONS = **0**` non-canonical; C1 ratchets
  the *non-canonical* count toward 0).
- **Problem**: "1" (one implementation, total) and "0" (zero non-canonical implementations) describe
  the same state, but the two numbers are not interchangeable in a ledger, and the built gate uses
  0 (`check-offset-implementations.ts:79`). A gate author reading C70 pins 1 and immediately has one
  free slot.
- **Exact amendment required** — C70 §7, `check-epsilon-policy` exit condition, replace *"the count
  gate reaches its declared 1"* with: *"the counting gate reaches **0 non-canonical implementations**
  — the ledger counts implementations **outside** the named canonical file, never the total, so the
  target is 0 and never 1"*.

---

**A-28 · C74 §2's "Evidence it is real" column is BY-READ presented as reachability.**

- **Contract · section**: C74 §2, the four-row table.
- **Problem**: the evidence cited is an import statement (`initDataPlatform.ts:50`), a
  `package.json` subpath mapping (`package.json:14`), a list of call sites, and a dispatch-path
  mention. Every one is source-reading. The column header says *"Evidence it is **real**"* and §2's
  lead sentence says *"**this repo already does real constraint work**"*. C74 §0's own five-incident
  list includes *"a headless suite whose subject was mocked"* and §5.h names the anti-pattern
  *"Auditing existence instead of reachability"* — which is exactly what this table does, in the
  contract that names the anti-pattern.
- **Why it matters**: C74 §2.1 then makes these four rows **protected** — no solver work may touch
  them — on the strength of unverified reachability. If one of the four is in fact unreached, the
  contract is protecting a corpse and forbidding the work that would find out.
- **Exact amendment required** — C74 §2, change the column header to **"Evidence, and its
  strength"**, and append to the section:

  > **§2.0 — the strength of the evidence in this table is BY-READ, and BY-READ is never an award
  > (C70 §0.1).** Each row cites an import, a manifest mapping or a call site: all four establish
  > that the code *exists and is referenced*, none establishes that it is *reached at runtime*. The
  > protection in §2.1 stands anyway — it protects against a *refactor*, and a refactor can break a
  > reached path and an unreached one equally. But **no row here may be cited as executed
  > evidence**, and the four rows are **UNPROVEN as to reachability** until an executed probe drives
  > a real mutation into each and reads the refusal or the advisory back.

---

**A-29 · C72 asserts the bespoke path "works" and, four sections later, records that nothing proves it.**

- **Contract · section**: C72 §0.3 vs §6.1.2(d).
- **Problem**: §0.3: *"Everything that propagates in PRYZM today is **bespoke per-pair wiring, and
  it works**"*. §6.1.2(d): *"**UNPROVEN**: no gate asserts that the bespoke trackers still reach
  their pairs."* Both were written the same day. The first is the sentence that justifies §2.4's
  **MUST NOT** protecting those trackers from refactor.
- **Why it matters**: this is UNPROVEN → assumed-true, inside the contract that owns the
  distinction. It has since been partly repaired *in code* — `check-propagation-trackers-reach`
  exists and its first reading is *"8 pairs exercised, 5/5 in-run controls proven, 1 finding"* — so
  the correct fix is now available and cheap.
- **Exact amendment required** — C72 §0.3, replace the first sentence with:

  > Everything that propagates in PRYZM today is **bespoke per-pair wiring**. Whether it *works* was
  > **UNPROVEN at this contract's stamp** and is now partially EXECUTED: `check-propagation-trackers-reach`
  > (§6.1b) drives all four pairs through real stores and real commands and reads the effect back
  > independently, with in-run positive and negative controls. Its **first reading carries one
  > finding** — `RoomTopologyObserver._computeWallSig` omits wall height and baseline `y` while both
  > dependency trackers treat them as geometry-changing — so "it works" is true of the pairs the
  > gate exercises and **UNPROVEN elsewhere**, including under collaboration merge and across
  > save/reload. §2.4's protection rests on the executed reading, not on the assertion.

---

## §5 — Golden Chain coverage

For each of the eleven links: does C71–C75 actually supply evidence that makes it executable, and
who operationally owns it?

| Link | Which contract supplies the evidence | Executable at HEAD? | Operational owner |
|---|---|---|---|
| **intent** | **none** | **No** | **NOBODY** — see A-30 |
| **command** | C03/C16 (outside this suite); `check-verb-liveness.ts` (CA-21) exists | Partly (EXECUTED, outside C70–C75) | C16 |
| **state** | C70 L-INV-4; no C7x gate | Partly — `check-identity-roundtrip` reads state back | C70, unassigned |
| **geometry** | C73 §5.3 D1/D2 | **No — unbuilt** | C73 |
| **topology** | C71 §6 — **all three gates static**, §5.8 admits *"no runtime probe has been executed against a live graph"* | **No** | C71 — **but with no composed-runtime probe, A-31** |
| **graph** | C70 D-INV-1/2/3; **no gate row in C70 §7 for the graph verbs** | **No** | **NOBODY** — A-30 |
| **propagation** | C72 §6.1 (static, exists) + §6.1b (executed, exists) | **Partly YES** — the strongest link in the suite | C72 |
| **persistence** | `check-identity-roundtrip`, `check-derived-regenerable` (both exist) | **YES** | C05/C47 + C70 §7 |
| **undo/redo** | `check-identity-roundtrip` B-INV-2; `certify.ts` undoredo suite | **YES** (12 declared FAILED rows) | C70 §7 |
| **collaboration** | C70 K-INV-1/2/3; `check-collab-graph-integrity` exists, no transport | **No — UNPROVEN by construction** (C70 §2.2) | C70/C08 |
| **report** | C70 L-INV-1/3; no gate | **No** | **NOBODY** — A-30 |

---

**A-30 · Three Golden Chain links are owned by C70 in the abstract and by nobody operationally.**

- **Contract · section**: C70 §3.1 table, links **intent**, **graph**, **report**.
- **Problem**: C70 §3.1 requires every capability to hold along the entire chain and §3.2 forbids
  partial credit. But:
  - **intent** — *"ambiguity **refuses**, never guesses"*. No contract in C70–C75 owns intent
    resolution; C67/C68 own chat reachability, which is a different question. No gate, no probe.
  - **graph** — *"the change is visible to graph queries"*. C70 §7's ten gate rows contain **no row
    for D-INV-1/2/3**. C71 §6 measures the SemanticGraph *vocabulary*, not the bus verbs, and C71
    §6.1 explicitly scopes its gates to SemanticGraph. **The three graph verbs are the award
    condition for maturity Level 5** (C70 §4) and nothing decides them.
  - **report** — *"the outcome … is stated truthfully; failure ≠ empty"*. C70 L-INV-1 is the rule;
    no gate row exists for pillar L except L-INV-2 (which `contract.ts` self-enforces).
- **Why it matters**: §3.2 says a capability missing a link is not BIM 3.0 complete. Three links
  are missing *at the level of ownership*, so no capability can complete the chain, and the
  no-partial-credit rule turns that into "nothing is BIM 3.0" — correct, but only legible if the
  three orphans are named.
- **Exact amendment required** — C70 §3, insert as §3.5:

  > **§3.5 — the three unowned links, named so they are not read as covered.** Measured
  > 2026-08-12, three links of §3.1 have **no gate row in §7 and no owning contract in the
  > C70–C75 suite**:
  >
  > | Link | Status | Named gap |
  > |---|---|---|
  > | **intent** | UNPROVEN | no contract owns intent→typed-command resolution or the ambiguity refusal. **`check-intent-refuses-ambiguity`** — an executed probe driving an ambiguous request and asserting a typed refusal naming the ambiguity, never a guess. |
  > | **graph** | UNPROVEN | D-INV-1/2/3 — the award condition for **Level 5** — are decided by nothing. **`check-graph-verbs-answer`** — executed, over the **composed runtime**: `graph.query` / `graph.neighbors` / `graph.path` answer the §D questions, refuse honestly, and two rebuilds from the same authoritative state yield identical snapshots. Floor: verbs exercised = 3 and snapshots compared ≥ 2; exit **2** below it. |
  > | **report** | UNPROVEN | L-INV-1/L-INV-3 have no gate. **`check-failure-is-not-empty`** — static, over production API return paths: no path returns `[]`/`null`/`0` on a failure branch. |
  >
  > Until these exist, **no capability may be scored as chain-complete**, and §3.2 is the reason —
  > not an oversight to be worked around.

---

**A-31 · Topology has no composed-runtime probe, and C71 rules out ever adding one under §6.**

- **Contract · section**: C71 §6 (all three gates are static source scans) · §5.8 · §6.2(a).
- **Problem**: C71 §5.8 states *"every claim in §5 is source-level; **no runtime probe has been
  executed against a live graph**, and the graph has no equivalent of the CA-21 read-back discipline
  that exists for verbs"*, and §6.2(a) makes it structural: *"**runtime reachability** — discovery
  is static, so a writer that exists but is never reached counts as present"*. So the contract
  correctly names the hole and then specifies three gates that all have it. C70's Golden Chain
  requires the topology link to be proven by read-back of authoritative state (L-INV-4); C71
  provides no artefact that can do that.
- **Why it matters**: C70 C-INV-1 requires *"≥1 production writer AND ≥1 typed production reader"* —
  a static claim — but the chain link requires *"affected relationships are written / updated /
  removed"*, which is a runtime claim. C71 satisfies the first and is specified so as to never
  satisfy the second.
- **Exact amendment required** — C71 §6, add a fourth gate beside `check-topology-survives`
  (A-04), and add to §6 the sentence:

  > **A fourth gate is EXECUTED and is the reason the other three may stay static.**
  > **`check-graph-writes-at-runtime`** — in a composed headless runtime, dispatch one creating verb
  > and one mutating verb per REQUIRED family, then **read the SemanticGraph back independently**
  > and assert the edge set changed by exactly the predicted set and nothing else, with the
  > pre-mutation edge set as the oracle. **Floor**: families exercised ≥ the count of REQUIRED
  > families, and edges compared > 0; a run that dispatched nothing exits **2**. This is the graph's
  > CA-21, and §5.8's standing UNPROVEN closes only when it exists — **the three static gates
  > cannot close it and must not be read as doing so**.

---

**A-32 · Provenance is not shown to survive persistence, regeneration, or export — and one of the three is recorded as the contract's largest risk without a gate.**

- **Contract · section**: C75 §5 (third bullet), §6, §7.7.
- **Problem**: taken in order — **persistence**: no C75 gate asserts a provenance field round-trips
  a save/reload; §2.5 requires backward-compatible parsing and its arm (V4) is **NOT IMPLEMENTED**
  (`check-provenance-not-invented.ts:48–52`). **Regeneration**: §2.7 is statically unfalsifiable
  (A-25). **Export**: §5 says *"**UNPROVEN** — no such mapping exists at stamp time, and this is the
  largest open risk in the contract: provenance that stops at the export boundary protects nothing
  downstream"*, and §7.7 offers the alternative of *"its absence is recorded as an accepted
  limitation by name"*. So the contract's own largest risk may be discharged by writing it down.
- **Why it matters**: C70 §6.1 item 7 makes element-grain provenance a **Definition of Done**
  condition, and C70 §6.1 says nothing on that list *"can be satisfied by a document — including
  this one"*. C75 §7.7 offers exactly that discharge.
- **Exact amendment required** — C75 §7 item 7, replace with:

  > 7. The export mapping in §5 **exists** and is asserted by an executed round-trip: an element
  >    carrying each of the five provenance values is exported and re-imported, and the value
  >    survives or the export **refuses**. **Recording the absence as an accepted limitation does
  >    NOT discharge this item** — C70 §6.1 forbids satisfying a Definition-of-Done condition with a
  >    document, and provenance that stops at the export boundary is the failure mode §0.1 names:
  >    *"how a generated guess ends up in an IFC export as a surveyed fact."* A named limitation is
  >    the honest way to record the gap; it is not the way to close it.

---

## §6 — The C71 → C72 → C73 seam

**The founder's question**: *can a relationship be correctly declared by C71, correctly propagated
by C72, and still recomputed DIFFERENTLY depending on order or tolerance under C73?*

**Answer: YES, and neither order nor tolerance is bound by any of the three.** The two failures are
independent and both are live.

**Failure 1 — ORDER.** C72's subject is *reaching* the dependent (§1.1 arms A and B). Nothing in
C72 constrains the **sequence** in which multiple dependents are reached, and C72 §0.3's protected
mechanism is a set of independent per-pair trackers with no declared ordering between them. C73 §1.1
requires geometry to be a pure function of *authoritative model state* and §1.2 forbids dependence
on *iteration order over a hash-keyed container* — but a cascade's dependent order is neither model
state nor container iteration order: it is the order the propagation layer chose. C73 §5.3 **D2**
shuffles *model iteration order*, not *cascade order*. So: wall W is joined to walls A and B; a move
of W reaches A then B on one run and B then A on another (different tracker registration order,
different batch flush order); each recompute is individually deterministic; the resulting geometry
differs. **Every arm of every specified gate passes.**

**Failure 2 — TOLERANCE.** C71 §1.2 semantic 5 requires an edge to be *preserved, updated, or
removed-and-re-emitted* on a move. Whether a junction is preserved or re-emitted is decided by a
coincidence test — and C73 §0.1 measures **271 rival tolerance declarations spanning three orders of
magnitude** with no declared policy. The same declared `joinedTo` edge, correctly propagated, can be
re-detected as present under `0.001 m` and absent under `0.05 m`. C71 does not name the tolerance
its invalidation semantic depends on; C73 does not know that a relationship's *existence* is one of
the things its epsilon decides.

**Do the two contracts jointly cover the chain?** No — they cover **adjacent pieces**. C72 ends at
"the dependent was reached with `prevState`". C73 begins at "given inputs, the output is
reproducible". Between them sits *"the recompute produced the same relationship the declaration
asserts"*, and no contract owns it.

---

**A-33 · The missing invariant: cascade order is unconstrained and undetectable.**

- **Contract · section**: C72 (no section) · C73 §1.2, §5.3 D2.
- **Exact amendment required** — C72, insert as §3.6:

  > **§3.6 — MUST. Propagation order is deterministic, or the propagation is not deterministic.**
  > Where one mutation reaches **more than one** dependent, the order is a **declared function of
  > stable model keys** — never registration order, never insertion order, never batch-flush
  > arrival. A cascade whose dependents are reached in a different order on two runs of the same
  > mutation produces geometry that is individually deterministic and **collectively
  > irreproducible**, which is the C73 §1.1 violation that no C73 arm can see: C73 §5.3 **D2**
  > shuffles model iteration order, not cascade order, and the two are different things.
  >
  > `check-propagation-trackers-reach` (§6.1b) gains arm **A9**: drive the same multi-dependent
  > mutation twice with the trackers registered in **reversed** order and assert the recorded
  > touch sequence is **identical**. A differing sequence is a finding even when every individual
  > recompute is correct.

  and — C73 §1.2, append to the forbidden-input list:

  > …or **the order in which a change propagation reached this element** — which is
  > [C72](C72-PROPAGATION-AND-PREVSTATE.md) §3.6's subject and is **invisible to D2**, because D2
  > shuffles model iteration order inside one regeneration and says nothing about the sequence of
  > separate recomputes.

---

**A-34 · Nothing owns "the recomputed relationship equals the declared one".**

- **Contract · section**: the C71/C72/C73 seam (A-10).
- **Problem**: C71 declares the edge and its invalidation semantic; C72 delivers the change; C73
  makes the recompute reproducible. **No contract asserts the recompute agrees with the
  declaration** — that after a move, the `joinedTo` edge C71 says must be *updated* is in fact the
  same edge, under the same identity, as the one the resolver now computes. C71 §3.5's own rule
  (junction ids renumber when walls move; the stored identity is the wall-id pair plus junction
  type) shows the two can diverge without either side being wrong in isolation.
- **Exact amendment required** — C71, insert as §1.5:

  > **§1.5 — MUST. The seam invariant: a recomputed relationship equals the declared one, or it is
  > a refusal.** After a mutation that [C72](C72-PROPAGATION-AND-PREVSTATE.md) has delivered and
  > [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) has recomputed, the relationship set read back
  > from the SemanticGraph **equals** the set semantic 5 of §1.2 predicts — preserved edges
  > preserved, updated edges updated **under their stored identity** (§3.5), removed edges removed —
  > with `prevState` as the oracle. A divergence is a **finding**, never a silent
  > re-detection.
  >
  > **This invariant belongs to no single one of the three contracts and is therefore stated
  > here, at the declaring end**: C72 owns *reaching*, C73 owns *reproducibility of the recompute*,
  > and neither owns *agreement between the recompute and the declaration*. It is asserted by
  > `check-graph-writes-at-runtime` (§6) as an EXECUTED read-back, and the **tolerance the
  > invalidation decision consumes is the declared model-space coincidence tolerance of C73 §2.1 —
  > never a local literal**, because a relationship whose existence depends on which private
  > epsilon the call site chose is not a declared relationship.

---

## §7 — C72 suppression / failure safety

Pattern under test: `pause → fallible operation → resume`.

| Requirement | C72's coverage | Verdict |
|---|---|---|
| explicit scope | §4.4 — stated, **no form defined** (A-23) | describes only |
| reachable release | §4.1/§4.3 — stated; S1 **unbuilt** | describes only |
| `try/finally` where appropriate | §4.2 — stated; S2 **unbuilt** | describes only |
| no permanent session-level dead state | §4.1 (*"stays frozen for the session"*) — stated, no mechanism | describes only |
| an EXECUTED test of the failure path | **absent from C72 entirely** | **A-38** |

**Both live facts verified against the contract text and both are accurate.**
`clearGraphAuthoritative` — `packages/room-topology/src/RoomTopologyObserver.ts:110`, 1 definition,
**0 production callers**, 1 test caller. `apps/editor/src/engine/initPersistence.ts:362` pauses
`roomTopologyObserver` and `syncStateEngine`, resumes at `:372`/`:376`, **no `finally`**.

**Does C72 DESCRIBE or ENFORCE?** It **describes**. `check-suppression-is-reversible` is
**SPECIFIED, NOT BUILT** (§6.3) and confirmed absent at HEAD. Every rule in §4 is currently
unenforced.

---

**A-35 · C72 §4 states the size of its own subject as "two places". Measured, it is at least fifteen.**

- **Contract · section**: C72 §4, opening sentence.
- **Problem**: *"Propagation is switched off in **two places** in this repository, and both
  switch-offs outlive their reason."* Measured for this review (production only, tests excluded):
  `packages/command-registry/src/CommandManagerImpl.ts:597–598` · 
  `packages/core-app-model/src/batch/BatchCoordinator.ts:1204–1206,1575,1585,1594` ·
  `packages/persistence-client/src/loader/ProjectLoader.ts:280,298` ·
  `apps/editor/src/engine/persistence/ProjectLoader.ts:542,560` ·
  `apps/editor/src/engine/initPersistence.ts:362,366` ·
  `apps/editor/src/engine/undo/performUndoRedo.ts:398–399` ·
  `apps/editor/src/engine/engineLauncher.ts:326`. That is **≥15 call sites across ≥6 files** — and
  it excludes the marker-style suppression (`_graphAuthoritativeLevels`) and the seven guards
  `check-propagation-trackers-reach`'s header enumerates inside `RoomTopologyObserver` alone
  (*"`isBatching`, graph-authoritative, building-generation, drag-in-flight, placement-mode and the
  post-batch cooldown are NOT exercised"*).
- **Why it matters**: three consequences, each independently serious. **(i)** §4's two named
  defects read as *the* defects, so the other thirteen sites were never audited. **(ii)** S0's floor
  of 1 (A-17) cannot detect a scan that finds one of fifteen. **(iii)** it is a **restated count in
  prose** — C70 §0.2 / §8.c — that was wrong by an order of magnitude on the day it was written.
- **Exact amendment required** — C72 §4, replace the opening sentence with:

  > Propagation is switched off in **many** places in this repository — measured 2026-08-12,
  > **≥15 production `pause()` call sites across ≥6 files** (`CommandManagerImpl`,
  > `BatchCoordinator`, both `ProjectLoader` copies, `initPersistence`, `performUndoRedo`,
  > `engineLauncher`), plus marker-style suppression such as
  > `RoomTopologyObserver._graphAuthoritativeLevels` and the **seven** independent guards inside
  > `RoomTopologyObserver` alone. **This count is not the authority — `check-suppression-is-reversible`
  > (§6.3) is, and it prints its own recipe (C70 §0.2).** Two of the sites are named below because
  > they are the measured failures, **not because they are the population**: naming two and
  > ratcheting over two is how a fifteen-site subject acquires a floor of one.

---

**A-36 · §4's rules have no enforcement and no owner-with-a-date.**

- **Contract · section**: C72 §4.1–§4.4, §6.3, §7.
- **Problem**: all four rules depend on `check-suppression-is-reversible`, which is unbuilt. C72 §7
  gives its exit condition but no owner and no review date — unlike the built gates, which carry an
  enforced `reviewBy` (`gate-newly-measured.json`). An unbuilt gate has no expiry at all, so it is
  strictly weaker than a red one.
- **Exact amendment required** — C72 §6.3, prepend to the section:

  > **SPECIFIED, NOT BUILT — and an unbuilt gate has no expiry, which makes it weaker than a red
  > one.** This gate is therefore **due, with a date**: it lands by **2026-11-12**, the same review
  > horizon as the BIM 3.0 Phase 1 gates, or its absence is re-argued in writing on that date. It is
  > a **static scan** and lives in `tools/ga-gate/` (C70 §7.2). Until it exists, §4.1–§4.4 are
  > **UNPROVEN as enforcement** and may not be cited as coverage — §4's rules are true and unchecked,
  > which is the state C70 §0 catalogues.

---

**A-37 · C72 §4.2 names the violation and not the working shape, breaking the suite's own copy-this discipline.**

- **Contract · section**: C72 §4.2.
- **Problem**: §4.2 names `initPersistence.ts:362` as the failure and stops. Two correct
  implementations of the same pattern exist in the tree and are not cited:
  `apps/editor/src/engine/undo/performUndoRedo.ts:393–406` (`_withPausedObservers` — pause,
  `try { body() } finally { resumeAndFlush(); resume(); }`, each release individually
  `try`-wrapped so one failure cannot strand the other) and
  `packages/persistence-client/src/loader/ProjectLoader.ts:280,298` (pauses, releases in a
  `finally`). C73 §4.2 and C71 §5.6 both do this correctly — *"the reference shape"*, *"the working
  precedents, to be copied rather than reinvented"* — so C72 is the outlier.
- **Why it matters**: §4.2 tells an engineer what not to do and leaves them to invent the fix. It
  also hides the fact that the repository already got this right twice, which changes the size of
  the remediation from "design a pattern" to "apply an existing one".
- **Exact amendment required** — C72 §4.2, append:

  > **The working precedents, to be copied rather than reinvented:**
  > `apps/editor/src/engine/undo/performUndoRedo.ts:393–406` — `_withPausedObservers` pauses both
  > observers, runs the body inside `try`, and releases inside `finally` with **each release
  > separately `try`-wrapped**, so a throwing `resumeAndFlush()` cannot strand `topology.resume()`.
  > That last detail is the part most likely to be dropped on a re-implementation, and it is the
  > difference between one degraded subsystem and two.
  > `packages/persistence-client/src/loader/ProjectLoader.ts:280,298` is the same shape at the load
  > boundary — which is what makes `initPersistence.ts:362` a **wrapper around a correct
  > implementation that reintroduces the defect it avoids.**

---

**A-38 · Nothing in C72 requires an EXECUTED test of the failure path.**

- **Contract · section**: C72 §3.4 (the seam rule) · §4 (no equivalent) · §6.3.
- **Problem**: §3.4 is the suite's sharpest test rule — *"a propagation test whose fixture supplies
  the very value under test proves nothing… drive the real mutation entry point and observe what
  the real subscriber received"* — and it is scoped to `prevState` only. §4's failure mode is a
  **throw inside a paused window**, and it has no test requirement at all. S2 (unbuilt) is a static
  `try/finally` shape check, which a `finally` that itself throws would satisfy.
- **Why it matters**: §4.2's stated consequence is *"topology observation and sync-state recompute
  off for the remainder of the session, silently, with the project loaded and looking fine"* — a
  defect that produces no error and no crash. A static shape check cannot see whether the release
  actually ran.
- **Exact amendment required** — C72 §4, insert as §4.5:

  > **§4.5 — MUST. The failure path is EXECUTED, not inspected.** For every pause/resume pair
  > spanning a fallible call, a test **throws from inside the paused window** and then asserts,
  > by independent read-back, that the suppressed subsystem is **live again** — not that a
  > `finally` block is present in the source. §3.4's rule applies unchanged: a test that calls
  > `resume()` itself proves nothing about the seam. A `finally` whose own release throws satisfies
  > every static check and fails this one, which is the whole reason it is written as an executed
  > obligation. `check-suppression-is-reversible` gains arm **S4**: *a named, shrink-only ledger of
  > pause/resume pairs with no executed throw-path test*.

---

## §8 — C73 tolerance policy completeness

| Axis | C73's coverage | Verdict |
|---|---|---|
| **ownership** | §2.1 — one module, exported from `packages/geometry-kernel` | ✅ complete |
| **units** | §2.3 — unit-qualified in the name; E5 ratchets | ✅ complete |
| **numeric-zero epsilon** | §2.1, named explicitly, dimensionless | ✅ |
| **coincidence** | §2.1, metres | ✅ |
| **parallelism / collinearity** | §2.1, radians or normalised dot | ✅ |
| **domain-specific** | §2.1 — excluded by name, stays with the domain owner | ⚠ **A-08c** — no rule for adding a third |
| **unit conversion** | **absent** | ❌ **A-41** |
| **immutability** | §2.5 forbids *widening*; nothing forbids *narrowing at runtime*, per-call override, or parameterisation | ⚠ partial — the gate's own header records *"tolerances computed at runtime, or passed in as parameters"* as invisible (`check-epsilon-policy.ts:107–109`) |
| **per-project variance** | **absent** | ❌ **A-41** |
| **versioning** | **absent** | ❌ **A-41** |
| **does a tolerance change invalidate persisted geometry?** | **absent** | ❌ **A-39** |
| **is tolerance part of deterministic regeneration identity?** | **absent — and the founder's directive says it is** | ❌ **A-39 / A-40** |

### The founder's precise question

> *If the same authoritative model produces different geometry because the configured tolerance
> changed, is that a C73 violation, a new model version, an allowed configuration change, or
> CURRENTLY UNDEFINED?*

**CURRENTLY UNDEFINED.** The three candidate answers each have a foothold and none is decided:

- **Not a violation**, on C73 §1.1's text: geometry must be a pure function of *authoritative model
  state*, and a tolerance constant is **not model state** — it is a code constant. §1.2's forbidden-input
  list does not mention tolerance. So a tolerance change producing different geometry is outside
  §1.1's scope as written.
- **Arguably a violation**, on §2.5: *"a tolerance may not be widened to make a test, a gate, or a
  user-visible artefact pass"* — but that forbids a **motive**, not the **effect**, and it forbids
  only widening. A narrowing that changes geometry is unaddressed, and E4 is explicitly one-directional
  (`check-epsilon-policy.ts:269–287`).
- **Not a version change**: C73 cites C05/C47 as owning the snapshot round-trip but never says a
  tolerance change touches file-format versioning. Nothing invalidates a persisted geometry cache.

And the decisive evidence that it must not stay undefined — **A-40**: the founder's own directive
(`STR-05` §3 pillar E) puts tolerance policy **inside** the determinism identity: *"same
authoritative state + parameters + algorithm + **tolerance policy** ⇒ deterministic geometry."*
C73 §1.1 renders this as *"a pure function of authoritative model state"* and **drops the tolerance
policy term**. Under STR-05's own reading rule (*"this file is the intent and the derived document
is the interpretation… a disagreement between the two is a finding to raise"*), that is a finding
to raise — and it is this one.

---

**A-39 · Write the definition. Exact wording.**

- **Contract · section**: C73 §1 (insert as §1.5) and §2 (insert as §2.6).
- **Exact amendment required** — C73, insert as **§1.5**:

  > **§1.5 — MUST. The tolerance policy is part of the regeneration identity.** Geometry is a
  > deterministic consequence of **the authoritative model state *and* the declared tolerance
  > policy at the version that produced it** — the founder's own formulation in `STR-05` §3 pillar E
  > (*"same authoritative state + parameters + algorithm + tolerance policy ⇒ deterministic
  > geometry"*), which §1.1 states without the fourth term. §1.1 is read subject to this section.
  >
  > It follows that **the same authoritative model producing different geometry because the
  > configured tolerance changed is NOT a §1.1 violation. It is a change of the regeneration
  > identity**, and it is governed as follows:
  >
  > | | |
  > |---|---|
  > | **The tolerance module carries a `TOLERANCE_POLICY_VERSION`** | a monotonic integer, incremented in the same commit as **any** change to **any** declared value — a narrowing as well as a widening, because §2.5 forbids a *motive* and this section governs an *effect*. |
  > | **The version is written into the snapshot** | as a scalar on the geometry slice, governed by C05/C47 like any other persisted field. |
  > | **A load whose snapshot version ≠ HEAD's version REPORTS the difference by name** | *"this project's geometry was produced under tolerance policy vN; this build is vM"* — naming **both numbers**, per §4.1. It does **not** silently regenerate, and it does **not** silently keep the old geometry. |
  > | **A tolerance change does NOT invalidate persisted geometry** | authored state is never discarded to satisfy a code constant. The consequence is a **declared regeneration divergence**, surfaced under §4, not a migration. |
  > | **A tolerance change is a REVIEWED change, never a configuration knob** | there is no per-project, per-user or per-environment tolerance. Two projects that disagree about "the same place" are two products. |
  >
  > **A tolerance value that cannot be traced to a policy version is a §2.1 violation**, because a
  > determinism identity nobody can name is not an identity.

  and — C73, insert as **§2.6**:

  > **§2.6 — MUST. A tolerance is immutable at runtime and is not a parameter.** A declared
  > tolerance is a module constant: it is not read from configuration, not computed at startup, not
  > passed as an argument, and not overridden per call. `check-epsilon-policy`'s header already
  > records that *"tolerances computed at runtime, or passed in as parameters"* are invisible to it —
  > so this rule closes by construction what the gate cannot see. **A predicate that accepts a
  > tolerance argument accepts a private definition of "the same place" from its caller**, which is
  > §0.1's defect with an extra step. Where a genuinely domain-specific band is required it is a
  > domain constant under its domain owner (§2.1), named in that domain's contract — never an
  > epsilon parameter.
  >
  > **Unit conversion**: a tolerance is declared in exactly one unit, stated in its name (§2.3), and
  > **is never converted**. A millimetre tolerance is a separate declaration from a metre tolerance,
  > not the same one scaled; a conversion at a call site is a new private definition and is an E2
  > finding.

- **Why it matters**: without §1.5, C73's central claim (§1.1) is silently narrower than the
  founder's, and the one question a user will actually ask after a tolerance edit — *"is my saved
  model still the same building?"* — has no answer in any contract. Without §2.6, E2 can reach 0
  while every predicate takes an `eps` argument and the policy means nothing.

---

**A-41 · Three tolerance axes are absent and are not recorded as absent.** Unit conversion,
per-project variance, and versioning appear nowhere in C73, and §5.4's "what these gates CANNOT
see" list does not name them either — so their absence is inferred from silence, which C75 §5
explicitly calls out as the thing not to do. **A-39's §1.5 and §2.6 close all three**; this finding
exists so the coordinator can see that the gap was *invisible*, not merely open.

---

## §9 — C73 predicate canonicalisation

| Family (C73 §3.1) | One canonical impl? | Shipping path identified? | Oracle fixture? | Baseline pinned? |
|---|---|---|---|---|
| **polygon offset** *(done)* | ✅ `packages/geometry-kernel/src/pure/polygonOffset.ts`, named in the gate (`check-offset-implementations.ts:82`) | ✅ (§0.3 — the defect *was* that it had not been) | ✅ 300 mm eave, spread 0.000 | ✅ `MAX_IMPLEMENTATIONS = 0` |
| **point-in-polygon** | ❌ **no canonical file named** — §0.2 records *"2 rival 'shared' implementations with 3 consumers between them"* and names neither as canonical | ❌ **not identified** | ❌ | ⚠ **61**, stated in C73 §5.2 C1 — see A-43 |
| **segment/segment intersection** | ❌ none named | ❌ | ❌ | ❌ **no reading at all** |
| **polygon area & winding** | ❌ none named | ❌ | ❌ | ❌ |
| **point-to-segment distance** | ❌ none named | ❌ | ❌ | ❌ |
| **polygon containment / overlap** | ❌ none named | ❌ | ❌ | ❌ |

**Structural vs name-based**: ✅ — C73 §3.2 is unambiguous (*"the gate matches on **structure**, not
on names"*), §0.3 step 2 explains why, and §7.e names the anti-pattern. The one built exemplar
matches structurally.
**Exclusions named individually**: ✅ — §3.3, and both built scanning gates do it with reasons
(`check-epsilon-policy.ts:154–157`, `check-provenance-not-invented.ts:120–125`).
**Baseline shrink-only**: ✅ as a rule (§3.4) — but see **A-18** and **A-43**.
**Discovery floor**: ✅ — §5.2 C0.
**Cross-machine determinism**: ❌ **UNPROVEN, undecided** — A-44.
**GPU explicitly out of scope**: ⚠ stated as UNPROVEN, not as out of scope — A-44.

---

**A-42 · Five of six families have no canonical file, no shipping path and no oracle — while C73 §3.6 makes identifying the shipping path a precondition.**

- **Contract · section**: C73 §3.1, §3.6, §5.2.
- **Problem**: §3.6 is a **MUST**: *"Before a family is collapsed, the **shipping consumer is
  identified by name**"*, and §0.3 step 1 requires *"**One canonical file**, named in the gate"*.
  For five of the six families C73 names neither. For point-in-polygon it goes further and records
  that **two** candidate canonical files exist (*"2 rival 'shared' point-in-polygon implementations
  with 3 consumers between them. Both were written to end the duplication. Neither did."*) without
  choosing between them — so the family with 61 bodies has **two rival canonical candidates and no
  ruling**.
- **Why it matters**: §3.5 forbids a mass refactor and §3.7 requires the collapse to state which
  behaviour is canonical. With no canonical file named, a family cannot be started at all under
  §3.6, so C73 §6's exit condition (*"every family in §3.1 reads 0 non-canonical implementations"*)
  is currently unstartable for five families and ambiguous for the sixth.
- **Exact amendment required** — C73 §3, insert as §3.8:

  > **§3.8 — MUST. A family is not in scope until its canonical file and its shipping consumer are
  > NAMED here.** §3.1 lists families by measured duplication; that is a *queue*, not a scope. A
  > family enters scope when this section records **(a)** its canonical file path, **(b)** its
  > shipping consumer by name, **(c)** its oracle fixture and the known answer it asserts, and
  > **(d)** its measured non-canonical count. Until all four are recorded the family has **no
  > baseline and no exit condition**, and `check-predicate-canonical` reports it as **UNPROVEN**
  > rather than as 0.
  >
  > | Family | Canonical file | Shipping consumer | Oracle | Measured count |
  > |---|---|---|---|---|
  > | polygon offset | `packages/geometry-kernel/src/pure/polygonOffset.ts` | recorded in `check-offset-implementations.ts` | 300 mm eave, spread 0.000 | 0 non-canonical |
  > | point-in-polygon | **UNDECIDED — two rival "shared" implementations exist (§0.2) and neither has been chosen. Choosing one is a §3.7 ruling and is the first step of this family, before any collapse.** | UNPROVEN | UNPROVEN | ~61 bodies / 56 files (§0.2), superseded by the gate on the day it exists |
  > | segment/segment intersection · polygon area & winding · point-to-segment distance · polygon containment/overlap | UNPROVEN | UNPROVEN | UNPROVEN | **UNPROVEN — never measured** |

---

**A-43 · §3.4 requires baselines pinned at the measured reading; five of six families have no reading, and the one stated reading is stated in prose.**

- **Contract · section**: C73 §3.4, §5.2 C1.
- **Problem**: C1 says *"non-canonical implementation count, pinned at the measured reading
  (point-in-polygon: **61**), shrink-only"*. That is (a) the only family with a number, (b) a number
  §0.2 itself flags as unstable (*"A prior audit reported 42. That number was a floor, not a
  ceiling"* and §7.k *"twice now it has come in low"*), and (c) a **count transcribed into prose**,
  which is the identical defect A-18 finds in E2 and which C73 §0.1 already corrected once.
- **Exact amendment required** — C73 §5.2, C1 row:

  > | **C1** | ratchet, **named**, per family | non-canonical implementation count per family, pinned **at the gate's own reading on the day the family enters scope (§3.8)**, shrink-only, listed by `file:line`. **This contract states no number** — §0.1 and §7.k: a hand-counted tally has come in low twice, both times in the direction of leniency, and a baseline transcribed from prose is a baseline with free slots in it (§3.4). A family with no gate reading has **no baseline** and reports **UNPROVEN**, never 0. |

---

**A-44 · Cross-machine determinism and GPU geometry are recorded as UNPROVEN with no ruling on whether that is PERMANENT.**

- **Contract · section**: C73 §5.4(b) and §5.4(c) · §6 (exit conditions).
- **Problem**: §5.4(b): *"cross-machine determinism — D1/D2 run in one process on one architecture,
  so platform-dependent floating-point differences are **UNPROVEN**"*. §5.4(c): *"GPU-side geometry
  — anything computed in a shader is outside every gate here, and **UNPROVEN**"*. §6's exit
  conditions mention neither. So both sit permanently in the "cannot see" list with no decision as
  to whether they are **accepted permanent limitations** or **future gates**, which is exactly the
  ambiguity C75 §5 forbids for its own out-of-scope items (*"A kind may be argued out of scope — **in
  writing, on the named list**, never by omission"*).
- **Why it matters**: cross-machine determinism is not an edge case for this product — C73 §1.1's
  own words are *"the same authoritative model must produce the same geometry, **on any machine**"*.
  The contract's headline claim is on the list of things no gate can see, with no plan.
- **Exact amendment required** — C73 §5.4, replace (b) and (c) with:

  > **(b)** cross-machine determinism — D1/D2 run in one process on one architecture, so
  > platform-dependent floating-point differences are **UNPROVEN**. This is **NOT a permanent
  > limitation**: §1.1's headline claim is *"on any machine"*, so the gap is at the centre of this
  > contract's subject, not at its edge. The falsifier is named: **`check-cross-machine-geometry`** —
  > CI regenerates the canonical fixture on **two** runner architectures and diffs the serialized
  > geometry byte-for-byte, with a floor of *architectures compared ≥ 2* and exit **2** below it.
  > Until it exists, no document may state that geometry is machine-independent — only that it is
  > **specified** to be.
  >
  > **(c)** GPU-side geometry — anything computed in a shader. This **IS a permanent limitation and
  > is recorded as an accepted one**, on the following ground rather than by omission: **no
  > authoritative model state is produced on the GPU.** Shader output is presentation (C04), it is
  > never read back into the model, and a value the renderer knows and the model does not is not an
  > input to geometry (§1.2). **If that ever ceases to be true — if any GPU-computed value is read
  > back into authoritative state — this exclusion is void and a gate becomes mandatory in the same
  > change.**

---

**A-45 · C73's gate specifications imply residency by citing a library and never state it.** §5.2's
C0 row cites *"`minFiles` floor, per `lib/sourceScan.ts`"* — `tools/ga-gate/lib/sourceScan.ts`, a
`tools/ga-gate/` library. That is the only locational signal C73 §5 gives for any of its three
gates, and it is an inference from an import path. Closed by **A-11**'s C73 Gate-line amendment.

---

## §10 — Notes for the coordinator

- **Findings A-01 … A-46** are stable ids. Two carry sub-ids used only where a finding is a
  boundary note rather than a defect: **A-08b**, **A-08c**. **A-10** is deliberately a pointer to
  **A-34** rather than a standalone amendment, so classifying A-10 and A-34 separately would
  double-count one defect.
- **I have written no classification, no four lists, and no verdict**, per the brief.
- **The single highest-leverage amendment in PART A is A-11** (residency), because it is the only
  one where a CANONICAL contract currently contradicts working, merge-blocking, correctly-argued
  machinery — and where following the contract literally would make the repository worse.
- **The single most dangerous unstated thing is A-33/A-34** (the C71→C72→C73 seam): it is the only
  finding where every specified gate passes and the product is still wrong.
- **The most likely to be miscounted as fixed is A-26** (the offset "exit target met" sentence),
  because it reads as a success story and is the model five more families are told to copy.
