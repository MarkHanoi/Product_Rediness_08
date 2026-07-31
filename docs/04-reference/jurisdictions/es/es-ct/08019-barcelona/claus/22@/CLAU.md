# Clau `22@` — Zona d'activitats 22@ (Districte d'Activitats 22@BCN)

> **STATUS: TRANSCRIBED FROM THE PRIMARY TEXT — AWAITING FOUNDER SIGNATURE (L-449).**
> Family: **zona** (formally a *subzona* of the PGM industrial zone `22a` — Art. 5) ·
> Municipality: Barcelona (`08019`).
> Instrument: **MPGM per a la renovació de les àrees industrials del Poblenou — Districte
> d'Activitats 22@BCN**, *not* the PGM's own zone articles.
>
> ⚠ **NOTHING HERE IS SELF-CERTIFIED.** Transcription is a legal act; only the founder signs it.
> `BARCELONA_ENVELOPE_VERIFIED`-style flags stay **false**. This file is a *signable*
> transcription, not a signed one.

---

## ⚠⚠⚠ READ FIRST — THREE THINGS THAT WILL OTHERWISE COST YOU A ROUND

**1. THE GOVERNING TEXT IS THE 2006 MPGM, NOT THE 2000 ONE.**
The zone was created by the MPGM aprovada definitivament 27-07-2000 (DOGC 3239, 05-10-2000). It
was **re-approved and re-stated on 01-03-2006 (DOGC 4654, 14-06-2006)**. The 2006 text preserves
the article numbering but replaces every *Pla Especial (de Reforma Interior)* with a **Pla de
Millora Urbana**, adds Arts. 20–23 (execution duties, 10 % *aprofitament* cession) and re-points
the statutory references to the Text Refós de la Llei d'Urbanisme. The 2000 text's own footnote
says so: *"1. Veure modificació a la pàg. 194."*

**2. THE PDF PAGES CARRYING THE 2006 TEXT DO NOT EXTRACT AS TEXT.**
In `../../PGM-NNUU-metropolitana.pdf`:

| pages | content | extractable? |
|---|---|---|
| PDF **155–168** | the **2000** Normes (Arts. 1–19 + annexes + fitxes) | ✅ `get_text()` works |
| PDF **196–209** | the **2006** Normes (Arts. 1–23 + disposicions) | ❌ **12 alphanumerics per page** |

The 2006 pages' embedded `TimesNewRoman` / `Arial` subsets carry **no usable ToUnicode map**.
`page.get_text("dict")` shows 3–12 real text blocks per page — the glyphs are there, the
code→character mapping is not. They were recovered by **rendering each page
(`page.get_pixmap(dpi=150)`) and reading the raster.** A text-extraction pass over this PDF will
silently report the 2006 amendment as absent and leave you transcribing superseded wording.

**3. `22@` IS NOT A DELEGATING CLAU.** The standing assumption — inherited from the *"heavy pla de
millora urbana machinery"* framing — was that the honest deliverable here would be a cited refusal.
**The ordinance does not say that.** Art. 8.1 states a complete, by-right, **per-parcel** envelope
reachable *directament per llicència*. It is the most completely parameterised unpacked clau in
Barcelona. What blocks an *envelope* is not missing parameters — see §3 and §4.

---

## 0 — Capture gate

1. Every value is cited or absent. 2. `null` = UNKNOWN, never `0`, never "no limit"; `no-limit` is
recorded as a finding. 3. Verbatim before normalised. 4. Scalar vs CONSTRUCTED stated in §3.
5. Rule KIND stated. 6. Granularity stated. 7. Amendments supersede in §2, they do not overwrite.

---

## 1 — PART A · normative parameters

### 1.1 — The **Art. 8.1 by-right regime** (*llicència directa*, industrial uses of Art. 6)

