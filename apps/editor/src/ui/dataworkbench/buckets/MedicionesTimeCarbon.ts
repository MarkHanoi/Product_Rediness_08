/**
 * MedicionesTimeCarbon — the 4D (time) and 6D (carbon) tabs of the MEDICIONES
 * bucket. Both are BUILT; both were a red NOT BUILT badge this morning.
 *
 * Layer Affected:   UI — Data Workbench › Mediciones Bucket (L7)
 * File:             apps/editor/src/ui/dataworkbench/buckets/MedicionesTimeCarbon.ts
 * Contract:         C66 §1.1 by analogy · C84 EI-11 · C100 §1.1 / §5 · ADR-0351
 * Engine:           @pryzm/core-app-model — `computeCarbon()` / `scheduleStateAt()`
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ THE TWO RULES THIS SURFACE IS BUILT AROUND
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **No fabricated productivity.** Every duration on the 4D tab was typed by
 *    the user, every input says so, and PRYZM has no code path that can derive
 *    one — it ships no output rates for the same reason it ships no prices.
 * 2. **No uncited carbon.** Every number on the 6D tab carries its dataset, its
 *    geography, its year and — separately — whether anyone has actually CHECKED
 *    it against the source document. Nothing here has been checked, and the
 *    surface says so every time it shows a total.
 *
 * A material with no factor reads NOT MEASURED. An element with no task is
 * UNSCHEDULED, which is NOT the same claim as "not yet built" and is never
 * silently folded into it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS ITS OWN FILE, AND NOT PART OF MedicionesBucket.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * MedicionesBucket owns the take-off and 5D tabs. If these two tabs lived there
 * the file would be ~1500 lines; if they imported its helpers while it
 * re-exported them, the two modules would form a cycle, and a circular barrel
 * evaluated at module load is how this repo has produced a white screen before
 * (MEMORY §SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD). So the handful of presentation
 * constants below are LOCAL ON PURPOSE — that is the cheaper of the two costs,
 * and it is stated rather than left to look like an oversight.
 *
 * `escapeHtml` is applied to every model-derived string before it reaches
 * innerHTML — element ids, material ids and task names all originate in imported
 * files or user typing (§DW-MATERIAL-COLOR-XSS, L-407).
 */

import {
    computeTakeoff,
    computeCarbon,
    resolveTasks,
    scheduleStateAt,
    scheduleCoverage,
    scheduleToCsv,
    carbonToCsv,
    taskFinishDate,
    deriveConstructionSequence,
    UNIT_LABEL,
    TAKEOFF_CHAPTERS,
    type TakeoffResult,
    type ConstructionSchedule,
    type ConstructionTask,
    type CarbonResult,
    type CarbonOverrideBook,
    type LevelOrderEntry,
    type SequencedActivity,
    type DerivedConstructionSequence,
} from '@pryzm/core-app-model';
import type { MaterialCarbonFacts } from '@pryzm/schemas/materials';
// The scrubber asks "built by the END of this day?", so it must use the ONE
// spelling of that instant. Hand-rolling `+ MS_DAY - 1` here is how one surface
// comes to disagree with the engine about whether the last day counts.
import { endOfDayMs } from '@pryzm/schemas/construction';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import { escapeHtml } from './DWHelpers';

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime | null;

const MS_DAY = 86_400_000;

// ── The window surfaces this panel reaches, typed structurally ────────────────
//
// A narrow structural interface, NOT `(window as any)` (P4). It names exactly the
// four things the time filter needs: the bus to dispatch the visibility command,
// the projection that writes it onto the scene, the scene itself, and nothing else.

interface SceneNodeLike {
    userData?: { id?: unknown; role?: unknown };
    traverse?: (fn: (node: SceneNodeLike) => void) => void;
}

interface WindowLike {
    selectionManager?: { world?: { scene?: { three?: SceneNodeLike | null } } };
    runtime?: {
        bus?: { executeCommand(type: string, payload: unknown): Promise<unknown> };
        visibility?: {
            applyToScene?: (root: unknown, elementIds: readonly string[]) => { matched: number; hidden: number };
        };
    };
    /* §CONSTRUCTABILITY-SEQUENCE (L-4842) — the level ELEVATIONS. The sequence
       engine will not infer a storey order from a level NAME, so the order has
       to be read from the one place that holds it. Absent ⇒ the engine says the
       order is UNKNOWN and omits the structure-follows-structure dependency —
       ABSENT, not satisfied. */
    bimManager?: { getLevels?: () => Array<{ id?: string; name?: string; elevation?: number }> };
}
const win = (): WindowLike => window as unknown as WindowLike;

/**
 * Read the level order, or return NOTHING. ⛔ There is no fallback ordering here:
 * a guessed storey order would put a slab under a wall it carries.
 */
function readLevelOrder(): LevelOrderEntry[] {
    try {
        const raw = win().bimManager?.getLevels?.() ?? [];
        return raw
            .filter((l) => typeof l?.id === 'string' && Number.isFinite(l?.elevation))
            .map((l) => ({ levelId: l.id as string, name: l.name || (l.id as string), elevation: l.elevation as number }));
    } catch {
        return [];
    }
}

// ── Local presentation constants (see the file header for why they are local) ──

const HEADER_CSS = 'padding:14px 16px;border-bottom:1px solid var(--app-border);flex-shrink:0;';
const NUM = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number): string => NUM.format(n);

