/**
 * §ROOM-VG-CATEGORY (L-1610) — `room` as a first-class Visibility/Graphics category,
 * and the per-view resolution of HOW rooms are colour-coded.
 *
 * ── The founder's report ─────────────────────────────────────────────────────
 *   "the rooms are colour coded seemingly randomly. I want a category for rooms —
 *    and that the user can colour code by room type, size, or colour defined, all
 *    white etc. … for all view types, elevation etc."
 *
 * ── Why the mode lives HERE, in the VG cascade ───────────────────────────────
 * The mode is a GRAPHIC OVERRIDE, not a property of a room. Two views of the same
 * model legitimately disagree: a "Room Plan" sheet colour-coded by occupancy and a
 * client elevation rendered all-white are the same building, styled twice. That is
 * exactly the four-tier cascade `vgGovernanceStore` already implements
 * (built-in → template → model → view), and `vgGovernanceStore.serialize()` is
 * already written into the project snapshot by `ProjectSerializer` and restored by
 * `ProjectLoader`.
 *
 * So the answer to "persisted with the view or the project?" is BOTH, and the
 * distinction is load-bearing:
 *   • per VIEW  — `setViewCategoryOverride(viewId, 'room', { roomColourMode })`
 *                 is what the user picks while looking at a view.
 *   • per MODEL — `setModelCategoryOverride(modelId, 'room', …)` is the project
 *                 default every view inherits until it overrides.
 * Both round-trip through the existing project file with NO new persistence code
 * and NO new schema — which is why this is the sound place for it rather than a
 * fourth rival store.
 *
 * ── Rooms are FILLED REGIONS, not line-work ─────────────────────────────────
 * A VG style for `room` therefore means: `visible` (show the wash at all),
 * `transparency` (how strong it is) and — only in `uniform` mode — `fillColor`
 * (the one flat colour every room takes). In every other mode the colour is a
 * DETERMINATION about the room (its type, its size, the colour someone chose), so
 * it comes from `RoomColourSystem`, never from a category-wide poche colour.
 * `edgeColor` / `lineWeight` / `halftone` have no meaning for a room wash and are
 * not read.
 */

import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import { vgGovernanceStore } from './VGGovernanceStore';

const TRACER = trace.getTracer('@pryzm/core-app-model/room-colour-intent', '0.1.0');

function withSpan<T>(verb: string, attrs: Attributes, fn: () => T): T {
    const span = TRACER.startSpan(`pryzm.room-colour.${verb}`, { attributes: attrs });
    try {
        const out = fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return out;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute('error', true);
        throw err;
    } finally {
        span.end();
    }
}

/**
 * How a room's fill colour is DETERMINED.
 *
 * ⚠ This is the ONE definition. `@pryzm/room-topology` aliases its historical
 * `RoomVisualisationMode` to this type rather than restating the union — a
 * second copy is a second thing to rot.
 *
 *   detection  — legacy default: the room's own colour, else the occupancy palette.
 *   occupancy  — BY ROOM TYPE. The occupancy palette, ignoring per-room overrides.
 *   area       — BY SIZE. A ramp across the min/max area of the rooms in scope.
 *   custom     — USER-DEFINED. The colour the user set on the room.
 *   uniform    — ALL WHITE (or whatever single colour the room category carries).
 *   sync-state — BIM-3.0 template sync state; needs the sync engine injected.
 */
export type RoomColourMode =
    | 'detection'
    | 'occupancy'
    | 'area'
    | 'custom'
    | 'uniform'
    | 'sync-state';

/** The VG category name rooms are governed under. */
export const ROOM_VG_CATEGORY = 'room' as const;

export const DEFAULT_ROOM_COLOUR_MODE: RoomColourMode = 'detection';

/** "All white" — the founder asked for it by name; it is the uniform default. */
export const DEFAULT_UNIFORM_ROOM_COLOUR = '#FFFFFF';

/** Menu order + labels. UI reads this so a new mode cannot be added and forgotten. */
export const ROOM_COLOUR_MODE_CHOICES: ReadonlyArray<{
    mode: RoomColourMode;
    label: string;
    hint: string;
}> = Object.freeze([
    { mode: 'occupancy',  label: 'Room type',  hint: 'Colour by occupancy type (bedroom, office, corridor…)' },
    { mode: 'area',       label: 'Size',       hint: 'Ramp from the smallest to the largest room on this level' },
    { mode: 'custom',     label: 'User-defined', hint: 'The colour set on each room; unset rooms read as unclassified' },
    { mode: 'uniform',    label: 'All white',  hint: 'One flat colour for every room' },
    { mode: 'detection',  label: 'Default',    hint: 'The room’s own colour if it has one, else its type colour' },
    { mode: 'sync-state', label: 'Sync state', hint: 'Template sync state (no-template / partial / synced / conflict)' },
]);

