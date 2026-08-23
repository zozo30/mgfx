# MGFX React client

This package is a custom React renderer for the MGFX retained layout runtime. It
uses React components, hooks, context, keyed reconciliation, and JSX without a
DOM or browser. Commits become MGFX layout nodes and backend-neutral binary
frames sent to the native server over its Unix socket.

React commits pass through the shared `FramePacer`: one frame is in flight and
additional commits coalesce to the newest snapshot until Metal reports
`FramePresented`.

The header dot grid uses the native MGIP animation clock rather than
`setInterval`; its pulse therefore exercises React state, layout, frame pacing,
the Unix socket, and the display loop together.

Interactive components also request semantic native cursors: buttons use a
pointing hand while hovered and `TextField` uses an I-beam. Cursor cleanup is
handled by the React hook when hover ownership changes.

The demo's Copy and Paste buttons use the native clipboard service. Reads carry
request sequences and resolve as promises when `ClipboardText` returns, while
the React component remains independent of AppKit.
Focused `TextField` components also consume the protocol's semantic Copy, Cut,
and Paste shortcuts; on macOS these arrive from Command-C/X/V.

```sh
npm install
npm test
npm start
```

Start `MGFXServer.app` before `npm start`.

To exercise a real image file, pass the socket followed by a PNG, JPEG, or SVG path:

```sh
npm start -- /tmp/mgfx-$(id -u).sock /absolute/path/to/image.png
```

The client validates and decodes the file to premultiplied RGBA8 once, uploads
it as a persistent texture, and subsequent frames reference only its resource
ID. Files are limited to 32 MiB and decoded dimensions to 4096×4096.
SVG uses a high-quality client-side vector raster fallback with gradients,
strokes, transforms, masks, paths, and system-font text. External image
references are rejected; embedded `data:` images remain supported.

The server has no startup window. This React tree creates and owns the visible
window through MGIP; stopping and restarting React hides and restores it without
restarting Metal or the Unix socket server.

On connection, the demo sets the real AppKit title to `MGFX React Native Window`
through the MGIP window-metadata message.

It also requests a 1100×700 logical content area with a 720×520 minimum, while
React continues to receive actual drawable-pixel resize events for layout.

Window metadata is declared in the React tree rather than sent imperatively:

```tsx
<Window title="MY MGFX APP" width={1100} height={700}
  minimumWidth={720} minimumHeight={520} mode="normal" resizable
  chrome="overlay" draggableHeight={82}>
  <App />
</Window>
```

`Window` uses a React layout effect and the renderer's native-window context to
lower metadata into MGIP control messages.

`mode` is `normal`, `maximized`, or `fullscreen`. Changing React state performs
an idempotent native transition. The demo footer includes a fullscreen toggle.

Overlay chrome extends MGFX drawing beneath the transparent native title bar.
The client draws its own header, while macOS retains its real window controls
and performs native dragging in the declared top strip.

Layout styles support `backgroundGradient` with horizontal, vertical, or
diagonal direction. Gradients on boxes, rounded boxes, and circles lower to
ordinary colored triangle meshes, so they are not tied to Metal. The demo's
animated wave strip shows React producing a changing graphics pattern from the
server's display clock.

Available JSX host elements are:

- `mgfx-box`
- `mgfx-row`
- `mgfx-column`
- `mgfx-stack`
- `mgfx-circle`
- `mgfx-text`
- `mgfx-scroll`

Host elements accept the existing MGFX `style` object plus pointer, focus,
keyboard, text-input, and scroll handlers. React event updates are synchronously
committed at the MGFX input boundary.

Most application code can use the typed components from `src/components.tsx`
instead of intrinsic host elements:

- `Box`, `Row`, `Column`, and `Stack`
- `Circle` and `Text`
- `Button` with built-in hover, press, focus, active, and disabled states
- controlled `TextField` with focus styling, UTF-8 input, Unicode Backspace, and
  maximum-length handling
- `Mesh` for explicit application-owned indexed geometry and `Path` for SVG
  path data lowered to persistent canonical server resources
- `Svg` for bounded multi-layer vector documents, including 2–8 stop linear and
  radial gradients with local gradient-definition inheritance

`src/navigation.tsx` provides an in-memory history `Router`, `useRouter()` with
push/replace/back operations, and a depth-aware `Dialog`. Dialogs use absolute
insets, explicit `zIndex`, translucent source-over dimming, and modal input
isolation; no AppKit child window is required.

