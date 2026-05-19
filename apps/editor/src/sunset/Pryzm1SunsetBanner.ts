/**
 * Pryzm1SunsetBanner — relocated at S70 D8 (was `src/lifecycle/Pryzm1SunsetBanner.ts`,
 * landed at S61 D1 per ADR-0031).
 *
 * Why moved at S70 D8:
 *   • SPEC-27 §4.3 + ADR-030 Part D schedule `src/lifecycle/` for full
 *     deletion at S70.  ADR-030 governs the *element-lifecycle*
 *     subsystem, not customer-facing sunset UX, so this banner does
 *     not belong in the deletion scope.
 *   • Deleting the banner would break the 90-day sunset window
 *     contract committed at S61 D1 (per SPEC-27 §3.2 customer-comms
 *     cadence).
 *   • New home `apps/editor/src/sunset/` is the editor-host UX
 *     surface, where editor-bound display modules live.
 *   • The runtime contract is BYTE-FOR-BYTE UNCHANGED from the S61
 *     implementation — same exported names, same option shapes, same
 *     defaults, same DOM emit.  The only diff vs the S61 file is this
 *     header comment block.
 *
 * Original docstring (preserved):
 *
 *   Renders a top-of-viewport banner informing the user that PRYZM 1 will
 *   be removed at the end of the 90-day sunset window.  Visibility rules
 *   per S61 D1 are deliberately *additive*:
 *
 *     • This commit (D1): the banner module exists + is unit-testable, but
 *       `paintSunsetBanner()` is called only when the URL contains
 *       `?pryzm1=1` (explicit opt-in test mode).  Default sessions see no
 *       change.
 *     • D5 (later this sprint): the default flips.  PRYZM 2 becomes the
 *       no-flag path; PRYZM 1 becomes `?pryzm1=1`-only and the banner
 *       becomes mandatory for every PRYZM 1 session.
 *     • D30/D60/D90: per `apps/editor/migrations/sunset-pryzm1.md` §5,
 *       the banner escalates from dismissible → modal → blocking.  This
 *       module exposes a `mode` parameter so the escalation is one
 *       line in `src/main.ts` per phase.
 *
 *   Spec: SPEC-27 §3.2 customer-comms cadence.
 *   ADR : docs/architecture/adr/0031-s61-staged-legacy-deletion.md;
 *         relocation: docs/architecture/adr/0052-s70-…-lifecycle-deletion.md §B.7.
 *
 *   Pure DOM — no React, no MUI — so it survives a degraded boot.  The
 *   banner injects no scripts, no styles into <head> (only inline style
 *   on the banner element itself), and is `position: fixed` at the top
 *   with z-index 100000 so it sits above PRYZM 1's `#progress` overlay
 *   (z-index 2000 in `index.html`) and the platform-root (z-index 9990).
 *
 * @example
 *   if (new URLSearchParams(location.search).get('pryzm1') === '1') {
 *     paintSunsetBanner({ mode: 'banner', sunsetDate: '2026-07-27' });
 *   }
 */

export type SunsetBannerMode = 'banner' | 'modal' | 'blocking';

export interface PaintSunsetBannerOptions {
  /** Visibility / interaction strength.  Defaults to `'banner'`. */
  readonly mode?: SunsetBannerMode;
  /** ISO-8601 date the user is told PRYZM 1 will be removed.  Defaults
   *  to "in 90 days from now" if omitted. */
  readonly sunsetDate?: string;
  /** Override the default migration-help URL.  Defaults to
   *  `https://pryzm.app/sunset` per ADR-0031 §5. */
  readonly migrationUrl?: string;
  /** Container to mount inside.  Defaults to `document.body`. */
  readonly container?: HTMLElement;
  /** Pre-existing banner element id — used to make calls idempotent.
   *  Defaults to `pryzm1-sunset-banner`.  If this id is already in the
   *  DOM, the existing element is reused (its content is refreshed). */
  readonly elementId?: string;
}

