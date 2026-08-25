/**
 * chatPromptHost — the REACH for the chat prompt pair that already exists, and the
 * GUARANTEE that a question actually reaches a human.
 *
 * ## What this is NOT
 *
 * It is **not a fifth offer surface**. C83 §4.1 surveyed the repo at `28c6b05c`, found
 * four live propose→consent surfaces already, named
 * `ConsequencePlan`/`ConfirmationFlow`/`ConfirmationCard` canonical, and directed that
 * the chat half of it speaks through the **already-shipped** `ZeroTokenUiHooks` pair
 * (`ZeroTokenChatBridge.ts:790`):
 *
 *     say(text: string): void                    // an assistant bubble
 *     confirm(summary: string): Promise<boolean> // an inline Confirm/Cancel card
 *
 * Both are implemented in `AIPanel` (`addMessage` and `showZeroTokenConfirm`,
 * §ADR-0313) — and both are CLOSURES INSIDE `createAIPanel`, handed to
 * `tryHandleZeroToken` by argument and reachable from nowhere else. This module is the
 * missing accessor. No new message shape, no new card in the normal path, no new
 * store, no new event.
 *
 * ## §PROMPT-REACHES-A-HUMAN — why this file has more in it than an accessor needs
 *
 * **Measured in production, build `a75e8e1e`.** The §OPENED-REGION detector fired
 * correctly on a real founder wall move — the console carries the complete finding,
 * `gap 2.81 m, anchored 2/2, rooms 2 → 1` — and **the founder saw nothing**. The
 * question was written to the console and stopped there.
 *
 * The cause could not be pinned from the repo alone, and this header does not pretend
 * otherwise. What CAN be stated is that the path from finding to human had **two
 * separate places where it degraded to silence**, and both are now closed:
 *
 * 1. **`chatConfirm` returned `undefined` when no host had registered**, and the
 *    caller's only recourse was a `console.warn`. `createAIPanel` does run at boot
 *    (`Layout.ts:96` → `mountAIArea` → `AIAreaLayout.ts:377`, gated on
 *    `OwnerFeatureFlags.showAIPanel`, which **defaults `true`**), so "the user never
 *    opened the panel" is NOT a sufficient explanation and was not adopted as one.
 *    But any ordering, flag or throw that leaves the host unregistered produced
 *    silence, and that is now impossible: `ensureChatSurface()` actively opens the
 *    panel and waits for the host, and failing that the question is rendered anyway.
 *
 * 2. **`AIPanel.showZeroTokenConfirm` resolves `false` when `transcriptEl` is falsy**
 *    (`AIPanel.ts:1180`; `let transcriptEl: HTMLElement;` at :819 is declared
 *    UNINITIALISED and assigned during DOM build). A prompt asked before the
 *    transcript exists therefore comes back as a **fabricated "the user cancelled"** —
 *    a decision no human made. `ensureChatSurface()` now waits for the transcript to
 *    be present before any confirm is issued.
 *
 * ## THE RULE THIS FILE ENFORCES
 *
 * **A console line is not a user-facing message.** "We told the user" and "we wrote a
 * line nobody reads" must never print as the same outcome — that is the
 * §CONTEXT-DATA-HONESTY failure this codebase keeps paying for. So:
 *
 *   · `chatConfirm` NEVER returns `undefined` in a browser. It escalates.
 *   · The last resort is a VISIBLE fallback prompt carrying the same summary and the
 *     same two answers. It is deliberately ugly and self-identifying: it is a
 *     **failure rendering**, not a surface anybody should design against, and it
 *     `console.error`s and increments `getSurfaceDiagnostics().fallbackPrompts` so the
 *     next occurrence is measurable instead of anecdotal.
 *   · `undefined` survives for ONE case only — no `document` at all (a node harness).
 *     That is "nobody could be asked", which a caller must never fold into "declined".
 */

/**
 * §ASK-FOOTPRINT (L-11066) — the TWO ANSWERS a confirm card offers, when they are
 * not "Confirm" / "Cancel".
 *
 * ⛔ THIS IS NOT A SECOND CONFIRMATION SURFACE. It is the SAME inline card
 * (`AIPanel.showZeroTokenConfirm`), the same two buttons, the same resolve-to-a-
 * boolean contract — only the words on the buttons change. It exists because a
 * question of the form "which of these two?" cannot be asked honestly with buttons
 * that read "Confirm" and "Cancel": the user would have to guess which footprint
 * "Confirm" means. Absent ⇒ the buttons read exactly as they always have.
 */
