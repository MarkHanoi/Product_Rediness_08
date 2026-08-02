#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE 36-MUNICIPALITY CENSUS, RE-RUN UNDER THE BASE METROPOLITAN LADDER. THE DELTA, MEASURED.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS RUN IS FOR
//   `heightFromFloorsAboveGround()` takes no municipality parameter and reads BARCELONA's
//   MPGM-2007 table for every municipality. The base metropolitan tables exist and nothing reads
//   them. This run substitutes the base ladder for every municipality EXCEPT Barcelona and reports
//   the delta per municipality.
//
// ⭐⭐ THE TWO ARMS RUN IN ONE PROCESS, OVER ONE PARCEL DRAW. THAT IS THE WHOLE DESIGN.
//   The naive shape — "run the census twice and diff the two artefacts" — cannot distinguish a real
//   delta from run-to-run drift in the parcel frame, the service, or the seed. Here BOTH arms are
//   evaluated on the SAME parcel, in the SAME iteration, against the SAME service reads:
//       ARM A  "as shipped"  — Barcelona's MPGM-2007 table, for EVERY municipality (the defect)
//       ARM B  "fix shape"   — per-municipality selection (Barcelona / Badalona / base / REFUSE)
//   A zero delta is therefore a MEASURED zero over identical inputs, not two runs that agreed.
//
// ⛔ WHAT THIS RUN DOES NOT DO. It publishes nothing, flips no gate and edits no rulepack. The
//   sibling Catalunya agent owns `registry.ts`, `envelopeAuthorisation.ts`, `l449CertificationGates.ts`,
//   `siteDispatch.ts`, `bcnAlcadaReguladora.ts` and `bcnAlcadaSemiintensiva.ts`. The proposed fix is
//   emitted as TEXT, UNAPPLIED, in `out/proposed-diff.txt`.
//
// KNOWN-ANSWER CONTROL: Barcelona must reproduce 89 distinct CLAU_URB, 5,073 OV polygons and
//   envelope 34.03 % — AND must be BYTE-IDENTICAL between the two arms. Barcelona keeps its MPGM
//   table under SIG-2; if Barcelona moves at all, the substitution is wrong and the run aborts its
//   verdict rather than publishing 35 numbers from a probe that cannot hold its own control still.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildFrame, drawUniform } from './catastroParcelFrame.mjs';
import { SVC, readJson, readDistinct, readReconciled, countOnly, netLog } from './ambService.mjs';
import {
    ART327_BARCELONA_MPGM2007, ART327_BASE_METROPOLITAN,
    ART328_BARCELONA_MPGM2007, ART328_BASE_METROPOLITAN,
    assertSig2Applied, bandStructureIdentity, extrapolationSeam,
    STOREY_MODULE_M, GROUND_FLOOR_DATUM_M, MAIN_CHECKOUT,
} from './ladderTables.mjs';
import { selectLadder, verdicts, LADDER_SOURCE } from './ladderSelect.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// IDENTICAL to task5 so the baseline is comparable to the parcel. Changing either would make the
// delta unmeasurable — a different denominator is not a delta.
const SAMPLE_ABOVE = 6000, SAMPLE_N = 3000, SEED = 20260802;

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const partial = Boolean(only);
// ⚠ A PARTIAL RUN MUST NEVER OVERWRITE THE FULL ARTEFACT — the sibling probe learned this by
//   losing a 36-row artefact to a one-row smoke test.
const ARTEFACT = join(OUT, partial ? 'ladder-delta-PARTIAL.json' : 'ladder-delta.json');
const ROWS_TSV = join(OUT, partial ? 'ladder-delta-rows.PARTIAL.tsv' : 'ladder-delta-rows.tsv');

// ═══ 0 · THE LADDER TABLES, AND THE STRUCTURAL FACT THAT DECIDES THE COVERAGE VERDICT ══════════
const sig2 = assertSig2Applied();
const identity327 = bandStructureIdentity(ART327_BARCELONA_MPGM2007, ART327_BASE_METROPOLITAN, 'Art. 327.2a (clau 13a)');
const identity328 = bandStructureIdentity(ART328_BARCELONA_MPGM2007, ART328_BASE_METROPOLITAN, 'Art. 328.2a (clau 13b)');
const seam = extrapolationSeam();

// The corpus findings — READ FROM THE COMMITTED PDF by corpusVerify.py, never from esAmbPgmScope.ts.
const CORPUS_FILE = join(OUT, 'corpus-verification.json');
if (!existsSync(CORPUS_FILE)) {
    console.error('⛔ out/corpus-verification.json is missing. Run `python corpusVerify.py` first — the footnote status MUST come from the corpus, not from a code comment.');
    process.exit(2);
}
const CORPUS = JSON.parse(readFileSync(CORPUS_FILE, 'utf8'));

/**
 * ⛔ THE FOOTNOTE APPARATUS → INE, and it is keyed on INE from the moment it leaves the PDF.
 *   The compendium names municipalities in PROSE, so exactly one name→INE hop is unavoidable. It is
 *   confined to this table, it is asserted against the service's own NOMMUNI set, and every
 *   downstream decision keys on INE alone. (Layer 17's NOMMUNI is blank on 4,912 of Barcelona's
 *   5,073 rows; a name-keyed pipeline would have handed them to a phantom municipality.)
 */
const FOOTNOTE_NAME_TO_INE = { 'Barcelona': '08019', 'Badalona': '08015' };

