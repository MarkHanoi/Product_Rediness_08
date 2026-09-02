// @pryzm/plugin-component — public surface. §COMPONENT-PLACE (audit §12 Phase 4C)
// · ADR-0376 D9 · C110 · C111 · C112 · C84 §6.2.
//
// ⭐⭐ THE JOIN. The universal-component-editor audit's headline gap, in its own
// words (§3.1): **there is no bus verb anywhere in this repository that places a
// component into a project.** `@pryzm/file-format` authors, packs, signs, migrates
// and unpacks `.pryzm-family` documents; `@pryzm/family-runtime` resolves their
// parameters and evaluates their expressions; and nothing could put the result in a
// model. This plugin is the command surface that closes it.
//
// ⛔ IT MINTS NO RIVAL — the audit's standing review rule R1. There is no new
// component-definition schema here (that is C111 / `family-schema.ts`), no new
// expression engine (that is `@pryzm/family-runtime`), no new sketch surface, no new
// refusal vocabulary and no new AI tool schema. What is new is the OCCURRENCE — the
// one thing that genuinely did not exist — expressed as an ELEMENT, per D9, so the
// World Model keeps ONE answer to "what is in this project".
//
// ⛔ AND IT IS NOT `plugins/family-editor`. That package is a marketplace manifest
// stub (27 lines, one `console.info` in `activate()`, no store, no handler, not in
// `ALL_PLUGINS`) whose own docstring says it *"registers … the Place Family tool"*
// — a claim measured false at this commit. Extending a stub that registers nothing
// would put this family's authority inside a package named for the vocabulary D5
// froze as legacy.

export {
  ComponentStore,
  type ComponentData,
  type ComponentId,
  type ComponentsState,
} from './store.js';

export {
  ComponentSystemError,
  ComponentNotFoundError,
  ComponentDefinitionRefError,
  ComponentTypeRefError,
  ComponentParameterWriteError,
  isComponentSystemError,
} from './errors.js';

export {
  COMPONENT_HANDLER_TYPES,
  buildComponentHandlerSet,
  registerComponentHandlers,
  PlaceComponentHandler,
  type PlaceComponentPayload,
  SwapComponentTypeHandler,
  type SwapComponentTypePayload,
  SetComponentInstanceParameterHandler,
  type SetComponentInstanceParameterPayload,
  type ComponentHandlerType,
} from './handlers/index.js';
