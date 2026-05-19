/**
 * RoomSystemTypeStore — named room type presets with occupancy defaults, finish
 * templates, and space standards.
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology. No import remapping required — all deps are same-package.
 */

import {
  RoomOccupancyType,
  RoomSystemType,
  RoomTypeDefaults,
  RoomFinishes,
} from './RoomTypes';
import { OCCUPANCY_PALETTE } from './RoomColourSystem';

export interface SerializedRoomTypeStore {
  customTypes: RoomSystemType[];
  version: number;
}

const OFFICE_FINISH: RoomFinishes = {
  floor:   { materialName: 'Carpet Tile',                  materialColor: '#B0BEC5', finishCode: 'F2', nbs: 'M50/215' },
  ceiling: { materialName: 'Suspended Acoustic Tile',      materialColor: '#FAFAFA', finishCode: 'C1', nbs: 'K40/110' },
  walls:   { materialName: 'Plasterboard — Emulsion Paint', materialColor: '#F5F5F5', finishCode: 'W1', nbs: 'M20/110' },
  skirtingHeight: 0.1,
};

const RESIDENTIAL_FINISH: RoomFinishes = {
  floor:   { materialName: 'Engineered Timber',  materialColor: '#C8A87A', finishCode: 'F1' },
  ceiling: { materialName: 'Painted Plaster',     materialColor: '#FFFFFF', finishCode: 'C2' },
  walls:   { materialName: 'Emulsion Paint',      materialColor: '#F5F5F5', finishCode: 'W2' },
  skirtingHeight: 0.1,
};

const WET_FINISH: RoomFinishes = {
  floor:   { materialName: 'Ceramic Tile',        materialColor: '#E8E8E8', finishCode: 'F3' },
  ceiling: { materialName: 'Moisture-Resistant',  materialColor: '#FFFFFF', finishCode: 'C3' },
  walls:   { materialName: 'Ceramic Tile',        materialColor: '#E8E8E8', finishCode: 'W3' },
  skirtingHeight: 0.1,
};

function makeBuiltIn(
  id: string,
  occupancyType: RoomOccupancyType,
  name: string,
  defaults: RoomTypeDefaults,
  finishTemplate?: RoomFinishes,
  description?: string,
): RoomSystemType {
  const now = Date.now();
  return {
    id,
    occupancyType,
    name,
    description,
    colour: OCCUPANCY_PALETTE[occupancyType] ?? '#E0E0E0',
    defaults,
    finishTemplate,
    createdAt: now,
    modifiedAt: now,
    isBuiltIn: true,
  };
}

const BUILT_IN_TYPES: RoomSystemType[] = [
  makeBuiltIn('rt-bedroom-single', 'bedroom',   'Bedroom — Single',  { targetArea: 8,  ceilingHeight: 2.4, occupancyLoad: 1 }, RESIDENTIAL_FINISH),
  makeBuiltIn('rt-bedroom-double', 'bedroom',   'Bedroom — Double',  { targetArea: 12, ceilingHeight: 2.4, occupancyLoad: 2 }, RESIDENTIAL_FINISH),
  makeBuiltIn('rt-bedroom-master', 'bedroom',   'Bedroom — Master',  { targetArea: 18, ceilingHeight: 2.4, occupancyLoad: 2 }, RESIDENTIAL_FINISH),
  makeBuiltIn('rt-living-room',    'living-room','Living Room',       { targetArea: 25, ceilingHeight: 2.4, occupancyLoad: 0.1 }, RESIDENTIAL_FINISH),
  makeBuiltIn('rt-kitchen',        'kitchen',   'Kitchen',           { targetArea: 12, ceilingHeight: 2.4, occupancyLoad: 0.1 }, WET_FINISH),
  makeBuiltIn('rt-kitchen-diner',  'kitchen',   'Kitchen-Diner',     { targetArea: 20, ceilingHeight: 2.4, occupancyLoad: 0.1 }, WET_FINISH),
  makeBuiltIn('rt-bathroom',       'bathroom',  'Bathroom',          { targetArea: 5,  ceilingHeight: 2.1 }, WET_FINISH),
  makeBuiltIn('rt-wc',             'wc',        'WC — Residential',  { targetArea: 2,  ceilingHeight: 2.1 }, WET_FINISH),
  makeBuiltIn('rt-utility',        'utility-room','Utility Room',    { targetArea: 4,  ceilingHeight: 2.1 }, WET_FINISH),
  makeBuiltIn('rt-open-office-a',  'open-office',   'Open Office — Grade A',  { targetArea: 10, ceilingHeight: 2.7, occupancyLoad: 0.1, lightingLux: 500, targetTemperature: 21 }, OFFICE_FINISH),
  makeBuiltIn('rt-open-office-b',  'open-office',   'Open Office — Grade B',  { targetArea: 8,  ceilingHeight: 2.5, occupancyLoad: 0.125 }, OFFICE_FINISH),
  makeBuiltIn('rt-private-office', 'private-office','Private Office',          { targetArea: 15, ceilingHeight: 2.7, occupancyLoad: 0.067 }, OFFICE_FINISH),
  makeBuiltIn('rt-meeting-small',  'meeting-room',  'Meeting Room — 4–6 pax', { targetArea: 18, ceilingHeight: 2.7, occupancyLoad: 0.5 }, OFFICE_FINISH),
  makeBuiltIn('rt-meeting-large',  'meeting-room',  'Meeting Room — 8–12 pax',{ targetArea: 35, ceilingHeight: 2.7, occupancyLoad: 0.5 }, OFFICE_FINISH),
  makeBuiltIn('rt-boardroom',      'meeting-room',  'Boardroom',               { targetArea: 50, ceilingHeight: 2.7, occupancyLoad: 0.3 }, OFFICE_FINISH),
  makeBuiltIn('rt-reception',      'reception',     'Reception',               { targetArea: 20, ceilingHeight: 3.0, occupancyLoad: 0.2 }, OFFICE_FINISH),
  makeBuiltIn('rt-breakout',       'breakout',      'Breakout / Informal',     { targetArea: 15, ceilingHeight: 2.7, occupancyLoad: 0.3 }, OFFICE_FINISH),
  makeBuiltIn('rt-server-room',    'server-room',   'Server Room / IT',        { targetArea: 20, ceilingHeight: 2.4 }),
  makeBuiltIn('rt-patient-room-single', 'patient-room',    'Single Patient Room', { targetArea: 28 }, undefined, 'HBN 04-01'),
  makeBuiltIn('rt-consultation',        'consultation-room','Consultation Room',   { targetArea: 16 }, undefined, 'HBN 03-01'),
  makeBuiltIn('rt-operating-theatre',   'operating-theatre','Operating Theatre',   { targetArea: 55 }, undefined, 'HBN 10-02'),
  makeBuiltIn('rt-waiting',             'waiting-room',    'Waiting Room',        { occupancyLoad: 0.33 }),
  makeBuiltIn('rt-classroom-primary',   'classroom',  'Primary Classroom',   { targetArea: 55 }, undefined, 'BB103'),
  makeBuiltIn('rt-classroom-secondary', 'classroom',  'Secondary Classroom', { targetArea: 60 }, undefined, 'BB103'),
  makeBuiltIn('rt-laboratory',          'laboratory', 'Laboratory',          { targetArea: 85 }, undefined, 'BB103'),
  makeBuiltIn('rt-corridor',            'corridor',      'Corridor',            { minArea: 1.2 }),
  makeBuiltIn('rt-corridor-accessible', 'corridor',      'Accessible Corridor', { minArea: 1.8 }),
  makeBuiltIn('rt-stairwell',           'stairwell',     'Stairwell',           {}),
  makeBuiltIn('rt-lift-lobby',          'lift-lobby',    'Lift Lobby',          { minArea: 4 }),
  makeBuiltIn('rt-entrance-lobby',      'entrance-lobby','Entrance Lobby',      { targetArea: 15, occupancyLoad: 0.5 }),
];

