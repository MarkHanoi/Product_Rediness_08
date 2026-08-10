// ZeroTokenChatBridge — ADR-0313 tier 0/1 zero-token resolution for the AI
// chat panel.
//
// Sits in FRONT of `aiService.query()` in AIPanel._executeSend: if the
// utterance is command-shaped, it resolves and dispatches with ZERO tokens;
// a `miss` returns false and the panel falls through to the existing LLM
// path unchanged. A `refusal` is rendered as an honest chat reply
// (§CONTEXT-DATA-HONESTY) and does NOT fall through — no guessing at
// recognized-but-underspecified intents.
//
// P6: every mutation goes through `runtime.bus.executeCommand` — the same
//     verbs/payloads the property panel and keyboard shortcuts dispatch.
// Batching (ADR-0314, corrected): `batchCoordinator.runBatch` is the EVENT/
//     GEOMETRY-STORM gate only — it is deliberately undo-NEUTRAL
//     (BatchCoordinator.ts §"Undo/Redo Impact: No"; measured by
//     batchNestingUndo.test.ts). N commands inside runBatch are N undo
//     entries, and the summary must say so. ONE undo entry is bought only by
//     dispatching ONE batch command (wall.updateSystemTypeBatch,
//     wall.updateColorBatch — C16 §8.6), never by holding a batch open.
//     This header previously claimed the opposite; the claim was false.
// P8: dispatch runs inside the `pryzm.ai.chat.dispatch` span
//     (`withChatDispatchSpan`, @pryzm/ai-host); resolution itself is spanned
//     inside `resolveUtterance`.
// undo/redo are LOCAL actions — the bus verbs 'undo'/'redo' have no
//     registered handler (dispatching them throws CommandBusError), so we call
//     performUndo()/performRedo() exactly like the Ctrl+Z shortcut does.
// Level switch is a `projectContext.activeLevelId` assignment (the
//     WorkspaceController pattern) — there is no bus verb for it.

import {
    resolveUtterance,
    resolveNaturalLanguage,
    noteResolution,
    withChatDispatchSpan,
    capabilityGapRefusal,
    type ConversationContext,
    type ResolverContext,
    type ResolverSelection,
    type ResolverWallSystemType,
    type ZeroTokenResolution,
} from '@pryzm/ai-host';
import { batchCoordinator, selectionBus, storeRegistry } from '@pryzm/core-app-model';
// The ONE forgiving wall-type lookup (exact id → exact name → case-insensitive
// name). Injected into the pure resolver rather than reimplemented inside it —
// a second matcher here would be the same two-sources-of-truth defect the
// capability registry exists to delete.
import { resolveWallSystemTypeRef } from '@pryzm/command-registry';
import { resolveActiveLevelId } from '../apartment-layout/activeLevel';

// ─── Minimal window facets (P4: typed casts, no `(window as any)`) ───────────

interface ObjectLike {
    userData?: { id?: unknown; elementType?: unknown };
    parent?: ObjectLike | null;
}
interface WindowLike {
    selectionManager?: { selectedObject?: ObjectLike | null };
    bimManager?: { getLevels?: () => ReadonlyArray<{ id: string; name?: string; elevation?: number }> };
    projectContext?: { activeLevelId?: string | null };
    runtime?: {
        bus?: { executeCommand(type: string, payload: unknown): Promise<unknown> };
        events?: { emit(name: string, payload: unknown): void };
    };
}
const win = (): WindowLike => window as unknown as WindowLike;

// ─── Context building ────────────────────────────────────────────────────────

/** Resolve an element id's TYPE by probing the store registry's typed stores
 *  (O(registered types); selections are small). Returns null when no store
 *  claims the id — the caller must then fall back or drop the id, never guess. */
function elementTypeOf(id: string): string | null {
    for (const type of storeRegistry.getRegisteredTypes()) {
        const store = storeRegistry.getStoreForType(type);
        if (store === undefined) continue;
        try {
            const has =
                store.has?.(id) ??
                (store.getById?.(id) !== undefined || store.get?.(id) !== undefined);
            if (has) return type.toLowerCase();
        } catch {
            // A store that throws on probe simply doesn't claim the id.
        }
    }
    return null;
}

