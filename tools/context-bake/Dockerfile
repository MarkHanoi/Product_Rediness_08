# PRYZM context tile bake toolchain (L-513a). Bundles osmium-tool + tippecanoe so the bake runs
# reproducibly ANYWHERE Docker exists (dev, CI, Fly) with no host toolchain. Build once:
#   docker build -t pryzm-context-bake .
# The orchestrator (bake.mjs) invokes this image automatically when local binaries are absent.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      osmium-tool \
      build-essential libsqlite3-dev zlib1g-dev git ca-certificates \
      curl unzip \
    && rm -rf /var/lib/apt/lists/*

# tippecanoe (felt fork — the maintained one; writes .pmtiles directly with -o file.pmtiles).
RUN git clone --depth 1 https://github.com/felt/tippecanoe.git /tmp/tippecanoe \
    && cd /tmp/tippecanoe && make -j"$(nproc)" && make install \
    && rm -rf /tmp/tippecanoe

# §BAKE-OVERTURE — DuckDB CLI, for the Overture buildings ingestion path in bake.mjs (reads the
# public Overture GeoParquet on S3 via the httpfs + spatial extensions, clips to a region bbox, and
# writes GeoJSONSeq for tippecanoe). Pinned for reproducibility; bump alongside OVERTURE_RELEASE in
# bake.mjs. The extensions themselves are auto-INSTALLed at run time (needs network, which CI has).
ARG DUCKDB_VERSION=v1.1.3
RUN curl -fsSL -o /tmp/duckdb.zip \
      "https://github.com/duckdb/duckdb/releases/download/${DUCKDB_VERSION}/duckdb_cli-linux-amd64.zip" \
    && unzip /tmp/duckdb.zip -d /usr/local/bin \
    && rm /tmp/duckdb.zip \
    && duckdb --version

WORKDIR /work
# The orchestrator passes the tool + args; keep the entrypoint a bare shell-less exec.
ENTRYPOINT []
