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

## Pending-probe checklist
- [ ] Cook County / Chicago parcel REST endpoint probed live
- [ ] Zoning attribute table numeric FAR/height vs code-only
- [ ] Overture/3DEP height coverage confirmed

**Honesty:** everything above is CONVERGENT-SECONDARY (not probed). "Unprobed" ≠ "no data."