function toolbarButton(action: string, label: string, title: string): string {
    return `<button type="button" class="dw-toolbar-btn" data-action="${action}" title="${escapeHtml(title)}">${escapeHtml(label)}</button>`;
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

function emptyState(icon: string, title: string, body: string): string {
    return `
        <div style="height:100%;display:flex;align-items:center;justify-content:center;padding:28px;">
            <div style="max-width:360px;text-align:center;">
                <div class="dw-placeholder-icon">${icon}</div>
                <div style="font-weight:700;font-size:14px;color:var(--app-text);margin:8px 0;">${escapeHtml(title)}</div>
                <div style="font-size:12px;line-height:1.7;color:var(--app-text-muted);">${body}</div>
            </div>
        </div>`;
}

/** The purple statement box both tabs put their coverage sentence in. */
function statementBox(headline: string, value: string, statement: string): string {
    return `
        <div style="margin-top:9px;padding:9px 11px;border:1px solid var(--app-accent);border-radius:9px;background:rgba(102,0,255,.05);">
            <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
                <span style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--app-text-muted);">${escapeHtml(headline)}</span>
                <span style="font-size:20px;font-weight:800;color:var(--app-text);">${value}</span>
            </div>
            <div style="font-size:10.5px;line-height:1.65;color:var(--app-text);margin-top:5px;">${escapeHtml(statement)}</div>
        </div>`;
}

const NOT_MEASURED_BADGE = `<span style="font-size:9px;font-weight:800;letter-spacing:.06em;color:#B3261E;background:rgba(179,38,30,.10);border-radius:99px;padding:2px 7px;white-space:nowrap;">NOT MEASURED</span>`;

// ═════════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═════════════════════════════════════════════════════════════════════════════
//
// ⚠ STATED, NOT HIDDEN — and stated on the face of both tabs, exactly as the 5D
// rate book states it. The programme and the carbon overrides live in THIS
// BROWSER's localStorage, keyed by project id. They are NOT part of the project
// file, they do NOT sync between collaborators, and they are NOT covered by undo.
//
// Putting them in the project file is a FILE-FORMAT change and putting task
// assignment on the element is a SCHEMA change (C67/C68 apply to both). Both are
// named as the next step in ADR-0351 §7 rather than half-done here — a claim the
// code cannot honour is the same defect class as an invented factor.

const SCHEDULE_PREFIX = 'pryzm.mediciones.schedule.';
const CARBON_PREFIX = 'pryzm.mediciones.carbon.';

function projectKey(prefix: string, runtime: Runtime): string {
    return prefix + (runtime?.projectContext?.projectId ?? 'unscoped');
}

function loadSchedule(runtime: Runtime): ConstructionSchedule {
    try {
        const raw = localStorage.getItem(projectKey(SCHEDULE_PREFIX, runtime));
        if (!raw) return { version: 1, tasks: [] };
        const parsed = JSON.parse(raw) as Partial<ConstructionSchedule>;
        return { version: 1, tasks: Array.isArray(parsed.tasks) ? (parsed.tasks as ConstructionTask[]) : [] };
    } catch {
        return { version: 1, tasks: [] };
    }
}

function saveSchedule(runtime: Runtime, schedule: ConstructionSchedule): void {
    try { localStorage.setItem(projectKey(SCHEDULE_PREFIX, runtime), JSON.stringify(schedule)); }
    catch (e) { console.warn('[Mediciones/4D] programme could not be saved to this browser:', e); }
}

function loadCarbonOverrides(runtime: Runtime): CarbonOverrideBook {
    try {
        const raw = localStorage.getItem(projectKey(CARBON_PREFIX, runtime));
        if (!raw) return { entries: {} };
        const parsed = JSON.parse(raw) as Partial<CarbonOverrideBook>;
        return { entries: (parsed.entries ?? {}) as Record<string, MaterialCarbonFacts> };
    } catch {
        return { entries: {} };
    }
}

function saveCarbonOverrides(runtime: Runtime, book: CarbonOverrideBook): void {
    try { localStorage.setItem(projectKey(CARBON_PREFIX, runtime), JSON.stringify(book)); }
    catch (e) { console.warn('[Mediciones/6D] overrides could not be saved to this browser:', e); }
}

// ═════════════════════════════════════════════════════════════════════════════
// 4D — TIME
// ═════════════════════════════════════════════════════════════════════════════

/** Panel-local UI state. Not persisted: a scrubber position is not project data. */
interface TimeUiState {
    /** Day offset from the programme's first day. */
    dayOffset: number;
    /** Whether the last "apply" also hid UNSCHEDULED elements. */
    hideUnscheduled: boolean;
    /** Set while a time filter is projected onto the viewport. */
    applied: boolean;
}

const timeUi = new WeakMap<HTMLElement, TimeUiState>();

export function mountTimePanel(panel: HTMLElement, runtime: Runtime): void {
    withHandlerSpan('pryzm.mediciones.time.render', { 'pryzm.surface': 'dataworkbench.mediciones.time' }, () => {
        renderTime(panel, runtime);
    });
}

function renderTime(panel: HTMLElement, runtime: Runtime): void {
    let takeoff: TakeoffResult;
    try {
        takeoff = computeTakeoff();
    } catch (e) {
        panel.innerHTML = emptyState('◷', 'No programme, because there is no take-off',
            `The take-off failed: <code style="font-size:11px;">${escapeHtml(e instanceof Error ? e.message : String(e))}</code><br><br>A task attaches to measured quantities. Without them there is nothing to schedule.`);
        return;
    }

    const schedule = loadSchedule(runtime);
    const resolved = resolveTasks(schedule, takeoff);
    const coverage = scheduleCoverage(schedule, takeoff);
    const ui = timeUi.get(panel) ?? { dayOffset: 0, hideUnscheduled: false, applied: false };
    timeUi.set(panel, ui);

    const w = coverage.windowMs;
    const totalDays = w ? Math.max(1, Math.round((w.endMs - w.startMs) / MS_DAY) + 1) : 0;
    if (ui.dayOffset > Math.max(0, totalDays - 1)) ui.dayOffset = Math.max(0, totalDays - 1);
    const atMs = w
        ? (endOfDayMs(new Date(w.startMs + ui.dayOffset * MS_DAY).toISOString().slice(0, 10)) ?? w.startMs)
        : Date.now();
    const atIso = new Date(atMs).toISOString().slice(0, 10);
    const state = scheduleStateAt(schedule, takeoff, atMs);

    // §CONSTRUCTABILITY-SEQUENCE (L-4840) — the ORDER, derived. Recomputed on
    // every render for the same reason the take-off is: a stale programme is
    // worse than an absent one, because both are signable.
    const sequence = deriveConstructionSequence(takeoff, readLevelOrder());
    const adoptedActivityIds = new Set(
        schedule.tasks.map((t) => t.notes ?? '').filter((n) => n.startsWith('activity:')).map((n) => n.slice(9)),
    );

    const chapterOptions = TAKEOFF_CHAPTERS
        .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`).join('');

    // Lines a task does not yet cover — the natural thing to schedule next.
    const openLines = takeoff.lines.filter((l) => coverage.unscheduledLineCodes.includes(l.code));

    panel.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
            <div style="${HEADER_CSS}">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:15px;font-weight:800;color:var(--app-text);">4D — Time</span>
                    <span style="font-size:10px;background:rgba(102,0,255,.10);color:var(--app-accent);border-radius:99px;padding:2px 9px;font-weight:700;">${schedule.tasks.length} task${schedule.tasks.length === 1 ? '' : 's'}</span>
                    <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">
                        ${toolbarButton('t-csv', 'Export programme CSV', 'Download the programme, its quantities and its coverage statement')}
                        ${toolbarButton('t-clear', 'Clear programme', 'Delete every task stored for this project in this browser')}
                    </span>
                </div>
                ${statementBox('Programme', w ? `${escapeHtml(new Date(w.startMs).toISOString().slice(0, 10))} → ${escapeHtml(new Date(w.endMs).toISOString().slice(0, 10))}` : '—', coverage.coverageStatement)}
                <div style="font-size:9.5px;line-height:1.6;color:var(--app-text-muted);margin-top:8px;">
                    <strong>PRYZM ships no output rates.</strong> Every duration below is one you typed. There is no
                    m²/day figure in this product and no code path that can invent one — a fabricated productivity
                    number would make this look like a programme while being a drawing.
                    The programme is stored <strong>in this browser only</strong>: it is not in the project file, it does
                    not sync to collaborators, and it is not covered by undo.
                </div>
            </div>

            <div style="flex:1;overflow:auto;padding:14px 16px;">
                ${w === null ? `
                    <div style="padding:22px;text-align:center;border:1px dashed var(--app-border);border-radius:10px;margin-bottom:16px;">
                        <div style="font-size:13px;font-weight:700;color:var(--app-text);margin-bottom:6px;">No dated task yet</div>
                        <div style="font-size:11.5px;line-height:1.7;color:var(--app-text-muted);max-width:420px;margin:0 auto;">
                            Add a task below and the time filter appears. Until then the scrubber has nothing to slide
                            over — which is a real state, not an empty chart drawn at the epoch.
                        </div>
                    </div>` : `
                    <section style="margin-bottom:18px;padding:12px 14px;border:1px solid var(--app-border);border-radius:10px;background:var(--app-panel-bg);">
                        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                            <h4 style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">Time filter</h4>
                            <span style="font-size:18px;font-weight:800;color:var(--app-accent);font-variant-numeric:tabular-nums;">${escapeHtml(atIso)}</span>
                            <span style="font-size:10px;color:var(--app-text-muted);">day ${ui.dayOffset + 1} of ${totalDays}</span>
                        </div>
                        <input data-scrub type="range" min="0" max="${Math.max(0, totalDays - 1)}" value="${ui.dayOffset}" step="1"
                               aria-label="Programme date"
                               style="width:100%;accent-color:var(--app-accent);"/>
                        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:10.5px;">
                            <span style="color:#1D7A4B;font-weight:700;">${state.builtElementIds.length} complete</span>
                            <span style="color:#8A6100;font-weight:700;">${state.inProgressElementIds.length} in progress</span>
                            <span style="color:var(--app-text-muted);font-weight:700;">${state.notStartedElementIds.length} not started</span>
                            <span style="color:#B3261E;font-weight:700;">${state.unscheduledElementIds.length} unscheduled</span>
                        </div>
                        <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            ${toolbarButton('t-apply', 'Show the model at this date', 'Isolate the elements built by this date in the active view')}
                            ${toolbarButton('t-reveal', 'Show everything again', 'Clear the time filter from the viewport')}
                            <label style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--app-text-muted);">
                                <input data-hide-unscheduled type="checkbox" ${ui.hideUnscheduled ? 'checked' : ''}/>
                                also hide the ${state.unscheduledElementIds.length} UNSCHEDULED elements
                            </label>
                        </div>
                        <div style="margin-top:8px;font-size:9.5px;line-height:1.6;color:var(--app-text-muted);">
                            An element in a task that has <strong>started but not finished</strong> is drawn WHOLE — PRYZM
                            does not model partial construction, and a half-built wall would be a different geometry, not a
                            transparency.
                            ${ui.hideUnscheduled
                                ? '<br><strong style="color:#B3261E;">You have chosen to hide unscheduled elements.</strong> That asserts they are not yet built. Nobody has said when they are built, so the viewport is now showing a claim the programme does not support.'
                                : '<br>Unscheduled elements stay VISIBLE: nobody has said when they are built, and hiding them would assert they are not.'}
                            <br>The filter is applied through the visibility-intent command bus. It is <strong>not undoable</strong>
                            (those handlers declare no store patch) — use “Show everything again”.
                        </div>
                    </section>`}

                ${sequenceSection(sequence, takeoff, adoptedActivityIds)}

                <section style="margin-bottom:18px;">
                    <h4 style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">Add a task</h4>
                    ${openLines.length === 0 && takeoff.lines.length > 0 ? `
                        <div style="font-size:11px;color:var(--app-text-muted);line-height:1.6;margin-bottom:8px;">
                            Every take-off line is already covered by a task. Pick any line to add a second task against it
                            (a wall is built twice: blockwork, then plaster).
                        </div>` : ''}
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;padding:11px 12px;border:1px solid var(--app-border);border-radius:9px;background:var(--app-panel-bg);">
                        <label style="flex:2;min-width:220px;font-size:10px;color:var(--app-text-muted);">
                            Take-off line (this is what the task builds)
                            <select data-new-line style="width:100%;box-sizing:border-box;margin-top:3px;padding:6px;border:1px solid var(--app-border);border-radius:6px;font-size:11px;background:#fff;color:var(--app-text);">
                                ${takeoff.lines.length === 0
                                    ? '<option value="">— the take-off has no lines —</option>'
                                    : (openLines.length > 0 ? openLines : takeoff.lines)
                                        .map((l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.description)} — ${escapeHtml(fmt(l.quantity))} ${escapeHtml(UNIT_LABEL[l.unit])}</option>`).join('')}
                            </select>
                        </label>
                        <label style="flex:1;min-width:130px;font-size:10px;color:var(--app-text-muted);">
                            Start
                            <input data-new-start type="date" value="${escapeHtml(new Date().toISOString().slice(0, 10))}"
                                   style="width:100%;box-sizing:border-box;margin-top:3px;padding:5px 7px;border:1px solid var(--app-border);border-radius:6px;font-size:11px;background:#fff;color:var(--app-text);"/>
                        </label>
                        <label style="flex:1;min-width:150px;font-size:10px;color:var(--app-text-muted);">
                            Duration — calendar days, <strong>you type it</strong>
                            <input data-new-days type="number" min="1" step="1" placeholder="days"
                                   style="width:100%;box-sizing:border-box;margin-top:3px;padding:5px 7px;border:1px solid var(--app-border);border-radius:6px;font-size:11px;background:#fff;color:var(--app-text);"/>
                        </label>
                        <label style="flex:1;min-width:130px;font-size:10px;color:var(--app-text-muted);">
                            Chapter
                            <select data-new-chapter style="width:100%;box-sizing:border-box;margin-top:3px;padding:6px;border:1px solid var(--app-border);border-radius:6px;font-size:11px;background:#fff;color:var(--app-text);">${chapterOptions}</select>
                        </label>
                        ${toolbarButton('t-add', 'Add task', 'Create the task. A duration is required — there is no default, because PRYZM has no output rate to derive one from.')}
                    </div>
                </section>

                <section>
                    <h4 style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">Tasks</h4>
                    ${resolved.length === 0
                        ? '<div style="font-size:11px;color:var(--app-text-muted);">No task yet.</div>'
                        : `<div style="display:flex;flex-direction:column;gap:7px;">${resolved.map((r) => taskCard(r, state)).join('')}</div>`}
                </section>
            </div>
        </div>`;

    bindTime(panel, runtime, takeoff, schedule, state, totalDays);
    bindSequence(panel, runtime, takeoff, schedule, sequence);
}

/**
 * §CONSTRUCTABILITY-SEQUENCE (L-4840) — adopting a derived activity as a real task.
 *
 * ⛔ THE DURATION IS DEMANDED, NOT DEFAULTED, AND THE REFUSAL SAYS WHY. This is
 * the exact branch ADR-0351 protects: a lane implementing "give me an estimate"
 * is under maximum pressure to put a plausible number in this field. It does not,
 * and the message names what PRYZM would have had to invent.
 *
 * The adopted task records `notes: 'activity:<id>'` so the panel can show which
 * activities have been taken up — a derived read model and a stored task must not
 * be confused, and this is the one thread between them.
 */
function bindSequence(
    panel: HTMLElement,
    runtime: Runtime,
    takeoff: TakeoffResult,
    schedule: ConstructionSchedule,
    sequence: DerivedConstructionSequence,
): void {
    panel.querySelectorAll<HTMLButtonElement>('[data-seq-adopt]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.seqAdopt!;
            const activity = sequence.activities.find((a) => a.id === id);
            if (!activity) return;
            const daysInput = panel.querySelector<HTMLInputElement>(`[data-seq-days="${CSS.escape(id)}"]`);
            const raw = daysInput?.value.trim() ?? '';
            if (raw === '') {
                alert(
                    'Enter a duration in calendar days for this activity.\n\n'
                    + 'PRYZM derived the ORDER and the DEPENDENCIES from your model — those rest on no number. '
                    + 'A DURATION rests on an output rate (m²/day), PRYZM ships none, and a figure it could not '
                    + 'cite would turn this programme into a drawing with dates on it.',
                );
                daysInput?.focus();
                return;
            }
            const days = Number(raw);
            if (!Number.isFinite(days) || days < 1 || Math.round(days) !== days) {
                alert('Duration must be a whole number of calendar days, at least 1.');
                return;
            }
            const b = bindingForActivity(activity, takeoff);
            const task: ConstructionTask = {
                id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                name: `${activity.stageLabel} — ${activity.levelName}`,
                chapter: undefined,
                startDate: new Date().toISOString().slice(0, 10),
                durationDays: days,
                // ⭐ TRUE AT THE MOMENT IT IS WRITTEN: the user just typed it.
                durationSource: 'USER_ENTERED',
                lineCodes: b.lineCodes,
                elementIds: b.elementIds,
                // `dependsOn` carries the DERIVED order. ⚠ It is still RECORDED,
                // NOT SOLVED (ADR-0351 §8 4D-3): moving a predecessor moves
                // nothing, because with no durations there is nothing to pass
                // forward. What changed is only that the dependency is now
                // derived rather than hand-typed.
                dependsOn: [],
                notes: `activity:${activity.id}`,
            };
            saveSchedule(runtime, { version: 1, tasks: [...schedule.tasks, task] });
            renderTime(panel, runtime);
        });
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// 4D — THE DERIVED SEQUENCE (§CONSTRUCTABILITY-SEQUENCE, L-4840, ADR-0353 §3)
// ═════════════════════════════════════════════════════════════════════════════
//
// ⭐ WHAT THIS SECTION IS, AND WHAT THE PANEL ABOVE IT STILL REFUSES.
// Founder, 2026-08-22: "you know how a project starts being built — so you could
// create an algorithm that checks the elements, levels and constructability, and
// based on this we should provide the estimate."
//
// The ORDER is derived and shown here. The DURATION is not, and the panel's
// existing sentence about output rates is UNCHANGED, because it is still true:
// PRYZM has no m²/day figure and will not invent one. Each activity therefore
// reads `—` where a duration would be, with the reason beside it. That is
// strictly more than the blank programme this tab had before — the user gets the
// order, the dependencies and the quantities, and types the one number only they
// can source.
//
// ⛔ NOTHING HERE WRITES A TASK BY ITSELF. Adopting an activity is an explicit
// click that REQUIRES the user to type days first, so `durationSource:
// 'USER_ENTERED'` stays true at the moment it is written.

