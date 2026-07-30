# Philadelphia — City Atlas STUB (`us/CITIES/PHILADELPHIA.md`)

**State:** Pennsylvania (`us-pa`) · **Adapter family:** `Philly*Provider` · **Routing key:** OPA account
**Status:** `unprobed` · **Readiness:** 9.0 (CONVERGENT-SECONDARY · not probed)
**Last updated:** 2026-07-30 · **No RATE % cell is asserted here.**

> STUB. Tier-1 city — full doc pending live probe. Consolidated city-county; strong open-data
> (OpenDataPhilly). Multi-source join. See [`../USA.md`](../USA.md) and [`./README.md`](./README.md). Wave 2.

## Tier-1 readiness (CONVERGENT-SECONDARY · unprobed)
| Layer | Expected source | Status | Confidence |
|---|---|---|---|
| Parcel geometry | OpenDataPhilly / OPA (account) | `unprobed` | CONVERGENT-SECONDARY |
| Zoning district | Philadelphia zoning GIS + Zoning Code | `unprobed` | CONVERGENT-SECONDARY |
| FAR / height | Philadelphia Zoning Code (per base district) | `unprobed` | CONVERGENT-SECONDARY |
| Building footprint + height | City GIS / Microsoft footprints + LiDAR | `unprobed` | CONVERGENT-SECONDARY |
| Terrain | USGS 3DEP | `unprobed` | CONVERGENT-SECONDARY |

## Adapter (target)
`PhillyParcelProvider` · `PhillyZoningProvider` · `PhillyEnvelopeProvider` (per-city rule pack).
Note: OPA account is the assessor join key; verify zoning GIS numeric attributes.

## Pending-probe checklist
- [ ] OpenDataPhilly parcel REST endpoint probed live
- [ ] Zoning GIS numeric FAR/height vs code-only
- [ ] LiDAR / 3DEP tile availability confirmed

**Honesty:** everything above is CONVERGENT-SECONDARY (not probed). "Unprobed" ≠ "no data."