| field | value | quote (verbatim) | legalSource | article | paragraph | effectiveDate | confidence |
|---|---|---|---|---|---|---|---|
| `officialDesignation` | *Zona d'activitats 22@* | «La MPGM defineix la zona d'activitats clau 22@ i els sòls als quals s'assigna aquesta qualificació.» | MPGM 22@BCN, Text refós 2006 | Art. 4 | 1 | 2006-06-14 (DOGC 4654) | STATED |
| `farRatio` | **2,2** m² sostre/m² sòl | «L'edificació a la zona 22@, destinada als usos industrials permesos a l'article 6, podrà desenvolupar-se **directament per llicència** i s'ajustarà al coeficient d'edificabilitat **per parcel·la** de 2,2 m² sostre/m² sòl.» | MPGM 22@BCN 2006 | Art. 8 | 1 | 2006-06-14 | STATED · **parcel** |
| `densityScope` | **n/a for Art. 8.1** — the by-right regime is industrial-use only and states no dwelling cap | — | — | — | — | — | NOT-THE-RULE-KIND |
| `maxHeight_m` | **null** — a per-street CONSTRUCTION, see the table below | «Alçada reguladora màxima i nombre de plantes: 24 m per a carrers de 20 m d'amplada o superior…» | MPGM 22@BCN 2006 | Art. 8 | 1.b | 2006-06-14 | CONSTRUCTED (street-width table) |
| `heightMeasurement` | *alçada reguladora*, applied under the *alineació de vial* ordering | «L'alçada reguladora s'aplicarà segons el tipus d'ordenació d'alineació de vial.» | MPGM 22@BCN 2006 | Art. 8 | 1.b | 2006-06-14 | STATED |
| `maxFloors` | **null** — per-street, see the table | «…amb un límit de planta baixa i quatre pisos…» | MPGM 22@BCN 2006 | Art. 8 | 1.b | 2006-06-14 | CONSTRUCTED |
| `maxCoverage` | **0,70** (70 % of the **parcel**) | «Ocupació màxima de parcel·la: 70 %.» | MPGM 22@BCN 2006 | Art. 8 | 1.f | 2006-06-14 | STATED · **parcel** |
| `frontSetback` | **null** (UNKNOWN-by-kind — alignment zone) | «Edificació alineada a vial.» | MPGM 22@BCN 2006 | Art. 8 | 1.a | 2006-06-14 | NOT-THE-RULE-KIND |
| `rearSetback` | **null** | — (the article states none) | — | — | — | — | NOT-THE-RULE-KIND |
| `sideSetback` | **null** | — (the article states none) | — | — | — | — | NOT-THE-RULE-KIND |
| `buildableDepth` | **null — UNKNOWN, AND THIS IS THE BLOCKER** | *the article states no profunditat edificable at all* | — | — | — | — | **UNKNOWN** |
| `permittedUse` | `industrial` only, by right | «L'edificació a la zona 22@, destinada als **usos industrials permesos a l'article 6**…» | MPGM 22@BCN 2006 | Art. 8 | 1 | 2006-06-14 | STATED |
| `minParcel_m2` | **500** | «Parcel·la mínima de 500 m².» | MPGM 22@BCN 2006 | Art. 8 | 1.e | 2006-06-14 | STATED |
| `subsoil` | **fully occupiable** (a stated 100 %) | «El subsòl pot ser ocupat en la seva totalitat.» | MPGM 22@BCN 2006 | Art. 8 | 1.d | 2006-06-14 | STATED |
| `farInclusions` | *altells* + enclosed *cossos sortints* **count** toward the 2,2 | «Els altells i els cossos sortints tancats computen en tot cas dins el sostre edificable.» | MPGM 22@BCN 2006 | Art. 8 | 1.c | 2006-06-14 | STATED |

**Rule KIND:** `alignment` **in principle** (Art. 8.1.a, *edificació alineada a vial*) — but **NOT
INSTANTIABLE**, because `alignment` requires a *profunditat edificable* and Art. 8 states none.
See §3 and §4. · **Granularity:** **parcel** for every Art. 8.1 figure. ·
**GIS code (`CODI_QUAL_AJUNT`):** `22@` — measured live across 1 014 MUC resolutions
(`../../BARCELONA-COMPLETE-COVERAGE-PLAN.md` §2); harmonised `CODI_QUAL_MUC` class is a **zone**,
not a *sistema*.

