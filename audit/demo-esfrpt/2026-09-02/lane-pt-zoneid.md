# LANE PT-ZONEID — Portugal zone identity on CRUS → the zone-named cited refusal (demo gap G4)

**Date:** 2026-09-02 · **Lane:** PT-ZONEID, finished by **PT-ZONEID-FINISH** after the original
lane was cut by a rate limit mid-build ("All shapes pinned. Writing the adapter now — client
first."). **No commit** (per brief). Files land untracked + one declared shared-file edit; barrel
protocol additions in `barrel-additions-pt-zoneid.txt`.

**What G4 looked like before:** a Portuguese parcel's envelope axis was a blind
`estimated-default` triple naming no zone (DEMO-READINESS rows 7–9). **After:** the same point
resolves the national CRUS zone CONTAINING it and yields a typed `EnvelopeRefusal` that names the
zone verbatim (classe/categoria + full designation), names the instrument (PDM + SNIT
registo/depósito + situação), and says why no envelope is drawn — never a number.

---

## 1 · Inheritance verdicts (per the discipline: nothing trusted, everything re-executed)

| Piece | Verdict | Evidence |
|---|---|---|
| `src/countryAdapters/pt/ptCrusClient.ts` (predecessor, 14.5 KB) | **VERIFIED + 1-line CORRECTED** | All transient tokens are L0 `TRANSIENT_FETCH_REASONS` members (`endpoint-unreachable:` / `upstream-failed:`); absents use the genuine-absence family only; imports resolve; scoped tsc RC=0; 25/25 tests. CORRECTION: header referenced `ptSourceRefs.ts`, a file that never existed → repointed to `ptSources.ts` (built this pass). |
| `src/countryAdapters/pt/ptCrusZone.ts` (predecessor, 20 KB) | **VERIFIED** | All 4 refusal codes (`public-open-space`/`facility-plan`/`protected-soil`/`no-rule-pack`) exist in `EnvelopeRefusalCodeSchema`; `pointInRingsEvenOdd` + `isInPortugal` imports real; refusals schema-parse; weakest-claim bias + double-containment refusal + non-Vigente caveat all under test. Untouched byte-for-byte. |
| Pinned CRUS shapes (scratch `pt-zoneid/`: collection, lisbon/porto/evora/sea/rustico bboxes, queryables, SNIG record) | **VERIFIED — pin CONFIRMED live** | Porto point re-probed live before building on the pins: HTTP 200, 0.97 s, fid 134801, all 14 property keys and every verbatim value (en-dashes, doubled space) **byte-identical** to the pinned body (`transcripts/pt-zoneid-reprobe-porto.json`). Predecessor probe bboxes = the mandate coords ±0.0001° exactly. |
| `ptSourceRefs.ts` (referenced by client header) | **ABSENT-REBUILT** as `ptSources.ts` | CRUS OGC API source row (id `pt-dgt-crus-ogcapi`, protocol OGCAPI, CC-BY-4.0 GREEN, 2 dated probe entries) through `defineSources('PT', …)` — the FR/LU/LT seam pattern; migration to `sourceRegistry/pt.ts` queued (barrel item 2). |
| `ptPortoPdmDraft.ts` (referenced by ptCrusZone.ts) | **ABSENT-REBUILT** | The Porto pack draft — §3 below. |
| `pt/index.ts` (§J adapter) | **ABSENT-REBUILT** | `ptCountryAdapter` on the EE/DK/LT/PL/FR §J shape; rules kind `zone-identity-refusal`; `PT_APPLICABILITY_LADDER` as data; Porto-draft coverage enrichment on the chain. |
| Tests + fixtures | **ABSENT-REBUILT** | `__tests__/ptZoneIdentity.test.ts` (25 tests) + `fixtures/pt-crus-zoneid/recorded-live-2026-09-02.json` (verbatim recorded bodies: lisbon ×2-candidates, porto, evora, sea-zero). |
| `audit/.../barrel-additions-pt-zoneid.txt`, this file | **ABSENT-REBUILT** | — |

## 2 · Acceptance — all four arms, foreground

1. **Live (RC=0, `transcripts/pt-zoneid-live-acceptance.txt`):**
   - **Lisbon (38.7223,−9.1393)** → 454 ms → `Solo Urbano - Espaço Verde de Recreio e Produção
     Consolidado` · PDM de LISBOA, registo 03.11.06/PDM/04/2020/131, Vigente → code
     `public-open-space`, legallyGrounded **true**. (2 polygons intersected the bbox; the
     containment pick chose the one holding the point — the wrong-zone-citation guard, live.)
   - **Porto (41.1579,−8.6291)** → 250 ms → `Solo Urbano  – Espaços verdes e Frente atlântica e
     ribeirinha – Área verde de fruição coletiva` (verbatim doubled space + en-dashes preserved) ·
     PDM de PORTO, registo 01.13.12/PDM/03/2021/93, Vigente → `public-open-space` + the
     gate-shut **pack-draft coverage line** (no draft value shown).
   - **Évora (38.5667,−7.9000)** → 160 ms → `Solo Urbano - Espaços habitacionais` · PDM de
     ÉVORA, registo 04.07.05/PDM/02/2025/162, Vigente → `no-rule-pack`, legallyGrounded
     **false** (coverage statement, the weakest claim — the categoria admits edification).
2. **Sea → absent, both ways:** Atlantic inside the mainland bbox (41.15,−8.75) → the
   collection's own served zero → `absent` `no-feature:`; Ponta Delgada (Açores, outside
   `PORTUGAL_BBOX`) → `absent` `no-point:` with **zero fetches** (proven by a throwing fake in
   the test). **5xx → transient:** the recorded-real 502-Proxy-Error shape (measured live on
   this host 2026-09-02) classifies `transient` `upstream-failed: HTTP 502` at both the client
   and the full-chain layer — never empty, never an estimate.
