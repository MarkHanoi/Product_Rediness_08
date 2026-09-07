// §ROOMS-PER-LEVEL (lane MASSING-SHAPES, 2026-09-07 · L-13039 · STR §25.5 / §26.6.4) — the small
// section the Parcel Law card mounts: the project's rooms PER STOREY, each storey with the level
// envelope it is designed inside.
//
// ── ⛔ IT COMPUTES NOTHING. `groupRoomsPerLevel` (roomsPerLevelModel.ts) decides every grouping,
// sum and reason; this file reads three live sources, hands them to the model, and paints the
// answer. The three reads are the SAME reads their neighbours already make — rooms off the legacy
// `window.roomStore` exactly as `roomProgrammePanel.readProjectRoomsFrom` does, storeys off
// `bimManager.getLevels()` through `readLevelCandidates`, level envelopes through
// `readLevelEnvelopes` — so this surface cannot disagree with the programme above it or the adopt
// planner beside it about which rooms and which envelopes exist (C84 EI-9).
//
// ── LIVE, BY SUBSCRIPTION, NOT BY TIMER ──────────────────────────────────────────────────────
// Rooms move when the generator runs or a room is renamed (`RoomStore.subscribe`); level envelopes
// move on adopt / undo / redo (`Store.subscribeDirty`, the SAME channel `attachSpaceEnvelopeRender`
// repaints from). Both are subscribed here; the host's `refresh()` is a third, explicit route for
// a repaint the host already performs. No polling.
//
// ── ⛔ ROOMS DRAWING ON THE VIEW IS NOT DONE HERE. §26.6.4 rule 2 puts that on the ONE
// `siteGeometryHighlight` wiring (CARD-26.6's scope); a second highlight path from this section
// is exactly what C58 §1.19 clause 2 forbids.
//
// DOM via the DOM API (textContent, never innerHTML with runtime strings — C08 §3.1).

import { trace } from '@opentelemetry/api';
import type { ProjectRoomLike } from '../room-programme/projectRoomsToProgramme';
import { readLevelCandidates, type AdoptLevelCandidate } from './adoptProposalAsEnvelope';
import { readLevelEnvelopes, type LevelEnvelopeReadResult } from './levelEnvelopeSupersession';
import {
    describeUnplacedReason,
    groupRoomsPerLevel,
    type RoomsPerLevelGroup,
    type RoomsPerLevelModel,
} from './roomsPerLevelModel';

const _tracer = trace.getTracer('pryzm.site.roomsPerLevelSection');

export const ROOMS_PER_LEVEL_ROOT_TESTID = 'rooms-per-level';
export const ROOMS_PER_LEVEL_GROUP_ATTR = 'data-rooms-level';
/** The explicit "level not known" group. */
export const ROOMS_PER_LEVEL_UNPLACED_TESTID = 'rooms-per-level-unplaced';
export const ROOMS_PER_LEVEL_ROOM_ATTR = 'data-rooms-level-room';
export const ROOMS_PER_LEVEL_STATUS_TESTID = 'rooms-per-level-status';

export interface RoomsPerLevelDeps {
    readonly readRooms: () => readonly ProjectRoomLike[];
    /** `null` when the storeys could not be read — ⛔ never `[]` for that case. */
    readonly readLevels: () => readonly AdoptLevelCandidate[] | null;
    readonly readLevelEnvelopes: () => LevelEnvelopeReadResult;
    /** Optional live channels; each returns its own unsubscribe. */
    readonly subscribeRooms?: (fn: () => void) => () => void;
    readonly subscribeEnvelopes?: (fn: () => void) => () => void;
}

export interface RoomsPerLevelHandle {
    readonly element: HTMLElement;
    refresh(): void;
    dispose(): void;
}

type RoomStoreLike = {
    getAll?: () => unknown;
    subscribe?: (fn: (...args: unknown[]) => void) => (() => void) | void;
};
type DirtyStoreLike = { subscribeDirty?: (fn: () => void) => (() => void) | void };
/** Structural over `PryzmRuntime`: only `stores` is read, and only by key, through a cast at ONE seam. */
type RuntimeLike = { readonly stores?: unknown };

