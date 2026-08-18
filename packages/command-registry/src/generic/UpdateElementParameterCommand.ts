/**
 * UpdateElementParameterCommand
 *
 * Generic command for updating one or more parameters on any BIM element.
 * Routes to the correct element store based on elementType.
 * The store emits a change event → StoreEventBus → DependencyResolver → Builder.
 *
 * Contract compliance:
 *  - §01 CORE: Mutations go through commands, not direct store access from UI
 *  - §01-5.1: Commands must be undoable
 *  - §01-4.2: Stores must not be mutated outside commands
 *
 * Usage:
 *   const cmd = new UpdateElementParameterCommand({
 *       elementId: 'abc',
 *       elementType: 'wall',
 *       parameters: { height: 3.5, materialColor: '#ff0000' }
 *   });
 *   commandManager.execute(cmd);
 */

import { Command, CommandResult, CommandValidationResult, CommandContext, SerializedCommand, CommandType, StoreKey } from '../types';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';
// TODO(TASK-08): store-unification debt (ADR-0318) — the doorStore/windowStore
// barrel singletons above and the StoreEventBus leg of the header's flow line are
// the surface TASK-08 unifies. Work note relocated from the file header, where it
// read to the C74 §3.4 M-B gate as a module-scaffold claim; this command is
// production, not a stand-in (CO-06, 2026-08-14).
import { resolveElementRebuildDescriptor, isGeometryAffectingChange } from './ElementRebuildRegistry';
// §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812/L-814) — the SINGLE rake gate, shared with
// WallDataSchema / WallStore.update / WallStore.addOpening / UpdateWallSystemTypeCommand.
import { rakeAuthorability, profileAuthorability, wallOccupancyStore } from '@pryzm/geometry-wall';
// §REFUSAL-IDENTITY (GE-09, C58 §1.13.8) — the ONE renderer for a refusal arriving
// from a validator this command orchestrates but does not own (`validateParameters`,
// `rakeAuthorability`). A stated reason passes VERBATIM; a silent validator is NAMED
// as silent instead of being papered over with a manufactured verdict.
import { childRefusalText } from '../refusal/childRefusalText';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export const UPDATE_ELEMENT_PARAMETER_TYPE = CommandType.UPDATE_ELEMENT_PARAMETER;

export interface UpdateElementParameterInput {
    elementId: string;
    elementType: string;
    parameters: Record<string, any>;
}

/**
 * ─── §FIX-SNAPSHOT-SCOPE-MATCHES-WRITE (L-947) ──────────────────────────────
 *
 * THE ONE PLACE that answers "which store does an `elementType` belong to".
 *
 * THE DEFECT IT CLOSES. This command used to carry
 * `readonly affectedStores = ["wall"] as const` — HARD-CODED — while
 * `resolveStore()` routed by `elementType` to fifteen different stores. So for
 * every NON-WALL element type the command wrote store X and
 * `CommandManagerImpl` snapshotted store W (it scopes the Contract 01 §2.2
 * transaction snapshot to `command.affectedStores`, CommandManagerImpl.ts:284).
 * The founder's console printed it one line above the write:
 *
 *     [CommandManager] snapshot commandType="…" scope=[wall] elapsed=0.5ms
 *     [UpdateElementParameterCommand] Updated slab/6e4ede23-…
 *
 * A transaction scoped to the wrong store is a LIE IN BOTH DIRECTIONS: the
 * store that WAS written is not protected (a half-applied write survives the
 * rollback — the founder's "it gets corrupted and moved from the place"), and
 * the store that was NOT written is clear()ed and re-add()ed wholesale for an
 * edit that never touched it.
 *
 * WHY A TABLE AND NOT A SECOND SWITCH. Writing a parallel `elementType` switch
 * to compute the scope would reproduce the defect one level up: two switches
 * that must agree, with nothing forcing them to. Here the SCOPE and the STORE
 * SELECTOR are two fields of ONE row, `resolveStore()` is a lookup into it, and
 * `affectedStores` is read off the same row — so they cannot disagree, and a
 * new element type cannot be routed without being scoped. The invariant is
 * enforced observationally by
 * `__tests__/updateElementParameterSnapshotScope.test.ts` ("every store the
 * command WRITES is a store it DECLARED"), which executes the command per type
 * and compares the stores that actually received a write against the
 * declaration — so it catches drift even if this comment is ignored.
 *
 * C16 (command authoring) §affectedStores: the declaration is a statement about
 * what the command touches, not a constant to be copied from a neighbour.
 */
interface ElementStoreRoute {
    /**
     * Contract 01 §2.2 snapshot scope — the `StoreKey`s CommandManager must clone
     * before `execute()` and restore if it throws. MUST be an over-approximation
     * of everything `applyUpdate()` writes for this element type.
     */
    readonly scope: readonly StoreKey[];
    /** The store instance `execute()` reads and writes through. */
    readonly select: (context: CommandContext) => any;
}

const EMPTY_SCOPE: readonly StoreKey[] = Object.freeze([]);

const route = (scope: readonly StoreKey[], select: (context: CommandContext) => any): ElementStoreRoute =>
    ({ scope: Object.freeze([...scope]), select });