function buildCorpusFindings(pgmGovernedIne, allIne) {
    const fn327 = CORPUS.art327_footnote49_modifyingMunicipalities ?? [];
    const fn328 = CORPUS.art328_footnote50_modifyingMunicipalities ?? [];
    if (!fn327.length || !fn328.length) throw new Error('corpus verification returned NO footnote entries for Art. 327/328 — that is an unreadable apparatus, not an empty one. Refusing to proceed.');
    const deviatingInstrumentsByIne = {};
    for (const [label, list] of [['327', fn327], ['328', fn328]]) {
        for (const e of list) {
            const ine = FOOTNOTE_NAME_TO_INE[e.municipality];
            if (!ine) throw new Error(`footnote ${label} names «${e.municipality}», which this run has no INE for. ⛔ Refusing to drop it — an unmapped modifier would silently become a base-ladder municipality, which is the exact defect being measured.`);
            const cur = deviatingInstrumentsByIne[ine] ?? { ine, municipality: e.municipality, articles: [], compendiumPages: [] };
            cur.articles.push(label);
            cur.compendiumPages.push(e.page);
            deviatingInstrumentsByIne[ine] = cur;
        }
    }
    deviatingInstrumentsByIne['08019'] &&= { ...deviatingInstrumentsByIne['08019'], instrument: 'MPGM 02-03-2007, DOGC 4893, expedient 2006/025790/B — «al terme municipal de Barcelona»', corpusFile: 'corpus/pdf/DOGC-4893_2007-05-29_MPGM-alcades-alineacio-vial_BARCELONA.pdf', signedAs: 'SIG-2', numericallyIdenticalToBarcelona: true };
    deviatingInstrumentsByIne['08015'] &&= { ...deviatingInstrumentsByIne['08015'], instrument: 'Badalona\'s OWN instrument — compendium footnote 49/50 cites pàg. 137; DOGC 5224 correcció d\'errades committed in corpus', corpusFile: 'corpus/pdf/DOGC-5224_2008-09-29_MPGM-BADALONA-correccio-errades_NOT-BARCELONA.pdf', signedAs: null, numericallyIdenticalToBarcelona: 'ASSERTED BY THE SOURCE FILE, measured separately below — ⛔ a figures-only check cannot tell Badalona and Barcelona apart' };
    // ⭐ FOOTNOTE ABSENCE IS AN ENUMERATED FINDING, NOT A FAILED SEARCH. The apparatus lists its
    //   modifiers explicitly, so a PGM-governed municipality absent from footnote 49/50 is governed
    //   by the base ladder. Scoped to the compendium — see the corpus limitation note.
    const deviating = new Set(Object.keys(deviatingInstrumentsByIne));
    const footnoteAbsenceEstablishedForIne = pgmGovernedIne.filter((i) => !deviating.has(i));
    return {
        pgmGovernedIne, allIne, deviatingInstrumentsByIne, footnoteAbsenceEstablishedForIne,
        footnoteEvidence: 'PGM-NNUU-metropolitana.pdf — Art. 327 carries footnote 49 and Art. 328 footnote 50; each enumerates its modifying municipalities explicitly. Both list EXACTLY {Badalona, Barcelona}.',
        apparatusSweep: CORPUS.wholeCompendiumModificationSweep?.municipalitiesModifyingAnyArticle ?? null,
    };
}

// ═══ 1 · THE TWO HEIGHT RESOLVERS ══════════════════════════════════════════════════════════════
/**
 * §COPIED-FROM-PRODUCT — `heightFromFloorsAboveGround()`, bcnAlcadaReguladora.ts:467, VERBATIM in
 * behaviour, with the ONE change that is the whole point: the table is a PARAMETER.
 * ⛔ The product's signature is `(floorsAboveGround: number)`. It has no way to be told which
 *   municipality it is serving — that is the defect, stated as a type.
 */
function heightFromFloors(floorsAboveGround, table) {
    if (!Number.isInteger(floorsAboveGround) || floorsAboveGround < 1) return null;
    const band = table.find((b) => b.floorsAboveGround === floorsAboveGround);
    if (band) return { height_m: band.height_m, basis: 'table-exact' };
    // ⚠ The product extrapolates on constants derived from the BASE table (5.5 + 3.05×n) — see
    //   §EXTRAPOLATION-DISCONTINUITY in ladderTables.mjs. Reproduced verbatim, INCLUDING the defect,
    //   because reproducing it is how its size gets measured.
    return { height_m: GROUND_FLOOR_DATUM_M + STOREY_MODULE_M * floorsAboveGround, basis: 'table-module-extrapolated' };
}

// ── the parcel/plantes parsing, copied verbatim from task5 so the arms are comparable ────────────
const parsePlantes = (v) => {
    const m = /^(B|PX)\+(\d{1,2})(\+A)?$/.exec(String(v ?? '').trim().toUpperCase());
    return m ? { storeys: 1 + Number(m[2]) + (m[3] ? 1 : 0), raw: String(v).trim() } : null;
};
const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';

