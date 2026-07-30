# Hamburg (`02000`) — Jurisdiction Pack

> **Dossier note (C63 naming, L-649/L-650).** This dossier's master scorecard face is now
> [`RATE.md`](./RATE.md) — the 7-axis composite completion rate (**research-only / NOT bake-covered** →
> all axes `not-assessed`, no scorecard computed). The legislation/data-fill rate was renamed
> `RATE.md` → [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) and now FEEDS it as Axis 2 (see
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md)).

**Country:** `de` · **Land:** Hamburg (city-state) · **ISO 3166-2:** `DE-HH` · **AGS:** `02000000` ·
**Pack id:** `de-02000-hamburg` ·
**Governing instrument:** Bebauungsplan (B-Plan) per BauGB §30 — fully digitised in XPlanung (1,900 plans + 900 pre-1960 plans); no modern §34 gap documented ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete; no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → B-Plan (Satzung) → BauNVO zone type → BauGB §30 / §34 / §35`.
- **Rule KIND (ADR-0270 / C58 §2.2):** for B-Plan parcels: `coverage-and-far` (GRZ/GFZ shaping the buildable area) plus height from B-Plan `hoeheMN`/`hoeheBezugspunkt` attribute. For §34 parcels: explicit `refusal` (no numeric kind applicable).
- **Setback-governed vs alignment-governed:** Hamburg B-Plans express setbacks as either fixed distances or height-proportional Abstandsflächen per Hamburgische Bauordnung (HBauO). Most residential B-Plans use fixed setback distances to street boundary + side/rear Abstandsflächen. Confirm per B-Plan before assuming either.
- **Legal-structure trap watch (P1):** Hamburg is a **city-state with full XPlanung coverage** — the cleanest German case. The single structural trap is the **900 pre-1960 plans** adopted under Hamburg's own older building law (not BauGB/BauNVO): their XPlanGML records may carry only the numeric value without preserving the original Hamburg-law citation needed for the signature gate. Treat pre-1960-derived figures as `corroborated` (not `published`) until citation preservation is confirmed.

### Why Hamburg first among German cities

Hamburg is the **cheapest, most defensible first German city**:
- **City-state:** one jurisdiction, one LBO (HBauO), one ALKIS regime, one XPlanung delivery. No Land/municipality routing complexity.
- **Full XPlanung coverage:** 1,900 BauGB B-Plans + 900 pre-1960 Hamburg-law plans; started 2011, complete 2018. The national XPlanung coordination office (XLeitstelle) is hosted inside Hamburg LGV.
- **No Baunutzungsplan legacy stratum:** unlike Berlin, there is no identified pre-BauNVO legacy plan using "Baustufen" grading.
- **No documented §34 gap:** Hamburg's fabric is continuously planned (all West German post-war fabric). §34 fraction assumed small but not yet measured — see §6.

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Regime classifier (§30/§34)** | NOT STARTED | Hamburg XPlanung B-Plan polygon probe passes |
| **Context data (LOD2)** | RESEARCH COMPLETE — endpoint leads identified, not live-probed | Live LoD2 probe → CityGML with height non-null |
| **Rule pack — B-Plan zones (§30 path)** | NOT STARTED | XPlanGML structured field (GRZ/GFZ/Höhe) confirmed non-null; ADR for German rule kinds ratified |
| **Rule pack — §34 refusal** | NOT STARTED | §34 refusal vocabulary from playbook §refusal-vocabulary |
| **Overlay: Erhaltungsverordnung** | NOT STARTED — Hamburg has conservation areas | Hamburg district authority layer probe |
| **Overlay: Denkmalschutz** | NOT STARTED | Hamburg Denkmalschutzgesetz layer probe |

Refusal vocabulary in use: `regime-undetermined` (parcel not yet classified) · `legal` (§34 — no numeric envelope by law) · `coverage-gap` (B-Plan exists but GRZ/GFZ/Höhe not in XPlanGML).

---

## 3 — Granularity (C58 §1.11)

GRZ (site coverage ratio) and GFZ (floor-area ratio) are set **per B-Plan zone designation** (Baufläche), which is a polygon within the B-Plan typically smaller than the whole plan boundary. Height (`hoeheMN` = maximum height above NHN; or `hoeheBezugspunkt` = reference datum + max height) is per B-Plan zone designation.

A B-Plan zone designation can cover one or many parcels. **Granularity: B-Plan zone designation, not parcel.** Never present a B-Plan zone's GFZ as if it were measured from the specific parcel's own boundaries.

Abstandsflächen (setbacks) are parcel-level calculations (function of the parcel's own boundaries and the adjacent buildings' heights).

---

## 4 — The number

**0% of clicks return a full, cited envelope (not started).** Denominator: any Hamburg parcel covered by a modern BauGB B-Plan with non-null GRZ/GFZ/Höhe in XPlanGML. This denominator is itself unknown until the live probe runs.

---

## 5 — Height mechanism

Hamburg B-Plans express maximum height in the XPlanGML record in one of two ways:

| Attribute | Meaning | Notes |
|---|---|---|
| `hoeheMN` | Maximum building height above NHN (Normalhöhennull — Hamburg datum) | Absolute height; requires knowing the terrain elevation to derive storeys |
| `hoeheBezugspunkt` + relative height | Reference datum + maximum height above that reference | Relative; the reference datum may be terrain, street, or another defined point |
| `GeschosseMax` | Maximum number of Vollgeschosse (full storeys) | Sometimes used instead of or alongside height in metres |

**Which attribute is used in Hamburg B-Plans: not yet probed.** Run the XPlanGML `GetFeature` probe (see `NEXT.md §1`) to identify which height attribute is populated in practice.

### Abstandsflächen (HBauO)

Hamburg's own LBO (Hamburgische Bauordnung, HBauO) governs setbacks. The Abstandsflächen in Hamburg are height-proportional with a minimum absolute distance. **Exact multiplier and minimum not yet read from the HBauO primary text** — this is a pre-pack sourcing task. Expected: approximately 0.4H from boundary, min 3 m (Hamburg has historically had the same standard multiplier as NRW). Confirm before authoring the `setback` component.

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **GRZ/GFZ/Höhe null-rate in Hamburg XPlanGML:** the largest open question. Hamburg is fully migrated (2018) but completeness of numeric attribute population is unknown. A significant fraction of Hamburg B-Plans may have GRZ/GFZ/Höhe only in the signed Satzung PDF, not in XPlanGML attributes. **Probe first.**
- **§34 fraction for Hamburg:** assumed small (continuously West German fabric, full XPlanung migration), but not measured. A grid-sample probe over the Hamburg bbox (method: same as Barcelona `probe-bcn-clau-distribution.mts`) would convert this assumption into a measurement.
- **Pre-1960 plan citation preservation:** the 900 Hamburg-law pre-1960 plans are confirmed as migrated into XPlanGML, but whether the legal citation (original Hamburg ordinance) is preserved in the XPlanGML `rechtsstand` or `texte` fields is not confirmed. If only the numeric value is present, the signature gate is not satisfied.
- **HBauO Abstandsflächen multiplier and minimum:** exact figure not yet read from Hamburg's primary LBO text. Read HBauO §6 before authoring any Hamburg pack.
- **Hamburg Erhaltungsverordnung zones:** Hamburg has Erhaltungsverordnung (conservation area) designations in various districts. Whether these are queryable as a GIS layer from the Hamburg LGV/Geoportal is unknown.

---

**Related files:** `../../README.md` (country umbrella) · `../../NEXT.md` (blockers + resume) ·
`../../findings/GERMANY-MASTER-DATA-SOURCE-STUDY.md §B.1` (full Hamburg analysis) ·
`sources/SOURCES.md` · `NEXT.md`
