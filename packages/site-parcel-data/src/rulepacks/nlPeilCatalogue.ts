// §NL-PEIL-CATALOGUE (lane ENVELOPE-NLDK, round 3, 2026-09-04) — the per-plan `peil` question as a
// CLASSIFICATION over a CLOSED SET, attacked via the begripsbepalingen, normalised against the national
// catalogue. Founder review §3 (move 6): *"Treat the 17 definitions as a CLOSED ENUM, not free text …
// Attack via begripsbepalingen … Check the Stelselcatalogus … Target the resolvable share, not 100 %."*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE CATALOGUE — every distinct peil definition the seed-20260903 sample produced, QUOTED
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `nl-phase0-plantext.json`: 66 plan texts parsed, 20 carried an extractable peil begripsbepaling. The
// completion doc counted **17 distinct** on the raw captures; after trimming each capture at the NEXT
// begrip heading (see §2 — the probe stopped only at CAPITAL-initial headings, so six captures ran into
// "1.100 permanente bewoning …") the set is **18 distinct definitions over 20 plans**: #4 is shared by
// two plans (0310 and 1701), #7 by two (0606 ×2). The 17 was a dedupe over untrimmed text; 18 is the
// count over the definitions themselves. Both are recorded; neither is "the" figure without its rule.
//
// Every `verbatim` below is the trimmed capture, character for character (typographic quotes kept). None
// was written by the author of the regexes that classify it — that is the lane rule the founder asked to
// generalise (§3: *"fixture quoted from the sample rather than written by the regex's own author"*).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE EXTRACTOR — begripsbepalingen are structurally separable
// ══════════════════════════════════════════════════════════════════════════════════════════════
// IMROPT2012 plan text numbers its begrippen `1.NN <term>` (occasionally `2.NN`). The table of contents
// repeats the headings, so a capture that runs straight into another numbered heading within 40 chars
// is a TOC row and is dropped. The capture ends at the next begrip heading — whichever case its first
// letter has, which is the probe's defect fixed here — or at the next `Artikel N`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE NATIONAL REFERENCE — what the Stelselcatalogus actually holds (probed, keyless, 2026-09-04)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `peil` is NOT a national begrip: 45 hits for the search term, ZERO exact matches. `straatpeil` IS
// (conceptschema Regelgeving, geldig vanaf 2020-10-28) — and its definition is, word for word, branches
// a and b of the commonest Dutch plan article (hoofdtoegang direct aan de weg → hoogte van de weg; anders
// → hoogte van het terrein bij voltooiing van de bouw). So the national anchor for normalisation is
// `straatpeil`, and a plan definition can be aligned to it branch by branch. `nokhoogte`, `oorspronkelijk
// hoofdgebouw`, `voorgevelrooilijn`, `perceelsgrens` have NO catalogue concept at all — recorded so nobody
// looks for a national spelling that does not exist.
//
// PURE (C58 §1.9). Deterministic. No I/O. Composes with `nlPeil.ts` (same classes, same classifier).

import { classifyNlPeilDefinition, type NlPeilReferenceClass } from './nlPeil.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 1. The catalogue
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface NlPeilCatalogueEntry {
    readonly id: string;
    /** The begrip heading as captured ("1.17 peil"). */
    readonly heading: string;
    readonly planIds: readonly string[];
    /** The definition, VERBATIM (trimmed at the next begrip heading). */
    readonly verbatim: string;
    /** TRUE when the probe's 1200-character capture window cut the article before its end. */
    readonly truncatedInSample: boolean;
}

