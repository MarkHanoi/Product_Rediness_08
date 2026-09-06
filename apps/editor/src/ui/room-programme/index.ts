/**
 * room-programme — STR §8/§9/§10/§25.5: the residential room library, drag-and-drop,
 * and the relationship graph AS THE INPUT to a spatial-envelope layout.
 *
 * ⛔ ENVELOPES ONLY. Nothing in this directory creates a wall, a slab, a floor or a
 * door. The one command it dispatches is `spaceEnvelope.batch.create` (C114 §6a).
 *
 * ⚠ NO MODULE-SCOPE SIDE EFFECT AND NO STORE READ AT IMPORT TIME — this barrel is a
 * re-export list only. [[scc-no-barrel-access-at-module-load]] is the memory: a barrel
 * that touches state at load turns a circular import into `undefined` and a white
 * screen, and the panel is imported from the left-rail hub, which is early.
 */

export {
  RESIDENTIAL_ROOM_KINDS,
  RESIDENTIAL_ROOM_LIBRARY,
  defaultResidentialGroundFloorTemplate,
  isResidentialRoomKind,
  libraryColourFor,
  occupancyTagFor,
  residentialRoomEntry,
  type ResidentialRoomKind,
  type ResidentialRoomLibraryEntry,
  type RoomOccupancyMapping,
  type TargetAreaSource,
} from './residentialRoomLibrary';

export {
  EMPTY_ROOM_PROGRAMME,
  applyRoomProgrammeIntent,
  clearRoomProgramme,
  defaultResidentialProgramme,
  getRoomProgramme,
  linkKey,
  nextRoomName,
  programmeDegrees,
  programmeTotalTargetAreaM2,
  reduceRoomProgramme,
  subscribeRoomProgramme,
  toProgrammeRoomSpecs,
  type RoomProgramme,
  type RoomProgrammeEntry,
  type RoomProgrammeIntent,
  type RoomProgrammeLink,
} from './roomProgrammeModel';

export {
  DOOR_CLEAR_WIDTH_M,
  RESIDUAL_FLOOR_M2,
  measureAdjacency,
  seriateByGraph,
  solveProgrammeLayout,
  type AdjacencyVerdict,
  type ProgrammeLayout,
  type ProgrammeLayoutInput,
  type ProgrammeLayoutRefusal,
  type ProgrammeLayoutRefusalCode,
  type ProgrammeLayoutResult,
  type RoomEnvelopeCell,
} from './programmeToEnvelopes';

export {
  buildRoomEnvelopePlan,
  describeReplacement,
  pickHostLevelEnvelope,
  pickLevelEnvelope,
  roomEnvelopesWithin,
  type HostLevelEnvelope,
  type LevelEnvelopePick,
  type RoomEnvelopePlan,
  type RoomEnvelopePlanRefusal,
  type RoomEnvelopePlanResult,
  type RoomEnvelopeSpec,
  type SpaceEnvelopeRecordLike,
} from './roomEnvelopePlan';

export {
  describeProjectRoomsImport,
  programmeFromProjectRooms,
  residentialKindForRoom,
  type ProjectRoomLike,
  type ProjectRoomsImport,
} from './projectRoomsToProgramme';

export {
  ROOM_DRAG_MIME,
  ROOM_DRAG_PREFIX,
  ROOM_PROGRAMME_CHIP_ATTR,
  ROOM_PROGRAMME_EDGE_ATTR,
  ROOM_PROGRAMME_GRAPH_TESTID,
  ROOM_PROGRAMME_LEGEND_TESTID,
  ROOM_PROGRAMME_LIBRARY_TESTID,
  ROOM_PROGRAMME_LIST_TESTID,
  ROOM_PROGRAMME_LOAD_BTN_TESTID,
  ROOM_PROGRAMME_NODE_ATTR,
  ROOM_PROGRAMME_NOTE,
  ROOM_PROGRAMME_PLACE_BTN_TESTID,
  ROOM_PROGRAMME_PREVIEW_TESTID,
  ROOM_PROGRAMME_REPORT_TESTID,
  ROOM_PROGRAMME_ROOT_TESTID,
  ROOM_PROGRAMME_SEED_BTN_TESTID,
  ROOM_PROGRAMME_STATUS_TESTID,
  defaultRoomProgrammePanelDeps,
  mountRoomProgrammePanel,
  type RoomProgrammePanelDeps,
  type RoomProgrammePanelHandle,
} from './roomProgrammePanel';
