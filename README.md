# MGFX Local Graphics Server

A local graphics server built around a versioned, backend-neutral binary command
protocol. A separate client owns the component tree, layout, and window
lifecycle, while the long-running server supplies the AppKit/Metal host.

## Architecture

```text
MGFXDemo / future TypeScript or VM client
                  |
                  | MGIP framed messages over a local Unix socket
                  v
             MGFXServer
                  |
                  +-> Metal backend -> GPU
                  +-> Vulkan backend (future)
                  +-> DirectX backend (future)
```

The wire format starts with the bytes `MGFX`, a protocol version, total size, and
command count. Every command has an opcode and payload byte count, so a decoder
can validate bounds and skip future opcodes it does not understand. Integer and
floating-point fields are encoded explicitly in little-endian order; the format
does not serialize compiler-dependent C++ struct layouts.

Version 1 contains `clear`, `draw`, `pushClip`, `popClip`, and `endFrame` commands. See
`src/GraphicsProtocol.hpp` for the frontend API and `src/Renderer.cpp` for the
first backend implementation.

The display list now also contains `drawImage`. Clients upload validated RGBA8
pixels once as a connection-scoped MGIP texture resource; frames reference its
ID, UV rectangle, destination, and tint. The Metal backend retains the native
texture and uses a separate sampled-image pipeline, providing the base for real
PNG/JPEG decoders, SVG raster fallback, and font glyph atlases.

Rounded pictures use the compatible `DrawImageSurface` extension. It adds a
pixel-space corner radius and portable linear/nearest sampling choice; Metal masks
the sampled texture with an antialiased rounded SDF, so cards and avatars need no
client-generated clipping geometry.

The React client includes bounded PNG, JPEG, and SVG decoders. Raster files are converted to
premultiplied RGBA8, uploaded once, and displayed with `fill`, `contain`, or
`cover` geometry computed by the backend-neutral UI runtime.
SVG currently uses a client-side high-quality raster fallback, including vector
paths, gradients, masks, transforms, and system-font text; Metal still receives
only the same portable texture resource and `DrawImage` command.

React also exposes a selective vector `<Svg>` path for complete inline documents.
It lowers paths, lines, polylines, polygons, rectangles, circles, and ellipses;
inherits fill/stroke presentation attributes through nested groups; applies affine
group transforms in source coordinates; resolves two- through eight-stop `<linearGradient>` definitions,
including local `href`/`xlink:href` inheritance and `pad`, `repeat`, or `reflect`
spread, in user space or object-bounding-box space; resolves centered two- through
eight-stop `<radialGradient>` fills with `pad`, `repeat`, or `reflect` spread into
native elliptical path paint, including local definition inheritance and offset
`fx`/`fy` focal points;
nonzero `fr` focal circles use the same native fragment path;
lowers SVG dash arrays of up to 32 values;
and uploads every canonical layer once.
Frames then contain only `DrawPath` references at the component's current layout
size. Documents using more complex gradients, masks, text, embedded images, or external content
continue through the bounded raster fallback instead of partially misrendering.

React can also submit indexed normalized `Mesh` geometry directly. Positions,
per-vertex colors, and indices upload once as a connection-scoped mesh resource;
frames carry only `DrawMesh`, its destination, and source view box. The server
caches expanded triangle geometry and applies layout, transforms, and opacity.
`Mesh` remains the explicit low-level escape hatch for application-owned geometry.

The React `Path` component now directly accepts SVG path data. Relative and
absolute commands are normalized, arcs and quadratic segments become cubics,
TypeScript sends those backend-neutral `move`, `line`, `cubic`, and `close`
commands once as a persistent MGIP path resource. Frame display lists reference
the resource with `DrawPath`, destination, paint, fill rule, tolerance, and
stroke parameters; they contain no generated path vertices.

The graphics server owns adaptive curve flattening and tessellation. Its cache
is keyed independently from destination and paint, so animated colors and
layout changes reuse geometry. Compound paths support SVG `evenodd` and
`nonzero` fill rules, while strokes support configurable width, butt, round, or
square caps, and bevel, round, or miter joins. Miters default to a safety limit
of four stroke half-widths, accept an explicit SVG `stroke-miterlimit`, and fall
back to bevels beyond the limit. `DrawPath` also supports source-space linear
gradient fills: the server derives colors from cached source geometry and clips
triangles at intermediate stop boundaries for exact piecewise interpolation.
Centered radial fills likewise remain paint-only: the command carries a center,
two source-space radius vectors, and up to eight ordered colors, while Metal
evaluates the elliptical falloff per fragment over the server-owned path mesh.
The same gradient paint is available for strokes, so changing gradient colors
does not invalidate tessellation. Two-value dashed strokes use the compact
`DrawDashedPath` extension, while longer rhythms use `DrawDashArrayPath`: dash
splitting, curve flattening, joins, and caps all remain server-owned and cached.
The demo loads several icons from the
ISC-licensed `lucide-static` package through this path pipeline.

