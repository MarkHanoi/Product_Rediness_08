# NEXT — Saudi Arabia (national entry; COUNTRY overview — demo city = Riyadh)

> **What this file is.** The COUNTRY-level overview: where PRYZM stopped on Saudi *national* law, the
> blockers, and the exact resume steps. Same convention as every jurisdiction's `NEXT.md`
> (`JURISDICTION-PLAYBOOK.md` §5).
> ⚠ **2026-07-23 — migrated to the ISO tree** (`saudi-arabia/` → `jurisdictions/sa/`, L-606) and the
> demo city is now **Riyadh**, with its own record under
> [`sa-01/ruh-riyadh/`](sa-01/ruh-riyadh/README.md) (ISO 3166-2 **SA-01** Riyadh Region · UN/LOCODE
> **RUH**). Riyadh-specific status, the authored rule pack, and the floor/height blocker now live in
> the Riyadh `NEXT.md`; this file keeps the NATIONAL picture only.
>
> **Last updated:** 2026-07-23. **Maintainer:** UNASSIGNED. **Status:** national assessed;
> Riyadh demo pack AUTHORED (not yet wired — see `sa-01/ruh-riyadh/NEXT.md`). Judged **cheaper than
> Barcelona for a demo footprint.**

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

We ran a full live-probe assessment (`SAUDI-ARABIA-ENTRY-ASSESSMENT.md`, backed by
`SAUDI-PRIMARY-DECISION-EXTRACT.md` and `SAUDI-UMAPS-API-ENUMERATION.md`) and **read the 2024 MOMRAH
residential decision directly** — so the rules are `VERIFIED-LIVE` primary, not news reports. The
headline: **a first-pass buildable FOOTPRINT (setbacks + ground coverage) is a pure national function
of `street width + plot class`, needs no zone portal, and reuses our existing `streetWidth.ts`.** The
one expensive Barcelona thing — parcel→zone resolution — **drops off the critical path.** We stopped
before building anything. 🔴 The L-606 re-read then found the vertical extent is **nationally
CEILINGED, not absent**: an explicit national villa height cap of **14 m** (§5-1-5 cl. 3), a villa
floor cap of ground+1+annex (§3-1), and the apartment ≤ 23 m cap (§3-2). So the *exact* floors/height
defer to the municipal plan and are overridable by development authorities — the "local plan silently
governs" trap — but only the exact value *within a known national cap*, never the footprint and never
the cap itself. The footprint (4 of 6 fields) is fully national; the vertical is nationally bounded;
only the exact height needs a per-city source or a demo assumption.

---

## 2 — 🔴 THE NUMBER — THE STIPULATED NATIONAL CEILING

**Denominator:** a complete residential envelope, decomposed into its **6 governing parameters**
`{front, side, rear setback; ground coverage; max height; max floors}` (FAR excluded — not a parameter
of the residential regime, a genuine national absence).

**National ceiling = 4 of 6 fields FULLY nationally determined = 66.7% — and that 66.7% is the ENTIRE
buildable FOOTPRINT** (3 setbacks §4-1/§4-2 cl. 4 + ground coverage §4-1 cl. 1 / §4-2 cl. 1). The other
2 fields (height, floors) are **not blank**: they carry a cited national numeric **CEILING**
(villa ≤ 14 m §5-1-5 cl. 3 & ≤ ground+1+annex §3-1; apartment ≤ 23 m §3-2), with only the *exact* value
beneath the cap deferred to the municipal plan. **No envelope field is a total unknown.**

- **Footprint (66.7%, exact):** `plot ⊖ setbacks`, capped by `coverage × plotArea`. The simplest C58
  rule kind (`setback` + `maxCoverage`). No block dissolve, no depth construction, no tiered solid.
