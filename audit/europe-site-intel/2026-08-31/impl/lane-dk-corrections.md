# LANE DK — THE DENMARK CORRECTIONS (E1 verdict §G DK-parallel · plan E6)

Executed 2026-09-01 against the FROZEN R-batch model. One coherent change-set, UNCOMMITTED per
the lane brief. Every number below was measured by this lane, keyless and anonymous, on
2026-09-01; transcripts are in `lane-dk-transcripts/`.

---

## 0 — THE HEADLINE (read this even if you read nothing else)

**The shipped C58 Danish path was computing a per-parcel FAR from a percentage whose
denominator is not the parcel, for roughly three quarters of Danish plans, and a committed
test asserted the wrong number on a REAL probed plan.**

Measured nationally 2026-09-01 (keyless WFS `resulttype=hits`, `lane-dk-transcripts/2026-09-01-bebygpctaf-national-fill.txt`):

| layer | total | `bebygpct` populated | `bebygpctaf` ALSO served | **parcel-scoped (codes 3+4)** | non-parcel (codes 1+2) |
|---|---|---|---|---|---|
| `lokalplan_vedtaget` | 37,991 | 11,616 (30.6 %) | 11,595 (**99.8 %**) | 1,765 (**15.2 %**) | 9,830 |
| `lokalplandelomraade_vedtaget` | 66,276 | 28,557 (43.1 %) | 28,550 (**100.0 %**) | 4,438 (**15.5 %**) | 24,112 |
| `kommuneplanramme_vedtaget_v` | 50,605 | 30,773 (60.8 %) | 30,773 (**100.0 %**) | 8,661 (**28.1 %**) | 22,112 |

Two consequences, both load-bearing:

1. **The denominator is served, essentially always.** `bebygpctaf` accompanies a populated
   `bebygpct` on 99.8–100 % of features. Withholding a FAR when the code is ABSENT costs
   **28 features nationally**, not coverage. There is no honesty-vs-coverage trade here.
2. **The denominator is usually NOT the parcel.** 72–85 % of populated `bebygpct` values are
   code 1 ("Området som helhed" — the plan area as a whole) or code 2 ("Den enkelte ejendom" —
   the property, which may span several matrikler). `mapPlandataToZoningRecord` divided every
   one of them by 100 and called it `plotRatioFAR`, which `farLimitedHeight.ts` then multiplies
   by the **parcel** area.

The register itself confirms the reading in prose on the very feature the lane uses as its
Aarhus baseline — `kommuneplanramme` 010109CY carries `notbebygom`: *"Den maksimale
bebyggelsesprocent beregnes for arealet mellem Rosensgade og Domkirkepladsen under ét"* ("the
maximum building percentage is computed for the area between Rosensgade and Domkirkepladsen as
a whole"). Independent of the codelist, same answer.

**This was not a new invention.** `packages/site-parcel-data/src/rulepacks/dkPlandataEnvelope.ts`
has carried the founder-signed branch since **L-449 (2026-07-30)** — "FAR is stated ONLY at
parcel scope", with typed `DkFarWithheldReason`s — and says in its own header why it was
dormant: *"⚠ PROBE-DON'T-ASSUME: the ingestion does not YET emit a scope attribute (the current
mapper reads only `bebygpct`), so the exact WFS field name must be confirmed at wiring time
against the DescribeFeatureType."* **This lane is that wiring.** The field is `bebygpctaf`.

---

## 1 — INHERITED STATE: what was VERIFIED, CORRECTED, DISCARDED

A previous generation of this lane was killed mid-flight and left uncommitted work in the tree.
It was read as a draft by a stranger and every claim re-probed.

### VERIFIED (kept as-is — independently re-measured, live, today)

