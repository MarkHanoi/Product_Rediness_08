# France (`fr`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: PARTIALLY VERIFIED — BD TOPO `hauteur` and GPU WFS live-probed 2026-07-23. Two checks resolved. Three remain pending (apicarto path change, LiDAR coverage, licence header).**

All entries in `SOURCES.md §A` are `corroborated` or `published` based on research synthesis (multiple consistent secondary sources and official documentation pages). They have NOT been verified against live API responses. The following steps are required before any field can be promoted to `certified`.

---

## What must be checked, against which document version

| Field | To verify against | Method | Verdict |
|---|---|---|---|
| BD TOPO `HAUTEUR` non-null for Paris buildings | Live WFS response from `data.geopf.fr/wfs` for a Paris bbox | Run the probe in NEXT.md §8; record field names and a sample `HAUTEUR` value | ✅ **VERIFIED 2026-07-23** — field name is lowercase `hauteur`; 5/5 features non-null in Paris 8th arr bbox; sample values 9.5m, 21m, 9.6m; endpoint `data.geopf.fr/wfs` with `apikey=essentiels`; HTTP 200 |
| GPU API returns zone code + PDF link for a Paris parcel | Live `apicarto.ign.fr/api/gpu` response | `GET /api/gpu/zone?lon=2.3470&lat=48.8530`; confirm `codezone`, `libelle`, `urlfic` fields present | ⚠ **BLOCKED 2026-07-23** — apicarto.ign.fr `/api/gpu/zone` and `/api/gpu/commune` return 404; API paths have changed. Use GPU WFS directly: `data.geopf.fr/annexes/ressources/wfs/gpu.xml` with `apikey=gpu`. Pending: re-probe correct apicarto paths via `/api/doc/gpu` swagger |
| GPU WFS returns zone code for a Lyon parcel; confirm presence/absence of `HBCPRINC`/`PLAFOND` | Live `data.geopf.fr/annexes/ressources/wfs/gpu.xml` response | WFS `GetFeature` for Lyon bbox; inspect all field names | ✅ **VERIFIED 2026-07-23 — NEGATIVE** — live probe of `wfs_du:zone_urba` for Lyon Confluence (BBOX 4.8240,45.7390,4.8350,45.7470) returned GML (338,262 chars). No `HBCPRINC` or `PLAFOND` in field schema. These fields are NOT on the national GPU WFS. Lyon height data is on `data.grandlyon.com` only (see Lyon SOURCES.md) |
| LiDAR HD coverage includes Paris, Lyon, Marseille tiles | `macarte.ign.fr` coverage map | Visual check + tile availability at a known coordinate for each city | ⬜ pending |
| Etalab 2.0 licence text on BD TOPO WFS response | Response `Content-License` header or metadata object | Inspect headers on a live WFS GetFeature response | ⬜ pending |

## What I could NOT confirm (and why it stays unshippable)

- **All numeric rule values (height, emprise au sol, retraits) for every French commune** — the primary source (each commune's PLU règlement PDF) has not been read for any French commune. No rule pack may ship until the relevant PDF is obtained via the GPU link, read verbatim, and the values are recorded in the municipality-level `sources/SOURCES.md` with the founder's L-449-style acceptance.
- **ABF perimeter layer structure in GPU** — not confirmed which SUP sub-type code covers ABF perimeters in the live API response. Any pack covering a city with classified monuments must resolve this before shipping.
- **Paris plan des hauteurs as GIS layer** — unknown. If it is PDF-only ("atlas des planches au 1/2000"), the Paris pack's graphic-overlay step requires digitizing, not an API call; this must be confirmed before the Paris ADR is written.

## Caveats that must remain visible in the product

- **Parcel boundaries are not survey-precise** (national property of the French cadastre). The displayed parcel outline is an imprecise graphic representation. This is a national caveat, not a data-quality issue with a specific commune.
- **Zone code ≠ uniform rule.** `UA` in one commune and `UA` in a neighbouring commune are different rules. Never display a French zone code as if it implied a known national standard.
- **ABF perimeter risk.** Any envelope produced for a parcel within 500 m of a classified monument is subject to unwritten, discretionary ABF constraints. The envelope should carry a flag until ABF overlay detection is built.

**Sign-off:** this file is OPEN. No fields from `SOURCES.md §A` may be promoted to pack-shippable status until a verifier signs here. — UNASSIGNED, pending.
