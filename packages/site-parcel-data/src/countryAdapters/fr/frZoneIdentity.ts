// LANE FR-ZONEID (demo gap G3) — FRANCE (FR) · the PURE half: GPU feature bags → typed zone
// identity → the ZONE-NAMED, source-cited EnvelopeRefusal. No I/O, no clock, no RNG.
//
// THE CONTRACT OF THIS MODULE, STATED SO NOBODY EXTENDS IT WRONGLY: it produces IDENTITY and
// REFUSAL, never a number. There is deliberately NO height / emprise / setback / FAR field
// anywhere in its output — not a fillable null, but structurally absent, because the GPU does
// not publish the numeric articles (they live in the règlement PDF, the E8 French reader's
// job). Adding a numeric field here would be the L-616 overstatement seam re-opened.
//
// Field semantics are the CNIG PLU standard as MEASURED live (E8 scout 2026-09-01 ×6 cities;
// this lane 2026-09-02 Lyon/Pardines/Solignat — verbatim bags in
// __tests__/fixtures/fr-gpu-zoneid/recorded-live-2026-09-02.json):
//   • `libelle`  — the zone code (`UCe1b`, `UG`, `N`). The one field that keys everything.
//   • `libelong` — prose zone doctrine (Lyon carries a full paragraph; may be "").
//   • `typezone` — CNIG zone class (U / AU / A / N) — zone-urba only.
//   • `typesect` — CNIG sector class (carte communale) — secteur-cc only.
//   • `idurba`   — the INSTRUMENT id, `<authority>_<KIND>_<YYYYMMDD>[_suffix]`
//                  (`200046977_PLUI_20260326`, `63268_CC_20190221`).
//   • `partition`— the GPU partition (`DU_200046977`).
//   • `nomfic` / `urlfic` — règlement document name / address. NAMING ≠ ADDRESSING (E8 scout:
//                  urlfic 3/6, per-zone 1/6); the `#page=` anchor rides EITHER field.
//   • `datappro` / `datvalid` — approval / validation dates, `YYYYMMDD`-ish, often null.
//   • municipality: `insee`, `name`, `is_rnu` — the RNU flag is an ANSWER, not a gap.

import type { EnvelopeRefusal } from '@pryzm/schemas';

/* ────────────────────────────── typed identity ────────────────────────── */

/** Which GPU document layer the identity came from — different instruments, kept apart. */
export type FrZoneDocumentKind = 'zone-urba' | 'secteur-cc';

/** The instrument kind parsed off `idurba` — the closed set observed nationally (E8 ×6 + CC). */
export type FrInstrumentKind = 'PLU' | 'PLUi' | 'POS' | 'PSMV' | 'CC';

/** One identified French planning zone — the STRUCTURED identity half. Never a number. */
export interface FrZoneIdentity {
    /** Which GPU rung served it (PLU-family zone vs carte-communale sector). */
    readonly documentKind: FrZoneDocumentKind;
    /** `libelle` — the zone code (e.g. `UCe1b`). The field that names the refusal. */
    readonly zoneCode: string;
    /** `libelong` — prose zone doctrine, or null (Lyon carries a paragraph; CC rows are ""). */
    readonly zoneLabel: string | null;
    /** `typezone` — CNIG zone class (`U`/`AU`/`A`/`N`), zone-urba only, or null. */
    readonly typeZone: string | null;
    /** `typesect` — CNIG sector class code, secteur-cc only, or null. */
    readonly sectorType: string | null;
    /** `idurba` — the instrument id (e.g. `200046977_PLUI_20260326`), or null. */
    readonly idurba: string | null;
    /** The instrument kind parsed off `idurba` (PLU / PLUi / POS / PSMV / CC), or null. */
    readonly instrument: FrInstrumentKind | null;
    /** The instrument version date (ISO `YYYY-MM-DD`) parsed off `idurba`, or null. */
    readonly instrumentDate: string | null;
    /** `partition` — the GPU partition (e.g. `DU_200046977`), or null. */
    readonly partition: string | null;
    /** `nomfic` — the règlement document filename, `#page=` anchor stripped, or null. */
    readonly reglementDoc: string | null;
    /** `urlfic` — the règlement document URL, `#page=` anchor stripped, or null ("" → null). */
    readonly reglementUrl: string | null;
    /**
     * The `#page=` anchor parsed off WHICHEVER of `urlfic`/`nomfic` carries it (E8 scout:
     * Marseille rides it on urlfic, Nice on nomfic — the single most valuable field in the
     * record: it turns "find the zone in 478 pages" into "start at page 80"). Null when
     * neither field is anchored.
     */
    readonly reglementPage: number | null;
    /** `datappro` — approval date verbatim, or null. */
    readonly approvedOn: string | null;
    /** `datvalid` — validation date verbatim, or null. */
    readonly validatedOn: string | null;
    /** `gpu_doc_id` — the GPU document hash id, or null (the E8 document-resolution key). */
    readonly gpuDocId: string | null;
}