| Inherited artefact | How it was verified |
|---|---|
| `dkPlandataClient.ts` endpoint pin `https://geoserver.plandata.dk/geoserver/wfs`, **keyless** | Re-probed anonymously 2026-09-01, no token/registration/auth header. Also `grep`-confirmed identical to the wired proxy's `PLANDATA_WFS_ENDPOINT` (`server/jurisdiction/plandataZoningProxy.js:50`) and to `sourceRegistry/dk.ts`. |
| The **axis-order hedge** ("lat,lon returns 0 SILENTLY") | Re-measured on BOTH baseline points and on every hit layer: `lon,lat` → features, `lat,lon` → HTTP 200 with `features: []`. Reproduced 3/3. |
| The `ows:ExceptionReport` failure shape | Re-probed with a bogus layer name → **HTTP 400** + `ows:ExceptionReport`. Classified `transient`, never `absent`. |
| DAWA keyless parcel leg + its field shapes | Re-probed both points: matr. 4801 / ejerlav 2000173 / kommune 0101 / **BFE 6021259** / `registreretareal` **3776** / `vejareal` 0; matr. 7000ad / ejerlav 2006351 / kommune 0751 / **BFE 5625716** / **8293** / `vejareal` **8293** (road parcel, as the 20-parcel table records). |
| Every fixture in `dkCorrections.test.ts` | Field-by-field against the live features. CPH ramme R24.B.3.40 `bebygpct=150 bebygpctaf=4 maxbygnhjd=24 maxetager=null planstatus=V datovedt=datoikraft=20241212`; Aarhus ramme 010109CY `bebygpct=180 bebygpctaf=1 maxetager=4 datovedt=20251217 datoikraft=20260119`; Aarhus lokalplan 591 all-dimensional-nulls with `kompleks=false` SERVED. **All match.** |
| The `bygberegnaf` codelist (4 codes) | Re-fetched `pdk:theme_pdk_codelist_bygberegnaf_v` — exactly 4 rows. |
| The 4-layer ladder ORDER | Matches lane 2 §DK-1's measured precedence and the wired proxy's `PLANDATA_LAYERS`. |
| R1 rank / R3 validityBasis / R5 normativeForce / tier-6 UNKNOWN emission | Executed; see §3. |

### CORRECTED (the draft was wrong, or unfinished, in four ways)

1. **It broke 8 committed tests and never ran them.** `dkZoningProvider.test.ts` went
   `8 failed | 21 passed`. The failures were the *correct* behaviour meeting assertions that
   encoded the defect — but the draft shipped without knowing that, which is the difference
   between a fix and a hazard. Corrected: the eight assertions now pin the signed mapping
   (§2), **fixtures untouched**.
2. **It built a RIVAL of the L-449 signed resolver.** The draft re-derived the withhold branch
   inline in `mapPlandataToZoningRecord.ts` (hand-rolled overlay strings, its own arithmetic)
   while `resolveDkPlanEnvelope` sat two directories away with the same branch, typed reasons
   and a founder signature. Corrected: **the mapper now delegates.** Its twin
   `posNumberOrNull` is deleted, so "what counts as no number" is decided once.
3. **It minted a SECOND source-registry row for one source id.** `dkSources.ts` defined
   `id: 'dk-plandata-wfs'` with its own dataset text and probe log, while
   `sourceRegistry/dk.ts` already defined that id — one of the two unreachable through
   `SOURCE_REGISTRY`. Corrected: the adapter now **resolves** registry rows (object identity,
   asserted), mints nothing, and carries a **module-load endpoint drift guard**. A
   registry-wide duplicate-id arm was added to `sourceRegistry.test.ts`.
4. **It dropped a served qualifier whenever the value was UNKNOWN.** `valueBasis` was emitted
   only when `bebygpct` had a number. Measured: **261 features nationally** serve `bebygpctaf`
   with a NULL `bebygpct` (21 lokalplan · 234 delområde · 6 ramme). Corrected: the qualifier is
   emitted whenever the register serves it, tier-6 rows included (E4 control 8), and the alien-
   code refusal now fires regardless of whether the percentage is known.

### DISCARDED

Nothing was discarded wholesale. The one deletion is the draft's inline FAR branch and its
duplicated `posNumberOrNull` — both replaced by delegation to the signed resolver, not removed
in substance.

---

