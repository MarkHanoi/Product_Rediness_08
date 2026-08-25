// §CHAT-OPENING-SHAPE (L-10943) — change the SHAPE of a RESOLVED SET of hosted
// openings, in ONE undo step: "change all windows to segmental".
//
// ── THE FOUNDER'S ASK, AND WHY IT HAD NO ROUTE ──────────────────────────────
//
// He typed *"change all windows to segmental type"* and was told there is no
// such window type. There is not — "segmental" is not a TYPE, it is an opening
// PROFILE, and the profile axis has been complete since L-1200/L-1250: four
// kinds, family-aware, cut by `WallHoleBodyBuilder`, framed by
// `OpeningProfileFrameGeometry`, offered on both mode bars, and EDITABLE on an
// opening that already exists since L-1252 (commit 5e14c4de). His own words
// about that were *"via UI is possible"*.
//
// So the shape could be changed on ONE opening, through the property panel, and
// on NONE through a sentence. He has 85 windows placed. That gap is this file.
//
// ── ⛔ IT COMPOSES THE LIVE ROUTE. IT DOES NOT RE-IMPLEMENT IT ──────────────
//
// `UpdateWindowParameterCommand` / `UpdateDoorParameterCommand` are the
// single-opening profile route the property panel already drives, and they are
// the ONLY correct one, because a profile change is not a field write:
//
//   • `WallStore.updateWindow` copies exactly FOUR fields onto `wall.openings[]`
//     — width, height, sillHeight, offset. A profile written only through it
//     lands in the windowStore, reports success, and leaves the WALL still
//     cutting a rectangle. The panel then shows a curve the model does not have
//     — C86 §11 #1, the frame and the void diverging. `_syncWallStore`'s
//     `updateOpening` hop is what closes that, and it lives in those commands.
//   • CIRCULAR squares the box (C86 §10.1 PR-8 has no radius field — the WIDTH
//     is the diameter), so the height is carried down. That consequence lives
//     in those commands too.
//   • `openingProfileRefusal` — the ONE authoring gate the builders obey —
//     refuses a curved host and an impossible shape, with the reason and the
//     live alternative. Re-deriving any of the three here would be a second,
//     worse copy whose divergence shows up as openings that come back wrong on
//     Ctrl+Z.
//
// This is the same composition `UpdateElementDimensionsBatchCommand` makes over
// `UpdateElementParameterCommand`, for the same reason and with the same
// properties, and it is deliberately modelled on it line for line.
//
// ⚠ WHY NOT `UpdateElementParameterCommand`, the child THAT batch uses? Because
// it routes by `elementType` to fifteen stores through `resolveStore()` and
// applies a parameter bag — it has no profile arm at all, so it would write
// `openingProfile` onto the window record and stop there, which is exactly
// the half-write described above. The hosted-opening commands are the route
// with the wall hop; the generic one is not.
//
// ── THE FOUR PROPERTIES THE BATCH KEEPS ────────────────────────────────────
//
//   1. THE SET IS RESOLVED ONCE, BY THE CALLER. There is deliberately no `'all'`
//      form: the chat resolves the scope to explicit ids so the Confirm card can
//      state a REAL count before consent. A verb that promises to find out how
//      much it changed afterwards is not a verb this repository ships.
//   2. ONE DISPATCH = ONE REBUILD, PER ELEMENT. One child per opening, carrying
//      the whole change.
//   3. A STALE ID IS REFUSED, NEVER REPAIRED. C13 §3.12 / ADR-0299
//      §RECOVERY-MUST-REFUSE — an id the authoritative store no longer holds
//      becomes a COUNTED SKIP with the child's own words, reported as
//      "Changed N of M — K skipped". Never healed by re-resolving the scope
//      (which would act on openings the user never named), never quietly
//      removed from the denominator.
//   4. ONE UNDO ENTRY, bought by dispatching ONE command — never by holding a
//      batch open (C16 §8.6 B-6). `undo()` replays the children in reverse.
//
// ── ⚠ THE SEGMENTAL RISE STAYS DECLARED ────────────────────────────────────
//
// `SEGMENTAL_RISE_RATIO` is a DECLARED constant — `WindowModePicker.ts:37-40`
// records that it has NO AUTHORED SOURCE and that NOBODY HAS BEEN ASKED. This
// command sets the profile and nothing else; it does not compute, choose or
// claim a rise, and no summary it produces may imply the rise was measured.
//
// P8: execute() carries an OpenTelemetry span.

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { trace, type Tracer } from '@opentelemetry/api';
import { UpdateWindowParameterCommand } from '../windows/UpdateWindowParameterCommand';
import { UpdateDoorParameterCommand } from '../doors/UpdateDoorParameterCommand';
import { childRefusalText } from '../refusal/childRefusalText';
import {
    OPENING_PROFILE_LABELS,
    isOpeningProfileKind,
    openingProfilesFor,
    type OpeningProfileKind,
} from '@pryzm/geometry-wall';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/**
 * ⭐ RE-EXPORTED, NOT RE-DECLARED. `plugins/view`'s bus handler needs the kind
 * list and the per-family legality table to refuse at the gate, and it does NOT
 * depend on `@pryzm/geometry-wall`. Re-exporting them through the command that
 * already depends on it is what stops a SECOND copy of the vocabulary being
 * typed into the handler — the C84 EI-9 defect `OpeningProfile.ts` declares
 * itself the one place against. ⛔ Do not replace these with literals downstream.
 */