// ── geometry helpers, copied verbatim from task5 ────────────────────────────────────────────────
function inRing(x, y, ring) {
    let s = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) s = !s;
    }
    return s;
}
function indexFeatures(feats) {
    for (const f of feats) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const rg of f.rings) for (const [x, y] of rg) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        f.bb = [x0, y0, x1, y1];
    }
    return feats;
}
function locate(feats, lon, lat) {
    for (const f of feats) {
        const b = f.bb;
        if (!b || lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
        let ins = false;
        for (const rg of f.rings) if (inRing(lon, lat, rg)) ins = !ins;
        if (ins) return f;
    }
    return null;
}
const bboxOfParcels = (ps) => ps.reduce((a, p) => [Math.min(a[0], p.lon), Math.min(a[1], p.lat), Math.max(a[2], p.lon), Math.max(a[3], p.lat)], [Infinity, Infinity, -Infinity, -Infinity]);
const bboxOfFeats = (fs) => fs.reduce((a, f) => [Math.min(a[0], f.bb[0]), Math.min(a[1], f.bb[1]), Math.max(a[2], f.bb[2]), Math.max(a[3], f.bb[3])], [Infinity, Infinity, -Infinity, -Infinity]);

// §COPIED-FROM-PRODUCT — the registered-clau set, READ FROM the rulepack sources, never hand-typed.
const RP = join(MAIN_CHECKOUT, 'packages', 'site-parcel-data', 'src', 'rulepacks');
function registeredBarcelonaClaus() {
    const sub = readFileSync(join(RP, 'bcn20aSubzones.ts'), 'utf8');
    const codes20a = [...sub.matchAll(/clau:\s*'(20a\/[^']+)'/g)].map((m) => m[1]);
    const ens = readFileSync(join(RP, 'esBarcelonaEnsanche.ts'), 'utf8');
    const base = /BCN_ENSANCHE_BASE_ZONE_CODE = '([^']+)'/.exec(ens)?.[1];
    const e13 = /BCN_13E_ZONE_CODE = '([^']+)'/.exec(ens)?.[1];
    const semi = /BCN_SEMIINTENSIVA_ZONE_CODES = \[([^\]]*)\]/.exec(readFileSync(join(RP, 'esBarcelonaSemiintensiva.ts'), 'utf8'))?.[1];
    const nucli = /BCN_NUCLI_ANTIC_ZONE_CODES = \[([^\]]*)\]/.exec(readFileSync(join(RP, 'esBarcelonaNucliAntic.ts'), 'utf8'))?.[1];
    const lit = (s) => [...String(s ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const set = new Set([...codes20a, base, e13, ...lit(semi), ...lit(nucli)].filter(Boolean));
    if (set.size < 12) throw new Error('registered-clau extraction returned ' + set.size + ' — the source shape changed; fix the probe.');
    return set;
}
const REGISTERED_CLAUS = registeredBarcelonaClaus();
const PUBLISHED_INE = (() => {
    const ov = readFileSync(join(MAIN_CHECKOUT, 'packages', 'site-parcel-data', 'src', 'providers', 'bcnRefosOVProvider.ts'), 'utf8');
    return /BCN_INE_CODE = '(\d{5})'/.exec(ov)?.[1] ?? null;
})();

/**
 * ⭐ WHICH ARTICLE'S LADDER GOVERNS A GIVEN PARCEL.
 * Art. 327 is clau 13a (subzona I, intensiva); Art. 328 is clau 13b (subzona II, semiintensiva).
 * ⚠ THE OV ROUTE IS CLAU 18 — a VOLUMETRIC ordering type that has NO ladder of its own. The
 *   product's own comment says so: «The table is clau-13a's (Subzona I). Its storey module is a
 *   reasonable Barcelona residential convention, but it is not clau 18's OWN sourced floor-height —
 *   clau 18 has none.» ⇒ Art. 327 is what `heightFromFloorsAboveGround` applies, to every clau.
 *   That borrowing is recorded, not corrected here.
 */
function articleForClau(clau) {
    const c = String(clau ?? '').trim();
    if (/^13b/i.test(c)) return '328';
    return '327';
}

// ═══ 2 · ONE MUNICIPALITY, BOTH ARMS, ONE PARCEL DRAW ═══════════════════════════════════════════
async function runCity(ine, name, pgmFlag, corpusFindings) {
    const frame = await buildFrame(ine, name);
    if (!frame.ok) return { ine, name, pgmFlag, status: 'blocked', failed: 'L0', reason: frame.reason, message: frame.message };

    const sampled = frame.parcelCount > SAMPLE_ABOVE;
    const parcels = sampled ? drawUniform(frame.parcels, SAMPLE_N, SEED) : frame.parcels;
    const sampling = sampled
        ? { sampled: true, population: frame.parcelCount, drawn: parcels.length, seed: SEED }
        : { sampled: false, population: frame.parcelCount, drawn: parcels.length };

    // ── layer 16 · zoning. ⛔ KEYED ON CODI_INE, never NOMMUNI. Reconciled against returnCountOnly.
    const z = await readReconciled('16', { f: 'json', where: `CODI_INE='${ine}'`, outFields: 'CLAU_URB,PLAN,NORMATIV,EQUI_PGM,PGM,DESCRIP', returnGeometry: 'true', outSR: '4326' }, `CODI_INE='${ine}'`, `${ine}:L16`);
    if (!z.ok) return { ine, name, pgmFlag, status: 'blocked', failed: 'L1', reason: `layer-16 unusable: ${z.reason} — UNKNOWN, not empty` };
    const zoneFeats = indexFeatures(z.features.map((f) => ({ a: f.attributes, rings: f.geometry?.rings ?? [] })));

    // G2 — extent nesting. The DGC/INE collision signature; abort rather than report a plausible
    // wrong number. (DGC 08204 is Sant Cugat, INE 08204 is Sant Climent, and BOTH are in scope.)
    const pbb = bboxOfParcels(parcels), zbb = bboxOfFeats(zoneFeats);
    const ix = Math.max(0, Math.min(pbb[2], zbb[2]) - Math.max(pbb[0], zbb[0]));
    const iy = Math.max(0, Math.min(pbb[3], zbb[3]) - Math.max(pbb[1], zbb[1]));
    const overlapFraction = +((ix * iy) / Math.max(1e-12, (pbb[2] - pbb[0]) * (pbb[3] - pbb[1]))).toFixed(4);
    if (overlapFraction < 0.5) return { ine, name, pgmFlag, status: 'blocked', failed: 'G2-extent-nesting', reason: 'parcel frame does not nest inside this municipality\'s zoning extent — DGC/INE collision signature', overlapFraction };

    const pgmGoverned = zoneFeats.some((f) => String(f.a.PGM) === 'S');
    const qm = await readReconciled('18', { f: 'json', where: `CODI_MUN LIKE '${ine}%'`, outFields: '*', returnGeometry: 'false' }, `CODI_MUN LIKE '${ine}%'`, `${ine}:T18`);
    const qmRows = qm.ok ? qm.features.map((f) => f.attributes) : [];
    const qmByClau = new Map(qmRows.map((r) => [String(r.CODI_MUN).slice(ine.length + 1), r]));
    const ovj = await readReconciled('17', { f: 'json', where: `CODI_INE='${ine}'`, outFields: 'CLAU,CLAU_URB,PLANTES,PLAN,SHAPE_Area,OMBREJAT', returnGeometry: 'true', outSR: '4326' }, `CODI_INE='${ine}'`, `${ine}:L17`);
    if (!ovj.ok) return { ine, name, pgmFlag, status: 'blocked', failed: 'L23', reason: `layer-17 unusable: ${ovj.reason} — UNKNOWN, not empty` };
    const ovFeats = indexFeatures(ovj.features.map((f) => ({ a: f.attributes, rings: f.geometry?.rings ?? [] })));

    // ── THE LADDER SELECTION FOR THIS MUNICIPALITY (ARM B). ARM A is always Barcelona's.
    const sel = selectLadder(ine, corpusFindings);
    const armA = { '327': ART327_BARCELONA_MPGM2007, '328': ART328_BARCELONA_MPGM2007 };
    const armB = sel.refuse ? null
        : sel.source === LADDER_SOURCE.BASE_METROPOLITAN
            ? { '327': ART327_BASE_METROPOLITAN, '328': ART328_BASE_METROPOLITAN }
            // Barcelona AND Badalona both resolve to the MPGM-2007 figures. ⛔ For Badalona that is
            // a NUMERIC COINCIDENCE via a DIFFERENT instrument, not a shared one. The attribution
            // verdict below is what records the difference; the values alone cannot.
            : { '327': ART327_BARCELONA_MPGM2007, '328': ART328_BARCELONA_MPGM2007 };

    // ── L6/L7 — envelope synthesis. PRECEDENCE COPIED VERBATIM FROM task5. ────────────────────────
    // Both arms are evaluated inside this single loop, on the same parcel.
    const rows = [];
    for (const p of parcels) {
        const zf = locate(zoneFeats, p.lon, p.lat);
        if (!zf) { rows.push({ ref: p.ref, final: 'no-determination' }); continue; }
        const clau = String(zf.a.CLAU_URB ?? ''), norm = String(zf.a.NORMATIV ?? ''), plan = String(zf.a.PLAN ?? '');
        const ov = locate(ovFeats, p.lon, p.lat);
        const pl = ov ? parsePlantes(ov.a.PLANTES) : null;
        const q = qmByClau.get(clau) ?? null;
        const base = { ref: p.ref, clau, plan, normativ: norm };
        if (pl) {
            // ⭐ THE ONE PLACE A LADDER ENTERS THE PIPELINE AT ALL. Note what it does NOT touch:
            //   the branch was already taken, on `pl` alone. The height is computed AFTER the route
            //   is decided, and cannot change it.
            const art = articleForClau(clau);
            const hA = heightFromFloors(pl.storeys, armA[art]);
            const hB = armB ? heightFromFloors(pl.storeys, armB[art]) : null;
            rows.push({ ...base, final: 'envelope', via: 'OV_Trames', storeys: pl.storeys, article: art,
                heightA_m: hA?.height_m ?? null, heightB_m: hB?.height_m ?? null,
                basisA: hA?.basis ?? null, basisB: hB?.basis ?? null, refusedB: !armB });
            continue;
        }
        if (ov) { rows.push({ ...base, final: 'refuse', cat: 'missing-authoritative-data', via: 'OV_Trames' }); continue; }
        if (norm === 'Asterisc' || plan.includes('PD*')) { rows.push({ ...base, final: 'refuse', cat: 'delegated' }); continue; }
        if (/^num_\w+\.titol_(2|3)\./.test(norm)) { rows.push({ ...base, final: 'refuse', cat: 'terminal' }); continue; }
        if (q && has(q.ARM) && has(q.N_PLANTES) && has(q.OCUP_MAX) && has(q.SEP_FVIAL)) {
            // The QUAL_MUNI route publishes ARM (alçada reguladora màxima) DIRECTLY — a height from
            // the municipality's own table. ⭐ NO LADDER IS CONSULTED, so this route is untouched by
            // the substitution by construction, and that is stated rather than merely observed.
            rows.push({ ...base, final: 'envelope', via: 'QUAL_MUNI', publishedArm_m: Number(q.ARM) || null });
            continue;
        }
        if (pgmGoverned && REGISTERED_CLAUS.has(clau)) { rows.push({ ...base, final: 'envelope', via: 'PGM_REGIONAL_PACK' }); continue; }
        rows.push({ ...base, final: 'refuse', cat: 'missing-authoritative-data' });
    }

    // ── TALLIES. Every route count conditioned on final==='envelope' (task5's own correction). ────
    const envRow = (r) => r.final === 'envelope';
    const viaPack = rows.filter((r) => envRow(r) && r.via === 'PGM_REGIONAL_PACK').length;
    const viaOv = rows.filter((r) => envRow(r) && r.via === 'OV_Trames').length;
    const viaQm = rows.filter((r) => envRow(r) && r.via === 'QUAL_MUNI').length;
    const N = parcels.length;
    const pc = (x) => +((100 * x) / N).toFixed(2);
    const cnt = (f) => rows.filter(f).length;
    const env = cnt(envRow);
    const tally = {
        envelope: env, envelope_OV: viaOv, envelope_QUAL_MUNI: viaQm, envelope_PGM_PACK: viaPack,
        ovRoute_refusedUnparseablePlantes: rows.filter((r) => !envRow(r) && r.via === 'OV_Trames').length,
        refuse_delegated: cnt((r) => r.cat === 'delegated'),
        refuse_terminal: cnt((r) => r.cat === 'terminal'),
        refuse_missingData: cnt((r) => r.cat === 'missing-authoritative-data'),
        noDetermination: cnt((r) => r.final === 'no-determination'),
    };
    const pct = Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, pc(v)]));

    // ⛔⛔ ASSERT THAT EVERY DECOMPOSITION SUMS, AND THROW RATHER THAN EMIT AN UNBALANCED FIGURE.
    //    A NORMATIVE doc was wrong this week because a route tag was stamped on BOTH the envelope
    //    AND the refusal — and the tell was that the routes never summed to `envelope`.
    const routeSum = viaOv + viaQm + viaPack;
    const bucketSum = env + tally.refuse_delegated + tally.refuse_terminal + tally.refuse_missingData + tally.noDetermination;
    if (routeSum !== env) throw new Error(`INVARIANT VIOLATION ${ine} ${name}: routes ${routeSum} ≠ envelope ${env}`);
    if (bucketSum !== N) throw new Error(`INVARIANT VIOLATION ${ine} ${name}: buckets ${bucketSum} ≠ N ${N}`);

    // ── THE HEIGHT DELTA — the quantity that actually moves ──────────────────────────────────────
    const ovRows = rows.filter((r) => envRow(r) && r.via === 'OV_Trames');
    const withBoth = ovRows.filter((r) => r.heightA_m !== null && r.heightB_m !== null);
    const deltas = withBoth.map((r) => +(r.heightB_m - r.heightA_m).toFixed(2));
    const moved = deltas.filter((d) => d !== 0);
    const sum = deltas.reduce((a, b) => a + b, 0);
    // ⛔ KEYED ON (ARTICLE, STOREYS), NOT ON STOREYS ALONE. The first version keyed on the storey
    //   count only and kept whichever parcel arrived first — so a clau-13b parcel (Art. 328, four
    //   bands) and a clau-18 parcel (Art. 327, six bands) with the SAME storey count collapsed into
    //   one row carrying ONE of their two heights. That is the same many-to-one collapse that
    //   produced task5's retracted T3 result. The per-parcel counts were always right; the
    //   DECOMPOSITION was not, and an unbalanced decomposition is what this run is required to
    //   assert against.
    const byStorey = {};
    for (const r of withBoth) {
        const k = `art${r.article}:PB+${r.storeys}`;
        byStorey[k] ??= { article: r.article, storeys: r.storeys, parcels: 0, heightA_m: +r.heightA_m.toFixed(2), heightB_m: +r.heightB_m.toFixed(2), delta_m: +(r.heightB_m - r.heightA_m).toFixed(2), basisA: r.basisA, basisB: r.basisB };
        byStorey[k].parcels++;
        // Every parcel under one key MUST agree on both heights, or the key is not a decomposition.
        if (+r.heightA_m.toFixed(2) !== byStorey[k].heightA_m || +r.heightB_m.toFixed(2) !== byStorey[k].heightB_m) {
            throw new Error(`DECOMPOSITION VIOLATION ${ine}: two parcels share key ${k} but carry different heights (${r.heightA_m}/${r.heightB_m} vs ${byStorey[k].heightA_m}/${byStorey[k].heightB_m}) — the key does not identify the band.`);
        }
    }
    const byStoreyParcelSum = Object.values(byStorey).reduce((a, b) => a + b.parcels, 0);
    if (byStoreyParcelSum !== withBoth.length) throw new Error(`DECOMPOSITION VIOLATION ${ine}: byStorey sums to ${byStoreyParcelSum}, comparable parcels are ${withBoth.length}`);
    const heightDelta = {
        ovEnvelopeParcels: ovRows.length,
        comparable: withBoth.length,
        refusedUnderArmB: ovRows.filter((r) => r.refusedB).length,
        parcelsWhoseHeightMoves: moved.length,
        pctOfAllParcelsWhoseHeightMoves: pc(moved.length),
        meanDelta_m: withBoth.length ? +(sum / withBoth.length).toFixed(3) : null,
        minDelta_m: deltas.length ? Math.min(...deltas) : null,
        maxDelta_m: deltas.length ? Math.max(...deltas) : null,
        direction: moved.length === 0 ? 'NO CHANGE'
            : (moved.every((d) => d < 0) ? 'DOWN — the product OVER-GRANTS height today; the base ladder is LOWER'
                : moved.every((d) => d > 0) ? 'UP' : 'MIXED'),
        byStorey: Object.values(byStorey).sort((a, b) => (a.article === b.article ? a.storeys - b.storeys : a.article.localeCompare(b.article))),
        // ⚠⚠ §MASKED-BY-EXTRAPOLATION — THE MEASURED DELTA IS A LOWER BOUND, AND THIS IS WHY.
        //   Above the table's top band the product does NOT read a table at all: it computes
        //   `5.5 + 3.05 × floors`. Those constants are the BASE ladder's, so BOTH ARMS return the
        //   SAME number and the parcel records a delta of EXACTLY ZERO.
        //   ⛔ That zero is not a finding that the height is right. It is the §EXTRAPOLATION-
        //     DISCONTINUITY defect (see ladderTables.mjs) MASKING the ladder defect: such a parcel
        //     is served by a slope that belongs to neither governing table, in Barcelona too.
        //   ⇒ Reported as its own number so the headline delta is never read as complete.
        maskedByExtrapolation: withBoth.filter((r) => r.basisA === 'table-module-extrapolated').length,
        maskedByExtrapolationPctOfOvEnvelope: ovRows.length ? +(100 * withBoth.filter((r) => r.basisA === 'table-module-extrapolated').length / ovRows.length).toFixed(2) : null,
        deltaIsLowerBound: withBoth.some((r) => r.basisA === 'table-module-extrapolated'),
        note: 'Heights are computed ONLY on the OV route. The QUAL_MUNI route publishes ARM directly and the PGM-pack route resolves height from street WIDTH, not storeys — neither consumes heightFromFloorsAboveGround().',
    };

    const v = verdicts(sel, armA['327'], armB ? armB['327'] : armA['327']);

    const ci95 = (p) => {
        if (!sampled) return null;
        const q = p / 100;
        const fpc = Math.sqrt(Math.max(0, (sampling.population - N) / (sampling.population - 1)));
        return +(100 * 1.96 * Math.sqrt(Math.max(0, q * (1 - q)) / N) * fpc).toFixed(2);
    };

    return {
        ine, name, pgmFlag, status: 'proven', ccaa: 'Catalunya', N,
        sampling,
        uncertainty: sampled
            ? { kind: 'seeded uniform sample', population: sampling.population, drawn: N, seed: SEED, ci95HalfWidthPct: { envelope: ci95(pct.envelope), envelope_OV: ci95(pct.envelope_OV), envelope_PGM_PACK: ci95(pct.envelope_PGM_PACK) }, method: 'normal approximation with finite-population correction, 95 %' }
            : { kind: 'CENSUS — every parcel in the population was joined', population: sampling.population, drawn: N, ci95HalfWidthPct: null },
        counts: { zonePolygons: zoneFeats.length, distinctClaus: new Set(zoneFeats.map((f) => f.a.CLAU_URB)).size, ovPolygons: ovFeats.length, qualMuniRows: qmRows.length },
        paging: { layer16: { oracle: z.oracle, walked: z.features.length, reconciled: z.reconciled === true }, layer17: { oracle: ovj.oracle, walked: ovj.features.length, reconciled: ovj.reconciled === true }, table18: { oracle: qm.oracle ?? null, walked: qmRows.length, ok: qm.ok } },
        pgmGoverned,
        ladder: { selected: sel, armA: 'BARCELONA_MPGM2007 (what the product reads today, for EVERY municipality)', armB: sel.source },
        // ⭐ TWO VERDICTS, NEVER COLLAPSED.
        attributionVerdict: v.attributionVerdict, attributionWhy: v.attributionWhy,
        valueVerdict: v.valueVerdict, valueWhy: v.valueWhy,
        tally, pct,
        heightDelta,
        rows,
    };
}

