/**
 * SlabModePicker — In-viewport HUD for slab drawing mode selection.
 *
 * §FEAT-SLAB-DRAW-MODES (founder, 2026-08-06) — THE SLAB TOOL NOW OFFERS THE WALL
 * TOOL'S DRAWING MODES.
 * ─────────────────────────────────────────────────────────────────────────────
 * The founder: *"During SLAB creation, FLOOR FINISH creation and CEILING creation
 * I want the SAME OPTIONS as during WALL creation — ORTHO, LINEAR, CURVE etc. —
 * WITH THE SAME PANEL."*
 *
 * Floor finishes and ceilings got that in §FEAT-BOUNDARY-CURVE-DRAW. The SLAB did
 * not: this panel offered only 2-Point / Polyline / By Region / Hollow / Pick
 * Walls, and its "Polyline" mode was a single freeform gesture with an always-on,
 * un-disableable 45°/90° snap in 3D — the founder's screenshot ("Polyline Slab:
 * Points: 2") is exactly this panel with no mode row at all.
 *
 * The three wall modes are now FIRST in the row, named and keyed identically to
 * the wall tool (L / O / C) and drawn with the SAME icons (`wallLinear`,
 * `wallOrtho`, `wallCurved`). They are polyline SUB-MODES — precisely as they are
 * for walls — so they all enter POLYLINE_SLAB and differ only in how each click
 * is constrained. The slab-specific modes (2-Point, By Region, Hollow, Pick
 * Walls) are unchanged and keep their place.
 *
 * The mode SEMANTICS are not defined here: `linear` | `ortho` | `curved` are
 * `BoundaryDrawMode` from `@pryzm/geometry-slab`, the one model the slab, floor
 * and ceiling tool handlers all consume. This class only names and offers them.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS via AppTheme.ts (smp- prefix) — unchanged.
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — callbacks delegate.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : No @thatopen/ui (bim-*) elements.
 *   §01-BIM-ENGINE-CORE §1.5      : UI layer only — reads no stores, calls no builders.
 *   §04-SLAB-TOOL-STATE-MACHINE   : Activation is via service.activateSlabTool() in
 *                                   the caller; this component is pure UI.
 *
 * The panel DOM is now `DrawModePicker` — the ONE panel component shared with
 * `FloorModePicker` and `CeilingModePicker`, not a fourth copy of it.
 */

import { DrawModePicker } from './DrawModePicker';
import { wallLinear, wallOrtho, wallCurved } from './icons/PryzmIcons';
import type { BoundaryDrawMode } from '@pryzm/geometry-slab';
// The surface-independent mode store. `BottomActionMenu` and `CreateRailPanel`
// each construct their OWN SlabModePicker, so the selection cannot live on the
// instance — see activeSlabDrawMode.ts for the L-98 precedent this follows.
// (The wall-type pre-draw picker writes `activeWallSystemType.ts` the same way.)
import { setActiveSlabDrawMode, resolveActiveSlabDrawMode } from '@app/engine/views/plantools/activeSlabDrawMode';

/**
 * Every mode the slab tool offers. The first three are `BoundaryDrawMode` — the
 * SAME three the wall, floor-finish and ceiling tools offer, spelled the same way
 * (the type-level guarantee that they cannot drift apart).
 */
export type SlabPickerMode = BoundaryDrawMode | '2point' | 'region' | 'hollow' | 'pickWalls';

export interface SlabModePickerCallbacks {
    /** LINEAR polyline — freeform vertices, no constraint (the old `onPolyline`). */
    onLinear:    () => void;
    /** ORTHO polyline — each segment snapped to the nearest 90° from the previous vertex. */
    onOrtho:     () => void;
    /** CURVED polyline — vertex → arc midpoint → arc end, tessellated into the boundary. */
    onCurved:    () => void;
    on2Point:    () => void;
    onRegion:    () => void;
    onHollow:    () => void;
    onPickWalls: () => void;
}