export const NL_PEIL_DEFINITION_CATALOGUE: readonly NlPeilCatalogueEntry[] = Object.freeze([
    {
        id: 'nl-peil-01',
        heading: '1.99 peil',
        planIds: ['NL.IMRO.0148.Kernen2022-vs01'],
        verbatim:
            '1. De kruin van de dichtstbij gelegen weg, als de (voor)gevel van het gebouw of het bouwwerk, geen gebouw zijnde, geheel of gedeeltelijk is gelegen op een afstand van 10 m of minder van die weg; 2. De gemiddelde hoogte van het aan het bouwwerk aansluitende maaiveld vóór het bouwrijp maken, als de (voor)gevel van het gebouw of het bouwwerk, geen gebouw zijnde, is gelegen op een afstand van meer dan 10 m van de dichtstbij gelegen weg; 3. Indien het bepaalde onder 1 of 2 niet voldoende concreet is te bepalen, het door of namens burgemeester en wethouders aan te geven peil.',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-02',
        heading: '1.94 peil',
        planIds: ['NL.IMRO.0150.Chw001D-VG01'],
        verbatim:
            'a. voor een bouwwerk op een perceel, waarvan de hoofdtoegang direct aan de weg grenst: de hoogte van de weg ter plaatse van die hoofdtoegang; b. voor een bouwwerk op een perceel waarvan de hoofdtoegang niet direct aan de weg grenst: de hoogte van het aansluitende afgewerkte terrein ter hoogte van die hoofdingang, waarbij plaatselijke, niet bij het verdere verloop van het terrein passende, ophogingen of verdiepingen aan de voet van het bouwwerk, anders dan noodzakelijk voor de bouw daarvan, buiten beschouwing blijven; c. voor een bouwwerk drijvend op het water: de waterspiegel; d. voor een bouwwerk in of over het water, geen drijvend bouwwerk zijnde: de hoogte van het terrein ter plaatse van het punt dat het meest nabij ligt aan waar het water grenst aan het vasteland;',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-03',
        heading: '2.6 peil',
        planIds: ['NL.IMRO.0175.windmolensBP001-va01'],
        verbatim:
            'a. voor een bouwwerk op een perceel, waarvan de hoofdtoegang tot het perceel direct aan de weg grenst: de hoogte van de weg ter plaatse van die hoofdtoegang; b. voor een bouwwerk op een perceel, waarvan de hoofdtoegang tot het perceel niet direct aan de weg grenst: de hoogte van het terrein ter hoogte van die hoofdtoegang bij voltooiing van de bouw; c. als in of op het water wordt gebouwd: het gemiddelde waterniveau gedurende een jaar ten opzichte van NAP; tevens de waterstand die zoveel mogelijk wordt gehandhaafd en die wordt vastgelegd in een peilbesluit.',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-04',
        heading: '1.17 peil',
        planIds: ['NL.IMRO.0310.21001BP0000-VG01', 'NL.IMRO.1701.0000BP000000000585-0002'],
        verbatim: 'de gemiddelde hoogte van het bestaande aansluitende afgewerkte maaiveld;',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-05',
        heading: '1.90 Peil',
        planIds: ['NL.IMRO.0344.BPCHWZUILEN-VA01'],
        verbatim:
            '1. Voor een gebouw, waarvan de hoofdtoegang grenst aan de weg: de hoogte van de kruin van de weg. 2. Voor andere gebouwen en bouwwerken, geen gebouwen zijnde: de gemiddelde hoogte van het aansluitende afgewerkte maaiveld. 3. Voor gebouwen die grenzen aan een dijk: de hoogte van de kruin van de dijk ter plaatse van het bouwwerk.',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-06',
        heading: '1.43 Peil',
        planIds: ['NL.IMRO.0599.BP2066SVNatuurpark-va02'],
        verbatim:
            '(straat-): a. voor een bouwwerk, waarvan de hoofdtoegang aan de weg grenst: de hoogte van de weg ter plaatse van de kruin van de weg; b. voor een bouwwerk waarvan de hoofdtoegang niet aan de weg grenst: de hoogte van het terrein ter plaatse van die hoofdtoegang, na voltooiing van de aanleg van dat terrein. Indien een bouwwerk aan meer dan één weg wordt gebouwd, is het peil van de hoogstgelegen weg maatgevend.',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-07',
        heading: '1.125 peil',
        planIds: ['NL.IMRO.0606.BP00100-0002', 'NL.IMRO.0606.BP0047-0002'],
        verbatim:
            'a. voor een bouwwerk, waarvan de hoofdtoegang onmiddellijk aan een weg of pad grenst: de (ontwerp- of streef-)hoogte van die weg of dat pad ter plaatse van de hoofdtoegang; b. voor een bouwwerk, waarvan de hoofdtoegang niet direct aan de weg grenst: de hoogte van het afgewerkte terrein of dak van een parkeervoorziening ter plaatse van de hoofdtoegang bij voltooiing van de bouw; c. voor een bouwwerk welke wordt gebouwd op de landtunnel, de daaraan gebouwde luifels en/of de zettingsvrije plaat: de hoogte van het afgewerkte terrein op de landtunnel, de daaraan gebouwde luifels en de zettingsvrije plaat; d. indien in of op het water wordt gebouwd: het Normaal Amsterdams Peil.',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-08',
        heading: '1.92 peil',
        planIds: ['NL.IMRO.0703.BGRWBP2022-va01'],
        verbatim:
            'a. voor gebouwen die onmiddellijk aan de weg grenzen: de hoogte van die weg; b. voor windturbines en bouwwerken in het water: 0.00m +NAP; c. voor gebouwen in het talud van de dijk: de gemiddelde hoogte van het bestaande aansluitende afgewerkte maaiveld ter plaatse van de van de dijk afgekeerde zijde van het gebouw; d. in andere gevallen en voor bouwwerken, geen gebouwen zijnde: de gemiddelde hoogte van het bestaande aansluitende afgewerkte maaiveld; e. wanneer onduidelijkheid bestaat over het peil kunnen burgemeester en wethouder een peil aanwijzen.',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-09',
        heading: '1.72 peil',
        planIds: ['NL.IMRO.0717.0174BPBgbH5-VG03'],
        verbatim:
            'a. voor gebouwen, waarvan de hoofdtoegang onmiddellijk aan een weg grenst: de hoogte van de weg ter plaatse van een hoofdtoegang; b. bij ligging in het water: de gemiddelde hoogte van de aangrenzende oevers; c. in andere gevallen: de gemiddelde hoogte van het aansluitende, afgewerkte maaiveld; d. voor strandpaviljoens: bovenzijde vloer, waarbij de vloerhoogte wordt bepaald door het waterschap;',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-10',
        heading: '1.87 peil',
        planIds: ['NL.IMRO.0736.BP018BgbWest-va02'],
        verbatim:
            'a. voor gebouwen die onmiddellijk aan de weg grenzen: de hoogte van die weg; b. in andere gevallen en voor bouwwerken, geen gebouwen zijnde: de gemiddelde hoogte van het aansluitende afgewerkte maaiveld, op het tijdstip van inwerkingtreding van dit plan.',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-11',
        heading: '1.33 peil',
        planIds: ['NL.IMRO.0820.BPLandgGulberg2018-D003'],
        verbatim:
            'Voor bouwwerken, waarvan de hoofdtoegang onmiddellijk aan de weg grenst: de hoogte van die weg ter plaatse van de hoofdtoegang; In andere gevallen: de gemiddelde hoogte van het aansluitende maaiveld of het afgewerkte bouwterrein.',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-12',
        heading: '1.119 peil',
        planIds: ['NL.IMRO.0873.BUITxBP170xHERZx19-VG01'],
        verbatim:
            'a. voor een bouwwerk op een perceel, waarvan de hoofdtoegang direct aan de weg grenst: de hoogte van de weg ter plaatse van de hoofdtoegang; b. voor een bouwwerk op een perceel, waarvan de hoofdtoegang niet direct aan de weg grenst: de hoogte van het terrein ter hoogte van die hoofdtoegang bij voltooiing van de bouw; c. indien in of op het water wordt gebouwd: het Nieuw Amsterdams Peil (of andere plaatselijk aan te houden waterpeil);',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-13',
        heading: '1.182 peil',
        planIds: ['NL.IMRO.0994.2022BP001-VA02'],
        verbatim:
            'voor een gebouw op een perceel, waarvan de hoofdtoegang direct aan de weg grenst: de hoogte van de weg ter plaatse van die hoofdtoegang; voor gebouwen, ter plaatse van de aanduiding ‘Villa Via Nova’, het vloerpeilniveau woning zoals aangegeven als vloerpeil woning / begane grond in meters in +NAP in Bijlage 8 van deze regels; voor bouwwerken, geen gebouw zijnde binnen de bestemming \'Water\': de hoogte van de bovenzijde van het heersende waterpeil; ten aanzien van de bestemming \'Verkeer-Railverkeer\': de bovenkant spoorstaaf; voor een bouwwerk op een perceel, waarvan de hoofdtoegang niet direct aan de weg grenst: de gemiddelde hoogte van het afgewerkte aansluitende maaiveld. Ter plaatse van de aanduiding ‘entreegebouw kasteelruïne’ geldt: peil 1: de hoogte van de weg ter plaatse van de hoofdtoegang van het entreegebouw aan het Grendelplein; peil 2: de gemiddelde hoogte van het aansluitende afgewerkte maaiveld',
        truncatedInSample: true,
    },
    {
        id: 'nl-peil-14',
        heading: '1.11 peil',
        planIds: ['NL.IMRO.1509.BP000100-VA02'],
        verbatim:
            'a. Voor een gebouw, waarvan de hoofdtoegang grenst aan de weg: de hoogte van de weg ter plaatse van die hoofdtoegang; b. voor een bouwwerk, waarvan de hoofdtoegang niet direct aan de weg grenst: de gemiddelde hoogte van het aansluitende, afgewerkte terrein ter plaatse; c. indien in of op het water wordt gebouwd: het Nieuw Amsterdams Peil (of een ander plaatselijk aan te houden waterpeil).',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-15',
        heading: '1.106 peil',
        planIds: ['NL.IMRO.1699.2022BP047-vg02'],
        verbatim:
            'a. voor gebouwen, waarvan de hoofdtoegang onmiddellijk aan een weg grenst: de hoogte van die weg ter plaatse van de hoofdtoegang; b. in andere gevallen: de gemiddelde hoogte van het aansluitende afgewerkte maaiveld;',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-16',
        heading: '1.29 peil',
        planIds: ['NL.IMRO.1884.PPALGEMAFWIJKINGEN-VAS1'],
        verbatim:
            'ten opzichte van gebouwen, waarvan de hoofdtoegang onmiddellijk aan een weg grenst: de hoogte van die weg ter plaatse van de hoofdingang; in andere gevallen: de gemiddelde hoogte van het aansluitende afgewerkte terrein; als in of op het water wordt gebouwd: het gemiddelde waterniveau gedurende een jaar ten opzichte van NAP; tevens de waterstand die zoveel mogelijk wordt gehandhaafd en die wordt vastgelegd in een peilbesluit; bij drijvende bouwwerken is het peil de waterlijn;',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-17',
        heading: '1.39 peil',
        planIds: ['NL.IMRO.1896.BP0083-VS01'],
        verbatim:
            'a. het peil overeenkomstig de bouwverordening, dan wel indien geen peil overeenkomstig de bouwverordening is vast te stellen, de hoogte van het afgewerkte bouwterrein; b. indien de voorgevel van een gebouw gelegen is binnen een afstand van maximaal 5 m uit de grens van een bestemming verkeersdoeleinden, gelegen op een dijk, wordt de kruin van de dijk als peil beschouwd; c. indien de voorgevel van een gebouw gelegen is binnen een afstand van maximaal 5 m uit de grens van de bestemming verkeersdoeleinden, gelegen aan de teen van de dijk, wordt de bovenkant van de weg als peil beschouwd; d. in alle andere gevallen, waarin aan een dijk wordt gebouwd wordt als peil beschouwd de gemiddelde hoogte van het aanliggend afgewerkt terrein.',
        truncatedInSample: false,
    },
    {
        id: 'nl-peil-18',
        heading: '1.43 peil',
        planIds: ['NL.IMRO.1970.BpDkBetterwirdfas2-VA01'],
        verbatim:
            'a. voor een bouwwerk op een perceel waarvan de hoofdtoegang direct aan de weg grenst: de hoogte van de weg ter plaatse van die hoofdtoegang; b. voor een bouwwerk op een perceel waarvan de hoofdtoegang niet direct aan de weg grenst: de hoogte van het terrein ter hoogte van die hoofdtoegang bij voltooiing van de bouw; c. indien in of op het water wordt gebouwd: het Nieuw Amsterdams Peil; d. in het geval de hoogte van het terrein op een perceel grote verschillen vertoont: de door burgemeester en wethouders bepaalde hoogte;',
        truncatedInSample: false,
    },
] as const);

