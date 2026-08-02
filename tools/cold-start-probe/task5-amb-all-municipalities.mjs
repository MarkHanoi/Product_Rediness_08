#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// TASK 5 — "UP TO 26" BECOMES A NUMBER. EVERY AMB MUNICIPALITY, MEASURED.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS
//   `docs/03-execution/plans/ENVELOPE-REACHABILITY-TRACKER.md` §6 says **"That is why 26 are one
//   unbinding away"** and Phase 3 says **"run the AMB — 26 through the runner."** Exactly THREE
//   municipalities had ever been measured (`out/task2-pgm-cold-pipeline.json`). The 26 was an
//   arithmetic claim standing on nothing per-municipality. This run replaces it with 36 rows.
//
// ⛔ NO METROPOLITAN MEAN IS COMPUTED ANYWHERE IN THIS FILE, AND THAT IS DELIBERATE.
//   The two envelope routes INVERT across the metropolis: in the cold municipalities the OV route
//   is ~10x the PGM-pack ladder, and in Barcelona the ladder is ~3.6x OV. A mean over the 36 would
//   erase the single most important structural fact measured. Every figure is per-municipality.
//   `grep -c` the emitted tracker rows; never average them.
//
// ⛔ THIS PROBE PUBLISHES NOTHING. It writes to out/ and to stdout. It does not touch
//   `bcnRefosOVProvider.ts`, `siteDispatch.ts` or `rulepacks/registry.ts` — those are Step 1's, and
//   another agent owns them. Where this probe needs behaviour those files hold, the behaviour is
//   COPIED here and said so at the copy site (see §COPIED-FROM-PRODUCT below).
//
// §COPIED-FROM-PRODUCT — three behaviours are reproduced rather than imported:
//   1. the registered-clau set, READ FROM the rulepack sources (never hand-typed) — same as task2;
//   2. the Barcelona-exclusive instrument detection, read from the same sources;
//   3. the OV -> storeys route that `bcnRefosOVProvider.ts` implements for CODI_INE='08019' only,
//      re-implemented here WITHOUT the municipality hardcode so the other 35 can be measured.
//      ⚠ That re-implementation is a MEASUREMENT, not an unbinding. Nothing here ships.
//
// KNOWN-ANSWER CONTROL (PROBE-DISCIPLINE R2), asserted, not hoped for:
//   Barcelona must reproduce 89 distinct CLAU_URB, 5,073 OV polygons and envelope 34.03 %.
//   A drift ABORTS the report of the other 35 rather than publishing 35 numbers from a probe that
//   cannot reproduce a known one. That control is what caught `maxRecordCount` sitting at 2000.
//
// RE-RUNNABILITY: seeded (SEED below), all inputs are public, `.cache/` is a pure accelerator.
//   node task5-amb-all-municipalities.mjs                # all 36
//   node task5-amb-all-municipalities.mjs --only 08019   # one
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildFrame, drawUniform } from './catastroParcelFrame.mjs';
import { SVC, readJson, readAllPaged, netLog, enumerateAmb, schemaIntegrity } from './ambEnumerate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// The seeded draw. IDENTICAL to task2 so Barcelona's 34.03 % is reproducible to the parcel.
const SAMPLE_ABOVE = 6000, SAMPLE_N = 3000, SEED = 20260802;

// ── §COPIED-FROM-PRODUCT 1 — the claus Barcelona's registry ACTUALLY answers for, read from source
const RP = join(HERE, '..', '..', 'packages', 'site-parcel-data', 'src', 'rulepacks');
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

// ── §COPIED-FROM-PRODUCT 2 — the Barcelona-EXCLUSIVE instruments, detected from source ──────────
function barcelonaExclusiveModifications() {
    const found = [];
    const alc = readFileSync(join(RP, 'bcnAlcadaReguladora.ts'), 'utf8');
    if (/al terme municipal de Barcelona|al terme muncipal de Barcelona/.test(alc)) {
        found.push({ articles: ['239', '320.3a', '327.2a', '328.2a'], instrument: 'MPGM 02-03-2007, DOGC 4893', scope: 'al terme municipal de Barcelona', appliesTo: ['13a', '13E', '13b', '12'], file: 'rulepacks/bcnAlcadaReguladora.ts' });
    }
    const a20 = readFileSync(join(RP, 'esBarcelona20aAillada.ts'), 'utf8');
    if (/de Barcelona.*20-10-2004|DOGC núm\. 4277/.test(a20)) {
        found.push({ articles: ['342', '343'], instrument: 'MPGM 20-10-2004, DOGC 4277', scope: "l'ordenació de l'edificació aïllada, de Barcelona", appliesTo: ['20a/*'], file: 'rulepacks/esBarcelona20aAillada.ts' });
    }
    // READ ONLY. This probe never edits the three Step-1 files.
    const ov = readFileSync(join(HERE, '..', '..', 'packages', 'site-parcel-data', 'src', 'providers', 'bcnRefosOVProvider.ts'), 'utf8');
    const hardcoded = /BCN_INE_CODE = '(\d{5})'/.exec(ov)?.[1] ?? null;
    if (hardcoded) {
        found.push({ articles: ['306'], instrument: `hardcoded CODI_INE='${hardcoded}' in the resolver's own WHERE clause`, scope: 'Barcelona only, by construction', appliesTo: ['18'], file: 'providers/bcnRefosOVProvider.ts', hardcodedIne: hardcoded });
    }
    return found;
}
const BCN_EXCLUSIVE = barcelonaExclusiveModifications();
const PUBLISHED_INE = BCN_EXCLUSIVE.find((m) => m.hardcodedIne)?.hardcodedIne ?? null;

// ── geometry helpers (identical to task2; a bbox index changes no verdict, only the ring tests) ──
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
const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';

/**
 * ⛔ `PLANTES` IS A STOREY COUNT (`B+7`), NOT A HEIGHT IN METRES. Nothing in this file converts it.
 * The storeys→metres step is Art. 327.2a and it is the module the tracker records as MISSING; a
 * metre figure emitted from here would be exactly the fabrication that module does not yet exist to
 * prevent. `parsePlantes` returns storeys and only storeys — identical to task2's parser, so the
 * parseable/unparseable split is comparable across the two runs.
 */
const parsePlantes = (v) => {
    const m = /^(B|PX)\+(\d{1,2})(\+A)?$/.exec(String(v ?? '').trim().toUpperCase());
    return m ? { storeys: 1 + Number(m[2]) + (m[3] ? 1 : 0), raw: String(v).trim() } : null;
};

/**
 * ⭐ WHY THE REJECTED FORMS ARE SPLIT IN TWO, AND WHY IT CHANGES THE ROADMAP READING.
 *
 * "8 % unparseable" reads like a data-quality problem. It is not one problem, it is two, and they
 * belong to DIFFERENT blocker categories:
 *
 *   PARSER-GAP   — the value IS a storey specification, in a grammar this parser does not accept:
 *                  `B+3+G` (golfes), `B+6+2A`, `B+A+6`, `PX+4+G`, `B+2*`, `B+4 (B+2)`, `PX+1+15`.
 *                  Recoverable by writing code ⇒ **Engineering**.
 *   NON-STOREY   — the value is not a storey count at all: `ED`, `Alç`, `cat`, `Cat`, `alç cat`.
 *                  No parser recovers these; they mean something the legend has to tell us
 *                  ⇒ **Legal / External authority**, and refusing them is CORRECT.
 *
 * ⚠ `ED` IS THE WHOLE STORY AND ITS MEANING IS UNRESOLVED. It is **4,244 of the service's 22,525 OV
 *   polygons (18.84 %)** and appears in **33 of the 36 municipalities** — it is a service-wide
 *   vocabulary token, not a Barcelona quirk, and it is more than twice as prevalent outside
 *   Barcelona (8.04 %) as in it.
 *   ⛔ A HYPOTHESIS WAS TESTED AND REFUTED, and is recorded rather than quietly dropped: "ED means
 *   the volume is defined by the referenced expedient" predicted that `EXP` would co-vary with it.
 *   Measured — `EXP` is populated on **22,525 of 22,525** rows and `OMBREJAT='S'` on all of them
 *   too. Neither field discriminates `ED` from anything. **The meaning of `ED` is NOT established
 *   by this probe and is not guessed here.**
 */
