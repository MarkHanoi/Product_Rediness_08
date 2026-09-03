/**
 * MedicionesBucket — the MEDICIONES lifecycle bucket: take-off, 4D, 5D, 6D.
 *
 * Layer Affected:   UI — Data Workbench › Mediciones Bucket (L7)
 * File:             apps/editor/src/ui/dataworkbench/buckets/MedicionesBucket.ts
 * Contract:         C66 §1.1 by analogy · C84 EI-11 · ADR-0350 §MEDICIONES
 * Engine:           @pryzm/core-app-model — `computeTakeoff()` / `applyRates()`
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ THE RULE THIS SURFACE IS BUILT AROUND
 * ─────────────────────────────────────────────────────────────────────────────
 * A cost or a carbon figure gets believed and quoted; an invented one is worse
 * than an absent one, and "authored, reachable, and incapable of holding an
 * answer" is the exact defect shape this surface was opened to stop repeating.
 *
 *   Take-off (mediciones)  — BUILT.  Real, element-traceable, opening-net.
 *   5D Cost                — BUILT.  Rates come from the USER. Zero ship with it.
 *   4D Time                — BUILT 2026-08-21, lane DIM46 (ADR-0351).
 *   6D Carbon              — BUILT 2026-08-21, lane DIM46 (ADR-0351).
 *
 * ⚠ THIS FILE OWNS ONLY THE FIRST TWO. `mountTimePanel` / `mountCarbonPanel`
 * live in `MedicionesTimeCarbon.ts` — see that file's header for why they are not
 * here (module-cycle avoidance, §SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD).
 *
 * ⛔ DO NOT restore a `notBuiltPanel()` helper here. Both tabs that used it now
 * render real, cited answers; a generic "not built" template sitting in the file
 * is an invitation to ship another authored-but-empty surface.
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
    resolveRegionalRates,
    RATE_SOURCE_CANDIDATES,
    SHIPPED_REGIONAL_RATE_COUNT,
    // §REGIONAL-BUILDING-COST (L-9100, lane RATE53) — the building-level €/m²,
    // sourced from an official bulletin. See RegionalBuildingCost.ts.
    resolveBuildingCostModels,
    measuredBuiltArea,
    estimateBuildingCost,
    SHIPPED_BUILDING_COST_MODEL_COUNT,
    type TakeoffResult,
    type TakeoffLine,
    type RateEntry,
    type RateBook,
    type LineEstimate,
    type BuildingCostEstimate,
    type RegionalBuildingCostModel,
    rateBookStorageKey,
} from '@pryzm/core-app-model';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import { escapeHtml } from './DWHelpers';
// §REGIONAL-COST-ESTIMATE (L-4832) — the composition surface where the parcel's
// geolocation becomes a cost jurisdiction, through the ONE existing resolver.
import { currentCostJurisdiction, costJurisdictionDiagLine } from './resolveCostJurisdiction';
// §RESI-ORCH-COST — the ONE typology-choice store, shared with the envelope card.
import { loadBuildingChoice, saveBuildingChoice, type BuildingChoice } from './buildingTypologyChoice';

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime | null;

// ── Rate book storage ─────────────────────────────────────────────────────────
//
// §RATES157 (L-12503) — CORRECTED. This used to read "rates live in THIS
// BROWSER's localStorage … NOT part of the project file, do NOT sync between
// collaborators" and that was a persistence claim the code could not honour —
// the founder lost a day of typed cost prices to it. Rates now ALSO round-trip
// through `ProjectSnapshot.rates` (`ProjectSerializer.serialize()` /
// `ProjectLoader` — see those files' §RATES157 blocks), so they DO travel with
// the project and DO sync to collaborators on the next open. This localStorage
// read/write is now a same-browser CACHE in front of that durable copy, kept
// for latency and for the one-time recovery path (a snapshot saved before this
// lane sees no `rates` key; the loader adopts whatever this cache still holds
// for the project and folds it back into the snapshot on the next save — never
// the other way around). Undo: deliberately NOT covered, unchanged — see the
// UI copy in `mountCostPanel` for the reasoning (C16 §8.6; rates sit outside
// the command-bus/Immer undo ring the same way userMaterialStore, scheduleStore
// and templateStore already do, and this file does not open a new exception).
//
// The KEY FORMAT itself is now owned by `rateBookStorageKey()` in
// `@pryzm/core-app-model` (`packages/core-app-model/src/quantities/CostModel.ts`)
// — the engine persistence layer (`ProjectSerializer`/`ProjectLoader`) needs the
// EXACT SAME key to move rates into and out of the snapshot, and two independent
// copies of a storage-key prefix is exactly how this kind of loss happens.

function rateKey(runtime: Runtime): string {
    return rateBookStorageKey(runtime?.projectContext?.projectId ?? null);
}

// §LIVESCHED151 (E) — exported so SchedulePanel's Cost column reads the
// EXACT SAME rate book this 5D tab does (same key, same fallback, same
// EUR default when unset). Reusing this function verbatim — rather than a
// second reader with its own key derivation — is what guarantees the
// schedule and the Data › MEDICIONES tab can never quietly disagree.
export function loadRateBook(runtime: Runtime): RateBook {
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

// ── §REGIONAL-BUILDING-COST — the typology choice ────────────────────────────
//
// ⛔ THE TYPOLOGY IS THE USER'S CHOICE AND HAS NO DEFAULT. In Barcelona's table
// the group moves the answer by a factor of NINE (259,81 to 2.381,61 €/m²), and
// PRYZM does not know whether this model is a 4-star hotel, a school or a garage.
// A default would be a guess with a legal citation attached, so the panel asks
// once and then remembers the answer. Same storage caveat as the rate book —
// this browser only.
//
// ⭐ §RESI-ORCH-COST (2026-09-03) — `BuildingChoice`, its storage key and its
// load/save now live in `./buildingTypologyChoice`, unchanged in behaviour and
// with the same key, because the buildable-envelope card asks the SAME question
// one stage earlier. Two panels remembering two different answers to "what kind
// of building is this?" would state two different costs for one project, and the
// spread between the extreme rows of the same published table is a factor of nine.
// One store, two readers.

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
                ${notMeasured} of ${rows.length} categories are <strong>NOT MEASURED</strong>. They contribute
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
            Those categories are marked NOT MEASURED below. This is different from "the project has none of them".
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

/**
 * §TAKEOFF-DESGLOSE (L-4800) — the per-element breakdown.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHAT THIS REPLACED, AND WHY IT WAS UNUSABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * This block used to render `line.elementIds.join('  ')` — for a real project,
 * 124 raw UUIDs in one unbroken monospace paragraph inside a 110 px scroller.
 * Every id was correct and none of them were checkable: the reader could see
 * WHICH elements were measured and nothing about WHAT any of them measured, so a
 * total that looked wrong could not be attributed to an element.
 *
 * A *medición* is signed line by line and then checked row by row. This IS the
 * row level: mark, type/label, level, the element's own measured quantity, and
 * the per-element note when that element was measured approximately.
 *
 * ⛔ THE FOOTER STATES THE SUM AND THE LINE TOTAL SIDE BY SIDE. They are equal by
 * construction (`TakeoffLine.quantity` is derived from these rows), and printing
 * both is what makes that checkable rather than merely asserted.
 *
 * ⚠ NO `text-overflow: ellipsis` ANYWHERE IN THIS TABLE. A CSS ellipsis on a card
 * title destroyed a user-facing disclosure in this product earlier today; the
 * cells here WRAP (`word-break` on the id column, normal wrapping on the note),
 * because a truncated reason is a hidden one.
 */
