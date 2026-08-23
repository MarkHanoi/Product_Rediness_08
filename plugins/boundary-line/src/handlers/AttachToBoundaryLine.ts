// AttachToBoundaryLineHandler / DetachFromBoundaryLineHandler — THE EDGE.
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7912) · C105 §3.2 · C84 EI-PROP-d · C71 §2.5.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THE EDGE LIVES ON THE HOST, AND WHY IT IS NOT A GRAPH EDGE
// ═══════════════════════════════════════════════════════════════════════════════
//
// C84 EI-PROP-d: *"A propagation channel is not a substitute for a relationship. Six
// SILENT cells cannot be wired at all because the record holds no edge to walk."* So
// the edge has to be somewhere. Two places were possible and one was chosen:
//
//   ✗ A `boundaryLineId` field on Wall, Slab, Column, Beam, Roof, Stair, Furniture and
//     Plumbing. That is EIGHT L0 schema amendments across the C85–C99 block for ONE
//     host, eight places that can disagree, and eight contracts to amend.
//   ✓ An `attachments[]` array on the boundary line. ONE record, one contract (C105),
//     and the host can answer "what is on me?" without scanning every store — which is
//     exactly the question the propagator asks.
//
// ⛔ AND IT IS **NOT** A `RelationshipType` GRAPH EDGE. C71 §2.6 requires a new member
// to land with a writer, a typed reader, a rebuild disposition and a delete behaviour
// in ONE PR — and §2.5 forbids a writer-first addition outright, because *"writing
// edges nothing reads is how `sitsOn` spent months as measured-but-meaningless
// coverage"*. An element-record reference field is a DIFFERENT mechanism, the one
// `Pool.hostSlabId`, `Balcony.childrenIds` and `Lift.servedLevels` already use, and it
// is governed by C105 rather than by the graph vocabulary. Minting `boundOn` would
// have been the rival vocabulary C84 EI-8 rules out.
//
// ─── THE ANCHOR IS CAPTURED, NOT SUPPLIED ─────────────────────────────────────
// The caller sends WHERE the element is in the world; this handler turns it into a
// parametric anchor against the line's CURRENT geometry (`anchorOnBoundaryLine`).
// That is the moment the relationship is measured, and it is the only moment: from
// then on the element's pose is a FUNCTION of the line.
//
// ⛔ REFUSES BEFORE IT RECORDS. A family the table says cannot follow (a door, a
// light, a grid) is refused HERE, at attach time, with the table's own sentence —
// not accepted now and skipped later during the move. A relationship the system
// cannot honour must not be recordable: that is how "the cascade half-ran" becomes
// structurally impossible rather than merely unobserved.

import {
    withHandlerSpan,
    type CommandHandler,
    type HandlerContext,
    type HandlerResult,
    type ValidationResult,
    produceCommand,
} from '@pryzm/plugin-sdk';
import {
    anchorOnBoundaryLine,
    boundaryLineRuleFor,
    type BoundaryLineData,
} from '@pryzm/geometry-boundary-line';
import type { BoundaryLinesState } from '../store.js';

interface Pt2 {
    readonly x: number;
    readonly z: number;
}

export interface AttachToBoundaryLinePayload {
    readonly boundaryLineId: string;
    readonly elementId: string;
    /** Lower-case family key, as `normaliseMoveType()` spells it (`wall`, `slab`, …). */
    readonly elementKind: string;
    /** Where the element sits in the world NOW. Turned into an anchor here. */
    readonly at: Pt2;
    /** LINE-shaped families (wall, beam, handrail, curtain wall) MUST send their far end. */
    readonly to?: Pt2;
}

type Stores = Readonly<{ boundaryLine: BoundaryLinesState } & Record<string, unknown>>;

