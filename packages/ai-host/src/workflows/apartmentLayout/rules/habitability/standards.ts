// §HABITABILITY-MINIMA-ARE-JURISDICTIONAL — THE SEEDED STANDARDS (lane JURIS11, L-4400..).
//
// ⛔⛔ THE ONE RULE THAT GOVERNS EVERY EDIT TO THIS FILE ⛔⛔
// ══════════════════════════════════════════════════════════════════════════════════
// **DO NOT ADD A NUMBER YOU CANNOT CITE.** A habitability minimum is a legal
// statement about someone's home. If you know the country has a standard but not what
// it says, the correct edit is a row in `coverage.ts` with `form: 'absent'` and a
// named source to chase — NOT a plausible number. Interpolating between countries
// ("Portugal is probably like Spain") is forbidden by construction: there is nowhere
// in this file to put a number without an `instrument`, an `article` and a date.
//
// ⛔ AND DO NOT COPY A NUMBER SIDEWAYS. The whole defect this module closes (L-4210)
// was a UK figure standing in for a Spanish one. This repo's own evidence that the
// number is genuinely jurisdictional: Málaga requires a 12 m² principal bedroom, and
// Catalonia requires 8 m². Both are correct law. Neither is "the" minimum.
//
// WHAT IS SEEDED TODAY, AND AT WHAT CONFIDENCE
// ══════════════════════════════════════════════════════════════════════════════════
//   ES / Málaga   `primary-in-repo`  — the PGOU's own text is in this repo and every
//                                      number below was read out of it, line-cited.
//   ES / Catalunya `instrument-cited` — the instrument is named to the DOGC issue, but
//                                      its text is NOT in this repo. CANDIDATE VALUES.
//   GB / England  `instrument-cited` — NDSS is named; text not in repo. AND it is
//                                      `conditional`, not building regulation (see below).
//   PRYZM baseline `pryzm-default`   — no instrument at all. The ONE fallback.
//
// Everything else in the 15-country tree is UNKNOWN and says so — `coverage.ts`.

import type { RoomType } from '../../types.js';
import { ROOM_RULES } from '../programRules.js';
import type {
    HabitabilityStandard,
    RoomMinimum,
    RoomMinimumProvenance,
} from './types.js';

// ─────────────────────────────────────────────────────────────────────────────────
// ES — MÁLAGA. THE ONLY STANDARD IN THIS FILE WHOSE PRIMARY TEXT IS ON DISK.
// ─────────────────────────────────────────────────────────────────────────────────
//
// `docs/04-reference/jurisdictions/es/es-an/29067-malaga/findings/corpus/
//  NormasUrbanisticas/AD-FEB2018/12-TITULO-XII.txt`
//
// Título XII, Sección 7ª, Artículo 12.2.35 — *"Superficies útiles mínimas y
// condiciones de distribución"*, case 1.2 *"Vivienda Compartimentada"*. Verbatim:
//
//   a) Salón-comedor. 20 m² para viviendas de más de tres dormitorios, 18 m² para
//      viviendas de tres dormitorios y 16 m² para las de uno o dos dormitorios. Este
//      espacio deberá permitir inscribir en él un círculo de 3 metros de diámetro.
//      Para viviendas de más de cuatro dormitorios … 24 m².
//   b) Cocina. 5 m². Si la cocina se integra con la superficie en el salón, la
//      superficie de éste deberá incrementarse en 5 m². Si la cocina es independiente
//      de la estancia tendrá como mínimo 7 m².
//   c) Dormitorios. La superficie útil mínima de los dormitorios será de 8 m². y en
//      toda la vivienda existirá un dormitorio de superficie útil no menor de 12 m².
//   d) Baño. 3 m²/Aseo 1,5 m². En viviendas de más de 70 m². útiles, existirán como
//      mínimo dos cuartos de aseo.
//
// ⚠ THE SALÓN-COMEDOR IS **NOT** SEEDED ONTO `living`, AND THAT IS DELIBERATE.
// The ordinance regulates a COMBINED living-dining room. PRYZM can emit `living` and
// `dining` as two separate rooms; applying a combined figure to one half of the pair
// OVERSTATES the requirement — which is the restrictive direction, and the restrictive
// direction is exactly what produced zero layouts on the founder's plate (L-4210). It
// IS seeded onto `open_plan`, which is the same room the ordinance describes. `living`
// and `dining` are therefore UNKNOWN in Málaga and fall to the named baseline, which
// says so. See `notCovered`.
//
// ⚠ AND THE 16 m² IS THE **FLOOR** OF A SCALE. The ordinance's figure is a function of
// the dwelling's bedroom count (16 / 18 / 20 / 24). This per-room-type table has no
// bedroom-count axis, so it carries the 1–2-bedroom floor and DISCLOSES the scale in
// `mappingNote`. A 4-bedroom Málaga dwelling is under-constrained here by 8 m², which
// is recorded as a known limitation rather than papered over — SPEC-HABITABILITY-MINIMA §6.

