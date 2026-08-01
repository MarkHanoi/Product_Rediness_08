# Clau `12` — Zona de Nucli Antic, Subzona I: substitució de l'edificació antiga

> **STATUS: SHIPPED (pack registered 2026-07-22) · geographic-predicate question CLOSED
> (§CLAU-12-PREDICATE, L-674, 2026-08-01).**
> Family: **zona** · Municipality: Barcelona (`08019`) · Instrument: **PGM-1976** (Pla General
> Metropolità, aprovat 14-07-1976), Normes Urbanístiques, Títol IV, Capítol IV, Secció 2a,
> Arts. 314.1, 315–320, with the Barcelona-exclusive Arts. 317/318 (DOGC 4277, 10-12-2004) and the
> Art. 320 modification (DOGC 4893, 29-05-2007).
> Code: `packages/site-parcel-data/src/rulepacks/esBarcelonaNucliAntic.ts`.

## 0 — The predicate question, settled

**CLOSURE-REGISTER blocker 3 asked for a *geographic predicate*: a test that would stop a Ciutat
Vella parcel receiving subzona I's envelope. There is none to write, and writing one would be the
error.**

**Art. 315.2** reads: *«A la zona de nucli antic es distingeix una subzona I, en substitució de
l'edificació antiga (12), **d'aplicació a tots els nuclis antics diferents del de Barcelona**, i una
subzona II, de conservació del centre històric (12b), **referida preferentment a aquell**.»*

| | why it is not a predicate |
|---|---|
| **1** | **It is a drafting rationale, not a test.** It says which nuclei the two subzones were drawn *for*. It defines no boundary, names no district, states no coordinate. Art. 315.1 scopes the ZONE to *«els nuclis urbans antics de les poblacions»* generally; **neither paragraph delimits either subzone.** |
| **2** | **The ordinance hedges the half a predicate would rest on** — *«referida **preferentment** a aquell»*. A drafter writing an exclusivity rule does not hedge it. |
| **3** | ⚠ **The operative instrument is the *plànol d'ordenació*, parcel by parcel — and PRYZM already reads it.** The PGM assigns claus by drawing them; the MUC serves that drawing. A predicate coded here would be a **second, weaker classifier**, and by construction it could only ever ACT where it DISAGREED with the plànol — i.e. it would override the operative instrument precisely when doing so was wrong. That is `mucZoningProxy.js`'s standing warning (*"the harmonised code must never select a rule pack"*) in a new costume, and C58 §1.11's category error committed by the guard written to prevent one. |

⇒ **Classification: `NOT-THE-RULE-KIND`.** Art. 315.2 is not a geographic rule of any kind. The
register's *"prove every Ciutat Vella parcel returns 12b"* is a question about **the MUC's fidelity
to the plànol** — bucket **A** (evidence about a data source), not bucket **B** (a rule PRYZM failed
to encode). Pinned as `BCN_CLAU_12_GEOGRAPHIC_PREDICATE_EXISTS = false` with the citation in
`BCN_CLAU_12_PREDICATE_FINDING`.

⚠ **What remains true:** if the MUC's transcription of the plànol is wrong somewhere, `12`'s pack
applies where `12b`'s rules should. That risk is bounded by the source's fidelity, **not reducible
by a predicate** (a wrong clau in the source produces a wrong answer whatever we layer on top), and
mitigated by the invariant below.

**The engineering mitigation that DOES ship — `12` and `12b` never share a code path.** `12b` is
absent from `BCN_NUCLI_ANTIC_ZONE_CODES` and from `CLASSIFICATIONS`, so a `12b` parcel reaches the
coverage-gap card and is told plainly that PRYZM has not encoded ITS subzone. **The feared failure
mode can only arise from a wrong clau in the source, never from a routing mistake in PRYZM** — and
that is now asserted, not merely commented (`esBarcelonaClosureBlockers.test.ts`).

## 1 — PART A · normative parameters

