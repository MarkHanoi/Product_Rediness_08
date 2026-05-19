/**
 * ElementsSummarySection — ELEMENTS card renderer for UnifiedBrowserPanel.
 *
 * Renders the expandable category → type → instance accordion.
 * Visibility and selection callbacks are delegated back through UBPBag
 * to ProjectVisibilitySection functions.
 */

import type { UBPBag }                  from './BrowserDataHelpers';
import { getCategoryElements, getSubType, getLevels, getTypeIcon } from './BrowserDataHelpers';
import {
    applyElementVisibility,
    applyCategoryVisibility,
    applyCategoryTypeVisibility,
    selectElements,
} from './ProjectVisibilitySection';
import { selectionBus } from '@pryzm/core-app-model';

// ── ELEMENTS card ─────────────────────────────────────────────────────────────

export function buildElementsCard(bag: UBPBag): HTMLElement {
    const categories: Array<{ label: string; icon: string }> = [
        { label: 'Walls',             icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="8" rx="0.5" stroke="#888" stroke-width="1.1"/><line x1="1.5" y1="5.5" x2="11.5" y2="5.5" stroke="#888" stroke-width="1"/><line x1="6.5" y1="5.5" x2="6.5" y2="10.5" stroke="#888" stroke-width="1"/></svg>` },
        { label: 'Curtain Walls',     icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="11" height="11" rx="0.5" stroke="#888" stroke-width="1.1"/><line x1="4.5" y1="1" x2="4.5" y2="12" stroke="#888" stroke-width="1"/><line x1="8.5" y1="1" x2="8.5" y2="12" stroke="#888" stroke-width="1"/><line x1="1" y1="4.5" x2="12" y2="4.5" stroke="#888" stroke-width="1"/><line x1="1" y1="8.5" x2="12" y2="8.5" stroke="#888" stroke-width="1"/></svg>` },
        { label: 'Slabs',             icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="5" width="11" height="5" rx="0.5" stroke="#888" stroke-width="1.1"/><rect x="1" y="3" width="11" height="2" rx="0.5" stroke="#888" stroke-width="1"/></svg>` },
        { label: 'Floors',            icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="8" width="11" height="3" rx="0.5" stroke="#888" stroke-width="1.1"/><line x1="3" y1="8" x2="3" y2="5" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="6.5" y1="8" x2="6.5" y2="5" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="10" y1="8" x2="10" y2="5" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="1" y1="5" x2="12" y2="5" stroke="#888" stroke-width="1"/></svg>` },
        { label: 'Ceilings',          icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="2" width="11" height="3" rx="0.5" stroke="#888" stroke-width="1.1"/><line x1="3" y1="5" x2="3" y2="8" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="6.5" y1="5" x2="6.5" y2="8" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="10" y1="5" x2="10" y2="8" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="1" y1="8" x2="12" y2="8" stroke="#888" stroke-width="1"/></svg>` },
        { label: 'Roofs',             icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 7.5L6.5 3 12 7.5" stroke="#888" stroke-width="1.1" stroke-linecap="round"/><rect x="3" y="7.5" width="7" height="4" rx="0.5" stroke="#888" stroke-width="1"/></svg>` },
        { label: 'Doors',             icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="3" y="1.5" width="7" height="10" rx="0.5" stroke="#888" stroke-width="1.1"/><circle cx="9" cy="6.5" r="0.8" fill="#888"/></svg>` },
        { label: 'Windows',           icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="2" width="9" height="9" rx="0.5" stroke="#888" stroke-width="1.1"/><line x1="6.5" y1="2" x2="6.5" y2="11" stroke="#888" stroke-width="1"/><line x1="2" y1="6.5" x2="11" y2="6.5" stroke="#888" stroke-width="1"/></svg>` },
        { label: 'Openings',          icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="8" rx="0.5" stroke="#888" stroke-width="1.1"/><rect x="4" y="2.5" width="5" height="8" rx="0" stroke="#888" stroke-width="1" stroke-dasharray="2 1.5"/></svg>` },
        { label: 'Furniture',         icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="3.5" width="9" height="8" rx="1" stroke="#888" stroke-width="1.1"/><path d="M4.5 3.5V3a1.5 1.5 0 013 0v.5" stroke="#888" stroke-width="1"/></svg>` },
        { label: 'Lighting Fixtures', icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="5" r="2.5" stroke="#888" stroke-width="1.1"/><line x1="6.5" y1="1" x2="6.5" y2="2" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="6.5" y1="7.5" x2="6.5" y2="12" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="3.4" y1="2.4" x2="4.1" y2="3.1" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="9.6" y1="2.4" x2="8.9" y2="3.1" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="1" y1="5" x2="2" y2="5" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="12" y1="5" x2="11" y2="5" stroke="#888" stroke-width="1" stroke-linecap="round"/></svg>` },
        { label: 'Stairs',            icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 10h3V7h3V4h3V1" stroke="#888" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
        { label: 'Handrails',         icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 4h11" stroke="#888" stroke-width="1.3" stroke-linecap="round"/><line x1="3" y1="4" x2="3" y2="10" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="6.5" y1="4" x2="6.5" y2="10" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="10" y1="4" x2="10" y2="10" stroke="#888" stroke-width="1" stroke-linecap="round"/><line x1="1" y1="10" x2="12" y2="10" stroke="#888" stroke-width="1" stroke-linecap="round"/></svg>` },
        { label: 'Columns',           icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4.5" y="1.5" width="4" height="10" rx="0.5" stroke="#888" stroke-width="1.1"/><line x1="2" y1="2.5" x2="11" y2="2.5" stroke="#888" stroke-width="1"/><line x1="2" y1="10.5" x2="11" y2="10.5" stroke="#888" stroke-width="1"/></svg>` },
        { label: 'Beams',             icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="5" width="11" height="3" rx="0.5" stroke="#888" stroke-width="1.1"/><line x1="3" y1="8" x2="3" y2="10" stroke="#888" stroke-width="1"/><line x1="10" y1="8" x2="10" y2="10" stroke="#888" stroke-width="1"/></svg>` },
        { label: 'Plumbing',          icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="7.5" r="3" stroke="#888" stroke-width="1.1"/><line x1="6.5" y1="1" x2="6.5" y2="4.5" stroke="#888" stroke-width="1.1" stroke-linecap="round"/><line x1="4" y1="1" x2="9" y2="1" stroke="#888" stroke-width="1" stroke-linecap="round"/></svg>` },
        { label: 'Rooms',             icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="1.5" width="10" height="10" rx="0.5" stroke="#888" stroke-width="1.1"/><path d="M1.5 6h5.5v5.5" stroke="#888" stroke-width="1" stroke-linecap="round"/></svg>` },
    ];

    const cardBody = document.createElement('div');
    let totalCount = 0;

    for (const cat of categories) {
        const elements = getCategoryElements(bag, cat.label);
        totalCount += elements.length;
        cardBody.appendChild(buildElementCategoryRow(bag, cat.label, cat.icon, elements));
    }

    const addRow = document.createElement('div');
    addRow.className = 'pb-ubp-add-row';
    addRow.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.5"/>
        <line x1="5.5" y1="3" x2="5.5" y2="8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
        <line x1="3" y1="5.5" x2="8" y2="5.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg> Add element`;
    cardBody.appendChild(addRow);

    return cardBody;
}

// ── Expandable category row ───────────────────────────────────────────────────

export function buildElementCategoryRow(
    bag: UBPBag,
    catLabel: string,
    iconHtml: string,
    elements: any[],
): HTMLElement {
    const isExpanded = bag.catExpanded.has(catLabel);
    const catVis     = bag.catVisible.get(catLabel) ?? true;

    const wrapper = document.createElement('div');
    wrapper.className = 'pb-ubp-ec-row';

    const hdr = document.createElement('div');
    hdr.className = 'pb-ubp-ec-hdr';

    const iconEl = document.createElement('span');
    iconEl.className = 'pb-ubp-ec-icon';
    iconEl.innerHTML = iconHtml;

    const labelEl = document.createElement('span');
    labelEl.className   = 'pb-ubp-ec-label';
    labelEl.textContent = catLabel;

    const countEl = document.createElement('span');
    countEl.className   = 'pb-ubp-ec-count';
    countEl.textContent = String(elements.length);

    const visBtn = bag.makeVisBtn(catVis, (visible) => {
        applyCategoryVisibility(bag, catLabel, visible);
        bag.refresh();
    });

    const isoBtn = bag.makeIsoBtn(
        `cat:${catLabel}`,
        () => elements.map(el => String(el.id)),
    );

    const chevron = document.createElement('span');
    chevron.className   = 'pb-ubp-ec-chevron' + (isExpanded ? ' pb-ubp-ec-chevron--open' : '');
    chevron.textContent = '›';

    hdr.appendChild(iconEl);
    hdr.appendChild(labelEl);
    hdr.appendChild(countEl);
    hdr.appendChild(visBtn);
    hdr.appendChild(isoBtn);
    hdr.appendChild(chevron);
    wrapper.appendChild(hdr);

    const body = document.createElement('div');
    body.className     = 'pb-ubp-ec-body';
    body.style.display = isExpanded ? '' : 'none';

    if (isExpanded) {
        populateCategoryBody(bag, body, catLabel, elements);
    }

    wrapper.appendChild(body);

    hdr.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.closest('.pb-ubp-st-vis') || t.closest('.pb-ubp-st-iso')) return;

        if (bag.catExpanded.has(catLabel)) {
            bag.catExpanded.delete(catLabel);
            body.style.display = 'none';
            chevron.classList.remove('pb-ubp-ec-chevron--open');
        } else {
            bag.catExpanded.add(catLabel);
            body.style.display = '';
            chevron.classList.add('pb-ubp-ec-chevron--open');
            if (!body.hasChildNodes()) {
                populateCategoryBody(bag, body, catLabel, elements);
            }
        }
        selectElements(elements.map(el => String(el.id)));
    });

    return wrapper;
}

