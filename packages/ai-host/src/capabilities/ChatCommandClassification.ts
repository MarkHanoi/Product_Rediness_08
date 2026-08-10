// @pryzm/ai-host — ChatCommandClassification (ADR-0313 §No silent gaps)
// =============================================================================
//
// Every registered bus command that is NEITHER implemented by a ChatCapability
// NOR deferred in CHAT_UNAVAILABLE is classified HERE, with a class and a
// truthful reason. `tools/ga-gate/check-chat-capability-coverage.ts` fails CI
// when a registered command appears in none of the three places — so the
// undeclared baseline is 0 and a new command cannot ship silently.
//
// This file is the ROADMAP, not a smaller number: class A commands graduate
// into `ChatCapabilityRegistry.ts` (and leave this file in the same commit);
// everything else states why it has not.
//
//   B  needs design      — chat-shaped in principle, but missing a real piece
//                          (a value-source injection, a reference-resolution
//                          design, a placement model). `blockedBy` names it.
//   C  internal          — machinery a user never asks for in a sentence
//                          (batch executors, derived recomputes, registry
//                          plumbing). Exposing it would be noise or a footgun.
//   D  duplicate         — a second route to an outcome the chat already
//                          reaches through another command; wiring it would
//                          create two sources of truth for one ask.
//   E  unsafe            — project-wide generation/mutation that needs a
//                          bigger confirmation/preview model than the inline
//                          Confirm/Cancel card before chat may drive it.
//   F  explicitly deferred — chat-ready shape (same pattern as a shipped
//                          capability), deliberately left for a next tranche
//                          to bound this change; nothing blocks it but time.
//
// HONESTY RULE (same as AUTHORING_UNAVAILABLE): a reason must be TRUE, not
// decorative. Reclassifying is cheap; lying is not. The gate cross-checks that
// nothing here is simultaneously covered by a capability or CHAT_UNAVAILABLE,
// and that every entry names a command that is really registered.

export type ChatCommandClass = 'B' | 'C' | 'D' | 'E' | 'F';

export interface ChatCommandClassification {
  readonly cls: ChatCommandClass;
  readonly reason: string;
  /** For B/F: the capability this would become. */
  readonly potentialCapability?: string;
  /** For B/E: the concrete missing piece. */
  readonly blockedBy?: string;
}

type Entry = readonly [string, ChatCommandClassification];

function family(
  cls: ChatCommandClass,
  reason: string,
  commands: readonly string[],
  extra?: Omit<ChatCommandClassification, 'cls' | 'reason'>,
): Entry[] {
  return commands.map((c) => [c, { cls, reason, ...extra }] as const);
}

// ─── B — needs design ────────────────────────────────────────────────────────

const B_CREATION = family(
  'B',
  'Creating this element needs placement geometry (boundary / axis / host) the chat cannot infer from a sentence. The create-wall coordinate grammar is the precedent; extending it per family is a design step, not a wiring step.',
  [
    'beam.create', 'ceiling.create', 'column.create', 'curtain-wall.create',
    'floor.create', 'furniture.create', 'grid.create', 'handrail.create',
    'lighting.create', 'plumbing.create', 'plumbing.createFixture',
    'pool.create', 'room.create', 'roof.create', 'slab.create', 'stair.create',
    'structural.create', 'elevation.create', 'wall.createBetweenMarks',
    'stair.createRailing', 'roof.addSkylight', 'roof.removeSkylight',
    'slab.addHole', 'slab.removeHole',
  ],
  { blockedBy: 'per-family placement grammar (coordinates/host references) in the resolver context' },
);

