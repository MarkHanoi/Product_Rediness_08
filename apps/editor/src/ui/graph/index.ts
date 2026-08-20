// apps/editor — GRAPH.3 public surface: install the living-blob Building-Graph
// overlay + expose the `window.pryzmShowBuildingGraph()` console/UI hook.
//
// L5, READ-ONLY over the UBG. Call `installBuildingGraphOverlay()` once at boot
// (alongside `installBuildBuildingGraph()`); it mounts the overlay lazily (DOM is
// only created on first show) and registers the toggle hooks. P2-safe (no THREE),
// P3-safe (no rAF — see BuildingGraphOverlay.startTicker).

import { BuildingGraphOverlay } from './BuildingGraphOverlay';
// §GIS-ACTION-REGISTRY (L-1360) — the launcher-rail import is gone with the pill
// it positioned. This module now installs the window hook ONLY; the visible
// control is the GIS panel's registry action.

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

  // §GIS-ACTION-REGISTRY (L-1360, C06 §13.7) — the floating "Graph" pill is GONE.
  //
  // Founder 2026-08-20: "EXCLUDE THE BUTTONS FROM THE MAIN SCENE". The bottom-left
  // stack was rendering on top of the consolidated GIS panel, so the same action
  // appeared twice with one copy obscuring the other. Verdict (a) — the surviving
  // control is the `graph.building` action in `ui/gis/gisActionRegistry.ts`, which the GIS
  // panel renders and which dispatches THIS SAME `window.pryzmShowBuildingGraph` hook.
  //
  // The hook below is the load-bearing half and it stays: `gisActionRegistry.test.ts`
  // scans production source and fails the build if an entry point the registry
  // declares is no longer registered anywhere. Removing the pill is safe; removing
  // this registration is not, and is now caught.
}
