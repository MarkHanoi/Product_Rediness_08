// §PL-CHAT (lane PL-CHAT-AND-REMAINDER, 2026-09-06) — STR §25.4's chat surface, ON the Parcel Law
// panel, driving the SAME controls the manual fields drive.
//
// STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.4 (the ask) · §25.2 / §25.3 / §25.7 (the three controls
// it drives) · ADR-0313 (the zero-token ladder it falls through to) · ADR-0314 · C19 §5.6 clause 1
// (this panel is a HOST; the producers are the authorities) · C57 §1.5 / §1.9 · C08 §3.1 · P4 · P6 · P8.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE ONE IDEA: THE LANGUAGE PATH *IS* THE FIELD PATH
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Founder: *"WE NEED A CHAT BOT ON THE PARCEL LAW PANEL – SO USER CAN CHAT VIA RAC OR DEFINE VIA
// DATA MANUALLY INPUT."* The binding word is OR — the two paths are alternatives, so **a value
// typed into a field and the same value asked for in natural language must produce the same
// envelope**.
//
// There are two ways to make that true and only one of them stays true:
//
//   ✗ parse the sentence, then call `buildEnvelopeAuthoringPlan` + `bus.executeCommand` from here.
//     Two dispatchers for one gesture. They agree on the day they are written and drift on every
//     day after it — and the drift is invisible, because each half passes its own test.
//   ✓ parse the sentence into THE VALUE A FIELD TAKES, type it into that field, and press that
//     button. One plan builder, one dispatcher, one refusal, one undo entry. Agreement is then a
//     property of the code shape, not a promise in a comment.
//
// This file is the second. `parcelLawChatIntent.ts` (pure) turns the sentence into the string; this
// file finds the control **by the testid constant its owning module exports**, sets its value,
// fires the events that module listens for, clicks its button, and then **reads that control's own
// status line back as the chat's reply**.
//
// ⭐⭐ THE REPLY IS THE PANEL'S OWN SENTENCE. That is the honesty property this design buys: the
// chat cannot tell you an envelope was created when the section says it was refused, and it cannot
// invent a refusal the law never made — because it has no sentence of its own to say. Every
// "you asked for more than the ordinance allows, here are both numbers" comes from
// `solveTargetFootprintArea` / `buildEnvelopeAuthoringPlan` / `parseIndicativeRateInput`, which
// already refuse with both numbers. C19 §5.6 clause 1, applied to prose.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THIS IS NOT A SECOND CHAT CLIENT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Anything this surface does not recognise is handed to `tryHandleZeroToken` — the SHIPPED ladder
// the AI panel uses (tier 0/1 → NL → capability-gap refusal), with the same `ZeroTokenUiHooks`
// contract, loaded LAZILY so the Analysis chunk does not eagerly pull the bridge. There is no
// second resolver, no second dispatcher and no second LLM client here. What this surface adds is
// the ONE thing the general ladder cannot have: the parcel's own footprint. The shipped registry
// answers `spaceEnvelope.batch.create` with *"Placing a space envelope needs the footprint you want
// it over, which I cannot infer from a sentence"* (`ChatCapabilityRegistry.ts:3761`) — which is
// CORRECT in general and wrong only HERE, on the one panel where the buildable ring is on screen.
//
// ⛔ P6 — this file writes NO store and dispatches NO command. Its only effect is a `.click()` on a
// control that is already the mutation path. ⛔ P4 — no `(window as any)`. ⛔ C08 §3.1 — every node
// is `createElement` + `textContent`; there is no HTML sink in this file at all.

