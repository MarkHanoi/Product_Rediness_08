# L-676 — clau 12b: the RULE is stated, its DOMAIN is not — **GOVERNANCE**, and the LiDAR premise is withdrawn

**CLOSURE-REGISTER row 6 · CLOSED 2026-08-01 · bucket A→B → resolved **A (governance)** · was P2**

> **The register's own test:** *"If the municipality itself derives it from an official dataset ⇒
> **engineering**. If not ⇒ **governance**."*
>
> **Answer: GOVERNANCE.** And the deciding fact is not about data at all.

---

## 1 — Q1: THE PRIMARY TEXT (verified verbatim, in this repo)

Read from the committed `PGM-NNUU-metropolitana.pdf`, extracted and re-read directly — not
paraphrased from a secondary note.

### Art. 320.3a, subzona II — the height rule (printed p. 106)

> «A la subzona II, de conservació del centre històric, l'alçada en **un tram de vial** serà la
> **mitjana de les edificacions existents**, sense que entrin al còmput les façanes dels solars no
> edificats. El nombre màxim de plantes admès serà, un cop fet el còmput de l'alçada, el que resulti
> per defecte de suposar una alçada mínima de planta baixa de 4 m. i una alçada mínima, inclòs el
> forjat, de 3,05 m. per planta pis.»

**So the article DOES define most of it:**

| element | defined? |
|---|---|
| the statistic | **YES — *mitjana*, a MEAN.** Not the tallest neighbour, not the mode. |
| the population | **YES, and negatively too** — *les edificacions existents*, with *les façanes dels solars no edificats* **expressly excluded** from the count |
| storeys from the height | **YES** — derived *per defecte* at PB 4 m + 3,05 m per floor |
| how each existing building is measured | **YES, by inheritance** — the general Arts. 239.2 / 240 datum rules |
| ⛔ ***un tram de vial*** — the DOMAIN the mean is taken over | **NO.** No length. No rule for one side of the street or both. No corner rule. No block boundary. |

⭐ **The undefined term is the one that fixes the number.** Widen or narrow the *tram* and the mean
moves, without bound. Measuring the neighbours was never the hard part; deciding **which**
neighbours is, and the plan does not say.

### ⭐ Art. 320.2a, subzona II — the deciding evidence, ONE PARAGRAPH EARLIER (printed p. 105)

> «…la profunditat edificable serà, com a màxim, la de les edificacions contigües existents,
> **mentre es redacti la determinació en particular i en detall al pla especial**.»

For the **same subzona**, on the **neighbouring parameter**, built on the **same "match what is
already there" premise**, the plan states in terms that the *particular and detailed determination*
belongs to a ***pla especial***.

### Art. 316.3 — and it closes the loop (printed p. 105)

> «A la subzona II, de conservació del centre històric, **no s'admeten les ordenacions de volums que
> impliquin modificacions de l'ordenació existent o de les alçades usuals.**»

⇒ **The plan does not merely omit the *tram*. It has an instrument for supplying it, names that
instrument for the sibling parameter, and forbids any volumetric ordering that would depart from
existing/customary heights in the meantime.**

---

## 2 — Q2: IS THERE AN AUTHORITATIVE HEIGHT DATASET THE MUNICIPALITY USES FOR THIS RULE?

| source | found | note |
|---|---|---|
| **ICGC elevation models** | ⭐ **YES, height-capable** | MDS at **1 m** for Catalonia and **25 cm for the AMB**; MDT to 25–50 cm. Third LiDAR coverage flown **2021–2023**, published **Feb 2026**. Building height is **derivable as MDS − MDT**. Also a *Mapa isomètric d'edificacions* and LOD1 3D buildings. |
| a discrete, licence-stamped *"alçada dels edificis"* product | **NOT FOUND** | licences are mixed; the *3D Carrers* viewer is CC BY-NC-ND 4.0 |
| **Open Data BCN** building-height dataset | **NOT FOUND** | searched the `Edificis` tag: addresses (`taula-segimon`) and heritage photographs. ⚠ Searched, not catalogue-walked — *"not found"*, not *"does not exist"* |
| **municipal WMS `ALCADES` field** | exists, but **explicitly *"informatiu, no normatiu"*** — index only, never citable as authority (already recorded in `NEXT.md` §6) |
| **evidence the AJUNTAMENT uses any of these FOR THIS RULE** | ⛔ **NOT FOUND** | nothing in the *llicència d'obres* / *Informe d'Idoneïtat Tècnica* material references a LiDAR/MDS product as an input to an alçada determination |

**What Ciutat Vella actually has instead is INSTRUMENTS** — the *Pla especial de protecció del
patrimoni arquitectònic, històric i artístic … Districte de Ciutat Vella* (2000) and the
per-neighbourhood PERIs (Raval, Casc Antic, Barceloneta, Sector Oriental). **Exactly the *pla
especial* Art. 320.2a points at.**

---

## 3 — Q3: ANY INSTRUCTION OR APPEAL INTERPRETING THE PHRASE?

**NOT FOUND.** Looked at: **BCNROC** (which surfaced the Ciutat Vella patrimoni *normes
urbanístiques* 2000, `handle/11703/89288`, and the PERI del Sector Oriental, `handle/11703/98398`,
but no interpretive instruction), the Ajuntament's *llicències d'obra* pages, the CIDO/Diputació
planejament index, and the open web. No municipal *instrucció*, technical circular or appeal
decision defining *«tram de vial»* or *«edificacions existents»* for this rule was located.

