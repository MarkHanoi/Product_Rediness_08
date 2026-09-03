# LANE FR-PRESCRIPTIONS — France GPU prescription → drawn-envelope consumer

**Date:** 2026-09-03 · **Status:** SHIPPED (no commit — working tree) · **Gate:** never-overstate RC=0 before AND after.

## What shipped

France's Géoportail de l'urbanisme (GPU) PUBLISHES the geometric consequence of planning rules
nationally, keyless (`data.geopf.fr/wfs`, quantified live 2026-09-02, envelope-geometry-census):
**69,739** drawn setback lines (`typepsc=15`) + **5,291** plan-masse sectors (`typepsc=14`) +
**61,176** height-limit polygons (`typepsc=39/02`). This lane CONSUMES that drawn geometry into a
**partial drawn-envelope contribution set** feeding the EXISTING engine's `explicit-area` / height
path (STR-EUROPEAN-ENVELOPE-SOURCES §9 P1 authoritative-geometry tier — "USE IT, never re-derive").
It upgrades the FR no-extraction refusal (`frNoExtraction.ts`) to a PARTIAL DRAWN ENVELOPE wherever
GPU geometry exists; the A.5 degradation ladder names the gap otherwise. **No new engine** — the
plan-masse polygon feeds `solveExplicitArea` (the exact clip `computeBuildableEnvelope` calls), the
same primitive Madrid NZ-1 / DK byggefelt already use.

### Files

- **`packages/site-parcel-data/src/countryAdapters/fr/frPrescriptionGeometry.ts`** (NEW, pure) — the consumer.
- **`packages/site-parcel-data/src/countryAdapters/fr/index.ts`** — appended one export block (end of file, least-conflict).
- **`packages/site-parcel-data/__tests__/frPrescriptionGeometry.test.ts`** (NEW) — 11 tests, real recorded geometry.
- **`packages/site-parcel-data/__tests__/fixtures/fr-prescriptions/recorded-census-2026-09-02.json`** (NEW) — byte-exact census features.
- **`tools/ga-gate/check-envelope-never-overstates.ts`** — added arm **§FR-PLAN-MASSE-LIVE (2g)** + its imports.
- **`tools/ga-gate/corpus/never-overstate/fr-plan-masse-17453.json`** (NEW) — recorded fixture with teeth.

### The three contributions (each carries F1–F8 provenance)

