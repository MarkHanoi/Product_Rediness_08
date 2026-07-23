# NEXT — Lyon Métropole (69123)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED

**Where we stopped:** research complete. No live probe run. No rule pack started. The entire
cost and sequencing of the Lyon pack depends on one unresolved probe.

---

## 1 — THE CRITICAL PROBE — **COMPLETED 2026-07-23**

**Result: HBCPRINC/PLAFOND are NOT on the national GPU WFS. Height data is on `data.grandlyon.com` only. Outcome: Tier 2 source integration required (+3–5 dev-days).**

Live probes run 2026-07-23:
1. **National GPU WFS `wfs_du:zone_urba`** for Lyon Confluence bbox (4.8240,45.7390,4.8350,45.7470): returned GML (338,262 chars). Parsed field names: NO `HBCPRINC`, `HBCSEC`, or `PLAFOND` present. Only standard GPU zone fields.
2. **`apicarto.ign.fr/api/gpu/zone`**: returns HTTP 404 — path has changed. API Carto GPU paths are stale.
3. **`data.grandlyon.com` WFS `plu_h_opposable.pluhauteur`**: CONFIRMED LIVE. Schema: `hauteur` (string, absolute metres; sample: "16"), `last_update`, `last_update_fme` (2026-04-23), `gid`. Geometry: polygon. WFS is open (no authentication observed).

**Revised outcome:** Lyon outer 56 communes → data.grandlyon.com `pluhauteur` is the height source, not the national GPU. This is Tier 2 (second data source). Additional integration cost: ~3–5 dev-days beyond the GPU integration. Total pack estimate: ~8–12 dev-days for outer communes.

**Outstanding sub-questions:**
- Is `pluhauteur` a single unified layer (all 58 communes) or separate for Lyon+Villeurbanne?
- Does `pluzone` layer on grandlyon contain zone_urba equivalent (zone code, libelle)?
- PLU-H document URL pattern confirmed: `pluh.grandlyon.com/plu.php?select_commune=LYON5E`

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