export { OPENING_PROFILE_KINDS, OPENING_PROFILE_LABELS, openingProfilesFor } from '@pryzm/geometry-wall';
export type { OpeningProfileKind } from '@pryzm/geometry-wall';

/** The families that can host an opening profile — geometry-wall's own split. */
export type OpeningProfileFamily = 'window' | 'door';

export interface UpdateOpeningProfileBatchInput {
    /** The ids to reshape. ALWAYS an explicit list — see header property 1. */
    elementIds: string[];
    /** Which family every id belongs to; it selects the child command AND the
     *  legality table (`openingProfilesFor`). */
    elementKind: OpeningProfileFamily;
    /** The target profile. Validated against the family here, so an illegal
     *  combination refuses BY NAME before a single child runs. */
    openingProfile: OpeningProfileKind;
}

/** One id the batch could not reshape, with the reason it gave. */
export interface OpeningProfileBatchSkip {
    elementId: string;
    reason: string;
}

type ProfileChild = UpdateWindowParameterCommand | UpdateDoorParameterCommand;

export class UpdateOpeningProfileBatchCommand implements Command {
    // The union of what the children affect. The rollback snapshot is taken from
    // the TOP-LEVEL command (Contract 01 §2.2), so this must cover every store a
    // child may write — both children write their own record AND the wall.
    readonly affectedStores = ['window', 'door', 'wall'] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_OPENING_PROFILE_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    /** Children that actually EXECUTED — undo replays these in reverse. */
    private executedChildren: ProfileChild[] = [];
    private _skipped: OpeningProfileBatchSkip[] = [];

    constructor(private input: UpdateOpeningProfileBatchInput) {
        // De-dup so one opening is never reshaped (or counted) twice.
        this.targetIds = [...new Set(input.elementIds)];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly OpeningProfileBatchSkip[] { return this._skipped; }

    private get _noun(): string {
        return this.input.elementKind || 'opening';
    }

    private _child(id: string): ProfileChild {
        const patch = { openingProfile: this.input.openingProfile } as never;
        return this.input.elementKind === 'door'
            ? new UpdateDoorParameterCommand(id, patch)
            : new UpdateWindowParameterCommand(id, patch);
    }

    /**
     * ⛔ THE FAMILY GATE — §OPENING-PROFILE-BY-FAMILY (L-1251). A door may not be
     * circular, and the reason is GEOMETRY: a door reaches the floor, so its
     * opening is a NOTCH in the wall's outer profile rather than a closed hole,
     * and a circle has no jamb feet for the notch walk to spring from.
     *
     * Checked HERE, before any child runs, so the refusal names the RULE. The
     * child would also refuse (a sill of 0 fails `openingProfileShapeRefusal`),
     * but it would refuse once per door with a message about sills — an
     * all-or-nothing rule reported as N individual accidents.
     */
    private _familyRefusal(): string | null {
        const kind = this.input.openingProfile;
        if (!isOpeningProfileKind(kind)) {
            return `"${String(kind)}" is not an opening shape. The shapes are: ${
                openingProfilesFor(this.input.elementKind)
                    .map((k) => OPENING_PROFILE_LABELS[k]).join(', ')}.`;
        }
        const legal = openingProfilesFor(this.input.elementKind);
        if ((legal as readonly string[]).includes(kind)) return null;
        return (
            `A ${this._noun} cannot be ${OPENING_PROFILE_LABELS[kind].toLowerCase()}: a ${this._noun} ` +
            `reaches the floor, so its opening is a notch in the wall rather than a closed hole, and ` +
            `a circle has no jambs at the floor for that notch to spring from. ` +
            `A ${this._noun} can be ${legal.map((k) => OPENING_PROFILE_LABELS[k]).join(', ')}.`
        );
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const ids = this.targetIds;
        if (ids.length === 0) {
            // §NO-EMPTY-MEANS-UNKNOWN — an empty target set is a VISIBLE decline,
            // never a cheerful no-op reporting success.
            return { ok: false, reason: `No ${this._noun}s to reshape.` };
        }
        const familyReason = this._familyRefusal();
        if (familyReason !== null) return { ok: false, reason: familyReason };

        // ALL-OR-NOTHING is deliberately NOT the rule ACROSS the batch (it IS the
        // rule PER ELEMENT — the child's own contract). A scope of 42 windows
        // where one id has gone stale is still worth executing. What is refused
        // is a batch where NOTHING can be reshaped — that is a scope the user got
        // wrong, and silently doing nothing while reporting success is the lie
        // this repository has fixed too many times.
        const refusals: string[] = [];
        let acceptable = 0;
        for (const id of ids) {
            const v = this._child(id).canExecute(ctx);
            if (v.ok) acceptable++;
            else {
                refusals.push(childRefusalText(
                    v.reason,
                    `Update${this.input.elementKind === 'door' ? 'Door' : 'Window'}ParameterCommand.canExecute`,
                    `${this._noun} ${id}`,
                ));
            }
        }
        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} ${this._noun}${ids.length === 1 ? '' : 's'} could be ` +
                    `reshaped — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.opening.updateProfile.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];

