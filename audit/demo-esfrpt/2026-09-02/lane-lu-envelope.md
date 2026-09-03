# Lane LU-ENVELOPE — Luxembourg PAG coefficients compiled into an envelope rule pack

**Date:** 2026-09-03 · **Verdict: BUILT + GATED, and the honest Luxembourg answer is a refusal.**
The COMPILE leg exists (`rulepacks/luPagEnvelope.ts`), it is fed by BOTH served channels (bulk
GPKG row + a newly-discovered LIVE INSPIRE WFS), it is certified-gated SHUT (L-449,
`LU_PAG_CERTIFIED = false`, `signature: null`), and it has a never-overstate arm with proven
teeth. **No LU coefficient binds an envelope, and that is the deliverable, not a shortfall** —
see §2. The engine output for a compiled LU zone is `status: 'none'` (draws nothing), with all
four coefficients travelling as cited facts.

---

## 1 · The live probe (task 1) — the coefficients ARE served live, on the host E7-LU never probed

**Discovery (2026-09-03, all transcripts in `transcripts/lu-envelope/`):**

| probe | result |
|---|---|
| `wms.inspire.geoportail.lu/geoserver/wfs` DescribeFeatureType `lu:LU.SpatialPlan.PAG` | **HTTP 200** — the flattened national PAG layer carries **TYPED coefficient columns**: `cos_max` (xsd:double), `cos_min` (float), `css_max` (double), `cus_max` (double), `cus_min` (float), `dl_max` (float), **`dl_min` (⚠ xsd:short)**, plus `denomination`, `num_cadast`, `xtf_id`, `nom_fichier_ec`, `geom` (`wfs-describe-pag.xml`) |
| GetFeature `cos_max > 0 AND nom_fichier_ec LIKE '026%'` (Ville de Luxembourg = **C026**) | **numberMatched 129** — 129 Luxembourg City NQ-PAP zones with strictly-positive coefficients served live (`wfs-nqpap-c026-try1.json`) |
| GetFeature `xtf_id = 'a13bb15a-…'` → zone **`ze.PAG_PAG_NQ_PAP_539`** | **HTTP 200, 5,023 bytes, sha256 `a17e527f…`** — COS_MAX 0.3 · CUS_MAX 0.3 · CSS_MAX 0.5 · DL_MAX 30, WGS84 polygon (near 6.09845 E, 49.58965 N), partie écrite `026_PE_NQ`, channel-served legislation citation = **RGD du 28 juillet 2011** with a legilux ELI link (`wfs-nqpap-c026-zone-a13bb15a.json`) |
| `data.public.lu` dataset `pag-ville-de-luxembourg` (the per-commune GML channel) | live, CC0, but the zip is **1,954,457,317 bytes (~1.95 GB)** — not a click-path channel (`vdl-dataset.json`) |

This **supersedes, for THIS host, the E7-LU "NO LIVE QUERY SERVICE EXISTS" verdict** — which was
correct about the hosts it probed (`wfs.geoportail.lu` dead; opendata WMS carries no PAG layer).
The same host-discovery shape as lane LU-PARCEL's cadastre finding, one day earlier.

**The honesty limit of the live channel — measured, not assumed** (`wfs-partiality-probe.txt`):

| localid prefix | live WFS | bulk GPKG (2026-08-31) |
|---|---|---|
| `ze.PAG_PAG_NQ_PAP%` | **1,404** | 3,017 |
| `ze.PAG_PAG_ZONAGE%` | 21,938 | 46,191 |
| `ze.PAG_PAG_ZONES_QE%` | 8,328 | 18,743 |
| `%ALIGN%` | **0** | 2,442 |

⇒ The live WFS is a **partial view (~46–47 % of the numeric layer)** and serves **no alignment
lines at all**. The bulk GPKG remains the complete corpus; the live channel is a fetch-one-zone
convenience, not a coverage substitute. The pack therefore accepts BOTH channels and stamps
which one fed it (`LuPagCitation.channel: 'bulk-gpkg' | 'inspire-wfs'`).