/** Walk up from the raw selected Object3D to the BIM root that carries
 *  userData.id + userData.elementType (same walk as initUI.deleteSelected). */
function singleSelectionFromManager(): readonly ResolverSelection[] {
    let node: ObjectLike | null | undefined = win().selectionManager?.selectedObject;
    while (node && !(typeof node.userData?.id === 'string' && typeof node.userData?.elementType === 'string')) {
        node = node.parent;
    }
    if (!node?.userData) return [];
    return [{
        elementId: node.userData.id as string,
        elementType: (node.userData.elementType as string).toLowerCase(),
    }];
}

/**
 * ADR-0314 §Selection batch — the chat sees the FULL multi-selection.
 *
 * `selectionBus.currentIds` is the authority on the selected SET (the same
 * source the AI-panel "Selected walls" pill reads); the legacy single-object
 * walk remains as the fallback for environments where the bus is empty but a
 * primary object is highlighted. An id whose type no store claims is DROPPED
 * (not guessed) — an unclassifiable target must never receive a command.
 */
function currentSelection(): readonly ResolverSelection[] {
    let ids: readonly string[] = [];
    try {
        ids = selectionBus.currentIds;
    } catch {
        ids = [];
    }
    if (ids.length > 0) {
        const out: ResolverSelection[] = [];
        for (const id of ids) {
            const type = elementTypeOf(id);
            if (type !== null) out.push({ elementId: id, elementType: type });
        }
        if (out.length > 0) return out;
    }
    return singleSelectionFromManager();
}

/** The project's wall-type catalogue, read lazily so a headless/boot-time call
 *  cannot throw. The STORE is read here (app layer); the resolver stays pure. */
async function wallTypeCatalogue(): Promise<{
    resolve: (ref: string) => ResolverWallSystemType | null;
    names: readonly string[];
}> {
    const { wallSystemTypeStore } = await import('@pryzm/geometry-wall');
    return {
        resolve: (ref: string) => {
            const hit = resolveWallSystemTypeRef(wallSystemTypeStore, ref);
            return hit === null ? null : { id: hit.id, name: hit.name };
        },
        names: wallSystemTypeStore.getAll().map((t) => t.name),
    };
}

async function buildContext(): Promise<ResolverContext> {
    const levels = (win().bimManager?.getLevels?.() ?? []).map((l, i) => ({
        id: l.id,
        name: l.name ?? `Level ${i}`,
        ...(typeof l.elevation === 'number' ? { elevation: l.elevation } : {}),
    }));
    const activeLevelId = resolveActiveLevelId();
    // §FEAT-CHAT-WALL-TYPE — the `wall-system-types` value source, injected.
    // A catalogue that cannot be read is reported as ABSENT (the command then
    // does the resolving and the refusing) rather than as EMPTY, which would
    // make "no such wall type" and "could not read the catalogue" the same
    // sentence — §CONTEXT-DATA-HONESTY.
    let catalogue: Awaited<ReturnType<typeof wallTypeCatalogue>> | null = null;
    try {
        catalogue = await wallTypeCatalogue();
    } catch (err) {
        console.warn('[ZeroTokenChatBridge] wall type catalogue unavailable:', err);
    }
    return {
        selection: currentSelection(),
        levels,
        ...(activeLevelId !== undefined ? { activeLevelId } : {}),
        ...(catalogue !== null
            ? { resolveWallSystemType: catalogue.resolve, wallSystemTypeNames: catalogue.names }
            : {}),
        // level.add call-site convention (ProjectTreeSection): `L${Date.now()}`.
        mintId: () => `L${Date.now()}`,
    };
}

// ─── UI hooks the panel provides ─────────────────────────────────────────────

export interface ZeroTokenUiHooks {
    /** Append an assistant bubble to the transcript. */
    say(text: string): void;
    /** Render an inline Confirm/Cancel card; resolves true only on Confirm. */
    confirm(summary: string): Promise<boolean>;
}

// ─── Execution ───────────────────────────────────────────────────────────────

