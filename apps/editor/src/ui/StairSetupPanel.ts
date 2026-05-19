/**
 * StairSetupPanel — modal panel for stair level selection, type selection and width input.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS via AppTheme.ts (stsp- prefix), no independent <style> tags.
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — callbacks delegate to caller.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : No @thatopen/ui (bim-*) elements — plain native HTML only.
 *   §01-BIM-ENGINE-CORE §1.5      : UI layer only — reads no stores, calls no builders.
 *   §07-STAIR-SYSTEM-TYPES §2.2   : BUILT_IN_STAIR_TYPES surfaced in creation panel.
 *
 * Replaces the window.prompt()-based level selection in BimService.createStair().
 * Prefix: stsp-
 */

import { BUILT_IN_STAIR_TYPES, StairTypeDefinition } from '@pryzm/geometry-stair';

export interface StairSetupResult {
    baseLevelId: string;
    topLevelId: string;
    width: number;
    typeId: string;
    /** Drawing mode for the first flight — defaults to 'ortho' (parity with Wall mode picker). */
    mode: 'linear' | 'ortho';
}

export interface StairSetupOptions {
    shape: 'I' | 'L' | 'U';
    levels: Array<{ id: string; name: string; elevation: number }>;
    onConfirm: (result: StairSetupResult) => void;
    onCancel?: () => void;
}

const SHAPE_LABELS: Record<string, string> = {
    I: 'Straight',
    L: 'L-Shape',
    U: 'U-Shape',
};

const SHAPE_DESCS: Record<string, string> = {
    I: 'Single straight flight',
    L: 'Two flights at 90°',
    U: 'Two parallel flights, 180° turn',
};

// ── Stair type icon SVGs (inline, no external file needed) ────────────────────
const TYPE_ICONS: Record<string, string> = {
    'monolithic': `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="14" width="18" height="4" rx="1" fill="#9E9E9E"/><rect x="2" y="10" width="14" height="3" rx="1" fill="#BDBDBD"/><rect x="2" y="6" width="10" height="3" rx="1" fill="#BDBDBD"/><rect x="2" y="2" width="6" height="3" rx="1" fill="#BDBDBD"/></svg>`,
    'steel-open': `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="14" width="18" height="2" rx="1" fill="#78909C"/><rect x="2" y="10" width="14" height="2" rx="1" fill="#78909C"/><rect x="2" y="6" width="10" height="2" rx="1" fill="#78909C"/><rect x="2" y="2" width="6" height="2" rx="1" fill="#78909C"/><rect x="3" y="2" width="2" height="14" rx="1" fill="#546E7A"/></svg>`,
    'timber-closed': `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="14" width="18" height="4" rx="1" fill="#8D6E63"/><rect x="2" y="10" width="14" height="3.5" rx="1" fill="#A1887F"/><rect x="2" y="6" width="10" height="3.5" rx="1" fill="#A1887F"/><rect x="2" y="2" width="6" height="3.5" rx="1" fill="#A1887F"/></svg>`,
    'residential-timber': `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="14" width="18" height="3" rx="1" fill="#8D6E63"/><rect x="2" y="10" width="14" height="3" rx="1" fill="#BCAAA4"/><rect x="2" y="6" width="10" height="3" rx="1" fill="#BCAAA4"/><rect x="2" y="2" width="6" height="3" rx="1" fill="#BCAAA4"/><line x1="3" y1="2" x2="3" y2="16" stroke="#6D4C41" stroke-width="1.5"/></svg>`,
    'marble-luxury': `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="14" width="18" height="4" rx="1" fill="#E0E0E0"/><rect x="2" y="10" width="14" height="3" rx="1" fill="#F5F5F5"/><rect x="2" y="6" width="10" height="3" rx="1" fill="#F5F5F5"/><rect x="2" y="2" width="6" height="3" rx="1" fill="#F5F5F5"/><line x1="7" y1="14" x2="11" y2="2" stroke="#BDBDBD" stroke-width="0.8"/></svg>`,
};

