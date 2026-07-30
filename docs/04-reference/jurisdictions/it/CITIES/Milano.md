# Milano — Phase-1 Pilot Stub

**ISTAT:** `015146` · **Region:** Lombardia (`it-lom`, ISO IT-25) · **Instrument:** **PGT**
(Piano di Governo del Territorio, L.R. 12/2005) · **Height coverage:** ★★★★★ (Lombardia DBT +
LiDAR) · **Priority:** ★★★★★ (Phase 1) · **Confidence:** `CONVERGENT-SECONDARY`.

> Envelope stub only — the implemented RATE dossier is at
> [`../it-lom/015146-milan/`](../it-lom/015146-milan/README.md) and its
> [`RATE.md`](../it-lom/015146-milan/RATE.md). **This stub links; it does not edit those.**

## Planning mechanism
- **PGT**, split into Documento di Piano + Piano dei Servizi + **Piano delle Regole**.
- Operative density is **not a per-zone DM 1444 index**: the Tessuto Urbano Consolidato (TUC) carries
  one unified **Indice di edificabilità Territoriale ≈ 0.35 mq/mq**, up to **0.70 mq/mq** only via
  perequated/transferable rights + bonuses + social-housing quotas.
- **New engine kind required** — territorial-index-plus-perequation, not a zone-table lookup. ERS and
  agricultural areas are excluded from the unified index (separate smaller carve-outs).

## Data
- **Parcels:** national `ItalyCatastoProvider` (Agenzia Entrate, VERIFIED-LIVE).
- **Heights:** Lombardia DBT / regional LiDAR → `heightProvider: lombardia_lidar`.
- **FAR-adjacent:** Lombardy Indagine Offerta PGT (SLP by comune, L.R. 31/2014) — aggregate, schema TBD.
- **Envelope rules:** `pgt.comune.milano.it` NTA + tavole; perequation ledger not evidently GIS-exposed.

## Envelope-pack status
NOT STARTED — new PGT territorial-index kind. Estimate ~20–25 dev-days (kind + NTA sourcing, dominant
TUC mechanism only). See [`ITALY-MASTER-DATA-SOURCE-STUDY.md §B.1`](../findings/ITALY-MASTER-DATA-SOURCE-STUDY.md)
and [`ITALY-HEIGHT-ENVELOPE-STUDY.md §4`](../findings/ITALY-HEIGHT-ENVELOPE-STUDY.md).

**Related:** [`../ITALY-GEOSPATIAL-DATA-INVENTORY.md`](../ITALY-GEOSPATIAL-DATA-INVENTORY.md) ·
[`../regions/README.md`](../regions/README.md).
