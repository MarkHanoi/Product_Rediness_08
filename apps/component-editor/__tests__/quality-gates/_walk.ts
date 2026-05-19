// Shared helpers for the §13 quality-gate tests (S52 D1–D3).
//
// Walks the package's `src/` tree (recursively) and returns either:
//   - `loadAllSrcFiles()` — full file objects (path + raw + comment-stripped)
//   - `listAllSrcEntries()` — just relative paths, of any extension
//
// `stripComments` removes block + line comments without nuking URLs
// (`http://…`).  Each gate asserts against the comment-stripped source
// so the rule docstring at the top of the file may freely mention the
// forbidden patterns.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
export const PKG_ROOT = path.resolve(here, '../..');
export const SRC_ROOT = path.join(PKG_ROOT, 'src');

export interface SourceFile {
  /** POSIX-style path relative to the package root, e.g. `src/sketch/snap.ts`. */
  readonly relPath: string;
  readonly content: string;
  /** `content` with all comments stripped. */
  readonly stripped: string;
}

export async function loadAllSrcFiles(): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  await walkTs(SRC_ROOT, out);
  return out;
}

export async function listAllSrcEntries(): Promise<string[]> {
  const out: string[] = [];
  await walkAny(SRC_ROOT, out);
  return out;
}

export function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (skip URLs like https://)
}

async function walkTs(dir: string, out: SourceFile[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkTs(abs, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      const content = await fs.readFile(abs, 'utf8');
      out.push({
        relPath: path.relative(PKG_ROOT, abs).split(path.sep).join('/'),
        content,
        stripped: stripComments(content),
      });
    }
  }
}

async function walkAny(dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkAny(abs, out);
    } else if (entry.isFile()) {
      out.push(path.relative(PKG_ROOT, abs).split(path.sep).join('/'));
    }
  }
}