// ── Populate body ─────────────────────────────────────────────────────────────

export function populateCategoryBody(
    bag: UBPBag,
    body: HTMLElement,
    catLabel: string,
    elements: any[],
): void {
    body.innerHTML = '';

    const typeMap = new Map<string, any[]>();
    for (const el of elements) {
        const st = getSubType(catLabel, el);
        if (!typeMap.has(st)) typeMap.set(st, []);
        typeMap.get(st)!.push(el);
    }

    if (typeMap.size === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:6px 8px;font-size:10.5px;color:var(--app-text-muted)';
        empty.textContent   = 'No elements';
        body.appendChild(empty);
        return;
    }

    for (const [typeName, typeElems] of typeMap) {
        body.appendChild(buildCategoryTypeGroup(bag, catLabel, typeName, typeElems));
    }
}

// ── Type group inside a category ──────────────────────────────────────────────

export function buildCategoryTypeGroup(
    bag: UBPBag,
    catLabel: string,
    typeName: string,
    elements: any[],
): HTMLElement {
    const typeKey    = `${catLabel}:${typeName}`;
    const isExpanded = bag.catTypeExpanded.get(catLabel)?.has(typeName) ?? false;
    const typeVis    = bag.catTypeVisible.get(typeKey) ?? true;

    const group = document.createElement('div');

    const typeHdr = document.createElement('div');
    typeHdr.className = 'pb-ubp-ec-type-hdr';

    const typeChevron = document.createElement('span');
    typeChevron.className   = 'pb-ubp-ec-type-chevron' + (isExpanded ? ' pb-ubp-ec-type-chevron--open' : '');
    typeChevron.textContent = '›';

    const typeIconEl = document.createElement('span');
    typeIconEl.className = 'pb-ubp-ec-type-icon';
    typeIconEl.innerHTML = getTypeIcon(typeName);

    const typeNameEl = document.createElement('span');
    typeNameEl.className   = 'pb-ubp-ec-type-name';
    typeNameEl.textContent = typeName;

    const typeCountEl = document.createElement('span');
    typeCountEl.className   = 'pb-ubp-ec-type-count';
    typeCountEl.textContent = `${elements.length}`;

    const typeVisBtn = bag.makeVisBtn(typeVis, (visible) => {
        applyCategoryTypeVisibility(bag, catLabel, typeName, visible);
        bag.refresh();
    });
    const typeIsoBtn = bag.makeIsoBtn(
        `cat-type:${catLabel}:${typeName}`,
        () => elements.map(el => String(el.id)),
    );

    typeHdr.appendChild(typeChevron);
    typeHdr.appendChild(typeIconEl);
    typeHdr.appendChild(typeNameEl);
    typeHdr.appendChild(typeCountEl);
    typeHdr.appendChild(typeVisBtn);
    typeHdr.appendChild(typeIsoBtn);
    group.appendChild(typeHdr);

    const instBody = document.createElement('div');
    instBody.className     = 'pb-ubp-ec-inst-body';
    instBody.style.display = isExpanded ? '' : 'none';

    if (isExpanded) {
        populateInstanceBody(bag, instBody, catLabel, elements);
    }
    group.appendChild(instBody);

    typeHdr.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.closest('.pb-ubp-st-vis') || t.closest('.pb-ubp-st-iso')) return;

        if (!bag.catTypeExpanded.has(catLabel)) {
            bag.catTypeExpanded.set(catLabel, new Set());
        }
        const ts = bag.catTypeExpanded.get(catLabel)!;
        if (ts.has(typeName)) {
            ts.delete(typeName);
            instBody.style.display = 'none';
            typeChevron.classList.remove('pb-ubp-ec-type-chevron--open');
        } else {
            ts.add(typeName);
            instBody.style.display = '';
            typeChevron.classList.add('pb-ubp-ec-type-chevron--open');
            if (!instBody.hasChildNodes()) {
                populateInstanceBody(bag, instBody, catLabel, elements);
            }
        }
        selectElements(elements.map(el => String(el.id)));
    });

    return group;
}