export class RoomSystemTypeStore {
  private builtIn: Map<string, RoomSystemType>;
  private custom: Map<string, RoomSystemType>;

  constructor() {
    this.builtIn = new Map(BUILT_IN_TYPES.map(t => [t.id, t]));
    this.custom = new Map();
  }

  getById(id: string): RoomSystemType | undefined {
    return this.builtIn.get(id) ?? this.custom.get(id);
  }

  getAll(): RoomSystemType[] {
    return [...Array.from(this.builtIn.values()), ...Array.from(this.custom.values())];
  }

  getByOccupancy(type: RoomOccupancyType): RoomSystemType[] {
    return this.getAll().filter(t => t.occupancyType === type);
  }

  getDefaults(type: RoomOccupancyType): RoomTypeDefaults {
    const match = this.getByOccupancy(type)[0];
    return match?.defaults ?? {};
  }

  getColour(type: RoomOccupancyType): string {
    return OCCUPANCY_PALETTE[type] ?? '#E0E0E0';
  }

  getFinishTemplate(typeId: string): RoomFinishes | undefined {
    return this.getById(typeId)?.finishTemplate;
  }

  addCustomType(input: Omit<RoomSystemType, 'id' | 'createdAt' | 'modifiedAt' | 'isBuiltIn'>): string {
    const id = crypto.randomUUID();
    const now = Date.now();
    const type: RoomSystemType = { ...input, id, createdAt: now, modifiedAt: now, isBuiltIn: false };
    this.custom.set(id, Object.freeze(type));
    return id;
  }

  updateCustomType(id: string, updates: Partial<RoomSystemType>): void {
    const existing = this.custom.get(id);
    if (!existing) throw new Error(`RoomSystemTypeStore: custom type '${id}' not found`);
    const updated = Object.freeze({ ...existing, ...updates, id, isBuiltIn: false, modifiedAt: Date.now() });
    this.custom.set(id, updated);
  }

  removeCustomType(id: string): void {
    const existing = this.custom.get(id);
    if (!existing) throw new Error(`RoomSystemTypeStore: custom type '${id}' not found`);
    if (existing.isBuiltIn) throw new Error(`RoomSystemTypeStore: cannot remove built-in type '${id}'`);
    this.custom.delete(id);
  }

  serialize(): SerializedRoomTypeStore {
    return {
      customTypes: Array.from(this.custom.values()),
      version: 1,
    };
  }

  deserialize(data: SerializedRoomTypeStore): void {
    this.custom.clear();
    for (const t of data.customTypes ?? []) {
      this.custom.set(t.id, Object.freeze({ ...t }));
    }
  }
}
