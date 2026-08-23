# MGFX TypeScript client

This client implements MGIP and MGFX directly with Node.js `Buffer` and
`net.createConnection({ path })`. It has no native addon and contains no TCP
transport.

`src/ui.ts` is the language-side retained UI runtime. It provides keyed
components, constraint measurement, flex rows/columns, stacks, text, painting,
reverse-order hit testing, and state invalidation. The native server receives
only backend-neutral MGFX draw commands and window events.

`FramePacer` keeps one sequenced frame in flight. While it waits for the native
`FramePresented` acknowledgement, repeated invalidations replace one pending
frame instead of growing the Unix-socket and GPU queues.

Clickable elements receive hover and pressed transitions. Click activation uses
normal desktop semantics: press the element, then release inside it.

Tab and Shift-Tab move focus through clickable elements. Enter and Space press
and activate the focused element without exposing platform hardware key codes to
the TypeScript application.

Focusable elements can handle validated UTF-8 text separately from semantic key
events. The demo field supports a placeholder, Backspace by Unicode code point,
and a bounded client-owned value.

Set `clip: true` on a container style to clip its background, text, and children
to its bounds. Nested clips are intersected by the graphics backend.

`scrollView()` measures content independently from its viewport, applies a
clipped offset, and receives wheel/trackpad deltas only when it is the deepest
scroll container under the pointer.

`box()` styles accept `borderWidth` and `borderColor`. `circle()` accepts the
same border fields plus `background` for its fill, allowing filled dots, rings,
and filled circles with outlines. Shapes tessellate into ordinary MGFX triangle
commands and remain backend-neutral.

Set `cornerRadius` on any non-circle element for a rounded fill and rounded
border. The painter clamps excessive values and emits separate portable meshes
for the fill and border ring.

```sh
npm install
npm test
npm start
```

Start `MGFXServer.app` before `npm start`. Pass a custom Unix socket path as the
first argument when needed:

The server remains headless until this client sends its title, 960×640 content
size, minimum size, and window state. Stopping this process hides its window but
does not stop the server.

```sh
npm start -- /path/to/mgfx.sock
```
