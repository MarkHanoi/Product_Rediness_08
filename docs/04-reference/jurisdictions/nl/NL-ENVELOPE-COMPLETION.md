# NL — envelope completion status

> **Stamp** 2026-09-04 (**round 4**) · **Source** lane ENVELOPE-NLDK primary measurement (Phase 0
> M1–M6; commits `d0498f8b`, `8bbbf67c`, code swept into `3b0afbb5` / `5d88c841`, then the founder's
> 8 moves in `a5e1a864`, `dd279349`, `cb2a6185` and round 4) · **Pattern** identical across all 16
> jurisdiction dossiers.
>
> ⭐ **ROUND-4 CORRECTION, AND IT IS THE POINT OF THIS REVISION.** §3 below is written against the
> state BEFORE the founder's review was implemented. **Seven of the eight moves have since landed in
> code, and this document did not move with them** — including blocker 8, whose `not-verified`
> question was ANSWERED in round 3 inside a source constant no reader of this dossier ever opens.
> ⛔ *An answer that lives only in a source file has not been delivered.* Every §3 row now carries
> its **as-built** state; the prose kept above each row is the pre-review reading, retained so the
> delta is visible rather than erased.
>
> ⛔ **Every number here is MEASURED and names its method.** Where a figure was never measured the
> cell says `not-measured`. Read §1.1 before quoting any single percentage — **NL has no one
> completion number, and the two candidates differ by 3×.**
>
> **Command (all M-figures):** `nl-phase0-parcels.mjs --n=500 --seed=20260903`
> (+`--minTileParcels=15` for the urban arm) → `nl-phase0-reduce.mjs > nl-phase0-report.json`.
> **Findings:** `docs/04-reference/jurisdictions/nl/findings/nl-phase0/`.

---

## §1 — Completion

### §1.1 — ⛔ There is no single NL completion figure

| M1 `bouwvlak` coverage | Value | Denominator |
|---|---|---|
| tile-uniform | **11.2 %** | sampled uniformly over tiles |
| parcel-uniform | **36.7 %** | sampled uniformly over parcels |

**These differ by 3×. Neither is "the" figure.** Quoting one without its denominator is the exact
defect this dossier exists to prevent.

**By `hoofdgroep`** — and the spread is the finding:
- `centrum` **100 %**
- `wonen` **53.6 %**
- `water`, `natuur`, `verkeer`, `bos`, `tuin` — **0.0 %**, and these are **F2 (correct null), not a
  gap.** Building was never the question on water or a road.

### §1.2 — M2 · parameter fill, given a bouwvlak

- `maximum bouwhoogte` — **48.7 %** of parcels inside a bouwvlak
- `goothoogte` — **5.1 %**
- **`inhoud`, `dakhelling`, `nokhoogte` — 0 of 556.** Zero. Not low: absent.

### §1.3 — M3 · status distribution (A–F2)

- **F1 = 26 land + 49 urban** — and ⭐ **concentrated exactly where people build**: `wonen` 42, led
  by plain `"Wonen"` at 32.
- **A-eligible: 2/500 land and 6/250 urban** — and *eligible* only; **Status A additionally requires
  a human signature.**

### §1.4 — M4 · `peil` resolvability

**20 / 66 = 30.3 %**, across **17 distinct definitions**.

⚠ **This figure was wrong by 10× and a unit test caught it.** `adjoining-finished-ground` first read
**1/20**; the truth is **11/20**. The audit regex demanded uninflected Dutch (`aansluitend
afgewerkt`); legal prose writes `aansluitende afgewerkte`. It was found because the fixture was
**quoted from the sample**, not written by the regex's own author — and it mattered because that
class is the *finished ground after construction*, the one most likely to be silently replaced by a
raw AHN elevation. Corrected offline from stored texts; **no re-measurement was needed.**

### §1.5 — ⭐ M5 · roof determinacy — the product-shape finding

- `goothoogte` + `bouwhoogte` **co-occur 1 / 500 land, 0 / 250 urban**
- **zero structured `dakhelling` / `nokhoogte` in 556 parcels**
- but plan **TEXT** carries `dakhelling` in **28.8 %**

