# LANE FED — THE BUILDINGS-FEDERATION SCAFFOLD (E5 partial · DECISION-SUMMARY row 2)

> 2026-09-01 · Scope: row 2 verbatim — *"Federation — Overture backbone + national
> LoD2/cadastre override + EUBUCCO year/type joins; **adopt GERS as the conflation key**.
> Keep ODbL layers SEPARABLE (never merge into one DB) — the one architectural licence
> constraint."* · Binding: `E4-EXECUTION-CONTROL.md` (all ten controls; 2, 3, 6, 8, 9, 10 do
> most of the work here) · MS GlobalML EXCLUDED per the brief · Nothing committed.
>
> Artefacts: `packages/site-parcel-data/src/buildingsFederation/` (5 files, 1262 lines) ·
> `packages/site-parcel-data/__tests__/buildingsFederation.test.ts` (31 tests) ·
> `packages/site-parcel-data/fed-probe-tallinn.mts` (temporary probe harness, the
> `ee-chain-probe.mts` convention) · `lane-fed-transcripts/` (probe + falsification).

---

## §0 — THE INHERITED STATE: VERIFIED / CORRECTED / DISCARDED

An earlier generation of this lane was killed mid-flight and left the module uncommitted and
unverified. It was read as a draft by a stranger. Verdict per piece:

| Piece | Verdict | Evidence |
|---|---|---|
| `sourcePriority.ts` — the 4-row priority model, registryRef-XOR-gap discipline, MS-GlobalML exclusion, load-time validation | **VERIFIED, then EXTENDED** | `registryRef: 'ee-etak-ehr-hooned-wfs'` resolves to a real `EE_SOURCES` row (asserted in the suite, not just read). Two data rows added from the concurrent OSS-delta lane (§4). |
| `odblStore.ts` — the two-arm ODbL boundary | **VERIFIED, unchanged** | Both arms falsified and seen failing (F3, F4). The compile-time arm is real: removing the phantom brand makes `tsc` report `TS2578 Unused '@ts-expect-error'`. |
| `gersId.ts` — the branded key | **CORRECTED (header + provenance), regex VERIFIED by re-measurement** | Its header cited a probe transcript that **did not exist** and a sample of "80 live rows" nobody could check. Re-measured against the live bucket: **1185/1185 dashed UUID, 0/1185 undashed-32**. The regex was right; the *evidence* for it was not. |
| `buildingsFederation.test.ts` — the suite | **CORRECTED (it could never have passed)** | It asserted `parseGersId('08b2a100-…-…')` is **null** (dashes rejected) while the parser next to it **required** dashes. The two claims are mutually exclusive: the file could not have been run green in the state it was left in. Fixtures are now real ids from the live extract. |
| `conflate.ts` — match/dedup/federate | **CORRECTED, four substantive defects** (§3) | Each correction has a demonstration; two of them change output, two change honesty. |
| `src/index.ts` barrel hunk | **VERIFIED, extended** | No export-name collisions; root `tsc` proves the barrel edge compiles (and the coverage control proves root tsc reaches it at all). |
| `conflate.ts`'s trailing `export { parseGersId }` | **DISCARDED** | A duplicate of the barrel's own re-export; one name, one home. |

**Nothing was accepted because it was already there, and nothing was restarted that was
right.** The one claim that turned out to be *unverifiable rather than wrong* — the GERS
format — is the one this lane spent a live probe on, because a conflation key asserted from
memory is the single highest-cost thing in the module to get wrong.

---

## §1 — DELIVERABLE 1: THE SOURCE-PRIORITY MODEL, AS DATA

`sourcePriority.ts` · `BUILDINGS_FEDERATION_SOURCES` — five rows, tier-ordered, validated at
module load (a corrupted row is a build error naming the row).

| id | tier | role | licence class | status |
|---|---|---|---|---|
| `fed-ee-etak-ehr-hooned` | 1 | footprint-authority | open-non-share-alike | **usable** |
| `fed-overture-buildings` | 2 | backbone | odbl-share-alike | **usable** |
| `fed-eubucco-v01` | 3 | attribute-join | unresolved | blocked-licence |
| `fed-jrc-ghs-obat` | 3 | attribute-join | odbl-share-alike | blocked-join-key |
| `fed-ms-globalml` | 3 | attribute-join | unresolved | **excluded** |

Structural, not decorative:

- **Role ⇔ tier is enforced.** `footprint-authority ⇔ tier 1`; `attribute-join ⇒ tier 3`.
  `federateBuildings` refuses a backbone offered as the authority and vice versa, by name.
- **`assertUsableFederationSource` is at the input edge.** A blocked or excluded source
  cannot contribute candidates; the refusal names the row and its reason. MS GlobalML is
  therefore *recorded and inert* — control 10 exactly ("record, do not use").
- **Control 6 is honoured by a REFERENCE, never a copy.** Endpoints, protocols, probes,
  licence texts, coverage and cadence stay on the `SiteIntelSource` rows. Every row here
  carries `registryRef` **XOR** a mandatory `registryGapReason`. Three rows have no registry
  row and say so, with the reason (the registry frames rows by REPORT §F country; Overture,
  EUBUCCO and GHS-OBAT are pan-EU/global). That gap is recorded **for the registry lane**,
  not closed here.
- **Control 9 has a structural home.** `licence: 'unresolved'` may never be `status:
  'usable'` — enforced at module load. Two *different* kinds of not-yet-usable are kept
  distinct: `blocked-licence` (the licence has not been read) and `blocked-join-key` (the
  licence *has* been read and is fine; the KEY is unverified). Collapsing those two would
  lose exactly the fact a later lane needs.

---

## §2 — DELIVERABLE 2: GERS AS THE CONFLATION KEY

**`GersId` is a branded string.** The only way to obtain one is `parseGersId`, so a `GersId`
in a signature is a *proof the format check ran*. The brand lives in the federation module —
`SiteIntelBuilding.gersId` stays the frozen `string | null` (control 3: a compile-time
refinement is not a schema change, and a `GersId` assigns to it losslessly).

**The format is MEASURED, and the measurement overturned a remembered shape.**
Release `2026-07-22.0`, Tallinn/Kopli AOI, 1185 live rows: **1185 dashed lowercase UUID
(36 chars), 0 undashed-32**. Example `eeedff0b-85b9-45a1-879e-fd7ca4ce4214`. A future format
change is refused **loudly** rather than absorbed.

**The match interface, in priority order** (`matchByIdentity` → `matchCandidates`):

1. **Published GERS bridge** — a lookup, not a computation (§4).
2. **GERS equality** — decisive wherever the two footprints sit; the prefilter never skips it.
3. **Geometry IoU** ≥ `FEDERATION_IOU_THRESHOLD` (0.5, a documented starting point awaiting
   calibration, not a tuned value).

with two refusal-shaped answers that are *not* "distinct":

- **`gers-conflict`** — both sides carry a GERS id and they differ. GERS is the stronger key,
  so the pair is distinct *even at IoU > 0.8*, and the overlap is **reported** (`report
  .gersConflicts`) rather than merged. The inherited draft documented this sentence and had
  nowhere to put the report; now it has one.
- **`undecidable`** — the clipper refused (degenerate ring / self-intersection / unresolved
  topology). The candidate is **quarantined**, never minted: a double-count would overstate.
  UNKNOWN stays distinct from a measured no-overlap (control 9).

**Per-building provenance** is `federationProvenance()`, a *projection* of the canonical
record — never a second store (control 6 again): `{source, sourceFeatureId, gersId,
heightConfidence, heightSource, floorConfidence, floorSource}`. `heightConfidence` reads
`UNKNOWN` whenever the value is null, so the schema's mandatory-method filler can never be
read as a claim.

---

## §3 — THE FOUR CORRECTIONS TO `conflate.ts` (each with its demonstration)

