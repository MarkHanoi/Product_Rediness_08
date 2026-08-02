# COLD START PROBE · 1 — THE DENOMINATOR, AND THE FIVE CITIES RESTATED IN PARCELS

**Sprint**: COLD START PROBE, 2026-08-02. **Companion**: [COLD-START-PROBE-ONBOARDING-COST-AND-TIERS.md](./COLD-START-PROBE-ONBOARDING-COST-AND-TIERS.md).

> ⛔ **`ES-CITY-ENVELOPE-CERTIFIABILITY-SURVEY.md` is NOT a source for anything in this document.** It
> is the cautionary example: written with correct numbers in hand and now wrong in both directions.
> Every figure below traces to a run in `tools/cold-start-probe/out/`, re-runnable from a seed.

**Runs behind this document** — all 2026-08-02, all committed:

| artefact | what it is |
|---|---|
| `tools/cold-start-probe/frames/populations.json` | the exact Catastro parcel population of six municipalities |
| `tools/cold-start-probe/out/<city>.determination.json` | 400-parcel determination sample per city, every row kept |
| `tools/cold-start-probe/out/old-vs-new.json` | old (area) vs new (parcel), recomputed from the committed measurement records |
| `tools/cold-start-probe/out/audit-corrected.json` | the same, with the refusal audit's corrections applied |
| `tools/cold-start-probe/refusal-audit.result.json` | 143 graded refusals + 1,315 raw draws |

---

## §1 — THE DENOMINATOR: THE CADASTRAL PARCEL

**Decision (coordinator addendum, 2026-08-02, not relitigated here): the unit is the cadastral parcel,
from Catastro.** The five cities previously used three incompatible area bases — *private buildable
land* (Barcelona, Murcia, València), *suelo urbano* (Córdoba), *Norma-Zonal-governed land* (Madrid) —
and Madrid carried 48.5 % of the land weight on the least comparable of the three.

**The justification, in five sentences.**
1. It is what the product actually delivers: the user selects a parcel, so the parcel is the unit the
   coverage claim is about.
2. It is published uniformly for every municipality in Spain by one national authority, keyed to one
   national identifier, and is **obtainable cold with no municipal zoning layer of any kind**.
3. It dissolves the Madrid problem outright — we stop asking Madrid to express Norma-Zonal-governed
   land in a national base and instead ask how many of its parcels receive a determination.
4. It is identical in Lugo and in Madrid, so a figure from a 98,000-person city and a figure from the
   capital are the same measurement rather than two conventions.
5. Every alternative that is closer to "private buildable land" is a municipal or regional zoning
   layer, and needing one per city is precisely the bespoke cost this sprint exists to measure.

**Obtained via** the Catastro INSPIRE `CadastralParcels` per-municipality ATOM enclosure
(`.../CadastralParcels/<PP>/ES.SDGC.CP.atom_<PP>.xml` → `A.ES.SDGC.CP.<code>.zip`). Builder:
`tools/cold-start-probe/catastroParcelFrame.mjs`.

> ⚠ **País Vasco (01/20/48) and Navarra (31) run their own foral cadastres.** The builder **REFUSES**
> those provinces rather than mis-measuring them. That is a separate adapter, **not** a coverage gap,
> and it is excluded from every figure in this document and from the tier estimates.

### §1.1 — Cost of the denominator, measured

Six municipalities, cold, no municipal knowledge: **~75 seconds of compute plus download** for the
complete parcel population of all six. Per municipality that is **10–25 s**. This is the cheapest
axis in the programme and it is the only one that is uniform nationally.

### §1.2 ⛔ TWO NATIONAL HAZARDS FOUND WHILE BUILDING IT

Both were found by measurement, both produce **plausible wrong answers rather than errors**, and both
would silently corrupt any national pipeline. They are the most transferable findings in this sprint.

