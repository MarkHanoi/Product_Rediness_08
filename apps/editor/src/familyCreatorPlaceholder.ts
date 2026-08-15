/**
 * @file familyCreatorPlaceholder.ts — Family Creator, temporary placeholder dialog.
 *
 * ─── C74 §3.4 SCAFFOLD DECLARATION (CO-06) ───────────────────────────────────
 * owner: @pryzm/editor (create-rail surface; the handoff to
 *   `apps/component-editor` is this app's debt, not the SPA's)
 * date: 2026-08-15
 *
 * WHAT IS FAKE, stated plainly — this module is named for the Family Creator
 *   and creates no family. It is a DOM modal that says "under construction" and
 *   prints a path to a plan document. Clicking "Component" / "Generic Component"
 *   in the create rail reaches a dialog, not an editor: nothing is authored,
 *   nothing is persisted, no `.pryzm-family` artefact exists afterwards. It is a
 *   dead-link guard wearing the name of the feature it stands in for.
 *
 * WHAT IS REAL — the modal itself: it mounts, traps Escape, is `role="dialog"`
 *   with `aria-modal`, and it does honestly TELL the user the editor is not
 *   built. The stand-in is truthful to the user; it is still a stand-in.
 *
 * LIVE — reached from `apps/editor/src/ui/tools-panel/panels/CreateRailPanel.ts:1105`
 *   via `import('../../../familyCreatorPlaceholder')`. This is NOT dead code.
 *   ⚠ Do not confuse this file with `apps/editor/src/ui/familyCreatorPlaceholder.ts`,
 *   a DIFFERENT and much smaller console.log stub reached from
 *   `ui/layout/CreatePanelLayout.ts:350`. Two files, same name, different callers.
 *   The third copy (`src/familyCreatorPlaceholder.ts`) was DELETED 2026-08-15 as
 *   dead — it had no importer anywhere in the repo.
 *
 * RETIRING ASSERTION (executable, not prose) —
 *   `apps/editor/__tests__/FamilyCreatorPlaceholderScaffold.test.ts`, the test
 *   named "THE SCAFFOLD: the create rail still routes Component to a
 *   placeholder, not an editor", asserts that CreateRailPanel.ts still carries
 *   the `import('../../../familyCreatorPlaceholder')` call. A sibling test
 *   asserts this module still ships the "under construction" title and still
 *   dispatches no command and writes no `.pryzm-family` artefact. When the real
 *   handoff lands, the create rail points at `apps/component-editor` instead and
 *   the first assertion FAILS — which forces this header and the placeholder to
 *   be retired in the same change. It cannot rot quietly: the pair is
 *   all-or-nothing. (Source-scan, not DOM: `apps/editor/vitest.config.ts` runs
 *   `environment: 'node'` and its header forbids switching.)
 *
 * EXIT CONDITION — `apps/component-editor` reaches standalone deploy and the
 *   create rail hands off to it (S58 per
 *   docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md).
 *   ⚠ MILESTONE HONESTY (C74 §4.2(c)): the "S58" above is the PLAN's number,
 *   restated, not a fresh promise. The legacy `src/component-editor/` prototype
 *   was removed 2026-04-28 and no replacement has shipped since; treat S58 as
 *   UNSCHEDULED until `apps/component-editor` has a deploy target.
 */

const PLAN_PATH =
  'docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md';

export function openFamilyCreatorPlaceholder(): void {
  if (document.getElementById('family-creator-placeholder')) return;

  const overlay = document.createElement('div');
  overlay.id = 'family-creator-placeholder';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'family-creator-placeholder-title');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:10000',
    'display:flex', 'align-items:center', 'justify-content:center',
    // §PANEL-BACKDROP-UNIFY — shared scrim (was rgba(15,15,30,0.55)).
    'background:var(--pryzm-panel-backdrop)',
    'backdrop-filter:var(--pryzm-panel-backdrop-blur)',
    '-webkit-backdrop-filter:var(--pryzm-panel-backdrop-blur)',
    'font-family:system-ui,sans-serif',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'max-width:520px', 'width:calc(100% - 48px)',
    'background:#fff', 'color:#1a1a2e',
    'border-radius:12px', 'padding:32px',
    'box-shadow:0 24px 64px rgba(0,0,0,0.35)',
  ].join(';');

  const title = document.createElement('h2');
  title.id = 'family-creator-placeholder-title';
  title.textContent = 'Family Creator — under construction';
  title.style.cssText = 'margin:0 0 12px;font-size:22px;color:#6600FF';

  const body = document.createElement('p');
  body.style.cssText = 'margin:0 0 16px;line-height:1.5';
  body.textContent =
    'The previous component editor prototype has been removed in preparation ' +
    'for a full rewrite as a standalone, parametric Family Creator. ' +
    'The new editor will land progressively across the next eight sprints ' +
    '(S52 → S59) and will live at apps/component-editor/.';

  const link = document.createElement('p');
  link.style.cssText = 'margin:0 0 24px;font-size:13px;color:#555';
  link.textContent = 'See the rewrite plan at: ';
  const code = document.createElement('code');
  code.textContent = PLAN_PATH;
  code.style.cssText =
    'background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:12px';
  link.appendChild(code);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.style.cssText = [
    'background:#6600FF', 'color:#fff', 'border:none',
    'padding:10px 20px', 'border-radius:6px',
    'font-weight:600', 'cursor:pointer', 'font-size:14px',
  ].join(';');
  close.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.addEventListener(
    'keydown',
    function onKey(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
      }
    },
  );

  card.append(title, body, link, close);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  close.focus();
}
