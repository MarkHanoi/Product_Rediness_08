// §26.6 rule 3 (L-13046, founder 2026-09-07) — THE CONTROL that puts every intent BESIDE its ceiling
// on the Parcel Law tab, live, and refuses — never clamps — when it exceeds it.
//
// STR §26.6.0 rule 3 · §26.6.3 (3.1 levels and heights · 3.2 areas) · C58 §1.13 · C58 §1.19
// clause 4 · C58 §1.20 · C08 §3.1 · P4 · P6 · P8.
//
// ⛔ EVERY NUMBER ON THIS SECTION IS PRODUCED ELSEWHERE. THIS FILE COMPUTES NOTHING.
//   · the intent  → `collectIntendedAreas` (the ONE producer of the declared level areas, now with
//                    each storey's height), read off the SAME space-envelope store the 3-D scene
//                    renders from, through the SAME resolver `parcelLawQuantities` uses;
//   · the ceilings → `resolveParcelLawModel` (the ONE model) and, through the model,
//                    `resolveBrutAllowance` (the ONE total);
//   · the pairs and their verdicts → `buildIntentAgainstCeiling` (pure, 27 cases);
//   · the refusal sentence → `beyondCeilingStatement`, the founder's model sentence generalised.
//
// ⭐ ITS OWN LIVE CHANNEL, for the same reason the live-quantities section has one: the store's
// dirty channel (`subscribeDirty`) fires on execute, undo and redo alike, so a face drag that
// makes the ground plate overhang the footprint moves this section's refusal in the same frame the
// scene moves. A section that told the founder "within" a frame after he dragged past the ceiling
// would be the stale-figure defect this tab exists to remove.
//
// §26.6 rule 2 — every CEILING on this section is a HYPERLINK to its owner: the label is the same
// highlight control the fold and question 1 carry, so "Maximum height" here lights the limit plane
// exactly as the row that owns the figure does. One figure, one place; everywhere else links.
//
// ⛔ P6 — writes no store. ⛔ P4 — no `(window as any)`. C08 §3.1 — `createElement` + `textContent`
// only; storey names are user-authored and reach the DOM as text.

import { trace } from '@opentelemetry/api';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { readLevelCandidates } from '../site/adoptProposalAsEnvelope';
import { collectIntendedAreas } from '../site/intendedAreaChannel';
import {
    buildIntentAgainstCeiling,
    type IntentAgainstCeiling,
    type IntentPair,
} from '../site/intentAgainstCeilingModel';
import type { ParcelLawModel } from '../site/parcel/parcelLawModel';
import { resolveParcelLawModel } from '../site/parcel/resolveParcelLawModel';
import {
    describeSiteHighlightAvailability,
    getSiteHighlight,
    type SiteHighlightAvailability,
    type SiteHighlightFixedSubject,
} from '../site/siteGeometryHighlight';
import { buildSiteHighlightLabelEl } from '../site/siteHighlightRowControl';
import { resolveEnvelopeStore, type LiveEnvelopeStore } from './parcelLawQuantities';

const _tracer = trace.getTracer('pryzm.analysis.parcelLawIntentAgainstCeiling');

