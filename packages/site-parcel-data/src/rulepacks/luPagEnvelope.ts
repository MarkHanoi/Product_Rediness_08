// LANE LU-ENVELOPE (2026-09-03) — LUXEMBOURG (LU) · PAG `PAG_PAG_NQ_PAP` degré-d'utilisation
// coefficients (COS / CUS / CSS / DL) → buildable-envelope COMPILED FACTS. The COMPILE leg of the
// gap-master's "one flip from a consume win" LU verdict (region-central-eu.md LUXEMBOURG row;
// CENSUS.md row 12), on the `plPogEnvelope.ts` pattern — with the one honesty that makes
// Luxembourg DIFFERENT from Poland and Denmark stated up front:
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ IN LUXEMBOURG, **NOTHING BINDS**. All four coefficients are COMPILED FACTS, WITHHELD.
// ═════════════════════════════════════════════════════════════════════════════════════════════
// PL binds height because `maksWysokoscZabudowy` is an absolute metric cap — denominator-free.
// DK binds FAR at parcel scope because BR18 lets `bebyggelsesprocent` be parcel-denominated.
// Luxembourg serves NO height, NO setbacks, NO storeys (measured across all 27 GPKG tables —
// `luSources.ts`), and every number it DOES serve is a ratio or density over a denominator that
// is NOT the cadastral parcel (statutory definitions verbatim in `luRuleMapper.ts`, Annexe II of
// the RGD 08/03/2017 "contenu du PAG"):
//
//   COS (occupation)   = emprise au sol   ÷ terrain à bâtir NET        → NOT the parcel (C63)
//   CUS (utilisation)  = weighted GFA     ÷ terrain à bâtir BRUT       → NOT the parcel (C63),
//                        and the NUMERATOR is NON-LINEAR (5–10 m storeys ×2, >10 m ×3): even
//                        denominated correctly, CUS × area bounds WEIGHTED floor area, not GFA.
//   CSS (scellement)   = surface scellée  ÷ terrain à bâtir NET        → NOT the parcel (C63)
//   DL  (densité log.) = dwelling units   ÷ terrain à bâtir BRUT (ha)  → NOT the parcel, and not
//                        an envelope axis at all (a programme density, not a solid).
//
// `terrain à bâtir brut/net` are PLANNING constructs whose areas the PAG does not publish
// (`LU_TERRAIN_A_BATIR_DEFINITIONS`), so multiplying ANY of the four by a cadastral parcel area
// is the C63 Aarhus denominator trap in a Luxembourgish accent — every field parses clean and
// the answer is wrong. AND Art. 26 (RGD 08/03/2017) makes each value a ZONE AVERAGE that
// individual lots may lawfully EXCEED (`LU_NORMATIVE_FORCE`, verbatim) — so even a
// denominator-resolved value is not a per-parcel cap without a signed conservative reading.
//
// ⇒ This module therefore feeds `computeBuildableEnvelope` a `ZoningRecord` whose
// `structuredFields` carry NO number at all: the engine honestly resolves `status: 'none'`
// ("no zoning data resolved — no envelope") and DRAWS NOTHING, which can never overstate. The
// four coefficients travel as CITED FACTS on the resolution + the `ordinanceRef`, never as
// engine numbers. The A.5 rung this lands on is the gap-master's own: "footprint derived
// (the NQ-PAP zone polygon exists); vertical extent unresolved."
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE FLIP POINTS — three, EACH named, so the day one lands ONE branch changes visibly
// ═════════════════════════════════════════════════════════════════════════════════════════════
//   F1 DENOMINATOR — a served `terrain à bâtir net`/`brut` AREA (or the PAP lotissement geometry
//      that determines it) would let COS/CSS bind against the NET area and CUS against the BRUT
//      area — never against the cadastral parcel. Nothing served today carries either area.
//   F2 ART. 26 — even after F1, the values are zone AVERAGES lots may exceed; publishing them as
//      per-lot caps is a legal reading a FOUNDER must sign (conservative direction: a cap a lot
//      may exceed UNDER-states — safe, but it is a determination PRYZM would be inventing).
//   F3 THE SIGNATURE — `LU_PAG_CERTIFIED` below. Scribe-not-signatory (L-449): this pack may
//      never flip its own gate. Until a recorded human signature exists, the pack REFUSES BY
//      NAME to present any coefficient as binding (see `LU_PAG_UNCERTIFIED_CAVEAT`).
//
// ⚠ THIS IS NOT THE "HAND-WRITTEN LU RULE PACK" THE E5 VERDICT STOP-BUILT. E5's stop-build was a
// pack that TRANSCRIBES ordinance values by hand ("the GPKG IS the rule pack"). This module
// transcribes nothing: it COMPILES the state-served GPKG/WFS columns (the same numbers
// `luRuleMapper.ts` emits as SiteIntelRules) into the envelope-record shape, carrying the
// state's own values verbatim with their statutory addresses. The mapping — not any value — is
// what the F3 signature would certify.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE LIVE CHANNEL — measured 2026-09-03, and it SUPERSEDES (for THIS host) the E7-LU reading
// ═════════════════════════════════════════════════════════════════════════════════════════════
// E7-LU (2026-09-01) probed `wfs.geoportail.lu` (dead host) + the opendata WMS (no PAG layer) and
// concluded "NO LIVE QUERY SERVICE EXISTS" — true of the hosts probed. LANE LU-ENVELOPE probed
// the INSPIRE host the LU-PARCEL lane found for parcels, and the PAG coefficients ARE served
// LIVE there: `https://wms.inspire.geoportail.lu/geoserver/wfs`, typeName `lu:LU.SpatialPlan.PAG`
// (WFS 2.0.0, keyless), DescribeFeatureType carries TYPED columns `cos_max` (double), `cos_min`
// (float), `css_max` (double), `cus_max`/`cus_min`, `dl_max` (float), `dl_min` (⚠ xsd:short — a
// lossier type than the GPKG REAL), `denomination`, `num_cadast`, `xtf_id`, `nom_fichier_ec`,
// `geom`. Live GetFeature 2026-09-03: `cos_max > 0 AND nom_fichier_ec LIKE '026%'` (Ville de
// Luxembourg = commune C026) → numberMatched **129**; zone `ze.PAG_PAG_NQ_PAP_539`
// (xtf_id a13bb15a-0239-4f8e-a6c5-2eaa800a0b4e) served COS_MAX 0.3 / CUS_MAX 0.3 / CSS_MAX 0.5 /
// DL_MAX 30 with a WGS84 polygon and a legislationcitation naming the RGD du 28 juillet 2011
// (the 2011-régime PAG content regulation — the ancestor of the 2017 RGD whose Annexe II this
// module cites; both define the same four coefficients). Transcript:
// `audit/demo-esfrpt/2026-09-02/transcripts/lu-envelope/`; recorded fixture (sha-pinned):
// `__tests__/fixtures/lu-c026/wfs-nqpap-zone-539-recorded-live-2026-09-03.json` and
// `tools/ga-gate/corpus/never-overstate/lu-pag-c026-zone-539.json`.
// ⚠ NO new source row is minted here: the module is PURE (no endpoint constant, no fetch). The
// migration of the WFS channel into the LU source registry row is recorded for the orchestrator
// in the lane findings (`lane-lu-envelope.md` §"registry follow-up") — never two rows.
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. Pure data + arithmetic.
// Re-parsed through the L0 `ZoningRecordSchema` at record build (a malformed clone throws).
//
// Strategic context — region-central-eu.md LUXEMBOURG; census-west.md LU row; C58 §1.2/§1.4;
// C63 (denominator honesty); L-449; luRuleMapper.ts (the statutory quotations, verbatim);
// memories: c63-denominator-is-buildable-land, envelope-solid-overstates-partial-data.

