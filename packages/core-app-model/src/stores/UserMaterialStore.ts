/**
 * UserMaterialStore — #105 Materials Repository, Phase 1 (data layer).
 *
 * The central, USER-MANAGED material store. It holds materials the user creates
 * or uploads, layered ON TOP of the read-only built-in `STANDARD_MATERIAL_LIBRARY`
 * (core-app-model/materialLibrary.ts). The editable "Materials Library" schedule
 * (ScheduleRegistry 'Materials Schedule') + per-element assignment build on this in
 * later increments; element colour-resolution plumbing already exists (timber
 * keyword inference in window/door material-bridge #119; CW `glazingColor` #53).
 *
 * Follows the ScheduleStore pattern EXACTLY:
 *   §01 §3.3 — ElementStore shape: getAll / get / has / create / update / delete /
 *              restore / serialize / deserialize / reset.
 *   §01 §2   — mutations emit storeEventBus + a DOM CustomEvent for UI reactivity.
 *   §05      — pure data module: NO Three.js, NO DOM beyond CustomEvent dispatch
 *              (identical to ScheduleStore). Colours are plain hex strings, so the
 *              store stays serialisable and free of THREE.Color objects.
 *   §07      — client-side only; serialize/deserialize persists into ProjectSnapshot.
 *
 * Registered with projectScopeRegistry (clear/reseed on project switch) and
 * StoreRegistry, exactly like ScheduleStore.
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)

/**
 * A user-defined material. Plain, serialisable data (hex colour string, scalar
 * PBR params) — deliberately NOT a THREE.Material, so the store stays pure and
 * persistable. The renderer converts this to a THREE.MeshStandardMaterial via the
 * existing material factories at build time.
 */
export interface UserMaterialDef {
    /** Stable unique id (e.g. `user-mat-<ulid>`). */
    id: string;
    /** Display name shown in the Materials Library. */
    label: string;
    /** Free-form category (may match a built-in MaterialCategory or be custom). */
    category: string;
    /** Base colour as a hex string, e.g. `#c8a96e`. */
    color: string;
    /** PBR metalness 0..1. */
    metalness: number;
    /** PBR roughness 0..1. */
    roughness: number;
    /** Opacity 0..1 (1 = fully opaque). */
    opacity: number;
    /** Whether the material renders transparent. */
    transparent: boolean;
    /**
     * Optional uploaded texture, stored as a data-URL or asset path. The
     * `textures` field on the built-in library is never populated; this is where
     * user texture uploads live (consumed by the renderer in a later increment).
     */
    textureUrl?: string;
    /** Always 'user' — distinguishes from built-in STANDARD_MATERIAL_LIBRARY rows. */
    source: 'user';
    createdAt: number;
    modifiedAt: number;
}

export interface UserMaterialStoreSnapshot {
    version: 1;
    materials: UserMaterialDef[];
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Defensive normaliser so create/update/deserialize never store garbage scalars. */
function normalise(m: UserMaterialDef): UserMaterialDef {
    return {
        ...m,
        color: typeof m.color === 'string' && m.color.length > 0 ? m.color : '#cccccc',
        metalness: clamp01(m.metalness),
        roughness: clamp01(m.roughness),
        opacity: clamp01(m.opacity),
        transparent: !!m.transparent,
        source: 'user',
    };
}

class UserMaterialStoreImpl {
    private _materials: Map<string, UserMaterialDef> = new Map();

