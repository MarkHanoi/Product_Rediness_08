/**
 * FloorModePicker — In-viewport HUD for floor finish system type + drawing mode selection.
 *
 * Contract: docs/02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md §3
 *           docs/02-decisions/contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md §2.1, §7.1, §7.8
 *           docs/02-decisions/contracts/26-PLAN-VIEW-ELEMENT-CREATION-PARITY-CONTRACT.md
 *
 * Five modes:
 *   • Linear     — freeform straight segments, no axis snap
 *   • Orthogonal — 90°-constrained polygon (the WALL tool's constraint, verbatim)
 *   • Curved     — vertex → arc midpoint → arc end, tessellated into the boundary
 *   • Rectangle  — 2-point axis-aligned rectangle
 *   • Auto       — click inside a room to use the room boundary
 *
 * §FEAT-SLAB-DRAW-MODES (2026-08-06) — this file used to be a 234-line copy of
 * `WallModePicker`'s DOM. The panel is now `DrawModePicker`, the ONE panel shared
 * with `SlabModePicker` and `CeilingModePicker`; this file is the floor's
 * CONFIGURATION of it. Its exported surface (`FloorPickerMode`, `FloorTypeOption`,
 * `FloorModePickerCallbacks`, the class and its `getActiveMode`/`setActiveMode`/
 * `show`/`dismiss`/`isVisible`) is unchanged, so every call site is untouched.
 *
 * The first three mode ids are `BoundaryDrawMode` from `@pryzm/geometry-slab` —
 * the same type the `FloorPlanToolHandler` and the 3D `FloorTool` consume — so
 * the panel and the tool can no longer disagree about what "ortho" means.
 *
 * Prefix: fmp- (styles unchanged).
 */

import { DrawModePicker } from './DrawModePicker';
import { wallLinear, wallOrtho, wallCurved } from './icons/PryzmIcons';
import type { BoundaryDrawMode } from '@pryzm/geometry-slab';

// §FEAT-PLATE-SHAPE-MODES (founder, 2026-08-19) — 'circular' and 'elliptical'
// join the closed-loop gesture family. ⚠ 'rectangle' keeps its HISTORIC id
// (the shared vocabulary spells it 'rectangular'); renaming it would touch
// ~30 call sites and is reconciled under L-1322, not here.
export type FloorPickerMode =
    | BoundaryDrawMode | 'rectangle' | 'circular' | 'elliptical' | 'auto';

export interface FloorTypeOption {
    id: string;
    name: string;
    totalThickness: number;
    category?: string;
}

export interface FloorModePickerCallbacks {
    floorTypes: FloorTypeOption[];
    currentTypeId?: string;
    onTypeChange: (id: string | undefined) => void;
    onSelectLinear:    () => void;
    onSelectOrtho:     () => void;
    onSelectCurved:    () => void;
    onSelectRectangle: () => void;
    onSelectCircular:  () => void;
    onSelectElliptical:() => void;
    onSelectAutoRoom:  () => void;
}

