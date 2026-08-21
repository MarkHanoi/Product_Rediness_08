/**
 * MedicionesBucket — the MEDICIONES lifecycle bucket: take-off, 4D, 5D, 6D.
 *
 * Layer Affected:   UI — Data Workbench › Mediciones Bucket (L7)
 * File:             apps/editor/src/ui/dataworkbench/buckets/MedicionesBucket.ts
 * Contract:         C66 §1.1 by analogy · C84 EI-11 · ADR-0343 §MEDICIONES
 * Engine:           @pryzm/core-app-model — `computeTakeoff()` / `applyRates()`
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ THE RULE THIS SURFACE IS BUILT AROUND
 * ─────────────────────────────────────────────────────────────────────────────
 * Two of these four tabs are NOT BUILT, and they say so on their own face, in
 * the product, with the reason and the missing input named. They do not render a
 * plausible number. A cost or a carbon figure gets believed and quoted; an
 * invented one is worse than an absent one, and "authored, reachable, and
 * incapable of holding an answer" is the exact defect shape this lane was opened
 * to stop repeating.
 *
 *   Take-off (mediciones)  — BUILT.  Real, element-traceable, opening-net.
 *   5D Cost                — BUILT.  Rates come from the USER. Zero ship with it.
 *   4D Time                — NOT BUILT. Panel states what is missing.
 *   6D Carbon              — NOT BUILT. Panel states what is missing.
 *
 * `escapeHtml` is applied to every model-derived string before it reaches
 * innerHTML — element ids, finish names and material ids all originate in
 * imported IFC/glTF files (§DW-MATERIAL-COLOR-XSS, L-407).
 */

import {
    computeTakeoff,
    applyRates,
    takeoffToCsv,
    costedTakeoffToCsv,
    rateBookToCsv,
    parseRateCsv,
    UNIT_LABEL,
    TAKEOFF_CHAPTERS,
    type TakeoffResult,
    type TakeoffLine,
    type RateEntry,
    type RateBook,
} from '@pryzm/core-app-model';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import { escapeHtml } from './DWHelpers';

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime | null;

// ── Rate book storage ─────────────────────────────────────────────────────────
//
// ⚠ STATED, NOT HIDDEN: rates live in THIS BROWSER's localStorage, keyed by
// project id. They are NOT part of the project file, they do NOT sync between
// collaborators, and they are NOT covered by undo. The panel says all three on
// its own face — a persistence claim the code cannot honour is the same defect
// class as an invented rate.

const RATE_STORE_PREFIX = 'pryzm.mediciones.rates.';

function rateKey(runtime: Runtime): string {
    return RATE_STORE_PREFIX + (runtime?.projectContext?.projectId ?? 'unscoped');
}

function loadRateBook(runtime: Runtime): RateBook {
    try {
        const raw = localStorage.getItem(rateKey(runtime));
        if (!raw) return { currency: 'EUR', entries: [] };
        const parsed = JSON.parse(raw) as Partial<RateBook>;
        return {
            currency: typeof parsed.currency === 'string' && parsed.currency ? parsed.currency : 'EUR',
            entries: Array.isArray(parsed.entries) ? (parsed.entries as RateEntry[]) : [],
        };
    } catch {
        return { currency: 'EUR', entries: [] };
    }
}

function saveRateBook(runtime: Runtime, book: RateBook): void {
    try { localStorage.setItem(rateKey(runtime), JSON.stringify(book)); }
    catch (e) { console.warn('[Mediciones] rate book could not be saved to this browser:', e); }
}

// ── Small shared bits ─────────────────────────────────────────────────────────

const NUM = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmt(n: number): string { return NUM.format(n); }

function chapterLabel(id: string): { label: string; labelEs: string; order: number } {
    const c = TAKEOFF_CHAPTERS.find((x) => x.id === id);
    return c ? { label: c.label, labelEs: c.labelEs, order: c.order } : { label: id, labelEs: '', order: 99 };
}

