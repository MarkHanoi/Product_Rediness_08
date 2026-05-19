/**
 * OfflineBanner — C05 §1.2 (amended) offline-mode indicator.
 *
 * Displayed whenever the app is serving project data from the local
 * IndexedDB cache (IndexedDBStore) because Supabase is unreachable.
 *
 * Accessibility: role="alert" + aria-live="polite" ensures screen-readers
 * announce the offline state without interrupting ongoing speech.
 *
 * Wave A17-T10 (2026-05-03).
 */
export class OfflineBanner {
  private _el: HTMLElement | null = null;

  /** Show the banner. Idempotent — calling when already visible is a no-op. */
  show(): void {
    if (this._el) return;
    const el = document.createElement('div');
    el.id = 'pryzm-offline-banner';
    el.role = 'alert';
    el.setAttribute('aria-live', 'polite');
    Object.assign(el.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      background: '#f59e0b',
      color: '#1c1917',
      textAlign: 'center',
      padding: '8px 16px',
      fontFamily: 'inherit',
      fontWeight: '600',
      fontSize: '14px',
      lineHeight: '1.5',
      zIndex: '9999',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    } satisfies Partial<CSSStyleDeclaration>);
    el.textContent = 'Offline — read only. Changes will not be saved until reconnected.';
    document.body.prepend(el);
    this._el = el;
  }

  /** Hide the banner. Idempotent — safe to call when not visible. */
  hide(): void {
    this._el?.remove();
    this._el = null;
  }

  /** Returns `true` when the banner is currently shown. */
  get visible(): boolean {
    return this._el !== null;
  }
}

/** Module-level singleton — import and use directly from any platform surface. */
export const offlineBanner = new OfflineBanner();
