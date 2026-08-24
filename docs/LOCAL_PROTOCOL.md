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
| 36 | `ResourceTrace` | server → client | Kind/action/ID plus current and maximum resource count and cost |
| 37 | `ServerCapabilityWord` | server → client | Nonzero `u32` word index, reserved zero `u32`, `u64` capability bits |

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
Path-gradient repeat and reflect spread modes are advertised by `1 << 42`.
Two-stop radial path gradients are advertised by `1 << 43`.
Multi-stop radial path gradients are advertised by `1 << 44`.
Radial path repeat and reflect spread modes are advertised by `1 << 45`.
Offset focal points for radial path gradients are advertised by `1 << 46`.
Two-circle radial path gradients with nonzero focal radius are advertised by `1 << 47`.
Radial gradient paint on path strokes is advertised by `1 << 48`.
Styled and dashed radial path paint is advertised by `1 << 49`.
Multi-stop conic paint on persistent paths is advertised by `1 << 50`.
Texture paint on persistent path fills and strokes is advertised by `1 << 51`.
Native anchored text and rich-text placement are advertised by `1 << 52` and
`1 << 53`; per-run font scaling and baseline shift use `1 << 54` and `1 << 55`.
One-command tiled image surfaces are advertised by `1 << 56`.
One-command nine-slice images are advertised by `1 << 57`.
Server-shaped text with a solid native outline is advertised by `1 << 58`.
Styled rich-text runs, linear-gradient text, shaped gradient bounds, and radial-
gradient text are advertised by `1 << 59` through `1 << 62`. Protocol-visible
persistent resource accounting is advertised by `1 << 63`.
Additional capability words continue the feature space in indexed 64-bit pages.
Word 1 bit 0 advertises filtered image surfaces (global capability bit 64), and
word 1 bit 1 advertises their blur kernel (global capability bit 65).

Resource kind is texture (`1`), path (`2`), mesh (`3`), or font (`4`). State is
ready (`1`) after the resource reaches its native owning subsystem, or rejected
(`2`) when native validation or allocation fails. Status belongs to the current
connection generation, so a completion from a retired client is never forwarded
to its replacement.

When resource tracing is available, every create, reject, and explicit destroy
also emits a fixed 32-byte `ResourceTrace`. It contains kind (`u8`), action
(`1` created, `2` destroyed, `3` rejected), reserved zero `u16`, ID (`u32`),
current and maximum counts (`u32` each), then current and maximum cost (`u64`
each). Texture/font cost is bytes, path cost is canonical segments, and mesh
cost is expanded indexed vertices. A rejected replacement reports unchanged
accounting, making quota behavior observable without backend-specific APIs.

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
Extension level `4` grows the text header to 48 bytes: byte 44 selects start,
middle, or end anchoring and byte 45 selects top or alphabetic-baseline placement;
bytes 46–47 are zero. The server applies native advance and ascent after shaping.
Capability bit 52 advertises this native text-placement extension.

