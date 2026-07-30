# United Kingdom (`gb`) — Country Data Strategy

> The reusable data-ceiling reasoning for GB (C63 §5.2 slot; template `_TEMPLATE/COUNTRY-DATA-STRATEGY-TEMPLATE.md`).
> **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD.

## 1 — The one structural fact

GB planning is **discretionary**. The buildable envelope is decided case-by-case, not published as by-right
numeric fields. So the LEGISLATION + ENVELOPE axes have a **low structural ceiling** no ingestion can lift far —
distinct from the PHYSICAL-model axes (terrain, context, height), which are OGL-open and genuinely strong.

## 2 — Constituent-country fragmentation

Four planning systems + four geodata estates. **England** (EA LiDAR, Historic England, Planning Inspectorate) is
the one tackled today. **Scotland** (Scottish Remote Sensing Portal, HES), **Wales** (DataMapWales/NRW, Cadw), and
**Northern Ireland** (OpenDataNI/DAERA, HED) are **separate portals** — each needs its own terrain source row in
`terrain.mjs` before its cheap axes compute. Do not assume England endpoints answer for the other three.

## 3 — The data-ceiling ladder (what to reach for, in order)

1. **Terrain** — EA LIDAR Composite DTM 1 m (wired, live). Ceiling: verify + bake per city. Ports England-wide free.
2. **Context** — Geofabrik GB extracts → PMTiles (wired for London). Ports free per city.
3. **Height (LoD1)** — EA DSM−DTM nDSM derive (UNWIRED; the cheapest real win — reuse the DK/ES nDSM stamp).
4. **Parcel** — no keyless legal cadastre; HMLR INSPIRE index polygons (OGL) are the best free approximation.
5. **Legislation / Envelope** — structurally capped (discretionary); only Permitted Development Rights are by-right.

## 4 — What ports free vs what is human-gated

- **Ports free:** terrain, context, derivable heights (OGL v3 / ODbL, no key, England).
- **Human-gated / structurally capped:** legislation + envelope (discretionary, no national numeric source).
- **Licence-blocked (skip):** OS MasterMap parcels + OS Building Heights (commercial).

---
*Authority: C63 §5.2. Feeds: `COUNTRY-RATE.md`, `RATE-IMPLEMENTATION-PLAN.md`. Cross-ref `GEO-DATA-SOURCING-MASTER.md`.*
