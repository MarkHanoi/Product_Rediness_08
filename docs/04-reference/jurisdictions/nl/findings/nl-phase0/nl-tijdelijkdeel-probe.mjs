#!/usr/bin/env node
// NL — TIJDELIJK-DEEL / VOORRANG PROBE (lane ENVELOPE-NLDK, round 4, 2026-09-04).
//
// THE QUESTION. Founder review §11, marked `not-verified` by the founder himself:
//   "Is the tijdelijk deel served through Ozon/Presenteren, or only through ruimtelijkeplannen.nl?
//    If the DSO serves the consolidated regeling including the tijdelijk deel, moves 1 and 2 COLLAPSE
//    into one integration and the whole plan gets cheaper."
//
// WHY THIS CAN BE ANSWERED WITHOUT A KEY. The round-3 surface probe established that every DSO data
// plane answers 401 without an `x-api-key`, while every OpenAPI DESCRIPTION is served anonymously
// (Presenteren v8 → 200, 273 KB). It then COUNTED keywords: `tijdelijkDeelVan` 2, `tijdelijkDelen` 1,
// `iMROPlanidentificatie` 1, `voorrang` 33. ⚠ A COUNT IS NOT AN ANSWER — a word can appear in a
// deprecation notice. This probe EXTRACTS the schema objects those words live in, VERBATIM, so the
// verdict is quoted from the source rather than written by the person who wants the verdict
// (the lane rule the 10× `peil` error bought).
//
// WHAT IT DOES NOT ESTABLISH. A spec describes the CONTRACT, not the CONTENTS. That every regeling
// carries a `tijdelijkDelen` array does NOT prove any given gemeente's tijdelijk deel is populated,
// nor that its rule text is retrievable in full. That needs a key and a run — recorded as such.
//
// USAGE: node nl-tijdelijkdeel-probe.mjs > nl-tijdelijkdeel-probe.json 2> nl-tijdelijkdeel-probe.log.txt
const SPECS = [
    { id: 'presenteren-v8', url: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8/openapi.json' },
    { id: 'toepasbaar-opvragen-v7', url: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/toepasbaaropvragen/v7/openapi.json' },
    { id: 'ontsluiten-v2', url: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsinformatie/api/ontsluiten/v2/openapi.json' },
];
// The terms that decide the question. Each is a FIELD or SCHEMA name expected in IMOW, not a guess at
// prose: they were observed by the round-3 count, and this run recovers their definitions.
const TERMS = ['tijdelijkDeelVan', 'tijdelijkDelen', 'TijdelijkDeel', 'iMROPlanidentificatie', 'voorrang', 'Voorrang', 'regelingtype', 'RegelingType', 'ontwerp', 'activiteit', 'Locatie'];

async function get(url, accept = 'application/json', headers = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 60000);
    try {
        const r = await fetch(url, { signal: ctl.signal, headers: { Accept: accept, ...headers } });
        const body = await r.text();
        clearTimeout(t);
        return { status: r.status, contentType: r.headers.get('content-type'), bytes: body.length, body };
    } catch (e) {
        clearTimeout(t);
        return { status: null, error: e.name === 'AbortError' ? 'timeout' : e.message, body: '' };
    }
}

/** Every schema component whose NAME or whose property names mention `term`, quoted whole (capped). */
function schemasMentioning(spec, term) {
    const comps = spec?.components?.schemas ?? {};
    const out = [];
    for (const [name, def] of Object.entries(comps)) {
        const hitName = name.toLowerCase().includes(term.toLowerCase());
        const props = def && typeof def === 'object' ? def.properties ?? {} : {};
        const hitProps = Object.keys(props).filter((p) => p.toLowerCase().includes(term.toLowerCase()));
        if (!hitName && hitProps.length === 0) continue;
        out.push({
            schema: name,
            matchedBy: hitName ? 'schema-name' : 'property-name',
            matchedProperties: hitProps,
            // VERBATIM, truncated only in length — never paraphrased.
            definition: JSON.stringify(def).slice(0, 2600),
        });
    }
    return out;
}

const out = { generatedAt: new Date().toISOString(), lane: 'ENVELOPE-NLDK round 4', question: 'founder review §11: is the tijdelijk deel served through Ozon/Presenteren?', dsoApiKeyPresent: Boolean(process.env.DSO_API_KEY), specs: [], dataPlane: [], verdictInputs: {} };

for (const s of SPECS) {
    const r = await get(s.url);
    const rec = { id: s.id, url: s.url, status: r.status, bytes: r.bytes, contentType: r.contentType };
    if (r.status === 200) {
        let spec = null;
        try { spec = JSON.parse(r.body); } catch (e) { rec.parseError = String(e); }
        if (spec) {
            rec.title = spec.info?.title ?? null;
            rec.version = spec.info?.version ?? null;
            rec.schemaCount = Object.keys(spec.components?.schemas ?? {}).length;
            rec.terms = {};
            for (const t of TERMS) rec.terms[t] = schemasMentioning(spec, t);
            // The parameters of the search endpoints — what a caller may filter a regeling by.
            const zoek = {};
            for (const [p, ops] of Object.entries(spec.paths ?? {})) {
                if (!p.includes('_zoek') && !p.endsWith('/regelingen')) continue;
                const post = ops.post ?? ops.get ?? null;
                if (!post) continue;
                zoek[p] = {
                    summary: post.summary ?? null,
                    parameters: (post.parameters ?? []).map((q) => q.name ?? q.$ref ?? null),
                    requestBodySchemaRef: post.requestBody?.content?.['application/json']?.schema?.$ref ?? null,
                };
            }
            rec.searchEndpoints = zoek;
        }
    }
    out.specs.push(rec);
    console.error(`${s.id}: spec ${r.status}${r.bytes ? ' ' + r.bytes + ' B' : ''}${r.error ? ' ' + r.error : ''}`);
}

// The data plane, anonymously — records the wall, does not pretend to pass it.
const DATA = [
    { id: 'presenteren-regelingen', url: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8/regelingen?page=1&size=1' },
    { id: 'toepasbaar-locaties-zoek', url: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/toepasbaaropvragen/v7/locaties/_zoek' },
    { id: 'rp-opvragen-plannen', url: 'https://ruimte.omgevingswet.overheid.nl/ruimtelijke-plannen/api/opvragen/v4/plannen?pageSize=1' },
];
for (const d of DATA) {
    const r = await get(d.url, 'application/hal+json');
    out.dataPlane.push({ id: d.id, url: d.url, status: r.status, contentType: r.contentType, bodyHead: r.body.slice(0, 300), error: r.error ?? null });
    console.error(`${d.id}: data ${r.status}`);
}

// ── RAW-TEXT CONTEXT for the words that appear in PROSE rather than as fields ────────────────────
// `voorrang` was counted 33 times in round 3 yet lives in ZERO schema or property names. A count with
// no location is not evidence, so the surrounding sentences are quoted VERBATIM here and the reader
// decides what the API models. Same for IMRO, which decides whether a tijdelijk deel still points at
// a ruimtelijkeplannen.nl plan id.
const CONTEXT_TERMS = ['voorrang', 'IMRO', 'tijdelijk', 'Tijdelijk'];
for (const s of SPECS) {
    const r = await get(s.url);
    if (r.status !== 200) continue;
    const rec = out.specs.find((x) => x.id === s.id);
    if (!rec) continue;
    rec.rawContext = {};
    for (const term of CONTEXT_TERMS) {
        const hits = [];
        let i = r.body.indexOf(term);
        while (i !== -1 && hits.length < 40) {
            hits.push(r.body.slice(Math.max(0, i - 260), i + 260));
            i = r.body.indexOf(term, i + 1);
        }
        rec.rawContext[term] = { count: (r.body.match(new RegExp(term, 'g')) || []).length, quotes: hits };
    }
}

const pres = out.specs.find((s) => s.id === 'presenteren-v8');
out.verdictInputs = {
    presenterenServesTijdelijkDeel: pres?.terms?.tijdelijkDelen?.length > 0 || pres?.terms?.tijdelijkDeelVan?.length > 0,
    presenterenCarriesImroIdentifier: (pres?.terms?.iMROPlanidentificatie?.length ?? 0) > 0,
    presenterenModelsVoorrang: (pres?.terms?.voorrang?.length ?? 0) + (pres?.terms?.Voorrang?.length ?? 0) > 0,
};
console.error('verdictInputs ' + JSON.stringify(out.verdictInputs));
process.stdout.write(JSON.stringify(out, null, 2));
