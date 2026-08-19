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

// ═══════════════════════════════════════════════════════════════════════════
// §L-1032 D3 — THE SIX DEFERRED FAMILIES
//
// ─── WHY BUILDING THESE IS NOT THE EI-9 BREACH THE PRIOR LANE FEARED ────────
// `duplicateToLevel.ts` deferred roof / ceiling / floor / handrail / lighting /
// plumbing on the ground that a builder here would mint *"a second authority on
// a mapping whose first does not exist"*. That objection dissolves once the
// DIRECTION of the two maps is measured:
//
//   • `roofCreatedMirror.ts`, `ceilingCreatedMirror.ts`, `beamCreatedMirror.ts`,
//     `curtainWallCreatedMirror.ts` (and the still-inline §FT-HANDRAIL /
//     §FT-LIGHTING / §P3.2-FL closures in `initTools.ts`) map
//     **bus event → legacy record**.
//   • This module maps **legacy record → bus payload** — the INVERSE.
//
// A second AUTHORITY is two modules answering the SAME question. These answer
// opposite ones, and a family needs both to round-trip. C84 EI-9 is not
// engaged; what IS engaged is the requirement that the two maps AGREE, which is
// why every builder below names the forward hop it is the inverse of, and why
// `CopiedElementKeepsPlaceAndProperties.test.ts` runs each one out and back.
//
// ⚠ THE INVARIANT IS UNCHANGED (see this file's header): every key emitted must
// be a key a REAL receiver declares. Each builder names its receiver(s); each
// authored field with NO receiving slot is `console.warn`ed at the drop site,
// never dropped in silence.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Roof ────────────────────────────────────────────────────────────────────

/** Subset of `RoofData` (`packages/core-app-model/src/stores/RoofTypes.ts:88-137`). */
export interface LegacyRoofLike {
    levelId?: string;
    /** `polygon` is CENTROID-RELATIVE `[lx, lz]`; `centroid` is world `[cx, cz]`. */
    footprint: {
        polygon: ReadonlyArray<readonly [number, number]>;
        centroid: readonly [number, number];
    };
    roofType?: string;
    /** rise/run. The L0 schema's `pitch` is RADIANS — see `roofCopyPayload`. */
    slope?: number;
    overhang?: number;
    baseOffset?: number;
    thickness?: number;
    ridgeOffset?: number;
    fascia?: number;
    autoBaseOffset?: boolean;
    materialId?: string;
    materialColor?: string;
    layers?: unknown[];
    slopeArrows?: unknown[];
    segments?: unknown[];
    /** §ROOF-FOLLOWS-WALL (L-924) — the SOURCE storey's walls. Not carried. */
    boundingWallIds?: readonly string[];
}

/**
 * The seating floor `roofCreatedMirror.resolveMirroredRoofBaseOffset` applies,
 * restated as a NAME so this file and that one cannot drift by a literal edited
 * in one of them. Same reason `ROOF_AUTO_SEATING_FLOOR_M` exists there.
 */
export const ROOF_COPY_SEATING_FLOOR_M = 2.7;

/**
 * Legacy `RoofType` values the L0 `RoofShape` enum has no member for.
 *
 * `packages/schemas/src/elements/Roof.ts:7` — `['flat','gable','hip','mono','mansard']`.
 * `RoofTypes.ts:3-12` — `['flat','shed','gable','hip','dutch','gambrel','mansard','barrel','by_region']`.
 * `shed` IS expressible (it is L0's `mono`; see `roofCopyPayload`). These four
 * are not, and the copy REFUSES LOUDLY rather than mapping them to a shape the
 * author did not draw — the `columnCopyPayload` `'UC'`/`'UB'` precedent (C84
 * EI-3), applied for the same reason: a loud refusal beats a silent wrong roof.
 */
export const ROOF_TYPES_L0_CANNOT_EXPRESS = ['dutch', 'gambrel', 'barrel', 'by_region'] as const;

/** Fields a roof copy cannot carry, named rather than dropped (C84 **EI-2**). */
const ROOF_UNCARRIED_FIELDS = [
    'layers', 'slopeArrows', 'segments', 'ridgeOffset', 'fascia', 'boundingWallIds',
] as const;

/**
 * Receiver: `CreateRoofPayload` (`plugins/roof/src/handlers/CreateRoof.ts:16-27`)
 * AND `CommandEventBridge`'s `roof.create` case (`:1056-1088`), which is the leg
 * that reaches `roofRecordFromCreatedEvent` → the legacy `RoofStore` →
 * `RoofFragmentBuilder` mesh.
 *
 * ─── THE INVERSE OF `roofCreatedMirror.ts` ──────────────────────────────────
 * Every translation below is the exact reverse of a line in
 * `roofRecordFromCreatedEvent` (`apps/editor/src/engine/roofCreatedMirror.ts`),
 * cited so the pair cannot drift:
 *
 *   forward `:112-118`  world `boundary[]` → `centroid` + centroid-relative
 *                       `polygon[]`.   inverse: `centroid + polygon` → world.
 *   forward `:129`      `shape === 'mono' ? 'shed' : shape` → `roofType`.
 *                       inverse: `roofType === 'shed' ? 'mono' : roofType`.
 *   forward `:133`      `slope = tan(pitch)`.  inverse: `pitch = atan(slope)`.
 *
 * ⚠ `y` IS NOT AN AUTHORED VALUE HERE, and that is measured, not assumed. The
 * forward hop reads only `v.x` and `v.z` off each boundary point and stores a
 * 2-tuple, so a roof's height is `baseOffset`, never its boundary `y`. `Vec3`
 * still REQUIRES a finite `y` (`isFiniteVec3`), so `0` is emitted — the one
 * value that adds no information.
 *
 * ⚠ `baseOffset` HAS NO PAYLOAD SLOT, AND THAT IS RIGHT FOR THIS ROUTE.
 * `resolveMirroredRoofBaseOffset` (`roofCreatedMirror.ts:76-82`) MEASURES the
 * seating from the tallest wall on the level the roof lands on. A duplicate onto
 * Level 2 is therefore re-seated on LEVEL 2's walls, which is what a duplicated
 * roof should do — but it means an author who hand-set `baseOffset` loses that
 * value, so it is warned about rather than assumed benign.
 */