/** Openings live ON the host wall record; `updateDoor` / `updateWindow` are WallStore methods. */
const HOST_WALL_STORE = (context: CommandContext) => context.stores.wallStore;
/** Every furniture alias resolves through ONE selector — the `window.*` leg is the
 *  last-resort legacy fallback the switch has always carried (TODO(TASK-07)). */
const FURNITURE_STORE = (context: CommandContext) =>
    (context.stores as any).furnitureStore ?? window.furnitureStore; // TODO(TASK-07)
const HANDRAIL_STORE = (context: CommandContext) =>
    (context.stores as any).handrailStore ?? window.handrailStore;   // TODO(TASK-07)

const ELEMENT_STORE_ROUTES: Readonly<Record<string, ElementStoreRoute>> = Object.freeze({
    wall:                 route(['wall'],   c => c.stores.wallStore),
    slab:                 route(['slab'],   c => c.stores.slabStore),
    column:               route(['column'], c => c.stores.columnStore),
    beam:                 route(['beam'],   c => c.stores.beamStore),

    // The declarative rebuild this dispatches (GenerateStairGeometryCommand,
    // via ElementRebuildRegistry) runs INSIDE this command's transaction and
    // itself declares ['stair'] — so the scope covers the nested write too.
    stair:                route(['stair'],  c => c.stores.stairStore),
    stairs:               route(['stair'],  c => c.stores.stairStore),

    curtainwall:          route(['curtainWall'], c => c.stores.curtainWallStore),
    'curtain-wall':       route(['curtainWall'], c => c.stores.curtainWallStore),
    roof:                 route(['roof'],   c => (c.stores as any).roofStore),

    furniture:            route(['furniture'], FURNITURE_STORE),
    bed:                  route(['furniture'], FURNITURE_STORE),
    table:                route(['furniture'], FURNITURE_STORE),
    chair:                route(['furniture'], FURNITURE_STORE),
    sofa:                 route(['furniture'], FURNITURE_STORE),
    wardrobe:             route(['furniture'], FURNITURE_STORE),
    wardrobe_glass_door:  route(['furniture'], FURNITURE_STORE),
    corner_wardrobe:      route(['furniture'], FURNITURE_STORE),

    handrail:             route(['handrail'], HANDRAIL_STORE),

    // A door / window edit writes the HOST WALL's opening record AND, when the
    // element is present there, the rich barrel singleton (`doorStore.update` /
    // `windowStore.update` in `applyUpdate` below). Both legs are in scope —
    // CommandManagerImpl snapshots those barrels under the 'door' / 'window'
    // keys (createSnapshot's optionalStores table), so a rollback that reverts
    // the wall's opening without reverting the barrel is exactly the desync
    // this scope prevents.
    window:               route(['wall', 'window'], HOST_WALL_STORE),
    door:                 route(['wall', 'door'],   HOST_WALL_STORE),
});

/** Normalised lookup — the SAME normalisation `resolveStore()` has always applied. */
function elementStoreRoute(elementType: string): ElementStoreRoute | undefined {
    return ELEMENT_STORE_ROUTES[(elementType ?? '').toLowerCase().trim()];
}

/**
 * §FIX-SNAPSHOT-SCOPE-MATCHES-WRITE (L-947) — the snapshot scope for an element
 * type, derived from the routing table `resolveStore()` reads.
 *
 * An UNROUTED type returns `[]`. That is the honest answer and not a shrug:
 * `execute()` refuses immediately for an unrouted type (`No store for
 * elementType`) without writing anything, and CommandManagerImpl reads a
 * length-0 declaration as "undeclared" and falls back to the all-stores
 * snapshot — the conservative over-approximation for a path that has told it
 * nothing. What it must never do is CLAIM a store, which is what `['wall']` did.
 */
export function snapshotScopeForElementType(elementType: string): readonly StoreKey[] {
    return elementStoreRoute(elementType)?.scope ?? EMPTY_SCOPE;
}

export class UpdateElementParameterCommand implements Command {
    /**
     * §FIX-SNAPSHOT-SCOPE-MATCHES-WRITE (L-947) — PER-INSTANCE, derived from the
     * routing table above, never hard-coded.
     *
     * TIMING, checked rather than assumed: `CommandManagerImpl.execute()` reads
     * `command.affectedStores` at :289 (the log) and :562 (createSnapshot's
     * scope Set) — both AFTER the instance exists and BEFORE `execute()` runs.
     * The payload is a constructor argument, so `elementType` is known strictly
     * earlier than the first read. A per-instance value is therefore available
     * at the moment the manager needs it, and no design constraint forces the
     * declaration to be static. `CopyElementCommand` (operations/, :72) already
     * assigns it in its constructor for the same reason; `CompositeCommand`
     * (:78) unions children's declarations in ITS constructor, so a composed
     * parameter edit now contributes the RIGHT store instead of 'wall'.
     */
    readonly affectedStores: readonly StoreKey[];
    readonly id = crypto.randomUUID();
    readonly type = UPDATE_ELEMENT_PARAMETER_TYPE;
    readonly timestamp = Date.now();
    readonly targetIds: string[];

    private previousValues: Record<string, any> = {};

