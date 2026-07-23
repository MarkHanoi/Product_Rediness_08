# Marseille / AMP Territoire 1 (13055) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value has been verified for Marseille.

---

## What was checked

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| PLUi Territoire 1 scope (Marseille-Provence, approved 19/12/2019) | AMP authority documentation, corroborated multiple sources | Secondary corroboration | ✅ confirmed |
| Graphic-primacy precedence rule (stated in PLUi général provisions) | Research finding, corroborated | Secondary corroboration | ⚠ `corroborated` — rule language confirmed in research; verbatim text from PLUi PDF not yet read |
| AMP GIS zoning layer is informational only / not legally opposable | AMP metropolitan authority notice | Secondary corroboration | ✅ confirmed |
| Euroméditerranée OIN existence | Multiple corroborating sources | Secondary corroboration | ✅ confirmed (existence); rules not sourced |
| COS/FAR abolition (loi ALUR 2014) | Primary statute text | Primary source | ✅ confirmed |

---

## What I could NOT confirm (and why it stays unshippable)

- **Verbatim text of the graphic-primacy rule** from the PLUi Territoire 1 PDF — needed before ADR-0275 can be drafted.
- **Any numeric height, emprise, or setback value** from the PLUi written articles — PLUi PDF not yet read.
- **Graphic layer format (GIS vs PDF)** — not probed.
- **Euroméditerranée OIN boundary** — not located as a GIS layer.

## Caveats that must remain visible in the product

- **Zone storey ranges (UA ≈ R+4–6, etc.) are NOT shippable as-is.** They are descriptive secondary research characterisations of the written fallback — the graphic plan takes precedence per the règlement's own terms.
- **No Marseille value may ship without first checking Euroméditerranée (OIN) boundary** — a parcel inside the OIN is governed by a different instrument entirely.
- **AMP's own GIS layer must never be used as a primary source** — it is explicitly informational only.

**Sign-off:** NOT SIGNED — awaiting graphic layer probe, PLUi primary PDF read, and ADR-0275 ratification.
