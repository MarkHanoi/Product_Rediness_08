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
// One undo unit: multi-command resolutions run inside
//     `batchCoordinator.runBatch` (the AI apartment-generator pattern);
//     single commands are already one undo entry via the bus.
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
    withChatDispatchSpan,
    type ResolverContext,
    type ResolverSelection,
    type ZeroTokenResolution,
} from '@pryzm/ai-host';
import { batchCoordinator } from '@pryzm/core-app-model';
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

/** Walk up from the raw selected Object3D to the BIM root that carries
 *  userData.id + userData.elementType (same walk as initUI.deleteSelected). */
function currentSelection(): readonly ResolverSelection[] {
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

function buildContext(): ResolverContext {
    const levels = (win().bimManager?.getLevels?.() ?? []).map((l, i) => ({
        id: l.id,
        name: l.name ?? `Level ${i}`,
        ...(typeof l.elevation === 'number' ? { elevation: l.elevation } : {}),
    }));
    const activeLevelId = resolveActiveLevelId();
    return {
        selection: currentSelection(),
        levels,
        ...(activeLevelId !== undefined ? { activeLevelId } : {}),
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

    if (failures.length > 0) {
        // Honesty: a failed dispatch must never read like a success.
        hooks.say(`That did not complete — the model refused: ${failures.join('; ')}`);
        return;
    }
    hooks.say(`${r.summary}. Done — undo with Ctrl+Z. (resolved without AI tokens)`);
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

/**
 * Try to handle a chat utterance with the zero-token resolver.
 * Returns true when handled (dispatched OR refused with a reason) — the
 * caller must then NOT send the utterance to the LLM. Returns false on a
 * miss so the existing aiService path runs unchanged.
 */
export async function tryHandleZeroToken(query: string, hooks: ZeroTokenUiHooks): Promise<boolean> {
    let resolution: ZeroTokenResolution;
    let ctx: ResolverContext;
    try {
        ctx = buildContext();
        resolution = resolveUtterance(query, ctx);
    } catch (err) {
        // A resolver crash must not take the chat down — fall through to the LLM.
        console.error('[ZeroTokenChatBridge] resolver failed, falling through:', err);
        return false;
    }
    switch (resolution.kind) {
        case 'miss':
            return false;
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