    /**
     * §ADR-0319-CLASS-2 — the host wall's AUDIT ENVELOPE as it stood before
     * `execute()` ran: `{ metadata, _renderVersion }`.
     *
     * `undo()` reverts by REPLAYING a forward parameter write (see below), and a
     * forward write is exactly what stamps a fresh `metadata.modifiedAt` and a
     * `metadata.version + 1`. So the counter walked AWAY from State A on undo
     * rather than back to it — the BIM 2.0 certification measured
     * `wall.u-wall-1.metadata.version: expected 2 got 4` on `element.updateParameters`.
     * ADR-0319 puts `metadata.version` in class 2 (DERIVED-BUT-CAUSAL): it may be
     * recomputed across a restore, but it may NEVER differ across an undo.
     *
     * The replay is kept (it is the only thing that knows how to route a
     * parameter to the right store, clamp openings, and trigger the rebuild) and
     * the envelope is written back afterwards through
     * `WallStore.update(id, updates, preserveMetadata = true)` — the SAME
     * audit-neutral restore contract `WallStore.restoreSnapshot` has used on the
     * wall-level undo path since §03-1.1.
     *
     * Scope, stated rather than implied: only `WallStore` carries the
     * `preserveMetadata` contract today, so only the wall/door/window branches of
     * this command have an audit-neutral restore. Element types whose stores stamp
     * their own audit fields (slab, stair, roof, furniture, …) are NOT covered
     * here and are not claimed to be; giving them the same treatment means giving
     * their stores the same contract first.
     *
     * ⚠ The paragraph above conceded a wall-shaped gap for non-wall types, and a
     * SECOND one of exactly that shape sat one layer down, undocumented, for
     * months: `affectedStores` was hard-coded `["wall"]` while `resolveStore()`
     * routed fifteen types. That is L-947 / §FIX-SNAPSHOT-SCOPE-MATCHES-WRITE,
     * closed at `ELEMENT_STORE_ROUTES` above. If you are reading this because a
     * third wall-shaped assumption bit you, look for the constant that never
     * learned the payload has an `elementType`.
     */
    private prevWallAudit: { wallId: string; metadata: unknown; renderVersion: number | undefined } | null = null;

    constructor(private input: UpdateElementParameterInput) {
        this.targetIds = [input.elementId];
        // §FIX-SNAPSHOT-SCOPE-MATCHES-WRITE (L-947) — the SAME table `resolveStore()`
        // routes through, so the snapshot and the write cannot name different stores.
        this.affectedStores = snapshotScopeForElementType(input.elementType);
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        if (!this.input.elementId) {
            return { ok: false, reason: '[UpdateElementParameterCommand] elementId is required' };
        }
        if (!this.input.elementType) {
            return { ok: false, reason: '[UpdateElementParameterCommand] elementType is required' };
        }
        if (!this.input.parameters || Object.keys(this.input.parameters).length === 0) {
            return { ok: false, reason: '[UpdateElementParameterCommand] parameters must not be empty' };
        }

        // ── §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812 precedent, extended by L-814) ──
        //
        // `WallStore.update` REFUSES an unauthorable rake by THROWING a
        // WallSchemaError. L-812 gave `UpdateWallSystemTypeCommand` a `canExecute`
        // pre-flight so the wall-TYPE path refuses instead of crashing, but the
        // GENERIC parameter path — which is how `rakeAngleDeg` is actually written
        // from the property panel and from collaboration replay — still had none.
        //
        // Reported from production 2026-08-10: a replayed `UPDATE_ELEMENT_PARAMETER`
        // carrying `rakeAngleDeg` for a wall that has SINCE been switched to a
        // LAYERED type produced
        //   `FATAL ERROR DURING EXECUTION WallSchemaError: [WallStore.update]
        //    §WALL-RAKE rejected … not supported on a LAYERED wall`
        // thrown from INSIDE command execution, with no user action at all.
        //
        // A stale write that the invariant forbids is an ordinary refusal, not a
        // crash. Asked against the MERGED next state (the rake arrives in the patch
        // while `layers` / `curve` / `openings` live on the existing record), which
        // is the same reasoning WallStore.update documents for checking `nextState`.
        // The store's throw stays as defence in depth for any path skipping validation.
        const rakeCheck = this.checkRakeAuthorability(_context);
        if (rakeCheck) return rakeCheck;

        // §WALL-PROFILE — the same seam, the same doctrine. `WallStore.update` throws a
        // WallSchemaError for an unauthorable profile exactly as it does for a rake, so the
        // generic parameter path needs the same pre-flight or a stale collaboration replay
        // becomes a crash rather than a refusal. Added in the SAME slice as the field, so
        // the crash this prevents never has a window in which to occur.
        const profileCheck = this.checkProfileAuthorability(_context);
        if (profileCheck) return profileCheck;

        // §FIX-PANEL-HEIGHT-STRANDS-OPENINGS — a LIVE BUG this slice closes, and it is the
        // same defect as the feature: a write boundary that reaches `WallStore.update`
        // without asking whether the edit is survivable.
        const heightCheck = this.checkWallHeightOpeningFit(_context);
        if (heightCheck) return heightCheck;

        return { ok: true };
    }

