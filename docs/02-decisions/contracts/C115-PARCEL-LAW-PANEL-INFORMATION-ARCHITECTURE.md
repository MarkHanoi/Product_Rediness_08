# C115 — PARCEL LAW PANEL: INFORMATION ARCHITECTURE

**Status:** CANONICAL · **Minted:** 2026-09-07 · **Lane:** PARCEL-LAW-IA
**Authority above it:** the founder transmission of **2026-09-07** — *"IMPROVE - AUDIT - DOCUMENT
AND FIX THE LAW PANEL - THERE IS DUPLICATION OF DATA ETC... MAKE IT SOUND"* — read together with
[`STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §26.6`](../../01-strategy/STR-RESIDENTIAL-DESIGN-ORCHESTRATOR.md),
which is the same founder's earlier transmission on the same surface.
**Binds:** every PR that adds, moves, renames, folds, collapses, re-hosts or deletes anything
rendered by the Parcel Law tab, the GIS rail PARCEL panel, or the floating buildable-envelope card.
**Siblings:** [`C19 §5.6–§5.8`](C19-SITE-MODEL-AND-PARCEL.md) (host/singleton mechanics) ·
[`C57`](C57-PARCEL-DATA-LAYER.md) (parcel provenance) ·
[`C58`](C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (the determination, its refusals, its honesty
rules) · [`C114`](C114-ELEMENT-SPACE-ENVELOPE.md) (the proposed geometry) ·
[`C80`](C80-GENERATION-AND-REGENERATION.md) (may a generated pass replace this?) ·
[`C84`](C84-ELEMENT-INTEGRITY.md) (one authority per question).

> ⛔ **NO ADR RATIFIES THIS CONTRACT YET, AND THAT IS STATED RATHER THAN IMPLIED.** C114 was minted
> under `ADR-0380`; C102 under `C84 §6`. This document has a **founder transmission** above it and
> **no ADR beneath it**. An ADR is **OWED** for the two decisions §10 and §12 record as taken
> (the host arbiter; the disposition of STR §26.6). Until it exists, §10 and §12 are normative on
> the strength of this contract alone, and a reader is entitled to know that.

---

## §0 — WHAT THIS IS, THE ONE SENTENCE IT DEFENDS, AND WHAT IT DOES NOT LICENSE

The Parcel Law panel is the surface on which an architect answers, in order: *what is this site ·
what can I build here · what do I want to build · does my proposal fit · what fits inside it · what
does it cost · am I ready for BIM.* It is today **six question groups**
(`PARCEL_LAW_QUESTION_GROUPS`, `apps/editor/src/ui/analysis/parcelLawQuestionGroup.ts`) hosting
**≈51 producer modules** and **≈370+ discrete rendered data points**. The founder's complaint is
not that it holds too much. It is that it holds the same thing repeatedly, in different words, in
different places, with no hierarchy — *"a dump of everything PRYZM knows, rather than a workflow
that guides the architect toward a decision."*

**The one sentence this contract defends:**

> **PRYZM is simplified by removing REPETITION, improving HIERARCHY, and progressively revealing
> DETAIL — never by removing INFORMATION. Every figure, sentence, state, citation, control and
> refusal that exists today MUST still be reachable after the refactor, from ONE canonical home.**

### §0.1 — ⛔ WHAT THIS CONTRACT DOES NOT LICENSE

`C115-01` **MUST NOT** be cited to delete a rendered figure, sentence, refusal, absence state,
citation, control, or graph behaviour. It licenses **re-homing**, **referencing**, and
**progressive disclosure** only. A block that moves gets a stamp saying so (§2.5); a block that
disappears is a contract violation.

`C115-02` **MUST NOT** be cited to hide a section because it is empty. C58 §1.13 and §1.20 and the
repository's own `§CONTEXT-DATA-HONESTY` record are explicit that **a failure and an emptiness are
the same visual value if you let them be**. §4.4 gives the test that separates "hide" from "say so",
and it is the only test that permits hiding anything.

`C115-03` **MUST NOT** be cited to collapse two values because their labels look alike. §2.3 gives
the L-13005 test. The worst live example is on one card: *Maximum buildable area (all floors, GFA)*
= footprint × storeys (`apps/editor/src/ui/site/parcel/parcelLawModel.ts`) beside *Max gross floor
area* = footprint × FAR (`packages/site-parcel-data/src/complianceReport.ts`). Three characters of
label separate two different zoning ceilings.

`C115-04` **MUST NOT** be cited to change any NUMBER, any DERIVATION, or any RULE PACK. This
contract governs **presentation and ownership** only. C58 owns what the determination says; C19
§5.6 clause 1 already forbids the tab from re-deriving anything, and that stands: *"two surfaces
that can disagree about a setback is a defect that reaches the user's land."*

### §0.2 — ⛔ THE HONEST STATUS OF THE EVIDENCE BEHIND THIS CONTRACT

This contract is built on a five-part audit dossier, **every part of which was independently
verified and every part of which was refuted on completeness.** That is recorded here rather than
tidied away, because it is the single most important fact about the register in §3:

| Audit | Verdict | What the verifier found |
|---|---|---|
| preserve-inventory | REFUTED on completeness | 8 producer modules never opened; 3 of the card's 4 render arms never entered; 5 counting errors |
| duplication-map | REFUTED on completeness | 19 duplications and 10 not-duplications SOUND; 6 further producers omitted; 3 count/citation errors |
| meaningful-states | REFUTED on completeness | thesis CORROBORATED and *understated*; "not derived" is spelled **5** times in rendered output, not 3 |
| graph-and-massing | REFUTED on conclusion | the BIM build **refuses** multi-storey (`buildFromDesignPlan.ts` `storeyCount` is documented *"Always 1"*); the gap is not "generator only" |
| three-geometries | REFUTED on proof | `Parcel.buildableRing` has **three** writers, not one; the *conclusion* survives, the offered proof does not |

⭐ **The pattern is uniform: every analysis was right about the ARGUMENT and wrong about the
INVENTORY.** §3 is therefore written as an enumerated register with counts, not as prose, and §14
lists what remains unmeasured. ⛔ **A reviewer MUST NOT treat any single audit's item list as the
preservation checklist.** The register in §3 is the checklist; the audits are its sources.

---

## §1 — THE SEVEN STAGES, AS NORMATIVE INFORMATION ARCHITECTURE

`C115-05` The panel **MUST** present seven stages, in this order, each answering exactly one
question and ending in one affordance that moves the architect to the next.

| # | Stage | The question it answers | What it contains | Next affordance |
|---|---|---|---|---|
| **01** | **PARCEL** | *What is this site?* | cadastral reference, address, registry area, measured/ring area, perimeter, bounding box, boundary edges, street frontage, planning zone, source, retrieval date, confidence/match tier. Full technical detail behind **"View full parcel data"** | proceed to Buildability |
| **02** | **BUILDABILITY** | *What can I build here?* | ⭐ **the canonical home for the maximum permitted envelope** — max implantation/footprint, max GFA, max height, max levels, buildable depth, alignment, setbacks and boundary conditions, permitted uses, density/dwelling limits, other constraints | proceed to Design Envelope |
| **03** | **DESIGN ENVELOPE** | *What do I want to build?* | the main interactive stage — generate massing options · select one · **draw your own** · drag/edit the envelope · modify footprint · modify individual storeys · change height · add/remove levels · reshape individual LEVEL envelopes · keep generated options for comparison | check feasibility |
| **04** | **FEASIBILITY** | *Does my proposal fit the rules?* | ⭐ **ONE** comparison table (§7) | resolve, or proceed to Programme |
| **05** | **PROGRAMME** | *What can I fit inside it?* | room library · relationships · **the graph** · programme · room areas · level assignment · preliminary arrangement · room envelopes · plan solving · rooms per level | proceed to Cost |
| **06** | **COST** | *What will it roughly cost?* | designed GFA × a cost assumption the user can see and change; published rates, categories, correction factors, source, legal basis, exclusions, licence and citation behind **"Cost assumptions & source"** | proceed to BIM |
| **07** | **BIM** | *Am I ready for BIM?* | what transfers: parcel context · regulatory envelope · selected design envelope · levels · programme · room envelopes · quantities and assumptions | **"Continue to BIM"** (and the existing **"Create house"** remains available) |

### §1.1 — ⚠ THE SHIPPED LADDER HAS SIX GROUPS, NOT SEVEN — NOT-YET-TRUE

`PARCEL_LAW_QUESTION_GROUPS` ships `plot(1) · law(2) · intent(3) · allowance(4) · cost(5) · bim(6)`.
The founder's Stage 03 **and** Stage 05 are both inside group 3 (`intent`): the tab appends the
authoring slot, the intent slot **and** the whole room programme into `bodyOf('intent')`.

`C115-06` The refactor **MUST SPLIT** group 3, not build two groups from nothing.
`C115-07` Stage 05 **MUST NOT** be orphaned by the split — it has no question of its own today and
acquires one here.
`C115-08` The tab's own lede hard-codes the word *"Six"* (`PARCEL_LAW_NOTE`,
`apps/editor/src/ui/analysis/parcelLawTab.ts`) and **MUST** be rewritten in the same PR that changes
the count. `parcelLawQuestionGroup.ts` also quotes the six-question sequence verbatim as its
provenance record; that quotation is history and is kept, annotated, not silently edited.

### §1.2 — ⚠ THERE IS ALSO A FIVE-STAGE `DesignStage` LADDER, AND IT IS A DIFFERENT LADDER

`apps/editor/src/ui/site/designStageModel.ts` derives `massing · requirements · layout · bim ·
detail` from what exists in the project, and drives the design-stage strip and the card's section
gating (`apps/editor/src/ui/site/designStagePanel.ts`).

`C115-09` The two ladders **MUST NOT** be silently merged or renumbered into one another. They
answer different questions: §1's seven stages are *where information lives*; `DesignStage` is *how
far the project has got*. A PR that reconciles them **MUST** amend this clause first.

---

## §2 — THE ONE-PLACE RULE, AND THE CANONICAL-HOME TABLE

### §2.1 — The rule, in the founder's words, made normative

`C115-10` For every rendered value, the panel **MUST** have exactly ONE canonical home. Every other
occurrence of that same value **MUST** be replaced by one of exactly three things — and **MUST NOT**
be a second independently-computed rendering:

| Replacement | When | What it looks like |
|---|---|---|
| **REFERENCE** | the reader needs to know the value exists and where it lives | a labelled link/control that names the owning stage |
| **SUMMARY** | the reader needs the value at a glance in a second context | one line, sourced from the same producer call, never re-derived |
| **EXPANDABLE DETAIL** | the value is the evidence for a summary above it | inside the owning stage's own disclosure (§11) |

