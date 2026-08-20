/**
 * StairLevelSpanWidget — §STAIR-LEVEL-SPAN-CHANGE (L-1533)
 * ---------------------------------------------------------------------------
 * FOUNDER (item 0.2): "Be able to change stair Base level + top level."
 *
 * `baseLevelId` and `topLevelId` were READONLY rows in
 * `PropertyDescriptorGenerator` (`READONLY('Base Level','spatial')` /
 * `READONLY('Top Level','spatial')`), so the two ends of a stair's span could be
 * SEEN and never CHANGED. This is the control that changes them.
 *
 * ── WHY IT IS A PICKER AND NOT A TEXT BOX ────────────────────────────────────
 *
 * A level id names an entry in an enumerated table the project owns. A free-text
 * box would happily store an id that matches no level — which is exactly the
 * defect §FIX-STAIR-TYPEID-TWO-CONTROLS removed from `typeId` in this same panel.
 * Both controls are `<select>`s over `wallStore.getLevels()`, the SAME table
 * `UpdateStairParametersCommand` validates against, so the panel cannot offer an
 * id the command will reject as unknown.
 *
 * ── P6: THE MUTATION GOES THROUGH THE BUS ────────────────────────────────────
 *
 * Apply dispatches `stair.updateParameters` →
 * `plugins/stair/handlers/UpdateStairParameters` → `UpdateStairParametersCommand`.
 * No store write happens here. That command re-solves the whole stair (rise,
 * riser height, riser count, per-flight distribution), moves the auto-openings
 * to the new decks and closes the ones the stair left, all in ONE undo unit.
 *
 * ⛔ NOT `element.updateParameters`. The generic route
 * (`UpdateElementParameterCommand`) writes raw fields and consults NO stair rule:
 * it would store a new `topLevelId` while leaving `riserHeight × riserCount` at
 * the OLD rise, producing a stair that fails its own validator and renders at the
 * wrong height. Same user intent, two commands, two outcomes — the split
 * §FIX-STAIR-TYPEID-TWO-CONTROLS documents.
 *
 * ── ⭐ THE PRE-FLIGHT VERDICT IS THE COMMAND'S OWN `canExecute`, NOT A COPY ───
 *
 * The panel must be able to grey out an unbuildable pair and say why. It does NOT
 * re-implement the rules to do it: it constructs the very command Apply would
 * dispatch and asks `canExecute(window.commandContext)` — the live
 * `CommandContext`, carrying the same `stairStore`, `wallStore` and
 * **`stairTypeStore`** the dispatched command will bind.
 *
 * That last store is load-bearing (§L-1437). TWO of the five built-in stair types
 * (`timber-closed`, `residential-timber`) are LOOSER than `STAIR_CONSTRAINTS`. A
 * panel that validated against the DEFAULTS would refuse spans the model permits —
 * a false refusal in the voice of a validator, which this repo has recorded as
 * worse than no check at all (§STAIR-ONE-LIMIT-AUTHORITY, L-1430: the tool
 * refused a 218 mm tread while the command refused below 250 mm). Asking the
 * command's own gate with the command's own context is the only formulation that
 * cannot drift.
 *
 * When `window.commandContext` is absent (early boot, headless), the widget does
 * NOT fall back to a weaker local check — it renders enabled and lets the
 * dispatch be the authority. Guessing tighter would mint exactly the false
 * refusals the paragraph above forbids.
 *
 * ── AND THE OUTCOME IS READ BACK, NOT ASSUMED ────────────────────────────────
 *
 * `UpdateStairParametersHandler.execute` swallows the command's `CommandResult`
 * and returns `{forward:[],inverse:[]}`, so `bus.executeCommand(...)` RESOLVES
 * even when the command refused (a C16 §5.1 CA-18 breach in `plugins/stair/`,
 * reported, not patched from here). A resolved promise is therefore NOT evidence
 * the stair changed. After dispatch the widget re-reads `stairStore` and compares
 * the two ids to what it asked for — "committed" and "refused" must never be the
 * same value to the user (§CONTEXT-DATA-HONESTY).
 *
 * Contract compliance: C03 (state via commands), C16 (authoring + honest
 * refusal), C84/C98 (element integrity), P6 (no store writes in UI).
 */

