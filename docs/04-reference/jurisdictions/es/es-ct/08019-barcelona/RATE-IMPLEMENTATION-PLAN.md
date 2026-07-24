# Rate Implementation Plan — Barcelona (`es-ct`, INE 08019) city — THE CANONICAL PILOT CLIMB

**Current rate:** ~48% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** **48% MIN (proven) /
~58% LIKELY / ~68% POSSIBLE** full-envelope — REVISED UP 2026-07-24, the AMB Refós GIS carries the
volumetric floor-count as a queryable attribute (`findings/BARCELONA-GIS-AUDIT-SPIKE.md`) ·
**Gap to ceiling:** ~10 pts proven, ~20 possible (was mis-stated ~0) · **Gap to Denmark (~96%):**
~38–48 pts · **Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> **Barcelona is the PILOT MODEL every other jurisdiction's plan cites.** Its phase SHAPE — registry →
> per-clau packs → block-derived construction → refusal vocabulary → certification — is the template.
> This file is the executable pilot roadmap (L-538), mirrored from
> `BARCELONA-COMPLETE-COVERAGE-PLAN.md` and `V1-LAUNCH-READINESS-AUDIT.md` §Barcelona complete-coverage.

---

## 1 — The ceiling: what "maximum" means here

Barcelona is **PDF-bound for its qualification slice, and its ceiling is BELOW Denmark's 96% — this is
the gap-to-Denmark, stated explicitly.** Denmark reaches ~96% because its numbers are already structured
national fields. Barcelona's qualification polygons are not: the PGM *Normes Urbanístiques* are ordinance
prose, and the ~40% derived-planning slice's height is a plànol block-label — measured over 24 Pla Parcial
PDFs (`findings/L-590h`): sector FAR extractable ~37%, parcel-level height **~0% from the PDFs**. So a
qualification-only parcel tops out at a **~48% full-envelope structured-fill ceiling** without a document.

⚠ **BUT the ceiling is higher than 48% — proven 2026-07-24 (`findings/BARCELONA-GIS-AUDIT-SPIKE.md`).**
A live audit of the **AMB "Refós de Planejament" GIS** (`geoportal.amb.cat/geoserveis/rest/services/
qualificacio_refos_3857/MapServer`) found that the AMB has **already vectorised the volumetric ordering
L-590h §5 deemed "a separate project beyond OCR"**: the `OV_Trames` layer carries **`PLANTES` (floor
count) as a 100%-populated polygon attribute** (5,073 BCN polygons, real values `B+1…B+32`, incl.
`18hs`). Footprint (the OV polygon) + floors (→ height via the already-shipped `bcnAlcadaReguladora.ts`
Art. 327.2 table) = an **extrudable envelope, read not constructed.** Measured coverage of the **clau-18**
slice (the R1 blocker, 22.5% of buildable, previously a permanent refusal): **~50% (32% interior-point →
64% polygon-intersect, area-ratio corroborates 63%)**. Buildable **depth** is also digitised (`Cotes`
polylines, `LONGITUD` in metres) but as loose annotation, not yet parcel-joinable.

**Revised honest band (each tied to a specific attribute):**
- **~48% MIN** — PROVEN, unchanged. The qualification polygon (`QU_Trames`/`MUC_QUALIFICACIONS`) carries
  the **clau code only, no dimension**; a qualification-only parcel still needs the PDF.
- **~58% LIKELY** — `OV_Trames.PLANTES` covers ~50% of clau-18 (`0.5 × 22.5% ≈ +11 pts`), conditional on
  L-449 certifying the Refós vintage + building the OV point-in-polygon resolver. Height machinery already
  ships (§4).
- **~68% POSSIBLE** — if the non-18 OV coverage + `Cotes` depth-binding are folded in (real published
  data, **un-measured** here — not banked).

Reaching ~80%+ still requires the residual uncovered clau-18, alignment-clau depth binding, and per-subzone
floor→metre certification — but the earlier "gap-to-ceiling ~0, ceiling is a hard 48% wall" is **refuted**:
~+10 is proven and ~+20 possible, in official AMB data, reachable now.