import { ZoningRecordSchema, type ZoningRecord } from '@pryzm/schemas';
// Leaf imports, never the `countryAdapters/lu/index.js` barrel (§SCC-no-barrel-access).
import {
    LU_COEFFICIENT_VOCABULARY,
    LU_NORMATIVE_FORCE,
    LU_TERRAIN_A_BATIR_DEFINITIONS,
    LU_VALUE_BASIS_SCHEME,
    classifyLuCoefficient,
    type LuCoefficientKind,
    type LuCoefficientVocabularyEntry,
} from '../countryAdapters/lu/luRuleMapper.js';
import { LU_PAG_SOURCE_ID } from '../countryAdapters/lu/luSources.js';
import type { LuNqPapRow } from '../countryAdapters/lu/luPagGpkgClient.js';

/** The national jurisdiction id — equal to the id the LU parcel/rules legs already carry. */
export const LU_PAG_JURISDICTION_ID = 'lu';

/** A stable zone code for a compiled NQ-PAP record (the layer IS the zone class, art. 37 ACDU). */
export const LU_PAG_DEFAULT_ZONE_CODE = 'LU-PAG-NQ';

/**
 * ⛔ THE L-449 PUBLICATION GATE — BORN SHUT, `signature: null` in `l449CertificationGates.ts`.
 *
 * What a signature here would certify is the MAPPING of the state-served COS/CUS/CSS/DL columns
 * onto the envelope vocabulary (compiled facts, each with its statutory denominator named) — the
 * gap-master's named "ONE unblock" for Luxembourg. What a signature would NOT do:
 *   • it cannot supply the `terrain à bâtir` areas the state does not serve (flip point F1) —
 *     signed or not, no coefficient may bind against a cadastral parcel area;
 *   • it cannot repeal Art. 26 (flip point F2) — the values stay zone averages lots may exceed.
 * A model may flip this constant's VALUE only together with a dereferenceable human signature
 * recorded in the L-449 registry — scribe-not-signatory; the Madrid defect is the precedent.
 */
