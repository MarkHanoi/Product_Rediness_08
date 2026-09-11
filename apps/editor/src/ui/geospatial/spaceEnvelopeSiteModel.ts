/**
 * spaceEnvelopeSiteModel — the COMMITTED space envelope as the two SITE rasterisers draw it.
 *
 * §COMMITTED-ENVELOPE-ON-EVERY-VIEW (L-13310) · C114 §10 · C58 §1.19 / §1.20 · C84 EI-9 ·
 * STR §26.4.
 *
 * Founder, 2026-09-11: *"the envelopes (no matter if created on plan view or 3d view) dont render
 * on plan view - they should!"* and *"i would like it to render also on 3d site view."*
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⭐ ONE MODEL, TWO SITE RASTERISERS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `CesiumViewport.renderSpaceEnvelopes` (3-D Site) and `SiteBoundaryMap2D` (2-D site map) each
 * re-derived the same four answers from a raw store row — is it drawable, what geometry (a
 * face-drag preview overriding the stored one), what colour/opacity, what label — with DIFFERENT
 * validation (the map never checked the vertical extent at all). Two readers of one record is the
 * [[same-rule-two-implementations]] shape; this module is the one reader. The appearance comes
 * from `resolveSpaceEnvelopeAppearance`, the authority the THREE mesh builder also asks, so C58
 * §1.19's rule — an AUTHORED envelope never borrows a solved envelope's confidence hue — holds on
 * every surface by construction rather than by three files agreeing.
 *
 * ⭐ AND ONE FEED FOR A LATE RUNTIME. The 2-D map is mounted with `runtime: null` on the live boot
 * path (`GISAreaLayout` passes `createMainLayout(props, null)`'s null straight through), so its
 * mount-time `runtime?.stores?.spaceEnvelope` read found NO store: the committed-envelope layer was
 * empty and its dirty listener never installed, on every production session. The feed resolves
 * the store LAZILY on every read and (re)subscribes to whichever store instance the resolver
 * answers with, so "no runtime yet" heals on the next paint instead of latching
 * (§L-12916 · [[null-at-mount-runtime-event-race]]).
 *
 * PURE — no Cesium, no MapLibre, no THREE, no DOM. Frames stay the caller's: the model speaks
 * scene-XZ metres about the site frame origin, exactly as the record does.
 */

import {
    resolveSpaceEnvelopeAppearance,
    type SpaceEnvelopeAppearance,
} from '../../engine/spaceEnvelopeAppearance';
import type { DirtySpaceEnvelopeStore } from '../../engine/attachSpaceEnvelopeRender';

/** A face-drag preview: GEOMETRY ONLY. Identity, colour and label keep coming from the record. */
export interface SpaceEnvelopeGeometryOverride {
    readonly footprint: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    readonly baseOffset: number;
    readonly height: number;
}

/** One committed envelope, ready for a site rasteriser. */
export interface SpaceEnvelopeSitePrism {
    readonly id: string;
    readonly role: string;
    /** OPEN ring, scene-XZ metres about the site frame origin (the record's own frame). */
    readonly ring: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    /** Metres above the site datum at which the prism starts (the storey's seat). */
    readonly baseOffset: number;
    readonly height: number;
    readonly appearance: SpaceEnvelopeAppearance;
    /**
     * The label text — the record's own `name` (Lane C makes it unique and queryable), or `null`
     * when it carries none. ⛔ Never generated from the role: an invented "Level" label is
     * indistinguishable from one the user typed.
     */
    readonly label: string | null;
    /** Where the label sits: the ring's vertex centroid (the THREE label's own anchor). */
    readonly labelAnchor: { readonly x: number; readonly z: number };
}

export interface SpaceEnvelopeSiteModel {
    readonly prisms: readonly SpaceEnvelopeSitePrism[];
    /** Rows that are not a drawable prism. COUNTED, never guessed at and never fatal. */
    readonly skipped: number;
}

