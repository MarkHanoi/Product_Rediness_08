// The four mutation verbs. C116 §6 / §6b · ADR-0384 §4 · C16 CA-14 / CA-18 / CA-19.
//
// ⛔ `setWidth` AND `setThickness` ARE TWO VERBS, ON PURPOSE (C116 §6b). They are
// PERPENDICULAR and both are metres. A single `setDimension` taking an axis name
// would make every bug report about this family ambiguous — "the dimension is wrong"
// would not say which one.

import {
    withHandlerSpan,
    produceCommand,
    Siteworks,
    SITEWORKS_ROLES,
    type CommandHandler,
    type HandlerContext,
    type HandlerResult,
    type ValidationResult,
    type SiteworksRole,
} from '@pryzm/plugin-sdk';
import type { SiteworksData, SiteworksState } from '../store.js';
import {
    SiteworksGeometryError,
    SiteworksHasNoWidthError,
    SiteworksNotFoundError,
} from '../errors.js';

type Stores = Readonly<{ siteworks: SiteworksState } & Record<string, unknown>>;

/** Re-parse the mutated record so an edit can never write a shape `create` would refuse. */
function reparseOrThrow(next: Record<string, unknown>): SiteworksData {
    const parsed = Siteworks.safeParse(next);
    if (!parsed.success) {
        throw new SiteworksGeometryError(
            parsed.error.issues[0]?.message ?? 'the edit would produce an invalid siteworks surface',
        );
    }
    return parsed.data as SiteworksData;
}

function requireSurface(stores: Stores, id: string): SiteworksData {
    const rec = stores.siteworks[id];
    if (rec === undefined) throw new SiteworksNotFoundError(id);
    return rec;
}

// ─────────────────────────────────────────────────────────────────────────────
// siteworks.setWidth — LINEAR ONLY, and it REFUSES BY NAME on an areal surface
// ─────────────────────────────────────────────────────────────────────────────

export interface SetSiteworksWidthPayload { readonly id: string; readonly widthM: number }

