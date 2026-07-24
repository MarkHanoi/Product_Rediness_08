# USA — MASTER DATA-SOURCE & RULE-MECHANISM STUDY

> **Stamp:** 2026-07-24 · **Status:** RESEARCH COMPLETE — structural characterisation; no live
> endpoint probes executed.
> **Governance posture:** research/reference doc — NOT a `*-AUDIT.md` contract derivative.
> **Comparison benchmark:** Italy (~8–10%), France (~22%), Germany (~28%), Norway (~32%), Denmark (~96%).
>
> **Primary external source:** internal research note "The US case is structurally the most
> fragmented of anything covered so far" (attached_assets, 2026-07-24), covering NZA, Mercatus,
> Zoneomics, Regrid, Microsoft Building Footprints, USGS/Overture height, and NRHP.

---

## PART A — THE STRUCTURAL BASELINE

### A.1 Legal framework — no national code, ~33,000 independent jurisdictions

There is no US federal ministry of planning and no national zoning statute. Zoning is a
**municipal police power** confirmed by the Supreme Court in *Euclid v. Ambler Realty Co.*
(1926). States adopted local variants of the 1922 model Standard State Zoning Enabling Act,
then delegated authority downward; the result is that "zoning" is not one legal mechanism at
all but an estimated **~33,000 independently-drafted local ordinances**, each its own document,
map, and amendment history.

**Structural comparison:**
- Italy's problem is 21 regional legal mechanisms with almost no market response.
- Germany has 16 Länder each operating their own delivery of a federal standard (BauNVO/XPlanung).
- Sweden has 290 kommuner under one national statute (PBL) with one national digital platform (NGP).
- The US has tens of thousands of jurisdictions with no national instrument, no national
  digitisation mandate, and no government-led aggregation effort — but a much more developed
  private/nonprofit data-fixing ecosystem than any of the European cases.

This is Italy's regional-fragmentation problem taken one level further down — not 21 legal
mechanisms, but ~33,000. The key structural difference: a mature US market response (NZA,
Mercatus, Zoneomics, Regrid, Microsoft, USGS/Overture) independently solved slices of the
problem that Italy's fragmented market never solved at all.

### A.2 The four-way regime classifier (prerequisite — analogous to Germany's §30/§34/§35)

Before any numeric rule can be sourced for a US parcel, the pipeline must determine:

| Regime | Legal basis | Numeric rules available? | Engine response |
|---|---|---|---|
| **(a) Modern zoning district** | Municipal zoning ordinance (adopted under state enabling act) | POTENTIALLY — use code, height, FAR, lot coverage, setbacks in ordinance text or Zoneomics | Source and apply |
| **(b) Overlay district / PD** | Planned Development or overlay ordinance on top of base zone | PARTIAL — base zone + overlay; overlay may supersede numerics | Flag overlay, source overlay rules separately |
| **(c) Non-conforming / grandfathered** | Pre-zoning structures with vested rights under municipal code | NO numeric envelope applicable — case-by-case | Reasoned refusal |
| **(d) Unincorporated territory** | County zoning (if any); some counties are entirely unzoned | VARIES — some counties have well-digitised zoning, others none at all | County-level fallback or refusal |

⚠ **The absence of a national B-Plan equivalent means there is no single WFS to query for
the existence of a zone at all.** The pipeline's first question — "does a zoning ordinance
cover this parcel, and from which of ~33,000 jurisdictions?" — is itself a data problem.
Zoneomics and Regrid both provide a jurisdiction-routing layer that answers this.

---

## PART B — ZONING DATA: ACADEMIC + COMMERCIAL LANDSCAPE

### B.1 National Zoning Atlas (NZA) — the closest thing to a national standard; no downloads yet

The **National Zoning Atlas (NZA)**, run by Land Use Atlas Inc. out of Cornell's Legal Constructs
Lab, is the single most important structural fact in US zoning data. It is attempting exactly
what no US government body has: digitising, demystifying, and democratising zoning across
the ~33,000 US jurisdictions in a standardised format.