- **Vertical (33.3%, nationally CEILINGED):** villa is nationally *maximised* (14 m / G+1+annex — the
  municipal plan can only reduce), so the national-maximum **villa** envelope is effectively complete;
  an **apartment** is national-footprint + a 23 m cap, exact floors municipal. Honest demo options:
  (a) footprint + coverage, height a **bounded** cited refusal ("exact value per municipal plan; ≤ 14 m
  villa / ≤ 23 m apartment nationally", C58 §1.13); or (b) a user floor-count under the national ceiling.

**Country-wide:** this national footprint + vertical ceiling applies to **every municipality of the
Kingdom** (Section 4 binds all Amanas; §3/§5-1-5 caps are national), carved out only for commercial-
street setbacks, Amana special-area ratios, and development-authority zones (§1). One formula, whole country.

---

## 3 — BLOCKERS

### 3.1 — 🟡 The EXACT vertical value is municipal (the national CEILING is held; only the value beneath it is not)
- **What.** The national decision CAPS the vertical extent (villa ≤ 14 m & ≤ G+1+annex §5-1-5 cl. 3/§3-1;
  apt ≤ 23 m §3-2), but the *exact* permitted floors/height per zone is `المخطط المعتمد` (§4 cl. 1) and
  development authorities override (§1 cl. 3). So the ceiling is national; the exact value is not.
- **Why it blocks (only a FULLER answer, not the ceiling).** Pinning the exact height needs the per-zone
  municipal number we do not hold; the *bounded* answer (footprint + national cap) needs nothing more.
- **Unblock.** A per-city source of exact floor/height by zone — the Riyadh RCRC/ADA design-guide volumes
  or Balady `NOOFFLOORS`, AND whether they OVERRIDE (Barcelona's article-by-article pattern) or supplement.
- **Resume step.** From an in-SA egress, read the RCRC/ADA per-zone height table; assert on CONTENT, not
  HTTP 200 (the WAF returns 200 apology pages). Or take the founder demo decision to render the national
  maximum with the over-statement caveat.

### 3.2 — Parcel geometry API exists but is geo-fenced
- **What.** Balady `MapServer/28` carries setbacks + use + floors per parcel — **richer than we need**
  — but is **WAF / geo-fenced** from outside Saudi Arabia (`SAUDI-UMAPS-API-ENUMERATION.md`).
- **Why it blocks.** We cannot reach it from our dev environment.
- **Unblock.** A request from inside SA (a partner, a VPN, a demo box in-region), OR **user-drawn
  plot** — which our onboarding already supports and which is entirely acceptable for a demo.
- **Resume step.** For a demo, **draw the plot** and skip this entirely. For production, reach the API
  from in-region.

### 3.3 — The neighbour-waiver mechanic is UNVERIFIED
- The seed claimed side setbacks are waivable by mutual neighbour agreement. **Not found in the
  primary residential decision.** The conservative (un-waived) envelope is the C58 §1.4 default
  regardless, so it does not change the estimate — **but do not carry the waiver as fact.**

---

## 4 — TRIP-WIRES (if you see this elsewhere, come back HERE)

- **4.1 — An in-region fetch path / partner.** If anyone gains a way to reach Saudi government
  services from inside SA, come back — the Balady parcel API (§3.2) then gives us setbacks + floors
  per parcel directly, and Saudi jumps from "demo footprint" to "real envelope".
- **4.2 — A reusable municipal-plan floor/height extractor.** The §3.1 blocker is the same shape as
  Barcelona's derived-plan wall. **A scan/plan-to-parameters pipeline built for either city helps the
  other.**
- **4.3 — The `streetWidth.ts` port.** Saudi's عرض الشارع (frontage-to-frontage) is the **same
  definition** our Barcelona street-width construction computes. If that port is done here, note it —
  it is the reusable asset across every width-keyed jurisdiction.

---

## 5 — VERIFIED SOURCES

| Source | Answers | Tier |
|---|---|---|
| **2024 MOMRAH residential decision** (PDF, read directly) | national setbacks + coverage by class | **VERIFIED-LIVE PRIMARY** — `SAUDI-PRIMARY-DECISION-EXTRACT.md` |
| **Balady `MapServer/28`** | per-parcel setbacks, use, floors | **VERIFIED-EXISTS, geo-fenced** — `SAUDI-UMAPS-API-ENUMERATION.md` |
| Microsoft ML Building Footprints (heights) | real building heights, sanity-check | `CONVERGENT-SECONDARY`, not re-probed |

---

## 6 — DEAD ENDS (measured; do not re-run)
- **"U-Maps is a soft-404 with no backend"** — FALSE. Backend enumerated in the shell's first 8 KB.
- **"`ROBOTS_DISALLOWED` = unreachable"** — FALSE. One `curl`, HTTP 200, 5 MB PDF, read.
- **"Residential FAR = 3"** — FALSE. FAR 3 is a *commercial/hotel* figure; the residential decision has
  **no FAR at all** (Saudi residential uses coverage %, not FAR).
- **"Flat 75% ground coverage"** — villa is 75%, **apartment is 65%.**
- **"Height/floors are not national at all"** — INCOMPLETE (corrected L-606). A national numeric CEILING
  exists and is cited: **villa ≤ 14 m** (§5-1-5 cl. 3) & ≤ ground+1+annex (§3-1); **apartment ≤ 23 m**
  (§3-2). Only the EXACT value beneath the ceiling is municipal. 23 m is BOTH the class boundary AND, for
  an in-scope apartment, the national height cap — not "only a boundary".

---

## 7 — THE SMALLEST NEXT STEP that ships a demo
**Pick Riyadh or Jeddah, build the `setback + maxCoverage` rule pack from the national tables (already
read), and demo with a user-drawn plot** — footprint + coverage real and cited, height stated as
"per municipal plan, not resolved". That is a legitimate, honest demo that PRYZM could ship far
faster than Barcelona, and it showcases the exact thing Barcelona can't: **published FAR/coverage
numbers, stated outright.** Source the city's floor/height table in parallel (§3.1) to upgrade the
vertical extent from "assumption" to "cited".

---

**See also:** `SAUDI-ARABIA-ENTRY-ASSESSMENT.md` · `SAUDI-PRIMARY-DECISION-EXTRACT.md` ·
`SAUDI-UMAPS-API-ENUMERATION.md` · `../../GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md`.
