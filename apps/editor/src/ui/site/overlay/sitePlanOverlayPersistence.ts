// §SITE-PLAN-OVERLAY (persistence) — pure (de)serialize for the per-project site-plan
// overlay record. HEADLESS: the (de)serialize helpers have no DOM/localStorage import so
// the round-trip is unit-testable; the thin localStorage read/write wrappers are guarded
// and live at the bottom (they touch `localStorage`, but never throw into callers).
//
// Mirrors the v2 floor-plan UnderlayPersistence pattern (per-project key, image as a data
// URL, transform + opacity + lock persisted) but is a SEPARATE scope: the site overlay
// lives on the MAP in geographic terms (centre/scale/rotation about the site origin),
// not on the plan-view THREE plane. Keying it separately keeps the two concerns isolated
// (C13 project isolation) and means neither clobbers the other.
//
// Storage key: pryzm.sitePlanOverlay.v1.<projectId>

import type { SitePlanOverlayTransform } from './sitePlanOverlayGeometry';

export const SITE_OVERLAY_STORAGE_PREFIX = 'pryzm.sitePlanOverlay.v1.';
export const SITE_OVERLAY_SCHEMA_VERSION = 1 as const;

/** The persisted, per-project site-plan overlay record. */
export interface PersistedSitePlanOverlay {
    readonly schemaVersion: typeof SITE_OVERLAY_SCHEMA_VERSION;
    /** Display name of the uploaded file. */
    readonly fileName: string;
    /** Source kind — used to label the panel + decide re-rasterise rules. */
    readonly sourceKind: 'pdf' | 'image';
    /** The rasterised page as a data URL (already size-capped — see rasterSizeCap). */
    readonly imageDataUrl: string;
    /** 1-based PDF page that was rasterised (1 for images). */
    readonly page: number;
    /** The geo-anchor the overlay corners are computed about (the site origin at save). */
    readonly originLat: number;
    readonly originLon: number;
    /** The placement transform (centre metres E/N, metres-per-pixel, rotation, src size). */
    readonly transform: SitePlanOverlayTransform;
    /** Render opacity 0..1. */
    readonly opacity: number;
    /** Locked = pinned: drag/scale/rotate disabled. */
    readonly locked: boolean;
    /** Visibility toggle. */
    readonly visible: boolean;
    /** Whether the user has run the 2-point calibration (vs. the default span fit). */
    readonly calibrated: boolean;
    readonly savedAt: string;
}

export interface SitePlanOverlayDraft {
    readonly fileName: string;
    readonly sourceKind: 'pdf' | 'image';
    readonly imageDataUrl: string;
    readonly page: number;
    readonly originLat: number;
    readonly originLon: number;
    readonly transform: SitePlanOverlayTransform;
    readonly opacity: number;
    readonly locked: boolean;
    readonly visible: boolean;
    readonly calibrated: boolean;
}

export function key(projectId: string): string {
    return `${SITE_OVERLAY_STORAGE_PREFIX}${projectId}`;
}

/** Build a persisted record from a live draft (pure). */
export function serializeOverlay(draft: SitePlanOverlayDraft, now: Date = new Date()): PersistedSitePlanOverlay {
    return {
        schemaVersion: SITE_OVERLAY_SCHEMA_VERSION,
        fileName: draft.fileName,
        sourceKind: draft.sourceKind,
        imageDataUrl: draft.imageDataUrl,
        page: draft.page,
        originLat: draft.originLat,
        originLon: draft.originLon,
        transform: draft.transform,
        opacity: clamp01(draft.opacity),
        locked: !!draft.locked,
        visible: !!draft.visible,
        calibrated: !!draft.calibrated,
        savedAt: now.toISOString(),
    };
}

/**
 * Parse a raw JSON string into a record, validating the shape. Returns null on any
 * structural problem (missing image, bad transform, wrong/absent version) so a corrupt
 * or future-version record degrades to "no overlay" rather than crashing the load.
 */
export function deserializeOverlay(raw: string): PersistedSitePlanOverlay | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    if (parsed['schemaVersion'] !== SITE_OVERLAY_SCHEMA_VERSION) return null;
    const imageDataUrl = parsed['imageDataUrl'];
    if (typeof imageDataUrl !== 'string' || imageDataUrl.length === 0) return null;
    const t = parsed['transform'];
    if (!isValidTransform(t)) return null;
    const originLat = num(parsed['originLat']);
    const originLon = num(parsed['originLon']);
    if (originLat === null || originLon === null) return null;

    return {
        schemaVersion: SITE_OVERLAY_SCHEMA_VERSION,
        fileName: typeof parsed['fileName'] === 'string' ? (parsed['fileName'] as string) : 'Site plan',
        sourceKind: parsed['sourceKind'] === 'pdf' ? 'pdf' : 'image',
        imageDataUrl,
        page: num(parsed['page']) ?? 1,
        originLat,
        originLon,
        transform: t,
        opacity: clamp01(num(parsed['opacity']) ?? 0.7),
        locked: !!parsed['locked'],
        visible: parsed['visible'] !== false,
        calibrated: !!parsed['calibrated'],
        savedAt: typeof parsed['savedAt'] === 'string' ? (parsed['savedAt'] as string) : new Date(0).toISOString(),
    };
}

// ── guarded localStorage wrappers (never throw into callers) ─────────────────

export function readPersistedOverlay(projectId: string): PersistedSitePlanOverlay | null {
    try {
        const raw = localStorage.getItem(key(projectId));
        return raw ? deserializeOverlay(raw) : null;
    } catch {
        return null;
    }
}

export function writePersistedOverlay(projectId: string, record: PersistedSitePlanOverlay): boolean {
    try {
        localStorage.setItem(key(projectId), JSON.stringify(record));
        return true;
    } catch {
        // Quota (data URLs are large) / private mode — best-effort, never fatal.
        return false;
    }
}

export function clearPersistedOverlay(projectId: string): void {
    try {
        localStorage.removeItem(key(projectId));
    } catch {
        /* ignore */
    }
}

// ── internals ────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
}

function num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 1;
    return Math.min(1, Math.max(0, v));
}

function isValidTransform(v: unknown): v is SitePlanOverlayTransform {
    if (!isRecord(v)) return false;
    const centre = v['centre'];
    if (!isRecord(centre)) return false;
    if (num(centre['east']) === null || num(centre['north']) === null) return false;
    if (num(v['metresPerPixel']) === null || (v['metresPerPixel'] as number) <= 0) return false;
    if (num(v['rotationRad']) === null) return false;
    if (num(v['widthPx']) === null || (v['widthPx'] as number) <= 0) return false;
    if (num(v['heightPx']) === null || (v['heightPx'] as number) <= 0) return false;
    return true;
}
