#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

const MAP = {
  // ── per-family stores → E.<family>.S
  wallStore:                { sub: 'E.wall.S',         repl: 'runtime.stores.wall' },
  slabStore:                { sub: 'E.slab.S',         repl: 'runtime.stores.slab' },
  floorStore:               { sub: 'E.floor.S',        repl: 'runtime.stores.floor' },
  ceilingStore:             { sub: 'E.ceiling.S',      repl: 'runtime.stores.ceiling' },
  roofStore:                { sub: 'E.roof.S',         repl: 'runtime.stores.roof' },
  columnStore:              { sub: 'E.column.S',       repl: 'runtime.stores.column' },
  beamStore:                { sub: 'E.beam.S',         repl: 'runtime.stores.beam' },
  stairStore:               { sub: 'E.stair.S',        repl: 'runtime.stores.stair' },
  handrailStore:            { sub: 'E.handrail.S',     repl: 'runtime.stores.handrail' },
  doorStore:                { sub: 'E.door.S',         repl: 'runtime.stores.door' },
  windowStore:              { sub: 'E.window.S',       repl: 'runtime.stores.window' },
  furnitureStore:           { sub: 'E.furniture.S',    repl: 'runtime.stores.furniture' },
  plumbingStore:            { sub: 'E.plumbing.S',     repl: 'runtime.stores.plumbing' },
  lightingStore:            { sub: 'E.lighting.S',     repl: 'runtime.stores.lighting' },
  curtainWallStore:         { sub: 'E.curtain-wall.S', repl: 'runtime.stores.curtainWall' },
  curtainPanelStore:        { sub: 'E.curtain-wall.S', repl: 'runtime.stores.curtainPanel' },
  // system type stores fold into their family
  wallSystemTypeStore:      { sub: 'E.wall.S',         repl: 'runtime.stores.wall (system types)' },
  slabSystemTypeStore:      { sub: 'E.slab.S',         repl: 'runtime.stores.slab (system types)' },
  floorSystemTypeStore:     { sub: 'E.floor.S',        repl: 'runtime.stores.floor (system types)' },
  ceilingSystemTypeStore:   { sub: 'E.ceiling.S',      repl: 'runtime.stores.ceiling (system types)' },
  windowSystemTypeStore:    { sub: 'E.window.S',       repl: 'runtime.stores.window (system types)' },
  // non-architectural family stores
  gridStore:                { sub: 'E.13',             repl: 'runtime.stores.grids (E.grids.S slot)' },
  openingStore:             { sub: 'E.14',             repl: 'runtime.stores.opening (E.opening.S slot)' },
  roomStore:                { sub: 'E.18-R.S',         repl: 'runtime.stores.rooms slot' },
  ifcModelStore:            { sub: 'E.ifc.S',          repl: 'runtime.stores.ifcModel' },
  // project / hub stores → C.3.x
  projectStore:             { sub: 'C.3.x',            repl: 'runtime.projectContext' },
  projectContext:           { sub: 'C.3.x',            repl: 'runtime.projectContext' },
  projectSerializer:        { sub: 'C.3.x',            repl: 'runtime.persistence serializer' },
  currentProjectId:         { sub: 'C.3.x',            repl: 'runtime.projectContext.id' },
  __pendingProjectId:       { sub: 'C.3.x',            repl: 'runtime.persistence.openProject hint' },
  __pendingProjectName:     { sub: 'C.3.x',            repl: 'runtime.persistence.openProject hint' },
  authToken:                { sub: 'C.3.x',            repl: 'runtime.session.authToken' },
  elementCodeStore:         { sub: 'C.3.x',            repl: 'runtime.projectContext element-code registry' },
  // view / template / sheet stores → F.6.x (per Layout.ts precedent for view registry)
  viewDefinitionStore:      { sub: 'F.6.x',            repl: 'runtime.viewRegistry definitions' },
  viewTemplateStore:        { sub: 'F.6.x',            repl: 'runtime.viewRegistry templates' },
  templateStore:            { sub: 'F.6.x',            repl: 'runtime.viewRegistry templates' },
  templateAssignmentStore:  { sub: 'F.6.x',            repl: 'runtime.viewRegistry template-assignment' },
  sheetStore:               { sub: 'F.6.x',            repl: 'runtime.sheets store' },
  activeSheetId:            { sub: 'F.6.x',            repl: 'runtime.sheets.activeId' },
  programmeStore:           { sub: 'F.6.x',            repl: 'runtime.dataWorkbench.programme store' },
  levelStore:               { sub: 'F.6.x',            repl: 'runtime.viewRegistry levels' },
  hierarchyStore:           { sub: 'F.6.x',            repl: 'runtime.dataWorkbench.hierarchy store' },
  // per-family tools → E.<family>.T
  floorTool:                { sub: 'E.floor.T',        repl: "runtime.tools.activate('floor', mode)" },
  ceilingTool:              { sub: 'E.ceiling.T',      repl: "runtime.tools.activate('ceiling', mode)" },
  lightingTool:             { sub: 'E.lighting.T',     repl: "runtime.tools.activate('lighting', mode)" },
  rampTool:                 { sub: 'E.6',              repl: "runtime.tools.activate('ramp') after plugins/ramp lands" },
  roomTool:                 { sub: 'E.18-R',           repl: "runtime.tools.activate('room')" },
  roomBoundingLineTool:     { sub: 'E.18-RBL',         repl: "runtime.tools.activate('roomBoundingLine')" },
  // engine façades / components → D.4
  bimManager:               { sub: 'D.4',              repl: 'runtime.scene.renderer / runtime.tools' },
  world:                    { sub: 'D.4',              repl: 'runtime.scene.world' },
  toolManager:              { sub: 'D.4',              repl: 'runtime.tools' },
  viewController:           { sub: 'D.4',              repl: 'runtime.viewRegistry controller' },
  renderPipelineManager:    { sub: 'D.4',              repl: 'runtime.scene.renderer.pipeline' },
  renderingPipelineCoordinator: { sub: 'D.4',          repl: 'runtime.scene.renderer.pipeline coordinator' },
  ssgiService:              { sub: 'D.4',              repl: 'runtime.scene.renderer SSGI service' },
  enhancedBloomService:     { sub: 'D.4',              repl: 'runtime.scene.renderer bloom service' },
  viewportPathTracer:       { sub: 'D.4',              repl: 'runtime.scene.renderer path-tracer' },
  presentationEngine:       { sub: 'D.4',              repl: 'runtime.scene.presentation engine' },
  annotationManager:        { sub: 'D.4',              repl: 'runtime.scene.annotation manager' },
  components:               { sub: 'D.4',              repl: 'runtime.scene.components (ThatOpen)' },
  constraintEngine:         { sub: 'D.4',              repl: 'runtime.scene.constraint engine' },
  currentPipelinePhase:     { sub: 'D.4',              repl: 'runtime.scene.renderer.pipeline phase flag' },
  dimensionManager:         { sub: 'D.4',              repl: 'runtime.scene.dimension manager' },
  enableEnhancedBloom:      { sub: 'D.4',              repl: 'runtime.scene.renderer.setBloom(true)' },
  disableEnhancedBloom:     { sub: 'D.4',              repl: 'runtime.scene.renderer.setBloom(false)' },
  enableSSGI:               { sub: 'D.4',              repl: 'runtime.scene.renderer.setSSGI(true)' },
  disableSSGI:              { sub: 'D.4',              repl: 'runtime.scene.renderer.setSSGI(false)' },
  enableViewportRenderMode: { sub: 'D.4',              repl: 'runtime.scene.renderer.setViewportRenderMode(true)' },
  disableViewportRenderMode:{ sub: 'D.4',              repl: 'runtime.scene.renderer.setViewportRenderMode(false)' },
  navManager:               { sub: 'D.4',              repl: 'runtime.scene.navigation manager' },
  OBCF:                     { sub: 'D.4',              repl: 'runtime.scene.components-front (ThatOpen front)' },
  obcViewpoints:            { sub: 'D.4',              repl: 'runtime.scene.components viewpoints' },
  obcWorld:                 { sub: 'D.4',              repl: 'runtime.scene.world (ThatOpen)' },
  __PRYZM_SCENE__:          { sub: 'D.4',              repl: 'runtime.scene (debug handle)' },
  readModel:                { sub: 'D.4',              repl: 'runtime.scene.readModel' },
  semanticGraphManager:     { sub: 'D.4',              repl: 'runtime.scene.semantic-graph manager' },
  setRenderQualityLevel:    { sub: 'D.4',              repl: 'runtime.scene.renderer.setQualityLevel' },
  temporalGraphManager:     { sub: 'D.4',              repl: 'runtime.scene.temporal-graph manager' },
  worldModelAdapter:        { sub: 'D.4',              repl: 'runtime.scene.world-model adapter' },
  furnitureFragmentBuilder: { sub: 'E.furniture.S',    repl: 'runtime.stores.furniture fragment builder' },
  // selection → D.13
  selectionManager:         { sub: 'D.13',             repl: 'runtime.selection' },
  // camera / gizmo → D.9 / D.10
  cameraControls:           { sub: 'D.9',              repl: 'runtime.cameraController' },
  transformControls:        { sub: 'D.10',             repl: 'runtime.cameraController.gizmo' },
  firstPersonController:    { sub: 'D.9',              repl: 'runtime.cameraController.firstPerson' },
  // floor-plan / underlay → E.floor.X (per B.7-batch precedent)
  floorPlanUnderlayTool:    { sub: 'E.floor.X',        repl: "runtime.tools.activate('underlay') after plugins/floor lands" },
  __pryzmRecreateUnderlayInternal: { sub: 'E.floor.X', repl: 'runtime.tools underlay internal — fold into plugins/floor' },
  __pryzmRemoveUnderlayInternal:   { sub: 'E.floor.X', repl: 'runtime.tools underlay internal — fold into plugins/floor' },
  // panel-host registry → F.6.5
  toggleFloorPlanPanel:     { sub: 'F.6.5',            repl: "runtime.plugins.contributions('panel.toggle')" },
  sheetEditorPanel:         { sub: 'F.6.5',            repl: 'runtime.panelHost.get(\'sheetEditor\')' },
  viewPropertiesPanel:      { sub: 'F.6.5',            repl: 'runtime.panelHost.get(\'viewProperties\')' },
  visibilityIntentPanel:    { sub: 'F.6.5',            repl: 'runtime.panelHost.get(\'visibilityIntent\')' },
  vizEnginePanel:           { sub: 'F.6.5',            repl: 'runtime.panelHost.get(\'visualizationEngine\')' },
  renderPanel:              { sub: 'F.6.5',            repl: 'runtime.panelHost.get(\'render\')' },
  panoramaPanel:            { sub: 'F.6.5',            repl: 'runtime.panelHost.get(\'panorama\')' },
  performanceModePanel:     { sub: 'F.6.5',            repl: 'runtime.panelHost.get(\'performanceMode\')' },
  annotationVisibilityPanel:{ sub: 'F.6.5',            repl: 'runtime.panelHost.get(\'annotationVisibility\')' },
  schedulePanel:            { sub: 'F.6.5',            repl: 'runtime.panelHost.get(\'schedules\')' },
  videoExportPanel:         { sub: 'F.6.5',            repl: 'runtime.panelHost.get(\'videoExport\')' },
  dataWorkbench:            { sub: 'F.6.5',            repl: 'runtime.panelHost.get(\'dataWorkbench\')' },
  // commandManager → E.5.x (per B.7-batch precedent for generic context)
  commandManager:           { sub: 'E.5.x',            repl: 'runtime.bus.executeCommand(name, payload)' },
  __pryzmCommands__:        { sub: 'E.5.x',            repl: 'runtime.bus debug-handle' },
  // family-tagged active-mode flags
  __curtainSubElement:      { sub: 'E.curtain-wall.S', repl: 'runtime.stores.curtainWall sub-element' },
  _pryzmActiveLightingType: { sub: 'E.lighting.X',     repl: 'runtime.tools.lighting active-fixture state' },
  _pryzmActivePlumbingType: { sub: 'E.plumbing.X',     repl: 'runtime.tools.plumbing active-fixture state' },
  _pryzmActiveShowerVariant:{ sub: 'E.plumbing.X',     repl: 'runtime.tools.plumbing active-shower-variant state' },
  _pryzmActiveToiletVariant:{ sub: 'E.plumbing.X',     repl: 'runtime.tools.plumbing active-toilet-variant state' },
  // rooms cluster (E.18-R)
  roomBoundaryBuilder:      { sub: 'E.18-R',           repl: 'runtime.rooms.boundaryBuilder' },
  roomContentsService:      { sub: 'E.18-R',           repl: 'runtime.rooms.contentsService' },
  roomGraphService:         { sub: 'E.18-R',           repl: 'runtime.rooms.graphService' },
  roomQueryService:         { sub: 'E.18-R',           repl: 'runtime.rooms.queryService' },
  roomTopologyObserver:     { sub: 'E.18-R',           repl: 'runtime.rooms.topologyObserver' },
  // misc void-runtime / debug → C.3.x
  io:                       { sub: 'C.3.x',            repl: 'runtime.transport.socket' },
  Sentry:                   { sub: 'C.3.x',            repl: 'runtime.telemetry (Sentry)' },
  syncStateEngine:          { sub: 'C.3.x',            repl: 'runtime.persistence.syncState engine' },
  requestIdleCallback:      { sub: 'C.3.x',            repl: 'browser shim — runtime.platform.idleCallback' },
  dxfExportService:         { sub: 'C.3.x',            repl: 'runtime.exports.dxf service' },
  __rq_video_job_id__:      { sub: 'C.3.x',            repl: 'runtime.exports.video job-id (debug)' },
  __stores:                 { sub: 'C.3.x',            repl: 'runtime.stores debug handle' },
  __hierarchyCmds__:        { sub: 'F.6.x',            repl: 'runtime.dataWorkbench.hierarchy commands' },
  elementRegistry:          { sub: 'D.4',              repl: 'runtime.scene.elementRegistry' },
};

