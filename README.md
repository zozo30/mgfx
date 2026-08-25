# MGFX

MGFX is an experimental local graphics server with a versioned, backend-neutral
binary protocol. Applications own their window lifecycle, state, layout, and
components; the long-running native process owns AppKit, Metal, GPU resources,
text shaping, and presentation.

```text
Go / C++ / future VM client
            │
            │ MGIP over a per-user Unix socket
            ▼
      MGFX graphics server
            │
            ├── Metal (implemented)
            ├── Vulkan (future)
            └── DirectX (future)
```

There is no TCP transport. The server listens on `/tmp/mgfx-<uid>.sock`, checks
the peer user ID, and keeps running while clients are rebuilt or replaced. It
starts headless; connecting clients create and configure their own window.

## Why

MGFX explores a small graphics boundary that can support native applications,
custom VMs, and other languages without embedding a browser runtime. Clients
send semantic display-list commands rather than Metal-specific objects or
client-generated glyph and curve triangles.

The protocol is explicitly little-endian, length-delimited, and independent of
C++ structure layout. Unknown commands can be skipped, payloads are bounded,
and capabilities are negotiated at connection time.

## Current features

- Client-owned window title, size, resize limits, cursor, chrome, and state
- Pointer, keyboard, scroll, UTF-8 text input, clipboard, and close events
- Presentation-paced frames and a native display-link animation clock
- Clip, opacity, and affine-transform stacks
- Rounded rectangles, circles, arcs, shadows, gradients, grids, waves, and
  animated diagonal patterns
- Persistent textures, vector paths, meshes, and font resources
- Server-side path flattening, tessellation, dashes, joins, and gradient paints
- Native CoreText shaping, exact text measurement, rich text, and decorations
- Connection-scoped resource budgets, status events, and recovery caches

Metal is the first backend. The command and process protocols intentionally do
not expose Metal so another host can implement the same semantics later.

## Repository layout

```text
src/                 C++ protocol, UI runtime, server, and Metal renderer
shaders/             Metal shaders
clients/go/          Dependency-free Go API and animated component demo
tests/               C++ protocol, layout, IPC, path, and text tests
docs/LOCAL_PROTOCOL.md
docs/GRAPHICS_RESOURCES.md
```

## Build the server

Requirements: macOS 13+, Xcode command-line tools, CMake 3.24+, and Go for the
Go client.

```sh
cmake --preset clangd
cmake --build --preset clangd
ctest --preset clangd
```

Start the persistent native server:

```sh
open build-clangd/MGFXServer.app
```

It opens no window until a client sends `WindowConfig`.

## Run a client

The C++ demo:

```sh
./build-clangd/MGFXDemo
```

The dependency-free Go demo:

```sh
cd clients/go
go test -race ./...
go run .
```

The Go package hides MGIP framing, socket parsing, normalized coordinates,
window events, frame coalescing, and animation correlation:

```go
app := mgfx.Application{
    Window: mgfx.Window{
        Title: "Hello MGFX", Width: 720, Height: 320,
        MinimumWidth: 480, MinimumHeight: 220, Resizable: true,
    },
    Draw: func(canvas *mgfx.Canvas) {
        canvas.Clear(mgfx.RGB(0.02, 0.03, 0.06))
        canvas.Text("Hello from Go", mgfx.TextStyle{
            X: 40, Y: 80, Size: 32,
            Color: mgfx.RGB(0.7, 0.95, 1), Weight: mgfx.SemiBold,
        })
    },
}
err := app.Run(ctx)
```

It also provides exact native text measurement, fixed/flexible stack layout,
measured labels and panels, alignment, animation offsets, recursive hit-testing,
and stateful buttons. See [`clients/go/README.md`](clients/go/README.md) for the
API tour.

## Protocol documentation

- [`docs/LOCAL_PROTOCOL.md`](docs/LOCAL_PROTOCOL.md) specifies MGIP framing,
  messages, validation, lifecycle, and capability negotiation.
- [`docs/GRAPHICS_RESOURCES.md`](docs/GRAPHICS_RESOURCES.md) describes textures,
  paths, meshes, native text, and resource ownership.
- [`src/GraphicsProtocol.hpp`](src/GraphicsProtocol.hpp) defines the portable
  display-list command API.

## Nova / clangd

The `clangd` preset generates `build-clangd/compile_commands.json` and the root
link used by Nova and other clangd editors:

```sh
cmake --preset clangd
cmake --build --preset clangd
```

Reconfigure after adding source files or changing build options.

## Status

MGFX is experimental. Protocol version 1 is actively evolving and Metal is the
only renderer today. The project is useful for exploring a compact native UI and
graphics boundary, but it is not yet a production compatibility promise.
