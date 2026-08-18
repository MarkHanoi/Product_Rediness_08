/**
 * §P3.1-CW — the record the `curtain-wall.created` bus→legacy-store mirror writes.
 *
 * ─── WHY THIS IS A FUNCTION AND NOT A CLOSURE INSIDE initTools.ts ────────────
 * Extracted for exactly the reason `beamCreatedMirror.ts` and
 * `roofCreatedMirror.ts` were: `initTools` is a ~2800-line function needing a
 * THREE world, a components registry, a command manager and twenty stores
 * before its first line runs, so nothing could EXECUTE this mapping in a test.
 * A bridge body no test can reach is a bridge body no test can measure — which
 * is how C84 §9 came to list eleven of them as unread, and how five
 * constant-false reads (L-972) survived in plain sight.
 *
 * This module is the SEAM ONLY: the caller keeps every side effect
 * (ViewDependencyTracker / bimManager registration, `storeEventBus.emit`, the
 * `bim-curtainwall-added` DOM event, the dedup guard). What lives here is the
 * decision of WHICH command types are accepted and WHAT the legacy record says.
 */

/** The `curtain-wall.created` fields this mapping consumes. Structurally a
 *  subset of `RuntimeEvents['curtain-wall.created']`, declared locally so this
 *  module stays free of a runtime-composer import (and of the pdfjs-bearing
 *  barrel behind it). */
export interface CurtainWallCreatedEventLike {
    commandType?: string;
    id?: string;
    levelId?: string;
    baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
    height?: number;
    baseOffset?: number;
    bayWidth?: number;
    bayHeight?: number;
    mullionThickness?: number;
    panelThickness?: number;
    materialId?: string;
    panels?: ReadonlyArray<{ id: string }>;
}

export interface MirroredCurtainWallRecord {
    id: string;
    type: 'curtain-wall';
    levelId: string;
    baseLine: [
        { x: number; y: number; z: number },
        { x: number; y: number; z: number },
    ];
    height: number;
    baseOffset: number;
    gridXSpacing: number;
    gridYSpacing: number;
    mullionSize: number;
    panelThickness: number;
}

/**
 * The command types this mirror accepts.
 *
 * ⚠ §FIX-CW-BRIDGE-DEAD-ARMS (L-972 · C84 EI-2b) — this used to be a
 * four-way `||` chain accepting `curtain-wall.batch.create`,
 * `curtainwall.create` and `curtainwall.batch.create` as well. All three were
 * UNREACHABLE: `CommandEventBridge` writes the literal `'curtain-wall.create'`
 * on BOTH its single and its batch case (the batch loop sets the single-create
 * value deliberately, so one guard serves both), and it is the only emitter of
 * this event. An accept-arm that cannot run is not tolerance, it is a claim the
 * code does not keep — and it made the guard read as though the batch path were
 * separately handled here when it is not.
 *
 * A Set rather than a chain so the accepted vocabulary is a VALUE a test can
 * read, instead of a shape a test can only probe one string at a time.
 */
export const ACCEPTED_CURTAIN_WALL_COMMAND_TYPES: ReadonlySet<string> =
    new Set(['curtain-wall.create']);

/**
 * §FIX-CW-BRIDGE-AUTHORED-VALUES (L-972 · C84 EI-2a/EI-2b) — the defaults this
 * hop applies when the author stated nothing, named ONCE.
 *
 * ⚠ `baseOffset` and `panelThickness` used to be read off the event through
 * `typeof _cwEv['…'] === 'number'` guards that could never be true: neither
 * field existed on the L0 `CurtainWall` schema and neither was on
 * `CommandEventBridge`'s emit list, so the defaults below ALWAYS won and an
 * authored value could never take effect. Both are now first-class on the L0
 * schema (`CurtainWall.ts`), seeded by `CreateCurtainWallHandler` and emitted by
 * the bridge, so these are genuinely fallbacks now.
 *
 * The values match the L0 schema's own `.default(…)` deliberately: the legacy
 * record and the Immer record must not disagree about a wall nobody edited.
 */
export const CURTAIN_WALL_MIRROR_DEFAULTS = {
    height: 3,
    baseOffset: 0,
    /** → legacy `gridXSpacing` (see `migrateToGridSystem`). */
    bayWidth: 1.2,
    /** → legacy `gridYSpacing`. */
    bayHeight: 1.5,
    /** → legacy `mullionSize` (a cross-section width/depth, not a thickness). */
    mullionThickness: 0.05,
    panelThickness: 0.05,
} as const;