MGFX opcode `24` (`DrawRichText`) carries one position and size plus up to 256
UTF-8 runs. Each run independently selects family, weight, style, tracking,
decoration, optional font resource, and color. The backend shapes runs in order
and advances the shared pen from native metrics. The high bit of the run count
extends the fixed header from 16 to 20 bytes: byte 16 selects start/middle/end
anchoring, byte 17 selects top/alphabetic placement, and bytes 18–19 are zero.
The server anchors from the total shaped advance and aligns every run to the
shared alphabetic baseline using that run's native ascent. Capability bit 53
advertises this rich-text placement extension.
Bit 30 of the encoded run count extends every run header from 32 to 36 bytes;
the added `f32` at byte 32 is a positive font-size scale in `(0, 16]`. The backend
uses scaled native advances for anchoring and aligns each scaled ascent to the
same baseline. Capability bit 54 advertises this run-metrics extension.
Bit 29 adds another `f32` after the optional scale: a signed baseline shift in
units of the command's base font size. Positive values move a run upward without
changing its horizontal advance. Capability bit 55 advertises baseline shifts.
MGFX opcode `42` (`DrawStyledRichText`) preserves the `DrawRichText` header and
run flags, then extends every run after its optional font scale and baseline shift
with straight-alpha stroke RGBA and an em-relative `f32` stroke width in `[0, 4]`.
Runs with zero width may share the same styled command without an outline. The
backend shapes and tessellates fill and stroke geometry from the semantic UTF-8
runs. Capability bit 59 advertises styled rich-text runs.
MGFX opcode `43` (`DrawGradientText`) carries the semantic text style, placement,
font resource, and UTF-8 plus normalized linear-gradient endpoints and 2–8 ordered
straight-alpha stops. Byte 44 is the stop count, byte 45 selects pad/repeat/reflect,
byte 46 selects user or object-bounds coordinates, and byte 47 is zero; 20-byte stop
records begin at byte 48 and the UTF-8 follows.
Capability bit 60 advertises native gradient text.
Byte 46 may be `1` to interpret endpoints in the shaped contour's object-bounding-box
space; byte 47 remains zero. Capability bit 61 advertises server-shaped gradient bounds.
MGFX opcode `44` (`DrawRadialGradientText`) carries the same semantic text prefix,
then center, two affine radius axes, focal point/radius, 2–8 stops, spread, and a
user-space/object-bounds flag. Capability bit 62 advertises native radial text paint.

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
`u16 dashCount`, `u8 fillStopCount`, `u8 strokeStopCount`, `u8 fillSpread`,
`u8 strokeSpread`, and reserved zero `u16`. Spread is pad (`0`), repeat (`1`),
or reflect (`2`). Dash lengths follow, then each gradient stop as `f32 offset` plus RGBA.
Each gradient supports 2 through 8 ordered stops in `[0,1]`; at least one side
must contain more than two or request a non-pad spread. Capability bit 41 covers
multi-stop paint; bit 42 is required for repeat or reflect.

MGFX opcode `32` (`DrawRadialPath`) preserves the 128-byte `DrawPath` base and
appends 14 `f32` values: source-space center, two source-space radius vectors,
inner RGBA, and outer RGBA. Its fixed payload is 184 bytes. The radius-vector
matrix must be finite and invertible. The current command represents a centered,
two-stop, pad-spread radial fill; capability bit 43 is required.

MGFX opcode `33` (`DrawMultiRadialPath`) starts with the 128-byte `DrawPath`
base, followed by six `f32` values for center and radius vectors, `u8 stopCount`,
`u8 spread`, six reserved zero bytes, then each stop as `f32 offset` plus RGBA.
Spread is pad (`0`), repeat (`1`), or reflect (`2`). Payload size
is `160 + stopCount * 20`, with 2 through 8 ordered stops in `[0,1]`. Capability
bit 44 is required for the stop table and bit 45 for repeat or reflect.

MGFX opcode `34` (`DrawFocalRadialPath`) extends opcode 33 by inserting two
source-space `f32` focal coordinates before its stop header. The header therefore
starts at byte 160, stops at byte 168, and payload size is
`168 + stopCount * 20`. The focal point must lie strictly inside the ellipse;
capability bit 46 is required. This represents SVG `fx`/`fy` with zero `fr`.

MGFX opcode `35` (`DrawTwoCircleRadialPath`) extends opcode 34 with normalized
`f32 focalRadius` and one reserved zero `f32`. Its stop header begins at byte 168,
stops at byte 176, and payload size is `176 + stopCount * 20`. Focal radius must
be in `(0,1)`, and the complete focal circle must lie inside the outer ellipse.
Capability bit 47 is required.

For opcodes 32 through 35, path flag bit 4 selects radial fill and bit 5 selects
radial stroke. At least one must be set. Both targets share the command's radial
paint; clients needing independent paints send two draws referencing the same
path resource. Capability bit 48 is required before setting bit 5.