export class SetSiteworksWidthHandler
implements CommandHandler<SetSiteworksWidthPayload, Stores> {
    readonly type = 'siteworks.setWidth';
    readonly affectedStores = ['siteworks'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: SetSiteworksWidthPayload): ValidationResult {
        const rec = ctx.stores.siteworks[cmd.id];
        if (rec === undefined) return { valid: false, reason: `no siteworks surface ${cmd.id}` };
        // ⛔ THE REFUSAL IS IN THE GATE TOO, not only in `execute`. C16 CA-18: a bare
        // success is the failure mode here, so the UI must be able to learn "no, and
        // here is why" WITHOUT dispatching.
        if (rec.form !== 'linear') {
            return {
                valid: false,
                reason:
                    `${cmd.id} is an AREAL surface and has no width to set (C116 §6b). Edit its `
                    + 'boundary, or use siteworks.setThickness for its build-up depth.',
            };
        }
        if (!Number.isFinite(cmd.widthM) || cmd.widthM <= 0) {
            return { valid: false, reason: 'widthM must be a positive, finite number of metres' };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: SetSiteworksWidthPayload): HandlerResult {
        return withHandlerSpan(
            this.type + '.handler',
            { 'pryzm.command.type': this.type, 'pryzm.siteworks.id': cmd.id },
            () => {
                const rec = requireSurface(ctx.stores, cmd.id);
                if (rec.form !== 'linear') throw new SiteworksHasNoWidthError(cmd.id);
                const updated = reparseOrThrow({ ...rec, widthM: cmd.widthM });
                const [next, forward, inverse] = produceCommand<SiteworksState>(
                    ctx.stores.siteworks,
                    (draft) => { (draft as Record<string, unknown>)[cmd.id] = updated; },
                );
                return { forward, inverse, nextStates: { siteworks: next } };
            },
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// siteworks.setThickness — BOTH forms. The founder's "thickness the user can add".
// ─────────────────────────────────────────────────────────────────────────────

export interface SetSiteworksThicknessPayload { readonly id: string; readonly thickness: number }

export class SetSiteworksThicknessHandler
implements CommandHandler<SetSiteworksThicknessPayload, Stores> {
    readonly type = 'siteworks.setThickness';
    readonly affectedStores = ['siteworks'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: SetSiteworksThicknessPayload): ValidationResult {
        if (ctx.stores.siteworks[cmd.id] === undefined) {
            return { valid: false, reason: `no siteworks surface ${cmd.id}` };
        }
        if (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0) {
            return {
                valid: false,
                reason:
                    'thickness must be a positive, finite number of metres — a zero-depth plate '
                    + 'is a plane, and the construction has to be somewhere',
            };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: SetSiteworksThicknessPayload): HandlerResult {
        return withHandlerSpan(
            this.type + '.handler',
            { 'pryzm.command.type': this.type, 'pryzm.siteworks.id': cmd.id },
            () => {
                const rec = requireSurface(ctx.stores, cmd.id);
                const updated = reparseOrThrow({ ...rec, thickness: cmd.thickness });
                const [next, forward, inverse] = produceCommand<SiteworksState>(
                    ctx.stores.siteworks,
                    (draft) => { (draft as Record<string, unknown>)[cmd.id] = updated; },
                );
                return { forward, inverse, nextStates: { siteworks: next } };
            },
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// siteworks.setRole — the MEANING changes; the surface does not move
// ─────────────────────────────────────────────────────────────────────────────

export interface SetSiteworksRolePayload { readonly id: string; readonly role: SiteworksRole }

export class SetSiteworksRoleHandler
implements CommandHandler<SetSiteworksRolePayload, Stores> {
    readonly type = 'siteworks.setRole';
    readonly affectedStores = ['siteworks'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: SetSiteworksRolePayload): ValidationResult {
        if (ctx.stores.siteworks[cmd.id] === undefined) {
            return { valid: false, reason: `no siteworks surface ${cmd.id}` };
        }
        if (!SITEWORKS_ROLES.includes(cmd.role)) {
            return { valid: false, reason: `${String(cmd.role)} is not a siteworks role` };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: SetSiteworksRolePayload): HandlerResult {
        return withHandlerSpan(
            this.type + '.handler',
            { 'pryzm.command.type': this.type, 'pryzm.siteworks.role': cmd.role },
            () => {
                const rec = requireSurface(ctx.stores, cmd.id);
                // ⭐ GEOMETRY IS UNTOUCHED, AND THAT IS THE WHOLE RULING (ADR-0384 D1).
                // A road that becomes a footway is the SAME PLANE meaning something
                // different. If this verb ever needed to move a vertex, D1 would be
                // falsified and the family would owe a second kind.
                const updated = reparseOrThrow({ ...rec, role: cmd.role });
                const [next, forward, inverse] = produceCommand<SiteworksState>(
                    ctx.stores.siteworks,
                    (draft) => { (draft as Record<string, unknown>)[cmd.id] = updated; },
                );
                return { forward, inverse, nextStates: { siteworks: next } };
            },
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// siteworks.delete — a set, in one undo entry
// ─────────────────────────────────────────────────────────────────────────────

export interface DeleteSiteworksPayload { readonly ids: readonly string[] }

export class DeleteSiteworksHandler
implements CommandHandler<DeleteSiteworksPayload, Stores> {
    readonly type = 'siteworks.delete';
    readonly affectedStores = ['siteworks'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: DeleteSiteworksPayload): ValidationResult {
        if (!Array.isArray(cmd.ids) || cmd.ids.length === 0) {
            return { valid: false, reason: 'ids must be a non-empty array' };
        }
        for (const id of cmd.ids) {
            if (ctx.stores.siteworks[id] === undefined) {
                // ⛔ REFUSE THE WHOLE SET rather than deleting the part that exists
                // (C16 CA-3). A partial delete leaves the user unable to say what
                // happened, and Ctrl+Z restores a state they never saw.
                return { valid: false, reason: `no siteworks surface ${id}` };
            }
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: DeleteSiteworksPayload): HandlerResult {
        return withHandlerSpan(
            this.type + '.handler',
            { 'pryzm.command.type': this.type, 'pryzm.batch.size': cmd.ids.length },
            () => {
                for (const id of cmd.ids) requireSurface(ctx.stores, id);
                const [next, forward, inverse] = produceCommand<SiteworksState>(
                    ctx.stores.siteworks,
                    (draft) => {
                        for (const id of cmd.ids) delete (draft as Record<string, unknown>)[id];
                    },
                );
                return { forward, inverse, nextStates: { siteworks: next } };
            },
        );
    }
}