const MALAGA_SOURCE_PATH =
    'docs/04-reference/jurisdictions/es/es-an/29067-malaga/findings/corpus/NormasUrbanisticas/AD-FEB2018/12-TITULO-XII.txt';

const malagaProv = (article: string): RoomMinimumProvenance => ({
    instrument: 'Plan General de Ordenación Urbanística de Málaga — Texto Refundido, Normas Urbanísticas, Título XII',
    article,
    instrumentDate: '2018-02',
    sourcePath: MALAGA_SOURCE_PATH,
    sourceToChase:
        'Ayuntamiento de Málaga — PGOU Texto Refundido (Adaptación Febrero 2018), Normas Urbanísticas Título XII. ' +
        'Re-read the on-disk corpus at sourcePath; re-fetch from the Ayuntamiento planning portal if the PGOU is amended.',
    confidence: 'primary-in-repo',
    bindingness: 'mandatory',
});

export const ES_MALAGA_PGOU_2018: HabitabilityStandard = {
    standardId: 'es-29067-malaga-pgou-2018',
    displayName: 'Málaga — PGOU Normas Urbanísticas Art. 12.2.35',
    countryCode: 'es',
    extent: 'municipal',
    // MUST equal `MALAGA_JURISDICTION_ID` in @pryzm/site-parcel-data. Pinned by
    // apps/editor/__tests__/habitabilityJurisdictionIds.test.ts.
    jurisdictionKeys: ['es-29067-malaga'],
    rooms: {
        master: {
            minAreaM2: 12,
            minShortSideM: null,
            provenance: malagaProv('Art. 12.2.35.1.2 c)'),
            instrumentRoomTerm: 'dormitorio (el de superficie útil no menor de 12 m²)',
            mappingNote:
                'The ordinance requires ONE bedroom of ≥12 m² in the dwelling. PRYZM maps that ' +
                'obligation onto `master`, which is the single principal bedroom the programme mints. ' +
                'It is a mapping, not a translation: the ordinance names no "master".',
        },
        bedroom: {
            minAreaM2: 8,
            minShortSideM: null,
            provenance: malagaProv('Art. 12.2.35.1.2 c)'),
            instrumentRoomTerm: 'dormitorio',
            mappingNote: null,
        },
        kitchen: {
            minAreaM2: 7,
            minShortSideM: null,
            provenance: malagaProv('Art. 12.2.35.1.2 b)'),
            instrumentRoomTerm: 'cocina independiente',
            mappingNote:
                'The ordinance states 7 m² for an INDEPENDENT kitchen and 5 m² for one integrated into ' +
                'the salón (with the salón then growing by 5 m²). PRYZM `kitchen` is the independent ' +
                'case — the fused case is the `open_plan` room type, which carries its own figure.',
        },
        open_plan: {
            minAreaM2: 16,
            minShortSideM: 3.0,
            provenance: malagaProv('Art. 12.2.35.1.2 a)'),
            instrumentRoomTerm: 'salón-comedor',
            mappingNote:
                'FLOOR OF A SCALE: the ordinance sets 16 m² (1–2 bedrooms), 18 (3), 20 (>3), 24 (>4). ' +
                'This table has no bedroom-count axis and carries the FLOOR, so a ≥3-bedroom Málaga ' +
                'dwelling is under-constrained here. The 3.0 m short side is exact — the article ' +
                'requires a 3 m diameter circle to be inscribable in the space.',
        },
        bathroom: {
            minAreaM2: 3,
            minShortSideM: null,
            provenance: malagaProv('Art. 12.2.35.1.2 d)'),
            instrumentRoomTerm: 'baño',
            mappingNote: null,
        },
        ensuite: {
            minAreaM2: 3,
            minShortSideM: null,
            provenance: malagaProv('Art. 12.2.35.1.2 d)'),
            instrumentRoomTerm: 'cuarto de aseo completo',
            mappingNote:
                'MAPPING, NOT TRANSLATION. The ordinance knows "baño" (3 m²) and "aseo" (1,5 m²) and ' +
                'has no concept of an en-suite. PRYZM `ensuite` is a full bathroom (shower/bath), so it ' +
                'takes the "baño" figure. The article separately requires ≥2 cuartos de aseo in dwellings ' +
                'over 70 m² útiles — a COUNT rule this per-room table does not model.',
        },
        wc: {
            minAreaM2: 1.5,
            minShortSideM: null,
            provenance: malagaProv('Art. 12.2.35.1.2 d)'),
            instrumentRoomTerm: 'aseo',
            mappingNote: null,
        },
    },
    notCovered: [
        'living / dining as SEPARATE rooms — the ordinance regulates the combined "salón-comedor" only, ' +
            'and splitting its figure across the pair would overstate the requirement in the restrictive direction.',
        'the whole-dwelling floor: Art. 12.2.35 denies residential status below 30,5 m² útiles. Not a room minimum.',
        'the fixture-count rule: ≥2 cuartos de aseo above 70 m² útiles.',
        'the "Vivienda en Espacio Único" (loft/studio) programme, which has its own separate figures ' +
            '(salón-comedor function 16 m², dormitorio function 10 m², baño 3 m², 3,5 m inscribed circle).',
        'ceiling height, ventilation, daylight and patio-de-luces dimensions — regulated elsewhere in Título XII.',
        'hall, corridor, study, utility, storage, balcony, stair — the article states no figure for any of them.',
    ],
};

