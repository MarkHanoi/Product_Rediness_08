/**
 * PropertyDescriptorGenerator
 *
 * Generates PropertyDescriptor[] from element data.
 * Schema-driven — no element-specific UI logic lives in the panel itself.
 * Adding a new element type means adding a new schema here only.
 *
 * Contract: Tool Layer only. No store writes, no scene access.
 */

import { PropertyDescriptor, PropertyInputType } from './types';

type SchemaEntry = Omit<PropertyDescriptor, 'key'>;

const TEXT = (label: string, section: PropertyDescriptor['section'], category: PropertyDescriptor['category'], editable = true, opts?: Partial<SchemaEntry>): SchemaEntry =>
    ({ label, type: 'text', section, category, editable, ...opts });

const NUMBER = (label: string, section: PropertyDescriptor['section'], category: PropertyDescriptor['category'], editable = true, opts?: Partial<SchemaEntry>): SchemaEntry =>
    ({ label, type: 'number', section, category, editable, ...opts });

const READONLY = (label: string, section: PropertyDescriptor['section']): SchemaEntry =>
    ({ label, type: 'readonly', section, category: 'global', editable: false });

const BOOL = (label: string, section: PropertyDescriptor['section'], category: PropertyDescriptor['category'], editable = true): SchemaEntry =>
    ({ label, type: 'boolean', section, category, editable });

const ENUM = (label: string, section: PropertyDescriptor['section'], category: PropertyDescriptor['category'], options: string[], editable = true): SchemaEntry =>
    ({ label, type: 'enum', section, category, editable, options });

const COLOR = (label: string, section: PropertyDescriptor['section'], category: PropertyDescriptor['category'], editable = true): SchemaEntry =>
    ({ label, type: 'color', section, category, editable });

type ElementSchema = Record<string, SchemaEntry>;

