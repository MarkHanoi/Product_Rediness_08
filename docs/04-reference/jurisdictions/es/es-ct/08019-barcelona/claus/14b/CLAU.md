# Clau `14b` — Zona de remodelació física, subzona II: remodelació **privada**

> **STATUS: REFUSAL VERIFIED AGAINST THE PRIMARY TEXT — and the refusal is CORRECT.**
> ⚠ **BUT THE ORDINANCE STATES REAL INDICES**, and Barcelona has its **own** modified figures:
> **brut 1,08** (not the base PGM's 0,90) · **net 2,89** · complementari zonal = the difference to
> **1,2**. Plus parcel·lació mínima 600 m² and façana mínima 13,50 m. See §3.
> Family: **zona** · Municipality: Barcelona (`08019`) · Instrument: **PGM-1976**, Normes
> Urbanístiques, Títol IV, Capítol IV, **Secció 9a** (Arts. 353–358), **as modified for Barcelona**
> (see §4). Official designation per **Art. 314.8**, subzona II.
>
> ⚠ Nothing here is self-certified. Founder signature: **NOT GIVEN**.

Primary source: `../../PGM-NNUU-metropolitana.pdf`, **PDF pp. 117–118** (base text) and
**PDF p. 152** (the Barcelona modification).

---

## 1 — THE DELEGATING SENTENCES

> **PGM Art. 355.2** — «A les zones de remodelació privada **el tipus d'ordenació serà el
> d'edificació volumètrica específica**.»
>
> **PGM Art. 358.2.c** — «Alçada màxima: A les unitats de zona de remodelació **inferiors als
> 12.000 m² de sòl**, l'alçada màxima **no pot depassar en un terç l'alçada de l'edificació més
> alta que sigui possible edificar als fronts de les àrees veïnes** per raó de la seva qualificació
> urbanística. A les unitats de zona de remodelació **superiors als 12.000 m²** de sòl, l'alçada
> màxima ha de ser **la que correspongui pel tipus d'ordenació de l'edificació escollida**.»
>
> **PGM Art. 358.3** — «Això no obstant, **el Pla de Reforma Interior podrà definir condicions
> diferents** de les assenyalades amb caràcter general en aquest article, quan els criteris
> d'ordenació del sector així ho aconsellin…»
>
> **Barcelona modification, Disposició addicional (PDF p. 152)** — «L'aplicació de les
> disposicions dels articles 356 i 357.2 **requerirà la tramitació d'un nou planejament** que
> justifiqui de manera adient l'aplicació dels estàndards establerts.»

⇒ **The delegation is real, on three independent grounds:**
1. The ordering type is ***volumetria específica*** (355.2) — the SOLID is defined by the PRI /
   Estudi de Detall, not by parameters. This is the same category as clau `18`.
2. The **height is a construction over the neighbouring frontages'** permitted heights (358.2.c),
   i.e. a function of surrounding qualifications, not of the plot — and above 12 000 m² it reverts
   to whatever ordering type the plan chooses.
3. Art. 358.3 lets the PRI override the stated conditions outright, and the Barcelona modification
   makes even its own figures conditional on **new planning being processed**.

**Verdict: `derived-plan` is the CORRECT refusal code.** ✅

---

## 2 — What the code returns (pinned)

`barcelonaZoneRefusal('14b')` ⇒ `code: 'derived-plan'`, `legallyGrounded: true`.
Pinned by `packages/site-parcel-data/__tests__/esBarcelonaRefusalClausGrounding.test.ts`.

---

## 3 — ⚠ THE FINDING: stated indices, and Barcelona has its own

### 3.1 — Base PGM, Art. 357.2 / 357.3

> **Art. 357.2** — «A les zones de remodelació privada els índexs d'edificabilitat han de ser els
> següents: **a. Brut: 0,90 m² sostre/m² sòl. b. Net: 2,89 m² sostre/m² sòl. c. Complementari
> zonal: 0,30 m² sostre/m² sòl.**»
>
> **Art. 357.3** — «Als **Estudis de Detall** l'índex d'edificabilitat **referit a la superfície
> d'illa** ha de ser de **2 m² sostre/m² sòl**, i la superfície que s'ha de reservar per a espais
> lliures i dotacions del **30 per 100**.»

### 3.2 — ⚠ THE BARCELONA MODIFICATION SUPERSEDES 357.2 (PDF p. 152)

> **«Art. 357.2. Modificació de la distribució de l'edificabilitat corresponent als usos de la
> zona 14b** — En les zones de remodelació privada els índex d'edificabilitat han de ser els
> següents: **a. brut màxim: 1,08 m² sostre/m² sòl. b. net: 2,89 m² sostre/m² sòl.
> c. Complementari zonal: és la diferència entre l'índex màxim d'1,2 m² sostre/m² sòl i el
> coeficient d'edificabilitat brut contemplat.**»

| index | base PGM | **Barcelona** | granularity | outcome |
|---|---|---|---|---|
| brut (màxim) | 0,90 | **1,08** | **zone / sector** (gross) | **STATED — SUPERSEDED** |
| net | 2,89 | **2,89** (unchanged) | area within the zone | **STATED** |
| complementari zonal | 0,30 | **1,2 − brut** (⇒ 0,12 at brut 1,08) | zone | **CONSTRUCTED** |
| Estudi de Detall index | 2,00 over the **illa** | *(not modified)* | **block** | **STATED** |
| espais lliures + dotacions reserve (ED) | 30 % | *(not modified)* | block | STATED |

⚠ **THE 2,89 NET IS THE HEADLINE NUMBER AND IT IS NOT A PARCEL FAR.** It is the *net* index for
the remodelling zone under a PRI, alongside a *brut* ceiling over the whole sector — the two are
an allocation pair, not a per-plot entitlement. And the Disposició addicional requires **new
planning to be processed** before the modified figures apply at all. Publishing 2,89 on a parcel
card would over-state by roughly 3× against the brut ceiling.

### 3.3 — Art. 358.2 — the two stated parcel conditions

> «a. **Parcel·lació mínima: 600 m².** b. **Façana mínima a la via pública: 13,50 m.**»

STATED, parcel granularity, subject to Art. 358.3's override.

### 3.4 — Art. 356 (Barcelona-modified) — the standards

Base PGM Art. 356.2: vials locals **25,20 %** · estacionaments **5,40 %** · espais verds locals
**16,20 %** · dotacions comunitàries **11,70 %**.
Barcelona modification restates the same four percentages, **but conditions them**: they hold
*"mentre l'índex d'edificabilitat brut a què es refereix l'article 357.2 no superi 0,9 m² sostre/m²
sòl"*. Above 0,9 brut destined for housing, the PRI must additionally provide **18 m² of espais
verds locals + 13 m² of equipaments per 100 m² of housing floor area, and 5 m² of green space per
person**, and the extra dwellings must be under a protected-housing regime.

⚠ Note the internal tension worth flagging to a reviewer: the modification raises the brut cap to
**1,08** while conditioning the base standards on the brut **not exceeding 0,9**. Both sentences
are in the same instrument, on the same page. Read together they mean: above 0,9 brut you may go
to 1,08, but only with the additional reserves and only for protected housing. That reading is
**stated**, not inferred — the modification spells out the *"En cas d'incorporar un índex
d'edificabilitat brut superior a 0,9 … amb destinació per habitatge"* branch explicitly.

---

## 4 — Amendments

| instrument | what it changes | source |
|---|---|---|
| Barcelona modification of **Arts. 71.6, 356 and 357.2** | 14b's brut index **0,90 → 1,08**; complementari zonal redefined as *1,2 − brut*; Art. 356's standards conditioned on brut ≤ 0,9 with an additional-reserves branch above it; Art. 71.6 redefines which uses the complementari zonal may serve (**expressly excluding habitatge**, aparthotels, motels and long-stay residences) | PDF p. 152 (printed 151), reached via footnotes 57 (Art. 356) and 58 (Art. 357) |

**Disposició addicional** (same page): Art. 71.6 applies **automatically**; Arts. 356 and 357.2
require **new planning to be processed**. That conditionality is what keeps 14b a refusal even
though its numbers are now known.

⚠ The instrument's own approval details (date / DOGC) were **not captured** — the modification
block on PDF p. 152 is preceded by the Art. 225 *habitatge en planta baixa* modification of
13-01-1999 (DOGC 2819), and the boundary between the two blocks was not established with
confidence. **Recorded as unverified rather than guessed.**

---

## 5 — Open / unverified

- **The approving instrument and date of the Art. 356 / 357.2 Barcelona modification** (above).
- Whether the *"nou planejament"* the Disposició addicional requires has been processed for a
  given sector.
- Whether a *unitat de zona* is above or below the **12 000 m²** threshold of Art. 358.2.c — the
  fork that decides whether the height is neighbour-derived or ordering-type-derived.
- The neighbouring frontages' permitted heights, which Art. 358.2.c's construction needs.

---
*Verified 2026-07-31 against `../../PGM-NNUU-metropolitana.pdf` pp. 117–118 + 152.
Founder signature: **NOT GIVEN**. Authority: C63 · C58 · ADR-0270 · ADR-0271.
Method: `../EXTRACTION-PROTOCOL.md`.*
