# COMUNITAT VALENCIANA — THE GRAMMAR HYPOTHESIS

**Status**: **SECOND AFTER CATALUNYA.** Three measurements pending (M1–M3). ⚠ **Blockers are CHEAPER
than previously recorded.**
**Related**: [REGIONAL-INTAKE-LIST](../../../standards/REGIONAL-INTAKE-LIST.md) ·
[ADR-0293](../../../../02-decisions/adrs/ADR-0293-envelope-tier-is-per-dimension-and-keyed-on-error-direction.md) ·
[ARAGON-BUILDABILITY-RESEARCH](../es-ar/ARAGON-BUILDABILITY-RESEARCH.md) ·
[ES-LEGAL-COUNSEL-QUESTIONS Q4](../ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02.md)

---

## 0 · ⭐ THE REFRAME — and PRYZM already implements it

> ⛔ **THE SCALING UNIT IS THE ORDINANCE GRAMMAR, NOT THE MUNICIPALITY.**

The question stops being *"how many municipalities?"* and becomes *"how many planning grammars?"* —
**a much smaller and much more measurable problem.**

```
Parcel → regional planning polygon → GRAMMAR → parameter table → envelope
   (not: Parcel → municipality → custom adapter → envelope)
```

✅ **Already true in code, not aspirational:** `requiresBlockRing` tests **the zone's own rule**, not a
*clau* literal; `registry.ts` states that *"a new parcel-only pack for any city flows through here
unchanged"*; and `esBarcelona20aAillada` is `kind: 'setback'` and **already routes away from the block
construction** (§L-591).

⇒ ⭐ **THE DEPTH BLOCKER IS ONE BRANCH, NOT A WALL.** Setback, industrial, facilities and rural
grammars **never touch buildable depth. Only closed-block does.**

### ⛔ THE TEST THE HYPOTHESIS MUST SURVIVE

**Barcelona's clau `13a` and `13b` share Art. 242's depth construction and take DIFFERENT height
tables — Art. 327 vs Art. 328. Same grammar, different articles.**

> ⚠ **If that recurs in València, a family is NOT one rule plus a parameter table.**
> **Report `same-geometry-different-VALUES` separately from `same-geometry-different-ARTICLE`.**
> The first is a parameter table. **The second is a different rule wearing the same shape.**

### The readiness ladder — report in these terms, per grammar

| | Meaning |
|---|---|
| **ER-1** | geometry only |
| **ER-2** | grammar identified |
| **ER-3** | parameters available → **indicative** |
| **ER-4** | constraints applied → **publishable** |

⛔ **EVERY REGION — INCLUDING THE PUBLISHED ONE — IS ER-1 ON CONSTRAINTS. ER-3 IS THE CURRENT CEILING
EVERYWHERE.**

---

## 1 · MEASURED — do not re-derive

- Registered: `VALENCIA_BBOX`, `extentResolution: 'municipal'`, `registry.ts`
- **Determination 36.4 % by area / 38.2 % by parcel · ENVELOPE 0 %**
- Ordinance codes confirmed in `Zonificacion zon_suelo`
- Endpoint `terramapas.icv.gva.es/0702_Planeamiento`, **WFS 1.1.0**
- ⭐ **THE CORPUS'S REFERENCE FALSE-NEGATIVE:** **0 features on `lon,lat`; 2 on `lat,lon`** with an
  explicit CRS token. **This service is the known case — cite it whenever a zero-feature result is
  claimed as absence.**
- **17 ArcGIS folders return `499 Token Required`**, including `Patrimonio_Historico` and `Vivienda`

⚠ **DEPTH — record in this form, not stronger:** *no regional dataset containing buildable depth was
identified across 696 swept layers.* ⛔ **That is a SURVEY RESULT, NOT PROOF OF ABSENCE.** The earlier
phrasing *"absent across 696 layers"* **overstated it.**

⚠ **`operacionbaja` at 91 % non-null is NOT IN THE REPO — it exists only in prose.** ⛔ **Verify before
quoting; if unverifiable, mark UNKNOWN.**

## 2 · READ — none of it fetched

