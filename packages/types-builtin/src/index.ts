// @pryzm/types-builtin — root barrel.

export {
  BUILTIN_DOOR_TYPES,
  DEFAULT_DOOR_TYPE_ID,
  getDoorType,
  type DoorType,
  type DoorSwing,
} from './door/index.js';
export {
  BUILTIN_WINDOW_TYPES,
  DEFAULT_WINDOW_TYPE_ID,
  getWindowType,
  type WindowType,
  type WindowGridSpec,
} from './window/index.js';
export {
  BUILTIN_ROOF_TYPES,
  DEFAULT_ROOF_TYPE_ID,
  getRoofType,
  type RoofType,
  type RoofShape,
} from './roof/index.js';
export {
  BUILTIN_CURTAIN_WALL_TYPES,
  BUILTIN_CW_PANEL_TYPES,
  BUILTIN_CW_MULLION_TYPES,
  DEFAULT_CURTAIN_WALL_TYPE_ID,
  DEFAULT_CW_PANEL_TYPE_ID,
  DEFAULT_CW_MULLION_TYPE_ID,
  getCurtainWallType,
  getCurtainWallPanelType,
  getCurtainWallMullionType,
  type CurtainWallSystemType,
  type CurtainWallPanelType,
  type CurtainWallMullionType,
  type CurtainWallFamily,
  type CurtainPanelKind,
} from './curtain-wall/index.js';
export {
  BUILTIN_STAIR_TYPES,
  DEFAULT_STAIR_TYPE_ID,
  getStairType,
  type StairType,
  type StairFamily,
} from './stair/index.js';
export {
  BUILTIN_HANDRAIL_TYPES,
  DEFAULT_HANDRAIL_TYPE_ID,
  getHandrailType,
  type HandrailType,
  type HandrailFamily,
} from './handrail/index.js';
export {
  BUILTIN_CEILING_TYPES,
  DEFAULT_CEILING_TYPE_ID,
  getCeilingType,
  type CeilingType,
  type CeilingFamily,
} from './ceiling/index.js';