/**
 * Build the legacy `CurtainWallData` a `curtain-wall.created` event describes,
 * or `null` when the event is not one this mirror can act on.
 *
 * Side effects stay with the caller; this function only decides the record.
 */
export function curtainWallRecordFromCreatedEvent(
    ev: CurtainWallCreatedEventLike,
): MirroredCurtainWallRecord | null {
    if (!ACCEPTED_CURTAIN_WALL_COMMAND_TYPES.has(ev.commandType ?? '')) return null;
    if (!ev.id || !ev.baseLine || ev.baseLine.length < 2) return null;

    // ─── The two fields this hop CANNOT carry, said out loud ────────────────
    // Both are on the L0 `CurtainWall` schema and both are now emitted by the
    // bridge, so they are no longer destroyed in flight — but the legacy
    // `CurtainWallData` has no unambiguous home for either, and guessing one is
    // how a silent drop gets replaced by a silent mis-file:
    //
    //  • `materialId` is a SINGLE generic id. The legacy model has THREE
    //    candidate slots — `mullionMaterialId`, `glazingMaterialId` and
    //    `systemTypeId` — with different meanings, and
    //    `CreateCurtainWallHandler` itself folds `systemTypeId` INTO
    //    `materialId`, so the id's intent is not recoverable here.
    //  • `panels[]` is an authored per-panel override; the legacy model
    //    describes panels through `gridSystem` + `CurtainPanelSyncHandler`,
    //    which derives them from the grid rather than accepting a list.
    //
    // Refusing the whole wall over either would be worse than mirroring the
    // geometry, so the wall is built and the shortfall is NAMED.
    if (ev.materialId) {
        console.warn(
            `[curtainWallCreatedMirror] §FIX-CW-BRIDGE-AUTHORED-VALUES: curtain wall ${ev.id} ` +
            `carries materialId "${ev.materialId}", which has no unambiguous slot in the legacy ` +
            `CurtainWallData (mullionMaterialId | glazingMaterialId | systemTypeId). The wall is ` +
            `mirrored WITHOUT it — its 3-D material comes from the builder's defaults, not from ` +
            `this id.`,
        );
    }
    if (ev.panels && ev.panels.length > 0) {
        console.warn(
            `[curtainWallCreatedMirror] §FIX-CW-BRIDGE-AUTHORED-VALUES: curtain wall ${ev.id} ` +
            `carries ${ev.panels.length} authored panel(s). The legacy CurtainWallData derives ` +
            `panels from gridSystem via CurtainPanelSyncHandler and cannot accept a list, so the ` +
            `wall is mirrored with its GRID only and those panel overrides are not reflected in 3-D.`,
        );
    }

    const d = CURTAIN_WALL_MIRROR_DEFAULTS;
    return {
        id:      ev.id,
        type:    'curtain-wall',
        levelId: ev.levelId ?? '',
        baseLine: [
            { x: ev.baseLine[0].x, y: ev.baseLine[0].y ?? 0, z: ev.baseLine[0].z },
            { x: ev.baseLine[1].x, y: ev.baseLine[1].y ?? 0, z: ev.baseLine[1].z },
        ],
        height:     typeof ev.height     === 'number' ? ev.height     : d.height,
        baseOffset: typeof ev.baseOffset === 'number' ? ev.baseOffset : d.baseOffset,
        // TASK-02: the builder's `migrateToGridSystem()` reads the legacy
        // `gridXSpacing`/`gridYSpacing`; without finite positive values it produces
        // NaN → 0 mullion counts → an empty mesh.
        gridXSpacing: typeof ev.bayWidth  === 'number' ? ev.bayWidth  : d.bayWidth,
        gridYSpacing: typeof ev.bayHeight === 'number' ? ev.bayHeight : d.bayHeight,
        // §P3.1-CW-MULLION-FIX: `CurtainWallData` calls this `mullionSize`, not
        // `mullionThickness`. The previous bridge wrote the payload's name straight
        // through → undefined → `cw.mullionSize.toFixed(4)` threw (logging as `{}`).
        mullionSize:    typeof ev.mullionThickness === 'number' ? ev.mullionThickness : d.mullionThickness,
        panelThickness: typeof ev.panelThickness   === 'number' ? ev.panelThickness   : d.panelThickness,
    };
}
