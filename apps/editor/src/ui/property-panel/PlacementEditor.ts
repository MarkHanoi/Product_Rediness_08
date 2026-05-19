/**
 * PlacementEditor
 *
 * Renders the Spatial Context section of the property panel.
 * Dynamically adapts the fields shown based on the element's placement schema.
 *
 * Supported placement schemas:
 *  - WallPlacement   : startX, startZ, endX, endZ, height, levelId
 *  - SlabPlacement   : polygonVertices, thickness, levelId
 *  - HostedPlacement : hostId, positionAlongHost, sillHeight, flip (window/door)
 *  - StairPlacement  : baseLevelId, topLevelId, width
 *  - Generic         : levelId, baseOffset, position
 *
 * Contract: Tool Layer only. Read-only access to element data. No store writes.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { normalizeType } from './PropertyDescriptorGenerator';

export interface PlacementInfo {
    schema: string;
    fields: {
        label: string;
        value: string;
        editable: boolean;
        key?: string;
        /** Raw numeric value used as input's initial value when editable: true */
        rawValue?: number;
    }[];
}

/**
 * Extracts placement info from element data.
 * Used by the PropertyPanel to populate the Spatial Context section.
 */
export function extractPlacementInfo(elementData: Record<string, any>): PlacementInfo {
    const type = normalizeType(elementData.elementType || elementData.type || '');

    switch (type) {
        case 'wall':
            return extractWallPlacement(elementData);
        case 'slab':
            return extractSlabPlacement(elementData);
        case 'window':
        case 'door':
            return extractHostedPlacement(elementData);
        case 'stairs':
            return extractStairPlacement(elementData);
        case 'curtainwall':
            return extractCurtainWallPlacement(elementData);
        default:
            return extractGenericPlacement(elementData);
    }
}

function extractWallPlacement(d: Record<string, any>): PlacementInfo {
    const bl = d.baseLine;
    const start = bl?.[0];
    const end = bl?.[1];

    const fields: PlacementInfo['fields'] = [];

    if (start instanceof THREE.Vector3) {
        fields.push({ label: 'Start X', value: start.x.toFixed(3) + ' m', editable: false });
        fields.push({ label: 'Start Z', value: start.z.toFixed(3) + ' m', editable: false });
    } else if (start) {
        fields.push({ label: 'Start X', value: String((start.x ?? 0).toFixed ? (start.x).toFixed(3) : start.x) + ' m', editable: false });
        fields.push({ label: 'Start Z', value: String((start.z ?? 0).toFixed ? (start.z).toFixed(3) : start.z) + ' m', editable: false });
    }

    if (end instanceof THREE.Vector3) {
        fields.push({ label: 'End X', value: end.x.toFixed(3) + ' m', editable: false });
        fields.push({ label: 'End Z', value: end.z.toFixed(3) + ' m', editable: false });
    } else if (end) {
        fields.push({ label: 'End X', value: String((end.x ?? 0).toFixed ? (end.x).toFixed(3) : end.x) + ' m', editable: false });
        fields.push({ label: 'End Z', value: String((end.z ?? 0).toFixed ? (end.z).toFixed(3) : end.z) + ' m', editable: false });
    }

    if (start && end) {
        const dx = (end.x ?? 0) - (start.x ?? 0);
        const dz = (end.z ?? 0) - (start.z ?? 0);
        const len = Math.sqrt(dx * dx + dz * dz);
        fields.push({
            label: 'Length',
            value: len.toFixed(3) + ' m',
            editable: true,
            key: 'length',
            rawValue: len,
        });
    }

    if (d.levelId) {
        const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const level = bimManager?.getLevelById(d.levelId);
        fields.push({ label: 'Level', value: level ? `${level.name} (${level.elevation}m)` : d.levelId, editable: false });
    }

    if (d.baseOffset !== undefined) {
        fields.push({ label: 'Base Offset', value: d.baseOffset + ' m', editable: false, key: 'baseOffset' });
    }

    if (d.flip !== undefined) {
        fields.push({ label: 'Flipped', value: d.flip ? 'Yes' : 'No', editable: false });
    }

    return { schema: 'WallPlacement', fields };
}

function extractSlabPlacement(d: Record<string, any>): PlacementInfo {
    const fields: PlacementInfo['fields'] = [];

    if (d.levelId) {
        const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const level = bimManager?.getLevelById(d.levelId);
        fields.push({ label: 'Level', value: level ? `${level.name} (${level.elevation}m)` : d.levelId, editable: false });
    }

    if (d.baseOffset !== undefined) {
        fields.push({ label: 'Base Offset', value: d.baseOffset + ' m', editable: false, key: 'baseOffset' });
    }

    const verts = d.polygonVertices ?? d.polygon;
    if (Array.isArray(verts) && verts.length > 0) {
        fields.push({ label: 'Polygon Vertices', value: `${verts.length} points`, editable: false });
    } else if (d.width !== undefined && d.depth !== undefined) {
        fields.push({ label: 'Width', value: d.width + ' m', editable: false });
        fields.push({ label: 'Depth', value: d.depth + ' m', editable: false });
    }

    return { schema: 'SlabPlacement', fields };
}

