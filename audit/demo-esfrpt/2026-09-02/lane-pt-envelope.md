# LANE PT-ENVELOPE — the PDM data-model brief executed: catalogue vendored, developability live, the 22/132 gate, the citation seat, conformance measured

**Date:** 2026-09-02 · **Brief:** `docs/04-reference/jurisdictions/pt/PT-PDM-DATA-MODEL-BRIEF.md`
(f59f8a23, read whole) + `docs/01-strategy/STR-EUROPEAN-ENVELOPE-SOURCES.md` §2. **No commit**
(per brief). Lands beside the PT-ZONEID machinery — extend, never rival: `ptCrusZone`'s refusal
shapes untouched, `ptPortoPdmDraft`'s gate untouched, all 25 PT-ZONEID tests still green.

**One sentence:** every mainland-Portugal refusal card now ALSO answers the brief's national
question — *"is this parcel developable, and for what"* — from the closed 18-category catalogue
(cited to Aviso n.º 9282/2021 Anexo I), never as a number; and where a PU/PP área de intervenção
is evidenced, a typed `derived-plan` refusal names the overriding plan instead of letting the
PDM verdict masquerade as governing.

---

## 1 · What shipped (the brief's order)

| # | Immediate action | Where | State |
|---|---|---|---|
| 1 | **Vendor the catalogue** | `src/countryAdapters/pt/ptPdmDataModel.ts` | ✅ 18 soil categories with codes (urbano 2,3,4,5,151,152,6,7 · rústico 8–17); the 14 tabled Anexo I-PO objects (18,19,133,134,139,140,20,138,135,136,22,132,149,150); condicionantes codes (REN 148, RAN 68, monuments 91–94, protection zones 95–97) + the 8 SRUP themes; the five-table schema as data (OBJETO_TIPO / OBJETOS_{PONTO,LINHA,POLIGONO} / ATO_ESPECIFICO, fields + closed domains — 13 TIPO_ATO values, SERIE, PLANTA). Every entry cites `PT_PDM_NORM_CITATION`. Codes 41–52+ = `PT_ANEXO_I_PO_TRUNCATION` (TRUNCATED-IN-SOURCE, "never guess" is the rule text). PURE DATA — `schemas/**` untouched. |
| 2 | **Category → developability map** | `ptDevelopability.ts` + chain wiring in `pt/index.ts` | ✅ Typed verdicts exactly per brief: 2/3/4/5/6 `development-target` · 7/151/152 `correct-null` · 13/14/16 `limited-edification` · 8/9/10/11/12/15/17 `no-urban-envelope` (total over 18, pinned by test). Output is a DEVELOPABILITY STATEMENT + catalogue citation appended to the EXISTING cited refusal — `code`/`legallyGrounded`/`headline` untouched, no numeric field exists on the statement type. Join: CRUS `codigo` FIRST (⭐ measured = the Anexo I code), exact-normalised name fallback, **null on disagreement** (two witnesses never resolved by picking) and on classe contradiction. |
| 3 | **Object 22/132 derivability gate** | `ptPdmObjectGates.ts` (`ptPlanInterventionOverride`) + `PtChainDeps.resolvePdmObjectsAt` | ✅ Typed `derived-plan` refusal (legallyGrounded **true** — the FR defer-to-site-specific-document mirror, and the exact enum semantics of `derived-plan`) naming the overriding PU (22) / PP (132) with ESPECIFICA/ETIQUETA verbatim, RJIGT hierarchy cited. Injectable dep because the object layer is not publicly served (§3) — transient layer ⇒ the card is CAVEATED BY NAME ("override status UNVERIFIED"), never silently certified clean; absent ⇒ clean; no dep ⇒ today's exact prior behaviour. |
| 4 | **ATO_ESPECIFICO citation seat** | `ptPdmObjectGates.ts` | ✅ Typed row + domain-validating parser (`parsePtAtoEspecifico` — out-of-domain TIPO_ATO/SERIE refused, not coerced) + `ptAtoCitation` formatter, for when the tables are obtainable. PLUS the measured live channel: `parsePtSrupServCitation` for the flattened `serv_*` fields the DGT SRUP collections actually serve (§3, verbatim Santarém RAN row under test). **Nothing speculative wired** — no SRUP chain leg exists and none was minted. |
| 5 | **Measure conformance / WFS** | `transcripts/pt-envelope-measurement.txt` | ✅ §3 below. |

Chain order in `resolvePtZoneIdentityAt` (the same function a dispatcher calls): CRUS identity →
Porto draft coverage line (unchanged) → developability upgrade (no-op on catalogue miss) →
22/132 gate (only where a layer is wired).

## 2 · Acceptance — all arms, foreground, verbatim proofs

