// apps/editor — A.21.D17 Living Building Graph public surface.
//
// Installs the force-directed, physics-animated Living Building Graph overlay +
// exposes the console openers `window.pryzmOpenLivingGraph()` /
// `pryzmCloseLivingGraph()`. Call `installLivingGraphOverlay()` once at boot
// (alongside `installBuildingGraphOverlay()`); the overlay's DOM is built lazily
// on first show, so this is cheap on white-UI / headless paths. P2-safe (no
// THREE), P3-safe (no rAF — the sim ticks off the frame bus / a guarded
// setInterval; see LivingGraphOverlay.ensureTicking).
//
// This is intended to SUPERSEDE the static `⚛ Graph` view as the primary graph
// UI — see the report / SPEC for the exact button-wiring reconciliation step.

import { LivingGraphOverlay } from './LivingGraphOverlay';
// §GIS-ACTION-REGISTRY (L-1360) — the launcher-rail import is gone with the pill
// it positioned. This module now installs the window hook ONLY; the visible
// control is the GIS panel's registry action.

export { LivingGraphOverlay } from './LivingGraphOverlay';
export { LivingGraphCanvas } from './LivingGraphCanvas';
export { buildLiveGraph, inferRoomType } from './livingGraphData';
export {
  simulateStep,
  scatterNodes,
  totalEnergy,
  createSimState,
  isSettled,
  reheat,
  nodeDistance,
  scaledParams,
  fitToCanvas,
  DEFAULT_SIM_PARAMS,
} from './forceSimulation';
export type { SimState, SimParams, FitTransform } from './forceSimulation';
export {
  EDGE_LAYERS,
  defaultLayerState,
  ROOM_TYPE_COLOUR,
  EDGE_LAYER_COLOUR,
  // §49 FIVE-GRAPH MODEL (ADR-0068) — the named-graph dropdown surface.
  GRAPH_VIEWS,
  GRAPH_VIEW_LABEL,
  GRAPH_VIEW_LAYER,
  GRAPH_VIEW_READY,
  GRAPH_VIEW_HINT,
  DEFAULT_GRAPH_VIEW,
  layerStateForView,
} from './livingGraphSchema';
export type {
  EdgeLayer,
  GraphView,
  GraphNode,
  GraphEdge,
  LayerState,
  LiveGraph,
  RoomKind,
} from './livingGraphSchema';
export { separationWeight } from './livingGraphData';

interface LivingGraphWindow {
  /** A.21.D17 — open (show) the Living Building Graph overlay. */
  pryzmOpenLivingGraph?: (show?: boolean) => void;
  /** A.21.D17 — close (hide) the overlay. */
  pryzmCloseLivingGraph?: () => void;
  /** The mounted overlay singleton (tests / power-users). */
  __pryzmLivingGraph?: LivingGraphOverlay;
}

let _overlay: LivingGraphOverlay | null = null;

/** The lazily-constructed overlay singleton. */
export function getLivingGraphOverlay(): LivingGraphOverlay {
  if (!_overlay) _overlay = new LivingGraphOverlay();
  return _overlay;
}

/**
 * Install the A.21.D17 overlay hooks on `window`. Idempotent. Adds the console
 * openers + a small, uncontested launcher button (lower-left, OFFSET above the
 * static `⚛ Graph` launcher so the two don't collide while the founder
 * reconciles which becomes primary).
 */
export function installLivingGraphOverlay(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as LivingGraphWindow;
  const overlay = getLivingGraphOverlay();
  w.__pryzmLivingGraph = overlay;
  w.pryzmOpenLivingGraph = (show?: boolean) => overlay.toggle(show ?? true);
  w.pryzmCloseLivingGraph = () => overlay.hide();

  // §GIS-ACTION-REGISTRY (L-1360, C06 §13.7) — the floating "Living Graph" pill is GONE.
  //
  // Founder 2026-08-20: "EXCLUDE THE BUTTONS FROM THE MAIN SCENE". The bottom-left
  // stack was rendering on top of the consolidated GIS panel, so the same action
  // appeared twice with one copy obscuring the other. Verdict (a) — the surviving
  // control is the `graph.living` action in `ui/gis/gisActionRegistry.ts`, which the GIS
  // panel renders and which dispatches THIS SAME `window.pryzmOpenLivingGraph` hook.
  //
  // The hook below is the load-bearing half and it stays: `gisActionRegistry.test.ts`
  // scans production source and fails the build if an entry point the registry
  // declares is no longer registered anywhere. Removing the pill is safe; removing
  // this registration is not, and is now caught.
}
