# L-525 — Envelope accuracy: the deep investigation (height + depth)

**Item:** L-525 (`../../V1-LAUNCH-READINESS-AUDIT.md`). Founder, 2026-07-21: *"the height of the
envelope doesn't correspond with the environment height … the buildings nearby are super tall and
way deeper … I want to analyse this really deep — we cannot have such mistakes."*

**Console evidence (CL Pau Claris 155, block 02309, clau 13a — "Densificació Urbana Intensiva"):**
```
§BCN-REAL-ENVELOPE block 02309 — 14 parcels (~6686 m²)
§BCN-MANZANA-PERIMETER — every one of the 58 block-ring edges IS a street frontage
buildable envelope computed → confidence=block-constructed status=ok inset=173.2m² height=n/a
envelope OK → depth=11.0m (binding=min-floor) inset=173.2m² of parcel~510m² (34% covered)
buildable envelope drawn via massing path: top 9.0 m
```

Two INDEPENDENT defects. The panel numbers are internally honest (depth cited; height shown `—`);
the defects are the **fabricated 3D massing height** and a **possibly-too-shallow depth from a
possibly-partial block**. **Neither is to be blind-fixed** — each needs a probe first.

---

## Defect A — HEIGHT is a fabricated ~9 m placeholder, not the real alçada reguladora

**What happens.** A 13a alignment zone has NULL `maxHeight_m` BY DESIGN (ADR-0270 — the panel
correctly shows `—`). The 3D massing prism therefore falls back to a **default ~9 m** (≈ 3 storeys).
Real 13a Eixample buildings are ~PB+5/PB+6 ≈ **20–25 m**, which is why the study volume reads far too
short next to the ~25 m photoreal neighbours.

**The rule (why height is a CONSTRUCTION, like the depth).** For 13a the **alçada reguladora màxima**
is not a per-parcel published number — it is derived from the **amplada de vial** (street width) via
the PGM height table (PGM NNUU, the alçada-reguladora articles ~§219–223). Approximate mapping
(VERIFY exact bands + values against the PGM before encoding):
| Street width (amplada de vial) | Storeys | Alçada reguladora |
|---|---|---|
| narrow (< ~10 m) | ~PB+3–4 | ~13.75–16 m |
| ~10–20 m (standard Eixample) | ~PB+5 | ~**20.75 m** |
| > ~20 m (wide avingudes) | ~PB+6 | ~**24.4 m** |
So the correct height for Pau Claris 155 is ~20.75 m (Pau Claris ≈ 20 m Cerdà street), **not 9 m**.

**Source probe (2026-07-21, inconclusive → treat as a construction).** No direct "alçada" layer was
confirmed on the Generalitat MUC / ICGC MUC WMS. So — exactly like the profunditat edificable (ADR-0271:
constructed from a real block + Art. 242.2) — the height must be **CONSTRUCTED**: PGM height table
(encoded) + the amplada de vial (sourced).

**Sourcing the amplada de vial (the open question).** OSM road `width` is unreliable → not
authoritative. Candidates to probe next session, in order:
1. **Catastro / municipal cartography** — the street polygon between opposing block frontages; the
   frontage-to-frontage distance IS the amplada de vial. We already have the block ring + roads; the
   width can be MEASURED as the perpendicular gap between a parcel's street frontage and the opposite
   block's frontage. **This is computable from data we already fetch** — likely the cleanest path.
2. Barcelona municipal open data (carrers / amplada) if published per street.
3. A conservative Eixample DEFAULT (~20 m → ~20.75 m) as an honest interim, badged "estimated height".

**Fix approach (L-525a).** (1) Encode the PGM alçada-reguladora table in the rule pack
(`esBarcelonaEnsanche.ts`) keyed by street-width band. (2) Compute the amplada de vial per the chosen
source (start with the measured frontage-to-frontage gap — it reuses the block geometry). (3) Drive
the massing prism height from it; badge the height with the SAME graded provenance as the depth
(constructed, cited). (4) Keep the panel's `maxHeight` semantics honest — surface the constructed
alçada in the alignment-zone summary (extends L-518c) rather than leaving the prism to invent 9 m.

---

## Defect B — DEPTH = 11 m (`min-floor`) is too shallow for Eixample

**What happens.** `binding=min-floor` = the 30%-free-space solve wanted LESS than the 11 m ordinance
floor and clamped up. Real Eixample profunditat edificable ≈ **20–28 m** (other parcels correctly gave
27 m this session). The trigger: **block 02309 dissolved to ~6,686 m² — roughly HALF a normal Cerdà
manzana (~12,000 m²)**. Insetting such a small block from ALL 58 perimeter edges (the §BCN-MANZANA-
PERIMETER all-front model, L-502) erodes the interior fast → the 30% rule floors out.

**Two candidate root causes — a probe distinguishes them:**
- **(b1) The block dissolve captured a PARTIAL / wrong manzana.** Does the 5-char Catastro *manzana*
  prefix (`02309`) correspond to a full Cerdà block here, or a sub-block? 6,686 m² / 14 parcels says
  *maybe not a full block*. **PROBE:** log the dissolved block-ring footprint (its bbox + area +
  vertex bearings) for a KNOWN parcel and overlay it on the photoreal tiles / satellite — does the
  ring trace the real Cerdà block outline, or only part of it? Compare `block.totalAreaM2` to the
  visible manzana. If partial → the `fetchBlockForParcel` / Catastro-manzana query or the dissolve is
  under-collecting parcels → fix there (this would ALSO have quietly shrunk earlier envelopes).
- **(b2) The all-perimeter inset is the WRONG depth MODEL for small/irregular blocks.** Even a whole
  small block: real profunditat edificable is a **street-frontage BAND** (buildings ~20–28 m deep
  along each street, leaving a central **pati d'illa** courtyard), NOT a uniform inset from every edge
  (including the 45° chamfered corners). For a big square manzana the two are similar; for a small or
  non-rectangular block, inset-from-every-edge under-shoots. **PROBE:** for a block confirmed whole,
  compare the all-perimeter inset depth vs a frontage-band construction (depth measured perpendicular
  from each street frontage, unioned) — do they diverge on this block?

**Fix approach (L-525b→c).** Do b1 FIRST (cheap probe). If the block is partial → fix the manzana
assembly (this is the higher-impact bug — it silently shrinks every envelope on affected blocks). If
the block is whole → b2: evolve `blockDerivedDepth.ts` from all-perimeter inset to a street-frontage
BAND model for non-square blocks (still Art. 242.2 — the depth from the frontages, courtyard interior).

---

## Sequenced plan (do NOT skip the probes)
1. **L-525b probe** — verify block 02309 (and 1–2 more parcels) dissolve to the FULL manzana. Cheapest,
   highest-impact; a partial block explains the shallow depth AND is a silent correctness bug.
2. **L-525a** — encode the PGM alçada-reguladora table + compute amplada de vial (start with the
   measured frontage-to-frontage gap); drive the massing height from it, badged as constructed.
3. **L-525c** — only if the block is whole: frontage-band depth model for small/irregular blocks.

Each step ships behind the existing graded-provenance discipline (RISK-REGISTER R1): a constructed
height/depth is badged "constructed", cited, never presented as an official certificate.

**Cross-refs:** L-518 (block-constructed tier), L-502 (manzana-perimeter), L-515 (frontage), ADR-0270/
0271, C57 (block assembly), C58, `blockDerivedDepth.ts`, `esBarcelonaEnsanche.ts`. Memory:
[[barcelona-edificabilitat-is-a-construction]].
