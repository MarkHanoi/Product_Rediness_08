# Brussels-Capital Region (`bru-brussels`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No pack value shipped. PRAS bot-blocked. RRU Titre I now read from the official text (founder dig 2026-07-31): Art. 4 buildable-depth rule CONFIRMED + encodable, Art. 3 implantation = alignment; HEIGHT is contextual and the `H = P + 3 + D` formula is NOT in the official text (UNCONFIRMED — do NOT encode). This file will be signed once the consolidated Art. 4/3 citations are pinned by a verifier and the instrument-priority chain (PPAS/PAD/RRUZ) is probed live.

## What was checked

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| PRAS layer existence | wfs.michelstuyts.be aggregator cache | Secondary corroboration | ⚠ `corroborated` — not independently fetched from origin |
| RRU Titre I Art. 4 buildable DEPTH (`min(0.75*parcelDepth, neighbourRule())`) | Official RRU Titre I (`urbanisme.irisnet.be/pdf/RRU_Titre_1_FR.pdf` + etaamb) | Primary text read | ✅ read-verbatim — CONFIRMED + encodable (pin the consolidated article before shipping) |
| RRU Titre I Art. 3 implantation (alignment) | Same official text | Primary text read | ✅ read-verbatim — categorical (alignment, not metres) |
| RRU Titre I height `H = P + 3 + D` | Official RRU Titre I | Primary text read | ⚠ UNCONFIRMED — formula NOT located in the official text; do NOT encode (height is geometry-derived from UrbIS-3D) |
| CoBAT existence and scope | CoBAT consolidated text | Primary text citation | ✅ confirmed |
| Instrument precedence (PPAS/RRUZ/PAD > RRU) | CoBAT + Conseil d'État case law | Primary text + case law citation | ✅ confirmed (CoBAT text); ⚠ `corroborated` (case law) |

## What I could NOT confirm

- **Any PRAS zone value for any Brussels parcel** — origin bot-blocked; no GetFeature run (multiple official open-data surfaces exist; pick the best live path).
- **RRU height as a legal number** — none exists: no per-zone table, and `H = P + 3 + D` is not in the official text; height is geometry-derived from UrbIS-3D (schema unprobed).
- **PPAS/RRUZ/PAD instrument-priority chain + coverage fraction** — not probed; needs live/Belgian-IP access.

## Caveats that must remain visible

- Brussels RRU Titre I height is contextual — no per-zone lookup; the `H = P + 3 + D` formula is UNCONFIRMED and must NOT be shipped. Buildable DEPTH (Art. 4) IS a confirmed resolver; implantation (Art. 3) is "alignment".
- Demolition/rebuild resets the applicable gabarit regime; CBS+ and TOTEM gate may apply.
- High-rise construction requires a per-project RRU derogation — no standard formula applies.

**Sign-off:** NOT SIGNED — awaiting live probe results from Belgian-IP and primary RRU Titre I Art. 4 text read.
