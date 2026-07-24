# Liège (`lie-liege`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** Plan de secteur WFS endpoint VERIFIED LIVE; no GetFeature run for Liège; GCU adoption unknown; no numeric rule value verified.

## What was checked

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| Plan de secteur WMS endpoint live | GetCapabilities response 2026-07-24 | HTTP probe — HTTP 200 | ✅ VERIFIED LIVE |
| Plan de secteur OGC API Features endpoint live | OpenAPI JSON response 2026-07-24 | HTTP probe — HTTP 200 | ✅ VERIFIED LIVE |
| Plan de secteur free access ("Accès libre et gratuit") | GetCapabilities `<AccessConstraints>` | HTTP probe response | ✅ confirmed |
| CoDT Art. D.IV.13 (bon aménagement des lieux) | CoDT current consolidated text | Primary text read | ✅ confirmed |
| GRU indicative status | CoDT + GRU text | Primary source read | ✅ confirmed |
| AWaP layer existence and CC-BY 4.0 licence | Géoportail de Wallonie catalogue | Catalogue page read | ⚠ `stated` — not independently fetched via GetCapabilities |

## What I could NOT confirm

- Zone affectation for any specific Liège parcel — GetFeature not yet run.
- Whether the `LU.ZoningElement_pds` features carry any numeric attribute — GetFeature not run (expected: no; confirming "no" is needed before scoping the pack).
- Whether Liège has adopted a GCU — not researched in this pass.
- Any numeric height, FAR, setback, or gabarit value for any Liège parcel — no primary source read.

## Caveats that must remain visible

- The plan de secteur is legally binding BUT carries only broad affectation (zone d'habitat, activité économique, etc.) — NOT a numeric envelope instrument.
- The GRU is explicitly indicative; do not treat its guidance as a permit-determinative ceiling.
- The bon aménagement des lieux test is the operative standard for most specific envelope questions in Wallonia. Any card must carry an explicit caveat that the legal answer requires human judgment, not a table lookup.

**Sign-off:** NOT SIGNED — awaiting plan de secteur GetFeature probe results for Liège and GCU adoption confirmation.