All colored geometry uses source-over alpha compositing. Straight-alpha MGFX
vertex colors are premultiplied in the vertex shader before interpolation, then
blended with `one` / `one-minus-source-alpha`; translucent paths, gradients,
meshes, text, circles, and patterns therefore compose consistently with
premultiplied uploaded images.
The client loader converts SVG paths, lines, polylines, polygons, rectangles, circles,
and ellipses into a common path stream, so the gallery is not restricted to
path-only icons.

The local process protocol uses `MGIP` framing and a per-user Unix-domain socket
at `/tmp/mgfx-<uid>.sock`. It carries MGFX frames from client to server and sends
resize, pointer-down, and close events back to the client. Payloads are capped at
64 MiB, the socket is mode `0600`, and the server accepts only peers with the same
effective user ID. No TCP listener exists.

Window metadata remains native but is client-controlled. A connected client can
send a bounded UTF-8 `WindowTitle` message; the server applies it to its AppKit
window on the main thread.

The server starts headless and keeps listening without a client. `WindowConfig`
is the create/show request: the first one creates the native surface and later
clients reconfigure and reuse it. When a client disconnects, its window is
hidden but the server, Metal device, renderer, shaders, and Unix listener stay
alive for the next build.

Each connection begins with `ServerHello`, which identifies the MGIP version,
active graphics backend, and feature bits. Frontends can therefore target
capabilities rather than Metal, Vulkan, or DirectX by name. The first positive
`Resize` is also the acknowledgement that the requested drawable is ready.

The original 32-bit `ServerHello` remains byte-for-byte stable and is followed
by an optional `ServerCapabilities` message carrying the complete 64-bit mask.
Legacy clients safely ignore that companion; current clients gain bits 32–63
without spending protocol version 2 merely to add feature space.

Frames use the MGIP sequence field for presentation pacing. The server sends
`FramePresented` after Metal completes the submitted command buffer. TypeScript
and React keep one frame in flight and collapse a burst of pending commits to its
newest frame, preventing animation or input bursts from building an unbounded
render queue.

MGIP also provides a one-shot `RequestAnimationFrame`/`AnimationFrame` clock.
The timestamp comes from the native display loop, so React hooks and future VM
programs can animate without platform APIs or free-running JavaScript timers.

Cursor shape is client-owned as well. React buttons and text fields lower their
hover state to portable pointing-hand and I-beam requests, which the macOS host
maps to real AppKit cursors while keeping `NSCursor` out of the frontend API.

Text clipboard access follows the same boundary. React's Copy and Paste buttons
call an asynchronous MGIP service; only the native host touches `NSPasteboard`.
The same service backs semantic Copy, Cut, and Paste key events, mapped from
Command-C/X/V by macOS without exposing platform modifier conventions to widgets.

Clients may also request initial content dimensions and minimum resize limits in
logical host units. The server validates the request before applying it, while
drawable-pixel resize events continue to drive client layout.

The language-neutral framing and event payloads are specified in
[`docs/LOCAL_PROTOCOL.md`](docs/LOCAL_PROTOCOL.md), so future TypeScript and VM
clients do not need to reproduce C++ object layouts.

The staged portable design for textures, images, SVG meshes, shaped glyph runs,
and font atlases is documented in
[`docs/GRAPHICS_RESOURCES.md`](docs/GRAPHICS_RESOURCES.md).

The TypeScript client also has its own retained component and layout runtime in
`clients/ts/src/ui.ts`. This demonstrates that component state, measurement,
layout, and interaction can live entirely in another language while the native
process remains only a window, event, and graphics server.

The layout tree supports stable numeric `zIndex` ordering and absolute `inset`
positioning without changing flow measurement. Painting follows ascending
depth, hit testing follows the exact reverse, and a `modal` layer isolates
pointer, scroll, and keyboard focus from every lower route.

