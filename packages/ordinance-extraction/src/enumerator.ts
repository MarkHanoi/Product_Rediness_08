// @pryzm/ordinance-extraction — the per-city ENUMERATOR interface (the ONLY
// per-city part; everything from "profile" onward is shared —
// `ORDINANCE-EXTRACTION-PIPELINE.md` §1).
//
// The enumerator differs per city (Barcelona RPUC `basica→detall→documents`,
// Córdoba COACo WFS + visor). The extract+verify CORE is shared. Building the
// core per-city would re-implement the safety-critical verification N times — the
// exact anti-pattern the platform-spine memory warns against.
//
// Pure interface: the concrete adapters do the I/O; the core consumes the refs.

import { type SupersessionInput } from './gates/supersessionGate.js';

/** The two orthogonal profiling axes the pilot measured (L-590g §2). */
export type TextLayer = 'has-text' | 'no-text';
export type ImageRegime =
    | 'born-digital-text'
    | 'clean-raster'
    | 'clean-laser-scan'
    | 'faded-typewriter'
    | 'degraded-photo'
    | 'handwritten';

/**
 * A document the enumerator surfaced, with the metadata Stage 0/1 need. The
 * `supersession` block is what the Stage-0 gate consumes BEFORE the document is
 * fetched for extraction.
 */
export interface OrdinanceDocumentRef {
    /** RPUC `idDocument` / COACo file id — stable per city. */
    readonly documentId: string;
    /** ISO 3166-2-ish city id, e.g. `'es-ct/08019-barcelona'`. */
    readonly cityId: string;
    /** The instrument name, e.g. "PP Can Figuerola". */
    readonly instrument: string;
    /** Where the document is fetched from (the adapter owns the protocol quirks). */
    readonly fetchUrl: string;
    /** The in-force signals for the Stage-0 gate (resolved from the city register). */
    readonly supersession: SupersessionInput;
    /** Stage-1 profile axes, where the enumerator can pre-compute them (else null). */
    readonly textLayer: TextLayer | null;
    readonly imageRegime: ImageRegime | null;
}

/** What the caller asks a city enumerator to list. */
export interface EnumerationQuery {
    /** A zone/calificación code, an expedient id, or a bbox — city-specific meaning. */
    readonly selector: string;
    /** Cap the number of documents returned (the caller batches). */
    readonly limit?: number;
}

/**
 * The per-city adapter contract. Implemented once per city; the shared pipeline
 * takes ANY implementation and runs the identical extract+verify core over its
 * documents.
 */
export interface OrdinanceEnumerator {
    /** The city this enumerator serves. */
    readonly cityId: string;
    /** Human label, e.g. "Barcelona (RPUC)". */
    readonly displayName: string;
    /** List the documents matching a query (with Stage-0 metadata attached). */
    enumerate(query: EnumerationQuery): Promise<readonly OrdinanceDocumentRef[]>;
}
