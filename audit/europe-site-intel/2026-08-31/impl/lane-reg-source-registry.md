# LANE REG — THE SOURCE REGISTRY, NOW-THIN (gate decision §F item 5 · verdict §G item 5 · supplement §7) — LANDED

Executed 2026-09-01, after the R-batch (read first per the brief:
`impl/lane-r-revision-batch.md`). Uncommitted per the lane rules. Supplement §7's scope
honoured exactly: **schema + data only — no fetching, no UI, no OME2 rows.**

## Files changed / added

- `packages/schemas/src/siteintel/entities.ts` — the FOUR nullable columns on
  `SiteIntelSourceSchema` ONLY (`theme`, `coverage`, `updateFrequency`, `adapterStatus`),
  each `z.string().min(1).nullable().default(null)`. Additive, zero migration (the
  pre-registry EE_SOURCES rows still parse — tested). Open strings, no closed enums: a
  closed vocabulary would be an invented harmonisation of per-lane wording (verdict §F
  item 9 doctrine); the known token sets (heightSources `impl`, L-449 `deferred-stub`) are
  documented at the field, never enforced. Coordinated with the R-batch freeze: this is the
  sanctioned §E LATER→NOW change-set item, nothing else in the frozen shapes moved.
- `packages/schemas/__tests__/siteintel.test.ts` — one describe, 3 arms (typed parse ·
  zero-migration nulls · empty-string adapterStatus rejected naming the field). Suite
  45→**48/48**.
- `packages/site-parcel-data/src/sourceRegistry/defineSources.ts` — the ONE loader
  (supplement §7 item 3): every row through `SiteIntelSourceSchema` at module load; a
  failure **names country + row id + index + every Zod issue**; two loader-level
  disciplines beyond the frozen schema: country-consistency (a pasted row is a corruption)
  and **no unprobed rows** (empty `probes[]` rejected — the §F item 15 unverified-claims
  guard). PROTOCOL POLICY documented: `protocol` stays the frozen REPORT §I closed set as a
  coarse transport class; WMS/WCS/ArcGIS-REST dialects are classed `REST` and named
  VERBATIM in `dataset`/probe notes — no frozen enum extended.