`C115-11` ⛔ **A duplication MUST be fixed by REMOVING A RENDERING, never by adding a computation to
a new consolidated component.** C19 §5.6 clause 1 and C06 §13.3 both forbid a second producer; C58's
subject matter makes it worse than untidy — *these are setbacks, heights and FAR cited to ordinance
articles.*

### §2.2 — The canonical-home table (normative)

`C115-12` These assignments are binding. The **NON-CANONICAL OCCURRENCE** column states what the
other rendering becomes; it never states "delete".

| Value | CANONICAL HOME | Non-canonical occurrence becomes | Live duplication today |
|---|---|---|---|
| Parcel area (registry · ring · scene-measured — three facts, §2.3) | **01 PARCEL** | reference from 02 | ⛔ YES — repeated in the card's site-data fold |
| Parcel perimeter | **01 PARCEL** | reference | ⛔ YES — same fold |
| Bounding box (+ its caveat sentence) | **01 PARCEL** | reference | ⛔ YES — caveat byte-for-byte duplicated across two files |
| Boundary edges + frontage clause (+ its caveat) | **01 PARCEL** | reference | ⛔ YES — same shape |
| Full technical parcel detail | **01 → "View full parcel data"** | — | ⚠ the control does not exist yet (§3, PR-A-04) |
| Max implantation / footprint | **02 BUILDABILITY** (ceiling headline) | summary in 04's *Maximum permitted* column | no — already single |
| Max GFA | **02** | summary in 04 | no |
| Max height | **02** | summary in 04 | ⚠ ONE VALUE, TWO LABELS — *Maximum height* in the headline, *Max height* in the evidence fold |
| Max levels / storeys | **02** | summary in 04 | ⚠ ONE VALUE, TWO LABELS — *Maximum levels* vs *Storeys* |
| **Buildable depth** | **02** | expandable detail in the evidence layer | ⛔⛔ **YES — headline AND fold AND evidence row**, all gated on the same `alignment.depth` derivation row; a fourth copy sits in the unreachable law-scope renderer |
| Alignment offset | **02** | expandable detail | ⛔ YES — headline and evidence row |
| Max FAR · Max site coverage | **02** | expandable detail | ⛔ YES — identical labels, same card, two folds |
| Setbacks (front/side/rear) | **02** summary triple → **per-edge register** (details) → evidence row | ⭐ NOT a duplication — see §2.3(b) | three legitimate layers, currently three unconnected blocks |
| Legal derivation, article text, calculation, citations | **the "Why?" affordance on the value's own row** | — | ⚠ exists only as ONE card-level aggregate fold, not per value |
| Massing assumptions | **03 → "Massing details"** | compact card face keeps label + display | — |
| Design quantities (intended per-storey areas, totals, room rows) | **04 FEASIBILITY** | reference/summary | ⛔⛔ **YES — FOUR simultaneous renderings** from one producer, one of which repaints on an event list carrying no space-envelope signal and can print a STALE number above three live ones |
| Total intended area | **04** | summary | ⛔ YES — **two names for one number**: *Total intended area* and *Total brut, all levels* |
| Allowance remaining / % used | **04** | — | one producer already (`utilisationPct`) |
| "Designed vs permitted" (the BUILT channel) | **04** | ⭐ NOT the same as intended — §5 | — |
| Room quantities | **05 PROGRAMME** | listed-not-added subtotal in 04 | ⛔ YES — room rows rendered twice |
| Active storey's level-envelope area | **03** (owner) / **04** (the comparison) | summary | ⛔ YES — **five renderings in three question groups, four phrasings** |
| Cost methodology, rates, factors, licence, exclusions | **06 → "Cost assumptions & source"** | — | ⛔ YES — **two competing cost answers**, different bases, different rates, both mounted |
| "study, not a permit" | **one statement per stage boundary** | — | ⛔ YES — **6+ renderings, four wordings**; ⚠ see §2.4 |
| What transfers to BIM | **07** | — | — |

### §2.3 — ⭐ THE TEST THAT SEPARATES A DUPLICATION FROM TWO DIFFERENT FACTS (L-13005)

`C115-13` Before merging two values a PR **MUST** answer: **do these two numbers answer the same
question?** If they answer different questions they are **NOT** a duplication and merging them is an
attribution loss this repository has already paid for once.

Worked cases that **MUST** survive as separate facts:

- **(a) Three parcel areas.** *Area (registry)* is what the source declares. *Area (from ring)* is a
  shoelace over the published ring. *Area (measured in scene)* is the committed ring. C57 §1.9/§2.4.
  ⭐ The scene row is already suppressed when it **prints** the same as the ring area — the test is
  on the printed value, with no chosen epsilon. **A disagreement is information, never noise.**
- **(b) Setback triple vs per-edge register vs evidence row.** Summary → Details → Evidence, which
  §2.1 explicitly permits. The register carries edge length, edge class, six verdict arms and a
  per-edge citation that a three-number summary cannot hold.
- **(c) `Maximum buildable area (all floors, GFA)` vs `Max gross floor area`.** footprint × storeys
  vs footprint × FAR. `C115-14` **MUST** be disambiguated by RENAMING one, never by deleting either.
- **(d) BUILT vs INTENDED vs PERMITTED.** Three authorities, never summed (§5, C114 §3a).
  ⭐ The founder named *"Designed vs permitted"*, *"allowance used"*, *"Live quantities"* and
  *"what I want to build beside what I can"* as one duplication. **Three of those four are the
  INTENDED channel and ARE one duplication; *Designed vs permitted* is the BUILT channel and is
  NOT.** §7's table therefore needs **three** value columns, not two.
- **(e) Three room registers.** Space-envelope room envelopes · project BIM rooms · the session
  programme brief. Different stores, different questions. Merging makes one register's absence read
  as another's finding.
- **(f) Buildable footprint · Footprint/parcel % · Footprint perimeter · Study volume.** Four
  quantities from one ring. They look like a family; they are not restatements.
- **(g) The four ceilings in 02's headline AND on 04's comparison rows.** ⭐ **REQUIRED, not a
  duplication.** 04's ceiling is a LINK carrying the same subject and writing the same store; the
  founder's own Stage-04 spec asks for a *Maximum permitted* column. A lane that counts the label
  twice and "fixes" it deletes the most-requested behaviour on the panel.

### §2.4 — The disclaimer rule

`C115-15` The *"study, not a permit"* family **MUST** be consolidated to **one statement per stage
boundary**, and `C115-16` **MUST NOT** merge sentences that make different claims. *"A STUDY, not a
permit"*, *"a massing study volume, not a permitted volume"*, *"not a compliance determination"* and
*"YOUR study, not a permitted area"* are four claims, not four wordings of one.

### §2.5 — ⭐ THE RELOCATION STAMP IS MANDATORY

`C115-17` Every block this refactor relocates **MUST** leave a machine-readable stamp on the surface
it left, so a reader (and a spec) can tell *"the block moved to its owner"* from *"the block is
gone"*. The pattern already exists and **MUST** be reused, not re-invented:
`PARCEL_LAW_DUPLICATE_REMOVED_ATTR` (`data-duplicate-removed`) and `PARCEL_LAW_MERGED_ATTR`
(`data-parcel-rows-merged-into`), both in `apps/editor/src/ui/analysis/`. A retired testid is
**kept exported and documented** rather than deleted — the `PARCEL_LAW_SWITCHER_SLOT_TESTID`
precedent.

---

## §3 — ⭐ THE PRESERVATION REGISTER (NORMATIVE — THE HEART OF THIS CONTRACT)

The founder's acceptance criteria are **0 data points lost · 0 citations lost · 0 hyperlinks broken
· 0 graph functionality removed**. A criterion with no enumeration behind it is a wish. This section
is the enumeration.

`C115-18` **Every row below MUST still be reachable by a user after the refactor.** Dropping any one
of them is a **CONTRACT VIOLATION**, not an oversight. Where a row names a COUNT, the count is the
assertion: a refactor that ships fewer arms than the count has lost information.

`C115-19` A PR that must remove a register row **MUST** amend this section in the same commit,
stating what replaced it. There is no other legitimate route.

### §3.A — PRODUCER MODULES THAT MUST REMAIN REACHABLE

⚠ **The dossier's first inventory said "24 producer modules"; the verified figure is ≥51, and the
eight marked ⛔ below were never opened by the audit that proposed the checklist.** They are listed
first because they are the deletion risks.

