/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Data Workbench: Sync State Detail Drawer (Gap 1 — Phase 2.1)
 * File:             src/ui/dataworkbench/SyncStateDetailDrawer.ts
 * Contract:         docs/00_PRZYM/AUDIT_BIM_DATABASE_VISION_2_0.md §Gap 1
 *                   docs/02-decisions/contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md §3
 *
 * CSS prefix:       ssd-  (Sync State Detail)
 *
 * Opened by:        HierarchyTreePanel — click on .dw-sync-dot
 * Data source:      syncStateEngine.getLastResult(nodeId)
 *
 * Three action buttons:
 *   [Fix in model]    → dispatches 'pryzm-workbench-select' (navigates to element)
 *   [Mark as derived] → opens derivation reason dialog → commandManager command
 *   [Update brief]    → opens Template Editor for the assigned template
 *
 * Rules:
 *   - Read-only access to syncStateEngine. NO direct store mutations.
 *   - All mutations must go through the legacy command manager.
 *   - Singleton: only one drawer open at a time.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { syncStateEngine } from '@pryzm/core-app-model';
import type { SyncCheckResult, CheckResult } from '@pryzm/core-app-model';

// ── Sync state labels and CSS classes ─────────────────────────────────────────

const STATE_LABELS: Record<string, string> = {
    'no-template':  'No template',
    'planned-only': 'Planned only',
    'partial':      'Partial',
    'synced':       'Synced',
    'conflict':     'Conflict',
    'derived':      'Derived',
};

const STATE_CSS_CLASS: Record<string, string> = {
    'no-template':  'ssd-state--no-template',
    'planned-only': 'ssd-state--planned-only',
    'partial':      'ssd-state--partial',
    'synced':       'ssd-state--synced',
    'conflict':     'ssd-state--conflict',
    'derived':      'ssd-state--derived',
};

// ── SyncStateDetailDrawer ──────────────────────────────────────────────────────

