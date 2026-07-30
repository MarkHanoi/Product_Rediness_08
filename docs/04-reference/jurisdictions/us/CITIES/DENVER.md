# Denver — City Atlas STUB (`us/CITIES/DENVER.md`)

**State:** Colorado (`us-co`) · **Adapter family:** `Denver*Provider` · **Routing key:** schednum
**Status:** `unprobed` · **Readiness:** 9.5 (CONVERGENT-SECONDARY · not probed)
**Last updated:** 2026-07-30 · **No RATE % cell is asserted here.**

> STUB. Tier-1 city — full doc pending live probe. Denver is a consolidated city-county with a
> strong open-data portal. See [`../USA.md`](../USA.md) and [`./README.md`](./README.md). Wave 2.

## Tier-1 readiness (CONVERGENT-SECONDARY · unprobed)
| Layer | Expected source | Status | Confidence |
|---|---|---|---|
| Parcel geometry | Denver Open Data (schednum) | `unprobed` | CONVERGENT-SECONDARY |
| Zoning district | Denver Zoning Code + GIS | `unprobed` | CONVERGENT-SECONDARY |
| FAR / height | Denver Zoning Code (form-based, per-zone) | `unprobed` | CONVERGENT-SECONDARY |
| Building footprint + height | City GIS + LiDAR | `unprobed` | CONVERGENT-SECONDARY |
| Terrain | USGS 3DEP | `unprobed` | CONVERGENT-SECONDARY |

## Adapter (target)
`DenverParcelProvider` · `DenverZoningProvider` · `DenverEnvelopeProvider` (per-city rule pack).
Note: Denver's form-based zoning code encodes height/form per district — probe how automatable.

## Pending-probe checklist
- [ ] Denver Open Data parcel REST endpoint probed live
- [ ] Form-based zoning numeric fields vs code-only
- [ ] LiDAR / 3DEP tile availability confirmed

**Honesty:** everything above is CONVERGENT-SECONDARY (not probed). "Unprobed" ≠ "no data."
