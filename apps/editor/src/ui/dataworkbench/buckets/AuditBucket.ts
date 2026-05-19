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
                <div style="font-weight:700;font-size:14px;color:var(--app-text,#1a2035);margin-bottom:8px">Intent Visibility Settings</div>
                <div style="font-size:12px;line-height:1.6;color:var(--app-text-muted,#7a8aaa);margin-bottom:16px">
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

// ── Quantity Schedules panel ───────────────────────────────────────────────────

export function mountQuantitySchedules(panel: HTMLElement): void {
    scheduleStore.seedDefaultSchedules();
    const schedules = scheduleStore.getAll();
    const templates = viewTemplateStore.getAll();

    panel.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
            <div style="padding:14px 16px;border-bottom:1px solid var(--dw-border,#e5e7eb);">
                <div style="font-size:15px;font-weight:800;color:var(--app-text,#1a2035);">Schedule of Quantities</div>
                <div style="font-size:11px;line-height:1.6;color:var(--app-text-muted,#7a8aaa);margin-top:4px;">Built-in quantity schedule definitions for architecture, structure, interiors, MEP, materials, and project outputs.</div>
            </div>
            <div style="flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:14px;">
                <section>
                    <h4 style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text,#1a2035);">Quantity Schedules</h4>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${schedules.map(schedule => `
                            <article style="padding:10px;border:1px solid var(--dw-border,#e5e7eb);border-radius:10px;background:var(--app-panel,#fff);">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                                    <div style="font-size:12px;font-weight:700;color:var(--app-text,#1a2035);">${escapeHtml(schedule.name)}</div>
                                    <span style="font-size:10px;color:var(--app-text-muted,#7a8aaa);white-space:nowrap;">${escapeHtml(schedule.scheduleType)}</span>
                                </div>
                                <div style="font-size:10px;color:var(--app-text-muted,#7a8aaa);margin-top:6px;line-height:1.5;">Fields: ${escapeHtml(schedule.fields.join(', '))}</div>
                            </article>
                        `).join('')}
                    </div>
                </section>
                <section>
                    <h4 style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--app-text,#1a2035);">View Templates / Intent Visibility Settings</h4>
                    ${templates.length ? `
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            ${templates.map(template => `
                                <article style="padding:10px;border:1px solid var(--dw-border,#e5e7eb);border-radius:10px;background:var(--app-panel,#fff);">
                                    <div style="font-size:12px;font-weight:700;color:var(--app-text,#1a2035);">${escapeHtml(template.name)}</div>
                                    <div style="font-size:10px;color:var(--app-text-muted,#7a8aaa);margin-top:4px;">${escapeHtml(template.discipline ?? 'all')} · ${template.lockedFields.length} locked fields · ${template.rules?.length ?? 0} rules</div>
                                    <div style="font-size:11px;color:var(--app-text-muted,#7a8aaa);margin-top:6px;line-height:1.5;">${escapeHtml(template.intent ?? template.description ?? 'No intent description set.')}</div>
                                </article>
                            `).join('')}
                        </div>
                    ` : `
                        <div style="padding:14px;border:1px dashed var(--dw-border,#e5e7eb);border-radius:10px;color:var(--app-text-muted,#7a8aaa);font-size:12px;line-height:1.5;">
                            No saved view templates yet. Use Intent Visibility Settings to define view behavior, overrides, and documentation visibility intent.
                        </div>
                    `}
                </section>
                <button type="button" class="dw-toolbar-btn" data-action="open-quantity-visibility">Open Intent Visibility Settings</button>
            </div>
        </div>
    `;

    panel.querySelector('[data-action="open-quantity-visibility"]')?.addEventListener('click', () => {
        window.visibilityIntentPanel?.open?.(); // TODO(F.6.5): panel-host registry bridge — destruction in F.6.5 — Phase F.6.5
    });
}
