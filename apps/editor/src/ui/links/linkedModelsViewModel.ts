/**
 * linkedModelsViewModel — the PURE read model behind the Linked Models panel.
 *
 * ── WHY THE PANEL DOES NOT COMPUTE ITS OWN SENTENCES ────────────────────────
 *
 * Everything a user acts on here is a REFUSAL or a COST, and both have been wrong
 * in this repository before in the same way: the surface computed its own version
 * of a decision the engine had already made, the two drifted, and the UI said
 * "yes" about something the handler then refused ([[refusing-half-needs-its-
 * escape-hatch]]). `linkBusHandlers.decideAnchor` names that trap explicitly.
 *
 * So the panel renders THIS file, this file renders `resolveLinkAnchor` and
 * `linkedModelController.getStatus`, and neither the panel nor this module has an
 * opinion of its own about placement. Pure — no DOM, no I/O, no clock — so the
 * whole decision table is testable without a browser, which is the only reason the
 * C83 presentation below can be pinned by a test rather than asserted in a comment.
 *
 * Contracts: C83 (IMPOSSIBLE / INADVISABLE / FINE), C74 (a refusal names BOTH
 * numbers), C82 §1.2 (no control that dispatches into nothing), ADR-0346 D4/D5/D6.
 * Issue-log L-3156.
 */

import {
    formatMetres,
    resolveLinkAnchor,
    type LinkAnchorDecision,
    type LinkGeoOrigin,
    type LinkedModelRef,
} from '@pryzm/schemas';
import type { LinkStatus } from '../../engine/links/linkedModelController';

// ── The C83 presentation ─────────────────────────────────────────────────────

/** What the create dialog offers for a given verdict. */
export type LinkAnchorAffordance =
    /** Auto-align is derivable and plausible. One primary action. */
    | 'link-now'
    /** Derivable but implausible. The user must SEE both numbers and confirm. */
    | 'confirm-or-place-by-hand'
    /** No derivation exists. Auto-align is refused; the hand-placed path remains. */
    | 'place-by-hand-only';

export interface LinkAnchorPresentation {
    readonly verdict: LinkAnchorDecision['verdict'];
    /** The heading the user reads first. Never a bare error code. */
    readonly headline: string;
    /** The full explanation. For a refusal this always names BOTH numbers (C74). */
    readonly detail: string;
    readonly affordance: LinkAnchorAffordance;
    /** Label of the primary button, so the dialog never invents its own verb. */
    readonly primaryLabel: string;
    /**
     * True when the C83 answer requires an explicit acknowledgement before the
     * command will accept it. Maps 1:1 onto `LinkCreatePayload.confirmedSeparation`.
     */
    readonly requiresConfirmation: boolean;
    /** Metres between the origins, or null when unknowable. **Never 0 for unknown.** */
    readonly separationM: number | null;
    /** The decision itself, so the caller can hand the derived anchor to the command. */
    readonly decision: LinkAnchorDecision;
}

/**
 * Turn the pure C83 decision into what the dialog shows and offers.
 *
 * The three branches are deliberately NOT collapsed into "ok / not ok": a refusal
 * that offers no way forward is a regression with a contract citation attached, so
 * each branch names its own escape hatch, and IMPOSSIBLE keeps the hand-placed
 * path rather than refusing the feature (ADR-0346 §4.2).
 */
export function presentLinkAnchor(
    hostOrigin: LinkGeoOrigin | null,
    sourceOrigin: LinkGeoOrigin | null,
    resolvedAt: string,
): LinkAnchorPresentation {
    const decision = resolveLinkAnchor(hostOrigin, sourceOrigin, resolvedAt);

    if (decision.verdict === 'FINE') {
        const sep = decision.separationM;
        return {
            verdict: 'FINE',
            headline: 'Ready to align on the shared site datum',
            // Even the happy path states the number. A user who is never told where
            // it landed cannot notice when it lands somewhere wrong.
            detail: sep === null
                ? 'Both projects share a site origin, so the placement is derived from it.'
                : `Both projects carry a site location and their origins are `
                  + `${formatMetres(sep)} apart. The linked model will be placed at that offset, `
                  + 'in this project’s coordinate frame.',
            affordance: 'link-now',
            primaryLabel: 'Link project',
            requiresConfirmation: false,
            separationM: sep,
            decision,
        };
    }

    if (decision.verdict === 'INADVISABLE') {
        return {
            verdict: 'INADVISABLE',
            headline: 'These projects are further apart than expected',
            // `decision.reason` already carries the measurement AND the threshold.
            // Re-wording it here would fork the sentence the engine refuses with.
            detail: decision.reason
                ?? 'The two site origins are implausibly far apart.',
            affordance: 'confirm-or-place-by-hand',
            primaryLabel: 'Link anyway',
            requiresConfirmation: true,
            separationM: decision.separationM,
            decision,
        };
    }

    return {
        verdict: 'IMPOSSIBLE',
        headline: 'Cannot align automatically',
        detail: decision.reason
            ?? 'There is not enough location data to derive a placement.',
        affordance: 'place-by-hand-only',
        primaryLabel: 'Place by hand',
        requiresConfirmation: false,
        // null, not 0 — "I could not tell" and "they are in the same place" must
        // never share a value (§CONTEXT-DATA-HONESTY).
        separationM: null,
        decision,
    };
}