⚠ **Two denominators, kept distinct, or the honesty invariant breaks:**
- **Structured-fill rate (RATE.md):** ~48% — full zone+density+height without a PDF. This is the
  MEASUREMENT. It is at/near its ceiling; the packs below *realise* it, they do not raise it past ~48%.
- **Constructed-or-partial land coverage (this plan's native unit, from L-538 §2):** 24% today →
  ~76% after Phase 4 (of which 22a/20a are FAR/coverage caps, not boundary envelopes; 18 stays a
  refusal). This is the WORK progression. It is NOT the RATE.md number — a phase marked SHIPPED never
  moves the rate until RATE.md is re-derived and VERIFIED.

The phase table below tracks the WORK in its native land-coverage unit; the RATE.md rate is re-derived
separately after each pack certifies.

---

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.
"Coverage: from→to" = constructed-or-partial % of Barcelona's private buildable land (L-538 §2 probe,
2,907-point grid). ⚠ This is WORK progression, NOT the RATE.md ~48% structured-fill number.

| Phase | Goal | Unlocks | Coverage: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **—** | **13a** baseline (`block-derived-alignment`, ADR-0271) | the first constructed envelope; the pattern | → 24.0% | shipped | **SHIPPED** | UNASSIGNED |
| **0** | Prerequisites: clau→pack registry (de-hardcode `siteDispatch` ~L983); **ADR-0272** coverage+FAR kind; structured refusal status distinct from `degenerate` | makes a new pack a data addition, not an editor edit | — | 6 d | **IN PROGRESS** (refusal status shipped via 1b/1c; registry owned by L-537 agent; ADR-0272 NOT STARTED) | UNASSIGNED |
| **1** | **13b** Densificació urbana semiintensiva | CONFIG ONLY — existing kind (13a/13b are Subzona I/II of the same PGM zone; Arts. 322/326 + Art. 242 shared). ⚠ Do NOT assume the 30% ratio carries — source it. | 24.0% → 32.7% (+8.7%) | 7 d (4 impl + 3 sourcing) | **NOT STARTED** | UNASSIGNED |
| **1b** | Systems + derived-plan **REFUSALS** (`SX*` `6*` `7*` `27/28/29` `1a` `1c` `3` `4` `5b` `9` `SH` + `18` `15` `16` `17/6` `8a` + composite claus) | replaces the fabricated setback triple on parks/motorways with a cited "no envelope applies" | 73.1% of GROUND stops fabricating | 4 d | **SHIPPED (L-550)** | UNASSIGNED |
| **1c** | Coverage-gap **REFUSALS** for every unpacked private clau (`13b` `12` `12b` `22a` `22@` `20a/*`) | fabricated setback triples city-wide 141 → 0; 51.6% of buildable land moves to a cited coverage-gap card | — (honesty, not coverage) | shipped | **SHIPPED (L-553)** | UNASSIGNED |
| **2** | **22a** + **20a** family (industrial + edificació aïllada) | NEW KIND (ADR-0272) — coverage + FAR. 20a uses `setback` genuinely; both need the caps. Sourced separately (Art. 350 vs the aïllada table). | 32.7% → 64.0% (+31.3%) | 26 d (18 + 8) | **NOT STARTED** | UNASSIGNED |
| **3** | **12** + **12b** Nucli antic | NEW KIND (ADR-0273) — Art. 316 block-occupation + REFUSAL on non-uniformly-zoned blocks + overlay-uncertainty refusal for catalogued Ciutat Vella parcels | 64.0% → 75.3% (+11.3%) | 28 d (8 src + 4 ADR + 12 impl + 4 overlay) | **NOT STARTED** | UNASSIGNED |
| **4** | **22@** (MPGM 2000, distinct instrument) + long-tail citations | own pack; cite the tail refusals properly | 75.3% → 76.0% (+0.7%) | 8 d | **NOT STARTED** | UNASSIGNED |
| **5** | **18** data acquisition (volumetria específica) | NOT a pack — investigate whether RPUC/NUMAMB exposes per-site approved volumetries as data. If yes → `explicit-area` engine branch + resolver. If no → cited refusal permanently. | up to +22.5% (→97.8% if it lands) | 12 d investigation; impl UNSCOPED | **NOT STARTED** | UNASSIGNED |
| **cert** | Per-clau **L-528** certification (fitxa urbanística in the MUC/RPUC viewer) | moves packs amber → green; **re-derives the RATE.md number** | — | ~15 d, parallel | **IN PROGRESS** (13a) | UNASSIGNED |