MGIP carries pointer move, down, and up as separate events. The TypeScript host
retains hover and pressed state and activates a component only when release lands
inside the component that originally received the press. A pressed component
captures subsequent movement and receives element-local coordinates, enabling
drag selection and other gestures without exposing window-space layout details.

Keyboard events use backend-neutral logical keys. Clickable TypeScript elements
participate in Tab/Shift-Tab focus traversal and activate with Enter or Space;
focus and keyboard-pressed state use the same retained component identity as
pointer interaction. Modifier bits remain attached during focused dispatch, so
components can implement Shift selection and platform semantic shortcuts.

Printable input travels as a separate validated UTF-8 event and is routed only
to the focused TypeScript node. The demo includes an editable field with a
placeholder, focus styling, Unicode-safe Backspace, and a bounded value length.

## Components and layout

Component styles support nested affine translation, scale, rotation, and
fractional transform origins. The retained tree emits balanced transform-stack
records; the graphics server applies them uniformly to triangles, textures,
cached paths, native text, and clip bounds. Hit testing applies the matching
inverse transform, so animated controls remain interactive at their drawn
position.

An inherited `opacity` style lowers to a separate balanced stack. Nested values
multiply on the server and tint every drawable category while leaving cached
geometry and uploaded resources unchanged.

Soft rounded shadows are also server primitives. A component sends its rectangle,
corner radius, blur, spread, offset, and color once per frame; Metal evaluates a
signed-distance field in the fragment shader instead of receiving many translucent
client triangles. Shadows compose with transform and opacity stacks.

Radial backgrounds follow the same model: one command carries focal position,
pixel radius, rounded-corner mask, and inner/outer colors. Metal evaluates the
falloff per fragment, so React and future VM clients never generate gradient fans.

Two-stop linear backgrounds are server primitives as well. One fixed record carries
the destination, horizontal/vertical/diagonal direction, rounded-corner radius, and
colors. Metal interpolates and masks the fill per fragment, replacing client-colored
rectangle and rounded-rectangle meshes.

Three-stop conic backgrounds use `DrawConicGradient`. Center, rotation, rounded
mask, and start/middle/end colors are evaluated per fragment. The demo's rotating
title-bar badge therefore animates one angle value without textures or gradient fans.

Solid boxes and borders now use one `DrawRoundedRect` record backed by an
antialiased rounded-box SDF. This replaces the old 32-segment client fan/ring,
shrinks animated frames, and eliminates polygon seam and one-pixel border overlap.

Solid `Circle` components use the equivalent `DrawCircle` SDF command, combining
fill and ring in one antialiased quad. Dot grids therefore send six vertices per
dot internally on Metal instead of separate 32-segment client meshes.

Animated diagonal fills now use one constant-size `DrawDiagonalPattern` record.
Stripe width, gap, phase, direction, and color are evaluated per fragment, so
large patterned areas no longer expand the Unix-socket frame with stripe quads.

Filled/ring dot grids similarly use one `DrawDotGrid` record containing dimensions,
a 32-bit fill mask, optional active cell, geometry, and colors. Metal evaluates every
antialiased dot from the destination rectangle; the animated 4×4 title icon therefore
replaces sixteen React circle nodes and sixteen per-frame draw commands.

Technical background grids use one `DrawGridPattern` record. Minor spacing and
width, stronger periodic major lines, two colors, rounded masking, and animated
pixel offsets are evaluated per fragment. The dashboard now moves an effectively
unbounded drafting grid while sending only one fixed-size command per frame.

The animated wave row is one `DrawWaveDots` command rather than 24 reconciled circle
components. Count, phase, frequency, radius range, border, and trough/crest gradients
remain backend-neutral inputs; Metal derives every dot's size and paint per fragment.

`src/UI.hpp` provides keyed component elements plus `Box`, `Row`, `Column`, and
`Stack` primitives. `ComponentHost` reconciles a component description into a
retained layout tree, measures it with min/max constraints, assigns final bounds,
and paints visible boxes into the MGFX stream. Layout is backend-independent;
Metal only receives positioned triangles.

Containers may enable hierarchical clipping. The MGFX display list carries a
normalized nested clip stack; Metal maps it to intersected scissor rectangles,
leaving equivalent Vulkan and DirectX implementations straightforward.