| # | Producer | Why its loss is expensive |
|---|---|---|
| PR-A-01 | ⛔ `apps/editor/src/ui/site/envelopeAbsenceCard.ts` | 313 lines. **SIX** absence kinds × **FOUR** strings each (chip label · chip hover title · headline · what-is-missing · what-would-supply-it) = ~24 sentences, **plus** the `§ENVELOPE-NOT-A-GATE` clause-3 sentence and a **three-state** solve button (live / disabled-with-reason / absent). This is the arm a founder with an old project lands on |
| PR-A-02 | ⛔ `apps/editor/src/ui/site/parcel/parcelEnvelopeSlotState.ts` | A **SECOND, INDEPENDENT** absence vocabulary for the same slot — 5 states, 4 full sentences, its own recompute predicate. ⭐ **The named second-code-path hazard: fixing PR-A-01 leaves this untouched, and vice versa** |
| PR-A-03 | ⛔ `apps/editor/src/ui/site/envelopeVisibilityControl.ts` | TWO labelled toggles (Volume · Footprint), each label + ON/OFF + hover sentence, rendered on **ALL FOUR** card render arms |
| PR-A-04 | ⛔ `apps/editor/src/ui/site/createHouseSection.ts` — the `§BIM-FROM-THE-DESIGN` fourth arm | 6 testids, its own label, heading and lede, an unbounded per-room list with partition and perimeter-edge counts, a `refusedRooms` block |
| PR-A-05 | ⛔ `apps/editor/src/ui/site/createHousePlan.ts` + `buildFromDesignPlan.ts` | **8** will-create items + **2** will-not-create items (columns, beams — *"the difference between a capability and a claim"*) + **6** build-from-design will-not items + **9** advisory push sites |
| PR-A-06 | ⛔ `apps/editor/src/ui/site/massingAuthoredOptionSection.ts` | **5** authored-massing states + **2** per-option pre-click refusal sentences + `MASSING_AUTHORED_BLOCK_ATTR` |
| PR-A-07 | ⛔ `apps/editor/src/ui/site/parcelLawChatIntent.ts` | `HEARD_NOT_DRIVEN_TEXT` — **SIX** *"I heard it and PRYZM has no engine for it"* sentences (orientation · sun · overlooking · outlook · parking · entrance). ⭐ The founder's Stage-03 siting intelligence **in its absence form** |
| PR-A-08 | ⛔ `apps/editor/src/ui/site/committedParcelRing.ts` | 3-arm union, **FIVE** distinct refusal sentences, including the site-frame-origin one: *"a plot outline drawn about a guessed origin is a claim about the wrong land"* |
| PR-A-09 | `apps/editor/src/ui/site/levelEnvelopeSupersession.ts` | 3 decision arms + 2 unreadable-store refusals; the **only** implementation of "never overwrite the user's envelope" |
| PR-A-10 | `apps/editor/src/ui/analysis/parcelLawFacts.ts` | THE renderer of the panel's numbers: `FactBasis`, the basis badge/title tables, `NOT_DERIVED_TEXT`, the equal-division lede, the absence/refusal/determined-at blocks |
| PR-A-11 | `apps/editor/src/ui/site/complianceCitationSlots.ts` | The **SIX**-tone citation vocabulary and its three quantifying footer sentences |
| PR-A-12 | `apps/editor/src/ui/site/setbackRegisterModel.ts` + `setbackRegisterSection.ts` | The founder's own 2026-09-07 ask, already landed: one citation-bearing row per perimeter edge |
| PR-A-13 | `apps/editor/src/ui/site/siteGeometryHighlight.ts` + `siteHighlightRowControl.ts` | The click-a-number-light-the-geometry layer and its ~15 unavailability sentences |
| PR-A-14 | `apps/editor/src/ui/room-programme/roomProgrammePanel.ts` + `roomProgrammeModel.ts` + `programmeToEnvelopes.ts` + `residentialRoomLibrary.ts` + `roomEnvelopePlan.ts` + `roomDrawPlan.ts` + `projectRoomsToProgramme.ts` | §8 in full |
| PR-A-15 | `apps/editor/src/ui/analysis/forceLayoutND.ts` | The ONE deterministic graph layout. Deleting or moving it during an analysis refactor silently breaks the room graph |
| PR-A-16 | `apps/editor/src/ui/site/envelopeCardSections.ts` | The card's section builders **including** the stored-determination notice, the legacy-determination notice, the context-study section, the study-height entry and the three-envelope legend |
| PR-A-17 | `apps/editor/src/ui/site/envelopeCostSection.ts` + `packages/core-app-model/src/quantities/RegionalBuildingCost.ts` + `IndicativeRateEstimate.ts` | §9 |
| PR-A-18 | `apps/editor/src/ui/site/designStagePanel.ts` + `designStageModel.ts` | The **9** card-section labels, the 3-way relevance model, the stage-gate note mechanism |
| PR-A-19 | `apps/editor/src/ui/site/viewSwitcherOnView.ts` + `viewSegmentSwitcher.ts` | Mounted **and disposed by the tab**; two shipped sentences point the user at it |
| PR-A-20 | `apps/editor/src/ui/site/envelopeResolutionState.ts` | The FOURTH state — `resolving` is neither NOT CHECKED nor NO LIMIT, and it is deadline-bounded so it can END |
| PR-A-21 | `apps/editor/src/ui/site/parcel/parcelPanelSection.ts` | ⚠ **SECOND CODE PATH:** the provenance-absent arm builds its own *Area (from ring)* row inline, with its own highlight control and its own formatting. A fix applied only to `parcelCard.ts` misses it |
| PR-A-22 | `apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts` | ⚠ **SECOND HOST** for the cadastral card — three call arms. A signature change breaks the 2D Site Map card too |

### §3.B — THE FOUR CARD RENDER ARMS

`C115-20` The buildable-envelope card has **FOUR** whole-`innerHTML` render arms, and an arbiter
(§10) **MUST** handle all four. Three of the four were never entered by the audit.

| # | Arm | What only it carries |
|---|---|---|
| PR-B-01 | **full determination** | the 9 card-owned sections |
| PR-B-02 | ⛔ **absence** | classify-absence chip, absence body, context study, study-height entry, design-stage strip, visibility toggles, the solve wiring, and the solve **failure** sentence (*"a PRYZM-side failure, not a fact about your land"*) plus the `Solving…` transient |
| PR-B-03 | ⛔ **refusal** | three refusal chips with hover titles, the *"What PRYZM found for this parcel"* knownFacts block, the four-arm reason line with its status/coverage `<code>` echo, the deliberate citation SUPPRESSION on gap/transient/absent arms, and the admin **"Set zone manually"** button |
| PR-B-04 | ⛔ **reduced / legacy** | the `Saved` chip, a `Max height` row whose null arm prints `—`, and the legacy-determination notice |

### §3.C — CLOSED UNIONS AND VOCABULARIES (the count IS the assertion)