function desgloseBlock(line: TakeoffLine): string {
    const rows = line.contributions;
    const sum = rows.reduce((a, c) => a + c.quantity, 0);
    const cell = 'padding:3px 6px;border-bottom:1px solid var(--app-border-light);vertical-align:top;';
    const head = 'padding:3px 6px;font-size:8.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--app-text-muted);text-align:left;border-bottom:1px solid var(--app-border);position:sticky;top:0;background:var(--app-panel-bg);';
    // "NO MARK" / "NO LEVEL" are printed as words, not as a dash. A dash reads as
    // decoration; the words say that the element states nothing, which is the
    // fact a quantity surveyor needs in order to know it cannot cross-reference
    // this row to a drawing.
    const absent = (v: string | null, word: string): string =>
        v ? escapeHtml(v) : `<span style="color:#B3261E;font-size:8.5px;font-weight:700;">${word}</span>`;
    return `<details style="margin-top:5px;">
        <summary style="font-size:9.5px;color:var(--app-accent);cursor:pointer;">Desglose — ${rows.length} element${rows.length === 1 ? '' : 's'} measured</summary>
        <div style="margin-top:4px;max-height:260px;overflow:auto;border:1px solid var(--app-border);border-radius:7px;">
            <table style="width:100%;border-collapse:collapse;font-size:9.5px;line-height:1.5;color:var(--app-text);table-layout:fixed;">
                <thead><tr>
                    <th style="${head}width:15%;">Mark</th>
                    <th style="${head}width:26%;">Type / name</th>
                    <th style="${head}width:12%;">Level</th>
                    <th style="${head}width:15%;text-align:right;">Quantity</th>
                    <th style="${head}width:32%;">Element id · note</th>
                </tr></thead>
                <tbody>
                    ${rows.map((c) => `<tr>
                        <td style="${cell}">${absent(c.mark, 'NO MARK')}</td>
                        <td style="${cell}word-wrap:break-word;">${c.label ? escapeHtml(c.label) : ''}</td>
                        <td style="${cell}">${absent(c.levelId, 'NO LEVEL')}</td>
                        <td style="${cell}text-align:right;font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap;">${escapeHtml(fmt(c.quantity))} <span style="font-weight:400;color:var(--app-text-muted);">${escapeHtml(UNIT_LABEL[line.unit])}</span></td>
                        <td style="${cell}font-family:ui-monospace,Menlo,Consolas,monospace;font-size:8.5px;color:var(--app-text-muted);word-break:break-all;overflow-wrap:anywhere;">${escapeHtml(c.elementId)}${c.note ? `<div style="margin-top:2px;font-family:inherit;color:#8A6100;word-break:normal;overflow-wrap:break-word;">⚠ ${escapeHtml(c.note)}</div>` : ''}</td>
                    </tr>`).join('')}
                </tbody>
                <tfoot><tr>
                    <td colspan="3" style="${cell}font-weight:700;border-top:2px solid var(--app-border);">Sum of the ${rows.length} row${rows.length === 1 ? '' : 's'} above</td>
                    <td style="${cell}text-align:right;font-weight:800;border-top:2px solid var(--app-border);font-variant-numeric:tabular-nums;white-space:nowrap;">${escapeHtml(fmt(sum))} ${escapeHtml(UNIT_LABEL[line.unit])}</td>
                    <td style="${cell}border-top:2px solid var(--app-border);font-size:8.5px;color:var(--app-text-muted);word-break:normal;overflow-wrap:break-word;">line total ${escapeHtml(fmt(line.quantity))} ${escapeHtml(UNIT_LABEL[line.unit])}${Math.abs(sum - line.quantity) > 0.005 ? ' — <strong style="color:#B3261E;">THESE DISAGREE. Report this: the line total is derived from these rows and cannot differ from them.</strong>' : ' — equal, as it must be'}</td>
                </tr></tfoot>
            </table>
        </div>
    </details>`;
}