/** The fields read off one store row — every one optional and UNTRUSTED (persistence may omit any). */
interface SiteSpaceEnvelopeRow {
    readonly role?: unknown;
    readonly name?: unknown;
    readonly occupancy?: unknown;
    readonly materialColor?: unknown;
    readonly footprintAreaM2?: unknown;
    readonly footprint?: unknown;
    readonly baseOffset?: unknown;
    readonly height?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined =>
    (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** An open ring of ≥ 3 finite vertices, or `null`. A ring that does not parse is not drawn. */
function readRing(raw: unknown): ReadonlyArray<{ readonly x: number; readonly z: number }> | null {
    if (!Array.isArray(raw) || raw.length < 3) return null;
    const ring: { x: number; z: number }[] = [];
    for (const p of raw as readonly unknown[]) {
        const x = num((p as { x?: unknown } | null | undefined)?.x);
        const z = num((p as { z?: unknown } | null | undefined)?.z);
        if (x === undefined || z === undefined) return null;
        ring.push({ x, z });
    }
    return ring;
}

/**
 * Every drawable committed envelope in `records`, with its appearance and label resolved.
 *
 * Total: a malformed row is skipped and counted; one bad record never takes a view down.
 */
export function buildSpaceEnvelopeSitePrisms(
    records: ReadonlyMap<string, unknown>,
    previews?: ReadonlyMap<string, SpaceEnvelopeGeometryOverride>,
): SpaceEnvelopeSiteModel {
    const prisms: SpaceEnvelopeSitePrism[] = [];
    let skipped = 0;
    for (const [id, raw] of records) {
        const row = (typeof raw === 'object' && raw !== null ? raw : {}) as SiteSpaceEnvelopeRow;
        const preview = previews?.get(id);
        const ring = readRing(preview?.footprint ?? row.footprint);
        const height = num(preview?.height ?? row.height);
        const baseOffset = num(preview?.baseOffset ?? row.baseOffset);
        // UNKNOWN is not zero: a row with no vertical extent is not filed at the ground with a
        // guessed height ([[context-data-honesty-family]]).
        if (ring === null || height === undefined || height <= 0 || baseOffset === undefined) {
            skipped += 1;
            continue;
        }
        const role = str(row.role) ?? 'room';
        const appearance = resolveSpaceEnvelopeAppearance({
            id,
            role,
            name: str(row.name),
            occupancy: str(row.occupancy),
            materialColor: str(row.materialColor),
            footprintAreaM2: num(row.footprintAreaM2),
            height,
        });
        let cx = 0;
        let cz = 0;
        for (const p of ring) { cx += p.x; cz += p.z; }
        prisms.push({
            id,
            role,
            ring,
            baseOffset,
            height,
            appearance,
            label: appearance.labelled ? appearance.labelTitle : null,
            labelAnchor: { x: cx / ring.length, z: cz / ring.length },
        });
    }
    return { prisms, skipped };
}

/**
 * The live space-envelope store on a runtime, or `null`.
 *
 * ⚠ STRUCTURAL, never a cast through `any` (P4): `PluginDtoStoreHandle` declares only
 * `getState()`, while the live store also carries `subscribeDirty` — the same narrowing
 * `initTools` and `CesiumViewport` perform.
 */
export function spaceEnvelopeStoreOf(runtime: unknown): DirtySpaceEnvelopeStore | null {
    if (typeof runtime !== 'object' || runtime === null) return null;
    const stores = (runtime as { readonly stores?: unknown }).stores;
    if (typeof stores !== 'object' || stores === null) return null;
    const store = (stores as Readonly<Record<string, unknown>>)['spaceEnvelope'] as
        | Partial<DirtySpaceEnvelopeStore>
        | null
        | undefined;
    if (!store || typeof store.getState !== 'function' || typeof store.subscribeDirty !== 'function') {
        return null;
    }
    return store as DirtySpaceEnvelopeStore;
}

/** A lazily-subscribed view of the one space-envelope store. See the header. */
export interface SpaceEnvelopeStoreFeed {
    /** Subscribe to the store the resolver answers with NOW, unless already subscribed to it. */
    ensure(): boolean;
    /**
     * `ensure()`, answering whether THIS call started hearing a store the surface was not hearing
     * before — i.e. the runtime arrived after the last paint, so the caller must repaint now.
     * A surface calls it from its own lifecycle (a pane re-target / resize) so a map that loaded
     * before the runtime existed does not wait for an unrelated repaint to heal.
     */
    heal(): boolean;
    /**
     * The live records, or `null` when no store is reachable. ⛔ `null` is NOT an empty project:
     * "unreachable" and "nothing authored" must stay different answers (C57 §1.5).
     */
    read(): ReadonlyMap<string, unknown> | null;
    /** Drop the listener. Idempotent; after it, `onChange` never fires again. */
    dispose(): void;
}

/**
 * ⭐ Resolve-per-read, subscribe-per-instance.
 *
 * `Store.subscribeDirty` fires on EXECUTE, UNDO and REDO alike, so this needs no bus subscriber
 * and `performUndoRedo.ts`'s generic `spaceEnvelope` row stays honest. The listener carries no
 * diff on purpose: a surface redraws from the STORE, never from a partial index of its own
 * (C84 EI-9).
 */
export function createSpaceEnvelopeStoreFeed(
    resolveStore: () => DirtySpaceEnvelopeStore | null,
    onChange: () => void,
): SpaceEnvelopeStoreFeed {
    let subscribedTo: DirtySpaceEnvelopeStore | null = null;
    let unsubscribe: (() => void) | null = null;
    let disposed = false;

    const current = (): DirtySpaceEnvelopeStore | null => {
        try { return resolveStore(); } catch { return null; }
    };

    const ensure = (): boolean => {
        if (disposed) return false;
        const store = current();
        if (store === null) return false;
        if (store === subscribedTo) return true;
        // A DIFFERENT instance — drop the old listener first, or the dead store would keep this
        // surface alive and the live one would never be heard.
        try { unsubscribe?.(); } catch { /* the old store may be gone */ }
        unsubscribe = null;
        subscribedTo = null;
        try {
            unsubscribe = store.subscribeDirty(() => { if (!disposed) onChange(); });
            subscribedTo = store;
            return true;
        } catch {
            return false;
        }
    };

    return {
        ensure,
        heal(): boolean {
            const before = subscribedTo;
            return ensure() && subscribedTo !== before;
        },
        read(): ReadonlyMap<string, unknown> | null {
            const store = current();
            if (store === null) return null;
            // ⭐ THE HEAL: reading is what installs the listener, so the first paint after the
            // runtime arrives is also the moment this surface starts hearing changes.
            ensure();
            try { return store.getState(); } catch { return null; }
        },
        dispose(): void {
            disposed = true;
            try { unsubscribe?.(); } catch { /* non-fatal */ }
            unsubscribe = null;
            subscribedTo = null;
        },
    };
}
