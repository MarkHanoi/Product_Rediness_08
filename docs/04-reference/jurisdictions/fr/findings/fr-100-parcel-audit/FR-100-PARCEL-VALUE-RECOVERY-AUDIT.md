# FR — the 100-parcel value-recovery audit. RUN, not specified.

> **Lane:** ENVELOPE-FR, **2026-09-04**. **Instrument:** [`run-fr-audit.mjs`](run-fr-audit.mjs)
> (seed `20260904`, re-runnable). **Raw trace:** [`fr-audit-raw.json`](fr-audit-raw.json) — 100
> parcels × every field, one row per (parcel, envelope parameter).
> **The question, from [`FR-FOUNDER-REACHABILITY-BOUNDARY.md`](../../FR-FOUNDER-REACHABILITY-BOUNDARY.md) §11:**
>
> > *"Of the rules that apply to a random parcel, what percentage can PRYZM recover as an
> > authoritative parameter without human judgement?"*
>
> The founder attached an instruction to it: **do NOT put the ~80–90 % estimate into the
> investor/product spec until measured.** This file is the measurement. It supersedes the estimate
> for FR and nothing else.
>
> ⛔ **This is a measurement of ONE PIPELINE — the national GPU/WFS chain — not of PRYZM.** Read §5
> before quoting any number here. Three of the six failure labels were never reachable by this
> instrument, and that is stated rather than hidden.

---

## 0. THE ANSWER

| Measure | Value | What it counts |
|---|---:|---|
| **Parameter recovery rate** | **23.7 %** | 185 authoritative parameters / **781** rules that applied |
| **Honest-answer rate** | **32.3 %** | + qualitative, alternative, and correct refusals |
| — area-random stratum | 19.2 % | 50 parcels, uniform over French land |
| — urban stratum | 28.0 % | 50 parcels, 25 of the largest communes |

**And the number that actually matters, because it is the one that splits the problem in half:**

```
INSTRUMENT layer   (B1 governing document + B2 zone code)     170 / 189   =  89.9 %
PARAMETER  layer   (C2 height · C4 emprise · C5 setbacks
                    · C6 volumetry · D1 floor area)            15 / 500   =   3.0 %
```

> The founder's four-layer table said the first layers are *"much more complete than your current
> document suggests"* and that the third *"is the engineering problem."* **Both halves are now
> measured, and both are correct — but the gap between them is far wider than any prose suggested.**
> France tells us WHICH RULE APPLIES nine times out of ten, and WHAT THE RULE SAYS three times in a
> hundred.

---

## 1. METHOD

- **Frame.** Two strata, because *a random POINT is not a random PARCEL* and reporting either alone
  would answer a different question than the one asked.
  - **A — area-random (n=50).** Uniform points over the mainland bbox; a point is kept only when the
    authority itself returns a commune. **32 draws were rejected as off-land** — the rejection is
    the publisher's answer, not our coastline guess.
  - **B — urban (n=50).** Two points each within ~1.3 km of the centres of the 25 largest communes.
    The audit **records the commune name the authority returns**, so a bad coordinate is visible in
    the raw trace rather than silently mis-attributed. (It landed on
    `PARIS-4E`/`PARIS-6E`, `MARSEILLE-2E`/`MARSEILLE-7E`, etc.)
- **Realised regime mix:** PLUi **52** · PLU **22** · RNU **11** · PSMV **5** · CC **1** · no document
  served **9**. The three refusal strata the spec asked for arrived on their own.
- **Per-parcel trace.** `municipality` → `document` → `zone_urba` → `prescription_surf` →
  `prescription_lin`, all over `data.geopf.fr/wfs` with `PROPERTYNAME` (geometry stripped).
  Endpoint spellings are copied from the shipped, live-probed `frGpuClient.ts`. **No endpoint was
  invented.**
- **Vocabulary.** Every row is a `RuleState` from the vocabulary this lane landed
  (`packages/schemas/src/site/zoning/RuleState.ts`); every failure carries one of the founder's six
  labels **verbatim**. The audit's output and the runtime's output are therefore the same
  vocabulary and need no translation table.

### ⚠ The instrument measured its own defect first

The smoke run drew **HTTP 429** from `data.geopf.fr` under six-way concurrency, and the harness
dutifully recorded **`inaccessible`** for parcels whose data was in fact fully served. That is the
§CONTEXT-DATA-HONESTY trap arriving from the client side: **our rate limit would have been published
as France's data gap.** A global throttle + serialised module calls fixed it, and the final run
carries **0 transient notes across 100 parcels** — every `inaccessible` count below is a true zero,
not a survivor of retries.

