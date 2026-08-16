import type { StairShapeChoice } from '@pryzm/geometry-stair';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { WallDrawingMode } from '@pryzm/geometry-wall';
import { WallModePicker, type WallPickerMode } from '../WallModePicker';
import { CurtainWallModePicker, type CurtainWallPickerMode } from '../CurtainWallModePicker';
import { CurtainWallDrawingHUD } from '../CurtainWallDrawingHUD';
import { DoorModePicker } from '../DoorModePicker';
import { WindowModePicker } from '../WindowModePicker';
import { CeilingModePicker } from '../CeilingModePicker';
import { FloorModePicker } from '../FloorModePicker';
import { FloorDrawingHUD } from '../FloorDrawingHUD';
import { CeilingDrawingHUD } from '../CeilingDrawingHUD';
import { WallDrawingHUD } from '../WallDrawingHUD';
// §FEAT-PERSISTENT-MODE-BAR (founder 2026-08-07) — the ONE in-draw mode bar, and the
// slab's declared mode list + shared mode store that drive it.
import { DrawingModeBar } from '../DrawingModeBar';
import { creationModes } from '@app/engine/views/plantools/elementCreationMatrix';
import {
    setActiveSlabDrawMode,
    resolveActiveSlabDrawMode,
} from '@app/engine/views/plantools/activeSlabDrawMode';
import { isBoundaryDrawMode } from '@pryzm/geometry-slab';
import type { FloorPickerMode } from '../FloorModePicker';
import type { CeilingPickerMode } from '../CeilingModePicker';
import type { UIProps } from '../Layout';
import type { BimService } from '@app/engine/BimService';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export interface PickerInstances {
    wallModePicker: WallModePicker;
    curtainWallModePicker: CurtainWallModePicker;
    doorModePicker: DoorModePicker;
    windowModePicker: WindowModePicker;
    ceilingModePicker: CeilingModePicker;
    floorModePicker: FloorModePicker;
}

// ── Exported helpers — consumed by CreatePanelLayout for ceiling/floor actions ──
export type FloorToolMode   = 'LINEAR' | 'ORTHO' | 'ARC' | 'RECTANGLE' | 'AUTO_FROM_ROOM';
export type CeilingToolMode = FloorToolMode;

export function floorPickerToToolMode(m: FloorPickerMode): FloorToolMode {
    switch (m) {
        case 'ortho':     return 'ORTHO';
        case 'curved':    return 'ARC';
        case 'rectangle': return 'RECTANGLE';
        case 'auto':      return 'AUTO_FROM_ROOM';
        default:          return 'LINEAR';
    }
}
export function ceilingPickerToToolMode(m: CeilingPickerMode): CeilingToolMode {
    return floorPickerToToolMode(m as unknown as FloorPickerMode);
}

/**
 * §FIX-AUTO-MODE-DROPPED-AT-ACTIVATION (L-918) — the guard that comes WITH letting
 * a caller-supplied mode string through.
 *
 * Before L-918 the floor / ceiling activators accepted no mode at all, so the only
 * value that ever reached the picker was the hard-coded `'auto'` of the `:auto`
 * pseudo-families. Forwarding `runtime.tools.activate(family, mode)` widens that to
 * ANY string, and `setActiveMode` stores whatever it is handed — an unrecognised
 * mode would be silently retained and every plan handler comparison would miss,
 * dropping the tool into its linear/ortho fallback. That is the same silent-wrong
 * shape this fix exists to remove, so it is REFUSED, loudly, with identity and both
 * values: what was asked for, and what the tool is actually left in.
 *
 * The authority is `elementCreationMatrix` — the declared capability table the
 * `DrawingModeBar` is already driven from — never a second hand-maintained list.
 */
export function isDeclaredCreationMode(tool: 'floor' | 'ceiling', mode: string): boolean {
    return creationModes(tool).some(m => m.id === mode);
}