/**
 * Normalise a definition for CATALOGUE MATCHING ONLY: lower-case, typographic quotes → ASCII, whitespace
 * collapsed, a leading colon and trailing punctuation dropped. ⚠ It does NOT strip Dutch inflection or
 * punctuation inside the text — two plans that differ in a comma are two definitions, and the classifier
 * (not this normaliser) is where inflection tolerance belongs.
 */
export function normaliseNlBegripText(text: string | null | undefined): string {
    if (typeof text !== 'string') return '';
    return text
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[“”„‟]/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[:\s]+/, '')
        .replace(/[;.\s]+$/, '')
        .toLowerCase();
}

const CATALOGUE_INDEX: ReadonlyMap<string, NlPeilCatalogueEntry> = new Map(
    NL_PEIL_DEFINITION_CATALOGUE.map((e) => [normaliseNlBegripText(e.verbatim), e] as const),
);

export type NlPeilCatalogueLookup =
    | { readonly kind: 'catalogued'; readonly entry: NlPeilCatalogueEntry; readonly classes: readonly NlPeilReferenceClass[] }
    | { readonly kind: 'not-catalogued'; readonly normalised: string; readonly classes: readonly NlPeilReferenceClass[] }
    | { readonly kind: 'empty' };

/**
 * Look a plan's peil definition up in the closed set. A miss is a first-class outcome: the definition is
 * still classified by the shared classifier, and the caller knows it met a definition the sample never saw.
 */
