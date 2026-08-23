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
 *   [color-swatch] [name input] [height input] [elevation input] [visibility toggle] [delete]
 *
 * ⚠ THE THIRD CELL WAS A READ-ONLY TAG UNTIL 2026-08-23 (L-7201). It is now an
 * input, and the two numeric cells mean DIFFERENT things and dispatch DIFFERENT
 * commands — do not merge them:
 *
 *   · HEIGHT    — floor-to-floor, i.e. the GAP to the level above. Editing it
 *                 translates every level ABOVE by the delta, with their
 *                 contents. → `SetLevelHeightCommand` (ADR-0345).
 *   · ELEVATION — where this level sits above datum. Editing it moves THIS
 *                 level only. → `UpdateLevelCommand({ elevation })`.
 *
 * Clicking the row (outside any control) sets the active level AND announces
 * `pryzm-level-selected`, which opens the standard Property Inspector on the
 * level — the same surface and the same event shape a grid uses. The row grows
 * no properties idiom of its own; a second one is the defect this repo repeats.
 *
 * "Add Level" computes smart elevation: maxElevation + prevFloorToFloor.
 *
 * Colours: PRYZM violet palette — start at lightest, step towards deep magenta.
 */

import { BimManager, Level } from '@pryzm/core-app-model';
import { AddLevelCommand } from '@pryzm/command-registry';
import { UpdateLevelCommand } from '@pryzm/command-registry';
import { DeleteLevelCommand } from '@pryzm/command-registry';
import { SetLevelHeightCommand, MIN_LEVEL_HEIGHT_M } from '@pryzm/command-registry';

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
        row.title = 'Click to select this level and open its properties';
        row.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest(
                '.lm-delete-btn, .lm-vis-btn, .lm-name-input, .lm-elev-input, .lm-height-input',
            )) return;
            this.props.projectContext.activeLevelId = level.id;
            // §LEVEL-PROPERTIES (L-7203) — "select the level, access the level
            // properties". This reuses the SAME surface every other subject
            // uses, via the SAME runtime event shape a grid uses
            // (`pryzm-grid-selected` → `PropertyPanel.showGrid`). A second
            // properties idiom is the defect this repo makes most often, so the
            // row deliberately does not grow an expander of its own.
            this._emitLevelSelected(level);
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

        // ── Height input (floor-to-floor) — L-7201 ───────────────────────────
        // ⭐ This WAS a read-only <span> tag. The founder asked to change Ground
        // from 3.0 to 2.9 and see Level 1 follow, which this row could not
        // express: height was display-only, and even `UpdateLevelCommand
        // ({height})` fires no reconcile, so writing it moved no geometry.
        //
        // Editing height is NOT a property write — it is a rigid translation of
        // every level ABOVE by the delta. That is `SetLevelHeightCommand`, a
        // different command from the elevation input beside it (ADR-0345).
        const heightVal = level.height ?? 3.0;
        const heightInput = document.createElement('input');
        heightInput.type      = 'number';
        heightInput.className = 'lm-height-input';
        heightInput.value     = heightVal.toFixed(2);
        heightInput.step      = '0.1';
        heightInput.min       = String(MIN_LEVEL_HEIGHT_M);
        heightInput.title     =
            'Floor-to-floor height (m). Changing this moves every level ABOVE by the same amount, '
            + 'with their contents. Levels below are unaffected.';
        heightInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter')   heightInput.blur();
            if (e.key === 'Escape') { heightInput.value = heightVal.toFixed(2); heightInput.blur(); }
        });
        heightInput.addEventListener('blur', () => {
            const newHeight = parseFloat(heightInput.value);
            if (!isFinite(newHeight) || Math.abs(newHeight - heightVal) < 1e-6) {
                heightInput.value = heightVal.toFixed(2);
                return;
            }
            const res = this._execute(new SetLevelHeightCommand({ levelId: level.id, height: newHeight }));
            // ⛔ NEVER leave a refused edit showing the refused number — the row
            // would read as if the change had landed. Snap back and say why.
            if (res && res.success === false) {
                heightInput.value = heightVal.toFixed(2);
            }
        });

        const heightUnit = document.createElement('span');
        heightUnit.className   = 'lm-height-unit';
        heightUnit.textContent = 'm';

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
        row.appendChild(heightInput);
        row.appendChild(heightUnit);
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

    /**
     * Dispatch and RETURN the result — §01 §2.1.
     *
     * ⭐ This used to return `void`, which meant a refused command was
     * indistinguishable from a successful one at the call site: the row kept
     * showing the number the user typed even when the command had refused it.
     * A model that displays a value it did not accept is the same class of
     * defect as one that half-moves in silence.
     *
     * Refusals are surfaced HERE, once, so every row control inherits it.
     */
    private _execute(cmd: any): { success: boolean; error?: string; info?: string[] } | null {
        const mgr = this.props.getCommandManager();
        if (!mgr) {
            console.error('[LevelManagerPanel] CommandManager not found');
            return null;
        }
        const res = mgr.execute(cmd) as { success: boolean; error?: string; info?: string[] } | undefined;
        if (!res) return null;

        if (res.success === false) {
            this._announce(res.error ?? 'That change was refused.', 'error');
        } else if (Array.isArray(res.info)) {
            // ADR-0344: a family that did NOT follow is reported at commit time,
            // not left for the user to discover by looking. The command marks
            // that line with the warning glyph; anything else is routine.
            const shortfall = res.info.find((s) => typeof s === 'string' && s.startsWith('⚠'));
            if (shortfall) this._announce(shortfall, 'warn');
        }
        return res;
    }

    /** Toast channel, resolved lazily so the panel stays constructible in tests. */
    private _announce(message: string, kind: 'warn' | 'error'): void {
        try {
            const toast = (this.runtime as unknown as {
                showAppToast?: (m: string, k: 'warn' | 'error') => unknown;
            } | null)?.showAppToast ?? window.showAppToast;
            if (typeof toast === 'function') {
                toast(message, kind);
                return;
            }
        } catch { /* fall through to the console */ }
        // Never swallow: an un-toastable refusal still has to reach a person.
        if (kind === 'error') console.error(`[LevelManagerPanel] ${message}`);
        else console.warn(`[LevelManagerPanel] ${message}`);
    }

    /**
     * §LEVEL-PROPERTIES (L-7203) — announce the selected level on the runtime
     * event bus. `PropertyPanelAdapter` subscribes and calls
     * `PropertyPanel.showLevel(level)`, exactly as it already does for grids.
     */
    private _emitLevelSelected(level: Level): void {
        try {
            const events = (this.runtime?.events ?? window.runtime?.events);
            events?.emit?.('pryzm-level-selected', { levelId: level.id, level, source: 'level-manager-panel' });
        } catch (err) {
            console.error('[LevelManagerPanel] failed to announce level selection', err);
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
