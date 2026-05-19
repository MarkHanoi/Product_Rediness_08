// @pryzm/plugin-sdk — sandbox CSP + permission policy (S62 D4).
//
// Spec source:
//   • phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S62 D4
//     ("iframe sandbox + CSP policy + escape-tests")
//   • ADR-0038 §Decision B (sandbox model = iframe sandbox="allow-scripts")
//
// The iframe sandbox is `<iframe sandbox="allow-scripts">` (no
// `allow-same-origin`) so the plugin gets an opaque cross-origin frame.
// The plugin's iframe document also receives a Content-Security-Policy
// header that further locks down what scripts and connections are
// allowed; this module is the canonical source of that policy.

import type { PluginManifest } from '../descriptor';

/**
 * The fixed set of `sandbox` attribute tokens we apply to every plugin
 * iframe.  Order matters for some legacy parsers; we emit the tokens in
 * the spec-recommended sequence.  Notably MISSING:
 *
 *   • `allow-same-origin` — would defeat cross-origin isolation.
 *   • `allow-top-navigation` — a malicious plugin must not be able to
 *     yank the host out from under the user.
 *   • `allow-popups-to-escape-sandbox` — plugin popups stay sandboxed.
 *   • `allow-modals` — plugins are panels, not dialogs.
 *   • `allow-storage-access-by-user-activation` — no Storage Access API.
 */
export const SANDBOX_TOKENS = ['allow-scripts'] as const;

/**
 * Build the CSP string for a plugin's iframe based on its manifest's
 * `permissions` + `allowedOrigins`.  The CSP is delivered to the iframe
 * document via a `<meta http-equiv="Content-Security-Policy">` injected
 * before any script tag (since we cannot set HTTP headers on a Blob URL
 * uniformly across browsers — see ADR-0038 §Decision B point 3).
 *
 * The returned string is the raw CSP value (no `Content-Security-Policy:`
 * prefix); callers wrap it in the meta tag.
 */
export function buildPluginCSP(manifest: PluginManifest): string {
  const directives: string[] = [];

  // Default — strict deny except for self.
  directives.push(`default-src 'none'`);

  // Scripts — only the plugin's own bundle (delivered via the iframe's
  // initial document) and inline scripts (which the manifest's bundle
  // is permitted to use because we control the bundle authorship).
  directives.push(`script-src 'self' 'unsafe-inline'`);

  // Styles — same model as scripts.
  directives.push(`style-src 'self' 'unsafe-inline'`);

  // Images — the plugin's own bundle + data: URIs (for SVG icons).
  directives.push(`img-src 'self' data: blob:`);

  // Fonts — plugin bundle + data: URIs.
  directives.push(`font-src 'self' data:`);

  // Network — `network:fetch` permission gates outbound HTTP.  When the
  // permission is absent, `connect-src 'none'` blocks all fetch / XHR /
  // WebSocket / SSE / EventSource.  When present, only origins listed
  // in the manifest's `allowedOrigins` are reachable.
  if (manifest.permissions.includes('network:fetch')) {
    // Manifest schema enforces allowedOrigins.length > 0 when
    // network:fetch is granted (ADR-0038 §Decision E), but defend in
    // depth: if the array is somehow empty, deny all.
    const origins = manifest.allowedOrigins.length > 0 ? manifest.allowedOrigins.join(' ') : `'none'`;
    directives.push(`connect-src ${origins}`);
  } else {
    directives.push(`connect-src 'none'`);
  }

  // Frames + workers — plugins cannot nest frames or spawn workers in
  // v1.  The forthcoming `compute:background` permission (per ADR-0038
  // §Decision B) will relax this for worker spawning.
  directives.push(`frame-src 'none'`);
  directives.push(`worker-src 'none'`);

  // Object/embed — banned outright.
  directives.push(`object-src 'none'`);

  // Base-uri — pinned to self so the iframe cannot rewrite its base
  // and bypass the script-src directive.
  directives.push(`base-uri 'self'`);

  // Form-action — banned (plugins should not submit HTML forms; data
  // submission goes through the host proxies).
  directives.push(`form-action 'none'`);

  // Frame-ancestors — pinned to the host's origin so a third-party page
  // cannot iframe the plugin iframe and trick the user.
  directives.push(`frame-ancestors 'self'`);

  return directives.join('; ');
}

/**
 * Build the inline `<head>` HTML for the plugin iframe document.  The
 * caller wraps this in `<html><head>...</head><body>...</body></html>`.
 *
 * The order of `<meta>` tags matters: the CSP must be the first child
 * of `<head>` so it applies to every subsequent tag.
 */
export function buildIframeHeadHTML(manifest: PluginManifest): string {
  const csp = buildPluginCSP(manifest);
  return [
    `<meta charset="UTF-8">`,
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${escapeHtml(manifest.displayName)}</title>`,
  ].join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
