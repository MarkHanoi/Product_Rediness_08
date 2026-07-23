# Turin (001272) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value has been verified for Turin by primary-text read or live
endpoint probe. The Tier 1 zone-letter assumption is UNCONFIRMED.

---

## What was checked

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| PRG instrument (Piedmont retaining PRG) | Italy master study — cited in research | Secondary corroboration | ⚠ `corroborated` — Piedmont PRG instrument confirmed |
| DM 1444 zone-letter mechanism (Turin) | Italy master study — cited as ASSUMPTION | Secondary corroboration | ⚠ `corroborated (ASSUMPTION)` — working assumption only; NTA primary text NOT read; could be wrong |
| ARPA Piemonte Edifici 3D existence + method | Italy master study | Secondary corroboration | ⚠ `corroborated` — dataset existence and derivation method confirmed; endpoint and field schema not probed |
| Piedmont PRG mosaic WFS existence | Italy master study + regional geoportal research | Secondary corroboration | ⚠ `corroborated` — mosaic confirmed; Turin currency not probed |
| National distance floor (DM 1444 Art. 9, 10 m) | DM 1444 — cited in research | Secondary corroboration | ⚠ `corroborated` — national floor; Piedmont derogation unresearched |
| National setback floor (CC Art. 873, 3 m) | Codice Civile — cited in research | Secondary corroboration | ⚠ `corroborated` |
| DM 1444 Art. 7 zone B density ceiling (5 mc/mq) | DM 1444 — cited in research | Secondary corroboration | ⚠ `corroborated` — ceiling only; not operative value |
| SITAP existence and caveat | Cited in research | Secondary corroboration | ⚠ `corroborated` — informational only |
| Vincoli in Rete existence | Cited in research | Secondary corroboration | ⚠ `corroborated` |

---

## What I could NOT confirm (and why it stays unshippable)

- **⚠ PRG NTA zone-letter mechanism** — this is the CRITICAL unconfirmed assumption. The entire
  Tier 1 classification depends on it. Not confirmed by primary-text read.
- **Any per-zone numeric parameter** (height, coverage, indice di fabbricabilità) — PRG NTA not read.
- **Piedmont PRG mosaic WFS field schema and Turin currency** — not live-probed.
- **ARPA Piemonte Edifici 3D endpoint, field schema, urban-core reliability** — not live-probed.
- **Turin RE (Regolamento Edilizio) setback multipliers** — not read.
- **Piedmont derogation status under DPR 380/2001 Art. 2-bis** — unresearched.

## Caveats that must remain visible in the product

- **DM 1444 ceiling values** (Art. 7–8) must NOT be shipped as operative parcel values — they are
  national upper bounds only. The operative value for any Turin parcel is in the PRG NTA.
- **PRG NTA zone-letter mechanism** must carry "UNCONFIRMED — assumed from Piedmont PRG instrument
  retention; verify by reading Turin NTA primary text before any build decision" until the NTA is read.
- **SITAP / Vincoli in Rete** must carry: "informational only — acknowledged incomplete."
- **ARPA Piemonte Edifici 3D** heights are existing building heights (context data), not permitted
  building heights (envelope data) — must not be confused with NTA-derived height limits.

**Sign-off:** NOT SIGNED — awaiting Turin PRG NTA primary-text read (the single most important
prerequisite), Piedmont mosaic WFS live probe, and ARPA Piemonte Edifici 3D live probe. No Turin
pack may commit to a Tier 1 build plan until the NTA zone-letter assumption is confirmed.
