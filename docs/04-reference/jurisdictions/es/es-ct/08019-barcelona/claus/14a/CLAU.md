# Clau `14a` — Zona de remodelació física, subzona I: remodelació **pública**

> **STATUS: REFUSAL VERIFIED AGAINST THE PRIMARY TEXT — and the refusal is CORRECT.**
> ✅ **This is the cleanest of the six.** Art. 357.1 is a textbook delegation, with the PGM keeping
> only a ceiling. Nothing here was left untranscribed.
> Family: **zona** · Municipality: Barcelona (`08019`) · Instrument: **PGM-1976**, Normes
> Urbanístiques, Títol IV, Capítol IV, **Secció 9a** (Arts. 353–358). Official designation per
> **Art. 314.8**, subzona I.
>
> ⚠ Nothing here is self-certified. Founder signature: **NOT GIVEN**.

Primary source: `../../PGM-NNUU-metropolitana.pdf`, **PDF pp. 117–118** (printed 116–117).

---

## 1 — THE DELEGATING SENTENCE

> **PGM Art. 357.1** — «A les zones de remodelació pública **la edificabilitat serà la que
> s'estableixi als Plans de Reforma Interior**, que **no podran depassar l'edificació global
> existent al sector**.»

Reinforced by:

> **PGM Art. 355.1** — «A les zones de remodelació pública **el tipus d'ordenació s'elegirà al Pla
> de Reforma Interior**, i es podrà optar entre el d'edificació volumètrica específica i el
> d'edificació tridimensional.»
>
> **PGM Art. 358.1** — «Les condicions d'edificació a les zones de remodelació pública **es
> determinaran al Pla de Reforma Interior** amb subjecció al tipus d'ordenació elegit i al límit
> d'edificabilitat que s'estableix al número primer de l'article anterior.»
>
> **PGM Art. 356.1** — «Per a les zones de remodelació pública **el Pla de Reforma Interior ha
> d'establir els estàndards** en proporció que millori les destinacions actuals a vials,
> estacionaments, espais lliures i dotacions comunitàries.»

⇒ **Every determination is delegated**, three times over: the edificabilitat (357.1), the ordering
type (355.1) and the conditions (358.1). The PGM keeps exactly one thing — a **ceiling equal to
the sector's existing global built area** — which is itself a construction over the existing
fabric, at *sector* granularity, and therefore not a per-parcel figure.

**Verdict: `derived-plan` is the CORRECT refusal code.** ✅

---

## 2 — What the code returns (pinned)

`barcelonaZoneRefusal('14a')` ⇒ `code: 'derived-plan'`, `legallyGrounded: true`.
Pinned by `packages/site-parcel-data/__tests__/esBarcelonaRefusalClausGrounding.test.ts`.

---

## 3 — PART A · normative parameters

| field | value | quote / basis | article | outcome |
|---|---|---|---|---|
| `officialDesignation` | *Zona de remodelació física — Subzona I: remodelació pública (14a)* | «Subzona I: remodelació pública (14a).» | Art. 314.8 | STATED |
| `farRatio` | **null** | «…serà la que s'estableixi als Plans de Reforma Interior…» | Art. 357.1 | **NOT-THE-RULE-KIND** (delegated) |
| edificabilitat **ceiling** | *the sector's existing global built area* | «…que no podran depassar l'edificació global existent al sector.» | Art. 357.1 | **CONSTRUCTED** · **sector** granularity |
| dwelling increment ceiling | **+12 %** of existing dwellings | «Es podrà augmentar l'edificació per a habitatges fins a un **12 per 100** dels habitatges existents…» | Art. 357.1 | **STATED**, relative to the existing stock |
| housing floor-area ceiling | max dwellings **× 100 m²** | «…el sostre per a ús d'habitatge no podrà depassar el que resulta de multiplicar per cent metres quadrats el nombre màxim d'habitatges.» | Art. 357.1 | **STATED**, derived from the dwelling count |
| `maxHeight_m` / `maxFloors` | **null** | delegated | Art. 358.1 | UNKNOWN (delegated) |
| `maxCoverage` | **null** | delegated | Art. 358.1 | UNKNOWN (delegated) |
| setbacks | **null** | the ordering type is *volumetria específica* **or** *tridimensional*, chosen by the plan | Art. 355.1 | **NOT-THE-RULE-KIND** — neither ordering type has a setback triple |
| `permittedUse` | **null** | not stated in Secció 9a | — | UNKNOWN |

**Rule KIND:** delegated — the plan chooses between *edificació volumètrica específica* and
*edificació tridimensional*, and neither is expressible as a `setback` / `alignment` rule. ·
**Granularity:** **sector**, throughout. · **GIS code:** `14a`.

---

## 4 — Actuation regime (not envelope parameters, recorded for completeness)

> **Art. 354.1** — PRIs are drawn up by the Administration; owners may request the *compensació*
> system under Art. 119 of the Llei del sòl. Failing private collaboration the system is
> **expropriation**. ⚠ *«Passats dos anys de l'aprovació del Pla General metropolità sense que
> l'Administració hagi elaborat el Pla de Reforma Interior, podrà aplicar-se la remodelació
> privada segons el paràgraf següent.»* — i.e. after two years of inaction, the **14b** regime
> becomes available. The PGM is from 1976; whether that switch has been exercised on a given
> sector is **not published**, and it is a second reason a 14a parcel's rules cannot be stated.

---

## 5 — Amendments

⚠ **Art. 357's footnote 58 says *"Veure modificació per al Municipi de Barcelona a la pàg. 151"*,
and that modification (PDF p. 152) rewrites Art. 356 and Art. 357.**2** — i.e. **the 14b figures
only**. It does **not** touch Art. 357.1. **Art. 357.1 is base PGM text for Barcelona.** See
`../14b/CLAU.md`.

---

## 6 — Open / unverified

- Whether a Pla de Reforma Interior exists for a given 14a sector, and its contents. Not held.
- Whether the Art. 354.1 two-year switch to the private (14b) regime has been exercised.
- **Which *unitat de zona* / sector** a parcel belongs to — every figure above is sector-scoped.

---
*Verified 2026-07-31 against `../../PGM-NNUU-metropolitana.pdf` pp. 117–118 + 152.
Founder signature: **NOT GIVEN**. Authority: C63 · C58 · ADR-0270 · ADR-0271.
Method: `../EXTRACTION-PROTOCOL.md`.*