1. **`typepsc=14` plan-masse → F-A drawn footprint** (`FrDrawnFootprintContribution`). The drawn
   polygon parts (WGS84, multi-part + holes preserved); the parcel ∩ footprint clip is the ENGINE's
   job. **Filter by code AND verify by libelle/txt** — a code-14 upload-noise feature ("Voies
   classée bruyante type I", measured in the census) is DECLINED and its receipt recorded
   (`declinedPlanMasseNoise`), never drawn.
2. **`typepsc=15` marge de recul → drawn setback** (`FrDrawnSetbackContribution`). The drawn line/zone
   the façade must be set back TO, cited by `libelle` + `idurba`. Offsetting the frontage to the line
   is a downstream step — the constraint is carried, never fabricated into a footprint here.
3. **`typepsc=39/02` height polygon → cited height cap** (`FrDrawnHeightCap`). The number + top point
   are parsed from the libelle; `stypepsc=02` + a `HAUTEUR` libelle exclude noise (the `39/00` "Cone
   de protection visuelle" is rejected). **ADR-0377:** the label names the number and the TOP point
   ("au faîtage" = ridge) but NOT the ground DATUM plane (règlement text), so `heightDatum` is
   `{ kind:'unknown' }` and `appliesAsBindingCap:false` — a representable, cited study upper bound,
   **never multiplied into a volume on an unresolved plane** (the E8 DE «72,2 m über NHN» class).

### A.5 degradation ladder (STR-ENVELOPE-SUFFICIENCY-LEGENDS §A.5)

The (P=footprint, V=height) fill selects the row label, verbatim: footprint-only → *"Footprint
derived; vertical extent unresolved"*; height-only → *"Vertical limit derived; footprint
unresolved"*; both → the full drawn envelope; neither → *"No drawn envelope geometry … règlement-text
path governs"*. A partial envelope with a named gap is a saleable product; a blank page is not.

## The drawn-contribution transcript (a REAL parcel, verbatim)

Point `45.88216414, -0.91497868` (inside the recorded 17453 plan-masse), consumed through the real
fetch seam (`frPrescriptionGeoFeaturesAtPoint`, recorded body — never the network) →
`buildFrDrawnEnvelopeContribution` → `solveExplicitArea`:

```
[never-overstate] §FR-PLAN-MASSE-LIVE: recorded 17453_PLU_20190411 — clip 13771.7 m² of ring
27699.8 m², height 9 m au faitage datum=unknown binds=false (cited, never applied),
claimed volume 0 m³ required.
```

- **Footprint** — `SECTEUR DE PLAN MASSE 1`, `idurba 17453_PLU_20190411`, document
  `17453_reglement_20190411.pdf` page **96**, `valid_from 2018-08-30` (datvalid, validityBasis
  `legal`). Clipped to a biting parcel: **13,771.7 m²** of the **27,699.8 m²** published ring — the
  clip BIT, never exceeded the published footprint.
- **Height cap** — `"HAUTEUR DES CONSTRUCTIONS LIMITEE A 9 METRES AU FAITAGE"` → `maxHeight_m 9`,
  `measuredTo 'faitage'`, `heightDatum {kind:'unknown'}`, `appliesAsBindingCap false`,
  `idurba 02157_PLU_20201208`. Cited, never applied as a cap (ADR-0377).
- **Setback** (separate real parcel, commune 01034) — 2 `MultiLineString` marges de recul,
  `"Marge de recul imposée au constructions"`, `idurba 01034_PLU_20171128`, `valid_from 2017-11-28`.

## Proofs

- **Unit suite:** `frPrescriptionGeometry.test.ts` — **11/11 pass** (plan-masse pick + noise decline +
  F1–F8; setback lines cited; height 9 m au faîtage datum-unknown non-binding; 39/00 cone rejected;
  `parseFrHeightLibelle` metres/decimal/top-point/absent; A.5 degradation labels incl. no-geometry;
  determinism byte-identical; **feeds the REAL `solveExplicitArea` — the footprint clips to the parcel**).
- **never-overstate gate RC=0 BEFORE:** baseline `[never-overstate] OK: 0 overstatement(s) across 190
  zone-solve(s)`. **AND AFTER (arm added):** `191 zone-solve(s) … OK: 0 overstatement(s) …
  + §FR-PLAN-MASSE-LIVE` — **RC=0** (captured at the moment my arm landed; the gate held green with
  the FR arm present and no other lane interfering).
- **Falsification (the arm has teeth):** in a SCRATCH copy of the gate fixture, the consumed height
  libelle was shrunk `9 METRES → 6 METRES` (published bound still 9). Gate → **RC=1**, finding:
  `[height] fr-gpu-plan-masse/live-route … consumed height 6 m ≠ the published libelle 9 m — a
  transcription defect`. Restored byte-identical (sha256 `eeaaba64…92c91f` before = after). Gate
  back to **RC=0**.
- The arm carries three built-in CHECKER TEETH (exit 2 if blind): a footprint drawn past the ring; a
  datum-unresolved height applied as a cap; a shrunk/inflated consumed cap. All fire.
- **tsc:** `packages/site-parcel-data` (module + test, its own tsconfig) — **0 errors** in the lane's
  files. The gate file typechecks clean.
- **Purity / determinism / L-12874:** the consumer is L2-pure (no I/O, no clock — `fetchedAtIso` is an
  input); the ONE impure seam REUSES `frGpuClient.frGpuGetJson` (no duplicated fetch); no new
  refusal-token spelling minted (reuses `no-feature:` / `upstream-failed:` / `endpoint-unreachable:`).

## Notes / honesty

- **Schemas frozen** — respected. The output types are plain TS in the adapter; the engine seat reuses
  `ExplicitAreaRule` / `HeightDatum` (`UNKNOWN_HEIGHT_DATUM`) / `RuleSourceRef`; no schema edited.
- **Live sibling wave** — consumed `frGpuClient` exports; did not duplicate the fetch; touched only a
  NEW file + an appended barrel block.
- **Concurrent unrelated failures (NOT this lane), in a busy shared tree:**
  - The gate's CURRENT exit is **RC=1**, but the SOLE finding is `[far] pl-pog/compile / 1SZ` — the
    **§PL-POG-COMPILE (2h)** arm, added to the shared gate file by a **concurrent LANE PL-POG** wave
    (all `??`-untracked: `plPogEnvelope.ts`, `plPogEnvelope.test.ts`, `pl-pog-official-sample-1sz.json`)
    AFTER my green validation. Timeline of my own gate runs: baseline **RC=0** (no pl-pog, no FR) →
    my arm added **RC=0** (FR arm present, no pl-pog) → pl-pog arm lands → **RC=1** (pl-pog only). My
    FR arm reports **0 findings** throughout. The pl-pog RED is theirs to fix; I did not touch it.
  - The full `site-parcel-data` suite reports 4 failing tests in `nationalJurisdictionResolver.test.ts`
    (`SVN: expected 0 to be greater than 0`) driven by a concurrent wave's edits to
    `jurisdiction/data/nationalBoundaries.json` + `nationalJurisdictionResolver.ts` (`M` in git
    status), and tsc noise in `countryAdapters/ro/index.ts` (Romania WIP) + `siParcelAdapter.test.ts` /
    `usParcelProviders.test.ts` (untracked US/SI parcel WIP). None are this lane. **This lane's files
    are tsc-clean and its tests pass 11/11.**
- **Engine routing detail:** `computeBuildableEnvelope` gates on `anyResolved` (Madrid passes by
  declaring a `permittedUse`); a pure-geometry FR pack has no scalar and no honest use to declare, so
  the arm drives `solveExplicitArea` directly — the exact explicit-area clip the engine calls, no
  fabricated field. `FR_PLAN_MASSE_EXPLICIT_AREA_PACK` still ships as the parse-validated explicit-area
  DECLARATION (the seat the footprint feeds), asserted live in the arm.
