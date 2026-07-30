# Torino — Phase-1 Pilot Stub

**ISTAT:** `001272` · **Region:** Piemonte (`it-pie`, ISO IT-21) · **Instrument:** **PRG**
(Piano Regolatore Generale) · **Height coverage:** ★★★★ (ARPA Piemonte Edifici 3D, region-wide) ·
**Priority:** ★★★★★ (Phase 1; **cheapest engine if PRG confirmed**) · **Confidence:**
`CONVERGENT-SECONDARY`.

> Envelope stub only — the implemented RATE dossier is at
> [`../it-pie/001272-turin/`](../it-pie/001272-turin/README.md) and its
> [`RATE.md`](../it-pie/001272-turin/RATE.md). **This stub links; it does not edit those.**

## Planning mechanism
- **PRG** (classic 1942-law instrument) — Piemonte kept the PRG name, and *plausibly* the classic
  **DM 1444 zone-letter** mechanism with numeric tables. If confirmed, this is a **config kind**
  (zone-letter table), not a new engine kind — the cheapest first Italian city.
- ⚠ **Moving target:** Turin's PRG is being rewritten in 2026 (regime di salvaguardia after DCC 123,
  16 Mar 2026; ~260→~80 pages). Any estimate must check whether the *incoming* plan keeps zone letters.

## Data
- **Parcels:** national `ItalyCatastoProvider` (Agenzia Entrate, VERIFIED-LIVE; Turin = ISTAT `L219`).
- **Heights:** **ARPA Piemonte Edifici 3D** (BDTRE-derived) → `heightProvider: piemonte_arpa` — the
  closest Italian analogue to a structured on-the-map height attribute; height field name TBD.
- **Envelope rules:** Piemonte PRG mosaic WMS (uneven currency) + Comune di Torino PRG NTA.

## Envelope-pack status
NOT STARTED — ~10–15 dev-days **contingent** on confirming the current/incoming PRG NTA still uses
zone letters + numeric tables. See [`ITALY-MASTER-DATA-SOURCE-STUDY.md §B.3 / §D.8`](../findings/ITALY-MASTER-DATA-SOURCE-STUDY.md).

**Related:** [`../ITALY-GEOSPATIAL-DATA-INVENTORY.md`](../ITALY-GEOSPATIAL-DATA-INVENTORY.md) ·
[`../regions/README.md`](../regions/README.md).
