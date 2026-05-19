/**
 * CreateRailPanelLighting.ts
 *
 * Lighting fixture picker panel for the CreateRailPanel — extracted to keep
 * CreateRailPanel.ts under the 1,200 LOC limit (WS-B S85-WIRE).
 *
 * Design rules:
 *  - Pure DOM factory — no class state, no store writes.
 */

import type { LightingFixtureType } from '@pryzm/core-app-model';
import * as PryzmIcons from '../../icons/PryzmIcons';

/**
 * Build and return the lighting fixture picker panel HTMLElement.
 * Extracted from CreateRailPanel._buildLightingPanel (no class state used).
 */
export function buildLightingPanel(): HTMLElement {
    const root = document.createElement('div');
    root.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px;
        overflow-y: auto;
    `;

    type FixtureDef = {
        type: LightingFixtureType;
        label: string;
        description: string;
        icon: string;
    };

    type FixtureGroup = {
        heading: string;
        hint: string;
        items: FixtureDef[];
    };

    const groups: FixtureGroup[] = [
        {
            heading: 'Hanging (Ceiling)',
            hint: 'Place on ceiling / slab underside',
            items: [
                {
                    type:        'pendant_pebble',
                    label:       'Pebble Pendant',
                    description: 'Wide flat disc shade — cream/beige',
                    icon:        'material-symbols:light',
                },
                {
                    type:        'pendant_ceramic_bell',
                    label:       'Ceramic Bell Pendant',
                    description: 'Dark-red glazed ceramic bell, exposed bulb',
                    icon:        'material-symbols:pendant-lamp',
                },
                {
                    type:        'pendant_conical',
                    label:       'Conical Pendant',
                    description: 'Wide UFO brim shade — cream/beige',
                    icon:        'material-symbols:light',
                },
                {
                    type:        'downlight',
                    label:       'Surface Downlight',
                    description: 'Cylindrical canister, flush ceiling mount',
                    icon:        'material-symbols:light-group',
                },
                {
                    type:        'pendant',
                    label:       'Cylinder Pendant',
                    description: 'Slim cylinder, cable suspension',
                    icon:        'material-symbols:light',
                },
                {
                    type:        'linear_led',
                    label:       'Linear LED',
                    description: 'Rectangular bar with LED strip',
                    icon:        'material-symbols:fluorescent',
                },
            ],
        },
        {
            heading: 'Floor Lamps',
            hint: 'Place on floor surface',
            items: [
                {
                    type:        'floor_wood_post',
                    label:       'Wood Post Floor Lamp',
                    description: 'Cross-base oak post, white drum shade',
                    icon:        'material-symbols:floor-lamp',
                },
                {
                    type:        'floor_arc_brass',
                    label:       'Arc Brass Floor Lamp',
                    description: 'Brass arc rod, marble disc base, dome shade',
                    icon:        'material-symbols:floor-lamp',
                },
                {
                    type:        'floor_tripod_black',
                    label:       'Tripod Floor Lamp',
                    description: 'Black tripod legs, large drum shade',
                    icon:        'material-symbols:floor-lamp',
                },
            ],
        },
        {
            heading: 'Table Lamps',
            hint: 'Place on table or bedside surface',
            items: [
                {
                    type:        'table_terracotta',
                    label:       'Terracotta Table Lamp',
                    description: 'Terracotta column body, cream cone shade',
                    icon:        'material-symbols:table-lamp',
                },
            ],
        },
    ];

    const cardStyle = `
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        border-radius: 8px;
        border: 1px solid var(--app-border, #e0e0e0);
        background: var(--app-surface, #f8f8f8);
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition: border-color 0.12s, background 0.12s;
        box-sizing: border-box;
    `;

    const iconBoxStyle = `
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: var(--app-accent-bg, #f0ebff);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--app-accent, #6600ff);
    `;

    for (const group of groups) {
        // Group heading
        const groupHead = document.createElement('div');
        groupHead.style.cssText = `
            font-size: 9px;
            font-weight: 700;
            color: var(--app-text-muted, #999);
            text-transform: uppercase;
            letter-spacing: 0.07em;
            padding: 8px 2px 3px 2px;
        `;
        groupHead.textContent = group.heading;
        root.appendChild(groupHead);

        for (const def of group.items) {
            const card = document.createElement('button');
            card.type = 'button';
            card.style.cssText = cardStyle;

            card.addEventListener('mouseenter', () => {
                card.style.borderColor = 'var(--app-accent, #6600ff)';
                card.style.background  = 'var(--app-accent-bg, #f0ebff)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.borderColor = 'var(--app-border, #e0e0e0)';
                card.style.background  = 'var(--app-surface, #f8f8f8)';
            });

            const iconWrap = document.createElement('div');
            iconWrap.style.cssText = iconBoxStyle;
            iconWrap.innerHTML = PryzmIcons.iconFromName(def.icon, 20);
            card.appendChild(iconWrap);

            const textWrap = document.createElement('div');
            textWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';

            const labelEl = document.createElement('div');
            labelEl.style.cssText = 'font-size:11px;font-weight:600;color:var(--app-text,#1a1a1a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            labelEl.textContent = def.label;

            const descEl = document.createElement('div');
            descEl.style.cssText = 'font-size:9px;color:var(--app-text-muted,#888);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            descEl.textContent = def.description;

            textWrap.appendChild(labelEl);
            textWrap.appendChild(descEl);
            card.appendChild(textWrap);

            card.addEventListener('click', () => {
                const lt = window.lightingTool; // TODO(E.lighting.T): legacy lightingTool — replace with runtime.tools.activate('lighting', mode)
                if (!lt) {
                    console.warn('[CreateRailPanel] lightingTool not ready');
                    return;
                }
                if (typeof lt.setFixtureType === 'function') lt.setFixtureType(def.type);
                // Mirror to plan-view tool handler (LightingPlanToolHandler reads this flag)
                window._pryzmActiveLightingType = def.type; // TODO(E.lighting.X): legacy _pryzmActiveLightingType — replace with runtime.tools.lighting active-fixture state
                if (typeof lt.activate === 'function') lt.activate();
            });

            root.appendChild(card);
        }
    }

    // Night mode hint
    const hint = document.createElement('div');
    hint.style.cssText = `
        font-size: 9px;
        color: var(--app-text-muted, #aaa);
        padding: 6px 2px 0 2px;
        border-top: 1px solid var(--app-border, #eee);
        margin-top: 6px;
    `;
    hint.innerHTML = `💡 Activate <strong>Night Mode</strong> (bottom bar) to see light emission.`;
    root.appendChild(hint);

    return root;
}
