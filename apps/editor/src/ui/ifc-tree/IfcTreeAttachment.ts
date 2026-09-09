/**
 * `IfcTreeAttachment.ts` — mounts the IFC tree into the Inspect panel WITHOUT
 * editing the Inspect panel.
 *
 * §IFC-TREE-ATTACH (L-8370..L-8376).
 *
 * ---------------------------------------------------------------------------
 * WHY IT ATTACHES BY SELECTOR INSTEAD OF BEING WIRED IN
 * ---------------------------------------------------------------------------
 * `apps/editor/src/ui/inspect/**` is owned by a concurrent lane that is
 * restructuring the Inspect lens/focus machinery. Editing `AuditStack.ts` while
 * that is in flight risks a shared-tree collision, and `.aud-header` is
 * additionally CONTRACT-PINNED — two spec files assert on it byte-for-byte:
 *   apps/editor/src/ui/analysis/__tests__/analysisHeaderReserve.spec.ts:196,230,236
 *   apps/editor/src/ui/dataworkbench/__tests__/dataPanelChrome.spec.ts:294,299
 *
 * So this module TOUCHES NO EXISTING FILE'S SOURCE. It waits for the Inspect
 * panel to exist, appends the toggle into the header's existing
 * `.aud-header-actions` slot, and inserts its own sibling container next to the
 * project tree. It adds NO rule to `.aud-header` and changes none of its
 * properties.
 *
 * ⭐ IT ALSO FAILS QUIETLY AND VISIBLY. If the other lane restructures the
 * header and the selector stops matching, this logs one warning and does
 * nothing — it never throws into the Inspect panel's own boot path. A missing
 * toggle is a bug; a broken Inspect panel is a catastrophe.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 * ⛔ Not a permanent home. The right long-term shape is a real mount point
 * offered by the Inspect panel — ideally the `PanelHost` contribution registry
 * that already exists at `packages/ui/src/PanelHost.ts` and is NEVER
 * INSTANTIATED IN PRODUCTION (measured: the only `new PanelHost()` calls in the
 * repo are in tests, and `createIfcPanelContribution` has zero callers). That
 * is logged as L-8375 and is the follow-up, not this file.
 */

import {
  adaptImportedModel,
  adaptNativeElements,
  createIfcTreeView,
  createTreeToggle,
  type HostIndex,
  type BuildingIndex,
  type HostLevelResolution,
  type IfcTreeSource,
  type IfcTreeView,
  type TreeMode,
} from '@pryzm/plugin-ifc-inspector';
// ADR-0385 - the ONE resolver for "which building is this element in". The IFC
// exporter and the PRYZM tree call the same function; this file re-derives nothing.
import {
  selectionBus,
  readBuildingSubstrate,
  resolveLevelBuilding,
  UNREADABLE_SUBSTRATE,
  type BuildingSubstrate,
} from '@pryzm/core-app-model';

const HOST_ID = 'pryzm-ifc-tree-host';
const TOGGLE_ID = 'pryzm-ifc-tree-toggle';

let view: IfcTreeView | null = null;
let mode: TreeMode = 'pryzm';
let warned = false;

function warnOnce(msg: string): void {
  if (warned) return;
  warned = true;
  console.warn(`[ifc-tree] ${msg}`);
}

/**
 * Collect both halves.
 *
 * ⚠ Reads `window.ifcModelStore`, which is how the rest of the app reaches it
 * (`FragmentReader.ts:150`, `exportScope.ts:4`, `initUI.ts:1579`). That global
 * is already TODO(TASK-08)'d for removal; this follows the existing convention
 * rather than inventing a second access path, and moves when that one does.
 */
/**
 * Human name for a level id, so storey groups read "Level 1" rather than
 * "L1787150975010". Falls back to the id — a raw id is ugly but true, and
 * inventing a name would not be.
 */
function levelNameOf(levelId: string): string | undefined {
  try {
    const w = window as unknown as Record<string, { getAll?(): unknown[] } | undefined>;
    const levels = w['levelStore']?.getAll?.() ?? [];
    for (const raw of levels) {
      const l = raw as Record<string, unknown>;
      if (String(l['id'] ?? '') === levelId) {
        const n = l['name'];
        if (typeof n === 'string' && n.trim()) return n;
      }
    }
  } catch {
    /* fall through — the id is still a true answer */
  }
  return undefined;
}

