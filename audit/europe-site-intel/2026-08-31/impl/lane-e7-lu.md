# LANE E7-LU — LUXEMBOURG, THE NEAR-FREE COUNTRY

**Executed 2026-09-01.** Deliverable: `packages/site-parcel-data/src/countryAdapters/lu/`
(6 files, 1,763 lines) + `packages/site-parcel-data/__tests__/luAdapter.test.ts` (936 lines,
45 tests) + `impl/barrel-additions-lu.txt` + eight verbatim transcripts in
`impl/lane-e7-lu-transcripts/`. **Nothing committed. No shared file edited. No schema touched.**

---

## §0 — THE HEADLINE

Luxembourg's four typed coefficients are now on the frozen canonical `SiteIntelRule`, and the
lane's central risk — *"getting them interchangeable would be the Aarhus trap in a new accent"* —
is closed by **statutory text, quoted verbatim, carried in R2 `valueBasis` per rule, and asserted
by a named test that fails when the leg is severed.**

The measured answer to the brief's framing is sharper than "four coefficients":

> **FOUR quantities. THREE denominators. ONE of them non-linear. And all four are legally
> ZONE AVERAGES that individual lots may lawfully EXCEED.**

| | statutory term (verbatim) | numerator | **DENOMINATOR** | dimension |
|---|---|---|---|---|
| **COS** | *coefficient d'occupation du sol* | emprise au sol des constructions | **terrain à bâtir NET** | ratio |
| **CUS** | *coefficient d'utilisation du sol* | Σ surfaces construites brutes, **×2 for 5–10 m storeys, ×3 above 10 m** | **terrain à bâtir BRUT** | ratio |
| **CSS** | *coefficient de scellement du sol* | surface de sol scellée | **terrain à bâtir NET** | ratio |
| **DL** | *densité de logement* | nombre d'unités de logement | **terrain à bâtir BRUT, en HECTARES** | dwellings/ha |

`terrain à bâtir net` is `brut` *« déduction faite de toutes les surfaces privées et publiques
nécessaires à sa viabilisation »* — a strict subset. So **COS × A and CUS × A are computed
against different A**, and **neither A is a cadastral parcel, nor is either served as a number
anywhere in the artefact.** Every rule this adapter emits says so in-band. There is no conversion
function between the four in the codebase and none may be added: the conversions do not exist.

---

## §1 — WHAT WAS EXECUTED, AND WHAT WAS ONLY READ

**EXECUTED (this lane's own measurements, not E5's, re-run against the artefact):**

* Live probe of `data.public.lu` — dataset record, licence list, HTML dataset page.
* Live probe of the CC0 deed at creativecommons.org.
* Live probes proving **no PAG query service exists**: `wfs.geoportail.lu` (000/0 bytes),
  the opendata WMS GetCapabilities (200, 49,503 B, **58 layers read in full — no PAG layer**),
  and the geoportail theme API (`"wfsSupport": false` on every `ogcServers` entry).
* **The 259,912,001-byte artefact downloaded in full**, sha256
  `6d53fda3ce17be37344c23c93fa1d51a7855bf0e05e9f0d275d1ee990c9c15f1`, unzipped to a
  617,377,792-byte GeoPackage, opened with `sqlite3` and censused.
