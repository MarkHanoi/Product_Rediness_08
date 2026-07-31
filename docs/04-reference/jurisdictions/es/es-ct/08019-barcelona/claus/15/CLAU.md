# Clau `15` — Zona de conservació de l'estructura urbana i edificatòria

> **STATUS: REFUSAL VERIFIED AGAINST THE PRIMARY TEXT — and the refusal is CORRECT.**
> ⚠ **BUT THE ORDINANCE IS NOT SILENT.** See §3.1: Art. 330.3.4a states an interim FAR of
> **0,90 m² sostre/m² sòl** that nobody had transcribed.
> Family: **zona** · Municipality: Barcelona (`08019`) · Instrument: **PGM-1976**, Normes
> Urbanístiques, Títol IV, Capítol IV, **Secció 4a** (Arts. 329–332), as consolidated in RPUC /
> AMB NUMAMB. Official designation per **Art. 314.3**.
>
> ⚠ Nothing here is self-certified. Founder signature: **NOT GIVEN**.

Primary source: `../../PGM-NNUU-metropolitana.pdf`, **PDF pp. 109–110** (printed 108–109), read
with glyph coordinates. Barcelona-specific modification of **Art. 329** (definition only): PDF
**pp. 185–186**, from the *Modificació de les NNUU del PGM en relació al nombre màxim d'habitatges
per parcel·la*, Subcomissió d'Urbanisme de Barcelona **20-10-2004** (DOGC 4277, 10-12-2004).

---

## 1 — THE DELEGATING SENTENCE

> **PGM Art. 330.2** — «Les condicions d'edificació de cada unitat de zona seran les **establertes
> a l'ordenança del pla especial**, que haurà de ser aprovada en els terminis que es fixen a la
> disposició final segona amb subjecció a les determinacions contingudes en aquesta secció.»

Reinforced by:

> **PGM Art. 330.1** — «L'edificabilitat en aquesta zona **es defineix per l'envolupant màxima del
> volum** que resulti de l'aplicació de les condicions d'edificació de cada unitat de zona.»
>
> **PGM Art. 331** — «Al Pla Especial … **s'ha d'elegir**, com a tipus d'ordenació, el d'edificació
> segons alineació de vial **o** el d'edificació aïllada, en atenció a les característiques de la
> zona que interessa conservar.»

⇒ **The delegation is real, and it is double.** The *conditions* come from the pla especial's
ordenança (330.2), **and the ordering TYPE itself is chosen by that plan** (331) — so even a
complete set of numbers would be unusable without knowing which shape they belong to. Art. 330.1
additionally makes `farRatio` **NOT-THE-RULE-KIND**, exactly as Art. 322.1 does for clau 13a: the
envelope IS the rule.

**Verdict: `derived-plan` is the CORRECT refusal code.** ✅

---

## 2 — What the code returns (pinned)

`barcelonaZoneRefusal('15')` ⇒ `code: 'derived-plan'`, `legallyGrounded: true`.
Pinned by `packages/site-parcel-data/__tests__/esBarcelonaRefusalClausGrounding.test.ts`.

---

## 3 — ⚠ THE FINDING: parameters ARE stated, and they are gated

### 3.1 — Art. 330.3 — the INTERIM regime, in force *until the Pla Especial is published*

> «**Mentre no es publiqui el Pla Especial**, les obres i edificacions de nova planta i les obres
> d'ampliació i reforma, s'ajustaran, pel que fa a les condicions d'edificació i a les condicions
> estètiques, a l'estructura urbana i edificatòria del conjunt determinant de la qualificació
> d'aquesta zona i, especialment, a les següents:
> **1a Alçada.** Ha de ser la que aproximadament assoleixin la majoria dels edificis que
> responguin a l'estructura edificatòria de la zona.
> **2a Alineacions.** Les edificacions han de respondre a l'alineació que prevalgui a les
> edificacions de la zona.
> **3a Ocupació de parcel·la.** Han de respectar l'ocupació preexistent amb possibilitat d'augment
> a planta baixa fins a un **10 per 100**.
> **4a Intensitat d'edificació.** La intensitat d'edificació de les **parcel·les sense edificar**
> no pot depassar els **0,90 m² sostre/m² sòl**.»