/** The GPU `municipality` answer — commune identity + the RNU flag. */
export interface FrMunicipalityStatus {
    /** `insee` — the commune code (e.g. `63422`). */
    readonly insee: string;
    /** `name` — the commune name verbatim (e.g. `SOLIGNAT`). */
    readonly name: string;
    /**
     * `is_rnu` — true when NO local document governs and the Règlement national d'urbanisme
     * applies. An ANSWER about the legal regime, never a coverage gap (lane FR-1 doctrine).
     */
    readonly isRnu: boolean;
}

/* ────────────────────────────── pure parsers ──────────────────────────── */

const asTrimmedString = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t === '' ? null : t;
};

/**
 * Parse `idurba` (`<authority>_<KIND>_<YYYYMMDD>[_suffix]`) into instrument kind + ISO date.
 * Case-insensitive on KIND (the GPU serves both `PLUI` and `PLUi` — measured). Returns nulls
 * rather than guessing on any unrecognised shape (honest withheld, never a fabricated kind).
 */
export function parseFrIdurba(idurba: string | null | undefined): {
    readonly instrument: FrInstrumentKind | null;
    readonly instrumentDate: string | null;
} {
    const id = asTrimmedString(idurba);
    if (id === null) return { instrument: null, instrumentDate: null };
    const m = id.match(/^\d+_(PLUI|PLU|POS|PSMV|CC)_(\d{4})(\d{2})(\d{2})(?!\d)/i);
    if (!m) return { instrument: null, instrumentDate: null };
    const rawKind = m[1]!.toUpperCase();
    const instrument: FrInstrumentKind =
        rawKind === 'PLUI' ? 'PLUi' : (rawKind as 'PLU' | 'POS' | 'PSMV' | 'CC');
    const month = Number(m[3]);
    const day = Number(m[4]);
    const instrumentDate =
        month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${m[2]}-${m[3]}-${m[4]}` : null;
    return { instrument, instrumentDate };
}

/**
 * Parse the `#page=N` anchor off whichever of the two document fields carries it — `urlfic`
 * first (Marseille's real per-zone address), then `nomfic` (Nice's variant). Null when absent.
 */
export function parseFrReglementPageAnchor(
    nomfic: string | null | undefined,
    urlfic: string | null | undefined,
): number | null {
    for (const field of [urlfic, nomfic]) {
        if (typeof field !== 'string') continue;
        const m = field.match(/#page=(\d+)/i);
        if (m) {
            const page = Number(m[1]);
            if (Number.isInteger(page) && page > 0) return page;
        }
    }
    return null;
}

/** Strip a `#page=` anchor from a document field; "" → null. */
const stripPageAnchor = (v: unknown): string | null => {
    const s = asTrimmedString(v);
    if (s === null) return null;
    const cut = s.replace(/#page=\d+$/i, '');
    return cut === '' ? null : cut;
};

/**
 * Parse one `zone-urba` / `secteur-cc` property bag into a typed identity, or null when the
 * bag carries no `libelle` — an identity with no zone code names nothing and is NOT minted
 * (the caller classifies an all-null answer as a mapper refusal, never a silent drop).
 */
export function parseFrGpuZoneFeature(
    documentKind: FrZoneDocumentKind,
    props: Record<string, unknown>,
): FrZoneIdentity | null {
    const zoneCode = asTrimmedString(props['libelle']);
    if (zoneCode === null) return null;
    const idurba = asTrimmedString(props['idurba']);
    const { instrument, instrumentDate } = parseFrIdurba(idurba);
    return {
        documentKind,
        zoneCode,
        zoneLabel: asTrimmedString(props['libelong']),
        typeZone: asTrimmedString(props['typezone']),
        sectorType: asTrimmedString(props['typesect']),
        idurba,
        instrument,
        instrumentDate,
        partition: asTrimmedString(props['partition']),
        reglementDoc: stripPageAnchor(props['nomfic']),
        reglementUrl: stripPageAnchor(props['urlfic']),
        reglementPage: parseFrReglementPageAnchor(
            typeof props['nomfic'] === 'string' ? props['nomfic'] : null,
            typeof props['urlfic'] === 'string' ? props['urlfic'] : null,
        ),
        approvedOn: asTrimmedString(props['datappro']),
        validatedOn: asTrimmedString(props['datvalid']),
        gpuDocId: asTrimmedString(props['gpu_doc_id']),
    };
}

/** Parse one `municipality` property bag, or null when insee/name/is_rnu are not all served. */
export function parseFrMunicipalityFeature(
    props: Record<string, unknown>,
): FrMunicipalityStatus | null {
    const insee = asTrimmedString(props['insee']);
    const name = asTrimmedString(props['name']);
    const isRnu = props['is_rnu'];
    if (insee === null || name === null || typeof isRnu !== 'boolean') return null;
    return { insee, name, isRnu };
}

/* ────────────────────────────── refusal builders ──────────────────────── */

/** One-line instrument label for headlines/facts: `PLUi 200046977_PLUI_20260326` etc. */
export function frInstrumentLabel(zone: FrZoneIdentity): string {
    const kind =
        zone.instrument ?? (zone.documentKind === 'secteur-cc' ? 'carte communale' : 'document d’urbanisme');
    return zone.idurba === null ? kind : `${kind} ${zone.idurba}`;
}

/**
 * THE ZONE-NAMED REFUSAL (the lane's deliverable): the zone identity is REAL and CITED; the
 * envelope is REFUSED because the règlement's numeric articles are not yet extracted (the E8
 * French reader). Code `no-rule-pack` — a statement about PRYZM's coverage, exactly what that
 * code means — so `legallyGrounded: false`. Never a number anywhere on the card.
 */
export function frZoneNamedRefusal(zones: readonly [FrZoneIdentity, ...FrZoneIdentity[]]): EnvelopeRefusal {
    const codes = zones.map((z) => z.zoneCode);
    const first = zones[0];
    const zoneWord = zones.length > 1 ? `Zones ${codes.join(' · ')}` : `Zone ${first.zoneCode}`;
    const docBits: string[] = [];
    if (first.reglementDoc !== null) docBits.push(first.reglementDoc);
    if (first.reglementPage !== null) docBits.push(`from page ${first.reglementPage}`);
    const knownFacts: string[] = [];
    for (const z of zones) {
        const label = z.zoneLabel === null ? '' : ` — ${z.zoneLabel.length > 140 ? `${z.zoneLabel.slice(0, 137)}…` : z.zoneLabel}`;
        knownFacts.push(
            `${z.documentKind === 'secteur-cc' ? 'Carte communale sector' : 'Planning zone'}: ${z.zoneCode}${label}`,
        );
        if (z.typeZone !== null) knownFacts.push(`Zone class (CNIG typezone): ${z.typeZone}`);
        if (z.sectorType !== null) knownFacts.push(`Sector class (CNIG typesect): ${z.sectorType}`);
        knownFacts.push(`Instrument: ${frInstrumentLabel(z)}`);
        if (z.instrumentDate !== null) knownFacts.push(`Instrument version: ${z.instrumentDate}`);
        if (z.reglementDoc !== null) {
            knownFacts.push(
                `Règlement document: ${z.reglementDoc}${z.reglementPage !== null ? ` (zone article from page ${z.reglementPage})` : ''}`,
            );
        }
        if (z.partition !== null) knownFacts.push(`GPU partition: ${z.partition}`);
    }
    return {
        code: 'no-rule-pack',
        headline: `${zoneWord} (${frInstrumentLabel(first)}) — règlement not yet extracted; no envelope asserted.`,
        detail:
            `The national Géoportail de l'urbanisme identifies this parcel's planning zone` +
            ` (${codes.join(', ')}) and its governing instrument` +
            `${first.idurba !== null ? ` (${first.idurba})` : ''}, but the numeric articles — hauteur,` +
            ` emprise au sol, retraits — live in the règlement document` +
            `${docBits.length > 0 ? ` (${docBits.join(', ')})` : ''}, which PRYZM has not yet read:` +
            ' no French règlement reader is configured (the E8 extraction spine reports' +
            ' no-reader-configured, honestly). Asserting a buildable envelope from zone identity' +
            ' alone would overstate. PRYZM names the zone and declines the number.',
        ordinanceRef:
            `Géoportail de l'urbanisme (national, Licence Ouverte/Etalab 2.0), module zone-urba/secteur-cc` +
            ` via apicarto.ign.fr — instrument ${frInstrumentLabel(first)}` +
            `${first.reglementDoc !== null ? `; règlement ${first.reglementDoc}` : ''}` +
            `${first.partition !== null ? `; partition ${first.partition}` : ''}.`,
        knownFacts,
        legallyGrounded: false,
    };
}

/**
 * THE RNU REFUSAL: the GPU municipality flag says NO local document governs — the Règlement
 * national d'urbanisme applies. That regime (constructibilité limitée outside the parties
 * urbanisées, per-case appreciation) is not encoded in PRYZM, so the refusal is about OUR
 * coverage (`no-rule-pack`, `legallyGrounded: false`) while naming the real regime.
 */
export function frRnuRefusal(mun: FrMunicipalityStatus): EnvelopeRefusal {
    return {
        code: 'no-rule-pack',
        headline: `${mun.name} (INSEE ${mun.insee}) is under the RNU — no local plan; no envelope asserted.`,
        detail:
            'The Géoportail de l\'urbanisme flags this commune is_rnu: no PLU, PLUi, POS or carte' +
            ' communale governs here — the Règlement national d\'urbanisme (Code de l\'urbanisme,' +
            ' art. L.111-1 ff.) applies instead. Under the RNU, constructibility outside the parties' +
            ' urbanisées is a per-case administrative determination that PRYZM has not encoded,' +
            ' so no envelope is asserted. This is a statement about the governing REGIME, not a data gap.',
        ordinanceRef:
            'Géoportail de l\'urbanisme (national), module municipality via apicarto.ign.fr —' +
            ` commune ${mun.name}, INSEE ${mun.insee}, is_rnu=true. Regime: Règlement national` +
            ' d\'urbanisme (Code de l\'urbanisme, art. L.111-1 ff.).',
        knownFacts: [`Commune: ${mun.name} (INSEE ${mun.insee})`, 'Planning regime: RNU — national rules, no local document'],
        legallyGrounded: false,
    };
}

/**
 * THE NO-ZONE-SERVED REFUSAL: the commune is NOT under RNU (a local document exists) yet no
 * zone/sector polygon covers this point in the GPU. The source answered; the answer is a
 * durable "no published zone here" — `no-plan-at-point` (STRUCTURAL-SEAM-4), never a retry
 * card and never a fabricated zone.
 */
export function frNoZoneServedRefusal(mun: FrMunicipalityStatus): EnvelopeRefusal {
    return {
        code: 'no-plan-at-point',
        headline: `${mun.name} (INSEE ${mun.insee}): no published zone covers this point — no envelope asserted.`,
        detail:
            `The Géoportail de l'urbanisme knows the commune (${mun.name}, is_rnu=false — a local` +
            ' document exists) but serves no zone-urba polygon and no carte-communale sector at this' +
            ' point. That is a durable statement about the published coverage — the document may be' +
            ' un-digitised, mid-upload, or the point may fall in an uncovered sliver. PRYZM will not' +
            ' guess which zone applies.',
        ordinanceRef:
            'Géoportail de l\'urbanisme (national) via apicarto.ign.fr — zone-urba: 0 features;' +
            ` secteur-cc: 0 features; municipality: ${mun.name} (INSEE ${mun.insee}), is_rnu=false.`,
        knownFacts: [`Commune: ${mun.name} (INSEE ${mun.insee})`, 'A local planning document exists (is_rnu=false) but no zone polygon is published at this point'],
        legallyGrounded: false,
    };
}
