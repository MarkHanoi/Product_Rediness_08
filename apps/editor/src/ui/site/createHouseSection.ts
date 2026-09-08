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
import type { BuildFromDesignOutcome } from './buildFromDesignPlan';

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
                + `${escHtml(CREATE_HOUSE_LABEL)}</button>`
                // ⛔ THE STATUS SLOT EXISTS ON THE REFUSAL ARM TOO (L-13011 defect 3). It used to
                // exist ONLY on the `ok` arm, and that is how the founder's crash became SILENT:
                // the host writes the pipeline's failure into this slot and then immediately
                // re-renders, the re-render landed on a refusal arm (the failed run's own debris
                // had tripped C80), the slot no longer existed, `querySelector` returned null and
                // the sentence was dropped — leaving only a refusal blaming him for walls he
                // never drew. A message the host can write must never depend on which arm is up.
                + `<div data-testid="${CREATE_HOUSE_STATUS_TESTID}" style="min-height:13px;margin-top:4px;`
                + `font-size:9.5px;color:#8a83a0;line-height:1.45;"></div></div>`;
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §BIM-FROM-THE-DESIGN (lane BIM-FROM-DESIGN, 2026-09-07 · L-13080) — THE FOURTH ARM
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Founder, with 7 authored envelopes on screen: *"WHEN WE SAY — CREATE BIM — EXCLUDE THIS — WE
// ALREADY HAVE THE DESIGN."*
//
// ⛔ EXTENDS THE SECTION, DOES NOT REPLACE IT. Same `escHtml`, same `list`, same `fmt2`, same
// button testid, and — critically — the SAME status-slot testid on BOTH arms, because the host
// writes the pipeline's outcome into that slot and then re-renders, and a slot that exists on one
// arm only is exactly how the founder's crash became silent (L-13011 defect 3).
//
// ⛔ THE THREE ARMS ARE MUTUALLY EXCLUSIVE AND THE HOST DECIDES BETWEEN THEM, NOT THIS FILE:
//   1. `planCreateHouse` REFUSES (C80 `already-built` among them) → the refusal arm above, first
//      and unconditional. Nothing here can weaken it.
//   2. It permits AND room envelopes exist → THIS arm.
//   3. It permits and there are NO room envelopes → the generator arm above, word for word,
//      including today's *"the room envelopes you have drawn are NOT used as the room programme"*
//      advisory. That sentence is still true on that path and is not deleted.

export const BUILD_FROM_DESIGN_TESTID = 'build-from-design-section';
export const BUILD_FROM_DESIGN_PLAN_TESTID = 'build-from-design-plan';
export const BUILD_FROM_DESIGN_ROOMS_TESTID = 'build-from-design-rooms';
export const BUILD_FROM_DESIGN_REFUSED_ROOMS_TESTID = 'build-from-design-refused-rooms';
/** ⛔ Level envelopes that will NOT be built, named on the ENABLED arm beside the ones that will. */
export const BUILD_FROM_DESIGN_REFUSED_STOREYS_TESTID = 'build-from-design-refused-storeys';
/** The per-storey line: every storey, its elevation, its floor-to-floor and its room count. */
export const BUILD_FROM_DESIGN_STOREYS_TESTID = 'build-from-design-storeys';
export const BUILD_FROM_DESIGN_REFUSAL_TESTID = 'build-from-design-refusal';
export const BUILD_FROM_DESIGN_WILLNOT_TESTID = 'build-from-design-will-not';
export const BUILD_FROM_DESIGN_LABEL = 'Create BIM from this design';

/**
 * The fourth arm. Pure markup.
 *
 * The sentence before the click names, in this order: the envelope it builds from and its area,
 * the storey, every room with its area, what IS created with its counts, and what is NOT —
 * including *"no generated layout, because you drew one"*, which is the whole point of the arm.
 */
