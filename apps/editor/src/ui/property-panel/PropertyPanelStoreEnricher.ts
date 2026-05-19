/**
 * PropertyPanelStoreEnricher
 *
 * Extracted from PropertyPanel.ts (WS-B S84-WIRE).
 * Merges raw userData with fresh store data for any BIM element type.
 *
 * Architecture:
 *  - Pure function — no class state
 *  - All store reads via typed window.* (P4-compliant: no window as any)
 *  - TODO(E.*) markers annotate Phase E migration targets
 */

import { normalizeType, getIfcClass } from './PropertyDescriptorGenerator';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';

/** Roof store shape exposed by RoofBuilder (subset we need). */
export interface RoofStoreSlot {
    getById(id: string): Record<string, any> | null | undefined;
}

/**
 * Merges element userData with fresh store data.
 * Returns the enriched copy — original is not mutated.
 *
 * @param roofStore  Pass `this._roofStore` from PropertyPanel; null-safe.
 * @param rawData    Raw element userData / last-known property bag.
 */
export function _enrichFromStores(
    roofStore: RoofStoreSlot | null,
    rawData: Record<string, any>,
): Record<string, any> {
    const id   = rawData.id;
    const type = normalizeType(rawData.elementType || rawData.type || '');
    if (!id) return rawData;

    let storeData: any = null;

    switch (type) {
        case 'wall':        storeData = window.wallStore?.getById?.(id);       break; // TODO(E.wall.S): legacy wallStore — replace with runtime.stores.wall
        case 'slab':        storeData = window.slabStore?.getById?.(id);       break; // TODO(E.slab.S): legacy slabStore — replace with runtime.stores.slab
        case 'ceiling':     storeData = window.ceilingStore?.getById?.(id);    break; // TODO(E.ceiling.S): legacy ceilingStore — replace with runtime.stores.ceiling
        case 'floor':       storeData = window.floorStore?.getById?.(id);      break; // TODO(E.floor.S): legacy floorStore — replace with runtime.stores.floor
        case 'column':      storeData = window.columnStore?.get?.(id);         break; // TODO(E.column.S): legacy columnStore — replace with runtime.stores.column
        case 'beam':        storeData = window.beamStore?.get?.(id);           break; // TODO(E.beam.S): legacy beamStore — replace with runtime.stores.beam
        case 'stairs':      storeData = window.stairStore?.get?.(id);          break; // TODO(E.stair.S): legacy stairStore — replace with runtime.stores.stair
        case 'curtainwall': storeData = window.curtainWallStore?.get?.(id);    break; // TODO(E.curtain-wall.S): legacy curtainWallStore — replace with runtime.stores.curtainWall
        case 'roof':        storeData = roofStore?.getById?.(id);              break;
        case 'furniture':   storeData = window.furnitureStore?.get?.(id);      break; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        case 'handrail':    storeData = window.handrailStore?.get?.(id);       break; // TODO(E.handrail.S): legacy handrailStore — replace with runtime.stores.handrail
        case 'room':        storeData = window.roomStore?.getById?.(id);       break; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        case 'window': {
            const ws  = window.wallStore; // TODO(E.wall.S): legacy wallStore — replace with runtime.stores.wall
            let flatData = ws?.getWindow?.(id);
            if (!flatData) {
                for (const wall of (ws?.getAll?.() ?? [])) {
                    const o = wall.openings?.find((x: any) => x.elementId === id || x.id === id);
                    if (o) { flatData = o; break; }
                }
            }
            const richWindow = windowStore.getById(id);
            storeData = richWindow ? { ...flatData, ...richWindow } : flatData;
            break;
        }
        case 'door': {
            const ws  = window.wallStore; // TODO(E.wall.S): legacy wallStore — replace with runtime.stores.wall
            let flatData = ws?.getDoor?.(id);
            if (!flatData) {
                for (const wall of (ws?.getAll?.() ?? [])) {
                    const o = wall.openings?.find((x: any) => x.elementId === id || x.id === id);
                    if (o) { flatData = o; break; }
                }
            }
            const richDoor = doorStore.getById(id);
            storeData = richDoor ? { ...flatData, ...richDoor } : flatData;
            break;
        }
    }

    const merged: Record<string, any> = { ...rawData };
    if (storeData) {
        Object.assign(merged, storeData);
        if (storeData.baseLine) merged.baseLine = storeData.baseLine;
    }

    if (!merged.ifcData) {
        merged.ifcData = {
            ifcClass: getIfcClass(merged.elementType || merged.type || ''),
            guid:     merged.id,
        };
    }

    // ── §6.5 Room ↔ Element bidirectional lookup ─────────────────────────
    if (id && type !== 'room') {
        try {
            const svc = window.roomContentsService; // TODO(E.18-R): legacy roomContentsService — replace with runtime.rooms.contentsService
            if (svc?.getRoomForElement) {
                const lookup = svc.getRoomForElement(id, type, merged.levelId);
                if (lookup?.primaryRoomId) {
                    const rs  = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
                    const roomData = rs?.getById?.(lookup.primaryRoomId);
                    const label =
                        (roomData?.name && String(roomData.name).trim()) ||
                        (roomData?.roomNumber && `#${roomData.roomNumber}`) ||
                        lookup.primaryRoomId;
                    const occ   = roomData?.occupancyType ? ` · ${roomData.occupancyType}` : '';
                    const extra = lookup.rooms.length > 1 ? ` (+${lookup.rooms.length - 1} more)` : '';
                    merged.room   = `${label}${occ}${extra}`;
                    merged.roomId = lookup.primaryRoomId;
                } else {
                    merged.room   = '—';
                    merged.roomId = '';
                }
            }
        } catch (e) {
            console.warn('[PropertyPanel] room reverse-lookup failed:', e);
        }
    }

    // ── Curtain wall: compute derived readonly fields from grid system ─────
    if (type === 'curtainwall' && id) {
        const grid = merged.gridSystem;
        if (grid && Array.isArray(grid.uLines) && Array.isArray(grid.vLines)) {
            const uInner = grid.uLines.filter((l: any) => l.t > 0.001 && l.t < 0.999).length;
            const vInner = grid.vLines.filter((l: any) => l.t > 0.001 && l.t < 0.999).length;
            merged.uLineCount = `${uInner} inner  (${grid.uLines.length - 1} col)`;
            merged.vLineCount = `${vInner} inner  (${grid.vLines.length - 1} row)`;
        } else if (merged.gridXSpacing && merged.gridYSpacing) {
            merged.uLineCount = `legacy (${merged.gridXSpacing}m spacing)`;
            merged.vLineCount = `legacy (${merged.gridYSpacing}m spacing)`;
        }
    }

    return merged;
}
