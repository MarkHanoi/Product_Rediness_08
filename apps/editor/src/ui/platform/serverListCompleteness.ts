/**
 * serverListCompleteness — §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400)
 *
 * ─── THE DEFECT THIS MODULE EXISTS TO MAKE IMPOSSIBLE ───────────────────────
 *
 * `ProjectHub.syncFromServer()` builds
 *
 *     const serverIds = new Set(summaries.map(s => s.id));
 *
 * and then treats `!serverIds.has(localId)` as **"the server does not have this
 * project."** It is not. It is *"this project is not in the rows the server
 * chose to send."*
 *
 * ⭐ MEASURED, 2026-08-24. Every server list path is hard-capped at FIFTY rows,
 * with **no pagination, no offset and no total**:
 *
 *   • `server/projectStore.js:372`  — `ORDER BY p.updated_at DESC LIMIT 50`
 *     (the PG path, reached by `GET /api/v1/projects`, which is what the hub's
 *     `runtime.persistence.client.list()` actually calls)
 *   • `server/projectStore.js:353`  — `rows.slice(0, 50)` (in-memory fallback)
 *   • `server.js:2927`              — `.limit(50)` (Supabase path)
 *   • `server/dbMigrate.js:67` names it outright: *"ORDER BY updated_at DESC
 *     LIMIT 50: the hub's first query on every load."*
 *
 * The founder's console then reported, in the same boot:
 *
 *     thumbnails: 50 row(s) …            ← the server list, SATURATED at the cap
 *     47 project(s) exist ONLY in this browser
 *     3 project(s) were KEPT that the previous code would have DELETED
 *
 * **50 sent + 47 + 3 unmatched.** The hub has ~100 local rows, the server
 * returns the newest 50, and the other 50 were classified as *absent from the
 * server* — a conclusion the data cannot support and which, before L-1289,
 * DELETED them.
 *
 * ─── THE RULING ─────────────────────────────────────────────────────────────
 *
 * **Absence may only be concluded from a COMPLETE enumeration.** A page is a
 * sample. Reading "not in this page" as "does not exist" is the same defect
 * shape as reading `count === 0` as "the user has nothing" (`localOnlyProjectFate`)
 * and as reading a `GetCapabilities` document as an inventory of layers: an
 * instrument that cannot express "there is more" being asked a question only a
 * complete instrument can answer.
 *
 * ⭐ THE KEY MOVE: a saturated page is INDISTINGUISHABLE from a complete one that
 * happens to hold exactly `limit` rows. So `rowCount >= limit` cannot mean
 * "truncated" — it means **"completeness is UNKNOWN"**, and unknown must never
 * be resolved in the destructive direction. Only two things establish
 * completeness: a short page (fewer rows than asked for), or the server saying
 * so explicitly.
 *
 * ⚠ THIS WORKS AGAINST THE ALREADY-DEPLOYED SERVER. The inference needs no new
 * field: a client that asks for nothing gets at most 50, so `rowCount >= 50` is
 * already the honest "unknown" signal today. `serverDeclaredHasMore` is the
 * exact answer once the paginated route ships, and supersedes the inference —
 * it is checked FIRST for that reason.
 *
 * ─── WHY THIS IS A PURE FUNCTION IN ITS OWN FILE ────────────────────────────
 *
 * The old inference was one `Set` construction inside a 270-line method that
 * needs a DOM, a runtime, a server and an IndexedDB to reach. That is why a
 * rule governing whether the founder's projects get deleted shipped with no
 * test. Here each rule is one assertion over three numbers.
 */

/**
 * The page size every server list path applies when the caller asks for
 * nothing. Sourced from `server/projectStore.js` (`LIMIT 50` / `slice(0, 50)`)
 * and `server.js:2927` (`.limit(50)`).
 *
 * ⚠ This constant is a FALLBACK for talking to a server that does not declare
 * its own paging, never a source of truth. When the server states `hasMore`,
 * that wins — see `assessListCompleteness`.
 */
export const LEGACY_SERVER_PAGE_LIMIT = 50;

/**
 * What a single list response actually established about the whole collection.
 *
 * ⚠ Deliberately THREE arms, not a boolean. The middle arm is the one the old
 * code could not express, and its absence is the entire defect: with only
 * `complete | truncated` available, a saturated page has to be filed as one or
 * the other, and it is neither.
 */