function download(filename: string, text: string): void {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const HEADER_CSS = 'padding:14px 16px;border-bottom:1px solid var(--app-border);flex-shrink:0;';
const BTN = 'dw-toolbar-btn';

function toolbarButton(action: string, label: string, title: string): string {
    return `<button type="button" class="${BTN}" data-action="${action}" title="${escapeHtml(title)}">${escapeHtml(label)}</button>`;
}

/** The measured/not-measured ledger. Rendered on BOTH built tabs, never hidden. */
function coverageBlock(result: TakeoffResult): string {
    const order = { NOT_MEASURED: 0, COUNTED_ONLY: 1, MEASURED: 2 } as const;
    const rows = [...result.coverage].sort((a, b) => order[a.state] - order[b.state]);
    const notMeasured = rows.filter((r) => r.state === 'NOT_MEASURED').length;
    const badge = (state: string): string => {
        const map: Record<string, [string, string]> = {
            MEASURED:     ['#1D7A4B', 'rgba(29,122,75,.10)'],
            COUNTED_ONLY: ['#8A6100', 'rgba(138,97,0,.10)'],
            NOT_MEASURED: ['#B3261E', 'rgba(179,38,30,.10)'],
        };
        const [fg, bg] = map[state] ?? ['#555', 'rgba(0,0,0,.06)'];
        return `<span style="font-size:9px;font-weight:800;letter-spacing:.06em;color:${fg};background:${bg};border-radius:99px;padding:2px 7px;white-space:nowrap;">${escapeHtml(state.replace('_', ' '))}</span>`;
    };
    return `
        <section style="margin-top:20px;border-top:2px solid var(--app-border);padding-top:14px;">
            <h4 style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">Coverage — what is measured, and what is not</h4>
            <div style="font-size:11px;line-height:1.6;color:var(--app-text-muted);margin-bottom:10px;">
                ${notMeasured} of ${rows.length} families are <strong>NOT MEASURED</strong>. They contribute
                <strong>no line above</strong> — they are absent from the take-off, not zero in it.
                A <em>medición</em> is a document an architect signs; this table is what makes the one above signable.
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
                ${rows.map((r) => `
                    <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border:1px solid var(--app-border);border-radius:8px;background:var(--app-panel-bg);">
                        <div style="min-width:150px;font-size:11px;font-weight:700;color:var(--app-text);">${escapeHtml(r.family)}</div>
                        <div style="flex-shrink:0;">${badge(r.state)}</div>
                        <div style="font-size:10px;line-height:1.55;color:var(--app-text-muted);">${escapeHtml(r.note)}</div>
                    </div>`).join('')}
            </div>
        </section>`;
}

function unreadableBanner(result: TakeoffResult): string {
    if (result.unreadableStores.length === 0) return '';
    return `
        <div style="margin:0 0 12px;padding:10px 12px;border:1px solid rgba(179,38,30,.35);border-radius:8px;background:rgba(179,38,30,.06);font-size:11px;line-height:1.6;color:var(--app-text);">
            <strong>${result.unreadableStores.length} element store${result.unreadableStores.length === 1 ? ' was' : 's were'} not reachable</strong>
            when this take-off ran: ${escapeHtml(result.unreadableStores.join(', '))}.
            Those families are marked NOT MEASURED below. This is different from "the project has none of them".
        </div>`;
}

function secondaryChips(line: TakeoffLine): string {
    if (line.secondary.length === 0) return '';
    return `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;">
        ${line.secondary.map((s) => `<span style="font-size:9.5px;color:var(--app-text-muted);background:var(--app-bg);border:1px solid var(--app-border);border-radius:99px;padding:1px 7px;">${escapeHtml(s.label)} ${escapeHtml(fmt(s.value))} ${escapeHtml(UNIT_LABEL[s.unit])}</span>`).join('')}
    </div>`;
}

function qualifierBlock(line: TakeoffLine): string {
    if (line.qualifiers.length === 0) return '';
    return `<div style="margin-top:5px;font-size:9.5px;line-height:1.5;color:#8A6100;">
        ${line.qualifiers.map((q) => `⚠ ${escapeHtml(q)}`).join('<br>')}
    </div>`;
}

/** The element-id disclosure — this is what makes a row checkable. */
function traceBlock(line: TakeoffLine): string {
    return `<details style="margin-top:5px;">
        <summary style="font-size:9.5px;color:var(--app-accent);cursor:pointer;">${line.elementIds.length} element${line.elementIds.length === 1 ? '' : 's'} measured</summary>
        <div style="margin-top:4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:9px;line-height:1.6;color:var(--app-text-muted);word-break:break-all;max-height:110px;overflow:auto;">${escapeHtml(line.elementIds.join('  '))}</div>
    </details>`;
}

function emptyState(icon: string, title: string, body: string): string {
    return `
        <div style="height:100%;display:flex;align-items:center;justify-content:center;padding:28px;">
            <div style="max-width:340px;text-align:center;">
                <div class="dw-placeholder-icon">${icon}</div>
                <div style="font-weight:700;font-size:14px;color:var(--app-text);margin:8px 0;">${escapeHtml(title)}</div>
                <div style="font-size:12px;line-height:1.7;color:var(--app-text-muted);">${body}</div>
            </div>
        </div>`;
}

// ── TAKE-OFF (mediciones) ─────────────────────────────────────────────────────

/**
 * Mount the take-off panel. Recomputes from the live element stores on every
 * call, so a stale number cannot outlive an edit.
 */
export function mountTakeoffPanel(panel: HTMLElement, runtime: Runtime): void {
    withHandlerSpan('pryzm.mediciones.takeoff.render', { 'pryzm.surface': 'dataworkbench.mediciones.takeoff' }, () => {
        renderTakeoff(panel, runtime);
    });
}

function renderTakeoff(panel: HTMLElement, runtime: Runtime): void {
    let result: TakeoffResult;
    try {
        result = computeTakeoff();
    } catch (e) {
        panel.innerHTML = emptyState('∑', 'The take-off could not run',
            `<code style="font-size:11px;">${escapeHtml(e instanceof Error ? e.message : String(e))}</code><br><br>No quantity is shown, because a take-off that half-ran is worse than none.`);
        console.error('[Mediciones] computeTakeoff threw:', e);
        return;
    }

    const byChapter = new Map<string, TakeoffLine[]>();
    for (const l of result.lines) {
        const arr = byChapter.get(l.chapter) ?? [];
        arr.push(l);
        byChapter.set(l.chapter, arr);
    }
    const chapters = [...byChapter.entries()].sort((a, b) => chapterLabel(a[0]).order - chapterLabel(b[0]).order);

    panel.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
            <div style="${HEADER_CSS}">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:15px;font-weight:800;color:var(--app-text);">Mediciones — Quantity take-off</span>
                    <span style="font-size:10px;background:rgba(102,0,255,.10);color:var(--app-accent);border-radius:99px;padding:2px 9px;font-weight:700;">${result.lines.length} lines</span>
                    <span style="font-size:10px;color:var(--app-text-muted);">${result.measuredElementCount} elements measured</span>
                    <span style="margin-left:auto;display:flex;gap:6px;">
                        ${toolbarButton('mz-refresh', 'Recompute', 'Re-measure from the current model')}
                        ${toolbarButton('mz-csv', 'Export CSV', 'Download the take-off, its measurement bases and its coverage table')}
                    </span>
                </div>
                <div style="font-size:10.5px;color:var(--app-text-muted);margin-top:6px;line-height:1.6;">
                    Measured ${escapeHtml(new Date(result.generatedAt).toLocaleTimeString())} from the live model.
                    Wall areas are <strong>net of openings</strong>, deducted with the same outline producer that cuts the mesh —
                    an arched window deducts the arch, not its bounding box.
                </div>
            </div>
            <div style="flex:1;overflow:auto;padding:14px 16px;">
                ${unreadableBanner(result)}
                ${result.lines.length === 0 ? `
                    <div style="padding:26px;text-align:center;border:1px dashed var(--app-border);border-radius:10px;">
                        <div style="font-size:13px;font-weight:700;color:var(--app-text);margin-bottom:6px;">Nothing to measure yet</div>
                        <div style="font-size:11.5px;line-height:1.7;color:var(--app-text-muted);max-width:380px;margin:0 auto;">
                            The element stores were read and contain no measurable geometry.
                            This is a real answer — not a failure — and the coverage table below says which families were read.
                        </div>
                    </div>` : chapters.map(([id, lines]) => {
                        const c = chapterLabel(id);
                        return `
                        <section style="margin-bottom:18px;">
                            <div style="display:flex;align-items:baseline;gap:8px;padding-bottom:6px;border-bottom:2px solid var(--app-accent);margin-bottom:8px;">
                                <h4 style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">${escapeHtml(c.label)}</h4>
                                <span style="font-size:10px;color:var(--app-text-muted);font-style:italic;">${escapeHtml(c.labelEs)}</span>
                                <span style="margin-left:auto;font-size:10px;color:var(--app-text-muted);">${lines.length} line${lines.length === 1 ? '' : 's'}</span>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:7px;">
                                ${lines.map((l) => `
                                    <article style="padding:9px 11px;border:1px solid var(--app-border);border-radius:9px;background:var(--app-panel-bg);">
                                        <div style="display:flex;gap:12px;align-items:flex-start;">
                                            <div style="flex:1;min-width:0;">
                                                <div style="font-size:12px;font-weight:700;color:var(--app-text);">${escapeHtml(l.description)}</div>
                                                <div style="font-size:9px;font-family:ui-monospace,Menlo,Consolas,monospace;color:var(--app-text-muted);margin-top:2px;">${escapeHtml(l.code)}</div>
                                                <div style="font-size:9.5px;line-height:1.55;color:var(--app-text-muted);margin-top:4px;">${escapeHtml(l.basis)}</div>
                                                ${qualifierBlock(l)}
                                                ${secondaryChips(l)}
                                                ${traceBlock(l)}
                                            </div>
                                            <div style="text-align:right;white-space:nowrap;">
                                                <div style="font-size:16px;font-weight:800;color:var(--app-text);">${escapeHtml(fmt(l.quantity))}</div>
                                                <div style="font-size:10px;color:var(--app-text-muted);">${escapeHtml(UNIT_LABEL[l.unit])}</div>
                                            </div>
                                        </div>
                                    </article>`).join('')}
                            </div>
                        </section>`;
                    }).join('')}
                ${coverageBlock(result)}
            </div>
        </div>`;

    panel.querySelector('[data-action="mz-refresh"]')?.addEventListener('click', () => renderTakeoff(panel, runtime));
    panel.querySelector('[data-action="mz-csv"]')?.addEventListener('click', () => {
        download(`pryzm-medicion-${new Date().toISOString().slice(0, 10)}.csv`, takeoffToCsv(result));
    });
}

// ── 5D COST ───────────────────────────────────────────────────────────────────

/**
 * Mount the 5D cost panel.
 *
 * ⛔ No rate is ever supplied by PRYZM. Every price on this surface was typed by
 * the user or imported from a price database they hold. A line with no rate
 * reads "NO RATE", is excluded from the total, and the total's own caption says
 * how many lines it therefore does not cover.
 */
export function mountCostPanel(panel: HTMLElement, runtime: Runtime): void {
    withHandlerSpan('pryzm.mediciones.cost.render', { 'pryzm.surface': 'dataworkbench.mediciones.cost' }, () => {
        renderCost(panel, runtime);
    });
}

function renderCost(panel: HTMLElement, runtime: Runtime): void {
    let result: TakeoffResult;
    try {
        result = computeTakeoff();
    } catch (e) {
        panel.innerHTML = emptyState('€', 'No cost, because there is no take-off',
            `The take-off failed: <code style="font-size:11px;">${escapeHtml(e instanceof Error ? e.message : String(e))}</code><br><br>A cost is a layer on quantities. Without them there is nothing to price.`);
        return;
    }

    const book = loadRateBook(runtime);
    const costed = applyRates(result, book);
    const s = costed.summary;
    const cur = book.currency || 'EUR';

    if (result.lines.length === 0) {
        panel.innerHTML = emptyState('€', 'Nothing to price yet',
            'The take-off produced no lines, so there is nothing a rate could apply to. Model some geometry, then return here.');
        return;
    }

    const rows = costed.lines.map((c) => {
        const l = c.line;
        const entry = book.entries.find((e) => e.lineCode === l.code);
        const mismatch = c.unpricedReason === 'UNIT_MISMATCH';
        return `
            <article style="padding:9px 11px;border:1px solid ${mismatch ? 'rgba(179,38,30,.4)' : 'var(--app-border)'};border-radius:9px;background:var(--app-panel-bg);">
                <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;">
                    <div style="flex:1;min-width:180px;">
                        <div style="font-size:12px;font-weight:700;color:var(--app-text);">${escapeHtml(l.description)}</div>
                        <div style="font-size:9px;font-family:ui-monospace,Menlo,Consolas,monospace;color:var(--app-text-muted);margin-top:2px;">${escapeHtml(l.code)}</div>
                        ${mismatch ? `<div style="margin-top:4px;font-size:9.5px;color:#B3261E;line-height:1.5;">⛔ Your rate is quoted per <strong>${escapeHtml(UNIT_LABEL[entry!.unit])}</strong> but this line measures <strong>${escapeHtml(UNIT_LABEL[l.unit])}</strong>. It was <strong>refused, not converted</strong> — those are different numbers.</div>` : ''}
                    </div>
                    <div style="text-align:right;white-space:nowrap;min-width:78px;">
                        <div style="font-size:13px;font-weight:800;color:var(--app-text);">${escapeHtml(fmt(l.quantity))}</div>
                        <div style="font-size:9.5px;color:var(--app-text-muted);">${escapeHtml(UNIT_LABEL[l.unit])}</div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:3px;min-width:110px;">
                        <input data-rate-for="${escapeHtml(l.code)}" type="number" min="0" step="0.01" inputmode="decimal"
                               value="${entry && !mismatch ? String(entry.rate) : ''}" placeholder="no rate"
                               aria-label="Rate for ${escapeHtml(l.description)}"
                               style="width:100%;box-sizing:border-box;padding:5px 7px;border:1px solid var(--app-border);border-radius:6px;font-size:11px;text-align:right;background:#fff;color:var(--app-text);"/>
                        <input data-source-for="${escapeHtml(l.code)}" type="text" value="${escapeHtml(entry?.source ?? '')}" placeholder="rate source"
                               aria-label="Source of the rate for ${escapeHtml(l.description)}"
                               style="width:100%;box-sizing:border-box;padding:4px 7px;border:1px solid var(--app-border);border-radius:6px;font-size:9.5px;background:#fff;color:var(--app-text-muted);"/>
                    </div>
                    <div style="text-align:right;white-space:nowrap;min-width:96px;">
                        ${c.amount === null
                            ? `<div style="font-size:11px;font-weight:800;color:#B3261E;">${mismatch ? 'UNIT MISMATCH' : 'NO RATE'}</div>
                               <div style="font-size:9px;color:var(--app-text-muted);">not in the total</div>`
                            : `<div style="font-size:15px;font-weight:800;color:var(--app-text);">${escapeHtml(fmt(c.amount))}</div>
                               <div style="font-size:9px;color:var(--app-text-muted);">${escapeHtml(cur)}${c.source ? '' : ' · no source'}</div>`}
                    </div>
                </div>
            </article>`;
    }).join('');

    panel.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
            <div style="${HEADER_CSS}">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:15px;font-weight:800;color:var(--app-text);">5D — Cost</span>
                    <label style="font-size:10px;color:var(--app-text-muted);display:flex;align-items:center;gap:4px;">
                        Currency
                        <input data-currency type="text" maxlength="3" value="${escapeHtml(cur)}"
                               style="width:52px;padding:3px 6px;border:1px solid var(--app-border);border-radius:6px;font-size:10px;text-transform:uppercase;background:#fff;color:var(--app-text);"/>
                    </label>
                    <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">
                        ${toolbarButton('mz-import-rates', 'Import rates', 'Import a rate CSV: Code, Rate, Unit, Source')}
                        ${toolbarButton('mz-export-rates', 'Export rates', 'Download the rate book alone')}
                        ${toolbarButton('mz-cost-csv', 'Export costed CSV', 'Download the priced bill of quantities')}
                        ${toolbarButton('mz-clear-rates', 'Clear rates', 'Delete every rate stored for this project in this browser')}
                    </span>
                </div>
                <div style="margin-top:9px;padding:9px 11px;border:1px solid var(--app-accent);border-radius:9px;background:rgba(102,0,255,.05);">
                    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
                        <span style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--app-text-muted);">Priced total</span>
                        <span style="font-size:20px;font-weight:800;color:var(--app-text);">${s.pricedLineCount === 0 ? '—' : `${escapeHtml(fmt(s.pricedTotal))} ${escapeHtml(cur)}`}</span>
                    </div>
                    <div style="font-size:10.5px;line-height:1.65;color:var(--app-text);margin-top:5px;">${escapeHtml(s.coverageStatement)}</div>
                </div>
                <div style="font-size:9.5px;line-height:1.6;color:var(--app-text-muted);margin-top:8px;">
                    <strong>PRYZM ships no rates.</strong> Every price here is one you typed or imported — from BEDEC (ITeC),
                    a Base de Precios, SPON'S, RSMeans or your own quotations. There is no default and no estimate.
                    Rates are stored <strong>in this browser only</strong>: they are not in the project file, they do not sync
                    to collaborators, and they are not covered by undo.
                </div>
            </div>
            <div style="flex:1;overflow:auto;padding:14px 16px;">
                <div style="display:flex;flex-direction:column;gap:7px;">${rows}</div>
                ${coverageBlock(result)}
            </div>
        </div>`;

    const rerender = () => renderCost(panel, runtime);

    const upsert = (code: string, patch: { rate?: number | null; source?: string }): void => {
        const line = result.lines.find((l) => l.code === code);
        if (!line) return;
        const entries = book.entries.filter((e) => e.lineCode !== code);
        const prev = book.entries.find((e) => e.lineCode === code);
        const rate = patch.rate !== undefined ? patch.rate : (prev?.rate ?? null);
        const source = patch.source !== undefined ? patch.source : (prev?.source ?? '');
        if (rate !== null && Number.isFinite(rate) && rate >= 0) {
            entries.push({ lineCode: code, rate, unit: line.unit, source });
        }
        saveRateBook(runtime, { currency: book.currency, entries });
        rerender();
    };

    panel.querySelectorAll<HTMLInputElement>('[data-rate-for]').forEach((input) => {
        input.addEventListener('change', () => {
            const code = input.dataset.rateFor!;
            const raw = input.value.trim();
            // An empty field means NO RATE — it must clear the rate, never become 0.
            upsert(code, { rate: raw === '' ? null : Number(raw) });
        });
    });
    panel.querySelectorAll<HTMLInputElement>('[data-source-for]').forEach((input) => {
        input.addEventListener('change', () => upsert(input.dataset.sourceFor!, { source: input.value }));
    });

    panel.querySelector<HTMLInputElement>('[data-currency]')?.addEventListener('change', (ev) => {
        const v = (ev.target as HTMLInputElement).value.trim().toUpperCase().slice(0, 3);
        saveRateBook(runtime, { currency: v || 'EUR', entries: book.entries });
        rerender();
    });

    panel.querySelector('[data-action="mz-cost-csv"]')?.addEventListener('click', () => {
        download(`pryzm-medicion-costed-${new Date().toISOString().slice(0, 10)}.csv`, costedTakeoffToCsv(result, costed));
    });
    panel.querySelector('[data-action="mz-export-rates"]')?.addEventListener('click', () => {
        download(`pryzm-rates-${new Date().toISOString().slice(0, 10)}.csv`, rateBookToCsv(book));
    });
    panel.querySelector('[data-action="mz-clear-rates"]')?.addEventListener('click', () => {
        if (!confirm('Delete every rate stored for this project in this browser? The take-off is unaffected.')) return;
        saveRateBook(runtime, { currency: book.currency, entries: [] });
        rerender();
    });
    panel.querySelector('[data-action="mz-import-rates"]')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,text/csv';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;
            const parsed = parseRateCsv(await file.text());
            saveRateBook(runtime, {
                currency: parsed.currency ?? book.currency,
                // Imported rows replace matching codes; existing codes not in the
                // file survive, so an import is additive rather than destructive.
                entries: [...book.entries.filter((e) => !parsed.entries.some((p) => p.lineCode === e.lineCode)), ...parsed.entries],
            });
            if (parsed.rejected.length > 0) {
                // REJECTED rows are reported, never silently defaulted to zero.
                alert(`Imported ${parsed.entries.length} rate(s).\n\n${parsed.rejected.length} row(s) were NOT imported:\n\n${parsed.rejected.slice(0, 20).join('\n')}`);
            }
            rerender();
        });
        input.click();
    });
}

