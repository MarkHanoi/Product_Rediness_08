# Marseille / Aix-Marseille-Provence (`13055`) — Jurisdiction Pack

**Country:** `fr` · **Region:** Provence-Alpes-Côte d'Azur (`fr-pac`) · **INSEE:** `13055` ·
**Governing document:** PLUi Métropole Aix-Marseille-Provence — **Territoire 1 "Marseille-Provence"** (approved 19/12/2019). ⚠ This is NOT the same document as "Pays d'Aix" (separate Territoire, approved 5/12/2024) — a Marseille pack covers Territoire 1 only. ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete; no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → PLUi AMP Territoire 1 → règlement graphique (PRIMARY) → règlement écrit zone UA/UB/UC (FALLBACK if graphic layer is silent)`.
- **Rule KIND (ADR-0270 / C58 §2.2):** a **new engine kind** is required — "graphic-primacy precedence resolution": attempt graphic layer height first; fall back to written zone article only where the graphic layer is silent. This precedence is **stated in the règlement itself** — reversing it is a legal-accuracy bug, not a style choice.
- **Setback-governed vs alignment-governed:** Marseille's written zone articles describe implantation relative to roads and side limits (standard French three-article structure). Whether alignment or setback governs depends on zone and graphic layer — confirm per zone article after sourcing.
- **Legal-structure trap watch (P1):** two major traps:
  1. **AMP's own published GIS zoning layer is explicitly informational only — NOT legally opposable.** The binding version is the PDF/graphic plate, not the GIS layer. Do not treat the GPU-returned zone code as sufficient without confirming against the graphic plan for height.
  2. **Euroméditerranée (OIN)** is a state-led derogating zone inside Marseille with its own règlement. Any parcel inside the OIN boundary is governed by Euroméditerranée rules, not the PLUi. Treat as an explicit refusal until separately sourced (same playbook as Barcelona clau 18).

### The graphic-primacy rule (binding legal principle)

Stated in the PLUi Territoire 1 règlement, general provisions:

> *"le règlement graphique prime sur le règlement écrit des zones. Ainsi, à défaut d'indication sur le règlement graphique, c'est le règlement écrit des zones qui s'applique."*

Translation: **the graphic plan wins; the written article applies only where the graphic layer is silent.**

**Engine consequence:** any Marseille height figure sourced from the written zone articles (UA: ~R+4–6, UB: ~R+3–4, UC: ~R+1–2) is a **fallback only**, shippable only for parcels where the graphic layer is confirmed silent. Implementing the written article as the primary rule is a legal inversion. This is ADR-0275 territory.

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Graphic-primacy engine kind (ADR-0275)** | NOT STARTED | ADR ratified — graphic-first/written-fallback resolution logic |
| **Graphic layer machine-readability probe** | NOT STARTED — **the most important pre-implementation question** | Probe GPU WFS for AMP Territoire 1 for machine-readable graphic height attributes |
| **Zone UA rule pack (written fallback)** | NOT STARTED | ADR-0275 ratified; graphic layer confirmed machine-readable OR confirmed PDF-only |
| **Zone UB rule pack (written fallback)** | NOT STARTED | UA pack shipped |
| **Zone UC rule pack (written fallback)** | NOT STARTED | UA pack shipped |
| **Overlay: Euroméditerranée (OIN) refusal** | NOT STARTED — OIN boundaries must be excluded first | OIN boundary layer identified and integrated |
| **Overlay: SUP (flood, aviation)** | NOT STARTED | GPU SUP layer probe |
| **Overlay: ABF perimeters** | NOT STARTED | ABF sub-type in GPU SUP probe |

---

## 3 — Zone taxonomy

Marseille's PLUi Territoire 1 uses a simpler zone taxonomy than Paris or Lyon. The written règlement describes storey ranges (not height in metres) per zone:

| Zone | Character | Storey range (written article, descriptive) | Binding source? |
|---|---|---|---|
| **`UA`** | Dense historic urban fabric | ~R+4 to R+6 | Written article — **fallback only**; graphic layer is primary |
| **`UB`** | Mixed urban residential | ~R+3 to R+4 | Written article — fallback only |
| **`UC`** | Residential, lower density | ~R+1 to R+2 | Written article — fallback only |

⚠ **Storey ranges from the written article are descriptive only — NOT the binding figure.** Per the règlement's own precedence rule, the graphic plan overrides these for any parcel where the graphic plan speaks to height. The written article storey ranges may only be used where the graphic plan is confirmed silent. They are listed here to document the fallback, not as the rule.

**No numeric height value in this table has been read from a primary source.** The ranges above are from corroborated secondary research. They require primary-source verification before implementation.

---

## 4 — Granularity (C58 §1.11)

- **Graphic layer:** height is per-parcel or per-graphic-sector (the graphic plan speaks to specific buildings or zones). Granularity: graphic plan polygon.
- **Written zone articles:** height at the PLUi zone level (UA, UB, UC). Granularity: zone polygon.
- **Euroméditerranée:** height at the OIN instrument level — per-site in the OIN règlement.

State the granularity in every output: a zone-level height figure presented as a parcel figure is a C58 §1.11 category error.

---

## 5 — FAR

| Field | Value | Instrument |
|---|---|---|
| **COS (old FAR)** | `n/a — abolished nationwide (loi ALUR 2014)` | Loi n° 2014-366 |
| **Emprise au sol** | Described in written zone articles — values not yet read | PLUi Territoire 1 written règlement |

---

## 6 — Overlays

| Overlay | Source | Status | Risk |
|---|---|---|---|
| **Euroméditerranée (OIN)** | Établissement Public d'Aménagement Euroméditerranée (EPAEM) | NOT SOURCED — **explicit refusal at first pass** | **HIGH** — derogating zone; PLUi does not apply inside OIN |
| **Graphic plan (règlement graphique)** | PLUi AMP Territoire 1 graphic plates | **THE PRIMARY SOURCE** — machine-readability unknown | **CRITICAL** — if PDF-only, graphic-first resolution cannot be implemented as an API call |
| SUP flood / aviation | GPU SUP layer | NOT probed | LOW — structurally queryable |
| ABF perimeters (500 m around monuments) | GPU SUP layer | NOT probed | MEDIUM — Marseille has significant historic heritage |
| PSMV (Panier, le Vieux-Port historic sectors) | NOT visible in base GPU zone query | NOT probed | HIGH — separate instrument, same class as Paris's PSMV |

---

## 7 — Source hierarchy

| Data needed | Source | Confidence |
|---|---|---|
| Parcel geometry | IGN PCI Express / API Carto — same as Paris/Lyon | `corroborated` |
| Zone code → document | GPU API `apicarto.ign.fr/api/gpu` | `corroborated` |
| **Graphic plan (height per parcel)** | PLUi AMP Territoire 1 règlement graphique — machine-readability TBD | **NOT YET — critical probe** |
| Zone rules UA/UB/UC (written fallback) | PLUi Territoire 1 written règlement — obtained via GPU link | NOT YET |
| Euroméditerranée boundary | EPAEM — EPA boundary GIS layer | NOT YET |
| Context buildings + height | BD TOPO `data.geopf.fr/wfs` (national) | `corroborated` |

---

## 8 — Development estimate

| Scenario | Work item | Dev-days |
|---|---|---|
| **Best case** — graphic layer is GIS-accessible | ADR-0275 (graphic-primacy kind) | ~4–5 |
| | Source UA/UB/UC written articles verbatim | ~6 |
| | Implement graphic-first/written-fallback | ~8–10 |
| | Euroméditerranée refusal | ~4–6 |
| **Best case total** | | **~22–27 d** |
| **Worst case** — graphic layer is PDF plates only | +4–6 days digitizing scope | ~26–33 d |

---

## 9 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **Graphic layer machine-readability** (the single most important pre-implementation probe): is the PLUi Territoire 1 règlement graphique published as a machine-readable GIS layer (WFS/WMS on the AMP urbanisme portal) or only as scanned/vector PDF plates? This single check changes the estimate by 4–6 dev-days and determines whether the graphic-first resolution logic can be implemented as an API call.
- **Zone article numeric values (UA/UB/UC):** storey ranges stated in §3 above are descriptive secondary research. Read PLUi Territoire 1 written règlement articles UA.10/UB.10/UC.10 (or equivalent height articles) verbatim from the GPU-returned PDF before using any value.
- **Emprise au sol values per zone:** not yet read from the written articles.
- **Euroméditerranée OIN boundary GIS layer:** the OIN exists; its boundary as a machine-readable GIS layer has not been located. EPAEM (the operating agency) may publish it at `euromediterranee.fr` or through AMP's own geoportal.
- **Pays d'Aix PLUi:** explicitly out of scope — this is a separate PLUi document covering Territoire 4 of AMP, approved 5/12/2024. Do not confuse with Territoire 1.

---

**Related files:** `../../README.md` (country umbrella) · `../../NEXT.md` (blockers + resume) ·
`../../findings/FRANCE-MASTER-DATA-SOURCE-STUDY.md §B.3` (full Marseille analysis) ·
`sources/SOURCES.md` · `NEXT.md`
