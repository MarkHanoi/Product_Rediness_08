#!/usr/bin/env node
// §FR-100-PARCEL-AUDIT — the founder's decisive experiment, run for real.
//
//   "Of the rules that apply to a random parcel, what percentage can PRYZM recover as an
//    authoritative parameter without human judgement?"
//   — FR-FOUNDER-REACHABILITY-BOUNDARY.md §11
//
// Traces every required envelope field `parcel → authoritative source → extracted value →
// computable envelope`, labelling each failure with the founder's six labels.
//
// HONESTY RULES BUILT IN:
//  • An EMPTY answer and a FAILED fetch are never the same value. Transport failure is retried,
//    then labelled `inaccessible`; a served-but-empty layer is an ANSWER.
//  • Deterministic seed → the same 100 parcels on re-run.
//  • Every endpoint spelling is copied from the SHIPPED, live-probed client
//    (countryAdapters/fr/frGpuClient.ts). No endpoint is invented.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ROUND 2 (2026-09-04, lane ENVELOPE-FR) — founder blocker review moves 2, 3 and §11
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Round 1 measured `parameter recovery 3.0 % (15/500)` and could not say what the CEILING was,
// because it kept only the prescription CODES and threw the payload away. Three additions, all of
// them measurement — no scoring rule changed, so round 1's headline stays comparable:
//
//  M2 · THE GPU-ONLY `TXT` CEILING (review §5). Every applying prescription's `LIBELLE` / `TXT` /
//       `NATURE` is now PERSISTED, so "share of applying prescriptions carrying a parseable number"
//       is computed from the record rather than asserted. ⭐ This reframes 3.0 % from *"we recover
//       3 %"* to *"the national chain can yield at most X %, and we recover 3.0 of it"* — and it is
//       the number that forecloses a `TXT`-cleanup proposal. Paris's `txt=""` is the CNIG schema
//       behaving as specified (`URLFIC` is defined as a hyperlink, empty permitted); it is a
//       structural ceiling, not producer quality, and only the persisted payload can prove that.
//
//  M3 · THE SOURCE-TIER COMPARISON (review §11). `resolveParisPluZone.ts`'s municipal pack is now
//       queried ALONGSIDE the national chain for every parcel in Paris (INSEE 75056), and a
//       PARIS-ONLY stratum C gives that comparison an n worth quoting. It decides move 6 (municipal
//       pack adapters) against move 7 (the PDF leg). ⛔ The pack NEVER overwrites a national state:
//       both answers are recorded side by side, because the question IS the delta.
//
//  §11 · VINTAGE. `datappro` and `nature` now travel, so recovery can be stratified by CNIG
//       document version — v2022-10 / v2024-01 (2.1.0) carry NATURE, v2017c/d do not, and the
//       newer stratum grows. A pair-shaped `idPrescription` is itself the vintage signal.
//
// ⛔ DETERMINISM PRESERVED. Strata A and B draw from the `rnd` stream FIRST and in the original
// order, so the same seed still yields the same 100 parcels; stratum C is drawn afterwards and
// cannot perturb them. Round 1's raw record (`fr-audit-raw.json`) is NOT overwritten — round 2
// writes beside it, so the two are diffable.

import { writeFileSync } from 'node:fs';

const WFS = 'https://data.geopf.fr/wfs/ows';
const SEED = 20260904;
const TIMEOUT_MS = 45000;

// ── the municipal pack under test (move 3) ────────────────────────────────────────────────────
// ⛔ EVERY SPELLING BELOW IS COPIED VERBATIM from the SHIPPED, live-probed proxy
// `server/jurisdiction/parisPluProxy.js` (PARIS_*_ENDPOINT + build*Url). No endpoint is invented
// and no query shape is guessed — including the axis trap the proxy documents: the GPU CQL filter
// is `POINT(lat lon)` while ODSQL WKT is the standard `POINT(lon lat)`.
// ⛔ THE ROUTING GATE IS THE BBOX, NOT THE INSEE — measured, and it cost a smoke run.
// The Ville de Paris is INSEE 75056, so an INSEE-keyed Paris gate reads as the obvious one. It is
// UNSATISFIABLE against this chain: `wfs_du:municipality` serves the ARRONDISSEMENT code at every
// point inside Paris (probe 2026-09-04 → `75110` PARIS-10E, `75118` PARIS-18E), never `75056`.
// A gate written that way fires zero times and reports "the pack carries nothing" — an answer
// indistinguishable from a real absence. The SHIPPED resolver already gets this right by routing on
// `isInParis` (`providers/parisBbox.ts`), and PARIS_BBOX below is copied VERBATIM from it so the
// audit measures the pack the product would actually reach. The served INSEE is recorded per parcel
// so an arrondissement outside the box is visible rather than silently mis-attributed.
const PARIS_BBOX = { minLat: 48.80, maxLat: 48.91, minLon: 2.22, maxLon: 2.47 };
const isInParis = (lat, lon) => lat >= PARIS_BBOX.minLat && lat <= PARIS_BBOX.maxLat
    && lon >= PARIS_BBOX.minLon && lon <= PARIS_BBOX.maxLon;
