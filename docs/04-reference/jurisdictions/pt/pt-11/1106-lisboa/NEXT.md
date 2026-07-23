# NEXT — Lisboa (`pt-11 / 1106-lisboa`)

> Last updated: 2026-07-23 · Maintainer: UNASSIGNED · Status: RESEARCH STUB

## 1 — WHERE WE STOPPED

Legal structure characterised at country level. Lisboa is identified as the most complex Portuguese
city (créditos de construção, seismic overlay, Lisbon CML 3D model licence uncertainty). The
cadastral-regime question (CGPR / SiNErGIC / no-cadastre) is the single unresolved prerequisite.
No SNIT probe, no PDM text read, no live endpoint verification.

## 2 — THE NUMBER

**0%** of Lisbon parcel clicks get a full envelope. Denominator: any Lisbon parcel — all zero.

## 3 — BLOCKERS

### B1 — Cadastral regime unconfirmed (P0 — gates everything)
- **Resume step:** Query DGT SNIC for Lisboa DICOFRE 1106. Confirm CGPR, SiNErGIC, or no-cadastre.
  If no-cadastre: Lisbon has no queryable parcel geometry nationally → C57 §1.5 draw fallback is the
  only path, or explore CML's own cadastral data.

### B2 — Créditos de construção requires a new C58 overlay type
- Lisbon's Arts. 84/88/89 tradeable floor-area mechanism has no analogue in the current schema.
- **Resume step:** Read Arts. 84/88/89 of the Lisboa PDM incentives regulation. Draft a C58
  amendment for a `transferableRights` overlay type before authoring any Lisboa pack.

### B3 — Lisbon CML 3D model licence unverified
- **Resume step:** Navigate `geodados-cml.hub.arcgis.com`, read Terms of Use for the "Modelo
  Tridimensional" dataset. If terms are ambiguous, email CML data team for written confirmation.

### B4 — PDM revision in progress
- The current PDM is under revision. Any numeric values sourced from the current text may change.
- **Resume step:** Check SNIT for current PDM version and amendment date before sourcing values.

## 4 — TRIP-WIRES

- **If créditos de construção mechanism is added to C58** → Lisboa pack authoring is unblocked on
  the FAR side. Update this file and start pack.
- **If CML 3D model licence is confirmed open** → Lisbon becomes a Tier-A context city (LOD2/3).
  Update `pt/README.md §2.6` and `pt/topics/buildings-lod-height.md`.
- **If Carta Cadastral OGC API goes live (planned 2025)** → probe Lisbon coverage via the API.

## 5 — WHAT IS ALREADY BUILT

- Country-level legal structure: `pt/findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md §B.1`.
- 3D context data spike: `pt/PORTUGAL-CONTEXT-DEEP-DIVE.md`.

## 6 — VERIFIED SOURCES

None live-probed for Lisboa specifically. Country-level sources in `pt/sources/SOURCES.md`.

## 7 — DEAD ENDS

- Do NOT assume Lisbon's urban core is covered by CGPR — CGPR was rural-focused. Confirm.
- Do NOT treat créditos de construção as an ignorable overlay — it raises achievable FAR.

## 8 — THE SMALLEST NEXT STEP

Confirm Lisboa's cadastral regime (0.25 dev-days). Then read PDM Arts. 84/88/89 for créditos
de construção scope (0.5 dev-days). Then probe SNIT WFS for Lisboa zone layer attributes (0.5 d).
