// ADAPTER (STUB) — Barcelona RPUC enumerator.
//
// The BCN-specific half of the pipeline: RPUC Angular REST
// `basica → detall → documents`, in-force from `detall.vigencia` + the AMB
// `expedients_refos` register (`EXP_DEROG` / `RECURS_O_SENTENCIA` / `TANCAMENT_OUT`).
//
// ⚠ THIS IS A STUB. It ships the SHAPE (URL construction + the Stage-0 metadata
// mapping) so the interface is exercised and the core is wired; the live RPUC
// fetch is the Barcelona city agent's task (`ORDINANCE-EXTRACTION-PIPELINE.md`
// WIRING TODO §2). `enumerate` here builds refs from a caller-supplied seed list
// rather than hitting the network — keeping the package pure/offline-testable.

import {
    type EnumerationQuery,
    type OrdinanceDocumentRef,
    type OrdinanceEnumerator,
} from '../enumerator.js';
import { type SupersessionInput } from '../gates/supersessionGate.js';

/** The RPUC document endpoint (L-590e §1 / L-590g §1). */
export const RPUC_DOCUMENT_ENDPOINT =
    'https://dtes.gencat.cat/RPUC-portal/rest/consulta/documents';

/** Build the inline-download URL for an RPUC document id. */
export function rpucDocumentUrl(documentId: string, idioma: 'ca' | 'es' = 'ca'): string {
    return `${RPUC_DOCUMENT_ENDPOINT}?documentId=${encodeURIComponent(documentId)}&downloadType=inline&idioma=${idioma}`;
}

/** A minimal RPUC seed a live enumerator (or a test) supplies per document. */
export interface RpucDocumentSeed {
    readonly documentId: string;
    readonly instrument: string;
    /** `detall.vigencia` verbatim, e.g. 'VIGENT' / 'DEROGAT'. */
    readonly vigencia?: string;
    /** AMB expedients_refos flags. */
    readonly expDerogated?: boolean;
    readonly closedOut?: boolean;
    readonly underAppeal?: boolean;
    readonly textLayer?: OrdinanceDocumentRef['textLayer'];
    readonly imageRegime?: OrdinanceDocumentRef['imageRegime'];
}

function toSupersession(seed: RpucDocumentSeed): SupersessionInput {
    return {
        vigencia: seed.vigencia,
        expDerogated: seed.expDerogated,
        closedOut: seed.closedOut,
        underAppeal: seed.underAppeal,
    };
}

/**
 * Barcelona RPUC enumerator (stub). Construct with the seed list the live
 * `basica→detall` walk would produce; `enumerate` returns the refs with URLs +
 * Stage-0 metadata attached. Swapping in the live REST walk is a drop-in change to
 * this class only — the core does not change.
 */
export class BarcelonaRpucEnumerator implements OrdinanceEnumerator {
    readonly cityId = 'es-ct/08019-barcelona';
    readonly displayName = 'Barcelona (RPUC)';

    constructor(private readonly seeds: readonly RpucDocumentSeed[]) {}

    async enumerate(query: EnumerationQuery): Promise<readonly OrdinanceDocumentRef[]> {
        const limit = query.limit ?? this.seeds.length;
        return this.seeds.slice(0, limit).map((seed) => ({
            documentId: seed.documentId,
            cityId: this.cityId,
            instrument: seed.instrument,
            fetchUrl: rpucDocumentUrl(seed.documentId),
            supersession: toSupersession(seed),
            textLayer: seed.textLayer ?? null,
            imageRegime: seed.imageRegime ?? null,
        }));
    }
}
