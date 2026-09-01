# LANE E1d — THE ESTONIA ADAPTER REWORK (gate decision §F item 2 · verdict §G item 2) — LANDED

Executed 2026-09-01, uncommitted per the lane brief. The draft SURVIVED (clean §9 bill) and was
REWORKED, not rewritten — every file keeps its structure; the five named items landed in place.
All changes under `packages/site-parcel-data/src/countryAdapters/ee/` + one new test file +
one fixture file + the probe harness update.

## The five reworks, verdict wording → implementation

### 1 · Mint the Prescription each rule's basis cites (the R1 referent contract)

`eeRuleMapper.ts` now MINTS what it cites and cites ONLY what it minted, through one seat
(`mintApplicabilityTarget`, the referent ladder):

1. plan-register row resolved (with `planseis_nimi`) + drawn geometry → mint
   `SiteIntelPlan` (`ee-plan-<sysid>`, kind `detailplaneering`, status mirrored verbatim,
   `adoptedDate` = kehtestkp) **and** `SiteIntelPrescription` — hoonestusala → kind
   **`buildingField`** (KNOWN_PRESCRIPTION_KINDS), krunt → open kind **`plannedPlot`**
   (verdict §F.2 names krunt as covered via Prescription/Zone; §E LATER queues the token;
   the kind list is open by REPORT §I's own "…") — typology `{scheme:'ee-plank-layer',
   code:'dp_hoonestus'|'dp_krunt'}`, geometry = the served ring in native EPSG:3301,
   `zoneOrPlanRef` → the minted Plan (the SECOND hop is not dangling either);
   rules' `basis = [{kind:'prescription', ref}]`.
2. plan minted, no drawn geometry → `basis = [{kind:'plan', ref}]`.
3. plan NOT resolvable, geometry served → R1's residual INLINE-geometry leg (a half-known
   planning object is not minted — `SiteIntelPrescription.zoneOrPlanRef` is required and
   `Plan.status` is required-mirrored, so the schema itself forbids a half-mint).
4. neither → the mapper THROWS by name (caught by the chain → `transient` naming the
   feature; never a silent drop).

The chain result CARRIES the minted entities (`EeResolvedBuildingArea.planEntity/
.prescription`, new `EeResolvedPlot` leg) so referent resolution needs no out-of-band
registry. Mapper signatures changed: `mapEeHoonestusToRules`/`mapEeKruntToRules` now return
`EeMappedRuleSet { plan, prescription, rules }` (consumers: chain + probe + tests only,
grep-verified). The old dangling `dp_hoonestus:<objectid>` strings appear NOWHERE
(test-asserted on the serialized rules; the pre-R1 `geometryRef` leg name is gone too).

### 2 · `validityBasis: 'ingestion'` replaces the note apology (R3)

`eeValidity()` (replacing `validityNote()` at the old eeRuleMapper.ts:131–141): register row
with well-formed `kehtestkp` → `{validityBasis:'legal', valid_from: kehtestkp}`; else
`{validityBasis:'ingestion', valid_from: fetch date}`. The prose apology ("valid_from is the
FETCH date … never read this as the legal adoption date") is DELETED in both arms —
test-asserted absent. A malformed/missing adoption date on a resolved row also lands
`'ingestion'` (never a fabricated legal date).

### 3 · Per-use-slot encoding → R1 `useScope[]`

dp_krunt "; "-joined per-use columns are slot-aligned with `otstarve` (measured live:
otstarve `"ärimaa; elamumaa"` beside maxsoosak `"; 85"` and minsoosak `"15; "`). Each per-slot
rule now carries the verbatim national use token typed: `useScope: ['elamumaa']` on the
85° max-pitch rule, `['ärimaa']` on the 15° min-pitch rule. The `-slot2` id suffix is GONE —
ids stay unique via the verbatim token (`…-maxRoofPitch-elamumaa`), positional fallback only
when the use column serves no token. Hoonestus rules carry `useScope: []` (not
use-conditioned). No harmonisation anywhere (§F.4 of the do-not-add list honoured).

### 4 · `ringCentroid` replaced — and the grep-first branch came up EMPTY

Per the brief, core was grepped FIRST: `polylabel | pole-of-inaccessibility | pointOnSurface |
interior point | representative point` across packages/plugins/src/apps → **no point-on-surface
solver exists in core geometry** (geometry-kernel has the canonical point-in-polygon predicate
§C73-PIP-CANONICAL, but no representative-point util). So the supplement §9 flag 1 ALTERNATIVE
branch applies — query the plan layers by the parcel ring — and it was UPGRADED from bbox to
exact server-side intersection after probing both:

- **PLANK ring-bbox (probed): OVER-COVERS** — 6 dp_hoonestus features from 3 different plans
  at Kopli tn 2.
- **PLANK OGC Filter `Intersects` over `msGeometry`** (geometry column MEASURED via
  DescribeFeatureType) **with gml posList in NATIVE (N E) order: exactly the parcel's 2
  hoonestusalas.** The (E N) control returned **0 features SILENTLY** — the axis trap holds
  for the Filter arm.
- **GeoServer CQL `INTERSECTS(shape, POLYGON((N E,…)))`** on the buildings layer: the
  parcel's 3 buildings (incl. etak 9368512 / ehr 121395845, the baseline conflation row);
  (E N) control: **0 silently**.

New: `buildPlankIntersectsRingUrl` / `buildGeoserverIntersectsRingUrl` (eeWfsClient),
`resolveEeHoonestusForRing` / `resolveEeKruntForRing` (eePlanProvider),
`resolveEeBuildingsIntersectingRing` (eeBuildingsProvider). `ringCentroid` is DELETED —
the adapter now contains NO geometry math at all (the vertex-mean's concave-parcel
wrong-neighbour risk and the double computation are both gone). `EeKruntFeature` gained
`ring`/`crs` (the krunt Polygon is served; needed for the plannedPlot Prescription).
Point-based resolvers kept for the registry click path.

### 5 · `fetchChain` signature — seam DOCUMENTED, refused to guess

Measured 2026-09-01: NO `CountryAdapter`/`fetchChain` type exists outside this directory and
NO E1bc findings file exists yet in `audit/europe-site-intel/2026-08-31/impl/` — the E1bc SDK
type is NOT YET STABLE. Per the lane brief's own instruction ("if the type is not yet stable,
document the seam and refuse rather than guess"), `ee/index.ts` now carries
**§SEAM-E1BC-FETCHCHAIN**: the §J sketch (`rules.fetch(parcel): FetchOutcome<Rule[]>`) vs the
served `fetchChain(tunnus, deps?, nowIso?): FetchOutcome<EeParcelChain>` difference is stated
(richer: carries the R1 minted referents; keyed by national id), with the reconciliation rule
"when the E1bc SDK type lands, reconcile HERE (rename/wrap), never by editing core to match an
adapter" (L-7060 shape, supplement §9 flag 3).

## Forced consequence of the frozen R-batch (not one of the five, not improvised)

The `tingimus` prose rule moved **tier 1 → tier 2**: the R-batch's frozen tier-projection
superRefine (`provenance.ts`) REJECTS `tier 1 + valueLocation 'in-document-text'` at parse
("a value living only in rule prose is tier 2 territory"). Tier 2 is the projection's seat for
authoritative-document-derived; `valueLocation`/`derivation` unchanged. Also per R1: `rank:
null` on every EE rule — PLANK serves no per-rule rank axis; the EE instrument ladder stays
adapter DATA (`EE_APPLICABILITY_LADDER`), resolution engine-side (§F.7).

## PROOF — the two named parcels, END-TO-END LIVE (2026-09-01, real services)

**78401:101:7194 Kopli tn 2** (`npx tsx ee-chain-probe.mts "78401:101:7194"`, live):
- Parcel DIRECT: `Kopli tn 2 | Tallinn | ELAMUMAA 80/ARIMAA 20 | 1670 m² | EPSG:3301 | ring 20 pts`.
- Buildings via ring-intersects: 3, incl. `etak 9368512/ehr 121395845 floors 5 hReg 17.4` —
  built-to-permit, matching the plan's korgus 17.4.
- Building area 5d9d1: `MINTED plan ee-plan-30100071 | MINTED prescription
  ee-prescription-dp_hoonestus-5d9d1 kind=buildingField → ee-plan-30100071 | 15 rules`; every
  rule `legal from 2025-07-03`; **typed-fields-only**: `maxGrossFloorArea = 3500 m2 | tier 1
  DIRECT attribute` (the served-GFA number, no note needed), maxHeight 17.4, korgusabs 32.64,
  FAR 2.1, coverage 61; tingimus verbatim at `tier 2 DIRECT in-document-text`;
  `REFERENTS: … dangling refs: 0`.
- **Tier-6 sibling VISIBLE**: area 5d9be (korgus "0") → `maxHeight = null m | tier 6` beside
  its own tier-1 `maxGrossFloorArea = 1000 m2` — UNKNOWN ≠ 0 ≠ no-limit end-to-end.
- Plot 5d9a3: `MINTED prescription ee-prescription-dp_krunt-5d9a3 kind=plannedPlot`;
  `maxRoofPitch = 85 deg … useScope ["elamumaa"]` · `minRoofPitch = 15 deg … useScope
  ["ärimaa"]`; `dangling refs: 0`.

**78401:101:0109 Raekoja tn 4 // 6** (live):
- Parcel DIRECT: `Raekoja tn 4 // 6 | Tallinn | UHISKONDLIKE_EHITISTE_MAA 100 | 264 m² | ring 18 pts`; 5 buildings.
- `BUILDING-AREAS: absent no-feature: dp_hoonestus intersects parcel ring (18 pts) — absent =
  no valid detail plan IN PLANK at this point; paper-era plans may exist only in municipal
  registers — confirm with the municipality before claiming vacancy (lane 4 EE-1)` — the
  absence leg with the caveat VERBATIM (baseline row 4; the üldplaneering fallback is ladder
  step 3 = the extraction pipeline, not this rework).