| field | value | quote (verbatim) | legalSource | article | paragraph | effectiveDate | confidence |
|---|---|---|---|---|---|---|---|
| `officialDesignation` | Zona de nucli antic — subzona I, substitució de l'edificació antiga | «Subzona I: substitució de l'edificació antiga (12).» | PGM-1976 NNUU | 314 | 1 | 1976-07-14 | **STATED** |
| `ordinationType` | *segons alineacions de vial vigents* | «Correspon al d'edificació segons alineacions de vial vigents.» | PGM-1976 NNUU | 319 | — | 1976-07-14 | **STATED** |
| `farRatio` | **1,40** m² sostre/m² sòl, **net**, *entre alineacions vigents* | «es defineix un índex d'edificabilitat net, entre alineacions vigents, d'1,40 m2 sostre/m2 sòl» | PGM-1976 NNUU | 316 | 2 | 1976-07-14 | **STATED** |
| `densityScope` | **net**, per parcel, between current alignments | *(as above)* | PGM-1976 NNUU | 316 | 2 | 1976-07-14 | **STATED** |
| `maxHeight_m` | `null` — a per-street **CONSTRUCTION**, not a zone scalar | «l'alçada reguladora màxima i el nombre de plantes es determinen segons l'amplada del vial … d'acord amb el quadre següent» | PGM-1976 NNUU (Barcelona mod. DOGC 4893) | 320 | 3a | 2007-05-29 | **CONSTRUCTED** |
| `heightMeasurement` | Art. 239.2 (vertical at the façade plane) + Art. 240 rasant rules | — | PGM-1976 NNUU | 239, 240 | 2 / 1 | 1976-07-14 | STATED (general) |
| `maxFloors` | `null` — same table, same construction. ⚠ Cap **10,60 m / PB+2** on solars with façana < 6,50 m | «als solars amb una longitud de façana inferior a 6,50 m., l'alçada màxima permesa mai no podrà depassar la de 10,60 m.» | PGM-1976 NNUU | 320 | 3a | 1976-07-14 | **CONSTRUCTED** |
| `maxCoverage` | **`null` — AND THIS IS A TRAP.** Art. 320.2a's *60 per 100* is an occupation **of the ILLA**, not of the parcel | «la profunditat edificable resultarà d'una ocupació, a l'alçada reguladora, del 60 per 100 de la superfície de l'illa» | PGM-1976 NNUU | 320 | 2a | 1976-07-14 | **NOT-THE-RULE-KIND** (block granularity ≠ parcel) |
| `frontSetback` | `null`, **not 0** — the façade sits ON the alignment (C58 §1.7a) | «L'edificació s'ha d'ajustar a l'alineació del vial en tot el frontal de la parcel·la» | PGM-1976 NNUU | 320 | 1a | 1976-07-14 | **NOT-THE-RULE-KIND** |
| `rearSetback` | `null` — replaced by *profunditat edificable* | — | PGM-1976 NNUU | 320 | 2a | 1976-07-14 | **NOT-THE-RULE-KIND** |
| `sideSetback` | `null` — *mitgera*, party wall | «Les parets mitgeres al descobert hauran d'acabar-se amb materials de façana.» | PGM-1976 NNUU | 320 | 1a | 1976-07-14 | **NOT-THE-RULE-KIND** |
| `buildableDepth` | **CONSTRUCTED** — 40 % interior free share of the dissolved block; floor **11 m**, cap **30 m** | «…al 40 per 100 de la superfície total…» (242.2) · «…inferior a 11 m., s'haurà de prendre aquesta dimensió…» (242.5) | PGM-1976 NNUU | 320, 242 | 2a / 2, 5, 6 | 1976-07-14 | **CONSTRUCTED** |
| `permittedUse` | residential, mixed | — | PGM-1976 NNUU | 316–320 | — | 1976-07-14 | STATED |

**Rule KIND:** `block-derived-alignment` · **Granularity:** parcel, **except** the 60 % occupation
which is **block** and is consumed as `interiorFreeRatio: 0.40` · **GIS code
(`CODI_QUAL_AJUNT`):** `12` · **harmonised `CODI_QUAL_MUC`:** `R1`

## 2 — Amendments that supersede the base PGM

| instrument | ambit | what it changes | approved | source |
|---|---|---|---|---|
| Modificació *d'aplicació exclusiva al municipi de Barcelona* | 08019 | **Art. 317.c** — density from *120 habitatges/ha* to *sostre màxim ÷ 80 m²*. **Art. 318** — from *200 hab/ha* (a DENSITY) to *superfície construïda ÷ 80 m²* (a per-parcel count from built area). ⚠ **A different KIND of quantity, not a different number.** The two percentages in Art. 317.a/.b are UNCHANGED, so a diff on the numbers alone would conclude nothing changed and then apply a superseded density. | 2004-10-20 | DOGC 4277, 10-12-2004; PGM NNUU printed p. 184 |
| Modificació de l'Art. 320 per al Municipi de Barcelona | 08019 | The **alçada reguladora** street-width table of Art. 320.3a. ⚠ **The base 1988 *quadre* is MISSING from our copy of the volume (p. 106)**; the shipped table is this one. | 2007-03-02 | DOGC 4893, 29-05-2007; PGM NNUU printed p. 274; `corpus/pdf/DOGC-4893_…pdf` |

