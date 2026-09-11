/**
 * roomProgrammePanel — the ROOM PROGRAMME surface: a library you drag from, a graph you
 * plug and unplug, a plan that re-solves as you do it, and one button that turns the
 * result into room ENVELOPES in the 3-D scene.
 *
 * Layer Affected:  UI — room programme (L7)
 * File:            apps/editor/src/ui/room-programme/roomProgrammePanel.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §8 · §9 · §10 · §25.5
 * Plan:            RESI-ORCHESTRATOR-PLAN §4 Stage F + Stage G
 * Contracts:       C114 (the space-envelope family) · C08 §3.1 (no HTML sink — every
 *                  string reaches the DOM through `textContent`) · C19 §5.6 (a panel
 *                  HOSTS producers; it computes nothing twice) · C83 §1.2 (a refusal is
 *                  the product, and it carries its numbers)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE CHAIN THIS FILE CLOSES, LINK BY LINK
 * ─────────────────────────────────────────────────────────────────────────────
 *   library chip  ──drag/click──▶  `applyRoomProgrammeIntent`  (session brief)
 *   graph node ──drag onto node──▶ `programme.link` / click an edge ▶ `programme.unlink`
 *                                        │
 *                                        ▼  (every change, synchronously)
 *                            `solveProgrammeLayout`  ── the graph IS the input
 *                                        │
 *                        ┌───────────────┴───────────────┐
 *                        ▼                               ▼
 *                 plan preview + legend          adjacency report
 *                        │
 *                        ▼  "Place envelopes in 3D" (an explicit act — §20)
 *          `spaceEnvelope.batch.create`  ──▶  `runtime.stores.spaceEnvelope`
 *                        │
 *                        ▼  (already wired, `initTools.ts` §FEAT-SPACE-ENVELOPE)
 *          `attachSpaceEnvelopeRender` ▶ prism drawn, coloured by OCCUPANCY,
 *          faces draggable, double-click ▶ the shipped profile editor
 *
 * The last two links were built and shipped by C114/§RESI-STAGE-G. What did not exist
 * was any production caller that creates a `role: 'room'` envelope — repo-wide, every
 * such occurrence was in a test file, and the one production dispatcher
 * (`adoptProposalAsEnvelope`) hard-codes `role: 'level'`. This panel is that caller.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ ENVELOPES ONLY. STR §25.5: *"not yet walls, floor, slabs etc… just spaces —
 * envelopes"*, and *"until this is sound we would not generate walls, doors etc…"*.
 * This file dispatches exactly one verb, `spaceEnvelope.batch.create`. It does not
 * import, reference or reach the wall, slab, door or room-detection paths, and the
 * spec asserts that by reading this source.
 *
 * ⭐ P6: the ONLY mutation of a domain store here is through `bus.executeCommand`. The
 * programme itself is a SESSION BRIEF, not a domain store — see `roomProgrammeModel.ts`
 * for that argument in full.
 *
 * ⚠ P4: no `(window as any)`. The host capabilities are read through typed structural
 * interfaces, and the runtime is resolved at MOUNT time, never at module load
 * (§L-545), and never from the prop alone (§L-12916: `runtime` is null by design on the
 * live boot path, which is exactly how the envelope card came to print "unavailable" on
 * every live session).
 */

import { createId, type ElementType } from '@pryzm/schemas';
// ⭐ REUSE, and the SHALLOWEST import that gets it. `forceLayout` (the 2-D wrapper) lives
// in `nodeLinkSvg.ts`, which pulls `AnalysisTypes`, `seriesFocus` and `hopEmphasis` in with
// it — three modules the left rail has no other reason to load. `layoutND` is the actual
// solver those all delegate to (§GRAPH-3D-ONE-LAYOUT, L-8430: *"it now delegates to the
// dimension-generic tree"*) and imports NOTHING. Same computation, one file.
import { layoutND } from '../analysis/forceLayoutND';
import { resolveActiveLevelId } from '../apartment-layout/activeLevel';
import {
  RESIDENTIAL_ROOM_LIBRARY,
  isResidentialRoomKind,
  libraryColourFor,
  residentialRoomEntry,
  type ResidentialRoomKind,
} from './residentialRoomLibrary';
import {
  applyRoomProgrammeIntent,
  defaultResidentialProgramme,
  describePairResize,
  getRoomProgramme,
  peekRoomProgrammeRedo,
  peekRoomProgrammeUndo,
  redoRoomProgramme,
  subscribeRoomProgramme,
  undoRoomProgramme,
  type RoomProgramme,
} from './roomProgrammeModel';
import {
  programmeSharedWalls,
  solveProgrammeLayout,
  type ProgrammeLayout,
  type ProgrammeLayoutResult,
  type ProgrammeRoomSeam,
} from './programmeToEnvelopes';
import {
  describeDrawnRoom,
  type DrawnRoomVerdict,
} from './roomDrawPlan';
import type { EnvelopePoint } from '@pryzm/geometry-space-envelope';
import {
  buildRoomEnvelopePlan,
  describeReplacement,
  roomEnvelopesWithin,
  type SpaceEnvelopeRecordLike,
} from './roomEnvelopePlan';
// §ROOM-PROGRAMME-TARGET (founder 2026-09-11 · `C115-181`) — the building/storey selectors' ONE rule,
// wrapping `pickHostLevelEnvelope` so `render()` and `place()` cannot resolve against two storeys.
import {
  PROGRAMME_TARGET_DEFAULT,
  listProgrammeBuildings,
  pickProgrammeHost,
  reconcileProgrammeTarget,
  type ProgrammeBuildingOption,
  type ProgrammeTarget,
} from './roomProgrammeTarget';
// §PROJECT-ROOMS-ARE-THE-PROGRAMME (L-13024) — the read this panel did not have.
import {
  describeProjectRoomsImport,
  programmeFromProjectRooms,
  type ProjectRoomLike,
} from './projectRoomsToProgramme';

// ─────────────────────────────────────────────────────────────────────────────
// TEST IDS — the spec addresses the panel through these, never through classes
// ─────────────────────────────────────────────────────────────────────────────

export const ROOM_PROGRAMME_ROOT_TESTID = 'room-programme';
export const ROOM_PROGRAMME_LIBRARY_TESTID = 'room-programme-library';
export const ROOM_PROGRAMME_CHIP_ATTR = 'data-room-kind';
export const ROOM_PROGRAMME_GRAPH_TESTID = 'room-programme-graph';
/**
 * §STAGE-05-SECTION (C115 §8.1 `C115-173`, L-13237) — which HEIGHT ARM the graph canvas is on:
 * `compact` (no rooms declared — a drop rail) or `full` (the 300 × 190 layout box).
 *
 * ⭐ STAMPED SO THE TWO STATES ARE DISTINGUISHABLE WITHOUT A LAYOUT ENGINE. happy-dom has none,
 * so a spec cannot measure the rendered height; without this attribute *"the empty graph got
 * smaller"* would be unfalsifiable, and a later edit could quietly restore the full canvas with
 * every spec still green ([[committed-is-not-reachable]]).
 */
export const ROOM_PROGRAMME_GRAPH_EMPTY_ATTR = 'data-graph-arm';
export const ROOM_PROGRAMME_LIST_TESTID = 'room-programme-list';
/**
 * §STAGE-05-SECTION (C115 §8.1 `C115-172`, L-13237) — the programme HEADLINE, addressably.
 *
 * ⭐ `C115-73` requires this stage to open with a **Programme summary** (rooms · area ·
 * relationships) and the panel has never had one: it opens with the room library. The summary the
 * contract asks for is now the question-4 digest — and a digest is a MIRROR, so it needs a stable
 * selector to mirror THROUGH. This is that selector; the text under it is the same line
 * `renderList` already printed, so nothing is counted twice (C19 §5.6 clause 1).
 *
 * ⛔ IT IS NOT A SECOND RENDERING. Adding a summary BLOCK above the library would have grown the
 * surface the founder asked to shrink, and would have been a second place for the room count to
 * be wrong. The digest costs no body height at all and is visible whether the group is open or
 * closed.
 */
export const ROOM_PROGRAMME_SUMMARY_TESTID = 'room-programme-summary';
/**
 * The standing of the programme, on the summary node, for the digest to mirror as its
 * CONFIDENCE (C58 §1.2). ⚠ `C115-77` — the programme is SESSION-ONLY while the room envelopes it
 * places persist, and putting it on the ladder presents it as project state. The asymmetry is
 * stated here rather than left for the reader to discover on the next reload.
 */
export const ROOM_PROGRAMME_SUMMARY_STATE_ATTR = 'data-state';
export const ROOM_PROGRAMME_PREVIEW_TESTID = 'room-programme-preview';
export const ROOM_PROGRAMME_LEGEND_TESTID = 'room-programme-legend';
export const ROOM_PROGRAMME_REPORT_TESTID = 'room-programme-report';
export const ROOM_PROGRAMME_PLACE_BTN_TESTID = 'room-programme-place';
export const ROOM_PROGRAMME_STATUS_TESTID = 'room-programme-status';
export const ROOM_PROGRAMME_SEED_BTN_TESTID = 'room-programme-seed';
/**
 * §ROOM-BRIEF-UNDO (L-13120) — the two controls that take a brief gesture back.
 *
 * ⭐ THEY EXIST BECAUSE A KEYSTROKE IS NOT A CONTROL. Ctrl+Z is bound below and is what a user
 * reaches for first, but it is invisible, it is unavailable to a user who cannot hold two keys,
 * and — the reason that decides it — the keyboard has to DEFER when a newer bus command is the
 * thing chronology says to undo. A button that names its subject never has to defer, because
 * pressing it is the user saying which stack he meant.
 */
export const ROOM_PROGRAMME_UNDO_TESTID = 'room-programme-undo';
export const ROOM_PROGRAMME_REDO_TESTID = 'room-programme-redo';
/** §PROJECT-ROOMS-ARE-THE-PROGRAMME (L-13024) — "load / re-read the project's rooms". */
export const ROOM_PROGRAMME_LOAD_BTN_TESTID = 'room-programme-load-project';
export const ROOM_PROGRAMME_NODE_ATTR = 'data-room-node';
export const ROOM_PROGRAMME_EDGE_ATTR = 'data-room-edge';
/**
 * §ROOM-PROGRAMME-TARGET (founder 2026-09-11 · Site-panel Section 4 · `C115-181`) — the building and
 * storey selectors. They NARROW what the one picker sees (`roomProgrammeTarget.ts`); they never pick.
 */
export const ROOM_PROGRAMME_TARGET_TESTID = 'room-programme-target';
export const ROOM_PROGRAMME_BUILDING_SELECT_TESTID = 'room-programme-building-select';
export const ROOM_PROGRAMME_LEVEL_SELECT_TESTID = 'room-programme-level-select';
/** §GRAPH-CLICK-TO-PLUG (`C115-74` behaviour 3, amended 2026-09-11) — the room awaiting its partner. */
export const ROOM_PROGRAMME_NODE_SELECTED_ATTR = 'data-room-node-selected';

// ── §ROOM-PIN (L-13079) — THE PLAN STRIP'S OWN IDENTITY ──────────────────────
//
// ⛔ THESE COME FIRST, AND L-13079 SAYS SO BY NAME. Before this the preview's cells carried
// NOTHING addressable — a `<polygon>` and a `<title>` with prose in it — so nothing in the
// product could name the room a pointer was over. A gesture cannot be built on a shape whose
// identity has to be recovered by parsing a sentence, and a spec cannot check one either.

/** The room a plan cell stands for. Present on the cell group and on its polygon. */
export const ROOM_CELL_ID_ATTR = 'data-room-cell';
/** That cell's position in the solved order — the currency a pin is written in. */
export const ROOM_CELL_ORDER_ATTR = 'data-room-cell-order';
/** `"1"` iff the user has PINNED this room to its position. Absent means solver-placed. */
export const ROOM_CELL_PINNED_ATTR = 'data-room-cell-pinned';

// ── §ROOM-WALL-DRAG (L-13096) — THE PARTY WALL'S OWN IDENTITY ────────────────
//
// The same reasoning §ROOM-PIN records for the cells: a gesture cannot be built on a shape whose
// identity has to be recovered by parsing a sentence, and a spec cannot drive one either.

/** The room on the side the wall GROWS when it is dragged along its normal. */
export const ROOM_SEAM_A_ATTR = 'data-room-seam-a';
/** The room on the side it SHRINKS. */
export const ROOM_SEAM_B_ATTR = 'data-room-seam-b';
/** The shared wall's length in metres, as a string — what the transfer is measured against. */
export const ROOM_SEAM_LENGTH_ATTR = 'data-room-seam-length';
/**
 * The handle's outward XZ normal, `"x,z"` — the direction that GROWS room `a`.
 *
 * ⭐ IT IS PUBLISHED BECAUSE A CONTROL WHOSE DIRECTION CANNOT BE READ IS HALF-TESTED. Without it
 * a spec can only assert that *something* moved; with it, a spec computes the pixel travel for a
 * named transfer from the plate's own dimensions and checks the metres that come back — which is
 * what makes the pixel→metre chain a MEASURED claim rather than a self-consistent one.
 */
export const ROOM_SEAM_NORMAL_ATTR = 'data-room-seam-normal';

// ── §ROOM-DRAW-NEW (L-13120) — THE DRAWING SURFACE'S OWN IDENTITY ────────────
//
// The third instance of the same reasoning §ROOM-PIN records: a gesture cannot be built on a
// shape whose identity has to be recovered by parsing a sentence, and a spec cannot drive one.

/** The arm/disarm control for the draw gesture. Armed state is on `aria-pressed`. */
export const ROOM_DRAW_TOGGLE_TESTID = 'room-programme-draw-toggle';
/** The kind the next drawn rectangle becomes. A `<select>`, so it is reachable by keyboard. */
export const ROOM_DRAW_KIND_TESTID = 'room-programme-draw-kind';
/** Present on the rubber-band rectangle while a drawing is in flight. */
export const ROOM_DRAW_RECT_ATTR = 'data-room-draw-rect';
/** That rectangle's WORLD area in m², as a string — the number the gesture is really about. */
export const ROOM_DRAW_AREA_ATTR = 'data-room-draw-area';
/** The verdict code the live rectangle is currently carrying, or `"ok"`. */
export const ROOM_DRAW_VERDICT_ATTR = 'data-room-draw-verdict';

/** The drag payload. A prefixed `text/plain` mirrors `FurnitureCarousel`'s idiom. */
export const ROOM_DRAG_MIME = 'application/x-pryzm-room-kind';
export const ROOM_DRAG_PREFIX = 'pryzm-room:';

/**
 * §ROOM-DRAW-NEW (L-13120) — the smallest floor any room in the library has, m².
 *
 * ⭐ DERIVED FROM THE LIBRARY, NEVER TRANSCRIBED. It is the threshold below which NO rectangle of
 * any kind can be accepted, so it is what decides whether the draw arm is offered at all. Writing
 * the number here would make it a second copy of a fact the library owns — and one that goes
 * stale silently the first time a kind is added with a smaller minimum.
 */
const SMALLEST_ROOM_FLOOR_M2 = RESIDENTIAL_ROOM_LIBRARY.reduce(
  (m, e) => Math.min(m, e.minAreaM2), Infinity);

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The honesty lede. It states the gate before the user can trip over it. */
export const ROOM_PROGRAMME_NOTE =
  'Spaces only. This stage produces room ENVELOPES — coloured volumes with names and '
  + 'areas — and no walls, floors, slabs or doors. Drag rooms from the library, plug and '
  + 'unplug relationships on the graph, and the plan re-solves as you go: the graph is the '
  + 'input to the arrangement, not a picture of it.';

