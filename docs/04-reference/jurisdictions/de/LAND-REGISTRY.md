# Germany — 16-Land Registry (technical authority matrix)

**Level:** country → Land · **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED ·
**Status:** RESEARCH MATRIX — probe-gated

> **Confidence banner (§CONTEXT-DATA-HONESTY):** every cell is **CONVERGENT-SECONDARY**
> (multi-source, unprobed) **EXCEPT** the one cell explicitly flagged **VERIFIED-LIVE**:
> **NRW LoD2** (`opengeodata.nrw.de`, probed 2026-07-24). Endpoints/licence/auth/CRS/formats
> genuinely differ per Land and MUST be probed before any cell gates production or moves a RATE
> cell. Empty and failed are the same value.

The Land is the **technical** authority (cadastre, terrain, imagery, buildings). The buildable
**envelope** is a municipal matter — see `CITIES/` and the per-city RATE dossiers. Per-Land
technical detail lives in `LANDS/<LAND>.md`.

Status legend: **VERIFIED-LIVE** (probed) · **open (convergent)** (research-confirmed free, unprobed)
· **TBD** (openness unconfirmed) · **unprobed** (not yet investigated).

---

## The matrix

| # | Land | ISO | ALKIS endpoint (CONVERGENT-SECONDARY) | Ortho (DOP) | Terrain (DGM) | LoD2 open? | Licence | CRS | Impl status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Baden-Württemberg** | de-bw | LGL-BW geoportal WFS | DOP20 | DGM1 LiDAR | **open (convergent)** | DL-DE BY / CC-BY | 25832 | open (convergent) |
| 2 | **Bayern** | de-by | `geodaten.bayern.de` (Bayerische Vermessungsverwaltung) | DOP20/40 | DGM1 | **TBD** (ZSHH host ≠ confirmed open) | TBD (fee/registration?) | 25832 | TBD — probe licence |
| 3 | **Berlin** | de-be | GDI-BE / FIS-Broker (`gdi.berlin.de`, `fbinter.stadt-berlin.de`) | DOP20 | DGM1 | **open (convergent)** — FIS-Broker | DL-DE BY 2.0 (GDI-BE) | 25833 | open (convergent) |
| 4 | **Brandenburg** | de-bb | GDI-BE (shared with Berlin) | DOP20 | DGM1 | open (convergent) | DL-DE BY 2.0 | 25833 | unprobed |
| 5 | **Bremen** | de-hb | Geoportal Bremen WFS | DOP20 | DGM1 | unprobed | DL-DE (TBD) | 25832 | unprobed |
| 6 | **Hamburg** | de-hh | `geodienste.hamburg.de` (HH_WFS_ALKIS) | DOP20 | DGM1 | **TBD** (Transparenzportal) | DL-DE BY 2.0 (reported) | 25832 | TBD — probe auth |
| 7 | **Hessen** | de-he | HVBG / Geoportal Hessen WFS | DOP20 | DGM1 | unprobed | DL-DE (TBD) | 25832 | unprobed |
| 8 | **Mecklenburg-Vorpommern** | de-mv | GAIA-MV / LAiV-MV WFS | DOP20 | DGM1 | unprobed | DL-DE (TBD) | 25833 | unprobed |
| 9 | **Niedersachsen** | de-ni | LGLN geoportal WFS | DOP20 | DGM1 | unprobed | DL-DE (TBD) | 25832 | unprobed |
| 10 | **Nordrhein-Westfalen (NRW)** | de-nw | `opengeodata.nrw.de` / GDI-NW (OGC API Features / WFS / REST / I3S / WMS) | DOP10 | DGM1 LiDAR | ✅ **VERIFIED-LIVE** (`opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/`, 2026-07-24) | **DL-DE Zero 2.0** | **25832** | **VERIFIED-LIVE — wire-first anchor** |
| 11 | **Rheinland-Pfalz** | de-rp | LVermGeo RP WFS | DOP20 | DGM1 | unprobed | DL-DE (TBD) | 25832 | unprobed |
| 12 | **Saarland** | de-sl | Geoportal Saarland WFS | DOP20 | DGM1 | unprobed | DL-DE (TBD) | 25832 | unprobed |
| 13 | **Sachsen** | de-sn | GeoSN / `geoportal.sachsen.de` WFS | DOP20 | DGM1 | unprobed | DL-DE (TBD) | 25833 | unprobed |
| 14 | **Sachsen-Anhalt** | de-st | LVermGeo ST WFS | DOP20 | DGM1 | **open (convergent)** — free direct download | DL-DE (reported open) | 25832 | open (convergent) |
| 15 | **Schleswig-Holstein** | de-sh | `gdi-sh.de` WFS | DOP20 | DGM1 | unprobed | DL-DE (TBD) | 25832 | unprobed |
| 16 | **Thüringen** | de-th | TLBG / Geoportal Thüringen WFS | DOP20 | DGM1 | unprobed | DL-DE (TBD) | 25832 | unprobed |

> All endpoint names, DOP/DGM availability, LoD2 openness, licence, and CRS values above are
> **CONVERGENT-SECONDARY** and MUST be probed against the Land's official geoportal before wiring —
> **except NRW's LoD2 "open?" cell, which is VERIFIED-LIVE.** CRS follows the ~12°E UTM32/33 split
> (see `GERMANY.md §4`); the split is not sharp and several Länder straddle it — confirm the
> service's declared CRS on probe.

---

## Readiness / onboarding order (reviewer estimate — PROBE to confirm)

Reviewer's per-Land readiness estimates (excluding the municipal envelope, which is ~2/10
everywhere because it is legal, not technical):

| Land | Readiness (est.) | Rationale |
|---|---|---|
| **NRW** | 9.6 | everything open (OGC API / REST / 3D / LoD2 / LiDAR / flood / parcels) — the German "Barcelona" |
| Hamburg | 9.5 | full XPlanung migration; city-state; ALKIS auth TBD |
| Berlin | 9.4 | GDI-BE open; FIS-Broker LoD2; 4 legal regimes (envelope side) |
| Bayern | 9.2 | rich data; LoD2/ALKIS licence TBD |
| Baden-Württemberg | 9.1 | LoD2 + DGM1 open (convergent) |
| … remaining Länder | — | unprobed; standards consistent, services vary |

**Onboarding order:** NRW → Berlin / Hamburg (★★★★★ easy) → Bayern / BW / Hessen (medium) → rest.
**NRW is the wire-first Land** — the only VERIFIED-LIVE LoD2 anchor.

> Readiness scores are the reviewer's estimates (CONVERGENT-SECONDARY). Do NOT populate them as
> VERIFIED without probing the Land. RATE rises only on probe + wire.

---

## Per-Land detail files

`LANDS/NORDRHEIN-WESTFALEN.md` (fullest, VERIFIED-LIVE anchor) · `LANDS/BERLIN.md` ·
`LANDS/BAYERN.md` · plus 13 scaffold stubs (`status: unprobed, see LAND-REGISTRY`).

---

*Confidence: CONVERGENT-SECONDARY throughout, except NRW LoD2 = VERIFIED-LIVE. Extends the three
founder studies of 2026-07-30. No RATE cell moves on an unprobed row.*
