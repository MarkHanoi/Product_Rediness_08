# Italy (`it`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value has been verified for Italy. No live probe has been run
against any Italian endpoint. All source entries in `SOURCES.md §A` are research-level
corroborations — none has been confirmed by direct API query or primary-document read in this pass.

---

## What was checked

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| DM 1444/1968 zone taxonomy (A–F) | DM 2 aprile 1968 n. 1444 current text — cited in Italy master study | Secondary corroboration via cited research | ⚠ `corroborated` — taxonomy confirmed; operative use per-city unverified |
| DM 1444 Art. 9 (10 m distance) | Same | Secondary corroboration | ⚠ `corroborated` — national floor confirmed; regional derogations unresearched |
| Codice Civile Art. 873 (3 m setback) | CC Art. 873 — cited in study | Secondary corroboration | ⚠ `corroborated` — floor confirmed; stricter local rules assumed |
| DPR 380/2001 Art. 2-bis (regional derogation) | DPR 380/2001 Art. 2-bis — cited in study | Secondary corroboration | ⚠ `corroborated` — mechanism confirmed; which regions have enacted derogations unresearched |
| Catasto WFS existence and licence | Agenzia delle Entrate service description — cited in study (CC BY 4.0) | Secondary corroboration | ⚠ `corroborated` — existence and licence confirmed; schema not live-probed |
| SITAP existence and informational caveat | SITAP self-description cited in study | Secondary corroboration | ⚠ `corroborated` — existence and caveat text confirmed; WFS queryability unprobed |
| Vincoli in Rete existence | Cited in study | Secondary corroboration | ⚠ `corroborated` — existence confirmed |
| ARPA Piemonte Edifici 3D existence | Cited in study | Secondary corroboration | ⚠ `corroborated` — existence and method confirmed; endpoint unprobed |
| PST/SIM terrain product and PNRR mandate | MASE/MiTE documentation cited in study | Secondary corroboration | ⚠ `corroborated` — programme and 2026 target confirmed |
| L.R. Lombardia 12/2005 (PGT introduction) | Cited in study | Secondary corroboration | ⚠ `corroborated` — law existence confirmed |

---

## What I could NOT confirm (and why it stays unshippable)

- **Any operative zoning parameter for any Italian parcel** — no municipal plan NTA has been
  read as a primary source in this pass.
- **Catasto WFS GetFeature schema** — not live-probed; field names, auth, and response format
  are unconfirmed.
- **SITAP programmatic endpoint** — web-GIS confirmed; WFS/WCS for per-parcel query not probed.
- **ARPA Piemonte Edifici 3D WFS endpoint** — existence confirmed; access path not probed.
- **Regional derogation enactment status (Art. 2-bis)** — which regions have active derogation
  regimes modifying the 10 m Art. 9 floor is entirely unresearched.
- **Turin PRG NTA zone-letter mechanism** — the Tier 1 classification for Turin is an unconfirmed
  assumption; primary text not read.

## Caveats that must remain visible in the product

- **SITAP-derived constraints** must carry: "SITAP (informational only — acknowledged incomplete;
  null result does not certify absence of constraint)." Confidence ceiling: `corroborated`.
- **DM 1444 zone letters** must NOT be treated as the operative mechanism for Milan or Rome
  parcels — both cities have superseded them.
- **DM 1444 Art. 9 (10 m) and CC Art. 873 (3 m)** are national floors subject to regional
  derogation; they are lower bounds, not confirmed operative values for any specific parcel.
- **Any indice di fabbricabilità** derived from DM 1444 Art. 7–8 is a national ceiling, not a
  parcel-level operative value.

**Sign-off:** NOT SIGNED — awaiting live probe of Catasto WFS, Piedmont PRG mosaic, and Turin
PRG NTA primary-text read. No Italian pack may ship any confidence level above `corroborated`
until those three steps are complete and a verifier has signed this file.
