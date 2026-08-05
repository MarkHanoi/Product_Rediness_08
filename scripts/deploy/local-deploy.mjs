#!/usr/bin/env node
// scripts/deploy/local-deploy.mjs — manual-deploy path for GET /version provenance.
//
// The Actions workflow (.github/workflows/deploy-fly.yml, §DEPLOY-VERSION) stamps
// GIT_SHA/GIT_BRANCH/BUILT_AT/RUN_NUMBER from the GitHub context. A bare `flyctl
// deploy` run from a dev machine has no such context, so without this wrapper
// every manual deploy would report "unknown" at GET /version (Dockerfile's
// documented default — see its runtime-stage ARG block) even though the code
// itself is known. This wrapper derives the same four values locally via git and
// passes them as the same --build-arg names, so both deploy paths stamp the same
// shape. It does not change what gets built or how — only what version metadata
// the running image reports.
//
// Usage: node scripts/deploy/local-deploy.mjs [extra flyctl args...]
//   e.g. node scripts/deploy/local-deploy.mjs --build-arg VITE_CESIUM_TOKEN=...
import { execFileSync, spawnSync } from 'node:child_process';

function git(args) {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const gitSha = git(['rev-parse', 'HEAD']);
const gitBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const builtAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

const status = git(['status', '--porcelain']);
if (status) {
    console.warn('::warning:: working tree has uncommitted changes — GET /version will report the last COMMITTED sha, not what is actually being built.');
}

const buildArgs = [
    '--build-arg', `GIT_SHA=${gitSha}`,
    '--build-arg', `GIT_BRANCH=${gitBranch}`,
    '--build-arg', `BUILT_AT=${builtAt}`,
    '--build-arg', 'RUN_NUMBER=local',
];

const extraArgs = process.argv.slice(2);
const flyctlArgs = ['deploy', '--remote-only', '-a', 'pryzm', ...buildArgs, ...extraArgs];

console.log(`flyctl ${flyctlArgs.join(' ')}`);
const result = spawnSync('flyctl', flyctlArgs, { stdio: 'inherit' });
process.exit(result.status ?? 1);