export interface ChatConfirmChoices {
    /** The PRIMARY answer — resolves `true`. Default "Confirm". */
    readonly confirmLabel?: string;
    /** The SECONDARY answer — resolves `false`. Default "Cancel". */
    readonly cancelLabel?: string;
}

export interface ChatPromptHost {
    /** Append an assistant bubble to the transcript. */
    say(text: string): void;
    /** Render an inline Confirm/Cancel card; resolves true only on Confirm (or on
     *  the primary answer when `choices` renames the buttons). */
    confirm(summary: string, choices?: ChatConfirmChoices): Promise<boolean>;
    /**
     * Is the transcript actually built and able to render? `AIPanel`'s confirm resolves
     * a fabricated `false` when it is not, so the accessor must be able to ask first.
     * Absent ⇒ assumed ready (an older host, or a test double).
     */
    isReady?(): boolean;
}

let host: ChatPromptHost | undefined;

const MAX_QUEUED_LINES = 5;
const queued: string[] = [];

/** How long to wait for the panel to come up before rendering the fallback. */
const SURFACE_DEADLINE_MS = 4_000;
const SURFACE_POLL_MS = 100;

const diagnostics = {
    /** Times the surface had to be opened because no host was registered. */
    surfaceOpensForced: 0,
    /** Times no host ever arrived and the visible fallback had to be rendered. */
    fallbackPrompts: 0,
    /** Times there was no DOM at all — the only legitimate "nobody could be asked". */
    headlessAsks: 0,
};

export function getSurfaceDiagnostics(): Readonly<typeof diagnostics> {
    return { ...diagnostics };
}

function doc(): Document | undefined {
    return typeof document === 'undefined' ? undefined : document;
}

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
    return host !== undefined && (host.isReady === undefined || host.isReady() === true);
}

/**
 * §PROMPT-REACHES-A-HUMAN — make the AI panel visible. The founder's requirement is
 * explicit: *"i would expect the living graph to identify this — OPEN THE RAC - AI CHAT
 * and ask the user"*. A prompt that only works when the panel already happens to be
 * open is not the feature.
 *
 * Safe from any context: it clicks the rail toggle the panel itself uses, and falls
 * back to un-hiding the container directly. Returns false only when there is no
 * container to open.
 */
