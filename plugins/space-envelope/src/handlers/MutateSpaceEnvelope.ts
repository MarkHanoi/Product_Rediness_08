// The mutation verbs: delete · move · moveFace · setFootprint · setParameter · setWithin.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §6 / §8 / §12 · ADR-0380 D4.
//
// Grouped in ONE file because they share the same store, the same record shape and the
// same metric-recompute rule — and because six near-identical files would make the one
// asymmetry that matters (only `moveFace` can REFUSE on geometry) harder to see, not
// easier. Each class is still its own handler with its own verb.

import {
    withHandlerSpan,
    type CommandHandler,
    type HandlerContext,
    type HandlerResult,
    type ValidationResult,
    produceCommand,
} from '@pryzm/plugin-sdk';
import { SpaceEnvelope } from '@pryzm/plugin-sdk';
import {
    planSpaceEnvelopeFaceMove,
    recomputeSpaceEnvelopeMetrics,
    type SpaceEnvelopeFaceRef,
} from '@pryzm/geometry-space-envelope';
import type { SpaceEnvelopeData, SpaceEnvelopesState } from '../store.js';
import { SpaceEnvelopeGeometryError } from '../errors.js';

type Stores = Readonly<{ spaceEnvelope: SpaceEnvelopesState } & Record<string, unknown>>;

/** Re-derive the two cache fields. C114 §2b names ONE writer; this is its call site. */
function withMetrics(record: SpaceEnvelopeData): SpaceEnvelopeData {
    const m = recomputeSpaceEnvelopeMetrics({
        id: record.id,
        footprint: record.footprint,
        baseOffset: record.baseOffset,
        height: record.height,
    });
    return { ...record, footprintAreaM2: m.footprintAreaM2, volumeM3: m.volumeM3 };
}