## 2 — DELIVERABLE 1: the keyless Plandata re-pin

- **Endpoints (both keyless, both re-probed live 2026-09-01):**
  `https://geoserver.plandata.dk/geoserver/wfs` (WFS 2.0.0) and
  `https://api.dataforsyningen.dk/jordstykker` (REST). No key, no token, no auth header on any
  request in `lane-dk-transcripts/2026-09-01-endpoint-reprobe.txt`.
- **The correction stands:** the tracker row calling Denmark "Keyed — the template for every
  keyed source" is half-stale. Only Datafordeler (BBR / Matriklen / GeoDanmark / DHM) is gated,
  and none of it is on this adapter's critical path.
- **FetchOutcome end-to-end (C57 §1.5)** — `found` / `absent` / `transient` are three values.
  A clean zero on one bbox axis order retries the swap **before** concluding `absent`, because a
  wrong axis order returns zero silently; an `ExceptionReport` is a transient carrying the
  server's own text, never "no data here".
- **Source rows** live in `sourceRegistry/dk.ts` (DK 3 → 4 rows: `dk-dawa-jordstykker` seeded,
  the 2026-09-01 probe appended to `dk-plandata-wfs`). The adapter resolves them and asserts
  the registry endpoint equals the client's pin at module load — so "the registry says what we
  actually GET" is executable, not a comment.

## 3 — DELIVERABLE 2: THE DENOMINATOR BRANCH

**Producer side** (`dkRuleMapper.ts`): every `bebygpct` rule carries the SERVED code verbatim as
R2 `valueBasis: {scheme: 'dk-bygberegnaf', code: '1'|'2'|'3'|'4'}`. A code outside the closed
state codelist **throws by name** — a national schema change is never absorbed. When the
register serves no code, no `valueBasis` is emitted and the note names the gap.

**Consumer side, two of them, one doctrine:**

| consumer | af=4 (jordstykke) | af=1 (området som helhed) | af=2 (ejendom) | code absent | alien code |
|---|---|---|---|---|---|
| `deriveDkGfaFromBebygpctRule` (SiteIntel rules) | **computes** GFA | refused `basis-planning-area` | refused `basis-property` | refused `basis-not-served` | refused `basis-foreign-scheme` |
| `mapPlandataToZoningRecord` → `resolveDkPlanEnvelope` (C58) | **emits** `plotRatioFAR` | withheld `scope-planning-area` | withheld `scope-property` | withheld `scope-unknown` | withheld `scope-unknown`, code named |

Every refusal NAMES the basis; the percentage is never dropped — it rides on as an overlay fact
(C58) or as the rule's own `value` + `valueBasis` (SiteIntel). Height and storey caps are
scope-independent and always pass through.

**Executed on the two baseline parcels, live** (`lane-dk-transcripts/2026-09-01-chain-executed-live.txt`):

```
DK-A  matr. 4801 / BFE 6021259, registreretArealM2=3776
  [rank 4] kommuneplanramme R24.B.3.40  bebygpct=150 valueBasis={dk-bygberegnaf:4}
      >>> GFA CONSUMER: COMPUTED gfaM2=5664
          GFA = 150 % × 3776 m² = 5664 m² — valid because bebygpctaf=4 is parcel-scoped (L-449)

DK-B  matr. 7000ad / BFE 5625716, registreretArealM2=8293
  [rank 4] kommuneplanramme 010109CY   bebygpct=180 valueBasis={dk-bygberegnaf:1}
      >>> GFA CONSUMER: REFUSED reason=basis-planning-area
          ... NOT the individual parcel; a per-parcel multiply would state a wrong GFA
          [control] the naive per-parcel multiply would have said 14927.4 m2
                    - that number is produced NOWHERE
```

The wrong-number path is **structurally dead**, not merely untaken: a refusal outcome has no
`gfaM2` field, and the test asserts the string `14927` appears nowhere in the serialised
outcome.

## 4 — DELIVERABLE 3: the 4-layer precedence ladder as R1 rank

