# BIM 3.0 contract review — coordinator findings

> **Stamp**: 2026-08-12 · Findings raised by the coordinator or the founder during the review,
> carried here so the synthesis cannot lose them. Ids `COORD-nn`, same discipline as A/B/C/D/E.

## COORD-01 — There is no canonical element-family declaration, so per-kind coverage is unmeasurable (founder finding, 2026-08-12)

**The founder's statement, verbatim in substance:** the element-kind census is *evidence of an
architectural coverage problem, not itself a coverage metric*. The project lacks a canonical
declaration mapping an element family to its **schema identity · authoring/type lifecycle ·
command surface · semantic-graph obligations · propagation obligations · interchange mapping ·
conversational reachability**. Consequently **per-kind percentages are not meaningful until that
declaration exists.**

**The measured evidence behind it** (census, EXECUTED-CITED):
- Three disagreeing kind enumerations: schema barrel **28** · chat probe list **16** ·
  parameter-routing table **11**. No document declares which is the denominator.
- `level` / `site`: verbs, no schema, in no list. `verticalCirculation`: schema + geometry +
  graph-writing command, **no verb**. `zone/apartment`: IFC exporter only.
- The two IFC export paths map **different kind sets** (orchestrator: 6; IFC4X3: +space/zone).
- C65 owns the element **TYPE** lifecycle only and explicitly disclaims the kind enumeration;
  C69 owns **verbs**; C71 owns **relationships**; C68 owns **chat arrival**. **Nothing owns the
  family ↔ obligations mapping.** Every existing contract governs one column of a table whose
  rows nobody declares.

**Why this is the C69 lesson one level up.** C69 §0's founding argument was that a hand-maintained
list is already wrong, and that *"nothing owned the question"* — two gates disagreed with each
other and with the code about what verbs existed. The family table is in the identical state:
three rival enumerations, each an accidental byproduct of some subsystem's needs. And every
"X% of kinds have Y" claim made anywhere (including in this review's own inputs) silently picks
one of the three denominators.

**The shape of the fix — for the synthesis to propose, and it is register + contract, not a doc:**
1. **An ELEMENT FAMILY REGISTER**, generated like `API-VERB-REGISTER.md`, one row per family.
   The **measured** columns are generated from source (schema file exists? verbs? graph writers?
   IFC mapping? chat targets?) — never transcribed. The **obligation** columns are *declared*
   (which of the seven obligations this family owes at its declared tier) — because obligations
   are normative and cannot be derived from code that may be wrong.
2. **The gate diffs declared against measured, both directions**: a family measured to have a
   capability it does not declare is as much a finding as a family declaring one it does not
   have. This is the C69 §3.4 both-directions rule applied to families.
3. **A tier vocabulary** so partial families are declared rather than discovered — e.g. a family
   may legitimately declare "no chat reachability" (annotations?) or "no IFC mapping" (pool?),
   but it must say so, on the named list, per the C68 §1 principle: reach it or refuse it out
   loud, decided by a gate, never by memory.
4. **Ownership**: no existing contract can own this cleanly — C65/C68/C69/C71 each own one
   column. This is the review's clearest candidate for a **new contract (C76)** under the
   founder's own conservatism rule ("only if no existing contract can own it cleanly"), with the
   register as its generated artefact and every per-kind claim in the corpus re-pointed at it.

**Effect on the review**: any Part A–E finding phrased as a per-kind percentage is downgraded to
"evidence over a contested denominator" until the register exists. The census's *per-family
rows* remain valid evidence (they cite file:line); only the *aggregates* are unmeasurable.

## COORD-02 — Settled during review: the contested C-17

PART-C flagged the opening re-clamp evidence as contested (EV-03 proved the hole 08-11; the
capability model recorded it CLOSED 08-12). **Settled by re-measure, not by adjudicating prose:**
`wallShrinkOpeningRefit.test.ts` re-run at HEAD `774a91e6` — **7/7 green**. C-17 is CLOSED; the
capability model's record stands.

## COORD-03 — Landed during review: MT-08 (§UNDO-GESTURE-ID)

The undo gesture race that PART-C's Story A step 17 depends on closed mid-review (`774a91e6`):
gesture identity replaces the 250 ms clock, all three pins green, `undoredo.cert.ts` 19/19 on an
independent re-run. Any Part finding that carries MT-08 as open should be read against this.
