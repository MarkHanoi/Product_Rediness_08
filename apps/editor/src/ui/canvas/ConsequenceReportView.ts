/**
 * ConsequenceReportView — R5 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md
 * (ADR-0322 §6 · STR-06 §15). The POST-mutation sibling of `ConsequencePreviewOverlay`:
 * that one renders the `ConsequencePlan` BEFORE a command runs; this one renders the
 * `ConsequenceReport` AFTER it ran.
 *
 * The plan doc's R5 names the sections this must carry, and it is that list — not this
 * file's convenience — that decides what appears below:
 *
 *   "Sections: changed / excluded / undetermined / regenerated / refused / validation /
 *    provenance(actor+origin) / **predicted-vs-actual**. `untouched` derived at report
 *    time."
 *
 * ── THREE RULES THAT GOVERN EVERY RENDERING DECISION HERE ─────────────────────────────
 *
 * 1. A DIVERGENCE IS VISIBLE, NEVER A CONSOLE LINE (STR-06 §2). `plan-fidelity-divergence`
 *    is a NAMED failure class, so it renders as a named, unmissable band at the TOP of the
 *    panel with its `unexpected` / `missing` sets spelled out. The view BRANCHES on
 *    `report.divergence.kind`; it never re-derives the verdict from set arithmetic over
 *    `predictedVsActual` (consequence.ts states this rule on the type itself).
 *
 * 2. UNDETERMINED NEVER RENDERS AS "NOTHING" (ADR-0322 §5). Every
 *    `undeterminedOutcomes[]` entry renders AS undetermined-at-plan-time, with the actual
 *    changes outside the prediction shown BESIDE it — not collapsed into right/wrong, not
 *    dropped because it is unscoreable. Likewise `validationUndetermined` and
 *    `metricsUndetermined`: where a channel could not be measured, the panel says the
 *    channel could not be measured, and prints NO zero. The known+unknown=[] defect is
 *    what this whole loop exists to make impossible; a renderer that silently shows an
 *    empty section reintroduces it at the last mile.
 *
 * 3. THE VIEW COMPUTES NOTHING. It renders the report it is given, or it renders that it
 *    has none. The ONE exception is `untouched`, and it is not an exception at all — the
 *    contract REQUIRES it to be derived at report time and never persisted (ADR-0322 §6),
 *    so deriving it here is obeying the contract rather than re-deriving a verdict. It is
 *    a set subtraction over sets the report already carries, labelled as derived. No
 *    re-reading of stores, no second inference pass, no recomputed divergence.
 *
 * ── WHY A DOM-ONLY RENDERER WITH NO ENGINE SINGLETONS ────────────────────────────────
 * Same idiom as the R3 overlay, for the same reason: this file imports the `ConsequenceReport`
 * TYPE and nothing else (`import type`, erased). It holds no runtime, reaches for no store,
 * and subscribes to nothing at construction — a caller hands it a report and it draws.
 * That keeps it testable in happy-dom with a literal report, and keeps the certification
 * gate able to drive the REAL renderer rather than a re-implementation of it.
 */

import type {
    ConsequenceReport,
    ExecutionConsequence,
    MetricTransition,
    UndeterminedImpact,
} from '@pryzm/command-bus';

const PANEL_ID = 'consequence-report-panel';

// ── Style ─────────────────────────────────────────────────────────────────────

function buildPanel(): HTMLElement {
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.style.cssText = [
        'position:fixed;right:18px;bottom:18px;z-index:9000;',
        'max-width:400px;max-height:70vh;overflow-y:auto;',
        'background:#1a2035;color:#e5e7eb;',
        'border-radius:10px;padding:14px 16px;font-size:12px;',
        'box-shadow:0 8px 32px rgba(0,0,0,0.4);',
        'border:1.5px solid rgba(102,0,255,0.45);',
        'font-family:var(--app-font,-apple-system,sans-serif);',
        'line-height:1.55;transition:opacity 0.12s;opacity:0;',
    ].join('');
    document.body.appendChild(el);
    return el;
}

