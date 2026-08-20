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
// §FIX-SLAB-FAMILY-MODE-SURFACE-INDEPENDENT (L-956) — the GESTURE axis. The bar below
// displayed `resolveActiveSlabDrawMode()` after EVERY selection, so picking By Region
// snapped the bar's highlight back to Linear while the tool really was in region mode
// — the UI reporting the axis that had not changed, which is L-956's whole shape.
import { resolveSlabReentryMode } from '@app/engine/views/plantools/activeSlabFamilyMode';
// §FEAT-HANDRAIL-CREATION-PARITY (founder 2026-08-18; C95 D4) — the railing's
// shared mode + armed-type store, read by BOTH the plan handler and the 3-D tool.
//
// ⚠ MOVED 2026-08-19 (L-1106): this store used to live at
// `@app/engine/views/plantools/activeHandrailAuthoring`. The 3-D `HandrailTool`
// lives in `@pryzm/geometry-handrail` and CANNOT import an app module, so an
// authoring store filed under `apps/editor` was unreadable from one of the two
// surfaces that had to agree on the armed mode — which is exactly how the 3-D
// tool ended up mode-blind. It now lives beside the generators that implement the
// modes, mirroring `getStairToolConfig` in `@pryzm/geometry-stair`.
import {
    setActiveHandrailDrawMode,
    resolveActiveHandrailDrawMode,
    setActiveHandrailTypeId,
    isHandrailDrawMode,
    captureHandrailBySlabSelection,
    setHandrailBySlabTarget,
    // §FIX-HANDRAIL-BY-SLAB (L-1103) — the ONE by-slab executor, shared with the
    // plan handler, the 3-D tool and (via the command it dispatches) with RAC.
    executeHandrailBySlab,
} from '@pryzm/geometry-handrail';
import { handrailTypeStore } from '@pryzm/core-app-model/stores';
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
export type FloorToolMode   =
    | 'LINEAR' | 'ORTHO' | 'ARC'
    // §FEAT-PLATE-SHAPE-MODES — the three closed-loop gestures.
    | 'RECTANGLE' | 'CIRCULAR' | 'ELLIPTICAL'
    | 'AUTO_FROM_ROOM';
export type CeilingToolMode = FloorToolMode;

