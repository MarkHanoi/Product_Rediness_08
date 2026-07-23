// L-590h §6 — THE GOVERNING-INSTRUMENT SIGNPOST TIER (the cheap win, no OCR).
//
// WHAT THIS IS
// -----------
// For a parcel governed by DERIVED PLANNING (Spain: a Pla Parcial / PERI / PEU / PMU that the
// general plan delegates to — 62.8% of Barcelona by area, `L-590c` §3.1), PRYZM cannot compute a
// buildable envelope: the plan's numbers live inside a per-plan document that for the pre-1970
// instruments is a scan, and even read, the parcel-level HEIGHT is keyed to block labels on an
// un-OCR-able plànol (`L-590h` §2.2). So the honest envelope answer there is a REFUSAL
// (`plan-defined` / `regime-undetermined`, `esBarcelonaZoneClassification.ts`).
//
// A bare refusal, though, throws away something we DO reliably hold: the governing instrument's
// IDENTITY. The statutory register (RPUC in Catalonia; the same `basica → detall → documents`
// registry shape in every Spanish municipality) answers, per parcel's governing plan: its NAME,
// its INSTRUMENT TYPE, its DEFINITIVE-APPROVAL DATE, whether it is IN FORCE, and a DIRECT LINK to
// the document. This module turns that register payload into a SIGNPOST that converts
//
//     "zone rules coming"                                        (a blank refusal)
//                                          into
//     "This parcel is governed by the Pla parcial d'ordenació
//      «…», definitively approved 1968-08-01 — here it is."      (a cited, navigable answer)
//
// for essentially all derived-planning land. It does NOT move the resolution number — a full
// envelope needs numbers this tier never asserts (`L-590c` §11.4) — and it generalises for free to
// every Spanish city on the same registry pattern.
//
// WHAT THIS IS EMPHATICALLY NOT
// -----------------------------
// It is NOT a numeric envelope and carries NO buildable field (no height, FAR, occupation, setback).
// Its confidence is an INDEX POINTER — `index-cited` — which is trustworthy for *which* instrument
// governs and NEVER as a source of parameters (the `L-590c` §10.3 rule: "WMS/register indexes;
// RPUC/the approved instrument authorises; the PGM applies the residue"). Any per-plan buildable
// number belongs to a *different* tier, keyed `pipeline-extracted-unverified` (the OCR-core track,
// `L-590f` §3), which this module deliberately does not touch.
//
// THE ANNULMENT / SUPERSESSION GUARD (`L-590c` §10.4 / NEXT §3.6 — a LEGAL control, not a nicety)
// A municipal/registry index can lag the legal record when a plan is modified, superseded, or
// annulled by a court. Citing a stale index as the *governing* instrument would be OUR failure.
// So `citableAsGoverning` is true ONLY when the register confirms the instrument is in force; a
// `standing-unknown` or `superseded-or-withdrawn` instrument is still described (it is real, it
// existed) but is NEVER presented as the one that currently governs. Failure ≠ empty
// (§CONTEXT-DATA-HONESTY): "we could not confirm it is in force" is a distinct, stated tier from
// "it is in force".
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock, no RNG. The register FETCH is
// impure and lives at the edge (like every `ZoningProvider`); this module transforms an
// already-fetched payload into a signpost. Deterministic: same payload → byte-identical signpost.
//
// WIRING: NOT re-exported from `index.ts` and NOT registered in `registry.ts` (both out of scope
// for L-590h); consumers import it directly, mirroring `answerabilityClass.ts`. The L5 dispatcher
// attaches a signpost to a derived-planning refusal card.
//
// Strategic context — `L-590h-BARCELONA-SUFFICIENCY-CEILING.md` §6, `L-590c` §10.3/§10.4/§11.4,
// C58 §1.2/§1.4, NEXT.md §3.1/§3.6/§8.

// ── The register-payload shapes (a structural mirror of RPUC's `detall`, the impure fetch's ──
// output). Kept minimal and permissive: only the fields the signpost reads, all optional, so a
// caller can pass the raw JSON without a mapping step and a schema drift never throws.

