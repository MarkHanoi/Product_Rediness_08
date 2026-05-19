// FocusTrap — Wave A18-T19
//
// CONTRACT (C06 §3): Modal panels (property inspector, BCF issue editor,
// IFC export dialog) MUST trap focus inside the modal while it is open.
// This satisfies WCAG 2.1 Success Criterion 2.1.2 (No Keyboard Trap) by
// ensuring Tab and Shift+Tab cycle only within the modal, and Escape
// closes it.
//
// Usage:
//   const trap = new FocusTrap(dialogElement);
//   trap.activate();
//   // user interacts with modal…
//   trap.deactivate();   // call when modal closes

import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.ui-base.focus-trap');

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
  'details > summary',
].join(',');

export class FocusTrap {
  private readonly _root: HTMLElement;
  private _active = false;
  private _previouslyFocused: HTMLElement | null = null;
  private readonly _keyHandler: (e: KeyboardEvent) => void;

  constructor(root: HTMLElement) {
    this._root = root;
    this._keyHandler = this._onKeyDown.bind(this);
  }

  /** Activate focus trap — stores previously focused element, moves focus inside. */
  activate(): void {
    if (this._active) return;
    const span = tracer.startSpan('pryzm.ui-base.focus-trap.activate');
    try {
      this._active = true;
      this._previouslyFocused = document.activeElement as HTMLElement | null;
      this._root.addEventListener('keydown', this._keyHandler);

      const first = this._focusableElements()[0];
      if (first) (first as HTMLElement).focus();
    } finally {
      span.end();
    }
  }

  /** Deactivate focus trap — restores focus to the element that had it before. */
  deactivate(): void {
    if (!this._active) return;
    const span = tracer.startSpan('pryzm.ui-base.focus-trap.deactivate');
    try {
      this._active = false;
      this._root.removeEventListener('keydown', this._keyHandler);
      if (this._previouslyFocused && typeof this._previouslyFocused.focus === 'function') {
        this._previouslyFocused.focus();
      }
      this._previouslyFocused = null;
    } finally {
      span.end();
    }
  }

  get isActive(): boolean {
    return this._active;
  }

  private _focusableElements(): Element[] {
    return Array.from(this._root.querySelectorAll(FOCUSABLE_SELECTORS)).filter(
      (el) => !el.hasAttribute('disabled') && (el as HTMLElement).offsetParent !== null,
    );
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (!this._active) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.deactivate();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusable = this._focusableElements();
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !this._root.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !this._root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}
