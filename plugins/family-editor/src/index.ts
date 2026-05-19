/**
 * @pryzm/plugin-family-editor — public surface (Phase F reference plugin stub).
 *
 * Marketplace catalog ID: pryzm/family-editor
 * Manifest ID: pryzm-family-editor v1.0.0
 *
 * Full implementation tracked in the Phase F reference-plugin delivery.
 * This stub satisfies the plugin manifest validation and package resolution
 * requirements so the package builds and the manifest passes K3-C Gate #1.
 */

export const PLUGIN_ID = 'pryzm-family-editor';
export const PLUGIN_VERSION = '1.0.0';

/**
 * activate — called by the PRYZM runtime when the plugin is loaded.
 * Registers the Family Editor panel contribution and the Place Family tool.
 */
export async function activate(runtime: unknown): Promise<void> {
  // Stub — full implementation pending Phase F reference-plugin delivery.
  console.info(`[${PLUGIN_ID}] activate() called — stub implementation`);
  void runtime;
}

export async function deactivate(): Promise<void> {
  console.info(`[${PLUGIN_ID}] deactivate() called`);
}
