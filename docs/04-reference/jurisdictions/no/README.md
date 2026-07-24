# Norway (`no`) — Jurisdiction Overview

**Level:** country · **ISO 3166-1:** `NO` · **Join key:** kommunenummer (4-digit municipality code, leading zero) · **Subdivision law:** fylker (ISO 3166-2, `no-<subdiv>`), then kommuner · **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — implementation pipeline ready

> **This file is the country-level umbrella.** Municipality-level packs live under
> `no/<fylke-iso>/<kommunenummer>-<slug>/`. The national legal structure and national data sources are
> fully characterised; no rule pack is implemented yet.

---

## 1 — What governs here (national structure)

### 1.1 Legal hierarchy

```
Grunnloven (Constitution) → national planning law
  → Plan- og bygningsloven (pbl., LOV-2008-06-27-71) — the single national planning statute
    → Kommuneplan arealdel — municipal overview zoning plan (pbl. kap. 11)
    → Kommunedelplan — detailed sectoral municipal plan (pbl. § 11-28)
    → Reguleringsplan (kap. 12) — binding parcel-level plan:
        • Områderegulering (§12-2) — area regulation (kommunal/developer-initiated)
        • Detaljregulering (§12-3) — detailed regulation (binding building-level rules)
    → pbl. § 29-4 — national numeric DEFAULT where no adopted plan governs:
        gesimshøyde > 8 m or mønehøyde > 9 m requires an adopted plan;
        absent plan: setback = max(½ height, 4 m) from neighbour boundary
      (Rundskriv H-8/15 — interpretive circular)
  → TEK17 (Byggteknisk forskrift, FOR-2017-06-19-840) — national building technical code
    → TEK17 §§5-1–5-7 — grad av utnytting (site-utilisation metric definitions)
  → H-2300 B (veileder) — Grad av utnytting: Beregnings- og måleregler (calculation manual)
  → SOSI Plan (Nasjonal produktspesifikasjon for arealplan og digitalt planregister)
    → Forskrift 26.06.2009 nr. 861 — MANDATORY for all kommuner since 2009
    → Defines: plan-type codes, arealformål codes, hensynssone codes (H570 etc.),
      planstatus/supersession codes — NATIONAL, identical across all 357 kommuner
  → Matrikkellova (LOV-2005-06-17-101) — cadastral law; one national register
  → Kulturminnelova — heritage protection (one national register: Askeladden)
```

**Norway's central structural advantage over Germany and France:** the issue is not "which mechanism" (SOSI Plan's zone taxonomy, density method, and hensynssone codes are genuinely national and legally mandated since 2009) — it is **which kommuner have published their planregister as a live WFS versus only a viewer or PDF**. This is a coverage-measurement problem, not a legal-regime problem.

### 1.2 The two regimes (simpler than Germany's four-way split)

| Regime | Basis | Governs | Numeric rules? |
|---|---|---|---|
| **(a) Plan-governed** | pbl. kap. 11/12 — adopted kommuneplan/reguleringsplan bestemmelser | Parcel inside a formally adopted plan boundary with specific bestemmelser | PARTIAL — zone code (arealformål/hensynssone) is structured; the actual numeric value (%-BYA, BRA, mønehøyde) lives in prose reguleringsbestemmelser text/PDF for nearly all plans sampled |
| **(b) pbl. § 29-4 default** | pbl. § 29-4 + Rundskriv H-8/15 | Parcels not governed by an adopted plan setting its own height/setback | YES — actual numeric ceiling: gesimshøyde 8 m / mønehøyde 9 m; setback max(½ height, 4 m). Genuinely shippable as a `published` fallback pack, unlike Germany's §34 which returns zero numeric content |

⚠ **The plan-governed regime is the majority of urban parcels**, and its numeric values (%-BYA, height) are in reguleringsbestemmelser prose text — not in structured WFS attributes for any probed city. The structured portion (zone code, plan boundary, planstatus) is nationally standardised; the numeric value is not yet digitised into structured fields.

### 1.3 SOSI Plan national code lists (one-time lookup tables — Norway's key structural advantage)

#### Arealformål (land-use purpose codes, national, applies across all kommuner)

| Code | Meaning |
|---|---|
| `1110` | Boligbebyggelse (residential) |
| `1120` | Frittliggende småhusbebyggelse |
| `1130` | Konsentrert småhusbebyggelse |
| `1140` | Blokkbebyggelse |
| `1310` | Næringsbebyggelse (commercial/office) |
| `1320` | Industribebyggelse |
| `2010` | Sentrumsformål (mixed-use centre) |
| `5100` | Landbruks-, natur- og friluftsformål (LNF) |
| `6400` | Parkering |

Full code list: SOSI Plan, Nasjonal produktspesifikasjon, published via Geonorge.

