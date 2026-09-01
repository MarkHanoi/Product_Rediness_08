# E1a — Canonical model as pure schemas — IMPLEMENTED (2026-09-01)

**Lane:** E1a (EUROPE-IMPLEMENTATION-PLAN §E1a · REPORT §I · BRIEF §11) · **Status:** DONE, NOT COMMITTED (orchestrator owns commits).

## What was built

New directory `packages/schemas/src/siteintel/` inside the EXISTING L0 schemas package — no new workspace package, no rival of any live concept:

| File | Contents |
|---|---|
| `json.ts` | `JsonValueSchema` — recursive pure JSON (Rule.body JSON-Logic carrier; grep confirmed no prior JsonValue schema in the package). |
| `confidence.ts` | Six-tier confidence enum, BRIEF §3 verbatim (`authoritative-machine-readable` / `authoritative-document-derived` / `deterministic-inference` / `ai-interpretation` / `human-validated` / `uncertain-missing`) + numeric 1..6 wire form (`SiteIntelConfidenceSchema`) + both mappings. Doc-commented as a C62 domain tier vocabulary — NOT a replacement for `EnvelopeConfidence` (C58) or `DomainConfidence` (C62). |
| `provenance.ts` | The BRIEF §11 per-rule provenance JSON: `parameter/value/unit/source{country,authority,dataset,plan_id,object_id,document,article,page}/derivation/valueLocation/confidence/valid_from/valid_to`. `RuleSourceRefSchema` accepts the REPORT §I short keys `plan`/`object` on input and always emits canonical `plan_id`/`object_id`. `derivation` ∈ DIRECT\|DERIVED\|AI_EXTRACTED\|HUMAN_VALIDATED; `valueLocation` ∈ attribute\|in-document-text. superRefine: `value=null` only at tier 6 (UNKNOWN ≠ 0 ≠ no-limit, L4 EE-4). |
| `vocabularies/dk.ts` | DK `bebygpctaf` denominator codelist (4 rows, closed), IMPORTED from `pdk:theme_pdk_codelist_bygberegnaf_v` as probed 2026-08-31 (lane 2 §DK-2), Danish labels verbatim from the probe transcript. Explicitly does NOT mint a mapping onto `LandBasis` (adapter semantics; L-664). |
| `vocabularies/nl.ts` | NL IMOW value-list REFERENCES (Eenheid URI verbatim from the probed openapi v8.5.2; TypeNorm/Normgroep `uri: null` — honest gap, documented at docs.geostandaarden.nl/ow/imow/, never guessed) + the three-way `NormwaardeSpec` split (`kwantitatieveWaarde`/`kwalitatieveWaarde`/`waardeInRegeltekst`) + pure mapping onto `valueLocation`. |
| `vocabularies/lt.ts` | LT ASGR field vocabulary from the VTPSI LEIP spec 2024-06-18 (fetched 2026-08-31, lane 4 §LT-1): 4 value fields, per-value provenance suffixes `_TP/_NR/_D/_TPR`, classification fields, `PILN` flag. MAX_INTENS unit caution carried verbatim — NO unit string declared for it. |
| `entities.ts` | The 17 entities (all `SiteIntel`-prefixed) + `SiteIntelDocument` (REPORT §I's field table adds it): Parcel, Building, Terrain, Road, Plan, Zone, Prescription, Restriction, Regulation, Rule, Scenario, Envelope, DevelopmentPotential, Source, Evidence, Version (+ Confidence in confidence.ts). Native-CRS geometry (`NativeCrsGeometrySchema`, CRS travels with coordinates — L3 ES-5), SURVEYED≠NORMATIVE height method enum, honesty superRefines (delta null-propagation). |
| `index.ts` | Barrel + the adopted-not-rivalled register. |

Wiring: `packages/schemas/src/index.ts` appends `export * from './siteintel/index.js'` (all names prefixed — zero collisions); `packages/schemas/package.json` adds the `./siteintel` subpath export.

## Existing schemas ADOPTED, not rivalled (grep-first per C84 EI-9)

- `Parcel`/`ParcelProvenance` (C19/C57) — committed editor parcel + commit-seam provenance; `SiteIntelParcel` is the SOURCE-side native-CRS record.
- `BuildableEnvelope` + refusals (C58) — remains THE determination artefact; `SiteIntelEnvelope.determinationRef` links to it, conflicts resolve in C58's favour.
- `LandBasis` (C63/L-656) — the denominator concept; DK codelist is the wire encoding, mapping deferred to adapter code.
- `FetchOutcome`, `ExtractionProvenance` (C23), `DomainConfidence`/`SourceProvenance` (C62), `ZoningProvenance` — all named in doc comments with their exact division of labour. Nothing re-exported through a second path.

## Proof (foreground, verbatim)

Test: `packages/schemas/__tests__/siteintel.test.ts` — 20 tests: REPORT §I EE worked example VERBATIM (incl. `plan`/`object` alias keys) round-trips parse→JSON→parse; BRIEF §11 DE example (maximum_height 18 m) round-trips; DK chain (bebygpct 150, `bebygpctaf=4` resolved from the imported codelist; Aarhus code-1 trap asserted); LT chain (MAX_AUK_M 8.5 + provenance columns); all 17 entities round-trip an EE mini-graph; closed-set + honesty rejections.

```
 Test Files  1 passed (1)
      Tests  20 passed (20)
```

### P5 purity gate — BEFORE and AFTER (RC verbatim)

```
BEFORE (2026-09-01):
[domain-purity] scope: packages/schemas/src · files scanned: 192 · rules: 7 · impurities: 0
[domain-purity] ✓ packages/schemas is pure — 0 impurities across 192 files. HARD-FAIL AT ZERO.
RC=0

AFTER:
[domain-purity] scope: packages/schemas/src · files scanned: 200 · rules: 7 · impurities: 0
[domain-purity] ✓ packages/schemas is pure — 0 impurities across 200 files. HARD-FAIL AT ZERO.
RC=0
```
File count rose 192 → 200 (the 8 new files); impurities stayed 0. No ceiling raised, no gate touched, no gate-debt entry.

### Root tsc

`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → **RC=0** (run AFTER all edits were in place). Package-local `tsc -p tsconfig.json --noEmit` → RC=0.

## Falsification controls — EXECUTED (corrupt → seen failing → byte-identical restore → pass)

**Control A (schema seam):** `provenance.ts` `authority: z.string().min(1)` → `.min(1).optional()` (the parse would silently accept a record with no publishing authority):

```
 × deleting source.authority → parse error whose path names source.authority 8ms
 FAIL  __tests__/siteintel.test.ts > falsification — … > deleting source.authority → parse error whose path names source.authority
AssertionError: expected true to be false // Object.is equality
      Tests  1 failed | 19 passed (20)
```

Restore: `cmp` → `BYTE-IDENTICAL RESTORE CONFIRMED` → `Tests  20 passed (20)`.

**Control B (vocabulary value):** `vocabularies/dk.ts` code-4 gloss corrupted to code-1's meaning ('the plan area as a whole' — the exact C63 denominator trap):

```
 × resolves bebygpctaf=4 from the IMPORTED codelist: the individual cadastral parcel 6ms
      Tests  1 failed | 19 passed (20)
```

Restore: `cmp` → `BYTE-IDENTICAL RESTORE CONFIRMED` → `Tests  20 passed (20)`.

**Permanent in-test falsifications** (lane-brief mandate "corrupt one required provenance field in a fixture → parse fails naming the field"): deleting `source.authority` from the EE fixture fails with issue path `source.authority`; `value=null` at tier 1 fails naming `value` (and PASSES at tier 6 — absence is an answer); fabricated delta over unknown existing GFA rejected; lower-case country rejected; codelist code 5 rejected.

## Pre-existing failures NOT caused by this lane

Full package suite: `Test Files 2 failed | 49 passed (51) · Tests 3 failed | 1954 passed (1957)`. The 3 failures (`round-trip.test.ts` water ×2, `view-template-roundtrip.test.ts` ×1) REPRODUCE IDENTICALLY with this lane's shared-file edits reverted to HEAD (git checkout of `src/index.ts` + `package.json`, siteintel unreferenced) — pre-existing at HEAD, left untouched, flagged to the orchestrator.

## Refused / deferred by name

- NO members enumerated for IMOW Eenheid/TypeNorm/Normgroep and NO URIs guessed for the latter two — fetching them is I/O (can never be L0) and a follow-up lane's job.
- NO DK-code→LandBasis mapping table minted (adapter semantics, L-664).
- NO closed enum for Plan.kind / Plan.status / Restriction.theme / Prescription.kind — REPORT leaves them open ("…"; "DK serves lifecycle natively; mirror it"); known values documented in doc comments.
- NO unit declared for LT MAX_INTENS (unresolved percent-vs-FAR encoding; lane 4 caution carried verbatim).
- DO-NOT-TOUCH list: none of the owned files were needed or touched.