/** One document attached to an expedient (`detall.documents[]`). */
export interface RegisterInstrumentDocument {
    /** The document id the `documents?documentId=` endpoint takes. */
    idDocument: number;
    /** File name as the register reports it (e.g. `"DUN.pdf"`). */
    nomDocument?: string | null;
    /** Non-null ⇒ this document is withdrawn/superseded (`baixa`). */
    baixa?: unknown;
    /** Non-null ⇒ an appeal/judgment is recorded against it (`recurs`). */
    recurs?: unknown;
}

/** One register entry (`detall.assentaments[]`) — the audit trail of the expedient. */
export interface RegisterAssentament {
    /** e.g. `"Alta"` (registration) or `"Baixa"` (de-registration/derogation). */
    tipusAssentament?: string | null;
    comentari?: string | null;
    dataAssentament?: string | null;
    vigent?: boolean | null;
}

/**
 * The register's per-expedient detail payload (RPUC `detall?codiExpedient=…`), reduced to the
 * fields the signpost consumes. A caller passes the decoded JSON directly.
 */
export interface RegisterInstrumentDetail {
    /** Public expedient code (`codi`). */
    codi?: string | null;
    /** Internal numeric id (`codintExp`). */
    codintExp?: number | null;
    municipi?: string | null;
    /** The plan's descriptive name/subject (`tema`). */
    tema?: string | null;
    /** The register's composite name/number (`nomComplet`), carries the expedient year. */
    nomComplet?: string | null;
    /** Instrument type in Catalan (`tipologiaCA`), e.g. `"Pla parcial d'ordenació"`. */
    tipologiaCA?: string | null;
    /** Instrument type as it appears in the list endpoint (`instrumentca`) — a fallback. */
    instrumentca?: string | null;
    /** In-force flag (`vigencia`): e.g. `"SI"` / `"NO"` / `"V"` / `"V/A"`. May be null in `detall`. */
    vigencia?: string | null;
    /** Definitive-approval date (`dataAprovacio`), ISO `YYYY-MM-DD`. The Art. 350.1 legal predicate. */
    dataAprovacio?: string | null;
    /** Publication date (`dataPublicacio`). */
    dataPublicacio?: string | null;
    assentaments?: RegisterAssentament[] | null;
    documents?: RegisterInstrumentDocument[] | null;
}

/** The signpost's confidence: an INDEX pointer, never a parameter tier (`L-590c` §10.3). */
export type SignpostConfidence = 'index-cited';

/**
 * The instrument's legal standing, derived from the register. The annulment guard turns on this.
 *   - `in-force`                — the register confirms it is vigent; safe to cite as GOVERNING.
 *   - `superseded-or-withdrawn` — the register records it as not in force / derogated.
 *   - `standing-unknown`        — the payload does not state a standing; we DESCRIBE it but never
 *                                 present it as the currently-governing instrument.
 */
export type InstrumentStanding =
    | 'in-force'
    | 'superseded-or-withdrawn'
    | 'standing-unknown';

/** A resolved, clickable link to one of the instrument's documents. */
export interface SignpostDocumentLink {
    idDocument: number;
    name: string | null;
    /** The register's inline-download URL for this document. */
    url: string;
    /** True when the register marks this individual document as withdrawn (`baixa`). */
    withdrawn: boolean;
}

/** The signpost: WHICH instrument governs, its date, its standing, and how to open it. */
export interface GoverningInstrumentSignpost {
    /** False when the payload carries no usable instrument identity at all. */
    found: boolean;
    instrumentType: string | null;
    instrumentName: string | null;
    /** Definitive-approval date (ISO), or null when the register did not state it. */
    approvalDate: string | null;
    publicationDate: string | null;
    expedientCode: string | null;
    standing: InstrumentStanding;
    /** ⚠ True ONLY when `standing === 'in-force'`. The annulment guard (`L-590c` §10.4). */
    citableAsGoverning: boolean;
    /** Document links, deterministically ordered by `idDocument`. */
    documents: SignpostDocumentLink[];
    /** A one-line, register-cited human sentence for the refusal card. */
    citation: string;
    confidence: SignpostConfidence;
    /** Source id, e.g. `"rpuc-gencat"`. */
    provenance: string;
    /** Honesty flags (missing date, unconfirmed standing, withdrawn documents, …). */
    notes: string[];
}