    private dispatch(eventName: string, detail: object): void {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(eventName, { detail })); // TODO(TASK-15)
        }
    }

    // ── Read API ────────────────────────────────────────────────────────────
    getAll(): UserMaterialDef[] {
        return [...this._materials.values()].map(m => ({ ...m }));
    }

    get(id: string): UserMaterialDef | undefined {
        const m = this._materials.get(id);
        return m ? { ...m } : undefined;
    }

    has(id: string): boolean {
        return this._materials.has(id);
    }

    // ── Write API (Command-routed in later increments) ────────────────────────
    create(params: {
        id: string;
        label: string;
        category?: string;
        color?: string;
        metalness?: number;
        roughness?: number;
        opacity?: number;
        transparent?: boolean;
        textureUrl?: string;
    }): UserMaterialDef | null {
        if (this._materials.has(params.id)) return null;
        const now = Date.now();
        const mat = normalise({
            id: params.id,
            label: params.label,
            category: params.category ?? 'Custom',
            color: params.color ?? '#cccccc',
            metalness: params.metalness ?? 0,
            roughness: params.roughness ?? 0.6,
            opacity: params.opacity ?? 1,
            transparent: params.transparent ?? false,
            textureUrl: params.textureUrl,
            source: 'user',
            createdAt: now,
            modifiedAt: now,
        });
        this._materials.set(mat.id, mat);
        storeEventBus.emit({ elementType: 'user-material', elementId: mat.id, operation: 'create', timestamp: now });
        this.dispatch('mat:material-created', { materialId: mat.id });
        return { ...mat };
    }

    update(id: string, patch: Partial<Omit<UserMaterialDef, 'id' | 'source' | 'createdAt'>>): boolean {
        const mat = this._materials.get(id);
        if (!mat) return false;
        if (patch.label !== undefined) mat.label = patch.label;
        if (patch.category !== undefined) mat.category = patch.category;
        if (patch.color !== undefined) mat.color = patch.color;
        if (patch.metalness !== undefined) mat.metalness = clamp01(patch.metalness);
        if (patch.roughness !== undefined) mat.roughness = clamp01(patch.roughness);
        if (patch.opacity !== undefined) mat.opacity = clamp01(patch.opacity);
        if (patch.transparent !== undefined) mat.transparent = !!patch.transparent;
        if (patch.textureUrl !== undefined) mat.textureUrl = patch.textureUrl;
        mat.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'user-material', elementId: id, operation: 'update', timestamp: mat.modifiedAt });
        this.dispatch('mat:material-updated', { materialId: id });
        return true;
    }

    delete(id: string): boolean {
        if (!this._materials.has(id)) return false;
        this._materials.delete(id);
        storeEventBus.emit({ elementType: 'user-material', elementId: id, operation: 'delete', timestamp: Date.now() });
        this.dispatch('mat:material-deleted', { materialId: id });
        return true;
    }

    /** Re-insert a previously-removed material (undo support) without firing 'create' twice. */
    restore(mat: UserMaterialDef): void {
        if (this._materials.has(mat.id)) return;
        this._materials.set(mat.id, normalise({ ...mat }));
        storeEventBus.emit({ elementType: 'user-material', elementId: mat.id, operation: 'create', timestamp: Date.now() });
        this.dispatch('mat:material-created', { materialId: mat.id });
    }

    // ── Persistence API ───────────────────────────────────────────────────────
    serialize(): UserMaterialStoreSnapshot {
        return { version: 1, materials: this.getAll() };
    }

    deserialize(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const snapshot = data as UserMaterialStoreSnapshot;
        if (snapshot.version !== 1 || !Array.isArray(snapshot.materials)) return;
        this._materials.clear();
        for (const raw of snapshot.materials) {
            if (raw?.id && raw?.label) {
                this._materials.set(raw.id, normalise({ ...raw, source: 'user' }));
            }
        }
        this.dispatch('mat:store-loaded', {});
    }

    reset(): void {
        this._materials.clear();
        this.dispatch('mat:store-reset', {});
    }
}

export const userMaterialStore = new UserMaterialStoreImpl();
export type { UserMaterialStoreImpl };

// Register with the project scope so user materials are cleared on project switch
// and (re)hydrated from the snapshot — mirrors ScheduleStore.
import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'userMaterialStore',
    clear: () => userMaterialStore.reset(),
    reseed: () => { /* no built-in user materials to seed; built-ins live in STANDARD_MATERIAL_LIBRARY */ },
});

import { storeRegistry } from '../StoreRegistry';
storeRegistry.register('user-material', userMaterialStore as unknown as import('../StoreRegistry').BimStore);