export const LU_PAG_CERTIFIED = false;

/** The caveat every resolution carries while the gate is shut — the refusal, BY NAME. */
export const LU_PAG_UNCERTIFIED_CAVEAT =
    'LU_PAG_CERTIFIED = false — no founder signature exists over the COS/CUS/CSS/DL → envelope ' +
    'mapping (L-449, scribe-not-signatory). Until one is recorded in l449CertificationGates.ts, ' +
    'these coefficients are CITED FACTS only and refuse by name to be read as caps.';

/**
 * The compile citation carried on every resolution — the statutory basis + the denominator
 * doctrine, in one string a consumer can print.
 */
export const LU_PAG_ENVELOPE_REF =
    'PAG degré d’utilisation du sol (COS/CUS/CSS/DL), served as typed columns of the national ' +
    'PAG artefact layer PAG_PAG_NQ_PAP (Ministère des Affaires intérieures; "Géométries de tous ' +
    'les PAG «version 2011» en vigueur", CC0) and live via the INSPIRE WFS ' +
    'lu:LU.SpatialPlan.PAG. Definitions: RGD du 8 mars 2017 (contenu du PAG), Annexe II — ' +
    'Terminologie du degré d’utilisation du sol; values fixed under Art. 26. ⛔ NOTHING BINDS: ' +
    'COS/CSS are ratios over the terrain à bâtir NET and CUS/DL over the terrain à bâtir BRUT ' +
    '(neither is the cadastral parcel, neither is served as an area — C63 denominator), the CUS ' +
    'numerator is non-linear (5–10 m storeys ×2, >10 m ×3), Art. 26 makes every value a zone ' +
    'AVERAGE individual lots may exceed, and no height/setback/storey axis is served at all. ' +
    'Each coefficient is a compiled, cited FACT — withheld from the binding multiply.';

/* ───────────────────────────── the compile input ──────────────────────── */

/**
 * The raw NQ-PAP coefficient cells this module consumes — from the GPKG row
 * (`luPagFieldsFromNqPapRow`), the live INSPIRE WFS feature (`luPagFromInspireWfsFeature`), or a
 * recorded fixture. Values verbatim as served; `null` = the cell was not served.
 */
export interface LuPagFields {
    readonly cosMax: number | null;
    readonly cosMin: number | null;
    readonly cusMax: number | null;
    readonly cusMin: number | null;
    readonly cssMax: number | null;
    readonly dlMax: number | null;
    readonly dlMin: number | null;
}