                const familyReason = this._familyRefusal();
                if (familyReason !== null) {
                    return { success: false, affectedElementIds: [], info: [familyReason] };
                }

                const ids = this.targetIds;
                const changed: string[] = [];
                const site = `Update${this.input.elementKind === 'door' ? 'Door' : 'Window'}ParameterCommand`;

                for (const id of ids) {
                    const child = this._child(id);
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({
                            elementId: id,
                            reason: childRefusalText(v.reason, `${site}.canExecute`, `${this._noun} ${id}`),
                        });
                        continue;
                    }
                    let r: CommandResult;
                    try {
                        r = child.execute(ctx);
                    } catch (e) {
                        // A child that throws (the opening vanished between the
                        // guard and the write, or a store refused) becomes a
                        // COUNTED skip. A batch must never take the whole ask down
                        // with one bad id.
                        this._skipped.push({ elementId: id, reason: (e as Error).message });
                        continue;
                    }
                    if (r.success) {
                        this.executedChildren.push(child);
                        changed.push(id);
                    } else {
                        this._skipped.push({
                            elementId: id,
                            reason: childRefusalText(r.info?.[0], `${site}.execute`, `${this._noun} ${id}`),
                        });
                    }
                }

                const total = ids.length;
                const done = changed.length;
                const skippedCount = this._skipped.length;

                // Group identical refusal reasons so N identical skips read as ONE
                // line ("12× curved host"), never twelve.
                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) {
                    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                }
                const reasonLines = [...reasonCounts.entries()].map(
                    ([reason, count]) => `${count}× ${reason}`,
                );

                const shapeWord = OPENING_PROFILE_LABELS[this.input.openingProfile];
                const summary =
                    `Changed ${done} of ${total} ${this._noun}${total === 1 ? '' : 's'} ` +
                    `to ${shapeWord}` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.openingProfile.batch.total', total);
                span.setAttribute('pryzm.openingProfile.batch.changed', done);
                span.setAttribute('pryzm.openingProfile.batch.skipped', skippedCount);
                span.setAttribute('pryzm.openingProfile.batch.kind', this._noun);
                span.setAttribute('pryzm.openingProfile.batch.profile', this.input.openingProfile);

                return {
                    success: done > 0,
                    affectedElementIds: changed,
                    info: [summary, ...reasonLines],
                };
            } catch (err) {
                span.recordException(err as Error);
                throw err;
            } finally {
                span.end();
            }
        });
    }

    undo(ctx: CommandContext): CommandResult {
        // Reverse order — symmetric with execution. Each child restores the
        // PRE-EDIT value of exactly the keys it authored (its execute-time `prev`
        // snapshot), so a field a collaborator changed in between is not
        // collateral damage (C03 §4.5-4.8).
        const affected: string[] = [];
        for (let i = this.executedChildren.length - 1; i >= 0; i--) {
            const child = this.executedChildren[i];
            if (!child) continue; // noUncheckedIndexedAccess — in range by construction
            const r = child.undo(ctx);
            if (r.success) affected.push(...r.affectedElementIds);
        }
        return { success: true, affectedElementIds: affected };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            payload: {
                elementIds: [...this.targetIds],
                elementKind: this.input.elementKind,
                openingProfile: this.input.openingProfile,
            },
            version: 1,
        };
    }
}
