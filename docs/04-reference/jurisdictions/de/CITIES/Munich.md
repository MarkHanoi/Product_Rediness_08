# Munich (München) — municipal planning / envelope (city index)

**AGS:** `09162000` · **Land:** Bayern (`de-by`) · **Last updated:** 2026-07-30 ·
**Status:** index stub — the legal envelope work lives in the RATE dossier (linked below)

> **Confidence: CONVERGENT-SECONDARY** (the geospatial atlas). The **numeric envelope RATE work**
> for Munich lives in the existing dossier `../de-by/09162-munich/` — this file does NOT duplicate
> or edit it; it only indexes it from the federation atlas. No numeric GRZ/GFZ/Höhe value is
> verified for any Munich parcel.

In the German model the **Land is the technical authority** (Bayern — cadastre/terrain/imagery/
buildings, see `../LANDS/BAYERN.md`, LoD2/ALKIS licence TBD) and the **municipality is the legal
authority** for the buildable envelope.

---

## Municipal planning summary (index — full detail in the RATE dossier)

- **Legal instrument:** Bebauungsplan (§30 BauGB); §34 unplanned-interior fraction for München is
  assumed smaller than Berlin but **not measured** — a grid-sample probe is required before a
  dev-day budget.
- **Structured plan data:** XPlanung / XPlanGML; **DiPlanung mandatory statewide from 31 Oct 2026**
  (interim services until then; already operationally live 2026-07-23). GRZ/GFZ/Höhe null-rate
  UNKNOWN — probe.
- **Setbacks:** **BayBO Art. 6 Abstandsflächen** — setback 0.4H general / 0.2H in GE/GI zones,
  minimum 3 m (full text verified 2026-07-23 in the RATE dossier). Städtebauliche/Art. 81 Satzung
  may vary these.
- **Zone taxonomy:** national BauNVO closed list with §17 ceilings — see `../README.md §1.3`.
  §17 is a sanity ceiling, never a parcel default.

## Where the real work lives (do not duplicate)

| Concern | Canonical file |
|---|---|
| Envelope RATE + BayBO analysis | `../de-by/09162-munich/README.md` |
| Munich envelope / height dossiers | `../de-by/09162-munich/ENVELOPE.md`, `../de-by/09162-munich/HEIGHT.md` |
| Munich sources / verification | `../de-by/09162-munich/sources/SOURCES.md` |
| Munich next steps / probes | `../de-by/09162-munich/NEXT.md` |
| Land technical profile (geodata) | `../LANDS/BAYERN.md` |

---

**Related:** `../GERMANY.md §6` (legal envelope layer) · `../GERMANY-GEOSPATIAL-DATA-INVENTORY.md`
(zone-precedence honesty model) · `../README.md §1` (national regime structure).
