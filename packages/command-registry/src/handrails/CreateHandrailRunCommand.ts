/**
 * CreateHandrailRunCommand — §FEAT-HANDRAIL-CREATION-PARITY (founder, 2026-08-18).
 *
 * ONE GESTURE, ONE UNDO ENTRY (C16 §8.6).
 *
 * A handrail RUN — an L-shaped rail, a closed square / circular / elliptical
 * guard, or the perimeter of a slab — is N two-point handrails, because
 * `HandrailData.baseLine` is a 2-tuple and this command does not pretend
 * otherwise (C95 §5 D1: the bus bridge REFUSES an N-point path by name rather
 * than collapsing it; this is the capability that refusal was holding the door
 * open for). But the USER performed ONE gesture, so N Ctrl+Z presses to undo it
 * would be a defect, and one that a 32-chord circle makes intolerable.
 *
 * WHY NOT `CompositeCommand`
 * ─────────────────────────────────────────────────────────────────────────────
 * `CompositeCommand`'s own header is explicit: *"This command is NOT dispatched
 * through `commandManager.execute()`"* — it exists to be pushed onto the history
 * by `endGenerationBatch()` AFTER its children ran individually, and its
 * `execute()` is only ever a redo. Routing an interactive gesture through the
 * GENERATION batch seam would mean opening a generation batch from a drawing
 * tool, which also suppresses the per-command snapshot. This command is the
 * ordinary thing instead: a first-class L2 command that is dispatched, validated,
 * snapshotted and undone exactly like every other, and whose `execute` happens to
 * build N records.
 *
 * ⛔ IT DOES NOT WRITE THE STORE ITSELF. Every record is created by the SAME
 * `CreateHandrailCommand` the 3-D tool and the IFC importer use, against the same
 * `ctx`. So a run's handrails are byte-identical to a hand-drawn one, the
 * SemanticGraph `sitsOn` edges are written by the same code, and there is exactly
 * ONE handrail creation authority (C84 EI-1 / EI-9). A second write path here is
 * precisely the divergence C95 §10.1 records between the plan and 3-D tools.
 *
 * PARTIAL FAILURE IS REPORTED, NEVER SWALLOWED
 * ─────────────────────────────────────────────────────────────────────────────
 * A child whose `canExecute` refuses (too short, no level) is SKIPPED and NAMED
 * in `info`. A run in which NO child could be created returns `success: false`
 * with the first child's reason attached, rather than reporting a successful
 * creation of nothing (C16 CA-18 — a refusal is a correct answer; a silent
 * no-op is not).
 *
 * CONTRACTS: C16 §8.6 (one gesture = one undo entry), CA-18 (refuse by name) ·
 * C03 §4.6 U-2 (`affectedStores`) · C84 EI-4/EI-5 (create/delete symmetry — undo
 * removes every record execute created, in reverse order) · C95 §D4.
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { CreateHandrailCommand } from './CreateHandrailCommand';

/** One segment of the run. Mirrors `CreateHandrailCommand`'s data, minus `id`. */
export interface HandrailRunSegmentSpec {
    readonly id: string;
    readonly start: { x: number; z: number };
    readonly end: { x: number; z: number };
    /**
     * §FEAT-HANDRAIL-RUN-JOIN — true for every segment whose START vertex is
     * already posted by a neighbour, so the run carries exactly one post per
     * vertex. See `handrailRunGenerators.ts` for who sets it and why.
     */
    readonly suppressStartPost?: boolean;
}

export interface CreateHandrailRunData {
    readonly segments: readonly HandrailRunSegmentSpec[];
    readonly height: number;
    readonly thickness: number;
    readonly levelId?: string;
    readonly baseOffset?: number;
    readonly fillType?: string;
    readonly railProfile?: string;
    readonly railDiameter?: number;
    readonly postSpacing?: number;
    readonly balusterShape?: 'rectangular' | 'round';
    readonly balusterWidth?: number;
    readonly balusterSpacing?: number;
    readonly infillMaxGap?: number;
    readonly materialColor?: string;
    readonly materialId?: string;
    /** §FIX-STAIR-DELETE-ORPHANS-HANDRAILS — every segment of a run shares the host. */
    readonly hostId?: string;
    readonly hostKind?: 'stair' | 'slab';
    /**
     * ⛔ THERE IS DELIBERATELY NO `systemTypeId` HERE.
     * `PropertyPanelTypeSelector.ts` records the family's rule verbatim —
     * *"HandrailData carries no `typeId`, so a railing type is MATERIALISED into
     * the record, not referenced."* Adding a reference field would mint a second,
     * rival answer to "what type is this railing?" (C84 EI-9) that nothing reads.
     * The caller resolves the `HandrailTypeDefinition` and passes its concrete
     * fields, which is what the 3-D tool and the property panel already do.
     */
    /** Human label for logs / history, e.g. "Circular handrail run". */
    readonly label?: string;
}