/** The identity context one compiled zone carries — every part verbatim as served, or null. */
export interface LuPagCitation {
    /** Commune code (`'C026'`), or null when the channel did not serve one. */
    readonly communeCode: string | null;
    /** The zone's DENOMINATION (a name, NOT unique), or null. */
    readonly zoneDenomination: string | null;
    /** The INTERLIS transfer id — the ONLY key measured unique. REQUIRED. */
    readonly xtfId: string;
    /** The INSPIRE local id (`'ze.PAG_PAG_NQ_PAP_539'`) when served by the WFS channel, or null. */
    readonly inspireLocalId: string | null;
    /** Partie-écrite filename (`'026_PE_NQ'`) — a filename, never a retrievable URL. Or null. */
    readonly partieEcriteFilename: string | null;
    /** The legislation citation the CHANNEL ITSELF served (the WFS names the RGD 28/07/2011), or null. */
    readonly servedLegislationCitation: string | null;
    /** Which served channel the cells came from. */
    readonly channel: 'bulk-gpkg' | 'inspire-wfs';
}

/**
 * Why a compiled coefficient does not bind. ⚠ ALWAYS present on every fact — that is the whole
 * Luxembourg point: there is no reason value meaning "binds".
 */
export type LuPagWithheldReason =
    /** ratio over the terrain à bâtir NET — a planning construct, not the parcel, area not served (C63). */
    | 'denominator-terrain-a-batir-net'
    /** ratio/density over the terrain à bâtir BRUT — same class of construct, same C63 refusal. */
    | 'denominator-terrain-a-batir-brut'
    /** the register served NULL for this cell. UNKNOWN ≠ 0 ≠ unlimited (E4 control 9). */
    | 'not-published'
    /** the register served 0 — measured to be BOTH a real value and an unfilled slot nationally,
     *  with nothing served separating the two populations (luRuleMapper header census). */
    | 'served-zero-indistinguishable'
    /** the served value breaches the statutory domain (negative, or COS/CSS > 1) — refused, never clipped. */
    | 'domain-breach';

/** One compiled coefficient: the served value as a FACT (or null), plus why it does not bind. */
export interface LuPagCompiledFact {
    readonly abbreviation: 'COS' | 'CUS' | 'CSS' | 'DL';
    /** The full statutory term, verbatim French. */
    readonly statutoryTerm: string;
    /** The value as a FACT when the cell classified `value`; null otherwise. NEVER an engine number. */
    readonly fact: number | null;
    /** The raw served cell, verbatim (null / 0 / the breach value included). */
    readonly raw: number | null;
    /** How the cell classified (the luRuleMapper classifier — one authority). */
    readonly kind: LuCoefficientKind;
    /** ⚠ Always non-null — nothing binds in Luxembourg. */
    readonly withheldReason: LuPagWithheldReason;
    /** The statutory denominator clause, verbatim from Annexe II. */
    readonly denominatorClause: string;
    /** R2 `valueBasis.code` — the SERVED statutory denominator term (from the ONE vocabulary). */
    readonly valueBasisCode: string;
    /** Unit, or null for a dimensionless ratio. */
    readonly unit: string | null;
}

/**
 * The resolved LU envelope contribution: four compiled maxima facts (each withheld with its
 * reason), the served minima as facts, and the honesty metadata. NEVER throws.
 */
export interface LuPagEnvelopeResolution {
    /** COS_MAX — coefficient d’occupation du sol (coverage-like, over terrain à bâtir NET). */
    readonly coverage: LuPagCompiledFact;
    /** CUS_MAX — coefficient d’utilisation du sol (weighted-FAR-like, over terrain à bâtir BRUT). */
    readonly weightedFar: LuPagCompiledFact;
    /** CSS_MAX — coefficient de scellement du sol (soil sealing, over terrain à bâtir NET). */
    readonly soilSealing: LuPagCompiledFact;
    /** DL_MAX — densité de logement (dwellings/ha of terrain à bâtir BRUT; not an envelope axis). */
    readonly dwellingDensity: LuPagCompiledFact;
    /** Served minima carried as facts (obligations tighten, never relax; zero/null → null here). */
    readonly minima: {
        readonly cosMin: number | null;
        readonly cusMin: number | null;
        readonly dlMin: number | null;
    };
    /** Mirrors `LU_PAG_CERTIFIED` — read from the constant, never restated as a literal. */
    readonly certified: boolean;
    /** The assembled citation (zone identity + channel + statutory basis). */
    readonly citation: string;
    /** R2 — the statutory terminology scheme + the denominator codes actually present. */
    readonly valueBasis: { readonly scheme: string; readonly codes: readonly string[] };
    /** Human derivation for the facts row. */
    readonly why: string;
    /** Conditions a consumer MUST state — never silent. */
    readonly caveats: readonly string[];
}

