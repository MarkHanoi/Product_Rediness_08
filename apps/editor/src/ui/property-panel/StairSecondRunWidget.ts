/**
 * StairSecondRunWidget — §STAIR-SECOND-RUN-DIRECTION (L-10270)
 * ---------------------------------------------------------------------------
 * FOUNDER, verbatim (2026-08-23): "Once a stair in L or U shape is created — we
 * should be able to AFTERWARDS modify, via RAC and via the UI properties panel,
 * the DIRECTION OF THE SECOND RUN."
 *
 * The DEFINITION PROPERTIES sheet listed Width / Riser Height / Tread Depth /
 * Accessibility / Material / Stringer / Nosing / Handrail / Type — and no turn
 * control anywhere. This is that control.
 *
 * ⭐ THE ENGINE ALREADY DID THIS — this is a PUBLICATION, not a feature build.
 * `turnDirection` (L) and `secondRunSide` (U) have been on the record, read by
 * `StairParameterReconciler`, `StairMeshBuilder` and `StairRailingBuilder`, and
 * registered as geometry params by `ElementRebuildRegistry`, for a long time.
 * Nothing new is designed here.
 *
 * ── ⛔ WHY IT IS NOT A `descriptor` ROW, AND NOT BOUND TO THE STAMPED FIELD ───
 *
 * TWO independent reasons, both of which would have made a naive row a LIE:
 *
 *  1. **The stamped field disagrees with the geometry on most stairs.** Four
 *     creation paths write a CONSTANT `'left'` while deriving flight 2 some other
 *     way (`StairPlanToolHandler.ts:209` provably stamps 'left' on a stair whose
 *     flight 2 turns RIGHT). So the widget displays the handedness DERIVED from
 *     the flight directions — the value that agrees with the mesh on screen —
 *     and says so out loud when the stamp contradicts it. See
 *     `StairSecondRunDirection.ts`'s header for the full measurement.
 *  2. **An editable descriptor row commits through the GENERIC
 *     `element.updateParameters` → `UpdateElementParameterCommand`, which writes
 *     the raw field and consults no stair rule.** On a PATH-AUTHORED stair
 *     (every stair the stair-path tool makes) that is a DEAD CONTROL: the flag
 *     flips, `deriveStairGeometry` bails on authored geometry, and
 *     `reconcilePathAuthoredStairLayout` faithfully preserves the OLD drawn
 *     directions — mesh unchanged. This widget dispatches
 *     `stair.updateParameters` → `UpdateStairParametersCommand`, which mirrors
 *     the FLIGHTS AND LANDINGS as well as the flag, in ONE undo unit.
 *
 * Exactly the split `§FIX-STAIR-TYPEID-TWO-CONTROLS` and
 * `§STAIR-LEVEL-SPAN-CHANGE` resolved for `typeId` and the level span in this
 * same panel, resolved the same way: the widget is the control.
 *
 * ── ⭐ THE PRE-FLIGHT VERDICT IS THE ENGINE'S OWN GATE, NOT A COPY ───────────
 *
 * Whether a stair HAS a turnable second run is answered by
 * `stairSecondRunEligibility()` in @pryzm/geometry-stair — the SAME function
 * `UpdateStairParametersCommand.canExecute` calls. The panel therefore cannot
 * offer a flip the command refuses, nor withhold one it would accept.
 *
 * ── AND THE OUTCOME IS READ BACK, NOT ASSUMED (C16 §5.1 CA-21) ───────────────
 *
 * `UpdateStairParametersHandler.execute` swallows the `CommandResult` and returns
 * `{forward:[],inverse:[]}`, so a RESOLVED promise is not evidence the stair
 * changed. After dispatch this re-reads `stairStore` and re-DERIVES the
 * handedness from the stored flight geometry — never from the flag it just
 * asked to be written, and never from the promise.
 *
 * Contract compliance: C03, C16 (authoring + honest refusal), C84/C98, P6.
 */

import {
    stairSecondRunEligibility,
    stairShapeHasSecondRun,
    deriveStairSecondRunHandedness,
    stairSecondRunStampIsStale,
    stairStampedSecondRunHandedness,
    stairSecondRunField,
    type StairRunHandedness,
    type StairData,
} from '@pryzm/geometry-stair';