function extractHostedPlacement(d: Record<string, any>): PlacementInfo {
    const fields: PlacementInfo['fields'] = [];

    const wallId = d.wallId ?? d.hostId ?? d.parentId;
    if (wallId) {
        const wallStore = window.wallStore; // TODO(E.wall.S): legacy wallStore — replace with runtime.stores.wall
        const wall = wallStore?.getById?.(wallId);
        fields.push({ label: 'Host Wall', value: wall ? (wall.properties?.mark || wallId.substring(0, 12)) : wallId.substring(0, 12), editable: false });
    }

    if (d.positionAlongHost !== undefined) {
        fields.push({ label: 'Position Along Host', value: d.positionAlongHost?.toFixed(3) + ' m', editable: false });
    }

    if (d.sillHeight !== undefined) {
        fields.push({ label: 'Sill Height', value: d.sillHeight + ' m', editable: false, key: 'sillHeight' });
    }

    if (d.flip !== undefined) {
        fields.push({ label: 'Flipped', value: d.flip ? 'Yes' : 'No', editable: false });
    }

    return { schema: 'HostedPlacement', fields };
}

function extractStairPlacement(d: Record<string, any>): PlacementInfo {
    const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
    const fields: PlacementInfo['fields'] = [];

    if (d.baseLevelId) {
        const lvl = bimManager?.getLevelById(d.baseLevelId);
        fields.push({ label: 'Base Level', value: lvl ? `${lvl.name} (${lvl.elevation}m)` : d.baseLevelId, editable: false });
    }

    if (d.topLevelId) {
        const lvl = bimManager?.getLevelById(d.topLevelId);
        fields.push({ label: 'Top Level', value: lvl ? `${lvl.name} (${lvl.elevation}m)` : d.topLevelId, editable: false });
    }

    if (d.riserCount !== undefined && d.riserHeight !== undefined) {
        const totalHeight = d.riserCount * d.riserHeight;
        fields.push({ label: 'Total Height', value: totalHeight.toFixed(3) + ' m', editable: false });
    }

    return { schema: 'StairPlacement', fields };
}

function extractCurtainWallPlacement(d: Record<string, any>): PlacementInfo {
    const fields = extractWallPlacement(d).fields;
    return { schema: 'CurtainWallPlacement', fields };
}

function extractGenericPlacement(d: Record<string, any>): PlacementInfo {
    const fields: PlacementInfo['fields'] = [];

    if (d.levelId) {
        const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const level = bimManager?.getLevelById(d.levelId);
        fields.push({ label: 'Level', value: level ? `${level.name} (${level.elevation}m)` : d.levelId, editable: false });
    }

    if (d.baseOffset !== undefined) {
        fields.push({ label: 'Base Offset', value: d.baseOffset + ' m', editable: false, key: 'baseOffset' });
    }

    const pos = d.position;
    if (pos) {
        fields.push({ label: 'X', value: (pos.x ?? 0).toFixed(3) + ' m', editable: false });
        fields.push({ label: 'Y', value: (pos.y ?? 0).toFixed(3) + ' m', editable: false });
        fields.push({ label: 'Z', value: (pos.z ?? 0).toFixed(3) + ' m', editable: false });
    }

    return { schema: 'GenericPlacement', fields };
}

/**
 * Renders the placement info as a DOM element.
 *
 * @param info       - Placement info produced by extractPlacementInfo().
 * @param onCommit   - Optional callback invoked when an editable field is
 *                     committed (blur or Enter).  Receives the field key and
 *                     the new numeric value entered by the user.
 *                     If omitted, editable fields still render as inputs but
 *                     changes are silently ignored.
 */
export function renderPlacementSection(
    info: PlacementInfo,
    onCommit?: (key: string, newValue: number) => void,
): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display:grid;grid-template-columns:110px 1fr;gap:5px 8px;align-items:center;';

    const schemaTag = document.createElement('div');
    schemaTag.style.cssText = 'grid-column:1/span 2;font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;';
    schemaTag.textContent = info.schema;
    container.appendChild(schemaTag);

    if (info.fields.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'grid-column:1/span 2;font-size:11px;color:#bbb;font-style:italic;';
        empty.textContent = 'No placement data';
        container.appendChild(empty);
        return container;
    }

    info.fields.forEach(f => {
        const label = document.createElement('div');
        label.style.cssText = 'font-size:11px;color:#555;';
        label.textContent = f.label;

        container.appendChild(label);

        if (f.editable && f.key && onCommit) {
            // Render an editable numeric input for this field
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.step = '0.001';
            inp.min  = '0.1';
            inp.value = f.rawValue !== undefined
                ? String(Math.round(f.rawValue * 1000) / 1000)
                : String(parseFloat(f.value));
            inp.style.cssText = [
                'font-size:11px',
                'color:#1a56db',
                'font-weight:600',
                'padding:2px 6px',
                'background:#eef5ff',
                'border:1px solid #93c5fd',
                'border-radius:4px',
                'font-family:monospace',
                'width:100%',
                'box-sizing:border-box',
            ].join(';');
            inp.title = `Edit ${f.label}`;

            const commit = () => {
                const v = parseFloat(inp.value);
                if (!isNaN(v) && v > 0 && f.key) {
                    onCommit(f.key, v);
                }
            };
            inp.addEventListener('blur',  commit);
            inp.addEventListener('keydown', (ev: KeyboardEvent) => {
                if (ev.key === 'Enter') { ev.preventDefault(); commit(); inp.blur(); }
                if (ev.key === 'Escape') { inp.blur(); }
            });

            container.appendChild(inp);
        } else {
            // Read-only display
            const value = document.createElement('div');
            value.style.cssText = 'font-size:11px;color:#333;padding:2px 6px;background:#f4f4f4;border-radius:4px;font-family:monospace;';
            value.textContent = f.value;
            container.appendChild(value);
        }
    });

    return container;
}
