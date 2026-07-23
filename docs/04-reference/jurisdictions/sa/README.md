# Saudi Arabia (`sa`) — national data layer: what is true now

**Level:** country (ISO 3166-1 alpha-2 `sa`) · **Law shape:** national footprint + municipal/authority
vertical override · **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED ·
**Status:** national law read (`VERIFIED-LIVE` primary); Riyadh demo pack authored, not wired.

> Migrated from `docs/04-reference/saudi-arabia/` to the ISO tree on 2026-07-23 (L-606), matching
> `jurisdictions/es/`. The demo city is **Riyadh** — see [`sa-01/ruh-riyadh/`](sa-01/ruh-riyadh/README.md).

## 1 — What governs, nationally
- **Governing-instrument chain:** `plot → 2024 MOMRAH residential decision (national) → plot class
  (villa/apartment/apt-commercial/apt-administrative) → the setback formula + coverage table`.
  Then, for the VERTICAL extent only: `→ municipal approved plan (المخطط المعتمد) → development-authority
  regulations (override on conflict)`.
- **Rule KIND (ADR-0270 / C58 §2.2):** **`setback`** — the simplest kind. Footprint =
  `plot ⊖ max(streetWidth/5, {front 3, side/rear 2})`, capped by `coverage × plotArea`
  (villa 0.75 / apartment 0.65 ground). No block dissolve, no depth construction, no FAR.