const TYPE_MATERIAL_LABEL: Record<string, string> = {
    'concrete': 'Concrete',
    'steel':    'Steel',
    'wood':     'Timber',
    'marble':   'Marble',
};

export class StairSetupPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    show(opts: StairSetupOptions): void {
        this.dismiss();

        const sorted = [...opts.levels].sort((a, b) => a.elevation - b.elevation);
        let selectedTypeId = BUILT_IN_STAIR_TYPES[0].id;
        // Default mode is 'ortho' — same as the Wall mode picker default for orthogonal-first drafting.
        let selectedMode: 'linear' | 'ortho' = 'ortho';

        const panel = document.createElement('div');
        panel.className = 'stsp-panel';

        // ── Header ──────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'stsp-header';

        const title = document.createElement('span');
        title.className = 'stsp-header-title';
        title.textContent = 'STAIR SETUP';

        const sep = document.createElement('span');
        sep.className = 'stsp-header-sep';

        const sub = document.createElement('span');
        sub.className = 'stsp-header-sub';
        sub.textContent = SHAPE_LABELS[opts.shape] ?? opts.shape;

        const shapedesc = document.createElement('span');
        shapedesc.className = 'stsp-header-desc';
        shapedesc.textContent = SHAPE_DESCS[opts.shape] ?? '';

        header.appendChild(title);
        header.appendChild(sep);
        header.appendChild(sub);
        panel.appendChild(header);

        // ── Shape descriptor line ─────────────────────────────────────────
        const shapeLine = document.createElement('div');
        shapeLine.className = 'stsp-shape-line';
        shapeLine.textContent = SHAPE_DESCS[opts.shape] ?? '';
        panel.appendChild(shapeLine);

        // ── Body ─────────────────────────────────────────────────────────────
        const body = document.createElement('div');
        body.className = 'stsp-body';

        // ── Drawing Mode toggle (Linear / Orthogonal) ─────────────────────
        // Mirrors the Wall mode picker: default is Orthogonal (90° snap),
        // user can switch to Linear (free-direction). §42-ELEMENT-CREATION-HUD.
        const modeSection = this._makeSection('Mode');
        const modeRow = document.createElement('div');
        modeRow.className = 'stsp-mode-row';