The demo installs the ISC-licensed `lucide-static` icon pack and extracts SVG
path data from four sample icons. React sends only normalized path commands and
paint. The graphics server flattens curves, tessellates fills/strokes, caches
the geometry, and then feeds ordinary triangles to Metal; the TypeScript client
does not generate icon triangles or image textures.
Path paint can be a solid color or a source-space linear gradient. Gradient
endpoints and colors travel in each lightweight `DrawPath`, while geometry
remains cached by the server.
Fill and stroke gradients are independent, so an SVG primitive may combine a
gradient interior with a differently oriented gradient outline.
Multi-stop gradients stay native: the protocol carries ordered colors and the
graphics server splits cached triangles at stop boundaries for exact interpolation.
SVG `spreadMethod="repeat"` and `"reflect"` use the same server path, including
hard cycle seams without client-generated triangles.
Centered 2–8 stop SVG radial fills with `pad`, `repeat`, or `reflect` spread also
stay native. React sends the center, transformed elliptical basis, ordered stop
table, and spread mode; Metal wraps radial distance and interpolates the matching
interval per fragment. Offset `fx`/`fy` and nonzero `fr` use Metal's native
two-circle solver; the client normalizes focal radius against outer radius and
sends no gradient geometry. Radial `href`/`xlink:href` chains inherit geometry,
transforms, spread, and stops before lowering to that same command.
Radial definitions also work as SVG strokes. The server shades its cached stroke
tessellation directly; when fill and stroke use independent radial paints, React
emits two draws sharing the same persistent path resource.
Radial strokes also retain SVG dash arrays, signed dash offset, caps, joins, and
custom miter limits. The server performs dash splitting and stroke tessellation;
React sends the original path, paint, and style values only.
Same-document SVG `<use href="#...">` and `xlink:href` instances resolve local
primitive, group, and symbol definitions before path upload. Instance position,
paint, and transforms are preserved, while unsafe external or cyclic references
are rejected. Symbol instances honor numeric `width`/`height`, `viewBox`, aligned
`meet`, clipped `slice`, and `preserveAspectRatio="none"`. Axis-aligned slice clips
lower to balanced display-list clip commands around the persistent path draw.
Local `clip-path="url(#...)"` references support one numeric user-space `<rect>`;
group transforms and nested clip intersections remain native display-list state.
Internal `<style>` sheets lower a bounded CSS cascade for simple tag, class, ID,
and compound selectors. Paint, opacity, stroke/dash geometry, transforms,
visibility, gradient-stop styling, and local clip references remain native;
external at-rules and unsupported selectors or declarations fail explicitly.
Plain `<text>` elements use the native system-text command with SVG x/y baseline,
start/middle/end anchor, solid fill/opacity, portable family, weight, italic,
tracking, uniform transforms, entities, and rectangular clips. `<tspan>`, text
stroke/gradient, and rotated, skewed, or nonuniform text remain bounded fallbacks.
Direct React `Path` components also accept `conicGradient` and
`strokeConicGradient`. Two through eight angular stops, a source-space center,
and a radian rotation lower to one native path command; rotation animation does
not invalidate the persistent path geometry.
`texture` and `strokeTexture` bind an uploaded texture as vector paint. Their
source-space tile rectangle, UV crop, repeat flags, sampling mode, and tint lower
to one native path command; Metal samples only inside the server-tessellated
fill or stroke geometry.
`Path` accepts either `{ length, gap, offset }` or `{ values, offset }` dash
styles. Inline SVG maps sequences of up to 32 `stroke-dasharray` values and
signed `stroke-dashoffset` onto them;
the Metal server splits and tessellates the stroke rather than receiving segments
or triangles from React.
SVG and `Path` strokes support butt, round, and square caps plus bevel, round,
and miter joins. The server owns their geometry and applies a four-half-width
miter limit, falling back to bevel for overly sharp corners. `Path` accepts a
custom `miterLimit`, while inline SVG maps inherited `stroke-miterlimit` into
the same styled-path protocol command.

```tsx
const [name, setName] = useState("");

<Column style={{ gap: 12 }}>
  <TextField value={name} onChange={setName} placeholder="YOUR NAME" />
  <Button label="CONTINUE" onPress={() => submit(name)} />
</Column>
```

`react-reconciler` is experimental, so React and reconciler versions are pinned
and all unstable host configuration is isolated in `src/renderer.ts`.