/**
 * Resolve a hosted opening's storey through its host wall.
 *
 * THREE outcomes, never collapsed: resolved / no-host / host-has-no-level. A
 * missing wall and a wall with no level are different defects with different
 * owners, and the tree names which one it hit.
 *
 * Backed by `wallStore.getById()` (packages/geometry-wall/src/WallStore.ts:1146).
 */
function buildHostIndex(): HostIndex {
  const w = window as unknown as Record<string, unknown>;
  const wallStore = w['wallStore'] as
    | { getById?(id: string): { levelId?: string } | undefined }
    | undefined;

  return {
    resolveWallLevel(wallId): HostLevelResolution {
      if (!wallId) return { kind: 'no-host' };
      try {
        const wall = wallStore?.getById?.(wallId);
        if (!wall) return { kind: 'no-host' };
        const levelId = typeof wall.levelId === 'string' ? wall.levelId : '';
        // NB: Wall.levelId defaults to '' (schemas/src/elements/Wall.ts:91), so
        // an empty string is a real "host has no level", not a missing wall.
        if (!levelId) return { kind: 'host-has-no-level', hostId: wallId };
        return { kind: 'resolved', levelId, levelName: levelNameOf(levelId) ?? levelId };
      } catch {
        return { kind: 'no-host' };
      }
    },
  };
}

/**
 * ADR-0385 — back the tree's building rung with the ONE resolver.
 *
 * ⛔ This function contains NO RULE. `resolveLevelBuilding()` in
 * `@pryzm/core-app-model` is the same call `packages/file-format`'s
 * `buildingContainment.ts` makes and the same one `projectTreeModel.ts` makes, so
 * the IFC file, the PRYZM tree and the IFC tree cannot give three answers to
 * "which building is this element in" (C84 EI-9, ADR-0328). Adding a second
 * derivation here is precisely how this repo's dominant defect recurs.
 *
 * The substrate is read ONCE per collection, so every element in one render sees
 * the same vintage of the hierarchy store.
 */
function buildBuildingIndex(): BuildingIndex {
  let substrate: BuildingSubstrate;
  try {
    substrate = readBuildingSubstrate();
  } catch (err) {
    // A throw is a FAILURE. Reporting it as "no buildings" would make an
    // unreadable store indistinguishable from an ungrouped project.
    warnOnce(`project hierarchy unavailable: ${String(err)}`);
    substrate = UNREADABLE_SUBSTRATE;
  }
  return {
    resolveLevelBuilding(levelId) {
      const r = resolveLevelBuilding(levelId, substrate);
      return r.kind === 'unknown'
        ? { kind: 'unknown', why: r.why }
        : { kind: r.kind, buildingId: r.buildingId as string, name: r.name as string };
    },
  };
}

function collectSources(): IfcTreeSource[] {
  const out: IfcTreeSource[] = [];

  try {
    const store = (window as unknown as { ifcModelStore?: { getAll?(): unknown[] } }).ifcModelStore;
    for (const m of store?.getAll?.() ?? []) {
      out.push(adaptImportedModel(m as Parameters<typeof adaptImportedModel>[0]));
    }
  } catch (err) {
    warnOnce(`imported IFC models unavailable: ${String(err)}`);
  }

  try {
    const w = window as unknown as Record<string, { getAll?(): unknown[] } | undefined>;
    // The same store table ProjectTreeZone uses, so the two trees agree on what
    // exists. Families absent from this list are absent from BOTH trees.
    const table: Record<string, string> = {
      wallStore: 'wall',
      slabStore: 'slab',
      columnStore: 'column',
      roomStore: 'room',
      doorStore: 'door',
      windowStore: 'window',
      beamStore: 'beam',
      roofStore: 'roof',
      stairStore: 'stair',
      furnitureStore: 'furniture',
    };
    // §IFC-TREE-HOSTED-STOREY (L-8900). A door/window carries `wallId` and NO
    // `levelId` (schemas/src/elements/Door.ts:48, Window.ts:48) — C15 makes a
    // hosted opening an offset along a wall, so its storey belongs to the wall.
    // Without this index every door and window fell into "Not assigned to a
    // storey", which was a FALSE STATEMENT ABOUT THE MODEL.
    const hosts = buildHostIndex();

    const native: Parameters<typeof adaptNativeElements>[0][number][] = [];
    for (const [storeName, type] of Object.entries(table)) {
      const items = w[storeName]?.getAll?.() ?? [];
      for (const raw of items) {
        const e = raw as Record<string, unknown>;
        const levelId = typeof e['levelId'] === 'string' ? (e['levelId'] as string) : undefined;
        const frame = e['frameFinish'] as { materialId?: string } | undefined;
        const leaf = e['leafFinish'] as { materialId?: string } | undefined;
        native.push({
          id: String(e['id'] ?? ''),
          type: String(e['type'] ?? type),
          name: typeof e['name'] === 'string' ? (e['name'] as string) : undefined,
          levelId,
          levelName: levelId ? levelNameOf(levelId) : undefined,
          material: typeof e['material'] === 'string' ? (e['material'] as string) : null,
          // C100 §9.1 — one finish PER SURFACE, never collapsed into one id.
          frameMaterial: typeof frame?.materialId === 'string' ? frame.materialId : null,
          leafMaterial: typeof leaf?.materialId === 'string' ? leaf.materialId : null,
          wallId: typeof e['wallId'] === 'string' ? (e['wallId'] as string) : null,
          ifcData: (e['ifcData'] as { guid?: string } | undefined) ?? null,
        });
      }
    }
    // ADR-0385 — the fourth argument is the building rung's authority.
    if (native.length > 0) {
      out.push(adaptNativeElements(native, 'PRYZM model', hosts, buildBuildingIndex()));
    }
  } catch (err) {
    warnOnce(`native stores unavailable: ${String(err)}`);
  }

  return out;
}