export function roofCopyPayload(
    roof: LegacyRoofLike,
    dx: number,
    dz: number,
    newId: string,
    opts?: CopyPayloadOverrides,
): Record<string, unknown> {
    const [cx, cz] = roof.footprint.centroid;

    const record: Record<string, unknown> = { ...roof };
    const uncarried = ROOF_UNCARRIED_FIELDS.filter((k) => record[k] !== undefined);
    if (uncarried.length > 0) {
        console.warn(
            `[CopyTool] §L-1032/EI-2: the source roof carries ${uncarried.join(', ')}, and neither ` +
            `CreateRoofPayload nor the roof.create event has a slot for any of them, so the copy is ` +
            `created WITHOUT them. \`boundingWallIds\` in particular is DELIBERATELY not carried: it ` +
            `names the walls this roof was REGION-traced from, and a roof somewhere else — or on ` +
            `another storey — is not bounded by those walls, so forwarding it would assert a ` +
            `dependency that does not exist (§ROOF-FOLLOWS-WALL, L-924).`,
        );
    }
    if (roof.baseOffset !== undefined) {
        console.warn(
            `[CopyTool] §L-1032/EI-2: the source roof is seated at baseOffset ${roof.baseOffset} m. ` +
            `CreateRoofPayload has NO baseOffset slot and the roof.created mirror MEASURES the ` +
            `seating from the tallest wall on the DESTINATION level instead ` +
            `(roofCreatedMirror.ts:76-82, floor ${ROOF_COPY_SEATING_FLOOR_M} m), so the copy is ` +
            `re-seated there rather than carrying this value.`,
        );
    }
    if (
        roof.roofType !== undefined &&
        (ROOF_TYPES_L0_CANNOT_EXPRESS as readonly string[]).includes(roof.roofType)
    ) {
        console.warn(
            `[CopyTool] §L-1032/EI-3: the source roof is a "${roof.roofType}", which the L0 RoofShape ` +
            `enum (flat|gable|hip|mono|mansard) has no member for. The value is forwarded UNCHANGED ` +
            `so \`Roof.parse\` REFUSES the copy loudly, exactly as columnCopyPayload does for a steel ` +
            `'UC'/'UB' profile. Mapping it to a shape the author did not draw would be a silent wrong ` +
            `roof, which is the worse of the two outcomes.`,
        );
    }

    return {
        id:      newId,
        levelId: opts?.levelId ?? roof.levelId,
        // Centroid-relative → world, plus the copy delta. `y: 0` because the
        // forward hop reads only x/z (see the header) and `Vec3` requires a
        // finite `y`.
        boundary: roof.footprint.polygon.map(([lx, lz]) => ({
            x: cx + lx + dx,
            y: 0,
            z: cz + lz + dz,
        })),
        // §L-1032 — inverse of roofCreatedMirror.ts:129. `mono` and `shed` are
        // the SAME roof spelled differently in the two vocabularies; L-699 is
        // what the missing translation cost in the forward direction.
        ...(roof.roofType !== undefined
            ? { shape: roof.roofType === 'shed' ? 'mono' : roof.roofType }
            : {}),
        // §L-1032 — inverse of roofCreatedMirror.ts:133 (`slope = tan(pitch)`).
        // A zero / absent slope is a FLAT roof and must not become `atan(0)`
        // dressed as an authored pitch; it is omitted so the handler's own
        // `pitch ?? typeDefaults ?? 0` decides.
        ...(typeof roof.slope === 'number' && roof.slope > 0
            ? { pitch: Math.atan(roof.slope) }
            : {}),
        ...(roof.thickness     !== undefined ? { thickness:     roof.thickness }     : {}),
        ...(roof.overhang      !== undefined ? { overhang:      roof.overhang }      : {}),
        ...(roof.materialId    !== undefined ? { materialId:    roof.materialId }    : {}),
        ...(roof.materialColor !== undefined ? { materialColor: roof.materialColor } : {}),
    };
}

// ─── Ceiling ─────────────────────────────────────────────────────────────────

/** Subset of `CeilingData` (`packages/core-app-model/src/stores/CeilingTypes.ts:175-211`). */
export interface LegacyCeilingLike {
    levelId?: string;
    boundary: {
        polygon: ReadonlyArray<{ x: number; z: number }>;
        height?: number;
        thickness?: number;
        baseOffset?: number;
    };
    finishSpec?: {
        soffitMaterialId?: string;
        soffitColor?: string;
        soffitPattern?: string;
        exposedStructure?: boolean;
        materialName?: string;
    };
    systemTypeId?: string;
    layers?: unknown[];
    holeElements?: unknown[];
    slope?: unknown;
    hostSlabId?: string;
    hostRoomId?: string;
    label?: string;
}

/** Fields a ceiling copy cannot carry, named rather than dropped (C84 **EI-2**). */
const CEILING_UNCARRIED_FIELDS = [
    'systemTypeId', 'layers', 'holeElements', 'slope', 'hostSlabId', 'hostRoomId',
] as const;