const ODS = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets';
const PARIS_FILET_RADIUS_M = 20;
const PARIS_PACK_LAYERS = [
    // dataset, parameter it speaks to, ODSQL where-clause builder, selected fields
    { ds: 'plub_hauteur', param: 'C2', kind: 'intersects', select: 'hauteur' },
    { ds: 'plub_hmc', param: 'C2', kind: 'intersects', select: 'hmc,ht_hmc' },
    { ds: 'plub_ecm', param: 'C4', kind: 'intersects', select: 'emprise,hauteur,st_area_shape' },
    { ds: 'plub_eal', param: 'C4', kind: 'intersects', select: 'st_area_shape' },
    { ds: 'plub_filet', param: 'C6', kind: 'within', select: 'haut,cour' },
];

// ── deterministic PRNG (mulberry32) — reproducible sample, no Math.random ──────────────────────
function mulberry32(a) {
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = mulberry32(SEED);

// ── the sampling frame ────────────────────────────────────────────────────────────────────────
// Mainland France bbox. Points outside land return no `municipality` feature and are rejected —
// which is the honest filter (it is the authority's own answer, not our guess at a coastline).
const BBOX = { lonMin: -4.7, lonMax: 8.1, latMin: 42.4, latMax: 51.0 };

// Stratum B: the 25 largest communes. Coordinates are commune centres; the audit RECORDS the
// commune name the authority returns, so a wrong coordinate is visible in the output rather than
// silently mis-attributed.
const CITIES = [
    ['Paris', 48.8566, 2.3522], ['Marseille', 43.2965, 5.3698], ['Lyon', 45.764, 4.8357],
    ['Toulouse', 43.6047, 1.4442], ['Nice', 43.7102, 7.262], ['Nantes', 47.2184, -1.5536],
    ['Montpellier', 43.6108, 3.8767], ['Strasbourg', 48.5734, 7.7521], ['Bordeaux', 44.8378, -0.5792],
    ['Lille', 50.6292, 3.0573], ['Rennes', 48.1173, -1.6778], ['Reims', 49.2583, 4.0317],
    ['Toulon', 43.1242, 5.928], ['Saint-Etienne', 45.4397, 4.3872], ['Le Havre', 49.4944, 0.1079],
    ['Dijon', 47.322, 5.0415], ['Grenoble', 45.1885, 5.7245], ['Angers', 47.4784, -0.5632],
    ['Nimes', 43.8367, 4.3601], ['Villeurbanne', 45.7719, 4.8902], ['Clermont-Ferrand', 45.7772, 3.087],
    ['Le Mans', 48.0061, 0.1996], ['Aix-en-Provence', 43.5297, 5.4474], ['Brest', 48.3904, -4.4861],
    ['Tours', 47.3941, 0.6848],
];

// ── transport ─────────────────────────────────────────────────────────────────────────────────
function wfsUrl(layer, lat, lon, props) {
    const p = new URLSearchParams({
        SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
        TYPENAMES: layer, SRSNAME: 'EPSG:4326',
        CQL_FILTER: `INTERSECTS(the_geom,POINT(${lat} ${lon}))`,
        COUNT: '60', OUTPUTFORMAT: 'application/json', PROPERTYNAME: props.join(','),
    });
    return `${WFS}?${p.toString()}`;
}

// ⚠ A GLOBAL THROTTLE, ADDED AFTER THE SMOKE RUN MEASURED IT. Six-way concurrency drew HTTP 429
// from data.geopf.fr, and the harness dutifully recorded `inaccessible` for parcels whose data was
// in fact fully served — a self-inflicted coverage figure. That is the §CONTEXT-DATA-HONESTY trap
// arriving from the client side: OUR rate limit would have been published as FRANCE's gap.
let nextSlot = 0;
async function throttle(gapMs = 320) {
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + gapMs;
    if (at > now) await sleep(at - now);
}

/** → {status:'found'|'absent'|'transient', features, reason}. Availability never reads as absence. */
async function getFeatures(layer, lat, lon, props, attempts = 5) {
    const url = wfsUrl(layer, lat, lon, props);
    let last = '';
    for (let i = 0; i < attempts; i++) {
        await throttle();
        try {
            const ac = new AbortController();
            const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
            const r = await fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } });
            clearTimeout(t);
            if (r.status === 429) {
                // Back off hard and honestly: a 429 is OUR fault, never the dataset's.
                const ra = Number(r.headers.get('retry-after'));
                last = 'HTTP 429 (rate-limited)';
                await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2500 * (i + 1) * (i + 1));
                continue;
            }
            if (!r.ok) { last = `HTTP ${r.status}`; await sleep(900 * (i + 1)); continue; }
            const j = await r.json();
            const f = Array.isArray(j?.features) ? j.features : null;
            if (f === null) { last = 'shapeless body'; await sleep(600 * (i + 1)); continue; }
            return { status: f.length > 0 ? 'found' : 'absent', features: f, reason: null };
        } catch (e) {
            last = e?.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : String(e?.message ?? e);
            await sleep(600 * (i + 1));
        }
    }
    return { status: 'transient', features: [], reason: `${layer}: ${last}` };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the municipal-pack leg (move 3) ───────────────────────────────────────────────────────────
