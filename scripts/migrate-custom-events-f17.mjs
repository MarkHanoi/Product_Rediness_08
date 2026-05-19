/**
 * F.events.17 migration script.
 * Adds DOMEventBus import + const _bus declaration to each target file
 * that doesn't already have it.
 */
import { readFileSync, writeFileSync } from 'fs';

const BUS_IMPORT = "import { DOMEventBus } from '@pryzm/event-bus';";
const BUS_CONST  = "const _bus = new DOMEventBus();";

function addBusPreamble(src, lastImportLine) {
  if (src.includes("DOMEventBus")) return src; // already present
  // Insert after the last import line
  return src.replace(lastImportLine, lastImportLine + "\n" + BUS_IMPORT + "\n" + BUS_CONST);
}

// ──────────────────────────────────────────────────────────────────────────────
// core-app-model stores
// ──────────────────────────────────────────────────────────────────────────────

// FloorStore — 3 sites
{
  const f = 'packages/core-app-model/src/stores/FloorStore.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { ensureCCW, computeArea } from './FloorPolygonUtils';");
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-floor-added', { detail: { floor: clone } })); // TODO(TASK-10)",
    "_bus.emit('bim-floor-added', { id: clone.id }); // F.events.17"
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-floor-updated', { detail: { floor: merged } })); // TODO(TASK-10)",
    "_bus.emit('bim-floor-updated', { id: merged.id }); // F.events.17"
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-floor-removed', { detail: { floorId } })); // TODO(TASK-10)",
    "_bus.emit('bim-floor-removed', { id: floorId }); // F.events.17"
  );
  writeFileSync(f, s);
  console.log('✓ FloorStore');
}

// FurnitureStore — 3 sites
{
  const f = 'packages/core-app-model/src/stores/FurnitureStore.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { produce } from 'immer';");
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-furniture-added', { detail: { furniture: snap } })); // TODO(TASK-10)",
    "_bus.emit('bim-furniture-added', { id: snap.id }); // F.events.17"
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-furniture-updated', { detail: { furniture: snap } })); // TODO(TASK-10)",
    "_bus.emit('bim-furniture-updated', { id: snap.id }); // F.events.17"
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-furniture-removed', { detail: { furnitureId: id } })); // TODO(TASK-10)",
    "_bus.emit('bim-furniture-removed', { id }); // F.events.17"
  );
  writeFileSync(f, s);
  console.log('✓ FurnitureStore');
}

// LightingStore — 3 sites (no storeEventBus, just LightingData import)
{
  const f = 'packages/core-app-model/src/stores/LightingStore.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { LightingData } from './LightingTypes';");
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-lighting-added', { detail: { id: data.id } })); // TODO(TASK-10)",
    "_bus.emit('bim-lighting-added', { id: data.id }); // F.events.17"
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-lighting-updated', { detail: { id } })); // TODO(TASK-10)",
    "_bus.emit('bim-lighting-updated', { id }); // F.events.17"
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-lighting-removed', { detail: { id } })); // TODO(TASK-10)",
    "_bus.emit('bim-lighting-removed', { id }); // F.events.17"
  );
  writeFileSync(f, s);
  console.log('✓ LightingStore');
}

// OpeningStore — 3 sites
{
  const f = 'packages/core-app-model/src/stores/OpeningStore.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)");
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-opening-added', { detail: { opening: structuredClone(newOpening) } })); // TODO(TASK-10)",
    "_bus.emit('bim-opening-added', { id: newOpening.id }); // F.events.17"
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-opening-removed', { detail: { openingId: id } })); // TODO(TASK-10)",
    "_bus.emit('bim-opening-removed', { id }); // F.events.17"
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-opening-updated', { detail: { opening: structuredClone(next) } })); // TODO(TASK-10)",
    "_bus.emit('bim-opening-updated', { id }); // F.events.17"
  );
  writeFileSync(f, s);
  console.log('✓ OpeningStore');
}

