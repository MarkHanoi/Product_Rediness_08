# Seattle — City Atlas STUB (`us/CITIES/SEATTLE.md`)

**State:** Washington (`us-wa`) · **Adapter family:** `Seattle*Provider` · **Routing key:** parcel PIN
**Status:** `unprobed` · **Readiness:** 9.5 (CONVERGENT-SECONDARY · not probed)
**Last updated:** 2026-07-30 · **No RATE % cell is asserted here.**

> STUB. Tier-1 city — full doc pending live probe of its parcel + zoning + LiDAR open data.
> See [`../USA.md`](../USA.md) for the city-scoped adapter architecture and [`./README.md`](./README.md)
> for the ranking + waves. Wave 1.

## Tier-1 readiness (CONVERGENT-SECONDARY · unprobed)
| Layer | Expected source | Status | Confidence |
|---|---|---|---|
| Parcel geometry | King County / Seattle GIS (parcel PIN) | `unprobed` | CONVERGENT-SECONDARY |
| Zoning district | Seattle zoning GIS + Land Use Code | `unprobed` | CONVERGENT-SECONDARY |
| FAR / height | Seattle Land Use Code (per-zone) | `unprobed` | CONVERGENT-SECONDARY |
| Building footprint + height | City GIS / Microsoft footprints + LiDAR | `unprobed` | CONVERGENT-SECONDARY |
| Terrain | City LiDAR → USGS 3DEP fallback | `unprobed` | CONVERGENT-SECONDARY |

## Adapter (target)
`SeattleParcelProvider` · `SeattleZoningProvider` · `SeattleEnvelopeProvider` (per-city rule pack).
Integration note: likely requires JOINing parcel-GIS + assessor + zoning-GIS + zoning-text (unlike NYC's single MapPLUTO).

## Pending-probe checklist
- [ ] King County / Seattle parcel REST endpoint probed live
- [ ] Zoning GIS numeric attributes vs code-only
- [ ] LiDAR tile availability confirmed

**Honesty:** everything above is CONVERGENT-SECONDARY (not probed). "Unprobed" ≠ "no data."