const B_CATALOGUE = family(
  'B',
  'The value is a project-catalogue reference (type / section / rating / system). The set-wall-type pattern applies — an injected resolver per catalogue — but those catalogues are not injected into the resolver context yet.',
  [
    'beam.setSection', 'beam.setType', 'column.setType', 'door.setType',
    'door.setFireRating', 'window.setType', 'window.setFireRating',
    'slab.setType', 'stair.setType', 'roof.setShape', 'stair.setShape',
    'structural.setKind', 'plumbing.setSystem', 'room.setOccupancy',
    'curtain-wall.setMullionType', 'curtain-wall.setPanelType',
    'curtain-wall.setTransomType', 'element.changeType',
  ],
  { blockedBy: 'catalogue value-source injection (the wall-system-types precedent, one per catalogue)' },
);

const B_GEOMETRY_EDIT = family(
  'B',
  'Editing this needs a picked sub-entity or drawn geometry (a panel, a grid line, a polygon, a path) that a sentence cannot reference safely.',
  [
    'curtain-wall.addGridLine', 'curtain-wall.removeGridLine',
    'curtain-wall.addPanel', 'curtain-wall.removePanel',
    'curtain-wall.replacePanel', 'curtain-wall.rotatePanel',
    'curtain-wall.swapPanel', 'curtain-wall.setGrid', 'curtain-wall.setOutline',
    'curtain-wall.resize', 'ceiling.setBoundary', 'slab.movePolygon',
    'slab.updatePolygon', 'handrail.setPath', 'handrail.setShape',
    'handrail.setHost', 'handrail.moveBaseLine', 'wall.updateBaseline',
    'grid.setExtent', 'grid.setSpacing', 'grid.delete',
  ],
  { blockedBy: 'sub-entity reference resolution (chat can only reference whole selected elements)' },
);

const B_LAYERS = family(
  'B',
  'Layer-assembly editing is a structured multi-field edit (materials, thicknesses, order) that does not reduce to one sentence; the Properties panel owns it.',
  ['ceiling.updateLayers', 'floor.updateLayers', 'slab.updateLayers', 'wall.setLayers'],
  { blockedBy: 'an assembly-editing conversation design (multi-turn, previewed)' },
);

const B_DOCS = family(
  'B',
  'Documentation authoring (dimensions, annotations, schedules, sections, sheets) is view- and pointer-driven; chat has no way to reference a specific annotation, viewport or schedule column yet.',
  [
    'annotation.create', 'annotation.delete', 'annotation.move',
    'annotation.setColor', 'annotation.setKind', 'annotation.setRotation',
    'annotation.setText', 'annotation.setTextHeight', 'annotation.update',
    'dimension.create', 'dimension.createMany', 'dimension.delete',
    'dimension.move', 'dimension.setPrecision', 'dimension.setText',
    'dimension.setUnit',
    'schedule.column.add', 'schedule.column.remove', 'schedule.create',
    'schedule.delete', 'schedule.setFilter', 'schedule.setGroupBy',
    'schedule.update',
    'section.create', 'section.delete', 'section.moveLine',
    'section.setDepth', 'section.setMark', 'section.setScale',
    'sheet.addViewport', 'sheet.addWidget', 'sheet.create', 'sheet.delete',
    'sheet.moveViewport', 'sheet.removeViewport', 'sheet.removeWidget',
    'sheet.reorder', 'sheet.setSheetMetadata', 'sheet.setTitleBlock',
    'sheet.setViewportScale',
  ],
  { blockedBy: 'documentation-object reference resolution in the chat context' },
);

const B_VIEWS = family(
  'B',
  'View management needs the project view list (and for overrides, an element+view pair) injected into the resolver context — the same injection view.switch waits on.',
  [
    'view.create', 'view.delete', 'view.setCrop', 'view.setProjection',
    'view.setRange', 'view.setUnderlay', 'view.setOutput', 'view.updateCamera',
    'view.hideElement', 'view.isolateElement', 'view.clearOverride',
    'view.clearAllOverrides', 'view.setGraphicOverride',
    'element.hideInView', 'element.isolateInView', 'element.setGraphicOverride',
  ],
  { blockedBy: 'a project-views value source in the resolver context', potentialCapability: 'hide/isolate-in-view, switch-view' },
);