| parameter | outcome | value |
|---|---|---|
| interim FAR, **unbuilt parcels only** | **STATED** · parcel | **0,90** m²st/m²s (Art. 330.3.4a) |
| interim coverage | **CONSTRUCTED** | pre-existing occupation **+ 10 %** at ground floor (Art. 330.3.3a) — a function of the *existing building*, not of the plot |
| interim height | **CONSTRUCTED** | *"the height most of the buildings of the zone's building structure roughly reach"* (Art. 330.3.1a) — context-derived, no figure |
| interim alignment | **CONSTRUCTED** | the *prevailing* alignment of the zone (Art. 330.3.2a) |
| `farRatio` (post-plan) | **NOT-THE-RULE-KIND** | Art. 330.1 — the envelope IS the rule |
| setbacks | **NOT-THE-RULE-KIND** *or* UNKNOWN | Art. 331 lets the plan choose *alineació de vial* **or** *aïllada*; which one is unknown |

**Why this does NOT overturn the refusal:** three of the four interim conditions are constructions
over the *existing fabric* — data PRYZM does not hold — and the fourth (0,90) applies only to
**unbuilt** parcels and only **while no Pla Especial is published**, a fact no source records.
Publishing 0,90 as clau 15's FAR would assert both that the plot is unbuilt and that no plan
exists. The refusal stands; **"we refuse" and "the ordinance is silent" are different statements,
and only the first is true here.**

### 3.2 — Art. 332.3 — the criteria binding every Pla Especial

> «a. L'edificabilitat de la zona **ha de ser establerta pel pla especial** d'acord amb l'envoltant
> màxima del volum resultant d'aplicar les condicions d'edificació de la unitat de zona. …
> c. Es mantindrà l'**alçada mitjana de l'edificació existent** a la qual s'ajustarà l'edificació
> futura.»
>
> **Art. 332.4** — «A la zona de conservació de l'estructura urbana i edificatòria **es prohibeix
> la compensació en volum**.»

Even the plan is bound to the *existing* fabric. Art. 332.4 is a genuine `no-limit`-class
**finding** in the other direction: volume transfer is expressly forbidden.

---

## 4 — Amendments

| instrument | what it changes | approved | source |
|---|---|---|---|
| *Modificació de les NNUU del PGM en relació al nombre màxim d'habitatges per parcel·la* | **Art. 329** (definition) only, *d'aplicació exclusiva al municipi de Barcelona*: §2 adds that any increase in dwelling numbers is subordinate to maintaining the typological conditions. **No numeric parameter changes.** | Subcomissió d'Urbanisme de Barcelona **20-10-2004**, DOGC 4277 | PDF pp. 185–186 |

⚠ **Art. 330 has NO Barcelona modification** — its footnote 52 names **Badalona only**
(*"Veure modificació per al Municipi de Badalona a la pàg. 128"*). Recording the *absence* is the
point: "we looked for a municipal override and there is none" is stronger than "we found none".

---

## 5 — Open / unverified

- The 0,90 interim FAR is stated for **Barcelona** (no municipal override) but its applicability
  depends on two unobservable facts: is the parcel unbuilt, and has the Pla Especial for this
  *unitat de zona* been published? Neither is in Catastro or the MUC.
- **Which *unitat de zona*** a parcel belongs to is not published either — and Art. 330.2 keys the
  whole regime to it.
- The Badalona modification of Art. 330 was **not read** (out of scope for 08019).

---
*Verified 2026-07-31 against `../../PGM-NNUU-metropolitana.pdf` pp. 109–110 + 185–186.
Founder signature: **NOT GIVEN**. Authority: C63 · C58 · ADR-0270 · ADR-0271.
Method: `../EXTRACTION-PROTOCOL.md`.*
