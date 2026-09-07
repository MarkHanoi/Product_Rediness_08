// §GLOBE-INHERITS-THE-CITY-TERRAIN (L-12991, founder 2026-09-06: *"no need to select analyse -
// parcel law - the 3d globe doesnt render correct initially"*) — the PURE table of every piece of
// SHARED-VIEWER state that differs between the two things the ONE Cesium viewer is asked to be.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE DEFECT THIS EXISTS FOR, AND WHY IT IS A CLASS RATHER THAN A BUG
// ═══════════════════════════════════════════════════════════════════════════════════════════
// §L-412 is unchanged and correct: there is exactly ONE Cesium viewer, re-targeted between panes,
// never a second one. C60 §6.5 says the same thing one layer up — *"the globe and the 3D Site ARE
// the same viewer at different camera altitudes"* — which is why `viewPanelOptions.ts` offers
// `3D Site` and `3D Globe` as two FRAMING VARIANTS of the single `site-3d` view type rather than as
// two views.
//
// ⛔ BUT THE FRAMING WAS THE ONLY THING THAT MOVED. `defaultSiteViewCameraPorts().frameGlobe()` flew
// the camera to world altitude and changed NOTHING ELSE, so the globe inherited the SITE surface:
//
//   · `viewer.terrainProvider` — a CITY-BOUNDED quantized-mesh tileset (`terrain/cordoba`). A bounded
//     tileset declares availability only inside its own `layer.json` bbox, so at world range Cesium
//     has one or two level-0 roots and nothing else. That is the founder's BEIGE TRIANGULAR SHARD,
//     and his console says it in numbers: `renderedTerrainTiles=0` → 1 → 2 for an entire planet, and
//     `L0-TILES[2]: L0(0,0)st1-ts4 L0(1,0)st3-ts0` — one of the two roots never yields a tile.
//   · the imagery layers — `applyFormaMode` sets every one of them `show = false`, because the Forma
//     massing study paints a flat ground instead. On a GLOBE that leaves no Earth at all: fixing the
//     terrain provider alone would have produced a featureless cream sphere, not a globe.
//   · the photoreal 3D tileset — hidden in Forma (`tileset.show = !formaMode`), i.e. the one surface
//     that IS global was switched off.
//   · `globe.baseColor` — `FORMA_PALETTE.ground`, the near-white land tone. The shard's colour.
//   · `scene.backgroundColor = TRANSPARENT` + the CSS sky backdrop — the WHITE the shard floats on.
//   · sky box / sky atmosphere / sun / moon / ground atmosphere — all off, so nothing reads as a planet.
//   · `globe.enableLighting` — true whenever relief is attached (§TERRAIN-NORMALS, L-636).
//
// So it was never one bug. It is ONE MECHANISM — "site-view writes land on a viewer the globe view
// also uses" — with eight symptoms, and patching the terrain provider alone would have left seven.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE RULE, AND IT COLLAPSES TO ONE PREDICATE
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The surface is a function of TWO facts, and there are only two outcomes:
//
//     FORMA-SITE surface  ⟺  the Forma massing study is on AND the camera is framed on the SITE
//     GLOBAL-EARTH surface ⟺  anything else
//
// The `!formaMode` half needs no third row: the photoreal path already carries its own global ground
// (Google 3D tiles + imagery) and `decideBakedTerrainAttach` already refuses to drape our mesh under
// it, so "site + photoreal" and "world" want the SAME surface. Stating that as one row rather than
// two is what stops the third row from drifting away from the first two.
//
// ⛔ THIS MODULE OWNS NO COLOURS. `FORMA_PALETTE.ground` and `GLOBE_LOADING_COLOUR` are declared in
// `CesiumViewport.ts` and passed in, because that file's header already names itself the single
// source of truth for the Forma palette and a second copy here is exactly the drift
// §PALETTE-PARITY-2D-3D (L-12965) spent a lane removing.
//
// PURE: no Cesium, no DOM, no I/O — the same precedent as `terrainProviderTransition.ts` and
// `decideBakedTerrainAttach`. The viewport only EXECUTES the table below.

/**
 * Where the ONE Cesium camera is framed. The same two values `viewPanelOptions.ts` declares as the
 * `framing` variant of the `site-3d` view (`3D Site` → `'site'`, `3D Globe` → `'world'`), so the
 * panel row and the viewport cannot describe different things.
 */
export type CesiumViewFraming = 'site' | 'world';

/** The two surfaces the one viewer can wear. */
export type CesiumSurfaceKind = 'forma-site' | 'global-earth';

