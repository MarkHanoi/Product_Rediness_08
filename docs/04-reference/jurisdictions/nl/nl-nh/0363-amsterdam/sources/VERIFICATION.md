# Amsterdam (0363) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** The parcel/height/terrain SOURCES are wired + live-verified in code, but no numeric rule
value has been read from the omgevingsplan (DSO), and no per-clau structured-fill has been probed.

## Minimum checks before any pack value is shippable

| Check | Against | Verdict |
|---|---|---|
| Kadaster BRK returns a perceel for an Amsterdam click | Live `pdok-nl` WFS (wired) | ✅ wired + live (registry.ts note) |
| DSO / `ruimtelijkeplannen.nl` returns a structured function + height for an Amsterdam parcel | Live DSO API | ⬜ pending |
| Operative document resolved (omgevingsplan vs transitional bestemmingsplan) | DSO transitional-law status | ⬜ pending |
| 3DBAG per-city bake landed + provenance histogram probed | deployed tiles | ⬜ pending |
| AHN terrain `terrain.verify.mjs` round-trip | deployed tileset | ⬜ pending |

## Caveats that must be visible in the product

- **Omgevingswet transition (1 Jan 2024):** a parcel may still be governed by a legacy bestemmingsplan under
  transitional law; the UI must state which document governs.
- **3DBAG heights not yet on deployed tiles:** the whole-country bake renders OSM `assumed`; do not present
  3DBAG measured heights as live until the per-city bake lands (`HEIGHT.md`).
- **welstand + heritage overlays** apply on top of the omgevingsplan envelope.

**Sign-off:** OPEN — no values from `SOURCES.md §B` may be promoted to pack-shippable status until a verifier
signs here.
