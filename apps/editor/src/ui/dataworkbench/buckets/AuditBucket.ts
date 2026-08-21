/**
 * AuditBucket — AUDIT lifecycle bucket content mounts.
 *
 * Layer Affected:    UI — Data Workbench › Audit Bucket
 * File:             src/ui/dataworkbench/buckets/AuditBucket.ts
 *
 * Owns:
 *   mountVisibilityIntentAccess  — Intent Visibility Settings gateway panel
 *   mountQuantitySchedules       — Schedule of Quantities + View Templates panel
 *
 * window.visibilityIntentPanel?.open?.() calls retained as-is:
 *   TODO(F.6.5): panel-host registry bridge — destruction in F.6.5 — Phase F.6.5
 */

import { scheduleStore }      from '@pryzm/core-app-model';
import { viewTemplateStore }  from '@pryzm/core-app-model';
import { escapeHtml }         from './DWHelpers';

// ── Visibility Intent Access panel ────────────────────────────────────────────

export function mountVisibilityIntentAccess(panel: HTMLElement): void {
    panel.innerHTML = `
        <div style="height:100%;display:flex;align-items:center;justify-content:center;padding:24px;">
            <div style="max-width:280px;text-align:center;">
                <div class="dw-placeholder-icon">◐</div>
                <div style="font-weight:700;font-size:14px;color:var(--app-text);margin-bottom:8px">Intent Visibility Settings</div>
                <div style="font-size:12px;line-height:1.6;color:var(--app-text-muted);margin-bottom:16px">
                    Manage the active view's default intent, local overrides, view templates, and architectural documentation rules.
                </div>
                <button type="button" class="dw-toolbar-btn" data-action="open-visibility-intent">Open Intent Settings</button>
            </div>
        </div>
    `;
    panel.querySelector('[data-action="open-visibility-intent"]')?.addEventListener('click', () => {
        window.visibilityIntentPanel?.open?.(); // TODO(F.6.5): panel-host registry bridge — destruction in F.6.5 — Phase F.6.5
    });
}

// ── Schedule definitions panel (AUDIT › Quantities) ──────────────────────────

/**
 * Render the schedule DEFINITIONS and the view templates.
 *
 * @param onNavigate  Routes the user to another workbench tab. Supplied by the
 *                    shell because this module must not import DataWorkbench
 *                    (import cycle) — see DWHelpers' note on the same rule.
 */
export function mountQuantitySchedules(
    panel: HTMLElement,
    onNavigate?: (tabId: string) => void,
): void {
    scheduleStore.seedDefaultSchedules();
    const schedules = scheduleStore.getAll();
    const templates = viewTemplateStore.getAll();

    panel.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
            <div style="padding:14px 16px;border-bottom:1px solid var(--app-border);">
                <div style="font-size:15px;font-weight:800;color:var(--app-text);">Schedule definitions</div>
                <div style="font-size:11px;line-height:1.6;color:var(--app-text-muted);margin-top:4px;">
                    The column sets each built-in schedule renders — architecture, structure, interiors, MEP, materials
                    and project outputs. <strong>These are definitions, not quantities:</strong> nothing on this tab is
                    measured from your model.
                </div>
            </div>
            <div style="flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:14px;">
                <div style="padding:11px 13px;border:1px solid var(--app-accent);border-radius:10px;background:rgba(102,0,255,.05);">
                    <div style="font-size:12px;font-weight:700;color:var(--app-text);margin-bottom:4px;">Looking for measured quantities?</div>
                    <div style="font-size:11px;line-height:1.65;color:var(--app-text-muted);margin-bottom:9px;">
                        The <em>medición</em> — real quantities taken off your model, net of openings, traceable to the
                        elements they measured — lives in the <strong>MEDICIONES</strong> bucket, together with 5D cost.
                    </div>
                    <button type="button" class="dw-toolbar-btn" data-action="open-mediciones">Open MEDICIONES › Take-off</button>
                </div>
                <section>
                    <h4 style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">Schedule definitions</h4>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${schedules.map(schedule => `
                            <article style="padding:10px;border:1px solid var(--app-border);border-radius:10px;background:var(--app-panel-bg);">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                                    <div style="font-size:12px;font-weight:700;color:var(--app-text);">${escapeHtml(schedule.name)}</div>
                                    <span style="font-size:10px;color:var(--app-text-muted);white-space:nowrap;">${escapeHtml(schedule.scheduleType)}</span>
                                </div>
                                <div style="font-size:10px;color:var(--app-text-muted);margin-top:6px;line-height:1.5;">Columns: ${escapeHtml(schedule.fields.join(', '))}</div>
                            </article>
                        `).join('')}
                    </div>
                </section>
                <section>
                    <h4 style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text);">View Templates / Intent Visibility Settings</h4>
                    ${templates.length ? `
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            ${templates.map(template => `
                                <article style="padding:10px;border:1px solid var(--app-border);border-radius:10px;background:var(--app-panel-bg);">
                                    <div style="font-size:12px;font-weight:700;color:var(--app-text);">${escapeHtml(template.name)}</div>
                                    <div style="font-size:10px;color:var(--app-text-muted);margin-top:4px;">${escapeHtml(template.discipline ?? 'all')} · ${template.lockedFields.length} locked fields · ${template.rules?.length ?? 0} rules</div>
                                    <div style="font-size:11px;color:var(--app-text-muted);margin-top:6px;line-height:1.5;">${escapeHtml(template.intent ?? template.description ?? 'No intent description set.')}</div>
                                </article>
                            `).join('')}
                        </div>
                    ` : `
                        <div style="padding:14px;border:1px dashed var(--app-border);border-radius:10px;color:var(--app-text-muted);font-size:12px;line-height:1.5;">
                            No saved view templates yet. Use Intent Visibility Settings to define view behavior, overrides, and documentation visibility intent.
                        </div>
                    `}
                </section>
                <button type="button" class="dw-toolbar-btn" data-action="open-quantity-visibility">Open Intent Visibility Settings</button>
            </div>
        </div>
    `;

    panel.querySelector('[data-action="open-mediciones"]')?.addEventListener('click', () => {
        onNavigate?.('mz-takeoff');
    });
    panel.querySelector('[data-action="open-quantity-visibility"]')?.addEventListener('click', () => {
        window.visibilityIntentPanel?.open?.(); // TODO(F.6.5): panel-host registry bridge — destruction in F.6.5 — Phase F.6.5
    });
}
