# Netherlands (`nl`) — national human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Status: OPEN.**

The physical-data feeds (Kadaster BRK parcel, 3DBAG height, AHN terrain, OSM context) are wired and/or
live-verified in code. The **legislation/zoning layer (omgevingsplan / DSO) has NOT been probed**, so no NL
structured-fill rate is asserted and no rule value is shippable.

| Check | Against | Verdict |
|---|---|---|
| Kadaster BRK returns a perceel | `pdok-nl` WFS (wired) | ✅ wired + live |
| 3DBAG returns measured LoD2.2 heights | `api.3dbag.nl` | ✅ live-verified (source); per-city bake unlanded |
| AHN GetCoverage returns a DTM GeoTIFF | `service.pdok.nl/rws/ahn/wcs` | ✅ live-verified 2026-07-25 |
| DSO "Regels op de kaart" returns structured rule values | live DSO API | ⬜ pending (the critical unknown) |
| Omgevingswet transition status per gemeente | DSO | ⬜ pending |

**Sign-off:** OPEN — no omgevingsplan numeric value may be promoted to pack-shippable status until a verifier
signs here (L-449 gate).
