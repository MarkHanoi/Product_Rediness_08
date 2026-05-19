/**
 * StructuredNameBuilder — ISO 19650-2 Annex A name builder UI
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (nb- prefix)
 *   §05 §7.6 — No independent <style> injection
 *   §01      — Zero BIM engine interaction
 *   §06 §3   — Platform UI layer; no BIM engine imports
 *
 * Renders a 9-field structured name form that:
 *   - Validates each field in real-time against ISO 19650-2 Annex A rules
 *   - Shows the assembled filename string live as fields are filled
 *   - Has the revision + suitability fields locked (system-assigned)
 *   - Pre-fills project/originator from saved project settings
 *   - Emits onChange with the validated StructuredName on every change
 *
 * Class prefix: nb-  (Name Builder)
 */

import { injectAppTheme } from '../styles/AppTheme';
import {
    StructuredName,
    TYPE_CODES,
    ROLE_CODES,
    validateStructuredName,
    NameValidationError,
} from '@pryzm/protocol';

// ── Type code human labels (subset for display) ───────────────────────────────
const TYPE_LABELS: Partial<Record<string, string>> = {
    M3: '3D Model', M2: '2D Model', DR: 'Drawing', SP: 'Specification',
    CA: 'Calculation', RI: 'RFI', VI: 'Visualisation', SK: 'Sketch',
    RP: 'Report', TR: 'Transmittal', IN: 'Info Note', ZZ: 'Other',
};

// ── Role code human labels ────────────────────────────────────────────────────
const ROLE_LABELS: Partial<Record<string, string>> = {
    A: 'Architecture', S: 'Structural', M: 'Mechanical', E: 'Electrical',
    C: 'Civil', R: 'Structural', F: 'Façade', K: 'Landscape',
    Q: 'Quantity Surveying', Y: 'Info Management', Z: 'General', ZZ: 'Not defined',
};

// ── Suitability labels ────────────────────────────────────────────────────────
const SUITABILITY_LABELS: Partial<Record<string, string>> = {
    S0: 'S0 — WIP (not for use)',
    S1: 'S1 — Suitable for coordination',
    S2: 'S2 — Suitable for information',
    S3: 'S3 — Suitable for construction',
    S4: 'S4 — Post-contract use',
    D1: 'D1 — Preliminary design',
    D2: 'D2 — Developed design',
    D3: 'D3 — Technical design',
    CR: 'CR — Client review',
    A:  'A — Approved for construction',
    B:  'B — Approved with comments',
};

// ── Component ────────────────────────────────────────────────────────────────

export interface StructuredNameBuilderCallbacks {
    onChange?: (name: StructuredName | null, errors: NameValidationError[]) => void;
    /** Current project settings defaults */
    defaults?: Partial<StructuredName>;
}