> **UNDERDETERMINED IS THE MAIN PATH, not the exception.** The founder's brief anticipated this
> exact branch and said it would change the product's shape. It does.

⭐ **And the honest state is `mechanism: 'present'` + `failure: 'pdf'` — never F1, and never
"any roof".** The rule exists and is written down; it is unparsed. Calling that a *gap* would
slander the Dutch planning system; calling it *determined* would invent a triangle.

### §1.6 — M6 · legacy split — the SHAPE is now answered; the VOLUME is still open

**Zero Omgevingsplan / IMOW instruments observed.** The 26–31 % "dated ≥ 2024" figure is a **DATE,
not an instrument type**. This sample **cannot distinguish** a genuinely small IMOW corpus from one
served behind the key-gated DSO. **The volume question stays OPEN — every DSO data plane answers 401.**

⭐ **What is NO LONGER open is the shape of the corpus**, and it explains the zero:
[`NL-DSO-TIJDELIJK-DEEL-VERDICT.md`](NL-DSO-TIJDELIJK-DEEL-VERDICT.md) establishes from three public
OpenAPI documents that the tijdelijk deel is **SPLIT** — the **bruidsschat** is a *tijdelijk
regelingdeel* served by **Ozon / Presenteren v8**, while the **old bestemmingsplannen** are IMRO/Wro
and served by **ruimtelijkeplannen.nl**. Our sample read the second and not the first, so *"zero IMOW
observed"* measures **which API we queried**, not what the Netherlands publishes. ⚠ It is therefore
**not** evidence of a small IMOW corpus, and must never be quoted as such.

### §1.8 — ⭐ M7 · `nokhoogte` in TEXT — the founder asked; it does **NOT** track `dakhelling`

The founder's §5: *"⚠ Measure `nokhoogte` in TEXT too. We report the structured zero but not the text
share; **if it tracks `dakhelling`, the two together close a lot of triangles.**"*

**Measured** (`findings/nl-phase0/nl-nokhoogte-probe.mjs` → `.json`, seed `20260903`, **60 plans
drawn of 322 governing, 53 fetched keylessly**, detector = parameter name + a number **in its own
unit** within 120 chars, windows stored VERBATIM):

| parameter, in plan TEXT | share of fetched plans |
|---|---|
| `bouwhoogte` | **43.4 %** (23/53) |
| `goothoogte` | **32.1 %** (17/53) |
| `dakhelling` | **20.8 %** (11/53) |
| **`nokhoogte`** | **7.5 %** (4/53) |

⭐ **The answer is NO, and the reason is sharper than the question.** `nokhoogte AND dakhelling` =
**0 / 53 = 0.0 %**. They are not complements that stack — they are **ALTERNATIVE DRAFTING
CONVENTIONS**: a plan fixes the top with a ridge height *or* with a pitch, and in this sample never
with both. So *"the two together"* closes nothing extra; what closes a roof is **an eaves plane plus
either one**:

| the closing combination | share |
|---|---|
| `goothoogte` **AND** (`nokhoogte` **OR** `dakhelling`) | **24.5 %** (13/53) |
| `goothoogte` AND `bouwhoogte`, neither nok nor helling (a slab, no roof form) | 7.5 % (4/53) |
| **none of the four** | **56.6 %** (30/53) |

Binned into the runtime's own `NlRoofBoundType` (§3 item 1), the sample is:
**`none` 30 · `section-closed-by-pitch` 10 · `prism-upper-bound` 6 · `roof-zone-slab` 4 ·
`closed-by-ridge` 3** — ⭐ **`UNDERDETERMINED` is not the edge case, it is 43 of 53 plans**, which is
M5's product decision measured a second way and from a different corpus.

