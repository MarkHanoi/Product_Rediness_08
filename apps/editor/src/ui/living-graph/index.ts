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
  DEFAULT_SIM_PARAMS,
} from './forceSimulation';
export type { SimState, SimParams } from './forceSimulation';
export {
  EDGE_LAYERS,
  defaultLayerState,
  ROOM_TYPE_COLOUR,
  EDGE_LAYER_COLOUR,
} from './livingGraphSchema';
export type {
  EdgeLayer,
  GraphNode,
  GraphEdge,
  LayerState,
  LiveGraph,
  RoomKind,
} from './livingGraphSchema';

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

  if (typeof document !== 'undefined' && !document.getElementById('pryzm-living-graph-launcher')) {
    const btn = document.createElement('button');
    btn.id = 'pryzm-living-graph-launcher';
    btn.type = 'button';
    btn.title = 'Living Graph — force-directed live space-relationship view';
    btn.textContent = '✦ Living Graph';
    Object.assign(btn.style, {
      position: 'fixed',
      left: '12px',
      bottom: '104px', // sits ABOVE the static '⚛ Graph' launcher (bottom:64px)
      zIndex: '28',
      padding: '6px 12px',
      borderRadius: '10px',
      background: '#ffffff',
      color: '#6600ff',
      border: '1px solid rgba(102,0,255,0.25)',
      font: '600 12px system-ui, sans-serif',
      cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(40,10,90,0.16)',
    });
    btn.addEventListener('click', () => overlay.toggle());
    document.body.appendChild(btn);
  }
}