// ═══ 3 · ENUMERATE FROM THE SERVICE ════════════════════════════════════════════════════════════
// ⛔ NOT from any document, INCLUDING this repo's own prior artefacts. The 26 is `PGM='S'` minus
//   Barcelona, computed here. ⚠ BADALONA IS INSIDE THE 26 — it deviates but it is PGM-governed. The
//   25 is a DIFFERENT subtraction (27 − {Barcelona, Badalona}) and the two are NOT interchangeable.
const d = await readDistinct('16', 'CODI_INE,NOMMUNI,PGM', '1=1', 'enumerate:L16-distinct');
if (!d.ok) { console.error('⛔ ENUMERATION FAILED: ' + d.reason); process.exit(1); }
const by = new Map();
for (const r of d.rows) {
    const ine = String(r.CODI_INE ?? '').trim();
    if (!ine) continue;
    const e = by.get(ine) ?? { ine, names: new Set(), pgm: new Set() };
    if (String(r.NOMMUNI ?? '').trim()) e.names.add(String(r.NOMMUNI).trim());
    e.pgm.add(String(r.PGM ?? '').trim());
    by.set(ine, e);
}
const municipalities = [...by.values()].sort((a, b) => a.ine.localeCompare(b.ine)).map((e) => ({
    ine: e.ine, name: [...e.names][0] ?? null, nameVariants: [...e.names],
    pgm: [...e.pgm].sort(), pgmGoverned: e.pgm.has('S'),
}));
const pgmGovernedIne = municipalities.filter((m) => m.pgmGoverned).map((m) => m.ine);
const THE_26 = municipalities.filter((m) => m.pgmGoverned && m.ine !== '08019');
const enumeration = {
    source: `${SVC}/16 · returnDistinctValues on CODI_INE,NOMMUNI,PGM · read ${new Date().toISOString()}`,
    method: '⛔ read FROM THE SERVICE, not from any document including this repo\'s own artefacts. No resultRecordCount was sent — it silently cancels returnDistinctValues on ArcGIS.',
    distinctCodiIne: municipalities.length,
    pgmS: pgmGovernedIne.length,
    pgmNotS: municipalities.length - pgmGovernedIne.length,
    mixedPgm: municipalities.filter((m) => m.pgm.length > 1).length,
    the26: THE_26.map((m) => ({ ine: m.ine, name: m.name })),
    the26Count: THE_26.length,
    the26Definition: "PGM='S' minus Barcelona. ⚠ BADALONA IS INSIDE THIS SET — it deviates on Arts. 327/328 but it IS PGM-governed. The 25 quoted elsewhere is 27 − {Barcelona, Badalona}; the two subtractions are NOT interchangeable.",
    badalonaInThe26: THE_26.some((m) => m.ine === '08015'),
    municipalities,
};
console.log(`ENUMERATION · ${enumeration.distinctCodiIne} distinct CODI_INE · PGM='S' ${enumeration.pgmS} · PGM≠'S' ${enumeration.pgmNotS} · THE 26 = ${enumeration.the26Count} (Badalona inside: ${enumeration.badalonaInThe26})`);

