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
    'structural.setKind', 'plumbing.setSystem',
    // §FEAT-CHAT-ROOM-OCCUPANCY (2026-08-14) — `room.setOccupancy` LEFT this
    // family and is now the `set-room-occupancy` CAPABILITY.
    //
    // It never belonged here. This family's reason is "the value is a
    // project-catalogue reference … those catalogues are not injected into the
    // resolver context yet" — and room occupancy is not a project catalogue.
    // It is a CLOSED COMPILE-TIME ENUM (`RoomOccupancyTypeSchema`, 51 members,
    // the same in every project), so there was never an injection to wait for.
    // The blocker was unsatisfiable in the sense that matters: nothing anyone
    // could build would ever have "arrived", because the missing thing did not
    // exist. Cost of the miscategorisation: the founder's rooms read
    // `unclassified` while a LIVE, undoable verb sat one sentence away.
    //
    // The lesson generalises — when a deferral names a dependency, check the
    // dependency is real for THAT verb before inheriting the family's reason.
    'curtain-wall.setMullionType', 'curtain-wall.setPanelType',
    'curtain-wall.setTransomType',
    // §FEAT-CHAT-STAIR-TYPES (L-1441, 2026-08-20) — `element.changeType` LEFT
    // this family and is now the `set-stair-railing-type` CAPABILITY's dispatch.
    //
    // ⭐ THE SECOND TIME THIS FAMILY'S REASON EXPIRED WITHOUT NOTICE, and the
    // note above about `room.setOccupancy` predicted it in general terms: *"when
    // a deferral names a dependency, check the dependency is real for THAT verb
    // before inheriting the family's reason."*
    //
    // The reason here is *"those catalogues are not injected into the resolver
    // context yet"*. For the STAIR-RAILING branch of this verb that dependency
    // was satisfiable two ways and nobody re-checked either: `handrailTypeStore`
    // is a module SINGLETON any L2 module can read (no injection needed at all),
    // and §FEAT-HANDRAIL-TYPE-PROJECTION (L-1105) had already moved the
    // thirteen-field materialisation BEHIND the verb, so `{ newTypeId }` alone
    // is now a complete payload. The founder's *"Make all the stair railings
    // type X"* was one sentence away from working while this row said it was
    // blocked.
    //
    // ⚠ The verb is REMOVED, not narrowed, and that is deliberate: this map's
    // key is a BUS VERB, and a verb that any capability dispatches is a
    // capability dispatch — the three surfaces are disjoint by verb, which is
    // what the registry gate asserts. The fifteen OTHER families this verb
    // serves are still unpublished to chat; they are absent from the CAPABILITY
    // side, which is where their absence is now visible, rather than mis-recorded
    // here as a blocked verb.
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
  // §LIGHT121 (L-11900) — the lighting drag-move authoring verb, the exact sibling
  // of `plumbing.moveFixture` (which sits in CHAT_UNAVAILABLE with the same reason;
  // the two surfaces are disjoint by the coverage gate's rule, so this one is
  // classified here rather than duplicated there).
  ...family('B', 'Moving a lighting fixture from chat needs a target world position the sentence cannot carry — drag it, or use the Move tool.', ['lighting.moveFixture'], { blockedBy: 'a placement/position reference model for chat (the same blocker as plumbing.moveFixture)' }),
  // §L-1032 — DELETED, not moved. This row deferred `wall.changeLevel` and
  // `roof.changeLevel` as class B with
  // `blockedBy: 'defined re-hosting semantics per element family'`.
  //
  // That blocker is DISCHARGED by the thing it named: the per-family semantics
  // are now written down once, in `LEVEL_CHANGE_VERBS` (twelve families, each
  // with its verb and its payload spelling) and `LEVEL_CHANGE_REFUSALS` (nine
  // families that must NOT get it, each with the clause that decides it), in
  // `@pryzm/command-bus/src/levelChangeVerbs.ts`. The `move-to-level`
  // capability in `ChatCapabilityRegistry.ts` declares all twelve verbs and the
  // deletion is in the SAME commit — a verb declared both as a capability and
  // as a classification fails the coverage gate's disjointness check, which is
  // exactly the guard that should stop a half-finished promotion.
  // ADR-0315 U5a: level.duplicate-floor-plan LEFT this family — it is now the
  // duplicate-level capability; the "multi-parameter clarification flow" its
  // blocker demanded is exactly what the conversation provides.
  ...family('B', 'Renaming a level or changing its elevation is chat-shaped, but the payload shape mixes rename with elevation re-stacking; needs the level re-stack semantics pinned down first.', ['level.update'], { potentialCapability: 'rename-level / set-level-elevation', blockedBy: 'level re-stack semantics (what happens to elements on re-elevated levels)' }),
  ...family('B', 'Joining roofs needs two picked roofs — the same two-target problem as wall.join.', ['roof.joinRoofs'], { blockedBy: 'multi-target reference resolution' }),
  ...family('B', 'Boolean/enum toggles that are chat-shaped but whose vocabulary (swing side, accessibility standard, emergency circuit) needs a value design before phrases can map deterministically.', ['door.setSwing', 'door.setAccessibility', 'lighting.setEmergency'], { blockedBy: 'value vocabulary design' }),
  ...family('B', 'Scaling furniture needs an anchor and axis policy a bare factor does not carry.', ['furniture.setScale'], { blockedBy: 'scale anchor/axis policy' }),
  ...family('B', 'Brace end offsets are a structural detailing edit driven from the member\'s local frame — panel work.', ['structural.setBraceEndOffset']),
  // §PROP-OVERHANG tranche (VERBS-CAP, 2026-08-11). `room.setFinish` landed
  // LIVE this session (VERBS-CMD) on the legacy commandManager bridge, closing
  // the scorecard's "reader with no write". It is NOT yet a capability, and the
  // reason is specific rather than "not done yet":
  //
  //  · THE VALUE. `RoomFinishSpecInput` REQUIRES `materialName` AND
  //    `materialColor`. `finishRef.ts` resolves a spoken finish word, and
  //    `colorRef.ts` resolves a colour word, but no value source yields the
  //    PAIR from one noun ("oak"), so a capability would have to invent a
  //    colour for a named material — a second source of truth for the material
  //    library, and exactly the ElementCapabilities lie in value form.
  //  · THE GRAMMAR. The ask is "set the FLOOR finish of this room to oak" — a
  //    SURFACE-qualified catalogue ask. The property vocabulary carries only
  //    measurements, and the catalogue-family factory carries only "change the
  //    <kind> type to X"; neither shape has a surface slot, so this needs a new
  //    matcher in ZeroTokenResolver.ts.
  //
  // Deliberately NOT routed through the measurement seam either: `finishes
  // .skirtingHeight` / `.coveHeight` ARE plain measurements and would have been
  // two free PropertyVocabulary rows, but repo-wide they are read by NOTHING
  // except the Zod schema, the store clone and the snapshot serializer — no
  // builder, no projector, no exporter. Claiming them would be the beam-height
  // lie again (a write nothing reads, reported as "Done"). Same reason
  // `roof.ridgeOffset` and `roof.fascia` are absent from the property table.
  ...family(
    'B',
    'Room finishes are LIVE and persisted (the verb bridges to UpdateRoomCommand → the authoritative RoomStore), but the chat cannot yet SAY one: the payload requires a materialName + materialColor PAIR that no single value source yields from one spoken noun, and the "set the <surface> finish of this room to <material>" shape has no matcher — it fits neither the measurement vocabulary nor the catalogue-family factory.',
    ['room.setFinish'],
    {
      potentialCapability: 'set-room-finish',
      blockedBy: 'a finish value source yielding materialName+materialColor together, plus a surface-qualified catalogue grammar in ZeroTokenResolver',
    },
  ),
  // §FEAT-BULK-DIMENSIONS (L-949, 2026-08-17) — the `wall.updateHeightBatch`
  // B-family entry that stood here is GONE, because the blocker it named is
  // gone. It read: "a PROJECT-scoped measurement grammar (the property
  // vocabulary is per-selection by construction), and a resolver for the
  // `exterior` qualifier."
  //
  //  • THE GRAMMAR SHIPPED. `DimensionFamilies.ts` generates it, and
  //    `set-wall-dimensions` is now a declared capability riding this exact
  //    verb — so leaving the entry here would be a SECOND declaration of one
  //    verb, which the coverage gate's stale-entry check exists to catch.
  //  • THE `exterior` QUALIFIER IS STILL UNRESOLVED, and it is handled by NOT
  //    CLAIMING rather than by classifying the whole verb as blocked: the
  //    grammar refuses any sentence carrying exterior/interior/load-bearing
  //    outright (`UNRESOLVED_QUALIFIER`), so "raise all exterior walls to 3.2 m"
  //    stays a miss instead of silently raising every wall in the building —
  //    which was the entire hazard this entry was written to prevent. The
  //    unqualified sentence the founder also asks for ("set all walls 3m high")
  //    is served. A wall-FUNCTION ElementFilter that can refuse an empty
  //    "exterior" set out loud remains the follow-up.
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
    'handrail.recompute', 'wall.cascadeBaseline',
    // 'wall.updateCurtainWall' left this list with §CW90 item 5: it is now a
    // CAPABILITY DISPATCH (set-post-spacing / set-transom-spacing ride it,
    // because element.updateParameters cannot clear gridSystem), so a sentence
    // CAN mean this verb and classifying it as plumbing would double-book it.
    'section.mark.create', 'furniture.setActiveLod',
    'furniture.setRepresentation', 'projectOrigin.setPosition',
    'projectOrigin.setVisible',
  ],
);

