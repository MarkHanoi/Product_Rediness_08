/**
 * ScheduleRegistry — rendering-layer schedule definitions.
 *
 * P9-W6 (2026-05-10) — lifted to packages/core-app-model/src/schedules/.
 * Zero cross-subsystem imports — completely self-contained.
 *
 * Each entry declares:
 *   id       — matches the scheduleStore id (used by SchedulePanel.show())
 *   label    — human label shown in the panel header
 *   category — key passed to ScheduleExtractor.getRows()
 *   columns  — ordered list of column descriptors
 *
 * Disciplines:
 *   ARCHITECTURE  — Rooms, Walls, Floors, Roofs, Ceilings, Stairs
 *   OPENINGS      — Doors, Windows, Curtain Walls
 *   STRUCTURE     — Columns, Beams, Slabs
 *   INTERIOR      — Furniture, Handrails
 *   MEP           — Plumbing Fixtures
 *   DATA PLATFORM — Hierarchy / Template / Programme schedules
 */

export interface ScheduleColumn {
  id: string;
  label: string;
  value: (element: any) => string | number;
}

export interface ScheduleDefinition {
  id: string;
  label: string;
  category:
    // Architecture
    | 'Walls' | 'Floors' | 'Roofs' | 'Ceilings' | 'Rooms' | 'Stairs'
    // Openings
    | 'Doors' | 'Windows' | 'CurtainWalls'
    // Structure
    | 'Columns' | 'Beams' | 'Slabs'
    // Interior
    | 'Furniture' | 'Handrails'
    // MEP
    | 'Plumbing'
    // Data Platform
    | 'Hierarchy-Units' | 'Hierarchy-Levels' | 'Hierarchy-Buildings'
    | 'Rooms-WithTemplate' | 'Rooms-Conflicts' | 'ElementCodes-All' | 'Template-Compliance'
    | 'Rooms-Programme-Deviation'
    // Materials Library
    | 'Materials';
  columns: ScheduleColumn[];
}

export class ScheduleRegistry {
  private static _schedules: Map<string, ScheduleDefinition> = new Map();