/** Read the LIVE stair from the store the command writes — never the panel's snapshot. */
function readStair(stairId: string): StairData | null {
    const ss = window.stairStore as { getById?(id: string): unknown; get?(id: string): unknown } | undefined;
    try {
        return (ss?.getById?.(stairId) ?? ss?.get?.(stairId) ?? null) as StairData | null;
    } catch { return null; }
}

const HANDEDNESS_LABEL: Readonly<Record<StairRunHandedness, string>> = { left: 'Left', right: 'Right' };

/** What the control is CALLED for this shape — the question it actually answers. */
function headingFor(shape: string): string {
    return shape === 'U' ? 'Second Run Side' : 'Second Run Turn';
}

function noteEl(text: string, tone: 'plain' | 'warn' = 'plain'): HTMLElement {
    const el = document.createElement('div');
    el.className = 'stairts-label';
    el.style.cssText = `opacity:0.78; font-weight:400; text-transform:none; line-height:1.35; margin-top:4px;${
        tone === 'warn' ? ' color:#ffcf8f;' : ''}`;
    el.textContent = text;
    return el;
}

/**
 * Build the second-run direction control for a stair.
 *
 * Returns `null` — no section at all — when the element is not a stair, or when
 * its SHAPE has no second run (I / spiral / winder). ⛔ A straight stair must not
 * be offered a second-run control: that is a nonsense state, and manufacturing a
 * control that can only refuse is the dead-control shape
 * §FIX-STAIR-PANEL-MISSING-ROWS removed from this panel.
 *
 * An L- or U-shaped stair that is nonetheless not turnable (a curved stair — which
 * persists as `shape: 'L'` — or a 3-run U) DOES get a section, carrying the
 * engine's own reason. That asymmetry is deliberate: silence about a stair that
 * plainly has two runs would read as a bug, whereas a written NOT-YET is the
 * register this repo already uses for a genuinely undecided axis.
 */
