// tools/ga-gate/lib — THE PANEL PROPERTY SURFACE, in one place
// =============================================================================
//
// "Every dimension and property a user can see" is the DENOMINATOR of two
// different questions, and until 2026-08-21 only one of them had an answer:
//
//   · can the user SET it by sentence?  → check-chat-capability-coverage check 9
//   · can the user ASK for it?          → check-property-rac-matrix (L-2211)
//
// Both need the same denominator. It lives HERE, once, because two gates
// computing "what the panel offers" from two copies of the same regex is the
// two-sources-of-truth defect this repository keeps re-finding — and the one
// that drifts does so silently, in the direction of looking better.
//
// ── THE TWO HALVES OF THE SURFACE, AND WHY THE SECOND ONE MATTERS ───────────
//
// **A — the SCHEMAS table** in `PropertyDescriptorGenerator.ts`: the data-driven
// rows, every non-READONLY one. This is what check 9 has always read.
//
// **B — the DEDICATED sections.** check 9's own header names this as limit (1)
// and is explicit about the cost: *"`WindowSection` / `DoorSection` own
// width/height/sillHeight/type/colour and the table says so in its own comments,
// so window and door look far emptier here than they are"*. Measured
// 2026-08-21, the SCHEMAS table gives a WINDOW seven rows, of which exactly ONE
// (`mark`) is editable — while `WindowSection.ts` renders nineteen editable
// controls including every dimension a user actually reaches for.
//
// ⭐ That gap is not academic: WINDOWS AND DOORS ARE THE TWO FAMILIES THE
// FOUNDER ASKS ABOUT MOST, and they were the two the denominator could see least
// of. Half B is read here so both gates get the whole surface.
//
// ── WHAT THIS STILL CANNOT SEE, stated so nobody reads it as full coverage ──
//
//  1. A field on a `*Data` record that NO panel row exposes. Invisible to the
//     panel and therefore to this. (The record inventory is a different subject
//     with a different denominator — see ADR-0345 §4.)
//  2. Whether a field the panel offers is LIVE. A dead control is counted as a
//     property here; `check-chat-capability-coverage`'s checks 3b/3d own that
//     question, and `PropertyVocabulary`'s honesty bar owns it for the chat.
//  3. The ROOM panel, which is not table-driven at all (`RoomPropertySection.ts`
//     is hand-built cards). Named in the matrix ledger rather than parsed, so
//     the shortfall is countable instead of implied.
//  4. Sub-element panels (curtain panel / mullion), same reason.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Repo-relative, resolved against the caller's repo root. */
export const PROPERTY_PANEL_SCHEMA_FILE =
  'apps/editor/src/ui/property-panel/PropertyDescriptorGenerator.ts';

/**
 * Half B — the panels that render their family's real controls OUTSIDE the
 * SCHEMAS table. Each declares the regex that finds a control's FIELD KEY in
 * that file, because the three files use three different builders and a single
 * pattern would silently match none of them.
 */
export interface DedicatedSection {
  readonly kind: string;
  readonly file: string;
  /**
   * How the section names a field. TWO shapes, because the three files really
   * do use two different idioms and one pattern would silently match none of
   * them — a section that contributes nothing makes its family look COMPLETE,
   * which is the failure direction that matters.
   *
   *  'write-object' — the key is a property of the object handed to the write
   *    (`dispatch(windowId, { width: v })`, `push({ revealProjection: v })`).
   *    EVERY key in the literal counts: "Splay all sides" writes four at once
   *    and a first-key-only read would lose three real properties.
   *  'second-string' — the key is the second quoted argument of a row builder
   *    (`this._buildNumberRow('Overhang (m)', 'overhang', …)`).
   */
  readonly shape: 'write-object' | 'second-string';
  /** Matches the WRITE CALL; group 1 is the object body / the field key. */
  readonly callRe: RegExp;
  /** Keys the section writes that are NOT element properties. */
  readonly exclude: readonly string[];
  readonly note: string;
}

