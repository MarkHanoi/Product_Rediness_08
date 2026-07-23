# NEXT — Lyon Métropole (69123)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED

**Where we stopped:** research complete. No live probe run. No rule pack started. The entire
cost and sequencing of the Lyon pack depends on one unresolved probe.

---

## 1 — THE CRITICAL PROBE (run this first, before anything else in France)

**Does the national GPU WFS expose `HBCPRINC` and/or `PLAFOND` as fields on Lyon zoning polygons?**

```bash
# Lyon parcel — Confluence district (~69002)
curl "https://data.geopf.fr/annexes/ressources/wfs/gpu.xml\
?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
&TYPENAMES=gpu:zone_urba\
&BBOX=4.8240,45.7390,4.8350,45.7470,EPSG:4326\
&SRSNAME=EPSG:4326&COUNT=3&OUTPUTFORMAT=application/json" \
  | python3 -m json.tool | grep -E '"HBCPRINC|HBCSEC|PLAFOND|hauteur|HAUT'

# Also try API Carto module GPU (may expose different fields)
curl "https://apicarto.ign.fr/api/gpu/zone?lon=4.8300&lat=45.7430" | python3 -m json.tool
```

**What each outcome means:**
- **Fields present in national GPU WFS** → outer 56 communes are Tier 1. Begin pack
  implementation immediately. No new engine kind needed. Estimated cost: ~5–7 dev-days to ship
  the outer-communes pack.
- **Fields absent, but present on `data.grandlyon.com`** → second data source integration
  required. Check: `curl "https://data.grandlyon.com/geoserver/metropole-de-lyon/ows\
  ?service=WFS&version=2.0.0&request=GetCapabilities" | grep -i hauteur`. If found, add
  `data.grandlyon.com` as a second source and scope the integration separately (~3–5 dev-days).
- **Fields absent from both** → Lyon height values are in the PLU-H règlement PDF only.
  Sourcing reverts to the same PDF-transcription path as Paris. Update the blocker in
  `../../NEXT.md §3.1` accordingly.

---

## 2 — BLOCKERS

### B1 — Critical probe not run (see §1 above)

### B2 — Lyon/Villeurbanne height-perimeter overlay layer not sourced

Even if `HBCPRINC`/`PLAFOND` are confirmed for outer communes, the city of Lyon and Villeurbanne
use a separate "périmètres de hauteurs de façades" overlay that overrides the base zone attribute.
This layer's name, endpoint, and licence are unknown.

**THE EXACT RESUME STEP:**
```bash
# Search data.grandlyon.com for the facade-height perimeter layer
curl "https://data.grandlyon.com/geoserver/metropole-de-lyon/ows\
?service=WFS&version=2.0.0&request=GetCapabilities" \
  | grep -i -E 'hauteur|facade|perimetre'
```

### B3 — PLU-H consolidated text version not confirmed

The PLU-H entered into force June 2019. Check whether modifications have been adopted since.

**THE EXACT RESUME STEP:** obtain the GPU-returned PDF link for a Lyon parcel
(`apicarto.ign.fr/api/gpu/zone?lon=4.8300&lat=45.7430`), note the document approval date; if
date differs from June 2019, track the modificatif history before sourcing any article values.

---

## 3 — TRIP-WIRES

- **If the outer-communes pack ships** → Lyon/Villeurbanne overlay becomes the next milestone; do not close the Lyon entry until the core city is covered.
- **If `data.grandlyon.com` requires an API key or terms-of-use registration** → document the access requirement in `sources/SOURCES.md §B` and flag it as a legal-review item before ingesting.
- **If the PLU-H is revised** (Lyon Métropole was reviewing components as of 2025) → check GPU for a new document version. If article structure changed, re-source from scratch for affected zones.

---

## 4 — SMALLEST NEXT STEP (1 hour)

Run the two probe commands in §1 above. Record the result in `sources/SOURCES.md §A` or `§B`.
This single action resolves whether Lyon is the cheapest French entry (Tier 1, config-only) or a
medium-cost second-data-source integration.
