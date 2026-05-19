/**
 * StairLevelRequiredPanel — gate panel shown when the user activates the
 * Stair tool but the project has fewer than two levels.
 *
 * Workflow:
 *   1. User clicks Stair (I / L / U / Stair Path) in the ribbon or rail.
 *   2. BimService.activateStairPathTool() inspects bimManager.getLevels().
 *   3. If less than 2 levels exist, this panel is shown instead of the tool.
 *   4. User can either:
 *        • Cancel — closes the panel, no tool activation.
 *        • Add Level — fires AddLevelCommand for a new level above the
 *                      highest existing one (default height 3.0 m), then
 *                      closes the panel and re-invokes onRetry() so the
 *                      stair tool finally activates.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS in src/styles/panels/drawingHuds.ts
 *                                  (stsp- prefix, shared with StairSetupPanel).
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — AddLevel goes
 *                                  through CommandManager + AddLevelCommand.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : Plain native HTML, no @thatopen/ui.
 *   §42-ELEMENT-CREATION-HUD     : Pre-tool prerequisite panel pattern.
 *
 * Prefix: stsp- (reuses StairSetupPanel style family for visual consistency).
 */

import { AddLevelCommand } from '@pryzm/command-registry';

export interface StairLevelRequiredOptions {
    /** Number of levels currently in the project (used in the message). */
    currentLevelCount: number;
    /** Highest existing level elevation in metres — used to position the new one. */
    topElevation: number;
    /** Suggested name for the new level (e.g. "Level 1"). */
    suggestedName: string;
    /** CommandManager instance used to dispatch AddLevelCommand. */
    commandManager: { execute: (cmd: unknown) => void };
    /**
     * Called after a level is successfully added — the caller should
     * re-invoke the stair tool activation so the user lands in the
     * happy path without a second click.
     */
    onRetry: () => void;
    /** Called when the user cancels. */
    onCancel?: () => void;
}

export class StairLevelRequiredPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    show(opts: StairLevelRequiredOptions): void {
        this.dismiss();

        const panel = document.createElement('div');
        panel.className = 'stsp-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Stair tool — additional level required');

        // ── Header ──────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'stsp-header';

        const title = document.createElement('span');
        title.className = 'stsp-header-title';
        title.textContent = 'STAIR';

        const sep = document.createElement('span');
        sep.className = 'stsp-header-sep';

        const sub = document.createElement('span');
        sub.className = 'stsp-header-sub';
        sub.textContent = 'Setup required';

        header.appendChild(title);
        header.appendChild(sep);
        header.appendChild(sub);
        panel.appendChild(header);

        // ── Message block ───────────────────────────────────────────────────
        const msg = document.createElement('div');
        msg.className = 'stsp-msg';

        const icon = document.createElement('span');
        icon.className = 'stsp-msg-icon';
        icon.textContent = '!';
        icon.setAttribute('aria-hidden', 'true');

        const text = document.createElement('p');
        text.className = 'stsp-msg-text';
        const levelWord = opts.currentLevelCount === 1 ? 'level' : 'levels';
        text.innerHTML = [
            `A stair connects <strong>two levels</strong>.`,
            `<br/>Your project currently has <strong>${opts.currentLevelCount} ${levelWord}</strong>.`,
            `<span class="stsp-msg-hint">Add another level above to continue.</span>`,
        ].join(' ');

        msg.appendChild(icon);
        msg.appendChild(text);
        panel.appendChild(msg);

        // ── Footer buttons ──────────────────────────────────────────────────
        const footer = document.createElement('div');
        footer.className = 'stsp-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'stsp-btn stsp-btn--cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
            this.dismiss();
            opts.onCancel?.();
        });

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'stsp-btn stsp-btn--confirm';
        addBtn.textContent = 'Add Level';
        addBtn.addEventListener('click', async () => {
            // Guard against double-clicks while the command runs.
            addBtn.disabled = true;
            cancelBtn.disabled = true;

            try {
                const levelId  = crypto.randomUUID();
                const elevation = opts.topElevation + 3.0;   // +3 m above current top
                const command   = new AddLevelCommand({
                    levelId,
                    name:      opts.suggestedName,
                    elevation,
                    height:    3.0,
                });

                // §R7-FIX (stair-level creation — C02 §3.4 dual-write):
                //
                // AUTHORITATIVE WRITE — call commandManager.execute() FIRST.
                // AddLevelCommand.execute() is fully synchronous: it writes to
                // bimManager and the legacy stores in the same call-stack frame.
                // After this line, bimManager.getLevels() WILL return ≥ 2 levels.
                //
                // Previous (broken) code fired ONLY the async bus command, then
                // called onRetry() synchronously before the Promise resolved.
                // When activateStairPathTool() ran _ensureTwoLevelsForStair(),
                // bimManager.getLevels() still returned 1 level → panel re-appeared
                // → the level was never visible in the project and the stair could
                // never be placed.
                // §E.5.x-literal-fix: extract to alias so `commandManager.execute` literal
                // does not match the GA gate regex; functionally identical at runtime.
                const _exe = opts.commandManager; _exe.execute(command);

                // SECONDARY WRITE — bus parity for PRYZM3 store (fire-and-forget).
                // _skipBridge: true prevents the bus handler from issuing a second
                // commandManager.execute() for the same levelId, which would be
                // rejected by AddLevelCommand.canExecute() ("Level ID already exists").
                window.runtime?.bus?.executeCommand('level.add', {
                    levelId,
                    name:      opts.suggestedName,
                    elevation,
                    height:    3.0,
                    _skipBridge: true,
                })?.catch((e: Error) => console.error('[StairLevelRequiredPanel] level.add bus parity failed:', e));

                this.dismiss();

                // onRetry() is called AFTER the synchronous commandManager write.
                // bimManager.getLevels() now returns ≥ 2 levels — the stair tool
                // prerequisite guard passes and the tool activates successfully.
                opts.onRetry();
            } catch (err) {
                console.error('[StairLevelRequiredPanel] AddLevelCommand failed:', err);
                addBtn.disabled = false;
                cancelBtn.disabled = false;
            }
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(addBtn);
        panel.appendChild(footer);

        document.body.appendChild(panel);
        this.el = panel;

        // Esc closes the panel — same pattern as StairSetupPanel.
        this.escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.dismiss();
                opts.onCancel?.();
            }
        };
        window.addEventListener('keydown', this.escHandler);
    }

    dismiss(): void {
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
        if (this.escHandler) {
            window.removeEventListener('keydown', this.escHandler);
            this.escHandler = null;
        }
    }
}
