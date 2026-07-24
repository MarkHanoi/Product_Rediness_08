# Antwerp (`ant-antwerp`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value verified. DSI WFS robots-blocked; no GetFeature run for any Antwerp parcel.

## What was checked

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| VCRO Art. 4.3.1 (goede ruimtelijke ordening) | VCRO consolidated text | Primary text read | ✅ confirmed |
| VCRO Art. 7.4.2/2 ("clichering" nullification) | VCRO consolidated text | Primary text read | ✅ confirmed |
| Onroerend Erfgoed WFS live | GetCapabilities 2026-07-24 | HTTP probe | ✅ VERIFIED LIVE |
| DSI/GRB layer catalogue and "kosteloos" licence | Search-engine cache of live capabilities | Secondary corroboration | ⚠ `corroborated` — not independently fetched |
| Antwerp not in DHMV I gap list | DHMV documentation (named gap list) | Primary source read | ✅ confirmed (stated) |

## What I could NOT confirm

- Any gewestplan vs. RUP determination for any Antwerp parcel — DSI robots-blocked.
- Any RUP voorschriften text — no PDF read.
- Any numeric height, GVR, or setback value — no primary source read for any parcel.

## Caveats that must remain visible

- A RUP leaving height "vrij" is a VALID, FREQUENT outcome in Flanders — not a data gap. Output as explicit refusal.
- Any percentage-based provision from a post-2009 RUP MUST be checked against Art. 7.4.2/2 before shipping.
- All numeric values from Flemish plan provisions are legally subordinate to the goede-ruimtelijke-ordening test — carry explicit caveat on every card.

**Sign-off:** NOT SIGNED — awaiting live GetFeature probe results from `mercator.vlaanderen.be` and first RUP voorschriften PDF read.
