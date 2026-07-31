# RISK-REGISTER — Madrid (INE 28079)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-31. **Maintainer:** UNASSIGNED.
>
> **Standing principle:** *an absent envelope costs nothing; a confident wrong one costs credibility.*
> Every risk is scored against whether the mitigation FAILS SAFE (refuse / badge honestly) or fails
> loud-and-wrong. Not scored by C63; this file protects `honestyOk` (C63 §3.1).
>
> **The Madrid-specific hazard class:** most of the risks below are *silent* — they produce a
> plausible number with **no error raised and no confidence penalty**. That is strictly worse than a
> refusal, and it is why several guards here are type-level rather than procedural.

| # | Risk (how it could silently lie) | Axis | Guard (the honest default) | Status |
|---|---|---|---|---|
| **R1** | Reading a data-readiness rate as PRYZM's coverage | LEGISLATION | Three rulers, three denominators, never conflated: **~68 %** data-readiness (`LEGISLATION-RATE.md`) · **0 %** cited-and-signed legislation (C63 Axis 2) · **0 %** shippable envelope. `RATE.md` states all three side by side. | **CLOSED** |
| **R2** | Solving NZ 1 without a fetched footprint | ENVELOPE | `resolveMadridNZ1Ring` has no same-origin proxy wired; the dispatcher solves ONLY when a ring is available, otherwise returns the TRANSIENT `madridNZ1Refusal` — never a fabricated envelope. | **CLOSED** |
| **R3** | A transient refusal misread as a legal "no envelope" | ENVELOPE | Distinct codes: `madridNZ1Refusal` = plumbing/verification state (the PGOUM-97 *does* grant an envelope); `madridNZ1AbsentRefusal` (`no-plan-at-point`) = a genuine no-footprint point. Failure ≠ empty (L-422/457/467/469). | **CLOSED** |
| **R4** | Trusting an unverified calificación mapping | LEGISLATION | Routing is taken from `NORMAS_ZONALES/0` `AMB_TX_ETIQ` (34 codes, VERIFIED-LIVE), not from the once-flaky `PG_ORDENACION`. `returnCountOnly` unfiltered before believing any zero. | **CLOSED** |
| **R5** | Stamping NZ 4/8 numbers from a secondary source | LEGISLATION | Web search mixes APR-plan values with the general norm — APR plans carry site overrides that *contradict* it. Zod (`buildableDepth_m .positive()`, full setback triple) blocks a pack without primary, L-449-signed numbers. | **CLOSED** (structural) |
| **R6** | Silent-zero on the `COEF_Z` parse | ENVELOPE | `parseCoefZ` classifies under assertion: `"-"`/blank → **absent, not zero**; `"0 / 5"` → **refuse** (`parseFloat("0 / 5") === 0` is the trap). Refuses on a bad parse rather than emitting zero edificabilidad. | **CLOSED** |
| **R7** | Reading `not-assessed` as 0 % | all | `not-assessed ≠ 0 %` (C63 §1.2). ⚠ And the converse now matters too: LEGISLATION and ENVELOPE are **measured zeros**, not unmeasured — `RATE.md` states which is which per axis. | **CLOSED** |
| **R8** | Claiming measured heights / verified terrain before a probe | HEIGHTS · TERRAIN | HEIGHTS stays `not-assessed` until the H1 probe; TERRAIN capped at rung **50** (baked-but-unverified). Rasant-datum caveat as Barcelona (L-584). | **OPEN** (probes not run) |
| **R9** | 🔴 **`COND_EDIF` conflated with the Norma-Zonal grade** — two different dimensions that both surface as a bare digit (`1.3` vs `COND_EDIF=3`) | LEGISLATION · ENVELOPE | **The most dangerous silent error identified in this dossier.** Conflating them applies the wrong ruleset with **no error and no confidence penalty**. Proven in-repo: **25/25** verified-interior parcels with `COND_EDIF=5` sit in zonal grado `1.1`/`1.2`, never `1.5`. Guard: take the zonal grado ONLY from `NORMAS_ZONALES.AMB_TX_ETIQ`; model `zoning.grade` and `buildingCondition.grade` as **separate typed objects**, not a naming convention. | **OPEN** — documented; type-level separation not yet enforced in code |
| **R10** | 🔴 **Citing the superseded Compendio** — two Madrid portals serve different consolidations simultaneously | LEGISLATION | `geoportal.madrid.es` serves `COMPENDIO_MPG_NNUU_07_07_2025.pdf` (**superseded** July 2025); `transparencia.madrid.es` serves the current **24-09-2025** edition. Both HTTP 200; distinct documents; **no on-page signal** on the older one. Guard: every extracted value carries `readFrom` (which consolidation was opened) **separate** from `effectiveDate` (the BOE date of the article/modificación). A `07_07_2025` filename in any citation ⇒ version-suspect. | **OPEN** — hazard is upstream and permanent; only the discipline is ours |
| **R11** | **`COEF_Z` bound to `farRatio`** without a citation | ENVELOPE | The only FAR-shaped number Madrid exposes; meaning **and** denominator unknown (keyed on `CODMANZANA` ⇒ scope may be *manzana*, not parcel). Reading `COEF_Z = 5` as FAR 5.0 is the **L-616** failure exactly — a massing that ignored the FAR ceiling (~5×) and drew setback-unknown as zero. Guard: quarantined as `{ status: "coded-value", meaning: "unknown", blocked: true }`; never bound, not in a pack, a fixture, or a doc table. ⚠ Applies equally if `COEF_Z` appears on `PG_EDIFICIOS_PROTEGIDOS`. | **OPEN** (by design — stays quarantined until Cap. 8.1 defines it) |
| **R12** | **NZ 3's "✅" read as "NZ 3 is complete"** | LEGISLATION | The ✅ scores *refusal logic works*, not *rules are known*. `sources/SOURCES.md` §D records these as **two separate claims** and signs them separately. A correctly-refusing zone is not a complete zone. | **CLOSED** (by construction) |
| **R13** | **Parcels that route nowhere** — zones 2/6/10/11 absent from `AMB_TX_ETIQ` | LEGISLATION · ENVELOPE | NZ 2 and NZ 6 have ordinance chapters, so "they don't exist" is eliminated for those two. If the cause is *unobserved-in-GIS*, real parcels fall through to a blanket refusal **with the wrong stated reason** — an honest-looking answer that cites the wrong law. Guard: cause recorded as three candidates, none assumed; probe P2 named. | **OPEN** |
| **R14** | **Unprobed layer field-names treated as real** | DATA-SOURCES | `PG_ANALISIS_EDIFICACION`, `PG_USOS_Y_ACTIVIDADES`, `PG_EDIFICIOS_PROTEGIDOS`, `PG_GESTION/Alineaciones` are named in the captures with field lists; **none has been queried**. Guard: `sources/SOURCES.md` §G3 marks every field name a **hypothesis**; none may be cited or counted toward an axis until a `MapServer` response returns it. | **OPEN** |
| **R15** | **A resolver laundering `unknown` into a value** | ENVELOPE · LEGISLATION | Every other guard here governs *extraction*. This one governs *resolution*, where a "best available candidate" picker will silently promote an unsourced default into a confident answer and defeat all upstream `null` discipline. Guard: **resolution must never increase confidence** — `unknown` survives resolution (capture-note C-27; the L-616 invariant one layer later). | **OPEN** — no resolver built yet; must be a precondition, not a retrofit |
| **R16** | **Height recorded with a datum but no sampling rule** | HEIGHTS · ENVELOPE | Recording `measurement: "cornisa"` + `referencePlane: "rasante_oficial"` and stopping there **still reproduces L-584 exactly** — that defect sampled one point at the block centroid where the ordinance measures at the **façade**. Guard: datum and sampling rule are **two** required fields. Also: **never convert floors → metres** (`6 floors ≈ 20 m` is fabrication; store `height_m: null, floors: 6`). | **OPEN** |
| **R17** | **Override precedence unmodelled** — a parcel can carry NZ + protected building + ficha + ámbito at once | ENVELOPE | "GIS says NZ 4 → apply NZ 4" is incomplete. Until the override branches exist, an NZ-1 parcel that also carries a ficha or catalogue entry would receive the **general zone answer**. Currently *masked* by the blanket refusal — it goes live the moment the first pack registers. Guard: named in `sources/SOURCES.md` §E as a known false-positive path; must be built before, not after, the first pack. | **OPEN** — masked, not fixed |
| **R18** | **NZ 5 forced into the setback triple** | ENVELOPE | Open blocks may regulate *distancia entre edificios* (building separation), not *retranqueo a linderos*. Forcing that into a setback triple is a **wrong SHAPE, not a wrong number** (ADR-0270) — the worse failure. Guard: NZ 5's `geometricRule.kind` is recorded as **UNDETERMINED**, not `setback`; the wording test is a sign-off item before any code. | **OPEN** |
| **R19** | **A forecast quoted as a measurement** | all | The captures contain five completeness scales and several effort forecasts (~90–95 %, 5–8 weeks). `RATE.md` records them as *as-supplied, differing basis* and scores only C63. Guard: C63 scores **state**, never plans; land-share figures (~65 %/~96 %/~35 %) are **UNSOURCED** and never presented as measured coverage. | **CLOSED** |

