# L-583 — Barcelona PGM legal parameters: what is now sourced, at what confidence, and what it changes

**Date:** 2026-07-22 · **Audit:** L-583 (supersedes the open half of **L-528**, advances **L-552**)
**Method:** founder-run research session (web search + fetch, no browser, no screenshots).
**Cross-refs:** L-526 (legal citation), L-528 (certification), L-537 (*amplada de vial*), L-552
(13b sourcing), L-553 (refusal policy), L-582 (context height provenance), ADR-0271 (Art. 242.2).

---

## 0. CONFIDENCE TIERS USED THROUGHOUT — read this first

| Tier | Meaning | Safe to ship as? |
|---|---|---|
| **certified** | Read off an official viewer or a *Certificat de règim urbanístic* for the specific parcel | `block-constructed` / real |
| **published** | Verbatim from an official consolidated text, but **not Barcelona's own (08019) copy** | real, **with the source named** |
| **corroborated** | Same figures independently from ≥2 municipal *refós* copies, structurally consistent | real, with a caveat |
| **inferred** | Follows by category logic; no sentence states it | ⚠ **NOT shippable as a legal claim** |
| **NOT FOUND** | Could not be obtained | must refuse (C58 §1.4) |

⚠ **Nothing in this document is `certified`.** Everything below is `published` or weaker. The
blocker is mechanical, not intellectual: **AMB pages 403/404 to scripted access and Barcelona's own
book page is robots-disallowed**, so a live browser is required. That is the same wall L-552 hit.

---

## 1. ⚠⚠ THE MUNICIPALITY-CODE TRAP RECURRED **LIVE** IN THIS SESSION

The AMB geoportal serves per-municipality *refós* pages keyed by **INE code**, and **they are not
interchangeable**. A search for Art. 328 first surfaced
`geoportalplanejament.amb.cat/Informacio/Normativa/08015_13a.htm`.

**`08015` is BADALONA. Barcelona is `08019`.**

