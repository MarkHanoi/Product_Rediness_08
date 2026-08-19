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

// ─── Destination overrides (§L-1032 duplicate-to-level) ──────────────────────
/**
 * The OPTIONAL trailing argument every builder below now accepts.
 *
 * ─── WHY AN OVERRIDE AND NOT A SECOND SET OF BUILDERS ────────────────────────
 * "Duplicate slab from Level 1 to Level 2" is this copy with `dx = dz = 0` and
 * one field replaced. Writing a second legacy-record → bus-payload mapping for
 * it would mint the second authority C84 **EI-9** forbids, on the exact question
 * L-978 proved nobody can answer twice and get the same answer: four wrong field
 * names on ONE of two curtain-wall dispatches minted every copy at the schema
 * default, silently, for months.
 *
 * `levelId` defaults to the SOURCE record's own `levelId`, so **every call site
 * that omits this argument produces a byte-identical payload** to the one it
 * produced before this parameter existed. The plan copy tool passes nothing.
 */
export interface CopyPayloadOverrides {
    /**
     * Destination storey. Omitted ⇒ the source record's own `levelId` — i.e. an
     * ordinary in-plane copy, unchanged.
     */
    readonly levelId?: string;
}

/**
 * Wall-only overrides. `elevationY` is **not** in `CopyPayloadOverrides`, and
 * that asymmetry is measured, not stylistic.
 *
 * A level change rewrites element GEOMETRY in exactly one family. Measured
 * 2026-08-19 across all five `Change<Family>Level` handlers:
 *
 *   • `plugins/wall/src/handlers/ChangeWallLevel.ts:70-74` — writes `levelId`
 *     **and rebases both `baseLine` endpoints' `y` to `cmd.newElevationY`**,
 *     because the `Wall` schema refines "baseLine endpoints must share the same
 *     y" and a wall's baseLine `y` IS its storey elevation.
 *   • `plugins/slab/src/handlers/ChangeSlabLevel.ts:102-106` — `levelId` only.
 *   • `plugins/column/src/handlers/ChangeColumnLevel.ts:112-116` — `levelId` only.
 *   • `plugins/beam/src/handlers/ChangeBeamLevel.ts:106-110` — `levelId` only.
 *   • `plugins/furniture/src/handlers/ChangeFurnitureLevel.ts:123-127` — `levelId` only.
 *   • `plugins/curtain-wall/src/handlers/ChangeCurtainWallLevel.ts:136-140` — `levelId` only.
 *
 * So a duplicated WALL that carried its source `baseLine.y` unchanged would
 * stand at the OLD storey's height wearing the NEW storey's `levelId` — visible,
 * wrong, and impossible to attribute. Every other family derives its world Y
 * from `level.elevation` at build time, which is why
 * `packages/command-bus/src/levelChangeVerbs.ts:78-87` carries `elevationField`
 * for `wall.changeLevel` alone and warns against adding one "for symmetry".
 *
 * Making this a wall-only TYPE means handing `elevationY` to a slab is a compile
 * error rather than a silently ignored key — the L-978 failure mode, inverted.
 */
export interface WallCopyOverrides extends CopyPayloadOverrides {
    /**
     * The DESTINATION level's elevation in metres. Omitted ⇒ the source
     * endpoints' `y` is carried unchanged (the in-plane copy).
     */
    readonly elevationY?: number;
}

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

