/**
 * emptySnapshotGuard.js — §GUARD-EMPTY-SNAPSHOT (L-10040)
 *
 * THE THIRD LAYER of the wipe defence: the server refuses to accept a version
 * whose snapshot is BARE over a project whose stored latest version is
 * POPULATED, unless the caller explicitly asks for it with `force: true`.
 *
 * WHY THE SERVER AND NOT ONLY THE CLIENT. `PlatformSaveController` says it in
 * its own comment: *"the server copy is the durable authority and is the
 * recovery path out of a full local origin"*. A wipe that reaches the server
 * becomes the snapshot every future session restores, on every device. A wipe
 * that is refused here stays a local-only accident.
 *
 * ⛔ THE STANDARD THIS MUST MEET, and the reason the ceiling is 0 and not
 * Pascal's 4: **a refusal firing on a legitimate save is worse than the hole it
 * closes.** So the refusal is the narrowest one that closes anything —
 *
 *   REFUSE  iff  the incoming snapshot contains ZERO content elements
 *          AND   the stored latest version contains AT LEAST ONE
 *          AND   the caller did not pass `force: true`.
 *
 * Every other shape is accepted, including:
 *   • the first version of a project (nothing stored → nothing to lose);
 *   • empty over empty (a new project autosaving its scaffold);
 *   • a snapshot whose shape this module cannot read (never refuse on a guess);
 *   • any save the user asked for explicitly.
 *
 * ⚠ THE COUNT IS DERIVED FROM THE SNAPSHOT, NEVER FROM `body.elementCount`.
 * That field is client-supplied and defaults to 0 in the route. Keying the
 * refusal on it would 409 any correct client that simply omitted the field —
 * a false refusal on a legitimate save, i.e. exactly the failure mode above.
 *
 * ⚠ THE STORED SIDE IS FAIL-OPEN. `project_versions.element_count` is also
 * client-supplied at write time. A stored 0 against a genuinely populated
 * stored snapshot means "do not refuse", which is the safe direction: we lose
 * a guard, we never invent a rejection.
 *
 * Cost: `countSnapshotElements` reads at most 20 array `.length`s off an
 * already-parsed object — O(20), no walk. The route only pays the extra
 * stored-count DB read when the incoming count is ZERO, so a normal save
 * (elements > 0) pays literally nothing.
 *
 * Contract: C13 §Project-lifecycle (a save may not silently destroy the
 * project it names), C48 §Backup-and-DR (the server copy is the recovery path).
 * Ported from the Pascal editor audit, docs/04-reference/AUDIT/D-collab-persistence.md §3.5 and §6 row 2.
 */

/**
 * The count at or below which a snapshot is "bare".
 *
 * Pascal uses 4 (`STRUCTURAL_NODE_COUNT`) because its graph always carries a
 * few structural nodes. PRYZM's content arrays are genuinely empty on a fresh
 * project, so 0 is both correct and the narrowest possible refusal window.
 * Raising it would start refusing real one-wall and two-wall projects.
 */
export const BARE_SNAPSHOT_CEILING = 0;

/**
 * The snapshot arrays that count as authored content.
 *
 * Mirrors `ProjectSerializer.elementCount`'s 14 families and ADDS the hosted /
 * derived arrays (windows, doors, openings, curtain panels, room bounding
 * lines) so that a snapshot holding only hosted elements is never called bare.
 *
 * ⛔ `levels` and `grids` are DELIBERATELY EXCLUDED. Both are re-seeded by
 * `ClearProjectCommand`, so a wiped scene still serialises a default level and
 * grid. Counting them would make this guard structurally unable to ever fire —
 * a guard on a path nothing takes.
 */
export const CONTENT_ARRAYS = Object.freeze([
    // The 14 that ProjectSerializer sums into `elementCount`.
    'walls', 'slabs', 'ceilings', 'floors', 'columns', 'stairs',
    'beams', 'curtainWalls', 'roofs', 'furniture',
    'handrails', 'plumbing', 'rooms', 'lighting',
    // Hosted + derived content that also represents real authoring.
    'windows', 'doors', 'openings', 'curtainPanels', 'roomBoundingLines',
]);

