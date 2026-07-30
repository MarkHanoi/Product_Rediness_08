# United Kingdom (`gb`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No GB rule pack exists and no numeric development value has been read from a primary source
(GB publishes none by-right — planning is discretionary). Only the cheap physical axes (terrain, context) are
live-verified; those do not require the L-449 legal sign-off.

## Minimum checks before any GB pack value is shippable

| Check | Against | Verdict |
|---|---|---|
| EA DTM terrain live | `environment.data.gov.uk/…/dtm-1m/wcs` GetCapabilities | ✅ verified 2026-07-25 (terrain only) |
| EA DSM keyless GetCoverage | live DSM WCS probe for London bbox | ⬜ pending |
| Any by-right numeric envelope exists | GB planning law | ❌ N/A — discretionary; no by-right envelope to verify |

## Caveats that must be visible in the product

- **Discretionary planning:** a GB "envelope" is not as-of-right. Any GB result must state that development
  requires planning permission decided case-by-case — never present a computed envelope as permitted.
- **Parcel:** GB clicks resolve to an OSM **footprint**, not a legal parcel — labelled honestly (footprint-fallback).

**Sign-off:** OPEN — the LEGISLATION + ENVELOPE axes stay `not-assessed`; nothing may be promoted to pack-shippable.
