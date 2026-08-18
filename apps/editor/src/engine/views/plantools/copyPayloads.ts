/**
 * §FIX-COPY-PAYLOAD-FIELD-NAMES (L-978 · C84 EI-2a) — the payloads
 * `CopyPlanToolHandler` dispatches, as VALUES a test can execute.
 *
 * ─── WHY THIS IS A MODULE AND NOT A CLOSURE INSIDE THE HANDLER ──────────────
 * Extracted for exactly the reason `curtainWallCreatedMirror.ts`,
 * `beamCreatedMirror.ts` and `roofCreatedMirror.ts` were: `CopyPlanToolHandler`
 * is a `PlanToolHandler` whose every dispatch sits behind a two-click gesture on
 * a `PlanToolDrawContext` (an overlay canvas, a `planCanvas` with
 * `worldToScreen`, a device pixel ratio) and reads its source element off
 * `window.<kind>Store`. Nothing in any suite could REACH one of these payload
 * objects, which is how L-978 survived: four field names on the curtain-wall
 * dispatch that `CreateCurtainWallPayload` does not accept, minting every copied
 * curtain wall at the schema's default baseLine `(0,0,0)→(4,0,0)` with default
 * bay spacings, with no error at all.
 *
 * A payload no test can build is a payload no test can measure. What lives here
 * is ONLY the mapping legacy-record + delta → bus payload; the handler keeps the
 * dispatch, the id minting and the logging.
 *
 * ⚠ THE INVARIANT THESE FUNCTIONS EXIST TO KEEP: every key returned here must be
 * a key the RECEIVING payload interface accepts. The receivers are named at each
 * function. A key the receiver does not accept is not "extra" — it is a value
 * silently replaced by a schema default.
 */

// ─── Source shapes ───────────────────────────────────────────────────────────
// Structurally-typed subsets of the LEGACY store records this tool reads, declared
// locally so this module stays free of a `@pryzm/geometry-*` import (and of the
// THREE-bearing barrels behind them — P2 forbids `import * as THREE` here).

export interface Pt3 { x: number; y: number; z: number }
export interface Pt2 { x: number; y: number }

/** Subset of `CurtainWallData` (`geometry-curtain-wall/src/CurtainWallTypes.ts`). */
export interface LegacyCurtainWallLike {
    levelId?: string;
    baseLine: readonly [Pt3, Pt3];
    height?: number;
    baseOffset?: number;
    gridXSpacing?: number;
    gridYSpacing?: number;
    mullionSize?: number;
    panelThickness?: number;
    systemTypeId?: string;
    mullionMaterialId?: string;
    glazingMaterialId?: string;
    gridSystem?: unknown;
    /** Pre-migration spellings some records still carry. */
    panelWidth?: number;
    panelHeight?: number;
}

/** Subset of `WallData` (`geometry-wall/src/WallTypes.ts`). */
export interface LegacyWallLike {
    levelId?: string;
    baseLine: readonly [Pt3, Pt3];
    height?: number;
    thickness?: number;
    baseOffset?: number;
    materialId?: string;
    materialColor?: string;
    systemTypeId?: string;
    layers?: unknown[];
    curve?: unknown;
}

/** Subset of `SlabData` (`geometry-slab/src/SlabTypes.ts`). */
export interface LegacySlabLike {
    levelId?: string;
    width?: number;
    depth?: number;
    thickness?: number;
    position: Pt3;
    polygon?: readonly Pt2[];
    holes?: readonly (readonly Pt2[])[];
    baseOffset?: number;
    materialId?: string;
    materialColor?: string;
    systemTypeId?: string | null;
    layers?: unknown[];
}

/** Subset of `ColumnData` (`geometry-column/src/ColumnTypes.ts`). */
export interface LegacyColumnLike {
    levelId?: string;
    position: Pt3;
    height?: number;
    rotation?: number;
    profile?: string;
    width?: number;
    depth?: number;
    baseOffset?: number;
    materialId?: string;
    materialColor?: string;
    steelProfileName?: string;
}