import { UpdateStairParametersCommand } from '@pryzm/command-registry';

interface LevelRow { id: string; name?: string; elevation: number }

/** Ask the level table the command validates against — never a second source. */
function readLevels(): LevelRow[] {
    const ws = window.wallStore as { getLevels?(): LevelRow[] } | undefined;
    let levels: LevelRow[] = [];
    try { levels = ws?.getLevels?.() ?? []; } catch { levels = []; }
    return [...levels].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
}

function readStair(stairId: string): { baseLevelId?: string; topLevelId?: string } | null {
    const ss = window.stairStore as { getById?(id: string): unknown; get?(id: string): unknown } | undefined;
    try {
        return (ss?.getById?.(stairId) ?? ss?.get?.(stairId) ?? null) as never;
    } catch { return null; }
}

function levelLabel(l: LevelRow): string {
    const name = l.name && l.name.length > 0 ? l.name : l.id;
    return `${name} (${Number(l.elevation ?? 0).toFixed(2)} m)`;
}

/**
 * The command's OWN verdict for a candidate pair. `null` = no opinion available
 * (no live CommandContext) — which is NOT the same as "allowed", and the caller
 * treats it as "do not pre-refuse" rather than as a pass.
 */
export function stairLevelSpanVerdict(
    stairId: string,
    baseLevelId: string,
    topLevelId: string,
): { ok: boolean; reason?: string } | null {
    const ctx = window.commandContext;
    if (!ctx || !ctx.stores) return null;
    try {
        const cmd = new UpdateStairParametersCommand({
            stairId,
            updates: { baseLevelId, topLevelId },
        });
        const v = cmd.canExecute(ctx);
        return { ok: v.ok === true, reason: v.ok ? undefined : (v.blockingIssues?.[0] ?? v.reason) };
    } catch (err) {
        console.warn('[StairLevelSpanWidget] pre-flight canExecute threw — leaving Apply enabled:', err);
        return null;
    }
}

/**
 * Build the Base/Top level pickers for a stair. Returns `null` for any other
 * element type, or when the project has fewer than two levels (a stair cannot
 * span one level, and offering a control that can only refuse is the dead-control
 * shape §FIX-STAIR-PANEL-MISSING-ROWS removed from this panel).
 */