**HAZARD 1 — the Catastro (DGC) municipality code is NOT the INE code, and the two COLLIDE.**
For every provincial capital the DGC code is `<prov>900`: Córdoba is INE 14021 but Catastro **14900**,
Madrid INE 28079 → **28900**, Barcelona INE 08019 → **08900**, Lugo INE 27028 → **27900**. That offset
alone merely fails to find anything. The dangerous part is the collision:

- **DGC `46250` is TURÍS**, a real 6,500-person municipality 24 km inland. **INE `46250` is VALÈNCIA.**
  A code-keyed lookup does not fail for València — it **returns a different, real, plausible
  municipality**. Caught only because the frame came back with 23,784 parcels against Barcelona's
  78,371. The corrected València population is 56,374.
- Probe A hit the **same class of collision independently, four hours later, in a different province**:
  **DGC `08196` is Sant Andreu de Llavaneres; INE `08196` is Sant Andreu de la Barca.** Two
  neighbouring Catalan municipalities with near-identical names — a collision **a human reviewer would
  plausibly have accepted.**

⇒ Two independent occurrences in two probes. This is not a curiosity; it is a systematic property of
keying Catastro on INE. **Every other Spanish service in this repo keys on INE — including SIU, whose
field is literally named `ProvINE`.** The resolver now makes the **municipality NAME authoritative**
and **refuses loudly on a code/name disagreement** rather than picking one.

**HAZARD 2 — the ATOM GML is ETRS89/UTM, and the zone differs between municipalities.**
Measured: **EPSG:25831** (Barcelona), **25830** (Madrid · Murcia · Córdoba · València), **25829**
(Lugo). The `wfsCP.aspx` point service used elsewhere in this repo *does* answer in EPSG:4326 when
asked, which is why nobody had met this. Read as lat/lon, the centroids land in the Atlantic and every
zoning service returns a **well-formed HTTP 200 saying "no polygon here"**. The first Barcelona run
scored **6 of 6 parcels non-buildable** on exactly that basis. The CRS is now read from the file and an
unrecognised one refuses.

**Validated against an independent oracle** (PROBE-DISCIPLINE R2 — a second variant of the same
algorithm is not an oracle): each reprojected centroid was sent to `ovc.catastro.meh.es`, a different
service on a different host answering natively in EPSG:4326, and the returned cadastral reference
compared to the one we started from. **70 of 72 exact.** The 2 misses are both *rustic* parcels whose
centroid falls in an adjacent parcel (`…001` vs `…006`) — the documented R7 limitation of a centroid
test, not a projection error. Run: `tools/cold-start-probe/validateReprojection.mjs`.

### §1.3 — The parcel populations (exact, not sampled)

| city | INE | DGC | **total parcels** | **urban** | rustic | rustic share |
|---|---|---|---:|---:|---:|---:|
| Barcelona | 08019 | 08900 | 78,371 | **76,398** | 1,973 | 2.5 % |
| Madrid | 28079 | 28900 | 141,064 | **137,382** | 3,682 | 2.6 % |
| Murcia | 30030 | 30030 | 150,647 | **91,484** | 59,163 | 39.3 % |
| València | 46250 | 46900 | 56,374 | **40,665** | 15,709 | 27.9 % |
| Córdoba | 14021 | 14900 | 50,530 | **39,639** | 10,891 | 21.6 % |
| *Lugo (Probe B)* | 27028 | 27900 | 91,816 | *19,230* | 72,586 | 79.1 % |

> ⚠ **THE HEADLINE DENOMINATOR IS URBAN CADASTRAL PARCELS, AND THAT CHOICE IS LOAD-BEARING.**
> Urban vs rustic is read mechanically from the reference shape (`PPMMM` + `A` = rustic), so it needs
> no municipal knowledge and stays uniform nationally. **Including rustic parcels is the single
> easiest way to inflate Determination Coverage**: they are trivially refusable as *suelo no
> urbanizable*, and doing so would hand **Lugo 79 percentage points for free** and Murcia 39. That is
> exactly the gaming the split-reporting rule exists to prevent, so it is named here rather than left
> as an implementation detail.

---

## §2 — THE FIVE CITIES RESTATED · OLD vs NEW vs Δ

