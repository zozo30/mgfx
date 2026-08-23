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

Resource uploads are separate from MGFX frames. A frame may reference only
resources acknowledged as ready, keeping display lists small and allowing the
server to retain GPU allocations between frames.

## Raster images

The portable first format is premultiplied RGBA8 plus width, height, row stride,
and an sRGB/linear color-space tag. PNG, JPEG, WebP, and other container formats
are decoded in the client runtime, not by a graphics backend. The server uploads
the validated pixels into a native texture resource.

`DrawImage` references a texture ID and carries destination rectangle, normalized
UV rectangle, tint, sampling mode, and opacity. Nine-slice and repeating image
patterns can be tessellated by the frontend into several ordinary image quads.

## SVG and vector paths

SVG remains a frontend document format. The TypeScript or VM runtime parses it
and resolves document-level styles and transforms into canonical path commands.
Those commands become connection-scoped path resources. The graphics server
flattens curves and tessellates fills/strokes into cached geometry shared by
Metal, Vulkan, or DirectX backends, avoiding duplicated tessellators in every
language client without embedding a complete SVG engine in the server.

Reusable `Mesh` resources contain positions, optional UVs, vertex colors, and
indices. Gradient stops become either vertex colors for simple gradients or a
small sampled texture for complex gradients. Raster fallback is allowed for SVG
features that the vector path does not yet support.

The current `DrawPath` paint supports a two-stop source-space linear gradient.
Gradient endpoints and colors are deliberately excluded from the tessellation
cache key, allowing paint animation without rebuilding path geometry.

MGFX colors are specified as straight RGBA. Backends must premultiply before
interpolation and use source-over compositing. Texture uploads remain
premultiplied RGBA8, giving vector and image draws the same blending result.

## Text and fonts

The built-in 5×7 font remains a bootstrap and diagnostic path. The implemented
`DrawText` command carries UTF-8, a portable system-family choice, position,
size, and color. The macOS server shapes it with CoreText, converts glyph
outlines through the shared path tessellator, and caches geometry by family and
string. Metal therefore receives compact cached vector text instead of one
rectangle pair per lit pixel. Other native hosts can execute the same command
through DirectWrite or a HarfBuzz/FreeType service.

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
2. **Implemented:** bounded client PNG/JPEG decoding, `<Image>`, and
   fill/contain/cover geometry. Resource-ready acknowledgements remain to add.
3. **Implemented:** persistent canonical path resources plus server-side
   adaptive curve flattening, concave/compound fills, and width/cap/join stroke
   tessellation with geometry caching. Stroke contours are triangulated as one
   outline, so translucent segment joins do not darken from overlapping quads.
   Direct `<Mesh>` remains available.
   Next add persistent mesh resources and selective lowering of complete
   `<Svg>` documents.
4. **Partially implemented:** compact Unicode `DrawText`, native shaping, and
   cached glyph-outline geometry. Next add font uploads, exact asynchronous
   metrics, rich-text runs, and atlas caching.
5. Add cache budgets, device-loss recreation, and resource tracing tools.

None of these stages changes window, layout, event, or component ownership: the
client remains the program and the endless native process remains a graphics,
window-system, input, clipboard, and resource server.