// ─── D — duplicates / implementation detail ──────────────────────────────────

// RAC U9.2 — the reason is UPDATED, not just re-stated. The chat now has TWO
// generic delete routes and neither is per-kind: `element.delete` for the
// selection, and `element.deleteBatch` for a RESOLVED scope ("delete all
// furniture in the kitchen"). A per-kind verb would be a third source of truth
// for the same ask, and would lose the property the batch exists for — N
// deletes in ONE undo entry.
const D_DELETE = family(
  'D',
  'Per-kind delete route. The chat deletes through the generic element.delete verb on the current selection ("delete selected") and element.deleteBatch on a resolved scope ("delete all furniture in the kitchen") — both kind-agnostic, both landing on the same DeleteElementCommand. A second chat path per kind would be two sources of truth for one ask.',
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
  // ⛔⭐ REMOVED 2026-09-02 (lane 4H) — THIS ROW WAS A CONFIDENT FICTION.
  //
  //     ...family('D', 'Bare-verb alias registration of the .create form.', ['floor', 'pool']),
  //
  // There is no bare-verb alias. `plugins/floor/src/handlers/CreateFloor.ts` declares
  // `readonly type = 'floor.create'` and, further down, builds its record with
  // `type: 'floor'` — `FloorData`'s DISCRIMINATOR FIELD. `CreatePool.ts` is the same
  // shape (`'pool.create'`, then `type: 'pool'` inside `_recordOf`). The coverage
  // gate's `HANDLER_TYPE_RE` matched the record literal, invented two verbs, and the
  // ratchet then demanded that somebody declare them — so somebody wrote a plausible
  // sentence for commands that have never existed.
  //
  // ⭐ THAT IS [[confident-register-rows-are-the-wrong-ones]] EXACTLY: an honest
  // blank would have been safe; the prose-justified verdict was wrong. The gate now
  // excludes element-kind discriminators
  // (§FIX-ELEMENT-KIND-DISCRIMINATOR-IS-NOT-A-VERB) and names them on stdout, and its
  // own stale-entry check is what caught this row — it printed
  //   "floor" is classified but not a registered bus command — stale entry.
  // ⛔ If that message ever returns, the answer is to delete the row, never to
  // re-add a verb to satisfy it.
  ...family('D', 'Legacy alias of grid.create registered in initBusHandlers.', ['grid.add']),
];