> ⚠ **FOUR LIMITATIONS, FOUND BY READING THE WINDOWS THIS RUN PRODUCED — not predicted by the
> detector's author — and carried in the artefact as `knownDetectorLimitations`:**
> **(a)** a *begripsbepaling* that carries numbers is counted (one plan hits on its own definition of
> `kap`), so `dakhelling` is an **upper bound** on plans that SET a pitch; **(b)** a relative rule
> ("0,5 m onder de nokhoogte van de dakopbouw") counts as a `nokhoogte`, so **7.5 % is itself an
> upper bound** and the true share is lower; **(c)** the unit is **per plan, not per bestemming**, so
> every figure is ≥ the parcel-level share; **(d)** ⛔ **20.8 % is NOT a correction of Phase 0's
> 28.8 %** — different sample, and a **stricter** detector that demands a number in degrees. Reporting
> it as a correction would be the defect this dossier keeps documenting.

### §1.7 — ⭐ ONE DISCOVERY CALL REACHES BOTH HALVES

`POST /documenten/_zoek` on **Omgevingsinformatie Ontsluiten v2** takes a **GeoJSON geometry** and a
date and returns **OW documents and IMRO documents in one list**, each carrying the metadata block
that says which world it belongs to (`omgevingsdocumentMetadata` vs `imroDocumentMetadata`) — the
API's own words: *"om te kunnen zoeken naar zowel omgevingsdocumenten in het kader van de
Omgevingswet (OW), als IMRO-documenten (bestemmingsplannen en dergelijke) in het kader van de Wet op
de Ruimtelijke Ordening (Wro)."* Only **retrieval** is split, and **both APIs take the same
`x-api-key` from the same ontwikkelaarsportaal**. Encoded as
`packages/site-parcel-data/src/rulepacks/nlTijdelijkDeel.ts` (`routeNlDocument`).

---

## §2 — What is ACCESSIBLE today

- **Parcel geometry** — 🟢 `source-complete`. Kadaster BRK via PDOK
  `kadastralekaart:Perceel`, keyless, live-probed (`numberMatched:1`, real polygon, Amsterdam).
  Wired via `/api/parcel/nl`.
- **Terrain** — 🟢 AHN (DTM + DSM), NAP reference. ⛔ **Evidence for elevation, never the legal
  definition of `peil`.**
- **Topography / roads / water / terrain** — 🟢 BGT.
- **Existing buildings** — 🟢 BAG (pand geometry, identifiers, status). ⛔ Context, **never
  entitlement**.
- **Zoning geometry (`bouwvlak`)** — 🟡 present but **partial**: 11.2 % / 36.7 % depending on
  denominator; 100 % in `centrum`, 53.6 % in `wonen`.
- **`maximum bouwhoogte`** — 🟡 **48.7 %** where a bouwvlak exists.
- **`goothoogte`** — 🟠 **5.1 %**.
- **Plan text (`begripsbepalingen`, roof rules)** — 🟡 reachable as **text**: `dakhelling` appears in
  **28.8 %** of plan text while structured at 0 %.
- **CRS regime** — 🟢 RD New / EPSG:28992 planimetric, NAP heights.

---

## §3 — What is BLOCKING

> ⛔ **THIS RANKING WAS INVERTED, and the founder review of 2026-09-04 corrects it.** See
> [`NL-FOUNDER-BLOCKER-REVIEW.md`](NL-FOUNDER-BLOCKER-REVIEW.md) for the reasoning and the 8-move plan.
>
> ⭐ **`voorrangsregeling` (listed 6th below) is actually #1.** Since 2024-01-01 every omgevingsplan
> is a *tijdelijk deel* that **can only lapse AS A WHOLE**, so the **only legal way** a gemeente can
> change anything in it is by **adopting voorrangsregels** — and the regeling is the **product of the
> tijdelijk deel and all successive wijzigingsbesluiten**, running to 2032.
> **We read the tijdelijk deel; the overrides live in the wijzigingsbesluiten.**
>
> ⛔ **So it is not a missing feature on parcels we skip — it is a CORRECTNESS RISK on parcels we
> answer CONFIDENTLY.** Until it is built, the honest state of every recovered NL parameter is
> **"as at the tijdelijk deel, overrides not checked."**