/**
 * Query ONE Paris opendata layer at a point. → {status:'found'|'absent'|'transient', row, reason}.
 * Availability never reads as absence here either: a severed opendata host must not be published as
 * "the pack carries nothing", which is the §CONTEXT-DATA-HONESTY trap arriving from the other side.
 */
async function odsQuery(layer, lat, lon, attempts = 4) {
    const where = layer.kind === 'within'
        ? `within_distance(geo_shape, geom'POINT(${lon} ${lat})', ${PARIS_FILET_RADIUS_M}m)`
        : `intersects(geo_shape, geom'POINT(${lon} ${lat})')`;
    const url = `${ODS}/${layer.ds}/records?${new URLSearchParams({ where, limit: '1', select: layer.select })}`;
    let last = '';
    for (let i = 0; i < attempts; i++) {
        await throttle();
        try {
            const ac = new AbortController();
            const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
            const r = await fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } });
            clearTimeout(t);
            if (r.status === 429) { last = 'HTTP 429'; await sleep(2500 * (i + 1) * (i + 1)); continue; }
            if (!r.ok) { last = `HTTP ${r.status}`; await sleep(900 * (i + 1)); continue; }
            const j = await r.json();
            const rows = Array.isArray(j?.results) ? j.results : null;
            if (rows === null) { last = 'shapeless body'; await sleep(600 * (i + 1)); continue; }
            return { status: rows.length > 0 ? 'found' : 'absent', row: rows[0] ?? null, reason: null };
        } catch (e) {
            last = e?.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : String(e?.message ?? e);
            await sleep(600 * (i + 1));
        }
    }
    return { status: 'transient', row: null, reason: `${layer.ds}: ${last}` };
}