/** Production deps — the same three reads the neighbouring surfaces make. */
export function defaultRoomsPerLevelDeps(runtimeProp?: RuntimeLike | null): RoomsPerLevelDeps {
    const w = (typeof window !== 'undefined' ? window : {}) as unknown as {
        runtime?: RuntimeLike;
        roomStore?: RoomStoreLike;
        bimManager?: { getLevels?: () => unknown[] };
    };
    // ⛔ NEVER THE NULL PROP ALONE — §L-12916.
    const live = (): RuntimeLike | null => runtimeProp ?? w.runtime ?? null;
    const stores = (): Record<string, unknown> | null => {
        const s = live()?.stores;
        return s && typeof s === 'object' ? (s as Record<string, unknown>) : null;
    };
    const roomStore = (): RoomStoreLike | null => {
        const fromRuntime = stores()?.['room'] as RoomStoreLike | undefined;
        if (fromRuntime && typeof fromRuntime.getAll === 'function') return fromRuntime;
        return w.roomStore && typeof w.roomStore.getAll === 'function' ? w.roomStore : null;
    };
    return {
        readRooms: () => {
            const store = roomStore();
            if (!store || typeof store.getAll !== 'function') return [];
            let all: unknown;
            try { all = store.getAll(); } catch { return []; }
            if (Array.isArray(all)) return all as readonly ProjectRoomLike[];
            if (all instanceof Map) return [...all.values()] as readonly ProjectRoomLike[];
            return [];
        },
        readLevels: () => {
            try {
                const raw = w.bimManager?.getLevels?.();
                if (raw === undefined) return null;   // no bimManager ⇒ the storeys are NOT readable
                return readLevelCandidates(raw);
            } catch {
                return null;
            }
        },
        readLevelEnvelopes: () =>
            readLevelEnvelopes((stores()?.['spaceEnvelope'] ?? null) as Parameters<typeof readLevelEnvelopes>[0]),
        subscribeRooms: (fn) => {
            const store = roomStore();
            if (!store || typeof store.subscribe !== 'function') return () => {};
            try {
                const off = store.subscribe(() => fn());
                return typeof off === 'function' ? off : () => {};
            } catch {
                return () => {};
            }
        },
        subscribeEnvelopes: (fn) => {
            const slot = stores()?.['spaceEnvelope'] as DirtyStoreLike | undefined;
            if (!slot || typeof slot.subscribeDirty !== 'function') return () => {};
            try {
                const off = slot.subscribeDirty(fn);
                return typeof off === 'function' ? off : () => {};
            } catch {
                return () => {};
            }
        },
    };
}

const fmtArea = (m2: number | null): string => (m2 === null ? 'area not recorded' : `${m2.toFixed(1)} m²`);

function el(tag: string, style: string, text?: string): HTMLElement {
    const e = document.createElement(tag);
    e.setAttribute('style', style);
    if (text !== undefined) e.textContent = text;
    return e;
}

function renderGroup(g: RoomsPerLevelGroup): HTMLElement {
    const box = el('div', 'margin-top:7px;padding:6px 7px;border:1px solid #efecf7;border-radius:8px;background:#ffffff;min-width:0;');
    box.setAttribute(ROOMS_PER_LEVEL_GROUP_ATTR, g.levelId);

    const head = el('div', 'display:flex;justify-content:space-between;gap:8px;align-items:baseline;');
    head.appendChild(el('span', 'font-weight:700;font-size:10.5px;color:#6600FF;', g.label));
    const n = g.rooms.length;
    const sum = g.areaM2 === null
        ? (n === 0 ? '' : ' · no areas recorded')
        : ` · ${g.areaM2.toFixed(1)} m²${g.roomsWithoutArea > 0 ? ` (${g.roomsWithoutArea} without an area)` : ''}`;
    head.appendChild(el('span', 'font-size:9px;color:#8a83a0;', `${n} room${n === 1 ? '' : 's'}${sum}`));
    box.appendChild(head);

    // The level envelope this storey's rooms are designed inside.
    let envText: string;
    let envColour = '#6b6480';
    switch (g.envelope.kind) {
        case 'one':
            envText = `Level envelope: ${g.envelope.name ?? g.envelope.id}`
                + (g.envelope.areaM2 === null ? ' · area not recorded' : ` · ${g.envelope.areaM2.toFixed(0)} m²`);
            break;
        case 'none':
            envText = 'No level envelope on this storey yet — choose a massing option above, or draw your own.';
            envColour = '#8a83a0';
            break;
        case 'rival':
            envText = `${g.envelope.count} level envelopes sit on this storey — PRYZM will not choose which one `
                + 'the rooms belong inside. Keep the one you want; choosing a massing option replaces generated ones.';
            envColour = '#8a5a00';
            break;
        case 'unreadable':
        default:
            envText = g.envelope.kind === 'unreadable' ? g.envelope.text : '';
            envColour = '#8a5a00';
            break;
    }
    box.appendChild(el('div', `margin-top:3px;font-size:9px;line-height:1.45;color:${envColour};`, envText));

    if (n === 0) {
        box.appendChild(el('div', 'margin-top:4px;font-size:9.5px;color:#8a83a0;', 'No rooms on this storey yet.'));
    } else {
        const list = el('div', 'margin-top:4px;');
        for (const r of g.rooms) {
            const row = el('div', 'display:flex;justify-content:space-between;gap:8px;padding:1px 0;font-size:9.5px;color:#4b4460;');
            row.setAttribute(ROOMS_PER_LEVEL_ROOM_ATTR, r.id ?? '');
            row.appendChild(el('span', '', `${r.name ?? '(unnamed room)'} · ${r.kind}`));
            row.appendChild(el('span', `color:${r.areaM2 === null ? '#8a5a00' : '#6b6480'};`, fmtArea(r.areaM2)));
            list.appendChild(row);
        }
        box.appendChild(list);
    }
    return box;
}

