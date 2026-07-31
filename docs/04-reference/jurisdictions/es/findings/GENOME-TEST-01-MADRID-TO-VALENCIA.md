# GENOME TEST 01 — Madrid → València

**The first empirical test of the Spanish Planning Genome thesis.**

> **Verdict in one line: the thesis SURVIVES on discovery and SUFFERS A MATERIAL WOUND on scope.**
> A Madrid-calibrated engine found València's zoning layer at **rank #1–#2 of 693 with zero
> València-specific changes** — but the corpus's cost model is built on assumptions that València
> falsifies, and the honest effort estimate moves from **100 → 30** to **100 → 45–55**.
>
> Pre-registration (committed before any València request): [`GENOME-TEST-01-PREREGISTRATION.md`](./GENOME-TEST-01-PREREGISTRATION.md)
> Recon deliverable (P4.5 gate): [`../es-vc/46250-valencia/findings/VALENCIA-DATA-RECON.md`](../es-vc/46250-valencia/findings/VALENCIA-DATA-RECON.md)
> Tool: [`tools/spanish-genome-probe/`](../../../../../tools/spanish-genome-probe/)

---

## 0 — Audit trail

Ordering matters more than any number here, so it is in the git history, not just this document:

| Commit | What |
| ------ | ---- |
| `a0fd2940` | Pre-registration + Madrid-calibrated scorer, **before any València request** |
| `8b557bf7` | Blind València run, scorer byte-identical, result recorded verbatim |
| *this commit* | Role-scored re-analysis (**post-hoc**, see §4) + deliverables |

`heuristics.ts` was **never modified after `a0fd2940`** — its pre-registered SHA-256
`2f60aa73…` still verifies. The role refinement (§4) lives in separate files for exactly that reason.

---

## 1 — Results table

| # | Criterion | Pass condition | Result | Verdict |
| - | --------- | -------------- | ------ | ------- |
| **CH2** | Does València expose ArcGIS REST / WFS / OGC at all? | yes/no | ArcGIS Server **10.81**, 33 folders, no auth on planning; WMS per service; **no WFS found** | ✅ **PASS** |
| **CH1** | Madrid-calibrated scorer finds the zoning layer, zero València-specific changes | true layer in **top 3** | **#1 and #2 of 693** (both slots are the same dataset) | ✅ **PASS** |
| **CH2b** | Field heuristics find the zone-code field | identified without hand-mapping | **`califi`** found at confidence 0.70 | ✅ **PASS** |
| **CH5** | Lines of València-specific config | **< 200**, declarative only | **6 lines**, and **0 new algorithms/regexes/tokens** | ✅ **PASS** |

**All four criteria pass.** And yet the thesis is in worse shape than that table implies — see §5.

---

## 2 — Method

### 2.1 — Calibration (Madrid only)

Live crawl of `https://sigma.madrid.es/hosted/rest/services` — **10 folders, 116 services, 701
layers, 0 failures**. Every heuristic token is provenance-tagged to a pre-València source (`MAD`
Madrid-observed / `B11` founder batch 11 / `SEV` Sevilla batch 18a / `P41` phase 41 / `P42` phase 42).

Two calibration changes were needed, both made and documented *before* València:

| Change | Trigger | Effect on Madrid |
| ------ | ------- | ---------------- |
| **§ONTOLOGY-BONUS** — feed the field→ontology classification into the layer score | The first run put the true zoning layer at **#6/701**: the scorer computed a classification and discarded it. Madrid's zoning layer is *defined* by carrying `AMB_TX_ETIQ`+`AMB_TX_DENOM`, which crude name tokens do not match. | #6 → #4 |
| **§AMBITO-DEMOTION** — `ambito` +20 → +8 | Batch 11 lists `AMBITO` as a zoning signal. **Madrid shows that is wrong**: `ámbito` names the *planning-area* layer (APR/APE/API) — a different ground truth. At +20, ámbito layers outranked true zoning 3-to-1. | #4 → **#2** |

