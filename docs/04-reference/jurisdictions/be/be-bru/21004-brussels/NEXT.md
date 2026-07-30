# NEXT — Brussels (21004)

> **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED

**Where we stopped:** C63 Phase-1 dossier scaffolded. Context bake is LIVE (`bake.mjs brussels`). Federal
cadastre + PRAS endpoints researched but not wired/live-probed. No rule pack. No building-height or terrain
source resolves for Brussels-Capital.

---

## 1 — BLOCKERS

### B1 — Belgian-IP deployment (access prerequisite for ALL Brussels live work)
`gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` is bot-blocked from non-Belgian IPs. Until an EU/Belgian-IP
probe path exists, PRAS/RRU/RRUZ layers + licence terms cannot be independently verified.
**RESUME STEP:** stand up a Belgian/EU-egress probe, re-fetch PRAS GetCapabilities, record in `sources/`.

### B2 — No wired parcel provider for Belgium
`parcelProviders/registry.ts` has no `isInBelgium`/CADMAP predicate → a Brussels click falls to
footprint-fallback. The federal CADMAP WFS is verified-live but not an app provider.
**RESUME STEP:** add a CADMAP provider (national WFS `ccff02.minfin.fgov.be/.../INSPIRE/CP/`), then run
`computeParcelConfidence` over a Brussels sample to compute PARCEL Axis 1.

### B3 — No building-height source (Axis 6 blocked)
GRB LiDAR height is Flanders-only; UrbIS height attribute is unprobed.
**RESUME STEP:** one `GetFeature` on the federal CADMAP building sublayer to check for a height/storey
attribute (highest-value BE probe); else probe the UrbIS building layer schema.

### B4 — No Brussels-Capital terrain (DTM) route (Axis 5 blocked)
`terrain.mjs` `be` verdict `blocked` — URBIS GeoServer exposes no elevation coverage; Flanders DHMV /
Wallonia MNT do not cover the enclaved Brussels-Capital region.
**RESUME STEP:** pin the Bruxelles-Environnement / CIRB DTM service + licence, add a `terrain.mjs` REGIONS row.

### B5 — RRU Titre I gabarit KIND not built (envelope blocked)
RRU Titre I `H = P + 3.00 + D` is a context-relative formula-in-PDF; no engine KIND computes it, and no
PPAS/RRUZ/PAD precedence resolver exists.
**RESUME STEP:** read RRU Titre I verbatim, draft the reference-formula gabarit ADR (reuse the Paris ADR-0274
resolver family), build the precedence check.

---

## 2 — TRIP-WIRES

- **If the federal CADMAP building sublayer carries a height attribute** → a free, nationally-consistent
  Belgian building-height source; unblocks Axis 6 for all three regions at once. Probe before assuming absence.
- **If a RUP/PPAS/BPA feature anywhere in Belgium exposes a populated numeric height/FAR attribute via WFS
  GetFeature** (vs. a PDF hyperlink) → discovers a structured path not yet confirmed. The single highest-value
  BE research action (`../../README.md §7`).
- **A sourced RRU value is legally subordinate to *bon aménagement des lieux*** — any Brussels result MUST
  carry that caveat + a PPAS/RRUZ/PAD precedence flag.

---

## 3 — SMALLEST NEXT STEP (0.5 dev-days)

From a Belgian/EU IP: (1) `GetFeature` on the federal CADMAP building sublayer → height attribute yes/no;
(2) PRAS GetCapabilities live → confirm `PERSPECTIVE_FR:Affectations`. Record both in `sources/SOURCES.md`.
