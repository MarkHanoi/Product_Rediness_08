# NEXT — Liège (`lie-liege`, Wallonia)

> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

## 1 — WHERE WE STOPPED

Research is complete. The Wallonia instrument cascade (plan de secteur → GCU → bon aménagement des
lieux) is characterised. The plan de secteur WFS is VERIFIED LIVE and free. The central research
question — whether Liège has adopted a GCU with real numeric content — is unanswered. Without this,
the pack cannot be scoped: Liège may be a "bon aménagement des lieux refusal everywhere" case, or
it may have a GCU that changes the picture. This prerequisite research task must be completed before
any dev-day estimate can be made. The plan de secteur WFS is fully accessible — a GetFeature probe
for a Liège parcel is the immediate next step.

## 2 — THE NUMBER

**0% of clicks return a full, cited envelope (not started).** Research estimate for Wallonia: ~0–2%.

## 3 — BLOCKERS

### 3.1 — GCU confirmation (the top blocker — a research task, not an engineering task)
- **What it is.** Whether Liège has adopted a Guide communal d'urbanisme (GCU) with numeric provisions is unknown. GCU adoption is commune-by-commune and not centrally tracked in a queryable register.
- **Why it blocks.** Without knowing whether a GCU exists and what it contains, the pack cannot be scoped. If no GCU: the fill rate is ~0% and the output is always a bon-aménagement-des-lieux refusal. If a GCU with numeric provisions: a higher fill rate may be achievable for those zones covered by the GCU.
- **What would unblock it.** Check Liège's official municipal website and the CODT portal for GCU adoption; if adopted, obtain the GCU text.
- **THE EXACT RESUME STEP.** Search `liege.be` and Wallonia's urbanisme portal (`amenagement.wallonie.be`) for "guide communal d'urbanisme Liège" or "GCU de Liège." If found, record adoption date and URL; download the GCU text and search for "hauteur," "gabarit," "implantation" in the provisions.

### 3.2 — Plan de secteur GetFeature for Liège (easy win — endpoint is LIVE)
- **What it is.** The plan de secteur WFS is VERIFIED LIVE but a GetFeature for a known Liège parcel has not been run.
- **Why it matters.** Confirms the zone affectation returned for a Liège parcel; confirms whether any numeric height/FAR attribute appears (expected: no; confirming "no" is also a result); establishes the baseline from which any GCU content would add value.
- **THE EXACT RESUME STEP.**
  ```bash
  # Wallonia OGC API Features — Liège parcel centroid (approx Place Saint-Lambert)
  curl "https://geoservices.wallonie.be/geoserver/inspire_lu/ogc/features/v1/\
  collections/inspire_lu:LU.ZoningElement_pds/items\
  ?bbox=5.570,50.642,5.580,50.648&limit=5&f=application%2Fgeo%2Bjson" \
    | python3 -m json.tool
  # Record: zone affectation returned; any numeric height/FAR field present or absent
  ```

### 3.3 — Wallonia LiDAR/PICC building height confirmation
- **What it is.** Wallonia's LiDAR-derived terrain and PICC building-footprint products are referenced in catalogue metadata but not independently probed for density, coverage, or attribute schema.
- **THE EXACT RESUME STEP.** Search `geoportail.wallonie.be` for "LiDAR," "MNT," "MNH," or "PICC bâtiment" to identify the specific product name, resolution, and download/WFS endpoint.

## 4 — TRIP-WIRES

- **4.1 — If Liège's GCU is found and contains numeric height provisions** → update the Liège fill-rate estimate immediately; scope a Liège-specific pack using the GCU as the numeric instrument rather than bon-aménagement-des-lieux alone.
- **4.2 — If the plan de secteur GetFeature returns a numeric attribute for any zone** → this changes the Wallonia rate ceiling materially; update `RATE.md §4` and the country README.
- **4.3 — If any other Walloon commune's GCU is found with a structured numeric format** → assess whether the same extraction method applies to Liège; the GCU format may be standardised at the Wallonia level.

## 5 — WHAT IS ALREADY BUILT (do not redo)
- Plan de secteur WFS VERIFIED LIVE — `geoservices.wallonie.be/geoserver/inspire_lu/ows`
- CoDT Art. D.IV.13 (bon aménagement des lieux) confirmed as the operative standard
- Wallonia instrument cascade documented — `README.md §1`

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| `geoservices.wallonie.be/geoserver/inspire_lu/ows` | Wallonia plan de secteur zone affectation (boundary + type) | `VERIFIED-LIVE` 2026-07-24 | WMS GetCapabilities + OGC API Features `/openapi` both HTTP 200 |
| CoDT Art. D.IV.13 | Wallonia bon aménagement des lieux — the operative derogation and primary standard | `published` | `walllex.be` (CoDT reformed May 2025) |
| SPW Géoportail AWaP layer | Wallonia classified heritage — CC-BY 4.0 | `stated` | `geoportail.wallonie.be` catalogue; not independently fetched |

## 7 — DEAD ENDS
- **Numeric height/FAR from the plan de secteur layer:** the plan de secteur carries only broad affectation (zone d'habitat, activité économique, etc.) — confirmed from the full WMS capabilities returned in this pass. Do not probe for height attributes in the `LU.ZoningElement_pds` layer; it was never designed as a numeric-envelope instrument.
- **GRU as a numeric source:** the Guide régional d'urbanisme is explicitly indicative, not binding. Do not source numeric values from the GRU and present them as a permit-determinative ceiling.

## 8 — THE SMALLEST NEXT STEP

**Two parallel actions of equal priority:**

1. **Plan de secteur GetFeature for Liège** — 0.25 dev-days (endpoint is already live; see §3.2 above).
2. **GCU adoption search for Liège** — 0.5 dev-days (research task; see §3.1 above).

Run both in parallel. The GetFeature probe confirms the zone affectation layer; the GCU search determines whether numeric content exists above the plan de secteur floor.