    /**
     * §WALL-PROFILE — returns a refusal when the merged wall would hold an unauthorable
     * profile, or `null` when there is nothing to refuse. Deliberately the same shape as
     * {@link checkRakeAuthorability}: two gates, one seam, one refusal idiom.
     */
    private checkProfileAuthorability(context: CommandContext): CommandValidationResult | null {
        if (this.input.elementType?.toLowerCase().trim() !== 'wall') return null;
        if (!('wallProfile' in (this.input.parameters ?? {}))) return null;

        const wallStore = (context?.stores as { wallStore?: { getById?(id: string): unknown } } | undefined)?.wallStore;
        const wall = wallStore?.getById?.(this.input.elementId) as
            | { curve?: unknown; layers?: unknown[]; openings?: unknown[]; height?: number; baseLine?: unknown }
            | undefined
            | null;
        if (!wall) return null;

        const auth = profileAuthorability({
            wallProfile: this.input.parameters['wallProfile'],
            baseLine:    wall.baseLine,
            height:      wall.height,
            curve:       wall.curve,
            layers:      wall.layers,
            openings:    wall.openings,
        } as Parameters<typeof profileAuthorability>[0]);
        if (auth.ok) return null;

        // §REFUSAL-IDENTITY (GE-09) — the gate's own sentence reaches the user verbatim;
        // this command orchestrates the validator, it does not own the reason.
        return {
            ok: false,
            reason:
                `This wall's outline can't be edited as it is now — ` +
                childRefusalText(
                    auth.reason,
                    'profileAuthorability',
                    `wall ${this.input.elementId}`,
                ),
        };
    }

    /**
     * §FIX-PANEL-HEIGHT-STRANDS-OPENINGS — refuse a wall HEIGHT change that would leave a
     * hosted door or window outside its host.
     *
     * THE BUG THIS CLOSES, measured 2026-08-18. `UpdateWallHeightCommand` has consulted
     * `planOpeningRefit` since EV-03 (`:98`, `:140`) — but the PROPERTY PANEL does not go
     * through that command. It goes
     * `PropertyDescriptorGenerator.ts:57` → `PropertyPanel.ts:953` →
     * `initBusHandlers.ts:2022-2028` → THIS command → `WallStore.update`, whose only
     * height validation is NaN/negative (`WallStore.ts:746-762`). So the exact defect
     * EV-03 fixed — "lowering a 3.0 m wall to 1.0 m left a 2.1 m door exceeding its host
     * by 1.1 m" — was still reachable, silently, from the panel a user actually uses.
     *
     * ⛔ NO SECOND PREDICATE. This calls the SAME `planOpeningRefit` with the SAME
     * candidate-wall construction `UpdateWallHeightCommand:98` uses. C84 EI-9 is one
     * answer per question, and "does this opening still fit its host" is one question;
     * a private containment check here would be the second implementation that later
     * disagrees with the first.
     *
     * Returns `null` when there is nothing to refuse — not a wall, no height in the
     * patch, wall not found, no openings, or every opening still fits.
     */
    private checkWallHeightOpeningFit(context: CommandContext): CommandValidationResult | null {
        if (this.input.elementType?.toLowerCase().trim() !== 'wall') return null;
        const params = this.input.parameters ?? {};
        if (!('height' in params)) return null;
        const nextHeight = params['height'];
        if (typeof nextHeight !== 'number' || !Number.isFinite(nextHeight)) return null;

        const wallStore = (context?.stores as { wallStore?: { getById?(id: string): unknown } } | undefined)?.wallStore;
        const wall = wallStore?.getById?.(this.input.elementId) as
            | { openings?: unknown[] }
            | undefined
            | null;
        if (!wall) return null;
        if (!Array.isArray(wall.openings) || wall.openings.length === 0) return null;

        let refit;
        try {
            refit = wallOccupancyStore.planOpeningRefit(
                { ...(wall as object), height: nextHeight } as Parameters<
                    typeof wallOccupancyStore.planOpeningRefit
                >[0],
            );
        } catch {
            // §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH — a gate that throws must not become the
            // crash it exists to prevent. An unexpected shape means "cannot judge", and
            // "cannot judge" is not "refuse": fall through to the store, which still has
            // its own defence in depth.
            return null;
        }
        if (refit.ok) return null;

        // §REFUSAL-IDENTITY (GE-09) — `planOpeningRefit` states BOTH numbers ("a 2.1 m door
        // in a 1.0 m wall"), which is the whole value of the refusal. Pass them through
        // verbatim; a paraphrase here would restate the premise as the cause.
        const detail = refit.refusals.map(r => r.reason).join(' · ');
        return {
            ok: false,
            reason:
                `This wall can't be ${nextHeight} m tall while it hosts what it hosts — ` +
                childRefusalText(
                    detail,
                    'planOpeningRefit',
                    `wall ${this.input.elementId}`,
                ),
        };
    }

