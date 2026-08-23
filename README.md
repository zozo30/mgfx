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

The React client includes bounded PNG, JPEG, and SVG decoders. Raster files are converted to
premultiplied RGBA8, uploaded once, and displayed with `fill`, `contain`, or
`cover` geometry computed by the backend-neutral UI runtime.
SVG currently uses a client-side high-quality raster fallback, including vector
paths, gradients, masks, transforms, and system-font text; Metal still receives
only the same portable texture resource and `DrawImage` command.

React can also submit indexed normalized `Mesh` geometry directly. The retained
layout runtime maps mesh coordinates into measured component bounds and lowers
indices plus per-vertex colors to ordinary MGFX triangle lists. `Mesh` remains
the explicit low-level escape hatch for application-owned geometry.

The React `Path` component now directly accepts SVG path data. Relative and
absolute commands are normalized, arcs and quadratic segments become cubics,
TypeScript sends those backend-neutral `move`, `line`, `cubic`, and `close`
commands once as a persistent MGIP path resource. Frame display lists reference
the resource with `DrawPath`, destination, paint, fill rule, tolerance, and
stroke parameters; they contain no generated path vertices.

The graphics server owns adaptive curve flattening and tessellation. Its cache
is keyed independently from destination and paint, so animated colors and
layout changes reuse geometry. Compound paths support SVG `evenodd` and
`nonzero` fill rules, while strokes support configurable width, butt or round
caps, and bevel or round joins. `DrawPath` also supports source-space linear
gradient fills: the server derives vertex colors from cached source geometry,
so changing gradient colors does not invalidate tessellation. The demo loads several icons from the
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
inside the component that originally received the press.

Keyboard events use backend-neutral logical keys. Clickable TypeScript elements
participate in Tab/Shift-Tab focus traversal and activate with Enter or Space;
focus and keyboard-pressed state use the same retained component identity as
pointer interaction.

Printable input travels as a separate validated UTF-8 event and is routed only
to the focused TypeScript node. The demo includes an editable field with a
placeholder, focus styling, Unicode-safe Backspace, and a bounded value length.

## Components and layout

`src/UI.hpp` provides keyed component elements plus `Box`, `Row`, `Column`, and
`Stack` primitives. `ComponentHost` reconciles a component description into a
retained layout tree, measures it with min/max constraints, assigns final bounds,
and paints visible boxes into the MGFX stream. Layout is backend-independent;
Metal only receives positioned triangles.

Containers may enable hierarchical clipping. The MGFX display list carries a
normalized nested clip stack; Metal maps it to intersected scissor rectangles,
leaving equivalent Vulkan and DirectX implementations straightforward.

Boxes support `borderWidth` and `borderColor`. `Circle` elements support a fill,
a border ring, or both. Circles use a portable 32-segment triangle mesh and rings
use an annulus mesh, so these shapes require no Metal-specific protocol opcode.
The TypeScript demo header uses these primitives for a framed 4×4 dot-grid icon.

Boxes also accept `cornerRadius`. Rounded fills use a 32-point convex mesh and
rounded borders use a matching inner/outer ring, with radii and border widths
clamped to legal geometry. Cards, list rows, panels, and fields demonstrate it.

TypeScript styles also accept horizontal, vertical, or diagonal linear
gradients. The layout runtime lowers them to per-vertex colors on the same
portable triangle meshes used by rectangles, rounded rectangles, and circles;
the GPU backend only performs ordinary interpolation. The React demo combines
these fills with a native-clock-driven wave pattern.

Rectangular areas can additionally use an animated diagonal stripe pattern with
configurable color, stripe width, gap, direction, and phase offset. The runtime
tessellates full-area parallelograms and clips them at the area boundary, again
using only ordinary MGFX triangles and clip commands.

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
keeps the built-in 5x7 font available only as a diagnostic/bootstrap mode, and
`monospace` selects the native fixed-pitch family. Native modes emit one compact
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
