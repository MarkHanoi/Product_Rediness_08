/**
 * @file src/engine/subsystems/styles/panels/platformShell.ts
 *
 * Re-export barrel — each CSS constant lives in its own file under
 * platform-shell/. All 8 named exports are forwarded here.
 *
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export { PLATFORM_SHELL_STYLES } from './platform-shell/platformToolbar';
export { WMB_STYLES } from './platform-shell/workspaceModeBar';
export { RIBBON_STYLES } from './platform-shell/ribbonMenu';
export { APP_MENU_STYLES } from './platform-shell/appMenu';
export { PROPERTIES_PALETTE_STYLES } from './platform-shell/propertiesPalette';
export { CEB_STYLES } from './platform-shell/contextualEditBar';
export { OSP_STYLES } from './platform-shell/ownerSettingsPanel';
export { EAB_STYLES } from './platform-shell/earlyAccessBanner';
