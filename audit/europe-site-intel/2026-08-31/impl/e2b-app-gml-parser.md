# LANE E2b — Polish APP (akt planowania przestrzennego) GML 2.0 parser

Wave E2 (plan §"WAVE E2 — ENGINE DEBT"; REPORT §S 0–6mo item 5), PL preparation ahead of the
2026-11-30 Rejestr Urbanistyczny transition. Executed 2026-09-01. NOT COMMITTED (lane rule) —
files listed below sit in the working tree.

## What was built

A NEW self-contained module — `packages/site-parcel-data/src/parsers/appGml/` — exported from
the package barrel (`src/index.ts`, one appended block; reachable, not just committed):

| File | Role |
|---|---|
| `src/parsers/appGml/xmlScan.ts` | Minimal deterministic XML scanner (pure, total, no DOMParser/deps; DOCTYPE refused; namespace-resolved; refusals carry byte offset + element path) |
| `src/parsers/appGml/appGmlTypes.ts` | Plain typed structures mirroring the official XSD names; `AppDecimal`/`AppMeasure` unions whose absent arm is `{kind:'unspecified', meaning:'attribute-absent-in-document'}` |
| `src/parsers/appGml/parseAppGml.ts` | The parser: string → `parsed | empty | refused(named reason, path)` |
| `src/parsers/appGml/index.ts` | Module door |
| `__tests__/appGmlParser.test.ts` | 24 proofs (round-trip, control 9, refusals by name, falsifications, scramble control) |
| `__tests__/fixtures/pl-app-gml-2-0/` | The two OFFICIAL artifacts, byte-identical (hashes below) |

**Existing-solver check (grep FIRST, per the hard rule):** the repo parses no XPlanGML/CityGML/
APP-GML anywhere. Existing XML handling in `@pryzm/site-parcel-data` is per-provider regex leaf
extraction (`chGrundnutzungProvider.ts` `extractTag`, `wmsGetFeatureInfo.ts`), deliberately
DOMParser-free (`balearsMuibFitxa.ts` documents the discipline); `fast-xml-parser@5.5.6` is a
ROOT dependency only (not linked into this package; adding it would touch `package.json` +
lockfile — refused). Nested same-name GML structures (rings-in-polygons-in-multisurfaces,
member wrappers) are beyond leaf-regex machinery, so a ~350-line scanner was written INSIDE the
module following the package's established no-DOM determinism discipline — an adoption of the
house pattern, not a rival to any existing solver (none exists).

## Sources of truth (official, fetched 2026-09-01)

| Artifact | URL | Bytes | sha256 |
|---|---|---|---|
| XSD `planowaniePrzestrzenne_2_0.xsd` (publ. 2023-11-22) | https://www.gov.pl/static/zagospodarowanieprzestrzenne/schemas/app/2.0/planowaniePrzestrzenne_2_0.xsd (linked from https://www.gov.pl/web/zagospodarowanieprzestrzenne/schematy-aplikacyjne) | 54,226 | `9005a69487b262c217d50bd694e5441a8c32a3aef56d42c5463abec31da87b88` |
| Official POG test GML (ministry export 2024-12-04) | https://www.gov.pl/attachment/8dd6086a-88ba-44fb-be68-d43d14a15e36 (linked from https://www.gov.pl/web/zagospodarowanieprzestrzenne/przykladowe-dane) | 253,475 | `173690566bf1fab5fbb448970efc007219848d06eb93ff5e7e35c70ea5090853` |

Both reachable live (HTTP 200); sample-validation is therefore PROVEN on the official sample —
the "build against XSD alone" fallback was not needed. The GML fixture's sha256 matches the
lane-4 audit's probe of the same URL (253 KB, namespace
`https://www.gov.pl/static/zagospodarowanieprzestrzenne/schemas/app/2.0`).

## What the parser covers (schema 2.0, complete feature catalogue)

All seven XSD feature types: `StrefaPlanistyczna` (the Lane-4 target — `symbol`, `oznaczenie`,
codelist `nazwa`, `profilPodstawowy+`/`profilDodatkowy*`, and the four zone-level envelope
ceilings `maksNadziemnaIntensywnoscZabudowy` (above-ground FAR), `maksUdzialPowierzchniZabudowy`
(% coverage), `maksWysokoscZabudowy` (m, uom mandatory), `minUdzialPowierzchniBiologicznieCzynnej`
(% green)), `ObszarUzupelnieniaZabudowy`, `ObszarZabudowySrodmiejskiej`,
`ObszarStandardowDostepnosciInfrastrukturySpolecznej` (full 18-field standards block),
`AktPlanowaniaPrzestrzennego` (incl. `wydzielenie`/`regulacja`/`rysunek` xlink refs),
`DokumentFormalny` (incl. the gmd:CI_Date leaf), `RysunekAktuPlanowaniaPrzestrzennego`.
Versioning fields (`wersjaId`, `poczatekWersjiObiektu`, `obowiazujeOd/Do`) are preserved as
written — the §15 temporal-validity model is in the national schema. Geometry: gml:Polygon /
MultiSurface, exterior+interior LinearRings, native-CRS coordinates untouched (EPSG:2176 in the
sample), srsName transcribed, 2D enforced.

