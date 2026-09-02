# ADR-0377 — A stated height NAMES ITS DATUM; absence is `unknown`, and `unknown` refuses

**Status:** ACCEPTED · **Date:** 2026-09-02 · **Lane:** S1 (schema seats), per the envelope-architecture
audit (`audit/envelope-architecture/2026-09-02/`, lane A §4.1 / matrix row 7) and the validated
matrix. §S1-DATUM.

## Context

One token — `maxHeight_m` — has been carrying at least four legally distinct quantities:

- **rasant-at-façade** (ES PGM Art. 240; L-584 — sampling a centroid instead of the façade is a
  compliance defect already measured in metres in the Gòtic);
- **street grade** (ES PGM Art. 350.2.e, «des de la rasant del carrer»);
- **mean ground at the façade alignment** (PT Porto PDM Art. 3.º g; the EE `maapinna keskmine
  kõrgus` family);
- **an ABSOLUTE national altitude** (FR Paris HMC in NGF; DE «bis zu 72,2 m über NHN» — the E8
  trial's measured defect: it auto-accepted into a relative-height seat with zero flags; EE
  `korgusabs` in EH2000). This one is **not a building height at all**.

A wrong datum is not approximately wrong — it is measured from the wrong plane.

## Decision

1. **`HeightDatumSchema`** (`packages/schemas/src/site/HeightDatum.ts`): a discriminated union —
   `facade-rasant | street-level | mean-ground-at-facade | absolute-national(frame: NGF|NHN|EH2000)
   | terrain-highest | terrain-lowest | unknown`. Members are `.strict()`: incoherent pairs (a
   frame on a relative member; a frameless absolute) REJECT at parse, never strip.
2. **`HEIGHT_DATUM_KIND_REGISTRY`** — `Record<HeightDatumKind, meta>`, compile-closed: an
   unregistered member cannot exist. `comparableToRelativeHeight: false` on `absolute-national`
   and `unknown` is what makes "an altitude is not a building height" machine-checkable.
3. **The seat on `ZoningRule`** (`JurisdictionZoningContract.ts`): `heightDatum` is OPTIONAL at
   the schema (append-only — every shipped pack parses byte-identically, no injected key) and
   REQUIRED-WHEN-HEIGHT at the read path: consumers read `heightDatumOf(...)`, which is TOTAL and
   stamps `{ kind: 'unknown' }` for absence. A SPECIFIC datum beside a null height REJECTS
   (a datum of nothing is a transcription error); an explicit `unknown` beside a null height is
   legal (it asserts nothing).
4. **First resolver consumer** —
   `site-parcel-data/rulepacks/declarative/heightDatumResolver.ts`: `facade-rasant` routes to the
   REAL Art. 240 machinery (`geometry/facadeRasantDatum.ts`, function references — never strings);
   `absolute-national` returns `absolute-flagged` (representable-and-flagged, the Paris HMC
   discipline: never applied as a cap without terrain + frame); `unknown` REFUSES
   (`datum-unresolved` — defaulting to any plane is the L-584 class); the remaining members refuse
   `no-resolver-wired`, naming the gap as PRYZM's, never the law's (L-616 / Murcia §R-7). The
   switch is exhaustive (`assertNever`): an unrouted future member is a compile error.
5. **Known future member deliberately NOT minted:** DK *niveauplan* (`fixed-niveauplan(z)`) — zero
   repo consumers today; a fact nothing consumes is not declared.

## Consequences

- The «72,2 m über NHN» class is now representable-and-flagged; loading it into a relative
  comparison is a typed refusal, not a silent acceptance.
- Every pre-ADR-0377 pack is unchanged on disk and parses byte-identically; its datum reads as
  `unknown`, which refuses — a legacy pack can never silently acquire a plane it did not state.
- Falsified 2026-09-02 (final tree): import sever → 4×TS2304 at the usage sites; totality sever
  (`heightDatumOf` defaulting to a plane) → 3 tests RED; datum-switch case sever
  (`terrain-highest`) → TS2345 `never`; all restores byte-identical (sha256).