import { trace } from '@opentelemetry/api';
import {
    PARCEL_LAW_CHAT_EXAMPLES,
    HEARD_NOT_DRIVEN_TEXT,
    resolveParcelLawUtterance,
    type ParcelLawChatIntent,
    type ParcelLawChatParse,
} from '../site/parcelLawChatIntent';
// ⭐ THE TESTIDS ARE IMPORTED, NEVER RETYPED. A string literal here would be a silent coupling: the
// owning module renames its field, this file keeps querying the old name, and the chat degrades to
// "I could not find the control" with no compile error and no failing test in the module that
// moved. An import breaks the build instead, which is the whole point.
import {
    AUTHORING_CREATE_BTN_TESTID,
    AUTHORING_LAWCHECK_TESTID,
    AUTHORING_STATUS_TESTID,
    AUTHORING_STOREYS_INPUT_TESTID,
} from './parcelLawEnvelopeAuthoring';
import {
    LIVE_QUANTITIES_APPLY_BTN_TESTID,
    LIVE_QUANTITIES_CURRENCY_TESTID,
    LIVE_QUANTITIES_RATE_INPUT_TESTID,
    LIVE_QUANTITIES_STATUS_TESTID,
    LIVE_QUANTITIES_TESTID,
    LIVE_QUANTITIES_COST_PART_TESTID,
    LIVE_QUANTITIES_QUANTITIES_PART_TESTID,
} from '../site/liveQuantitiesSection';
import {
    MASSING_OPTIONS_GENERATE_BTN_TESTID,
    MASSING_PICK_ATTR,
    TARGET_AREA_INPUT_TESTID,
    TARGET_AREA_SOLVE_BTN_TESTID,
    TARGET_AREA_STATUS_TESTID,
} from '../site/envelopeCardSections';
import { PARCEL_LAW_FACTS_TESTID } from './parcelLawFacts';

const _tracer = trace.getTracer('pryzm.analysis.parcelLawChat');

/** `data-testid` on the section root. */
export const PARCEL_LAW_CHAT_TESTID = 'analysis-parcel-law-chat';
/** The scrolling transcript. */
export const PARCEL_LAW_CHAT_TRANSCRIPT_TESTID = 'parcel-law-chat-transcript';
/** The text entry. */
export const PARCEL_LAW_CHAT_INPUT_TESTID = 'parcel-law-chat-input';
/** The send button. */
export const PARCEL_LAW_CHAT_SEND_TESTID = 'parcel-law-chat-send';
/** Every bubble carries this; `data-role` is `'user'` | `'pryzm'`. */
export const PARCEL_LAW_CHAT_BUBBLE_TESTID = 'parcel-law-chat-bubble';
/** The inline Confirm/Cancel card the shipped ladder raises for a destructive ask. */
export const PARCEL_LAW_CHAT_CONFIRM_TESTID = 'parcel-law-chat-confirm';
/** How many turns have completed. Read by the spec. */
export const PARCEL_LAW_CHAT_TURNS_ATTR = 'data-chat-turns';
/**
 * Which route answered the LAST turn — `'parcel-law'` (a control on this panel was driven),
 * `'clarify'` (recognised, underspecified, asked back), `'ladder'` (the shipped zero-token ladder
 * answered) or `'unanswered'` (nobody did, and the reply says so).
 */
export const PARCEL_LAW_CHAT_ROUTE_ATTR = 'data-chat-route';

/** The lede. Says what this box drives and what it does not, before the user types into it. */
export const PARCEL_LAW_CHAT_LEDE =
    'Ask in words, or type in the fields above — they are the same controls. Anything I do not '
    + 'recognise here goes to the PRYZM assistant, and anything the law refuses is refused with '
    + 'both numbers by the section that owns it, not by me.';

/** The greeting. Deliberately states the ceiling as well as the ability. */
export const PARCEL_LAW_CHAT_GREETING =
    'I drive the fields on this panel. Tell me a ground-floor area, a shape, a number of storeys or '
    + 'a cost per m² and I will fill the field in and press the button, so you can see exactly what '
    + 'I did. I do not decide anything the ordinance decides.';

/** The route of the last turn. Narrow union so the attribute cannot drift from the code. */
export type ParcelLawChatRoute = 'parcel-law' | 'clarify' | 'ladder' | 'unanswered';

/** The two hooks the shipped ladder needs. Structurally identical to `ZeroTokenUiHooks` —
 *  declared here rather than imported so this module does not eagerly load the bridge. */
export interface ParcelLawChatHooks {
    say(text: string): void;
    confirm(summary: string): Promise<boolean>;
}

export interface ParcelLawChatDeps {
    /**
     * Where to look for the controls. Production: the Parcel Law tab body.
     *
     * ⚠ RESOLVED PER CALL, never captured: the singleton envelope card is claimed into and out of
     * this body (see `parcelLawTab.ts`'s header), so the set of controls present changes between
     * one turn and the next. A captured node list would drive a control that is no longer on the
     * panel the user is looking at.
     */
    readonly scope: () => ParentNode | null;
    /** Production: `resolveParcelLawUtterance` — the pure resolver. */
    readonly resolve: (text: string) => ParcelLawChatParse;
    /**
     * Production: `tryHandleZeroToken` from `../ai/ZeroTokenChatBridge`, imported LAZILY.
     * Returns true iff the shipped ladder answered.
     */
    readonly fallThrough: (text: string, hooks: ParcelLawChatHooks) => Promise<boolean>;
}

