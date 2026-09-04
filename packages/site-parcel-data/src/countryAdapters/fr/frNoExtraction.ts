// LANE FR-STEP4 — FRANCE (FR) · THE NO-EXTRACTION PRODUCT, pure half (brief §11 step 4:
// "regime, derivability, zone, permitted uses, prescriptions, SUP, terrain, neighbours,
// governing document with approval date and a link to the law. This is shippable before any
// PDF is parsed." — and §11's own order: "Step 4 is a product. Do not defer shipping it.").
//
// WHAT THIS MODULE IS — AND DELIBERATELY IS NOT. It assembles ONE typed record of everything
// France publishes machine-readably about a point, every slice carrying the repo's
// F1–F8-shaped provenance (the 8-field `RuleSourceRef` legal address + `validityBasis`,
// @pryzm/schemas siteintel/provenance.ts). It contains NO extraction, NO solver and NO
// envelope number — hauteur/emprise/retraits live in the règlement text (steps 6–7). There
// is deliberately no numeric envelope field anywhere in the output type (the L-616 seam
// stays structurally closed, exactly as frZoneIdentity.ts keeps it).
//
// ABSENCE DISCIPLINE (brief §1.2): a slice that cannot be resolved is
// `{ status: 'unresolved', refusal_reason, retryable }` — never a default, never null-as-0.
// A TRANSIENT fetch keeps its L0-table token verbatim in the reason and sets
// `retryable: true`; a genuine absence sets `retryable: false` (failure ≠ empty, end to end).
//
// PHASE-0 FACTS THIS MODULE ENCODES (FR-PHASE0-REPORT, committed 9f164870 — binding):
//   • NOMFIC 99.16% is the retrieval key; #page anchors on 16.1% — parsed (frZoneIdentity).
//   • URLFIC is NOT a path (18.27% fill × 57.6% fetchable) — carried, never relied on.
//   • DESTOUI/CDT/NON are EMPTY in the DB (0.84–1.23%) — permitted uses resolve from the
//     règlement REFERENCE, not the fields; served-empty fields are an unresolved slice.
//   • ETAT 100% + DATAPPRO 99.68% (doc_urba) satisfy provenance directly — joined by idurba.
//   • IDURBA is NON-UNIQUE in doc_urba (23,885/14,109) — deterministic pick, rule STATED.
//   • TYPEDOC case-splits (PLUI 612 / PLUi 3) — normalised, verbatim kept beside.
//   • POS is still live in the DB → the §3.2 caducity fall-through is a real branch
//     (exercised live at ARTIGUE 31019: du_type POS + is_rnu true, probed 2026-09-02).
//   • The RNU COUNT CONFLICT (GPU flag census vs published SuDocUH figures) — the RNU
//     refusal cites the per-commune is_rnu flag as its basis and NAMES the discrepancy,
//     quoting NEITHER aggregate.
//
// Pure: no I/O, no clock (fetchedAtIso is an INPUT), no RNG. Same inputs → byte-identical
// output (brief §1.1 determinism, assembler-level).

import type { EnvelopeRefusal, FetchOutcome, RuleSourceRef } from '@pryzm/schemas';
import type { FrElevation } from './frAltimetry.js';
import type { FrNeighbourBuildings } from './frBdTopoNeighbours.js';
import type { FrGpuFeature } from './frGpuClient.js';
import { FR_LEGIFRANCE_CODE_URBANISME_URL } from '../../rulepacks/frLegifrance.js';
import { frEnvelopeRuleStates, type FrResolution } from '../../rulepacks/frResolution.js';
import {
    parseFrGpuZoneFeature,
    parseFrIdurba,
    parseFrMunicipalityFeature,
    parseFrReglementPageAnchor,
    type FrMunicipalityStatus,
    type FrZoneDocumentKind,
    type FrZoneIdentity,
} from './frZoneIdentity.js';

/* ────────────────────────────── provenance (source8 + validityBasis) ───── */

/** The GPU authority string every GPU-served slice cites. */
export const FR_GPU_AUTHORITY = "IGN / Géoportail de l'urbanisme (DGALN)";

/** The Géoplateforme authority string (altimetry + BD TOPO slices). */
export const FR_GEOPLATEFORME_AUTHORITY = 'IGN (Géoplateforme)';

/**
 * Per-slice provenance — the repo's existing shape, reused not re-minted: the 8-field
 * `RuleSourceRef` legal address (country/authority/dataset/plan_id/object_id/document/
 * article/page) + the R3 `validityBasis` axis ('legal' = the instrument's own date axis;
 * 'ingestion' = the state served no machine validity and the window is fetch-versioned).
 */
export interface FrSliceProvenance {
    readonly source: RuleSourceRef;
    readonly validityBasis: 'legal' | 'ingestion';
    /** ISO date the validity window opens (instrument date when legal; fetch date when not). */
    readonly valid_from: string;
    /** When this record was assembled — an INPUT to the pure assembler, never a clock read. */
    readonly retrieved_at: string;
}

/** One slice of the record: resolved WITH provenance, or typed-unresolved. Never a default. */
export type FrSlice<T> =
    | { readonly status: 'resolved'; readonly value: T; readonly provenance: FrSliceProvenance }
    | { readonly status: 'unresolved'; readonly refusal_reason: string; readonly retryable: boolean };

const resolved = <T>(value: T, provenance: FrSliceProvenance): FrSlice<T> => ({
    status: 'resolved',
    value,
    provenance,
});
const unresolved = <T>(refusal_reason: string, retryable: boolean): FrSlice<T> => ({
    status: 'unresolved',
    refusal_reason,
    retryable,
});

/** `YYYYMMDD` (GPU verbatim) → ISO `YYYY-MM-DD`, or null on any other shape. */
export function frYyyymmddToIso(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const m = v.trim().match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
}

const str = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t === '' ? null : t;
};
const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};

function gpuSource(
    dataset: string,
    opts: {
        readonly plan_id?: string | null;
        readonly object_id?: string | null;
        readonly document?: string | null;
        readonly page?: number | null;
    } = {},
): RuleSourceRef {
    return {
        country: 'FR',
        authority: FR_GPU_AUTHORITY,
        dataset,
        plan_id: opts.plan_id ?? null,
        object_id: opts.object_id ?? null,
        document: opts.document ?? null,
        article: null,
        page: opts.page ?? null,
    };
}

/** Legal validity when the instrument serves a date; ingestion-versioned otherwise (R3). */
function validityFrom(
    isoInstrumentDate: string | null,
    fetchedAtIso: string,
): { readonly validityBasis: 'legal' | 'ingestion'; readonly valid_from: string } {
    return isoInstrumentDate !== null
        ? { validityBasis: 'legal', valid_from: isoInstrumentDate }
        : { validityBasis: 'ingestion', valid_from: fetchedAtIso.slice(0, 10) };
}

/* ────────────────────────────── deterministic pickers (rules STATED) ───── */

/** The stated municipality tie-break (Paris/Lyon serve arrondissement + commune at a point). */
export const FR_MUNICIPALITY_SELECTION_RULE =
    'lowest INSEE code wins when the GPU serves several commune features at the point ' +
    '(measured: Paris Marais serves 75103 + 75056; Lyon Presqu’île 69123 + 69382) — deterministic, stated';

/** The stated document tie-break (regime precedence, then newest, then stable ids). */
export const FR_DOCUMENT_SELECTION_RULE =
    'site-specific PSMV first; then PLU/PLUi/CC; POS (caduc since 2017-03-27) last; ties broken by ' +
    'the approval date parsed from the document name (newest first), then partition, then name — ' +
    'deterministic, stated';

/** The stated doc_urba dedupe (the IDURBA-non-unique pin — Phase 0: 23,885 rows / 14,109 ids). */
export const FR_DOC_URBA_SELECTION_RULE =
    'doc_urba idurba is NOT unique (procedure/partition duplication — FR-PHASE0 §2): the row with ' +
    'the newest DATAPPRO wins, ties broken by highest gid — deterministic, stated';

/** Pick the governing municipality feature deterministically; null when none parse. */
export function pickFrMunicipality(features: readonly FrGpuFeature[]): {
    readonly picked: FrMunicipalityStatus | null;
    readonly all: readonly FrMunicipalityStatus[];
    readonly selectionRule: string | null;
} {
    const all: FrMunicipalityStatus[] = [];
    for (const f of features) {
        const m = parseFrMunicipalityFeature(f.properties);
        if (m !== null) all.push(m);
    }
    all.sort((a, b) => a.insee.localeCompare(b.insee));
    return {
        picked: all[0] ?? null,
        all,
        selectionRule: all.length > 1 ? FR_MUNICIPALITY_SELECTION_RULE : null,
    };
}

