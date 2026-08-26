/**
 * RoomTreeZone — §ROOMTREE139 (L-12260+), 2026-08-26.
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Inspect Mode RHS Panel, mini project browser tree.
 * Contract:          05-BIM-UI-ARCHITECTURE-CONTRACT §3 (CSS prefix: aud-)
 *
 * Zone: the BY-ROOM grouping of the mini project browser tree — room → family
 * → element, plus the "No Room" bucket and the family filter. Renderer only;
 * every count and every bucket comes from `buildRoomTreeModel()`
 * (`projectTreeModel.ts`), which is the pure model this file draws (mirrors the
 * by-level split between `ProjectTreeZone.ts` and `projectTreeModel.ts`).
 *
 * Founder: *"In Inspect, within the PRYZM tree, I want another mode option — BY
 * ROOM. I want to be able to select a room and see what it has. Also filter
 * rooms by elements like furniture elements, walls — to see how many of those
 * elements the room has."*
 *
 * Exports:
 *   renderRoomTree — full by-room tree render (filter row + rows + no-room)
 */

import {
  buildRoomTreeModel,
  elementRowLabel,
  type RoomTreeFamilyGroup,
  type RoomTreeModel,
  type RoomTreeEntry,
} from './projectTreeModel';
import { INSPECT_CATEGORIES } from './inspectCategories';
import {
  getElementIcon,
  selectRoomNode,
  selectElementNode,
} from './ProjectTreeZone';

// ── State bag consumed by the room-tree zone ──────────────────────────────────
//
// Deliberately NOT `extends ProjectTreeState` — that interface also carries
// `treeExpandedLevels` / `treeExpandedTypes`, which are the BY-LEVEL tree's own
// expand/collapse state and mean nothing here. `selectRoomNode` / `selectElementNode`
// take only the narrow `Pick<ProjectTreeState, 'onRoomSelect' | ...>` they need,
// so this state bag satisfies them structurally without inheriting fields this
// tree has no use for.

export interface RoomTreeState {
  selectedRoomId:    string | null;
  selectedElementId: string | null;
  onRoomSelect:      (roomId: string) => void;
  onElementSelect:   (elemId: string) => void;
  /** Room ids, and the sentinel `'__no-room__'`, currently expanded. */
  treeExpandedRooms: Set<string>;
  /** roomId (or `'__no-room__'`) → the set of expanded `INSPECT_CATEGORIES` ids. */
  treeExpandedRoomFamilies: Map<string, Set<string>>;
  /** The active family filter — an `INSPECT_CATEGORIES` id, or `null` for all. */
  activeFamilyFilter: string | null;
  onFamilyFilterChange: (familyId: string | null) => void;
}

const NO_ROOM_KEY = '__no-room__';

// ── Full by-room tree render ──────────────────────────────────────────────────

/**
 * Outer render: builds the search box ONCE per call and re-renders the body
 * (`renderRoomTreeBody`) on input — the same split `ProjectTreeZone.ts`'s
 * `renderProjectTree` / `renderTreeBody` uses, and for the same reason: rebuild
 * the whole subtree on every keystroke and the input loses focus.
 */
export function renderRoomTree(container: HTMLElement, state: RoomTreeState): void {
  container.innerHTML = '';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'aud-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'aud-search';
  searchInput.placeholder = 'Search rooms and elements...';
  const body = document.createElement('div');
  searchInput.addEventListener('input', () => {
    renderRoomTreeBody(body, searchInput.value.toLowerCase().trim(), state);
  });
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);
  container.appendChild(body);

  renderRoomTreeBody(body, '', state);
}

