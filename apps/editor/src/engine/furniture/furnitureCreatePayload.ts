/**
 * @file furnitureCreatePayload.ts
 *
 * §FIX-WARDROBE-CREATE-ROTATION-NAN (L-214) — the SINGLE canonical builder for
 * every editor `furniture.create` bus payload.
 *
 * ## Why this module exists (C11 — one element type, one creation pipeline)
 *
 * Three placement surfaces committed furniture RUNs by hand-writing the
 * `furniture.create` payload independently:
 *   • the 3D `WardrobeCabinetTool` (`apps/editor/src/ui/wardrobe`)
 *   • the 3D `KitchenCabinetTool`  (`apps/editor/src/ui/kitchen`)
 *   • the plan `FurniturePlanToolHandler` (`apps/editor/src/engine/views/plantools`)
 *
 * They drifted. `WardrobeCabinetTool` sent `rotation` as a THREE Euler object
 * `{ x, y, z, order }`; the bus handler (`@pryzm/plugin-furniture`
 * `CreateFurnitureHandler.canExecute`) validates `Number.isFinite(rotation)` —
 * a SCALAR yaw in radians — so `Number.isFinite({…})` was `false` and the
 * command was rejected with `rotation must be finite`. Nothing was created (the
 * preview never runs `canExecute`, which is why it still rendered). The plan
 * tool, meanwhile, hard-coded `rotation: 0` on its kitchen/wardrobe branches, so
 * the SPACE-key orientation the user set on the preview was silently dropped at
 * commit.
 *
 * ## The fix — make the payload shape a compile-time contract
 *
 * `rotation` is typed `number` here (a scalar yaw in radians). Passing a Vec3 /
 * Euler is now a **compile error at every call site**, not a silent runtime
 * rejection swallowed into a `console.error`. Both the 3D tools and the plan
 * handler feed this one builder, so they emit a byte-identical payload for the
 * same placement — the L-213 divergence class cannot recur here.
 *
 * The bus handler's `Number.isFinite(rotation)` guard is UNTOUCHED and remains
 * the runtime backstop; this module is the type-level convergence point.
 *
 * ## Rotation → mesh
 * `CommandEventBridge` (`furniture.create` → `furniture.created`) forwards this
 * scalar and the `§FT-FURNITURE` bridge in `initTools.ts` lifts it into the mesh
 * Euler `.y`, so preview orientation ≡ placed orientation.
 *
 * ## §FIX-FURNITURE-AD-HOC-ID (L-665) — the id is minted HERE, once
 *
 * The same divergence class recurred on the `id` field. `KitchenCabinetTool`
 * minted `kitchen_<Date.now()>_<counter>` and `WardrobeCabinetTool` minted
 * `wardrobe_cab_<Date.now()>_<counter>`, while every other furniture path
 * (`FurniturePlanToolHandler`, `CopyPlanToolHandler`, `FurnitureDragDropHandler`,
 * the AI furnish workflow, the handler's own fallback) used the ADR-0001 id
 * factory `createId('furniture')`. The `Furniture` schema's id regex
 * (`^furniture_[0-9A-HJKMNP-TV-Z]{26}$`, `defineElement`) rejected the ad-hoc ids
 * at `Furniture.parse` inside `CreateFurnitureHandler.execute`, so the command
 * threw `FurnitureSchemaError` and NOTHING was created — while the preview, which
 * never validates, kept rendering a perfect ghost. (Identical to L-145, where
 * `crypto.randomUUID()` ids were Zod-rejected by the annotation schema.)
 *
 * So this module now OWNS the id too: `id` is optional on the input and, when
 * absent, is minted via {@link newFurnitureId} (`createId('furniture')`). A
 * caller that supplies its own id is validated with `isId(id, 'furniture')` and
 * rejected loudly at the convergence point rather than silently at the bus. No
 * furniture placement surface may invent an id shape again.
 *
 * Layer: L5 (`apps/editor`). It is an app-level adapter from the placement tools
 * to the runtime CommandBus — a dispatch concern, not geometry — so it lives in
 * the app, not in the L2 `@pryzm/geometry-furniture` geometry package. Its input
 * types are re-used from `@pryzm/geometry-furniture` (a lower layer, allowed);
 * `createId`/`isId` come from L0 `@pryzm/schemas` (also allowed).
 */

import { createId, isId } from '@pryzm/schemas';
import type {
    FurnitureType,
    FurnitureMaterial,
    KitchenCabinetConfig,
    WardrobeCabinetConfig,
} from '@pryzm/geometry-furniture';

/**
 * §FIX-FURNITURE-AD-HOC-ID (L-665) — the ONE id minter for editor furniture
 * placement. Delegates to the ADR-0001 factory `createId('furniture')`, which
 * produces `furniture_<26-char Crockford-base32 ULID>` — the only shape the
 * `Furniture` schema accepts. Two runs placed in the SAME millisecond are still
 * distinct (the 80-bit random tail), which is the property
 * §FIX-KITCHEN-SECOND-PLACE / ADR-0113 needed the old counter for; ids sort by
 * placement time ACROSS milliseconds (the 48-bit timestamp prefix), not within
 * one — nothing in the furniture path depends on intra-millisecond order.
 *
 * Do NOT write another id generator: mint here or pass an id already produced by
 * `createId('furniture')`.
 */
