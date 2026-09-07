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
        root.style.cssText = 'margin-top:10px;padding-top:8px;border-top:1px solid #efecf7;min-width:0;max-width:100%;';
        const title = el('div', 'anl-plaw-intent-title', INTENT_CEILING_TITLE);
        title.style.cssText = 'font-weight:700;font-size:11px;';
        root.appendChild(title);
        const lede = el('div', 'anl-plaw-intent-lede', INTENT_CEILING_LEDE);
        lede.style.cssText = 'margin:2px 0 6px;font-size:9.5px;line-height:1.45;opacity:0.8;';
        root.appendChild(lede);

        if (!model.readable) {
            const miss = el('div', 'anl-plaw-absent', model.text);
            miss.setAttribute('data-testid', INTENT_CEILING_UNREADABLE_TESTID);
            miss.setAttribute('data-reason', model.reason);
            miss.style.cssText = 'font-size:10px;line-height:1.5;';
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

        const ceilingCell = (p: IntentPair): HTMLElement => {
            const cell = el('span', 'anl-plaw-intent-ceiling-cell');
            cell.style.cssText = 'text-align:right;font-variant-numeric:tabular-nums;';
            const value = el('span', 'anl-plaw-val', fmt(p.ceiling, p.unit, p.dp));
            value.style.fontWeight = '700';
            if (p.ceiling === null) { value.style.fontStyle = 'italic'; value.style.fontWeight = '500'; }
            // §26.6 rule 2 — the ceiling's NAME is the link to its owner.
            const subject: SiteHighlightFixedSubject | null = p.ceilingSubject;
            if (subject !== null) {
                const a: SiteHighlightAvailability = avail[subject];
                cell.appendChild(buildSiteHighlightLabelEl(p.ceilingLabel, subject, a, on === subject));
            } else {
                cell.appendChild(el('span', 'anl-plaw-key', p.ceilingLabel));
            }
            cell.appendChild(document.createTextNode(' '));
            cell.appendChild(value);
            return cell;
        };

        const pairRow = (p: IntentPair): HTMLElement => {
            const row = el('div', 'anl-plaw-intent-row');
            row.setAttribute('data-testid', `${INTENT_CEILING_ROW_PREFIX}${p.id}`);
            row.setAttribute(INTENT_CEILING_VERDICT_ATTR, p.verdict.kind);
            row.style.cssText = 'padding:4px 0;border-top:1px solid rgba(0,0,0,0.06);';
            const head = el('div', 'anl-plaw-intent-head');
            head.style.cssText = 'display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:baseline;';
            const intent = el('span', 'anl-plaw-intent-intent');
            intent.appendChild(el('span', 'anl-plaw-key', `${p.label} `));
            const iv = el('span', 'anl-plaw-val', p.intent === null ? '—' : `${p.intent.toFixed(p.dp)} ${p.unit}`);
            iv.style.fontWeight = '600';
            intent.appendChild(iv);
            head.appendChild(intent);
            const beside = el('span', 'anl-plaw-intent-beside', 'beside');
            beside.style.cssText = 'font-size:9px;opacity:0.6;letter-spacing:.06em;text-transform:uppercase;';
            head.appendChild(beside);
            head.appendChild(ceilingCell(p));
            row.appendChild(head);
            const verdict = el('div', 'anl-plaw-intent-verdict', p.verdict.sentence);
            verdict.style.cssText = 'font-size:10px;line-height:1.45;margin-top:2px;';
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
            h.style.cssText = 'font-weight:700;font-size:10px;letter-spacing:.04em;text-transform:uppercase;';
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
            basis.style.cssText = 'font-size:9.5px;line-height:1.4;opacity:0.75;margin-top:2px;';
            g1.appendChild(basis);
        }
        if (model.heightsPerLevel.length > 0) {
            const list = el('div', 'anl-plaw-intent-heights');
            list.setAttribute('data-testid', 'parcel-law-intent-heights-per-level');
            list.style.cssText = 'margin-top:3px;padding-left:10px;';
            for (const l of model.heightsPerLevel) {
                const line = el('div', 'anl-plaw-intent-height');
                line.style.cssText = 'display:flex;justify-content:space-between;gap:8px;font-size:9.5px;opacity:0.85;';
                line.appendChild(el('span', 'anl-plaw-key', `${l.name ?? `Storey ${l.levelId}`}${l.elevation !== null ? ` · ${l.elevation.toFixed(2)} m` : ''}`));
                line.appendChild(el('span', 'anl-plaw-val', l.heightM === null ? 'no height declared' : `${l.heightM.toFixed(1)} m`));
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
