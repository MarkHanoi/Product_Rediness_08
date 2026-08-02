# NEXT — València (INE 46250, Comunitat Valenciana)

> Where PRYZM stopped, why, the smallest next step. **Last updated:** 2026-08-01. **Maintainer:** UNASSIGNED.
> **Status:** WIRED AND REFUSING — every València parcel now reaches a terminal, cited state.
> Full blocker list: [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md).

## 1 — WHERE WE STOPPED

⚠ **The 2026-07-30 entry that stood here — *"No rule pack → no envelope"* — is superseded.** There
IS a pack. It publishes nothing, and that is the RESULT.

The PGOU *Normas Urbanísticas* (Documento Definitivo, mayo 1991) were sourced from the municipality's
own domain, read and transcribed article by article. The transcription is good. It still yields no
envelope, because **Arts. 6.18.2 / 6.19.1 / 6.25.1 / 6.30.1 define the buildable depth and the cornice
height as functions of a value graphed on the Plano C sheets**, which the city does not publish as
data. So `ES_VALENCIA_PGOU_PACK.zones` is `[]` **by construction**, and every València parcel receives
an explicit, land-identifying refusal that names Plano C and the articles.

**Under the ratified definition of CLOSED, València is at 0 % computed and 100 % terminal.**

⭐ **2026-08-01 — the RATE is no longer `not-assessed`.**
`tools/city-completion/measurements/valencia.measurements.json` was written, and València is the
**first city in the repo with all SEVEN C63 axes assessed (100 % of the ratified weight)**:
**PARCEL 99 % · LEGISLATION 50 % · DATA-SOURCES 90 % · ENVELOPE 0 % · TERRAIN 50 % · HEIGHTS 0,16 % ·
CONTEXT 89 % → overall 50,3 %** (was 46,7 % over only **30 %** of the weight).

⚠ **Writing an honest record LOWERED the headline, and that is the record working.** The ENVELOPE 0 %
now enters at weight 0,20 instead of being renormalised away. C63 §1.5 / L-656: a cited refusal is a
correct answer, and a correct answer is not an envelope.

⚠ **Two of the old axis numbers were FABRICATED ABSENCES in the shared tool, not facts about
València.** `computeScorecard.mjs` read `bake.mjs`'s regions by the marker `const REGIONS = [`;
§BAKE-BY-REGION had renamed that array to `ALL_REGIONS`, so the reader returned an **empty set
silently** and the tool printed *"not a baked context region → 0 layers present (measured)"* for
**every city on the board** — while València's shipped R2 tiles served 5 466 building footprints to a
height probe the same day. And València was **absent from `ZONE_GIS_SOURCES`**, which scores the slot
`none` ("no source exists") for a city whose zoning service is live and keyless; the correct value is
`documented`. Both fixed and now **fail loud** (§EMPTY-PARSE-IS-NOT-AN-ABSENCE, L-676).

## 2 — BLOCKERS (severity-ordered; full rows in `CLOSURE-REGISTER.md`)

- 🔴 **#1 Plano C is not published as data** — the only blocker that can move the ENVELOPE ceiling off
  0 %. ⚠ **The automated route is a MEASURED negative:** a field-level sweep of all 70 layers of the
  authoritative planning service finds no `profundidad` / `edificabilidad` / `ocupación` /
  `retranqueo` field anywhere. **Needs a human and an institution.**
- 🔴 **#4 the live `origen` read is not wired** — 36,40 % of buildable land is entitled to a cited
  legal delegation and currently gets the weaker coverage refusal. **Pure engineering, ~1 day, no new
  evidence needed.**
