/**
 * RelationshipViewer
 *
 * Displays semantic relationships between BIM elements.
 * Data sourced from element userData and available stores.
 *
 * Groups relationships by type:
 *  - Hosted By    (element lives inside a host, e.g. window in wall)
 *  - Hosts        (element contains children, e.g. wall contains windows)
 *  - Connected To (structural or spatial connections)
 *  - Adjacent To  (neighboring elements)
 *
 * Contract: Tool Layer only. Read access to stores via window globals.
 * Relationship navigation fires a 'bim-select-element' custom DOM event
 * so the selection system can handle it — no direct scene mutation.
 */

import { RelationshipEntry } from './types';

/**
 * Extracts relationship entries from element data.
 * Queries stores for labels where possible.
 */
export function extractRelationships(elementData: Record<string, any>): Map<string, RelationshipEntry[]> {
    const groups = new Map<string, RelationshipEntry[]>();

    const add = (groupName: string, entry: RelationshipEntry) => {
        if (!groups.has(groupName)) groups.set(groupName, []);
        groups.get(groupName)!.push(entry);
    };

    const resolve = (id: string): string => resolveLabel(id);

    const hostId = elementData.wallId ?? elementData.hostId ?? elementData.parentId;
    if (hostId) {
        add('Hosted By', { relationshipType: 'hosted_by', targetId: hostId, targetLabel: resolve(hostId) });
    }

    const children = elementData.childrenIds ?? elementData.hostedElements ?? [];
    if (Array.isArray(children) && children.length > 0) {
        children.forEach((childId: string) => {
            add('Hosts', { relationshipType: 'hosts', targetId: childId, targetLabel: resolve(childId) });
        });
    }

    const openings = elementData.openings ?? [];
    if (Array.isArray(openings) && openings.length > 0) {
        openings.forEach((o: any) => {
            const id = o.elementId ?? o.id;
            if (!id) return;
            const label = o.type ? `${o.type} (${id.substring(0, 8)})` : resolve(id);
            add('Hosted Openings', { relationshipType: 'has_opening', targetId: id, targetLabel: label });
        });
    }

    const supports = elementData.supportIds ?? [];
    if (Array.isArray(supports) && supports.length > 0) {
        supports.forEach((sid: string) => {
            add('Supports', { relationshipType: 'supports', targetId: sid, targetLabel: resolve(sid) });
        });
    }

    const connectedTo = elementData.connectedTo ?? elementData.adjacentIds ?? [];
    if (Array.isArray(connectedTo) && connectedTo.length > 0) {
        connectedTo.forEach((cid: string) => {
            add('Connected To', { relationshipType: 'connected_to', targetId: cid, targetLabel: resolve(cid) });
        });
    }

    if (elementData.staircaseId) {
        add('Part Of', { relationshipType: 'part_of', targetId: elementData.staircaseId, targetLabel: resolve(elementData.staircaseId) });
    }

    if (elementData.stairId) {
        add('Handrail For', { relationshipType: 'handrail_for', targetId: elementData.stairId, targetLabel: resolve(elementData.stairId) });
    }

    return groups;
}

/**
 * Resolves a BIM element ID to a human-readable label.
 * Searches available stores in window globals.
 */
function resolveLabel(id: string): string {
    if (!id) return '—';

    const storeNames = ['wallStore', 'slabStore', 'columnStore', 'beamStore', 'stairStore',
                        'roofStore', 'furnitureStore', 'curtainWallStore', 'handrailStore'];

    for (const name of storeNames) {
        const store = ((window as unknown as Record<string, any>))[name]; // TODO(E.<family>.S): legacy per-family window store reach — replace with runtime.stores.<family> when family stores are exposed via runtime in Phase E/F
        if (!store) continue;
        const el = store.getById?.(id) ?? store.get?.(id);
        if (!el) continue;
        const mark = el.properties?.mark ?? el.mark;
        const type = el.type ?? el.elementType ?? name.replace('Store', '');
        return mark ? `${type} — ${mark}` : `${type} (${id.substring(0, 8)}…)`;
    }

    return id.substring(0, 12) + '…';
}

/**
 * Renders the relationship groups as a DOM element.
 * Clicking a relationship fires a 'bim-select-element' custom event.
 */
export function renderRelationshipSection(
    groups: Map<string, RelationshipEntry[]>
): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    if (groups.size === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'font-size:11px;color:#bbb;font-style:italic;';
        empty.textContent = 'No relationships found';
        container.appendChild(empty);
        return container;
    }

    groups.forEach((entries, groupName) => {
        const group = document.createElement('div');

        const title = document.createElement('div');
        title.style.cssText = 'font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;';
        title.textContent = groupName;
        group.appendChild(title);

        entries.forEach(entry => {
            const chip = document.createElement('div');
            chip.style.cssText = `
                display:inline-flex;align-items:center;gap:6px;
                background:#eef2ff;border:1px solid #c7d2fe;
                border-radius:12px;padding:3px 10px;
                font-size:11px;color:#4338ca;cursor:pointer;
                margin:0 4px 4px 0;transition:background 0.1s;
            `;
            chip.textContent = entry.targetLabel ?? entry.targetId;
            chip.title = `Navigate to ${entry.targetId}`;

            chip.addEventListener('mouseenter', () => { chip.style.background = '#e0e7ff'; });
            chip.addEventListener('mouseleave', () => { chip.style.background = '#eef2ff'; });

            chip.addEventListener('click', () => {
                // F.events.16 — bim-select-element migrated to runtime.events typed bus.
                window.runtime?.events?.emit('bim-select-element', { id: entry.targetId });
            });

            group.appendChild(chip);
        });

        container.appendChild(group);
    });

    return container;
}
