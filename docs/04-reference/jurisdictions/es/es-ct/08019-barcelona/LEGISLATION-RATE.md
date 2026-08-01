# Data Readiness Rate — Barcelona (`es-ct`, INE 08019) city — THE PILOT

**Headline rate: ~48%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| **Barcelona** | **~48%** |
| Spain (national) | ~34% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |

Barcelona is **the PILOT exemplar** — the pilot-model reference every other jurisdiction's
implementation plan cites. Its ~48% sits well above the Spanish national ~34% because the numeric
zoning has been *constructed*, not merely classified: the zone code (clau) is live via the MUC WMS,
and for the *alineació-de-vial* fabric (13a/13b/12 ≈ 44% of buildable land) the density and height
are **derivable from structured inputs** — the block ring (`dissolveParcelsToBlockRing`, 2/2 in
Barcelona), the official street width (*amplada de vial*, L-537), and the PGM Art. 242/327
construction transcribed once from the ordinance. So a full envelope comes back **without a per-parcel
PDF read** for those parcels — the definition of the metric.

It is held BELOW Denmark's 96% for one structural reason, measured over 24 primary documents in
`findings/L-590h-…-SUFFICIENCY-CEILING.md`: **~40% of Barcelona's private buildable land is
derived-planning (clau 18 + the 22a Pla Parcials), where the parameters live in per-site plànols, and
OCR recovers a sector FAR in ~37% of documents but a parcel-level HEIGHT in ~0%** — the height is a
block-label whose geometry is on the drawing, not text. **~48% is therefore both Barcelona's measured
data-readiness rate AND its realistic full-envelope ceiling**; OCR buys a partial (FAR-only) quality
tier over the derived slice, not resolution points. The ~80% figure some earlier notes quoted is
reachable only with plànol vectorisation (drawing-understanding), which is beyond OCR.