// ── The per-link row ─────────────────────────────────────────────────────────

/** The four states a row can be in, as a closed set the renderer switches on. */
export type LinkRowTone = 'shown' | 'hidden' | 'resolving' | 'refused';

export interface LinkRowView {
    readonly linkId: string;
    readonly title: string;
    readonly tone: LinkRowTone;
    /** Short chip text: SHOWN / HIDDEN / RESOLVING / NOT SHOWN. */
    readonly statusChip: string;
    /** The version line — makes the PIN-vs-LIVE choice visible on every row (D5). */
    readonly versionLine: string;
    /** How this link was placed, and how far apart the origins were. */
    readonly anchorLine: string;
    /** The measured structural cost of this link right now. */
    readonly costLine: string;
    /** Non-null only for `refused`: the full sentence, shown verbatim. */
    readonly reason: string | null;
    /** True when the primary toggle should read "Show" rather than "Hide". */
    readonly isHidden: boolean;
    /**
     * The stated cost of the DETAILED representation, which is not built
     * (SPEC-LINKED-MODELS §10). Shown beside a DISABLED control rather than behind
     * a button that errors — C82 §1.2 forbids a control that dispatches into
     * nothing, and a disabled control that says why is the legal form of "not yet".
     */
    readonly detailedCostLine: string;
}

/** Render one persisted ref plus its live status into a row the panel can draw. */
export function presentLinkRow(ref: LinkedModelRef, status: LinkStatus | null): LinkRowView {
    const title = ref.sourceProjectName || ref.sourceProjectId;
    const kind = status?.kind ?? 'resolving';

    const versionLine = ref.pin.mode === 'pinned'
        // PINNED is the default and the safe answer: the coordination datum cannot
        // move under the host without the host's author choosing it (D5).
        ? `Pinned to ${ref.pin.versionLabel ?? status?.versionLabel ?? ref.pin.versionId}`
        // LATEST is a declared opt-in, and the row says so in words rather than
        // leaving the user to infer it from a missing label.
        : `Following latest save${status?.versionLabel ? ` — showing ${status.versionLabel}` : ''}`;

    const anchorLine = ref.anchor.mode === 'shared-geo-origin'
        ? (ref.anchor.separationM === null
            ? 'Aligned on the shared site datum'
            : `Aligned on the shared site datum · origins ${formatMetres(ref.anchor.separationM)} apart`)
        : 'Placed by hand';

    let statusChip: string;
    let costLine: string;
    switch (kind) {
        case 'shown':
            statusChip = 'SHOWN';
            costLine = `${status!.bands} level${status!.bands === 1 ? '' : 's'} · `
                + `${status!.drawCalls} draw call${status!.drawCalls === 1 ? '' : 's'}`;
            break;
        case 'hidden':
            statusChip = 'HIDDEN';
            // Hidden is a REAL performance answer here, not a cosmetic one: a hidden
            // link mounts nothing at all, so it costs nothing at all.
            costLine = 'Not mounted — 0 draw calls';
            break;
        case 'refused':
            statusChip = 'NOT SHOWN';
            costLine = 'Nothing drawn';
            break;
        default:
            statusChip = 'RESOLVING';
            costLine = 'Reading the linked project…';
            break;
    }

    const sourceMeshes = status?.sourceElementCount ?? 0;
    const detailedCostLine = sourceMeshes > 0
        ? `Full detail is not built yet. It would draw roughly ${sourceMeshes} more meshes `
          + '— against massing’s one draw call.'
        : 'Full detail is not built yet. Massing draws this building in one draw call.';

    return {
        linkId: ref.id,
        title,
        tone: kind,
        statusChip,
        versionLine,
        anchorLine,
        costLine,
        reason: kind === 'refused' ? (status?.reason ?? null) : null,
        isHidden: ref.display === 'hidden',
        detailedCostLine,
    };
}

/**
 * The panel's budget line.
 *
 * States the number rather than a verdict about it. ADR-0346 D6's argument is a
 * STRUCTURAL bound — one draw call per massing link regardless of the linked
 * project's size — and L-2502 measured that the per-frame figure this repo has
 * been quoting off `renderer.info` is cumulative-since-start. So this counts what
 * the links themselves add, which is arithmetic and is true, and does not pretend
 * to report a frame cost it did not measure.
 */
export function presentLinkBudget(rows: readonly LinkRowView[], totalDrawCalls: number): string {
    if (rows.length === 0) return 'No linked models in this project.';
    const shown = rows.filter(r => r.tone === 'shown').length;
    return `${rows.length} link${rows.length === 1 ? '' : 's'} · ${shown} shown · `
        + `${totalDrawCalls} draw call${totalDrawCalls === 1 ? '' : 's'} added`;
}