export function buildBuildFromDesignSection(outcome: BuildFromDesignOutcome): string {
    const span = _tracer.startSpan('pryzm.site.buildBuildFromDesignSection');
    try {
        span.setAttribute('pryzm.buildFromDesign.arm', outcome.ok ? 'ok' : outcome.refusal.code);
        const head =
            `<div style="font-weight:700;font-size:11px;color:#2b2740;">Create BIM from your design</div>`
            + `<div style="margin-top:2px;margin-bottom:6px;font-size:9.5px;color:#8a83a0;line-height:1.45;">`
            + `You have drawn a level envelope and room envelopes, so PRYZM builds THOSE — it does not `
            + `ask you to design a house it already has. Nothing is generated and nothing is proposed.</div>`;

        if (!outcome.ok) {
            return `<div data-testid="${BUILD_FROM_DESIGN_TESTID}" data-arm="build-from-design-refused" `
                + `data-refusal-code="${escHtml(outcome.refusal.code)}" `
                + `style="margin-top:10px;padding-top:8px;border-top:1px solid #efecf7;min-width:0;max-width:100%;">`
                + head
                + `<div data-testid="${BUILD_FROM_DESIGN_REFUSAL_TESTID}" style="color:#8a5a00;background:#fff6e8;`
                + `border-radius:6px;padding:6px 8px;font-size:9.5px;line-height:1.5;">`
                + `${escHtml(outcome.refusal.text)}</div>`
                + `<button type="button" disabled data-testid="${CREATE_HOUSE_BTN_TESTID}" `
                + `style="margin-top:6px;width:100%;appearance:none;border:1px solid #d8d3e6;cursor:not-allowed;`
                + `padding:7px 10px;border-radius:8px;font:700 11px system-ui;background:#f5f4f8;color:#a09aae;">`
                + `${escHtml(BUILD_FROM_DESIGN_LABEL)}</button>`
                + `<div data-testid="${CREATE_HOUSE_STATUS_TESTID}" style="min-height:13px;margin-top:4px;`
                + `font-size:9.5px;color:#8a83a0;line-height:1.45;"></div></div>`;
        }

        const p = outcome.plan;
        const source = p.sourceEnvelopeName ?? p.sourceEnvelopeId;
        // ⭐ EVERY ROOM NAMES ITS STOREY. The founder's two reproductions were both "all my rooms
        // are on one upper storey and none of them built"; a room list that does not say which floor
        // a room lands on cannot show him that the answer changed.
        const storeyOf = (i: number): string => {
            const st = p.storeys[i];
            return st ? (st.plateName ?? st.plateEnvelopeId) : 'an unnamed storey';
        };
        const multiStorey = p.storeys.length > 1;
        const roomRows = p.rooms.map((r) => (
            `<li style="margin:1px 0;">${escHtml(r.name)} — ${escHtml(fmt2(r.areaM2))} m², `
            + `${r.partitionEdgeCount} partition${r.partitionEdgeCount === 1 ? '' : 's'}`
            + `${r.edgesOnShellCount > 0
                ? ` (${r.edgesOnShellCount} edge${r.edgesOnShellCount === 1 ? '' : 's'} on the perimeter)`
                : ''}`
            + `${multiStorey ? ` &middot; on ${escHtml(storeyOf(r.storeyIndex))}` : ''}`
            + `</li>`
        )).join('');

        // ⛔ A LEVEL ENVELOPE THAT COULD NOT BE BUILT IS NAMED, ON THE ENABLED ARM, BESIDE THE
        // STOREYS THAT WILL BUILD. Dropping a storey silently is the same defect class as dropping
        // a room silently, one scale up.
        const refusedStoreys = p.refusedStoreys.length === 0 ? '' :
            `<div data-testid="${BUILD_FROM_DESIGN_REFUSED_STOREYS_TESTID}" style="margin-top:5px;`
            + `font-size:9px;color:#8a5a00;background:#fff6e8;border-radius:6px;padding:5px 7px;`
            + `line-height:1.5;"><strong>${p.refusedStoreys.length} level envelope`
            + `${p.refusedStoreys.length === 1 ? '' : 's'} will NOT be built:</strong>`
            + `<ul style="margin:2px 0 0;padding-left:14px;">`
            + p.refusedStoreys.map((r) => `<li style="margin:1px 0;">${escHtml(r.text)}</li>`).join('')
            + `</ul></div>`;

        // ⛔ NEVER A SILENT SUBSET. A room that could not be materialised is named here with its
        // numbers, on the ENABLED arm, beside the rooms that will build. Hiding it until after the
        // click would be the "a cap that drops something must say so" defect at its own doorstep.
        const refused = p.refusedRooms.length === 0 ? '' :
            `<div data-testid="${BUILD_FROM_DESIGN_REFUSED_ROOMS_TESTID}" style="margin-top:5px;font-size:9px;`
            + `color:#8a5a00;background:#fff6e8;border-radius:6px;padding:5px 7px;line-height:1.5;">`
            + `<strong>${p.refusedRooms.length} room${p.refusedRooms.length === 1 ? '' : 's'} will NOT be `
            + `built:</strong><ul style="margin:2px 0 0;padding-left:14px;">`
            + p.refusedRooms.map((r) => `<li style="margin:1px 0;">${escHtml(r.text)}</li>`).join('')
            + `</ul></div>`;

        const advisories = p.advisories.length === 0 ? '' :
            `<div style="margin-top:5px;font-size:9px;color:#6b6580;background:#faf9fd;border:1px solid #efecf7;`
            + `border-radius:6px;padding:5px 7px;line-height:1.5;"><ul style="margin:0;padding-left:14px;">`
            + `${list(p.advisories)}</ul></div>`;

        return `<div data-testid="${BUILD_FROM_DESIGN_TESTID}" data-arm="build-from-design" `
            + `style="margin-top:10px;padding-top:8px;border-top:1px solid #efecf7;min-width:0;max-width:100%;">`
            + head
            + `<div data-testid="${BUILD_FROM_DESIGN_PLAN_TESTID}" style="padding:6px 8px;border-radius:6px;`
            + `background:#faf9fd;border:1px solid #efecf7;font-size:9.5px;color:#2b2740;line-height:1.5;">`
            + `<div><strong>From:</strong> ${escHtml(source)} — ${escHtml(fmt2(p.footprintAreaM2))} m² `
            + `footprint, ${p.shellWallCount} edge${p.shellWallCount === 1 ? '' : 's'}</div>`
            + `<div data-testid="${BUILD_FROM_DESIGN_STOREYS_TESTID}"><strong>Builds:</strong> `
            + `${p.storeyCount} storey${p.storeyCount === 1 ? '' : 's'} — `
            + `${p.storeys.map((st) => `${escHtml(st.plateName ?? st.plateEnvelopeId)} at `
                + `${escHtml(fmt2(st.baseOffsetM))} m, ${escHtml(fmt2(st.floorToFloorM))} m `
                + `floor-to-floor, ${st.roomCount} room${st.roomCount === 1 ? '' : 's'}`).join('; ')}`
            + `</div>`
            + `<div data-testid="${BUILD_FROM_DESIGN_ROOMS_TESTID}" style="margin-top:4px;color:#6b6580;">`
            + `Your ${p.rooms.length} room${p.rooms.length === 1 ? '' : 's'} `
            + `(${escHtml(fmt2(p.roomsAreaM2))} m²):<ul style="margin:2px 0 0;padding-left:14px;">`
            + `${roomRows}</ul></div>`
            + `<div style="margin-top:4px;color:#6b6580;">Creates:<ul style="margin:2px 0 0;padding-left:14px;">`
            + `${list(p.willCreate)}</ul></div>`
            + `<div data-testid="${BUILD_FROM_DESIGN_WILLNOT_TESTID}" style="margin-top:4px;color:#8a5a00;">`
            + `Does NOT create:<ul style="margin:2px 0 0;padding-left:14px;">${list(p.willNotCreate)}</ul></div>`
            + `</div>${refusedStoreys}${refused}${advisories}`
            + `<button type="button" data-testid="${CREATE_HOUSE_BTN_TESTID}" `
            + `style="margin-top:6px;width:100%;appearance:none;border:1px solid #6600FF;cursor:pointer;`
            + `padding:7px 10px;border-radius:8px;font:700 11px system-ui;background:#6600FF;color:#fff;">`
            + `${escHtml(BUILD_FROM_DESIGN_LABEL)}</button>`
            + `<div data-testid="${CREATE_HOUSE_STATUS_TESTID}" style="min-height:13px;margin-top:4px;`
            + `font-size:9.5px;color:#8a83a0;line-height:1.45;"></div></div>`;
    } finally {
        span.end();
    }
}