> **A finding in its own right:** one of the five generic Spanish heuristics the corpus tells you to
> start from is **actively harmful** for zoning discovery, and Madrid alone reveals it.

### 2.2 — Root discovery (pre-registered ladder)

`discoverRoots.ts valencia.es` generated **143 candidate URLs** from generic sub-domain prefixes ×
generic ArcGIS/OGC paths, with **no input beyond the bare domain**. One hit, at rung **R0** — the
cheapest rung, the one that counts as *no bespoke research*:

```
https://geoportal.valencia.es/server/rest/services   →  200, 33 folders, ArcGIS 10.81
```

**CH1 is therefore an unconditional pass, not the "conditional" outcome §4/rule 5 of the
pre-registration reserved for an R3 (web-search) discovery.**

### 2.3 — Blind run

One run, unfiltered across all 33 folders — **deliberately harder than Madrid's**, which was filtered
to 10 of 40 folders. 72 services, **693 layers**, **17 failures**.

### 2.4 — Ground truth, established independently

Per pre-registration decision rule 1, the true zoning layer was identified by **sampling actual
feature attributes**, not by asking the scorer. 25 rows from
`OPENDATA/UrbanismoEInfraestructuras/MapServer/231/query`:

```json
{"clase":"SU","califi":"ENS","tipoca":"1","uso":" ","origen":"PGOU",  ...}
{"clase":"SU","califi":"CHP","tipoca":"*","uso":"REB","origen":"PE2020", ...}
{"clase":"SU","califi":"EDA","tipoca":" ","uso":"EL","origen":"RI1635", ...}
```

`califi` carries the zone code. Confirmed.

---

## 3 — Blind result (primary evidence)

| Layer | Rank / 693 | Score |
| ----- | ---------: | ----: |
| `Tools/FichaUrbanismo/MapServer/14` — PGOU Calificaciones | **#1** | 86 |
| `OPENDATA/UrbanismoEInfraestructuras/MapServer/231` — PGOU - Calificaciones | **#2** | 86 |
| `Tools/FichaUrbanismo/MapServer/3` — Selección: Calificaciones | #3 | 71 |
| — first non-zoning layer — | #4 | 63 |
| `…/212` PGOU - Alineaciones | #15 | 48 |
| `…/275` PGOU - Origen (derived plans) | **#91** | 25 |

