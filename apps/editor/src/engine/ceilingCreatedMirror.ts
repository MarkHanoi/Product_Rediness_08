/**
 * §P3.2-CL — the record the `ceiling.created` bus→legacy-store mirror writes.
 *
 * Extracted from the `initTools.ts` closure for the reason `beamCreatedMirror.ts`,
 * `roofCreatedMirror.ts` and `curtainWallCreatedMirror.ts` were: `initTools` is a
 * ~2800-line function needing a THREE world and twenty stores before its first
 * line runs, so nothing could EXECUTE this mapping in a test. A bridge body no
 * test can reach is a bridge body no test can measure — C84 §9.
 *
 * Side effects (ViewDependencyTracker / bimManager registration, the dedup
 * guard) stay with the caller; this module decides only WHAT the record says.
 */

/** The `ceiling.created` fields this mapping consumes. Structurally a subset of
 *  `RuntimeEvents['ceiling.created']`, declared locally so this module stays
 *  free of a runtime-composer import (and of the pdfjs-bearing barrel behind
 *  it). */
export interface CeilingCreatedEventLike {
    commandType?: string;
    id?: string;
    levelId?: string;
    boundary?: ReadonlyArray<{ x: number; y: number; z: number }>;
    ceilingHeight?: number;
    thickness?: number;
    /** L0 `Ceiling.materialId` → legacy `CeilingFinishSpec.soffitMaterialId`. */
    materialId?: string;
    /** L0 `Ceiling.materialColor` → legacy `CeilingFinishSpec.soffitColor`. */
    materialColor?: string;
}

/** What the mirror needs from the caller that is not on the event. */
export interface CeilingMirrorContext {
    /**
     * How many ceilings the legacy store already holds — the ordinal
     * `CreateCeilingCommand.ts:188` computes as `ceilingStore.getAll().length + 1`
     * to name a ceiling. Passed IN rather than read here so this module stays a
     * pure mapping with no store dependency.
     */
    readonly existingCeilingCount: number;
}

/**
 * §FIX-CEILING-BRIDGE-FINISH (L-973 · C84 EI-2a) — the values this hop applies
 * when the author stated nothing, named ONCE instead of being spelled as
 * anonymous literals inside a 60-line object.
 *
 * ⚠ THE WHOLE FINISH SPECIFICATION USED TO BE HARDCODED HERE. `soffitColor`,
 * `soffitPattern`, `exposedStructure`, `label`, `ceilingNumber` and
 * `baseOffset` were literals, so an authored ceiling finish was overwritten by a
 * constant. `materialColor` and `materialId` — both on the L0 `Ceiling` schema
 * and both accepted by `CreateCeilingHandler` — now flow through
 * `CommandEventBridge` and land in `soffitColor` / `soffitMaterialId`, the two
 * slots `CeilingFinishSpec` already declares (`CeilingTypes.ts:82-83`) and that
 * `CeilingColourSystem.ts:38` reads to colour the mesh.
 *
 * ─── WHAT THIS HOP STILL CANNOT CARRY, AND WHY IT IS SAID RATHER THAN HIDDEN ─
 *  • `soffitPattern` / `exposedStructure` — no L0 field, no producer, and the
 *    legacy `CreateCeilingCommand.ts:173-176` writes these same two values. A
 *    default that MATCHES the other path is not a divergence; inventing an L0
 *    field with no producer would be an affordance with no implementation.
 *  • `baseOffset` — legacy takes `payload.baseOffset ?? 0`; L0 `Ceiling` has no
 *    such field, so 0 is the only value this path can state.
 *  • `ceilingNumber` — kept as `''` to MATCH `CreateCeilingCommand.ts:210`
 *    exactly. ⚠ It is not harmless: `ScheduleExtractor.ts:158` reads
 *    `properties?.mark ?? ceilingNumber ?? 'CG###'`, and `''` is a value to
 *    `??`, so the ceiling schedule prints an EMPTY mark on BOTH paths. Fixing
 *    that means changing both creators together, not one of them here — a
 *    one-sided fix would turn a shared defect into a per-path divergence
 *    (C79 §7.4), which is the worse of the two.
 */
