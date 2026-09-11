// §ENVELOPE-CARD-JOB-HOST (C115 §10 `C115-87`/`C115-88` · C19 §5.7 clause 1 · L-13315) — WHICH
// SURFACE IS CURRENTLY DISPLAYING ONE OF THE BUILDABLE-ENVELOPE CARD'S JOBS.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ ONE ARBITER, KEYED BY A CLOSED UNION — NOT A SECOND COPY OF THE FIRST ONE
// ═══════════════════════════════════════════════════════════════════════════════════════
// `plotDisplayControlsHost.ts` (C115-151 / C115-154) was the first host claim on this card: while
// the Parcel Law panel displays the SHOW ON THE PLOT switches, the card renders none. The founder's
// Site-panel restructure of 2026-09-11 asks for a SECOND job on exactly the same terms — the
// buildable-envelope SUMMARY (provenance badge · four ceilings · caveats · source line) is shown in
// ① *"What is this plot — and what can I build here?"* while the card keeps its Stage-02/03 folds in
// ②. A second module carrying the same claim / release / self-heal body would be the same rule with
// two implementations, the defect this repository keeps paying for. So the rule lives HERE, once,
// keyed by job; `plotDisplayControlsHost.ts` is now a thin, API-stable view of it.
//
// ⛔ WHY THE KEY IS NOT `EnvelopeCardSection`, stated because C115-88 clause 4 reads as if it should
// be. That union (`designStagePanel.ts`) orders and GATES the card's nine STAGED folds — its count is
// a preservation row (PR-A-18) and every member takes a vote in the design-stage relevance model.
// Neither job here is a staged fold: both render ABOVE the staged folds, on every stage, gated by
// nothing. Adding them to that union would change a pinned count and hand the stage gate a vote over
// chrome it has never governed. The clause's intent — a closed, typed identity, never a free-form
// registry — is met by the closed union below: two members, and a third is a type error at every
// call site.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ IT SELF-HEALS — unchanged from the first job, and still the point
// ═══════════════════════════════════════════════════════════════════════════════════════
// A claim is held BY ELEMENT, and a claim whose element has left the document is not a claim: the
// next read drops it, so a claimant torn down without releasing (a throw inside a dispose, a surface
// removed by something that does not know about this module) costs at most one card render, never
// the job. That is the `document.contains(host)` discipline the card's re-homing already relies on.
//
// ⚠ LAST CLAIMER WINS, per job — the rule the singleton card itself follows. Two surfaces wanting
// one job is the two-hosts-open-at-once property C115-89 records as unfixed; this module guarantees
// that ONE of them displays the job, never both, and must not be described as fixing C115-89.
//
// P4 — no `(window as any)`; no global touched. P6 — writes no store and dispatches nothing.
// P7 — this is view chrome (WHERE a job is drawn), deliberately not a visibility intent.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.site.envelopeCardJobHost');

/** The card's hostable jobs. CLOSED: a new job is added HERE, and the type error is the feature. */
export type EnvelopeCardJob = 'plot-display' | 'envelope-summary';

/** Every job, in a stable order (console lines and specs only; never a decision input). */
export const ENVELOPE_CARD_JOBS: readonly EnvelopeCardJob[] = Object.freeze(['plot-display', 'envelope-summary'] as const);

/** What each job IS, for the console line only. */
const JOB_LABEL: Readonly<Record<EnvelopeCardJob, string>> = Object.freeze({
    'plot-display': 'the SHOW ON THE PLOT switches',
    'envelope-summary': 'the buildable-envelope summary (badge · four ceilings · caveats · source)',
});

interface Claim {
    /** Held as an ELEMENT so the claim can go stale when it leaves the document. */
    readonly element: Element;
    /** A human label for the claiming surface — console only, never a decision input. */
    label: string;
}

const claims = new Map<EnvelopeCardJob, Claim>();

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
    for (const fn of [...listeners]) {
        try {
            fn();
        } catch (e) {
            // One surface that cannot repaint must never stop the others — the rule
            // `envelopeVisibility.ts` states for its own notifier.
            console.warn('[site][card-job-host] listener threw (non-fatal):', e);
        }
    }
}

/**
 * ⭐ THE ONE READ. Is another surface currently DISPLAYING `job`?
 *
 * Self-healing: a claim whose element has left the document is dropped here, so a claimant that
 * died without releasing costs at most one render, never the job.
 */
export function envelopeCardJobClaimed(job: EnvelopeCardJob): boolean {
    const span = _tracer.startSpan('pryzm.site.envelopeCardJobClaimed');
    try {
        const claim = claims.get(job);
        if (!claim) return false;
        const connected = typeof claim.element.isConnected === 'boolean' ? claim.element.isConnected : true;
        if (!connected) {
            console.log(
                `[site][card-job-host] §ENVELOPE-CARD-JOB-HOST — the claim on ${JOB_LABEL[job]} held by `
                    + `"${claim.label}" is STALE (its element left the document); dropping it, so the `
                    + 'envelope card carries the job again.',
            );
            claims.delete(job);
            // Deliberately no `notify()` here: this is a read, and a read that fires listeners can
            // re-enter the render that asked. The next real claim/release notifies.
            return false;
        }
        return true;
    } finally {
        span.end();
    }
}

/** Claim `job` for `host`. Idempotent for the same element; otherwise the last claimer wins. */
export function claimEnvelopeCardJob(job: EnvelopeCardJob, host: Element, label: string): void {
    const span = _tracer.startSpan('pryzm.site.claimEnvelopeCardJob');
    try {
        const current = claims.get(job);
        if (current && current.element === host) {
            current.label = label;
            return;
        }
        claims.set(job, { element: host, label });
        console.log(
            `[site][card-job-host] §ENVELOPE-CARD-JOB-HOST — "${label}" now displays ${JOB_LABEL[job]}; `
                + `${listeners.size} surface(s) notified.`,
        );
        notify();
    } finally {
        span.end();
    }
}

/**
 * Release `job`, but ONLY if `host` is the current claimant.
 *
 * ⛔ THE GUARD IS THE POINT. A host that released unconditionally would evict whichever OTHER
 * surface had claimed since — the failure C19 §5.7 clause 2 exists to prevent.
 */
export function releaseEnvelopeCardJob(job: EnvelopeCardJob, host: Element): void {
    const span = _tracer.startSpan('pryzm.site.releaseEnvelopeCardJob');
    try {
        const current = claims.get(job);
        if (!current || current.element !== host) return;
        claims.delete(job);
        console.log(
            `[site][card-job-host] §ENVELOPE-CARD-JOB-HOST — "${current.label}" released ${JOB_LABEL[job]}; `
                + 'the envelope card carries it again.',
        );
        notify();
    } finally {
        span.end();
    }
}

/**
 * Subscribe to claim changes on ANY job. The card's host subscribes once so the card re-renders the
 * moment a job becomes its own again — without which a released claim would show nothing until some
 * unrelated repaint happened to run.
 */
export function subscribeEnvelopeCardJobHost(fn: Listener): () => void {
    const span = _tracer.startSpan('pryzm.site.subscribeEnvelopeCardJobHost');
    try {
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    } finally {
        span.end();
    }
}

/** Test-only reset: every claim and every listener. Never called in production. */
export function __resetEnvelopeCardJobHostForTests(): void {
    claims.clear();
    listeners.clear();
}