The true zoning dataset occupies **both** top slots (#1 and #2 are the same data, served twice), with
a **23-point margin** over the first non-zoning layer. `califi` was recovered as `zoneCode` at
confidence **0.70 via the alias-fallback path** — the field *name* `califi` matches nothing; its
Spanish **alias** `Calificación` matches `^calificacio\w*$`. That path was flagged in the
pre-registration as *"untested outside Madrid"*; it is what carried the result.

### 3.1 — Failure ≠ absence

**17 of 33 folders returned ArcGIS error `499 "Token Required"`.** These are auth-gated, not empty.
They include `Patrimonio_Historico` (heritage) and `GTECatastral`. Reporting them as "no data" would
have been the exact L-422/457/467/469 conflation. València's heritage layer is **UNKNOWN**, not absent.

### 3.2 — Which heuristics transferred, and which did not

This is as valuable as the verdict.

**Transferred (fired on Madrid AND València):**

| Kind | Tokens |
| ---- | ------ |
| Layer-name | `calificacio` · `edificacio` · `urbanistic` · `zona` · `pgou` · `alineacio` · `ambito` · `ordenanza` · `planeamiento` · `suelo` · `urbano` · `uso` |
| Field-signal | `altura` · `ambito` · `calificacio` · `grado` · `nivel` · `norma` · `ocupacio` · `planta` · `uso` · `zona` |
| Field rules | **12 of 26** fired on València (17 of 26 on Madrid) |

**Did NOT transfer — Madrid-only:**

| Token / rule | Madrid | València | Significance |
| ------------ | :----: | :------: | ------------ |
| `norma` (layer name) | ✅ | ❌ | **Madrid's flagship signal is dead in València.** "Norma Zonal" is a Madrid word, not a Spanish one. |
| `ordenacio` (layer name) | ✅ | ❌ | Sevilla's +20 *Ordenación* token — one of only five in the founder's scoring table — **missed València entirely**. |
| `AMB_TX_ETIQ` / `AMB_TX_DENOM` / `COEF_Z` / `TIPOAMB` | ✅ 4/4 | ❌ **0/4** | Exactly as pre-registered at 90 % confidence. The exact-name rules are worthless outside Madrid; the **generic morphology rules are what actually generalise.** |
| `edificabilidad`, `coef`, `alineacio`, `retranqueo` (field) | ✅ | ❌ | València publishes **no numeric planning parameter as an attribute**. |
| `zonificacio` | ❌ | ❌ | Fired in neither city. A corpus guess, so far unearned. |

### 3.3 — Pre-registered predictions, scored honestly

| # | Prediction | Confidence | Outcome |
| - | ---------- | ---------: | ------- |
| P1 | ArcGIS REST reachable, no auth | 70 % | ✅ **Correct** |
| P2 | Root under a `valencia.es` sub-domain, rung R0/R2 | — | ✅ **Correct** (`geoportal.valencia.es`, R0) |
| P3 | Zoning layer name contains `Calificación`/`Qualificació` (ranked #1 guess) | — | ✅ **Correct, first guess** |
| **P3b** | **Valencian spelling breaks `calificacio` / `planeamiento`** | — | ❌ **FALSIFIED** — València publishes **bilingual** layer names in one string (*"PGOU - Calificacions / PGOU - Calificaciones"*), so both forms are present. My predicted failure mechanism did not bite. |
| P4 | Zone-code field ranked guess `CODIGO` > `COD_ZONA` > `CLAVE` > `CALIFICACION` … | — | ⚠️ **Partial** — the answer is `califi`, an *abbreviation* not on my list; it was caught by the **alias**, not the name |
| P4 | `AMB_TX_ETIQ` will NOT appear | 90 % | ✅ **Correct** |
| P4b | Zone codes are short alphanumerics 2–5 chars | — | ✅ **Correct** (`ENS`, `EDA`, `CHP`, `GRV`…) |
| P5 | True layer in top 3 | 55 % | ✅ **Correct**, and better than predicted (#1–#2) |
| P6 | Zone-code field found without hand-mapping | 65 % | ✅ **Correct** |
| P7 | < 30 lines of config | 85 % | ✅ **Correct** (6 lines) |

Two corpus predictions also landed: **`PRI` and `PEPRI`** — named in València's RATE plan §V-3 as the
refusal-path probe target — are **present and machine-discoverable** (`PRI1108`…`PRI2089`,
`PEPRI2076`). And batch 11's guess that València uses **`ENS`/`EDA`** is **correct** (`EIX` is not).

---

## 4 — Role-scored re-analysis — **POST-HOC, NOT BLIND**

> **Honesty statement.** The coordinator specified the role refinement *after* the blind run had been
> executed and committed (`8b557bf7`). These numbers are therefore a **post-hoc analysis, not a blind
> test**, and they do not replace §3. `heuristics.ts` was left untouched so the pre-registration hash
> still verifies; role logic lives in `roles.ts` / `roleScoring.ts`. No València-observed token was
> added — the specific decoys the blind run surfaced (*Zonas Acústicamente Saturadas*, *Ordenanza
> Espacios Públicos*) are deliberately **not** special-cased.

The refinement is **correct and it materially improves the engine**. Verified on Madrid first:

| Role | Madrid #1 | Rank of the Madrid ground truth |
| ---- | --------- | ------------------------------- |
| zone-routing | `NORMAS_ZONALES/0` | **#1** (was #2 on the single score) |
| derived-plan | `AMBITOS_PLANEAMIENTO_URBANISTICO/0` | `PG_ORDENACION/3` at **#2** |
| **building-condition** | **`PG_CONDICIONES_EDIFICACION/6`** | **#1 — the layer the single scorer buried at #24** |
| alignment | `PG_GESTION/Alineaciones` | matches batch 3b §9 exactly |
| use | `PG_USOS_Y_ACTIVIDADES/9` | ✅ |
| parcel | `Parcelas Catastrales` | ✅ |

**The coordinator's diagnosis was right and the single-score metric was hiding a real defect.** The
envelope layer was unfindable not because it is hard, but because it was being asked the wrong
question: it carries no zone code, so a zoning-shaped score can never rank it. Given its own role it
is #1 with a 50-point margin.

### 4.1 — Role results on València

| Role | Result | Verdict |
| ---- | ------ | ------- |
| **zone-routing** | #1–#2 = PGOU Calificaciones, and the acoustic/by-law decoys are **gone from the top** | ✅ **PASS** — and cleaner than the single score, *without* any València token |
| **alignment** | #1 = `PGOU - Alineaciones` | ✅ **PASS** |
| **parcel** | #1–#2 = `Parcel·les cadastrals urbana/rústica` | ✅ **PASS** |
| **use** | #2–#3 = Calificaciones (correct); #1 is a stray point layer | ⚠️ partial |
| **derived-plan** | #1 = *"Ámbitos de Fomento de la Edificación"* — **WRONG** | ❌ **FAIL** |
| **building-condition** | top score 28, an unrelated layer — **no envelope layer exists** | ❌ **NOT FOUND** |
| **heritage** | top candidate is a tourist walking route; the real folder is **499-gated** | ⚠️ **UNKNOWN** |

Both failures are locked into tests (`roleScoring.test.ts`) *as failures*, so nobody can quietly patch
them with a València token and re-declare victory.

### 4.2 — Why derived-plan failed, and why it is the most important result in this document

Not a tuning problem. A **structural** one:

```
Madrid:    derived plan  =  a LAYER      (PG_ORDENACION/3, APR/APE/API polygons)
València:  derived plan  =  a FIELD      (`origen` on the zoning row: PGOU|PE2020|PRI1108|PEPRI2076|ED1375|MP2017…)
```

**A layer-shaped discovery engine structurally cannot see an attribute-shaped concept.** No weight
change fixes this; it needs a second discovery pass that classifies *field value vocabularies*, not
just field names. The same pattern repeats for **uses** (Madrid: `PG_USOS_Y_ACTIVIDADES` layer;
València: `uso`/`tipouso` columns).

València collapses four Madrid layers into one wider table. That is a **planning-family difference**
of exactly the kind founder §28 predicted would exist — but the discovery engine as specified
(phase 41: *"crawl every layer → score usefulness"*) has no concept of it.

---

## 5 — Did the Genome thesis survive? — the honest read

**It survived the test it was given. The test was easier than the claim.**

### 5.1 — What is genuinely proven

1. **GIS discovery generalises.** A root found from a bare domain by generic patterns; the zoning
   layer at #1–#2 of 693 with a byte-identical scorer. That is real and it is the load-bearing claim.
2. **The ontology generalises.** `zoneCode`, `grade`, `use`, `alignment`, `parcel` all appear in both
   cities under different names and were matched by generic Spanish morphology.
3. **Configuration really is thin.** 6 lines. CH5 passes with a 30× margin.
4. **D1 holds** (*GIS-first, not PDF-first*): the GIS answered "which zone, under which instrument, on
   which parcel" before any legal text was opened.
5. **The corpus's own guesses were unusually good** — `ENS`/`EDA`, `PRI`/`PEPRI`, "Calificación" as
   the layer name. That is evidence the founder's Spanish domain intuition is sound.

### 5.2 — What broke

| # | Broke | Fixable or fundamental? |
| - | ----- | ----------------------- |
| **B1** | **D6 — "zones are finite (~7), it's a vocabulary, once extracted it's done."** València has **109 base codes / 551 code+grade combinations**, ~15× Madrid. | **Fundamental to the cost model, not to the architecture.** Nothing breaks technically; the *estimate* does. Per-zone extraction cost scales with the vocabulary, and València's is 15× Madrid's. |
| **B2** | **Derived plans / uses are attribute-shaped in València, layer-shaped in Madrid.** | **Fixable, but it is new machinery** — a value-vocabulary classifier, not a weight tweak. It is genuinely reusable once built (prefix taxonomies are how Spanish instruments are coded). Cost: real, one-off. |
| **B3** | **No envelope layer.** Madrid's NZ1 footprint has no València equivalent; València publishes **zero numeric parameters** as attributes. | **Fundamental — it is a data fact about València, not a bug.** It means the "GIS-first" win is *routing only*, and every parameter comes from the PGOU text. |
| **B4** | **`ordenacio` and `norma` — 2 of the corpus's 10 headline heuristics — missed València entirely**, and `ambito` had to be *demoted* on Madrid evidence alone. | **Fixable and already fixed**, but it warns that a 10-token list distilled from one city is thinner evidence than it reads. |
| **B5** | **The refusal surface is large.** ~482 of 494 `origen` instruments are individual plan documents PRYZM will not hold. | **Fundamental.** Correctness demands *unknown*, and unknown will be common. |

### 5.3 — The number

The corpus's claim is **effort 100 → 30** for city #2 (footnoted in §V-3 as the thing this probe
settles). Measured against what actually happened:

| Axis | Reuse achieved | Note |
| ---- | -------------: | ---- |
| Root + service discovery | **~100 %** | R0, generic patterns |
| Layer classification (zone/alignment/parcel) | **~95 %** | zero new tokens |
| Field → ontology mapping | **~85 %** | alias fallback carried it; 12/26 rules fired |
| Derived-plan detection | **~0 %** | attribute-shaped; new machinery required (B2) |
| Envelope acquisition | **n/a** | does not exist in València (B3) |
| Legal extraction | **untested** | and 15× the zone vocabulary (B1) |

**Honest restatement: 100 → 45–55, not 100 → 30.** The *discovery* axis genuinely approaches the
claimed reduction. The *legislation* axis — which is 25 of C63's 100 points and the whole
differentiator — is **not derisked by this result at all**, and B1 makes it materially worse for
València than for Madrid.

This is the same bounding that §G-3 already recorded: *"effort reduction is real and probably large
for the legislation axis; it is unproven for the geometry/data axes."* **This test inverts that
sentence.** The reduction is proven for **discovery**, and B1/B3 make **legislation** look *harder*
in city #2 than in city #1. The corpus's own caveat had the axes the wrong way round.

### 5.4 — Scope discipline

Per Sevilla §S-1: this is a **CH** (city) result. It is **not** evidence for the national `NH1`, which
explicitly requires **20 municipalities, 16 passing**. One city passing its own CH1 proves nothing
Spain-wide. `n = 1`, and it is the city the corpus itself called *"probably the ideal second
implementation"* — i.e. the easiest available case.

---

## 6 — Recommendations

1. **Adopt role-scored discovery** as the engine's shape (§4). It is strictly better, it found
   Madrid's envelope layer that the single score could not, and it costs nothing extra.
2. **Build the value-vocabulary classifier (B2) before city #3.** Prefix taxonomies (`PE`/`PRI`/`ED`/
   `MP`/`PP`) are how Spanish planning instruments are coded; this is reusable, not a València patch.
3. **Correct D6 in the corpus.** "Zones are finite" is a Madrid property, not a Spanish one. Re-cost
   any plan that assumed it.
4. **Restate the scaling claim as 100 → 45–55**, split by axis, before it is used to plan the Spanish
   rollout — which is precisely what §G-2 asked for *"before three cities have been costed against it."*
5. **Run city #3 in a different autonomous community** (Sevilla, per batch 18a) to test whether B1/B2
   are València-specific or the general case. `n = 2` in one CCAA-pair is still weak evidence.
6. **Do not build phases 43–50.** Nothing here justifies the compiler superstructure yet; two of the
   nine modules have now been tested and one of them (layer classification) needed a redesign on
   contact with its second city.

---

*Executed 2026-07-31. Every claim traceable to a recorded request; raw artefacts under
`tools/spanish-genome-probe/results/` and `__tests__/fixtures/`.*