// ─── E — unsafe without a bigger confirmation model ──────────────────────────
//
// ── RAC U9.2: WHAT GRADUATED, AND WHY THESE THREE DID NOT ───────────────────
//
// E's stated blocker is "the inline Confirm/Cancel card shows no preview of
// what will appear". Read carefully, that is an argument about GENERATION, and
// U9.2 is the moment it stopped covering everything destructive. Deletion is
// the opposite shape: everything it touches ALREADY EXISTS and has already been
// counted, so the card can state the exact truth before anything happens —
// "This deletes 42 furniture items on Level 1." Scoped deletion therefore
// shipped as four capabilities (DeleteFamilies.ts) rather than sitting here,
// with the count made real by `requireResolvedIds` (the unbounded 'all' payload
// form is forbidden on a destructive spec), an empty scope refusing, and ONE
// undo entry via element.deleteBatch.
//
// The three below did NOT graduate, and the reason is unchanged and still true:
// they CREATE. "Create a curtain wall on every slab" produces geometry whose
// size, count and placement the user cannot see until it exists, so a card
// saying "this creates 37 curtain walls" is a number without a shape. The
// missing piece is still preview-before-execute — genuinely missing, not merely
// unbuilt confidence.
const E_BULK = family(
  'E',
  'Project-wide generation in one verb (every slab / every floor). Reversible, but the blast radius is the whole model and the inline Confirm/Cancel card shows no preview of what will appear — needs preview-before-execute, which ADR-0313 explicitly defers.',
  ['curtain-wall.create-on-all-slabs', 'slab.create-on-all-floors', 'wall.create-on-all-slabs'],
  { blockedBy: 'preview-before-execute (deliberately out of scope in ADR-0313)' },
);