#### Hensynssone codes (national overlay codes, pbl. § 11-8 tredje ledd)

| Code | Meaning |
|---|---|
| `H110` | Sikringssone — råstoffutvinning |
| `H210` | Faresone — høyspentanlegg |
| `H310` | Sone med særlige krav til infrastruktur |
| `H410` | Sone med særlige hensyn til landbruk |
| `H510` | Sone med særlige hensyn til friluftsliv |
| `H550` | Sone med særlige hensyn til naturmiljø |
| `H570` | **Bevaring av kulturmiljø (heritage conservation)** — the key overlay |
| `H710` | Sone for bånd- og sikringssone |

These codes are national and mean the same thing in every kommune — a one-time lookup table, not a per-plan research task.

#### Planstatus codes (machine-resolvable plan supersession)

| Code | Meaning |
|---|---|
| `1` | Planforslag (proposed) |
| `2` | Vedtatt plan (adopted) |
| `3` | Opphevet plan (revoked) |
| `4` | Utgått plan (expired) |

`overstyrer`/`overstyres av` and `erstatter`/`blir erstattet av` relationships are structured in the SOSI Plan schema — plan supersession is machine-resolvable without reading a PDF.

### 1.4 Grad av utnytting — method menu (national; values are per-plan)

All five calculation methods are nationally defined in TEK17 §§5-1–5-7 and H-2300 B:

| Method | TEK17 article | What it measures | Most used for |
|---|---|---|---|
| **BYA** (bebygd areal) | §5-2 | Absolute building footprint area, m² | All types |
| **%-BYA** | §5-3 | Footprint as % of net tomt (parcel) area | Småhus / rekkehus |
| **BRA** (bruksareal) | §5-4 | Total usable floor area, all storeys summed | Apartment / commercial |
| **%-BRA** | §5-5 | BRA as % of tomt area; **mandatory for kjøpesentre/forretninger** | Larger projects |
| **MUA** (minste uteoppholdsareal) | §5-6 | Minimum outdoor amenity area | Residential |

⚠ **Historic calculation-method switching:** Oslo explicitly states that the grad av utnytting must be computed using the rules in force when the governing plan was adopted (pre-/post-1 July 1987 is one named break point). H-2300 B ships a historical-methods appendix — the era lookup is a documented finite table, not an archival search.

---

## 2 — National data sources

### 2.1 Parcel geometry — Matrikkelen

| Layer | Content | Access | Cost | Confidence |
|---|---|---|---|---|
| **Matrikkelen — Eiendomskart Teig** | Parcel boundary polygons, GML, daily update | WFS: `https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig?Service=WFS&Request=GetCapabilities` | **Free, no login, open data** — confirmed live 2026-07-24 | `published` — **CONFIRMED LIVE** |
| **Matrikkelen — Bygningspunkt** | One point per building, linked to matrikkel building number | WFS via Geonorge, no login | **Free, no login** | `published` — confirmed |
| **Matrikkelen full API** (ownership, unit numbers, full attribute set) | Complete register incl. grunnbok links | `matrikkel.no` / `nd.matrikkel.no` API, signed agreement with Kartverket required | Free-of-charge; requires a Kartverket access agreement (paperwork, not a purchase) | `published` (schema); agreement required |

**Norway's structural advantage over Germany:** parcel geometry is one national WFS, no per-Land ALKIS fragmentation. Access is genuinely free and open with no login for the boundary-polygon layer.

### 2.2 Plan/zoning data — SOSI Plan (national schema, per-kommune delivery)

| Aspect | Value | Confidence |
|---|---|---|
| Schema mandate | Forskrift 26.06.2009 nr. 861 — all kommuner legally required to produce kommuneplan and reguleringsplan on the national SOSI Plan object catalogue since 2009 | `published` |
| National plan catalogue | Geonorge "Plan2" catalogue — indexes per-kommune planregister datasets; not a merged national feature layer | `published` |
| National plan viewer (in-hearing) | **SePlan** (Kartverket) — national viewer for plans in public hearing | `published` |
| Per-kommune delivery | Each of ~357 kommuner publishes its own planregister WFS; schema is shared (SOSI Plan) so one reader serves all endpoints | `published` (schema); per-kommune (delivery) |
| Trondheim planregister | **Confirmed open, no conditions, continuously updated** — Geonorge kartkatalog UUID `21c83653-b9c2-4931-bad0-a67e4c0f6be6` | `published` — **CONFIRMED** |
| Oslo planregister | Planinnsyn click-viewer confirmed live; standalone WFS not yet confirmed | `published` (viewer); WFS TBD |
| Bergen planregister | Not yet located in this pass | TBD |

**No single national WFS exists** that resolves "which reguleringsplan covers parcel X" across all 357 kommuner in one call. Geonorge indexes where to look; each kommune is the actual data source.

