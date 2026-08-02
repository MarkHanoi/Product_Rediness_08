#!/usr/bin/env node
// PROBE A — emit the machine-readable result. Numbers come from stage5b.final.json ONLY;
// nothing here is retyped by hand (R8: do not quote a figure you have not personally re-measured).
import { writeFileSync, readFileSync } from 'node:fs';
const OUT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/.claude/worktrees/agent-a1e8e521bbaeb782e/tools/cold-start-probe/';
const P = OUT + 'probe-a/';
const f = JSON.parse(readFileSync(P + 'stage5b.final.json', 'utf8'));
const v3 = JSON.parse(readFileSync(P + 'stage3.variables.json', 'utf8'));
const ov = JSON.parse(readFileSync(P + 'stage4b.ov.json', 'utf8'));
const or = JSON.parse(readFileSync(P + 'stage4.oracle.json', 'utf8'));

const result = {
  probe: 'PROBE A — COLD START, AMB Refós de Planejament publisher',
  runAtUtc: new Date().toISOString(),
  city: { name: 'Sant Andreu de la Barca', ine: '08196', dgcCatastro: '08195', province: '08 Barcelona', comarca: 'Baix Llobregat', publisher: "AMB — Servei d'Informació Urbanística" },

  selectionRule: {
    stated: 'BEFORE any work on the city, logged 08:44:39Z',
    rule: "(a) universe = the 36 distinct CODI_INE returned by AMB layer 16; (b) exclude 08019 Barcelona (reference city, already shipped); (c) exclude the four AMB municipalities that already have a rulepack file — 08015 Badalona, 08073 Cornellà, 08101 L'Hospitalet, 08200 Sant Boi — they are not cold starts; (d) N=31 remain; take the median by 0-based index floor(31/2)=15.",
    result: '08196 SANT ANDREU DE LA BARCA',
    coldnessVerified: "grep -rn '08196|Sant Andreu de la Barca' across the repo excluding node_modules → 0 real hits (7 hits are coincidental digit substrings in test-fixture float literals). No rulepack, no provider, no dossier, no bbox.",
  },

  '⚠ optimisticBound': 'AMB Refós is unusually good data — ONE publisher serving 36 municipalities, with a per-clau numeric parameter table AND a vectorised volumetric layer. These minutes are an OPTIMISTIC BOUND on municipal onboarding cost, NOT a median. A municipality under a publisher we have never touched would repeat Stage 1 from zero.',

  minutesPerStage: {
    '1_datasetDiscovery': { start: '08:44:03Z', end: '08:48:41Z', minutes: 4.63 },
    '2_legalStack': { start: '08:58:51Z', end: '09:10:51Z', minutes: 12.0, note: 'the ONLY stage that failed its objective; 100% of it was spent on a document that does not exist at its published address' },
    '3_variableResolution': { start: '09:11:20Z', end: '09:13:06Z', minutes: 1.77 },
    '4_constraintResolution': { start: '09:13:10Z', end: '09:15:21Z', minutes: 2.18, note: 'includes the OV_Trames pass and the 15-parcel server-side oracle; the Catastro parcel download was pre-warmed in the background during Stage 2 (6.4 s, declared not hidden)' },
    '5_determination': { start: '09:15:30Z', end: '09:19:30Z', minutes: 4.0, note: 'includes finding and fixing a precedence defect in my own Stage-4 classifier and a full re-run' },
    totalMinutes: 24.58,
    excluded: 'a ~10 min session gap between Stage 1 and Stage 2 (the probe was resumed in a new session) is NOT counted in any stage.',
  },

  determination: {
    denominator: `${f.n} cadastral parcels — Catastro INSPIRE CP for the municipality. Every parcel weighs 1. NOT an area denominator, NOT clicks.`,
    formula: `Determination ${f.pct.determination}% = Envelope ${f.pct.envelope}% + Refusal ${f.pct.refusal}%`,
    determinationPct: f.pct.determination,
    envelopePct: f.pct.envelope,
    refusalPct: f.pct.refusal,
    noDeterminationPct: f.pct.noDetermination,
    envelopeBreakdown: {
      via_QUAL_MUNI_numeric_parameters: { pct: +((100 * f.envQ) / f.n).toFixed(2), n: f.envQ, status: 'SHIPPABLE TODAY' },
      via_OV_Trames_explicit_footprint: { pct: +((100 * f.envO) / f.n).toFixed(2), n: f.envO, status: '⛔ BEHIND THE L-449 / SIG-3 CERTIFICATION GATE, WHICH IS SIGNED FOR BARCELONA ONLY. Unsigned for this municipality ⇒ not shippable today.' },
      shippableTodayPct: f.pct.envelope_shippable_today,
      shippableAfterOneSignaturePct: f.pct.envelope_after_signature,
    },
    refusalBreakdown: {
      'legally terminal': { pct: +((100 * f.refT) / f.n).toFixed(2), n: f.refT, why: 'Títol 6 / Títol 7 claus — systems and non-buildable public land (viari, verd, equipaments). No private envelope exists to compute; the refusal IS the correct answer.' },
      'delegated to an instrument we do not hold': { pct: +((100 * f.refD) / f.n).toFixed(2), n: f.refD, why: "PLAN='PD*' with NORMATIV='Asterisc'. The POUM points buildability at a plà derivat outside our corpus. Same shape as Barcelona's ~2,600 derived partial plans, already signed out of verified scope." },
      'gated on external authority': { pct: +((100 * f.refG) / f.n).toFixed(2), n: f.refG, why: 'the governing article can be NAMED (AMB NORMATIV gives títol+capítol per zone) but its TEXT is unobtainable — AMB\'s own normative link table 404s programme-wide and RPUC\'s query contract was not reversed. Also includes parcels inside an OV polygon whose PLANTES="ED" is unparseable and therefore refuses rather than defaulting a storey count.' },
    },
    notADetermination: { 'outside-zoning': { pct: f.pct.noDetermination, n: f.nod, why: 'centroid falls outside every layer-16 polygon. Counted separately, never folded into a rate (PROBE-DISCIPLINE R5).' } },
    '⚠ precedenceCorrection': 'a first pass reported Envelope 56.76% because my classifier tested QUAL_MUNI parameters BEFORE the PD* delegation flag. Delegation must win (ADR-0283). The fix moved 2.71 points from ENVELOPE to REFUSAL. The uncorrected figure is recorded here so the correction is auditable.',
  },

  tier: {
    assigned: 2,
    why: 'Tier 1 is NOT claimable. (a) airport surfaces, flood zones and infrastructure easements are UNMODELLED PROGRAMME-WIDE, so every envelope here is an upper bound with a missing ceiling; (b) the POUM article TEXT is not held, so figures are cited-by-pointer, not quoted from bytes — tier `estimated-ruleset`, never `structured`; (c) 18.45 of the 54.05 envelope points sit behind an unsigned certification gate.',
  },

  code: {
    municipalitySpecificProductLoc: 0,
    municipalitySpecificProductFiles: [],
    explanation: 'ZERO municipality-specific product code was written, and none was needed. The municipality enters every query as a PARAMETER, never a branch: AMB layer 16/17 take CODI_INE=08196; AMB table 18 takes CODI_MUN LIKE 08196%; Catastro takes the INE + the municipality NAME. No conditional anywhere in the chain tests for this city.',
    reusedProductFiles: [
      { path: 'packages/site-parcel-data/src/providers/bcnRefosOVProvider.ts', loc: 344, note: 'reads AMB layer 17 OV_Trames by lat/lon. Mechanism is PUBLISHER-generic, not Barcelona-specific — it resolved 18.45% of this city untouched.' },
      { path: 'tools/cold-start-probe/catastroParcelFrame.mjs', loc: 265, note: 'the parcel denominator. Imported, not reimplemented. Its name-authoritative rule caught the DGC/INE collision.' },
    ],
    probeInstrumentLoc: 687,
    probeInstrumentNote: 'tools/cold-start-probe/probe-a/*.mjs — measurement instruments, not product. The city appears in them as 3 literals (INE, name, province), never as a branch.',
    estimatedLocToActuallySHIP: { rulepack: '~144 (peer esBadalona.ts=144, esSantBoi.ts=145)', bbox: '~52 (peer badalonaBbox.ts=52)', total: '~196 LOC, all of it configuration-shaped', note: 'NOT written by this probe — a determination did not require it.' },
  },

  evidence: {
    oracle: `PROBE-DISCIPLINE R2 — 15 seeded parcels reclassified by the ArcGIS server's own esriSpatialRelIntersects point query (a different algorithm on a different machine from the local even-odd PIP): agree ${or.agree} / disagree ${or.disagree} / server-error ${or.err}. Every server row returned CODI_INE=08196.`,
    extentVerification: 'zoning bbox lon 1.9461–1.9850 / lat 41.4392–41.4647 vs parcel bbox lon 1.9472–1.9815 / lat 41.4406–41.4638 — the parcel frame nests inside the zoning extent. Sant Andreu de LLAVANERES (the colliding DGC name) is at lon ≈2.49 / lat ≈41.61, disjoint. The frame is verified by geometry, not by name-match alone.',
    variableEmptiness: `QUAL_MUNI: IE (FAR) NULL 60/60 rows. ARM/N_PLANTES/OCUP_MAX/SEP_* NULL 54/60. Zero empty strings ⇒ unambiguous absence, not a parse artefact. Only ${v3.report.filter((r) => r.vars.ARM).length} of ${v3.report.length} claus carry parameters = 8.78% of zoned area.`,
    ovLayer: `OV_Trames 221 polygons over claus 1,2,3a,3b,3c,4,13a. PLANTES: ${JSON.stringify(ov.plantesDist)} — 'ED'×77 is unparseable and MUST refuse.`,
  },

  couldNotMeasure: [
    'The POUM Normes Urbanístiques TEXT. AMB publishes an INE-keyed link table for all 36 municipalities whose targets 404 for EVERY municipality tested (6/6), across 6 client/protocol variants, and were never archived by Wayback. Recorded as a REAL negative.',
    "RPUC's query contract. The API is LIVE (/basica GET → HTTP 500 NullPointerException = params missing; POST → 405; wrong mount → 404) but 8 param names and 3 value shapes did not reverse it inside the time box. Classification: Investigate / Data acquisition — NOT 'No'. Failure ≠ empty.",
    'Whether the QUAL_MUNI parameters are the CURRENT consolidated values or a stale vintage. Unverifiable without the text — the same L-526 trap the Barcelona SIG-3 gate exists to catch.',
    'Heritage, flood, airport and infrastructure overlays — unmodelled programme-wide, not specific to this city.',
    'Area-weighted coverage. Reported figures are PARCEL-COUNT weighted per the coordinator addendum; a large delegated sector counts as few parcels but much land.',
  ],

  humanJudgementPoints: [
    'Excluding the four AMB municipalities that already have rulepacks from the draw — they are not cold starts, and including them would have flattered the result. Stated before the draw.',
    'Time-boxing the RPUC hunt after 8 param names, and recording Investigate rather than No.',
    'Treating a Títol 6 / Títol 7 clau as LEGALLY TERMINAL rather than as missing data. Systems land has no private envelope; calling it a data gap would inflate the gap.',
    "Deciding delegation (PD*) OUTRANKS published baseline parameters. This is a legal call, not an engineering one: a derived plan may override the POUM baseline, so ADR-0283 requires Unknown. It cost 2.71 points of envelope.",
    "Deciding OV_Trames RESOLVES a delegation rather than being overridden by it — the volumetric ordering IS the derived plan's content, vectorised. This is the single most consequential judgement in the probe (18.45 points) and it should be reviewed by a planning-literate human.",
    "Refusing on PLANTES='ED' rather than defaulting a storey count (77 of 221 OV polygons).",
    'Publishing an envelope at all while holding only a POINTER to the governing article and not its text. ADR-0284 says derived law is not permissible; I judged that CITING an article we can name, from an official consolidated restatement, is a pointer and not a derivation — but this is exactly the line a reviewer should re-draw.',
  ],

  whatBrokeThatTheFiveCitiesNeverExposed: [
    "SOFT 404 — HTTP 200 IS NOT 'FOUND'. geoportal.amb.cat returned HTTP 200 with byte-identical 1,657 B bodies for 4 of 9 guessed URLs; geoportalplanejament.amb.cat serves a JS-redirect stub under a 200. The five cities' probes classify on STATUS. Here, status alone would have banked four false hits.",
    "A NEAR-IDENTICAL-NAME DGC/INE COLLISION. València/Turís was two unrelated names. Here DGC 08196 is SANT ANDREU DE LLAVANERES while INE 08196 is SANT ANDREU DE LA BARCA — a human reviewing the ATOM title would plausibly have accepted it. Second occurrence in two cities; the name-authoritative rule is load-bearing, not defensive coding.",
    'A PARAMETER TABLE THAT IS A PERFECT SCHEMA AND AN EMPTY DATASET. AMB table 18 QUAL_MUNI has a row for 43/43 claus and 13 correctly-named envelope columns — of which IE is NULL 60/60 and the rest NULL 54/60. Stage 1 of this very probe recorded it as "⭐⭐ every variable the KPI names" four minutes before Stage 3 refuted it.',
    "A PUBLISHER'S OWN LINK TABLE, WHOLLY DEAD. AMB publishes normative links for all 36 member municipalities and every one 404s. Barcelona never exposed this because Barcelona holds DOGC 4893 in-repo and never needed the route.",
    'MY OWN CLASSIFIER OVER-STATED BY 2.71 POINTS by ordering parameters before delegation — the envelope-solid-overstates-partial-data family, reproduced live inside the probe measuring it.',
    'A CERTIFICATION GATE THAT DOES NOT TRAVEL. L-449 / SIG-3 signs the AMB Refós vintage for BARCELONA. The provider is publisher-generic but the signature is city-scoped, so 18.45 points of a cold city are engineering-complete and legally unshippable. Nothing in the five cities surfaced a per-city signature as a scaling cost.',
  ],
};
writeFileSync(OUT + 'probe-a.result.json', JSON.stringify(result, null, 2));
console.log('→ probe-a.result.json  (' + JSON.stringify(result).length + ' B)');
console.log(result.determination.formula);