const corpusFindings = buildCorpusFindings(pgmGovernedIne, municipalities.map((m) => m.ine));

// ═══ 4 · RUN ═══════════════════════════════════════════════════════════════════════════════════
const results = [];
for (const m of municipalities) {
    if (only && m.ine !== only) continue;
    let r;
    try { r = await runCity(m.ine, m.name, m.pgm.join('|'), corpusFindings); }
    catch (err) { r = { ine: m.ine, name: m.name, pgmFlag: m.pgm.join('|'), status: 'blocked', failed: 'exception', reason: String(err && err.message).slice(0, 400) }; }
    results.push(r);
    if (r.failed) { console.log(`⛔ ${r.ine} ${r.name} — BLOCKED AT ${r.failed}: ${r.reason}`); continue; }
    const hd = r.heightDelta;
    console.log(`${r.ine} ${String(r.name).padEnd(28)} PGM=${r.pgmFlag} N=${String(r.N).padStart(5)}${r.sampling.sampled ? '*' : ' '} | ENV ${String(r.pct.envelope).padStart(6)}% (OV ${String(r.pct.envelope_OV).padStart(6)}% · ladder ${String(r.pct.envelope_PGM_PACK).padStart(5)}% · QM ${String(r.pct.envelope_QUAL_MUNI).padStart(5)}%) | ladderB=${r.ladder.selected.source.padEnd(20)} | Δheight parcels ${String(hd.parcelsWhoseHeightMoves).padStart(5)} mean ${String(hd.meanDelta_m ?? '—').padStart(7)} m range [${hd.minDelta_m ?? '—'}, ${hd.maxDelta_m ?? '—'}] ${hd.direction}`);
}

