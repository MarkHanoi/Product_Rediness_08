<!--
  SITE TAB RESTRUCTURE — the founder's brief, captured verbatim across three messages
  on 2026-09-09. Written down because it arrived in pieces and the later parts REFINE the
  earlier ones — reading only the first message would implement the wrong thing.

  ⚠ THIS IS A BRIEF, NOT A PLAN. The implementation plan is produced by lane `wjyw26jec`,
  which is tracing what owns each datum before anything moves. Where this brief and the
  lane's findings disagree about what is possible, the lane wins; where they disagree about
  what is WANTED, this brief wins.
-->

# Site tab — restructure brief

> **The founder's one-line intent, in his words:**
> *"basically section 01 becomes the core of data that we know is an informed design data
> section"*

Section ① stops being a thin cadastral header and becomes the place a designer reads
everything PRYZM knows about the plot. ② keeps the actions and the intent. ③ owns the
comparison.

---

## Section ① — "What is this plot?" · becomes the data core

**Move INTO ①:**

| Block | Currently in |
|---|---|
| The **Buildable envelope** block — max levels, max height, max implantation area, max buildable GFA, buildable depth, alignment offset, with its `REAL · CONSTRUCTED` chip and the PGM Art. 242.2 provenance line | ② |
| The whole **"Full site & massing data"** fold — Parcel · Ordinance limits · Massing potential · Per storey · Capacity | the envelope card |
| **"Why these numbers?"** | ② |
| **Setbacks per edge** | — |

⛔ **The panel's own constitution governs every one of these moves:** *"Every figure below is
produced elsewhere and only placed here — nothing on this tab is re-derived, and each one still
states its own source and confidence."* A figure that arrives in ① without its chip, its
citation or its explanatory footnote has been broken, not moved.

⚠ **Section ① will become long, on a panel that now opens at a quarter of the shell**
(§SITE-PANEL-IS-A-QUARTER, L-13285). The founder wants it **all there, not all visible** — the
file already has a `fold()` helper and its own comment says *"every other section on this card
is a default-collapsed `<details>`"*. Use that; do not mint a second disclosure.

---

## Section ② — "What can I build here?" · intent and actions

### ⭐ KEEP the intended-area block — the earlier instruction was refined

The first message said *"remove: Intended area — none declared"*. The **third message
supersedes it** with the populated form he wants kept:

```
Intended area — 1275 m² declared
  Level 5   191 m²      Level 2   230 m²
  Level 4   213 m²      Level 1   194 m²
  Level 3   230 m²      Ground    215 m²
  Total intended area   1275 m²
```

> *"This is what has been declared, not what has been built and not what is permitted — three
> separate questions with three separate authorities. PRYZM does not add them together."*

So the objection was never the block — it was the **permanently-empty state**
(`'Intended area — none declared'`, `envelopeCardSections.ts:816`) sitting on a card he reads
constantly.

⛔ **The empty arm still cannot simply be deleted.** Its text — *"This is a finding, not a gap:
PRYZM can read the store and it is empty"* — is an honest-empty statement, and this repo makes
that a hard rule (§CONTEXT-DATA-HONESTY, L-581, L-616: a failure and an emptiness must never
share a value). The `'Intended area — unavailable'` arm at `:795` is the OTHER half of that
distinction and is the one that must survive: *unavailable* and *none declared* are different
answers.
**The design: show the block when it has data; when it does not, fold the empty statement away
rather than printing it as a row.** Nothing is lost — the distinction is still reachable — and
the noise goes.

### Fold the legend

*"What the volumes in the view mean"* (`envelopeCardSections.ts:1584`) →
**a collapsed disclosure showing only its title.** Its three entries — Permitted envelope /
To-be-built envelope / Room envelopes — stay exactly as written.

⚠ It is currently a bare `<div>` and is one of the few blocks on this card that is NOT a
`fold()`. Converting it is reuse.

### Remove the ground-floor fit tool

*"Know the ground floor you want? Type the area."* (`envelopeCardSections.ts:1824`) with its
`Ground-floor area (m²)` input, **Fit this on the ground floor** and **Clear** —
**"THIS IS NOT RELEVANT ANYMORE"**.

⛔ **CHECK ITS CONSUMERS BEFORE DELETING.** At least three other files reference it by name:
`programmeToEnvelopes.ts:606`, `roomEnvelopePlan.ts:127`, `roomProgrammePanel.ts:2079` — the
last says a thing is *"created by the 'Fit this on the ground floor' control on the other
panel."* If another surface depends on the level plate this control produces, removing the
control removes that path. Establish whether the CAPABILITY is retired or only this ENTRY
POINT, and update the three references either way so they do not point at a control that no
longer exists.

### ⭐ MASSING — the big one

> *"MASSING IS THE MOST IMPORTANT SECTION - AND WE NEED TO TRY TO HAVE MODAL PANEL DATA WITHIN
> THE MAIN PANEL TO THE RIGHT - WITH THE REQUIRED DROP DOWNS ETC…"*

Bring the massing **modal's** content into the right-hand panel inline, with dropdowns. This is
a design task, not a move — it needs its own trace of what the modal holds, what it writes, and
whether the panel can host its controls at quarter width. **Not in the same commit as the small
edits above.**

---

## Section ③ — "What do I want to build?" · ONE source of truth

> *"THIS SECTION IS REPEATED … KEEP ONE SINGLE SOURCE OF TRUTH ON SECTION 3"*

The **Designed vs permitted** block renders **twice**, identically:

```
Designed vs permitted — Not enough to judge this design
  5 of 5 metrics could not be checked. Basis: block-constructed — indicative only.
  Footprint · ocupación          Not checked   Designed —   Permitted 307.7 m²
  Gross floor area               Not checked   Designed —   Permitted —
  Net floor area                 Not checked   Designed —   Permitted —
  Height · altura reguladora     Not checked   Designed —   Permitted 22.4 m
  Storeys · plantas              Not checked   Designed —   Permitted 6
  How these were measured — not at this stage yet.
```

⭐ **This is the repo's dominant defect shape — one rule, two renderings — and it is worth
finding out WHY it duplicated before deleting one.** `envelopeCardSections.ts` has a
`Section (a) — DESIGNED VS PERMITTED` at ~:236. Establish whether the second copy is a second
CALL of one builder (cheap: remove a call) or a second IMPLEMENTATION (then the two can drift,
and the fix is to delete one and point both call sites at the survivor).

⚠ Note the founder ALSO asked for *"Why these numbers?"* to move to ①. The
*"How these were measured"* line belongs to this block. Keep them together — whichever section
wins, the explanation travels with the figures.

---

## Open questions for the founder

1. **Massing modal → panel** — which modal exactly, and does it keep a modal form as well, or
   is the panel the only home?
2. **The ground-floor fit tool** — is the capability retired, or only this entry point?
3. Once ①  holds the envelope and the massing data, is ② still *"What can I build here?"*, or
   does it become the intent-and-actions section under a new heading?