- ⭐ A **published DATA MODEL PDF** for `0702_Planeamiento` in the GVA open-data catalogue. **Unusual
  in Spain**, and it may answer three questions **without correspondence.**
- Official documentation: **Classification and Zoning are ONE COVERAGE distinguished by FIELD** — not
  a join across datasets.
- Derived from planning approved by the **Territorial Planning Commissions under Decreto 74/2016** —
  ⭐ **an official harmonisation of APPROVED municipal planning, not a crowd-sourced viewer.**
- **Inventario de Suelo Urbano y Urbanizable** — **4,000+ sectors** with principal use and management
  status. **Candidate for the INSTRUMENT-SELECTOR role (intake item 2). Not in our corpus.**
- INSPIRE provenance fields may exist: `legalDocument`, `beginLifeSpan`, `endLifeSpan`. ⭐ **If
  populated, `endLifeSpan` may be what `operacionbaja` does.**

⚠ Metadata states **«carácter informativo»** — legally valid planning must come from the approved
instruments. ⛔ **FIFTH REGION WITH THIS DISCLAIMER** (Madrid ×2, CyL, Balears, Aragón, now València).
**ONE COUNSEL QUESTION, NOT FIVE.**

⚠ **Percentages in the external material are ILLUSTRATIVE, NOT MEASURED. 41 % / 67 % / 29 % appear in
NO measurement. They must not enter the registry.**

## 3 · UNKNOWN — must not be assumed

Number of planning grammars · recurring zoning families · **parcel share by grammar** · whether
buildable depth exists regionally · whether all municipalities share one ontology · **whether the GIS
carries legal PARAMETERS or only IDENTIFIERS.**

---

## 4 · The three measurements — hours, and **none needs an email**

**M1 · ONTOLOGY — one schema, or 542?** ⭐ **The highest-value single query.**
Attribute names, types and domains across **~50 municipalities, seeded and stratified by population
band.** *Identical names* → Decreto 74/2016 harmonisation is real, one schema. *Municipality-specific
attributes* → it is not.

**M2 · GRAMMAR DISTRIBUTION.**
Distinct `zon_suelo` with **PARCEL-WEIGHTED frequency**, then **cluster through `requiresBlockRing` —
not by counting codes.** `ENS-1..4` is **one grammar in four codes**; `R1/R2/R3` **may be three
unrelated ones.** Output: share by **SETBACK / BLOCK / INDUSTRIAL / OTHER**, and ⭐ **what proportion
actually requires depth.**

**M3 · THE DATA MODEL PDF**, against three questions: **`altura` — storeys or metres, and does the −1
convention apply** · **`operacionbaja` semantics** · ⭐ **does buildable depth appear as a field
anywhere in the model.**

## 5 · External — founder-owned

⛔ **HERITAGE CREDENTIALS.** 17 folders at `499`, including `Patrimonio_Historico`. ⭐ **Heritage only
REDUCES, so NO València envelope publishes without them regardless of M1–M3.** The request is the
founder's to send.

---

## Method — non-negotiable

⛔ **Zero-feature is NOT absence:** both axis orders **AND** both CRS families — **this service is the
known case.** · **Municipality ATTRIBUTE filter, never bbox.** · ⛔ **Populated is not present** —
validate for internal contradiction before quoting a rate *(Aragón: `0` was the null substitute,
proven by `shape_area > 0` with `perimeter == 0`)*. · **Any count landing on 1000/2000/3000 is a
truncation suspect.** · **Known-answer control in every run.** · ⛔ **UNKNOWN never NO.** · **State what
you could not distinguish rather than choosing.**

## The verdict format

⛔ **PER GRAMMAR, in the ladder's terms — never a single València number.**

> ✅ *"Setback grammar reaches **ER-3** on X % of parcels; closed-block is **ER-2** pending depth."*
> ❌ *"València is 0 %."*

⭐ **Target metric: PARCEL COVERAGE BY GRAMMAR — not municipalities supported.** If the hypothesis
holds, **it changes the roadmap for every remaining autonomous community**: Catalunya proves the
engine, **València proves the architecture scales.**
