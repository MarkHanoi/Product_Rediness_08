# NEXT — Dammam (`dmm`, SA-04, Saudi Arabia)

> **What this file is.** Where PRYZM stopped on the Dammam scaffold, exactly why, and precisely what to do to
> go further. Convention: `JURISDICTION-PLAYBOOK.md` §5.
> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — national footprint
> identical to Riyadh; no pack authored; exact height + parcel feed geo-fenced. The cleanest of the three.

## 1 — WHERE WE STOPPED (the one-paragraph truth)
Dammam's **national footprint is byte-identical to Riyadh's and Jeddah's** — the same 2024 MOMRAH decision,
the same `max(w/5, {3,2,2})` setback formula, the same coverage (villa 0.75 / apartment 0.65), the same
national vertical ceiling (villa ≤ 14 m / apt ≤ 23 m). The city-agnostic footprint pack (`saRiyadhDemo.ts`)
would be reused with a Dammam bbox; **no Dammam-specific pack is authored.** We stopped at the same wall — the
exact floors/height are municipal (Amanat Eastern Province) and geo-fenced — but Dammam is the **cleanest** of
the three: **no UNESCO heritage overlay** (contrast Jeddah's Al-Balad) and no RCRC-scale pervasive density
authority (contrast Riyadh). Nothing was probed live for Dammam this pass beyond confirming the Amana
(Amanat Eastern Province) from secondary sources and the national geo-fence measurements.

## 2 — THE NUMBER — THE STIPULATED NATIONAL CEILING
**Identical to the national/Riyadh number.** Denominator: the 6 governing envelope fields `{3 setbacks,
ground coverage, max height, max floors}`.
- **4 of 6 = 66.7% FULLY national** = the entire buildable footprint (setbacks §4-1/§4-2 cl. 4 + coverage
  §4-1 cl. 1 / §4-2 cl. 1). Resolves on any standard residential plot where the user supplies a street width.
- **2 of 6 nationally CEILINGED** = height/floors carry a cited national cap; the EXACT value beneath refuses
  (a bounded cited refusal, not a bare gap). Failure ≠ empty. The villa is nationally *maximised*.
- **Denominator note (Dammam-specific):** with **no heritage overlay**, Dammam's honest denominator is the
  widest of the three cities — the national footprint applies with the fewest local carve-outs.

## 3 — BLOCKERS (each: what · why it blocks · what would unblock · the EXACT resume step)

### 3.1 — 🟡 The EXACT per-zone floor/height is municipal (geo-fenced)
- **What.** Amanat Eastern Province's approved plan (المخطط المعتمد, §4 cl. 1) sets the exact floors/height
  per zone; any Eastern-Province development authority overrides on conflict (§1 cl. 3). Both are behind the
  national Balady/authority geo-fence.
- **Why it blocks (only a FULLER answer).** The bounded answer (footprint + national cap) is complete without
  it; pinning the exact height needs the per-zone number PRYZM does not hold.
- **What would unblock (ascending cost).** (a) an in-SA read of the Amanat Eastern Province per-zone height
  table; (b) a Balady data agreement (`NOOFFLOORS` per parcel); (c) a founder demo decision to render the
  national maximum with the over-statement caveat (C58 §1.4).
- **THE EXACT RESUME STEP.** From an in-SA egress: reach the Amanat Eastern Province approved-plan viewer;
  assert on CONTENT (a real height table), not HTTP 200 (the WAF returns 200 apology pages).

### 3.2 — Live parcel data is geo-fenced (footprint uses a user-drawn plot instead)
- **What.** Balady `MapServer/28` carries setbacks + use + floors per parcel for Dammam too, but is
  WAF/geo-fenced (national NXDOMAIN + proxy WAF).
- **Why it blocks.** No live classification/geometry/width from our environment.
- **What would unblock.** An in-SA egress or a MOMRAH/Balady data agreement.
- **THE EXACT RESUME STEP.** For a demo, DRAW the plot + type the width — skip this entirely.

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)
- **4.1 — An in-region (SA) fetch path / partner** → hit Balady `MapServer/28` (setbacks + floors per parcel)
  and the Amanat Eastern Province per-zone tables (§3.1) — Dammam jumps from "demo footprint" to "real
  envelope incl. height", same as Riyadh.
- **4.2 — A reusable municipal-plan floor/height extractor** (built for Barcelona's derived plans or Riyadh's
  RCRC guides) → the §3.1 blocker is the same shape; reuse it here.
- **4.3 — An Eastern-Province development authority publishing an open per-zone height/FAR table** → feeds
  §3.1; note it in [`../NEXT.md`](../NEXT.md) §4.2.
- **4.4 — A GEOSA data agreement** → unlocks the national building/terrain product for Dammam context data
  (currently global ML fallbacks — see [`../../topics/buildings-lod-height.md`](../../topics/buildings-lod-height.md)).

## 5 — WHAT IS ALREADY BUILT (do not redo)
- The city-agnostic national footprint pack `saRiyadhDemo.ts` (reused for Dammam with a Dammam bbox) — see
  [`../../sa-01/ruh-riyadh/findings/L-606-RIYADH-DEMO-PACK-AND-PROBES.md`](../../sa-01/ruh-riyadh/findings/L-606-RIYADH-DEMO-PACK-AND-PROBES.md).
- The national footprint clause transcription (L-606) — applies to Dammam unchanged.
- The Dammam local-layer identification (Amanat Eastern Province; no heritage overlay) — this pass, secondary.

## 6 — VERIFIED SOURCES (endpoint · answers · tier · exact query)
| Source | Answers | Tier | Note |
|---|---|---|---|
| 2024 MOMRAH decision (PDF) | national setbacks + coverage (identical to Riyadh) | `VERIFIED-LIVE PRIMARY` | `../../SAUDI-PRIMARY-DECISION-EXTRACT.md` |
| Balady `MapServer/28` | per-parcel setbacks/use/floors (Dammam too) | `VERIFIED-EXISTS, geo-fenced` | `../../SAUDI-UMAPS-API-ENUMERATION.md` |
| Amanat Eastern Province | approved-plan holder (§4 cl. 1) | `CONVERGENT-SECONDARY` | momah.gov.sa branch directory; not probed live |

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)
- The national Balady parcel geo-fence (NXDOMAIN + proxy WAF) applies to Dammam — do not expect a Dammam
  parcel query to succeed from outside SA.
- `my.gov.sa/en/content/gis` — **HTTP 403** from outside SA (measured this pass) — geo-fenced, not absent.
- "Residential FAR = 3" — FALSE nationally; a commercial/hotel figure. Applies to Dammam too.

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost
**Reuse the national footprint pack with a Dammam bbox — S.** With no heritage overlay and no pervasive
density authority, Dammam is the **most defensible ordinary-fabric demo** of the three: the honest footprint
demo applies with the fewest carve-outs, and the only refusal is the (national) exact-height refusal. Sourcing
the per-zone height (§3.1) is a separate, in-SA-gated task.