        const modeOptions: Array<{ id: 'linear' | 'ortho'; key: string; label: string }> = [
            { id: 'linear', key: 'L', label: 'Linear' },
            { id: 'ortho',  key: 'O', label: 'Orthogonal' },
        ];
        const modeBtns: Record<string, HTMLButtonElement> = {};
        modeOptions.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'stsp-mode-btn';
            btn.setAttribute('data-mode', opt.id);
            btn.title = `${opt.label} (${opt.key})`;
            btn.innerHTML = `<span class="stsp-mode-key">${opt.key}</span><span class="stsp-mode-label">${opt.label}</span>`;
            btn.addEventListener('click', () => {
                selectedMode = opt.id;
                Object.values(modeBtns).forEach(b => b.classList.remove('stsp-mode-btn--active'));
                btn.classList.add('stsp-mode-btn--active');
            });
            modeBtns[opt.id] = btn;
            modeRow.appendChild(btn);
        });
        modeBtns[selectedMode].classList.add('stsp-mode-btn--active');
        modeSection.appendChild(modeRow);
        body.appendChild(modeSection);

        // ── Stair Type Cards ──────────────────────────────────────────────
        const typeSection = this._makeSection('Stair Type');
        const typeGrid = document.createElement('div');
        typeGrid.className = 'stsp-type-grid';

        const typeCards: HTMLElement[] = [];
        BUILT_IN_STAIR_TYPES.forEach((typeDef: StairTypeDefinition) => {
            const card = document.createElement('button');
            card.className = 'stsp-type-card';
            card.setAttribute('data-type-id', typeDef.id);
            card.title = typeDef.name;

            const iconWrap = document.createElement('span');
            iconWrap.className = 'stsp-type-icon';
            iconWrap.innerHTML = TYPE_ICONS[typeDef.id] ?? '';

            const cardName = document.createElement('span');
            cardName.className = 'stsp-type-name';
            cardName.textContent = typeDef.name.replace(' ', '\u00a0');

            const matBadge = document.createElement('span');
            matBadge.className = 'stsp-type-mat';
            matBadge.textContent = TYPE_MATERIAL_LABEL[typeDef.defaults.material] ?? typeDef.defaults.material;

            card.appendChild(iconWrap);
            card.appendChild(cardName);
            card.appendChild(matBadge);
            typeGrid.appendChild(card);
            typeCards.push(card);

            card.addEventListener('click', () => {
                selectedTypeId = typeDef.id;
                typeCards.forEach(c => c.classList.remove('stsp-type-card--active'));
                card.classList.add('stsp-type-card--active');
                updateComputedInfo();
            });
        });

        // Select first card by default
        typeCards[0]?.classList.add('stsp-type-card--active');
        typeSection.appendChild(typeGrid);
        body.appendChild(typeSection);

        // Base level
        const baseSection = this._makeSection('Base Level (Bottom)');
        const baseSelect = document.createElement('select');
        baseSelect.className = 'stsp-select';
        sorted.forEach((l, i) => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = `${l.name}  (${l.elevation >= 0 ? '+' : ''}${l.elevation.toFixed(2)} m)`;
            if (i === 0) opt.selected = true;
            baseSelect.appendChild(opt);
        });
        baseSection.appendChild(baseSelect);
        body.appendChild(baseSection);

        // Top level
        const topSection = this._makeSection('Top Level (Above)');
        const topSelect = document.createElement('select');
        topSelect.className = 'stsp-select';
        sorted.forEach((l, i) => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = `${l.name}  (${l.elevation >= 0 ? '+' : ''}${l.elevation.toFixed(2)} m)`;
            if (i === 1) opt.selected = true;
            topSelect.appendChild(opt);
        });
        topSection.appendChild(topSelect);
        body.appendChild(topSection);

        // Width
        const widthSection = this._makeSection('Stair Width');
        const widthRow = document.createElement('div');
        widthRow.className = 'stsp-input-row';
        const widthInput = document.createElement('input');
        widthInput.type = 'number';
        widthInput.className = 'stsp-input';
        widthInput.value = '1.20';
        widthInput.min = '0.8';
        widthInput.max = '4.0';
        widthInput.step = '0.05';
        widthInput.setAttribute('aria-label', 'Stair width in metres');
        const widthUnit = document.createElement('span');
        widthUnit.className = 'stsp-unit';
        widthUnit.textContent = 'm';
        widthRow.appendChild(widthInput);
        widthRow.appendChild(widthUnit);
        widthSection.appendChild(widthRow);
        body.appendChild(widthSection);

        // ── Computed stair parameters info ────────────────────────────────
        const infoSection = this._makeSection('Computed Parameters');
        const infoGrid = document.createElement('div');
        infoGrid.className = 'stsp-info-grid';

        const riserCountEl = document.createElement('div');
        riserCountEl.className = 'stsp-info-item';
        const treadHeightEl = document.createElement('div');
        treadHeightEl.className = 'stsp-info-item';
        const treadDepthEl = document.createElement('div');
        treadDepthEl.className = 'stsp-info-item';

        infoGrid.appendChild(riserCountEl);
        infoGrid.appendChild(treadHeightEl);
        infoGrid.appendChild(treadDepthEl);
        infoSection.appendChild(infoGrid);
        body.appendChild(infoSection);

        const updateComputedInfo = () => {
            const baseLevel = sorted.find(l => l.id === baseSelect.value);
            const topLevel  = sorted.find(l => l.id === topSelect.value);
            const typeDef   = BUILT_IN_STAIR_TYPES.find(t => t.id === selectedTypeId) ?? BUILT_IN_STAIR_TYPES[0];

            if (!baseLevel || !topLevel || topLevel.elevation <= baseLevel.elevation) {
                riserCountEl.innerHTML  = '<span class="stsp-info-label">Risers</span><span class="stsp-info-val">—</span>';
                treadHeightEl.innerHTML = '<span class="stsp-info-label">Riser ht.</span><span class="stsp-info-val">—</span>';
                treadDepthEl.innerHTML  = '<span class="stsp-info-label">Tread</span><span class="stsp-info-val">—</span>';
                return;
            }

            const levelH = topLevel.elevation - baseLevel.elevation;
            const targetRiser = typeDef.rules.targetRiserHeight;
            const count = Math.max(2, Math.round(levelH / targetRiser));
            const rh = (levelH / count * 1000).toFixed(0);
            const blondel = ((levelH / count) * 2 + typeDef.rules.minTreadDepth).toFixed(3);

            riserCountEl.innerHTML  = `<span class="stsp-info-label">Risers</span><span class="stsp-info-val">${count}</span>`;
            treadHeightEl.innerHTML = `<span class="stsp-info-label">Riser ht.</span><span class="stsp-info-val">${rh} mm</span>`;
            treadDepthEl.innerHTML  = `<span class="stsp-info-label">Blondel</span><span class="stsp-info-val ${parseFloat(blondel) >= 0.6 && parseFloat(blondel) <= 0.65 ? 'stsp-info-ok' : 'stsp-info-warn'}">${(parseFloat(blondel) * 1000).toFixed(0)} mm</span>`;
        };

        baseSelect.addEventListener('change', updateComputedInfo);
        topSelect.addEventListener('change', updateComputedInfo);
        updateComputedInfo();

        panel.appendChild(body);

        // ── Inline error area ────────────────────────────────────────────
        const errorEl = document.createElement('div');
        errorEl.className = 'stsp-error';
        errorEl.style.display = 'none';
        panel.appendChild(errorEl);

        const showError = (msg: string) => {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
        };

        // ── Footer buttons ───────────────────────────────────────────────
        const footer = document.createElement('div');
        footer.className = 'stsp-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'stsp-btn stsp-btn--cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => {
            this.dismiss();
            opts.onCancel?.();
        };

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'stsp-btn stsp-btn--confirm';
        confirmBtn.textContent = 'Place Stair  →';
        confirmBtn.onclick = () => {
            const baseLevelId = baseSelect.value;
            const topLevelId  = topSelect.value;
            const width       = parseFloat(widthInput.value);

            if (baseLevelId === topLevelId) {
                showError('Base and top levels must be different.');
                return;
            }
            const baseLevel = sorted.find(l => l.id === baseLevelId);
            const topLevel  = sorted.find(l => l.id === topLevelId);
            if (!baseLevel || !topLevel) { showError('Invalid level selection.'); return; }
            if (topLevel.elevation <= baseLevel.elevation) {
                showError('Top level must be higher than the base level.');
                return;
            }
            if (isNaN(width) || width < 0.8) {
                showError('Width must be at least 0.80 m.');
                return;
            }
            this.dismiss();
            opts.onConfirm({ baseLevelId, topLevelId, width, typeId: selectedTypeId, mode: selectedMode });
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);
        panel.appendChild(footer);

        // Hint
        const hint = document.createElement('div');
        hint.className = 'stsp-hint';
        hint.textContent = 'Esc to cancel';
        panel.appendChild(hint);

        document.body.appendChild(panel);
        this.el = panel;

        // ── ESC handler ─────────────────────────────────────────────────
        this.escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.dismiss();
                opts.onCancel?.();
            }
        };
        document.addEventListener('keydown', this.escHandler);
    }

    dismiss(): void {
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler);
            this.escHandler = null;
        }
    }

    private _makeSection(labelText: string): HTMLElement {
        const sec = document.createElement('div');
        sec.className = 'stsp-section';
        const lbl = document.createElement('label');
        lbl.className = 'stsp-label';
        lbl.textContent = labelText;
        sec.appendChild(lbl);
        return sec;
    }
}