export function floorPickerToToolMode(m: FloorPickerMode): FloorToolMode {
    switch (m) {
        case 'ortho':     return 'ORTHO';
        case 'curved':    return 'ARC';
        case 'rectangle':  return 'RECTANGLE';
        case 'circular':   return 'CIRCULAR';
        case 'elliptical': return 'ELLIPTICAL';
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

/**
 * §FIX-AUTO-MODE-DROPPED-AT-ACTIVATION (L-918) — `RoomTool.activate`'s OWN vocabulary,
 * mirrored from its signature (packages/room-topology/src/RoomTool.ts:85) because that
 * function is the thing that will actually receive the string.
 *
 * Deliberately NOT derived from `elementCreationMatrix('room')`: the two DISAGREE — the
 * matrix declares `detect`, the tool accepts `auto-detect`. Deriving from the matrix would
 * hand the tool an id it cannot honour and silently fall into its default, which is the
 * exact silent-wrong shape this whole fix removes. See the `room` activator for why the
 * mismatch is refused rather than translated.
 */
export const ROOM_TOOL_MODES = ['auto-detect', 'point-pick', 'manual-boundary'] as const;

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
        // §FEAT-HANDRAIL-CREATION-PARITY — the argument is a MODE or a TYPE, and the
        // family needs both, so it is DISAMBIGUATED rather than guessed.
        //
        // ⛔ WHY THIS WAS A LATENT DEFECT BEFORE THE MODES EXISTED. The registration
        // was `(m?) => service.activateHandrailTool(m)`, and `activateHandrailTool`'s
        // parameter is a TYPE id. Once the railing row declares seven modes, a caller
        // doing `runtime.tools.activate('handrail', 'circular')` — which the census in
        // `planAutoModeReachability.spec.ts` exists to make possible — would have had
        // 'circular' looked up in `handrailTypeStore`, found nothing, and armed NOTHING,
        // silently. A mode swallowed as a bogus type id is exactly L-918's shape.
        //
        // The two id spaces are disjoint by construction: modes are a closed 7-member
        // set (`isHandrailDrawMode`), catalogue ids are slugs like 'glass-frameless'.
        // The mode test runs FIRST and the collision is guarded rather than assumed —
        // if someone ever publishes a type whose id is a mode name, the console says so
        // instead of the tool quietly doing the wrong one of the two things.
        runtime.tools.register('handrail', (m?) => {
            if (isHandrailDrawMode(m)) {
                if (handrailTypeStore.getById(m)) {
                    console.warn(
                        `[Layout] handrail: '${m}' is BOTH a draw mode and a published type id. ` +
                        'Treating it as the MODE. Rename the type — one name must not mean two things (C84 EI-8).',
                    );
                }
                setActiveHandrailDrawMode(m);
                service.activateHandrailTool();
                return;
            }
            service.activateHandrailTool(m);
        });
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
        // §FIX-AUTO-MODE-DROPPED-AT-ACTIVATION (L-918) — THE THIRD INSTANCE, and it was
        // found by censusing the DECLARED capability table rather than by reading the two
        // lines the founder's report pointed at. `room` declares THREE modes
        // (`elementCreationMatrix`: detect | manual-boundary | point-pick) and
        // `RoomTool.activate(mode = 'auto-detect')` genuinely accepts one
        // (packages/room-topology/src/RoomTool.ts:85) — but this activator was declared
        // arity 0 and swallowed it, exactly as floor and ceiling did.
        //
        // LATENT — explicitly NOT the founder's defect, and must not be reported as a
        // closure of it. All three room modes stay reachable by other routes today
        // (`room:level`, `room-bounding`, and the 'P' shortcut at initUI.ts:3067), so no
        // user gesture is currently broken by this. It is fixed because the public
        // `runtime.tools.activate(family, mode)` seam must not lie about what it honours.
        //
        // ⚠ ID DESYNC, NAMED RATHER THAN PAPERED OVER: the matrix says `detect` where the
        // tool's vocabulary says `auto-detect`. A silent translation table here would hide
        // that divergence permanently — and a second hand-maintained list is the very thing
        // `isDeclaredCreationMode` above exists to avoid — so an id the TOOL does not
        // declare is REFUSED with BOTH vocabularies printed. Close it at one of the two
        // sources; do not add a mapping here.
        runtime.tools.register('room',          (m?) => {
            const t = window.roomTool; // TODO(E.16): legacy window.roomTool bridge — delete when plugins/room lands per §16.5
            if (!t) { tm.activateRoom?.(); return; }
            if (m !== undefined && !(ROOM_TOOL_MODES as readonly string[]).includes(m)) {
                console.warn(
                    `[ToolsAreaLayout] REFUSED room activation mode "${m}" — RoomTool declares `
                    + `[${ROOM_TOOL_MODES.join(', ')}], while elementCreationMatrix('room') declares `
                    + `[${creationModes('room').map(x => x.id).join(', ')}]. `
                    + `Mode NOT applied; the room tool stays in its default "auto-detect".`,
                );
                t.activate?.();
                return;
            }
            t.activate?.(m);
        });
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
    // §FEAT-HANDRAIL-CREATION-PARITY — the railing's in-draw mode bar. The SAME
    // `DrawingModeBar` component and the SAME `.wdh-*` styles the wall and slab
    // bars use, driven by the railing's own declared modes. Not a look-alike.
    const handrailDrawingBar = new DrawingModeBar();
    const wallDrawingHUD   = new WallDrawingHUD();

    // ── By Slab helper — shared by WallModePicker (legacy) and WallDrawingHUD ─
    // _bySlabCapture holds the selected object at the moment the wall tool was
    // activated. ToolManager.activateTool() disables SelectionManager immediately,
    // so by the time the user clicks the S button the live selection is already
    // cleared. We snapshot it here and use it in _execWallBySlab instead.
    let _bySlabCapture: any = null;

    /**
     * §FIX-HANDRAIL-BY-SLAB (L-1103) — THE PICK-A-SLAB FLOW, ONCE.
     *
     * This was the wall's private body. It is extracted because the railing needs
     * exactly it and the founder's report is what happens when a family mirrors a
     * FEATURE without mirroring its MECHANISM: railing's By Slab had the pill, the
     * label and the accelerator, and none of the two things that make wall's work.
     * A second copy would have been the third — curtain wall is the other one — so
     * there is now one flow and the families differ only in what they do with the
     * picked id.
     *
     * ⚠ IT DEACTIVATES THE ACTIVE TOOL FIRST, and that is not tidiness. While a
     * drawing tool is active `SelectionManager` is DISABLED
     * (`ToolManager.activateTool` → `setEnabled(false)`), so the user physically
     * cannot select the slab we are asking them to select. `deactivateAll()` is the
     * call that sets it back to `true` (`ToolManager.ts:1145`). Without this the
     * overlay would sit there asking for something the app had made impossible —
     * which is the defect being fixed, wearing a prompt.
     */
    const _pickSlabThen = (message: string, onSlab: (slabId: string) => void): void => {
        void (props.toolManager as { deactivateAll?: () => Promise<void> } | undefined)?.deactivateAll?.();

        // A non-blocking status overlay (pointer-events: none, so it does not
        // interfere with scene clicks).
        const overlay = document.createElement('div');
        overlay.className = 'bsp-overlay';
        overlay.innerHTML = `
            <span class="bsp-icon">&#9699;</span>
            <span class="bsp-msg">${message}</span>
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
            const picked    = props.selectionManager?.selectedObject;
            const pickedId  = picked?.userData?.id as string | undefined;
            // Case-insensitive: SlabFragmentBuilder writes 'Slab' (capital S) but
            // callers historically checked lowercase 'slab' (C15 §12).
            const pickedTyp = (picked?.userData?.elementType as string | undefined)?.toLowerCase();
            if (!pickedId || pickedTyp !== 'slab') return;
            _cleanup();
            onSlab(pickedId);
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

    const _execWallBySlab = () => {
        // Prefer the pre-activation snapshot; fall back to live selection.
        // elementType comparison is case-insensitive: SlabFragmentBuilder writes 'Slab'
        // (capital S) but callers historically checked against lowercase 'slab'.
        const sel    = _bySlabCapture ?? props.selectionManager?.selectedObject;
        const slabId = sel?.userData?.id as string | undefined;
        const elType = (sel?.userData?.elementType as string | undefined)?.toLowerCase();

        // P6 fix (Wave 14 FILE 3): route through runtime.commandBus.dispatch instead of
        // legacy commandManager.execute(). F-1.4: bus-primary dispatch
        // (wall.create-on-all-slabs registered, doc-33 P0).
        const _dispatch = (id: string) => {
            (window.runtime?.bus as any)?.executeCommand('wall.create-on-all-slabs', { slabId: id })
                .catch((e: unknown) => console.error('[ToolsAreaLayout] wall.create-on-all-slabs failed:', e)); // §E.5.x: commandManager fallback removed
        };

        if (slabId && elType === 'slab') {
            // ── Pre-selection path: slab known, execute immediately ───────────
            _dispatch(slabId);
            // Deactivate the wall drawing tool — creation session is complete.
            props.wallTool?.deactivate?.();
            return;
        }

        // ── No pre-selection: enter pick-a-slab mode ──────────────────────────
        props.wallTool?.deactivate?.();
        _pickSlabThen('Click a slab in the scene to create walls from its perimeter', _dispatch);
    };

    /**
     * §FIX-HANDRAIL-BY-SLAB (L-1103) — the railing's By Slab, wall's shape exactly.
     *
     * Pre-selection ⇒ create now. No pre-selection ⇒ ASK, then create. A refusal for
     * any OTHER reason (the slab has no polygon, no level, no edge ≥ 0.1 m) has
     * already been logged by name by the executor and is NOT turned into a prompt:
     * asking the user to pick again would be a lie about what went wrong (C16 CA-18).
     */
    const _execHandrailBySlab = () => {
        const first = executeHandrailBySlab();
        if (first.kind !== 'no-slab') return;
        _pickSlabThen('Click a slab in the scene to guard its perimeter with a railing', (id) => {
            setHandrailBySlabTarget(id);
            executeHandrailBySlab(id);
        });
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
                // §FEAT-WALL-SHAPE-MODES — arming a closed-loop run is a MODE change on
                // the picker the plan handler reads, NOT a tool re-activation: the wall
                // tool is already live and re-entering it would destroy an in-progress
                // stroke (the defect §FEAT-PERSISTENT-MODE-BAR was created to fix).
                onSelectRectangular: () => window.wallModePicker?.setActiveMode?.('rectangular'),
                onSelectCircular:    () => window.wallModePicker?.setActiveMode?.('circular'),
                onSelectElliptical:  () => window.wallModePicker?.setActiveMode?.('elliptical'),
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
        // §FIX-HANDRAIL-BY-SLAB / §FIX-HANDRAIL-PANEL-ORDER — the railing bar was the
        // ONLY mode bar with no teardown here, so it survived a tool switch and went on
        // advertising modes the now-active tool does not have. The by-slab snapshot is
        // released with it, so the next session cannot inherit a stale slab.
        if (toolName === 'handrail' || toolName === 'railing') {
            handrailDrawingBar.dismiss();
            setHandrailBySlabTarget(undefined);
        }
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
                onSwitchCircular:  () => _switchFloor('circular'),
                onSwitchElliptical:() => _switchFloor('elliptical'),
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
                onSwitchCircular:  () => _switchCeiling('circular'),
                onSwitchElliptical:() => _switchCeiling('elliptical'),
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
            slabDrawingBar.setMode(resolveSlabReentryMode(resolveActiveSlabDrawMode()));
        } else {
            slabDrawingBar.show({
                label: 'Slab:',
                modes: creationModes('slab'),
                initialMode: resolveSlabReentryMode(resolveActiveSlabDrawMode()),
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
                    slabDrawingBar.setMode(resolveSlabReentryMode(resolveActiveSlabDrawMode()));
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

    // ─── Handrail Pre-Draw + mode bar — §FEAT-HANDRAIL-CREATION-PARITY ───────
    //
    // THE FOUNDER, 2026-08-18: "I would like PARITY WITH THE WALL ELEMENT … I want
    // it created in the same way: once the user clicks it should have the same
    // UI/UX as the wall's authoring panel … BY LINE, ORTHO, CURVED, BY SLAB and
    // add SQUARE, CIRCULAR, ELLIPSE."
    //
    // Measured before this: activating the handrail tool opened `HandrailModePicker`
    // — a PRE-FLIGHT list of types that dismissed itself on pick — and then showed
    // NO panel and NO mode bar at all. There was one gesture (two clicks, a straight
    // line) and no way to change anything without re-activating the tool. This is the
    // slab's §FEAT-PERSISTENT-MODE-BAR treatment applied to the railing, for the same
    // founder complaint and with the same rule:
    //
    //   ⛔ A MODE SWITCH MUST NEVER CALL AN `activate*` FUNCTION. `activateTool`
    //   routes through `deactivateAllInternal()` and destroys the in-progress
    //   polyline, so switching mode would mean starting the run over — the whole
    //   defect the shared bar exists to remove. `onSelect` writes the shared store
    //   and NOTHING else; `RailingPlanToolHandler` re-reads it on the next click, so
    //   the vertices already placed survive.
    //
    // §FIX-HANDRAIL-BY-SLAB (L-1103) + §FIX-HANDRAIL-PANEL-ORDER (L-1104) — TWO
    // FOUNDER-REPORTED DEFECTS, BOTH CLOSED BY MIRRORING THE WALL RATHER THAN
    // INVENTING A THIRD SHAPE.
    //
    // BY SLAB (L-1103). Founder: *"Handrail by slab doesn't work. The same happened
    // with curtain walls. Walls work correctly."* The railing's By Slab waited for a
    // canvas click and then read the LIVE selection — but `ToolManager.activateTool`
    // calls `selectionManager.setEnabled(false)` while activating ANY tool, so the
    // selection is already gone before the first click can happen, and the tool
    // consuming the clicks means one can never be re-acquired. UNSATISFIABLE: not
    // flaky, never true. The wall has both cures and the railing had neither, so both
    // are mirrored here — the pre-activation SNAPSHOT (`_bySlabCapture`'s twin, but in
    // the shared authoring store so the 3-D tool and RAC see it too), and the explicit
    // PICK-A-SLAB mode for when there is no pre-selection. By Slab now EXECUTES on the
    // pill, like wall's, instead of arming a mode that waits for a click.
    //
    // PANEL ORDER (L-1104). The mode bar is shown FIRST and the type card is deferred
    // one scheduler tick, byte-for-byte the wall's order at `activateWallTool` — so
    // `PropertyPanel.positionBesideModeBar` measures a `.wdh-bar` that is already laid
    // out and pins the card to its right edge at the same top. The bar's label is
    // `'Mode:'`, the wall's word, not a second word for the same thing (C84 EI-8).
    //
    //   ⛔ A MODE SWITCH MUST NEVER CALL AN `activate*` FUNCTION. `activateTool`
    //   routes through `deactivateAllInternal()` and destroys the in-progress
    //   polyline, so switching mode would mean starting the run over — the whole
    //   defect the shared bar exists to remove. `onSelect` writes the shared store
    //   and NOTHING else; `RailingPlanToolHandler` re-reads it on the next click, so
    //   the vertices already placed survive.
    const _origActivateHandrail = service.activateHandrailTool.bind(service);
    service.activateHandrailTool = (typeId?: string) => {
        // ⚠ BEFORE `_origActivateHandrail`, AND THAT ORDERING IS THE WHOLE FIX.
        // Activation disables SelectionManager, which clears `selectedObject`. Read it
        // after, and By Slab is asking a question whose answer this very line destroyed.
        captureHandrailBySlabSelection(props.selectionManager?.selectedObject);

        _origActivateHandrail(typeId);
        // An activation that names a type ARMS it surface-independently (L-98), so a
        // type chosen from the ARCHITECTURE palette reaches the plan handler too.
        if (typeId) setActiveHandrailTypeId(typeId);

        if (handrailDrawingBar.isVisible()) {
            handrailDrawingBar.setMode(resolveActiveHandrailDrawMode());
        } else {
            handrailDrawingBar.show({
                label: 'Mode:',
                modes: creationModes('railing'),
                initialMode: resolveActiveHandrailDrawMode(),
                onSelect: (id) => {
                    // 'byslab' is declared `isAction` in the creation matrix, so
                    // `DrawingModeBar` deliberately does NOT make it the active mode —
                    // it just calls back. Treat it as the ACTION it is; writing it to
                    // the mode store instead would leave every later click retrying
                    // by-slab while the bar still highlighted Linear (L-956's shape).
                    if (id === 'byslab') { _execHandrailBySlab(); return; }
                    setActiveHandrailDrawMode(id);
                },
            });
        }

        // The type card comes SECOND and one tick late — the wall's exact order, so the
        // card measures a bar that is already on screen and lands beside it.
        getFrameScheduler().scheduleOnce('layout-handrail-tool-pre-draw', () => {
            props.inspector.showHandrailPreDraw?.(window.handrailTool);
        });

        const escHandlerHr = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                props.inspector.hide?.();
                handrailDrawingBar.dismiss();
                window.removeEventListener('keydown', escHandlerHr);
            }
        };
        window.addEventListener('keydown', escHandlerHr);
    };

    if (props.toolManager?.activateDoor) {
        const _origActivateDoor = props.toolManager.activateDoor.bind(props.toolManager);
        props.toolManager.activateDoor = async (type: 'single' | 'double' = 'single', systemTypeId?: string) => {
            const doorTool = props.toolManager.doorTool ?? window.doorTool; // TODO(E.3.T): legacy doorTool — replace with runtime.tools.activate('door')

            if (doorModePicker.isVisible()) {
                if (doorTool) doorTool.doorType = type;
                doorModePicker.setMode(type);
                // §OPENING-PROFILE — re-activation must not drop the chosen head shape from the
                // bar while the config store still holds it.
                if (doorTool) doorModePicker.setProfile(doorTool.openingProfile);
                props.inspector.showDoorPreDraw?.(doorTool);
                return;
            }

            await _origActivateDoor(type, systemTypeId ?? doorTool?.systemTypeId);
            props.inspector.showDoorPreDraw?.(doorTool);

            // §OPENING-PROFILE (L-1251) — the door's TWO axes, mirroring the window bar. Leaf
            // count and head shape patch independently on the one config store.
            doorModePicker.show(type, {
                onSwitchSingle: () => { if (doorTool) doorTool.doorType = 'single'; },
                onSwitchDouble: () => { if (doorTool) doorTool.doorType = 'double'; },
                onSwitchProfile: (profile) => { if (doorTool) doorTool.openingProfile = profile; },
            }, doorTool?.openingProfile ?? 'rectangular');

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
                // §OPENING-PROFILE — re-activating the tool must NOT silently drop the chosen
                // shape from the bar while the config store still holds it. A pill that
                // disagrees with the store is how a user ends up authoring a shape they cannot
                // see they selected.
                if (windowTool) windowModePicker.setProfile(windowTool.openingProfile);
                props.inspector.showWindowPreDraw?.(windowTool);
                return;
            }

            await _origActivateWindow(type, systemTypeId ?? windowTool?.systemTypeId);
            props.inspector.showWindowPreDraw?.(windowTool);

            // §OPENING-PROFILE (L-1250) — TWO AXES, ONE BAR. `windowType` is the leaf count and
            // `openingProfile` the void shape; they patch INDEPENDENTLY on the one config store,
            // so switching one never resets the other. That independence is the whole reason the
            // founder's "single / double / circular" is served by two rows rather than one list.
            windowModePicker.show(type, {
                onSwitchSingle: () => { if (windowTool) windowTool.windowType = 'single'; },
                onSwitchDouble: () => { if (windowTool) windowTool.windowType = 'double'; },
                onSwitchProfile: (profile) => { if (windowTool) windowTool.openingProfile = profile; },
            }, windowTool?.openingProfile ?? 'rectangular');

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

            // ── §FIX-CW-BYSLAB-ASK (L-1165) — the THIRD adopter of ONE flow ──────
            //
            // The founder: "HANDRAILS + CURTAIN WALLS + WALLS 'BY SLAB'. Wall works.
            // Curtain wall does NOT." The wall's By Slab has two halves — a snapshot
            // of the selection taken before `ToolManager` disables SelectionManager,
            // and an explicit ASK when there is no snapshot. CW2 gave the curtain wall
            // the FIRST half (L-1074, the snapshot lives inside the tool). This is the
            // second, and it is `_pickSlabThen` — the wall's own body, extracted by
            // lane HR2 for exactly this — NOT a third copy of it.
            //
            // ⚠ WIRED HERE AND NOT IN `initTools.ts` ON PURPOSE: this flow does not
            // exist until `ToolsAreaLayout` runs, and re-wiring on every activation is
            // idempotent (a plain setter), so there is no ordering window where the
            // tool is live with no way to ask.
            cwTool?.setSlabPickRequester?.((message: string, onSlab: (slabId: string) => void) => {
                _pickSlabThen(message, onSlab);
            });

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