// ─────────────────────────────────────────────────────────────────────────────────
// ES — CATALUNYA. THE INSTRUMENT BEHIND THE FOUNDER'S OWN RULING (L-4210).
// ─────────────────────────────────────────────────────────────────────────────────
//
// ⚠ `instrument-cited`, NOT `primary-in-repo`. The Decret's text is NOT in this repo
// — `grep -ril "141/2012" docs/` returns nothing. The two figures below are the ones
// the founder's ruling asserted on 2026-08-22 and they are recorded here as
// CANDIDATES with the instrument named to the DOGC issue. They are honest to ship as
// the working values for Catalonia (they replace UK numbers, which were certainly
// wrong there) and they are NOT yet a compliance determination. `sourceToChase` names
// exactly what closes that gap.
//
// ⛔ NOTHING ELSE IS SEEDED FOR CATALONIA. The Decret does regulate the sala/menjador/
// cuina and the cambra higiènica, and this lane could not cite those figures to an
// article. Guessing them is the forbidden move; they are UNKNOWN and fall to the named
// baseline, which says so.

const catalunyaProv: RoomMinimumProvenance = {
    instrument:
        "Decret 141/2012, de 30 d'octubre, sobre les condicions mínimes d'habitabilitat dels habitatges " +
        "i la cèdula d'habitabilitat (Generalitat de Catalunya) — Annex 1, habitatges de nova construcció",
    article: 'Annex 1 (condicions mínimes — habitacions)',
    instrumentDate: '2012-10-30',
    sourcePath: null,
    sourceToChase:
        'DOGC núm. 6245 (2.11.2012), Decret 141/2012 — fetch the consolidated text from the Portal ' +
        "Jurídic de Catalunya (portaljuridic.gencat.cat) into docs/04-reference/jurisdictions/es/es-ct/ " +
        'and re-read Annex 1 clause by clause. Until then these two figures are CANDIDATES, not a determination. ' +
        'Also check Decret 259/2003 for pre-2012 stock and any subsequent amending decree.',
    confidence: 'instrument-cited',
    bindingness: 'mandatory',
};

