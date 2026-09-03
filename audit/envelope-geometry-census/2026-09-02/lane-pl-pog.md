# LANE PL-POG — POLAND POG APP GML 2.0 → envelope-contribution scalars (COMPILE)

> Date: 2026-09-03 · Authority: `audit/envelope-geometry-census/2026-09-02/CENSUS.md` row 23 +
> TOP-10 CONSUME-NOW #2 (score 497) · `STR-EUROPEAN-ENVELOPE-SOURCES.md` §9 (P2 authoritative
> machine-readable parameters — COMPILE). GOAL-3 (envelopes everywhere).
> **Shipped, no commit** (orchestrator owns docs + cherry-picks).

## VERDICT

Poland's POG (`plan ogólny gminy`) publishes, per `app:StrefaPlanistyczna`, four national-mandatory
numeric ceilings as APP GML 2.0 data. This lane **COMPILES** them into the EXISTING engine's
scalar-cap path (`computeBuildableEnvelope` via a `ZoningRecord.structuredFields`, the DK-Plandata
structured route) — **no new engine**. The honest split, driven by the never-overstate mandate and
the C63 denominator doctrine:

| APP element | canonical | disposition |
|---|---|---|
| `maksWysokoscZabudowy` (m) | max HEIGHT | **BINDS** — an absolute metric cap, denominator-free (behind a range gate: metres-only, plausibility band). |
| `maksNadziemnaIntensywnoscZabudowy` | FAR (intensywność) | **COMPILED FACT, WITHHELD from binding** — denominator is *działka budowlana* (buildable plot), not the cadastral parcel (C63). |
| `maksUdzialPowierzchniZabudowy` (%) | COVERAGE (udział) | **COMPILED FACT, WITHHELD from binding** — same *działka budowlana* denominator. |
| `minUdzialPowierzchniBiologicznieCzynnej` (%) | min GREEN share | **FACT** — no engine slot; it only tightens (presenting it as a coverage relaxation would over-state). |

Each compiled scalar carries its APP citation: plan IIP identity + version + the reform legal basis
(upzp art. 13e, added by the 2023 reform — ustawa z 7 lipca 2023 r., Dz.U. 2023 poz. 1688).

**This mirrors the DK exemplar exactly** (`dkPlandataEnvelope.ts`): DK binds height + storeys always
and withholds FAR at non-parcel density scope; PL binds height and withholds FAR + coverage at the
działka-budowlana denominator, with a stated **flip point** (resolve the buildable-plot denominator →
one branch changes and FAR/coverage move from withheld to binding, the grade improving visibly).

## LIVE RE-PROBE (2026-09-03) — the census pinned the endpoints; I re-confirmed

The census (and the E6-PL adapter discovery, 2026-09-01) said **no servable POG data channel exists
before the Rejestr Urbanistyczny transition ends 2026-11-30.** Re-probed live today:

| Endpoint | Result | Reading |
|---|---|---|
| `mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaPlanowOgolnych?…GetCapabilities` (WMS) | **HTTP 401, 96 B** | catch-all, NOT a gated POG service |
| …same base, **nonsense** service name (negative control) | **HTTP 401, 96 B — BYTE-IDENTICAL** | proves the 401 is the base's catch-all (§GetCapabilities-is-not-an-inventory) |
| …POG **WFS** GetCapabilities | HTTP 401, 96 B | same catch-all |
| MPZP service `KrajowaIntegracjaMiejscowych…` (positive control) | **HTTP 200, 23,800 B text/xml** | the base DOES serve real services (layers `wektor-str`, `wektor-lzb`, …) — MPZP, not POG |
| `rejestr-urbanistyczny.gov.pl` | **HTTP 200, 22,530 B (Angular SPA shell)** | no data service — same shell E6-PL reached 2026-09-01 (module-federation manifest lists only front-end remotes, no data base URL) |
| `api.rejestr-urbanistyczny.gov.pl` | **HTTP 000 (unreachable from this vantage)** | no reachable data host |