Boxes support `borderWidth` and `borderColor`. `Circle` elements support a fill,
a border ring, or both, lowered to the backend-neutral `DrawCircle` server primitive.
The TypeScript demo header uses these primitives for a framed 4×4 dot-grid icon.

Boxes also accept `cornerRadius`. Solid fills and borders lower to one
`DrawRoundedRect` command, with radii and border widths clamped to legal geometry.
Cards, list rows, panels, and fields demonstrate it.

TypeScript styles also accept horizontal, vertical, or diagonal linear gradients.
Rectangle and rounded-rectangle backgrounds lower to a constant-size
`DrawLinearGradient` command. Circle gradients use the corresponding
`DrawLinearGradientCircle` server primitive and an antialiased radial mask, so
they no longer generate a 32-segment client triangle fan. The React demo combines
these fills with native-clock-driven badges and wave patterns.

Rectangular areas can additionally use an animated diagonal stripe pattern with
configurable color, stripe width, gap, direction, and phase offset. One
`DrawDiagonalPattern` command drives the Metal fragment shader regardless of area.

The TypeScript runtime builds on clipping with nested vertical scroll views.
Wheel and trackpad events carry the pointer position plus normalized deltas, so
the deepest scroll container under the pointer handles the event.

Rows and columns support per-child `flexGrow`, configurable gaps,
`MainAxisAlignment` (`start`, `center`, `end`, `spaceBetween`), and
`CrossAxisAlignment` (`start`, `center`, `end`, `stretch`).

Boxes can carry keyed click handlers. `ComponentHost::pointerDown()` performs
reverse-order hit testing, invokes the topmost handler, and lets component state
drive a keyed rebuild. The demo cards brighten when selected.

Stateful components call the protected `Component::invalidate()` method after a
state change. The host records the invalidation and reconciles once at the start
of the next layout pass, so an event handler never mutates the retained tree while
hit testing is in progress.

React `Text` now defaults to native `system` rendering; `fontFamily: "pixel"`
keeps the built-in 5x7 font available only as a diagnostic/bootstrap mode.
`monospace`, `serif`, and `rounded` select portable native designs. Native modes emit one compact
UTF-8 `DrawText` command per visible line. Explicit newlines and configurable
line height participate in intrinsic measurement. `wrap: true` performs greedy
word wrapping against layout constraints with exact cached word/space advances,
and `textAlign` supports start, center, or end placement. The
macOS server shapes Unicode with CoreText and caches vector glyph outlines;
future Vulkan and DirectX hosts can execute the same display-list command using
their platform text service. The component runtime asynchronously requests and
caches exact native advances, then performs one corrected layout without
blocking frames on the Unix socket. Font uploads and multiline rich text are the
next text layer.

The native Metal host selects 4× multisample antialiasing when the device
supports it, smoothing glyph outlines, vector paths, circles, and mesh edges in
one backend-level quality setting. React typography uses Retina-appropriate
drawable sizes (22 px body text and 32 px titles in the demo) rather than the
too-small bootstrap values.

`fontWeight` supports regular, medium, semibold, and bold native faces end to
end, while `fontStyle` selects regular or italic shaping. Both attributes are
encoded in `DrawText`, included in asynchronous measurement requests, and used
as part of server/client cache keys, so styled UI hierarchy does not compromise
layout accuracy. Servers advertise this extension with the
`typographyStyles` capability bit.

`letterSpacing` is expressed in logical pixels at the component layer and
normalized to em units on the wire. CoreText applies the tracking while shaping;
the same value participates in exact measurement and both client/server cache
keys. Zero spacing retains the original compact text payload for compatibility.

`textDecoration` supports underline, line-through, or both. The wire command
contains only decoration flags; the graphics server derives placement and
thickness from native font metrics and adds the lines to cached text geometry.
This is advertised independently through the `textDecorations` capability bit.

Portable `fontFamily` choices now include `system`, `monospace`, `serif`, and
`rounded`. These are semantic families rather than font-file names: CoreText
maps them to the current macOS system designs, while future backends can choose
their native equivalents. Servers advertise the expanded family set with
`portableFontFamilies`.

Custom fonts are persistent connection-scoped resources. `FontCreate` uploads
at most 16 MiB once, and subsequent draw and metric requests carry only its
nonzero ID. CoreText validates and shapes the font server-side; the client never
converts glyphs to geometry. Resource versions prevent stale cached outlines
after replacement, and fonts are released on destroy or disconnect.