export const ES_CATALUNYA_DECRET_141_2012: HabitabilityStandard = {
    standardId: 'es-ct-decret-141-2012',
    displayName: "Catalunya — Decret 141/2012 d'habitabilitat (Annex 1)",
    countryCode: 'es',
    extent: 'regional',
    // ⚠ ENUMERATED, NOT DERIVED — and that is a deliberate, disclosed trade-off.
    // Decret 141/2012 governs ALL of Catalonia, but `resolveRegisteredJurisdictionAt`
    // returns the FINEST registered claim, which for a Barcelona parcel is
    // 'es-08019-barcelona', not 'es-ct-catalunya'. Deriving "this municipal id is in
    // Catalonia" would require a second geography resolver — the exact defect ADR-0352
    // forbids. So the Catalan registrations are listed as DATA. A Catalan municipality
    // registered later and NOT added here falls to the named PRYZM baseline and SAYS
    // SO — the fail-safe direction (a disclosed default, never a foreign law asserted).
    // `habitabilityJurisdictionIds.test.ts` pins every literal below against the real
    // registry, so a typo is a CI failure, not a mis-cited parcel.
    jurisdictionKeys: [
        'es-ct',
        'es-ct-catalunya',
        'es-08019-barcelona',
        'es-08101-hospitalet',
        'es-08015-badalona',
        'es-08200-sant-boi',
        'es-08073-cornella-de-llobregat',
    ],
    rooms: {
        master: {
            minAreaM2: 8,
            minShortSideM: null,
            provenance: catalunyaProv,
            instrumentRoomTerm: "habitació (la de superfície mínima de 8 m²)",
            mappingNote:
                'The Decret requires the dwelling to hold at least one larger bedroom. PRYZM maps that ' +
                'obligation onto `master` — the same shape as Málaga\'s "un dormitorio no menor de 12 m²", ' +
                'a different number under a different instrument. CANDIDATE: not yet read from the primary text.',
        },
        bedroom: {
            minAreaM2: 6,
            minShortSideM: null,
            provenance: catalunyaProv,
            instrumentRoomTerm: 'habitació',
            mappingNote:
                'CANDIDATE: not yet read from the primary text. ⚠ Note this is BELOW the 7.5 m² PRYZM ' +
                'currently ships for `bedroom` — and 7.5 is the UK NDSS single-bedroom figure, so the ' +
                'shipped secondary-bedroom minimum is STILL a foreign number in Catalonia (L-4404).',
        },
    },
    notCovered: [
        "sala d'estar / menjador / cuina — the Decret regulates them (the figures scale with bedroom count) " +
            'and this lane could not cite them to an article. UNKNOWN, deliberately.',
        'cambra higiènica (bathroom / WC) — regulated by fixture and by access, not seeded here.',
        'the whole-dwelling floor (the Decret sets one) and the cèdula regime for existing stock.',
        'minimum short side / inscribed square for any room — UNKNOWN, and an invented width in a Catalan ' +
            'ordinance would be exactly the defect this module exists to stop.',
        'every other room type: living, dining, kitchen, open_plan, hall, corridor, study, utility, ' +
            'bathroom, ensuite, wc, storage, balcony, stair.',
    ],
};

