/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Inspect Mode RHS Panel (Phase 1.3 → 1.5)
 * File:             src/ui/inspect/audit/ProjectTreeZone.ts
 * Split from:       src/ui/inspect/AuditStack.ts (Wave 14 FILE 5 split)
 * Contract:         05-BIM-UI-ARCHITECTURE-CONTRACT §3 (CSS prefix: aud-)
 *
 * Zone: Mini Project Browser Tree (Building → Level → Element types → Elements).
 *
 * Exports:
 *   renderProjectTree   — full tree render into the project-tree zone container
 *   renderTreeBody      — tree body (levels + type groups) with filter support
 *   renderTypesForLevel — per-level element-family groups with expand/collapse
 *   countAllElements    — total element count, EQUAL to the sum of the listed groups
 *   getElementIcon      — returns inline SVG for a store key
 *
 * ── §TREE134 (L-12160), 2026-08-26 — THE CATEGORY MAPPING IS DERIVED ────────────
 *
 * Founder: *"The Inspect tree doesn't have all the categories mapped — many are
 * missing. Check the project browser on the left-hand side rail panel — you have
 * them all there — do the same."*
 *
 * `renderTypesForLevel` used to open on a hand-written FOUR-entry `stores` array
 * (room / wall / slab / column). `INSPECT_CATEGORIES`, three files away in this very
 * directory, declares TWENTY families and is guarded by a coverage gate. Sixteen
 * families the founder can select in 3-D — handrails, curtain walls, furniture,
 * plumbing, lighting, stairs, openings, … — could not appear in this tree at all.
 *
 * ⭐ It now DERIVES from `INSPECT_CATEGORIES` via `projectTreeModel.ts`. Extending the
 * array to today's twenty would have reproduced the defect on the twenty-first; see
 * that file's header for the full audit, and `inspectProjectTreeCategories.spec.ts`
 * for the pin that fails if this file ever goes back to hand-listing.
 */

import { selectionBus } from '@pryzm/core-app-model';
import {
  buildProjectTreeModel,
  buildLevelFamilyGroups,
  elementRowLabel,
  type TreeFamilyGroup,
} from './projectTreeModel';
import { INSPECT_CATEGORIES } from './inspectCategories';
// §TREE134 · C84 EI-9 — "the icon for an element kind" already had ONE producer, and
// it is the one the left-rail browser the founder pointed at renders from. The eight
// hand-drawn SVGs this file used to carry were a second, smaller answer to the same
// question; `getElementIcon` below now delegates rather than rivals.
import { getTypeIcon } from '../../ViewBrowser/panels/unified-browser/BrowserDataHelpers';

// ── State bag consumed by tree zone ──────────────────────────────────────────

export interface ProjectTreeState {
  selectedRoomId:     string | null;
  selectedElementId:  string | null;
  treeExpandedLevels: Set<string>;
  treeExpandedTypes:  Map<string, Set<string>>;
  onRoomSelect:    (roomId: string) => void;
  onElementSelect: (elemId: string) => void;
}

// ── Full project tree render ──────────────────────────────────────────────────

export function renderProjectTree(container: HTMLElement, state: ProjectTreeState): void {
  container.innerHTML = '';

  const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
  if (!bimManager) {
    const msg = document.createElement('div');
    msg.className = 'aud-tree-empty';
    msg.textContent = 'Model not ready.';
    container.appendChild(msg);
    return;
  }

  // ── Breadcrumb ─────────────────────────────────────────────────────────────
  const breadcrumb = document.createElement('div');
  breadcrumb.className = 'aud-breadcrumb';
  breadcrumb.innerHTML = '<span>Project</span> › <span>Building</span> › <span>Ground</span>';
  container.appendChild(breadcrumb);

  // ── Search bar ─────────────────────────────────────────────────────────────
  const searchWrap = document.createElement('div');
  searchWrap.className = 'aud-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'aud-search';
  searchInput.placeholder = 'Search everything...';
  const treeBody = document.createElement('div');
  treeBody.className = 'aud-tree-body';
  searchInput.addEventListener('input', () => {
    renderTreeBody(treeBody, searchInput.value.toLowerCase().trim(), bimManager, state);
  });
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  // ── Tree body ──────────────────────────────────────────────────────────────
  container.appendChild(treeBody);
  renderTreeBody(treeBody, '', bimManager, state);
}

// ── Tree body ─────────────────────────────────────────────────────────────────

