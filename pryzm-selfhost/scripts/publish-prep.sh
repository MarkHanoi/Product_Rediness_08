#!/usr/bin/env bash
# pryzm-selfhost — publish-prep.sh
#
# Validates the 2.0.0 manifest, builds + tags per-service images, and
# (with --push) pushes them to ghcr.io.  Without --push it prints the
# command it WOULD have run and exits 0.  The dry-run is the default
# because this development environment has no ghcr.io credentials and
# we never want to accidentally publish images built without proper
# provenance.
#
# Usage:
#   ./scripts/publish-prep.sh             # dry-run (default — safe)
#   GHCR_PAT=<...> ./scripts/publish-prep.sh --push   # actually push
#
# Spec: SPEC-15 §7 + ADR-0048 + ADR-0052 §B.3.
# Sprint: Phase 3D · S70 · Day 8.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION_JSON="${ROOT}/version.json"
PUSH_FLAG=0

for arg in "$@"; do
    case "${arg}" in
        --push)        PUSH_FLAG=1 ;;
        -h|--help)
            sed -n '2,17p' "$0"
            exit 0
            ;;
        *)
            echo "unknown arg: ${arg}" >&2
            exit 1
            ;;
    esac
done

if [[ ! -f "${VERSION_JSON}" ]]; then
    echo "publish-prep: ${VERSION_JSON} missing" >&2
    exit 1
fi

# ── Manifest validation ───────────────────────────────────────────────────────
PRYZM_VER="$(node -e "const v=require('${VERSION_JSON}'); process.stdout.write(v.pryzm || '');" 2>/dev/null || true)"
if [[ -z "${PRYZM_VER}" ]]; then
    echo "publish-prep: cannot read .pryzm from version.json" >&2
    exit 1
fi
echo "publish-prep: manifest version = ${PRYZM_VER}"

# Each first-party service in version.json gets validated + has its
# tag + push command printed.
SERVICES_JSON="$(node -e "
const v=require('${VERSION_JSON}');
const out=[];
for (const [name, s] of Object.entries(v.services||{})) {
  if (!s.image || !s.tag) continue;
  if (!String(s.image).startsWith('ghcr.io/pryzm/')) continue;
  out.push(\`\${name}\\t\${s.image}\\t\${s.tag}\`);
}
process.stdout.write(out.join('\\n'));
" 2>/dev/null || true)"

if [[ -z "${SERVICES_JSON}" ]]; then
    echo "publish-prep: no first-party services to publish" >&2
    exit 1
fi

echo "publish-prep: first-party services to publish:"
echo "${SERVICES_JSON}" | awk -F'\t' '{ printf "  - %-15s  %s:%s\n", $1, $2, $3 }'

# ── Build + tag commands ──────────────────────────────────────────────────────
BUILD_CMD="docker compose -f ${ROOT}/docker-compose.yml build"

# ── Dry-run vs push ───────────────────────────────────────────────────────────
if [[ "${PUSH_FLAG}" -eq 0 ]]; then
    cat <<EOF

publish-prep: DRY-RUN — no images built, no tags pushed.

To actually publish, set GHCR_PAT and re-run with --push:

    export GHCR_PAT=<your-ghcr-personal-access-token>
    echo "\${GHCR_PAT}" | docker login ghcr.io -u <your-github-username> --password-stdin
    ${BUILD_CMD}
    docker compose -f ${ROOT}/docker-compose.yml push
    ./scripts/publish-prep.sh --push

EOF
    exit 0
fi

if [[ -z "${GHCR_PAT:-}" ]]; then
    echo "publish-prep: --push requires GHCR_PAT to be set in the environment" >&2
    exit 1
fi

echo "publish-prep: building images..."
eval "${BUILD_CMD}"

echo "publish-prep: pushing images..."
docker compose -f "${ROOT}/docker-compose.yml" push

echo "publish-prep: done — manifest ${PRYZM_VER} published to ghcr.io/pryzm/*"