**Method.** 400 parcels drawn **uniformly without replacement** from each municipality's full urban
parcel population (seed `20260802`; every parcel weighs exactly 1). Each parcel centroid was
point-queried against **the same live publisher service, layer and field the production provider
queries**, and the returned zone code mapped to a category using the slice definitions **committed in
`tools/city-completion/measurements/<city>.measurements.json`**. **2,001 upstream requests, ZERO
transport failures across all five cities.**

The OLD column is **recomputed from those same measurement records**, never retyped from a dossier.

| city | OLD (area, own base) | NEW (parcel, national base) | **Δ determination** | 95 % CI (new) | n |
|---|---|---|---:|---|---:|
| **Barcelona** | 98.3 % = 58.9 + 39.4 | **98.0 % = 76.2 + 21.8** | **−0.3 pp** | 96.0–99.0 | 353 |
| **Murcia** | 95.1 % = 28.1 + 67.0 | **85.0 % = 32.6 + 52.4** | **−10.1 pp** | 79.8–89.0 | 233 |
| **Madrid** | 72.2 % = 11.7 + 60.5 | **53.7 % = 16.7 + 36.9** | **−18.5 pp** | 47.9–59.3 | 287 |
| **València** | 36.4 % = 0.0 + 36.4 | **38.2 % = 0.0 + 38.2** | **+1.8 pp** | 33.0–43.5 | 325 |
| **Córdoba** | 3.0 % = 0.0 + 3.0 | **0.3 % = 0.0 + 0.3** | **−2.7 pp** | 0.0–1.4 | 400 |

**No city was excluded.** All five can be expressed in cadastral parcels — that is the denominator's
whole advantage, and it is the first time the five have shared one.

### §2.1 — RANK CHANGES: **none.**

`barcelona > murcia > madrid > valencia > cordoba` **before and after.** Stated plainly because the
addendum expected large movement and asked directly: **the ordering did not change, but the spacing
changed a great deal.** Madrid loses 18.5 pp and Murcia 10.1 pp, so the gap between Barcelona and the
rest widens sharply, and Madrid moves from "two-thirds done" to "barely half".

### §2.2 — The structural finding underneath the deltas

**Envelope share ROSE in every city where an envelope exists** (Barcelona 58.9 → 76.2, Murcia 28.1 →
32.6, Madrid 11.7 → 16.7) **while determination FELL.** Both move for one reason:

> **The land PRYZM can compute is subdivided into many small parcels; the land it refuses or cannot
> reach is held in few large ones.**

Barcelona's Eixample (clau 13a, computable) is thousands of small plots; its industrial 22a and
volumetric 18 land is a few large ones. Madrid's NZ 3 is 60.5 % of the *area* but far fewer parcels,
while the 23 packed-but-ungated NZ 4/5/7/8/9 zones are dense small plots — which is why Madrid's
`no-pack` rises from 27.8 % of area to **46.3 % of parcels**.

⇒ **Area-weighting systematically flatters determination coverage and understates envelope coverage.**
A user picking a parcel at random in Madrid has a **46 % chance of getting nothing**, against the 28 %
the area figure implied. This is the single most important consequence of the denominator change.

---

## §3 — THE DETERMINATION SPLIT (never a bare number)

> **`Determination % = Envelope % + Refusal %`**, refusals broken out by category. Per the standing
> rule, **a bare determination figure may not appear in any report, dashboard, or external-facing
> document** — Determination Coverage is gameable by refusing, because refusals are cheap and
> envelopes are expensive.

Parcel denominator, before the refusal audit's corrections:

| city | **determination** | envelope | refusal · legally terminal | refusal · delegated to an instrument we don't hold | refusal · gated on external authority | **no-pack (PRYZM's gap)** |
|---|---:|---:|---:|---:|---:|---:|
| Barcelona | 98.0 % | **76.2 %** | 4.5 % | 17.3 % | 0 % | 2.0 % |
| Murcia | 85.0 % | **32.6 %** | 0 % | 52.4 % | 0 % | 15.0 % |
| Madrid | 53.7 % | **16.7 %** | 36.9 % | 0 % | 0 % | 46.3 % |
| València | 38.2 % | **0 %** | 0 % | 38.2 % | 0 % | 61.8 % |
| Córdoba | 0.3 % | **0 %** | 0.3 % | 0 % | 0 % | 99.8 % |

Non-buildable parcels (public systems, viario, equipamientos — a correct answer, but not private
buildable land) are held OUT of the denominator and counted separately: Barcelona 47, Madrid 113,
Murcia 167, València 75 of 400.

> ⚠ **Córdoba's 400/400 sit in the denominator** because outside the 2-district COACo pilot there is
> no vector calificación at all, so public systems **cannot be separated** from private plots. Its
> denominator is therefore over-stated and its 0.3 % is a **lower bound** — the same disclosure the
> city's own record makes about its area figure.

---

## §4 — THE REFUSAL AUDIT

**30 refusals sampled at random per city and graded against the governing article, re-read from the
committed corpus PDFs where they exist.** Seeded draws (`20260803`–`20260807`), rejection-sampled onto
the `not-determined` slices, resolved through the live municipal services.
**Zero upstream failures — no row was graded on a 403/499/timeout.**

| city | n | **correct** | **incorrect** | unverifiable |
|---|---:|---:|---:|---:|
| Barcelona | 30 | **3** | **26** | 1 |
| Madrid | 30 | 26 | **4** | 0 |
| Murcia | 30 | 25 | **5** | 0 |
| València | 23 *(700-draw cap)* | 19 | **4** | 0 |
| Córdoba | 30 *(pilot only)* | 27 | 0 | **3** |

> ⚠ **CRITICAL QUALIFIER, or these numbers will be read as five times worse than they are:
> 33 of the 39 `incorrect` rows are WRONG-CITATION / RIGHT-OUTCOME** — the parcel *is* terminated,
> but by a different article than the one cited. Only **Barcelona's 22a (14 rows)** and **València's
> `MP` rows (4)** are refusals that **should not exist at all**.

### §4.1 — The two findings that move coverage

**(a) Barcelona: 17.15 pp of "refusal" is PRYZM's own gap, and the shipped code already says so.**

> ⚠⚠ **17.15 pp IS AN AREA-BASE FIGURE, AND THIS DOCUMENT IS THE ONE THAT SWITCHED THE DENOMINATOR TO
> THE PARCEL.** On the parcel base the same `legallyGrounded:false` correction moves **3.12 pp — 11 of
> 353 non-envelope parcels**, not 17.15. Measured, seeded, re-runnable:
> `tools/cold-start-probe/out/task3-bcn-taxonomy.json` (seed 20260803).
>
> ⭐ **AND IT CANNOT MOVE THE ENVELOPE FIGURE AT ALL.** `auditCorrected.mjs:36` reclassifies only rows
> whose category already starts with `refusal` — never `envelope`. **Both baselines report the
> identical 269 envelope / 353 non-envelope.** Barcelona's non-envelope share is **23.80 % on the
> uncorrected AND on the audit-corrected baseline.** The caution *"compute against the audit-corrected
> baseline"* was satisfied **by construction**; reading it as *"23.8 % is suspect"* would be misleading.
> Do not re-litigate this denominator.
`esBarcelonaZoneClassification.ts:798` (clau 22a, 15.60 pp) and `:1047` (bare 20a, 1.55 pp) both ship
`legallyGrounded: false`, with docstrings stating *"The LAW is fully known"* — i.e. the ordinance is
read and it is the **data** that is missing. `barcelona.measurements.json` nevertheless tiers both
`not-determined`. **I re-read both lines directly (R8) and confirm the flags.**
⇒ **43.6 % of Barcelona's 39.37 % area-refusal share is a data gap counted as a determination.**

