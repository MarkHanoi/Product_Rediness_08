// §L-456 — the COMPLIANCE COMPARISON SECTION: designed vs permitted, rendered.
//
// A stackable section of the existing buildable-envelope card (`GISAreaLayout.refreshEnvelopePanel`),
// built with that card's own `group()` / `row()` idiom — a sibling section, not a second panel
// system. It shows the line items a *proyecto de ejecución* asks for: *ocupación*,
// *superficie construida*, *superficie útil*, *altura*, *plantas*.
//
// PURE STRING BUILDER. No DOM, no store, no arithmetic — every number and every verdict comes
// from the L2 model (`buildCapacityComparison`, `@pryzm/site-parcel-data`) and the L5 measurement
// adapter (`designMeasurement.ts`). Extracted from the 4,200-line panel closure precisely so the
// honesty rules below can be pinned by unit tests instead of asserted in a comment.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THE THREE HONESTY RULES, AS ENFORCED **IN THE UI**
// ─────────────────────────────────────────────────────────────────────────────────────────
// The L2 model keeps these in the data. A panel can still break every one of them while
// consuming correct data — by colouring `unknown` green, by collapsing `no-limit` into
// `unknown`, or by summarising four unknowns and one pass as "compliant". So they are enforced
// again, here, at the surface the user actually reads:
//
//  1. UNKNOWN IS NOT COMPLIANT — and `no-limit` is NOT `unknown`.
//     Five statuses, five DISTINCT renderings: distinct label text, distinct colour pair, and a
//     distinct `data-status` attribute. `unknown` renders neutral-grey with a dashed border and
//     the words "Not checked"; `no-limit` renders in brand violet with the words "No limit set"
//     and a tooltip saying the ordinance is silent — a FINDING. Neither can be mistaken for the
//     green `within`. Pinned by `renders every status distinguishably`.
//
//  2. A VERDICT INHERITS THE WEAKEST INPUT.
//     `resolveCapacityVerdict` can only return the green `clear` tone when the basis is
//     `authoritative` AND nothing is unknown AND something was actually judged. An
//     `estimated-ruleset` OR a `structured` basis is downgraded to `indicative` and carries the
//     basis in the qualifier; any unknown row downgrades to `partial`. The word "compliant"
//     never appears in this UI except in the phrase "not a compliance determination".
//
//  3. MEASURE, NEVER INFER.
//     A `null` designed value renders as "—" plus the adapter's stated REASON ("No floor slabs
//     are authored…"), never as `0` and never as a derived figure. The height row always carries
//     the rasant caveat (L-584) so a reported height is not read as the regulated height.
//
// Contracts: C58 §1.3 (explain-why), §1.4 (never present a guess as a fact), §1.8; C19 §1.6.
// P4 — no globals. P6 — renders only; every mutation on this surface still goes via the command
// bus (this section dispatches nothing). P8 — exported functions open OTel spans.
// C08 §3.1 — every interpolated runtime string is routed through the local `escHtml`.

import { trace } from '@opentelemetry/api';
import type { CapacityComparison, CapacityRow, CapacityStatus } from '@pryzm/site-parcel-data';
import {
    UNMEASURED_REASON_TEXT,
    type DesignMeasurement,
    type UnmeasuredReason,
} from './designMeasurement';

const _tracer = trace.getTracer('pryzm.site.capacityPanel');

/** Local HTML escaper — the guard this file declares for itself (C08 §3.1). */
function escHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

// ─────────────────────────────────────────────────────────────────────────────
// Status presentation — five statuses, five unmistakably different renderings
// ─────────────────────────────────────────────────────────────────────────────

interface StatusStyle {
    readonly text: string;
    readonly bg: string;
    readonly fg: string;
    readonly border: string;
    readonly title: string;
}

/**
 * The presentation table. It is exported so a test can assert, mechanically, that no two statuses
 * share a label or a colour — the collapse this feature must never ship.
 */
