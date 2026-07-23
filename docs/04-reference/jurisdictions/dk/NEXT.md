# NEXT — Denmark (`dk`, national, Plandata.dk)

> WHERE WE STOPPED + how to resume. README = what is true now; this = where we stopped.
> Last updated: 2026-07-23 · Maintainer: L-609 · Status: measured; 2 legal sign-offs + 1 gated code step open.

## 1 — WHERE WE STOPPED (the one-paragraph truth)

The two L-608 §8 next steps are DONE and measured live. (1) The **click-weighted fill** is ≈ **87%
by byzone area** — and the prior "trends toward 77%" hypothesis is REFUTED: area-weighting *within*
the kommuneplanramme layer LOWERS its fill to 61.5% (big rammer are the empty rural/green ones), and
87% only arises from choosing the byzone denominator + the local-plan gap-fill. (2) The **byggefelt**
building-field layer exists and is well-populated (57,031 footprint polygons) but is NOT a sound
coverage source for the current proxy+mapper path (coverage needs the parcel + an L0 schema field +
a bindingness gate) and adds ≈0% as a dimensional layer. No code was mutated — see Blocker B.

## 2 — THE NUMBER

**87.33%** of byzone clicks get ≥1 usable dimension (262/300 live area-weighted points; 95% CI ≈
±3.8pp; 0 query errors). Denominator: a random **area-weighted** point in Denmark's adopted **byzone**
(2,844 km², 3,480 patches, from `zonekort_samlet_v`). Alternative denominator (all planned land) =
**61.5%**. Both true; byzone is the product-relevant one. Contribution: ramme 39.7% / delområde 33.7%
/ lokalplan 12.3% / byggefelt 1.7% / none 12.7%. Footprint/coverage = **0%** delivered today.

## 3 — BLOCKERS (each: what · why · unblock · exact resume step)

- **A — §USABLE-FALLBACK legal precedence (inherited from L-608).** A dimensionless local plan is
  shadowed by the richer kommuneplanramme beneath it. *Why it blocks:* it's a legal claim about which
  instrument governs an omitted number. *Unblock:* Danish-planner confirmation. *Resume:* get sign-off
  in `sources/VERIFICATION.md`, then the `structured` precedence is ratified.
- **B — Base-staleness / no code shipped.** This worktree (`9bb79b8`) predates merged commit
  `a3413cd0` (delområde work). *Why it blocks:* editing the DK proxy/mapper here would clobber that
  merged work on merge-back. *Unblock:* rebase onto current `main`. *Resume:* rebase, then apply the
  §4.1 byggefelt spec ONLY IF Blocker C is greenlit.
- **C — Byggefelt footprint→coverage needs a cross-layer decision.** *Why:* `maxCoverage` is a ratio
  the pure mapper can't compute (no parcel), and there's no footprint-polygon field in `EnvelopeNumbers`.
  *Unblock:* a C58/ADR decision to add a footprint/coverage field + a downstream parcel-intersection
  step + a `bygkunifelt && !bygvejledende` bindingness gate. *Resume:* raise the ADR; then implement per
  `findings/L-609 §4.1`.

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **If you are area-weighting ANY jurisdiction's fill:** expect the count→area move to go the
  "wrong" way when the big polygons are the empty ones (Denmark: 75.7% → 61.5%). Never assume large =
  data-rich. Come back and re-read L-609 §2.
- **If you add a footprint/coverage field to the L0 zoning schema** (for any country): Denmark's
  byggefelt is a ready consumer — wire it per L-609 §4.1 at the same time, and reuse the bindingness gate.
- **If another country publishes building-field / footprint polygons** (a `byggefelt`-equivalent):
  the same "polygon ≠ coverage %; needs parcel intersection + a bindingness flag" reasoning applies.

## 5 — WHAT IS ALREADY BUILT (do not redo)

- The keyless proxy + coordinate cache (`server/plandataZoningProxy.js`), the adapter
  (`DkZoningProvider.ts`), the pure mapper (`mapPlandataToZoningRecord.ts`) — structured path, no rule
  pack, no registry line (correct).
- The delområde / §USABLE-FALLBACK layer preference — **already in `main` (a3413cd0)**, NOT in this
  worktree. Do not rebuild it; rebase to get it.
- The live measurement harness (area pass + byzone Monte-Carlo) — reproduce from `sources/SOURCES.md`.

## 6 — VERIFIED SOURCES (endpoint · answers · tier · exact query)

- `https://geoserver.plandata.dk/geoserver/wfs` — WFS 2.0, keyless. Answers: plan dimensions, plan
  identity, footprint geometry, zone map. Tier: **VERIFIED-LIVE (2026-07-23)**. Exact queries in
  `sources/SOURCES.md`.

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **kommuneplanramme `zonestatus` as a byzone partition:** 82.6% NULL (41,803/50,627). Useless for
  partitioning; use `zonekort_samlet_v` instead.
- **Byggefelt as a live DIMENSIONAL layer:** only 1.7% (5/300) of byzone clicks get a dimension from
  it (marginal ≈0, since lower layers cover those too), and it has no `bebygpct`. Adds a WFS round-trip
  for ~nothing. Don't wire it for dimensions.
- **Deriving `maxCoverage` from `bebygpct`:** `bebygpct` is FAR×100, not coverage. Already correctly
  `null`; do not "fix" it by reusing the FAR number.

## 8 — THE SMALLEST NEXT STEP that moves the number

Nothing moves the **dimensional** 87% — the remaining ~13pp is missing at source (a real ceiling).
The smallest step that adds NEW capability is the **byggefelt footprint overlay** (a real footprint at
6.0% of byzone clicks): cost = one C58/ADR schema decision (Blocker C) + the §4.1 wiring on a
rebased base. Do the ADR first; don't half-wire coverage without it.