  static registerDefaultSchedules() {

    // ── ARCHITECTURE ─────────────────────────────────────────────────────────

    this.register({
      id: 'Walls Schedule',
      label: 'Walls Schedule',
      category: 'Walls',
      columns: [
        { id: 'id',        label: 'ID',              value: (e) => e.id },
        { id: 'type',      label: 'Type',            value: (e) => e.type },
        { id: 'length',    label: 'Length (m)',      value: (e) => e.length },
        { id: 'height',    label: 'Height (m)',      value: (e) => e.height },
        { id: 'thickness', label: 'Thickness (m)',   value: (e) => e.thickness },
        { id: 'level',     label: 'Level',           value: (e) => e.level },
        { id: 'roomSideA', label: 'Room (Side A)',   value: (e) => e.roomSideA ?? '—' },
        { id: 'roomSideB', label: 'Room (Side B)',   value: (e) => e.roomSideB ?? '—' },
      ],
    });

    this.register({
      id: 'Floors Schedule',
      label: 'Floors Schedule',
      category: 'Floors',
      columns: [
        { id: 'mark',       label: 'Mark',          value: (e) => e.mark },
        { id: 'label',      label: 'Label',         value: (e) => e.label },
        { id: 'level',      label: 'Level',         value: (e) => e.level },
        { id: 'area',       label: 'Area (m²)',     value: (e) => e.area },
        { id: 'thickness',  label: 'Thickness (m)', value: (e) => e.thickness },
        { id: 'finish',     label: 'Finish',        value: (e) => e.finish },
        { id: 'department', label: 'Department',    value: (e) => e.department },
        { id: 'rooms',      label: 'Rooms',         value: (e) => e.rooms },
        { id: 'slope',      label: 'Slope',         value: (e) => e.slope },
      ],
    });

    this.register({
      id: 'Roofs Schedule',
      label: 'Roofs Schedule',
      category: 'Roofs',
      columns: [
        { id: 'mark',      label: 'Mark',           value: (e) => e.mark },
        { id: 'level',     label: 'Level',          value: (e) => e.level },
        { id: 'roofType',  label: 'Roof Type',      value: (e) => e.roofType },
        { id: 'slope',     label: 'Slope (°)',      value: (e) => e.slope },
        { id: 'area',      label: 'Area (m²)',      value: (e) => e.area },
        { id: 'thickness', label: 'Thickness (m)',  value: (e) => e.thickness },
        { id: 'overhang',  label: 'Overhang (m)',   value: (e) => e.overhang },
        { id: 'material',  label: 'Material',       value: (e) => e.material },
      ],
    });

    this.register({
      id: 'Ceilings Schedule',
      label: 'Ceilings Schedule',
      category: 'Ceilings',
      columns: [
        { id: 'mark',       label: 'Mark',          value: (e) => e.mark },
        { id: 'label',      label: 'Label',         value: (e) => e.label },
        { id: 'level',      label: 'Level',         value: (e) => e.level },
        { id: 'area',       label: 'Area (m²)',     value: (e) => e.area },
        { id: 'height',     label: 'Height (m)',    value: (e) => e.height },
        { id: 'finish',     label: 'Finish',        value: (e) => e.finish },
        { id: 'department', label: 'Department',    value: (e) => e.department },
        { id: 'rooms',      label: 'Rooms',         value: (e) => e.rooms },
      ],
    });

    this.register({
      id: 'Rooms Schedule',
      label: 'Room Schedule',
      category: 'Rooms',
      columns: [
        { id: 'number',       label: 'No.',             value: (e) => e.number },
        { id: 'name',         label: 'Name',            value: (e) => e.name },
        { id: 'level',        label: 'Level',           value: (e) => e.level },
        { id: 'department',   label: 'Department',      value: (e) => e.department },
        { id: 'occupancy',    label: 'Occupancy',       value: (e) => e.occupancy },
        { id: 'grossArea',    label: 'Area (m²)',       value: (e) => e.grossArea },
        { id: 'perimeter',    label: 'Perimeter (m)',   value: (e) => e.perimeter },
        { id: 'volume',       label: 'Volume (m³)',     value: (e) => e.volume },
        { id: 'height',       label: 'Height (m)',      value: (e) => e.height },
        { id: 'floor',        label: 'Floor Finish',    value: (e) => e.floor },
        { id: 'wall',         label: 'Wall Finish',     value: (e) => e.wall },
        { id: 'ceiling',      label: 'Ceiling Finish',  value: (e) => e.ceiling },
        { id: 'doorFinish',   label: 'Door Finish',     value: (e) => e.doorFinish   ?? '—' },
        { id: 'windowFinish', label: 'Window Finish',   value: (e) => e.windowFinish ?? '—' },
        { id: 'doors',        label: 'Doors',           value: (e) => e.doors },
        { id: 'windows',      label: 'Windows',         value: (e) => e.windows },
        { id: 'walls',        label: 'Bounding Walls',  value: (e) => e.walls },
        { id: 'furniture',    label: 'Furniture',       value: (e) => e.furniture },
      ],
    });

    this.register({
      id: 'Stairs Schedule',
      label: 'Stairs Schedule',
      category: 'Stairs',
      columns: [
        { id: 'mark',          label: 'Mark',           value: (e) => e.mark ?? '—' },
        { id: 'shape',         label: 'Shape',          value: (e) => e.shape },
        { id: 'baseLevelName', label: 'Base Level',     value: (e) => e.baseLevelName ?? e.baseLevelId ?? '—' },
        { id: 'topLevelName',  label: 'Top Level',      value: (e) => e.topLevelName  ?? e.topLevelId  ?? '—' },
        { id: 'width',         label: 'Width (m)',       value: (e) => typeof e.width === 'number' ? e.width.toFixed(3) : e.width },
        { id: 'riserCount',    label: 'Risers',         value: (e) => e.riserCount },
        { id: 'riserHeight',   label: 'Riser Ht (m)',   value: (e) => typeof e.riserHeight === 'number' ? e.riserHeight.toFixed(3) : e.riserHeight },
        { id: 'treadDepth',    label: 'Tread Dp (m)',   value: (e) => typeof e.treadDepth === 'number' ? e.treadDepth.toFixed(3) : e.treadDepth },
        { id: 'fireRating',    label: 'Fire Rating',    value: (e) => e.fireRating ?? '—' },
        { id: 'accessibility', label: 'Accessibility',  value: (e) => e.accessibilityType ?? 'standard' },
      ],
    });

    // ── OPENINGS ─────────────────────────────────────────────────────────────

    this.register({
      id: 'Doors Schedule',
      label: 'Doors Schedule',
      category: 'Doors',
      columns: [
        { id: 'mark',       label: 'Mark',          value: (e) => e.mark },
        { id: 'type',       label: 'Type',           value: (e) => e.type },
        { id: 'width',      label: 'Width (m)',      value: (e) => e.width },
        { id: 'height',     label: 'Height (m)',     value: (e) => e.height },
        { id: 'sillHeight', label: 'Threshold (m)',  value: (e) => e.sillHeight },
        { id: 'level',      label: 'Level',          value: (e) => e.level },
        { id: 'hostWall',   label: 'Host Wall',      value: (e) => e.hostWall },
        { id: 'roomFrom',   label: 'Room From',      value: (e) => e.roomFrom ?? '—' },
        { id: 'roomTo',     label: 'Room To',        value: (e) => e.roomTo   ?? '—' },
      ],
    });

    this.register({
      id: 'Windows Schedule',
      label: 'Windows Schedule',
      category: 'Windows',
      columns: [
        { id: 'mark',         label: 'Mark',            value: (e) => e.mark },
        { id: 'id',           label: 'ID',              value: (e) => e.id },
        { id: 'name',         label: 'Name',            value: (e) => e.name || 'Window' },
        { id: 'width',        label: 'Width (m)',        value: (e) => e.width },
        { id: 'height',       label: 'Height (m)',       value: (e) => e.height },
        { id: 'sillHeight',   label: 'Sill Height (m)', value: (e) => e.sillHeight },
        { id: 'level',        label: 'Level',            value: (e) => e.level },
        { id: 'room',         label: 'Room',             value: (e) => e.room         ?? '—' },
        { id: 'adjacentRoom', label: 'Adjacent Room',    value: (e) => e.adjacentRoom ?? '—' },
      ],
    });

    this.register({
      id: 'CurtainWalls Schedule',
      label: 'Curtain Walls Schedule',
      category: 'CurtainWalls',
      columns: [
        { id: 'mark',          label: 'Mark',             value: (e) => e.mark },
        { id: 'level',         label: 'Level',            value: (e) => e.level },
        { id: 'length',        label: 'Length (m)',       value: (e) => e.length },
        { id: 'height',        label: 'Height (m)',       value: (e) => e.height },
        { id: 'gridXSpacing',  label: 'Grid H Spacing',  value: (e) => e.gridXSpacing },
        { id: 'gridYSpacing',  label: 'Grid V Spacing',  value: (e) => e.gridYSpacing },
        { id: 'mullionSize',   label: 'Mullion Size',     value: (e) => e.mullionSize },
        { id: 'panelThickness', label: 'Panel Thickness', value: (e) => e.panelThickness },
      ],
    });

    // ── STRUCTURE ─────────────────────────────────────────────────────────────

    this.register({
      id: 'Columns Schedule',
      label: 'Columns Schedule',
      category: 'Columns',
      columns: [
        { id: 'mark',      label: 'Mark',          value: (e) => e.mark },
        { id: 'level',     label: 'Level',         value: (e) => e.level },
        { id: 'profile',   label: 'Profile',       value: (e) => e.profile },
        { id: 'width',     label: 'Width (m)',     value: (e) => e.width },
        { id: 'depth',     label: 'Depth (m)',     value: (e) => e.depth },
        { id: 'height',    label: 'Height (m)',    value: (e) => e.height },
        { id: 'material',  label: 'Material',      value: (e) => e.material },
        { id: 'baseOffset', label: 'Base Offset (m)', value: (e) => e.baseOffset },
      ],
    });

    this.register({
      id: 'Beams Schedule',
      label: 'Beams Schedule',
      category: 'Beams',
      columns: [
        { id: 'mark',        label: 'Mark',          value: (e) => e.mark },
        { id: 'level',       label: 'Level',         value: (e) => e.level },
        { id: 'span',        label: 'Span (m)',      value: (e) => e.span },
        { id: 'width',       label: 'Width (m)',     value: (e) => e.width },
        { id: 'depth',       label: 'Depth (m)',     value: (e) => e.depth },
        { id: 'material',    label: 'Material',      value: (e) => e.material },
        { id: 'loadBearing', label: 'Load Bearing',  value: (e) => e.loadBearing },
        { id: 'fireRating',  label: 'Fire Rating',   value: (e) => e.fireRating },
        { id: 'startSupport', label: 'Start Support', value: (e) => e.startSupport },
        { id: 'endSupport',   label: 'End Support',   value: (e) => e.endSupport },
      ],
    });

    this.register({
      id: 'Slabs Schedule',
      label: 'Slabs Schedule',
      category: 'Slabs',
      columns: [
        { id: 'mark',      label: 'Mark',           value: (e) => e.mark },
        { id: 'level',     label: 'Level',          value: (e) => e.level },
        { id: 'thickness', label: 'Thickness (m)',  value: (e) => e.thickness },
        { id: 'area',      label: 'Area (m²)',      value: (e) => e.area },
        { id: 'material',  label: 'Material',       value: (e) => e.material },
        { id: 'phase',     label: 'Phase',          value: (e) => e.phase },
        { id: 'baseOffset', label: 'Base Offset (m)', value: (e) => e.baseOffset },
      ],
    });

    // ── INTERIOR / FINISHES ───────────────────────────────────────────────────

    this.register({
      id: 'Furniture Schedule',
      label: 'Furniture Schedule',
      category: 'Furniture',
      columns: [
        { id: 'mark',          label: 'Mark',            value: (e) => e.mark },
        { id: 'furnitureType', label: 'Type',            value: (e) => e.furnitureType },
        { id: 'level',         label: 'Level',           value: (e) => e.level },
        { id: 'room',          label: 'Room',            value: (e) => e.room },
        { id: 'width',         label: 'Width (m)',       value: (e) => e.width },
        { id: 'length',        label: 'Length (m)',      value: (e) => e.length },
        { id: 'height',        label: 'Height (m)',      value: (e) => e.height },
      ],
    });

    this.register({
      id: 'Handrails Schedule',
      label: 'Handrails Schedule',
      category: 'Handrails',
      columns: [
        { id: 'mark',           label: 'Mark',            value: (e) => e.mark },
        { id: 'level',          label: 'Level',           value: (e) => e.level },
        { id: 'length',         label: 'Length (m)',      value: (e) => e.length },
        { id: 'height',         label: 'Height (m)',      value: (e) => e.height },
        { id: 'fillType',       label: 'Fill Type',       value: (e) => e.fillType },
        { id: 'railProfile',    label: 'Rail Profile',    value: (e) => e.railProfile },
        { id: 'postSpacing',    label: 'Post Spacing (m)', value: (e) => e.postSpacing },
        { id: 'material',       label: 'Material',        value: (e) => e.material },
      ],
    });

    // ── MEP ──────────────────────────────────────────────────────────────────

    this.register({
      id: 'Plumbing Schedule',
      label: 'Plumbing Fixtures Schedule',
      category: 'Plumbing',
      columns: [
        { id: 'mark',        label: 'Mark',          value: (e) => e.mark },
        { id: 'fixtureType', label: 'Fixture Type',  value: (e) => e.fixtureType },
        { id: 'level',       label: 'Level',         value: (e) => e.level },
        { id: 'room',        label: 'Room',          value: (e) => e.room },
        { id: 'width',       label: 'Width (m)',     value: (e) => e.width },
        { id: 'height',      label: 'Height (m)',    value: (e) => e.height },
        { id: 'length',      label: 'Length (m)',    value: (e) => e.length },
      ],
    });

    // ── DATA PLATFORM ─────────────────────────────────────────────────────────

    this.register({
      id: 'Hierarchy-Units',
      label: 'Units Schedule',
      category: 'Hierarchy-Units',
      columns: [
        { id: 'name',       label: 'Name',           value: (e) => e.name       ?? '—' },
        { id: 'code',       label: 'Code',           value: (e) => e.code       ?? '—' },
        { id: 'unitType',   label: 'Unit Type',      value: (e) => e.unitType   ?? '—' },
        { id: 'level',      label: 'Level',          value: (e) => e.level      ?? '—' },
        { id: 'targetArea', label: 'Target Area (m²)', value: (e) => e.targetArea ?? '—' },
        { id: 'actualArea', label: 'Actual Area (m²)', value: (e) => e.actualArea ?? '—' },
        { id: 'roomCount',  label: 'Rooms',          value: (e) => e.roomCount  ?? '—' },
        { id: 'syncState',  label: 'Sync State',     value: (e) => e.syncState  ?? '—' },
        { id: 'template',   label: 'Template',       value: (e) => e.template   ?? '—' },
      ],
    });

    this.register({
      id: 'Hierarchy-Levels',
      label: 'Levels Schedule',
      category: 'Hierarchy-Levels',
      columns: [
        { id: 'name',        label: 'Name',             value: (e) => e.name        ?? '—' },
        { id: 'code',        label: 'Code',             value: (e) => e.code        ?? '—' },
        { id: 'levelNumber', label: 'Level No.',        value: (e) => e.levelNumber ?? '—' },
        { id: 'building',    label: 'Building',         value: (e) => e.building    ?? '—' },
        { id: 'targetGFA',   label: 'Target GFA (m²)',  value: (e) => e.targetGFA   ?? '—' },
        { id: 'actualGFA',   label: 'Actual GFA (m²)',  value: (e) => e.actualGFA   ?? '—' },
        { id: 'unitCount',   label: 'Units',            value: (e) => e.unitCount   ?? '—' },
        { id: 'syncState',   label: 'Sync State',       value: (e) => e.syncState   ?? '—' },
      ],
    });

    this.register({
      id: 'Hierarchy-Buildings',
      label: 'Buildings Schedule',
      category: 'Hierarchy-Buildings',
      columns: [
        { id: 'name',        label: 'Name',         value: (e) => e.name        ?? '—' },
        { id: 'code',        label: 'Code',         value: (e) => e.code        ?? '—' },
        { id: 'buildingUse', label: 'Building Use', value: (e) => e.buildingUse ?? '—' },
        { id: 'site',        label: 'Site',         value: (e) => e.site        ?? '—' },
        { id: 'storeys',     label: 'Storeys',      value: (e) => e.storeys     ?? '—' },
        { id: 'syncState',   label: 'Sync State',   value: (e) => e.syncState   ?? '—' },
      ],
    });

    this.register({
      id: 'Rooms-WithTemplate',
      label: 'Rooms With Template',
      category: 'Rooms-WithTemplate',
      columns: [
        { id: 'roomNumber', label: 'No.',           value: (e) => e.roomNumber ?? '—' },
        { id: 'name',       label: 'Name',          value: (e) => e.name       ?? '—' },
        { id: 'level',      label: 'Level',         value: (e) => e.level      ?? '—' },
        { id: 'unit',       label: 'Unit',          value: (e) => e.unit       ?? '—' },
        { id: 'area',       label: 'Area (m²)',     value: (e) => e.area       ?? '—' },
        { id: 'syncState',  label: 'Sync State',    value: (e) => e.syncState  ?? '—' },
        { id: 'template',   label: 'Template',      value: (e) => e.template   ?? '—' },
      ],
    });

    this.register({
      id: 'Rooms-Conflicts',
      label: 'Rooms With Conflicts',
      category: 'Rooms-Conflicts',
      columns: [
        { id: 'name',        label: 'Name',                value: (e) => e.name        ?? '—' },
        { id: 'level',       label: 'Level',               value: (e) => e.level       ?? '—' },
        { id: 'template',    label: 'Template',            value: (e) => e.template    ?? '—' },
        { id: 'failingReqs', label: 'Failing Requirements', value: (e) => e.failingReqs ?? '—' },
      ],
    });

    this.register({
      id: 'ElementCodes-All',
      label: 'Element Codes',
      category: 'ElementCodes-All',
      columns: [
        { id: 'code',        label: 'Code',         value: (e) => e.code        ?? '—' },
        { id: 'prefix',      label: 'Prefix',       value: (e) => e.prefix      ?? '—' },
        { id: 'elementType', label: 'Element Type', value: (e) => e.elementType ?? '—' },
        { id: 'elementId',   label: 'Element ID',   value: (e) => e.elementId   ?? '—' },
      ],
    });

    this.register({
      id: 'Template-Compliance',
      label: 'Template Compliance',
      category: 'Template-Compliance',
      columns: [
        { id: 'name',          label: 'Template',       value: (e) => e.name          ?? '—' },
        { id: 'scope',         label: 'Scope',          value: (e) => e.scope         ?? '—' },
        { id: 'assigned',      label: 'Assigned',       value: (e) => e.assigned      ?? '—' },
        { id: 'syncedPct',     label: 'Synced %',       value: (e) => e.syncedPct     ?? '—' },
        { id: 'conflictCount', label: 'Conflicts',      value: (e) => e.conflictCount ?? '—' },
        { id: 'derivedCount',  label: 'Derived',        value: (e) => e.derivedCount  ?? '—' },
      ],
    });

    this.register({
      id: 'Rooms-Programme-Deviation',
      label: 'Room Programme Deviation',
      category: 'Rooms-Programme-Deviation',
      columns: [
        { id: 'name',       label: 'Room Name',        value: (e) => e.name       ?? '—' },
        { id: 'number',     label: 'Number',           value: (e) => e.number     ?? '—' },
        { id: 'level',      label: 'Level',            value: (e) => e.level      ?? '—' },
        { id: 'unit',       label: 'Unit',             value: (e) => e.unit       ?? '—' },
        { id: 'template',   label: 'Template',         value: (e) => e.template   ?? '—' },
        { id: 'targetArea', label: 'Target m²',        value: (e) => e.targetArea ?? '—' },
        { id: 'actualArea', label: 'Actual m²',        value: (e) => e.actualArea ?? '—' },
        { id: 'deviation',  label: 'Deviation (%)',    value: (e) => e.deviation  ?? '—' },
        { id: 'status',     label: 'Status',           value: (e) => e.status     ?? '—' },
      ],
    });

    // ── MATERIALS LIBRARY ────────────────────────────────────────────────────

    this.register({
      id:       'Materials Schedule',
      label:    'Materials Library',
      category: 'Materials',
      columns: [
        { id: 'id',           label: 'ID',           value: (e) => e.id },
        { id: 'label',        label: 'Name',         value: (e) => e.label },
        { id: 'category',     label: 'Category',     value: (e) => e.category },
        { id: 'color',        label: 'Colour (Hex)', value: (e) => e.color },
        { id: 'metalness',    label: 'Metalness',    value: (e) => e.metalness },
        { id: 'roughness',    label: 'Roughness',    value: (e) => e.roughness },
        { id: 'opacity',      label: 'Opacity',      value: (e) => e.opacity },
        { id: 'transparency', label: 'Transparent',  value: (e) => e.transparency },
      ],
    });
  }

  static register(definition: ScheduleDefinition) {
    this._schedules.set(definition.id, definition);
  }

  static get(id: string): ScheduleDefinition | undefined {
    return this._schedules.get(id);
  }

  static getAll(): ScheduleDefinition[] {
    return Array.from(this._schedules.values());
  }
}