function renderModel(root: HTMLElement, model: RoomsPerLevelModel): void {
    root.replaceChildren();
    const head = el('div', 'font-weight:700;font-size:10.5px;color:#6600FF;',
        `Rooms per level — ${model.totalRooms} room${model.totalRooms === 1 ? '' : 's'}`
        + (model.unplaced.length > 0 ? ` · ${model.unplaced.length} without a known level` : ''));
    root.appendChild(head);

    const status = el('div', 'margin-top:2px;font-size:9px;line-height:1.45;color:#8a83a0;');
    status.setAttribute('data-testid', ROOMS_PER_LEVEL_STATUS_TESTID);
    if (!model.levelsReadable) {
        status.setAttribute('data-state', 'levels-unreadable');
        status.style.color = '#8a5a00';
        status.textContent = 'PRYZM could not read this project\'s storeys, so the rooms cannot be grouped per level. '
            + 'They are listed below rather than placed on a guessed floor.';
    } else if (model.totalRooms === 0 && model.groups.length === 0) {
        status.setAttribute('data-state', 'empty');
        status.textContent = 'No rooms yet. Declare them in the programme above or generate the house; '
            + 'they will appear here per storey, inside the level envelope of that storey.';
    } else {
        status.setAttribute('data-state', 'listed');
        status.textContent = 'Each storey lists the rooms the project holds on it and the level envelope they are '
            + 'designed inside. Read from the model — nothing here is inferred.';
    }
    root.appendChild(status);

    for (const g of model.groups) root.appendChild(renderGroup(g));

    if (model.unplaced.length > 0) {
        const box = el('div', 'margin-top:7px;padding:6px 7px;border:1px solid #c9973a;border-radius:8px;background:#fdf8ee;min-width:0;');
        box.setAttribute('data-testid', ROOMS_PER_LEVEL_UNPLACED_TESTID);
        const n = model.unplaced.length;
        box.appendChild(el('div', 'font-weight:700;font-size:10.5px;color:#8a5a00;', `Level not known · ${n} room${n === 1 ? '' : 's'}`));
        box.appendChild(el('div', 'margin-top:3px;font-size:9px;line-height:1.45;color:#8a5a00;',
            'These rooms are listed here rather than dropped or put on the ground floor: PRYZM cannot '
            + 'tell which storey they belong to, and a guess would look exactly like a fact.'));
        const list = el('div', 'margin-top:4px;');
        for (const u of model.unplaced) {
            const row = el('div', 'display:flex;justify-content:space-between;gap:8px;padding:1px 0;font-size:9.5px;color:#4b4460;');
            row.setAttribute(ROOMS_PER_LEVEL_ROOM_ATTR, u.room.id ?? '');
            row.appendChild(el('span', '', `${u.room.name ?? '(unnamed room)'} · ${u.room.kind} — ${describeUnplacedReason(u)}`));
            row.appendChild(el('span', `color:${u.room.areaM2 === null ? '#8a5a00' : '#6b6480'};`, fmtArea(u.room.areaM2)));
            list.appendChild(row);
        }
        box.appendChild(list);
        root.appendChild(box);
    }
}

/** Mount the section into `host`. Renders immediately; re-renders on either live channel. */
export function mountRoomsPerLevelSection(host: HTMLElement, deps: RoomsPerLevelDeps): RoomsPerLevelHandle {
    const span = _tracer.startSpan('pryzm.site.mountRoomsPerLevelSection');
    try {
        const root = el('div', 'margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;min-width:0;max-width:100%;');
        root.setAttribute('data-testid', ROOMS_PER_LEVEL_ROOT_TESTID);
        host.appendChild(root);

        let disposed = false;
        const render = (): void => {
            if (disposed) return;
            let model: RoomsPerLevelModel;
            try {
                model = groupRoomsPerLevel(deps.readRooms(), deps.readLevels(), deps.readLevelEnvelopes());
            } catch (e) {
                // A read that throws is reported as unreadable, never as an empty project.
                console.warn('[site][rooms-per-level] read failed (non-fatal):', e);
                model = groupRoomsPerLevel([], null, { readable: false, reason: 'store-threw', text: 'read failed' });
            }
            renderModel(root, model);
        };
        render();

        const offs: Array<() => void> = [];
        try { if (deps.subscribeRooms) offs.push(deps.subscribeRooms(render)); } catch { /* the host refresh still repaints */ }
        try { if (deps.subscribeEnvelopes) offs.push(deps.subscribeEnvelopes(render)); } catch { /* same */ }

        return {
            element: root,
            refresh: render,
            dispose(): void {
                if (disposed) return;
                disposed = true;
                for (const off of offs) { try { off(); } catch { /* teardown is best-effort */ } }
                root.remove();
            },
        };
    } finally {
        span.end();
    }
}