export class AttachToBoundaryLineHandler
implements CommandHandler<AttachToBoundaryLinePayload, Stores> {
    readonly type = 'boundaryLine.attach';
    readonly affectedStores = ['boundaryLine'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: AttachToBoundaryLinePayload): ValidationResult {
        const line = ctx.stores.boundaryLine[cmd.boundaryLineId];
        if (!line) return { valid: false, reason: `boundary line not found: ${cmd.boundaryLineId}` };
        if (!cmd.elementId) return { valid: false, reason: 'elementId is required' };
        if (!cmd.elementKind) return { valid: false, reason: 'elementKind is required' };

        const rule = boundaryLineRuleFor(cmd.elementKind);
        if (!rule) {
            // ⭐ UNCLASSIFIED IS NOT "NO". It means nobody has decided, and C84
            // EI-PROP-a makes deciding a merge-blocking obligation on whoever added
            // the family. The refusal says so, so the reader knows which of the two
            // they are looking at.
            return {
                valid: false,
                reason:
                    `"${cmd.elementKind}" has no row in the boundary-line host-move table (C105 §3.3), `
                    + `so whether it should follow a boundary line is UNDECIDED — not "no". Add its row `
                    + `before attaching it (C84 EI-PROP-a).`,
            };
        }
        if (rule.verdict !== 'PROPAGATES') {
            // The table's OWN sentence, verbatim — never paraphrased here, so the
            // refusal a user reads at attach time and the one they would read at move
            // time are the same sentence rather than two explanations of one fact.
            return { valid: false, reason: rule.reason ?? `${rule.family} cannot follow a boundary line.` };
        }
        if (rule.shape === 'line' && !cmd.to) {
            return {
                valid: false,
                reason:
                    `${rule.family} is a LINE element, so it needs BOTH ends anchored — send \`to\` as `
                    + `well as \`at\`. With only one end the far end would have nowhere to go when the `
                    + `boundary line moves.`,
            };
        }
        if (!anchorOnBoundaryLine(line as BoundaryLineData, cmd.at)) {
            return {
                valid: false,
                reason:
                    `This boundary line has no segment with a direction, so nothing can be anchored to `
                    + `it. Give it at least one segment 1 mm or longer.`,
            };
        }
        if (line.attachments.some((a) => a.elementId === cmd.elementId)) {
            // Idempotence is NOT silently granted. Re-attaching would recapture the
            // anchor from the element's CURRENT position, which after a move is the
            // moved position — quietly redefining the relationship the user set up.
            return {
                valid: false,
                reason:
                    `${cmd.elementId} is already attached to this boundary line. Detach it first if you `
                    + `want to re-anchor it where it now sits.`,
            };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: AttachToBoundaryLinePayload): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const line = ctx.stores.boundaryLine[cmd.boundaryLineId] as BoundaryLineData;
            const start = anchorOnBoundaryLine(line, cmd.at)!;
            const end = cmd.to ? anchorOnBoundaryLine(line, cmd.to) : null;

            const attachment = {
                elementId: cmd.elementId,
                elementKind: cmd.elementKind.toLowerCase().trim(),
                segmentIndex: start.segmentIndex,
                t: start.t,
                offset: start.offset,
                ...(end ? { end: { segmentIndex: end.segmentIndex, t: end.t, offset: end.offset } } : {}),
            };

            const [next, forward, inverse] = produceCommand<BoundaryLinesState>(ctx.stores.boundaryLine, (draft) => {
                const d = draft as unknown as Record<string, { attachments: unknown[] }>;
                const rec = d[cmd.boundaryLineId];
                if (!rec) return;
                // ⚠ WHOLE-ARRAY REPLACE, NEVER `push` — the same reason `CreatePool`
                // gives for the host slab's holes. `push` produces a DEEP patch
                // (`path: [id,'attachments',N]`) and `elementUndoStoreAdapter` collapses
                // deep sub-paths to the top field, so Ctrl+Z would set `attachments` to
                // `undefined` and detach EVERYTHING on the line, not just this one.
                rec.attachments = [...rec.attachments, attachment];
            });
            return { forward, inverse, nextStates: { boundaryLine: next } };
        });
    }
}

export interface DetachFromBoundaryLinePayload {
    readonly boundaryLineId: string;
    readonly elementId: string;
}

export class DetachFromBoundaryLineHandler
implements CommandHandler<DetachFromBoundaryLinePayload, Stores> {
    readonly type = 'boundaryLine.detach';
    readonly affectedStores = ['boundaryLine'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: DetachFromBoundaryLinePayload): ValidationResult {
        const line = ctx.stores.boundaryLine[cmd.boundaryLineId];
        if (!line) return { valid: false, reason: `boundary line not found: ${cmd.boundaryLineId}` };
        if (!line.attachments.some((a) => a.elementId === cmd.elementId)) {
            // Refusing a no-op rather than reporting success: "it was already detached"
            // and "the detach worked" are different facts, and a user who mistyped an id
            // must not be told the thing they meant is now free.
            return {
                valid: false,
                reason: `${cmd.elementId} is not attached to boundary line ${cmd.boundaryLineId}.`,
            };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: DetachFromBoundaryLinePayload): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const [next, forward, inverse] = produceCommand<BoundaryLinesState>(ctx.stores.boundaryLine, (draft) => {
                const d = draft as unknown as Record<string, { attachments: { elementId: string }[] }>;
                const rec = d[cmd.boundaryLineId];
                if (!rec) return;
                rec.attachments = rec.attachments.filter((a) => a.elementId !== cmd.elementId);
            });
            return { forward, inverse, nextStates: { boundaryLine: next } };
        });
    }
}
