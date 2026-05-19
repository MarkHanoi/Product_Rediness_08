// ProjectHub — vanilla-DOM project hub view (S28).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`
//   §S28 D2 line 739 — "Project hub HTML skeleton.  Project card
//   component — thumbnail, name, meta, overflow menu (rename, delete,
//   export)."
//
// Architectural choice — vanilla DOM (no React) so the hub bundle
// stays out of the engine bundle.  The kill-switch boot in
// `src/main.ts` already operates on the DOM directly; the hub mirrors
// the same style, which keeps hub-load → first-paint snappy
// (S28 exit criterion: < 100 ms for 50 projects per §S28 D8 line 745).
//
// The hub is a *view* over a `ProjectListStore`; it does not own the
// store or the REST client.  Callers wire those up and pass them to
// `mountProjectHub({...})`, which returns a teardown function.

import type { ProjectListStore, ProjectSummary } from '@pryzm/stores';
import type { ProjectListClient } from '@pryzm/persistence-client';
import { ProjectListClientError } from '@pryzm/persistence-client';

import { renderProjectCard } from './ProjectCard.js';
import { mountNewProjectDialog } from './NewProjectDialog.js';
import { buildProjectUrl } from '../router.js';

export interface MountProjectHubOptions {
  /** Container the hub mounts into.  Cleared on mount; restored on
   *  teardown.  In `src/main.ts` this is `document.body`. */
  readonly container: HTMLElement;
  readonly store: ProjectListStore;
  readonly client: ProjectListClient;
  /** Called when the user clicks "open" on a card.  Default:
   *  `location.assign(buildProjectUrl(id))`.  Tests inject a stub. */
  readonly onOpenProject?: (projectId: string) => void;
  /** Optional logger for failure paths (defaults to `console.error`). */
  readonly onError?: (err: unknown, context: string) => void;
}

export interface ProjectHubHandle {
  /** Refetch from REST and re-render.  Useful after a focus event. */
  refresh(): Promise<void>;
  /** Tear down — removes the DOM, unsubscribes from the store, and
   *  cancels the pending REST request if one is in flight. */
  dispose(): void;
}

/** Mount the hub.  Idempotent: if `container` already contains a hub
 *  this throws — callers should `dispose()` an old handle first. */