export const CAPACITY_STATUS_STYLE: Readonly<Record<CapacityStatus, StatusStyle>> = {
    within: {
        text: 'Within',
        bg: '#eef7ee',
        fg: '#2e7d32',
        border: '1px solid #cfe6d0',
        title: 'Measured, and inside the limit PRYZM holds for this metric.',
    },
    'at-limit': {
        text: 'At limit',
        bg: '#fff6e8',
        fg: '#9a6414',
        border: '1px solid #f0dcbb',
        title: 'Measured, and equal to the limit within tolerance. No headroom remains.',
    },
    over: {
        text: 'Over',
        bg: '#fdecea',
        fg: '#b3261e',
        border: '1px solid #f3b9b3',
        title: 'Measured, and above the limit PRYZM holds for this metric.',
    },
    unknown: {
        text: 'Not checked',
        bg: '#eef2f7',
        fg: '#3d4a5c',
        border: '1px dashed #9fb0c4',
        title:
            'NOT CHECKED — either PRYZM does not hold a published limit for this metric, or the '
            + 'design does not supply the measurement. This is not a pass: an unchecked metric '
            + 'says nothing about whether the design complies.',
    },
    'no-limit': {
        text: 'No limit set',
        bg: '#f3eeff',
        fg: '#6600FF',
        border: '1px solid #ddd0ff',
        title:
            'The ordinance sets NO limit for this metric — a finding, not a missing value. It is '
            + 'different from "not checked": here we know the rule is silent.',
    },
};