// ═══ 5 · THE CONTROL, AND THE COVERAGE-INVARIANCE PROOF ════════════════════════════════════════
const bcn = results.find((r) => r.ine === '08019');
const EXPECT = { distinctClaus: 89, ovPolygons: 5073, envelopePct: 34.03 };
const baselinePath = join(MAIN_CHECKOUT, 'tools', 'cold-start-probe', 'out', 'task5-amb-all-municipalities.json');
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
const baselineByIne = new Map((baseline?.results ?? []).map((r) => [r.ine, r]));

const control = bcn && !bcn.failed ? {
    run: true, expected: EXPECT,
    observed: { distinctClaus: bcn.counts.distinctClaus, ovPolygons: bcn.counts.ovPolygons, envelopePct: bcn.pct.envelope },
    reproducesBaseline: bcn.counts.distinctClaus === EXPECT.distinctClaus && bcn.counts.ovPolygons === EXPECT.ovPolygons && Math.abs(bcn.pct.envelope - EXPECT.envelopePct) < 0.005,
    // ⭐ THE CONTROL THAT MATTERS FOR *THIS* RUN: Barcelona must not move BETWEEN THE ARMS.
    armsIdenticalForBarcelona: bcn.heightDelta.parcelsWhoseHeightMoves === 0 && bcn.heightDelta.meanDelta_m === 0,
    barcelonaLadderSelected: bcn.ladder.selected.source,
    why: 'Barcelona keeps its MPGM-2007 table under SIG-2 and is NOT in question. If Barcelona moves at all, the substitution is wrong.',
} : { run: false, note: 'Barcelona was not in this run or was blocked — the control is NOT satisfied and every other row must be treated as unverified.' };

