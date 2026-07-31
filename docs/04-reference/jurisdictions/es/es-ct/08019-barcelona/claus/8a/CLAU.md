# Clau `8a` — Zona de **verd privat protegit**

> **STATUS: REFUSAL VERIFIED AGAINST THE PRIMARY TEXT — and the refusal is CORRECT.**
> ⚠ **THE SCAFFOLD TITLE WAS WRONG.** This folder was headed *"Protecció de sistemes generals"*.
> **PGM Art. 314.6 says *Zona de verd privat protegit*** — a *zona*, not a *sistema*. The code got
> this right (`protected-private-green`); the scaffold did not. Corrected here.
> ⚠ **AND THE ORDINANCE IS NOT SILENT**: Arts. 345.3 + 347.2.e state a new-build formula **and a
> full setback triple** for parcels over 3 000 m². See §3.
> Family: **zona** · Municipality: Barcelona (`08019`) · Instrument: **PGM-1976**, Normes
> Urbanístiques, Títol IV, Capítol IV, **Secció 7a** (Arts. 344–347).
>
> ⚠ Nothing here is self-certified. Founder signature: **NOT GIVEN**.

Primary source: `../../PGM-NNUU-metropolitana.pdf`, **PDF pp. 115–116** (printed 114–115).
Designation confirmed twice: **Art. 314.6** (*«6. Zona de verd privat protegit (8a).»*) and the
table of contents, PDF p. 9 (*«Secció 7a. Zona de verd privat protegit (8a) … 114»*).

---

## 1 — THE GOVERNING SENTENCE — ⚠ not a delegation, and not a coverage gap

> **PGM Art. 344** — «Es qualifica de zona de verd privat protegit **el sòl urbà amb edificacions
> aïllades, generalment amb entorns enjardinats d'interès**.»
>
> **PGM Art. 345.1** — «**L'edificabilitat, en aquesta zona, es defineix en relació amb
> l'edificació actual existent** i només es permet **augmentar-la fins a un màxim del 10 per 100**
> mitjançant obres de millora que siguin compatibles amb el caràcter protegit de l'edifici i els
> espais enjardinats de l'entorn.»

⇒ **The entitlement is measured against the EXISTING BUILDING, not against the plot.** There is no
per-parcel envelope to construct — not because the rule lives elsewhere (that would be
`derived-plan`) and not because we have not read it (that would be a coverage gap), but because
the ordinance's own unit of account is the building that is already there. `farRatio` is
**NOT-THE-RULE-KIND**.

**Verdict: `protected-private-green` is the CORRECT refusal code**, and it is correctly *not* a
member of the `derived-plan` family and correctly *not* one of the public-land codes. ✅
The distinction the code already makes — **private land, still not buildable** — is exactly what
Art. 344 says.

---

## 2 — What the code returns (pinned)

`barcelonaZoneRefusal('8a')` ⇒ `code: 'protected-private-green'`, `legallyGrounded: true`.
Pinned by `packages/site-parcel-data/__tests__/esBarcelonaRefusalClausGrounding.test.ts`, which
also asserts it is **not** `derived-plan` and **not** any public-land code.

⚠ **RECOMMENDED (reported, not applied):** the shipped `detail` describes the zone correctly but
cites only the instrument. It can now carry **Arts. 344 / 345.1** and the *"+10 % relative to the
existing building"* rule, which is the single most useful fact for an 8a owner and is currently
absent from the card.

---

## 3 — ⚠ THE FINDING: a stated formula, and a stated setback triple

### 3.1 — Art. 345.3 — new building on parcels over 3 000 m²

> «A les parcel·les de **més de 3.000 m²**, i **per mitjà d'un Pla Especial**, s'autoritza una
> edificació nova que **no podrà passar de 500 m² de sostre edificable per cada 2.500 m² d'excés
> sobre els 3.000 m²** que s'ajustaran, pel que fa a les condicions d'edificació, a la protecció de
> les característiques de la zona que interessa conservar i estaran subjectes als criteris que
> s'assenyalen als articles següents.»

**CONSTRUCTED**, parcel granularity: `newFloorArea_max = 500 × floor((area − 3000) / 2500)` m²
sostre — with the *"per cada"* reading (per completed 2 500 m² increment) taken as written.
⚠ Gated on **a Pla Especial** and on the parcel exceeding 3 000 m².

### 3.2 — Art. 347.2.e — ⚠ A COMPLETE SETBACK TRIPLE