// PlumbingStore — 3 sites
{
  const f = 'packages/core-app-model/src/stores/PlumbingStore.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)");
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-plumbing-added', { detail: { fixture: data } })); // TODO(TASK-10)",
    "_bus.emit('bim-plumbing-added', { id: data.id }); // F.events.17"
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-plumbing-removed', { detail: { fixtureId: id } })); // TODO(TASK-10)",
    "_bus.emit('bim-plumbing-removed', { id }); // F.events.17"
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-plumbing-updated', { detail: { fixture: data } })); // TODO(TASK-10)",
    "_bus.emit('bim-plumbing-updated', { id }); // F.events.17"
  );
  writeFileSync(f, s);
  console.log('✓ PlumbingStore');
}

// RoomBoundingLineStore — 3 sites (complex payloads, use frozen.id etc.)
{
  const f = 'packages/core-app-model/src/stores/RoomBoundingLineStore.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';");
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-room-bounding-line-added', { detail: frozen })); // TODO(TASK-10)",
    "_bus.emit('bim-room-bounding-line-added', { id: frozen.id }); // F.events.17"
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-room-bounding-line-updated', { detail: updated })); // TODO(TASK-10)",
    "_bus.emit('bim-room-bounding-line-updated', { id: updated.id }); // F.events.17"
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('bim-room-bounding-line-removed', { detail: snapshot })); // TODO(TASK-10)",
    "_bus.emit('bim-room-bounding-line-removed', { id: snapshot.id }); // F.events.17"
  );
  writeFileSync(f, s);
  console.log('✓ RoomBoundingLineStore');
}

// BeamStore — 2 sites (beam-store-update, ai-model-update)
{
  const f = 'packages/core-app-model/src/stores/BeamStore.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)");
  // Multi-line replacement for beam-store-update
  s = s.replace(
    `        window.dispatchEvent(new CustomEvent('beam-store-update', { // TODO(TASK-12)
            detail: { action, beam }
        }));`,
    `        _bus.emit('beam-store-update', { action, beam }); // F.events.17`
  );
  // Multi-line replacement for ai-model-update
  s = s.replace(
    `        window.dispatchEvent(new CustomEvent('ai-model-update', { // TODO(TASK-12)
            detail: { source: 'BeamStore', action, elementType: 'beam', elementId: beam.id }
        }));`,
    `        _bus.emit('ai-model-update', { source: 'BeamStore', action, elementType: 'beam', elementId: beam.id }); // F.events.17`
  );
  writeFileSync(f, s);
  console.log('✓ BeamStore');
}

// ──────────────────────────────────────────────────────────────────────────────
// command-registry/grids
// ──────────────────────────────────────────────────────────────────────────────

// AddGridCommand — 4 sites
{
  const f = 'packages/command-registry/src/grids/AddGridCommand.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';");
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('grid-added', { detail: { grid: gridData } })); // TODO(TASK-12)",
    "_bus.emit('grid-added', { id: gridData.id ?? this.payload.gridId ?? '' }); // F.events.17"
  );
  // First ai-model-update after grid-added
  s = s.replace(
    `        window.dispatchEvent(new CustomEvent('ai-model-update')); // TODO(TASK-12)
        return {`,
    `        _bus.emit('ai-model-update', {}); // F.events.17
        return {`
  );
  s = s.replace(
    "window.dispatchEvent(new CustomEvent('grid-removed', { detail: { gridId: this.payload.gridId } })); // TODO(TASK-12)",
    "_bus.emit('grid-removed', { id: this.payload.gridId ?? '' }); // F.events.17"
  );
  // Second ai-model-update (in undo)
  s = s.replace(
    `        window.dispatchEvent(new CustomEvent('ai-model-update')); // TODO(TASK-12)
        return {`,
    `        _bus.emit('ai-model-update', {}); // F.events.17
        return {`
  );
  writeFileSync(f, s);
  console.log('✓ AddGridCommand');
}

