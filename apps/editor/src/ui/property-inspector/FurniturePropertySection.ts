/**
 * @file src/ui/property-inspector/FurniturePropertySection.ts
 *
 * Lifted from PropertyInspector.ts (updateLevelIdentitySection furniture branch)
 * — Wave 14 god-file split.
 *
 * Renders the Spatial Identity extras for furniture, kitchen, wardrobe, and
 * plumbing-fixture element types into the level-identity content container.
 *
 * Pure DOM factory — no class state, no `this` references.
 * All window.* reaches are preserved with their original TODO annotations.
 */

import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

type AddPropFn = (
    parent: HTMLElement,
    label: string,
    value: any,
    readonly?: boolean,
    key?: string,
) => void;

/**
 * Appends furniture / kitchen-cabinet / wardrobe / plumbing-fixture identity
 * properties into the Spatial Identity section content container.
 *
 * @param content     Level-identity section body element
 * @param data        element userData (Three.js Object3D.userData)
 * @param elementId   element UUID
 * @param addProp     Bound reference to PropertyInspector.addProperty()
 */
export function appendFurnitureIdentitySection(
    content: HTMLElement,
    data: any,
    elementId: string,
    addProp: AddPropFn,
): void {
    const normalizedType = (data.elementType || data.type || '').toLowerCase();

    // ── Furniture / Wardrobe ────────────────────────────────────────────────
    if (
        normalizedType === 'furniture' ||
        data.furnitureType?.startsWith('plant_') ||
        data.furnitureType === 'bed' ||
        data.furnitureType === 'table' ||
        data.furnitureType === 'chair' ||
        data.furnitureType === 'dining_table' ||
        data.furnitureType === 'dining_chair' ||
        data.furnitureType === 'wardrobe' ||
        data.furnitureType === 'corner_wardrobe'
    ) {
        const furniture = window.furnitureStore?.get(elementId); // TODO(E.furniture.S): replace with runtime.stores.furniture — Phase E.furniture.S
        if (!furniture) return;

        // Sync wardrobe config into top-level fields if missing
        if (furniture.furnitureType === 'wardrobe' || furniture.furnitureType === 'wardrobe_glass_door') {
            if (furniture.wardrobeConfig) {
                furniture.width  = furniture.wardrobeConfig.width  || furniture.width;
                furniture.length = furniture.wardrobeConfig.depth  || furniture.length;
                furniture.height = furniture.wardrobeConfig.height || furniture.height;
            }
        }

        addProp(content, 'Furniture Type', furniture.furnitureType, true);

        if (furniture.kitchenConfig) {
            // ── Kitchen cabinet layout properties ──────────────────────────
            const kc = furniture.kitchenConfig as any;
            const kLayout: string = kc.layoutType ?? '';
            const kIsArm = kLayout === 'kitchen_l_shape' || kLayout === 'kitchen_u_shape'
                        || kLayout === 'kitchen_l_shape_tall' || kLayout === 'kitchen_u_shape_tall';
            const kIsU   = kLayout === 'kitchen_u_shape' || kLayout === 'kitchen_u_shape_tall';

            const KITCHEN_LAYOUT_LABELS: Record<string, string> = {
                kitchen_straight:      'Straight Run',
                kitchen_l_shape:       'L-Shape',
                kitchen_u_shape:       'U-Shape',
                kitchen_island:        'Island',
                kitchen_straight_tall: 'Straight + Wall Cabinets',
                kitchen_l_shape_tall:  'L-Shape + Wall Cabinets',
                kitchen_u_shape_tall:  'U-Shape + Wall Cabinets',
            };
            addProp(content, 'Layout', KITCHEN_LAYOUT_LABELS[kLayout] ?? kLayout, true);
            addProp(content, 'Cabinet Depth (m)', +(kc.depth  ?? 0.60).toFixed(2), true);
            addProp(content, 'Main Arm Length (m)', +(kc.length ?? 3.00).toFixed(2), true);
            addProp(content, 'Base Height (m)', +(kc.height  ?? 0.90).toFixed(2), true);
            addProp(content, 'Main Units', +(kc.numUnits  ?? 5), true);

            if (kIsArm) {
                addProp(content, 'Left Arm Length (m)', +(kc.lengthLeft    ?? 1.80).toFixed(2), true);
                addProp(content, 'Left Arm Units',       +(kc.numUnitsLeft ?? 3), true);
            }
            if (kIsU) {
                addProp(content, 'Right Arm Length (m)', +(kc.lengthRight    ?? 1.80).toFixed(2), true);
                addProp(content, 'Right Arm Units',       +(kc.numUnitsRight ?? 3), true);
            }

            const matHeader = document.createElement('div');
            matHeader.style.cssText = [
                'grid-column:1/-1',
                'font-size:9px',
                'font-weight:700',
                'text-transform:uppercase',
                'letter-spacing:0.06em',
                'color:var(--app-text-muted,#888)',
                'margin-top:8px',
                'padding-top:6px',
                'border-top:1px solid var(--app-border,#eee)',
            ].join(';');
            matHeader.textContent = 'Materials';
            content.appendChild(matHeader);

            const resolveMat = (id?: string) => {
                if (!id) return '– custom colour –';
                const m = STANDARD_MATERIAL_LIBRARY.find(m => m.id === id);
                return m ? m.label : id;
            };
            addProp(content, 'Carcass Body',  resolveMat(kc.carcassMaterialId),   true);
            addProp(content, 'Door / Front',  resolveMat(kc.frontMaterialId),      true);
            addProp(content, 'Countertop',    resolveMat(kc.countertopMaterialId), true);

            const editKitchenBtn = document.createElement('button');
            editKitchenBtn.type = 'button';
            editKitchenBtn.textContent = 'Edit Kitchen Layout';
            editKitchenBtn.style.cssText = [
                'grid-column:1/-1',
                'margin-top:10px',
                'padding:8px 12px',
                'background:var(--app-accent,#6600ff)',
                'color:#fff',
                'border:none',
                'border-radius:8px',
                'font-size:11px',
                'font-weight:700',
                'cursor:pointer',
                'width:100%',
                'letter-spacing:0.03em',
            ].join(';');
            editKitchenBtn.addEventListener('click', () => {
                const kri = window.kitchenRunInspector; // TODO(E.kitchen.X): replace with runtime.tools.activate(kitchen) — Phase E.kitchen.X
                if (kri && furniture.id) kri.show(furniture.id);
            });
            content.appendChild(editKitchenBtn);
        } else {
            // ── Generic furniture properties ─────────────────────────────
            addProp(content, 'Width',       furniture.width,                false, 'width');
            addProp(content, 'Length',      furniture.length,               false, 'length');
            addProp(content, 'Height',      furniture.height,               false, 'height');
            addProp(content, 'Base Offset', furniture.baseOffset,           false, 'baseOffset');
            addProp(content, 'Material',    furniture.material,             true);
            addProp(content, 'Color',       furniture.color || '#8b4513',   false, 'color');
        }

        if (furniture.furnitureType === 'corner_wardrobe') {
            addProp(content, 'Width (Branch Two)',  furniture.widthBranchTwo  ?? 0.6,                                         false, 'widthBranchTwo');
            addProp(content, 'Length (Branch Two)', furniture.lengthBranchTwo ?? (furniture.wardrobeConfig?.lengthBranchTwo ?? furniture.length), false, 'lengthBranchTwo');

            const behaviorLabel = document.createElement('div');
            behaviorLabel.className = 'pi-label';
            behaviorLabel.textContent = 'Corner Connection';
            const behaviorSelect = document.createElement('select');
            behaviorSelect.className = 'pi-input';
            behaviorSelect.setAttribute('data-key', 'cornerBehavior');

            const behaviors = [
                { value: 'branch1-dominant', label: 'Branch 1 Dominant' },
                { value: 'branch2-dominant', label: 'Branch 2 Dominant' },
                { value: 'corner-module',    label: 'Corner Module' }
            ];

            behaviors.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.value;
                opt.textContent = b.label;
                if ((furniture.wardrobeConfig?.cornerBehavior || 'branch1-dominant') === b.value) opt.selected = true;
                behaviorSelect.appendChild(opt);
            });

            behaviorSelect.addEventListener('change', (e: any) => {
                console.log("[INSPECTOR] Corner behavior changed to:", e.target.value);
            });

            content.appendChild(behaviorLabel);
            content.appendChild(behaviorSelect);
        }

        if (furniture.lo3 !== undefined) {
            addProp(content, 'LO3', furniture.lo3, false, 'lo3');
        }

        if (
            furniture.furnitureType === 'wardrobe' ||
            normalizedType === 'wardrobe' ||
            furniture.furnitureType === 'wardrobe_glass_door'
        ) {
            addProp(content, 'Thickness',   furniture.length,                          false, 'length');
            addProp(content, 'Show Doors',  furniture.wardrobeConfig?.showDoors !== false, false, 'showDoors');
            addProp(content, 'Show Debug',  furniture.wardrobeConfig?.showDebug === true,  false, 'showDebug');
        }
        return;
    }

    // ── Plumbing fixture ────────────────────────────────────────────────────
    if (
        normalizedType === 'plumbing_fixture' ||
        normalizedType === 'toilet' ||
        normalizedType === 'sink' ||
        normalizedType === 'plumbingfixture' ||
        normalizedType === 'bath'
    ) {
        const fixture = window.plumbingStore?.get(elementId); // TODO(E.plumbing.S): replace with runtime.stores.plumbing — Phase E.plumbing.S
        if (!fixture) return;

        addProp(content, 'Fixture Type', fixture.fixtureType, true);
        addProp(content, 'Level ID',     fixture.levelId,     true);
        addProp(content, 'Level Name',   fixture.levelName,   true);
        if (fixture.fixtureType === 'bath') {
            addProp(content, 'Width',       fixture.width       || 1.7,       false, 'width');
            addProp(content, 'Length',      fixture.length      || 0.75,      false, 'length');
            addProp(content, 'Height',      fixture.height      || 0.6,       false, 'height');
            addProp(content, 'Base Offset', fixture.baseOffset  || 0,         false, 'baseOffset');
            addProp(content, 'Color',       fixture.color       || '#ffffff', false, 'color');
        }
    }
}
