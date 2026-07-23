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
before building anything, because **vertical extent (floors, height) is NOT national — it defers to
the municipal plan and is overridable by development-authority regulations**, which is the same
"local plan silently governs" trap Barcelona turned out to be, and it needs a per-city source or an
explicit demo assumption.

---

## 2 — THE NUMBER (what a demo would answer)

There is no resolution-rate yet (nothing built). The *shape* of the answer:

- **Footprint + coverage:** fully determined by `street width + class` → **`plot ⊖ setbacks`, capped
  by `coverage × plotArea`**. The simplest C58 rule kind (`setback` + `maxCoverage`). No block
  dissolve, no depth construction, no tiered solid.
- **Floors / height:** **not national.** Honest demo options: (a) show footprint + coverage, refuse
  height as *"per municipal plan — not resolved"* (C58 §1.13, a cited refusal beside a real
  footprint), or (b) let the user pick a floor count under the ≤23 m apartment ceiling.

---

## 3 — BLOCKERS

### 3.1 — 🔴 Vertical extent is municipal, not national (the Barcelona trap, and it is real here)
- **What.** Floors and max height are `المخطط المعتمد` (approved-plan) fields; development authorities
  override the national decision.
- **Why it blocks.** A full vertical envelope needs the per-zone municipal number we do not hold.
- **Unblock.** A per-city source of floor/height by zone — the Riyadh / Jeddah supplementary
  building-requirement documents are the first place to look, AND whether they OVERRIDE (Barcelona's
  article-by-article municipal-modification pattern) rather than supplement.
- **Resume step.** Pick the demo city, source its floor/height-by-zone table, check override scope.

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