- `packages/site-parcel-data/src/sourceRegistry/{de,dk,ch,es,fr,pt,nl,pl,lt,be,fi,gb,it,no}.ts`
  — 14 country data modules, **31 rows**, every endpoint/licence-colour/status/probe
  copied from a named source: `parcelProviders/registry.ts` probe notes,
  `tools/context-bake/heightSources.mjs` impl table, REPORT §F/§G rows, the L4/L5 lane
  files (§F's own header: "the lane files are the authority for every underlying fact"),
  and the wired proxies (`server/jurisdiction/*.js`) for exact endpoint URLs the prose
  named by host only. Every module header carries its HONEST ABSENCES with the lane-file
  citation (e.g. CH geodienste NPL YELLOW no-URL; PL RU endpoints "not yet discoverable";
  PL KIMPZP probed-but-ungraded → deferred to the licence read; NO FKB "do NOT license").
- `packages/site-parcel-data/src/sourceRegistry/index.ts` — EE joins by **reuse** of the
  E1d exemplar (`SOURCE_REGISTRY.EE === EE_SOURCES`, reference-equal, tested — C84 EI-9,
  no rival) → **15 countries, 35 rows**. `REPORT_F_COUNTRIES` = §F's 30 codes VERBATIM
  (§F order and spelling — "UK", with the explicit `REPORT_F_TO_ISO` UK→GB alias, never
  silent). `SOURCE_ABSENCE_REASONS` = the per-country honest-absence register (15 entries,
  each citing its lane file). `coverageByCountry()` iterates the §F frame, never the
  module set, so a zero-row country PRINTS as zero instead of vanishing.
- `packages/site-parcel-data/src/index.ts` — barrel export appended (registry REACHABLE,
  not authored-but-unwired). `EE_SOURCES` itself deliberately NOT re-exported — the E1d
  module stays the authority; consumers reach EE rows via `SOURCE_REGISTRY`.
- `packages/site-parcel-data/__tests__/sourceRegistry.test.ts` — the proof suite, **10/10**.

## The NL YELLOW decision (the one colour-projection judgement, recorded)

§G grades the DSO APIs "YELLOW-GREEN … fair-use policy text UNREAD". YELLOW-GREEN is not a
value of the frozen colour enum; the two DSO rows carry the CONSERVATIVE projection
**YELLOW** with §G's wording verbatim in `licence.id` — never a silent upgrade to GREEN.
Everything else is a straight copy.

## Coverage proof (printed by the test, verbatim tail)

`[source-registry] totals: 35 rows across 15 countries; 15 honest absences`

Row-for-row against REPORT §F (asserted, all 30): DE 2 · DK 3 · CH 2 · ES 3 · FR 2 · PT 1 ·
NL 5 · PL 3 · LT 3 · EE 4 · BE 2 · FI 2 · IT 1 · NO 1 · UK 1 · and 0 with a cited
absence reason for AT BG HR CY CZ GR HU IE LV LU MT RO SI SK SE. SE is the deliberate case:
graded GREEN in the sweep but **no API endpoint URL captured in the prose registries**
(OAuth2/org-onboarding gate) — a row would invent, so it is an absence with that reason.
NO OME2 rows (asserted by test — verdict §F item 15, DECISION row 10b founder item).

## Proof transcripts (verbatim terminal lines)

- Registry suite: `Test Files  1 passed (1)` · `Tests  10 passed (10)`.
- Schemas siteintel suite: `Tests  48 passed (48)`.
- Full schemas suite: `2 failed | 49 passed` files / `3 failed | 1982 passed` tests — the
  SAME pre-existing failures lane R recorded (round-trip water / view-template defaults,
  committed files this lane never touched). Unchanged.
- P5: `[domain-purity] ✓ packages/schemas is pure — 0 impurities across 201 files. HARD-FAIL AT ZERO.` RC=0.
- Package tsc: schemas `SCHEMAS_TSC_RC=0` · site-parcel-data `SPD_TSC_RC=0`.
- Root tsc: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → `TSC_RC=0`.

## Falsification (sever → named failure → byte-identical restore)

| Sever | Named failure (verbatim) | Restore |
|---|---|---|
| `pt.ts` licence colour `'GREEN'`→`'GREEN-ISH'` | `Error: [source-registry] PT row 'pt-dgt-snic-inspire-wfs' (index 0) does not parse — licence.colour: Invalid option: expected one of "GREEN"\|"YELLOW"\|"RED"` — MODULE LOAD failure, `Tests  no tests` (a build error, not a runtime surprise) | `sha256 d1d21a12…` identical before/after; 10/10 green |
| `entities.ts` `adapterStatus` column deleted | 3 named `×` arms: `POSITIVE: a row carrying theme/coverage/updateFrequency/adapterStatus parses with them typed` · `POSITIVE: a pre-registry row WITHOUT the four columns still parses…` · `NEGATIVE: an empty-string adapterStatus is rejected…` | `sha256 6a9ad102…` identical before/after; 48/48 green |

Controls: the valid synthetic row parses through `defineSources` (CONTROL arm, permanent);
the corrupted/foreign-country/unprobed variants each throw naming the row (permanent
NEGATIVE arms) — so the live sever above is re-proven on every CI run, not once.

## Boundaries honoured

- Schemas frozen after the R-batch: touched ONLY `SiteIntelSourceSchema` (the sanctioned
  columns). `SourceProtocolSchema` / `LicenceColourSchema` untouched.
- EE exemplar module untouched (E1d rework lane owns it); its rows assert honest nulls for
  the four columns in the test until that lane states them — flagged as the ONE follow-up
  for E1d: stamp `theme/adapterStatus` on the 4 EE rows when reworking.
- No ceiling raised, no gate disabled, no gate-debt entry, no rival (runtime
  parcel-provider registry untouched; non-rivalry register untouched). NOT committed.
- KIMPZP (PL) and HMLR INSPIRE (GB) are the two probed-but-unseedable endpoints — each
  blocked on a missing lane-file licence colour, recorded as absences in the module
  headers, NOT invented. They are natural first entries for the week-1 probe register's
  licence reads.
