# Hamburg (02000) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value has been verified for Hamburg. This file will be
completed once the XPlanGML live probe runs and at least one B-Plan's GRZ/GFZ/height values
are cross-checked against the signed Satzung.

---

## What was checked, against which document version

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| Hamburg XPlanung migration completeness (1,900 + 900 plans, 2018) | XLeitstelle documentation | Document read | ✅ confirmed |
| BauGB §§30/34/35 regime taxonomy | BauGB current consolidated text | Primary text read | ✅ confirmed |
| BauNVO §17 ceiling table | BauNVO §17 current consolidated text | Primary text read | ✅ confirmed |

---

## What I could NOT confirm (and why it stays unshippable)

- **Any numeric GRZ/GFZ/height value for any Hamburg parcel** — requires live XPlanGML probe and Satzung cross-check.
- **HBauO §6 Abstandsflächen multiplier** — HBauO primary text not yet read.
- **Pre-1960 plan citation preservation** — XPlanGML inspection not yet done.

## Caveats that must remain visible in the product

- §17 BauNVO ceilings are upper bounds only, never the rule for a specific parcel.
- Pre-1960 Hamburg-law plan values carry the caveat "corroborated, pre-1960 Hamburg-law plan — original legal citation preservation not yet confirmed" until B2 probe in NEXT.md resolves.

**Sign-off:** NOT SIGNED — awaiting live probe and first primary-source read.
