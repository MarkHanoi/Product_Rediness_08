/**
 * @file apps/editor/src/ui/styles/panels/siteSurface.ts
 *
 * Site surface — the SITE workspace mode's right-hand half (`#ste-surface`).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THIS SHEET IS DELIBERATELY TINY, AND THE REASON IS THE WHOLE POINT
 * ═════════════════════════════════════════════════════════════════════════════
 * The Parcel Law panel MOVED here from Analysis's fifth tab (C115 §0.3). Its body
 * (`.anl-parcel-law` and ≈96 `data-*` / ≈156 testids beneath it) and the chrome it
 * sits in (`.anl-panel`, `.anl-header`, `.anl-status`, `.anl-grid`) are styled by
 * `analysisSurface.ts` with CLASS selectors — MEASURED: that sheet contains exactly
 * TWO id-scoped rules, `#anl-surface` and `#anl-surface.anl-surface--visible`. Every
 * other rule in it is a class rule and therefore applies inside this surface too, for
 * free, because `AppTheme` concatenates both sheets into one injected stylesheet.
 *
 * ⛔ SO THIS FILE RE-DECLARES THE TWO ID RULES AND NOTHING ELSE. Re-declaring the
 * chrome under a `ste-` prefix would be a SECOND palette kept alive in code — the
 * defect `tokens.ts:276` forbids one level down and `§PANEL-BRAND-STANDARD` exists to
 * catch — and C06 §6.1's rule is that these mode surfaces *"are one product"*, with
 * `.aud-header` as the reference implementation all of them share.
 *
 * ⚠ THE COST IS STATED, NOT HIDDEN: the class prefix now reads `anl-` on a surface
 * that is not Analysis. That is a MISNOMER, and L-13181 holds the rename — which must
 * move the classes, the `analysis-parcel-law` testid and all ≈156 probes of it in ONE
 * commit or not at all (C115 §3.H `C115-28`: renaming a probed testid breaks a shipped
 * behaviour SILENTLY).
 *
 * ⛔ NO `body.pryzm-mode-site` RULE LIVES HERE, and that is not an omission.
 * §SHELL-FLOAT-BUDGET (L-4010..L-4016) retired the five hand-written per-mode `left`
 * overrides: every canvas-anchored bar now centres on `--shell-canvas-cx`, which
 * `WorkspaceController` publishes from the `canvas` column of `WORKSPACE_MODES`. A
 * half-canvas mode is a ROW, not a sixth CSS rule — and `shellFloatBudget.spec.ts`
 * ARM C fails any sheet that reintroduces one.
 *
 * ⛔ EVERY COLOUR HERE IS A TOKEN. Zero hex literals, zero `var(--x, fallback)` forms.
 * ⛔ NO BLACK — `--app-canvas-bg` is the 3-D canvas and never appears in a panel.
 */
export const SITE_SURFACE_STYLES = `

/* ═══════════════════════════════════════════════════════════════════════════
   STE — root. Fixed right 50%, byte-for-byte the box '#anl-surface' declares.

   The canvas keeps the LEFT half: 'workspaceModes.ts' gives the 'site' row
   'canvas: half', 'WorkspaceController' turns that into a region CLAIM, and the
   region owner (C59 §2.10, §VIEW-REGION-HAS-ONE-OWNER) derives '#container''s
   width AND places the split pane at 'right: <the claim>' — beside this panel
   rather than behind it. That is the founder's arrangement, 2D Site Map left and
   the Site panel right, and this sheet writes none of it.

   ⛔ 'z-index: 50' is the SAME rank '#anl-surface' holds, and it is load-bearing
   in two directions: above '.svp-pane' (z-index 1) so a split pane cannot paint
   over the panel, and BELOW the half-canvas drag handle ('RESIZER_Z_INDEX = 51')
   so the seam stays grabbable. 'gridButtonCensus.spec.ts' pins the Analysis one;
   changing this one alone would silently break the pairing.

   ⛔ 'display: none' + a visibility CLASS, never a detach. The surface is
   appended to document.body at module load and stays there — which is exactly
   why 'SiteSurface._hide()' must tear the parcel body down itself: a claimed
   singleton envelope card left inside a hidden-but-attached host is stranded,
   and the seam's 'document.contains()' self-healing cannot tell the difference.
   ═══════════════════════════════════════════════════════════════════════════ */

#ste-surface {
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

#ste-surface.ste-surface--visible { display: flex; }
`;