/**
 * Receiver: `CreateCeilingPayload`
 * (`plugins/ceiling/src/handlers/CreateCeiling.ts:19-27`) AND
 * `CommandEventBridge`'s `ceiling.create` case (`:780-810`), which is the leg
 * that reaches `ceilingRecordFromCreatedEvent` → the legacy `CeilingStore`.
 *
 * ─── THE INVERSE OF `ceilingCreatedMirror.ts` ───────────────────────────────
 *   forward `:138`      `Vec3[] boundary` → `{x,z}[] polygon` (y discarded).
 *                       inverse: `{x,z}` → `{x, y: 0, z}` — `Vec3` requires a
 *                       finite `y` and the forward hop never reads one, so 0 is
 *                       the value that adds no information.
 *   forward `:149-150`  `ceilingHeight`/`thickness` → `boundary.height`/`.thickness`.
 *   forward `:156`      `materialColor` → `finishSpec.soffitColor`.
 *   forward `:161`      `materialId`    → `finishSpec.soffitMaterialId`.
 *
 * ⚠ `boundary.baseOffset` has no L0 field at all — `CEILING_MIRROR_DEFAULTS`
 * pins it to 0 on the forward hop (`ceilingCreatedMirror.ts:78`), so a ceiling
 * hung at a non-zero offset cannot state that through this route. Warned below.
 *
 * ⚠ `label` / `ceilingNumber` are deliberately NOT carried: the forward hop
 * re-derives the label from the DESTINATION store's ordinal
 * (`ceilingLabelForOrdinal`), so forwarding "Ceiling-03" would put two elements
 * with one name in the project browser, the schedule and the IFC export — the
 * exact defect §P3.2-CL's `Ceiling-NN` fix removed.
 */
export function ceilingCopyPayload(
    ceiling: LegacyCeilingLike,
    dx: number,
    dz: number,
    newId: string,
    opts?: CopyPayloadOverrides,
): Record<string, unknown> {
    const record: Record<string, unknown> = { ...ceiling };
    const uncarried = CEILING_UNCARRIED_FIELDS.filter((k) => record[k] !== undefined);
    if (uncarried.length > 0) {
        console.warn(
            `[CopyTool] §L-1032/EI-2: the source ceiling carries ${uncarried.join(', ')}, and neither ` +
            `CreateCeilingPayload nor the ceiling.create event has a slot for any of them, so the copy ` +
            `is created WITHOUT them — a ceiling with a system type and a layer stack copies as a bare ` +
            `thickness. \`hostSlabId\`/\`hostRoomId\` are additionally NOT carried ON PURPOSE: both ` +
            `name an element on the SOURCE storey, and a binding that points across storeys is worse ` +
            `than no binding at all.`,
        );
    }
    if (ceiling.boundary.baseOffset !== undefined && ceiling.boundary.baseOffset !== 0) {
        console.warn(
            `[CopyTool] §L-1032/EI-2: the source ceiling is hung at baseOffset ` +
            `${ceiling.boundary.baseOffset} m. The L0 \`Ceiling\` schema has NO such field and the ` +
            `ceiling.created mirror pins it to 0 (ceilingCreatedMirror.ts:151), so the copy is ` +
            `created at that offset, not this one.`,
        );
    }
    if (
        ceiling.finishSpec?.soffitPattern !== undefined ||
        ceiling.finishSpec?.exposedStructure === true
    ) {
        console.warn(
            `[CopyTool] §L-1032/EI-2: the source ceiling's finish states soffitPattern / ` +
            `exposedStructure. Neither has an L0 field, and the forward mirror writes the same two ` +
            `constants the legacy CreateCeilingCommand writes (CEILING_MIRROR_DEFAULTS), so the copy ` +
            `takes those rather than the source's.`,
        );
    }

    return {
        id:      newId,
        levelId: opts?.levelId ?? ceiling.levelId,
        boundary: ceiling.boundary.polygon.map((p) => ({ x: p.x + dx, y: 0, z: p.z + dz })),
        // §L-1032 — inverse of ceilingCreatedMirror.ts:149-150.
        ...(ceiling.boundary.height    !== undefined ? { ceilingHeight: ceiling.boundary.height }    : {}),
        ...(ceiling.boundary.thickness !== undefined ? { thickness:     ceiling.boundary.thickness } : {}),
        // §L-1032 — inverse of ceilingCreatedMirror.ts:156/161. The legacy finish
        // vocabulary is `soffit*`; the L0 vocabulary is `material*`.
        ...(ceiling.finishSpec?.soffitMaterialId !== undefined
            ? { materialId: ceiling.finishSpec.soffitMaterialId }
            : {}),
        ...(ceiling.finishSpec?.soffitColor !== undefined
            ? { materialColor: ceiling.finishSpec.soffitColor }
            : {}),
    };
}

// ─── Floor ───────────────────────────────────────────────────────────────────

/**
 * Floor-only overrides. `hostSlabId` / `hostRoomId` are NOT on
 * `CopyPayloadOverrides`, and that asymmetry is the whole floor decision.
 *
 * ⛔ **A COPIED FLOOR FINISH MUST NEVER CARRY THE SOURCE'S `hostSlabId`.**
 * `FloorData.hostSlabId` binds the finish's FFL to a specific structural slab:
 * `FloorSlabBindingHandler._onSlabUpdated`
 * (`packages/geometry-slab/src/floor/FloorSlabBindingHandler.ts:64-89`) reacts to
 * `bim-slab-updated`, finds every floor with that `hostSlabId`, and REWRITES
 * `boundary.baseOffset` from that slab's top face. A duplicate on Level 2 still
 * carrying Level 1's slab id would therefore be dragged vertically every time
 * the Level 1 slab moved — a cross-storey action at a distance with no visible
 * cause. And the binding IS carried verbatim if sent: `CreateFloorPayload.hostSlabId`
 * (`CreateFloor.ts:58`) reaches `FloorData.hostSlabId`, and the §P3.2-FL mirror
 * (`initTools.ts:1944`) writes it into the legacy store unexamined.
 *
 * `_onSlabRemoved` (`:91-105`) is the only re-seating machinery that exists, and
 * it only UNBINDS. There is no "find the host on the destination storey", so the
 * honest answer is the one the L-1032 brief allows: **the copy REPORTS that it
 * did not rebind**, and a caller that HAS resolved a destination host may state
 * it here. `hostRoomId` is the same shape of binding (it also seeds
 * `coveredRoomIds`, `CreateFloor.ts:136`) and gets the same treatment.
 */