export class FloorModePicker {
    private readonly _picker: DrawModePicker<FloorPickerMode>;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._picker = new DrawModePicker<FloorPickerMode>('fmp', 'FloorModePicker', 'linear', false, runtime);
    }

    /** Read by FloorPlanToolHandler on every mousemove. */
    getActiveMode(): FloorPickerMode { return this._picker.getActiveMode(); }

    /** Programmatically sets the active mode (used by FloorDrawingHUD switches). */
    setActiveMode(mode: FloorPickerMode): void { this._picker.setActiveMode(mode); }

    show(callbacks: FloorModePickerCallbacks): void {
        this._picker.show({
            header: { title: 'New Floor', sub: 'Default Floor + Apply' },
            hint: 'Continuous creation · ESC to finish',
            typeRow: {
                label: 'Floor Type',
                noneLabel: '— Default Floor —',
                options: callbacks.floorTypes,
                currentId: callbacks.currentTypeId,
                onChange: callbacks.onTypeChange,
            },
            modes: [
                { key: 'L', label: 'Linear',     sub: 'Freeform polygon',    svg: wallLinear,          modeId: 'linear',    action: callbacks.onSelectLinear    },
                { key: 'O', label: 'Orthogonal', sub: '90° constrained',     svg: wallOrtho,           modeId: 'ortho',     action: callbacks.onSelectOrtho     },
                { key: 'C', label: 'Curved',     sub: 'Arc segments',        svg: wallCurved,          modeId: 'curved',    action: callbacks.onSelectCurved    },
                { key: 'R', label: 'Rectangle',  sub: '2-point box',         svg: buildRectangleSVG(), modeId: 'rectangle', action: callbacks.onSelectRectangle },
                { key: 'I', label: 'Circular',   sub: 'Centre + rim',        svg: buildCircularSVG(),   modeId: 'circular',   action: callbacks.onSelectCircular   },
                { key: 'E', label: 'Elliptical', sub: 'Centre + corner',     svg: buildEllipticalSVG(), modeId: 'elliptical', action: callbacks.onSelectElliptical },
                { key: 'A', label: 'Auto',       sub: 'Click inside a room', svg: buildAutoRoomSVG(),  modeId: 'auto',      action: callbacks.onSelectAutoRoom  },
            ],
        });
    }

    dismiss(): void { this._picker.dismiss(); }

    isVisible(): boolean { return this._picker.isVisible(); }
}

// ─── Mode-specific plan-view diagram SVG icons ────────────────────────────────
// Linear / Ortho / Curved come from PryzmIcons — the SAME glyphs the wall picker
// shows. Only the floor-specific modes need their own diagram.

/** Rectangle — 2-point axis-aligned box with corner handles */
function buildRectangleSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="10" y="10" width="44" height="28" rx="1.5"
        stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.10"/>
  <circle cx="10" cy="10" r="3" fill="currentColor"/>
  <circle cx="54" cy="38" r="3" fill="currentColor"/>
  <line x1="10" y1="10" x2="54" y2="38" stroke="currentColor" stroke-width="0.8" opacity="0.35" stroke-dasharray="3 2"/>
</svg>`;
}

/** Auto from Room — room boundary with auto-fill indication */
function buildAutoRoomSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="8" y="8" width="48" height="32" rx="2"
        stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.06"/>
  <rect x="14" y="14" width="36" height="20" rx="1"
        stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"
        fill="currentColor" fill-opacity="0.14"/>
  <circle cx="32" cy="24" r="3.5" fill="currentColor" opacity="0.7"/>
  <line x1="32" y1="17" x2="32" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="32" y1="31" x2="32" y2="34" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="25" y1="24" x2="22" y2="24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="39" y1="24" x2="42" y2="24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
}

/** Circular — centre + rim, the 2-click circle (§FEAT-PLATE-SHAPE-MODES) */
function buildCircularSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="32" cy="24" r="16" stroke="currentColor" stroke-width="2.5"
          fill="currentColor" fill-opacity="0.10"/>
  <circle cx="32" cy="24" r="3" fill="currentColor"/>
  <circle cx="48" cy="24" r="3" fill="currentColor"/>
  <line x1="32" y1="24" x2="48" y2="24" stroke="currentColor" stroke-width="0.8"
        opacity="0.45" stroke-dasharray="3 2"/>
</svg>`;
}

/** Elliptical — centre + bounding corner. ⭐ The founder wrote "eclipse"; the
 *  reading is ELLIPSE and the label says so, so a wrong reading costs one word. */
function buildEllipticalSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="32" cy="24" rx="22" ry="13" stroke="currentColor" stroke-width="2.5"
           fill="currentColor" fill-opacity="0.10"/>
  <circle cx="32" cy="24" r="3" fill="currentColor"/>
  <circle cx="54" cy="37" r="3" fill="currentColor"/>
  <line x1="32" y1="24" x2="54" y2="37" stroke="currentColor" stroke-width="0.8"
        opacity="0.45" stroke-dasharray="3 2"/>
</svg>`;
}
