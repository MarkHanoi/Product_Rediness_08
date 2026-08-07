/**
 * toolKeyGuard — §FIX-COMMIT-STEALS-VIEW (founder, 2026-08-07)
 *
 * THE REPORT:
 *   "Floor finish works well in terms of UI/UX. But when the user wants to finish
 *    the process and clicks ENTER — one time the view went to 3D SITE VIEW,
 *    another time the 3D view went WHITE SCREEN."
 *
 * THE LOG, unambiguously:
 *   [FloorTool] §FLOOR-3D-ENTER Enter — active=true points=18 → COMMITTING
 *   [VST][+0.0ms] ViewController.activate("3D") ENTRY — activeDefinitionId=null
 *   … full deactivate/activate cycle …
 *   [CommandManager] EXECUTE: CREATE_FLOOR
 *
 * A view switch fired 0.0 ms after the commit line and BEFORE the create command.
 * Committing an element must never change the active view.
 *
 * ROOT CAUSE — a keystroke that was never consumed.
 * The drawing tools handled Enter (commit) and Escape (cancel) but called neither
 * `preventDefault()` nor `stopPropagation()`. The browser therefore continued its
 * default handling and delivered the key to whatever control still held DOM focus.
 * The camera/view controls are ordinary focusable `<button>`s — e.g.
 * `BottomActionMenu._toggleCamera`, whose click runs
 * `viewController.activate(this._is2D ? 'Top' : '3D')`. A user who reached the
 * drawing tool by clicking a toolbar button leaves that button focused; Enter then
 * "clicks" it. That explains every detail of the report:
 *   • `activeDefinitionId=null`  — the GENERIC 3D toggle, not a view definition.
 *   • `+0.0 ms`, same tick        — a default action, not an async race.
 *   • twice in one log            — the button keeps focus, so it recurs.
 *   • "sometimes 3D, sometimes white" — a view switch always happened; whether it
 *     ALSO looked broken depended on the camera-restore path it then took.
 *
 * TWO GUARDS, because either alone leaves a hole:
 *   1. `consumeToolKey` — the key the tool ACTED on is consumed, so it cannot also
 *      trigger a focused control. This is the direct fix.
 *   2. `releaseFocusedControl` — called on tool ACTIVATION, so a button the user
 *      pressed to reach the tool is not left focused at all. This also stops
 *      SPACE (pan) and Enter from re-triggering that button mid-draw, which is the
 *      same defect wearing a different key.
 *
 * Pure DOM, no THREE, no store access — safe for any tool package to import.
 * (Span-free by the same precedent as `boundaryArc.ts` / `boundaryPath.ts`: the
 * C10 §2 OTel gate scopes to `plugins/&#42;/src/handlers/`, not to pure helpers.)
 */

/**
 * Consume a keystroke the tool has just acted on.
 *
 * `preventDefault()` stops the browser's default activation of a focused control;
 * `stopPropagation()` stops other listeners on ancestors from seeing it. Both are
 * needed: the first alone still lets a document-level listener react, and the
 * second alone still lets the browser fire the button's default click.
 */
export function consumeToolKey(e: {
    preventDefault?: () => void;
    stopPropagation?: () => void;
}): void {
    e.preventDefault?.();
    e.stopPropagation?.();
}

/**
 * Drop DOM focus from a toolbar control so keystrokes meant for the canvas cannot
 * activate it. Called when a drawing tool activates.
 *
 * Deliberately narrow: it blurs ONLY buttons and links. Text inputs, selects and
 * textareas are left alone — a user typing a dimension into the tool's own HUD
 * must not have the field yanked out from under them, and `contenteditable`
 * surfaces (annotations) are likewise untouched.
 */
export function releaseFocusedControl(doc: Pick<Document, 'activeElement'> | undefined = typeof document !== 'undefined' ? document : undefined): void {
    const el = doc?.activeElement as (HTMLElement & { blur?: () => void }) | null | undefined;
    if (!el) return;
    const tag = el.tagName;
    if (tag !== 'BUTTON' && tag !== 'A') return;
    el.blur?.();
}