export function openChatSurface(): boolean {
    const d = doc();
    if (!d) return false;
    const panel = d.getElementById('ai-panel-container');
    if (!panel) return false;
    try {
        const style = (panel as HTMLElement).style;
        if (!style || style.display === 'none' || style.display === '') {
            const toggle = d.querySelector('[icon="material-symbols:robot-2"]') as HTMLElement | null;
            if (toggle && typeof (toggle as { click?: () => void }).click === 'function') {
                (toggle as { click: () => void }).click();
            }
            // Belt and braces: the toggle may be absent, or may not have taken effect.
            if ((panel as HTMLElement).style?.display === 'none') {
                (panel as HTMLElement).style.display = 'flex';
            }
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Wait until there is a host that can actually render, opening the panel to get one.
 * Resolves true when a usable host exists; false when the deadline passed.
 */
export async function ensureChatSurface(deadlineMs: number = SURFACE_DEADLINE_MS): Promise<boolean> {
    if (chatPromptHostAvailable()) return true;
    diagnostics.surfaceOpensForced++;
    openChatSurface();
    const started = Date.now();
    while (Date.now() - started < deadlineMs) {
        if (chatPromptHostAvailable()) return true;
        await new Promise<void>(resolve => setTimeout(resolve, SURFACE_POLL_MS));
        // Re-attempt the open: the container may be mounted after the first try.
        if (!chatPromptHostAvailable()) openChatSurface();
    }
    return chatPromptHostAvailable();
}

/**
 * The LAST RESORT. A visible, self-contained Confirm/Cancel card, rendered directly
 * into the document when the chat panel could not be reached.
 *
 * This is a **failure rendering, not a surface**. It says so on its face, it
 * `console.error`s, and it increments `fallbackPrompts` so its use is measurable. It
 * exists for one reason: the alternative is writing the question to the console and
 * calling that "asking the user", which is the exact defect §PROMPT-REACHES-A-HUMAN
 * was opened for.
 */
function fallbackConfirm(summary: string, choices?: ChatConfirmChoices): Promise<boolean> | undefined {
    const d = doc();
    if (!d?.body) return undefined;
    diagnostics.fallbackPrompts++;
    console.error(
        '[chatPromptHost] §PROMPT-REACHES-A-HUMAN — the AI chat panel could not be reached, ' +
        'so this question is being shown in a fallback card instead. This is a DEFECT, not a ' +
        'design: the question below should have appeared in the chat transcript.',
        { summary },
    );
    return new Promise<boolean>(resolve => {
        let settled = false;
        const finish = (value: boolean): void => {
            if (settled) return;
            settled = true;
            try { card.remove(); } catch { /* already detached */ }
            resolve(value);
        };
        const card = d.createElement('div');
        card.setAttribute('data-pryzm-fallback-prompt', 'true');
        card.style.cssText =
            'position:fixed;right:16px;bottom:16px;z-index:2147483000;max-width:420px;' +
            'padding:14px 16px;border-radius:10px;background:#fff;color:#111;' +
            'border:2px solid #6600FF;box-shadow:0 8px 32px rgba(0,0,0,.28);' +
            'font:13px/1.5 system-ui,sans-serif;white-space:pre-line;';
        const flag = d.createElement('div');
        flag.textContent = 'PRYZM could not open the AI chat panel — asking here instead';
        flag.style.cssText = 'font-weight:600;color:#6600FF;margin-bottom:8px;';
        const body = d.createElement('div');
        // The SAME tail rule as `AIPanel.showZeroTokenConfirm`: a summary that already
        // states its own undo cost is not contradicted by the generic single-undo tail.
        body.textContent = /ctrl\s*\+\s*z/i.test(summary)
            ? summary
            : `${summary}? This can be undone with Ctrl+Z.`;
        const row = d.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;margin-top:12px;justify-content:flex-end;';
        const mk = (label: string, primary: boolean, value: boolean): HTMLElement => {
            const b = d.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.style.cssText =
                'padding:6px 14px;border-radius:6px;cursor:pointer;font:inherit;' +
                (primary ? 'background:#6600FF;color:#fff;border:none;' : 'background:#fff;color:#111;border:1px solid #ccc;');
            b.addEventListener('click', () => finish(value));
            return b;
        };
        row.appendChild(mk(choices?.cancelLabel ?? 'Cancel', false, false));
        row.appendChild(mk(choices?.confirmLabel ?? 'Confirm', true, true));
        card.appendChild(flag);
        card.appendChild(body);
        card.appendChild(row);
        d.body.appendChild(card);
    });
}

/**
 * Say something in the chat. Opens the panel to do it. Returns true when it was
 * delivered to a host now, false when it was queued or shown elsewhere. Never throws.
 */
export function chatSay(text: string): boolean {
    if (typeof text !== 'string' || text.trim() === '') return false;
    if (chatPromptHostAvailable() && host) {
        try {
            host.say(text);
            openChatSurface();
            return true;
        } catch {
            return false;
        }
    }
    if (queued.length < MAX_QUEUED_LINES) queued.push(text);
    // Try to bring the panel up so the queue actually flushes to a visible transcript.
    void ensureChatSurface().then(ok => {
        if (ok && queued.length > 0 && host) {
            const flush = queued.splice(0, queued.length);
            for (const t of flush) {
                try { host.say(t); } catch { /* nothing further to try */ }
            }
            openChatSurface();
        }
    });
    return false;
}

/**
 * Ask a Confirm/Cancel question, and GUARANTEE it is seen.
 *
 * `true` = the user confirmed. `false` = the user cancelled. `undefined` = there was no
 * DOM at all (a node harness) — the ONLY remaining case, and one a caller must never
 * fold into "declined", because it asserts a decision the user never made.
 */
export async function chatConfirm(summary: string, choices?: ChatConfirmChoices): Promise<boolean | undefined> {
    const ready = await ensureChatSurface();
    if (ready && host) {
        try {
            openChatSurface();
            return await host.confirm(summary, choices);
        } catch {
            // fall through to the visible fallback rather than to silence
        }
    }
    const fb = fallbackConfirm(summary, choices);
    if (fb) return fb;
    diagnostics.headlessAsks++;
    console.error(
        '[chatPromptHost] §PROMPT-REACHES-A-HUMAN — no chat surface AND no document: the ' +
        'question could not be put to anyone. This is NOT a decline.',
        { summary },
    );
    return undefined;
}

/** Test seam. */
export function __resetChatPromptHost(): void {
    host = undefined;
    queued.length = 0;
    diagnostics.surfaceOpensForced = 0;
    diagnostics.fallbackPrompts = 0;
    diagnostics.headlessAsks = 0;
}
