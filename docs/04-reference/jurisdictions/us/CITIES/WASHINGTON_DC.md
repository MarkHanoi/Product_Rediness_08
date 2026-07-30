# Washington DC — City Atlas STUB (`us/CITIES/WASHINGTON_DC.md`)

**District:** District of Columbia (`us-dc`) · **Adapter family:** `DC*Provider` · **Routing key:** SSL (Square-Suffix-Lot)
**Status:** `unprobed` · **Readiness:** 9.5 (CONVERGENT-SECONDARY · not probed)
**Last updated:** 2026-07-30 · **No RATE % cell is asserted here.**

> STUB. Tier-1 — full doc pending live probe. DC is a consolidated federal district with
> excellent open-data (OCTO / opendata.dc.gov) and a distinctive federal **Height of Buildings
> Act** cap. See [`../USA.md`](../USA.md) and [`./README.md`](./README.md). Wave 2.

## Tier-1 readiness (CONVERGENT-SECONDARY · unprobed)
| Layer | Expected source | Status | Confidence |
|---|---|---|---|
| Parcel geometry | OCTO / opendata.dc.gov (SSL) | `unprobed` | CONVERGENT-SECONDARY |
| Zoning district | DC Zoning Regulations (ZR16) + GIS | `unprobed` | CONVERGENT-SECONDARY |
| FAR / height | DC ZR16 (FAR) + federal Height of Buildings Act cap | `unprobed` | CONVERGENT-SECONDARY |
| Building footprint + height | OCTO GIS + LiDAR | `unprobed` | CONVERGENT-SECONDARY |
| Terrain | USGS 3DEP | `unprobed` | CONVERGENT-SECONDARY |

## Adapter (target)
`DCParcelProvider` · `DCZoningProvider` · `DCEnvelopeProvider` (per-city rule pack).
Note: the **Height of Buildings Act** is a hard federal height ceiling on top of ZR16 FAR —
model both; the height cap is unusually automatable.

## Pending-probe checklist
- [ ] opendata.dc.gov parcel (SSL) REST endpoint probed live
- [ ] ZR16 zoning numeric FAR/height vs code-only
- [ ] Height of Buildings Act cap encoded as a hard constraint

**Honesty:** everything above is CONVERGENT-SECONDARY (not probed). "Unprobed" ≠ "no data."
