/**
 * LevelManagerPanel — full CRUD panel for BIM levels.
 *
 * §05 §7.8  No bim-* elements — all native HTML.
 * §05 §4    Registered CSS prefix: lm-  (see AppTheme.ts LEVEL_MANAGER_STYLES).
 * §01 §2.1  All mutations go through commands only.
 * §02 §1.1  Elevation authority: BimManager.getLevelById().elevation.
 *
 * Replaces the 80 px sidebar level section and the bim-dropdown in Layout.ts.
 *
 * Per-level row:
 *   [color-swatch] [name input] [height tag] [elevation input] [visibility toggle] [delete]
 *
 * "Add Level" computes smart elevation: maxElevation + prevFloorToFloor.
 *
 * Colours: PRYZM violet palette — start at lightest, step towards deep magenta.
 */

import { BimManager, Level } from '@pryzm/core-app-model';
import { AddLevelCommand } from '@pryzm/command-registry';
import { UpdateLevelCommand } from '@pryzm/command-registry';
import { DeleteLevelCommand } from '@pryzm/command-registry';

interface LevelManagerPanelProps {
    bimManager: BimManager;
    projectContext: {
        activeLevelId: string;
        subscribe: (cb: (event: string) => void) => (() => void);
    };
    getCommandManager: () => { execute: (cmd: any) => any } | null;
    mountTarget: HTMLElement;
}

// PRYZM brand palette — lightest violet → deep magenta-violet
const LEVEL_PALETTE = [
    '#A78BFA', // violet-400
    '#9061F7', // violet-450
    '#7C3AED', // violet-600
    '#6D28D9', // violet-700
    '#6600FF', // brand deep-violet
    '#7300E5', // violet-purple
    '#8500CC', // purple
    '#9200B2', // purple-magenta
    '#A00099', // magenta
    '#B00088', // deep-magenta
    '#BB007A', // magenta-pink
    '#CC006B', // dark-rose
];

export class LevelManagerPanel {
    private readonly root: HTMLDivElement;
    private unsubscribeContext: (() => void) | null = null;
    private unsubscribeBim: (() => void) | null = null;
    private readonly props: LevelManagerPanelProps;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(props: LevelManagerPanelProps, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.props = props;
        this.root = document.createElement('div');
        this.root.className = 'lm-panel';
        props.mountTarget.appendChild(this.root);
        this._render();
        this._subscribe();
    }

    // ── Public API ─────────────────────────────────────────────────────────

    dispose(): void {
        this.unsubscribeContext?.();
        this.unsubscribeBim?.();
        this.root.remove();
    }

    // ── Private ────────────────────────────────────────────────────────────

    private _render(): void {
        const activeId = this.props.projectContext.activeLevelId;
        const levels   = this._sortedLevels();
        this.root.innerHTML = '';

        const listEl = document.createElement('div');
        listEl.className = 'lm-list';

        if (levels.length === 0) {
            const empty = document.createElement('div');
            empty.className   = 'lm-empty';
            empty.textContent = 'No levels — click Add Level to begin.';
            listEl.appendChild(empty);
        } else {
            levels.forEach((level, idx) => {
                listEl.appendChild(this._buildRow(level, level.id === activeId, levels.length, idx));
            });
        }

        const addBtn = document.createElement('button');
        addBtn.className   = 'lm-add-btn';
        addBtn.textContent = '+ Add Level';
        addBtn.addEventListener('click', () => this._addLevel(levels));

        this.root.appendChild(listEl);
        this.root.appendChild(addBtn);
    }

