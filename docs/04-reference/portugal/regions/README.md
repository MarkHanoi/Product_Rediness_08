# Portugal — regions

Region-level notes for the Portugal context-data adapter. A folder exists per region that needs
its **own endpoint, tiling scheme, or licence** (Germany = 16 Bundesländer; Switzerland = per-canton
3.0β rollout; Spain = CCAA incl. País Vasco / Navarra separate cadastres). Countries with a single
national product keep just `national/`.

Route by which region polygon the project bbox falls into, then hand off to that region's endpoint.
