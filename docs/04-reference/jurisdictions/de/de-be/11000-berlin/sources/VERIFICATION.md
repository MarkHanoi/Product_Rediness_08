# Berlin (11000) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value has been verified for Berlin.

---

## What was checked

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| BauGB §§30/34/35 regime taxonomy | BauGB current consolidated text | Primary text read | ✅ confirmed |
| BauNVO §17 ceiling table | BauNVO §17 current consolidated text | Primary text read | ✅ confirmed |
| OVG Berlin-Brandenburg 2020 voidance ruling (Az. 2 B 10.17) | Citation confirmed in research | Secondary corroboration | ⚠ `corroborated` — ruling existence confirmed; full text not read |
| §34 prevalence in East Berlin | Berlin Abgeordnetenhaus record cited in research | Secondary corroboration | ⚠ `corroborated` — parliamentary record existence confirmed; fraction not quantified |
| Baunutzungsplan 1958/60 as a digitised layer in FIS-Broker | Research finding, multiple corroborating sources | Secondary corroboration | ⚠ `corroborated` — layer existence confirmed; field names not live-probed |

---

## What I could NOT confirm (and why it stays unshippable)

- Any GRZ/GFZ/height value for any Berlin parcel — requires live FIS-Broker XPlanGML probe + Satzung cross-check.
- Baustufen translation table — requires Berlin Senate archive research.
- Baunutzungsplan voidance status per area — requires case-law search per target area.
- §34 fraction for East Berlin — requires grid-sample probe.
- BauO Bln §6 Abstandsflächen multiplier — BauO Bln primary text not yet read.

## Caveats that must remain visible in the product

- **All Baunutzungsplan-derived values** must carry: "corroborated; subject to judicial voidance risk (OVG 2020) — verify case law before use."
- **§34 parcel output** must be a reasoned refusal, never a gap or a `null`.
- §17 BauNVO ceilings are upper bounds only, not default values for any parcel.

**Sign-off:** NOT SIGNED — awaiting regime classifier build and first primary-source read.
