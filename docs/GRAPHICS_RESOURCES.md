# MGFX resource architecture

The current display list deliberately starts with geometry: solid and gradient
fills, borders, circles, rounded rectangles, clips, patterns, and animations all
lower to backend-neutral colored triangle meshes. Images, SVG, and production
text should extend that model through connection-scoped resources rather than
introducing Metal objects into the public protocol.

## Resource identity and lifetime

Each client chooses nonzero 32-bit resource IDs scoped to its MGIP connection.
The server drops every resource when that connection retires, so hot replacement
cannot leak assets or accidentally use resources from the previous build.
Create messages are idempotent for the same ID and content generation; explicit
destroy messages permit early release. Servers enforce per-resource and
per-connection byte limits before allocation.

The React surface performs commit-level reachability for paths, meshes, and
embedded textures. Resources absent from the new visible tree are destroyed after
its replacement frame is submitted and removed from the upload set, so a later
remount safely recreates the same canonical ID.

Resource uploads are separate from MGFX frames. A frame may reference only
resources acknowledged as ready, keeping display lists small and allowing the
server to retain GPU allocations between frames.

`ResourceStatus` reports readiness only after a texture reaches Metal, a path or
mesh reaches the renderer cache, or a font passes CoreText validation. The server
tags pending work with its connection generation, preventing late completion from
an old build from acknowledging a reused resource ID in the new build.

## Raster images

The portable first format is premultiplied RGBA8 plus width, height, row stride,
and an sRGB/linear color-space tag. PNG, JPEG, WebP, and other container formats
are decoded in the client runtime, not by a graphics backend. The server uploads
the validated pixels into a native texture resource.

`DrawImage` references a texture ID and carries destination rectangle, normalized
UV rectangle, and tint; inherited opacity applies on the server. Repeating image
patterns do not require resending the underlying pixels.

The implemented `DrawImageSurface` extension adds a rounded-corner radius and an
explicit linear/nearest sampling flag while retaining the same texture, UV, tint,
transform, opacity, and clip semantics. Metal applies the rounded mask per fragment;
support is advertised by `imageSurfaces`.

`DrawTiledImageSurface` uses the same rounded fragment mask and adds independent
X/Y repeat flags. UV extents encode tile count and phase, so a large or animated
area remains one fixed-size command. Support is advertised by `tiledImageSurfaces`.

`DrawNineSliceImage` carries normalized source border insets and logical
destination border insets. The backend collapses opposing borders proportionally
for undersized destinations and submits all nine patches in one draw. Support is
advertised by `nineSliceImages`.

The UI image layer also accepts a bounded pixel-space source rectangle. It
normalizes the selected atlas frame into the existing `DrawImage` UV fields;
frame changes therefore need neither a new resource nor a new protocol opcode.

## SVG and vector paths

SVG remains a frontend document format. The TypeScript or VM runtime parses it
and resolves document-level styles and transforms into canonical path commands.
Those commands become connection-scoped path resources. The graphics server
flattens curves and tessellates fills/strokes into cached geometry shared by
Metal, Vulkan, or DirectX backends, avoiding duplicated tessellators in every
language client without embedding a complete SVG engine in the server.