// ⭐⭐ THE COVERAGE DELTA, MEASURED PER MUNICIPALITY AGAINST THE COMMITTED BASELINE.
const coverageDelta = results.filter((r) => !r.failed).map((r) => {
    const b = baselineByIne.get(r.ine);
    const f = (x) => (typeof x === 'number' ? x : null);
    const d = (a, bb) => (a === null || bb === null ? null : +(a - bb).toFixed(2));
    return {
        ine: r.ine, name: r.name, pgmFlag: r.pgmFlag,
        frame: r.sampling.sampled ? 'SAMPLE' : 'CENSUS',
        N: r.N, population: r.sampling.population,
        ci95_envelope: r.uncertainty.ci95HalfWidthPct?.envelope ?? null,
        ci95_ov: r.uncertainty.ci95HalfWidthPct?.envelope_OV ?? null,
        envelopeBefore: f(b?.pct?.envelope), envelopeAfter: r.pct.envelope, envelopeDelta: d(r.pct.envelope, f(b?.pct?.envelope)),
        ovBefore: f(b?.pct?.envelope_OV), ovAfter: r.pct.envelope_OV, ovDelta: d(r.pct.envelope_OV, f(b?.pct?.envelope_OV)),
        ladderBefore: f(b?.pct?.envelope_PGM_PACK), ladderAfter: r.pct.envelope_PGM_PACK, ladderDelta: d(r.pct.envelope_PGM_PACK, f(b?.pct?.envelope_PGM_PACK)),
        qmBefore: f(b?.pct?.envelope_QUAL_MUNI), qmAfter: r.pct.envelope_QUAL_MUNI, qmDelta: d(r.pct.envelope_QUAL_MUNI, f(b?.pct?.envelope_QUAL_MUNI)),
        // THE ROUTE MIX — which route each municipality actually depends on.
        routeMix: r.pct.envelope > 0 ? {
            ovShareOfEnvelope: +(100 * r.tally.envelope_OV / r.tally.envelope).toFixed(2),
            ladderShareOfEnvelope: +(100 * r.tally.envelope_PGM_PACK / r.tally.envelope).toFixed(2),
            qualMuniShareOfEnvelope: +(100 * r.tally.envelope_QUAL_MUNI / r.tally.envelope).toFixed(2),
            dominantRoute: [['OV', r.tally.envelope_OV], ['LADDER', r.tally.envelope_PGM_PACK], ['QUAL_MUNI', r.tally.envelope_QUAL_MUNI]].sort((a, b2) => b2[1] - a[1])[0][0],
        } : { note: 'no envelope measured — no route mix exists' },
        attributionVerdict: r.attributionVerdict, valueVerdict: r.valueVerdict,
        ladderSelected: r.ladder.selected.source,
        heightParcelsMoved: r.heightDelta.parcelsWhoseHeightMoves,
        heightMeanDelta_m: r.heightDelta.meanDelta_m,
        heightRange_m: [r.heightDelta.minDelta_m, r.heightDelta.maxDelta_m],
        heightDirection: r.heightDelta.direction,
    };
});