---

## 2. THE FAILURE TAXONOMY — the founder's six labels, measured

| Label | Count | Share of the 529 unrecovered |
|---|---:|---:|
| **`pdf`** | **389** | **73.5 %** |
| `semantic` | 81 | 15.3 % |
| `missing-source` | 59 | 11.2 % |
| `graphic` | 0 | — |
| `discretionary` | 0 | — |
| `inaccessible` | 0 | — |

**And the three zeros are the most important rows in the table** — see §5. They are **not** evidence
that graphic rules and discretion are rare in France. They are evidence that **this trace stopped
before it could reach them.** You cannot hit `graphic` or `discretionary` without opening the
document, and no document was opened.

**Answer-shape split (all 811 states):** `resolved` 185 · `unrecovered` 529 · `refused` 96 ·
`alternative` 1 · `qualitative` 0.
**F1 (plan read, no mechanism — a GAP) = 10. F2 (correct null — NOT a gap, excluded from the
denominator) = 30.** Merging them, as the NL and NSW audits both record their vocabularies doing,
would have moved the headline rate by ~1 point in one direction and the gap count by 3× in the other.

---

## 3. THE FOUR FINDINGS THAT CHANGE THE BUILD ORDER

### 3.1 ⛔ SRU XML: **0 of 81**. The ladder's first rung does not exist in the wild.

Every parcel that served a règlement reference served a **PDF** — 66 plain `.pdf`, 15
`.pdf#page=N`. **Not one `.xml`.**

The founder's ladder reads `GPU → NOMFIC/URLFIC → SRU XML if present → structured zone regulation →
PDF only where necessary`. In this sample, **"where necessary" is everywhere.** PDF is not the
fallback rung; it is the **only** rung.

⚠ **This directly contradicts a recommendation in our own audit.**
[`FR-DATA-GAP-AUDIT.md`](../../FR-DATA-GAP-AUDIT.md) §2(a) ranks the SRU-XML parser *"the highest
value-per-effort rung of steps 6–7"* and asks that its presence rate be *"a measured field of the
§3 audit."* It now is, and the measurement inverts the recommendation: **a parser for a format that
appears 0 times in 81 documents is not the highest value-per-effort rung.** Build the PDF leg.
Keep SRU as an opportunistic upgrade, engaged only when a `.xml` actually appears.

*(n=81 bounds this: the true national rate is small, not necessarily zero. The claim being made is
"do not sequence the roadmap behind it", not "it never exists".)*

### 3.2 The CNIG code tells you the rule TYPE; it usually does not tell you the VALUE

24 parcels carried a `39.x` height prescription. **9 of them yielded a number** from the feature
(38 %). The recovered heights are real: 7, 10, 12, 12, 15, 17, 19, 22, 22 m.

The other 15 look like Paris, which the trace captured exactly:

```
typepsc=39 stypepsc=02   libelle="Hauteur plafond"   txt=""
```

The rule EXISTS, its TYPE is published, its LOCATION is a polygon, its SOURCE is named — **and the
number is not in it.** That is the founder's §4 `VALUE = NOT ALWAYS`, observed rather than quoted.

### 3.3 ⚠ The `.97` qualitative upgrade is REAL but RARE — and the expectation needed correcting

`39.97` / `38.97` / `40.97` are the codes that let PRYZM answer **`QUALITATIVE RULE`** instead of
`UNKNOWN`. Across 100 parcels: **`.97` appeared 0 times. `.98` appeared once.** The whole `40.x`
volumetry family: **0**. `TYPEPSC=14` plan-masse: **0**.

The capability is worth having and is now shipped (`frCnigPrescriptionTree.ts`) — it costs little
and it is the difference between an honest answer and a false unknown. But it is **not** a lever on
the coverage number, and anyone reading §2 of the transmission as "the `.97` codes unlock the
qualitative middle" should read this row instead. **The qualitative rules are in the PDF prose, not
in the prescription subtypes.**

### 3.4 The 3.0 % parameter rate is dominated by ONE unbuilt component

Of the 500 parameter states, **389 stop at a reachable PDF nobody parsed.** That is not a wall — the
document is identified, addressed (15 of them with `#page=N`), and downloadable. **It is the size
of the prize, stated in the same units as the gap.** C4 emprise, C6 volumetry and D1 floor area are
at **0 % each**: not one was recoverable from structured data on any of the 100 parcels.