/** Options — chiefly how to build the document URLs (defaults to the RPUC endpoint). */
export interface SignpostOptions {
    /** Base of the register's document endpoint. */
    documentEndpointBase?: string;
    /** `idioma` query param. */
    idioma?: string;
    /** `downloadType` query param. */
    downloadType?: string;
    /** Source id recorded on the signpost. */
    provenanceId?: string;
    /**
     * A `vigencia` value from the LIST endpoint (`basica`) to use when `detall.vigencia` is null.
     * ⚠ RPUC's `detall` frequently omits `vigencia` while the `basica` row carries `"SI"`; without
     * this, an in-force plan reads as `standing-unknown` (§CONTEXT-DATA-HONESTY: a missing field is
     * not "not in force"). Pass the list row's `vigencia` here so the standing is resolved, not
     * defaulted to unknown.
     */
    vigenciaHint?: string | null;
}

const DEFAULT_DOC_BASE = 'https://dtes.gencat.cat/RPUC-portal/rest/consulta';
const DEFAULT_IDIOMA = 'ca';
const DEFAULT_DOWNLOAD_TYPE = 'inline';
const DEFAULT_PROVENANCE = 'rpuc-gencat';

/** `vigencia` tokens that mean "in force" (V = vigent, V/A = vigent/amended, both still govern). */
const IN_FORCE_TOKENS = new Set(['si', 's', 'v', 'v/a', 'va', 'vigent', 'vigente', 'true']);
/** `vigencia` tokens that mean "not in force". */
const NOT_IN_FORCE_TOKENS = new Set([
    'no',
    'n',
    'derogat',
    'derogado',
    'no vigent',
    'no vigente',
    'anullat',
    'anulado',
    'false',
]);

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
    for (const v of values) {
        if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    }
    return null;
}

/**
 * Derive the instrument's legal standing from the register (the annulment guard's input).
 *
 * The top-level `vigencia` is authoritative. A `Baixa` assentament is a supersession signal that
 * DOWNGRADES an otherwise-unknown standing (never overrides an explicit in-force flag — the plan
 * can be amended, `V/A`, and still govern). ⚠ We deliberately do NOT read `assentament.vigent`
 * as a plan-standing signal: RPUC marks the *initial archival* `Alta` entry `vigent:false`
 * (observed on expedient 110061), which is an artefact of the audit trail, not a derogation of the
 * plan — treating it as one would fabricate a supersession.
 */
function deriveStanding(
    vigencia: string | null | undefined,
    assentaments: RegisterAssentament[] | null | undefined,
): InstrumentStanding {
    const token = typeof vigencia === 'string' ? vigencia.trim().toLowerCase() : '';
    if (token && IN_FORCE_TOKENS.has(token)) return 'in-force';
    if (token && NOT_IN_FORCE_TOKENS.has(token)) return 'superseded-or-withdrawn';

    // No explicit flag: a recorded `Baixa` (de-registration) is the only supersession signal.
    const hasBaixa = (assentaments ?? []).some(
        (a) => (a?.tipusAssentament ?? '').trim().toLowerCase() === 'baixa',
    );
    if (hasBaixa) return 'superseded-or-withdrawn';
    return 'standing-unknown';
}

function buildDocumentUrl(idDocument: number, opts: SignpostOptions): string {
    const base = (opts.documentEndpointBase ?? DEFAULT_DOC_BASE).replace(/\/+$/, '');
    const downloadType = opts.downloadType ?? DEFAULT_DOWNLOAD_TYPE;
    const idioma = opts.idioma ?? DEFAULT_IDIOMA;
    return `${base}/documents?documentId=${idDocument}&downloadType=${encodeURIComponent(
        downloadType,
    )}&idioma=${encodeURIComponent(idioma)}`;
}

/** The empty signpost — the payload named no instrument. Not an error; a stated absence. */
function notFound(provenance: string, note: string): GoverningInstrumentSignpost {
    return {
        found: false,
        instrumentType: null,
        instrumentName: null,
        approvalDate: null,
        publicationDate: null,
        expedientCode: null,
        standing: 'standing-unknown',
        citableAsGoverning: false,
        documents: [],
        citation: 'No governing planning instrument is recorded for this parcel in the register.',
        confidence: 'index-cited',
        provenance,
        notes: [note],
    };
}

/**
 * Build the governing-instrument signpost from an already-fetched register detail payload.
 *
 * Pure and deterministic. Never throws on a malformed/partial payload — a missing field yields a
 * stated absence (a `note`), never a fabricated value.
 */
