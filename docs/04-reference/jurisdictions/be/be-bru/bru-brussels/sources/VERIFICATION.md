# Brussels-Capital Region (`bru-brussels`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value verified. PRAS bot-blocked; RRU Titre I formula secondary-confirmed only. This file will be completed once the PRAS endpoint is live-probed and RRU Titre I Art. 4 is read from the primary text.

## What was checked

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| PRAS layer existence | wfs.michelstuyts.be aggregator cache | Secondary corroboration | ⚠ `corroborated` — not independently fetched from origin |
| RRU Titre I formula (H = P + 3.00 + D) | Secondary research sources | Document read | ⚠ `corroborated` — canonical Art. 4 text not independently read |
| CoBAT existence and scope | CoBAT consolidated text | Primary text citation | ✅ confirmed |
| Instrument precedence (PPAS/RRUZ/PAD > RRU) | CoBAT + Conseil d'État case law | Primary text + case law citation | ✅ confirmed (CoBAT text); ⚠ `corroborated` (case law) |

## What I could NOT confirm

- **Any PRAS zone or RRU height value for any Brussels parcel** — endpoint bot-blocked; no GetFeature run.
- **RRU Titre I Art. 4 canonical text** — secondary-source confirmation only; full article not read.
- **PPAS/RRUZ/PAD layer accessibility** — not probed; coverage not measured.

## Caveats that must remain visible

- Brussels RRU Titre I heights are context-relative formulas — never a single lookup value.
- Demolition/rebuild resets the applicable gabarit regime; CBS+ and TOTEM gate may apply.
- High-rise construction requires a per-project RRU derogation — no standard formula applies.

**Sign-off:** NOT SIGNED — awaiting live probe results from Belgian-IP and primary RRU Titre I Art. 4 text read.