const SCHEMAS: Record<string, ElementSchema> = {
    // §6.5 Room ↔ Element Bidirectional Lookup Contract — every element schema
    // exposes a read-only `room` row in the Spatial section, sitting next to
    // `levelId`. Value is injected by `PropertyPanel.enrichFromStores()` via
    // `roomContentsService.getRoomForElement()` and shows the room's display
    // name (or '—' when the element is not in any room).
    wall: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        height:          NUMBER('Height', 'instance', 'instance', true, { unit: 'm', min: 0.1, max: 20 }),
        // §03-WALL-THICKNESS-CONTRACT: Wall thickness is derived from the layer stack.
        // It is read-only here; change it by editing layer thicknesses in the Layers editor.
        thickness:       READONLY('Thickness (m)', 'definition'),
        materialColor:   COLOR('Color Override', 'definition', 'definition'),
        levelId:         READONLY('Level ID', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        baseOffset:      NUMBER('Base Offset', 'instance', 'instance', true, { unit: 'm' }),
        startX:          READONLY('Start X', 'spatial'),
        startZ:          READONLY('Start Z', 'spatial'),
        endX:            READONLY('End X', 'spatial'),
        endZ:            READONLY('End Z', 'spatial'),
        loadBearing:     BOOL('Load Bearing', 'definition', 'definition'),
        fireRating:      TEXT('Fire Rating', 'definition', 'definition'),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    slab: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        thickness:       NUMBER('Thickness', 'definition', 'definition', true, { unit: 'm', min: 0.01, max: 2 }),
        materialColor:   COLOR('Color Override', 'definition', 'definition'),
        levelId:         READONLY('Level ID', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        baseOffset:      NUMBER('Base Offset', 'instance', 'instance', true, { unit: 'm' }),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    window: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        // DW-10: width, height, sillHeight, windowType, frameColor, fireRating
        // are rendered authoritatively by WindowSection — omitted here to prevent duplication.
        wallId:          READONLY('Host Wall', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    door: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        // DW-10: width, height, sillHeight, doorType, frameColor, fireRating
        // are rendered authoritatively by DoorSection — omitted here to prevent duplication.
        accessibilityType: ENUM('Accessibility', 'definition', 'definition', ['Standard', 'Accessible', 'MotorizedSlide']),
        wallId:          READONLY('Host Wall', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    column: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        width:           NUMBER('Width', 'definition', 'definition', true, { unit: 'm', min: 0.05, max: 5 }),
        depth:           NUMBER('Depth', 'definition', 'definition', true, { unit: 'm', min: 0.05, max: 5 }),
        height:          NUMBER('Height', 'instance', 'instance', true, { unit: 'm', min: 0.1, max: 20 }),
        materialColor:   COLOR('Color Override', 'definition', 'definition'),
        levelId:         READONLY('Level ID', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        baseOffset:      NUMBER('Base Offset', 'instance', 'instance', true, { unit: 'm' }),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    beam: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        width:           NUMBER('Width', 'definition', 'definition', true, { unit: 'm', min: 0.05, max: 2 }),
        height:          NUMBER('Height', 'definition', 'definition', true, { unit: 'm', min: 0.05, max: 2 }),
        materialColor:   COLOR('Color Override', 'definition', 'definition'),
        levelId:         READONLY('Level ID', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        baseOffset:      NUMBER('Base Offset', 'instance', 'instance', true, { unit: 'm' }),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    stairs: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        width:           NUMBER('Width', 'definition', 'definition', true, { unit: 'm', min: 0.9, max: 5 }),
        riserHeight:     NUMBER('Riser Height', 'definition', 'definition', true, { unit: 'm', min: 0.150, max: 0.220 }),
        treadDepth:      NUMBER('Tread Depth', 'definition', 'definition', true, { unit: 'm', min: 0.220, max: 0.500 }),
        riserCount:      READONLY('Riser Count', 'spatial'),
        baseLevelId:     READONLY('Base Level', 'spatial'),
        topLevelId:      READONLY('Top Level', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        fireRating:      ENUM('Fire Rating', 'definition', 'definition', ['none', 'FR30', 'FR60', 'FR90', 'FR120']),
        accessibilityType: ENUM('Accessibility', 'definition', 'definition', ['standard', 'accessible']),
        'properties.material':     ENUM('Material', 'definition', 'definition', ['concrete', 'wood', 'steel', 'marble']),
        'properties.stringerType': ENUM('Stringer Type', 'definition', 'definition', ['none', 'closed', 'open', 'mono']),
        'properties.nosingType':   ENUM('Nosing Type', 'definition', 'definition', ['none', 'standard', 'extended']),
        'properties.riserVisible': BOOL('Risers Visible', 'definition', 'definition'),
        'properties.railingType':  ENUM('Handrail Type', 'definition', 'definition', ['none', 'flat-bar', 'glass-panel', 'circular']),
        typeId:          TEXT('Type', 'definition', 'definition'),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    curtainwall: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        height:          NUMBER('Height', 'instance', 'instance', true, { unit: 'm', min: 0.5, max: 50 }),
        // uLineCount / vLineCount are computed readonly fields — derived from
        // the CurtainGridSystem in PropertyPanel.enrichFromStores().
        // The actual grid lines are managed interactively via CurtainGridEditor.
        uLineCount:      READONLY('U-Lines (columns)', 'definition'),
        vLineCount:      READONLY('V-Lines (rows)', 'definition'),
        mullionSize:     NUMBER('Mullion Size', 'definition', 'definition', true, { unit: 'm', min: 0.01, max: 0.5 }),
        panelThickness:  NUMBER('Panel Thickness', 'definition', 'definition', true, { unit: 'm', min: 0.005, max: 0.1 }),
        baseOffset:      NUMBER('Base Offset', 'instance', 'instance', true, { unit: 'm' }),
        levelId:         READONLY('Level ID', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    roof: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        thickness:       NUMBER('Thickness', 'definition', 'definition', true, { unit: 'm', min: 0.01, max: 2 }),
        slope:           NUMBER('Slope', 'definition', 'definition', true, { unit: '%', min: 0, max: 100 }),
        materialColor:   COLOR('Color Override', 'definition', 'definition'),
        levelId:         READONLY('Level ID', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        baseOffset:      NUMBER('Base Offset', 'instance', 'instance', true, { unit: 'm' }),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    furniture: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        furnitureType:   READONLY('Furniture Type', 'definition'),
        width:           NUMBER('Width', 'instance', 'instance', true, { unit: 'm', min: 0.1, max: 20 }),
        length:          NUMBER('Length', 'instance', 'instance', true, { unit: 'm', min: 0.1, max: 20 }),
        height:          NUMBER('Height', 'instance', 'instance', true, { unit: 'm', min: 0.1, max: 10 }),
        baseOffset:      NUMBER('Base Offset', 'instance', 'instance', true, { unit: 'm' }),
        color:           COLOR('Color', 'definition', 'definition'),
        // Material finish — interpreted by builders (e.g. WhiteSofaBuilder
        // switches roughness/sheen/clearcoat between fabric/wood/metal/glass).
        material:        ENUM('Material', 'definition', 'definition', ['wood', 'metal', 'fabric', 'glass']),
        levelId:         READONLY('Level ID', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    handrail: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        height:          NUMBER('Height', 'definition', 'definition', true, { unit: 'm', min: 0.5, max: 2 }),
        thickness:       NUMBER('Thickness', 'definition', 'definition', true, { unit: 'm', min: 0.01, max: 0.2 }),
        baseOffset:      NUMBER('Base Offset', 'instance', 'instance', true, { unit: 'm' }),
        materialColor:   COLOR('Color Override', 'definition', 'definition'),
        levelId:         READONLY('Level ID', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    // §Feasibility — curtain wall sub-element schemas (Phase 1)
    // Used by the descriptor generator to produce fallback rows if needed;
    // the primary rendering for these types is via CurtainSubElementPanel.ts.
    'curtain-panel': {
        id:           READONLY('Element ID', 'identity'),
        type:         READONLY('Element Type', 'identity'),
        curtainWallId: READONLY('Parent Wall', 'spatial'),
        panelType:    ENUM('Panel Type', 'definition', 'definition',
                        ['SystemPanel_Glass', 'SystemPanel_Opaque', 'SystemPanel_Empty']),
        materialOverride: COLOR('Color Override', 'definition', 'definition'),
        ifcClass:     READONLY('IFC Class', 'metadata'),
        globalId:     READONLY('Global ID', 'metadata'),
    },

    'curtain-mullion': {
        id:           READONLY('Element ID', 'identity'),
        type:         READONLY('Element Type', 'identity'),
        curtainWallId: READONLY('Parent Wall', 'spatial'),
        mullionAxis:  READONLY('Orientation', 'definition'),
        mullionT:     READONLY('Position (t)', 'spatial'),
        ifcClass:     READONLY('IFC Class', 'metadata'),
    },
};

const IFC_CLASS_MAP: Record<string, string> = {
    wall:        'IfcWall',
    slab:        'IfcSlab',
    window:      'IfcWindow',
    door:        'IfcDoor',
    column:      'IfcColumn',
    beam:        'IfcBeam',
    stairs:      'IfcStair',
    stair:       'IfcStair',
    curtainwall: 'IfcCurtainWall',
    roof:        'IfcRoof',
    furniture:   'IfcFurnishingElement',
    handrail:    'IfcRailing',
};

function normalizeType(rawType: string): string {
    const t = (rawType || '').toLowerCase().trim();
    if (t === 'stair' || t === 'stairs') return 'stairs';
    if (t === 'curtain-wall' || t === 'curtainwall') return 'curtainwall';
    if (t === 'curtainpanel' || t === 'curtain-panel') return 'curtain-panel';
    if (t === 'curtainmullion' || t === 'curtain-mullion' || t === 'curtainwallpart') return 'curtain-mullion';
    if (['bed', 'table', 'chair', 'sofa', 'wardrobe', 'wardrobe_glass_door', 'corner_wardrobe', 'plumbing'].includes(t)) return 'furniture';
    return t;
}

/**
 * Generate descriptors for a given element.
 * If the type is not recognized, returns a minimal fallback set.
 */
export function generateDescriptors(elementData: Record<string, any>): PropertyDescriptor[] {
    const rawType = elementData.elementType || elementData.type || '';
    const type = normalizeType(rawType);
    const schema = SCHEMAS[type] ?? buildFallbackSchema(elementData);

    return Object.entries(schema).map(([key, entry]) => ({
        key,
        ...entry,
    }));
}

/**
 * Returns only descriptors belonging to the given section.
 */
export function descriptorsForSection(all: PropertyDescriptor[], section: PropertyDescriptor['section']): PropertyDescriptor[] {
    return all.filter(d => d.section === section);
}

/**
 * Builds a minimal fallback descriptor set from an unknown element's keys.
 */
function buildFallbackSchema(elementData: Record<string, any>): ElementSchema {
    const schema: ElementSchema = {
        id:   READONLY('Element ID', 'identity'),
        type: READONLY('Element Type', 'identity'),
    };

    const knownReadOnly = new Set(['id', 'type', 'elementType', 'ifcData', 'childrenIds', 'openings', 'baseLine', 'curve']);

    for (const key of Object.keys(elementData)) {
        if (knownReadOnly.has(key) || key in schema) continue;
        const val = elementData[key];
        if (val === null || val === undefined || typeof val === 'object' || typeof val === 'function') continue;

        let type: PropertyInputType = 'text';
        if (typeof val === 'number') type = 'number';
        else if (typeof val === 'boolean') type = 'boolean';

        schema[key] = {
            label: toLabel(key),
            type,
            section: 'instance',
            category: 'instance',
            editable: true,
        };
    }

    return schema;
}

function toLabel(key: string): string {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
}

/**
 * Gets the IFC class for a given element type.
 */
export function getIfcClass(rawType: string): string {
    return IFC_CLASS_MAP[normalizeType(rawType)] ?? 'IfcBuildingElement';
}

export { normalizeType };
