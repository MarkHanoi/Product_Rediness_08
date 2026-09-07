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
  getRoomProgramme,
  subscribeRoomProgramme,
  type RoomProgramme,
} from './roomProgrammeModel';
import {
  solveProgrammeLayout,
  type ProgrammeLayoutResult,
} from './programmeToEnvelopes';
import {
  buildRoomEnvelopePlan,
  describeReplacement,
  pickHostLevelEnvelope,
  roomEnvelopesWithin,
  type SpaceEnvelopeRecordLike,
} from './roomEnvelopePlan';
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
export const ROOM_PROGRAMME_LIST_TESTID = 'room-programme-list';
export const ROOM_PROGRAMME_PREVIEW_TESTID = 'room-programme-preview';
export const ROOM_PROGRAMME_LEGEND_TESTID = 'room-programme-legend';
export const ROOM_PROGRAMME_REPORT_TESTID = 'room-programme-report';
export const ROOM_PROGRAMME_PLACE_BTN_TESTID = 'room-programme-place';
export const ROOM_PROGRAMME_STATUS_TESTID = 'room-programme-status';
export const ROOM_PROGRAMME_SEED_BTN_TESTID = 'room-programme-seed';
/** §PROJECT-ROOMS-ARE-THE-PROGRAMME (L-13024) — "load / re-read the project's rooms". */
export const ROOM_PROGRAMME_LOAD_BTN_TESTID = 'room-programme-load-project';
export const ROOM_PROGRAMME_NODE_ATTR = 'data-room-node';
export const ROOM_PROGRAMME_EDGE_ATTR = 'data-room-edge';

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

/** The drag payload. A prefixed `text/plain` mirrors `FurnitureCarousel`'s idiom. */
export const ROOM_DRAG_MIME = 'application/x-pryzm-room-kind';
export const ROOM_DRAG_PREFIX = 'pryzm-room:';

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