1. **Three demo points live** (`transcripts/pt-envelope-live-acceptance.txt`, RC=0 ALL PASS):
   - **Lisbon** (38.7223,−9.1393) → 953 ms → `public-open-space` card + `⭐ NATIONAL
     DEVELOPABILITY … CORRECT NULL` + `Categoria nacional: código 7 — Espaço Verde (Solo Urbano)`.
   - **Porto** (41.1579,−8.6291) → 244 ms → `public-open-space` + BOTH the gate-shut
     `PORTO COVERAGE UPDATE` line AND `CORRECT NULL` (código 7) — the upgrades coexist.
   - **Évora** (38.5667,−7.9000) → 122 ms → `no-rule-pack` (ungrounded, the weakest claim,
     unchanged) + `DEVELOPMENT TARGET` (código 3) + the full Aviso n.º 9282/2021 citation.
     Live `data_pub_origem` now serves 2025-08-27 (the plan was republished since the fixture).
2. **Object-22 synthetic fixture triggers the override BY NAME** (same transcript): live Évora
   zone + synthetic five-table-shaped evidence (codigo 22, ESPECIFICA `PU sintético de Évora…`,
   ETIQUETA PU1) → `code=derived-plan, legallyGrounded=true`, headline `Área de Intervenção de
   Plano Municipal…`, detail names `Plano de Urbanização (PU)` + the ESPECIFICA verbatim, and
   the card does NOT carry `DEVELOPMENT TARGET` (the displaced verdict never masquerades).
3. **Gates:** `npx vitest run ptPdmEnvelope ptZoneIdentity --root packages/site-parcel-data`
   → **RC=0, 48/48** (23 new + 25 PT-ZONEID, `transcripts/pt-envelope-suite-final.txt`);
   `npx tsc -p packages/site-parcel-data/tsconfig.lane-pt-envelope.json --noEmit` → **RC=0**
   (see §5 for why the scoped config exists).
4. **Falsification** (`transcripts/pt-envelope-{falsification,sha-restore}.txt`): catalogue
   severed on disk (both lookups → empty list) → all three points still `found` with the PRIOR
   honest refusal — no `NATIONAL DEVELOPABILITY` line, no `Categoria nacional` fact, no crash,
   no fabricated verdict; Porto's draft line (not catalogue-keyed) survives; the object-22 gate
   (evidence-keyed) still fires by name. Restore **sha256-identical**:
   `7383aa8dbf6a10422229cc6b0ec0b8805b18d50b32da0f3789792c8b23e24dfa` before AND after.

## 3 · The measurement (brief §Still-unverified 1+2+3) — honest findings

All probes live, foreground, 2026-09-02 (`transcripts/pt-envelope-measurement.txt`; small raw
artifacts beside it).

**S-U 2 — "does any WFS serve the five tables / the OBJETOS layers?" → NO, on every public channel:**
- National OGC API (`ogcapi.dgterritorio.gov.pt/collections`, 200 in 1.23 s): **75 collections
  enumerated — no OBJETO_TIPO / OBJETOS_* / ATO_ESPECIFICO / Anexo-I-PO collection.** Planning
  set = `crus` + the national SRUP family (REN/RAN/áreas protegidas/ZPE/ZEC/SGIFR/…).
- Per-DICOFRE CRUS WFS for **norm-conformant Évora (PDM 2025)** — DescribeFeatureType, 200 in
  20.5 s: the HARMONISED view only (ID/DTCC/Municipio/Classe/Categoria/Area_Ha/Designação/…) —
  **no IDENTIFICA/ESPECIFICA/ETIQUETA/MEDIDA even where the five-table filing must exist.**
- Per-instrument WFS sibling → **404** (recon GUESS-404 re-confirmed, 0.23 s). snit-mais
  GeoServer WFS → **401 Unauthorized** (WAS "Service WFS is disabled" in the recon — the access
  model changed to credentialed; still not public).
- **Verdict the code now states at its seams: the five tables are a legal FILING requirement,
  not a distribution product.** Everything in (1)–(4) binds conformant FILINGS; what is SERVED
  is the harmonised transcription plus flattened SRUP citations.

