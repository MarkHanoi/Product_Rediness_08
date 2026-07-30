# Boston — City Atlas STUB (`us/CITIES/BOSTON.md`)

**State:** Massachusetts (`us-ma`) · **Adapter family:** `Boston*Provider` · **Routing key:** parcel-id
**Status:** `unprobed` · **Readiness:** 9.0 (CONVERGENT-SECONDARY · not probed)
**Last updated:** 2026-07-30 · **No RATE % cell is asserted here.**

> STUB. Tier-1 city — full doc pending live probe. Boston has good open-data but requires a
> multi-source JOIN (parcel-GIS + assessor + zoning-GIS + zoning-text). See [`../USA.md`](../USA.md)
> and [`./README.md`](./README.md). Wave 1.

## Tier-1 readiness (CONVERGENT-SECONDARY · unprobed)
| Layer | Expected source | Status | Confidence |
|---|---|---|---|
| Parcel geometry | Boston Open Data / Assessing (parcel-id) | `unprobed` | CONVERGENT-SECONDARY |
| Zoning district | BPDA / Zoning Code (Article-based) + GIS | `unprobed` | CONVERGENT-SECONDARY |
| FAR / height | Boston Zoning Code Articles (per-district) | `unprobed` | CONVERGENT-SECONDARY |
| Building footprint + height | City GIS / Microsoft footprints + LiDAR | `unprobed` | CONVERGENT-SECONDARY |
| Terrain | USGS 3DEP | `unprobed` | CONVERGENT-SECONDARY |

## Adapter (target)
`BostonParcelProvider` · `BostonZoningProvider` · `BostonEnvelopeProvider` (per-city rule pack).
Note: Boston zoning is Article-based text + Planned Development Areas — heavy text interpretation.

## Pending-probe checklist
- [ ] Boston parcel REST endpoint probed live
- [ ] Zoning GIS ↔ Article-text join feasibility
- [ ] FEMA SFHA incidence (waterfront) checked

**Honesty:** everything above is CONVERGENT-SECONDARY (not probed). "Unprobed" ≠ "no data."