- **1. Roof geometry is structurally absent — `not-built` / `pdf`.** 0 of 556 structured
  `dakhelling`/`nokhoogte`; co-occurrence of the two height limits **1/500**. ⭐ The consequence is a
  **product decision, not a bug**: `UNDERDETERMINED` must be a first-class, shippable output.
  > ✅ **AS BUILT (move 5, `a5e1a864`).** `nlRoofDeterminacy.ts` ships `UNDERDETERMINED` with an
  > explicit **`NlRoofBoundType`** — and it carries **seven** shapes, not the founder's three:
  > `prism-upper-bound` (a cap and no eaves plane) · `eaves-plane-no-top` (**bounded eaves, NO top —
  > nothing may be drawn above it**) · `roof-zone-slab` · `section-closed-by-pitch` ·
  > `closed-by-ridge` · `determined` · `none`. `describeNlRoofBoundType()` gives each one line a user
  > sees, and `none` is explicitly *"not unlimited"* (L-616). **What remains is the plan-text leg
  > (§3 item 7 below), not the output shape.**
- **2. `peil` is unresolved on ~70 % of plans — `semantic`.** 30.3 % resolvable across **17 distinct
  definitions**. ⛔ **`peil = AHN elevation` is not expressible in the shipped model, by design** —
  evidence must name its reference class.
  > ✅ **AS BUILT (move 6, `cb2a6185`).** `nlPeilCatalogue.ts` carries the definitions of the
  > seed-`20260903` sample **QUOTED as a closed set** (**18** distinct, not 17 — the count moved when
  > they were quoted rather than counted), plus the `begripsbepaling` extractor. ⚠ The
  > **Stelselcatalogus finding is the load-bearing one**: `peil` has **no** national concept, while
  > `straatpeil` does — so the normalisation anchor is `straatpeil`, and a plan's own `peil` stays a
  > per-plan classification. **Still open: the classifier's accuracy over the corpus.**
- **3. `inhoud` (volumetric cap) — ⚠ label DISPUTED, probably a SAMPLING ARTEFACT.** 0 of 556.
  `inhoud hoofdgebouw maximaal 650 m³` is a real and common construction — but characteristically a
  **rural / *buitengebied*** rule, which a tile- or parcel-uniform national sample can easily miss
  while it stays routine where it appears. ⛔ **Probe `bestemming` = agrarisch / wonen in buitengebied
  before concluding absence.** It is a **D1-equivalent volumetric cap**, so getting it wrong in the
  same direction as the withdrawn French D1 claim would be an unfortunate rhyme.
  > ⭐ **MEASURED, AND THE FOUNDER WAS RIGHT (move 4, `nl-inhoud-probe.json`, 2026-09-04).** Targeted
  > probe over **322 distinct governing plans**, stratified `buitengebied` (171) vs control (151),
  > **73 plan texts fetched keylessly** from `ruimtelijkeplannen.nl/documents/…`, detector = an
  > `inhoud` token followed within 160 chars by a number + `m³|m3|kubieke meter`, **windows stored
  > VERBATIM, no interpretation**:
  >
  > | stratum | plans with a cubic `inhoud` rule |
  > |---|---|
  > | **buitengebied** | **9 / 37 = 24.3 %** |
  > | control | 3 / 36 = 8.3 % |
  >
  > Values observed: **750 m³ (×4)**, 50 (×3), 900, 2500, 300, 100, 30 in buitengebied.
  > ⛔ **So "0 of 556" is a LAYER artefact, not an absence** — `inhoud` is a real, common rule that
  > lives in plan **TEXT** and is not published as a structured field. The correct label is
  > **`pdf`/text-leg**, never `missing-source`. Getting this wrong in the same direction as the
  > withdrawn French D1 claim was the risk; it did not happen.