/** A positive finite number, or null. `0` in these layers means "not specified", never zero metres. */
function posNum(raw) {
    const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The Paris municipal pack at a point — what `resolveParisPluZone.ts` would resolve, measured
 * against the SAME parameters the national chain was scored on. ⛔ It returns its OWN verdict per
 * parameter; the caller records both and never lets one overwrite the other.
 */
async function parisPackAt(lat, lon) {
    const layers = {};
    for (const l of PARIS_PACK_LAYERS) layers[l.ds] = await odsQuery(l, lat, lon);

    const transient = Object.entries(layers).filter(([, r]) => r.status === 'transient').map(([k]) => k);
    const hauteur = posNum(layers.plub_hauteur.row?.hauteur);
    const hmc = posNum(layers.plub_hmc.row?.ht_hmc);
    const hmcDatum = typeof layers.plub_hmc.row?.hmc === 'string' ? layers.plub_hmc.row.hmc.trim() || null : null;
    const emprise = posNum(layers.plub_ecm.row?.emprise);
    const ecmArea = posNum(layers.plub_ecm.row?.st_area_shape);
    const filet = layers.plub_filet.row ?? null;

    // ⚠ C2 counts as a pack recovery ONLY on `plub_hauteur`: it is the published height CEILING in
    // metres. `plub_hmc.ht_hmc` is a SEPARATE overlay whose `hmc` datum is often `NGF` — an absolute
    // altitude, not a height above ground — so it is recorded but never scored as the same answer
    // (that conflation is exactly the §DATUM-DECISION failure, in NGF clothing).
    // ⚠ C4 counts on the ECM POLYGON, not on `emprise`: the ECM strip IS the buildable footprint
    // (geometry, not a parcel×% guess) and `emprise=0` means "not specified".
    const params = {
        C2: hauteur !== null
            ? { status: 'resolved', value: hauteur, unit: 'm', from: 'plub_hauteur.hauteur (PLU-b art. UG.3.2.1, graphic annex)' }
            : { status: 'absent', from: layers.plub_hauteur.status },
        C4: ecmArea !== null
            ? { status: 'resolved', value: 'plub_ecm polygon', unit: null, emprisePct: emprise, areaM2: ecmArea, from: 'plub_ecm (emprise constructible maximale, drawn)' }
            : { status: 'absent', from: layers.plub_ecm.status },
        C6: filet !== null
            ? { status: 'partial', value: filet.haut ?? null, cour: filet.cour ?? null, from: `plub_filet within ${PARIS_FILET_RADIUS_M} m (gabarit-enveloppe frontage marking)` }
            : { status: 'absent', from: layers.plub_filet.status },
    };
    return {
        pack: 'paris-plu-bioclimatique',
        transient,
        params,
        extras: { hmc_m: hmc, hmc_datum: hmcDatum, eal: layers.plub_eal.status === 'found' },
    };
}

// ── value extraction from a CNIG libelle/txt ──────────────────────────────────────────────────
// A prescription's number, when it is published at all, lives in the free-text LIBELLE — the CNIG
// schema mandates no universal numeric field (FR-FOUNDER §4). This is the SAME class of parser the
// shipped `parseFrHeightLibelle` runs; here it only has to answer "is a number recoverable", not
// "what does it mean".
const NUM = /(\d+(?:[.,]\d+)?)\s*(m\b|mètres?|metres?|%|niveaux?|étages?|niv\b)/i;
function numericFrom(...texts) {
    for (const t of texts) {
        if (typeof t !== 'string' || t.length === 0) continue;
        const m = NUM.exec(t);
        if (m) return { value: parseFloat(m[1].replace(',', '.')), unit: m[2].toLowerCase(), from: t };
    }
    return null;
}

// ── the field trace ───────────────────────────────────────────────────────────────────────────
// One row per (parcel, envelope field). `status` uses the shipped RuleState vocabulary;
// `failure` uses the founder's six labels VERBATIM.
function state(rule, reachability, status, extra) {
    return { rule, reachability, status, ...extra };
}

/** CNIG families: which TYPEPSC carries which envelope parameter (FR-FOUNDER §2, verbatim). */
const FAMILY = {
    C2: { type: '39', name: 'hauteur' },
    C4: { type: '38', name: 'emprise au sol' },
    C6: { type: '40', name: 'volumétrie' },
};

function classifyFamily(ruleKey, prescriptions, docReachable) {
    const fam = FAMILY[ruleKey];
    const hits = prescriptions.filter((p) => p.typepsc === fam.type);
    if (hits.length === 0) {
        // No drawn mechanism for this parameter. The rule is almost certainly in the règlement
        // text — so the mechanism is UNKNOWN (we never opened the document), not ABSENT (F1
        // requires having READ the plan and found no mechanism). Conflating them would inflate
        // the gap count with parcels whose document we simply did not parse.
        return state(ruleKey, 'extractable', 'unrecovered', {
            failure: docReachable ? 'pdf' : 'missing-source',
            mechanism: 'unknown',
            stoppedAt: docReachable ? 'règlement document (not parsed)' : 'no règlement reference served',
        });
    }
    // .97 = qualitative, .98 = alternative, .02 = a maximum. The subtypes the audit flagged as
    // "not typed anywhere in FR code" (FR-DATA-GAP-AUDIT §1.5 / §2g-ii).
    const qual = hits.find((p) => p.stypepsc === '97');
    if (qual) {
        return state(ruleKey, 'interpretive', 'qualitative', {
            text: qual.libelle || qual.txt || `${fam.name} qualitative`,
            cnig: `${fam.type}.97`,
        });
    }
    const alt = hits.find((p) => p.stypepsc === '98');
    if (alt) {
        return state(ruleKey, 'extractable', 'alternative', { cnig: `${fam.type}.98`, text: alt.libelle || alt.txt });
    }
    const max = hits.find((p) => p.stypepsc === '02') ?? hits[0];
    const n = numericFrom(max.libelle, max.txt, max.lib_idpsc);
    if (n) {
        return state(ruleKey, 'source-complete', 'resolved', {
            value: n.value, unit: n.unit, cnig: `${fam.type}.${max.stypepsc ?? '??'}`, from: n.from,
        });
    }
    // The mechanism IS drawn — we have the polygon and the code — and the NUMBER is not in it.
    // Mechanism PRESENT: this is a pure extraction failure, not a gap in the plan.
    return state(ruleKey, 'extractable', 'unrecovered', {
        failure: docReachable ? 'pdf' : 'missing-source',
        mechanism: 'present',
        cnig: `${fam.type}.${max.stypepsc ?? '??'}`,
        stoppedAt: `drawn ${fam.type}.${max.stypepsc ?? '??'} with no numeric libelle`,
    });
}

async function traceParcel(id, stratum, lat, lon, label) {
    const out = { id, stratum, label, lat, lon, states: [], notes: [] };

    const mun = await getFeatures('wfs_du:municipality', lat, lon, ['insee', 'name', 'is_rnu']);
    if (mun.status === 'transient') { out.skip = `municipality ${mun.reason}`; return out; }
    if (mun.status === 'absent') { out.skip = 'off-land (no commune served)'; return out; }
    const m = mun.features[0].properties;
    out.commune = { insee: m.insee, name: m.name, is_rnu: m.is_rnu === true || m.is_rnu === 'true' };

    // SERIAL, not Promise.all — see the throttle note above.
    // ⚠ ROUND 2 adds `nature` and `datappro` to the PROPERTYNAME lists. Both were VERIFIED present
    // on the live layers before being requested (probe 2026-09-04: `prescription_surf` publishes
    // gid,…,stypepsc,idpsc,lib_idpsc,**nature**,symbole; `zone_urba` publishes …,**datappro**,…).
    // Requesting a field a layer does not have is how a working query silently starts erroring.
    const doc = await getFeatures('wfs_du:document', lat, lon, ['du_type', 'partition', 'name']);
    const zone = await getFeatures('wfs_du:zone_urba', lat, lon,
        ['libelle', 'typezone', 'idurba', 'nomfic', 'urlfic', 'partition', 'datappro']);
    const psurf = await getFeatures('wfs_du:prescription_surf', lat, lon,
        ['typepsc', 'stypepsc', 'nature', 'libelle', 'txt', 'nomfic', 'urlfic', 'idurba', 'lib_idpsc', 'datvalid', 'datappro']);
    const plin = await getFeatures('wfs_du:prescription_lin', lat, lon,
        ['typepsc', 'stypepsc', 'nature', 'libelle', 'txt', 'nomfic', 'urlfic', 'idurba', 'lib_idpsc', 'datappro']);
    for (const [n, r] of [['document', doc], ['zone_urba', zone], ['prescription_surf', psurf], ['prescription_lin', plin]]) {
        if (r.status === 'transient') out.notes.push(`transient ${n}: ${r.reason}`);
    }

    const prescriptions = [...psurf.features, ...plin.features].map((f) => f.properties);
    out.prescriptionCodes = [...new Set(prescriptions.map((p) => `${p.typepsc}.${p.stypepsc ?? '--'}`))].sort();

    // ── M2 · the GPU-only TXT ceiling — the PAYLOAD is persisted, not just the code ────────────
    // ⛔ Round 1 kept only `prescriptionCodes` and therefore could not answer "what is the ceiling",
    // only "what did we recover". A claim about a ceiling that cannot be recomputed from the record
    // is an assertion, so the record now carries every field the claim is built from.
    out.prescriptions = prescriptions.map((p) => ({
        typepsc: p.typepsc ?? null,
        stypepsc: p.stypepsc ?? null,
        nature: p.nature ?? null,
        // The CNIG composite key TYPEPSC-STYPEPSC[-NATURE] = SRU niveau 1 `idPrescription`
        // (review §1 item 2). Pair-shaped where the document published no NATURE — a v2017
        // vintage signal, never a guessed third segment.
        idPrescription: [p.typepsc ?? '??', p.stypepsc ?? '00', (p.nature ?? '').trim() || null]
            .filter((s) => s !== null).join('-'),
        libelle: p.libelle ?? null,
        txt: p.txt ?? null,
        lib_idpsc: p.lib_idpsc ?? null,
        nomfic: p.nomfic ?? null,
        urlfic: p.urlfic ?? null,
        datappro: p.datappro ?? null,
        // The three facts the ceiling is computed from, resolved once here so the report and any
        // later re-read agree by construction rather than by two people writing the same filter.
        hasText: [p.libelle, p.txt, p.lib_idpsc].some((s) => typeof s === 'string' && s.trim() !== ''),
        hasNumber: numericFrom(p.libelle, p.txt, p.lib_idpsc) !== null,
        envelopeFamily: ['14', '15', '38', '39', '40'].includes(String(p.typepsc)) ? String(p.typepsc) : null,
    }));
    // §11 · VINTAGE. `datappro` (date d'approbation) from whichever layer served one, plus whether
    // ANY prescription carried a NATURE — the 2.1.0-vs-2017 discriminator, observed rather than
    // inferred from the date alone.
    out.vintage = {
        datappro: zone.features[0]?.properties?.datappro
            ?? prescriptions.find((p) => p.datappro)?.datappro ?? null,
        anyNature: prescriptions.some((p) => typeof p.nature === 'string' && p.nature.trim() !== ''),
    };

    const z = zone.features[0]?.properties ?? null;
    const d = doc.features[0]?.properties ?? null;
    const nomfic = z?.nomfic || prescriptions.find((p) => p.nomfic)?.nomfic || null;
    const urlfic = z?.urlfic || prescriptions.find((p) => p.urlfic)?.urlfic || null;
    const docReachable = Boolean(nomfic || urlfic);
    out.reglement = { nomfic, urlfic, isXml: /\.xml$/i.test(nomfic ?? '') || /\.xml($|\?)/i.test(urlfic ?? '') };
    out.duType = d?.du_type ?? null;

    // ── A1 parcel: national cadastre, source-complete everywhere the cadastre covers ──────────
    // Not re-probed per parcel: the shipped `ign-fr` provider is live-proven and every point in
    // this frame is inside a served commune. Counting it as recovered without measuring it would
    // be exactly the over-claim this audit exists to avoid, so it is EXCLUDED from the
    // denominator instead of assumed — see the report's method note.

    // ── B1 governing instrument ────────────────────────────────────────────────────────────────
    if (d?.du_type) {
        out.states.push(state('B1', 'source-complete', 'resolved',
            { value: d.du_type, unit: null, from: `document.partition=${d.partition}` }));
    } else if (out.commune.is_rnu) {
        out.states.push(state('B1', 'source-complete', 'resolved',
            { value: 'RNU', unit: null, from: 'municipality.is_rnu=true' }));
    } else {
        out.states.push(state('B1', 'extractable', 'unrecovered',
            { failure: 'missing-source', mechanism: 'unknown', stoppedAt: 'gpu/document served nothing' }));
    }

    // ── the RNU hard boundary (founder §8) ────────────────────────────────────────────────────
    if (out.commune.is_rnu) {
        out.states.push(state('B5', 'undeterminable', 'refused', {
            basis: 'requires-determination',
            reason: 'RNU commune: parties actuellement urbanisées (PAU) membership is not published at parcel level.',
        }));
        for (const k of ['C2', 'C4', 'C5', 'C6', 'D1']) {
            out.states.push(state(k, 'undeterminable', 'refused', {
                basis: 'requires-determination',
                reason: 'Under RNU the constructibility of the parcel turns on the PAU determination, which no dataset settles.',
            }));
        }
        out.states.push(state('B2', 'undeterminable', 'refused', {
            basis: 'rule-not-applicable', reason: 'RNU: there is no zoning instrument, so no zone code has a subject here.',
        }));
        out.states.push(state('A2', 'undeterminable', 'refused', {
            basis: 'rule-not-applicable', reason: 'No height rule applies, so no datum has a subject.',
        }));
        return out;
    }

    // ── B2 zone code ───────────────────────────────────────────────────────────────────────────
    if (z?.libelle) {
        out.states.push(state('B2', 'source-complete', 'resolved',
            { value: z.libelle, unit: null, from: `zone_urba typezone=${z.typezone} idurba=${z.idurba}` }));
    } else if (zone.status === 'transient') {
        out.states.push(state('B2', 'source-complete', 'unrecovered',
            { failure: 'inaccessible', mechanism: 'unknown', stoppedAt: 'zone_urba transport failed after retries' }));
    } else {
        out.states.push(state('B2', 'extractable', 'unrecovered',
            { failure: 'missing-source', mechanism: 'absent', stoppedAt: 'zone_urba served no feature at this point' }));
    }

    // ── C2 / C4 / C6 via the CNIG decision tree ────────────────────────────────────────────────
    const c2 = classifyFamily('C2', prescriptions, docReachable);
    out.states.push(c2, classifyFamily('C4', prescriptions, docReachable), classifyFamily('C6', prescriptions, docReachable));

    // ── C4 upgrade: a plan-masse sector (14) is the buildable footprint, DRAWN ────────────────
    if (prescriptions.some((p) => p.typepsc === '14')) {
        out.states.push(state('C4', 'source-complete', 'resolved',
            { value: 'plan-masse polygon', unit: null, cnig: '14', from: 'drawn secteur de plan de masse (R151-40)', supersedes: true }));
    }

    // ── C5 setbacks: 15.01/.02/.03 — a marge de recul is DRAWN GEOMETRY, i.e. the answer ──────
    const setbacks = prescriptions.filter((p) => p.typepsc === '15');
    if (setbacks.length > 0) {
        const n = numericFrom(...setbacks.map((s) => s.libelle), ...setbacks.map((s) => s.txt));
        out.states.push(state('C5', 'source-complete', 'resolved', {
            value: n ? n.value : 'drawn setback line', unit: n ? n.unit : null,
            cnig: [...new Set(setbacks.map((s) => `15.${s.stypepsc ?? '--'}`))].join('+'),
            from: 'drawn marge de recul (R151-39) — the line IS the constraint',
        }));
    } else {
        out.states.push(state('C5', 'extractable', 'unrecovered', {
            failure: docReachable ? 'pdf' : 'missing-source', mechanism: 'unknown',
            stoppedAt: docReachable ? 'retraits in règlement text (not parsed)' : 'no règlement reference served',
        }));
    }

    // ── D1 floor-area quantum — the CORRECTED row. COS is dead; surface de plancher is not ────
    // There is NO CNIG prescription code for an SDP floor-area limit, so it is text-bound by
    // construction. It is `extractable`, never absent from the vocabulary (FR-FOUNDER §6).
    out.states.push(state('D1', 'extractable', 'unrecovered', {
        failure: docReachable ? 'pdf' : 'missing-source', mechanism: 'unknown',
        stoppedAt: docReachable ? `règlement ${nomfic ?? urlfic} (SDP rule, not parsed)` : 'no règlement reference served',
    }));

    // ── A2 height datum — terrain is 🟢, the DATUM is in the rule 🟡 (founder §5.2) ────────────
    const heightApplies = c2.status !== 'unrecovered' || c2.mechanism === 'present' || docReachable;
    if (!heightApplies) {
        out.states.push(state('A2', 'undeterminable', 'refused',
            { basis: 'rule-not-applicable', reason: 'No height rule is reachable here, so no datum has a subject.' }));
    } else {
        out.states.push(state('A2', 'interpretive', 'unrecovered', {
            failure: 'semantic', mechanism: 'present',
            stoppedAt: 'terrain naturel / après travaux / niveau de la voie / égout / acrotère / faîtage — the datum is defined in the règlement text, not in any dataset',
        }));
    }

    // ── M3 · the SOURCE-TIER comparison — the municipal pack, beside the national chain ────────
    // ⛔ RECORDED, NEVER MERGED. `out.states` stays exactly what the NATIONAL GPU chain produced,
    // so the 23.7 % / 3.0 % headline remains the same measurement it was in round 1; the pack's
    // verdict lands in `out.pack` and the delta is computed in the report. Merging them would
    // answer a different question and destroy the comparison this run exists to make.
    if (isInParis(lat, lon)) out.pack = await parisPackAt(lat, lon);

    return out;
}

// ── sampling ──────────────────────────────────────────────────────────────────────────────────
function areaRandomPoints(n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        pts.push([
            BBOX.latMin + rnd() * (BBOX.latMax - BBOX.latMin),
            BBOX.lonMin + rnd() * (BBOX.lonMax - BBOX.lonMin),
        ]);
    }
    return pts;
}

