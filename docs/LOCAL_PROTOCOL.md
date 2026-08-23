# MGFX local process protocol (MGIP) version 1

MGIP transports graphics frames and window events between an unprivileged local
client and the native MGFX graphics server. Version 1 uses only an `AF_UNIX`
`SOCK_STREAM`; it does not define or permit a TCP transport.

## Socket

The default socket is `/tmp/mgfx-<effective-user-id>.sock`. The server creates it
with mode `0600`, verifies connecting peers with `getpeereid()`, and accepts only
the same effective user ID. A custom path can be passed as the first `MGFXDemo`
argument.

A process-held advisory lock at `<socket>.lock` serializes server ownership. A
second server fails without unlinking the active server's socket. After a crash,
the kernel releases the lock automatically and the next server safely replaces
the stale socket inode.

## Message framing

Every integer is unsigned and little-endian. A message is one 16-byte header
followed immediately by `payloadBytes` bytes.

| Offset | Size | Field |
| ---: | ---: | --- |
| 0 | 4 | ASCII magic `MGIP` |
| 4 | 2 | Protocol version (`1`) |
| 6 | 2 | Message type |
| 8 | 4 | Payload byte count |
| 12 | 4 | Sequence number |

Payloads larger than 64 MiB are rejected. Unknown versions terminate the
connection. Sequence may be zero for uncorrelated messages. A client assigns a
nonzero sequence to each `Frame`, and `FramePresented` echoes it after that frame's
Metal command buffer completes.

Immediately after accepting a connection, the server sends `ServerHello`.
Clients may send their window request immediately; stream ordering preserves the
handshake and subsequent events. A headless server does not send a synthetic
zero-sized resize. The first `Resize` is sent only after `WindowConfig` has
created or shown a drawable surface.

## Messages

| Type | Name | Direction | Payload |
| ---: | --- | --- | --- |
| 1 | `Frame` | client → server | Complete MGFX command stream |
| 2 | `Resize` | server → client | `u32 width`, `u32 height` in drawable pixels |
| 3 | `PointerDown` | server → client | `f32 x`, `f32 y` in top-left drawable coordinates |
| 4 | `Close` | either direction | Empty |
| 5 | `PointerMove` | server → client | `f32 x`, `f32 y` in top-left drawable coordinates |
| 6 | `PointerUp` | server → client | `f32 x`, `f32 y` in top-left drawable coordinates |
| 7 | `KeyDown` | server → client | Semantic key payload described below |
| 8 | `KeyUp` | server → client | Semantic key payload described below |
| 9 | `Scroll` | server → client | `f32 x`, `f32 y`, `f32 deltaX`, `f32 deltaY` |
| 10 | `TextInput` | server → client | Committed UTF-8 bytes |
| 11 | `WindowTitle` | client → server | UTF-8 title, at most 1024 bytes |
| 12 | `WindowConfig` | client → server | `u32 width`, `u32 height`, `u32 minimumWidth`, `u32 minimumHeight` |
| 13 | `WindowState` | client → server | `u8 mode`, `u8 resizable`, two reserved zero bytes |
| 14 | `ServerHello` | server → client | `u16 version`, `u16 backend`, `u32 capabilities` |
| 15 | `FramePresented` | server → client | Empty; header sequence identifies the completed frame |
| 16 | `RequestAnimationFrame` | client → server | Empty; nonzero header sequence identifies the request |
| 17 | `AnimationFrame` | server → client | `u64` monotonic nanoseconds; echoes the request sequence |
| 18 | `WindowCursor` | client → server | `u8 shape`, three reserved zero bytes |
| 19 | `ClipboardWrite` | client → server | UTF-8 text, at most 1 MiB |
| 20 | `ClipboardRead` | client → server | Empty; nonzero sequence identifies the request |
| 21 | `ClipboardText` | server → client | UTF-8 text; echoes the read-request sequence |
| 22 | `WindowChrome` | client → server | `u8 mode`, three reserved zero bytes, `u32 draggableHeight` in drawable units |
| 23 | `WindowChromeMetrics` | server → client | `f32 leadingInset`, `f32 titleBarHeight` in drawable units |
| 24 | `TextureCreate` | client → server | `u32 id`, `u32 width`, `u32 height`, reserved `u32`, tightly packed RGBA8 pixels |
| 25 | `TextureDestroy` | client → server | Nonzero `u32` resource ID |
| 26 | `PathCreate` | client → server | Nonzero `u32` ID, segment count, reserved fields, canonical path segments |
| 27 | `PathDestroy` | client → server | Nonzero `u32` resource ID |
| 28 | `TextMeasure` | client → server | `u8 family`, `u8 weight`, `u8 style`, `u8 extension`; optional `f32 letterSpacing` in em for extension 1, plus `u32 fontId` for extension 2, then UTF-8 text; nonzero sequence |
| 29 | `TextMetrics` | server → client | `f32 advance` in em units; echoes request sequence |
| 30 | `MeshCreate` | client → server | Nonzero `u32` ID, vertex/index counts, colored vertices, triangle indices |
| 31 | `MeshDestroy` | client → server | Nonzero `u32` resource ID |
| 32 | `FontCreate` | client → server | Nonzero `u32` ID followed by at most 16 MiB of native font bytes |
| 33 | `FontDestroy` | client → server | Nonzero `u32` resource ID |
| 34 | `ServerCapabilities` | server → client | Full `u64` capability mask; sent after legacy `ServerHello` |
| 35 | `ResourceStatus` | server → client | `u8` kind, `u8` state, reserved zero `u16`, nonzero `u32` resource ID |

