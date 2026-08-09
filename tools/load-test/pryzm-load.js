/**
 * tools/load-test/pryzm-load.js — PRYZM concurrency harness (L-800)
 *
 * Run with k6, NOT node:  k6 run -e STAGE=smoke ... tools/load-test/pryzm-load.js
 * See tools/load-test/README.md — in particular the warnings, because STAGE=target
 * is a denial-of-service against a single 512 MB machine.
 *
 * ─── What this exists to settle ──────────────────────────────────────────────
 * Every capacity number in the 2026-08-09 audit was derived from reading code and
 * configuration. That is enough to establish the verdict — a single machine and a
 * missing Socket.io adapter are structural facts, not empirical ones — but it is
 * NOT enough to order the remediation. This harness is the probe that turns the
 * ordering into a measurement, and it is deliberately allowed to disagree with
 * the person who wrote the plan.
 *
 * ─── Why the scenarios are shaped like this ──────────────────────────────────
 * A load test that hammers one endpoint measures that endpoint. PRYZM's
 * bottleneck is a MIX: the hub's LATERAL fan-out, the project-open snapshot read,
 * the WebSocket fan-out with no adapter, and the autosave write — all contending
 * for the SAME pool of connections and the SAME single CPU. Running them
 * concurrently, in realistic proportion, is the only way the contention shows up.
 * The proportions below (50 % viewing, 30 % editing, 20 % hub) are the audit's
 * stated activity model, restated here as executable form so the two cannot
 * drift apart silently.
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, fail } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── Configuration ────────────────────────────────────────────────────────────
const BASE_URL     = __ENV.BASE_URL     || 'http://localhost:5000';
const EMAIL        = __ENV.PRYZM_EMAIL  || '';
const PASSWORD     = __ENV.PRYZM_PASSWORD || '';
const STAGE        = __ENV.STAGE        || 'smoke';
// Writes are OFF by default: they create real rows in a real database, and a
// load tool should not decide on its own to mutate production data.
const WRITE_RATIO  = Number(__ENV.WRITE_RATIO || 0);
// 512 KB is a SMALL project. The audit's measured figure is ~16.6 MB for 793
// elements (L-786); raise this toward that to reproduce the write-throughput
// wall, and expect it to hurt.
const SNAPSHOT_KB  = Number(__ENV.SNAPSHOT_KB || 512);
// Stamped into every created project name so a sweep is one DELETE ... LIKE.
const RUN_ID       = __ENV.RUN_ID || `${Date.now()}`;

// ── Custom metrics ───────────────────────────────────────────────────────────
// Named for the FINDING each one tests, so a result reads as evidence rather
// than as a wall of latency percentiles.
const hubDuration      = new Trend('pryzm_hub_ms',        true);   // L-788 / L-798
const openDuration     = new Trend('pryzm_open_ms',       true);   // L-788 / L-786
const autosaveDuration = new Trend('pryzm_autosave_ms',   true);   // L-786 / L-787 / L-792
const socketJoinMs     = new Trend('pryzm_socket_join_ms', true);  // L-770 / L-336
const rateLimited      = new Counter('pryzm_429_total');           // L-790
const dbUnavailable    = new Counter('pryzm_503_total');           // L-787 / L-789
const joinDenied       = new Counter('pryzm_join_denied_total');   // L-336
const socketOk         = new Rate('pryzm_socket_success');         // L-770

// ── Load profiles ────────────────────────────────────────────────────────────
const STAGES = {
    // Proves the scenario and the credentials work. ALWAYS run this first: a
    // 1,000-VU run that dies on a typo wastes twenty minutes and produces a
    // frightening graph that means nothing.
    smoke:  [{ duration: '30s', target: 5 }],
    // Finds the knee. Expected to pass after tranche 1 of the remediation.
    ramp:   [
        { duration: '1m',  target: 50 },
        { duration: '2m',  target: 200 },
        { duration: '1m',  target: 200 },
        { duration: '30s', target: 0 },
    ],
    // The stated target. Expected to FAIL today — that is the point, and a
    // passing run here would mean the audit was wrong, which is a legitimate and
    // welcome outcome.
    target: [
        { duration: '2m', target: 250 },
        { duration: '2m', target: 500 },
        { duration: '3m', target: 1000 },
        { duration: '5m', target: 1000 },
        { duration: '1m', target: 0 },
    ],
};

export const options = {
    stages: STAGES[STAGE] || STAGES.smoke,
    // Thresholds ENCODE THE AUDIT'S CLAIMS. A failing threshold is a confirmed
    // finding; a passing one falsifies an estimate and must be written back into
    // the ISSUE-LOG row rather than quietly ignored.
    thresholds: {
        // Interactive budget. C10 has no HTTP budget at all (L-801) — these are
        // proposed, and the first real run is what makes them defensible.
        'pryzm_hub_ms':      ['p(95)<1500'],
        'pryzm_open_ms':     ['p(95)<3000'],
        'pryzm_socket_join_ms': ['p(95)<2000'],
        // The socket path is the one that fails SILENTLY at scale (no adapter,
        // L-770), so it gets a hard success-rate threshold rather than a latency
        // one. A slow join is a performance problem; a join that never completes
        // is a correctness problem, and they must not be reported the same way.
        'pryzm_socket_success': ['rate>0.99'],
        'http_req_failed':      ['rate<0.01'],
    },
    // A 1,000-VU ramp against one shared CPU produces long tails by design;
    // don't let k6's own timeouts truncate the measurement we came for.
    setupTimeout: '60s',
    noConnectionReuse: false,
};

// ── Setup: authenticate once, share the token ────────────────────────────────
export function setup() {
    if (!EMAIL || !PASSWORD) {
        fail(
            'PRYZM_EMAIL and PRYZM_PASSWORD are required.\n' +
            'Every meaningful route is behind auth, and an unauthenticated run would ' +
            'measure the 401 path — a fast, cheap, entirely irrelevant number.',
        );
    }
    const res = http.post(
        `${BASE_URL}/api/auth/signin`,
        JSON.stringify({ email: EMAIL, password: PASSWORD }),
        { headers: { 'Content-Type': 'application/json' }, tags: { scenario: 'setup' } },
    );
    if (res.status !== 200) {
        // §BETA-ACCESS-GATE returns 403 for an address not on the allowlist —
        // worth naming explicitly, because "403 at setup" otherwise reads as a
        // broken harness rather than a working access gate.
        fail(
            `signin failed: ${res.status} ${String(res.body).slice(0, 200)}\n` +
            (res.status === 403
                ? 'A 403 here is probably §BETA-ACCESS-GATE — the address is not on the beta allowlist.'
                : ''),
        );
    }
    const token = res.json('token');
    if (!token) fail('signin returned 200 but no token');

    // Seed: the account needs at least one project for the read scenarios to be
    // measuring anything. An empty account makes `open` a 404 benchmark.
    const list = http.get(`${BASE_URL}/api/v1/projects`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const projects = (list.json('data') || list.json('projects') || []);
    if (!Array.isArray(projects) || projects.length === 0) {
        fail(
            'the load account has no projects — the read scenarios would measure 404s.\n' +
            'Create at least one representative project on this account first, ideally ' +
            'one of realistic size (the audit\'s reference is 793 elements / ~16.6 MB).',
        );
    }
    return { token, projectIds: projects.map(p => p.id).filter(Boolean) };
}

const authHeaders = token => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
});

/** Count the responses that ARE the finding, rather than discarding them as errors. */
function classify(res) {
    if (res.status === 429) rateLimited.add(1);        // L-790: per-IP limits
    if (res.status === 503) dbUnavailable.add(1);      // L-787 pool / L-789 honest refusal
    return res;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── Scenarios ────────────────────────────────────────────────────────────────

/** L-788 / L-798 — hub list: 1 query + up to 50 LATERAL descents. */
function hubLoad(token) {
    const res = classify(http.get(`${BASE_URL}/api/v1/projects`, {
        headers: authHeaders(token), tags: { scenario: 'hub' },
    }));
    hubDuration.add(res.timings.duration);
    check(res, { 'hub 200': r => r.status === 200 });
}

/** L-788 / L-786 — project open: the snapshot read, and its egress. */
function projectOpen(token, projectId) {
    const res = classify(http.get(`${BASE_URL}/api/v1/projects/${projectId}/model`, {
        headers: authHeaders(token), tags: { scenario: 'open' },
    }));
    openDuration.add(res.timings.duration);
    check(res, { 'open 2xx': r => r.status >= 200 && r.status < 300 });
}

/**
 * L-770 / L-336 — Socket.io connect, join, cursor traffic.
 *
 * Uses the raw WebSocket transport with Engine.IO framing rather than the
 * socket.io client, which does not run under k6. The framing is stable and
 * documented: `40` = CONNECT, `42` = EVENT, `2`/`3` = ping/pong.
 *
 * ⚠ This is the scenario that matters most and the one most likely to look
 * fine while being broken. With no Redis adapter, a SECOND server instance
 * silently partitions the room — every VU still connects and joins happily, and
 * no error is raised anywhere. Against one instance this measures fan-out cost;
 * proving the partition needs two instances and a cross-instance assertion,
 * which is a follow-up, not something this file can fake.
 */
function socketSession(token, projectId) {
    const url = `${BASE_URL.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;
    const start = Date.now();
    let joined = false;

    const res = ws.connect(url, { tags: { scenario: 'socket' } }, socket => {
        socket.on('open', () => {
            // Engine.IO handshake, then the Socket.io CONNECT with the auth payload
            // resolveSocketUserId() reads (`socket.handshake.auth.token`).
            socket.send(`40${JSON.stringify({ token })}`);
        });

        socket.on('message', msg => {
            if (msg.startsWith('40')) {
                socket.send(`42${JSON.stringify(['join-project', projectId])}`);
            } else if (msg.startsWith('2')) {
                socket.send('3');                       // Engine.IO ping → pong
            } else if (msg.startsWith('42')) {
                // §B2 requires join-project BEFORE any other event is honoured,
                // so a denial must be counted, not silently treated as a join.
                if (msg.includes('join-project-denied')) {
                    joinDenied.add(1);
                    socket.close();
                    return;
                }
                if (!joined) {
                    joined = true;
                    socketJoinMs.add(Date.now() - start);
                }
            }
        });

        // Cursor traffic at ~10 Hz for 10 s — the un-throttled relay the audit
        // flagged as a batching candidate. The server rebroadcasts every one of
        // these to every peer in the room.
        socket.setInterval(() => {
            if (!joined) return;
            socket.send(`42${JSON.stringify(['cursor-move', {
                projectId, x: Math.random() * 100, y: Math.random() * 100,
            }])}`);
        }, 100);

        socket.setTimeout(() => socket.close(), 10_000);
        socket.on('error', () => socketOk.add(false));
    });

    socketOk.add(joined);
    check(res, { 'socket handshake 101': r => r && r.status === 101 });
}

/**
 * L-786 / L-787 / L-792 — the autosave write.
 *
 * The single most expensive thing the product does, and the one the audit
 * identifies as architecturally unscalable: a whole-document JSONB snapshot
 * under a FOR UPDATE row lock, through a shared pool.
 */
function autosave(token, projectId) {
    // A synthetic snapshot of the requested size. Shape matters less than bytes
    // here — the cost being measured is stringify + transfer + JSONB insert.
    const filler = 'x'.repeat(1024);
    const elements = [];
    for (let i = 0; i < SNAPSHOT_KB; i++) {
        elements.push({ id: `el-${i}`, type: 'wall', data: filler });
    }
    const res = classify(http.post(
        `${BASE_URL}/api/projects/${projectId}/versions`,
        JSON.stringify({ label: `k6-load-${RUN_ID}`, snapshot: { elements }, elementCount: elements.length }),
        { headers: authHeaders(token), tags: { scenario: 'autosave' }, timeout: '120s' },
    ));
    autosaveDuration.add(res.timings.duration);
    // 412 is EXPECTED under concurrency and is a finding, not a failure: it is
    // L-792's optimistic-lock precondition rejecting the loser of a concurrent
    // save. Counting it as an error would hide exactly what we came to measure.
    check(res, {
        'autosave accepted or precondition-failed': r =>
            (r.status >= 200 && r.status < 300) || r.status === 412,
    });
}

// ── VU behaviour: the audit's activity model, executed ───────────────────────
export default function (data) {
    const { token, projectIds } = data;
    const projectId = pick(projectIds);
    const roll = Math.random();

    if (roll < 0.20) {
        hubLoad(token);                              // 20 % on the hub
    } else if (roll < 0.70) {
        projectOpen(token, projectId);               // 50 % viewing / navigating
        socketSession(token, projectId);
    } else {
        projectOpen(token, projectId);               // 30 % editing
        socketSession(token, projectId);
        if (Math.random() < WRITE_RATIO) autosave(token, projectId);
    }

    sleep(1 + Math.random() * 2);                    // human think-time
}

export function handleSummary(data) {
    // Printed, not just written: a run whose result nobody reads is a run that
    // did not happen. The README asks for the raw summary to be recorded in
    // docs/03-execution/analysis/ with the stage and the commit SHA.
    return {
        stdout: JSON.stringify(
            {
                stage: STAGE,
                runId: RUN_ID,
                baseUrl: BASE_URL,
                snapshotKb: SNAPSHOT_KB,
                writeRatio: WRITE_RATIO,
                metrics: data.metrics,
            },
            null,
            2,
        ),
    };
}
