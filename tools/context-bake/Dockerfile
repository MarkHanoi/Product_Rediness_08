# PRYZM context tile bake toolchain (L-513a). Bundles osmium-tool + tippecanoe so the bake runs
# reproducibly ANYWHERE Docker exists (dev, CI, Fly) with no host toolchain. Build once:
#   docker build -t pryzm-context-bake .
# The orchestrator (bake.mjs) invokes this image automatically when local binaries are absent.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      osmium-tool \
      build-essential libsqlite3-dev zlib1g-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# tippecanoe (felt fork — the maintained one; writes .pmtiles directly with -o file.pmtiles).
RUN git clone --depth 1 https://github.com/felt/tippecanoe.git /tmp/tippecanoe \
    && cd /tmp/tippecanoe && make -j"$(nproc)" && make install \
    && rm -rf /tmp/tippecanoe

WORKDIR /work
# The orchestrator passes the tool + args; keep the entrypoint a bare shell-less exec.
ENTRYPOINT []
