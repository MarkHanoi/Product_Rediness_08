// ViewChip — small DOM helper used by PeerListPanel and the view-tab strip.
//
// Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S44 D5
//   "view chip UI + active-tool indicator".

export interface ViewChipOptions {
  /** Text to show inside the chip. */
  readonly viewLabel: string;
  /** Visual kind — affects classname so callers can style differently
   *  (view vs tool).  Default 'view'. */
  readonly kind?: 'view' | 'tool';
}

/** Build a chip <span>.  Pure — no transport, no awareness coupling. */
export function renderViewChip(opts: ViewChipOptions): HTMLElement {
  const kind = opts.kind ?? 'view';
  const el = document.createElement('span');
  el.className = `pryzm-chip pryzm-chip--${kind}`;
  el.textContent = opts.viewLabel;
  el.setAttribute('data-chip-kind', kind);
  return el;
}
