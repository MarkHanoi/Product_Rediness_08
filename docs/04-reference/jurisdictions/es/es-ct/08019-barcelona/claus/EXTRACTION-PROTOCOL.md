# How clau 13a was extracted — the replicable protocol

> **This is not a summary of 13a. It is the METHOD, reconstructed from the shipped pack's own
> record (`packages/site-parcel-data/src/rulepacks/esBarcelonaEnsanche.ts`,
> `bcnAlcadaReguladora.ts`, ADR-0271, L-449 / L-525 / L-526 / L-594), so every remaining clau can
> be done the same way.**
>
> 13a is the ONLY clau in the platform that renders real geometry. It took four corrections to get
> there, and **three of those corrections were to things previously recorded as "verified"**. The
> protocol below is mostly a defence against that.

---

## Step 0 — Get the PRIMARY text. Never work from snippets or summaries.

The source of record is the **current consolidated PGM refós in RPUC** (Registre de Planejament
Urbanístic de Catalunya) / **AMB NUMAMB Geoportal de Planejament** — *a living consolidated text,
not a frozen PDF*. A local copy is in the dossier: `../PGM-NNUU-metropolitana.pdf` (11 MB).

⚠ The AMB states its web text is **for consultation only**; the legally binding documents are the
approved planning instruments. Cite the consolidated refós, and record that caveat.

**Anti-pattern that already cost us a correction:** the first 13a citation was *"AMB/MMAMB
Normativa Urbanística Metropolitana, Dec 2010, consolidated 31-12-2009."* L-526 found it both
**stale** and **anachronistic — the AMB as an institution did not exist until 21-07-2011**, so an
"AMB Dec 2010" attribution is impossible. A confident citation to a document that cannot exist is
worse than no citation, because it survives review.

## Step 1 — Find the articles. The zone article is NOT the rule.

Art. 314 only declares that the zone exists. For 13a the operative rules were spread across:

| Parameter | Governing article(s) |
|---|---|
| *profunditat edificable* (buildable depth) | **Art. 242**, applied via **Art. 327.1** |
| *edificabilitat* | **Art. 322** |
| *alçada reguladora* (height) | **Arts. 238 + 240 + 327**, table at **Art. 327.2** |

**The first extraction got this wrong**: it cited **Art. 322.1 for depth**. Depth is Art. 242;
322 is edificabilitat. Build the article index *before* filling any value, and verify each
attribution by reading that article — not by trusting the last person's map.

## Step 2 — Classify every parameter into ONE OF FOUR outcomes

This is the heart of the method. **"value or unknown" is not enough** — it collapses three
distinct legal situations into one and produces wrong engines.

| Outcome | Meaning | 13a example |
|---|---|---|
| **STATED** | a scalar written in the text | depth cap **30 m**; interior free space **≥30 %** of block area; minimum **11 m** |
| **CONSTRUCTED** | the ordinance gives a **procedure**, not a figure | **Art. 242.2** — *"a figure similar to the block, equidistant from the street frontages, leaving ≥30 % of the block as interior free space"*, capped 30 m. Also **Art. 327.2** height: a table keyed by *amplada de vial* |
| **NOT-THE-RULE-KIND** (`no-limit`) | the ordinance regulates this land by a **different mechanism**, so the field has no value *by design* — **a FINDING, not a gap** | **`farRatio` = null.** Art. 322.1: for *densificació urbana*, *"l'edificabilitat es defineix per l'envolupant màxima de volum"*. **There is no per-parcel FAR — the envelope IS the rule.** |
| **UNKNOWN** | genuinely not yet read / not held | height bands (see Step 5) |

⚠ **A CONSTRUCTED parameter is an ENGINEERING task. No signature converts it into a
transcription.** This is the single most important distinction for planning effort: 13a's depth
could not be typed in from a table, because no table exists — it had to be *implemented*
(`block-derived-alignment`, ADR-0271).

## Step 3 — `null` ≠ `0`, and never fill a shape you don't have

