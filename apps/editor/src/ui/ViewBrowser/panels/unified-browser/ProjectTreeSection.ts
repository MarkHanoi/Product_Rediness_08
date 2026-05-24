/**
 * ProjectTreeSection — PROJECT card renderer for UnifiedBrowserPanel.
 *
 * Renders: Site → Building → Level blocks → Type groups → Element/Child rows.
 * Also contains the unified level system (IFC + native PRYZM levels merged).
 *
 * P6b fix (Wave 14):
 *   BEFORE: `window.the legacy command manager)` (line 466 original)
 *   AFTER:  `bag.runtime.bus.executeCommand(cmd.type, cmd)` — runtime.bus is the
 *            correct PryzmRuntime API; `runtime.commandBus` does not exist on the type.
 *   Metadata `{ source: 'HUMAN_DIRECT' }` was not passed to execute in the original
 *   either — no behaviour change; TODO(E.5.x) metadata preserved via console.log note.
 *
 * window.bimManager (line 451 original) retained with TODO(D.4) — read-only for
 * getLevels()/getActive() — not a mutation, not a P6 violation.
 *
 * Selection: selectionBus.select() used per Contract 27 §4 (unchanged).
 */

import type { UBPBag }           from './BrowserDataHelpers';
import {
    getLevels,
    getUnifiedLevels,
    getElementsForLevel,
    getTypeElementIds,
    getTypeIcon,
    groupByType,
    getAllElementIds,
    isActiveLevel,
    setActiveLevel,
} from './BrowserDataHelpers';
import {
    applyLevelVisibility,
    applyElementVisibility,
    selectElements,
} from './ProjectVisibilitySection';
import { selectionBus }     from '@pryzm/core-app-model';
import { AddLevelCommand }  from '@pryzm/command-registry';

// ── PROJECT card ──────────────────────────────────────────────────────────────