Control 5 (parser ≠ mapper): output vocabulary is the XSD's own; no siteintel entity, rule pack,
country adapter, or Source Registry module is imported or touched.
Control 9: an absent optional value parses to `unspecified` — there is no code path yielding
0/Infinity/permissive-default; consumers must branch on `kind`.

## Proofs (all foreground; `npx vitest run __tests__/appGmlParser.test.ts`)

- **Round-trip of the official sample:** census 28 strefy + 4 OUZ + 2 OZS + 1 OSD + 1 akt +
  1 dokument (matches lane-4 audit §PL-2 independently); strefa 1SZ values FAR 0.8 /
  coverage 50.0 / height 15.0 m / green 50.0; **coordinate conservation** — 36 posLists,
  12,146 numeric tokens by independent regex = 6,073 parsed positions ×2, nothing dropped or
  invented; all 36 rings closed; determinism (two parses byte-equal by JSON); zero warnings.
- **Control 9 exercised by the state's own artifact:** 10 of 28 strefy omit FAR/height, 8 omit
  green — all parse `unspecified`, never 0.
- **Empty ≠ failure (FetchOutcome-style):** zero-member collection → `empty:no-members`;
  all-foreign members → `refused:no-app20-features`; APP-1.0-namespace swap → refused (a 1.x
  file cannot pass as 2.0).
- **Malformed-input refusals by name:** `malformed-xml:not-xml`, `malformed-xml:unclosed-element`
  (truncation), `malformed-xml:doctype-not-allowed`, `not-a-feature-collection`,
  `missing-required-element`, `invalid-decimal`, `missing-uom`, `odd-coordinate-count`,
  `ring-not-closed`, `malformed-xml:mismatched-close-tag` — each corrupting ONE element of the
  official sample in memory, each refusal naming the offending element path, and after each the
  pristine string re-parses (restore is byte-identical by construction; the fixture's sha256 is
  asserted before anything else runs).
- **Scramble control** (corpus-never-jittered doctrine): a corruption the parser is NOT asked to
  refuse (an oznaczenie swap) parses fine and yields visibly different content — the suite
  cannot pass on arbitrary input.

## Falsification of the suite itself (seen failing → byte-identical restore)

Injected the exact §M/§O defect class this wave exists to kill — UNKNOWN→0 — into
`optDecimal` (`if (c === null) return { kind:'value', value:0, raw:'0' }`):
`❯ 24 tests | 1 failed — × E4 control 9 … AssertionError: expected +0 to be 10`.
Restored from the pristine copy; sha256 before `1e394c63b88aa6a67ab4aa265a28676a3b72acb83372d606ebf21a5f9979638c`
= sha256 after (byte-identical); re-run → 24/24 green.

## Verification transcript (2026-09-01, all foreground)

```
npx vitest run __tests__/appGmlParser.test.ts   → Tests 24 passed (24)
npx tsc -p packages/site-parcel-data/tsconfig.json --noEmit → RC=0
npx vitest run   (whole package)                → Test Files 155 passed, Tests 3210 passed
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json → ROOT_TSC_RC=0
```

## Discoveries recorded, NOT acted on (control 10)

1. **The official sample's own header is inconsistent:** `numberReturned="6"` while the
   collection carries 37 members. The parser transcribes both; reconciliation (if any) is a PL
   adapter question.
2. **Official XSD typo:** the property-type companion of the standards area is named
   `ObszarStandardowDostepnosciInfrastrukturySpolecznejTypePropertyType` (doubled "Type") —
   cosmetic, no parser impact, worth knowing before anyone greps the XSD by expected name.
3. **`RysunekAktuPlanowaniaPrzestrzennego` appears in no official sample member** (0 in the
   file); its parser arm is exercised only structurally. First real POG harvest after
   2026-11-30 should round-trip one drawing feature.
4. **Ring-closure is byte-exact in the official sample** (first token == last token as strings);
   the parser compares parsed numbers. If a municipal producer ever emits `15.0` vs `15.00`
   closure, numeric comparison still accepts it — flagging in case a stricter policy is wanted.
5. **xsi:nil appears nowhere in the sample and `nillable` nowhere in the XSD**; the parser
   treats nil-on-optional as `unspecified` + warning, nil-on-mandatory as `refused:unexpected-nil`.
6. **RU service endpoints remain undiscoverable** (lane-4 OPEN ITEM stands): this parser is the
   consumer for whatever WFS/Atom the Rejestr Urbanistyczny exposes after the transition; the
   harvest lane still needs the eziudp endpoint sweep.

## Refused by name (lane scope discipline)

- **No PL country adapter / canonical mapping** — Wave E4 owns `countryAdapters/` and
  `schemas/siteintel/`; both untouched (DO-NOT-TOUCH honored; the parser emits parser-local
  types only).
- **No dependency added** (`fast-xml-parser` linkage would touch `package.json` + pnpm-lock —
  the frozen-lockfile trap).
- **No commit** (lane rule; files enumerated above are the change set).