export function renderTreeBody(
  container:  HTMLElement,
  filter:     string,
  bimManager: any,
  state:      ProjectTreeState,
): void {
  container.innerHTML = '';

  const levels: any[] = (bimManager.getLevels?.() ?? [])
    .slice()
    .sort((a: any, b: any) => a.elevation - b.elevation);

  // ── §TREE134 (L-12162) — ONE traversal feeds BOTH the header and the rows ─────
  //
  // ⛔ THE HEADER USED TO LIE, and quietly. `countAllElements()` scanned SIX stores
  // (room, wall, slab, column, door, window) while `renderTypesForLevel` listed FOUR
  // groups — so `7 levels · 153 elements` counted every WINDOW in the model, which the
  // tree had no group for, and every DOOR, which it drew only as a dead child row under
  // a wall. It also counted elements whose storey matches no level, which no row can
  // show. A total that includes rows the user cannot see is the §CONTEXT-DATA-HONESTY
  // shape at a header: absence rendered as a confident number.
  //
  // ⭐ `model.listedTotal` is the SUM OF THE GROUPS THIS RENDER DRAWS. Not a second
  // scan that ought to agree — the same traversal, so drift is not possible. Elements
  // the tree cannot place, and families whose store could not be READ at all, are named
  // separately rather than folded into (or dropped from) the total.
  const model = buildProjectTreeModel(levels.map((l: any) => String(l.id)), filter);

  const projectRow = document.createElement('div');
  projectRow.className = 'aud-tree-project-row';
  const dot = document.createElement('span');
  dot.className   = 'aud-tree-dot';
  dot.textContent = '●';
  const projectLabel = document.createElement('span');
  projectLabel.className   = 'aud-tree-row-label';
  projectLabel.textContent = 'PROJECT';
  const meta = document.createElement('span');
  meta.className = 'aud-tree-row-meta';

  const parts: string[] = [`${levels.length} level${levels.length !== 1 ? 's' : ''}`];
  parts.push(
    filter
      // Under a search the header states BOTH numbers, because "12 elements" beside a
      // filtered tree would be a different claim than the one the user is reading.
      ? `${model.listedTotal} of ${model.totalUnfiltered} elements match`
      : `${model.listedTotal} element${model.listedTotal !== 1 ? 's' : ''}`,
  );
  const notes: string[] = [];
  if (model.unplaced > 0) {
    parts.push(`${model.unplaced} unplaced`);
    notes.push(
      `${model.unplaced} element(s) name no storey this project declares, and no host wall that does — ` +
      'they are real, and no row can show them.',
    );
  }
  if (model.unreadable.length > 0) {
    parts.push(`${model.unreadable.length} unread`);
    notes.push(
      `These stores could not be read, so their categories are UNKNOWN here, not empty: ` +
      `${model.unreadable.join(', ')}.`,
    );
  }
  meta.textContent = parts.join(' · ');
  if (notes.length > 0) meta.title = notes.join('\n');

  projectRow.appendChild(dot);
  projectRow.appendChild(projectLabel);
  projectRow.appendChild(meta);
  container.appendChild(projectRow);

  const buildingRow = document.createElement('div');
  buildingRow.className = 'aud-tree-building-row';
  buildingRow.innerHTML = `
    <span class="aud-tree-icon"><svg width="13" height="13" viewBox="0 0 15 15" fill="none"><rect x="2" y="3" width="11" height="11" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M5 3V2a2.5 2.5 0 015 0v1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><rect x="5" y="8" width="2" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><rect x="8" y="8" width="2" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><line x1="2" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1"/></svg></span>
    <span class="aud-tree-row-label">Building</span>
  `;
  container.appendChild(buildingRow);

  const siteRow = document.createElement('div');
  siteRow.className = 'aud-tree-site-row';
  siteRow.innerHTML = `
    <span class="aud-tree-icon" style="margin-left:10px;"><svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M7.5 1.5C5.5 1.5 4 3.2 4 5.5c0 3.3 3.5 7.5 3.5 7.5s3.5-4.2 3.5-7.5c0-2.3-1.5-4-3.5-4z" stroke="currentColor" stroke-width="1.2"/><circle cx="7.5" cy="5.5" r="1.4" stroke="currentColor" stroke-width="1.1"/></svg></span>
    <span class="aud-tree-row-label">Site</span>
  `;
  container.appendChild(siteRow);

  // Auto-expand all levels on first render.
  // §TREE134 — the seed is keyed on CATEGORY IDS from the registry, not on the four
  // display labels it used to hard-code ('WALL','ROOM','SLAB','COLUMN'). The default
  // open set is deliberately still the spatial/structural core rather than all twenty:
  // opening every family on a populated storey is a wall of rows, not a browser.
  if (state.treeExpandedLevels.size === 0 && levels.length > 0) {
    levels.forEach(l => state.treeExpandedLevels.add(l.id));
    const firstLevel = levels[0];
    if (firstLevel && !state.treeExpandedTypes.has(firstLevel.id)) {
      state.treeExpandedTypes.set(firstLevel.id, new Set(['rooms', 'walls', 'slabs', 'columns']));
    }
  }

  // ── Level rows ─────────────────────────────────────────────────────────────
  for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
    const level = levels[levelIndex];
    const projectCtx = window.projectContext; // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
    const isActive   = level.id === (projectCtx?.activeLevelId ?? bimManager.getActiveLevelId?.());
    const levelKey   = level.id;
    const isExpanded = state.treeExpandedLevels.has(levelKey);

    const levelRow = document.createElement('div');
    levelRow.className = 'aud-tree-level-row';

    const expandBtn = document.createElement('button');
    expandBtn.className = 'aud-tree-expand-btn';
    expandBtn.textContent = isExpanded ? '▾' : '▸';

    const levelIcon = document.createElement('span');
    levelIcon.className = 'aud-tree-icon';
    levelIcon.style.marginLeft = '16px';
    // §PANEL-BRAND-STANDARD (L-1742) — was `isActive ? '#6600FF' : '#8888aa'`.
    // The <span> wrapper already carries `.aud-tree-icon { color: var(--app-text-muted) }`,
    // so the icons inherit the token via currentColor and the active state names
    // the accent token instead of restating its hex. #8888aa was a grey that
    // exists in no palette.
    const _lvlIconColor = isActive ? 'var(--app-accent)' : 'currentColor';
    levelIcon.innerHTML = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="4" width="12" height="8" rx="1" stroke="${_lvlIconColor}" stroke-width="1.1"/><line x1="1" y1="7" x2="13" y2="7" stroke="${_lvlIconColor}" stroke-width="1"/><line x1="3" y1="2.5" x2="11" y2="2.5" stroke="${_lvlIconColor}" stroke-width="1" stroke-linecap="round"/><line x1="5" y1="1" x2="9" y2="1" stroke="${_lvlIconColor}" stroke-width="1" stroke-linecap="round"/></svg>`;

    const levelLabel = document.createElement('span');
    levelLabel.className = 'aud-tree-row-label';
    levelLabel.textContent = `${level.name} (${level.elevation}m)`;

    levelRow.appendChild(expandBtn);
    levelRow.appendChild(levelIcon);
    levelRow.appendChild(levelLabel);

    if (isActive) {
      const activeBadge = document.createElement('span');
      activeBadge.className = 'aud-tree-active-badge';
      activeBadge.textContent = 'ACTIVE';
      levelRow.appendChild(activeBadge);
    }

    container.appendChild(levelRow);

    const typeContainer = document.createElement('div');
    typeContainer.className = 'aud-tree-type-container';
    if (!isExpanded) typeContainer.style.display = 'none';
    container.appendChild(typeContainer);

    expandBtn.addEventListener('click', () => {
      const open = !state.treeExpandedLevels.has(levelKey);
      if (open) {
        state.treeExpandedLevels.add(levelKey);
      } else {
        state.treeExpandedLevels.delete(levelKey);
      }
      expandBtn.textContent = open ? '▾' : '▸';
      typeContainer.style.display = open ? '' : 'none';
    });

    levelRow.addEventListener('click', (e) => {
      if (e.target === expandBtn) return;
      expandBtn.click();
    });

    // The groups come from the SAME traversal the header total was summed from —
    // passing them in is what makes "the header agrees with the tree" structural
    // rather than a coincidence two scans have to keep re-earning.
    renderTypesForLevel(typeContainer, level, filter, state, model.levels[levelIndex]?.groups);
  }
}

// ── Per-level element type groups ─────────────────────────────────────────────

export function renderTypesForLevel(
  container: HTMLElement,
  level:     any,
  filter:    string,
  state:     ProjectTreeState,
  /**
   * §TREE134 — the pre-computed groups from `renderTreeBody`'s single traversal.
   * Omitted only by a direct caller (and by the specs), in which case this level is
   * read on its own. Either way the groups come from `projectTreeModel`, never from
   * a list written out here.
   */
  precomputed?: readonly TreeFamilyGroup[],
): void {
  // ⛔ THE HAND-WRITTEN `stores` ARRAY THAT USED TO OPEN THIS FUNCTION IS GONE.
  //
  //     [ roomStore/'ROOM', wallStore/'WALL' (+DOOR children), slabStore/'SLAB',
  //       columnStore/'COLUMN' ]
  //
  // Four families out of the twenty `INSPECT_CATEGORIES` declares. Do NOT restore it,
  // and do not "just add the missing ones" — that is the move that produced this bug,
  // and the LEFT-RAIL browser the founder pointed at carries the receipt: its own
  // category list is hand-written too, and §LIFT94 (L-11342) is the founder reporting
  // the identical omission there, one family at a time.
  //
  // ⚠ HOSTED CHILDREN WENT WITH IT, DELIBERATELY. Doors used to render as `aud-tree-
  // child-row`s nested under their host wall. Three reasons they are now first-class
  // groups instead: (1) those child rows had NO click handler — they were decoration,
  // not navigation, so nothing selectable is lost; (2) WINDOWS and OPENINGS, hosted the
  // same way, were nested under nothing and appeared nowhere at all; (3) keeping both
  // shapes would show a door twice and force the header to choose which one to count.
  // The left-rail browser lists Doors, Windows and Openings as their own categories —
  // "do the same" is the instruction, and their storey still resolves through the host
  // wall (`resolveElementLevelId`, C15), so they travel with it exactly as before.
  const groups = precomputed ?? buildLevelFamilyGroups(String(level.id), filter);

  for (const group of groups) {
    const { id: categoryId, storeKey, label, meshType, elements } = group;

    const isTypeExpanded = state.treeExpandedTypes.get(level.id)?.has(categoryId) ?? false;

    const typeRow = document.createElement('div');
    typeRow.className = 'aud-tree-type-row';

    const typeExpandBtn = document.createElement('button');
    typeExpandBtn.className = 'aud-tree-expand-btn';
    typeExpandBtn.textContent = isTypeExpanded ? '▾' : '▸';
    typeExpandBtn.style.marginLeft = '24px';

    const typeLabel = document.createElement('span');
    typeLabel.className = 'aud-tree-type-label';
    typeLabel.textContent = label;

    const typeCount = document.createElement('span');
    typeCount.className = 'aud-tree-type-count';
    typeCount.textContent = String(elements.length);

    typeRow.appendChild(typeExpandBtn);
    typeRow.appendChild(typeLabel);
    typeRow.appendChild(typeCount);
    container.appendChild(typeRow);

    const elemContainer = document.createElement('div');
    elemContainer.className = 'aud-tree-elem-container';
    if (!isTypeExpanded) elemContainer.style.display = 'none';
    container.appendChild(elemContainer);

    typeExpandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Keyed on the registry CATEGORY ID, not the display label: the label is a
      // presentation string ('Curtain Walls') and renaming one must not silently reset
      // every user's expanded state.
      const open = !(state.treeExpandedTypes.get(level.id)?.has(categoryId) ?? false);
      if (!state.treeExpandedTypes.has(level.id)) {
        state.treeExpandedTypes.set(level.id, new Set());
      }
      if (open) {
        state.treeExpandedTypes.get(level.id)!.add(categoryId);
      } else {
        state.treeExpandedTypes.get(level.id)!.delete(categoryId);
      }
      typeExpandBtn.textContent = open ? '▾' : '▸';
      elemContainer.style.display = open ? '' : 'none';
    });

    typeRow.addEventListener('click', (e) => {
      if (e.target === typeExpandBtn) return;
      typeExpandBtn.click();
    });

    for (const el of elements) {
      const elemRow = document.createElement('div');
      const isSelected = storeKey === 'roomStore'
        ? state.selectedRoomId === el.id
        : state.selectedElementId === el.id;

      elemRow.className = `aud-tree-elem-row ${isSelected ? 'aud-tree-selected' : ''}`;
      elemRow.style.marginLeft = '36px';

      const elemIcon = document.createElement('span');
      elemIcon.className = 'aud-tree-elem-icon';
      elemIcon.innerHTML = getElementIcon(storeKey);

      const elemLabel = document.createElement('span');
      elemLabel.className = 'aud-tree-elem-label';
      // The unnamed-record fallback uses the SINGULAR builder type ('WALL 1A2B'),
      // which is what it read before the group label became plural ('Walls 1A2B').
      elemLabel.textContent = elementRowLabel({ meshType }, el);
      elemLabel.title = String(el.id);

      elemRow.appendChild(elemIcon);
      elemRow.appendChild(elemLabel);
      elemContainer.appendChild(elemRow);

      elemRow.addEventListener('click', () => {
        const isRoomRow = storeKey === 'roomStore';
        if (isRoomRow) {
          selectRoomNode(state, el.id);
        } else {
          selectElementNode(state, el.id);
        }
      });
    }
  }
}

