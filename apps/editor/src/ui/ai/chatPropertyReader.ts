// apps/editor — chatPropertyReader (§FEAT-RAC-PROPERTY-QUERY, L-2210)
// =============================================================================
//
// The EDITOR half of "how tall is this wall?". `packages/ai-host` stays pure —
// no DOM, no stores, no I/O — so it declares the reader's SHAPE
// (`PropertyReader` in `intents/PropertyQuery.ts`) and this file supplies the
// one implementation, injected through `ResolverContext.readProperty` by
// `ZeroTokenChatBridge.buildContext()`. Same seam as `visibility`, `rooms`,
// `catalogues` and `resolveScope`.
//
// ── WHY `storeRegistry`, AND NOT A HAND-PICKED STORE PER KIND ───────────────
//
// `storeRegistry` is the ADR-0318 AUTHORITATIVE element-store slot:
// `composeRuntime.ts:1554-1558` registers the geometry singletons into it
// (`@pryzm/geometry-wall/store`, `/geometry-door`, `/geometry-window`,
// `/geometry-slab/store`, `@pryzm/room-topology/store`) and
// `apps/editor/src/engine/initStores.ts:101-134` registers the remaining
// twenty-odd. `runtime.stores.elements.get(kind)` is a thin wrapper over the
// SAME map (`composeRuntime.ts:1573`). It is therefore the same record the
// fragment builders, the 2-D plan projector, the IFC exporter and persistence
// read.
//
// ⛔ THE THING THIS AVOIDS, stated because the repository has measured it.
// There are TWO record worlds per family: the L0 Zod schema re-exported as the
// plugin DTO (`plugins/wall/src/store.ts:15-18` and siblings), and the geometry
// record. `initBusHandlers.ts:1160-1168` records the cost of picking the wrong
// one — every `<family>.setMaterial` writes a FRESH plugin store that nothing
// renders, exports or persists, and reports success. A READER that picked the
// plugin twin would answer with numbers the user cannot see on screen, which is
// a worse failure than answering nothing.
//
// ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────
//
// It never invents, never coerces and never defaults. Three distinct outcomes
// (`PropertyReadOutcome`) for three distinct facts:
//   · no store, or the store does not hold the id  → 'no-such-element'
//   · the record has no finite number at `field`   → 'field-absent'
//   · a finite number                              → the number, verbatim
// The unit is the STORE'S unit; conversion is the resolver's single `speak()`
// site, never here (a second conversion point is a second source of truth).
//
// ⚠ A KNOWN, DECLARED LIMIT — hosted openings are DUAL-WRITTEN. A window or
// door dimension edit writes the HOST WALL's opening record AND the rich barrel
// singleton (`UpdateElementParameterCommand`'s window/door route declares scope
// `['wall','window']` / `['wall','door']` for exactly that reason). This reader
// asks the barrel, which the same command writes — so a value it reports is a
// value that edit set. It does NOT cross-check the two legs against each other;
// `tools/ga-gate/check-hosted-dual-write.ts` is the gate that owns that
// question, and duplicating it here would mint a second opinion about it.

import { storeRegistry } from '@pryzm/core-app-model';
import type { PropertyReadOutcome, PropertyReader } from '@pryzm/ai-host';

/**
 * The chat's element kinds are normalized (`curtain-wall`), and the registry's
 * keys are whatever each registration site typed (`curtainwall`). Rather than
 * "fix" one of them from here — which would be a third naming authority — the
 * lookup tries the candidates in order and stops at the first registered key.
 *
 * A kind that resolves to NOTHING yields 'no-such-element', which the resolver
 * reports as unreadable rather than as zero. That is the honest degradation:
 * a naming gap must never present as a measurement.
 */
function candidateKeys(kind: string): readonly string[] {
    const k = kind.toLowerCase().trim();
    const out = [k];
    if (k.includes('-')) {
        out.push(k.replace(/-/g, ''));
        out.push(k.replace(/-(.)/g, (_m, c: string) => c.toUpperCase()));
    }
    return out;
}

interface ReadableStore {
    getById?: (id: string) => unknown;
    get?: (id: string) => unknown;
}

function recordFor(kind: string, elementId: string): unknown {
    for (const key of candidateKeys(kind)) {
        const store = storeRegistry.getStoreForType(key) as ReadableStore | undefined;
        if (store === undefined) continue;
        const rec = store.getById?.(elementId) ?? store.get?.(elementId);
        if (rec !== undefined && rec !== null) return rec;
    }
    return undefined;
}

/**
 * Read ONE numeric property off the authoritative record.
 *
 * P8: no span here on purpose — the caller (`applyPropertyQuery`) already wraps
 * the whole read in `pryzm.ai.chat.query`, and a per-field child span would
 * multiply the trace by the selection size for no extra information.
 */
export const chatPropertyReader: PropertyReader = (
    elementId: string,
    elementType: string,
    field: string,
): PropertyReadOutcome => {
    let rec: unknown;
    try {
        rec = recordFor(elementType, elementId);
    } catch (err) {
        // A store that throws is UNREADABLE, not empty. Reported as
        // 'no-such-element' — the resolver's copy for that case says the value
        // could not be read and changes nothing, which is true either way.
        console.warn('[chatPropertyReader] store read failed:', err);
        return { ok: false, reason: 'no-such-element' };
    }
    if (rec === undefined || typeof rec !== 'object') {
        return { ok: false, reason: 'no-such-element' };
    }
    const value = (rec as Record<string, unknown>)[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, reason: 'field-absent' };
    }
    return { ok: true, value };
};