export function mountProjectHub(opts: MountProjectHubOptions): ProjectHubHandle {
  const { container, store, client } = opts;
  const onOpen = opts.onOpenProject ?? defaultOpenProject;
  const onError = opts.onError ?? defaultOnError;

  if (container.dataset.pryzm2Hub === '1') {
    throw new Error('[ProjectHub] container already mounted; dispose first.');
  }
  container.dataset.pryzm2Hub = '1';

  // ── Skeleton DOM ──────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.className = 'pryzm2-hub';
  root.style.cssText = HUB_ROOT_CSS;

  const header = document.createElement('header');
  header.style.cssText = HUB_HEADER_CSS;

  const title = document.createElement('h1');
  title.textContent = 'Projects';
  title.style.cssText = HUB_TITLE_CSS;
  header.appendChild(title);

  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.textContent = '+ New project';
  newBtn.style.cssText = HUB_NEW_BTN_CSS;
  header.appendChild(newBtn);

  const grid = document.createElement('div');
  grid.className = 'pryzm2-hub-grid';
  grid.style.cssText = HUB_GRID_CSS;

  const status = document.createElement('div');
  status.className = 'pryzm2-hub-status';
  status.style.cssText = HUB_STATUS_CSS;

  root.append(header, status, grid);
  container.appendChild(root);

  // ── State ─────────────────────────────────────────────────────────────────
  let disposed = false;
  let inFlight: AbortController | null = null;
  let signInPanel: HTMLElement | null = null;

  // ── Render ────────────────────────────────────────────────────────────────
  const render = (): void => {
    if (disposed) return;
    const list = store.list();
    grid.innerHTML = '';
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = HUB_EMPTY_CSS;
      empty.textContent = 'No projects yet — click "New project" to get started.';
      grid.appendChild(empty);
      return;
    }
    for (const summary of list) {
      const card = renderProjectCard({
        summary,
        onOpen: () => onOpen(summary.id),
        onRename: () => void handleRename(summary),
        onDelete: () => void handleDelete(summary),
      });
      grid.appendChild(card);
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRefresh = async (): Promise<void> => {
    inFlight?.abort();
    inFlight = new AbortController();
    setStatus('loading');
    try {
      const projects = await client.list();
      if (disposed) return;
      store.replaceAll(projects);
      hideSignInPanel();
      setStatus('idle');
    } catch (err) {
      if (disposed) return;
      onError(err, 'list');
      // W3 — when the API rejects us as unauthenticated (no token, expired
      // token, or wrong user), show an inline sign-in panel rather than a
      // bare error message. After successful login we re-issue the request
      // automatically so the user lands on their project list.
      if (err instanceof ProjectListClientError && err.kind === 'unauthenticated') {
        setStatus('error', 'Sign in required.');
        showSignInPanel();
        return;
      }
      setStatus('error', errorMessage(err));
    }
  };

  const handleNew = (): void => {
    const dialog = mountNewProjectDialog({
      container: root,
      onSubmit: async ({ name, file }) => {
        try {
          const summary = await client.create(name);
          if (disposed) return;
          store.addProject(summary);
          dialog.dispose();
          // §S28 D7 (line 744) — "Import from `.pryzm` file: hub
          // 'New from file' → file picker → unpack() → create
          // project → tier-streamed load of the unpacked fixture."
          // The unpack + tier-stream wiring lives downstream of the
          // hub (the editor boots `bootHelloCube` for the new project
          // and the loader picks up the file from session storage on
          // next-tick).  For S28 we forward the file to a stash so
          // a follow-up sprint can hydrate it without re-prompting.
          if (file !== null) {
            try {
              sessionStorage.setItem(
                `pryzm2.import.${summary.id}`,
                JSON.stringify({ name: file.name, size: file.size }),
              );
            } catch { /* storage full — non-fatal */ }
          }
          // Open the new project immediately — matches the spec's
          // §S28 D7 "create → open" flow.
          onOpen(summary.id);
        } catch (err) {
          onError(err, 'create');
          dialog.setError(errorMessage(err));
        }
      },
      onCancel: () => dialog.dispose(),
    });
  };

  const handleRename = async (summary: ProjectSummary): Promise<void> => {
    const next = window.prompt('Rename project', summary.name);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length === 0 || trimmed === summary.name) return;
    try {
      await client.rename(summary.id, trimmed);
      if (disposed) return;
      store.renameProject(summary.id, trimmed);
    } catch (err) {
      onError(err, 'rename');
      window.alert(`Rename failed: ${errorMessage(err)}`);
    }
  };

  const handleDelete = async (summary: ProjectSummary): Promise<void> => {
    const ok = window.confirm(`Delete "${summary.name}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await client.delete(summary.id);
      if (disposed) return;
      store.removeProject(summary.id);
    } catch (err) {
      onError(err, 'delete');
      window.alert(`Delete failed: ${errorMessage(err)}`);
    }
  };

  // ── Sign-in panel (W3) ────────────────────────────────────────────────────
  const showSignInPanel = (): void => {
    if (signInPanel !== null) return;
    const panel = document.createElement('form');
    panel.style.cssText = HUB_SIGNIN_PANEL_CSS;

    const heading = document.createElement('h2');
    heading.textContent = 'Sign in to PRYZM';
    heading.style.cssText = HUB_SIGNIN_HEADING_CSS;

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Your session has expired. Sign in to load your projects.';
    subtitle.style.cssText = HUB_SIGNIN_SUBTITLE_CSS;

    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.placeholder = 'Email';
    emailInput.required = true;
    emailInput.autocomplete = 'email';
    emailInput.style.cssText = HUB_SIGNIN_INPUT_CSS;

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'Password';
    passwordInput.required = true;
    passwordInput.autocomplete = 'current-password';
    passwordInput.style.cssText = HUB_SIGNIN_INPUT_CSS;

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Sign in';
    submit.style.cssText = HUB_SIGNIN_SUBMIT_CSS;

    const errorLine = document.createElement('div');
    errorLine.style.cssText = HUB_SIGNIN_ERROR_CSS;

    panel.append(heading, subtitle, emailInput, passwordInput, submit, errorLine);

    panel.addEventListener('submit', (ev) => {
      ev.preventDefault();
      errorLine.textContent = '';
      submit.disabled = true;
      submit.textContent = 'Signing in…';
      void (async () => {
        try {
          const res = await fetch('/api/auth/signin', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              email: emailInput.value.trim(),
              password: passwordInput.value,
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error ?? `Sign-in failed (HTTP ${res.status}).`);
          }
          const json = await res.json();
          const token: string | undefined = json?.token;
          if (typeof token !== 'string' || token.length === 0) {
            throw new Error('Sign-in succeeded but no token was returned.');
          }
          try { localStorage.setItem('bim-platform-token', token); } catch { /* private mode */ }
          hideSignInPanel();
          await handleRefresh();
        } catch (err) {
          errorLine.textContent = errorMessage(err);
          submit.disabled = false;
          submit.textContent = 'Sign in';
        }
      })();
    });

    root.appendChild(panel);
    signInPanel = panel;
    emailInput.focus();
  };

  const hideSignInPanel = (): void => {
    if (signInPanel === null) return;
    try { root.removeChild(signInPanel); } catch { /* already gone */ }
    signInPanel = null;
  };

  const setStatus = (kind: 'idle' | 'loading' | 'error', message?: string): void => {
    if (kind === 'idle') {
      status.textContent = '';
      status.style.display = 'none';
      return;
    }
    status.style.display = 'block';
    status.style.color = kind === 'error' ? '#f38ba8' : '#cdd6f4';
    status.textContent = kind === 'loading'
      ? 'Loading projects…'
      : `Failed to load projects: ${message ?? 'unknown error'}`;
  };

  // ── Wiring ────────────────────────────────────────────────────────────────
  newBtn.addEventListener('click', handleNew);
  const unsubscribe = store.subscribeDirty(() => render());
  render();
  void handleRefresh();

  return {
    async refresh(): Promise<void> {
      await handleRefresh();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      inFlight?.abort();
      unsubscribe();
      newBtn.removeEventListener('click', handleNew);
      try { container.removeChild(root); } catch { /* already removed */ }
      delete container.dataset.pryzm2Hub;
    },
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function defaultOpenProject(projectId: string): void {
  if (typeof location !== 'undefined') {
    location.assign(buildProjectUrl(projectId, location.search));
  }
}

function defaultOnError(err: unknown, context: string): void {
  // eslint-disable-next-line no-console
  console.error(`[ProjectHub] ${context} failed:`, err);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ── styles ────────────────────────────────────────────────────────────────────
// Inlined to keep the hub a single self-contained module; matches the
// existing kill-switch boot's inline-style pattern in `src/main.ts`.

const HUB_ROOT_CSS = [
  'position:fixed', 'inset:0',
  'background:#1a1f2e', 'color:#cdd6f4',
  'font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif',
  'overflow:auto', 'padding:32px',
  'box-sizing:border-box',
].join(';');

const HUB_HEADER_CSS = [
  'display:flex', 'align-items:center', 'justify-content:space-between',
  'margin-bottom:24px',
].join(';');

const HUB_TITLE_CSS = ['margin:0', 'font-size:24px', 'font-weight:600'].join(';');

const HUB_NEW_BTN_CSS = [
  'background:#89b4fa', 'color:#1a1f2e', 'border:none',
  'padding:8px 16px', 'border-radius:6px', 'font-weight:600',
  'cursor:pointer', 'font-size:14px',
].join(';');

const HUB_STATUS_CSS = [
  'display:none', 'margin-bottom:16px', 'font-size:13px',
].join(';');

const HUB_GRID_CSS = [
  'display:grid',
  'grid-template-columns:repeat(auto-fill,minmax(240px,1fr))',
  'gap:16px',
].join(';');

const HUB_EMPTY_CSS = [
  'grid-column:1/-1', 'text-align:center', 'padding:48px',
  'color:#7f849c', 'border:1px dashed #45475a', 'border-radius:8px',
].join(';');

const HUB_SIGNIN_PANEL_CSS = [
  'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
  'min-width:320px', 'max-width:90vw',
  'background:#11141c', 'border:1px solid #45475a', 'border-radius:10px',
  'padding:24px', 'display:flex', 'flex-direction:column', 'gap:12px',
  'box-shadow:0 18px 48px rgba(0,0,0,0.55)', 'z-index:20',
].join(';');

const HUB_SIGNIN_HEADING_CSS = [
  'margin:0', 'font-size:18px', 'font-weight:600',
].join(';');

const HUB_SIGNIN_SUBTITLE_CSS = [
  'margin:0 0 8px 0', 'color:#a6adc8', 'font-size:13px', 'line-height:1.4',
].join(';');

const HUB_SIGNIN_INPUT_CSS = [
  'background:#1a1f2e', 'color:#cdd6f4', 'border:1px solid #45475a',
  'border-radius:6px', 'padding:8px 10px', 'font:inherit', 'font-size:14px',
].join(';');

const HUB_SIGNIN_SUBMIT_CSS = [
  'background:#89b4fa', 'color:#1a1f2e', 'border:none',
  'padding:10px 16px', 'border-radius:6px', 'font-weight:600',
  'cursor:pointer', 'font-size:14px',
].join(';');

const HUB_SIGNIN_ERROR_CSS = [
  'color:#f38ba8', 'font-size:12px', 'min-height:16px',
].join(';');