Backend is `1` Metal, `2` Vulkan, or `3` DirectX. Capability bits are client
window lifecycle (`1 << 0`), pointer input (`1 << 1`), keyboard input (`1 << 2`),
text input (`1 << 3`), and scroll input (`1 << 4`). A client should use the bits
instead of inferring features from a particular native backend. Frame completion
acknowledgements are advertised by `1 << 5`.
The one-shot native animation clock is advertised by `1 << 6`.
Client-controlled native cursors are advertised by `1 << 7`.
Native text clipboard access is advertised by `1 << 8`.
Client-controlled window chrome is advertised by `1 << 9`.
Persistent RGBA8 texture resources and MGFX `DrawImage` are advertised by
`1 << 10`.
Persistent canonical path resources are advertised by `1 << 11`.
Correlated native text measurement is advertised by `1 << 12`.
Native medium/semibold/italic typography is advertised by `1 << 26`, and
native letter spacing by `1 << 27`.
Native font-metric underline and line-through are advertised by `1 << 28`.
Portable serif and rounded system families are advertised by `1 << 29`.
Persistent client font resources are advertised by `1 << 30`.
Compact rich-text runs are advertised by `1 << 31`.
The 64-bit capability companion itself is advertised by `1 << 32` in its full
mask. Bits 0–31 exactly mirror the legacy `ServerHello` word.
Native resource readiness events are advertised by `1 << 33`.
Server-rendered linear-gradient circles are advertised by `1 << 34`.
Server-rendered technical grid patterns are advertised by `1 << 35`.
Server-tessellated dashed path strokes are advertised by `1 << 36`.
Two-stop path stroke gradients are advertised by `1 << 37`.
Extended path stroke styles (square caps and miter joins) are advertised by
`1 << 38`.
Custom path miter limits are advertised by `1 << 39`.
Arbitrary path dash arrays are advertised by `1 << 40`.
Multi-stop path gradients are advertised by `1 << 41`.

Resource kind is texture (`1`), path (`2`), mesh (`3`), or font (`4`). State is
ready (`1`) after the resource reaches its native owning subsystem, or rejected
(`2`) when native validation or allocation fails. Status belongs to the current
connection generation, so a completion from a retired client is never forwarded
to its replacement.