function urbanPoints(perCity) {
    const pts = [];
    for (const [name, lat, lon] of CITIES) {
        for (let k = 0; k < perCity; k++) {
            // ±0.012° ≈ ±1.3 km — inside the commune, off the exact centroid.
            pts.push([lat + (rnd() - 0.5) * 0.024, lon + (rnd() - 0.5) * 0.034, name]);
        }
    }
    return pts;
}

/**
 * STRATUM C (round 2) — points inside PARIS, for the source-tier comparison. Two Paris parcels fell
 * out of stratum B, which is not an n anybody should quote for a build-order decision, so the pack
 * question gets its own sample.
 *
 * ⚠ The box is INSIDE the périphérique (48.815–48.902 N, 2.255–2.415 E), so a draw is a Paris draw;
 * the audit still RECORDS the commune the authority returns, so any point that is not in 75056 is
 * visible in the output rather than silently counted as Paris.
 * ⛔ Drawn AFTER strata A and B so the `rnd` stream reaching them is untouched (see the header).
 */
function parisPoints(n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        pts.push([48.815 + rnd() * (48.902 - 48.815), 2.255 + rnd() * (2.415 - 2.255), 'Paris']);
    }
    return pts;
}

async function pool(items, size, fn) {
    const out = [];
    let i = 0;
    await Promise.all(Array.from({ length: size }, async () => {
        while (i < items.length) {
            const k = i++;
            out[k] = await fn(items[k], k);
            if (k % 10 === 0) process.stderr.write(`  …${k + 1}/${items.length}\n`);
        }
    }));
    return out;
}