/**
 * How an adopted task should be bound to the model.
 *
 * ⭐ THE HONEST SPLIT. A `ConstructionTask` joins by take-off LINE CODE, which
 * survives a delete-and-redraw. But an activity is per LEVEL and a line is NOT —
 * one `WALL.blockwork.200` line covers every storey — so a line code can only be
 * used when every element behind it is on THIS activity's level. Where it is
 * not, the task falls back to explicit `elementIds`, which do NOT survive a
 * redraw, and the panel SAYS SO on the button rather than letting the user find
 * out when their programme silently empties.
 */
function bindingForActivity(
    activity: SequencedActivity,
    takeoff: TakeoffResult,
): { lineCodes: string[]; elementIds: string[]; tracksModel: boolean } {
    const lineCodes: string[] = [];
    const elementIds: string[] = [];
    for (const code of activity.lineCodes) {
        const line = takeoff.lines.find((l) => l.code === code);
        if (!line) continue;
        const spansOtherLevels = line.contributions.some(
            (c) => (c.levelId ?? ' NO-LEVEL') !== activity.levelId,
        );
        if (spansOtherLevels) {
            for (const c of line.contributions) {
                if ((c.levelId ?? ' NO-LEVEL') === activity.levelId) elementIds.push(c.elementId);
            }
        } else {
            lineCodes.push(code);
        }
    }
    return { lineCodes, elementIds, tracksModel: elementIds.length === 0 };
}

