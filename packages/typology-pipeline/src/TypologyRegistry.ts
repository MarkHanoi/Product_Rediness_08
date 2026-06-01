// A.1 (Phase A · Sprint 1) — In-memory TypologyRegistry.
//
// The L3 registry that holds every installed TypologyPack indexed by
// `TypologyId`.  The editor's bootstrap registers PRYZM-first-party packs
// at startup; later phases load community packs from the marketplace API.
//
// L3-pure: no I/O.  Adapters (ZIP unpacking, Ed25519 verification, plan-tier
// gating against the auth subject) live in apps/editor where they have
// access to the auth + storage substrates.
//
// Strategic context: docs/03-execution/plans/typology-expansion-roadmap.md §4.

import { assertTypologyId, type TypologyId } from '@pryzm/schemas';
import type { RegisteredTypologyPack } from './types.js';

/**
 * Listener fired when the registry contents change.  Used by the L5
 * TypologyPicker UI (which subscribes once at mount).
 */
export type RegistryChangeListener = (event: {
    readonly type: 'registered' | 'unregistered' | 'cleared';
    readonly typologyId: TypologyId | null;
}) => void;

export interface TypologyRegistry {
    /** Register a pack.  Throws if the id is already taken (registration
     *  is intentionally idempotent-by-rejection — callers MUST unregister
     *  first to replace, so version-bump flows are explicit). */
    register(pack: RegisteredTypologyPack): void;

    /** Remove a pack by id.  No-op if the id is absent.  Accepts either
     *  a branded `TypologyId` or a plain string — most callers pass a
     *  raw string from the URL / chatbot output, so we brand internally. */
    unregister(id: TypologyId | string): void;

    /** Lookup a pack by id.  Returns `undefined` if absent. */
    get(id: TypologyId | string): RegisteredTypologyPack | undefined;

    /** True iff a pack is registered under `id`. */
    has(id: TypologyId | string): boolean;

    /** Snapshot of all registered ids — alphabetical, stable across calls
     *  given the same registry state. */
    listIds(): readonly TypologyId[];

    /** Snapshot of every registered pack.  Treat the returned array as
     *  immutable. */
    list(): readonly RegisteredTypologyPack[];

    /** Subscribe to registry changes.  Returns the unsubscribe handle. */
    subscribe(listener: RegistryChangeListener): () => void;

    /** Remove every pack — used by the project-lifecycle reset hook per
     *  C13 §3.8 (no project state may leak across project switches). */
    clear(): void;
}

/**
 * Construct an empty in-memory `TypologyRegistry`.  Cheap; safe to call
 * once per app boot.  Tests construct fresh registries per-it.
 */
export function createTypologyRegistry(): TypologyRegistry {
    const packs = new Map<TypologyId, RegisteredTypologyPack>();
    const listeners = new Set<RegistryChangeListener>();

    function emit(
        type: 'registered' | 'unregistered' | 'cleared',
        typologyId: TypologyId | null,
    ): void {
        for (const listener of listeners) {
            // Defensive: a buggy listener MUST NOT take down the registry.
            // We swallow per-listener throws but surface them on the console
            // so they show up in dev.  No try/catch around the whole loop —
            // we want all subscribers to see every event.
            try {
                listener({ type, typologyId });
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('[typology-registry] listener threw', err);
            }
        }
    }

    return {
        register(pack) {
            const id = assertTypologyId(pack.manifest.id);
            if (packs.has(id)) {
                throw new Error(
                    `TypologyRegistry: typology '${id}' is already registered. ` +
                        `Call unregister('${id}') first to replace.`,
                );
            }
            packs.set(id, pack);
            emit('registered', id);
        },

        unregister(id) {
            const typed = assertTypologyId(id);
            if (packs.delete(typed)) {
                emit('unregistered', typed);
            }
        },

        get(id) {
            return packs.get(id as TypologyId);
        },

        has(id) {
            return packs.has(id as TypologyId);
        },

        listIds() {
            return Array.from(packs.keys()).sort();
        },

        list() {
            return Array.from(packs.values());
        },

        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },

        clear() {
            if (packs.size === 0) return;
            packs.clear();
            emit('cleared', null);
        },
    };
}