| # | Vocabulary | Count | Note |
|---|---|---|---|
| PR-C-01 | Envelope absence kinds | **6** × 4 tables | PR-A-01 |
| PR-C-02 | Parcel-envelope slot states | **5** | PR-A-02; a rival renderer of the same facts |
| PR-C-03 | Setback verdict arms | **6** | applied · alignment-governed · not-derived · class-unknown · no-determination · refused |
| PR-C-04 | Setback edge classes | **6** | ⭐ TWO of them are distinct spellings of "unknown" (*recorded as unclassified* vs *not recorded*) and **MUST NOT** merge |
| PR-C-05 | Citation slot tones | **6** | published · estimated · machine · stated-empty · unfilled · uncited. ⭐ `stated-empty` and `unfilled` share one neutral grey **on purpose** |
| PR-C-06 | Compliance constraint labels / order | **18** | ⚠ **not 17** — the audit miscounted. `CONSTRAINT_ORDER` and `LABELS` each hold 18. The reading ORDER is a legal argument (alignment/tier/occupation lead the setback triple deliberately) and reordering is a regression |
| PR-C-07 | `CARD_ASSERTED_CONSTRAINTS` | **3** (+1 pushed row = 4 promised slots) | ⚠ **not the ~20-entry range the audit cited.** This is the only existing machinery that answers *"is this absence promised?"* |
| PR-C-08 | Unresolved-row reasons | **2** | `no-value` · `value-without-citation` |
| PR-C-09 | Capacity statuses | **5** | within · at-limit · over · **Not checked** · **No limit set**. ⭐ exported so a test can assert no two share a label or a colour |
| PR-C-10 | Capacity verdict tones | **5** | ⭐ *"compliant"* never appears except inside *"not a compliance determination"* |
| PR-C-11 | Unmeasured reasons | **10** | each a full sentence; keyed onto the DOM via `data-unmeasured-reason` |
| PR-C-12 | Intent verdicts | **5** | within · exceeds · ceiling-not-derived · no-intent · intent-unmeasurable, **plus** an unreadable arm with 2 reasons |
| PR-C-13 | Massing limitation / note codes | **17** at 22 emission sites | ⚠ **not "22 codes"** — 6 model codes + 11 shape-note codes. Anyone reconciling 17 names against a promised 22 hunts for five that do not exist |
| PR-C-14 | Massing **shape refusal** reasons | **8** | ⛔ absent from every audit item list. Each carries its numbers |
| PR-C-15 | Massing shape families · coverage plates | **4** + **4** | each with a LABEL and a MEANING sentence naming the trade |
| PR-C-16 | Massing scoring axes | **6** shape + **6** plate | ⛔ a null axis prints *not derived*, **never** a zero-length bar |
| PR-C-17 | Allocation refusal reasons · ceiling sources · total-absent reasons | **5** · **5** · **2** | the refusal prints **under** the row, not in a tooltip |
| PR-C-18 | Rooms-per-level envelope arms · unplaced reasons | **4** · **3** | `rival` = *"PRYZM will not choose which the rooms belong in"* |
| PR-C-19 | Pair-resize (wall drag) refusal codes | **5** | each documented as *"a sentence the panel has to be able to speak"* |
| PR-C-20 | Programme layout refusal codes | **7** | incl. `pin-unplaceable`, `multi-region-split` |
| PR-C-21 | Drawn-room refusal codes | **6** | `partly-outside-level` refuses the WHOLE rectangle, never trims |
| PR-C-22 | Envelope authoring refusal reasons | **12** + 1 advisory | ⛔ the audit listed one |
| PR-C-23 | Adopt-proposal refusal reasons | **5** | |
| PR-C-24 | Build-from-design refusal codes · per-room skip codes | **8** · **6** | |
| PR-C-25 | Create-house refusal codes | **4** arms, checked in a stated order | `already-built` is checked LAST so its message can name the plate |
| PR-C-26 | Target-footprint refusal reasons | **5** | ⚠ the file header says a seventh arm is owed while the union lists five — a live doc/data drift, recorded not normalised |
| PR-C-27 | Space-envelope refusal sentences | **9** | the refusals of the per-storey face drag |
| PR-C-28 | Confidence badge ladder | **7** arms | ⭐ **the ORDER is load-bearing — weakest wins.** A header may never read stronger than its own rows |
| PR-C-29 | Source-line ladder | **6–7** arms | mirrors the badge ladder |
| PR-C-30 | `FactBasis` | **3** (ceiling · derived · assumed) + 3 badges + 3 hover titles | ⭐ **the typographic answer** to *"Max height 22.4 m reads exactly like Footprint perimeter 85.7 m"* |
| PR-C-31 | Chat routes · heard-not-driven topics · ask topics | **4** · **6** · **3** | PR-A-07 |
| PR-C-32 | `emptyDigest` strings | **6** (7 with the setback register's *"no parcel outline"*) | |
| PR-C-33 | Highlight subjects | **7** fixed + per-edge + per-room families | plus `SiteHighlightRole` and `SiteHighlightCue` |
| PR-C-34 | Indicative-cost refusals | **6** | incl. *"A rate of zero is not a free building"* |
| PR-C-35 | Design-stage states | **4**, each with a **non-empty** reason on every arm | ⛔ *"An empty string here would re-create the greyed-control-with-no-explanation"* |

### §3.D — UNBOUNDED ROW FAMILIES

`C115-21` ⚠ The audit said **8**; the verified floor is **13**. Each renders one row per instance and
**MUST NOT** be capped, summarised-away, or silently truncated without a stated truncation line.

PR-D-01 per perimeter **edge** (setback register) · PR-D-02 per perimeter edge (parcel model) ·
PR-D-03 per **storey** ordinance band (capped at 40, **with** a *"…N further storeys not listed."*
line) · PR-D-04 per storey **built** area · PR-D-05 per storey **intended** area · PR-D-06 per storey
**allocation** row · PR-D-07 per storey **created-envelope** row with its own *Edit perimeter* button
· PR-D-08 per **room** (programme list) · PR-D-09 per room (rooms-per-level) · PR-D-10 per room
(intended-area nested rows) · PR-D-11 per room (live quantities) · PR-D-12 per **massing option**
card · PR-D-13 per **compliance row** citation · PR-D-14 per **limitation** line · PR-D-15
`knownFacts` on a refusal · PR-D-16 `leadNotes` / card action buttons.

⛔ **PR-D-03 MUST NOT be collapsed.** The founder ruled on this by name: *the repetition is what
makes the equal-division assumption checkable.* The fix was to move the statement **in front of**
the rows at the weight of a governing fact, and that placement is normative.

### §3.E — NAMED SENTENCES AND HONESTY STRINGS

`C115-22` The following are **named constants carrying user-facing sentences**. Each **MUST**
survive verbatim or be amended by a PR that states the new wording. This list is not exhaustive of
the ≈370 data points; it enumerates the ones a consolidation pass is most likely to lose.

PR-E-01 `ENVELOPE_ABSENCE_NOT_A_GATE_TEXT` (*"This does not stop you…"* — C58 §1.20 in one string) ·
PR-E-02 the absence **solve-failure** sentence (*"a PRYZM-side failure, not a fact about your
land"*) · PR-E-03 `PARCEL_PROVENANCE_ABSENT_TEXT` · PR-E-04 `PARCEL_NO_BOUNDARY_TEXT` · PR-E-05
`PARCEL_FOOTPRINT_WARNING` · PR-E-06 `PARCEL_USER_DRAWN_NOTE` · PR-E-07 `PARCEL_AREA_DERIVED_NOTE`
(⭐ **on the same line as the figure**) · PR-E-08 `PARCEL_LAW_MEASURED_NOTE` · PR-E-09
`PARCEL_LAW_GEOMETRY_ABSENT_TEXT` · PR-E-10 the card's own differently-worded
parcel-outline-unavailable block (*"a missing READ, not a missing constraint"*) · PR-E-11
`PARCEL_LAW_ENVELOPE_ABSENT_TEXT` · PR-E-12 `PARCEL_LAW_EQUAL_DIVISION_LEDE` · PR-E-13
`SETBACK_REGISTER_LEDE` · PR-E-14 `SETBACK_CLASS_UNKNOWN_NOTE` · PR-E-15 the setback no-parcel
sentence · PR-E-16 `NOT_DERIVED_TITLE` · PR-E-17 `CARD_NOT_DERIVED_HTML`'s title (*"a MISSING
LOOKUP, NOT a finding that the zone sets no limit"*) · PR-E-18 the four `CEILING_HINT` sentences
(incl. *"we do NOT back-compute storeys"* and *"a guessed storey count would become a guessed
sellable area"*) · PR-E-19 the *not-derived* fold rider · PR-E-20 the degenerate-envelope sentence
(*"Setbacks consume the whole parcel"* — ⛔ deliberately **not** replaced by the four ceilings) ·
PR-E-21 the upper-bound caveat · PR-E-22 the zone-extent caveat · PR-E-23 `INTENT_REFUSAL_
CONSEQUENCE` (*"Nothing was trimmed… PRYZM will not clamp them"*) · PR-E-24 `NOT_DERIVED_CLAUSE`
(*"PRYZM does not infer a ceiling"*) · PR-E-25 the two `totalHeightBasis` sentences (one declares a
gap-free stacking **assumption**) · PR-E-26 the rasant note (*"Measured from the project datum, not
from the rasant at the façade"* — a stated LEGAL defect, on the row it distorts) · PR-E-27 the
standing capacity footer (*"it is not a building-code review"*) · PR-E-28 `capacity-join-failed`
(*"a FAILURE to measure, not a finding that nothing is designed"*) · PR-E-29 the *listed, not added*
subtotal wording (C114 §9a — adding both counts one floor twice) · PR-E-30 `unknownStoreyRequests`
(*"counted, not applied — PRYZM does not create a storey to hold a number"*) · PR-E-31 the
intended-area rider's three counted exclusions · PR-E-32 `INTENDED_AREA_CAVEAT` · PR-E-33
`ENVELOPE_STUDY_AREA_CAVEAT` · PR-E-34 the `no-module` cost refusal (*"PRYZM does not substitute a
€/m² from a different municipality"*) · PR-E-35 the `no-typology` ASK, quoting the published table's
min–max span · PR-E-36 `MASSING_FAMILIES_NOT_YET_SOLVED` (*"shapes that step in plan between
storeys"*) · PR-E-37 `MASSING_SHAPES_SIZED_TO_LARGEST_FIT` · PR-E-38 the massing fold intro
(*"PRYZM does not pick one — the trade… is yours"*) · PR-E-39 `ROOM_PROGRAMME_NOTE` · PR-E-40 the
three plan-gesture hints incl. *"None of the three gestures is undoable with Ctrl+Z"* · PR-E-41 the
place-envelopes no-bus admission (*"a gap in the wiring, not a refusal about your design"*) ·
PR-E-42 `HOUSE_WILL_NOT_CREATE` · PR-E-43 the `refusedRooms` block · PR-E-44 the two
`levelEnvelopeSupersession` unreadable-store sentences · PR-E-45 the seven independent spellings of
*"no parcel is committed"* (⚠ recorded as a **known drift**, §12.4) · PR-E-46 the tab's own
top-level failure sentence (*"…shows nothing in place of it rather than a partial card"*) · PR-E-47
the `PARCEL_LAW_PLOT_ROUTE_NOTE` · PR-E-48 `PARCEL_LAW_FACTS_NOTE` · PR-E-49 the stored-determination
line (*"solved <date>. Nothing has been re-derived to show it."*) · PR-E-50 the six
`HEARD_NOT_DRIVEN_TEXT` sentences.

### §3.F — CITATIONS, PROVENANCE AND HYPERLINKS

`C115-23` **THE HYPERLINK RULE.** Compact source labels in the main UI; the **complete** citation in
the expandable evidence layer. `C115-24` ⛔ **A URL MUST NOT be rendered as plain text, and a
citation MUST NOT be truncated into an unusable link.**

| # | Must survive | State today |
|---|---|---|
| PR-F-01 | The *"plan document"* anchor (Plandata.dk) | **LIVE** — one of exactly **two** real `<a href>` in the whole surface |
| PR-F-02 | The per-compliance-row *"citation"* anchor | **LIVE** — the other one. Ceiling **18** anchors (⚠ *Storeys* can never be one: it is pushed into `unresolvedRows`, which renders label + pill + note with **no citation slot**) |
| PR-F-03 | The **three-way fallback**: `safeHttpUrl` → anchor / non-URL → escaped plain text / null → *"no citation"* | **LIVE — all three arms are meaningful and all three MUST survive.** ⭐ Most `ordinanceRef` values are article references (*"PGM Art. 242.2"*), so **most citations already render as text by design**; the founder's rule must be read against `safeHttpUrl`, not against a wish |
| PR-F-04 | ⛔ **OPEN DEFECT D-1** — the cost module's `sourceToChase` renders a real `https://` PDF link as **escaped plain text** | **BROKEN TODAY** in the exact place the founder names (*"verify at"*). Same shape in the Mediciones bucket. `C115-25` **MUST** be routed through `safeHttpUrl` like the per-row path. **Fixing it is in scope; regressing it further is not** |
| PR-F-05 | ⛔ **OPEN DEFECT D-2** — the headline source line renders the ordinanceRef **only** when it is http(s), with **no plain-text fallback**, contradicting its own adjacent comment | **A CITATION IS SILENTLY DROPPED TODAY.** The per-row path has the fallback; the header does not. `C115-26` **MUST** be made consistent |
| PR-F-06 | The 18 constraint labels carrying **local legal terms** (*profundidad edificable*, *alineación*, *franja concèntrica*, *ocupación*, *superfície construïda*, *altura reguladora*, *plantas*, *superficie útil*) | ⛔ **The parentheticals are how a user finds the clause in the source. Deleting them breaks verification** |
| PR-F-07 | The three enum→prose maps, each naming a **different article** | incl. *"The interior free-space rule (≥30% of the block, PGM Art. 242.2)"* |
| PR-F-08 | Per-edge `ordinanceRef` in the setback register, incl. the explicit *"no citation held in the derivation trace"* | ⚠ reaches the DOM only as text baked into the verdict sentence; the SAME ref becomes an anchor in the evidence fold. One datum, two paths, one linked |
| PR-F-09 | Card attribution: `Source: label · id` · `Licence:` · `Retrieved:` | C57 §1.9 mandatory. ⚠ `sourceVersion` exists on the type/adapter and is **NOT rendered** — do not claim it |
| PR-F-10 | Cost provenance: database · publisher · edition · priceDate · itemCode · **licence status (3-member closed union)** · licence note citing the statute and the open-data terms · the **8** exclusion items each citing an article | ⛔ *"no rate may ship under NOT_ESTABLISHED"* |
| PR-F-11 | The capacity citation rendered as a fact row · the zone + citation group lines (**both** arms, incl. *"citation held per row in 'Why these numbers?'"*) | |
| PR-F-12 | ⛔ Deliberate citation **SUPPRESSION** on gap/transient/absent refusal arms | Citing an ordinance for a coverage gap is a mis-citation. **The absence of a citation here is a decision and MUST NOT be "fixed"** |
| PR-F-13 | `describeCitationFoldCaveats` — three quantifying sentences that keep **their own denominator** | unresolved slots are counted in a SEPARATE sentence, never folded into the row count |
| PR-F-14 | ⭐ `citationFoldHasContent` returns TRUE when **only unresolved slots exist** | ⛔ **A "hide empty sections" refactor re-creates the exact defect this guard removed** |

### §3.G — CONTROLS, GESTURES AND THEIR DISABLED-WITH-REASON ARMS

`C115-27` Every control below **MUST** keep its **three visual states** where it has them: a real
focusable control where the action is possible; ordinary text or a disabled control **carrying the
reason** where it is not; **never a dead click**.

PR-G-01 *Select parcel on the 2D map* (+ its unavailable variant naming the missing entry point) ·
PR-G-02 *Recompute from the committed parcel* · PR-G-03 *Re-check this parcel* (stored
determination) · PR-G-04 *Solve and store the full determination* (legacy) · PR-G-05 *Solve the
envelope for this parcel* (three-state) · PR-G-06 admin *Set zone manually* · PR-G-07 the two
envelope visibility toggles (on **all four** arms) · PR-G-08 *Generate* / *Hide these options* ·
PR-G-09 per-option **pick** button — ⭐ **the chosen option KEEPS its button, relabelled**; disabling
it closes the compare loop · PR-G-10 the authored-massing route button (4 labels across its arms) ·
PR-G-11 target-area input · Solve · Clear · adopt intent line · adopt button · adopt status ·
PR-G-12 study-height + setback inputs and save · PR-G-13 storeys input with its dynamic label ·
*Create envelope* · intent line · advisory · status · PR-G-14 *Discard the drawn perimeter* ·
PR-G-15 per-storey *Edit perimeter* (disabled **with the resolver's own per-element reason**) ·
PR-G-16 brut allocation per-row editable input · PR-G-17 cost rate input · currency select (**9
explicit currencies, EUR default, never inferred from locale**) · apply · PR-G-18 building-type
select (**10** published groups) + `— not chosen —` · PR-G-19 correction-factor select carrying the
ordinance's **verbatim** wording · PR-G-20 *Place envelopes in 3D* / *Replace the room envelopes on
this level* · PR-G-21 draw toggle + kind select · PR-G-22 library chips (drag **and** click) ·
PR-G-23 *Load the N rooms in this project* / *Re-read…* / *Start from the example ground floor* ·
PR-G-24 *Create house* · PR-G-25 *Create BIM from this design* · PR-G-26 the **6** highlight-row
control call sites (⚠ **six, not seven** — four cited "sites" are field assignments consumed by one
renderer) · PR-G-27 the on-view view switcher.

### §3.H — MACHINE-READABLE STATE THAT OTHER CODE DEPENDS ON

`C115-28` ⛔ **These are not decoration. Renaming any of them breaks a shipped behaviour silently.**

| # | Coupling | The silent break |
|---|---|---|
| PR-H-01 | The collapsed-digest `MutationObserver` watches **exactly five** attribute names: `data-state` · `data-arm` · `data-refusal-code` · `data-absence` · `data-derived` | Renaming any of the five **freezes every collapsed summary**. Adding a new honesty attribute is **invisible** to it — `C115-29` a new honesty attribute **MUST** be added to the filter in the same PR |
| PR-H-02 | The **26** headline/confidence probe CSS selectors | A digest is a MIRROR read out of its own body. Renaming a probed testid or class **blanks a digest** — C58 §1.2: a hidden confidence is a broken figure |
| PR-H-03 | The chat **drives the manual controls by testid** | Renaming an authoring, quantities, target-area or massing testid **breaks the chat silently** |
| PR-H-04 | ≈**96** distinct `data-*` attributes are set in panel scope (⚠ the audit named 14 and estimated 46) | Each is both a test hook and a stylesheet hook |
| PR-H-05 | ≈**156** exported/inline testids across the five principal files (⚠ the audit said 142) | Specs address the panel through these, never through classes |
| PR-H-06 | `PARCEL_LAW_STRIP_WIRED_ATTR` · `PARCEL_LAW_HIGHLIGHT_WIRED_ATTR` painted-state counters | Specs read them to prove reachability |
| PR-H-07 | Fold open-state is keyed by `data-testid`; a `<details>` without one is **skipped** | ⛔ **OPEN DEFECT D-3:** two honesty caveats emit untagged `<details>` and therefore **do not remember their open state** across the card's own repaints |

### §3.I — REGISTER SIZE, STATED

**22 producer rows (§3.A) · 4 render arms (§3.B) · 35 vocabulary rows (§3.C) · 16 unbounded
families (§3.D) · 50 named sentences (§3.E) · 14 citation/hyperlink rows (§3.F) · 27 control rows
(§3.G) · 7 machine-state couplings (§3.H) = 175 register entries**, standing over roughly **370+
rendered data points**, **≈130 citation/provenance-bearing fields** and **≈300 enumerated union
arms**. `C115-30` A reviewer **MUST** be able to hold a refactored panel against this list; a claim
of *"0 data points lost"* that does not walk it is unsupported.

---

## §4 — THE NON-VALUE VOCABULARY, AND THE HONESTY BOUNDARY

### §4.1 — ⛔ THE SEVEN STATES ARE NORMATIVE AND NONE MAY COLLAPSE

`C115-31` **NOT DERIVED ≠ 0. NOT CHECKED ≠ COMPLIANT. UNVERIFIED ≠ PERMITTED.** All seven states
below **MUST** remain distinguishable to a reader, and **MUST NOT** be converted into an empty
field:

| State | Means | It is NOT |
|---|---|---|
| **NOT DERIVED** | the rule pack produced no value for this zone; PRYZM does not infer one | not a finding that the zone sets no limit; not zero |
| **NOT CHECKED** | either no published limit is held, or the design supplies no measurement | **not a pass** |
| **UNCITED** | a value is on screen with no source behind it (a C58 §1.3 breach, stated) | not "unsourced therefore wrong" — it is *unverified until a derivation entry exists* |
| **UNVERIFIED** | machine-extracted, not human-signed-off | **not permitted**; and *"a wrong value here is our error, not the publisher's"* |
| **UNKNOWN** | PRYZM cannot establish the fact at all | not zero, not absent, and often its own answer |
| **REFUSED** | a cited determination that no envelope applies | ⛔ **a positive result** — it carries no numeric rows *by design*, because three dashes read as *"not filled in yet"* |
| **NOT APPLICABLE** | the question does not arise (e.g. a hand-drawn ring has no registry size to review) | not "unknown" |

Two further states the shipped product distinguishes and that `C115-32` **MUST** survive:
**STATES NONE** (the source was consulted and carries no figure — a finding *about the source*) and
**RESOLVING** (a time-bounded fourth state that is none of NOT CHECKED, NO LIMIT or OVER).

### §4.2 — ⭐ MINT ONE VOCABULARY. DO NOT MERELY "ROUTE THROUGH" ONE.

**Measured, and it is worse than it looks:** there is **no shared supertype** for "a value that is
not a number" — ~41 independent closed unions across ~25 files, plus ~30 hand-rolled render-site
literals, no shared badge component, no registry. The nearest shared thing
(`RelationshipDetermination<T>` + an 11-member `UndeterminedReason`) is about absent
*relationships*, not absent *values*, and reaches this panel through exactly **one** door.

**The proof, corrected:** *"not derived"* is spelled **FIVE** times in rendered output — a plain-text
constant, an HTML span with its own colour and title, a bare inline literal in the intent renderer,
and **two more inline amber spans in the massing card with a different colour and no title** — plus a
sixth prose occurrence in the card legend and an uppercase pill. ⚠ The audit said three.

`C115-33` A single non-value vocabulary **MUST** be minted: one type, one badge/pill renderer, one
set of hover sentences, one `data-*` spelling.
`C115-34` It **MUST** be built from a **mechanically generated** inventory — a grep-driven
exhaustiveness gate over exported unions, honesty `data-*` attributes, testids referenced by the
digest probes, and every rendered non-value literal — **not** from a hand-walked list. Every
hand-walked list in the dossier was incomplete.
`C115-35` The em-dash placeholder **MUST** resolve to one constant. One already exists at L3
(`EMPTY_VALUE_TEXT`, `packages/site-parcel-data/src/complianceReport.ts`) and defines
`hasStatedValue` by comparison against itself; the UI layer has **8+** independent dash sites.

### §4.3 — TYPOGRAPHY IS PART OF THE VOCABULARY

`C115-36` The basis→typography mapping **MUST NOT** be normalised away by a visual redesign. Weight,
opacity and padding are how a *legal ceiling* is told from a *derived convenience* from an
*assumption* — the founder's own complaint that *"Max height 22.4 m reads exactly like Footprint
perimeter 85.7 m."*
`C115-37` ⛔ **An unknown ceiling MUST NOT shrink.** De-weighting it hides it as effectively as
deleting it, one step more deniably.
`C115-38` ⛔ **Emphasis may never strengthen a claim.** Highlighting dims non-subjects; it never
brightens the subject. Boosting a provisional solid's opacity to "highlight" it makes an estimate
read as a determination.

### §4.4 — ⭐ THE HONESTY BOUNDARY: THE TEST THAT PERMITS HIDING

The founder asks for a progressive, project-state-aware panel: before any design exists, **one
line** — *"No proposed envelope yet. Draw one, create one, or choose a massing option to check
feasibility"* — and *"do not display five large empty-state sections saying that nothing has been
authored."*

`C115-39` A section **MAY** be withheld from the cold-start view **only if all four hold**:

1. **It has NOTHING TO SAY, as opposed to something absent to report.** A section whose content is a
   *named absence* (any §4.1 state, any refusal, any unmeasured reason) has something to say.
2. **Its absence is a consequence of a state the user can see stated elsewhere on the panel** — the
   one line above, or the stage's own collapsed digest.
3. **No failure is being hidden.** ⛔ *"A failure to READ and a finding that the project is empty are
   the same visual value if you let them be."* A `store-threw`, `unreadable`, `measure-failed`,
   `capacity-join-failed`, `levels-unreadable` or `runtime-unreachable` arm **MUST** render.
4. **Its escape hatch survives.** C82 §1.2 / the `refusing-half-needs-its-escape-hatch` record: a
   refusal owes a way forward. If the section carries the only route to the next action (the map
   button, a recompute, a solve), it renders.

`C115-40` ⛔ **Withholding MUST be at the SECTION level and MUST NOT be at the ROW level.** Inside a
rendered section, a row with a §4.1 state renders that state. A row that vanishes because its value
is null is the defect this contract exists to prevent.
`C115-41` The mechanism already shipped — the design-stage plan decides **order and relevance only;
nothing is hidden, no fold is opened, no number changes**, and a gated section renders *"<Section>
— not at this stage yet."* with its reason at reduced opacity. ⛔ **This is the mechanism a
"progressive disclosure redesign" would destroy first.** `C115-42` The cold-start rule **MUST**
extend it, not replace it.

---

## §5 — THE THREE GEOMETRIES

`C115-43` **PERMITTED · PROPOSED · ROOM** are three geometries and **MUST NEVER** be merged, summed,
or allowed to write one another.

| Geometry | What it is | Authority |
|---|---|---|
| **PERMITTED envelope** | what the rule determination allows | `BuildableEnvelope` — solved, cited, carrying a mandatory confidence tier and a derivation trace |
| **PROPOSED / to-be-built envelope** | what the user intends to build | the `spaceEnvelope` family, `role: 'level'` (C114) |
| **ROOM envelopes** | conceptual spaces inside the proposed envelope | the same family, `role: 'room'`, `withinId` = the level envelope |

### §5.1 — What the audit found TRUE today

- ⭐ **The separation is STRUCTURAL, not by discipline**: three schemas, two stores, three colour
  authorities, and a **closed** legend union `'permitted' | 'to-be-built' | 'room'` where only the
  permitted row `carriesConfidenceBadge`.
- ⭐ **`role: 'maximumBuildable'` is DECLARED and REFUSED by name at the create verb** — the product
  refuses to let a user author a thing that calls itself the legal ceiling.
- ⭐ **No design verb can write the site store**: all seven `spaceEnvelope` handlers declare
  `affectedStores = ['spaceEnvelope']` and nothing else. Zero in-place mutations of a
  `BuildableEnvelope` exist.
- ⭐ The never-clamp machinery and the both-numbers refusal template already exist (§6).

### §5.2 — ⚠ What the audit's PROOF got wrong, recorded because a wrong proof is a future regression

`C115-44` The conclusion — *no user DESIGN act reaches the permitted envelope* — stands. The offered
proof does not, and **MUST NOT** be re-cited:

- **`Parcel.buildableRing` / `buildableDetermination` have THREE writers, not one.** Besides the
  zoning-update command there is a whole-model `set` reached from the boundary-clear path (which
  **spreads** the parcel and therefore **preserves a stale ring and determination across a boundary
  clear**), and a restore-on-project-open `set`. None is a design act, so the conclusion survives —
  but **there is no CI gate on direct site-store writes**, and the store's own header says routing
  through commands is *"by convention"* until that gate ships.
- **The session envelope cache has a second writer** outside the dispatch funnel.
- **The SpaceEnvelope store has a second write path** — a restore-time `applyPatch` that bypasses
  every verb, the containment gate and the metric recompute (deliberate, and reasoned in place).

### §5.3 — ⛔ THE REAL HOLE: A HAND-EDIT NEVER RE-STAMPS PROVENANCE (OPEN DEFECT D-4)

The founder's separate sentence — *"never have their manually created envelope overwritten by
generated options"* — has one live hole. The mutating verbs contain the string `provenance` **zero
times**; a face move spreads the current record. So a plate PRYZM generated (origin `computed`) that
the user then **face-dragged, reshaped or re-heighted** is still classified `computed`, is still
replaceable by generated massing, and adopting the next massing option **deletes the user's reshaped
geometry** — announced as *"which PRYZM generated"*. **No test covers this case.**

`C115-45` A human edit is a C75 authoring act. The mutate verbs **MUST** promote origin to
`authored` (or `regenerated` carrying what it replaced), or the record **MUST** gain an explicit
edited-by-hand axis. Until then the founder's sentence is **NOT-YET-TRUE for edited generated
plates**, and this contract says so rather than claiming it.

`C115-46` **Room envelope specs carry no provenance at all** and land on the retrofit
unknown-origin default (OPEN DEFECT D-5) — the same defect that was fixed for level envelopes and
never done for rooms. No room-level supersession rule may be written until it is fixed.

### §5.4 — Contract-vs-code divergence, recorded not papered over

`C115-47` ⚠ **C58 §1.19 clause 3 mandates `confidence: 'authored'`, and the confidence union has no
such member and should not gain one.** The implementation is *better* than the clause — a separate
element kind with a one-member `standing: 'design-intent'`, an orthogonal C75 provenance origin, no
`ordinanceRef` and no derivation — which satisfies clause 3's **intent** exactly. But C58 outranks
code in the conflict order, so **the clause's literal text is unimplementable and an in-place
correction of C58 §1.19 clause 3 is OWED.** ⛔ Correct the contract sentence; do not "fix" the code
to match it.

### §5.5 — The legend

`C115-48` The three-envelope legend **MUST** remain rendered wherever the three geometries are drawn
together, and its rows **MUST** keep their `carriesConfidenceBadge` distinction so a renderer cannot
hang a confidence badge on an intent volume.
⚠ **NOT-YET-TRUE:** the legend has exactly **one** production call site — inside the target-area
entry — so **deleting the target-area entry silently deletes the legend**, and the three scene
renderers import the fill and ink but not the orientative sentence the style module's own header
says every surface drawing it must print (OPEN DEFECT D-6).

---

## §6 — STAGE 03: THE DESIGN INTERACTION

`C115-49` Stage 03 **MUST** offer, on whichever site view is open: generate massing options · select
one · **draw your own** · drag/edit the envelope · modify the footprint · modify individual storeys ·
change height · add/remove levels · reshape individual LEVEL envelopes · and **keep generated options
for comparison**.

### §6.1 — ⛔ NO SILENT CLAMPING

`C115-50` Exceeding a ceiling **MUST** be reported with **BOTH numbers** — *"Exceeded maximum
height: 24.1 m / 22.4 m"* — and the geometry **MUST** be kept **exactly as designed**. Do not delete
it, do not shrink it, do not replace it, do not trim it.
`C115-51` A ceiling the rule pack did not derive **MUST** render as *not checkable* — **never as a
pass and never as a fail**.
`C115-52` The refusal **MUST** name the way out (*"reduce it yourself"*), and the both-numbers
sentence **MUST** come from the **one** producer that already exists rather than a second template.

⭐ **This is already implemented and pinned** — the intent verdicts, the never-clamp consequence
sentence, the storey-count **advisory** that is neither a refusal nor a clamp, and the
allocation ledger's both-numbers template all exist. §6.1 makes them binding rather than incidental.

### §6.2 — The compare loop stays open

`C115-53` The chosen massing option **MUST** keep an enabled control, relabelled (*"Using this plate
— pick another to compare"*), with a chosen mark and stable, RNG-free option ids so a pick survives
a repaint. Disabling the chosen control closes the compare loop.
`C115-54` ⛔ **A REFUSED option MUST still be LISTED, with its reason and WITHOUT a pick button** —
*"a control that can only fail is a dead click with a label on it."*
`C115-55` The user's own massing **MUST** be offered as a first-class option, first, on both arms.

### §6.3 — Per-level envelope editing

`C115-56` Per-storey editing **MUST** remain available: face drag on the 3D views (the 2D map is
excluded by design — a plan has no vertical axis) and a per-storey *Edit perimeter* route into the
profile editor, disabled **with the resolver's own per-element reason** when unreachable.

⚠ **NOT-YET-TRUE — per-storey GENERATION does not exist, and the gap is wider than the audit
concluded.** Every generated option is ONE footprint ring plus a storey COUNT; the product's own
caveat says *"Not yet offered: … shapes that step in plan between storeys."* The store is per-level
(each storey minted with its own deep-copied ring so a face drag on one floor does not move the
stack), but there are **four** producers assuming one ring per building:

1. the massing generator (one ring, one storey count);
2. the adopt step (creates exactly ONE level envelope, on the ground storey);
3. ⛔ **the BIM build, which REFUSES multi-storey outright** — its storey count is documented
   *"Always 1"*, more than one level envelope mints an *ambiguous* refusal, and the advisory says
   *"this pass builds only the lowest"*. **A per-storey design cannot reach BIM today** — the audit
   read this file backwards and cited it as evidence the model was ready;
4. the house orchestrator, which generates per-storey **room** layouts but stamps every storey plate
   with the **same** footprint.

`C115-57` A PR claiming per-storey massing **MUST** address all four, and **MUST** wire the
authoring planner's existing `startStoreyId` parameter, which is accepted, refuses rather than
falling back, and has **zero production callers** (OPEN DEFECT D-7 — authored-but-unwired).

---

## §7 — STAGE 04: THE ONE FEASIBILITY TABLE

`C115-58` Stage 04 **MUST** be **ONE** canonical comparison table. It **MUST** carry three value
columns, not two (§2.3(d)):

| Metric | My design (BUILT) | Intended (DECLARED) | Maximum permitted | Status |
|---|---|---|---|---|
| footprint · GFA · height · levels · other constraints | measured off real floor plates | declared level envelopes | the rule determination | one of the five states below |

`C115-59` It **REPLACES** the current duplication between *Designed vs permitted*, *How much
allowance have I used?*, *Live quantities* and *what I want to build beside what I can* — by
**removing renderings**, not by adding a computation (C115-11).

### §7.1 — The five states

`C115-60` `Within limit` · `Exceeded` · `Not checked` · `Unresolved` · `No applicable rule`. Each
**MUST** keep a distinct label, a distinct colour pair and a distinct hover sentence.
`C115-61` ⛔ **Missing regulatory data MUST NOT be treated as zero or as a pass.**
`C115-62` `Not checked` **MUST** carry its own reason — there are **10** distinct unmeasured reasons
today and they **MUST NOT** collapse into one.

⚠ **Mapping note, stated honestly:** the shipped capacity vocabulary has five statuses —
`within · at-limit · over · Not checked · No limit set` — and **no member named `Unresolved`**. The
nearest shipped spellings are the compliance report's unresolved-row reasons and the intent
verdict's `ceiling-not-derived`. `C115-63` A PR implementing §7.1 **MUST** decide whether
`Unresolved` is a sixth state or an alias of one of those, and **MUST** record the decision here.

### §7.2 — The percentage-used arithmetic

`C115-64` The percentage used **MUST** have exactly **ONE** producer (C06 §13.3). It already does,
and `C115-65` a second computation **MUST NOT** be added by the consolidation.
`C115-66` ⛔ **When a ceiling is not checkable the percentage MUST render as a stated non-value —
never 0 % and never 100 %.** The existing producer returns null when either side is unknown or the
permitted figure is zero; that null **MUST** reach the row as *not checked*, with its reason.
`C115-67` The allowance remainder has the same rule: `null remaining ≠ 0 remaining`, and the
*"not known / PRYZM will not guess"* arm is a distinct state rendered in a distinct tone.

### §7.3 — What travels with the table

`C115-68` The rasant caveat **MUST** travel with any height comparison (a stated LEGAL defect,
reported not papered over). `C115-69` The standing footer (*"it is not a building-code review"*)
**MUST** render for **every** tone, including a clear one. `C115-70` The four measurement arms
(`measured · nothing-authored · unmeasurable · measure-failed`) **MUST** all remain reachable —
the previous gate made two of them unreachable in exactly the state the bug report was in.

### §7.4 — ⛔ OPEN DEFECT D-8: STALENESS

One of the four intended-area renderings repaints on a fixed event list that carries **no
space-envelope signal**, so a face drag moves the 3D scene and leaves that fold frozen — it can print
a stale number directly above three live ones. `C115-71` The single Stage-04 table **MUST**
subscribe to the same dirty channel its siblings use.

---

## §8 — STAGE 05: THE PROGRAMME AND THE GRAPH

`C115-72` ⛔ **DO NOT REMOVE THE GRAPH.** The room relationship graph **MUST** remain **fully
functional**. This is not a display concern: the graph is the **input to the solver** — seriation
runs over it, three cutting policies are raced and scored by how many plugged relationships they
honour, and an edge added or removed **changes the geometry**.

`C115-73` The stage's hierarchy **MUST** be: **Programme summary** (rooms / area / relationships) →
**Room library** → **Relationship graph** → **Solved arrangement** → **Rooms by level**.

`C115-74` The following graph behaviours **MUST** survive intact:

1. read room count and relationship count; 2. every room as a colour-coded node with its name;
3. **drag node → node to PLUG** a relationship; 4. **click an edge to UNPLUG** it; 5. drop a library
chip onto the graph to add a room; 6. hover a node or an edge for its sentence; 7. the plan below
re-solves **synchronously** on every change.

`C115-75` The three plan direct-manipulation gestures **MUST** survive: **reorder pins** ·
**party-wall drag** (with its live both-numbers preview, its *"Nothing was clamped"* refusal, its
escape-hatch arms and its conservation rule) · **draw-new-room**. Their arbitration over one pointer
is load-bearing: the release listener lives on the SVG root because the browser fires `pointerup` at
the destination, and a per-cell listener would never run **while a spec written against one would
still pass**.

`C115-76` The following **MUST** survive: the **16**-kind room library with each kind's occupancy
mapping, its *why*, and its target-area source (**7** preset citations + **10** `pryzm-default`
reasons + **1** explicit no-mapping) · the one-palette rule (legend, plan cells and 3-D prism read
ONE palette by ONE key) · the programme list with editable name and area · the solved plan preview
including the named **residual/unallocated** ring · the legend · the *"What this arrangement
honours"* report with its per-unsatisfied-pair sentences · rooms-per-level with its **4** envelope
arms and its explicit *"Level not known"* group · the room-import honesty rule (one automatic load,
into an EMPTY programme only, inventing nothing).

`C115-77` ⚠ **NOT-YET-TRUE and it belongs in this contract:** the room programme is **session-only**
— pins, wall drags and drawn rooms **die on reload**, while the space envelopes they produce are
persisted. A PR that presents the programme as project state **MUST** add persistence or state the
asymmetry on the surface.

`C115-78` ⚠ **NOT-YET-TRUE:** plugging a relationship is **pointer-only**. There is no click or
keyboard route to PLUG (chips have a click fallback; nodes and edges do not), so a touch or keyboard
user can add rooms but not relationships (OPEN DEFECT D-9).

---

## §9 — STAGE 06: COST

**Cost exists. It exists TWICE, and that is the duplication.** ⛔ *"If cost does not exist"* is not
the situation here, and this contract will not describe it as one:

- **Surface A** (card-owned): a **published, cited, licensed** estimator — 10 building groups with
  their rates, published correction factors carrying the ordinance's verbatim wording, a five-field
  source line, a three-member licence-status union with its note, a *"verify at"* reference and an
  **8**-item exclusions list each citing an article. It is keyed to the **theoretical maximum**
  (the permitted study GFA).
- **Surface B** (tab-owned): a **user-supplied-rate** estimator over the **declared** area, with 9
  explicit currencies and a rate the user sets.

`C115-79` Stage 06 **MUST** be **ONE** cost answer, based on the **ACTUAL PROPOSED design**, never
the theoretical maximum.
`C115-80` The published-rate machinery **MUST MIGRATE** into **"Cost assumptions & source"** — it
**MUST NOT** be deleted. It is the only thing that satisfies the founder's ASK rule.
`C115-81` ⛔ **When no valid PRYZM rate applies to the location or the building type, the panel MUST
ASK for a user assumption rather than inventing one.** The refusal arms that already do this
(*"PRYZM does not substitute a €/m² from a different municipality — a rate from the wrong market is
a wrong number, not an approximate one"*; *"the published table spans X to Y €/m² … Pick one"*)
**MUST** survive verbatim.
`C115-82` The estimate **MUST** be labelled as an assumption the user can **SEE and CHANGE**, never
presented as a quote. The currency **MUST NOT** be inferred from locale (C38 §1.2).
`C115-83` A rate of zero **MUST** refuse — *"not a free building; it is a rate nobody has decided
yet."*
`C115-84` Everything in PR-F-10 **MUST** remain reachable behind the assumptions disclosure.

⚠ **Scope, honestly:** exactly **one** jurisdiction ships a published rate model. Everywhere else
the honest answer is already a refusal plus an ASK, and that **is** the minimum honest version — it
is shipped, not aspirational.
⚠ **Count correction:** the cost fold has **FOUR** return arms (`no-module · no-gfa · no-typology ·
estimated`) plus an error path. Its own doc comment says five, and two call sites repeat the stale
number. `C115-85` The comment **MUST** be corrected in the same PR that touches the fold.

---

## §10 — THE CARD-vs-TAB OWNERSHIP CONSTRAINT

**The constraint, measured and unchanged at HEAD:** the buildable-envelope card is a
**closure-scoped singleton** created once, **re-parented** by `appendChild`, and rebuilt **whole** by
**four** `panel.innerHTML =` assignments. **Nine** of its sections — including massing options
(Stage 03), designed-vs-permitted (Stage 04), cost (Stage 06) and the site-data fold plus the
four-ceiling headline (Stage 02) — are **string-concatenated into one `innerHTML`** and are
therefore **card-owned**. The tab appends the card's slot into question 2.

`C115-86` ⛔ **THE FORBIDDEN FIX: a `MutationObserver` re-moving nodes on every render.** Any node
re-parented out of the card is destroyed on the next repaint; re-moving it each time is a shortcut
that makes every future card change a race.

`C115-87` ⭐ **THE PRESCRIBED FIX: a HOST ARBITER that renders the card's sections as separately
mountable producers** — C19 §5.7 clause 1's own remedy (*"a second card instance or a host arbiter,
never a copied renderer"*).

`C115-88` The arbiter **MUST** satisfy all of:

1. **No host branch inside the card's renderer.** C19 §5.7; and the ceiling headline is explicitly
   *"ONE HEADLINE FOR ALL THREE HOSTS"*.
2. **No copied renderer.** A second producer of a setback or a height is a C19 §5.6 / C06 §13.3
   violation with a legal consequence.
3. **It handles all FOUR render arms** (§3.B), not only the full one.
4. **Section identity is the existing closed `EnvelopeCardSection` union**, extended if needed —
   ⭐ the sections are *already* named, ordered and gated by a pure, tested function, and the
   arbiter **MUST** extend that rather than invent a registry.
5. **Producers return a mountable, not a string.** Today `buildStagedSectionsHtml` takes a partial
   record of HTML **strings** and joins them; that signature is precisely what makes separate
   mounting impossible.
6. **Fold memory and scroll restoration survive** (§11) — capture scroll **before** the swap.
7. **One model read per pass, handed to every rendering.** A cache is explicitly refused today
   because three callers must see one vintage; the arbiter **MUST NOT** introduce one.
8. **The singleton discipline holds**: no host releases the shared card on its own dispose; no host
   clears its slot wholesale; self-healing beats explicit release.

`C115-89` ⚠ **NOT-YET-TRUE:** two hosts open at once is a **named, unfixed** property today. The
arbiter does not fix it and **MUST NOT** be described as fixing it.

---

## §11 — THE DISCLOSURE PRIMITIVE: ONE, REUSED

**Measured: there are FIVE rival disclosure mechanisms on this one surface** — the question group's
`<details>` with a module-level open-state map; the card's **second** open-state map keyed by
`data-testid`; an untagged `<details>` emitted inside the layout closure (which therefore **cannot**
remember its state, OPEN DEFECT D-3); the setback register's hand-carried `open` flag re-read off
the previous element; and the cost section's **private copy** of a fold helper with an untagged
nested `<details>`.

`C115-90` The panel **MUST** have **ONE** disclosure primitive. `C115-91` It **MUST NOT** be a sixth
mechanism: the two existing map-backed implementations **MUST** be unified, not joined by a third.

`C115-92` The primitive's API **MUST** provide, and every disclosure on the panel **MUST** use it:

| API | Obligation |
|---|---|
| `key` | a stable `data-testid`. ⛔ **An untagged `<details>` is NOT a disclosure** — it cannot remember, and a fold that snaps shut on every store notification *"is an obstacle, not a dropdown"* |
| `summary` | **MUST** state the answer, not the category. A collapsed fold that says *"Massing options — using L — Two wings of 8"* is still an answer; *"Massing options"* is not |
| `open` default | designed per section; session-scoped memory, **deliberately not persisted**, so a new session gets the designed defaults back |
| re-attach after `innerHTML` | mandatory, with **scroll captured before the swap** |
| `reset` | test-only |

`C115-93` The three disclosure affordances the founder names — **"View full parcel data"**,
**"Why?"** and **"Cost assumptions & source"** — **MUST** be instances of this one primitive.
`C115-94` ⭐ **The "Why?" affordance MUST become PER VALUE.** Today the evidence exists per row but
the affordance is one card-level aggregate fold. The founder's example is explicit: *"19.0 m —
Buildable depth · PUB · DERIVED · Why? → opens the existing detailed derivation, legal text,
calculation and citations."* `C115-95` This is **progressive disclosure, not data removal**: the
aggregate fold's content moves into per-value drawers and **MUST NOT** shrink on the way.
`C115-96` The pattern everywhere is **Summary → Details → Evidence**, never *Summary + Details +
Evidence + repeated Summary*.

---

## §12 — RELATIONSHIP TO EXISTING GOVERNANCE

`C115-97` This section is normative about **who owns what**, so that no two documents rival each
other on one question (C84 EI-9).

| Document | Disposition | What it keeps owning |
|---|---|---|
| **STR §26.6** (the complete Parcel Law card spec) | ⭐ **RETAINED AND AMENDED — NOT SUPERSEDED** | It remains the founder-transmission record and the implementation ledger (§26.6.7). **AMENDED on exactly two axes:** its **six**-section list is superseded by §1's **seven** stages; and its four cross-cutting rules are **absorbed and extended** here — rule 1 (one figure, one place) becomes §2, rule 2 (every figure is a hyperlink to its geometry) becomes PR-G-26 + §3.G, rule 3 (one both-numbers producer) becomes §6.1, rule 4 stays with its own lane. ⛔ **Its §26.6.7 status ledger is NOT re-litigated here** — in particular *"Card-vs-tab ownership"* is a **STANDING CONSTRAINT, not open work**, and §10 states the prescribed fix rather than re-opening the question |
| **C58** | **RETAINED — outranks this document on every legal question** | What the determination says; refusals (§1.13); the transient/absent distinction (§1.13.8); the authoring provenance rules (§1.19, ⚠ with the clause-3 correction §5.4 records as OWED); the envelope-is-not-a-gate ruling (§1.20) |
| **C19 §5.6–§5.8** | **RETAINED** | The tab re-derives nothing; the singleton/mount-per-host mechanics; the named-state rule for the parcel-before-envelope gap. §10 applies its §5.7 clause 1 remedy |
| **C57** | **RETAINED** | Parcel provenance, the three-area separation, the mandatory attribution line |
| **C114** | **RETAINED** | The proposed geometry, its verbs, its refusals, and §3a's three-authorities rule which §7 implements |
| **C06 §13.3** | **RETAINED** | Re-host the dispatch, never copy the handler. §2.1 and §10 both rest on it |
| **C08 §3.1** | **RETAINED — and it bounds §11** | Disclosure state is **session-local UI state**, not collaborative document state. ⛔ Fold open/closed **MUST NOT** enter the CRDT document or become a synced per-project field |
| **C80** | **RETAINED** | *"May this pass replace this?"* — asked with numbers before every generated replacement. §5.3's open defect is a C80 question, not a styling one |
| **C83 / C74** | **RETAINED** | IMPOSSIBLE vs INADVISABLE vs FINE; refusals carry both numbers |
| **C84** | **RETAINED** | One authority per question — the rule §2 and §11 both enforce |

`C115-98` ⛔ **This contract MUST NOT be read as a second spec for the card.** Where STR §26.6
describes a section and this document assigns it a canonical home, **the home assignment governs**
and STR §26.6's section list is amended by §1. Where they agree, they agree.

### §12.1 — ⛔ TWO SHIPPED DEFECTS THIS REFACTOR INHERITS AND MUST NOT PRESERVE

`C115-99` **Q1's and Q2's collapsed digests mirror NOTHING on a fully determined parcel** and fall
through to *"no plot committed"* / *"no determination held"*. Cause: a previous consolidation
removed the tab's law-scope rendering but left the digest probes pointing at it, and the card
typesets the parcel value in a different class than the probe selects. `C115-100` **Probes MUST
move with the rendering they mirror, in the same PR** — this is exactly the failure §2.5's
relocation stamp and PR-H-02 exist to prevent, and it will recur on every block this refactor moves.

`C115-101` **A full second law-scope rendering — richer than the card's — is unreachable in
production.** It carries the three setbacks as **separate rows each with its own not-derived state**
(vs the card's one collapsed triple string), a named buildable-footprint row, a max-GFA row and the
`FactBasis` badges. ⛔ **It MUST NOT be deleted as dead code: it is the only implementation of the
founder's per-row VALUE + STATUS shape and should be the BASIS of the new Buildability block.**

### §12.2 — Specs that will and will not catch a lossy refactor

⚠ **NOT-YET-TRUE: there is no cross-file exhaustiveness gate.** Each spec pins its own file's arms.
The one spec written to enforce *"one figure, one place"* counts only the four ceiling labels, is
structurally blind to the buildable-depth breach, and **positively asserts the headline copy the
breach half lives in**. `C115-102` The gate §4.2 requires (a mechanically generated non-value and
testid inventory) **MUST** land with the refactor, or the register in §3 has no mechanical guard.

### §12.3 — Fixture honesty

`C115-103` ⛔ A fake **MUST NOT** be less capable than the real thing. The rule-1 spec's fake fold
contains no Parcel group, while the real fold does — so the spec cannot see the parcel duplication
it was written to prevent. This is the inverse of the repository's `fake-more-capable-than-real`
record and it is just as blinding.

### §12.4 — Known vocabulary drift, recorded

`C115-104` **Seven independent spellings of *"no parcel is committed"*** exist across seven modules,
none sharing a constant. Consolidating them is in scope for §4.2's minted vocabulary; **doing it by
deleting six of the seven surfaces is not.**

---

## §13 — ACCEPTANCE CRITERIA

`C115-105` A PR claiming to implement this contract **MUST** be checkable against every clause below.
Each is derived from the founder's own list.

| # | Criterion | How it is checked |
|---|---|---|
| **AC-1** | **0 data points lost** | Every §3 register entry is reachable in the refactored panel. The count assertions in §3.C and §3.D hold |
| **AC-2** | **0 citations lost** | Every §3.F row survives; the 18 constraint labels keep their local legal terms; the deliberate suppressions (PR-F-12) are still suppressed |
| **AC-3** | **0 hyperlinks broken** | Both real anchors still resolve; the three-way fallback still has three arms; **D-1 and D-2 are FIXED, not merely not-worsened** |
| **AC-4** | **0 graph functionality removed** | All seven behaviours of `C115-74` and all three gestures of `C115-75` work in a real DOM |
| **AC-5** | **One canonical home per value** | The §2.2 table holds; every non-canonical occurrence is a reference, a summary or an expandable — and carries a §2.5 relocation stamp |
| **AC-6** | **No second producer** | No new module computes a value an existing producer already computes. `utilisationPct` still has one producer |
| **AC-7** | **Seven stages, in order, each ending in one affordance** | §1's table |
| **AC-8** | **Every regulatory value carries VALUE + STATUS + SOURCE/CONFIDENCE + "Why?"** | §11's per-value drawer; §4.1's states; the badge and source ladders keep their order |
| **AC-9** | **No silent clamping** | §6.1: both numbers, geometry unchanged, and a not-derived ceiling reads *not checkable* |
| **AC-10** | **One feasibility table with five states and three value columns** | §7; missing data is neither 0 % nor 100 % nor a pass |
| **AC-11** | **Cost is based on the proposed design, and asks when it cannot answer** | §9; the published machinery is behind the assumptions disclosure, not deleted |
| **AC-12** | **Three geometries, never merged** | §5; no design act writes the permitted envelope; **D-4 and D-5 are addressed or explicitly deferred with an ISSUE-LOG row** |
| **AC-13** | **Progressive by project state, without an honesty regression** | §4.4's four-part test; the cold-start view is one line; every failure arm still renders |
| **AC-14** | **One disclosure primitive** | §11; no untagged `<details>` remains; scroll and fold state survive every repaint |
| **AC-15** | **A host arbiter, not a MutationObserver** | §10's eight sub-clauses |
| **AC-16** | **Probes and testids moved with their renderings** | §12.1; no digest mirrors nothing; the chat still drives the controls it drives today |
| **AC-17** | **An exhaustiveness gate exists** | §12.2; the register has a mechanical guard |
| **AC-18** | ⚠ **Seen in a browser** | STR §26.6.7's one genuinely open row. A DOM-level proof is not a pixel-level proof |

---

## §14 — WHAT THIS CONTRACT CANNOT YET ASSERT

Recorded as findings rather than gaps, per C84 §6.

1. **Runtime cardinality of the 16 unbounded families.** §3.D counts **call sites and field
   definitions**, not pixels on one parcel.
2. **Whether the Q1/Q2 digest probes are dead at RUNTIME** rather than by source reading. The
   emitter trace is complete and consistent; **the suite was not run** and the app was not opened.
3. **How many `ordinanceRef` values are absolute http(s) URLs in production data, per jurisdiction.**
   If almost none are, *"0 hyperlinks broken"* is a near-zero baseline and the founder's real ask —
   citations that are **functional** — is satisfied for roughly **2 of ~36** carriers today. This is
   the single most important unknown behind AC-3.
4. **Whether the GIS rail PARCEL panel and the floating GIS card render anything the tab does not.**
   C19 §5.7 says the card is a re-homed singleton with no host branch, so they should be identical.
   **They were not diffed.**
5. **Whether the three-envelope legend is actually visible beside the 3D and 2D site views**, given
   it is rendered by a singleton moved between hosts at mount time.
6. **Whether `SpaceEnvelope.basis`** (the proposed geometry's own zone citation) **is rendered
   anywhere.** No render site was found — it may be authored-but-unwired.
7. **Whether `ParcelLawModel.confidence` is rendered anywhere.** Same shape.
8. **Whether the setback register's per-edge `ordinanceRef` and `provenance` reach the DOM as
   fields** — the renderer prints only the composed verdict sentence, so they may be model-only.
9. **Whether the room-programme rooms and the space-envelope room envelopes can ever be the SAME
   records read two ways.** Classified here as NOT a duplication (§2.3(e)); it is the classification
   the auditor was least sure of.
10. **The full non-value inventory of `parcelLawChat.ts`, `parcelLawEnvelopeAuthoring.ts`,
    `parcelLawCreateHouse.ts` and the three room-plan solvers.** Walked by exports and testids only;
    they may mint further user-facing sentences.
11. **The complete refusal-code roster of `siteDispatch.ts`** (per-city unverified refusals). Each
    is a distinct rendered card headline; the total is unknown.
12. **Whether the panel's chips and the 3-D solid's hue can disagree.** The confidence is encoded in
    both; the agreement was not measured.
13. **Whether `UndeterminedReason.detail` reaches any pixel on this panel.** If it does not, that is
    itself a dropped explanation.
14. ⚠ **Pixels.** Nothing in this contract has been verified in a browser. Every measurement behind
    it is a source read or a DOM-level test. `C115-106` A PR **MUST NOT** report AC-18 as met on the
    strength of a passing suite.

---

## §15 — OPEN DEFECTS NAMED BY THIS CONTRACT

`C115-107` Each **MUST** acquire an `ISSUE-LOG.md` row. ⚠ **None has one yet** — this contract names
them; it does not log them.

| # | Defect | Clause |
|---|---|---|
| **D-1** | A real source URL rendered as unclickable plain text (*"Verify at"*), in two places | PR-F-04, `C115-25` |
| **D-2** | The headline source line drops a non-http citation entirely, with no plain-text fallback, contradicting its own comment | PR-F-05, `C115-26` |
| **D-3** | Two honesty caveats emit untagged `<details>` and cannot remember their open state | PR-H-07, §11 |
| **D-4** | A hand-edited generated plate keeps `computed` provenance and is deleted by the next generated option; **no test covers it** | §5.3, `C115-45` |
| **D-5** | Room envelope specs carry no provenance at all | §5.3, `C115-46` |
| **D-6** | The three-envelope legend has one call site, inside another section; the scene renderers omit its orientative sentence | §5.5 |
| **D-7** | `startStoreyId` is accepted by the planner and offered by nothing | §6.3, `C115-57` |
| **D-8** | One intended-area rendering can print a stale number above three live ones | §7.4, `C115-71` |
| **D-9** | Plugging a graph relationship is pointer-only — no click, no keyboard route | §8, `C115-78` |
| **D-10** | Q1 and Q2 collapsed digests mirror nothing on a determined parcel | §12.1, `C115-99` |
| **D-11** | A boundary clear preserves a stale `buildableRing` and `buildableDetermination` | §5.2 |
| **D-12** | Room replacement **deletes before it plans**, and the plan can still refuse — rooms lost with nothing created; and its `supersedes` field is populated but never reaches the payload | §8 |

---

## §16 — GATES

| Gate | Applies how |
|---|---|
| `check-contract-index-equivalence.ts` | ⭐ **this file needs a README row in the SAME COMMIT** — arm A (FILE-WITHOUT-ROW) is a shrink-only ratchet and a row-less file breaches it. CLAUDE.md records **five** recurrences of exactly this defect |
| `check-contract-cited-paths.ts` | every repo path cited above resolves on disk; nothing here is marked `PLANNED` |
| `check-no-direct-store-writes.ts` (P6) | ⛔ this refactor adds **zero** new tolerated direct writes. ⚠ §5.2 records that the **site** store has no equivalent gate |
| `check-otel-spans.ts` (P8 ZONE A) | any new exported producer this refactor mints carries ≥1 span |
| `check-layer-boundaries.ts` | the register's L2/L3 producers (`site-parcel-data`, `core-app-model`) **MUST NOT** acquire an L7 import in the course of consolidation |
| **NOT-YET-EXISTING** | ⚠ the exhaustiveness gate `C115-102` requires. Until it ships, §3 is enforced by review alone |

---

## §17 — STATUS (living record — appended, never rewritten)

### 2026-09-07 · lane PARCEL-LAW-IA · MINTED
Written from the founder's 2026-09-07 brief plus a five-part audit dossier, **every part of which
was independently verified and every part of which was refuted on completeness** (§0.2). The
corrected claims govern; the register in §3 folds in every item the verifiers listed as a deletion
risk. **Nothing in this document has been seen in a browser** (§14.14), no code was changed by this
lane, and no ADR ratifies it yet (header). **Twelve open defects are named in §15 and none has an
ISSUE-LOG row.**