const B_MISC = [
  ...family('B', 'Copy needs a paste, and paste needs a target position the chat cannot infer — a pointer workflow end to end.', ['copy-selection', 'paste-clipboard'], { blockedBy: 'a placement model for the pasted content' }),
  ...family('B', 'Changing an element\'s level is chat-shaped ("move this to level 2") but re-hosting semantics (joins, openings, hosted children) need a per-family design before chat may drive it.', ['wall.changeLevel', 'roof.changeLevel'], { potentialCapability: 'move-to-level', blockedBy: 'defined re-hosting semantics per element family' }),
  // ADR-0315 U5a: level.duplicate-floor-plan LEFT this family — it is now the
  // duplicate-level capability; the "multi-parameter clarification flow" its
  // blocker demanded is exactly what the conversation provides.
  ...family('B', 'Renaming a level or changing its elevation is chat-shaped, but the payload shape mixes rename with elevation re-stacking; needs the level re-stack semantics pinned down first.', ['level.update'], { potentialCapability: 'rename-level / set-level-elevation', blockedBy: 'level re-stack semantics (what happens to elements on re-elevated levels)' }),
  ...family('B', 'Joining roofs needs two picked roofs — the same two-target problem as wall.join.', ['roof.joinRoofs'], { blockedBy: 'multi-target reference resolution' }),
  ...family('B', 'Boolean/enum toggles that are chat-shaped but whose vocabulary (swing side, accessibility standard, emergency circuit) needs a value design before phrases can map deterministically.', ['door.setSwing', 'door.setAccessibility', 'lighting.setEmergency'], { blockedBy: 'value vocabulary design' }),
  ...family('B', 'Scaling furniture needs an anchor and axis policy a bare factor does not carry.', ['furniture.setScale'], { blockedBy: 'scale anchor/axis policy' }),
  ...family('B', 'Brace end offsets are a structural detailing edit driven from the member\'s local frame — panel work.', ['structural.setBraceEndOffset']),
];

// ─── C — internal machinery ──────────────────────────────────────────────────

const C_BATCH = family(
  'C',
  'Batch executor verb used by the AI generation pipeline and importers; one dispatch creates many elements from prepared data. Users ask for the OUTCOME (a generated layout), which has its own flow — exposing the raw batch verb to chat would be a footgun.',
  [
    'beam.batch.create', 'ceiling.batch.create', 'column.batch.create',
    'curtain-wall.batch.create', 'curtain-wall.batch.delete',
    'curtain-wall.batch.update', 'door.batch.create', 'furniture.batch.create',
    'slab.batch.create', 'stair.batch.create', 'wall.batch.create',
    'window.batch.create', 'generative.applyLayout', 'wall.createFromSlab',
  ],
);

const C_PLUMBING = family(
  'C',
  'Registry / derived-state plumbing dispatched by the editor itself (recomputes, derivation marks, hierarchy nodes, templates, visibility-graph intents). Not a user-facing ask; a sentence never means this verb.',
  [
    'data.clearPropertyDerived', 'data.markPropertyDerived', 'data.setDerivation',
    'elementType.create', 'elementType.delete', 'elementType.duplicate',
    'elementType.update',
    'hierarchy.createBuilding', 'hierarchy.createLevel', 'hierarchy.createSite',
    'hierarchy.createUnit', 'hierarchy.updateNode',
    'template.assignToNode', 'template.create', 'template.unassign',
    'vg.assignIntent', 'vg.createVisibilityIntent',
    'vg.takeLatestIntentVersion', 'vg.updateVisibilityIntent',
    'view.createDefinition', 'view.deleteDefinition', 'view.updateDefinition',
    'viewTemplate.create', 'viewTemplate.delete', 'viewTemplate.update',
    'room.recomputeBoundary', 'room.redetect', 'room.updateBoundary',
    'handrail.recompute', 'wall.cascadeBaseline', 'wall.updateCurtainWall',
    'section.mark.create', 'furniture.setActiveLod',
    'furniture.setRepresentation', 'projectOrigin.setPosition',
    'projectOrigin.setVisible',
  ],
);

