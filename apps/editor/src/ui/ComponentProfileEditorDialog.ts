/**
 * ComponentProfileEditorDialog — the L7 modal that satisfies the ComponentSection's
 * `setComponentProfileEditorOpener` port (UI/UX wave, lane U2 · lane 4F's O-1 seam).
 *
 * ⛔ **It mints nothing** (audit R1): the surface inside is `createComponentProfilePanel`
 * — lane 4F's composition of the ONE elevation surface, the ONE profile evaluator and
 * the C74 §4.6 constraint record. This file is chrome: overlay, title, close.
 *
 * ─── ⚠ VIEW-ONLY FROM THE INSTANCE PANEL, AND IT SAYS SO ───────────────────────
 * A component definition is a DOCUMENT, not project state (UIUX-PLAN §U3's mutation
 * shape). No bus verb exists for document-internal edits, minting one is forbidden to
 * this lane (no new verbs), and the definition-editor's draft-save seam is lane U3's.
 * So this dialog passes NO `onCommit` and states the fact in its footer — an honest
 * sentence, not a save button that goes nowhere (§OPENING-PROFILE-PANEL-REACHABILITY's
 * "a control that appeared to do nothing", refused in advance). The panel itself still
 * shows write-back dispositions and constraint glyphs exactly as 4F built them.
 */

import { createComponentProfilePanel } from './component';
import type { ComponentProfileEditorRequest } from './property-panel/ComponentSection';

export function openComponentProfileEditorDialog(req: ComponentProfileEditorRequest): void {
    // One dialog at a time — reopening replaces.
    document.querySelector('[data-cped-root]')?.remove();

    const overlay = document.createElement('div');
    overlay.setAttribute('data-cped-root', req.profile.id);
    overlay.style.cssText =
        'position:fixed;inset:0;z-index:10050;background:rgba(10,10,14,0.55);' +
        'display:flex;align-items:center;justify-content:center;';

    const card = document.createElement('div');
    card.style.cssText =
        'background:#ffffff;border-radius:8px;padding:14px;min-width:420px;max-width:min(720px,92vw);' +
        'max-height:88vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,0.35);' +
        'font:13px/1.45 system-ui,sans-serif;color:#1a1a1a;';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:14px;';
    title.setAttribute('data-cped-title', '');
    title.textContent = `${req.definitionName} — profile '${req.profile.name}' on ${req.plane.name}`;
    head.appendChild(title);
    const close = document.createElement('button');
    close.setAttribute('data-cped-close', '');
    close.textContent = '✕';
    close.style.cssText = 'border:none;background:none;font-size:15px;cursor:pointer;padding:2px 6px;';
    close.addEventListener('click', () => overlay.remove());
    head.appendChild(close);
    card.appendChild(head);

    const panel = createComponentProfilePanel({
        profile: req.profile,
        plane: req.plane,
        scope: req.scope,
        // ⛔ deliberately no onCommit — see the header.
    });
    card.appendChild(panel.root);

    const foot = document.createElement('div');
    foot.setAttribute('data-cped-readonly-note', '');
    foot.style.cssText = 'margin-top:8px;font-size:11.5px;color:#6b6b76;line-height:1.5;';
    foot.textContent =
        'Viewing from the instance panel. Definition documents are edited in the component ' +
        'definition editor — no project command exists for document-internal edits, so nothing ' +
        'here writes back to the definition.';
    card.appendChild(foot);

    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
    overlay.appendChild(card);
    document.body.appendChild(overlay);
}
