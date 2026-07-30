# Rate Implementation Plan — Zürich (`0261`) city

**Current LEGISLATION rate:** ~25–35% (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md); composite master
[`RATE.md`](./RATE.md) = 66 % partial) · **Realistic ceiling:** ~45–55% · **Gap to ceiling:** ~15–25 pts ·
**Gap to Denmark (~96%):** ~61 pts · **Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Zürich's realistic ceiling is **~45–55%** — the highest of any CH city, but well below Denmark (~96%). The
ceiling is set by two structural facts, not a data-access problem: (a) the density/height numbers are
**transcribed** from the BZO 700.100 PDF into a catalogue (`estimated-ruleset`), not delivered as a live
authoritative structured field like Denmark's Plandata; and (b) the per-parcel **regime** (BZO 91/99 vs 2016)
must be resolved before a height is valid — a genuinely two-regime city where the same zone code carries
different heights. All the raw material exists (cantonal AV WFS, City BZO WFS, the transcribed catalogue,
swisstopo nDSM/terrain) — the bottleneck is human sign-off + coverage measurement, not sourcing.

**Denmark comparison:** Denmark delivers a number per plan polygon from a live structured field. Zürich
delivers a `typ` code per polygon + a transcribed catalogue lookup + a regime resolution — richer geometry,
more engineering, and an `estimated-ruleset` (not `structured`) tier. One human sign-off + one coverage survey
close most of the gap that is closeable; the rest is the `estimated-ruleset`-vs-`structured` tier cap.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — cantonal AV + City BZO WFS live-probed; BZO 700.100 AZ/VG/Höhe transcribed (both regimes); RATE.md written | Honest baseline: ~25–35 % city semi-structured; the sign-off contradiction + regime gap characterised | — → ~25–35% | Complete | VERIFIED | UNASSIGNED |
| **1** | Reconcile the `VERIFICATION.md` sign-off contradiction (RISK R3); confirm the exact BZO source-PDF URLs; human-CONFIRM the docid→regime crosswalk | The L-449 gate — moves Axis 2 validation from `not-checked` toward `human-reviewed` | ~25–35% → ~30–35% | Low (human review) | NOT STARTED | UNASSIGNED |
| **2** | Land a text-bearing BZO 2016 consolidated doc so docid-6808 (~555 polygons) resolves from `regime-ambiguous` | Cuts the refusal fraction; widens the resolved-envelope share | ~30–35% → ~38–42% | Low–Medium | NOT STARTED | UNASSIGNED |
| **3** | Run the C58 buildable-land coverage survey over ZH BZO zones | Converts ENVELOPE from `not-assessed` to a measured % | (ENVELOPE axis) | Medium | NOT STARTED | UNASSIGNED |
| **4** | Wire `/api/ch/zurich-bzo` proxy + CSP (server scope) so `resolveZurichBzoZone` goes live | DATA-SOURCES zone-GIS `documented`→`live` (+3 pts on that axis) | (DATA-SOURCES) | Low (server) | NOT STARTED | UNASSIGNED |
| **5** | Build the swisstopo nDSM STAC→COG join + re-bake `zurich`; `terrain.verify.mjs` the tileset | HEIGHTS `not-assessed`→measured; TERRAIN rung 50→100 | (HEIGHTS/TERRAIN) | Medium | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) `estimated-ruleset` vs `structured`.** Denmark's numbers are a live authoritative field; Zürich's are
transcribed from a PDF. Even fully signed off, the tier caps the comparable rate below Denmark's.
**(b) Two-regime resolution.** The BZO 91/99 vs 2016 split with regime-dependent heights is a structural
complexity Denmark's single-plan model does not carry — the docid classification is a permanent maintenance
surface. **(c) Setbacks are PDF-only** (Grenzabstand in BZO text, not a structured field).

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies:** Phase 1 (sign-off reconciliation) gates any `human-reviewed` LEGISLATION credit
(L-449). Phase 5 (nDSM join) ports to Genève + Bern for free once built.
**Cross-jurisdiction reuse:** the STAC→COG-stitch nDSM join + LV95↔WGS84 projector is shared with ALL CH
cities; the `estimated-ruleset` cited-refusal enrichment pattern mirrors Madrid/Barcelona; the C58 coverage
survey is the same tool as every other jurisdiction.

**Governing documents:** C58 (fidelity/provenance) · ADR-0270 (rule kinds) · ADR-0279 (envelope standard) ·
L-449 (human-verification gate) · BZO 700.100 Bau- und Zonenordnung der Stadt Zürich (91/99 + 2016 regimes).

---
*Model references: **Denmark** `../../../dk/` (ceiling, ~96%) · **Barcelona** `../../../es/es-ct/08019-barcelona/`
(pilot climb — the analogue for the ZH `estimated-ruleset` pack). Governing: **C58** · **ADR-0269** · **L-449**.*