### 2.3 Height national default — pbl. § 29-4

**Confirmed text at regjeringen.no, Rundskriv H-8/15 (2026-07-24):**
- Buildings with gesimshøyde > 8 m or mønehøyde > 9 m **require an adopted plan**
- Absent a plan-set distance: setback = **max(½ building height, 4 m)** from neighbour boundary
- Height measured as average eave height vs. average adjusted terrain along the façade

**This is Norway's strongest structured-data field relative to Germany.** Germany's §34 (unplanned interior) returns a discretionary "fit the neighbourhood" standard with zero numeric content. Norway's § 29-4 returns hard-coded shippable numbers.

### 2.4 Building footprints + height — FKB-Bygning

| Aspect | Value | Confidence |
|---|---|---|
| Content | Building footprint + top-height value (2.5D); linked 1:1 to matrikkel building number | `published` |
| Licence — Norge digitalt parties | **Free** for public bodies and "Geovekst" agreement holders | `published` |
| Licence — private/commercial | **Must purchase** through a reseller (Geodata, Norkart) or direct Kartverket agreement — this is a real licence gate | `published` |
| Lighter alternative | Matrikkelen — Bygningspunkt (point per building, no footprint) — fully open, free | `published` |

⚠ **Budget a Norge digitalt agreement or reseller purchase for FKB-Bygning**, exactly as Germany's ZSHH restriction was budgeted. This is the single most common miss given Norway's otherwise strong open-data posture.

### 2.5 Terrain — Nasjonal detaljert høydemodell (NDH)

**Norway's strongest national layer — better than both Germany and France:**

| Aspect | Value | Confidence |
|---|---|---|
| Coverage | ~230,000 km², complete nationwide (2016–2022) | `published` |
| Density | ≥2 pts/m² (5 pts/m² in densified areas) | `published` |
| Access | `høydedata.no`; also indexed as WMS/WFS/WCS on Geonorge | `published` — **confirmed live** |
| Cost | **Fully free, no login, complete** — unlike Germany's licence-gated ZSHH and France's still-rolling-out LiDAR HD | `published` |

### 2.6 Heritage

| Source | Content | Access | Confidence |
|---|---|---|---|
| **Askeladden** | One official register, 300,000+ localities; legally protected under kulturminnelova | Professional login only (kommune/fylke/museum/consultant) | `published`; access-gated |
| **Kulturminnesøk.no** | Public mirror: ~220,000 objects, map geometry + attributes; Riksantikvaren caveat: older geolocations may be imprecise | Free, no login | `published` — **confirmed live** |
| **SEFRAK** | ~515,000 pre-1900/pre-1945 buildings (nationwide survey 1975–1995); **separate from Askeladden** | Via Riksantikvaren WMS/WFS | `published` |

**City-specific overlays:** Oslo's "Gul liste" and Bergen's municipal verneverdig-building list are separate from the national Askeladden/Kulturminnesøk layer — both cities maintain their own heritage overlay on top of the national hensynssone `H570` mechanism.

---

## 3 — Context-data layer status

| Layer | Source | LOD achievable | Licence gate | Status |
|---|---|---|---|---|
| Parcel polygons | Matrikkelen — Eiendomskart Teig | Parcel boundary | **None — open** | **CONFIRMED LIVE** |
| Building points | Matrikkelen — Bygningspunkt | Point location | **None — open** | Confirmed |
| Building footprints + roof height (2.5D) | FKB-Bygning | LOD1/LOD2 | Norge digitalt or reseller | Schema confirmed; licence gate confirmed |
| Terrain (DTM/DSM) | NDH / høydedata.no | Full LiDAR coverage | **None — open** | **CONFIRMED LIVE** |
| Heritage — public | Kulturminnesøk.no | Point + polygon | **None — open** | **CONFIRMED LIVE** |
| Heritage — professional | Askeladden | Full register | Professional login | Access-gated |
| Plan boundaries (per-kommune) | SOSI Plan WFS per kommune | Plan polygon | Varies by kommune (most open) | Trondheim confirmed; Oslo/Bergen TBD |
| Plan numeric values | Reguleringsbestemmelser text | Prose text / PDF | Usually open access | Structured data path: NLP/transcription pipeline required |

**Norway vs Germany on context data:** France has one national IGN product with uniform open licensing. Germany has 16 Land-operated systems with heterogeneous licensing. Norway has one national parcel + terrain product (free) plus one national heritage product (tiered), but per-kommune plan data — cheaper per-endpoint than Germany but still 357 separate endpoints.

---

## 4 — Overlay risk