export interface FloorCopyOverrides extends CopyPayloadOverrides {
    /** The DESTINATION storey's structural slab, if the caller resolved one. */
    readonly hostSlabId?: string;
    /** The DESTINATION storey's room, if the caller resolved one. */
    readonly hostRoomId?: string;
}

/** Subset of `FloorData` (`packages/core-app-model/src/stores/FloorTypes.ts:275-335`). */
export interface LegacyFloorLike {
    levelId?: string;
    boundary: {
        polygon: ReadonlyArray<{ x: number; z: number }>;
        baseOffset?: number;
        thickness?: number;
    };
    systemTypeId?: string;
    layers?: unknown[];
    /** Whole-element library material (`FloorTypes.ts:305`). No payload slot. */
    materialId?: string;
    finishSpec?: Record<string, unknown>;
    serviceHoles?: unknown[];
    slope?: unknown;
    underfloorHeating?: unknown;
    hostSlabId?: string;
    hostRoomId?: string;
    label?: string;
    colour?: string;
}

/** Fields a floor copy cannot carry, named rather than dropped (C84 **EI-2**). */
const FLOOR_UNCARRIED_FIELDS = [
    'materialId', 'slope', 'underfloorHeating', 'colour',
] as const;

/**
 * Receiver: `CreateFloorPayload` (`plugins/floor/src/handlers/CreateFloor.ts:34-61`)
 * AND `CommandEventBridge`'s `floor.create` case (`:1152-1190`), which is the leg
 * that reaches the §P3.2-FL mirror (`initTools.ts:1897-1975`) → the legacy
 * `FloorStore` → `FloorFragmentBuilder` mesh.
 *
 * ⚠ THE ID KEY IS `floorId`, NOT `id`. `CreateFloorHandler` reads
 * `cmd.floorId ?? createId('floor')` (`:94`) and the bridge case forwards
 * `floorId`; an `id` key would be accepted by nobody and the floor would be
 * minted under an id the caller never saw — the L-978 shape, applied to identity.
 *
 * ⚠ `ifcGuid` is REQUIRED of the CALLER, not invented here: the mirror writes
 * `ifcData.guid = ev.ifcGuid ?? crypto.randomUUID()` (`initTools.ts:1953`), so
 * two floors sharing one guid is an IFC identity collision, exactly as for slabs.
 *
 * ⚠ `label` is deliberately NOT carried — the mirror re-derives `Floor-NN` from
 * the DESTINATION store's ordinal (`initTools.ts:1906`), and forwarding the
 * source's label would put two elements with one name in the project browser and
 * the schedule.
 *
 * ⛔ `hostSlabId` / `hostRoomId`: see `FloorCopyOverrides`. Never carried from
 * the source; stated by the caller or reported as unbound.
 */
export function floorCopyPayload(
    floor: LegacyFloorLike,
    dx: number,
    dz: number,
    newFloorId: string,
    ifcGuid: string,
    opts?: FloorCopyOverrides,
): Record<string, unknown> {
    const record: Record<string, unknown> = { ...floor };
    const uncarried = FLOOR_UNCARRIED_FIELDS.filter((k) => record[k] !== undefined);
    if (uncarried.length > 0) {
        console.warn(
            `[CopyTool] §L-1032/EI-2: the source floor carries ${uncarried.join(', ')}, and neither ` +
            `CreateFloorPayload nor the floor.create event has a slot for any of them, so the copy is ` +
            `created WITHOUT them. \`materialId\` is the notable one: FloorData declares it ` +
            `(FloorTypes.ts:305) and \`resolveFloorColor\` reads it, but the create payload carries ` +
            `only per-LAYER material ids, so a floor given a library material copies without it.`,
        );
    }
    // ⛔ The host binding. A stale cross-storey host is the defect this names.
    if (floor.hostSlabId !== undefined && opts?.hostSlabId === undefined) {
        console.warn(
            `[CopyTool] §L-1032: the source floor is BOUND to slab "${floor.hostSlabId}" — ` +
            `FloorSlabBindingHandler rewrites floor.boundary.baseOffset from that slab's top face ` +
            `whenever it moves (FloorSlabBindingHandler.ts:64-89). The copy is created UNBOUND: ` +
            `carrying the id would leave a floor on one storey following a slab on another, and no ` +
            `machinery re-seats a binding onto the destination storey. The copy's baseOffset is ` +
            `frozen at the source's ${floor.boundary.baseOffset ?? 0} m until a host is set.`,
        );
    }
    if (floor.hostRoomId !== undefined && opts?.hostRoomId === undefined) {
        console.warn(
            `[CopyTool] §L-1032: the source floor is linked to room "${floor.hostRoomId}", a room on ` +
            `the SOURCE storey (it also seeds \`coveredRoomIds\`). The copy is created UNLINKED ` +
            `rather than pointing across storeys.`,
        );
    }

    return {
        // NOT `id` — see the header.
        floorId: newFloorId,
        ifcGuid,
        levelId: opts?.levelId ?? floor.levelId,
        // `FloorVertex` is `{x, z}` (FloorTypes.ts:56) and the mirror assigns the
        // array to `boundary.polygon` verbatim (initTools.ts:1919), so this is the
        // shape BOTH receivers read. Unlike the slab there is no `signedAreaXZ`
        // validation demanding a `z`-bearing Vec3, so no §FIX-SLAB-ZERO-AREA
        // double-spelling is needed or wanted here.
        polygon: floor.boundary.polygon.map((p) => ({ x: p.x + dx, z: p.z + dz })),
        // Both stated EXPLICITLY. `resolveFinishSeating` (CreateFloor.ts:99-105)
        // honours an explicit thickness/baseOffset verbatim and only auto-seats
        // when they are absent — so omitting them would silently re-seat the copy
        // as a bare 15 mm finish on the slab top, which is a different floor.
        ...(floor.boundary.baseOffset !== undefined ? { baseOffset: floor.boundary.baseOffset } : {}),
        ...(floor.boundary.thickness  !== undefined ? { thickness:  floor.boundary.thickness }  : {}),
        ...(floor.systemTypeId !== undefined ? { systemTypeId: floor.systemTypeId } : {}),
        ...(floor.layers       !== undefined ? { layers:       floor.layers }       : {}),
        ...(floor.finishSpec   !== undefined ? { finishSpec:   floor.finishSpec }   : {}),
        ...(floor.serviceHoles !== undefined ? { serviceHoles: floor.serviceHoles } : {}),
        // ⛔ DESTINATION bindings only — never the source's.
        ...(opts?.hostSlabId !== undefined ? { hostSlabId: opts.hostSlabId } : {}),
        ...(opts?.hostRoomId !== undefined ? { hostRoomId: opts.hostRoomId } : {}),
    };
}

