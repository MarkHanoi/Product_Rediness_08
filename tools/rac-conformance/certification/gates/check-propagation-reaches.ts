// ─── GATE · check-propagation-reaches ────────────────────────────────────────
//
// Wave 3 of docs/03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md:
//
//   "every declared cascade event has at least one listener AND its emitter
//    carries prevState. EV-03 proved EITHER ALONE IS INSUFFICIENT ... Assert
//    both halves or the gate is theatre."
//
// The ledger, the four events, and the argument for why both arms are required
// live in ./cascade-events.json — read it first; this file is only the mechanism.
//
// ARM A · A LISTENER EXISTS. A production source (not the catalog declaration,
// not the emitter itself, not a test) registers a handler for the event name.
// Every shape the estate actually uses is accepted:
//     addEventListener('<name>', …)  ·  .on('<name>', …)  ·  events.on('<name>')
//     .subscribe('<name>', …)        ·  runtime.events.on('<name>')
// The gate is deliberately GENEROUS here. A false NEGATIVE (a real listener the
// regex missed) would be the worst failure available — it would report a defect
// that is not there, and this gate's whole authority is that its findings are real.
//
// ARM B · prevState REACHES THE EMITTER, IN TWO PLACES, BOTH REQUIRED:
//   B1 — the emitter's TRIGGER SOURCE type declares a pre-mutation field. This is
//        the one EV-03 §7.2 names: DependencyResolver subscribes to storeEventBus,
//        whose StoreChangeEvent is {elementId, elementType, operation, timestamp},
//        so the §STEP7 third argument that ten stores go to the trouble of emitting
//        never arrives. Passing B1 means the emitter COULD forward a prev state.
//   B2 — the event's own typed catalog entry declares one. Passing B2 means the
//        emitter DOES, and that a listener can rely on it.
// B1 without B2 is a source that has the data and drops it. B2 without B1 is a
// contract promising data nobody holds. Only both is propagation.
//
// WHY THIS IS A STATIC GATE AND NOT A RUNTIME ONE: "has a listener" is a claim
// about the whole estate, and no headless world composes the whole estate — the
// certification world itself registers 9 plugin bridges out of 48 plugins. A
// runtime probe would answer "no listener in THIS world", which is a different
// and much weaker sentence than the one the criterion asks for.

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';
import { collectSources } from './scan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const LEDGER = resolve(__dirname, 'cascade-events.json');

interface EventDecl {
  name: string; emitterFile: string; triggerTypeFile: string; triggerType: string; why: string;
}
interface Ledger { events: EventDecl[]; catalogFile: string; declaredFindings: string[] }

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];
const stale: string[] = [];

const ledger: Ledger | null = existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger) : null;
floors.push({ what: 'cascade-events.json ledger present', measured: ledger ? 1 : 0, min: 1 });
floors.push({ what: 'cascade events declared', measured: ledger?.events.length ?? 0, min: 1 });

// A source sweep that walked an empty tree would report "no listener anywhere"
// for every event and look like a maximal finding. The floor makes that exit 2.
const sources = collectSources(REPO, ['packages', 'plugins', 'apps', 'src', 'server']);
floors.push({ what: 'production .ts/.tsx files scanned', measured: sources.length, min: 1500 });

const catalogPath = ledger ? resolve(REPO, ledger.catalogFile) : '';
const catalogText = catalogPath && existsSync(catalogPath) ? readFileSync(catalogPath, 'utf8') : '';
const catalogEntries = (catalogText.match(/^\s*'[^']+':/gm) ?? []).length;
floors.push({ what: 'typed entries readable in the event catalog', measured: catalogEntries, min: 200 });

/** ARM A — every listener-registration shape the estate uses. */
function listenerSites(name: string, emitterFile: string): string[] {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(addEventListener|removeEventListener|\\.on|\\.once|\\.subscribe|handle|listen)\\s*(<[^>]*>)?\\s*\\(\\s*['"\`]${esc}['"\`]`,
  );
  const hits: string[] = [];
  for (const f of sources) {
    if (f.rel === emitterFile) continue;          // the emitter is not its own listener
    if (f.rel === ledger?.catalogFile) continue;  // a type declaration is not a listener
    if (!f.text.includes(name)) continue;
    if (re.test(f.text)) hits.push(f.rel);
  }
  return hits;
}

/** Extract the body of `interface <T>` / `type <T> = {` from a source text. */
function typeBody(text: string, typeName: string): string | null {
  const m = new RegExp(`(?:interface|type)\\s+${typeName}\\b[^{]*\\{`).exec(text);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(m.index, i + 1); }
  }
  return null;
}

