/**
 * SchedulesRailPanel — Schedules section content for the left-rail system.
 *
 * Displays all project schedules organized by discipline group:
 *   ARCHITECTURE   — Walls, Floors, Roofs, Ceilings, Rooms, Stairs
 *   OPENINGS       — Doors, Windows, Curtain Walls
 *   STRUCTURE      — Columns, Beams, Slabs
 *   INTERIOR       — Furniture, Handrails
 *   MEP            — Plumbing Fixtures
 *   DATA PLATFORM  — Hierarchy, Template, and Programme schedules
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* elements; pure native HTML
 *   §01      — Read-only; no direct store mutations
 */

import { scheduleStore } from '@pryzm/core-app-model';
import type { ScheduleType } from '@pryzm/core-app-model';
import type { RailPanelController } from '../RailPanelController';

// Discipline group definitions — ordered and labelled.
interface DisciplineGroup {
    label: string;
    types: ScheduleType[];
}

const DISCIPLINE_GROUPS: DisciplineGroup[] = [
    {
        label: 'Architecture',
        types: ['walls', 'floors', 'roofs', 'ceilings', 'rooms', 'stairs'],
    },
    {
        label: 'Openings',
        types: ['doors', 'windows', 'curtainwalls'],
    },
    {
        label: 'Structure',
        types: ['columns', 'beams', 'slabs'],
    },
    {
        label: 'Interior',
        types: ['furniture', 'handrails'],
    },
    {
        label: 'MEP',
        types: ['plumbing'],
    },
    {
        label: 'Data Platform',
        types: ['custom'],
    },
];

// Types that belong to the "Data Platform" catch-all group.
const DATA_PLATFORM_IDS = new Set([
    'Hierarchy-Units',
    'Hierarchy-Levels',
    'Hierarchy-Buildings',
    'Rooms-WithTemplate',
    'Rooms-Conflicts',
    'ElementCodes-All',
    'Template-Compliance',
    'Rooms-Programme-Deviation',
]);

export class SchedulesRailPanel {
    private readonly _sectionId = 'SCHEDULES';

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private readonly _rail: RailPanelController, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        const refresh = () => this._rail.refreshIfActive(this._sectionId);
        window.addEventListener('sched:schedule-created', refresh);
        window.addEventListener('sched:schedule-updated', refresh);
        window.addEventListener('sched:schedule-deleted', refresh);
        window.addEventListener('sched:store-loaded',     refresh);
        window.addEventListener('sched:store-reset',      refresh);
    }

    build(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'pb-generic-list';

        const allSchedules = scheduleStore.getAll();

        if (allSchedules.length === 0) {
            const empty = document.createElement('div');
            empty.className   = 'pb-view-empty';
            empty.textContent = 'No schedules available';
            container.appendChild(empty);
            return container;
        }

        // ── Build a type → schedule map ──────────────────────────────────────
        const byType = new Map<ScheduleType, typeof allSchedules>();
        const dataPlatformSchedules: typeof allSchedules = [];

        for (const sched of allSchedules) {
            // Data Platform schedules are identified by their IDs
            if (DATA_PLATFORM_IDS.has(sched.id)) {
                dataPlatformSchedules.push(sched);
                continue;
            }
            const list = byType.get(sched.scheduleType) ?? [];
            list.push(sched);
            byType.set(sched.scheduleType, list);
        }

        // Also put the custom type into data platform
        const customSchedules = byType.get('custom') ?? [];
        byType.delete('custom');

        // ── Render each discipline group ─────────────────────────────────────
        for (const group of DISCIPLINE_GROUPS) {
            const groupSchedules: typeof allSchedules = [];

            if (group.label === 'Data Platform') {
                groupSchedules.push(...dataPlatformSchedules, ...customSchedules);
            } else {
                for (const type of group.types) {
                    const found = byType.get(type) ?? [];
                    groupSchedules.push(...found);
                }
            }

            if (groupSchedules.length === 0) continue;

            // Group header
            const groupHeader = document.createElement('div');
            groupHeader.className = 'pb-sched-group-header';
            groupHeader.textContent = group.label;
            container.appendChild(groupHeader);

            // Schedule entries in this group
            for (const sched of groupSchedules) {
                container.appendChild(this._buildEntry(sched));
            }
        }

        return container;
    }

    private _buildEntry(sched: { id: string; name: string }): HTMLElement {
        const entry = document.createElement('div');
        entry.className = 'pb-schedule-entry';
        entry.setAttribute('role', 'button');
        entry.setAttribute('tabindex', '0');
        entry.textContent = sched.name;
        entry.title       = `Open ${sched.name}`;

        const openSchedule = () => {
            const schedulePanel = window.schedulePanel; // TODO(F.6.5): legacy schedulePanel — replace with runtime.panelHost.get('schedules')
            if (schedulePanel?.show) {
                schedulePanel.show(sched.id);
            } else {
                console.warn('[SchedulesRailPanel] schedulePanel not available on window');
            }
            const viewPropertiesPanel = window.viewPropertiesPanel; // TODO(F.6.5): legacy viewPropertiesPanel — replace with runtime.panelHost.get('viewProperties')
            if (viewPropertiesPanel?.showSchedule) {
                viewPropertiesPanel.showSchedule(sched);
            }
        };

        entry.addEventListener('click', openSchedule);
        entry.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSchedule(); }
        });

        return entry;
    }
}