/**
 * ⭐ THE PREDICATE. `formaMode` says WHAT is being studied; `framing` says FROM HOW FAR. Only the
 * combination "the massing study, seen from the site" wants the flat Forma ground.
 */
export function cesiumSurfaceKind(input: {
    readonly formaMode: boolean;
    readonly framing: CesiumViewFraming;
}): CesiumSurfaceKind {
    return input.formaMode && input.framing === 'site' ? 'forma-site' : 'global-earth';
}

/** How the globe surface itself is shown. */
export type GlobeShownRule =
    /** Always drawn — it IS the ground (the Forma flat/relief study). */
    | 'always'
    /** Drawn only when no 3D tileset is shown, because a shown tileset IS the ground. */
    | 'unless-tileset-shown';

/**
 * ⭐ THE ENUMERATION. Every field here is a write onto state the two framings SHARE, and the list is
 * the audit: a field that is not on it is either not shared or is safe, and both of those are
 * recorded in the header above rather than left as an omission.
 */
export interface CesiumSurfaceWrites {
    /** `viewer.imageryLayers.get(i).show` for every layer. */
    readonly imageryLayersShown: boolean;
    /** `Cesium3DTileset.show` for every tileset in `scene.primitives` (the photoreal globe). */
    readonly tilesetsShown: boolean;
    /** How `scene.globe.show` is decided. */
    readonly globeShown: GlobeShownRule;
    /** `scene.globe.baseColor`. */
    readonly globeBaseColourCss: string;
    /**
     * `scene.globe.enableLighting` — the BASE value for the surface. ⚠ On the site surface the
     * terrain attach/detach path owns the final word (§TERRAIN-NORMALS, L-636: relief + baked
     * normals must be sun-shaded or every slope paints the flat baseColor — the "white mask"), so
     * the viewport applies this FIRST and lets `maybeAttachTerrainProvider` / `detachBakedTerrain`
     * raise it. On the global surface there is no such second writer.
     */
    readonly globeEnableLighting: boolean;
    /**
     * §SITE-SCOPE-CITYWEFT (founder 2026-09-07: *"white background clean cut — also for the
     * terrain"*) — `scene.globe.lambertDiffuseMultiplier` and `scene.globe.vertexShadowDarkness`,
     * the TWO uniforms that decide how dark a shaded slope of terrain is allowed to get.
     *
     * ⭐ MEASURED, NOT GUESSED. Cesium's globe fragment shader, under `ENABLE_VERTEX_LIGHTING`
     * (the define raised when `enableLighting` meets baked per-vertex normals — i.e. every city
     * with relief), is exactly this, at `CesiumUnminified/index.js:207493`:
     *
     *     float diffuseIntensity = clamp(
     *         czm_getLambertDiffuse(czm_lightDirectionEC, normalize(v_normalEC))
     *           * u_lambertDiffuseMultiplier + u_vertexShadowDarkness, 0.0, 1.0);
     *     vec4 finalColor = vec4(color.rgb * czm_lightColor * diffuseIntensity, color.a);
     *
     * `czm_getLambertDiffuse` is `max(dot(l, n), 0)` ∈ [0, 1], so the intensity band is
     * `[vertexShadowDarkness, lambertDiffuseMultiplier + vertexShadowDarkness]`. Cesium's Globe
     * defaults (`index.js:214856` / `:214880`) are **0.9 and 0.3** → a band of **[0.30, 1.00]**,
     * i.e. a shaded slope keeps 30 % of its colour.
     *
     * ⛔ THAT IS THE FOUNDER'S "BROWN TERRAIN", ARITHMETICALLY. The Forma ground base is
     * `FORMA_PALETTE_V2.land` = #F5F2EA = rgb(245, 242, 234). At 0.30 that paints
     * **rgb(74, 73, 70) = #4A4946** — a dark brown-grey. No amount of re-picking the BASE colour
     * fixes it: the multiplier is what makes a near-white paper read brown on a north slope.
     *
     * ⭐ THE SITE ROW THEREFORE NARROWS THE BAND RATHER THAN KILLING THE LIGHT. Turning
     * `enableLighting` off would flat-light every slope and bring back L-636's "white mask" (relief
     * with no form), which is the opposite defect and was fixed on purpose. Narrowing keeps the
     * form and bounds the darkness.
     */
    readonly globeLambertDiffuseMultiplier: number;
    /** See `globeLambertDiffuseMultiplier` — the FLOOR of the shading band. */
    readonly globeVertexShadowDarkness: number;
    /** `scene.globe.dynamicAtmosphereLighting`. */
    readonly globeDynamicAtmosphereLighting: boolean;
    /** `scene.globe.showGroundAtmosphere`. */
    readonly globeShowGroundAtmosphere: boolean;
    /** `scene.globe.translucency.enabled`. */
    readonly globeTranslucency: boolean;
    /** `skyBox.show` / `skyAtmosphere.show` / `sun.show` / `moon.show`. */
    readonly skyShown: boolean;
    /** `scene.fog` — the Forma soft ground-AO gradient (ADR-0089), or off. */
    readonly fog: 'forma-soft' | 'off';
    /**
     * `scene.backgroundColor`. `null` ⇒ `Color.TRANSPARENT`, so the CSS sky gradient painted on the
     * container shows through the alpha canvas (§FORMA-SCENE-QUALITY).
     *
     * ⭐ §SITE-SCOPE-CITYWEFT-CLEAR (L-13100) — THE SITE ROW IS NO LONGER UNCONDITIONALLY `null`.
     * Transparency was never the goal; it was the price of a GRADIENT, because a scene clear is one
     * flat colour. The founder's *"make the background completely white"* collapsed the gradient to
     * one flat colour, so the price stopped being owed. `formaBackdropClearCss()` (formaSceneQuality)
     * is the pure decision and it still returns `null` the moment a real gradient comes back — so
     * this field carries BOTH behaviours and nobody has to remember to restore one.
     */
    readonly backgroundColourCss: string | null;
    /** Whether the container carries the Forma CSS sky gradient (`applyFormaSkyBackdrop`). */
    readonly formaSkyBackdrop: boolean;
    /**
     * ⛔ THE L-12991 FIELD. May a CITY-BOUNDED quantized-mesh terrain tileset be attached to
     * `viewer.terrainProvider` right now? FALSE on the global surface — a bounded provider renders
     * one or two level-0 roots at world range and nothing else (the shard). The site surface still
     * gets its city terrain unconditionally: L-636 §TERRAIN-NORMALS, L-639 §CAMERA-UNDERGROUND-FIX
     * and the per-footprint seat path all depend on it, so refusing it there would be a different,
     * worse defect.
     */
    readonly boundedTerrainPermitted: boolean;
    /**
     * §GLOBE-IS-ITS-OWN-CONTEXT (L-13144, founder 2026-09-07: *"3d globe (3d tiles renders sound)
     * however, it renders with all the context from 3d site - check why and fix it sound"*) —
     * whether PRYZM's SYNTHESISED context overlay is shown: the extruded context buildings, the
     * road / rail / water / sea ribbons, the land-use drape, the park polygons, the tree canopies,
     * the street furniture, and the §SITE-SCOPE cut slab.
     *
     * ⭐ THE DISTINCTION THAT MAKES THIS SOUND. **On the globe the photoreal tileset IS the
     * context.** Our synthesised city is not merely redundant there — it is a stylised Barcelona
     * drawn ON TOP of the real one, two representations of the same buildings fighting for the same
     * pixels. That is what must go.
     *
     * ⛔ AND THE USER'S OWN WORK MUST STAY. The parcel boundary, the buildable envelope, the
     * to-be-built massing and the authored room/space envelopes are the entire reason to be on the
     * globe — `§PLOT-CLEAR-PHOTOREAL` exists to cut a parcel-shaped void into the photoreal tileset
     * precisely so *"the proposed design now reads inside real context"*. So the split is
     * **SYNTHESISED CONTEXT hides · AUTHORED-OR-DERIVED DESIGN stays**, and a row that hid
     * everything would destroy the feature the void cut was built for.
     *
     * ⚠ THIS IS A VISIBILITY FLIP, NOT A TEARDOWN. Nothing is disposed, nothing is re-fetched, and
     * nothing is re-seated: returning to `'forma-site'` sets the same `show` flags back to true and
     * the already-built, already-ground-seated primitives reappear exactly where they were. A hide
     * that forced a rebuild would reintroduce the multi-second reload this whole area has been
     * fighting (§CTX-BUILDINGS-RENDER-FIRST, L-635).
     */
    readonly synthesisedContextShown: boolean;
}

