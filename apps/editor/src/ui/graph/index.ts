// apps/editor — GRAPH.3 public surface: install the living-blob Building-Graph
// overlay + expose the `window.pryzmShowBuildingGraph()` console/UI hook.
//
// L5, READ-ONLY over the UBG. Call `installBuildingGraphOverlay()` once at boot
// (alongside `installBuildBuildingGraph()`); it mounts the overlay lazily (DOM is
// only created on first show) and registers the toggle hooks. P2-safe (no THREE),
// P3-safe (no rAF — see BuildingGraphOverlay.startTicker).

import { BuildingGraphOverlay } from './BuildingGraphOverlay';

export { BuildingGraphOverlay } from './BuildingGraphOverlay';
export {
  buildLayout,
  stepForces,
  colourForKind,
  colourForEdge,
  HERO_PURPLE,
  DEFAULT_FORCES,
} from './graphLayout';
export type { GraphLayout, LaidOutNode, LaidOutEdge, ForceParams } from './graphLayout';

interface GraphOverlayWindow {
  /** GRAPH.3 — show/hide the living Building-Graph overlay. With no argument it
   *  toggles; pass `true`/`false` to force. Read-only over the UBG. */
  pryzmShowBuildingGraph?: (show?: boolean) => void;
  /** GRAPH.3 — hide the overlay. */
  pryzmHideBuildingGraph?: () => void;
  /** The mounted overlay singleton (for tests / power-users). */
  __pryzmGraphOverlay?: BuildingGraphOverlay;
}

let _overlay: BuildingGraphOverlay | null = null;

/** The lazily-constructed overlay singleton. */
export function getBuildingGraphOverlay(): BuildingGraphOverlay {
  if (!_overlay) _overlay = new BuildingGraphOverlay();
  return _overlay;
}

/**
 * Install the GRAPH.3 overlay hooks on `window`. Idempotent. The overlay's DOM
 * is built lazily on first `show()`, so this is cheap to call at boot even on
 * the white-UI / headless paths. Safe to call once from `installPryzmTestFunctions`.
 */
export function installBuildingGraphOverlay(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as GraphOverlayWindow;
  const overlay = getBuildingGraphOverlay();
  w.__pryzmGraphOverlay = overlay;
  w.pryzmShowBuildingGraph = (show?: boolean) => overlay.toggle(show);
  w.pryzmHideBuildingGraph = () => overlay.hide();
}
