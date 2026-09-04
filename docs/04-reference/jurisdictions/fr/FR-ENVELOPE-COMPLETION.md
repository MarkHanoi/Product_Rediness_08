# FR — envelope completion status

> **Stamp** 2026-09-04 · **Source** lane ENVELOPE-FR primary measurement (commits `1f438627`,
> `ad37de00`, `61b8971f`, `e784f974`) · **Pattern** identical across all 16 jurisdiction dossiers.
>
> ⛔ **Every number here is MEASURED and names its source.** Where a figure was never measured the
> cell says `not-measured` — an honest blank, never an interpolation. Read §1.3 before quoting any
> percentage.

---

## §1 — Completion

### §1.1 — The headline, and why it must not travel alone

| Metric | Value | Numerator / denominator |
|---|---|---|
| **Parameter recovery** | **23.7 %** | 185 / 781 applying rules |
| Honest-answer rate | 32.3 % | includes typed refusals as correct answers |
| Area-random sample | 19.2 % | |
| Urban sample | 28.0 % | |

**Definition** — of the rules that apply to a random parcel, the share PRYZM recovers as an
**authoritative parameter without human judgement**.
**Method** — 100-parcel audit, seed `20260904`, re-runnable; per-field trace retained.
**Source** — `docs/04-reference/jurisdictions/fr/findings/fr-100-parcel-audit/`.

### §1.2 — ⭐ The split that explains the headline

```
INSTRUMENT layer  (B1 document + B2 zone)   170/189 = 89.9 %
PARAMETER  layer  (C2 C4 C5 C6 D1)           15/500 =  3.0 %
```

> **France publishes *which rule applies* 89.9 % of the time, and *what the rule says* 3.0 % of the
> time.** The 23.7 % headline averages two different problems. **Do not quote it without the split.**

This is the founder's own layer stack, measured: `DATA ACCESS 🟢 → SPATIAL INTERSECTION 🟢 → RULE
CLASSIFICATION 🟢` are effectively solved; `PARAMETER EXTRACTION 🟡` is where the work is.

### §1.3 — ⛔ Two caveats that must travel with the number

- **It measures the NATIONAL GPU/WFS chain only.** Paris records `unrecovered/pdf` for height while
  the shipped `resolveParisPluZone.ts` already reads the real `plub_hauteur`. **Where municipal packs
  exist, true recovery is HIGHER than 23.7 %.**
- **`graphic = 0` and `discretionary = 0` are TRACE-DEPTH ARTEFACTS**, not findings about France. The
  trace stops before a graphic would be reached.

### §1.5 — ⭐ The GPU-only CEILING — 3.0 % is not our failure rate

⛔ **The CNIG prescription schema has NO NUMERIC VALUE FIELD.** `PRESCRIPTION_SURF/_LIN/_PCT` carry
`TYPEPSC`, `STYPEPSC`, `NATURE`, `LIBELLE`, `TXT`, `NOMFIC`, `URLFIC`, `IDURBA`, `DATVALID` — and
`URLFIC` is defined as *a link to the file containing the text*, hyperlink, empty permitted.

**Paris's `txt=""` is the schema behaving as specified.** The 9-of-24 height result therefore samples
a **STRUCTURAL CEILING**, not producer quality. A row that must be measured and published:

```
GPU-only ceiling — share of applying prescriptions
with a parseable numeric TXT ............................. n/500 = NOT-MEASURED
```

That reframes the headline from *"we recover 3.0 %"* to *"the national chain can yield at most X %,
and we recover 3.0 of it."* ⭐ It also forecloses the inevitable "clean up `TXT`" proposal — there is
nothing to clean; the field was never specified to hold a number.

### §1.6 — ⭐ The target is TYPED OUTCOMES, not 100 % parameters

> **"All parcels" is not reachable, and being exact about which part determines what you build.**

Three things are not data problems and will not become ones: **the ABF's future decision**,
**mitoyenneté as a legal fact**, and **PAU as an authoritative determination** — on the last, the
State's own answer to a parliamentary question is that appreciation of urbanised character depends
closely on local circumstances, so **there can be no definition, still less national criteria**; the
notion is left to the local authority under the judge's control. **That is a legislature deliberately
declining to define a standard. No dataset closes it.**

⭐ **So `done` is redefined: every parcel returns a typed outcome** — a parameter set, a
declared-method derivation, or a cited refusal — **and never a silent null.**

**The target is `unrecovered/silent = 0`, not `recovered = 100 %`.**

And the single completion figure should be replaced by a **matrix — regime × parameter × source
tier** — every cell independently measured, honest zeros visible. The `D1`-at-0 % row already proves
the principle: the withdrawn *"France has no D1"* claim would have deleted the row, and **the row is
the finding.**

### §1.4 — The instrument measured its own defect first

The smoke run drew **HTTP 429** and labelled parcels `inaccessible` whose data was fully served —
*"our rate limit would have been published as France's data gap."* Throttled; the final run carries
**0 transient notes**, which is the only reason `inaccessible = 0` is trustworthy.

---

## §2 — What is ACCESSIBLE today

- **Parcel geometry** — 🟢 `source-complete`. IGN / `data.geopf.fr` WFS
  `CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle`, keyless, live-probed. Wired via `/api/parcel/fr`.
- **Terrain** — 🟢 `source-complete`. RGE ALTI via the Géoplateforme altimetry service; elevations
  and profiles.
- **Planning document identity + version** — 🟢 measured **89.9 %** at the instrument layer. GPU
  serves document id, type, status, approval date.
- **Zone geometry + zoning code** — 🟢 part of the same 89.9 %. `ZONE_URBA`, `DOC_URBA`.
- **Prescription EXISTENCE, TYPE and LOCATION** — 🟢. The CNIG PLU 2025 code list is a closed,
  machine-readable taxonomy, now typed as a decision tree in
  `packages/site-parcel-data/src/rulepacks/frCnigPrescriptionTree.ts`.
- **SUP, OAP perimeters, information layers** — 🟢 reachable via GPU.
- **Buildings + heights** — 🟢 BD TOPO (BD TOPO Express weekly).
- **Roads** — 🟢 national reference geometry (the input to a computed frontage).
- **Commune RNU status** — 🟢 API Carto.
- **Historical permits** — 🟢 SITADEL, monthly, queryable by parcel or geometry.
- **Addresses** — 🟢 BAN via the Géoplateforme geocoder.
- **Land cover / protected areas / transactions** — 🟢 OCS GE · INPN · DVF.

---

## §3 — What is BLOCKING

Ranked by measured contribution to failure. **529 failures over the sample.**

- **1. The règlement is a PDF — `pdf`, 389 failures (73.5 %).** `not-built`. The value exists and is
  reachable; nothing parses it. ⭐ **This single leg is the largest lever in France.**
- **2. ⛔ SRU XML is absent from the corpus — 0 of 81 documents** (66 `.pdf`, 15 `.pdf#page=N`).
  `missing-source`. **This INVERTS PRYZM's own audit**, which ranked the SRU parser
  *"highest value-per-effort"*. **Build the PDF leg; keep SRU opportunistic.**