### 1.2 — Art. 8.1.b — the *alçada reguladora màxima* table

Verbatim (2006 text, PDF p. 199; identical in the 2000 text, PDF p. 157):

> «Alçada reguladora màxima i nombre de plantes: **24 m** per a carrers de **20 m d'amplada o
> superior** amb un límit de **planta baixa i quatre pisos**; **19,20 m** per a carrers **d'11 m i
> menys de 20 m**, amb un límit de **planta baixa i tres pisos**; **14,40 m** per a carrers de
> **8 i menys d'11 m**, amb un límit de **planta baixa i dos pisos**; **9,60 m** per a carrers de
> **menys de 8 metres** amb un límit de **planta baixa i un pis**. L'alçada reguladora s'aplicarà
> segons el tipus d'ordenació d'alineació de vial.»

| *amplada de vial* (m) | *alçada màxima* (m) | *nombre de plantes* |
|---|---|---|
| < 8 | **9,60** | PB + 1 P |
| ≥ 8 and < 11 | **14,40** | PB + 2 P |
| ≥ 11 and < 20 | **19,20** | PB + 3 P |
| ≥ 20 (open-ended) | **24,00** | PB + 4 P |

**Band edges are STATED, not adopted.** *"de menys de 8"* / *"de 8 i menys d'11"* / *"d'11 m i
menys de 20 m"* / *"de 20 m o superior"* fixes the half-open `[min, max)` reading in the article's
own words, at all four edges.

⚠⚠ **FOUR BARCELONA STREET-WIDTH LADDERS NOW EXIST AND NO TWO AGREE ON A SINGLE HEIGHT.**

| clau | article | band edges (m) | heights (m) | storey ladder |
|---|---|---|---|---|
| `13a` | Art. 327.2 | 8 / 12 / 15 / 20 / 30 | 8,55 · 11,60 · 14,65 · 17,70 · 20,75 · 23,80 | 3,05 |
| `13b` | Art. 328.2a | 8 / 11 / 15 | 7,55 · 10,60 · 13,65 · 16,70 | 3,05 |
| `22a` | Art. 350.2.c | 8 / 11 | 9 · 13 · 17 | (none) |
| **`22@`** | **Art. 8.1.b** | **8 / 11 / 20** | **9,60 · 14,40 · 19,20 · 24,00** | **4,80** |

22@ shares edges 8 and 11 with 13b/22a and edge 20 with 13a, and agrees with none of them on a
height. The 4,80 m ladder is an *industrial* floor-to-floor. **It is a consistency check on the
reading, not the source of any figure** — every number above is transcribed from the article, and
if the article had broken its own ladder the article would win.

⚠ **INDEPENDENT CORROBORATION of the height *key*** — prescription **(j)** of the 27-07-2000
approval, incorporated *d'ofici*: *«L'alçada reguladora màxima s'ajustarà en qualsevol cas en
funció l'ample del carrer al que donin front les edificacions, tant pel cas d'edificacions amb
fronts consolidats com pel edificis per usos propis de la zona 22@.»*

### 1.3 — The **transformation regime** (Arts. 16 / 17) — ⚠ **BLOCK granularity, and earmarked**

> Art. 16.4.a: «l'edificabilitat ve determinada pels índexs d'edificabilitat nets següents,
> **aplicats sobre la superfície de l'illa** qualificada com a zona d'activitats 22@ en la MPGM.»

| coefficient | value | destination | article |
|---|---|---|---|
| *coeficient net* | **2,2** | Art. 6 uses | Art. 16.4.a |
| *complementari* | **0,5** | **exclusively *activitats @***, conditional on the PMU evidencing the initiatives | Art. 16.4.a |
| *complementari addicional* | **0,3** | ***de titularitat municipal***, protected housing | Art. 16.4.a · Art. 17.1 |
| *increment* | **0,2** | **only in the six delimited ámbitos**, municipal | Art. 16.4.a |