* The statutory text fetched: the official **consolidated** loi ACDU + RGD PDF from
  gouvernement.lu (200, 1,086,381 B) → `pdftotext` → **Annexe II** and **Art. 26** read verbatim.
  *(Legilux's own ELI endpoints for this RGD returned 403/404 and the site is a JS shell; the
  ministry's consolidated PDF is the artefact actually read. Recorded, not glossed.)*
* The falsification: provenance leg severed twice, named tests observed RED, byte-identical
  restore verified by sha256.

**READ, NOT RE-EXECUTED:** the four sibling adapters (`ee`/`dk`/`lt`/`pl`), the E7-FAMILY
conventions (§6), E4-EXECUTION-CONTROL, and the frozen `packages/schemas/src/siteintel/**`.

**MTIME CHECK on everything inherited** (the brief's instruction): `e7-family-extraction-verdict.md`
is stamped 18:34, before this lane started at ~18:36 — its §6 conventions are current.
⚠ **But `countryAdapters/` is a live worksite:** `fi/`, `no/` and `se/` were all being written
*during* this lane (mtimes 19:01–19:05). The baseline was therefore **re-executed** rather than
inherited, and the after-readings below carry their timestamps.

---

## §2 — THE ACCEPTANCE, LINE BY LINE

### 2.1 · "At least one REAL parcel or zone resolved end-to-end"

✅ **A real zone, at the CHAIN layer** (*committed ≠ reachable* — the assertion is on
`resolveLuZoneChain`, not on a pure mapper return):

```
resolveLuZoneChain('bb78fe47-e2f2-4a53-9696-73337ef387ba')
  → manifest  : cc-zero · last_update 2026-08-31T02:35:29+00:00 · 259,912,001 bytes
  → zone      : PAG_PAG_NQ_PAP id 2 · C116 · "Ell - Um Bierg" · EPSG:2169 · 29-vertex polygon
  → rules     : 7 emitted
        maxCoverageRatio     0.5   tier 1  basis terrain-a-batir-net
        maxFloorAreaRatio    0.7   tier 1  basis terrain-a-batir-brut
        maxSoilSealingRatio  0.75  tier 1  basis terrain-a-batir-net
        maxDwellingDensity  30     tier 1  basis terrain-a-batir-brut-hectares  unit dwellings/ha
        minCoverageRatio    null   tier 6  (served NULL)
        minFloorAreaRatio   null   tier 6  (served NULL)
        minDwellingDensity  null   tier 6  (served NULL)
```

**LIVE vs FIXTURE, with the reason (the acceptance's own wording).** The **manifest leg is a
genuinely live endpoint** and is exercised through `deps.fetchImpl` against the record the portal
actually returned. The **zone rows are FIXTURES, and they are labelled as such in the test file
header** — because *Luxembourg serves no queryable PAG service*, which this lane established by
probing three channels (above), not by a page's silence. The fixtures are **the state's own
bytes**: read out of the real 617 MB artefact, sha256-pinned, with the exact re-record SQL and
the WKB-decoding note in the header (E7-FAMILY §6 G.1).

### 2.2 · "Every rule carrying source + confidence tier"

✅ Enforced by `SiteIntelRuleSchema.parse` on every rule, plus §PROV asserting the legal address
survives: `country LU` · authority · `dataset PAG_PAG_NQ_PAP` · `plan_id C116` ·
`object_id "Ell - Um Bierg (xtf_id bb78…)"` · `document 116_PE_PAP_NQ` ·
`article "RGD 08/03/2017 (contenu du PAG), Annexe II … Art. 26"` · `derivation DIRECT` ·
`valueLocation attribute` · tier 1 or 6.

### 2.3 · "Tier-6 UNKNOWNs visible and counted against an independent census"

✅ **Seven rules are emitted for every row, always.** A null or zero coefficient becomes a
`value: null` tier-6 rule — never a dropped row (E4 control 9; the brief's explicit direction).
`countLuUnknownRules()` exists so the population is *counted*, and the census is carried as
`LU_NQ_PAP_CENSUS_2026_09_01` **data**, so a test asserts against the source's own numbers rather
than against the mapper's behaviour.

**The independent census (this lane's `sqlite3` run, n = 3,017, 94 communes):**

| field | non-null | > 0 | = 0 | range |
|---|---|---|---|---|
| `COS_MAX` | 3,010 (99.8%) | 2,998 (99.4%) | 12 | 0.0 – 1.0 |
| `CUS_MAX` | 3,010 (99.8%) | 2,998 (99.4%) | 12 | 0.0 – 10.0 |
| `CSS_MAX` | 3,010 (99.8%) | 3,000 (99.4%) | 10 | 0.0 – 1.0 |
| `DL_MAX` | 2,950 (97.8%) | 2,827 (93.7%) | 123 | 0.0 – 500.0 |
| `COS_MIN` | 1,389 (46.0%) | 44 (1.5%) | 1,345 | 0.0 – 0.55 |
| `CUS_MIN` | 1,557 (51.6%) | 48 (1.6%) | 1,509 | 0.0 – 1.25 |
| `DL_MIN` | 1,584 (52.5%) | 139 (4.6%) | 1,445 | 0.0 – 130.0 |

All four maxima non-null **2,950 = 97.8%**; all four strictly positive **2,826 = 93.7%**.
**3,017 − 2,826 = 191 rows = 6.33%** carry at least one absent-or-zero coefficient — **the
brief's 6.3%, re-derived rather than transcribed.** E5's headline numbers reproduce exactly.

### 2.4 · "Refusals carrying both numbers (C74)"

✅ Four distinct refusals, each carrying its measurement:

1. **`DL_MAX = 0`** → *"123 rows nationally, of which **111** sit beside a strictly-positive
   `COS_MAX` … both a real-zero and an unfilled-slot population exist and NOTHING SERVED
   SEPARATES THEM."*
2. **Minima null-or-zero** → *"across the 94 communes `COS_MIN` is always-null in **28**,
   always-filled in **34** and MIXED in **32**"* — the measurement proving NULL and 0 are two
   municipal encodings of one fact.
3. **Domain breach** (`COS`/`CSS` > 1, or any negative) → refused by name, *never clipped*, with
   *"ZERO rows breach either bound nationally, so a breach is a national schema change, not a
   data point."*
4. **`NUM_CADAST = 'N/A'`** → *"31,777 of 653,315 rows (4.9%) carry the literal string. UNKNOWN
   is not an id."*

And a fifth, structural: a bbox-overlap query returns
`exactIntersectionResolved: false` with *"N zone(s) have a BOUNDING BOX overlapping this
envelope; **0** of them have been tested for actual polygon intersection."*

---

## §3 — THREE CORRECTIONS TO THE INHERITED FINDINGS

These are the lane's substantive research output. Each was found by re-measuring rather than
inheriting, which is why the brief says *"confirm, do not inherit."*

### 3.1 · ⛔ E5-B §A-13: "the 12 rows with `COS_MAX=0` are all **ZAD**" — **FALSE for 9 of 12.**

Measured, all twelve rows printed in transcript 06:

| kind named in `DENOMINATION` | count |
|---|---|
| **ZAD** (`'Beyren B07 - Kallek (ZAD)'`, 2× Zittig) | **3** |
| **voirie** — road/street portions (4× Bridel *"Partie voirie"*, Stadtbredimus *"Kuurzebierg Voirie"*) | **5** |
| **(Partie SPEC)** (Mondorf-les-Bains MNQ7) | **1** |
| neither (Capellen *"Gewännchen II"*, Junglinster Ju-07b, Kockelscheuer *"Parc Luxite"*) | **3** |

The zeros remain *meaningful* — a road-portion sub-zone plausibly has zero coverage — so E5's
conclusion (*"not Slovenia-style sentinels"*) survives. **Its stated reason does not.** The
correction matters because "all ZAD" invites a rule *"if ZAD then 0 is real"*, and that rule would
mis-handle 9 of the 12. This adapter does not classify them at all: all zeros are tier-6 UNKNOWN
with both populations named.

### 3.2 · ⛔ E5-B §A-13: *"parcel → zone → numbers resolves inside one file, without a second provider"* — **overstates, twice.**

The parcel **base** ships in the file. The parcel **key** and the **spatial join** do not.

* **`NUM_CADAST` is not a key.** 653,315 rows → 31,777 carry the literal sentinel `'N/A'` (4.9%);
  621,538 carry a real value but only **602,037 distinct `(CODE_COM, NUM_CADAST)` pairs** exist —
  **15,110 duplicate groups**, and `'0'` occurs as a value (16× in commune C064 alone). The
  cadastral **section** that disambiguates a Luxembourgish parcel number **is not served by this
  layer**. `xtf_id` *is* unique (653,315/653,315), but it is a transfer id, not a national id.
* **There is no intersection primitive.** The GeoPackage's spatial index is an R-tree, i.e.
  **bbox overlap**, and bbox ⊃ polygon. The artefact declares no spatial-function extension.

So `resolveLuParcelByNumCadast` returns **every** match with an `ambiguous` flag rather than
picking one, and `resolveLuNqPapCandidatesForEnvelope` returns a type literally named
`LuNqPapBboxCandidates` whose rules are **not** emitted. This is also why the chain is keyed on
the **zone**, which is both the only unique key Luxembourg serves *and* the object the statute
says the coefficients govern.

### 3.3 · ⭐ NEW — the coefficients are **zone averages that lots may lawfully exceed**, and `COS_MIN` has no statutory footing.

Neither fact appears anywhere in E5. Both come from reading Art. 26 rather than the schema.

* **Art. 26, verbatim:** *« les coefficients précités constituent des **valeurs moyennes** qui
  sont à respecter pour l'ensemble des fonds couverts par un même degré d'utilisation du sol.
  Ces coefficients peuvent par conséquent être **dépassés** pour certains lots ou parcelles. »*
  A `maxCoverageRatio` parameter name cannot express this, so it rides **R5 `normativeForce`,
  verbatim, on every rule.** Any per-parcel envelope built from a LU coefficient without carrying
  this is asserting a per-parcel ceiling the law does not impose.
* **Art. 26 also:** *« Des valeurs minima peuvent également être définies pour le coefficient
  d'utilisation du sol et pour la densité de logement. »* — **CUS and DL only.** The schema
  reflects this for CSS (there is no `CSS_MIN` column) **but not for COS**: a `COS_MIN` column
  ships, and **44 rows nationally carry a strictly positive value in it** (max 0.55, Roeser 23 -
  Grand-Rue). Emitted as served — recording what the state serves is the mapper's whole job —
  with the anomaly named in the rule's own note. **Whether those 44 are a municipal error, a
  legacy 2011-regime value, or a reading of Art. 26 this lane has wrong is a question for a
  human.** Recorded, not resolved (E4 control 10).

---

## §4 — WHAT LUXEMBOURG DOES NOT SERVE (the honest half of "near-free")

Measured across **all 27 feature classes**:

* **No max height. No setbacks. No storey count. No building depth.** Anywhere. Those live in the
  PAP and in the DOCX *partie écrite* whose **filename** (`NOM_FICHIER_EC`) is the only thing
  served. Any LU envelope needs the extraction pipeline (tier 4 → 5).
* **No date axis on any zone layer.** `PAG_PAG_NQ_PAP` has fifteen columns and **not one is a
  date**; the entire artefact carries exactly one date column
  (`PAG_PAG_MODIFICATION_PAG.DATE_MODIF`, on **1 row**, unrelated to zones). Hence
  **`validityBasis: 'ingestion'` on every LU rule** — a point-in-time evaluator will correctly
  refuse to say these were in force on any date. Promoting the dataset's publication stamp to a
  legal validity would be a fabricated legal address.
* **The numerics cover 3,017 zones. 18,743 `PAG_PAG_ZONES_QE` existing-quarter zones carry
  none** — and that is where most buildable land in a mature country sits. Both facts are
  first-class steps in `LU_APPLICABILITY_LADDER`, not footnotes.

Luxembourg is **broad-and-shallow, confirmed**: four areal parameters at 93.7–97.8% nationally,
and nothing vertical.

---

## §5 — CONFORMANCE TO THE CONTROLS AND THE CONVENTIONS

| control / convention | how it is met |
|---|---|
| **E4-3 · schemas FROZEN** | `packages/schemas/**` untouched. **No parameter was refused for want of a seat** — `SourceProtocol` already carries `'bulk'`, `valueBasis {scheme,code}` carries all three denominators, `normativeForce` carries Art. 26 verbatim, `rank: null` carries "no per-feature ladder". Stated explicitly in `barrel-additions-lu.txt` item 4. |
| **E4-5 · semantics in the adapter** | Every Luxembourgish fact lives in `countryAdapters/lu/`. Nothing country-agnostic was changed. |
| **E4-8 · qualifiers survive** | R1 basis (minted Zone → minted Plan) · R2 valueBasis (three codes, closed set) · R3 validityBasis (`ingestion`, with the reason) · R5 normativeForce (Art. 26 verbatim). R1 `useScope` is empty **and the mapper says why**: the `CATEGORIE` use vocabulary lives on a different layer with no served join. |
| **E4-9 · UNKNOWN ≠ 0** | Every null and every zero → tier-6, `value: null`, row emitted. Each guard justified by a measurement in its own note. |
| **E4-2/10 · no scope expansion** | No SQLite dependency added (reader is an injected port). No intersection solver written. No parcel provider registered. Five discoveries recorded in `barrel-additions-lu.txt` item 5, none acted on. |
| **§6 A · file layout** | `luJurisdiction` · `luPagGpkgClient` · `luPagProvider` · `luRuleMapper` · `luSources` · `index` — the exemplar shape, with the two EE provider files merged because one artefact serves both layers (stated in the header). |
| **§6 B · never mint a rival** | `FetchOutcome`/`fetchFound`/`fetchAbsent`/`fetchTransient` from `@pryzm/schemas`. **No retry ladder minted, and the file says so and why** (`src/net/retryWhileUnreachable.ts` is the authority; the one call is a single small GET already classified `transient`). |
| **§6 C · source rows resolve** | `sourceRegistry/lu.ts` **does not exist** — LU is in `SOURCE_ABSENCE_REASONS`. The row is minted here through `defineSources` and its migration **plus the deletion of the now-false absence reason** is queued. DK's `assertEndpoint()` drift guard **copied**, as a module-load throw naming both strings. |
| **§6 D · do NOT register a parcel provider** | Not registered. The line is written out in the barrel file with a dated overlap audit: **LU ⊂ FRANCE_BBOX entirely**, overlaps GERMANY_BBOX across 5.80–6.54 E, clear of NRW and NL. L-12871 stays open; this lane declines to become the fourth documented-away overlap. |
| **§6 F · naming + `fetchedAtIso`** | `LUXEMBOURG_BBOX` · `isInLuxembourg` · `LU_NATIVE_CRS` · `LU_RULE_AUTHORITY` · `LU_APPLICABILITY_LADDER` · `luCountryAdapter`; ids minted by `luPlanEntityId`/`luZoneEntityId`/`luRuleEntityId`. Refusal prefixes are the L0 vocabulary only. **`const fetchedAtIso = (nowIso ?? new Date().toISOString()).slice(0, 10);`** — the parenthesised form, with a test proving a full ISO timestamp survives (the DK L-12873 defect, not repeated). `luCountryAdapter` **exists** (the DK L-12875 gap, not copied). |
| **§6 G · tests** | Fixtures are the state's own bytes with the re-record path in the header (G.1) · proven at the CHAIN layer (G.2) · **an unrouted reader/fetch throws BY NAME** (G.3) · falsification target named in the header and executed (G.4) · **§SCRAMBLE control present** (G.5) · every rule parsed against `SiteIntelRuleSchema` (G.6). |

---

## §6 — THE EXECUTED FALSIFICATION

Transcript: `lane-e7-lu-transcripts/02-falsification.txt`. Target named in the test-file header
before it was executed.

| cut | what was severed | result |
|---|---|---|
| **1** | `valueBasis: { scheme, code }` removed from `buildLuRule` | **RC=1 · 3 failed / 42 passed.** RED by name: *"THE ANTI-AARHUS ASSERTION: COS/CSS are over terrain à bâtir NET, CUS over BRUT, DL per HECTARE of BRUT"*, *"every emitted valueBasis code is inside the closed statutory set"*, *"a null coefficient becomes a tier-6 rule…"* |
| **2** | the statutory `article` removed from `luSourceRef` | **RC=1 · 1 failed / 44 passed.** RED by name: *"§PROV · names country, authority, dataset, the commune as plan_id, the zone as object_id and the statutory article"* |
| **restore** | `cp` from the pre-cut backup | **sha256 BEFORE == sha256 AFTER: YES.** `RC=0 · 45/45.` |

---

## §7 — VERIFICATION READINGS (each with its timestamp — `countryAdapters/` was a live worksite)

| reading | command | result |
|---|---|---|
| **baseline, 18:48** | `pnpm --filter @pryzm/site-parcel-data test` | **RC=0 · 163 files · 3,391 tests** |
| **LU suite, 19:01** | `npx vitest run luAdapter --root packages/site-parcel-data` | **RC=0 · 1 file · 45 tests** |
| **package suite, 19:02** | `pnpm --filter @pryzm/site-parcel-data test` | **RC=0 · 164 files · 3,436 tests** (+1 file, +45 tests, **zero regressions**) |
| **package tsc, 19:06** | `npx tsc -p packages/site-parcel-data/tsconfig.json --noEmit` | **RC=0** |
| **root tsc, 19:05** | `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` | **RC=0** |

All foreground, all redirected with `$?` read immediately, all transcripts verbatim in
`lane-e7-lu-transcripts/`.

⚠ **One transient, recorded because it could be mis-attributed.** A 19:00 package typecheck
reported exactly one error —
`src/countryAdapters/se/seRuleMapper.ts(108,34): Cannot find module './seSources.js'` — belonging
to the **concurrent E7-SE lane**, which created that file at 19:01, clearing it. **Zero errors
ever referenced `countryAdapters/lu/` or `luAdapter.test.ts`.** `fi/`, `no/` and `se/` were all
being written between 19:01 and 19:05; the file/test counts above will move as they land.

**No ceiling raised · no gate disabled · no `gate-debt.json` entry · no rival built · nothing
committed.**

---

## §8 — PROPOSED ISSUE-LOG ROWS (highest existing is L-12875)

**L-12876 — ⚠ OPEN (P3) · E5-B §A-13 mis-states the reason the twelve `COS_MAX=0` rows are
meaningful.** It says *"all ZAD"*; measured, 3 name ZAD, 5 name *voirie*, 1 *(Partie SPEC)*,
3 neither. The conclusion (not sentinels) survives; the reason invites a wrong classifier.
Fix in the E5 report; the adapter already refuses all zeros regardless.

**L-12877 — ⚠ OPEN (P2) · The LU cadastral key does not identify a parcel.**
`PAG_PAG_FOND_DE_PLAN.NUM_CADAST` carries the sentinel `'N/A'` on 31,777 rows (4.9%) and has
15,110 duplicate `(CODE_COM, NUM_CADAST)` groups; the disambiguating cadastral **section** is not
served. Any consumer treating it as a national id will return the wrong polygon silently.
Mitigated in-adapter (`ambiguous` flag, sentinel refused by name); **blocks parcel-provider
registration** independently of L-12871.

**L-12878 — ⓘ OPEN (P3) · `COS_MIN` has no statutory footing, and 44 rows use it.** RGD 08/03/2017
Art. 26 permits minima only for CUS and DL; the artefact nevertheless ships a `COS_MIN` column
with 44 strictly-positive values. Emitted as served, flagged in the rule note. Needs a human
reading of Art. 26 against the 2011-regime transitional provisions.

---

## §9 — HANDOFF

Luxembourg is now the cheapest *correct* country in the stack: one CC0 file, one probed source
row, four coefficients on the frozen model with three verbatim statutory denominators, and every
absence — height, setbacks, storeys, dates, the 18,743 document-bound existing-quarter zones,
the ambiguous parcel key, the bbox-not-intersection join — stated as a first-class fact instead
of papered over. **The barrel file's Item 2 is the one that matters: it closes a
`SOURCE_ABSENCE_REASONS` row that is now demonstrably false.**
