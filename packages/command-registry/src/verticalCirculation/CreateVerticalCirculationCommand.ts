// CreateVerticalCirculationCommand — residential-building multi-family §4 / P2.
//
// Mirrors `CreateStairCommand` end-to-end for the NEW vertical-circulation (lift)
// element. It is the ONLY mutation path for lifts (P6 command-only):
//   - pre-minted id honoured (§PERSIST-L1, like stair/wall/slab/curtain-wall)
//   - registers the element in bimManager (level membership) + elementRegistry
//     (semantic type) so AI queries, selection + generic deletion resolve it
//   - deferred geometry build per C11: the command only writes the store; the
//     LiftMeshBuilder picks up the `bim-lift-added` event and builds the mesh
//   - adds SemanticGraph nodes: lift `sitsOn` its base level + a bidirectional
//     `connectedByLift` edge between base↔top (the analogue of the stair's
//     `connectedByStair`) so DependencyResolver can route egress through the lift
//   - emits ≥1 P8 OpenTelemetry span (`pryzm.command.create_vertical_circulation`)
//
// Contracts: C11 (element-creation pipeline); C15 §12 (lift BODY free, landing
// doors hosted); C50/C53 (the residential-building typology consumes this command
// when assembling the core); P6 (command-only); P8 (span).

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import {
    LiftData,
    LiftKind,
    DEFAULT_LIFT_PROPERTIES,
    Vec3,
} from '@pryzm/geometry-lift';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
import { trace } from '@opentelemetry/api';

const _bus = new DOMEventBus();
const _tracer = trace.getTracer('@pryzm/command-registry', '0.1.0');

export interface CreateVerticalCirculationInput {
    baseLevelId: string;
    topLevelId: string;
    kind?: LiftKind;
    /** Shaft base origin in world coords (plan placement of the shaft footprint). */
    origin: Vec3;
    /** Plan-direction angle in radians (about world Y). Default 0. */
    rotation?: number;
    /** Total shaft width in metres (car + structure). Resolved from type if omitted. */
    shaftWidth?: number;
    /** Total shaft depth in metres (car + structure). Resolved from type if omitted. */
    shaftDepth?: number;
    /** Rated car capacity in persons. Resolved from type if omitted. */
    carCapacityPersons?: number;
    /** Landing-door clear width in metres (a C15-hosted opening per level). */
    doorWidth?: number;
    typeId?: string;
    properties?: Record<string, any>;
    /** §PERSIST-L1 — caller-supplied id (ProjectLoader round-trips snapshots). */
    id?: string;
    /** §PERSIST-L1 — restore-time metadata override (source: 'import'). */
    metadata?: Partial<LiftData['metadata']>;
}

export class CreateVerticalCirculationCommand implements Command {
    readonly affectedStores = ['verticalCirculation'] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_VERTICAL_CIRCULATION;
    readonly timestamp: number;
    readonly targetIds: string[];

    private input: CreateVerticalCirculationInput;
    private createdLiftId?: string;