function validated(candidate: unknown): SpaceEnvelopeData {
    const parsed = SpaceEnvelope.safeParse(candidate);
    if (!parsed.success) {
        throw new SpaceEnvelopeGeometryError(
            parsed.error.issues[0]?.message ?? 'invalid space envelope',
        );
    }
    return parsed.data as SpaceEnvelopeData;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════════════════════

export interface DeleteSpaceEnvelopePayload {
    readonly spaceEnvelopeId: string;
}

/**
 * ⛔ DELETING A LEVEL ENVELOPE DOES NOT DELETE THE ROOM ENVELOPES INSIDE IT.
 *
 * `withinId` is a REFERENCE, not ownership — this family is not a compound like
 * `pool` (ADR-0124 §3) or `balcony`. The children's `withinId` is CLEARED in the same
 * patch, so the record never points at an id that is gone, and the containment
 * finding simply turns advisory (C114 §8). Cascading the delete would destroy an
 * architect's room layout because they removed the storey outline they sketched it
 * against — stated as a rule here so a later lane cannot "fix" the asymmetry.
 */
export class DeleteSpaceEnvelopeHandler
implements CommandHandler<DeleteSpaceEnvelopePayload, Stores> {
    readonly type = 'spaceEnvelope.delete';
    readonly affectedStores = ['spaceEnvelope'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: DeleteSpaceEnvelopePayload): ValidationResult {
        if (!ctx.stores.spaceEnvelope[cmd.spaceEnvelopeId]) {
            return { valid: false, reason: `no such space envelope: ${cmd.spaceEnvelopeId}` };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: DeleteSpaceEnvelopePayload): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const orphans = Object.values(ctx.stores.spaceEnvelope)
                .filter((e) => e.withinId === cmd.spaceEnvelopeId)
                .map((e) => e.id);
            const [next, forward, inverse] = produceCommand<SpaceEnvelopesState>(
                ctx.stores.spaceEnvelope,
                (draft) => {
                    const d = draft as Record<string, SpaceEnvelopeData>;
                    delete d[cmd.spaceEnvelopeId];
                    // Clear, never cascade. Both halves are in ONE patch pair, so undo
                    // restores the parent AND re-points its children in one Ctrl+Z.
                    for (const id of orphans) {
                        if (d[id]) d[id] = { ...d[id]!, withinId: null };
                    }
                },
            );
            return { forward, inverse, nextStates: { spaceEnvelope: next } };
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVE — translate the whole prism
// ═══════════════════════════════════════════════════════════════════════════════

export interface MoveSpaceEnvelopePayload {
    readonly spaceEnvelopeId: string;
    readonly delta: { readonly x: number; readonly y?: number; readonly z: number };
}

export class MoveSpaceEnvelopeHandler
implements CommandHandler<MoveSpaceEnvelopePayload, Stores> {
    readonly type = 'spaceEnvelope.move';
    readonly affectedStores = ['spaceEnvelope'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: MoveSpaceEnvelopePayload): ValidationResult {
        if (!ctx.stores.spaceEnvelope[cmd.spaceEnvelopeId]) {
            return { valid: false, reason: `no such space envelope: ${cmd.spaceEnvelopeId}` };
        }
        if (!Number.isFinite(cmd.delta?.x) || !Number.isFinite(cmd.delta?.z)) {
            return { valid: false, reason: 'delta.x and delta.z must be finite numbers' };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: MoveSpaceEnvelopePayload): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const current = ctx.stores.spaceEnvelope[cmd.spaceEnvelopeId]!;
            // ⚠ The vertical component goes to `baseOffset`, NOT into the ring. The ring
            // lives on the level plane (`y === 0`, schema-enforced), and the vertical
            // extent has exactly one home. Adding dy to the vertices would be the
            // silent-narrowing landmine C84 EI-2.d names.
            const moved = validated(withMetrics({
                ...current,
                footprint: current.footprint.map((p) => ({
                    x: p.x + cmd.delta.x, y: 0, z: p.z + cmd.delta.z,
                })),
                baseOffset: current.baseOffset + (cmd.delta.y ?? 0),
            }));
            const [next, forward, inverse] = produceCommand<SpaceEnvelopesState>(
                ctx.stores.spaceEnvelope,
                (draft) => { (draft as Record<string, unknown>)[moved.id] = moved; },
            );
            return { forward, inverse, nextStates: { spaceEnvelope: next } };
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVE FACE — ⭐ the only verb that can refuse on GEOMETRY
// ═══════════════════════════════════════════════════════════════════════════════

export interface MoveSpaceEnvelopeFacePayload {
    readonly spaceEnvelopeId: string;
    readonly face: SpaceEnvelopeFaceRef;
    /** Metres along the face's OWN outward normal (the bidirectional gizmo axis). */
    readonly deltaM: number;
}

/**
 * ⭐ THE FOUNDER'S §2.4, AT THE COMMAND SEAM. The solver
 * (`@pryzm/geometry-space-envelope`) does the geometry; this handler dispatches it.
 * The SAME planner drives the live drag preview and this commit, which is what stops
 * the preview promising something the commit then refuses.
 *
 * ⛔ THIS IS THE ONE ENFORCEMENT REFUSAL IN THE FAMILY (ADR-0380 D4, C114 §12): a
 * move that would invert or collapse the solid is IMPOSSIBLE — two mutually exclusive
 * claims about one volume, and no site, brief or preference makes it correct. Every
 * other verdict in this family is ADVISORY.
 */
export class MoveSpaceEnvelopeFaceHandler
implements CommandHandler<MoveSpaceEnvelopeFacePayload, Stores> {
    readonly type = 'spaceEnvelope.moveFace';
    readonly affectedStores = ['spaceEnvelope'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: MoveSpaceEnvelopeFacePayload): ValidationResult {
        const current = ctx.stores.spaceEnvelope[cmd.spaceEnvelopeId];
        if (!current) return { valid: false, reason: `no such space envelope: ${cmd.spaceEnvelopeId}` };
        if (!Number.isFinite(cmd.deltaM)) return { valid: false, reason: 'deltaM must be finite' };
        const plan = planSpaceEnvelopeFaceMove({
            prism: {
                id: current.id,
                footprint: current.footprint,
                baseOffset: current.baseOffset,
                height: current.height,
            },
            face: cmd.face,
            deltaM: cmd.deltaM,
        });
        // ⭐ The refusal's own message carries BOTH numbers (C114 §12a), read from the
        // geometry by the planner. It is forwarded verbatim — a handler that
        // paraphrased it would be the second copy C84 EI-8a rules out.
        if ('refusal' in plan) return { valid: false, reason: plan.refusal.message };
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: MoveSpaceEnvelopeFacePayload): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const current = ctx.stores.spaceEnvelope[cmd.spaceEnvelopeId]!;
            const plan = planSpaceEnvelopeFaceMove({
                prism: {
                    id: current.id,
                    footprint: current.footprint,
                    baseOffset: current.baseOffset,
                    height: current.height,
                },
                face: cmd.face,
                deltaM: cmd.deltaM,
            });
            if ('refusal' in plan) throw new SpaceEnvelopeGeometryError(plan.refusal.message);
            const moved = validated(withMetrics({
                ...current,
                footprint: plan.entry.footprint.map((p) => ({ x: p.x, y: 0, z: p.z })),
                baseOffset: plan.entry.baseOffset,
                height: plan.entry.height,
            }));
            const [next, forward, inverse] = produceCommand<SpaceEnvelopesState>(
                ctx.stores.spaceEnvelope,
                (draft) => { (draft as Record<string, unknown>)[moved.id] = moved; },
            );
            return { forward, inverse, nextStates: { spaceEnvelope: next } };
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SET FOOTPRINT — the profile-edit commit path
// ═══════════════════════════════════════════════════════════════════════════════

export interface SetSpaceEnvelopeFootprintPayload {
    readonly spaceEnvelopeId: string;
    readonly footprint: readonly { readonly x: number; readonly z: number }[];
}

/**
 * The commit verb behind the footprint profile editor (C114 §10b). The editor surface
 * itself is `ElevationOutlineSurface` via `_profileEditToolFor` — already generic by
 * port, and NOT rebuilt here.
 */
export class SetSpaceEnvelopeFootprintHandler
implements CommandHandler<SetSpaceEnvelopeFootprintPayload, Stores> {
    readonly type = 'spaceEnvelope.setFootprint';
    readonly affectedStores = ['spaceEnvelope'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: SetSpaceEnvelopeFootprintPayload): ValidationResult {
        if (!ctx.stores.spaceEnvelope[cmd.spaceEnvelopeId]) {
            return { valid: false, reason: `no such space envelope: ${cmd.spaceEnvelopeId}` };
        }
        if (!Array.isArray(cmd.footprint) || cmd.footprint.length < 3) {
            return { valid: false, reason: 'a footprint needs at least three vertices' };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: SetSpaceEnvelopeFootprintPayload): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const current = ctx.stores.spaceEnvelope[cmd.spaceEnvelopeId]!;
            const updated = validated(withMetrics({
                ...current,
                footprint: cmd.footprint.map((p) => ({ x: p.x, y: 0, z: p.z })),
            }));
            const [next, forward, inverse] = produceCommand<SpaceEnvelopesState>(
                ctx.stores.spaceEnvelope,
                (draft) => { (draft as Record<string, unknown>)[updated.id] = updated; },
            );
            return { forward, inverse, nextStates: { spaceEnvelope: next } };
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SET PARAMETER / SET WITHIN
// ═══════════════════════════════════════════════════════════════════════════════

export interface SetSpaceEnvelopeParameterPayload {
    readonly spaceEnvelopeId: string;
    readonly height?: number;
    readonly baseOffset?: number;
    readonly name?: string;
    readonly occupancy?: string;
    readonly materialColor?: string;
}

/**
 * The optional parameters a `set-parameter` command may carry — i.e. every field of
 * `SetSpaceEnvelopeParameterPayload` except the subject id.
 *
 * ⛔ Typed as `readonly (keyof …)[]`, not `string[]`, ON PURPOSE. `canExecute` uses this list to
 * decide whether ANYTHING was supplied; if a payload field is renamed and this list is not, a
 * `string[]` would keep compiling, `touched` would silently go false, and the handler would refuse
 * every legitimate edit with "nothing to change" — a well-formed wrong answer with no symptom.
 * Keying it to the payload type turns that into a build failure.
 */
const OPTIONAL_PARAMETER_KEYS: readonly (keyof SetSpaceEnvelopeParameterPayload)[] = [
    'height',
    'baseOffset',
    'name',
    'occupancy',
    'materialColor',
];

export class SetSpaceEnvelopeParameterHandler
implements CommandHandler<SetSpaceEnvelopeParameterPayload, Stores> {
    readonly type = 'spaceEnvelope.setParameter';
    readonly affectedStores = ['spaceEnvelope'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: SetSpaceEnvelopeParameterPayload): ValidationResult {
        if (!ctx.stores.spaceEnvelope[cmd.spaceEnvelopeId]) {
            return { valid: false, reason: `no such space envelope: ${cmd.spaceEnvelopeId}` };
        }
        if (cmd.height !== undefined && !(cmd.height > 0)) {
            // Schema-level IMPOSSIBLE (C114 §12): a zero-height envelope is a footprint
            // pretending to be a volume, and every consumer that divides by it produces
            // a confidently wrong number.
            return { valid: false, reason: `height must be greater than 0 (asked for ${cmd.height})` };
        }
        // The double assertion is deliberate: `SetSpaceEnvelopeParameterPayload` is a closed
        // shape, so TS refuses the direct widening to an index signature. Going via `unknown`
        // is the sanctioned form — and the key list below is checked against the payload type
        // by `OPTIONAL_PARAMETER_KEYS`, so a renamed field breaks the build rather than
        // silently making `touched` always false and refusing every legitimate edit.
        const asRecord = cmd as unknown as Record<string, unknown>;
        const touched = OPTIONAL_PARAMETER_KEYS.some((k) => asRecord[k] !== undefined);
        // ⛔ A no-op still mints a ring-buffer entry and spends the user's next Ctrl+Z
        // on an edit that never happened — C113 §6.4's rule, adopted.
        if (!touched) return { valid: false, reason: 'no parameter supplied — nothing to change' };
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: SetSpaceEnvelopeParameterPayload): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const current = ctx.stores.spaceEnvelope[cmd.spaceEnvelopeId]!;
            const updated = validated(withMetrics({
                ...current,
                ...(cmd.height !== undefined ? { height: cmd.height } : {}),
                ...(cmd.baseOffset !== undefined ? { baseOffset: cmd.baseOffset } : {}),
                ...(cmd.name !== undefined ? { name: cmd.name } : {}),
                ...(cmd.occupancy !== undefined ? { occupancy: cmd.occupancy } : {}),
                ...(cmd.materialColor !== undefined ? { materialColor: cmd.materialColor } : {}),
            }));
            const [next, forward, inverse] = produceCommand<SpaceEnvelopesState>(
                ctx.stores.spaceEnvelope,
                (draft) => { (draft as Record<string, unknown>)[updated.id] = updated; },
            );
            return { forward, inverse, nextStates: { spaceEnvelope: next } };
        });
    }
}

export interface SetSpaceEnvelopeWithinPayload {
    readonly spaceEnvelopeId: string;
    readonly withinId: string | null;
}

/**
 * Declare (or clear) membership. ⛔ CONTAINMENT IS NOT ENFORCED HERE — a room envelope
 * may be declared within a level envelope and stick out of it. That is an ADVISORY
 * finding, never a refusal (ADR-0380 D4): it usually means the level envelope needs
 * to grow, which is a design act rather than an error, and refusing would make the
 * containment field a cage instead of a relationship.
 */
export class SetSpaceEnvelopeWithinHandler
implements CommandHandler<SetSpaceEnvelopeWithinPayload, Stores> {
    readonly type = 'spaceEnvelope.setWithin';
    readonly affectedStores = ['spaceEnvelope'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: SetSpaceEnvelopeWithinPayload): ValidationResult {
        const current = ctx.stores.spaceEnvelope[cmd.spaceEnvelopeId];
        if (!current) return { valid: false, reason: `no such space envelope: ${cmd.spaceEnvelopeId}` };
        if (cmd.withinId !== null) {
            if (cmd.withinId === cmd.spaceEnvelopeId) {
                return { valid: false, reason: 'an envelope cannot be within itself' };
            }
            if (!ctx.stores.spaceEnvelope[cmd.withinId]) {
                return { valid: false, reason: `no such containing envelope: ${cmd.withinId}` };
            }
            if (current.role === 'level') {
                return {
                    valid: false,
                    reason: 'a LEVEL envelope has no containing envelope — its relationship to the '
                        + 'permitted study is a citation, not containment (ADR-0380 D2)',
                };
            }
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: SetSpaceEnvelopeWithinPayload): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const current = ctx.stores.spaceEnvelope[cmd.spaceEnvelopeId]!;
            const updated = validated({ ...current, withinId: cmd.withinId });
            const [next, forward, inverse] = produceCommand<SpaceEnvelopesState>(
                ctx.stores.spaceEnvelope,
                (draft) => { (draft as Record<string, unknown>)[updated.id] = updated; },
            );
            return { forward, inverse, nextStates: { spaceEnvelope: next } };
        });
    }
}
