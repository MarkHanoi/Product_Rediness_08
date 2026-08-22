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

.anl-grid {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 14px 16px 24px;
  overflow-y: auto;
  align-content: start;
}

/* ── Card ───────────────────────────────────────────────────────────────── */

.anl-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  box-shadow: var(--app-shadow-card);
  overflow: hidden;
}
.anl-card--wide { grid-column: 1 / -1; }

.anl-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 13px 9px;
  border-bottom: 1px solid var(--app-border-light);
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

.anl-card-body { padding: 12px 13px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }

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
.anl-nodelink { display: block; width: 100%; min-width: 420px; height: auto; }
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
  background: var(--app-wash);
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

`;