async function dispatchCommands(
    r: Extract<ZeroTokenResolution, { kind: 'commands' }>,
    ctx: ResolverContext,
    hooks: ZeroTokenUiHooks,
): Promise<void> {
    const bus = win().runtime?.bus;
    if (!bus) {
        hooks.say('The command system is not ready yet — nothing was changed. Try again in a moment.');
        return;
    }
    if (r.destructive) {
        const ok = await hooks.confirm(r.summary);
        if (!ok) {
            hooks.say('Cancelled — nothing was changed.');
            return;
        }
    }
    // §CONTEXT-DATA-HONESTY — the batch commands report partial failure
    // ("Changed 12 of 40 walls — 28 skipped: 28× a raked wall cannot take a
    // layered type") on a CustomEvent rather than in the bus result. The
    // generic "Done" line below would hide exactly the information the founder
    // needs, so when the report arrives it REPLACES that line.
    // ADR-0314 — one command→event table instead of a per-command listener.
    // Collected into an ARRAY, not a `let`: the listener assigns from inside a
    // closure, which TypeScript's control-flow analysis cannot see, so a `let`
    // is narrowed to `null` at every later read.
    const BATCH_REPORT_EVENTS: Readonly<Record<string, string>> = {
        'wall.updateSystemTypeBatch': 'pryzm-wall-type-batch-report',
        'wall.updateColorBatch': 'pryzm-wall-color-batch-report',
    };
    const batchReports: { success: boolean; info: readonly string[] }[] = [];
    const onBatchReport = (e: Event): void => {
        const detail = (e as CustomEvent).detail as { success?: boolean; info?: string[] } | undefined;
        if (detail) batchReports.push({ success: detail.success ?? false, info: detail.info ?? [] });
    };
    const reportEvents = [...new Set(
        r.commands.map((c) => BATCH_REPORT_EVENTS[c.type]).filter((ev): ev is string => ev !== undefined),
    )];
    for (const ev of reportEvents) window.addEventListener(ev, onBatchReport);

    const failures: string[] = [];
    await withChatDispatchSpan(async () => {
        if (r.commands.length > 1) {
            // ONE undoable unit — the established AI-batch pattern.
            const results: Promise<unknown>[] = [];
            batchCoordinator.runBatch(() => {
                for (const c of r.commands) {
                    results.push(bus.executeCommand(c.type, c.payload));
                }
            }, {
                levelIds: ctx.activeLevelId !== undefined ? [ctx.activeLevelId] : [],
                totalElementCount: r.commands.length,
            });
            const settled = await Promise.allSettled(results);
            settled.forEach((s, i) => {
                if (s.status === 'rejected') {
                    failures.push(`${r.commands[i]!.type}: ${String((s.reason as Error)?.message ?? s.reason)}`);
                }
            });
        } else {
            const c = r.commands[0]!;
            try {
                await bus.executeCommand(c.type, c.payload);
            } catch (err) {
                failures.push(`${c.type}: ${String((err as Error)?.message ?? err)}`);
            }
        }
    }, { 'pryzm.ai.chat.intent': r.intent, 'pryzm.ai.chat.tier': r.tier });

    for (const ev of reportEvents) window.removeEventListener(ev, onBatchReport);

    if (failures.length > 0) {
        // Honesty: a failed dispatch must never read like a success.
        hooks.say(`That did not complete — the model refused: ${failures.join('; ')}`);
        return;
    }
    const report = batchReports[0];
    if (report !== undefined) {
        const lines = report.info.length > 0 ? report.info.join(' · ') : r.summary;
        hooks.say(
            report.success
                ? `${lines}. Undo with Ctrl+Z. (resolved without AI tokens)`
                : `Nothing was changed — ${lines}`,
        );
        return;
    }
    // ADR-0314 honesty: runBatch is undo-NEUTRAL, so N commands are N undo
    // steps — say so instead of implying one.
    const undoHint = r.commands.length > 1
        ? `undo with Ctrl+Z (${r.commands.length} steps)`
        : 'undo with Ctrl+Z';
    hooks.say(`${r.summary}. Done — ${undoHint}. (resolved without AI tokens)`);
}

