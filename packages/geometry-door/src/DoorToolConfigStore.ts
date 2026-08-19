/**
 * DoorToolConfigStore — §FIX-DOOR-CREATION-PARITY (L-260 A).
 *
 * THE SINGLE SOURCE OF TRUTH for the door configuration the architect chose
 * (door TYPE — single/double — and the door SYSTEM TYPE), resolved ONCE, BELOW
 * the tools, exactly as `StairToolConfigStore` (L-243) does for stairs.
 *
 * ── The disease this cures (C11) ──────────────────────────────────────────────
 *
 * A door created in PLAN and a door created in 3D rendered as different objects.
 * Two independent resolutions of the SAME user choice:
 *
 *   • 3D  (`DoorTool`)              → `this.doorType` / `this.systemTypeId`,
 *                                      written by `ToolManager.activateDoor()`.
 *   • PLAN (`DoorPlanToolHandler`)  → `ctx.activeOpeningTool.doorType`, where
 *                                      `activeOpeningTool` resolves to
 *                                      `window.activeOpeningTool ?? window.windowTool
 *                                       ?? window.doorTool` — and `window.windowTool`
 *                                      IS ALWAYS SET, so the DOOR handler was reading
 *                                      the WINDOW tool, which has no `doorType` →
 *                                      **every plan-placed door silently became SINGLE**,
 *                                      even when the ribbon said DOUBLE.
 *                                      `systemTypeId` was scavenged from the
 *                                      `window.doorTool` global (a live P4 violation).
 *
 * On top of that, `ToolManager.activateDoor(type, systemTypeId?)` assigned
 * `doorTool.systemTypeId = systemTypeId` UNCONDITIONALLY, so any caller that omitted
 * the id (`activateDoor('single')` — the bottom menu, the create panel) wiped the
 * architect's chosen type back to `undefined` for the 3D path while the plan path
 * still defaulted it to `dt-solid-timber`. The two paths could not agree.
 *
 * ── The cure ──────────────────────────────────────────────────────────────────
 *
 * Every WRITER (the ribbon door picker, the pre-draw property panel, ToolManager)
 * writes HERE. Every READER (the 3D `DoorTool`, the plan `DoorPlanToolHandler` via
 * the injected `PlanToolDrawContext.doorConfig`, batch generators, AI) reads the SAME
 * resolved config. `setDoorToolConfig()` IGNORES undefined patch values, so a caller
 * that only knows the door type can never erase the chosen system type.
 *
 * Pure: no DOM, no THREE, no I/O. P8 — no exported side-effectful function here
 * beyond pure state accessors (spans are emitted by the creation chokepoint,
 * `DoorOpeningFactory`, which consumes this config).
 */

// §OPENING-PROFILE (L-1251) — the shape vocabulary is owned by `@pryzm/geometry-wall`, because
// the VOID is the host's half of the opening (C15 §3.1). The door stores a CHOICE of it; it does
// not re-declare the union, or a door and a window could disagree about what "arched" means.
import { type OpeningProfileKind, DEFAULT_OPENING_PROFILE } from '@pryzm/geometry-wall';

export type DoorTypeChoice = 'single' | 'double';

export interface DoorToolConfig {
    /** Single- or double-leaf. Written by the ribbon door-mode picker. */
    readonly doorType: DoorTypeChoice;
    /**
     * The chosen `DoorSystemType.id`. Never undefined — a door ALWAYS has a type,
     * otherwise the builder falls back to schema-default colours (the "grey door"
     * class of defect, cf. §MAT-WINDOW-PLAN-PARITY).
     */
    readonly systemTypeId: string;
    /**
     * §OPENING-PROFILE (L-1251) — the void SHAPE. The founder asked for the arched door in the
     * SAME breath as the circular window, and the whole point of one `openingProfile` on the wall
     * opening is that both nouns read ONE axis. ⛔ A door offers three of the four values —
     * `circular` is excluded by `openingProfilesFor('door')`, because a floor-reaching opening has
     * no jambs for a circle to spring from.
     */
    readonly openingProfile: OpeningProfileKind;
}

/**
 * Canonical default — Solid Timber, the standard residential/commercial door.
 * Identical to the historical `DoorTool.systemTypeId` default and the historical
 * `DoorPlanToolHandler` fallback, so pre-existing behaviour is preserved for any
 * caller that never picks a type.
 */
export const DEFAULT_DOOR_TOOL_CONFIG: DoorToolConfig = Object.freeze({
    doorType:       'single',
    systemTypeId:   'dt-solid-timber',
    // Rectangular — what every door drawn before L-1251 is. Default and "absent" coincide, which
    // is what makes the axis additive rather than a migration.
    openingProfile: DEFAULT_OPENING_PROFILE,
});

let _current: DoorToolConfig = DEFAULT_DOOR_TOOL_CONFIG;

/** Read the resolved door config. Plan tools should prefer the DI'd `ctx.doorConfig`. */
export function getDoorToolConfig(): DoorToolConfig {
    return _current;
}

/**
 * Merge a partial choice into the resolved config. Called by every WRITER.
 *
 * `undefined` values are IGNORED — this is load-bearing: `ToolManager.activateDoor()`
 * is routinely called with no `systemTypeId`, and the old code let that erase the
 * architect's selection on the 3D path only (creating the very plan-vs-3D divergence
 * this store exists to kill).
 */
export function setDoorToolConfig(patch: Partial<DoorToolConfig>): DoorToolConfig {
    const next: DoorToolConfig = {
        doorType:     patch.doorType     ?? _current.doorType,
        systemTypeId: (patch.systemTypeId && patch.systemTypeId.length > 0)
            ? patch.systemTypeId
            : _current.systemTypeId,
        // The two axes patch INDEPENDENTLY — switching leaf count must not reset the shape.
        // `double × round-arch` is an ordinary door and has to stay expressible (C86 §9 WO-Voc-4).
        openingProfile: patch.openingProfile ?? _current.openingProfile,
    };
    _current = next;
    return _current;
}

/** Reset to defaults — used on project switch (Contract 48 project isolation). */
export function resetDoorToolConfig(): void {
    _current = DEFAULT_DOOR_TOOL_CONFIG;
}
