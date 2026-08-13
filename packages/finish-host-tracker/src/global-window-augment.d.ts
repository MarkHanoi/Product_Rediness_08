/**
 * Ambient Window augmentation for cross-package source typechecking.
 *
 * This package's tsconfig typechecks the SOURCE of its dependencies (Bundler
 * resolution over `main: src/index.ts` workspaces). Several of those sources
 * (`@pryzm/spatial-index`, `@pryzm/room-topology`, reached via
 * `@pryzm/geometry-slab` → `@pryzm/command-registry`) read `window.*` globals
 * that are declared in THEIR OWN packages' ambient files — files that are not
 * part of this program. Same house pattern as
 * `command-registry/src/global-window-augment.d.ts`, trimmed to what this
 * package's import graph actually touches.
 *
 * `wallStore` is also the one global THIS package's resolver path reads
 * (WallFaceResolver.ts:37, TODO(TASK-08)).
 */
interface Window {
    wallStore?: any;
    slabStore?: any;
    columnStore?: any;
    floorStore?: any;
    ceilingStore?: any;
    commandManager?: any;
    roomStore?: any;
    roomQueryService?: any;
    roomGraphService?: any;
    roomSystemTypeStore?: any;
    roomTypeInferenceEngine?: any;
    roomValidationService?: any;
}
