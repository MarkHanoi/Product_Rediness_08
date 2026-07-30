# Bologna — Phase-1 Pilot Stub

**ISTAT:** `037006` · **Region:** Emilia-Romagna (`it-emr`, ISO IT-45) · **Instrument:** **PUG**
(Piano Urbanistico Generale) · **Height coverage:** ★★★★★ (Emilia-Romagna DBTR + LiDAR) ·
**Priority:** ★★★★★ (**best pilot**) · **Confidence:** `CONVERGENT-SECONDARY`.

> No RATE dossier exists yet for Bologna (only Milan, Rome, Turin are scaffolded). This is the
> forward stub; a dossier would live at `../it-emr/037006-bologna/` when opened.

## Planning mechanism
- **PUG** under Emilia-Romagna planning law — structural/strategic plan with operative zoning.
- Emilia-Romagna runs the **best OGC infrastructure** of the pilot regions (full WMS/WFS/WCS/WPS/CS-W,
  INSPIRE-compliant) — which is why it is the **strongest pilot candidate**. Whether the *zoning*
  layer specifically is exposed as a queryable WFS still needs a direct capabilities check.
- Engine kind: **new PUG kind** (per-region) — do not assume DM 1444 zone letters are operative.

## Data
- **Parcels:** national `ItalyCatastoProvider` (Agenzia Entrate, VERIFIED-LIVE).
- **Heights:** Emilia-Romagna DBTR + regional LiDAR → `heightProvider: emilia_lidar` (★★★★★).
- **Envelope rules:** Emilia-Romagna regional geoportal + Comune di Bologna PUG (probe zoning-as-WFS).

## Envelope-pack status
NOT STARTED — recommended **first envelope pilot** because the region's data infrastructure is the
most mature. See [`ITALY-HEIGHT-ENVELOPE-STUDY.md §6`](../findings/ITALY-HEIGHT-ENVELOPE-STUDY.md).

**Related:** [`../ITALY-GEOSPATIAL-DATA-INVENTORY.md`](../ITALY-GEOSPATIAL-DATA-INVENTORY.md) ·
[`../regions/README.md`](../regions/README.md).
