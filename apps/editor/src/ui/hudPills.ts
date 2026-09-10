/**
 * @file apps/editor/src/ui/hudPills.ts
 *
 * §XSS-SINK-SCAN — the ONE builder for the `wdh-key` / `wdh-lbl` pill pair used by the
 * drawing-mode HUDs and mode pickers.
 *
 * WHY THIS MODULE EXISTS. The same line
 *
 *     btn.innerHTML = `<span class="wdh-key">${key}</span><span class="wdh-lbl">${label}</span>`;
 *
 * was written independently in `WallDrawingHUD.ts` (x3), `DoorModePicker.ts` (x2) and
 * `WindowModePicker.ts` (x2). `check-xss-guards` flagged four of those seven and could not
 * see the other three, because those three happen to interpolate string literals today.
 * ⭐ That split is the tell, and it is this repo's dominant defect shape: one rule with
 * several implementations, where a fix lands in the copy nobody is looking at and the
 * guarding gate stays green because it measured a different copy.
 *
 * WHY DOM AND NOT `escHtml`. Escaping would satisfy the gate while leaving an HTML parse in
 * the path. `textContent` removes the parse, so the safety stops depending on whether the
 * caller's value happens to be inert — which is the property that actually rots when someone
 * later makes `label` user-authored.
 *
 * ⛔ This module does NOT live in `styles/panels/drawingHuds.ts` even though that file owns the
 * `wdh-` class names: its header declares "CSS layer only, zero logic" (CONTRACT §05 §2), and a
 * DOM builder there would break the very contract that keeps it readable.
 *
 * ⚠ NOT YET UNIVERSAL, stated so nobody reads this as settled: `grep -rl 'wdh-key'` finds 13
 * files. Three are converted here — the three the gate named. The other ten (CeilingDrawingHUD,
 * CurtainWallDrawingHUD, DrawingModeBar, FloorDrawingHUD, GridDrawingHUD, UnderlayScaleHUD,
 * CurtainWallPlanToolHandler, SiteBoundaryMap2D, geometry-curtain-wall/CurtainWallTool, plus the
 * envelope mode-bar spec) still build their own. They are follow-up, not done.
 */

/**
 * Replace `btn`'s children with the key pill and the label pill, as ELEMENTS.
 *
 * Pass `key` as `null` when the pill should carry no key — e.g. the profile pickers print the
 * shortcut on the first member only, because the key CYCLES the axis rather than selecting the
 * member it sits on, and stamping it on every member would say otherwise.
 */
export function setKeyLabelPills(btn: HTMLElement, key: string | null, label: string): void {
    const nodes: HTMLSpanElement[] = [];
    if (key !== null && key !== '') {
        const k = document.createElement('span');
        k.className = 'wdh-key';
        k.textContent = key;
        nodes.push(k);
    }
    const l = document.createElement('span');
    l.className = 'wdh-lbl';
    l.textContent = label;
    nodes.push(l);
    btn.replaceChildren(...nodes);
}