- **4. F1 concentrates in residential — `not-built`.** 26 land + 49 urban, `wonen` 42. **A plan
  governs and serves no envelope mechanism — precisely where users develop.**
  > ✅ **AS BUILT (move: founder §8, `a5e1a864`).** `nlF1Guard.ts` refuses to record F1 until the two
  > cheaper explanations are excluded: **(a)** the operative rule may be the **bruidsschat** (arts.
  > 22.27 / 22.36 — national, identical everywhere, arriving automatically in every omgevingsplan),
  > **(b)** a **wijzigingsbesluit** may have added one. ⭐ Either way the state is `not-built`
  > (*mechanism present, in a layer we do not read*), **not F1**. Since F1 is defined as a CORRECT
  > NULL, misclassifying here is the expensive direction, and the guard exists to stop it.
- **5. `bebouwingspercentage` denominator — `semantic`, NOT BUILT.** Some plans measure against the
  `bouwvlak`, others the `(bouw)perceel`. The record of which was **not built this lane**.
  > ✅ **AS BUILT (move 3, `a5e1a864`).** `nlBebouwingspercentage.ts` makes the denominator a
  > **REQUIRED field with NO DEFAULT** — a percentage whose denominator is unresolved is
  > `unrecovered`, never silently applied against the parcel. This was the founder's "cheap fix, real
  > value" and it is the one that prevents a **scale** error rather than a rounding one.
- **6. `voorrangsregeling` — `precedence`, NOT BUILT.** Distinct from intersecting constraints;
  implementing only the intersection produces **silent wrong answers**.
  > ✅ **AS BUILT (move 2, `cb2a6185` + round 4).** `nlVoorrangsregels.ts` applies precedence BEFORE
  > answering; `nlRegelingIdentity.ts` makes the precedence state **inseparable from every answer**
  > (`NlPrecedenceCheck` has THREE states — *not checked* ≠ *checked, none apply*), and
  > `nlPrecedenceRiskCount()` counts the founder's *"correctness risk on parcels we answer
  > confidently"*. Round 4 adds `nlTijdelijkDeel.ts`: **reading ONE half of the tijdelijk deel is NOT
  > half-checked, it is NOT CHECKED**, and the unread half is named in the caveat.
  > ⛔ **What does NOT collapse:** the DSO exposes **no `voorrang` relation**. `Regeling.conditie`
  > — *"De verhouding is tussen dit tijdelijk deel en de hoofdregeling"* — is **free text**, so the
  > residue of move 2 is a **classifier over a string**, and `NL_CONDITIE_PATTERNS` is deliberately
  > **EMPTY** until a corpus is read with a key. ⚠ `unclassified` is **not** "subordinate".
- **7. Vergunningvrij carve-outs — `not-built`.** Permit-free rights **subtract** on monuments and in
  *beschermd stadsgezicht*. Carve-outs were to be built **before** the general case; neither is built.
  > ✅ **AS BUILT, AND RE-SCOPED (move 8, `a5e1a864` + `cb2a6185`).** The paragraph above targets the
  > **Wabo/Bor** regime, and **bijlage II Bor lapsed 2024-01-01** — the founder's §4. `nlVergunningvrij.ts`
  > is scoped onto the successor: the **Bbl art. 2.29 national floor**, **art. 2.30 lid 1–3**
  > disapplication (monument / `functieaanduiding rijksbeschermd stads- of dorpsgezicht` **queryable in
  > IMOW**, not an external heritage dataset), and the **bruidsschat**'s own arts. 22.27 / 22.36.
  > `nlBebouwingsgebied.ts` implements art. 22.36 as **procedural geometry** (move: the deep audit's
  > Gap 3) — the IPLO achtererfgebied construction as half-planes, the three-band oppervlakte formula,
  > and the **4 m switch**: within 4 m a 5 m cap; beyond it `dakvoet ≤ 3 m`, **≥ 2 schuine dakvlakken
  > ≤ 55°**, and `daknok = min(5, 0.47 × afstand + 3)`. ⛔ **The gemeente now sets vergunningvrij for
  > *bijbehorende bouwwerken*, so the carve-out layer is national floor + per-plan overlay — never one
  > static table.**