async function runLocal(
    r: Extract<ZeroTokenResolution, { kind: 'local' }>,
    hooks: ZeroTokenUiHooks,
): Promise<void> {
    await withChatDispatchSpan(async () => {
        switch (r.action) {
            case 'undo': {
                const m = await import('../../engine/undo/performUndoRedo.js');
                m.performUndo();
                break;
            }
            case 'redo': {
                const m = await import('../../engine/undo/performUndoRedo.js');
                m.performRedo();
                break;
            }
            case 'setActiveLevel': {
                if (r.levelId !== undefined) {
                    const w = win();
                    if (w.projectContext) w.projectContext.activeLevelId = r.levelId;
                    w.runtime?.events?.emit('pryzm-active-level-changed', { levelId: r.levelId });
                }
                break;
            }
        }
    }, { 'pryzm.ai.chat.intent': r.intent, 'pryzm.ai.chat.tier': r.tier });
    hooks.say(`${r.summary}. (resolved without AI tokens)`);
}

// ─── Conversation context (ADR-0313 §NL) ─────────────────────────────────────
// Small explicit cross-turn state for follow-ups ("Actually, make it 3.2m.").
// It biases INTERPRETATION only — targeting always comes from the live
// selection/levels rebuilt in buildContext() on every message.

let conversation: ConversationContext = {};

/** Reset the cross-turn conversation context (tests / project switch). */
export function resetZeroTokenConversation(): void {
    conversation = {};
}

/**
 * Try to handle a chat utterance with the zero-token resolution ladder:
 * tier 0 grammar → tier 1 synonyms/typos → local natural-language layer.
 * Returns true when handled (dispatched, clarified, OR refused with a
 * reason) — the caller must then NOT send the utterance to the LLM.
 * Returns false only on a miss so the existing aiService path runs unchanged.
 */
export async function tryHandleZeroToken(query: string, hooks: ZeroTokenUiHooks): Promise<boolean> {
    let resolution: ZeroTokenResolution;
    let ctx: ResolverContext;
    try {
        ctx = await buildContext();
        resolution = resolveUtterance(query, ctx);
    } catch (err) {
        // A resolver crash must not take the chat down — fall through to the LLM.
        console.error('[ZeroTokenChatBridge] resolver failed, falling through:', err);
        return false;
    }
    if (resolution.kind === 'miss') {
        // §ADR-0313 NL layer — natural phrasing, still ZERO tokens. Produces
        // semantics only; applySemanticIntent (inside) built this resolution.
        try {
            const nl = resolveNaturalLanguage(query, { ...ctx, conversation });
            conversation = nl.conversation;
            if (nl.kind === 'miss') {
                // ADR-0313 §Capability-driven refusals — the LAST deterministic
                // step before the LLM. If the ask names a topic the editor DOES
                // implement but the chat deliberately does not drive, say so and
                // say what IS connected, generated from the capability registry.
                // Anything else stays a miss: an honest "I don't know" beats a
                // confident list of unrelated abilities.
                const gap = capabilityGapRefusal(query, ctx.selection.map((s) => s.elementType));
                if (gap === null) return false; // → LLM
                resolution = gap;
            } else if (nl.kind === 'clarification') {
                // Recognized but underspecified: ask, never guess. Handled —
                // the answer arrives as the next chat message.
                hooks.say(nl.question);
                return true;
            } else {
                resolution = nl.resolution;
            }
        } catch (err) {
            console.error('[ZeroTokenChatBridge] NL resolver failed, falling through:', err);
            return false;
        }
    } else {
        // Fold tier-0/1 understanding into the conversation so follow-ups
        // work regardless of which tier answered the previous turn.
        conversation = noteResolution(conversation, resolution);
    }
    // At this point the utterance was understood (tier 0/1 or NL) — 'miss'
    // already returned false above.
    switch (resolution.kind) {
        case 'refusal': {
            const tail = resolution.suggestions.length > 0
                ? ` Try: ${resolution.suggestions.map((s) => `"${s}"`).join(' or ')}`
                : '';
            hooks.say(`${resolution.reason}${tail}`);
            return true;
        }
        case 'local':
            await runLocal(resolution, hooks);
            return true;
        case 'commands':
            await dispatchCommands(resolution, ctx, hooks);
            return true;
    }
}
