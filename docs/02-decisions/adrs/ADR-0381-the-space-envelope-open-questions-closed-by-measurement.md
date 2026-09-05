# ADR-0381 — The space envelope's remaining open questions, closed by measurement

**Status:** PROPOSED — awaiting founder ratification alongside ADR-0380 and C114
**Date:** 2026-09-04 · **Lane:** ENVELOPE-ELEMENT (round 4)
**Extends:** [`ADR-0380`](ADR-0380-the-space-envelope-is-one-family-with-two-authored-roles.md)
(D1–D6) · [`C114`](../contracts/C114-ELEMENT-SPACE-ENVELOPE.md)
**Authority:** the founder directive
[`STR-ENVELOPE-AS-FIRST-CLASS-ELEMENT`](../../01-strategy/STR-ENVELOPE-AS-FIRST-CLASS-ELEMENT.md)
§6, which names the questions and says in terms that they **must not be decided implicitly in
code**. ADR-0380 decided five. This decides what the *build* then surfaced — and each ruling
below is answered from something that was **executed**, not from a preference.

---

## ⭐ THE RATIFICATION ASK — one paragraph, for the founder

> **PRYZM now has a space envelope you can draw, drag by the face, undo, save and reopen.**
> It is one element family with two roles you author — a **level** envelope (the area and volume
> you intend to build on a storey) and a **room** envelope (an initial layout volume that behaves
> like a room) — and a third, the **maximum buildable** volume, which is *declared and refused*:
> PRYZM will not let you draw the thing it calls the law, because a hand-drawn volume that calls
> itself the legal ceiling cannot be told apart from one the zoning engine produced. Every
> authored envelope carries the word `design-intent` in its own record, so no export, panel or
> report can quietly present it as a permission. What is owed is your **ratification of three
> documents** — `ADR-0380` (the family and its two roles), `C114` (the per-element contract C84
> requires before a family may exist at all), and this ADR (what refuses, what the living graph
> gets, and what is deliberately NOT built). Ratifying them fixes the vocabulary before anything
> else is built on it; declining any ruling costs one lane now and a migration later, because a
> persisted `role` value and a bus verb payload are both file-format facts (C47, C69 §1.1).
> **The one ruling worth your attention is OQ-2:** you asked whether the maximum-buildable volume
> should become an element like the other two. The answer here is **no, and more firmly than when
> ADR-0380 wrote it** — the face-drag gizmo now exists, so promoting that role would make the
> legal ceiling draggable by the same gesture that shapes a design.

---

## OQ-2 — Does type A (`maximumBuildable`) get PROMOTED to an element, or stay a rendering?

**RULING: it stays a DERIVED STUDY and is never promoted. The `role` member stays declared in the
schema and refused at the create verb, exactly as ADR-0380 D2 left it.**

ADR-0380 D2 refused *authoring* it. The question left open was *promotion* — whether
`BuildableEnvelope` should later become a `spaceEnvelope` record with `role: 'maximumBuildable'`,
so that one family covers all three of the directive's types.

**Why the answer is now firmer than it was, and the reason is a thing that got BUILT.**
When D2 was written, the cost of promotion was an argument about honesty. It is now an argument
about a gesture that exists: `spaceEnvelopeFaceDragController.ts` makes every face of every
`spaceEnvelope` record draggable, and it identifies its subject by store key, not by role. A
promoted type A would inherit that gesture by construction — **the legal ceiling would be
draggable with the same drag that shapes a design**, and the resulting volume would be
indistinguishable, in the record and on screen, from one the zoning engine solved. The controller
does carry a role guard, and that guard is defence in depth for exactly this scenario; but a
product position defended only by an `if` in a pointer handler is one refactor from gone.

**What promotion would ALSO destroy, and this is the measured half.** `BuildableEnvelope` carries
a mandatory `EnvelopeConfidence`, a derivation trace and a refusal vocabulary. `spaceEnvelope`
carries none of them, and C114's schema states *why* it deliberately does not copy the confidence:
`capEnvelopeConfidenceToPackDefault` is a MINIMUM, so a tier copied onto an authored record at
authoring time can only ever drift in the **generous** direction. A promoted type A would
therefore be a record that had *lost* the confidence machinery its whole meaning depends on —
[[envelope-solid-overstates-partial-data]] (L-616) is the same defect one level down: an UNKNOWN
constraint drawn as unbounded is an overstatement on real land.

**What would falsify this.** A demonstrated need to *edit* a permitted volume — for example, an
architect negotiating a variance who must record the ceiling they are asking for. That is a real
need and it is **not** this ruling's subject: the honest shape for it is a `level` envelope with a
`basis` citation naming the study it departs from, which the schema already supports and which
reads correctly in every consumer (*"this is what I intend, against that study"*), rather than a
second kind of legal ceiling.