13a's setbacks are **null, not zero**. It is an **alignment-governed** zone: the façade sits on the
street line. A null edge is *skipped* by the containment check; `0` would assert *"the ordinance
requires zero setback here"*, which was never established (C58 §1.7a).

State the **rule KIND** explicitly — `setback` / `alignment` / `block-derived-alignment` /
`tiered-occupation` / `coverage-and-far`. **The wrong KIND is a wrong SHAPE, not a wrong number,
and no confidence value corrects it** (ADR-0270 / C58 §2.2).

## Step 4 — Refuse the plausible number… but never conclude "it does not exist"

A height table circulates for the Barcelona Eixample: **9,00 / 12,35 / 15,70 / 19,05 / 22,40 /
25,75 m**. Three rounds of verification failed to locate it in the accepted source and concluded it
was folklore. So `maxHeight_m` and `maxFloors` shipped as **null**.

> **An absent number is honest; a plausible one is not.**

### ⚠ AND THEN IT WAS FOUND — 2026-07-31, at PDF p.277

`bcnAlcadaReguladora.ts` asserted the source *"carries none on this article"*. **Footnote 49 carries
two modifications of Art. 327, and one of them is Barcelona's own**: a 2007 municipal modification
(**DOGC 4893, 29-05-2007**) restating Art. 327.2a as exactly **9,00 / 12,35 / 15,70 / 19,05 / 22,40 /
25,75 m, PB+1…PB+6**. The circulating table was real all along.

**The "3,35 vs 3,05 m/floor" argument that justified rejecting it was a conflation**: the modified
article keeps **3,05 m as a storey MINIMUM** while stepping the *bands* by 3,35 m. Those are different
quantities. A wrong reason produced a right-looking refusal, and the refusal outlived the reason.

**Why three rounds missed it** — this is the reusable lesson, and it is not "read positionally":
the annex pages embed **subset fonts with no ToUnicode, glyph-shifted by +29 and −29**. A text pass
**drops every DIGIT**. So the article reads as *absent* **and its entire height table silently
vanishes** — the extractor reports nothing rather than garbage, which is indistinguishable from
"the modification does not exist". Decode the shift, or render the page (`get_pixmap(dpi=150)`) and
read the raster.

### The rule this replaces Step 4's naive form with

**"Not located" is NOT "does not exist" — and the accepted source says so about itself.** The PGM
refós states plainly: *«no hi figuren totes les modificacions… només aquelles que s'han considerat més
rellevants»* and *«merament divulgativa»*, consolidated only to **31-12-2009**. **A document that
declares itself incomplete cannot certify an absence.** So:

- **Refuse the unlocated number** — still correct, still the default.
- **Record the refusal as `not-located-in-source`, never as `does-not-exist`.**
- **Never write "the source carries none"** unless the source claims completeness. This one does not.

The cost of getting this wrong is not abstract: before the height construction existed, the Cesium
massing path fell back to a **hardcoded 9 m** and extruded it in the *same purple study volume as a
real one* — a fabricated ~PB+2 rendering indistinguishably from a surveyed height on a street whose
real answer is ~PB+5 (L-525a, the L-459 defect class).

## Step 5 — Name the ONE blocker precisely

For 13a the height bands are **not blocked on reading the ordinance** — they are blocked on the
**official street width (*ample oficial del carrer*)**, because Art. 327.2 keys the table to it.

That is what a good blocker looks like: a single named input, not "we need more research".

### ⚠ AND THE CITATION THIS STEP USED TO CARRY WAS ANOTHER MUNICIPALITY'S (§L-660)

This step said: *"The Art. 327 §2 modification (**exp. 2007/028428, DOGC 29-09-2008**) is a
height-table change and is carried by the current RPUC/NUMAMB consolidation."* **DOGC 29-09-2008 is
DOGC núm. 5224 — the date of BADALONA's instrument** (*Modificació puntual de les NNUU del PGM en
l'àmbit del municipi de Badalona*, 6 June 2008), and the geoportal page it was read from is
`…/Normativa/**08015**_13a.htm`, where **08015 is Badalona**. Barcelona's own Art. 327 modification
is **DOGC núm. 4893 de 29/05/2007** (Subcomissió d'Urbanisme del Municipi de Barcelona, 2 March
2007). The expedient number `2007/028428` has **not** been re-verified against either instrument and
is left unattributed rather than reassigned.