const LABEL_CSS = 'font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--app-text-muted,#8a8a99);margin:10px 0 4px;';
const NOTE_CSS = 'font-size:10.5px;line-height:1.45;color:var(--app-text-muted,#77778a);margin:0 0 8px;';
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
  const root = el('div', 'display:flex;flex-direction:column;gap:2px;padding:8px;');
  root.setAttribute('data-testid', ROOM_PROGRAMME_ROOT_TESTID);

  let disposed = false;
  let status = '';
  let statusIsRefusal = false;
  /** Set when the user has asked for a replace and is being shown its cost. */
  let pendingReplace: readonly string[] | null = null;
  /** Drag-to-link state: the node the pointer went down on. */
  let linkFrom: string | null = null;

  const slots = {
    note: el('p', NOTE_CSS, ROOM_PROGRAMME_NOTE),
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

  function loadProjectRooms(announce: boolean): boolean {
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
    const changed = applyRoomProgrammeIntent({ type: 'programme.reset', next: imp.programme });
    if (announce || changed) say(describeProjectRoomsImport(imp, scope), false);
    return changed;
  }

  function renderLibrary(): void {
    const box = el('div');
    box.setAttribute('data-testid', ROOM_PROGRAMME_LIBRARY_TESTID);
    box.appendChild(el('div', LABEL_CSS, `Room library — ${RESIDENTIAL_ROOM_LIBRARY.length} kinds`));
    const wrap = el('div', 'display:flex;flex-wrap:wrap;gap:4px;');
    for (const entry of RESIDENTIAL_ROOM_LIBRARY) {
      const chip = el('button');
      chip.type = 'button';
      chip.draggable = true;
      chip.setAttribute(ROOM_PROGRAMME_CHIP_ATTR, entry.kind);
      chip.style.cssText = [
        'display:inline-flex', 'align-items:center', 'gap:5px',
        'padding:3px 8px', 'border-radius:999px', 'cursor:grab',
        'font-size:11px', 'color:var(--app-text,#22223a)',
        'border:1px solid var(--app-border,#dde3ef)',
        'background:var(--app-surface,#fff)',
      ].join(';');
      chip.title = describeLibraryEntry(entry.kind);
      const dot = el('span',
        `width:9px;height:9px;border-radius:2px;flex:0 0 auto;background:${libraryColourFor(entry.kind)};`);
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
    if (isResidentialRoomKind(kind)) addRoom(kind);
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
      'Drag one room onto another to plug a relationship. Click a line to unplug it. Either '
      + 'way the plan below re-solves immediately — that is what "the graph drives the layout" '
      + 'means here. Drop a library chip anywhere on this panel to add a room.'));

    const W = 300;
    const H = 190;
    const svg = svgEl('svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label',
      `Room relationship graph: ${p.entries.length} rooms, ${p.links.length} relationships.`);
    svg.style.cssText = `${CARD_CSS}display:block;touch-action:none;`;
    svg.setAttribute('data-testid', ROOM_PROGRAMME_GRAPH_TESTID);
    makeDropTarget(svg);

    if (p.entries.length === 0) {
      const t = svgEl('text');
      t.setAttribute('x', String(W / 2));
      t.setAttribute('y', String(H / 2));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '11');
      t.setAttribute('fill', '#8a8a99');
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
    const at = (id: string): { x: number; y: number } => {
      const q = pos.get(id);
      return { x: (q?.[0] ?? (W - 40) / 2) + 20, y: (q?.[1] ?? (H - 40) / 2) + 20 };
    };

    for (const l of p.links) {
      const a = at(l.aId);
      const b = at(l.bId);
      const line = svgEl('line');
      line.setAttribute('x1', String(a.x));
      line.setAttribute('y1', String(a.y));
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y));
      line.setAttribute('stroke', '#6600FF');
      line.setAttribute('stroke-width', '6');
      line.setAttribute('stroke-opacity', '0.28');
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
      svg.appendChild(line);
    }

    for (const e of p.entries) {
      const q = at(e.id);
      const g = svgEl('g');
      g.setAttribute(ROOM_PROGRAMME_NODE_ATTR, e.id);
      g.style.cursor = 'grab';
      const c = svgEl('circle');
      c.setAttribute('cx', String(q.x));
      c.setAttribute('cy', String(q.y));
      c.setAttribute('r', '9');
      c.setAttribute('fill', libraryColourFor(e.kind));
      c.setAttribute('stroke', '#3a3a52');
      c.setAttribute('stroke-width', '1');
      const t = svgEl('text');
      t.setAttribute('x', String(q.x));
      t.setAttribute('y', String(q.y + 20));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '9');
      t.setAttribute('fill', '#3a3a52');
      t.textContent = e.name;
      const title = svgEl('title');
      title.textContent = `${e.name} — drag onto another room to plug a relationship`;
      g.appendChild(title);
      g.appendChild(c);
      g.appendChild(t);
      // ⭐ THE GESTURE IS `HouseLayoutModal.ts:1058`'s — drag a node onto a node. Reusing
      // the interaction semantics rather than inventing a third way to say "connect".
      g.addEventListener('pointerdown', (ev) => {
        linkFrom = e.id;
        (ev as PointerEvent).preventDefault();
      });
      g.addEventListener('pointerup', () => {
        const from = linkFrom;
        linkFrom = null;
        if (!from || from === e.id) return;
        dispatchIntent(() =>
          applyRoomProgrammeIntent({ type: 'programme.link', aId: from, bId: e.id }));
      });
      svg.appendChild(g);
    }
    svg.addEventListener('pointerup', () => { linkFrom = null; });
    svg.addEventListener('pointerleave', () => { linkFrom = null; });

    box.appendChild(svg);
    slots.graph.replaceChildren(box);
  }

  // ── PROGRAMME LIST ─────────────────────────────────────────────────────────

  function renderList(p: RoomProgramme): void {
    const box = el('div');
    box.setAttribute('data-testid', ROOM_PROGRAMME_LIST_TESTID);
    makeDropTarget(box);
    const total = p.entries.reduce((s, e) => s + e.targetAreaM2, 0);
    box.appendChild(el('div', LABEL_CSS, `Programme — ${p.entries.length} rooms, ${total.toFixed(1)} m²`));
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
  // brief is COMMITTED, by "Create room envelopes", and that is the gesture that is undoable.
  // ⚠ SO: A PIN IS NOT ON THE UNDO STACK, and this panel must not imply that it is. Ctrl+Z does
  // not unpin — dragging the room back, or double-clicking it, does.

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
        + 'have not pinned re-solve around it. Double-click it to hand it back to the solver. '
        + '(A pin is part of this session\'s brief, not the undo stack — Ctrl+Z will not '
        + 'release it.)', false);
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

  // ── PLAN PREVIEW + LEGEND ──────────────────────────────────────────────────

  function renderPreview(layout: ProgrammeLayoutResult): void {
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
    const sx = (v: number): number => ((v - x0) / spanX) * (W - 8) + 4;
    const sz = (v: number): number => ((v - z0) / spanZ) * (H - 8) + 4;

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
    box.appendChild(svg);
    box.appendChild(el(
      'div',
      `${NOTE_CSS}margin-top:4px;`,
      'Drag a room onto another to move it there — it stays pinned (📌) while everything '
      + 'unpinned re-solves around it. Double-click a pinned room to hand it back to the solver.',
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

  function say(text: string, refusal: boolean): void {
    status = text;
    statusIsRefusal = refusal;
  }

  function place(layout: ProgrammeLayoutResult): void {
    if (!layout.ok) { say(layout.statement, true); render(); return; }
    const records = safe(() => deps.readSpaceEnvelopes(), [] as readonly SpaceEnvelopeRecordLike[]);
    const pick = pickHostLevelEnvelope(records, safe(() => deps.readActiveLevelId(), null));
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
    const pick = pickHostLevelEnvelope(records, safe(() => deps.readActiveLevelId(), null));
    const layout: ProgrammeLayoutResult = pick.ok
      ? solveProgrammeLayout({ levelRing: pick.level.footprint, programme: p })
      : { ok: false, code: 'no-level-ring', statement: pick.statement };
    try {
      renderLibrary();
      renderGraph(p);
      renderList(p);
      renderPreview(layout);
      renderReport(layout, p);
      renderActions(layout);
    } catch (e) {
      console.warn('[room-programme] render failed (non-fatal):', e);
    }
  }

  root.appendChild(slots.note);
  root.appendChild(slots.library);
  root.appendChild(slots.graph);
  root.appendChild(slots.list);
  root.appendChild(slots.preview);
  root.appendChild(slots.report);
  root.appendChild(slots.actions);
  makeDropTarget(root);
  host.appendChild(root);

  const unsubProgramme = subscribeRoomProgramme(() => render());
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
      if (getRoomProgramme().entries.length === 0) loadProjectRooms(false);
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
      root.remove();
    },
  };
}
