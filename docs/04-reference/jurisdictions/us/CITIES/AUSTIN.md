# Austin — City Atlas STUB (`us/CITIES/AUSTIN.md`)

**State:** Texas (`us-tx`) · **Adapter family:** `Austin*Provider` · **Routing key:** TCAD id
**Status:** `unprobed` · **Readiness:** 9.0 (CONVERGENT-SECONDARY · not probed)
**Last updated:** 2026-07-30 · **No RATE % cell is asserted here.**

> STUB. Tier-1 city — full doc pending live probe. Strong open-data; requires assessor (TCAD)
> join. See [`../USA.md`](../USA.md) and [`./README.md`](./README.md). Wave 1.

## Tier-1 readiness (CONVERGENT-SECONDARY · unprobed)
| Layer | Expected source | Status | Confidence |
|---|---|---|---|
| Parcel geometry | Travis CAD (TCAD) / Austin Open Data | `unprobed` | CONVERGENT-SECONDARY |
| Zoning district | Austin Land Development Code + GIS | `unprobed` | CONVERGENT-SECONDARY |
| FAR / height | Austin LDC (per base zone; overlays common) | `unprobed` | CONVERGENT-SECONDARY |
| Building footprint + height | City GIS / Microsoft footprints + LiDAR | `unprobed` | CONVERGENT-SECONDARY |
| Terrain | USGS 3DEP | `unprobed` | CONVERGENT-SECONDARY |

## Adapter (target)
`AustinParcelProvider` · `AustinZoningProvider` · `AustinEnvelopeProvider` (per-city rule pack).
Note: Texas has no statewide zoning enabling for counties; Austin's LDC + overlays are the source.

## Pending-probe checklist
- [ ] TCAD / Austin parcel REST endpoint probed live
- [ ] LDC zoning numeric fields vs code-only
- [ ] Overlay/PUD incidence checked

**Honesty:** everything above is CONVERGENT-SECONDARY (not probed). "Unprobed" ≠ "no data."