// ─── Handrail ────────────────────────────────────────────────────────────────

/**
 * Subset of `HandrailData`
 * (`packages/core-app-model/src/stores/HandrailTypes.ts:21-74`).
 *
 * ─── HR1 COORDINATION, MEASURED 2026-08-19 ──────────────────────────────────
 * The L-1032 brief flagged `packages/geometry-handrail` as mid-extraction under
 * HR1. **That package does not exist** (`ls packages/geometry-handrail` → no
 * such directory); the live handrail record is `core-app-model`'s, and both
 * `HandrailTypes.ts` and `HandrailStore.ts` are CLEAN in the working tree — the
 * only handrail files HR1 has open are `HandrailTypeStore.ts` (the CATALOGUE, a
 * different subject) and `geometry-stair/HandrailFragmentBuilder.ts`. So this
 * shape was read at the moment it was written against, not guessed.
 */
export interface LegacyHandrailLike {
    levelId?: string;
    baseLine: readonly [Pt3, Pt3];
    height?: number;
    thickness?: number;
    baseOffset?: number;
    materialId?: string;
    materialColor?: string;
    railProfile?: string;
    railDiameter?: number;
    fillType?: string;
    postSpacing?: number;
    balusterSpacing?: number;
    balusterShape?: string;
    balusterWidth?: number;
    infillMaxGap?: number;
    suppressStartPost?: boolean;
    railStructure?: unknown[];
    parameters?: unknown;
    /** A host on the SOURCE storey. Not carried — see `handrailCopyPayload`. */
    hostId?: string;
}

/** Fields a handrail copy cannot carry, named rather than dropped (C84 **EI-2**). */
const HANDRAIL_UNCARRIED_FIELDS = [
    'fillType', 'postSpacing', 'balusterSpacing', 'balusterShape', 'balusterWidth',
    'infillMaxGap', 'suppressStartPost', 'railStructure', 'materialColor',
    'baseOffset', 'parameters',
] as const;

/**
 * Receiver: `CreateHandrailPayload`
 * (`plugins/handrail/src/handlers/CreateHandrail.ts:16-25`) AND
 * `CommandEventBridge`'s `handrail.create` case (`:866-897`), which is the leg
 * that reaches the §FT-HANDRAIL mirror (`initTools.ts:1991-2096`) → the legacy
 * `HandrailStore` → `HandrailFragmentBuilder`.
 *
 * ─── THE INVERSE OF THE §FT-HANDRAIL BRIDGE ─────────────────────────────────
 *   forward `initTools.ts:2064-2067`  `path[0..1]` → `baseLine[2]`.
 *                                     inverse: `baseLine` → a 2-point `path`.
 *   forward `:2119`  `shape` → `railProfile`: `round`→`round`,
 *                    `square`/`flat`→`rectangular`. **LOSSY.**
 *   forward `:2071-2072`  `diameter` → BOTH `thickness` and `railDiameter`,
 *                    because the builder's round branch reads `railDiameter` and
 *                    its rectangular branch reads `thickness`.
 *                    inverse: `railDiameter ?? thickness`.
 *
 * ⚠ `shape` — THE LOSSY HOP, STATED RATHER THAN GUESSED IN SILENCE. The legacy
 * vocabulary has TWO profiles and L0 has three (`round|square|flat`,
 * `packages/schemas/src/elements/Handrail.ts:7`), so `rectangular` cannot be
 * resolved back to which of `square`/`flat` the author chose. `'square'` is
 * emitted **and warned about**: the alternative — omitting `shape` — is not
 * neutral, because `CreateHandrailHandler` defaults it to `'round'`
 * (`CreateHandrail.ts:53`), which would turn a rectangular rail into a round one
 * with nothing said. A declared approximation beats a silent substitution.
 *
 * ⚠ `hostId` is NOT carried. It names the stair / slab edge / ramp this rail
 * runs along ON THE SOURCE STOREY — the same rule as the beam's support
 * bindings and the floor's `hostSlabId`.
 *
 * ⚠ THE BIGGEST DROP IS `fillType`. The forward mirror HARDCODES
 * `fillType: 'baluster'` (`initTools.ts:2083`), so a glass-infill guard copies
 * as a balustrade. That is a real, visible change of the element, and it is the
 * first item in the warning below rather than a footnote.
 */