export function buildGoverningInstrumentSignpost(
    detail: RegisterInstrumentDetail | null | undefined,
    options: SignpostOptions = {},
): GoverningInstrumentSignpost {
    const provenance = options.provenanceId ?? DEFAULT_PROVENANCE;

    if (!detail || typeof detail !== 'object') {
        return notFound(provenance, 'No register payload was provided.');
    }

    const instrumentType = firstNonEmpty(detail.tipologiaCA, detail.instrumentca);
    const instrumentName = firstNonEmpty(detail.tema, detail.nomComplet);
    const expedientCode = firstNonEmpty(
        detail.codi,
        detail.codintExp != null ? String(detail.codintExp) : null,
    );

    // "Found" requires at least an instrument type or a name — otherwise there is nothing to point at.
    if (!instrumentType && !instrumentName) {
        return notFound(provenance, 'The register payload names no instrument type or title.');
    }

    const approvalDate = firstNonEmpty(detail.dataAprovacio);
    const publicationDate = firstNonEmpty(detail.dataPublicacio);

    const effectiveVigencia = firstNonEmpty(detail.vigencia, options.vigenciaHint);
    const standing = deriveStanding(effectiveVigencia, detail.assentaments);
    const citableAsGoverning = standing === 'in-force';

    // Documents: dedupe by id, order by id (determinism), resolve URLs, flag withdrawn ones.
    const seen = new Set<number>();
    const documents: SignpostDocumentLink[] = [];
    for (const d of detail.documents ?? []) {
        if (!d || typeof d.idDocument !== 'number' || seen.has(d.idDocument)) continue;
        seen.add(d.idDocument);
        documents.push({
            idDocument: d.idDocument,
            name: firstNonEmpty(d.nomDocument),
            url: buildDocumentUrl(d.idDocument, options),
            withdrawn: d.baixa != null,
        });
    }
    documents.sort((a, b) => a.idDocument - b.idDocument);

    const notes: string[] = [];
    if (!approvalDate) {
        notes.push('No definitive-approval date recorded — do not present a precise approval date.');
    }
    if (standing === 'standing-unknown') {
        notes.push(
            'In-force status not confirmed by the register — described but NOT cited as the ' +
                'currently governing instrument (annulment guard, L-590c §10.4).',
        );
    } else if (standing === 'superseded-or-withdrawn') {
        notes.push(
            'The register records this instrument as not in force (superseded/derogated) — it is ' +
                'NOT the currently governing plan.',
        );
    }
    if (documents.length === 0) {
        notes.push('No documents are linked for this instrument in the register.');
    } else if (documents.some((d) => d.withdrawn)) {
        notes.push('One or more linked documents are marked withdrawn (baixa) in the register.');
    }

    const citation = buildCitation({
        instrumentType,
        instrumentName,
        approvalDate,
        expedientCode,
        standing,
    });

    return {
        found: true,
        instrumentType,
        instrumentName,
        approvalDate,
        publicationDate,
        expedientCode,
        standing,
        citableAsGoverning,
        documents,
        citation,
        confidence: 'index-cited',
        provenance,
        notes,
    };
}

function buildCitation(parts: {
    instrumentType: string | null;
    instrumentName: string | null;
    approvalDate: string | null;
    expedientCode: string | null;
    standing: InstrumentStanding;
}): string {
    const type = parts.instrumentType ?? 'planning instrument';
    const name = parts.instrumentName ? ` «${parts.instrumentName}»` : '';
    const exp = parts.expedientCode ? ` (expedient ${parts.expedientCode})` : '';
    const approved = parts.approvalDate
        ? `, definitively approved ${parts.approvalDate}`
        : ', approval date not recorded';

    const lead = `This parcel is governed by the ${type}${name}${exp}${approved}.`;
    const source = ' Source: statutory planning register (index — informatiu, no normatiu).';

    if (parts.standing === 'in-force') return lead + source;
    if (parts.standing === 'superseded-or-withdrawn') {
        return (
            `${type}${name}${exp} is recorded in the register as NOT in force ` +
            `(superseded/derogated) and is not cited as the governing plan.` +
            source
        );
    }
    // standing-unknown
    return (
        `${type}${name}${exp}${approved} is recorded in the register, but its in-force status ` +
        `could not be confirmed, so it is not cited as the currently governing plan.` +
        source
    );
}
