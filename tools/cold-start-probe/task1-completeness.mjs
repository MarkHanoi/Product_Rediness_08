#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// TASK 1 (REFRAMED) — COMPLETE-VALUE-SET COUNT over Probe A's envelope points
// Sant Andreu de la Barca, INE 08196. N = 2,472 cadastral parcels.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ WHAT THIS DELIBERATELY DOES NOT DO. It does NOT ask "would this publish if the signature were
//    not city-scoped". That is a counterfactual about a regime that does not exist and it would
//    manufacture a number. No "would publish" figure is computed anywhere in this file.
//
// WHAT IT MEASURES — did the compiler FINISH? A point is COMPLETE only if ALL of:
//    (1) every variable the envelope synthesis requires is resolved TO A VALUE,
//        from a NAMED SOURCE, at a NAMED RUNG of the C64 §4 ladder;
//    (2) every applicable constraint is APPLIED, or EXPLICITLY REFUSED;
//    (3) no nulls;
//    (4) no assumed defaults   — a value that arrived by falling back is NOT resolved;
//    (5) no inherited values   — a value borrowed from a parent/neighbouring scope because this
//                                scope had none is NOT resolved. (This is the Córdoba
//                                fabricated-setback shape, and the Barcelona-table-on-another-
//                                municipality shape.)
//
// ⚠ ON (5), THE JUDGEMENT IS STATED RATHER THAN HIDDEN. A per-ZONE published parameter (the zone
//   states the number; every parcel in the zone takes it) is RESOLUTION, not inheritance — that is
//   how zoning works. Inheritance means: this scope had no value, so a value from a DIFFERENT
//   scope was used in its place. Both are counted and reported separately so the reader can apply
//   the stricter reading if they disagree.
//
// C64 §4 ladder rungs: 0 method-prescribed · 1 published-value · 2 published-geometry
//                      3 published-annotation · 4 referenced-instrument · 5 constructed · 6 unknown
//
// R1: the PLANTES parse is the SHIPPED regex, asserted byte-present in the production file.
// R5: network errors / refusals / genuine empties counted separately.
// Deterministic and re-runnable: no randomness; inputs are the committed Probe-A artefacts + live reads.
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PA = join(HERE, 'probe-a');
const OUT = join(HERE, 'out');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SVC = 'https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer';
const INE = '08196';

const PROD = join(HERE, '..', '..', 'packages', 'site-parcel-data', 'src');
const PROD_OV = readFileSync(join(PROD, 'providers', 'bcnRefosOVProvider.ts'), 'utf8');
const _PROD_ALC = readFileSync(join(PROD, 'rulepacks', 'bcnAlcadaReguladora.ts'), 'utf8');
const RE_LIT = String.raw`/^(B|PX)\+(\d{1,2})(\+A)?$/`;
if (!PROD_OV.includes(RE_LIT)) throw new Error('REPLICA DRIFT: shipped parsePlantes regex changed. Fix the probe.');
function parsePlantes(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim().toUpperCase();
    if (s === '') return null;
    const m = /^(B|PX)\+(\d{1,2})(\+A)?$/.exec(s);
    if (!m) return null;
    const f = Number.parseInt(m[2], 10);
    if (!Number.isFinite(f) || f < 1 || f > 60) return null;
    return { raw: s, floorsAboveGround: f, totalStoreys: 1 + f + (m[3] ? 1 : 0), hasAttic: m[3] !== undefined };
}

const net = [];
async function read(url, label) {
    const t0 = Date.now();
    try {
        const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(180000) });
        const b = await r.text();
        net.push({ label, url: url.slice(0, 150), httpStatus: r.status, contentType: r.headers.get('content-type'), bytes: b.length, ms: Date.now() - t0, outcome: r.ok ? 'ok' : 'http-error' });
        return r.ok ? JSON.parse(b) : null;
    } catch (e) {
        net.push({ label, url: url.slice(0, 150), httpStatus: null, contentType: null, bytes: 0, ms: Date.now() - t0, outcome: 'network-error', error: String(e && e.message) });
        return null;
    }
}
const inRing = (x, y, ring) => { let s = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) s = !s; } return s; };
const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';