MGFX opcode `36` (`DrawStyledRadialPath`) starts with the 128-byte `DrawPath`
base, then six radial-basis `f32` values, two focal-point `f32` values, normalized
`f32 focalRadius`, `f32 miterLimit`, `f32 dashOffset`, `u16 dashCount`,
`u8 stopCount`, `u8 spread`, and `u8 radialMode` (centered `0`, focal `1`,
two-circle `2`) followed by seven reserved zero bytes. Dash lengths start at byte
184 and stops follow them. Payload size is
`184 + dashCount * 4 + stopCount * 20`; dash count is zero or an even 2–32 and
stop count is 2–8. Capability bit 49 is required.

MGFX opcode `37` (`DrawConicPath`) starts with the 128-byte `DrawPath` base,
then `f32 centerX`, `f32 centerY`, `f32 rotation` in radians, `f32 miterLimit`,
`f32 dashOffset`, `u16 dashCount`, `u8 stopCount`, and one reserved zero byte.
Dash lengths start at byte 152 and stops follow them. Payload size is
`152 + dashCount * 4 + stopCount * 20`; dash count is zero or an even 2–32 and
stop count is 2–8. Path flag bit 6 selects conic fill and bit 7 selects conic
stroke. Capability bit 50 is required.

MGFX opcode `38` (`DrawTexturePath`) starts with the 128-byte `DrawPath` base,
then nonzero `u32 textureId`, `u8 sampling` (linear `0`, nearest `1`), `u8 repeatX`,
`u8 repeatY`, and `u8 target` (fill `0`, stroke `1`). Four source-tile `f32`
values (`x`, `y`, `width`, `height`), four normalized UV `f32` values, four tint
`f32` values, `f32 miterLimit`, `f32 dashOffset`, `u16 dashCount`, reserved zero
`u16`, and reserved zero `u32` complete the 200-byte header. Even dash lengths
follow. Payload size is `200 + dashCount * 4`; dash count is zero or an even
2–32. Capability bit 51 is required.

MGFX opcode `39` (`DrawTiledImageSurface`) has the same fixed 64-byte layout as
`DrawImageSurface`. Its second `u32` is a flag word: bit 0 selects nearest
sampling, bit 1 repeats X, and bit 2 repeats Y; all other bits are zero. UV
coordinates may extend outside `[0, 1]` to encode tile count and phase. The
backend repeats only selected axes, retains the rounded mask, and requires at
least one repeat bit. Capability bit 56 is required.

MGFX opcode `40` (`DrawNineSliceImage`) has a fixed 96-byte payload: texture ID,
sampling, destination, UV rectangle, tint, four normalized source insets, four
logical destination insets, corner radius, and one reserved zero `f32`. The
backend preserves corners, stretches edges and center, and proportionally
collapses borders when the destination is too small. Capability bit 57 is required.

MGFX opcode `45` (`DrawFilteredImageSurface`) extends the rounded/tiled image
layout to a fixed 80-byte payload. After corner radius it carries saturation and
contrast in `[0, 2]`, brightness in `[-1, 1]`, hue rotation in radians within
`[-2π, 2π]`, then blur radius in `[0, 32]` source pixels. Sampling and repeat
flags retain their opcode-39 meanings. The backend samples the persistent texture
and evaluates all color treatment plus a bounded 3×3 Gaussian-style kernel per
fragment; filter animation therefore sends neither pixels nor client-generated geometry.

MGFX opcode `41` (`DrawStyledText`) has a 64-byte fixed header followed by UTF-8.
It carries the complete family/weight/style/decoration, placement, fill color,
tracking, font resource, anchor/baseline, then outline RGBA and an em-relative
stroke width in `(0, 4]`. The backend shapes and strokes glyph contours; capability
bit 58 is required.
