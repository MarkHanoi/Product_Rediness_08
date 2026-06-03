/**
 * @file src/styles/AppTheme.ts
 *
 * Thin assembler — concatenates all panel CSS modules and injects them
 * once into <head>. All CSS constants live in src/styles/panels/*.ts
 * and src/styles/tokens.ts.
 *
 * CONTRACT §05 §2.1 — injectAppTheme() is the sole CSS injection point
 * for *runtime, JS-managed* CSS.  Zero logic beyond the idempotency guard
 * and style injection.
 *
 * BOOT-SHELL CARVE-OUT (Wave 1.5b — App-Shell first paint, see
 * `docs/archive/pryzm3-internal/02-ARCHITECTURE.md §6` Stage 0):
 *   index.html contains an inline <style> block with the `lp-skel-*` class
 *   prefix that paints the landing-page navbar + hero + CTA card BEFORE
 *   any module script runs.  This is the only CSS allowed to live outside
 *   this file, and is justified by NFT 1 (`01-VISION.md §5`: cold-boot
 *   to first paint < 2.5 s) — JS-injected CSS cannot, by definition,
 *   paint before the JS module that injects it has loaded and executed.
 *   The skeleton CSS is removed from the DOM the moment LandingPage
 *   (or PlatformRouter, in the signed-in branch) mounts.
 *
 * @see src/styles/tokens.ts          — Design tokens (:root variables)
 * @see src/styles/panels/            — Per-panel CSS modules
 * @see index.html                    — Boot-shell carve-out (Stage 0 only)
 * @see src/types/boot-shell.d.ts     — Typed Window globals for the carve-out
 */