Texture IDs are nonzero and scoped to one client connection. Dimensions are
limited to 4096×4096 and the payload must contain exactly four bytes per pixel.
`DrawImage` references the ID with a destination rectangle, normalized UV
rectangle, and RGBA tint. Uploads travel once through MGIP; subsequent MGFX
frames carry only the small resource reference.

Cursor shape is `0` arrow, `1` pointing hand, `2` text/I-beam, `3` crosshair,
`4` horizontal resize, or `5` vertical resize. The server maps these semantic
shapes onto its current window system and resets to arrow on disconnect.

Clipboard work is performed on the native UI thread. Reads are asynchronous and
correlated with the MGIP sequence field; writes are bounded, validated UTF-8.
The protocol exposes text rather than platform pasteboard object types so the
same frontend API can work against AppKit, Win32, or Wayland hosts.

Only the newest received frame is retained by the server. Clients should keep at
most one frame in flight, coalesce intermediate updates, and submit the newest
pending frame after `FramePresented`. This bounds socket, CPU, and GPU work while
preserving the most recent UI state. Completion acknowledgements are scoped to
the connection generation, so a retired client's GPU work cannot acknowledge a
replacement client's coincidentally identical sequence number.

`RequestAnimationFrame` is one-shot and multiple requests received before a
display tick coalesce to the newest sequence. Clients normally keep one request
outstanding, dispatch all language-level animation callbacks from the returned
monotonic timestamp, then request another tick only while animation remains
active. This provides display-driven timing without exposing Metal or AppKit.

Window mode is `0` normal, `1` maximized, or `2` fullscreen. The native host
applies transitions idempotently on its UI thread.

Window chrome mode is `0` native or `1` overlay. Overlay mode makes the native
title bar transparent, extends the graphics surface beneath it, preserves the
platform window controls, and treats the top `draggableHeight` drawable units as
a native window-drag region. The host converts that height to platform points
using the current drawable scale. This lets clients draw browser-style title bars
without reimplementing native move, close, minimize, or zoom behavior.
After applying chrome, the host measures its actual standard window buttons and
sends `WindowChromeMetrics`. The client uses `leadingInset` instead of guessing
traffic-light, caption-button, or theme dimensions. Metrics use drawable units
to match layout and are resent when drawable scale changes.

Window dimensions use logical host units rather than drawable pixels. The server
validates them before applying content size and resize limits on its native UI
thread. Version 1 accepts initial dimensions from 320×240 through 8192×8192.

Scroll coordinates identify the target in top-left drawable space. Positive
deltas move content right/down; hosts normalize platform-specific wheel and
trackpad signs before sending the event.

### Semantic key payload

Key messages contain `u16 key`, `u16 modifiers`, and `u32 repeat`. Keys are
backend-independent: `1` Tab, `2` Enter, `3` Space, `4` Escape, and `5`–`8`
left/right/up/down. Modifier bits are Shift (`1`), Control (`2`), Alt (`4`), and
Command/Super (`8`). `repeat` is `1` only for an auto-repeated key-down event.
Hardware scan codes are deliberately not exposed by MGIP.

Clipboard shortcuts are semantic keys `10` Copy, `11` Cut, and `12` Paste. The
native host maps Command-C/X/V on macOS; another host can map Ctrl-C/X/V without
changing frontend behavior. These are actions rather than letter scan codes.

Printable text is transported separately from physical/logical key events. This
lets a focused text widget consume UTF-8 while buttons continue to use semantic
Enter and Space activation. Backspace is semantic key `9`.

Floating-point fields use IEEE-754 binary32 bits encoded as a little-endian
`u32`. A client should wait for a positive `Resize` before creating its first frame. It
should recompute layout and submit a new frame after resize or UI state changes.

## Nested MGFX frame

The `Frame` payload begins with the separate `MGFX` display-list header described
by `GraphicsProtocol.hpp`. The server validates its magic, version, declared byte
count, command headers, and payload boundaries before replacing the visible
frame. Invalid frames are ignored without reaching the GPU backend.