**Coverage measurement — how many communes reachable today: ZERO via a national data channel.** The
POG APP GML data channel is not published; the only servable POG artifact is the OFFICIAL MINISTRY
SAMPLE (a synthetic gmina, `PL.ZIPPZP.11111/321202-POG`, 28 strefy, act status `elaboration` = a
DRAFT), byte-pinned as a fixture. So:

- The **COMPILE path** is proven on the sample's real APP-shaped numbers (strefa 1SZ verbatim below).
- **Live national resolution today is the coverage-gap refusal** (`plPogCoverageGapRefusal`) — transient
  by name (`endpoint-unreachable`), naming the commune, **never** the pre-reform MPZP.

Transcripts: `transcripts-pl-pog/` (re-probe curl output). Re-check RU WFS/CSW after 2026-11-30.

## THE COMPILED TRANSCRIPT — strefa 1SZ, verbatim from the live GML

From the fixture bytes (`app:` elements quoted verbatim):

```
app:oznaczenie>1SZ      app:symbol>SZ
app:maksNadziemnaIntensywnoscZabudowy>0.8          → FAR 0.8        (FACT, withheld — denominator)
app:maksUdzialPowierzchniZabudowy>50.0             → coverage 50 %  (FACT, withheld — denominator)
app:maksWysokoscZabudowy uom="m">15.0              → height 15.0 m  (BINDS)
app:minUdzialPowierzchniBiologicznieCzynnej>50.0   → min green 50 % (FACT)
act idIIP: PL.ZIPPZP.11111/321202-POG/1POG · wersja 20241204T095812 · status elaboration (DRAFT)
strefa idIIP: PL.ZIPPZP.11111/321202-POG/1POG-1SZ
```

Compiled resolution (`resolvePlPogEnvelope`):
- `maxHeightM = 15` (binds), `heightWithheldReason = null`
- `maxFar = 0.8`, `farWithheldReason = 'denominator-dzialka-budowlana'`
- `maxCoveragePct = 50`, `maxCoverageFraction = 0.5`, `coverageWithheldReason = 'denominator-dzialka-budowlana'`
- `minGreenPct = 50`
- `inForce = false` (DRAFT — compiled, never presented as in force)
- `citation`: `strefa 1SZ (PL.ZIPPZP.11111/321202-POG/1POG-1SZ) · plan PL.ZIPPZP.11111/321202-POG/1POG
  (wersja 20241204T095812) · … upzp art. 13e … 2023 reform (Dz.U. 2023 poz. 1688) …`

`ZoningRecord`: `structuredFields.maxHeight_m = 15`; `plotRatioFAR`/`maxCoverage` **absent** (withheld);
`zoneCode = 'SZ'`; `provenance.source = 'pl-app-gml-2-0-planning-act'`; `ordinanceRef` = the citation +
the compiled facts. Solved through the real engine: `status ok`, `maxHeight_m 15`, `footprintIsUpperBound
true` (unknown setbacks ≠ 0), `maxFAR null`, `maxCoverage null`.

## FILES TOUCHED

**New:**
- `packages/site-parcel-data/src/rulepacks/plPogEnvelope.ts` — the compile module (resolver + record
  builder + strefa extractor + coverage-gap refusal). L2-pure.
- `packages/site-parcel-data/__tests__/plPogEnvelope.test.ts` — 12 tests (compile, citations, record,
  engine contribution, range gate, absent-ceiling, coverage-gap refusal, determinism).
- `tools/ga-gate/corpus/never-overstate/pl-pog-official-sample-1sz.json` — recorded strefa-1SZ fixture
  (values verbatim from the byte-pinned sample; `published` bound transcribed independently).
- `audit/envelope-geometry-census/2026-09-02/lane-pl-pog.md` (this file);
  `audit/envelope-geometry-census/2026-09-02/barrel-additions-pl-pog.txt`;
  `audit/envelope-geometry-census/2026-09-02/transcripts-pl-pog/` (re-probe curl output).

**Edited (additive only):**
- `packages/site-parcel-data/src/index.ts` — re-exports the new module (barrel-additions file lists them).
- `tools/ga-gate/check-envelope-never-overstates.ts` — new arm **§PL-POG-COMPILE (2h)** + its imports.

