/**
 * §ANN — CreateManyAnnotationsCommand — RE-EXPORT SHIM.
 *
 * Mirrors the sibling `CreateAnnotationCommand.ts` shim exactly: the class lives in
 * `plugins/annotations` (§FIX-AUTODIM-SUBSYSTEM-STORE-SINK, L-145 / ADR-0119) and is
 * surfaced here so consumers that already depend on `@pryzm/command-registry` can
 * reach the COMPOSITE without taking a second dependency on the plugin.
 *
 * Added for §ROOMTAG-ONE-COMMAND (L-1396): `RoomTagAutoPopulator` dispatched one
 * `CreateAnnotationCommand` PER ROOM — 24 commands and 24 undo entries per level for a
 * single automatic tag pass — while the composite that fixes precisely that had existed
 * since L-145 with one consumer. The shim is what lets rooms be its second.
 */

export { CreateManyAnnotationsCommand } from '@pryzm/plugin-annotations';
