// §HABITABILITY-MINIMA-ARE-JURISDICTIONAL — THE PER-COUNTRY COVERAGE AUDIT (L-4401).
//
// THE ONE QUESTION THIS TABLE ANSWERS
// ══════════════════════════════════════════════════════════════════════════════════
// *"Today, if PRYZM refuses a room in this country for being under a minimum, whose
// number is it quoting?"* — measured per country, against what is actually on disk.
//
// ⛔ ABSENT AND UNREACHABLE HAVE OPPOSITE FIXES, so `gapKind` is a required field and
// every row states which it is. `'not-fetched'` means nobody has gone and got it —
// the fix is a sourcing task. `'fetched-not-extracted'` means the text is HERE and
// nobody has read it into structure — the fix is an extraction task, and it is far
// cheaper. Collapsing the two is how a research backlog gets mis-costed.
//
// THE MEASUREMENT BEHIND THIS TABLE (lane JURIS11, 2026-08-22 — RE-RUN IT, DON'T
// TRUST IT). Two commands, both over `docs/04-reference/jurisdictions/`:
//
//   rg -il "superficie útil mínima|superficies útiles mínimas|dormitorio|Mindestgröße|
//           surface habitable minimale|woonoppervlak|habitabilidade|área mínima"
//        docs/04-reference/jurisdictions/                              -> 3 FILES
//   find docs/04-reference/jurisdictions/{be,ch,de,dk,fi,fr,gb,it,nl,no,pt,sa,se,us} \
//        -type f \( -name '*.txt' -o -name '*.pdf' \)                  -> 0 FILES
//
// The second is the important one. **Fourteen of the fifteen country folders hold no
// primary legal text at all** — not an unextracted one, none. The jurisdictions tree
// is a PLANNING/ENVELOPE corpus (zoning, cadastre, buildable envelope, heights); it
// was never a habitability corpus, and 15 country folders + 15 server proxies do not
// contain one habitability figure between them. So *"bring this data into the
// algorithm"* is a **BUILD, not a WIRE** — and saying so is the honest answer.
//
// ⚠ A ROW MAY NAME AN INSTRUMENT AND STILL BE `'absent'`. Naming a source is not
// having it. `namedSourceToChase` is a work item, never evidence.

import type { HabitabilityCoverageRow } from './types.js';

/**
 * One row per `docs/04-reference/jurisdictions/<cc>/` country folder — 15 of them,
 * measured `ls docs/04-reference/jurisdictions/` on 2026-08-22 (be ch de dk es fi fr
 * gb it nl no pt sa se us, plus `_TEMPLATE` and the shared matrices, which are not
 * countries).
 *
 * Asserted against `standards.ts` by `habitabilityStandards.test.ts` in BOTH
 * directions: a row claiming `'structured'` with no standard behind it fails, and a
 * seeded standard whose country has no row fails. That two-way check is deliberate —
 * `check-contract-index-equivalence.ts` exists because one-way counts rot.
 */
