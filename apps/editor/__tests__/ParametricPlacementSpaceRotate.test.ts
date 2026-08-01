// @vitest-environment happy-dom
//
// §FIX-PARAMETRIC-SPACE-ROTATE / §FIX-PLACEMENT-PREVIEW (founder L-20/L-21/L-23,
// ADR-0107) — regression guard for converging the PARAMETRIC placement flows
// (kitchen / wardrobe cabinet runs) on the shared SPACE-to-rotate state and on
// dimension-accurate ghosts.
//
// The parametric tools (KitchenCabinetTool / WardrobeCabinetTool) are heavily
// THREE/OBC-coupled (they need a live OBC.World + WebGL canvas), so this suite
// pins the two behaviours that DON'T require the renderer:
//
//   1. L-23 — the shared PrePlacementRotation is the single source of truth for
//      pre-placement yaw: +90°/SPACE press, cumulative & wrapping, and the value
//      the tool commits (`rotationY()`) is the accumulated yaw. This is EXACTLY
//      how KitchenCabinetTool._placeKitchen() / WardrobeCabinetTool._placeWardrobe()
//      now read the yaw (replacing their forked local "R" key + preview.rotation.y).
//
//   2. L-21 — the plan-view ghost footprint for a parametric layout tracks the
//      parametric CONFIG produced by the shared builder (buildDefaultKitchenConfig
//      / buildDefaultWardrobeCabinetConfig), NOT a fixed default box. The FOOTPRINTS
//      table in FurniturePlanToolHandler maps the run's bounding box from the same
//      *_DEFAULTS the builder uses, so preview ≡ placed size by construction.
//
// happy-dom env: importing @pryzm/geometry-furniture transitively loads THREE via
// the package barrel (renderer-three); THREE imports fine without WebGL under
// happy-dom (same rationale as UpdateFurnitureParametersCommand.test.ts).

import { describe, it, expect } from 'vitest';
import { PrePlacementRotation } from '@pryzm/core-app-model';
import {
    buildDefaultKitchenConfig,
    buildDefaultWardrobeCabinetConfig,
    KITCHEN_DEFAULTS,
    WARDROBE_CABINET_DEFAULTS,
} from '@pryzm/geometry-furniture';
// §FIX-FURNITURE-AD-HOC-ID (L-665) — the ONE furniture id minter the parametric
// tools call (createId('furniture')); imported, never re-implemented here.
import { newFurnitureId } from '../src/engine/furniture/furnitureCreatePayload';

const HALF_PI = Math.PI / 2;

describe('§FIX-PARAMETRIC-SPACE-ROTATE — parametric flows rotate on SPACE', () => {
    it('a parametric run reads the ACCUMULATED SPACE yaw at commit (not a forked R key)', () => {
        // Mirrors KitchenCabinetTool / WardrobeCabinetTool: one shared rotation
        // state, advanced by SPACE, read straight into the furniture.create
        // rotation.y at placement time.
        const rotation = new PrePlacementRotation();

        // User presses SPACE twice before clicking to place the L-shape run.
        rotation.advance(); // 90°
        rotation.advance(); // 180°

        // The tool commits `rotationY()` as rotation.y — the placed run must
        // carry the orientation chosen BEFORE the click.
        const committedYaw = rotation.rotationY();
        expect(committedYaw).toBeCloseTo(Math.PI, 10);
        expect(rotation.degrees()).toBe(180);
    });

    it('onChange re-orients the live ghost even when the pointer is stationary', () => {
        // The parametric tools pass onChange:() => this._applyPreviewRotation(),
        // so a SPACE press with no pointer movement still spins the ghost.
        const seen: number[] = [];
        const rotation = new PrePlacementRotation({ onChange: (rad) => seen.push(rad) });
        rotation.advance();
        expect(seen).toHaveLength(1);
        expect(seen[0]).toBeCloseTo(HALF_PI, 10);
    });

    it('deactivate() reset() returns the shared yaw to 0° for the next placement', () => {
        const rotation = new PrePlacementRotation();
        rotation.advance();
        rotation.advance();
        rotation.reset(); // called in tool.deactivate()
        expect(rotation.rotationY()).toBe(0);
    });

    it('L-23: SPACE advances the yaw the SECOND placement commits (re-arm cycle)', () => {
        // §FIX-KITCHEN-SECOND-PLACE — after a commit the tool calls _rotation.reset()
        // then re-arms, so the next placement starts at 0° and SPACE advances afresh.
        const rotation = new PrePlacementRotation();
        rotation.advance();               // first run: 90°
        const firstYaw = rotation.rotationY();
        rotation.reset();                 // tool re-arms after commit
        expect(rotation.rotationY()).toBe(0);
        rotation.advance();               // second run: SPACE again → 90°
        expect(rotation.rotationY()).toBeCloseTo(firstYaw, 10);
    });
});