// ─────────────────────────────────────────────────────────────────────────────
// DEPENDENCIES — injectable, defaulting to production
// ─────────────────────────────────────────────────────────────────────────────

interface BusLike { executeCommand?: (type: string, payload: unknown) => unknown }
interface DirtyStoreLike { subscribeDirty?: (fn: () => void) => (() => void) | void }
/**
 * The host runtime, structurally. ⭐ EXPORTED, and a STRUCTURAL interface rather than
 * `PryzmRuntime`: the mount site (`ProjectBrowserPanel`) holds the composed handle, the
 * spec holds a two-field fake, and neither should have to satisfy the other's type. It
 * also keeps `apps/editor` from needing a type import out of `@pryzm/runtime-composer`.
 */
export interface RoomProgrammeHostRuntime {
  readonly bus?: BusLike;
  readonly stores?: Record<string, unknown>;
}
type RuntimeLike = RoomProgrammeHostRuntime;

export interface RoomProgrammePanelDeps {
  /** Resolve the LIVE runtime. Production: `runtime ?? window.runtime` (§L-12916). */
  readonly resolveRuntime: () => RuntimeLike | null;
  /** Every space-envelope record. Production: read off `runtime.stores.spaceEnvelope`. */
  readonly readSpaceEnvelopes: () => readonly SpaceEnvelopeRecordLike[];
  /** The active storey id, or null. Production: `resolveActiveLevelId()`. */
  readonly readActiveLevelId: () => string | null;
  /** Mint an element id. Production: `createId('spaceEnvelope')` — C16 CA-2, by the CALLER. */
  readonly mintId: (kind: string) => string;
  /**
   * §PROJECT-ROOMS-ARE-THE-PROGRAMME (L-13024) — every room the PROJECT holds.
   * Production: the legacy `window.roomStore.getAll()`.
   *
   * ⭐ THIS DEP IS THE WHOLE DEFECT. The panel used to read exactly one source — the
   * session brief, which starts empty — so a project holding a generated house rendered
   * `0 PLUGGED, 0 ROOMS` and offered an EXAMPLE. The data was there; nothing looked at
   * it. Returning `[]` is a legitimate answer (an empty project) and the panel says so
   * honestly; it is NOT a licence to invent a programme.
   */
  readonly readProjectRooms: () => readonly ProjectRoomLike[];
}

/**
 * Read the project's rooms defensively. The room store is the LEGACY `window.roomStore`
 * — `runtime.stores` has no `room` slot (every `runtime.stores.rooms` mention in this
 * app is a `TODO(E.18-R.S)` comment beside a `window.roomStore` read), so this follows
 * the same route every other room consumer in `apps/editor` already takes rather than
 * inventing a second one. Any shape it cannot read is `[]`, never a throw.
 */
function readProjectRoomsFrom(runtime: RuntimeLike | null): readonly ProjectRoomLike[] {
  type RoomStoreLike = { getAll?: () => unknown };
  const fromRuntime = runtime?.stores?.['room'] as RoomStoreLike | undefined;
  const w = (typeof window !== 'undefined' ? window : {}) as unknown as { roomStore?: RoomStoreLike };
  const store = (fromRuntime && typeof fromRuntime.getAll === 'function') ? fromRuntime : w.roomStore;
  if (!store || typeof store.getAll !== 'function') return [];
  let all: unknown;
  try { all = store.getAll(); } catch { return []; }
  if (Array.isArray(all)) return all as readonly ProjectRoomLike[];
  if (all instanceof Map) return [...all.values()] as readonly ProjectRoomLike[];
  return [];
}

/** Read the space-envelope store defensively: it may be a Map-backed Store or absent. */
function readEnvelopesFrom(runtime: RuntimeLike | null): readonly SpaceEnvelopeRecordLike[] {
  const slot = runtime?.stores?.['spaceEnvelope'] as
    | { getState?: () => unknown }
    | undefined;
  if (!slot || typeof slot.getState !== 'function') return [];
  let state: unknown;
  try { state = slot.getState(); } catch { return []; }
  if (state instanceof Map) return [...state.values()] as SpaceEnvelopeRecordLike[];
  if (state && typeof state === 'object') {
    return Object.values(state as Record<string, SpaceEnvelopeRecordLike>);
  }
  return [];
}

export function defaultRoomProgrammePanelDeps(
  runtimeProp?: RuntimeLike | null,
): RoomProgrammePanelDeps {
  const live = (): RuntimeLike | null => {
    const w = (typeof window !== 'undefined' ? window : {}) as unknown as { runtime?: RuntimeLike };
    // ⛔ NEVER THE NULL PROP ALONE — §L-12916. `createMainLayout(props, null)` is the live
    // boot path, so a read that trusts the prop prints "unavailable" on every real session.
    return runtimeProp ?? w.runtime ?? null;
  };
  return {
    resolveRuntime: live,
    readSpaceEnvelopes: () => readEnvelopesFrom(live()),
    readActiveLevelId: () => {
      try { return resolveActiveLevelId() ?? null; } catch { return null; }
    },
    // ⚠ The cast is at the SEAM, not inside the dep. `createId` is generic over
    // `ElementType`; the two call sites pass `'spaceEnvelope'` (a real element type)
    // and `'room'` (a programme-local key that never reaches a store). Widening the
    // dep's own signature to `string` is what made the ROOT `tsc` fail while the
    // package check passed, so the narrowing happens here, once.
    mintId: (kind: string) => createId(kind as ElementType),
    readProjectRooms: () => readProjectRoomsFrom(live()),
  };
}