// ── 4D TIME — NOT BUILT, and says so ──────────────────────────────────────────

/**
 * Mount the 4D panel. There is no scheduling model in PRYZM; this panel states
 * that, names the four things 4D needs, and renders no timeline.
 */
export function mountTimePanel(panel: HTMLElement): void {
    withHandlerSpan('pryzm.mediciones.time.render', { 'pryzm.surface': 'dataworkbench.mediciones.time' }, () => {
        panel.innerHTML = notBuiltPanel({
            icon: '◷',
            title: '4D — Time / sequencing',
            lede: 'Not built. This tab exists so the gap is visible in the product rather than only in a document — it renders no schedule, because there is nothing in the model to derive one from.',
            haveTitle: 'What already exists and can be built on',
            have: [
                'A real, element-traceable take-off — every 4D task must attach to quantities, and those now exist.',
                'Levels and a hierarchy (site → building → level → unit → room), which is the natural work-breakdown spine.',
                'A command bus with undo, so phase assignment would be a normal, undoable edit.',
            ],
            needTitle: 'What is missing, named',
            need: [
                '<strong>A phase/task element.</strong> There is no schedule entity of any kind in the schemas — no task, no phase, no dependency. It has to be minted (C67/C68 apply).',
                '<strong>A phase field on every element.</strong> Only slabs carry a stray <code>phase</code> string today; nothing else does, and nothing reads it.',
                '<strong>Durations.</strong> A duration comes from a quantity divided by an output rate (m²/day). PRYZM ships no output rates for the same reason it ships no prices.',
                '<strong>A time filter in the viewport.</strong> The visibility system is intent-based (P7); a date-scoped filter would be a new visibility axis, not a UI toggle.',
            ],
            close: 'Until those four exist, a 4D tab could only animate an invented sequence. That would look like a plan and be a drawing.',
        });
    });
}

