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

## 2 — BLOCKERS (severity-ordered; full rows in `CLOSURE-REGISTER.md`)

- 🔴 **#1 Plano C is not published as data** — the only blocker that can move the ENVELOPE ceiling off
  0 %. ⚠ **The automated route is a MEASURED negative:** a field-level sweep of all 70 layers of the
  authoritative planning service finds no `profundidad` / `edificabilidad` / `ocupación` /
  `retranqueo` field anywhere. **Needs a human and an institution.**
- 🔴 **#4 the live `origen` read is not wired** — 36,40 % of buildable land is entitled to a cited
  legal delegation and currently gets the weaker coverage refusal. **Pure engineering, ~1 day, no new
  evidence needed.**
- 🟡 **#2 layer 212 `altura`** — measured, and 2,4× smaller than reported: **27,13 % of layer area**,
  not 65,5 %, with a **`0` sentinel on 34,13 %**. A lead, and a dangerous one.
- 🟡 **#5/#6** — the text is a *(Transcripción)*; the modification census is not done.
- 🔴 **#9 C63 tier vocabulary does not exist in code** — platform-wide; it is why RATE is
  `not-assessed` rather than a number.

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

*See also: [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md) · `RATE.md` · `LEGISLATION-RATE.md` ·
`ENVELOPE.md` · `HEIGHT.md` · `RISK-REGISTER.md` ·
`findings/VALENCIA-LAND-SHARE-MEASUREMENT-2026-08-01.md` ·
`sources/PRIMARY-SOURCE-VERIFICATION-2026-08-01.md`.*
