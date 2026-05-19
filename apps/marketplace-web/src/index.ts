// PRYZM Marketplace SPA — entry (Phase F / S59).
//
// Hash-routed (`#/browse`, `#/family/:id`, `#/submit`) so it works as a
// static build behind any path prefix.  No router framework — the whole
// app is small enough to live in three render functions.

import { renderBrowse } from './pages/browse.js';
import { renderDetail } from './pages/detail.js';
import { renderSubmit } from './pages/submit.js';

const root = document.getElementById('root');
if (!root) throw new Error('[marketplace-web] missing #root');

async function route(): Promise<void> {
  const hash = window.location.hash.replace(/^#/, '') || '/browse';
  if (hash.startsWith('/family/')) {
    const id = hash.slice('/family/'.length);
    await renderDetail(root!, id);
  } else if (hash === '/submit') {
    renderSubmit(root!);
  } else {
    await renderBrowse(root!);
  }
}

window.addEventListener('hashchange', () => {
  void route();
});

void route();
