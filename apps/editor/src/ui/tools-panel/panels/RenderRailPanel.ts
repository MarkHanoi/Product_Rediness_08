/**
 * RenderRailPanel — Render section for the right tools rail system.
 *
 * Extracted from the #render-content accordion in Layout.ts.
 * Three collapsible sub-sections (all collapsed by default):
 *
 *   1. Viewport Style — postproduction toggles, render style select, edge/outline sliders
 *   2. Photorealistic — pipeline status badges, SSGI/TRAA toggles, shortcut buttons
 *   3. Export         — Export Studio and Render Queue shortcuts
 *
 * All renderer access goes through `window.world?.renderer` and // TODO(D.4): legacy world — replace with runtime.scene.world
 * `window.renderPipelineManager` — consistent with how other panels // TODO(D.4): legacy renderPipelineManager — replace with runtime.scene.renderer.pipeline
 * access engine APIs.  Panel getters (ExportStudio, RenderQueue, VisEngine)
 * are imported as module-level functions.
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* layout elements; pure native HTML
 *   §01      — No direct store mutations; interactions via window APIs + module imports
 *   §05 §7.6 — No independent <style> injection; styles live in AppTheme.ts
 */

import { getExportStudioPanel }        from '../../rendering/ExportStudioPanel';
import { getRenderQueuePanel }          from '../../rendering/RenderQueuePanel';
import { getVisualizationEnginePanel }  from '../../rendering/VisualizationEnginePanel';
import { VisualStyle }                  from '@pryzm/core-app-model/material-library';
import * as PryzmIcons                  from '../../icons/PryzmIcons';
import type { ToolsRailController }     from '../ToolsRailController';
import type { ToolsPanelProps }         from '../ToolsPanelTypes';

// Numeric constants that mirror PostproductionAspect enum values at runtime.
// The OBCF global may not exist at build time, so we fall back to raw numbers.
const ASPECT = {
    COLOR:            0,
    PEN:              1,
    PEN_SHADOWS:      2,
    COLOR_PEN:        3,
    COLOR_SHADOWS:    4,
    COLOR_PEN_SHADOWS:5,
};