// RemoveGridCommand — 3 sites
{
  const f = 'packages/command-registry/src/grids/RemoveGridCommand.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { Grid } from '@pryzm/core-app-model';");
  // Use perl for multi-line replacements
  writeFileSync(f, s);
  console.log('✓ RemoveGridCommand (preamble added — dispatch replacements via edit tool)');
}

// UpdateGridCommand — site replacements (2 occurrences)
{
  const f = 'packages/command-registry/src/grids/UpdateGridCommand.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { Grid } from '@pryzm/core-app-model';");
  writeFileSync(f, s);
  console.log('✓ UpdateGridCommand (preamble added)');
}

// TogglePinGridCommand — 4 sites
{
  const f = 'packages/command-registry/src/grids/TogglePinGridCommand.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';");
  writeFileSync(f, s);
  console.log('✓ TogglePinGridCommand (preamble added)');
}

// CreateGridSystemCommand — 2 sites
{
  const f = 'packages/command-registry/src/grids/CreateGridSystemCommand.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { AddGridCommand } from './AddGridCommand';");
  writeFileSync(f, s);
  console.log('✓ CreateGridSystemCommand (preamble added)');
}

// ──────────────────────────────────────────────────────────────────────────────
// command-registry/walls
// ──────────────────────────────────────────────────────────────────────────────

// UpdateWallHeightCommand — 4 sites (2 private methods)
{
  const f = 'packages/command-registry/src/walls/UpdateWallHeightCommand.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, WALL_HEIGHT_CONSTRAINTS, CommandContext } from '../types';");
  writeFileSync(f, s);
  console.log('✓ UpdateWallHeightCommand (preamble added)');
}

// DeleteElementCommand — 2 sites
{
  const f = 'packages/command-registry/src/walls/DeleteElementCommand.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { DeleteColumnCommand } from '../columns/DeleteColumnCommand';");
  s = s.replace(
    /window\.dispatchEvent\(new CustomEvent\('ai-model-update'\)\); \/\/ TODO\(TASK-12\)/g,
    "_bus.emit('ai-model-update', {}); // F.events.17"
  );
  writeFileSync(f, s);
  console.log('✓ DeleteElementCommand');
}

// UpdateWallBaselineCommand — 1 site
{
  const f = 'packages/command-registry/src/walls/UpdateWallBaselineCommand.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { serializeWallSnapshot } from './wallSnapshotUtils';");
  writeFileSync(f, s);
  console.log('✓ UpdateWallBaselineCommand (preamble added)');
}

// ──────────────────────────────────────────────────────────────────────────────
// command-registry/stair
// ──────────────────────────────────────────────────────────────────────────────

function addPreambleAfterLastImportBlock(src) {
  if (src.includes("DOMEventBus")) return src;
  // Find last line that starts with `import` (possibly multi-line imports end with `;`)
  const lines = src.split('\n');
  let lastImportIdx = -1;
  let inMultilineImport = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('import ') || inMultilineImport) {
      lastImportIdx = i;
      if (line.includes('{') && !line.includes('}')) inMultilineImport = true;
      else if (inMultilineImport && line.includes(';')) inMultilineImport = false;
      else if (!inMultilineImport) {}
    } else if (lastImportIdx >= 0 && !inMultilineImport && line.trim() !== '' && !line.startsWith('//') && !line.startsWith(' ') && !line.startsWith('*')) {
      break;
    }
  }
  if (lastImportIdx < 0) return src;
  lines.splice(lastImportIdx + 1, 0, BUS_IMPORT, BUS_CONST);
  return lines.join('\n');
}