The nested format is intentional: MGIP handles process/window communication,
while MGFX remains a transport-independent display list that future Metal,
Vulkan, and DirectX backends can execute.

MGFX opcodes `4` (`PushClip`) and `5` (`PopClip`) form a balanced hierarchical
clip stack. `PushClip` carries four `f32` values—left, top, right, bottom—in
normalized top-left coordinates from `0` to `1`. Backends intersect nested clips
and apply them before draw commands.

MGFX opcode `8` (`DrawText`) carries a portable system-font family, weight,
style, optional em letter spacing, underline/line-through flags, normalized
top-left position and font height, optional persistent font ID, straight RGBA
color, and validated UTF-8.
The backend shapes Unicode and caches tessellated glyph outlines; strings no
longer expand into a triangle command for every pixel-font cell.

MGFX opcode `24` (`DrawRichText`) carries one position and size plus up to 256
UTF-8 runs. Each run independently selects family, weight, style, tracking,
decoration, optional font resource, and color. The backend shapes runs in order
and advances the shared pen from native metrics.

MGFX opcode `25` (`DrawLinearGradientCircle`) carries a destination rectangle,
horizontal/vertical/diagonal direction, and two straight-alpha colors. Backends
derive a centered circle from the shorter destination axis and apply the gradient
and antialiased edge per fragment.

MGFX opcode `26` (`DrawGridPattern`) carries a destination, pixel spacing, minor
and major widths, two-dimensional pixel offset, integer major-line interval,
rounded-corner radius, and minor/major straight-alpha colors. Its payload remains
76 bytes regardless of the destination area or number of visible grid lines.

MGFX opcode `27` (`DrawDashedPath`) preserves the complete 128-byte `DrawPath`
payload and appends dash length, gap length, signed phase, and one reserved `f32`.
The fixed 144-byte command references the original path resource; the backend
performs arc-length splitting and stroke tessellation.

MGFX opcode `28` (`DrawExtendedPath`) appends an independent 48-byte two-stop
stroke gradient to `DrawPath`. Its payload is 176 bytes, or 192 bytes when the
same command also carries the opcode-27 dash fields. Fill and stroke gradients
are paint-only inputs and do not duplicate or invalidate cached path geometry.

The existing `DrawPath` cap byte is butt (`0`), round (`1`), or square (`2`).
Its join byte is bevel (`0`), round (`1`), or miter (`2`). Backends apply a
fixed miter limit of four stroke half-widths and fall back to a bevel when the
intersection exceeds it. Clients must require capability bit 38 before sending
either value `2` to an older server.

MGFX opcode `29` (`DrawStyledPath`) is a fixed 208-byte extension. It contains
the 128-byte base path, a reserved-or-active 48-byte stroke gradient, a
reserved-or-active 16-byte dash block, then `f32 miterLimit` and three reserved
zero `f32` values. A limit must be finite and between 1 and 1000. Clients omit
this extension to select the default limit of four; capability bit 39 is
required before sending opcode 29.

MGFX opcode `30` (`DrawDashArrayPath`) contains the 128-byte base path, a
48-byte reserved-or-active stroke gradient, `f32 miterLimit`, `f32 dashOffset`,
an even `u32 dashCount`, a reserved zero `u32`, and 2 through 32 positive finite
`f32` alternating paint/gap lengths. Its payload is `192 + dashCount * 4` bytes.
Capability bit 40 is required before sending opcode 30.

MGFX opcode `31` (`DrawMultiGradientPath`) starts with the same 176-byte base
and stroke-gradient blocks, followed by `f32 miterLimit`, `f32 dashOffset`,
`u16 dashCount`, `u8 fillStopCount`, `u8 strokeStopCount`, and reserved zero
`u32`. Dash lengths follow, then each gradient stop as `f32 offset` plus RGBA.
Each gradient supports 2 through 8 ordered stops in `[0,1]`; at least one side
must contain more than two. Capability bit 41 is required.