class SyncStateDetailDrawer {
    /**
     * Phase B.30-SD (S73-WIRE) — `syncStateDetailDrawer` is a module-load
     * singleton (see `export const syncStateDetailDrawer = new SyncStateDetailDrawer()`
     * at file tail) consumed by `HierarchyTreePanel.ts:729`.  It is
     * constructed BEFORE `composeRuntime()` runs, so we mirror the
     * lazy-injection pattern established by `UiPreferences` (B.13-UP),
     * `gridDrawingHUD` (B.15-GD), `dataCommandCenter` (B.18-DCC), and
     * `panelManager` (B.4): the runtime starts null and `wireRuntime()` is
     * called from `src/main.ts` immediately after `composeRuntime()` resolves.
     */
    private _runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null;
    get runtime(): import('@pryzm/runtime-composer/types').PryzmRuntime | null { return this._runtime; }
    wireRuntime(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null): void { this._runtime = runtime; }
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this._runtime = runtime; }

    private _backdrop: HTMLElement | null = null;
    private _panel: HTMLElement | null = null;

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Open the drawer anchored near `anchorRect`.
     * If already open, replaces current content with the new node.
     */
    open(nodeId: string, nodeType: string, anchorRect: DOMRect): void {
        this.close();

        const result = syncStateEngine.getLastResult(nodeId);
        if (!result) {
            // No cached result: trigger a recompute then retry once
            syncStateEngine.recompute(nodeId);
            const retried = syncStateEngine.getLastResult(nodeId);
            if (!retried) {
                this._openNoData(nodeId, nodeType, anchorRect);
                return;
            }
            this._mount(retried, nodeType, anchorRect);
            return;
        }

        this._mount(result, nodeType, anchorRect);
    }

    close(): void {
        this._backdrop?.remove();
        this._panel?.remove();
        this._backdrop = null;
        this._panel = null;
    }

    // ── Mount ──────────────────────────────────────────────────────────────────

    private _mount(result: SyncCheckResult, nodeType: string, anchorRect: DOMRect): void {
        const backdrop = document.createElement('div');
        backdrop.className = 'ssd-backdrop';
        backdrop.addEventListener('click', () => this.close());

        const panel = document.createElement('div');
        panel.className = 'ssd-panel';

        panel.appendChild(this._buildHeader(result));
        panel.appendChild(this._buildBody(result));
        panel.appendChild(this._buildFooter(result, nodeType));

        document.body.appendChild(backdrop);
        document.body.appendChild(panel);

        this._backdrop = backdrop;
        this._panel = panel;

        // Position after mount so we know panel dimensions.
        // D.7.5 batch #4: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce(
            'sync-state-detail-position',
            () => this._position(panel, anchorRect),
        );
    }

    private _openNoData(_nodeId: string, _nodeType: string, anchorRect: DOMRect): void {
        const backdrop = document.createElement('div');
        backdrop.className = 'ssd-backdrop';
        backdrop.addEventListener('click', () => this.close());

        const panel = document.createElement('div');
        panel.className = 'ssd-panel';

        const noDataHeader = document.createElement('div');
        noDataHeader.className = 'ssd-header';
        noDataHeader.innerHTML = `
            <span class="ssd-node-name">Sync details</span>
            <button class="ssd-close-btn" title="Close">✕</button>
        `;
        (noDataHeader.querySelector('.ssd-close-btn') as HTMLButtonElement)
            .addEventListener('click', () => this.close());

        const noDataBody = document.createElement('div');
        noDataBody.className = 'ssd-body';
        noDataBody.innerHTML = `
            <div class="ssd-empty">
                <div class="ssd-empty-icon">⏳</div>
                <div>Sync data not yet computed.<br>Assign a template to this node<br>to see requirement checks.</div>
            </div>
        `;

        panel.appendChild(noDataHeader);
        panel.appendChild(noDataBody);

        document.body.appendChild(backdrop);
        document.body.appendChild(panel);

        this._backdrop = backdrop;
        this._panel = panel;

        // D.7.5 batch #4: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce(
            'sync-state-detail-position',
            () => this._position(panel, anchorRect),
        );
    }

    // ── Position ───────────────────────────────────────────────────────────────

    private _position(panel: HTMLElement, anchorRect: DOMRect): void {
        const pw = panel.offsetWidth  || 320;
        const ph = panel.offsetHeight || 280;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let left = anchorRect.right + 8;
        let top  = anchorRect.top;

        // Flip left if overflowing right edge
        if (left + pw > vw - 8) {
            left = anchorRect.left - pw - 8;
        }

        // Clamp top so panel doesn't go below viewport
        if (top + ph > vh - 8) {
            top = vh - ph - 8;
        }

        // Ensure not above viewport
        if (top < 8) top = 8;

        panel.style.left = `${Math.max(8, left)}px`;
        panel.style.top  = `${top}px`;
    }

    // ── Header ─────────────────────────────────────────────────────────────────

    private _buildHeader(result: SyncCheckResult): HTMLElement {
        const header = document.createElement('div');
        header.className = 'ssd-header';

        const nameEl = document.createElement('span');
        nameEl.className = 'ssd-node-name';
        nameEl.textContent = result.nodeName ?? result.nodeId;
        nameEl.title = result.nodeName ?? result.nodeId;

        const badge = document.createElement('span');
        badge.className = `ssd-state-badge ${STATE_CSS_CLASS[result.state] ?? ''}`;
        badge.textContent = STATE_LABELS[result.state] ?? result.state;

        if (result.templateName) {
            const tplEl = document.createElement('span');
            tplEl.className = 'ssd-template-name';
            tplEl.textContent = result.templateName;
            tplEl.title = result.templateName;
            header.appendChild(nameEl);
            header.appendChild(tplEl);
            header.appendChild(badge);
        } else {
            header.appendChild(nameEl);
            header.appendChild(badge);
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'ssd-close-btn';
        closeBtn.title = 'Close';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => this.close());
        header.appendChild(closeBtn);

        return header;
    }

    // ── Body ───────────────────────────────────────────────────────────────────

    private _buildBody(result: SyncCheckResult): HTMLElement {
        const body = document.createElement('div');
        body.className = 'ssd-body';

        if (result.checks.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'ssd-empty';

            const icon = document.createElement('div');
            icon.className = 'ssd-empty-icon';

            if (result.state === 'no-template') {
                icon.textContent = '📋';
                empty.appendChild(icon);
                empty.insertAdjacentHTML('beforeend', '<div>No template assigned.<br>Use the Template Editor<br>to assign a brief.</div>');
            } else if (result.state === 'synced') {
                icon.textContent = '✅';
                empty.appendChild(icon);
                empty.insertAdjacentHTML('beforeend', '<div>All requirements met.<br>This node is fully synced.</div>');
            } else {
                icon.textContent = '📊';
                empty.appendChild(icon);
                empty.insertAdjacentHTML('beforeend', '<div>No requirement checks<br>available for this node.</div>');
            }

            body.appendChild(empty);
            return body;
        }

        const failed  = result.checks.filter(c => !c.passed);
        const passed  = result.checks.filter(c => c.passed);

        if (failed.length > 0) {
            const failLabel = document.createElement('div');
            failLabel.className = 'ssd-section-label';
            failLabel.textContent = `Failing (${failed.length})`;
            body.appendChild(failLabel);

            for (const check of failed) {
                body.appendChild(this._buildCheckRow(check));
            }
        }

        if (passed.length > 0) {
            const passLabel = document.createElement('div');
            passLabel.className = 'ssd-section-label';
            passLabel.textContent = `Passing (${passed.length})`;
            body.appendChild(passLabel);

            for (const check of passed) {
                body.appendChild(this._buildCheckRow(check));
            }
        }

        return body;
    }

    private _buildCheckRow(check: CheckResult): HTMLElement {
        const row = document.createElement('div');
        row.className = 'ssd-check';

        const icon = document.createElement('span');
        icon.className = 'ssd-check-icon';
        if (check.passed) {
            icon.textContent = '✓';
            icon.style.color = '#1D9E75';
        } else if (check.isDerived) {
            icon.textContent = '~';
            icon.style.color = '#EF9F27';
        } else {
            icon.textContent = '✗';
            icon.style.color = '#E24B4A';
        }

        const checkBody = document.createElement('div');
        checkBody.className = 'ssd-check-body';

        const label = document.createElement('div');
        label.className = 'ssd-check-label';
        label.textContent = check.requirementLabel;

        const pair = document.createElement('div');
        pair.className = 'ssd-check-pair';

        const expectedRow = this._makeKVRow('Expected', check.expected);
        const actualRow   = this._makeKVRow('Actual', check.actual);
        pair.appendChild(expectedRow);
        pair.appendChild(actualRow);

        checkBody.appendChild(label);
        checkBody.appendChild(pair);

        if (!check.passed && check.delta) {
            const delta = document.createElement('span');
            delta.className = 'ssd-check-delta';
            delta.textContent = `Δ ${check.delta}`;
            checkBody.appendChild(delta);
        }

        if (check.isDerived) {
            const pill = document.createElement('span');
            pill.className = 'ssd-derived-pill';
            pill.textContent = '~ derived override';
            checkBody.appendChild(pill);
        }

        row.appendChild(icon);
        row.appendChild(checkBody);

        return row;
    }

    private _makeKVRow(label: string, value: string): HTMLElement {
        const row = document.createElement('div');
        row.className = 'ssd-check-row';

        const lbl = document.createElement('span');
        lbl.className = 'ssd-check-row-label';
        lbl.textContent = label + ':';

        const val = document.createElement('span');
        val.className = 'ssd-check-row-value';
        val.textContent = value;
        val.title = value;

        row.appendChild(lbl);
        row.appendChild(val);
        return row;
    }

    // ── Footer (action buttons) ────────────────────────────────────────────────

    private _buildFooter(result: SyncCheckResult, nodeType: string): HTMLElement {
        const footer = document.createElement('div');
        footer.className = 'ssd-footer';

        const hasConflicts = result.checks.some(c => !c.passed && !c.isDerived);

        // Wave 19 (Phase 2D + 3D) — runtime.sync.client connection-status check
        // + runtime.audit.projectId for crash-reporter context tagging.
        // TODO(C.5.x): render a live-collab indicator badge when sync.client !== null.
        const _liveCollab = this._runtime !== null && this._runtime.sync.client !== null;
        const _auditProject = this._runtime?.audit.projectId ?? null;
        if (_liveCollab && _auditProject) {
            console.debug('[SyncStateDetailDrawer] live-collab active for project', _auditProject);
        }

        // Button 1: Fix in model — navigate to the element in 3D canvas
        const fixBtn = document.createElement('button');
        fixBtn.className = 'ssd-action-btn ssd-action-btn--primary';
        fixBtn.textContent = 'Fix in model';
        fixBtn.title = 'Navigate to this element in the 3D model viewer';
        fixBtn.addEventListener('click', () => {
            // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
            window.runtime?.events?.emit('pryzm-workbench-select', { nodeId: result.nodeId, nodeType });
            this.close();
        });

        // Button 2: Mark as derived — acknowledge a conflict with a reason
        const deriveBtn = document.createElement('button');
        deriveBtn.className = 'ssd-action-btn ssd-action-btn--warn';
        deriveBtn.textContent = 'Mark derived';
        deriveBtn.title = 'Acknowledge a deviation from the brief with a recorded reason';
        deriveBtn.disabled = !hasConflicts;
        deriveBtn.style.opacity = hasConflicts ? '1' : '0.45';
        deriveBtn.addEventListener('click', () => {
            if (!hasConflicts) return;
            this._openDeriveDialog(result);
        });

        // Button 3: Update brief — open Template Editor for the assigned template
        const briefBtn = document.createElement('button');
        briefBtn.className = 'ssd-action-btn';
        briefBtn.textContent = 'Update brief';
        briefBtn.title = 'Open the Template Editor to modify the brief requirements';
        briefBtn.addEventListener('click', () => {
            const assignment = window.templateAssignmentStore?.getForNode?.(result.nodeId); // TODO(F.6.x): legacy templateAssignmentStore — replace with runtime.viewRegistry template-assignment
            if (assignment?.templateId) {
                window.runtime?.events?.emit('pryzm-open-template-editor', { templateId: assignment.templateId }); // F.events.15
            } else {
                window.runtime?.events?.emit('pryzm-open-template-editor', { nodeId: result.nodeId }); // F.events.15
            }
            this.close();
        });

        footer.appendChild(fixBtn);
        footer.appendChild(deriveBtn);
        footer.appendChild(briefBtn);

        return footer;
    }

    // ── Derive dialog ──────────────────────────────────────────────────────────

    private _openDeriveDialog(result: SyncCheckResult): void {
        const failingChecks = result.checks.filter(c => !c.passed && !c.isDerived);
        if (failingChecks.length === 0) return;

        const overlay = document.createElement('div');
        overlay.className = 'dw-dialog-overlay';
        overlay.style.zIndex = '9200';

        const dialog = document.createElement('div');
        dialog.className = 'dw-dialog';

        const titleEl = document.createElement('div');
        titleEl.className = 'dw-dialog-title';
        titleEl.textContent = 'Mark as derived';
        dialog.appendChild(titleEl);

        const desc = document.createElement('div');
        desc.style.cssText = 'font-size:12px;color:var(--app-text-muted,#7a8aaa);margin-bottom:12px;line-height:1.5;';
        desc.textContent = 'Record the reason why this deviation from the brief is accepted. This does not change the model — it records your decision.';
        dialog.appendChild(desc);

        // Checkbox list of failing checks to select which ones to derive
        const checkboxSection = document.createElement('div');
        checkboxSection.style.cssText = 'margin-bottom:12px;';
        const checkboxLabel = document.createElement('div');
        checkboxLabel.className = 'dw-dialog-label';
        checkboxLabel.textContent = 'Requirements to mark as derived:';
        checkboxSection.appendChild(checkboxLabel);

        const selectedKeys = new Set<string>(failingChecks.map(c => c.requirementKey));
        const checkboxes: Array<{ key: string; cb: HTMLInputElement }> = [];

        for (const check of failingChecks) {
            const row = document.createElement('label');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer;font-size:12px;color:var(--app-text,#dce3f4);';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.addEventListener('change', () => {
                if (cb.checked) selectedKeys.add(check.requirementKey);
                else selectedKeys.delete(check.requirementKey);
            });

            row.appendChild(cb);
            row.insertAdjacentText('beforeend', `${check.requirementLabel} (expected: ${check.expected}, actual: ${check.actual})`);
            checkboxSection.appendChild(row);
            checkboxes.push({ key: check.requirementKey, cb });
        }
        dialog.appendChild(checkboxSection);

        // Reason input
        const reasonGroup = document.createElement('div');
        reasonGroup.className = 'dw-dialog-group';
        const reasonLabel = document.createElement('label');
        reasonLabel.className = 'dw-dialog-label';
        reasonLabel.textContent = 'Reason *';
        const reasonInput = document.createElement('input');
        reasonInput.className = 'dw-dialog-input';
        reasonInput.type = 'text';
        reasonInput.placeholder = 'e.g. Client agreed to reduced area in VE round 2';
        reasonGroup.appendChild(reasonLabel);
        reasonGroup.appendChild(reasonInput);
        dialog.appendChild(reasonGroup);

        const actions = document.createElement('div');
        actions.className = 'dw-dialog-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'dw-dialog-btn dw-dialog-btn--cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => overlay.remove());

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'dw-dialog-btn dw-dialog-btn--primary';
        confirmBtn.textContent = 'Apply derivation';
        confirmBtn.addEventListener('click', () => {
            const reason = reasonInput.value.trim();
            if (!reason) {
                reasonInput.style.borderColor = '#E24B4A';
                return;
            }

            const keys = Array.from(selectedKeys);
            if (keys.length === 0) {
                overlay.remove();
                return;
            }

            this._applyDerivation(result.nodeId, keys, reason);
            overlay.remove();
            this.close();
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        dialog.appendChild(actions);

        overlay.appendChild(dialog);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        dialog.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmBtn.click(); });

        document.body.appendChild(overlay);
        setTimeout(() => reasonInput.focus(), 50);
    }

    private _applyDerivation(nodeId: string, keys: string[], reason: string): void {
        (window as any).runtime?.bus?.executeCommand('data.setDerivation', { nodeId, keys, reason });
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const syncStateDetailDrawer = new SyncStateDetailDrawer();
