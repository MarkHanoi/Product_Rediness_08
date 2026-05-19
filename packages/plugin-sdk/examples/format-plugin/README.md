# format-plugin-example — CSV walls importer

Demonstrates how to ship a file-format plugin: register a `.csv`
importer that turns CSV rows into `wall.create` commands.

## File format

```
# header rows starting with '#' are ignored
x1, y1, x2, y2, height, thickness
0,    0,   5,   0,   3.0,    0.2
5,    0,   5,   4,   3.0,    0.2
5,    4,   0,   4,   3.0,    0.2
0,    4,   0,   0,   3.0,    0.2
```

Each row creates one wall via `commandBus.dispatch({ kind: 'wall.create', payload: ... })`.

## Why this needs three permissions

- `register:command` — adds the "Import walls from CSV" entry to the File menu.
- `write:project` — the wall-create commands the importer returns mutate project state.
- `read:project` — the host needs the plugin's manifest to know it can dispatch into the project.

## Atomicity

The host wraps the entire `commands[]` array in a transaction.  If
ANY row fails parsing, NO walls are created — the importer returns
`{ ok: false, ... }` and the user sees a precise line-number error.
This is why the handler validates every row BEFORE pushing into
`commands`; an invalid row aborts the whole import.

## Run locally

```sh
node ../../src/dev/cli.ts --manifest plugin.manifest.json --once
```