export function newFurnitureId(): string {
    return createId('furniture') as string;
}

/** A plain 3D point (world metres). */
export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * Inputs to {@link buildFurnitureCreatePayload}. `rotation` is a SCALAR yaw in
 * radians — read straight from the preview's `PrePlacementRotation.rotationY()`
 * so the committed orientation is exactly the one the user set with SPACE.
 */
export interface FurnitureCreateInput {
    /**
     * OPTIONAL — omit it and the builder mints `furniture_<ULID>` via
     * {@link newFurnitureId}. If supplied it MUST already be a
     * `createId('furniture')` value; anything else throws (§FIX-FURNITURE-AD-HOC-ID).
     */
    readonly id?: string;
    readonly furnitureType: FurnitureType;
    readonly position: Vec3;
    /** Scalar yaw (radians). NOT a Vec3/Euler — see module header. */
    readonly rotation: number;
    readonly levelId: string;
    readonly width: number;
    readonly length: number;
    readonly height: number;
    readonly baseOffset?: number;
    readonly material?: FurnitureMaterial;
    readonly furnitureCategory?: string;
    readonly color?: string;
    readonly metadata?: Record<string, unknown>;
    readonly kitchenConfig?: KitchenCabinetConfig;
    readonly wardrobeCabinetConfig?: WardrobeCabinetConfig;
}

/**
 * The canonical `furniture.create` command payload. `rotation` is the scalar the
 * bus handler validates and the `§FT-FURNITURE` bridge lifts into the mesh yaw.
 */
export interface FurnitureCreatePayload {
    readonly id: string;
    readonly furnitureType: FurnitureType;
    readonly position: Vec3;
    readonly rotation: number;
    readonly levelId: string;
    readonly baseOffset: number;
    readonly width: number;
    readonly length: number;
    readonly height: number;
    readonly material: FurnitureMaterial;
    readonly furnitureCategory?: string;
    readonly color?: string;
    readonly metadata?: Record<string, unknown>;
    readonly kitchenConfig?: KitchenCabinetConfig;
    readonly wardrobeCabinetConfig?: WardrobeCabinetConfig;
}

/**
 * Build the canonical `furniture.create` payload. Optional fields are omitted
 * (not set to `undefined`) when absent, so two call sites that pass equivalent
 * inputs produce structurally identical payloads.
 *
 * The `Number.isFinite(rotation)` assertion is defence-in-depth: the compiler
 * already forbids a non-scalar `rotation`, and the bus guard is the runtime
 * backstop — this throws loudly (instead of a silent no-op click) if a caller
 * ever routes a computed NaN through. It does NOT replace or weaken the guard.
 *
 * The `id` assertion (§FIX-FURNITURE-AD-HOC-ID / L-665) is the same shape of
 * defence: the `Furniture` schema regex is the authority and is NOT weakened —
 * an id that would fail it is rejected here, at the one place every editor
 * furniture placement passes through, instead of surfacing as a dead click.
 */
export function buildFurnitureCreatePayload(
    input: FurnitureCreateInput,
): FurnitureCreatePayload {
    if (!Number.isFinite(input.rotation)) {
        throw new TypeError(
            '[buildFurnitureCreatePayload] rotation must be a finite scalar yaw ' +
            `(radians); received ${String(input.rotation)}. Do not pass a Vec3/Euler.`,
        );
    }
    // §FIX-FURNITURE-AD-HOC-ID (L-665) — mint, or validate a caller-supplied id
    // against the SAME shape the Furniture schema enforces.
    const id = input.id ?? newFurnitureId();
    if (!isId(id, 'furniture')) {
        throw new TypeError(
            '[buildFurnitureCreatePayload] id must be a createId(\'furniture\') value ' +
            `(furniture_<26-char ULID>); received "${String(input.id)}". The Furniture ` +
            'schema rejects anything else at commit — omit `id` and let this builder ' +
            'mint it, or call createId(\'furniture\').',
        );
    }
    return {
        id,
        furnitureType: input.furnitureType,
        position:      { x: input.position.x, y: input.position.y, z: input.position.z },
        rotation:      input.rotation,
        levelId:       input.levelId,
        baseOffset:    input.baseOffset ?? 0,
        width:         input.width,
        length:        input.length,
        height:        input.height,
        material:      input.material ?? 'wood',
        ...(input.furnitureCategory     !== undefined ? { furnitureCategory:     input.furnitureCategory } : {}),
        ...(input.color                 !== undefined ? { color:                 input.color } : {}),
        ...(input.metadata              !== undefined ? { metadata:              input.metadata } : {}),
        ...(input.kitchenConfig         !== undefined ? { kitchenConfig:         input.kitchenConfig } : {}),
        ...(input.wardrobeCabinetConfig !== undefined ? { wardrobeCabinetConfig: input.wardrobeCabinetConfig } : {}),
    };
}
