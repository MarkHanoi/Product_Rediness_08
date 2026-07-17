# ADR-0123 — What does an edited TAG edit? (and the coherence rule it shares with ADR-0266)

- **Status:** **PROPOSED — the tag half is decided here; it is BINDING ONLY TOGETHER WITH ADR-0266.**
- **Date:** 2026-07-14
- **Tag:** §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291)
- **Contracts:** C03 (annotation is an element), C16 (edit = command), C24 (paper/scale), C28 (schedules)
- **Siblings:** ADR-0121 (associativity + presentation split), **ADR-0266 (does an edited DIMENSION
  drive the model or override the text?) — PROPOSED, awaiting the founder**

---

## 1. The question

"Editable" is ambiguous, and the two readings are different products. When a user edits the text in
a door tag from `D-01` to `D-07`, either:

- **(i) it edits the ELEMENT'S MARK** — `door.mark` — and therefore **changes the schedule**, because
  I proved in L-265 that `ScheduleExtractor` joins the Doors/Windows schedules on exactly that field.
  This is what a BIM tool does.
- **(ii) it is a DISPLAY OVERRIDE** — the drawing says `D-07`, the schedule still says `D-01`. This is
  what a CAD tool does, and it is how drawings drift from models.

## 2. Decision

**A tag edit WRITES THE ELEMENT'S MARK (option i). A tag has no display-override field, and must not
grow one.**

Reasons, in order of weight:

1. **The tag IS the join.** A tagged plan is schedulable *because* the bubble and the schedule row
   carry the same key (C28). A display override does not "annotate" that join — it **breaks** it, and
   it breaks it silently: two documents, both plausible, disagreeing. That is the exact failure class
   this whole workstream has been closing (L-287: "a drawing that is confidently wrong is worse than
   one that is obviously broken").
2. **A mark is DATA, not derived geometry.** `element.mark` is user-editable metadata minted by
   `generateMark()` at create time and explicitly "NOT an ID — it can be updated" (Contract §03-1.7).
   Writing it from the tag is not a clever inference; it is an ordinary, reversible, command-shaped
   edit of a field that exists to be edited. **This is why the tag case is easier than the dimension
   case** — a dimension's value is *derived from geometry*, so "driving" it means moving a building.
3. **It is the only option that keeps one truth.** Rename in the tag → the schedule updates; rename in
   the schedule → the tag re-derives (its `cachedLabel` is refreshed by the same idempotent
   reconciler, L-265). Round-trip, one source.

### The mechanism (already in place)

`UpdateAnnotationPresentationCommand` (L-287) **cannot** carry this edit — it takes
`{offset, screenOverride, symbolPoint}` and nothing else. That is correct and deliberate: editing a
tag's text is **not** a presentation edit. It is an **element** edit, and it must go through the
element command path (`UpdateElementMark` / the generic element-parameter command), after which the
tag's displayed label re-derives from the record like any other. **The drag path and the text path do
not meet**, which is precisely the L-287 split doing its job.

## 3. THE COHERENCE RULE (this is the part that must not be got wrong)

> **An edited annotation writes to the MODEL, never to the drawing.**

A product in which an edited *tag* drives the model but an edited *dimension* silently overrides its
text (or the reverse) is **incoherent**, and the user discovers it the hard way — on site.

So ADR-0266's open question is constrained by this one:

- If ADR-0266 decides **dimensions DRIVE the model** → fully coherent with this ADR. Both write model.
- If ADR-0266 decides **dimensions may OVERRIDE** → then an override is a **deliberate, flagged,
  exceptional escape hatch** (ADR-0266 already proposes `isOverride` / `isFlagged` and refusing to
  issue a sheet carrying an unflagged one). In that world, **tags still do not get one**: the
  justification for a dimension override (you cannot always move a building to fix a number) **does
  not exist for a mark**, which is a text field that can simply be corrected.
- What is **forbidden in every world**: an *unflagged* override on either. A drawing that quietly
  disagrees with its model is the product failing at its only job.

**These two ADRs must be accepted together.** I am not implementing the tag text edit until ADR-0266 is
resolved, because implementing half of a coherence rule is how the incoherence gets shipped.

## 4. Consequences

- **Now (L-291):** tags are paper-scaled, selectable (bubble **and** leader), and draggable —
  presentation only, references untouched (L-287). The property panel renders **from the record**.
- **On ADR-0266's resolution:** the tag's mark field becomes editable in that panel, writing
  `element.mark` through an element command. The schedule follows in the same breath because it reads
  the same field.
- **Never:** a `tag.overrideText` parameter. If one appears in a diff, this ADR was not read.