// ─── D — duplicates / implementation detail ──────────────────────────────────

const D_DELETE = family(
  'D',
  'Per-kind delete route. The chat deletes through the generic element.delete verb on the current selection ("delete selected"), which is the selection manager\'s own route for every kind — a second chat path per kind would be two sources of truth for one ask.',
  [
    'beam.delete', 'ceiling.delete', 'column.delete', 'curtain-wall.delete',
    'door.delete', 'furniture.delete', 'handrail.delete', 'lighting.delete', 'plumbing.delete',
    'pool.delete', 'wall.delete', 'roof.delete', 'room.delete', 'slab.delete', 'stair.delete',
    'structural.delete', 'window.delete',
  ],
);

const D_LEGACY = [
  // §FIX-CHAT-DEAD-ROUTES (ADR-0315 audit): ceiling.update / roof.update /
  // slab.updateDimensions / stair.updateParameters LEFT this family — they are
  // now the LIVE routes the capabilities dispatch (the old reason's claim that
  // element.updateParameters covered ceilings/roofs was wrong: resolveStore()
  // has no case for either).
  ...family('D', 'Legacy property-panel update bridge; the chat reaches the same parameters through element.updateParameters (set-height) with the store switch as the proven ceiling.', ['beam.update', 'column.update', 'floor.update', 'grid.update', 'schedule.update', 'slab.update', 'furniture.updateParameters', 'element.updateMark']),
  // §FIX-CHAT-DEAD-ROUTES — plugin handlers that produceCommand against the
  // DETACHED plugin DTO store (fresh PluginRegistry instances; nothing that
  // renders, persists or exports reads them, and no committer bridges updates
  // back — the §FIX-MATERIAL-DEAD-DISPATCH disease). Dispatching one LOOKS like
  // success and changes nothing. The chat previously dispatched all eight; each
  // is re-routed to the live legacy path named in the capability's commandProof.
  ...family('D', 'Plugin DTO-store handler nothing in production reads (§FIX-MATERIAL-DEAD-DISPATCH family) — a dispatch looks like success and changes nothing; chat drives the live legacy route instead (see the owning capability commandProof).', [
    'slab.setThickness', 'roof.setThickness', 'roof.setPitch',
    'stair.setWidth', 'ceiling.setHeight',
  ]),
  // §FIX-DIMS-REACH-RECORD (L-815): these verbs are now LIVE same-name
  // legacy bridges in initBusHandlers (the dead plugin handlers were retired
  // from registration). They serve the legacy inspector; chat reaches the
  // same parameters through element.updateParameters, so a second chat route
  // per verb would be two sources of truth for one ask.
  ...family('D', 'Inspector single-opening route, live-bridged via initBusHandlers → UpdateElementParameterCommand; chat reaches the same parameters through element.updateParameters.', [
    'window.setSize', 'window.setSillHeight', 'door.setWidth', 'door.setSillHeight',
  ]),
  ...family('D', 'Single-wall variant of the batch retype the chat already drives (wall.updateSystemTypeBatch covers one wall, many, or all).', ['wall.setSystemType', 'wall.updateSystemType']),
  ...family('D', 'Second dimension route for walls; the chat uses wall.updateDimensions.', ['wall.setDimensions']),
  ...family('D', 'Dedicated height route; the chat sets column height via element.updateParameters (set-height), the same route the property panel uses.', ['column.setHeight']),
  ...family('D', 'Dedicated height route; the chat sets door height via element.updateParameters (set-height).', ['door.setHeight']),
  ...family('D', 'room.rename (the chat\'s route) already carries name AND roomNumber through the same legacy RenameRoomCommand bridge.', ['room.setName']),
  ...family('D', 'Bare-verb alias registration of the .create form.', ['floor', 'pool']),
  ...family('D', 'Legacy alias of grid.create registered in initBusHandlers.', ['grid.add']),
];