export function renderRoomTreeBody(container: HTMLElement, filter: string, state: RoomTreeState): void {
  container.innerHTML = '';

  const model = buildRoomTreeModel(filter, state.activeFamilyFilter);

  container.appendChild(renderFamilyFilterRow(state));

  // §CONTEXT-DATA-HONESTY — a family `RoomContentsService` computes no
  // relationship for at all must not render as "0 rooms have it": that reads as
  // a confirmed absence nobody determined. Refuse honestly instead, mirroring
  // `renderAttributeRefusal`'s existing pattern one zone file over.
  if (state.activeFamilyFilter && model.unsupported.includes(state.activeFamilyFilter)) {
    const cat = INSPECT_CATEGORIES.find((c) => c.id === state.activeFamilyFilter);
    const box = document.createElement('div');
    box.className = 'aud-discovery-empty aud-attr-refusal';
    box.textContent =
      `⌀ Room containment is not yet determined for ${cat?.label ?? state.activeFamilyFilter} — ` +
      'this is UNKNOWN, not "no rooms have it".';
    container.appendChild(box);
    return;
  }

  if (model.roomStoreUnreadable) {
    const box = document.createElement('div');
    box.className = 'aud-tree-empty';
    box.textContent = 'Rooms cannot be read — this is UNKNOWN, not "this project has no rooms".';
    container.appendChild(box);
    return;
  }

  if (model.containmentUnavailable) {
    const box = document.createElement('div');
    box.className = 'aud-tree-empty';
    box.textContent = 'Room containment is not ready yet — room contents cannot be determined.';
    container.appendChild(box);
  }

  container.appendChild(renderHeaderRow(model));

  const body = document.createElement('div');
  body.className = 'aud-tree-body';
  container.appendChild(body);

  for (const room of model.rooms) renderRoomRow(body, room, state);
  if (model.noRoom.length > 0) renderNoRoomBucket(body, model.noRoom, model.noRoomTotal, state);

  if (model.rooms.length === 0 && model.noRoom.length === 0 && !model.containmentUnavailable) {
    const empty = document.createElement('div');
    empty.className = 'aud-tree-empty';
    empty.textContent = state.activeFamilyFilter ? 'No rooms contain this family.' : 'No rooms in this project.';
    body.appendChild(empty);
  }
}

// ── Family filter row ──────────────────────────────────────────────────────────

function renderFamilyFilterRow(state: RoomTreeState): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'aud-room-filter-wrap';

  const label = document.createElement('span');
  label.className = 'aud-selector-label';
  label.textContent = 'FILTER:';

  const select = document.createElement('select');
  select.className = 'aud-room-family-filter';
  select.title = 'Narrow rooms to those containing this family, sorted by count';

  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'All families';
  select.appendChild(allOpt);

  for (const cat of INSPECT_CATEGORIES) {
    if (cat.id === 'rooms') continue;
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.label;
    select.appendChild(opt);
  }
  select.value = state.activeFamilyFilter ?? '';

  select.addEventListener('change', () => {
    state.onFamilyFilterChange(select.value || null);
  });

  wrap.appendChild(label);
  wrap.appendChild(select);
  return wrap;
}

// ── Header row (mirrors ProjectTreeZone's `aud-tree-project-row`) ─────────────

function renderHeaderRow(model: RoomTreeModel): HTMLElement {
  const row = document.createElement('div');
  row.className = 'aud-tree-project-row';

  const dot = document.createElement('span');
  dot.className = 'aud-tree-dot';
  dot.textContent = '●';

  const label = document.createElement('span');
  label.className = 'aud-tree-row-label';
  label.textContent = 'ROOMS';

  const meta = document.createElement('span');
  meta.className = 'aud-tree-row-meta';

  const parts: string[] = [
    `${model.rooms.length} room${model.rooms.length !== 1 ? 's' : ''}`,
    `${model.listedTotal} element${model.listedTotal !== 1 ? 's' : ''}`,
  ];
  const notes: string[] = [];
  if (model.noRoomTotal > 0) {
    parts.push(`${model.noRoomTotal} in no room`);
    notes.push(`${model.noRoomTotal} element(s) sit outside every room's volume — real elements, named rather than dropped.`);
  }
  if (model.unsupportedTotal > 0) {
    parts.push(`${model.unsupportedTotal} not yet determined`);
    notes.push(
      `Room containment is not computed for: ${model.unsupported.join(', ')}. ` +
      'These elements are placed under no room and are NOT counted as "no room" — that would claim a confirmed absence nobody determined.',
    );
  }
  if (model.unreadable.length > 0) {
    parts.push(`${model.unreadable.length} unread`);
    notes.push(`These stores could not be read, so their families are UNKNOWN here, not empty: ${model.unreadable.join(', ')}.`);
  }
  meta.textContent = parts.join(' · ');
  if (notes.length > 0) meta.title = notes.join('\n');

  row.appendChild(dot);
  row.appendChild(label);
  row.appendChild(meta);
  return row;
}

