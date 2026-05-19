import type { ViewDefinition, ViewOutputSettings, ViewRangeSettings } from '@pryzm/core-app-model';
import { PLAN_VIEW_TYPES } from '@pryzm/core-app-model';
import { SceneTheme } from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { getInheritedFromViewId, resolveBoundIntentWithInheritance } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { renderIntentSourcePill, deriveIntentSourceState, countOverrides } from './intent/IntentSourcePill';
import { renderSpineOverrideList } from './intent/SpineOverrideList';
import { intentUsageCount, formatIntentUsageLabel } from '@pryzm/core-app-model';
import { renderDivergedBanner, shouldShowDivergedBanner, dismissDivergedBanner } from './intent/DivergedBanner';

import { ICON_PENCIL, ICON_INTENT, makeIcon } from './icons/ViewerIconSet';
import { computeViewRangeDefaults } from '@pryzm/core-app-model';
import type { Level } from '@pryzm/core-app-model';

export interface VisIntentHost {
    runtime: any;
    selectedView: any;
    show(view: any): void;
    _execAssignViewIntent(viewId: string, intentId: string): void;
    _clearContent(): void;
    _renderDefinitionProperties(def: ViewDefinition): void;
}
export function buildVisibilityIntentSection(host: VisIntentHost, def: ViewDefinition): HTMLElement {
    const instance = viewIntentInstanceStore.get(def.id);
    const intents  = visibilityIntentStore.getAll();
    const bound    = instance ? visibilityIntentStore.get(instance.intentId) : null;
    const sourceState = deriveIntentSourceState(instance?.localOverrides ?? null, !!instance);
    const overrideTotal = countOverrides(instance?.localOverrides ?? null);

    const wrap = document.createElement('div');
    wrap.className = 'vi-spine';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Visibility Intent');

    // ── Diverged banner (Wave 6 / Stage A9) ───────────────────────────
    // Rendered above the header when the bound intent has advanced past
    // the view's pinned version and the user hasn't dismissed for the
    // session. Returns silently when no pin or already at latest.
    if (instance && bound && shouldShowDivergedBanner(
        bound.id, def.id, instance.pinnedVersion, bound.version,
    )) {
        const pinned = instance.pinnedVersion as number;
        // Phase B.34 (S73-WIRE) — `renderDivergedBanner` already widened to
        // accept an optional `runtime` last arg; thread `host.runtime` so
        // the banner can record acknowledgement via runtime.bus once C lands.
        wrap.appendChild(renderDivergedBanner({
            pinnedVersion:  pinned,
            currentVersion: bound.version,
            onTakeLatest: () => {
                (host.runtime?.bus as any)?.executeCommand('vg.takeLatestIntentVersion', { viewId: def.id });
            },
            onStayPinned: () => {
                dismissDivergedBanner(bound.id, def.id);
                // Force a spine rebuild so the banner disappears.
                if (host.selectedView) {
                    host.show(host.selectedView);
                }
            },
        }, host.runtime /* B-runtime-thread renderDivergedBanner */));
    }

    // ── Header row: title + source pill ───────────────────────────────
    const head = document.createElement('div');
    head.className = 'vi-spine__head';

    const title = document.createElement('span');
    title.className = 'vi-spine__title';
    title.appendChild(makeIcon(ICON_INTENT));
    const titleText = document.createElement('span');
    titleText.textContent = 'Visibility Intent';
    title.appendChild(titleText);
    head.appendChild(title);

    // Phase B.34 (S73-WIRE) — thread runtime to renderIntentSourcePill so
    // its renderField path can route through runtime.intent once C lands.
    head.appendChild(renderIntentSourcePill({
        state: sourceState,
        overrideCount: overrideTotal,
    }, host.runtime /* B-runtime-thread renderIntentSourcePill */));
    wrap.appendChild(head);

    // ── Bound name (large, prominent) ─────────────────────────────────
    // Wave 9 / Stage S6 — when this view has no own binding but inherits
    // one from an ancestor (detail off section, callout off plan, …),
    // surface the intent name **as inherited** plus an explicit
    // "Inherits from <parentName>" badge so the user can see why the
    // appearance is non-empty even though the bind picker shows
    // "(no intent)".
    const inheritedFromId = !instance ? getInheritedFromViewId(def.id) : null;
    const inherited = inheritedFromId
        ? resolveBoundIntentWithInheritance(def.id)
        : null;
    const inheritedIntent = inherited?.intent ?? null;

    const name = document.createElement('div');
    name.className = 'vi-spine__name';
    if (bound) {
        name.textContent = bound.name;
    } else if (inheritedIntent) {
        name.textContent = inheritedIntent.name;
        name.classList.add('vi-spine__name--inherited');
        name.style.fontStyle = 'italic';
    } else {
        name.textContent = 'No intent assigned';
    }
    wrap.appendChild(name);

    if (!bound && inheritedIntent && inheritedFromId) {
        const parentDef = viewDefinitionStore.get(inheritedFromId);
        const parentName = parentDef?.name ?? inheritedFromId;
        const badge = document.createElement('div');
        badge.className = 'vi-spine__inherits-badge';
        badge.setAttribute('role', 'note');
        badge.setAttribute(
            'aria-label',
            `This view inherits its bound intent from "${parentName}".`,
        );
        badge.title = `Detail / dependent views inherit their parent view's bound intent. `
            + `Assign an intent on this view to override the inherited one.`;
        badge.textContent = `Inherits from “${parentName}”`;
        badge.style.cssText = [
            'font-size:0.72rem',
            'color:var(--vi-text-muted, #6b7280)',
            'background:var(--vi-bg-soft, rgba(99,102,241,0.08))',
            'border:1px solid var(--vi-border-soft, rgba(99,102,241,0.25))',
            'border-radius:4px',
            'padding:2px 6px',
            'margin-top:4px',
            'display:inline-block',
            'font-style:italic',
        ].join(';');
        wrap.appendChild(badge);
    }

    // ── Usage count (Wave 5 / Stage A8) ───────────────────────────────
    // "Used by 12 views" / "Used by 1 view (this one)" — answers
    // "Will my edit affect other views?" before the user touches anything.
    if (bound) {
        const usage = intentUsageCount(bound.id, def.id);
        const usageEl = document.createElement('div');
        usageEl.className = 'vi-spine__usage'
            + (usage.onlyThisView ? ' vi-spine__usage--solo' : '');
        usageEl.textContent = formatIntentUsageLabel(usage);
        wrap.appendChild(usageEl);
    }

    // ── Picker row: select intent ─────────────────────────────────────
    const pickerRow = document.createElement('div');
    pickerRow.className = 'vi-spine__row';

    const select = document.createElement('select');
    select.className = 'vi-spine__select';
    select.setAttribute('aria-label', 'Bind view to a Visibility Intent');

    if (!instance) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '— pick an intent —';
        placeholder.selected = true;
        placeholder.disabled = true;
        select.appendChild(placeholder);
    }
    intents.forEach((intent) => {
        const opt = document.createElement('option');
        opt.value = intent.id;
        opt.textContent = intent.name;
        if (intent.id === instance?.intentId) opt.selected = true;
        select.appendChild(opt);
    });
    select.addEventListener('change', () => {
        if (select.value) host._execAssignViewIntent(def.id, select.value);
    });
    pickerRow.appendChild(select);
    wrap.appendChild(pickerRow);

    // ── Open Intent Editor — full-width spine action ──────────────────
    const editBtn = document.createElement('button');
    editBtn.type      = 'button';
    editBtn.className = 'vi-spine__btn';
    editBtn.appendChild(makeIcon(ICON_PENCIL));
    const editLabel = document.createElement('span');
    editLabel.textContent = 'Open Intent Editor';
    editBtn.appendChild(editLabel);
    editBtn.addEventListener('click', () => {
        window.visibilityIntentPanel?.open?.(instance?.intentId ?? intents[0]?.id); // TODO(F.6.5): legacy visibilityIntentPanel — replace with runtime.panelHost.get('visibilityIntent')
    });
    wrap.appendChild(editBtn);

    // ── A7 — Per-target override list (only when instance exists) ────
    if (instance) {
        // Phase B.36 (S73-WIRE) — thread runtime to renderSpineOverrideList
        // so its onChanged path can route through runtime.intent in C.
        wrap.appendChild(renderSpineOverrideList({
            viewId: def.id,
            layer: instance.localOverrides,
            onChanged: () => {
                // Re-render the panel so the spine + override list pick up the change.
                host._clearContent();
                host._renderDefinitionProperties(def);
            },
        }, host.runtime /* B-runtime-thread renderSpineOverrideList */));
    }

    return wrap;
}

