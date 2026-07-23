# Germany (`de`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value has been verified. This file will be completed once live probes are run and the first B-Plan attributes are read against a primary source.

---

## What was checked, against which document version

| Field | Verified against (doc + version/date) | Method (viewer / PDF read / endpoint response) | Verdict |
|---|---|---|---|
| BauGB §30/§34/§35 regime taxonomy | BauGB current consolidated text (gesetze-im-internet.de) | Primary text read | ✅ confirmed |
| BauNVO §17 density ceilings table | BauNVO §17 current consolidated text | Primary text read | ✅ confirmed |
| BauNVO §20 GFZ calculation | BauNVO §20 current consolidated text | Primary text read | ✅ confirmed |
| XPlanung/XPlanGML standard v6.1 | XLeitstelle specification | Document read | ✅ confirmed (standard exists; field completeness not yet probed live) |
| Hamburg XPlanung migration (1,900 + 900 plans, complete 2018) | Hamburg LGV / XLeitstelle documentation | Document read | ✅ confirmed |
| Berlin Baunutzungsplan 1958/60 + §173(3) BBauG binding status | Research finding, multiple corroborating sources | Secondary corroboration | ⚠ `corroborated` — not primary-source verified against the Baunutzungsplan document itself |
| OVG Berlin-Brandenburg 2020 voidance ruling | Court ruling Az. 2 B 10.17, 2020-09-15 | Citation confirmed in research | ⚠ `corroborated` — ruling existence confirmed; full text not read |
| DiPlanung Bavaria mandate (31 Oct 2026) | Bavarian state mandate documentation | Secondary source | ⚠ `corroborated` — date and mandate confirmed from programme documentation |

---

## What I could NOT confirm (and why it stays unshippable)

- **Any numeric GRZ/GFZ/Höhe value for any German parcel** — requires a live XPlanGML probe or primary B-Plan Satzung read.
- **ALKIS WFS endpoint authentication terms per Land** — requires live HTTP probe for Hamburg, Bavaria, Berlin.
- **Hamburg pre-1960 plan XPlanGML citation preservation** — requires inspection of a fetched Hamburg XPlanGML file.
- **Baustufen-to-GRZ/GFZ translation table for Berlin** — requires the original 1958/60 Baunutzungsplan legend from Berlin Senate archive.

## Caveats that must remain visible in the product

- §17 BauNVO ceilings are UPPER BOUNDS only — never the actual rule for any specific parcel.
- Any Berlin Baunutzungsplan-derived figure must carry the caveat: "corroborated; subject to judicial voidance risk per OVG 2020 — verify case law before use."
- §34 parcel output is ALWAYS a reasoned refusal — no numeric envelope is legally possible.

**Sign-off:** NOT SIGNED — awaiting live probe results and first B-Plan primary source read.