/** One derived activity, with its dependencies, its quantities and its absent duration. */
function activityCard(a: SequencedActivity, takeoff: TakeoffResult, alreadyAdopted: boolean): string {
    const b = bindingForActivity(a, takeoff);
    const inputCss = 'padding:4px 6px;border:1px solid var(--app-border);border-radius:6px;font-size:10.5px;background:#fff;color:var(--app-text);';
    return `
        <article style="padding:9px 11px;border:1px solid ${a.measuredNothing ? 'rgba(179,38,30,.4)' : 'var(--app-border)'};border-radius:9px;background:var(--app-panel-bg);">
            <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;">
                <div style="flex:2;min-width:230px;">
                    <div style="display:flex;gap:7px;align-items:baseline;flex-wrap:wrap;">
                        <span style="font-size:9px;font-weight:800;color:var(--app-accent);background:rgba(102,0,255,.10);border-radius:99px;padding:2px 7px;white-space:nowrap;">${a.rank}</span>
                        <span style="font-size:12px;font-weight:700;color:var(--app-text);">${escapeHtml(a.stageLabel)}</span>
                        <span style="font-size:10px;color:var(--app-text-muted);">${escapeHtml(a.levelName)}</span>
                        ${a.measuredNothing ? '<span style="font-size:9px;font-weight:800;color:#B3261E;background:rgba(179,38,30,.10);border-radius:99px;padding:2px 7px;">MEASURES NOTHING</span>' : `<span style="font-size:9px;color:var(--app-text-muted);background:var(--app-bg);border:1px solid var(--app-border);border-radius:99px;padding:1px 7px;">${a.elementIds.length} element${a.elementIds.length === 1 ? '' : 's'}</span>`}
                    </div>
                    ${a.quantities.length > 0 ? `
                        <div style="margin-top:5px;font-size:9.5px;line-height:1.6;color:var(--app-text-muted);white-space:normal;overflow-wrap:break-word;">
                            builds ${a.quantities.map((q) => `<strong>${escapeHtml(fmt(q.quantity))} ${escapeHtml(UNIT_LABEL[q.unit])}</strong> ${escapeHtml(q.description)}`).join(' · ')}
                        </div>` : ''}
                    ${a.dependsOn.length > 0 ? `
                        <details style="margin-top:5px;">
                            <summary style="font-size:9.5px;color:var(--app-accent);cursor:pointer;">follows ${a.dependsOn.length} activit${a.dependsOn.length === 1 ? 'y' : 'ies'} — why</summary>
                            <div style="margin-top:4px;font-size:9.5px;line-height:1.6;color:var(--app-text-muted);white-space:normal;overflow-wrap:break-word;">
                                ${a.dependsOn.map((d, i) => `<div style="margin-bottom:3px;"><code style="font-size:8.5px;">${escapeHtml(d)}</code> — ${escapeHtml(a.dependencyReasons[i] ?? '')}</div>`).join('')}
                            </div>
                        </details>` : ''}
                    ${a.note ? `<div style="margin-top:5px;font-size:9.5px;line-height:1.55;color:#8A6100;white-space:normal;overflow-wrap:break-word;">⚠ ${escapeHtml(a.note)}</div>` : ''}
                </div>
                <div style="text-align:right;min-width:150px;max-width:230px;">
                    <div style="font-size:9px;color:var(--app-text-muted);">duration</div>
                    <div style="font-size:20px;font-weight:800;color:#B3261E;line-height:1;">—</div>
                    <div style="font-size:8.5px;line-height:1.5;color:var(--app-text-muted);margin-top:4px;text-align:left;white-space:normal;overflow-wrap:break-word;">${escapeHtml(a.durationNote)}</div>
                    ${a.measuredNothing ? '' : `
                        <div style="margin-top:7px;display:flex;gap:5px;align-items:center;justify-content:flex-end;flex-wrap:wrap;">
                            <input data-seq-days="${escapeHtml(a.id)}" type="number" min="1" step="1" placeholder="days" style="width:66px;${inputCss}"/>
                            <button type="button" class="dw-toolbar-btn" data-seq-adopt="${escapeHtml(a.id)}" title="Create a task from this activity. You must type the duration — PRYZM has none to offer.">${alreadyAdopted ? 'Adopt again' : 'Adopt as task'}</button>
                        </div>
                        <div style="margin-top:4px;font-size:8.5px;line-height:1.5;color:${b.tracksModel ? 'var(--app-text-muted)' : '#8A6100'};text-align:left;white-space:normal;overflow-wrap:break-word;">
                            ${b.tracksModel
                                ? 'Adopted by LINE CODE: draw more of this and it is already scheduled.'
                                : '⚠ Adopted by ELEMENT ID, because the take-off line behind this activity spans more than one storey and there is no per-level line code. This task will NOT follow a delete-and-redraw of those elements.'}
                        </div>`}
                </div>
            </div>
        </article>`;
}

/** The whole derived-sequence section, including its refusal statement. */
function sequenceSection(seq: DerivedConstructionSequence, takeoff: TakeoffResult, adopted: ReadonlySet<string>): string {
    return `
        <section style="margin-bottom:18px;">
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding-bottom:6px;border-bottom:2px solid var(--app-accent);margin-bottom:8px;">
                <h4 style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">Derived build sequence</h4>
                <span style="font-size:10px;color:var(--app-text-muted);font-style:italic;">Secuencia constructiva</span>
                <span style="margin-left:auto;font-size:10px;color:var(--app-text-muted);">${seq.activities.length} activities</span>
            </div>
            <div style="font-size:10.5px;line-height:1.65;color:var(--app-text);margin-bottom:10px;padding:9px 11px;border:1px solid var(--app-accent);border-radius:9px;background:rgba(102,0,255,.05);white-space:normal;overflow-wrap:break-word;">
                ${escapeHtml(seq.coverageStatement)}
            </div>
            <div style="display:flex;flex-direction:column;gap:7px;">
                ${seq.activities.map((a) => activityCard(a, takeoff, adopted.has(a.id))).join('')}
            </div>
        </section>`;
}

/**
 * One task row. Takes the SLICE rather than the instant: `state` already carries
 * the answer `taskProgressAt(task, atMs)` would recompute, and asking the same
 * question twice is how a card comes to disagree with the counts above it.
 */
