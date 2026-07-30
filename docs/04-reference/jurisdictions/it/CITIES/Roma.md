# Roma — Phase-1 Pilot Stub

**ISTAT:** `058091` · **Region:** Lazio (`it-laz`, ISO IT-62) · **Instrument:** **PRG**
(Roma Capitale, adopted 2008, still current) · **Height coverage:** ★★★★ (Lazio LiDAR / Roma
Capitale SIT) · **Priority:** ★★★★ (Phase 1; largest + most legally complex) · **Confidence:**
`CONVERGENT-SECONDARY`.

> Envelope stub only — the implemented RATE dossier is at
> [`../it-laz/058091-rome/`](../it-laz/058091-rome/README.md) and its
> [`RATE.md`](../it-laz/058091-rome/RATE.md). **This stub links; it does not edit those.**

## Planning mechanism
- **PRG 2008** classifies land by **fabric type (`tessuto`)** inside four *sistemi* — NOT DM 1444
  zone letters: Città Storica (per-tessuto 1:5,000) · Città Consolidata (T1/T2/T3 + Carta per la
  Qualità) · Città da Ristrutturare · Città della Trasformazione.
- **New engine kind required**, with a **direct/indirect intervention split** (Rome's §34/§35
  analogue): whether a numeric envelope is readable from the PRG or needs a further executive plan is
  a **parcel-by-parcel classification** — the classifier must run before any numeric sourcing.
- Live legal risk: **Carta per la Qualità precedence** — recent amendments make tessuto rules prevail
  over the heritage overlay; confirm against the consolidated NTA before citing.

## Data
- **Parcels:** national `ItalyCatastoProvider` (Agenzia Entrate, VERIFIED-LIVE; Rome = ISTAT `H501`).
- **Heights:** Lazio LiDAR / Roma Capitale SIT → `heightProvider: lazio_lidar`; no confirmed
  region-wide 3D-buildings layer (unlike Piemonte).
- **Envelope rules:** Roma Capitale SIT / urbanistica portal — PRG sistema/tessuto WFS queryability TBD.

## Envelope-pack status
NOT STARTED — ~25–30 dev-days for Città Storica + Consolidata T1–T3; Città da Ristrutturare /
Trasformazione = reasoned refusal until executive plans exist. See
[`ITALY-MASTER-DATA-SOURCE-STUDY.md §B.2`](../findings/ITALY-MASTER-DATA-SOURCE-STUDY.md).

**Related:** [`../ITALY-GEOSPATIAL-DATA-INVENTORY.md`](../ITALY-GEOSPATIAL-DATA-INVENTORY.md) ·
[`../regions/README.md`](../regions/README.md).