/**
 * The table. Two rows, no branches beyond the one predicate — so "what does the globe surface look
 * like" is answerable by reading, and testable without a GPU.
 *
 * @param formaGroundCss  `FORMA_PALETTE.ground` — the Forma study's flat land tone.
 * @param globeLoadingCss `GLOBE_LOADING_COLOUR` — §GLOBE-FIRST-FRAME-COLOUR's brand-safe base
 *                        (founder 2026-06-18: *"cesium originally shows black"*), never pure black.
 * @param formaBackdropCss `formaBackdropClearCss()` — the flat backdrop colour the Forma site row
 *                        may clear to OPAQUELY, or `null` while the backdrop is a real gradient and
 *                        the canvas must stay see-through. Passed in, never imported: this module
 *                        owns no colours (see the header), and it must not learn a hex from a
 *                        second place any more than `formaGroundCss` may.
 */
export function cesiumSurfaceWrites(
    kind: CesiumSurfaceKind,
    palette: {
        readonly formaGroundCss: string;
        readonly globeLoadingCss: string;
        readonly formaBackdropCss: string | null;
    },
): CesiumSurfaceWrites {
    if (kind === 'forma-site') {
        return {
            imageryLayersShown: false,
            tilesetsShown: false,
            globeShown: 'always',
            globeBaseColourCss: palette.formaGroundCss,
            globeEnableLighting: false,          // flat-lit study (§2); the terrain attach raises it on relief.
            // §SITE-SCOPE-CITYWEFT — band [0.82, 1.00] instead of Cesium's [0.30, 1.00]. The darkest
            // slope now paints #F5F2EA × 0.82 = rgb(201, 198, 192) = #C9C6C0, a pale warm grey, and
            // the sunlit face still reaches the full paper (0.18 + 0.82 = 1.00 exactly, so the band
            // is used end to end and the shader's clamp never clips). 18 % of contrast is what the
            // relief has to read with — deliberately, and it is the whole knob: raise it and the
            // hills go brown again, drop it to 0 and you are back to L-636's white mask.
            globeLambertDiffuseMultiplier: 0.18,
            globeVertexShadowDarkness: 0.82,
            globeDynamicAtmosphereLighting: false,
            globeShowGroundAtmosphere: false,
            globeTranslucency: false,
            skyShown: false,
            fog: 'forma-soft',
            // §SITE-SCOPE-CITYWEFT-CLEAR (L-13100) — the founder's flat white is clearable, so the
            // canvas paints it itself instead of leaving a hole for a DOM style to fill. `null`
            // here (a restored gradient) still means TRANSPARENT + the CSS backdrop, unchanged.
            backgroundColourCss: palette.formaBackdropCss,
            formaSkyBackdrop: true,
            boundedTerrainPermitted: true,
            // The site view IS the synthesised study — this is the surface the context was built for.
            synthesisedContextShown: true,
        };
    }
    return {
        imageryLayersShown: true,
        tilesetsShown: true,
        globeShown: 'unless-tileset-shown',
        globeBaseColourCss: palette.globeLoadingCss,
        globeEnableLighting: true,
        // The Earth keeps Cesium's own defaults (index.js:214856 / :214880) — a planet with a
        // 18 % shading band would have no terminator. This row is NOT the cityweft look.
        globeLambertDiffuseMultiplier: 0.9,
        globeVertexShadowDarkness: 0.3,
        globeDynamicAtmosphereLighting: true,
        globeShowGroundAtmosphere: true,
        globeTranslucency: false,
        skyShown: true,
        fog: 'off',
        backgroundColourCss: palette.globeLoadingCss,
        formaSkyBackdrop: false,
        boundedTerrainPermitted: false,
        // §GLOBE-IS-ITS-OWN-CONTEXT (L-13144) — the photoreal tileset is the context here, so ours
        // is a stylised city drawn over the real one. Hidden, not disposed. The DESIGN stays.
        synthesisedContextShown: false,
    };
}