- 🟡 **#2 layer 212 `altura` — ⚠ RE-MEASURED 2026-08-01 ON THE RIGHT DENOMINATOR, AND IT IS ~2×
  BIGGER, NOT SMALLER.** The spatial join this row named as its unmet condition has been run:
  **52,6 % of PRIVATE BUILDABLE LAND** [95 % CI 44,8–60,2] carries a bare storey count — versus the
  **27,13 % of *layer area*** that stood here and was quoted as *"the honest size of the lead"*.
  ⚠ The `0` scare shrinks with it, from 34,13 % of layer area to **10,3 % of buildable land**, because
  most `altura='0'` features are the *street complement* (one probed feature is a 29,4 ha polygon with
  **98 interior holes**) and *designated open space*. **Both old figures were wrong the same way — a
  ratio quoted without its denominator.** ⛔ Still **NOT an unlock**: the field's semantics are
  undocumented across 696 swept layers, the `−1` convention is unestablished *for the field*, and
  **`profundidad edificable` is published nowhere**. ⇒ The row is now pure evidence-work: **one
  municipal answer (R5)**.
- 🟡 **#5/#6** — the text is a *(Transcripción)*; ⭐ the modification census is now **SCOPED**:
  **169** distinct `MP` instruments exist (not ~140), but only **106** touch buildable land, they
  total **6,19 %** of it, and **26 of them carry 80 %** — so R3 is ~1 day, not 3–5.
- ✅ **#9 C63 tier vocabulary — CLOSED 2026-08-01, the row was STALE.** The ruler EXISTS
  (`packages/schemas/src/site/completion/EnvelopeAxisWeight.ts` + the tested `computeScorecard.mjs`
  mirror), and Murcia's ENVELOPE axis has already been computed at 9.4 % through it. ⚠ This row was
  inherited from Barcelona register #14 and never re-checked. RATE is `not-assessed` for a
  **mechanical** reason — no `measurements/valencia.measurements.json` record has been written yet —
  **not** because the framework is missing.

## 2b — ⭐⭐ 2026-08-02: THE ENVELOPE ROUTE WAS ATTACKED, AND VALÈNCIA IS **ONE PHONE CALL AWAY**

Founder directive: *"get the ENVELOPE number as high as it will honestly go."* **It goes to 0 %** —
and that answer is now worth something, because **three of the four blockers were REFUTED, not
repeated.** Evidence:
[`sources/R5-ALTURA-SEMANTICS-ATTEMPT-2026-08-02.md`](./sources/R5-ALTURA-SEMANTICS-ATTEMPT-2026-08-02.md).

| blocker | status | what settled it |
|---|---|---|
| field might be **metres** | ✅ **RETIRED** | `altura`/OSM `building:levels` median **0,78** (n=105, 0 failures); metres predicts ≈3,0 — **refuted 4×** |
| **`profundidad` published nowhere** | ✅ **RETIRED** | It is **DRAWN, not tabulated**: the alineación polygon is a **15,6 m median band**, **never larger than its zone polygon (0/54)**, with patio holes |
| Art. 6.19.3 (Hc not a ceiling) | 🟢 **MITIGATED** | Its exceptions push upward ⇒ omitting them UNDER-states (safe, C58 §1.14.4) |
| ⛔ **Np or graphed count?** | ⛔ **BLOCKING** | `altura` is BELOW the built storey count on **81 %** of buildings, **modally by two**; 33 % within ±1; spread −13…+7 |

⚠⚠ **Why we did not ship the "conservative" reading.** On a typical Ensanche block (`altura` 5,
built 7 storeys) it yields `Hc = 16,4 m` for a building already standing at ~21 m — **an envelope
lower than the building on the plot**. And on the ~10 % where `altura` exceeds the built count it
**over-states**. Wrong in both directions ⇒ no safe branch (C58 §1.4 / §1.14.4).

⭐ **WHAT CHANGED IS THE ASK.** It is no longer *"obtain Plano C"* — a 1991 drawing set, an
institution, a fee, unknown timeline. **It is ONE WRITTEN ANSWER about a field the city already
publishes** (`VALENCIA_R5_ASK` → `datosabiertos@valencia.es`, the contact in layer 212's own ISO
metadata). ⚠ The answer must also reconcile the −2 gap; without that it is necessary, not sufficient.
Prize if clean: **≤ 52,6 %** of private buildable land, ENS alone 77,0 %.

⚠ Before any of it ships, **#8 becomes blocking** — `Patrimonio_Historico` is token-gated and heritage
constrains envelopes DOWNWARD (L-616: a SOLID must intersect ALL derived constraints).

