# Rome (`058091`) — Jurisdiction Pack

**Country:** `it` · **Region:** Lazio · **ISO 3166-2:** `IT-62` · **ISTAT:** `058091` ·
**Pack id:** `it-058091-rome` ·
**Governing instrument:** PRG (Piano Regolatore Generale), Roma Capitale, adopted 2008, still current. Zone mechanism: tessuto fabric typology — NOT DM 1444 zone letters. See §1. ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete; no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → PRG sistema classification → tessuto type → (a) Città Storica NTA article per tessuto OR (b) Città Consolidata T1/T2/T3 typology + Carta per la Qualità OR (c) Città da Ristrutturare/Trasformazione → indirect intervention required`.
- **Rule KIND (ADR-0270 / C58 §2.2):** **New engine kind required** — Rome's PRG classifies land by historic-fabric typology (`tessuto`), not by DM 1444 zone letters. Two structural sub-kinds: (a) direct intervention (numeric envelope readable from PRG); (b) indirect intervention (no numeric envelope until a further executive plan is adopted — the structural analogue of Germany's §34/§35 refusal and Spain's volumetria-específica refusal). The direct/indirect classification step MUST run before any numeric sourcing.
- **Setback-governed vs alignment-governed:** governed by PRG NTA per tessuto type — neither multiplier nor specific articles have been read in this pass.
- **Legal-structure trap watch (P1):** the Carta per la Qualità precedence question is the deepest trap. Recent PRG amendments have been criticized for establishing that in conflicts between the Carta's cataloguing indications and the tessuto-type norms, **tessuto rules prevail** — meaning the heritage-typology overlay can be subordinated to the operative zoning rule. The direction of this precedence is the opposite of Marseille's graphic-primacy rule (where the overlay wins), and must be confirmed against the current consolidated NTA text before any rule is cited.

### The four città/sistemi of Rome's PRG

| Sistema | Sub-type | Mechanism | Direct or indirect intervention? | Numeric rules from PRG? |
|---|---|---|---|---|
| **Città Storica** | Per-tessuto at 1:5,000 | Point-by-point transformation rules set in PRG NTA per tessuto | Direct (outside "ambiti di valorizzazione") | YES — but per-tessuto, not per-zone-letter |
| **Città Consolidata** | T1 / T2 / T3 (fabric-density typology) | Fabric type + Carta per la Qualità | Direct (ordinary regime in Consolidata generally) | YES (T1/T2/T3 typology-keyed rules) — precedence question (tessuto vs Carta) |
| **Città da Ristrutturare** | — | Urban-recovery programme areas; ex-abusive settlement recovery | **Indirect** — programme/executive plan required first | NO — refusal until executive plan exists |
| **Città della Trasformazione** | — | Transformation areas | **Indirect** — urban-planning instrument required first | NO — refusal until plan exists |

### Direct vs indirect intervention split (Rome's §34/§35 analogue)

This is Rome's most important structural parallel to Germany's B-Plan/§34 split:

- **Direct intervention (intervento diretto):** building or renovation can proceed based on the PRG rules alone. This is the ordinary regime in the Città Storica (outside "ambiti di valorizzazione") and in the Città Consolidata generally.
- **Indirect intervention (intervento indiretto):** a further executive urban-planning instrument must be approved first. This is the ordinary regime in valorizzazione ambiti, urban-recovery-programme areas, ex-abusive settlement recovery areas, and the entire Città della Trasformazione.
- **The classification question:** whether a numeric envelope can be read directly off the PRG, or whether a second not-yet-existing plan must first be approved, is a parcel-by-parcel classification step — as fundamental as the regime classifier in Germany, and must be built before any numeric sourcing.

### The Carta per la Qualità precedence question

The Carta per la Qualità is a heritage/typology cataloguing overlay applied to Città Consolidata, Città da Ristrutturare, and Città della Trasformazione fabric — cataloguing every archaeological, monumental, protected and unprotected element visible in the contemporary fabric. Recent PRG amendments have been criticized for:
- Downgrading the Carta's force relative to tessuto-type norms
- Establishing that in case of conflict between the Carta's indications and the tessuto rules, **tessuto rules prevail**

This is a live precedence-rule risk requiring confirmation against the current consolidated NTA text. The direction of precedence (tessuto wins over Carta) must be verified — it is the opposite of Marseille's graphic-primacy finding (where the graphic/overlay layer wins).

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Direct/indirect intervention classifier** | NOT STARTED — prerequisite for all numeric work | PRG sistema/tessuto layer confirmed as WFS-queryable per parcel; NTA articles read |
| **Città Storica tessuto engine kind** | NOT STARTED | Direct/indirect classifier built; Città Storica NTA per-tessuto articles read |
| **Città Consolidata T1/T2/T3 typology kind** | NOT STARTED | Same prerequisite; Carta per la Qualità precedence confirmed against consolidated NTA |
| **Città da Ristrutturare / Trasformazione refusal** | NOT STARTED | Refusal vocabulary agreed (same as Barcelona volumetria-específica and Germany §34) |
| **Overlay: SITAP / Vincoli in Rete** | NOT STARTED | `sitap.beniculturali.it` probe |
| **Overlay: Carta per la Qualità** | NOT STARTED — machine-readability as GIS layer unknown | Roma Capitale SIT or geoportal probe |
| **Context data (building height)** | NOT STARTED — Lazio building-height layer unconfirmed | Check `dati.lazio.it` or `geoportale.regione.lazio.it` |

Refusal vocabulary in use: `regime-undetermined` (direct/indirect not yet classified) · `legal` (indirect intervention — no numeric envelope until executive plan) · `coverage-gap`.

---

## 3 — Granularity (C58 §1.11)

- **Città Storica:** tessuto-level granularity at 1:5,000 — individual fabric sub-zones with distinct NTA articles. Granularity is finer than a typical zone-letter system.
- **Città Consolidata T1/T2/T3:** typology-level (T1, T2, T3) — each typology has its own NTA article; granularity is at the typology × tessuto level.
- **Città da Ristrutturare / Trasformazione:** no numeric rule; refusal at the sistema level (the classification itself is the answer).
- **Carta per la Qualità:** overlay at the individual-element level (each catalogued building or element has its own entry) — not an aggregated zone-level rule.

---

## 4 — The number

**0% of clicks return a full, cited envelope (not started).** Denominator: Rome parcels in the Città Storica or Città Consolidata under direct intervention, with PRG tessuto type confirmed and applicable NTA article read. Both numerator and denominator are unknown — the direct/indirect classifier must be built and the tessuto engine kind must be implemented before either can be measured.

---

## 5 — Why Rome is the most legally complex of the three Italian cities studied

1. **The direct/indirect intervention split is a classification problem**, not a data-access problem — it requires reading the PRG sistema/tessuto classification for each parcel and then checking whether that parcel's sub-classification triggers the indirect-intervention regime. This is a structural prerequisite, the same role as Germany's regime classifier.
2. **The Carta per la Qualità precedence question is a live legal risk** — the NTA has been amended since 2008 and the amendments are contested. Any rule built on a pre-amendment NTA reading may be wrong in a legally material direction.
3. **Tessuto typology is the primary mechanism** for most of the city's residential land — it is not an exception applied to historic buildings, it is the operative rule for the Città Consolidata (which covers the vast majority of Rome's built fabric). This is structurally closer to a historic-fabric survey than to a numeric zone table, making it unlike any other mechanism studied.
4. **The Città da Ristrutturare and Città della Trasformazione** are explicitly indirect-intervention by default — these are correctly handled as reasoned refusals until site-specific executive plans exist, the same posture as Barcelona's clau 18/volumetria-específica cases.

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **Roma Capitale PRG WFS / SIT queryability:** whether Rome's PRG sistema/tessuto classification is exposed as a WFS (returning the tessuto type for a given parcel coordinate) or only as PDF maps and a web viewer needs direct probe of Roma Capitale's SIT (`sit.comune.roma.it` or `map.uniapp.it`).
- **Carta per la Qualità as machine-readable GIS:** the Carta is described as "cataloguing every archaeological, monumental, protected and unprotected element." Whether it is exposed as a machine-readable GIS layer (with element identifiers and applicable rules) or only as a web viewer needs direct probe.
- **Current PRG NTA consolidated text:** the PRG was adopted in 2008 and has been amended since. Whether the NTA text on Roma Capitale's official portal is the current consolidated version (including the contested amendments downgrading the Carta per la Qualità) must be confirmed before any rule is cited.
- **Direct/indirect fraction for Rome:** the fraction of Rome parcels falling in each of the four sistemi (Città Storica, Consolidata, da Ristrutturare, della Trasformazione) has not been measured. This matters for scoping the denominator — if the Città da Ristrutturare/Trasformazione together cover a large fraction of parcels, the correct-refusal rate is high even before any numeric engine is built.
- **Lazio building-height GIS layer:** no Lazio-wide building-height layer equivalent to ARPA Piemonte's Edifici 3D has been identified. Rome's own SIT may carry building data; unknown.
- **PRG amendment date and contested status:** which specific amendments have been adopted, whether any are judicially challenged, and which version of the NTA is currently operative are all unresolved and must be confirmed by reading the Roma Capitale official urbanistica portal before any NTA article is cited.

---

**Related files:** `../../README.md` (country umbrella) · `../../findings/ITALY-MASTER-DATA-SOURCE-STUDY.md §B.2` (full Rome analysis) · `sources/SOURCES.md` · `NEXT.md` · `RATE.md`