function taskCard(
    r: ReturnType<typeof resolveTasks>[number],
    state: ReturnType<typeof scheduleStateAt>,
): string {
    const finish = taskFinishDate(r.task);
    const st = state.tasks.find((t) => t.task.id === r.task.id)?.state ?? null;
    const stateChip = st === null
        ? `<span style="font-size:9px;font-weight:800;color:#B3261E;background:rgba(179,38,30,.10);border-radius:99px;padding:2px 7px;">DATES UNUSABLE</span>`
        : `<span style="font-size:9px;font-weight:800;letter-spacing:.05em;border-radius:99px;padding:2px 7px;${
            st === 'COMPLETE' ? 'color:#1D7A4B;background:rgba(29,122,75,.10);'
            : st === 'IN_PROGRESS' ? 'color:#8A6100;background:rgba(138,97,0,.10);'
            : 'color:var(--app-text-muted);background:rgba(0,0,0,.05);'}">${st.replace('_', ' ')}</span>`;

    const inputCss = 'padding:4px 6px;border:1px solid var(--app-border);border-radius:6px;font-size:10.5px;background:#fff;color:var(--app-text);';

    return `
        <article style="padding:9px 11px;border:1px solid ${r.defects.length > 0 ? 'rgba(179,38,30,.4)' : 'var(--app-border)'};border-radius:9px;background:var(--app-panel-bg);">
            <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;">
                <div style="flex:2;min-width:200px;">
                    <input data-task-name="${escapeHtml(r.task.id)}" type="text" value="${escapeHtml(r.task.name)}"
                           aria-label="Task name"
                           style="width:100%;box-sizing:border-box;font-weight:700;font-size:12px;${inputCss}"/>
                    <div style="margin-top:4px;display:flex;gap:5px;flex-wrap:wrap;">
                        ${stateChip}
                        ${r.task.chapter ? `<span style="font-size:9px;color:var(--app-text-muted);background:var(--app-bg);border:1px solid var(--app-border);border-radius:99px;padding:1px 7px;">${escapeHtml(r.task.chapter)}</span>` : ''}
                        <span style="font-size:9px;color:var(--app-text-muted);background:var(--app-bg);border:1px solid var(--app-border);border-radius:99px;padding:1px 7px;">${r.elementIds.length} element${r.elementIds.length === 1 ? '' : 's'}</span>
                    </div>
                    <div style="margin-top:5px;font-size:9.5px;line-height:1.55;color:var(--app-text-muted);font-family:ui-monospace,Menlo,Consolas,monospace;">
                        ${r.task.lineCodes.map((c) => escapeHtml(c)).join('  ')}
                    </div>
                    ${r.quantities.length > 0 ? `
                        <div style="margin-top:4px;font-size:9.5px;color:var(--app-text-muted);">
                            builds ${r.quantities.map((q) => `<strong>${escapeHtml(fmt(q.quantity))} ${escapeHtml(UNIT_LABEL[q.unit])}</strong>`).join(', ')}
                        </div>` : ''}
                    ${r.unresolvedLineCodes.length > 0 ? `
                        <div style="margin-top:5px;font-size:9.5px;line-height:1.5;color:#B3261E;">
                            ⚠ ${r.unresolvedLineCodes.length} line code${r.unresolvedLineCodes.length === 1 ? '' : 's'} on this task
                            no longer exist${r.unresolvedLineCodes.length === 1 ? 's' : ''} in the take-off
                            (${escapeHtml(r.unresolvedLineCodes.join(', '))}) — the model changed after the task was written.
                        </div>` : ''}
                    ${r.defects.length > 0 ? `
                        <div style="margin-top:5px;font-size:9.5px;line-height:1.5;color:#B3261E;">
                            ${r.defects.map((d) => `⛔ ${escapeHtml(d)}`).join('<br>')}
                        </div>` : ''}
                </div>
                <label style="font-size:9px;color:var(--app-text-muted);display:flex;flex-direction:column;gap:2px;">
                    Start
                    <input data-task-start="${escapeHtml(r.task.id)}" type="date" value="${escapeHtml(r.task.startDate)}" style="${inputCss}"/>
                </label>
                <label style="font-size:9px;color:var(--app-text-muted);display:flex;flex-direction:column;gap:2px;">
                    Days (USER-ENTERED)
                    <input data-task-days="${escapeHtml(r.task.id)}" type="number" min="1" step="1" value="${escapeHtml(String(r.task.durationDays))}" style="width:74px;${inputCss}"/>
                </label>
                <div style="text-align:right;min-width:92px;">
                    <div style="font-size:9px;color:var(--app-text-muted);">finishes</div>
                    <div style="font-size:11.5px;font-weight:700;color:var(--app-text);font-variant-numeric:tabular-nums;">${escapeHtml(finish ?? 'INVALID')}</div>
                    <button type="button" class="dw-toolbar-btn" data-task-del="${escapeHtml(r.task.id)}" title="Delete this task" style="margin-top:5px;">Delete</button>
                </div>
            </div>
        </article>`;
}

function bindTime(
    panel: HTMLElement,
    runtime: Runtime,
    takeoff: TakeoffResult,
    schedule: ConstructionSchedule,
    state: ReturnType<typeof scheduleStateAt>,
    totalDays: number,
): void {
    const ui = timeUi.get(panel)!;
    const rerender = () => renderTime(panel, runtime);
    const write = (tasks: readonly ConstructionTask[]) => {
        saveSchedule(runtime, { version: 1, tasks });
        rerender();
    };
    const patch = (id: string, p: Partial<ConstructionTask>) =>
        write(schedule.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)));

    panel.querySelector<HTMLInputElement>('[data-scrub]')?.addEventListener('input', (ev) => {
        ui.dayOffset = Math.max(0, Math.min(totalDays - 1, Number((ev.target as HTMLInputElement).value)));
        rerender();
    });

    panel.querySelector<HTMLInputElement>('[data-hide-unscheduled]')?.addEventListener('change', (ev) => {
        ui.hideUnscheduled = (ev.target as HTMLInputElement).checked;
        rerender();
    });

    panel.querySelector('[data-action="t-apply"]')?.addEventListener('click', () => {
        void applyTimeFilter(state, ui.hideUnscheduled);
    });
    panel.querySelector('[data-action="t-reveal"]')?.addEventListener('click', () => {
        void clearTimeFilter();
    });

    panel.querySelector('[data-action="t-add"]')?.addEventListener('click', () => {
        const code = panel.querySelector<HTMLSelectElement>('[data-new-line]')?.value ?? '';
        const start = panel.querySelector<HTMLInputElement>('[data-new-start]')?.value ?? '';
        const daysRaw = panel.querySelector<HTMLInputElement>('[data-new-days]')?.value.trim() ?? '';
        const chapter = panel.querySelector<HTMLSelectElement>('[data-new-chapter]')?.value ?? '';
        if (!code) { alert('Pick a take-off line. A task with nothing to build schedules nothing.'); return; }
        if (!start) { alert('Pick a start date.'); return; }
        // ⛔ NO DEFAULT DURATION. PRYZM holds no output rate, so it cannot propose
        // one; refusing is the honest branch and the message says why.
        if (daysRaw === '') {
            alert('Enter a duration in calendar days.\n\nPRYZM ships no output rates (m²/day), so it cannot propose one for you — a figure it could not cite would be a fabrication with a schedule bar attached.');
            return;
        }
        const days = Number(daysRaw);
        if (!Number.isFinite(days) || days < 1 || Math.round(days) !== days) {
            alert('Duration must be a whole number of calendar days, at least 1.');
            return;
        }
        const line = takeoff.lines.find((l) => l.code === code);
        const task: ConstructionTask = {
            id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            name: line?.description ?? code,
            chapter: chapter || line?.chapter,
            startDate: start,
            durationDays: days,
            durationSource: 'USER_ENTERED',
            lineCodes: [code],
            elementIds: [],
            dependsOn: [],
        };
        write([...schedule.tasks, task]);
    });

    panel.querySelectorAll<HTMLInputElement>('[data-task-name]').forEach((i) =>
        i.addEventListener('change', () => patch(i.dataset.taskName!, { name: i.value })));
    panel.querySelectorAll<HTMLInputElement>('[data-task-start]').forEach((i) =>
        i.addEventListener('change', () => patch(i.dataset.taskStart!, { startDate: i.value })));
    panel.querySelectorAll<HTMLInputElement>('[data-task-days]').forEach((i) =>
        i.addEventListener('change', () => {
            const n = Number(i.value);
            // An unusable duration is STORED as typed and reported as a defect on
            // the card, rather than being silently coerced to something valid.
            patch(i.dataset.taskDays!, { durationDays: Number.isFinite(n) ? n : 0 });
        }));
    panel.querySelectorAll<HTMLButtonElement>('[data-task-del]').forEach((b) =>
        b.addEventListener('click', () => {
            const id = b.dataset.taskDel!;
            if (!confirm('Delete this task? The model is unaffected.')) return;
            write(schedule.tasks.filter((t) => t.id !== id));
        }));

    panel.querySelector('[data-action="t-csv"]')?.addEventListener('click', () => {
        download(
            `pryzm-programme-${new Date().toISOString().slice(0, 10)}.csv`,
            scheduleToCsv(resolveTasks(schedule, takeoff), scheduleCoverage(schedule, takeoff)),
        );
    });
    panel.querySelector('[data-action="t-clear"]')?.addEventListener('click', () => {
        if (!confirm('Delete every task stored for this project in this browser? The model is unaffected.')) return;
        write([]);
    });
}