⚠ Two portal findings worth carrying: the open-data portal named in the city's OWN metadata
(`valencia.opendatasoft.com`) is **dead and parked — 404 behind a 188 KB HTML page**, and the
`PGOU_AL.dwg` / `.gml` / `.shz` distributions the national catalogue advertises are **all 404**.
The live documentation route is `datos.gob.es` publisher `L01462508`.

## 2d — ⭐⭐ THE INPUT MATRIX: `altura` is NOT a catch-all, and we were over-simplifying

Full evidence:
[`findings/VALENCIA-INPUT-STATUS-MATRIX-2026-08-02.md`](./findings/VALENCIA-INPUT-STATUS-MATRIX-2026-08-02.md).
Pinned as `VALENCIA_ENVELOPE_INPUT_STATUS` / `VALENCIA_COVERAGE_LOSS`.

⭐ **If `altura` were answered tomorrow, an ENS/EDA envelope WOULD emit.** Nothing else is waited on
for those zones — **54,37 pp of buildable land, 85,5 % of everything reachable.** One email really is
the whole gate for that share.

⭐ **And the engine already has València's rule kind.** `explicit-area` (ADR-0270) clips a parcel to a
**published buildable footprint**, supports *patio de manzana* holes and multi-part footprints, and
hard-fails rather than falling through to a whole-parcel inset. **No new solver is needed.**

⚠ **But 9,22 pp would NOT emit, and that blocker is OURS, not the founder's** — it was invisible while
`altura` carried the whole explanation:

| bucket | share | owner |
|---|---:|---|
| **Legally impossible** — delegated; terminal, cited, **correct** | **36,40 %** | nobody — it is the right answer |
| **Awaiting authoritative interpretation** — ENS + EDA, `altura` alone | **54,37 %** | the founder (R5) |
| **Awaiting interpretation AND our reading** — UFA: `altura` **+** Arts. 6.36/6.37/6.39/6.40 unread | **5,87 %** | founder **+** us |
| **Awaiting our reading alone** — CHP + TER + IND chapters; **`altura` is irrelevant** | **3,35 %** | us |
| **Data unavailable** | **0,00 %** | — |

