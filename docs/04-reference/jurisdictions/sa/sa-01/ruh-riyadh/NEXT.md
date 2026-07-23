# NEXT — Riyadh (`ruh`, SA-01, Saudi Arabia)

> **What this file is.** Where PRYZM stopped on the Riyadh demo, exactly why, and precisely what to do
> to go further. Convention: `JURISDICTION-PLAYBOOK.md` §5.
> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** pack AUTHORED, not wired.

## 1 — WHERE WE STOPPED (the one-paragraph truth)
The national MOMRAH footprint is authored as a rule pack — `packages/site-parcel-data/src/rulepacks/
saRiyadhDemo.ts` — with two zones (`sa-villa` 0.75, `sa-apartment` 0.65 ground coverage), the setback
formula `max(w/5, {3,2,2})` as a pure resolver (`resolveSaudiSetbacks`), and height/floors as a
**field-level cited-null refusal** (C58 §1.13) so the footprint stays intact. It is verified end-to-end
against the engine (footprint insets, coverage caps, height refuses, confidence `estimated-ruleset`).
It is **NOT wired** — the registry entry, an index export, a Riyadh bbox provider, and the L5 demo
dispatcher are the `WIRING TODO (orchestrator)` block in the pack file. We stopped at the wall we
already knew: **floors + height are not national and no reachable per-zone source exists** — every
Riyadh candidate is geo-fenced.

## 2 — THE NUMBER — THE STIPULATED NATIONAL CEILING
Denominator: the **6 governing envelope fields** `{3 setbacks, ground coverage, max height, max floors}`.
- **4 of 6 = 66.7% FULLY national** = the entire buildable footprint (setbacks §4-1/§4-2 cl. 4 + coverage
  §4-1 cl. 1 / §4-2 cl. 1). Resolves on any standard residential plot where the user supplies a street
  width (denominator for a resolution rate: plots in the four national classes, outside dev-authority zones).
- **2 of 6 nationally CEILINGED** = height/floors carry a cited national cap (villa ≤ 14 m §5-1-5 cl. 3
  & ≤ G+1+annex §3-1; apt ≤ 23 m §3-2). The EXACT value beneath refuses — a **bounded** cited refusal,
  not a bare gap. Failure ≠ empty. The villa is nationally *maximised* (municipal can only reduce).

## 3 — BLOCKERS (each: what · why it blocks · what would unblock · the EXACT resume step)

### 3.1 — 🟡 The EXACT per-zone floor/height is municipal (the national CEILING is held)
- **What.** The national decision CAPS the vertical extent (villa ≤ 14 m §5-1-5 cl. 3 & ≤ G+1+annex §3-1;
  apt ≤ 23 m §3-2), but the EXACT floors + max height per zone are municipal (المخطط المعتمد, §4 cl. 1)
  and development-authority regs override (§1 cl. 3). The demo refuses the EXACT value, per-field, WITH
  the national ceiling cited alongside (a bounded refusal).
- **Why it blocks (only a FULLER answer).** Pinning the exact height needs the per-zone number PRYZM does
  not hold; the bounded answer (footprint + national cap) is complete without it.
- **What would unblock (ascending cost).** (a) an in-SA read of the Riyadh RCRC/ADA per-zone height table;
  (b) a Balady data agreement (its `NOOFFLOORS` field carries it per parcel); (c) a founder demo decision
  to render the national-**maximum** envelope (villa 14 m/G+1+annex; apt 23 m) with the over-statement
  caveat (C58 §1.4).
- **THE EXACT RESUME STEP.** From an in-SA egress: `GET trc.alriyadh.gov.sa` and the RCRC design-guide
  volumes; assert on CONTENT (a real height table), not on HTTP 200 — the WAF returns 200 apology pages.

