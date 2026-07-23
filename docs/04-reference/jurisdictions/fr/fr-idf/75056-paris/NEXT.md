# NEXT — Paris (75056)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED

**Where we stopped:** research complete. No live probe run. No rule pack started. ADR-0274
(reference-surface + gabarit kind) not yet written.

---

## 1 — BLOCKERS

### B1 — ADR-0274 not yet written (reference-surface + gabarit kind)

Neither the `UG` pack nor any other Paris zone can be implemented without a ratified ADR
describing the new engine kind. **THE EXACT RESUME STEP:** read UG.10.1–10.4 verbatim from the
consolidated PLU bioclimatique text, then draft ADR-0274 with the founder.

### ~~B2 — "Plan des hauteurs" machine-readability unknown~~ **RESOLVED 2026-07-23 — GIS CONFIRMED**

**Outcome: BEST CASE — the height envelope is GIS machine-readable.**

Three datasets confirmed on `opendata.paris.fr` (live probe 2026-07-23):

1. **`plub_filet`** — "Filets gabarit-enveloppe" — **20,644 records** (parcel-edge segments). Field `haut` is a coded letter (M, K, C observed). The letter maps to a height-via-street-width ratio per PLU bioclimatique UG.10. Geometry: line segments (edges of parcel frontages). Access: `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/plub_filet/records`

2. **`plub_hauteur`** — "Plafonds des hauteurs" — **116 records** (zone polygons). Field `hauteur` = absolute metres (sample: 25m). This is a coarse zone-level ceiling override (e.g. large urban regeneration sectors).

3. **`plub_hmc`** — "Hauteur maximale constructible" — **47 records** (spot polygons). Fields: `hmc` = "NGF" (datum = altitude above sea level), `ht_hmc` = absolute height (samples: 85m, 67m). These are absolute NGF ceiling points for exceptional cases (tall towers, hilltops).

**Impact on estimate:** Paris pack is now 24–29 dev-days (lower estimate confirmed). GIS ingestion path is viable. `plub_filet` coded-letter field decoding is the remaining unknown (requires reading UG.10 règlement verbatim).

**Remaining work for plan des hauteurs:**
- Read PLU bioclimatique règlement UG.10 verbatim for the `haut` letter-to-height decoding table
- Verify that `c_asp` (parcel reference in `plub_filet`) is joinable to the cadastral parcel identifier
- Determine whether `plub_filet` segments cover 100% of Paris parcels or only specified frontages

### B3 — ABF perimeter overlay not built (HIGH RISK for Paris)

Paris has hundreds of classified monuments; a substantial fraction of private parcels are within
the 500 m ABF statutory radius. Without ABF overlay detection, any Paris envelope is
potentially overstated. Must be built before any result is considered shippable.

**THE EXACT RESUME STEP:** query GPU SUP layer for a parcel near Sacré-Coeur (18e arr) or
Notre-Dame (4e arr), inspect response for ABF-specific sub-type code (expected `AC2` or similar).

```bash
curl "https://apicarto.ign.fr/api/gpu/acces_au_sol\
?geom=%7B%22type%22%3A%22Point%22%2C%22coordinates%22%3A%5B2.3431%2C48.8867%5D%7D"
```

---

## 2 — TRIP-WIRES

- **If `plan_hauteurs` layer found on `opendata.paris.fr` or `api-sig.paris.fr`** → Paris
  pack becomes 24–29 d not 31–37 d. Start immediately, the graphic layer is the binding source.
- **If ADR-0274 is ratified** → `UG` pack implementation can start immediately, in parallel
  with the plan des hauteurs ingestion.
- **If PLU bioclimatique is modified** (Paris updates the document) → check which articles
  changed; UG.10 is the most likely target. Update `sources/SOURCES.md` with the new version.

---

## 3 — SMALLEST NEXT STEP (0.5 dev-days)

Run the three probes:
1. GPU zone probe for a Paris parcel → confirms zone code + PDF link work
2. BD TOPO probe → confirms `HAUTEUR` non-null
3. Open data portals probe → resolves whether plan des hauteurs is GIS or PDF-only

Record results in `sources/SOURCES.md` and promote three entries from B to A.