/** Subset of `FurnitureData` (`geometry-furniture/src/FurnitureTypes.ts`). */
export interface LegacyFurnitureLike {
    levelId?: string;
    furnitureType?: string;
    position: Pt3;
    /** EulerDTO in the legacy store — a SCALAR yaw everywhere downstream. */
    rotation?: { x: number; y: number; z: number } | number;
    baseOffset?: number;
    width?: number;
    length?: number;
    height?: number;
    widthBranchTwo?: number;
    lengthBranchTwo?: number;
    widthMain?: number;
    lengthSide?: number;
    seatDepthMain?: number;
    seatDepthSide?: number;
    material?: string;
    color?: string;
    hasHeadboard?: boolean;
    lo3?: unknown;
    startPoint?: Pt3;
    cornerPoint?: Pt3;
    endPoint?: Pt3;
    kitchenConfig?: unknown;
    wardrobeCabinetConfig?: unknown;
    wardrobeConfig?: unknown;
    furnitureCategory?: string;
    properties?: unknown;
    metadata?: unknown;
}

// ─── Curtain wall ────────────────────────────────────────────────────────────

/**
 * Receiver: `CreateCurtainWallPayload`
 * (`plugins/curtain-wall/src/handlers/CreateCurtainWall.ts`).
 *
 * ⚠ §FIX-COPY-PAYLOAD-FIELD-NAMES (L-978) — this used to send `start`, `end`,
 * `gridXSpacing` and `gridYSpacing`. `CreateCurtainWallPayload` accepts NONE of
 * the four, and neither does `CommandEventBridge`'s `curtain-wall.create` case,
 * so a copied curtain wall was minted at the L0 schema's default baseLine
 * `(0,0,0)→(4,0,0)` with the default 1.2 × 1.5 m bays — wherever the original
 * stood and however it was divided — and nothing threw. The legacy vocabulary
 * and the L0 vocabulary are translated here, once:
 *
 *   `start` + `end` → `baseLine` (a 2-tuple; `y` is REQUIRED — `Vec3` in
 *                     `packages/schemas/src/base/primitives.ts` has no default
 *                     for it, and `isFiniteVec3` refuses an endpoint without it)
 *   `gridXSpacing`  → `bayWidth`
 *   `gridYSpacing`  → `bayHeight`
 *   `mullionSize`   → `mullionThickness`
 */
export function curtainWallCopyPayload(
    cw: LegacyCurtainWallLike,
    dx: number,
    dz: number,
    newId: string,
): Record<string, unknown> {
    const [a, b] = cw.baseLine;

    // ─── The fields this hop CANNOT carry, said out loud ─────────────────────
    // The mirror in the other direction (`curtainWallCreatedMirror.ts`) names the
    // same ambiguity from the other side, and for the same reason: guessing a slot
    // swaps a silent DROP for a silent MIS-FILE, which is harder to find.
    if (cw.mullionMaterialId || cw.glazingMaterialId) {
        console.warn(
            `[CopyTool] §FIX-COPY-PAYLOAD-FIELD-NAMES: the source curtain wall carries ` +
            `${cw.mullionMaterialId ? `mullionMaterialId "${cw.mullionMaterialId}"` : ''}` +
            `${cw.mullionMaterialId && cw.glazingMaterialId ? ' and ' : ''}` +
            `${cw.glazingMaterialId ? `glazingMaterialId "${cw.glazingMaterialId}"` : ''}. ` +
            `CreateCurtainWallPayload has ONE generic \`materialId\` slot and the copy will not ` +
            `guess which of the two it means, so the copy is created WITHOUT either — its ` +
            `mullion/glazing materials come from the builder's defaults or from \`systemTypeId\`.`,
        );
    }
    if (cw.gridSystem) {
        console.warn(
            `[CopyTool] §FIX-COPY-PAYLOAD-FIELD-NAMES: the source curtain wall carries an ` +
            `addressable \`gridSystem\` (non-uniform U/V spacing, per-cell panel kinds). ` +
            `CreateCurtainWallPayload describes the grid only as uniform \`bayWidth\` × ` +
            `\`bayHeight\`, so the copy is created with the UNIFORM grid and any non-uniform ` +
            `spacing or per-cell override is NOT reproduced.`,
        );
    }

    return {
        id:       newId,
        levelId:  cw.levelId,
        // §FIX-COPY-PAYLOAD-FIELD-NAMES — `baseLine`, not `start`/`end`, and `y` is
        // carried from the source: dropping it makes `isFiniteVec3` refuse the wall.
        baseLine: [
            { x: a.x + dx, y: a.y, z: a.z + dz },
            { x: b.x + dx, y: b.y, z: b.z + dz },
        ],
        ...(cw.height         !== undefined ? { height:     cw.height }     : {}),
        ...(cw.baseOffset     !== undefined ? { baseOffset: cw.baseOffset } : {}),
        // §FIX-COPY-PAYLOAD-FIELD-NAMES — legacy `gridXSpacing`/`gridYSpacing` are
        // L0's `bayWidth`/`bayHeight`. `panelWidth`/`panelHeight` are the
        // pre-migration spellings the previous dispatch already fell back to.
        ...((cw.gridXSpacing ?? cw.panelWidth)  !== undefined
            ? { bayWidth:  cw.gridXSpacing ?? cw.panelWidth }  : {}),
        ...((cw.gridYSpacing ?? cw.panelHeight) !== undefined
            ? { bayHeight: cw.gridYSpacing ?? cw.panelHeight } : {}),
        // §FIX-COPY-PAYLOAD-FIELD-NAMES — `CurtainWallData` calls it `mullionSize`
        // (a cross-section width/depth); L0 calls it `mullionThickness`.
        ...(cw.mullionSize    !== undefined ? { mullionThickness: cw.mullionSize }    : {}),
        ...(cw.panelThickness !== undefined ? { panelThickness:   cw.panelThickness } : {}),
        ...(cw.systemTypeId   !== undefined ? { systemTypeId:     cw.systemTypeId }   : {}),
    };
}