- **8. Omgevingsplan / DSO reachability — `credential-gated`, UNRESOLVED.** Zero IMOW observed; the
  DSO is key-gated. ⛔ **This is an open question, not a measured absence.**
  > ⭐ **ANSWERED for SHAPE (round 3 in code, round 4 in this dossier) — see
  > [`NL-DSO-TIJDELIJK-DEEL-VERDICT.md`](NL-DSO-TIJDELIJK-DEEL-VERDICT.md).** The tijdelijk deel is
  > **SPLIT** across Ozon (bruidsschat) and ruimtelijkeplannen.nl (the old bestemmingsplannen); **one
  > credential and one discovery call reach both** (§1.7). ⛔ **STILL UNRESOLVED for VOLUME:** every
  > data plane is **401** and **no `DSO_API_KEY` exists in this environment**. It is a **free
  > registration a HUMAN must complete** at `developer.omgevingswet.overheid.nl` — engineering cannot
  > close it, and this lane did not fake it. **This is the single blocking dependency for M6.**

- **9. ⭐ APPLICABILITY WAS BEING READ AS INTERSECTION — `semantic`, the deep audit's Gap 1.** Not on
  the founder's 8-move list, and it is the same *shape* as move 2: **a correctness risk on answers we
  already give**, not a missing feature on parcels we skip. `parcel intersects rule geometry → rule
  applies` is **wrong**; a rule resolves on **location + activity + subject + rule-scope + authority +
  effective-date + exceptions**.
  > ✅ **AS BUILT (round 4) — `nlApplicability.ts`.** All seven axes carry **three** verdicts
  > (`satisfied` / `not-satisfied` / `not-evaluated`), and **there is NO path from a subset to
  > `applies`**: a polygon hit and nothing else returns `undetermined` with `intersectionOnly: true`
  > and the six unchecked axes named. One refuting axis settles `does-not-apply` — which projects to
  > **`refused` / `rule-not-applicable` (F2, a CORRECT absence)**, never to our gap.
  > ⚠ The asymmetry is the design: a rule wrongly applied **invents a constraint** on someone's land;
  > a rule wrongly disapplied **invents an entitlement**. Both are silent.
  > ⛔ **Still key-gated:** the axes are fed by **Toepasbaar Opvragen v7**, whose data plane answers
  > **401**. `NL_APPLICABILITY_SOURCES` records the endpoint per axis and that **none is reachable
  > today** — which is why `not-evaluated` is a verdict rather than an optimistic default.

---

## §4 — Per-parameter state

| Envelope slot | State | Evidence |
|---|---|---|
| Parcel geometry | **source-complete** | PDOK BRK, keyless |
| Terrain | **source-complete** | AHN DTM/DSM |
| **`peil` (legal datum)** | **interpretive** | 30.3 % resolvable · **17 distinct definitions** |
| Zone / bestemming | **source-complete** | |
| `bouwvlak` (buildable footprint bound) | **source-complete where present** | 11.2 % / 36.7 % · 0 % on water/natuur/verkeer = **F2** |
| **`maximum bouwhoogte`** | **source-complete where present** | **48.7 %** of in-bouwvlak parcels |
| **`goothoogte`** | **source-complete where present** | **5.1 %** |
| `bebouwingspercentage` | **extractable** | denominator record **not built** |
| **`inhoud` (volume cap)** | **not-measured / absent** | **0 of 556** |
| **`dakhelling` / `nokhoogte`** | **extractable** | **0 of 556 structured**; **28.8 % in plan TEXT** |
| **Roof geometry** | **undeterminable** | ⭐ 1/500 co-occurrence — **UNDERDETERMINED is the main path** |
| `aantal bouwlagen` | **not-measured** | |
| Setbacks | **not-measured** | |
| Building depth (`bouwdiepte`) | **not-measured** | |
| Dubbelbestemming / gebiedsaanduiding overlays | **not-measured** | classification not built |
| `voorrangsregeling` (precedence) | **not-built** | distinct operation, unimplemented |
| Permit-free layer | **not-built** | carve-outs first, per the brief |
| `molenbiotoop` (inclined plane) | **derivable** | **18.2 % of Dutch plans**; the primitive already exists — see §7 |