**Fixtures** (for the offline suite): `__tests__/fixtures/ee-kopli-raekoja/
recorded-live-2026-09-01.json` — byte-for-byte copies of the live WFS bodies, LABELLED as
fixtures in the file's own `__label__` field, replayed via `EeWfsDeps.fetchImpl`.

## Falsification (sever → named failure → byte-identical restore)

Baseline `eeRuleMapper.ts` sha256 `622ee59e6dd6bb3fec9895de63365240bdbdfde9fde56a5f85b949349f35abc8`.
Sever: the hoonestus mapper returned `prescription: null` while the rules still cited it —
EXACTLY the §B.2 dangling-ref defect. Result (verbatim):

```
× every basis ref resolves to a minted entity CARRIED in the same chain result
× the hoonestusala becomes a minted buildingField Prescription whose plan hop also resolves
Tests  2 failed | 11 passed (13)
```

Restore → sha256 `622ee59e…` re-matched (BYTE-IDENTICAL) → `Tests 13 passed (13)`.

## Verification transcripts (verbatim terminal lines, all FOREGROUND)

- New suite: `Test Files 1 passed (1)` · `Tests 13 passed (13)` (`__tests__/eeAdapterRework.test.ts`).
- Full package: `Test Files 157 passed (157)` · `Tests 3233 passed (3233)` — nothing regressed.
- Root tsc: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → `TSC_RC=0`.
- Package tsc: `npx tsc -p tsconfig.json --noEmit` → RC=0.
- P5: `[domain-purity] ✓ packages/schemas is pure — 0 impurities across 201 files. HARD-FAIL AT ZERO.` RC=0
  (this lane touched NO schema file; run because the session standard demands it whenever the
  schemas tree is dirty — it is, from lane R).

## Hard-rules compliance

No ceiling raised, no gate disabled, no gate-debt entry, no rival built: FetchOutcome / the
attribution layer / LandBasis / C23 / C62 untouched; the canonical point-in-polygon predicate
NOT rivalled (no client-side geometry at all — the state's own servers intersect); no SDK type
minted (seam documented, §SEAM-E1BC-FETCHCHAIN); §F do-not-add list clean (no Applicability
entity, no harmonised use taxonomy — useScope verbatim, no precedence algorithm — rank stays
null/data, no geometry math at L0 or in the adapter). Nothing committed.

## Open seams (named, not hidden)

- `eeWfsClient.ts`'s header cites `impl/E1d-estonia-adapter.md` for the original probe
  transcripts; that file is not on disk (the draft lane never wrote it). THIS file is now the
  transcript authority for the rework probes.
- Very large parcel rings ride in a GET URL; a future 414 from either stack will surface as a
  named `transient` (the FetchOutcome non-OK path), not a silent empty — no POST fallback built.
- The Raekoja üldplaneering fallback (ladder step 3) and the E1bc signature reconciliation
  remain their own lanes, per the gate decision.
