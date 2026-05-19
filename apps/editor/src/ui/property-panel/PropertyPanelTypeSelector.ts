/**
 * PropertyPanelTypeSelector
 *
 * Extracted from PropertyPanel.ts (WS-B S84-WIRE).
 * Builds the type-selector widget for walls, slabs, ceilings, floors, doors,
 * windows, columns, beams, plumbing fixtures, and stairs.
 *
 * Each widget dispatches a typed Update command via commandManager
 * and notifies the panel through `TypeSelectorHost.onRerender` when the
 * command succeeds, so the panel can refresh itself with enriched data.
 *
 * P4-compliant: all window.* accesses use typed Window extension declarations.
 * TODO(E.*) markers annotate Phase E migration targets.
 */

import { normalizeType } from './PropertyDescriptorGenerator';
import { buildWallTypeSelectorWidget }      from './WallTypeSelectorWidget';
import { buildSlabTypeSelectorWidget }      from './SlabTypeSelectorWidget';
import { buildCeilingTypeSelectorWidget }   from './CeilingTypeSelectorWidget';
import { buildFloorTypeSelectorWidget }     from './FloorTypeSelectorWidget';
import { buildDoorTypeSelectorWidget }      from './DoorTypeSelectorWidget';
import { buildWindowTypeSelectorWidget }    from './WindowTypeSelectorWidget';
import { buildColumnTypeSelectorWidget }    from './ColumnTypeSelectorWidget';
import { buildBeamTypeSelectorWidget }      from './BeamTypeSelectorWidget';
import { buildStairTypeSelectorWidget }     from './StairTypeSelectorWidget';
import { buildPlumbingTypeSelectorWidget }  from './PlumbingTypeSelectorWidget';

// ── Host interface ────────────────────────────────────────────────────────────

/**
 * Callbacks provided by PropertyPanel so the type-selector widgets can
 * trigger a panel re-render after a successful command.
 */