// ── Shared selection paths ──────────────────────────────────────────────────
//
// §ROOMTREE139 — factored out of the click handler above so the BY-ROOM tree
// (`RoomTreeZone.ts`) dispatches a room selection through the exact same
// sequence, rather than a second, independently-typed copy that could silently
// drift from it. Behaviour is unchanged from what this file already did.

/**
 * §INSPECT-FOCUS-IS-ELEMENT-SHAPED (L-8201), 2026-08-23 — the ROOM selection
 * path. Every non-room row selects through `selectElementNode` alone; a room row
 * ALSO carries the two room-shaped events below.
 *
 * ⛔ THESE TWO EMITS WERE ONCE UNCONDITIONAL AND BOTH CARRIED A FIELD CALLED
 * `roomId`. `emit('pryzm-inspect-room-focus', { roomId: el.id })` fired for
 * every family, which is what put a WALL id into a room-shaped slot — verbatim
 * what the founder's console printed back:
 *
 *     [DiagnosticMaterialManager] Lens applied: ghost (room: wall_01M0PTPA…)
 *     [InspectModeCoordinator] Room focused: wall_01M0PTPAWMNKP0B1G841G7XR04
 *
 * ⭐ THE NON-ROOM CASE WAS NOT DROPPED when this was scoped to rooms only — it
 * was never carried by this event in the first place. `selectionBus.select`
 * fires on every row regardless of family (see `selectElementNode`), and
 * `InspectModeCoordinator` subscribes to it (C27 §4: SelectionBus is the single
 * authorised entry point for all selection sources).
 */
