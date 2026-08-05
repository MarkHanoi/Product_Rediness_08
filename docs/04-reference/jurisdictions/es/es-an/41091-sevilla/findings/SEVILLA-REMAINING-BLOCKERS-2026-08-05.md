# Sevilla (INE 41091) — Remaining Blockers, evidence-based, 2026-08-05

> Scope: given 15/15 live `zona_orden` codes packed, 5 producing real footprints, and
> `SEVILLA_ENVELOPE_VERIFIED` signed — enumerate exactly what still blocks the other 10 zones and
> the missing per-parcel HEIGHT, with the file/article/live-response evidence for each, and close
> whatever is genuinely closeable without new legal sourcing.
>
> ⛔ `SEVILLA_ENVELOPE_VERIFIED` was read, not touched. No height unit conversion was fabricated.
> No depth or setback figure was invented for any refusing zone. Nothing was committed or pushed.

**Total blockers: 12.** Closed this pass: **1** (B-12, the stale user-facing coverage copy).
Materially advanced, not closed: **B-1** (the `altura_max` unit — the *plan's* convention is now
documented from the ordinance; the *field's* linkage to that plan is not).

---

## B-1 — `altura_max`'s unit. **PARTIALLY RESOLVED — the plan's convention IS documented; the field's provenance is not.**

**What's missing:** whether Layer 25's `altura_max` string (`esriFieldTypeString`, live SB value
`"4"`) is metres or a floor count. `esSevilla.ts` lines 56–69 and `resolveSevillaZone.ts` lines
46–50 both declare it formally unresolved, and both refuse to interpret it.

**Where I looked, and what I found:**

1. **Live ArcGIS metadata, re-fetched this pass** (`MapServer/25?f=json`, `MapServer/1?f=json`,
   `MapServer/1/legend?f=json`, `MapServer?f=json`):
   - Layer 25 field: `{"name":"altura_max","type":"esriFieldTypeString","alias":"Altura máxima",
     "length":20,"domain":null}` — **`domain: null`, no field description, layer `description: ""`.**
     Nothing new. The prior pass's conclusion stands.
   - Layer 1 "Etiquetas y Altura máxima de la edificación": `description: ""`, renderer
     `uniqueValue` on **`field1: "textstring"`**, values `"1"`…`"16"` all labelled `"Altura máxima"`,
     plus `<Null>` labelled `"Conservación de uso existente"`. **No unit anywhere.**
   - **New structural fact:** Layer 1's field list is an **Esri annotation feature class** —
     `textstring`, `fontname`, `fontsize`, `angle`, `txtjust`, `txtoblique`, `symbolid`, `element`
     (blob), `geometryType: esriGeometryPoint`. It is not a data layer with a height attribute; it
     is the **digitised label layer of a paper plan sheet**.
   - `MapServer/1/legend?f=json` returns a 59-byte empty payload — no legend text to mine.

2. **The paper plan that Layer 1 digitises**
   (`corpus/Plano_De_Urbanizacion_Pormenorizada/TR_12-14.pdf`, "ORDENACIÓN PORMENORIZADA COMPLETA",
   escala 1/2.000). Its legend block reads, verbatim (`pdftotext`, plain mode, lines 1158–1168):
   `ALINEACIÓN EXTERIOR … FONDO MÁXIMO EDIFICABLE Y PASAJE EN PLANTA BAJA … CAMBIO DE ALTURA Y/O
   ZONA DE ORDENANZA` / `2` / `ALTURA MÁXIMA` / `CONSERVACIÓN DE USO EXISTENTE` / `(SG) SISTEMA
   GENERAL`. The Layer 1 renderer's own two labels (`"Altura máxima"`, `"Conservación de uso
   existente"`) are **verbatim this legend** — confirming Layer 1 = this plan's annotation.
   The legend itself states **no unit**.

3. **The ordinance's own statement of what that plan's number means — THE NEW EVIDENCE.**
   Read verbatim from `corpus/NormasUrbanisticas/` extractions this pass:
   - **Art. 12.3.8 §1 (M/Mp, Cap. III):** *"La altura de las edificaciones **se fija en número de
     plantas** en el Plano de Ordenación Pormenorizada Completa del Plan General."*
   - **Art. 12.2.11 §2 (CH, Cap. II):** *"El **número de plantas** que podrán autorizarse como
     máximo es el marcado para cada parcela en el Plano del Centro Histórico…"* — and §5 makes the
     metric height a **derived** quantity: *"La altura máxima **en unidades métricas** vendrá
     determinada en función de los parámetros que a continuación se establecen…"*
   - **Art. 12.9.3 §4 (CT, Cap. IX):** *"El **número máximo de plantas** será el establecido en los
     Planos de Ordenación Pormenorizada Completa."*
   - **Art. 12.12.2 §2.2 (ST-C) and Art. 12.12.3 §2.5 (ST-A):** *"Las que se grafían en los Planos
     de Ordenación Pormenorizada Completa, atendiendo a la siguiente relación: **Nº de plantas** 1 /
     2 / 3 / N>3 — **Altura máxima en metros** 4,50 / 9,00 / 12,50 / (N×3,5 m)+2,00"* — an explicit,
     article-stated **plantas → metres** conversion table.
   - **Art. 12.4.5 (A) and Art. 12.5.7 (SB)** do not name the unit in the sentence that fixes it on
     the plan, but both state the *substitute* determination as *"el **número máximo de plantas** se
     determinará mediante la redacción de un Estudio de Detalle"*, and both give per-storey maxima
     (450 cm planta baja / 320 cm plantas superiores) — arithmetic only meaningful over a floor
     count.
   - **Counter-case, and it matters:** **Art. 12.10.2 §2.5 (IS)** — *"En este caso **no se señalan
     alturas en los Planos** de Ordenación Pormenorizada Completa, admitiéndose una altura máxima …
     **medidas en unidades métricas** de veinte (20) metros."* The plan carries no height at all for
     IS, and the ordinance contrasts "unidades métricas" with the plan's determination. Art. 12.10.3
     (IA, 15 m) and Art. 12.10.4 §2.6 (IC, 12 m) likewise cap in metres. **So the plan's convention
     is not uniform across all 15 zones and must never be applied globally.**

4. **`corpus/Plano_de_Informacion/TR_I_3_2_Alturas_De_La_edificacion.pdf`** — read in full this
   pass (it is a single sheet; full text extracted). Title block: `ALTURAS DE LA EDIFICACIÓN` /
   `INFORMACIÓN` / `escala 1/15.000` / `i 3.2`. Legend bands: `0`, `1-2`, `2-4`, `4-6`, `6-8`,
   `8-10`, `10-12`, `>12`. **This is an `INFORMACIÓN` (diagnostic survey) sheet at 1/15.000 showing
   the EXISTING city's heights — not an ordenación determination, not a legend for `altura_max`, and
   its band structure matches neither the 1…16 integer domain nor any ordinance table.** It does not
   resolve the unit. (Recorded so nobody re-opens it: the answer is "wrong document class" —
   surveyed ≠ normative.)

5. **`corpus/Nuevo_Plan_De_Urbanizacion_Urbano/`** — checked for a superseding instrument. Every
   sheet's footer reads *"Documento aprobado definitivamente por Acuerdo Plenario del Ayuntamiento de
   Sevilla de 15 de marzo de 2007. TEXTO REFUNDIDO"*, under the masthead *"NUEVO PLAN GENERAL DE
   ORDENACIÓN URBANÍSTICA. SEVILLA"*. **"Nuevo Plan General" is the 2006 PGOU's own title** — these
   are its Ordenación Estructural sheets, not a later plan. **No superseding instrument exists in the
   held corpus.**

**Verdict — still blocked, and here is exactly on what.** The question "what does the number on the
Plano de Ordenación Pormenorizada Completa mean?" is now **answered from the ordinance itself, per
chapter** (número de plantas for CH, M/Mp, CT, ST-C, ST-A explicitly; metres-capped-but-plan-fixed
for IA/IC; no plan determination at all for IS). The question that remains open is narrower and
different: **is Layer 25's `altura_max` string populated from that plan annotation?** No field
domain, no field description, no layer description, no service metadata and no published data
dictionary says so (all four re-checked live this pass). The circumstantial chain is strong (Layer 1
is that plan's annotation; its values are integers 1…16; SB's Art. 12.5.9 table is keyed on 2/3/4
"Nº Plantas"; a metres field would show ST-C's own 4,50 / 9,00 / 12,50) — **but a strong inference is
not a documented convention, and packing it would be the exact L-616 / ADR-0287 fabrication this
repo already catalogued. No conversion was written.**

**What would close it (one of):** (a) a published GUMA/`cdu.urbanismosevilla.org` data dictionary or
metadata record for Layer 25 stating the field's unit; (b) a written answer to a transparency
request to the Gerencia de Urbanismo; or (c) a cross-check that samples N parcels, reads the plan
sheet's printed label at each parcel and compares it to `altura_max` — a *measurement*, which would
establish the field's provenance without anyone's opinion. (c) is the cheapest and is fully within
PRYZM's reach: `Plano_De_Urbanizacion_Pormenorizada/` is already held locally.

**Fixable now?** No — not without one of the above. **Needs new sourcing (cheap, well-defined).**

---

## B-2 … B-11 — the ten structurally-refusing zones, one sentence each

I read every named article verbatim this pass. **None of the ten has a flat figure hiding in an
unread document** — the corpus contains one consolidated ordinance (`06_TR_NORMAS.pdf`) and its
Título XII chapters were all read; the missing inputs below are *data about the individual parcel*
or *lines on a graphic plan*, never unread text. The "quick corpus grep before assuming a solver"
check the brief asked for was done and came back empty.

### Group A — needs a genuine occupancy/geometry SOLVER (shared, cross-city engineering)

| # | Zone | The one specific missing input |
|---|---|---|
| **B-2** | `SB` | The parcel's own **area and fondo**, to select which branch of Art. 12.5.6 §1 applies (rear separation of 40 %·h, min 3 m, *only* if area >110 m² **and** fondo >15 m), **plus** a solver that turns Art. 12.5.4's occupation cap into a footprint rather than a percentage. |
| **B-3** | `M` | An **occupation-cap → footprint solver** for Art. 12.3.6 §1.a's 80 %: Cap. III states *no rear-lindero rule at all* (all 14 articles read), so occupation is the only depth mechanism and there is nothing else to convert. |
| **B-4** | `ST-C` | Same solver, harder input: Art. 12.12.2 §2.1 permits **100 % occupation** bounded only by FAR, and both FAR (§2.3) and height (§2.2) are *plantas-count tables* — so it needs the parcel's floor count **and** a FAR→footprint solver. |
| **B-5** | `CH` | A **polygon-offset solver**: Art. 12.2.9 §1's occupation is a computed area, `Mocp = Sup. parcela − 0.33 × Sup. solar teórico`, where "solar teórico" is itself a 5 m-inward offset of the exterior alignment — plus Art. 12.2.8's graphic `fondo edificable` line where one is drawn. |

### Group B — needs the parcel's **HEIGHT** `h`; the arithmetic is then trivial

| # | Zone | The one specific missing input |
|---|---|---|
| **B-6** | `CJ` | `h` for the parcel, to evaluate Art. 12.6.3 §3's `h/2` side/rear separation. Front is already a flat, packed 4 m — **this zone is one number away from a real footprint.** |
| **B-7** | `A` | `h`, to evaluate Art. 12.4.3 §1's `40 %·h` — which governs *every* lindero including the front (measured from the street axis), so there is no flat edge to fall back on. |
| **B-8** | `IC` | `h` **and** the parcel's area (Art. 12.10.4 §2.2's `h/2`, min 3 m, applies only to post-Plan construction on parcels >1,000 m²) **and** whether §2.3's unitary-manzana adosado applies. |

⇒ **B-6/B-7/B-8 are all downstream of B-1.** If `altura_max`'s provenance is established and it is a
floor count, the ordinance already supplies the plantas→metres arithmetic for these chapters
(Art. 12.4.5/12.5.7: 450 cm PB + 320 cm per upper storey; Art. 12.3.8 §3: 450 + 350). **Closing B-1
plausibly closes three refusals at once — the highest-leverage single item in this list.**

### Group C — needs the parcel's **AREA** only

| # | Zone | The one specific missing input |
|---|---|---|
| **B-9** | `ST-A` | The parcel's **area**, to pick Art. 12.12.3 §2.3's bracket: <2.000 m² → 4 m; 2.001–5.000 → 6 m; 5.001–7.000 → 8 m; >7.000 → 10 m, applied to all linderos. No solver, no height, no graphic plan. |

⚠ **Honest caveat before anyone "just computes the area".** The polygon reaching
`computeBuildableEnvelope` is the **user-drawn site boundary**, not a cadastral parcel — using its
area to select a legally-bracketed setback would attach a legal determination to a hand-drawn shape
and would flip brackets on a 1 m² drafting difference at 2.000/5.000/7.000 m². Closing B-9 honestly
requires binding a **real Catastro parcel area**, plus a guard that refuses near a bracket boundary.
That is a real but well-scoped piece of work with **no new legal sourcing** — the cheapest genuine
zone unblock on this list.

### Group D — needs a **graphic line PRYZM can already query live**

| # | Zone | The one specific missing input |
|---|---|---|
| **B-10** | `MP` | Art. 12.3.4's **"alineación interior"** (continuous line = obligatory, dashed = maximum). This line is **published**: Layer 4 "Alineaciones" carries `A_INTERIOR-OBLIGATORIA`, `A_INTERIOR-MAXIMA`, `CS_A_INTERIOR-OBLIGATORIA`, `CS_A_INTERIOR-MAXIMA` (`resolveSevillaAlignments.ts` lines 12–23, verified live 2026-08-04 against 28 real `A_INTERIOR-MAXIMA` polylines). |
| **B-11** | `CT` | Art. 12.9.3 §1's alineaciones/retranqueos, *"las grafiadas en los Planos"* — same Layer 4, `A_RETRANQUEO` / `A_RETRANQUEO_MOD_TR` / `CS_RETRANQUEO`. CT states no flat figure for anything (setback, occupation, height, FAR), so the graphic line is the *only* route. |

⇒ **B-10/B-11 are the closest to closeable of all ten.** The resolver
(`resolveSevillaAlignments`) and the pure clip (`sevillaFondoClip.ts` / `clipParcelByFondoLine`)
both already exist and are already wired in `siteDispatch.ts` (lines 4019–4115) — but **only behind
`isUncertifiedPreviewModeActive()`**, i.e. staging-only, never production. Lifting them into the
signed `§SEV-COMPUTE` path is a **legal** decision (it publishes a PRYZM-constructed footprint from
a line PRYZM chose as "nearest"), not a mechanical one, and is deliberately out of scope here. It is
the same "confidence, not mechanics" call `CORDOBA_MC_FONDO_UNRESOLVED_RING` documents.

---

## B-12 — Stale user-facing coverage copy. **CLOSED THIS PASS.** ✅

**What was wrong.** `SEVILLA_ROADMAP_LINE` and `sevillaNoRulePackRefusal`'s `detail` — both **shown
to users** on the refusal card — still said, verbatim: *"The ENVELOPE half has not been started:
PRYZM has not transcribed a single PGOU-2006 ordinance parameter (no FAR, coverage, setback, height
or depth table)"* and *"no FAR, coverage, setback, height or buildable-depth parameter has been read
from the plan text for any Sevilla zone"*. Written 2026-08-03; false since 2026-08-05, when all 15
zones were packed, 5 gained real footprints and the gate was signed. Four more places carried the
same dead claim: `registry.ts`'s Sevilla `answerSummary` (*"One zone (SB, 'Suburbana') has been
transcribed … every buildable figure is still refused"*), the `SEVILLA_ENVELOPE_VERIFIED` doc block
(*"`ES_SEVILLA_PGOU_PACK.zones` is empty by construction"*), `esSevilla.ts`'s module header (*"THE
HONEST OUTPUT REMAINS A CITED REFUSAL for every Sevilla parcel … MUST stay `false`"*),
`resolveSevillaZone.ts`'s header (*"Sevilla has ZERO PRYZM rulepack code"*), and
`siteDispatch.ts`'s `§SEVILLA-ENVELOPE` header (same "zones is empty" claim).

**Why it counts as a defect, not a typo.** §CONTEXT-DATA-HONESTY cuts both ways: a card that
**understates** PRYZM's own coverage misinforms the user in the same class as one that overstates it,
and a stale comment sitting beside a *signed legal gate* is the most dangerous stale comment in the
file. It is also the highest-risk-of-rot text in the subsystem — five copies of one claim.

**What I changed** (all copy/comments — **no numeric, geometric or legal value was touched, and
`SEVILLA_ENVELOPE_VERIFIED` was read only**):

| File | Change |
|---|---|
| `packages/site-parcel-data/src/rulepacks/esSevilla.ts` | `SEVILLA_ROADMAP_LINE` rewritten to the real coverage split (15 packed / 5 real footprints, the 10 refusing zones named with *why*, height real for IS 20 m + IA 15 m only). `sevillaNoRulePackRefusal`'s headline+detail rewritten — the card is reached only for a `zona_orden` outside the 15 packed codes (blank/`null`/`"ver PG 87"`) or no zone at all, and now says exactly that. `SEVILLA_ENVELOPE_VERIFIED`'s doc block: false "zones is empty" paragraph replaced with a correction note (value untouched). Module header's pre-signature "remains a cited refusal for every parcel" paragraph replaced with the real three-way split. `lastReviewed: '2026-08-03'` → `'2026-08-05'` (the date CH was read and the pack re-verified). |
| `packages/site-parcel-data/src/rulepacks/registry.ts` | Sevilla `answerSummary` rewritten to the same real split; the block comment's "it always dispatches `sevillaNoRulePackRefusal` regardless of pack contents" corrected (false since `§SEV-COMPUTE` shipped); `packsByZone: packMap()` comment now explains *why* it stays empty (`applySevillaZoningThenFallback` reads `ES_SEVILLA_PGOU_PACK` directly — populating it would create a second, divergent source of truth). |
| `packages/site-parcel-data/src/providers/resolveSevillaZone.ts` | Header's "`SEVILLA_ENVELOPE_VERIFIED` is `false` — Sevilla has ZERO PRYZM rulepack code" corrected. |
| `apps/editor/src/ui/site/siteDispatch.ts` | `§SEVILLA-ENVELOPE` JSDoc's "ZERO transcribed parameters / zones is empty by construction" corrected, pointing at `§SEV-COMPUTE`. |
| `packages/site-parcel-data/__tests__/resolveSevillaZone.test.ts` | **+3 regression tests** so the copy cannot rot back. |

**The three new tests** (in `describe('sevillaNoRulePackRefusal …')`):
1. *"never claims PRYZM has transcribed nothing"* — asserts the card's text matches none of
   `/has not transcribed a single/i`, `/no FAR, coverage, setback, height or (buildable-)?depth/i`,
   `/ENVELOPE half has not been started/i`, `/for any Sevilla zone/i`, for both the
   zone-resolved (`"ver PG 87"`) and zone-unresolved cases.
2. *"states the real coverage split"* — asserts `fifteen`, the five zone codes, `IS 20 m`,
   `IA 15 m`, and re-pins that the card is still `code:'no-rule-pack'`, `legallyGrounded:false`,
   `ordinanceRef:null` (a statement about PRYZM's coverage, never about the land).
3. *"the five real-footprint zones named in the copy are exactly the pack's non-refusing zones"* —
   **derived from `ES_SEVILLA_PGOU_PACK.zones` by filtering `geometricRule.kind !== 'explicit-area'`,
   never re-typed**, so if a zone ever lifts out of structural refusal this fails until the
   user-facing copy is updated to match.

**Test evidence (exact counts):**

| Run | Before | After |
|---|---|---|
| `npx vitest run resolveSevillaZone esSevillaEnvelope sevillaEndToEndProof resolveSevillaAlignments sevillaFondoClip` (in `packages/site-parcel-data`) | 5 files / 93 tests | **5 files / 96 tests, all passing** |
| `npx vitest run` (full `packages/site-parcel-data`) | 148 files / 2831 tests (per `SEVILLA-ENGINE-PROGRESS-2026-08-05.md` §8) | **149 files / 2843 tests, all passing** |
| `npx vitest run sevillaSiteDispatch` (in `apps/editor`) | 1 file / 5 tests | **1 file / 5 tests, all passing** |
| root `npx tsc --skipLibCheck --noEmit` | — | **clean, zero errors** |

*(The 148→149 file / 2831→2843 test delta over the progress doc's baseline includes other sessions'
concurrent work in this shared tree; this pass's own contribution is the +3 tests above, measured on
the Sevilla-only run.)*

---

## Transient-failure surfaces — audited, none left open

The brief asked whether any other Sevilla-facing live call carries the single-attempt/no-retry
pattern the ArcGIS fix closed this session. **It does not.**

- `providers/containers/arcgisRest.ts` §ARCGIS-TRANSIENT-RETRY (lines 53–94) wraps **both**
  exported query shapes — `queryArcgisRestPointIntersect` (line 129) *and*
  `queryArcgisRestEnvelopeIntersect` (line 209) — via `withArcgisRetry`. Policy is correct as
  shipped: retries transport exceptions, 5xx and 429; never retries other 4xx, never retries an
  ArcGIS `{"error":…}` 200-body (a semantic answer, not a hiccup); 3 attempts, 250/750 ms backoff.
- **Sevilla has exactly two live callers**, and both already go through it:
  `resolveSevillaZone.ts` line 178 (Layer 25, point-intersect) and `resolveSevillaAlignments.ts`
  line 148 (Layer 4, envelope-intersect). Grepped `packages/site-parcel-data/src` for every
  `fetch(`/`fetchImpl(` site — 37 files, none of the others is Sevilla-facing.

⇒ **No new retry fix was needed and none was written.** Adding one anywhere else would have been
work on another city's surface, outside this brief.

---

## Summary table

| # | Blocker | Status | Needs |
|---|---|---|---|
| B-1 | `altura_max` unit / provenance | ⚠ Advanced, not closed | New sourcing — a data dictionary, a GU transparency answer, **or** a plan-sheet↔field sampling measurement |
| B-2 | `SB` depth | ⛔ Blocked | Parcel area + fondo, **and** an occupancy solver |
| B-3 | `M` depth | ⛔ Blocked | Occupation-cap → footprint solver |
| B-4 | `ST-C` depth | ⛔ Blocked | Floor count **and** FAR → footprint solver |
| B-5 | `CH` depth | ⛔ Blocked | Polygon-offset ("solar teórico") solver + graphic fondo line |
| B-6 | `CJ` side/rear | ⛔ Blocked | Per-parcel `h` (⇒ downstream of B-1) |
| B-7 | `A` all linderos | ⛔ Blocked | Per-parcel `h` (⇒ downstream of B-1) |
| B-8 | `IC` side/rear | ⛔ Blocked | Per-parcel `h` + parcel area + construction date |
| B-9 | `ST-A` all linderos | ⛔ Blocked, **cheapest zone unblock** | Real **Catastro parcel area** + bracket-boundary guard. No new legal sourcing. |
| B-10 | `MP` interior alignment | ⛔ Blocked on a **decision**, not data | Layer 4 line already resolvable; promoting the staging clip into `§SEV-COMPUTE` is a legal call |
| B-11 | `CT` alineaciones | ⛔ Blocked on the same decision | Same Layer 4 `A_RETRANQUEO` line |
| B-12 | Stale user-facing coverage copy | ✅ **CLOSED** | — |

**Highest-leverage remaining: B-1.** It is the only item that unblocks *three* zones at once
(B-6 `CJ`, B-7 `A`, B-8 `IC` are all "needs `h`"), it is the missing half of the HEIGHT axis for the
five zones that already compute (`AD`/`UA`/`SA` cite a ceiling and publish no real height), and —
unlike every other blocker — it needs no solver and no engineering: it needs one documented fact,
and route (c) above (sample N parcels against the plan sheets already held in
`corpus/Plano_De_Urbanizacion_Pormenorizada/`) can establish it as a **measurement** rather than an
opinion.
