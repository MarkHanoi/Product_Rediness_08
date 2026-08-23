/**
 * commandLogCursor.js — §CATCHUP-CURSOR-NOT-TIMESTAMP (L-10043)
 *
 * ⛔ HANDOFF ARTEFACT. This module is DESIGN + PROOF for lane PERF5. It is
 * deliberately NOT wired into `GET /api/projects/:id/commands` yet, because
 * step 2 below needs a schema migration and step 1 changes the shape of a
 * cursor that live clients already hold. Naming that here rather than letting
 * it become another authored-but-unwired surprise.
 *
 * ─── WHAT PRYZM HAS ─────────────────────────────────────────────────────────
 *
 * Collaboration catch-up resumes from a TIMESTAMP:
 *
 *     GET /api/projects/:id/commands?since=<ISO>&excludeSelf=1
 *     ... WHERE project_id = $1 AND created_at > $2 ORDER BY created_at ASC LIMIT 500
 *
 * and the client advances that baseline with `nextCatchUpBaseline()`
 * (`apps/editor/src/engine/initCollaboration.ts`). Pascal resumes from an
 * INTEGER (`Last-Event-ID`).
 *
 * ─── DEFECT A — CLOCK SKEW. ALREADY FIXED, DO NOT RE-FIX. ───────────────────
 *
 * §FIX-REPLAY-AT-MOST-ONCE (L-814) closed it: the baseline was stamped from the
 * CLIENT clock and compared against a SERVER column. It now advances only in
 * server time (newest `created_at` received, else the echoed `serverNow`), and
 * keeps the previous value rather than guessing when neither is available. That
 * fix is correct and this design does not disturb it.
 *
 * ─── DEFECT B — THE ONE STILL OPEN: A TIE AT THE PAGE BOUNDARY LOSES ROWS ───
 *
 * `created_at` is not unique and the query is paged at 500.
 *
 *   • Postgres `NOW()` is TRANSACTION-START time, so every row a batched write
 *     inserts in one transaction carries the IDENTICAL `created_at`. A
 *     multi-level generate writes hundreds of command-log rows this way.
 *   • When such a run of equal timestamps STRADDLES the 500-row page boundary,
 *     the page ends mid-run. The client then advances its baseline to that
 *     timestamp and asks for `created_at > it` — and the remainder of the run,
 *     which shares that exact timestamp, is NEVER DELIVERED.
 *
 * ⭐ That is silent, permanent loss of peer edits on catch-up, and no amount of
 * clock discipline fixes it: `nextCatchUpBaseline` is already correct and still
 * loses these rows, because the ORDER the cursor is expressed in is not TOTAL.
 * `commandLogCursor.test.ts` drives exactly this and shows the loss.
 *
 * ─── STEP 1 — COMPOSITE CURSOR. NO MIGRATION. FIXES DEFECT B TODAY. ─────────
 *
 *     ORDER BY created_at ASC, id ASC
 *     WHERE project_id = $1 AND (created_at, id) > ($2, $3)
 *
 * Postgres row-value comparison gives a TOTAL order over an existing PRIMARY
 * KEY, so no two rows compare equal and no tie can straddle a page. The wire
 * cursor is the opaque string `<iso>|<id>` (`formatCompositeCursor` /
 * `parseCompositeCursor` below). The existing index `idx_pcl_project_time` is
 * `(project_id, created_at DESC)` and should become `(project_id, created_at,
 * id)` for this to stay an index scan.
 *
 * ⚠ It is still a timestamp underneath, so it inherits the requirement that the
 * server owns the clock. That requirement is already met.
 *
 * ─── STEP 2 — `seq BIGSERIAL`, THE SHAPE PASCAL PROVES ─────────────────────
 *
 * `project_command_log.id` is TEXT PRIMARY KEY, so there is no ordered integer
 * today. Add `seq BIGSERIAL`, return `latestSeq` on subscribe, accept
 * `?fromSeq=`. `apps/sync-server` already implements and tests this protocol
 * (`__tests__/Reconnect.test.ts` replays from `fromSeq`) — the implementation
 * exists, it is in the undeployed app.
 *
 * ⛔ THE GOTCHA THAT "CORRECT BY CONSTRUCTION" HIDES, AND THE REASON THIS FILE
 * EXISTS RATHER THAN A ONE-LINE RECOMMENDATION:
 *
 * A `BIGSERIAL` is assigned at INSERT time and becomes VISIBLE at COMMIT time,
 * and those orders are not the same. Two concurrent writers can take seq 100 and
 * 101, and 101 can commit FIRST. A reader that polls in between sees 101, sets
 * its cursor to 101, and row 100 — committed a moment later — is skipped
 * FOREVER. This is strictly worse than defect B: it is rarer and it is silent.
 *
 * Pascal never meets it because its store is single-writer SQLite. PRYZM's is
 * not. So step 2 is only correct with ONE of:
 *
 *   (a) read to a WATERMARK, never to the maximum: only deliver rows with
 *       `seq < (the lowest seq any in-flight transaction could still commit)`,
 *       derived from `pg_current_snapshot()` / `pg_snapshot_xmin`; or
 *   (b) allocate `seq` under the same lock that serialises the insert, so
 *       assignment order IS commit order; or
 *   (c) keep the composite cursor from step 1 as the durable one and treat
 *       `seq` as a display/monotonicity hint only.
 *
 * ⭐ RECOMMENDATION TO PERF5: ship STEP 1. It fixes the loss that is actually
 * happening, needs no migration, no dual-read window and no watermark, and it
 * leaves step 2 available. Do not ship a bare `MAX(seq)` cursor.
 *
 * Pure and total. Never throws, never reads a clock, no I/O.
 *
 * Contract: C08 §3.3 (catch-up). Source:
 * docs/04-reference/AUDIT/D-collab-persistence.md §6 row 5.
 */