export function isRoomColourMode(v: unknown): v is RoomColourMode {
    return typeof v === 'string'
        && ROOM_COLOUR_MODE_CHOICES.some(c => c.mode === v);
}

/** The resolved room GRAPHICS for one view. */
export interface RoomColourIntent {
    mode:          RoomColourMode;
    /** The single colour used by `uniform` mode. */
    uniformColour: string;
    /** VG `visible` for the room category — hides the wash entirely. */
    visible:       boolean;
    /** VG `transparency` 0–100. 0 means "leave the authored per-room opacity alone". */
    transparency:  number;
    /** Which tier of the cascade supplied the style (diagnostics only). */
    source:        string;
}

/**
 * Resolve the room colour intent for a view through the VG cascade.
 *
 * `viewId` omitted → the model/project default. A model that was never registered
 * resolves to the built-in default, which is today's behaviour exactly.
 */
export function resolveRoomColourIntent(modelId: string, viewId?: string): RoomColourIntent {
    return withSpan('resolve-intent', {
        'pryzm.room.model_id': modelId,
        'pryzm.room.view_id': viewId ?? '',
    }, (): RoomColourIntent => {
        const resolved = vgGovernanceStore.resolveStyle(modelId, ROOM_VG_CATEGORY, viewId);
        const raw = (resolved.style as { roomColourMode?: unknown }).roomColourMode;
        return {
            mode:          isRoomColourMode(raw) ? raw : DEFAULT_ROOM_COLOUR_MODE,
            // A template that carries no `room` entry falls back to BUILT_IN_DEFAULT's
            // grey. "All white" must be white, so the grey never becomes the answer by
            // accident — only an explicitly authored room fill does.
            uniformColour: normaliseUniform(resolved.style.fillColor, resolved.source),
            visible:       resolved.style.visible !== false,
            transparency:  Number(resolved.style.transparency ?? 0),
            source:        resolved.source,
        };
    });
}

function normaliseUniform(fillColor: string | undefined, source: string): string {
    if (source === 'built-in-default' || !fillColor) return DEFAULT_UNIFORM_ROOM_COLOUR;
    return fillColor;
}

// ── Active view tracking ─────────────────────────────────────────────────────
//
// The 3-D scene is shared by every view, so the room meshes need to know WHICH
// view is on screen to resolve a per-view mode. `view-selected` / `view-closed`
// on `window` is the channel `UnderlayRenderService` and `CropRegionFilterService`
// already use, so this rides the same one rather than minting a rival.

let _activeViewId: string | null = null;
let _activeModelId = 'model-default';
let _subscribed = false;

function ensureSubscribed(): void {
    if (_subscribed || typeof window === 'undefined') return;
    _subscribed = true;
    window.addEventListener('view-selected', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        _activeViewId = detail?.viewId ?? detail?.view?.id ?? null;
    });
    window.addEventListener('view-closed', () => { _activeViewId = null; });
}

/** Which view the room meshes should style for. `null` → the model default. */
export function getActiveRoomColourViewId(): string | null {
    ensureSubscribed();
    if (_activeViewId) return _activeViewId;
    // Fallback to the runtime's own view registry — the same bridge the AI chat
    // route reads. A narrow structural cast, never a window-any cast (P4).
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { runtime?: { viewRegistry?: { activeViewId?: string | null } } };
    return w.runtime?.viewRegistry?.activeViewId ?? null;
}

/**
 * Explicit setter for hosts that do not go through the `view-selected` DOM event
 * (tests, and the plan canvas, which knows its own view id).
 */
export function setActiveRoomColourViewId(viewId: string | null): void {
    ensureSubscribed();
    _activeViewId = viewId;
}

export function getRoomColourModelId(): string {
    return _activeModelId;
}

export function setRoomColourModelId(modelId: string): void {
    _activeModelId = modelId;
}

/** The intent for whatever view is on screen right now. */
export function activeRoomColourIntent(): RoomColourIntent {
    return resolveRoomColourIntent(_activeModelId, getActiveRoomColourViewId() ?? undefined);
}
