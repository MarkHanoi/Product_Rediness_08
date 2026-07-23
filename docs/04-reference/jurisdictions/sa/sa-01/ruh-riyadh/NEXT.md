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

## 2 — THE NUMBER (what % of clicks, which denominator)
No rate yet (unwired). Once wired, the footprint resolves on **any standard residential plot** where
the user supplies a street width (denominator: plots inside the four national classes, outside
development-authority master-plan zones). Height/floors refuse on **100 %** — a cited refusal, not a
gap. Failure ≠ empty.

## 3 — BLOCKERS (each: what · why it blocks · what would unblock · the EXACT resume step)

### 3.1 — 🔴 Per-zone floor/height is not national, and no reachable source exists
- **What.** Floors + max height are municipal (المخطط المعتمد, Ch. 4 §4.1) and development-authority
  regs override on conflict (Ch. 1 §1). The demo refuses them, per-field.
- **Why it blocks.** A full vertical envelope needs the per-zone number PRYZM does not hold.
- **What would unblock (ascending cost).** (a) an in-SA read of the Riyadh RCRC/ADA per-zone height
  table; (b) a Balady data agreement (its `NOOFFLOORS` field carries it per parcel); (c) a founder
  demo decision to let the user pick a floor count under the ≤ 23 m apartment ceiling.
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
- The floor/height LIVE PROBE (all candidates geo-fenced) — `findings/`.

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