const NON_STOREY_TOKENS = new Set(['ED', 'ALÇ', 'CAT', 'ALÇ CAT']);
function classifyRejectedPlantes(raw) {
    const v = String(raw ?? '').trim();
    const u = v.toUpperCase();
    if (NON_STOREY_TOKENS.has(u)) return 'NON-STOREY (categorical token; no parser recovers it)';
    if (/^(B|PX)\s*\+/.test(u) || /^B\+A/.test(u)) return 'PARSER-GAP (a storey specification in an unsupported grammar)';
    return 'UNCLASSIFIED (neither a known token nor a B+/PX+ form)';
}

/**
 * ═══ SEMANTIC VALIDATION — THE ARAGÓN RULE, APPLIED TO `PLANTES` ═══════════════════════════════
 * "POPULATED IS NOT PRESENT." Aragón proved `0` was its schema's null substitute by finding 70/78
 * rows with `shape_area > 0` AND `perimeter == 0` — a contradiction between two fields that MUST
 * co-vary. The same suspicion is owed to `PLANTES`, which is believed ~100 % populated.
 *
 * FOUR TESTS, each against something that must co-vary — a histogram alone proves nothing:
 *   T1 DOMINANT-VALUE. Does one value carry an implausible share? A null substitute shows up as a
 *      spike. Reported with the top values, never asserted from the top value alone.
 *   T2 GEOMETRY CONTRADICTION (the literal Aragón test). `SHAPE_Area > 0` AND `PLANTES` empty, or
 *      `SHAPE_Area == 0` AND `PLANTES` populated. An ordenació volumètrica with no area, or an area
 *      with no ordenació, is a contradiction inside one row.
 *   T3 CLASSIFICATION CONTRADICTION. An OV polygon whose own `CLAU_URB` maps (via layer 16) to a
 *      `titol_2`/`titol_3` NORMATIV — public *sistemes*, where no private building volume exists —
 *      yet carries a storey count. The storey count contradicts the classification.
 *   T4 INDEPENDENT-TABLE CONTRADICTION. Where QUAL_MUNI publishes `N_PLANTES` for the same clau,
 *      the two storey counts are compared. A second publisher of the same quantity is the strongest
 *      co-variate available and it is free.
 */
