// A.1 (Phase A · Sprint 1) — Stage 1 helpers: briefCapture.
//
// Stage 1 normalises the RAC-chatbot brief into a `ValidatedBrief`.  The
// shape of the brief metadata is typology-specific, but every pack uses
// this helper to drop unknown / dangerous keys and normalise typed
// primitives (numbers, strings, booleans, ISO dates).
//
// This file ships PURE helpers — the actual Stage 1 BriefStage handler
// each typology pack composes is the one place the per-typology schema
// validation runs (Zod, per C03).

/**
 * Drop keys whose values are `undefined`, functions, symbols, or objects
 * containing functions / cycles.  Result is JSON-serialisable.
 */
export function sanitiseBriefMetadata(
    metadata: Record<string, unknown>,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (isJsonSafe(value)) {
            out[key] = value;
        }
    }
    return out;
}

function isJsonSafe(value: unknown): boolean {
    if (value === null) return true;
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') return true;
    if (t === 'function' || t === 'symbol' || t === 'undefined') return false;
    if (Array.isArray(value)) {
        return value.every(isJsonSafe);
    }
    if (t === 'object') {
        // Defensive against cycles: stringify once.
        try {
            JSON.stringify(value);
            return true;
        } catch {
            return false;
        }
    }
    return false;
}