/** Separator for the opaque composite cursor. `|` cannot appear in an ISO timestamp. */
const COMPOSITE_SEP = '|';

/**
 * @typedef {{created_at?: string, id?: string}} CommandLogRow
 */

/**
 * Encode a composite cursor for the wire.
 *
 * @param {string} createdAt — the row's server-side `created_at`, ISO 8601.
 * @param {string} id — the row's primary key.
 * @returns {string}
 */
export function formatCompositeCursor(createdAt, id) {
    return `${createdAt}${COMPOSITE_SEP}${id}`;
}

/**
 * Decode a composite cursor. Total: returns `null` for anything it does not
 * recognise, including a bare legacy timestamp, so a caller can fall back to
 * the timestamp path rather than 400 a client mid-migration.
 *
 * @param {unknown} cursor
 * @returns {{createdAt: string, id: string}|null}
 */
export function parseCompositeCursor(cursor) {
    if (typeof cursor !== 'string' || cursor.length === 0) return null;
    const at = cursor.indexOf(COMPOSITE_SEP);
    if (at <= 0 || at === cursor.length - 1) return null;
    const createdAt = cursor.slice(0, at);
    const id = cursor.slice(at + 1);
    if (Number.isNaN(Date.parse(createdAt))) return null;
    return { createdAt, id };
}

/**
 * Decide the next composite cursor from a page of rows.
 *
 * ⭐ THE DIFFERENCE FROM `nextCatchUpBaseline` IN ONE LINE: that function takes
 * the MAXIMUM `created_at` in the page, which is ambiguous when several rows
 * share it. This takes the LAST ROW OF THE PAGE under the same total order the
 * query used, which is never ambiguous.
 *
 * @param {string|null} previous — the cursor that produced this page.
 * @param {{commands?: CommandLogRow[], serverNow?: string}} response
 * @returns {string|null} the next cursor, or `previous` when the page carried
 *   nothing usable. Never guesses: a stale cursor costs one redundant request,
 *   a wrong one loses data.
 */
export function nextCompositeCursor(previous, response) {
    const rows = Array.isArray(response?.commands) ? response.commands : [];
    // The page is returned in (created_at, id) ASC order, so the LAST row is the
    // frontier. Scanning for a maximum instead would reintroduce the tie.
    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        const createdAt = row?.created_at;
        const id = row?.id;
        if (typeof createdAt === 'string' && createdAt.length > 0
            && typeof id === 'string' && id.length > 0) {
            return formatCompositeCursor(createdAt, id);
        }
    }
    return previous ?? null;
}

/**
 * Total order over two rows, matching Postgres row-value comparison of
 * `(created_at, id)`. Exported so a test — and the in-memory backend — can use
 * exactly the comparator the SQL uses, rather than a lookalike.
 *
 * @param {CommandLogRow} a
 * @param {CommandLogRow} b
 * @returns {number}
 */
export function compareRows(a, b) {
    const at = String(a?.created_at ?? '');
    const bt = String(b?.created_at ?? '');
    if (at < bt) return -1;
    if (at > bt) return 1;
    const ai = String(a?.id ?? '');
    const bi = String(b?.id ?? '');
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
}

/**
 * Reference implementation of the STEP 1 page query, so the test can drive the
 * exact semantics the SQL must have and PERF5 has something to port rather than
 * a paragraph to interpret.
 *
 * SQL equivalent:
 *   SELECT ... WHERE project_id = $1 AND (created_at, id) > ($2, $3)
 *   ORDER BY created_at ASC, id ASC LIMIT $4
 *
 * @param {CommandLogRow[]} allRows — every row for the project, any order.
 * @param {string|null} cursor — a composite cursor, or null for "from the start".
 * @param {number} limit
 * @returns {{rows: CommandLogRow[], nextCursor: string|null, hasMore: boolean}}
 */
export function pageByCompositeCursor(allRows, cursor, limit) {
    const parsed = parseCompositeCursor(cursor);
    const sorted = [...allRows].sort(compareRows);
    const after = parsed === null
        ? sorted
        : sorted.filter(r => compareRows(r, { created_at: parsed.createdAt, id: parsed.id }) > 0);
    const rows = after.slice(0, limit);
    return {
        rows,
        nextCursor: nextCompositeCursor(cursor, { commands: rows }),
        hasMore: after.length > rows.length,
    };
}

/**
 * Reference implementation of the CURRENT (timestamp-only) page query. Present
 * ONLY so the test can demonstrate the loss it commits; never call it from
 * product code.
 *
 * SQL equivalent:
 *   SELECT ... WHERE created_at > $2 ORDER BY created_at ASC LIMIT $3
 *
 * @param {CommandLogRow[]} allRows
 * @param {string|null} sinceIso
 * @param {number} limit
 * @returns {{rows: CommandLogRow[], nextSince: string|null}}
 */
export function pageByTimestampCursor(allRows, sinceIso, limit) {
    const sorted = [...allRows].sort(compareRows);
    const after = sinceIso === null || sinceIso === undefined
        ? sorted
        : sorted.filter(r => String(r.created_at) > sinceIso);
    const rows = after.slice(0, limit);
    // Mirrors `nextCatchUpBaseline`: the MAXIMUM created_at actually received.
    let newest = null;
    for (const r of rows) {
        const at = r?.created_at;
        if (typeof at === 'string' && at.length > 0 && (newest === null || at > newest)) newest = at;
    }
    return { rows, nextSince: newest ?? sinceIso ?? null };
}
