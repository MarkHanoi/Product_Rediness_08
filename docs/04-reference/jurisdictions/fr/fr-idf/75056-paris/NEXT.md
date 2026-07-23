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

### B2 — "Plan des hauteurs" machine-readability unknown

The graphic-plan ceiling values that `UG`'s height formula depends on are stored in a "plan des
hauteurs". It may be a queryable GIS layer (best case: 4–5 dev-days to ingest) or PDF plates
only ("atlas des planches au 1/2000" — worst case: +6–8 dev-days for digitizing).

**THE EXACT RESUME STEP:**
```bash
# Check Paris open data for a GIS hauteurs layer
curl "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets\
?where=title+like+'hauteur'&limit=10&select=dataset_id,title,description"

# Also check the SIG portal
curl "https://api-sig.paris.fr/geoserver/wfs?SERVICE=WFS&REQUEST=GetCapabilities" \
  | grep -i hauteur
```

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