export function handrailCopyPayload(
    rail: LegacyHandrailLike,
    dx: number,
    dz: number,
    newId: string,
    opts?: CopyPayloadOverrides,
): Record<string, unknown> {
    const [a, b] = rail.baseLine;

    const record: Record<string, unknown> = { ...rail };
    const uncarried = HANDRAIL_UNCARRIED_FIELDS.filter((k) => record[k] !== undefined);
    if (uncarried.length > 0) {
        console.warn(
            `[CopyTool] §L-1032/EI-2: the source handrail carries ${uncarried.join(', ')}, and ` +
            `neither CreateHandrailPayload nor the handrail.create event has a slot for any of them, ` +
            `so the copy is created WITHOUT them. \`fillType\` is the visible one: the ` +
            `handrail.created mirror hardcodes 'baluster' (initTools.ts:2083), so a GLASS guard ` +
            `copies as a balustrade. \`suppressStartPost\` matters for multi-segment runs — a copied ` +
            `corner segment regains the post its neighbour already stands on.`,
        );
    }
    if (rail.hostId !== undefined) {
        console.warn(
            `[CopyTool] §L-1032: the source handrail is hosted on "${rail.hostId}", an element on ` +
            `the SOURCE storey. The copy is created UNHOSTED rather than asserting it runs along a ` +
            `stair or slab edge that is not there — the same rule beamCopyPayload applies to its ` +
            `support bindings.`,
        );
    }
    if (rail.railProfile === 'rectangular') {
        console.warn(
            `[CopyTool] §L-1032/EI-2: the source handrail's profile is 'rectangular'. The legacy ` +
            `vocabulary has two profiles and L0 has three (round|square|flat), so which of ` +
            `'square'/'flat' was authored cannot be recovered — the forward mirror folds both into ` +
            `'rectangular' (initTools.ts:2119). The copy is created as 'square'; omitting the field ` +
            `would default it to 'round' and silently change the rail's section.`,
        );
    }

    return {
        id:      newId,
        levelId: opts?.levelId ?? rail.levelId,
        // §L-1032 — inverse of initTools.ts:2064-2067. `y` is CARRIED, not
        // rebased: `HandrailFragmentBuilder.ts:238-240` derives world Y from
        // `level.elevation + baseOffset` and reads only the RISE between the two
        // endpoints (`:226`), never their absolute y — so the wall's
        // elevation-rebase rule does not apply here, and inventing one would
        // change every sloped rail's pitch.
        path: [
            { x: a.x + dx, y: a.y, z: a.z + dz },
            { x: b.x + dx, y: b.y, z: b.z + dz },
        ],
        // §L-1032 — the declared approximation. See the header.
        ...(rail.railProfile !== undefined
            ? { shape: rail.railProfile === 'round' ? 'round' : 'square' }
            : {}),
        ...(rail.height !== undefined ? { height: rail.height } : {}),
        // §L-1032 — the forward hop writes ONE value into two fields; prefer the
        // one the round branch reads, fall back to the one the rectangular
        // branch reads.
        ...((rail.railDiameter ?? rail.thickness) !== undefined
            ? { diameter: rail.railDiameter ?? rail.thickness }
            : {}),
        ...(rail.materialId !== undefined ? { materialId: rail.materialId } : {}),
    };
}

// ─── Lighting ────────────────────────────────────────────────────────────────

/** Subset of `LightingData` (`packages/geometry-lighting/src/LightingTypes.ts:197-238`). */
export interface LegacyLightingLike {
    levelId?: string;
    /** One of the TWELVE named families — see `lightingCopyPayload`. */
    fixtureType?: string;
    position: Pt3;
    rotation?: { x: number; y: number; z: number } | number;
    emission?: unknown;
    properties?: unknown;
    roomId?: string;
    hostId?: string;
    tags?: readonly string[];
    /** The per-family parametric blocks. Exactly one is populated per fixture. */
    downlightParams?: unknown;
    pendantParams?: unknown;
    linearLedParams?: unknown;
    pendantPebbleParams?: unknown;
    pendantCeramicBellParams?: unknown;
    pendantConicalParams?: unknown;
    floorWoodPostParams?: unknown;
    floorArcBrassParams?: unknown;
    tableTerracottaParams?: unknown;
    floorTripodBlackParams?: unknown;
    mirrorLightParams?: unknown;
    pendantClusterParams?: unknown;
}

/**
 * The ten named fixture families the L0 `LightingKind` enum has no member for.
 *
 * `packages/schemas/src/elements/Lighting.ts:47-53` — `LightingKind` is
 * `['downlight','pendant','strip','wall-sconce','emergency']`.
 * `LightingTypes.ts:33-44` — `LightingFixtureType` is twelve named families.
 * They share exactly TWO members, and that schema file says so itself:
 * `LightingKind` is a *"COARSER CLASSIFICATION"*, not a rival taxonomy.
 */
export const LIGHTING_FIXTURES_L0_CANNOT_EXPRESS = [
    'linear_led', 'pendant_pebble', 'pendant_ceramic_bell', 'pendant_conical',
    'floor_wood_post', 'floor_arc_brass', 'table_terracotta', 'floor_tripod_black',
    'mirror_light', 'pendant_cluster',
] as const;

/** Fields a lighting copy cannot carry, named rather than dropped (C84 **EI-2**). */
const LIGHTING_UNCARRIED_FIELDS = [
    'emission', 'properties', 'roomId', 'hostId', 'tags',
    'downlightParams', 'pendantParams', 'linearLedParams', 'pendantPebbleParams',
    'pendantCeramicBellParams', 'pendantConicalParams', 'floorWoodPostParams',
    'floorArcBrassParams', 'tableTerracottaParams', 'floorTripodBlackParams',
    'mirrorLightParams', 'pendantClusterParams',
] as const;