Every mapped rule carries `rank: {scheme: 'dk-plan-ladder', level}` —
**byggefelt 1 → lokalplandelomraade 2 → lokalplan 3 → kommuneplanramme 4** (lane 2 §DK-1's
measured precedence, 1 = most specific). Rung **5** (the BR18 §168–186 statutory defaults where
every layer is silent) is recorded on `DK_APPLICABILITY_LADDER` as data and is deliberately NOT
minted as a fake WFS layer.

**Resolution stays engine-side** (verdict §F.7). Nothing in this lane resolves precedence: the
existing `evaluateZoneParameter` (E1bc, committed) picks min level on one scheme, NAMES the
outranked rule in `rankRejected`, and refuses ties — exercised by a mapper-emitted delområde
(level 2) vs whole-plan (level 3) pair, `185` winning and `level 3 loses to level 2` printed.

The chain exposes **all four rungs including the ABSENT ones** rather than picking a winner:

```
[rank 1] byggefelt            ABSENT - no-feature: ... (both bbox axis orders)
[rank 2] lokalplandelomraade  ABSENT - no-feature: ... (both bbox axis orders)
[rank 3] lokalplan            FOUND plan=dk-plan-1213157 ...
[rank 4] kommuneplanramme     FOUND plan=dk-plan-11714778 ...
```

## 5 — DELIVERABLE 4: lifecycle + kompleks mirrored verbatim

- `Plan.status` mirrors the served token — **`"V"`**, verbatim, never harmonised to "adopted"
  (lokalplan-family features serve `status`, rammer serve `planstatus`; both read).
- `datovedt` / `datoikraft` (YYYYMMDD integers) → `adoptedDate` / `inForceFrom` by deterministic
  format conversion; malformed → null, never a guessed date. R3 `validityBasis: 'legal'` follows
  from the register serving a machine date axis.
- `kompleks` is mirrored **where served** — the live Aarhus lokalplan 591 serves `false` and gets
  a rule; the CPH ramme does not serve the field and gets none. **A served `false` is not an
  absence.**
- A byggefelt's served `bygvejledende` mirrors into R5 `normativeForce: 'bygvejledende'` —
  authoritative-but-indicative, encoded without touching the tiers.

## 6 — tier-6 UNKNOWN rows are VISIBLE (the brief's explicit requirement)

DK numeric fill is **30–61 % by layer, not ~96 %**. An attribute the layer's DECLARED schema
carries but the feature does not fill becomes `value: null` at confidence **tier 6** —
UNKNOWN ≠ 0 ≠ no-limit. Keyed off the declared vocabulary, not the served bag, so a GeoServer
that omits null keys cannot silently drop the row. Field ABSENCE is different: `byggefelt`
declares no `bebygpct` at all, so it emits no `bebygpct` rule rather than an UNKNOWN one.

Live Aarhus lokalplan 591 produced exactly three tier-6 rows (`bebygpct`, `maxbygnhjd`,
`maxetager`) beside one tier-1 `kompleks=false`; the CPH ramme produced a tier-6 `maxetager`
beside two tier-1 rows. Both visible in the executed transcript.

---

## 7 — Falsification (sever → named failing test → byte-identical restore)

Full transcript: `lane-dk-transcripts/2026-09-01-falsification.txt`. No `git stash` was used at
any point (the stash stack is global across worktrees); backups are in-memory and every restore
is verified by re-hashing the file. Control before: `Tests 63 passed (63)`. Control after all
restores: `Tests 63 passed (63)`.