import { DESIGN_TOKENS } from './tokens';
import { APARTMENT_LAYOUT_MODAL_STYLES } from './panels/apartmentLayoutModal';
import { TOOLS_PANEL_STYLES, VIEW_BROWSER_STYLES, VIEW_PROPERTIES_PANEL_STYLES, VIEW_PROPERTIES_SECTION_STYLES, INTENT_SPINE_STYLES } from './panels/viewerPanels';
import { PROJECT_BROWSER_STYLES, PHYS_RAIL_PANEL_STYLES } from './panels/projectBrowser';
import { CURTAIN_WALL_STYLES, FLOOR_PLAN_IMPORT_STYLES } from './panels/constructionPanels';
import { LANDING_PAGE_STYLES, RESOURCES_STYLES, SOLUTIONS_STYLES } from './panels/marketingPages';
import { MARKETING_PAGE_STYLES } from '../marketing/marketingPageStyles';
import { ONBOARDING_STYLES } from '../onboarding/onboardingStyles';
import { AUTH_MODAL_STYLES, UPGRADE_MODAL_STYLES, WELCOME_MODAL_STYLES, CONTACT_SALES_MODAL_STYLES } from './panels/authModals';
import { PROJECT_HUB_STYLES } from './panels/projectHub';
import { PLATFORM_SHELL_STYLES, RIBBON_STYLES, APP_MENU_STYLES, PROPERTIES_PALETTE_STYLES, CEB_STYLES, WMB_STYLES, OSP_STYLES, EAB_STYLES } from './panels/platformShell';
import { PRICING_PAGE_STYLES } from './panels/pricingPage';
import { VISIBILITY_GRAPHICS_STYLES } from './panels/visibilityGraphics';
import { SHEET_EDITOR_STYLES } from './panels/sheetEditor';
import { ACTIVE_LEVEL_HUD_STYLES, LEVEL_MANAGER_STYLES, GRID_MANAGER_STYLES, DIM_OPTIONS_STYLES } from './panels/levelsGrids';
import { ANNOTATION_STYLES, VPT_PANEL_STYLES, DIM_PROPS_PANEL_STYLES } from './panels/annotationPanels';
import { FURNITURE_CAROUSEL_CSS, RADIAL_MENU_CSS, FLOATING_CAROUSEL_CSS } from './panels/furnitureCarousel';
import { RQP_PANEL_STYLES, VIZ_ENGINE_PANEL_STYLES, REAL_SUN_STYLES, FW_PANEL_STYLES, SCF_STYLES, RHI_STYLES, PSCB_STYLES, PHOTOREALISTIC_SIDEBAR_STYLES, EXPORT_STUDIO_STYLES } from './panels/renderingPanels';
import { PROJECT_MEMBER_PANEL_STYLES, CDE_VERSION_PANEL_STYLES, NAME_BUILDER_STYLES } from './panels/projectAssets';
import { AI_PANEL_POPUP_STYLES, SCHEDULE_PANEL_STYLES, PAN_PANEL_STYLES, REN_PANEL_STYLES, RG_PANEL_STYLES, VEX_PANEL_STYLES } from './panels/workflowPanels';
import { TOOL_HUD_STYLES, STAIR_PATH_TOOL_STYLES } from './panels/toolHud';
import { WALL_LAYER_EDITOR_STYLES, WALL_TYPE_SELECTOR_STYLES, LAYOUT_EXTRAS_STYLES } from './panels/wallEditor';
import { CEILING_TYPE_SELECTOR_STYLES, FLOOR_TYPE_SELECTOR_STYLES } from './panels/ceilingFloorTypeSelector';
import { DOOR_TYPE_SELECTOR_STYLES, WINDOW_TYPE_SELECTOR_STYLES } from './panels/openingTypeSelector';
import { COLUMN_TYPE_SELECTOR_STYLES, BEAM_TYPE_SELECTOR_STYLES, STAIR_TYPE_SELECTOR_STYLES } from './panels/structuralTypeSelector';
import { TOOLS_RAIL_PANEL_STYLES, LEVELS_GRIDS_RAIL_STYLES, RAIL_PANEL_STYLES } from './panels/toolsRail';
import { UNIFIED_BROWSER_STYLES } from './panels/unifiedBrowser';
import { WALL_MODE_PICKER_STYLES, SLAB_MODE_PICKER_STYLES, CURTAIN_WALL_MODE_PICKER_STYLES, DOOR_MODE_PICKER_STYLES, WINDOW_MODE_PICKER_STYLES, CEILING_MODE_PICKER_STYLES, FLOOR_MODE_PICKER_STYLES, ROOF_MODE_PICKER_STYLES, HANDRAIL_MODE_PICKER_STYLES, COLUMN_MODE_PICKER_STYLES, BEAM_MODE_PICKER_STYLES, OPENING_MODE_PICKER_STYLES } from './panels/modePickers';
import { WALL_DRAWING_HUD_STYLES, STAIR_SETUP_PANEL_STYLES, STAIR_HUD_STYLES, ELEMENT_CREATION_MODAL_STYLES } from './panels/drawingHuds';
import { PROPERTY_INSPECTOR_STYLES, DOOR_SECTION_STYLES } from './panels/propertyInspector';
import { DATA_WORKBENCH_STYLES } from './panels/dataWorkbench';
import { SSD_STYLES } from './panels/syncStateDrawer';
import { LEFT_NAV_RAIL_STYLES } from './panels/leftNavRail';
import { SEL_OVERLAY_STYLES } from './panels/selectionOverlay';
import { OOP_STYLES } from './panels/operationOverlay';
import { SPLIT_VIEW_STYLES } from './panels/splitView';
import { CANVAS_OVERLAYS_STYLES } from './panels/canvasOverlays';
import { DISCIPLINE_ACCORDION_STYLES } from './panels/disciplineAccordion';
import { DOCKING_SYSTEM_STYLES, VIEW_CUBE_STYLES } from './panels/dockingSystem';
import { PREVIEW_LAYER_STYLES } from './panels/previewLayer';
import { AUTONOMOUS_AUDITOR_STYLES } from './panels/autonomousAuditor';
import { SURH_STYLES } from '../SaveUndoRedoHUD';
import { VTB_STYLES } from '../views/ViewTabBar';
import { APP_TOAST_STYLES } from './panels/appToast';
import { IMPORTED_MODELS_STYLES } from './panels/importedModels';
import { IMPORT_MANAGER_STYLES } from './panels/importManager';
import { CONFIRM_DIALOG_STYLES } from './panels/confirmDialog';
import { COLLABORATIVE_PRESENCE_STYLES } from './panels/collaborativePresence';
import { MODEL_TREE_STYLES } from './panels/modelTree';
import { MODEL_TREE_TEST_MODAL_STYLES } from './panels/modelTreeTestModal';
import { SHEET_GENERATOR_TEST_MODAL_STYLES } from './panels/sheetGeneratorTestModal';
import { PDF_EXPORT_TEST_MODAL_STYLES } from './panels/pdfExportTestModal';
import { APARTMENT_DATA_TEST_MODAL_STYLES } from './panels/apartmentDataTestModal';

