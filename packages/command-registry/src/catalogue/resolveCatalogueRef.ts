// resolveCatalogueRef — ADR-0314 §Reference resolution.
//
// THE generic forgiving catalogue lookup: human/RAC-supplied reference → catalogue
// entry, with an explicit precedence ladder and honest ambiguity handling. This is
// the §FIX-CHAT-TYPE-REF-TOO-STRICT ladder EXTRACTED from
// `walls/UpdateWallsSystemTypeBatchCommand.ts` so that door types, window types,
// floor/ceiling types, materials, views and every future project catalogue reuse
// ONE implementation instead of growing a rival matcher each (the two-sources-of-
// truth defect the capability registry exists to prevent).
//
// Precedence (first hit wins — deterministic even when a user names a custom
// entry after a built-in id):
//   1. exact id
//   2. exact name
//   3. case-insensitive, whitespace-trimmed name
//   4. UNAMBIGUOUS word subset — every meaningful word the user typed appears in
//      the entry's name or id, and EXACTLY ONE entry qualifies. Ambiguity returns
//      null, never a coin-flip (§CONTEXT-DATA-HONESTY): the caller refuses and
//      lists candidates rather than silently applying the wrong assembly.
//
// Noise words and pure-dimension tokens are dropped from the comparison so
// "interior partition" can mean "Interior – Partition 100mm" without the user
// reproducing an en-dash and a dimension. Callers add DOMAIN noise words (e.g.
// 'wall' for wall types, 'door' for door types) on top of the generic set.
//
// Never throws; returns null on no-match AND on ambiguity — `resolvedBy`
// distinguishes them for callers that want to phrase the refusal differently.
// P8: one bounded span per resolution.

import { trace, type Tracer } from '@opentelemetry/api';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/** The minimal read surface every project catalogue already exposes. */
export interface CatalogueReader<T extends CatalogueEntry> {
    getById(id: string): T | undefined;
    getAll(): T[];
}

/** The minimal entry shape: every PRYZM catalogue store's records carry these. */
export interface CatalogueEntry {
    readonly id: string;
    readonly name: string;
}

export type CatalogueResolvedBy =
    | 'id'
    | 'name'
    | 'name-case-insensitive'
    | 'name-word-subset'
    | 'ambiguous'
    | 'unresolved';

export interface CatalogueResolution<T extends CatalogueEntry> {
    /** The entry, or null on no-match AND on ambiguity. */
    readonly entry: T | null;
    readonly resolvedBy: CatalogueResolvedBy;
    /** On 'ambiguous': the qualifying candidates, so a refusal can LIST them. */
    readonly candidates?: readonly T[];
}

/** Words that carry no discriminating meaning in any catalogue name. Domain
 *  noise ('wall', 'door', …) is supplied per call. Dimensions are dropped too:
 *  nobody says "interior partition one hundred millimetres". */
const GENERIC_NOISE = new Set(['the', 'a', 'an', 'and', 'type', 'default', 'mm']);

/** Split a name or id into comparable words: lowercase, punctuation and
 *  en-dashes gone, noise + pure-dimension tokens ('100mm', '250') dropped. */
export function catalogueNameWords(s: string, domainNoise?: ReadonlySet<string>): string[] {
    return s
        .toLowerCase()
        .replace(/[‐-―]/g, ' ')       // – — ‒ etc.
        .split(/[^a-z0-9]+/)
        .filter(
            (w) =>
                w.length > 0 &&
                !GENERIC_NOISE.has(w) &&
                !(domainNoise?.has(w) ?? false) &&
                !/^\d+(?:mm|cm|m)?$/.test(w),
        );
}

export interface ResolveCatalogueRefOptions {
    /** Extra noise words for this domain (e.g. ['wall','walls','wt'] for wall
     *  system types) — dropped from BOTH the query and the candidate names. */
    readonly domainNoise?: readonly string[];
    /** Span-attribute prefix; defaults to 'pryzm.catalogue'. Keep it a bounded
     *  domain constant (never user text) — P8. */
    readonly spanDomain?: string;
}

/**
 * Resolve a catalogue reference through the 4-tier ladder. See module header.
 */
export function resolveCatalogueRef<T extends CatalogueEntry>(
    reader: CatalogueReader<T>,
    ref: string,
    opts?: ResolveCatalogueRefOptions,
): CatalogueResolution<T> {
    const domain = opts?.spanDomain ?? 'pryzm.catalogue';
    return _tracer().startActiveSpan(`${domain}.resolveRef`, (span) => {
        try {
            const done = (r: CatalogueResolution<T>): CatalogueResolution<T> => {
                span.setAttribute(`${domain}.resolvedBy`, r.resolvedBy);
                if (r.resolvedBy === 'ambiguous') {
                    span.setAttribute(`${domain}.candidates`, r.candidates?.length ?? 0);
                }
                return r;
            };

            const byId = reader.getById(ref);
            if (byId) return done({ entry: byId, resolvedBy: 'id' });

            const all = reader.getAll();
            const byName = all.find((t) => t.name === ref);
            if (byName) return done({ entry: byName, resolvedBy: 'name' });

            const needle = ref.trim().toLowerCase();
            const byLooseName = all.find((t) => t.name.trim().toLowerCase() === needle);
            if (byLooseName) return done({ entry: byLooseName, resolvedBy: 'name-case-insensitive' });

            const domainNoise = opts?.domainNoise !== undefined ? new Set(opts.domainNoise) : undefined;
            const wanted = catalogueNameWords(ref, domainNoise);
            if (wanted.length > 0) {
                const candidates = all.filter((t) => {
                    const haystack = new Set([
                        ...catalogueNameWords(t.name, domainNoise),
                        ...catalogueNameWords(t.id, domainNoise),
                    ]);
                    return wanted.every((w) => haystack.has(w));
                });
                if (candidates.length === 1) {
                    return done({ entry: candidates[0]!, resolvedBy: 'name-word-subset' });
                }
                if (candidates.length > 1) {
                    return done({ entry: null, resolvedBy: 'ambiguous', candidates });
                }
            }

            return done({ entry: null, resolvedBy: 'unresolved' });
        } finally {
            span.end();
        }
    });
}
