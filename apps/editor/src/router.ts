// router — pure URL parser for the PRYZM 2 client.
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`
//   §S28 D4 line 741 — "Deep-link routing: apps/editor/src/router.ts —
//   maps pathname to ProjectHubView or ProjectEditorView. bootstrap.ts
//   reads the route at startup."
//
// PRYZM 1 mounts at the same origin under all "no `?pryzm2=1`" URLs;
// to avoid breaking exit-criterion #5 ("PRYZM 1 hub unchanged at
// default URL"), routing is gated on the `?pryzm2=1` flag.  Within
// the PRYZM 2 surface, `?project=<id>` selects the project to open;
// no `?project=` means "show the hub".
//
// We deliberately use the query string instead of the pathname even
// though the spec mentions `/project/:id`.  The reason is simple: the
// PRYZM 1 router (`PlatformRouter`) already owns the pathname, and
// rebinding it would require either (a) reaching past the kill-switch
// in src/main.ts (forbidden — `?pryzm2=1` MUST short-circuit before
// PlatformRouter loads) or (b) configuring the dev/prod server to
// serve index.html for `/project/*` (a deployment change).  A future
// sprint can swap the parser for a pathname-based one without
// changing any caller; today this keeps the kill-switch contract
// intact and the routing implementation 30 lines.

/** The three routes the PRYZM 2 client knows about. */
export type Pryzm2Route =
  | { readonly kind: 'hub' }
  | { readonly kind: 'project'; readonly projectId: string }
  /** "Not a PRYZM 2 URL" — `src/main.ts` falls through to the
   *  PlatformRouter for these; included in the union so callers can
   *  exhaustively switch on the route. */
  | { readonly kind: 'legacy' };

/** The query-string flag that gates the entire PRYZM 2 surface
 *  (S06-T7 / K1A-4 — see `src/main.ts`). */
export const PRYZM2_FLAG = 'pryzm2';

/** The query-string key that selects the project to open. */
export const PRYZM2_PROJECT_PARAM = 'project';

/** Parse a URL into a route.  Accepts a `URL`, a string URL, or just
 *  a search string (`?pryzm2=1&project=abc`).  Pure — no DOM access. */
export function parseRoute(input: string | URL | URLSearchParams): Pryzm2Route {
  const params = toParams(input);
  if (params.get(PRYZM2_FLAG) !== '1') return { kind: 'legacy' };
  const projectId = params.get(PRYZM2_PROJECT_PARAM);
  if (projectId !== null && projectId.length > 0) {
    return { kind: 'project', projectId };
  }
  return { kind: 'hub' };
}

/** Build the URL that opens the hub.  Preserves the `mode` param if
 *  the caller passes the current location (so `&mode=webgpu` survives
 *  hub → project → hub navigations). */
export function buildHubUrl(currentSearch?: string | URL | URLSearchParams): string {
  const params = new URLSearchParams();
  params.set(PRYZM2_FLAG, '1');
  const mode = currentSearch !== undefined ? toParams(currentSearch).get('mode') : null;
  if (mode === 'webgpu' || mode === 'webgl2') params.set('mode', mode);
  return `?${params.toString()}`;
}

/** Build the URL that opens a specific project. */
export function buildProjectUrl(
  projectId: string,
  currentSearch?: string | URL | URLSearchParams,
): string {
  if (typeof projectId !== 'string' || projectId.length === 0) {
    throw new Error('[router] buildProjectUrl: projectId required.');
  }
  const params = new URLSearchParams();
  params.set(PRYZM2_FLAG, '1');
  params.set(PRYZM2_PROJECT_PARAM, projectId);
  const mode = currentSearch !== undefined ? toParams(currentSearch).get('mode') : null;
  if (mode === 'webgpu' || mode === 'webgl2') params.set('mode', mode);
  return `?${params.toString()}`;
}

// ── internal ────────────────────────────────────────────────────────────────

function toParams(input: string | URL | URLSearchParams): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (input instanceof URL) return input.searchParams;
  // String — could be `?foo=bar`, `foo=bar`, or a full URL.
  const s = input.trim();
  if (s.startsWith('http://') || s.startsWith('https://')) {
    return new URL(s).searchParams;
  }
  return new URLSearchParams(s.startsWith('?') ? s.slice(1) : s);
}