    /**
     * §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH — returns a refusal when the merged wall
     * would hold an unauthorable rake, or `null` when there is nothing to refuse
     * (not a wall, no rake in the patch, wall not found, or the rake is authorable).
     */
    private checkRakeAuthorability(context: CommandContext): CommandValidationResult | null {
        if (this.input.elementType?.toLowerCase().trim() !== 'wall') return null;
        if (!('rakeAngleDeg' in (this.input.parameters ?? {}))) return null;

        const wallStore = (context?.stores as { wallStore?: { getById?(id: string): unknown } } | undefined)?.wallStore;
        const wall = wallStore?.getById?.(this.input.elementId) as
            | { curve?: unknown; layers?: unknown[]; openings?: unknown[] }
            | undefined
            | null;
        // Element-not-found is `execute`'s existing refusal path — don't duplicate it here.
        if (!wall) return null;

        const auth = rakeAuthorability({
            rakeAngleDeg: this.input.parameters['rakeAngleDeg'],
            curve:        wall.curve,
            layers:       wall.layers,
            openings:     wall.openings,
        } as Parameters<typeof rakeAuthorability>[0]);
        if (auth.ok) return null;

        // §REFUSAL-IDENTITY (GE-09) — the same doctrine at the canExecute seam. The
        // rake gate is `@pryzm/geometry-wall`'s `rakeAuthorability`, a validator this
        // command orchestrates but does not own; when it refuses it normally states a
        // precise sentence ("…not supported on a LAYERED wall"), and that sentence
        // must reach the user VERBATIM. The old fallback
        // (`'the rake is not authorable on this wall.'`) restated the refusal's
        // premise as though it were its cause — the user learns nothing and the
        // silent gate stays hidden.
        return {
            ok: false,
            reason:
                `This wall can't be angled (raked) as it is now — ` +
                childRefusalText(
                    auth.reason,
                    'rakeAuthorability',
                    `wall ${this.input.elementId}`,
                ),
        };
    }

    execute(context: CommandContext): CommandResult {
        const { elementId, elementType, parameters } = this.input;
        const store = this.resolveStore(elementType, context);

        if (!store) {
            return {
                success: false,
                affectedElementIds: [],
                info: [`[UpdateElementParameterCommand] No store for elementType: ${elementType}`]
            };
        }

        const element = this.getElement(store, elementType, elementId, context);
        if (!element) {
            return {
                success: false,
                affectedElementIds: [],
                info: [`[UpdateElementParameterCommand] Element not found: ${elementId}`]
            };
        }

        this.previousValues = this.captureCurrentValues(element, parameters);
        // §ADR-0319-CLASS-2 — snapshot the host wall's audit envelope BEFORE the
        // write, so undo can put the counters back rather than advance them.
        this.prevWallAudit = this.captureWallAudit(store, elementType, element);

        const validated = this.validateParameters(parameters, elementType);
        if (!validated.ok) {
            // §REFUSAL-IDENTITY (GE-09) — the EXECUTE-time validation seam. Was
            // `validated.reason ?? 'Parameter validation failed'`. `info[0]` is
            // rendered straight into the operation overlay and the RAC chat, so that
            // literal was a sentence with the grammatical shape of an explanation and
            // the information content of a shrug — and, being indistinguishable from a
            // real reason, it HID the under-reporting validator. `validateParameters`
            // states a reason on every branch it has TODAY; the point of routing
            // through the shared renderer is that the first branch which forgets to
            // becomes visible instead of invisible.
            return {
                success: false,
                affectedElementIds: [],
                info: [childRefusalText(
                    validated.reason,
                    'UpdateElementParameterCommand.validateParameters',
                    `${elementType}/${elementId}`,
                )]
            };
        }

        this.applyUpdate(store, elementType, elementId, parameters, context);

        console.log(`[UpdateElementParameterCommand] Updated ${elementType}/${elementId}`, parameters);

        return { success: true, affectedElementIds: [elementId] };
    }

    undo(context: CommandContext): CommandResult {
        if (Object.keys(this.previousValues).length === 0) {
            return { success: true, affectedElementIds: [] };
        }

        const undoCmd = new UpdateElementParameterCommand({
            elementId: this.input.elementId,
            elementType: this.input.elementType,
            parameters: this.previousValues,
        });

        const result = undoCmd.execute(context);

        // §ADR-0319-CLASS-2 — the replay above restored the VALUES but, being a
        // forward write, also advanced the audit counters. Put them back.
        this.restoreWallAudit(context);

        return result;
    }

    /**
     * §ADR-0319-CLASS-2 — read the host wall's audit envelope.
     *
     * For `wall` the element IS the wall. For a hosted `door` / `window` the
     * envelope that moves is the HOST WALL's (`updateDoor`/`updateWindow` bump
     * `wall._renderVersion` so the void is re-cut) — the opening record itself
     * carries no audit counter. Returns `null` for every other element type,
     * which is the honest answer: their stores do not implement the
     * `preserveMetadata` restore contract, so there is nothing this command can
     * put back without inventing it.
     */
    private captureWallAudit(
        store: any,
        elementType: string,
        element: any,
    ): { wallId: string; metadata: unknown; renderVersion: number | undefined } | null {
        const t = elementType.toLowerCase().trim();
        let wallId: string | undefined;
        if (t === 'wall') wallId = element?.id;
        else if (t === 'door' || t === 'window') wallId = element?.wallId;
        if (!wallId) return null;

        const wall = store?.getById?.(wallId);
        if (!wall) return null;
        return {
            wallId,
            // Deep-copied: the store hands out frozen clones today, but undo must
            // not depend on that staying true.
            metadata: wall.metadata ? JSON.parse(JSON.stringify(wall.metadata)) : undefined,
            renderVersion: wall._renderVersion,
        };
    }

