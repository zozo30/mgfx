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

```tsx
const [name, setName] = useState("");

<Column style={{ gap: 12 }}>
  <TextField value={name} onChange={setName} placeholder="YOUR NAME" />
  <Button label="CONTINUE" onPress={() => submit(name)} />
</Column>
```

`react-reconciler` is experimental, so React and reconciler versions are pinned
and all unstable host configuration is isolated in `src/renderer.ts`.