| Overlay | Source | Risk |
|---|---|---|
| **Reguleringsbestemmelser prose** (numeric BYA/height not in structured fields) | Per-kommune bestemmelser text | **VERY HIGH** — the central structural gap; applies to nearly all plan-governed parcels |
| **§ 29-4 no-plan regime** (need to determine whether a plan governs) | Matrikkelen + planregister WFS | MEDIUM — classifier needed, but fallback is straightforward numeric |
| **Hensynssone H570** (heritage conservation overlay) | SOSI Plan (national code) + per-kommune geometry | HIGH — code is national; geometry requires per-kommune plan query |
| **Gul liste / verneverdig** (city-specific heritage overlay) | Oslo Byantikvaren; Bergen Byantikvar | HIGH (city-specific) — must source separately per city |
| **FKB-Bygning licence gate** | Norge digitalt / Geovekst | HIGH — easy to miss given Norway's strong open-data posture elsewhere |
| **BestemmelseUtnyttingsgrad** (SOSI Plan object type for numeric utilization) | Geonorge object register | **CRITICAL NEGATIVE** — the national object-catalog entry for this type is itself an unfinished stub (confirmed 2026-07-24: "Her burde det vært en forklaring…") — do not treat the schema slot as populated in live data |

---

## 5 — Municipality coverage

| Municipality | Kommunenummer | Fylke | ISO 3166-2 | Pack status | Integration cost | Sequencing |
|---|---|---|---|---|---|---|
| **Trondheim** | 5001 | Trøndelag | `no-50` | SCAFFOLD — planregister access confirmed open | **Lowest confirmed** — shared national schema, planregister confirmed open, no city-specific legal deviation identified | **First — build here** |
| **Oslo** | 0301 | Oslo | `no-03` | SCAFFOLD — Planinnsyn viewer confirmed; standalone WFS TBD | Low–moderate pending WFS confirmation; richest tooling (per-parcel grad-av-utnytting faktaark, nightly plan updates) | Second (pending WFS confirmation) |
| **Bergen** | 4601 | Vestland | `no-46` | SCAFFOLD — national mechanism confirmed; planregister endpoint not yet located | Low once confirmed (same schema as Trondheim) | Third |

**Recommended sequencing:** Trondheim → Oslo → Bergen — mirroring the Germany Hamburg-first principle: start with the most defensible city (confirmed open WFS, no special-case legal mechanism), then the richest tooling city, then the structurally identical but unconfirmed endpoint.

---

## 6 — Files in this folder

```
no/
├── README.md                           ← this file (country umbrella)
├── RATE.md                             ← data readiness rate (~32%)
├── NEXT.md                             ← blockers, trip-wires, resume steps
├── sources/
│   ├── SOURCES.md                      ← per-field national data source citations
│   └── VERIFICATION.md                 ← human sign-off (open)
├── findings/
│   └── NORWAY-MASTER-DATA-SOURCE-STUDY.md  ← full source/legal-mechanism study
├── topics/
│   ├── buildings-lod-height.md
│   ├── parks-trees.md
│   ├── roads-pedestrian.md
│   └── water.md
├── regions/
│   └── README.md                       ← kommune routing (357 kommuner, per-fylke)
├── no-03/
│   └── 0301-oslo/                      ← Oslo (municipality + city-state)
├── no-46/
│   └── 4601-bergen/                    ← Bergen (Vestland fylke)
└── no-50/
    └── 5001-trondheim/                 ← Trondheim (Trøndelag fylke)
```

---

## 7 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **Oslo planregister WFS:** Planinnsyn is confirmed as a human click-viewer. Whether a standalone machine-readable WFS exists behind it — identical in shape to Trondheim's — is the highest-value single confirmation for Norway. Check `data.oslo.kommune.no` or Geonorge kartkatalog for an Oslo planregister WFS entry.
- **Bergen planregister WFS:** Not located in this pass. Search Bergen kommune's open-data portal or Geonorge kartkatalog for "Planregister Bergen kommune."
- **BestemmelseUtnyttingsgrad object-catalog fill rate:** confirmed as an unfinished stub at the national level (2026-07-24). Check whether this has been updated in any subsequent Geonorge object-register release.
- **Trondheim live GetFeature attribute schema:** planregister confirmed open; actual GML attribute names (arealformål code, hensynssone code, planstatus, bestemmelser text or link) not yet pulled from a live GetFeature call against a real parcel.
- **Norge digitalt agreement cost and timeline:** FKB-Bygning is the primary licence gate. Confirm the application process, time-to-approval, and any fee for a commercial engine entity.
- **SePlan (in-hearing viewer) API status:** confirmed as a national viewer; not confirmed as a programmatic per-parcel API for adopted (not just in-hearing) plans.
- **Trondheim reguleringsbestemmelser structured markup:** one sampled Trondheim plan (Brannkvartalet, 2004) has bestemmelser as prose paragraphs (§1, §2, …). Whether newer plans use any consistent structured heading pattern that would make NLP extraction reliable has not been checked on a wider sample.