export function buildStairLevelSpanSection(
    elementData: Record<string, unknown>,
): HTMLElement | null {
    const elType = String(elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'stair' && elType !== 'stairs') return null;

    const stairId = String(elementData.id ?? '');
    if (!stairId) return null;

    const levels = readLevels();
    const outer = document.createElement('div');
    outer.className = 'stairts-outer';
    outer.setAttribute('data-testid', 'stair-level-span');

    const heading = document.createElement('div');
    heading.className = 'stairts-label';
    heading.textContent = 'Level Span';
    outer.appendChild(heading);

    if (levels.length < 2) {
        // The honest refusal, in the panel's own voice — not an empty control.
        const note = document.createElement('div');
        note.className = 'stairts-label';
        note.style.cssText = 'opacity:0.75; font-weight:400; text-transform:none;';
        note.textContent = levels.length === 0
            ? 'No levels are loaded, so this stair’s span cannot be changed here.'
            : 'This project has one level. A stair needs a level above its base — add one to change the span.';
        outer.appendChild(note);
        return outer;
    }

    const live = readStair(stairId) ?? {};
    const currentBase = String(live.baseLevelId ?? elementData.baseLevelId ?? '');
    const currentTop  = String(live.topLevelId  ?? elementData.topLevelId  ?? '');

    const mkSelect = (labelText: string, selectedId: string): { row: HTMLElement; sel: HTMLSelectElement } => {
        const row = document.createElement('div');
        row.className = 'stairts-row';
        const lbl = document.createElement('span');
        lbl.className = 'stairts-label';
        lbl.style.cssText = 'flex:0 0 74px; margin:0;';
        lbl.textContent = labelText;
        const sel = document.createElement('select');
        sel.className = 'stairts-select';
        for (const l of levels) {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = levelLabel(l);
            opt.className = 'stairts-opt-dark';
            if (l.id === selectedId) opt.selected = true;
            sel.appendChild(opt);
        }
        row.appendChild(lbl);
        row.appendChild(sel);
        return { row, sel };
    };

    const base = mkSelect('Base', currentBase);
    const top  = mkSelect('Top',  currentTop);
    base.sel.setAttribute('data-testid', 'stair-base-level');
    top.sel.setAttribute('data-testid', 'stair-top-level');
    outer.appendChild(base.row);
    outer.appendChild(top.row);

    const applyRow = document.createElement('div');
    applyRow.className = 'stairts-row';
    const applyBtn = document.createElement('button');
    applyBtn.className = 'stairts-apply-btn';
    applyBtn.textContent = 'Apply';
    applyBtn.setAttribute('data-testid', 'stair-level-span-apply');
    applyRow.appendChild(applyBtn);
    outer.appendChild(applyRow);

    // The verdict line. It carries the command's OWN refusal sentence, which
    // always names what was asked AND the limit (the founder's standing doctrine).
    const verdictEl = document.createElement('div');
    verdictEl.className = 'stairts-label';
    verdictEl.style.cssText = 'font-weight:400; text-transform:none; opacity:0.85; margin-top:4px;';
    verdictEl.setAttribute('data-testid', 'stair-level-span-verdict');
    outer.appendChild(verdictEl);

    const setVerdict = (text: string, bad: boolean): void => {
        verdictEl.textContent = text;
        verdictEl.style.color = bad ? '#ff9d9d' : '';
    };

    const refresh = (): void => {
        const b = base.sel.value;
        const t = top.sel.value;
        if (b === currentBase && t === currentTop) {
            applyBtn.disabled = false;
            setVerdict('', false);
            return;
        }
        const verdict = stairLevelSpanVerdict(stairId, b, t);
        if (verdict === null) {
            // No live context to ask — do NOT invent a tighter local rule.
            applyBtn.disabled = false;
            setVerdict('', false);
            return;
        }
        applyBtn.disabled = !verdict.ok;
        setVerdict(verdict.ok ? '' : (verdict.reason ?? 'This span cannot be built.'), !verdict.ok);
    };

    base.sel.addEventListener('change', refresh);
    top.sel.addEventListener('change', refresh);
    refresh();

    applyBtn.addEventListener('click', () => {
        const b = base.sel.value;
        const t = top.sel.value;
        applyBtn.disabled = true;
        setVerdict('Applying…', false);
        const done = (): void => {
            // ⭐ READ BACK. The handler swallows the CommandResult, so a resolved
            // promise is not evidence the stair changed (see the file header).
            const after = readStair(stairId) ?? {};
            const committed = String(after.baseLevelId ?? '') === b && String(after.topLevelId ?? '') === t;
            if (committed) {
                applyBtn.textContent = '✓ Applied';
                setVerdict('', false);
                setTimeout(() => { applyBtn.textContent = 'Apply'; }, 1800);
            } else {
                const verdict = stairLevelSpanVerdict(stairId, b, t);
                setVerdict(
                    verdict && !verdict.ok
                        ? (verdict.reason ?? 'The stair was not changed.')
                        : 'The stair was not changed — see the console for the command’s reason.',
                    true,
                );
            }
            applyBtn.disabled = false;
        };
        const p = window.runtime?.bus?.executeCommand('stair.updateParameters', {
            stairId,
            updates: { baseLevelId: b, topLevelId: t },
        });
        if (p && typeof p.then === 'function') {
            p.then(done).catch((e: unknown) => {
                console.error('[StairLevelSpanWidget] stair.updateParameters failed:', e);
                done();
            });
        } else {
            done();
        }
    });

    return outer;
}