3. **Gates:** scoped `npx tsc -p packages/site-parcel-data/tsconfig.json --noEmit` → **RC=0**;
   `npx vitest run --root packages/site-parcel-data` → **RC=0, 171 files, 3743 passed | 3
   skipped** (`transcripts/pt-zoneid-suite-final.txt`).
4. **Falsification (`transcripts/pt-zoneid-{falsification,sha-restore}.txt`):**
   `PT_CRUS_OGCAPI_ENDPOINT` severed to `https://severed.invalid.dgterritorio.example` → the
   Lisbon resolve answered `transient` / `endpoint-unreachable: https://severed.invalid…
   (fetch failed)` — **transient by name**, never absent. Restore verified **byte-identical**:
   sha256 `848ccb76…3915a37` before and after.

One mid-build red worth recording: the FULL suite first ran 1-failed — the package's
`l449CertificationGates.test.ts` **totality gate** caught the new `PT_PORTO_PDM_CERTIFIED`
constant unregistered (exactly the Madrid-invisible-gate defect it exists to catch). Registered
in `src/l449CertificationGates.ts` (born SHUT, `signature: null`, +15 lines — the one shared-file
edit, declared as barrel item 0) → suite green.

## 3 · The Porto-pack verdict: **STRUCTURED-WITH-CITATIONS → drafted, gate-shut**

The probe's claim ("Porto PDM already text-extracted, no pack") located and verified:
`pdm.cm-porto.pt/documents/121/Regulamento_PDMPorto.pdf` — 100 pp **text PDF**, 319,459 chars
extracted 2026-07-31, and `docs/04-reference/jurisdictions/pt/sources/SOURCES.md` **§A.0.3** is a
per-value, per-article citation table at `VERIFIED-PRIMARY` (Arts. 3.º d/g/l/m/o definitions
verbatim; Art. 25.º; Art. 32.º índice 1; Art. 36.º 1,8; Art. 38.º 1,4; cércea/profundidade/
afastamento/storeys rows cited to the Espaços Centrais chapter without pinned artigo numbers).
That clears the structured-with-citations bar → **`ptPortoPdmDraft.ts` drafted**: 17 cited
values/definitions as data, `PT_PORTO_PDM_CERTIFIED: boolean = false` mirroring
`FR_PARIS_PLU_CERTIFIED`, registered in the L-449 table.

**Shut twice over, and the gate text says so:** (a) no human signature of its three assertions —
scope/exceptions (VERIFICATION.md's own precondition), CRUS→PDMP categoria mapping, article pins
for the unpinned rows; (b) Porto's dominant height regime is **moda da cércea** (Art. 3.º o) —
fabric-derived), which needs a C58 `fabricDerivedHeight` GeometricRule kind that does not exist
(`pt-13/1315-porto/ENVELOPE.md`) — so even a signature cannot open a drawing path yet. While
shut, the draft upgrades ONLY Porto's refusal **coverage statement** ("the signature is missing,
not the sourcing"); no draft value is evaluated or reaches any user-readable field (tested).
Traps honoured: DICOFRE **1312** not 1315 (the recorded CAOP defect); `edificab_m` perequação
indices deliberately excluded (§A.0.3's own warning).

## 4 · Files touched

- `packages/site-parcel-data/src/countryAdapters/pt/ptCrusClient.ts` — inherited; 1 comment line corrected; sha-verified restored after falsification.
- `packages/site-parcel-data/src/countryAdapters/pt/ptCrusZone.ts` — inherited; untouched.
- `packages/site-parcel-data/src/countryAdapters/pt/ptSources.ts` — new.
- `packages/site-parcel-data/src/countryAdapters/pt/ptPortoPdmDraft.ts` — new.
- `packages/site-parcel-data/src/countryAdapters/pt/index.ts` — new.
- `packages/site-parcel-data/__tests__/ptZoneIdentity.test.ts` — new (25 tests).
- `packages/site-parcel-data/__tests__/fixtures/pt-crus-zoneid/recorded-live-2026-09-02.json` — new (verbatim recorded bodies).
- `packages/site-parcel-data/src/l449CertificationGates.ts` — **shared, +15** (gate registration forced by the totality test; declared barrel item 0).
- `audit/demo-esfrpt/2026-09-02/` — this file, `barrel-additions-pt-zoneid.txt`, 5 `transcripts/pt-zoneid-*` artefacts.

**Held surfaces confirmed untouched:** `src/index.ts`, `parcelProviders/registry.ts`,
`packages/schemas/**`, `apps/editor/**`, `countryAdapters/fr/**` (committed meanwhile by its own
lane at `35baaabd`), `family-*`/`file-format/**`. The schemas/editor working-tree edits visible
in `git status` belong to the concurrent component/UCE lane.

## 5 · Not done / owed (recorded, not acted)

- Dispatcher wiring (`siteDispatch.ts`) + the `/api/pt/crus` proxy — barrel items 3–4.
- `sourceRegistry/pt.ts` row migration — barrel item 2.
- NEXT.md item 9.3 answer + recon §4.7 channel update + per-city SOURCES.md staleness — barrel item 6 (doc owners').
- The founder-decision half of G4 (signing the Porto pack) and the schema lane (`fabricDerivedHeight`).
