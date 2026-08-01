# L-676 — Supersession: 147 unread → **46 to read, 3 READ**, and the funnel is now a live query

**CLOSURE-REGISTER row 9 · bucket A · P1 → P2 · status: still OPEN, materially advanced**

> **Tool:** `tools/rpuc-supersession/classify.mjs` (committed, re-runnable, live).
> `node tools/rpuc-supersession/classify.mjs [--json] [--offline <payload.json>]`
>
> **THE QUESTION, unchanged:** were PGM-1976 **Arts. 239 · 320 · 327 · 328** amended after the
> 2 March 2007 MPGM (expedient 2006/025790/B, DOGC 4893)? Those four carry PRYZM's shipped Barcelona
> numbers — 239 (*alçada reguladora* under *ordenació segons alineació de vial*), 320 (clau 12,
> *nucli antic*), 327/328 (clau 13b, *interior d'illa*).
>
> **L-660 left it at `NOT_VERIFIED / not_found`, having walked 1 755 → 773 → 147 → 9 flagged by
> title → 0 opened.** This pass reproduces the funnel **as a live query rather than a number in a
> document**, screens the 147 deterministically, and **opens the top of the list**.

---

## 1 — THE FUNNEL, RE-DERIVED LIVE (2026-08-01)

Against the RPUC — the OFFICIAL register — at
`planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/basica?municipi=08019`.
⚠ The old host `rpucportal.territori.gencat.cat` **no longer resolves** (L-660 follow-up 5).

| step | n |
|---|---:|
| Barcelona instruments enumerated in the register | **1 755** |
| approved after 2007-03-02 | **773** |
| **PGM-LEVEL** (`Modificació de pla general d'ordenació` 145 + `Modificació normes subsidiàries` 2) | **147** |

**1 755 / 773 / 147 reproduce L-660 exactly**, from an independent re-run. The 147 is therefore no
longer a figure copied between documents — it is a query anyone can re-execute, and it will grow as
new instruments are approved. ⚠ **Deliberately NOT frozen into a fixture:** an instrument approved
tomorrow is precisely what this audit is looking for, so the enumeration must be *re-run*, never
replayed. (`--offline` exists only to re-classify a saved payload.)

---

## 2 — TWO ORTHOGONAL SCREENS, and the union survives

**SCREEN 1 — INSTRUMENT SCOPE.** A PGM modification either edits the ***Normes urbanístiques*** (the
articulat, city-wide) or re-ordains a **delimited àmbit**. Only the first can amend an article's
TEXT. Catalan practice titles them differently on their face —
*«Modificació de les **Normes urbanístiques** del Pla general metropolità…»* versus
*«Modificació … **a l'àmbit / al carrer / en els entorns de** …»*. **Anything matching neither is
`AMBIGUOUS` and joins the reading list: the screen FAILS OPEN.**

**SCREEN 2 — SUBJECT MATTER.** Independently of scope: does the title name *alçada/alçària
reguladora*, *profunditat edificable*, *interior d'illa*, *nucli antic*, *ordenació segons alineació
de vial*, or the *Normes urbanístiques* themselves? ⭐ **A subject hit lands on the reading list
WHATEVER its scope**, because a site-specific plan cannot rewrite an article but **can disapply it
inside its own àmbit** — and PRYZM, routing on the MUC's clau, would never see that override.

| SCREEN 1 result | n |
|---|---:|
| **general-normative** | **5** |
| `AMBIGUOUS` (fails open) | 38 |
| site-specific | 104 |

### ⇒ **READING LIST: 46 of 147.** 101 set aside — a **69 % reduction**.

---

## 3 — THE 5 GENERAL-NORMATIVE INSTRUMENTS, AND WHAT READING THEM SHOWED

The screen independently recovers **exactly the family L-660 named** (art. 264 · aparcaments ·
equipaments comunitaris · 22@ Normes) — plus, as a self-check, **the 2007 baseline instrument
itself** (`2006/025790/B`, codi 232336, which the register dates by its 2007-05-29 *publication*).
That the screen finds the very instrument whose supersession is being audited is the cheapest
available proof it is not silently dropping normative modifications.

The four genuinely-later ones were **downloaded from the RPUC document endpoint and text-checked**:

| expedient | approved | subject | digit-integrity gate | Arts. 239/320/327/328 present? | articles the text names |
|---|---|---|---|---|---|
| **2018/067099/B** (codi 282786) | 2018-09-18 | aparcaments | **PASS** (10 p, 1 416 digit glyphs) | **NO — none of the four** | 3, 5, 12, 29, 66, 106, 198, **297–300** |
| **2023/080788/B** (codi 298194) | 2023-12-21 | equipaments comunitaris | **PASS** (7 p, 291 digit glyphs) | **NO** ⚠ see the trap below | 9, 12, 66, 106, 112, **212–217**, 298 |
| **2024/082320/B** (codi 299857) | 2025-03-06 | 22@ Normes urbanístiques | **PASS** (185 p, **741 923 chars, 18 484 digit glyphs**) | **NO** ⚠ see the trap below | 1–40 (its own articulat) |
| **2009/036679/B** (codi 246317) | 2009-07-22 | art. 264, *volumetria específica* | ⛔ **FAIL** | **UNKNOWN — NOT READ** | — |

### ⚠ THE DIGIT-INTEGRITY GATE, and why it is not optional

L-660 measured that pre-2010 DOGC PDFs *"mis-render digits while reading as fluent Catalan"*. A
search for **article numbers** is a search for **digits** — precisely what a broken decoder destroys
— so a naive "article 327 not found" would be a **confident-wrong negative**. The tool therefore
counts digit glyphs in each document and **refuses to report a clean result** below a floor.

**`2009/036679/B` FAILED it, and that is a finding, not a hiccup:** both its documents are
**image-only scans** (23 p → 22 characters; 1 p → 0 characters). ⇒ **It has NOT been read.** Its
*title* names Art. **264** — and 264 ∉ {239, 320, 327, 328} — but a title is register metadata, not
the instrument. It stays `UNKNOWN`. (No OCR is available in this environment; rendering it at
200 dpi and reading it is the L-660 §6 recipe, and it is a human act.)

### ⚠ TWO CONFIDENT-WRONG TRAPS CAUGHT LIVE — both were false positives

1. **`Decret 328/2006`** in the equipaments *Acord*. A raw `328` match. It is a **Catalan
   government decree number**, not a PGM article.
2. **`320` and `327` in the 22@ document** — all of them **area / *sostre* figures** (`320 m²`,
   `70.320 m² st`, `26.327`), inside numeric tables. Not article references.

**Both would have been recorded as amendments by a bare digit grep.** Context was read on every hit.

---

## 4 — WHAT IS STILL UNREAD, STATED PLAINLY

- **41 of the 46** on the reading list: **38 `AMBIGUOUS`** + **3 site-specific with a subject hit**.
- **1 general-normative instrument (`2009/036679/B`) is a SCAN and remains UNREAD.**
- **101 set aside** are site-specific with no subject hit. They **cannot rewrite an article's text** —
  but any of them **could disapply one inside its own àmbit**, which PRYZM would not see. ⚠ **That
  residual is a NAMED limit of the screen, not a clean bill.**

> ```yaml
> verification:
>   question: "Were PGM Arts. 239, 320, 327 or 328 amended after 2007-03-02?"
>   consulted: [RPUC basica (1755 enumerated), RPUC detall + documents (4 opened, 3 text-checked)]
>   consultationDate: 2026-08-01
>   result: NOT_VERIFIED
>   finding: not_found
>   legalMeaning: "This is a NOT-FOUND result."
>   itDoesNotMean: "That no later modification exists."
>   confidence: medium-high        # was: medium (L-660). Raised by 3 TEXT checks, not by more titles.
> ```

**Do not write `laterModifications: none` anywhere.** An empty relation graph means *"no relation
recorded"*, not *"no relation exists"* (L-660: the art. 264 instrument shows `expedientsRelacionats: []`
yet demonstrably amends PGM-1976).

