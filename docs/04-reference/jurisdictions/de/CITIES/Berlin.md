# Berlin — municipal planning / envelope (city index)

**AGS:** `11000000` · **Land:** Berlin (city-state, `de-be`) · **Last updated:** 2026-07-30 ·
**Status:** index stub — the legal envelope work lives in the RATE dossier (linked below)

> **Confidence: CONVERGENT-SECONDARY** (the geospatial atlas). The **numeric envelope RATE work**
> for Berlin lives in the existing dossier `../de-be/11000-berlin/` — this file does NOT duplicate
> or edit it; it only indexes it from the federation atlas. No numeric GRZ/GFZ/Höhe value is
> verified for any Berlin parcel.

In the German model the **Land is the technical authority** (cadastre/terrain/imagery/buildings —
see `../LANDS/BERLIN.md`) and the **municipality is the legal authority** for the buildable
envelope. Berlin is a city-state, so both coincide here — but the two concerns stay in separate
files.

---

## Municipal planning summary (index — full detail in the RATE dossier)

- **Legal instrument:** Bebauungsplan (§30 BauGB) as the binding zoning plan; up to **four regimes**
  per parcel — (a) modern B-Plan, (b) 1958/60 Baunutzungsplan (§173(3) BBauG, Baustufen grading,
  judicial *funktionslos* voidance risk), (c) §34 unplanned interior (reasoned refusal), (d) §35
  outlying (not buildable). The regime classifier is the first engineering task.
- **Structured plan data:** XPlanung / XPlanGML via Berlin FIS-Broker; DiPlanung operational
  (as of 2026-07-23). GRZ/GFZ/Höhe attribute null-rate UNKNOWN — probe before ingestion.
- **Setbacks:** BauO Bln (Berliner Bauordnung) Abstandsflächen — read multiplier/minimum before
  authoring.
- **Zone taxonomy:** national BauNVO closed list (WA/MI/GE/MK…) with §17 GRZ/GFZ ceilings — see
  `../README.md §1.3`. §17 is an upper-bound sanity check, never a parcel default.

## Where the real work lives (do not duplicate)

| Concern | Canonical file |
|---|---|
| Envelope RATE + 4-regime analysis | `../de-be/11000-berlin/README.md` |
| Berlin envelope / height dossiers | `../de-be/11000-berlin/ENVELOPE.md`, `../de-be/11000-berlin/HEIGHT.md` |
| Berlin sources / verification | `../de-be/11000-berlin/sources/SOURCES.md` |
| Berlin next steps / probes | `../de-be/11000-berlin/NEXT.md` |
| Land technical profile (geodata) | `../LANDS/BERLIN.md` |

---

**Related:** `../GERMANY.md §6` (legal envelope layer) · `../GERMANY-GEOSPATIAL-DATA-INVENTORY.md`
(zone-precedence honesty model) · `../README.md §1` (national regime structure).