---

## 4. PER-PARAMETER

| Rule | resolved | unrecovered | refused | Note |
|---|---:|---:|---:|---|
| **B1** governing instrument | **91** | 9 | 0 | The instrument is nearly always identifiable |
| **B2** zone code | **79** | 10 | 11 | 11 refusals are RNU (no zoning instrument = F2) |
| **C2** max height | 9 | 79 | 11 | +1 `alternative`. The only parameter with real structured coverage |
| **C4** footprint limit | **0** | 89 | 11 | No plan-masse, no numeric 38.02 anywhere in the sample |
| **C5** setbacks | 6 | 83 | 11 | Recovered where a `15.xx` line is drawn — the line IS the rule |
| **C6** volumetry | **0** | 89 | 11 | The `40.x` family did not occur once |
| **D1** floor area (SDP) | **0** | 89 | 11 | ⚠ see §6 — the row exists *because* the correction was applied |
| **A2** height datum | 0 | 81 | 19 | All 81 are `semantic`: terrain is 🟢, the DATUM is in the rule |
| **B5** PAU | — | — | 11 | 🔴 hard refusal, correct answer (§6) |

**A2 is the cleanest illustration of why a state beats a nullable number.** The terrain elevation is
available for all 100 parcels. The audit still records 81 `unrecovered/semantic`, because *terrain
naturel / après travaux / niveau de la voie / égout / acrotère / faîtage* is a choice made in the
règlement text and by no dataset. A `number | null` field would have recorded a terrain height and
called the datum question answered.

---

## 5. ⛔ WHAT THIS NUMBER IS NOT

1. **It is not a measurement of PRYZM.** It measures the **national GPU/WFS chain**. Municipal
   opendata is excluded — and PRYZM already reads some of it. **Paris is the proof:** this audit
   records C2 as `unrecovered/pdf` for every Paris parcel, while the shipped
   `resolveParisPluZone.ts` reads the real published `plub_hauteur` (18/25/31/37 m) from the city's
   own layer. **Where a municipal pack exists, the true recovery is higher than 23.7 %.**
2. **No PDF extractor was run.** Every one of the 389 `pdf` labels means *"the document is reachable
   and no extractor read it"* — never *"the value is not there."*
3. **`graphic` = 0 and `discretionary` = 0 are artefacts of trace depth**, not findings about France.
   Both labels live past a rung this trace never climbed.
4. **A1 parcel geometry is excluded from the denominator**, not assumed recovered. It is
   source-complete nationally and re-probing it per parcel would have inflated the numerator with a
   field nobody doubts.
5. **A3/A4 frontage are excluded** — and the reason is itself a finding, see §6.
6. **Area-weighted ≠ parcel-weighted.** Stratum A over-samples large rural parcels by construction;
   stratum B exists to bound that, and the 19.2 % / 28.0 % spread is the measured size of the bias.

---

## 6. CORRECTIONS THIS AUDIT MAKES

### 6.1 ⚠ The six failure labels have no bucket for "derivable, not yet built"

**Frontage (A3/A4) cannot be labelled with any of the six.** It is not `missing-source` — the
founder's §5.1 correction is precisely that frontage is *"a deterministic spatial computation over
national reference geometry"*, not a publishing gap. Labelling it `missing-source` would reproduce
the exact over-pessimism the transmission was sent to correct.

**The resolution is that the six labels describe EXTRACTION failures, and an un-built DERIVATION is
not an extraction failure — it lives on the `reachability` axis instead.** A field carrying
`reachability: 'derivable'` + `status: 'unrecovered'` is self-evidently our backlog, and
`isClosableByBuilding()` returns `true` for it without needing a seventh label. **No schema change
is required; correct usage is.** Recorded here so the next lane does not mint one.

### 6.2 "France has no D1" — the correction, applied

`FR-MODULE-BUILD-BRIEF.md` §3.4 asserted *"There is no floor-area quantum constraint in France."*
COS is dead; **`surface de plancher` is alive** and SDP-based floor-area rules can bind in a given
PLU. **D1 therefore appears as a real, measured row in §4 — at 0 % recovery and 89 `unrecovered`
states.** Had the blanket claim stood, D1 would have been absent from the table entirely, and a
constraint class that binds real parcels would have been invisible rather than measured at zero.
**"We recover 0 % of this" and "this does not exist" are different sentences, and only the first is
true.** Correction box applied in place.