// ── Room rows ──────────────────────────────────────────────────────────────────

function renderRoomRow(
  container: HTMLElement,
  room: RoomTreeEntry,
  state: RoomTreeState,
): void {
  const isExpanded = state.treeExpandedRooms.has(room.roomId);

  const row = document.createElement('div');
  const isSelected = state.selectedRoomId === room.roomId;
  row.className = `aud-tree-level-row ${isSelected ? 'aud-tree-selected' : ''}`;

  const expandBtn = document.createElement('button');
  expandBtn.className = 'aud-tree-expand-btn';
  expandBtn.textContent = isExpanded ? '▾' : '▸';

  const icon = document.createElement('span');
  icon.className = 'aud-tree-icon';
  icon.innerHTML = getElementIcon('roomStore');

  const label = document.createElement('span');
  label.className = 'aud-tree-row-label';
  label.textContent = room.roomLabel;

  const meta = document.createElement('span');
  meta.className = 'aud-tree-row-meta';
  meta.textContent = room.exact ? String(room.total) : `${room.total}+`;
  if (!room.exact) {
    meta.title = "This room's containment could not be fully determined — the count is a floor, not a census.";
  }

  row.appendChild(expandBtn);
  row.appendChild(icon);
  row.appendChild(label);
  row.appendChild(meta);
  container.appendChild(row);

  const typeContainer = document.createElement('div');
  typeContainer.className = 'aud-tree-type-container';
  if (!isExpanded) typeContainer.style.display = 'none';
  container.appendChild(typeContainer);

  const toggleExpand = () => {
    const open = !state.treeExpandedRooms.has(room.roomId);
    if (open) state.treeExpandedRooms.add(room.roomId);
    else state.treeExpandedRooms.delete(room.roomId);
    expandBtn.textContent = open ? '▾' : '▸';
    typeContainer.style.display = open ? '' : 'none';
  };
  expandBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleExpand(); });
  row.addEventListener('click', (e) => {
    if (e.target === expandBtn) return;
    selectRoomNode(state, room.roomId);
  });

  for (const group of room.groups) {
    renderFamilyGroup(typeContainer, room.roomId, group, state);
  }
}

/** The "No Room" bucket — same row shape as a room, but not itself selectable
 *  as a room (there is no room to select). */
function renderNoRoomBucket(
  container: HTMLElement,
  groups: readonly RoomTreeFamilyGroup[],
  total: number,
  state: RoomTreeState,
): void {
  const isExpanded = state.treeExpandedRooms.has(NO_ROOM_KEY);

  const row = document.createElement('div');
  row.className = 'aud-tree-level-row aud-tree-no-room-row';

  const expandBtn = document.createElement('button');
  expandBtn.className = 'aud-tree-expand-btn';
  expandBtn.textContent = isExpanded ? '▾' : '▸';

  const label = document.createElement('span');
  label.className = 'aud-tree-row-label';
  label.textContent = 'No Room';
  label.title = "Elements outside every room's volume — real elements, placed nowhere by this containment.";

  const meta = document.createElement('span');
  meta.className = 'aud-tree-row-meta';
  meta.textContent = String(total);

  row.appendChild(expandBtn);
  row.appendChild(label);
  row.appendChild(meta);
  container.appendChild(row);

  const typeContainer = document.createElement('div');
  typeContainer.className = 'aud-tree-type-container';
  if (!isExpanded) typeContainer.style.display = 'none';
  container.appendChild(typeContainer);

  const toggleExpand = () => {
    const open = !state.treeExpandedRooms.has(NO_ROOM_KEY);
    if (open) state.treeExpandedRooms.add(NO_ROOM_KEY);
    else state.treeExpandedRooms.delete(NO_ROOM_KEY);
    expandBtn.textContent = open ? '▾' : '▸';
    typeContainer.style.display = open ? '' : 'none';
  };
  expandBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleExpand(); });
  row.addEventListener('click', (e) => {
    if (e.target === expandBtn) return;
    toggleExpand();
  });

  for (const group of groups) {
    renderFamilyGroup(typeContainer, NO_ROOM_KEY, group, state);
  }
}