const APP_THEME_ID = 'app-master-theme-v3';

/**
 * Injects the master PRYZM stylesheet into <head> exactly once.
 * Concatenation order is identical to the original monolithic AppTheme.ts —
 * preserved to maintain CSS specificity parity across all panels.
 */
export function injectAppTheme(): void {
    const existing = document.getElementById(APP_THEME_ID);
    const style = existing instanceof HTMLStyleElement
        ? existing
        : document.createElement('style');
    style.id = APP_THEME_ID;
    style.textContent = DESIGN_TOKENS
        + TOOLS_PANEL_STYLES
        + VIEW_BROWSER_STYLES
        + PROJECT_BROWSER_STYLES
        + CURTAIN_WALL_STYLES
        + FLOOR_PLAN_IMPORT_STYLES
        + LANDING_PAGE_STYLES
        + RESOURCES_STYLES
        + SOLUTIONS_STYLES
        + MARKETING_PAGE_STYLES
        + ONBOARDING_STYLES
        + CONTACT_SALES_MODAL_STYLES
        + AUTH_MODAL_STYLES
        + PROJECT_HUB_STYLES
        + WELCOME_MODAL_STYLES
        + PLATFORM_SHELL_STYLES
        + UPGRADE_MODAL_STYLES
        + PRICING_PAGE_STYLES
        + VISIBILITY_GRAPHICS_STYLES
        + SHEET_EDITOR_STYLES
        + ACTIVE_LEVEL_HUD_STYLES
        + LEVEL_MANAGER_STYLES
        + GRID_MANAGER_STYLES
        + DIM_OPTIONS_STYLES
        + ANNOTATION_STYLES
        + VPT_PANEL_STYLES
        + DIM_PROPS_PANEL_STYLES
        + FURNITURE_CAROUSEL_CSS
        + FLOATING_CAROUSEL_CSS
        + RADIAL_MENU_CSS
        + RQP_PANEL_STYLES
        + VIZ_ENGINE_PANEL_STYLES
        + REAL_SUN_STYLES
        + FW_PANEL_STYLES
        + SCF_STYLES
        + RHI_STYLES
        + PSCB_STYLES
        + PHOTOREALISTIC_SIDEBAR_STYLES
        + EXPORT_STUDIO_STYLES
        + PROJECT_MEMBER_PANEL_STYLES
        + CDE_VERSION_PANEL_STYLES
        + NAME_BUILDER_STYLES
        + AI_PANEL_POPUP_STYLES
        + SCHEDULE_PANEL_STYLES
        + PAN_PANEL_STYLES
        + REN_PANEL_STYLES
        + RG_PANEL_STYLES
        + VEX_PANEL_STYLES
        + TOOL_HUD_STYLES
        + STAIR_PATH_TOOL_STYLES
        + RIBBON_STYLES
        + APP_MENU_STYLES
        + PROPERTIES_PALETTE_STYLES
        + WALL_LAYER_EDITOR_STYLES
        + WALL_TYPE_SELECTOR_STYLES
        + CEILING_TYPE_SELECTOR_STYLES
        + FLOOR_TYPE_SELECTOR_STYLES
        + DOOR_TYPE_SELECTOR_STYLES
        + WINDOW_TYPE_SELECTOR_STYLES
        + COLUMN_TYPE_SELECTOR_STYLES
        + BEAM_TYPE_SELECTOR_STYLES
        + STAIR_TYPE_SELECTOR_STYLES
        + LAYOUT_EXTRAS_STYLES
        + TOOLS_RAIL_PANEL_STYLES
        + LEVELS_GRIDS_RAIL_STYLES
        + RAIL_PANEL_STYLES
        + UNIFIED_BROWSER_STYLES
        + WALL_MODE_PICKER_STYLES
        + SLAB_MODE_PICKER_STYLES
        + CURTAIN_WALL_MODE_PICKER_STYLES
        + DOOR_MODE_PICKER_STYLES
        + WINDOW_MODE_PICKER_STYLES
        + HANDRAIL_MODE_PICKER_STYLES
        + COLUMN_MODE_PICKER_STYLES
        + BEAM_MODE_PICKER_STYLES
        + OPENING_MODE_PICKER_STYLES
        + CEILING_MODE_PICKER_STYLES
        + FLOOR_MODE_PICKER_STYLES
        + WALL_DRAWING_HUD_STYLES
        + STAIR_SETUP_PANEL_STYLES
        + STAIR_HUD_STYLES
        + ELEMENT_CREATION_MODAL_STYLES
        + PROPERTY_INSPECTOR_STYLES
        + ROOF_MODE_PICKER_STYLES
        + DATA_WORKBENCH_STYLES
        + SSD_STYLES
        + CEB_STYLES
        + LEFT_NAV_RAIL_STYLES
        + WMB_STYLES
        + PHYS_RAIL_PANEL_STYLES
        + SEL_OVERLAY_STYLES
        + OOP_STYLES
        + SPLIT_VIEW_STYLES
        + CANVAS_OVERLAYS_STYLES
        + VIEW_PROPERTIES_PANEL_STYLES
        + DOOR_SECTION_STYLES
        + DISCIPLINE_ACCORDION_STYLES
        + OSP_STYLES
        + EAB_STYLES
        + DOCKING_SYSTEM_STYLES
        + VIEW_CUBE_STYLES
        + VIEW_PROPERTIES_SECTION_STYLES
        + INTENT_SPINE_STYLES
        + PREVIEW_LAYER_STYLES
        + AUTONOMOUS_AUDITOR_STYLES
        + SURH_STYLES
        + VTB_STYLES
        + APP_TOAST_STYLES
        + IMPORTED_MODELS_STYLES
        + IMPORT_MANAGER_STYLES
        + CONFIRM_DIALOG_STYLES
        + COLLABORATIVE_PRESENCE_STYLES
        + APARTMENT_LAYOUT_MODAL_STYLES
        + MODEL_TREE_STYLES
        + MODEL_TREE_TEST_MODAL_STYLES
        + SHEET_GENERATOR_TEST_MODAL_STYLES
        + PDF_EXPORT_TEST_MODAL_STYLES
        + APARTMENT_DATA_TEST_MODAL_STYLES;
    if (!existing) document.head.appendChild(style);
}

// ── Re-exports (public API — backward compatibility) ──────────────────────────
// These four constants were previously exported from AppTheme.ts directly.
// Re-exported from their new panel modules so any future consumers still work.
export { DESIGN_TOKENS } from './tokens';
export { RQP_PANEL_STYLES, VIZ_ENGINE_PANEL_STYLES, REAL_SUN_STYLES, FW_PANEL_STYLES } from './panels/renderingPanels';
