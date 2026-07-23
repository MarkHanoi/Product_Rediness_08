# Milan (015146) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value has been verified for Milan by primary-text read or live
endpoint probe.

---

## What was checked

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| TUC territorial index (0.35 mq/mq base) | Italy master study — cited in research | Secondary corroboration | ⚠ `corroborated` — value confirmed in research; PGT NTA primary text not read; exact article unknown |
| TUC ceiling (0.70 mq/mq via perequation) | Italy master study | Secondary corroboration | ⚠ `corroborated` — ceiling confirmed; operative for any parcel requires ledger check |
| ERS zone exclusion from TUC index | Italy master study | Secondary corroboration | ⚠ `corroborated` — exclusion confirmed; ERS zone-specific rules not read |
| L.R. Lombardia 12/2005 (PGT introduction) | Cited in research | Secondary corroboration | ⚠ `corroborated` — law existence confirmed |
| National distance floor (DM 1444 Art. 9, 10 m) | DM 1444/1968 — cited in research | Secondary corroboration | ⚠ `corroborated` — national floor; Lombardy derogation status unresearched |
| National setback floor (CC Art. 873, 3 m) | Codice Civile — cited in research | Secondary corroboration | ⚠ `corroborated` |
| SITAP existence and informational caveat | SITAP self-description — cited in research | Secondary corroboration | ⚠ `corroborated` |

---

## What I could NOT confirm (and why it stays unshippable)

- **PGT NTA primary text** — not read; TUC article numbers unknown; exact text of the 0.35/0.70 mq/mq provision not confirmed by primary source.
- **Perequation ledger public queryability** — not investigated in this pass.
- **ERS and agricultural zone numeric rules** — exclusion from TUC confirmed; specific rules not read.
- **RET (Regolamento Edilizio-Tipo) setback multipliers** — not read.
- **Lombardy Geoportale PGT WFS** — not live-probed; zone polygon queryability unconfirmed.
- **Lombardy building-height GIS layer** — not confirmed; Edifici 3D equivalent not found for Lombardy.
- **Catasto WFS field schema for Milan parcels** — not live-probed.

## Caveats that must remain visible in the product

- **TUC ceiling (0.70 mq/mq)** must carry: "achievable only through perequated rights, bonus mechanisms, and social-housing quota — operative ceiling for this parcel requires perequation ledger lookup; ledger not publicly confirmed."
- **DM 1444 zone letters** must NOT be presented as operative for Milan TUC parcels — the mechanism has been superseded by the territorial-index system.
- **SITAP** constraints must carry: "informational only — acknowledged incomplete; null result does not certify absence."

**Sign-off:** NOT SIGNED — awaiting PGT NTA primary-text read, Lombardy Geoportale WFS probe, and perequation ledger sourcing check.