// C80 GEN-GAP-1 (2026-08-12) — `room.regenerate`, the first generation-family
// bus verb. It is classified E rather than shipped as a capability because the
// verb ITSELF refuses today, and the honesty rule cuts both ways: a capability
// declaring "I regenerate rooms" over a handler that returns a refusal would be
// the §2.2 ElementCapabilities lie in a new costume — a confident "Done" over a
// mutation that never happened.
//
// The blocker is NOT confidence or copy. It is that no element in this model
// carries provenance (C80 §0.1(2): generationId / generatedBy / isGenerated →
// 0 first-party element hits), so the authority question — may this pass
// overwrite this element? — answers `unknown-authority` for every room, and
// C80 §2.3 forbids reading that as permission. It was MEASURED destroying a
// hand-drawn room on 2026-08-12 (`check-authored-state-protection` clause (b):
// seeded=2 · remaining=0 · the authored room survived=false).
//
// This graduates to a capability when C80 GEN-GAP-2 lands element-grain
// provenance and the verb returns a ConsequencePlan instead of a blanket
// refusal — at which point the confirmation card can state the exact truth
// ("this replaces 12 rooms and protects 3 you drew"), which is the same bar
// E_BULK above is waiting on and for the same reason.
const E_REGENERATE = family(
  'E',
  'Regeneration replaces elements a user may have drawn, and no element in this model records where it came from — so the pass cannot tell a hand-drawn room from a generated one, and the confirmation card could not state what would be lost. The verb itself refuses for exactly this reason (C80 §2.3: unknown-authority is not permission; measured destroying an authored room on 2026-08-12). Declaring it reachable would claim a capability the handler withholds.',
  ['room.regenerate'],
  {
    blockedBy:
      'element-grain provenance (C80 GEN-GAP-2 / roadmap Phase 8) — until then the authority question answers unknown-authority for every room',
    potentialCapability: 'regenerate-rooms',
  },
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
  ...E_REGENERATE,
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