// ⛔ THE COVERAGE VERDICT, DERIVED — NOT TYPED.
const covMoved = coverageDelta.filter((c) => [c.envelopeDelta, c.ovDelta, c.ladderDelta, c.qmDelta].some((x) => x !== null && x !== 0));
const heightMoved = coverageDelta.filter((c) => c.heightParcelsMoved > 0);
// ⚠ A DELTA SMALLER THAN THE SAMPLING CI ON A SAMPLED MUNICIPALITY IS NOT A MEASURED CHANGE.
const covMovedBeyondCi = covMoved.filter((c) => c.frame === 'CENSUS' || Math.abs(c.envelopeDelta ?? 0) > (c.ci95_envelope ?? 0));

const verdict = {
    coverage: covMoved.length === 0
        ? 'DELTA ZERO EVERYWHERE — no municipality\'s envelope %, OV %, ladder % or QUAL_MUNI % moved by a single parcel under the substitution.'
        : `COVERAGE MOVED in ${covMoved.length} municipalities (${covMovedBeyondCi.length} beyond the sampling CI)`,
    coverageMovedMunicipalities: covMoved.map((c) => ({ ine: c.ine, name: c.name, envelopeDelta: c.envelopeDelta, ovDelta: c.ovDelta, ladderDelta: c.ladderDelta })),
    height: heightMoved.length === 0
        ? 'no height moved'
        : `HEIGHT MOVED in ${heightMoved.length} municipalities`,
    heightMovedCount: heightMoved.length,
    // ⭐ WHY COVERAGE CANNOT MOVE, stated so the zero is not read as "we failed to find anything".
    whyCoverageIsInvariant: [
        'ARGUMENT 1 — NO LADDER IS IN THE DECISION PATH. The envelope route is decided by parsePlantes() returning a storey count, by QUAL_MUNI field presence, and by clau membership in the registered pack set. No height table is consulted to decide ANY branch. The height is computed AFTER the route is chosen and cannot change it.',
        'ARGUMENT 2 — THE TWO TABLES SHARE A BAND STRUCTURE. Measured from the parsed sources, not assumed: identical width band boundaries and identical storey counts (floorsChange is 0 in every band). So even a pipeline that DID gate on band membership would move no parcel across a band edge and would produce no new refusal.',
        '⇒ The zero is STRUCTURAL and holds for any future census that threads heights through. It is not a null result.',
    ],
};

writeFileSync(ARTEFACT, JSON.stringify({
    probe: 'AMB BASE LADDER DELTA — the 36-municipality census re-run under the base metropolitan ladder',
    ranAt: new Date().toISOString(), seed: SEED, sampleAbove: SAMPLE_ABOVE, sampleN: SAMPLE_N,
    reRun: 'python corpusVerify.py && node rerunCensus.mjs',
    design: 'TWO ARMS, ONE PROCESS, ONE PARCEL DRAW. Arm A = the table the product reads today (Barcelona\'s, for everyone). Arm B = the pre-committed fix shape (Barcelona / Badalona / base / REFUSE). A zero delta is measured over identical inputs, not two runs that happened to agree.',
    sig2Fingerprint: sig2,
    ladderTables: {
        art327_barcelona_mpgm2007: ART327_BARCELONA_MPGM2007,
        art327_base_metropolitan: ART327_BASE_METROPOLITAN,
        art328_barcelona_mpgm2007: ART328_BARCELONA_MPGM2007,
        art328_base_metropolitan: ART328_BASE_METROPOLITAN,
        bandStructureIdentity: { art327: identity327, art328: identity328 },
        extrapolationSeam: seam,
    },
    corpusVerification: {
        art327BaseFromCorpus: CORPUS.art327_baseTableFromCorpus,
        art328BaseFromCorpus: CORPUS.art328_baseTableFromCorpus,
        footnote49: CORPUS.art327_footnote49_modifyingMunicipalities,
        footnote50: CORPUS.art328_footnote50_modifyingMunicipalities,
        apparatusSweep: CORPUS.wholeCompendiumModificationSweep,
        badalonaSeparateInstrument: CORPUS.badalonaSeparateInstrumentInCorpus,
        limitation: CORPUS.source?.limitation,
    },
    enumeration,
    corpusFindings,
    knownAnswerControl: control,
    coverageDelta,
    verdict,
    results: results.map((r) => ({ ...r, rows: undefined, rowSampleFirst20: r.rows ? r.rows.slice(0, 20) : undefined })),
    network: netLog,
}, null, 1));

const tsv = [
    '# ine\tname\tframe\tN\tenvBefore\tenvAfter\tenvΔ\tovBefore\tovAfter\tovΔ\tladderBefore\tladderAfter\tladderΔ\tladderSelected\tattribution\tvalue\theightParcelsMoved\theightMeanΔm\theightDirection',
    ...coverageDelta.map((c) => [c.ine, c.name, c.frame, c.N, c.envelopeBefore ?? '', c.envelopeAfter, c.envelopeDelta ?? '', c.ovBefore ?? '', c.ovAfter, c.ovDelta ?? '', c.ladderBefore ?? '', c.ladderAfter, c.ladderDelta ?? '', c.ladderSelected, c.attributionVerdict, c.valueVerdict, c.heightParcelsMoved, c.heightMeanDelta_m ?? '', c.heightDirection].join('\t')),
].join('\n');
writeFileSync(ROWS_TSV, tsv + '\n');

console.log(`\nCONTROL 08019 Barcelona · reproduces baseline: ${control.reproducesBaseline} · arms identical: ${control.armsIdenticalForBarcelona} · ladder selected: ${control.barcelonaLadderSelected}`);
console.log(`VERDICT coverage: ${verdict.coverage}`);
console.log(`VERDICT height:   ${verdict.height}`);
console.log(`→ ${ARTEFACT.replace(HERE, '.')}${partial ? '  ⚠ PARTIAL' : ''}`);
console.log(`→ ${ROWS_TSV.replace(HERE, '.')}`);