export class SlabModePicker {
    private readonly _picker: DrawModePicker<SlabPickerMode>;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        // 'linear' is the wall tool's default too — the polyline slab a user gets
        // without touching the picker behaves exactly as it always did.
        this._picker = new DrawModePicker<SlabPickerMode>('smp', 'SlabModePicker', 'linear', true, runtime);
    }

    /**
     * The mode the slab tool handlers read (the `WallModePicker.getActiveMode()`
     * contract). For the three BOUNDARY modes it answers from the shared store, so
     * every picker instance and every drawing surface agree.
     */
    getActiveMode(): SlabPickerMode {
        const local = this._picker.getActiveMode();
        // A slab-specific family mode (2-point / region / hollow / pick-walls) is
        // this panel's own state; the boundary constraint is global.
        return local === 'linear' || local === 'ortho' || local === 'curved'
            ? resolveActiveSlabDrawMode()
            : local;
    }

    setActiveMode(mode: SlabPickerMode): void {
        this._picker.setActiveMode(mode);
        setActiveSlabDrawMode(mode); // no-op for non-boundary modes
    }

    show(callbacks: SlabModePickerCallbacks): void {
        this._picker.show({
            header: { title: 'Slab', sub: 'Select drawing mode' },
            hint: 'Continuous creation · ESC to finish',
            modes: this._modes(callbacks),
        });
    }

    /**
     * Every action is wrapped so the shared mode store is written BEFORE the tool
     * activates — the handler's first `resolveActiveSlabDrawMode()` must already
     * see the mode the user just clicked.
     */
    private _modes(callbacks: SlabModePickerCallbacks) {
        const withMode = (mode: SlabPickerMode, action: () => void) => () => {
            setActiveSlabDrawMode(mode);
            action();
        };
        return [
            // ── The wall modes, first, keyed and iconed exactly as the wall tool ──
            { key: 'L', label: 'Linear',     sub: 'Freeform polygon',           svg: wallLinear,          modeId: 'linear'    as SlabPickerMode, action: withMode('linear', callbacks.onLinear)    },
            { key: 'O', label: 'Orthogonal', sub: '90° constrained',            svg: wallOrtho,           modeId: 'ortho'     as SlabPickerMode, action: withMode('ortho',  callbacks.onOrtho)     },
            { key: 'C', label: 'Curved',     sub: 'Arc segments',               svg: wallCurved,          modeId: 'curved'    as SlabPickerMode, action: withMode('curved', callbacks.onCurved)    },
            // ── Slab-specific modes, unchanged ───────────────────────────────────
            { key: '2', label: '2-Point',    sub: 'Rectangle by two corners',   svg: build2PointSVG(),    modeId: '2point'    as SlabPickerMode, action: callbacks.on2Point    },
            { key: 'R', label: 'By Region',  sub: 'Auto-detect enclosed walls', svg: buildRegionSVG(),    modeId: 'region'    as SlabPickerMode, action: callbacks.onRegion    },
            { key: 'H', label: 'Hollow',     sub: 'Rectangle with an opening',  svg: buildHollowSVG(),    modeId: 'hollow'    as SlabPickerMode, action: callbacks.onHollow    },
            { key: 'W', label: 'Pick Walls', sub: 'Associative from walls',     svg: buildPickWallsSVG(), modeId: 'pickWalls' as SlabPickerMode, action: callbacks.onPickWalls },
        ];
    }

    dismiss(): void { this._picker.dismiss(); }

    isVisible(): boolean { return this._picker.isVisible(); }
}

// ─── Diagrammatic plan-view slab SVG icons ────────────────────────────────────
// Each icon is a top-down floor-plan view showing how the slab boundary is defined.
// The linear / ortho / curved icons are NOT redefined here — they are imported
// from PryzmIcons, the same three glyphs the wall picker shows, so the two panels
// are recognisably the same control.

/** 2-Point — rectangle defined by two corner points, with dot markers at corners */
function build2PointSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="8" y="8" width="48" height="32" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="8"  cy="8"  r="3.5" fill="currentColor"/>
  <circle cx="56" cy="40" r="3.5" fill="currentColor"/>
  <line x1="8" y1="8" x2="56" y2="40" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
</svg>`;
}

/** By Region — closed wall boundary with a floor-fill indicator (dot in centre) */
function buildRegionSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="8" y="8" width="48" height="32" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="5 3"/>
  <circle cx="32" cy="24" r="5" fill="currentColor" opacity="0.85"/>
  <circle cx="32" cy="24" r="9" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
</svg>`;
}

/** Hollow — rectangle with a rectangular hole in the centre */
function buildHollowSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="5"  y="5"  width="54" height="38" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="18" y="16" width="28" height="16" stroke="currentColor" stroke-width="2"   stroke-linejoin="round" stroke-dasharray="4 2"/>
  <circle cx="5"  cy="5"  r="2.5" fill="currentColor"/>
  <circle cx="59" cy="43" r="2.5" fill="currentColor"/>
  <circle cx="18" cy="16" r="2"   fill="currentColor"/>
  <circle cx="46" cy="32" r="2"   fill="currentColor"/>
</svg>`;
}

/** Pick Walls — two wall segments (double lines) forming an L, with slab fill implied */
function buildPickWallsSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <line x1="8"  y1="6"  x2="8"  y2="42" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="18" y1="6"  x2="18" y2="42" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="8"  y1="42" x2="56" y2="42" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="8"  y1="32" x2="56" y2="32" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
  <rect x="18" y="6" width="38" height="26" fill="currentColor" opacity="0.1"/>
  <circle cx="38" cy="20" r="3" fill="currentColor" opacity="0.6"/>
</svg>`;
}