**Coverage model:**
- Central team directly analysing **4,000+ jurisdictions**.
- More than two dozen independent partner teams covering additional states and regions
  (Connecticut, New Hampshire, Charlotte NC metro, Westchester County NY, and others).

**Two critical caveats, both load-bearing:**

1. **No bulk access exists.** As of NZA's own FAQ: *"We have not yet developed a mechanism for
   third parties to download and utilize the collected data. Stay tuned for more on this, maybe
   in 2026."* The flagship US zoning-standardisation effort is browse-only via an interactive
   map and PDF-style "Zoning Snapshots" — there is no API, no bulk export, from the source
   itself. This is the equivalent of XPlanung existing as a standard but with every WFS
   restricted behind a closed gateway.

2. **NZA explicitly rejects AI automation as insufficiently accurate** for its core methodology:
   *"algorithms simply cannot (yet) understand the nuances of lengthy, complex zoning codes to
   the level of accuracy we require."* A live, NSF-funded second-phase pilot with Cornell Tech
   professor Alexander Rush is specifically testing generative AI for automating zoning-code
   data extraction — directly relevant, still experimental.

### B.2 Mercatus Center — the practical workaround for NZA-derived data

The **Mercatus Center at George Mason University** aggregates outputs of NZA's individual
state/regional partner teams and republishes them as **downloadable GeoJSON and XLS/CSV files**.

This is currently the only practical way to get NZA-derived structured data — not from NZA
itself, but from a third party redistributing partner-team outputs — and only for the
jurisdictions those specific teams have completed. Coverage is partial and state-dependent;
no national completeness figure is confirmed.

**Practical endpoint:** `mercatus.org` / George Mason open-data repositories. URL not yet
live-probed.

### B.3 Zoneomics — the national commercial zoning API (the single biggest structural difference from Italy)

**Zoneomics** claims coverage across **20,000+ cities and 100+ million parcels**, offering a
real Zoning Data API returning:
- Permitted land use / zone code
- Building height limits
- Lot size requirements
- Floor Area Ratio (FAR)