function statusChip(status: CapacityStatus): string {
    const s = CAPACITY_STATUS_STYLE[status];
    return `<span data-testid="capacity-status" data-status="${escHtml(status)}"`
        + ` title="${escHtml(s.title)}"`
        + ` style="flex:none;white-space:nowrap;display:inline-block;padding:1px 7px;border-radius:999px;`
        + `background:${s.bg};color:${s.fg};border:${s.border};font-weight:700;font-size:9.5px;`
        + `letter-spacing:.03em;text-transform:uppercase;">${escHtml(s.text)}</span>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The verdict — HONESTY RULE 2, enforced at the headline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `clear` is the ONLY green tone, and it is unreachable unless the envelope is an authoritative
 * determination, every metric was judged, and none is over.
 */
export type CapacityVerdictTone = 'over' | 'unjudged' | 'partial' | 'indicative' | 'clear';

export interface CapacityVerdict {
    readonly tone: CapacityVerdictTone;
    readonly headline: string;
    /** Always non-empty for every tone except `clear` — the qualification the tone requires. */
    readonly qualifier: string | null;
}

const VERDICT_STYLE: Readonly<Record<CapacityVerdictTone, { bg: string; fg: string }>> = {
    over: { bg: '#fdecea', fg: '#b3261e' },
    unjudged: { bg: '#eef2f7', fg: '#3d4a5c' },
    partial: { bg: '#fff6e8', fg: '#8a5a00' },
    indicative: { bg: '#fff6e8', fg: '#8a5a00' },
    clear: { bg: '#eef7ee', fg: '#2e7d32' },
};

/**
 * Turn a comparison into the one line the user reads first.
 *
 * The ordering is the honesty argument: an exceedance outranks everything; "we could judge
 * nothing" outranks any positive phrasing; an unknown row downgrades a pass to `partial`; a
 * non-authoritative basis downgrades it to `indicative`. Only the fully-known, fully-judged,
 * authoritative case is allowed to read as clear — and even then the section footer still says
 * the check covers the metrics PRYZM holds limits for, not the building code as a whole.
 */
export function resolveCapacityVerdict(cmp: CapacityComparison): CapacityVerdict {
    const span = _tracer.startSpan('pryzm.site.resolveCapacityVerdict');
    try {
        const total = cmp.rows.length;
        const unknownNote = cmp.unknownCount > 0
            ? `${cmp.unknownCount} of ${total} metric${total === 1 ? '' : 's'} could not be checked.`
            : null;
        const basisNote = cmp.isIndicativeOnly
            ? `Basis: ${cmp.basis} — indicative only, not a compliance determination.`
            : null;
        const join = (...parts: (string | null)[]): string | null => {
            const kept = parts.filter((p): p is string => typeof p === 'string' && p.length > 0);
            return kept.length > 0 ? kept.join(' ') : null;
        };

        if (cmp.overCount > 0) {
            return {
                tone: 'over',
                headline: `Exceeds ${cmp.overCount} limit${cmp.overCount === 1 ? '' : 's'}`,
                qualifier: join(unknownNote, basisNote),
            };
        }
        // `allJudgedWithin` is false when NOTHING could be judged — "we know nothing" is not a pass.
        if (!cmp.allJudgedWithin) {
            return {
                tone: 'unjudged',
                headline: 'Not enough to judge this design',
                qualifier: join(
                    unknownNote ?? 'No metric could be checked.',
                    basisNote,
                ),
            };
        }
        if (cmp.unknownCount > 0) {
            return {
                tone: 'partial',
                headline: 'Within the limits that could be checked',
                qualifier: join(unknownNote, basisNote),
            };
        }
        if (cmp.isIndicativeOnly) {
            return {
                tone: 'indicative',
                headline: 'Within the limits that could be checked',
                qualifier: basisNote,
            };
        }
        return { tone: 'clear', headline: 'Within every regulated limit checked', qualifier: null };
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Number formatting — never invents precision, never prints 0 for absent
// ─────────────────────────────────────────────────────────────────────────────

const EM_DASH = '—';

function fmt(value: number | null, unit: CapacityRow['unit']): string {
    if (value === null || !Number.isFinite(value)) return EM_DASH;
    if (unit === 'floors') return `${Math.round(value)}`;
    const dp = unit === 'm' ? 1 : 1;
    const n = value.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return unit === 'm' ? `${n} m` : `${n} m²`;
}

const UNIT_WORD: Readonly<Record<CapacityRow['unit'], string>> = {
    m2: 'm²',
    m: 'm',
    floors: 'storeys',
};

// ─────────────────────────────────────────────────────────────────────────────
// The section
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §GIS-ENVELOPE-FULL-SECTIONS (L-1651) — the ONE renderer for measurement-caveat lines, shared
 * by the internal "How these were measured" disclosure below and by the card's promoted
 * `buildHowMeasuredFold` (envelopeCardSections.ts). Exported so the promoted fold cannot drift
 * into a second, disagreeing rendering of the same caveats.
 */
export function renderMeasurementCaveatLinesHtml(caveats: readonly string[]): string {
    return caveats
        .map((c) => `<div style="color:#8a83a0;font-size:10px;line-height:1.45;`
            + `margin-top:3px;">${escHtml(c)}</div>`)
        .join('');
}

const METRIC_TO_MEASURE_KEY: Readonly<Record<CapacityRow['metric'], keyof DesignMeasurement['unmeasured']>> = {
    footprint: 'footprintM2',
    grossFloorArea: 'grossFloorAreaM2',
    netFloorArea: 'netFloorAreaM2',
    height: 'heightM',
    floors: 'floors',
};

function reasonFor(
    row: CapacityRow,
    measurement: DesignMeasurement | null,
): UnmeasuredReason | null {
    if (row.proposed !== null || measurement === null) return null;
    return measurement.unmeasured[METRIC_TO_MEASURE_KEY[row.metric]] ?? null;
}