// ─────────────────────────────────────────────────────────────────────────────────
// GB — ENGLAND. THE SOURCE OF THE NUMBERS THAT WERE WRONG IN BARCELONA.
// ─────────────────────────────────────────────────────────────────────────────────
//
// ⚠ TWO HONESTY FLAGS ON THIS ONE, BOTH LOAD-BEARING.
//
// (1) **NDSS IS NOT BUILDING REGULATION.** It is an optional technical standard that
//     bites only where a local planning authority has adopted it in its Local Plan and
//     imposes it as a planning condition. `bindingness: 'conditional'`. The old
//     `programRules` comment called 11.5 m² "mandatory"; it was not mandatory even in
//     England, let alone in Spain.
// (2) **ENGLAND ONLY.** Scotland (Building (Scotland) Regulations / Housing for
//     Varying Needs) and Wales (Development Quality Requirements) have their own
//     regimes. The key is `'gb-eng'`; `'gb'` is deliberately NOT claimed, so a Welsh
//     or Scottish point falls to the named baseline and says so rather than being
//     answered with an English standard — the same error, one border in.

const nddsProv: RoomMinimumProvenance = {
    instrument:
        'Technical housing standards — nationally described space standard (DCLG, England). ' +
        'Applies only where adopted by a local planning authority through its Local Plan.',
    article: '¶10 (bedroom floor areas and widths)',
    instrumentDate: '2015-10-01',
    sourcePath: null,
    sourceToChase:
        'GOV.UK — "Technical housing standards: nationally described space standard" (published March 2015, ' +
        'in force 1 October 2015; amended 2016). Fetch into docs/04-reference/jurisdictions/gb/gb-eng/. ' +
        'The ADOPTION question is separate and per-authority: whether THIS borough applies NDSS is a Local ' +
        'Plan policy lookup PRYZM does not perform, which is why bindingness is `conditional`.',
    confidence: 'instrument-cited',
    bindingness: 'conditional',
};

export const GB_ENG_NDSS_2015: HabitabilityStandard = {
    standardId: 'gb-eng-ndss-2015',
    displayName: 'England — Nationally Described Space Standard (2015)',
    countryCode: 'gb',
    extent: 'regional',
    // No registered zoning jurisdiction exists for England, so this key is the
    // `docs/04-reference/jurisdictions/gb/gb-eng` folder key rather than a registry id.
    // The anti-drift test allows a non-registry key ONLY when no registration covers it.
    jurisdictionKeys: ['gb-eng'],
    rooms: {
        master: {
            minAreaM2: 11.5,
            minShortSideM: 2.75,
            provenance: nddsProv,
            instrumentRoomTerm: 'double (or twin) bedroom',
            mappingNote:
                'NDSS ¶10 sets 11.5 m² for a double/twin bedroom, and requires ONE double bedroom to be ' +
                '≥2.75 m wide (every other double ≥2.55 m). PRYZM maps the 2.75 m onto `master`, the single ' +
                'principal bedroom. This is the pair of figures that stood in `programRules` as "DB-020 ' +
                '(Building Regs mandatory)" until L-4210 — a mis-citation twice over: it is NDSS, not the ' +
                'Building Regulations, and NDSS is not mandatory.',
        },
        bedroom: {
            minAreaM2: 7.5,
            minShortSideM: 2.15,
            provenance: nddsProv,
            instrumentRoomTerm: 'single bedroom',
            mappingNote:
                'NDSS ¶10: a single bedroom is ≥7.5 m² and ≥2.15 m wide. PRYZM `bedroom` (a secondary ' +
                'bedroom) takes the single-bedroom figure — which is what the pre-L-4210 comment already ' +
                'said was permitted before a PRODUCT PREFERENCE for double-capable rooms overrode it.',
        },
    },
    notCovered: [
        'living, kitchen, dining, open_plan — NDSS states NO per-room minimum for any of them. It regulates ' +
            'the dwelling Gross Internal Area by bedspaces/storeys instead, an axis this table does not model. ' +
            'The 14 m² living / 6 m² kitchen / 9 m² dining figures in ROOM_RULES are HQI-derived, NOT NDSS, ' +
            'and HQI is a defunct Housing Corporation funding standard, not law (L-4405).',
        'bathroom, ensuite, wc — NDSS states no figure; the ROOM_RULES values cite BS 8300, an accessibility ' +
            'design standard, not a habitability minimum.',
        'the dwelling GIA table (39 m² for 1b1p, 50 m² for 1b2p, …), built-in storage (1.0–1.5 m² + 0.5 m² ' +
            'per additional occupant) and the 2.3 m floor-to-ceiling height over 75 % of GIA.',
        'WHETHER NDSS APPLIES AT ALL at a given address — that is a Local Plan adoption question.',
        'Scotland and Wales, which have separate regimes and are NOT covered by this standard.',
    ],
};