const st4 = JSON.parse(readFileSync(join(PA, 'stage4.parcels.json'), 'utf8'));
const qm = JSON.parse(readFileSync(join(PA, 'stage3.qualmuni.raw.json'), 'utf8'));
const qmByClau = new Map(qm.map((r) => [String(r.CODI_MUN).slice(6), r]));
const N = st4.n;

const ovj = await read(`${SVC}/17/query?${new URLSearchParams({ f: 'json', where: `CODI_INE='${INE}'`, outFields: '*', returnGeometry: 'true', outSR: '4326' })}`, 'layer17');
if (!ovj) throw new Error('layer 17 UNREADABLE — UNKNOWN, not empty. Refusing to report any count.');
const ovFeats = ovj.features.map((f) => ({ a: f.attributes, rings: f.geometry?.rings ?? [] }));
// NEGATIVE PROOF on the layer-17 schema: is there ANY height-bearing field we ignored?
const l17meta = await read(`${SVC}/17?f=json`, 'layer17-schema-negative-proof');
const l17fields = (l17meta?.fields ?? []).map((f) => f.name);
const heightFieldCandidates = l17fields.filter((n) => /ALC|ALT|HEIGHT|ARM|COTA|MET/i.test(n));
// NEGATIVE PROOF on ARM: ask the SERVER for rows where ARM is populated, rather than trusting a local null test.
const armj = await read(`${SVC}/18/query?${new URLSearchParams({ f: 'json', where: `CODI_MUN LIKE '${INE}%' AND ARM IS NOT NULL`, outFields: 'CODI_MUN,ARM', returnGeometry: 'false' })}`, 'table18-ARM-not-null');
const clausWithArm = new Set((armj?.features ?? []).map((f) => String(f.attributes.CODI_MUN).slice(6)));

// ── the variable sets the two envelope kinds actually require ──────────────────────────────────
// explicit-area (OV): the published ring IS the footprint, so setbacks/coverage are superseded by
//   geometry (C64 §2.1 — published geometry outranks constructed geometry). What remains is the
//   ring, the storey count, and the metre height layer 7 extrudes with.
// setback (QUAL_MUNI): the footprint is CONSTRUCTED from the parcel by insetting, so every setback,
//   the coverage cap, the height and the storey count are all required.
const V = (variable, source, rung, value, extra = {}) => ({ variable, resolved: value !== null && value !== undefined, source, rung, value, ...extra });
const UNRES = (variable, why, extra = {}) => ({ variable, resolved: false, source: null, rung: 6, value: null, why, ...extra });

