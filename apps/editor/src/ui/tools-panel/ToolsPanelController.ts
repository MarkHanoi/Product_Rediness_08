/**
 * ToolsPanelController — orchestrator for the right-hand Tools rail panel system.
 *
 * Replaces the inline accordion toggle logic inside Layout.ts.
 * Builds the tp-panel DOM, registers each section button, and delegates
 * section content to individual rail panel classes (CreateRailPanel, etc.).
 *
 * The panel stays at 52px wide at all times — sections no longer expand it.
 * Instead, each section button opens/closes a floating tpr-panel to the LEFT.
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* / @thatopen/ui elements; pure native HTML (buttons only)
 *   §05 §7.6 — No independent <style> injection; styles live in AppTheme.ts
 *   §01      — Read-only; no direct store mutations
 *
 * CSS prefixes used:
 *   tp-   Tools Panel (existing — outer rail, header, section buttons)
 *   tpr-  Tools Panel Rail (new — floating panel to the left, see ToolsRailController)
 */

import { ToolsRailController }    from './ToolsRailController';
import { CreateRailPanel }         from './panels/CreateRailPanel';
import { AnnotationRailPanel }     from './panels/AnnotationRailPanel';
import { GridsLevelsRailPanel }    from './panels/GridsLevelsRailPanel';
import type { ToolsPanelProps, ToolsSectionId } from './ToolsPanelTypes';
import * as PryzmIcons             from '../icons/PryzmIcons';

interface SectionDef {
    id:      ToolsSectionId;
    label:   string;
    icon:    string;
    svgIcon?: string;
    build:   () => HTMLElement;
}

export class ToolsPanelController {
    private readonly _rail: ToolsRailController;
    private readonly _el:   HTMLElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private readonly _props: ToolsPanelProps, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._rail = new ToolsRailController();

        const createPanel       = new CreateRailPanel(this._props, this._rail);
        const annotationPanel   = new AnnotationRailPanel(this._props, this._rail);
        const gridsLevelsPanel  = new GridsLevelsRailPanel(this._props, this._rail);

        // Levels & Grids management (browser/list) lives on the LEFT rail
        // (project-structure side). The right-side GRIDS_LEVELS section below
        // surfaces the *creation* affordances (Grid in plan view, Level in
        // section/elevation) — mirroring the in-canvas "+ Grid"/"+ Level"
        // overlay button rendered by PlanViewToolOverlay.

        const sections: SectionDef[] = [
            {
                id:      'CREATE_ARCH',
                label:   'Architecture',
                icon:    '',
                svgIcon: PryzmIcons.pryzmArchitecture,
                build:   () => { createPanel.setActiveDiscipline('architecture'); return createPanel.build(); },
            },
            {
                id:      'CREATE_STRUCT',
                label:   'Structure',
                icon:    '',
                svgIcon: PryzmIcons.pryzmStructure,
                build:   () => { createPanel.setActiveDiscipline('structure'); return createPanel.build(); },
            },
            {
                id:      'CREATE_INTERIORS',
                label:   'Interiors',
                icon:    '',
                svgIcon: PryzmIcons.pryzmInteriors,
                build:   () => { createPanel.setActiveDiscipline('interiors'); return createPanel.build(); },
            },
            {
                id:      'CREATE_LANDSCAPE',
                label:   'Landscape',
                icon:    '',
                svgIcon: PryzmIcons.pryzmLandscape,
                build:   () => { createPanel.setActiveDiscipline('landscape'); return createPanel.build(); },
            },
            {
                id:      'CREATE_SERVICES',
                label:   'Services',
                icon:    '',
                svgIcon: PryzmIcons.pryzmServices,
                build:   () => { createPanel.setActiveDiscipline('services'); return createPanel.build(); },
            },
            {
                id:      'GRIDS_LEVELS',
                label:   'Grids & Levels',
                icon:    '',
                svgIcon: PryzmIcons.pryzmGridsLevels,
                build:   () => gridsLevelsPanel.build(),
            },
            {
                id:    'ANNOTATION',
                label: 'Annotation',
                icon:  '/icons/right/Annotate.svg',
                build: () => annotationPanel.build(),
            },
        ];

        this._el = this._buildPanel(sections);
    }

    /** Returns the mounted tp-panel element to be inserted into the layout. */
    get element(): HTMLElement {
        return this._el;
    }

    private _buildPanel(sections: SectionDef[]): HTMLElement {
        const panel = document.createElement('div');
        panel.className = 'tp-panel';

        const header = document.createElement('div');
        header.className = 'tp-header';

        const headerIcon = document.createElement('span');
        headerIcon.className = 'tp-header-icon';
        headerIcon.textContent = '⚙';

        const headerLabel = document.createElement('span');
        headerLabel.className = 'tp-header-label';
        headerLabel.textContent = 'Tools';

        header.appendChild(headerIcon);
        header.appendChild(headerLabel);
        panel.appendChild(header);

        for (const section of sections) {
            panel.appendChild(this._buildSection(section));
        }

        return panel;
    }

    private _buildSection(section: SectionDef): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'tp-section';

        const btn = document.createElement('button');
        btn.className = 'tp-section-btn';
        btn.title = section.label;
        btn.type  = 'button';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'tp-section-icon';

        if (section.svgIcon) {
            iconSpan.innerHTML = PryzmIcons.sized(section.svgIcon, 28);
        } else {
            const img = document.createElement('img');
            img.src = section.icon;
            img.style.cssText = 'width:28px;height:28px;object-fit:contain;';
            img.alt = section.label;
            iconSpan.appendChild(img);
        }

        const labelSpan = document.createElement('span');
        labelSpan.className = 'tp-section-label';
        labelSpan.textContent = section.label;

        btn.appendChild(iconSpan);
        btn.appendChild(labelSpan);

        btn.addEventListener('click', () => {
            this._rail.toggle(section.id, section.label, section.build, btn);
        });

        wrapper.appendChild(btn);
        return wrapper;
    }
}
