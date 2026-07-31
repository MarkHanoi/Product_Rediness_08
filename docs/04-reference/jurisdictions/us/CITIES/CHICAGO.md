# Chicago — City Atlas STUB (`us/CITIES/CHICAGO.md`)

**State:** Illinois (`us-il`) · **FIPS place:** 1714000 · **Adapter family:** `Chicago*Provider` · **Routing key:** PIN
**Status:** `unprobed` · **Readiness:** 9.0 (CONVERGENT-SECONDARY · not probed)
**Last updated:** 2026-07-30 · **No RATE % cell is asserted here.**

> STUB. Tier-1 city — full doc pending live probe. Strong open-data (`data.cityofchicago.org`),
> multi-source join. See [`../USA.md`](../USA.md) and [`./README.md`](./README.md). Wave 2.
> A **scored dossier** already exists at [`../us-il/1714000-chicago/`](../us-il/1714000-chicago/README.md)
> (this atlas does not edit it).

## Tier-1 readiness (CONVERGENT-SECONDARY · unprobed)
| Layer | Expected source | Status | Confidence |
|---|---|---|---|
| Parcel geometry | Cook County / Chicago Open Data (PIN) | `unprobed` | CONVERGENT-SECONDARY |
| Zoning district | Chicago zoning GIS + Zoning Ordinance | `unprobed` | CONVERGENT-SECONDARY |
| FAR / height | Chicago Zoning Ordinance (FAR-based, per-district) | `unprobed` | CONVERGENT-SECONDARY |
| Building footprint + height | City GIS / Microsoft footprints + Overture/3DEP | `unprobed` | CONVERGENT-SECONDARY |
| Terrain | USGS 3DEP (pilot coverage noted) | `unprobed` | CONVERGENT-SECONDARY |

## Adapter (target)
`ChicagoParcelProvider` · `ChicagoZoningProvider` · `ChicagoEnvelopeProvider` (per-city rule pack).
Note: probe whether the Chicago zoning attribute table carries numeric FAR/height or district code only.

> **BUILT (2026-07-31, L-650 Phase-4): `ChicagoParcelProvider` → `wired-pending-probe`.**
> `packages/site-parcel-data/src/parcelProviders/chicagoParcelProvider.ts` — `isInChicago` bbox
> predicate + `fetchParcelAtPoint` (injected-fetch, never throws, OTel span) parsing a Cook County
> parcel feature (ArcGIS Esri-JSON **or** GeoJSON/Socrata) → **14-digit PIN + WGS84 ring + shoelace
> area**, with an OPTIONAL DRAFT zoning-district code (Title 17) folded in only when the proxy joins
> `data.cityofchicago.org` `5s3e-9pji` (code-only; `far`/`maxHeightM` stay null). CRS guard refuses
> a State-Plane ring; confidence HIGH on PIN + point-in-lot. 30 unit tests green; typecheck +
> `check:isolation` clean. Registry wiring (`isInChicago→chicago-cook`) + a live endpoint probe are
> the orchestrator's follow-up — the provider leaves a `// TODO(orchestrator)` note and does NOT edit
> `parcelProviders/registry.ts`. Moves no RATE % cell.

## Pending-probe checklist
- [ ] Cook County / Chicago parcel REST endpoint probed live (`ChicagoParcelProvider` carries a `// PROBE:` marker on the Cook County FeatureServer path + PIN field)
- [ ] Zoning attribute table numeric FAR/height vs code-only (field name of the `5s3e-9pji` companion layer)
- [ ] Overture/3DEP height coverage confirmed
- [ ] Orchestrator registers `isInChicago→chicago-cook` in `parcelProviders/registry.ts`

**Honesty:** everything above is CONVERGENT-SECONDARY (not probed). "Unprobed" ≠ "no data."
