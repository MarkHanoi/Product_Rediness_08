#!/usr/bin/env node
// PROBE A · STAGE 5 — DETERMINATION. Both outcomes count: a computed envelope, or a cited refusal
// naming the governing article.
//
// Produces:
//   (1) ONE worked determination on a NAMED parcel — the full chain, source-cited, with the
//       intermediate numbers, so a third party can re-derive it.
//   (2) ONE worked cited REFUSAL on a NAMED parcel.
//   (3) The programme-level split: Determination % = Envelope % + Refusal %, refusals categorised.
//
// ⚠ Every envelope produced here is an UPPER BOUND WITH A MISSING CEILING: airport surfaces, flood
// zones and infrastructure easements are UNMODELLED PROGRAMME-WIDE. Nothing below is a permit.
import { writeFileSync, readFileSync } from 'node:fs';
const OUT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/.claude/worktrees/agent-a1e8e521bbaeb782e/tools/cold-start-probe/probe-a/';
const st4 = JSON.parse(readFileSync(OUT + 'stage4.parcels.json', 'utf8'));
const ov = JSON.parse(readFileSync(OUT + 'stage4b.ov.json', 'utf8'));
const qm = JSON.parse(readFileSync(OUT + 'stage3.qualmuni.raw.json', 'utf8'));
const qmByClau = new Map(qm.map((r) => [String(r.CODI_MUN).slice(6), r]));
const N = st4.n;

// ── (1) a worked ENVELOPE on a named parcel, clau 9 (largest fully-parameterised zone) ──
const p = st4.results.find((r) => r.clau === '9' && r.state === 'envelope');
const q = qmByClau.get('9');
// Catastro publishes the official parcel area; take it from the frame record if present.
const envelope = {
  parcel: p.ref, lat: p.lat, lon: p.lon,
  clau: p.clau, normativ: p.normativ, plan: p.plan,
  governingArticle: 'POUM de Sant Andreu de la Barca, ' + p.normativ.replace('num_poum_sant_andreu_de_la_barca.', '').replace('titol_', 'Títol ').replace('.capitol_', ', Capítol '),
  citationSource: 'AMB Refós de Planejament, qualificacio_refos_3857 layer 16 QU_Trames, field NORMATIV (read live, HTTP 200)',
  parameters: {
    ARM_alcada_reguladora_maxima_m: q.ARM,
    N_PLANTES: q.N_PLANTES,
    OCUP_MAX_pct: q.OCUP_MAX,
    SEP_FVIAL_m: q.SEP_FVIAL, SEP_LAT_m: q.SEP_LAT, SEP_FONS_m: q.SEP_FONS,
    S_MIN_PAR_m2: q.S_MIN_PAR, F_MIN_PAR_m: q.F_MIN_PAR, DENS_U: q.DENS_U,
    IE_index_edificabilitat: q.IE, // NULL — recorded, not defaulted
  },
  parameterSource: 'AMB Refós, MapServer TABLE 18 QUAL_MUNI, key CODI_MUN=08196_9 (read live, HTTP 200)',
  method: 'setback-and-coverage envelope: buildable footprint = parcel ring eroded by SEP_FVIAL at the street frontage / SEP_LAT laterally / SEP_FONS at the rear, then CAPPED at OCUP_MAX % of parcel area; height = min(ARM, N_PLANTES storeys). NO FAR cap is applied because IE is NULL — recorded as an absent constraint, never as "unlimited".',
  worked_example_on_a_nominal_800m2_parcel: {
    parcelArea_m2: 800,
    ocupacioCap_m2: 800 * (q.OCUP_MAX / 100),
    maxHeight_m: q.ARM,
    maxStoreys: Number(q.N_PLANTES),
    grossFloorArea_upperBound_m2: 800 * (q.OCUP_MAX / 100) * Number(q.N_PLANTES),
    note: 'the setback erosion is parcel-shape dependent and binds BELOW this coverage cap on narrow parcels; S_MIN_PAR=' + q.S_MIN_PAR + ' m2 means a parcel under that area is not independently buildable at all.',
  },
  tier: 'estimated-ruleset — NOT structured. Two reasons: (a) the AMB Refós is a transcripció, whose vintage/authority gate for THIS municipality is unsigned; (b) the POUM article TEXT is unobtainable (Stage 2), so the parameters are cited-by-pointer, not quoted from bytes we hold.',
  missingCeiling: 'airport / flood / infrastructure constraints are UNMODELLED PROGRAMME-WIDE. This is an upper bound.',
};

// ── (2) a worked cited REFUSAL on a named parcel ──
const r = st4.results.find((x) => x.state === 'refuse-delegated');
const refusal = {
  parcel: r.ref, lat: r.lat, lon: r.lon, clau: r.clau, plan: r.plan, normativ: r.normativ,
  outcome: 'REFUSE',
  citedReason: `clau ${r.clau} is flagged PLAN='${r.plan}' with NORMATIV='${r.normativ}' in the AMB Refós. The POUM delegates this land's buildability to a plà derivat (a derived plan) which is not in our corpus. Returning Unknown rather than inferring entitlement (ADR-0283).`,
  category: 'delegated to an instrument we do not hold',
};

// ── (3) the programme split ──
const envQual = st4.tally.envelope;                 // 951 via QUAL_MUNI parameters
const envOv = ov.converts;                          // 452 additionally via OV_Trames footprint+PLANTES
const envTotal = envQual + envOv;
const refDelegated = st4.tally['refuse-delegated'] - (ov.convertedFrom['refuse-delegated'] || 0);
const refNoParams = st4.tally['refuse-no-parameters'] - (ov.convertedFrom['refuse-no-parameters'] || 0);
const refTerminal = st4.tally['refuse-terminal'];
const outside = st4.tally['outside-zoning'];
const pc = (x) => +((100 * x) / N).toFixed(2);