/**
 * §MATERIAL-ATTRIBUTION-REASONS (L-4820) — the sentence 6D needs and could not
 * previously get. A line that reaches no carbon figure says WHY here, on the
 * take-off itself, because the fix is upstream of 6D every time.
 */
function materialBlock(line: TakeoffLine): string {
    if (line.materialBreakdown.length > 0) {
        return `<div style="margin-top:5px;font-size:9px;line-height:1.5;color:var(--app-text-muted);overflow-wrap:break-word;">
            Material: ${line.materialBreakdown.map((m) => `<strong>${escapeHtml(m.materialId)}</strong> ${escapeHtml(fmt(m.volumeM3))} m³${m.note ? ` (${escapeHtml(m.note)})` : ''}`).join(' · ')}
        </div>`;
    }
    if (!line.materialGap) return '';
    return `<div style="margin-top:5px;font-size:9px;line-height:1.5;color:#8A6100;overflow-wrap:break-word;white-space:normal;">
        <strong>Names no material — no carbon figure is reachable.</strong> ${escapeHtml(line.materialGap)}
    </div>`;
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
                            This is a real answer — not a failure — and the coverage table below says which categories were read.
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
                                                ${materialBlock(l)}
                                                ${desgloseBlock(l)}
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

/**
 * §REGIONAL-COST-ESTIMATE (L-4830) — the estimate, rendered so it CANNOT be read
 * as a price.
 *
 * ⛔ THE RULES THIS BLOCK ENCODES, AND WHY EACH IS HERE:
 *   • it never appears on a line the user has priced — the engine returns null
 *     there, so this is belt and braces on a decision made upstream;
 *   • it is visually a DIFFERENT KIND OF THING — dashed border, its own colour,
 *     and the word ESTIMATE spelled out — not the same number in grey;
 *   • it names its database, edition and PRICE DATE inline. A construction rate
 *     with no date cannot be indexed to today, so a dateless estimate would be
 *     unusable even when correct;
 *   • ⚠ IT WRAPS. white-space:normal + overflow-wrap:break-word, and NO
 *     text-overflow:ellipsis anywhere. An ellipsis on a card title destroyed a
 *     user-facing disclosure in this product earlier today, and a truncated
 *     provenance is a provenance nobody can check.
 */
function estimateChip(c: { estimate: LineEstimate | null }): string {
    const e = c.estimate;
    if (!e) return '';
    return `<div style="margin-top:6px;padding:5px 7px;border:1px dashed #8A6100;border-radius:7px;background:rgba(138,97,0,.06);text-align:right;">
        <div style="font-size:8.5px;font-weight:800;letter-spacing:.06em;color:#8A6100;">ESTIMATE — NOT IN THE TOTAL</div>
        <div style="font-size:13px;font-weight:800;color:#8A6100;">${escapeHtml(fmt(e.amount))} ${escapeHtml(e.currency)}</div>
        <div style="font-size:8.5px;line-height:1.5;color:var(--app-text-muted);white-space:normal;overflow-wrap:break-word;text-align:left;margin-top:3px;">
            ${escapeHtml(fmt(e.rate))} ${escapeHtml(e.currency)} per unit · ${escapeHtml(e.provenance.database)} ${escapeHtml(e.provenance.edition)}
            · prices at ${escapeHtml(e.provenance.priceDate)}${e.provenance.itemCode ? ` · item ${escapeHtml(e.provenance.itemCode)}` : ''}
            <br>Type a rate above to replace it with your own number.
        </div>
    </div>`;
}

/**
 * §REGIONAL-BUILDING-COST (L-9100, lane RATE53) — THE BUILDING-LEVEL ESTIMATE.
 *
 * ⭐ THIS IS THE ANSWER TO THE FOUNDER'S QUESTION. He asked for "an average cost
 * depending on the region", saw 42 lines of NO RATE, and was told PRYZM ships
 * nothing because every price base is licensed. That was true of PER-TRADE PRICE
 * BOOKS and false of the class nobody had checked: official bulletins publish
 * building-cost modules and carry no copyright at all (LPI Art. 13).
 *
 * ⛔ THE RULES THIS BLOCK ENCODES:
 *   • it is a DIFFERENT KIND OF THING from the priced total, and it looks like
 *     one — its own section, the amber estimate colour, the word ESTIMATE spelled
 *     out, and "NOT IN THE PRICED TOTAL" adjacent to the figure, not in a footnote;
 *   • the typology SELECT has an empty first option and no default (see
 *     `loadBuildingChoice`). Until it is chosen there is no number, only the
 *     published table — which is itself a real, cited, regional answer;
 *   • the AREA it multiplies is named as a PROXY, with the take-off lines it came
 *     from, because PRYZM does not compute superfície construïda;
 *   • what the €/m² EXCLUDES is listed in full. A figure whose exclusions are
 *     unstated is read as a project cost, and it is a material-execution cost;
 *   • ⚠ it WRAPS. No text-overflow:ellipsis anywhere — a truncated provenance is
 *     a provenance nobody can check.
 */
function buildingEstimateBlock(
    models: readonly RegionalBuildingCostModel[],
    refusal: string,
    est: BuildingCostEstimate | null,
    choice: BuildingChoice,
    areaMissing: boolean,
): string {
    const AMBER = '#8A6100';
    const head = `<h4 style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">Regional building estimate</h4>`;

    if (models.length === 0) {
        return `<section style="margin-top:20px;border-top:2px solid var(--app-border);padding-top:14px;">
            ${head}
            <div style="font-size:11px;line-height:1.6;color:var(--app-text-muted);white-space:normal;overflow-wrap:break-word;">
                ${escapeHtml(refusal)}
            </div>
        </section>`;
    }

    const model = models[0]!;
    const p = model.provenance;

    const options = model.groups.map((g) => `
        <option value="${escapeHtml(g.groupId)}"${choice.groupId === g.groupId ? ' selected' : ''}>
            ${escapeHtml(g.groupId)} — ${escapeHtml(g.label)} · ${escapeHtml(fmt(g.ratePerAreaM2))} ${escapeHtml(model.currency)}/m²
        </option>`).join('');

    const corrections = model.corrections.map((c) => `
        <option value="${escapeHtml(c.correctionId)}"${choice.correctionId === c.correctionId ? ' selected' : ''}>
            ${escapeHtml(c.label)} (× ${escapeHtml(String(c.factor))})
        </option>`).join('');

    /* The three states this block can be in, and each says which. An empty
       figure with no explanation is the shape that makes a user think the
       feature is broken when it is in fact refusing. */
    const figure = est
        ? `<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
               <span style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${AMBER};">Estimate — not a price</span>
               <span data-building-estimate style="font-size:22px;font-weight:800;color:${AMBER};">${escapeHtml(fmt(est.amount))} ${escapeHtml(est.currency)}</span>
           </div>
           <div style="font-size:10.5px;color:var(--app-text-muted);margin-top:2px;">
               ${escapeHtml(fmt(est.effectiveRatePerAreaM2))} ${escapeHtml(est.currency)}/m² × ${escapeHtml(fmt(est.area.areaM2))} m²
           </div>`
        : areaMissing
            ? `<div style="font-size:11px;font-weight:700;color:#B3261E;">NO BUILT AREA MEASURED</div>
               <div style="font-size:10.5px;line-height:1.6;color:var(--app-text-muted);white-space:normal;">
                   The take-off measured no slab, no floor and no room finish, so there is no area to multiply.
                   PRYZM does <strong>not</strong> derive one from the wall footprint — that would be a second
                   measurement engine disagreeing with the first. Model the floor slabs and this figure appears.
               </div>`
            : `<div style="font-size:11px;font-weight:700;color:${AMBER};">CHOOSE THE BUILDING TYPE</div>
               <div style="font-size:10.5px;line-height:1.6;color:var(--app-text-muted);white-space:normal;">
                   The published table above spans a factor of nine — from ${escapeHtml(fmt(model.groups[model.groups.length - 1]!.ratePerAreaM2))}
                   to ${escapeHtml(fmt(model.groups[0]!.ratePerAreaM2))} ${escapeHtml(model.currency)}/m². PRYZM does not know which
                   line this project is on, and <strong>will not guess</strong>: the wrong group is a wrong number, not an
                   approximate one. Pick one and the estimate appears.
               </div>`;

    return `<section style="margin-top:20px;border-top:2px solid var(--app-border);padding-top:14px;">
        ${head}
        <div style="font-size:11px;line-height:1.6;color:var(--app-text-muted);margin-bottom:10px;white-space:normal;overflow-wrap:break-word;">
            ${escapeHtml(refusal)}
        </div>
        <div style="padding:11px 13px;border:1px dashed ${AMBER};border-radius:9px;background:rgba(138,97,0,.06);">
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:9px;">
                <label style="font-size:10px;color:var(--app-text-muted);display:flex;flex-direction:column;gap:3px;flex:1;min-width:220px;">
                    Building type (published module)
                    <select data-building-group aria-label="Building type for the regional cost estimate"
                            style="padding:5px 7px;border:1px solid var(--app-border);border-radius:6px;font-size:11px;background:#fff;color:var(--app-text);max-width:100%;">
                        <option value=""${choice.groupId ? '' : ' selected'}>— not chosen —</option>
                        ${options}
                    </select>
                </label>
                <label style="font-size:10px;color:var(--app-text-muted);display:flex;flex-direction:column;gap:3px;flex:1;min-width:200px;">
                    Correction factor (published)
                    <select data-building-correction aria-label="Published correction factor"
                            style="padding:5px 7px;border:1px solid var(--app-border);border-radius:6px;font-size:11px;background:#fff;color:var(--app-text);max-width:100%;">
                        <option value=""${choice.correctionId ? '' : ' selected'}>New build — no correction</option>
                        ${corrections}
                    </select>
                </label>
            </div>
            ${figure}
            ${est ? `<div style="margin-top:8px;font-size:10px;line-height:1.6;color:var(--app-text);white-space:normal;overflow-wrap:break-word;">${escapeHtml(est.statement)}</div>` : ''}
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(138,97,0,.25);font-size:9.5px;line-height:1.6;color:var(--app-text-muted);white-space:normal;overflow-wrap:break-word;">
                <strong>Source.</strong> ${escapeHtml(p.database)} — ${escapeHtml(p.publisher)}, ${escapeHtml(p.edition)}.
                Prices at ${escapeHtml(p.priceDate)}${p.itemCode ? ` · ${escapeHtml(p.itemCode)}` : ''}.
                <br><strong>Licence.</strong> ${escapeHtml(p.licence.replace(/_/g, ' '))} — ${escapeHtml(p.licenceNote ?? '')}
                <br><strong>Verify at.</strong> ${escapeHtml(p.sourceToChase)}
            </div>
            <details style="margin-top:8px;">
                <summary style="font-size:10px;font-weight:700;color:${AMBER};cursor:pointer;">What this €/m² does NOT include (${model.notCovered.length})</summary>
                <ul style="margin:6px 0 0;padding-left:16px;font-size:9.5px;line-height:1.65;color:var(--app-text-muted);white-space:normal;overflow-wrap:break-word;">
                    ${model.notCovered.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}
                </ul>
            </details>
        </div>
    </section>`;
}

/**
 * ⛔ THE PARAGRAPH THE FOUNDER REVERSED, REWRITTEN RATHER THAN DELETED.
 *
 * It used to end: "There is no default and there is no estimate." The ESTIMATE
 * half was reversed by ruling on 2026-08-22. The NO-DEFAULT half was NOT, and it
 * is still literally true — SHIPPED_REGIONAL_RATE_COUNT is 0. Both facts are
 * stated, because a panel that quietly dropped the old sentence would leave a
 * user unable to tell which of the two rules still applies to them.
 */
function ratesDisclosure(regionStatement: string): string {
    /* ⚠ AMENDED 2026-08-23 (lane RATE53, L-9102). This paragraph read "PRYZM
       ships no rates — 0 of them, to be exact", full stop. Half of that must
       STOP being true and half must STAY true, so both halves are now counted
       SEPARATELY from the modules themselves rather than asserted in prose:

         • PER-LINE rates: still 0, and now for a READ reason (BEDEC is a
           per-seat subscription) rather than an unasked question;
         • BUILDING-LEVEL modules: 1, Barcelona's, from an official bulletin.

       ⛔ Both numbers are interpolated from the engine's own constants. A count
       written as a literal here is the shape that rots the moment a second
       module ships. */
    return `<div style="font-size:9.5px;line-height:1.6;color:var(--app-text-muted);margin-top:8px;white-space:normal;overflow-wrap:break-word;">
        <strong>PRYZM ships no per-line rates — ${SHIPPED_REGIONAL_RATE_COUNT} of them, to be exact.</strong>
        Every price in the total above is one you typed or imported: from BEDEC (ITeC), a Base de Precios,
        SPON'S, RSMeans or your own quotations. Those licences have now been read, and none of them permits
        PRYZM to redistribute a per-trade rate — BEDEC is a per-seat access subscription, SPON'S and RSMeans
        are sold per copy.
        <br><strong>Regional building estimates are a separate thing, and PRYZM now ships
        ${SHIPPED_BUILDING_COST_MODEL_COUNT}.</strong> They come from official bulletins, which carry no
        copyright, and they are a €/m² for the WHOLE building — never a per-line rate, never added to the
        total above. ${escapeHtml(regionStatement)}
        <br>§RATES157 — <strong>rates are saved into the project</strong>: they travel with the project file and
        sync to collaborators the next time they open it. This browser also keeps a local copy for instant
        access, and recovers yours from it if an older save predates this. They are
        <strong>not covered by undo</strong> — like your material library, templates and schedule
        definitions, a rate book is project data, not a modelled element, so undoing a wall or a door
        does not touch it.
    </div>`;
}

/**
 * The named ledger of price bases and the ONE question that decides whether each
 * may ever ship: has anybody read its licence?
 *
 * Rendered on the panel because a user asking "why is there no estimate?"
 * deserves the real answer — and because the answer is a founder/legal decision,
 * not an engineering backlog item.
 */
function rateSourceLedger(): string {
    /* ⚠ RETITLED 2026-08-23 (lane RATE53, L-9102). The heading read "Why there
       is no estimate". There IS an estimate now, so the ledger's subject changed
       from an apology to a RECORD: what was read, what it said, and what each
       verdict permits. The rows that still refuse are unchanged and unhidden. */
    return `<section style="margin-top:20px;border-top:2px solid var(--app-border);padding-top:14px;">
        <h4 style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">The licence ledger — what was read, and what it said</h4>
        <div style="font-size:11px;line-height:1.6;color:var(--app-text-muted);margin-bottom:10px;white-space:normal;overflow-wrap:break-word;">
            A rate PRYZM ships is a legal claim about somebody else's property, so every source below carries the
            sentence in its licence that decided it. ⭐ The one that cleared is not a price book at all — an official
            bulletin, which under Spanish law carries no copyright. The per-trade price books remain refused, which
            is why every line above still reads NO RATE until you type or import one.
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
            ${RATE_SOURCE_CANDIDATES.map((c) => `
                <div style="padding:8px 10px;border:1px solid ${c.licence === 'CLEARED_FOR_REDISTRIBUTION' ? 'rgba(45,125,70,.45)' : 'var(--app-border)'};border-radius:8px;background:var(--app-panel-bg);">
                    <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;">
                        <span style="font-size:11px;font-weight:700;color:var(--app-text);">${escapeHtml(c.database)}</span>
                        <span style="font-size:9.5px;color:var(--app-text-muted);">${escapeHtml(c.publisher)} · ${escapeHtml(c.geography)}</span>
                        <span style="margin-left:auto;font-size:9px;font-weight:800;letter-spacing:.06em;border-radius:99px;padding:2px 7px;white-space:nowrap;${
                            c.licence === 'LICENSED_NOT_REDISTRIBUTABLE'
                                ? 'color:#B3261E;background:rgba(179,38,30,.10);'
                                : c.licence === 'CLEARED_FOR_REDISTRIBUTION'
                                    ? 'color:#2D7D46;background:rgba(45,125,70,.12);'
                                    : 'color:#8A6100;background:rgba(138,97,0,.10);'
                        }">${escapeHtml(c.licence.replace(/_/g, ' '))}</span>
                        <span style="font-size:9px;color:var(--app-text-muted);white-space:nowrap;">${escapeHtml(c.granularity.replace(/-/g, ' '))}</span>
                    </div>
                    ${c.licenceNote
                        ? `<div style="margin-top:4px;font-size:9.5px;line-height:1.55;color:var(--app-text);white-space:normal;overflow-wrap:break-word;"><strong>Read:</strong> ${escapeHtml(c.licenceNote)}</div>`
                        : `<div style="margin-top:4px;font-size:9.5px;font-weight:700;color:#8A6100;">NOT READ — no licence text has been opened for this source.</div>`}
                    <div style="margin-top:4px;font-size:10px;line-height:1.55;color:var(--app-text-muted);white-space:normal;overflow-wrap:break-word;">${escapeHtml(c.whatMustBeEstablished)}</div>
                </div>`).join('')}
        </div>
    </section>`;
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
    /* §REGIONAL-COST-ESTIMATE (L-4830). Every project is geolocated via its
       parcel, so a region CAN be resolved — and today every resolution ends in a
       refusal, because PRYZM ships no rate book for anywhere. The panel states
       that rather than showing an empty estimate column with no explanation.
       ⭐ Logged on every render, in the shape of the §JURISDICTION-DIAG line the
       founder already reads: an INVISIBLE refusal is how a wrong default
       survives a year (L-4210). */
    const binding = currentCostJurisdiction();
    const regional = resolveRegionalRates(binding);
    console.log(costJurisdictionDiagLine(binding));
    const costed = applyRates(result, book, regional);
    const s = costed.summary;
    const cur = book.currency || 'EUR';

    /* §REGIONAL-BUILDING-COST (L-9100, lane RATE53) — the BUILDING-LEVEL figure,
       resolved from the SAME binding through the SAME ladder, and computed by a
       SEPARATE call that `applyRates` never sees. That separation is the whole
       safety property: there is no code path by which this number can reach
       `pricedTotal` or `estimatedTotal`. */
    const buildingModels = resolveBuildingCostModels(binding);
    const choice = loadBuildingChoice(runtime);
    const builtArea = measuredBuiltArea(result);
    const buildingEstimate = buildingModels.models[0]
        ? estimateBuildingCost(buildingModels.models[0], choice.groupId, builtArea, choice.correctionId)
        : null;

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
                    <div style="text-align:right;white-space:normal;min-width:130px;max-width:200px;">
                        ${c.amount === null
                            ? `<div style="font-size:11px;font-weight:800;color:#B3261E;">${mismatch ? 'UNIT MISMATCH' : 'NO RATE'}</div>
                               <div style="font-size:9px;color:var(--app-text-muted);">not in the total</div>`
                            : `<div style="font-size:15px;font-weight:800;color:var(--app-text);">${escapeHtml(fmt(c.amount))}</div>
                               <div style="font-size:9px;color:var(--app-text-muted);">${escapeHtml(cur)}${c.source ? '' : ' · no source'}</div>`}
                        ${estimateChip(c)}
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
                    ${s.estimatedLineCount > 0 ? `
                    <div style="margin-top:7px;padding-top:7px;border-top:1px dashed #8A6100;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
                        <span style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8A6100;">Estimated separately</span>
                        <span style="font-size:16px;font-weight:800;color:#8A6100;">${escapeHtml(fmt(s.estimatedTotal))} ${escapeHtml(cur)}</span>
                        <span style="font-size:10px;color:var(--app-text-muted);white-space:normal;">over ${s.estimatedLineCount} unpriced line${s.estimatedLineCount === 1 ? '' : 's'} — <strong>not added to the total above</strong></span>
                    </div>` : ''}
                    <div style="font-size:10.5px;line-height:1.65;color:var(--app-text);margin-top:5px;white-space:normal;overflow-wrap:break-word;">${escapeHtml(s.coverageStatement)}</div>
                </div>
                ${ratesDisclosure(regional.statement)}
            </div>
            <div style="flex:1;overflow:auto;padding:14px 16px;">
                ${buildingEstimateBlock(buildingModels.models, buildingModels.statement, buildingEstimate, choice, builtArea === null)}
                <div style="margin-top:20px;border-top:2px solid var(--app-border);padding-top:14px;">
                    <h4 style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">Line-by-line — your rates</h4>
                    <div style="display:flex;flex-direction:column;gap:7px;">${rows}</div>
                </div>
                ${rateSourceLedger()}
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

    /* §REGIONAL-BUILDING-COST — the typology and the correction factor. An empty
       value CLEARS the choice back to "not chosen", which removes the figure
       entirely rather than falling back to a default group. There is no default
       group; see `loadBuildingChoice`. */
    panel.querySelector<HTMLSelectElement>('[data-building-group]')?.addEventListener('change', (ev) => {
        const v = (ev.target as HTMLSelectElement).value;
        saveBuildingChoice(runtime, { ...loadBuildingChoice(runtime), groupId: v || null });
        rerender();
    });
    panel.querySelector<HTMLSelectElement>('[data-building-correction]')?.addEventListener('change', (ev) => {
        const v = (ev.target as HTMLSelectElement).value;
        saveBuildingChoice(runtime, { ...loadBuildingChoice(runtime), correctionId: v || null });
        rerender();
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
