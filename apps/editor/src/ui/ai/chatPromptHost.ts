/**
 * chatPromptHost — the REACH for the chat prompt pair that already exists.
 *
 * ## What this is NOT
 *
 * It is **not a fifth offer surface**. C83 §4.1 surveyed the repo at `28c6b05c` and
 * found four live propose→consent surfaces already, named
 * `ConsequencePlan`/`ConfirmationFlow`/`ConfirmationCard` as the canonical one, and
 * directed that the chat half of it speaks through the **already-shipped**
 * `ZeroTokenUiHooks` pair (`ZeroTokenChatBridge.ts:790`):
 *
 *     say(text: string): void                    // an assistant bubble
 *     confirm(summary: string): Promise<boolean> // an inline Confirm/Cancel card
 *
 * Both are implemented in `AIPanel` (`addMessage` and `showZeroTokenConfirm`,
 * §ADR-0313) — and both are CLOSURES INSIDE `createAIPanel`. `tryHandleZeroToken`
 * receives them by argument at the call site; nothing outside the panel can reach
 * them. So a subsystem that notices something between user turns had, measurably, no
 * way to speak: the only cross-boundary channel into the transcript was
 * `ai-proposal-added`, which carries a `CommandProposal` — the type C83 §4.1
 * explicitly forbids new work from building on (declared twice, divergently, both
 * exported, `validation` with no code, and both approve paths still reaching
 * `window.commandManager` behind a P6 `TODO`).
 *
 * This module is the missing accessor and nothing else: the panel registers the pair
 * it already has, and callers get the same two functions. No new message shape, no new
 * card, no new store, no new event.
 *
 * ## Ordering
 *
 * The panel is created lazily by `AIAreaLayout`, so a finding can arrive before a host
 * exists. `chatSay` therefore QUEUES (bounded) and flushes on registration — dropping
 * the line would reproduce, in a new place, the exact defect this work closes: the
 * system knowing something and not saying it. `chatConfirm` cannot queue a decision
 * honestly, so with no host it resolves `undefined` — "nobody could be asked", which a
 * caller must distinguish from "the user said no".
 */

export interface ChatPromptHost {
    /** Append an assistant bubble to the transcript. */
    say(text: string): void;
    /** Render an inline Confirm/Cancel card; resolves true only on Confirm. */
    confirm(summary: string): Promise<boolean>;
}

let host: ChatPromptHost | undefined;

/** Bounded so a long headless session cannot accumulate an unbounded backlog. */
const MAX_QUEUED_LINES = 5;
const queued: string[] = [];

/**
 * Called by `createAIPanel` with the hooks it already builds for
 * `tryHandleZeroToken`. Returns an unregister function. A second panel replaces the
 * first — the newest transcript is the one the user is looking at.
 */
export function registerChatPromptHost(h: ChatPromptHost): () => void {
    host = h;
    if (queued.length > 0) {
        const flush = queued.splice(0, queued.length);
        for (const text of flush) {
            try { h.say(text); } catch { /* a broken transcript is not this module's to fix */ }
        }
    }
    return () => { if (host === h) host = undefined; };
}

export function chatPromptHostAvailable(): boolean {
    return host !== undefined;
}

/**
 * Say something in the chat. Returns true when it was delivered now, false when it was
 * queued for the panel that does not exist yet. Never throws.
 */
export function chatSay(text: string): boolean {
    if (typeof text !== 'string' || text.trim() === '') return false;
    if (!host) {
        if (queued.length < MAX_QUEUED_LINES) queued.push(text);
        return false;
    }
    try {
        host.say(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * Ask a Confirm/Cancel question in the chat.
 *
 * `true` = the user confirmed. `false` = the user cancelled. `undefined` = **there was
 * nobody to ask** (no panel yet, or the card threw). The third case is deliberately not
 * folded into `false`: a caller that treats "could not ask" as "declined" is asserting
 * a decision the user never made.
 */
export async function chatConfirm(summary: string): Promise<boolean | undefined> {
    if (!host) return undefined;
    try {
        return await host.confirm(summary);
    } catch {
        return undefined;
    }
}

/** Test seam. */
export function __resetChatPromptHost(): void {
    host = undefined;
    queued.length = 0;
}