> «e. Les obres de nova planta, s'han d'ajustar a les condicions següents:
> – **superfície màxima de sostre edificable: 500 m² per cada parcel·la mínima**
> – **alçada màxima permesa: 9 m.**
> – **distància mínima de front del vial: 6 m.**
> – **distància mínima a llindes de parcel·la: 4 m.**»

| field | value | outcome | granularity |
|---|---|---|---|
| `maxHeight_m` | **9** | **STATED** | parcel |
| `frontSetback` | **6** | **STATED** | parcel |
| `sideSetback` / `rearSetback` | **4** (a single *llindes* figure, not split) | **STATED** | parcel |
| max sostre per minimum parcel | **500 m²** | **STATED** | per *parcel·la mínima* (= 2 500 m², Art. 347.2.c) | 

⚠⚠ **This is the exact shape the engine solves** — an `edificació aïllada` ordering (Art. 346:
*«L'ordenació en aquesta zona correspon al tipus d'edificació aïllada…»*) with a real front/side/
rear triple and a height. **It is nonetheless correctly refused**, because every one of those
figures applies **only** to *obres de nova planta* authorised **by a Pla Especial** on a parcel
**over 3 000 m²** whose subdivision has been justified against Art. 347.2.c's 2 500 m² minimum.
On the ordinary 8a parcel — an existing protected building in a garden — the rule is Art. 345.1's
**+10 % of what exists**, and no envelope exists at all.

Applying §3.2's triple to a generic 8a parcel would be the C58 §1.11 category error in its purest
form: a correctly-shaped, correctly-cited envelope on land the article does not reach.

### 3.3 — Art. 345.2 — uses

> «S'admet, en aquesta zona, el manteniment dels usos originals existents compatibles amb
> l'edificació i l'entorn seu. També s'admet un **ús d'habitatge unifamiliar** i, si escau,
> mitjançant l'aprovació d'un **Pla especial** es podran autoritzar aquells usos **culturals,
> recreatius, docents o assistencials** compatibles amb la protecció…»

`permittedUse`: existing uses + *habitatge unifamiliar* by right; cultural / recreational /
educational / welfare uses only via Pla Especial.

---

## 4 — PART A · summary

| field | value | article | outcome |
|---|---|---|---|
| `officialDesignation` | *Zona de verd privat protegit (8a)* | Art. 314.6 · Secció 7a | STATED |
| `farRatio` | **null** | Art. 345.1 | **NOT-THE-RULE-KIND** — measured against the existing building |
| improvement increment | **+10 %** of existing built area | Art. 345.1 | **STATED**, relative |
| `maxHeight_m` | **null** generally; **9 m** for Art. 345.3 new-build | Art. 347.2.e | STATED **but gated** |
| `maxCoverage` | **null** | — | UNKNOWN — no occupation figure is stated |
| `frontSetback` | **null** generally; **6 m** for Art. 345.3 new-build | Art. 347.2.e | STATED **but gated** |
| `side`/`rearSetback` | **null** generally; **4 m** for Art. 345.3 new-build | Art. 347.2.e | STATED **but gated** |
| `buildableDepth` | **null** | — | NOT-THE-RULE-KIND (*aïllada*) |
| minimum parcel (for subdivision above 3 000 m²) | **2 500 m²** | Art. 347.2.c | STATED |
| `permittedUse` | see §3.3 | Art. 345.2 | STATED |

**Rule KIND:** `setback` — **only inside the Art. 345.3 / 347.2.e gate**. Outside it there is no
rule kind at all, because the entitlement is not geometric. · **Granularity:** parcel. ·
**GIS code:** `8a`.

---

## 5 — Open / unverified

- Whether a Pla Especial exists for a given 8a parcel, and whether the parcel exceeds 3 000 m² —
  the two gates on everything in §3. Parcel area IS available from Catastro; **the Pla Especial is
  not**, so the gate cannot be cleared from the area alone.
- Art. 345.1's *"edificació actual existent"* — the existing built area — is not held. Catastro's
  `superficie construida` is a candidate input and has **not** been evaluated for this purpose.
- Whether the *llindes* figure of 4 m is intended to apply to side and rear alike; the article
  states one number for all boundaries and does not distinguish. **Read as written**, not split.
- No Barcelona-specific modification of Arts. 344–347 was found; **checked** — PDF pp. 115–116
  carry no *"Veure modificació per al Municipi de Barcelona"* footnote.

---
*Verified 2026-07-31 against `../../PGM-NNUU-metropolitana.pdf` pp. 9, 105, 115–116.
Founder signature: **NOT GIVEN**. Authority: C63 · C58 §1.7a/§1.11 · ADR-0270 · ADR-0271.
Method: `../EXTRACTION-PROTOCOL.md`.*