function renderRow(row: CapacityRow, measurement: DesignMeasurement | null): string {
    const permittedText = row.status === 'no-limit'
        ? `<span style="color:#6600FF;" title="The ordinance sets no limit for this metric.">no limit</span>`
        : escHtml(fmt(row.permitted, row.unit));

    const headroom = (() => {
        if (row.remaining === null || row.utilisationPct === null) return '';
        const pct = Math.round(row.utilisationPct);
        const left = row.remaining >= 0
            ? `${escHtml(fmt(row.remaining, row.unit))} left`
            : `${escHtml(fmt(Math.abs(row.remaining), row.unit))} over`;
        return `<div style="color:#8a83a0;font-size:10px;margin-top:1px;">`
            + `${pct}% of the permitted ${escHtml(UNIT_WORD[row.unit])} used · ${left}</div>`;
    })();

    // §REFUSAL-IDENTITY (C58 §1.13, 2026-08-11) — `UnmeasuredReason` is a 10-member closed
    // union, and this line used to render its PROSE only. The user was told the metric could
    // not be measured but not WHICH of the ten facts stopped it, so "you have not drawn a
    // slab" and "two plates overlap and PRYZM has no union operation" arrived as
    // indistinguishable amber text — the §CONTEXT-DATA-HONESTY conflation at the panel layer.
    // Aggravating: the row element twelve lines below has stamped `data-metric` and
    // `data-status` since it was written. The file already knew how to carry identity.
    // Now the reason key rides the DOM exactly as those do.
    const reason = reasonFor(row, measurement);
    const reasonLine = reason !== null
        ? `<div data-testid="capacity-unmeasured-reason" data-unmeasured-reason="${escHtml(reason)}"`
          + ` style="color:#8a5a00;font-size:10px;`
          + `margin-top:2px;line-height:1.45;">${escHtml(UNMEASURED_REASON_TEXT[reason])}</div>`
        : '';

    // The regulated-height defect (L-584), stated on the row it actually distorts.
    const heightNote = row.metric === 'height' && row.proposed !== null
        ? `<div style="color:#a49dbb;font-size:9.5px;margin-top:1px;">Measured from the project `
          + `datum, not from the rasant at the façade.</div>`
        : '';

    const localTerm = row.localTerm
        ? ` <span style="color:#a49dbb;">· ${escHtml(row.localTerm)}</span>`
        : '';

    return `<div data-testid="capacity-row" data-metric="${escHtml(row.metric)}"`
        + ` data-status="${escHtml(row.status)}"`
        + ` style="padding:5px 0;border-top:1px solid #efecf7;">`
        + `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">`
        + `<span style="color:#6b6480;">${escHtml(row.label)}${localTerm}</span>${statusChip(row.status)}`
        + `</div>`
        + `<div style="display:flex;justify-content:space-between;gap:10px;margin-top:2px;">`
        + `<span style="color:#6b6480;">Designed <b style="color:#2a2340;">`
        + `${escHtml(fmt(row.proposed, row.unit))}</b></span>`
        + `<span style="color:#6b6480;text-align:right;">Permitted <b style="color:#2a2340;">`
        + `${permittedText}</b></span>`
        + `</div>${headroom}${reasonLine}${heightNote}</div>`;
}

/**
 * §GIS-ENVELOPE-FULL-SECTIONS (L-1651) — embed options for hosting this section inside a
 * first-class card fold (`envelopeCardSections.buildDesignedVsPermittedFold`):
 *
 *  · `omitTitle` — the fold's own <summary> IS the heading, so the internal uppercase
 *    "Designed vs permitted" title would double up.
 *  · `omitMeasurementCaveats` — "How these were measured" is PROMOTED to its own fold on the
 *    card (`buildHowMeasuredFold`), which also covers the arms this internal block could never
 *    reach: `measurement.caveats` is legitimately `[]` for a nothing-authored project, so the
 *    `caveats.length > 0` gate below made the founder's "how is this measured" section
 *    UNREACHABLE in exactly the state their repro was in (L-1650 root cause 2).
 *
 * Both default to `false` so every existing caller renders byte-identically.
 */
export interface CapacitySectionEmbedOpts {
    readonly omitTitle?: boolean;
    readonly omitMeasurementCaveats?: boolean;
}