/**
 * Receiver: `CreateLightingPayload`
 * (`plugins/lighting/src/handlers/CreateLighting.ts:16-31`) AND
 * `CommandEventBridge`'s `lighting.create` case (`:995-1013`), which is the leg
 * that reaches the §FT-LIGHTING mirror (`initTools.ts:2109-2160`) → the legacy
 * `LightingStore` → `LightingFragmentBuilder`.
 *
 * ─── THE INVERSE OF THE §FT-LIGHTING BRIDGE, AND WHY `kind` GOES VERBATIM ───
 * The forward hop is `fixtureType: (ev.kind ?? 'downlight') as LightingFixtureType`
 * (`initTools.ts:2195`) — a CAST, not a translation. The bus `kind` is written
 * STRAIGHT into the legacy `fixtureType`. So the inverse that round-trips is
 * `kind = fixtureType`, verbatim, and any other mapping is wrong twice over:
 *
 *   • Deriving the coarse form (`constructionFormFor`) would send `'pendant'` for
 *     a `floor_arc_brass`, and the cast would then MINT A DIFFERENT LAMP — a
 *     silent mis-file, which this module ranks below a loud refusal.
 *   • Forwarding one of the ten families L0 cannot express makes `Lighting.parse`
 *     throw a `LightingSchemaError` and the copy REFUSES, loudly, with the family
 *     named. That is the `columnCopyPayload` 'UC'/'UB' precedent (C84 EI-3) and
 *     it is the correct behaviour of the two.
 *
 * `LIGHTING_FIXTURES_L0_CANNOT_EXPRESS` names the ten so the refusal is PREDICTED
 * here rather than discovered in a `.catch()`. **This is a FOUND, NOT FIXED
 * finding**: only `downlight` and `pendant` round-trip today, and the real repair
 * is upstream — either the L0 schema carries the named vocabulary, or the mirror
 * stops casting one into the other.
 *
 * ⚠ `origin.y` is carried but does NOT decide the height: the mirror RE-SEATS it
 * per fixture kind at the DESTINATION storey (`initTools.ts:2172-2186`,
 * §FIX-SEATING-ONE-AUTHORITY), which is exactly what a duplicate onto another
 * storey should do.
 */
export function lightingCopyPayload(
    light: LegacyLightingLike,
    dx: number,
    dz: number,
    newId: string,
    opts?: CopyPayloadOverrides,
): Record<string, unknown> {
    const rot = light.rotation;
    const yaw = typeof rot === 'number' ? rot : rot?.y;

    const record: Record<string, unknown> = { ...light };
    const uncarried = LIGHTING_UNCARRIED_FIELDS.filter((k) => record[k] !== undefined);
    if (uncarried.length > 0) {
        console.warn(
            `[CopyTool] §L-1032/EI-2: the source light fixture carries ${uncarried.join(', ')}, and ` +
            `neither CreateLightingPayload nor the lighting.create event has a slot for any of them, ` +
            `so the copy is created WITHOUT them. The \`*Params\` block is the fixture's whole ` +
            `parametric description (radii, cable drops, shade colours), so a tuned pendant copies ` +
            `as a default one of its family; \`emission\` is its photometry.`,
        );
    }
    if (
        light.fixtureType !== undefined &&
        (LIGHTING_FIXTURES_L0_CANNOT_EXPRESS as readonly string[]).includes(light.fixtureType)
    ) {
        console.warn(
            `[CopyTool] §L-1032/EI-3: the source fixture is a "${light.fixtureType}", which the L0 ` +
            `LightingKind enum (downlight|pendant|strip|wall-sconce|emergency) has no member for. ` +
            `The value is forwarded UNCHANGED so \`Lighting.parse\` REFUSES the copy loudly. It is ` +
            `NOT folded into its coarse construction form, because the lighting.created mirror CASTS ` +
            `\`kind\` straight into \`fixtureType\` (initTools.ts:2195) — so a folded value would ` +
            `mint a DIFFERENT lamp instead of refusing. Only 'downlight' and 'pendant' round-trip ` +
            `today; the repair is upstream, in the schema or the cast.`,
        );
    }
    if (yaw !== undefined && yaw !== 0) {
        console.warn(
            `[CopyTool] §L-1032/EI-2: the source fixture is rotated (${yaw} rad). ` +
            `CreateLightingPayload accepts \`rotation\` and it is forwarded, but the ` +
            `CommandEventBridge \`lighting.create\` case emits only id/kind/origin ` +
            `(CommandEventBridge.ts:1005-1012), so the rotation reaches the L0 record and NOT the ` +
            `legacy store the mesh is built from. The copied fixture's BODY faces the default ` +
            `direction until that emit carries rotation.`,
        );
    }

    return {
        id:      newId,
        levelId: opts?.levelId ?? light.levelId,
        // §L-1032 — VERBATIM. See the header: any other mapping either mints a
        // different lamp or hides a refusal.
        ...(light.fixtureType !== undefined ? { kind: light.fixtureType } : {}),
        // `y` is carried for completeness; the mirror re-seats it at the
        // destination storey per fixture kind.
        origin: { x: light.position.x + dx, y: light.position.y, z: light.position.z + dz },
        // A SCALAR yaw — `CreateLightingPayload.rotation` is `number`.
        ...(yaw !== undefined ? { rotation: yaw } : {}),
    };
}

// ─── Plumbing ────────────────────────────────────────────────────────────────

/**
 * Subset of `PlumbingFixtureData`
 * (`packages/geometry-plumbing/src/PlumbingTypes.ts:16-47`).
 *
 * `position`/`rotation` are a `THREE.Vector3`/`THREE.Euler` in the real record;
 * declared structurally here so this module stays THREE-free (P2). Only `x`,
 * `y`, `z` are read, which both classes expose as plain numbers.
 */
export interface LegacyPlumbingFixtureLike {
    levelId?: string;
    fixtureType?: string;
    toiletVariant?: string;
    showerVariant?: string;
    accessoryVariant?: string;
    position: Pt3;
    rotation?: { x: number; y: number; z: number };
    baseOffset?: number;
    width?: number;
    height?: number;
    length?: number;
    color?: string;
    startPoint?: Pt3;
    endPoint?: Pt3;
    properties?: unknown;
}