    constructor(input: CreateVerticalCirculationInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.input = input;
        this.targetIds = [];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const activeLevelId = ctx.projectContext?.activeLevelId;
        const baseLevelId = this.input.baseLevelId || activeLevelId;

        const blockingIssues: string[] = [];
        const warnings: string[] = [];

        // §RESI-LIFT-TOP-CAB (founder "the lift is not present on the top floor", 2026-06-23).
        // A lift cab is emitted per ADJACENT level pair (base = floor i, top = floor i+1). The
        // TOP residential floor has no level above it, so the residential generator emits its cab
        // as a DEGENERATE single-floor span (base === top): a cab that lives entirely in the top
        // floor's volume. LiftMeshBuilder.resolveSpan() already handles this — when base/top
        // elevations are equal it falls back to a one-storey cab anchored at origin.y. Rejecting
        // base === top here is what silently DROPPED the top-floor cab (canExecute blocks BEFORE
        // execute, so the executor's try/catch only logged a warning). Allow the degenerate
        // single-floor cab; only a MISSING (empty/undefined) top level is a hard error.
        if (!baseLevelId) {
            blockingIssues.push('Missing base level for lift creation');
        }
        if (!this.input.topLevelId) {
            blockingIssues.push('Missing top level for lift creation');
        } else if (baseLevelId === this.input.topLevelId) {
            warnings.push('Single-floor lift cab (base level equals top level)');
        }

        const liftStore = ctx.stores.liftStore;
        if (!liftStore) {
            blockingIssues.push('liftStore is not available in this runtime');
        }

        // Resolve the type rules (if any) for min door / min shaft dimensions.
        const rules = this.input.typeId && ctx.stores.liftTypeStore
            ? ctx.stores.liftTypeStore.resolveRules(this.input.typeId)
            : undefined;

        const doorWidth = this.input.doorWidth
            ?? (this.input.typeId && ctx.stores.liftTypeStore
                ? ctx.stores.liftTypeStore.resolveDefaults(this.input.typeId)?.doorWidth
                : undefined)
            ?? 0.9;
        const shaftWidth = this.resolveShaftWidth(ctx);
        const shaftDepth = this.resolveShaftDepth(ctx);

        if (shaftWidth < doorWidth) {
            blockingIssues.push('Lift shaft width must be at least the landing-door width.');
        }
        if (rules) {
            if (doorWidth < rules.minDoorWidth) {
                warnings.push(`Landing-door width below the type minimum (${rules.minDoorWidth} m)`);
            }
            if (Math.min(shaftWidth, shaftDepth) < rules.minShaftDim) {
                warnings.push(`Shaft inner dimension below the type minimum (${rules.minShaftDim} m)`);
            }
        }

        if (liftStore && baseLevelId) {
            const existing = liftStore.getLiftConnectingLevels(baseLevelId, this.input.topLevelId);
            if (existing) warnings.push('A lift already connects these levels (duplicate allowed)');
        }

        if (blockingIssues.length > 0) {
            return { ok: false, reason: blockingIssues[0], blockingIssues, warnings };
        }
        return { ok: true, warnings };
    }

    private resolveShaftWidth(ctx: CommandContext): number {
        if (this.input.shaftWidth !== undefined) return this.input.shaftWidth;
        const d = this.input.typeId && ctx.stores.liftTypeStore
            ? ctx.stores.liftTypeStore.resolveDefaults(this.input.typeId)
            : undefined;
        return d?.shaftWidth ?? 1.8;
    }

    private resolveShaftDepth(ctx: CommandContext): number {
        if (this.input.shaftDepth !== undefined) return this.input.shaftDepth;
        const d = this.input.typeId && ctx.stores.liftTypeStore
            ? ctx.stores.liftTypeStore.resolveDefaults(this.input.typeId)
            : undefined;
        return d?.shaftDepth ?? 1.8;
    }