export class CreateHandrailRunCommand implements Command {
    readonly affectedStores = ['handrail', 'level'] as const;
    id = crypto.randomUUID();
    type = CommandType.CREATE_HANDRAIL_RUN;
    timestamp = Date.now();
    targetIds: string[] = [];

    /** Children in EXECUTION order. Built once so undo/redo act on the same set. */
    private readonly children: CreateHandrailCommand[];
    /** The children that actually executed, in order. `undo` reverses this. */
    private executed: CreateHandrailCommand[] = [];

    constructor(private readonly data: CreateHandrailRunData) {
        this.children = data.segments.map(
            (seg) =>
                new CreateHandrailCommand({
                    id: seg.id,
                    start: seg.start,
                    end: seg.end,
                    height: data.height,
                    thickness: data.thickness,
                    levelId: data.levelId,
                    baseOffset: data.baseOffset,
                    fillType: data.fillType,
                    railProfile: data.railProfile,
                    railDiameter: data.railDiameter,
                    postSpacing: data.postSpacing,
                    balusterShape: data.balusterShape,
                    balusterWidth: data.balusterWidth,
                    balusterSpacing: data.balusterSpacing,
                    infillMaxGap: data.infillMaxGap,
                    materialColor: data.materialColor,
                    materialId: data.materialId,
                    hostId: data.hostId,
                    hostKind: data.hostKind,
                    suppressStartPost: seg.suppressStartPost,
                }),
        );
    }

    /** Number of segments this run will attempt (test / diagnostic seam). */
    get segmentCount(): number {
        return this.children.length;
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (this.children.length === 0) {
            return {
                ok: false,
                reason:
                    'Handrail run has no segments — the gesture produced nothing to build. ' +
                    'A loop needs at least 3 vertices and every segment at least 0.1 m.',
            };
        }
        // The run is viable if AT LEAST ONE segment is. Per-child refusals are
        // reported by `execute`, by name, rather than sinking the whole run — a
        // 32-chord circle must not be lost because one chord landed short.
        for (const child of this.children) {
            if (child.canExecute(ctx).ok) return { ok: true };
        }
        const first = this.children[0]!.canExecute(ctx);
        return {
            ok: false,
            reason: `Handrail run refused — no segment is buildable. First reason: ${first.reason ?? 'unknown'}`,
        };
    }

    execute(ctx: CommandContext): CommandResult {
        const affectedElementIds: string[] = [];
        const info: string[] = [];
        this.executed = [];

        for (let i = 0; i < this.children.length; i++) {
            const child = this.children[i]!;
            const v = child.canExecute(ctx);
            if (!v.ok) {
                info.push(`segment ${i} skipped — ${v.reason ?? 'refused'}`);
                continue;
            }
            const r = child.execute(ctx);
            if (r.success) {
                this.executed.push(child);
                affectedElementIds.push(...r.affectedElementIds);
            } else {
                info.push(`segment ${i} failed — ${(r.info ?? []).join('; ') || 'unknown'}`);
            }
        }

        this.targetIds = [...affectedElementIds];

        if (affectedElementIds.length === 0) {
            return {
                success: false,
                affectedElementIds: [],
                info: ['Handrail run created nothing.', ...info],
            };
        }
        return {
            success: true,
            affectedElementIds,
            info: [
                `${this.data.label ?? 'Handrail run'} — ${affectedElementIds.length} of ` +
                `${this.children.length} segment(s) created as ONE undo entry.`,
                ...info,
            ],
        };
    }

    /**
     * EI-4/EI-5 — create/delete symmetry. Every record `execute` created is
     * removed, in REVERSE creation order, by the child that created it. Nothing
     * else is touched, so a run undo cannot strand a handrail the run did not make.
     */
    undo(ctx: CommandContext): CommandResult {
        const affectedElementIds: string[] = [];
        for (let i = this.executed.length - 1; i >= 0; i--) {
            const r = this.executed[i]!.undo(ctx);
            if (r?.affectedElementIds) affectedElementIds.push(...r.affectedElementIds);
        }
        return { success: true, affectedElementIds };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: this.data as unknown as Record<string, unknown>,
        };
    }
}
