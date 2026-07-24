# Antwerp (`ant-antwerp`) — per-field sources

**Status:** OPEN — no pack values verified. DSI/GRB WFS robots-blocked; no GetFeature run for any Antwerp parcel.

> **Trust gate:** a field with NO citable source stays `null` in the pack.

## A — VERIFIED (research-cited; none live-probed for this specific city)

| Field (pack key) | Value | Unit | Governing article | Document | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| Flanders planning code | VCRO (Vlaamse Codex Ruimtelijke Ordening), codified 2009 | — | VCRO | VCRO current consolidated text | `codex.vlaanderen.be` | `published` |
| Discretionary test | *Goede ruimtelijke ordening* — VCRO Art. 4.3.1; applies to every permit including inside a RUP | — | VCRO Art. 4.3.1 | VCRO Art. 4.3.1 | `codex.vlaanderen.be` | `published` |
| "Clichering" nullification | VCRO Art. 7.4.2/2 — percentage-based RUP provisions adopted post-1 September 2009 are void | — | VCRO Art. 7.4.2/2 | VCRO Art. 7.4.2/2 | `codex.vlaanderen.be` | `published` |
| Gewestplan legal status | Gewestplannen (1970s–80s) still legally relevant where not superseded by a RUP; RUPs increasingly replace them | — | VCRO transitional provisions | Research finding | — | `published` |
| DSI WFS layers | `lu:lu_si_gv` (plan-element footprints + voorschriften links), `lu:lu_gewrup_*`, `lu:lu_prorup_*`, `lu:lu_hov_*` (nullification tracking) | — | Informatie Vlaanderen / VCRO | Cached capabilities from search-engine | `geoservices.informatievlaanderen.be` | `corroborated` — robots-blocked; confirmed via cache |
| DSI WFS licence | "kosteloos" (free of charge) | — | Informatie Vlaanderen open-data policy | Cached `AccessConstraints` field | `informatievlaanderen.be` | `corroborated` — via cache |
| Heritage WFS (Onroerend Erfgoed) | `geo.onroerenderfgoed.be/geoserver/wfs` | — | Onroerenderfgoeddecreet | WFS GetCapabilities | `geo.onroerenderfgoed.be` | `VERIFIED-LIVE` 2026-07-24 |
| Flanders LOD1 buildings | `3D GRB — Gebouw LOD1 DHMV II` — block model with ridge-height reference from DHMV II | — | Informatie Vlaanderen / AGIV | GRB product documentation | `informatievlaanderen.be` | `stated` — confirmed by name and method; direct WFS robots-blocked |
| Antwerp DHMV I gap status | Antwerp is NOT in the 13 DHMV I centrumsteden gap list — full DHMV-II-based coverage expected | — | DHMV I gap list (Informatie Vlaanderen) | DHMV product documentation | `vlaanderen.be/digitaal-hoogtemodel-dhmv` | `stated` — gap list confirmed; Antwerp absence confirmed from named list |

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it |
|---|---|---|
| Gewestplan vs RUP coverage for any Antwerp parcel | DSI WFS robots-blocked; no GetFeature run | Probe `mercator.vlaanderen.be`; then GetFeature for Antwerp parcel centroid against `lu:lu_si_gv` |
| Any RUP voorschriften text for any Antwerp zone | No voorschriften PDF read | From GetFeature response: extract PDF URL; download and read for height/GVR provisions |
| Whether any Antwerp RUP states a numeric height ceiling | Unknown until voorschriften read | Same as above |
| Art. 7.4.2/2 applicability for any specific Antwerp RUP provision | RUP adoption date and provision type unknown | Confirm RUP adoption date + provision form from voorschriften text |
| Gemeentelijke stedenbouwkundige verordening (Antwerp municipal building ordinance) | Not confirmed in this pass | Check Antwerp municipality's official publications for a "stedenbouwkundige verordening" |
| Fraction of Antwerp parcels covered by a RUP vs. gewestplan only | Not measured | Grid-sample probe across Antwerp bbox classifying RUP coverage vs. gewestplan-only |
| Any height, GVR, or setback value for any Antwerp parcel | No primary source read | Run full instrument cascade for a test parcel |