/** One /document feature, typed. `duType` is normalised; the verbatim travels beside it. */
export interface FrDocumentAtPoint {
    readonly name: string;
    readonly duType: string | null;
    readonly duTypeVerbatim: string | null;
    readonly partition: string | null;
    readonly gpuDocId: string | null;
    readonly gpuStatus: string | null;
    /** Approval date parsed from the document name (`75056_PLU_20260616` → `2026-06-16`). */
    readonly approvalDateFromName: string | null;
}

/**
 * Normalise the TYPEDOC/du_type case-split (Phase 0: `PLUI` ×612 vs `PLUi` ×3 in doc_urba;
 * live 2026-09-02: doc_urba serves `PLUI` where /document serves `PLUi` for the SAME Lyon
 * instrument). Only the measured split is normalised; anything else passes verbatim.
 */
export function normaliseFrDuType(raw: unknown): string | null {
    const t = str(raw);
    if (t === null) return null;
    return t.toUpperCase() === 'PLUI' ? 'PLUi' : t;
}

/** Parse one /document property bag; null when it carries no name. */
export function parseFrDocumentFeature(props: Record<string, unknown>): FrDocumentAtPoint | null {
    const name = str(props['name']);
    if (name === null) return null;
    const duTypeVerbatim = str(props['du_type']);
    return {
        name,
        duType: normaliseFrDuType(duTypeVerbatim),
        duTypeVerbatim,
        partition: str(props['partition']),
        gpuDocId: str(props['gpu_doc_id']) ?? str(props['id']),
        gpuStatus: str(props['gpu_status']),
        approvalDateFromName: parseFrIdurba(name).instrumentDate,
    };
}

const DU_TYPE_RANK: Readonly<Record<string, number>> = { PSMV: 0, PLU: 1, PLUi: 1, CC: 1, POS: 2 };

/** Pick the governing document deterministically per FR_DOCUMENT_SELECTION_RULE. */
export function pickFrDocument(features: readonly FrGpuFeature[]): {
    readonly picked: FrDocumentAtPoint | null;
    readonly all: readonly FrDocumentAtPoint[];
    readonly selectionRule: string | null;
} {
    const all: FrDocumentAtPoint[] = [];
    for (const f of features) {
        const d = parseFrDocumentFeature(f.properties);
        if (d !== null) all.push(d);
    }
    all.sort((a, b) => {
        const ra = DU_TYPE_RANK[a.duType ?? ''] ?? 3;
        const rb = DU_TYPE_RANK[b.duType ?? ''] ?? 3;
        if (ra !== rb) return ra - rb;
        const da = a.approvalDateFromName ?? '';
        const db = b.approvalDateFromName ?? '';
        if (da !== db) return db.localeCompare(da); // newest first
        const pa = a.partition ?? '';
        const pb = b.partition ?? '';
        if (pa !== pb) return pa.localeCompare(pb);
        return a.name.localeCompare(b.name);
    });
    return {
        picked: all[0] ?? null,
        all,
        selectionRule: all.length > 1 ? FR_DOCUMENT_SELECTION_RULE : null,
    };
}

/** One doc_urba attribute row (ETAT/DATAPPRO home), verbatim fields. */
export interface FrDocUrbaRow {
    readonly idurba: string | null;
    readonly typedocVerbatim: string | null;
    readonly typedoc: string | null;
    readonly etat: string | null;
    readonly datappro: string | null;
    readonly datefin: string | null;
    readonly nomreg: string | null;
    readonly nomproc: string | null;
    readonly gid: number | null;
}

/** Parse one doc_urba property bag (attribute table — always parses; fields nullable). */
export function parseFrDocUrbaFeature(props: Record<string, unknown>): FrDocUrbaRow {
    const typedocVerbatim = str(props['typedoc']);
    return {
        idurba: str(props['idurba']),
        typedocVerbatim,
        typedoc: normaliseFrDuType(typedocVerbatim),
        etat: str(props['etat']),
        datappro: str(props['datappro']),
        datefin: str(props['datefin']),
        nomreg: str(props['nomreg']),
        nomproc: str(props['nomproc']),
        gid: num(props['gid']),
    };
}

/** Pick ONE doc_urba row per FR_DOC_URBA_SELECTION_RULE (the IDURBA-non-unique pin). */
export function pickFrDocUrbaRow(features: readonly FrGpuFeature[]): {
    readonly picked: FrDocUrbaRow | null;
    readonly rowCount: number;
    readonly selectionRule: string | null;
} {
    const rows = features.map((f) => parseFrDocUrbaFeature(f.properties));
    rows.sort((a, b) => {
        const da = a.datappro ?? '';
        const db = b.datappro ?? '';
        if (da !== db) return db.localeCompare(da); // newest DATAPPRO first
        return (b.gid ?? -1) - (a.gid ?? -1); // then highest gid
    });
    return {
        picked: rows[0] ?? null,
        rowCount: rows.length,
        selectionRule: rows.length > 1 ? FR_DOC_URBA_SELECTION_RULE : null,
    };
}

/* ────────────────────────────── prescriptions (brief §5 table) ─────────── */

/** The typed meanings of the envelope-relevant TYPEPSC codes (brief §5, verbatim mapping). */
export type FrPrescriptionMeaning =
    | 'plan-masse-drawn-volume' // 14 — secteur de plan de masse (R151-40)
    | 'implantation-rule-drawn' // 15 — règles d'implantation as geometry (R151-39)
    | 'espace-boise-classe' // 01 — negative overlay
    | 'constructibilite-interdite-ou-conditionnelle' // 02 — hard negative / conditional
    | 'emplacement-reserve' // 05 — removes land from buildable area
    | 'patrimoine-bati-paysager' // 07 — negative overlay + discretionary flag
    | 'densite-minimale' // 29 — minimum constraint
    | 'majoration-volume'; // 30 — conditional increment to height/emprise

/** TYPEPSC → typed meaning, for the brief's §5 envelope-relevant codes ONLY. */
export const FR_PRESCRIPTION_MEANINGS: Readonly<Record<string, FrPrescriptionMeaning>> = {
    '14': 'plan-masse-drawn-volume',
    '15': 'implantation-rule-drawn',
    '01': 'espace-boise-classe',
    '02': 'constructibilite-interdite-ou-conditionnelle',
    '05': 'emplacement-reserve',
    '07': 'patrimoine-bati-paysager',
    '29': 'densite-minimale',
    '30': 'majoration-volume',
};

/** One prescription at the point — §5 codes typed, every other code carried verbatim. */
export interface FrPrescription {
    readonly geometryKind: 'surf' | 'lin' | 'pct';
    readonly typepsc: string;
    readonly stypepsc: string | null;
    readonly meaning: FrPrescriptionMeaning | null;
    readonly envelopeRelevant: boolean;
    readonly libelle: string | null;
    readonly txt: string | null;
    readonly nature: string | null;
    readonly idurba: string | null;
    readonly partition: string | null;
    readonly reglementDoc: string | null;
    readonly reglementPage: number | null;
    readonly gid: number | null;
}

