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

## 3 — SMALLEST NEXT STEP

**Wire `resolveValenciaZoning` (CLOSURE-REGISTER #4).** Point-intersect `MapServer/231` through a
same-origin proxy, mirroring `resolveMurciaZoning`; return `califi` / `tipoca` / `origen`. Every
input is already proven live and keyless, all three attributes sit on **one row** (no second spatial
join — architecturally better than Madrid), and the parcel already arrives from the national
Catastro path. It cannot make a published number wrong, because there are none.

⇒ **~36 % of the buildable city upgrades from *"PRYZM does not cover this"* to *"the law delegates
this to instrument `PE2020`"*, and the other ~64 % gains its zone name.** That is what takes València
from *terminal-but-weak* to *terminal-and-cited*.

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
- `__tests__/valenciaRouting.test.ts` — 51 tests.
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
