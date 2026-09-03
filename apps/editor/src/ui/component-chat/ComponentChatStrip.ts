/**
 * ComponentChatStrip — the chat surface for Component authoring (UI/UX wave, lane U6).
 * §U6-AI-AUTHORING · UIUX-PLAN §U6 · mirrors `FinishTypeChatStrip` (§76 gate D:
 * "two ways in, ONE draft, one validation, one command, one read-back").
 *
 * ── WHAT IT IS, AND WHAT IT IS NOT (the FinishType decisions, inherited) ────────
 * ⛔ It does NOT register as the `chatPromptHost` — the AI dock owns that single
 *    host, and a second registration would steal the dock's chat while this surface
 *    is open. ⛔ It does NOT call `tryHandleZeroToken` — that bridge carries a
 *    module-global cross-turn conversation and resolves against the MODEL, not the
 *    focused subject (a selected instance, an unsaved definition draft). ⛔ It
 *    dispatches NO command of its own: every ask lands through the surface's EXISTING
 *    command path (`component.setInstanceParameter` / `component.swapType` via the
 *    composed bus, or the `introduce-expression` family-migrations op on the draft),
 *    and success is what the store read-back / the op says it is — there is no "Done"
 *    here that the authoritative record did not confirm (C16 CA-21).
 *
 * The understanding layer is `componentChatIntents.ts` — deterministic, zero-token,
 * offline; its vocabulary is DERIVED from the same declaration the controls render, so
 * "every parameter is reachable by chat" is true by construction (C100 §6.2).
 *
 * C43 — Enter sends; the transcript is an `aria-live` region; the example chips are
 * real buttons. D5 — every user-facing string says **Component**.
 */

const PURPLE = '#6600FF';
const INK = '#1a1a1a';
const MUTED = '#5b6472';
const LINE = '#d8dce3';
const WARN = '#8a5a00';

/** One line the chat says back, with a tone. */
export interface ComponentChatLine {
    readonly text: string;
    readonly tone: 'plain' | 'warn';
}

/** The narrow controller a strip drives — no reach into stores, draft or bus except
 *  through the methods the hosting surface provides. */
export interface ComponentChatController {
    /** Header sentence describing the surface. */
    readonly headline: string;
    readonly placeholder: string;
    /** Concrete example asks, built from the declaration (never a static list). */
    examples(): readonly string[];
    /** Handle ONE utterance; return the transcript line(s) to show. */
    handle(text: string): Promise<readonly ComponentChatLine[]>;
}

export interface ComponentChatHandle {
    readonly el: HTMLElement;
    /** Test/programmatic seam: drive one turn as if the user had typed it. */
    submit(text: string): Promise<void>;
    dispose(): void;
}

export function mountComponentChat(host: HTMLElement, controller: ComponentChatController): ComponentChatHandle {
    const root = document.createElement('div');
    root.setAttribute('data-ccs-root', '');
    root.style.cssText =
        `margin-top:14px;border:1px solid ${LINE};border-radius:10px;overflow:hidden;` +
        'background:linear-gradient(180deg,#fbf9ff 0%,#ffffff 60%);';

    // header
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #ece9f6;';
    const pill = document.createElement('span');
    pill.style.cssText =
        `font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#fff;` +
        `background:${PURPLE};border-radius:999px;padding:2px 8px;flex:0 0 auto;`;
    pill.textContent = 'Ask';
    const headText = document.createElement('span');
    headText.style.cssText = `font-size:11.5px;color:${MUTED};flex:1 1 auto;min-width:0;`;
    headText.textContent = controller.headline;
    head.append(pill, headText);

    // transcript
    const log = document.createElement('div');
    log.setAttribute('data-ccs-log', '');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.setAttribute('aria-label', 'Component authoring conversation');
    log.style.cssText = 'max-height:150px;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:7px;';

    const bubble = (who: 'you' | 'pryzm', text: string, tone: 'plain' | 'warn' = 'plain'): void => {
        const b = document.createElement('div');
        const mine = who === 'you';
        b.setAttribute('data-ccs-bubble', who);
        if (who === 'pryzm') b.setAttribute('data-ccs-tone', tone);
        b.style.cssText =
            'font-size:11.5px;line-height:1.45;max-width:88%;padding:6px 10px;border-radius:9px;' +
            'white-space:pre-wrap;word-break:break-word;' +
            (mine
                ? `align-self:flex-end;background:${PURPLE};color:#fff;`
                : `align-self:flex-start;background:#f3f1fb;color:${tone === 'warn' ? WARN : INK};`);
        b.textContent = text;
        log.appendChild(b);
        log.scrollTop = log.scrollHeight;
    };

    // chips
    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px;';
    for (const ex of controller.examples()) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.setAttribute('data-ccs-chip', '');
        chip.textContent = ex;
        chip.style.cssText =
            `font-size:11px;color:${PURPLE};background:#fff;border:1px solid ${LINE};border-radius:999px;` +
            'padding:2px 9px;cursor:pointer;';
        chip.addEventListener('click', () => { void submit(ex); });
        chips.appendChild(chip);
    }

    // input row
    const inputRow = document.createElement('div');
    inputRow.style.cssText = `display:flex;gap:6px;padding:8px 12px;border-top:1px solid ${LINE};`;
    const input = document.createElement('input');
    input.setAttribute('data-ccs-input', '');
    input.placeholder = controller.placeholder;
    input.style.cssText = `flex:1;min-width:0;padding:5px 8px;font:12px system-ui,sans-serif;border:1px solid ${LINE};border-radius:7px;`;
    const send = document.createElement('button');
    send.type = 'button';
    send.setAttribute('data-ccs-send', '');
    send.textContent = 'Send';
    send.style.cssText = `background:${PURPLE};color:#fff;border:none;border-radius:7px;padding:5px 14px;font-weight:600;cursor:pointer;`;
    inputRow.append(input, send);

    let busy = false;
    async function submit(text: string): Promise<void> {
        const q = text.trim();
        if (q.length === 0 || busy) return;
        busy = true;
        input.value = '';
        bubble('you', q);
        try {
            const lines = await controller.handle(q);
            if (lines.length === 0) bubble('pryzm', 'Nothing changed.', 'warn');
            for (const l of lines) bubble('pryzm', l.text, l.tone);
        } catch (e) {
            // ⚠ An unexpected throw is SAID, never swallowed — a silent no-op is the
            // §OPENING-PROFILE-PANEL-REACHABILITY defect this strip refuses to repeat.
            bubble('pryzm', `That did not complete: ${e instanceof Error ? e.message : String(e)}`, 'warn');
        } finally {
            busy = false;
        }
    }

    // ⛔ Enter sends and does NOT bubble up to a hosting modal's Enter-saves handler.
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); void submit(input.value); }
    });
    send.addEventListener('click', () => { void submit(input.value); });

    root.append(head, log, chips, inputRow);
    host.appendChild(root);

    return {
        el: root,
        submit,
        dispose: () => { root.remove(); },
    };
}
