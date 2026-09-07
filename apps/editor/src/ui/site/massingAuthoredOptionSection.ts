// §CREATE-IT-MYSELF (lane MASSING-SHAPES, 2026-09-07 · L-13039 · STR §25.3 / §26.6.3) — THE
// MASSING OPTION THAT IS NOT GENERATED, rendered as a first-class entry of the option list.
//
// Founder: *"MORE IMPORTANT I NEED TO HAVE CREATE MYSELF MASSING OPTION! IN WHICH CASE I DESIGN I
// SHALL BE ABLE TO SEE THE ROOMS PER LEVEL HERE."*
//
// ── WHAT THIS RENDERS, AND WHAT DECIDES IT ──────────────────────────────────────────────────
// One card, present on BOTH arms of the massing fold — idle (before anything is generated) and
// computed (beside the generated options) — because the user's own massing is not something the
// Generate button produces. Its state is `resolveAuthoredMassingState` (massingOptionModel.ts),
// which is PURE and keyed on `provenance` through the ONE supersession rule; this module renders
// that state and decides nothing itself.
//
// ── ⛔ ONE AUTHORING ROUTE (P6) ─────────────────────────────────────────────────────────────
// The button opens `window.pryzmOpenSiteEnvelopeTool` — the SAME site envelope tool the Parcel Law
// tab mounts, which builds the SAME `buildEnvelopeAuthoringPlan` and dispatches the SAME
// `spaceEnvelope.batch.create`. No draw gesture is built here, no second panel, no second store:
// this module hands the user to the tool and reads the store back through the resolver.
//
// ── ⭐ THE REFUSAL IS STATED BEFORE ANY CLICK (C58 §1.13 / §26.6.0 rule 3) ───────────────────
// Once the user's own level envelope is on the ground storey, every GENERATED option carries a
// line saying that keeping it would be refused, and why — the supersession rule's own verdict,
// rendered once in full on this card and once in short on each generated card. A user reads the
// consequence with the button still unpressed.
//
// PURE HTML builders + one wiring helper. No store, no bus, no THREE. C08 §3.1 — every
// interpolated runtime string goes through the local `escHtml`.

import { trace } from '@opentelemetry/api';
// ⛔ TYPE-ONLY from the model, and the VALUE from the light module. `massingOptionModel` reaches
// `massingSitingContext` → `siteDispatch` (the whole GIS/Cesium/command graph, ~270 s of test
// transform); a value import here would drag that graph into every consumer of
// `envelopeCardSections` — measured: it turned `parcelLawEnvelopeAuthoring.spec` red on the
// first run. The sentence builder lives in `levelEnvelopeSupersession`, which imports only the
// provenance schema, so it is taken from there.
import type { AuthoredMassingState } from './massingOptionModel';
import { describeLevelEnvelope } from './levelEnvelopeSupersession';

const _tracer = trace.getTracer('pryzm.site.massingAuthoredOptionSection');

/** The card. */
export const MASSING_AUTHOR_OPTION_TESTID = 'envelope-massing-author-option';
/** The button that opens the site envelope tool. Present on every arm — the tool is never gated. */
export const MASSING_AUTHOR_BTN_TESTID = 'envelope-massing-author-btn';
/** The pre-click refusal line on a GENERATED option's card. Value: `chosen` | `unknown`. */
export const MASSING_AUTHORED_BLOCK_ATTR = 'data-massing-authored-block';

function escHtml(value: unknown): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const BTN_STYLE =
    'margin-top:5px;width:100%;appearance:none;border:1px solid #6600FF;cursor:pointer;'
    + 'padding:5px 9px;border-radius:7px;font:600 10px system-ui;background:#ffffff;color:#6600FF;';

/**
 * The "create it myself" card, for one resolved state.
 *
 * `null` — the caller did not resolve a state (a surface with no store access). The authoring
 * route still exists and is still offered; nothing about the storey is claimed.
 */