React `<Svg>` implements the selective document path: a bounded parser reads the
root view box, inherited fill/stroke/opacity state, nested groups, primitive
shapes, and translate/scale/rotate/matrix transforms. Each painted primitive
becomes a stable path resource with its own compact paint command. Linear gradients
resolve from `<defs>` in either SVG user space or object-bounding-box
space, including stop opacity, gradient transforms, and fragment-only `href` or
`xlink:href` inheritance, then use native `DrawPath`
gradient paint. Radial definitions resolve the same local inheritance chain for
geometry, transforms, spread, and stops. Centered two- through eight-stop radial fills with `pad`, `repeat`,
or `reflect` spread resolve into a center and two radius vectors, preserving elliptical
and transformed fields without client tessellation. Offset focal points and nonzero
focal radii use the native two-circle solver. `stroke-dasharray`
sequences of up to 32 values plus
`stroke-dashoffset` lower to native dashed path paint. Odd sequences are repeated
to form alternating paint/gap pairs. Executable or external content is rejected, while complex gradients
and masks deliberately continue through the high-quality raster fallback.
Missing, cyclic, or external gradient references are rejected rather than partially rendered.
Embedded PNG/JPEG and nested SVG data URLs in SVG `<image>` elements decode under the same
dimension and byte bounds as direct images, deduplicate by content hash, and
upload once as connection-scoped textures. Native image commands preserve
all nine `preserveAspectRatio` alignments with meet/slice plus `none`, opacity,
rectangular clips, affine
transforms, and linear or nearest sampling. Nested SVG is rasterized into the
canonical texture while network and filesystem URLs remain rejected.
Local `<use>` references to primitive, group, or symbol definitions expand before
canonicalization. Each instance retains its own paint and transform while the
definition itself remains non-rendering; external, missing, duplicate, cyclic,
or expansion-bomb references are rejected. Symbol `viewBox` coordinates map to
numeric instance dimensions with aligned `meet`, clipped `slice`, or nonuniform
`none` scaling. Slice adds only balanced display-list clip commands around the
cached path reference; rotated and skewed viewport clips await polygon clipping.
Local `<clipPath>` references containing one numeric `userSpaceOnUse` `<rect>` use
that same source-space clip field. Nested group clips intersect before the frame is
encoded; rounded, object-bounding-box, rotated, and skewed clips remain explicit fallbacks.
Bounded internal CSS applies simple tag/class/ID compound selectors using normal
specificity and source order, followed by inline style. Supported declarations map
only to existing native paint, stroke, transform, visibility, gradient-stop, and
clip state; at-rules, combinators, `!important`, and unknown properties are rejected.

Reusable `Mesh` resources now contain positions, vertex colors, and triangle
indices. `MeshCreate` uploads and validates them once; `DrawMesh` references the
ID plus destination and view box, so resizing and animation do not retransmit
geometry. The server caches the expanded triangle list and applies display-list
transforms and opacity. Optional UVs remain a future extension. Gradient stops become either vertex colors for simple gradients or a
small sampled texture for complex gradients. Raster fallback is allowed for SVG
features that the vector path does not yet support.

The current `DrawPath` paint supports a two-stop source-space linear gradient.
Gradient endpoints and colors are deliberately excluded from the tessellation
cache key, allowing paint animation without rebuilding path geometry.
`DrawExtendedPath` adds an independent two-stop stroke gradient, optionally
combined with dashing, while preserving that paint-independent geometry cache.

`DrawDashedPath` extends the same paint with dash length, gap, and signed phase.
The server splits flattened contours at exact arc-length boundaries before using
the ordinary cap/join stroke tessellator. Dash style participates in the bounded
geometry cache; clients still upload only the original canonical path.

`DrawDashArrayPath` carries 2 through 32 alternating paint/gap lengths. The
server performs the same exact arc-length splitting and includes the complete
sequence in its geometry cache key; clients never expand the pattern into line
segments.

`DrawMultiGradientPath` carries two through eight ordered color stops for fill,
stroke, or both. The server clips cached triangles at stop boundaries before
assigning vertex colors, preserving exact piecewise-linear interpolation even
for a large rectangle whose original mesh has only corner vertices.
The same server clipping implements SVG `pad`, `repeat`, and `reflect` spread
modes, assigning independent colors to coincident seam vertices so cycles do not smear.

Stroke caps are encoded as butt (`0`), round (`1`), or square (`2`), and joins
as bevel (`0`), round (`1`), or miter (`2`). Square-cap extension and miter
intersection are server tessellation details. The default limit is four stroke
half-widths; `DrawStyledPath` can override it per draw. Longer miters fall back
to bevel joins, preventing sharp paths from producing unbounded geometry.

MGFX colors are specified as straight RGBA. Backends must premultiply before
interpolation and use source-over compositing. Texture uploads remain
premultiplied RGBA8, giving vector and image draws the same blending result.

## Text and fonts

