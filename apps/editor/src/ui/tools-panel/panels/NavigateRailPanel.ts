/**
 * NavigateRailPanel — Walk-mode navigation section for the right tools rail.
 *
 * Extracted from the #navigation-content accordion block in Layout.ts.
 * Contains:
 *   • Walk Mode toggle — activates / deactivates `firstPersonController`
 *   • Contextual WASD + mouse hint card shown only while walk mode is active
 *     (collapses when deactivated, so the panel stays compact when not in use)
 *
 * Mirrors the pattern of VisualRailPanel / EditRailPanel:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* layout elements; pure native HTML
 *   §01      — No direct store mutations; all interactions via window.firstPersonController
 *   §05 §7.6 — No independent <style> injection; styles live in AppTheme.ts
 */

import type { ToolsRailController } from '../ToolsRailController';
import type { ToolsPanelProps }      from '../ToolsPanelTypes';

export class NavigateRailPanel {
    private _active   = false;
    private _btn:     HTMLButtonElement | null = null;
    private _hintCard: HTMLElement     | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        _props: ToolsPanelProps,
        _rail: ToolsRailController,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;}

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'tpr-nav-root';

        root.appendChild(this._buildIntroText());
        root.appendChild(this._buildWalkBtn());
        root.appendChild(this._buildHintCard());

        return root;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Intro label
    // ─────────────────────────────────────────────────────────────────────────

    private _buildIntroText(): HTMLElement {
        const p = document.createElement('p');
        p.className = 'tpr-nav-intro';
        p.textContent = 'First-person walkthrough of the model.';
        return p;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Walk Mode toggle button
    // ─────────────────────────────────────────────────────────────────────────

    private _buildWalkBtn(): HTMLElement {
        const btn = document.createElement('button');
        btn.id        = 'btn-walkthrough';
        btn.type      = 'button';
        btn.className = 'tpr-nav-walk-btn';
        btn.title     = 'Walk through the scene in first-person view (WASD + mouse)';

        this._btn = btn;
        this._syncBtnState();

        btn.addEventListener('click', () => this._handleToggle());

        return btn;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WASD hint card — visible only when Walk Mode is active
    // ─────────────────────────────────────────────────────────────────────────

    private _buildHintCard(): HTMLElement {
        const card = document.createElement('div');
        card.className = 'tpr-nav-hint-card';
        card.style.display = 'none';
        this._hintCard = card;

        const title = document.createElement('div');
        title.className = 'tpr-nav-hint-title';
        title.textContent = 'Controls';
        card.appendChild(title);

        const hints: Array<{ key: string; label: string }> = [
            { key: 'W / S',     label: 'Move forward / back' },
            { key: 'A / D',     label: 'Strafe left / right'  },
            { key: 'Q / E',     label: 'Move up / down'       },
            { key: 'Arrows',    label: 'Move / strafe'        },
            { key: 'Mouse',     label: 'Look around'          },
            { key: 'Shift',     label: 'Sprint'               },
            { key: 'Esc',       label: 'Exit walk mode'       },
        ];

        for (const hint of hints) {
            const row = document.createElement('div');
            row.className = 'tpr-nav-hint-row';

            const keyEl = document.createElement('kbd');
            keyEl.className = 'tpr-nav-hint-key';
            keyEl.textContent = hint.key;

            const labelEl = document.createElement('span');
            labelEl.className = 'tpr-nav-hint-label';
            labelEl.textContent = hint.label;

            row.appendChild(keyEl);
            row.appendChild(labelEl);
            card.appendChild(row);
        }

        return card;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    private async _handleToggle(): Promise<void> {
        const fpc = window.firstPersonController; // TODO(D.9): legacy firstPersonController — replace with runtime.cameraController.firstPerson
        if (!fpc) {
            console.warn('[NavigateRailPanel] firstPersonController not found on window');
            return;
        }

        if (fpc.active) {
            fpc.deactivate();
            this._active = false;
            console.log('[NavigateRailPanel] Walk mode deactivated');
        } else {
            if (this._btn) this._btn.disabled = true;
            try {
                await fpc.activate();
                this._active = Boolean(fpc.active);
                console.log('[NavigateRailPanel] Walk mode activated');
            } catch (err) {
                console.error('[NavigateRailPanel] Walk mode activation failed:', err);
                this._active = false;
            } finally {
                if (this._btn) this._btn.disabled = false;
            }
        }

        this._syncBtnState();
        this._syncHintCard();
    }

    private _syncBtnState(): void {
        if (!this._btn) return;

        if (this._active) {
            this._btn.classList.add('tpr-nav-walk-btn--active');
            this._btn.innerHTML = `
                <span class="tpr-nav-walk-icon">🚶</span>
                <span class="tpr-nav-walk-label">Exit Walk Mode</span>
                <span class="tpr-nav-walk-badge">ON</span>
            `;
        } else {
            this._btn.classList.remove('tpr-nav-walk-btn--active');
            this._btn.innerHTML = `
                <span class="tpr-nav-walk-icon">🚶</span>
                <span class="tpr-nav-walk-label">Walk Mode</span>
            `;
        }
    }

    private _syncHintCard(): void {
        if (!this._hintCard) return;
        this._hintCard.style.display = this._active ? 'block' : 'none';
    }
}
