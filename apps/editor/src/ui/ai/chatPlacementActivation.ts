// chatPlacementActivation — §FEAT-CHAT-TOOL-ACTIVATION (L-906, founder-urgent).
//
// The editor half of the chat placement capability. The ai-host half
// (`PlacementActivation.ts`) parses "create a bed" / "place a sofa" /
// "create slab" into a LOCAL `activateTool` action carrying the RAW noun;
// this module resolves that noun and ACTIVATES the same placement tool the
// Create palette button activates — mouse preview and all — for ALL
// placeable elements. Chat → TOOL ACTIVATION, never chat → creation: nothing
// is created until the user clicks in the canvas, so no position is ever
// guessed (C83 §4.3) and C18 preview ghosts never enter a store. Activation
// itself is not a store mutation, so there is nothing to undo until the user
// places; the placed element then behaves exactly as palette-placed.
//
// ENUMERATION (C69 — never a hand-written rival list). Exactly the two
// sources the L-906 ratified shape names, read live at resolution time:
//   • `ELEMENT_CREATION_MATRIX` (`engine/views/plantools/elementCreationMatrix.ts`)
//     — every element-creation tool, keyed by the SAME string
//     `runtime.tools.activate()` and the plan registry switch on.
//   • the C17 furniture catalogue (`FurnitureCategoryRegistry.getCategories()`)
//     — every placeable furniture item, parametric and GLB.
// Per-tool drawing MODES are deliberately NOT enumerated: mode threading is
// not uniform across the registered activators (e.g. ToolsAreaLayout registers
// `'floor'`/`'ceiling'` activators that DROP the mode argument and route AUTO
// through separate `':auto'` families), so a mode entry here could claim
// "Auto Floor activated" while the activator silently discarded the mode —
// the ElementCapabilities lie in a new costume. Tools and catalogue items
// activate exactly; modes stay with the palette and the DrawingModeBar.
//
// RESOLUTION runs on the ONE `resolveCatalogueRef` ladder
// (`packages/command-registry/src/catalogue/resolveCatalogueRef.ts` — exact id
// → exact name → case-insensitive → unambiguous word subset). Ambiguity ASKS
// naming the real candidates; a no-match names the NEAREST items instead of
// dead-ending (§CONTEXT-DATA-HONESTY: the refusal lists what IS possible).
//
// ACTIVATION reuses the palette's own seams, no rival wiring (P1/P6):
//   • matrix tools    → `runtime.tools.activate(tool)` — the exact call
//     `CreateRailPanel._activateTool` makes; the registered activator owns
//     its default mode.
//   • furniture items → `activateFurnitureItem()` — the ladder extracted from
//     `FurnitureSidePanel._activateItem`, shared with the panel card click.

import {
    ELEMENT_CREATION_MATRIX,
    type ElementCreationCapability,
} from '../../engine/views/plantools/elementCreationMatrix.js';
import {
    resolveCatalogueRef,
    catalogueNameWords,
    type CatalogueReader,
} from '@pryzm/command-registry';
import {
    getCategories,
    type FurnitureCategoryDescriptor,
    type FurnitureTypeDescriptor,
} from '../furniture-carousel/FurnitureCategoryRegistry';
import { activateFurnitureItem } from '../furniture-carousel/activateFurnitureItem';

// ─── Enumeration ─────────────────────────────────────────────────────────────

/** One placeable thing chat can activate a tool for. */
export type PlaceableEntry =
    | {
          readonly kind: 'tool';
          /** `CatalogueEntry.id` — the matrix/activator tool key. */
          readonly id: string;
          /** `CatalogueEntry.name` — the matrix label. */
          readonly name: string;
          readonly tool: string;
          readonly views: readonly string[];
      }
    | {
          readonly kind: 'furniture';
          /** The furniture type (or GLB path's descriptor type). */
          readonly id: string;
          readonly name: string;
          readonly item: FurnitureTypeDescriptor;
      };

/**
 * Enumerate everything chat can activate placement for, LIVE from the two
 * declared sources. The parameters exist so a spec can prove derivation (a
 * row added to the matrix is automatically resolvable); production callers
 * pass nothing.
 */