The built-in 5×7 font remains a bootstrap and diagnostic path. The implemented
`DrawText` command carries UTF-8, a portable system-family choice, position,
regular/medium/semibold/bold weight, regular/italic style, size, and color. The
macOS server shapes it with CoreText, converts glyph outlines through the shared
path tessellator, and caches the result. `DrawStyledText` adds solid outline color
and an em-relative width; the server strokes the same CoreText contours, so SVG
clients never transmit glyph paths or triangles.
path tessellator, and caches geometry by family, weight, style, spacing, and string.
Metal therefore receives compact cached vector text instead of one
rectangle pair per lit pixel. Other native hosts can execute the same command
through DirectWrite or a HarfBuzz/FreeType service.
The level-4 text extension adds start/middle/end anchor and top/alphabetic baseline
enums. Backends apply cached native advance and ascent, which lets inline SVG text
retain baseline placement while still sending only UTF-8 and semantic font style.
The client conjugates an SVG text matrix through the document-to-normalized mapping
and brackets `DrawText` with the existing transform stack, preserving rotation,
skew, reflection, and nonuniform scale without altering cached glyph geometry.

Family codes select semantic system sans, fixed-pitch, serif, or rounded
designs. They deliberately do not expose platform font names, so identical
client commands remain meaningful on every backend.

Clients may also upload a bounded font file once with `FontCreate` and refer to
its connection-scoped ID from both `DrawText` and `TextMeasure`. The macOS host
constructs a Core Graphics font, then CoreText owns shaping and outlines exactly
as it does for system families. Replacement increments a resource version used
by the geometry cache, while disconnect and `FontDestroy` release native data.

`DrawRichText` keeps a styled line in one display-list command. Its run table
contains compact style records and UTF-8 slices; the graphics server shapes each
slice, advances one native pen, and batches the resulting colored glyph geometry.
React exposes the same model through declarative `<RichText spans={...}>` and
direct SVG `<tspan>` children. Native rich-text placement anchors the full shaped
advance and aligns mixed fonts on a shared alphabetic baseline. Explicit numeric
`x` positions split an SVG label into compact native run groups; `y/dx/dy` adjust
each restarted pen without asking the client to measure or construct glyphs.
Nested spans flatten into the same run table. SVG `text-decoration` maps to the
existing underline and line-through flags, whose geometry comes from native font
metrics on the server. A bounded per-run font scale preserves nested `font-size`
changes; Metal scales cached native outlines and advances, then baseline-aligns
mixed sizes without any client-side glyph measurement.
Per-run baseline shifts support SVG numeric/percentage shifts plus `super` and
`sub`; the server offsets cached geometry while preserving shaped advances.
Outlined run lists use `DrawStyledRichText`: each run adds a straight-alpha stroke
color and an em-relative width while preserving its UTF-8 and font semantics.
CoreText supplies glyph contours and the server tessellates both filled and
stroke-only spans; the client never sends glyph meshes.
`DrawGradientText` applies 2–8 stop user-space linear paint to the same cached
CoreText contours. Stops and pad/repeat/reflect semantics remain compact protocol
data; Metal interpolates color over the server-generated glyph triangles.

Optional letter spacing is transported in em units and applied by the native
shaper, not by splitting a string into client-side glyph commands. Its value is
part of shaping, measurement, and geometry cache identity.

Underline and line-through are compact paint flags. The backend obtains their
positions and thicknesses from the selected native font and emits them with the
cached glyph geometry, keeping decoration correct for every face and size.

Clients request the exact native advance once per unique family/string through
correlated `TextMeasure`/`TextMetrics` MGIP messages. React first lays out with a
nonblocking estimate, caches the em-unit reply, and performs one corrected
layout; animation frames do not repeat measurement traffic.

React uses native system text by default. Explicit newline boundaries are
measured independently and lower to one `DrawText` command per nonempty line;
blank lines still contribute configured line-height spacing. The pixel font is
available only through an explicit diagnostic style.

Metal uses 4× MSAA when supported, so small cached outline glyphs and vector
icons receive hardware edge coverage before source-over resolve. Typography
still chooses drawable-pixel sizes in the frontend; the React defaults are
calibrated for Retina rather than reusing the smaller pixel-font values.

Optional automatic wrapping stays frontend-owned: the component layout engine
greedily fits words using cached native word and space advances, then emits only
the resulting lines. Start, center, and end alignment use those same widths, so
the graphics server remains a display-list executor rather than a UI layout
engine.

Font weight is part of both draw and measurement cache identity. React uses
bold native faces for titles, section labels, dialog headings, and buttons while
body text remains regular; measurement therefore always matches the geometry
that is eventually drawn.