export const HABITABILITY_COVERAGE: readonly HabitabilityCoverageRow[] = [
    {
        countryCode: 'be',
        countryName: 'Belgium',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'REGIONAL, not federal — three separate instruments: Flanders, Vlaamse Codex Wonen (2021) ' +
            'woningkwaliteitsnormen; Wallonia, Code wallon de l\'Habitation durable — critères de salubrité; ' +
            'Brussels, Code bruxellois du Logement + the arrêté of 4 September 2003 on sécurité/salubrité/équipement. ' +
            'Chasing "Belgium" as one jurisdiction would be the same error as chasing "Spain" as one.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note: 'jurisdictions/be/ holds 47 files, all planning/envelope/LOD. No legal text of any kind.',
    },
    {
        countryCode: 'ch',
        countryName: 'Switzerland',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'CANTONAL, and partly communal — e.g. Kanton Zürich Allgemeine Bauverordnung (ABV) and the ' +
            'Planungs- und Baugesetz (PBG) for Wohnraum/Aufenthaltsraum requirements; SIA norms are technical, ' +
            'not legal. There is no federal Swiss habitability minimum to fetch.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note:
            'PRYZM already routes Swiss ZONING two ways (ch-national-grundnutzung, ch-zh-zurich-bzo). Neither ' +
            'says anything about rooms — envelope and habitability are different corpora from different authorities.',
    },
    {
        countryCode: 'de',
        countryName: 'Germany',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'LÄNDER-level: the 16 Landesbauordnungen, tracking Musterbauordnung §48 (Aufenthaltsräume). ' +
            '⚠ Expect a SHAPE mismatch: German law principally regulates Aufenthaltsraum HEIGHT and window ' +
            'area, not a per-room floor area, so several of PRYZM\'s rows may legitimately stay UNKNOWN for ' +
            'Germany even after the instrument is read. That is a correct outcome, not a failed extraction.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note: 'jurisdictions/de/ holds 100 files — the largest folder in the tree, and none of it is habitability.',
    },
    {
        countryCode: 'dk',
        countryName: 'Denmark',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'Bygningsreglement BR18 (Bolig- og bygningsindretning) — national, published by Bolig- og ' +
            'Planstyrelsen at br18.dk in machine-readable HTML, which makes this one of the cheapest rows to close.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note:
            'Denmark is PRYZM\'s most complete ZONING jurisdiction (dk Plandata, national extent, real dispatch). ' +
            'It is nonetheless at zero for habitability — the clearest single demonstration that envelope ' +
            'maturity does not carry over.',
    },
    {
        countryCode: 'es',
        countryName: 'Spain',
        form: 'structured',
        standardIds: ['es-29067-malaga-pgou-2018', 'es-ct-decret-141-2012'],
        namedSourceToChase:
            'AUTONOMIC + MUNICIPAL, never national. Catalonia: Decret 141/2012 (DOGC 6245) — NAMED and seeded ' +
            'as CANDIDATE values, primary text still to fetch. Andalucía: the autonomic habitability regime ' +
            'behind the municipal PGOUs. Madrid, València, Murcia, Canarias, Balears, Aragón: one instrument each. ' +
            'Sevilla\'s own NNUU (in repo) DELEGATES its room dimensions to "la normativa de aplicación", so ' +
            'extracting Sevilla means chasing the instrument it defers to, not re-reading Sevilla.',
        gapKind: 'partially-extracted',
        evidencePath:
            'docs/04-reference/jurisdictions/es/es-an/29067-malaga/findings/corpus/NormasUrbanisticas/AD-FEB2018/12-TITULO-XII.txt',
        note:
            'The ONLY country with a habitability figure read from primary text held in this repo (Málaga, ' +
            'Art. 12.2.35, 7 room types). Sevilla\'s NNUU corpus is present but delegates. ' +
            '⚠ 19 Spanish sub-jurisdictions are registered for ZONING and 1 has habitability — the gap ' +
            'between the two corpora, inside the single best-covered country, is 18.',
    },
    {
        countryCode: 'fi',
        countryName: 'Finland',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'Ympäristöministeriön asetus asuin-, majoitus- ja työtiloista (Ministry of the Environment decree ' +
            'on residential, accommodation and work spaces), under the Maankäyttö- ja rakennuslaki. National; ' +
            'published on finlex.fi.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note: 'jurisdictions/fi/ holds 24 files, the joint-smallest folder in the tree. No legal text.',
    },
    {
        countryCode: 'fr',
        countryName: 'France',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'Décret n° 2002-120 relatif aux caractéristiques du logement décent, and the Code de la construction ' +
            'et de l\'habitation. National, consolidated on legifrance.gouv.fr. ⚠ Note the French floor is a ' +
            'DWELLING-level surface habitable + hauteur sous plafond rule, not a per-room table, so expect the ' +
            'same shape mismatch as Germany.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note: 'PRYZM routes Paris zoning (fr-75056-paris, PLU bioclimatique). Habitability: nothing.',
    },
    {
        countryCode: 'gb',
        countryName: 'United Kingdom',
        form: 'structured',
        standardIds: ['gb-eng-ndss-2015'],
        namedSourceToChase:
            'ENGLAND ONLY is seeded, and only as `instrument-cited`. Fetch: GOV.UK "Technical housing standards ' +
            '— nationally described space standard" (2015) into jurisdictions/gb/gb-eng/. Then SEPARATELY: ' +
            'Scotland (Building (Scotland) Regulations / Housing for Varying Needs) and Wales (Development ' +
            'Quality Requirements) — different regimes, neither covered by NDSS.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note:
            '⚠ THE COUNTRY WHOSE NUMBERS WERE ALREADY IN THE PRODUCT is also a country whose instrument this ' +
            'repo does not hold. The 11.5 / 7.5 figures shipped for a year with the label "Building Regs ' +
            'mandatory"; they are NDSS, and NDSS is a planning standard that binds only where adopted (L-4402).',
    },
    {
        countryCode: 'it',
        countryName: 'Italy',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'Decreto Ministeriale Sanità 5 luglio 1975 (altezza minima interna e requisiti igienico-sanitari ' +
            'dei locali di abitazione), as amended, plus the per-comune Regolamento Edilizio. National floor ' +
            'with municipal variation — the same two-tier shape as Spain.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note: 'jurisdictions/it/ holds 46 files, all planning. No legal text.',
    },
    {
        countryCode: 'nl',
        countryName: 'Netherlands',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'Besluit bouwwerken leefomgeving (Bbl), which replaced Bouwbesluit 2012 — afdeling verblijfsgebied ' +
            'en verblijfsruimte. National; consolidated on wetten.overheid.nl.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note: 'PRYZM routes NL zoning nationally (nl-bestemmingsplan). Habitability: nothing.',
    },
    {
        countryCode: 'no',
        countryName: 'Norway',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'Byggteknisk forskrift (TEK17), kapittel 12 — planløsning og bygningsdeler i byggverk. National; ' +
            'published with commentary by Direktoratet for byggkvalitet at dibk.no.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note: 'jurisdictions/no/ holds 37 files, all planning. No legal text.',
    },
    {
        countryCode: 'pt',
        countryName: 'Portugal',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'RGEU — Regulamento Geral das Edificações Urbanas (DL 38382/1951, partially in force), the chapters ' +
            'on condições de habitabilidade. Named — but NOT held — by this repo\'s own Portugal study, which ' +
            'flags it "ASSERTED-UNVERIFIED this session". Fetch from dre.pt.',
        gapKind: 'not-fetched',
        evidencePath: 'docs/04-reference/jurisdictions/pt/findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md',
        note:
            'THE ONLY COUNTRY OUTSIDE SPAIN WHERE THIS REPO EVEN NAMES A HABITABILITY INSTRUMENT — and it ' +
            'names it in one sentence of a data-sourcing study, with the instrument\'s own content unread. ' +
            'A named instrument is a work item, not coverage.',
    },
    {
        countryCode: 'sa',
        countryName: 'Saudi Arabia',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'Saudi Building Code (SBC 201 general / SBC 801 residential) and the Ministry of Municipality and ' +
            'Housing building requirements (اشتراطات البناء). ⚠ Access caveat carried over from L-606: Saudi ' +
            'planning services are IP geo-fenced, so expect an ACCESS problem on top of the sourcing one.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note: 'PRYZM ships a Riyadh DEMO zoning pack (sa-ruh-riyadh). Habitability: nothing.',
    },
    {
        countryCode: 'se',
        countryName: 'Sweden',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'Boverkets byggregler (BBR, BFS 2011:6) avsnitt 3 — bostadsutformning, referencing SS 91 42 21. ' +
            '⚠ Boverket has been replacing BBR with a new rule structure; check which edition is in force ' +
            'before extracting, and record the edition on the provenance.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note: 'jurisdictions/se/ holds 25 files. No legal text. (SE cadastre is separately access-gated.)',
    },
    {
        countryCode: 'us',
        countryName: 'United States',
        form: 'absent',
        standardIds: [],
        namedSourceToChase:
            'International Residential Code (IRC) R304 "Minimum Room Areas" and IBC ch. 12, AS ADOPTED AND ' +
            'AMENDED by each state and many cities. ⚠ There is NO national US figure to fetch: the model code ' +
            'is not law until adopted, and adoption edition varies by state and by city. A US row therefore ' +
            'needs a per-jurisdiction adoption lookup, not one document.',
        gapKind: 'not-fetched',
        evidencePath: null,
        note:
            'jurisdictions/us/ holds 68 files. PRYZM has US PARCEL providers (NYC PLUTO, Chicago) and no US ' +
            'habitability data.',
    },
];

/** The coverage row for a country code, or `undefined` when the country is not in the tree. */
export function coverageFor(countryCode: string): HabitabilityCoverageRow | undefined {
    const cc = countryCode.trim().toLowerCase();
    return HABITABILITY_COVERAGE.find((r) => r.countryCode === cc);
}

/**
 * The audit's headline, computed rather than asserted so it cannot go stale:
 * how many of the tree's countries have ANY structured habitability data.
 */
export function structuredCountryCount(): number {
    return HABITABILITY_COVERAGE.filter((r) => r.form === 'structured').length;
}
