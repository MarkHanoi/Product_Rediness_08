// src/ui/ConflictDisclosureBanner.ts — Wave A19-T7
//
// CONTRACT (C08 §3.1 — P8 compliance):
// When a concurrent edit overrides a local change, the system MUST display
// an explicit disclosure banner: "Your change was overridden by a concurrent
// edit from <author>. Click to resolve the conflict."
//
// This satisfies the C08 §3.1 LWW disclosure requirement:
//   "Silent last-write-wins is forbidden. Conflicts MUST be explicit."
//
// The banner uses role="alert" + aria-live="assertive" so screen readers
// announce it immediately (WCAG 2.1 SC 4.1.3 Status Messages).
// Clicking the banner opens the ConflictResolutionDialog.

export interface ConflictBannerOptions {
  remoteAuthor: string;
  propertyName: string;
  onResolve?: () => void;
  autoHideMs?: number;
}

/**
 * ConflictDisclosureBanner — fixed-position banner shown when a concurrent
 * edit overrides a local change.
 *
 * Usage:
 *   const banner = new ConflictDisclosureBanner();
 *   banner.show({ remoteAuthor: 'Alice', propertyName: 'height', onResolve: openDialog });
 */
export class ConflictDisclosureBanner {
  private _el: HTMLElement | null = null;
  private _autoHideTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Show the disclosure banner.
   * If a banner is already shown, it is replaced.
   */
  show(opts: ConflictBannerOptions): void {
    this.hide();

    const {
      remoteAuthor,
      propertyName,
      onResolve,
      autoHideMs = 12_000,
    } = opts;

    const el = document.createElement('div');
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('aria-label', 'Sync conflict notification');
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('tabindex', '0');

    Object.assign(el.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      background: 'linear-gradient(135deg,#dc2626,#b91c1c)',
      color: '#fff',
      borderRadius: '10px',
      padding: '14px 20px',
      maxWidth: '400px',
      minWidth: '280px',
      zIndex: '9998',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '500',
      lineHeight: '1.5',
      fontSize: '13px',
      boxShadow: '0 8px 32px rgba(220,38,38,0.4)',
      cursor: onResolve ? 'pointer' : 'default',
      border: '1px solid rgba(255,255,255,0.15)',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    });

    // Main message
    const msg = document.createElement('div');
    msg.textContent =
      `Your change to "${propertyName}" was overridden by a concurrent edit from ${remoteAuthor}.`;

    // Action hint
    const hint = document.createElement('div');
    hint.textContent = onResolve ? 'Click to resolve the conflict.' : '';
    Object.assign(hint.style, { fontSize: '12px', opacity: '0.8', fontWeight: '400' });

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Dismiss conflict notification');
    closeBtn.setAttribute('type', 'button');
    Object.assign(closeBtn.style, {
      position: 'absolute',
      top: '8px',
      right: '10px',
      background: 'none',
      border: 'none',
      color: 'rgba(255,255,255,0.7)',
      fontSize: '18px',
      lineHeight: '1',
      cursor: 'pointer',
      padding: '0',
    });
    closeBtn.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      this.hide();
    };

    el.style.position = 'fixed'; // ensure it's set
    el.appendChild(msg);
    el.appendChild(hint);
    el.appendChild(closeBtn);

    // Click handler → open resolution dialog
    if (onResolve) {
      el.onclick = () => {
        this.hide();
        onResolve();
      };
      el.onkeydown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.hide();
          onResolve();
        }
      };
    }

    document.body.appendChild(el);
    this._el = el;

    // Auto-hide after timeout
    if (autoHideMs > 0) {
      this._autoHideTimer = setTimeout(() => this.hide(), autoHideMs);
    }
  }

  /** Programmatically dismiss the banner. */
  hide(): void {
    if (this._autoHideTimer !== null) {
      clearTimeout(this._autoHideTimer);
      this._autoHideTimer = null;
    }
    this._el?.remove();
    this._el = null;
  }

  /** True when a banner is currently visible. */
  isVisible(): boolean { return this._el !== null; }
}