function esc(s: string): string {
    return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

/** `12.4` — fixed to 1 dp, the founder's reading resolution for areas. */
function num(n: number): string {
    return n.toFixed(1);
}

/** The unit as it is WRITTEN, not as it is stored. `m2` is a type tag; `m²` is a unit. */
function unitLabel(unit: MetricTransition['unit']): string {
    switch (unit) {
        case 'm': return 'm';
        case 'm2': return 'm²';
        case 'm3': return 'm³';
        case 'count': return '';
    }
}

const head = (text: string, color: string): string =>
    `<div style="font-weight:700;color:${color};margin:8px 0 4px;">${text}</div>`;

const item = (text: string, color: string): string =>
    `<div style="color:${color};font-size:11px;margin-bottom:2px;">↳ ${text}</div>`;

const MORE = (n: number, what: string): string =>
    `<div style="color:#7a8aaa;font-size:11px;">+ ${n} more ${what}…</div>`;

/** Cap a list at `n` entries, appending an explicit "+N more" — never a silent truncation. */
function capped<T>(xs: readonly T[], n: number, render: (x: T) => string, what: string): string[] {
    const out = xs.slice(0, n).map(render);
    if (xs.length > n) out.push(MORE(xs.length - n, what));
    return out;
}

/**
 * Render ONE undetermined declaration — the shape used for plan-time blind spots and for
 * the report's own unmeasurable channels alike. Always prints the REASON: an undetermined
 * item without its reason is barely better than an empty section.
 */
function renderUndetermined(u: UndeterminedImpact): string {
    const detail = u.detail ? ` <span style="color:#a89a6a;">(${esc(u.detail)})</span>` : '';
    return item(`${esc(u.scope)} — <b>${esc(u.reason)}</b>${detail}`, '#fde68a');
}

// ── The report renderer ───────────────────────────────────────────────────────

/**
 * Render a {@link ConsequenceReport} into `panel`. PURE with respect to the report: it
 * reads, it never writes back, and it computes only the contract-mandated `untouched`
 * derivation.
 *
 * Exported so the certification gate and the unit suite drive THE renderer rather than a
 * copy of it — a gate that re-implements the thing it certifies proves nothing about the
 * thing that ships.
 */
export function renderConsequenceReport(panel: HTMLElement, report: ConsequenceReport): void {
    const L: string[] = [];
    const plan = report.plan;

    // ── Title ─────────────────────────────────────────────────────────────────
    L.push(
        `<div style="font-weight:700;color:#c4b5fd;margin-bottom:2px;">` +
        `${esc(plan.command.type)} — what changed</div>`,
    );
    L.push(`<div style="color:#7a8aaa;font-size:10px;margin-bottom:6px;">command ${esc(report.commandId)}</div>`);

    // ── 1. THE DIVERGENCE VERDICT — first, loud, and branched on `kind` ────────
    // STR-06 §2: plan-fidelity divergence is a named failure class. It is rendered as a
    // band, not a footnote, and the view NEVER computes the verdict itself.
    const d = report.divergence;
    if (d === undefined) {
        // An R1-era report carries no verdict. That is NOT "the plan agreed" — it is a
        // question this report never answered, and it says so.
        L.push(
            `<div style="background:#2a2438;border-left:3px solid #fbbf24;padding:6px 8px;border-radius:4px;margin-bottom:6px;color:#fde68a;">` +
            `<b>NO DIVERGENCE VERDICT</b> — this report carries none; whether prediction matched reality was not decided. ` +
            `Not an agreement.</div>`,
        );
    } else if (d.kind === 'plan-fidelity-divergence') {
        const lines = [
            `<div style="background:#3a1f24;border-left:3px solid #f87171;padding:6px 8px;border-radius:4px;margin-bottom:6px;">`,
            `<div style="font-weight:700;color:#fca5a5;">✕ PLAN-FIDELITY DIVERGENCE</div>`,
            `<div style="color:#fca5a5;font-size:11px;">the plan and reality disagree — this is a named failure class, not a warning</div>`,
        ];
        if (d.unexpected.length > 0) {
            lines.push(`<div style="color:#fca5a5;font-size:11px;margin-top:4px;">changed but NOT predicted (${d.unexpected.length}):</div>`);
            lines.push(...capped(d.unexpected, 6, (id) => item(esc(id), '#fca5a5'), 'unexpected'));
        }
        if (d.missing.length > 0) {
            lines.push(`<div style="color:#fca5a5;font-size:11px;margin-top:4px;">predicted but did NOT change (${d.missing.length}):</div>`);
            lines.push(...capped(d.missing, 6, (id) => item(esc(id), '#fca5a5'), 'missing'));
        }
        lines.push('</div>');
        L.push(lines.join(''));
    } else {
        L.push(
            `<div style="background:#1e2f26;border-left:3px solid #34d399;padding:6px 8px;border-radius:4px;margin-bottom:6px;color:#6ee7b7;">` +
            `✓ <b>PLAN AGREED</b> — every element that changed was predicted, and every prediction happened.</div>`,
        );
    }

    // ── 2. PREDICTED vs ACTUAL — the numbers behind the verdict ────────────────
    L.push(head('◆ predicted vs actual', '#a78bfa'));
    L.push(item(`predicted ${plan.changed.length} change(s) · actually changed ${report.actual.changed.length}`, '#ddd6fe'));
    L.push(...capped(report.actual.changed, 6, (id) => item(esc(id), '#ddd6fe'), 'changed'));
    if (report.predictedVsActual.undeterminedResolved.length > 0) {
        L.push(item(
            `${report.predictedVsActual.undeterminedResolved.length} blind-spot item(s) turned out to change (not a divergence — the plan was honest about not knowing)`,
            '#fde68a',
        ));
    }

    // ── 3. METRICS — before → after, with units ────────────────────────────────
    // The R5 typed field. PREDICTED lives on `plan.metrics`; ACTUAL on `report.metrics`.
    // Where the actual channel could not be measured, that is SAID — never a zero.
    const predicted = plan.metrics ?? [];
    const actualMetrics = report.metrics;
    if (predicted.length > 0 || actualMetrics !== undefined || report.metricsUndetermined !== undefined) {
        L.push(head('◆ metrics', '#a78bfa'));
        const actualByKey = new Map<string, MetricTransition>();
        for (const m of actualMetrics ?? []) actualByKey.set(`${m.elementId} ${m.metric}`, m);

        for (const m of predicted) {
            const u = unitLabel(m.unit);
            const before = m.before === undefined ? 'not recorded' : `${num(m.before)}${u ? ' ' + u : ''}`;
            const after = `${num(m.after)}${u ? ' ' + u : ''}`;
            const act = actualByKey.get(`${m.elementId} ${m.metric}`);
            // The measured value beside the predicted one — the metric half of
            // predicted-vs-actual. Absent ⇒ nothing is claimed about the actual.
            const measured = act === undefined
                ? ''
                : ` · <span style="color:#6ee7b7;">measured ${num(act.after)}${u ? ' ' + u : ''}</span>`;
            L.push(item(`${esc(m.elementId)} ${esc(m.metric)}: <b>${before} → ${after}</b> (predicted)${measured}`, '#ddd6fe'));
        }
        // Measured metrics with no prediction — visible, not dropped.
        for (const m of actualMetrics ?? []) {
            if (predicted.some((p) => p.elementId === m.elementId && p.metric === m.metric)) continue;
            const u = unitLabel(m.unit);
            L.push(item(`${esc(m.elementId)} ${esc(m.metric)}: measured <b>${num(m.after)}${u ? ' ' + u : ''}</b> — not predicted`, '#fde68a'));
        }
        if (report.metricsUndetermined) {
            L.push(item('actual metrics NOT MEASURED in this runtime:', '#fbbf24'));
            L.push(renderUndetermined(report.metricsUndetermined));
        }
    }

    // ── 4. UNDETERMINED-AT-PLAN-TIME — carried, never scored, never dropped ────
    const outcomes = report.undeterminedOutcomes;
    if (outcomes === undefined) {
        if (plan.undetermined.length > 0) {
            // The plan declared blind spots and the report reconciled none of them. Saying
            // so is the whole point: an unreconciled blind spot must not vanish.
            L.push(head(`? ${plan.undetermined.length} plan blind spot(s) — NOT RECONCILED by this report`, '#fbbf24'));
            L.push(...capped(plan.undetermined, 4, renderUndetermined, 'undetermined'));
        }
    } else if (outcomes.length > 0) {
        L.push(head(`? ${outcomes.length} impact(s) UNDETERMINED at plan time`, '#fbbf24'));
        L.push(item('these cannot be scored right or wrong — the plan was honest about not knowing. What actually happened is shown beside each.', '#a89a6a'));
        for (const o of outcomes.slice(0, 4)) {
            L.push(renderUndetermined(o.item));
            const outside = o.actualChangedOutsidePrediction;
            L.push(item(
                outside.length === 0
                    ? '<i>actually changed outside the prediction: none</i>'
                    : `<i>actually changed outside the prediction: ${esc(outside.slice(0, 4).join(', '))}${outside.length > 4 ? ` +${outside.length - 4}` : ''}</i>`,
                '#a89a6a',
            ));
        }
        if (outcomes.length > 4) L.push(MORE(outcomes.length - 4, 'undetermined'));
    }

    // ── 5. REGENERATED / REFUSED / VALIDATION ─────────────────────────────────
    L.push(head('◆ regenerated', '#a78bfa'));
    const regen = report.actual.regenerated;
    L.push(regen.length === 0
        ? item('none measured — this runtime has no regeneration read-back channel (see the blind spots above)', '#a89a6a')
        : item(regen.slice(0, 6).map(esc).join(', ') + (regen.length > 6 ? ` +${regen.length - 6}` : ''), '#ddd6fe'));

    if (plan.refused.length > 0) {
        L.push(head(`✕ ${plan.refused.length} refused`, '#f87171'));
        L.push(...capped(plan.refused, 4, (r) => item(`${r.elementId ? esc(r.elementId) + ': ' : ''}${esc(r.reason)}`, '#fca5a5'), 'refused'));
    }

    L.push(head('◆ validation', '#a78bfa'));
    if (report.validationUndetermined) {
        // The empty delta beside this is a PLACEHOLDER, and the panel must not print it as
        // a determination. The undetermined line replaces the counts entirely.
        L.push(item('NOT MEASURED:', '#fbbf24'));
        L.push(renderUndetermined(report.validationUndetermined));
    } else {
        const c = report.validation.violationsCreated;
        const r = report.validation.violationsResolved;
        if (c.length === 0 && r.length === 0) {
            L.push(item('no violation changed', '#a89a6a'));
        } else {
            for (const v of c.slice(0, 4)) L.push(item(`▲ NEW ${esc(v.ruleId)}${v.elementId ? ' · ' + esc(v.elementId) : ''}${v.message ? ' — ' + esc(v.message) : ''}`, '#fbbf24'));
            for (const v of r.slice(0, 4)) L.push(item(`✓ resolved ${esc(v.ruleId)}${v.elementId ? ' · ' + esc(v.elementId) : ''}`, '#34d399'));
        }
    }

    // ── 6. EXCLUDED + the DERIVED untouched (ADR-0322 §6) ─────────────────────
    // `untouched` = scope − changed − excluded − undetermined, derived HERE and never
    // persisted. The contract requires the derivation to happen at report time; it is a
    // subtraction over sets the report already carries, not a new inference.
    const scope = new Set<string>([
        ...plan.changed, ...plan.excluded, ...report.actual.changed,
        ...(plan.direct.kind === 'determined' ? plan.direct.elements : []),
        ...(plan.indirect.kind === 'determined' ? plan.indirect.elements : []),
    ]);
    for (const id of plan.changed) scope.delete(id);
    for (const id of report.actual.changed) scope.delete(id);
    for (const id of plan.excluded) scope.delete(id);
    const untouchedCount = scope.size;
    L.push(
        `<div style="color:#4b5563;font-size:10px;margin-top:8px;">` +
        `${plan.excluded.length} considered unchanged · ${untouchedCount} untouched (derived, never stored)</div>`,
    );

    // ── 7. PROVENANCE — actor + origin (ADR-0324 §1–2, kept SEPARATE) ─────────
    const p = report.provenance;
    const originTxt = p.origin ? ` · via ${esc(p.origin.surface)}${p.origin.proposalId ? ` (proposal ${esc(p.origin.proposalId)})` : ''}` : '';
    const approvalTxt = p.approval ? ` · approved by ${esc(p.approval.approvedBy)}` : '';
    L.push(
        `<div style="color:#4b5563;font-size:10px;">` +
        `by ${esc(p.actor.kind)}${p.actor.id ? ' ' + esc(p.actor.id) : ''}${originTxt}${approvalTxt}</div>`,
    );

    panel.innerHTML = L.join('');
}

/**
 * Render the ABSENCE of a report. Called when the view is asked to show something it does
 * not have — and it says exactly that rather than drawing a confident blank. A panel that
 * renders empty on no-report is indistinguishable from a panel that renders empty on
 * "nothing changed", which is the known-vs-unknown collapse the whole contract forbids.
 *
 * `detail` carries the typed reason when one exists (`NO_PLAN_SUPPLIED`, `PLAN_STALE`).
 */
export function renderNoReport(panel: HTMLElement, detail: string): void {
    panel.innerHTML =
        `<div style="font-weight:700;color:#fbbf24;margin-bottom:4px;">NO CONSEQUENCE REPORT</div>` +
        `<div style="color:#fde68a;font-size:11px;">${esc(detail)}</div>` +
        `<div style="color:#a89a6a;font-size:10px;margin-top:6px;">` +
        `This is not "nothing changed" — it is the absence of a prediction to reconcile against. ` +
        `No predicted-vs-actual claim is made here.</div>`;
}

// ── ConsequenceReportView ─────────────────────────────────────────────────────

export class ConsequenceReportView {
    private readonly _panel: HTMLElement;
    private _visible = false;

    constructor() {
        this._panel = buildPanel();
    }

    /** The live panel element — exposed so tests and the gate can read what SHIPPED. */
    get element(): HTMLElement {
        return this._panel;
    }

    get visible(): boolean {
        return this._visible;
    }

    /** Render a report. */
    show(report: ConsequenceReport): void {
        renderConsequenceReport(this._panel, report);
        this._reveal();
    }

    /** Render the typed ABSENCE of a report — never a blank panel. */
    showAbsence(detail: string): void {
        renderNoReport(this._panel, detail);
        this._reveal();
    }

    /**
     * THE WIRING SEAM — hand this the `ExecutionConsequence` the R4
     * `ConsequenceExecutionService` returns and it renders the right thing for each arm.
     * The three arms exist precisely so neither staleness nor plan-less dispatch is ever
     * dressed up as a reconciled prediction (consequence.ts), and this method is where
     * that distinction reaches the screen instead of dying in a `switch` nobody sees.
     */
    showConsequence(consequence: ExecutionConsequence): void {
        if (consequence.kind === 'reconciled') {
            this.show(consequence.report);
            return;
        }
        if (consequence.kind === 'plan-stale') {
            const r = consequence.refusal;
            this.showAbsence(
                `The plan was REFUSED as stale (${r.kind}): planned hash ${r.plannedPlanHash} vs live ${r.livePlanHash}. ` +
                `The command still executed, and ${consequence.actual.changed.length} element(s) changed — ` +
                `but the stale plan is evidence, never a prediction, so nothing is reconciled against it.`,
            );
            return;
        }
        this.showAbsence(
            `Executed with no plan (${consequence.prediction.reason}). ` +
            `${consequence.actual.changed.length} element(s) changed by independent read-back. ` +
            `No prediction was made, so none is invented after the fact.`,
        );
    }

    hide(): void {
        if (!this._visible) return;
        this._panel.style.opacity = '0';
        this._visible = false;
    }

    private _reveal(): void {
        this._panel.style.opacity = '1';
        this._visible = true;
    }
}