- **Setback-governed, not alignment-governed** — the decision states real separation distances, so a
  per-edge inset is the native shape (unlike Barcelona's *alineació a vial*).
- **Legal-structure trap (P1): PRESENT, but narrow — the EXACT vertical value only.** The *exact*
  floors + max height defer to the municipal plan (§4 cl. 1) and development-authority regs prevail on
  conflict (§1 cl. 3) — the "local plan silently governs" trap. But the vertical extent is nationally
  **CEILINGED** (villa ≤ 14 m & ≤ G+1+annex §5-1-5 cl. 3/§3-1; apt ≤ 23 m §3-2), so the trap costs only
  the exact height *within a known national cap*, never the footprint. Unlike Barcelona (62.8 % of the
  city on derived planning that sets the WHOLE envelope), here the FOOTPRINT + the vertical CEILING stay
  nationally grounded; only the exact height/floor value beneath the ceiling defers.

## 2 — National data layer status
| Layer | Status | Source (clause-cited) |
|---|---|---|
| Setbacks (formula) | ✅ `VERIFIED-LIVE` primary | villa §4-1 cl. 4, apt/admin §4-2 cl. 4 / §4-3 cl. 4 |
| Ground coverage by class | ✅ `VERIFIED-LIVE` primary | villa 0.75 §4-1 cl. 1 / apt 0.65 §4-2 cl. 1 |
| Residential FAR | ⛔ **does not exist** in the residential regime (0 hits) | full-text grep |
| Max height — **national CEILING** | 🟡 **nationally BOUNDED**, exact value municipal | villa **≤ 14 m** §5-1-5 cl. 3; apt **≤ 23 m** §3-2 |
| Max floors — **national CEILING** | 🟡 **nationally BOUNDED**, exact value municipal | villa **≤ ground+1+annex** §3-1; exact per §4 cl. 1 |
| Parcel geometry + classification | 🟡 exists (Balady `MapServer/28`) but **geo-fenced** | `SAUDI-UMAPS-API-ENUMERATION.md` |

> **🔴 CORRECTION (2026-07-23, L-606).** The first pass recorded floors/height as flatly "not
> national" and 23 m as "only a class boundary, not a cap". The re-read of the primary PDF found an
> **explicit national villa height cap of 14 m** (§5-1-5 cl. 3) and confirmed the apartment ≤ 23 m and
> villa ≤ G+1+annex caps ARE national upper bounds. So the vertical extent is **nationally CEILINGED**,
> not absent — only the EXACT value beneath the ceiling is municipal.

## 2a — 🔴 THE STIPULATED NATIONAL CEILING (the headline answer)

**Denominator:** a complete residential buildable-envelope answer, decomposed into its **6 governing
parameters** — `{front setback, side setback, rear setback, ground coverage, max height, max floors}`.
(FAR is excluded from the denominator: it is not a parameter of the residential regime at all — a
genuine national *absence*, definitively answered, not an unknown.)

| Parameter | National status | Clause |
|---|---|---|
| Front setback | ✅ fully national (exact) | §4-1 / §4-2 cl. 4 |
| Side setback | ✅ fully national (exact) | §4-1 / §4-2 cl. 4 |
| Rear setback | ✅ fully national (exact) | §4-1 / §4-2 cl. 4 |
| Ground coverage | ✅ fully national (exact) | §4-1 cl. 1 / §4-2 cl. 1 |
| Max height | 🟡 national **ceiling** (villa 14 m / apt 23 m); exact = municipal | §5-1-5 cl. 3 / §3-2 |
| Max floors | 🟡 national **ceiling** (villa G+1+annex); exact = municipal | §3-1 / §4 cl. 1 |

**⇒ National ceiling = 4 of 6 governing fields FULLY nationally determined = 66.7% — and that 66.7%
is the ENTIRE buildable footprint.** The other 33.3% (height + floors) is **not a blank**: it carries
a cited national numeric **upper bound**, with only the exact value beneath deferred to the municipal
plan. So **no envelope field is a total unknown** — 4 are pinned nationally, 2 are nationally bounded.

**Per class (the honest nuance):**
- **Villa** — national gives the footprint (exact) **+** a hard 14 m height cap **+** a G+1+annex floor
  cap. The municipal plan can only *reduce*. So the national-**maximum** villa envelope is a complete,
  cited 3-D mass — the villa is the strongest national answer (≈ fully stipulable at its maximum).
- **Apartment** — national gives the footprint (exact) **+** a 23 m height cap; the exact floor count
  within (`> 2 floors … ≤ 23 m`) is municipal. A wider band, so the municipal layer adds more here.

**Country-wide (the strongest selling point):** the footprint formula + coverage (Section 4) is binding
on **all Amanas of the Kingdom** (Section 1), and the class height/floor caps (§3, §5-1-5) are national —
so this **66.7% national footprint answer, plus the national vertical ceiling, is COUNTRY-WIDE (every
municipality), one formula**. It is carved out only where the law itself names an exception: **commercial-
street setbacks** (Amana-set, §1), **special-area building ratios** (Amana-defined, §1), and **development-
authority zones** (RCRC/ROSHN/NEOM/Diriyah/Qiddiya — override, §1 cl. 3). On ordinary residential land
anywhere in Saudi Arabia, the footprint is nationally determined.

**The exact remaining blocker to a FULLER answer:** the *exact* per-zone floors/height (the value
*beneath* the national ceiling) is municipal (المخطط المعتمد) and every reachable Riyadh source is
geo-fenced — unblocked only by an in-SA egress / a Balady data agreement (`NOOFFLOORS`), or a founder
demo decision to render the national-**maximum** envelope (with the over-statement caveat, C58 §1.4).
Separately, the pack's `structured` tier now needs **only** the human `VERIFICATION.md` sign-off: the
per-field clause numbers ARE transcribed (L-606); the human act is the last gate.

## 3 — Granularity (C58 §1.11)
The national footprint values are **national** granularity (one formula/table for the whole Kingdom).
The demo applies them at **parcel** granularity via a user-drawn plot + user-supplied street width.
Height/floors would be **planning-zone** granularity (municipal) — not held.

## 4 — Files here
- `NEXT.md` — country overview: national blockers, TRIP-WIRES, resume steps.
- `SAUDI-ARABIA-ENTRY-ASSESSMENT.md` — the market-entry effort assessment (the reasoning of record).
- `SAUDI-PRIMARY-DECISION-EXTRACT.md` — the primary 2024 MOMRAH decision, read live, page-cited.
- `SAUDI-UMAPS-API-ENUMERATION.md` — the Balady parcel backend, enumerated (exists, geo-fenced).
- `sources/SOURCES.md` · `sources/VERIFICATION.md` — the national trust gate.
- `sa-01/ruh-riyadh/` — the **Riyadh demo** (the authored rule pack's provenance home).

## 5 — Open questions / unverified
- Per-city machine-readable **exact** floor/height by zone (the value *beneath* the national ceiling):
  every reachable candidate (trc.alriyadh.gov.sa, rcrc.gov.sa, istitlaa.ncc.gov.sa) is
  geo-fenced/WAF-blocked from outside SA — **measured negatives on shape, NOT proof of absence**
  (§CONTEXT-DATA-HONESTY). See the Riyadh `findings/`. ⚠ The national CEILING (villa 14 m, apt 23 m) is
  NOT open — it is now cited (§5-1-5 cl. 3 / §3-2); only the exact per-zone value is unheld.
- The neighbour-waiver mechanic (side setback waivable by mutual agreement) — **not found** in the
  primary residential decision; do not carry as fact.