    /** §ADR-0319-CLASS-2 — write the captured envelope back, audit-neutrally. */
    private restoreWallAudit(context: CommandContext): void {
        const snap = this.prevWallAudit;
        if (!snap || snap.metadata === undefined) return;

        const wallStore = (context.stores as {
            wallStore?: { update?(id: string, updates: unknown, preserveMetadata?: boolean): unknown };
        }).wallStore;
        if (!wallStore?.update) return;

        // `preserveMetadata = true` makes WallStore.update honour the supplied
        // metadata verbatim instead of stamping `modifiedAt = now` and
        // `version + 1`. `_renderVersion` is never auto-bumped inside update(),
        // so passing it writes exactly the captured value.
        wallStore.update(
            snap.wallId,
            { metadata: snap.metadata, _renderVersion: snap.renderVersion },
            true,
        );
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.input,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    /**
     * §FIX-SNAPSHOT-SCOPE-MATCHES-WRITE (L-947) — was a 15-branch `switch` that
     * `affectedStores` could not see. It is now a lookup into
     * `ELEMENT_STORE_ROUTES`, the same row the constructor read the snapshot
     * scope from. The routing behaviour is unchanged branch for branch,
     * including the `window.*` last-resort fallbacks for furniture / handrail
     * and the `null` for an unrouted type; what changed is that adding a route
     * now necessarily adds its scope, because they are one object.
     */
    private resolveStore(elementType: string, context: CommandContext): any {
        return elementStoreRoute(elementType)?.select(context) ?? null;
    }

    private getElement(store: any, elementType: string, elementId: string, _context: CommandContext): any {
        const t = elementType.toLowerCase();
        if (t === 'window') return store.getWindow?.(elementId);
        if (t === 'door')   return store.getDoor?.(elementId);
        return store.getById?.(elementId) ?? store.get?.(elementId);
    }

    private applyUpdate(store: any, elementType: string, elementId: string, parameters: Record<string, any>, context: CommandContext): void {
        const t = elementType.toLowerCase();

        if (t === 'window') {
            store.updateWindow?.(elementId, parameters);
            // Also sync rich WindowStore so WindowBuilder rebuilds the frame geometry
            if (windowStore.has(elementId)) {
                windowStore.update(elementId, parameters as any);
            }
        } else if (t === 'door') {
            store.updateDoor?.(elementId, parameters);
            // Also sync rich DoorStore so DoorBuilder rebuilds the frame geometry
            if (doorStore.has(elementId)) {
                doorStore.update(elementId, parameters as any);
            }
        } else if (t === 'stair' || t === 'stairs') {
            // Expand dot-notation keys (e.g. 'properties.material' → {properties: {material: ...}})
            // so that StairStore.update() can correctly merge nested objects.
            const expanded: Record<string, any> = {};
            for (const [key, val] of Object.entries(parameters)) {
                if (key.startsWith('properties.')) {
                    const subKey = key.slice('properties.'.length);
                    if (!expanded.properties) expanded.properties = {};
                    expanded.properties[subKey] = val;
                } else {
                    expanded[key] = val;
                }
            }
            store.update?.(elementId, expanded);
        } else if (['furniture', 'wardrobe', 'wardrobe_glass_door', 'corner_wardrobe', 'bed', 'table', 'chair', 'sofa'].includes(t)) {
            // FurnitureStore.update() REPLACES the entry with the data passed
            // in (it expects the full FurnitureData record), so we must merge
            // the partial parameter set onto the existing record before calling
            // — otherwise furnitureType / width / position / etc. get wiped and
            // the rebuild produces an empty mesh.
            const existing = store.get?.(elementId);
            if (existing) {
                store.update?.(elementId, { ...existing, ...parameters });
            } else {
                store.update?.(elementId, parameters);
            }
        } else if (t === 'slab') {
            // §FIX-SLAB-PARAM-WIPE — SlabStore.update() does a FULL REPLACE (it expects a
            // complete SlabData record and structuredClones + freezes it, per C03 §01 §3.4),
            // NOT a partial merge like WallStore.update(). Passing the raw partial parameter
            // set (e.g. { materialColor }) therefore WIPED the whole slab record — id,
            // levelId, polygon, layers — leaving `{ materialColor }`. The store then emitted a
            // StoreChangeEvent with `elementId: undefined` (slab.id gone), which crashed the
            // downstream store-event listeners: ViewDependencyTracker._onStoreEvent
            // (`event.elementId.includes('::')`) and DependencyResolver's cascade dispatcher
            // (`triggerElementId.substring(0, 8)`) both assume a defined id — the founder's
            // per-frame rAF spam. Merge onto the existing record first (mirrors the furniture
            // branch above) so the record stays whole and the emit carries a real id.
            const existing = store.getById?.(elementId);
            if (existing) {
                store.update?.(elementId, { ...existing, ...parameters });
            } else {
                store.update?.(elementId, parameters);
            }
        } else {
            store.update?.(elementId, parameters);
        }

        this.triggerGeometryRebuild(elementType, elementId, context);
    }

    private triggerGeometryRebuild(elementType: string, elementId: string, context: CommandContext): void {
        const t = elementType.toLowerCase();

        // §FIX-STAIR-PARAM-NO-REGEN (L-215) — declarative rebuild path.
        // Element types that register an ElementRebuildDescriptor own their own
        // "regenerate geometry from parameters" command; the generic command
        // dispatches it instead of carrying a per-type branch below. This is how
        // stair now rebuilds (flight + landing + treads/risers + railing, with its
        // DERIVED fields reconciled first). New parametric elements register a
        // descriptor rather than growing the legacy if-ladder.
        const descriptor = resolveElementRebuildDescriptor(elementType);
        if (descriptor) {
            const changedKeys = Object.keys(this.input.parameters);
            if (isGeometryAffectingChange(descriptor, changedKeys)) {
                try {
                    const rebuildCmd = descriptor.createRebuildCommand(elementId);
                    const res = rebuildCmd.execute(context);
                    if (!res.success) {
                        console.warn('[UpdateElementParameterCommand] Rebuild command failed:', res.info);
                    }
                } catch (e) {
                    console.warn('[UpdateElementParameterCommand] Declarative rebuild error:', e);
                }
            }
            return;
        }

        try {
            if (t === 'wall') {
                // ── §FIX-PARAM-REBUILD-READS-STALE-STORE (L-813) ───────────
                //
                // Founder-reported 2026-08-09: "the vertical angle works, but the
                // wall only gets angled after another element is created or
                // modified."
                //
                // `applyParameters()` WRITES through `resolveStore()` →
                // `context.stores.wallStore`. This read used `window.wallStore`.
                // Those are not guaranteed to be the same instance — the editor
                // threads its stores in explicitly at `engineLauncher.ts:781`, and
                // the window globals are a separate legacy surface. When they
                // differ, the rebuild re-reads a wall WITHOUT the change that was
                // just written and faithfully rebuilds the OLD geometry. The edit
                // then appears only when some later event triggers a rebuild that
                // happens to read the right store — exactly "it applies after I
                // touch something else".
                //
                // Reading back from the SAME store we wrote to removes the class of
                // bug, not just the rake instance: every parameter edit routed
                // through this command had the same latent stale-read. It also
                // drops one `window.*` reach-through (P4).
                //
                // `context.stores.wallStore` is falsy-guarded rather than assumed —
                // some legacy call sites construct a context without it, and a
                // missing store must degrade to "no rebuild", never throw inside a
                // command that has already mutated state.
                const builder = window.wallFragmentBuilder;
                const store   = (context.stores as { wallStore?: { getById?: (id: string) => unknown } }).wallStore
                             ?? window.wallStore // TODO(TASK-07) — last-resort legacy fallback
                             ;
                const wall    = store?.getById?.(elementId);

                // ── §DIAG-PARAM-REBUILD (L-813) ────────────────────────────
                //
                // Ship the PROBE before the next fix. Two fixes have now been
                // deployed against this defect on two different hypotheses —
                // the stale store read (above) and §WALL-RAKE-INVALIDATION in
                // WallFragmentBuilder — and the founder still reports "the wall
                // only gets angled after another element is created". Both fixes
                // were real bugs; neither is demonstrably THE bug, because the
                // guarded call below cannot be distinguished from success in a
                // log. `builder?.buildWall` absent, `store` absent and `wall`
                // not found ALL produce the identical observable: silence.
                //
                // That is the §CONTEXT-DATA-HONESTY failure — a refusal and a
                // success must never be the same value — and it is why this has
                // taken three rounds. Each branch now names itself, and the
                // success branch prints the rake it is building WITH, so the
                // next console paste settles it: either the rebuild is not
                // running (and which of the three reasons), or it is running
                // with the correct angle and the defect is downstream in the
                // builder, not here.
                if (!builder?.buildWall) {
                    console.warn(
                        `[UpdateElementParameterCommand] §DIAG-PARAM-REBUILD NO REBUILD for wall/${elementId} — ` +
                        `window.wallFragmentBuilder is ${builder ? 'present but has no buildWall()' : 'absent'}. ` +
                        `The parameter WAS written to the store; only the mesh rebuild was skipped.`,
                    );
                } else if (!store) {
                    console.warn(
                        `[UpdateElementParameterCommand] §DIAG-PARAM-REBUILD NO REBUILD for wall/${elementId} — ` +
                        `neither context.stores.wallStore nor window.wallStore resolved.`,
                    );
                } else if (!wall) {
                    console.warn(
                        `[UpdateElementParameterCommand] §DIAG-PARAM-REBUILD NO REBUILD for wall/${elementId} — ` +
                        `store resolved but getById() returned nothing (wrong store instance, or wall deleted).`,
                    );
                } else {
                    const rake = (wall as { rakeAngleDeg?: number }).rakeAngleDeg;
                    console.log(
                        `[UpdateElementParameterCommand] §DIAG-PARAM-REBUILD rebuilding wall/${elementId} ` +
                        `rakeAngleDeg=${rake ?? 'absent'} ` +
                        `storeSource=${(context.stores as { wallStore?: unknown }).wallStore ? 'context' : 'window-fallback'}`,
                    );
                    // §WALL-RAKE-JOINT-ONE-EDIT-BEHIND (founder 2026-08-09) — contract of
                    // this direct build: it is the IMMEDIATE-FEEDBACK path only. It runs
                    // against whatever WallPipelineV2Cache state exists at this instant,
                    // which for neighbour-coupled inputs (the ADR-0312 twin-solve loft) is
                    // one refresh old. `buildWallV2Geometry` now refuses a loft whose
                    // recorded rake mismatches the store (§WALL-RAKE-JOINT-STALE-CACHE), so
                    // this build always renders the wall's CURRENT angle (uniform ADR-0310
                    // shear). The authoritative cache-refresh-then-rebuild — including the
                    // NEIGHBOURS' lofted tops — is owned by WallRebuildCoordinator._flush,
                    // which the store write above has already scheduled for this same
                    // mutation cycle (rake edits classify whole-level per
                    // WallDeltaClassifier §WALL-RAKE-JOINT-ONE-EDIT-BEHIND).
                    builder.buildWall(wall);
                }

            } else if (t === 'window' || t === 'door') {
                const wallStore = window.wallStore // TODO(TASK-07);
                const walls     = wallStore?.getAll?.() ?? [];
                for (const wall of walls) {
                    const hasOpening = wall.openings?.some(
                        (o: any) => o.elementId === elementId || o.id === elementId
                    );
                    if (hasOpening) {
                        const builder = window.wallFragmentBuilder;
                        if (builder?.buildWall) builder.buildWall(wall);
                        break;
                    }
                }

            } else if (t === 'slab') {
                const builder = window.slabBuilder;
                const store   = window.slabStore // TODO(TASK-07);
                const slab    = store?.getById?.(elementId);
                if (slab && builder?.buildSlab) builder.buildSlab(slab);

            } else if (t === 'curtainwall' || t === 'curtain-wall') {
                const builder = window.curtainWallBuilder;
                const store   = window.curtainWallStore // TODO(TASK-07);
                const cw      = store?.get?.(elementId) ?? store?.getById?.(elementId);
                if (cw && builder?.buildCurtainWall) builder.buildCurtainWall(cw);

            } else if (t === 'column') {
                const builder = window.columnBuilder;
                const store   = window.columnStore // TODO(TASK-07);
                const col     = store?.get?.(elementId);
                if (col && builder?.buildColumn) builder.buildColumn(col);

            } else if (t === 'roof') {
                // Roof geometry rebuild is handled automatically via the bim-roof-updated
                // event emitted by RoofStore.update(). No direct builder call is needed.

            } else if (['furniture', 'wardrobe', 'wardrobe_glass_door', 'corner_wardrobe', 'bed', 'table', 'chair', 'sofa'].includes(t)) {
                _bus.emit('bim-furniture-updated', { id: elementId }); // F.events.17

            } else if (t === 'handrail') {
                _bus.emit('bim-handrail-updated', { id: elementId }); // F.events.17

            }
            // NOTE: stair / stairs are handled above via the declarative
            // ElementRebuildRegistry (GenerateStairGeometryCommand) — including the
            // railing-type propagation that used to live here — so there is no
            // per-type stair branch in this legacy ladder any more.
        } catch (e) {
            console.warn('[UpdateElementParameterCommand] Geometry rebuild error:', e);
        }
    }

    /**
     * §FIX-STAIR-PROPS-UNDO — snapshot the PRE-EDIT value of every key being written,
     * so `undo()` can replay it as a normal parameter write.
     *
     * The flat `element[key]` read was wrong for DOTTED keys. The stair panel sends
     * `properties.stringerType` / `properties.nosingType` / `properties.riserVisible` /
     * `properties.material` / `properties.railingType`; `element['properties.nosingType']`
     * is `undefined`, so the snapshot recorded `undefined` and undo replayed
     * `{ 'properties.nosingType': undefined }` — which `applyUpdate` faithfully expands
     * to `{ properties: { nosingType: undefined } }` and StairStore merges, ERASING the
     * property instead of restoring it. `StairMeshBuilder` then fell back to the type /
     * DEFAULT_STAIR_PROPERTIES value, so undo produced a stair that matched neither the
     * before nor the after state. Resolve the path so undo restores the real prior value.
     */
    private captureCurrentValues(element: any, parameters: Record<string, any>): Record<string, any> {
        const snapshot: Record<string, any> = {};
        for (const key of Object.keys(parameters)) {
            if (key.includes('.')) {
                let cur: any = element;
                for (const seg of key.split('.')) {
                    if (cur === null || cur === undefined) { cur = undefined; break; }
                    cur = cur[seg];
                }
                snapshot[key] = cur;
            } else {
                snapshot[key] = element[key];
            }
        }
        return snapshot;
    }

    private validateParameters(parameters: Record<string, any>, _elementType: string): CommandValidationResult {
        for (const [key, val] of Object.entries(parameters)) {
            if (typeof val === 'number' && isNaN(val)) {
                return { ok: false, reason: `Parameter '${key}' is NaN` };
            }
            if (key === 'height' && typeof val === 'number' && val < 0) {
                return { ok: false, reason: `Height must be ≥ 0` };
            }
            if (key === 'thickness' && typeof val === 'number' && val <= 0) {
                return { ok: false, reason: `Thickness must be > 0` };
            }
            if ((key === 'width' || key === 'depth' || key === 'length') && typeof val === 'number' && val <= 0) {
                return { ok: false, reason: `${key} must be > 0` };
            }
        }
        return { ok: true };
    }
}