export interface TypeSelectorHost {
    /**
     * Called when a type-swap command succeeds.
     * The caller should enrich `data` with fresh store values and re-render.
     */
    onRerender(data: Record<string, any>): void;
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Returns the appropriate type-selector widget element for the given element,
 * or `null` if the element type has no selector widget.
 */
export function _buildTypeSelector(
    host: TypeSelectorHost,
    elementData: Record<string, any>,
): HTMLElement | null {
    const elType = normalizeType(elementData.elementType || elementData.type || '');

    if (elType === 'wall') {
        return buildWallTypeSelectorWidget(elementData, (payload) => {
            const params: Record<string, any> = {};
            if (payload.systemTypeId !== undefined) params.systemTypeId = payload.systemTypeId;
            if (payload.layers !== null)             params.layers       = payload.layers;
            if (payload.thickness !== null)          params.thickness    = payload.thickness;
            window.runtime?.bus?.executeCommand('wall.setSystemType', { id: elementData.id, ...params })
                ?.then(() => host.onRerender({ ...elementData, ...params }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] wall.setSystemType failed:', e));
        });
    }

    if (elType === 'slab') {
        return buildSlabTypeSelectorWidget(elementData, (payload) => {
            if (!payload.layers || payload.layers.length === 0 || payload.thickness === null) {
                console.warn('[PropertyPanel] Slab type apply: no layers or thickness — plain slab reset not yet implemented');
                return;
            }
            window.runtime?.bus?.executeCommand('slab.updateLayers', {
                slabId:       elementData.id,
                systemTypeId: payload.systemTypeId,
                layers:       payload.layers,
                thickness:    payload.thickness,
            })?.then(() => host.onRerender({ ...elementData, systemTypeId: payload.systemTypeId, layers: payload.layers, thickness: payload.thickness }))
              ?.catch((e: unknown) => console.warn('[PropertyPanel] slab.updateLayers failed:', e));
        });
    }

    if (elType === 'ceiling') {
        return buildCeilingTypeSelectorWidget(elementData, (payload) => {
            if (!payload.layers || payload.layers.length === 0 || payload.thickness === null) {
                console.warn('[PropertyPanel] Ceiling type apply: no layers or thickness — plain ceiling reset not yet implemented');
                return;
            }
            window.runtime?.bus?.executeCommand('ceiling.updateLayers', {
                ceilingId:    elementData.id,
                systemTypeId: payload.systemTypeId,
                layers:       payload.layers,
                thickness:    payload.thickness,
            })?.then(() => host.onRerender({ ...elementData, systemTypeId: payload.systemTypeId, layers: payload.layers }))
              ?.catch((e: unknown) => console.warn('[PropertyPanel] ceiling.updateLayers failed:', e));
        });
    }

    if (elType === 'floor') {
        return buildFloorTypeSelectorWidget(elementData, (payload) => {
            if (!payload.layers || payload.layers.length === 0 || payload.thickness === null) {
                console.warn('[PropertyPanel] Floor type apply: no layers or thickness — plain floor reset not yet implemented');
                return;
            }
            window.runtime?.bus?.executeCommand('floor.updateLayers', {
                floorId:      elementData.id,
                systemTypeId: payload.systemTypeId,
                layers:       payload.layers,
                thickness:    payload.thickness,
            })?.then(() => host.onRerender({ ...elementData, systemTypeId: payload.systemTypeId, layers: payload.layers }))
              ?.catch((e: unknown) => console.warn('[PropertyPanel] floor.updateLayers failed:', e));
        });
    }

    if (elType === 'door') {
        return buildDoorTypeSelectorWidget(elementData, (payload) => {
            if (!payload.systemTypeId) return;
            window.runtime?.bus?.executeCommand('door.setType', { doorId: elementData.id, systemTypeId: payload.systemTypeId })
                ?.then(() => host.onRerender({ ...elementData, systemTypeId: payload.systemTypeId }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] door.setType failed:', e));
        });
    }

    if (elType === 'window') {
        return buildWindowTypeSelectorWidget(elementData, (payload) => {
            if (!payload.systemTypeId) return;
            window.runtime?.bus?.executeCommand('window.setType', { windowId: elementData.id, systemTypeId: payload.systemTypeId })
                ?.then(() => host.onRerender({ ...elementData, systemTypeId: payload.systemTypeId }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] window.setType failed:', e));
        });
    }

    if (elType === 'column') {
        return buildColumnTypeSelectorWidget(elementData, (payload) => {
            const updates: Record<string, any> = { profile: payload.profile, width: payload.width, depth: payload.depth };
            if (payload.steelProfileName !== undefined) updates.steelProfileName = payload.steelProfileName;
            window.runtime?.bus?.executeCommand('column.update', { id: elementData.id, updates })
                ?.then(() => host.onRerender({ ...elementData, ...updates }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] column.update failed:', e));
        });
    }

    if (elType === 'beam') {
        return buildBeamTypeSelectorWidget(elementData, (payload) => {
            const updates: Record<string, any> = { sectionType: payload.sectionType, width: payload.width, depth: payload.depth };
            if (payload.steelProfileName !== undefined) updates.steelProfileName = payload.steelProfileName;
            window.runtime?.bus?.executeCommand('beam.update', { beamId: elementData.id, updates })
                ?.then(() => host.onRerender({ ...elementData, ...updates }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] beam.update failed:', e));
        });
    }

    if (elType === 'plumbingfixture' || elType === 'plumbing_fixture' || elType === 'plumbing') {
        return buildPlumbingTypeSelectorWidget(elementData, (payload) => {
            if (!payload.toiletVariant && !payload.showerVariant) return;
            window.runtime?.bus?.executeCommand('plumbing.setSystem', {
                id:            elementData.id,
                toiletVariant: payload.toiletVariant,
                showerVariant: payload.showerVariant,
            })?.then(() => {
                const merged: Record<string, any> = { ...elementData };
                if (payload.toiletVariant) merged.toiletVariant = payload.toiletVariant;
                if (payload.showerVariant) merged.showerVariant = payload.showerVariant;
                host.onRerender(merged);
            })?.catch((e: unknown) => console.warn('[PropertyPanel] plumbing.setSystem failed:', e));
        });
    }

    if (elType === 'stair' || elType === 'stairs') {
        return buildStairTypeSelectorWidget(elementData, (payload) => {
            if (!payload.typeId) return;
            window.runtime?.bus?.executeCommand('stair.updateParameters', { stairId: elementData.id, updates: { typeId: payload.typeId } })
                ?.then(() => host.onRerender({ ...elementData, typeId: payload.typeId }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] stair.updateParameters failed:', e));
        });
    }

    return null;
}