/** Parse one prescription bag; null when it serves no typepsc (nothing to type). */
export function parseFrPrescription(
    geometryKind: 'surf' | 'lin' | 'pct',
    props: Record<string, unknown>,
): FrPrescription | null {
    const typepsc = str(props['typepsc']);
    if (typepsc === null) return null;
    const meaning = FR_PRESCRIPTION_MEANINGS[typepsc] ?? null;
    const nomfic = typeof props['nomfic'] === 'string' ? props['nomfic'] : null;
    const urlfic = typeof props['urlfic'] === 'string' ? props['urlfic'] : null;
    return {
        geometryKind,
        typepsc,
        stypepsc: str(props['stypepsc']),
        meaning,
        envelopeRelevant: meaning !== null,
        libelle: str(props['libelle']),
        txt: str(props['txt']),
        nature: str(props['nature']),
        idurba: str(props['idurba']),
        partition: str(props['partition']),
        reglementDoc: str(nomfic)?.replace(/#page=\d+$/i, '') ?? null,
        reglementPage: parseFrReglementPageAnchor(nomfic, urlfic),
        gid: num(props['gid']),
    };
}

/* ────────────────────────────── SUP assiettes ──────────────────────────── */

/** One SUP assiette at the point — categorie + acte, verbatim (brief step-4 slice 5). */
export interface FrSupAssiette {
    readonly geometryKind: 's' | 'l' | 'p';
    /** `suptype` verbatim (`ac1`, `pm1`, …) — the SUP catégorie. */
    readonly categorie: string | null;
    /** The protected/generating entity's literal name (`nomsuplitt`). */
    readonly nomsuplitt: string | null;
    readonly typeass: string | null;
    readonly modegeoass: string | null;
    /** The ACTE document — measured 2026-09-02: it rides the assiette row as `fichier`. */
    readonly acte: string | null;
    readonly partition: string | null;
    readonly idass: string | null;
    readonly idgen: string | null;
    readonly gid: number | null;
}

/** Parse one assiette bag; null when it names neither categorie nor assiette id. */
export function parseFrSupAssiette(
    geometryKind: 's' | 'l' | 'p',
    props: Record<string, unknown>,
): FrSupAssiette | null {
    const categorie = str(props['suptype']);
    const idass = str(props['idass']);
    if (categorie === null && idass === null) return null;
    return {
        geometryKind,
        categorie,
        nomsuplitt: str(props['nomsuplitt']),
        typeass: str(props['typeass']),
        modegeoass: str(props['modegeoass']),
        acte: str(props['fichier']),
        partition: str(props['partition']),
        idass,
        idgen: str(props['idgen']),
        gid: num(props['gid']),
    };
}

/* ────────────────────────────── the record's slice values ──────────────── */

/** Regime kinds — the brief §3.2 five, with POS carried as its caducity truth. */
export type FrRegimeKind = 'PLU' | 'PLUi' | 'CC' | 'PSMV' | 'POS-caduc' | 'RNU';

export interface FrRegime {
    readonly regime: FrRegimeKind;
    readonly commune: FrMunicipalityStatus;
    readonly communeSelectionRule: string | null;
    /** The GPU per-commune flag, verbatim — the RNU basis (never a national aggregate). */
    readonly isRnuFlag: boolean;
    readonly duType: string | null;
    readonly duTypeVerbatim: string | null;
    readonly documentName: string | null;
    readonly partition: string | null;
    readonly gpuDocId: string | null;
    readonly documentSelectionRule: string | null;
    /** Regime-specific honesty note (CC → RNU rules; POS → caducity; flag contradictions). */
    readonly note: string | null;
}

export type FrDerivabilityClass =
    | 'reglement-text-path' // the normal case — parameters await règlement extraction (steps 6–7)
    | 'derived-plan-governs' // B5-class: secteur-cc / PSMV / plan-masse — the drawn plan governs
    | 'rnu-no-derivation'; // RNU / POS-caduc — per-case PAU determination, no derivation path

export interface FrDerivability {
    readonly class: FrDerivabilityClass;
    readonly trigger: 'secteur-cc' | 'psmv' | 'plan-masse' | null;
    /** The governing expedient, NAMED (document / prescription), when a derived plan governs. */
    readonly expedient: string | null;
    readonly note: string;
}

export interface FrZoneSlice {
    readonly documentKind: FrZoneDocumentKind;
    /** Every zone the GPU served at the point, parsed (nomfic + #page anchors included). */
    readonly zones: readonly FrZoneIdentity[];
}

export interface FrPermittedUses {
    /** DESTOUI/DESTCDT/DESTNON/DESTDOMI verbatim — present only in the rare filled case. */
    readonly destOui: string | null;
    readonly destCdt: string | null;
    readonly destNon: string | null;
    readonly destDomi: string | null;
    readonly note: string;
}

export interface FrPrescriptionsSlice {
    /** All prescriptions at the point, sorted (kind, typepsc, stypepsc, gid) — deterministic. */
    readonly atPoint: readonly FrPrescription[];
    readonly counts: { readonly surf: number; readonly lin: number; readonly pct: number };
    /** Brief §10.7, verbatim scope statement — absence in the GPU is not absence in law. */
    readonly scopeNote: string;
}

export interface FrSupSlice {
    readonly assiettes: readonly FrSupAssiette[];
    readonly counts: { readonly s: number; readonly l: number; readonly p: number };
    readonly scopeNote: string;
}

export interface FrTerrainSlice {
    readonly elevationM: number;
    readonly accuracy: string | number | null;
    readonly resource: string;
    /** The datum honesty line — a measured point elevation is not the règlement's datum. */
    readonly datumNote: string;
}

export interface FrGoverningDocument {
    /** Document name (`75056_PLU_20260616`), or the RNU's own name when no local doc governs. */
    readonly name: string;
    readonly duType: string | null;
    readonly idurba: string | null;
    /** DATAPPRO verbatim (`YYYYMMDD`) from the doc_urba join, or null with the join named. */
    readonly datappro: string | null;
    /** ETAT verbatim code from the doc_urba join ('03' opposable-family), or null. */
    readonly etat: string | null;
    readonly nomreg: string | null;
    readonly docUrbaJoin: 'joined' | 'no-row' | 'unavailable-transient' | 'not-queried';
    readonly docUrbaRowCount: number;
    readonly docUrbaSelectionRule: string | null;
    /** The §4.2 archive link (probed 2026-09-02: 302 → the document zip), or null. */
    readonly downloadByPartitionUrl: string | null;
    /** The link to the law (Code de l'urbanisme on Légifrance — probed 302-stable). */
    readonly legifranceUrl: string;
    /** The regime articles the link points into, named in text. */
    readonly legifranceArticles: string;
}

/**
 * Code de l'urbanisme on Légifrance. ⚠ MOVED to `rulepacks/frLegifrance.ts` (a leaf) and re-exported
 * here so no consumer changed: `frRnuNationalPack` needs it and imported it from this module, which
 * closed an import CYCLE the moment this file acquired the `frEnvelopeRuleStates` call below. The
 * leaf has zero imports, so the ring cannot re-form. See that file's header.
 */
export { FR_LEGIFRANCE_CODE_URBANISME_URL } from '../../rulepacks/frLegifrance.js';

/** GPU archive download base (§4.2; probed 2026-09-02: DU_75056 → 302 → document zip). */
export const FR_GPU_DOWNLOAD_BY_PARTITION_BASE =
    'https://www.geoportail-urbanisme.gouv.fr/document/download-by-partition/';

/** The regime articles named per regime kind (the "link to the law" half of slice 8). */
export const FR_REGIME_ARTICLES: Readonly<Record<FrRegimeKind, string>> = {
    PLU: "Code de l'urbanisme — volumétrie et implantation: art. R151-39 à R151-41 (décret n° 2015-1783); pre-2016 règlements: articles 6–10 per zone",
    PLUi: "Code de l'urbanisme — volumétrie et implantation: art. R151-39 à R151-41 (décret n° 2015-1783); pre-2016 règlements: articles 6–10 per zone",
    CC: "Code de l'urbanisme — carte communale: art. L161-1 s.; rules: RNU art. L111-1 s. (a carte communale has no règlement of its own)",
    PSMV: "Code de l'urbanisme — plan de sauvegarde et de mise en valeur: art. L313-1 s.",
    'POS-caduc': "Code de l'urbanisme — caducité des POS: art. L174-1 (27 mars 2017); applicable rules: RNU art. L111-1 s.",
    RNU: "Code de l'urbanisme — règlement national d'urbanisme: art. L111-1 s. (constructibilité limitée)",
};

/** Brief §10.7 scope statement, one spelling, reused on both geometry slices. */
export const FR_GPU_SCOPE_NOTE =
    'Absence of a prescription/SUP in the GPU is not evidence it does not exist ' +
    '(FR-MODULE-BUILD-BRIEF §10.7) — this slice states what the GPU serves at the point, no more.';

/* ────────────────────────────── the record ─────────────────────────────── */

/**
 * THE STEP-4 PRODUCT: everything France publishes machine-readably about a point, typed,
 * cited, and refusing by name where the law or the data refuses. NO envelope number exists
 * anywhere in this type — that is steps 6–7's job, and adding one here re-opens L-616.
 */
export interface FrNoExtractionRecord {
    readonly country: 'FR';
    readonly product: 'fr-no-extraction-record';
    readonly point: { readonly lat: number; readonly lon: number };
    readonly retrievedAt: string;
    readonly regime: FrSlice<FrRegime>;
    readonly derivability: FrSlice<FrDerivability>;
    readonly zone: FrSlice<FrZoneSlice>;
    readonly permittedUses: FrSlice<FrPermittedUses>;
    readonly prescriptions: FrSlice<FrPrescriptionsSlice>;
    readonly sup: FrSlice<FrSupSlice>;
    readonly terrain: FrSlice<FrTerrainSlice>;
    readonly neighbours: FrSlice<FrNeighbourBuildings>;
    readonly governingDocument: FrSlice<FrGoverningDocument>;
    /**
     * The regime-level refusal card (RNU / POS-caduc / PSMV / secteur-cc / plan-masse /
     * no-zone-served), or null on the plain PLU/PLUi path — where the record itself is the
     * product and no envelope is asserted either way.
     */
    readonly refusal: EnvelopeRefusal | null;
    /**
     * ⭐ The FR rule packs' typed reading of the facts above — one `RuleState` per envelope
     * parameter a source actually speaks to (`rulepacks/frResolution.ts`). This is what makes the
     * packs REACHABLE rather than merely exported.
     *
     * ⛔ IT IS NOT AN ENVELOPE and asserts no bounded volume — the L-616 prohibition in this type's
     * header applies to it unchanged. It re-reads regime, prescriptions and document, performs no
     * fetch, and emits NOTHING for a parameter no source speaks to (a silent parameter is not "no
     * limit"; the rule is very probably in a règlement nobody parsed).
     *
     * ⚠ `states` is empty where the publisher's own statements CONFLICT — that is the honest
     * output, not a degraded one.
     */
    readonly ruleStates: FrResolution;
}

/* ────────────────────────────── refusal builders ───────────────────────── */

/**
 * THE STEP-4 RNU REFUSAL (brief §3.3 permanent refusal + the Phase-0 RNU-count conflict).
 * Basis: the PER-COMMUNE GPU is_rnu flag — never a national aggregate. The SuDocUH
 * discrepancy is NAMED and NEITHER aggregate is quoted (the two published figures disagree
 * and the brief's own instruction is to re-derive from SuDocUH before quoting any).
 */
export function frStep4RnuRefusal(mun: FrMunicipalityStatus): EnvelopeRefusal {
    return {
        code: 'no-rule-pack',
        headline: `${mun.name} (INSEE ${mun.insee}) is under the RNU — permanent refusal; no envelope asserted.`,
        detail:
            `Basis: the Géoportail de l'urbanisme municipality flag is_rnu=true for THIS commune — ` +
            'a per-commune statement, which is the only granularity this refusal relies on. Under the ' +
            "Règlement national d'urbanisme, construction is permitted only within the parties " +
            'actuellement urbanisées — a case-by-case determination by the instructing authority that ' +
            'exists in no dataset (FR-MODULE-BUILD-BRIEF §3.3/§9). No national RNU count is quoted here ' +
            'deliberately: the GPU flag census and the published SuDocUH figures disagree and that ' +
            'discrepancy is unresolved (FR-PHASE0-REPORT §2) — re-derive from the current SuDocUH ' +
            'release before quoting any aggregate.',
        ordinanceRef:
            "Géoportail de l'urbanisme, module municipality via apicarto.ign.fr — commune " +
            `${mun.name}, INSEE ${mun.insee}, is_rnu=true. Regime: Règlement national d'urbanisme ` +
            "(Code de l'urbanisme, art. L111-1 s.).",
        knownFacts: [
            `Commune: ${mun.name} (INSEE ${mun.insee})`,
            'Planning regime: RNU — national rules; no local document governs (GPU is_rnu=true, per-commune)',
            'PAU (parties actuellement urbanisées) membership: undeterminable from any dataset — never claimed',
        ],
        legallyGrounded: false,
    };
}

/** THE POS-CADUCITY REFUSAL (brief §3.2): POS is dead since 27-03-2017 → RNU fall-through. */
export function frPosCaducRefusal(
    mun: FrMunicipalityStatus,
    doc: FrDocumentAtPoint,
): EnvelopeRefusal {
    return {
        code: 'no-rule-pack',
        headline: `${mun.name} (INSEE ${mun.insee}): the served document is a POS — caduc since 27 March 2017; RNU applies. No envelope asserted.`,
        detail:
            `The Géoportail de l'urbanisme serves ${doc.name} (du_type POS) at this point. POS ` +
            "documents lapsed by law on 27 March 2017 (Code de l'urbanisme art. L174-1, loi ALUR) — " +
            'the document is treated as dead and the commune falls through to the Règlement national ' +
            `d'urbanisme (the GPU flag agrees: is_rnu=${mun.isRnu}). RNU constructibility is a per-case ` +
            'PAU determination (see the RNU refusal doctrine); the caduc POS zoning is carried below ' +
            'as historical identity only, never as a rule source.',
        ordinanceRef:
            `Géoportail de l'urbanisme via apicarto.ign.fr — document ${doc.name}` +
            `${doc.partition !== null ? `, partition ${doc.partition}` : ''}, du_type POS. ` +
            "Caducité: Code de l'urbanisme art. L174-1 (27 mars 2017). Applicable regime: RNU, art. L111-1 s.",
        knownFacts: [
            `Commune: ${mun.name} (INSEE ${mun.insee})`,
            `Served document: ${doc.name} (POS — caduc 2017-03-27, not replaced at this point)`,
            `GPU per-commune flag: is_rnu=${mun.isRnu}`,
        ],
        legallyGrounded: false,
    };
}

/** THE PSMV REFUSAL: a site-specific, building-by-building document governs (brief §3.2/§8). */
export function frPsmvRefusal(doc: FrDocumentAtPoint, zone: FrZoneIdentity | null): EnvelopeRefusal {
    const reglement = zone?.reglementDoc ?? null;
    return {
        code: 'derived-plan',
        headline: `Plan de sauvegarde et de mise en valeur ${doc.name} governs — building-by-building rules; no generic envelope derivable.`,
        detail:
            'This point lies inside a secteur sauvegardé: the PSMV regulates building by building ' +
            '(hauteurs, alignements and conservation prescriptions are drawn per parcel in the plan ' +
            "graphique), so a generic zone-rule envelope would misstate the law. The governing " +
            `expedient is ${doc.name}${reglement !== null ? ` (règlement ${reglement})` : ''}; its ` +
            'parameters live in the site-specific document and are not machine-published.',
        ordinanceRef:
            `Géoportail de l'urbanisme via apicarto.ign.fr — document ${doc.name}` +
            `${doc.partition !== null ? `, partition ${doc.partition}` : ''}, du_type PSMV. ` +
            "Regime: Code de l'urbanisme art. L313-1 s.",
        knownFacts: [
            `Governing expedient: ${doc.name} (PSMV)`,
            ...(zone !== null ? [`Zone at point: ${zone.zoneCode}${zone.zoneLabel !== null ? ` — ${zone.zoneLabel}` : ''}`] : []),
            ...(reglement !== null ? [`Règlement document: ${reglement}`] : []),
        ],
        legallyGrounded: true,
    };
}

/** THE CARTE-COMMUNALE DERIVABILITY REFUSAL: sectors zone, RNU rules apply (brief §3.2). */
export function frSecteurCcRefusal(
    mun: FrMunicipalityStatus,
    sector: FrZoneIdentity,
): EnvelopeRefusal {
    return {
        code: 'derived-plan',
        headline: `Carte communale ${sector.idurba ?? `(${mun.name})`} governs — sector zoning only; RNU rules apply. No envelope asserted.`,
        detail:
            `${mun.name} is covered by a carte communale: sector ${sector.zoneCode} zones this point, ` +
            'but a carte communale has no règlement of its own — the substantive rules are the ' +
            "Règlement national d'urbanisme applied within the drawn sectors (Code de l'urbanisme " +
            'art. L161-1 s.). Deriving numeric parameters would require the RNU per-case appreciation, ' +
            'which no dataset publishes.',
        ordinanceRef:
            "Géoportail de l'urbanisme, module secteur-cc via apicarto.ign.fr — " +
            `carte communale ${sector.idurba ?? 'id not served'}, sector ${sector.zoneCode}, commune ` +
            `${mun.name} (INSEE ${mun.insee}). Regime: art. L161-1 s. + RNU art. L111-1 s.`,
        knownFacts: [
            `Commune: ${mun.name} (INSEE ${mun.insee})`,
            `Carte communale sector: ${sector.zoneCode}${sector.sectorType !== null ? ` (typesect ${sector.sectorType})` : ''}`,
            `Instrument: ${sector.idurba ?? 'carte communale (id not served)'}`,
            'Substantive rules: RNU (a carte communale has no règlement of its own)',
        ],
        legallyGrounded: true,
    };
}

/** THE PLAN-MASSE REFUSAL (B5 gate): a drawn-volume prescription governs the point. */
export function frPlanMasseRefusal(prescription: FrPrescription): EnvelopeRefusal {
    const label = prescription.libelle ?? 'secteur de plan de masse';
    return {
        code: 'derived-plan',
        headline: `Secteur de plan de masse ("${label}") governs — the drawn plan is the envelope; no zone-rule derivation applies.`,
        detail:
            'A TYPEPSC=14 prescription (secteur de plan de masse, R151-40) covers this point: volumes ' +
            'are DRAWN in the plan-masse expedient, in three dimensions, and override the zone-rule ' +
            'path entirely (the brief routes this to the drawn-volume recipe, F-A). The drawn plan ' +
            `is the governing expedient${prescription.reglementDoc !== null ? ` (${prescription.reglementDoc}${prescription.reglementPage !== null ? `#page=${prescription.reglementPage}` : ''})` : ''}; its geometry is not re-served here.`,
        ordinanceRef:
            "Géoportail de l'urbanisme, prescription module via apicarto.ign.fr — TYPEPSC 14 " +
            `(R151-40)${prescription.idurba !== null ? `, instrument ${prescription.idurba}` : ''}` +
            `${prescription.partition !== null ? `, partition ${prescription.partition}` : ''}.`,
        knownFacts: [
            `Plan-masse prescription: ${label}`,
            ...(prescription.reglementDoc !== null ? [`Expedient document: ${prescription.reglementDoc}`] : []),
            ...(prescription.idurba !== null ? [`Instrument: ${prescription.idurba}`] : []),
        ],
        legallyGrounded: true,
    };
}

/* ────────────────────────────── the assembler ──────────────────────────── */

/** Everything the chain fetched — outcomes in, record out; the assembler stays pure. */
export interface FrNoExtractionFetches {
    readonly municipality: FetchOutcome<readonly FrGpuFeature[]>;
    readonly documents: FetchOutcome<readonly FrGpuFeature[]>;
    readonly zonesUrba: FetchOutcome<readonly FrGpuFeature[]>;
    /** null = not queried (zone-urba answered with zones, so the CC rung was skipped). */
    readonly secteursCc: FetchOutcome<readonly FrGpuFeature[]> | null;
    readonly prescriptionsSurf: FetchOutcome<readonly FrGpuFeature[]>;
    readonly prescriptionsLin: FetchOutcome<readonly FrGpuFeature[]>;
    readonly prescriptionsPct: FetchOutcome<readonly FrGpuFeature[]>;
    readonly supS: FetchOutcome<readonly FrGpuFeature[]>;
    readonly supL: FetchOutcome<readonly FrGpuFeature[]>;
    readonly supP: FetchOutcome<readonly FrGpuFeature[]>;
    /** null = not queried (no idurba was resolvable at the point). */
    readonly docUrba: FetchOutcome<readonly FrGpuFeature[]> | null;
    readonly terrain: FetchOutcome<FrElevation>;
    readonly neighbours: FetchOutcome<FrNeighbourBuildings>;
}

const isTransient = <T>(o: FetchOutcome<T>): o is { status: 'transient'; reason: string } =>
    o.status === 'transient';

/** Features of a found outcome; [] for absent (an answered empty). Callers gate transients. */
const featuresOf = (o: FetchOutcome<readonly FrGpuFeature[]>): readonly FrGpuFeature[] =>
    o.status === 'found' ? o.value : [];

/**
 * Assemble the step-4 record from classified fetches. PURE and total.
 *
 * LOAD-BEARING vs AUXILIARY (control 9 — availability must never convert to a refusal):
 *   • municipality / documents / zone-urba / secteur-cc(queried) TRANSIENT → the WHOLE
 *     outcome is transient, reason propagated VERBATIM (a GPU outage is not an RNU).
 *   • municipality ABSENT → absent (sea / not French territory — the honest absent).
 *   • auxiliary slices (prescriptions, SUP, terrain, neighbours, doc_urba join) TRANSIENT →
 *     that slice is `unresolved` with the L0 token verbatim and `retryable: true`; the rest
 *     of the record still ships (brief §1.4 — partial output over blank output).
 */
export function buildFrNoExtractionRecord(
    point: { readonly lat: number; readonly lon: number },
    fetchedAtIso: string,
    fetches: FrNoExtractionFetches,
): FetchOutcome<FrNoExtractionRecord> {
    // ── Load-bearing gates (transient propagates verbatim — control 9) ──────────
    if (isTransient(fetches.municipality)) return fetches.municipality;
    if (fetches.municipality.status === 'aborted') return fetches.municipality;
    if (fetches.municipality.status === 'absent') {
        return {
            status: 'absent',
            reason: fetches.municipality.reason,
        };
    }
    if (isTransient(fetches.documents)) return fetches.documents;
    if (fetches.documents.status === 'aborted') return fetches.documents;
    if (isTransient(fetches.zonesUrba)) return fetches.zonesUrba;
    if (fetches.zonesUrba.status === 'aborted') return fetches.zonesUrba;
    if (fetches.secteursCc !== null && isTransient(fetches.secteursCc)) return fetches.secteursCc;
    if (fetches.secteursCc !== null && fetches.secteursCc.status === 'aborted') {
        return fetches.secteursCc;
    }

    const munPick = pickFrMunicipality(featuresOf(fetches.municipality));
    if (munPick.picked === null) {
        return {
            status: 'transient',
            reason:
                'mapper-refused: gpu/municipality served feature(s) without insee/name/is_rnu — regime unreadable',
        };
    }
    const mun = munPick.picked;

    const docPick = pickFrDocument(featuresOf(fetches.documents));
    const doc = docPick.picked;

    // ── Zones (zone-urba first; secteur-cc when queried) ────────────────────────
    const zoneFeatures = featuresOf(fetches.zonesUrba);
    const zonesUrba: FrZoneIdentity[] = [];
    for (const f of zoneFeatures) {
        const z = parseFrGpuZoneFeature('zone-urba', f.properties);
        if (z !== null) zonesUrba.push(z);
    }
    const ccFeatures = fetches.secteursCc === null ? [] : featuresOf(fetches.secteursCc);
    const secteurs: FrZoneIdentity[] = [];
    for (const f of ccFeatures) {
        const z = parseFrGpuZoneFeature('secteur-cc', f.properties);
        if (z !== null) secteurs.push(z);
    }
    const zones = zonesUrba.length > 0 ? zonesUrba : secteurs;
    const zoneKind: FrZoneDocumentKind = zonesUrba.length > 0 ? 'zone-urba' : 'secteur-cc';
    const firstZone = zones[0] ?? null;

    // ── Regime classification (brief §3.2 five regimes) ─────────────────────────
    let regimeKind: FrRegimeKind;
    let regimeNote: string | null = null;
    let refusal: EnvelopeRefusal | null = null;
    if (doc !== null && doc.duType === 'POS') {
        regimeKind = 'POS-caduc';
        regimeNote =
            'POS caduc since 27 March 2017 (art. L174-1) — treated as dead; RNU applies. The zoning ' +
            'below is carried as historical identity only.';
        refusal = frPosCaducRefusal(mun, doc);
    } else if (doc !== null && doc.duType === 'PSMV') {
        regimeKind = 'PSMV';
        refusal = frPsmvRefusal(doc, firstZone);
    } else if (doc !== null && doc.duType === 'CC') {
        regimeKind = 'CC';
        regimeNote =
            'A carte communale has no règlement of its own — RNU rules apply within its sectors ' +
            '(brief §3.2).';
    } else if (doc !== null && (doc.duType === 'PLU' || doc.duType === 'PLUi')) {
        regimeKind = doc.duType;
        if (mun.isRnu) {
            regimeNote =
                `Contradiction carried verbatim: the GPU serves ${doc.name} at this point AND flags ` +
                'the commune is_rnu=true — both statements are the source’s; neither is silently dropped.';
        }
    } else if (mun.isRnu) {
        regimeKind = 'RNU';
        refusal = frStep4RnuRefusal(mun);
    } else {
        // A local document exists per the flag, but none is served at the point.
        regimeKind = mun.isRnu ? 'RNU' : 'PLU';
        const reason =
            `no-feature: gpu/document @ ${point.lat},${point.lon} — the commune has a local ` +
            `document (is_rnu=false) but none is served at this point`;
        refusal = {
            code: 'no-plan-at-point',
            headline: `${mun.name} (INSEE ${mun.insee}): no governing document is served at this point — no envelope asserted.`,
            detail:
                `The Géoportail de l'urbanisme knows the commune (${mun.name}, is_rnu=false — a local ` +
                'document exists) but serves no document and no zone at this point. That is a durable ' +
                'statement about published coverage, not an outage; PRYZM will not guess which ' +
                'instrument applies.',
            ordinanceRef:
                "Géoportail de l'urbanisme via apicarto.ign.fr — document: 0 features; " +
                `municipality: ${mun.name} (INSEE ${mun.insee}), is_rnu=false.`,
            knownFacts: [
                `Commune: ${mun.name} (INSEE ${mun.insee})`,
                'A local planning document exists (is_rnu=false) but none is published at this point',
            ],
            legallyGrounded: false,
        };
        const munProvenance: FrSliceProvenance = {
            source: gpuSource('apicarto gpu/municipality', { object_id: `INSEE ${mun.insee}` }),
            ...validityFrom(null, fetchedAtIso),
            retrieved_at: fetchedAtIso,
        };
        // Emit the partial record honestly: regime resolved as the flag's statement, the
        // zone/uses/doc slices unresolved by the same named absence.
        return {
            status: 'found',
            value: {
                country: 'FR',
                product: 'fr-no-extraction-record',
                point,
                retrievedAt: fetchedAtIso,
                regime: resolved(
                    {
                        regime: regimeKind,
                        commune: mun,
                        communeSelectionRule: munPick.selectionRule,
                        isRnuFlag: mun.isRnu,
                        duType: null,
                        duTypeVerbatim: null,
                        documentName: null,
                        partition: null,
                        gpuDocId: null,
                        documentSelectionRule: null,
                        note: 'Regime inferred from the per-commune is_rnu flag alone — no document served at the point.',
                    },
                    munProvenance,
                ),
                derivability: unresolved(reason, false),
                zone: unresolved(reason, false),
                permittedUses: unresolved(reason, false),
                prescriptions: buildPrescriptionsSlice(point, fetchedAtIso, fetches),
                sup: buildSupSlice(point, fetchedAtIso, fetches),
                terrain: buildTerrainSlice(fetches.terrain, fetchedAtIso),
                neighbours: buildNeighboursSlice(fetches.neighbours, fetchedAtIso),
                governingDocument: unresolved(reason, false),
                refusal,
                // ⚠ THIS BRANCH IS THE `genuinely-missing` CASE and the packs must say so by
                // SILENCE, not by an answer: `is_rnu=false` declares a local document, and none was
                // served. The regime is `undetermined-declared-not-served`, so NEITHER pack speaks —
                // the national articles do not apply (a local document exists) and there are no
                // prescriptions to read. Emitting a state here would answer for an instrument
                // nobody has seen.
                ruleStates: frEnvelopeRuleStates({
                    facts: { isRnu: mun.isRnu, duType: null, zoneServed: false, secteurCcServed: false },
                    prescriptions: [],
                    ref: {
                        country: 'FR',
                        authority: FR_GPU_AUTHORITY,
                        dataset: 'zone_urba',
                        plan_id: null,
                        object_id: null,
                        document: null,
                        article: null,
                        page: null,
                    },
                    reglementReachable: false,
                }),
            },
        };
    }

    // ── Slice: regime ───────────────────────────────────────────────────────────
    const regimeValidity = validityFrom(doc?.approvalDateFromName ?? null, fetchedAtIso);
    const regimeSlice = resolved<FrRegime>(
        {
            regime: regimeKind,
            commune: mun,
            communeSelectionRule: munPick.selectionRule,
            isRnuFlag: mun.isRnu,
            duType: doc?.duType ?? null,
            duTypeVerbatim: doc?.duTypeVerbatim ?? null,
            documentName: doc?.name ?? null,
            partition: doc?.partition ?? null,
            gpuDocId: doc?.gpuDocId ?? null,
            documentSelectionRule: docPick.selectionRule,
            note: regimeNote,
        },
        {
            source: gpuSource('apicarto gpu/municipality + gpu/document', {
                plan_id: doc?.name ?? null,
                object_id: `INSEE ${mun.insee}`,
                document: doc?.partition ?? null,
            }),
            ...regimeValidity,
            retrieved_at: fetchedAtIso,
        },
    );

    // ── Slice: derivability (the B5-class gate) ────────────────────────────────
    const planMasse =
        fetches.prescriptionsSurf.status === 'found'
            ? featuresOf(fetches.prescriptionsSurf)
                  .map((f) => parseFrPrescription('surf', f.properties))
                  .find((p): p is FrPrescription => p !== null && p.typepsc === '14') ?? null
            : null;
    let derivabilitySlice: FrSlice<FrDerivability>;
    if (regimeKind === 'RNU' || regimeKind === 'POS-caduc') {
        derivabilitySlice = resolved<FrDerivability>(
            {
                class: 'rnu-no-derivation',
                trigger: null,
                expedient: null,
                note: 'RNU: constructibility is a per-case PAU determination by the instructing authority — no derivation path exists in any dataset (brief §3.3/§9).',
            },
            {
                source: gpuSource('apicarto gpu/municipality', { object_id: `INSEE ${mun.insee}` }),
                ...validityFrom(null, fetchedAtIso),
                retrieved_at: fetchedAtIso,
            },
        );
    } else if (regimeKind === 'PSMV') {
        derivabilitySlice = resolved<FrDerivability>(
            {
                class: 'derived-plan-governs',
                trigger: 'psmv',
                expedient: doc?.name ?? null,
                note: 'PSMV: building-by-building drawn rules — the site-specific document governs (Recipe 1); zone-rule derivation does not apply.',
            },
            {
                source: gpuSource('apicarto gpu/document', {
                    plan_id: doc?.name ?? null,
                    document: doc?.partition ?? null,
                }),
                ...regimeValidity,
                retrieved_at: fetchedAtIso,
            },
        );
        // The PSMV refusal is already set at regime level.
    } else if (regimeKind === 'CC' && firstZone !== null && zoneKind === 'secteur-cc') {
        derivabilitySlice = resolved<FrDerivability>(
            {
                class: 'derived-plan-governs',
                trigger: 'secteur-cc',
                expedient: firstZone.idurba ?? doc?.name ?? null,
                note: 'Carte communale: sectors zone the land but carry no règlement — RNU rules apply within them; no zone-rule derivation path exists.',
            },
            {
                source: gpuSource('apicarto gpu/secteur-cc', {
                    plan_id: firstZone.idurba,
                    object_id: `sector ${firstZone.zoneCode}`,
                }),
                ...validityFrom(firstZone.instrumentDate, fetchedAtIso),
                retrieved_at: fetchedAtIso,
            },
        );
        refusal = refusal ?? frSecteurCcRefusal(mun, firstZone);
    } else if (planMasse !== null) {
        derivabilitySlice = resolved<FrDerivability>(
            {
                class: 'derived-plan-governs',
                trigger: 'plan-masse',
                expedient:
                    planMasse.reglementDoc ??
                    planMasse.libelle ??
                    `TYPEPSC 14 @ ${planMasse.partition ?? 'partition not served'}`,
                note: 'Secteur de plan de masse (TYPEPSC 14, R151-40): volumes are drawn in the expedient — the drawn plan governs (F-A path); zone-rule derivation does not apply here.',
            },
            {
                source: gpuSource('apicarto gpu/prescription-surf (TYPEPSC 14)', {
                    plan_id: planMasse.idurba,
                    object_id: planMasse.libelle,
                    document: planMasse.reglementDoc,
                    page: planMasse.reglementPage,
                }),
                ...validityFrom(null, fetchedAtIso),
                retrieved_at: fetchedAtIso,
            },
        );
        refusal = refusal ?? frPlanMasseRefusal(planMasse);
    } else if (isTransient(fetches.prescriptionsSurf)) {
        // The B5 gate CANNOT be evaluated without prescription-surf — saying
        // 'reglement-text-path' while blind to a possible plan-masse would overstate.
        derivabilitySlice = unresolved(
            `${fetches.prescriptionsSurf.reason} — the derivability gate needs prescription-surf (TYPEPSC 14 plan-masse detection) and the source did not answer`,
            true,
        );
    } else {
        derivabilitySlice = resolved<FrDerivability>(
            {
                class: 'reglement-text-path',
                trigger: null,
                expedient: null,
                note: 'No derived plan governs the point (no PSMV, no carte-communale sector, no TYPEPSC-14 plan-masse served). Numeric parameters await règlement-text extraction (brief steps 6–7) — none are asserted here.',
            },
            {
                source: gpuSource('apicarto gpu/document + gpu/prescription-surf', {
                    plan_id: doc?.name ?? null,
                }),
                ...regimeValidity,
                retrieved_at: fetchedAtIso,
            },
        );
    }

    // ── Slice: zone ─────────────────────────────────────────────────────────────
    let zoneSlice: FrSlice<FrZoneSlice>;
    if (firstZone !== null) {
        zoneSlice = resolved<FrZoneSlice>(
            { documentKind: zoneKind, zones },
            {
                source: gpuSource(`apicarto gpu/${zoneKind}`, {
                    plan_id: firstZone.idurba,
                    object_id: `zone ${zones.map((z) => z.zoneCode).join(' · ')}`,
                    document: firstZone.reglementDoc,
                    page: firstZone.reglementPage,
                }),
                ...validityFrom(
                    frYyyymmddToIso(zoneFeatures[0]?.properties['datvalid']) ??
                        frYyyymmddToIso(zoneFeatures[0]?.properties['datappro']) ??
                        firstZone.instrumentDate,
                    fetchedAtIso,
                ),
                retrieved_at: fetchedAtIso,
            },
        );
    } else {
        zoneSlice = unresolved(
            regimeKind === 'RNU'
                ? `no-feature: gpu/zone-urba and gpu/secteur-cc @ ${point.lat},${point.lon} — RNU commune, no zoning published`
                : `no-feature: gpu/zone-urba and gpu/secteur-cc @ ${point.lat},${point.lon}`,
            false,
        );
    }

    // ── Slice: permitted uses (Phase-0: DEST* near-empty — the règlement holds them) ──
    // ⚠ NEVER read uses off a DEAD instrument: a caduc POS zone row can still serve the
    // old-standard DESTDOMI (measured live at Artigue 2026-09-02) — serving it as current
    // permitted uses would resurrect a document the law killed. RNU/POS-caduc go to the
    // per-case branch below regardless of what the historical zone row carries.
    let usesSlice: FrSlice<FrPermittedUses>;
    if (
        firstZone !== null &&
        zoneKind === 'zone-urba' &&
        regimeKind !== 'RNU' &&
        regimeKind !== 'POS-caduc'
    ) {
        const zp = zoneFeatures[0]!.properties;
        const destOui = str(zp['destoui']);
        const destCdt = str(zp['destcdt']);
        const destNon = str(zp['destnon']);
        const destDomi = str(zp['destdomi']);
        if (destOui !== null || destCdt !== null || destNon !== null || destDomi !== null) {
            usesSlice = resolved<FrPermittedUses>(
                {
                    destOui,
                    destCdt,
                    destNon,
                    destDomi,
                    note: 'DEST* codes served on the zone row, carried verbatim (a rare filled case — national fill is 0.84–1.23%, FR-PHASE0 §2).',
                },
                {
                    source: gpuSource('apicarto gpu/zone-urba (DESTOUI/DESTCDT/DESTNON/DESTDOMI)', {
                        plan_id: firstZone.idurba,
                        object_id: `zone ${firstZone.zoneCode}`,
                        document: firstZone.reglementDoc,
                        page: firstZone.reglementPage,
                    }),
                    ...validityFrom(firstZone.instrumentDate, fetchedAtIso),
                    retrieved_at: fetchedAtIso,
                },
            );
        } else {
            usesSlice = unresolved(
                'permitted uses are not machine-served: DESTOUI/DESTCDT/DESTNON are empty on the zone row ' +
                    '(0.84–1.23% national fill — FR-PHASE0 §2 measured; they live in the règlement text). ' +
                    `Governing règlement reference: ${firstZone.reglementDoc ?? 'not served'}` +
                    `${firstZone.reglementPage !== null ? `, zone chapter from page ${firstZone.reglementPage}` : ''}` +
                    ` (zone ${firstZone.zoneCode}). No default is asserted.`,
                false,
            );
        }
    } else {
        usesSlice = unresolved(
            regimeKind === 'RNU' || regimeKind === 'POS-caduc'
                ? 'RNU regime: permitted uses are a per-case determination under art. L111-1 s. — not derivable from any dataset'
                : regimeKind === 'CC'
                  ? 'carte communale: no règlement of its own — uses follow the RNU within sectors (art. L161-1 s.)'
                  : `no-feature: gpu/zone-urba @ ${point.lat},${point.lon} — no zone row to read uses from`,
            false,
        );
    }

    // ── Auxiliary slices ────────────────────────────────────────────────────────
    const prescriptionsSlice = buildPrescriptionsSlice(point, fetchedAtIso, fetches);
    const supSlice = buildSupSlice(point, fetchedAtIso, fetches);
    const terrainSlice = buildTerrainSlice(fetches.terrain, fetchedAtIso);
    const neighboursSlice = buildNeighboursSlice(fetches.neighbours, fetchedAtIso);

    // ── Slice: governing document (name + DATAPPRO + ETAT + links — brief step-4 §8) ──
    let governingSlice: FrSlice<FrGoverningDocument>;
    const idurba = firstZone?.idurba ?? doc?.name ?? null;
    if (regimeKind === 'RNU' || regimeKind === 'POS-caduc') {
        governingSlice = resolved<FrGoverningDocument>(
            {
                name: "Règlement national d'urbanisme",
                duType: null,
                idurba: null,
                datappro: null,
                etat: null,
                nomreg: null,
                docUrbaJoin: 'not-queried',
                docUrbaRowCount: 0,
                docUrbaSelectionRule: null,
                downloadByPartitionUrl: null,
                legifranceUrl: FR_LEGIFRANCE_CODE_URBANISME_URL,
                legifranceArticles: FR_REGIME_ARTICLES[regimeKind],
            },
            {
                source: {
                    country: 'FR',
                    authority: 'Légifrance (DILA)',
                    dataset: "Code de l'urbanisme",
                    plan_id: null,
                    object_id: null,
                    document: FR_LEGIFRANCE_CODE_URBANISME_URL,
                    article: regimeKind === 'RNU' ? 'L111-1 s.' : 'L174-1; L111-1 s.',
                    page: null,
                },
                validityBasis: 'legal',
                valid_from: '2017-03-27', // POS caducity / current RNU regime baseline
                retrieved_at: fetchedAtIso,
            },
        );
    } else if (doc !== null) {
        let etat: string | null = null;
        let datappro: string | null = null;
        let nomreg: string | null = null;
        let docUrbaJoin: FrGoverningDocument['docUrbaJoin'] = 'not-queried';
        let docUrbaRowCount = 0;
        let docUrbaSelectionRule: string | null = null;
        const docUrbaOutcome = fetches.docUrba;
        if (docUrbaOutcome !== null) {
            if (docUrbaOutcome.status === 'transient' || docUrbaOutcome.status === 'aborted') {
                docUrbaJoin = 'unavailable-transient';
            } else if (docUrbaOutcome.status === 'absent') {
                docUrbaJoin = 'no-row';
            } else {
                const rowPick = pickFrDocUrbaRow(docUrbaOutcome.value);
                docUrbaJoin = rowPick.picked !== null ? 'joined' : 'no-row';
                docUrbaRowCount = rowPick.rowCount;
                docUrbaSelectionRule = rowPick.selectionRule;
                etat = rowPick.picked?.etat ?? null;
                datappro = rowPick.picked?.datappro ?? null;
                nomreg = rowPick.picked?.nomreg ?? null;
            }
        }
        governingSlice = resolved<FrGoverningDocument>(
            {
                name: doc.name,
                duType: doc.duType,
                idurba,
                datappro,
                etat,
                nomreg,
                docUrbaJoin,
                docUrbaRowCount,
                docUrbaSelectionRule,
                downloadByPartitionUrl:
                    doc.partition !== null
                        ? `${FR_GPU_DOWNLOAD_BY_PARTITION_BASE}${doc.partition}`
                        : null,
                legifranceUrl: FR_LEGIFRANCE_CODE_URBANISME_URL,
                legifranceArticles: FR_REGIME_ARTICLES[regimeKind],
            },
            {
                source: gpuSource('apicarto gpu/document + wfs_du:doc_urba (ETAT/DATAPPRO join)', {
                    plan_id: idurba,
                    document: nomreg ?? firstZone?.reglementDoc ?? null,
                }),
                ...validityFrom(
                    frYyyymmddToIso(datappro) ?? doc.approvalDateFromName,
                    fetchedAtIso,
                ),
                retrieved_at: fetchedAtIso,
            },
        );
    } else {
        governingSlice = unresolved(
            `no-feature: gpu/document @ ${point.lat},${point.lon} — no governing document served`,
            false,
        );
    }

    // ── §FR-RESOLUTION — the rule packs, REACHED (lane ENVELOPE-FR, 2026-09-04) ────────────────
    // ⭐ THIS CALL IS THE POINT. Seven pure FR rule packs shipped with ZERO consumers outside their
    // own tests; `frEnvelopeRuleStates` composes them and THIS is the production caller that makes
    // them run. Exporting a pack makes it importable; only a caller makes it reachable.
    //
    // ⛔ IT ADDS NO NUMBER THIS RECORD DID NOT ALREADY HOLD, and it must not: the slice is a TYPED
    // READING of facts already fetched above (regime, prescriptions, document), not a new fetch and
    // not an envelope. The L-616 prohibition in this file's header stands — no bounded volume is
    // asserted anywhere in this type.
    //
    // ⚠ FRONTAGE AND PAU DO NOT RUN HERE, deliberately. Both need the parcel RING, and this record
    // is POINT-addressed (see the header: it rides beside the parcel row, never instead of it). A
    // caller holding the ring passes `geometry` and gets A3/A4 plus a derived B5; this seam holds no
    // ring, so it passes none rather than inventing one from the query point.
    const ruleStates = frEnvelopeRuleStates({
        facts: {
            isRnu: mun.isRnu,
            duType: doc?.duType ?? null,
            zoneServed: zonesUrba.length > 0,
            secteurCcServed: secteurs.length > 0,
        },
        prescriptions:
            prescriptionsSlice.status === 'resolved'
                ? prescriptionsSlice.value.atPoint.map((p) => ({
                    typepsc: p.typepsc,
                    stypepsc: p.stypepsc,
                    nature: p.nature,
                    libelle: p.libelle,
                    txt: p.txt,
                    nomfic: p.reglementDoc,
                    idurba: p.idurba,
                }))
                : [],
        ref: {
            country: 'FR',
            authority: FR_GPU_AUTHORITY,
            dataset: 'zone_urba',
            plan_id: firstZone?.idurba ?? doc?.name ?? null,
            object_id: null,
            document: firstZone?.reglementDoc ?? null,
            article: null,
            page: firstZone?.reglementPage ?? null,
        },
        // A document is REACHABLE when the publisher pointed at one. Absent that, a gap is
        // `missing-source` (go find the document) rather than `pdf` (go parse the one we have) —
        // two different remedies that must never share a label.
        reglementReachable:
            firstZone?.reglementDoc !== null && firstZone?.reglementDoc !== undefined,
    });

    return {
        status: 'found',
        value: {
            country: 'FR',
            product: 'fr-no-extraction-record',
            point,
            retrievedAt: fetchedAtIso,
            regime: regimeSlice,
            derivability: derivabilitySlice,
            zone: zoneSlice,
            permittedUses: usesSlice,
            prescriptions: prescriptionsSlice,
            sup: supSlice,
            terrain: terrainSlice,
            neighbours: neighboursSlice,
            governingDocument: governingSlice,
            refusal,
            ruleStates,
        },
    };
}

/* ────────────────────────────── auxiliary slice builders ───────────────── */

function buildPrescriptionsSlice(
    point: { readonly lat: number; readonly lon: number },
    fetchedAtIso: string,
    fetches: FrNoExtractionFetches,
): FrSlice<FrPrescriptionsSlice> {
    const legs: ReadonlyArray<readonly ['surf' | 'lin' | 'pct', FetchOutcome<readonly FrGpuFeature[]>]> = [
        ['surf', fetches.prescriptionsSurf],
        ['lin', fetches.prescriptionsLin],
        ['pct', fetches.prescriptionsPct],
    ];
    // ONE transient leg makes the slice unresolved: 2-of-3 shown as complete would silently
    // understate constraints (a lin setback line invisible because the lin leg was down).
    for (const [kind, leg] of legs) {
        if (leg.status === 'transient' || leg.status === 'aborted') {
            return unresolved(
                `${leg.status === 'transient' ? leg.reason : 'aborted'} — prescription-${kind} did not answer; a partial prescription set would understate, so none is shown`,
                true,
            );
        }
    }
    const atPoint: FrPrescription[] = [];
    const counts = { surf: 0, lin: 0, pct: 0 };
    for (const [kind, leg] of legs) {
        for (const f of featuresOf(leg)) {
            const p = parseFrPrescription(kind, f.properties);
            if (p !== null) {
                atPoint.push(p);
                counts[kind] += 1;
            }
        }
    }
    atPoint.sort(
        (a, b) =>
            a.geometryKind.localeCompare(b.geometryKind) ||
            a.typepsc.localeCompare(b.typepsc) ||
            (a.stypepsc ?? '').localeCompare(b.stypepsc ?? '') ||
            (a.gid ?? -1) - (b.gid ?? -1),
    );
    const first = atPoint[0] ?? null;
    return resolved<FrPrescriptionsSlice>(
        { atPoint, counts: { ...counts }, scopeNote: FR_GPU_SCOPE_NOTE },
        {
            source: gpuSource('apicarto gpu/prescription-{surf,lin,pct}', {
                plan_id: first?.idurba ?? null,
                object_id: `${atPoint.length} prescription(s) @ ${point.lat},${point.lon}`,
            }),
            ...validityFrom(null, fetchedAtIso),
            retrieved_at: fetchedAtIso,
        },
    );
}

function buildSupSlice(
    point: { readonly lat: number; readonly lon: number },
    fetchedAtIso: string,
    fetches: FrNoExtractionFetches,
): FrSlice<FrSupSlice> {
    const legs: ReadonlyArray<readonly ['s' | 'l' | 'p', FetchOutcome<readonly FrGpuFeature[]>]> = [
        ['s', fetches.supS],
        ['l', fetches.supL],
        ['p', fetches.supP],
    ];
    for (const [kind, leg] of legs) {
        if (leg.status === 'transient' || leg.status === 'aborted') {
            return unresolved(
                `${leg.status === 'transient' ? leg.reason : 'aborted'} — assiette-sup-${kind} did not answer; a partial SUP set would understate, so none is shown`,
                true,
            );
        }
    }
    const assiettes: FrSupAssiette[] = [];
    const counts = { s: 0, l: 0, p: 0 };
    for (const [kind, leg] of legs) {
        for (const f of featuresOf(leg)) {
            const a = parseFrSupAssiette(kind, f.properties);
            if (a !== null) {
                assiettes.push(a);
                counts[kind] += 1;
            }
        }
    }
    assiettes.sort(
        (a, b) =>
            a.geometryKind.localeCompare(b.geometryKind) ||
            (a.categorie ?? '').localeCompare(b.categorie ?? '') ||
            (a.idass ?? '').localeCompare(b.idass ?? '') ||
            (a.gid ?? -1) - (b.gid ?? -1),
    );
    return resolved<FrSupSlice>(
        { assiettes, counts: { ...counts }, scopeNote: FR_GPU_SCOPE_NOTE },
        {
            source: gpuSource('apicarto gpu/assiette-sup-{s,l,p} (acte via the assiette `fichier`)', {
                object_id: `${assiettes.length} assiette(s) @ ${point.lat},${point.lon}`,
            }),
            ...validityFrom(null, fetchedAtIso),
            retrieved_at: fetchedAtIso,
        },
    );
}

function buildTerrainSlice(
    terrain: FetchOutcome<FrElevation>,
    fetchedAtIso: string,
): FrSlice<FrTerrainSlice> {
    if (terrain.status === 'transient' || terrain.status === 'aborted') {
        return unresolved(terrain.status === 'transient' ? terrain.reason : 'aborted', true);
    }
    if (terrain.status === 'absent') {
        return unresolved(terrain.reason, false);
    }
    return resolved<FrTerrainSlice>(
        {
            elevationM: terrain.value.elevationM,
            accuracy: terrain.value.accuracy,
            resource: terrain.value.resource,
            datumNote:
                'Point elevation at the query coordinate (RGE ALTI). The règlement’s datum ' +
                'DEFINITION (terrain naturel avant travaux / rasant measured at the façade — L-584) ' +
                'is a legal fact this value does not resolve.',
        },
        {
            source: {
                country: 'FR',
                authority: FR_GEOPLATEFORME_AUTHORITY,
                dataset: `RGE ALTI — altimetrie REST elevation.json (resource ${terrain.value.resource})`,
                plan_id: null,
                object_id: null,
                document: null,
                article: null,
                page: null,
            },
            validityBasis: 'ingestion',
            valid_from: fetchedAtIso.slice(0, 10),
            retrieved_at: fetchedAtIso,
        },
    );
}

function buildNeighboursSlice(
    neighbours: FetchOutcome<FrNeighbourBuildings>,
    fetchedAtIso: string,
): FrSlice<FrNeighbourBuildings> {
    if (neighbours.status === 'transient' || neighbours.status === 'aborted') {
        return unresolved(neighbours.status === 'transient' ? neighbours.reason : 'aborted', true);
    }
    if (neighbours.status === 'absent') {
        return unresolved(neighbours.reason, false);
    }
    return resolved<FrNeighbourBuildings>(neighbours.value, {
        source: {
            country: 'FR',
            authority: FR_GEOPLATEFORME_AUTHORITY,
            dataset: 'BD TOPO® batiment — hauteur (LoD1, photogrammetric; vintage per feature)',
            plan_id: null,
            object_id: null,
            document: null,
            article: null,
            page: null,
        },
        validityBasis: 'ingestion',
        valid_from: fetchedAtIso.slice(0, 10),
        retrieved_at: fetchedAtIso,
    });
}