/* ───────────────────────────── pure helpers ───────────────────────────── */

function vocabularyEntry(
    column: LuCoefficientVocabularyEntry['column'],
): LuCoefficientVocabularyEntry {
    const e = LU_COEFFICIENT_VOCABULARY.find((x) => x.column === column);
    if (e === undefined) {
        // Unreachable while LU_COEFFICIENT_VOCABULARY stays total over the seven columns; a
        // missing entry is a vocabulary regression and must be loud, never a silent null.
        throw new Error(`lu-pag-envelope: no vocabulary entry for column '${column}'`);
    }
    return e;
}

function denominatorReason(abbreviation: 'COS' | 'CUS' | 'CSS' | 'DL'): LuPagWithheldReason {
    return abbreviation === 'COS' || abbreviation === 'CSS'
        ? 'denominator-terrain-a-batir-net'
        : 'denominator-terrain-a-batir-brut';
}

function compileFact(
    column: 'cosMax' | 'cusMax' | 'cssMax' | 'dlMax',
    raw: number | null,
): LuPagCompiledFact {
    const entry = vocabularyEntry(column);
    const classified = classifyLuCoefficient(raw, entry);
    const withheldReason: LuPagWithheldReason =
        classified.kind === 'value'
            ? denominatorReason(entry.abbreviation)
            : classified.kind === 'unknown-absent'
              ? 'not-published'
              : classified.kind === 'unknown-zero'
                ? 'served-zero-indistinguishable'
                : 'domain-breach';
    return {
        abbreviation: entry.abbreviation,
        statutoryTerm: entry.statutoryTerm,
        fact: classified.value,
        raw: classified.raw,
        kind: classified.kind,
        withheldReason,
        denominatorClause: entry.denominatorClause,
        valueBasisCode: entry.valueBasisCode,
        unit: entry.unit,
    };
}

/** A served minimum: kept as a fact ONLY when it classified `value` (zero/null → null, E4 c9). */
function minimumFact(column: 'cosMin' | 'cusMin' | 'dlMin', raw: number | null): number | null {
    return classifyLuCoefficient(raw, vocabularyEntry(column)).value;
}

/** Extract the compile input from a typed GPKG `PAG_PAG_NQ_PAP` row. Pure, total. */
export function luPagFieldsFromNqPapRow(row: LuNqPapRow): LuPagFields {
    return {
        cosMax: row.cosMax,
        cosMin: row.cosMin,
        cusMax: row.cusMax,
        cusMin: row.cusMin,
        cssMax: row.cssMax,
        dlMax: row.dlMax,
        dlMin: row.dlMin,
    };
}

/** Extract the citation context from a typed GPKG row. Pure, total. */
export function luPagCitationFromNqPapRow(row: LuNqPapRow): LuPagCitation {
    return {
        communeCode: row.codeCom,
        zoneDenomination:
            row.denomination !== null && row.denomination.trim() !== '' ? row.denomination : null,
        xtfId: row.xtfId,
        inspireLocalId: null,
        partieEcriteFilename: row.nomFichierEc,
        servedLegislationCitation: null,
        channel: 'bulk-gpkg',
    };
}

