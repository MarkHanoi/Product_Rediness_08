# NEXT — Germany (`de`)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** DORMANT — context-data spike
> only (`README.md`); the **legal/zoning layer (Bebauungsplan) is not started**.

## 1 — WHERE WE STOPPED
Context-data spike only. No parcel/zoning legal work. Germany's law is **per-Land** (16 Bundesländer),
so a region layer (`de-<subdiv>`, ISO 3166-2 e.g. `de-be` Berlin) will be needed the moment a
municipality is worked — **depth follows the law**.

## 2 — THE NUMBER
Zoning full-envelope resolution: **0% (not started).**

## 3 — BLOCKERS
### 3.1 — Legal/zoning layer not begun; 16-Land fragmentation
- Zoning = the municipal **Bebauungsplan**; increasingly standardised as **XPlanung / XPlanGML** and
  served through per-Land geoportals. **RESUME STEP.** Run P1 for one pilot Land: is the B-Plan
  published as XPlanGML (structured GML with GRZ/GFZ/height) or as a scanned Satzung? Classify
  `VERIFIED-LIVE` / `document` / `absent` per Land.
### 3.2 — Context endpoints unverified (`README.md`).

## 4 — TRIP-WIRES
- **4.1 — An XPlanGML reader that extracts GRZ/GFZ/Höhe** → reusable across every Land that publishes
  XPlanung; this is Germany's structural advantage over Spain — verify before assuming.
- **4.2 — The nDSM height module** → DE feeds the SAME module, different inputs.

## 5 — WHAT IS ALREADY BUILT
- The context-data spike analysis (`README.md`).

## 6 — VERIFIED SOURCES
None live-probed yet — leads only.

## 7 — DEAD ENDS
- (none recorded yet)

## 8 — THE SMALLEST NEXT STEP
Fetch one Bebauungsplan as XPlanGML from one Land's geoportal and check whether GRZ/GFZ/height are
structured fields. Add `de-<subdiv>/` + `<AGS>-<slug>/` only then.