// ── 6D CARBON — NOT BUILT, and says so ────────────────────────────────────────

/**
 * Mount the 6D panel. Embodied carbon needs per-material carbon factors, and
 * this repository contains none — checked, not assumed.
 */
export function mountCarbonPanel(panel: HTMLElement): void {
    withHandlerSpan('pryzm.mediciones.carbon.render', { 'pryzm.surface': 'dataworkbench.mediciones.carbon' }, () => {
        panel.innerHTML = notBuiltPanel({
            icon: '◍',
            title: '6D — Sustainability / embodied carbon',
            lede: 'Not built. An embodied-carbon figure is a quantity multiplied by a carbon factor, and <strong>this repository holds no carbon factors</strong>. Inventing them would produce a number an architect could put in a planning submission.',
            haveTitle: 'What already exists and can be built on',
            have: [
                'Volumes and areas per material group — the left-hand side of every carbon calculation.',
                'A material library with stable ids, which is the join key a factor table needs.',
                'Wall/floor system types carrying LAYERS, so per-layer material volumes are derivable once the layers are broken out.',
            ],
            needTitle: 'What is missing, named',
            need: [
                '<strong>A carbon factor per material</strong> (kgCO₂e per kg or per m³). The material catalogue has no such column — it carries colour, roughness, metalness, opacity. This was checked, not assumed.',
                '<strong>Densities.</strong> Volume → mass needs kg/m³ per material. Also absent, which is the same gap that blocks structural steel mass in the take-off.',
                '<strong>A licensed factor database</strong> — ICE (Bath), ÖKOBAUDAT, EPD España or an EPD set. PRYZM cannot redistribute one; the user supplies it, exactly as they supply prices.',
                '<strong>Layer-level quantities.</strong> Carbon lives in the insulation and the concrete, not in "a wall" — so the per-layer m² breakout listed as the take-off\'s largest gap is a prerequisite.',
            ],
            close: 'The honest sequence is: break out system-type layers in the take-off, add a user-supplied factor table keyed exactly as 5D\'s rate book is, then multiply. Steps one and two are not done.',
        });
    });
}

