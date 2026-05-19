// AppFooter — extracted from AppShell.ts to keep §13 LoC budget
// (S52 D1). Static footer with the licence / build line.

export function renderAppFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.dataset.role = 'app-footer';
  footer.style.cssText = [
    'padding:16px 24px',
    'border-top:1px solid rgba(255,255,255,0.1)',
    'font-size:12px',
    'color:#7878a0',
    'text-align:center',
  ].join(';');
  footer.textContent = '© PRYZM — vanilla TypeScript, no React. Layer L7 chrome.';
  return footer;
}