Additionally, the shipped clau-18 refusal card — Barcelona's **largest** refusal slice at 12.89 pp —
quotes **Art. 306** while the two phrases it quotes are verbatim **Art. 333** and **Art. 334.1.b**;
Art. 306's body is entirely *condicions d'ús* and states nothing about volume. A verbatim-provable
mis-attribution in **user-visible** text.

**(b) València: `MP` land is not delegated.** A *modificación puntual* **amends the PGOU itself**; it
is not a derived instrument the plan delegates to. That land stays PGOU-ordered, so the honest class is
a document-acquisition gap. The city's own record already treats `MP` as a **supersession** problem
under LEGISLATION while counting the same land as a **delegation** under ENVELOPE — **the two
treatments contradict.** 6.38 of the 36.40 pp.

### §4.2 — Madrid Art. 8.3.1 vs Art. 8.3.5 · the 60.458 % check

**The `not-determined` OUTCOME survives — but three specific claims in `§NZ3-ARTICLE-VERDICT` are
refuted verbatim from the committed PDF** (`COMPENDIO_MPG_NNUU_24-09-2025_PGOUM-97.pdf`, sha256
`1A3AA172…`, pp. 395–404). Confidence **high** on the text, **medium** on the practical consequence.

- ⛔ **"the only vacant-land new-build route is … enteramente subterránea" is FALSE.**
  Art. 8.3.5.3.b) has **three** sub-routes; **b).iii)** admits *«obras de nueva planta»* on
  *«parcelas sin calificación dotacional destinadas a ser parcelas edificables»*.
- ⛔ **"This slice can never rise, and it should not" is FALSE.** Art. 8.3.5.3.b).ii).b) states an
  explicit computable envelope **inside NZ 3**: *«las condiciones de edificación de la Norma Zonal 5,
  grado 3º, incluida la **edificabilidad de 1,4 metros cuadrados por metro cuadrado**»*.
- ⛔ A governing conditional was dropped from the 8.3.3.1.b) quote: *«**Salvo que del planeamiento
  antecedente se concluyera su condición de parcelas edificables**…»*.
- ⚠ **Art. 8.3.1 is not the operative article** — it is *«Definición general»*. The operative regimes
  are Art. 8.3.5 (Grado 1º) and Art. 8.3.10.c) (Grado 2º). Both terminate, so the refusal stands, but
  the live layer **publishes the two grados separately** (`3.1*` vs `3.2`), so the slice is not
  homogeneous and **one article cannot be cited across it**. The 4 `3.2` samples are cited to an
  article that does not reach them.

### §4.3 — Audit-corrected determination

Applying only the shipped `legallyGrounded: false` flag and the València `MP` reclassification —
**not** the wrong-citation/right-outcome rows, which are a citation-quality defect and are never
netted off against coverage:

| city | **determination** | envelope | refusal (terminal + delegated) | no-pack | 95 % CI | n |
|---|---:|---:|---:|---:|---|---:|
| **Barcelona** | **94.9 %** | 76.2 % | 18.7 % (4.5 + 14.2) | 5.1 % | 92.1–96.8 | 353 |
| **Murcia** | **85.0 %** | 32.6 % | 52.4 % (0.0 + 52.4) | 15.0 % | 79.8–89.0 | 233 |
| **Madrid** | **53.7 %** | 16.7 % | 36.9 % (36.9 + 0.0) | 46.3 % | 47.9–59.3 | 287 |
| **València** | **35.7 %** | 0 % | 35.7 % (0.0 + 35.7) | 64.3 % | 30.7–41.0 | 325 |
| **Córdoba** | **0.3 %** | 0 % | 0.3 % (0.3 + 0.0) | 99.8 % | 0.0–1.4 | 400 |

⇒ **Barcelona is not finished.** On the area base the correction is larger still: its honest cited-
refusal share is **≈ 22.2 %, not 39.4 %**, giving **≈ 81.1 %, not 98.3 %**.

### §4.4 — Is the refusal share trustworthy? **No — it is already drifting.**

Not because refusals are being invented wholesale (78 % of samples terminate on the right ground), but:

1. **Inflated at source** — 17.15 pp of Barcelona and 6.38 pp of València are `no-pack` scored as
   `not-determined`, **against the shipped code's own flag**. ⚠ **Area base; on the parcel base
   Barcelona's figure is 3.12 pp** — see the boxed correction at §4.1(a).
2. **The citation is not load-bearing** — 39 of 143 sampled refusals cite an article that does not
   reach the parcel, including a mis-attribution in a user-visible card over Barcelona's largest slice.
3. **Refusals are ratcheted by declaration** — Madrid's NZ 3 was written *"ANSWERED, permanently …
   can never rise"* over 60.458 % of the city, and the ordinance states **FAR 1,4 m²/m²** inside that
   slice. **That is the standing drift signal — refusal share rising while envelope count is flat —
   arriving by declaration rather than measurement.**

**The mechanical fix**, cheap and complete: make `EnvelopeAxisWeight` refuse to score a slice
`not-determined` unless the shipped refusal for that zone carries `legallyGrounded: true` **and** a
non-null `ordinanceRef`. That removes 17.15 pp of Barcelona and 6.38 pp of València automatically and
would have caught every mislabel in this audit **without a human reading a word of Catalan.**
⚠ **Area base — on the parcel base Barcelona's removal is 3.12 pp, and it moves the ENVELOPE figure by
zero.** See the boxed correction at §4.1(a) before quoting either number.

---

## §5 — TEMPORAL VALIDITY: AN UNMEASURED OVER-GRANT RISK

Murcia's features carry `f_fin` (`2999-12-30Z` = in force); the determination join filters it. Asking
the same question of the other publishers:

| publisher | validity field | state |
|---|---|---|
| Murcia `pgou_alineaciones` | `f_fin` | **filtered** by the join |
| **València** layer 231 | **`operacionbaja`** | ⚠ **19,287 of 21,210 rows (91 %) are non-null. PRYZM does not filter it. Its semantics are UNKNOWN.** |
| Barcelona AMB layer 16 | **none** | no temporal field exists — supersession cannot be filtered at all |
| Madrid `NORMAS_ZONALES/0` | none | a 34-row dissolved layer, one polygon per code |

> ⚠ **The València row is an open risk, not a finding.** I did **not** establish that `operacionbaja`
> means supersession — 91 % would be implausible for a live planning layer, and both PRYZM's path and
> the record's independent server-side cross-check read all 21,210 rows. **If it does mean
> supersession, every València figure is drawn from superseded geometry** — an L-616-class over-grant.
> It is recorded as UNKNOWN and owed a one-line answer from the municipality.

---

## §6 — WHAT I COULD NOT MEASURE (explicit)

- **The production dispatch itself.** The join calls the production **publisher service, layer and
  field**, but not `dispatchParcelBoundary`, which needs an editor runtime. **It cannot catch a defect
  between "the right zone was read" and "the right refusal was emitted"** — e.g. Córdoba's resolver,
  which is authored but never called, still scores here as if it routed. (PROBE-DISCIPLINE R1
  deviation, stated; the refusal audit is the instrument for that gap, not this.)
- **Three sub-splits are INHERITED, not re-measured**, and are labelled in the output: Barcelona's
  block-dissolve success rate (96.22 %), Barcelona's clau-18 OV-footprint share (26.4 %), Murcia's
  street-width resolution rate (52.0 %). Each needs a second engine run per parcel.
- **Whether València's `operacionbaja` means supersession** (§5).
- **Córdoba's private-buildable subset** outside the pilot — no vector calificación exists, so systems
  cannot be separated from private plots.
- **Barcelona's `tail` slice (4.83 pp) names no article at all**, so there was nothing to grade.
- **Córdoba's and València's article text** — no in-repo corpus, so every audited row from those two
  cities is `evidence: weak`.
- **The dotacional share of Madrid NZ 3** and **the no-Pla-Parcial share of Barcelona 22a** — neither
  publisher publishes the attribute, so the size of the two largest identified defects is unknown.