Textures, paths, meshes, and fonts now produce a common `ResourceStatus` event.
Ready is emitted only after the resource reaches Metal, the renderer cache, or
CoreText; rejection reports native allocation or validation failure. Pending
uploads carry their connection generation so hot-reload completions cannot cross
into the replacement program.

React `<RichText>` accepts declarative spans with independent color, family,
weight, italic, tracking, decoration, and custom font ID. The client lowers the
whole visible line to one `DrawRichText` command; Metal-side CoreText shaping
advances the pen between runs and batches their colored glyph geometry. Explicit
newlines plus optional word wrapping, line height, and start/center/end alignment
share the native metric cache with plain text. Each resulting line remains one
compact command, and exact per-run measurements feed retained layout asynchronously.

## Requirements

- macOS
- Xcode or the Xcode command-line tools
- CMake 3.24 or newer

## Build and run

```sh
cmake --preset clangd
cmake --build --preset clangd
```

Start the native graphics server:

```sh
open build-clangd/MGFXServer.app
```

It intentionally opens no window by itself. Leave it running while rebuilding
or restarting clients.

Then start the separate UI client from another terminal:

```sh
./build-clangd/MGFXDemo
```

Or exercise the same server from the standalone Node.js/TypeScript client:

```sh
cd clients/ts
npm install
npm test
npm start
```

The custom React client uses hooks and JSX without React DOM:

```sh
cd clients/react
npm install
npm test
npm start
```

Its host elements (`mgfx-row`, `mgfx-column`, `mgfx-box`, `mgfx-circle`,
`mgfx-text`, and others) lower into the same layout tree and MGFX binary frames.
The experimental reconciler dependency is version-pinned and isolated inside
`clients/react/src/renderer.ts`.

The React package also provides higher-level typed layout, shape, `Button`, and
controlled `TextField` components, so normal application code rarely needs to
use the renderer's intrinsic `mgfx-*` elements directly.

Focused text fields render a measured caret between independently shaped text
runs. Clicking positions the insertion point; dragging creates a highlighted
Unicode code-point range. Left/right arrows collapse or move the selection, and
text input, Backspace, Cut, Copy, and Paste operate on that range.
Shift+Left/Right extends the range and Command+A selects the complete value.
The caret blinks from the server's native display-link clock and restarts its
visible phase after pointer, keyboard, or text-editing activity; unfocused
fields do not request animation frames.

Native title, initial size, and minimum size are declarative through the React
`Window` component; its layout effect emits MGIP metadata independently from the
graphics frame.

`Window` can request `chrome="overlay"` with a draggable title height. The
surface then extends beneath a transparent native title bar, allowing React to
draw Brave-style chrome while AppKit keeps ownership of traffic-light controls
and native window dragging.
The server reports the measured trailing edge of the real window controls, so
React derives its title padding from AppKit instead of assuming a macOS button
size or display scale.

`Window` also controls resizability and `normal`, `maximized`, or `fullscreen`
mode. The server maps those semantic states onto the native host window rather
than exposing AppKit-specific actions to clients.

Closing a client-owned window sends a close event to that client. The window is
hidden when the client exits, while the server and Unix socket remain available.
Clicking cards sends pointer coordinates to the client, which rebuilds the
component tree and submits a new MGFX frame.

## Nova / clangd

Generate the compilation database used by `.clangd` before opening the folder in
Nova:

```sh
cmake --preset clangd
cmake --build --preset clangd
```

Nova's clangd-based C++ extension will then read the root-level
`compile_commands.json` link to `build-clangd/compile_commands.json`. Nova probes
the project root by default, while `.clangd` points command-line clangd directly
at the build directory. This gives both clients the correct C++17,
Objective-C++, macOS SDK, framework, source, and fetched metal-cpp header paths,
so completion and type navigation work across both the C++ renderer and the
AppKit bridge. Re-run the configure command after adding source files or changing
CMake settings.

Run all protocol, UI, and local IPC tests with:

```sh
ctest --preset clangd
```

CMake downloads Apple's official header-only `metal-cpp` repository at a pinned
revision. To build offline, provide an existing checkout:

```sh
cmake -S . -B build -DMETAL_CPP_DIR=/path/to/metal-cpp
```

When Xcode's optional Metal Toolchain is installed, the shader in
`shaders/Triangle.metal` is compiled into `default.metallib` at build time and
bundled with the server. CMake falls back to bundling the source and compiling it
at runtime when that component is unavailable.
