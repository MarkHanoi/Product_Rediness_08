# Firenze — Phase-1 Pilot Stub

**ISTAT:** `048017` · **Region:** Toscana (`it-tos`, ISO IT-52) · **Instrument:** **Piano
Operativo** (operative layer over the Piano Strutturale) · **Height coverage:** ★★★★ (Toscana
regional LiDAR nDSM) · **Priority:** ★★★★ (Phase 1; heritage-dense) · **Confidence:**
`CONVERGENT-SECONDARY`.

> No RATE dossier exists yet for Firenze (only Milan, Rome, Turin are scaffolded). This is the
> forward stub; a dossier would live at `../it-tos/048017-florence/` when opened.

## Planning mechanism
- Toscana uses a **Piano Strutturale + Piano Operativo** split; Firenze's operative rules + heritage
  **vincoli** carry the buildable numbers. **New engine kind** (per-region operative-plan kind).
- ⚠ **Toscana zoning-as-data is a confirmed negative:** regional PRG data is delivered as **PDF
  scanned maps, not vector** — "having a geoportal" ≠ "having zoning-as-data." Envelope sourcing here
  is heavier (document extraction), and heritage density (Città Storica UNESCO core) adds vincoli load.

## Data
- **Parcels:** national `ItalyCatastoProvider` (Agenzia Entrate, VERIFIED-LIVE).
- **Heights:** Toscana regional LiDAR nDSM → `heightProvider: toscana_lidar`.
- **Envelope rules:** Comune di Firenze Piano Operativo + vincoli — expect PDF/document extraction,
  not a queryable zoning WFS.

## Envelope-pack status
NOT STARTED — later in Phase 1 than Bologna/Milano/Torino owing to the PDF-only zoning constraint.
See [`ITALY-HEIGHT-ENVELOPE-STUDY.md §4`](../findings/ITALY-HEIGHT-ENVELOPE-STUDY.md) and
[`ITALY-MASTER-DATA-SOURCE-STUDY.md §D.5`](../findings/ITALY-MASTER-DATA-SOURCE-STUDY.md) (Tuscany
confirmed negative).

**Related:** [`../ITALY-GEOSPATIAL-DATA-INVENTORY.md`](../ITALY-GEOSPATIAL-DATA-INVENTORY.md) ·
[`../regions/README.md`](../regions/README.md).