Six delimited ámbitos (Art. 16.2, plànol núm. 2): **Llacuna · Parc Central · Campus Audiovisual ·
Llull-Pujades (Llevant) · Llull-Pujades (Ponent) · Perú-Pere IV.**

Ceilings, stated directly by the 27-07-2000 prescriptions:
- **(b)** *«Les actuacions de transformació mantindran amb caràcter general una edificabilitat
  màxima de 3 m² sostre/m² sòl»* (2,0 + 0,2 + 0,5 + 0,3).
- **(c)** + 0,20 in the six delimited ámbitos ⇒ **3,2**.

Also stated in the transformation regime: dwelling density = *sostre* for housing ÷ **90 m²**
(Art. 16.4.d — ⚠ **not** a hab/ha figure); cession of **10 %** of the ámbito as *equipament*
(Art. 16.4.c) and of **31 m² of land per 100 m² of housing floor area, of which ≥ 18 m² as
*espais lliures*** (Art. 16.4.c, Art. 22.1.c); **25 %** of housing floor area promoted for rent
(Art. 16.4.a).

⚠ **THE 2,2 GRANULARITY FLIP IS THE TRAP.** Art. 8.1's 2,2 is *per parcel·la*; Art. 16.4.a's 2,2 is
*sobre la superfície de l'illa*. Same digits, different denominator. A block index shown as a
parcel index is a **category error, not an imprecision** (C58 §1.11.2).

### 1.4 — The **Art. 9 *fronts edificatoris*** sub-regime — ⚠ a DIFFERENT article and a DIFFERENT table

