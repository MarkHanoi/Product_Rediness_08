// LANE E7-SE — SWEDEN (SE) · THE PLANBESTÄMMELSEKATALOG, IMPORTED VERBATIM.
//
// This is the [[identity-bootstrap-gate-offline-legislation-pattern]] OFFLINE HALF for Sweden,
// and it is the deliverable the brief asked for in the words it used: the national
// planning-provision catalogue "is exactly the kind of thing to IMPORT verbatim rather than
// harmonise". Every Swedish string below is Boverket's own, byte-for-byte out of
// `GET https://api.boverket.se/planbestammelsekatalogen/release/full/platt/aktuell`
// (release 7 · namn `20251201` · publicerad `2025-12-01T10:39:00` · typ `Juridisk` ·
// 3,707 bestämmelser · fetched 2026-09-01, keyless, HTTP 200, 13,176,663 bytes).
//
// ── WHAT THE SUBSET IS, AND WHY IT IS EXACTLY THIS SUBSET ─────────────────────────────────────
// The 3,707 rows are the whole recommended-provision corpus back to 1949. This module imports the
// **83** of them that satisfy BOTH of two SERVED predicates — no judgement, no curation:
//     (a) `slutargalla === null`  — still in force in the catalogue  → 908 of 3,707
//     (b) the served `bestammelseformulering` contains a `[…:decimaltal]` slot — i.e. the
//         provision CARRIES A NUMBER                                 →  83 of the 908
// That second predicate is the whole point: those 83 are the CLOSED, STATE-DECLARED SET OF
// NUMERIC PARAMETERS A SWEDISH DETALJPLAN DRAWN UNDER BFS 2020:5 CAN CARRY. It is the
// "DECLARED layer vocabulary, not the served bag" the E7-family conventions §6.E demand for
// UNKNOWN emission — and for once the declaration is not a hand-written list in an adapter but a
// versioned national API. The other 825 in-force provisions are prose/geometry provisions with no
// numeric slot; they are counted, not imported (see `SE_PBK_CENSUS`).
//
// Regeneration (recorded so the table is re-derivable, never re-typed):
//   curl -sS "https://api.boverket.se/planbestammelsekatalogen/release/full/platt/aktuell" \
//     -o se_pbk_flat.json
//   python gen_se_vocab.py se_pbk_flat.json
// The generator is reproduced VERBATIM in impl/lane-e7-se-transcripts/06-vocabulary-generator.md
// (barrel protocol: this lane owns no shared tools/ path); the census is transcript 05.
// The generator prints `rows 83 unmapped 0 stale-map-keys 0` — it REFUSES to emit if the served
// set and the canonical map disagree in either direction, so a Boverket release that adds or
// retires a numeric provision cannot be absorbed silently.
//
// ── WHAT THE STATE SERVES THAT NO OTHER AUDITED COUNTRY DOES ─────────────────────────────────
// Control 8 says denominator / reference geometry / measurement basis must survive normalization.
// Sweden serves all three AS CODE, inside `bestammelsekod`, and that is why the code is carried
// verbatim as the R2 `valueBasis` rather than being parsed into a house vocabulary:
//
//   DENOMINATOR (the C63 lesson, served natively — four distinct forms, four distinct codes):
//     `…AreaProc_BruttoEgen`  "% av fastighetsarean inom EGENSKAPSOMRÅDET"
//     `…AreaProc_BruttoAnv`   "% av fastighetsarean inom ANVÄNDNINGSOMRÅDET"
//     `…AreaKvm_BruttoFastigh`"m² PER FASTIGHET"
//     `…AreaKvm_Brutto`        absolute m², no denominator at all
//   Four codes, four different divisors, ONE Swedish word apart in the prose. A consumer that
//   multiplies a percentage by "the parcel area" without reading the code reproduces the Aarhus
//   trap (`bebygpct=180, af=1`) with a clean parse.
//
//   MEASUREMENT BASIS (height — and this is the L-584 rasant defect answered by the state):
//     `…_Nockhojd`            ridge height, measured from the ground
//     `…_NockhojdNollplan`    ridge height, measured ABOVE A STATED ZERO PLANE (a datum)
//     `…_Totalhojd` / `…_TotalhojdNollplan`   total height, same two bases
//   L-584 is "terrain/rasant is a LEGAL defect: we sample ONE point at the centroid, the ordinance
//   measures at the façade". Sweden makes the two cases MACHINE-DISTINGUISHABLE before any
//   terrain is sampled: a `Nollplan` provision needs a datum, not a terrain sample, and a
//   non-`Nollplan` one needs a ground reference the plan does not itself carry. Both facts ride
//   the code into `valueBasis`.
//
//   SENSE: `uttrycktvarde` ∈ {Max, Min, Exakt} — whether the number is a ceiling, a floor or an
//   exact requirement. ⚠ It is NOT a closed codelist: there is no `/vd/uttrycktvarde` endpoint
//   (the API serves nine other värdedomäner and not this one), and across all 3,707 rows the
//   served values include the dirt `'00'` ×10, `'0,0'` ×29, `'00-00'` ×2, `'Mellan'` ×2,
//   `'0,0/0,0/…'` ×1 and — the interesting one — **`'MIn'` ×2, a casing typo of `Min`**: 46 of
//   the 271 non-null values, 17.0%, are not a sense token at all. Restricted to the 908 in-force
//   rows it is CLEAN ({null: 824, Exakt: 22, Min: 34, Max: 28}) and all 83 rows below carry a
//   well-formed token. So the field is carried VERBATIM and never used to decide anything;
//   §6.E's "a value outside a closed state codelist MUST throw" does NOT apply to it, because it
//   is not one. That distinction is measured, not assumed — see `SE_PBK_CLOSED_VALUE_DOMAINS`.
//
// ── WHAT THIS MODULE DOES NOT DO ──────────────────────────────────────────────────────────────
// It does NOT hold a single Swedish parcel's number, and it never will: the catalogue defines
// provisions, the DETALJPLAN instance carries the values, and the detaljplan service is
// credential-gated (sePlanProvider.ts). Every rule this vocabulary founds is therefore a tier-6
// UNKNOWN — deliberately, and counted. UNKNOWN ≠ 0 ≠ unlimited ≠ no-restriction (control 9).

import { fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import {
    SE_PBK_PINNED_RELEASE_ID,
    buildSePbkProvisionInReleaseUrl,
    buildSePbkProvisionUrl,
    buildSePbkValueDomainUrl,
    seBoverketGetJson,
    type SeBoverketDeps,
} from './seBoverketClient.js';

/**
 * One imported provision definition. Every field except `parameter`/`unit` is Boverket's own
 * string, unaltered; `parameter`/`unit` are the §J `vocabulary: RuleVocabularyMapping` seat — the
 * ONE place a national code becomes a canonical name, authored per-code and reviewed against the
 * served formulering, never derived by parsing Swedish prose at runtime.
 */
export interface SePlanProvision {
    /** `bestammelsekod` — the national key. Unique across the 908 in-force rows (verified). */
    readonly kod: string;
    /** The catalogue's own stable UUID for the provision. */
    readonly uuid: string;
    /** Canonical parameter name emitted into `RuleProvenance.parameter`. */
    readonly parameter: string;
    /** Unit, or null for dimensionless (storey counts, slope ratios). */
    readonly unit: string | null;
    /** `uttrycktvarde` VERBATIM — Max | Min | Exakt here; see the header on why it is not closed. */
    readonly sense: string | null;
    /**
     * How many `[…:decimaltal]` slots the formulering carries. **2 means the value CANNOT fit a
     * scalar seat** — the two `lutning` provisions express a slope as `l1:l2`, two numbers. Those
     * rows stay UNKNOWN even once the plan instance is reachable; the mapper says so in the note.
     */
    readonly numericSlots: number;
    /** `anvandningsform` VERBATIM (Kvartersmark | Allmän plats | Planområdet …). */
    readonly anvandningsform: string;
    /** `kategori` VERBATIM. */
    readonly kategori: string;
    /** `underkategori` VERBATIM. */
    readonly underkategori: string;
    /** `beteckning` VERBATIM — the map symbol pattern (`e#`, `h#`, `o#`), or null. */
    readonly beteckning: string | null;
    /** `borjargalla`, sliced to `YYYY-MM-DD` — the catalogue's own in-force date FOR THE PROVISION. */
    readonly borjargalla: string;
    /** `bestammelseformulering` VERBATIM — the drafting template, slots included. */
    readonly formulering: string;
}

/**
 * The 83 in-force numeric provisions, imported verbatim. Ordered by `kod` (the generator sorts;
 * a stable order makes a Boverket diff readable).
 */
export const SE_NUMERIC_PROVISIONS: readonly SePlanProvision[] = [
    {
        kod: 'DP_AP_Eg_UtformAP_Dagv_Fordroj',
        uuid: 'c5f5779a-ad58-4d19-99af-913124d90af5',
        parameter: 'stormwaterDetentionVolume',
        unit: 'm3',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Allmän plats',
        kategori: 'Utformning av allmän plats',
        underkategori: 'Utformning av områden för dagvatten',
        beteckning: 'fördröjning#',
        borjargalla: '2020-10-01',
        formulering:
            'Fördröjningsmagasin för dagvatten med en volym av [volym:decimaltal] m³[text:text]',
    },
    {
        kod: 'DP_AP_Eg_UtformAP_Dagv_VatmarkYta',
        uuid: '730a41f8-a758-4b0c-8fe7-82f551e01283',
        parameter: 'constructedWetlandArea',
        unit: 'm2',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Allmän plats',
        kategori: 'Utformning av allmän plats',
        underkategori: 'Utformning av områden för dagvatten',
        beteckning: 'våtmark#',
        borjargalla: '2020-10-01',
        formulering:
            'Anlagd våtmark med en yta av [yta:decimaltal] m²[text:text]',
    },
    {
        kod: 'DP_AP_Eg_UtformAP_Mark_GenomslappligProc',
        uuid: '0befe6c5-32a4-40d3-bc2c-6c4b48f81fb6',
        parameter: 'minPermeableSurfacePercentOfGround',
        unit: '%',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Allmän plats',
        kategori: 'Utformning av allmän plats',
        underkategori: 'Markens utformning',
        beteckning: 'genomsläpplig#',
        borjargalla: '2020-10-01',
        formulering:
            'Minst [procent:decimaltal] % av marken ska vara genomsläpplig.',
    },
    {
        kod: 'DP_AP_Eg_UtformAP_Mark_MinstLutning',
        uuid: 'eb525331-691b-4b86-bf86-c6b76980e6c4',
        parameter: 'minGroundSlopeRatio',
        unit: null,
        sense: 'Min',
        numericSlots: 2,
        anvandningsform: 'Allmän plats',
        kategori: 'Utformning av allmän plats',
        underkategori: 'Markens utformning',
        beteckning: null,
        borjargalla: '2021-10-14',
        formulering:
            'Minsta lutning är [lutning1:decimaltal]:[lutning2:decimaltal]. (Pilen pekar uppåt)',
    },
    {
        kod: 'DP_AP_Eg_UtformAP_Mark_Minushojd',
        uuid: 'b69b283b-2b0a-47fa-8f35-2010bb83856a',
        parameter: 'exactGroundLevelBelowDatum',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Allmän plats',
        kategori: 'Utformning av allmän plats',
        underkategori: 'Markens utformning',
        beteckning: null,
        borjargalla: '2025-12-01',
        formulering:
            'Markens höjd under nollplanet ska vara - [höjd:decimaltal] meter.',
    },
    {
        kod: 'DP_AP_Eg_UtformAP_Mark_Plushojd',
        uuid: '9e2d6352-1bdd-45ea-a0ae-44ec4dfe946a',
        parameter: 'exactGroundLevelAboveDatum',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Allmän plats',
        kategori: 'Utformning av allmän plats',
        underkategori: 'Markens utformning',
        beteckning: null,
        borjargalla: '2020-10-01',
        formulering:
            'Markens höjd över nollplanet ska vara [höjd:decimaltal] meter.',
    },
    {
        kod: 'DP_AP_Eg_UtformAP_Mark_StorstLutning',
        uuid: '5a3f1510-d9ff-4e37-ac35-7496fb21e3e7',
        parameter: 'maxGroundSlopeRatio',
        unit: null,
        sense: 'Max',
        numericSlots: 2,
        anvandningsform: 'Allmän plats',
        kategori: 'Utformning av allmän plats',
        underkategori: 'Markens utformning',
        beteckning: null,
        borjargalla: '2020-10-01',
        formulering:
            'Största lutning är [lutning1:decimaltal]:[lutning2:decimaltal]. (Pilen pekar uppåt)',
    },
    {
        kod: 'DP_AP_Eg_UtformAP_SkyddStorning_BullerskyddHojdNollplan',
        uuid: 'a9a01dc9-5ead-48d5-8b5a-e75df4201713',
        parameter: 'noiseBarrierHeightAboveDatum',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Allmän plats',
        kategori: 'Utformning av allmän plats',
        underkategori: 'Skydd mot störningar',
        beteckning: '[beteckning:text]#',
        borjargalla: '2020-10-01',
        formulering:
            '[bullerskydd:text] med en höjd av [höjd:decimaltal] meter över nollplanet.',
    },
    {
        kod: 'DP_AP_Eg_UtformAP_SkyddStorning_VallHojdNollplan',
        uuid: 'caaca924-d33a-4174-82fa-706e6e0b490e',
        parameter: 'bermHeightAboveDatum',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Allmän plats',
        kategori: 'Utformning av allmän plats',
        underkategori: 'Skydd mot störningar',
        beteckning: '[beteckning:text]#',
        borjargalla: '2020-10-01',
        formulering:
            '[vall:text] med en höjd av [höjd:decimaltal] meter över nollplanet[text:text]',
    },
    {
        kod: 'DP_AP_Eg_UtformAP_SkyddStorning_VatmarkYta',
        uuid: '13b4141a-5b37-4ee9-9466-ebffa8f1e2ac',
        parameter: 'constructedWetlandArea',
        unit: 'm2',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Allmän plats',
        kategori: 'Utformning av allmän plats',
        underkategori: 'Skydd mot störningar',
        beteckning: 'våtmark#',
        borjargalla: '2020-10-01',
        formulering:
            'Anlagd våtmark med en yta av [yta:decimaltal] m²[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Fastighetsstorlek_Minsta_Minsta',
        uuid: '1917c314-cc54-4a86-b757-106f1759ada5',
        parameter: 'minPlotArea',
        unit: 'm2',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Fastighetsstorlek',
        underkategori: 'Minsta fastighetsstorlek',
        beteckning: 'd#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta fastighetsstorlek är [storlek:decimaltal] m²',
    },
    {
        kod: 'DP_KM_Eg_Fastighetsstorlek_Storsta_Storsta',
        uuid: 'b27eed0c-e78b-408f-9cb6-0821a9ce4168',
        parameter: 'maxPlotArea',
        unit: 'm2',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Fastighetsstorlek',
        underkategori: 'Största fastighetsstorlek',
        beteckning: 'd#',
        borjargalla: '2020-10-01',
        formulering:
            'Största fastighetsstorlek är [storlek:decimaltal] m².',
    },
    {
        kod: 'DP_KM_Eg_Hojd_ExaktHojd_ByggnadsverkNockhojd',
        uuid: 'c75d2895-d32e-49e1-b7db-89dcacf211bd',
        parameter: 'exactRidgeHeight',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Exakt höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Nockhöjden på [byggnadsverk:text] ska vara [höjd:decimaltal] meter[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Hojd_ExaktHojd_ByggnadsverkNockhojdNollplan',
        uuid: 'd57c772b-4b0e-47ce-8b12-dbf3d93ed1b1',
        parameter: 'exactRidgeHeightAboveDatum',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Exakt höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Nockhöjden på [byggnadsverk:text] ska vara [höjd:decimaltal] meter över angivet nollplan[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Hojd_ExaktHojd_ByggnadsverkTotalhojd',
        uuid: '9fa1ff51-5225-4e28-bfc8-fbb08b18b7bd',
        parameter: 'exactTotalHeight',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Exakt höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Totalhöjden på [byggnadsverk:text] ska vara [höjd:decimaltal] meter[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Hojd_ExaktHojd_ByggnadsverkTotalhojdNollplan',
        uuid: 'f603baef-cdd0-4bfc-9d92-5174134e7f8e',
        parameter: 'exactTotalHeightAboveDatum',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Exakt höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Totalhöjden på [byggnadsverk:text] ska vara [höjd:decimaltal] meter över angivet nollplan[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Hojd_ExaktHojd_ExaktVan_Aldre',
        uuid: 'fa74d0ef-f7af-4c87-8742-e1a1da386618',
        parameter: 'exactStoreys',
        unit: null,
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Exakt höjd på byggnadsverk',
        beteckning: '[romerska siffror:text]',
        borjargalla: '2025-12-01',
        formulering:
            'Antal våningar är angivet som [antal:decimaltal]. Bestämmelsen har inte tolkats [orsak:text].',
    },
    {
        kod: 'DP_KM_Eg_Hojd_ExaktHojd_Nockhojd',
        uuid: '52b553a6-c8e9-4f6c-bd14-c2e5ac02154b',
        parameter: 'exactRidgeHeight',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Exakt höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Nockhöjden ska vara [höjd:decimaltal] meter.',
    },
    {
        kod: 'DP_KM_Eg_Hojd_ExaktHojd_NockhojdNollplan',
        uuid: '95e928d1-1b13-47f2-acb5-02155a48f32a',
        parameter: 'exactRidgeHeightAboveDatum',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Exakt höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Nockhöjden ska vara [höjd:decimaltal] meter över angivet nollplan.',
    },
    {
        kod: 'DP_KM_Eg_Hojd_ExaktHojd_Totalhojd',
        uuid: 'a5ef2959-3959-498b-9da5-eee3d022d78d',
        parameter: 'exactTotalHeight',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Exakt höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Totalhöjden ska vara [höjd:decimaltal] meter.',
    },
    {
        kod: 'DP_KM_Eg_Hojd_ExaktHojd_TotalhojdNollplan',
        uuid: 'f820a1d5-25e1-4fd0-9dfc-288d45092837',
        parameter: 'exactTotalHeightAboveDatum',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Exakt höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Totalhöjden ska vara [höjd:decimaltal] meter över angivet nollplan.',
    },
    {
        kod: 'DP_KM_Eg_Hojd_HogstaHojd_ByggnadsverkNockhojd',
        uuid: '2ecd7d4e-1c26-494b-9f4e-5f33c753a715',
        parameter: 'maxRidgeHeight',
        unit: 'm',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Högsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Högsta nockhöjd på [byggnadsverk:text] är [höjd:decimaltal] meter[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Hojd_HogstaHojd_ByggnadsverkNockhojdNollplan',
        uuid: '5313b947-b6d2-4500-bd6b-1b365cc8e6ec',
        parameter: 'maxRidgeHeightAboveDatum',
        unit: 'm',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Högsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Högsta nockhöjd på [byggnadsverk:text] är [höjd:decimaltal] meter över angivet nollplan[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Hojd_HogstaHojd_ByggnadsverkTotalhojd',
        uuid: '1256e958-fbb9-44c1-8f68-74e4bddf9f6e',
        parameter: 'maxTotalHeight',
        unit: 'm',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Högsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Högsta totalhöjd på [byggnadsverk:text] är [höjd:decimaltal] meter[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Hojd_HogstaHojd_ByggnadsverkTotalhojdNollplan',
        uuid: 'a6990493-b450-4350-a402-eb913e4a9c50',
        parameter: 'maxTotalHeightAboveDatum',
        unit: 'm',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Högsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Högsta totalhöjd på [byggnadsverk:text] är [höjd:decimaltal] meter över angivet nollplan[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Hojd_HogstaHojd_HogstaVan_Aldre',
        uuid: 'd1f3a149-c107-4b4f-8304-bdd98e609467',
        parameter: 'maxStoreys',
        unit: null,
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Högsta höjd på byggnadsverk',
        beteckning: '[romerska siffror:text]',
        borjargalla: '2025-12-01',
        formulering:
            'Högsta antal våningar är angivet som [antal:decimaltal]. Bestämmelsen har inte tolkats [orsak:text].',
    },
    {
        kod: 'DP_KM_Eg_Hojd_HogstaHojd_Nockhojd',
        uuid: 'ee5f8de3-89b0-479a-a5cb-7439d40623e8',
        parameter: 'maxRidgeHeight',
        unit: 'm',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Högsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Högsta nockhöjd är [höjd:decimaltal] meter.',
    },
    {
        kod: 'DP_KM_Eg_Hojd_HogstaHojd_NockhojdNollplan',
        uuid: '912a1a73-ad9d-418d-9ffd-19ecb2cc9c7f',
        parameter: 'maxRidgeHeightAboveDatum',
        unit: 'm',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Högsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Högsta nockhöjd är [höjd:decimaltal] meter över angivet nollplan.',
    },
    {
        kod: 'DP_KM_Eg_Hojd_HogstaHojd_Totalhojd',
        uuid: '05c9ec9d-65e2-4a64-a711-3fde76f1c4f8',
        parameter: 'maxTotalHeight',
        unit: 'm',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Högsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Högsta totalhöjd är [höjd:decimaltal] meter.',
    },
    {
        kod: 'DP_KM_Eg_Hojd_HogstaHojd_TotalhojdNollplan',
        uuid: 'd40b2afb-55ce-4882-b785-9a854be62feb',
        parameter: 'maxTotalHeightAboveDatum',
        unit: 'm',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Högsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Högsta totalhöjd är [höjd:decimaltal] meter över angivet nollplan.',
    },
    {
        kod: 'DP_KM_Eg_Hojd_LagstaHojd_ByggnadsverkNockhojd',
        uuid: 'aa31639b-0ce2-4aec-a2d2-040c400575f2',
        parameter: 'minRidgeHeight',
        unit: 'm',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Lägsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Lägsta nockhöjd på [byggnadsverk:text] är [höjd:decimaltal] meter[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Hojd_LagstaHojd_ByggnadsverkNockhojdNollplan',
        uuid: '8be846d2-de33-4724-b1d8-05939d84c09c',
        parameter: 'minRidgeHeightAboveDatum',
        unit: 'm',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Lägsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Lägsta nockhöjd på [byggnadsverk:text] är [höjd:decimaltal] meter över angivet nollplan[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Hojd_LagstaHojd_ByggnadsverkTotalhojd',
        uuid: '6c0c5eac-688d-4cc4-8bf3-6c27c75a69df',
        parameter: 'minTotalHeight',
        unit: 'm',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Lägsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Lägsta totalhöjd på [byggnadsverk:text] är [höjd:decimaltal] meter[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Hojd_LagstaHojd_ByggnadsverkTotalhojdNollplan',
        uuid: '8402aeed-d8da-4267-9564-e17f47165bff',
        parameter: 'minTotalHeightAboveDatum',
        unit: 'm',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Lägsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Lägsta totalhöjd på [byggnadsverk:text] är [höjd:decimaltal] meter över angivet nollplan[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Hojd_LagstaHojd_LagstaVan_Aldre',
        uuid: '0bfbaf29-07fa-42c9-877a-b0f793cfca6a',
        parameter: 'minStoreys',
        unit: null,
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Lägsta höjd på byggnadsverk',
        beteckning: '[romerska siffror:text]',
        borjargalla: '2025-12-01',
        formulering:
            'Lägsta antal våningar är angivet som [antal:decimaltal]. Bestämmelsen har inte tolkats [orsak:text].',
    },
    {
        kod: 'DP_KM_Eg_Hojd_LagstaHojd_Nockhojd',
        uuid: 'e14f0324-1664-49c6-852c-9a9c7a8ad657',
        parameter: 'minRidgeHeight',
        unit: 'm',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Lägsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Lägsta nockhöjd är [höjd:decimaltal] meter.',
    },
    {
        kod: 'DP_KM_Eg_Hojd_LagstaHojd_NockhojdNollplan',
        uuid: '471dd94e-31d7-444f-bb38-b3c476f427b2',
        parameter: 'minRidgeHeightAboveDatum',
        unit: 'm',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Lägsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Lägsta nockhöjd är [höjd:decimaltal] meter över angivet nollplan.',
    },
    {
        kod: 'DP_KM_Eg_Hojd_LagstaHojd_Totalhojd',
        uuid: '9c330d09-156a-4f99-a1c7-279fbacae516',
        parameter: 'minTotalHeight',
        unit: 'm',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Lägsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Lägsta totalhöjd är [höjd:decimaltal] meter.',
    },
    {
        kod: 'DP_KM_Eg_Hojd_LagstaHojd_TotalhojdNollplan',
        uuid: '56a27a4c-7341-4439-99b5-33cd0630ade1',
        parameter: 'minTotalHeightAboveDatum',
        unit: 'm',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Lägsta höjd på byggnadsverk',
        beteckning: 'h#',
        borjargalla: '2020-10-01',
        formulering:
            'Lägsta totalhöjd är [höjd:decimaltal] meter över angivet nollplan.',
    },
    {
        kod: 'DP_KM_Eg_MarkensAnordOchVeg_MarkensGenomslapp_Fastigh',
        uuid: 'f184f1bc-f181-450f-988d-3d9ae0b39964',
        parameter: 'minPermeableSurfacePercentOfPlot',
        unit: '%',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Markens anordnande och vegetation',
        underkategori: 'Markens genomsläpplighet',
        beteckning: 'n#',
        borjargalla: '2025-12-01',
        formulering:
            'Minst [procent:decimaltal] % av fastighetsarean ska vara genomsläpplig.',
    },
    {
        kod: 'DP_KM_Eg_MarkensAnordOchVeg_MarkensGenomslapp_Proc',
        uuid: '3227bd09-cb15-4846-a8d6-15909fe39527',
        parameter: 'minPermeableSurfacePercentOfGround',
        unit: '%',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Markens anordnande och vegetation',
        underkategori: 'Markens genomsläpplighet',
        beteckning: 'n#',
        borjargalla: '2025-12-01',
        formulering:
            'Minst [procent:decimaltal] % av marken ska vara genomsläpplig.',
    },
    {
        kod: 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_EjHogreAn',
        uuid: 'd9565cf4-f206-4017-941a-0f10d6539323',
        parameter: 'maxGroundLevelAboveDatum',
        unit: 'm',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Markens anordnande och vegetation',
        underkategori: 'Markförhållanden',
        beteckning: 'n#',
        borjargalla: '2020-10-01',
        formulering:
            'Markens höjd får inte vara högre än [höjd:decimaltal] meter över nollplanet.',
    },
    {
        kod: 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_EjLagreAn',
        uuid: '291393ff-4cbe-47de-8b84-0b1aa6fe3664',
        parameter: 'minGroundLevelAboveDatum',
        unit: 'm',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Markens anordnande och vegetation',
        underkategori: 'Markförhållanden',
        beteckning: 'n#',
        borjargalla: '2020-10-01',
        formulering:
            'Markens höjd får inte vara lägre än [höjd:decimaltal] meter över nollplanet.',
    },
    {
        kod: 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_MarkhojdNollplan',
        uuid: 'ecd36c78-0b55-4133-a458-ee9f6af9bb9c',
        parameter: 'exactGroundLevelAboveDatum',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Markens anordnande och vegetation',
        underkategori: 'Markförhållanden',
        beteckning: null,
        borjargalla: '2020-10-01',
        formulering:
            'Markens höjd över nollplanet ska vara [höjd:decimaltal] meter.',
    },
    {
        kod: 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_MinstaLutning',
        uuid: '2d0d4d7b-aa84-45cc-9436-4b43cbf59c23',
        parameter: 'minGroundSlopeRatio',
        unit: null,
        sense: 'Min',
        numericSlots: 2,
        anvandningsform: 'Kvartersmark',
        kategori: 'Markens anordnande och vegetation',
        underkategori: 'Markförhållanden',
        beteckning: null,
        borjargalla: '2021-10-14',
        formulering:
            'Minsta lutning är [lutning1:decimaltal]:[lutning2:decimaltal]. (Pilen pekar uppåt)',
    },
    {
        kod: 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_MinushojdNollplan',
        uuid: '37e6b947-e73a-4f5f-b8ee-f8796e278513',
        parameter: 'exactGroundLevelBelowDatum',
        unit: 'm',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Markens anordnande och vegetation',
        underkategori: 'Markförhållanden',
        beteckning: null,
        borjargalla: '2025-12-01',
        formulering:
            'Markens höjd under nollplanet ska vara - [höjd:decimaltal] meter.',
    },
    {
        kod: 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_StorstaLutning',
        uuid: 'cbf4d270-077d-47ac-9544-1527b37d9796',
        parameter: 'maxGroundSlopeRatio',
        unit: null,
        sense: 'Max',
        numericSlots: 2,
        anvandningsform: 'Kvartersmark',
        kategori: 'Markens anordnande och vegetation',
        underkategori: 'Markförhållanden',
        beteckning: null,
        borjargalla: '2020-10-01',
        formulering:
            'Största lutning är [lutning1:decimaltal]:[lutning2:decimaltal]. (Pilen pekar uppåt)',
    },
    {
        kod: 'DP_KM_Eg_Markreservat_GC_FriHojd',
        uuid: 'c5d7c36d-0d06-476d-8ea8-c7086fdeb284',
        parameter: 'minClearHeightForPublicPassage',
        unit: 'm',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Markreservat för allmännyttiga ändamål',
        underkategori: 'Gång- och cykeltrafik',
        beteckning: 'x#',
        borjargalla: '2020-10-01',
        formulering:
            'Markreservat för allmännyttig gång- och cykeltrafik till en fri höjd av [hojd:decimaltal] meter.',
    },
    {
        kod: 'DP_KM_Eg_Plac_Byggnadsverk_Fastgrans',
        uuid: 'c9a54186-c6df-430f-91a3-0cae757273ec',
        parameter: 'minSetbackFromPlotBoundary',
        unit: 'm',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Placering',
        underkategori: 'Placering av byggnadsverk',
        beteckning: 'p#',
        borjargalla: '2020-10-01',
        formulering:
            'Byggnad ska placeras minst [avstånd:decimaltal] meter från fastighetsgräns[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Takvinkel_Exakt_Byggnad',
        uuid: '213777e6-2c38-4d06-bcef-8eb92ff0c004',
        parameter: 'exactRoofPitch',
        unit: 'deg',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Takvinkel',
        underkategori: 'Exakt takvinkel',
        beteckning: 'o#',
        borjargalla: '2020-10-01',
        formulering:
            'Takvinkeln för [byggnad:text] ska vara [takvinkel:decimaltal] grader.',
    },
    {
        kod: 'DP_KM_Eg_Takvinkel_Exakt_Exakt',
        uuid: '46605299-5161-4c6f-90c0-2e2d39a9a7d1',
        parameter: 'exactRoofPitch',
        unit: 'deg',
        sense: 'Exakt',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Takvinkel',
        underkategori: 'Exakt takvinkel',
        beteckning: 'o#',
        borjargalla: '2020-10-01',
        formulering:
            'Takvinkeln ska vara [takvinkel:decimaltal] grader.',
    },
    {
        kod: 'DP_KM_Eg_Takvinkel_Minsta_Byggnad',
        uuid: 'da687c50-b1bb-477e-9fe6-a7615c8902f4',
        parameter: 'minRoofPitch',
        unit: 'deg',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Takvinkel',
        underkategori: 'Minsta takvinkel',
        beteckning: 'o#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta takvinkel för [byggnad:text] är [takvinkel:decimaltal] grader.',
    },
    {
        kod: 'DP_KM_Eg_Takvinkel_Minsta_Minsta',
        uuid: '397c2c74-c408-4a0a-8fd1-3fae9d93816e',
        parameter: 'minRoofPitch',
        unit: 'deg',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Takvinkel',
        underkategori: 'Minsta takvinkel',
        beteckning: 'o#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta takvinkel är [takvinkel:decimaltal] grader.',
    },
    {
        kod: 'DP_KM_Eg_Takvinkel_Storsta_Byggnad',
        uuid: '1c84c2e3-1ff2-4688-a00b-81aae8b58f35',
        parameter: 'maxRoofPitch',
        unit: 'deg',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Takvinkel',
        underkategori: 'Största takvinkel',
        beteckning: 'o#',
        borjargalla: '2020-10-01',
        formulering:
            'Största takvinkel för [byggnad:text] är [takvinkel:decimaltal] grader.',
    },
    {
        kod: 'DP_KM_Eg_Takvinkel_Storsta_Storsta',
        uuid: '411d8c8f-2356-4a24-a342-4777592555f6',
        parameter: 'maxRoofPitch',
        unit: 'deg',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Takvinkel',
        underkategori: 'Största takvinkel',
        beteckning: 'o#',
        borjargalla: '2020-10-01',
        formulering:
            'Största takvinkel är [takvinkel:decimaltal] grader.',
    },
    {
        kod: 'DP_KM_Eg_Utforande_Schaktningsniva_LagstaSchaktNollplan',
        uuid: '97d72322-b6e9-4a99-ae8a-3ad9b257c39a',
        parameter: 'minExcavationLevelAboveDatum',
        unit: 'm',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utförande',
        underkategori: 'Schaktningsnivå',
        beteckning: 'b#',
        borjargalla: '2020-10-01',
        formulering:
            'Lägsta schaktningsnivå är [djup:decimaltal] meter över nollplanet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_AreaPerByggnad_MinstaBruttoKvm',
        uuid: 'ce468fd3-71cd-4fca-bbe8-6ebc27167135',
        parameter: 'minGrossFloorAreaPerBuilding',
        unit: 'm2',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Area per byggnad',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta bruttoarea är [exploatering:decimaltal] m² per [typ av byggnad:text]',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_AreaPerByggnad_MinstaByggnadsKvm',
        uuid: '38af0aa0-02ac-4122-a002-8969613102b2',
        parameter: 'minBuildingAreaPerBuilding',
        unit: 'm2',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Area per byggnad',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta byggnadsarea är [exploatering:decimaltal] m² per [typ av byggnad:text]',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_AreaPerByggnad_StorstaBruttoKvm',
        uuid: '35d39010-6095-4dcf-888b-7231779a45fa',
        parameter: 'maxGrossFloorAreaPerBuilding',
        unit: 'm2',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Area per byggnad',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största bruttoarea är [exploatering:decimaltal] m² per [typ av byggnad:text]',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_AreaPerByggnad_StorstaByggnadsKvm',
        uuid: 'dc4c4b93-5135-4dc0-9ca9-108b686db3a9',
        parameter: 'maxBuildingAreaPerBuilding',
        unit: 'm2',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Area per byggnad',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största byggnadsarea är [exploatering:decimaltal] m² per [typ av byggnad:text]',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_AreaUnderMark_MinstaKvm',
        uuid: 'c5f4ab35-709b-4510-9547-899f05b029d8',
        parameter: 'minGrossFloorAreaBelowGround',
        unit: 'm2',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Area under mark',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta bruttoarea under mark är [exploatering:decimaltal] m²[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_AreaUnderMark_StorstaKvm',
        uuid: '252e91bf-9831-4088-a585-fd857a720c97',
        parameter: 'maxGrossFloorAreaBelowGround',
        unit: 'm2',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Area under mark',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största bruttoarea under mark är [exploatering:decimaltal] m²[text:text]',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_MinstaAreaKvm_BruttoAnv',
        uuid: 'e57d366c-a15e-4038-aae7-95604da6ba34',
        parameter: 'minGrossFloorArea',
        unit: 'm2',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Minsta area i kvm',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta bruttoarea är [exploatering:decimaltal] m² inom användningsområdet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_MinstaAreaKvm_BruttoFastigh',
        uuid: '48641d04-4019-46de-a89d-d3e8cfcb071d',
        parameter: 'minGrossFloorArea',
        unit: 'm2',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Minsta area i kvm',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta bruttoarea är [exploatering:decimaltal] m² per fastighet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_MinstaAreaKvm_BruttoKvm',
        uuid: '071b045f-21e6-4424-bf6b-3e773acbcbd6',
        parameter: 'minGrossFloorArea',
        unit: 'm2',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Minsta area i kvm',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta bruttoarea är [exploatering:decimaltal] m².',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_MinstaAreaKvm_Byggnads',
        uuid: '6738fad8-e33f-4048-9ab6-f784f2234bc9',
        parameter: 'minBuildingArea',
        unit: 'm2',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Minsta area i kvm',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta byggnadsarea är [exploatering:decimaltal] m².',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_MinstaAreaKvm_ByggnadsAnv',
        uuid: 'd73978ba-c550-4c7c-8dce-5b73511d2775',
        parameter: 'minBuildingArea',
        unit: 'm2',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Minsta area i kvm',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta byggnadsarea är [exploatering:decimaltal] m² inom användningsområdet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_MinstaAreaKvm_ByggnadsFastigh',
        uuid: 'c7ff8199-2d8f-4bcd-be4a-2ad78ba2979f',
        parameter: 'minBuildingArea',
        unit: 'm2',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Minsta area i kvm',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta byggnadsarea är [exploatering:decimaltal] m² per fastighet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_MinstaAreaProc_BruttoAnv',
        uuid: 'ca81bd6c-b632-4434-8f9e-6d1208a1b234',
        parameter: 'minGrossFloorAreaPercent',
        unit: '%',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Minsta area i procent',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta bruttoarea är [utnyttjandegrad:decimaltal] % av fastighetsarean inom användningsområdet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_MinstaAreaProc_BruttoEgen',
        uuid: 'c1b59bb3-6711-48d5-8e92-bec3b471a5f7',
        parameter: 'minGrossFloorAreaPercent',
        unit: '%',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Minsta area i procent',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta bruttoarea är [utnyttjandegrad:decimaltal] % av fastighetsarean inom egenskapsområdet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_MinstaAreaProc_ByggnadsAnv',
        uuid: 'ee3dd030-67d0-477d-a380-c099aac6d851',
        parameter: 'minBuildingAreaPercent',
        unit: '%',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Minsta area i procent',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta byggnadsarea är [utnyttjandegrad:decimaltal] % av fastighetsarean inom användningsområdet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_MinstaAreaProc_ByggnadsEgen',
        uuid: '2480118e-5fdf-48ca-84dd-1396a1aef4e6',
        parameter: 'minBuildingAreaPercent',
        unit: '%',
        sense: 'Min',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Minsta area i procent',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Minsta byggnadsarea är [utnyttjandegrad:decimaltal] % av fastighetsarean inom egenskapsområdet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_StorstaAreaKvm_Brutto',
        uuid: '270259e9-afad-4aa7-ba88-f9580bc1e926',
        parameter: 'maxGrossFloorArea',
        unit: 'm2',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Största area i kvm',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största bruttoarea är [exploatering:decimaltal] m².',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_StorstaAreaKvm_BruttoAnv',
        uuid: 'c0d19d33-d378-4a5b-ba20-53c57069c2ca',
        parameter: 'maxGrossFloorArea',
        unit: 'm2',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Största area i kvm',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största bruttoarea är [exploatering:decimaltal] m² inom användningsområdet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_StorstaAreaKvm_BruttoFastigh',
        uuid: 'ecef161f-dd5b-488c-a3f3-c9759a3d5a63',
        parameter: 'maxGrossFloorArea',
        unit: 'm2',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Största area i kvm',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största bruttoarea är [exploatering:decimaltal] m² per fastighet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_StorstaAreaKvm_Byggnadsarea',
        uuid: '2bd7f01b-ac79-45b4-a24d-093620e7e2f2',
        parameter: 'maxBuildingArea',
        unit: 'm2',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Största area i kvm',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största byggnadsarea är [exploatering:decimaltal] m².',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_StorstaAreaKvm_ByggnadsareaAnv',
        uuid: '27303a9a-6a4b-40e7-b284-8df8fa9e8d43',
        parameter: 'maxBuildingArea',
        unit: 'm2',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Största area i kvm',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största byggnadsarea är [exploatering:decimaltal] m² inom användningsområdet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_StorstaAreaKvm_ByggnadsareaFastigh',
        uuid: '4d971f5d-eb6f-4ca0-b20d-8d7005a9c617',
        parameter: 'maxBuildingArea',
        unit: 'm2',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Största area i kvm',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största byggnadsarea är [exploatering:decimaltal] m² per fastighet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_StorstaAreaProc_BruttoAnv',
        uuid: 'e0cc2964-bba0-4fe4-bbfa-defe13672303',
        parameter: 'maxGrossFloorAreaPercent',
        unit: '%',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Största area i procent',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största bruttoarea är [utnyttjandegrad:decimaltal] % av fastighetsarean inom användningsområdet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_StorstaAreaProc_BruttoEgen',
        uuid: '0b56d2a9-dd02-4318-84cc-36d6402fcabd',
        parameter: 'maxGrossFloorAreaPercent',
        unit: '%',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Största area i procent',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största bruttoarea är [utnyttjandegrad:decimaltal] % av fastighetsarean inom egenskapsområdet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_StorstaAreaProc_ByggnadsAnv',
        uuid: '37cfed89-1786-4c31-a3f1-6d9d1fa4cc20',
        parameter: 'maxBuildingAreaPercent',
        unit: '%',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Största area i procent',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största byggnadsarea är [utnyttjandegrad:decimaltal] % av fastighetsarean inom användningsområdet.',
    },
    {
        kod: 'DP_KM_Eg_Utnytt_StorstaAreaProc_ByggnadsEgen',
        uuid: '1c38a293-b48c-4572-a4a7-5a5d27697ea1',
        parameter: 'maxBuildingAreaPercent',
        unit: '%',
        sense: 'Max',
        numericSlots: 1,
        anvandningsform: 'Kvartersmark',
        kategori: 'Utnyttjandegrad',
        underkategori: 'Största area i procent',
        beteckning: 'e#',
        borjargalla: '2020-10-01',
        formulering:
            'Största byggnadsarea är [utnyttjandegrad:decimaltal] % av fastighetsarean inom egenskapsområdet.',
    },
    {
        kod: 'DP_PO_Eg_Hojd_ExaktHojd_ExaktVan_Aldre',
        uuid: '243dca27-ffa9-4fc9-a297-8caeeef5abe4',
        parameter: 'exactStoreys',
        unit: null,
        sense: null,
        numericSlots: 1,
        anvandningsform: 'Planområdet',
        kategori: 'Höjd på byggnadsverk',
        underkategori: 'Exakt höjd på byggnadsverk',
        beteckning: '-',
        borjargalla: '2025-12-01',
        formulering:
            'Antal våningar är angivet som [antal:decimaltal]. Bestämmelsen har inte tolkats [orsak:text].',
    },
];

/**
 * The independent census the 83 rows are counted AGAINST (acceptance: "tier-6 UNKNOWNs visible
 * and counted against an independent census of the source"). Every number here was measured by
 * grep/count over the LIVE 13,176,663-byte release on 2026-09-01 — transcript 05 — not derived
 * from the table above. A test asserts the table's own length against `numericInForce`, so the
 * import and the census can never quietly disagree.
 */
export const SE_PBK_CENSUS = {
    releaseId: SE_PBK_PINNED_RELEASE_ID,
    releaseName: '20251201',
    releasePublished: '2025-12-01',
    /** Every bestämmelse in release 7, in force or retired, back to 1949. */
    totalProvisions: 3707,
    /** `slutargalla === null`. */
    inForce: 908,
    /** In force AND carrying at least one `[…:decimaltal]` slot — the set imported above. */
    numericInForce: 83,
    /** In force with NO numeric slot — prose/geometry provisions, counted and NOT imported. */
    nonNumericInForce: 825,
    /** In force, by bestämmelsetyp. Administrativ/Övergångs are all retired in this release. */
    inForceByType: { Egenskapsbestämmelse: 678, Användningsbestämmelse: 230 },
    /**
     * `uttrycktvarde` across ALL 3,707 rows — the dirt census that proves it is not a codelist.
     * `MIn` is a casing typo of `Min` in the national catalogue (reported, not corrected here).
     */
    senseAcrossAllReleases: {
        null: 3436,
        Max: 90,
        Min: 76,
        Exakt: 59,
        '0,0': 29,
        '00': 10,
        '00-00': 2,
        MIn: 2,
        Mellan: 2,
        '0,0/0,0/…': 1,
    },
    /** `uttrycktvarde` restricted to the 908 in-force rows — clean, four values. */
    senseInForce: { null: 824, Min: 34, Max: 28, Exakt: 22 },
    /**
     * `uttrycktvarde` across the 83 IMPORTED rows. ⚠ ONE of them is null, and it is a genuine
     * served asymmetry rather than dirt: `DP_PO_Eg_Hojd_ExaktHojd_ExaktVan_Aldre` (Planområdet,
     * storey count, interpretation provision) carries NO sense token, while its Kvartersmark twin
     * `DP_KM_Eg_Hojd_ExaktHojd_ExaktVan_Aldre` carries `Exakt`. Same wording, same category, one
     * of the pair unfilled. Recorded rather than defaulted — assuming `Exakt` from the sibling
     * would be inventing a sense the state did not serve (control 9's neighbour: an UNFILLED
     * QUALIFIER is not the sibling's qualifier).
     */
    senseAcrossImported: { Min: 34, Max: 28, Exakt: 20, null: 1 },
    /** The one imported row Boverket serves no `uttrycktvarde` for. */
    importedWithoutSense: 'DP_PO_Eg_Hojd_ExaktHojd_ExaktVan_Aldre',
} as const;

/**
 * The värdedomäner Boverket serves as CLOSED codelists — each has its own `/vd/{domain}` endpoint,
 * so a served value outside the list is a national schema change and MUST throw rather than be
 * absorbed (E7-family conventions §6.E R2). Values recorded from the live endpoints 2026-09-01;
 * the id↔namn pairing was verified against all 3,707 rows with ZERO mismatches in all five.
 *
 * ⚠ `uttrycktvarde` is DELIBERATELY ABSENT from this table — there is no `/vd/uttrycktvarde`
 * endpoint, and the dirt census above shows why pretending otherwise would be wrong.
 */
export const SE_PBK_CLOSED_VALUE_DOMAINS: Readonly<Record<string, readonly string[]>> = Object.freeze({
    bestammelsetyp: Object.freeze([
        'Användningsbestämmelse',
        'Egenskapsbestämmelse',
        'Administrativ bestämmelse',
        'Övergångsbestämmelse',
    ]),
    anvandningsform: Object.freeze([
        'Allmän plats',
        'Kvartersmark',
        'Byggnadskvarter',
        'Specialområde',
        'Vattenområde',
        'Planområdet',
    ]),
    geometrityp: Object.freeze(['Punkt', 'Linje', 'Yta/Volym']),
    huvudmannaskap: Object.freeze(['Kommunalt', 'Enskilt']),
    lagstod: Object.freeze(['PBL (2010:900)']),
    releasetyp: Object.freeze(['Juridisk', 'Teknisk']),
});

/**
 * Provision lookup by `bestammelsekod`. Built once at module load; a duplicate key is a BUILD
 * error naming both rows rather than a last-one-wins overwrite (the table is generated, but a
 * hand-edit is exactly when this bites).
 */
export const SE_PROVISIONS_BY_KOD: ReadonlyMap<string, SePlanProvision> = (() => {
    const m = new Map<string, SePlanProvision>();
    for (const p of SE_NUMERIC_PROVISIONS) {
        const prev = m.get(p.kod);
        if (prev !== undefined) {
            throw new Error(
                `[se-catalogue] duplicate bestammelsekod '${p.kod}' (uuid ${prev.uuid} and ` +
                    `${p.uuid}) — the national key must be unique across the imported set`,
            );
        }
        m.set(p.kod, p);
    }
    return m;
})();

/** Provision lookup by Boverket UUID — the key the single-provision endpoint is addressed by. */
export const SE_PROVISIONS_BY_UUID: ReadonlyMap<string, SePlanProvision> = (() => {
    const m = new Map<string, SePlanProvision>();
    for (const p of SE_NUMERIC_PROVISIONS) m.set(p.uuid, p);
    return m;
})();

/* ─────────────────────────── pure parsing (served row → typed) ────────────────────────── */

function str(o: Record<string, unknown>, key: string): string | null {
    const v = o[key];
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s === '' ? null : s;
}

/**
 * PURE: one FLAT `/bestammelse/platt/...` body → the fields this adapter reads, or null when the
 * body is not a provision object. Returns the SERVED shape, deliberately NOT `SePlanProvision`:
 * the served row has no `parameter`/`unit` (those are the adapter's mapping seat), and conflating
 * "what Boverket said" with "what we decided it means" is how a vocabulary stops being verbatim.
 */
export interface SeServedProvisionRow {
    readonly kod: string;
    readonly uuid: string;
    readonly formulering: string;
    readonly sense: string | null;
    readonly anvandningsform: string | null;
    readonly kategori: string | null;
    readonly underkategori: string | null;
    readonly beteckning: string | null;
    /** `YYYY-MM-DD`, sliced from the served local-naive stamp; null when unserved. */
    readonly borjargalla: string | null;
    /** `YYYY-MM-DD`, or null = still in force (the catalogue's own "no end" encoding). */
    readonly slutargalla: string | null;
    readonly bestammelsetyp: string | null;
    readonly tolkningsbestammelse: boolean | null;
}

export function parseSeServedProvisionRow(raw: unknown): SeServedProvisionRow | null {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const kod = str(o, 'bestammelsekod');
    const uuid = str(o, 'id');
    const formulering = str(o, 'bestammelseformulering');
    if (kod === null || uuid === null || formulering === null) return null;
    const born = str(o, 'borjargalla');
    const died = str(o, 'slutargalla');
    const tolk = o['tolkningsbestammelse'];
    return {
        kod,
        uuid,
        formulering,
        sense: str(o, 'uttrycktvarde'),
        anvandningsform: str(o, 'anvandningsform'),
        kategori: str(o, 'kategori'),
        underkategori: str(o, 'underkategori'),
        beteckning: str(o, 'beteckning'),
        borjargalla: born === null ? null : born.slice(0, 10),
        slutargalla: died === null ? null : died.slice(0, 10),
        bestammelsetyp: str(o, 'bestammelsetyp'),
        tolkningsbestammelse: typeof tolk === 'boolean' ? tolk : null,
    };
}

/**
 * PURE: assert a served värdedomän value against the CLOSED list, or throw naming both. This is
 * §6.E R2's "a value outside a closed state codelist is a national schema change and MUST throw"
 * — it exists so a Boverket vocabulary change surfaces as a named build/runtime failure instead
 * of being absorbed into a rule as an unrecognised string.
 */
export function assertSeClosedDomainValue(domain: string, value: string): string {
    const allowed = SE_PBK_CLOSED_VALUE_DOMAINS[domain];
    if (allowed === undefined) {
        throw new Error(
            `[se-catalogue] '${domain}' is not one of Boverket's closed värdedomäner ` +
                `(${Object.keys(SE_PBK_CLOSED_VALUE_DOMAINS).join(', ')}) — do not assert against ` +
                'a list the state does not publish (uttrycktvarde is the measured example)',
        );
    }
    if (!allowed.includes(value)) {
        throw new Error(
            `[se-catalogue] värdedomän '${domain}' served '${value}', which is outside the closed ` +
                `list [${allowed.join(' | ')}] recorded from ${buildSePbkValueDomainUrl(domain)} on ` +
                '2026-09-01. That is a national schema change, not a value to absorb — re-probe ' +
                'the endpoint and update SE_PBK_CLOSED_VALUE_DOMAINS in one edit.',
        );
    }
    return value;
}

/* ─────────────────────────── live resolvers (Boverket, keyless) ───────────────────────── */

/**
 * Resolve ONE provision definition from the live catalogue and check it against the imported
 * table. This is the adapter's LIVE leg — the only Swedish national service PRYZM can reach
 * without credentials today.
 *
 * The comparison is the point: it is the drift guard for a vocabulary that lives in TypeScript
 * against a source that republishes. A served row whose `bestammelsekod` or `formulering` differs
 * from the import comes back TRANSIENT and names both strings, rather than silently preferring
 * either one.
 */
export async function resolveSeProvisionByUuid(
    uuid: string,
    deps: SeBoverketDeps = {},
    releaseId: number | null = null,
): Promise<FetchOutcome<SeServedProvisionRow>> {
    const url =
        releaseId === null
            ? buildSePbkProvisionUrl(uuid)
            : buildSePbkProvisionInReleaseUrl(releaseId, uuid);
    const outcome = await seBoverketGetJson(url, `bestammelse uuid=${uuid}`, deps);
    if (outcome.status !== 'found') return outcome;
    const row = parseSeServedProvisionRow(outcome.value);
    if (row === null) {
        return fetchTransient(
            `upstream-failed: ${url} answered 200 with a body that is not a provision object`,
        );
    }
    return fetchFound(row);
}

/**
 * The drift check, as its own PURE function so a test can run it without the network: does the
 * served row still say what the imported table says? Returns null when they agree, else the
 * human-readable disagreement.
 */
export function seProvisionDrift(
    imported: SePlanProvision,
    served: SeServedProvisionRow,
): string | null {
    if (imported.kod !== served.kod) {
        return `bestammelsekod: imported '${imported.kod}', served '${served.kod}'`;
    }
    if (imported.formulering !== served.formulering) {
        return `formulering for '${imported.kod}': imported '${imported.formulering}', served '${served.formulering}'`;
    }
    if (imported.sense !== served.sense) {
        return `uttrycktvarde for '${imported.kod}': imported '${imported.sense}', served '${served.sense}'`;
    }
    if (imported.borjargalla !== served.borjargalla) {
        return `borjargalla for '${imported.kod}': imported '${imported.borjargalla}', served '${served.borjargalla}'`;
    }
    if (served.slutargalla !== null) {
        return `'${imported.kod}' is no longer in force: Boverket now serves slutargalla '${served.slutargalla}'`;
    }
    return null;
}