export interface RoomProgrammePanelHandle {
  readonly element: HTMLElement;
  /** Re-read the stores and re-solve. Cheap. */
  refresh(): void;
  dispose(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL DOM HELPERS — `textContent` only (C08 §3.1: this file is not an HTML sink)
// ─────────────────────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (css) n.style.cssText = css;
  if (text !== undefined) n.textContent = text;
  return n;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

// ⭐ §STAGE-05-SECTION (C115 §8.1 `C115-174`, L-13237) — the density pass, and WHERE IT IS NOT
// TAKEN FROM. Founder: *"SLIGHTLY SMALLER."* The type scale is already 9–11.5 px and C115 §4.3
// (`C115-36`/`C115-37`) makes weight and size part of the honesty vocabulary — a figure whose
// ceiling is unknown MUST NOT be de-weighted — so not one font-size below is reduced. The
// reduction is taken from WHITESPACE and from COLLAPSE: the label rhythm goes 10 → 6 px, the note
// gutter 8 → 6 px, and the empty graph canvas becomes a rail (see `renderGraph`). Nothing a
// reader can read gets smaller; the gaps between the things they read do.
const LABEL_CSS = 'font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--app-text-muted,#8a8a99);margin:6px 0 3px;';
const NOTE_CSS = 'font-size:10.5px;line-height:1.4;color:var(--app-text-muted,#77778a);margin:0 0 6px;';
const CARD_CSS = 'border:1px solid var(--app-border,#dde3ef);border-radius:8px;padding:8px;background:var(--app-surface,#fff);';

// ─────────────────────────────────────────────────────────────────────────────
// THE MOUNT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mount the panel into `host`. Never throws into the host: a panel that cannot build is
 * a panel the founder cannot open, and reachability is the whole deliverable.
 */
export function mountRoomProgrammePanel(
  host: HTMLElement,
  deps: RoomProgrammePanelDeps = defaultRoomProgrammePanelDeps(),
): RoomProgrammePanelHandle {
  const root = el('div', 'display:flex;flex-direction:column;gap:2px;padding:6px 2px;outline:none;');
  root.setAttribute('data-testid', ROOM_PROGRAMME_ROOT_TESTID);
  // §ROOM-BRIEF-UNDO (L-13120) — programmatically focusable, never in the tab ORDER. A panel
  // that stole a tab stop from the controls inside it would trade one keyboard defect for
  // another; `-1` is exactly "can hold focus, is not a stop".
  root.tabIndex = -1;

  let disposed = false;
  let status = '';
  let statusIsRefusal = false;
  /** Set when the user has asked for a replace and is being shown its cost. */
  let pendingReplace: readonly string[] | null = null;
  /** Drag-to-link state: the node the pointer went down on. */
  let linkFrom: string | null = null;
  // ⭐ §GRAPH-CLICK-TO-PLUG (founder 2026-09-11 · `C115-74` behaviour 3, amended) — CLICK a room, then
  // another, to plug them. Session view state only: it never reaches the brief.
  let selectedNodeId: string | null = null;
  // ⭐ §GRAPH-DRAG-TO-REARRANGE — where the reader dragged a room. VIEW-ONLY: the solver reads the
  // plugs, never a position, so *"nothing here is inferred, the graph drives the plan"* stays true.
  const nodePos = new Map<string, { x: number; y: number }>();
  /** Where the press began (client px): a click is a press that barely moved. */
  let dragFromClient: { x: number; y: number } | null = null;
  let dragMoved = false;
  /** The dragged room's seat before this drag — restored when the drag ends by PLUGGING instead. */
  let dragOrigin: { id: string; pos: { x: number; y: number } | null } | null = null;
  // ⭐ §ROOM-PROGRAMME-TARGET (`C115-181`) — which building and storey the plan resolves into.
  let target: ProgrammeTarget = PROGRAMME_TARGET_DEFAULT;

  const slots = {
    note: el('p', NOTE_CSS, ROOM_PROGRAMME_NOTE),
    target: el('div'),
    library: el('div'),
    graph: el('div'),
    list: el('div'),
    preview: el('div'),
    report: el('div'),
    actions: el('div'),
  };

  const dispatchIntent = (fn: () => boolean): void => {
    // Any programme change invalidates a pending replace confirmation — the count it
    // quoted was about a layout that no longer exists.
    if (fn()) { pendingReplace = null; render(); }
  };

  // ── §ROOM-BRIEF-UNDO (L-13120) — WHO PRESSES UNDO, AND WHEN IT DEFERS ──────
  //
  // The history itself lives in `roomProgrammeModel.ts`, which also states why the brief is
  // not on either global undo stack and why that is not a P6 breach. What lives HERE is the
  // one question a second stack forces: WHICH stack does a Ctrl+Z mean?
  //
  // ⭐ THE ANSWER IS THE ONE `performUndoRedo.ts` ALREADY GIVES — reverse chronological order
  // across the stacks (§UNDO-CROSS-STACK-ORDER), applied with the only two facts this panel
  // can actually establish:
  //
  //   1. FOCUS. A Ctrl+Z is answered by the brief only while focus is inside this panel. With
  //      focus in the viewport it is the scene's, and this handler never sees a reason to
  //      consume it. That is the platform's own scoping rule for undo, not an invention.
  //   2. THE PLACEMENT DEBT. "Place envelopes in 3D" dispatches bus commands that ARE on the
  //      ring buffer and ARE newer than every brief edit before them. So each dispatch adds
  //      one to `busUndoDebt`, and while that debt is unpaid the keyboard DECLINES — one
  //      keypress per command, in the order they were made — letting `performUndo()` take
  //      them. The next brief edit clears the debt, because it is now the newest thing.
  //
  // ⛔ WHAT THIS DOES NOT ESTABLISH, SAID PLAINLY. A bus command dispatched by some OTHER
  // surface while focus sat in this panel is invisible here, so a Ctrl+Z could take back a
  // brief edit that is older than it. Closing that needs one clock shared by the ring buffer
  // and this history, which is a change to the undo module, not to this panel. The residual is
  // bounded by the focus rule (the user's hands were in this panel) and the buttons are exact
  // in every case, which is why the buttons exist and are not decoration.
  //
  // ⛔ AND IT NEVER SWALLOWS A KEYPRESS IT DID NO WORK FOR (§UNDO-NO-PHANTOM, L-691): with an
  // empty history it returns without `preventDefault`, so the global handler still runs and
  // the user gets the scene's undo rather than a keystroke that did nothing.

  /** Bus commands dispatched from this panel since the last brief change. See above. */
  let busUndoDebt = 0;

  /** Is the keyboard's owner inside this panel right now? */
  function focusIsInPanel(): boolean {
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    return !!a && (a === root || root.contains(a));
  }

  function runBriefUndo(direction: 'undo' | 'redo'): boolean {
    const r = direction === 'undo' ? undoRoomProgramme() : redoRoomProgramme();
    if (!r.ok) return false;
    pendingReplace = null;
    say(
      direction === 'undo'
        ? `Took back ${r.label}. The plan is re-solved from the brief as it was; press Redo — or `
          + 'Ctrl+Y — to put it back.'
        : `Put back ${r.label}.`,
      false);
    render();
    return true;
  }

  /**
   * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, in the CAPTURE phase on `window` so a keypress this panel
   * answers never also reaches `initUI`'s global handler on the same window (which listens in
   * the bubble phase and would then undo a scene edit for the same press).
   */
  const onUndoKey = (ev: KeyboardEvent): void => {
    if (disposed) return;
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const k = ev.key.toLowerCase();
    const isUndo = k === 'z' && !ev.shiftKey;
    const isRedo = (k === 'z' && ev.shiftKey) || k === 'y';
    if (!isUndo && !isRedo) return;
    // ⛔ A TEXT FIELD OWNS ITS OWN UNDO. Taking Ctrl+Z away from a half-typed room name would
    // be a worse bug than the one this closes — and it is the same guard `initUI` uses.
    const t = ev.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    if (!focusIsInPanel()) return;
    if (busUndoDebt > 0) {
      // The newest thing is an envelope command, not a brief edit. Decline exactly once per
      // command and let the global undo have this keypress.
      busUndoDebt -= 1;
      return;
    }
    if ((isUndo ? peekRoomProgrammeUndo() : peekRoomProgrammeRedo()) === null) return;
    ev.preventDefault();
    ev.stopPropagation();
    runBriefUndo(isUndo ? 'undo' : 'redo');
  };

  /**
   * Give the panel the focus a keyboard shortcut needs.
   *
   * ⚠ SVG CELLS ARE NOT FOCUSABLE, so after drawing a room `document.activeElement` is still
   * `<body>` and the focus rule above would hand every Ctrl+Z to the scene. The root takes
   * focus on a pointer press inside it — and ONLY when focus is not already inside, so a click
   * into the area field or the room-name input still lands where the browser would put it.
   */
  const onPanelPointerDown = (): void => {
    if (disposed || focusIsInPanel()) return;
    try { root.focus({ preventScroll: true }); } catch { root.focus(); }
  };

  // ── TARGET — §ROOM-PROGRAMME-TARGET (founder 2026-09-11 · `C115-181`) ────────
  //
  // *"Room library, relationship graph, and the plan it resolves to — per building and level."*
  // Two selectors, both NARROWING what the one picker sees (`roomProgrammeTarget.ts`). Their first
  // options are TODAY'S RULE — every building, the active storey — so an untouched panel resolves
  // exactly as it did before they existed.
  function renderTarget(buildings: readonly ProgrammeBuildingOption[]): void {
    const box = el('div', 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:2px 0 4px;');
    box.setAttribute('data-testid', ROOM_PROGRAMME_TARGET_TESTID);
    const selCss = 'font-size:11px;padding:3px 6px;border-radius:6px;min-width:0;max-width:100%;'
      + 'border:1px solid var(--app-border,#dde3ef);background:var(--app-surface,#fff);'
      + 'color:var(--app-text,#22223a);font-family:inherit;';
    const none = buildings.length === 0;

    const building = el('select', selCss);
    building.setAttribute('data-testid', ROOM_PROGRAMME_BUILDING_SELECT_TESTID);
    building.setAttribute('aria-label', 'Building the plan resolves into');
    const allB = el('option', '', none ? 'No building yet' : 'All buildings');
    allB.value = '';
    building.appendChild(allB);
    for (const b of buildings) {
      const o = el('option', '', b.label);
      o.value = b.key;
      building.appendChild(o);
    }
    building.value = target.buildingKey ?? '';
    building.disabled = none;

    // The storeys of the chosen building — or of every building, one option per storey, with the
    // envelope count when more than one contends (the picker then states the ambiguity itself).
    const pool = target.buildingKey !== null
      ? (buildings.find((b) => b.key === target.buildingKey)?.storeys ?? [])
      : buildings.flatMap((b) => b.storeys);
    const byLevel = new Map<string, { label: string; count: number }>();
    for (const s of pool) {
      const seen = byLevel.get(s.levelId);
      if (seen) seen.count += s.envelopeCount;
      else byLevel.set(s.levelId, { label: s.label, count: s.envelopeCount });
    }
    const level = el('select', selCss);
    level.setAttribute('data-testid', ROOM_PROGRAMME_LEVEL_SELECT_TESTID);
    level.setAttribute('aria-label', 'Storey the plan resolves into');
    const active = el('option', '', 'Active storey');
    active.value = '';
    level.appendChild(active);
    for (const [levelId, s] of byLevel) {
      const o = el('option', '', s.count > 1 ? `${s.label} · ${s.count} envelopes` : s.label);
      o.value = levelId;
      level.appendChild(o);
    }
    level.value = target.levelId ?? '';
    level.disabled = none;

    building.addEventListener('change', () => {
      // A new building resets the storey: another building's storey id would narrow to nothing.
      target = { buildingKey: building.value === '' ? null : building.value, levelId: null };
      pendingReplace = null;
      render();
    });
    level.addEventListener('change', () => {
      target = { buildingKey: target.buildingKey, levelId: level.value === '' ? null : level.value };
      pendingReplace = null;
      render();
    });
    box.appendChild(building);
    box.appendChild(level);
    slots.target.replaceChildren(box);
  }

  // ── LIBRARY ────────────────────────────────────────────────────────────────

  function addRoom(kind: ResidentialRoomKind): void {
    dispatchIntent(() =>
      applyRoomProgrammeIntent({ type: 'programme.add-room', id: deps.mintId('room'), kind }));
  }

  // ── §PROJECT-ROOMS-ARE-THE-PROGRAMME (L-13024) ─────────────────────────────
  // Founder: *"the room programme ALWAYS should have the rooms on the project!"* His
  // panel read `0 PLUGGED, 0 ROOMS` and offered an EXAMPLE while the model held a
  // generated house and the console printed `RoomDetectionEngine detected 1 room(s)`.
  //
  // ⛔ THE RULES THIS LOAD OBEYS, and they are the difference between a fix and a
  //    fabrication:
  //    1. It NEVER invents. No project rooms ⇒ the programme stays empty and the panel
  //       keeps saying "no rooms yet", which for an empty project is the true answer.
  //    2. It NEVER clobbers the user's work. The automatic load fires ONCE, on mount,
  //       and ONLY into an empty programme. Once the user has dragged, renamed or
  //       plugged anything, only the explicit button re-reads.
  //    3. It states what it did, with both counts (C83 §1.2).

  /** Has the one automatic mount-time load already been attempted? */
  let autoLoadTried = false;

  /** How many project rooms are visible right now — drives the button's own label. */
  function countProjectRooms(): number {
    return safe(() => deps.readProjectRooms(), [] as readonly ProjectRoomLike[]).length;
  }

  /**
   * @param undoable §ROOM-BRIEF-UNDO (L-13120) — `false` for the ONE automatic mount-time load.
   * A change the user did not ask for must not be what his first Ctrl+Z takes back: he would
   * press it expecting his own last gesture and watch the panel empty instead. The two BUTTONS
   * that do the same read are gestures, so they pass `true` and are fully reversible — which
   * matters most for the one whose own tooltip warns *"Relationships you plugged are cleared"*.
   */
  function loadProjectRooms(announce: boolean, undoable = true): boolean {
    const rooms = safe(() => deps.readProjectRooms(), [] as readonly ProjectRoomLike[]);
    const levelId = safe(() => deps.readActiveLevelId(), null);
    // Prefer the ACTIVE storey; fall back to the whole project when the active storey
    // holds none, so a user on an empty upper level still sees the house they built
    // rather than a blank panel with rooms one level down.
    let imp = programmeFromProjectRooms(rooms, levelId);
    let scope = levelId;
    if (imp.imported === 0 && levelId !== null) {
      const all = programmeFromProjectRooms(rooms, null);
      if (all.imported > 0) { imp = all; scope = null; }
    }
    if (imp.imported === 0) {
      if (announce) say(describeProjectRoomsImport(imp, scope), false);
      return false;
    }
    const changed = applyRoomProgrammeIntent(
      { type: 'programme.reset', next: imp.programme }, { undoable });
    if (announce || changed) say(describeProjectRoomsImport(imp, scope), false);
    return changed;
  }

  function renderLibrary(): void {
    const box = el('div');
    box.setAttribute('data-testid', ROOM_PROGRAMME_LIBRARY_TESTID);
    box.appendChild(el('div', LABEL_CSS, `Room library — ${RESIDENTIAL_ROOM_LIBRARY.length} kinds`));
    const wrap = el('div', 'display:flex;flex-wrap:wrap;gap:3px;');
    for (const entry of RESIDENTIAL_ROOM_LIBRARY) {
      const chip = el('button');
      chip.type = 'button';
      chip.draggable = true;
      chip.setAttribute(ROOM_PROGRAMME_CHIP_ATTR, entry.kind);
      // ⭐ §STAGE-05-SMALLER-CHIPS (founder 2026-09-11) — smaller by WHITESPACE and SWATCH only; the
      // label keeps its 11 px (`C115-174`: the reduction is never taken from the type scale).
      chip.style.cssText = [
        'display:inline-flex', 'align-items:center', 'gap:4px',
        'padding:2px 6px', 'border-radius:999px', 'cursor:grab',
        'font-size:11px', 'color:var(--app-text,#22223a)',
        'border:1px solid var(--app-border,#dde3ef)',
        'background:var(--app-surface,#fff)',
      ].join(';');
      chip.title = describeLibraryEntry(entry.kind);
      const dot = el('span',
        `width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:${libraryColourFor(entry.kind)};`);
      chip.appendChild(dot);
      chip.appendChild(el('span', '', entry.label));
      chip.addEventListener('dragstart', (ev: DragEvent) => {
        if (!ev.dataTransfer) return;
        ev.dataTransfer.effectAllowed = 'copy';
        try { ev.dataTransfer.setData(ROOM_DRAG_MIME, entry.kind); } catch { /* older DT */ }
        ev.dataTransfer.setData('text/plain', ROOM_DRAG_PREFIX + entry.kind);
      });
      // ⭐ CLICK IS NOT A CONVENIENCE, IT IS THE FALLBACK ROUTE. Drag-and-drop is
      // unavailable on touch and hostile to keyboard users; a library reachable only by
      // dragging would be a library half the users cannot open.
      chip.addEventListener('click', () => addRoom(entry.kind));
      wrap.appendChild(chip);
    }
    box.appendChild(wrap);
    slots.library.replaceChildren(box);
  }

  function describeLibraryEntry(kind: ResidentialRoomKind): string {
    const e = residentialRoomEntry(kind);
    if (!e) return kind;
    const map = e.mapping.kind === 'mapped'
      ? `Occupancy: ${e.mapping.occupancy}. ${e.mapping.why}`
      : `No occupancy member. ${e.mapping.why}`;
    const src = e.targetAreaSource.kind === 'preset'
      ? `Target ${e.targetAreaM2} m² from preset ${e.targetAreaSource.presetId}.`
      : `Target ${e.targetAreaM2} m² — PRYZM default. ${e.targetAreaSource.why}`;
    return `${e.label}. ${src} ${map}`;
  }

  function acceptDrop(ev: DragEvent): void {
    ev.preventDefault();
    const dt = ev.dataTransfer;
    if (!dt) return;
    let kind = '';
    try { kind = dt.getData(ROOM_DRAG_MIME) || ''; } catch { /* older DT */ }
    if (!kind) {
      const raw = dt.getData('text/plain') || '';
      if (raw.startsWith(ROOM_DRAG_PREFIX)) kind = raw.slice(ROOM_DRAG_PREFIX.length);
    }
    if (!isResidentialRoomKind(kind)) return;
    // ⛔ §DROP-ADDS-TWO (L-13238) — ONE DROP IS ONE ROOM. `makeDropTarget` is applied to FOUR
    // nested nodes — the graph SVG, the programme list, the plan preview and the panel ROOT — and
    // `drop` bubbles, so a chip released on any of the inner three ran this handler twice and
    // added TWO rooms with two undo steps behind them. Found by §STAGE-05-DENSITY's *"the compact
    // rail is still a drop target"* arm, which is the first spec to drop on an INNER target rather
    // than on the root; every earlier spec dropped on the root and could not see it.
    //
    // ⭐ CONSUMED, THEN STOPPED — never stopped unconditionally. A drop carrying something this
    // panel does not recognise must keep bubbling, or an inner node would silently swallow a
    // payload an ancestor (or the page) knows what to do with.
    ev.stopPropagation();
    addRoom(kind);
  }

  function makeDropTarget(node: HTMLElement | SVGElement): void {
    node.addEventListener('dragover', (ev) => {
      const e = ev as DragEvent;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    node.addEventListener('drop', (ev) => acceptDrop(ev as DragEvent));
  }

  // ── GRAPH — the INPUT surface ──────────────────────────────────────────────

  function renderGraph(p: RoomProgramme): void {
    const box = el('div');
    box.appendChild(el('div', LABEL_CSS,
      `Relationships — ${p.links.length} plugged, ${p.entries.length} rooms`));
    box.appendChild(el('p', NOTE_CSS,
      'Click two rooms to plug a relationship between them — or drag one onto another. Click a '
      + 'line to unplug it. Drag a room onto empty space to rearrange; positions are for reading '
      + 'only. Either way the plan below re-solves immediately — that is what "the graph drives '
      + 'the layout" means here. Drop a library chip anywhere on this panel to add a room.'));

    const W = 300;
    const H = 190;
    // ⭐ §STAGE-05-SECTION (C115 §8.1 `C115-173`, L-13237) — DISCREET WHEN EMPTY, GENEROUS WHEN FULL.
    //
    // Founder 2026-09-07: *"MAKE IT SMALLER AND MORE DISCREET — BOTH THE ROOM GRAPH AND THE
    // 'ROOMS PER LEVEL' SECTION."* The empty canvas was the single largest block on a cold panel
    // and it is measurable rather than a matter of taste: the `<svg>` declares a viewBox and
    // `width:100%` and NO height, so a browser sizes it by intrinsic ratio — 190/300 = 0.633 ×
    // the content width. In a ~400 px panel that is roughly 250 px of blank card carrying one
    // 50-character sentence.
    //
    // ⛔ IT IS A HEIGHT, NOT A DELETION, and it applies to the EMPTY arm only. `C115-72` — the
    // graph is the INPUT to the solver and must remain fully functional; `C115-74` names seven
    // behaviours that must survive. All seven live on the POPULATED path below, which is
    // byte-identical to what it was: `layoutND` is still called with `[W - 40, H - 40]`, so a
    // graph with rooms in it returns to the full 300 × 190 aspect the moment the first room
    // exists. And the rail is still a DROP TARGET (`makeDropTarget` runs above this branch for
    // both arms), so *"drop a library chip onto the graph"* — behaviour 5 — never stops working
    // at any height.
    const EMPTY_H = 44;
    const empty = p.entries.length === 0;
    const vbH = empty ? EMPTY_H : H;
    const svg = svgEl('svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${vbH}`);
    svg.setAttribute('width', '100%');
    // ⭐ The height is stated ONLY on the empty arm. Leaving it unset on the populated arm keeps
    // the intrinsic-ratio sizing the layout was tuned against — a fixed height there would
    // letterbox the nodes `layoutND` positioned in the 300 × 190 box.
    if (empty) svg.setAttribute('height', String(EMPTY_H));
    else svg.removeAttribute('height');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label',
      `Room relationship graph: ${p.entries.length} rooms, ${p.links.length} relationships.`);
    svg.style.cssText = `${CARD_CSS}display:block;touch-action:none;`
      + (empty ? 'padding:4px 8px;' : '');
    svg.setAttribute(ROOM_PROGRAMME_GRAPH_EMPTY_ATTR, empty ? 'compact' : 'full');
    svg.setAttribute('data-testid', ROOM_PROGRAMME_GRAPH_TESTID);
    makeDropTarget(svg);

    if (empty) {
      const t = svgEl('text');
      t.setAttribute('x', String(W / 2));
      t.setAttribute('y', String(EMPTY_H / 2 + 4));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '11');
      t.setAttribute('fill', '#8a8a99');
      // ⛔ THE SENTENCE IS NOT FILLER. C115 §4.4 clause 1 — a named absence has something to say —
      // and clause 4 — the escape hatch survives: this line is the only place the panel tells a
      // reader that a chip CLICK adds a room, which is the one non-pointer route in (C115-78/D-9).
      t.textContent = 'No rooms yet — drag one in, or click a chip above.';
      svg.appendChild(t);
      box.appendChild(svg);
      slots.graph.replaceChildren(box);
      return;
    }

    // ⭐ REUSE: `forceLayout` is the analysis surface's deterministic 2-D layout. A second
    // graph layout in this app would be a rival with its own drift (C84 EI-9).
    const pos = layoutND(
      p.entries.map((e) => e.id),
      p.links.map((l) => [l.aId, l.bId] as const),
      [W - 40, H - 40],
    );
    // §GRAPH-DRAG-TO-REARRANGE — a room the reader moved stays where they put it; every other room
    // keeps its deterministic `layoutND` seat. Rooms that left the brief lose their override (and a
    // pending selection) here, so neither can outlive the programme.
    for (const id of [...nodePos.keys()]) if (!p.entries.some((e) => e.id === id)) nodePos.delete(id);
    if (selectedNodeId !== null && !p.entries.some((e) => e.id === selectedNodeId)) selectedNodeId = null;
    const at = (id: string): { x: number; y: number } => {
      const moved = nodePos.get(id);
      if (moved) return moved;
      const q = pos.get(id);
      return { x: (q?.[0] ?? (W - 40) / 2) + 20, y: (q?.[1] ?? (H - 40) / 2) + 20 };
    };
    /** Live handles, so a drag moves one room and its lines without rebuilding the graph. */
    const lineEls: { el: SVGLineElement; a: string; b: string }[] = [];
    const nodeEls = new Map<string, { c: SVGCircleElement; t: SVGTextElement }>();
    // ⭐ §STAGE-05-SMALLER-NODES (founder 2026-09-11) — the GLYPH shrinks (r 9 → 6.5); the name
    // under it keeps its size (`C115-174`: the reduction is never taken from the type scale).
    const NODE_R = 6.5;
    const NODE_LABEL_DY = 17;

    for (const l of p.links) {
      const a = at(l.aId);
      const b = at(l.bId);
      const line = svgEl('line');
      line.setAttribute('x1', String(a.x));
      line.setAttribute('y1', String(a.y));
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y));
      line.setAttribute('stroke', '#6600FF');
      line.setAttribute('stroke-width', '4');
      line.setAttribute('stroke-opacity', '0.32');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute(ROOM_PROGRAMME_EDGE_ATTR, `${l.aId}|${l.bId}`);
      line.style.cursor = 'pointer';
      const an = p.entries.find((e) => e.id === l.aId)?.name ?? l.aId;
      const bn = p.entries.find((e) => e.id === l.bId)?.name ?? l.bId;
      const title = svgEl('title');
      title.textContent = `${an} ↔ ${bn} — click to unplug`;
      line.appendChild(title);
      line.addEventListener('click', () => {
        dispatchIntent(() =>
          applyRoomProgrammeIntent({ type: 'programme.unlink', aId: l.aId, bId: l.bId }));
      });
      lineEls.push({ el: line, a: l.aId, b: l.bId });
      svg.appendChild(line);
    }

    /** Client px → this SVG's viewBox units; `null` where the host has no layout to ask. */
    const toSvg = (cx: number, cy: number): { x: number; y: number } | null => {
      try {
        const m = svg.getScreenCTM();
        if (m && typeof DOMPoint === 'function') {
          const r = new DOMPoint(cx, cy).matrixTransform(m.inverse());
          return { x: r.x, y: r.y };
        }
        const box = svg.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          return { x: ((cx - box.left) / box.width) * W, y: ((cy - box.top) / box.height) * H };
        }
      } catch { /* a host without layout (a detached panel, a test DOM) — the drag still ends cleanly */ }
      return null;
    };
    const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
    const moveNodeTo = (id: string, x: number, y: number): void => {
      const q = { x: clamp(x, 10, W - 10), y: clamp(y, 10, H - 24) };
      nodePos.set(id, q);
      const n = nodeEls.get(id);
      if (n) {
        n.c.setAttribute('cx', String(q.x));
        n.c.setAttribute('cy', String(q.y));
        n.t.setAttribute('x', String(q.x));
        n.t.setAttribute('y', String(q.y + NODE_LABEL_DY));
      }
      for (const l of lineEls) {
        if (l.a === id) { l.el.setAttribute('x1', String(q.x)); l.el.setAttribute('y1', String(q.y)); }
        if (l.b === id) { l.el.setAttribute('x2', String(q.x)); l.el.setAttribute('y2', String(q.y)); }
      }
    };
    /** A drag that ends by PLUGGING puts the dragged room back — that gesture plugs, it does not move. */
    const restoreDragOrigin = (id: string): void => {
      if (dragOrigin === null || dragOrigin.id !== id) return;
      if (dragOrigin.pos === null) nodePos.delete(id);
      else nodePos.set(id, dragOrigin.pos);
      dragOrigin = null;
    };
    const plug = (aId: string, bId: string): void => {
      selectedNodeId = null;
      let changed = false;
      dispatchIntent(() => (changed = applyRoomProgrammeIntent({ type: 'programme.link', aId, bId })));
      // Already plugged: nothing re-rendered, so repaint the graph to drop the selection ring.
      if (!changed) renderGraph(getRoomProgramme());
    };
    const endPress = (): void => { linkFrom = null; dragFromClient = null; dragMoved = false; };

    for (const e of p.entries) {
      const q = at(e.id);
      const selected = selectedNodeId === e.id;
      const g = svgEl('g');
      g.setAttribute(ROOM_PROGRAMME_NODE_ATTR, e.id);
      if (selected) g.setAttribute(ROOM_PROGRAMME_NODE_SELECTED_ATTR, 'true');
      g.style.cursor = 'grab';
      const c = svgEl('circle');
      c.setAttribute('cx', String(q.x));
      c.setAttribute('cy', String(q.y));
      c.setAttribute('r', String(selected ? NODE_R + 1.5 : NODE_R));
      c.setAttribute('fill', libraryColourFor(e.kind));
      c.setAttribute('stroke', selected ? '#6600FF' : '#3a3a52');
      c.setAttribute('stroke-width', selected ? '2' : '1');
      const t = svgEl('text');
      t.setAttribute('x', String(q.x));
      t.setAttribute('y', String(q.y + NODE_LABEL_DY));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '9');
      t.setAttribute('fill', '#3a3a52');
      t.textContent = e.name;
      const title = svgEl('title');
      title.textContent = selected
        ? `${e.name} — now click the room to plug it to (click ${e.name} again to cancel)`
        : `${e.name} — click it, then another room, to plug a relationship (or drag it onto one); `
          + 'drag it to empty space to rearrange';
      g.appendChild(title);
      g.appendChild(c);
      g.appendChild(t);
      nodeEls.set(e.id, { c, t });
      // ⭐ THE PRESS. `HouseLayoutModal.ts:1058`'s drag-a-node-onto-a-node is KEPT (`C115-74`
      // behaviour 3); the founder's 2026-09-11 click-two-rooms and drag-to-rearrange ride the same
      // press and are told apart only by where it is released and whether it moved.
      g.addEventListener('pointerdown', (ev) => {
        const pe = ev as PointerEvent;
        linkFrom = e.id;
        dragFromClient = { x: pe.clientX, y: pe.clientY };
        dragMoved = false;
        dragOrigin = null;
        pe.preventDefault();
      });
      g.addEventListener('pointerup', (ev) => {
        const from = linkFrom;
        const moved = dragMoved;
        endPress();
        // ⛔ The SVG root's release listener below must not ALSO act on this release.
        ev.stopPropagation();
        if (from !== null && from !== e.id) {
          // Pressed on one room, released on another: PLUG (behaviour 3, unchanged).
          restoreDragOrigin(from);
          plug(from, e.id);
          return;
        }
        if (from === e.id && moved) return;            // rearranged — the move already landed
        if (selectedNodeId !== null && selectedNodeId !== e.id) { plug(selectedNodeId, e.id); return; }
        selectedNodeId = selectedNodeId === e.id ? null : e.id;
        renderGraph(getRoomProgramme());
      });
      svg.appendChild(g);
    }
    svg.addEventListener('pointermove', (ev) => {
      if (linkFrom === null || dragFromClient === null) return;
      const pe = ev as PointerEvent;
      if (!dragMoved && Math.hypot(pe.clientX - dragFromClient.x, pe.clientY - dragFromClient.y) < 4) return;
      if (!dragMoved) dragOrigin = { id: linkFrom, pos: nodePos.get(linkFrom) ?? null };
      dragMoved = true;
      const q = toSvg(pe.clientX, pe.clientY);
      if (q) moveNodeTo(linkFrom, q.x, q.y);
    });
    svg.addEventListener('pointerup', (ev) => {
      // Released on EMPTY canvas (never a line — its own click unplugs): a drag has already landed
      // its move; a plain click there cancels a pending selection.
      const onCanvas = ev.target === svg;
      const pressed = linkFrom !== null;
      endPress();
      if (onCanvas && !pressed && selectedNodeId !== null) {
        selectedNodeId = null;
        renderGraph(getRoomProgramme());
      }
    });
    svg.addEventListener('pointerleave', () => { endPress(); });

    box.appendChild(svg);
    slots.graph.replaceChildren(box);
  }