---

## OQ-3 — Does the living graph gain an edge type for envelope membership?

**RULING: NO new member of `UBG_EDGE_TYPES`. `withinId` projects onto the EXISTING `bounds`;
computed adjacency projects onto the EXISTING `adjacentTo`. This confirms ADR-0380 D3 against the
actual vocabulary, which was checked rather than assumed.**

**Measured 2026-09-04** — `packages/building-graph/src/types.ts:33`:

```
UBG_EDGE_TYPES = ['bounds','adjacentTo','connectsTo','circulatesVia','hostedIn',
                  'servesZone','derivesFrom','dependsOn','precededBy','violates']
```

A **closed 10-member tuple** with a Zod enum built from it, so a new member is a contract change
with consumers keyed off it — and `hierarchy.ts:167` deliberately *enumerates* its subset rather
than spreading the tuple at runtime, precisely so a widening cannot leak into a view unnoticed.

**Why `bounds` is right and not merely available.** A level envelope BOUNDS the room envelopes
declared within it — that is the same relation a room's boundary has to the room, which is what
`bounds` already means. An `envelopeContains` member would say the same thing about a different
pair of node kinds, which is C84 EI-9's *"one answer per question"* broken by vocabulary rather
than by storage.

> ⛔ **AND THE PROJECTION IS NOT BUILT.** Stated plainly rather than implied by a ruling that
> reads as though it were: there is no `spaceEnvelope` projector in `@pryzm/building-graph` at
> this commit, so the family contributes **no nodes and no edges** to the living graph today.
> This ADR decides what the projection MUST use when it is written; it does not report that it
> exists. Reporting a decided vocabulary as a working join would be the exact defect
> [[authored-but-unwired-is-the-bottleneck]] names.

---

## OQ-4 — What REFUSES, and on what ground?

**RULING: exactly ONE enforcement refusal in the family. Everything else is ADVISORY.**

| Situation | Verdict | Where |
|---|---|---|
| A face move that would collapse, invert or degenerate the solid | ⛔ **IMPOSSIBLE — refused** | `planSpaceEnvelopeFaceMove`, and the same planner refuses it DURING the drag |
| `role: 'maximumBuildable'` at the create verb | ⛔ **Refused — a product position, not a data problem** (its own error class) | `CreateSpaceEnvelopeBatch` |
| `height <= 0` | ⛔ **Refused** — a footprint pretending to be a volume makes every consumer that divides by it confidently wrong | schema refine + `canExecute` |
| A no-op edit | ⛔ **Refused** — it would spend the user's next Ctrl+Z on an edit that never happened (C113 §6.4) | `SetSpaceEnvelopeParameterHandler` |
| A room envelope declared within a level envelope it sticks OUT of | ⚠ **ADVISORY** | `assessSpaceEnvelopeContainment` |
| An envelope crossing a boundary setback | ⚠ **ADVISORY** | `boundaryDistance` |
| An envelope exceeding the permitted study | ⚠ **ADVISORY** | reported against `basis`, never enforced |

**The rule the table encodes**, from [[spatial-validity-rules-founder-direction]] and C83 §1.2:
*a rule that can never be wrong may refuse.* A solid that contradicts itself can never be
correct — no site, brief or preference makes it so. **Everything else is a report about the
world**, and usually means the design should change rather than that the user made a mistake:
a room envelope poking out of its level envelope most often means the level envelope needs to
grow, and refusing would make the containment field a cage instead of a relationship.

**Two properties every refusal in this family already has, and they are not negotiable.**

1. **BOTH NUMBERS, read from the geometry** (C114 §12a) — *"That move asks for −4.00 m; the limit
   is −2.90 m."* Built in ONE place (`refuse()`), so a caller cannot construct a refusal without
   supplying both, and forwarded **verbatim** by the handler and by the drag controller. A
   paraphrase at either site would be the second copy C84 EI-8a rules out.
2. **KEYED ON SEMANTIC ROLE, never on geometry.** The `maximumBuildable` refusal fires on the
   ROLE, not on the shape — an identical prism is perfectly authorable as a `level` envelope. That
   is the founder's own instruction, and it is why the refusal has its own error class
   (`MaximumBuildableNotAuthorableError`) rather than being a generic validation failure: a caller
   that needs to tell *"you typed the wrong thing"* from *"we will not do that"* needs the two to
   be different types.

---

## OQ-5 — Does the level envelope's per-level gross area feed `measureAuthoredDesign`?

**CLOSED, NOT RE-OPENED. ADR-0380 D5 and C114 §3a already settle it, and lane RESI-ORCH has
honoured the separation with no coordination debt** (reported 2026-09-04: a separate reader, a
separate fold, and no arithmetic between the two numbers).

