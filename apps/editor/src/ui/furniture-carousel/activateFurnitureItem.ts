// activateFurnitureItem — §FEAT-CHAT-TOOL-ACTIVATION (L-906).
//
// THE ONE furniture-item activation ladder, extracted verbatim from
// `FurnitureSidePanel._activateItem` so that the chat placement capability
// (`ui/ai/chatPlacementActivation.ts`) activates a furniture item through the
// SAME path a palette card click does — mouse preview and all — instead of
// growing a rival wiring (P1/P6 discipline; the two-sources-of-truth defect
// the capability registry exists to prevent).
//
// Behaviour is the panel's, unchanged:
//   • GLB catalogue item  → stamp `_pryzmActiveFurnitureType` with the GLB
//     path and emit `fc-place-glb-start` carrying the descriptor's declared
//     footprint (§FIX-PLACEMENT-PREVIEW, L-21 — the click-to-place ghost is
//     sized to the real item, not a generic 1 m box).
//   • Parametric item     → `toolManager.activateFurniture(type)` (the
//     ToolManager path that also notifies the plan-view handler), falling
//     back to the raw `furnitureTool` bridge when ToolManager is not ready.
//
// Two deliberate deltas from the panel body it replaces, both honesty fixes
// (§CONTEXT-DATA-HONESTY), neither changing a working path:
//   1. the boolean return — the chat capability must never say "activated"
//      when nothing was; the panel ignores the return value exactly as before.
//   2. the GLB branch REFUSES (returns false, stamps nothing) when
//      `runtime.events` is absent — the old body stamped
//      `_pryzmActiveFurnitureType` and hid the carousel while the emit
//      silently no-opped, i.e. it half-applied state for a placement that
//      never started.

import type { FurnitureType } from '@pryzm/geometry-furniture';
import type { FurnitureTypeDescriptor } from './FurnitureCategoryRegistry';

/** The window bridges the ladder walks — identical to the panel's typing. */
export type FurnitureAccessWindow = Window & {
    toolManager?: {
        activateFurniture?: (type: string) => void | Promise<void>;
    };
    furnitureTool?: {
        setFurnitureType?: (type: FurnitureType) => void;
        activate?: () => void;
    };
    furnitureCarousel?: {
        setVisible?: (visible: boolean) => void;
    };
    _pryzmActiveFurnitureType?: string;
};

/**
 * Activate placement of one furniture item, exactly as clicking its card in
 * the furniture side panel does.
 *
 * @returns `true` when an activation was actually dispatched; `false` when no
 *   bridge was ready (engine not initialised) and nothing happened.
 */
export function activateFurnitureItem(item: FurnitureTypeDescriptor): boolean {
    const accessWindow = window as FurnitureAccessWindow;

    if (item.glbPath) {
        const events = window.runtime?.events;
        if (!events?.emit) {
            console.warn('[activateFurnitureItem] runtime.events not ready — GLB placement not started');
            return false;
        }
        accessWindow._pryzmActiveFurnitureType = item.glbPath;
        // §FIX-PLACEMENT-PREVIEW (L-21) — forward the descriptor's declared
        // footprint so the click-to-place ghost is sized to the real item,
        // not a generic 1 m box (matters most when the GLB 404s).
        const d = item.defaultDimensions;
        events.emit('fc-place-glb-start', {
            path: item.glbPath,
            label: item.label,
            dimensions: d
                ? { width: d.width, length: d.length, height: d.height, baseOffset: d.baseOffset }
                : undefined,
        }); // F.events.12
        accessWindow.furnitureCarousel?.setVisible?.(false);
        return true;
    }

    const type = item.type as FurnitureType;
    accessWindow._pryzmActiveFurnitureType = type;

    if (accessWindow.toolManager?.activateFurniture) {
        void accessWindow.toolManager.activateFurniture(type);
        accessWindow.furnitureCarousel?.setVisible?.(false);
        return true;
    }

    const ft = accessWindow.furnitureTool;
    if (!ft) {
        console.error('[activateFurnitureItem] furnitureTool not ready');
        return false;
    }
    ft.setFurnitureType?.(type);
    ft.activate?.();
    accessWindow.furnitureCarousel?.setVisible?.(false);
    return true;
}
