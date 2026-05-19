// @pryzm/editor/toolbar — public surface for the lazy ToolRegistry
// (S09-T5).
//
// The chrome (HTML buttons, keyboard shortcuts) is intentionally NOT
// in this package — vanilla-TS registry only.  See
// `apps/editor/src/toolbar/wall-icon.svg` for the bundled wall icon
// asset (consumed via `?url` import by whatever HTML harness lights
// up the toolbar).

export {
  ToolRegistry,
  type ToolEntry,
  type ToolFactory,
  type ToolHandle,
  type ToolMeta,
} from './ToolRegistry.js';
