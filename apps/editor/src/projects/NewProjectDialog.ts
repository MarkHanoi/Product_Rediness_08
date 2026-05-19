// NewProjectDialog — modal name-input + optional `.pryzm` upload (S28).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`
//   §S28 D6 line 743 — "'New project' dialog — name input + template
//   picker (blank, from `.pryzm` file upload)."
//   §S28 D7 line 744 — "Import from `.pryzm` file: hub 'New from
//   file' → file picker → unpack() → create project → tier-streamed
//   load of the unpacked fixture."
//
// MVP: name input + import-from-file picker.  The actual unpack +
// hydrate path is invoked by the caller's `onSubmit` (the dialog
// just hands back `{ name, file? }`); this keeps the dialog
// independent of `@pryzm/file-format` and the loader.

export interface NewProjectSubmission {
  readonly name: string;
  /** When present, the caller `unpack()`s this and seeds the new
   *  project with the events / chunks it contains.  Optional — leave
   *  null for a blank project. */
  readonly file: File | null;
}

export interface MountNewProjectDialogOptions {
  readonly container: HTMLElement;
  readonly onSubmit: (sub: NewProjectSubmission) => void | Promise<void>;
  readonly onCancel: () => void;
  /** Default project name placeholder.  Defaults to `Untitled project`. */
  readonly defaultName?: string;
}

export interface NewProjectDialogHandle {
  /** Show an inline error message (used after a failed REST POST). */
  setError(message: string): void;
  dispose(): void;
}

export function mountNewProjectDialog(
  opts: MountNewProjectDialogOptions,
): NewProjectDialogHandle {
  const overlay = document.createElement('div');
  overlay.className = 'pryzm2-dialog-overlay';
  overlay.style.cssText = OVERLAY_CSS;

  const dialog = document.createElement('div');
  dialog.className = 'pryzm2-dialog';
  dialog.style.cssText = DIALOG_CSS;

  const title = document.createElement('h2');
  title.textContent = 'New project';
  title.style.cssText = 'margin:0 0 16px 0;font-size:18px;color:#cdd6f4;';
  dialog.appendChild(title);

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Name';
  nameLabel.style.cssText = LABEL_CSS;
  dialog.appendChild(nameLabel);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = opts.defaultName ?? 'Untitled project';
  nameInput.style.cssText = INPUT_CSS;
  nameInput.maxLength = 200;
  dialog.appendChild(nameInput);

  const fileLabel = document.createElement('label');
  fileLabel.textContent = 'Import from .pryzm file (optional)';
  fileLabel.style.cssText = `${LABEL_CSS};margin-top:16px;`;
  dialog.appendChild(fileLabel);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.pryzm,application/zip';
  fileInput.style.cssText = 'margin-bottom:8px;color:#cdd6f4;';
  dialog.appendChild(fileInput);

  const errorRow = document.createElement('div');
  errorRow.style.cssText = ERROR_CSS;
  errorRow.style.display = 'none';
  dialog.appendChild(errorRow);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:24px;';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = CANCEL_BTN_CSS;

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.textContent = 'Create';
  submitBtn.style.cssText = SUBMIT_BTN_CSS;

  btnRow.append(cancelBtn, submitBtn);
  dialog.appendChild(btnRow);

  overlay.appendChild(dialog);
  opts.container.appendChild(overlay);

  // ── handlers ──────────────────────────────────────────────────────────────
  let disposed = false;
  let busy = false;

  const handleCancel = (): void => {
    if (busy) return;
    opts.onCancel();
  };

  const handleSubmit = async (): Promise<void> => {
    if (busy || disposed) return;
    const name = nameInput.value.trim();
    if (name.length === 0) {
      handle.setError('Name is required.');
      return;
    }
    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';
    try {
      await opts.onSubmit({ name, file: fileInput.files?.[0] ?? null });
    } finally {
      if (!disposed) {
        busy = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create';
      }
    }
  };

  const handleKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') handleCancel();
    if (ev.key === 'Enter' && document.activeElement === nameInput) {
      ev.preventDefault();
      void handleSubmit();
    }
  };

  cancelBtn.addEventListener('click', handleCancel);
  submitBtn.addEventListener('click', () => void handleSubmit());
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) handleCancel();
  });
  document.addEventListener('keydown', handleKey);

  // Focus + select for instant typing.
  setTimeout(() => {
    if (!disposed) {
      nameInput.focus();
      nameInput.select();
    }
  }, 0);

  const handle: NewProjectDialogHandle = {
    setError(message: string): void {
      errorRow.textContent = message;
      errorRow.style.display = 'block';
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('keydown', handleKey);
      try { opts.container.removeChild(overlay); } catch { /* gone */ }
    },
  };
  return handle;
}

// ── styles ────────────────────────────────────────────────────────────────────

const OVERLAY_CSS = [
  'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.5)',
  'display:flex', 'align-items:center', 'justify-content:center',
  'z-index:100',
].join(';');

const DIALOG_CSS = [
  'background:#1e1e2e', 'border:1px solid #313244', 'border-radius:8px',
  'padding:24px', 'min-width:360px', 'max-width:480px',
  'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
  'font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif',
].join(';');

const LABEL_CSS = [
  'display:block', 'margin-bottom:6px', 'color:#cdd6f4',
  'font-size:13px', 'font-weight:500',
].join(';');

const INPUT_CSS = [
  'width:100%', 'box-sizing:border-box',
  'background:#181825', 'border:1px solid #45475a', 'border-radius:4px',
  'padding:8px 10px', 'color:#cdd6f4', 'font-size:14px',
  'outline:none',
].join(';');

const ERROR_CSS = [
  'margin-top:12px', 'padding:8px 10px',
  'background:rgba(243,139,168,0.1)', 'border:1px solid #f38ba8',
  'border-radius:4px', 'color:#f38ba8', 'font-size:13px',
].join(';');

const CANCEL_BTN_CSS = [
  'background:transparent', 'color:#cdd6f4',
  'border:1px solid #45475a', 'border-radius:4px',
  'padding:8px 16px', 'cursor:pointer', 'font-size:14px',
].join(';');

const SUBMIT_BTN_CSS = [
  'background:#89b4fa', 'color:#1a1f2e', 'border:none',
  'padding:8px 16px', 'border-radius:4px',
  'cursor:pointer', 'font-size:14px', 'font-weight:600',
].join(';');