const stairFiles = [
  'packages/command-registry/src/stair/CreateStairCommand.ts',
  'packages/command-registry/src/stair/UpdateStairParametersCommand.ts',
  'packages/command-registry/src/stair/UpdateStairFlightsCommand.ts',
  'packages/command-registry/src/stair/DeleteStairCommand.ts',
  'packages/command-registry/src/stair/CreateStairRailingCommand.ts',
  'packages/command-registry/src/stair/ChangeStairShapeCommand.ts',
  'packages/command-registry/src/stair/GenerateStairGeometryCommand.ts',
];
for (const f of stairFiles) {
  let s = readFileSync(f, 'utf8');
  s = addPreambleAfterLastImportBlock(s);
  writeFileSync(f, s);
  console.log(`✓ ${f.split('/').pop()} (preamble added)`);
}

// ──────────────────────────────────────────────────────────────────────────────
// command-registry/curtainwall
// ──────────────────────────────────────────────────────────────────────────────
const cwFiles = [
  'packages/command-registry/src/curtainwall/CreateCurtainWallCommand.ts',
  'packages/command-registry/src/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts',
  'packages/command-registry/src/curtainwall/CreateCurtainWallsFromSlabCommand.ts',
];
for (const f of cwFiles) {
  let s = readFileSync(f, 'utf8');
  s = addPreambleAfterLastImportBlock(s);
  writeFileSync(f, s);
  console.log(`✓ ${f.split('/').pop()} (preamble added)`);
}

// ──────────────────────────────────────────────────────────────────────────────
// command-registry misc
// ──────────────────────────────────────────────────────────────────────────────
const miscFiles = [
  ['packages/command-registry/src/generic/UpdateElementParameterCommand.ts', "import { windowStore } from '@pryzm/geometry-window';"],
  ['packages/command-registry/src/TagElementCommand.ts', "import { isRecognizedTag } from '@pryzm/core-app-model';"],
  ['packages/command-registry/src/views/SetViewLightingCommand.ts', "import type { ViewLightingSettings } from '@pryzm/core-app-model';"],
  ['packages/command-registry/src/lighting/CreateLightingCommand.ts', "import { semanticGraphManager } from '@pryzm/core-app-model';"],
  ['packages/command-registry/src/furniture/UpdateFurnitureParametersCommand.ts', "import * as THREE from '@pryzm/renderer-three/three';"],
  ['packages/command-registry/src/plumbing/UpdatePlumbingParametersCommand.ts', null],
  ['packages/command-registry/src/operations/UnderlayCommands.ts', "import { floorPlanUnderlayRef } from '@pryzm/core-app-model';"],
  ['packages/command-registry/src/levels/CreateMultipleLevelsCommand.ts', "import { CreatePlanViewCommand } from './CreatePlanViewCommand';"],
  ['packages/command-registry/src/project/ClearProjectCommand.ts', "import { projectScopeRegistry } from '@pryzm/core-app-model';"],
];
for (const [f, anchor] of miscFiles) {
  let s = readFileSync(f, 'utf8');
  if (anchor) {
    s = addBusPreamble(s, anchor);
  } else {
    s = addPreambleAfterLastImportBlock(s);
  }
  writeFileSync(f, s);
  console.log(`✓ ${f.split('/').pop()} (preamble added)`);
}

// ──────────────────────────────────────────────────────────────────────────────
// core-app-model stores with variable event names
// ──────────────────────────────────────────────────────────────────────────────

// ColumnStore — bim-subscriber-error (complex payload)
{
  const f = 'packages/core-app-model/src/stores/ColumnStore.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)");
  writeFileSync(f, s);
  console.log('✓ ColumnStore (preamble added)');
}

// StairTypeStore — variable event name
{
  const f = 'packages/core-app-model/src/stores/StairTypeStore.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)");
  writeFileSync(f, s);
  console.log('✓ StairTypeStore (preamble added)');
}

// HandrailStore — variable event name
{
  const f = 'packages/core-app-model/src/stores/HandrailStore.ts';
  let s = readFileSync(f, 'utf8');
  s = addBusPreamble(s, "import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)");
  writeFileSync(f, s);
  console.log('✓ HandrailStore (preamble added)');
}

console.log('\nDone. All preambles added. Run tsc to verify, then fix dispatches with edit tool.');