Editable text reuses the same measurement path: a focused field shapes the runs
around a visible caret and highlighted selection. Captured pointer movement is
translated to element-local coordinates by the retained UI host, then character
advances map horizontal positions to Unicode code-point indices. Selection and
editing stay in the component system while the graphics server remains
responsible only for shaping and draw execution. Keyboard modifiers survive
focused dispatch, enabling Shift+arrow range extension and semantic Select All.
React exposes the correlated native animation clock through context. A focused
text field subscribes for caret blinking and cancels immediately on blur, so
reusable components share display cadence without owning timers.

## Transform stack

`PushTransform` carries a six-float affine matrix in normalized device space;
`PopTransform` restores the parent matrix. The Metal backend composes nested
records and transforms every drawable category after decoding, so clients send
stable resources and animate only a compact matrix. Component styles calculate
matrices from pixel translation, scale, degree rotation, and fractional origin.
The retained input tree walks the inverse transforms for pointer hit testing.
Servers advertise this optional display-list extension with the negotiated
`transformStack` capability bit.

`PushOpacity`/`PopOpacity` form a parallel inherited-alpha stack. Metal
multiplies the effective alpha into vertex colors, image tint, path gradients,
and native text after decoding. This is lightweight inherited opacity rather
than offscreen group isolation, and is advertised by `opacityStack`.

## Soft shadows

`DrawShadow` contains a normalized destination plus pixel-space corner radius,
blur, spread, and color. Metal expands one quad and evaluates a rounded-box
signed-distance field per fragment. The command is drawn before the component's
own clip and content, while inherited parent clips, transforms, and opacity remain
active. Servers advertise this path with `softShadows`.

## Radial gradients

`DrawRadialGradient` carries one destination, a normalized focal point, pixel
radius and corner radius, plus inner and outer colors. A dedicated fragment
pipeline calculates smooth radial falloff and an antialiased rounded mask. It
inherits transforms, opacity, and clipping and is advertised by
`radialGradients`.

`DrawRadialPath` applies the same idea to any persistent path resource. Its center
and two independent source-space radius vectors define a possibly elliptical or
rotated basis. Metal inverts that basis per fragment and interpolates the two
straight-alpha endpoint colors by radial distance. Path tessellation and paint
remain independent, and support is advertised by `radialPathGradients`.
`DrawMultiRadialPath` extends the same fragment path with two through eight
ordered stops. The stop table changes paint only and is advertised independently
by `multiStopRadialPathGradients`.
Repeat and reflect wrap radial distance in the same fragment shader before stop
selection and are advertised by `radialPathGradientSpreadModes`.
`DrawFocalRadialPath` adds an offset source-space focal point. Metal transforms it
into the elliptical basis and solves the ray intersection with the outer unit circle
per fragment, preserving multi-stop and spread behavior without shifted-circle
approximations. Support is advertised by `focalRadialPathGradients`.
`DrawTwoCircleRadialPath` additionally carries focal radius divided by outer
radius. Metal solves the quadratic formed by the interpolated center and radius;
pixels inside the focal circle receive the first stop. Support is advertised by
`twoCircleRadialPathGradients`.
All radial path forms may target fill or stroke triangles. Independent radial
fill and stroke paints are separate draw commands over the same cached path
resource; support is advertised by `radialPathGradientStrokes`.
`DrawStyledRadialPath` combines any radial model with the existing server-owned
stroke styles: up to 32 dash lengths, signed phase, caps, joins, and a custom
miter limit. Geometry-cache keys include stroke style but remain independent of
the radial stop colors. Support is advertised by `styledRadialPathPaint`.

`DrawConicPath` applies two through eight ordered angular stops around a
source-space center. Fill and cached stroke geometry share the same fragment
paint path; dash arrays, signed phase, caps, joins, and miter limits stay in the
server tessellator. Animating rotation changes paint only. Support is advertised
by `conicPathGradients`.

`DrawTexturePath` binds an existing texture resource as paint for a cached path
fill or stroke. A source-space tile rectangle maps to a normalized UV crop;
independent X/Y repetition, tint, and nearest/linear sampling remain fragment
parameters. Dashed textured strokes still use the server's geometry cache and
tessellator. Support is advertised by `texturePathPaint`.

## Linear gradients

