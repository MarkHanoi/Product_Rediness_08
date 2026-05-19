// AppHeader — extracted from AppShell.ts to keep §13 LoC budget
// (S52 D1 / S53 D1). Pure DOM scaffolding; no event wiring beyond
// the static logo/subtitle row.

export function renderAppHeader(): HTMLElement {
  const header = document.createElement('header');
  header.dataset.role = 'app-header';
  header.style.cssText = [
    'padding:16px 24px',
    'border-bottom:1px solid rgba(255,255,255,0.1)',
    'display:flex',
    'align-items:center',
    'gap:12px',
  ].join(';');

  const logo = document.createElement('div');
  logo.textContent = 'PRYZM';
  logo.style.cssText = 'font-weight:700;color:#6600FF;font-size:18px;letter-spacing:1px';

  const subtitle = document.createElement('div');
  subtitle.textContent = 'Family Creator';
  subtitle.style.cssText = 'font-size:14px;color:#a8a8c0';

  header.append(logo, subtitle);
  return header;
}