const rows = [];
for (const p of st4.results) {
    if (p.state === 'outside-zoning') continue;
    const clau = p.clau, norm = String(p.normativ ?? ''), plan = String(p.plan ?? '');
    const delegated = norm === 'Asterisc' || plan.includes('PD*');
    let ov = null;
    for (const g of ovFeats) { let ins = false; for (const rg of g.rings) if (inRing(p.lon, p.lat, rg)) ins = !ins; if (ins) { ov = g; break; } }
    const pl = ov ? parsePlantes(ov.a.PLANTES) : null;
    const q = qmByClau.get(clau) ?? null;

    let kind = null, vars = [], constraints = [];
    if (pl) {
        kind = 'explicit-area (OV_Trames)';
        vars = [
            V('buildable-footprint-ring', 'AMB Refos layer 17 OV_Trames geometry', 2, `ring[${ov.rings[0]?.length ?? 0}] EPSG:4326`),
            V('storey-count', 'AMB Refos layer 17 OV_Trames.PLANTES', 3, pl.totalStoreys, { raw: pl.raw }),
            clausWithArm.has(clau)
                ? V('height-metres', `AMB Refos table 18 QUAL_MUNI ${INE}_${clau}.ARM`, 1, q?.ARM)
                : UNRES('height-metres',
                    `No metre height is published for clau '${clau}' on any layer of this service. Layer 17 carries no height-bearing field (schema checked: ${l17fields.length} fields, height-name candidates found = ${heightFieldCandidates.length ? heightFieldCandidates.join(',') : 'NONE'}); table 18 ARM is populated for only ${clausWithArm.size} claus and '${clau}' is not among them (server-side ARM IS NOT NULL query). PLANTES is a storey COUNT, not a height. Closing it needs a storeys->metres module from the governing instrument (${norm.split('.')[0]}), whose text was unobtainable at Probe A Stage 2.`,
                    { wouldBeInheritedIfTaken: 'PGM Art. 327.2a as MODIFIED for «al terme municipal de Barcelona» (MPGM 02-03-2007, DOGC 4893), read by heightFromFloorsAboveGround() — a DIFFERENT municipality\'s instrument. Taking it would be an INHERITED value and is therefore not counted as resolved.' }),
        ];
        constraints = [
            { constraint: 'zone-qualification', state: 'applied', source: 'layer 16 polygon' },
            { constraint: 'volumetric-ordering footprint', state: 'applied', source: 'layer 17 polygon' },
            { constraint: 'delegation to a pla derivat', state: delegated ? 'NOT-RESOLVED — flagged Asterisc/PD*, and whether the OV footprint IS that derived plan is unverified (POUM text unobtainable)' : 'not-applicable (no delegation flag)' },
            { constraint: 'downward overlays (heritage/flood/airport)', state: 'NOT-APPLIED-AND-NOT-REFUSED — no overlay sweep has been run for this municipality at all' },
        ];
    } else if (q && has(q.ARM) && has(q.N_PLANTES) && has(q.OCUP_MAX) && has(q.SEP_FVIAL)) {
        kind = 'setback (QUAL_MUNI)';
        const src = `AMB Refos table 18 QUAL_MUNI CODI_MUN=${INE}_${clau}`;
        vars = [
            V('height-metres', src + '.ARM', 1, q.ARM),
            V('storey-count', src + '.N_PLANTES', 1, q.N_PLANTES),
            V('max-coverage-pct', src + '.OCUP_MAX', 1, q.OCUP_MAX),
            V('setback-front-m', src + '.SEP_FVIAL', 1, q.SEP_FVIAL),
            has(q.SEP_LAT) ? V('setback-side-m', src + '.SEP_LAT', 1, q.SEP_LAT) : UNRES('setback-side-m', 'SEP_LAT NULL'),
            has(q.SEP_FONS) ? V('setback-rear-m', src + '.SEP_FONS', 1, q.SEP_FONS) : UNRES('setback-rear-m', 'SEP_FONS NULL'),
            has(q.IE) ? V('plot-ratio-FAR', src + '.IE', 1, q.IE)
                : UNRES('plot-ratio-FAR', `IE is NULL for all 60 QUAL_MUNI rows of this municipality. ⚠ INDISTINGUISHABLE: a NULL here cannot be told apart from "FAR does not apply to this ordering type" versus "FAR applies and is unpublished". The probe does NOT choose. Under C64 §3.3 an unapplied downward constraint can only OVER-state, so this is counted as INCOMPLETE rather than assumed inapplicable.`,
                    { indistinguishable: 'no-data vs not-applicable' }),
        ];
        constraints = [
            { constraint: 'zone-qualification', state: 'applied', source: 'layer 16 polygon' },
            { constraint: 'min parcel area (S_MIN_PAR)', state: has(q.S_MIN_PAR) ? 'applied' : 'NOT-RESOLVED' },
            { constraint: 'min frontage (F_MIN_PAR)', state: has(q.F_MIN_PAR) ? 'applied' : 'NOT-RESOLVED' },
            { constraint: 'FAR ceiling (IE)', state: has(q.IE) ? 'applied' : 'NOT-APPLIED — IE NULL; see the indistinguishability note' },
            { constraint: 'delegation to a pla derivat', state: delegated ? 'NOT-RESOLVED — Asterisc/PD*' : 'not-applicable' },
            { constraint: 'downward overlays (heritage/flood/airport)', state: 'NOT-APPLIED-AND-NOT-REFUSED — no overlay sweep for this municipality' },
        ];
    } else continue; // not an envelope point; out of scope for a COMPLETENESS measure of the envelope output

    const missingVars = vars.filter((v) => !v.resolved);
    const openConstraints = constraints.filter((c) => /NOT-RESOLVED|NOT-APPLIED/.test(String(c.state)));
    rows.push({
        ref: p.ref, clau, plan, normativ: norm, kind,
        complete: missingVars.length === 0 && openConstraints.length === 0,
        variables: vars, constraints,
        missingVariables: missingVars.map((v) => ({ variable: v.variable, failedAtRung: v.rung, why: v.why ?? null, indistinguishable: v.indistinguishable ?? null })),
        openConstraints: openConstraints.map((c) => ({ constraint: c.constraint, state: c.state })),
    });
}

