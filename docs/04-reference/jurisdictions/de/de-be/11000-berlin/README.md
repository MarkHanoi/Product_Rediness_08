# Berlin (`11000`) — Jurisdiction Pack

**Country:** `de` · **Land:** Berlin (city-state) · **ISO 3166-2:** `DE-BE` · **AGS:** `11000000` ·
**Pack id:** `de-11000-berlin` ·
**Governing instrument:** Up to FOUR regimes per parcel — see §1. Regime classification is the first engineering task. ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete; no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → regime classifier → (a) B-Plan §30 → BauNVO / (b) Baunutzungsplan 1958/60 §173(3) BBauG → Baustufen / (c) §34 BauGB → refusal / (d) §35 BauGB → refusal`.
- **Rule KIND (ADR-0270 / C58 §2.2):** (a) B-Plan: `coverage-and-far` (GRZ/GFZ + Höhe from XPlanGML). (b) Baunutzungsplan: `coverage-and-far` with voidance-risk flag — or refusal if no translation table exists. (c/d) §34/§35: explicit `refusal` (no numeric kind applicable by law).
- **Setback-governed vs alignment-governed:** Berlin B-Plans follow BauO Bln (Berliner Bauordnung) Abstandsflächen. The BauO Bln multiplier and minimum must be read before authoring any Berlin pack.
- **Legal-structure trap watch (P1):** Berlin has **four** legal strata on neighbouring parcels, two of which produce no numeric rules at all (§34, §35) and one of which (Baunutzungsplan) carries a **judicially established voidance risk**. The 62.8%-style trap here is assuming that "XPlanung exists for Berlin → all Berlin parcels have structured numeric rules." Large parts of former East Berlin are under §34; West Berlin districts have both modern B-Plans AND residual Baunutzungsplan coverage; the two can sit next to each other.

### The four regimes (must be resolved per parcel before anything else)

| Regime | Basis | Source layer | Numeric rules? |
|---|---|---|---|
| **(a) Modern B-Plan** | BauGB §30 | Berlin FIS-Broker — XPlanung B-Plan polygons | YES — GRZ, GFZ, Höhe in XPlanGML |
| **(b) Baunutzungsplan 1958/60** | §173(3) BBauG | Berlin FIS-Broker — separate legacy digitised layer | PARTIAL — Baustufen grading, not BauNVO letters; **judicial voidance risk** |
| **(c) §34 unplanned interior** | BauGB §34 | Absence of any plan polygon covering the parcel | NO — "Einfügen"; case-by-case; no numeric table |
| **(d) §35 outlying area** | BauGB §35 | BauGB §35 boundary determination | NO — presumptively not buildable |

⚠ **§34 in Berlin is NOT a data gap.** Berlin parliamentary record explicitly documents §34 as covering large parts of former East Berlin districts where no legally-effective pre-1990 plan was carried over and no modern B-Plan has been adopted. The correct PRYZM output for these parcels is: *"This parcel lies in an unplanned interior area (§34 BauGB). No numeric building envelope is defined — buildability is assessed case-by-case."*

### Why Berlin is last among the three German cities

Berlin is ~3× more expensive than Hamburg (~30–35 dev-days vs ~10–12) specifically because:
1. The regime classifier must be built before any numeric work — it is not a byproduct of an API call.
2. The Baunutzungsplan layer uses pre-BauNVO "Baustufen" grading requiring a separate translation table to convert to GRZ/GFZ-equivalent values — and that table does not exist in XPlanGML.
3. §34 prevalence is documented as large (East Berlin districts); no measurement yet.
4. The OVG 2020 ruling means any Baunutzungsplan-derived figure requires a case-law voidance check before being treated as current.

**Build Hamburg first. Build the regime classifier (reusable) for Munich next. Then apply Berlin.**

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Regime classifier (4-way: §30 / Baunutzungsplan / §34 / §35)** | NOT STARTED — first engineering task | Berlin FIS-Broker B-Plan + Baunutzungsplan layer probe passes |
| **Baunutzungsplan layer probe** | NOT STARTED — layer confirmed in FIS-Broker; queried for field names not yet | Live FIS-Broker `GetFeature` for a West Berlin parcel |
| **Baustufen → GRZ/GFZ translation table** | NOT STARTED — table does not exist in XPlanGML; needs historical sourcing | Berlin Senate archive — original 1958/60 Baunutzungsplan legend/key |
| **Rule pack — B-Plan zones §30 (regime a)** | NOT STARTED | Regime classifier built; XPlanGML attributes confirmed non-null |
| **Rule pack — Baunutzungsplan (regime b)** | NOT STARTED | Baustufen table sourced; voidance risk protocol established |
| **Rule pack — §34/§35 refusal (regimes c/d)** | NOT STARTED | §34 refusal vocabulary in place |
| **Overlay: Erhaltungsverordnung** | NOT STARTED — Berlin has multiple Erhaltungsverordnung zones (e.g. Luisenstadt) | Berlin district authority GIS probe |
| **Overlay: Denkmalschutz** | NOT STARTED | Berlin Landesdenkmalamt layer probe |
| **Context data (LOD2)** | RESEARCH COMPLETE — Berlin FIS-Broker confirmed as open for LoD2 | Live FIS-Broker LOD2 probe → CityGML with height non-null |

Refusal vocabulary in use: `regime-undetermined` (classifier not yet run) · `legal` (§34 or §35 — no numeric rule by law) · `legal-voidance-risk` (Baunutzungsplan figure, functionslos risk) · `coverage-gap`.

---

## 3 — Granularity (C58 §1.11)

- **B-Plan regime (a):** GRZ/GFZ/Höhe at the **B-Plan zone designation** level, same as Hamburg/Munich.
- **Baunutzungsplan regime (b):** Baustufen at the **plan district** level — typically larger than a B-Plan zone designation.
- **§34 regime (c):** no numeric rule; granularity question does not apply.

---

## 4 — The number

**0% of clicks return a full, cited envelope (not started).** Denominator: Berlin parcels under regime (a) with non-null GRZ/GFZ/Höhe in XPlanGML. This denominator is unknown until the regime classifier is built and the §34 fraction is measured.

---

## 5 — The Baunutzungsplan — special handling required

### What it is

The Baunutzungsplan 1958/60 is the preparatory land-use plan for pre-1990 West Berlin, binding per §173(3) of the old Bundesbaugesetz (BBauG). It uses "Baustufen" (building grade) designations — a pre-BauNVO grading system — not the modern BauNVO zone type letters (`WA`, `MI` etc.).

### Voidance risk

OVG Berlin-Brandenburg (15 Sep 2020, Az. 2 B 10.17) established that Baunutzungsplan figures can be struck down as **funktionslos** (legally void) when the actual development of an area has diverged so far from the plan's intentions that the plan can no longer realistically be realized. In the Neukölln case, a GFZ of 1.5 was voided. There is no database of "already voided" Baunutzungsplan figures — a case-law search is required per area.

### Correct handling in PRYZM

Any figure derived from the Baunutzungsplan must:
1. Be labelled as `corroborated, subject to functional-voidance risk` — never `published`.
2. Carry a product-visible caveat: *"Derived from the 1958/60 Baunutzungsplan (West Berlin); may be superseded by subsequent case law. Consult a local planning authority."*
3. Not be used in any calculation without first checking whether the OVG has voided the relevant area's figures.

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **§34 fraction for East Berlin:** documented as large in the Berlin parliamentary record, but not quantified as a percentage. A grid-sample probe over the former East Berlin districts would provide the denominator.
- **Baustufen → GRZ/GFZ translation table:** the original 1958/60 Baunutzungsplan legend/key maps Baustufen grades to density figures. This document is likely held only in the Berlin Senate's Stadtentwicklungsamt archive. Finding and digitising it is a dedicated research task before any Baunutzungsplan-derived value can be used.
- **Current Baunutzungsplan voidance map:** no comprehensive map exists of which Baunutzungsplan figures have been judicially struck down. Manual case-law research per target area is required. Consider treating Baunutzungsplan-derived figures as `regime-undetermined` until voidance status is confirmed.
- **Erhaltungsverordnung layer machine-readability:** Berlin's conservation-area designations are administered per district authority. Whether a unified, queryable GIS layer exists covering all Berlin Erhaltungsverordnung zones is unknown.
- **§35 parcels in Berlin:** §35 covers outlying areas; in a dense city-state like Berlin, §35 parcels are likely rare (Grunewald fringe, airport-area edges). Not measured.

---

**Related files:** `../../README.md` (country umbrella) · `../../NEXT.md` (blockers + resume) ·
`../../findings/GERMANY-MASTER-DATA-SOURCE-STUDY.md §B.3` (full Berlin analysis) ·
`sources/SOURCES.md` · `NEXT.md`