export class RenderRailPanel {
    private _activeStyle: VisualStyle = VisualStyle.CONSISTENT_COLORS;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private readonly _props: ToolsPanelProps,
        _rail:  ToolsRailController,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;}

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'tpr-rnd-root';

        root.appendChild(this._buildVisualSection());
        root.appendChild(this._buildViewportStyleSection());
        root.appendChild(this._buildPhotorealisticSection());
        root.appendChild(this._buildExportSection());

        return root;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sub-section: Visual (absorbed from removed VISUAL rail panel)
    // ─────────────────────────────────────────────────────────────────────────

    private _buildVisualSection(): HTMLElement {
        const body = document.createElement('div');
        body.className = 'tpr-rnd-sub-body';

        // Toggle Shadows button
        const shadowBtn = document.createElement('button');
        shadowBtn.type      = 'button';
        shadowBtn.className = 'tpr-vis-action-btn';
        shadowBtn.title     = 'Toggle scene shadows';
        const shadowIcon = PryzmIcons.iconEl('solar:sun-bold', 'tpr-vis-action-icon', 16);
        const shadowLbl  = document.createElement('span');
        shadowLbl.textContent = 'Toggle Shadows';
        shadowBtn.appendChild(shadowIcon);
        shadowBtn.appendChild(shadowLbl);
        shadowBtn.addEventListener('click', () => {
            console.log('[RenderRailPanel] Toggle shadows');
            this._props.toggleShadows();
        });
        body.appendChild(shadowBtn);

        // Visual Style divider + segment
        const styleDivider = document.createElement('div');
        styleDivider.className   = 'tpr-vis-divider';
        styleDivider.textContent = 'Visual Style';
        body.appendChild(styleDivider);

        const styles: Array<{ label: string; value: VisualStyle }> = [
            { label: 'Draft',     value: VisualStyle.CONSISTENT_COLORS },
            { label: 'Realistic', value: VisualStyle.REALISTIC },
            { label: 'Textures',  value: VisualStyle.TEXTURES },
        ];
        const segment = document.createElement('div');
        segment.className = 'tpr-vis-segment';
        const segBtns: HTMLButtonElement[] = [];
        for (const style of styles) {
            const btn = document.createElement('button');
            btn.type      = 'button';
            btn.textContent = style.label;
            btn.className = 'tpr-vis-seg-btn' +
                (style.value === this._activeStyle ? ' tpr-vis-seg-btn--active' : '');
            btn.addEventListener('click', () => {
                this._activeStyle = style.value;
                segBtns.forEach((b, i) => {
                    b.classList.toggle('tpr-vis-seg-btn--active', styles[i].value === style.value);
                });
                console.log(`[RenderRailPanel] Visual style → ${style.value}`);
                this._props.applyVisualStyle(style.value);
            });
            segBtns.push(btn);
            segment.appendChild(btn);
        }
        body.appendChild(segment);

        // Annotations checkbox
        const annoDivider = document.createElement('div');
        annoDivider.className   = 'tpr-vis-divider';
        annoDivider.textContent = 'Visibility';
        body.appendChild(annoDivider);
        body.appendChild(this._buildCheckRow('Annotations', true, (v) => {
            const dimManager = window.dimensionManager; // TODO(D.4): legacy dimensionManager — replace with runtime.scene.dimension manager
            if (dimManager) {
                console.log(`[RenderRailPanel] Annotations visibility → ${v}`);
                dimManager.setVisibility(v);
            }
        }));

        return this._buildSubSection('Visual', body, true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sub-section: Viewport Style
    // ─────────────────────────────────────────────────────────────────────────

    private _buildViewportStyleSection(): HTMLElement {
        const body = document.createElement('div');
        body.className = 'tpr-rnd-sub-body';

        // Postproduction enabled
        body.appendChild(this._buildCheckRow('Postproduction', true, (v) => {
            const pp = this._pp();
            if (pp) pp.enabled = v;
        }));

        // Render style select
        body.appendChild(this._buildSubLabel('Render Style'));
        const styleSelect = this._buildSelect([
            { label: 'Basic',            value: String(ASPECT.COLOR)             },
            { label: 'Pen',              value: String(ASPECT.PEN)               },
            { label: 'Shadowed Pen',     value: String(ASPECT.PEN_SHADOWS)       },
            { label: 'Color Pen',        value: String(ASPECT.COLOR_PEN)         },
            { label: 'Color Shadows',    value: String(ASPECT.COLOR_SHADOWS)     },
            { label: 'Color Pen Shadows',value: String(ASPECT.COLOR_PEN_SHADOWS) },
        ], (v) => {
            const pp = this._pp();
            // Prefer runtime OBCF constant if available; fall back to numeric string
            if (pp) pp.style = window.OBCF?.PostproductionAspect?.[ // TODO(D.4): legacy OBCF — replace with runtime.scene.components-front (ThatOpen front)
                Object.keys(ASPECT).find(k => String(ASPECT[k as keyof typeof ASPECT]) === v) ?? ''
            ] ?? Number(v);
        });
        body.appendChild(styleSelect);

        // Outlines
        body.appendChild(this._buildCheckRow('Outlines', true, (v) => {
            const pp = this._pp();
            if (pp) pp.outlinesEnabled = v;
        }));

        // SMAA
        body.appendChild(this._buildCheckRow('SMAA', true, (v) => {
            const pp = this._pp();
            if (pp) pp.smaaEnabled = v;
        }));

        // Edge Detection — Width
        body.appendChild(this._buildSubLabel('Edges Detection'));
        body.appendChild(this._buildSlider('Width', 1, 1, 3, 0.1, (v) => {
            const pp = this._pp();
            if (pp?.edgesPass) pp.edgesPass.width = v;
        }));

        // Outline Style — Thickness + Fill Opacity
        body.appendChild(this._buildSubLabel('Outline Style'));
        body.appendChild(this._buildSlider('Thickness', 1, 1, 10, 0.1, (v) => {
            const pp = this._pp();
            if (pp?.outlinePass) pp.outlinePass.thickness = v;
        }));
        body.appendChild(this._buildSlider('Fill Opacity', 0.2, 0, 1, 0.01, (v) => {
            const pp = this._pp();
            if (pp?.outlinePass) pp.outlinePass.fillOpacity = v;
        }));

        return this._buildSubSection('Viewport Style', body);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sub-section: Photorealistic
    // ─────────────────────────────────────────────────────────────────────────

    private _buildPhotorealisticSection(): HTMLElement {
        const body = document.createElement('div');
        body.className = 'tpr-rnd-sub-body';

        // Pipeline status badge strip
        const badgeStrip = this._buildBadgeStrip();
        body.appendChild(badgeStrip);

        // ── Sync badge dots to the actual RPM pipeline state ──────────────────
        // This does NOT call activateSSGI() or deactivateTRAA() — those are
        // handled by initScene.ts (SSGI ON, TRAA OFF at startup).  Calling them
        // here when they are already in the correct state causes redundant pipeline
        // rebuilds that reset the SSGI temporal-accumulation history and produce
        // the persistent startup flicker.  We only update the visual badge dots.
        const syncBadges = () => {
            const rpm = window.renderPipelineManager; // TODO(D.4): legacy renderPipelineManager — replace with runtime.scene.renderer.pipeline
            const ssgiDot  = badgeStrip.querySelector<HTMLElement>('#ph-badge-ssgi  .tpr-rnd-badge-dot');
            const traaDot  = badgeStrip.querySelector<HTMLElement>('#ph-badge-traa  .tpr-rnd-badge-dot');
            const ssgiOn   = rpm?.status?.ssgiActive ?? true;
            const traaOn   = rpm?.status?.traaActive ?? false;
            if (ssgiDot) { ssgiDot.style.background = ssgiOn ? '#22c55e' : '#ef4444'; ssgiDot.style.boxShadow = ssgiOn ? '0 0 4px #22c55e88' : 'none'; }
            if (traaDot) { traaDot.style.background = traaOn ? '#22c55e' : '#ef4444'; traaDot.style.boxShadow = traaOn ? '0 0 4px #22c55e88' : 'none'; }
            console.log(`[RenderRailPanel] Badges synced — SSGI: ${ssgiOn ? 'ON' : 'OFF'}, TRAA: ${traaOn ? 'ON' : 'OFF'}`);
        };
        // Sync immediately and once after startup settles (RPM may not be ready yet)
        syncBadges();
        setTimeout(syncBadges, 1000);

        // SSGI toggle — default ON
        body.appendChild(this._buildToggleRow('SSGI', 'ph-toggle-ssgi',
            'Screen-Space Global Illumination', true,
            (on) => {
                const rpm = window.renderPipelineManager; // TODO(D.4): legacy renderPipelineManager — replace with runtime.scene.renderer.pipeline
                if (!rpm) return;
                on ? rpm.activateSSGI() : rpm.deactivateSSGI();
                const dot = badgeStrip.querySelector<HTMLElement>('#ph-badge-ssgi .tpr-rnd-badge-dot');
                if (dot) {
                    dot.style.background  = on ? '#22c55e' : '#ef4444';
                    dot.style.boxShadow   = on ? '0 0 4px #22c55e88' : 'none';
                }
                console.log(`[RenderRailPanel] SSGI → ${on}`);
            }
        ));

        // TRAA toggle — default OFF
        body.appendChild(this._buildToggleRow('TRAA', 'ph-toggle-traa',
            'Temporal Reprojection Anti-Aliasing', false,
            (on) => {
                const rpm = window.renderPipelineManager; // TODO(D.4): legacy renderPipelineManager — replace with runtime.scene.renderer.pipeline
                if (!rpm) return;
                on ? rpm.activateTRAA() : rpm.deactivateTRAA();
                const dot = badgeStrip.querySelector<HTMLElement>('#ph-badge-traa .tpr-rnd-badge-dot');
                if (dot) {
                    dot.style.background  = on ? '#22c55e' : '#ef4444';
                    dot.style.boxShadow   = on ? '0 0 4px #22c55e88' : 'none';
                }
                console.log(`[RenderRailPanel] TRAA → ${on}`);
            }
        ));

        // Shortcut buttons
        body.appendChild(this._buildShortcutBtn('⬡ Path Trace Viewport',
            'Open the Path Trace tab inside Visualization Engine',
            () => window.vizEnginePanel?.openAtRenderModeTab() // TODO(F.6.5): legacy vizEnginePanel — replace with runtime.panelHost.get('visualizationEngine')
        ));

        body.appendChild(this._buildShortcutBtn('✨ Generate Still Image',
            'Open Export Studio — Still Image tab',
            () => getExportStudioPanel().toggle()
        ));

        body.appendChild(this._buildShortcutBtn('✦ Scene Setup',
            'Scene Setup — lighting, camera, and post-processing controls',
            () => getVisualizationEnginePanel().toggle()
        ));

        return this._buildSubSection('Photorealistic', body);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sub-section: Export
    // ─────────────────────────────────────────────────────────────────────────

    private _buildExportSection(): HTMLElement {
        const body = document.createElement('div');
        body.className = 'tpr-rnd-sub-body';

        body.appendChild(this._buildShortcutBtn('✦ Export Studio',
            'Export Studio — Still Image, 360° Panorama, and Video Flythrough',
            () => getExportStudioPanel().toggle()
        ));

        body.appendChild(this._buildShortcutBtn('📋 Render Queue',
            'Render Queue monitor',
            () => getRenderQueuePanel().toggle()
        ));

        return this._buildSubSection('Export', body);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Collapsible sub-section wrapper — shared by all three groups
    // ─────────────────────────────────────────────────────────────────────────

    private _buildSubSection(title: string, body: HTMLElement, defaultOpen = false): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'tpr-rnd-sub';

        const header = document.createElement('div');
        header.className = 'tpr-rnd-sub-hdr';

        const titleEl = document.createElement('span');
        titleEl.className = 'tpr-rnd-sub-title';
        titleEl.textContent = title;

        const chevron = document.createElement('span');
        chevron.className = 'tpr-rnd-sub-chev';

        header.appendChild(titleEl);
        header.appendChild(chevron);

        let open = defaultOpen;
        const sync = (): void => {
            body.style.display  = open ? 'flex' : 'none';
            chevron.textContent = open ? '▾' : '▸';
            chevron.style.color = open ? 'var(--app-accent,#6600ff)' : '#888';
        };
        sync();

        header.addEventListener('click', () => {
            open = !open;
            sync();
        });

        wrapper.appendChild(header);
        wrapper.appendChild(body);
        return wrapper;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pipeline status badge strip
    // ─────────────────────────────────────────────────────────────────────────

    private _buildBadgeStrip(): HTMLElement {
        const strip = document.createElement('div');
        strip.className = 'tpr-rnd-badge-strip';

        const badges: Array<{ id: string; label: string }> = [
            { id: 'ph-badge-webgpu', label: 'WebGPU' },
            { id: 'ph-badge-ssgi',   label: 'SSGI'   },
            { id: 'ph-badge-traa',   label: 'TRAA'   },
        ];

        for (const b of badges) {
            const el = document.createElement('span');
            el.id        = b.id;
            el.className = 'tpr-rnd-badge';

            const dot = document.createElement('span');
            dot.className = 'tpr-rnd-badge-dot';

            el.appendChild(dot);
            el.append(' ' + b.label);
            strip.appendChild(el);
        }

        return strip;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Shared primitive builders
    // ─────────────────────────────────────────────────────────────────────────

    private _buildCheckRow(
        label:    string,
        checked:  boolean,
        onChange: (value: boolean) => void,
    ): HTMLElement {
        const row = document.createElement('label');
        row.className = 'tpr-rnd-check-row';

        const input = document.createElement('input');
        input.type    = 'checkbox';
        input.checked = checked;
        input.className = 'tpr-rnd-check-input';
        input.addEventListener('change', () => onChange(input.checked));

        const text = document.createElement('span');
        text.className = 'tpr-rnd-check-label';
        text.textContent = label;

        row.appendChild(input);
        row.appendChild(text);
        return row;
    }

    private _buildToggleRow(
        label:          string,
        id:             string,
        title:          string,
        defaultChecked: boolean,
        onChange:       (on: boolean) => void,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'tpr-rnd-toggle-row';
        row.title = title;

        const labelEl = document.createElement('span');
        labelEl.className = 'tpr-rnd-toggle-label';
        labelEl.textContent = label;

        const input = document.createElement('input');
        input.type      = 'checkbox';
        input.id        = id;
        input.checked   = defaultChecked;
        input.className = 'tpr-rnd-toggle';
        input.addEventListener('change', () => onChange(input.checked));

        row.appendChild(labelEl);
        row.appendChild(input);
        return row;
    }

    private _buildSelect(
        options:  Array<{ label: string; value: string }>,
        onChange: (value: string) => void,
    ): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'tpr-rnd-select-wrap';

        const select = document.createElement('select');
        select.className = 'tpr-rnd-select';
        for (const opt of options) {
            const el = document.createElement('option');
            el.value       = opt.value;
            el.textContent = opt.label;
            select.appendChild(el);
        }
        select.addEventListener('change', () => onChange(select.value));

        wrap.appendChild(select);
        return wrap;
    }

    private _buildSlider(
        label:    string,
        value:    number,
        min:      number,
        max:      number,
        step:     number,
        onChange: (value: number) => void,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'tpr-rnd-slider-row';

        const topRow = document.createElement('div');
        topRow.className = 'tpr-rnd-slider-top';

        const labelEl = document.createElement('span');
        labelEl.className = 'tpr-rnd-slider-label';
        labelEl.textContent = label;

        const valEl = document.createElement('span');
        valEl.className   = 'tpr-rnd-slider-val';
        valEl.textContent = String(value);

        topRow.appendChild(labelEl);
        topRow.appendChild(valEl);

        const input = document.createElement('input');
        input.type      = 'range';
        input.className = 'tpr-rnd-slider-input';
        input.min       = String(min);
        input.max       = String(max);
        input.step      = String(step);
        input.value     = String(value);

        input.addEventListener('input', () => {
            const v = parseFloat(input.value);
            valEl.textContent = step < 0.1 ? v.toFixed(2) : v.toFixed(1);
            onChange(v);
        });

        row.appendChild(topRow);
        row.appendChild(input);
        return row;
    }

    private _buildSubLabel(text: string): HTMLElement {
        const el = document.createElement('div');
        el.className   = 'tpr-rnd-sub-label';
        el.textContent = text;
        return el;
    }

    private _buildShortcutBtn(label: string, title: string, onClick: () => void): HTMLElement {
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'tpr-rnd-shortcut-btn';
        btn.title     = title;
        btn.textContent = label;
        btn.addEventListener('click', () => {
            console.log(`[RenderRailPanel] ${label}`);
            onClick();
        });
        return btn;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Engine accessor helpers
    // ─────────────────────────────────────────────────────────────────────────

    private _pp(): any {
        return window.world?.renderer?.postproduction ?? null; // TODO(D.4): legacy world — replace with runtime.scene.world
    }
}
