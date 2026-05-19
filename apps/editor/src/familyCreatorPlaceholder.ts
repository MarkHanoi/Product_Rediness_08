/**
 * Family Creator — temporary placeholder dialog.
 *
 * The legacy `src/component-editor/` prototype was removed on 2026-04-28 as the
 * §2 step of the Family Creator full rewrite. The new editor is being built as
 * a standalone SPA at `apps/component-editor/` over sprints S52–S59 per
 * docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md.
 *
 * Until the new SPA lands at S58 (standalone deploy), this lightweight modal
 * keeps the existing "Component" / "Generic Component" menu entries from
 * regressing to a dead-link experience. The modal is intentionally inline
 * (no framework, no plugin surface) so it carries zero ongoing maintenance
 * cost and disappears entirely when S58 wires the real handoff.
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
    'background:rgba(15,15,30,0.55)', 'font-family:system-ui,sans-serif',
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
