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
// §FEAT-RAC-STAIR-SHAPE (L-1541) — the shape chokepoint and its catalogue. The
// SAME `setStairToolConfig` that `BimService.activateStairPathTool` calls, and
// the SAME `STAIR_SHAPES` the palette and the param panel are faces of (C98
// §16.1.c names it the authority). Nothing is transcribed.
import {
    setStairToolConfig,
    STAIR_SHAPES,
    type StairShapeChoice,
} from '@pryzm/geometry-stair';
// ⭐ Lane U6 — the component catalogue (U0) as a THIRD placement source, and the ONE
// arming function (U1) every component-place entry point routes through. "place a
// window" resolves a loaded component DEFINITION/TYPE and arms the SAME plan tool the
// browser's Place button does — no position is guessed (C83 §4.3); the user clicks.
import { componentCatalog } from '../../services/componentCatalog';
import { armComponentPlaceTool } from '../component-browser/componentPlaceTool';
import type { ComponentDefinitionView } from '@pryzm/plugin-component';

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
      }
    | {
          // ⭐ Lane U6 — a loaded component definition (or one of its types). Placement
          // arms the plan tool with these ids; the user's click dispatches
          // `component.place` (U1's proven flow), so no position is ever guessed.
          readonly kind: 'component';
          /** `definitionId` (definition entry) or `definitionId:typeId` (type entry). */
          readonly id: string;
          readonly name: string;
          readonly definitionId: string;
          readonly typeId: string;
          readonly definitionVersion?: string;
          readonly definitionName: string;
          readonly typeName: string;
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
    // ⭐ Lane U6 — the THIRD source, read LIVE from the ONE catalogue (C69: never a
    // hand-written rival list). A definition loaded into the project is automatically
    // chat-placeable; unloaded ⇒ absent ⇒ resolves to nothing and the refusal names
    // what IS loaded. The parameter exists so a spec can prove derivation.
    definitions: readonly ComponentDefinitionView[] = componentCatalog.list(),
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
    for (const def of definitions) {
        const firstType = def.types[0];
        if (firstType === undefined) continue; // FamilyDocument.types is .min(1), but stay honest
        // One entry for the DEFINITION (arms its first/default type) …
        entries.push({
            kind: 'component',
            id: def.definitionId,
            name: def.name,
            definitionId: def.definitionId,
            typeId: firstType.id,
            definitionVersion: def.semver,
            definitionName: def.name,
            typeName: firstType.name,
        });
        // … and one per TYPE, so "place a W-1200" reaches the exact type.
        for (const t of def.types) {
            entries.push({
                kind: 'component',
                id: `${def.definitionId}:${t.id}`,
                name: t.name,
                definitionId: def.definitionId,
                typeId: t.id,
                definitionVersion: def.semver,
                definitionName: def.name,
                typeName: t.name,
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

// §P4-CAST-AT-SOURCE (H4, 2026-08-16) — the runtime handle the palette itself uses
// (`CreateRailPanel._activateTool`) is now read off the TYPED global. This block
// used to declare a local `PlacementWindow` shape and reach it with
// `window as unknown as PlacementWindow` — a double cast through `unknown`, which
// defeats the Window type just as completely as `(window as any)` and merely takes
// two hops. It was one of the two sites that pushed `check-cast-unknown` (L-845)
// past its shrink-only ceiling. The slot is declared once, narrowly, at
// apps/editor/src/types/globals.d.ts (`Window['runtime']['tools']`), so every
// consumer of the same seam gets the same checked type instead of re-minting a
// private shape — the fix the gate's own remediation text asks for.

const CLICK_TO_PLACE =
    'move the mouse in the canvas to preview it and click to place — nothing is created until you click';

/**
 * Resolve `itemRef` and activate the placement tool, exactly as the palette
 * button would. Returns the chat reply — always honest about what happened:
 * activated / ambiguous-with-candidates / no-match-with-nearest / not-ready.
 */
/**
 * §FEAT-RAC-STAIR-SHAPE (L-1541) — options the chat may thread into an activation.
 *
 * ⭐ THE HEADER'S "MODES ARE DELIBERATELY NOT ENUMERATED" RULE STILL STANDS, AND
 * THIS DOES NOT BREAK IT. That rule was measured against `modes`, whose threading
 * is genuinely non-uniform (activators that DROP the mode argument). SHAPE is a
 * different axis with a different guarantee: it became its own declared field on
 * 2026-08-19 (C98 §16.1.c — `modes` and `shapes` are separate slots, and
 * concatenating them is forbidden), it is declared `modeSource: 'shared'`, and it
 * has exactly ONE chokepoint — `StairToolConfigStore` — which every stair
 * surface reads (`StairPlanToolHandler` calls `getStairToolConfig()`, the
 * stair-path controller authors from the same config).
 *
 * So this is not "a mode entry that could be silently discarded". It writes the
 * same store the palette's L-Shape button writes, through the same setter
 * (`BimService.activateStairPathTool`'s own first line), and then activates the
 * same tool this function already activates. If a future family wants the same
 * treatment it needs the same proof, not this precedent.
 */
export interface ChatPlacementOptions {
    /** The stair shape axis — `StairShapeChoice` ('I' | 'L' | 'U' | 'C'). */
    readonly stairShape?: 'I' | 'L' | 'U' | 'C';
    /**
     * A clause the language layer could not honour, appended ONLY on a
     * successful activation — never onto a "nothing was activated" reply, where
     * it would be a second false statement. See PlacementActivation.ts.
     */
    readonly unhonouredNote?: string;
}

/**
 * Publish the stair shape to the ONE chokepoint before activating.
 *
 * Returns the human label for the reply, or null when the shape could not be
 * published — in which case the caller must NOT claim a shape (§CONTEXT-DATA-
 * HONESTY: a failure and a success never look the same).
 */
function publishStairShape(shape: StairShapeChoice): string | null {
    try {
        setStairToolConfig({ shape });
        return STAIR_SHAPES.find((s) => s.label === shape)?.hint ?? `${shape}-shape`;
    } catch {
        // §CONTEXT-DATA-HONESTY — an unwritable config is reported as "no shape
        // claimed", never as a shape that was set. The caller degrades to the
        // plain activation reply rather than promising an L that is an I.
        return null;
    }
}

export function activatePlacementFromChat(
    itemRef: string,
    options: ChatPlacementOptions = {},
): string {
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
    if (entry.kind === 'component') {
        // ⭐ Lane U6 — arm the plan tool with the resolved (definitionId, typeId), the
        // SAME `armComponentPlaceTool` the browser's Place button and
        // `BimService.activateComponentTool` route through (L-5709: one function, one
        // path). ⛔ NO `component.place` dispatch here and NO guessed position — the
        // user's canvas click dispatches it (U1's proven flow).
        const armed = armComponentPlaceTool({
            definitionId: entry.definitionId,
            typeId: entry.typeId,
            definitionVersion: entry.definitionVersion,
            definitionName: entry.definitionName,
            typeName: entry.typeName,
        });
        const typeNote = entry.name === entry.typeName ? '' : ` (type ${entry.typeName})`;
        if (!armed) {
            return (
                `I resolved "${ref}" to the ${entry.definitionName} component${typeNote}, but no ` +
                'plan view is open to arm the place tool — nothing was activated. Open a plan ' +
                'view (or use the Components browser\'s Place button) and try again.'
            );
        }
        return `${entry.definitionName} component${typeNote} placement is active — ${CLICK_TO_PLACE}.`;
    }
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

    const tools = window.runtime?.tools;
    if (typeof tools?.activate !== 'function') {
        return (
            `I resolved "${ref}" to the ${entry.name} tool, but the tool runtime ` +
            `is not ready in this session — nothing was activated. ` +
            `The Create palette's ${entry.name} button starts the same tool.`
        );
    }
    // §FEAT-RAC-STAIR-SHAPE (L-1541) — publish the SHAPE before activating, the
    // same order `BimService.activateStairPathTool` uses (`setStairToolConfig`
    // first, then arm the surfaces), so the handler reads the resolved config on
    // its first `getStairToolConfig()`. Publishing after would arm the tool with
    // the previous shape and set the new one for the NEXT stair — the classic
    // off-by-one-gesture bug.
    //
    // ⚠ `shapeLabel` stays null unless the write really happened; the reply then
    // claims no shape at all rather than an unverified one.
    // Both stair rows are shape-bearing in the matrix (`stair` and `stair-path`
    // are its only two-axis rows, C98 §16.1.c) and both author from the same
    // `StairToolConfigStore`, so both honour a published shape. Any other tool
    // ignores it — the shape is never published onto a family that has no
    // shape axis, which is what would make the reply's "(L-shape)" a lie.
    const shapeLabel =
        options.stairShape !== undefined && (entry.tool === 'stair' || entry.tool === 'stair-path')
            ? publishStairShape(options.stairShape)
            : null;

    // The exact palette call (`CreateRailPanel._activateTool`): no mode is
    // passed, so the registered activator applies its own default — the same
    // default the palette's plain button press gets.
    //
    // §FIX-ACTIVATE-REPORTS-WHETHER-ANYTHING-RAN (L-4600, founder 2026-08-22).
    //
    // ⭐ THE RETURN VALUE IS THE WHOLE FIX. `activate()` used to return `void`
    // and recorded the active-tool id whether or not a real activator existed,
    // so this function reached the success sentence for SIX declared families
    // that arm nothing (measured 2026-08-22 — `furniture`, `grid`, `lift`,
    // `lighting`, `railing`, `stair-path`: the set difference between the tool
    // ids in `ELEMENT_CREATION_MATRIX` and the ids passed to
    // `runtime.tools.register` in `ToolsAreaLayout`). The founder's "Create
    // Stair" report is this shape, and a capability that reports success and
    // activates nothing is the defect this repo has paid for repeatedly.
    //
    // ⛔ THE FIX IS NOT A VAGUER SENTENCE. The reply below is MORE specific
    // than the one it replaces: it names the family, states plainly that
    // nothing was activated, and points at the palette — the same escape hatch
    // every other honest branch in this function offers. C01 §6 rule 6:
    // "cannot happen" is a measurement, and here we have the measurement at
    // runtime, so we report it rather than assuming the happy path.
    const armed = tools.activate(entry.tool);
    if (armed === false) {
        return (
            `I resolved "${ref}" to the ${entry.name} tool, but NO ACTIVATOR is registered ` +
            `for "${entry.tool}" in this session — nothing was activated and nothing will be ` +
            `placed if you click. This is a wiring gap, not something you did wrong. ` +
            `The console line beginning "[runtime-composer/tools] NO ACTIVATOR registered" ` +
            `names the families that ARE wired.`
        );
    }
    const viewNote =
        entry.views.length === 1 ? ` (this tool works in the ${entry.views[0]} view only)` : '';
    const shaped = shapeLabel === null ? entry.name : `${entry.name} (${shapeLabel})`;
    // The un-honoured clause is appended ONLY here, on the success path — every
    // early return above says "nothing was activated", and a note explaining
    // which half of a non-event was skipped would be nonsense on top of it.
    const note = options.unhonouredNote ?? '';
    return `${shaped} tool is active${viewNote} — ${CLICK_TO_PLACE}.${note}`;
}