### 6.3 RNU → PAU is a hard refusal, and it fired 11 times

11 of 100 parcels sit in RNU communes. `is_rnu` is served nationally 🟢; **no national dataset says
whether a parcel is inside the *parties actuellement urbanisées*** 🔴. All 11 are recorded as
`refused / requires-determination` with a citation, earning **no retry affordance** — a retry never
produces a legal fact nobody publishes. **These count as honest answers, never as failures**, which
is why the honest-answer rate (32.3 %) exceeds the parameter rate (23.7 %) by more than the
qualitative rows alone would explain.

---

## 7. WHAT TO BUILD, IN THIS ORDER

> ⛔ **RE-ORDERED BY ROUND 2 (§8). The PDF leg is no longer item 1.** It was ranked first on a
> failure COUNT (389 `pdf` states) before anything measured what the alternatives yield. Round 2
> measured both, and a municipal pack returns **19× more parameters per parcel** than the national
> chain in the one territory where both were run head to head. The order below is the corrected one;
> the ranking above it is kept in §8 as the record of what the re-measurement changed.

1. ⭐ **Municipal opendata packs**, starting with the ones already built. Days-to-weeks, and §8.2
   measures the yield: Paris PLU-b resolves **C2 for 89.5 %** of in-commune parcels where the
   national chain resolves **0 %**. ⛔ **Fix [L-12898](../../../ISSUE-LOG.md) first** — the pack's
   only jurisdiction gate is a bbox, and it currently reaches four neighbouring communes.
2. **Datum resolution from règlement text** (A2). Promoted from 3 to 2 by §8.3: **all nine** metric
   heights the national chain recovers sit on an UNKNOWN plane, so under §DATUM-DECISION the
   national C2 numerator is **zero**. Nothing else in the FR list moves C2 nationally.
3. **Frontage as a computation** (A3/A4) — unblocks C5 numerics, the H/2 formula class, and the
   façade-profile datum sampler (L-584). It is code over geometry we already hold, not sourcing.
4. **The règlement PDF extraction leg.** Still 389 of 529 failures and still **the only path to C4
   emprise, C6 volumétrie and D1** — §8.1 measures their national ceiling at **0 / 100 each**, and
   §8.2 shows the Paris pack does not close them either. **Months, not weeks; sequence it fourth,
   do not cancel it.** **Do not sequence it behind an SRU-XML parser (§3.1).**

---

## 8. ROUND 2 — the GPU ceiling, the source-tier comparison, and the datum hit

> **Run 2026-09-04**, same instrument, **same seed `20260904`**, raw record
> [`fr-audit-raw-r2.json`](fr-audit-raw-r2.json). ⭐ **It reproduces round 1 EXACTLY** — the same 100
> parcels, the same communes, 23.7 % / 89.9 % / 3.0 % — so no scoring rule moved. Round 2 adds three
> MEASUREMENTS the round-1 record could not answer, because it kept only the prescription CODES and
> discarded the payload; the payload is now persisted, so every number below is re-computable from
> the file rather than asserted.

### 8.1 ⭐ The GPU-only ceiling: **3.0 %, and we are AT it**

```
parameter rows the national chain COULD ever answer
  numeric TXT only ........................  9 / 500 = 1.8 %
  + drawn geometry (14, 15) ............... 15 / 500 = 3.0 %   ← the ceiling

recovered against it — ⚠ TWO extractors, not one:
  this harness, DATUM-BLIND ............... 15 / 15  = 100 %
  the SHIPPED tree, after §8.3 .............. 6 / 15  =  40 %  (+9 carried as `partial`)
```

**262 prescriptions served across the 100 parcels.** All 262 carry some text; **45.0 % populate a
non-empty `TXT`**; **5.0 % (13) carry a parseable number anywhere.** Of the 36 in an envelope family
(`14/15/38/39/40`), **25.0 % carry a number** — and that is entirely `typepsc 39`, at 9 of 25 (36.0 %).
`38` emprise: **0 of 4.** `15` implantation: **0 of 7** (it needs none — the drawn line IS the rule).
`40` volumétrie: **not served once.** `D1`: **no CNIG code exists.**

