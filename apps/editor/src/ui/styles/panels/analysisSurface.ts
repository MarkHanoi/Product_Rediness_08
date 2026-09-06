/**
 * @file apps/editor/src/ui/styles/panels/analysisSurface.ts
 *
 * Analysis surface — anl- prefix. The F4 workspace mode's right-hand half.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 *
 * ⛔ EVERY COLOUR HERE IS A TOKEN. `tokens.ts:276-277`: *"Adding a value here is
 * the ONLY sanctioned way to introduce a colour to a panel. If a role is
 * missing, add the role — do not inline the hex."* This sheet holds ZERO hex
 * literals and ZERO `var(--x, fallback)` forms — a fallback can never fire
 * (AppTheme concatenates DESIGN_TOKENS ahead of every panel sheet) and a dead
 * fallback that disagrees with its token is a second palette kept alive in
 * code. §PANEL-BRAND-STANDARD ARMS A/B/C enforce all three.
 *
 * ⛔ NO BLACK. `--app-canvas-bg` (#0d1117) is the 3-D canvas and never appears
 * in a panel; every shadow here is on the blue-ink axis, not rgba(0,0,0,·).
 */
export const ANALYSIS_SURFACE_STYLES = `

/* ═══════════════════════════════════════════════════════════════════════════
   ANL — root. Fixed right 50%, exactly as #aud-stack does for Inspect. The
   canvas keeps the left half (WorkspaceController reads the mode registry's
   canvas: 'half'), because every widget here is a SELECTOR.
   ═══════════════════════════════════════════════════════════════════════════ */

#anl-surface {
  position: fixed;
  top: 0;
  right: 0;
  width: 50%;
  height: 100%;
  z-index: 50;
  display: none;
  flex-direction: column;
  background: var(--app-panel-bg);
  border-left: 1px solid var(--app-border);
  overflow: hidden;
  pointer-events: auto;
  font-family: var(--app-font);
}

#anl-surface.anl-surface--visible { display: flex; }

.anl-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--app-bg);
  /* §GRAPH-EXPAND (L-12062) — kept 'position: relative' for the same reason it
     was added: not 'position: fixed' against the viewport (this panel owns the
     right 50%, the 3-D model owns the left — ADR-0343 §D.1 reason 2), and not
     absent (an un-positioned ancestor would push the search further up the
     tree, past the surface entirely).

     ⚠ CORRECTED 2026-08-26 (§SCROLL136, L-12201 — founder: "bring the graph a
     bit down"). This comment used to say the expanded stage's containing block
     "must be THIS element". It no longer is: '.anl-grid-viewport' (below,
     wrapping '.anl-grid') is NOW the nearer positioned ancestor, and is what
     the stage actually fills — see that rule for why a THIRD container was
     needed rather than just moving 'position: relative' onto '.anl-grid'
     itself. This element stays positioned regardless, in case anything else
     ever needs the panel as a reference (nothing currently does). */
  position: relative;
}

/* ═══════════════════════════════════════════════════════════════════════════
   HEADER — and the 44 px at the top of it is a MEASURED RESERVE, not padding
   §ANALYSIS-HEADER-OCCLUDED (L-3600)
   ═══════════════════════════════════════════════════════════════════════════

   ⛔ THE DEFECT, MEASURED 2026-08-22, AND THE CENSUS OF IT WAS WRONG TWICE.
   '#anl-surface' is 'position: fixed; top: 0' at 'z-index: 50'. Always-on shell
   chrome is ALSO fixed at the top of the viewport, at a FAR higher z-index, and
   reaches into the right-hand half this panel owns. The FIRST census named two:

     .wmb-toplevel-wrapper  top: 6px   z-index: 200   -> bottom edge y = 36
         (SaveUndoRedoHUD + Author|Inspect|Analysis|Data + the level pill)
         styles/panels/platform-shell/workspaceModeBar.ts
     .cp-presence-strip     top: 8px  right: 8px  z-index: 9990  -> y = 36
         Collaborator chips, 28 px tall, in the panel's top-RIGHT corner --
         where '+ Add widget' / refresh / reset / info live.
         styles/panels/collaborativePresence.ts:21-46

   ⭐ IT MISSED THE ONE THE FOUNDER WAS LOOKING AT. '.ceb-bar' -- the editor
   toolbar: undo, redo, move, copy, delete and the drafting icons -- is
   'position: fixed; top: 56px' at z-index 8990 with 30px circular '.ceb-btn'
   children, so it occupies y = 56..86. A 44px reserve derived from occluders
   that bottom out at 36 never had a chance of clearing it. L-3601 moved the
   MODE BAR out of the way and the founder's screenshot was unchanged, because
   the mode bar was not what was on the title.
   platform-shell/contextualEditBar.ts:9-20

   ⚠ NOT AN OCCLUDER, and it was the first suspect: '.plat-toolbar' (fixed, top:
   0, left: 50%, z-index 9000). It is DETACHED FROM THE DOCUMENT — §L-MOUNT-DETACH,
   PlatformProjectBrowser.ts:101-140, a founder decision of 2026-08-14 — so it
   cannot overlap anything. C01 §6 rule 6: ABSENT and UNREACHABLE have opposite
   fixes, and this one is absent.

   ⭐ THE FIX IS THE SHELL'S, AND IT IS NOT A FIFTH RESERVE. §SHELL-FLOAT-BUDGET
   (L-4010..L-4016) publishes '--shell-canvas-cx' from the 'canvas' column of
   WORKSPACE_MODES; every canvas-anchored bar -- the mode bar, the CEB, the
   bottom action menu, the drawing and stair HUDs, the tool-HUD pills, the
   Inspect lens and explode bars -- centres on THAT instead of on the viewport.
   In a half-canvas mode they are all over the canvas half and NONE of them
   reaches this panel. That replaced five hand-written 'left: 25%' rules, of
   which the L-3601 one used to live at the bottom of this very file.

   THE NUMBER, AND WHAT IT NOW MEANS. The reserve is still 44px and it is now a
   ONE-OCCLUDER reserve:
     mode bar / CEB / HUDs               BUDGETED -- contribute 0
     .cp-presence-strip  8 + 28  = 36 px  ANCHORED RIGHT -- cannot be budgeted
   'right: 8px' is measured from the viewport's right edge, which IS this panel's
   right edge; there is no canvas on that side to re-centre it over, so a
   horizontal budget cannot touch it. Reserve = 36 + 8 clearance = 44 px.
   At the 768 px breakpoint the reserve stays 56 px, sized for the taller mobile
   mode bar -- deliberately kept: on a phone-width viewport the half-canvas modes
   collapse and the budget stops separating the two halves, so the mobile arm
   remains sized for the un-budgeted case. That is a floor, not a contradiction.
   ⚠ Those inputs are PINNED by analysisHeaderReserve.spec.ts -- move one of them
   and the test names this block, rather than the panel silently re-breaking.
   ⛔ NOT a custom property: ARM C of §PANEL-BRAND-STANDARD resolves every
   'var(--x)' in this sheet against tokens.ts, and a sheet-local property is
   undeclared there by construction. The literal carries its derivation instead.

   ── Visual language: the founder's second request, and it is Inspect's ────────
   'it should look similar to Inspect … same UI design, colours and principles'.
   So the header is now the SAME treatment '#aud-stack' uses (auditStack.ts:38-56):
   the brand gradient plate, 'var(--app-on-accent)' text, uppercase tracking, the
   header shadow, and header buttons on the on-accent veil rather than bordered
   panel chips. Same tokens, same roles — no second palette (§PANEL-BRAND-STANDARD).
   It also makes the reserve read as deliberate: the floating white pills sit on a
   purple plate, the way they sit on the canvas in Author mode.
   ─────────────────────────────────────────────────────────────────────────── */

.anl-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  height: auto;
  background: var(--app-gradient);
  box-shadow: var(--app-shadow-header);
  color: var(--app-on-accent);
  font-weight: 700;
  letter-spacing: 0.10em;
  /* ⭐ THE RESERVE, AND IT IS A BORDER RATHER THAN PADDING ON PURPOSE.
     C06 §6.1 tabulates 'padding: 14px 16px 12px' as THE shared metric of the
     three mode-surface headers, read from '.aud-header' at test time by
     'dataPanelChrome.spec.ts' ARM C and by the arm in this lane's
     'analysisHeaderReserve.spec.ts'. Folding the shell reserve into that value
     would make Analysis disagree with the reference on a number that is not
     about Analysis at all -- the reserve is shell OCCUPANCY, not header inset,
     and the two must be able to move independently.
     A transparent top border is the reserve: 'background-clip' defaults to
     'border-box', so the brand gradient paints continuously THROUGH it and the
     band reads as one header rather than a strip above one. The tabulated six
     properties stay byte-identical to Inspect.

     ⚠⚠ CORRECTED 2026-08-22 (§ANALYSIS-RESERVE-IS-RIGHT-EDGE-ONLY, L-4900) —
     founder: 'the heading has too much space gap on the top'. HE IS RIGHT, AND
     THE RESERVE WAS NOT WRONG, IT WAS APPLIED IN THE WRONG PLACE.

     The reserve exists for ONE occluder. §SHELL-FLOAT-BUDGET retired the mode
     bar's contribution, and the derivation note further down already records
     that what remains is '.cp-presence-strip' alone: 'position: fixed; top: 8px;
     RIGHT: 8px' with 28px chips, so it bottoms out at 36 and the reserve is
     36 + 8 = 44.

     ⭐ BUT THAT STRIP IS ANCHORED TO THE RIGHT EDGE AND IS ~100px WIDE. It can
     only ever cover the four header BUTTONS. Reserving 44px across the FULL
     WIDTH pushed the ANALYSIS title and its subtitle down by 44px to clear
     something that was never above them — which is the gap he is pointing at.
     A one-occluder reserve must be one-occluder WIDE as well as one-occluder
     tall; the previous correction fixed the height derivation and left the
     horizontal extent unexamined.

     The reserve now sits on '.anl-header-actions' only. The six tabulated C06
     §6.1 properties are still byte-identical to '.aud-header' — this moves a
     reserve OFF the header, it does not change the header's own metric. */
}

.anl-title-wrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }

.anl-title {
  font-size: 11.7px;
  /* C06 §6.1 tabulates 700 / 0.10em, read from '.aud-header'. It was 800 here,
     which is the same half-step of drift that put the Data header at 44px. */
  font-weight: 700;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--app-on-accent);
}

.anl-title-sub {
  font-size: 9.9px;
  line-height: 1.45;
  color: var(--app-on-accent-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* §ANALYSIS-RESERVE-IS-RIGHT-EDGE-ONLY (L-4900) — the shell reserve lives HERE,
   not on the header, because '.cp-presence-strip' is anchored 'right: 8px' and
   can only ever occlude these four buttons. 36 = the strip's bottom edge
   (top 8 + chip 28); the extra 8 is the same clearance the old full-width
   reserve carried. Derived, not typed: see 'analysisHeaderReserve.spec.ts',
   which reads both numbers out of 'collaborativePresence.ts' at test time so a
   chip resize moves the reserve instead of silently re-occluding the buttons. */
.anl-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-top: 44px;
  align-self: flex-start;
}

.anl-header-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--app-radius-sm);
  background: var(--app-on-accent-veil);
  color: var(--app-on-accent);
  font-family: var(--app-font);
  font-size: 10.8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.anl-header-btn:hover { background: var(--app-on-accent-veil-hover); }
.anl-header-btn:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }
/* §DEMO141 (L-12301) — the presentation-mode toggle's PRESSED state. Inverted
   fg/bg, the same idiom '.anl-scope-chip--on' uses one selector below, so a
   reader who already knows that convention recognises this one for free. */
.anl-header-btn--on { background: var(--app-on-accent); color: var(--app-accent); }
.anl-header-btn--on:hover { background: var(--app-on-accent); }

/* ── Status strip ───────────────────────────────────────────────────────── */

/* Three children now, not two (the tab lede folded in), so 'space-between' is
   wrong -- it would centre the trust statement between the lede and the note.
   The note is pushed right on its own. */
.anl-status {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 7px 16px;
  background: var(--app-surface-sunken);
  border-bottom: 1px solid var(--app-border-light);
  font-size: 9.9px;
  color: var(--app-text-muted);
}
.anl-status--warn {
  background: var(--app-status-warning-bg);
  border-bottom-color: var(--app-status-warning-line);
  color: var(--app-status-warning-ink);
}
.anl-status-note { flex-shrink: 0; margin-left: auto; font-style: italic; }

/* ── Grid ───────────────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════════════
   §SCROLL136 (L-12201) — 'bring the graph a bit down' (founder, expanded ⤢ view)
   ═══════════════════════════════════════════════════════════════════════════

   ⛔ THE DEFECT. '.anl-graph-stage--expanded' is 'position: absolute; inset: 0'
   against '.anl-panel' — which spans the WHOLE panel, top edge included. That
   put the expanded stage's OWN top content (the honesty pin, the toolbar) at
   y=0, directly under '.anl-header' + '.anl-tabs' + '.anl-facets' + '.anl-
   status' — all of which are normal-flow siblings occupying that same span,
   painted first and then covered by the stage's opaque background at a higher
   z-index. The founder's screenshot is that collision: the toolbar strip
   overlapping the card's own caveat text.

   ⭐ THE FIX IS A WRAPPER, NOT A MEASURED OFFSET. '.anl-grid-viewport' is a NEW,
   NON-SCROLLING element that takes over '.anl-grid's old job of being the
   'flex: 1 1 auto' region below the header/tabs/facets/status — sized by
   ordinary flex layout to EXACTLY the space left after them, with zero pixel
   math anywhere. '.anl-grid' moves inside it and keeps its own scrolling
   ('overflow-y: auto') unchanged; the wrapper does not scroll.

   Making '.anl-grid-viewport' 'position: relative' — rather than putting
   'position: relative' on '.anl-grid' itself — is what lets
   '.anl-graph-stage--expanded' (unchanged CSS: still 'inset: 0') resolve
   against a box that is EXACTLY the visible area below the chrome:
     · it cannot be '.anl-grid': that box SCROLLS, and an 'inset: 0' child of a
       scroll container sizes against the scrolled CONTENT box, not the visible
       viewport — precisely the trap the original §GRAPH-EXPAND comment (on
       '.anl-panel', above) already named for '.anl-grid'. This wrapper exists
       so that reasoning has somewhere to point that is NOT the whole panel.
     · '.anl-panel' still WORKS as a containing block (nothing here breaks it —
       it stays 'position: relative'), but it is no longer the NEAREST one, so
       it is no longer the one the stage actually resolves against.
   Verified by measurement (a real Chromium render, not asserted from CSS text
   alone) at a 1600×900 viewport, 800px-wide panel: chrome above the wrapper
   (header 94 + tabs 36 + facets 47 when a filter is active + status 28) = 205;
   the wrapper's own box was exactly (900 − 205) = 695 tall, and the expanded
   stage filled precisely that — not the panel's full 900. See
   'widgetRenderers.ts' (§GRAPH-EXPAND-HEIGHT, same lane) for why the graph's
   OWN height also had to change once the box it fills got correctly smaller. */

.anl-grid-viewport {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.anl-grid {
  height: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 14px 16px 24px;
  overflow-y: auto;
  align-content: start;
}

/* ── Card ───────────────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════════════
   §SCROLL136 (L-12200) — each PANE scrolls on its own, as Inspect's does
   ═══════════════════════════════════════════════════════════════════════════

   Founder: "as we have in the Inspect tree — I requested bars on the
   right-hand side to be able to scroll down the information in each pane."

   ⛔ THE DEFECT. '.anl-grid' has had 'overflow-y: auto' since it shipped — but
   that scrolls the WHOLE tab, all cards together, past a card's own head. A
   tall card (a wide quantity table, the relationship graph's category tree)
   grew '.anl-card' to its full content height (no bound existed), stretched
   its ROW to match, and the only way to read past the fold was to scroll the
   card's TITLE off screen along with everything else on the tab.

   ⭐ THE FIX MIRRORS '.aud-project-tree' (Inspect's PROJECT BROWSER pane,
   auditStack.ts) rather than inventing a second shape for it (C84 EI-9): a
   BOUNDED outer box, a head pinned by 'flex-shrink: 0', and a body that is the
   scroll container — 'flex: 1 1 auto' + 'min-height: 0' (the load-bearing pair
   Inspect's own comment names) + 'overflow-y: auto'. Inspect bounds its pane
   with an explicit max-height because its section is itself 'flex: 0 0 auto'
   inside a parent that does not hand it a definite size; '.anl-card' is a GRID
   item, so 'max-height' alone is enough here — there is no equivalent collapse
   to guard against.

   ⛔ NO NEW SCROLLBAR LOOK IS DECLARED ANYWHERE IN THIS FILE. The styled thumb
   ('#c4cde0', 4px, rounded) is already a UNIVERSAL rule — tokens.ts's
   '* { scrollbar-width: thin; scrollbar-color: ... } *::-webkit-scrollbar
   {...}' (§05 §2.3 Rule 7) — which is exactly what Inspect's tree ALSO relies
   on; neither surface carries a bespoke scrollbar rule of its own. Adding one
   here would be a second, rival scrollbar treatment beside the one every other
   panel already inherits — 'analysisScrollPane.spec.ts' fails if this file
   ever declares its own '::-webkit-scrollbar'.

   ⚠ DOES NOT TOUCH THE RELATIONSHIP GRAPH'S EXPAND MODE (§GRAPH-EXPAND,
   L-12062, lane ANALYZE129). '.anl-graph-stage--expanded' is 'position:
   absolute; inset: 0' against its nearest POSITIONED ancestor — '.anl-grid
   -viewport' (§SCROLL136 L-12201, further down this file; it used to be
   '.anl-panel' directly, see that rule's own comment). Neither '.anl-card' nor
   '.anl-card-body' below gains a 'position' — an overflow:hidden/auto box that
   is NOT itself a positioned ancestor does not clip an absolutely-positioned
   descendant whose containing block escapes further up the tree (verified
   empirically against this exact shape — bounded overflow:hidden card,
   overflow-y:auto body, non-scrolling position:relative wrapper — before this
   landed: the escapee still fills the wrapper, not the small card). Do not add
   'position: relative' to either rule below; that would make ONE OF THEM the
   containing block instead and the graph would expand to fill a small card
   rather than the grid's own visible area. */

.anl-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  box-shadow: var(--app-shadow-card);
  overflow: hidden;
  /* Bounds the PANE. A card whose content fits comfortably under this never
     shows a scrollbar at all — 'overflow-y: auto' on the body below only
     activates once content actually exceeds the space the head leaves it. */
  max-height: 66vh;
}
.anl-card--wide { grid-column: 1 / -1; }

.anl-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 13px 9px;
  border-bottom: 1px solid var(--app-border-light);
  /* The OUTER CHROME that must stay visible while the body scrolls — the
     per-pane analogue of '.aud-section-header' staying put over Inspect's
     scrolling tree. Flex items default to 'flex-shrink: 1'; without this, a
     card whose body overflows would squeeze the HEAD instead of scrolling the
     body, once the card itself is height-bounded. */
  flex-shrink: 0;
}

.anl-card-headline { min-width: 0; display: flex; flex-direction: column; gap: 3px; }

.anl-card-title {
  margin: 0;
  font-size: 11.7px;
  font-weight: 700;
  color: var(--app-text);
  line-height: 1.3;
}

.anl-card-sub {
  margin: 0;
  font-size: 9.9px;
  line-height: 1.5;
  color: var(--app-text-muted);
}

.anl-card-tools { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.anl-icon-btn {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text-muted);
  font-size: 11px;
  cursor: pointer;
}
.anl-icon-btn:hover { background: var(--app-wash-hover); color: var(--app-accent); }
.anl-icon-btn:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

.anl-card-body {
  padding: 12px 13px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  /* §SCROLL136 (L-12200) — THE SCROLL CONTAINER. 'flex: 1 1 auto' claims
     whatever height '.anl-card-head' (pinned, above) does not, and
     'min-height: 0' is the load-bearing override this file's header comment
     names: a flex item's automatic minimum size is its CONTENT size unless
     told otherwise, which would let the body grow past the card's
     'max-height' instead of scrolling. '.aud-content-zone' (Inspect's own
     scrolling content region) reaches the same result via 'overflow-y: auto'
     alone, because the CSS overflow spec zeroes the automatic minimum for any
     box whose overflow is not 'visible' — this states the same thing
     explicitly rather than resting on that rule silently, so a reviewer (and
     'analysisScrollPane.spec.ts') can read the invariant off the declaration. */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.anl-card-foot {
  padding: 7px 13px 9px;
  border-top: 1px solid var(--app-border-light);
  background: var(--app-surface-sunken);
  font-size: 9px;
  line-height: 1.5;
  color: var(--app-text-muted);
}

/* ── Badges + strips (the four states, made visible) ────────────────────── */

.anl-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 99px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.anl-badge--ok   { color: var(--app-status-success-ink); background: var(--app-status-success-bg); }
.anl-badge--warn { color: var(--app-status-warning-ink); background: var(--app-status-warning-bg); }
.anl-badge--err  { color: var(--app-status-error-ink);   background: var(--app-status-error-bg);   }
/* §DEMO141 (L-12301) — presentation mode's compact lower-bound marker. NOT the
   warn plate: the whole point is that it reads as clean, not as a warning, so
   it takes the same quiet ink/ground the card foot already uses rather than
   the amber pair above. */
.anl-badge--muted { color: var(--app-text-muted); background: var(--app-surface-sunken); }

.anl-strip {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--app-radius-sm);
  border-left: 3px solid var(--app-status-warning-line);
  background: var(--app-status-warning-bg);
}
.anl-strip--warn { border-left-color: var(--app-status-warning-line); background: var(--app-status-warning-bg); }
.anl-strip--err  { border-left-color: var(--app-status-error-line);   background: var(--app-status-error-bg);   }
/* ⛔ ADDED 2026-08-22 (§ANALYSIS-OK-STRIP-READ-AS-WARNING, L-3603). 'renderGraph()'
   has always emitted 'anl-strip anl-strip--ok' for a HEALTHY liveness sentence,
   and this sheet had no such rule — so the bare '.anl-strip' base applied and a
   graph reporting 'LIVE — maintained off the StoreEventBus' rendered in amber on
   the warning plate, identical to a truncation warning. On a surface whose whole
   claim is that a warning means something, a permanent false amber is the fastest
   way to teach a reader to discount the real ones. */
.anl-strip--ok   { border-left-color: var(--app-status-success-line); background: var(--app-status-success-bg); }
.anl-strip-text { font-size: 10.8px; line-height: 1.6; color: var(--app-text); }
.anl-strip--err .anl-strip-text  { color: var(--app-status-error-ink); }
.anl-strip--warn .anl-strip-text { color: var(--app-status-warning-ink); }
.anl-strip--ok .anl-strip-text   { color: var(--app-status-success-ink); }

.anl-note {
  margin: 0;
  font-size: 9.9px;
  line-height: 1.6;
  color: var(--app-text-muted);
}

.anl-lede {
  margin: 0;
  font-size: 10.8px;
  line-height: 1.65;
  color: var(--app-text-2);
}

/* ── Empty state — a real answer, never a zeroed chart ─────────────────── */

.anl-empty {
  padding: 18px 14px;
  border: 1px dashed var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-sunken);
  font-size: 10.8px;
  line-height: 1.65;
  color: var(--app-text-2);
}
.anl-empty p { margin: 0; }
.anl-empty--page { grid-column: 1 / -1; }

/* ── KPI ────────────────────────────────────────────────────────────────── */

.anl-kpi-row { display: flex; gap: 10px; flex-wrap: wrap; }

.anl-kpi {
  flex: 1 1 120px;
  padding: 12px 14px;
  border-radius: var(--app-radius-sm);
  background: var(--app-violet-soft);
}

.anl-kpi-value {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--app-accent);
  font-variant-numeric: tabular-nums;
}
.anl-kpi-value--warn { color: var(--app-status-warning-ink); }

.anl-kpi-label {
  margin-top: 3px;
  font-size: 9.9px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}

/* ── Chart canvas ──────────────────────────────────────────────────────── */

.anl-canvas-wrap { position: relative; width: 100%; height: 190px; }
.anl-canvas-wrap canvas { width: 100% !important; height: 100% !important; }

/* ── Legend — this is what stops hue being the only channel ─────────────── */

.anl-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }

.anl-legend-item {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 7px;
  padding: 3px 5px;
  border-radius: var(--app-radius-sm);
  cursor: pointer;
  font-size: 10.8px;
  color: var(--app-text-2);
}
.anl-legend-item:hover { background: var(--app-wash-hover); color: var(--app-text); }
.anl-legend-item:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

.anl-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 1px solid var(--app-panel-bg);
  box-shadow: 0 0 0 1px var(--app-border);
  display: inline-block;
}

.anl-legend-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.anl-legend-value { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--app-text); }
.anl-legend-pct   { font-variant-numeric: tabular-nums; color: var(--app-text-muted); }

/* ── Tables ────────────────────────────────────────────────────────────── */

.anl-table { width: 100%; border-collapse: collapse; font-size: 10.8px; }
.anl-table th {
  text-align: left;
  padding: 5px 7px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--app-border);
}
.anl-table td {
  padding: 6px 7px;
  border-bottom: 1px solid var(--app-border-light);
  vertical-align: top;
  color: var(--app-text-2);
}
.anl-td-key    { color: var(--app-text); font-weight: 600; }
.anl-td-num    { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; color: var(--app-text); font-weight: 600; }
.anl-td-note   { font-size: 9.9px; line-height: 1.55; color: var(--app-text-muted); }
.anl-td-swatch { width: 18px; }

.anl-row-clickable { cursor: pointer; }
.anl-row-clickable:hover td { background: var(--app-wash-hover); }
.anl-row-clickable:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

.anl-qualifier { margin-top: 3px; font-size: 9px; color: var(--app-status-warning-ink); line-height: 1.5; }

/* ── Treemap ───────────────────────────────────────────────────────────── */

.anl-treemap {
  position: relative;
  width: 100%;
  height: 260px;
  border-radius: var(--app-radius-sm);
  overflow: hidden;
  background: var(--app-surface-sunken);
}

.anl-tile {
  position: absolute;
  border: 1px solid var(--app-panel-bg);
  box-sizing: border-box;
  overflow: hidden;
  cursor: pointer;
}
.anl-tile:hover  { filter: brightness(1.06); }
.anl-tile:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

.anl-tile-cap {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 6px;
  background: var(--app-panel-glass);
  margin: 3px;
  border-radius: 3px;
  max-width: calc(100% - 6px);
}
.anl-tile-label {
  font-size: 9.9px;
  font-weight: 700;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.anl-tile-value {
  font-size: 9px;
  color: var(--app-text-2);
  font-variant-numeric: tabular-nums;
}

/* ── NOT BUILT card ────────────────────────────────────────────────────── */

.anl-nb { display: flex; flex-direction: column; gap: 8px; }
.anl-nb-lede { margin: 0; font-size: 11.7px; line-height: 1.7; color: var(--app-text); }
.anl-nb-h {
  margin: 6px 0 0;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}
.anl-nb-list { margin: 0; padding-left: 17px; display: flex; flex-direction: column; gap: 5px; }
.anl-nb-list li { font-size: 10.8px; line-height: 1.65; }
.anl-nb-list--have li { color: var(--app-text-muted); }
.anl-nb-list--need li { color: var(--app-text); }
.anl-nb-list code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.9px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--app-violet-soft);
  color: var(--app-accent);
}
.anl-nb-close {
  margin: 6px 0 0;
  padding: 10px 12px;
  border-left: 3px solid var(--app-accent);
  background: var(--app-violet-soft);
  font-size: 10.8px;
  line-height: 1.7;
  color: var(--app-text);
}
.anl-nb-foot { margin: 0; font-size: 9px; line-height: 1.6; color: var(--app-text-muted); }

/* ── Picker / provenance sheet ─────────────────────────────────────────── */

/* ⚠ 'top' CARRIES THE 44 px RESERVE TOO (§ANALYSIS-HEADER-OCCLUDED, L-3600).
   The sheet is 'position: absolute' inside '#anl-surface', which is the fixed
   containing block, so its offset is measured from the panel's own top edge —
   the same edge the shell chrome sits on. It was 54 (just under the old header);
   98 = 54 + 44 keeps it just under the new one instead of underneath the mode
   bar, and the max-height loses the same 44 so the sheet still ends above the
   panel's bottom rather than overflowing it. */
.anl-picker {
  position: absolute;
  top: 98px;
  right: 16px;
  left: 16px;
  max-height: calc(100% - 134px);
  overflow-y: auto;
  z-index: 5;
  padding: 12px 13px;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  box-shadow: var(--app-shadow-modal);
}

.anl-picker-head {
  font-size: 11.7px;
  font-weight: 800;
  color: var(--app-text);
  margin-bottom: 4px;
}

.anl-picker-note {
  margin: 0 0 10px;
  font-size: 9.9px;
  line-height: 1.6;
  color: var(--app-text-muted);
}

.anl-picker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 8px 9px;
  margin-bottom: 4px;
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-sm);
  background: var(--app-panel-bg);
  text-align: left;
  cursor: pointer;
  font-family: var(--app-font);
}
.anl-picker-row:hover:not(:disabled) { background: var(--app-wash-hover); border-color: var(--app-accent); }
.anl-picker-row:disabled { opacity: 0.45; cursor: default; }
.anl-picker-row--static { cursor: default; }
.anl-picker-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.anl-picker-label { font-size: 10.8px; font-weight: 700; color: var(--app-text); }
.anl-picker-sub { font-size: 9px; line-height: 1.5; color: var(--app-text-muted); }

/* ── Narrow viewports — one column rather than two half-width slivers ──── */

@media (max-width: 1100px) {
  .anl-grid { grid-template-columns: minmax(0, 1fr); }
  .anl-card--wide { grid-column: 1 / -1; }
}

/* ── The reserve grows with the chrome it clears (§ANALYSIS-HEADER-OCCLUDED) ──
   'workspaceModeBar.ts:73-84' gives '.wmb-btn' a 'min-height: 36px' at this
   exact breakpoint (MOB-001-SC), so the bar becomes 3 + 36 + 3 = 42 px and its
   lowest edge moves from 36 to 48. Reserve 56 = 48 + 8. This media query exists
   BECAUSE that one does; if the mobile mode bar is ever re-sized, both move. */
@media (max-width: 768px) {
  /* §ANALYSIS-RESERVE-IS-RIGHT-EDGE-ONLY (L-4900) — was '.anl-header
     { border-top-width: 56px }'. The reserve moved to the actions cluster, so
     the responsive arm moves with it or the buttons re-occlude on mobile. */
  .anl-header-actions { margin-top: 56px; }
  .anl-picker { top: 110px; max-height: calc(100% - 146px); }
}

/* ── The relationship graph (ADR-0343 D.7, STR-14 4) ──────────────────────
 *
 * Every colour here is a TOKEN. The node fills and edge strokes come from
 * seriesColour() -> --app-cat-1..8, the CVD-simulated categorical scale whose
 * first value is the PRYZM purple #6600FF. Nothing on this card is black:
 * text is --app-text / --app-text-2, the plate is --app-surface-sunken.
 *
 * The SVG scrolls inside its own box rather than widening the card, so a dense
 * graph never makes the panel scroll sideways. */

.anl-nodelink-box {
  overflow-x: auto;
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-sunken);
  padding: 4px;
}
/* §GRAPH154 (L-12560..) — 'height: 100%' replaces 'height: auto'. The box now
   gets an EXPLICIT pixel height from 'widgetRenderers.ts' ('box.style.height'),
   and the viewBox's own height grows to match (see 'extent2dHeight' there), so
   the SVG fills that box rather than deriving its own height from its width
   via the intrinsic viewBox aspect ratio and leaving a gap under a floor. */
.anl-nodelink { display: block; width: 100%; min-width: 420px; height: 100%; }
.anl-nodelink g[role='button']:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
.anl-nodelink g[role='button']:hover circle { stroke: var(--app-accent); stroke-width: 2.5; }

.anl-nodelink-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 8px;
  font-size: 9px;
  color: var(--app-text-2);
}
.anl-nodelink-legend-row { display: inline-flex; align-items: center; gap: 5px; }
.anl-nodelink-swatch {
  width: 9px;
  height: 3px;
  border-radius: 2px;
  display: inline-block;
  flex: 0 0 auto;
}

/* -- Tab strip §ANALYSIS-TABS (L-3304) --------------------------------------
   Sixteen widgets on one scroll was the founder's report. The strip sits between
   the header and the status line because the status line reports the TAB, not
   the surface -- putting it above would make it read as a claim about all four.
   NO BACKTICKS IN THIS BLOCK: it lives inside a template literal, and a backtick
   in a CSS comment terminates the literal mid-file. That is what broke this file
   on the first attempt, and it is the same trap that ate two commit messages
   earlier in this session. */
.anl-tabs {
  display: flex;
  align-items: stretch;
  gap: 2px;
  padding: 0 14px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-bg);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.anl-tabs::-webkit-scrollbar { display: none; }

.anl-tab {
  appearance: none;
  border: none;
  background: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px 8px;
  font-family: var(--app-font);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--app-text-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  white-space: nowrap;
  transition: color 0.13s, border-color 0.13s;
}
.anl-tab:hover { color: var(--app-text); }
.anl-tab--active {
  color: var(--app-accent);
  border-bottom-color: var(--app-accent);
}

.anl-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  background: var(--app-wash-hover);
  color: var(--app-text-muted);
}
.anl-tab--active .anl-tab-count {
  background: color-mix(in srgb, var(--app-accent) 14%, transparent);
  color: var(--app-accent);
}

/* A tab on which EVERY widget is a refusal card says so before it is opened.

   ⛔ CORRECTED 2026-08-22 (§ANALYSIS-TAB-CHIP-PHANTOM, L-3602). This rule shipped
   as 'var(--app-warn, #b45309)' twice and broke §PANEL-BRAND-STANDARD in all
   three of its hard-0 arms at once — ARM A (a raw hex), ARM B (a var() fallback),
   ARM C (a PHANTOM: '--app-warn' is declared nowhere in tokens.ts, so the neon
   fallback was what actually rendered). That is precisely the defect L-1740..
   L-1744 fixed and shipped a guard for, re-opened by the commit that added the
   tab strip. Measured: 'npx vitest run apps/editor/src/ui/styles/__tests__/
   panelBrandStandard.spec.ts' -> 3 failed, all naming this file, before this fix.
   The declared warning role is the '-bg / -line / -ink' triple. */
.anl-tab-nb {
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--app-status-warning-bg);
  color: var(--app-status-warning-ink);
}

/* ⚠ '.anl-tab-lede' WAS A BAND OF ITS OWN AND IS NOT ANY MORE (C06 §6.1,
   L-3642). The contract: 'A mode surface MUST reach its content in ONE chrome
   band plus, at most, one navigation row.' Analysis had four -- header, tab
   strip, tab lede, status strip. The lede and the status strip are BOTH
   per-tab statements about the same tab, so they are now one line: the lede
   leads, the computed trust statement follows it.
   ⛔ NOT ONE WORD OF THE TRUST STATEMENT WAS TRADED FOR THE ROOM. ADR-0343 §D.6
   requires it pinned and visible; a redesign that shortened it to fit a chrome
   rule would be the redesign that is wrong. The lede is now the ledeic half of
   the status line, and it is rendered in the muted ink it always had. */
.anl-status-lede { color: var(--app-text-2); font-weight: 600; }

/* ═══════════════════════════════════════════════════════════════════════════
   SERIES FOCUS — 'highlight this and the rest be a bit dormant' (L-3610)
   ═══════════════════════════════════════════════════════════════════════════

   The founder's sentence, and the CSS is the whole of it for every mark that is
   NOT a canvas. One rule set governs legend rows, table rows, treemap tiles,
   graph nodes and graph edges, because they all carry the same 'data-series'
   token list -- seriesFocus.ts. Chart.js paints into a canvas that CSS cannot
   reach, so the donut and the bar are re-tinted in TypeScript instead; the two
   halves are kept to one alpha constant so they cannot drift apart.

   ⛔ DORMANT, NOT GONE. Nothing here sets 'display:none' and nothing here sets
   'visibility:hidden'. Hiding the unpicked marks would leave a card whose
   denominator, legend totals and percentages describe a population the reader
   can no longer see -- a filtered chart under an unfiltered caption. Opacity
   changes emphasis; it does not change the answer.

   ⛔ NO TRANSITION ON THE DIM. A transition here would run an animation on
   every pick, and this surface must never be the reason a frame is dropped
   (P3, ADR-0343 D.3). The change is instant and costs one style recalculation.
   ═══════════════════════════════════════════════════════════════════════════ */

.anl-focus-on [data-series] {
  opacity: 0.28;
}
.anl-focus-on [data-series].anl-focused {
  opacity: 1;
}

/* The lit mark also gets a NON-COLOUR cue, because opacity alone is a contrast
   change and this surface never lets one channel carry an identity on its own
   (ADR-0343 D.5, WCAG SC 1.4.1). */
.anl-focus-on .anl-legend-item.anl-focused,
.anl-focus-on .anl-row-clickable.anl-focused td {
  background: var(--app-wash-selected);
}
.anl-focus-on .anl-tile.anl-focused {
  outline: 2px solid var(--app-accent);
  outline-offset: -2px;
}
.anl-focus-on .anl-nodelink g.anl-focused circle {
  stroke: var(--app-accent);
  stroke-width: 2.5;
}

/* A drill-down row inherits its parent figure's focus rather than declaring one:
   it is the SAME series, opened. */
.anl-drill-row { background: var(--app-surface-sunken); }

/* ═══════════════════════════════════════════════════════════════════════════
   SCOPE — a filter is not a truncation, and must not look like one (L-3620)
   ═══════════════════════════════════════════════════════════════════════════
   'anl-scope' is a NEUTRAL plate on the accent wash. The lower-bound strip is
   amber ('anl-strip--warn'). That difference is the founder's rule rendered:
   'filtered to Level 1' says what universe you asked for and every figure in it
   is exact; 'truncated at 60 nodes' says the tool could not deliver the universe
   you asked for and every figure is a floor. Same card, opposite meanings.
   ═══════════════════════════════════════════════════════════════════════════ */

.anl-scope {
  display: flex;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--app-radius-sm);
  border-left: 3px solid var(--app-accent);
  background: var(--app-violet-soft);
}
.anl-scope-text { font-size: 10.8px; line-height: 1.6; color: var(--app-text); }

.anl-scope-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.anl-scope-label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-text-muted);
  margin-right: 3px;
}
.anl-scope-chip {
  appearance: none;
  padding: 3px 10px;
  border: 1px solid var(--app-border);
  border-radius: 99px;
  background: var(--app-panel-bg);
  color: var(--app-text-2);
  font-family: var(--app-font);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.13s, color 0.13s, border-color 0.13s;
}
.anl-scope-chip:hover { border-color: var(--app-accent); color: var(--app-accent); }
.anl-scope-chip:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }
.anl-scope-chip--on {
  background: var(--app-accent);
  border-color: var(--app-accent);
  color: var(--app-on-accent);
}
.anl-scope-note { font-size: 9.9px; line-height: 1.55; color: var(--app-text-muted); }

/* ═══════════════════════════════════════════════════════════════════════════
   DRILL-DOWN + QUALIFIERS — 'more sound' quantities (L-3630, L-3631)
   ═══════════════════════════════════════════════════════════════════════════
   A quantity row can now be opened to the elements it measured, one chip per id,
   each individually selectable. And the qualifier -- 'N of M: raked wall (70.0)
   measured in its authored, un-sheared elevation plane' -- is promoted off the
   9 px footnote it used to be. It states that part of the row was measured
   APPROXIMATELY, which is the one fact a quantity surveyor must not miss.
   ⛔ Nothing is truncated or hidden here: the text is the same text, on a plate
   that reads as a qualification rather than as small print.
   ═══════════════════════════════════════════════════════════════════════════ */

.anl-td-drill { width: 22px; text-align: right; vertical-align: top; }

.anl-drill-toggle {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--app-text-muted);
  font-size: 10px;
  line-height: 1;
  padding: 3px 4px;
  border-radius: var(--app-radius-sm);
  cursor: pointer;
}
.anl-drill-toggle:hover { background: var(--app-wash-hover); color: var(--app-accent); }
.anl-drill-toggle:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

.anl-drill { display: flex; flex-direction: column; gap: 6px; padding: 8px 6px 10px; }
.anl-drill-head {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}
.anl-drill-ids { display: flex; flex-wrap: wrap; gap: 4px; }
.anl-drill-id {
  appearance: none;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 7px;
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-sm);
  background: var(--app-panel-bg);
  color: var(--app-text-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  cursor: pointer;
}
.anl-drill-id:hover { border-color: var(--app-accent); color: var(--app-accent); }
.anl-drill-id:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }
.anl-drill-foot { margin: 0; font-size: 9px; line-height: 1.55; color: var(--app-text-muted); }

.anl-qual {
  margin-top: 6px;
  padding: 7px 9px;
  border-left: 3px solid var(--app-status-warning-line);
  border-radius: var(--app-radius-sm);
  background: var(--app-status-warning-bg);
}
.anl-qual-badge {
  display: inline-block;
  margin-bottom: 4px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--app-status-warning-ink);
}
.anl-qual-list {
  margin: 0;
  padding-left: 15px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.anl-qual-list li {
  font-size: 9.9px;
  line-height: 1.55;
  color: var(--app-status-warning-ink);
}

/* The area-standard picker: the scope bar plus the sentence naming the standard
   the ledger under it is a ledger OF. Same chips, deliberately -- 'which storey'
   and 'which standard' are the same kind of control and must not grow two looks. */
.anl-std-picker { display: flex; flex-direction: column; gap: 6px; }


/* -- §MODE-BODY-CLASS-FOR-EVERY-MODE (L-3601) SUPERSEDED BY
   §SHELL-FLOAT-BUDGET (L-4010..L-4016), 2026-08-22 -------------------------

   This file used to end with:

       body.pryzm-mode-analysis .wmb-toplevel-wrapper { left: 25%; }

   It was correct and it was the SIXTH copy of one idea. 'inspectModeShell.ts'
   carried four of the same shape; this was the fifth; and the bar the founder
   was actually looking at -- '.ceb-bar', the editor toolbar with undo, redo,
   move, copy, delete and the drafting icons -- had none, in either mode. That
   is why the ANALYSIS header was STILL occluded after L-3601 moved the mode bar
   out of the way: the wrong occluder had been moved.

   The shell now publishes '--shell-canvas-cx' from the 'canvas' column of
   WORKSPACE_MODES and every canvas-anchored bar centres on it. A half-canvas
   mode is a ROW (ADR-0343 §D.1); this panel writes NO rule about anybody else's
   bar, which is the point -- a panel that has to re-position the shell's chrome
   is a panel doing the shell's accounting.

   ⚠ THE 44px RESERVE ON '.anl-header' STAYS, AND ITS DERIVATION HAS CHANGED.
   It was 'max(mode bar bottom 36, presence strip bottom 36) + 8'. The mode bar
   is now budgeted and contributes NOTHING. '.cp-presence-strip' is
   'top: 8px; right: 8px' -- anchored to the RIGHT EDGE, which no horizontal
   budget can move, because there is no canvas on that side to move it to. It
   still lands on the four header buttons at 8 + 28 = 36, so the reserve is
   still 36 + 8 = 44. THE NUMBER IS UNCHANGED AND THE REASON IS NOT: it is now
   a one-occluder reserve. 'analysisHeaderReserve.spec.ts' derives it, and the
   arm that used to pin the mode bar now pins that the mode bar is BUDGETED.
   NO BACKTICKS IN THIS BLOCK: it lives inside a template literal. */

/* == Facet bar (FEAT-ANALYSIS-FACET-CROSS-FILTER, L-6603) ==================
   The active cross-filter, always on screen while it is active.

   AN INVISIBLE FILTER IS A BUG GENERATOR. The cards on this surface keep
   printing the WHOLE model's figures -- a facet narrows the 3-D emphasis, never
   a denominator (ADR-0358 section 3) -- so a forgotten facet means a reader
   looking at "312 walls" while 47 of them are purple in the viewport and
   nothing on screen accounts for the difference. This band is what accounts
   for it.

   It uses the ACCENT token, which resolves to the PRYZM purple #6600FF -- the
   same colour DiagnosticMaterialManager paints the selected set with
   (ANALYSIS_SELECTED_COLOR). The chip and the elements it selected therefore
   read as one statement across the two halves of the screen. That is the only
   colour claim here: no new hue is minted, and the Inspect palette
   (INSPECT-FOCUS-IS-THE-ONLY-COLOUR, L-3511) is untouched.

   NO BACKTICKS IN THIS BLOCK: it lives inside a template literal. */
.anl-facets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px 14px;
  border-bottom: 1px solid var(--app-border);
  /* ⚠ CORRECTED 2026-08-26 (§ANALYZE129, L-12065). This read 'var(--app-wash)',
     and THERE IS NO SUCH TOKEN — the declared family is --app-wash-hover /
     -selected / -ring. An undefined custom property with no fallback makes the
     declaration invalid at computed-value time, so 'background' fell back to its
     initial value: the facet bar has had NO background since it shipped, and the
     rule that was supposed to give it one has been dead the whole time. Found by
     'panelBrandStandard.spec.ts' ARM C while this lane was adding fold styles to
     the same sheet.
     ⛔ Repointed at an EXISTING token rather than declaring '--app-wash'. Minting
     a token to satisfy a dangling reference makes the reference right and leaves
     nobody asking what the value should be; '--app-violet-soft' is the soft
     accent band this sheet already uses for '.anl-scope', which is the same
     "you are looking at a narrowed universe" role the facet bar plays. */
  background: var(--app-violet-soft);
  flex-shrink: 0;
}
.anl-facets[hidden] { display: none; }

.anl-facets-lead {
  font-family: var(--app-font);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}

.anl-facet-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px 3px 8px;
  border: 1px solid var(--app-accent);
  border-radius: 11px;
  background: var(--app-panel-bg);
  font-family: var(--app-font);
  font-size: 11px;
  line-height: 1.5;
  max-width: 100%;
}

/* The axis name, quieter than the value. A reader debugging an empty
   intersection needs to see that one chip is a FAMILY and the other a STOREY --
   that is what tells them the two compose rather than contradict. */
.anl-facet-axis {
  color: var(--app-text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  flex-shrink: 0;
}
.anl-facet-label {
  color: var(--app-text);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 24px hit target -- WCAG 2.2 AA (2.5.8), the floor the density scale pins. */
.anl-facet-x {
  appearance: none;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--app-text-muted);
  font-size: 10px;
  line-height: 1;
  min-width: 24px;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
}
.anl-facet-x:hover { background: var(--app-wash-hover); color: var(--app-accent); }
.anl-facet-x:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 1px; }

/* The sentence carries EVERY OPERAND, not just the result -- an intersection
   the reader cannot decompose is one they cannot check. It wraps rather than
   truncating: this line is the honesty half and must never be elided. */
.anl-facets-sentence {
  font-family: var(--app-font);
  font-size: 11px;
  color: var(--app-text-muted);
  flex: 1 1 220px;
  min-width: 0;
}

.anl-facets-clear {
  appearance: none;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-panel-bg);
  cursor: pointer;
  font-family: var(--app-font);
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text-muted);
  padding: 4px 9px;
  min-height: 24px;
  flex-shrink: 0;
}
.anl-facets-clear:hover { color: var(--app-accent); border-color: var(--app-accent); }
.anl-facets-clear:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 1px; }


/* ═══════════════════════════════════════════════════════════════════════════
   THE 3-D RELATIONSHIP GRAPH + ITS CATEGORY TREE
   §GRAPH-3D-VIEWPORT / §GRAPH-HIERARCHY-VIEWS (L-8440 … L-8462)
   ═══════════════════════════════════════════════════════════════════════════

   ⛔ WHITE AND PURPLE, NO BLACK — §BRAND. The viewport's ground is a very soft
   white→violet sweep (set inline in 'GraphViewport.ts', because a canvas frame's
   gradient must not depend on this sheet having loaded before the first draw),
   and everything below it reads off the same '--app-*' tokens every other card on
   this surface uses. No colour is minted here.

   ⚠ The category rows are BUTTONS, not list items, and that is not decoration:
   clicking one picks a FACET (ADR-0358), so it must be reachable by keyboard and
   must announce itself as pressable. A '<div role="button">' would have been the
   shortcut and would have been worse. */

.anl-gv-root { display: block; margin: 0; }
.anl-gv-frame { width: 100%; }
.anl-gv-canvas { display: block; width: 100%; height: 100%; }

.anl-cat-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--app-border);
}

.anl-cat-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 7px;
  padding: 2px 0;
}
.anl-cat-label {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--app-text);
}

.anl-cat-row {
  appearance: none;
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  font-family: var(--app-font);
  padding: 3px 8px 3px 22px;   /* indented under its discipline head */
  min-height: 22px;
}
.anl-cat-row:hover { border-color: var(--app-accent); background: var(--app-violet-soft); }
.anl-cat-row:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

.anl-cat-row-name {
  font-size: 10.4px;
  font-weight: 600;
  color: var(--app-text-2);
  flex: 0 0 auto;
}
/* The IFC column is deliberately quiet and deliberately ALLOWED TO WRAP: it very
   often holds a full sentence explaining why a class could NOT be resolved, and
   truncating that to an ellipsis would turn a stated non-answer back into a
   blank — which is the failure the sentence exists to prevent. */
.anl-cat-row-ifc {
  font-size: 9.6px;
  line-height: 1.5;
  color: var(--app-text-muted);
  flex: 1 1 auto;
  min-width: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §ANALYSIS-FOLD-STATE (L-12063) — the note blocks fold, the QUALIFIER does not
   ═══════════════════════════════════════════════════════════════════════════

   The founder: "make all those sections foldable — they are taking too much
   space and they are just notes." So a collapsed fold is ONE ROW, and the row
   wraps: five collapsed notes occupy two lines where the five open blocks
   occupied more vertical space than the graph itself.

   ⛔ THE CHIP IS NOT DECORATION AND MUST NOT BE HIDDEN AT ANY WIDTH. It is the
   qualifier — "LOWER BOUND", "STALE" — surviving the fold. A media query or an
   ellipsis that dropped it would turn a qualified number into an apparently
   unqualified one, which is the exact defect the fold was designed around.
   'flex: 0 0 auto' on the chip and 'min-width: 0' on the LABEL is that rule in
   CSS: when the row runs out of room the label truncates, never the chip.
   ═══════════════════════════════════════════════════════════════════════════ */

.anl-notes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: flex-start;
}

.anl-fold {
  border-radius: var(--app-radius-sm);
  border-left: 3px solid var(--app-border);
  background: var(--app-surface-sunken);
  min-width: 0;
  max-width: 100%;
}
.anl-fold--warn  { border-left-color: var(--app-status-warning-line); background: var(--app-status-warning-bg); }
.anl-fold--err   { border-left-color: var(--app-status-error-line);   background: var(--app-status-error-bg);   }
.anl-fold--ok    { border-left-color: var(--app-status-success-line); background: var(--app-status-success-bg); }
/* A SCOPE is not a warning — the L-3620 separation, carried into the folds. */
.anl-fold--scope { border-left-color: var(--app-accent);              background: var(--app-violet-soft);       }

.anl-fold-head {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-family: var(--app-font);
  padding: 5px 9px;
  min-height: 24px;
  border-radius: var(--app-radius-sm);
}
.anl-fold-head:hover { background: var(--app-wash-hover); }
.anl-fold-head:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

.anl-fold-caret {
  font-size: 8.5px;
  color: var(--app-text-muted);
  flex: 0 0 auto;
}
.anl-fold-label {
  font-size: 10.2px;
  font-weight: 600;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.anl-fold-chip {
  flex: 0 0 auto;
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-radius: 999px;
  padding: 1px 7px;
  white-space: nowrap;
}
.anl-fold-chip--warn    { color: var(--app-status-warning-ink); background: var(--app-panel-bg); }
.anl-fold-chip--err     { color: var(--app-status-error-ink);   background: var(--app-panel-bg); }
.anl-fold-chip--ok      { color: var(--app-status-success-ink); background: var(--app-panel-bg); }
.anl-fold-chip--neutral { color: var(--app-text-muted);         background: var(--app-panel-bg); }

.anl-fold-body { padding: 0 9px 8px 9px; }
.anl-fold-body[hidden] { display: none; }

/* The completeness fold is a full-width statement, not a chip in a wrap row. */
.anl-fold-host { display: block; }
.anl-fold-host > .anl-fold { display: block; }

/* ═══════════════════════════════════════════════════════════════════════════
   §GRAPH-EXPAND (L-12062) + the HONESTY PIN
   ═══════════════════════════════════════════════════════════════════════════

   ⛔ THE PIN IS NEVER FOLDABLE AND NEVER LEAVES THE STAGE. When the stage is
   expanded it covers the card head, and the 'INCOMPLETE' badge lives there — so
   without this line, maximising the graph would silently drop the surface's
   loudest qualifier at the moment the reader is looking hardest.

   ⚠ ADDED 2026-08-26 (§SCROLL136, L-12200) — 'sticky' on the pin below.
   '.anl-card-body' just became a scroll container (see the block above this
   one). The pin sits inside that body when the graph is not expanded — a
   reader scrolling down to reach the category tree or the legends would
   otherwise carry the pin off the top of the viewport while the NUMBERS
   further down stayed on screen, which is the exact "qualifier hidden,
   figures visible" shape this card exists to refuse. 'position: sticky' keeps
   it glued to the top of whichever scroll container is nearest:
   '.anl-card-body' when collapsed, or '.anl-graph-stage--expanded' itself
   (also 'overflow: auto') when maximised — one rule, both states, because
   sticky always resolves against the NEAREST scrolling ancestor rather than a
   specific one named here.

   ⚠ AMENDED 2026-08-26 (§DEMO141, L-12301) — the pin is NO LONGER the stage's
   first child. The storey-scope and relationship-view controls moved INSIDE
   the stage ahead of it ('widgetRenderers.ts', §GRAPH-EXPAND-CONTROLS-SURVIVE)
   so an expand no longer covers the only way to change what the graph shows.
   'position: sticky' does not require being the first child — it locks once
   the element's own normal-flow position would cross 'top: 0' — so the pin
   still locks, just after those two bars scroll past rather than immediately.
   That is a disclosed trade, not a regression: see the widget-renderer comment
   for why those two bars are not ALSO sticky yet. */

.anl-graph-stage {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.anl-graph-stage--expanded {
  position: absolute;
  inset: 0;
  z-index: 60;
  background: var(--app-bg);
  box-shadow: var(--app-shadow-modal);
  padding: 12px 14px;
  overflow: auto;
}

.anl-honesty-pin {
  margin: 0;
  padding: 5px 9px;
  border-radius: var(--app-radius-sm);
  border-left: 3px solid var(--app-status-warning-line);
  background: var(--app-status-warning-bg);
  color: var(--app-status-warning-ink);
  font-size: 10.2px;
  font-weight: 600;
  line-height: 1.5;
  /* §SCROLL136 (L-12200) — see the comment above this block. 'background' is
     already opaque, which is what makes a sticky header read as pinned rather
     than as text ghosting through the content scrolling beneath it. */
  position: sticky;
  top: 0;
  z-index: 1;
}

/* The positioned wrapper the corner control sits in. */
.anl-graph-frame { position: relative; min-width: 0; }
.anl-graph-stage--expanded .anl-graph-frame { flex: 1 1 auto; }

.anl-graph-expand {
  appearance: none;
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-panel-bg);
  color: var(--app-text-2);
  font-family: var(--app-font);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.anl-graph-expand:hover { color: var(--app-accent); border-color: var(--app-accent); }
.anl-graph-expand:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

/* ═══════════════════════════════════════════════════════════════════════════
   §GRAPH-FLOAT-CONTROLS (L-12561, lane §GRAPH154) — buttons floating ON TOP
   of the graph, not stacked above it
   ═══════════════════════════════════════════════════════════════════════════

   Founder, verbatim: 'make the graphs larger occupy all the proposed shape -
   the buttons can be floating on top of the graphs.' Every control survives
   this move — storey, relationship view, the honesty qualifier, draw mode,
   node size, focus hops, reset, both exports — nothing is removed. They move
   from being '.anl-graph-stage's own flex children (each one consuming real
   height, three rows stacked above the canvas before it could even start) to
   being '.anl-graph-frame's own overlay, painted OVER the canvas instead.

   TWO HAZARDS A FLOATING BAR INTRODUCES, BOTH HANDLED HERE:

   1. POINTER CAPTURE. '.anl-graph-controls' itself is 'pointer-events: none'
      -- an empty stretch of its background lets a click or a drag fall
      straight through to the canvas beneath, exactly as if the overlay were
      not there. Every bar it holds re-enables 'pointer-events: auto' on
      ITSELF and sizes to its own content ('width: fit-content', never
      '100%'), so only the visible chips/sliders/buttons capture the pointer
      -- never the transparent gutter around them.

   2. OCCLUSION. A translucent, blurred backing plate gives each bar real
      contrast against BOTH the pale and the saturated node fills the
      founder's own screenshot showed (tan, grey, warm orange, teal, dark
      green); 'max-width' keeps the whole cluster out of the canvas CENTRE,
      anchored top-left -- clear of the corner the expand ('anl-graph-expand')
      control owns. */

.anl-graph-controls {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 40px; /* clears the corner expand button, .anl-graph-expand */
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  max-width: min(560px, 74%);
  pointer-events: none;
}

.anl-graph-controls > * {
  pointer-events: auto;
  width: fit-content;
  max-width: 100%;
}

.anl-graph-controls > .anl-scope-bar,
.anl-graph-controls > .anl-honesty-pin,
.anl-graph-controls > .anl-fold-host {
  background: color-mix(in srgb, var(--app-panel-bg) 88%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-sm);
  padding: 4px 7px;
  box-shadow: var(--app-shadow-card);
}

/* The pin no longer scrolls past anything to reach -- it is already pinned to
   the canvas's own top corner by the floating overlay it now lives inside, so
   the sticky behaviour the collapsed card used it for (see the '.anl-honesty-
   pin' rule above) would only add a redundant, no-op position context here. */
.anl-graph-controls > .anl-honesty-pin {
  position: static;
  margin: 0;
}

/* §GRAPH-NODE-LEGEND (L-12061). ⛔ A DISC, where the edge legend uses a BAR: the
   two legends sit one above the other on the same eight-value rotation, and the
   SHAPE is what says which key you are reading. Colour is never the only
   channel — here it is not even the only channel between the two keys. */
.anl-nodelink-legend-lead {
  flex: 0 0 100%;
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}
.anl-nodelink-swatch--node {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* §GRAPH154 (L-12560..) — the SECOND legend line, additive, shown only while a
   model selection is active. Same colour, lighter weight and normal case than
   '.anl-nodelink-legend-lead' above it -- a visual "this is a note, not the
   claim" cue, since the claim itself ('colour = element category') is on the
   line above and does not change meaning when this one appears. */
.anl-nodelink-legend-ring-note {
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
}

/* The two sliders on the graph toolbar. They sit INSIDE an '.anl-scope-label', so
   the label text and the control read as one unit. */
.anl-scope-label > input[type='range'] {
  vertical-align: middle;
  margin-left: 6px;
  width: 74px;
  accent-color: var(--app-accent);
  cursor: pointer;
}


/* ===========================================================================
   THE ARRANGEMENT-VS-CATALOGUE NOTICE
   ANALYSIS-STORED-ARRANGEMENT-VS-GROWN-CATALOGUE (L-9002)
   ===========================================================================

   NO BACKTICKS ANYWHERE IN THIS BLOCK. It lives inside a template literal, and a
   backtick in a CSS comment terminates it -- the trap that produced six TS parse
   errors across three lanes in one session (L-8463). Single quotes read
   identically here.

   It spans the full grid width because it is about the grid, not about one card.
   Violet-soft ground and the accent border: it is a QUESTION, not a warning, and
   must not wear the amber of a lower bound. */

.anl-reconcile {
  grid-column: 1 / -1;
  border: 1px solid var(--app-accent);
  border-radius: 8px;
  background: var(--app-violet-soft);
  padding: 11px 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.anl-reconcile-head {
  font-size: 11.5px;
  font-weight: 800;
  color: var(--app-text);
}
.anl-reconcile-why {
  margin: 0;
  font-size: 10.6px;
  line-height: 1.6;
  color: var(--app-text-2);
}
.anl-reconcile-row {
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  text-align: left;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-panel-bg);
  cursor: pointer;
  font-family: var(--app-font);
  padding: 6px 10px;
  min-height: 30px;
}
.anl-reconcile-row:hover { border-color: var(--app-accent); }
.anl-reconcile-row:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }
.anl-reconcile-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--app-text);
}
.anl-reconcile-add {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--app-accent);
  white-space: nowrap;
}
.anl-reconcile-foot { display: flex; justify-content: flex-end; }
.anl-reconcile-keep {
  appearance: none;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-panel-bg);
  cursor: pointer;
  font-family: var(--app-font);
  font-size: 10px;
  font-weight: 600;
  color: var(--app-text-muted);
  padding: 4px 11px;
  min-height: 24px;
}
.anl-reconcile-keep:hover { color: var(--app-accent); border-color: var(--app-accent); }
.anl-reconcile-keep:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

/* ═══════════════════════════════════════════════════════════════════════════
   PARCEL LAW tab (L-12915, STR §21 / §24.1, RESI-ORCHESTRATOR-PLAN §8.3).
   The tab body is a HOST, not a grid: it spans both columns and stacks the
   four-view switcher, a one-line note and the parcel panel (both halves) in a
   column. The parcel panel brings its own .pb-parcel-* rules from the
   projectBrowser sheet; the switcher's buttons reuse .pb-gis-action from the
   same sheet. Tokens only -- C84 EI-8, no colour literal here. NO BACKTICKS in
   this block (it lives inside a template literal).
   ═══════════════════════════════════════════════════════════════════════════ */
.anl-parcel-law {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.anl-parcel-law-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--app-text-muted);
  white-space: normal; /* a full sentence; never truncated */
}
.anl-parcel-law-panel { min-width: 0; }

/* The four-view switcher: one segmented row, not four rail rows. Mountable by
   any host (viewSegmentSwitcher.ts); the Analysis surface is its first. */
.view-segment-switcher {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.view-segment-switcher-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-bg);
}
.view-segment-btn {
  flex: 1 1 auto;
  justify-content: center;
  min-width: 0;
}
.view-segment-switcher-status {
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--app-text-muted);
  white-space: normal;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §VIEW-SWITCHER-ON-THE-VIEW (L-12985, founder 2026-09-06)

   *"we DON'T need the plan view / 3D view etc. on the panel -- that ... SHOULD
   BE CENTRED ON THE VIEW"*, with a screenshot boxing the four stacked
   full-width buttons INSIDE the right-hand panel.

   ⛔ ENROLLED IN §SHELL-FLOAT-BUDGET, NOT FLOATED. 'left' is
   'var(--shell-canvas-cx)' -- the ONE published horizontal accounting, written
   by 'publishShellCanvasRegion()' and by nothing else -- never 'left: 50%'. In
   a half-canvas mode the canvas centre is NOT the viewport centre, and a bar at
   50% would sit half on the panel it was just moved off. 'top' clears the
   shell's always-on band via '--shell-topbar-h' rather than a hand-picked
   number (C06 §15.6: the band can grow). The one inline 'top' this control
   writes is the measured offset UNDER '.svq-bar' when the split shell puts its
   own bar in the same place -- a measurement, not a second budget.

   Deliberately a SIBLING of '.svq-bar' (C06 §6.1 -- one chrome language): same
   pill radius, same panel background token, same border token. It is not a
   third bar style, and the two read as one family when both are up.

   NO BACKTICKS in this block (it lives inside a template literal). Tokens only
   -- C84 EI-8, no colour literal here.
   ═══════════════════════════════════════════════════════════════════════════ */
.vsw-onview {
  position: fixed;
  top: calc(6px + var(--shell-topbar-h, 36px) + 8px);
  left: var(--shell-canvas-cx, 50%);
  transform: translateX(-50%);
  max-width: calc(var(--shell-canvas-w, 100vw) - 32px);
  z-index: 8980;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: 14px;
  box-shadow: var(--app-shadow-panel);
  pointer-events: all;
  user-select: none;
  font-family: var(--app-font);
}

/* The hosted switcher is the SAME component the panel used; only its placement
   changed. On the view it reads as one pill row, so the column stacking and the
   inner frame the panel version needs are dropped HERE, in the host's scope --
   the control itself is untouched (it is owned by lane VIEW-PANEL-PER-PANE). */
.vsw-onview .view-segment-switcher { gap: 0; }
.vsw-onview .view-segment-switcher-row {
  flex-wrap: nowrap;
  border: none;
  padding: 0;
  background: transparent;
}
.vsw-onview .view-segment-btn { flex: 0 0 auto; white-space: nowrap; }

/* ⛔ THE STATUS LINE STAYS. It is the control's honest answer to "which view am
   I on" -- including the case it CANNOT answer (no snapshot field for the PRYZM
   views), which is a missing reading and not "off". Making the bar tidy by
   deleting it would delete the distinction. It is quiet, centred and bounded by
   the canvas region instead. */
.vsw-onview .view-segment-switcher-status {
  max-width: calc(var(--shell-canvas-w, 100vw) - 64px);
  text-align: center;
  font-size: 10px;
}

/* SPLIT is a LAYOUT choice, not a seventh view -- so it is visibly a different
   kind of control: separated by a rule, and pressed rather than selected. */
.vsw-split {
  align-self: stretch;
  margin-top: 2px;
  padding: 5px 12px;
  border: 1px solid var(--app-border);
  border-radius: 100px;
  background: var(--app-bg);
  color: var(--app-text);
  font-family: var(--app-font);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}
.vsw-split:hover:not(:disabled) { border-color: var(--app-accent); color: var(--app-accent); }
.vsw-split:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }
.vsw-split[data-split-open] {
  background: var(--app-accent);
  border-color: var(--app-accent);
  color: var(--app-on-accent);
}
/* A refused control stays READABLE and keeps its reason in the title (C06 §15.6
   -- a dimmed control that keeps only its affordance is the defect, not the fix). */
.vsw-split:disabled { opacity: 0.42; cursor: not-allowed; }

`;