export type ListCompleteness =
    /** Every row the server holds for this user is in `rowCount`. Absence is
     *  concludable. */
    | { readonly kind: 'complete'; readonly rowCount: number; readonly basis: CompletenessBasis }
    /** The server stated there are more rows beyond this page. Absence is NOT
     *  concludable — and here we positively know it is not. */
    | { readonly kind: 'truncated'; readonly rowCount: number; readonly basis: 'server-declared-has-more' }
    /** The page came back full. It may be the entire collection, or the first
     *  slice of a much larger one — **the response cannot tell these apart**.
     *  Absence is NOT concludable. */
    | { readonly kind: 'unknown'; readonly rowCount: number; readonly pageLimit: number; readonly basis: 'page-saturated' };

export type CompletenessBasis =
    /** The server explicitly said no further rows exist. Authoritative. */
    | 'server-declared-no-more'
    /** Fewer rows came back than were asked for — a short page ends a
     *  collection under every paging scheme in use here. */
    | 'short-page';

export interface ListReading {
    /** How many rows the server actually returned. */
    readonly rowCount: number;
    /**
     * The page size the CLIENT asked for. `undefined` means the client sent no
     * `limit`, in which case the server's own default applies and
     * `LEGACY_SERVER_PAGE_LIMIT` is the best available estimate of it.
     */
    readonly requestedLimit?: number;
    /**
     * The server's own statement about whether further rows exist.
     * `undefined` = the server did not say (every currently-deployed route).
     *
     * ⚠ `undefined` is a THIRD state and is NOT `false`. Coercing "it did not
     * say" to "there is no more" would re-create this module's own defect one
     * level up — a missing reading collapsing into a meaningful one, exactly
     * the trap `localOnlyProjectFate` records for `indexVersionCount`.
     */
    readonly serverDeclaredHasMore?: boolean;
}

/**
 * Classify what a list response established.
 *
 * ⚠ ORDER IS LOAD-BEARING. The server's own declaration is consulted BEFORE any
 * count arithmetic, so an explicit answer is never overridden by an inference
 * drawn from row counts the server has already explained.
 */
export function assessListCompleteness(reading: ListReading): ListCompleteness {
    const { rowCount, requestedLimit, serverDeclaredHasMore } = reading;

    // 1 — The server answered the question directly. Nothing below improves on it.
    if (serverDeclaredHasMore === true) {
        return { kind: 'truncated', rowCount, basis: 'server-declared-has-more' };
    }
    if (serverDeclaredHasMore === false) {
        return { kind: 'complete', rowCount, basis: 'server-declared-no-more' };
    }

    // 2 — No declaration. Infer from the shape of the page, using the client's
    // own requested size when it set one and the deployed default otherwise.
    const pageLimit = requestedLimit ?? LEGACY_SERVER_PAGE_LIMIT;

    // A SHORT page ends the collection: the server had room for more and sent
    // none. This is the only inference that establishes completeness.
    if (rowCount < pageLimit) {
        return { kind: 'complete', rowCount, basis: 'short-page' };
    }

    // 3 — ⭐ THE SATURATED PAGE. `rowCount >= pageLimit`. This is the founder's
    // exact reading (50 of 50) and it is genuinely ambiguous: a user with
    // precisely 50 projects and a user with 500 produce the identical response.
    // Refuse to guess.
    return { kind: 'unknown', rowCount, pageLimit, basis: 'page-saturated' };
}

/**
 * ⭐ THE GATE THE PURGE BRANCH MUST PASS.
 *
 * True only when the reading enumerated the whole collection. Everything else —
 * including a page that is full purely by coincidence — leaves "the server does
 * not have X" unproven, and an unproven absence must never delete anything or
 * be reported to a user as fact.
 */
export function mayConcludeAbsence(c: ListCompleteness): boolean {
    return c.kind === 'complete';
}

/**
 * One-line, honest description for the console. Names the BASIS, not just the
 * verdict — the founder's whole exposure was invisible because a saturated page
 * and a complete one printed the same line.
 */
export function describeCompleteness(c: ListCompleteness): string {
    switch (c.kind) {
        case 'complete':
            return c.basis === 'server-declared-no-more'
                ? `COMPLETE (${c.rowCount} row(s); the server declared no further pages)`
                : `COMPLETE (${c.rowCount} row(s); short page — the server had room for more and sent none)`;
        case 'truncated':
            return `TRUNCATED (${c.rowCount} row(s); the server declared MORE rows exist beyond this page)`;
        case 'unknown':
            return (
                `UNKNOWN (${c.rowCount} row(s) = the page limit of ${c.pageLimit} — a saturated page is ` +
                'indistinguishable from a complete one, so absence from this list proves nothing)'
            );
    }
}
