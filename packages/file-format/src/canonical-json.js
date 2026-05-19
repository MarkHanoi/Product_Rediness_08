// canonical-json — RFC 8785-style JSON canonicaliser.
//
// Per plan §5.4 (Determinism contract): "JSON is canonicalised
// (RFC 8785 JSON Canonicalization Scheme)".  This is the bedrock the
// `family-round-trip` byte-exact gate sits on.
//
// What we implement:
//   • Object keys serialised in lexicographic order (UTF-16 code-unit
//     ordering, which matches `Array.prototype.sort()` and JS string
//     comparison — same ordering RFC 8785 mandates for the JCS
//     subset most tooling actually uses).
//   • No insignificant whitespace.
//   • Numbers serialised via the shortest decimal that round-trips
//     (`Number.prototype.toString()` already does this; we explicitly
//     reject non-finite inputs).
//   • Strings: standard JSON.stringify escaping (\u00..7F + \\ + \").
//
// Out-of-scope (we don't need them for our shape):
//   • Bigint / Decimal — we never serialise non-Number numerics.
//   • Custom replacer/reviver hooks.
export class CanonicalJsonError extends Error {
    constructor(message) {
        super(`[file-format/canonical-json] ${message}`);
        this.name = 'CanonicalJsonError';
    }
}
export function canonicalise(value) {
    if (value === null)
        return 'null';
    if (value === undefined) {
        throw new CanonicalJsonError('cannot canonicalise undefined');
    }
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new CanonicalJsonError(`non-finite number ${value}`);
        }
        // -0 → 0 to keep round-trip stable.
        if (Object.is(value, -0))
            return '0';
        return JSON.stringify(value);
    }
    if (typeof value === 'string')
        return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map(canonicalise).join(',')}]`;
    }
    if (typeof value === 'object') {
        const obj = value;
        const keys = Object.keys(obj).sort();
        const parts = [];
        for (const k of keys) {
            const v = obj[k];
            if (v === undefined)
                continue; // mirror JSON.stringify: drop undefined values
            parts.push(`${JSON.stringify(k)}:${canonicalise(v)}`);
        }
        return `{${parts.join(',')}}`;
    }
    throw new CanonicalJsonError(`unsupported value type ${typeof value}`);
}
/** Encode a canonicalised JSON value as UTF-8 bytes. */
export function canonicaliseBytes(value) {
    return new TextEncoder().encode(canonicalise(value));
}
//# sourceMappingURL=canonical-json.js.map