export const DEDICATED_SECTIONS: readonly DedicatedSection[] = [
  {
    kind: 'window',
    file: 'packages/geometry-window/src/WindowSection.ts',
    shape: 'write-object',
    callRe: /(?:dispatch\(\s*\w+\s*,\s*|push\(\s*)\{([^{}]*)\}/g,
    exclude: [],
    note: 'Window Parameters — the section the SCHEMAS table defers to in its own comment (:119-120).',
  },
  {
    kind: 'door',
    file: 'packages/geometry-door/src/DoorSection.ts',
    shape: 'write-object',
    callRe: /(?:dispatch\(\s*\w+\s*,\s*|push\(\s*)\{([^{}]*)\}/g,
    exclude: [],
    note: 'Door Parameters — same deferral, same reason (:131-132).',
  },
  {
    kind: 'roof',
    file: 'apps/editor/src/ui/property-panel/RoofPropertySheet.ts',
    shape: 'second-string',
    callRe: /_build(?:Number|Color|Check|Auto)\w*Row\(\s*'[^']*'\s*,\s*'([a-zA-Z][\w.]*)'/g,
    exclude: [],
    note: 'Roof Parameters — renders Thickness / Base Offset / Slope a SECOND time, on different units and a different command.',
  },
];

/**
 * Keys of a single-level object literal, in source order.
 *
 * ⛔ COMPUTED KEYS ARE SKIPPED, and the reason is a measured false cell. The
 * window section writes one splay side through `push({ [field]: v })` inside a
 * loop over `REVEAL_SIDES`; an earlier draft of this parser accepted `[field]:`
 * and minted a property literally named **`window.field`**, which the matrix
 * then reported as a SILENT cell — a defect invented by the measuring
 * instrument. Nothing real is lost: the same four sides are written by name in
 * the "Splay all sides" handler two lines below, so `revealSplayHead`,
 * `revealSplaySill`, `revealSplayJambLeft` and `revealSplayJambRight` are all
 * still counted.
 */
function objectKeys(body: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[,{])\s*('?)([a-zA-Z][\w]*)\1\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.push(m[2]!);
  return out;
}

/**
 * Half A — the SCHEMAS table. Lifted verbatim from
 * `check-chat-capability-coverage.ts` (where it was `panelEditableProperties`)
 * so the two gates cannot disagree; the parsing rules are unchanged.
 */
export function schemaTableProperties(repo: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const abs = resolve(repo, PROPERTY_PANEL_SCHEMA_FILE);
  if (!existsSync(abs)) return out;
  const src = readFileSync(abs, 'utf8');
  const start = src.indexOf('const SCHEMAS');
  if (start === -1) return out;
  const body = src.slice(start, src.indexOf('\n};', start));

  // Each element-kind block opens at four-space indentation: `wall: {`.
  const kindRe = /\n {4}'?([a-zA-Z][\w-]*)'?:\s*\{/g;
  const marks: { kind: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = kindRe.exec(body)) !== null) marks.push({ kind: m[1]!, at: m.index + m[0].length });

  for (let i = 0; i < marks.length; i += 1) {
    const slice = body.slice(marks[i]!.at, i + 1 < marks.length ? marks[i + 1]!.at : body.length);
    const kind = marks[i]!.kind;
    const fields = out.get(kind) ?? new Set<string>();
    const fieldRe = /\n\s+'?([a-zA-Z][\w.]*)'?:\s*(TEXT|NUMBER|BOOL|ENUM|COLOR|READONLY)\(([^\n]*)/g;
    let f: RegExpExecArray | null;
    while ((f = fieldRe.exec(slice)) !== null) {
      if (f[2] === 'READONLY') continue;
      // `NUMBER(label, section, category, /* editable */ false, …)`
      if (/,\s*false\s*[,)]/.test(f[3]!)) continue;
      fields.add(f[1]!);
    }
    out.set(kind, fields);
  }
  return out;
}

export interface PanelSurface {
  /** kind → editable field keys, halves A and B unioned. */
  readonly byKind: ReadonlyMap<string, ReadonlySet<string>>;
  /** Files actually read — a FLOOR input: an empty parse is never a pass. */
  readonly filesRead: readonly string[];
  /** Half-B sections whose file was missing or whose regex matched nothing. */
  readonly unreadSections: readonly string[];
  /** Fields contributed by half B alone, `kind.field`, sorted. */
  readonly fromDedicatedSections: readonly string[];
}

/**
 * The whole panel surface. `normalize` is INJECTED (`normalizeElementKind` from
 * the chat registry) so this module stays free of any ai-host import — the two
 * consumers already hold that dependency and one naming authority is enough.
 */
export function panelPropertySurface(
  repo: string,
  normalize: (raw: string) => string,
): PanelSurface {
  const byKind = new Map<string, Set<string>>();
  const filesRead: string[] = [];
  const unreadSections: string[] = [];
  const fromDedicated: string[] = [];

  const tableAbs = resolve(repo, PROPERTY_PANEL_SCHEMA_FILE);
  if (existsSync(tableAbs)) filesRead.push(PROPERTY_PANEL_SCHEMA_FILE);
  for (const [rawKind, fields] of schemaTableProperties(repo)) {
    const kind = normalize(rawKind);
    const set = byKind.get(kind) ?? new Set<string>();
    for (const f of fields) set.add(f);
    byKind.set(kind, set);
  }

  for (const section of DEDICATED_SECTIONS) {
    const abs = resolve(repo, section.file);
    if (!existsSync(abs)) {
      unreadSections.push(`${section.file} DOES NOT EXIST — ${section.kind} is measured from half A only`);
      continue;
    }
    const src = readFileSync(abs, 'utf8');
    filesRead.push(section.file);
    const kind = normalize(section.kind);
    const set = byKind.get(kind) ?? new Set<string>();
    const before = set.size;
    const re = new RegExp(section.callRe.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const keys = section.shape === 'write-object' ? objectKeys(m[1]!) : [m[1]!];
      for (const key of keys) {
        if (section.exclude.includes(key)) continue;
        if (!set.has(key)) fromDedicated.push(`${kind}.${key}`);
        set.add(key);
      }
    }
    byKind.set(kind, set);
    if (set.size === before) {
      unreadSections.push(
        `${section.file} matched NO field keys — the builder was probably renamed. ` +
        `A section that silently contributes nothing makes ${section.kind} look complete when it is not.`,
      );
    }
  }

  return {
    byKind,
    filesRead,
    unreadSections,
    fromDedicatedSections: [...new Set(fromDedicated)].sort(),
  };
}
