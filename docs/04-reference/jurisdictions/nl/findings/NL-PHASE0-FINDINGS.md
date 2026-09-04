# NL PHASE 0 — M1–M6 MEASURED

> **Lane** ENVELOPE-NLDK · **measured** 2026-09-03 (samples) / 2026-09-04 (M4 correction)
> **Spec** [`NL-ENVELOPE-MASTER-PROMPT.md`](../NL-ENVELOPE-MASTER-PROMPT.md) §2
> **Machine-readable** [`nl-phase0/nl-phase0-report.json`](nl-phase0/nl-phase0-report.json)
> **Raw evidence** `nl-phase0/nl-phase0-sample-{land,urban}.json` (750 parcels), `nl-phase0-plantext.json` (70 plans)
>
> The master prompt §2 says **"STOP and report the six numbers before any construction work."**
> This document is that report. What was built afterwards is listed in §8.

---

## 0 · How the sample was drawn, and what that does to every number below

Two independent strata, both keyless, both against the PDOK "Ruimtelijke plannen" WMS + the
Kadaster cadastral service:

| stratum | n | how |
|---|---|---|
| **land** | 500 | tile-uniform over the NL land bbox, rejection-sampled to cadastred land |
| **urban** | 250 | oversample restricted to tiles with ≥ 15 parcels |

⚠ **A tile-uniform sample is not a parcel-uniform sample, and the two disagree by 3×.** A random
*point* on Dutch land lands in a big rural parcel far more often than a random *parcel* is rural.
Both are reported throughout and neither is "the" coverage figure:

- M1 `bouwvlak`, **tile-uniform over dry land: 11.2 %** (38/338)
- M1 `bouwvlak`, **parcel-uniform (tile-weighted): 36.7 %** (3488/9502)

Quoting one without the other is how a coverage claim becomes wrong by a factor of three.

**Command:** `node nl-phase0-parcels.mjs --n=500 --seed=20260903 --out=nl-phase0-sample-land.json`
(and `--n=250 --seed=20260904 --minTileParcels=15` for urban), then
`node nl-phase0-reduce.mjs > nl-phase0-report.json`.

---

## 1 · M1 — `bouwvlak` coverage

**By stratum** (dry land only; sea/major water excluded and counted separately):

| stratum | n | bouwvlak | % |
|---|---|---|---|
| urban (≥ 240 parcels/km²) | 131 | 26 | **19.8 %** |
| rural (< 240 parcels/km²) | 207 | 12 | **5.8 %** |
| dense-urban oversample | 249 | 49 | **19.7 %** |

**By `hoofdgroep`** — the number that actually matters, because it shows coverage is not low
uniformly, it is low *where nobody builds*:

| hoofdgroep | n (land) | bouwvlak | % |
|---|---|---|---|
| centrum | 2 | 2 | **100 %** |
| bedrijventerrein | 6 | 4 | **66.7 %** |
| maatschappelijk | 5 | 3 | **60.0 %** |
| **wonen** | 28 | 15 | **53.6 %** |
| bedrijf | 7 | 3 | 42.9 % |
| agrarisch | 99 | 8 | 8.1 % |
| water / natuur / verkeer / bos / groen / tuin | 118 | **0** | **0.0 %** |

⭐ **On residential land a bouwvlak is published for the majority of parcels.** The headline
"11.2 %" is dominated by agricultural land, water, roads, nature and forest — which is exactly
what **F2 (correct null)** is for.

---

## 2 · M2 — `maatvoering` fill

Two denominators, because "% of parcels with a plan" and "% of parcels inside a bouwvlak" answer
different questions:

| parameter | of parcels **with a plan** (land / urban) | of parcels **in a bouwvlak** (land / urban) |
|---|---|---|
| `maximum bouwhoogte` | 7.0 % / 11.3 % | **48.7 % / 40.8 %** |
| `maximum goothoogte` | 0.6 % / 2.8 % | 5.1 % / 12.2 % |
| `maximum bebouwingspercentage` | 1.7 % / 1.4 % | 12.8 % / 4.1 % |
| `maximum aantal bouwlagen` | 0.0 % / 0.9 % | 0.0 % / 2.0 % |
| **`inhoud`** | **0.0 % / 0.0 %** | **0.0 % / 0.0 %** |
| `dakhelling` | **0.0 % / 0.0 %** | **0.0 % / 0.0 %** |
| `nokhoogte` | **0.0 % / 0.0 %** | **0.0 % / 0.0 %** |
| FSI | 0.0 % / 0.0 % | 0.0 % / 0.0 % |

⚠ **`inhoud`, `dakhelling` and `nokhoogte` are structurally ABSENT — 0 of 556 parcels with a
plan.** But the plan-text census (§5) finds an `inhoud` constraint in **69.7 %** of plan texts and
`dakhelling` in **28.8 %**. **These rules exist and are not in SVBP2012 maatvoering.** Their
reachability is 🟡 `extractable`, never 🟢 `source-complete`, and reporting them as "absent" would
be a false statement about the instruments.