**Recorded fixture** (the state's own bytes, byte-pinned):
`packages/site-parcel-data/__tests__/fixtures/lu-c026/wfs-nqpap-zone-539-recorded-live-2026-09-03.json`
(sha256 `a17e527ffd21de5122c1201c440d55b8fe427605dc0520388a7279b8ee3911c5`) + the gate copy
`tools/ga-gate/corpus/never-overstate/lu-pag-c026-zone-539.json`.

---

## 2 · The definitions (task 2) — and why NOTHING binds (the C63 verdict, three grounds deep)

Definitions verbatim in `luRuleMapper.ts` (fetched consolidated ACDU text, RGD 08/03/2017
Annexe II — quoted in French because a translated denominator is a lost denominator):

| coeff | statutory quantity | denominator | C63 verdict |
|---|---|---|---|
| **COS** | coefficient d'occupation du sol = emprise au sol ÷ … | **terrain à bâtir NET** | **WITHHELD** — not the cadastral parcel; area not served |
| **CUS** | coefficient d'utilisation du sol = Σ surfaces construites brutes (**5–10 m storeys ×2, >10 m ×3**) ÷ … | **terrain à bâtir BRUT** | **WITHHELD** — not the parcel, AND the numerator is non-linear: even correctly denominated, CUS × area bounds *weighted* floor area |
| **CSS** | coefficient de scellement du sol = surface scellée ÷ … | **terrain à bâtir NET** | **WITHHELD** — not the parcel; also not an envelope axis |
| **DL** | densité de logement = dwellings ÷ ha | **terrain à bâtir BRUT (ha)** | **WITHHELD** — not the parcel; a programme density, not a solid |

The three refusal grounds, each independent and each named in-band on every resolution:

1. **F1 — the denominator.** `terrain à bâtir brut/net` are planning constructs ("déduction
   faite de toutes les surfaces … nécessaires à sa viabilisation") whose areas the PAG serves
   NOWHERE. Coefficient × cadastral parcel area is the C63 Aarhus trap in a Luxembourgish accent.
   This is the exact PL FAR/coverage precedent (`plPogEnvelope.ts`), except Poland kept one
   denominator-free axis (height) — **Luxembourg serves no height, no setbacks, no storeys, so
   there is no denominator-free axis at all.**
2. **F2 — Art. 26.** Verbatim: the coefficients are *«valeurs moyennes … peuvent par conséquent
   être dépassés pour certains lots ou parcelles»* — zone AVERAGES individual lots may lawfully
   exceed. Even a denominator-resolved value is not a per-parcel cap without a signed
   conservative reading.
3. **F3 — the signature.** `LU_PAG_CERTIFIED = false`, born shut, `signature: null` in
   `l449CertificationGates.ts` (scribe-not-signatory). The refusal is named on every resolution
   (`LU_PAG_UNCERTIFIED_CAVEAT`).

⚠ **Not the E5 stop-build.** E5 stop-built a *hand-written* LU rule pack ("the GPKG IS the rule
pack"). This module transcribes nothing — it compiles the state-served columns verbatim with
their statutory addresses. The F3 signature would certify the *mapping*, and even signed it
cannot supply a denominator (the gate row says so).

**Interesting anomaly carried, not resolved:** the live WFS feature cites the **RGD 28/07/2011**
(the 2011-régime content regulation, `legislationcitation…name` + ELI link) while the statutory
terminology this repo quotes is the 2017 RGD's Annexe II (the dataset title is "PAG «version
2011» en vigueur"). Both define the same four coefficients; the served citation travels verbatim
on `LuPagCitation.servedLegislationCitation`, never harmonised.

---

## 3 · What was built (tasks 3, 5, 6)

- **`packages/site-parcel-data/src/rulepacks/luPagEnvelope.ts`** (new, pure L2) —
  `resolveLuPagEnvelope` (four compiled facts, each with `withheldReason`; minima as facts; R2
  value-basis codes from the ONE vocabulary; Art. 26 + CUS-weighting + no-vertical-axis + F3
  caveats), `luPagZoningRecord` (a `ZoningRecord` whose `structuredFields` carry **no number at
  all** — the engine resolves `status: 'none'`, draws nothing, cannot overstate; facts ride
  `ordinanceRef`), plus channel bridges `luPagFieldsFromNqPapRow` / `luPagCitationFromNqPapRow`
  (bulk GPKG) and `luPagFromInspireWfsFeature` / `luPagZoningRecordFromInspireWfsFeature`
  (live WFS; refuses a feature without `xtf_id`; parses `CODE_COM` defensively out of
  `gml_description`). Domain honesty is delegated to the existing `classifyLuCoefficient`
  (zero → unknown, negative or COS/CSS > 1 → refused-domain, CUS legitimately up to 10).
- **`luRuleMapper.ts`** — additive: `LU_TERRAIN_A_BATIR_DEFINITIONS` (the verbatim Annexe II
  brut/net definitions promoted from comment to exported data).
- **`l449CertificationGates.ts`** — additive row for `LU_PAG_CERTIFIED` (shut, unsigned), with
  the what-a-signature-would-NOT-buy comment. Totality test green (the scan found the constant
  and the registry names it).
- **`tools/ga-gate/check-envelope-never-overstates.ts`** — additive arm **2i §LU-PAG-COMPILE**:
  fidelity (compiled facts ≡ the independently transcribed published values, both directions),
  the withhold (no number reaches `structuredFields`), the solve (**status `none` is asserted —
  a solve IS the finding**), teeth #1 (injecting COS/CUS provably re-binds → the omission is
  load-bearing), teeth #2 (lowered/inflated compiled facts are flagged), domain teeth
  (COS 1.3 → refused-domain), certification honesty (shut gate ⇒ named caveat).
- **`__tests__/luPagEnvelope.test.ts`** (new) — 19 tests: sha-pinned fixture provenance, the
  live-channel parser, compile verbatims + withhold reasons, the record tripwires (no naive
  300/500 m² products anywhere in the serialised record), engine refusal + re-bind teeth,
  E4-control-9 (null ≠ 0 ≠ unlimited), domain breaches, the GPKG bridge, L-449 registration,
  determinism.

## 4 · ALIGN_A_RESP building lines — ASSESS-ONLY (task 4), how they would enter

- **What they are:** 2,442 `PAG_PAG_ALIGN_A_RESP` "alignements à respecter" — building lines as
  geometry, in the bulk GPKG only (**measured 0 on the live WFS**, see §1). LUREF/EPSG:2169.
- **How they enter (when a lane takes it):** the explicit-geometry tier, the NL `bouwvlak`
  precedent — but with the NL/SI distinction respected: an ALIGN_A_RESP is a **LINE**, not a
  ring. Where lines close a figure against the zone boundary they route into the enclosed-ring
  **`explicit-area`** clip (the Madrid NZ-1 / NL / FR plan-masse seat,
  `solveExplicitArea`); where they stay open they are **alignment** geometry (the existing
  `alignmentEnvelope` / `buildingLineOffset` machinery), shaping the footprint's street edge
  only. Provenance per line: `xtf_id` + commune + the GPKG artefact stamp (same F2/F3 shape as
  SI `Gradbena meja`, which is the closest sibling — CENSUS TOP-10 #10).
- **Why not this hour:** the geometry consume needs the ring-closure decision per line (open vs
  closing), a LUREF→scene projection seat, and the parcel∩line association — none of it small,
  and the scalar pack is the deliverable. Nothing in the pack blocks it: the record's
  `structuredFields` stay empty either way, and the drawn-line tier would ADD a footprint clip,
  never a number.

## 5 · Proofs (task 7)

| check | result |
|---|---|
| scoped `tsc --noEmit` @pryzm/site-parcel-data | **RC=0** |
| `vitest run __tests__/luPagEnvelope.test.ts` | **19/19 passed** |
| `vitest run` l449 + envelopeAuthorisation + packPublishedConfidenceUnchanged | **50/50 passed** |
| `npx tsx tools/ga-gate/check-envelope-never-overstates.ts` (arm 2i live) | **RC=0** — `env none (refusal IS the honest answer — nothing binds), facts … faithful, engine numbers empty, tamper re-binds=true` |
| **Falsification** (task 6): fixture `fields.cosMax` 0.3→0.2 on disk | **RC=1**, exactly one finding: `[coverage] lu-pag/compile / ze.PAG_PAG_NQ_PAP_539 — compiled COS_MAX 0.2 ≠ the recorded published value 0.3` (`transcripts/lu-envelope/falsify-SEEN-FAILING.txt`) |
| Byte-identical restore | sha256 `fcb72c52…` BEFORE == RESTORED (`falsify-BEFORE.sha256` / `falsify-RESTORED.sha256`) |
| Gate after restore | **RC=0** (`falsify-RESTORED-GREEN.txt`; re-run after the incident below cleared) |
| FULL @pryzm/site-parcel-data suite | **201 files · 4,244 passed · 3 skipped · 0 failed** (after the incident cleared) |

### ⚠ Incident — concurrent shared-tree breakage (NOT this lane's, NOT fixed by this lane)
During the post-restore gate re-run, the concurrent boundary-wave lane's fresh **Croatia row** in
`parcelProviders/registry.ts` (line 341) landed with an **unescaped apostrophe** inside its
single-quoted note string (`the SI lane's pipeline-validated` → esbuild `Expected "}" but found
"s"`), breaking every consumer of the package (tsc, vitest, both envelope gates). Per the
shared-file discipline this lane did **not** edit `registry.ts`; the one-character fix (escape
`lane\'s`) belongs to the owning lane and is flagged in `barrel-additions-lu-envelope.txt`. All
of this lane's greens above pre-date that edit; the restored-fixture gate re-run was repeated to
green as soon as the tree parsed.

## 6 · Registry + doc follow-ups queued for the orchestrator (none of them this lane's surface)

1. **The live WFS channel into the LU source row** — `luSources.ts` (and the future
   `sourceRegistry/lu.ts` migration already queued by E7-LU) records protocol `'bulk'` only; the
   INSPIRE WFS (`wms.inspire.geoportail.lu/geoserver/wfs`, `lu:LU.SpatialPlan.PAG`, keyless,
   **partial ~47 %**, no ALIGN lines) deserves a probe note on the SAME row — one source, two
   access channels — not a second row.
2. **`luPagGpkgClient.ts` header correction** — its "NO LIVE QUERY SERVICE EXISTS" block is now
   true only of the hosts it names; add the 2026-09-03 INSPIRE-WFS finding + partiality numbers
   (the client itself needs no code change — the reader port stands).
3. **The census/gap-master LU rows** — same correction: "no live query" → "live but partial
   (~47 %), coefficients typed, ALIGN lines bulk-only".
4. **`dl_min` typing** — the WFS flattening types `dl_min` as `xsd:short` (integer) while the
   GPKG serves REAL; any future live-channel consumer of minima must not trust the WFS type as
   the statutory domain.

## 7 · What would flip Luxembourg from refusal to a drawing adapter (the honest ladder)

1. **Parcel leg** — LIVE since lane LU-PARCEL (2026-09-03).
2. **Zone join** — spatial (point/parcel ∩ NQ-PAP ring), never `NUM_CADAST` (not a key). The
   bbox-candidates seam exists (`resolveLuNqPapCandidatesForParcel`); the exact-intersection
   geometry seat is still owed.
3. **F1/F2/F3** (§2) — a denominator source, a signed Art. 26 reading, and the L-449 signature.
4. **A vertical axis** — height is served nowhere in the PAG model; per-commune PAP extraction
   or a separate source. Until then the truthful LU output stays: zone + facts + refusal
   (A.5: "footprint derivable; vertical extent unresolved").