/**
 * Project the time slice onto the viewport.
 *
 * ⭐ THROUGH THE BUS, NOT BY WALKING THE SCENE. `visibility.isolate.selection` is
 * a compose-root-registered command and `runtime.visibility.applyToScene` is the
 * sanctioned projection (P7: the UI states intent, the composition layer performs
 * it). This panel never assigns `node.visible` itself.
 *
 * ⚠ It is NOT undoable — those handlers declare no store patch — which is why the
 * surface offers an explicit "show everything again" rather than implying Ctrl+Z.
 */
async function applyTimeFilter(
    state: ReturnType<typeof scheduleStateAt>,
    hideUnscheduled: boolean,
): Promise<void> {
    const rt = win().runtime;
    const bus = rt?.bus;
    const applyToScene = rt?.visibility?.applyToScene;
    const scene = win().selectionManager?.world?.scene?.three ?? null;
    if (!bus || typeof applyToScene !== 'function' || !scene || typeof scene.traverse !== 'function') {
        alert('The visibility system or the scene is not ready — nothing was changed.');
        return;
    }
    const visible = new Set<string>([...state.builtElementIds, ...state.inProgressElementIds]);
    if (!hideUnscheduled) for (const id of state.unscheduledElementIds) visible.add(id);
    try {
        await bus.executeCommand('visibility.isolate.selection', { elementIds: [...visible] });
    } catch (err) {
        alert(`The time filter did not apply — visibility.isolate.selection: ${String((err as Error)?.message ?? err)}`);
        return;
    }
    // Isolate changes what the user did NOT name, so every id-carrying node has
    // to be re-projected, not only the visible set.
    applyToScene(scene, collectSceneElementIds(scene, false));
}

async function clearTimeFilter(): Promise<void> {
    const rt = win().runtime;
    const bus = rt?.bus;
    const applyToScene = rt?.visibility?.applyToScene;
    const scene = win().selectionManager?.world?.scene?.three ?? null;
    if (!bus || typeof applyToScene !== 'function' || !scene) return;
    try {
        await bus.executeCommand('visibility.reveal.all', {});
    } catch (err) {
        console.warn('[Mediciones/4D] reveal.all failed:', err);
        return;
    }
    applyToScene(scene, collectSceneElementIds(scene, true));
    window.dispatchEvent(new CustomEvent('pryzm-visibility-command', {
        detail: { action: 'restore', target: 'all', value: '' },
    }));
}

function collectSceneElementIds(scene: SceneNodeLike, excludeEdges: boolean): string[] {
    const out = new Set<string>();
    scene.traverse?.((node) => {
        const id = node.userData?.id;
        if (id === undefined || id === null) return;
        if (excludeEdges && node.userData?.role === 'edges') return;
        out.add(String(id));
    });
    return [...out];
}

// ═════════════════════════════════════════════════════════════════════════════
// 6D — CARBON
// ═════════════════════════════════════════════════════════════════════════════

export function mountCarbonPanel(panel: HTMLElement, runtime: Runtime): void {
    withHandlerSpan('pryzm.mediciones.carbon.render', { 'pryzm.surface': 'dataworkbench.mediciones.carbon' }, () => {
        renderCarbon(panel, runtime);
    });
}

