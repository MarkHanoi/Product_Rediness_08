# Norway — regions (fylker → kommuner)

Norway's planning data is held **per kommune** (357 kommuner, each with their own planregister WFS
on the shared SOSI Plan schema). The administrative hierarchy is:

```
Norway (national — Kartverket)
  └── Fylke (15 fylker, ISO 3166-2 no-XX) — not a planning authority; no Land-equivalent planning layer
        └── Kommune (357 kommuner) — the actual plan-holding authority and data delivery point
```

## How to route

Route by which kommune polygon the parcel geometry falls into (from the Matrikkelen parcel's
`kommunenummer` attribute, 4-digit, leading zero), then hand off to that kommune's planregister WFS
endpoint. The kommune code is authoritative; the fylke is only used for folder naming here.

## Key difference from Germany

Germany routes to 16 separate Länder, each with their own data model (ALKIS, XPlanung delivery
platform). Norway routes to 357 kommuner, but they all share **one SOSI Plan schema** — the reader
is the same across every endpoint, only the URL changes. Build one generic SOSI Plan planregister
reader, parameterise the endpoint URL per kommune.

## Fylker studied

| Fylke | ISO 3166-2 | Kommuner studied | Folder |
|---|---|---|---|
| Oslo | `no-03` | Oslo (0301) | `no-03/0301-oslo/` |
| Vestland | `no-46` | Bergen (4601) | `no-46/4601-bergen/` |
| Trøndelag | `no-50` | Trondheim (5001) | `no-50/5001-trondheim/` |

## National layers (common to all — no regional routing needed)

| Layer | Source | Routing |
|---|---|---|
| Parcel geometry | Matrikkelen Eiendomskart Teig WFS | **Single national endpoint** — no regional routing |
| Building points | Matrikkelen Bygningspunkt | Single national endpoint |
| Terrain (DTM/DSM) | NDH / høydedata.no | Single national product — tile by bbox |
| Heritage (public) | Kulturminnesøk.no | Single national source |
| Plan data model | SOSI Plan (schema only) | National schema; per-kommune delivery |