---

## 5 — THE SIGN

**EXACT, conditional on the not-found holding — and if it does not hold, UNKNOWN, not "safe".**

A supersession does not bias a number in a predictable direction: an amendment could raise or lower
an *alçada reguladora* or a *profunditat edificable*. So this row has **no protective sign**, unlike
rows 4, 11 and 12. That is exactly why the register wrote *"until then every citation carries an
asterisk"* — and why the honest move here was to **shrink the unread set and raise the confidence
qualifier**, not to declare the question answered.

⚠ **The three instruments now text-checked are the ones that COULD have moved a shipped number
city-wide.** The 41 that remain are, on their titles, site-delimited or off-subject — so the
*expected* size of any surviving effect is a **local override on specific parcels**, not a
city-wide error. That is a statement about scope, not about sign.

---

## 6 — DECISION

**Row 9 does NOT close. It is re-scoped, re-sized, and demoted P1 → P2, with the method committed.**

| | before (L-660) | now |
|---|---|---|
| the 147 | a number in a document | a **live, re-runnable query** |
| unread | **147** | **41** + 1 scan |
| general-normative post-2007 | 4, screened by title | **3 TEXT-CHECKED, 1 named as an unread scan** |
| confidence | medium | **medium-high** |
| remaining effort | "~2 days, one-time forever" | **~½ day** — 41 documents, mechanical, recipe committed |

**Alternatives rejected:**

1. **Declare `NONE FOUND` on the strength of the 5 general-normative instruments.** Refused — one of
   them is an unread scan, and 41 candidates are unread. That is the exact overclaim L-664 withdrew
   for 13E (metadata read as if it were the text).
2. **Chase place names to shrink the 38 `AMBIGUOUS`.** Refused — the set of Barcelona toponyms is
   unbounded, and every name added moves instruments from "must read" to "set aside", i.e. **tunes
   the screen toward a smaller answer.** A screen that fails open is worth more than a smaller
   reading list.
3. **Build the full OCR + article-graph crawler now.** Deferred — it is the *right* long-term answer
   and is the structural fix the register already names (the **Barcelona Planning Knowledge Base**,
   `CLOSURE-REGISTER.md` "hidden blocker"). Reading 41 documents does not justify building it; the
   NEXT city does.

---

**Cross-refs:** `CLOSURE-REGISTER.md` row 9 · `findings/L-660-DOGC-4893-ANNEX-RETRIEVED.md` (the
funnel this reproduces + the digit-mangling trap) · `corpus/RETRIEVAL-LOG.md` §6 (the retrieval
recipe) · C58 §1.1/§1.7a · L-449 (reading a primary source is a human act).