// ── Instance rows inside a type ───────────────────────────────────────────────

export function populateInstanceBody(
    bag: UBPBag,
    container: HTMLElement,
    catLabel: string,
    elements: any[],
): void {
    container.innerHTML = '';
    for (const el of elements) {
        const id    = String(el.id);
        const isVis = bag.elemVisible.get(id) ?? true;
        const isSel = bag.selectedElemId === id;

        const instRow = document.createElement('div');
        instRow.className = 'pb-ubp-ec-inst-row' + (isSel ? ' pb-ubp-ec-inst-row--selected' : '');

        const dot = document.createElement('span');
        dot.className = 'pb-ubp-ec-inst-dot';

        const nameEl = document.createElement('span');
        nameEl.className   = 'pb-ubp-ec-inst-name';
        const shortId = id.substring(0, 6).toUpperCase();
        nameEl.textContent = el.name || el.mark || `${catLabel.slice(0, -1)} ${shortId}`;
        nameEl.title       = nameEl.textContent;

        const levels     = getLevels();
        const levelLabel = levels.find(l => String(l.id) === String(el.levelId))?.name ?? el.levelId ?? '';
        const levelBadge = document.createElement('span');
        levelBadge.className   = 'pb-ubp-ec-inst-level';
        levelBadge.textContent = levelLabel;

        const visBtn = bag.makeVisBtn(isVis, (visible) => {
            bag.elemVisible.set(id, visible);
            applyElementVisibility(bag, id, visible);
            bag.refresh();
        });

        const isoBtn = bag.makeIsoBtn(`cat-inst:${id}`, () => [id]);

        instRow.appendChild(dot);
        instRow.appendChild(nameEl);
        instRow.appendChild(levelBadge);
        instRow.appendChild(visBtn);
        instRow.appendChild(isoBtn);

        instRow.addEventListener('click', (e) => {
            const t = e.target as HTMLElement;
            if (t.closest('.pb-ubp-st-vis') || t.closest('.pb-ubp-st-iso')) return;
            bag.selectedElemId = id;
            selectionBus.select(id, 'elements-panel');
            bag.refresh();
        });

        container.appendChild(instRow);
    }
}