    execute(ctx: CommandContext): CommandResult {
        // P8 — one span per command execution; the create path is the new
        // exported behaviour this command introduces.
        return _tracer.startActiveSpan('pryzm.command.create_vertical_circulation', (span) => {
            try {
                const result = this._executeInner(ctx);
                span.setAttribute('pryzm.lift.created', result.success);
                if (this.createdLiftId) span.setAttribute('pryzm.lift.id', this.createdLiftId);
                span.end();
                return result;
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }

    private _executeInner(ctx: CommandContext): CommandResult {
        const liftStore = ctx.stores.liftStore;
        if (!liftStore) {
            return { success: false, affectedElementIds: [], info: ['Execution failed: liftStore unavailable'] };
        }

        const liftId = this.input.id ?? crypto.randomUUID();
        const baseLevelId = this.input.baseLevelId || ctx.projectContext?.activeLevelId;
        if (!baseLevelId) {
            return { success: false, affectedElementIds: [], info: ['Execution failed: Missing baseLevelId'] };
        }

        try {
            ctx.bimManager.registerElement(liftId, baseLevelId);
        } catch (e: any) {
            return { success: false, affectedElementIds: [], info: [e.message] };
        }

        // §03-SEMANTIC-MODEL — register so AI queries, selection + generic
        // deletion resolve the lift by type.
        // §RESI-LIFT-DUP-ID (founder 2026-06-24: FATAL "ID … already exists in ElementRegistry"
        // during collab replayCatchUp / reload froze the project). The lift ids ARE unique per cab,
        // but COLLAB REPLAY / REDO re-executes the create with the same (already-registered) id, and
        // the throwing `registerSemantic` made that FATAL. Use the idempotent variant — purpose-built
        // for exactly this redo/reload path (its own docstring calls it "the single most common
        // crash") — so a re-register is a harmless no-op instead of a load-breaking throw.
        elementRegistry.registerSemanticOrReplace(liftId, 'verticalCirculation');

        // Resolve type defaults → caller overrides (mirror of stair merge order).
        const defaults = this.input.typeId && ctx.stores.liftTypeStore
            ? ctx.stores.liftTypeStore.resolveDefaults(this.input.typeId)
            : undefined;

        const now = new Date().toISOString();
        const lift: LiftData = {
            id: liftId,
            type: 'verticalCirculation',
            levelId: baseLevelId,
            baseLevelId,
            topLevelId: this.input.topLevelId,
            kind: this.input.kind ?? 'passenger',
            origin: { x: this.input.origin.x, y: this.input.origin.y, z: this.input.origin.z },
            rotation: this.input.rotation ?? 0,
            shaftWidth: this.resolveShaftWidth(ctx),
            shaftDepth: this.resolveShaftDepth(ctx),
            carCapacityPersons: this.input.carCapacityPersons ?? defaults?.carCapacityPersons ?? 8,
            doorWidth: this.input.doorWidth ?? defaults?.doorWidth ?? 0.9,
            typeId: this.input.typeId,
            properties: {
                ...DEFAULT_LIFT_PROPERTIES,
                ...(defaults?.material ? { material: defaults.material } : {}),
                ...(this.input.properties ?? {}),
            },
            metadata: {
                createdAt: now,
                modifiedAt: now,
                version: 0,
                source: 'user' as const,
                ...(this.input.metadata ?? {}),
            },
        };

        liftStore.add(lift);
        this.createdLiftId = liftId;
        (this.targetIds as string[]).push(liftId);

        // SemanticGraph: lift sitsOn its base level + connectedByLift (bidirectional)
        // — the analogue of the stair's connectedByStair edges.
        try {
            semanticGraphManager.addRelationship({
                type: 'sitsOn',
                sourceId: liftId,
                targetId: baseLevelId,
                createdBy: 'CreateVerticalCirculationCommand',
                metadata: { addedBy: 'CreateVerticalCirculationCommand' },
            });
            // §FIX-CONNECTEDBY-EDGE-KEYING — identical keying defect to the stair's,
            // and if anything more load-bearing: a residential core routinely holds
            // TWO OR MORE lifts serving the SAME level pair, so the collapse is the
            // common case here, not the corner one. `authoredBy: liftId` makes each
            // lift's edge distinct; without it the second lift's write was a silent
            // no-op and deleting either would strand the survivor.
            semanticGraphManager.addRelationship({
                type: 'connectedByLift',
                sourceId: baseLevelId,
                targetId: this.input.topLevelId,
                authoredBy: liftId,
                createdBy: 'CreateVerticalCirculationCommand',
                metadata: { liftId, kind: lift.kind },
            });
            semanticGraphManager.addRelationship({
                type: 'connectedByLift',
                sourceId: this.input.topLevelId,
                targetId: baseLevelId,
                authoredBy: liftId,
                createdBy: 'CreateVerticalCirculationCommand',
                metadata: { liftId, kind: lift.kind, inverse: true },
            });
        } catch (err) {
            console.warn('[CreateVerticalCirculationCommand] SemanticGraph write failed (non-fatal):', err);
        }

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[CreateVerticalCirculationCommand] Created lift ${liftId} (${lift.kind}) from ${baseLevelId} to ${this.input.topLevelId}`);

        return {
            success: true,
            affectedElementIds: [liftId],
            info: [
                `Created ${lift.kind} lift`,
                `Shaft: ${(lift.shaftWidth * 1000).toFixed(0)}×${(lift.shaftDepth * 1000).toFixed(0)}mm`,
                `Capacity: ${lift.carCapacityPersons} persons`,
            ],
        };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.createdLiftId) {
            return { success: false, affectedElementIds: [], info: ['Cannot undo: lift was never created'] };
        }

        ctx.bimManager.unregisterElement(this.createdLiftId);
        elementRegistry.unregister(this.createdLiftId);
        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.createdLiftId);
        } catch (err) {
            console.warn('[CreateVerticalCirculationCommand.undo] SemanticGraph cleanup failed (non-fatal):', err);
        }

        ctx.stores.liftStore?.remove(this.createdLiftId);
        _bus.emit('ai-model-update', {}); // F.events.17

        const undoneId = this.createdLiftId;
        console.log(`[CreateVerticalCirculationCommand] Undone lift ${undoneId}`);
        return { success: true, affectedElementIds: [undoneId], info: ['Lift creation undone'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { ...this.input, createdLiftId: this.createdLiftId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
