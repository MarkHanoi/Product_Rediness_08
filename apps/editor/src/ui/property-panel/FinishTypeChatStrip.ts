/**
 * FinishTypeChatStrip — §OPENING-PANEL-CHAT (L-9630 … L-9639)
 * ===========================================================
 *
 * The chat surface INSIDE the window/door type editor. The founder's ask was
 * *"enable AI chat while in this new creation panel — the user could either do it
 * via UI or chat."* The word that decided this file's shape is **either**: two
 * ways in, ONE draft, one validation, one command, one read-back.
 *
 * ── WHAT IT IS NOT, AND THESE ARE DECISIONS ─────────────────────────────────
 *
 * ⛔ **It does not register as the `chatPromptHost`.** That module holds a single
 * `host` (`chatPromptHost.ts:79`) and the AI dock already owns it; a second
 * registration would silently take the dock's chat away for as long as this modal
 * was open. A modal borrowing the application's only chat surface is a worse
 * defect than the gap it closes.
 *
 * ⛔ **It does not call `tryHandleZeroToken`.** That bridge carries a
 * module-global `conversation` for cross-turn follow-ups
 * (`ZeroTokenChatBridge.ts:1675`); driving it from a second surface would
 * interleave two conversations into one memory. It also resolves against the
 * MODEL — "make the walls white" — which is not what a modal editing an unsaved
 * type can act on.
 *
 * ⛔ **It dispatches no command of its own.** Every ask lands as an edit to the
 * SAME draft object the controls above edit; Create still travels
 * `FinishTypeAuthoringActions.onSave` → `bus.executeCommand('elementType.create')`
 * → the store read-back that is already there. C16 §5.1 CA-21 is satisfied by
 * that read-back and by nothing this file says — ⛔ **there is no "Done" here.**
 * The chat reports what the STORE returned, or it reports that it does not know.
 *
 * ── WHY THAT IS THE ARCHITECTURALLY SOUND SHAPE ─────────────────────────────
 *
 * C100 §6.2's warning is that *a capability reachable only through the LLM planner
 * tests green and does not exist for the founder*. This path never reaches a
 * planner: {@link resolveDraftUtterance} is deterministic, zero-token and offline,
 * and its vocabulary is DERIVED from the same declaration the controls render, so
 * "all parameters accessible via chat" is true by construction rather than by
 * maintenance. C68 §5.a's presumption — a plugin `produceCommand` DTO store is
 * dead until proven otherwise, 13/13 — cannot bite here because no new store,
 * DTO or verb is introduced at all.
 *
 * ── C43 ─────────────────────────────────────────────────────────────────────
 * Enter sends and does NOT save the dialog (the modal's own Enter-saves handler is
 * stopped inside this input); the transcript is an `aria-live` region so a screen
 * reader hears the answer; the example chips are real buttons.
 */

import {
    resolveDraftUtterance,
    exampleAsks,
    authorableSummary,
    type DraftEdit,
    type DraftField,
} from './FinishTypeDraftIntent';

const PURPLE = '#6600FF';
const INK = '#1a1a1a';
const MUTED = '#5b6472';
const LINE = '#d8dce3';

/**
 * The narrow port the modal implements. ⚠ Deliberately four methods: the strip
 * must not be able to reach into the draft, the stores or the bus.
 */
export interface DraftChatPort {
    /** The derived vocabulary for this family. */
    readonly fields: readonly DraftField[];
    /** Apply the edits to the draft and refresh every control they touch. */
    applyEdits: (edits: readonly DraftEdit[]) => void;
    /**
     * Run the dialog's OWN validate-and-save. Returns the validation error when it
     * refused, or `null` when it committed — so the chat can say the same sentence
     * the form would have shown rather than inventing one.
     */
    commit: () => string | null;
    /** One line naming the draft's current authored state, for "what is it now?". */
    describe: () => string;
}

export interface FinishTypeChatHandle {
    readonly el: HTMLElement;
    dispose: () => void;
}