// ── manual overrides for TODO(B) sites whose context can't be derived ─────
// from a same-line `(window as any).<accessor>` cast.  Each entry is keyed
// by `<file>:<1-based line number>` and supplies the destruction sub-phase
// + the human-readable replacement description.
const MANUAL = {
  // JSDoc header that mentions `(window as any)` in prose only — file is
  // about door-type selection, so it lives under E.door.
  'src/ui/property-panel/DoorTypeSelectorWidget.ts:16': {
    sub: 'E.door.S',
    repl: 'runtime.stores.door (system types) — JSDoc reference',
  },
  // JSDoc constructor comment describing `(window as any).<engine field>`
  // reaches; the broad engine-façade bucket is D.4.
  'src/ui/platform/PlatformShell.ts:148': {
    sub: 'D.4',
    repl: 'runtime.scene.<engine field> — JSDoc reference',
  },
};

// ── locate every src/ui file with TODO(B): markers ──────────────────────────
const filesRaw = execSync(`rg -l 'TODO\\(B\\):' src/ui/`, { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

const stats = { files: 0, retargeted: 0, voidStubs: 0, perFamilyLoop: 0, unmatched: [] };

for (const file of filesRaw) {
  const original = readFileSync(file, 'utf8');
  const lines = original.split('\n');
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('TODO(B):')) continue;

    // ── pattern 1: void-runtime stub  (Variant C panels) ──────────────────
    // /* B-runtime-void mountX — TODO(B): consume in Phase C */
    if (/TODO\(B\): consume in Phase C/.test(line)) {
      lines[i] = line.replace(
        /TODO\(B\): consume in Phase C/,
        'TODO(C.3.x): consume in Phase C — runtime threading lands when Phase C wires the panel-host slot'
      );
      stats.voidStubs++;
      changed = true;
      continue;
    }

    // ── pattern 2: per-family loop comment ────────────────────────────────
    // const w = window as any; // TODO(B): legacy per-family window store reach — replace with runtime.stores.<family>.getAll() ...
    if (/TODO\(B\): legacy per-family window store reach/.test(line)) {
      lines[i] = line.replace(
        /TODO\(B\): legacy per-family window store reach/,
        'TODO(E.<family>.S): legacy per-family window store reach'
      );
      stats.perFamilyLoop++;
      changed = true;
      continue;
    }

    // ── pattern 3a: manual override (JSDoc / prose-only TODO sites) ──────
    const key = `${file}:${i + 1}`;
    if (MANUAL[key]) {
      const { sub, repl } = MANUAL[key];
      lines[i] = line.replace(
        /TODO\(B\): legacy window-cast — replace with runtime accessor in Phase C/,
        `TODO(${sub}): legacy window-cast — replace with ${repl}`
      );
      if (lines[i] === line) {
        stats.unmatched.push(`${file}:${i + 1}  (manual override could not patch)`);
        continue;
      }
      stats.retargeted++;
      changed = true;
      continue;
    }

    // ── pattern 3b: standard "legacy window-cast — replace with runtime accessor in Phase C"
    // Find the rightmost (window as any).<accessor> BEFORE the TODO(B): marker.
    const todoIdx = line.indexOf('TODO(B):');
    const before = line.slice(0, todoIdx);
    const allCasts = [...before.matchAll(/\(window as any\)\.([A-Za-z_$][A-Za-z0-9_$]*)/g)];
    if (allCasts.length === 0) {
      // ── pattern 3c: dynamic per-family lookup `(window as any)[<key>]` ──
      // (e.g., `for (const k of stores) { (window as any)[k] }`).  Treat
      // identically to the per-family loop comment.
      if (/\(window as any\)\[/.test(before)) {
        lines[i] = line.replace(
          /TODO\(B\): legacy window-cast — replace with runtime accessor in Phase C/,
          'TODO(E.<family>.S): legacy per-family window store reach — replace with runtime.stores.<family> when family stores are exposed via runtime in Phase E/F'
        );
        if (lines[i] === line) {
          stats.unmatched.push(`${file}:${i + 1}  (per-family bracket lookup could not patch)`);
          continue;
        }
        stats.perFamilyLoop++;
        changed = true;
        continue;
      }
      stats.unmatched.push(`${file}:${i + 1}  (no window-cast on line)`);
      continue;
    }
    const accessor = allCasts[allCasts.length - 1][1];
    const m = MAP[accessor];
    if (!m) {
      stats.unmatched.push(`${file}:${i + 1}  (no mapping for "${accessor}")`);
      continue;
    }

    lines[i] = line.replace(
      /TODO\(B\): legacy window-cast — replace with runtime accessor in Phase C/,
      `TODO(${m.sub}): legacy ${accessor} — replace with ${m.repl}`
    );
    if (lines[i] === line) {
      stats.unmatched.push(`${file}:${i + 1}  (unrecognised TODO(B) suffix)`);
      continue;
    }
    stats.retargeted++;
    changed = true;
  }

  if (changed) {
    writeFileSync(file, lines.join('\n'));
    stats.files++;
  }
}

console.log(`Files modified:           ${stats.files}`);
console.log(`Standard retargets:       ${stats.retargeted}`);
console.log(`Void-runtime stubs:       ${stats.voidStubs}`);
console.log(`Per-family loop comments: ${stats.perFamilyLoop}`);
console.log(`Total retargets:          ${stats.retargeted + stats.voidStubs + stats.perFamilyLoop}`);
console.log(`Unmatched lines:          ${stats.unmatched.length}`);
if (stats.unmatched.length) {
  console.log('\n--- unmatched (need manual review) ---');
  for (const u of stats.unmatched.slice(0, 50)) console.log('  ' + u);
}