The three questions are three authorities and are **never summed**:

| Question | Authority |
|---|---|
| *How much has been **BUILT**?* | `measureAuthoredDesign` — measured off REAL floor plates, refusing (`overlapping-floor-plates`, `unattributed-floor-plate`, `no-floor-plates`) rather than guessing |
| *How much is **INTENDED**?* | `spaceEnvelope.footprintAreaM2` × storeys — the authored study |
| *How much is **PERMITTED**?* | `BuildableEnvelope` — solved from the zoning rules |

⛔ **Recorded here only so a future lane does not re-litigate it.** Blending INTENDED into BUILT
would make the panel's built-area headline move when nothing was built — a number that changes
without a cause is worse than a number that is missing, because the user cannot tell which one
they are reading.

---

## OQ-6 — Can the footprint profile edit reuse `_profileEditToolFor` and `WallProfileEditorPort`?

**FINDING, NOT A FAILURE — and the answer is different for the two halves. Measured 2026-09-04.**

**The PORT is reusable in shape and wrong in SUBJECT.** `WallProfileEditorPort`
(`packages/geometry-wall/src/WallProfileEditor.ts:82`) is four members — `isActive`, `activate`,
`deactivate`, `showRefusal` — and carries no wall vocabulary at all. But its subject,
`WallProfileEditorSubject`, is an ELEVATION in `(u, v)` over `length × height`: it edits the FACE
of a thing, on a vertical plane. **A space envelope's profile is its FOOTPRINT** — a ring on the
level's horizontal plane, whose commit verb `spaceEnvelope.setFootprint` already exists. Those are
different planes and different vocabularies, and forcing one into the other would be the *"a
richer hardcoded glyph is the same bug at higher resolution"* mistake. ⭐ The reusable route for a
footprint is the SLAB one (`enterProfileEditMode` over a plan polygon), not the wall one — and
the port genuinely *is* reusable, unchanged, for a future **side-face elevation** profile, which
is a real feature and is not this one.

**The BLOCKER is the resolver, not the port.** `ContextualEditBar._profileEditToolFor(type)`
resolves `window.slabTool | floorTool | ceilingTool | wallTool` and returns the tool **only** when
it implements `enterProfileEditMode` — a runtime `typeof` guard, so a wrong map entry disables the
button rather than resurrecting a dead one. That design is right, and it means the family cannot
appear in that map until it has a `window.spaceEnvelopeTool` implementing `enterProfileEditMode`
**and** `profileEditAvailability`.

⛔ **AND THIS FAMILY WAS DELIBERATELY BUILT WITHOUT A `window.*` GLOBAL.** That is the tension,
stated rather than resolved by accident: C114 §2a's whole point is that the family has exactly one
authority reachable at `runtime.stores.spaceEnvelope`, and every other route — including a
`window` tool object — is a second handle on the same records. **The honest options, for whoever
takes this next:**

- **(a)** Mint a thin `window.spaceEnvelopeTool` that owns *only* the profile-edit session and
  dispatches `spaceEnvelope.setFootprint` — no store, no records, no second authority. This is
  what `slabTool` effectively is for this purpose, and it is the smallest change that makes the
  existing button work.
- **(b)** Widen `_profileEditToolFor` to accept a registry entry instead of a `window` global.
  Architecturally better and strictly larger: it touches a resolver four families depend on, and
  `ContextualEditBar`'s own header records what a wrong entry there has already cost (a button
  that did nothing, for floor and ceiling, until §FIX-DEAD-EDIT-PROFILE-BUTTON).

⭐ **Neither is done here, and the button is NOT listed for `spaceEnvelope`** — because
`_profileEditToolFor`'s rule is that *a type is listed if and only if its tool implements the
method*, and offering a gesture that does nothing is the precise defect that resolver exists to
prevent. The fix was to stop OFFERING the action, which is better than refusing it politely.

---

## What this ADR does NOT decide

- **`spaceEnvelope.changeLevel`** — declared in C114 §6 and not built. Owed, not dropped.
- **`spaceEnvelope.promoteToRoom`** — DEFERRED to Stage H by C114 §6; it is C80's *"may this pass
  replace this?"* question and needs that ruling first.
- **The plan and section symbols** — no producer exists for this family; registering an id with
  the view dependency tracker makes it KNOWN to that pipeline, not drawn by it.
- **Concave footprint caps** — the 3-D top/bottom faces are a fan triangulation, correct for a
  CONVEX ring only. A concave storey outline draws a wrong cap while every side face stays right:
  a VISIBLE artefact, declared here rather than discovered from a screenshot.
