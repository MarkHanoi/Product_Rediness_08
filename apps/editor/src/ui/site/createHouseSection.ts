// §PL-CREATE-HOUSE (lane PL-COST-AND-CREATE-HOUSE, 2026-09-06) — the RENDERER for STR §25.8's
// explicit user action.
//
// ⛔ PURE STRING BUILDERS. No DOM, no store, no arithmetic. Every sentence about what will and
// will not be created comes from `createHousePlan.ts`, which measured it in the executor's source
// rather than reading it off the founder's spec. C08 §3.1 — every interpolated runtime string
// routes through the local `escHtml`.
//
// ⭐ THE BUTTON IS NEVER A DEAD CLICK. On every refusal arm it is rendered DISABLED with the
// refusal printed beside it — Stage C's rule ("a row with no geometry to point at must render as
// un-clickable, not as a click that does nothing") applied to the biggest button on the tab.
//
// ⭐ AND IT IS NEVER "ONE CLICK BUILDS THE HOUSE". STR §25.0 is binding: *"I want pryzm to guide
// this process without building the house in one click — because it would never be the wanted
// outcome."* So the copy says a layout chooser follows, and the control leaves
// `generateHouseFromBoundary`'s `autoBuild` at its default `false` — the modal path, where the
// user picks among the generated variants. A button that skipped it would satisfy §25.8's letter
// and break §25.0's sentence.

import { trace } from '@opentelemetry/api';
import type { CreateHouseOutcome } from './createHousePlan';

const _tracer = trace.getTracer('pryzm.site.createHouseSection');

function escHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

export const CREATE_HOUSE_TESTID = 'create-house-section';
export const CREATE_HOUSE_BTN_TESTID = 'create-house-btn';
export const CREATE_HOUSE_PLAN_TESTID = 'create-house-plan';
export const CREATE_HOUSE_REFUSAL_TESTID = 'create-house-refusal';
export const CREATE_HOUSE_WILLNOT_TESTID = 'create-house-will-not';
export const CREATE_HOUSE_STATUS_TESTID = 'create-house-status';
export const CREATE_HOUSE_LABEL = 'Create house from this envelope';

const fmt2 = (n: number): string => (Math.round(n * 100) / 100)
    .toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function list(items: readonly string[]): string {
    return items.map((t) => `<li style="margin:1px 0;">${escHtml(t)}</li>`).join('');
}

/**
 * The §25.8 section. Pure markup.
 *
 * The DISABLED arm carries the refusal's own words. The ENABLED arm states, before the click,
 * exactly which envelope it will build from, how many storeys, what will be created and — the
 * part a "Create house" button would otherwise imply falsely — what will NOT be.
 */
export function buildCreateHouseSection(outcome: CreateHouseOutcome): string {
    const span = _tracer.startSpan('pryzm.site.buildCreateHouseSection');
    try {
        span.setAttribute('pryzm.createHouse.arm', outcome.ok ? 'ok' : outcome.refusal.code);
        const head =
            `<div style="font-weight:700;font-size:11px;color:#2b2740;">Create house</div>`
            + `<div style="margin-top:2px;margin-bottom:6px;font-size:9.5px;color:#8a83a0;line-height:1.45;">`
            + `The explicit step from the envelope stage into BIM. It draws a shell on your level `
            + `envelope's footprint and runs PRYZM's house pipeline — then offers you the generated `
            + `layouts to choose from. It does not build a house in one click.</div>`;

        if (!outcome.ok) {
            return `<div data-testid="${CREATE_HOUSE_TESTID}" data-arm="${escHtml(outcome.refusal.code)}" `
                + `style="margin-top:10px;padding-top:8px;border-top:1px solid #efecf7;min-width:0;max-width:100%;">`
                + head
                + `<div data-testid="${CREATE_HOUSE_REFUSAL_TESTID}" style="color:#8a5a00;background:#fff6e8;`
                + `border-radius:6px;padding:6px 8px;font-size:9.5px;line-height:1.5;">`
                + `${escHtml(outcome.refusal.text)}</div>`
                + `<button type="button" disabled data-testid="${CREATE_HOUSE_BTN_TESTID}" `
                + `style="margin-top:6px;width:100%;appearance:none;border:1px solid #d8d3e6;cursor:not-allowed;`
                + `padding:7px 10px;border-radius:8px;font:700 11px system-ui;background:#f5f4f8;color:#a09aae;">`
                + `${escHtml(CREATE_HOUSE_LABEL)}</button></div>`;
        }

        const p = outcome.plan;
        const source = p.sourceEnvelopeName ?? p.sourceEnvelopeId;
        const advisories = p.advisories.length === 0 ? '' :
            `<div style="margin-top:5px;font-size:9px;color:#8a5a00;background:#fff6e8;border-radius:6px;`
            + `padding:5px 7px;line-height:1.5;"><ul style="margin:0;padding-left:14px;">${list(p.advisories)}</ul></div>`;

        return `<div data-testid="${CREATE_HOUSE_TESTID}" data-arm="ok" `
            + `style="margin-top:10px;padding-top:8px;border-top:1px solid #efecf7;min-width:0;max-width:100%;">`
            + head
            + `<div data-testid="${CREATE_HOUSE_PLAN_TESTID}" style="padding:6px 8px;border-radius:6px;`
            + `background:#faf9fd;border:1px solid #efecf7;font-size:9.5px;color:#2b2740;line-height:1.5;">`
            + `<div><strong>From:</strong> ${escHtml(source)} — ${escHtml(fmt2(p.footprintAreaM2))} m² `
            + `footprint, ${p.footprint.length} edges</div>`
            + `<div><strong>Builds:</strong> ${p.storeyCount} storey${p.storeyCount === 1 ? '' : 's'} `
            + `at ${escHtml(fmt2(p.floorToFloorM))} m floor-to-floor, ${escHtml(p.roofKind)} roof</div>`
            + `<div style="margin-top:4px;color:#6b6580;">Creates:<ul style="margin:2px 0 0;padding-left:14px;">`
            + `${list(p.willCreate)}</ul></div>`
            + `<div data-testid="${CREATE_HOUSE_WILLNOT_TESTID}" style="margin-top:4px;color:#8a5a00;">`
            + `Does NOT create:<ul style="margin:2px 0 0;padding-left:14px;">${list(p.willNotCreate)}</ul></div>`
            + `</div>${advisories}`
            + `<button type="button" data-testid="${CREATE_HOUSE_BTN_TESTID}" `
            + `style="margin-top:6px;width:100%;appearance:none;border:1px solid #6600FF;cursor:pointer;`
            + `padding:7px 10px;border-radius:8px;font:700 11px system-ui;background:#6600FF;color:#fff;">`
            + `${escHtml(CREATE_HOUSE_LABEL)}</button>`
            + `<div data-testid="${CREATE_HOUSE_STATUS_TESTID}" style="min-height:13px;margin-top:4px;`
            + `font-size:9.5px;color:#8a83a0;line-height:1.45;"></div></div>`;
    } finally {
        span.end();
    }
}