// ─── Wall ────────────────────────────────────────────────────────────────────

/**
 * Receiver: `CreateWallPayload` (`plugins/wall/src/handlers/CreateWall.ts`).
 *
 * ⚠ §FIX-COPY-PAYLOAD-FIELD-NAMES (L-978 sweep) — two defects of the same family
 * lived here:
 *
 *  1. The baseLine endpoints were built as `{ x, z }`, DROPPING `y`. `Wall.parse`
 *     validates each endpoint as `Vec3`, which requires a finite `y`, so a copied
 *     wall threw a ZodError into the `?.catch()` and NO wall was created at all.
 *  2. `curve` and `layers` are both accepted by `CreateWallPayload` and both
 *     forwarded by `CommandEventBridge`'s `wall.create` case to the legacy mirror,
 *     and neither was sent — so a copied CURVED wall committed as a straight
 *     chord and a copied LAYERED wall lost its finish stack.
 */
export function wallCopyPayload(
    wall: LegacyWallLike,
    dx: number,
    dz: number,
    newId: string,
): Record<string, unknown> {
    const [a, b] = wall.baseLine;
    return {
        id:        newId,
        baseLine: [
            { x: a.x + dx, y: a.y ?? 0, z: a.z + dz },
            { x: b.x + dx, y: b.y ?? 0, z: b.z + dz },
        ],
        height:    wall.height,
        thickness: wall.thickness,
        levelId:   wall.levelId,
        ...(wall.baseOffset    !== undefined ? { baseOffset:    wall.baseOffset }    : {}),
        ...(wall.materialId    !== undefined ? { materialId:    wall.materialId }    : {}),
        ...(wall.materialColor !== undefined ? { materialColor: wall.materialColor } : {}),
        ...(wall.systemTypeId  !== undefined ? { systemTypeId:  wall.systemTypeId }  : {}),
        ...(wall.layers        !== undefined ? { layers:        wall.layers }        : {}),
        ...(wall.curve         !== undefined ? { curve:         wall.curve }         : {}),
    };
}

// ─── Slab ────────────────────────────────────────────────────────────────────