export function mountToolsArea(
    props: UIProps,
    service: BimService,
    runtime: PryzmRuntime | null,
): PickerInstances {
    // Phase B.2 (S73-WIRE) — `runtime` threaded into every per-family mode
    // picker / drawing HUD constructor.  Today the constructors ignore it
    // (Phase B.5–B.13 widening); the wire is added here so the orchestrator
    // is already passing it down once each panel's sub-phase lands.
    const wallModePicker   = new WallModePicker();
    window.wallModePicker = wallModePicker; // Sprint 2 Phase 5: exposed for plan view tool handlers // TODO(E.1.T): legacy wallModePicker — replace with runtime.tools.activate('wall', mode)
    const curtainWallModePicker = new CurtainWallModePicker();
    window.curtainWallModePicker = curtainWallModePicker; // CW-1: exposed for CurtainWallPlanToolHandler // TODO(E.5.T): legacy curtainWallModePicker — replace with runtime.tools.activate('curtain-wall', mode)
    const curtainWallDrawingHUD = new CurtainWallDrawingHUD();
    const doorModePicker   = new DoorModePicker();
    const windowModePicker = new WindowModePicker();
    const ceilingModePicker = new CeilingModePicker();
    const floorModePicker   = new FloorModePicker();

    // ── Phase E (S78-WIRE) — register real tool activators with runtime.tools ──
    //
    // Each activator is a closure over `service` and `props.toolManager`.
    // Window-global tools (ceilingTool, floorTool, roomTool, …) are read AT
    // CALL TIME — not at registration time — so they are safely registered here
    // before the engine has booted.  The engine sets window.xxxTool
    // during initTools(); by the time a user can click a button, the engine is
    // already running and the window globals are populated.
    //
    // DELETE individual entries as their src/elements/<family>/ counterparts
    // are deleted in Phase E sub-phase landings (E.1–E.17).
    if (runtime?.tools?.register) {
        const tm = props.toolManager;
        runtime.tools.register('wall',          (m?) => service.activateWallTool((m as WallDrawingMode) ?? WallDrawingMode.POLYLINE_ORTHO));
        runtime.tools.register('curtain-wall',  (m?) => tm.activateCurtainWall?.(m ?? 'SINGLE'));
        runtime.tools.register('door',          (m?) => tm.activateDoor?.(m ?? 'single'));
        runtime.tools.register('window',        (m?) => tm.activateWindow?.(m ?? 'single'));
        runtime.tools.register('stair',         (m?) => service.activateStairPathTool((m as StairShapeChoice) ?? 'I'));
        runtime.tools.register('handrail',      (m?) => service.activateHandrailTool(m));
        runtime.tools.register('ramp',          ()   => { const t = window.rampTool; if (t) t.activate?.(); else console.warn('[runtime.tools/ramp] rampTool not ready'); }); // TODO(E.6): legacy window.rampTool bridge — delete when plugins/ramp lands per §16.5
        // §FIX-AUTO-MODE-DROPPED-AT-ACTIVATION (L-918, founder 2026-08-15) — these two
        // activators were declared `() => service.activateX()`. Nineteen of the
        // twenty-one families below forward the mode as `(m?) => …`; FLOOR and
        // CEILING were the only multi-mode creation families that SWALLOWED it, so
        // `runtime.tools.activate('floor', 'auto')` activated the tool and threw the
        // mode away. Measured before the fix: the picker the plan handler reads was
        // left at 'linear' for floor(auto), ceiling(auto), floor(rectangle) and
        // ceiling(rectangle) alike — the founder's "Auto is unreachable in plan
        // view", because a plan click then took the vertex-add branch instead of
        // AUTO-from-room. Pinned by `plantools/__tests__/planAutoModeReachability.spec.ts`.
        runtime.tools.register('ceiling',       (m?) => service.activateCeilingTool(undefined, m));
        // §FIX-FINISH-MODE-PLAN-UNREACHABLE (founder 2026-08-06) — the AUTO
        // activators used to set the mode on `window.<x>Tool` (the 3D tool
        // INSTANCE) only, which the PLAN handler cannot read: AUTO worked in 3D
        // and was silently inert in plan view. The mode now goes through the ONE
        // activation argument, which writes the 3D tool AND the picker.
        //
        // The `:auto` pseudo-families are RETAINED, not folded away: `CreateRailPanel`
        // and any other caller that names them keeps working unchanged, and they were
        // the CONTROL that proved the activation argument itself was sound (they were
        // the two cases measuring GREEN while every mode-carrying call measured RED).
        // They are now expressed as the generic activator with the mode bound, so
        // there is one applying path and not two.
        runtime.tools.register('ceiling:auto',  ()   => service.activateCeilingTool(undefined, 'auto'));
        runtime.tools.register('floor',         (m?) => service.activateFloorTool(undefined, m));
        runtime.tools.register('floor:auto',    ()   => service.activateFloorTool(undefined, 'auto'));
        runtime.tools.register('room',          ()   => { const t = window.roomTool; if (t) t.activate?.(); else tm.activateRoom?.(); }); // TODO(E.16): legacy window.roomTool bridge — delete when plugins/room lands per §16.5
        runtime.tools.register('room:level',    ()   => {
            const t     = window.roomTool; // TODO(E.16): legacy window.roomTool bridge — delete when plugins/room lands per §16.5
            const level = props.bimManager?.getActiveLevel?.();
            if (t && level) t.detectRoomsForLevel?.(level.id, level.elevation ?? 0, level.height ?? 3);
            else if (t)     t.activate?.();
        });
        runtime.tools.register('room-bounding', ()   => {
            const t = window.roomBoundingLineTool; // TODO(E.16): legacy window.roomBoundingLineTool bridge — delete when plugins/room lands per §16.5
            if (t) { t.activate?.(); console.log('[runtime.tools/room-bounding] activated'); }
            else     console.warn('[runtime.tools/room-bounding] roomBoundingLineTool not ready');
        });
        runtime.tools.register('column',        (m?) => { try { tm.activateColumn?.(m ? JSON.parse(m) : {}); } catch { tm.activateColumn?.({}); } });
        runtime.tools.register('beam',          (m?) => { try { tm.activateBeam?.(m ? JSON.parse(m) : {}); }   catch { tm.activateBeam?.({}); } });
        runtime.tools.register('slab',          (m?) => service.activateSlabTool((m as any) ?? '2point'));
        runtime.tools.register('roof',          (m?) => service.activateRoofTool((m as any) ?? '2point'));
        runtime.tools.register('opening',       (m?) => tm.activateOpeningTool?.(m ?? '2point'));
        runtime.tools.register('plumbing',      (m?) => service.activatePlumbingTool((m as any) ?? 'toilet'));
        console.log('[Layout] Phase E (S78-WIRE) — 21 tool activators registered with runtime.tools');
    }
    // Sprint §49: expose pickers so plan-view tool handlers can read the
    // active drawing mode on every mousemove (mirrors wallModePicker pattern).
    window.floorModePicker   = floorModePicker; // TODO(E.6.T): legacy floorModePicker — replace with runtime.tools.activate('floor', mode)
    window.ceilingModePicker = ceilingModePicker; // TODO(E.7.T): legacy ceilingModePicker — replace with runtime.tools.activate('ceiling', mode)
    const floorDrawingHUD   = new FloorDrawingHUD();
    const ceilingDrawingHUD = new CeilingDrawingHUD();
    // §FEAT-PERSISTENT-MODE-BAR — the slab's in-draw mode bar (the wall's control,
    // shared component, slab's own declared modes).
    const slabDrawingBar    = new DrawingModeBar();
    const wallDrawingHUD   = new WallDrawingHUD();

    // ── By Slab helper — shared by WallModePicker (legacy) and WallDrawingHUD ─
    // _bySlabCapture holds the selected object at the moment the wall tool was
    // activated. ToolManager.activateTool() disables SelectionManager immediately,
    // so by the time the user clicks the S button the live selection is already
    // cleared. We snapshot it here and use it in _execWallBySlab instead.
    let _bySlabCapture: any = null;

    const _execWallBySlab = () => {
        // Prefer the pre-activation snapshot; fall back to live selection.
        // elementType comparison is case-insensitive: SlabFragmentBuilder writes 'Slab'
        // (capital S) but callers historically checked against lowercase 'slab'.
        const sel    = _bySlabCapture ?? props.selectionManager?.selectedObject;
        const slabId = sel?.userData?.id as string | undefined;
        const elType = (sel?.userData?.elementType as string | undefined)?.toLowerCase();

        if (slabId && elType === 'slab') {
            // ── Pre-selection path: slab known, execute immediately ───────────
            // P6 fix (Wave 14 FILE 3): route through runtime.commandBus.dispatch
            // instead of legacy commandManager.execute().
            // F-1.4: bus-primary dispatch (wall.create-on-all-slabs registered, doc-33 P0).
            (window.runtime?.bus as any)?.executeCommand('wall.create-on-all-slabs', { slabId })
                .catch((e: unknown) => console.error('[ToolsAreaLayout] wall.create-on-all-slabs failed:', e)); // §E.5.x: commandManager fallback removed
            // Deactivate the wall drawing tool — creation session is complete.
            props.wallTool?.deactivate?.();
            return;
        }

        // ── No pre-selection: enter pick-a-slab mode ──────────────────────────
        // Deactivate the wall drawing tool so SelectionManager is re-enabled and
        // the user can click a slab in the scene.
        props.wallTool?.deactivate?.();

        // Show a non-blocking status overlay (pointer-events: none, so it doesn't
        // interfere with scene clicks).
        const overlay = document.createElement('div');
        overlay.className = 'bsp-overlay';
        overlay.innerHTML = `
            <span class="bsp-icon">&#9699;</span>
            <span class="bsp-msg">Click a slab in the scene to create walls from its perimeter</span>
            <span class="bsp-esc">ESC to cancel</span>
        `;
        document.body.appendChild(overlay);

        let _done = false;
        let _unsubSelectionChanged: (() => void) | null = null; // F.events.16
        const _cleanup = () => {
            if (_done) return;
            _done = true;
            overlay.remove();
            _unsubSelectionChanged?.(); _unsubSelectionChanged = null; // F.events.16
            window.removeEventListener('keydown', _onEsc, { capture: true } as AddEventListenerOptions);
        };

        const _onSelectionChanged = () => {
            const picked   = props.selectionManager?.selectedObject;
            const pickedId  = picked?.userData?.id as string | undefined;
            const pickedTyp = (picked?.userData?.elementType as string | undefined)?.toLowerCase();
            if (!pickedId || pickedTyp !== 'slab') return;
            // P6 fix (Wave 14 FILE 3): route through runtime.commandBus.dispatch
            // F-1.4: bus-primary dispatch (wall.create-on-all-slabs registered, doc-33 P0).
            (window.runtime?.bus as any)?.executeCommand('wall.create-on-all-slabs', { slabId: pickedId })
                .catch((e: unknown) => console.error('[ToolsAreaLayout] wall.create-on-all-slabs (pick) failed:', e)); // §E.5.x: commandManager fallback removed
            _cleanup();
        };

        const _onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                _cleanup();
            }
        };

        // F.events.16 — bim-selection-changed migrated to runtime.events typed bus.
        _unsubSelectionChanged = window.runtime?.events?.on('bim-selection-changed', () => _onSelectionChanged()) ?? null;
        // Capture phase so ESC is caught before other handlers dismiss the overlay
        window.addEventListener('keydown', _onEsc, { capture: true });
    };

    /** Map 3D WallDrawingMode enum → WallPickerMode string read by plan-view handlers. */
    const _drawingModeToPickerMode = (m: WallDrawingMode): WallPickerMode => {
        if (m === WallDrawingMode.POLYLINE_ORTHO) return 'ortho';
        if (m === WallDrawingMode.POLYLINE_ARC)   return 'curved';
        return 'linear';
    };

    const _origActivateWall = service.activateWallTool.bind(service);
    service.activateWallTool = (mode: WallDrawingMode) => {
        wallModePicker.dismiss();

        // ── Sync wallModePicker._lastMode so plan-view WallPlanToolHandler reads the
        // correct mode from window.wallModePicker.getActiveMode() on every mousemove. ──
        wallModePicker.setActiveMode(_drawingModeToPickerMode(mode));

        // Snapshot the current selection BEFORE activating the tool.
        // ToolManager.activateTool() calls selectionManager.setEnabled(false)
        // which clears selectedObject, so we must capture it now.
        _bySlabCapture = props.selectionManager?.selectedObject ?? null;

        if (wallDrawingHUD.isVisible()) {
            // ── Mid-drawing mode switch — preserve polyline continuity ─────────
            // Use switchWallDrawingMode() so the last segment end-point becomes
            // the start of the next segment, giving true polyline behaviour.
            // Do NOT re-call _origActivateWall() here — that calls cancel() and
            // would clear startPoint / firstPoint / pathBuilder state.
            service.switchWallDrawingMode(mode);
            wallDrawingHUD.setMode(mode);
            // Show the type selector each time the user picks a mode so they can
            // change the wall type for the next segment.
            props.inspector.showWallPreDraw?.(props.wallTool);
        } else {
            // ── Fresh activation ───────────────────────────────────────────────
            _origActivateWall(mode);
            // Defer panel rebuild to the next frame so the HUD status prompt
            // ("Click to set start point") has first-paint priority and the
            // wall tool feels instantaneous even on slower machines.
            // D.7.5 batch #4: routed through getFrameScheduler() instead of raw rAF.
            getFrameScheduler().scheduleOnce('layout-wall-tool-pre-draw', () => {
                props.inspector.showWallPreDraw?.(props.wallTool);
            });

            wallDrawingHUD.show(mode, {
                onSwitchLinear:  () => service.activateWallTool(WallDrawingMode.POLYLINE),
                onSwitchOrtho:   () => service.activateWallTool(WallDrawingMode.POLYLINE_ORTHO),
                onSwitchCurved:  () => service.activateWallTool(WallDrawingMode.POLYLINE_ARC),
                onSelectBySlab:  _execWallBySlab,
            });

            // ── ESC — dismiss HUD when drawing ends ───────────────────────────
            const escHandler = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    props.inspector.hide?.();
                    wallDrawingHUD.dismiss();
                    window.removeEventListener('keydown', escHandler);
                }
            };
            window.addEventListener('keydown', escHandler);
        }
    };

    // ─── Dismiss HUDs when tools deactivate (any path) ───────────────────────
    window.addEventListener('tool:deactivated', (e: Event) => {
        const toolName = (e as CustomEvent<string>).detail;
        if (toolName === 'wall') {
            wallDrawingHUD.dismiss();
            _bySlabCapture = null; // Release snapshot so next session starts clean
        }
        if (toolName === 'curtain-wall' || toolName === 'curtainWall') {
            curtainWallDrawingHUD.dismiss();
        }
        if (toolName === 'floor')   floorDrawingHUD.dismiss();
        if (toolName === 'ceiling') ceilingDrawingHUD.dismiss();
        // §FEAT-PERSISTENT-MODE-BAR — the slab bar lives for the whole session and
        // is torn down only when the tool itself deactivates (ESC / tool switch).
        if (toolName === 'slab')    slabDrawingBar.dismiss();
        if (toolName === 'door')   doorModePicker.dismiss();
        if (toolName === 'window') windowModePicker.dismiss();
    });

    // ─── Slab activation wrapper — §FEAT-PERSISTENT-MODE-BAR (founder 2026-08-07)
    //
    // "The slab creation works great — but the UI/UX is not as expected. I would
    //  like EXACTLY THE SAME PANEL as the wall. I want the user, DURING CREATION,
    //  to be able to change from linear to curved to ortho etc."
    //
    // The slab had no in-draw bar at all: its only mode control was a PRE-FLIGHT
    // launcher menu whose buttons call `activateSlabTool`, which routes through
    // `ToolManager.activateTool` → `deactivateAllInternal()` and DESTROYS the
    // in-progress polyline. Switching mode meant starting the slab over.
    //
    // The bar below is the wall's control, from the same component and the same
    // `.wdh-*` styles, driven by the slab's own seven declared modes.
    // ─── Floor activation wrapper — show FloorDrawingHUD (Sprint §49) ────────
    const _origActivateFloor = service.activateFloorTool.bind(service);
    service.activateFloorTool = (typeId?: string, mode?: string) => {
        floorModePicker.dismiss();
        _origActivateFloor(typeId);

        const tool = window.floorTool; // TODO(E.6.T): legacy floorTool — replace with runtime.tools.activate('floor')

        const _switchFloor = (m: FloorPickerMode) => {
            tool?.setDrawingMode?.(floorPickerToToolMode(m));
            floorModePicker.setActiveMode(m);
            floorDrawingHUD.setMode(m);
        };

        // §FIX-FINISH-MODE-PLAN-UNREACHABLE (founder 2026-08-06) — THE ONE PLACE a
        // requested drawing mode is applied, and it writes BOTH surfaces: the 3D
        // tool (`setDrawingMode`) AND the picker the PLAN handler reads
        // (`setActiveMode`). "Auto Floor" used to write only the former, so AUTO
        // was reachable in 3D and silently inert in plan view — the founder's
        // "floor finish cannot be created in plan view". Any entry point that
        // wants a mode now passes it here rather than reaching into the 3D tool.
        //
        // §FIX-AUTO-MODE-DROPPED-AT-ACTIVATION (L-918) — since 'floor' now forwards
        // an arbitrary caller string, an UNDECLARED mode is refused here instead of
        // being stored and silently missing every handler comparison.
        if (mode) {
            if (isDeclaredCreationMode('floor', mode)) _switchFloor(mode as FloorPickerMode);
            else console.warn(
                `[ToolsAreaLayout] REFUSED floor activation mode "${mode}" — not declared in `
                + `elementCreationMatrix('floor'); declared modes are `
                + `[${creationModes('floor').map(m => m.id).join(', ')}]. `
                + `Mode NOT applied; the floor tool stays in "${floorModePicker.getActiveMode()}".`,
            );
        }

        const initialMode: FloorPickerMode = floorModePicker.getActiveMode();

        if (floorDrawingHUD.isVisible?.()) {
            floorDrawingHUD.setMode(initialMode);
        } else {
            floorDrawingHUD.show(initialMode, {
                onSwitchLinear:    () => _switchFloor('linear'),
                onSwitchOrtho:     () => _switchFloor('ortho'),
                onSwitchCurved:    () => _switchFloor('curved'),
                onSwitchRectangle: () => _switchFloor('rectangle'),
                onSwitchAuto:      () => _switchFloor('auto'),
            });
        }
    };

    // ─── Ceiling activation wrapper — show CeilingDrawingHUD (Sprint §49) ────
    const _origActivateCeiling = service.activateCeilingTool.bind(service);
    service.activateCeilingTool = (typeId?: string, mode?: string) => {
        ceilingModePicker.dismiss();
        _origActivateCeiling(typeId);

        const tool = window.ceilingTool; // TODO(E.7.T): legacy ceilingTool — replace with runtime.tools.activate('ceiling')

        const _switchCeiling = (m: CeilingPickerMode) => {
            tool?.setDrawingMode?.(ceilingPickerToToolMode(m));
            ceilingModePicker.setActiveMode(m);
            ceilingDrawingHUD.setMode(m);
        };

        // §FIX-FINISH-MODE-PLAN-UNREACHABLE — see the floor wrapper above. Applies
        // the requested mode to the 3D tool AND the picker the plan handler reads.
        // §FIX-AUTO-MODE-DROPPED-AT-ACTIVATION (L-918) — same refusal as floor.
        if (mode) {
            if (isDeclaredCreationMode('ceiling', mode)) _switchCeiling(mode as CeilingPickerMode);
            else console.warn(
                `[ToolsAreaLayout] REFUSED ceiling activation mode "${mode}" — not declared in `
                + `elementCreationMatrix('ceiling'); declared modes are `
                + `[${creationModes('ceiling').map(m => m.id).join(', ')}]. `
                + `Mode NOT applied; the ceiling tool stays in "${ceilingModePicker.getActiveMode()}".`,
            );
        }

        const initialMode: CeilingPickerMode = ceilingModePicker.getActiveMode();

        if (ceilingDrawingHUD.isVisible?.()) {
            ceilingDrawingHUD.setMode(initialMode);
        } else {
            ceilingDrawingHUD.show(initialMode, {
                onSwitchLinear:    () => _switchCeiling('linear'),
                onSwitchOrtho:     () => _switchCeiling('ortho'),
                onSwitchCurved:    () => _switchCeiling('curved'),
                onSwitchRectangle: () => _switchCeiling('rectangle'),
                onSwitchAuto:      () => _switchCeiling('auto'),
            });
        }
    };

    // ─── Slab Pre-Draw in Property Panel + §FEAT-PERSISTENT-MODE-BAR ─────────
    //
    // "The slab creation works great — but the UI/UX is not as expected. I would
    //  like EXACTLY THE SAME PANEL as the wall. I want the user, DURING CREATION,
    //  to be able to change from linear to curved to ortho etc." (founder 2026-08-07)
    //
    // The slab had no in-draw mode control at all: its only one was a PRE-FLIGHT
    // launcher menu whose every entry called `activateSlabTool`, which routes through
    // `ToolManager.activateTool` → `deactivateAllInternal()` and DESTROYS the
    // in-progress polyline. Switching mode meant starting the slab over. The bar below
    // is the WALL's control — same `DrawingModeBar` component, same `.wdh-*` styles —
    // driven by the slab's own seven declared modes.
    const _origActivateSlab = service.activateSlabTool.bind(service);
    service.activateSlabTool = (mode?: Parameters<BimService['activateSlabTool']>[0]) => {
        _origActivateSlab(mode as never);
        if (isBoundaryDrawMode(mode)) setActiveSlabDrawMode(mode);
        props.inspector.showSlabPreDraw?.(props.slabTool);

        if (slabDrawingBar.isVisible()) {
            slabDrawingBar.setMode(resolveActiveSlabDrawMode());
        } else {
            slabDrawingBar.show({
                label: 'Slab:',
                modes: creationModes('slab'),
                initialMode: resolveActiveSlabDrawMode(),
                onSelect: (id) => {
                    if (isBoundaryDrawMode(id)) {
                        // THE POINT OF THE WHOLE CHANGE: linear/ortho/curved are polyline
                        // SUB-modes, so a switch writes ONLY the shared store. Both slab
                        // surfaces re-read it on the next interaction, so the new mode
                        // applies to the very next click and the vertices already placed
                        // SURVIVE. Never call activateSlabTool here.
                        setActiveSlabDrawMode(id);
                        return;
                    }
                    // A slab-specific FAMILY mode (2-Point / By Region / Hollow / Pick
                    // Walls) is a different GESTURE, not a constraint on the same one, so
                    // it legitimately re-enters the tool — a half-drawn polyline cannot
                    // continue as a rectangle. This is the one sanctioned reset.
                    _origActivateSlab(id as never);
                    slabDrawingBar.setMode(resolveActiveSlabDrawMode());
                },
            });
        }

        const escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                props.inspector.hide?.();
                slabDrawingBar.dismiss();
                window.removeEventListener('keydown', escHandler);
            }
        };
        window.addEventListener('keydown', escHandler);
    };

    if (props.toolManager?.activateDoor) {
        const _origActivateDoor = props.toolManager.activateDoor.bind(props.toolManager);
        props.toolManager.activateDoor = async (type: 'single' | 'double' = 'single', systemTypeId?: string) => {
            const doorTool = props.toolManager.doorTool ?? window.doorTool; // TODO(E.3.T): legacy doorTool — replace with runtime.tools.activate('door')

            if (doorModePicker.isVisible()) {
                if (doorTool) doorTool.doorType = type;
                doorModePicker.setMode(type);
                props.inspector.showDoorPreDraw?.(doorTool);
                return;
            }

            await _origActivateDoor(type, systemTypeId ?? doorTool?.systemTypeId);
            props.inspector.showDoorPreDraw?.(doorTool);

            doorModePicker.show(type, {
                onSwitchSingle: () => { if (doorTool) doorTool.doorType = 'single'; },
                onSwitchDouble: () => { if (doorTool) doorTool.doorType = 'double'; },
            });

            const escHandler = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    props.inspector.hide?.();
                    doorModePicker.dismiss();
                    window.removeEventListener('keydown', escHandler);
                }
            };
            window.addEventListener('keydown', escHandler);
        };
    }

    if (props.toolManager?.activateWindow) {
        const _origActivateWindow = props.toolManager.activateWindow.bind(props.toolManager);
        props.toolManager.activateWindow = async (type: 'single' | 'double' = 'single', systemTypeId?: string) => {
            const windowTool = props.toolManager.windowTool ?? window.windowTool; // TODO(E.4.T): legacy windowTool — replace with runtime.tools.activate('window')

            if (windowModePicker.isVisible()) {
                if (windowTool) windowTool.windowType = type;
                windowModePicker.setMode(type);
                props.inspector.showWindowPreDraw?.(windowTool);
                return;
            }

            await _origActivateWindow(type, systemTypeId ?? windowTool?.systemTypeId);
            props.inspector.showWindowPreDraw?.(windowTool);

            windowModePicker.show(type, {
                onSwitchSingle: () => { if (windowTool) windowTool.windowType = 'single'; },
                onSwitchDouble: () => { if (windowTool) windowTool.windowType = 'double'; },
            });

            const escHandler = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    props.inspector.hide?.();
                    windowModePicker.dismiss();
                    window.removeEventListener('keydown', escHandler);
                }
            };
            window.addEventListener('keydown', escHandler);
        };
    }

    // ─── Plumbing Pre-Draw Panel ─────────────────────────────────────────────
    const _origActivatePlumbingTool = (service as any).activatePlumbingTool?.bind(service);
    if (_origActivatePlumbingTool) {
        (service as any).activatePlumbingTool = (type: string, toiletVariant?: string) => {
            _origActivatePlumbingTool(type, toiletVariant);
            const plumbingTool = window.plumbingTool; // TODO(E.17.T): legacy plumbingTool — replace with runtime.tools.activate('plumbing')
            getFrameScheduler().scheduleOnce('layout-plumbing-tool-pre-draw', () => {
                (props.inspector as any).showPlumbingPreDraw?.(plumbingTool);
            });
            const escHandler = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    props.inspector.hide?.();
                    window.removeEventListener('keydown', escHandler);
                }
            };
            window.addEventListener('keydown', escHandler);
        };
    }

    // ─── Curtain Wall Pre-Draw + Mode Picker Sync ────────────────────────────
    const _cwDrawingModeToPickerMode = (m?: import('@pryzm/geometry-curtain-wall').CurtainWallDrawingMode): CurtainWallPickerMode => {
        if (m === 'ORTHO')   return 'ortho';
        if (m === 'CURVED')  return 'curved';
        return 'linear';
    };

    if (props.toolManager?.activateCurtainWall) {
        const _origActivateCW = props.toolManager.activateCurtainWall.bind(props.toolManager);

        props.toolManager.activateCurtainWall = (mode?: import('@pryzm/geometry-curtain-wall').CurtainWallDrawingMode) => {
            curtainWallModePicker.setActiveMode(_cwDrawingModeToPickerMode(mode));
            _origActivateCW(mode);
            const cwTool = props.toolManager.curtainWallTool ?? window.curtainWallTool; // TODO(E.5.T): legacy curtainWallTool — replace with runtime.tools.activate('curtain-wall')
            props.inspector.showCurtainWallPreDraw?.(cwTool);
            const escHandler = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    props.inspector.hide?.();
                    window.removeEventListener('keydown', escHandler);
                }
            };
            window.addEventListener('keydown', escHandler);
        };
    }

    return {
        wallModePicker,
        curtainWallModePicker,
        doorModePicker,
        windowModePicker,
        ceilingModePicker,
        floorModePicker,
    };
}