**Untouched (as mandated):** `countryAdapters/pl/*` (the E6-PL/E9 parcel + rules leg — the new module
imports its statutory-basis constants read-only, from the LEAF files, never the barrel); the schemas
(frozen — the compile uses the existing `ZoningRecord`/`EnvelopeNumbers`); the FR envelope lane and all
parcel/context/perf/UI sibling waves.

## PROOFS

- **New test:** `pnpm --filter @pryzm/site-parcel-data exec vitest run plPogEnvelope` → **12/12 pass.**
- **Never-overstate gate:** `npx tsx tools/ga-gate/check-envelope-never-overstates.ts` → **RC=0** before
  AND after (arm §PL-POG-COMPILE: `env ok, height 15 m (binds) ≤ 15 m, FAR/coverage withheld
  (env.maxFAR=null, env.maxCoverage=null), tamper re-binds=true`). Corpus now 192 zone-solves / 146 ok.
- **Falsification (height teeth):** lowering the fixture's independently-transcribed `published.heightM`
  15→10 → gate **FAILS RC=1** `[height] pl-pog/compile / 1SZ — compiled height 15 m exceeds the recorded
  maksWysokoscZabudowy 10 m`; byte-identical restore verified (sha256 unchanged).
- **Falsification (withhold teeth):** the arm injects FAR + coverage back into `structuredFields` and
  asserts the engine RE-BINDS them (`tamper re-binds=true`) — proving the withhold is load-bearing, not
  accidental. The C63 trap for PL is a SEMANTIC overstatement the engine arithmetic cannot see (FAR ×
  cadastral is self-consistent); only the withhold protects it.
- **Falsification (range gate):** an out-of-range served height (×100) compiles to `null` +
  `height-out-of-range`; a non-metre uom → `null` + `height-non-metre-uom` (tests + gate arm).
- **Falsification (endpoint severed):** the coverage-gap leg reports `transient` (`endpoint-unreachable`)
  naming the commune, never `absent`/empty, never the pre-reform MPZP (test + re-probe).
- **Scoped tsc:** `tsc -p packages/site-parcel-data/tsconfig.json --noEmit` → **RC=0** (no errors from
  this lane's files).
- **Full site-parcel-data suite:** `pnpm --filter @pryzm/site-parcel-data exec vitest run` → see run.

## HONESTY LIMITS / OPEN ITEMS (never-overstate)

1. **The działka-budowlana denominator is UNRESOLVED** — this is why FAR + coverage are withheld from
   binding, not a limitation of the compile. Resolving it (a served buildable-plot geometry, or a
   per-plan rule) is a LATER lane; it is the documented flip point.
2. **`ZoningPackSourceSchema` (the pack-path `source` enum) has no PL value** (`catastro-muc | madrid-pgou
   | oereb | plandata-dk | terrara | manual`). This lane took the **`ZoningRecord` structured route**
   instead (whose `provenance.source` is a free string), so it cites the real APP source id
   `pl-app-gml-2-0-planning-act` with no frozen-enum edit. If a future POG rulepack wants the
   `JurisdictionZoningContract` path, an ADR should add `pl-app-gml` to that enum (schemas were frozen
   for this lane).
3. **Height DATUM (ADR-0377):** POG `maksWysokoscZabudowy` is a relative building height; its exact
   measurement plane is not pinned in the census corpus. The record states no specific datum (reads as
   `unknown` via `heightDatumOf`, the honest ADR-0377 value) and the engine binds it as a relative cap
   (identical to the proven DK path). Pinning the datum from the reform measurement regulation is a
   follow-up.
4. **The official sample act is a DRAFT** (`elaboration`). Compiled numbers carry an explicit
   not-in-force caveat and `inForce=false`; a point-in-time evaluator correctly refuses to say they were
   in force on any date. Live in-force POG data awaits the RU channel (≥2026-11-30).
5. **L-12874 token discipline honoured:** the coverage-gap refusal reuses the L0 `endpoint-unreachable`
   transient token — no new refusal-token spelling minted.