/**
 * Receiver: `CreateSlabPayload` (`plugins/slab/src/handlers/CreateSlab.ts`) AND
 * `CommandEventBridge`'s `slab.create` case, which reads `record.payload`
 * DIRECTLY — so `ifcGuid`, `position`, `width` and `depth` are legitimate here
 * even though `CreateSlabPayload` does not list them: they are the legacy
 * mirror's fields, and dropping them would blank the 3-D slab.
 *
 * ⚠ §FIX-COPY-PAYLOAD-FIELD-NAMES (L-978 sweep) — THREE defects lived here, and
 * the first two meant a copied slab was not merely impoverished but never
 * created at all:
 *
 *  1. The polygon was sent as `{ x: worldX, y: worldZ }` with no `z`.
 *     `CreateSlabHandler` resolves `polygon` → `boundary` with `z: p.z ?? 0`,
 *     then validates it through `signedAreaXZ`, which multiplies `x` by `z` —
 *     all-zero `z` is ZERO AREA, so `canExecute` refused EVERY copied slab with
 *     "boundary has zero area" and the rejection died in the dispatch's
 *     `?.catch()`. The sibling `SlabPlanToolHandler` already solved exactly this
 *     (§FIX-SLAB-ZERO-AREA, C11 §7.0) by supplying worldZ in BOTH `y` and `z`;
 *     the copy tool never got the same treatment. Reused here, not reinvented.
 *  2. The delta was added to the polygon AND to `position`. `SlabFragmentBuilder`
 *     sets `pivot = position + centroid(polygon)` and offsets each child by
 *     `-centroid`, so a vertex lands at `position + vertex` — adding the delta to
 *     both halves puts the copy at TWICE the distance the user dragged. The
 *     polygon carries the move; `position` is left exactly as the source had it.
 *  3. `baseOffset`, `materialId`, `materialColor` and `systemTypeId` are all
 *     accepted by `CreateSlabPayload` and none were sent, so a copied slab lost
 *     its finish and its slab TYPE.
 */
export function slabCopyPayload(
    slab: LegacySlabLike,
    dx: number,
    dz: number,
    newId: string,
    ifcGuid: string,
): Record<string, unknown> {
    // §FIX-SLAB-ZERO-AREA (C11 §7.0) — worldZ in BOTH `y` and `z`: the legacy
    // SlabStore/builder read the plan polygon as `{x, y=worldZ}`, while the L0
    // handler's boundary validation reads `x`/`z`. Supplying both satisfies each
    // consumer without either being told a different shape.
    const shift = (pt: Pt2) => ({ x: pt.x + dx, y: pt.y + dz, z: pt.y + dz });
    const newPoly = (slab.polygon ?? []).map(shift);
    const holes   = (slab.holes ?? []).map(h => h.map(shift));

    if (slab.layers && slab.layers.length > 0) {
        console.warn(
            `[CopyTool] §FIX-COPY-PAYLOAD-FIELD-NAMES: the source slab carries a ` +
            `${slab.layers.length}-layer stack. Neither CreateSlabPayload nor the ` +
            `slab.create event carries \`layers\`, so the copy is created from its ` +
            `\`systemTypeId\` and \`thickness\` only; re-apply the slab type if the ` +
            `copy must carry the same layer snapshot.`,
        );
    }

    return {
        id:        newId,
        ifcGuid,
        width:     slab.width,
        depth:     slab.depth,
        thickness: slab.thickness,
        // §FIX-COPY-PAYLOAD-FIELD-NAMES — NOT translated. See (2) in the header:
        // the polygon already carries the move, and `position` is added to it.
        position:  { ...slab.position },
        levelId:   slab.levelId,
        polygon:   newPoly,
        holes:     holes.length ? holes : undefined,
        ...(slab.baseOffset    !== undefined ? { baseOffset:    slab.baseOffset }    : {}),
        ...(slab.materialId    !== undefined ? { materialId:    slab.materialId }    : {}),
        ...(slab.materialColor !== undefined ? { materialColor: slab.materialColor } : {}),
        // `SlabData.systemTypeId` is `string | null` (null = "plain slab"); the
        // payload's is `string | undefined`, so null is normalised away rather
        // than forwarded as a value the schema would reject.
        ...(slab.systemTypeId ? { systemTypeId: slab.systemTypeId } : {}),
    };
}

// ─── Column ──────────────────────────────────────────────────────────────────

/**
 * Receiver: `CreateColumnPayload` (`plugins/column/src/handlers/CreateColumn.ts`).
 *
 * ⚠ `shape: col.profile` IS DELIBERATE AND IS NOT A DEFECT (C84 EI-3, L-978
 * scope note). Legacy `ColumnData.profile` is
 * `'rectangular' | 'circular' | 'UC' | 'UB'`; L0 `ColumnShape` does not contain
 * `'UC'` or `'UB'`, so `Column.parse` THROWS and the copy of a steel column
 * REFUSES LOUDLY. That is the correct behaviour of the two, and turning it into
 * a silent success — by mapping the section to a shape L0 does accept, or by
 * dropping the field — would be a regression dressed as a cleanup. Do not
 * "fix" it. `'rectangular'` and `'circular'` pass through unchanged, so the
 * ordinary concrete column copies normally.
 */