export interface OutputSectionHost {
    _fireSetViewOutput(viewId: string, output: ViewOutputSettings | null): void;
    onSceneBgChange: ((colorHex: string) => void) | undefined;
    _vppSection(title: string, content: HTMLElement, collapsed?: boolean): HTMLElement;
}
export function buildOutputSection(host: OutputSectionHost, def: ViewDefinition): HTMLElement {
    const o = def.output ?? {};
    const content = document.createElement('div');
    content.style.display = 'contents';

    // ── Scale ────────────────────────────────────────────────────────────
    const scaleLabel = document.createElement('div');
    scaleLabel.className   = 'vpp-label';
    scaleLabel.textContent = 'Scale (1:N)';
    content.appendChild(scaleLabel);

    const scaleInput = document.createElement('input');
    scaleInput.className   = 'vpp-input';
    scaleInput.type        = 'number';
    scaleInput.min         = '1';
    scaleInput.placeholder = '100';
    scaleInput.value       = o.scale !== undefined ? String(o.scale) : '';
    scaleInput.addEventListener('blur', () => {
        const val = parseFloat(scaleInput.value);
        if (!isNaN(val) && val > 0) {
            const patch: ViewOutputSettings = { ...o, scale: val };
            host._fireSetViewOutput(def.id, patch);
        }
    });
    content.appendChild(scaleInput);

    // ── Detail Level ─────────────────────────────────────────────────────
    const dlLabel = document.createElement('div');
    dlLabel.className   = 'vpp-label';
    dlLabel.textContent = 'Detail Level';
    content.appendChild(dlLabel);

    const dlSelect = document.createElement('select');
    dlSelect.className = 'vpp-input';
    const dlOptions: Array<{ value: string; label: string }> = [
        { value: '', label: '(inherit)' },
        { value: 'coarse', label: 'Coarse' },
        { value: 'medium', label: 'Medium' },
        { value: 'fine',   label: 'Fine' },
    ];
    dlOptions.forEach(opt => {
        const el = document.createElement('option');
        el.value       = opt.value;
        el.textContent = opt.label;
        if ((o.detailLevel ?? '') === opt.value) el.selected = true;
        dlSelect.appendChild(el);
    });
    dlSelect.addEventListener('change', () => {
        const val = dlSelect.value as ViewOutputSettings['detailLevel'] | undefined;
        const patch: ViewOutputSettings = { ...o };
        if (val) patch.detailLevel = val;
        else delete patch.detailLevel;
        host._fireSetViewOutput(def.id, patch);
    });
    content.appendChild(dlSelect);

    // ── Visual Style ─────────────────────────────────────────────────────
    const vsLabel = document.createElement('div');
    vsLabel.className   = 'vpp-label';
    vsLabel.textContent = 'Visual Style';
    content.appendChild(vsLabel);

    const vsSelect = document.createElement('select');
    vsSelect.className = 'vpp-input';
    const vsOptions: Array<{ value: string; label: string }> = [
        { value: '',               label: '(inherit)' },
        { value: 'wireframe',      label: 'Wireframe' },
        { value: 'hiddenLine',     label: 'Hidden Line' },
        { value: 'shaded',         label: 'Shaded' },
        { value: 'shadedWithEdges', label: 'Shaded+Edges' },
        { value: 'realistic',      label: 'Realistic' },
    ];
    vsOptions.forEach(opt => {
        const el = document.createElement('option');
        el.value       = opt.value;
        el.textContent = opt.label;
        if ((o.visualStyle ?? '') === opt.value) el.selected = true;
        vsSelect.appendChild(el);
    });
    vsSelect.addEventListener('change', () => {
        const val = vsSelect.value as ViewOutputSettings['visualStyle'] | undefined;
        const patch: ViewOutputSettings = { ...o };
        if (val) patch.visualStyle = val;
        else delete patch.visualStyle;
        host._fireSetViewOutput(def.id, patch);
    });
    content.appendChild(vsSelect);

    // ── Display Model ────────────────────────────────────────────────────
    const dmLabel = document.createElement('div');
    dmLabel.className   = 'vpp-label';
    dmLabel.textContent = 'Display Model';
    content.appendChild(dmLabel);

    const dmSelect = document.createElement('select');
    dmSelect.className = 'vpp-input';
    const dmOptions: Array<{ value: string; label: string }> = [
        { value: '',         label: '(inherit)' },
        { value: 'normal',   label: 'Normal' },
        { value: 'halftone', label: 'Halftone' },
        { value: 'hidden',   label: 'Hidden' },
    ];
    dmOptions.forEach(opt => {
        const el = document.createElement('option');
        el.value       = opt.value;
        el.textContent = opt.label;
        if ((o.displayModel ?? '') === opt.value) el.selected = true;
        dmSelect.appendChild(el);
    });
    dmSelect.addEventListener('change', () => {
        const val = dmSelect.value as ViewOutputSettings['displayModel'] | undefined;
        const patch: ViewOutputSettings = { ...o };
        if (val) patch.displayModel = val;
        else delete patch.displayModel;
        host._fireSetViewOutput(def.id, patch);
    });
    content.appendChild(dmSelect);

    // ── Shadows ──────────────────────────────────────────────────────────
    const shadowLabel = document.createElement('div');
    shadowLabel.className   = 'vpp-label';
    shadowLabel.textContent = 'Shadows';
    content.appendChild(shadowLabel);

    const shadowCheck = document.createElement('input');
    shadowCheck.type  = 'checkbox';
    shadowCheck.style.justifySelf = 'end';
    shadowCheck.indeterminate     = o.shadows === undefined;
    shadowCheck.checked           = o.shadows ?? false;
    shadowCheck.addEventListener('change', () => {
        const patch: ViewOutputSettings = { ...o, shadows: shadowCheck.checked };
        host._fireSetViewOutput(def.id, patch);
    });
    content.appendChild(shadowCheck);

    // ── Scene Background Colour ──────────────────────────────────────────
    // Global scene setting (not per-view). Persisted to localStorage via
    // SceneTheme.setBackground so it survives page reload.
    const bgLabel = document.createElement('div');
    bgLabel.className   = 'vpp-label';
    bgLabel.textContent = 'Scene Background';
    content.appendChild(bgLabel);

    const bgWrapper = document.createElement('div');
    bgWrapper.style.cssText = 'display:flex;align-items:center;gap:6px;justify-self:end;';

    const bgPicker = document.createElement('input');
    bgPicker.type  = 'color';
    bgPicker.value = SceneTheme.getStoredColor();
    bgPicker.style.cssText = 'width:28px;height:24px;padding:0;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:none;';
    bgPicker.title = 'Scene background colour';

    const bgReset = document.createElement('button');
    bgReset.textContent = '↺';
    bgReset.title       = 'Reset to default';
    bgReset.style.cssText = 'font-size:12px;padding:2px 5px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:#f5f5f5;color:#555;line-height:1;';

    bgPicker.addEventListener('input', () => {
        host.onSceneBgChange?.(bgPicker.value);
    });

    bgReset.addEventListener('click', () => {
        const defaultColor = '#e8edf6';
        bgPicker.value = defaultColor;
        host.onSceneBgChange?.(defaultColor);
    });

    bgWrapper.appendChild(bgPicker);
    bgWrapper.appendChild(bgReset);
    content.appendChild(bgWrapper);

    return host._vppSection('Output', content);
}