export function enumeratePlaceables(
    matrix: readonly ElementCreationCapability[] = ELEMENT_CREATION_MATRIX,
    categories: readonly FurnitureCategoryDescriptor[] = getCategories(),
): readonly PlaceableEntry[] {
    const entries: PlaceableEntry[] = [];
    for (const cap of matrix) {
        entries.push({
            kind: 'tool',
            id: cap.tool,
            name: cap.label,
            tool: cap.tool,
            views: cap.views,
        });
    }
    for (const cat of categories) {
        for (const item of cat.items) {
            entries.push({
                kind: 'furniture',
                id: String(item.type),
                name: item.label,
                item,
            });
        }
    }
    return entries;
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export type PlacementResolution =
    | { readonly outcome: 'resolved'; readonly entry: PlaceableEntry }
    | { readonly outcome: 'ask'; readonly candidates: readonly PlaceableEntry[] }
    | { readonly outcome: 'no-match'; readonly nearest: readonly PlaceableEntry[] };

/**
 * Resolve a spoken reference against the enumeration through the ONE
 * `resolveCatalogueRef` ladder. Never throws; ambiguity and no-match are
 * DATA, phrased by the caller.
 */
export function resolvePlacement(
    ref: string,
    entries: readonly PlaceableEntry[] = enumeratePlaceables(),
): PlacementResolution {
    const reader: CatalogueReader<PlaceableEntry> = {
        getById: (id) => entries.find((e) => e.id === id),
        getAll: () => [...entries],
    };
    const r = resolveCatalogueRef(reader, ref, { spanDomain: 'pryzm.chat.placement' });
    if (r.entry !== null) return { outcome: 'resolved', entry: r.entry };
    if (r.resolvedBy === 'ambiguous') {
        return { outcome: 'ask', candidates: dedupeByName(r.candidates ?? []) };
    }
    return { outcome: 'no-match', nearest: nearestPlaceables(ref, entries) };
}

/** Catalogue variants share a display name (colourways) — list each name once. */
function dedupeByName(entries: readonly PlaceableEntry[]): readonly PlaceableEntry[] {
    const seen = new Set<string>();
    const out: PlaceableEntry[] = [];
    for (const e of entries) {
        if (seen.has(e.name)) continue;
        seen.add(e.name);
        out.push(e);
    }
    return out;
}

/**
 * The nearest real items to an unresolved reference, so the refusal names
 * what IS placeable instead of dead-ending. Ranked by shared meaningful
 * words, then prefix affinity ("bedroom" → "Bed"), then edit distance.
 */
export function nearestPlaceables(
    ref: string,
    entries: readonly PlaceableEntry[],
    limit = 3,
): readonly PlaceableEntry[] {
    const wanted = catalogueNameWords(ref);
    const refLower = ref.trim().toLowerCase();
    const scored = entries.map((e) => {
        const words = [...catalogueNameWords(e.name), ...catalogueNameWords(e.id)];
        const wordSet = new Set(words);
        const shared = wanted.filter((w) => wordSet.has(w)).length;
        const prefix = wanted.some((w) =>
            words.some(
                (c) =>
                    (w.length >= 3 && c.startsWith(w)) ||
                    (c.length >= 3 && w.startsWith(c)),
            ),
        )
            ? 1
            : 0;
        return { e, shared, prefix, dist: levenshtein(refLower, e.name.toLowerCase()) };
    });
    scored.sort(
        (a, b) =>
            b.shared - a.shared ||
            b.prefix - a.prefix ||
            a.dist - b.dist ||
            a.e.name.localeCompare(b.e.name),
    );
    return dedupeByName(scored.map((s) => s.e)).slice(0, limit);
}

/** Plain two-row Levenshtein — inputs are short (ref ≤ 40 chars, labels). */
function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(
                prev[j]! + 1,
                cur[j - 1]! + 1,
                prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
        }
        prev = cur;
    }
    return prev[b.length]!;
}

// ─── Activation ──────────────────────────────────────────────────────────────

/** The runtime handle the palette itself uses (`CreateRailPanel._activateTool`). */
type PlacementWindow = {
    runtime?: {
        tools?: { activate?: (toolId: string, mode?: string) => void };
    };
};
const win = (): PlacementWindow => window as unknown as PlacementWindow;

const CLICK_TO_PLACE =
    'move the mouse in the canvas to preview it and click to place — nothing is created until you click';

/**
 * Resolve `itemRef` and activate the placement tool, exactly as the palette
 * button would. Returns the chat reply — always honest about what happened:
 * activated / ambiguous-with-candidates / no-match-with-nearest / not-ready.
 */
export function activatePlacementFromChat(itemRef: string): string {
    const ref = itemRef.trim();
    if (ref === '') {
        return 'Tell me what to place — e.g. "create a bed" or "create a slab".';
    }
    const entries = enumeratePlaceables();
    const res = resolvePlacement(ref, entries);

    if (res.outcome === 'ask') {
        const names = res.candidates.slice(0, 6).map((c) => c.name);
        const more = res.candidates.length > 6 ? ` (+${res.candidates.length - 6} more)` : '';
        return (
            `"${ref}" matches ${res.candidates.length} placeable items: ` +
            `${names.join(', ')}${more}. Which one? Nothing was activated — ` +
            `say e.g. "create a ${names[0]!.toLowerCase()}".`
        );
    }

    if (res.outcome === 'no-match') {
        const names = res.nearest.map((n) => n.name);
        return (
            `There is no placeable item or creation tool called "${ref}" — ` +
            `nothing was activated.` +
            (names.length > 0
                ? ` Nearest matches: ${names.join(', ')} — say e.g. "create a ${names[0]!.toLowerCase()}".`
                : '')
        );
    }

    const entry = res.entry;
    if (entry.kind === 'furniture') {
        if (!activateFurnitureItem(entry.item)) {
            return (
                `I resolved "${ref}" to ${entry.name}, but the furniture placement ` +
                `tool is not ready in this session — nothing was activated. ` +
                `The Create palette's furniture panel has the same item.`
            );
        }
        return `${entry.name} placement is active — ${CLICK_TO_PLACE}.`;
    }

    const tools = win().runtime?.tools;
    if (typeof tools?.activate !== 'function') {
        return (
            `I resolved "${ref}" to the ${entry.name} tool, but the tool runtime ` +
            `is not ready in this session — nothing was activated. ` +
            `The Create palette's ${entry.name} button starts the same tool.`
        );
    }
    // The exact palette call (`CreateRailPanel._activateTool`): no mode is
    // passed, so the registered activator applies its own default — the same
    // default the palette's plain button press gets.
    tools.activate(entry.tool);
    const viewNote =
        entry.views.length === 1 ? ` (this tool works in the ${entry.views[0]} view only)` : '';
    return `${entry.name} tool is active${viewNote} — ${CLICK_TO_PLACE}.`;
}