> ⛔ **So 3.0 % is the CEILING, not the failure rate** — and a datum-blind reading already saturates
> it at 100 %, so no parser work raises it (§8.3 is what the shipped reading gives up, and why).
> C4, C6 and D1 have a national ceiling of **zero**; a further **55 of 500** rows are RNU
> `requires-determination` refusals no dataset can convert. **There is no `TXT` to clean and no
> parser to tune — further FR recovery must come from a different SOURCE.**

### 8.2 ⭐ Source tier: the Paris pack beats the national chain **19×**

Stratum C, **25 live draws** inside the Ville-de-Paris routing box, pack queried **alongside** the
national chain and never merged into it. **Zero pack layers were transient**, so every `absent` is a
real absence.

| parameter | national chain | Paris PLU-b pack |
|---|---|---|
| **C2** height | 0 / 25 = **0.0 %** (all `unrecovered/pdf`) | ⭐ 18 / 25 = **72.0 %** · **17/19 = 89.5 %** of in-commune draws |
| C4 emprise | 0 / 25 | 1 / 25 (`plub_ecm`, partial coverage) |
| C5 setback | 1 / 25 | 0 / 25 (not a pack layer) |
| C6 volumétrie | 0 / 25 | 0 / 25 (6 `plub_filet` codes — informational, not a parameter) |
| D1 | 0 / 25 | 0 / 25 |
| **TOTAL** | **1 / 125 = 0.8 %** | **19 / 125 = 15.2 %** |

**Verdict — move 6 (packs) over move 7 (PDF), for HEIGHT and only for height.** The pack saturates
C2 with real citable integers (25 m / 31 m, `plub_hauteur`, PLU-b art. UG.3.2.1) and leaves
C4/C6/D1 at the same wall §8.1 measures nationally. **They are not substitutes.**

⛔ **This run also found a shipping defect: [L-12898](../../../ISSUE-LOG.md).** The pack's only
jurisdiction gate is the loose bbox; **6 of 25 draws were not the Ville de Paris** (Ivry, Issy,
Charenton, Levallois) and for one of them `plub_hauteur` answered **31 m**, which the pack would
cite against the wrong commune's règlement.

### 8.3 ⛔ The datum hit: **15 → 6**, taken deliberately

Founder review §9 asked whether a height with `datum = unknown` counts in the 15/500.
**Decided: no** (`rulepacks/frHeightDatum.ts` · `FR_DATUM_DECISION`). Measured cost, running the
shipped `frCnigPrescriptionTree` + the real `extractFrHeightDatum` over this corpus:

| | round-1 harness | §DATUM-DECISION |
|---|---|---|
| C2 metric heights recovered | 9 | **0** — *all nine have `FROM = unknown`* |
| C5 drawn marges de recul | 6 | 6 |
| **parameter recovery** | 15 / 500 = 3.0 % | ⛔ **6 / 500 = 1.2 %** |
| `partialCarried` (kept, visible, never counted) | 0 | **9** |
| `unrecoveredSilent` — the founder's `done` metric | not measured | ⭐ **0** |

The nine, verbatim — ⚠ **two are RANGES read as a single cap**, which is independent evidence they
were never clean recoveries:

```
B13  39.02  17 m  "Hauteur maximale"
B27  39     7 m   "Plan des hauteurs de coeur d'îlot"
B30  39     15 m  "Hauteur - 15m + bonus / 9m"          ← a bonus and an alternative, read as 15
B40  39     22 m  "Hauteur_22m"
B41  39     19 m  "Hauteur_19m"
B42  39.02  10 m  "Zone hauteur 10 mètres maximum"
B43  39.02  22 m  "Zone hauteur 22 mètres maximum"
B44  39.02  12 m  "Hauteur entre 10 et 12 m"            ← a range, read as 12
B45  39.02  12 m  "Hauteur entre 10 et 12 m"            ← a range, read as 12
```

### 8.4 §11 vintage — NATURE is served, and it is thin

**27 of 262 prescriptions (10.3 %) carry a `NATURE`.** The rest publish the pair only, so their SRU
`idPrescription` degrades to `TYPEPSC-STYPEPSC` — a v2017-vintage signal the audit can now stratify
on, since the composite id travels on every row of the raw record.

---

*Deliverable of lane ENVELOPE-FR, 2026-09-04 (round 2). Re-run:
`node run-fr-audit.mjs out.json` (seed pinned; `WANT_A` / `WANT_B` / `WANT_C` override the strata
sizes — `WANT_C` is the Paris source-tier stratum and is never folded into the 100).*