export function mountFinishTypeChat(host: HTMLElement, port: DraftChatPort): FinishTypeChatHandle {
    const root = document.createElement('div');
    root.className = 'fte-chat';
    root.style.cssText =
        'margin-top:20px;border:1px solid ' + LINE + ';border-radius:10px;overflow:hidden;' +
        'background:linear-gradient(180deg,#fbf9ff 0%,#ffffff 60%);';

    // ── header ───────────────────────────────────────────────────────────────
    const head = document.createElement('div');
    head.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #ece9f6;';
    const pill = document.createElement('span');
    pill.style.cssText =
        'font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;' +
        'color:#fff;background:' + PURPLE + ';border-radius:999px;padding:2px 8px;flex:0 0 auto;';
    pill.textContent = 'Ask';
    const headText = document.createElement('span');
    headText.style.cssText = 'font-size:11.5px;color:' + MUTED + ';flex:1 1 auto;min-width:0;';
    headText.textContent = 'Describe what you want and the controls above change with it.';
    head.append(pill, headText);

    // ── transcript ───────────────────────────────────────────────────────────
    const log = document.createElement('div');
    log.style.cssText =
        'max-height:132px;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:7px;';
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.setAttribute('aria-label', 'Type editor conversation');

    const bubble = (who: 'you' | 'pryzm', text: string, tone: 'plain' | 'warn' = 'plain'): void => {
        const b = document.createElement('div');
        const mine = who === 'you';
        b.style.cssText =
            'font-size:11.5px;line-height:1.45;max-width:86%;padding:6px 10px;border-radius:9px;' +
            'white-space:pre-wrap;word-break:break-word;' +
            (mine
                ? 'align-self:flex-end;background:' + PURPLE + ';color:#fff;'
                : 'align-self:flex-start;background:' +
                  (tone === 'warn' ? '#fff6e8' : '#f4f2fb') + ';color:' + INK + ';' +
                  (tone === 'warn' ? 'border:1px solid #f0d9b5;' : ''));
        b.textContent = text;
        log.appendChild(b);
        log.scrollTop = log.scrollHeight;
    };

    // ── input ────────────────────────────────────────────────────────────────
    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:8px;padding:0 12px 10px;align-items:center;';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'fte-chat-input';
    input.placeholder = 'e.g. 2 m wide, 3 columns, frame in oak';
    input.setAttribute('aria-label', 'Describe the type you want');
    input.style.cssText =
        'flex:1 1 auto;min-width:0;padding:7px 10px;border:1px solid ' + LINE + ';border-radius:6px;' +
        'font:inherit;font-size:12px;background:#fff;color:' + INK + ';';
    const send = document.createElement('button');
    send.type = 'button';
    send.textContent = 'Send';
    send.style.cssText =
        'flex:0 0 auto;padding:7px 14px;border:1px solid ' + PURPLE + ';border-radius:6px;' +
        'background:' + PURPLE + ';color:#fff;font:inherit;font-size:12px;font-weight:650;cursor:pointer;';
    inputRow.append(input, send);

    // ── example chips ────────────────────────────────────────────────────────
    //
    // Built from the DECLARATION, so a chip can never offer a field this family
    // does not have (C06: never suggest what the surface cannot honour).
    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 11px;';
    for (const ex of exampleAsks(port.fields).slice(0, 5)) {
        const c = document.createElement('button');
        c.type = 'button';
        c.textContent = ex;
        c.style.cssText =
            'font:inherit;font-size:10.5px;padding:2px 9px;border:1px solid ' + LINE + ';' +
            'border-radius:999px;background:#fff;color:' + MUTED + ';cursor:pointer;';
        c.addEventListener('click', () => { input.value = ex; input.focus(); handle(); });
        chips.appendChild(c);
    }

    root.append(head, log, inputRow, chips);
    host.appendChild(root);

    bubble('pryzm',
        'Tell me the window you want — "1.8 m wide", "frame in oak", "3 columns", "glazing 20% opaque" — ' +
        'or say "create it" when the preview looks right. Everything you say shows up in the controls above, ' +
        'so you can always take it back by hand.');

    // ── the turn ─────────────────────────────────────────────────────────────
    function handle(): void {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        bubble('you', text);

        const r = resolveDraftUtterance(text, port.fields);

        if (r.kind === 'commit') {
            const err = port.commit();
            // ⛔ NOT "Done". The dialog's own validator is the authority on whether it
            // saved, and the store read-back downstream is the authority on whether the
            // type exists. This surface repeats their answer and adds nothing.
            if (err) bubble('pryzm', err + ' Fix that and say "create it" again.', 'warn');
            return;
        }

        if (r.kind === 'describe') {
            bubble('pryzm',
                'Right now: ' + port.describe() + '\n\nI can set: ' +
                authorableSummary(port.fields).join(' · '));
            return;
        }

        if (r.kind === 'refusal') {
            const opts = r.options && r.options.length > 0 ? '\n· ' + r.options.join('\n· ') : '';
            bubble('pryzm', r.reason + opts, 'warn');
            return;
        }

        if (r.kind === 'miss') {
            bubble('pryzm',
                r.reason + ' Try one of these, or use the controls above:\n· ' + r.options.join('\n· '),
                'warn');
            return;
        }

        port.applyEdits(r.edits);
        const lines = r.edits.map((e) => {
            // C100 §5 — an INFERRED material is reported as inference, never as a
            // resolution. The user must be able to see that a guess was made.
            const inf = e.inferred ? '  (closest library match — change it above if that is not the one)' : '';
            return '· ' + e.said + inf;
        });
        bubble('pryzm', lines.join('\n'));
    }

    send.addEventListener('click', handle);
    const onKey = (e: KeyboardEvent): void => {
        if (e.key !== 'Enter') return;
        // ⚠ The modal's own keydown handler treats Enter as SAVE. Inside this input
        // Enter must mean SEND, so the event is stopped here — and only here, so the
        // dialog's Escape/Tab handling is untouched (C43).
        e.preventDefault();
        e.stopPropagation();
        handle();
    };
    input.addEventListener('keydown', onKey);

    return {
        el: root,
        dispose(): void {
            input.removeEventListener('keydown', onKey);
            root.remove();
        },
    };
}