  // ── PROGRAMME LIST ─────────────────────────────────────────────────────────

  function renderList(p: RoomProgramme): void {
    const box = el('div');
    box.setAttribute('data-testid', ROOM_PROGRAMME_LIST_TESTID);
    makeDropTarget(box);
    const total = p.entries.reduce((s, e) => s + e.targetAreaM2, 0);
    // §STAGE-05-SECTION (C115-172) — the SAME line, now addressable, so question 4's digest can
    // mirror it instead of counting the rooms a second time.
    const headline = el('div', LABEL_CSS,
      `Programme — ${p.entries.length} rooms, ${total.toFixed(1)} m²`);
    headline.setAttribute('data-testid', ROOM_PROGRAMME_SUMMARY_TESTID);
    // ⚠ C115-77, stated where a reader looks for a figure's standing rather than buried.
    headline.setAttribute(ROOM_PROGRAMME_SUMMARY_STATE_ATTR, p.entries.length === 0
      ? 'nothing declared yet'
      : `declared by you · ${p.links.length} plugged · this session only`);
    box.appendChild(headline);
    if (p.entries.length === 0) {
      const row = el('div', 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;');
      // §PROJECT-ROOMS-ARE-THE-PROGRAMME (L-13024) — when the PROJECT holds rooms, the
      // first thing offered is the project, not an example. Offering an example over a
      // real design is the defect the founder reported, in one button.
      const projectRooms = countProjectRooms();
      if (projectRooms > 0) {
        const load = el('button');
        load.type = 'button';
        load.setAttribute('data-testid', ROOM_PROGRAMME_LOAD_BTN_TESTID);
        load.style.cssText = 'padding:5px 10px;border-radius:6px;border:1px solid #6600FF;background:#6600FF;color:#fff;font-size:11px;cursor:pointer;';
        load.textContent = `Load the ${projectRooms} room${projectRooms === 1 ? '' : 's'} in this project`;
        load.title =
          'Reads the rooms this project already holds into the programme, keeping each '
          + "room's own name and measured area. Relationships are not imported — plug "
          + 'them on the graph.';
        load.addEventListener('click', () => { loadProjectRooms(true); render(); });
        row.appendChild(load);
      }
      const seed = el('button');
      seed.type = 'button';
      seed.setAttribute('data-testid', ROOM_PROGRAMME_SEED_BTN_TESTID);
      seed.style.cssText = 'padding:5px 10px;border-radius:6px;border:1px solid #6600FF;background:#fff;color:#6600FF;font-size:11px;cursor:pointer;';
      seed.textContent = 'Start from the example ground floor';
      seed.title =
        "STR §8's worked example — living, open kitchen, ensuite bedroom, bathroom, staircase "
        + '— with the §9 relationships already plugged in. Everything stays editable.';
      seed.addEventListener('click', () => {
        dispatchIntent(() => applyRoomProgrammeIntent({
          type: 'programme.reset',
          next: defaultResidentialProgramme(() => deps.mintId('room')),
        }));
      });
      row.appendChild(seed);
      box.appendChild(row);
      if (projectRooms === 0) {
        box.appendChild(el('p', `${NOTE_CSS}margin:6px 0 0;`,
          'This project has no rooms yet, so there is nothing to load. Drag rooms in from '
          + 'the library above to declare a programme before you build.'));
      }
      slots.list.replaceChildren(box);
      return;
    }
    {
      // §PROJECT-ROOMS-ARE-THE-PROGRAMME (L-13024) — the explicit re-read. The automatic
      // load runs once, into an empty programme only, so it can never overwrite an edit;
      // this is how a user asks for the project's rooms back after editing, or picks up
      // a house generated after the panel was opened. It REPLACES the programme, and the
      // label says so — no silent merge.
      const projectRooms = countProjectRooms();
      if (projectRooms > 0) {
        const reload = el('button');
        reload.type = 'button';
        reload.setAttribute('data-testid', ROOM_PROGRAMME_LOAD_BTN_TESTID);
        reload.style.cssText = 'align-self:flex-start;margin:2px 0 6px;padding:3px 8px;border-radius:6px;border:1px solid var(--app-border,#dde3ef);background:var(--app-surface,#fff);color:#6600FF;font-size:10.5px;cursor:pointer;';
        reload.textContent = `Re-read the ${projectRooms} room${projectRooms === 1 ? '' : 's'} in this project`;
        reload.title =
          'REPLACES the programme below with the rooms this project holds right now, '
          + 'including their names and measured areas. Relationships you plugged are '
          + 'cleared, because they belong to the programme you are replacing.';
        reload.addEventListener('click', () => { loadProjectRooms(true); render(); });
        box.appendChild(reload);
      }
    }
    for (const e of p.entries) {
      const row = el('div',
        'display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid var(--app-border,#eef1f7);');
      row.appendChild(el('span',
        `width:9px;height:9px;border-radius:2px;flex:0 0 auto;background:${libraryColourFor(e.kind)};`));
      const name = el('input') as HTMLInputElement;
      name.type = 'text';
      name.value = e.name;
      name.style.cssText = 'flex:1 1 auto;min-width:0;font-size:11px;border:none;background:transparent;color:var(--app-text,#22223a);';
      name.addEventListener('change', () => {
        dispatchIntent(() =>
          applyRoomProgrammeIntent({ type: 'programme.rename-room', id: e.id, name: name.value }));
      });
      row.appendChild(name);
      const area = el('input') as HTMLInputElement;
      area.type = 'number';
      area.min = '0.5';
      area.step = '0.5';
      area.value = String(e.targetAreaM2);
      area.style.cssText = 'width:52px;font-size:11px;text-align:right;border:1px solid var(--app-border,#dde3ef);border-radius:4px;padding:1px 3px;';
      area.title = `Target area, m². Floor for a ${e.kind}: ${residentialRoomEntry(e.kind)?.minAreaM2 ?? '—'} m².`;
      area.addEventListener('change', () => {
        dispatchIntent(() => applyRoomProgrammeIntent({
          type: 'programme.set-area', id: e.id, targetAreaM2: Number(area.value),
        }));
      });
      row.appendChild(area);
      row.appendChild(el('span', 'font-size:10px;color:#8a8a99;', 'm²'));
      const del = el('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = `Remove ${e.name} and its relationships`;
      del.style.cssText = 'border:none;background:transparent;color:#8a8a99;font-size:14px;cursor:pointer;line-height:1;padding:0 2px;';
      del.addEventListener('click', () => {
        dispatchIntent(() =>
          applyRoomProgrammeIntent({ type: 'programme.remove-room', id: e.id }));
      });
      row.appendChild(del);
      box.appendChild(row);
    }
    slots.list.replaceChildren(box);
  }

  // ── §ROOM-PIN (L-13079) — REORDERING ROOMS ON THE PLAN ─────────────────────
  //
  // Founder: *"I shall be able to reorganize also the rooms on the plan view."*
  //
  // ⭐ POINTER EVENTS, NOT HTML5 DRAG-AND-DROP, AND THE REASON IS THIS SURFACE. The panel
  // already uses HTML5 DnD for the LIBRARY chips, and `makeDropTarget` is installed on this very
  // `<svg>` so a chip can be dropped onto the plan to add a room. Making the cells HTML5-draggable
  // too would put two drag protocols on one element with one `dataTransfer` between them, and
  // `draggable` is not honoured on SVG children across browsers in any case. A pointer gesture is
  // a different channel: it cannot be confused with a chip drop, it needs no `DataTransfer`, and
  // it is directly drivable by a spec.
  //
  // ⛔ IT WRITES THROUGH THE PROGRAMME INTENT PATH, WHICH IS THIS SUBSYSTEM'S BLESSED ONE — the
  // same `applyRoomProgrammeIntent` every other edit on this panel uses (add · rename · set-area ·
  // link · unlink). It is deliberately NOT a bus command: `roomProgrammeModel.ts`'s header makes
  // the P6 argument in full — a programme is a session BRIEF, not a domain store, and its
  // blessed precedent is the `activeRoom*Overrides` family (C52 §3). The bus is reached when the
  // brief is COMMITTED, by "Create room envelopes", and that is the gesture that is on the BUS.
  // ⭐ CORRECTED 2026-09-07 (§ROOM-BRIEF-UNDO, L-13120). This read *"A PIN IS NOT ON THE UNDO
  // STACK, and this panel must not imply that it is. Ctrl+Z does not unpin"*. It was accurate
  // and it was a limit, not a design: the brief now keeps its OWN history
  // (`roomProgrammeModel.ts` §ROOM-BRIEF-UNDO), so a pin is taken back by Undo or Ctrl+Z like
  // every other brief gesture. NOT being a bus command and NOT being undoable were run together
  // as one fact; they are two, and only the first of them was ever a decision.

  /** Where a reorder gesture began: the room under the pointer at `pointerdown`. */
  let reorderFrom: { readonly id: string; readonly name: string; readonly order: number } | null = null;

  /** The cell group under a pointer event, or `null` if the pointer is on bare plate. */
  function cellUnder(ev: PointerEvent): { readonly id: string; readonly order: number } | null {
    const t = ev.target as Element | null;
    const g = t?.closest?.(`[${ROOM_CELL_ID_ATTR}][${ROOM_CELL_ORDER_ATTR}]`) ?? null;
    if (!g) return null;
    const id = g.getAttribute(ROOM_CELL_ID_ATTR);
    const order = Number(g.getAttribute(ROOM_CELL_ORDER_ATTR));
    if (!id || !Number.isInteger(order)) return null;
    return { id, order };
  }

  /**
   * The gesture's RELEASE, installed once on the `<svg>` rather than per cell.
   *
   * ⛔ IT CANNOT LIVE ON THE SOURCE CELL, AND THAT IS NOT A STYLE CHOICE. Without pointer
   * capture a browser fires `pointerup` on the element under the pointer at release — the
   * DESTINATION — so a listener on the cell the drag STARTED from would never run for the one
   * gesture this feature is about. (A spec written against a per-cell listener would still have
   * passed, by dispatching an event the browser never produces: §FAKE-MORE-CAPABLE-THAN-REAL.)
   * One listener on the shared root sees every release, whichever cell it lands on.
   */
  function wireReorderRelease(svg: SVGSVGElement): void {
    svg.addEventListener('pointerup', (ev) => {
      const from = reorderFrom;
      reorderFrom = null;
      if (!from) return;
      const to = cellUnder(ev as PointerEvent);
      // Released on bare plate, or back on itself: nothing was asked for, so nothing is done.
      // ⛔ NOT "pin it where it already is" — a gesture that ends where it started is a cancel,
      // and turning it into a pin would make every stray click a silent commitment.
      if (!to || to.id === from.id) return;
      applyReorder(from, to.order);
    });
    // Leaving the plan strip mid-drag abandons the gesture, so a release somewhere else on the
    // page cannot complete a move the user walked away from.
    svg.addEventListener('pointerleave', () => { reorderFrom = null; });
  }

  function wireCellReorder(g: SVGGElement, id: string, name: string, order: number): void {
    g.addEventListener('pointerdown', () => {
      reorderFrom = { id, name, order };
    });
    // §ROOM-PIN — the way BACK. A pin the user cannot release is a trap, and the release has to
    // live on the same surface as the gesture that set it.
    g.addEventListener('dblclick', () => {
      if (getRoomProgramme().entries.find((e) => e.id === id)?.pinnedOrder === undefined) return;
      dispatchIntent(() => {
        const changed = applyRoomProgrammeIntent({ type: 'programme.unpin-room', id });
        if (changed) {
          say(
            `${name} is no longer pinned — the solver places it again, from the relationships you `
            + 'plugged in.', false);
        }
        return changed;
      });
    });
  }

  /**
   * Move `from` to position `toOrder`, by PINNING it there.
   *
   * ⛔ EVERY REFUSAL IS SPOKEN. `programme.pin-room` returns the state unchanged when the slot is
   * already held by another pinned room, and a drag that appears to do nothing is exactly the
   * "did my change save?" failure this whole lane exists to remove. The panel says which room
   * holds the slot and what to do about it.
   */
  function applyReorder(
    from: { readonly id: string; readonly name: string; readonly order: number },
    toOrder: number,
  ): void {
    const p = getRoomProgramme();
    const holder = p.entries.find((e) => e.id !== from.id && e.pinnedOrder === toOrder);
    if (holder) {
      say(
        `${from.name} cannot take position ${toOrder + 1}: ${holder.name} is pinned there. One `
        + `position holds one room, and PRYZM will not decide which of the two you meant — `
        + `double-click ${holder.name} to unpin it first, then drag ${from.name} across.`,
        true);
      render();
      return;
    }
    const changed = applyRoomProgrammeIntent({
      type: 'programme.pin-room', id: from.id, order: toOrder,
    });
    if (changed) {
      pendingReplace = null;
      say(
        `${from.name} is pinned to position ${toOrder + 1}. It stays there while the rooms you `
        + 'have not pinned re-solve around it. Double-click it to hand it back to the solver, '
        + 'or press Undo — Ctrl+Z — to take the move back.', false);
    } else {
      // The reducer's one remaining refusal at this point is an out-of-range order, which the
      // strip cannot produce: it only offers positions that exist. Said anyway rather than
      // swallowed — a silent no-op is the defect, whatever caused it.
      say(`${from.name} could not be pinned to position ${toOrder + 1}. Nothing moved.`, true);
    }
    // ⛔ RENDERED ON BOTH ARMS. `dispatchIntent` repaints only when the state changed, which is
    // right for every other caller and wrong here: the REFUSAL is the thing the user most needs
    // to see, and it lives in the status line this repaint is what writes.
    render();
  }

  // ── §ROOM-WALL-DRAG (L-13096) — DRAWING THE ROOMS BY MOVING THEIR WALLS ────
  //
  // Founder: *"This room locator needs to be more flexible and more dynamic — I shall be able to
  // reorganize also the rooms on the plan view — draw them etc."*
  //
  // ⭐ WHAT THIS IS, AND — SO NOBODY READS MORE INTO IT — WHAT IT IS NOT. §ROOM-PIN gave him the
  // ORDER. This gives him the FOOTPRINT, in the one currency the solver can keep: a party wall is
  // dragged, and the area that crosses it moves from one room's target to the other's. It is NOT a
  // freehand boundary tool. `solveProgrammeLayout` PARTITIONS a plate — a cell's ring is a pure
  // function of the areas and the order — so an arbitrary authored ring has no representation in
  // its output at all: storing one would either be re-solved away on the user's next keystroke
  // (the exact defect L-13079 names) or require replacing the solver. `RoomProgrammeEntry.
  // pinnedOrder` records the same argument for why a pin is an ordinal and not an `{x,z}`.
  //
  // ⛔ THE AREAS ARE THE TRUTH, THE WALL IS THE CONSEQUENCE. C06 §13.3 has one producer per live
  // figure: `targetAreaM2` in the session brief, shown on the room list, is the number this drag
  // moves — the same number, not a second copy — and the plan the user then sees is the SOLVER's
  // answer for those areas. The ghost line follows the pointer during the gesture; it is a
  // proposal, and the hint text says so rather than implying the wall lands under the cursor.
  //
  // ⛔ ONE GESTURE, ONE INTENT. Every pointer move recomputes a CANDIDATE and writes nothing; the
  // single `programme.resize-pair` is dispatched on release. Two `programme.set-area`s would
  // re-solve the plate between them, with one room grown and the other not yet shrunk.
  //
  // ⚠ AND, EXACTLY AS §ROOM-PIN STATES: this writes the session BRIEF through
  // `applyRoomProgrammeIntent`, not the bus. `roomProgrammeModel.ts`'s header argues P6 in full —
  // a programme is a brief, not a domain store, and the bus is reached by "Place envelopes in
  // 3D" (C114 §6a, one `spaceEnvelope.batch.create`). ⭐ AND SINCE §ROOM-BRIEF-UNDO (L-13120) a
  // wall drag IS undoable — one drag, one step, by the same argument that makes it one intent.

  /** A wall drag in flight. `null` between gestures. */
  let seamDrag: {
    readonly seam: ProgrammeRoomSeam;
    readonly aArea0: number;
    readonly bArea0: number;
    readonly clientX0: number;
    readonly clientY0: number;
    /** World metres per client pixel, per axis — measured ONCE, at pointerdown. */
    readonly mPerPxX: number;
    readonly mPerPxZ: number;
    /** Viewbox units per world metre, for moving the ghost line. */
    readonly vbPerMx: number;
    readonly vbPerMz: number;
    readonly line: SVGLineElement;
  } | null = null;

  /**
   * The candidate areas for a pointer at `(clientX, clientY)`.
   *
   * ⭐ THE ROUNDING IS DELIBERATE AND ONE-SIDED. `aNew` is rounded to a centimetre-squared and
   * `bNew` is DERIVED BY SUBTRACTION from the pair's untouched sum, so the conservation invariant
   * `describePairResize` enforces survives the rounding exactly. Rounding both independently would
   * leak up to 0.01 m² per drag into (or out of) the programme — a wall move that quietly changes
   * how much floor the brief asks for.
   */
  function seamCandidate(d: NonNullable<typeof seamDrag>, clientX: number, clientY: number): {
    readonly aAreaM2: number; readonly bAreaM2: number; readonly transferM2: number; readonly offsetM: number;
  } {
    const dxM = (clientX - d.clientX0) * d.mPerPxX;
    const dzM = (clientY - d.clientY0) * d.mPerPxZ;
    // The perpendicular displacement of the wall: the pointer's travel projected onto the seam
    // normal. Motion ALONG the wall moves it nowhere, which is what a wall does.
    const offsetM = dxM * d.seam.normal.x + dzM * d.seam.normal.z;
    const transferM2 = offsetM * d.seam.lengthM;
    const sum = d.aArea0 + d.bArea0;
    const aAreaM2 = Math.round((d.aArea0 + transferM2) * 100) / 100;
    return { aAreaM2, bAreaM2: sum - aAreaM2, transferM2, offsetM };
  }

  /**
   * Say what this candidate would do — or why it will be refused, with BOTH numbers and the way
   * out. Called on every move so the limit is met while dragging, not discovered on release.
   *
   * ⛔ THE VERDICT IS `describePairResize`'s, NOT A SECOND READING OF THE SAME RULES (C84 EI-8a).
   * A panel that re-derives "is this allowed?" beside the reducer that decides it is how a
   * control comes to say one thing and do another.
   */
  function seamMessage(
    d: NonNullable<typeof seamDrag>,
    cand: { readonly aAreaM2: number; readonly bAreaM2: number; readonly transferM2: number },
    aName: string,
    bName: string,
  ): { readonly text: string; readonly refusal: boolean } {
    const v = describePairResize(getRoomProgramme(), d.seam.aId, cand.aAreaM2, d.seam.bId, cand.bAreaM2);
    if (v.ok) {
      return {
        text: `${aName} ${cand.aAreaM2.toFixed(2)} m² · ${bName} ${cand.bAreaM2.toFixed(2)} m² — `
          + `${Math.abs(cand.transferM2).toFixed(2)} m² moved across a ${d.seam.lengthM.toFixed(2)} m wall. `
          + 'Release to keep it.',
        refusal: false,
      };
    }
    if (v.code === 'below-minimum') {
      // C83 §1.2 — BOTH numbers, and then L-942's escape hatch: the largest move that IS allowed,
      // stated as a number he can actually drag to. A refusal whose yes-branch is unreachable is
      // a regression with a citation attached.
      const hatch = v.maxTransferM2 > 0
        ? `The most ${(v.offenderName ?? 'it')} can give up is ${v.maxTransferM2.toFixed(2)} m² — drag back to there and it is yours.`
        : `${v.offenderName ?? 'It'} is already at its floor, so this wall cannot move that way at `
          + 'all. Raise its area in the list, or give the space to a different neighbour.';
      return {
        text: `${v.offenderName} cannot go to ${(v.askedAreaM2 ?? 0).toFixed(2)} m²: PRYZM's floor for `
          + `that room is ${(v.floorAreaM2 ?? 0).toFixed(2)} m². Nothing was clamped. ${hatch}`,
        refusal: true,
      };
    }
    return {
      text: `That wall move was refused (${v.code ?? 'unknown'}) and nothing changed.`,
      refusal: true,
    };
  }

  /** Write the status line WITHOUT a re-render — a repaint mid-gesture would destroy the ghost. */
  function sayLive(text: string, refusal: boolean): void {
    say(text, refusal);
    const st = root.querySelector<HTMLElement>(`[data-testid="${ROOM_PROGRAMME_STATUS_TESTID}"]`);
    if (st) {
      st.textContent = text;
      st.style.color = refusal ? '#8a5a00' : '';
    }
  }

  /**
   * The MOVE and RELEASE halves, installed once on the `<svg>`.
   *
   * ⛔ ON THE ROOT, FOR THE REASON `wireReorderRelease` STATES: without pointer capture a browser
   * fires `pointermove` / `pointerup` at the element under the pointer, which during a wall drag
   * is whatever cell the wall has been pulled over — never the line the gesture began on.
   */
  function wireSeamDragRoot(svg: SVGSVGElement, layout: ProgrammeLayout): void {
    const nameOf = new Map(layout.cells.map((c) => [c.roomId, c.name] as const));
    svg.addEventListener('pointermove', (ev) => {
      const d = seamDrag;
      if (!d) return;
      const e = ev as PointerEvent;
      const cand = seamCandidate(d, e.clientX, e.clientY);
      // The ghost, moved along the normal by the SAME offset the arithmetic used.
      const tx = cand.offsetM * d.seam.normal.x * d.vbPerMx;
      const tz = cand.offsetM * d.seam.normal.z * d.vbPerMz;
      d.line.setAttribute('transform', `translate(${tx.toFixed(3)} ${tz.toFixed(3)})`);
      const m = seamMessage(d, cand, nameOf.get(d.seam.aId) ?? d.seam.aId, nameOf.get(d.seam.bId) ?? d.seam.bId);
      d.line.setAttribute('stroke', m.refusal ? '#c2410c' : '#6600FF');
      sayLive(m.text, m.refusal);
    });
    svg.addEventListener('pointerup', (ev) => {
      const d = seamDrag;
      seamDrag = null;
      if (!d) return;
      const e = ev as PointerEvent;
      const cand = seamCandidate(d, e.clientX, e.clientY);
      const aName = nameOf.get(d.seam.aId) ?? d.seam.aId;
      const bName = nameOf.get(d.seam.bId) ?? d.seam.bId;
      // A wall released where it was grabbed is a CANCEL — the same rule §ROOM-PIN states for a
      // release on the cell the drag started from. `render()` still runs, to drop the ghost.
      if (cand.aAreaM2 === d.aArea0) { render(); return; }
      const changed = applyRoomProgrammeIntent({
        type: 'programme.resize-pair',
        aId: d.seam.aId, aAreaM2: cand.aAreaM2,
        bId: d.seam.bId, bAreaM2: cand.bAreaM2,
      });
      const m = seamMessage(d, cand, aName, bName);
      if (changed) {
        pendingReplace = null;
        say(
          `${aName} is now ${cand.aAreaM2.toFixed(2)} m² and ${bName} ${cand.bAreaM2.toFixed(2)} m² — `
          + `${Math.abs(cand.transferM2).toFixed(2)} m² moved across the wall between them. The plan `
          + 'is re-solved from those two areas, so the wall lands where they put it. Press Undo — '
          + 'Ctrl+Z — to put both areas back where they were.',
          false);
      } else {
        // ⛔ SPOKEN, NEVER SWALLOWED. A drag that appears to do nothing is the "did my change
        // save?" failure this lane exists to remove.
        say(m.text, true);
      }
      // ⛔ RENDERED ON BOTH ARMS — the refusal is the thing the user most needs to see, and it
      // lives in the status line this repaint writes.
      render();
    });
    // Leaving the strip mid-drag abandons the gesture, so a release elsewhere on the page cannot
    // complete a move the user walked away from. The ghost goes with the repaint.
    svg.addEventListener('pointerleave', () => {
      if (!seamDrag) return;
      seamDrag = null;
      render();
    });
  }

  /**
   * Draw one draggable handle per party wall.
   *
   * ⛔ THE LINES ARE SIBLINGS OF THE CELL GROUPS, NOT CHILDREN. A handle inside a cell group would
   * make its `pointerdown` bubble through that group's §ROOM-PIN reorder listener, so one press
   * would start two gestures with one pointer.
   */
  function drawSeams(
    svg: SVGSVGElement,
    layout: ProgrammeLayout,
    sx: (v: number) => number,
    sz: (v: number) => number,
    vbPerMx: number,
    vbPerMz: number,
    W: number,
  ): void {
    const nameOf = new Map(layout.cells.map((c) => [c.roomId, c.name] as const));
    const areaOf = new Map(getRoomProgramme().entries.map((e) => [e.id, e.targetAreaM2] as const));
    for (const seam of programmeSharedWalls(layout.cells)) {
      const aArea0 = areaOf.get(seam.aId);
      const bArea0 = areaOf.get(seam.bId);
      // A wall whose rooms are not both in the brief cannot be moved in the brief's currency.
      if (aArea0 === undefined || bArea0 === undefined) continue;
      const line = svgEl('line');
      line.setAttribute('x1', sx(seam.from.x).toFixed(2));
      line.setAttribute('y1', sz(seam.from.z).toFixed(2));
      line.setAttribute('x2', sx(seam.to.x).toFixed(2));
      line.setAttribute('y2', sz(seam.to.z).toFixed(2));
      line.setAttribute('stroke', '#6600FF');
      line.setAttribute('stroke-opacity', '0.45');
      // Fat enough to grab. The visible weight is the opacity, not the width — a 6-unit purple
      // bar over every party wall would read as a drawn wall the product had decided on.
      line.setAttribute('stroke-width', '5');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute(ROOM_SEAM_A_ATTR, seam.aId);
      line.setAttribute(ROOM_SEAM_B_ATTR, seam.bId);
      line.setAttribute(ROOM_SEAM_LENGTH_ATTR, seam.lengthM.toFixed(3));
      line.setAttribute(ROOM_SEAM_NORMAL_ATTR, `${seam.normal.x.toFixed(6)},${seam.normal.z.toFixed(6)}`);
      line.style.cursor = 'move';
      const t = svgEl('title');
      t.textContent =
        `The wall between ${nameOf.get(seam.aId) ?? seam.aId} and ${nameOf.get(seam.bId) ?? seam.bId} — `
        + `${seam.lengthM.toFixed(2)} m long. Drag it to move floor area from one to the other; `
        + 'every centimetre across it is ' + seam.lengthM.toFixed(2) + ' m² per metre.';
      line.appendChild(t);
      line.addEventListener('pointerdown', (ev) => {
        const e = ev as PointerEvent;
        const rect = svg.getBoundingClientRect();
        // ⛔ AN UNMEASURABLE SURFACE REFUSES THE GESTURE RATHER THAN GUESSING A SCALE. A zero-width
        // rect (the panel is display:none, or laid out at zero) would make every pixel of travel
        // an infinite number of metres; saying so beats committing one.
        if (!(rect.width > 0)) {
          sayLive('This plan is not laid out yet, so PRYZM cannot tell how far you dragged. '
            + 'Open the panel fully and try again — nothing was changed.', true);
          return;
        }
        // Client px → viewBox units → world metres. `preserveAspectRatio` is the default, so ONE
        // factor serves both axes; the per-axis world scales then differ because the strip's
        // height is clamped to [120, 280] and the viewBox aspect is not the plate's.
        const vbPerPx = W / rect.width;
        seamDrag = {
          seam,
          aArea0: areaOf.get(seam.aId)!,
          bArea0: areaOf.get(seam.bId)!,
          clientX0: e.clientX,
          clientY0: e.clientY,
          mPerPxX: vbPerPx / vbPerMx,
          mPerPxZ: vbPerPx / vbPerMz,
          vbPerMx,
          vbPerMz,
          line,
        };
      });
      svg.appendChild(line);
    }
  }

  // ── §ROOM-DRAW-NEW (L-13120) — DRAWING A ROOM THAT DOES NOT EXIST YET ──────
  //
  // Founder: *"This room locator needs to be more flexible and more dynamic — I shall be able to
  // reorganize also the rooms on the plan view — draw them etc."*
  //
  // ⭐ THE THIRD AND LAST OF THE THREE GESTURES, AND THE ONLY ONE THAT CREATES. §ROOM-PIN moves a
  // room in the ORDER; §ROOM-WALL-DRAG moves the WALL between two rooms that already exist; this
  // one draws a room that does not. Together they are what *"reorganize … draw them"* asks for,
  // in the three currencies `solveProgrammeLayout` can actually keep.
  //
  // ⛔ THE DECISION IS NOT THE GESTURE, IT IS WHAT HAPPENS WHEN THE SHAPE IS WRONG, and every one
  // of those decisions lives in `roomDrawPlan.ts` — read its header for the taxonomy and the
  // argument. This file draws a rubber band, converts pixels to metres, and dispatches the intent
  // THAT MODULE RETURNS. It never builds an intent of its own, so it cannot authorise a drawing
  // the verdict refused (C84 EI-8a, taken past discipline to a mechanism).
  //
  // ⚠ AND THE SAME HONESTY THE OTHER TWO CARRY: the rectangle is how the user SAYS an area and a
  // position. It is not a boundary that gets stored — the solver partitions the plate, so the
  // room lands where its area and its position put it. The hint text says exactly that, because a
  // control that looks live and is not is the one outcome this lane was told to avoid.

  /** The kind the next drawn rectangle becomes. */
  let drawKind: ResidentialRoomKind = RESIDENTIAL_ROOM_LIBRARY[0]?.kind ?? 'bedroom';
  /** Is the draw gesture armed? A mode the user cannot see is a trap, so the button shows it. */
  let drawArmed = false;

  /** A drawing in flight. `null` between gestures. */
  let drawDrag: {
    readonly startX: number;
    readonly startZ: number;
    readonly rectEl: SVGRectElement;
    /** Client px → world metres on the level's plane. Captured at pointerdown, never re-read. */
    readonly unproject: (clientX: number, clientY: number) => { readonly x: number; readonly z: number };
    /** World metres → viewBox units, for painting the band where the pointer actually is. */
    readonly project: (x: number, z: number) => { readonly sx: number; readonly sz: number };
    readonly levelRing: readonly EnvelopePoint[];
    readonly layout: ProgrammeLayout;
    /** The last verdict, so RELEASE dispatches the very thing MOVE was describing. */
    verdict: DrawnRoomVerdict | null;
  } | null = null;

  /**
   * Ask the ONE asker about the rectangle between the drag's origin and this pointer.
   *
   * ⛔ THE ID IS MINTED PER CALL AND MOSTLY THROWN AWAY, WHICH IS CORRECT AND CHEAP. `mintId` is a
   * pure counter/uuid supplied by the caller (C16 CA-2); the verdict needs an id because it
   * REDUCES the real intent to find out what would happen, and a reducer that had to invent one
   * would be minting inside a pure function. Only the id on the verdict the user RELEASES on is
   * ever dispatched.
   */
  function drawVerdict(d: NonNullable<typeof drawDrag>, clientX: number, clientY: number): DrawnRoomVerdict {
    const p = d.unproject(clientX, clientY);
    return describeDrawnRoom({
      levelRing: d.levelRing,
      programme: getRoomProgramme(),
      layout: d.layout,
      kind: drawKind,
      rect: { x0: d.startX, z0: d.startZ, x1: p.x, z1: p.z },
      id: deps.mintId('room'),
    });
  }

  /** Paint the band, and let it carry its own verdict so a spec can read the decision off it. */
  function paintDrawBand(d: NonNullable<typeof drawDrag>, clientX: number, clientY: number, v: DrawnRoomVerdict): void {
    const p = d.unproject(clientX, clientY);
    const a = d.project(Math.min(d.startX, p.x), Math.min(d.startZ, p.z));
    const b = d.project(Math.max(d.startX, p.x), Math.max(d.startZ, p.z));
    d.rectEl.setAttribute('x', a.sx.toFixed(2));
    d.rectEl.setAttribute('y', a.sz.toFixed(2));
    d.rectEl.setAttribute('width', Math.max(0, b.sx - a.sx).toFixed(2));
    d.rectEl.setAttribute('height', Math.max(0, b.sz - a.sz).toFixed(2));
    d.rectEl.setAttribute('stroke', v.ok ? '#6600FF' : '#c2410c');
    d.rectEl.setAttribute('fill', v.ok ? '#6600FF' : '#c2410c');
    d.rectEl.setAttribute(ROOM_DRAW_AREA_ATTR, v.drawnAreaM2.toFixed(3));
    d.rectEl.setAttribute(ROOM_DRAW_VERDICT_ATTR, v.ok ? 'ok' : (v.code ?? 'refused'));
  }

  /**
   * The three halves of the gesture, installed on the `<svg>` root.
   *
   * ⛔ POINTERDOWN IS ON THE ROOT IN THE **CAPTURE** PHASE, AND THAT IS THE WHOLE ARBITRATION
   * BETWEEN THREE GESTURES SHARING ONE POINTER. The cells carry §ROOM-PIN's reorder listener and
   * the party walls carry §ROOM-WALL-DRAG's, both in the bubble phase on descendants. A capture
   * listener on the root runs BEFORE either, so `stopPropagation()` there means an ARMED draw
   * starts exactly one gesture — and a DISARMED one is invisible to the other two, which keep
   * working untouched. Arbitrating in the descendants instead would have put "is draw mode on?"
   * in three places.
   *
   * ⛔ MOVE AND UP ARE ON THE ROOT FOR THE REASON THE OTHER TWO STATE: without pointer capture the
   * browser fires them at whatever element is under the pointer, which during a drawing is
   * whichever cell the band has been pulled across — never the surface the gesture began on.
   */
  function wireDrawRoot(
    svg: SVGSVGElement,
    layout: ProgrammeLayout,
    levelRing: readonly EnvelopePoint[],
    sx: (v: number) => number,
    sz: (v: number) => number,
    x0: number,
    z0: number,
    vbPerMx: number,
    vbPerMz: number,
    W: number,
  ): void {
    svg.addEventListener('pointerdown', (ev) => {
      if (!drawArmed || drawDrag) return;
      const e = ev as PointerEvent;
      const rect = svg.getBoundingClientRect();
      // ⛔ AN UNMEASURABLE SURFACE REFUSES THE GESTURE RATHER THAN GUESSING A SCALE — the rule
      // `drawSeams` states. A zero-width rect makes every pixel of travel an infinite number of
      // metres, and a room drawn from that number would be a fabrication.
      if (!(rect.width > 0)) {
        sayLive('This plan is not laid out yet, so PRYZM cannot tell where you drew. Open the '
          + 'panel fully and try again — nothing was changed.', true);
        return;
      }
      // ⛔ ONE POINTER, ONE GESTURE. See the block comment above.
      e.stopPropagation();
      e.preventDefault();
      // Client px → viewBox units → world metres. ONE factor for both axes, exactly as the seam
      // drag measures it: `preserveAspectRatio` is the default, so the viewBox maps uniformly.
      const vbPerPx = W / rect.width;
      const unproject = (cx: number, cy: number): { readonly x: number; readonly z: number } => ({
        x: ((cx - rect.left) * vbPerPx - 4) / vbPerMx + x0,
        z: ((cy - rect.top) * vbPerPx - 4) / vbPerMz + z0,
      });
      const start = unproject(e.clientX, e.clientY);
      const rectEl = svgEl('rect');
      rectEl.setAttribute(ROOM_DRAW_RECT_ATTR, '1');
      rectEl.setAttribute('fill-opacity', '0.18');
      rectEl.setAttribute('stroke-width', '1.4');
      rectEl.setAttribute('stroke-dasharray', '4 3');
      rectEl.style.pointerEvents = 'none';
      svg.appendChild(rectEl);
      drawDrag = {
        startX: start.x,
        startZ: start.z,
        rectEl,
        unproject,
        project: (x, z) => ({ sx: sx(x), sz: sz(z) }),
        levelRing,
        layout,
        verdict: null,
      };
      const v = drawVerdict(drawDrag, e.clientX, e.clientY);
      paintDrawBand(drawDrag, e.clientX, e.clientY, v);
      drawDrag.verdict = v;
    }, true);

    svg.addEventListener('pointermove', (ev) => {
      const d = drawDrag;
      if (!d) return;
      const e = ev as PointerEvent;
      const v = drawVerdict(d, e.clientX, e.clientY);
      d.verdict = v;
      paintDrawBand(d, e.clientX, e.clientY, v);
      // ⛔ THE LIMIT IS MET WHILE DRAWING, NOT DISCOVERED ON RELEASE — the rule the wall drag set.
      sayLive(v.statement, !v.ok);
    });

    svg.addEventListener('pointerup', (ev) => {
      const d = drawDrag;
      drawDrag = null;
      if (!d) return;
      const e = ev as PointerEvent;
      const v = drawVerdict(d, e.clientX, e.clientY);
      if (!v.ok || !v.intent) {
        // ⛔ SPOKEN, NEVER SWALLOWED, AND THE ARM STAYS ON. §REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH
        // (L-942): the verdict's statement always ends in a reachable way out, and leaving the
        // gesture armed puts that way out exactly one drag away instead of behind a second click.
        say(v.statement, true);
        render();
        return;
      }
      const changed = applyRoomProgrammeIntent(v.intent);
      if (!changed) {
        // The reducer and the verdict disagreed. Say so; never pretend a room was added.
        say('PRYZM could not add that room and nothing changed. This is a gap in the drawing '
          + 'check, not a statement about your rectangle.', true);
        render();
        return;
      }
      pendingReplace = null;
      // ⭐ ONE GESTURE, ONE INTENT, ONE SENTENCE — and the sentence is the OUTCOME, not the
      // request: `pinnedOrder` is read back off the verdict, which read it off the reduced state,
      // so a pin the drawing asked for and did not get is reported as not got.
      const seat = v.pinnedOrder !== null
        ? `at position ${v.pinnedOrder + 1}, where you drew it`
        : 'in the position the graph gives it — drag it onto another room to pin it there';
      say(
        `Added a ${residentialRoomEntry(drawKind)?.label.toLowerCase() ?? drawKind} of `
        + `${v.drawnAreaM2.toFixed(2)} m², ${seat}. It came out of the `
        + `${v.freeAreaM2.toFixed(2)} m² this storey had unallocated, leaving `
        + `${(v.freeAreaM2 - v.drawnAreaM2).toFixed(2)} m². The plan is re-solved from that area `
        + 'and that position, so the room lands where they put it rather than on the rectangle '
        + 'you drew. Press Undo — Ctrl+Z — to take the room back out.',
        false);
      // ⛔ DISARMED ON SUCCESS. A drawing mode that silently stays on turns the user's next click
      // — a click meant to select a room — into a refusal about a zero-area rectangle.
      drawArmed = false;
      render();
    });

    svg.addEventListener('pointerleave', () => {
      if (!drawDrag) return;
      drawDrag = null;
      render();
    });
  }

  /** The arm: a toggle and the kind it will draw. Rendered under the plan it acts on. */
  function drawArmControls(enabled: boolean, freeAreaM2: number): HTMLElement {
    const wrap = el('div', 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px;');
    const btn = el('button');
    btn.type = 'button';
    btn.setAttribute('data-testid', ROOM_DRAW_TOGGLE_TESTID);
    btn.setAttribute('aria-pressed', drawArmed ? 'true' : 'false');
    btn.disabled = !enabled;
    btn.textContent = drawArmed ? 'Drawing — drag on the plan' : 'Draw a room';
    btn.style.cssText = [
      'padding:4px 9px', 'border-radius:6px', 'font-size:11px', 'font-weight:600',
      enabled ? 'cursor:pointer' : 'cursor:not-allowed',
      drawArmed ? 'background:#6600FF;color:#fff;border:none'
        : 'background:var(--app-surface,#fff);color:var(--app-text,#22223a);border:1px solid var(--app-border,#dde3ef)',
    ].join(';');
    // ⛔ AN UNAVAILABLE ACTION RENDERS WITH ITS REASON PRINTED — the §SiteEntryPanel idiom this
    // file already follows for "Place envelopes in 3D". A greyed control with no reason is a
    // dead end the user has to guess at.
    btn.title = enabled
      ? 'Arm the gesture, then drag a rectangle on the plan. Its AREA becomes the room\'s target '
        + 'and where you drew it decides its position — the plan then re-solves, so the room lands '
        + 'where those two put it, not on the rectangle.'
      : `This storey has ${freeAreaM2.toFixed(2)} m² unallocated, which is less than the floor of `
        + 'the smallest room in the library — there is nothing left to draw into. Shrink a room in '
        + 'the list, drag a party wall, or grow the level envelope first.';
    btn.addEventListener('click', () => {
      drawArmed = !drawArmed;
      if (!drawArmed) drawDrag = null;
      say(drawArmed
        ? `Drawing a ${residentialRoomEntry(drawKind)?.label.toLowerCase() ?? drawKind}: drag a `
          + `rectangle on the plan. There is ${freeAreaM2.toFixed(2)} m² unallocated on this `
          + 'storey, and a drawn room takes its floor from that — never from its neighbours.'
        : 'Drawing off. The plan\'s rooms and party walls are draggable again.', false);
      render();
    });
    wrap.appendChild(btn);

    const sel = el('select');
    sel.setAttribute('data-testid', ROOM_DRAW_KIND_TESTID);
    sel.style.cssText = 'font-size:11px;padding:3px 5px;border-radius:6px;'
      + 'border:1px solid var(--app-border,#dde3ef);background:var(--app-surface,#fff);color:var(--app-text,#22223a);';
    sel.title = 'The kind of room the next rectangle becomes. Its floor is what a too-small '
      + 'rectangle is refused against.';
    for (const entry of RESIDENTIAL_ROOM_LIBRARY) {
      const opt = el('option');
      opt.value = entry.kind;
      opt.textContent = `${entry.label} — min ${entry.minAreaM2} m²`;
      if (entry.kind === drawKind) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      if (isResidentialRoomKind(sel.value)) drawKind = sel.value;
      render();
    });
    wrap.appendChild(sel);
    return wrap;
  }

  // ── PLAN PREVIEW + LEGEND ──────────────────────────────────────────────────

  function renderPreview(
    layout: ProgrammeLayoutResult,
    levelRing: readonly EnvelopePoint[] | null,
  ): void {
    const box = el('div');
    box.setAttribute('data-testid', ROOM_PROGRAMME_PREVIEW_TESTID);
    box.appendChild(el('div', LABEL_CSS, 'Plan — solved from the graph'));

    if (!layout.ok) {
      // ⭐ THE REFUSAL IS THE PRODUCT. Verbatim, both numbers included where there are two.
      const p = el('p',
        `${NOTE_CSS}color:#8a5a00;background:#fff8e6;border:1px solid #f0d9a0;border-radius:6px;padding:6px;`,
        layout.statement);
      p.setAttribute('data-refusal-code', layout.code);
      box.appendChild(p);
      slots.preview.replaceChildren(box);
      return;
    }

    const all = [...layout.cells.map((c) => c.ring), ...(layout.residualRing ? [layout.residualRing] : [])];
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
    for (const r of all) for (const q of r) {
      if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
      if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z;
    }
    const spanX = Math.max(1e-6, x1 - x0);
    const spanZ = Math.max(1e-6, z1 - z0);
    const W = 300;
    const H = Math.max(120, Math.min(280, Math.round((W * spanZ) / spanX)));
    // §ROOM-WALL-DRAG — the two scales the drag inverts, named where they are decided rather
    // than re-derived in the gesture. They DIFFER whenever `H`'s clamp bites, so a wall drag has
    // to project on both axes; one uniform factor would mis-measure every non-axis-aligned wall.
    const vbPerMx = (W - 8) / spanX;
    const vbPerMz = (H - 8) / spanZ;
    const sx = (v: number): number => (v - x0) * vbPerMx + 4;
    const sz = (v: number): number => (v - z0) * vbPerMz + 4;

    const svg = svgEl('svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label',
      `Plan of ${layout.cells.length} room envelopes inside a ${layout.levelAreaM2.toFixed(0)} square metre level envelope.`);
    svg.style.cssText = `${CARD_CSS}display:block;`;
    makeDropTarget(svg);
    // §ROOM-PIN (L-13079) — the release half of the reorder gesture. One listener, on the root.
    wireReorderRelease(svg);
    // §ROOM-WALL-DRAG (L-13096) — the move + release halves of the wall gesture. Also on the root,
    // and for the same reason: the pointer leaves the line the moment the wall starts moving.
    wireSeamDragRoot(svg, layout);
    // §ROOM-DRAW-NEW (L-13120) — the third gesture. Its pointerdown is on the root in the CAPTURE
    // phase, which is what keeps one pointer press from starting two of these three at once; see
    // `wireDrawRoot` for why the arbitration lives there and not in the three descendants.
    if (levelRing) {
      wireDrawRoot(svg, layout, levelRing, sx, sz, x0, z0, vbPerMx, vbPerMz, W);
    }

    const drawRing = (
      ring: readonly { x: number; z: number }[],
      fill: string,
      opacity: string,
    ): SVGPolygonElement => {
      const poly = svgEl('polygon');
      poly.setAttribute('points', ring.map((q) => `${sx(q.x).toFixed(2)},${sz(q.z).toFixed(2)}`).join(' '));
      poly.setAttribute('fill', fill);
      poly.setAttribute('fill-opacity', opacity);
      poly.setAttribute('stroke', '#3a3a52');
      poly.setAttribute('stroke-width', '0.8');
      return poly;
    };

    if (layout.residualRing) {
      const r = drawRing(layout.residualRing, '#E0E0E0', '0.5');
      const t = svgEl('title');
      t.textContent = `Unallocated — ${layout.residualAreaM2.toFixed(2)} m² of this storey has no room on it.`;
      r.appendChild(t);
      svg.appendChild(r);
    }
    // §ROOM-PIN (L-13079) — the pins as the PROGRAMME holds them, so the strip can mark a
    // pinned cell without re-deciding anything the solver already decided.
    const pinnedOf = new Map(
      getRoomProgramme().entries.map((e) => [e.id, e.pinnedOrder] as const),
    );
    layout.cells.forEach((c, i) => {
      // ⭐ ONE GROUP PER ROOM, CARRYING THE IDENTITY. `layout.cells[i].roomId === layout.order[i]`
      // by construction in `solveProgrammeLayout` (the cells are built by walking `order`), so
      // the index IS the position a pin is written in — no second derivation, no lookup that
      // could disagree. The group wraps the polygon AND its two labels, so a pointer landing on
      // the room's own name is the same gesture as one landing on its floor.
      const g = svgEl('g');
      const isPinned = pinnedOf.get(c.roomId) !== undefined;
      g.setAttribute(ROOM_CELL_ID_ATTR, c.roomId);
      g.setAttribute(ROOM_CELL_ORDER_ATTR, String(i));
      if (isPinned) g.setAttribute(ROOM_CELL_PINNED_ATTR, '1');
      g.style.cursor = 'grab';
      const poly = drawRing(c.ring, libraryColourFor(c.kind), '0.85');
      poly.setAttribute(ROOM_CELL_ID_ATTR, c.roomId);
      if (isPinned) {
        // A pinned cell is DRAWN as pinned. A held position the user cannot see is a promise
        // he has to remember, and the next re-solve looks like the pin failed.
        poly.setAttribute('stroke', '#6600FF');
        poly.setAttribute('stroke-width', '1.6');
      }
      const t = svgEl('title');
      t.textContent =
        `${c.name} — ${c.areaM2.toFixed(2)} m² (asked for ${c.targetAreaM2.toFixed(2)} m²). `
        + (isPinned
          ? `Pinned to position ${i + 1} — drag it onto another room to move it, or double-click `
            + 'to hand it back to the solver.'
          : `Position ${i + 1}, chosen by the solver. Drag it onto another room to pin it there.`);
      poly.appendChild(t);
      g.appendChild(poly);
      let cx = 0; let cz = 0;
      for (const q of c.ring) { cx += q.x; cz += q.z; }
      cx /= c.ring.length; cz /= c.ring.length;
      const lab = svgEl('text');
      lab.setAttribute('x', String(sx(cx)));
      lab.setAttribute('y', String(sz(cz)));
      lab.setAttribute('text-anchor', 'middle');
      lab.setAttribute('font-size', '8');
      lab.setAttribute('fill', '#22223a');
      lab.textContent = isPinned ? `${c.name} 📌` : c.name;
      g.appendChild(lab);
      const ar = svgEl('text');
      ar.setAttribute('x', String(sx(cx)));
      ar.setAttribute('y', String(sz(cz) + 9));
      ar.setAttribute('text-anchor', 'middle');
      ar.setAttribute('font-size', '7');
      ar.setAttribute('fill', '#5a5a72');
      ar.textContent = `${c.areaM2.toFixed(1)} m²`;
      g.appendChild(ar);
      wireCellReorder(g, c.roomId, c.name, i);
      svg.appendChild(g);
    });
    // §ROOM-WALL-DRAG (L-13096) — LAST, so the handles sit above the fills they separate.
    drawSeams(svg, layout, sx, sz, vbPerMx, vbPerMz, W);
    box.appendChild(svg);
    box.appendChild(el(
      'div',
      `${NOTE_CSS}margin-top:4px;`,
      'Drag a room onto another to move it there — it stays pinned (📌) while everything '
      + 'unpinned re-solves around it. Double-click a pinned room to hand it back to the solver. '
      // ⛔ THE SECOND SENTENCE IS THE HONEST ONE, AND IT IS NOT OPTIONAL. The ghost line follows
      // the pointer; the WALL lands where the plan re-solves it for the two areas the drag set.
      // Saying the wall goes where you drop it would be a control that looks live and is not.
      + 'Drag the purple line between two rooms to move floor area across that wall: the two '
      + 'areas change by exactly what crosses it, and the plan re-solves from them — so the wall '
      + 'lands where those areas put it, not under the cursor. '
      // §ROOM-DRAW-NEW (L-13120) — the third sentence, and it makes the same admission as the
      // second, for the same reason: a rectangle is how you SAY an area and a position, not a
      // boundary that gets kept. Promising otherwise would be a control that looks live and is not.
      + 'To add a room that is not there yet, press "Draw a room" and drag a rectangle on the '
      + 'plan: its AREA becomes that room\'s target and where you draw it decides its position, '
      + 'and it takes its floor from what this storey has NOT allocated — never from its '
      // §ROOM-BRIEF-UNDO (L-13120) — this sentence used to read "None of the three gestures is
      // undoable with Ctrl+Z". It was true, and it was the limit worth closing rather than
      // documenting: a gesture that cannot be taken back is one users avoid.
      + 'neighbours. All three gestures are undoable: press Undo below, or Ctrl+Z while this '
      + 'panel has focus.',
    ));
    // ⛔ THE ARM SITS UNDER THE HINT THAT EXPLAINS IT, and renders DISABLED WITH ITS REASON
    // PRINTED when the storey has less unallocated floor than the smallest room in the library —
    // a dead end named as one beats a control that arms and then refuses every rectangle drawn
    // into it (§REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH, from the other end).
    box.appendChild(drawArmControls(
      layout.levelAreaM2 - layout.programmeAreaM2 + 1e-9 >= SMALLEST_ROOM_FLOOR_M2,
      layout.levelAreaM2 - layout.programmeAreaM2,
    ));

    // ── LEGEND — STR §10 asks for colour-coded categories WITH a legend ────────
    const legend = el('div', 'display:flex;flex-wrap:wrap;gap:3px 10px;margin-top:6px;');
    legend.setAttribute('data-testid', ROOM_PROGRAMME_LEGEND_TESTID);
    const seenKinds = new Set<ResidentialRoomKind>();
    for (const c of layout.cells) {
      if (seenKinds.has(c.kind)) continue;
      seenKinds.add(c.kind);
      legend.appendChild(legendRow(libraryColourFor(c.kind),
        residentialRoomEntry(c.kind)?.label ?? c.kind,
        c.occupancy
          ? `Coloured from occupancy '${c.occupancy}' — the same palette the 3-D volume uses.`
          : 'No occupancy member exists for this room; it renders in the unclassified grey.'));
    }
    if (layout.residualRing) {
      legend.appendChild(legendRow('#E0E0E0', `Unallocated ${layout.residualAreaM2.toFixed(1)} m²`,
        'Floor area inside the level envelope that no room in the programme claims. It is not '
        + 'created as an envelope.'));
    }
    legend.appendChild(legendRow('#6600FF',
      `Level envelope ${layout.levelAreaM2.toFixed(1)} m²`,
      'The storey outline the rooms are constrained to. Not created by this panel.'));
    box.appendChild(legend);
    slots.preview.replaceChildren(box);
  }

  function legendRow(colour: string, label: string, why: string): HTMLElement {
    const row = el('span', 'display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#5a5a72;');
    row.title = why;
    row.appendChild(el('span', `width:9px;height:9px;border-radius:2px;background:${colour};border:1px solid #c9c9d6;`));
    row.appendChild(el('span', '', label));
    return row;
  }

  // ── REPORT ─────────────────────────────────────────────────────────────────

  function renderReport(layout: ProgrammeLayoutResult, p: RoomProgramme): void {
    const box = el('div');
    box.setAttribute('data-testid', ROOM_PROGRAMME_REPORT_TESTID);
    if (!layout.ok) { slots.report.replaceChildren(box); return; }
    box.appendChild(el('div', LABEL_CSS, 'What this arrangement honours'));
    const nameOf = new Map(p.entries.map((e) => [e.id, e.name]));
    if (layout.requestedCount === 0) {
      box.appendChild(el('p', NOTE_CSS,
        'No relationships are plugged in yet, so the rooms were ordered by the programme alone. '
        + 'Plug some on the graph above and the arrangement changes.'));
    } else {
      box.appendChild(el('p', NOTE_CSS,
        `${layout.satisfiedCount} of ${layout.requestedCount} relationships end up as rooms that `
        + `share at least ${(0.9).toFixed(1)} m of wall — enough for a door. The rest are listed `
        + 'below; move a face or edit a profile to close them, or accept them.'));
      for (const v of layout.adjacency) {
        if (v.satisfied) continue;
        const r = el('div', 'font-size:10.5px;color:#8a5a00;padding:1px 0;');
        r.textContent =
          `Not adjacent: ${nameOf.get(v.aId) ?? v.aId} ↔ ${nameOf.get(v.bId) ?? v.bId}`
          + (v.sharedEdgeM > 0 ? ` (they share only ${v.sharedEdgeM.toFixed(2)} m)` : ' (they do not touch)');
        box.appendChild(r);
      }
    }
    const areas = el('p', NOTE_CSS,
      `Programme ${layout.programmeAreaM2.toFixed(2)} m² of a ${layout.levelAreaM2.toFixed(2)} m² level `
      + `envelope — ${layout.residualAreaM2.toFixed(2)} m² unallocated. Rooms are drawn at the areas `
      + 'you asked for; nothing was scaled to fill the plate.');
    box.appendChild(areas);
    slots.report.replaceChildren(box);
  }

  // ── ACTIONS — the ONE dispatch ─────────────────────────────────────────────

  function renderActions(layout: ProgrammeLayoutResult): void {
    const box = el('div', 'margin-top:8px;display:flex;flex-direction:column;gap:5px;');
    box.appendChild(renderHistoryControls());
    const btn = el('button');
    btn.type = 'button';
    btn.setAttribute('data-testid', ROOM_PROGRAMME_PLACE_BTN_TESTID);
    const enabled = layout.ok && layout.cells.length > 0;
    btn.disabled = !enabled;
    btn.textContent = pendingReplace ? 'Replace the room envelopes on this level' : 'Place envelopes in 3D';
    btn.style.cssText = [
      'padding:6px 10px', 'border-radius:6px', 'font-size:11.5px', 'font-weight:600',
      enabled ? 'cursor:pointer' : 'cursor:not-allowed',
      enabled ? 'background:#6600FF' : 'background:#c9c9d6',
      'color:#fff', 'border:none',
    ].join(';');
    // §SiteEntryPanel idiom — an unavailable action renders greyed WITH its reason printed.
    btn.title = enabled
      ? 'Creates one room envelope per room, in a single command — one Ctrl+Z removes them all.'
      : (layout.ok ? 'Nothing to place.' : layout.statement);
    btn.addEventListener('click', () => { place(layout); });
    box.appendChild(btn);

    const st = el('p', `${NOTE_CSS}margin:0;${statusIsRefusal ? 'color:#8a5a00;' : ''}`, status);
    st.setAttribute('data-testid', ROOM_PROGRAMME_STATUS_TESTID);
    box.appendChild(st);
    slots.actions.replaceChildren(box);
  }

  /**
   * §ROOM-BRIEF-UNDO (L-13120) — Undo and Redo, each NAMING what it would do.
   *
   * ⭐ THE LABEL IS THE FEATURE. `describeProgrammeIntent` derives it from the intent that made
   * the change, at the one choke point, so the button cannot promise a gesture other than the
   * one it will actually take back. A disabled control still prints its reason — the
   * §SiteEntryPanel idiom this panel uses for every other unavailable action.
   */
  function renderHistoryControls(): HTMLElement {
    const row = el('div', 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;');
    const undoLabel = peekRoomProgrammeUndo();
    const redoLabel = peekRoomProgrammeRedo();
    const make = (
      testid: string,
      text: string,
      label: string | null,
      what: 'takes back' | 'puts back',
      run: () => void,
    ): HTMLButtonElement => {
      const b = el('button') as HTMLButtonElement;
      b.type = 'button';
      b.setAttribute('data-testid', testid);
      b.textContent = text;
      b.disabled = label === null;
      b.style.cssText = [
        'padding:3px 9px', 'border-radius:6px', 'font-size:10.5px',
        'border:1px solid var(--app-border,#dde3ef)',
        'background:var(--app-surface,#fff)',
        label === null ? 'color:#a5a5b5' : 'color:#6600FF',
        label === null ? 'cursor:not-allowed' : 'cursor:pointer',
      ].join(';');
      b.title = label === null
        ? (what === 'takes back'
          ? 'Nothing to take back yet — this session\'s brief is as you found it.'
          : 'Nothing to put back — nothing has been taken back.')
        : `${what === 'takes back' ? 'Takes back' : 'Puts back'} ${label}. Ctrl+Z and Ctrl+Y do `
          + 'the same while this panel has focus.';
      b.addEventListener('click', run);
      return b;
    };
    row.appendChild(make(ROOM_PROGRAMME_UNDO_TESTID, 'Undo', undoLabel, 'takes back',
      () => { runBriefUndo('undo'); }));
    row.appendChild(make(ROOM_PROGRAMME_REDO_TESTID, 'Redo', redoLabel, 'puts back',
      () => { runBriefUndo('redo'); }));
    // ⛔ THE SUBJECT IS NAMED. Two undo stacks are in play on this screen, and a control that
    // does not say which one it drives is how a user comes to expect the wrong one.
    row.appendChild(el('span', `${NOTE_CSS}margin:0;`,
      'Undo/Redo act on the room programme — the rooms, areas, links and positions on this '
      + 'panel. Envelopes already placed in 3D are undone with Ctrl+Z in the scene.'));
    return row;
  }

  function say(text: string, refusal: boolean): void {
    status = text;
    statusIsRefusal = refusal;
  }

  function place(layout: ProgrammeLayoutResult): void {
    if (!layout.ok) { say(layout.statement, true); render(); return; }
    const records = safe(() => deps.readSpaceEnvelopes(), [] as readonly SpaceEnvelopeRecordLike[]);
    // §ROOM-PROGRAMME-TARGET — the SAME call `render()` makes, so what is placed is what is on screen.
    const pick = pickProgrammeHost(records, target, safe(() => deps.readActiveLevelId(), null));
    if (!pick.ok) { say(pick.statement, true); render(); return; }

    const existing = roomEnvelopesWithin(records, pick.level.id);
    if (existing.length > 0 && pendingReplace === null) {
      // ⛔ NOTHING IS REMOVED UNTIL THE COST IS STATED AND THE USER ACTS AGAIN.
      pendingReplace = existing;
      say(describeReplacement(existing) ?? '', true);
      render();
      return;
    }

    const bus = deps.resolveRuntime()?.bus;
    if (!bus || typeof bus.executeCommand !== 'function') {
      // An admission about PRYZM's wiring, never a statement about the user's project.
      say(
        'This surface has no command bus, so PRYZM cannot create the envelopes. Nothing was '
        + 'created and nothing changed — this is a gap in the wiring, not a refusal about your '
        + 'design.', true);
      pendingReplace = null;
      render();
      return;
    }

    let removed = 0;
    if (pendingReplace) {
      for (const id of pendingReplace) {
        try { bus.executeCommand('spaceEnvelope.delete', { spaceEnvelopeId: id }); removed += 1; }
        catch (e) { console.warn('[room-programme] delete failed (continuing):', e); }
      }
    }
    pendingReplace = null;

    const plan = buildRoomEnvelopePlan(
      layout, pick.level, () => deps.mintId('spaceEnvelope'), existing);
    if (!plan.ok) { say(plan.statement, true); render(); return; }
    try {
      bus.executeCommand(plan.command, plan.payload);
      // §ROOM-BRIEF-UNDO (L-13120) — these commands are on the ring buffer and are NEWER than
      // every brief edit before them, so the next `removed + 1` Ctrl+Z presses belong to them.
      // The keyboard handler declines exactly that many times; the Undo BUTTON never does,
      // because pressing a button that names the programme is the user saying which he meant.
      busUndoDebt = removed + 1;
      // ⛔ §ENVELOPE-FACE-DRAG (L-13065) — THE SENTENCE NAMES THE SURFACE, BECAUSE THE GESTURE
      // IS BOUND TO ONE. This read `"They are draggable by face and their profiles are editable
      // on double-click."` — flat, with no surface named — and that was FALSE wherever the reader
      // was standing on a SITE view. `initTools.ts:2101-2105` installs the whole gesture on
      // `world.renderer.three.domElement`, the THREE/WebGPU BIM canvas: `pointerdown`,
      // `pointermove`, `pointerup` AND the `dblclick` that opens the profile editor are all
      // registered on that one element by `installSpaceEnvelopeFaceDragOnSurface`
      // (`spaceEnvelopeDragSurface.ts`). The 3D Site (Cesium) and the 2D Site map (MapLibre) draw
      // these same envelopes from the same store — `CesiumViewport.renderSpaceEnvelopes` and
      // `SiteBoundaryMap2D.envelopeFeatureCollection` — but NO drag surface is installed on
      // either, so on those views BOTH halves of the old sentence were promises the surface could
      // not keep.
      //
      // ⛔ THE PROMISE IS NARROWED, NOT DELETED, AND THE ROUTE IS GIVEN. A capability sentence
      // that names no surface cannot be checked by the reader and cannot be falsified by a test;
      // one that names the view is true everywhere it is read and tells the user where to go.
      //
      // ⭐ WIDENED AGAIN 2026-09-07 (lane FACE-DRAG-2), IN THE COMMIT THAT LANDED THE 3D SITE
      // ADAPTER — which is precisely what the note above asked the next lane to do. The Cesium
      // adapter (`siteEnvelopeDrawCesium.ts`) now implements all four drag ports and
      // `GISAreaLayout` installs the SAME renderer-free gesture on the 3D Site canvas, so the
      // claim is true on TWO surfaces and the sentence says exactly those two.
      //
      // ⛔ THE 2D SITE MAP IS STILL EXCLUDED, AND NOT BY OVERSIGHT. A plan map has no vertical
      // axis: `spaceEnvelopeFaceAxis` gives the top and bottom faces ±Y, which no plan gesture can
      // express, so height there is a numeric field and never a drag (L-13045). Naming the two 3-D
      // views is therefore the widest sentence that is still TRUE, which is the only kind worth
      // widening to.
      say(
        (removed > 0 ? `Replaced ${removed}. ` : '')
        + `Created — ${plan.statement} To reshape them, drag a face: each one moves along its own `
        + 'perpendicular on the PRYZM 3D view and on the 3D Site view, and a double-click on PRYZM '
        + '3D opens its profile for editing. (On the 2D Site map they are drawn, not dragged — a '
        + 'plan has no height axis.)', false);
    } catch (e) {
      // The deletes DID reach the bus even though the create did not — the debt is real and is
      // exactly what the sentence below tells the user to spend.
      busUndoDebt = removed;
      say(
        `PRYZM could not create the room envelopes: ${String((e as Error)?.message ?? e)}. `
        + (removed > 0
          ? `⚠ ${removed} existing envelope${removed === 1 ? ' was' : 's were'} already removed — press `
            + 'Ctrl+Z that many times to restore them.'
          : 'Nothing was created and nothing changed.'),
        true);
    }
    render();
  }

  function safe<T>(fn: () => T, fallback: T): T {
    try { return fn(); } catch (e) {
      console.warn('[room-programme] host read failed (non-fatal):', e);
      return fallback;
    }
  }

  // ── THE RENDER ─────────────────────────────────────────────────────────────

  function render(): void {
    if (disposed) return;
    const p = getRoomProgramme();
    const records = safe(() => deps.readSpaceEnvelopes(), [] as readonly SpaceEnvelopeRecordLike[]);
    // §ROOM-PROGRAMME-TARGET — a chosen building or storey that no longer exists drops back to the
    // default for the part it lost BEFORE the pick, so the selectors never point at nothing.
    const buildings = listProgrammeBuildings(records);
    target = reconcileProgrammeTarget(target, buildings);
    const pick = pickProgrammeHost(records, target, safe(() => deps.readActiveLevelId(), null));
    const layout: ProgrammeLayoutResult = pick.ok
      ? solveProgrammeLayout({ levelRing: pick.level.footprint, programme: p })
      : { ok: false, code: 'no-level-ring', statement: pick.statement };
    // §ROOM-DRAW-NEW (L-13120) — the plate the drawing is measured against. It is the SAME ring
    // the solve above was run on, handed down rather than re-read: a gesture validated against a
    // different footprint from the one on screen would refuse legal rectangles and accept illegal
    // ones, and the two reads could differ by one store update (§25.11 clause 1).
    const drawRing = pick.ok ? pick.level.footprint : null;
    try {
      renderTarget(buildings);
      renderLibrary();
      renderGraph(p);
      renderList(p);
      renderPreview(layout, drawRing);
      renderReport(layout, p);
      renderActions(layout);
    } catch (e) {
      console.warn('[room-programme] render failed (non-fatal):', e);
    }
  }

  root.appendChild(slots.note);
  root.appendChild(slots.target);
  root.appendChild(slots.library);
  root.appendChild(slots.graph);
  root.appendChild(slots.list);
  root.appendChild(slots.preview);
  root.appendChild(slots.report);
  root.appendChild(slots.actions);
  makeDropTarget(root);
  host.appendChild(root);

  // §ROOM-BRIEF-UNDO (L-13120) — the two bindings the history needs to be reachable.
  root.addEventListener('pointerdown', onPanelPointerDown, true);
  if (typeof window !== 'undefined') window.addEventListener('keydown', onUndoKey, true);

  const unsubProgramme = subscribeRoomProgramme(() => {
    // ⭐ ANY brief change — from this panel, from an undo, from anywhere — makes the brief the
    // newest thing again, so the placement debt is paid off. One place, because the fourteen
    // dispatch sites all arrive here.
    busUndoDebt = 0;
    render();
  });
  // Re-render when the envelope store moves — the level envelope may have just been
  // created by the "Fit this on the ground floor" control on the other panel.
  let unsubStore: (() => void) | null = null;
  try {
    const slot = deps.resolveRuntime()?.stores?.['spaceEnvelope'] as DirtyStoreLike | undefined;
    if (slot && typeof slot.subscribeDirty === 'function') {
      const off = slot.subscribeDirty(() => render());
      unsubStore = typeof off === 'function' ? off : null;
    }
  } catch (e) {
    console.warn('[room-programme] envelope-store subscribe failed — the panel refreshes on edit only:', e);
  }

  // §PROJECT-ROOMS-ARE-THE-PROGRAMME (L-13024) — the ONE automatic load, before the
  // first paint, into an empty programme only. A project with rooms therefore opens
  // showing them; an empty project opens saying so.
  if (!autoLoadTried) {
    autoLoadTried = true;
    try {
      // §ROOM-BRIEF-UNDO (L-13120) — NOT undoable: see `loadProjectRooms`.
      if (getRoomProgramme().entries.length === 0) loadProjectRooms(false, false);
    } catch (e) {
      console.warn('[room-programme] project-room load failed (non-fatal):', e);
    }
  }

  render();

  return {
    element: root,
    refresh: render,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      try { unsubProgramme(); } catch { /* teardown is best-effort */ }
      try { unsubStore?.(); } catch { /* teardown is best-effort */ }
      // ⛔ THE WINDOW LISTENER OUTLIVES THE PANEL UNLESS IT IS REMOVED — and a disposed panel
      // still answering Ctrl+Z would take the keypress away from the scene for good.
      try { root.removeEventListener('pointerdown', onPanelPointerDown, true); } catch { /* best-effort */ }
      try {
        if (typeof window !== 'undefined') window.removeEventListener('keydown', onUndoKey, true);
      } catch { /* teardown is best-effort */ }
      root.remove();
    },
  };
}