That is the **municipality-code trap** L-583 §1 already recorded catching us twice, recurring inside
our own protocol document. Both municipalities really did adopt the **same six values** — so the
table was right, the *citation* named the wrong city, and a wrong citation survives review.

> **Rule:** an `080NN` code in a URL is part of the citation. Read it before quoting the page.

Full record: [`../L-660-ART-327-328-MPGM-2007-FOUNDER-DECISION.md`](../L-660-ART-327-328-MPGM-2007-FOUNDER-DECISION.md).

## Step 6 — Leave genuinely unresolved things unresolved, deliberately

**13a vs 13E is unresolved on purpose.** Live MUC `MUC_4QUAL` returns `13a` across the whole
Eixample and never `13E`; the 2002 *Ordenança de rehabilitació i millora de l'Eixample* Art. 2
(primary, BCNROC 11703/89247) says `13E` **substitutes** clau 13 there. Both codes are registered
against the **same** rule set — *this is not a claim that they are equivalent*, it is a **refusal to
pick** while the 2002 ordinance's force is unknown (two 2015 *Derogació* rows were never reached).

## Step 7 — Record what is NOT modelled, especially when it is common

For 13a, **zero corpus coverage** of the volumetric rules that sit between *implantació × storeys*
and real buildable floor area: ***cossos sortints* / tribunes, *planta baixa*, *àtic* /
*sotacoberta*, *patis de llum***. In the Eixample projecting tribunes are **near-universal**, so
this is a live risk to *edificabilitat*, not a theoretical one. Write it down where the next
person will hit it.

## Step 8 — The founder signature is a dated legal act, and it can be re-exercised

The **L-449 gate**: *"I accept what the source says."* Exercised 2026-07-20, then **re-exercised
2026-07-21** after L-526 corrected the citation. Re-citing corrected the **attribution**, not the
**confidence tier** — the pack still ships `estimated-ruleset` (amber badge, `ordinance-pdf`
provenance, "verify against ordinance" affordance), because the per-parcel figures are still not
certified against the MUC/RPUC *fitxa urbanística*.

**Signing the source ≠ certifying the numbers.** Keep those two gates separate.

## Step 9 — Expect to correct yourself against the primary text

**L-594**: the packs shipped a **12 m** minimum depth citing *"Art. 242 — 12 m, verified"*. The
primary text gave **11 m**. Two rival claims were each recorded as confirmed; **the more assertive
one was believed**, and it over-stated buildable depth. Corrected to 11.

> When two records disagree and both say "verified", **neither is** — go back to the article.

---

## The checklist, per clau

1. Primary consolidated text in hand (RPUC / NUMAMB), citation dated and institutionally possible.
2. Article index built **before** any value is written; each attribution verified by reading it.
3. Every parameter classified **STATED / CONSTRUCTED / NOT-THE-RULE-KIND / UNKNOWN**.
4. Rule **KIND** and **granularity** stated.
5. `null` used for unknown; `0` used only where the ordinance *says* zero; `no-limit` recorded as a finding.
6. Every plausible-but-unlocated figure **rejected in writing**, with what was actually confirmed.
7. The one blocking input named precisely.
8. Unresolved code/variant questions left open with both readings recorded.
9. Not-modelled rules listed, with their real-world frequency.
10. Founder signature dated; confidence tier set **separately** from the citation.

---
*Derived 2026-07-31 from the shipped 13a pack and its L-449 / L-525 / L-526 / L-594 lineage.
Authority: ADR-0271 · ADR-0270 · C58 §1.2/§1.4/§1.6/§1.7a/§1.11 · C63.*