/**
 * Build the "Designed vs permitted" section.
 *
 * Returns `''` when there is no comparison to show — an absent section, never a placeholder that
 * could be read as "nothing to report" (the envelope card's own convention).
 */
export function buildCapacitySectionHtml(
    comparison: CapacityComparison | null,
    measurement: DesignMeasurement | null,
    opts?: CapacitySectionEmbedOpts,
): string {
    const span = _tracer.startSpan('pryzm.site.buildCapacitySectionHtml');
    try {
        if (!comparison || comparison.rows.length === 0) {
            span.setAttribute('pryzm.capacity.rendered', false);
            return '';
        }
        const verdict = resolveCapacityVerdict(comparison);
        const vs = VERDICT_STYLE[verdict.tone];

        const verdictBlock =
            `<div data-testid="capacity-verdict" data-tone="${escHtml(verdict.tone)}"`
            + ` style="margin-top:6px;padding:6px 8px;border-radius:6px;background:${vs.bg};`
            + `color:${vs.fg};font-size:10.5px;line-height:1.45;">`
            + `<b>${escHtml(verdict.headline)}</b>`
            + (verdict.qualifier
                ? `<div data-testid="capacity-qualifier" style="margin-top:2px;font-weight:500;">`
                  + `${escHtml(verdict.qualifier)}</div>`
                : '')
            + `</div>`;

        const rowsHtml = comparison.rows.map((r) => renderRow(r, measurement)).join('');

        const storeyNote = measurement !== null && measurement.designedStoreyCount > 0
            ? `<div style="color:#a49dbb;font-size:9.5px;margin-top:5px;">Measured across `
              + `${measurement.designedStoreyCount} designed storey`
              + `${measurement.designedStoreyCount === 1 ? '' : 's'}.</div>`
            : '';

        const caveats = !opts?.omitMeasurementCaveats && measurement !== null && measurement.caveats.length > 0
            ? `<details style="margin-top:6px;"><summary style="cursor:pointer;color:#6600FF;`
              + `font-size:10px;font-weight:600;list-style:none;">How these were measured</summary>`
              + renderMeasurementCaveatLinesHtml(measurement.caveats)
              + `</details>`
            : '';

        // The standing disclaimer. It is not decoration: without it a user reads a five-row check
        // as a building-code review. Rendered for EVERY tone, including `clear`.
        const footer =
            `<div data-testid="capacity-footer" style="margin-top:6px;color:#a49dbb;font-size:9.5px;`
            + `line-height:1.45;">Designed figures are measured from the authored model — nothing `
            + `is inferred, and a metric PRYZM cannot measure reads as not checked. This compares `
            + `only the metrics PRYZM holds a limit for; it is not a building-code review.</div>`;

        span.setAttribute('pryzm.capacity.rendered', true);
        span.setAttribute('pryzm.capacity.tone', verdict.tone);
        span.setAttribute('pryzm.capacity.unknownRows', comparison.unknownCount);
        span.setAttribute('pryzm.capacity.overRows', comparison.overCount);

        const title = opts?.omitTitle
            ? ''
            : `<div style="font-weight:700;font-size:10px;letter-spacing:.04em;text-transform:uppercase;`
              + `color:#6600FF;">Designed vs permitted</div>`;

        // Embedded in a fold, the fold's own border/summary already frames the section, so the
        // standalone top rule would render a doubled divider.
        const wrapStyle = opts?.omitTitle
            ? 'margin-top:2px;'
            : 'margin-top:10px;border-top:1px solid #efecf7;padding-top:8px;';

        return `<div data-testid="capacity-comparison" style="${wrapStyle}">`
            + `${title}`
            + `${verdictBlock}`
            + `<div style="font-size:11px;margin-top:4px;">${rowsHtml}</div>`
            + `${storeyNote}${caveats}${footer}</div>`;
    } finally {
        span.end();
    }
}