export function buildProjectCard(bag: UBPBag): HTMLElement {
    const levels = getUnifiedLevels();

    const tree = document.createElement('div');
    tree.className = 'pb-ubp-st-tree';

    // ── Site row ──────────────────────────────────────────────────────────────
    const siteRow = document.createElement('div');
    siteRow.className = 'pb-ubp-st-site';
    siteRow.innerHTML = `
        <svg class="pb-ubp-st-site-icon" width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M7.5 1.5C5.5 1.5 4 3.2 4 5.5c0 3.3 3.5 7.5 3.5 7.5s3.5-4.2 3.5-7.5c0-2.3-1.5-4-3.5-4z" stroke="currentColor" stroke-width="1.2"/>
            <circle cx="7.5" cy="5.5" r="1.4" stroke="currentColor" stroke-width="1.1"/>
        </svg>
        <span>Site</span>
    `;
    tree.appendChild(siteRow);

    // ── Building row ──────────────────────────────────────────────────────────
    const buildingRow = document.createElement('div');
    buildingRow.className = 'pb-ubp-st-building';
    buildingRow.title     = 'Click to select all elements';

    const buildingIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    buildingIcon.setAttribute('class',   'pb-ubp-st-building-icon');
    buildingIcon.setAttribute('width',   '14');
    buildingIcon.setAttribute('height',  '14');
    buildingIcon.setAttribute('viewBox', '0 0 15 15');
    buildingIcon.setAttribute('fill',    'none');
    buildingIcon.innerHTML = `
        <rect x="2" y="3" width="11" height="11" rx="1" stroke="currentColor" stroke-width="1.2"/>
        <path d="M5 3V2a2.5 2.5 0 015 0v1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <rect x="5" y="8" width="2" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/>
        <rect x="8" y="8" width="2" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/>
        <line x1="2" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1"/>
    `;

    const buildingLabel   = document.createElement('span');
    buildingLabel.textContent = 'Building';

    const buildingSpacer  = document.createElement('span');
    buildingSpacer.className = 'pb-ubp-st-building-spacer';

    const buildingVisBtn  = bag.makeVisBtn(bag.buildingVisible, (visible) => {
        bag.buildingVisible = visible;
        for (const lvl of getUnifiedLevels()) {
            bag.levelVisible.set(String(lvl.id), visible);
            applyLevelVisibility(bag, String(lvl.id), visible);
        }
        bag.refresh();
    });

    const buildingIsoBtn  = bag.makeIsoBtn('building', () => getAllElementIds(bag));

    buildingRow.appendChild(buildingIcon);
    buildingRow.appendChild(buildingLabel);
    buildingRow.appendChild(buildingSpacer);
    buildingRow.appendChild(buildingVisBtn);
    buildingRow.appendChild(buildingIsoBtn);

    buildingRow.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.closest('.pb-ubp-st-vis') || t.closest('.pb-ubp-st-iso')) return;
        selectElements(getAllElementIds(bag));
    });

    tree.appendChild(buildingRow);

    // ── Level rows ────────────────────────────────────────────────────────────
    if (levels.length === 0) {
        const empty = document.createElement('div');
        empty.className   = 'pb-ubp-st-empty';
        empty.textContent = 'No levels defined';
        tree.appendChild(empty);
    } else {
        for (const lvl of levels) {
            tree.appendChild(buildLevelBlock(bag, lvl));
        }
    }

    // ── "Add level" row ───────────────────────────────────────────────────────
    const addRow = document.createElement('div');
    addRow.className = 'pb-ubp-st-addlvl';
    addRow.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.5"/>
            <line x1="5.5" y1="3" x2="5.5" y2="8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <line x1="3" y1="5.5" x2="8" y2="5.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
        </svg>
        Add level
    `;
    addRow.addEventListener('click', () => {
        // P6b fix (Wave 14): window.commandManager.execute() → runtime.bus.executeCommand()
        // TODO(E.5.x): metadata { source: 'HUMAN_DIRECT' } not forwarded here (command bus
        //              does not accept metadata in the current API shape; wire when E.5.x lands).
        const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.tools
        // §ADD-LEVEL-RUNTIME-FIX (C02/P1): bag.runtime is captured at panel construction
        // and is null when the browser panel is built before composeRuntime() publishes
        // the runtime — so "Add level" silently no-opped (same root cause as the
        // view-create no-op, fix §VIEW-CREATE-RUNTIME-FIX). Prefer the composed handle,
        // fall back to the live global runtime so the button never silently drops.
        const bus = bag.runtime?.bus ?? window.runtime?.bus;
        if (!bus || !bimManager) {
            console.warn('[UBP] runtime.bus not available — cannot add level; TODO(E.5.x)');
            return;
        }
        const currentLevels = getLevels();
        const elevations    = currentLevels.map((l: any) => l.elevation ?? 0);
        const maxElev       = elevations.length > 0 ? Math.max(...elevations) : 0;
        const prevDiff      = elevations.length >= 2
            ? Math.abs(elevations[elevations.length - 1] - elevations[elevations.length - 2])
            : 3;
        const floorH  = Math.max(prevDiff, 3);
        const newElev = Math.round((maxElev + floorH) * 100) / 100;
        const newId   = `L${Date.now()}`;
        const newName = `Level ${currentLevels.length}`;
        const cmd = new AddLevelCommand({ levelId: newId, name: newName, elevation: newElev, height: floorH });
        bus.executeCommand(cmd.type, cmd);
    });
    tree.appendChild(addRow);

    return tree;
}

// ── Level block ───────────────────────────────────────────────────────────────

export function buildLevelBlock(
    bag: UBPBag,
    lvl: { id: string; name: string; elevation?: number; isIfcOnly?: boolean },
): HTMLElement {
    const levelId   = String(lvl.id);
    const isIfcOnly = !!(lvl as any).isIfcOnly;
    const isActive  = !isIfcOnly && isActiveLevel(levelId);
    const isOpen    = bag.expandedLevels.has(levelId);
    const lvlVis    = bag.levelVisible.get(levelId) ?? true;
    const elements  = getElementsForLevel(bag, levelId);
    const elemCount = elements.length;

    const block = document.createElement('div');
    block.className = 'pb-ubp-st-level' + (isActive ? ' pb-ubp-st-level--active' : '');

    const hdr = document.createElement('div');
    hdr.className = 'pb-ubp-st-level-hdr';

    const chevron = document.createElement('span');
    chevron.className = 'pb-ubp-st-level-chevron' + (isOpen ? ' pb-ubp-st-level-chevron--open' : '');
    chevron.innerHTML = '›';

    const iconColor = isActive ? '#6600FF' : (isIfcOnly ? '#8B6CE8' : '#8888aa');
    const iconSpan  = document.createElement('span');
    iconSpan.className = 'pb-ubp-st-level-icon';
    iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="4" width="12" height="8" rx="1" stroke="${iconColor}" stroke-width="1.1"/>
        <line x1="1" y1="7" x2="13" y2="7" stroke="${iconColor}" stroke-width="1"/>
        <line x1="3" y1="2.5" x2="11" y2="2.5" stroke="${iconColor}" stroke-width="1" stroke-linecap="round"/>
        <line x1="5" y1="1" x2="9" y2="1" stroke="${iconColor}" stroke-width="1" stroke-linecap="round"/>
    </svg>`;

    const nameEl    = document.createElement('span');
    nameEl.className = 'pb-ubp-st-level-name';
    const elevText   = lvl.elevation !== undefined ? ` (${lvl.elevation}m)` : '';
    nameEl.textContent = `${lvl.name}${elevText}`;

    chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) bag.expandedLevels.delete(levelId);
        else        bag.expandedLevels.add(levelId);
        bag.refresh();
    });

    if (isIfcOnly) {
        const countEl  = document.createElement('span');
        countEl.className   = 'pb-ubp-st-level-count';
        countEl.textContent = `${elemCount}`;

        const ifcBadge = document.createElement('span');
        ifcBadge.style.cssText = [
            'font-size:9px', 'font-weight:700', 'color:#8B6CE8',
            'background:rgba(102,0,255,0.08)', 'border:1px solid rgba(102,0,255,0.2)',
            'border-radius:3px', 'padding:0 4px', 'letter-spacing:0.05em', 'flex-shrink:0',
        ].join(';');
        ifcBadge.textContent = 'IFC';

        hdr.appendChild(chevron);
        hdr.appendChild(iconSpan);
        hdr.appendChild(nameEl);
        hdr.appendChild(countEl);
        hdr.appendChild(ifcBadge);
    } else if (isActive) {
        const badge       = document.createElement('span');
        badge.className   = 'pb-ubp-st-level-badge';
        badge.textContent = 'ACTIVE';
        hdr.appendChild(chevron);
        hdr.appendChild(iconSpan);
        hdr.appendChild(nameEl);
        hdr.appendChild(badge);
    } else {
        const countEl = document.createElement('span');
        countEl.className   = 'pb-ubp-st-level-count';
        countEl.textContent = `${elemCount}`;

        const activateBtn = document.createElement('button');
        activateBtn.className = 'pb-ubp-st-level-activate';
        activateBtn.type      = 'button';
        activateBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <circle cx="4" cy="4" r="3" stroke="#6600FF" stroke-width="1.2"/>
            <circle cx="4" cy="4" r="1.2" fill="#6600FF"/>
        </svg>Set active`;
        activateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setActiveLevel(levelId);
            bag.expandedLevels.add(levelId);
            bag.refresh();
        });

        hdr.appendChild(chevron);
        hdr.appendChild(iconSpan);
        hdr.appendChild(nameEl);
        hdr.appendChild(countEl);
        hdr.appendChild(activateBtn);
    }

    const visBtn = bag.makeVisBtn(lvlVis, (visible) => {
        bag.levelVisible.set(levelId, visible);
        applyLevelVisibility(bag, levelId, visible);
        bag.refresh();
    });
    const isoBtn = bag.makeIsoBtn(
        `level:${levelId}`,
        () => getElementsForLevel(bag, levelId).map(el => String(el.id)),
    );
    hdr.appendChild(visBtn);
    hdr.appendChild(isoBtn);

    hdr.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.closest('.pb-ubp-st-vis'))            return;
        if (t.closest('.pb-ubp-st-iso'))            return;
        if (t.closest('.pb-ubp-st-level-activate')) return;
        if (t.closest('.pb-ubp-st-level-chevron'))  return;
        if (!isIfcOnly) setActiveLevel(levelId);
        bag.expandedLevels.add(levelId);
        const ids = getElementsForLevel(bag, levelId).map(el => String(el.id));
        selectElements(ids);
        bag.refresh();
    });

    block.appendChild(hdr);

    if (isOpen) {
        const children = document.createElement('div');
        children.className = 'pb-ubp-st-level-children';

        if (elements.length === 0) {
            const empty = document.createElement('div');
            empty.className   = 'pb-ubp-st-empty';
            empty.textContent = 'No elements on this level';
            children.appendChild(empty);
        } else {
            const typeMap = groupByType(elements, levelId);
            for (const [typeName, typeElems] of typeMap) {
                children.appendChild(buildTypeGroup(bag, levelId, typeName, typeElems));
            }
        }

        block.appendChild(children);
    }

    return block;
}

// ── Type group ────────────────────────────────────────────────────────────────

export function buildTypeGroup(
    bag: UBPBag,
    levelId: string,
    typeName: string,
    elements: any[],
): HTMLElement {
    const typeSet = bag.expandedTypes.get(levelId) ?? new Set<string>();
    const isOpen  = typeSet.has(typeName);

    const group   = document.createElement('div');
    group.className = 'pb-ubp-st-type';

    const typeHdr = document.createElement('div');
    typeHdr.className = 'pb-ubp-st-type-hdr';

    const typeChevron = document.createElement('span');
    typeChevron.className = 'pb-ubp-st-type-chevron' + (isOpen ? ' pb-ubp-st-type-chevron--open' : '');
    typeChevron.innerHTML = '›';

    const typeIcon  = document.createElement('span');
    typeIcon.className = 'pb-ubp-st-type-icon';
    typeIcon.innerHTML = getTypeIcon(typeName);

    const typeLbl   = document.createElement('span');
    typeLbl.className   = 'pb-ubp-st-type-name';
    typeLbl.textContent = typeName;

    const typeCount = document.createElement('span');
    typeCount.className   = 'pb-ubp-st-type-count';
    typeCount.textContent = String(elements.length);

    const typeVisKey = `${levelId}:${typeName}`;
    const typeVis    = bag.typeVisible.get(typeVisKey) ?? true;

    const typeVisBtn = bag.makeVisBtn(typeVis, (visible) => {
        bag.typeVisible.set(typeVisKey, visible);
        for (const el of elements) {
            bag.elemVisible.set(String(el.id), visible);
            applyElementVisibility(bag, String(el.id), visible);
        }
        bag.refresh();
    });

    const typeIsoBtn = bag.makeIsoBtn(
        `type:${levelId}:${typeName}`,
        () => getTypeElementIds(bag, levelId, typeName),
    );

    typeHdr.appendChild(typeChevron);
    typeHdr.appendChild(typeIcon);
    typeHdr.appendChild(typeLbl);
    typeHdr.appendChild(typeCount);
    typeHdr.appendChild(typeVisBtn);
    typeHdr.appendChild(typeIsoBtn);

    typeHdr.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.closest('.pb-ubp-st-vis') || t.closest('.pb-ubp-st-iso')) return;

        if (!bag.expandedTypes.has(levelId)) {
            bag.expandedTypes.set(levelId, new Set());
        }
        const ts = bag.expandedTypes.get(levelId)!;
        if (ts.has(typeName)) {
            ts.delete(typeName);
        } else {
            ts.add(typeName);
        }
        selectElements(elements.map(el => String(el.id)));
        bag.refresh();
    });

    group.appendChild(typeHdr);

    if (isOpen) {
        const typeBody = document.createElement('div');
        typeBody.className = 'pb-ubp-st-type-body';

        for (const el of elements) {
            typeBody.appendChild(buildElemRow(bag, el));

            const wallStore = window.wallStore; // TODO(E.wall.S)
            if (el.childrenIds?.length && wallStore) {
                for (const childId of el.childrenIds) {
                    const child =
                        wallStore.getWindow?.(childId) ||
                        wallStore.getDoor?.(childId);
                    if (child) {
                        typeBody.appendChild(buildChildRow(bag, child));
                    }
                }
            }
        }

        group.appendChild(typeBody);
    }

    return group;
}

// ── Element row ───────────────────────────────────────────────────────────────

export function buildElemRow(bag: UBPBag, el: any): HTMLElement {
    const elemId = String(el.id);
    const isSel  = bag.selectedElemId === elemId;
    const isVis  = bag.elemVisible.get(elemId) ?? true;

    const row = document.createElement('div');
    row.className = 'pb-ubp-st-elem-row' + (isSel ? ' pb-ubp-st-elem-row--sel' : '');
    row.setAttribute('data-elem-id', elemId);

    const icon   = document.createElement('span');
    icon.className = 'pb-ubp-st-elem-icon';
    icon.innerHTML = getTypeIcon(el.type ?? el.elementType ?? '');

    const nameEl = document.createElement('span');
    nameEl.className   = 'pb-ubp-st-elem-name';
    const shortId = elemId.substring(0, 4).toUpperCase();
    nameEl.textContent = el.name || `${el.type ?? 'Element'} ${shortId}`;

    const visBtn = bag.makeVisBtn(isVis, (visible) => {
        bag.elemVisible.set(elemId, visible);
        applyElementVisibility(bag, elemId, visible);
        if (el.childrenIds) {
            for (const cid of el.childrenIds) {
                bag.elemVisible.set(String(cid), visible);
                applyElementVisibility(bag, String(cid), visible);
            }
        }
        bag.refresh();
    });
    const isoBtn = bag.makeIsoBtn(`elem:${elemId}`, () => [elemId]);

    row.appendChild(icon);
    row.appendChild(nameEl);
    row.appendChild(visBtn);
    row.appendChild(isoBtn);

    row.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.closest('.pb-ubp-st-vis') || t.closest('.pb-ubp-st-iso')) return;
        bag.selectedElemId = elemId;
        selectionBus.select(elemId, 'project-browser');
        bag.refresh();
    });

    return row;
}

// ── Child element row (door / window hosted by a wall) ────────────────────────

export function buildChildRow(bag: UBPBag, child: any): HTMLElement {
    const childId = String(child.id);
    const isSel   = bag.selectedElemId === childId;
    const isVis   = bag.elemVisible.get(childId) ?? true;

    const row = document.createElement('div');
    row.className = 'pb-ubp-st-child-row' + (isSel ? ' pb-ubp-st-child-row--sel' : '');
    row.setAttribute('data-elem-id', childId);

    const icon   = document.createElement('span');
    icon.className = 'pb-ubp-st-elem-icon';
    icon.innerHTML = child.type === 'window'
        ? `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1.5" y="1.5" width="8" height="8" rx="0.5" stroke="currentColor" stroke-width="1.1"/><line x1="5.5" y1="1.5" x2="5.5" y2="9.5" stroke="currentColor" stroke-width="1"/><line x1="1.5" y1="5.5" x2="9.5" y2="5.5" stroke="currentColor" stroke-width="1"/></svg>`
        : `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="2.5" y="1" width="6" height="9" rx="0.5" stroke="currentColor" stroke-width="1.1"/><circle cx="7.5" cy="5.5" r="0.7" fill="currentColor"/></svg>`;

    const nameEl  = document.createElement('span');
    nameEl.className   = 'pb-ubp-st-elem-name';
    const mark = child.properties?.mark || childId.substring(0, 4).toUpperCase();
    nameEl.textContent = `${(child.type ?? '').toUpperCase()} ${mark}`;

    const visBtn = bag.makeVisBtn(isVis, (visible) => {
        bag.elemVisible.set(childId, visible);
        applyElementVisibility(bag, childId, visible);
        bag.refresh();
    });

    row.appendChild(icon);
    row.appendChild(nameEl);
    row.appendChild(visBtn);

    row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.pb-ubp-st-vis')) return;
        bag.selectedElemId = childId;
        selectionBus.select(childId, 'project-browser');
        bag.refresh();
    });

    return row;
}
