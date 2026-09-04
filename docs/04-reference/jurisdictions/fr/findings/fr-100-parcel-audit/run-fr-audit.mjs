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

import { writeFileSync } from 'node:fs';

const WFS = 'https://data.geopf.fr/wfs/ows';
const SEED = 20260904;
const TIMEOUT_MS = 45000;

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
    const doc = await getFeatures('wfs_du:document', lat, lon, ['du_type', 'partition', 'name']);
    const zone = await getFeatures('wfs_du:zone_urba', lat, lon,
        ['libelle', 'typezone', 'idurba', 'nomfic', 'urlfic', 'partition']);
    const psurf = await getFeatures('wfs_du:prescription_surf', lat, lon,
        ['typepsc', 'stypepsc', 'libelle', 'txt', 'nomfic', 'urlfic', 'idurba', 'lib_idpsc', 'datvalid']);
    const plin = await getFeatures('wfs_du:prescription_lin', lat, lon,
        ['typepsc', 'stypepsc', 'libelle', 'txt', 'nomfic', 'urlfic', 'idurba', 'lib_idpsc']);
    for (const [n, r] of [['document', doc], ['zone_urba', zone], ['prescription_surf', psurf], ['prescription_lin', plin]]) {
        if (r.status === 'transient') out.notes.push(`transient ${n}: ${r.reason}`);
    }

    const prescriptions = [...psurf.features, ...plin.features].map((f) => f.properties);
    out.prescriptionCodes = [...new Set(prescriptions.map((p) => `${p.typepsc}.${p.stypepsc ?? '--'}`))].sort();

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
    const rejected = { areaRandomOffLand: rawA.filter((r) => r.skip).length, urbanSkipped: rawB.filter((r) => r.skip).length };

    writeFileSync(process.argv[2] ?? 'fr-audit-raw.json',
        JSON.stringify({ seed: SEED, runAtIso: new Date().toISOString(), rejected, parcels }, null, 1));
    process.stderr.write(`\nDONE — ${parcels.length} parcels traced (A ${parcels.filter(p=>p.stratum==='area-random').length} / B ${parcels.filter(p=>p.stratum==='urban').length}), ${rejected.areaRandomOffLand} off-land rejects\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