export interface SunsetBannerHandle {
  /** The banner DOM element (anchored fixed-top).  Owned by this
   *  module; callers should call `dismiss()` rather than detaching. */
  readonly element: HTMLElement;
  /** Idempotent.  Removes the banner from the DOM. */
  dismiss(): void;
}

const DEFAULT_MIGRATION_URL = 'https://pryzm.app/sunset';
const DEFAULT_ELEMENT_ID = 'pryzm1-sunset-banner';
const SUNSET_WINDOW_DAYS = 90;

function defaultSunsetDate(): string {
  const now = Date.now();
  const target = new Date(now + SUNSET_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return target.toISOString().slice(0, 10);
}

function bannerStyle(mode: SunsetBannerMode): string {
  const base =
    'position:fixed;left:0;right:0;top:0;z-index:100000;' +
    'font:14px ui-sans-serif,system-ui,sans-serif;color:#fff;' +
    'padding:12px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;' +
    'box-shadow:0 2px 8px rgba(0,0,0,0.4);';
  if (mode === 'blocking') {
    return base + 'background:#7a1d1d;border-bottom:2px solid #c64141;';
  }
  if (mode === 'modal') {
    return base + 'background:#9a5b1d;border-bottom:2px solid #d6913a;';
  }
  return base + 'background:#3a4a6a;border-bottom:1px solid #5b7099;';
}

function bannerCopy(mode: SunsetBannerMode, sunsetDate: string): string {
  if (mode === 'blocking') {
    return `PRYZM 1 will be removed on ${sunsetDate}. You must migrate now to continue using your projects.`;
  }
  if (mode === 'modal') {
    return `PRYZM 1 will be removed on ${sunsetDate}. Please migrate soon — see the migration help link.`;
  }
  return `PRYZM 1 will be removed on ${sunsetDate} (90-day sunset). Migration help available at the link.`;
}

/**
 * Mount (or refresh) the sunset banner inside `opts.container`
 * (default `document.body`).  Idempotent: a second call with the same
 * `elementId` reuses the existing element rather than mounting a
 * duplicate.  Returns a handle whose `dismiss()` removes the banner.
 */
export function paintSunsetBanner(opts: PaintSunsetBannerOptions = {}): SunsetBannerHandle {
  const container = opts.container ?? document.body;
  const elementId = opts.elementId ?? DEFAULT_ELEMENT_ID;
  const mode: SunsetBannerMode = opts.mode ?? 'banner';
  const sunsetDate = opts.sunsetDate ?? defaultSunsetDate();
  const migrationUrl = opts.migrationUrl ?? DEFAULT_MIGRATION_URL;

  let banner = container.ownerDocument?.getElementById(elementId) as HTMLElement | null;
  const isNew = banner === null;
  if (banner === null) {
    banner = document.createElement('div');
    banner.id = elementId;
  }
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'polite');
  banner.setAttribute('data-pryzm1-sunset-mode', mode);
  banner.style.cssText = bannerStyle(mode);

  const messageSpan = document.createElement('span');
  messageSpan.textContent = bannerCopy(mode, sunsetDate);
  messageSpan.style.flex = '1';

  const link = document.createElement('a');
  link.href = migrationUrl;
  link.textContent = 'Migration help →';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.cssText = 'color:#fff;text-decoration:underline;font-weight:600;';

  // Dismiss button only for non-blocking modes.
  let dismissBtn: HTMLButtonElement | null = null;
  if (mode !== 'blocking') {
    dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss sunset banner for this session');
    dismissBtn.style.cssText =
      'background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.5);' +
      'padding:6px 14px;border-radius:4px;cursor:pointer;font:inherit;';
    dismissBtn.onclick = (): void => handle.dismiss();
  }

  banner.replaceChildren(messageSpan, link, ...(dismissBtn === null ? [] : [dismissBtn]));

  if (isNew) container.appendChild(banner);

  const handle: SunsetBannerHandle = {
    element: banner,
    dismiss(): void {
      if (banner !== null && banner.parentNode !== null) {
        banner.parentNode.removeChild(banner);
      }
    },
  };
  return handle;
}