export function selectRoomNode(state: Pick<ProjectTreeState, 'onRoomSelect'>, roomId: string): void {
  state.onRoomSelect(roomId);
  window.runtime?.events?.emit('pryzm-audit-room-select', { roomId, source: 'audit-stack' }); // F.events.12
  // F.events.6 — pryzm-inspect-room-focus migrated to runtime.events typed bus.
  window.runtime?.events?.emit('pryzm-inspect-room-focus', { roomId });
  selectionBus.select(roomId, 'inspect-panel');
}

/** The non-room selection path — every other element family, in every tree. */
export function selectElementNode(state: Pick<ProjectTreeState, 'onElementSelect'>, elementId: string): void {
  state.onElementSelect(elementId);
  selectionBus.select(elementId, 'inspect-panel');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * The project's element total — the number beside `PROJECT` in the header.
 *
 * ⛔ IT USED TO BE A SECOND SCAN, over a SIX-store list, while the tree listed FOUR
 * groups. Two lists that had to agree and did not: windows were counted and never
 * shown, doors were counted and shown only as dead child rows, and sixteen families
 * were neither counted nor shown. §CONTEXT-DATA-HONESTY at a header — a confident
 * total covering rows the user cannot see.
 *
 * ⭐ It is now the sum of the groups the tree renders, from the same traversal, so
 * "does the header agree with the tree?" is not a question this code can answer
 * wrongly. `unplaced` / `unreadable` are reported BESIDE the total, never folded in.
 *
 * @param levelIds the storeys being rendered. Omitted, it reads them off `bimManager`
 *                 — the same source `renderTreeBody` uses.
 */
export function countAllElements(levelIds?: readonly string[]): number {
  const ids = levelIds
    ?? (window.bimManager?.getLevels?.() ?? []).map((l: any) => String(l.id)); // TODO(D.4): legacy bimManager
  return buildProjectTreeModel(ids).listedTotal;
}

/**
 * Inline SVG for one family's element rows, addressed by its store key.
 *
 * §TREE134 · C84 EI-9 — this used to be eight hand-drawn `if`s and a square fallback,
 * so twelve of the twenty families rendered as an anonymous box. It now resolves the
 * store key through `INSPECT_CATEGORIES` to the builder's mesh type and asks
 * `getTypeIcon` — the producer the LEFT-RAIL browser the founder pointed at already
 * renders from, which covers every family this tree can now show. One icon vocabulary,
 * two surfaces; a new family inherits an icon instead of a blank square.
 */
export function getElementIcon(storeKey: string): string {
  const cat = INSPECT_CATEGORIES.find(c => c.storeKey === storeKey);
  return getTypeIcon(cat?.meshType ?? storeKey.replace(/Store$/, ''));
}