⭐ **`Data unavailable` is EMPTY.** Before D-005 the whole 63,60 % sat there (*"Plano C is unpublished:
an institution, a fee, an unknown timeline"*). **No València land is blocked by missing data at all**
— the largest change of the last two days, and invisible in the still-0 % ENVELOPE score.

⚠ **Settled by article, NOT manufactured as blockers:** ENS setbacks — Art. 6.18.2 «La edificación no
podrá retranquearse de la alineación exterior» (retranqueos *forbidden*); FAR — no edificabilidad
figure exists in the chapter; ocupación — Art. 6.18.1 sets it **by the alignments**, i.e. the same
polygon. And **"storeys vs metres" is not a second blocker**: metres is refuted 4× (median ratio 0,78
vs ≈3,0 predicted). Only the **offset** is open.

⇒ **NEW WORK ITEM, ours, ~2 days, parallel to the wait:** read UFA Arts. 6.36/6.37/6.39/6.40 and the
CHP/TER/IND chapters. It needs no external answer and it is the only way those 9,22 pp ever emit.

## 2c — ⭐⭐ THE REVISED ROADMAP (founder, 2026-08-02) — recorded verbatim

- ✅ **Buildable depth: resolved through published geometry**
- ⛔ **`altura` semantics: single remaining technical/legal blocker**
- ⛔ **Heritage overlays: deployment blocker, not an envelope-model blocker**

**Engineering status: `essentially_complete`.**
`continue_now: [parser, testing, refusal logic, geometry validation, heritage integration hooks]` —
**all five shipped 2026-08-02.** `wait_only_for: [authoritative definition of altura, heritage
access]`.

⚠ **The distinction the whole position turns on:** engineering *around* a missing authority is
forbidden; engineering *ahead of* it is expected. So València is **not frozen** — it is **waiting**,
with everything downstream of the answer already built and tested.

| shipped this pass | what it does | why it needed no answer |
|---|---|---|
| `parseValenciaAltura()` | 12 typed value kinds from the live field | ⭐ **there is deliberately NO `storeys` kind** — it parses, it does not interpret |
| `validateValenciaMovementPolygon()` | containment · holes · degenerate rings · CRS | turns the n=54 finding into a **standing invariant** |
| `valenciaHeritageDisposition()` / `Refusal()` | refuse-where-heritage-may-apply | ⚠ **no `absent` member** — a gated source is never a clearance |
| `applyValenciaHeritageConstraint()` | the downward-only overlay seam | makes "heritage access" a **data** change, not a project |
| `valenciaNoRulePackRefusal()` | the card every parcel gets **today** | the shipping feature, not a placeholder |

⛔ **THE LINE.** No heuristic for `altura`, no inferred semantics, no calibration model, no
"conservative" branch — the error is **two-sided**, and
[ADR-0287](../../../../../02-decisions/adrs/ADR-0287-resolvers-refuse-when-uncertainty-changes-the-legal-outcome.md)
(**València is its worked example**) removes that escape explicitly, resting on
[ADR-0283](../../../../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md).
*"Do not substitute engineering for legal interpretation."*

**Release order: Murcia → Madrid RC-1 → Córdoba → Madrid NZ3 → València.** Last — a scheduling fact,
not a judgement. **Definition of done: official `altura` interpretation · heritage decision ·
release.**

⭐ **HOW TO SEND THE ASK — three routes, each verified HTTP 200 on 2026-08-02** (`VALENCIA_R5_ROUTES`):

1. **`datosabiertos@valencia.es`** — the contact in layer 212's own ISO metadata. First ask.
2. **`https://www.valencia.es/cas/urbanismo/inicio`** — Urbanismo, publishing a *Planeamiento → PGOU*
   section. The technical office that authors the graphics.
3. ⭐ **`https://www.valencia.es/cas/transparencia/solicitud-de-acceso-a-la-informacion`** — a **live
   submit form**, the statutory *solicitud de acceso a la información* under **Ley 19/2013**, which
   obliges an answer within **one month**. **One action, with a legal clock on it.**

⚠ **Measured dead, listed so nobody re-finds them:** `valencia.opendatasoft.com` (the portal named in
the city's OWN metadata) → **404** behind a parked-domain page; `PGOU_AL.dwg`/`.gml`/`.shz` → **404**;
`valencia.es/portal-transparencia` → **404** (the working path is `/cas/transparencia`).

## 3 — SMALLEST NEXT STEP

**Wire `resolveValenciaZoning` (CLOSURE-REGISTER #4).** Point-intersect `MapServer/231` through a
same-origin proxy, mirroring `resolveMurciaZoning`; return `califi` / `tipoca` / `origen`. Every
input is already proven live and keyless, all three attributes sit on **one row** (no second spatial
join — architecturally better than Madrid), and the parcel already arrives from the national
Catastro path. It cannot make a published number wrong, because there are none.

⇒ **~36 % of the buildable city upgrades from *"PRYZM does not cover this"* to *"the law delegates
this to instrument `PE2020`"*, and the other ~64 % gains its zone name.** That is what takes València
from *terminal-but-weak* to *terminal-and-cited*.

⭐ **It is now the ONLY `Engineering` item left on València's board** (category **Engineering**, owner
the València agent). It needs no external answer, it cannot make a published number wrong — there are
none — and it moves the REFUSAL from a coverage excuse to a cited legal delegation. ⚠ It raises the
ENVELOPE axis by **0 pp**: a `derived-plan` refusal and a `no-rule-pack` refusal both weigh 0.0
(C63 §3.2). It buys correctness, not coverage.

## 4 — ALREADY BUILT (do not redo)

- `providers/valenciaBbox.ts` — `isInValencia`, `VALENCIA_BBOX`, `VALENCIA_INE_CODE`.
  ⚠ INE composition reuses the **existing national** `composeIneCode()` in `murciaBbox.ts`; do not
  write a second one.
- `rulepacks/esValenciaPgou.ts` — the transcription: 11-row calificación classification, both cornice
  formulas (⚠ ENS 4,80 vs EDA 5,30), the ordinance's own 8-row height table, three stated bounds, and
  the measured land shares.
- `rulepacks/esValenciaEnvelope.ts` — `VALENCIA_ENVELOPE_VERIFIED` (false, unliftable),
  `valenciaNoRulePackRefusal`, `VALENCIA_ALTURA_FIELD_MEASURE`.
- `rulepacks/registry.ts` — the delimited València block; `envelopeAuthorisation.ts` gate row
  (it was **failing open** before this pass).
- ⭐ `rulepacks/esValenciaAlineaciones.ts` — **NEW 2026-08-02, the layer-212 read path.**
  `parseValenciaAltura` (12 kinds, **no `storeys` kind**), `valenciaAlturaIsCandidateInput`,
  `validateValenciaMovementPolygon` (containment · holes · degenerate rings · **CRS-in-degrees**),
  `applyValenciaHeritageConstraint` (downward-only overlay seam).
- ⭐ `esValenciaEnvelope.ts` additions — `VALENCIA_MOVEMENT_GEOMETRY_DECISION` (founder R1),
  `valenciaAlturaRouteBlockers` / `…IsPublishable` (derived, never hand-set),
  `valenciaHeritageDisposition` / `valenciaHeritageRefusal`, `VALENCIA_R5_ASK`, `VALENCIA_R5_ROUTES`.
- `__tests__/valenciaRouting.test.ts` + `__tests__/valenciaAlineaciones.test.ts` — **96 tests.**
- Terrain bake row `terrain.mjs` TERRAIN_CITY `valencia` (PNOA MDT); national parcel routing
  (`isInSpain`→Catastro); baked OSM context via `bake.mjs` REGIONS `spain`.

## 5 — HEIGHTS: the measured baseline (pre-bake)

Probed 2026-08-01 with `tools/context-height-probe/probe.mjs --at 39.4699,-0.3763` against the
**SHIPPED R2 tiles** (the same bytes the browser reads): **5 466 footprints · 0 measured-lidar ·
9 tagged · 2 002 derived-levels · 3 455 assumed.** Verdict `unmeasured`; 63,2 % render the fabricated
9 m default and `solidRenderFraction` is **0,002** — 99,8 % of the skyline a user sees is a ghost
massing. ⚠ **Pre-bake baseline, deliberately** (a national re-bake is in flight); re-probe after it
publishes and do not edit the counts to predict it (§SIZE-IS-NOT-PROVENANCE).

⚠ **This is NOT Murcia's root cause.** València IS declared in `heightSources.mjs` (`REGION_SOURCE
valencia = 'mds_edificacion'`) **and** present in `MDS_CITY_BBOXES`, so it is inside the join's
retain set and CAN be stamped. ⚠ **One measured discrepancy, reported and NOT fixed here:**
`MDS_CITY_BBOXES` gives valencia `[-0.42, 39.42, -0.30, 39.52]` while the canonical `terrain.mjs`
REGIONS row is `[-0.43, 39.40, -0.30, 39.52]` — the MDS bbox is the smaller, so a western and a
southern strip of the baked region can never receive a measured height. Every other Spanish city in
that list uses its `terrain.mjs` row verbatim. **Nothing under `tools/context-bake/` was edited: a
national bake is in flight on this SHA.**

*See also: [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md) · `RATE.md` · `LEGISLATION-RATE.md` ·
`ENVELOPE.md` · `HEIGHT.md` · `RISK-REGISTER.md` ·
[`findings/VALENCIA-ALTURA-BUILDABLE-JOIN-2026-08-01.md`](./findings/VALENCIA-ALTURA-BUILDABLE-JOIN-2026-08-01.md) ·
`findings/VALENCIA-LAND-SHARE-MEASUREMENT-2026-08-01.md` ·
`sources/PRIMARY-SOURCE-VERIFICATION-2026-08-01.md` ·
`tools/city-completion/measurements/valencia.measurements.json`.*
