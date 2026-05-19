/**
 * AnnotationToolbar — Wave 6 Phase C (wave-6-c-d3)
 *
 * 10-button toolbar for BIM annotation and tagging tools.
 * Groups: Tag (5) | Spot (2) | Fill/Cloud (3)
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P6   — Every button dispatches via runtime.bus.executeCommand.
 *   No direct store writes. No window-global casts (P4).
 * • §01-VISION P8   — commandBus maintains OTel span per command.
 * • §02-ARCHITECTURE §3 — toolbar lives in L7.5; migrates to L5/L7 at Phase E.
 * • Command names follow §8 kebab-case contract (<verb>-<noun>).
 *
 * TODO(Phase-E): register as toolbar.discipline contribution in plugins/annotation/contributions.ts
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const ANNOTATION_TOOLBAR_ID = 'annotation-toolbar' as const;

export interface AnnotationToolbarButton {
    readonly commandType: string;
    readonly title:       string;
    readonly icon:        string;
    readonly group:       'tag' | 'spot' | 'fill-cloud';
}

export const ANNOTATION_TOOLBAR_BUTTONS: readonly AnnotationToolbarButton[] = [
    // Tag group (5)
    { commandType: 'tag-all-elements',     title: 'Tag All Elements',       icon: '⊞', group: 'tag'        },
    { commandType: 'tag-by-category',      title: 'Tag by Category',        icon: '⊟', group: 'tag'        },
    { commandType: 'tag-keynote',          title: 'Keynote Tag',            icon: 'K',  group: 'tag'        },
    { commandType: 'tag-leader',           title: 'Leader Tag',             icon: '↙T', group: 'tag'        },
    { commandType: 'tag-multi-leader',     title: 'Multi-Leader Tag',       icon: '↙↙', group: 'tag'       },
    // Spot group (2)
    { commandType: 'spot-elevation',       title: 'Spot Elevation',         icon: '▲', group: 'spot'       },
    { commandType: 'spot-coordinate',      title: 'Spot Coordinate',        icon: '⊕', group: 'spot'       },
    // Fill/Cloud group (3)
    { commandType: 'filled-region-place',  title: 'Place Filled Region',    icon: '▨', group: 'fill-cloud' },
    { commandType: 'revision-cloud-place', title: 'Place Revision Cloud',   icon: '☁', group: 'fill-cloud' },
    { commandType: 'annotation-symbol',    title: 'Place Annotation Symbol',icon: '⊛', group: 'fill-cloud' },
] as const;

const AT_STYLES = `
.at-toolbar {
    display:inline-flex; align-items:center; gap:2px;
    padding:4px 6px; background:var(--app-toolbar-bg,#f5f5f5);
    border:1px solid rgba(0,0,0,0.12); border-radius:8px;
    font-family:var(--app-font,'Inter',sans-serif);
}
.at-btn {
    display:inline-flex; align-items:center; justify-content:center;
    width:32px; height:32px; border:none; border-radius:6px;
    background:transparent; cursor:pointer; font-size:14px;
    color:var(--app-text,#333); transition:background 0.12s;
}
.at-btn:hover { background:rgba(0,0,0,0.08); }
.at-btn:active { background:rgba(0,0,0,0.14); }
.at-separator { width:1px; height:22px; background:rgba(0,0,0,0.15); margin:0 3px; flex-shrink:0; }
`;

export class AnnotationToolbar {
    readonly element: HTMLElement;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this.element  = this._build();
    }

    /** Programmatic command trigger — used by tests and keyboard shortcuts. */
    triggerCommand(commandType: string, payload: Record<string, unknown> = {}): void {
        if (!this._runtime) {
            console.warn(`[AnnotationToolbar] triggerCommand(${commandType}) — no runtime`);
            return;
        }
        this._runtime.bus.executeCommand(commandType, payload);
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = AT_STYLES;

        const toolbar = document.createElement('div');
        toolbar.className = 'at-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Annotation Tools');
        toolbar.setAttribute('id', ANNOTATION_TOOLBAR_ID);

        let lastGroup: string | null = null;
        for (const btn of ANNOTATION_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && lastGroup !== btn.group) {
                const sep = document.createElement('div');
                sep.className = 'at-separator';
                toolbar.append(sep);
            }
            lastGroup = btn.group;
            toolbar.append(this._makeButton(btn));
        }

        toolbar.prepend(styleTag);
        return toolbar;
    }

    private _makeButton(def: AnnotationToolbarButton): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className       = 'at-btn';
        btn.textContent     = def.icon;
        btn.title           = def.title;
        btn.setAttribute('aria-label', def.title);
        btn.setAttribute('data-command', def.commandType);
        btn.addEventListener('click', () => {
            if (!this._runtime) {
                console.warn(`[AnnotationToolbar] ${def.commandType} clicked — no runtime attached`);
                return;
            }
            this._runtime.bus.executeCommand(def.commandType, {});
        });
        return btn;
    }
}