export const CEILING_MIRROR_DEFAULTS = {
    ceilingHeight: 2.7,
    thickness: 0.025,
    /** Legacy `CreateCeilingCommand.ts:175` uses this same value as its fallback. */
    soffitColor: '#F5F5F0',
    soffitPattern: 'none',
    exposedStructure: false,
    baseOffset: 0,
    /** See the block comment above — deliberately matched to the legacy path. */
    ceilingNumber: '',
} as const;

/**
 * The label a bus-created ceiling takes, byte-identical to
 * `CreateCeilingCommand.ts:188` (`Ceiling-01`, `Ceiling-02`, …).
 *
 * ⚠ THIS BRIDGE USED TO WRITE THE LITERAL `'Ceiling'` FOR EVERY ONE, so a model
 * whose ceilings were drawn in plan had N elements sharing a single name in the
 * project browser, the schedule and the IFC export, while the same ceilings
 * drawn through the 3-D path were numbered. C79 §7.4: per-path divergence is
 * worse than uniform absence.
 */
export function ceilingLabelForOrdinal(ordinal: number): string {
    return `Ceiling-${ordinal.toString().padStart(2, '0')}`;
}

export interface MirroredCeilingRecord {
    id: string;
    type: 'ceiling';
    levelId: string;
    parentId: string;
    label: string;
    ceilingNumber: string;
    boundary: {
        polygon: Array<{ x: number; z: number }>;
        height: number;
        thickness: number;
        baseOffset: number;
        detectionMethod: 'manual-polygon';
    };
    finishSpec: {
        exposedStructure: boolean;
        soffitColor: string;
        soffitPattern: 'none';
        soffitMaterialId?: string;
    };
    holeElements: never[];
    coveredRoomIds: never[];
    boundingWallIds: never[];
    visible: boolean;
    properties: Record<string, unknown>;
    ifcData: { guid: string; ifcClass: 'IfcCovering'; predefinedType: 'CEILING' };
    metadata: { createdAt: number; modifiedAt: number; createdBy: string; version: number };
}

/**
 * Build the legacy `CeilingData` a `ceiling.created` event describes, or `null`
 * when the event is not one this mirror can act on.
 */
export function ceilingRecordFromCreatedEvent(
    ev: CeilingCreatedEventLike,
    ctx: CeilingMirrorContext,
): MirroredCeilingRecord | null {
    if (ev.commandType !== 'ceiling.create') return null;
    if (!ev.id || !ev.boundary || ev.boundary.length < 3) return null;

    // Convert Vec3[] boundary (new schema: {x,y,z}) to CeilingVertex[] (legacy: {x,z}).
    const polygon = ev.boundary.map((v) => ({ x: v.x, z: v.z }));

    return {
        id:            ev.id,
        type:          'ceiling',
        levelId:       ev.levelId ?? '',
        parentId:      ev.levelId ?? '',
        label:         ceilingLabelForOrdinal(ctx.existingCeilingCount + 1),
        ceilingNumber: CEILING_MIRROR_DEFAULTS.ceilingNumber,
        boundary: {
            polygon,
            height:          ev.ceilingHeight ?? CEILING_MIRROR_DEFAULTS.ceilingHeight,
            thickness:       ev.thickness ?? CEILING_MIRROR_DEFAULTS.thickness,
            baseOffset:      CEILING_MIRROR_DEFAULTS.baseOffset,
            detectionMethod: 'manual-polygon',
        },
        finishSpec: {
            exposedStructure: CEILING_MIRROR_DEFAULTS.exposedStructure,
            soffitColor:      ev.materialColor ?? CEILING_MIRROR_DEFAULTS.soffitColor,
            soffitPattern:    CEILING_MIRROR_DEFAULTS.soffitPattern,
            // Omitted rather than set to `undefined`: `CeilingDataSchema:98` makes
            // this `.optional()`, and an explicit `undefined` key serialises into
            // the project file as a field the author never set.
            ...(ev.materialId ? { soffitMaterialId: ev.materialId } : {}),
        },
        holeElements:    [],
        coveredRoomIds:  [],
        boundingWallIds: [],
        visible:         true,
        properties:      {},
        ifcData: {
            guid:           crypto.randomUUID(),
            ifcClass:       'IfcCovering',
            predefinedType: 'CEILING',
        },
        metadata: {
            createdAt:  Date.now(),
            modifiedAt: Date.now(),
            createdBy:  'user',
            version:    1,
        },
    };
}
