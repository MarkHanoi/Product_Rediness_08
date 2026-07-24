# LOD-200 Context-Building Rate — Italy (`it`) national

**Headline: LOD 1 (regional) · real-height coverage ~30% · ESTIMATED**

> **LOD-200 context-building rate** — the fraction of the existing buildings around a plot for
> which we can obtain a faithful **≥ LOD-150 physical model** — **real parcel geometry + real
> MEASURED per-building height + ≥1 extra attribute (roof form / storeys / use / year)** — from an
> authoritative source, WITHOUT falling back to a fabricated OSM flat-extrude. The binding
> sub-metric is real building-HEIGHT coverage. Identical across every jurisdiction. **Distinct from
> `RATE.md`** (buildable rules) — never conflate.

## The LOD ladder (fixed)

| Level | What it is | Our label |
|---|---|---|
| **LOD 100** | footprint + estimated height (OSM / `levels`×3.2 m / fabricated 9 m) | universal floor |
| **LOD 150 (LoD1)** | footprint + **real measured** height | first honest tier |
| **LOD 200 (LoD2)** | footprint + real height + **roof form / storeys** | the target |

| Jurisdiction | LOD achievable | Real-height % | Headline | Flag |
|---|---|---|---|---|
| Netherlands | LOD 2.2 | ~99% | ~97% | VERIFIED |
| Switzerland | LOD 2 | ~98% | ~95% | VERIFIED |
| Denmark | LOD 2 | ~95% | ~93% | ESTIMATED |
| Germany | LOD 2 | ~90% | ~82% | VERIFIED (NRW) |
| France | LOD 1→2 | ~88% | ~80% | VERIFIED |
| Norway | LOD 1 | ~85% | ~72% | ESTIMATED |
| Sweden | LOD 1 | ~80% | ~68% | ESTIMATED |
| USA | LOD 1 | ~60% | ~58% | VERIFIED |
| Spain | LOD 1 (hybrid) | ~45% | ~52% | VERIFIED (footprint) |
| Belgium | LOD 1 | ~55% | ~48% | ESTIMATED |
| Portugal | LOD 1 | ~75% | ~42% | ESTIMATED |
| **Italy** | **LOD 1 (regional)** | **~30%** | **~35%** | **ESTIMATED** |
| Saudi Arabia | LOD 1 (ML) | ~20% | ~18% | ESTIMATED |

---

## The three sub-metrics

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** | Catasto (Agenzia delle Entrate) WFS — national but **indicative**, not survey-grade | ~70% | ESTIMATED | use for zone ID, not mm-accurate footprints |
| **(b) Real building HEIGHT** | ❗**No national building-height product.** PST/SIM LiDAR = terrain/surface ONLY (100% terrain by 2026). Per-region only: **Piedmont ARPA Edifici 3D** (confirmed); Lombardy/Lazio unconfirmed | **~30%** | ESTIMATED | national gap; requires per-region reconstruction |
| **(c) Extra attributes** | Piedmont per-building volume + quality code; elsewhere none; no roof form | **LOW** (MED in Piedmont) | ESTIMATED | no national LoD2 coordinator |

**OSM height-tag floor:** ESTIMATED ~5–12% explicit-height (higher in Milan/Rome cores). Where no
regional height exists, this floor + PST/SIM-derived nDSM (post-2026) is the only path.

---

## Data strategy — footprint (2D) vs height (3D)

⚠ 2D footprint accuracy and 3D height accuracy are DIFFERENT numbers — never blend them. Binding
metric = the 3D number. Italy's gap is STRUCTURAL (no national building-height product).

| Axis | Decision | Accuracy | Flag |
|---|---|---|---|
| **Footprint (2D)** | Overture/MS + Catasto WFS (indicative, not survey-grade) | **~85%** | ESTIMATED |
| **Height (3D)** | conf tier **1** Piedmont/Turin (ARPA Edifici 3D) ONLY; conf tier **4** OSM/type elsewhere (PST/SIM LiDAR is terrain-only) | **~30%** | ESTIMATED (no live probe) |

**Building-TYPE:** Milan/Rome dense cores ★★★★; the height problem is coverage, not type — outside
Piedmont there is no reconstructed building height at all. No density-fallback issue.

## The structural finding

**Italy has no national building-model coordinator — a genuine STRUCTURAL gap, not a currency lag.**
There is no Italian equivalent of Germany's ZSHH or France's IGN. The national LiDAR programme
(PST/SIM, MASE, 25 cm, ~8 cm vertical accuracy, CC BY 4.0, 100% terrain by 2026) produces **DTM/DSM
only** — no per-building height attribute, no LoD2 geometry. The building-classification and
reconstruction step is **un-nationalised**: each region must do its own processing.

Only **Piedmont** has done it: ARPA Piemonte's *Edifici 3D* provides per-building volumes + mean
elevation derived from the regional BDTRE topographic database + terrain heights, with a per-building
quality code (research-confirmed; endpoint/field schema not yet live-probed). Lombardy (Milan) and
Lazio (Rome) are **unconfirmed** — a building-height layer plausibly exists in well-resourced northern
regions but has not been identified. So Italy is a real LoD1 in Piedmont/Turin, footprint-plus-OSM-guess
elsewhere, and the national ~35% reflects that regional patchwork. Even when PST/SIM hits 100% terrain
in 2026, the reconstruction step remains per-region — so the gap does not close on the terrain timeline.

All ESTIMATED — no endpoint live-probed this pass.

---

## Orthogonality with RATE.md

Italy's buildable-rule digitisation (PRG/PGT per-comune) is a separate axis. This ~35% context rate is
the physical model; it is independent of zoning answerability. Turin is the standout on both because
Piedmont's regional data is unusually complete — but do not merge the two numbers.

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| Probe + wire Piedmont ARPA Edifici 3D (Turin) | LOD 100 → **LOD 150** in Piedmont | LOW–MED — one WFS probe |
| Check Lombardy Geoportale + Lazio geoportal for a building-height layer | may unlock Milan/Rome | MED — per-region probe |
| PST/SIM point cloud → building reconstruction pipeline (per region, post-2026) | LOD 150 nationally as terrain completes | HIGH — un-nationalised step |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| ARPA Piemonte `opendata.arpa.piemonte.it` (Edifici 3D) · Lombardy/Lazio geoportals | — | NOT probed this pass; resume steps listed in `topics/buildings-lod-height.md` | ESTIMATED |

---

*Last updated: 2026-07-24. All ESTIMATED (no live probe). No national building-height product
(PST/SIM = terrain only). Piedmont ARPA Edifici 3D confirmed (research); Lombardy/Lazio unconfirmed.
Structural gap = no national building-model coordinator. Maintainer: UNASSIGNED.*
