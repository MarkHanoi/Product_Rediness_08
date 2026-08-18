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
// §FIX-STAIR-PANEL-BOUNDS-DRIFT — the stair rows below derive their min/max from the
// ONE published constraint set instead of restating literals that can (and did) drift
// away from it. `STAIR_CONSTRAINTS` is the same set `UpdateStairParametersCommand`
// and `CreateStairCommand` validate against. Layer-legal: apps/* (L5) → geometry-stair (L2).
import { STAIR_CONSTRAINTS, STAIR_MATERIALS, STAIR_NOSING_TYPES, STAIR_STRINGER_TYPES } from '@pryzm/geometry-stair';
// §WALL-RAKE — bounds come from the ONE authority (ADR-0310 §2.4). Re-typing 15/165
// here would be the second copy of a policy, which is how this repo's drift starts.
// §FEAT-RAKE-LAYERED — `rakeAuthorability` is imported so this panel STOPS holding a
// second copy of the refusal rules. See `rakeRefusalReason` for why that copy was a bug.
import { RAKE_MIN_DEG, RAKE_MAX_DEG, rakeAuthorability } from '@pryzm/geometry-wall';
// §PROP-BEAM-PANEL-LIE — the PUBLISHED beam bounds, never re-typed here.
import { BEAM_CONSTRAINTS } from '@pryzm/core-app-model/stores';

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
        // §WALL-RAKE (ADR-0310) — the lean, as an INSTANCE property. 90 = vertical.
        // Bounds come from the exported constants, never re-typed: one policy, one
        // place (C65 §3.5). Editability is decided PER WALL in generateDescriptors()
        // because three wall shapes refuse a rake outright.
        rakeAngleDeg:    NUMBER('Vertical Angle', 'instance', 'instance', true,
                                { unit: '°', min: RAKE_MIN_DEG, max: RAKE_MAX_DEG }),
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

    // §PROP-BEAM-PANEL-LIE (RAC U9, 2026-08-11) — TWO dead controls removed.
    //
    // This schema offered an editable `height` row and an editable `baseOffset`
    // row. `BeamData` (core-app-model/src/stores/BeamTypes.ts) has NEITHER:
    // it carries `width` and `depth`, and BeamFragmentBuilder builds every
    // section from `beam.width × beam.depth`. A user dragged either row, the
    // panel committed it through element.updateParameters, the store accepted
    // the write, the builder re-ran — and nothing moved. Silent no-op, and the
    // exact defect U7.1 had already removed one layer over (the chat's
    // `set-height` claimed `beam` for the same wrong reason: store routing was
    // mistaken for field existence).
    //
    // `height` becomes DEPTH, the property a beam really has, with the
    // PUBLISHED bounds rather than the invented 0.05–2 (BEAM_CONSTRAINTS is the
    // single authority — C65 §3.5, one policy one place). `baseOffset` is
    // deleted outright: a beam is positioned by its start/end points, so there
    // is no field for the row to become.
    beam: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        width:           NUMBER('Width', 'definition', 'definition', true,
                             { unit: 'm', min: BEAM_CONSTRAINTS.MIN_WIDTH, max: BEAM_CONSTRAINTS.MAX_WIDTH }),
        depth:           NUMBER('Depth', 'definition', 'definition', true,
                             { unit: 'm', min: BEAM_CONSTRAINTS.MIN_DEPTH, max: BEAM_CONSTRAINTS.MAX_DEPTH }),
        materialColor:   COLOR('Color Override', 'definition', 'definition'),
        levelId:         READONLY('Level ID', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    stairs: {
        id:              READONLY('Element ID', 'identity'),
        type:            READONLY('Element Type', 'identity'),
        mark:            TEXT('Mark', 'identity', 'global'),
        // §FIX-STAIR-PANEL-BOUNDS-DRIFT — these three used to carry hand-written
        // bounds that CONTRADICTED STAIR_CONSTRAINTS: riserHeight allowed up to
        // 0.220 m against a MAX_RISER_HEIGHT of 0.190 m, and treadDepth allowed
        // down to 0.220 m against a MIN_TREAD_DEPTH of 0.250 m. Because the panel
        // commits through the GENERIC UpdateElementParameterCommand — which does not
        // consult STAIR_CONSTRAINTS at all, only UpdateStairParametersCommand does —
        // nothing downstream caught it: the panel was the only gate, and it was
        // wrong. Deriving the bounds from the published set closes both the drift and
        // the "two update paths, two validation regimes" split.
        width:           NUMBER('Width', 'definition', 'definition', true, { unit: 'm', min: STAIR_CONSTRAINTS.MIN_WIDTH, max: 5 }),
        riserHeight:     NUMBER('Riser Height', 'definition', 'definition', true, { unit: 'm', min: STAIR_CONSTRAINTS.MIN_RISER_HEIGHT, max: STAIR_CONSTRAINTS.MAX_RISER_HEIGHT }),
        treadDepth:      NUMBER('Tread Depth', 'definition', 'definition', true, { unit: 'm', min: STAIR_CONSTRAINTS.MIN_TREAD_DEPTH, max: 0.500 }),
        riserCount:      READONLY('Riser Count', 'spatial'),
        baseLevelId:     READONLY('Base Level', 'spatial'),
        topLevelId:      READONLY('Top Level', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        fireRating:      ENUM('Fire Rating', 'definition', 'definition', ['none', 'FR30', 'FR60', 'FR90', 'FR120']),
        accessibilityType: ENUM('Accessibility', 'definition', 'definition', ['standard', 'accessible']),
        // §FIX-STAIR-PANEL-ENUM-DRIFT — options come from the published unions, not
        // restated literals. 'wood' used to be offered here and is NOT a StairMaterial
        // (StairMaterialSchema rejects it); 'timber', 'glass' and 'composite' were
        // unreachable; 'rounded' nosing was unreachable.
        'properties.material':     ENUM('Material', 'definition', 'definition', [...STAIR_MATERIALS]),
        'properties.stringerType': ENUM('Stringer Type', 'definition', 'definition', [...STAIR_STRINGER_TYPES]),
        'properties.nosingType':   ENUM('Nosing Type', 'definition', 'definition', [...STAIR_NOSING_TYPES]),
        'properties.riserVisible': BOOL('Risers Visible', 'definition', 'definition'),
        // §FIX-STAIR-PANEL-MISSING-ROWS — three StairProperties fields that the
        // geometry DOES read but that no UI could reach: the only way to change them
        // was to pick a different stair TYPE or issue a raw AI command.
        //   nosingDepth       → StairMeshBuilder (nosing BoxGeometry Z extent)
        //   stringerThickness → StairStringerBuilder (stringer section + side offset)
        //   handrailHeight    → the railing configs' topRailHeight, propagated by
        //                       GenerateStairGeometryCommand._syncRailingProperties
        // They ride the same `properties` expansion and the same
        // GenerateStairGeometryCommand rebuild as the rows above, so each one is
        // wired end-to-end — no row is added here that the geometry cannot consume.
        //
        // DELIBERATELY NOT ADDED: `handrailLeft` / `handrailRight`. Those are read
        // ONCE, by CreateStairCommand.proposeRailings(), to decide which railing
        // records to create; after creation the railings are independent records in
        // StairRailingStore and toggling the boolean would have to CREATE or DELETE
        // one (CreateStairRailingCommand / a delete counterpart), not patch a field.
        // Exposing them before that plumbing exists would manufacture exactly the
        // dead control this pass is removing.
        'properties.nosingDepth':       NUMBER('Nosing Depth', 'definition', 'definition', true, { unit: 'm', min: 0, max: 0.1 }),
        'properties.stringerThickness': NUMBER('Stringer Thickness', 'definition', 'definition', true, { unit: 'm', min: 0.005, max: 0.3 }),
        'properties.handrailHeight':    NUMBER('Handrail Height', 'definition', 'definition', true, { unit: 'm', min: STAIR_CONSTRAINTS.MIN_HANDRAIL_HEIGHT, max: STAIR_CONSTRAINTS.MAX_HANDRAIL_HEIGHT }),
        'properties.railingType':  ENUM('Handrail Type', 'definition', 'definition', ['none', 'flat-bar', 'glass-panel', 'circular']),
        // §FIX-STAIR-TYPEID-TWO-CONTROLS — this was an editable free-TEXT box for a
        // field that names an entry in an enumerated catalogue (BUILT_IN_STAIR_TYPES),
        // and the panel already renders `StairTypeSelectorWidget` — a <select> over that
        // catalogue — for the same field. The two disagreed on more than affordance:
        // the widget dispatches `stair.updateParameters` → UpdateStairParametersCommand,
        // which resolves the chosen type's defaults into the stair; the text box
        // dispatched `element.updateParameters` → UpdateElementParameterCommand, which
        // writes the raw string and applies NO type defaults. Same user intent, two
        // commands, two outcomes — and the text box would happily store a typeId that
        // matches no type at all. The dropdown is the correct control; this row is now
        // a read-only echo of it.
        typeId:          READONLY('Type', 'definition'),
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

    // §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — lighting had no schema, so it fell to
    // `buildFallbackSchema` and rendered the founder's "Element ID —" / "Element Type —".
    // (The deeper cause was the builder stamping those userData keys NON-ENUMERABLE, so
    // the panel's spread dropped them entirely — fixed in LightingFragmentBuilder.)
    // `fixtureType` is READONLY here on purpose: the Railing/Lighting TYPE is changed
    // through the type picker, which dispatches `element.changeType` and rebuilds the
    // fixture. A second, free-text control for the same field is the §FIX-STAIR-TYPEID-
    // TWO-CONTROLS defect one family over.
    lighting: {
        id:              READONLY('Element ID', 'identity'),
        elementType:     READONLY('Element Type', 'identity'),
        fixtureType:     READONLY('Fixture Type', 'identity'),
        // NO `mark` row: `UpdateElementParameterCommand._resolveStore()` has no
        // lighting case, so a Mark box here would be a DEAD control — the exact class
        // §FIX-ELEMENT-MARK-UNHANDLED was written to remove. Offer it when the route exists.
        levelId:         READONLY('Level ID', 'spatial'),
        room:            READONLY('Room', 'spatial'),
        layerName:       READONLY('Layer', 'metadata'),
        ifcClass:        READONLY('IFC Class', 'metadata'),
        globalId:        READONLY('Global ID', 'metadata'),
    },

    // §FIX-STAIR-RAILING-TYPE-PICKER — a STAIR's railing had NO schema, so it fell to
    // `buildFallbackSchema`, whose `type: READONLY('Element Type')` row reads
    // `elementData.type` — a key `StairRailingConfig` does not have (the record and the
    // mesh userData both spell it `elementType`). That is the literal em-dash the founder
    // photographed: not a missing value, a row pointed at the wrong key. The rest of the
    // panel was the fallback's alphabet soup of raw userData keys (Element Id, Stair Id,
    // Selectable, Version) for the same reason.
    'stair-railing': {
        id:              READONLY('Element ID', 'identity'),
        elementType:     READONLY('Element Type', 'identity'),
        typeId:          READONLY('Railing Type', 'identity'),
        railingType:     READONLY('Construction Form', 'definition'),
        topRailHeight:   NUMBER('Top Rail Height', 'definition', 'definition', true, { unit: 'm', min: 0.3, max: 2.5 }),
        handrailHeight:  NUMBER('Handrail Height', 'definition', 'definition', true, { unit: 'm', min: 0.3, max: 2.5 }),
        balusterShape:   ENUM('Baluster Shape', 'definition', 'definition', ['rectangular', 'round']),
        balusterWidth:   NUMBER('Baluster Width', 'definition', 'definition', true, { unit: 'm', min: 0.005, max: 0.3 }),
        balusterSpacing: NUMBER('Baluster Spacing', 'definition', 'definition', true, { unit: 'm', min: 0.02, max: 1 }),
        material:        ENUM('Material', 'definition', 'definition', ['steel', 'chrome', 'wood', 'timber', 'concrete', 'glass']),
        side:            READONLY('Side', 'spatial'),
        stairId:         READONLY('Host Stair', 'spatial'),
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
    // §FIX-STAIR-RAILING-TYPE-PICKER — CreateStairRailingCommand already stamps
    // ifcClass 'IfcRailing' on the record; the panel's fallback said
    // 'IfcBuildingElement', so the two disagreed on the same element.
    'stair-railing': 'IfcRailing',
    lighting:    'IfcLightFixture',
};

function normalizeType(rawType: string): string {
    const t = (rawType || '').toLowerCase().trim();
    if (t === 'stair' || t === 'stairs') return 'stairs';
    // §FIX-STAIR-RAILING-TYPE-PICKER — the mesh userData spells it 'stair-railing' and
    // the store event spells it 'stairRailing'. Both name ONE family; without this the
    // second spelling silently fell through to the fallback schema.
    if (t === 'stair-railing' || t === 'stairrailing') return 'stair-railing';
    // §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — LightingFragmentBuilder stamps 'Lighting',
    // the bus branch also accepts 'light' / 'lightfixture'. One family, one key.
    if (t === 'lighting' || t === 'light' || t === 'lightfixture' || t === 'light-fixture') return 'lighting';
    if (t === 'lift' || t === 'verticalcirculation' || t === 'vertical-circulation') return 'lift';
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

    const descriptors = Object.entries(schema).map(([key, entry]) => ({
        key,
        ...entry,
    }));

    return type === 'wall' ? applyRakeAuthorability(descriptors, elementData) : descriptors;
}

/**
 * §WALL-RAKE (ADR-0310 §2.5) — mirror the STORE's refusals into the panel.
 *
 * `WallStore` rejects a non-vertical rake on three wall shapes, at all three of
 * its doors. Those refusals are correct and are the safety property of the whole
 * feature — but if the panel offers an editable box anyway, the user types 75,
 * presses Apply, and the wall stays vertical with nothing said. A refusal and a
 * success would look identical, which is the §CONTEXT-DATA-HONESTY defect this
 * repo has paid for three times (L-716, L-752, L-779).
 *
 * So the panel does not TEST anything the store does not; it REPORTS the same
 * decision, with the reason, and drops to read-only.
 *
 * ── §FEAT-RAKE-LAYERED (founder 2026-08-18) — THIS FUNCTION WAS A RIVAL GATE ──
 *
 * The warning above ("these predicates must track `WallStore`'s… the panel silently
 * starts lying again") described the risk. It then HAPPENED: `t / sin θ` was built,
 * `rakeAuthorability` stopped refusing a plain layered wall, and this hand-copied
 * chain went on greying the Vertical Angle box out on every layered wall — the
 * feature shipped and was unreachable from the control the user actually touches.
 *
 * So the copy is gone. The DECISION now comes from `rakeAuthorability`, the one gate
 * (§FIX-RAKE-REFUSAL-IS-NOT-A-CRASH, L-812 — three earlier copies caused a real bug);
 * only the WORDING is local, keyed off the gate's machine-readable `code`. A future
 * fourth refusal can no longer be missed here: it arrives as an unmapped code and
 * falls through to the gate's own sentence rather than to silence.
 *
 * The gate answers "may this wall HOLD this rake?", and returns OK for a vertical
 * wall whatever its shape — so it is asked with a PROBE angle. Any in-range,
 * non-vertical value gives the same shape-based verdict, and `RAKE_MIN_DEG` is one
 * that exists as a constant rather than as a magic number.
 */
function rakeRefusalReason(w: Record<string, any>): string | null {
    const auth = rakeAuthorability({
        rakeAngleDeg: RAKE_MIN_DEG,          // probe: "if this wall were raked at all…"
        curve:    w.curve,
        // Same tolerant field reading as before: the panel is fed both live records
        // and selection snapshots, which spell these two differently.
        layers:   w.layers ?? w.wallType?.layers,
        openings: w.openings ?? w.childrenIds,
    });
    if (auth.ok) return null;

    switch (auth.code) {
        case 'curved':
            // The shear direction is the wall's plan normal, which VARIES along an arc:
            // one shear vector is right at a single station and wrong everywhere else.
            return 'Not available on curved walls — the lean would only be correct at one point along the arc.';
        case 'layered':
            // NARROWED with the gate: a layered wall leans fine now (its bands are cut
            // at t / sin θ). What cannot be built is a layered wall that also hosts an
            // opening — that body is assembled by the un-sheared opening-segment path.
            return 'Not available on a layered wall that hosts a door or window — remove the opening, or use a single-layer wall type.';
        case 'hosted-openings':
            // C15's vertical axis is not modelled: sill is a bare world-Y translate at
            // four independent sites and `hostedElementFrame` returns a scalar rotationY.
            return 'Not available while this wall hosts a door or window — hosted openings do not tilt yet.';
        default:
            // A refusal this panel has no wording for is still a refusal. Show the
            // gate's own sentence rather than quietly leaving the control editable.
            return auth.reason ?? 'Not available on this wall.';
    }
}

function applyRakeAuthorability(
    descriptors: PropertyDescriptor[],
    elementData: Record<string, any>,
): PropertyDescriptor[] {
    const reason = rakeRefusalReason(elementData);
    if (!reason) return descriptors;
    return descriptors.map(d =>
        d.key === 'rakeAngleDeg' ? { ...d, editable: false, hint: reason } : d,
    );
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