export function lookupNlPeilDefinition(text: string | null | undefined): NlPeilCatalogueLookup {
    const norm = normaliseNlBegripText(text);
    if (norm === '') return { kind: 'empty' };
    const entry = CATALOGUE_INDEX.get(norm);
    if (entry) return { kind: 'catalogued', entry, classes: classifyNlPeilDefinition(entry.verbatim) };
    return { kind: 'not-catalogued', normalised: norm, classes: classifyNlPeilDefinition(text) };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 2. The extractor
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface NlBegripExtraction {
    /** "1.17 peil" — the numbered heading as it appears. */
    readonly heading: string;
    readonly term: string;
    /** Character offset of the heading in the flattened plan text. */
    readonly offset: number;
    /** The definition, VERBATIM, trimmed at the next begrip heading or `Artikel N`. */
    readonly verbatim: string;
    /** TRUE when the capture reached `maxChars` without meeting a heading. */
    readonly truncated: boolean;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Extract the begripsbepaling for `term` from flattened plan text (`r_<planId>.html` / `pt_<planId>.xml`,
 * tags stripped). Returns the LONGEST non-TOC capture, or null. Pure.
 *
 * The next-heading rule is `\s\d{1,2}\.\d{1,3}\s+<letter>` for ANY letter case — the probe's `[A-Z]`-only
 * rule let "1.100 permanente bewoning …" run into six of twenty captures.
 */
export function extractNlBegripsbepaling(planText: string | null | undefined, term: string, maxChars = 2000): NlBegripExtraction | null {
    if (typeof planText !== 'string' || planText.trim() === '' || term.trim() === '') return null;
    const text = planText.replace(/\s+/g, ' ');
    const t = escapeRe(term.trim());
    const headRe = new RegExp(`(\\d{1,2}\\.\\d{1,3})\\s+(${t.charAt(0).toUpperCase()}|${t.charAt(0).toLowerCase()})${t.slice(1)}\\b`, 'g');
    const nextHeading = /\s\d{1,2}\.\d{1,3}\s+[A-Za-z(‘’'-]|\sArtikel\s+\d/;
    let best: NlBegripExtraction | null = null;
    let m: RegExpExecArray | null;
    while ((m = headRe.exec(text)) !== null) {
        const start = m.index + m[0].length;
        const after = text.slice(start, start + maxChars);
        // A TOC row: the next numbered heading follows almost immediately.
        if (/^\s*\d{1,2}\.\d{1,3}\s+\S/.test(after.slice(0, 40)) || /^\s*Artikel\s+\d/.test(after.slice(0, 40))) continue;
        const stop = after.search(nextHeading);
        const body = (stop > 0 ? after.slice(0, stop) : after).trim().replace(/^[:\s]+/, '');
        if (body.length < 10) continue;
        const cand: NlBegripExtraction = {
            heading: `${m[1]} ${m[2]}${term.trim().slice(1)}`,
            term: term.trim(),
            offset: m.index,
            verbatim: body,
            truncated: stop <= 0 && after.length >= maxChars,
        };
        if (best === null || cand.verbatim.length > best.verbatim.length) best = cand;
    }
    return best;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 3. The national reference — the Stelselcatalogus, as probed
// ──────────────────────────────────────────────────────────────────────────────────────────────

export const NL_STELSELCATALOGUS_REFERENCE = Object.freeze({
    source:
        'https://stelselcatalogus.omgevingswet.overheid.nl/api/concepten?zoekTerm=<term>&pageSize=50 ' +
        '(Accept: application/hal+json — KEYLESS; application/json → 406; lowercase zoekterm → 400). ' +
        'Spec: /api/ (text/yaml, "Catalogus website API 1.3.0"). Key-gated sibling: ' +
        'service.omgevingswet.overheid.nl/publiek/catalogus/api/opvragen/v3 (x-api-key; anonymous 401).',
    probedAt: '2026-09-04',
    artefact: 'docs/04-reference/jurisdictions/nl/findings/nl-phase0/nl-stelselcatalogus-probe.json',
    finding:
        '`peil` is NOT a national begrip (45 hits, 0 exact); `straatpeil` IS, and its definition is branches a and b ' +
        'of the commonest plan article verbatim. No concept exists for nokhoogte, oorspronkelijk hoofdgebouw, ' +
        'voorgevelrooilijn or perceelsgrens.',
    concepts: [
        {
            naam: 'straatpeil',
            conceptschema: 'Regelgeving',
            geldigVanaf: '2020-10-28',
            uri: 'http://regelgeving.omgevingswet.overheid.nl/regelgeving/id/concept/Straatpeil',
            definitie:
                'a. Voor een bouwwerk waarvan de hoofdtoegang direct aan de weg grenst: de hoogte van de weg ter plaatse van ' +
                'die hoofdtoegang; b. voor een bouwwerk waarvan de hoofdtoegang niet direct aan de weg grenst: de hoogte van ' +
                'het terrein ter plaatse van die hoofdtoegang bij voltooiing van de bouw.',
        },
        {
            naam: 'bouwhoogte',
            conceptschema: 'Gemeentelijk begrippenkader VNG',
            geldigVanaf: '2024-01-01',
            uri: 'http://standaarden.omgevingswet.overheid.nl/gemeentelijkbegrippenkadervng/id/concept/bouwhoogte',
            definitie:
                'de afstand vanaf het straatpeil tot aan het hoogste punt van het gebouw of van een bouwwerk, geen gebouw ' +
                'zijnde, met uitzondering van ondergeschikte bouwonderdelen, zoals schoorstenen, antennes en naar de aard ' +
                'daarmee gelijk te stellen bouwonderdelen',
        },
        {
            naam: 'dakhelling',
            conceptschema: 'Gemeentelijk begrippenkader VNG',
            geldigVanaf: '2024-01-01',
            uri: 'http://standaarden.omgevingswet.overheid.nl/gemeentelijkbegrippenkadervng/id/concept/dakhelling',
            definitie: 'de hoek die het dakvlak maakt ten opzichte van het horizontale vlak',
        },
        {
            naam: 'bouwlaag',
            conceptschema: 'Gemeentelijk begrippenkader VNG',
            geldigVanaf: '2024-01-01',
            uri: 'http://standaarden.omgevingswet.overheid.nl/gemeentelijkbegrippenkadervng/id/concept/bouwlaag',
            definitie:
                'een doorlopend gedeelte van een gebouw dat door op gelijke of bij benadering gelijke hoogte liggende vloeren ' +
                'of balklagen is begrensd zulks met inbegrip van de begane grond en met uitsluiting van onderbouw en zolder',
        },
        {
            naam: 'bebouwingspercentage',
            conceptschema: 'Gemeentelijk begrippenkader VNG',
            geldigVanaf: '2021-03-25',
            uri: 'http://standaarden.omgevingswet.overheid.nl/gemeentelijkbegrippenkadervng/id/concept/bebouwingspercentage',
            definitie: 'het in procenten uitgedrukte deel van een bouwwerkperceel dat ten hoogste mag worden bebouwd',
        },
        {
            naam: 'daknok',
            conceptschema: 'Regelgeving',
            geldigVanaf: '2024-01-01',
            uri: 'http://regelgeving.omgevingswet.overheid.nl/regelgeving/id/concept/Daknok',
            definitie: 'Hoogste punt van een schuin dak.',
        },
        {
            naam: 'dakvoet',
            conceptschema: 'Regelgeving',
            geldigVanaf: '2024-01-01',
            uri: 'http://regelgeving.omgevingswet.overheid.nl/regelgeving/id/concept/Dakvoet',
            definitie: 'Laagste punt van een schuin dak.',
        },
    ],
    noNationalConcept: ['peil', 'nokhoogte', 'oorspronkelijk hoofdgebouw', 'voorgevelrooilijn', 'perceelsgrens', 'goothoogte (type-norm only, no definition)'],
} as const);

export interface NlStraatpeilAlignment {
    /** branch a — hoofdtoegang direct aan de weg → de hoogte van de weg ter plaatse van die hoofdtoegang. */
    readonly branchA: boolean;
    /** branch b — hoofdtoegang niet direct aan de weg → de hoogte van het terrein … bij voltooiing van de bouw. */
    readonly branchB: boolean;
    /** Both branches present — the plan's peil IS the national straatpeil (possibly with extra branches). */
    readonly isStraatpeil: boolean;
}

/**
 * Align a plan's peil definition to the national `straatpeil` concept, branch by branch. The two branch
 * tests are built from the catalogue definition's own wording (inflection-tolerant on the article words
 * only). Pure.
 */
export function alignNlPeilToStraatpeil(text: string | null | undefined): NlStraatpeilAlignment {
    const s = normaliseNlBegripText(text);
    const branchA = /hoofdtoegang[^;:]{0,40}(direct|onmiddellijk)?[^;:]{0,20}aan (de|een) weg[^;]{0,40}grenst:?\s*de hoogte van (de|die) weg/.test(s);
    const branchB = /hoofdtoegang[^;:]{0,40}niet (direct|onmiddellijk)?\s*aan (de|een) weg[^;]{0,40}grenst:?\s*de hoogte van het terrein[^;]{0,60}(bij|na) voltooiing van de (bouw|aanleg)/.test(s);
    return { branchA, branchB, isStraatpeil: branchA && branchB };
}
