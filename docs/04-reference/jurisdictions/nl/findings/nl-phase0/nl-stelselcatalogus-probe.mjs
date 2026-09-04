#!/usr/bin/env node
// NL — STELSELCATALOGUS TERM PROBE (lane ENVELOPE-NLDK, round 3, 2026-09-04). Founder review §3:
// "Check the Stelselcatalogus … it gives the canonical spellings and the national reference set to
// normalise against, which is exactly what the inflection bug was about."
//
// THE SURFACE. The key-gated `Catalogus opvragen v3` (service.omgevingswet.overheid.nl/publiek/
// catalogus/api/opvragen/v3, x-api-key, HTTP 401 anonymously) is the register's API. But the
// catalogue WEBSITE serves a keyless HAL API — `stelselcatalogus.omgevingswet.overheid.nl/api/
// concepten?zoekTerm=…` with `Accept: application/hal+json` (application/json → HTTP 406; the
// parameter is camelCase `zoekTerm`, lowercase → 400). Its own spec is at `/api/` (text/yaml,
// "Catalogus website API 1.3.0"). Both facts were established by probing, not by reading.
//
// WHAT THIS RECORDS, VERBATIM. For each envelope-relevant Dutch term: every concept the catalogue
// returns for the search term, with `term`, `naam`, `definitie` (verbatim), `uri`, `conceptschema`
// and `begindatumGeldigheid`. Nothing is paraphrased; a consumer that wants the canonical spelling
// reads `naam`, and one that wants the national definition reads `definitie`. Exact-match hits are
// flagged so the reducer can separate "the national term" from "terms that merely contain it".
//
// USAGE: node nl-stelselcatalogus-probe.mjs > nl-stelselcatalogus-probe.json
const BASE = 'https://stelselcatalogus.omgevingswet.overheid.nl/api/concepten';
const TERMS = [
    'peil', 'straatpeil', 'maaiveld', 'bouwhoogte', 'goothoogte', 'nokhoogte', 'daknok', 'dakvoet',
    'bouwlaag', 'dakhelling', 'achtererfgebied', 'bebouwingsgebied', 'voorerfgebied', 'hoofdgebouw',
    'oorspronkelijk hoofdgebouw', 'bijbehorend bouwwerk', 'openbaar toegankelijk gebied', 'erf', 'gebouwerf',
    'bouwvlak', 'bouwperceel', 'bebouwingspercentage', 'bouwwerk', 'gebouw', 'omgevingsplanactiviteit',
    'bouwactiviteit', 'voorgevelrooilijn', 'perceelsgrens',
];

async function getAll(term) {
    const items = [];
    let url = BASE + '?zoekTerm=' + encodeURIComponent(term) + '&pageSize=50';
    let pages = 0;
    let lastStatus = null;
    while (url && pages < 4) {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 40000);
        try {
            const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/hal+json' } });
            clearTimeout(t);
            lastStatus = r.status;
            if (!r.ok) return { status: r.status, items };
            const j = await r.json();
            for (const c of j._embedded?.concepten ?? []) items.push(c);
            url = j._links?.next?.href ?? null;
            pages++;
        } catch (e) {
            clearTimeout(t);
            return { status: lastStatus, error: e.name === 'AbortError' ? 'timeout' : e.message, items };
        }
    }
    return { status: lastStatus, items, pages };
}

const out = { generatedAt: new Date().toISOString(), lane: 'ENVELOPE-NLDK round 3', source: BASE + '?zoekTerm=<term>&pageSize=50  (Accept: application/hal+json; KEYLESS)', specUrl: 'https://stelselcatalogus.omgevingswet.overheid.nl/api/ (text/yaml, Catalogus website API 1.3.0)', keyGatedSibling: 'https://service.omgevingswet.overheid.nl/publiek/catalogus/api/opvragen/v3 (x-api-key; anonymous 401)', terms: [] };
for (const term of TERMS) {
    const res = await getAll(term);
    const concepts = res.items.map((c) => ({
        term: c.term ?? null,
        naam: c.naam ?? null,
        definitie: c.definitie ?? null,
        uri: c.uri ?? null,
        conceptschema: c.conceptschema?.naam ?? null,
        eigenaar: c.eigenaar ?? null,
        begindatumGeldigheid: c.begindatumGeldigheid ?? null,
        exactMatch: String(c.naam ?? c.term ?? '').toLowerCase() === term.toLowerCase(),
    }));
    out.terms.push({ term, status: res.status, error: res.error ?? null, count: concepts.length, exactMatches: concepts.filter((c) => c.exactMatch).length, concepts });
    process.stderr.write(term + ': ' + (res.status ?? res.error) + ' | ' + concepts.length + ' concepts | exact ' + concepts.filter((c) => c.exactMatch).length + '\n');
    await new Promise((r) => setTimeout(r, 250));
}
process.stdout.write(JSON.stringify(out, null, 1));