/**
 * Count the authored content elements in a snapshot object.
 *
 * @param {unknown} snapshot
 * @returns {number|null} the count, or `null` when the shape carries none of
 *   the known arrays at all — "unreadable", which the decider treats as
 *   "accept", never as "empty".
 */
export function countSnapshotElements(snapshot) {
    if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        return null;
    }
    let total = 0;
    let sawAnyKnownArray = false;
    for (const key of CONTENT_ARRAYS) {
        const value = snapshot[key];
        if (Array.isArray(value)) {
            sawAnyKnownArray = true;
            total += value.length;
        }
    }
    return sawAnyKnownArray ? total : null;
}

/**
 * @typedef {object} EmptySnapshotVerdict
 * @property {boolean} accept        — true when the write may proceed.
 * @property {string}  code          — machine-readable outcome code.
 * @property {string}  reason        — human-readable sentence naming WHAT was
 *                                     refused (or why it was allowed) and WHY.
 * @property {number|null} incoming  — content elements in the incoming snapshot.
 * @property {number|null} stored    — content elements in the stored latest version.
 */

/**
 * Decide whether a version write may proceed. Pure, total, never throws.
 *
 * @param {object}  opts
 * @param {number|null} opts.incomingElementCount — from `countSnapshotElements`;
 *   `null` means the shape was unreadable.
 * @param {number|null} opts.storedElementCount — the stored latest version's
 *   element count; `null` or `undefined` means "no stored version" OR "not
 *   known", both of which accept.
 * @param {boolean} [opts.force] — the caller explicitly asked to overwrite.
 * @returns {EmptySnapshotVerdict}
 */
export function decideSnapshotWrite(opts) {
    const incoming = typeof opts?.incomingElementCount === 'number' && Number.isFinite(opts.incomingElementCount)
        ? opts.incomingElementCount
        : null;
    const stored = typeof opts?.storedElementCount === 'number' && Number.isFinite(opts.storedElementCount)
        ? opts.storedElementCount
        : null;

    if (incoming === null) {
        return {
            accept: true,
            code: 'accepted_shape_unreadable',
            reason: 'Accepted: the snapshot carries none of the known content arrays, so this guard cannot tell empty from unrecognised and refuses to guess.',
            incoming, stored,
        };
    }
    if (incoming > BARE_SNAPSHOT_CEILING) {
        return {
            accept: true,
            code: 'accepted_not_bare',
            reason: `Accepted: the incoming snapshot carries ${incoming} content elements.`,
            incoming, stored,
        };
    }
    if (stored === null) {
        return {
            accept: true,
            code: 'accepted_no_stored_baseline',
            reason: 'Accepted: this project has no stored populated version to lose.',
            incoming, stored,
        };
    }
    if (stored <= BARE_SNAPSHOT_CEILING) {
        return {
            accept: true,
            code: 'accepted_stored_also_bare',
            reason: `Accepted: the stored latest version is itself bare (${stored} elements), so nothing is destroyed.`,
            incoming, stored,
        };
    }
    if (opts?.force === true) {
        return {
            accept: true,
            code: 'accepted_forced',
            reason: `Accepted under force:true: an empty snapshot is replacing a stored version holding ${stored} elements, at the caller's explicit request.`,
            incoming, stored,
        };
    }
    return {
        accept: false,
        code: 'empty_snapshot_rejected',
        reason:
            `REFUSED this version write: the snapshot posted has ${incoming} content elements, ` +
            `while the latest stored version of this project has ${stored}. ` +
            'Saving it would make an empty model the state every future session restores. ' +
            'If the project really was emptied on purpose, re-send with "force": true. ' +
            'No stored version was modified or deleted by this refusal.',
        incoming, stored,
    };
}

/**
 * The HTTP body for a refusal. Carries BOTH numbers and the escape hatch by
 * name, so the client can render the trade rather than a bare 409.
 *
 * @param {EmptySnapshotVerdict} verdict
 */
export function emptySnapshotRejectionBody(verdict) {
    return {
        error: 'Refusing to overwrite a populated project with an empty snapshot.',
        code: verdict.code,
        reason: verdict.reason,
        incomingElementCount: verdict.incoming,
        storedElementCount: verdict.stored,
        override: 'Re-send the same request with "force": true to save it anyway.',
    };
}
