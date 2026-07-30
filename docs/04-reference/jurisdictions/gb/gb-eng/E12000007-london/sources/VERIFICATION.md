# Greater London (E12000007) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No rule pack exists and no numeric development value has been read from a primary source
(London publishes none by-right — planning is discretionary). Only the cheap physical axes (terrain, context) are
live-verified and do not require the L-449 legal gate.

## Minimum checks before any London pack value is shippable

| Check | Against | Verdict |
|---|---|---|
| EA DTM terrain live for London bbox | `terrain.mjs` `gb` GetCapabilities | ✅ verified 2026-07-25 (terrain only) |
| EA DSM keyless GetCoverage | live DSM WCS probe, London bbox | ⬜ pending |
| Any by-right numeric envelope exists | GB/London planning law | ❌ N/A — discretionary; nothing to verify |

## Caveats that must be visible in the product

- **Discretionary planning:** a London result must state development requires planning permission decided
  case-by-case (London Plan + borough Local Plan + NPPF) — never present a computed envelope as permitted.
- **Parcel:** a London click resolves to an OSM **footprint**, not a legal parcel — labelled honestly.
- **Unit:** this dossier is **Greater London** (GSS E12000007), not the City of London LAU (E09000001).

**Sign-off:** OPEN — LEGISLATION + ENVELOPE stay `not-assessed`; nothing may be promoted to pack-shippable.