> Art. 9.2.b: «L'alçada de les edificacions no superarà la de **20,75 m** corresponent a **planta
> baixa i cinc pisos**, en carrers de 20 metres… Per a carrers d'amplada inferior, s'aplicarà el
> que determina l'**article 327 de les NNUU**.»
>
> Art. 9.2.c: «La fondària edificable del front es fixarà com a **terme mig de les edificacions
> consolidades** (edificis ≥ PB+3 i nombre d'habitatges ≥ 4) que formin part del front.»

Parcels forming part of a housing frontage marked on **plànol núm. 3** are governed by Art. 9, via
a Pla de Millora Urbana — **not** by Art. 8.1. Their height comes from **PGM Art. 327**, i.e. the
clau 13a ladder. On a 10 m street that is **11,60 m** against Art. 8.1.b's **14,40 m** — applying
the wrong one over-states by 24 %.

---

## 2 — Amendments that supersede the base instrument

| instrument | ambit | what it changes | approved | source |
|---|---|---|---|---|
| **MPGM 22@BCN** | Poblenou, three discontinuous sectors either side of the Diagonal (plànol núm. 1) | **Creates** clau `22@` (Art. 4.1) and equipament type `7@`; Arts. 1–19 + Annex 1 (*activitats @*) + Annex 2 (reusable industrial buildings) + fitxes for UA-4 / UA-11 | Subcomissió d'Urbanisme del municipi de Barcelona, **27-07-2000** — DOGC 3239, 05-10-2000, with prescriptions **(a)–(l)** incorporated *d'ofici* | PDF pp. 154–168 |
| **MPGM 22@bcn (modificació)** | same | **Full re-statement, and the text in force.** *Pla Especial de Reforma Interior* → **Pla de Millora Urbana** throughout; **new Arts. 20–23** (urbanisation-cost duties; **10 % *aprofitament* cession** per Art. 43 TRLU, in Arts. 21.1.c and 22.1.f); statutory refs move from DL 1/1990 to the TRLU (Arts. 29, 43, 102, 114); Art. 9.2.b gains a PMU justification escape; Art. 9.2.f gains an off-site / economic-equivalent cession | Subcomissió d'Urbanisme del Municipi de Barcelona, **01-03-2006** — DOGC 4654, 14-06-2006 | PDF pp. 196–209 (**raster only**) |

⚠ **Art. 8.1 is UNCHANGED between the two texts** — verified word for word. Every figure in §1.1
and §1.2 therefore survives the amendment. That is a positive finding, and it is the reason this
transcription can be stated at all.

⚠ **NOT CHECKED: any amendment after 01-03-2006.** The committed PDF is an MMAMB re-edition with a
fixed cut-off, **not** a live consolidation. RPUC / AMB NUMAMB is the live text. A post-2006
MPGM/PMU touching Art. 8 would not appear here.

---

## 3 — Is any parameter CONSTRUCTED rather than stated?

**Yes — and the classification splits four ways, which is the whole point of §2 of the protocol.**

| outcome | fields | why |
|---|---|---|
| **STATED** | `farRatio` 2,2 · `maxCoverage` 0,70 · `minParcel_m2` 500 · subsoil 100 % · FAR inclusions · the four height-table rows · `permittedUse` | scalars written in Art. 8.1 and its lettered conditions |
| **CONSTRUCTED** | `maxHeight_m` / `maxFloors` | Art. 8.1.b is a **table keyed to the *amplada de vial***. It is not a zone scalar; it needs the *ample oficial del carrer* — the same single named blocker as Arts. 327 / 328 / 350.2.c. Also: Art. 9.2.c's frontage depth (*terme mig* of the consolidated buildings on the front) is a construction over data PRYZM does not hold. |
| **NOT-THE-RULE-KIND** (`no-limit`, a **finding**) | `frontSetback` / `rearSetback` / `sideSetback` · `densityScope` (Art. 8.1 regime) | Art. 8.1.a orders the zone *alineada a vial*: the façade sits ON the street line, so a front/side/rear triple has no value **by design**. And the by-right regime is industrial-use only — it states no dwelling cap because dwellings are not a by-right use here (Art. 6). |
| **UNKNOWN** | **`buildableDepth`** | ⚠ **Genuinely unknown, and it is the blocker.** Art. 8 states no *profunditat edificable* — not a figure, not a construction, not a cap. |

⚠ **A CONSTRUCTED parameter is an ENGINEERING task. No signature converts it into a
transcription.** The height table cannot be typed into a pack as a scalar; it needs the street-width
layer.

---

## 4 — Open questions / unverified

**Q1 — ⚠ DOES PGM Art. 350.2.b's 70 %-of-block band REACH 22@ SUPPLETORILY? (decides the rule KIND)**
Art. 5: *«La zona d'activitats 22@ es defineix formalment com a una **subzona de la zona industrial
22a** i es regula pel que disposen les Normes Urbanístiques (NNUU) del PGM per a la zona 22a,
**llevat d'allò que expressament s'estableix en els articles següents**.»* Art. 8.1.f expressly
replaces the occupation (70 % of the parcel vs Art. 350.2.a's 90 %) and Art. 8.1.b expressly
replaces the height table. **It says nothing about the *franja concèntrica*.** Two readings:
- **(i) the band survives** — not expressly displaced, so above the ground floor a 22@ building
  must sit inside the band whose area equals 70 % of the block, and 22@ is a `tiered-occupation`
  zone like 22a;
- **(ii) the band falls** — Art. 8.1 states a closed set of *condicions d'edificació* (a–g) for a
  *llicència directa*, and a supletory band would make the by-right path unusable without a block
  ring the licence process never asks for.

**This is a legal reading, not an engineering choice, and an implementer must not settle it.**
Under (i) the envelope is two-tier; under (ii) it is a single prism capped at 70 % of the parcel.
That is a difference of **SHAPE**, and no confidence value corrects a wrong shape (ADR-0270).

**Q2 — Which parcels are on an Art. 9 *front edificatori*?** Needs **plànol núm. 3**. Not held.
**Q3 — Which parcels are inside an Art. 16 delimited ámbito?** Needs **plànol núm. 2**. Not held.
**Q4 — Which parcels have an Art. 8.1.a *estudi de detall* converting them to *edificació
aïllada*?** No source. The MUC returns `22@` for all of Q2/Q3/Q4.
**Q5 — Post-2006 amendments.** Not checked; RPUC is the live text.

### Figures REFUSED in writing

- ⚠ **No 22@ figure was taken from any of Arts. 327, 328 or 350.2.c**, despite the shared band
  edges. Every 22@ height comes from Art. 8.1.b. The four-table comparison in §1.2 exists to make
  that checkable.
- ⚠ **`maxCoverage` 0,90 was NOT used.** It is PGM Art. 350.2.a's figure for clau `22a`; Art. 8.1.f
  expressly states **70 %** for 22@. Reusing 22a's number would over-state occupation by 20 pp.
- ⚠ **The transformation ceiling of 3,0 / 3,2 is NOT published as a parcel FAR.** It is a
  block-granularity index reached only through an approved Pla de Millora Urbana, and two of its
  four components are earmarked (0,5 exclusively *activitats @*; 0,3 municipal, protected housing).
- ⚠ **Art. 242's 11 m / 30 m depth clamps were NOT borrowed** to instantiate an `alignment` rule.
  They are the Eixample article's, and importing them under an Art. 8 citation is L-526 verbatim.

### What is NOT modelled

The MPGM's *règim d'usos* (Art. 6) is dense and consequential — storage capped at 1 000 m²/floor
and 3 000 m² total, parcel-delivery centres capped at 400/500 m², a ban on hazardous storage, an
8 t vehicle limit, no *grans establiments comercials* (Llei 1/1997). None of it is in the corpus.
Nor are the Art. 19 *Pla Especial d'Infrastructures* servitudes (Art. 19.4 says they are inscribed
against the property on licence). Nor the *disconformitat* regime of Disposició transitòria Primera.

---

## 5 — What shipped, and what did not

**Shipped:** `packages/site-parcel-data/src/rulepacks/esBarcelona22Arroba.ts` — the pack, the
Art. 8.1.b table, `resolveAlcada22Arroba`, the transformation coefficients (quarantined),
`BCN_22ARROBA_OPEN_QUESTIONS` and `BCN_22ARROBA_ENVELOPE_BLOCKER`. Tests:
`packages/site-parcel-data/__tests__/esBarcelona22ArrobaPack.test.ts` (31).

**NOT shipped — the pack is deliberately NOT registered in `registry.ts`:**
1. `geometricRule` is `null` because no `GeometricRule` kind can be filled from Art. 8 without
   inventing a field (Q1 above decides which kind). ⚠ A null rule with null setbacks makes
   `computeBuildableEnvelope` return the **whole parcel**, on a card printing 70 % from Art. 8.1.f
   — self-contradicting and over-stating.
2. Q2 / Q3 / Q4 make the regime unobservable per parcel.
3. Art. 8.1.b needs the *ample oficial del carrer* layer.

**Follow-up this transcription creates:** `22@`'s current refusal is
`barcelonaNoRulePackRefusal`, whose copy says PRYZM *"has read and encoded the base industrial zone
(22a) but not 22@"*. **That became false when this pack was authored** — the same correction 13b
and 22a each needed. Re-point `22@` at a named `regime-undetermined` refusal publishing
`BCN_22ARROBA_ART8_LIMITS` under `BCN_22ARROBA_ORDINANCE_REF`.

---
*Transcribed 2026-07-31 from `../../PGM-NNUU-metropolitana.pdf` (2000 text pp. 155–168; 2006 text
pp. 196–209, read from a raster render). Maintainer: UNASSIGNED. Founder signature: **NOT GIVEN**.
Authority: C63 · C58 §1.2/§1.4/§1.7a/§1.11/§1.13.7 · ADR-0270 (rule KIND) · ADR-0271 · ADR-0276.
Method: `../EXTRACTION-PROTOCOL.md`.*