- **3. Rule text resists parsing — `semantic`, 81 failures.** Compositional French constructions
  that keyword matching cannot resolve: *"sauf indication contraire portée au document graphique"* ·
  *"la hauteur peut être portée à … lorsque …"* · *"au droit de …"* · *"sous réserve que …"*.
  ⚠ **This bullet previously illustrated the point with `"ter plaatse van…"`, which is DUTCH** — it
  leaked from the NL lane's brief into the FR document. Corrected 2026-09-04. Naming the shapes
  correctly also tells the parser builder what to target.
  ⛔ **Split before budgeting:** `semantic-resolvable` vs `semantic-irreducible`, measured separately.
  CNIG SG6 concedes a written règlement will never be 100 % modellable at level 2 — ambiguous
  formulations, exceptions and particular cases resist modelling; the goal is progressive coverage of
  principal rules, not exhaustiveness. One undifferentiated bucket invites budgeting against an
  asymptote.
- **4. `missing-source`, 59 failures — MOSTLY A MISCLASSIFICATION.** ⭐ **9,461 of France's 35,010
  communes have no local urbanism document at all and are subject to the RNU — 23.77 % of national
  surface** — plus **2,973 carte-communale communes** whose authorisations are instructed on the RNU
  basis (art. R.162-1). In roughly **12,400 communes there is no municipal PDF to parse**: the
  applicable rules are national articles, one fixed corpus already structured by the Code's own
  numbering. *"No PLU found"* is the observation; *"no source"* is the wrong inference.
- **5. A prescription exists but carries no value.** Only **9 of 24** parcels with a `39.x` height
  prescription yielded a number. Paris: `libelle="Hauteur plafond"`, `txt=""` —
  **`RULE EXISTS = YES, RULE VALUE = NOT ALWAYS`, observed.**
- **6. RNU → PAU — `discretionary`, hard 🔴.** Commune RNU status is served; there is **no national
  parcel-level *parties actuellement urbanisées* dataset**. **PRYZM must REFUSE, never infer.**
- **7. ABF / authority discretion — `discretionary`, hard 🔴.** The constraint is reachable
  (monument historique, SUP AC1, heritage zone); the future decision is not a dataset.
- **8. Legal party-wall status — `discretionary`, hard 🔴.** *Touches the boundary* is geometric;
  *is legally mitoyen* is a property-law fact national GIS cannot settle.
- **9. The height DATUM — `semantic`.** Terrain is 🟢; whether the PLU means *terrain naturel /
  après travaux / niveau de la voie / égout / acrotère / faîtage* lives in the RULE.

**Not a blocker, and previously miscounted as one:** **frontage** is a deterministic computation over
cadastre + road network + parcel polygon (`derivable`), not a missing dataset.

---

## §4 — Per-parameter state