const PREV_FIELD = /\b(prevState|previousState|prev|previous|before|priorState|_prev)\s*\??\s*:/;

/** The event's own line in the typed catalog. */
function catalogEntry(name: string): string | null {
  const m = new RegExp(`^\\s*'${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':.*$`, 'm').exec(catalogText);
  return m ? m[0] : null;
}

if (ledger && floors.every((f) => f.measured >= f.min)) {
  for (const ev of ledger.events) {
    // ── ARM A ────────────────────────────────────────────────────────────────
    const hits = listenerSites(ev.name, ev.emitterFile);
    if (hits.length === 0) {
      findingNames.push(`${ev.name}:ARM-A no listener`);
      lines.push(`❌ ARM A ${ev.name}: 0 listeners in ${sources.length} scanned files. The event is emitted into nothing.`);
    } else {
      lines.push(`✓  ARM A ${ev.name}: ${hits.length} listener(s) — ${hits.slice(0, 3).join(', ')}`);
    }

    // ── ARM B ────────────────────────────────────────────────────────────────
    const emitterPath = resolve(REPO, ev.emitterFile);
    const triggerPath = resolve(REPO, ev.triggerTypeFile);
    if (!existsSync(emitterPath) || !existsSync(triggerPath)) {
      // A ledger that names a file which does not exist is MISCONFIGURED, not a
      // finding — the gate has lost its subject. Surfaced as a floor so it exits 2.
      floors.push({ what: `ledger paths for ${ev.name} exist on disk`, measured: 0, min: 1 });
      continue;
    }
    const triggerText = readFileSync(triggerPath, 'utf8');
    const body = typeBody(triggerText, ev.triggerType);
    const b1 = body !== null && PREV_FIELD.test(body);
    const entry = catalogEntry(ev.name);
    const b2 = entry !== null && PREV_FIELD.test(entry);

    if (body === null) {
      floors.push({ what: `${ev.triggerType} is readable in ${ev.triggerTypeFile}`, measured: 0, min: 1 });
      continue;
    }
    if (entry === null) {
      floors.push({ what: `${ev.name} has a typed catalog entry`, measured: 0, min: 1 });
      continue;
    }

    if (!b1 || !b2) {
      findingNames.push(`${ev.name}:ARM-B emitter carries no prevState`);
      lines.push(
        `❌ ARM B ${ev.name}: B1(trigger ${ev.triggerType} declares a pre-mutation field)=${b1} · ` +
        `B2(catalog payload declares one)=${b2}. ` +
        (!b1
          ? `${ev.emitterFile} derives this event from ${ev.triggerType}, which carries no pre-state — ` +
            'so no amount of listener wiring can make diff-based propagation work.'
          : 'the emitter holds a pre-state and does not forward it.'),
      );
    } else {
      lines.push(`✓  ARM B ${ev.name}: prevState reaches the emitter (B1) and is declared on the payload (B2).`);
    }
  }

  // ── Staleness: a paid debt must LEAVE the ledger ────────────────────────────
  for (const declared of ledger.declaredFindings) {
    if (!findingNames.includes(declared)) {
      lines.push(
        `⚠  STALE LEDGER ENTRY: "${declared}" is declared in cascade-events.json but no longer measured. ` +
        'Delete it from declaredFindings in the commit that fixed it.',
      );
      stale.push(declared);
    }
  }
}

const result: GateResult = {
  gate: 'check-propagation-reaches',
  floors,
  lines,
  findings: findingNames.length,
  declared: ledger?.declaredFindings.length ?? 0,
  findingNames,
  stale,
};

process.exit(reportGate(result));
