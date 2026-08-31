// P3 AXIS C scanner. READ-ONLY. Replicates check-verb-register.ts discovery
// (TYPE_DECL_RE + handlerish) so every row carries a file:line, then applies
// contract/must-not regexes to the handler SLICE and the whole FILE.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'audit/full-stack/2026-08-31/commands/_raw');
const HANDLER_ROOTS = ['plugins', 'apps/editor/src/engine', 'packages/command-registry/src'];

function* walk(dir) {
  let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(e.name)) yield p;
  }
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

const TYPE_DECL_RE = new RegExp(
  String.raw`(?:^|\n)\s*(?:public\s+|readonly\s+|static\s+)*type\s*` +
  String.raw`(?::\s*'([a-z][\w-]*(?:\.[\w-]+)*)'|(?::\s*[^=\n;]+)?=\s*'([a-z][\w-]*(?:\.[\w-]+)*)')`,
  'g');
const STRICT_RE = /\b(affectedStores|stores)\s*[:=]/;
const SPEC_RE = /\bvalidate\s*:/;
const SPEC_BODY_RE = /\b(run|fn)\s*:/;
function handlerish(verb, slice, r) {
  const head = slice.slice(0, 900);
  const strict = STRICT_RE.test(head) || (r.startsWith('apps/editor/src/engine/') && SPEC_RE.test(head) && SPEC_BODY_RE.test(head));
  if (strict) return true;
  if (!verb.includes('.')) return false;
  return /\/src\/handlers\//.test(r);
}

const registry = new Map();
let filesRead = 0;
for (const dir of HANDLER_ROOTS) {
  for (const abs of walk(path.join(ROOT, dir))) {
    const r = rel(abs);
    if (/\.(test|spec)\.tsx?$/.test(r)) continue;
    if (r.includes('/__tests__/')) continue;
    let src; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    filesRead++;
    TYPE_DECL_RE.lastIndex = 0;
    const hits = []; let m;
    while ((m = TYPE_DECL_RE.exec(src)) !== null) hits.push({ verb: m[1] ?? m[2], at: m.index });
    const lineOf = (idx) => src.slice(0, idx).split('\n').length;
    for (let i = 0; i < hits.length; i++) {
      const slice = src.slice(hits[i].at, hits[i + 1]?.at ?? src.length);
      if (!handlerish(hits[i].verb, slice, r)) continue;
      const list = registry.get(hits[i].verb) ?? [];
      if (!list.some((s) => s.file === r)) list.push({ file: r, line: lineOf(hits[i].at), len: slice.length, slice, fileSrc: src });
      registry.set(hits[i].verb, list);
    }
  }
}

// ── flags ────────────────────────────────────────────────────────────────────
const F = {
  validates:      (s) => /\bcanExecute\s*[:(]/.test(s) || /\bvalidate\s*:/.test(s),
  domainError:    (s) => /DomainError|CommandValidationError|CapabilityRefusal|\brefusal\b/.test(s),
  immerDraft:     (s) => /\bdraft\b/.test(s) || /produceCommand|producePatches|\bproduce\(/.test(s),
  affectedStores: (s) => /\baffectedStores\s*[:=]/.test(s),
  span:           (s) => /withHandlerSpan|withSpan|startActiveSpan/.test(s),
  emitsEvent:     (s) => /events?\.emit\(|emitDomainEvent|\bemit\(/.test(s),
  frameSched:     (s) => /frameScheduler|FrameScheduler|scheduleGeometry|onFrame|requestFrame/.test(s),
  batchShape:     (s) => /\bcompleted\b/.test(s) && /\bfailed\b/.test(s),
  batchNotAtt:    (s) => /notAttempted/.test(s),
  batchUndoUnits: (s) => /undoUnits/.test(s),
  // must-nots
  mnCommandMgr:   (s) => /commandManager\s*[.[]|commandManager\?\./.test(s),
  mnWindowDispatch:(s)=> /window\.dispatchEvent|dispatchEvent\(/.test(s),
  mnDom:          (s) => /\bdocument\.|window\.(?!__|pryzm)/.test(s),
  mnRaf:          (s) => /requestAnimationFrame/.test(s),
  mnCascade:      (s) => /executeCommand\(|\bbus\.(execute|dispatch)\(|commandBus\.(execute|dispatch)\(/.test(s),
  storeSingleton: (s) => /import\s*\{[^}]*\b(get)?[a-zA-Z]+Store\b[^}]*\}\s*from/.test(s),
};
const storeNames = (s) => {
  const m = /affectedStores\s*[:=]\s*\[([^\]]*)\]/.exec(s);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};

const cebCases = new Set(readFileSync(path.join(OUT, 'ceb-cases.txt'), 'utf8').trim().split('\n').map((l) => l.split(' ')[1]));
const levelVerbs = new Set(readFileSync(path.join(OUT, 'level-change-verbs.txt'), 'utf8').trim().split('\n'));
const updVerbs = new Set(readFileSync(path.join(OUT, 'element-update-verbs.txt'), 'utf8').trim().split('\n'));

const KIND = (v) => {
  if (/\.batch\.create$/.test(v)) return 'batch.create';
  if (/\.create$|\bcreate[A-Z]/.test(v) || /\.create/.test(v)) return 'create';
  if (/\.delete$|\.remove[A-Z]|\.delete/.test(v)) return 'delete';
  if (/\.move$|\.changeLevel$|\.setPosition|\.translate/.test(v)) return 'move';
  if (/\.split/.test(v)) return 'split';
  if (/\.join|\.merge/.test(v)) return 'join';
  if (/regenerate|rebuild|refresh/i.test(v)) return 'regenerate';
  if (/\.set[A-Z]|\.update|\.attach|\.detach|\.toggle|\.rename|\.assign|\.apply|\.add[A-Z]/.test(v)) return 'update';
  return 'other';
};
const FAM = (v) => v.includes('.') ? v.split('.')[0] : v;

const rows = [];
for (const [verb, sites] of [...registry.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const primary = sites[0];
  const s = primary.slice;
  const fileSrc = primary.fileSrc;
  rows.push({
    verb, family: FAM(verb), kind: KIND(verb),
    sites: sites.map((x) => `${x.file}:${x.line}`),
    siteCount: sites.length,
    contract: {
      validates: F.validates(s), domainError: F.domainError(s), immerDraft: F.immerDraft(s),
      affectedStores: F.affectedStores(s), stores: storeNames(s),
      withHandlerSpan: F.span(s), emitsEvent: F.emitsEvent(s), frameScheduler: F.frameSched(s),
      storeSingletonImportInFile: F.storeSingleton(fileSrc),
    },
    mustNots: {
      commandManager: F.mnCommandMgr(s), windowDispatchEvent: F.mnWindowDispatch(s),
      dom: F.mnDom(s), rAF: F.mnRaf(s), cascadingDispatch: F.mnCascade(s),
    },
    mirror: { cebCase: cebCases.has(verb), inElementUpdateVerbs: updVerbs.has(verb), inLevelChangeVerbs: levelVerbs.has(verb) },
    batch: { completedFailed: F.batchShape(s), notAttempted: F.batchNotAtt(s), undoUnits: F.batchUndoUnits(s) },
  });
}
writeFileSync(path.join(OUT, 'verb-rows.json'), JSON.stringify({ filesRead, verbs: rows.length, rows }, null, 1));
console.log('filesRead', filesRead, 'verbs', rows.length);
const byFam = {};
for (const r of rows) { (byFam[r.family] ??= []).push(r.verb); }
console.log('families', Object.keys(byFam).length);
