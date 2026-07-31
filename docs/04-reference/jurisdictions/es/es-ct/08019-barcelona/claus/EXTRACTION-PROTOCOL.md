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

## Step 4 — Refuse the plausible number

A height table circulates for the Barcelona Eixample: **9,00 / 12,35 / 15,70 / 19,05 / 22,40 /
25,75 m at 3,35 m per floor**. It was **never located in the accepted source**; what verification
repeatedly confirmed was the **generic PGM at 3,05 m/floor**, whose band values we also do not
hold. So `maxHeight_m` and `maxFloors` ship as **null**.

> **An absent number is honest; a plausible one is not.**

The cost of getting this wrong is not abstract: before the height construction existed, the Cesium
massing path fell back to a **hardcoded 9 m** and extruded it in the *same purple study volume as a
real one* — a fabricated ~PB+2 rendering indistinguishably from a surveyed height on a street whose
real answer is ~PB+5 (L-525a, the L-459 defect class).

## Step 5 — Name the ONE blocker precisely

For 13a the height bands are **not blocked on reading the ordinance** — they are blocked on the
**official street width (*ample oficial del carrer*)**, because Art. 327.2 keys the table to it.
The Art. 327 §2 modification (**exp. 2007/028428, DOGC 29-09-2008**) is a *height-table* change and
is carried by the current RPUC/NUMAMB consolidation.

That is what a good blocker looks like: a single named input, not "we need more research".

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