export function buildAuthoredMassingOptionHtml(state: AuthoredMassingState | null): string {
    const span = _tracer.startSpan('pryzm.site.buildAuthoredMassingOptionHtml');
    try {
        const kind = state === null ? 'offer' : state.kind;
        span.setAttribute('pryzm.authoredMassing.render', kind);

        let title: string;
        let body: string;
        let button: string;
        let tone: 'own' | 'offer' | 'warn';
        switch (kind) {
            case 'chosen': {
                const s = state as Extract<AuthoredMassingState, { kind: 'chosen' }>;
                tone = 'own';
                title = `${s.label} · chosen`;
                body =
                    `Your own level envelope is on the ground storey `
                    + `(${describeLevelEnvelope(s.envelope)}). It is the massing PRYZM designs inside`
                    + (s.othersOnStorey > 0
                        ? `; ${s.othersOnStorey} other level envelope${s.othersOnStorey === 1 ? '' : 's'} `
                          + 'also sit on this storey.'
                        : '.')
                    + ` The generated options are alternatives to compare — ⛔ keeping any of them would be `
                    + `refused: ${s.blockSentence}`;
                button = 'Edit my own massing on the view';
                break;
            }
            case 'blocked-unknown': {
                const s = state as Extract<AuthoredMassingState, { kind: 'blocked-unknown' }>;
                tone = 'warn';
                const n = s.envelopes.length;
                title = `On the ground storey: ${n} level envelope${n === 1 ? '' : 's'} PRYZM cannot prove it generated`;
                body =
                    `${s.envelopes.map(describeLevelEnvelope).join('; ')}. PRYZM does not know whether `
                    + `${n === 1 ? 'this is' : 'these are'} yours — it will not present ${n === 1 ? 'it' : 'them'} as `
                    + `your own massing, and it will not delete ${n === 1 ? 'it' : 'them'} for a generated option. `
                    + s.blockSentence;
                button = 'Open the envelope tool';
                break;
            }
            case 'no-ground-level': {
                tone = 'warn';
                title = 'Create it myself';
                body = (state as Extract<AuthoredMassingState, { kind: 'no-ground-level' }>).text;
                button = 'Draw my own massing on the view';
                break;
            }
            case 'unreadable': {
                tone = 'warn';
                title = 'Create it myself';
                body = (state as Extract<AuthoredMassingState, { kind: 'unreadable' }>).text;
                button = 'Draw my own massing on the view';
                break;
            }
            case 'offer':
            default: {
                tone = 'offer';
                title = 'Create it myself';
                body =
                    'Draw your own massing on whichever view is open. PRYZM keeps it as YOUR level envelope '
                    + '— it is never replaced by a generated option, the rooms per level are read inside it, '
                    + 'and the generated options below stay available to compare against it.';
                button = 'Draw my own massing on the view';
                break;
            }
        }

        const colour = tone === 'own' ? '#6600FF' : tone === 'warn' ? '#8a5a00' : '#4b4460';
        const bg = tone === 'own' ? '#f6f1ff' : tone === 'warn' ? '#fdf8ee' : '#ffffff';
        const border = tone === 'own' ? '#6600FF' : tone === 'warn' ? '#c9973a' : '#efecf7';
        return `<div data-testid="${MASSING_AUTHOR_OPTION_TESTID}" data-state="${escHtml(kind)}" `
            + `style="margin-top:7px;padding:6px 7px;border:1px solid ${border};border-radius:8px;`
            + `background:${bg};min-width:0;max-width:100%;">`
            + `<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">`
            + `<span style="font-weight:700;font-size:10.5px;color:${colour};">${escHtml(title)}</span>`
            + `<span style="font-size:9px;color:#8a83a0;">not generated</span></div>`
            + `<div style="margin-top:3px;font-size:9.5px;line-height:1.45;color:#6b6480;">${escHtml(body)}</div>`
            + `<button type="button" data-testid="${MASSING_AUTHOR_BTN_TESTID}" style="${BTN_STYLE}">`
            + `${escHtml(button)}</button>`
            + `</div>`;
    } finally {
        span.end();
    }
}

/**
 * The SHORT pre-click refusal for one GENERATED option's card — empty when nothing on the ground
 * storey would refuse it. The full reason is on the authored card above; this line names the
 * blocker with its number so the consequence is readable beside the button it applies to.
 */
export function buildAuthoredBlockLineHtml(state: AuthoredMassingState | null): string {
    if (state === null) return '';
    if (state.kind === 'chosen') {
        return `<div ${MASSING_AUTHORED_BLOCK_ATTR}="chosen" style="margin-top:4px;font-size:9px;line-height:1.45;`
            + `color:#8a5a00;background:#fdf8ee;border-left:2px solid #c9973a;padding:3px 6px;border-radius:0 4px 4px 0;">`
            + `⛔ Keeping this as a level envelope will be refused: the ground storey carries your own envelope `
            + `(${escHtml(describeLevelEnvelope(state.envelope))}), which PRYZM will not delete. `
            + `Delete it yourself first if you want this one instead.</div>`;
    }
    if (state.kind === 'blocked-unknown') {
        const n = state.envelopes.length;
        return `<div ${MASSING_AUTHORED_BLOCK_ATTR}="unknown" style="margin-top:4px;font-size:9px;line-height:1.45;`
            + `color:#8a5a00;background:#fdf8ee;border-left:2px solid #c9973a;padding:3px 6px;border-radius:0 4px 4px 0;">`
            + `⛔ Keeping this as a level envelope will be refused: the ground storey carries ${n} level `
            + `envelope${n === 1 ? '' : 's'} PRYZM cannot prove it generated, and it will not delete `
            + `${n === 1 ? 'it' : 'them'} on a guess.</div>`;
    }
    return '';
}

/**
 * Wire the card's button to the ONE authoring route. `open` is
 * `() => window.pryzmOpenSiteEnvelopeTool?.()` in production; a no-op is a dead click, so when the
 * route is absent the caller should pass a function that says so rather than `undefined`.
 */
export function wireAuthoredMassingOption(panel: ParentNode, open: () => void): void {
    const btn = panel.querySelector(`[data-testid="${MASSING_AUTHOR_BTN_TESTID}"]`) as HTMLButtonElement | null;
    if (!btn) return;
    btn.onclick = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        open();
    };
}