async function main() {
    const wantA = Number(process.env.WANT_A ?? 50), wantB = Number(process.env.WANT_B ?? 50);
    // Over-draw the area-random stratum: most random points over the bbox land in the sea or
    // outside France, and the rejection is the AUTHORITY's (no commune served), not ours.
    const candidatesA = areaRandomPoints(Math.max(24, wantA * 7));
    const candidatesB = urbanPoints(Math.max(1, Math.ceil(wantB / CITIES.length)));

    process.stderr.write(`Stratum B (urban, n=${candidatesB.length})…\n`);
    const rawB = await pool(candidatesB, 2, ([lat, lon, name], k) => traceParcel(`B${k}`, 'urban', lat, lon, name));

    process.stderr.write(`Stratum A (area-random, over-drawn ${candidatesA.length} for ${wantA})…\n`);
    const rawA = [];
    let ai = 0;
    while (rawA.filter((r) => !r.skip).length < wantA && ai < candidatesA.length) {
        const batch = candidatesA.slice(ai, ai + 14);
        const res = await pool(batch, 2, ([lat, lon], k) => traceParcel(`A${ai + k}`, 'area-random', lat, lon, null));
        rawA.push(...res);
        ai += 14;
    }

    const parcels = [
        ...rawA.filter((r) => !r.skip).slice(0, wantA),
        ...rawB.filter((r) => !r.skip).slice(0, wantB),
    ];

    // ── STRATUM C · Paris, for the pack-vs-national comparison (move 3) ───────────────────────
    // ⛔ NOT part of the 100. It is reported separately and is NEVER folded into the 23.7 % / 3.0 %
    // headline: a Paris-weighted sample would inflate a national figure, which is the whole reason
    // the strata are kept apart in the first place.
    const wantC = Number(process.env.WANT_C ?? 25);
    let parisParcels = [];
    if (wantC > 0) {
        const candidatesC = parisPoints(wantC);
        process.stderr.write(`Stratum C (Paris source-tier, n=${candidatesC.length})…\n`);
        const rawC = await pool(candidatesC, 2, ([lat, lon, name], k) => traceParcel(`C${k}`, 'paris-pack', lat, lon, name));
        parisParcels = rawC.filter((r) => !r.skip);
    }

    const rejected = {
        areaRandomOffLand: rawA.filter((r) => r.skip).length,
        urbanSkipped: rawB.filter((r) => r.skip).length,
        parisSkipped: wantC - parisParcels.length,
    };

    writeFileSync(process.argv[2] ?? 'fr-audit-raw.json',
        JSON.stringify({ seed: SEED, runAtIso: new Date().toISOString(), round: 2, rejected, parcels, parisParcels }, null, 1));
    process.stderr.write(`\nDONE — ${parcels.length} parcels traced (A ${parcels.filter(p=>p.stratum==='area-random').length} / B ${parcels.filter(p=>p.stratum==='urban').length}), ${rejected.areaRandomOffLand} off-land rejects, stratum C ${parisParcels.length}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