function renderCarbon(panel: HTMLElement, runtime: Runtime): void {
    let takeoff: TakeoffResult;
    try {
        takeoff = computeTakeoff();
    } catch (e) {
        panel.innerHTML = emptyState('◍', 'No carbon, because there is no take-off',
            `The take-off failed: <code style="font-size:11px;">${escapeHtml(e instanceof Error ? e.message : String(e))}</code><br><br>Embodied carbon is volume × density × factor. Without the volume there is nothing to multiply.`);
        return;
    }

    const overrides = loadCarbonOverrides(runtime);
    const carbon: CarbonResult = computeCarbon(takeoff, overrides);
    const s = carbon.summary;

    if (takeoff.lines.length === 0) {
        panel.innerHTML = emptyState('◍', 'Nothing to measure yet',
            'The take-off produced no lines, so there is no volume a carbon factor could apply to.');
        return;
    }

    panel.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
            <div style="${HEADER_CSS}">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:15px;font-weight:800;color:var(--app-text);">6D — Embodied carbon</span>
                    <span style="font-size:10px;background:rgba(102,0,255,.10);color:var(--app-accent);border-radius:99px;padding:2px 9px;font-weight:700;">A1–A3</span>
                    <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">
                        ${toolbarButton('c-refresh', 'Recompute', 'Re-measure from the current model')}
                        ${toolbarButton('c-csv', 'Export carbon CSV', 'Download every row with its factor, its citation and its verification state')}
                        ${toolbarButton('c-clear', 'Clear my factors', 'Delete every factor you entered for this project in this browser')}
                    </span>
                </div>
                ${statementBox(
                    'Measured A1–A3',
                    s.measuredVolumeM3 > 0
                        ? `${escapeHtml(fmt(s.totalKgCO2e))} <span style="font-size:12px;font-weight:700;">kgCO₂e</span>`
                        : '—',
                    s.coverageStatement,
                )}
                <div style="margin-top:9px;padding:9px 11px;border:1px solid rgba(179,38,30,.35);border-radius:9px;background:rgba(179,38,30,.06);font-size:10.5px;line-height:1.65;color:var(--app-text);">
                    <strong>Every factor PRYZM ships is UNVERIFIED.</strong> Each names a real published dataset and the
                    row within it — and <strong>nobody has re-opened that dataset and confirmed the figure</strong>.
                    “Cited” and “checked” are different facts and this surface keeps them apart. These are generic
                    figures for ranking options, not a verified assessment: before a number here goes into a planning
                    submission, replace it with an EPD for the product you have actually specified.
                    PRYZM redistributes no licensed carbon database; the factors you enter are stored
                    <strong>in this browser only</strong> and are not in the project file.
                </div>
            </div>

            <div style="flex:1;overflow:auto;padding:14px 16px;">
                ${chapterBlock(carbon)}
                ${lineBlock(carbon)}
                ${gapBlock(carbon, overrides)}
            </div>
        </div>`;

    bindCarbon(panel, runtime, takeoff, carbon, overrides);
}

function chapterBlock(carbon: CarbonResult): string {
    const measured = carbon.chapters.filter((c) => c.kgCO2e > 0);
    if (measured.length === 0) return '';
    const max = Math.max(...measured.map((c) => c.kgCO2e));
    return `
        <section style="margin-bottom:20px;">
            <h4 style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">By chapter</h4>
            <div style="font-size:10px;line-height:1.6;color:var(--app-text-muted);margin-bottom:9px;">
                Measured rows only. A chapter missing from this list measured <strong>nothing</strong> — it is not zero-carbon.
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
                ${measured.map((c) => {
                    const label = TAKEOFF_CHAPTERS.find((x) => x.id === c.chapter);
                    return `
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="min-width:150px;font-size:11px;font-weight:700;color:var(--app-text);">${escapeHtml(label?.label ?? c.chapter)}</div>
                        <div style="flex:1;height:9px;background:var(--app-bg);border-radius:99px;overflow:hidden;">
                            <div style="height:100%;width:${Math.max(2, (c.kgCO2e / max) * 100)}%;background:var(--app-accent);"></div>
                        </div>
                        <div style="min-width:120px;text-align:right;font-size:11px;font-weight:800;color:var(--app-text);font-variant-numeric:tabular-nums;">${escapeHtml(fmt(c.kgCO2e))} kg</div>
                        <div style="min-width:96px;text-align:right;font-size:9.5px;color:${c.unmeasuredVolumeM3 > 0 ? '#B3261E' : 'var(--app-text-muted)'};">
                            ${c.unmeasuredVolumeM3 > 0 ? `${escapeHtml(fmt(c.unmeasuredVolumeM3))} m³ unmeasured` : 'all measured'}
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </section>`;
}

function lineBlock(carbon: CarbonResult): string {
    const rows = carbon.lines.filter((l) => l.materials.length > 0);
    const unattributed = carbon.lines.filter((l) => l.materials.length === 0);
    return `
        <section style="margin-bottom:20px;">
            <h4 style="margin:0 0 9px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">Per take-off line</h4>
            ${rows.length === 0 ? '<div style="font-size:11px;color:var(--app-text-muted);">No take-off line names a material, so no line can be asked about.</div>' : ''}
            <div style="display:flex;flex-direction:column;gap:7px;">
                ${rows.map((cl) => `
                    <article style="padding:9px 11px;border:1px solid var(--app-border);border-radius:9px;background:var(--app-panel-bg);">
                        <div style="display:flex;gap:12px;align-items:flex-start;">
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:12px;font-weight:700;color:var(--app-text);">${escapeHtml(cl.line.description)}</div>
                                <div style="font-size:9px;font-family:ui-monospace,Menlo,Consolas,monospace;color:var(--app-text-muted);margin-top:2px;">${escapeHtml(cl.line.code)}</div>
                            </div>
                            <div style="text-align:right;white-space:nowrap;">
                                ${cl.kgCO2e === null
                                    ? NOT_MEASURED_BADGE
                                    : `<div style="font-size:15px;font-weight:800;color:var(--app-text);">${escapeHtml(fmt(cl.kgCO2e))}</div>
                                       <div style="font-size:9px;color:var(--app-text-muted);">kgCO₂e</div>`}
                            </div>
                        </div>
                        <div style="margin-top:7px;display:flex;flex-direction:column;gap:5px;">
                            ${cl.materials.map((m) => materialRow(m)).join('')}
                        </div>
                    </article>`).join('')}
            </div>
            ${unattributed.length === 0 ? '' : `
                <details style="margin-top:10px;" open>
                    <summary style="font-size:10.5px;color:var(--app-accent);cursor:pointer;">
                        ${unattributed.length} take-off line${unattributed.length === 1 ? '' : 's'} name no material at all — and each says why
                    </summary>
                    <div style="margin-top:6px;font-size:10px;line-height:1.65;color:var(--app-text-muted);white-space:normal;overflow-wrap:break-word;">
                        These carry real quantities but no material reference, so carbon cannot even be <em>asked</em> about them —
                        a different gap from “no factor”, and fixed differently (tag the element, don't hunt for a factor).
                        <!-- §MATERIAL-ATTRIBUTION-REASONS (L-4820). This block used to print a
                             list of bare line codes. A code names WHICH line is unattributed and
                             nothing about WHY, so the user was told there was a problem and given
                             no way to act on it — which is why it now prints the reason the
                             take-off itself recorded, per line. The four causes have four
                             different fixes and only the take-off knows which applies. -->
                        <div style="margin-top:7px;display:flex;flex-direction:column;gap:5px;">
                            ${unattributed.map((l) => `
                                <div style="padding:7px 9px;border:1px solid var(--app-border);border-radius:7px;background:var(--app-panel-bg);">
                                    <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;">
                                        <code style="font-size:9px;font-family:ui-monospace,Menlo,Consolas,monospace;color:var(--app-text);word-break:break-all;">${escapeHtml(l.line.code)}</code>
                                        <span style="font-size:9.5px;color:var(--app-text-muted);">${escapeHtml(fmt(l.unmeasuredVolumeM3))} m³ unattributed</span>
                                        ${NOT_MEASURED_BADGE}
                                    </div>
                                    <div style="margin-top:4px;font-size:9.5px;line-height:1.55;color:#8A6100;white-space:normal;overflow-wrap:break-word;">
                                        ${escapeHtml(l.line.materialGap ?? 'The take-off recorded no reason. That is itself a defect — §MATERIAL-ATTRIBUTION-REASONS requires one, and everyUnattributedLineStatesItsReason() should have caught it.')}
                                    </div>
                                </div>`).join('')}
                        </div>
                    </div>
                </details>`}
        </section>`;
}

function materialRow(m: CarbonResult['lines'][number]['materials'][number]): string {
    const f = m.factor;
    const head = `
        <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;">
            <span style="font-size:11px;font-weight:700;color:var(--app-text);">${escapeHtml(m.materialLabel ?? m.materialId)}</span>
            ${m.note ? `<span style="font-size:9px;color:var(--app-text-muted);">${escapeHtml(m.note)}</span>` : ''}
            <span style="font-size:9.5px;color:var(--app-text-muted);">${escapeHtml(fmt(m.volumeM3))} m³</span>
            ${m.massKg === null ? '' : `<span style="font-size:9.5px;color:var(--app-text-muted);">${escapeHtml(fmt(m.massKg))} kg</span>`}
            ${m.overridden ? '<span style="font-size:9px;font-weight:800;color:var(--app-accent);">YOUR FACTOR</span>' : ''}
            <span style="margin-left:auto;font-size:11px;font-weight:800;color:${m.kgCO2e === null ? '#B3261E' : 'var(--app-text)'};">
                ${m.kgCO2e === null ? 'NOT MEASURED' : `${escapeHtml(fmt(m.kgCO2e))} kgCO₂e`}
            </span>
        </div>`;

    const provenance = f === null
        ? `<div style="font-size:9.5px;line-height:1.55;color:#B3261E;margin-top:3px;">${escapeHtml(m.gapNote)}</div>`
        : `<div style="font-size:9px;line-height:1.55;color:var(--app-text-muted);margin-top:3px;">
               <strong>${escapeHtml(String(f.value))} ${escapeHtml(f.unit)}</strong> ·
               ${escapeHtml(f.dataset)} (${escapeHtml(String(f.year))}, ${escapeHtml(f.geography)}) ·
               scope ${escapeHtml(f.scope)} ·
               <span style="color:${f.verification === 'UNVERIFIED_TRANSCRIPTION' ? '#B3261E' : '#1D7A4B'};font-weight:800;">${escapeHtml(f.verification.replace(/_/g, ' '))}</span>
               ${m.density ? ` · density ${escapeHtml(String(m.density.kgPerM3))} kg/m³ (${escapeHtml(m.density.dataset)})` : ''}
               <details style="margin-top:2px;">
                   <summary style="cursor:pointer;color:var(--app-accent);">citation</summary>
                   <div style="margin-top:2px;">${escapeHtml(f.source)}</div>
                   ${f.qualifier ? `<div style="margin-top:3px;color:#8A6100;">⚠ ${escapeHtml(f.qualifier)}</div>` : ''}
                   ${m.density ? `<div style="margin-top:3px;">Density: ${escapeHtml(m.density.source)}</div>` : ''}
               </details>
           </div>`;

    return `<div style="padding:6px 8px;border:1px solid var(--app-border);border-radius:7px;background:var(--app-bg);">${head}${provenance}</div>`;
}

function gapBlock(carbon: CarbonResult, overrides: CarbonOverrideBook): string {
    if (carbon.gaps.length === 0) {
        return `
            <section style="margin-top:20px;border-top:2px solid var(--app-border);padding-top:14px;">
                <h4 style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">Gap ledger</h4>
                <div style="font-size:11px;color:var(--app-text-muted);line-height:1.6;">
                    Every material that reached this engine resolved to a usable factor. That is a statement about the
                    materials <em>present</em>, not about the model's completeness — read the take-off's own coverage table
                    for what was never measured at all.
                </div>
            </section>`;
    }
    const inputCss = 'padding:4px 6px;border:1px solid var(--app-border);border-radius:6px;font-size:10px;background:#fff;color:var(--app-text);';
    return `
        <section style="margin-top:20px;border-top:2px solid var(--app-border);padding-top:14px;">
            <h4 style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">Gap ledger — what is NOT measured, and why</h4>
            <div style="font-size:11px;line-height:1.6;color:var(--app-text-muted);margin-bottom:10px;">
                ${carbon.gaps.length} material${carbon.gaps.length === 1 ? '' : 's'} carry real volume and
                <strong>no usable factor</strong>. That volume is <strong>excluded from the total above</strong> —
                it is unmeasured carbon, not zero carbon. Enter a density and/or a factor from an EPD or a datasheet
                you hold and the line completes.
            </div>
            <div style="display:flex;flex-direction:column;gap:7px;">
                ${carbon.gaps.map((g) => {
                    const over = overrides.entries[g.materialId];
                    return `
                    <article style="padding:9px 11px;border:1px solid rgba(179,38,30,.35);border-radius:9px;background:rgba(179,38,30,.04);">
                        <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;">
                            <span style="font-size:11.5px;font-weight:700;color:var(--app-text);">${escapeHtml(g.materialLabel ?? g.materialId)}</span>
                            <span style="font-size:9px;font-family:ui-monospace,Menlo,Consolas,monospace;color:var(--app-text-muted);">${escapeHtml(g.materialId)}</span>
                            <span style="font-size:9px;font-weight:800;color:#B3261E;background:rgba(179,38,30,.10);border-radius:99px;padding:2px 7px;">${escapeHtml(g.reason.replace(/_/g, ' '))}</span>
                            <span style="margin-left:auto;font-size:11px;font-weight:800;color:var(--app-text);">${escapeHtml(fmt(g.volumeM3))} m³</span>
                        </div>
                        <div style="font-size:9.5px;line-height:1.55;color:var(--app-text-muted);margin-top:4px;">${escapeHtml(g.note)}</div>
                        <div style="font-size:9px;font-family:ui-monospace,Menlo,Consolas,monospace;color:var(--app-text-muted);margin-top:3px;word-break:break-all;">${escapeHtml(g.lineCodes.join('  '))}</div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;align-items:flex-end;">
                            <label style="font-size:9px;color:var(--app-text-muted);display:flex;flex-direction:column;gap:2px;">
                                Density kg/m³
                                <input data-ov-density="${escapeHtml(g.materialId)}" type="number" min="0" step="1"
                                       value="${over?.density ? escapeHtml(String(over.density.kgPerM3)) : ''}" placeholder="none"
                                       style="width:96px;${inputCss}"/>
                            </label>
                            <label style="font-size:9px;color:var(--app-text-muted);display:flex;flex-direction:column;gap:2px;">
                                Factor
                                <input data-ov-value="${escapeHtml(g.materialId)}" type="number" min="0" step="0.001"
                                       value="${over?.carbonA1A3 ? escapeHtml(String(over.carbonA1A3.value)) : ''}" placeholder="none"
                                       style="width:96px;${inputCss}"/>
                            </label>
                            <label style="font-size:9px;color:var(--app-text-muted);display:flex;flex-direction:column;gap:2px;">
                                Unit
                                <select data-ov-unit="${escapeHtml(g.materialId)}" style="${inputCss}">
                                    <option value="kgCO2e/kg" ${over?.carbonA1A3?.unit === 'kgCO2e/m3' ? '' : 'selected'}>kgCO₂e/kg</option>
                                    <option value="kgCO2e/m3" ${over?.carbonA1A3?.unit === 'kgCO2e/m3' ? 'selected' : ''}>kgCO₂e/m³</option>
                                </select>
                            </label>
                            <label style="flex:1;min-width:180px;font-size:9px;color:var(--app-text-muted);display:flex;flex-direction:column;gap:2px;">
                                Source — name the EPD or datasheet. A number with no source is reported as unsourced.
                                <input data-ov-source="${escapeHtml(g.materialId)}" type="text"
                                       value="${escapeHtml(over?.carbonA1A3?.source ?? over?.density?.source ?? '')}" placeholder="EPD registration / datasheet reference"
                                       style="width:100%;box-sizing:border-box;${inputCss}"/>
                            </label>
                        </div>
                    </article>`;
                }).join('')}
            </div>
        </section>`;
}

function bindCarbon(
    panel: HTMLElement,
    runtime: Runtime,
    takeoff: TakeoffResult,
    carbon: CarbonResult,
    overrides: CarbonOverrideBook,
): void {
    const rerender = () => renderCarbon(panel, runtime);

    /**
     * Write one override. An EMPTY field CLEARS that half rather than becoming 0 —
     * the 5D rate box's rule, and the reason a user can undo a mistyped factor by
     * emptying the box instead of being stuck with a zero that reads as measured.
     */
    const setOverride = (
        materialId: string,
        p: { densityKg?: number | null; value?: number | null; unit?: string; source?: string },
    ): void => {
        const prev = overrides.entries[materialId];
        const source = p.source !== undefined ? p.source : (prev?.carbonA1A3?.source ?? prev?.density?.source ?? '');
        const unit = (p.unit ?? prev?.carbonA1A3?.unit ?? 'kgCO2e/kg') as 'kgCO2e/kg' | 'kgCO2e/m3';
        const cite = {
            source,
            dataset: 'user',
            year: new Date().getFullYear(),
            geography: 'as supplied',
            provenance: 'USER_ENTERED' as const,
            // A user-entered figure is not "verified" by having been typed. The
            // person who typed it is the only one who can say it was checked, and
            // PRYZM does not make that claim on their behalf.
            verification: 'UNVERIFIED_TRANSCRIPTION' as const,
        };
        const densityKg = p.densityKg !== undefined ? p.densityKg : (prev?.density?.kgPerM3 ?? null);
        const value = p.value !== undefined ? p.value : (prev?.carbonA1A3?.value ?? null);

        const next: MaterialCarbonFacts = {
            density: densityKg !== null && Number.isFinite(densityKg) && densityKg > 0
                ? { ...cite, kgPerM3: densityKg } : undefined,
            carbonA1A3: value !== null && Number.isFinite(value) && value >= 0
                ? { ...cite, value, unit, scope: 'A1-A3' } : undefined,
        };
        const entries = { ...overrides.entries };
        if (!next.density && !next.carbonA1A3) delete entries[materialId];
        else entries[materialId] = next;
        saveCarbonOverrides(runtime, { entries });
        rerender();
    };

    panel.querySelectorAll<HTMLInputElement>('[data-ov-density]').forEach((i) =>
        i.addEventListener('change', () => setOverride(i.dataset.ovDensity!, {
            densityKg: i.value.trim() === '' ? null : Number(i.value),
        })));
    panel.querySelectorAll<HTMLInputElement>('[data-ov-value]').forEach((i) =>
        i.addEventListener('change', () => setOverride(i.dataset.ovValue!, {
            value: i.value.trim() === '' ? null : Number(i.value),
        })));
    panel.querySelectorAll<HTMLSelectElement>('[data-ov-unit]').forEach((i) =>
        i.addEventListener('change', () => setOverride(i.dataset.ovUnit!, { unit: i.value })));
    panel.querySelectorAll<HTMLInputElement>('[data-ov-source]').forEach((i) =>
        i.addEventListener('change', () => setOverride(i.dataset.ovSource!, { source: i.value })));

    panel.querySelector('[data-action="c-refresh"]')?.addEventListener('click', rerender);
    panel.querySelector('[data-action="c-csv"]')?.addEventListener('click', () => {
        download(`pryzm-carbon-${new Date().toISOString().slice(0, 10)}.csv`, carbonToCsv(takeoff, carbon));
    });
    panel.querySelector('[data-action="c-clear"]')?.addEventListener('click', () => {
        if (!confirm('Delete every carbon factor you entered for this project in this browser? The shipped reference factors are unaffected.')) return;
        saveCarbonOverrides(runtime, { entries: {} });
        rerender();
    });
}