    private _buildRow(level: Level, isActive: boolean, totalLevels: number, paletteIdx: number): HTMLElement {
        const color = level.color ?? this._paletteColor(paletteIdx);

        const row = document.createElement('div');
        row.className = 'lm-row' + (isActive ? ' lm-row--active' : '');
        row.title = 'Click to set as active level';
        row.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.lm-delete-btn, .lm-vis-btn, .lm-name-input, .lm-elev-input')) return;
            this.props.projectContext.activeLevelId = level.id;
        });

        // Color swatch
        const swatch = document.createElement('div');
        swatch.className      = 'lm-swatch';
        swatch.style.background = color;
        swatch.title          = color;

        // Name input
        const nameInput = document.createElement('input');
        nameInput.type      = 'text';
        nameInput.className = 'lm-name-input';
        nameInput.value     = level.name;
        nameInput.title     = 'Level name (press Enter or blur to save)';
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')   nameInput.blur();
            if (e.key === 'Escape') { nameInput.value = level.name; nameInput.blur(); }
        });
        nameInput.addEventListener('blur', () => {
            const newName = nameInput.value.trim();
            if (newName && newName !== level.name) {
                this._execute(new UpdateLevelCommand({ levelId: level.id, updates: { name: newName } }));
            }
        });

        // Height tag (floor-to-floor)
        const heightVal = level.height ?? 3.0;
        const heightTag = document.createElement('span');
        heightTag.className   = 'lm-height-tag';
        heightTag.textContent = `${heightVal.toFixed(1)}m`;
        heightTag.title       = 'Floor-to-floor height';

        // Elevation input
        const elevInput = document.createElement('input');
        elevInput.type      = 'number';
        elevInput.className = 'lm-elev-input';
        elevInput.value     = level.elevation.toFixed(3);
        elevInput.step      = '0.1';
        elevInput.title     = 'Elevation (m above datum)';
        elevInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')   elevInput.blur();
            if (e.key === 'Escape') { elevInput.value = level.elevation.toFixed(3); elevInput.blur(); }
        });
        elevInput.addEventListener('blur', () => {
            const newElev = parseFloat(elevInput.value);
            if (isFinite(newElev) && newElev !== level.elevation) {
                this._execute(new UpdateLevelCommand({ levelId: level.id, updates: { elevation: newElev } }));
            }
        });

        // Visibility toggle
        const visBtn = document.createElement('button');
        visBtn.className   = 'lm-vis-btn' + (level.isVisible ? '' : ' lm-vis-btn--hidden');
        visBtn.textContent = level.isVisible ? '👁' : '⊘';
        visBtn.title       = level.isVisible ? 'Hide level plane' : 'Show level plane';
        visBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._execute(new UpdateLevelCommand({ levelId: level.id, updates: { isVisible: !level.isVisible } }));
        });

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'lm-delete-btn';
        delBtn.textContent = '✕';
        delBtn.title    = totalLevels <= 1 ? 'Cannot delete last level' : `Delete level "${level.name}"`;
        delBtn.disabled = totalLevels <= 1;
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (totalLevels <= 1) return;
            const childCount = level.childrenIds?.length ?? 0;
            if (childCount > 0) {
                alert(`Cannot delete "${level.name}" — it contains ${childCount} element(s). Move or delete those first.`);
                return;
            }
            this._execute(new DeleteLevelCommand({ levelId: level.id }));
        });

        // Left accent bar matching swatch colour
        const accent = document.createElement('div');
        accent.className        = 'lm-accent-bar';
        accent.style.background = color;

        row.appendChild(accent);
        row.appendChild(swatch);
        row.appendChild(nameInput);
        row.appendChild(heightTag);
        row.appendChild(elevInput);
        row.appendChild(visBtn);
        row.appendChild(delBtn);

        return row;
    }

    private _addLevel(existing: Level[]): void {
        const maxLevel    = existing.reduce<Level | null>((max, l) => (!max || l.elevation > max.elevation) ? l : max, null);
        const prevHeight  = maxLevel?.height ?? 3.0;
        const newElevation = maxLevel ? maxLevel.elevation + prevHeight : 0.0;
        const count       = existing.length;
        const cmd = new AddLevelCommand({
            levelId:   `L${count}-${Date.now()}`,
            name:      `Level ${count}`,
            elevation: newElevation,
            height:    prevHeight,
        });
        this._execute(cmd);
    }

    private _execute(cmd: any): void {
        const mgr = this.props.getCommandManager();
        if (mgr) {
            mgr.execute(cmd);
        } else {
            console.error('[LevelManagerPanel] CommandManager not found');
        }
    }

    private _sortedLevels(): Level[] {
        return this.props.bimManager.getLevels()
            .slice()
            .sort((a, b) => a.elevation - b.elevation);
    }

    private _paletteColor(index: number): string {
        return LEVEL_PALETTE[index % LEVEL_PALETTE.length];
    }

    private _subscribe(): void {
        this.unsubscribeContext = this.props.projectContext.subscribe((event: string) => {
            if (event === 'activeLevelChanged') this._render();
        });

        this.unsubscribeBim = this.props.bimManager.subscribe((type) => {
            if (type === 'levelAdded' || type === 'levelUpdated' || type === 'levelRemoved') {
                this._render();
            }
        });
    }
}