`DrawLinearGradient` carries one destination, rounded-corner radius, a portable
horizontal/vertical/diagonal direction, and two colors. Metal interpolates the
straight-alpha colors and applies an antialiased rounded mask per fragment. The
command inherits clipping, transforms, and opacity and is advertised by
`linearGradients`.

`DrawLinearGradientCircle` carries the same portable direction and two colors
without client geometry. Metal evaluates a centered radius from the shorter
destination axis and masks the gradient with derivative antialiasing. Non-square
bounds therefore match the existing solid-circle semantics rather than becoming
a rounded rectangle. Support is advertised by `linearGradientCircles`.

## Conic gradients

`DrawConicGradient` carries a destination, normalized center, radian rotation,
rounded-corner radius, and three colors. Metal derives the polar angle and blends
start-to-middle-to-end while applying an antialiased rounded mask. Using the same
start and end color closes the angular seam for continuously rotating badges and
dials. Support is advertised by `conicGradients`.

## Rounded rectangles

`DrawRoundedRect` combines destination, pixel corner radius and border width,
plus fill and border colors. Its fragment shader evaluates outer and inner SDFs
with derivative antialiasing, replacing client-generated 32-segment fill and
border meshes. The command inherits all display-list state and is advertised by
`roundedRectangles`.

`DrawCircle` similarly combines a solid circular fill and border ring. Metal
evaluates radial edge distance with derivative antialiasing; component clients
send no circle or ring tessellation. Support is advertised by `circles`.

`DrawDiagonalPattern` carries a destination plus pixel stripe width, gap, phase,
direction, and color. The fragment shader derives a periodic antialiased mask;
wire size stays constant as the patterned area grows. Support is advertised by
`diagonalPatterns`.

`DrawGridPattern` carries pixel spacing, minor and major widths, a periodic major
interval, two colors, rounded-corner radius, and a two-dimensional phase offset.
Metal derives the nearest horizontal and vertical lines per fragment and gives
major intersections priority without overlapping-alpha seams. Support is
advertised by `gridPatterns`.

`DrawDotGrid` carries a destination, up to 32 cells, a fill bitmask, an optional
active cell, dot geometry, and fill/ring/highlight colors. The fragment shader derives
cell centers and antialiased disk or ring coverage, so grid density does not multiply
display-list commands. Support is advertised by `dotGrids`.

`DrawWaveDots` carries a destination, dot count, phase/frequency, radius range,
border, and trough/crest gradient paints. One animated phase float drives the entire
row while the backend evaluates circle coverage and color per fragment. Support is
advertised by `waveDots`.

Deterministic application fonts will use uploaded font-byte resources and
explicit shaped glyph runs with glyph IDs, advances, offsets, direction, and
cluster mapping. This keeps line breaking, selection, and accessibility
semantics with the component system. A future atlas path can rasterize requested
glyph IDs into persistent textures and draw cached textured quads. Atlas
entries are keyed by font generation, size, variation axes, glyph ID, and render
mode. SDF/MSDF atlases may later improve scalable UI text, while grayscale or
color glyph atlases remain available for small text and emoji.

## Proposed implementation order

1. **Implemented:** texture upload/destroy messages and `DrawImage` quads.
2. **Implemented:** bounded client PNG/JPEG decoding, `<Image>`,
   fill/contain/cover geometry, and native resource-ready/rejected events.
3. **Implemented:** persistent canonical path resources plus server-side
   adaptive curve flattening, concave/compound fills, and width/cap/join stroke
   tessellation with geometry caching. Stroke contours are triangulated as one
   outline, so translucent segment joins do not darken from overlapping quads.
   Direct `<Mesh>` remains available.
   Persistent colored mesh resources and selective lowering of complete `<Svg>`
   documents are also implemented.
4. **Partially implemented:** compact Unicode `DrawText` and `DrawRichText`, native
   shaping, persistent font uploads, cached glyph-outline geometry, exact
   asynchronous advance metrics, and frontend-owned multiline rich-text wrapping.
   Next add atlas caching.
5. Add cache budgets, device-loss recreation, and resource tracing tools.

None of these stages changes window, layout, event, or component ownership: the
client remains the program and the endless native process remains a graphics,
window-system, input, clipboard, and resource server.