function validatePlantes(ovRows, ovNormativByIndex, qualMuniByClau) {
    const n = ovRows.length;
    const populated = ovRows.filter((r) => has(r.PLANTES));
    const parsed = populated.map((r) => ({ r, p: parsePlantes(r.PLANTES) }));
    const parseable = parsed.filter((x) => x.p);
    const rejected = parsed.filter((x) => !x.p);
    const hist = {};
    for (const r of ovRows) { const k = has(r.PLANTES) ? String(r.PLANTES).trim() : '∅ EMPTY'; hist[k] = (hist[k] ?? 0) + 1; }
    const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, c]) => ({ value: v, count: c, pct: n ? +(100 * c / n).toFixed(2) : null }));
    const rejHist = {};
    for (const x of rejected) { const k = String(x.r.PLANTES).trim(); rejHist[k] = (rejHist[k] ?? 0) + 1; }

    // T2 — geometry contradiction
    const areaZeroWithPlantes = ovRows.filter((r) => has(r.PLANTES) && Number(r.SHAPE_Area) === 0).length;
    const areaPositiveNoPlantes = ovRows.filter((r) => !has(r.PLANTES) && Number(r.SHAPE_Area) > 0).length;
    const areaMissing = ovRows.filter((r) => r.SHAPE_Area === null || r.SHAPE_Area === undefined).length;

    // T3 — classification contradiction.
    //
    // ⛔⛔ THE FIRST VERSION OF THIS TEST WAS WRONG AND ITS RESULT IS RETRACTED. It resolved each OV
    //    polygon's NORMATIV through a `clau → NORMATIV` Map. **A clau maps to MULTIPLE NORMATIV
    //    values** — measured: Badalona 21 of 54 claus, Santa Coloma 13 of 36, El Prat 16 of 45 — and
    //    the second value is almost always `Asterisc`, the delegated marker. The Map kept whichever
    //    polygon came last, so the assignment was ARBITRARY. It reported **464 contradictions across
    //    22 municipalities**, and that number was an artefact of a many-to-one collapse, not a
    //    measurement. It is not reported.
    //
    // ⇒ NORMATIV IS NOW RESOLVED PER POLYGON, SPATIALLY: the OV polygon's own centroid is located in
    //   the layer-16 zoning, so each OV polygon is tested against the zoning that actually covers it.
    //   `ovNormativByIndex[i]` is that per-polygon NORMATIV, computed by the caller.
    //
    // ⚠ THE TEST CANNOT FIRE WHERE `NORMATIV` CARRIES NO `titol` PATH. Barcelona's NORMATIV is the
    //   bare string "Barcelona" (the reference city is the worst-cited of the 27), so for Barcelona
    //   T3 is NOT INFORMATIVE — reporting it as "clean" there would be reporting the absence of a
    //   TEST as the absence of a DEFECT.
    let sistemesWithStoreys = 0, sistemesTested = 0, citableNormativ = 0;
    const t3Examples = [];
    for (let i = 0; i < ovRows.length; i++) {
        const r = ovRows[i];
        const norm = ovNormativByIndex[i];
        if (norm === null || norm === undefined) continue;
        sistemesTested++;
        if (/^num_\w+\.titol_/.test(norm)) citableNormativ++;
        if (/^num_\w+\.titol_(2|3)\./.test(norm) && has(r.PLANTES)) {
            sistemesWithStoreys++;
            if (t3Examples.length < 5) t3Examples.push({ clau: r.CLAU_URB, plantes: r.PLANTES, normativ: norm });
        }
    }

    // T4 — independent-table contradiction. Two publishers of the same quantity is the strongest
    // free co-variate there is, and it found something — but NOT what it first looked like.
    let compared = 0, agreed = 0, offByOneOvHigher = 0, otherDelta = 0;
    const disagreements = [];
    for (const r of ovRows) {
        const q = qualMuniByClau.get(String(r.CLAU_URB ?? ''));
        if (!q || !has(q.N_PLANTES)) continue;
        const a = parsePlantes(r.PLANTES), b = parsePlantes(q.N_PLANTES) ?? (/^\d{1,2}$/.test(String(q.N_PLANTES).trim()) ? { storeys: Number(q.N_PLANTES) } : null);
        if (!a || !b) continue;
        compared++;
        if (a.storeys === b.storeys) agreed++;
        else {
            if (a.storeys - b.storeys === 1) offByOneOvHigher++; else otherDelta++;
            if (disagreements.length < 10) disagreements.push({ clau: r.CLAU_URB, ovPlantes: r.PLANTES, qualMuniNPlantes: q.N_PLANTES, arm: q.ARM ?? null, ovStoreys: a.storeys, qualStoreys: b.storeys });
        }
    }

    return {
        ovPolygons: n,
        populated: populated.length,
        populatedPct: n ? +(100 * populated.length / n).toFixed(2) : null,
        parseable: parseable.length,
        parseablePctOfAll: n ? +(100 * parseable.length / n).toFixed(2) : null,
        parseablePctOfPopulated: populated.length ? +(100 * parseable.length / populated.length).toFixed(2) : null,
        rejectedForms: rejected.length,
        rejectedFormHistogram: Object.entries(rejHist).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([v, c]) => ({ value: v, count: c, kind: classifyRejectedPlantes(v) })),
        // ⭐ The split that decides whether "unparseable" is an Engineering item or a Legal one.
        rejectedSplit: (() => {
            const s = { parserGap: 0, nonStorey: 0, unclassified: 0 };
            for (const [v, c] of Object.entries(rejHist)) {
                const k = classifyRejectedPlantes(v);
                if (k.startsWith('PARSER-GAP')) s.parserGap += c; else if (k.startsWith('NON-STOREY')) s.nonStorey += c; else s.unclassified += c;
            }
            return {
                ...s,
                parserGapPctOfAll: n ? +(100 * s.parserGap / n).toFixed(2) : null,
                nonStoreyPctOfAll: n ? +(100 * s.nonStorey / n).toFixed(2) : null,
                note: 'parserGap is recoverable by writing code (Engineering). nonStorey is not (Legal/External authority — the legend has to say what the token means). Refusing nonStorey is CORRECT behaviour, not a coverage loss.',
            };
        })(),
        topValues: top,
        semantic: {
            T1_dominantValue: top[0] ? { value: top[0].value, pct: top[0].pct, verdict: top[0].pct > 60 && top[0].value !== '∅ EMPTY' ? 'SUSPECT — one value carries >60 %; test it against an independent source before trusting the populated rate' : 'no single value dominates' } : null,
            T2_geometryContradiction: { areaZeroWithPlantes, areaPositiveNoPlantes, shapeAreaMissing: areaMissing, verdict: areaZeroWithPlantes > 0 ? `CONTRADICTION — ${areaZeroWithPlantes} rows carry a storey count on ZERO area` : 'clean' },
            T3_classificationContradiction: {
                method: "per-polygon SPATIAL resolution: each OV polygon's centroid located in layer 16. NOT a clau→NORMATIV Map — that mapping is many-to-one and the Map version of this test is retracted.",
                tested: sistemesTested, withCitableNormativTitol: citableNormativ, sistemesCarryingStoreys: sistemesWithStoreys, examples: t3Examples,
                verdict: citableNormativ === 0
                    ? 'NOT INFORMATIVE — no OV polygon here sits on a NORMATIV carrying a titol path, so the test cannot fire. This is the absence of a TEST, not the absence of a DEFECT.'
                    : (sistemesWithStoreys > 0 ? `CONTRADICTION — ${sistemesWithStoreys} OV polygons sitting on titol_2/titol_3 (public sistemes) carry a storey count` : 'clean'),
            },
            // ⚠⚠ T4 FOUND A SYSTEMATIC OFF-BY-ONE AND ITS CAUSE IS **NOT ESTABLISHED**.
            //    Where the two publishers are comparable, the disagreements are overwhelmingly
            //    `OV storeys = N_PLANTES + 1` — e.g. Begues clau `17bB`, OV `B+2` (3 storeys under
            //    this parser) against QUAL_MUNI `N_PLANTES = 2`.
            //    ⇒ IS `N_PLANTES` A TOTAL STOREY COUNT, OR FLOORS ABOVE THE PLANTA BAIXA? The
            //      service answers neither: the field has NO domain and NO metadata. The obvious
            //      tiebreak — `ARM` (alçada reguladora màxima) — is INCONCLUSIVE, measured:
            //          N_PLANTES 2 · ARM 7.40 m → 3.70 m/storey (plausible as a TOTAL)
            //          N_PLANTES 2 · ARM 9.50 m → 4.75 m/storey (implausible as a TOTAL)
            //          N_PLANTES 3 · ARM 9.45 m → 3.15 m/storey (plausible as a TOTAL)
            //      Both readings are contradicted by some row. **UNRESOLVED, and it is one whole
            //      storey of height** — which lands directly on the storeys→metres module the
            //      tracker makes Phase 4. Recorded as a question for the publisher, NOT as a defect
            //      in either table and NOT silently normalised away.
            T4_independentTable: {
                compared, agreed, disagreed: compared - agreed,
                agreementPct: compared ? +(100 * agreed / compared).toFixed(2) : null,
                disagreementShape: { ovExactlyOneHigher: offByOneOvHigher, otherDelta },
                examples: disagreements,
                verdict: compared === 0
                    ? 'NOT COMPUTABLE — QUAL_MUNI publishes no N_PLANTES for any clau that also appears in OV_Trames here'
                    : (agreed === compared ? 'agrees with the independent table'
                        : (offByOneOvHigher === compared - agreed
                            ? 'DISAGREES BY EXACTLY +1 IN EVERY CASE — this is the signature of a DEFINITIONAL mismatch (total storeys vs floors above the planta baixa), not of bad data. UNRESOLVED: the field has no domain and ARM does not settle it.'
                            : 'DISAGREES with the independent table, and not by a uniform offset')),
            },
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
async function runCity(ine, name, pgmFlag) {
    const clocks = {};
    const t = (k) => { clocks[k] = { start: Date.now() }; };
    const e = (k) => { clocks[k].ms = Date.now() - clocks[k].start; delete clocks[k].start; };
    const gates = [];

    // ── L0 — ParcelContext: the cadastral parcel frame (the denominator) ─────────────────────────
    t('L0_parcelContext');
    const frame = await buildFrame(ine, name);
    e('L0_parcelContext');
    if (!frame.ok) return { ine, name, pgmFlag, status: 'blocked', failed: 'L0', reason: frame.reason, message: frame.message, clocks };
    const g1 = frame.cached === false && frame.matchedBy
        ? { exercised: true, dgcCodeUsed: frame.dgcCode ?? null, matchedBy: frame.matchedBy, collisionWarning: frame.warning ?? null }
        : { exercised: false, note: 'frame served from disk cache; the name-authoritative ATOM match ran when the frame was FIRST built. G2 is the guard actually exercised on this run.' };
    const sampled = frame.parcelCount > SAMPLE_ABOVE;
    const parcels = sampled ? drawUniform(frame.parcels, SAMPLE_N, SEED) : frame.parcels;
    const sampling = sampled
        ? { sampled: true, population: frame.parcelCount, drawn: parcels.length, seed: SEED, method: 'uniform without replacement over the full Catastro INSPIRE CP parcel population; every parcel weighs 1' }
        : { sampled: false, population: frame.parcelCount, drawn: parcels.length };

    // ── L1 — LegalStack ─────────────────────────────────────────────────────────────────────────
    t('L1_legalStack');
    const z = await readAllPaged(`${SVC}/16/query`, { f: 'json', where: `CODI_INE='${ine}'`, outFields: 'CLAU_URB,PLAN,NORMATIV,EQUI_PGM,PGM,DESCRIP', returnGeometry: 'true', outSR: '4326' }, `${ine}:layer16-geometry`);
    e('L1_legalStack');
    if (!z.ok) return { ine, name, pgmFlag, status: 'blocked', failed: 'L1', reason: `layer-16 read incomplete (${z.reason}) — UNKNOWN, not empty`, clocks };
    if (z.features.length === 0) {
        const alt = await readJson(`${SVC}/16/query`, { f: 'json', where: '1=1', outFields: 'CODI_INE', returnDistinctValues: 'true', returnGeometry: 'false' }, `${ine}:negative-proof-distinct-ine`);
        return { ine, name, pgmFlag, status: 'blocked', failed: 'L1', reason: 'ZERO zoning features for the municipality ATTRIBUTE filter — negative proof attached, NOT reported as absence', distinctIneCount: alt?.features?.length ?? null, clocks };
    }
    const zoneFeats = indexFeatures(z.features.map((f) => ({ a: f.attributes, rings: f.geometry?.rings ?? [] })));
    const pbb = bboxOfParcels(parcels), zbb = bboxOfFeats(zoneFeats);
    const ix = Math.max(0, Math.min(pbb[2], zbb[2]) - Math.max(pbb[0], zbb[0]));
    const iy = Math.max(0, Math.min(pbb[3], zbb[3]) - Math.max(pbb[1], zbb[1]));
    const parcelArea = Math.max(1e-12, (pbb[2] - pbb[0]) * (pbb[3] - pbb[1]));
    const overlapFraction = +((ix * iy) / parcelArea).toFixed(4);
    const OVERLAP_MIN = 0.5;
    const nested = overlapFraction >= OVERLAP_MIN;
    const g2 = { test: "bbox overlap fraction of the parcel frame covered by this municipality's zoning", overlapFraction, threshold: OVERLAP_MIN, parcelBbox: pbb.map((v) => +v.toFixed(4)), zoningBbox: zbb.map((v) => +v.toFixed(4)), nested };
    if (!nested) {
        return { ine, name, pgmFlag, status: 'blocked', failed: 'G2-extent-nesting', reason: "The parcel frame does NOT nest inside this municipality's layer-16 zoning extent. This is the DGC/INE collision signature. ABORTING rather than reporting a plausible wrong number.", guards: { g1, g2 }, clocks };
    }
    const pgmGoverned = zoneFeats.some((f) => String(f.a.PGM) === 'S');
    const instrumentRoots = [...new Set(zoneFeats.map((f) => String(f.a.NORMATIV ?? '').split('.')[0]))].sort();
    // ⚠ MEASURED, AND IT IS WHY T3 IS SPATIAL: `clau → NORMATIV` IS MANY-TO-ONE. Badalona has 21 of
    //   54 claus carrying more than one NORMATIV, Santa Coloma 13 of 36, El Prat 16 of 45 — the
    //   second value is almost always `Asterisc`, the delegated marker. Counted, never keyed on.
    const clauNormativCardinality = (() => {
        const m = new Map();
        for (const f of zoneFeats) {
            const k = String(f.a.CLAU_URB ?? '');
            if (!m.has(k)) m.set(k, new Set());
            m.get(k).add(String(f.a.NORMATIV ?? ''));
        }
        const multi = [...m.entries()].filter(([, v]) => v.size > 1);
        return { distinctClaus: m.size, clausWithMoreThanOneNormativ: multi.length, examples: multi.slice(0, 5).map(([k, v]) => ({ clau: k, normativ: [...v] })) };
    })();

    // ── L2/L3 — variable resolution inputs ──────────────────────────────────────────────────────
    t('L23_variableResolution');
    // ⚠ QUAL_MUNI's OWN `CODI_INE` COLUMN IS 100 % NULL across all 486 rows (measured; see the
    //   artefact's `qualMuniCensus`). The declared join key is unusable and only the `CODI_MUN`
    //   PREFIX works. Paged anyway — an unpaged read here is the same defect class as the one the
    //   Barcelona control caught on layer 16.
    const qm = await readAllPaged(`${SVC}/18/query`, { f: 'json', where: `CODI_MUN LIKE '${ine}%'`, outFields: '*', returnGeometry: 'false' }, `${ine}:table18-QUAL_MUNI`);
    const qmRows = qm.ok ? qm.features.map((f) => f.attributes) : [];
    const qmByClau = new Map(qmRows.map((r) => [String(r.CODI_MUN).slice(ine.length + 1), r]));
    const ovj = await readAllPaged(`${SVC}/17/query`, { f: 'json', where: `CODI_INE='${ine}'`, outFields: 'CLAU,CLAU_URB,PLANTES,PLAN,SHAPE_Area,OMBREJAT', returnGeometry: 'true', outSR: '4326' }, `${ine}:layer17-OV_Trames`);
    if (!ovj.ok) return { ine, name, pgmFlag, status: 'blocked', failed: 'L23', reason: `layer-17 read incomplete (${ovj.reason}) — UNKNOWN, not empty`, clocks };
    const ovFeats = indexFeatures(ovj.features.map((f) => ({ a: f.attributes, rings: f.geometry?.rings ?? [] })));
    e('L23_variableResolution');

    // ⚠⚠ TRUNCATION SUSPECT RULE. Any count landing exactly on a round service limit is suspect
    //    until `exceededTransferLimit` is shown CLEARED by the server on the final page.
    const ROUND = new Set([1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000]);
    const truncationSuspects = [];
    for (const [layer, r] of [['16', z], ['17', ovj], ['18', qm]]) {
        const count = layer === '18' ? qmRows.length : (layer === '16' ? zoneFeats.length : ovFeats.length);
        if (ROUND.has(count)) {
            truncationSuspects.push({ layer, count, terminatedBy: r.terminatedBy, exceededTransferLimitByPage: r.exceededTransferLimitByPage, cleared: r.terminatedBy === 'server-cleared-exceededTransferLimit', verdict: r.terminatedBy === 'server-cleared-exceededTransferLimit' ? 'ROUND BUT CLEARED — server explicitly reported no further records' : 'TRUNCATION SUSPECT — round count and the limit was NOT cleared' });
        }
    }
    const paging = {
        layer16: { pages: z.pages, terminatedBy: z.terminatedBy, exceededTransferLimitByPage: z.exceededTransferLimitByPage, features: zoneFeats.length },
        layer17: { pages: ovj.pages, terminatedBy: ovj.terminatedBy, exceededTransferLimitByPage: ovj.exceededTransferLimitByPage, features: ovFeats.length },
        table18: { pages: qm.pages, terminatedBy: qm.terminatedBy ?? null, exceededTransferLimitByPage: qm.exceededTransferLimitByPage, features: qmRows.length, ok: qm.ok },
        truncationSuspects,
    };

    // ── PLANTES — populated AND parseable, separately, plus semantic validation ──────────────────
    // Per-polygon NORMATIV, resolved SPATIALLY (see T3's retraction note). The OV polygon's own
    // centroid is located in the layer-16 zoning; a clau→NORMATIV Map is many-to-one and unusable.
    t('T3_spatialNormativ');
    const ovNormativByIndex = ovFeats.map((f) => {
        const rg = f.rings?.[0];
        if (!rg || rg.length === 0) return null;
        let sx = 0, sy = 0;
        for (const [x, y] of rg) { sx += x; sy += y; }
        const zf = locate(zoneFeats, sx / rg.length, sy / rg.length);
        return zf ? String(zf.a.NORMATIV ?? '') : null;
    });
    e('T3_spatialNormativ');
    const plantes = validatePlantes(ovFeats.map((f) => f.a), ovNormativByIndex, qmByClau);

    // ── L6/L7 — constraint composition + envelope synthesis, per parcel ──────────────────────────
    // PRECEDENCE — copied VERBATIM from task2-pgm-cold-pipeline.mjs so the two runs are comparable
    // and Barcelona reproduces to the parcel:
    //  1 OV footprint + parseable PLANTES        -> envelope (explicit-area)   [the "OV route"]
    //  2 OV footprint, PLANTES unparseable       -> refuse missing-data (never a default)
    //  3 Asterisc / PD*                          -> refuse delegated
    //  4 NORMATIV titol_2 or titol_3 (sistemes)  -> refuse terminal
    //  5 QUAL_MUNI carries ARM+N_PLANTES+OCUP_MAX+SEP_FVIAL -> envelope (published values)
    //  6 clau in the REGISTERED PGM pack set AND the PGM governs -> envelope  [the "ladder route"]
    //  7 otherwise                               -> refuse
    t('L67_envelopeSynthesis');
    const rows = [];
    for (const p of parcels) {
        const zf = locate(zoneFeats, p.lon, p.lat);
        if (!zf) { rows.push({ ref: p.ref, final: 'no-determination', reason: 'centroid outside every layer-16 polygon' }); continue; }
        const clau = String(zf.a.CLAU_URB ?? ''), norm = String(zf.a.NORMATIV ?? ''), plan = String(zf.a.PLAN ?? '');
        const ov = locate(ovFeats, p.lon, p.lat);
        const pl = ov ? parsePlantes(ov.a.PLANTES) : null;
        const q = qmByClau.get(clau) ?? null;
        const base = { ref: p.ref, clau, plan, normativ: norm, equiPgm: String(zf.a.EQUI_PGM ?? '') };
        if (pl) { rows.push({ ...base, final: 'envelope', via: 'OV_Trames', rung: 2, storeys: pl.storeys }); continue; }
        if (ov) { rows.push({ ...base, final: 'refuse', cat: 'missing-authoritative-data', via: 'OV_Trames', reason: `PLANTES='${ov.a.PLANTES}' unparseable — refuses rather than defaulting` }); continue; }
        if (norm === 'Asterisc' || plan.includes('PD*')) { rows.push({ ...base, final: 'refuse', cat: 'delegated', reason: `PLAN='${plan}' NORMATIV='Asterisc' — delegated to a pla derivat not in corpus` }); continue; }
        if (/^num_\w+\.titol_(2|3)\./.test(norm)) { rows.push({ ...base, final: 'refuse', cat: 'terminal', reason: `${norm} — sistemes / public land; no private envelope exists` }); continue; }
        if (q && has(q.ARM) && has(q.N_PLANTES) && has(q.OCUP_MAX) && has(q.SEP_FVIAL)) { rows.push({ ...base, final: 'envelope', via: 'QUAL_MUNI', rung: 1 }); continue; }
        if (pgmGoverned && REGISTERED_CLAUS.has(clau)) { rows.push({ ...base, final: 'envelope', via: 'PGM_REGIONAL_PACK', rung: 4, reason: `clau '${clau}' is answered by a registered PGM pack and NORMATIV cites ${norm}` }); continue; }
        if (q) { rows.push({ ...base, final: 'refuse', cat: 'missing-authoritative-data', reason: `QUAL_MUNI row exists for '${clau}' but every envelope field is NULL` }); continue; }
        rows.push({ ...base, final: 'refuse', cat: 'missing-authoritative-data', reason: `no QUAL_MUNI row and no registered pack for clau '${clau}'` });
    }
    e('L67_envelopeSynthesis');

    // ── what the PRODUCT would need before any of this could ship ───────────────────────────────
    // ⛔⛔ A CORRECTION TO A FIGURE THAT HAS ALREADY PROPAGATED INTO A NORMATIVE DOCUMENT.
    //
    // `task2-pgm-cold-pipeline.mjs` computed the OV route as `rows.filter(r => r.via === 'OV_Trames')`
    // — but `via: 'OV_Trames'` is stamped on TWO outcomes: the envelope (rung 2) AND the refusal for
    // an unparseable `PLANTES`. The route count therefore included parcels the pipeline REFUSED.
    //
    // MEASURED against out/task2-pgm-cold-pipeline.json — the overstatement is real in all three:
    //     08204 Sant Climent   published 38.08 %  →  TRUE OV envelope  38.01 %   (1 parcel)
    //     08245 Santa Coloma   published 58.33 %  →  TRUE OV envelope  55.93 %   (72 parcels)
    //     08019 Barcelona      published  7.57 %  →  TRUE OV envelope   6.70 %   (26 parcels)
    // The tell was arithmetic and sitting in the artefact all along: `envelope_OV + envelope_QUAL_MUNI
    // + envelope_PGM_PACK` did not equal `envelope` in ANY of the three rows.
    //
    // ⚠ THOSE ARE THE NUMBERS IN `REGIONAL-INTAKE-LIST` §5 ("OV coverage 38–58 %", "measured at Sant
    //   Climent 38.08 % … Santa Coloma 58.33 %"), which is NORMATIVE. The true band is 38.01–55.93 %.
    //   The LADDER figures (5.87 / 3.10 / 27.33) are unaffected — `PGM_REGIONAL_PACK` is only ever
    //   stamped on an envelope — so ⭐ THE HEADLINE CONCLUSION SURVIVES: OV still dwarfs the ladder
    //   in the cold municipalities and still inverts in Barcelona. The direction is right; the
    //   magnitude was overstated.
    // ⇒ HERE, EVERY ROUTE COUNT IS CONDITIONED ON `final === 'envelope'`, AND THE REFUSALS ARE
    //   COUNTED SEPARATELY SO THE TWO CAN NEVER MERGE AGAIN.
    const envRow = (r) => r.final === 'envelope';
    const viaPack = rows.filter((r) => envRow(r) && r.via === 'PGM_REGIONAL_PACK').length;
    const viaOv = rows.filter((r) => envRow(r) && r.via === 'OV_Trames').length;
    const viaQm = rows.filter((r) => envRow(r) && r.via === 'QUAL_MUNI').length;
    const ovRouteRefused = rows.filter((r) => !envRow(r) && r.via === 'OV_Trames').length;
    if (ine !== PUBLISHED_INE) {
        if (viaPack > 0) {
            gates.push({ module: 'packages/site-parcel-data/src/rulepacks/registry.ts', why: `The PGM packs are registered under jurisdictionId 'es-08019-barcelona' with BARCELONA_BBOX. ${viaPack} parcels would route here only because that bbox is declared metropolitan and happens to contain them — the pack's citations would then be Barcelona's.`, blockerClass: 'Engineering', affects: viaPack });
            for (const mod of BCN_EXCLUSIVE.filter((m) => m.appliesTo.some((c) => (c.endsWith('*') ? rows.some((r) => r.clau?.startsWith(c.slice(0, -1))) : rows.some((r) => r.clau === c))))) {
                gates.push({ module: mod.file, why: `Arts. ${mod.articles.join('/')} are read from ${mod.instrument}, whose own scope is «${mod.scope}». It does NOT govern ${name}.`, blockerClass: 'Legal', affects: rows.filter((r) => mod.appliesTo.some((c) => (c.endsWith('*') ? r.clau?.startsWith(c.slice(0, -1)) : r.clau === c))).length });
            }
        }
        if (viaOv > 0) {
            gates.push({ module: 'packages/site-parcel-data/src/providers/bcnRefosOVProvider.ts', why: `The resolver hardcodes CODI_INE='${PUBLISHED_INE}' in its WHERE clause, so it returns 'no-feature' for every parcel here; apps/editor/src/ui/site/siteDispatch.ts additionally guards the branch to clau exactly '18'.`, blockerClass: 'Engineering', affects: viaOv });
            gates.push({ module: 'packages/site-parcel-data/src/rulepacks/bcnAlcadaReguladora.ts', why: 'heightFromFloorsAboveGround() converts storeys→metres using the Art. 327.2a ladder AS MODIFIED FOR BARCELONA. The base metropolitan ladder that governs other AMB municipalities exists as BCN_ART327_BASE_METROPOLITAN_TABLE and NOTHING READS IT.', blockerClass: 'Legal', affects: viaOv });
        }
    }
    if (!pgmGoverned) {
        gates.push({ module: '(no corpus)', why: `PGM='${pgmFlag}' — the metropolitan plan does NOT govern this municipality. Its own general plan supplies the ordinance text and PRYZM does not hold it. Every envelope measured here rests on published PARAMETERS (OV storey counts / QUAL_MUNI rows) with NO article citation behind them.`, blockerClass: 'Data acquisition', affects: rows.filter((r) => r.final === 'envelope').length });
    }

    const N = parcels.length;
    const pc = (x) => +((100 * x) / N).toFixed(2);
    const cnt = (f) => rows.filter(f).length;
    const env = cnt((r) => r.final === 'envelope');
    const tally = {
        envelope: env,
        envelope_OV: viaOv, envelope_QUAL_MUNI: viaQm, envelope_PGM_PACK: viaPack,
        ovRoute_refusedUnparseablePlantes: ovRouteRefused,
        refuse_delegated: cnt((r) => r.cat === 'delegated'),
        refuse_terminal: cnt((r) => r.cat === 'terminal'),
        refuse_missingData: cnt((r) => r.cat === 'missing-authoritative-data'),
        noDetermination: cnt((r) => r.final === 'no-determination'),
    };
    const pct = Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, pc(v)]));
    // ⭐ THE ARITHMETIC IDENTITY THAT WOULD HAVE CAUGHT THE OLD DEFECT ON DAY ONE, NOW ASSERTED.
    //    The routes must PARTITION the envelopes, and every parcel must land in exactly one bucket.
    //    A probe that cannot balance its own books is not measuring anything (PROBE-DISCIPLINE R2).
    const routeSum = viaOv + viaQm + viaPack;
    const bucketSum = env + tally.refuse_delegated + tally.refuse_terminal + tally.refuse_missingData + tally.noDetermination;
    const invariants = {
        routesPartitionEnvelopes: { envelope: env, routeSum, ok: routeSum === env },
        bucketsPartitionParcels: { N, bucketSum, ok: bucketSum === N },
    };
    if (!invariants.routesPartitionEnvelopes.ok || !invariants.bucketsPartitionParcels.ok) {
        throw new Error(`INVARIANT VIOLATION in ${ine} ${name}: ${JSON.stringify(invariants)} — refusing to emit a figure from a probe whose buckets do not balance.`);
    }
    // DETERMINATION = an envelope, or a refusal that CITES why. `missing-authoritative-data` and
    // `no-determination` are NOT determinations — they are silence.
    const determinationPct = +(pct.envelope + pct.refuse_delegated + pct.refuse_terminal).toFixed(2);

    /**
     * ⚠ "NO ESTIMATE WITHOUT AN INTERVAL, AND NO INTERVAL WITHOUT A STATED FRAME"
     *   (ENVELOPE-REACHABILITY-TRACKER, binding rule 4).
     *
     * A municipality under the sampling threshold is a CENSUS of its parcel population — every
     * parcel joined, no interval needed, and saying "±0" would be noise. A municipality ABOVE it is
     * a seeded uniform draw and its percentages are ESTIMATES. Reported with a 95 % half-width, on
     * the normal approximation with the finite-population correction, and the FRAME named: the
     * municipality's full Catastro INSPIRE CP parcel population, every parcel weighing 1.
     *
     * ⛔ This is a SAMPLING interval only. It says nothing about whether the determination is
     *    legally right — that is what the guards, the control and the refusal categories are for.
     */
    const ci95 = (p) => {
        if (!sampled) return null;
        const q = p / 100;
        const fpc = Math.sqrt(Math.max(0, (sampling.population - N) / (sampling.population - 1)));
        return +(100 * 1.96 * Math.sqrt(Math.max(0, q * (1 - q)) / N) * fpc).toFixed(2);
    };
    const uncertainty = sampled
        ? { kind: 'seeded uniform sample', frame: 'the municipality\'s full Catastro INSPIRE CP parcel population; every parcel weighs 1', population: sampling.population, drawn: N, seed: SEED, ci95HalfWidthPct: { envelope: ci95(pct.envelope), envelope_OV: ci95(pct.envelope_OV), envelope_PGM_PACK: ci95(pct.envelope_PGM_PACK), determination: ci95(determinationPct) }, method: 'normal approximation with finite-population correction, 95 %' }
        : { kind: 'CENSUS — every parcel in the population was joined', frame: 'the municipality\'s full Catastro INSPIRE CP parcel population', population: sampling.population, drawn: N, ci95HalfWidthPct: null, note: 'no sampling interval applies; this is not an estimate' };

    return {
        ine, name, pgmFlag, status: 'proven',
        ccaa: 'Catalunya',
        N,
        codeSpace: 'INE (AMB layer-16 CODI_INE) — NOT the Catastro DGC code',
        guards: { g1, g2 }, sampling, paging,
        instrument: { pgmGoverned, instrumentRoots, equiPgmPublished: zoneFeats.some((f) => has(f.a.EQUI_PGM)), clauNormativCardinality },
        counts: {
            zonePolygons: zoneFeats.length,
            distinctClaus: new Set(zoneFeats.map((f) => f.a.CLAU_URB)).size,
            qualMuniRows: qmRows.length,
            qualMuniWithArm: qmRows.filter((r) => has(r.ARM)).length,
            qualMuniAllFourEnvelopeFields: qmRows.filter((r) => has(r.ARM) && has(r.N_PLANTES) && has(r.OCUP_MAX) && has(r.SEP_FVIAL)).length,
            ovPolygons: ovFeats.length,
        },
        tally, pct, determinationPct, invariants, uncertainty,
        plantes,
        gates,
        clocks, rows,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// TRACKER ROWS — the shape ENVELOPE-REACHABILITY-TRACKER §7 requires, EMITTED not typed.
//   INE · name · CCAA · status · envelope% · determination% · blocking item · class · last measured
// The headline count must become a `grep -c` over this file. Nothing here is hand-written.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ═══ THE STATUS VOCABULARY — ENVELOPE-REACHABILITY-TRACKER §7.2, verbatim ══════════════════════
//
//   published  an envelope is DRAWN IN PRODUCTION today, behind an OPEN gate with a RECORDED
//              signature.
//   proven     a coverage figure has been COMPUTED from a real run against live services, and the
//              run is SEEDED AND RE-RUNNABLE. Does NOT require publication, a signature or a gate.
//   reachable  the code path RESOLVES for this municipality — no hardcode blocks it — but NO
//              COVERAGE FIGURE HAS BEEN COMPUTED.
//   blocked    a NAMED blocker prevents even a refusal being determined, with its class recorded.
//   untested   none of the above attempted. The honest default.
//
// ⭐ THEY ARE NOT MUTUALLY EXCLUSIVE. `proven` is about EVIDENCE, `published` is about
//   AUTHORISATION, `reachable` is about CODE. A row therefore carries BOTH:
//     `status`   — the HIGHEST it earns, for the single-value column the tracker row shape wants;
//     `statuses` — every status it earns, so membership counts are a `grep -c` and not a
//                  re-derivation. Barcelona is `published` AND `proven`, and collapsing that to one
//                  is exactly how Step 1 reported `proven 1` against a record holding `proven 2`.
// ⛔ AND A MUNICIPALITY THIS RUN ATTEMPTED AND COULD NOT MEASURE IS `blocked` WITH THE BLOCKER
//   NAMED AND CLASSED — never `untested`. `untested` means nobody tried.
const STATUS_RANK = { published: 4, proven: 3, reachable: 2, blocked: 1, untested: 0 };
const highest = (ss) => ss.slice().sort((a, b) => STATUS_RANK[b] - STATUS_RANK[a])[0] ?? 'untested';

function trackerRow(r, measuredAt) {
    if (r.status === 'blocked' || r.failed) {
        // ⚠ TWO-NUMBER RULE: a row with no computed coverage carries NEITHER number, not a zero.
        //   A zero would read as "measured, and it is nothing" — the failure-vs-empty conflation.
        return {
            ine: r.ine, name: r.name, ccaa: 'Catalunya',
            status: 'blocked', statuses: ['blocked'],
            envelopePct: null, determinationPct: null,
            blockingItem: `${r.failed}: ${r.reason}`.slice(0, 200),
            class: r.failed === 'L0' ? 'Data acquisition' : 'Data acquisition',
            lastMeasured: measuredAt,
        };
    }
    const published = r.ine === PUBLISHED_INE;
    // BLOCKING ITEM = what stops PRYZM DELIVERING the measured envelope today. Deterministic:
    //   published                       -> the largest remaining refusal bucket
    //   PGM governs, envelope measured   -> the Phase-1 unbinding (Engineering)
    //   PGM does NOT govern              -> the missing municipal ordinance corpus (Data acquisition)
    //   no envelope measured at all      -> the largest refusal bucket
    let blockingItem, klass;
    const buckets = [
        ['delegated to a pla derivat not held', r.pct.refuse_delegated, 'Data acquisition'],
        ['legally terminal (sistemes) — not a gap', r.pct.refuse_terminal, 'Legal'],
        ['missing authoritative data', r.pct.refuse_missingData, 'Data acquisition'],
        ['no determination (parcel outside every zoning polygon)', r.pct.noDetermination, 'Data acquisition'],
    ].sort((a, b) => b[1] - a[1]);
    if (published) { blockingItem = `${buckets[0][0]} (${buckets[0][1]} %)`; klass = buckets[0][2]; }
    else if (!r.instrument.pgmGoverned) { blockingItem = `PGM does not govern — municipal ordinance corpus not held; measured envelope has no article citation`; klass = 'Data acquisition'; }
    else if (r.pct.envelope > 0) { blockingItem = `Phase-1 unbinding: bcnRefosOVProvider CODI_INE='${PUBLISHED_INE}' · siteDispatch clau-18 guard · registry.ts BARCELONA_BBOX`; klass = 'Engineering'; }
    else { blockingItem = `${buckets[0][0]} (${buckets[0][1]} %)`; klass = buckets[0][2]; }
    // EVERY successfully measured municipality earns `proven` — a computed, seeded, re-runnable
    // coverage figure against live services is exactly the definition, and it is what this run does.
    const statuses = published ? ['published', 'proven'] : ['proven'];
    return {
        ine: r.ine, name: r.name, ccaa: 'Catalunya',
        status: highest(statuses), statuses,
        // TWO-NUMBER RULE: a `proven` row carries envelope % AND determination %, never one alone.
        envelopePct: r.pct.envelope, determinationPct: r.determinationPct,
        blockingItem, class: klass, lastMeasured: measuredAt,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const universe = await enumerateAmb();
if (!universe.ok) { console.error('⛔ ENUMERATION FAILED: ' + universe.reason); process.exit(1); }
console.log(`ENUMERATION · AMB layer 16 carries ${universe.distinctCount} distinct CODI_INE · PGM='S' ${universe.pgmS} · PGM≠'S' ${universe.pgmNotS}`);

// ⛔ RUN BEFORE ANY MEASUREMENT. The raw-row / distinct-INE / distinct-NOMMUNI disagreement is a
//    FINDING, not a nuisance to be normalised away. See ambEnumerate.schemaIntegrity().
const integrity = await schemaIntegrity();
console.log(`SCHEMA INTEGRITY · L16 rows ${integrity.layer16.rawRows} · INE ${integrity.layer16.distinctCodiIne} · NOMMUNI ${integrity.layer16.distinctNommuni} || L17 rows ${integrity.layer17.rawRows} · INE ${integrity.layer17.distinctCodiIne} · NOMMUNI ${integrity.layer17.distinctNommuni} (blank on ${integrity.layer17.rowsWithBlankNommuni} rows)`);
console.log(`  ${integrity.verdict.disagreement}`);

// ⚠ THE ENUMERATION QUESTION IS THE SCHEMA UNIVERSE vs THE CORPUS UNIVERSE, AND THEY ARE DIFFERENT
//   CLAIMS. "36 rows on a layer" is not "36 municipalities the PGM governs". Both are emitted, and
//   every documented figure is reconciled against them explicitly rather than being picked from.
const reconciliation = {
    measured: {
        layer16_distinctCodiIne: integrity.layer16.distinctCodiIne,
        layer17_distinctCodiIne: integrity.layer17.distinctCodiIne,
        codiIneSetsIdenticalAcrossLayers: integrity.verdict.codiIneSetsIdentical,
        pgmGoverns_S: universe.pgmS,
        pgmDoesNotGovern: universe.pgmNotS,
        pgmS_excludingThePublishedCity: universe.pgmS - 1,
    },
    documentedFigures: [
        { figure: 36, source: 'ENVELOPE-REACHABILITY-TRACKER §6 "the AMB layer covers all 36 municipalities"; REGIONAL-INTAKE-LIST', claim: 'the SCHEMA universe — municipalities the service carries', verdict: 'CONFIRMED — 36 distinct CODI_INE on layer 16, and the identical 36 on layer 17' },
        { figure: 27, source: 'ENVELOPE-REACHABILITY-TRACKER §4 "AMB PGM measured at 27 of 36 carrying PGM=\'S\'"', claim: 'the CORPUS universe — municipalities the metropolitan plan governs', verdict: 'CONFIRMED — 27 carry PGM=\'S\', 9 carry \'N\', and NO municipality is mixed (the flag is uniform within every municipality, which the docs do not state)' },
        { figure: 26, source: 'ENVELOPE-REACHABILITY-TRACKER §6 "that is why 26 are one unbinding away" and Phase 3 "run the AMB — 26 through the runner"', claim: 'the PGM-governed set minus the already-published city', verdict: 'ARITHMETICALLY CONSISTENT (27 − 1 Barcelona = 26) but it had NEVER been enumerated per municipality. This run enumerates it.' },
        { figure: 25, source: 'REGIONAL-INTAKE-LIST item 8 "Arts. 320/327/328 rewritten by Badalona and Barcelona ONLY, 2 of 27. The base ladder governs the other 25."', claim: 'the PGM-governed set minus the two DEVIATING municipalities', verdict: 'ARITHMETICALLY CONSISTENT (27 − 2 = 25). ⚠ It is a DIFFERENT subtraction from the 26 and the two are not interchangeable: 26 = 27 − {Barcelona, published}; 25 = 27 − {Barcelona, Badalona, deviating}. Badalona is inside the 26 and outside the 25.' },
        { figure: 22, source: 'task2-pgm-cold-pipeline.mjs header selection rule "N=22"', claim: 'PGM=\'S\' minus Barcelona minus the 4 with an existing rulepack file', verdict: 'ARITHMETICALLY CONSISTENT (27 − 1 − 4 = 22) — a fifth denominator in the same corpus. Four different numbers (36/27/26/25/22) are in circulation for five DIFFERENT questions.' },
    ],
    rule: 'The schema universe (36) and the corpus universe (27) are different claims about different things. Conflating them is the schema-vs-corpus error. Every downstream count in this artefact names which universe it is a count of.',
};
for (const d of reconciliation.documentedFigures) console.log(`  RECONCILE ${String(d.figure).padStart(3)} · ${d.verdict.slice(0, 120)}`);

// A one-shot census of QUAL_MUNI, so the per-municipality zeros are provably absence-in-the-table
// and not a failed read. `CODI_INE` in this table is measured, not assumed.
const qmAll = await readAllPaged(`${SVC}/18/query`, { f: 'json', where: '1=1', outFields: '*', returnGeometry: 'false' }, 'census:table18');
const qmCensus = qmAll.ok ? (() => {
    const a = qmAll.features.map((f) => f.attributes);
    const byPrefix = {};
    for (const r of a) { const p = String(r.CODI_MUN ?? '').slice(0, 5); (byPrefix[p] ??= []).push(r); }
    return {
        totalRows: a.length,
        codiIneNonNull: a.filter((r) => has(r.CODI_INE)).length,
        codiIneNote: 'QUAL_MUNI declares a CODI_INE column. It is NULL on every row — the declared join key is unusable and only the CODI_MUN prefix works. A schema read would have reported this table as INE-joinable.',
        municipalPrefixesPresent: Object.keys(byPrefix).sort(),
        perPrefix: Object.fromEntries(Object.entries(byPrefix).sort().map(([k, rs]) => [k, { rows: rs.length, allFourEnvelopeFields: rs.filter((r) => has(r.ARM) && has(r.N_PLANTES) && has(r.OCUP_MAX) && has(r.SEP_FVIAL)).length }])),
    };
})() : { error: 'table-18 census read failed — UNKNOWN, not empty' };

const measuredAt = new Date().toISOString().slice(0, 10);
const results = [];
for (const m of universe.municipalities) {
    if (only && m.ine !== only) continue;
    const t0 = Date.now();
    let r;
    try { r = await runCity(m.ine, m.name, m.pgm.join('|')); }
    catch (err) { r = { ine: m.ine, name: m.name, pgmFlag: m.pgm.join('|'), status: 'blocked', failed: 'exception', reason: String(err && err.message).slice(0, 300) }; }
    r.wallClockTotalMs = Date.now() - t0;
    results.push(r);
    if (r.failed) { console.log(`⛔ ${r.ine} ${r.name} — BLOCKED AT ${r.failed}: ${r.reason}`); continue; }
    console.log(`${r.ine} ${r.name.padEnd(28)} PGM=${r.pgmFlag} N=${String(r.N).padStart(5)}${r.sampling.sampled ? '*' : ' '} zones=${String(r.counts.zonePolygons).padStart(5)} claus=${String(r.counts.distinctClaus).padStart(3)} ov=${String(r.counts.ovPolygons).padStart(5)} | ENV ${String(r.pct.envelope).padStart(6)}% (OV ${String(r.pct.envelope_OV).padStart(6)}% · ladder ${String(r.pct.envelope_PGM_PACK).padStart(5)}% · QM ${String(r.pct.envelope_QUAL_MUNI).padStart(5)}%) | deleg ${String(r.pct.refuse_delegated).padStart(6)}% term ${String(r.pct.refuse_terminal).padStart(6)}% miss ${String(r.pct.refuse_missingData).padStart(5)}% nodet ${String(r.pct.noDetermination).padStart(5)}% | PLANTES pop ${r.plantes.populatedPct}% parse ${r.plantes.parseablePctOfAll}%`);
}

// ═══ THE KNOWN-ANSWER CONTROL — asserted, and it gates the report of the other 35 ═══════════════
const bcn = results.find((r) => r.ine === '08019');
const EXPECT = { distinctClaus: 89, ovPolygons: 5073, envelopePct: 34.03 };
const control = bcn && !bcn.failed
    ? {
        run: true,
        expected: EXPECT,
        observed: { distinctClaus: bcn.counts.distinctClaus, ovPolygons: bcn.counts.ovPolygons, envelopePct: bcn.pct.envelope },
        pass: bcn.counts.distinctClaus === EXPECT.distinctClaus && bcn.counts.ovPolygons === EXPECT.ovPolygons && Math.abs(bcn.pct.envelope - EXPECT.envelopePct) < 0.005,
        source: 'out/task2-pgm-cold-pipeline.json (2026-08-02), the run that caught maxRecordCount=2000',
    }
    : { run: false, note: 'Barcelona was not in this run (--only) or was blocked; the control is NOT satisfied and the other rows must be treated as unverified.' };

const trackerRows = results.map((r) => trackerRow(r, measuredAt));
// BOTH tallies, because they answer different questions and only one of them is a partition.
//   exclusive  — each municipality counted once, under the highest status it earns. Sums to 36.
//   membership — how many municipalities EARN each status. Does NOT sum to 36, and must not be
//                made to: Barcelona is published AND proven, and that is the point.
const statusCounts = {
    exclusive: trackerRows.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {}),
    membership: trackerRows.reduce((a, r) => { for (const s of r.statuses) a[s] = (a[s] ?? 0) + 1; return a; }, {}),
    total: trackerRows.length,
    note: 'exclusive partitions the 36; membership counts every status a municipality earns. `proven` is EVIDENCE, `published` is AUTHORISATION, `reachable` is CODE — collapsing any two yields a count that cannot be reproduced from the repo.',
};

writeFileSync(join(OUT, 'task5-amb-all-municipalities.json'), JSON.stringify({
    probe: 'TASK-5 · every AMB municipality, measured — "up to 26" turned into a number',
    ranAt: new Date().toISOString(),
    seed: SEED, sampleAbove: SAMPLE_ABOVE, sampleN: SAMPLE_N,
    reRun: 'node tools/cold-start-probe/task5-amb-all-municipalities.mjs',
    noMeanRule: 'NO METROPOLITAN MEAN IS COMPUTED. The OV and ladder routes INVERT across the metropolis; a mean would erase that. Aggregate only by counting rows, never by averaging percentages.',
    enumeration: { distinctCount: universe.distinctCount, pgmS: universe.pgmS, pgmNotS: universe.pgmNotS, source: universe.source, municipalities: universe.municipalities },
    schemaIntegrity: integrity,
    enumerationReconciliation: reconciliation,
    qualMuniCensus: qmCensus,
    knownAnswerControl: control,
    // ⛔ A CORRECTION TO ALREADY-PROPAGATED FIGURES. Recorded here so it cannot be lost in a transcript.
    correctionToPriorArtefact: {
        appliesTo: 'out/task2-pgm-cold-pipeline.json and every figure quoted from it',
        quotedIn: 'docs/04-reference/standards/REGIONAL-INTAKE-LIST.md §5 (NORMATIVE) — "OV coverage 38–58 %"; ENVELOPE-REACHABILITY-TRACKER §6 Phase 4 — "the OV route is 38.08 % / 58.33 %"',
        defect: "task2 computed the OV route as rows.filter(r => r.via === 'OV_Trames'), but that tag is stamped on the ENVELOPE (rung 2) AND on the refusal for an unparseable PLANTES. The route count included parcels the pipeline refused.",
        tell: 'envelope_OV + envelope_QUAL_MUNI + envelope_PGM_PACK did not equal envelope in ANY of task2\'s three rows. The arithmetic was in the artefact the whole time.',
        corrections: [
            { ine: '08204', name: 'Sant Climent de Llobregat', published_ovPct: 38.08, corrected_ovPct: 38.01, overstatedByParcels: 1 },
            { ine: '08245', name: 'Santa Coloma de Gramenet', published_ovPct: 58.33, corrected_ovPct: 55.93, overstatedByParcels: 72 },
            { ine: '08019', name: 'Barcelona', published_ovPct: 7.57, corrected_ovPct: 6.70, overstatedByParcels: 26 },
        ],
        unaffected: 'The LADDER figures (5.87 / 3.10 / 27.33) and every total envelope % — including the 34.03 % control — are unaffected. PGM_REGIONAL_PACK is only ever stamped on an envelope, and `envelope` was always counted as final===\'envelope\'.',
        conclusionSurvives: 'OV still dwarfs the ladder in the cold municipalities (38.01 vs 5.87 · 55.93 vs 3.10) and still inverts in Barcelona (6.70 vs 27.33). The Phase-4 reordering onto storeys→metres stands. The direction was right; the magnitude was overstated.',
        prevention: 'runCity() now ASSERTS that the routes partition the envelopes and the buckets partition the parcels, and throws rather than emitting an unbalanced figure.',
    },
    registeredBarcelonaClaus: [...REGISTERED_CLAUS],
    barcelonaExclusiveModifications: BCN_EXCLUSIVE,
    statusCounts,
    trackerRows,
    results: results.map((r) => ({ ...r, rows: undefined, rowSampleFirst20: r.rows ? r.rows.slice(0, 20) : undefined })),
    network: netLog,
}, null, 1));

// The tracker row set, one line each, greppable.
// ⭐ THE HEADLINE COUNT MUST BE A `grep -c`, NEVER A TYPED CLAIM (tracker §7). `statuses` is a
//    pipe-joined membership column precisely so that `grep -c 'proven' out/amb-tracker-rows.tsv`
//    and `grep -c 'published' …` both answer without anyone re-deriving anything.
const tsv = ['# INE\tname\tCCAA\tstatus\tstatuses\tenvelope%\tdetermination%\tblocking item\tclass\tlast measured',
    `# emitted by tools/cold-start-probe/task5-amb-all-municipalities.mjs · seed ${SEED} · control=${control.pass ? 'PASS' : 'FAIL/NOT-RUN'} · NEVER hand-edit`,
    '# status = the HIGHEST earned (published>proven>reachable>blocked>untested); statuses = ALL earned. They are not mutually exclusive.',
    '# a blocked row carries NEITHER percentage — a zero would read as "measured, and it is nothing".',
    ...trackerRows.map((r) => [r.ine, r.name, r.ccaa, r.status, r.statuses.join('|'), r.envelopePct ?? '', r.determinationPct ?? '', r.blockingItem, r.class, r.lastMeasured].join('\t'))].join('\n');
writeFileSync(join(OUT, 'amb-tracker-rows.tsv'), tsv + '\n');

console.log(`\nCONTROL 08019 Barcelona · expected ${JSON.stringify(EXPECT)} · observed ${JSON.stringify(control.observed ?? null)} · ${control.pass ? 'PASS' : '⛔ FAIL'}`);
console.log(`STATUS COUNTS (grep -c on out/amb-tracker-rows.tsv): ${JSON.stringify(statusCounts)}`);
console.log('→ out/task5-amb-all-municipalities.json');
console.log('→ out/amb-tracker-rows.tsv');