⚠ **The rate is not the product's current coverage.** PRYZM today *constructs* an envelope on ~24% of
buildable land (13a shipped) and returns an honest, cited answer on 100% (systems + coverage-gap
refusals, L-550/L-553 SHIPPED). The phased climb to realise the ~48% ceiling is in
[`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md).

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Structured | Catastro INSPIRE WFS (national), in production. Block ring derived via `dissolveParcelsToBlockRing` — **2/2 success in Barcelona** (L-535). | **~95%** |
| Plan/zone existence + boundary | ✅ Structured | AMB MUC WMS (`qualificacio_refos`) — the PGM zone polygons cover the whole municipality. | **~90%** |
| Zone/use code (clau) | ✅ Structured | MUC `CODI_QUAL_AJUNT` via `server/mucZoningProxy.js` — the municipal *clau* the rule packs key on (the harmonised `CODI_QUAL_MUC` is too coarse: 13a/13b both `R2`). Live, per-parcel. | **~85%** |
| Density metric (FAR / depth / coverage) | ⚠️ Partial — constructed, not published | 13a **shipped** (`block-derived-alignment`, ADR-0271: depth constructed from the block ring per PGM Art. 242). 13b/12 constructible by the same machinery once the PGM parameters are transcribed (config only for 13b). 22a/20a need a coverage+FAR kind (ADR-0272, not built). **18 + the 22a Pla Parcials: the number is on a per-site plànol** — OCR gives sector FAR ~37%, never a parcel value. | **~40%** (constructible for the alineació fabric; refusal for the derived slice) |
| Max height (parcel-level) | ⚠️ Partial — constructed via street width | Art. 327.2 height table keyed on *amplada de vial* (`bcnAlcadaReguladora.ts`, L-525a; PB+5 figure uncertified pending L-528). Street width is derivable (L-537). For derived-planning: **height extractable ~0% by OCR** — it is a plànol block-label (L-590h §2.2). | **~35%** (alineació fabric constructible; derived slice ❌) |
| Setback / alignment | ✅ Kind resolved (ADR-0270) | The alineació-de-vial claus are `alignment`/`block-derived-alignment` (inset then half-plane clip), NOT setback — the shape is correct, not coerced. 20a is genuinely `setback`. | **~55%** |
| Building footprint + height (LOD1/2) | ⚠️ Partial | Footprint via Catastro/OSM bake (MEASURED 104–121% of OSM ground truth). Height: **0.9% surveyed · 79.3% `levels`×3.2 m · 19.8% fabricated 9 m** (L-582). nDSM not built. | **~40%** footprint; height ~1% real |
| Terrain (DTM/DSM) | ✅ / ❌ | Cesium World Terrain sampled in production. ⚠ Seated on ONE centroid sample, not the façade *rasant* the ordinance measures from (L-584 §3) — a correctness defect, not a coverage one. nDSM ❌. ⬆ **2026-08-01: the RULE is now transcribed** — PGM **Art. 240** states the datum in full (240.1.a/b/c · 240.2 · **240.3 corner** · 240.4), `facadeRasantDatum.ts`. The blocker is now purely the **terrain posting** (probe V8: 57.34 m served vs ≤ 10 m needed). | **~85%** terrain datum; **rasant RULE ✅ transcribed, rasant DATA ❌**; nDSM ❌ |
| Heritage overlay | ❌ Absent as data | Ciutat Vella *Pla Especial* + *Catàleg del Patrimoni*: **the MUC clau does NOT report whether one binds** — a parcel returns `12` regardless (L-538 §3.4). No queryable layer confirmed. Potentially the hardest blocker for clau 12. | **~10%** |

---

## The structural gap

**The alineació fabric is constructible; the derived-planning slice is plànol-bound.** Barcelona's
~48% is the sum of two very different regimes. For 13a/13b/12/12b (~44% of buildable land, PGM
*ordenació segons alineacions de vial*), the ordinance states a construction — a depth from the block
ring (Art. 242) and a height from the street width (Art. 327) — so once the PGM parameters are
transcribed **once** (L-449-gated, amber tier), the per-parcel answer is derived from structured
geometry with no per-parcel PDF. That is the pilot's proof that a PDF-authored rule can still yield a
structured answer.

The other regime is the wall. **Clau 18 (volumetria específica, 22.5%) and the 22a Pla Parcials point
at a per-site document** — the PGM does not state the rule, it names another instrument, a different
one per site. `findings/L-590h` measured 24 of these by vision: a directly-extractable **sector FAR**
in ~37%, a parcel-level **height in 0%** (block-label→plànol in every height-bearing document, image
quality no obstacle). So OCR moves this slice from a blank refusal to a partial FAR-only answer — the
honest ceiling is ~48% full-envelope, and ~80% is gated behind plànol vectorisation, not characters.

The honesty machinery is the pilot's real product: systems (73.1% of ground) and coverage-gap claus
render a **cited "no envelope applies"** (L-550/L-553 SHIPPED), never a fabricated setback triple.
"Complete Barcelona" means every parcel gets an honestly-tiered answer — constructed (amber),
refused-with-reason, or certified (green) — not a polygon on every parcel.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Ship 13b (config only, existing `block-derived-alignment` kind) | +the 13b share of constructible envelopes | 7 dev-days (4 impl + 3 sourcing) |
| Ship the coverage+FAR rule kind (ADR-0272) → 22a + 20a | Constructed answers on +31.3% of buildable land (a FAR/coverage cap, not a boundary envelope) | 26 dev-days |
| Ship clau 12/12b (ADR-0273: block-occupation + non-uniform-block refusal + overlay flag) | +11.3%, with a material fraction of Ciutat Vella correctly REFUSING | 28 dev-days |
| L-528 per-clau certification (fitxa urbanística in the MUC/RPUC viewer) | Moves packs amber → green (raises confidence, re-derives the rate) | ~15 dev-days, parallel |
| ~~Resolve the *rasant* datum (L-584 **V7**, the reading task)~~ | ✅ **DONE 2026-08-01.** PGM **Art. 240** states it all, corner case included; transcribed + tested in `facadeRasantDatum.ts`. Nothing had to be constructed. | ~~a reading task~~ — closed |
| **Serve MDT05 under Barcelona (L-584 V8 §V8.6)** — then wire the sampler | The remaining half of L-584, and it is now the whole of it. Correctness on sloping streets (Gòtic) — does NOT raise the rate, protects it. ⛔ The sampler must NOT be wired first: at 57.34 m posting it would return an artefact and close L-584 falsely. | a two-value bake config change + the viewport seat |
| Plànol vectorisation (block-label → parcel geometry) for the derived slice | The only path from ~48% toward ~80% — a drawing-understanding project, partly un-OCR-able | Large, unscoped |

---

*Last updated: 2026-07-24. MUC clau, Catastro parcel WFS, block-ring dissolve (2/2) and Cesium
terrain confirmed live. 13a shipped (`block-derived-alignment`); systems + coverage-gap refusals
SHIPPED (L-550/L-553). Derived-planning ceiling MEASURED over 24 documents (L-590h): FAR ~37%, height
~0%. ~48% is both the measured rate and the realistic full-envelope ceiling. Maintainer: UNASSIGNED.*