---

## 3 · M3 — status distribution (§9 taxonomy, F1/F2 SEPARATE)

| status | land (n=500) | urban (n=250) |
|---|---|---|
| **F2 — correct null** (water/infra/nature + agrarian outside a building area) | **273** | 110 |
| **F1 — plan exists, no envelope mechanism (A GAP)** | **26** | **49** |
| E — source missing | 157 | 37 |
| C — bounded underdetermined | 25 (+1 C-roof) | 34 |
| B — determined with conditions | 16 | 14 |
| A-eligible (⚠ *eligible* — Status A requires a human signature, §1) | 2 | 6 |

⭐ **F1 is concentrated in exactly the land people develop.** F1 by hoofdgroep, land + urban:
`wonen` **42**, `recreatie` 8, `tuin` 6, `woongebied` 4, `sport` 4, `maatschappelijk` 3.
F1 by bestemming is led by plain **`Wonen` (32)**.

This is the single most actionable number in the report: **the gap is not in the countryside, it
is on residential parcels that have a plan and no published envelope mechanism.**

⚠ **A-eligible is 2/500 and 6/250.** No parcel in this sample is Status A, because Status A is
unreachable without a human signature (§1) and none has been given.

---

## 4 · M4 — `peil` resolvability ⚠ CORRECTED 2026-09-04

70 plan texts fetched, **66 parsed**, 4 failed. Distinct governing plans in the sample: 322; all
322 publish a text URL.

- **A resolvable `peil` definition was recovered from 20/66 = 30.3 % of plans.**
- Those 20 carry **17 DISTINCT definitions** — `peil` is very nearly bespoke per plan.

**Physical reference classes** (a definition may reference several; most do):

| class | n |
|---|---|
| main-entrance-referenced | 14 |
| **adjoining-finished-ground** | **11** |
| water-or-dike | 8 |
| nap-absolute | 6 |
| authority-determined | 3 |
| road-crown | 2 |
| maaiveld-other | 1 |

> ⚠ **`adjoining-finished-ground` read `1` until 2026-09-04 and the true figure is `11`.** The
> Phase 0 classifier required the UNINFLECTED "aansluitend afgewerkt maaiveld"; Dutch legal prose
> writes the INFLECTED "het aansluitende afgewerkte maaiveld", which neither regex branch matched.
> The defect was caught by `packages/site-parcel-data/__tests__/nlPeil.test.ts`, whose fixture is a
> definition **quoted from the sample** (`NL.IMRO.0344.BPCHWZUILEN-VA01`) rather than written by
> the same hand as the regex. Corrected offline from the stored texts by
> `nl-phase0-reclassify-peil.mjs` — **no re-measurement, no new network traffic.**
>
> **Why it mattered rather than being a rounding error:** `aansluitend AFGEWERKT terrein` is the
> ground *as finished after construction* — expressly **not** current terrain. It is the class most
> likely to be silently replaced with an AHN elevation, because it reads like "ground level". At
> 1/20 it looked like a rarity not worth handling. It is the joint-commonest reference in the corpus.