// ─────────────────────────────────────────────────────────────────────────────────
// THE ONE FALLBACK. NAMED, DERIVED, AND NEVER SILENTLY SUBSTITUTED.
// ─────────────────────────────────────────────────────────────────────────────────
//
// ⭐ IT IS **DERIVED FROM `ROOM_RULES`, NOT RETYPED**, and that is the same lesson the
// L-4210 test fix recorded: a literal copy of an authority's number rots at the next
// ruling. When the founder next re-rules a PRYZM default, he edits `ROOM_RULES` and
// this table follows in the same commit, by construction.
//
// ⚠ THESE ARE NOT LAW ANYWHERE. Every value here is `confidence: 'pryzm-default'` and
// `bindingness: 'guidance'`. Any sentence PRYZM prints from this standard must say
// that the figure is PRYZM's own — `resolve.ts#provenanceSentence` enforces it, and
// `habitabilityStandards.test.ts` asserts the sentence contains no unqualified claim.

const PRYZM_BASELINE_PROV: RoomMinimumProvenance = {
    instrument:
        "PRYZM engineering baseline — NOT a regulation of any country. Derived from the room database " +
        'in programRules.ts, whose values are a mix of defunct UK funding standards (HQI), UK ' +
        'accessibility design standards (BS 8300) and founder rulings (L-4210).',
    article: null,
    instrumentDate: '2026-08-22',
    sourcePath: 'packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts',
    sourceToChase:
        'Seed a real instrument for this jurisdiction in standards.ts. Until then this number is ' +
        'a PRYZM default and must be presented as one — see coverage.ts for the named source to chase ' +
        'per country.',
    confidence: 'pryzm-default',
    bindingness: 'guidance',
};

function baselineRooms(): Readonly<Partial<Record<RoomType, RoomMinimum>>> {
    const out: Partial<Record<RoomType, RoomMinimum>> = {};
    for (const rule of Object.values(ROOM_RULES)) {
        out[rule.type] = {
            // `minAreaM2: 0` in ROOM_RULES means "no minimum enforced" (corridor). Keep
            // it as 0 rather than null: it IS the baseline's value, not an unknown.
            minAreaM2: rule.minAreaM2,
            minShortSideM: rule.minShortSideM,
            provenance: PRYZM_BASELINE_PROV,
            instrumentRoomTerm: rule.type,
            mappingNote: null,
        };
    }
    return out;
}

/**
 * THE SINGLE FALLBACK. There is exactly one, it is reachable only through
 * `resolve.ts`, and every resolution that lands here reports
 * `matchTier: 'pryzm-baseline'` so a caller can never mistake it for a regulation.
 */
export const PRYZM_BASELINE: HabitabilityStandard = {
    standardId: 'pryzm-baseline',
    displayName: 'PRYZM engineering baseline (not a regulation)',
    countryCode: '',
    extent: 'national',
    // EMPTY ON PURPOSE. The baseline is never selected by matching a key — it is the
    // terminal rung of the ladder. A key here would make it a silent substitute.
    jurisdictionKeys: [],
    rooms: baselineRooms(),
    notCovered: [
        'every jurisdiction. This standard states what PRYZM defaults to, never what any country requires.',
    ],
};

/**
 * Every REGULATED standard, finest extent first. The baseline is NOT in this list —
 * it is not a candidate for matching, it is where the ladder ends.
 */
export const HABITABILITY_STANDARDS: readonly HabitabilityStandard[] = [
    ES_MALAGA_PGOU_2018,
    ES_CATALUNYA_DECRET_141_2012,
    GB_ENG_NDSS_2015,
];