/**
 * Receiver: `CreatePlumbingFixturePayload`
 * (`plugins/plumbing/src/handlers/CreatePlumbingFixture.ts:16-28`) AND the
 * command it forwards to whole, `CreatePlumbingFixtureCommand`'s own
 * `CreatePlumbingFixturePayload`
 * (`packages/command-registry/src/plumbing/CreatePlumbingFixtureCommand.ts:13-32`),
 * which declares `id`, `color`, `startPoint` and `endPoint` that the plugin
 * interface does not. The second receiver is legitimate for the same reason
 * `slabCopyPayload` may emit `ifcGuid`/`position`/`width`/`depth`: the handler
 * body passes `cmd` through unexamined (`CreatePlumbingFixture.ts:50`), so those
 * keys reach a DECLARED interface — they are not falling through to a default.
 *
 * ⚠ **THE VERB IS `plumbing.createFixture`, NOT `plumbing.create`, AND THAT IS
 * THE WHOLE PLUMBING FINDING.** The two describe different elements:
 *
 *   • `CreatePlumbingPayload` (`plugins/plumbing/src/handlers/CreatePlumbing.ts:16-29`)
 *     is a PIPE — `kind: straight|bend`, `diameter`, `length`, `bendRadius`,
 *     `systemTag`. It has no `fixtureType` and no `toiletVariant`.
 *   • `window.plumbingStore` holds `PlumbingFixtureData` — toilets, sinks,
 *     baths, showers, accessories.
 *
 * Routing a duplicated toilet through `plumbing.create` would mint a 50 mm
 * cold-water pipe. Worse, it would mint it NOWHERE VISIBLE: `CommandEventBridge`'s
 * `plumbing.create` case emits `levelId` and nothing else (`:1015-1023`) and
 * **no subscriber to `plumbing.created` exists in the tree** (`grep -rn
 * "plumbing.created"` → two hits, both the emitter and its type declaration), so
 * that leg reaches the plugin DTO store only and no builder ever hears.
 * `plumbing.createFixture` is the leg that reaches `PlumbingStore.add()` →
 * `PlumbingFragmentBuilder`.
 *
 * ⚠ **FOUND, NOT FIXED — this verb's undo entry is on the LEGACY stack.**
 * `CreatePlumbingFixtureHandler.execute` returns `{ forward: [], inverse: [] }`
 * and does its work through `window.commandManager.execute(...)`
 * (`CreatePlumbingFixture.ts:46-56`), so the bus ring buffer records an EMPTY
 * entry and the real inverse lives in the legacy command manager. One Ctrl+Z
 * still removes one duplicated fixture, but it is NOT the same mechanism the
 * other families use, and unifying it is a `plugins/**` change outside this lane.
 * `DUPLICATE_TO_LEVEL['plumbing'].undoStack` records this rather than letting
 * `undoEntries: 1` imply a bus entry that is not there.
 *
 * ⚠ `position.y` is carried but does NOT decide the height:
 * `CreatePlumbingFixtureCommand.execute` re-seats it as
 * `resolveFloorSeatingDatum(...).y + baseOffset` (`:67-79`,
 * §FIX-INTERIOR-FFL-SEATING), so a duplicate lands on the DESTINATION storey's
 * finished floor — which is what it should do.
 */
export function plumbingFixtureCopyPayload(
    fixture: LegacyPlumbingFixtureLike,
    dx: number,
    dz: number,
    newId: string,
    opts?: CopyPayloadOverrides,
): Record<string, unknown> {
    if (fixture.properties !== undefined) {
        console.warn(
            `[CopyTool] §L-1032/EI-2: the source plumbing fixture carries \`properties\`, and no ` +
            `receiver declares a slot for it — CreatePlumbingFixtureCommand writes ` +
            `\`properties: {}\` unconditionally (CreatePlumbingFixtureCommand.ts:91) — so the copy ` +
            `is created with an EMPTY property bag. A fixture's IFC mark lives there, so the copy ` +
            `is unmarked.`,
        );
    }

    return {
        // Declared by the COMMAND's payload interface and forwarded whole by the
        // plugin handler. Without it `stableCreatedId` mints its own and the
        // duplicate route's `newId` would name an element that does not exist.
        id:          newId,
        levelId:     opts?.levelId ?? fixture.levelId,
        fixtureType: fixture.fixtureType,
        // Re-seated at the destination storey by the command — see the header.
        position:    { x: fixture.position.x + dx, y: fixture.position.y, z: fixture.position.z + dz },
        // An OBJECT, not a scalar: both receivers declare `{x,y,z}` and the
        // command feeds it straight into `new THREE.Euler(...)`. The furniture
        // hop's scalar-yaw lift (§FIX-COPY-PAYLOAD-FIELD-NAMES) is the OPPOSITE
        // case and must not be copied here.
        rotation: {
            x: fixture.rotation?.x ?? 0,
            y: fixture.rotation?.y ?? 0,
            z: fixture.rotation?.z ?? 0,
        },
        baseOffset: fixture.baseOffset ?? 0,
        ...(fixture.toiletVariant    !== undefined ? { toiletVariant:    fixture.toiletVariant }    : {}),
        ...(fixture.showerVariant    !== undefined ? { showerVariant:    fixture.showerVariant }    : {}),
        ...(fixture.accessoryVariant !== undefined ? { accessoryVariant: fixture.accessoryVariant } : {}),
        ...(fixture.width  !== undefined ? { width:  fixture.width }  : {}),
        ...(fixture.height !== undefined ? { height: fixture.height } : {}),
        ...(fixture.length !== undefined ? { length: fixture.length } : {}),
        ...(fixture.color  !== undefined ? { color:  fixture.color }  : {}),
        ...(fixture.startPoint !== undefined
            ? {
                startPoint: {
                    x: fixture.startPoint.x + dx,
                    y: fixture.startPoint.y,
                    z: fixture.startPoint.z + dz,
                },
            }
            : {}),
        ...(fixture.endPoint !== undefined
            ? {
                endPoint: {
                    x: fixture.endPoint.x + dx,
                    y: fixture.endPoint.y,
                    z: fixture.endPoint.z + dz,
                },
            }
            : {}),
    };
}