export function buildStairSecondRunSection(
    elementData: Record<string, unknown>,
): HTMLElement | null {
    const elType = String(elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'stair' && elType !== 'stairs') return null;

    const stairId = String(elementData.id ?? '');
    if (!stairId) return null;

    const stair = readStair(stairId);
    const shape = String(stair?.shape ?? elementData.shape ?? '');

    // ⛔ No second run on this SHAPE ⇒ no control, no placeholder, no section.
    if (!stairShapeHasSecondRun(shape as never)) return null;

    const outer = document.createElement('div');
    outer.className = 'stairts-outer';
    outer.setAttribute('data-testid', 'stair-second-run');

    const heading = document.createElement('div');
    heading.className = 'stairts-label';
    heading.textContent = headingFor(shape);
    outer.appendChild(heading);

    const elig = stairSecondRunEligibility(stair);
    if (!elig.ok) {
        // The engine's OWN sentence — the panel does not paraphrase a refusal.
        outer.appendChild(noteEl(elig.reason));
        return outer;
    }

    const derived = deriveStairSecondRunHandedness(stair);

    const row = document.createElement('div');
    row.className = 'stairts-row';

    const mkBtn = (side: StairRunHandedness): HTMLButtonElement => {
        const b = document.createElement('button');
        b.className = 'stairts-apply-btn';
        b.textContent = HANDEDNESS_LABEL[side];
        b.setAttribute('data-testid', `stair-second-run-${side}`);
        b.setAttribute('data-selected', String(derived === side));
        if (derived === side) b.style.cssText = 'background: rgba(102,0,255,0.55); font-weight:600;';
        return b;
    };
    const leftBtn = mkBtn('left');
    const rightBtn = mkBtn('right');
    row.appendChild(leftBtn);
    row.appendChild(rightBtn);
    outer.appendChild(row);

    const verdictEl = document.createElement('div');
    verdictEl.className = 'stairts-label';
    verdictEl.style.cssText = 'font-weight:400; text-transform:none; opacity:0.85; margin-top:4px;';
    verdictEl.setAttribute('data-testid', 'stair-second-run-verdict');
    outer.appendChild(verdictEl);

    const setVerdict = (text: string, bad: boolean): void => {
        verdictEl.textContent = text;
        verdictEl.style.color = bad ? '#ff9d9d' : '';
    };

    // ⭐ `null` is NOT "left". Failure to read and a real answer must never be the
    // same value on screen (§CONTEXT-DATA-HONESTY).
    if (derived === null) {
        outer.appendChild(noteEl(
            'This stair’s second run has no measurable side (its runs are parallel, or the ' +
            'return run carries no offset), so the current direction cannot be read from the ' +
            'geometry. Choosing a direction will set one.',
            'warn',
        ));
    }

    // ⚠ The stamp-vs-geometry disagreement, SAID rather than silently resolved.
    if (stairSecondRunStampIsStale(stair)) {
        const field = stairSecondRunField(stair!.shape) ?? 'turnDirection';
        const stamped = stairStampedSecondRunHandedness(stair);
        outer.appendChild(noteEl(
            `Note: this stair is BUILT turning ${HANDEDNESS_LABEL[derived!].toLowerCase()}, but its ` +
            `saved "${field}" says ${String(stamped)}. The buttons above follow the geometry, which is ` +
            'what you can see. Setting a direction here writes both back into agreement.',
            'warn',
        ));
    }

    // ⛔ THE GENUINELY UNDECIDED AXIS, in the register this panel already uses for
    // the storey axis (`levelChangeVerbs.ts:348`). Turning the run is fully
    // decided — it is a mirror about the FIRST run's own axis, so the first run,
    // and therefore the stair's start point, does not move. What is NOT decided is
    // whether the editor should refuse or warn when the mirrored run sweeps into a
    // wall, off the slab, or out of its room: this model carries no clearance
    // check for stairs, so the flip is neither refused nor auto-relocated.
    outer.appendChild(noteEl(
        'The first run does not move — only the second run and its landing mirror across it, ' +
        'so the stair keeps its start point. There is no clearance check yet: if the turned run ' +
        'would land in a wall or off the slab, nothing here will stop it or move it for you.',
    ));

    const dispatch = (want: StairRunHandedness): void => {
        if (derived === want) { setVerdict('', false); return; }
        leftBtn.disabled = true;
        rightBtn.disabled = true;
        setVerdict('Turning…', false);

        const field = stairSecondRunField(stair!.shape);
        if (!field) { setVerdict('This stair has no second-run field to write.', true); return; }

        const done = (): void => {
            // ⭐ READ BACK FROM THE GEOMETRY, not from the flag and not from the
            // promise. C16 §5.1 CA-21: never confirm from the store the handler
            // wrote — re-derive from the flights the renderer will consume.
            const after = readStair(stairId);
            const nowIs = deriveStairSecondRunHandedness(after);
            if (nowIs === want) {
                setVerdict('', false);
                leftBtn.setAttribute('data-selected', String(want === 'left'));
                rightBtn.setAttribute('data-selected', String(want === 'right'));
                leftBtn.style.cssText = want === 'left' ? 'background: rgba(102,0,255,0.55); font-weight:600;' : '';
                rightBtn.style.cssText = want === 'right' ? 'background: rgba(102,0,255,0.55); font-weight:600;' : '';
            } else {
                setVerdict(
                    nowIs === null
                        ? 'The stair was not turned — its second run still has no measurable side. See the console for the command’s reason.'
                        : `The stair was not turned — its second run still goes ${HANDEDNESS_LABEL[nowIs].toLowerCase()}. See the console for the command’s reason.`,
                    true,
                );
            }
            leftBtn.disabled = false;
            rightBtn.disabled = false;
        };

        const p = window.runtime?.bus?.executeCommand('stair.updateParameters', {
            stairId,
            updates: { [field]: want },
        });
        if (p && typeof p.then === 'function') {
            p.then(done).catch((e: unknown) => {
                console.error('[StairSecondRunWidget] stair.updateParameters failed:', e);
                done();
            });
        } else {
            done();
        }
    };

    leftBtn.addEventListener('click', () => dispatch('left'));
    rightBtn.addEventListener('click', () => dispatch('right'));

    return outer;
}