---

## 4 — THE DECISION

**GOVERNANCE. Row 6 CLOSES as a permanent, cited refusal.**

> **A height dataset supplies HEIGHTS. It cannot supply a *TRAM*.**
>
> Wiring ICGC LiDAR and choosing a radius would be PRYZM **inventing the one term the plan
> withheld** — the domain of a legal average — and then publishing the result as a cited envelope.
> That is `mucZoningProxy.js`'s standing warning in a new costume (C58 §1.11), and the same error
> §CLAU-12-PREDICATE (L-674) refused for blocker 3: **a second, weaker classifier that could only
> ever ACT where it disagreed with the operative instrument.**

**⇒ `NEXT.md` §3.4 and §4.3 are WITHDRAWN as written.** They filed 12b as *"the ONE zone where
measuring neighbours is the legal method, not a proxy"* and said *"acquire a neighbour-height
source, wire it as an input … and it resolves."* **It does not resolve.** A height source is
**necessary but not sufficient**, and on its own it is **not even the binding constraint**. The
trip-wire 4.3 keeps its other job (the envelope sanity-check alarm), and loses this one.

### THE SIGN

**UNDER-STATES — and the alternative has NO defined sign, which is the stronger argument.**

- **Refusing** publishes no envelope for ~1.8 % of private buildable land ⇒ under-states. Bounded,
  visible, honest.
- **Constructing** a mean over a *tram* PRYZM chose could land **either side** of the true figure by
  an amount nobody can bound, because the error is the DOMAIN, not the measurement. That is not an
  over-statement risk or an under-statement risk — it is an **UNKNOWN-sign** risk, published under a
  legal citation. **A number with an unknown sign is worse than no number**, and materially worse
  than a bounded under-statement.

### What shipped (engineering, this pass)

`barcelona12bNeighbourMeanRefusal` in `esBarcelonaZoneClassification.ts` — a **legally-grounded
`derived-plan` refusal** in the `22@` mould, citing `BCN_12B_ORDINANCE_REF` (Arts. 320.3a · 320.2a ·
316.3 · 315.2 · 239.2/240), with the §DEC-1 leak rule applied: **no figure in the prose.**

⚠⚠ **Two shipped defects were fixed with it, and both were false statements about our own coverage
— the FIFTH and SIXTH occurrences of that pattern** (after `13b`, `22a`, `22@`, bare `20a`):

1. **`12b`'s coverage-gap copy gave SUBZONA I's argument.** It said the blocker is the SHAPE —
   *"the façade sits on the street line … a setback estimate would be the wrong SHAPE"*. That is
   clau `12`'s reasoning, **and clau 12 SHIPPED A PACK on 2026-07-22 on exactly it.** 12b's shape is
   identical and is not the blocker. **Branch DELETED, not out-ranked.**
2. **`BCN_ROADMAP_LINE` promised *"Next: 12b, whose rules are a survey of the existing
   neighbours."*** A promise PRYZM cannot keep, presenting a legal delegation as an engineering
   backlog item, read by the owner of land we will never compute. **Deleted.**

⚠ **Consequence worth recording: no ENUMERATED Barcelona clau is a coverage gap any more.**
`barcelonaNoRulePackRefusal` is now the fallback for a clau the MUC returns that no table
enumerates — which is what it should be. The tests were re-aimed at that subject rather than
allowed to become vacuous.

### Alternatives rejected

1. **Acquire ICGC LiDAR and compute the mean over a chosen radius.** Refused — see THE SIGN. The
   missing term is a delimitation, not a measurement.
2. **Ship a non-binding "indicative" band beside the refusal.** Deferred and constrained, not
   endorsed. It would carry the same fabricated *tram*; C58 §1.14 / L-459 are explicit that a
   derived value rendering like a surveyed one **is** the defect. If ever built it must be visibly
   distinct, non-binding, and **must not be called an envelope**.
3. **Leave it as a `no-rule-pack` coverage gap.** Refused — that is a statement about PRYZM's
   coverage, and it is FALSE: Art. 320.3a is read and encoded. It also gave the wrong blocker.
4. **Register `12b` against `ES_BARCELONA_NUCLI_ANTIC_PACK` (clau 12's pack).** Refused, and the
   `12`/`12b` disjoint-code-path invariant (§CLAU-12-PREDICATE) exists to make it impossible.
   Subzona I's 60 %-block depth and street-width height table are a different subzona's rules.

### ⚠ WHAT WOULD REOPEN THIS

A ***pla especial* or municipal instruction that DEFINES the *tram de vial*** for Ciutat Vella — a
length, a side rule, a corner rule. **That is a delimitation, not a dataset.** If one is found this
becomes engineering the same day, and the height source (which exists, at 25 cm for the AMB) is then
the second half of it. The Ciutat Vella patrimoni *pla especial* (2000) and the four PERIs are the
first places to look.

---

**Cross-refs:** `CLOSURE-REGISTER.md` row 6 · `claus/12b/CLAU.md` · `NEXT.md` §3.4 + §4.3
(**withdrawn as written**) · §CLAU-12-PREDICATE (L-674, blocker 3 — the same "do not encode a
predicate the plan does not state" argument) · §DEC-1 (blocker 5, the `22@` refusal this is modelled
on) · C58 §1.11 / §1.13.4 / §1.14 · L-459 · L-553.
