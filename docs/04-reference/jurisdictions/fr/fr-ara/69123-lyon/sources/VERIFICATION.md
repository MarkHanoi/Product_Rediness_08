# Lyon Métropole (69123) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No live endpoint probed. No numeric value verified.

## Minimum checks before the outer-communes pack ships

| Check | Against | Verdict |
|---|---|---|
| `HBCPRINC`/`PLAFOND` present in national GPU WFS response for a Lyon parcel | Live WFS `GetFeature` — see `../NEXT.md §1` | ⬜ pending |
| Numeric `HBCPRINC` value matches PLU-H règlement text for same zone | Cross-check GIS attribute value against PLU-H article for one zone (e.g., `UA1`) | ⬜ pending |
| `data.grandlyon.com` licence confirmed permitting commercial ingestion | Terms of service or licence header on WFS response | ⬜ pending (only required if national GPU WFS does not carry the fields) |

## Minimum checks before Lyon/Villeurbanne pack ships (separate milestone)

| Check | Against | Verdict |
|---|---|---|
| Périmètres de hauteurs de façades layer located | `data.grandlyon.com` WFS capabilities | ⬜ pending |
| Sample height value from overlay confirmed against PLU-H text | Overlay attribute vs. règlement article | ⬜ pending |

## Caveats visible in the product

- **PLU-H covers 58 communes:** the pack's scope boundary must be the full Métropole de Lyon perimeter, not just the commune of Lyon (75056). A parcel in any of the 58 communes routes to the same PLU-H document.
- **Lyon/Villeurbanne height-overlay:** a result produced for a Lyon or Villeurbanne parcel without the overlay join is incorrect even if the base zone attribute lookup is correct. The two steps must be gated.

**Sign-off:** OPEN — pending verifier signature.