/**
 * The console line for a framing change. Pure so the honesty rule is testable the same way
 * `describeTerrainTransition` makes its own testable: the line names BOTH facts that decided the
 * surface, so a future reader can tell a globe-that-kept-the-city-terrain from a genuine flat site.
 */
export function describeCesiumSurface(
    framing: CesiumViewFraming,
    formaMode: boolean,
    kind: CesiumSurfaceKind,
): string {
    return (
        `[CesiumViewport][surface] §GLOBE-INHERITS-THE-CITY-TERRAIN (L-12991) framing='${framing}' ` +
        `forma=${formaMode ? 'on' : 'off'} → surface='${kind}'` +
        (kind === 'global-earth'
            ? ' — imagery + photoreal + atmosphere ON, NO city-bounded terrain tileset may be ' +
              'attached (a bounded tileset renders 1-2 level-0 roots at world range: the shard), ' +
              'and the SYNTHESISED PRYZM context is HIDDEN (§GLOBE-IS-ITS-OWN-CONTEXT, L-13144: the ' +
              'photoreal tileset IS the context) while the DESIGN — parcel, envelope, massing, room ' +
              'envelopes — stays visible.'
            : ' — flat Forma ground, imagery + photoreal hidden, city terrain permitted, ' +
              'synthesised context shown.')
    );
}