// ─── E — unsafe without a bigger confirmation model ──────────────────────────

const E_BULK = family(
  'E',
  'Project-wide generation in one verb (every slab / every floor). Reversible, but the blast radius is the whole model and the inline Confirm/Cancel card shows no preview of what will appear — needs preview-before-execute, which ADR-0313 explicitly defers.',
  ['curtain-wall.create-on-all-slabs', 'slab.create-on-all-floors', 'wall.create-on-all-slabs'],
  { blockedBy: 'preview-before-execute (deliberately out of scope in ADR-0313)' },
);

// ─── F — explicitly deferred (chat-ready shape, next tranche) ────────────────

// §FIX-CHAT-DEAD-ROUTES (ADR-0315 liveness audit): the old F entries claimed
// these were "chat-ready shapes, nothing blocks them but scope". FALSE for five
// of the nine — their handlers write the DETACHED plugin DTO store, so wiring
// them would have shipped five more silent no-ops. The truthful dispositions:
//   · stair riser height / tread DEPTH have LIVE carriers on
//     stair.updateParameters → now shipped capabilities (set-riser-height /
//     set-tread-depth); the dead per-field verbs are classified D below.
//   · room.setHeightOffset is a LIVE commandManager bridge → shipped capability.
//   · stair tread COUNT (numRisers) has NO live carrier — UpdateStairParameters
//     has no such field — so it is a G-class editor gap, recorded as D-dead
//     with that reason, not resurrected as a capability.
//   · slab.setBaseOffset / roof.setOverhang / lighting.setIntensity are dead;
//     slab baseOffset's live carrier is element.updateParameters (future
//     property-vocabulary tranche); roof overhang and lighting intensity have
//     no proven live carrier yet.
const F_NEXT = [
  ...family('F', 'Same user-text rename shape as rename-room; deferred to bound this tranche (needs a sheet/view reference, which selection does not provide today).', ['sheet.rename', 'view.rename'], { potentialCapability: 'rename-sheet / rename-view' }),
  ...family('F', 'Width+height pair with the set-width shape (set-width drives the width half today); deferred to bound this tranche.', ['structural.setDimensions'], { potentialCapability: 'set-structural-dimensions' }),
];

const D_DEAD_F = family(
  'D',
  'Plugin DTO-store handler nothing in production reads (§FIX-MATERIAL-DEAD-DISPATCH family) — wiring it would ship a silent no-op; the live carrier (where one exists) is named in ChatCapabilityRegistry or the property-vocabulary backlog.',
  [
    'stair.setRiserHeight', 'stair.setTreadCount', 'slab.setBaseOffset',
    'roof.setOverhang', 'lighting.setIntensity',
  ],
);

// ─── The map ─────────────────────────────────────────────────────────────────

export const CHAT_CLASSIFIED: ReadonlyMap<string, ChatCommandClassification> = new Map([
  ...B_CREATION, ...B_CATALOGUE, ...B_GEOMETRY_EDIT, ...B_LAYERS, ...B_DOCS,
  ...B_VIEWS, ...B_MISC,
  ...C_BATCH, ...C_PLUMBING,
  ...D_DELETE, ...D_LEGACY, ...D_DEAD_F,
  ...E_BULK,
  ...F_NEXT,
]);

/** Classification for a bus command, or undefined (= capability, deferred, or a
 *  genuinely silent gap the gate will fail). */
export function chatClassification(busCommand: string): ChatCommandClassification | undefined {
  return CHAT_CLASSIFIED.get(busCommand);
}

/** Counts per class, for the gate's report. */
export function classificationBreakdown(): Readonly<Record<ChatCommandClass, number>> {
  const out: Record<ChatCommandClass, number> = { B: 0, C: 0, D: 0, E: 0, F: 0 };
  for (const { cls } of CHAT_CLASSIFIED.values()) out[cls] += 1;
  return out;
}