### 3.2 — Live parcel data is geo-fenced (footprint uses a user-drawn plot instead)
- **What.** Balady `MapServer/28` carries setbacks + use + floors per parcel but is WAF/geo-fenced.
- **Why it blocks.** No live classification/geometry/width from our environment.
- **What would unblock.** An in-SA egress or a MOMRAH/Balady data agreement.
- **THE EXACT RESUME STEP.** For the demo, DRAW the plot + type the width — skip this entirely.

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)
- **4.1 — An in-region (SA) fetch path / partner** → come back and hit Balady `MapServer/28` (setbacks
  + floors per parcel) and trc.alriyadh.gov.sa (§3.1) — Riyadh jumps from "demo footprint" to "real
  envelope incl. height".
- **4.2 — A reusable municipal-plan floor/height extractor** (built for Barcelona's derived plans or
  any city) → the §3.1 blocker is the same shape; reuse it here.
- **4.3 — A per-EDGE street-width source** (measured or read) → then the `street-proportional-setback`
  schema kind (SCHEMA SPEC sketch in the pack file) becomes the cleaner home than the demo resolver,
  and the pack can drop `resolveSaudiSetbacks` for a declared rule the engine solves per edge.

## 5 — WHAT IS ALREADY BUILT (do not redo)
- The rule pack `saRiyadhDemo.ts` (2 zones, resolver, per-parcel `saRiyadhResolvedPack`, WIRING TODO).
- The solver DECISION (map onto `setback`, no new kind for the demo) — argued in `findings/L-606-*`.
- The streetWidth.ts port VERDICT (algorithm ports; demo takes width from the user) — `findings/`.
- The floor/height LIVE PROBE for the EXACT value (all candidates geo-fenced) — `findings/`.
- 🔴 **L-606 (2026-07-23): the national VERTICAL CEILING** — villa ≤ 14 m (§5-1-5 cl. 3) & ≤ G+1+annex
  (§3-1), apt ≤ 23 m (§3-2) — transcribed from the PDF and encoded as `SA_MAX_HEIGHT_M` /
  `SA_MAX_FLOORS_VILLA` + a BOUNDED refusal (`SA_HEIGHT_PLAN_DEFERRED_REF`). NOT rendered as maxHeight
  (would over-state below the cap, C58 §1.4).
- 🔴 **L-606: per-field CLAUSE NUMBERS machine-transcribed** into every `ordinanceRef` + `SOURCES.md`.
  The pack's remaining `structured`-tier gate is now ONLY the human `VERIFICATION.md` sign-off.
- 🔴 **L-606: end-to-end re-confirmed** (throwaway vitest, deleted; suite back to baseline): 40×40 villa
  @ 20 m street → 32×32 inset, 0.75 coverage cap, height/floors null, `estimated-ruleset`.

## 6 — VERIFIED SOURCES (endpoint · answers · tier · exact query)
| Source | Answers | Tier | Note |
|---|---|---|---|
| 2024 MOMRAH decision (PDF) | national setbacks + coverage | `VERIFIED-LIVE PRIMARY` | `../../SAUDI-PRIMARY-DECISION-EXTRACT.md` |
| Balady `MapServer/28` | per-parcel setbacks/use/floors | `VERIFIED-EXISTS, geo-fenced` | `../../SAUDI-UMAPS-API-ENUMERATION.md` |

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)
- `trc.alriyadh.gov.sa` — **ECONNREFUSED** from outside SA (network/geo block). Not absence.
- `rcrc.gov.sa` publications — **WAF "requested URL was rejected"**. Not absence.
- `istitlaa.ncc.gov.sa` — **ECONNREFUSED**. Not absence.
- "Residential FAR = 3" — FALSE; that is a commercial/hotel figure. Residential has no FAR.

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost
**Wire the pack** (the 3-edit WIRING TODO: index export, registry registration + Riyadh bbox, L5 demo
dispatcher) — **S**. That takes the footprint from "authored" to "resolving on a click". Sourcing the
per-zone height (§3.1) is a separate, in-SA-gated task that upgrades height from refusal to cited.