---

## §5 — Next measurable step

⛔ **ONE OF THESE IS NOT ENGINEERING, AND IT BLOCKS THE OTHER TWO.**

1. ⛔ **A HUMAN MUST REGISTER FOR `DSO_API_KEY`** at `developer.omgevingswet.overheid.nl`
   (ontwikkelaarsportaal — free, `x-api-key`, 200 req/s). The same key reaches **Presenteren v8**,
   **Ruimtelijke Plannen v4**, **Ontsluiten v2** and the **Catalogus**. Until it exists, M6 has no
   number, `conditie` has no corpus, and every NL answer keeps the caveat *"as at the tijdelijk deel,
   overrides not checked"*. **No amount of code closes this.** *(The same is true of Denmark's free
   `DATAFORDELER_USERNAME` / `DATAFORDELER_PASSWORD` — see `../dk/DK-ENVELOPE-COMPLETION.md` §3.1.)*
2. **Build the plan-text leg for roof rules, zone-scoped** — roof rules cluster in the `bouwregels`
   of a bestemming, and §1.8 now sizes the prize precisely: **24.5 % of plans carry an eaves plane
   plus a ridge-or-pitch** and would close, against **0 %** structured. ⚠ **Extract BOTH conventions**
   — `nokhoogte` and `dakhelling` never co-occur (§1.8), so a leg that reads only one silently drops
   the plans drafted the other way.
3. **Classify `conditie`** — the residue of move 2, and it needs (1) first.

> ✅ *"Ship `UNDERDETERMINED` as a first-class output"* was step 1 of the previous revision. **It is
> shipped** — `NlRoofBoundType`, seven shapes, each with the one line a user sees (§3 item 1).

---

## §6 — Gaps in evidence

- `aantal bouwlagen`, setbacks, `bouwdiepte`, overlay classification — **not measured**.
- The **F1/F2 split of the no-plan parcels was not completed** for NL's counterpart set.
- ✅ **`nokhoogte` in TEXT is MEASURED** (§1.8): **7.5 %**, and it does **not** track `dakhelling`
  (co-occurrence **0.0 %**). ⚠ Both figures are **upper bounds** for the reasons the artefact records.
- **M6 cannot separate a small IMOW corpus from a key-gated one.** ⭐ **The SHAPE is now answered**
  (§1.6 / §1.7); the **volume** stays open behind `DSO_API_KEY`.
- ⛔ **What `conditie` strings actually say is unknown**, and `NL_CONDITIE_PATTERNS` is deliberately
  empty rather than plausibly populated. A guessed pattern table would be the 10× `peil` error again.
- ⭐ **NOT a gap any more, and listed here because the previous revision said it was:**
  `bebouwingspercentage` denominator, the `inhoud` volumetric probe, `voorrangsregeling`,
  vergunningvrij (**re-scoped onto Bbl 2.29/2.30 — the old scope targeted a REPEALED regime**), the
  bruidsschat's procedural art. 22.36 geometry, `peil` as a closed enum, the DSO cross-check, and the
  roof **bound-type** field have all landed. `nlMolenbiotoop.ts` remains **deliberately unbuilt** —
  §7 shows the existing `geometry/inclinedTop.ts` primitive covers it.

---

## §7 — Cross-jurisdiction note: the inclined plane

⭐ **Neither the NL nor the NSW lane built the inclined-plane primitive — `geometry/inclinedTop.ts`
already existed**, and both lanes reached that conclusion independently. NSW's
`NSW-INCLINED-PLANE-HANDOFF.md` is the authority and covers all three Portuguese requirements.

**NL's addendum** (commit `23eb0410`) adds the one thing the handoff missed: **the `molenbiotoop` is
RADIAL, not line-anchored** — 18.2 % of Dutch plans. Resolution: **a tangent-plane fan provably
UNDERSTATES a convex cone**, so it errs in the safe direction, stays adapter-side, and **needs no new
primitive**.