## Trip-wires

Mirrors `NEXT.md` §5. A risk **re-opens** if any of these is observed:

- A citation appears anywhere quoting the filename `COMPENDIO_MPG_NNUU_07_07_2025.pdf`, or a
  `readFrom` older than `2025-09-24` → **R10**.
- A pack, fixture, doc table, or test binds `COEF_Z` to `farRatio`, `plotRatioFAR`, or any density
  field → **R11**.
- A single field named `grade`/`grado` carries both a zonal grade and a `COND_EDIF` value → **R9**.
- A Madrid `packsByZone` entry appears **before** the override-precedence branches exist → **R17**.
- Any resolver, override, or merge step emits a numeric value for a parameter whose extracted state
  was `unknown` → **R15**.
- A height value is stored without **both** a measurement datum and a sampling rule → **R16**.
- An `NZ<n>` pack key appears without a grado suffix (NZ 8 has 10 codes; NZ 4 has none — both are
  errors if inverted) → **R5**.
- Any of the four unprobed layers' field names is cited as a source rather than a hypothesis → **R14**.
- A completeness figure appears that is not one of the three named rulers in `RATE.md` → **R1/R19**.

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns), C58 §1.2/§1.4/§2.2, ADR-0270
(rule-kind union). Evidence: `sources/SOURCES.md` §0/§B2/§E/§G, `findings/MADRID-DATA-RECON-SPIKE.md`,
`findings/L-608-*`, and the seven `findings/SOURCE-founder-*-2026-07-31.md` captures. Code:
`rulepacks/esMadridNZ1.ts`, `rulepacks/esMadridNZ1Provider.ts`, `providers/madridBbox.ts`.*