**C1 — A single bad authority ring could delete real backbone buildings.** The draft called
the clipper for *every* (authority × backbone) pair and quarantined a backbone candidate on
*any* undecidable comparison. A degenerate ring anywhere in the AOI therefore made every
distant backbone candidate undecidable against it, and they vanished silently.
*Fix:* the geometry arm runs only for pairs the **cheap sound disjointness proof** cannot
separate — `ringBounds` + `boundsDisjoint`, **adopted from `../geometry/ringValidation.ts` in
this same package**, written for precisely this ("`true` PROVES the two polygons cannot
overlap"). Identity arms are exempt.
*Demonstrations, and they are DIFFERENT evidence:* cost is measured on live data —
**1,288,095 → 2,797 clipper calls, 19,756 ms → 169 ms, byte-identical output**; correctness
is demonstrated by the unit test *"ONE degenerate authority ring does NOT quarantine the
whole backbone"*, because the Tallinn extract happens to contain no zero-area ring. The
header says so, so nobody cites the probe for the half it does not show.

**C2 — Every federated record fabricated a national identifier.** `toBuilding` wrote
`nationalIds: [{country, scheme: 'sourceFeatureId', value}]` for *every* source — so an
Overture GERS UUID was stamped as an **EE national register id** under an invented scheme.
*Fix:* `FederationInput.idScheme` — the authority declares its real scheme (`'etak_id'`,
measured), the pan-EU backbone declares `null` and gets an honest `[]`; its identity lives in
`gersId`, where the frozen schema already put it. An authority with no scheme is **refused**.

**C3 — The provenance view re-derived `sourceFeatureId` from a string id.** It read
`nationalIds[0].value` and fell back to the synthetic `"<source>:<featureId>"`.
*Fix:* the wrapper carries `sourceFeatureId` explicitly. The licence and the feature id are
the two facts the boundary needs that the canonical model deliberately does not carry — both
live on the wrapper, so control 3 is untouched.

**C4 — Two casts sat where an unread licence could have entered the store boundary.**
`authorityRow.licence as FederatedBuilding['licence']`.
*Fix:* `usableLicenceClass(row)` narrows away `'unresolved'` with a real check. Zero casts in
the module now.

Also: `floorsFilledFromBackbone` and `geometryComparisons` added to the report (the first was
happening silently; the second makes the prefilter's effect a measured number rather than a
claim), and the redundant `export { parseGersId }` removed.

---

## §4 — THE TWO NEW EVIDENCED SOURCES, AS DATA ROWS (never architecture)

Read `impl/e5-oss-delta.md` before designing the match interface — done, and it changed the
design in one specific way and the data in another.

**(a) GERS BRIDGE FILES (§D1) — the conflation is sometimes ALREADY PUBLISHED.**
`FEDERATION_CONFLATION_STRATEGY` is the per-country flag the delta lane asked for verbatim:

| country | strategy | bridged authority | bridge status |
|---|---|---|---|
| **ES** | **bridge-file** | Instituto Geográfico Nacional (España) | **blocked-licence** |
| EE | geometric | — | none |
| DE / NL / DK | geometric | — | none |

and `matchByIdentity` **prefers a bridge over IoU** through the `GersBridge` seam. Three
things are deliberately true of it:

- **It is a seam, not a client.** No bridge file is fetched anywhere. The bridge-files page
  states **no licence** (§D1, §6.4 gap 1), so consuming one is blocked exactly as EUBUCCO is.
- **Absence is not `'geometric'`.** `conflationStrategyFor('PL')` returns **null** — not
  assessed — never a default (control 9). Only countries the delta lane actually read off the
  page are listed, in either direction.
- **The payoff is that Spain never gets a footprint matcher by default.** The day the licence
  resolves, ES conflation becomes a lookup and no geometric matcher has to be trusted for it.

**(b) JRC GHS-OBAT (§D6) — a tier-3 row, recorded and refused.** ODbL at footprint level
(licence read), height + construction epoch + function already joined to Overture ids. It is
**blocked-join-key**, on two named checks the delta lane could not close: which id space
"unique identifiers" means (GERS **NOT CONFIRMED**), and drift between the Overture
**2024-07-22.0** release it is pinned to and the **2026-07-22.0** this scaffold reads. *A join
on an unverified key is a guess wearing a join's clothes.*

Neither addition changes an entity, a field, or an abstraction. They are rows and a flag.

---

## §5 — DELIVERABLE 3: THE ODbL SEPARABILITY CONSTRAINT, STRUCTURALLY

Row 2's one architectural licence constraint is enforced **twice**, because types erase:

1. **Compile time** — `FederationStore<'non-odbl'>` accepts only a row whose licence is
   *narrowed* to `'open-non-share-alike'`. A `FederatedBuilding` whose union still admits
   `'odbl-share-alike'` does not typecheck. Proven by falsification F4: delete the phantom
   brand and `tsc` reports `TS2578 Unused '@ts-expect-error'` — the guard is self-proving.
2. **Runtime** — `addToFederationStore` re-checks and returns a **named refusal** carrying
   the row id and both licences. Never a silent drop, never a throw a caller can forget.

A store's policy is declared at creation and **immutable** — there is deliberately no relabel
API, because laundering an ODbL store into a proprietary one by mutation is the exact move
this file exists to forbid.

**Licence propagation is conservative:** any backbone contribution — *including a GERS id
alone* — marks the record `odbl-share-alike`. At probe scale that is **1177 of 1257** records
encumbered and **80 clean**. Whether a bare GERS id really encumbers is an open legal
question (§7); until it is answered, never-overstate applies to licence cleanliness too.

---

## §6 — DELIVERABLE 4: THE WORKING PROBE (Tallinn / Kopli, both halves live)

**Not blocked.** Both halves fetched, federated, and stored, on this machine, 2026-09-01.

| | authority | backbone |
|---|---|---|
| source | EE `etak_tuletis:etak_ehr_hooned` (WFS 2.0.0, `ee-etak-ehr-hooned-wfs`) | Overture buildings, release **2026-07-22.0** |
| access | adopted from the E1d adapter | adopted from `tools/context-bake/bake.mjs` **§BAKE-OVERTURE** (anonymous S3 + DuckDB bbox pushdown) |
| CRS | EPSG:3301 native | reprojected to EPSG:3301 in the fetch (`always_xy`) |
| rows | **1087** (all Polygon) | **1185** (all Polygon), 100.4 s |

**No bulk mirroring** (access-vs-ownership option 1/2): one bbox-pushdown read of a pinned
release, ~1 km², nothing persisted in the repo. DuckDB was installed **into a scratch dir**,
not into the repo — no dependency was added to any `package.json`.

**Federation result** (`fed-probe-transcript.txt`):

```
authorityCount 1087 · backboneCount 1185 → 1257 federated buildings
matchedViaBridge 0 · matchedViaGers 0 · matchedViaIou 1007
deduped 1007 · authorityOnly 80 · backboneOnly 170 · undecidable (quarantined) 8
heightsFilledFromBackbone 7 · floorsFilledFromBackbone 12 · gersConflicts 0
geometryComparisons 2797 of 1,288,095 possible pairs (0.22%) · 169–212 ms
```

Reading it honestly:

- **`matchedViaGers 0` is the expected answer, not a failure.** The EE layer carries no GERS
  id, so the GERS arm can never fire on this AOI — which is exactly why `FEDERATION_
  CONFLATION_STRATEGY` lists EE as `geometric`. The key is typed and exercised by the suite;
  its *pairing* arm is not exercisable against an unbridged national source. Saying otherwise
  would be the "verified ≠ dispatched" error.
- **The weld-split is visible at scale.** The per-attribute census shows 12 records with
  `shape=EE height=EE/SURVEYED floors=OVERTURE/STATED` and 7 with
  `shape=EE height=OVERTURE/MODELLED` — one record, three different provenances, which is
  precisely the refactor blocker the internal review flagged, now discharged.
- **8 quarantined** pairs, all `unresolved-topology` from the clipper. They are reported, not
  merged and not minted — the honest outcome for a comparison that refused.
- **The ODbL boundary at scale:** ODbL store accepts 1257/1257; the non-ODbL store accepts
  **80** and **refuses 1177**, each by name.

---

## §7 — OPEN QUESTIONS (recorded for the founder / later lanes — control 10, not expanded here)

1. **Does a bare GERS id encumber a record under ODbL?** The module assumes YES
   (conservative). If NO, ~1177 of 1257 probe records become mergeable into a non-ODbL store
   and the constraint's practical cost collapses. *Legal question, not an engineering one.*
2. **GERS bridge-files licence** — the page states none. Until it is answered, ES stays
   `bridge-file / blocked-licence` and the ES partition's existence is unprobed (§D1 gap 1).
3. **GHS-OBAT id space** — GERS or an internal key? One row inspection closes it (§D6).
4. **The frozen `BuildingHeightMethod` has no DECLARED/REGISTER member.** Estonia serves two
   different height claims — `korgus_m` (ALS-measured → SURVEYED) and `korgus` (an EHR
   *register-declared* attribute). **28 of 1087** probe buildings have *only* the declared
   one. The probe follows the EE provider's existing reading (`MODELLED`) rather than minting
   a rival, but a declared height is not a modelled one. *Recorded for a later canonical
   wave; the model is FROZEN and this lane does not touch it.*
5. **`height.method` is mandatory beside a null `height.value`.** The record therefore reads
   `method: 'MODELLED'` for an UNKNOWN height. Every honest read goes through the value-null
   test, and `federationProvenance` reports `UNKNOWN` — but the honest schema shape would be
   `method: null`. *Same disposition as 4: recorded, not acted on.*
6. **The IoU threshold 0.5 is documented, not calibrated.** The probe now supplies a real
   corpus for a calibration lane (1007 matches at that threshold).
7. **Source Registry rows for the pan-EU sources** (Overture, EUBUCCO, GHS-OBAT) — three
   `registryGapReason`s are waiting on the registry lane's country framing.

---

## §8 — WHAT THIS LANE DELIBERATELY DID NOT DO

- **No canonical-model change.** Zero edits under `packages/schemas/`. Every federated record
  is asserted against `SiteIntelBuildingSchema` in the suite (control 3, proven not claimed).
- **No second registry, no second provenance system** (control 6): a reference and a
  projection, never a copy.
- **No rival solver.** The clipper, the areas, the ring bounds and the disjointness proof are
  all adopted; each is named in the header with the grep that found it. The one *type-level*
  stretch — `ringBounds` takes `Pt = {x, z}` meaning scene-XZ, used here for native-CRS
  metres — is named in the header rather than hidden behind a duplicate.
- **No MS GlobalML.** Recorded as an excluded row; structurally refused as an input.
- **No bulk mirroring, no dependency added, no gate touched, no ceiling raised, no
  gate-debt entry, nothing committed.**

---

## §9 — VERIFICATION RECORD (all foreground)

| check | result |
|---|---|
| `npx vitest run __tests__/buildingsFederation.test.ts --root packages/site-parcel-data` | **31 passed (31)** |
| `pnpm --filter @pryzm/site-parcel-data test` | **161 files / 3325 tests passed · RC=0** |
| `pnpm --filter @pryzm/site-parcel-data typecheck` | **RC=0** |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` | **RC=0**, 0 error lines |
| root-tsc **coverage control** (deliberate error) | **RC=2**, error reported *in* `buildingsFederation/conflate.ts` → the green run is evidence about these files |
| `npx tsx tools/ga-gate/check-otel-spans.ts` | **RC=0** (Zone A 274/274; Zone B 52/52 baseline; this package is in neither gated zone) |
| `npx tsx tools/ga-gate/check-layer-boundaries.ts` | **RC=0** — within baselines (violations 48/102, unclassified 13/13, sdk-bypass 156/182) |
| falsification F1–F4 + control | each **seen failing**, each restored **byte-identical** (sha256 in `fed-falsification-transcript.txt`) |

⚠ **Shared-tree caveat.** Other lanes (DK corrections, LT, PL) landed files in this working
tree *during* this run. The whole-package suite (3325 tests) and the root `tsc` were both
green at the moment they were run; the 31-test federation suite was re-run green afterwards,
in the tree's final state. `packages/site-parcel-data/src/index.ts` carries this lane's
barrel hunk **and** the DK lane's, side by side, with no collision. No `package.json` and no
lockfile was touched by this lane.

Final artefact hashes (sha256):

```
cae1824817e48c4021ae1106251532d03c00b719ae15e94e797fe6a518fc8496  src/buildingsFederation/conflate.ts
9424397e3ab3a8baa0813fcb87fb5ea2b6f0e2889e00569caf95227e0ca879f5  src/buildingsFederation/gersId.ts
0f900decfc9d29a73243a45acef53eacc95ccaf1bb58bda00211fa2401d78356  src/buildingsFederation/index.ts
13496b395344f99b5cde09a4a915565df722b26a8c9ea3cf91751873d2c9d50e  src/buildingsFederation/odblStore.ts
7f55a195d0b51b3f23e8dcc6afd8b86bbc2c91f8dcf7497ecc1acbb294d518cf  src/buildingsFederation/sourcePriority.ts
dedbf74ab7b886f5e2a14bb52c6383cd3f4758afd41a62a099c79d5fc700b8fc  __tests__/buildingsFederation.test.ts
81a65a612c1d8762ae37b9d80119d1d20ef403d78ae9bddc56cc20d8ef0acd33  fed-probe-tallinn.mts
```

`fed-probe-tallinn.mts` is a **temporary harness** (the `ee-chain-probe.mts` convention): it
lives in the package dir only for module resolution and is not part of the module. Delete it
or keep it deliberately — but it is the only thing that reproduces §6.