export interface ViewRangeSectionHost {
    _fireSetViewRange(viewId: string, viewRange: ViewRangeSettings | null): void;
    _vppSection(title: string, content: HTMLElement, collapsed?: boolean): HTMLElement;
}
export function buildViewRangeSection(host: ViewRangeSectionHost, def: ViewDefinition): HTMLElement | null {
    if (!(PLAN_VIEW_TYPES as readonly string[]).includes(def.viewType)) return null;

    // ── §02 §1 — Read levels from the single spatial authority (BimManager) ─
    const bimManager   = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
    const levels: Level[] = bimManager?.getLevels?.() ?? [];
    const sortedLevels    = [...levels].sort((a, b) => a.elevation - b.elevation);

    // Existing persisted view range (undefined when not yet saved).
    const vr = def.viewRange;

    // ── Intelligent defaults derived from spatial.levelId (§VI-13) ────────
    // Used to pre-populate the form and to power the Reset button.
    const defaults  = computeViewRangeDefaults(def.spatial?.levelId, levels);
    const effective = vr ?? defaults;      // prefer persisted; fall back to computed
    const usingDefaults = !vr;

    const content = document.createElement('div');
    content.style.display = 'contents';

    // Info note — only visible when the form shows auto-computed defaults.
    if (usingDefaults) {
        const hint = document.createElement('div');
        hint.style.cssText = 'grid-column:span 2;color:var(--app-text-muted,#888);' +
                              'font-size:0.72rem;font-style:italic;margin-bottom:2px;';
        hint.textContent = 'Auto-computed from associated level — adjust and Save to persist.';
        content.appendChild(hint);
    }

    // ── One row per bound (Top / Cut / Bottom / Depth) ────────────────────
    const boundInputs: { levelId: HTMLSelectElement; offset: HTMLInputElement }[] = [];

    const boundDefs = [
        { label: 'Top',    val: effective.top    },
        { label: 'Cut',    val: effective.cut    },
        { label: 'Bottom', val: effective.bottom },
        { label: 'Depth',  val: effective.depth  },
    ] as const;

    boundDefs.forEach(({ label, val }) => {
        // Sub-header label
        const subhdr = document.createElement('div');
        subhdr.style.cssText = 'grid-column:span 2;font-size:0.72rem;font-weight:600;' +
                                'color:var(--app-text-muted,#555);margin-top:4px;';
        subhdr.textContent = label;
        content.appendChild(subhdr);

        // Level dropdown — §02 §1: levelId resolved via BimManager, never hardcoded.
        const lvlLabel = document.createElement('div');
        lvlLabel.className   = 'vpp-label';
        lvlLabel.textContent = 'Level';
        content.appendChild(lvlLabel);

        const lvlSelect = document.createElement('select');
        lvlSelect.className = 'vpp-input';

        if (sortedLevels.length === 0) {
            const placeholder = document.createElement('option');
            placeholder.value       = '';
            placeholder.textContent = '(no levels defined)';
            placeholder.disabled    = true;
            placeholder.selected    = true;
            lvlSelect.appendChild(placeholder);
        } else {
            sortedLevels.forEach(lvl => {
                const opt = document.createElement('option');
                opt.value       = lvl.id;
                opt.textContent = lvl.name;
                if (lvl.id === val.levelId) opt.selected = true;
                lvlSelect.appendChild(opt);
            });
        }
        content.appendChild(lvlSelect);

        // Offset numeric input
        const offLabel = document.createElement('div');
        offLabel.className   = 'vpp-label';
        offLabel.textContent = 'Offset (m)';
        content.appendChild(offLabel);

        const offInput = document.createElement('input');
        offInput.className   = 'vpp-input';
        offInput.type        = 'number';
        offInput.step        = '0.01';
        offInput.placeholder = '0';
        offInput.value       = String(val.offset);
        content.appendChild(offInput);

        boundInputs.push({ levelId: lvlSelect, offset: offInput });
    });

    // ── Reset to Defaults button ──────────────────────────────────────────
    const resetBtn = document.createElement('button');
    resetBtn.style.cssText = `
        grid-column:span 2;margin-top:6px;padding:4px;
        background:transparent;color:var(--app-text-muted,#666);
        border:1px solid var(--app-border-light,#ddd);
        border-radius:4px;cursor:pointer;font-size:0.72rem;font-family:inherit;
    `;
    resetBtn.textContent = '↺ Reset to Level Defaults';
    resetBtn.onclick = () => {
        const fresh = computeViewRangeDefaults(def.spatial?.levelId, levels);
        const freshBounds = [fresh.top, fresh.cut, fresh.bottom, fresh.depth];
        boundInputs.forEach(({ levelId: sel, offset: off }, i) => {
            const fb = freshBounds[i];
            const match = Array.from(sel.options).find(o => o.value === fb.levelId);
            if (match) match.selected = true;
            off.value = String(fb.offset);
        });
    };
    content.appendChild(resetBtn);

    // ── Save button — fires SetViewRangeCommand (§01 §2 command-first rule) ─
    const saveBtn = document.createElement('button');
    saveBtn.style.cssText = `
        grid-column:span 2;margin-top:4px;padding:5px;
        background:#4a90d9;color:#fff;border:none;
        border-radius:4px;cursor:pointer;font-size:0.75rem;font-weight:600;font-family:inherit;
    `;
    saveBtn.textContent = 'Save View Range';
    saveBtn.onclick = () => {
        const [topI, cutI, botI, depI] = boundInputs;
        if (!topI.levelId.value.trim() || !cutI.levelId.value.trim() ||
            !botI.levelId.value.trim() || !depI.levelId.value.trim()) {
            saveBtn.textContent = 'All Levels required';
            saveBtn.style.background = '#e55';
            setTimeout(() => { saveBtn.textContent = 'Save View Range'; saveBtn.style.background = '#4a90d9'; }, 2000);
            return;
        }
        const newRange: ViewRangeSettings = {
            top:    { levelId: topI.levelId.value.trim(), offset: parseFloat(topI.offset.value) || 0 },
            cut:    { levelId: cutI.levelId.value.trim(), offset: parseFloat(cutI.offset.value) || 0 },
            bottom: { levelId: botI.levelId.value.trim(), offset: parseFloat(botI.offset.value) || 0 },
            depth:  { levelId: depI.levelId.value.trim(), offset: parseFloat(depI.offset.value) || 0 },
        };
        host._fireSetViewRange(def.id, newRange);
        saveBtn.textContent = 'Saved ✓';
        saveBtn.style.background = '#28a745';
        setTimeout(() => { saveBtn.textContent = 'Save View Range'; saveBtn.style.background = '#4a90d9'; }, 1800);
    };
    content.appendChild(saveBtn);

    return host._vppSection('View Range', content, true);
}