/** `data-testid` on the section root. */
export const INTENT_CEILING_TESTID = 'parcel-law-intent-ceiling';
/** `data-testid` prefix on every pair row: `parcel-law-intent-<pair id>`. */
export const INTENT_CEILING_ROW_PREFIX = 'parcel-law-intent-';
/** Attribute carrying the pair's verdict arm. */
export const INTENT_CEILING_VERDICT_ATTR = 'data-verdict';
/** `data-testid` on the unreadable-store sentence. */
export const INTENT_CEILING_UNREADABLE_TESTID = 'parcel-law-intent-ceiling-unreadable';
/** Carries how many store-driven repaints have run — read by the liveness spec. */
export const INTENT_CEILING_LIVE_ATTR = 'data-live-repaints';
/** Marks the INTENT figure of a pair, so a spec can prove the row still exposes both numbers. */
export const INTENT_CEILING_INTENT_FIGURE_ATTR = 'data-intent-figure';
/** Marks the CEILING figure of a pair — the other half of the same proof. */
export const INTENT_CEILING_CEILING_FIGURE_ATTR = 'data-ceiling-figure';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §PAIR-IS-ALIGNMENT-NOT-A-WORD (L-13077, founder 2026-09-07: *"there is still text on the
// incorrect format"*) — THE PAIR IS EXPRESSED BY THE LAYOUT. THE WORD IS NOT PRINTED.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// This section used to emit a literal grey uppercase `beside` between the two figures, inside a
// `1fr auto 1fr` grid. Two defects, one cause:
//
//   1. ⛔ *"Beside"* is the RELATIONSHIP §26.6.0 rule 3 asks the layout to EXPRESS — *"every intent
//      sits beside its ceiling"* — not a word it asks the card to say. Printing the name of a
//      relationship is what a layout does when it cannot show one. The founder read it as text in
//      the wrong format, which is exactly what it was.
//   2. ⛔ The three-column grid had no narrow arm. In his Analysis panel (~370–460 px, and the pane
//      is user-resizable) the right cell wrapped mid-phrase — `Maximum levels` / `6 storeys` on two
//      lines — while the left did not, so the two halves of ONE comparison rendered at different
//      apparent sizes and the row lost the symmetry that made it a comparison at all.
//
// ⭐ THE REPLACEMENT IS A SHARED NUMERIC COLUMN, which is how two magnitudes have been made
// comparable on paper for four centuries. The pair is TWO LINES, each a `minmax(0,1fr) auto` grid,
// so BOTH figures land on the SAME right edge, one directly above the other, at the same size and
// the same weight. The ceiling line carries a 2 px left rule; the intent line carries the same rule
// in `transparent`, so the two content boxes are identical widths and the figures cannot drift
// apart by the width of the rule. There is ONE layout at every width — nothing switches, nothing is
// tuned to a breakpoint, and there is no width at which the pair stops reading as a pair. Labels
// wrap inside their own cell (`overflow-wrap:anywhere`); figures never wrap (`white-space:nowrap`)
// and are `tabular-nums`, so the digits stack.
//
// ⛔ THE CEILING'S FIGURE IS THE SAME SIZE AND WEIGHT AS THE INTENT'S, DELIBERATELY. De-weighting
// the law's number would hide it just as effectively as deleting it, one step more deniably — the
// defect `parcelLawFacts.ts` already names for `not derived`. Only the ceiling's LABEL is stepped
// down, because it is long prose, never because it matters less.
//
// ── THE TYPE SCALE, AND WHY IT IS DECLARED HERE ─────────────────────────────────────────────
// The founder also read the figures as *"much larger than labels"*. Measured cause: the pair's two
// figures were the ONLY elements in this section carrying no `font-size`, so they fell through to
// the document default (16 px) while every label, lede, verdict and group heading around them was
// pinned at 9–11 px. `.anl-panel` / `#anl-surface` / `.anl-grid` set no base (they are not in
// `tokens.ts`'s `:where(...)` body-size list), so "inherit" here means 16. The card's scale was not
// overriding these literals — the opposite: the literals were pinned and the numbers never were.
//
// Two further facts made the old set of literals accidental rather than chosen:
//   · §UI-DENSITY-SCALE (`uiScale.ts`) transforms the ASSEMBLED STYLESHEET only. Inline `cssText`
//     px literals bypass the one density authority entirely, so this section could not move when
//     `UI_SCALE` moves — and it also bypassed that authority's `MIN_FONT_PX = 10` legibility floor
//     (C43 / WCAG 2.2 AA), which the old `9px` and `9.5px` literals sat below.
//   · Six unrelated literals (9 · 9.5 · 10 · 11) encode no ratio, so no reader could tell which
//     differences were meant.
// So the section declares ONE base and expresses every child as a ratio of it. Three steps, stated:
// figures at 1× · labels at {@link SCALE_LABEL} · prose at {@link SCALE_PROSE}. Nothing lands under
// 10 px, and changing the hierarchy is now one number.
/** The section's type base, in px. Every other size in this file is a ratio of it. */
const SCALE_BASE_PX = 11.5;
/** Labels — the long prose halves of a row. One step down from the figures they name. */
const SCALE_LABEL = '0.91em';
/** Prose — ledes, verdict sentences, group headings, per-storey lines. Two steps down. */
const SCALE_PROSE = '0.87em';
/** The rule that brackets a ceiling line to the intent above it. */
const PAIR_RULE = '#e4dff5';

export const INTENT_CEILING_TITLE = 'What I want to build — beside what I can';
export const INTENT_CEILING_LEDE =
    'Every intent below sits beside its ceiling. An intent that exceeds its ceiling is REFUSED with '
    + 'both numbers and left exactly as you declared it — PRYZM never clamps it. A ceiling the rule '
    + 'pack did not derive reads as not checkable, never as a pass.';

export interface ParcelLawIntentDeps {
    /** Production: `() => window.runtime` — resolved at each read, never captured. */
    readonly runtime: () => PryzmRuntime | null | undefined;
    /** Production: `window.bimManager.getLevels()`. */
    readonly readLevels: () => unknown;
    /** Production: `resolveParcelLawModel` — the ONE reader of the ONE model. */
    readonly readModel: (runtime: PryzmRuntime | null | undefined) => ParcelLawModel;
}

/** The production wiring. Resolved when CALLED, so a runtime composed after boot is seen. */
export function defaultParcelLawIntentDeps(): ParcelLawIntentDeps {
    const w = (typeof window !== 'undefined' ? window : {}) as unknown as {
        runtime?: PryzmRuntime | null;
        bimManager?: { getLevels?: () => unknown[] };
    };
    return {
        runtime: () => w.runtime ?? null,
        readLevels: () => {
            try { return w.bimManager?.getLevels?.() ?? []; } catch { return []; }
        },
        readModel: resolveParcelLawModel,
    };
}

export interface ParcelLawIntentHandle {
    readonly element: HTMLElement;
    repaint(): void;
    liveRepaintCount(): number;
    dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
    const n = document.createElement(tag);
    n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
}

const fmt = (n: number | null, unit: string, dp: number): string =>
    n === null ? 'not derived' : `${n.toFixed(dp)} ${unit}`;

/**
 * Render the section from a model. Exported so a spec can render a MODEL without a store.
 *
 * ⛔ THE CEILING'S LINK IS DECIDED BY THE ONE AVAILABILITY RULE from the same law model the
 * ceiling came from; this renderer never decides whether a limit plane can be drawn.
 */
export function buildIntentAgainstCeilingSection(
    model: IntentAgainstCeiling,
    law: ParcelLawModel,
): HTMLElement {
    const span = _tracer.startSpan('pryzm.analysis.buildIntentAgainstCeilingSection');
    try {
        const root = el('div', 'anl-plaw-intent-ceiling');
        root.setAttribute('data-testid', INTENT_CEILING_TESTID);
        // §PAIR-IS-ALIGNMENT-NOT-A-WORD — the ONE base every size below is a ratio of.
        root.style.cssText = `margin-top:10px;padding-top:8px;border-top:1px solid #efecf7;`
            + `min-width:0;max-width:100%;font-size:${SCALE_BASE_PX}px;line-height:1.45;`;
        const title = el('div', 'anl-plaw-intent-title', INTENT_CEILING_TITLE);
        title.style.cssText = 'font-weight:700;font-size:0.96em;';
        root.appendChild(title);
        const lede = el('div', 'anl-plaw-intent-lede', INTENT_CEILING_LEDE);
        lede.style.cssText = `margin:2px 0 6px;font-size:${SCALE_PROSE};line-height:1.5;opacity:0.8;`;
        root.appendChild(lede);

        if (!model.readable) {
            const miss = el('div', 'anl-plaw-absent', model.text);
            miss.setAttribute('data-testid', INTENT_CEILING_UNREADABLE_TESTID);
            miss.setAttribute('data-reason', model.reason);
            miss.style.cssText = `font-size:${SCALE_PROSE};line-height:1.55;`;
            root.appendChild(miss);
            return root;
        }

        // The availability decision, ONCE for the section, from the same model the ceilings are.
        // `footprintRingLength` is 3 when the model holds a solved footprint area (an area > 0 is
        // only ever measured over a ring of at least three vertices) and 0 when it holds none.
        const avail = describeSiteHighlightAvailability({
            parcelRingLength: law.geometry?.edgeCount ?? 0,
            edgeClassifications: law.edgeClassifications ?? undefined,
            footprintRingLength: law.massing?.footprintM2 !== null && law.massing?.footprintM2 !== undefined ? 3 : 0,
            maxHeightM: law.ordinance?.maxHeightM ?? null,
            gfaM2: law.massing?.gfaM2 ?? null,
        });
        const on = getSiteHighlight();

        // ⭐ ONE line shape for BOTH halves of a pair: label left (wraps inside its own cell),
        // figure right (never wraps, tabular). Identical grids ⇒ the two figures share one right
        // edge at every panel width, which is what makes the pair a COMPARISON without a word.
        // `ruleInk` is the only difference: the ceiling is bracketed, the intent's rule is
        // transparent so the two content boxes stay exactly the same width.
        const pairLine = (ruleInk: string): HTMLElement => {
            const line = el('div', 'anl-plaw-intent-line');
            line.style.cssText =
                'display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:8px;'
                + `align-items:baseline;min-width:0;border-left:2px solid ${ruleInk};padding-left:6px;`;
            return line;
        };
        const figure = (text: string, attr: string, muted: boolean): HTMLElement => {
            const v = el('span', 'anl-plaw-val', text);
            v.setAttribute(attr, muted ? 'absent' : 'present');
            // ⛔ SAME SIZE, SAME WEIGHT as its counterpart — see the header. A figure PRYZM does
            // not hold reads italic at a lighter weight because it is not a measurement, never
            // because it matters less.
            v.style.cssText = 'justify-self:end;white-space:nowrap;font-variant-numeric:tabular-nums;'
                + `font-weight:${muted ? '500' : '700'};${muted ? 'font-style:italic;opacity:0.85;' : ''}`;
            return v;
        };
        const labelCell = (node: HTMLElement): HTMLElement => {
            const c = el('span', 'anl-plaw-intent-label');
            c.style.cssText = `min-width:0;overflow-wrap:anywhere;font-size:${SCALE_LABEL};opacity:0.78;`;
            c.appendChild(node);
            return c;
        };

        const pairRow = (p: IntentPair): HTMLElement => {
            const row = el('div', 'anl-plaw-intent-row');
            row.setAttribute('data-testid', `${INTENT_CEILING_ROW_PREFIX}${p.id}`);
            row.setAttribute(INTENT_CEILING_VERDICT_ATTR, p.verdict.kind);
            row.style.cssText = 'padding:5px 0;border-top:1px solid rgba(0,0,0,0.06);min-width:0;';
            const head = el('div', 'anl-plaw-intent-head');
            head.style.cssText = 'display:grid;gap:1px;min-width:0;';

            // ── the INTENT line ──
            const intent = pairLine('transparent');
            intent.appendChild(labelCell(el('span', 'anl-plaw-key', p.label)));
            intent.appendChild(figure(
                p.intent === null ? '—' : `${p.intent.toFixed(p.dp)} ${p.unit}`,
                INTENT_CEILING_INTENT_FIGURE_ATTR,
                p.intent === null,
            ));
            head.appendChild(intent);

            // ── the CEILING line, directly beneath and bracketed to it ──
            // An exceeded ceiling takes the warning ink on its rule: the REFUSAL is already stated
            // in full below, so this only makes the row findable — it adds no claim of its own.
            const ceiling = pairLine(p.verdict.kind === 'exceeds'
                ? 'var(--app-status-warning-ink, #b45309)'
                : PAIR_RULE);
            // §26.6 rule 2 — the ceiling's NAME is the link to its owner.
            const subject: SiteHighlightFixedSubject | null = p.ceilingSubject;
            if (subject !== null) {
                const a: SiteHighlightAvailability = avail[subject];
                ceiling.appendChild(labelCell(buildSiteHighlightLabelEl(p.ceilingLabel, subject, a, on === subject)));
            } else {
                ceiling.appendChild(labelCell(el('span', 'anl-plaw-key', p.ceilingLabel)));
            }
            ceiling.appendChild(figure(
                fmt(p.ceiling, p.unit, p.dp),
                INTENT_CEILING_CEILING_FIGURE_ATTR,
                p.ceiling === null,
            ));
            head.appendChild(ceiling);
            row.appendChild(head);

            const verdict = el('div', 'anl-plaw-intent-verdict', p.verdict.sentence);
            verdict.style.cssText = `font-size:${SCALE_PROSE};line-height:1.5;margin-top:3px;padding-left:8px;`;
            if (p.verdict.kind === 'exceeds') verdict.style.fontWeight = '600';
            if (p.verdict.kind === 'ceiling-not-derived' || p.verdict.kind === 'no-intent' || p.verdict.kind === 'intent-unmeasurable') {
                verdict.style.fontStyle = 'italic';
            }
            row.appendChild(verdict);
            return row;
        };

        const group = (heading: string): HTMLElement => {
            const g = el('div', 'anl-plaw-intent-group');
            g.style.marginTop = '8px';
            const h = el('div', 'anl-plaw-group-name', heading);
            h.style.cssText = `font-weight:700;font-size:${SCALE_PROSE};letter-spacing:.04em;text-transform:uppercase;opacity:0.9;`;
            g.appendChild(h);
            root.appendChild(g);
            return g;
        };

        // ── 3.1 LEVELS AND HEIGHTS ──
        const g1 = group('3.1 · Levels and heights');
        g1.appendChild(pairRow(model.levels));
        g1.appendChild(pairRow(model.totalHeight));
        if (model.totalHeightBasis) {
            const basis = el('div', 'anl-plaw-intent-basis', model.totalHeightBasis);
            basis.setAttribute('data-testid', 'parcel-law-intent-height-basis');
            basis.style.cssText = `font-size:${SCALE_PROSE};line-height:1.5;opacity:0.75;margin-top:3px;padding-left:8px;`;
            g1.appendChild(basis);
        }
        if (model.heightsPerLevel.length > 0) {
            const list = el('div', 'anl-plaw-intent-heights');
            list.setAttribute('data-testid', 'parcel-law-intent-heights-per-level');
            list.style.cssText = 'margin-top:3px;padding-left:8px;min-width:0;';
            for (const l of model.heightsPerLevel) {
                // Same `minmax(0,1fr) auto` shape as a pair line, so the storey heights land on the
                // SAME right edge as the figures they break down — one numeric column per section.
                const line = el('div', 'anl-plaw-intent-height');
                line.style.cssText = `display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:8px;`
                    + `align-items:baseline;min-width:0;font-size:${SCALE_PROSE};opacity:0.85;`;
                const k = el('span', 'anl-plaw-key', `${l.name ?? `Storey ${l.levelId}`}${l.elevation !== null ? ` · ${l.elevation.toFixed(2)} m` : ''}`);
                k.style.cssText = 'min-width:0;overflow-wrap:anywhere;';
                line.appendChild(k);
                const v = el('span', 'anl-plaw-val', l.heightM === null ? 'no height declared' : `${l.heightM.toFixed(1)} m`);
                v.style.cssText = 'justify-self:end;white-space:nowrap;font-variant-numeric:tabular-nums;';
                line.appendChild(v);
                list.appendChild(line);
            }
            g1.appendChild(list);
        }

        // ── 3.2 AREAS ──
        const g2 = group('3.2 · Areas');
        g2.appendChild(pairRow(model.groundArea));
        // Every storey's plate is bounded by the implantation ceiling — the founder's *"per level,
        // the same pairing"*. The ground pair above is the FIRST of these, printed on its own
        // because he named it first; it is not repeated here.
        for (const p of model.areasPerLevel.slice(1)) g2.appendChild(pairRow(p));
        g2.appendChild(pairRow(model.totalArea));

        span.setAttribute('pryzm.intentCeiling.rows', root.querySelectorAll(`[${INTENT_CEILING_VERDICT_ATTR}]`).length);
        return root;
    } finally {
        span.end();
    }
}

/**
 * Mount the section into `host`. Never throws into the surface; every failure is a sentence.
 */
export function mountParcelLawIntentAgainstCeiling(
    host: HTMLElement,
    deps: ParcelLawIntentDeps = defaultParcelLawIntentDeps(),
): ParcelLawIntentHandle {
    const span = _tracer.startSpan('pryzm.analysis.mountParcelLawIntentAgainstCeiling');
    const root = el('div', 'anl-parcel-law-intent-ceiling-host');
    let disposed = false;
    let liveRepaints = 0;
    let unsub: (() => void) | null = null;

    const render = (): void => {
        if (disposed) return;
        try {
            const rt = deps.runtime();
            const store: LiveEnvelopeStore | null = resolveEnvelopeStore(rt);
            const levels = readLevelCandidates(deps.readLevels())
                .map((l) => ({ id: l.id, name: l.name, elevation: l.elevation }));
            const snapshot = collectIntendedAreas(store, levels);
            const law = deps.readModel(rt);
            root.replaceChildren(buildIntentAgainstCeilingSection(buildIntentAgainstCeiling(snapshot, law), law));
            root.setAttribute(INTENT_CEILING_LIVE_ATTR, String(liveRepaints));
        } catch (e) {
            console.warn('[analysis][parcel-law][intent-ceiling] render failed (non-fatal):', e);
            root.textContent =
                'The intent-beside-ceiling section could not render this pass. This is a failure of '
                + 'THIS section, not a finding about your project.';
        }
    };

    const subscribe = (): void => {
        if (unsub !== null) return;
        const store = resolveEnvelopeStore(deps.runtime());
        if (!store || typeof store.subscribeDirty !== 'function') return;
        try {
            unsub = store.subscribeDirty(() => {
                if (disposed || !root.isConnected) return;
                liveRepaints += 1;
                render();
            });
        } catch (e) {
            console.warn('[analysis][parcel-law][intent-ceiling] subscribe failed (non-fatal):', e);
        }
    };

    try {
        host.appendChild(root);
        render();
        subscribe();
        span.setAttribute('pryzm.intentCeiling.mounted', true);
    } catch (e) {
        span.setAttribute('pryzm.intentCeiling.mounted', false);
        console.warn('[analysis][parcel-law][intent-ceiling] mount failed (non-fatal):', e);
    } finally {
        span.end();
    }

    return {
        element: root,
        repaint(): void {
            if (disposed) return;
            // The runtime is late-injected on the live boot path; a repaint is the moment to
            // pick up a store that did not exist at mount.
            subscribe();
            render();
        },
        liveRepaintCount: () => liveRepaints,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            try { unsub?.(); } catch { /* teardown is best-effort */ }
            unsub = null;
            root.remove();
        },
    };
}
