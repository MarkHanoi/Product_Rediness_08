# Brussels (21004) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No RRU numeric value has been read from the primary source (RRU Titre I règlement PDF), and
the Brussels PRAS endpoint has not been independently live-probed (bot-blocked from non-Belgian IPs).

## Minimum checks before any pack value is shippable

| Check | Against | Verdict |
|---|---|---|
| Belgian/EU-IP probe path established | deployment egress | ⬜ pending |
| PRAS returns an affectation for a Brussels parcel | Live `gis.urban.brussels/geoserver/PERSPECTIVE_FR:Affectations` | ⬜ pending |
| RRU Titre I gabarit/implantation articles read verbatim | RRU règlement PDF (consolidated), noting date + amendments | ⬜ pending |
| Federal CADMAP building sublayer height attribute confirmed/denied | Live federal WFS GetFeature | ⬜ pending |
| PPAS/RRUZ/PAD precedence resolved for the target district | Brussels district-plan layers | ⬜ pending |

## Caveats that must be visible in the product

- **Discretionary test:** every Brussels permit is tested against *bon aménagement des lieux* (CoBAT/RRU
  practice). A sourced RRU numeric value is legally subordinate to it — the UI must carry a visible caveat.
- **Instrument precedence:** RRU Titre I is a regional default; a local PPAS/RRUZ/PAD overrides it for specific
  districts. Any result must state which instrument governs.
- **CBS+ / TOTEM gates:** CBS+ (ecological coefficient) can gate permittability; TOTEM life-cycle comparison is
  required for demolitions > 1,000 m². Both must be surfaced, not folded into FAR.

**Sign-off:** OPEN — no values from `SOURCES.md §B` may be promoted to pack-shippable status until a verifier
signs here.
