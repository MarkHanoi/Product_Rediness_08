// §CADASTRAL-AREA-IS-A-DECLARED-CAPABILITY (C57 §1.14.3, lane CADASTRAL 2026-09-09)
// THE REGISTER'S OWN STATEMENT OF HOW MANY IT MATCHED.
//
// ⭐ WHY THIS EXISTS AND WHY IT IS ONE MODULE.
// C57 §1.14.3 requires an area answer to say whether it is showing ALL the parcels or only the
// first N. The first cut INFERRED that from the count cap (`served >= cap ⇒ truncated`), which is
// a guess dressed as a fact: it over-claims truncation whenever a register happens to hold exactly
// `cap` parcels, and it under-claims whenever the register silently ignores the cap.
//
// ⛔ AND IT DOES IGNORE IT — measured, not assumed. Live Catastro, Barcelona Eixample, 300 m,
// `&count=400`: the collection came back with `numberMatched="547" numberReturned="547"` while the
// parser yielded 400. The register both (a) matched 547, and (b) reported `numberReturned` as its
// MATCH count rather than its RETURN count, so `numberReturned` is not trustworthy here. WFS 2.0
// `numberMatched` is, and it is the one number that answers the question directly: 547 exist, 400
// are in your hand, so the drawing is incomplete and the overlay must say so.
//
// ⚠ COMPARE `numberMatched` AGAINST WHAT WE ACTUALLY SERVE — never against the raw feature count.
// A feature can also be lost between the wire and the answer (an unparseable ring, a missing
// citable identifier — both legitimately dropped upstream of here). The user's question is not
// "did the cap bind?", it is *"am I looking at all of them?"*, and a parcel dropped for being
// unreadable is just as absent from the drawing as one the cap cut off. One comparison answers
// both, and it answers them in the honest direction.
//
// ⛔ ONE IMPLEMENTATION, DELIBERATELY IN ITS OWN FILE. Both the Spain (GML) and the EU (GeoJSON)
// area legs need this, and a three-line regex copied into two proxies is the
// [[same-rule-two-implementations]] shape at its most tempting — small enough to look harmless,
// and silent when the copies drift.

/**
 * Read the WFS 2.0 `numberMatched` a register reports for a query, across both encodings:
 *   · GML  — the `numberMatched="N"` attribute on `<wfs:FeatureCollection>`.
 *   · JSON — the `"numberMatched": N` member of the GeoJSON FeatureCollection.
 *
 * Returns `null` when the register publishes none — which is a real state and not a zero: a
 * register that does not say how many it matched has told us nothing, and the caller must fall
 * back to the cap heuristic rather than concluding "nothing was truncated".
 *
 * ⚠ `numberMatched="unknown"` is a legal WFS 2.0 value (a server that will not count) and maps to
 * `null` here for exactly that reason — it is the register declining to answer, not an answer.
 *
 * @param {string} text raw response body
 * @returns {number | null}
 */
export function readWfsMatchedCount(text) {
    if (typeof text !== 'string' || text.length === 0) return null;
    // ⚠ The KEY's own closing quote is optional: GML writes `numberMatched="547"` and GeoJSON
    // writes `"numberMatched":667`. Omitting it matched the GML form only — and silently, by
    // returning null, which the caller correctly reads as "the register published no count".
    // That is the worst possible failure for this function: it degrades to the guess it exists
    // to replace, with nothing anywhere reporting that it did.
    const m = /numberMatched"?\s*[=:]\s*"?(\d+)"?/.exec(text);
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The C57 §1.14.3 truncation verdict, from the best evidence available.
 *
 * @param {number} servedCount how many parcels this answer actually carries
 * @param {number | null} matchedCount the register's own `numberMatched`, or null if unpublished
 * @param {number} cap the count cap this query asked for
 * @returns {boolean} whether parcels exist in this window that the answer does not carry
 */
export function isTruncated(servedCount, matchedCount, cap) {
    // The register's own count is authoritative when it published one.
    if (matchedCount !== null && matchedCount !== undefined) return matchedCount > servedCount;
    // ⚠ Otherwise infer from the cap, with `>=` and not `>`: an answer landing EXACTLY on the cap is
    // indistinguishable from one the cap cut short, and the honest reading of an indistinguishable
    // pair is the one that under-claims completeness.
    return servedCount >= cap;
}