export class StructuredNameBuilder {
    private el: HTMLElement;
    private current: Partial<StructuredName>;
    private errors: NameValidationError[] = [];

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private container: HTMLElement,
        private callbacks: StructuredNameBuilderCallbacks = {},
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        injectAppTheme();
        this.current = {
            project:    callbacks.defaults?.project    ?? '',
            originator: callbacks.defaults?.originator ?? '',
            volume:     callbacks.defaults?.volume     ?? 'ZZ',
            level:      callbacks.defaults?.level      ?? 'ZZ',
            type:       callbacks.defaults?.type       ?? 'M3',
            role:       callbacks.defaults?.role       ?? 'A',
            number:     callbacks.defaults?.number     ?? '0001',
        };
        this.el = document.createElement('div');
        this.el.className = 'nb-builder';
        this.container.appendChild(this.el);
        this.render();
    }

    getValue(): StructuredName | null {
        const errs = validateStructuredName(this.current);
        if (errs.length > 0) return null;
        return this.current as StructuredName;
    }

    setValue(name: Partial<StructuredName>): void {
        this.current = { ...this.current, ...name };
        this.render();
    }

    private get assembledName(): string {
        const n = this.current;
        const parts = [
            n.project      || '???',
            n.originator   || '???',
            n.volume       || '??',
            n.level        || '??',
            n.type         || '??',
            n.role         || '?',
            n.number       || '????',
            n.revision     || 'P01',
            n.suitability  || 'S0',
        ];
        return parts.join('-');
    }

    private hasError(field: keyof StructuredName): boolean {
        return this.errors.some(e => e.field === field);
    }

    private render(): void {
        this.errors = validateStructuredName(this.current);

        this.el.innerHTML = `
            <div class="nb-filename-preview">
                <span class="nb-filename-label">ISO 19650 name:</span>
                <code class="nb-filename">${escHtml(this.assembledName)}</code>
            </div>

            <div class="nb-grid">
                ${this.renderTextInput('project',    'Project',     6, 'Short project code, e.g. PRJ')}
                ${this.renderTextInput('originator', 'Originator',  6, 'Organisation code, e.g. ABC')}
                ${this.renderTextInput('volume',     'Volume',      4, 'Volume/system (ZZ = whole)')}
                ${this.renderTextInput('level',      'Level',       4, 'Floor/zone (ZZ = all)')}
                ${this.renderSelect('type', 'Type', TYPE_CODES as unknown as string[], TYPE_LABELS)}
                ${this.renderSelect('role', 'Role', ROLE_CODES as unknown as string[], ROLE_LABELS)}
                ${this.renderNumberInput()}
            </div>

            <div class="nb-system-row">
                <div class="nb-system-field">
                    <span class="nb-system-label">Revision</span>
                    <span class="nb-system-value">${escHtml(this.current.revision ?? 'P01 (auto)')}</span>
                    <span class="nb-system-note">System-assigned</span>
                </div>
                <div class="nb-system-field">
                    <span class="nb-system-label">Suitability</span>
                    <span class="nb-system-value">${escHtml(this.current.suitability ? (SUITABILITY_LABELS[this.current.suitability] ?? this.current.suitability) : 'S0 (auto)')}</span>
                    <span class="nb-system-note">System-assigned</span>
                </div>
            </div>

            ${this.errors.length > 0 ? `
                <div class="nb-errors">
                    ${this.errors.map(e => `<div class="nb-error-item">⚠ ${escHtml(e.field)}: ${escHtml(e.message)}</div>`).join('')}
                </div>
            ` : ''}
        `;

        this.attachListeners();
        this.callbacks.onChange?.(this.getValue(), this.errors);
    }

    private renderTextInput(field: keyof StructuredName, label: string, maxLen: number, hint: string): string {
        const val = (this.current[field] as string) ?? '';
        const err = this.hasError(field);
        return `
            <div class="nb-field${err ? ' nb-field--error' : ''}">
                <label class="nb-label">${escHtml(label)}</label>
                <input
                    class="nb-input${err ? ' nb-input--error' : ''}"
                    type="text"
                    data-field="${field}"
                    value="${escHtml(val)}"
                    maxlength="${maxLen}"
                    placeholder="${escHtml(hint)}"
                    autocomplete="off"
                    style="text-transform:uppercase;"
                />
            </div>
        `;
    }

    private renderSelect(field: keyof StructuredName, label: string, codes: string[], labels: Partial<Record<string, string>>): string {
        const val = (this.current[field] as string) ?? '';
        const err = this.hasError(field);
        return `
            <div class="nb-field${err ? ' nb-field--error' : ''}">
                <label class="nb-label">${escHtml(label)}</label>
                <select class="nb-select${err ? ' nb-input--error' : ''}" data-field="${field}">
                    ${codes.map(code => `<option value="${escHtml(code)}"${code === val ? ' selected' : ''}>${escHtml(labels[code] ? `${code} — ${labels[code]}` : code)}</option>`).join('')}
                </select>
            </div>
        `;
    }

    private renderNumberInput(): string {
        const val = this.current.number ?? '';
        const err = this.hasError('number');
        return `
            <div class="nb-field${err ? ' nb-field--error' : ''}">
                <label class="nb-label">Number</label>
                <input
                    class="nb-input${err ? ' nb-input--error' : ''}"
                    type="text"
                    data-field="number"
                    value="${escHtml(val)}"
                    maxlength="4"
                    placeholder="0001"
                    pattern="\\d{4}"
                />
            </div>
        `;
    }

    private attachListeners(): void {
        // Text inputs
        this.el.querySelectorAll<HTMLInputElement>('input[data-field]').forEach(input => {
            input.addEventListener('input', () => {
                const field = input.dataset.field as keyof StructuredName;
                const raw = input.value;
                const upper = ['project','originator','volume','level'].includes(field) ? raw.toUpperCase() : raw;
                (this.current as any)[field] = upper;
                if (input.value !== upper) input.value = upper;
                this.render();
            });
        });

        // Selects
        this.el.querySelectorAll<HTMLSelectElement>('select[data-field]').forEach(select => {
            select.addEventListener('change', () => {
                const field = select.dataset.field as keyof StructuredName;
                (this.current as any)[field] = select.value;
                this.render();
            });
        });
    }

    destroy(): void {
        this.el.remove();
    }
}

function escHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
}
