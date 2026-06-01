# §16.6.1  Sub-phase plan — Phase F1 (toolbar.discipline contributions)

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 1830–1942.

---

### §16.6 Phase F — Plugin contributions (S78–S84, ~95 sub-phases)

This is the bulk of the white-UI gesture migration. Each gesture becomes a contribution to a typed contribution kind. **One sub-phase = one contribution = one PR**.

#### §16.6.1 Group F.1 — `toolbar.discipline` contributions (CreateRailPanel + 7 sibling rails)

Each tool button in every rail becomes a contribution registered by its plugin.

**Architecture rail (CreateRailPanel)**:

| Sub-phase | Tool button | Today | After | Sprint | Bench |
|---|---|---|---|---|---|
| **F.1.01** | Wall | hard-coded in `CreateRailPanel.ts:738` | `plugins/wall/contributions.ts` registers `{id:'wall.tool', discipline:'architecture', activate: r => r.tools.activate('wall', {mode:'polyline-ortho'})}` | S78 | `bench/ui/tool-activate.bench.ts` |
| **F.1.02** | Curtain Wall | hard-coded line 745 | `plugins/curtain-wall/contributions.ts` | S78 | included |
| **F.1.03** | Door | line 752 | `plugins/door/contributions.ts` | S78 | included |
| **F.1.04** | Window | line 759 | `plugins/window/contributions.ts` | S78 | included |
| **F.1.05** | Slab | | `plugins/slab/contributions.ts` | S78 | included |
| **F.1.06** | Floor | | `plugins/floor/contributions.ts` | S78 | included |
| **F.1.07** | Ceiling | | `plugins/ceiling/contributions.ts` | S78 | included |
| **F.1.08** | Roof | | `plugins/roof/contributions.ts` | S78 | included |
| **F.1.09** | Stair | | `plugins/stair/contributions.ts` | S78 | included |
| **F.1.10** | Handrail | | `plugins/handrail/contributions.ts` | S78 | included |
| **F.1.11** | Column | | `plugins/column/contributions.ts` | S78 | included |
| **F.1.12** | Beam | | `plugins/beam/contributions.ts` | S78 | included |
| **F.1.13** | Grid | | `plugins/grids/contributions.ts` | S78 | included |
| **F.1.14** | CreateRailPanel `_buildSections()` rewrite to enumerate `runtime.plugins.contributions('toolbar.discipline').filter(c => c.discipline === 'architecture')` | hard-coded array of 13 tools | data-driven from contributions | S78 | included |

**Annotation rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.15** | Text Annotation | `plugins/annotations/contributions.ts` text tool | S79 |
| **F.1.16** | Linear Dimension | dim-linear contribution | S79 |
| **F.1.17** | Aligned Dimension | dim-aligned contribution | S79 |
| **F.1.18** | Angular Dimension | dim-angular contribution | S79 |
| **F.1.19** | Radial Dimension | dim-radial contribution | S79 |
| **F.1.20** | Tag | annotation-tag contribution | S79 |
| **F.1.21** | Section Mark | annotation-section contribution | S79 |
| **F.1.22** | Detail Mark | annotation-detail contribution | S79 |
| **F.1.23** | Revision Cloud | annotation-revcloud contribution | S79 |
| **F.1.24** | AnnotationRailPanel rewrite to enumerate contributions | hard-coded array | data-driven | S79 |

**Export rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.25** | Export PDF | `plugins/export-pdf/contributions.ts` | S79 |
| **F.1.26** | Export DWG/DXF | `plugins/dxf/contributions.ts` | S79 |
| **F.1.27** | Export IFC | `plugins/ifc-export/contributions.ts` (already exists; just add UI contribution) | S79 |
| **F.1.28** | Export Schedule CSV | `plugins/schedules/contributions.ts` | S79 |
| **F.1.29** | Export Image | `plugins/render/contributions.ts` snapshot | S79 |
| **F.1.30** | ExportRailPanel rewrite | hard-coded | data-driven | S79 |

**GIS rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.31** | Locate (lat/lon picker) | `plugins/geospatial/contributions.ts` locate | S80 |
| **F.1.32** | Basemap toggle | geospatial basemap | S80 |
| **F.1.33** | Terrain toggle | geospatial terrain | S80 |
| **F.1.34** | Satellite imagery toggle | geospatial satellite | S80 |
| **F.1.35** | GISRailPanel rewrite | data-driven | S80 |

**Grids+Levels rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.36** | New Grid | `plugins/grids/contributions.ts` new | S80 |
| **F.1.37** | New Level | `plugins/levels/contributions.ts` new | S80 |
| **F.1.38** | Split Level | levels split | S80 |
| **F.1.39** | Offset Grid | grids offset | S80 |
| **F.1.40** | Copy Grid | grids copy | S80 |
| **F.1.41** | Delete Grid/Level | shared delete | S80 |
| **F.1.42** | GridsLevelsRailPanel rewrite | data-driven | S80 |

**Navigate rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.43** | Pan | `plugins/navigate/contributions.ts` pan | S80 |
| **F.1.44** | Orbit | navigate orbit | S80 |
| **F.1.45** | Zoom | navigate zoom | S80 |
| **F.1.46** | Zoom-to-fit | navigate zoom-fit | S80 |
| **F.1.47** | Zoom-to-selection | navigate zoom-sel | S80 |
| **F.1.48** | Walkthrough | navigate walkthrough | S80 |
| **F.1.49** | NavigateRailPanel rewrite | data-driven | S80 |

**Render rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.50** | Render Quality preset | `plugins/render/contributions.ts` quality | S81 |
| **F.1.51** | Sun control | render sun | S81 |
| **F.1.52** | Materials editor open | render materials | S81 |
| **F.1.53** | Exposure slider | render exposure | S81 |
| **F.1.54** | Render Gallery open | render gallery | S81 |
| **F.1.55** | Start Render | render start | S81 |
| **F.1.56** | Panorama capture | render panorama | S81 |
| **F.1.57** | Walkthrough export | render walkthrough | S81 |
| **F.1.58** | RenderRailPanel rewrite | data-driven | S81 |

**Visual rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.59** | Visibility-Graphics open | `plugins/visibility-intent/contributions.ts` open | S81 |
| **F.1.60** | Edge style toggle | VI edge | S81 |
| **F.1.61** | Transparency | VI transparency | S81 |
| **F.1.62** | Isolate selection | VI isolate | S81 |
| **F.1.63** | Hide selection | VI hide | S81 |
| **F.1.64** | Reveal hidden | VI reveal | S81 |
| **F.1.65** | VisualRailPanel rewrite | data-driven | S81 |