Worse — the Badalona copy carries its own modification history (*"Modif. apartats 2 i 5 … exp.
2007/028428, DOGC 29/09/2008"*) and **numerically disagrees** with the copy served under code
`08245`. Two municipal copies of "the same" PGM article state different numbers, because each
municipality has layered its own *modificacions* onto shared article numbers.

⇒ **This is the exact failure that produced the mis-attributed 13a citation (L-526).** The
acceptance criterion that rejected republications earned its place in this session, not in theory.

**AMB's own documentation compounds it:** Barcelona compiles its own consolidated text and delivers
a copy to AMB annually, and Barcelona's compilation *differs conceptually* from other
municipalities'. So even an `08019_*.htm` page, if one exists, is a **copy of** Barcelona's
authority, not the authority. The authoritative sources are **Barcelona's own Seu electrònica /
BCNROC**.

**Second structural fact, with a data-model consequence:** derivative plans that Barcelona approves
under its own Municipal Charter carry **Barcelona's own expedient codes**, not the Generalitat's
DGU codes. ⇒ **Any cross-referencing of expedient codes across municipalities is unsafe — Barcelona
is a separate namespace.** Check any PRYZM code that assumes one shared expedient code space.

---

## 2. Art. 327 — clau `13a` (Densificació Urbana **Intensiva**) · **✅ CONFIRMS OUR SHIPPED TABLE**

The *alçada reguladora màxima* and *nombre màxim de plantes* are set by the width of the street the
building fronts:

| amplada de vial (m) | alçada reguladora màxima (m) | plantes |
|---|---|---|
| < 8 | 8,55 | PB+1 |
| 8 – <12 | 11,60 | PB+2 |
| 12 – <15 | 14,65 | PB+3 |
| 15 – <20 | 17,70 | PB+4 |
| **20 – <30** | **20,75** | **PB+5** |
| ≥ 30 | 23,80 | PB+6 |

**Source:** Santa Coloma de Gramenet *REFÓS DE NORMATIVA* consolidated PDF — a document that
**explicitly flags its own local rewrites** (*"Nou redactat"*) and carries **no rewrite flag on this
article**, i.e. it presents this as unmodified base PGM text.
**Confidence: `published`** (not Barcelona's own copy).

### ⇒ VERIFIED AGAINST OUR CODE — all six bands match byte-for-byte

`packages/site-parcel-data/src/rulepacks/bcnAlcadaReguladora.ts` →
`BCN_ALCADA_REGULADORA_TABLE` is **identical** on every band boundary, height and storey count.
**Six-for-six is not coincidence — this is independent corroboration of the whole 13a height table.**

---

## 3. ⚠ **L-528 RESOLVED — 20,75 m is CORRECT; 22,40 m is a DIFFERENT LEGAL QUANTITY**

The long-standing "20.75 vs 22.40 for PB+5" contradiction is **not a contradiction**. The three
candidate explanations were (a) a parapet/rooftop allowance, (b) attic-storey counting, (c) a
Barcelona-specific consolidation overriding the band table. **The answer is (a).**

- **20,75 m** is the Art. 327 table value for a 20–30 m street, PB+5 — **straight off the standard
  table, requiring no Barcelona-specific consolidation to produce.**
- **22,40 m** is a **total constructed height** governed by a **different instrument**: the
  **Ordenances Metropolitanes d'Edificació (OME), approved 15 June 1978** alongside the NNUU as a
  *separate metropolitan-level regulation*. The OME permits, **on top of** the *alçada reguladora
  màxima*:
  - *badalots d'escala* (stairwell enclosures) up to **2,50 m**, with no equipment above their roof;
  - rooftop technical volumes (lift machinery, HVAC, water tanks) up to a set height;
  - railings on façades and interior patios up to **1,00 m** above the air chamber;
  - (a separate provision) up to **0,40 m** for the start of a pitched roof where the top-floor
    ceiling sits below the regulated height.

⚠ **Candidate (c) is affirmatively DISCONFIRMED**: three different municipal mirrors all show the
*same generic band structure*. No evidence of any Barcelona-specific override of the band values.

### ⇒ CODE CONSEQUENCE — a real defect, in the opposite direction to the one feared

`PB5_UNCERTIFIED_ALTERNATIVE_M = 22.4` is currently surfaced as **`uncertifiedAlternative_m`**,
i.e. as a *rival answer to the same question*. **It is not.** It is an OME total-height quantity
answering a different question. Presenting it as an alternative *alçada reguladora* invites exactly
the conflation C58 §1.11 forbids.

**Action:** relabel it as an OME-governed total-height allowance (or remove it), and stop describing
20,75 m as uncertain on its account. **The regulated height was never in doubt — our own field
implied it was.**

⚠ **Still NOT FOUND:** the exact OME article number and Barcelona's own figures. The listed
allowances do not obviously sum to the 1,65 m gap, so the *composition* of 22,40 m is unverified
even though the *mechanism* is now evidenced.

---

## 4. Art. 328 — clau `13b` (Densificació Urbana **Semi**intensiva)

| amplada de vial (m) | alçada reguladora màxima (m) | plantes |
|---|---|---|
| < 8 | 7,55 | PB+1 |
| 8 – <11 | 10,60 | PB+2 |
| 11 – <15 | 13,65 | PB+3 |
| ≥ 15 | 16,70 | PB+4 |

**Confidence: `corroborated`** — the band *boundaries* (<8, 8–11, 11–15) appear independently in a
second municipality's page; the *values* come from the Santa Coloma consolidated PDF with no
rewrite flag. **Not Barcelona's own copy.**

⚠ **Structurally consistent with 13a**: four bands instead of six, lower values throughout, topping
out at PB+4 vs PB+6 — exactly what "semiintensiva" should look like beside "intensiva". That
coherence is weak evidence *for*, not proof.

### 4.1 A3 — does Art. 242's 30% rule apply to `13b`? · **`inferred`, NOT `published`**

**Art. 242 verbatim (via a third municipality, code 08123)** defines *profunditat edificable* as the
depth of a figure similar to the block, equidistant from the street frontages, whose area is **at
least 40% of the block area for nucli antic subzona I**, and **30% for the densificació urbana
zones**, capped at **30 m**.

Two supporting facts:
1. Art. 242 keys the ratio to the **zone family** ("densificació urbana"), and `13b` **is** a
   densificació urbana subzone ⇒ 30% applies **by category**.
2. **Art. 328 contains no independent depth rule at all** — *profunditat edificable* never appears
   in Art. 321–328. A zone whose own articles are silent on depth falls through to the general rule.

⚠ **BUT NO SENTENCE STATES IT.** No cross-reference from 328→242 was found, and no carve-out was
found either. **This remains `inferred` and is NOT shippable as a legal claim** under C58 §1.4.
It is, however, now the *strongly favoured* reading, and it means encoding `13b` is closer to the
"week of configuration" branch than the "month of new rule design" branch.

### 4.2 ⚠ A NUMBER OUR CODE HARDCODES THAT THIS CHANGES THE MEANING OF

`solveBlockDerivedDepth` is called with `interiorFreeRatio: 0.30`. Art. 242 sets **40% for nucli
antic subzona I** and 30% for densificació urbana. **0.30 is correct for 13a/13b and WRONG for any
nucli antic zone.** If the Art. 242 machinery is ever pointed at a nucli antic parcel, the ratio
must come from the zone, not from a constant.

---

## 5. ⚠⚠ Arts. 315 / 316 / 319 / 320 — clau `12` vs `12b`, AND THE BIGGEST FINDING IN THIS DOCUMENT

### 5.1 The zone split — and a correction the researcher made to itself

**Art. 315** splits *nucli antic* into:
- **subzona I (clau `12`)** — old-town nuclei **other than Barcelona's**;
- **subzona II (clau `12b`)** — historic-centre **conservation**, referring **preferentially to
  Barcelona**.

**Art. 316** (*Edificabilitat*) is **general to both** subzones — it is a cross-referencing article
(floor-area ratio results from each subzona's own building conditions plus the street-alignment
ordering type), **not a fixed number**.

⚠ *An earlier claim in the same session that Art. 316 excluded Barcelona was **retracted by the
researcher**. Recorded here because a retracted claim is evidence about method quality, and because
the retraction is the correct one.*

**Corroborated by a genuine Barcelona-authority source:** BCNROC heritage-catalogue *fitxes* for
Ciutat Vella addresses consistently record *"Qualificació: 12b Zona de casc antic de conservació del
centre històric"* — **never plain `12`.**

⇒ **If PRYZM maps Barcelona nucli antic to clau `12` / Art. 316, that mapping is wrong. Barcelona is
`12b`.** (The founder's live Gòtic test on 2026-07-22 hit exactly this: `Nucli Antic de Conservació
(clau 12b)`, correctly refused as a coverage gap.)

### 5.2 ⚠⚠ `12b` IS NOT A TABLE-DRIVEN ZONE — IT IS A SURVEY-THE-NEIGHBOURS ALGORITHM

Arts. 319–320 give **completely different mechanisms** for the two subzones:

| | subzona I (`12`, not Barcelona) | **subzona II (`12b`, Barcelona)** |
|---|---|---|
| **Depth** | fixed rules | **at most that of the EXISTING CONTIGUOUS BUILDINGS**, pending determination by a *Pla Especial* |
| **Height** | street-width table (with a floor: plots with façade < 6,50 m never exceed 10,60 m ≈ PB+2; table values adjustable ±10% to integrate with adjacent façades) | **the AVERAGE OF THE EXISTING BUILDINGS along that street stretch**, excluding façades of undeveloped lots. Max storeys then derived from a minimum **4 m** ground floor and minimum **3,05 m** per upper floor |

**Confidence: `published`** (non-Barcelona republication; the mechanism is structural and unlikely to
be a local rewrite, but it is not Barcelona's own copy).

### 5.3 ⇒ THE ARCHITECTURAL CONSEQUENCE — this is why it matters more than the numbers

**`12b` cannot be encoded as a width→height lookup.** Doing so would be **the wrong SHAPE of rule**,
not an imprecise number — the same category error as drawing a setback triple on an
alignment-governed zone (C58 §1.11, L-553). It requires:

- a **contiguous-neighbour depth** query (what do the adjoining buildings actually occupy?), and
- a **street-stretch height average** over existing buildings, excluding vacant lots.

⚠⚠ **AND THE TRAP THAT MUST BE WRITTEN DOWN BEFORE ANYONE BUILDS IT.** We *appear* to already have
the input — context building heights from OSM. **We do not.** Per **L-582**, measured on the live
tiles: only **0,9%** of context footprints carry a **surveyed** height; **79,3%** are a real storey
count multiplied by **our assumed 3,2 m**; **19,8%** carry the **fabricated 9 m default**.

**Averaging those into a LEGAL height would be fabrication wearing the costume of a construction** —
precisely the failure C58 §1.4 exists to prevent, and worse than today's honest refusal. A `12b`
implementation needs **surveyed** heights (municipal LOD2 / cadastral storey counts), not our
context layer.

### 5.4 NOT FOUND for `12b`
- The **Barcelona-numbered article** implementing 319/320's mechanisms (the mechanism is sourced; the
  citation is not).
- Whether the **Ciutat Vella PEPPA / heritage catalogue legally OVERRIDES** 12b's dimensional
  parameters or is purely a protection layer. The catalogue exists and is **PDF-based** (BCNROC
  *fitxes*); its regulatory text was not obtained.

---

## 6. What changes in the product because of this document

| # | Change | Basis | Status |
|---|---|---|---|
| 1 | **Stop presenting 22,40 m as an alternative *alçada reguladora***; relabel as an OME total-height allowance | §3 | **actionable now** |
| 2 | 13a height table — **no change**, now independently corroborated | §2 | ✅ confirmed correct |
| 3 | `interiorFreeRatio` must come from the **zone** (40% nucli antic subzona I / 30% densificació urbana), not a constant | §4.2 | actionable when a nucli antic pack ships |
| 4 | Barcelona nucli antic ⇒ **`12b`, not `12`/Art. 316** | §5.1 | check the mapping |
| 5 | `12b` must be a **neighbour-survey** rule, never a table | §5.2–5.3 | design constraint, before any 13b-style config attempt |
| 6 | `12b` height input requires **surveyed** heights — our context layer is 0,9% surveyed | §5.3, L-582 | **hard blocker** on 12b |
| 7 | Expedient codes are **per-municipality namespaces**; Barcelona's differ from the Generalitat's | §1 | audit any cross-municipality code matching |
| 8 | 13b table (7,55 / 10,60 / 13,65 / 16,70) — usable at `corroborated`, **must ship with its source named** | §4 | pending the A3 confirmation |

---

## 7. STILL BLOCKED — and all of it needs one live browser session

1. **Barcelona's own (08019) verbatim** Art. 242, 327, 328, and the subzona-II articles. AMB
   403/404s to scripts; Barcelona's book page is **robots-disallowed**. Use **BCNROC** or the
   Ajuntament's *urbanisme* site — **not** the AMB per-municipality geoportal.
2. **An explicit sentence** confirming or excluding `13b` from Art. 242's 30% rule (§4.1) — the
   single highest-value outstanding item.
3. **Pau Claris 155 (`0230904DF3803`)** parcel-level figures (C1–C3, C5).
   ⇒ **NEW, USEFUL LEAD:** besides the authenticated *Certificat de règim urbanístic*, Barcelona runs
   a **public, non-authenticated** portal — *"Cerca del planejament, qualificacions i convenis"*:
   `https://ajuntament.barcelona.cat/ecologiaurbana/ca/serveis/la-ciutat-funciona/urbanisme-i-gestio-del-territori/informacio-urbanistica/recerca-del-planejament-qualificacions-i-convenis`
   ⚠ Its own disclaimer says its output is **informative, not normative** ⇒ answers from it land at
   **`published`**, never **`certified`**.
4. The **OME article number** and Barcelona's own rooftop-allowance figures (§3).
5. The **Ciutat Vella PEPPA** regulatory text (§5.4).

---

## 8. Method note — worth keeping

The research session **flagged its own limits rather than filling them**: it reported NOT FOUND for
every parcel-specific figure instead of approximating, **retracted** its own Art. 316 claim when
better evidence arrived, and **surfaced the 08015/08019 trap as a counter-example rather than an
answer**. That behaviour is the reason this document can be trusted at the tiers it claims — and it
is the same discipline that turned "91,4%", "24,2%" and "15,7%" from confident numbers into
correctly-retracted ones during the same day's engineering work.

---

# 9. ⇒ A3 ANSWERED — `13b` **INHERITS** Art. 242's 30%. The argument is STRUCTURAL, not inferential.

**This supersedes §4.1's `inferred` rating.** The earlier reading ("13b is a densificació urbana
subzone, so the 30% applies by category") was a *category inference*. The correct argument is that
**Art. 242 is a general provision of an ORDERING TYPE that `13b` is stipulated to use** — which is
a different and much stronger claim.

## 9.1 The document architecture — where Art. 242 actually lives

```
Normes Urbanístiques
└─ Títol IV — Reglamentació detallada del sòl urbà
   └─ Capítol 2n — DE LES DISPOSICIONS COMUNES ALS TIPUS D'ORDENACIÓ
      └─ Secció 2a — Normes aplicables a l'edificació SEGONS ALINEACIONS DE VIAL
         ├─ Art. 236 — Paràmetres del tipus d'ordenació segons alineacions de vial
         ├─ Art. 240 — Regles sobre determinació d'alçades
         ├─ Art. 242 — PROFUNDITAT EDIFICABLE          ← here
         ├─ Art. 244 — Reculades
         └─ Art. 245 — Ordenació de volums
```

⚠ **Art. 242 is NOT inside any zone's own article block** — not 321–328 (densificació urbana), not
315–320 (nucli antic). It sits among the **common provisions for the street-alignment ordering
type**.

## 9.2 The three links that close the chain

1. **Art. 236** — buildable depth is one of the **defined parameters** of the street-alignment
   ordering type.
2. **Art. 326** — the subzones of the *densificació urbana* zone are ordered under the
   street-alignment ordering type. **Plural — both subzones. No carve-out for *semiintensiva*.**
3. **Art. 242** — sits in that ordering type's common provisions, alongside **Art. 240**
   (height-measurement rules) and **Art. 244** (setbacks).

⇒ **`13b` does not need a cross-reference to "inherit" Art. 242.** It applies for the same reason
Art. 240 and Art. 244 apply to `13b` — which nobody disputes, and which no article states
individually either. **Art. 242 occupies the identical structural position.** Shipping code that made
`13b` ignore Art. 242 for lack of an explicit link would equally have to make it ignore Art. 240.

## 9.3 The scoping sentence — verbatim (Art. 242.2)

> *"La profunditat edificable resultarà del traçat, en posició equidistant dels frontals a la via
> pública, d'una figura semblant a la de l'illa, la superfície de la qual sigui equivalent, com a
> mínim, a la zona de nucli antic subzona I, al 40 per 100 de la superfície total; i, a les de
> densificació urbana, al 30 per 100 de l'esmentada superfície. En cap cas la profunditat edificable
> no pot superar la de 30 metres que es considerarà màxima."*

⚠ **AND THE ASYMMETRY INSIDE THE SENTENCE IS ITSELF EVIDENCE.** The 40% is scoped to *"la zona de
nucli antic **subzona I**"* — the subzone named **explicitly**, excluding subzona II. The 30% is
scoped to *"les de **densificació urbana**"* — the **category, unqualified**, with no subzona
restriction. **Where the drafter meant to restrict a share to one subzone, they said so.** In the
same sentence, in the same breath, they did not do so for densificació urbana.

## 9.4 Why the wording is trustworthy despite no Barcelona copy

The sentence was found **letter-for-letter identical across three independently-maintained municipal
mirrors** (codes 08123, 08221, and the Santa Coloma family) — municipalities that **visibly diverge
from each other** on the surrounding zone-specific articles (their 13a/13b height figures differ, per
§1). **A sentence that stays byte-identical across independently-amended copies, while the articles
around it diverge, is strong evidence nobody has locally amended it** — which raises confidence that
Barcelona's own copy reads the same.

## 9.5 Confidence, and what it licenses

**`corroborated`, upgraded by structural placement.** Not `certified`, and not `published-for-Barcelona`
— Barcelona's own copy remains unretrieved (numamb bot-detection and a robots-disallowed book page,
each hit independently twice).

⇒ **This is enough to BUILD `13b` on**, provided the shipped citation is honest about the chain:
the depth comes from **Art. 242 via Art. 326** (the ordering type), **not** from Art. 328 — which
genuinely has no depth rule. Citing "Art. 328" for the depth would be a fabricated attribution of
exactly the L-526 kind.

⇒ **13b is the WEEK-OF-CONFIGURATION branch, not the month-of-new-rule-design branch.** The
Art. 242 machinery (`solveBlockDerivedDepth`, ADR-0271) transfers unchanged; only the Art. 328
height table is new — and §4 already has it at `corroborated`.

## 9.6 The single click that would certify it

`www.amb.cat` → **NUMAMB** → *Normes Urbanístiques → Títol IV → Capítol 2n → Secció 2a*, and read
Art. 242 + the Secció 2a heading note. ⚠ The deep-link article ID `991409` is **STALE** — AMB has
renumbered; navigate from the NUMAMB landing page rather than the indexed URL. Barcelona's own
consolidated PDF at `barcelona.cat/ca/coneixbcn/barcelonallibres/normativa-urbanistica-metropolitana`
would settle the "is it Barcelona's own" question outright.

**NOT blocking.** It upgrades the tier; it does not change the answer.