| Envelope slot | State | Evidence |
|---|---|---|
| Parcel geometry | **source-complete** | IGN WFS, keyless, live-probed |
| Terrain | **source-complete** | RGE ALTI |
| Height **datum** | **interpretive** | definition is in the rule, not the terrain |
| Zone / classification | **source-complete** | 89.9 % instrument layer |
| Applicable plan + version | **source-complete** | 89.9 % instrument layer |
| Prescription type + location | **source-complete** | CNIG code list, typed as a tree |
| **Max height** | **extractable** | 9/24 yielded a number; the rest are `pdf` |
| Storeys | **extractable** | same channel |
| Floor-area rule (**D1 / surface de plancher**) | **extractable** | ⭐ **measured at 0 %** — and the withdrawn *"France has no D1"* claim would have made this row **invisible** |
| Emprise au sol (site coverage) | **extractable** | `38.02` classified; value in the PDF |
| Setbacks (road / lateral / rear) | **extractable** | `15.01 / .02 / .03` classified; value in the PDF |
| Volumetry | **extractable** | `40.02` classified; **`40.x` observed 0×** in the sample |
| Building depth | **not-measured** | |
| Building alignment | **not-measured** | |
| Roof geometry | **not-measured** | |
| Frontage | **derivable** | computation over cadastre + roads, **not built** |
| **Qualitative rules** (`39.97` / `40.97`) | **interpretive** | ⚠ real but **RARE**: `.97` 0×, `.98` 1× — ship for honesty, **not a coverage lever** |
| RNU → PAU | **undeterminable** | 🔴 hard refusal |
| ABF outcome | **undeterminable** | 🔴 administrative process, not a dataset |

---

## §5 — Next measurable steps

> ⛔ **Superseded in sequence by the founder review of 2026-09-04** —
> [`FR-FOUNDER-BLOCKER-REVIEW.md`](FR-FOUNDER-BLOCKER-REVIEW.md) carries the full 8-move plan and its
> reasoning. The PDF leg is **move 7 of 8**, not move 1: four cheaper moves shift the honest-answer
> rate first, and one single run decides whether the PDF leg is even the right investment.

**The corrected order:**

1. **RNU / carte-communale national rule pack + regime lookup** — days. ~12,400 communes need no PDF
   at all; commune RNU status is already served by API Carto.
2. **Publish the GPU-only `TXT` ceiling** (§1.5) — hours. Stops phantom budgeting.
3. **Re-run seed `20260904` with `resolveParisPluZone.ts` ENABLED** — one run. ⭐ This decides
   move 6 vs move 7 and costs almost nothing.
4. **Frontage derivation** — days. Unblocks every `15.01` road-setback rule.
5. **PAU as `derivable-non-authoritative` + the datum enum** — ~1 week. Turns two hard 🔴 into typed
   answers.
6. **Municipal packs** — APUR, then Lyon, then the rest. Parameter-recovery ↑↑, developer-weighted.
7. **The règlement PDF leg** — months.
8. **LiDAR HD swap-in** — days, gated on coverage.

⚠ **Restated honestly:** the PDF leg **puts 389 of 529 failures within reach; post-parse yield is
UNMEASURED.** Reaching a PDF is not recovering a value — an unknown share lands in `semantic` after
parsing. The earlier phrasing *"addresses 389 (73.5 %)"* overclaimed and is withdrawn.

⛔ **Do not sequence an SRU-XML parser first.** It measured **0 of 81** — and see §1.5 for *why*, so
the question stays closed.

---

## §6 — Gaps in evidence

- Building depth, building alignment and roof geometry were **not traced** — no state, not a zero.
- `graphic` and `discretionary` failure counts are **trace-depth artefacts** at 0, not measurements.
- The audit covers the **national chain only**; municipal packs (Paris and any others) are excluded,
  so the true national recovery rate is **higher than 23.7 % by an unmeasured margin**.
- **Three `D1` targets remain uncorrected** in `docs/01-strategy/` (`region-iberia-france.md`,
  `BUILDABLE-ENVELOPE-GAP-MASTER.md`, `STR-ENVELOPE-PARAMETER-REFERENCE.md`) — left alone to avoid a
  shared-doc collision during the fleet run.

---

## §7 — Corrections this measurement forced

- ⛔ **"France has no D1" — WITHDRAWN.** COS is dead; **`surface de plancher` is alive** and
  floor-area rules still bind. The audit proves it was not cosmetic: **D1 is a measured row at 0 %**,
  where the old claim would have deleted the row entirely.
- **`FR-DATA-GAP-AUDIT.md` amended in four places**, including the SRU inversion at §2(a).
- ⭐ **The six failure labels have no bucket for "derivable, not yet built."** Frontage cannot be
  `missing-source` — that reproduces the over-pessimism the founder's transmission corrects.
  Resolution: the six labels describe **extraction** failures; an un-built **derivation** lives on the
  `reachability` axis as `derivable` + `unrecovered`. **No 7th label. No schema change.**