const split = {
  denominator: `${N} cadastral parcels (Catastro INSPIRE CP, municipality of Sant Andreu de la Barca, DGC 08195 / INE 08196). Every parcel weighs 1.`,
  determinationPct: pc(envTotal + refDelegated + refNoParams + refTerminal),
  envelopePct: pc(envTotal),
  refusalPct: pc(refDelegated + refNoParams + refTerminal),
  noDeterminationPct: pc(outside),
  envelope: {
    total: pc(envTotal),
    via_QUAL_MUNI_parameters: pc(envQual),
    via_OV_Trames_footprint_and_PLANTES: pc(envOv),
    '⚠ gate': 'the OV_Trames component is behind the L-449 / SIG-3 certification gate, which is SIGNED FOR BARCELONA ONLY. For this municipality it is UNSIGNED ⇒ shippable-today envelope is the QUAL_MUNI component alone.',
    shippable_today_pct: pc(envQual),
    shippable_after_one_signature_pct: pc(envTotal),
  },
  refusals: {
    'legally terminal': { pct: pc(refTerminal), n: refTerminal, why: 'systems / non-buildable land (Títol 6 & 7 claus: 18a viari, V verd, P, E, SH …). No private envelope exists to compute — the refusal IS the correct answer.' },
    'delegated to an instrument we do not hold': { pct: pc(refDelegated), n: refDelegated, why: "PLAN='PD*' / NORMATIV='Asterisc' — the POUM points buildability at a plà derivat outside our corpus. Same shape as Barcelona's ~2,600 derived partial plans (signed out of scope)." },
    'gated on external authority': { pct: pc(refNoParams), n: refNoParams, why: 'a QUAL_MUNI row EXISTS for the clau but every envelope field is NULL, and the POUM article text that would supply the figure is UNOBTAINABLE (Stage 2: AMB link table 404 programme-wide; RPUC query contract not reversed). The governing article can be NAMED but not READ. Exit = obtain the POUM Normes Urbanístiques text.' },
  },
  notADetermination: { 'outside-zoning': { pct: pc(outside), n: outside, why: 'parcel centroid falls outside every layer-16 polygon. NOT folded into any rate (R5).' } },
};

const result = {
  probe: 'PROBE A — cold start, AMB Refós publisher',
  city: 'Sant Andreu de la Barca', ine: '08196', dgc: '08195', province: '08 Barcelona',
  selectionRule: "universe = the 36 distinct CODI_INE on AMB layer 16, sorted ascending as strings; exclude 08019 Barcelona (reference city) and the four AMB municipalities that already have a rulepack (08015 Badalona, 08073 Cornellà, 08101 L'Hospitalet, 08200 Sant Boi) as not-cold; N=31 remain; take the median by 0-based index floor(31/2)=15. Stated and logged BEFORE any work on the city.",
  coldnessVerified: "grep -rn '08196|Sant Andreu de la Barca' across the repo (ex node_modules) → 0 real hits",
  optimisticBound: 'AMB Refós is unusually good data — a single publisher serving 36 municipalities with a per-clau numeric parameter table AND a vectorised volumetric layer. This probe is an OPTIMISTIC BOUND on municipal onboarding cost, NOT a median.',
  determination: split,
  workedEnvelope: envelope,
  workedRefusal: refusal,
  missingCeiling: 'airport surfaces, flood zones and infrastructure easements are UNMODELLED PROGRAMME-WIDE. Every envelope in this report is an upper bound with a missing ceiling. No Tier 1 claim is made.',
};
writeFileSync(OUT + '../probe-a.result.json', JSON.stringify(result, null, 2));

console.log('── DETERMINATION SPLIT (N = ' + N + ' cadastral parcels) ──');
console.log(`Determination ${split.determinationPct}% = Envelope ${split.envelopePct}% + Refusal ${split.refusalPct}%`);
console.log(`   envelope via QUAL_MUNI params : ${pc(envQual)}%  (${envQual})   ← shippable today`);
console.log(`   envelope via OV_Trames        : ${pc(envOv)}%  (${envOv})   ← behind an UNSIGNED cert gate`);
console.log('refusals:');
for (const [k, v] of Object.entries(split.refusals)) console.log(`   ${k.padEnd(45)} ${String(v.pct).padStart(6)}%  (${v.n})`);
console.log(`no determination (outside zoning): ${split.noDeterminationPct}% (${outside})`);
console.log('\n── worked envelope, parcel ' + envelope.parcel + ' (clau 9) ──');
console.log('  ' + envelope.governingArticle);
console.log('  ARM=' + q.ARM + 'm  N_PLANTES=' + q.N_PLANTES + '  OCUP_MAX=' + q.OCUP_MAX + '%  setbacks ' + q.SEP_FVIAL + '/' + q.SEP_LAT + '/' + q.SEP_FONS + 'm  S_MIN_PAR=' + q.S_MIN_PAR + 'm2  IE=NULL');
console.log('  on a nominal 800 m2 parcel → footprint ≤ ' + envelope.worked_example_on_a_nominal_800m2_parcel.ocupacioCap_m2 + ' m2, height ≤ ' + q.ARM + ' m / ' + q.N_PLANTES + ' storeys, GFA upper bound ' + envelope.worked_example_on_a_nominal_800m2_parcel.grossFloorArea_upperBound_m2 + ' m2');
console.log('\n── worked refusal, parcel ' + refusal.parcel + ' (clau ' + refusal.clau + ') ──');
console.log('  ' + refusal.citedReason);
console.log('\n→ probe-a.result.json');