/** Subset of `BeamData` (`packages/core-app-model/src/stores/BeamTypes.ts:1-46`). */
export interface LegacyBeamLike {
    levelId?: string;
    startPoint: Pt3;
    endPoint: Pt3;
    width?: number;
    depth?: number;
    material?: string;
    loadBearing?: boolean;
    fireRating?: string;
    sectionType?: 'rectangular' | 'UB' | 'UC';
    steelProfileName?: string;
    /** Support bindings — level-specific, see `beamCopyPayload`. */
    startSupportId?: string;
    endSupportId?: string;
    startSupportType?: string;
    endSupportType?: string;
    properties?: unknown;
    metadata?: unknown;
    parentId?: string;
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
    opts?: CopyPayloadOverrides,
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
        // §L-1032 — the destination storey, defaulting to the source's own.
        levelId:  opts?.levelId ?? cw.levelId,
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
    opts?: WallCopyOverrides,
): Record<string, unknown> {
    const [a, b] = wall.baseLine;
    // §L-1032 — a wall's baseLine `y` IS its storey elevation, and it is the ONLY
    // geometry any `Change<Family>Level` handler rewrites (see `WallCopyOverrides`
    // for the six-handler measurement). A duplicate to another storey MUST rebase
    // it or it stands at the source's height wearing the destination's `levelId`.
    // Both endpoints get the SAME y — `Wall`'s schema refine (2) requires it.
    const yA = opts?.elevationY ?? a.y ?? 0;
    const yB = opts?.elevationY ?? b.y ?? 0;
    return {
        id:        newId,
        baseLine: [
            { x: a.x + dx, y: yA, z: a.z + dz },
            { x: b.x + dx, y: yB, z: b.z + dz },
        ],
        height:    wall.height,
        thickness: wall.thickness,
        levelId:   opts?.levelId ?? wall.levelId,
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
    opts?: CopyPayloadOverrides,
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
        // §L-1032 — `ChangeSlabLevel.ts:102-106` writes `levelId` and NOTHING
        // else, so a slab's storey is entirely `levelId`; `position` needs no
        // rebase and must not get one.
        levelId:   opts?.levelId ?? slab.levelId,
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
    opts?: CopyPayloadOverrides,
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
        // §L-1032 — `ChangeColumnLevel.ts:112-116` writes `levelId` only.
        levelId:    opts?.levelId ?? col.levelId,
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
    opts?: CopyPayloadOverrides,
): Record<string, unknown> {
    // §FIX-COPY-PAYLOAD-FIELD-NAMES — the SCALAR yaw both receivers expect.
    const rot = item.rotation;
    const yaw = typeof rot === 'number' ? rot : (rot?.y ?? 0);

    // §FIX-COPY-PAYLOAD-FIELD-NAMES / L-994b — spread, do not cast. `item as
    // Record<string, unknown>` is a TS2352 under the ROOT tsconfig (the package
    // config never saw it): `LegacyFurnitureLike`'s optional union-typed
    // `rotation` means the two types do not sufficiently overlap. The obvious
    // repair — `as unknown as Record<…>` — would silence the compiler by
    // erasing the check, which is the exact `any`-seam shape L-980 was raised
    // to remove from this codebase. A spread is checked, allocates one small
    // object per copied item, and needs no cast at all.
    const itemFields: Record<string, unknown> = { ...item };
    const uncarried = FURNITURE_UNCARRIED_FIELDS.filter(
        k => itemFields[k] !== undefined,
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
        // §L-1032 — `ChangeFurnitureLevel.ts:123-127` writes `levelId` only.
        levelId:       opts?.levelId ?? item.levelId,
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

// ─── Beam ────────────────────────────────────────────────────────────────────

/**
 * Fields the beam hop CANNOT carry, named rather than dropped (C84 **EI-2**).
 * The four support bindings are the ones that matter: they name the COLUMN or
 * WALL this beam framed into. A copy 6 m away — and a DUPLICATE on another
 * storey even more so — frames into something else or into nothing, so carrying
 * them forward would assert a structural connection that does not exist.
 */
const BEAM_UNCARRIED_FIELDS = [
    'startSupportId', 'endSupportId', 'startSupportType', 'endSupportType',
    'properties', 'metadata', 'parentId',
] as const;

/**
 * Receiver: `CreateBeamPayload` (`plugins/beam/src/handlers/CreateBeam.ts:16-46`)
 * AND `CommandEventBridge`'s `beam.create` case (`:663`), which is the leg that
 * reaches the legacy `BeamStore` → `BeamFragmentBuilder` mesh.
 *
 * ─── WHY THIS MOVED OUT OF THE HANDLER ───────────────────────────────────────
 * §L-1032. This mapping was an object literal inside
 * `CopyPlanToolHandler._copyBeam`, i.e. behind a two-click canvas gesture and a
 * `window.beamStore` read — unreachable by any suite, which is the precise
 * condition that let L-978's four wrong curtain-wall field names live. The
 * duplicate-to-level route needs the same mapping, and re-typing it at a second
 * call site is the C84 EI-9 breach this module exists to prevent. Extracted
 * VERBATIM: with `newId` omitted the returned object is byte-identical to the
 * literal it replaces.
 *
 * ⚠ FOUND, NOT FIXED — the copy path mints NO beam id. `CreateBeamPayload`
 * accepts `id`, and `CommandEventBridge:685` looks the COMMITTED beam up by
 * `p.id` to relay the handler-normalised section (§FIX-BEAM-CEB-STEEL, L-974);
 * with no id that lookup can never hit for a copied beam and the case falls back
 * to the raw request. Changing the plan copy tool's behaviour is outside L-1032,
 * so `newId` is OPTIONAL here and the copy tool still passes none. The DUPLICATE
 * route passes one — it must, or the duplicate could not be told from its source.
 */
export function beamCopyPayload(
    beam: LegacyBeamLike,
    dx: number,
    dz: number,
    newId?: string,
    opts?: CopyPayloadOverrides,
): Record<string, unknown> {
    const sp = beam.startPoint;
    const ep = beam.endPoint;

    const record: Record<string, unknown> = { ...beam };
    const uncarried = BEAM_UNCARRIED_FIELDS.filter(k => record[k] !== undefined);
    if (uncarried.length > 0) {
        console.warn(
            `[CopyTool] §L-1032/EI-2: the source beam carries ${uncarried.join(', ')}, and ` +
            `neither CreateBeamPayload nor the beam.create event has a slot for any of them, ` +
            `so the copy is created WITHOUT them. The support bindings in particular are ` +
            `DELIBERATELY not carried: a beam at a different place — or on a different storey — ` +
            `does not frame into the same column or wall, and asserting that it does would be ` +
            `a false structural connection rather than a faithful copy.`,
        );
    }

    return {
        // §L-1032 — omitted by the plan copy tool (byte-identical to the literal
        // this replaced); supplied by the duplicate route.
        ...(newId !== undefined ? { id: newId } : {}),
        startPoint:    { x: sp.x + dx, y: sp.y, z: sp.z + dz },
        endPoint:      { x: ep.x + dx, y: ep.y, z: ep.z + dz },
        width:         beam.width,
        depth:         beam.depth,
        // §L-1032 — `ChangeBeamLevel.ts:106-110` writes `levelId` only; a beam's
        // world Y comes from `level.elevation` at build time, so the endpoints'
        // `y` is NOT rebased. Wall is the sole family that rebases — see
        // `WallCopyOverrides`.
        levelId:       opts?.levelId ?? beam.levelId,
        material:      beam.material,
        loadBearing:   beam.loadBearing,
        fireRating:    beam.fireRating,
        sectionType:   beam.sectionType,
        steelProfileName: beam.steelProfileName,
    };
}