function applyMode(next: TreeMode, pryzmTree: HTMLElement, ifcHost: HTMLElement): void {
  mode = next;
  pryzmTree.style.display = next === 'pryzm' ? '' : 'none';
  ifcHost.style.display = next === 'ifc' ? '' : 'none';
  if (next === 'ifc') view?.setSources(collectSources());
}

/** Attach once the Inspect panel's DOM exists. Idempotent. */
function tryAttach(): boolean {
  const stack = document.getElementById('aud-stack');
  if (!stack) return false;
  if (document.getElementById(TOGGLE_ID)) return true; // already attached

  const actions = stack.querySelector('.aud-header-actions');
  const pryzmTree = document.getElementById('aud-project-tree');
  if (!actions || !pryzmTree) {
    warnOnce(
      'Inspect header/tree selectors did not match — the Inspect panel was restructured. ' +
        'The IFC tree toggle is NOT mounted. Nothing else is affected.',
    );
    return true; // stop retrying; this is a structural change, not a race
  }

  const ifcHost = document.createElement('div');
  ifcHost.id = HOST_ID;
  ifcHost.style.display = 'none';
  pryzmTree.parentElement?.insertBefore(ifcHost, pryzmTree.nextSibling);

  view = createIfcTreeView({
    onSelect: (id) => {
      try {
        selectionBus.select(id, 'inspect-panel');
      } catch (err) {
        warnOnce(`selection failed: ${String(err)}`);
      }
    },
    // ⛔ No AI port until the BYOK route is wired. The story card renders its
    // Ask affordance DISABLED with a stated reason rather than calling out.
    aiPort: null,
  });
  ifcHost.appendChild(view.element);

  const toggle = createTreeToggle(mode, (m) => applyMode(m, pryzmTree, ifcHost));
  toggle.element.id = TOGGLE_ID;
  actions.insertBefore(toggle.element, actions.firstChild);

  applyMode(mode, pryzmTree, ifcHost);
  return true;
}

/**
 * The Inspect panel is a module-load singleton that appends to `document.body`,
 * so by the time this module's own load runs the node may or may not exist.
 * Retry a bounded number of animation-free ticks, then give up quietly.
 *
 * ⚠ Deliberately NOT `requestAnimationFrame` — P3 reserves rAF to the frame
 * scheduler (`packages/frame-scheduler/src/RafAdapter.ts`) and a stray call here
 * would breach a hard-failing gate.
 */
function scheduleAttach(attemptsLeft = 40): void {
  if (tryAttach()) return;
  if (attemptsLeft <= 0) {
    warnOnce('Inspect panel never appeared; IFC tree toggle not mounted.');
    return;
  }
  setTimeout(() => scheduleAttach(attemptsLeft - 1), 250);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pryzm-ifc-tree-updated', () => {
    if (mode === 'ifc') view?.setSources(collectSources());
  });
  scheduleAttach();
}

export { tryAttach as __attachIfcTreeForTest };