**Verdict: `peil` is unresolvable from structured data on ~70 % of plans, and where it IS
recovered it is usually MULTI-BRANCH** ("a. …at the road; b. …at the finished ground; c. …in
water: NAP"). Which branch binds depends on where the building's main entrance will be — a fact
about a building that does not exist at envelope time. That is not an unknown better data fixes;
it is the `RuleState` **`alternative`** arm.

---

## 5 · M5 — roof determinacy ⭐ THE PRODUCT-SHAPE FINDING

**M5a — structured co-occurrence, over 750 parcels:**

| | land (n=500) | urban (n=250) |
|---|---|---|
| `goothoogte` present | 2 | 6 |
| `bouwhoogte` present | 24 | 24 |
| **both co-occurring** | **1** | **0** |
| of those, with NO roof-form maatvoering | 1 | — |
| **⇒ underdetermined by maatvoering alone** | **100 %** | n/a |

**M5b — the roof rules in the plan TEXT (66 plans):** `dakhelling` **28.8 %**, `kap` 27.3 %,
`dakkapel` 33.3 %, `dakvorm` 12.1 %, `nokrichting` 10.6 %, `plat dak` 9.1 %, `nokhoogte` 6.1 %.

### The verdict the brief asked for

> *"if roofs are underdetermined on most parcels, `UNDERDETERMINED` is the MAIN PATH, not the
> exception."*

**It is the main path, and by a wider margin than anticipated.** The structured fields determine a
roof on **zero** parcels in 750. The roof rules exist — in prose, in a quarter to a third of plans.

**Three consequences, all built (§8):**

1. The honest state is `mechanism: 'present'` + `failure: 'pdf'` — the instrument HAS a roof rule
   and PRYZM did not extract it. It is **not F1** and **not** "any roof is permitted".
2. `bouwhoogte` **without** `goothoogte` (24 vs 2, 24 vs 6 — the commonest shape by far) is a
   *different and legally grounded* state: the plan does not distinguish wall from roof, so it
   does not shape the roof at all. `refused` / `no-limit-stated`, not a gap.
3. The refusal needs its escape hatch (L-942): the two limits **do** bound the roof tightly. The
   bounding prism between the eaves plane and the overall cap is honest and drawable; a roof
   surface inside it is not.

---

## 6 · M6 — Omgevingsplan vs legacy Wro/IMRO

| | land | urban |
|---|---|---|
| IMRO2012 | 373 | 232 |
| IMRO2008 | 14 | 9 |
| IMRO2006 | 1 | 1 |
| `bestemmingsplan` | 376 | 240 |
| `inpassingsplan` | 11 | 1 |
| governing plan dated ≥ 2024-01-01 | 101/388 = 26.0 % | 74/242 = 30.6 % |

⚠ **Zero Omgevingsplan / IMOW instruments were observed in either sample.** Every governing plan
reached through the keyless PDOK route is legacy Wro/IMRO.

⚠ **The 26–31 % "on or after the Omgevingswet date" figure is a DATE, not an instrument type,
and must not be read as Omgevingsplan uptake** — a plan published in 2025 under IMRO2012 is still
a legacy instrument. The correct reading is: **the keyless PDOK "Ruimtelijke plannen" route serves
the legacy corpus.** Whether that is because the Omgevingsplan corpus is small, or because it is
served by the DSO APIs and not by this WMS, **this sample cannot distinguish** — the DSO route is
a separate, key-gated probe that was not run. Recorded as an open question, not a coverage claim.

---

## 7 · Additional census (66 plan texts) — what the traps actually cost

| theme | frequency | consequence |
|---|---|---|
| **`inhoud` constraint** | **69.7 %** | a real cubic constraint on 2 of 3 plans, in text only (M2: 0 % structured) |
| `afwijking` (discretionary) | 93.9 % | §7.8 — never silently a right |
| `overgangsrecht` | 93.9 % | temporal |
| `bevoegd gezag` | 78.8 % | discretionary |
| `bebouwingspercentage` | 25.8 % | **denominator split: `perceel` 16.7 %, `bouwvlak` 15.2 %, `bestemmingsvlak` 6.1 %** — overlapping, so the denominator genuinely varies and is **not assumable** |
| `monument` | 28.8 % | permit-free carve-out (SUBTRACTS) |
| **`molenbiotoop`** | **18.2 %** | the inclined-plane operator — 1 plan in 5 |
| `beschermd stadsgezicht` | 12.1 % | permit-free carve-out (SUBTRACTS) |
| `achtererfgebied` | 9.1 % | vergunningvrij input |
| `voorrang` / `voorrangsregeling` | 7.6 % / 1.5 % | §5D — a DISTINCT operation from intersection |
| `vergunningvrij` | 1.5 % | rarely named in the plan; it is national law |

---

## 8 · What was BUILT against these numbers

| module | drives | tests |
|---|---|---|
| `rulepacks/nlPeil.ts` | M4 — peil as a first-class legal variable; `legally-bounded-datum-unresolved` as a VALUE. ⛔ `peil = AHN` is not expressible: evidence must name WHICH legal reference it measured, and a mismatched class refuses. | `__tests__/nlPeil.test.ts` (19) |
| `rulepacks/nlRoofDeterminacy.ts` | M5 — `UNDERDETERMINED` as the main path, with the §15 hand-built fixture asserting *no triangle* (structurally: no pitch, no ridge, no surface). | `__tests__/nlRoofDeterminacy.test.ts` (15) |

Both project onto the SHARED `RuleState` vocabulary (`packages/schemas/src/site/zoning/RuleState.ts`,
ENVELOPE-FR) — adopted, not re-minted — so NL, FR, DK and NSW coverage can be counted together.

## 9 · NOT built, and why — the honest remainder

- **`bebouwingspercentage` denominator record** (§7.2). The trap is real and measured (three
  competing denominators, overlapping, in 25.8 % of plans). `LandBasis.ts` (C63 §3.2) already holds
  the canonical denominator vocabulary and is the right seat. **Not built this lane** — named, not faked.
- **`inhoud` volumetric test** (§7.5). 69.7 % of plans, 0 % structured. Needs the text extractor first.
- **`voorrangsregeling`** (§5D) as an operation distinct from intersection.
- **Vergunningvrij with monument / beschermd-stadsgezicht carve-outs FIRST** (§8).
- **Molenbiotoop** — see the inclined-plane note in the lane report: the shared primitive
  (`geometry/inclinedTop.ts`) already exists and is line-anchored; a molenbiotoop is **radial**, so
  the NL adapter must resolve the cone into a fan of tangent planes. Tangent planes min'd together
  UNDERSTATE a convex cone, which is the safe direction — but it was not built this lane.