⚠ **L-660 is OPEN and it touches this clau.** Whether the DOGC 4893 modification also supersedes
Arts. 327.2a/328.2a is a **founder-signature** blocker (CLOSURE-REGISTER row 2), not an engineering
one, and it is **not owned by this dossier**.

## 3 — Is any parameter CONSTRUCTED rather than stated?

**Yes — the *profunditat edificable*, and it is the whole zone.** Art. 320.2a states a *procedure*:
a 60 % occupation of the **illa** at the *alçada reguladora*, which the solver consumes as a 40 %
interior free share of the dissolved cadastral block, floored at 11 m (Arts. 242.5/242.6) and capped
at 30 m (Art. 242.2). ⚠ **Art. 242.2 independently names this subzone and its 40 %** — two articles,
written separately, agreeing. That is the strongest corroboration in the pack.

**The *alçada reguladora* is likewise a construction**, keyed on the *amplada de vial*
(`bcnAlcadaNucliAntic.ts`), which is why `maxHeight_m` is `null` here and not a scalar.

## 4 — Open questions / unverified

1. **Source tier.** The volume is the MMAMB re-edition — manually re-typeset, with documented
   transcription errors (Arts. 251.3a, 330, 331) and a missing table on p. 106. `estimated-ruleset`,
   **never `certified`.**
2. **§FLOOR discrepancy, REPORTED NOT REPLICATED.** This pack ships **11 m** (Arts. 242.5/242.6, read
   from the volume); `esBarcelonaEnsanche.ts` and `esBarcelonaSemiintensiva.ts` ship **12 m**. ⚠ A
   higher floor yields a DEEPER building, so 12 m **over-states** wherever the floor binds — the
   direction C58 §1.4 forbids. The sibling packs are owned by concurrent work and are not edited
   here.
3. **Ground-floor block interior.** Art. 320.2a: *«L'espai lliure interior d'illa no serà edificable
   en planta baixa»* — a REAL divergence from 13a/13b (Art. 242.8b). Neither is modelled today, so
   the omission costs nothing; ⚠ a future ground-floor-courtyard feature must NOT apply 13a's rule
   here.
4. **Cossos sortints — settled, and clau 12 is the zone that FORBIDS them.** Art. 320.5a prohibits
   *cossos i elements sortints* in subzona I, with four narrow exceptions (balconies ≤ 20 cm on
   streets < 6 m and ≤ 45 cm on 6–12 m streets; cornices/eaves ≤ 45 cm; roof-edge projections
   ≤ 45 cm; *miradors* on vies > 12 m at ≤ 1/20 of the street width, over ≤ half the façade, each
   ≤ 3,60 m wide). ⚠ **Art. 230.I excludes the *nucli antic* by name**, so the 1/10-of-street-width /
   1,50 m general allowance must never be applied here. See §COSSOS-SORTINTS (L-672).
5. **Art. 318 / Art. 317** are PROGRAMME and PERI-scale limits — recorded, never applied to the
   envelope.

## 5 — Measured share

| | value | denominator |
|---|---|---|
| clau `12` | **9.38 %** | private buildable land (AMB `qualificacio_refos` census, 31,801,618 m²) |
| clau `12` | **9.45 %** (26 of 275 points) | the repo's independent 275-point MUC grid |
| clau `12b` | 2.44 % / 1.82 % (5 points) | same two denominators — **still a coverage gap** |

**ENVELOPE-coverage delta from closing the predicate question: +0.00 pp.** The 9.38 % was already
counted — the pack has shipped since 2026-07-22. What closes is the **correctness risk** the RATE.md
§CLOSURE note called *"9.38 % of buildable land on an untested assumption"*: it was not an untested
assumption but a mis-framed question, and the answer is that the assumption is the plànol's, not
ours.

---
*Predicate question closed 2026-08-01 (§CLAU-12-PREDICATE / L-674). Pack shipped 2026-07-22 (L-591).
Authority: C63 · C58 §1.4/§1.7a/§1.11 · ADR-0270 · ADR-0271 (edificabilitat is a construction).
Code: `rulepacks/esBarcelonaNucliAntic.ts` · `rulepacks/esBarcelonaZoneClassification.ts`.
Tests: `__tests__/esBarcelonaNucliAnticPack.test.ts` · `__tests__/esBarcelonaClosureBlockers.test.ts`.
Sibling dossier: `../../RATE.md`.*