| # | Sever | Named failure observed |
|---|---|---|
| 1 | axis hedge removed (only `lon,lat` tried) | `× AXIS HEDGE (measured): zero on lon,lat retries lat,lon before concluding absent` |
| 2 | 200-body `ExceptionReport` no longer classified | `× an ows:ExceptionReport (wrong layer) is a SELF-NAMING transient, never "no data"` |
| 3 | client re-pinned to a stale host | module-load throw: `[dk-adapter] endpoint drift on 'dk-plandata-wfs': registry says … the client pins …` |
| 4 | `valueBasis` never emitted | `× Noerrebro ramme: bebygpct rule carries valueBasis {dk-bygberegnaf, "4"} VERBATIM` (+5) |
| 5 | GFA consumer stops branching on the basis | `× THE AARHUS af=1 CASE …: REFUSED naming the basis — no number exists` (+2) |
| 6 | C58 mapper assumes parcel scope again (the pre-lane state) | `× THE AARHUS af=1 CASE: the wrong-number path is DEAD — FAR withheld NAMING the basis` (+11 across both files) |
| 7 | `rank` no longer emitted | `× every rule of every layer carries R1 rank {dk-plan-ladder, <rung>}` (+2) |
| 8 | ladder order inverted (ramme made most-specific) | `× every rule of every layer carries R1 rank …` (+1) |
| 9 | lifecycle harmonised (`"V"` → `"adopted"`) | `× lifecycle mirrored VERBATIM (deliverable 4): status "V", datovedt/datoikraft typed` |
| 10 | `kompleks` flag dropped | `× kompleks mirrored VERBATIM where served — false is a served value, not an absence` |
| 11 | UNKNOWN rows dropped instead of emitted at tier 6 | `× tier-6 UNKNOWN rows are VISIBLE, never dropped (fill is 30–61% by layer, not ~96%)` (+1) |

Sever 6 is the one that matters most: it restores the exact pre-lane behaviour and **twelve**
tests across two files name it.

## 8 — Verification transcripts (foreground, RC captured directly)