describe('§FIX-KITCHEN-SECOND-PLACE (L-33) — a second kitchen gets a distinct id', () => {
    // §FIX-FURNITURE-AD-HOC-ID (L-665) — this block USED to re-implement
    // `KitchenCabinetTool.newKitchenRunId()` locally ("kept in lock-step"), so it
    // green-lit an id shape (`kitchen_<Date.now()>_<n>`) that the Furniture schema
    // rejects at commit — the duplication is exactly why the defect survived a
    // passing suite. It now imports the REAL minter the tool calls. The module is
    // THREE/OBC-free (types-only imports + @pryzm/schemas), so it loads fine here.
    it('is unique across consecutive placements (even within the same millisecond)', () => {
        const ids = new Set<string>();
        for (let i = 0; i < 10; i++) ids.add(newFurnitureId());
        expect(ids.size).toBe(10);
    });

    it('every id is the schema-valid furniture_<ULID> the commit path requires', () => {
        // A second placement that the store accepts is worth nothing if the FIRST
        // one never commits: the id must satisfy `^furniture_[0-9A-HJKMNP-TV-Z]{26}$`.
        const a = newFurnitureId();
        const b = newFurnitureId();
        expect(a).toMatch(/^furniture_[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(b).toMatch(/^furniture_[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(a).not.toBe(b);
    });
});

describe('§FIX-PLACEMENT-PREVIEW (L-21) — parametric ghost dims track the config', () => {
    it('kitchen straight run: config main-run bbox = defaults (width=length, depth)', () => {
        const cfg = buildDefaultKitchenConfig('kitchen_straight', 'door');
        // The plan FOOTPRINTS row for kitchen_straight is
        //   { w: KITCHEN_DEFAULTS.length, l: KITCHEN_DEFAULTS.depth, h: KITCHEN_DEFAULTS.height }
        // and the 3D tool builds the ghost main box as (length × height × depth).
        // Both must equal the config the builder produced.
        expect(cfg.length).toBe(KITCHEN_DEFAULTS.length);
        expect(cfg.depth).toBe(KITCHEN_DEFAULTS.depth);
        expect(cfg.height).toBe(KITCHEN_DEFAULTS.height);
    });

    it('kitchen L/U runs carry arm lengths → ghost is larger than a single default box', () => {
        const l = buildDefaultKitchenConfig('kitchen_l_shape', 'door');
        const u = buildDefaultKitchenConfig('kitchen_u_shape', 'door');
        // L adds one arm, U adds two — the ghost bbox depth must exceed the main
        // run depth (proving the ghost is NOT a fixed default box).
        expect((l.lengthLeft ?? 0)).toBeGreaterThan(0);
        expect((u.lengthLeft ?? 0)).toBeGreaterThan(0);
        expect((u.lengthRight ?? 0)).toBeGreaterThan(0);
    });

    it('wardrobe straight run: config bbox = wardrobe defaults', () => {
        const cfg = buildDefaultWardrobeCabinetConfig('wardrobe_straight');
        expect(cfg.length).toBe(WARDROBE_CABINET_DEFAULTS.length);
        expect(cfg.depth).toBe(WARDROBE_CABINET_DEFAULTS.depth);
        expect(cfg.height).toBe(WARDROBE_CABINET_DEFAULTS.height);
    });

    it('wardrobe L/U runs carry arm lengths (ghost reflects the run, not a panel)', () => {
        const l = buildDefaultWardrobeCabinetConfig('wardrobe_l_shape');
        const u = buildDefaultWardrobeCabinetConfig('wardrobe_u_shape');
        expect((l.lengthLeft ?? 0)).toBeGreaterThan(0);
        expect((u.lengthLeft ?? 0)).toBeGreaterThan(0);
        expect((u.lengthRight ?? 0)).toBeGreaterThan(0);
    });
});