**TOTAL ~106 dev-days ≈ 21 weeks at 1 dev.** Phases 0 + 1 + 1b (17 d, ~3.5 wk) take coverage from
24% → 32.7% constructed and 100% honest — the disproportionate slice.

---

## 3 — The gap to Denmark (~96%)

**Barcelona's ceiling is ~48%, Denmark's is ~96% — a ~48-point gap, and it is not closable by more
engineering.** The separator is canonical case (a): **the numbers are in PDFs (the PGM prose) and, for
the derived-planning ~40%, in plànol drawings — not structured fields.** Two consequences the pilot
measured rather than assumed:

1. **One-time transcription + the L-449 human gate cap the CLIMB SPEED, not just the effort.** Each
   pack is amber (`estimated-ruleset`) until certified, and green requires per-parcel certification
   against the *fitxa urbanística* (L-528) — interactive GIS work, one task per clau. The gate is
   per-source, and a wrong source passes it as easily as a right one (the 13a source-vintage trap,
   L-526, recurred and required a founder re-sign).
2. **The derived-planning slice caps the CEILING itself.** Height is a plànol block-label in ~100% of
   documents that state one (L-590h). No amount of OCR reaches it; only plànol vectorisation does. So
   ~48% full-envelope is the honest wall — the ~80% figure conflated legibility (high) with
   sufficiency (low for the envelope).

Denmark has neither problem: its dimensional values are already digitised into structured national
fields, so almost no query reads a document. That single difference is the whole ~48-point gap.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

- **Shared prerequisites in flight:** L-537 *amplada de vial* (street width — reused by every
  alineació clau: 13a now, 13b Phase 1, 12 Phase 3; NOT by 18/20a/22a); L-525a Art. 327.2 height-table
  pattern (`bcnAlcadaReguladora.ts` — pattern reused, numbers are not, each subzone has its own table;
  the `BAND_EDGE_GUARD_M` refusal discipline reused with it); `dissolveParcelsToBlockRing` (2/2 in
  Barcelona, underpins every block-derived clau).
- **Top blockers (L-538 §7):** **R1** clau 18 is 22.5% of the city and may never exceed a refusal (the
  PGM points at a per-site document PRYZM may not obtain). **R2** Ciutat Vella heritage overlays are
  invisible to the data path — MUC returns `12` whether or not a Pla Especial binds, so a correct
  Art. 316 implementation still over-states buildability on protected parcels. **R3** the source-vintage
  trap repeating — six more packs, six more chances to sign a stale republication.
- **Reuse that pays forward to the whole corpus:** every pattern here is the national template. The
  block-derived construction + street-width machinery serves every Spanish *alineació-de-vial* zone;
  the refusal vocabulary (L-550/L-553) is the honesty layer every jurisdiction ships first; the L-528
  certification track is the amber→green model. Barcelona is the one city where depth in the rules
  converts directly into working output (`SPAIN-CADASTRAL-DISSOLVE-PROBE`: block-ring Barcelona 2/2 ·
  Madrid 2/4 · Córdoba 0/3), which is why "finish Barcelona first" is the measured sequencing.

---

*Model references: **Denmark** `../../dk/` (ceiling, ~96%) · **Barcelona** = this file (the pilot
climb every plan cites). Governing: **C58** (fidelity/provenance), **ADR-0269** (curate-then-serve),
**ADR-0270/0271** (rule kinds), **L-449** (human-verification gate), **L-538**
(`BARCELONA-COMPLETE-COVERAGE-PLAN.md`), **L-590h** (the measured sufficiency ceiling).*