function notBuiltPanel(a: {
    icon: string; title: string; lede: string;
    haveTitle: string; have: string[];
    needTitle: string; need: string[];
    close: string;
}): string {
    const list = (items: string[], colour: string) => `
        <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;">
            ${items.map((i) => `<li style="font-size:11.5px;line-height:1.65;color:${colour};">${i}</li>`).join('')}
        </ul>`;
    return `
        <div style="height:100%;overflow:auto;padding:22px 20px;">
            <div style="max-width:640px;margin:0 auto;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                    <span style="font-size:22px;">${a.icon}</span>
                    <span style="font-size:16px;font-weight:800;color:var(--app-text);">${escapeHtml(a.title)}</span>
                    <span style="font-size:9.5px;font-weight:800;letter-spacing:.08em;color:#B3261E;background:rgba(179,38,30,.10);border-radius:99px;padding:3px 9px;">NOT BUILT</span>
                </div>
                <p style="font-size:12px;line-height:1.75;color:var(--app-text);margin:0 0 18px;">${a.lede}</p>

                <h4 style="margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text-muted);">${escapeHtml(a.haveTitle)}</h4>
                ${list(a.have, 'var(--app-text-muted)')}

                <h4 style="margin:18px 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text-muted);">${escapeHtml(a.needTitle)}</h4>
                ${list(a.need, 'var(--app-text)')}

                <p style="margin:18px 0 0;padding:11px 13px;border-left:3px solid var(--app-accent);background:rgba(102,0,255,.05);font-size:11.5px;line-height:1.7;color:var(--app-text);">${a.close}</p>
                <p style="margin:14px 0 0;font-size:10px;color:var(--app-text-muted);line-height:1.6;">
                    Recorded in ADR-0343. Nothing on this tab is broken — the capability has not shipped, and this panel exists so that is visible where the decision gets made rather than only in a document.
                </p>
            </div>
        </div>`;
}
