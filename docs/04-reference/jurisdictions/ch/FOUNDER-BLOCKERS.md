# 🇨🇭 Switzerland — Founder Blockers (offline actions to advance the RATE)
> Living doc · orchestrator-maintained · reflects [MASTER-ROI-TRACKER](../../../03-execution/plans/MASTER-ROI-TRACKER.md) §0.5/§1. Lists ONLY what the FOUNDER can do offline. Code-only moves noted as "no founder action needed."

**Status:** 🟢 nothing-blocking

## Founder action items
None — code-only. The one heavy founder move (the L-449 parcel sign-off) is already **DONE** (see Locked decisions); the swisstopo geospatial stack is keyless and all-canton. Everything remaining is code.

| # | Blocker | Type | Status | Exact action | Where / link | Unblocks (axis → effect) |
|---|---|---|---|---|---|---|
| — | None | — | — | — | — | — |

## Code-only moves (no founder action — for reference)
- Run `computeParcelConfidence` + `computeParcelMetrics` over Zürich / Genève / Bern against the wired-live keyless `swisstopo-av` cadastre → measure PARCEL.
- Bake the swisstopo **nDSM** (STAC→COG-stitch + LV95↔WGS84 reprojector) → `tagged` heights; `terrain.verify.mjs` round-trip 50→100.
- Later (code + docs): reconcile the Zürich BZO `VERIFICATION.md` RISK-R3 contradiction; per-canton `Typ.Nutzungsziffer` FAR harvest; Baureglement extraction pipeline (shared ES/FR/CH).

## Locked decisions (this session)
- **L-449 = YES, SIGNED ✅** — swisstopo AV (Amtliche Vermessung) is survey-grade → PARCEL **HIGH**; rendered tiles ≠ engineering-grade (founder, 2026-07-30, tracker §0.5).