export function columnCopyPayload(
    col: LegacyColumnLike,
    dx: number,
    dz: number,
    newId: string,
): Record<string, unknown> {
    if (col.steelProfileName) {
        console.warn(
            `[CopyTool] §FIX-COPY-PAYLOAD-FIELD-NAMES: the source column carries ` +
            `steelProfileName "${col.steelProfileName}". CreateColumnPayload has no slot ` +
            `for it, so the copy cannot be a parametric steel section. (Its ` +
            `profile "${col.profile}" is also outside the L0 ColumnShape vocabulary, so ` +
            `the create below is expected to REFUSE rather than mint a wrong column.)`,
        );
    }
    return {
        id:         newId,
        origin:     { x: col.position.x + dx, y: col.position.y, z: col.position.z + dz },
        height:     col.height,
        rotation:   col.rotation,
        // §P3.3-CO / C84 EI-3 — see the header. Left EXACTLY as-is on purpose.
        shape:      col.profile,
        width:      col.width,
        depth:      col.depth,
        baseOffset: col.baseOffset,
        levelId:    col.levelId,
        materialId: col.materialId,
    };
}

// ─── Furniture ───────────────────────────────────────────────────────────────

/** Fields the copy USED to send that no receiver reads — named, not dropped. */
const FURNITURE_UNCARRIED_FIELDS = [
    'widthBranchTwo', 'lengthBranchTwo', 'widthMain', 'lengthSide',
    'seatDepthMain', 'seatDepthSide', 'hasHeadboard', 'lo3',
    'startPoint', 'cornerPoint', 'endPoint', 'wardrobeConfig', 'metadata',
] as const;

/**
 * Receiver: `CommandEventBridge`'s `furniture.create` case (which reads
 * `record.payload` directly and is what reaches the legacy `FurnitureStore` via
 * the `initTools.ts` §FT-FURNITURE bridge), plus `CreateFurniturePayload`
 * (`plugins/furniture/src/handlers/CreateFurniture.ts`) for the L0 record.
 *
 * ⚠ §FIX-COPY-PAYLOAD-FIELD-NAMES (L-978 sweep) — `rotation` was dispatched as
 * an EulerDTO OBJECT (`{ ...item.rotation }`), and BOTH receivers want a scalar
 * yaw: L0 `Furniture.rotation` is `z.number()`, and the §FT-FURNITURE bridge
 * writes `rotation: { x: 0, y: ev.rotation ?? 0, z: 0 }` — so an object arrived
 * NON-NULLISH, survived the `??`, and the legacy record ended up with an OBJECT
 * nested in its `y`. Every copied rotated item was mirrored with a rotation the
 * builder cannot read. The yaw is lifted out here, once.
 */
export function furnitureCopyPayload(
    item: LegacyFurnitureLike,
    dx: number,
    dz: number,
    newId: string,
): Record<string, unknown> {
    // §FIX-COPY-PAYLOAD-FIELD-NAMES — the SCALAR yaw both receivers expect.
    const rot = item.rotation;
    const yaw = typeof rot === 'number' ? rot : (rot?.y ?? 0);

    const uncarried = FURNITURE_UNCARRIED_FIELDS.filter(
        k => (item as Record<string, unknown>)[k] !== undefined,
    );
    if (uncarried.length > 0) {
        console.warn(
            `[CopyTool] §FIX-COPY-PAYLOAD-FIELD-NAMES: the source furniture carries ` +
            `${uncarried.join(', ')}, and neither CreateFurniturePayload nor the ` +
            `furniture.create event has a slot for any of them, so the copy is created ` +
            `WITHOUT them. An L-shaped sofa / corner run copied this way keeps its ` +
            `position and overall size but not its arm geometry.`,
        );
    }

    return {
        id:            newId,
        furnitureType: item.furnitureType,
        position:      { x: item.position.x + dx, y: item.position.y, z: item.position.z + dz },
        rotation:      yaw,
        levelId:       item.levelId,
        baseOffset:    item.baseOffset ?? 0,
        width:         item.width,
        length:        item.length,
        height:        item.height,
        material:      item.material,
        color:         item.color,
        kitchenConfig:         item.kitchenConfig,
        wardrobeCabinetConfig: item.wardrobeCabinetConfig,
        furnitureCategory:     item.furnitureCategory,
    };
}