function finiteOrNull(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function nonEmptyOrNull(v: unknown): string | null {
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * PURE: one live INSPIRE-WFS GeoJSON feature (`lu:LU.SpatialPlan.PAG`) → the compile input +
 * citation, or null when the feature carries no `xtf_id` (the only unique key — a feature
 * without it is not addressable and is refused rather than given a synthetic identity).
 *
 * The WFS flattening serves the commune code only INSIDE `gml_description` (a JSON string of the
 * source row); it is parsed defensively — a malformed description yields `communeCode: null`,
 * never a throw and never a guess.
 */
export function luPagFromInspireWfsFeature(
    feature: unknown,
): { readonly fields: LuPagFields; readonly citation: LuPagCitation } | null {
    if (feature === null || typeof feature !== 'object') return null;
    const props = (feature as Record<string, unknown>)['properties'];
    if (props === null || typeof props !== 'object') return null;
    const p = props as Record<string, unknown>;
    const xtfId = nonEmptyOrNull(p['xtf_id']);
    if (xtfId === null) return null;

    let communeCode: string | null = null;
    let descDenomination: string | null = null;
    const desc = p['gml_description'];
    if (typeof desc === 'string') {
        try {
            const parsed = JSON.parse(desc) as unknown;
            if (parsed !== null && typeof parsed === 'object') {
                const d = parsed as Record<string, unknown>;
                communeCode = nonEmptyOrNull(d['CODE_COM']);
                descDenomination = nonEmptyOrNull(d['DENOMINATION']);
            }
        } catch {
            // A malformed description is a fact about the channel, not a refusal of the feature.
        }
    }
    return {
        fields: {
            cosMax: finiteOrNull(p['cos_max']),
            cosMin: finiteOrNull(p['cos_min']),
            cusMax: finiteOrNull(p['cus_max']),
            cusMin: finiteOrNull(p['cus_min']),
            cssMax: finiteOrNull(p['css_max']),
            dlMax: finiteOrNull(p['dl_max']),
            dlMin: finiteOrNull(p['dl_min']),
        },
        citation: {
            communeCode,
            zoneDenomination: nonEmptyOrNull(p['denomination']) ?? descDenomination,
            xtfId,
            inspireLocalId: nonEmptyOrNull(p['inspireid_identifier_localid']),
            partieEcriteFilename: nonEmptyOrNull(p['nom_fichier_ec']),
            servedLegislationCitation: nonEmptyOrNull(
                p['legislationcitation_legislationcitation_name'],
            ),
            channel: 'inspire-wfs',
        },
    };
}

function assembleCitation(citation: LuPagCitation): string {
    const zonePart =
        citation.zoneDenomination !== null
            ? `zone ${citation.zoneDenomination} (xtf_id ${citation.xtfId})`
            : `zone xtf_id ${citation.xtfId}`;
    const idPart = citation.inspireLocalId !== null ? ` [${citation.inspireLocalId}]` : '';
    const communePart =
        citation.communeCode !== null ? `commune ${citation.communeCode}` : 'commune UNRESOLVED';
    const pePart =
        citation.partieEcriteFilename !== null
            ? `partie écrite ${citation.partieEcriteFilename} (a filename, not a URL)`
            : 'no partie-écrite filename served';
    const served =
        citation.servedLegislationCitation !== null
            ? ` · channel-served legislation: ${citation.servedLegislationCitation}`
            : '';
    return (
        `${zonePart}${idPart} · ${communePart} · ${pePart} · channel ${citation.channel}` +
        `${served} · ${LU_PAG_ENVELOPE_REF}`
    );
}

/* ───────────────────────────── the resolver ───────────────────────────── */

/**
 * Resolve the LU envelope contribution from one NQ-PAP zone's served cells. PURE, deterministic,
 * never throws. Every coefficient compiles to a cited FACT with a withhold reason; NONE binds
 * (see the header — denominator + Art. 26 + the shut L-449 gate, each a separate refusal).
 */
export function resolveLuPagEnvelope(
    fields: LuPagFields,
    citation: LuPagCitation,
): LuPagEnvelopeResolution {
    const coverage = compileFact('cosMax', fields.cosMax);
    const weightedFar = compileFact('cusMax', fields.cusMax);
    const soilSealing = compileFact('cssMax', fields.cssMax);
    const dwellingDensity = compileFact('dlMax', fields.dlMax);
    const minima = {
        cosMin: minimumFact('cosMin', fields.cosMin),
        cusMin: minimumFact('cusMin', fields.cusMin),
        dlMin: minimumFact('dlMin', fields.dlMin),
    };

    const caveats: string[] = [];
    const factCaveat = (f: LuPagCompiledFact): void => {
        if (f.fact !== null) {
            const denom =
                f.withheldReason === 'denominator-terrain-a-batir-net'
                    ? LU_TERRAIN_A_BATIR_DEFINITIONS.net
                    : LU_TERRAIN_A_BATIR_DEFINITIONS.brut;
            caveats.push(
                `${f.abbreviation}_MAX ${f.fact}${f.unit !== null ? ` ${f.unit}` : ''} is a FACT ` +
                    `and does NOT bind: ${f.denominatorClause}. The denominator (${denom}) is a ` +
                    'planning construct whose area is NOT served — multiplying by a cadastral ' +
                    'parcel area is the C63 denominator trap.',
            );
        } else if (f.kind === 'unknown-absent') {
            caveats.push(
                `${f.abbreviation}_MAX was served as NULL — UNKNOWN ≠ 0 ≠ unlimited ≠ ` +
                    'no-restriction (E4 control 9); no value is fabricated.',
            );
        } else if (f.kind === 'unknown-zero') {
            caveats.push(
                `${f.abbreviation}_MAX was served as 0 — measured nationally to be BOTH a real ` +
                    'zero and an unfilled slot, with nothing served separating the populations; ' +
                    'refused rather than read either way (E4 control 9).',
            );
        } else {
            caveats.push(
                `${f.abbreviation}_MAX was served as ${String(f.raw)} — outside the statutory ` +
                    'domain (a ratio of area over area cannot be negative or, for COS/CSS, exceed ' +
                    '1); refused by name, never clipped.',
            );
        }
    };
    factCaveat(coverage);
    factCaveat(weightedFar);
    factCaveat(soilSealing);
    factCaveat(dwellingDensity);

    if (weightedFar.fact !== null) {
        caveats.push(
            'CUS is NOT a plain floor-area ratio: storeys averaging 5–10 m count DOUBLE and ' +
                'those over 10 m count TRIPLE in its numerator — CUS × area bounds WEIGHTED ' +
                'floor area, not floor area.',
        );
    }
    caveats.push(
        `Art. 26 (RGD 08/03/2017), verbatim: ${LU_NORMATIVE_FORCE} — every value is a zone ` +
            'AVERAGE that individual lots may lawfully EXCEED; it is not a per-parcel cap.',
    );
    caveats.push(
        'Luxembourg serves NO max height, NO setbacks, NO storey count on this layer (measured ' +
            'across all 27 artefact tables) — the vertical axis is UNRESOLVED; this absence must ' +
            'never be read as "no height limit".',
    );
    if (minima.cosMin !== null || minima.cusMin !== null || minima.dlMin !== null) {
        caveats.push(
            `Served MINIMA (obligations, they tighten): COS_MIN ${minima.cosMin ?? 'n/a'} · ` +
                `CUS_MIN ${minima.cusMin ?? 'n/a'} · DL_MIN ${minima.dlMin ?? 'n/a'} — carried ` +
                'as facts; never presented as a relaxation of anything.',
        );
    }
    if (!LU_PAG_CERTIFIED) caveats.push(LU_PAG_UNCERTIFIED_CAVEAT);

    // R2 — the denominator codes come from the ONE vocabulary, never re-derived here.
    const codes = new Set<string>(
        [coverage, weightedFar, soilSealing, dwellingDensity].map((f) => f.valueBasisCode),
    );

    const factTxt = (f: LuPagCompiledFact): string =>
        f.fact !== null
            ? `${f.abbreviation} ${f.fact}${f.unit !== null ? ` ${f.unit}` : ''} (fact, withheld)`
            : `${f.abbreviation} ${f.kind}`;
    const why =
        `PAG NQ-PAP ${citation.zoneDenomination ?? citation.xtfId} — ` +
        `${factTxt(coverage)}; ${factTxt(weightedFar)}; ${factTxt(soilSealing)}; ` +
        `${factTxt(dwellingDensity)}. NOTHING binds (terrain-à-bâtir denominators + Art. 26 ` +
        `zone averages + no vertical axis served + LU_PAG_CERTIFIED=${String(LU_PAG_CERTIFIED)}).`;

    return {
        coverage,
        weightedFar,
        soilSealing,
        dwellingDensity,
        minima,
        certified: LU_PAG_CERTIFIED,
        citation: assembleCitation(citation),
        valueBasis: { scheme: LU_VALUE_BASIS_SCHEME, codes: [...codes].sort() },
        why,
        caveats,
    };
}

/* ───────────────────────────── the record builder ─────────────────────── */

/**
 * Build a `ZoningRecord` for one compiled NQ-PAP zone — the structured-provider shape
 * `computeBuildableEnvelope` consumes (the PL `plPogZoningRecord` analog), with the Luxembourg
 * difference made structural: `structuredFields` carries NO number at all. All four coefficients
 * are WITHHELD BY OMISSION from the numbers the engine multiplies (the C63 point), and no
 * vertical axis exists to bind — so the engine honestly resolves `status: 'none'` and draws
 * nothing, which can never overstate. The facts travel on the resolution and the `ordinanceRef`.
 *
 * Re-parsed through the L0 schema so a malformed clone fails loudly. Pure, deterministic.
 */
export function luPagZoningRecord(
    fields: LuPagFields,
    citation: LuPagCitation,
): { readonly record: ZoningRecord; readonly resolution: LuPagEnvelopeResolution } {
    const resolution = resolveLuPagEnvelope(fields, citation);
    const facts: string[] = [];
    for (const f of [
        resolution.coverage,
        resolution.weightedFar,
        resolution.soilSealing,
        resolution.dwellingDensity,
    ]) {
        if (f.fact !== null) {
            facts.push(
                `${f.abbreviation}_MAX ${f.fact}${f.unit !== null ? ` ${f.unit}` : ''} ` +
                    `(withheld — ${f.withheldReason})`,
            );
        }
    }
    const factsSuffix =
        facts.length > 0
            ? ` · compiled facts, NONE binding: ${facts.join('; ')}`
            : ' · no strictly-positive coefficient served (tier-6 UNKNOWNs; see resolution)';

    const record = ZoningRecordSchema.parse({
        zoneCode: LU_PAG_DEFAULT_ZONE_CODE,
        zoneLabel:
            `PAG NQ-PAP ${citation.zoneDenomination ?? citation.xtfId}` +
            (citation.communeCode !== null ? ` (${citation.communeCode})` : '') +
            ' — facts only, nothing binds',
        jurisdictionId: LU_PAG_JURISDICTION_ID,
        // ⛔ THE WHOLE MODULE IN ONE OBJECT: no maxHeight_m, no plotRatioFAR, no maxCoverage, no
        // maxFloors — nothing for the engine to multiply. Setbacks explicitly null (unknown ≠ 0).
        structuredFields: {
            setbacks: { front_m: null, side_m: null, rear_m: null },
        },
        ordinanceRef: `${resolution.citation}${factsSuffix}`,
        provenance: {
            source: LU_PAG_SOURCE_ID,
            label:
                'Luxembourg — PAG degré d’utilisation du sol (NQ-PAP compiled facts; nothing binds)',
            version: null,
            license: 'CC0 1.0 Universal (data.public.lu "cc-zero")',
            crs: citation.channel === 'inspire-wfs' ? 'EPSG:4326' : 'EPSG:2169',
        },
    });
    return { record, resolution };
}

/**
 * Compile one live INSPIRE-WFS feature straight to a record + resolution, or null when the
 * feature is not addressable (no xtf_id). The live-channel convenience over
 * `luPagFromInspireWfsFeature` + `luPagZoningRecord`.
 */
export function luPagZoningRecordFromInspireWfsFeature(
    feature: unknown,
): { readonly record: ZoningRecord; readonly resolution: LuPagEnvelopeResolution } | null {
    const parsed = luPagFromInspireWfsFeature(feature);
    if (parsed === null) return null;
    return luPagZoningRecord(parsed.fields, parsed.citation);
}