**Confirmed enterprise customer:** Sidewalk Labs (Google's urban-planning subsidiary), which
integrated Zoneomics specifically to get instant permitted-land-use and development-standard
data at scale. Commercial product since ~2021; actively adding coverage weekly.

**This is the single biggest structural difference from Italy:** a mature, national, numeric-
attribute zoning API exists and is commercially viable. It is paid, not free, but it *exists* —
which puts a US-focused project in a fundamentally different position than an Italy-focused one.
Germany has XPlanung (structured schema, but GRZ/GFZ absent from most WFS responses); France has
GPU WFS (boundary only, rules in PDFs). The US has Zoneomics (numeric fields, commercial, paid).

**Coverage caveat:** 20,000+ cities is not 33,000 jurisdictions. Rural and unincorporated areas,
small municipalities, and recently-incorporated places may not be covered. Probe before assuming
full national coverage.

---

## PART C — PARCEL DATA

### C.1 Regrid — near-universal commercial coverage

**Regrid** (formerly Loveland/Landgrid — civic-tech roots in Detroit blight-fighting work)
provides:
- **160 million parcel boundaries and records**
- **99% of Americans** covered
- **3,229 counties** — functionally all of the US
- Continuously refreshed, standardised into one schema
- Zoning and building footprints matched to parcels
- Delivered via API, bulk files, or Esri-compatible feature service

**Key differentiator for this platform:** Regrid has shipped an **MCP (Model Context Protocol)
server for AI-native access** — directly relevant infrastructure for a Claude-based tool,
distinct from anything found in the Italy/Germany/Sweden research.

Access model: commercial/paid at scale; individual parcel lookups free via their public web
app (mirroring the UrbisMap freemium pattern).

### C.2 Free county/city parcel portals — fragmented, unsurveyed

Many individual counties and cities publish their own parcel data free via:
- **ArcGIS Hub** (ESRI-hosted open-data portals — very common for US municipalities)
- **Socrata** open-data portals
- **data.gov** federal aggregation

No systematic national survey of these has been done; this is the US analogue of the Italy
municipal-open-data sweep (a scripted crawl of ArcGIS Hub for county-level parcel layers).
Coverage is guaranteed uneven — urban counties generally publish; rural/small counties often do
not. Free ArcGIS Hub parcel data may cover ~40–50% of the US parcel universe by count.

---

## PART D — BUILDING GEOMETRY AND HEIGHT

### D.1 Microsoft US Building Footprints — free, national, ODbL

**129.6 million computer-generated building footprints** covering the entire country:
- Freely downloadable
- Licensed **ODbL**
- ML-derived from aerial/satellite imagery
- No height attribute — footprint geometry only

This is the US analogue of Italy's OpenBuildingMap (free, modelled, national) — but at a
scale (129.6M vs OpenBuildingMap's partial Italy coverage) that makes it genuinely strong.
Overture Maps Foundation also includes building footprints derived partly from Microsoft's data.

### D.2 USGS 3DEP + Overture Maps — modelled building heights, free and growing

**USGS's national LiDAR program (3DEP)** explicitly built to provide "the first-ever national
baseline of elevation data." Combined with Microsoft's and OpenStreetMap's building footprints
by the **Overture Maps Foundation** to estimate height above ground per building:

- **Started:** 6 million building heights across 34,000 square miles (Boston, Chicago, Santa Clara)
- **Grown to:** 20 million+ as of the research date
- **Target:** 40–50 million in a subsequent release

This is a free, national, structured building-height dataset — **modelled/estimated rather
than surveyed** (same caveat tier as Italy's OpenBuildingMap and Germany's LoD2-DE footprint
fallback). The institutional backing (USGS + Overture Maps Foundation) and national scale
exceeds Germany's per-Land LoD2-DE fragmentation for the *free and truly nationwide* criterion.

**Caveat:** 20M heights out of 129.6M footprints = ~15% height coverage today, growing.
This is not a complete national product yet.

### D.3 OpenStreetMap

Standard ODbL fallback. US coverage is good in urban areas; rural coverage patchy. The
`building:levels` tag exists but is inconsistently populated. Use `building:levels × 3.0 m`
as last resort.

---

## PART E — HERITAGE

### E.1 National Register of Historic Places (NRHP) — free, national, same caveats as Italy's SITAP

The **National Register of Historic Places (NRHP)**, run by the **National Park Service (NPS)**
under the National Historic Preservation Act of 1966, maintains a genuine national, single-
authority spatial inventory of **nearly 100,000 listed properties**.

Distribution:
- **Free via NPS ArcGIS feature services** and open-data portals
- **Updated weekly**

**Real caveats — structurally identical to Italy's SITAP pattern:**

1. **Restricted/sensitive sites excluded.** Tribal, archaeological, or otherwise sensitive
   locations are explicitly excluded from the public layer. This is a designed restriction,
   not a data gap — do not attempt to fill it.
2. **Pre-1983 coordinate system.** Older records rely on legacy UTM/NAD27. Real positional-
   accuracy caveat; reproject before spatial joins.
3. **Minimal spatial attributes.** The spatial layer's own attributes are intentionally minimal —
   full descriptive data lives in a separate database (**NRIS**, ~45 fields per property) that
   must be joined, not queried directly from the map layer.

**NRIS join endpoint:** `nps.gov/subjects/nationalregister/` — NRIS data available via NPS
digital repositories; specific API endpoint not yet probed.

---

## PART F — CROSS-COUNTRY COMPARISON

| Field | Italy | Germany | Sweden | USA |
|---|---|---|---|---|
| National zoning code/instrument | No (21 regional) | Yes (BauNVO), but Land-specific | Yes (PBL, single law) | No (~33,000 independent ordinances) |
| National digital zoning standard | None | XPlanung (mandatory 2023, Stufe 1 min.) | NGP (mandatory 2022, ~81% municipalities) | None from government; NZA (academic, no downloads) |
| Free structured zoning data | Essentially none nationally | Patchy — GRZ/GFZ absent from most WFS | Strong for post-2022 plans | Essentially none free at scale; Mercatus partial |
| Commercial zoning data | Regional only (UrbisMap, PgtOnLine) | None identified at national scale | Not surveyed | **National scale — Zoneomics (20,000+ cities)** |
| Parcel geometry | Free, national (Catasto) | Free, per-Land (ALKIS) | Free, national CC0 (Lantmäteriet) | Commercial near-universal (Regrid); free county-by-county, unsurveyed |
| Building footprint | Partial (OpenBuildingMap) | ALKIS Gebäude per-Land | Terrain strong; LOD2 municipal/paid | **Free, national (Microsoft, 129.6M, ODbL)** |
| Building height | Piedmont-only surveyed; free modelled fallback | Strong, free, per-Land (LoD2-DE, ~58M) | Free terrain national; LOD2 municipal/paid | Free modelled, partial (Overture/USGS, 20M+ growing) |
| Heritage | SITAP (informational-only caveat) | Per-Land, fragmented | RAÄ + NGP integration | NRHP free, national; same informational-caveat pattern |

---

## PART G — KEY STRUCTURAL FINDING

**The US has arguably worse legal fragmentation than Italy (~33,000 vs 21 jurisdictions) but a
much more developed layer of nonprofit and commercial actors** — NZA, Mercatus, Zoneomics,
Regrid, Microsoft, USGS/Overture — each independently solving a slice of the same problem.

A US-focused version of this project would run through **paid commercial APIs (Zoneomics,
Regrid) rather than free government infrastructure** — a different kind of dependency, not a
solved problem — but the achievable ceiling is materially higher than Italy's ~8–10% or even
Germany's ~28%.

**Free-only ceiling:** ~12% (building footprints strong; zoning essentially absent; parcel
coverage fragmented; height partial). Similar to Italy and below France/Germany.

**Commercial API ceiling:** ~55–65% (Zoneomics covers 20,000+ cities with numeric FAR/height;
Regrid provides parcel context nationally; building footprint near-complete; height growing).

---

## PART H — WHAT NOT TO ATTEMPT (structurally absent, not just unsourced)

- **A free national zoning API returning numeric FAR, height, and coverage.** Does not exist;
  do not re-search. The government never built one; NZA has no downloads yet. Commercial
  (Zoneomics) is the only national numeric source.
- **A free national parcel layer at Regrid coverage levels.** Does not exist at national scale.
  County-level ArcGIS Hub portals are the free equivalent; they require a crawl and are
  individually inconsistent in schema.
- **Treating NZA browse data as citable structured data.** NZA data is browse-only; it is not
  an API and cannot be queried programmatically. Mercatus redistributions of specific partner
  outputs are the only citable derivative.
- **Using NRHP spatial attributes as the full heritage description.** NRHP spatial layer fields
  are minimal; the full record is in NRIS (separate join). Never ship an NRHP-derived heritage
  assessment from the spatial layer attributes alone.

---

## PART I — RECOMMENDED NEXT CONCRETE TASKS (ordered by information value)

1. **Probe Zoneomics API** for one target city (Chicago recommended — strong open-data city,
   likely good Zoneomics coverage): confirm field schema, check whether FAR and height are
   populated (not just use code), and establish cost model.

2. **Probe Regrid free parcel API** for one county in each of the three target cities. Confirm
   field schema, geometry format (GeoJSON), CRS (likely EPSG:4326), and what zoning fields
   (if any) Regrid attaches beyond boundary + address.

3. **Probe Mercatus GeoJSON outputs** for one completed NZA partner state. Confirm field names,
   zone code format, and whether numeric FAR/height are present or text-only.

4. **Probe Overture Maps building height** for one city bbox (Chicago recommended, as it was
   in the original Overture/USGS pilot area). Confirm field name, height datum, and coverage
   fraction vs. Microsoft footprint layer.

5. **Fetch NRHP NPS ArcGIS feature service** for one city bbox. Confirm attribute schema,
   positional accuracy (NAD27 caveat for older records), and NRIS join key.

---

**Cross-refs:** `../README.md` (country umbrella) · `../NEXT.md` (blockers + resume steps) ·
`../RATE.md` (data readiness rate) · city stubs: `us-ny/3651000-new-york-city/` ·
`us-il/1714000-chicago/` · `us-ca/0644000-los-angeles/`
