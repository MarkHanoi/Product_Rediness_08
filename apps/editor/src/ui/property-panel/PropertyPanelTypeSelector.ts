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
// §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105) — placed-furniture "Type" swap dropdown.
import { buildFurnitureTypeSelectorWidget } from './FurnitureTypeSelectorWidget';
// §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — placed-railing "Type" swap dropdown; the
// HandrailTypeStore catalogue had no selection surface anywhere in the product.
import { buildRailingTypeSelectorWidget }  from './RailingTypeSelectorWidget';
// §FIX-STAIR-RAILING-TYPE-PICKER — a STAIR's railing is a DIFFERENT element from a
// standalone handrail (semantic 'stair-railing', store `stairRailingStore`); L-623
// covered only the latter, so selecting a stair railing showed no picker at all.
import { buildStairRailingTypeSelectorWidget } from './StairRailingTypeSelectorWidget';
// §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — the declarative floor under the if-ladder
// below. The ladder is not derived from anything, so a family with no branch is
// invisible to any audit OF the ladder — which is precisely why every previous
// generalisation pass reached only the families that already had a picker. Families
// declare a catalogue in the registry and get a picker from data.
import { resolveElementTypeCatalog } from './ElementTypeCatalogRegistry';
import { buildGenericTypeSelectorWidget } from './GenericTypeSelectorWidget';

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
            // §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105) — the previous dispatch used
            // 'wall.setSystemType' (the clean plugin-bus handler), which mutates a
            // DETACHED DTO store with NO bridge to the legacy geometry store that
            // drives WallRebuildCoordinator → for an EXISTING placed wall the mesh
            // never rebuilt (the founder's "not working for existing elements").
            // Route through the uniform 'element.changeType' command instead, which
            // for walls executes UpdateWallSystemTypeCommand on the legacy geometry
            // store — the proven path that DOES rebuild the wall mesh, undoably.
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:    elementData.id,
                elementType:  'wall',
                newTypeId:    payload.systemTypeId ?? '',
                layers:       payload.layers ?? null,
                thickness:    payload.thickness ?? undefined,
            })
                ?.then(() => host.onRerender({ ...elementData, ...params }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (wall) failed:', e));
        });
    }

    if (elType === 'slab') {
        return buildSlabTypeSelectorWidget(elementData, (payload) => {
            if (!payload.layers || payload.layers.length === 0 || payload.thickness === null) {
                console.warn('[PropertyPanel] Slab type apply: no layers or thickness — plain slab reset not yet implemented');
                return;
            }
            // §FIX-SLAB-TYPE-SWAP (mirrors §FIX-FLOOR-TYPE-SWAP L-106) — route through the
            // uniform 'element.changeType' command (ADR-0105), which for slabs runs
            // UpdateSlabLayersCommand on the LEGACY SlabStore — the store the 3D SlabTool +
            // plan bridge actually populate (and that drives SlabFragmentBuilder). The
            // previous 'slab.updateLayers' dispatch hit a DETACHED plugin Immer store, which
            // is empty for SlabTool-created slabs → canExecute "slab not found" and the mesh
            // never rebuilt. Now the type/layer swap applies + re-renders (material +
            // assembly), undoable in one step. Mirrors wall/floor/door/window.
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:    elementData.id,
                elementType:  'slab',
                newTypeId:    payload.systemTypeId ?? '',
                layers:       payload.layers,
                thickness:    payload.thickness,
            })?.then(() => host.onRerender({ ...elementData, systemTypeId: payload.systemTypeId, layers: payload.layers, thickness: payload.thickness }))
              ?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (slab) failed:', e));
        });
    }

    if (elType === 'ceiling') {
        return buildCeilingTypeSelectorWidget(elementData, (payload) => {
            if (!payload.layers || payload.layers.length === 0 || payload.thickness === null) {
                console.warn('[PropertyPanel] Ceiling type apply: no layers or thickness — plain ceiling reset not yet implemented');
                return;
            }
            // §FIX-CEILING-TYPE-SWAP (L-621, mirrors §FIX-FLOOR-TYPE-SWAP L-106) — route
            // through the uniform 'element.changeType' command (ADR-0105), which for
            // ceilings runs UpdateCeilingLayersCommand on the LEGACY CeilingStore — the
            // store the 3D CeilingTool AND the project loader populate, and that
            // CeilingPanelBuilder subscribes to via 'bim-ceiling-updated'. The previous
            // 'ceiling.updateLayers' dispatch hit a DETACHED plugin Immer store, populated
            // only for plan-tool ceilings → canExecute "ceiling not found" and the mesh
            // never rebuilt. Mirrors wall/floor/slab/door/window.
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:    elementData.id,
                elementType:  'ceiling',
                newTypeId:    payload.systemTypeId ?? '',
                layers:       payload.layers,
                thickness:    payload.thickness,
            })?.then(() => host.onRerender({ ...elementData, systemTypeId: payload.systemTypeId, layers: payload.layers }))
              ?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (ceiling) failed:', e));
        });
    }

    if (elType === 'floor') {
        return buildFloorTypeSelectorWidget(elementData, (payload) => {
            if (!payload.layers || payload.layers.length === 0 || payload.thickness === null) {
                console.warn('[PropertyPanel] Floor type apply: no layers or thickness — plain floor reset not yet implemented');
                return;
            }
            // §FIX-FLOOR-TYPE-SWAP (L-106) — route through the uniform 'element.changeType'
            // command (ADR-0105), which for floors runs UpdateFloorLayersCommand on the LEGACY
            // FloorStore — the store the 3D FloorTool + plan bridge actually populate (and that
            // drives FloorFragmentBuilder). The previous 'floor.updateLayers' dispatch hit a
            // DETACHED Immer store, which is empty for FloorTool-created floors →
            // "floor not found" and the mesh never rebuilt. Now the type/layer swap applies +
            // re-renders (material + assembly), undoable in one step. Mirrors wall/door/window.
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:    elementData.id,
                elementType:  'floor',
                newTypeId:    payload.systemTypeId ?? '',
                layers:       payload.layers,
                thickness:    payload.thickness,
            })?.then(() => host.onRerender({ ...elementData, systemTypeId: payload.systemTypeId, layers: payload.layers }))
              ?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (floor) failed:', e));
        });
    }

    if (elType === 'door') {
        return buildDoorTypeSelectorWidget(elementData, (payload) => {
            if (!payload.systemTypeId) return;
            // §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105) — uniform surface. Routes to the
            // existing door.setType bus command AND nudges the host wall to rebuild so
            // the opening re-renders with the new type's finish (the opening render
            // map is resolved at wall-build time). wallId lets the handler target it.
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:   elementData.id,
                elementType: 'door',
                newTypeId:   payload.systemTypeId,
                wallId:      elementData.wallId ?? elementData.hostId ?? undefined,
            })
                ?.then(() => host.onRerender({ ...elementData, systemTypeId: payload.systemTypeId }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (door) failed:', e));
        });
    }

    if (elType === 'window') {
        return buildWindowTypeSelectorWidget(elementData, (payload) => {
            if (!payload.systemTypeId) return;
            // §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105) — see door branch above.
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:   elementData.id,
                elementType: 'window',
                newTypeId:   payload.systemTypeId,
                wallId:      elementData.wallId ?? elementData.hostId ?? undefined,
            })
                ?.then(() => host.onRerender({ ...elementData, systemTypeId: payload.systemTypeId }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (window) failed:', e));
        });
    }

    if (elType === 'column') {
        return buildColumnTypeSelectorWidget(elementData, (payload) => {
            const updates: Record<string, any> = { profile: payload.profile, width: payload.width, depth: payload.depth };
            if (payload.steelProfileName !== undefined) updates.steelProfileName = payload.steelProfileName;
            // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — was 'column.update', the 3D-gizmo MOVE
            // bridge. The mutation landed, but that bridge only records a ring-buffer
            // PatchPair when the caller opts in with `_recordUndo` + `_prev` (which the
            // drag-end supplies and this widget did not) — and `column` IS ring-covered, so
            // Ctrl+Z after a profile swap popped the column's CREATE and DELETED it (L-68).
            // Routed onto the uniform 'element.changeType' surface, which runs the same
            // UpdateColumnCommand and pushes the swap's ring entry unconditionally.
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:        elementData.id,
                elementType:      'column',
                newTypeId:        payload.profile,
                width:            payload.width,
                depth:            payload.depth,
                steelProfileName: payload.steelProfileName,
            })
                ?.then(() => host.onRerender({ ...elementData, ...updates }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (column) failed:', e));
        });
    }

    if (elType === 'beam') {
        return buildBeamTypeSelectorWidget(elementData, (payload) => {
            const updates: Record<string, any> = { sectionType: payload.sectionType, width: payload.width, depth: payload.depth };
            if (payload.steelProfileName !== undefined) updates.steelProfileName = payload.steelProfileName;
            // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — see the column branch above; identical
            // defect ('beam.update' is the move bridge, `beam` is ring-covered).
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:        elementData.id,
                elementType:      'beam',
                newTypeId:        payload.sectionType,
                width:            payload.width,
                depth:            payload.depth,
                steelProfileName: payload.steelProfileName,
            })
                ?.then(() => host.onRerender({ ...elementData, ...updates }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (beam) failed:', e));
        });
    }

    if (elType === 'stair-railing' || elType === 'stairrailing') {
        // §FIX-STAIR-RAILING-TYPE-PICKER — the founder's defect. Only the standalone
        // handrail branch below existed, and a stair railing never matched it, so
        // `_buildTypeSelector` returned null and the panel rendered no picker.
        //
        // Only the catalogue id travels: `StairRailingConfig` carries a `typeId`, so the
        // catalogue → construction-form projection lives ONCE, in the bus handler
        // (`resolveStairRailingTypeFields`), reachable identically by the AI plane and
        // collaboration replay. The handrail branch below must materialise in the widget
        // instead only because `HandrailData` has no typeId to resolve from.
        return buildStairRailingTypeSelectorWidget(elementData, (payload) => {
            if (!payload.typeId) return;
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:   elementData.id,
                elementType: 'stair-railing',
                newTypeId:   payload.typeId,
            })
                ?.then(() => host.onRerender({ ...elementData, typeId: payload.typeId }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (stair-railing) failed:', e));
        });
    }

    if (elType === 'railing' || elType === 'handrail' || elType === 'guardrail') {
        // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — railing/handrail had NO type selector at
        // all, though HandrailTypeStore has shipped five built-in types since it was
        // authored (authored-but-unwired, exactly as ceilings were in L-621). The widget
        // resolves the HandrailTypeDefinition and passes its CONCRETE fields, mirroring how
        // the wall/floor/slab widgets pass `layers` + `thickness`: HandrailData carries no
        // `typeId`, so a railing type is materialised into the record, not referenced.
        return buildRailingTypeSelectorWidget(elementData, (payload) => {
            if (!payload.typeId) return;
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:     elementData.id,
                elementType:   'railing',
                newTypeId:     payload.typeId,
                height:        payload.height,
                thickness:     payload.thickness,
                baseOffset:    payload.baseOffset,
                fillType:      payload.fillType,
                railProfile:   payload.railProfile,
                railDiameter:  payload.railDiameter,
                postSpacing:   payload.postSpacing,
                materialColor: payload.materialColor,
                // §FEAT-HANDRAIL-TYPE-LIBRARY-20 (C95 D5) — the infill members, so a
                // RETYPE applies the same railing a CREATE with that type does.
                balusterShape:   payload.balusterShape,
                balusterWidth:   payload.balusterWidth,
                balusterSpacing: payload.balusterSpacing,
                infillMaxGap:    payload.infillMaxGap,
            })
                ?.then(() => host.onRerender({ ...elementData, ...payload }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (railing) failed:', e));
        });
    }

    if (elType === 'plumbingfixture' || elType === 'plumbing_fixture' || elType === 'plumbing') {
        return buildPlumbingTypeSelectorWidget(elementData, (payload) => {
            if (!payload.toiletVariant && !payload.showerVariant) return;
            // §FIX-PLUMBING-TYPE-SWAP (L-622) — the previous dispatch was
            // 'plumbing.setSystem', which could never have applied: its handler validates
            // { plumbingId, systemTag } (not { id, toiletVariant }) and then writes a
            // DETACHED plugin Immer store that no plumbing creation path populates. The
            // verb is not in the command-bus payload map, so TypeScript never caught the
            // mismatch. Routed through the uniform 'element.changeType' (ADR-0105), which
            // for plumbing runs UpdatePlumbingParametersCommand on the LEGACY
            // plumbingStore → PlumbingFragmentBuilder.updateFixture() (Contract 39 §3).
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:     elementData.id,
                elementType:   'plumbing',
                newTypeId:     payload.toiletVariant ?? payload.showerVariant ?? '',
                toiletVariant: payload.toiletVariant,
                showerVariant: payload.showerVariant,
            })?.then(() => {
                const merged: Record<string, any> = { ...elementData };
                if (payload.toiletVariant) merged.toiletVariant = payload.toiletVariant;
                if (payload.showerVariant) merged.showerVariant = payload.showerVariant;
                host.onRerender(merged);
            })?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (plumbing) failed:', e));
        });
    }

    if (elType === 'furniture') {
        // §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105) — swap a placed furniture element's
        // type/asset in place (a sofa → another sofa), preserving id + transform +
        // host. Routes through the uniform 'element.changeType' command, which for
        // furniture runs ChangeFurnitureTypeCommand on the legacy furniture store →
        // store.update() → 'bim-furniture-updated' → FurnitureFragmentBuilder rebuilds
        // the mesh with the new type's builder. Undoable in one step.
        return buildFurnitureTypeSelectorWidget(elementData, (payload) => {
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:         elementData.id,
                elementType:       'furniture',
                newTypeId:         payload.newFurnitureType,
                furnitureCategory: payload.furnitureCategory,
                width:             payload.width,
                length:            payload.length,
                height:            payload.height,
                baseOffset:        payload.baseOffset,
                color:             payload.color,
                material:          payload.material,
            })
                ?.then(() => host.onRerender({ ...elementData, furnitureType: payload.newFurnitureType }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (furniture) failed:', e));
        });
    }

    if (elType === 'stair' || elType === 'stairs') {
        return buildStairTypeSelectorWidget(elementData, (payload) => {
            if (!payload.typeId) return;
            // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — was 'stair.updateParameters'. Unlike the
            // door/floor/slab/ceiling defects this one DID mutate (the plugin handler is
            // itself a commandManager bridge to UpdateStairParametersCommand, which rebuilds
            // the flight because `typeId` is in its GEOMETRY_KEYS) — but it declares
            // `affectedStores: []` and returns empty patches, while `stair` IS covered by
            // buildUndoStoreMap(). No ring entry ⇒ ring-first Ctrl+Z popped the stair's
            // CREATE and deleted it (L-68). Routed onto the uniform surface, which runs the
            // SAME legacy command and adds the swap's ring entry.
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:   elementData.id,
                elementType: 'stair',
                newTypeId:   payload.typeId,
            })
                ?.then(() => host.onRerender({ ...elementData, typeId: payload.typeId }))
                ?.catch((e: unknown) => console.warn('[PropertyPanel] element.changeType (stair) failed:', e));
        });
    }

    // ── §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — the declarative fall-through ─────
    //
    // Everything the bespoke ladder above did not claim. A family that declares a
    // catalogue gets the SAME picker and the SAME `element.changeType` dispatch
    // without a branch being written for it; a family that declares it has no
    // catalogue gets an honest sentence instead of an empty header, which is what
    // the founder actually saw ("Element Type —", no dropdown, no explanation).
    //
    // The dispatch carries only `{ elementId, elementType, newTypeId }` — the
    // uniform payload (ADR-0105). A family needing more than a type id belongs on a
    // bespoke widget above, by construction.
    const catalog = resolveElementTypeCatalog(elType);
    if (catalog) {
        const dispatchable = !!catalog.listTypes && !catalog.readOnlyReason;
        return buildGenericTypeSelectorWidget(catalog, elementData, (payload) => {
            if (!dispatchable || !payload.typeId) return;
            window.runtime?.bus?.executeCommand('element.changeType', {
                elementId:   elementData.id,
                elementType: catalog.family,
                newTypeId:   payload.typeId,
            })
                // No local field merge: the registry declares HOW to read a family's
                // current type, not how to write it. `onRerender` re-enriches from the
                // geometry store, which is the authoritative post-swap value — merging a
                // guess here is how a panel starts reporting a type the store does not have.
                ?.then(() => host.onRerender({ ...elementData }))
                ?.catch((e: unknown) => console.warn(`[PropertyPanel] element.changeType (${catalog.family}) failed:`, e));
        });
    }

    return null;
}
