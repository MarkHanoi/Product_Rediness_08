# Portland — City Atlas STUB (`us/CITIES/PORTLAND.md`)

**State:** Oregon (`us-or`) · **Adapter family:** `Portland*Provider` · **Routing key:** taxlot id
**Status:** `unprobed` · **Readiness:** 9.5 (CONVERGENT-SECONDARY · not probed)
**Last updated:** 2026-07-30 · **No RATE % cell is asserted here.**

> STUB. Tier-1 — full doc pending live probe. Portland has strong zoning GIS and the regional
> **Metro RLIS** data programme. See [`../USA.md`](../USA.md) and [`./README.md`](./README.md). Wave 2.

## Tier-1 readiness (CONVERGENT-SECONDARY · unprobed)
| Layer | Expected source | Status | Confidence |
|---|---|---|---|
| Parcel geometry | Metro RLIS / PortlandMaps (taxlot) | `unprobed` | CONVERGENT-SECONDARY |
| Zoning district | Portland Zoning Code (Title 33) + GIS | `unprobed` | CONVERGENT-SECONDARY |
| FAR / height | Title 33 base-zone FAR + height (per district) | `unprobed` | CONVERGENT-SECONDARY |
| Building footprint + height | City/Metro GIS + LiDAR | `unprobed` | CONVERGENT-SECONDARY |
| Terrain | Oregon DOGAMI LiDAR → USGS 3DEP fallback | `unprobed` | CONVERGENT-SECONDARY |

## Adapter (target)
`PortlandParcelProvider` · `PortlandZoningProvider` · `PortlandEnvelopeProvider` (per-city rule pack).
Note: Oregon statewide planning (SB100 / UGB) shapes context; the parcel envelope source is Title 33.

## Pending-probe checklist
- [ ] Metro RLIS / PortlandMaps parcel REST endpoint probed live
- [ ] Title 33 zoning numeric FAR/height vs code-only
- [ ] DOGAMI / 3DEP LiDAR tile availability confirmed

**Honesty:** everything above is CONVERGENT-SECONDARY (not probed). "Unprobed" ≠ "no data."