// ── Family groups + element rows (shared by rooms and the no-room bucket) ─────

function renderFamilyGroup(
  container: HTMLElement,
  roomKey: string,
  group: RoomTreeFamilyGroup,
  state: RoomTreeState,
): void {
  const isExpanded = state.treeExpandedRoomFamilies.get(roomKey)?.has(group.id) ?? false;

  const typeRow = document.createElement('div');
  typeRow.className = 'aud-tree-type-row';

  const expandBtn = document.createElement('button');
  expandBtn.className = 'aud-tree-expand-btn';
  expandBtn.textContent = isExpanded ? '▾' : '▸';
  expandBtn.style.marginLeft = '24px';

  const typeLabel = document.createElement('span');
  typeLabel.className = 'aud-tree-type-label';
  typeLabel.textContent = group.label;

  const typeCount = document.createElement('span');
  typeCount.className = 'aud-tree-type-count';
  typeCount.textContent = String(group.elements.length);

  typeRow.appendChild(expandBtn);
  typeRow.appendChild(typeLabel);
  typeRow.appendChild(typeCount);
  container.appendChild(typeRow);

  const elemContainer = document.createElement('div');
  elemContainer.className = 'aud-tree-elem-container';
  if (!isExpanded) elemContainer.style.display = 'none';
  container.appendChild(elemContainer);

  const toggleExpand = () => {
    const open = !(state.treeExpandedRoomFamilies.get(roomKey)?.has(group.id) ?? false);
    if (!state.treeExpandedRoomFamilies.has(roomKey)) state.treeExpandedRoomFamilies.set(roomKey, new Set());
    if (open) state.treeExpandedRoomFamilies.get(roomKey)!.add(group.id);
    else state.treeExpandedRoomFamilies.get(roomKey)!.delete(group.id);
    expandBtn.textContent = open ? '▾' : '▸';
    elemContainer.style.display = open ? '' : 'none';
  };
  expandBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleExpand(); });
  typeRow.addEventListener('click', (e) => { if (e.target === expandBtn) return; toggleExpand(); });

  for (const el of group.elements) {
    const elemRow = document.createElement('div');
    const isSelected = state.selectedElementId === el.id;
    elemRow.className = `aud-tree-elem-row ${isSelected ? 'aud-tree-selected' : ''}`;
    elemRow.style.marginLeft = '36px';

    const icon = document.createElement('span');
    icon.className = 'aud-tree-elem-icon';
    icon.innerHTML = getElementIcon(group.storeKey);

    const elLabel = document.createElement('span');
    elLabel.className = 'aud-tree-elem-label';
    elLabel.textContent = elementRowLabel({ meshType: group.meshType }, el);
    elLabel.title = String(el.id);

    elemRow.appendChild(icon);
    elemRow.appendChild(elLabel);
    elemContainer.appendChild(elemRow);

    // The "No Room" bucket lists ELEMENTS, never rooms — always the element path.
    elemRow.addEventListener('click', () => selectElementNode(state, el.id));
  }
}