| Check | Result |
|---|---|
| `npx vitest run` (whole `@pryzm/site-parcel-data` suite) | `Test Files 161 passed (161)` · `Tests 3325 passed (3325)` |
| `npx vitest run __tests__/dkCorrections.test.ts` | `Tests 33 passed (33)` |
| `npx vitest run __tests__/dkZoningProvider.test.ts` | `Tests 30 passed (30)` (was `8 failed \| 21 passed` on the inherited draft) |
| `npx vitest run __tests__/sourceRegistry.test.ts` | `Tests 11 passed (11)` |
| `npx tsc -p tsconfig.json --noEmit` (package) | `PKG_TSC_RC=0` |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` (root) | `TSC_RC=0` |
| `npx tsx tools/ga-gate/check-otel-spans.ts` | `OTEL_RC=0` — Zone A 274/274, Zone B 52/52 baseline. No ceiling raised. |

No ceiling raised · no gate disabled · no `gate-debt.json` entry · no rival built · nothing
committed.

---

## 9 — DISCOVERIES RECORDED, NOT BUILT (E4 control 10)

1. **`vocabularies/dk.ts` code 1 label is a transliteration, not the register's string.** The
   L0 codelist carries `'Omraadet som helhed'`; the register serves **`'Området som helhed'`**
   (probed 2026-09-01, `2026-09-01-codelist-bygberegnaf.json`). Codes 2/3/4 match exactly. The
   file's own header admits the aa-transliteration came from the audit transcript, so this is a
   known-shape defect, not a surprise. **NOT corrected here**: the file is L0 in the frozen
   R-batch and a committed R-batch test (`packages/schemas/__tests__/siteintel.test.ts:197`)
   asserts the aa spelling — correcting it is a two-file change inside another lane's frozen
   surface. **Impact is presentational only**: every consumer in this lane branches on the
   CODE, never the label, and every refusal string also prints `bebygpctaf=<code>`. Owed to
   whichever lane next opens `vocabularies/dk.ts`.
2. **Code 2 ("den enkelte ejendom") is recoverable, and the prize is large.** ~33–46 % of
   populated `bebygpct` values are code 2, and PRYZM already holds the **BFE number** from the
   keyless DAWA response. `api.dataforsyningen.dk/jordstykker?bfenummer=<BFE>` enumerates the
   jordstykker of one ejendom, so the ejendom area is a keyless sum — and where a BFE has
   exactly one jordstykke the ejendom IS the parcel. That would turn a refusal into a computed
   number for a large share of Denmark. **Not built**: it needs a per-parcel fetch inside what
   is today a pure function, and the C58 `EnvelopeNumbers` schema has no seat for the basis.
   Its own lane.
3. **`eareal` is a served absolute GFA cap.** The Aarhus ramme serves `eareal=16800` (with
   `earealh=1`) alongside `bebygpct=180`. `eareal1..10` exist per sub-area on every layer, and
   `byggefelt` carries `eareal` too. It is an m² number, not a ratio, so it does not need the
   denominator branch — but it is NOT in this lane's approved three-attribute vocabulary
   (`bebygpct`/`maxbygnhjd`/`maxetager`) and was not added. Note that the Aarhus `eareal` is
   scoped to the ramme area as a whole and so does **not** rescue the af=1 refusal.
4. **`m3_m2` (volume/area) and `boligenhed`/`maxboligenhed` (dwelling-unit caps)** are served
   and unmapped. Same disposition.
5. **261 features nationally serve `bebygpctaf` with a NULL `bebygpct`** (21 / 234 / 6 by
   layer). Handled (the qualifier now survives the UNKNOWN), recorded because it is the kind of
   asymmetry a fill-rate table hides.
6. **28 features nationally publish a `bebygpct` with NO `bebygpctaf`.** These now map to a
   withheld FAR, and where the plan publishes nothing else the record maps to `null` and the
   caller takes the §DK-HONEST-REFUSAL path. Quantified so nobody mistakes the branch for a
   coverage cliff.
7. **The `_forslag` / `_aflyst` / `_med_historik` lifecycle variants are not queried.** This
   adapter reads `_vedtaget` only. Plan history is first-class at the source and is a real
   capability (BRIEF §15 versioning) — a later lane's, not this one's.

## 10 — Files in this change-set

**New (untracked):**
- `packages/site-parcel-data/src/countryAdapters/dk/` — `dkPlandataClient.ts` (endpoints + axis
  hedge + FetchOutcome + ladder table), `dkParcelProvider.ts` (DAWA), `dkRuleMapper.ts` (R1/R2/
  R3/R5 + lifecycle + kompleks + tier-6), `dkGfa.ts` (the GFA consumer branch), `dkSources.ts`
  (registry resolution + drift guard), `index.ts` (chain assembly).
- `packages/site-parcel-data/__tests__/dkCorrections.test.ts` — 33 tests.
- `audit/europe-site-intel/2026-08-31/impl/lane-dk-transcripts/` — probe, fill, codelist,
  executed-chain and falsification transcripts.

**Modified (committed files):**
- `src/providers/mapPlandataToZoningRecord.ts` — delegates to the L-449 signed resolver; the
  twin `posNumberOrNull` deleted; withhold overlay names the served basis.
- `src/rulepacks/dkPlandataEnvelope.ts` — `dkDensityScopeFromBygberegnaf` (the SERVED code →
  the signed scope) added beside `parseDkDensityScope`; the stale twin-coercion comment fixed.
- `src/sourceRegistry/dk.ts` — DAWA row seeded; 2026-09-01 probe appended to the Plandata row.
- `src/index.ts` — one export added (`dkDensityScopeFromBygberegnaf`).
- `__tests__/dkZoningProvider.test.ts` — eight assertions moved onto the signed mapping,
  fixtures untouched, plus one new refusal arm.
- `__tests__/sourceRegistry.test.ts` — census DK 3→4 / 35→36, plus a duplicate-source-id arm.

`countryAdapters/dk/` is **not** exported from the package barrel — deliberately, mirroring the
committed EE adapter, whose only barrel seam is its source rows through `sourceRegistry/index.ts`.
The DK equivalent of that seam exists (the registry rows). Wiring the adapter into a runtime
dispatch path is not this lane's approved scope.

## 11 — Next gate

No blockers. The two baseline parcels of the 20-parcel table run DIRECT end-to-end, keyless,
live: parcel → four ladder rungs → typed rules → the right GFA or a refusal naming the basis.
The largest open DK item is discovery 2 (the BFE-area path for code 2), which is worth more
coverage than every other DK item combined.
