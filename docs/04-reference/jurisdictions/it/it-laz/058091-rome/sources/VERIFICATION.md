# Rome (058091) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value has been verified for Rome by primary-text read or live
endpoint probe.

---

## What was checked

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| PRG 2008 tessuto-typology mechanism | Italy master study — cited in research | Secondary corroboration | ⚠ `corroborated` — mechanism confirmed; NTA primary text not read; article numbers unknown |
| Città Consolidata T1/T2/T3 typology names | Italy master study | Secondary corroboration | ⚠ `corroborated` — typology names confirmed; numeric parameters not read |
| Direct/indirect intervention split | Italy master study | Secondary corroboration | ⚠ `corroborated` — structure confirmed; NTA articles not read |
| Carta per la Qualità precedence (contested) | Italy master study — citing amendment criticism | Secondary corroboration | ⚠ `corroborated (contested)` — direction reported in research but contested; NTA primary text required |
| National distance floor (DM 1444 Art. 9, 10 m) | DM 1444 — cited in research | Secondary corroboration | ⚠ `corroborated` |
| National setback floor (CC Art. 873, 3 m) | Codice Civile — cited in research | Secondary corroboration | ⚠ `corroborated` |
| SITAP existence and informational caveat | SITAP self-description — cited in research | Secondary corroboration | ⚠ `corroborated` — Rome heritage density noted |
| Vincoli in Rete existence | Cited in research | Secondary corroboration | ⚠ `corroborated` |

---

## What I could NOT confirm (and why it stays unshippable)

- **Any PRG NTA article number** — PRG NTA primary text not read in this pass.
- **Città Storica numeric rules per tessuto** — not read.
- **Città Consolidata T1/T2/T3 numeric rules** — not read.
- **Carta per la Qualità precedence direction** — contested; must be confirmed against current consolidated NTA before any Città Consolidata rule is cited.
- **PRG NTA amendment status** — which amendments have been adopted since 2008 and whether the portal text is consolidated are unknown.
- **Roma Capitale SIT WFS endpoint** — not probed; tessuto WFS queryability unconfirmed.
- **Carta per la Qualità GIS layer** — machine-readability unconfirmed.
- **Lazio building-height GIS layer** — not found.

## Caveats that must remain visible in the product

- **Indirect-intervention parcels** (Città da Ristrutturare, Città della Trasformazione, valorizzazione ambiti) must be returned as explicit reasoned refusals: "indirect intervention — no numeric envelope until executive plan adopted."
- **Carta per la Qualità precedence** must carry: "contested — confirm against current consolidated NTA before citing; direction of precedence may have changed since 2008."
- **SITAP / Vincoli in Rete** must carry: "informational only — acknowledged incomplete; null result does not certify absence."
- **DM 1444 zone letters** must NOT be presented as operative for Rome.

**Sign-off:** NOT SIGNED — awaiting Roma Capitale SIT WFS probe, PRG NTA primary-text read, and Carta per la Qualità precedence confirmation.