export function defaultParcelLawChatDeps(scope: () => ParentNode | null): ParcelLawChatDeps {
    return {
        scope,
        resolve: resolveParcelLawUtterance,
        fallThrough: async (text, hooks) => {
            // Lazy: the bridge is a large module with the whole capability registry behind it, and
            // this tab must not pull it into the Analysis chunk just by existing.
            const mod = await import('../ai/ZeroTokenChatBridge');
            return mod.tryHandleZeroToken(text, hooks);
        },
    };
}

export interface ParcelLawChatHandle {
    readonly element: HTMLElement;
    /** Run one turn as if the user had typed it. Returns the route that answered. Used by the spec. */
    send(text: string): Promise<ParcelLawChatRoute>;
    dispose(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Driving a control that belongs to another module
// ─────────────────────────────────────────────────────────────────────────────

/** What driving one control produced. `text` is ALWAYS the sentence shown to the user. */
interface DriveOutcome {
    /** True iff the control was found and pressed. False is an admission about PRYZM's wiring. */
    readonly driven: boolean;
    readonly text: string;
}

const q = <T extends Element>(scope: ParentNode | null, testid: string): T | null =>
    scope ? scope.querySelector<T>(`[data-testid="${testid}"]`) : null;

/** Collapse a section's rendered text into one readable line, capped. Never invents a word. */
function excerpt(node: Element | null, cap = 600): string | null {
    const raw = (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (raw.length === 0) return null;
    return raw.length <= cap ? raw : `${raw.slice(0, cap)}…`;
}

/**
 * ⭐ §PL-IA-Q (STR §26.3, L-12998) — READ EVERY PIECE OF A SECTION THAT IS NOW PLACED APART.
 *
 * The Parcel Law tab groups its sections by the six persona questions, and two producers now put
 * their halves in two different groups: the live quantities answer *"how much have I used?"* while
 * the rate and estimate answer *"what does it cost?"*, and the parcel facts split the same way
 * between *"what is this plot?"* and *"what may I build?"*.
 *
 * ⛔ A `querySelector` THAT STOPS AT THE FIRST MATCH WOULD SILENTLY HALVE THE ANSWER — and it
 * would do it in the one place this file exists to prevent: the chat's reply would sound complete
 * while quoting only the half it happened to reach first. Reading every match keeps the chat's
 * central property intact: it has no sentence of its own, so what it quotes must be everything the
 * sections actually say.
 */
function excerptAll(scope: ParentNode | null, testids: readonly string[], cap = 600): string | null {
    if (!scope) return null;
    const sel = testids.map((t) => `[data-testid="${t}"]`).join(',');
    let nodes: Element[];
    try {
        nodes = [...scope.querySelectorAll(sel)];
    } catch {
        return null;
    }
    const raw = nodes.map((n) => n.textContent ?? '').join(' · ').replace(/\s+/g, ' ').trim();
    if (raw.length === 0) return null;
    return raw.length <= cap ? raw : `${raw.slice(0, cap)}…`;
}

/**
 * Set a field's value the way a human does, then press its button.
 *
 * ⚠ BOTH `input` AND `change` are fired. The storeys field listens for `input`; other fields in
 * this repo listen for `change`; a control that listened for neither would be reported as not
 * driven rather than silently mis-driven. Assigning `.value` alone fires nothing at all, which is
 * how a "typed" value can look right on screen and never reach the control's state.
 */
function typeAndPress(
    scope: ParentNode | null,
    inputTestid: string,
    buttonTestid: string,
    value: string,
    what: string,
): { readonly ok: boolean; readonly text: string } {
    const input = q<HTMLInputElement>(scope, inputTestid);
    const button = q<HTMLButtonElement>(scope, buttonTestid);
    if (input === null || button === null) {
        return {
            ok: false,
            text:
                `I could not find the ${what} on this panel, so I did nothing — nothing was typed and `
                + 'no button was pressed. This is a gap in what is mounted right now (the buildable-'
                + 'envelope card can be held by the PARCEL rail panel instead of this tab), not a '
                + 'refusal about your parcel.',
        };
    }
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    button.click();
    return { ok: true, text: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// The control
// ─────────────────────────────────────────────────────────────────────────────

const H = (tag: string, css: string, text?: string): HTMLElement => {
    const el = document.createElement(tag);
    el.style.cssText = css;
    if (text !== undefined) el.textContent = text;
    return el;
};

/**
 * Mount the chat surface into `host`.
 *
 * ⛔ NEVER THROWS INTO THE SURFACE. A tab that cannot build is a tab the founder cannot open, and
 * reachability is the whole point of the lane that created this tab (L-12915).
 */
export function mountParcelLawChat(
    host: HTMLElement,
    deps: ParcelLawChatDeps = defaultParcelLawChatDeps(() => host.ownerDocument?.body ?? null),
): ParcelLawChatHandle {
    const span = _tracer.startSpan('pryzm.analysis.mountParcelLawChat');
    const root = document.createElement('div');
    root.className = 'anl-parcel-law-chat';
    root.setAttribute('data-testid', PARCEL_LAW_CHAT_TESTID);
    root.style.cssText = 'margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;min-width:0;max-width:100%;';

    let disposed = false;
    let turns = 0;
    let busy = false;

    const heading = H('div', 'font-weight:700;font-size:10.5px;color:#6600FF;', 'Ask PRYZM');
    const lede = H('div', 'margin-top:3px;color:#8a83a0;font-size:9.5px;line-height:1.4;', PARCEL_LAW_CHAT_LEDE);

    const transcript = H('div',
        'margin-top:6px;max-height:190px;overflow-y:auto;display:flex;flex-direction:column;gap:5px;');
    transcript.setAttribute('data-testid', PARCEL_LAW_CHAT_TRANSCRIPT_TESTID);

    const bubble = (role: 'user' | 'pryzm', text: string): HTMLElement => {
        const el = H('div',
            role === 'user'
                ? 'align-self:flex-end;max-width:92%;background:#6600FF;color:#fff;border-radius:8px 8px 2px 8px;'
                  + 'padding:5px 7px;font:500 9.5px/1.45 system-ui;white-space:pre-wrap;word-break:break-word;'
                : 'align-self:flex-start;max-width:96%;background:#f6f4fd;color:#2c2440;border-radius:8px 8px 8px 2px;'
                  + 'padding:5px 7px;font:400 9.5px/1.45 system-ui;white-space:pre-wrap;word-break:break-word;',
            text);
        el.setAttribute('data-testid', PARCEL_LAW_CHAT_BUBBLE_TESTID);
        el.setAttribute('data-role', role);
        return el;
    };

    const say = (text: string): void => {
        if (disposed) return;
        transcript.appendChild(bubble('pryzm', text));
        transcript.scrollTop = transcript.scrollHeight;
    };
    const saidByUser = (text: string): void => {
        transcript.appendChild(bubble('user', text));
        transcript.scrollTop = transcript.scrollHeight;
    };

    /**
     * The Confirm/Cancel card the SHIPPED ladder raises before a destructive ask.
     *
     * ⛔ IT IS REAL, AND IT MUST BE. Returning `true` unconditionally to satisfy the interface
     * would silently approve every gated command the ladder deliberately stops on — turning the
     * one safety gate in that path into a no-op on this panel only. Resolving `false` on dispose
     * is the honest teardown: an unanswered question is a decline, never an approval.
     */
    /** Confirm cards still awaiting an answer — resolved FALSE on dispose. */
    const pendingConfirms: Array<() => void> = [];

    const confirm = (summary: string): Promise<boolean> => new Promise<boolean>((resolve) => {
        if (disposed) { resolve(false); return; }
        const card = H('div',
            'align-self:flex-start;max-width:96%;background:#fff;border:1px solid #d8d3e6;border-radius:8px;'
            + 'padding:6px 7px;font:400 9.5px/1.45 system-ui;color:#2c2440;');
        card.setAttribute('data-testid', PARCEL_LAW_CHAT_CONFIRM_TESTID);
        card.appendChild(H('div', 'white-space:pre-wrap;', summary));
        const row = H('div', 'display:flex;gap:6px;margin-top:5px;');
        let settled = false;
        const finish = (v: boolean): void => {
            if (settled) return;
            settled = true;
            row.replaceChildren(H('div', 'font-size:9px;color:#8a83a0;', v ? 'Confirmed.' : 'Cancelled.'));
            resolve(v);
        };
        const mk = (label: string, primary: boolean, v: boolean): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.style.cssText =
                'appearance:none;cursor:pointer;padding:4px 9px;border-radius:6px;font:600 9.5px system-ui;'
                + (primary
                    ? 'border:1px solid #6600FF;background:#6600FF;color:#fff;'
                    : 'border:1px solid #d8d3e6;background:#fff;color:#2c2440;');
            b.onclick = (): void => finish(v);
            return b;
        };
        row.append(mk('Confirm', true, true), mk('Cancel', false, false));
        card.appendChild(row);
        transcript.appendChild(card);
        transcript.scrollTop = transcript.scrollHeight;
        pendingConfirms.push(() => finish(false));
    });

    const hooks: ParcelLawChatHooks = { say, confirm };

    // ── the entry row ─────────────────────────────────────────────────────────────────────────
    const inputRow = H('div', 'display:flex;gap:6px;margin-top:6px;align-items:flex-end;');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = PARCEL_LAW_CHAT_EXAMPLES[0] ?? 'Ask about this parcel';
    input.setAttribute('data-testid', PARCEL_LAW_CHAT_INPUT_TESTID);
    input.style.cssText =
        'flex:1;min-width:0;box-sizing:border-box;padding:5px 6px;border-radius:6px;border:1px solid #d8d3e6;'
        + 'font:500 10px system-ui;';
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.textContent = 'Ask';
    sendBtn.setAttribute('data-testid', PARCEL_LAW_CHAT_SEND_TESTID);
    sendBtn.style.cssText =
        'flex:none;appearance:none;border:1px solid #6600FF;cursor:pointer;padding:6px 10px;border-radius:8px;'
        + 'font:600 11px system-ui;background:#6600FF;color:#ffffff;';
    inputRow.append(input, sendBtn);

    root.append(heading, lede, transcript, inputRow);

    // ── the intent runners — each drives ONE existing control ──────────────────────────────────

    /** Wait a microtask so a control that repaints on `queueMicrotask` has done so before we read
     *  its status back. Reading too early would report an empty line as "the panel said nothing". */
    const settle = (): Promise<void> => Promise.resolve();

    const runIntent = async (intent: ParcelLawChatIntent): Promise<DriveOutcome> => {
        const scope = deps.scope();
        switch (intent.kind) {
            case 'set-ground-area': {
                const pressed = typeAndPress(
                    scope, TARGET_AREA_INPUT_TESTID, TARGET_AREA_SOLVE_BTN_TESTID, intent.areaText,
                    'ground-floor area field (on the buildable-envelope card)');
                if (!pressed.ok) return { driven: false, text: pressed.text };
                await settle();
                const status = excerpt(q(scope, TARGET_AREA_STATUS_TESTID));
                return {
                    driven: true,
                    text: status !== null
                        ? `I typed ${intent.areaText} m² into the ground-floor area field and pressed Solve. `
                          + `The card says: ${status}`
                        : `I typed ${intent.areaText} m² into the ground-floor area field and pressed Solve, but `
                          + 'the card printed no statement — read the section itself rather than trusting me.',
                };
            }
            case 'pick-shape': {
                const id = `massing-shape-${intent.shape}`;
                const find = (): HTMLButtonElement | null => (scope
                    ? scope.querySelector<HTMLButtonElement>(`[${MASSING_PICK_ATTR}="${id}"]`)
                    : null);
                let btn = find();
                if (btn === null) {
                    // The options are enumerated ON DEMAND, so a shape asked for before anyone
                    // pressed Generate has no button yet. ⛔ Press the card's OWN Generate — the
                    // one a human would press, in the order a human presses it. Enumerating the
                    // options here instead would be a second enumerator beside `enumerateMassingOptions`.
                    const gen = q<HTMLButtonElement>(scope, MASSING_OPTIONS_GENERATE_BTN_TESTID);
                    if (gen !== null) {
                        gen.click();
                        await settle();
                        btn = find();
                    }
                }
                if (btn === null) {
                    return {
                        driven: false,
                        text:
                            `I could not find the "${intent.shape}" massing option on this panel, so I picked `
                            + 'nothing. The shape families are solved AGAINST a target ground-floor area — give me '
                            + 'one first ("180 m² on the ground floor") and ask again. If the card is not on this '
                            + 'tab at all, it is being held by the PARCEL rail panel.',
                    };
                }
                btn.click();
                await settle();
                return {
                    driven: true,
                    text:
                        `I picked the ${intent.shape} massing option — the same button you would have clicked. Its `
                        + 'plate is now the ground-floor proposal; the option\'s own score rows (south façade, sun, '
                        + 'overlooking, outlook) are on the card and I did not change any of them.',
                };
            }
            case 'create-envelope': {
                const pressed = typeAndPress(
                    scope, AUTHORING_STOREYS_INPUT_TESTID, AUTHORING_CREATE_BTN_TESTID, intent.storeysText,
                    'storeys field in "Create the envelope"');
                if (!pressed.ok) return { driven: false, text: pressed.text };
                await settle();
                const status = excerpt(q(scope, AUTHORING_STATUS_TESTID));
                return {
                    driven: true,
                    text: status !== null
                        ? `I typed ${intent.storeysText} into "Number of floor levels" and pressed Create envelope. `
                          + `The section says: ${status}`
                        : `I typed ${intent.storeysText} into "Number of floor levels" and pressed Create envelope, `
                          + 'but the section printed no status — read it rather than trusting me.',
                };
            }
            case 'set-rate': {
                if (intent.currency !== null) {
                    const sel = q<HTMLSelectElement>(scope, LIVE_QUANTITIES_CURRENCY_TESTID);
                    // ⛔ Only if the currency is actually offered. Forcing an unlisted code into the
                    // select would leave the field showing a value the section cannot price in.
                    if (sel !== null && Array.from(sel.options).some((o) => o.value === intent.currency)) {
                        sel.value = intent.currency;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
                const pressed = typeAndPress(
                    scope, LIVE_QUANTITIES_RATE_INPUT_TESTID, LIVE_QUANTITIES_APPLY_BTN_TESTID,
                    intent.rateText, 'cost-per-m² field in the live quantities section');
                if (!pressed.ok) return { driven: false, text: pressed.text };
                await settle();
                const status = excerpt(q(scope, LIVE_QUANTITIES_STATUS_TESTID));
                return {
                    driven: true,
                    text: status !== null
                        ? `I set the cost per m² to ${intent.rateText} and pressed Apply. The section says: ${status}`
                        : `I set the cost per m² to ${intent.rateText} and pressed Apply, but the section printed no `
                          + 'status — read it rather than trusting me.',
                };
            }
            case 'clear-rate': {
                const pressed = typeAndPress(
                    scope, LIVE_QUANTITIES_RATE_INPUT_TESTID, LIVE_QUANTITIES_APPLY_BTN_TESTID, '',
                    'cost-per-m² field in the live quantities section');
                if (!pressed.ok) return { driven: false, text: pressed.text };
                await settle();
                const status = excerpt(q(scope, LIVE_QUANTITIES_STATUS_TESTID));
                return {
                    driven: true,
                    text: status !== null
                        ? `I cleared the cost per m². The section says: ${status}`
                        : 'I cleared the cost per m². The section printed no status — read it rather than trusting me.',
                };
            }
            case 'ask': {
                // §PL-IA-Q — a LIST per topic, because two of these sections are placed in two
                // question groups. See `excerptAll`: quoting only the first half would make a
                // partial answer sound whole.
                const [testids, what]: [readonly string[], string] =
                    intent.topic === 'remaining'
                        ? [[AUTHORING_LAWCHECK_TESTID], 'the live law check on this panel']
                        : intent.topic === 'cost'
                            ? [
                                [
                                    LIVE_QUANTITIES_TESTID,
                                    LIVE_QUANTITIES_QUANTITIES_PART_TESTID,
                                    LIVE_QUANTITIES_COST_PART_TESTID,
                                ],
                                'the live quantities and cost sections on this panel',
                            ]
                            : [[PARCEL_LAW_FACTS_TESTID], 'the parcel fact section on this panel'];
                const text = excerptAll(scope, testids);
                if (text === null) {
                    return {
                        driven: false,
                        text:
                            `I read ${what} and it is not rendered right now, so I have no answer to give you. `
                            + '⛔ That is a gap in what is on screen — it is NOT a finding that the number is zero '
                            + 'or that nothing may be built here.',
                    };
                }
                return { driven: true, text: `Reading ${what}: ${text}` };
            }
        }
    };

    const runTurn = async (raw: string): Promise<ParcelLawChatRoute> => {
        const query = raw.trim();
        if (query.length === 0) return 'unanswered';
        saidByUser(query);
        let route: ParcelLawChatRoute = 'unanswered';
        try {
            const parse = deps.resolve(query);
            if (parse.kind === 'clarify' && parse.question !== null) {
                say(parse.question);
                route = 'clarify';
            } else if (parse.kind === 'act') {
                for (const intent of parse.intents) {
                    const outcome = await runIntent(intent);
                    say(outcome.text);
                }
                route = 'parcel-law';
            } else {
                // ── MISS → THE SHIPPED LADDER. Not a refusal; a hand-off. ───────────────────
                let answered = false;
                let ladderThrew = false;
                try {
                    answered = await deps.fallThrough(query, hooks);
                } catch (e) {
                    console.warn('[analysis][parcel-law][chat] the shipped ladder threw (non-fatal):', e);
                    ladderThrew = true;
                }
                if (ladderThrew) {
                    // ⛔ An admission about PRYZM's wiring, never an answer about the parcel. The two
                    // are the same sentence in most codebases and that is the defect (C57 §1.5).
                    say(
                        'I could not reach the PRYZM assistant for that sentence, so nothing was tried and '
                        + 'nothing changed. This is a wiring failure on my side, not an answer about your parcel.');
                    route = 'unanswered';
                } else if (answered) {
                    route = 'ladder';
                } else {
                    say(
                        'I did not understand that, and neither did the PRYZM assistant — so I have done nothing '
                        + 'rather than guessed. On this panel I drive: '
                        + PARCEL_LAW_CHAT_EXAMPLES.join(' · ') + '.');
                    route = 'unanswered';
                }
            }
            // ⭐ Named LAST and always, on every route including a miss. A clause the user wrote
            // that PRYZM heard and did not act on has to be said out loud — silence about it reads
            // as compliance, which is the most expensive of the three possible answers.
            for (const topic of parse.heardNotDriven) say(HEARD_NOT_DRIVEN_TEXT[topic]);
        } catch (e) {
            console.warn('[analysis][parcel-law][chat] turn failed (non-fatal):', e);
            say(
                'That turn failed inside PRYZM before anything was driven. Nothing was typed into a field and '
                + 'no button was pressed — this is a failure of this chat box, not a finding about your project.');
            route = 'unanswered';
        }
        turns += 1;
        root.setAttribute(PARCEL_LAW_CHAT_TURNS_ATTR, String(turns));
        root.setAttribute(PARCEL_LAW_CHAT_ROUTE_ATTR, route);
        return route;
    };

    const submit = (): void => {
        if (busy || disposed) return;
        const value = input.value;
        if (value.trim().length === 0) return;
        input.value = '';
        busy = true;
        sendBtn.disabled = true;
        void runTurn(value).finally(() => {
            busy = false;
            if (!disposed) sendBtn.disabled = false;
        });
    };

    sendBtn.onclick = (ev): void => { ev.preventDefault(); ev.stopPropagation(); submit(); };
    input.onkeydown = (ev): void => {
        if ((ev as KeyboardEvent).key === 'Enter') { ev.preventDefault(); submit(); }
    };

    try {
        host.appendChild(root);
        say(PARCEL_LAW_CHAT_GREETING);
        root.setAttribute(PARCEL_LAW_CHAT_TURNS_ATTR, '0');
        root.setAttribute(PARCEL_LAW_CHAT_ROUTE_ATTR, 'unanswered');
        span.setAttribute('pryzm.analysis.parcelLawChat.mounted', true);
    } catch (e) {
        span.setAttribute('pryzm.analysis.parcelLawChat.mounted', false);
        console.warn('[analysis][parcel-law][chat] mount failed (non-fatal):', e);
    } finally {
        span.end();
    }

    return {
        element: root,
        send: runTurn,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            // An unanswered Confirm resolves FALSE — see the note on `confirm`.
            for (const cancel of pendingConfirms.splice(0)) {
                try { cancel(); } catch { /* teardown is best-effort */ }
            }
            root.remove();
        },
    };
}
