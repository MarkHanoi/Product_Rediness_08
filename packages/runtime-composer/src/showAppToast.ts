// showAppToast — DOM toast helper.  Phase A.6 (S73-WIRE) close.
//
// Moved here from `src/ui/AppToast.ts` so the runtime-composer package
// owns the canonical implementation.  The legacy `src/ui/AppToast.ts`
// shim is **deleted** (A.6 acceptance: zero `from '../AppToast'` imports
// in `src/`).
//
// CSS contract: classes `at-container`, `at-toast`, `at-toast--<kind>`,
// `at-icon`, `at-body`, `at-title`, `at-msg`, `at-close`, `at-hiding`
// are defined in `src/styles/panels/appToast.ts` (`APP_TOAST_STYLES`)
// and injected via `injectAppTheme()` (`src/styles/AppTheme.ts`).  This
// helper assumes the stylesheet has been injected by the host app
// before the first toast fires; if not, the toast still functions but
// renders unstyled.  Layer-matrix safe: this file does NOT import from
// `src/`.

import type { ToastKind } from './types.js';

const ICONS: Record<ToastKind, string> = {
  info: 'i',
  success: '\u2713',
  warn: '!',
  error: '\u2715',
};

const TITLES: Record<ToastKind, string> = {
  info: 'Info',
  success: 'Done',
  warn: 'Warning',
  error: 'Error',
};

const DURATION_MS = 4000;

function getContainer(): HTMLElement {
  let el = document.getElementById('at-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'at-container';
    document.body.appendChild(el);
  }
  return el;
}

export function showAppToast(
  message: string,
  type: ToastKind = 'info',
  duration: number = DURATION_MS,
): HTMLElement {
  const container = getContainer();

  const toast = document.createElement('div');
  toast.className = `at-toast at-toast--${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');

  const icon = document.createElement('div');
  icon.className = 'at-icon';
  icon.textContent = ICONS[type];

  const body = document.createElement('div');
  body.className = 'at-body';

  const title = document.createElement('div');
  title.className = 'at-title';
  title.textContent = TITLES[type];

  const msg = document.createElement('div');
  msg.className = 'at-msg';
  msg.textContent = message;

  body.appendChild(title);
  body.appendChild(msg);

  const close = document.createElement('button');
  close.className = 'at-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '\u00d7';

  toast.appendChild(icon);
  toast.appendChild(body);
  toast.appendChild(close);
  container.appendChild(toast);

  const dismiss = (): void => {
    if (!toast.isConnected) return;
    toast.classList.add('at-hiding');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  close.addEventListener('click', dismiss);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  return toast;
}