// ── report ────────────────────────────────────────────────────────────────────────────────────
const pc = (x) => +((100 * x) / N).toFixed(2);
const byKind = (k) => rows.filter((r) => r.kind === k);
const summarise = (list, label) => {
    const complete = list.filter((r) => r.complete).length;
    const missTally = new Map(), consTally = new Map();
    for (const r of list) {
        for (const m of r.missingVariables) missTally.set(m.variable, (missTally.get(m.variable) ?? 0) + 1);
        for (const c of r.openConstraints) consTally.set(c.constraint, (consTally.get(c.constraint) ?? 0) + 1);
    }
    return { label, points: list.length, pctOfMunicipality: pc(list.length), complete, incomplete: list.length - complete, missingVariableTally: [...missTally].sort((a, b) => b[1] - a[1]), openConstraintTally: [...consTally].sort((a, b) => b[1] - a[1]) };
};
const ovSum = summarise(byKind('explicit-area (OV_Trames)'), 'THE 18.45 POINTS — explicit-area via OV_Trames');
const qmSum = summarise(byKind('setback (QUAL_MUNI)'), 'THE 35.60 POINTS — setback via QUAL_MUNI (reported alongside; the founder\'s split named it "shippable today")');

const result = {
    probe: 'TASK-1 (reframed) · complete-value-set count',
    question: 'Did the compiler FINISH? — not "would it publish". No publishability figure is computed.',
    municipality: { ine: INE, name: 'Sant Andreu de la Barca', instrumentRoot: 'num_poum_sant_andreu_de_la_barca (its OWN POUM, not the PGM)' },
    denominator: { unit: 'cadastral parcel, every parcel weighs 1', N },
    completenessCriteria: ['variable resolved from a named source at a named rung', 'every applicable constraint applied or explicitly refused', 'no nulls', 'no assumed defaults', 'no inherited values'],
    negativeProofs: {
        layer17HeightField: { fieldsChecked: l17fields, heightNameCandidates: heightFieldCandidates, conclusion: heightFieldCandidates.length === 0 ? 'layer 17 publishes NO height-bearing field — proven from the schema, not inferred from a null' : 'CANDIDATES FOUND — investigate before concluding' },
        table18Arm: { method: 'server-side `ARM IS NOT NULL` filter, not a local null test', clausWithArmPopulated: [...clausWithArm].sort(), count: clausWithArm.size },
    },
    summary: { ov: ovSum, qualMuni: qmSum },
    rows,
    network: net,
};
writeFileSync(join(OUT, 'task1-completeness.json'), JSON.stringify(result, null, 1));

console.log(`── TASK 1 · COMPLETE-VALUE-SET COUNT (N = ${N} cadastral parcels, ${INE} Sant Andreu de la Barca) ──\n`);
console.log(`NEGATIVE PROOF · layer 17 height field: ${heightFieldCandidates.length === 0 ? 'NONE of ' + l17fields.length + ' fields is height-bearing (schema-proven)' : 'CANDIDATES ' + heightFieldCandidates.join(',')}`);
console.log(`NEGATIVE PROOF · table 18 ARM populated for ${clausWithArm.size} claus (server-side IS NOT NULL): ${[...clausWithArm].sort().join(' ')}\n`);
for (const s of [ovSum, qmSum]) {
    console.log(`▶ ${s.label}`);
    console.log(`   points ${s.points} (${s.pctOfMunicipality} % of the municipality)`);
    console.log(`   ⭐ COMPLETE ${s.complete}   ·   INCOMPLETE ${s.incomplete}`);
    if (s.missingVariableTally.length) { console.log(`   missing VARIABLES (points affected):`); for (const [k, v] of s.missingVariableTally) console.log(`      ${String(v).padStart(4)}  ${k}`); }
    if (s.openConstraintTally.length) { console.log(`   open CONSTRAINTS (points affected):`); for (const [k, v] of s.openConstraintTally) console.log(`      ${String(v).padStart(4)}  ${k}`); }
    console.log('');
}
console.log('→ out/task1-completeness.json');