**S-U 3 — "are ESPECIFICA/ETIQUETA/MEDIDA populated?" → not directly observable; strong indirect evidence YES:**
- No served layer exposes the relational fields (crus queryables read: 15 fields, none of them).
- BUT the composed `classificacao_e_qualificacao` strings carry the CONTENT: Coimbra
  `…Espaços centrais – C1` (an ETIQUETA, the norm's own EH1 pattern), Braga `…Espaço Central -
  de Tipo 1` (an ESPECIFICA disaggregation), Lisboa `…Traçado Urbano A Consolidado`. `area_ha`
  (the MEDIDA analogue) is populated on every probed feature.
- ATO_ESPECIFICO population is DIRECTLY witnessed on the SRUP layers: the Santarém RAN feature
  carries `serv_lei "Aviso n.º 23631/2025/2"`, `serv_data 2025-09-24`, `serv_dr "184 IIS"`, a
  hyperlink to the diploma PDF — **the brief's "free provenance for every condicionante" is
  real, flattened.**

**S-U 1 — "how many of 308 municípios conform?" → still unmeasured nationally (a sweep, not a lane); the 5-município sample:**
| Município | data_pub_origem | vs norm (2021-02-18) | codigo served |
|---|---|---|---|
| Lisboa | 2020 | **PRE-norm** | ✅ 7 / 3 |
| Porto | 2021-07-08 | post | ✅ 7 |
| Coimbra | 2022-02-22 | post | ✅ 2 |
| Évora | 2025-08-27 | post | ✅ 3 / 11 |
| Braga | 2026-04-15 | post | ✅ 2 |

⭐ **The lane's headline discovery: CRUS `codigo` IS the Anexo I catalogue code, and the DGT
assigns it even for pre-norm plans** (Lisboa) — because CRUS is the DGT's own harmonised
transcription. So the developability map is live NATIONALLY today regardless of per-município
filing conformance, while the five-table machinery (gate evidence, ATO parser) waits on
conformant data becoming obtainable. The code says this at its seams
(`PT_PDM_NORM_CONFORMANCE_CAVEAT`; the module headers).

## 4 · Files touched

- `packages/site-parcel-data/src/countryAdapters/pt/ptPdmDataModel.ts` — new (catalogue, pure data).
- `packages/site-parcel-data/src/countryAdapters/pt/ptDevelopability.ts` — new (map + upgrade, pure).
- `packages/site-parcel-data/src/countryAdapters/pt/ptPdmObjectGates.ts` — new (gate + citation seats, pure).
- `packages/site-parcel-data/src/countryAdapters/pt/index.ts` — edited (+112/−8): `PtChainDeps`, the three-step upgrade chain in `resolvePtZoneIdentityAt`, explicit exports.
- `packages/site-parcel-data/__tests__/ptPdmEnvelope.test.ts` — new (23 tests: catalogue integrity/truncation, map totality, join discipline incl. disagreement-null, upgrade invariants incl. never-a-number-on-the-delta, 6 chain gate branches over recorded live bodies + synthetic fixtures, ATO/SRUP parsers on the measured verbatim row).
- `packages/site-parcel-data/tsconfig.lane-pt-envelope.json` — new lane artifact (§5).
- `audit/demo-esfrpt/2026-09-02/` — this file, `barrel-additions-pt-envelope.txt`, 7 `transcripts/pt-envelope-*` artifacts.

**Held surfaces untouched:** `packages/schemas/**` (frozen — verified: the refusals ride the
existing codes `public-open-space`/`facility-plan`/`protected-soil`/`no-rule-pack`/`derived-plan`;
L-12874 honoured — the chain emits only L0-table transient tokens and the genuine-absence family,
no new token minted), `src/index.ts` (package barrel), `parcelProviders/**`,
`ptCrusClient.ts`/`ptCrusZone.ts`/`ptPortoPdmDraft.ts`/`ptSources.ts` (byte-untouched),
`apps/editor/**`, `l449CertificationGates.ts` (no new `*_CERTIFIED` constant exists to register).

## 5 · The working tree this lane ran inside (so nobody reads it as this lane's breakage)

The FULL package suite is **RC=1 (24 files / 100 tests failed)** and the FULL package tsc is
**RC=2 (7 errors)** — **all of it a CONCURRENT lane's mid-build state, none of it PT**: untracked
`rulepacks/declarative/{evaluateContextAggregate,evaluateHeightProportionalOffset,heightDatumResolver}.ts`
(+ tests, + new geometry files) import `ContextAggregateRule` / `HeightProportionalOffsetRule` /
`GEOMETRIC_RULE_KIND_REGISTRY` — none exported by `@pryzm/schemas` yet (that lane's own
`schemas/src/site/GeometricRule.ts` edit is 1 line so far) — and the modified
`ZoningRulesEngine.ts:1155` reads the missing registry, killing every envelope-compute test with
`TypeError: Cannot read properties of undefined`. Witness: `grep -E "countryAdapters/pt|ptPdm|
ptCrus|ptDevelopability" <full-suite output>` → **0 hits**; the 48 PT tests pass in the same
tree; the lane-scoped tsc (config declared in barrel item 2) type-checks the whole pt subtree +
everything it imports → RC=0. This is the same situation PT-ZONEID recorded as its item 6e, one
lane-generation later.

## 6 · Not done / owed (recorded, not acted)

- The object-layer dep implementation — blocked on any public OBJETOS channel existing (none
  does, measured); the seam + tests are ready (barrel item 3).
- A national conformance SWEEP (S-U 1 proper: all 308 municípios via paged CRUS queries) — a
  dedicated measurement lane, not this one.
- SRUP condicionantes as a chain leg (consuming `parsePtSrupServCitation`) — a future lane;
  deliberately unwired here per "wire nothing speculative".
- Dispatcher/proxy wiring for PT remains PT-ZONEID's barrel items 3–4 (unchanged by this lane —
  the developability upgrade rides the same `resolvePtZoneIdentityAt` those items dispatch).
